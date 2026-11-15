"""Moon-C FastAPI app: routes, CORS and startup.

Run with:  uvicorn app.main:app --reload --port 8000
Interactive API docs: http://localhost:8000/docs

Moon-C supports the crew on board so they can monitor their health and act in
time, without waiting for Earth. Moon-C does not diagnose.
"""

from __future__ import annotations

import asyncio
import contextlib
import csv
import io
import logging
import random
import threading
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from . import __version__
from .ai import OllamaClient, SmallTalk
from .alerts import AlertBoard, AlertNotFound
from .bracelets import SimulatedBracelets, UnknownCrew, UnknownScenario
from .chat import ChatService
from .config import Settings, get_settings
from .crew import CrewRegistry
from .crewdata import CrewData, guidance_steps, record_reading
from .evaluator import MeasurementValueError, describe, evaluate
from .intent import KeywordRouter
from .manual import Manual
from .schemas import (
    AlertResolveRequest,
    AlertView,
    AssignRequest,
    ChatRequest,
    ChatResponse,
    CrewVitals,
    DeleteDataResponse,
    ErrorResponse,
    ExportJSON,
    IdentifyRequest,
    IdentifyResponse,
    IndicatorName,
    IndicatorView,
    SUPPORTED_LANGUAGES,
    Language,
    ManualView,
    Measurement,
    MeasurementIn,
    MeasurementResult,
    ProtocolView,
    Scenario,
    SessionResetRequest,
    SessionResetResponse,
    SpeechRequest,
    SimulationEmergencyRequest,
    SimulationResetRequest,
    StatusResponse,
    SyncResult,
    SyncStatus,
    AccessEntry,
    AccessLogIn,
    Announcement,
    AnnouncementIn,
    ManeuverReport,
    ManeuverReportIn,
    ManeuverStartRequest,
)
from .records import RecordStore
from .sessions import SessionStore
from .support import ProfileStore, SupportError, SupportGuide
from .storage import AlreadyAssigned, MeasurementNotFound, MeasurementStore, now_utc, to_utc
from .sync import EarthSync
from .voice import AI_AUDIO_NOTE, MoonCVoice, VoiceUnavailable

log = logging.getLogger("moon_c")

DESCRIPTION = """
**Moon-C supports the crew on board so they can monitor their health and act in time,
without waiting for Earth. Moon-C does not diagnose.**

Priorities: 1) support and guide the crew member, 2) alert the crew and the on-board
medical officer, 3) send data to Earth in the background when a link is available
(never blocking).

* Runs fully offline. The local AI model (Ollama) is used for small talk only.
* Health and emergency answers come only from the manual (`shared/protocols.json`).
* Ranges are **reference values from published guidelines and NASA standards
  (`shared/REFERENCES.md`) – must be validated by medical experts**.
* Only measurements are stored. Chat messages are never persisted or logged.
"""

TAGS = [
    {"name": "status", "description": "Backend, AI model and Earth link state."},
    {"name": "chat", "description": "Conversation with Moon-C (keyword router + manual; AI for small talk only)."},
    {"name": "crew", "description": "Simulated bracelet identification."},
    {"name": "manual", "description": "Health manual: indicators, ranges and protocols."},
    {"name": "measurements", "description": "Readings, compared with the manual's reference ranges."},
    {"name": "alerts", "description": "On-board alerts: urgent readings, emergencies reported in the chat, maneuvers."},
    {"name": "vitals", "description": "Live vital signs from the simulated bracelets."},
    {"name": "simulation", "description": "Demo controls: simulated emergencies."},
    {"name": "voice", "description": "Moon-C's own offline voice (Spanish)."},
    {"name": "maneuvers", "description": "Guided emergency maneuvers: alert on start, report for Earth."},
    {"name": "announcements", "description": "Messages from the General account to the crew."},
    {"name": "access", "description": "Who opened a crew member's data during an emergency."},
    {"name": "sync", "description": "Simulated Earth sync queue."},
    {"name": "data", "description": "Export and privacy wipe."},
]

NOT_FOUND = {404: {"model": ErrorResponse}}


@dataclass
class Services:
    settings: Settings
    manual: Manual
    router: KeywordRouter
    crew: CrewRegistry
    store: MeasurementStore
    alerts: AlertBoard
    sessions: SessionStore
    ai_client: OllamaClient
    chat: ChatService
    support: SupportGuide
    profiles: ProfileStore
    sync: EarthSync
    reports: RecordStore[ManeuverReport]
    access_log: RecordStore[AccessEntry]
    announcements: RecordStore[Announcement]
    voice: MoonCVoice
    tts_slots: threading.BoundedSemaphore
    bracelets: SimulatedBracelets | None = None
    tasks: list[asyncio.Task] = field(default_factory=list)

    @classmethod
    def build(cls, settings: Settings, ollama_transport: httpx.AsyncBaseTransport | None = None) -> Services:
        manual = Manual.load(settings.shared_dir / "protocols.json")
        router = KeywordRouter.load(settings.shared_dir / "keywords.json")
        crew = CrewRegistry.load(settings.shared_dir / "crew.json")
        support = SupportGuide.load(settings.shared_dir / "support.json")
        missing = router.support_moments - set(support.moments)
        if missing:
            raise SupportError(f"keywords.json has support moments without a reply in support.json: {sorted(missing)}")
        profiles = ProfileStore.load(settings.profiles_dir or settings.shared_dir / "profiles", crew)
        store = MeasurementStore(settings.storage_path, settings.retention_days)
        store.load()
        folder, days = settings.storage_path.parent, settings.retention_days
        reports = RecordStore(
            folder / "maneuver_reports.json", ManeuverReport, key="reports", time_field="created_at", retention_days=days
        )
        access_log = RecordStore(
            folder / "access_log.json", AccessEntry, key="access_log", time_field="at", retention_days=days
        )
        announcements = RecordStore(
            folder / "announcements.json", Announcement, key="announcements", time_field="at", retention_days=days
        )
        for record_store in (reports, access_log, announcements):
            record_store.load()
        alerts = AlertBoard(manual)
        sessions = SessionStore(max_turns=settings.session_max_turns, ttl_s=settings.session_ttl_s)
        ai_client = OllamaClient(settings, transport=ollama_transport)
        bracelets = (
            SimulatedBracelets(
                manual,
                crew,
                store,
                alerts,
                rng=random.Random(settings.sim_seed),
                snapshot_interval_s=settings.snapshot_interval_s,
            )
            if settings.simulation
            else None
        )
        return cls(
            settings=settings,
            manual=manual,
            router=router,
            crew=crew,
            store=store,
            alerts=alerts,
            sessions=sessions,
            ai_client=ai_client,
            chat=ChatService(
                manual,
                router,
                crew,
                sessions,
                SmallTalk(ai_client),
                alerts=alerts,
                support=support,
                profiles=profiles,
                crewdata=CrewData.from_file(
                    settings.shared_dir / "keywords.json",
                    manual,
                    crew,
                    store,
                    alerts,
                    support=support,
                    profiles=profiles,
                ),
            ),
            support=support,
            profiles=profiles,
            sync=EarthSync(store, link=settings.earth_link, reports=reports),
            reports=reports,
            access_log=access_log,
            announcements=announcements,
            voice=MoonCVoice(settings.voice_dir, enabled=settings.voice),
            tts_slots=threading.BoundedSemaphore(settings.tts_max_concurrent),
            bracelets=bracelets,
        )


def get_services(request: Request) -> Services:
    services = getattr(request.app.state, "services", None)
    if services is None:
        raise HTTPException(status_code=503, detail="Moon-C is starting up.")
    return services


ServicesDep = Annotated[Services, Depends(get_services)]
LanguageQuery = Annotated[Language, Query(description="Response language.")]

api = APIRouter()


# =========================================================================== status
@api.get("/status", response_model=StatusResponse, tags=["status"], summary="Backend, AI and Earth link state")
async def get_status(services: ServicesDep) -> StatusResponse:
    reachable, available = await services.ai_client.status()
    return StatusResponse(
        version=__version__,
        ollama_reachable=reachable,
        model=services.settings.ollama_model,
        model_available=available,
        earth_link=services.sync.link,
        voice=services.voice.state,
        languages=list(SUPPORTED_LANGUAGES),
        voice_languages=list(services.voice.languages) if services.voice.state == "ready" else [],
        manual_version=services.manual.version,
        time=now_utc(),
    )


# =========================================================================== chat
@api.post(
    "/chat",
    response_model=ChatResponse,
    tags=["chat"],
    summary="Talk to Moon-C",
    description=(
        "Routes the message by keywords: emergency → protocol, health → manual, ambiguous → clarifying "
        "question, small_talk → local AI (canned reply if unavailable), otherwise fallback. "
        "Messages are kept in memory only (max 10 turns, 10 min) and never stored or logged."
    ),
)
async def chat(body: ChatRequest, services: ServicesDep) -> ChatResponse:
    return await services.chat.handle(body)


@api.post("/session/reset", response_model=SessionResetResponse, tags=["chat"], summary="Forget a chat context")
async def reset_session(body: SessionResetRequest, services: ServicesDep) -> SessionResetResponse:
    services.sessions.reset(body.session_id)
    return SessionResetResponse(session_id=body.session_id, cleared=True)


# =========================================================================== crew
@api.post(
    "/identify",
    response_model=IdentifyResponse,
    responses=NOT_FOUND,
    tags=["crew"],
    summary="Identify a crew member by bracelet (simulated)",
    description="Returns the crew profile. If session_id is given, that session's chat context is cleared.",
)
async def identify(body: IdentifyRequest, services: ServicesDep) -> IdentifyResponse:
    member = services.crew.by_bracelet(body.bracelet_id)
    if member is None:
        raise HTTPException(status_code=404, detail="Unknown bracelet.")
    if body.session_id:
        services.sessions.start_for_crew(body.session_id, member.crew_id)
    return IdentifyResponse(**member.profile().model_dump(), session_cleared=body.session_id is not None)


# =========================================================================== manual
@api.get("/manual", response_model=ManualView, tags=["manual"], summary="Full health manual")
def get_manual(services: ServicesDep, language: LanguageQuery = "en") -> ManualView:
    return services.manual.manual_view(language)


@api.get(
    "/manual/{indicator}", response_model=IndicatorView, responses=NOT_FOUND, tags=["manual"], summary="One indicator"
)
def get_indicator(indicator: str, services: ServicesDep, language: LanguageQuery = "en") -> IndicatorView:
    if not services.manual.has_indicator(indicator):
        raise HTTPException(status_code=404, detail=f"Unknown indicator '{indicator}'.")
    return services.manual.indicator_view(indicator, language)


@api.get(
    "/protocols/{name}", response_model=ProtocolView, responses=NOT_FOUND, tags=["manual"], summary="One protocol"
)
def get_protocol(name: str, services: ServicesDep, language: LanguageQuery = "en") -> ProtocolView:
    if not services.manual.has_protocol(name):
        raise HTTPException(status_code=404, detail=f"Unknown protocol '{name}'.")
    return services.manual.protocol_view(name, language)


# =========================================================================== measurements
def _guidance(services: Services, indicator: str, status: str, lang: str, crew) -> list[str]:
    """Manual steps for a reading; a low mood also gets the lines of the crew member's support profile."""
    return guidance_steps(services.manual, services.support, services.profiles, indicator, status, lang, crew)


@api.post(
    "/measurements",
    status_code=201,
    response_model=MeasurementResult,
    responses={**NOT_FOUND, 422: {"model": ErrorResponse}},
    tags=["measurements"],
    summary="Register a reading",
    description=(
        "Compares the value with the manual. Urgent readings create an on-board alert. "
        "Without crew_id the reading is stored as unassigned and `needs_confirmation` is true."
    ),
)
def create_measurement(body: MeasurementIn, services: ServicesDep) -> MeasurementResult:
    crew = None
    if body.crew_id is not None:
        crew = services.crew.get(body.crew_id)
        if crew is None:
            raise HTTPException(status_code=404, detail=f"Unknown crew_id '{body.crew_id}'.")
    try:
        recorded = record_reading(
            services.manual, services.store, services.alerts, crew, body.indicator, body.value, body.unit, body.timestamp
        )
    except MeasurementValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    measurement, evaluation, alert = recorded.measurement, recorded.evaluation, recorded.alert

    lang = body.language or (crew.preferredLanguage if crew else None) or "en"
    needs_confirmation = crew is None
    return MeasurementResult(
        **measurement.model_dump(),
        needs_confirmation=needs_confirmation,
        language=lang,
        message=describe(services.manual, evaluation, lang, needs_confirmation),
        guidance=_guidance(services, evaluation.indicator, evaluation.status, lang, crew),
        alert=services.alerts.view(alert, lang) if alert else None,
        source=services.manual.indicator_source(evaluation.indicator),
    )


@api.get("/measurements", response_model=list[Measurement], tags=["measurements"], summary="List readings")
def list_measurements(
    services: ServicesDep,
    crew_id: str | None = None,
    indicator: IndicatorName | None = None,
    since: Annotated[datetime | None, Query(description="ISO 8601; naive times are UTC.")] = None,
    unassigned: Annotated[bool | None, Query(description="true = only unassigned readings.")] = None,
) -> list[Measurement]:
    return services.store.list(crew_id=crew_id, indicator=indicator, since=since, unassigned=unassigned)


@api.post(
    "/measurements/{measurement_id}/assign",
    response_model=Measurement,
    responses={**NOT_FOUND, 409: {"model": ErrorResponse}},
    tags=["measurements"],
    summary="Confirm who an unassigned reading belongs to",
)
def assign_measurement(measurement_id: str, body: AssignRequest, services: ServicesDep) -> Measurement:
    crew = services.crew.get(body.crew_id)
    if crew is None:
        raise HTTPException(status_code=404, detail=f"Unknown crew_id '{body.crew_id}'.")
    try:
        measurement = services.store.assign(measurement_id, crew.crew_id)
    except MeasurementNotFound as exc:
        raise HTTPException(status_code=404, detail="Measurement not found.") from exc
    except AlreadyAssigned as exc:
        raise HTTPException(status_code=409, detail="Measurement is already assigned.") from exc
    services.alerts.reassign(measurement_id, crew.crew_id, crew.name)
    return measurement


# =========================================================================== alerts
@api.get(
    "/alerts",
    response_model=list[AlertView],
    tags=["alerts"],
    summary="On-board alerts",
    description="By default only open alerts nobody has acknowledged yet. Newest first.",
)
def list_alerts(
    services: ServicesDep,
    language: LanguageQuery = "en",
    include_acknowledged: bool = False,
    include_resolved: bool = False,
) -> list[AlertView]:
    alerts = services.alerts.list(include_acknowledged=include_acknowledged, include_resolved=include_resolved)
    return [services.alerts.view(a, language) for a in alerts]


@api.post(
    "/alerts/{alert_id}/ack", response_model=AlertView, responses=NOT_FOUND, tags=["alerts"], summary="Acknowledge"
)
def acknowledge_alert(alert_id: str, services: ServicesDep, language: LanguageQuery = "en") -> AlertView:
    try:
        alert = services.alerts.acknowledge(alert_id)
    except AlertNotFound as exc:
        raise HTTPException(status_code=404, detail="Alert not found.") from exc
    return services.alerts.view(alert, language)


@api.post(
    "/alerts/{alert_id}/resolve", response_model=AlertView, responses=NOT_FOUND, tags=["alerts"], summary="Resolve"
)
def resolve_alert(alert_id: str, services: ServicesDep, language: LanguageQuery = "en") -> AlertView:
    try:
        alert = services.alerts.resolve(alert_id)
    except AlertNotFound as exc:
        raise HTTPException(status_code=404, detail="Alert not found.") from exc
    return services.alerts.view(alert, language)


@api.post(
    "/alerts/resolve",
    response_model=list[AlertView],
    tags=["alerts"],
    summary="Resolve every open alert of a crew member",
    description="Omit crew_id to resolve every open alert. Returns the alerts that were closed.",
)
def resolve_crew_alerts(
    body: AlertResolveRequest, services: ServicesDep, language: LanguageQuery = "en"
) -> list[AlertView]:
    return [services.alerts.view(a, language) for a in services.alerts.resolve_crew(body.crew_id)]


# =========================================================================== vitals and simulation
def _bracelets(services: Services) -> SimulatedBracelets:
    if services.bracelets is None:
        raise HTTPException(status_code=409, detail="The bracelet simulation is disabled (MOON_C_SIMULATION=false).")
    return services.bracelets


@api.get(
    "/vitals",
    response_model=list[CrewVitals],
    tags=["vitals"],
    summary="Live vital signs of every crew member",
    description="Current value, status and recent history of each indicator. Empty when the simulation is off.",
)
def list_vitals(services: ServicesDep) -> list[CrewVitals]:
    return services.bracelets.vitals() if services.bracelets else []


@api.get("/vitals/{crew_id}", response_model=CrewVitals, responses=NOT_FOUND, tags=["vitals"], summary="One crew member")
def crew_vitals(crew_id: str, services: ServicesDep) -> CrewVitals:
    try:
        return _bracelets(services).vitals_for(crew_id)
    except UnknownCrew as exc:
        raise HTTPException(status_code=404, detail=f"Unknown crew_id '{crew_id}'.") from exc


@api.get("/simulation/scenarios", response_model=list[Scenario], tags=["simulation"], summary="Simulated emergencies")
def list_scenarios(services: ServicesDep, language: LanguageQuery = "en") -> list[Scenario]:
    return _bracelets(services).scenarios(language)


@api.post(
    "/simulation/emergency",
    response_model=CrewVitals,
    responses={**NOT_FOUND, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
    tags=["simulation"],
    summary="Start a simulated emergency (demo)",
    description="The crew member's signs drift toward the scenario values over the next readings.",
)
def start_simulated_emergency(body: SimulationEmergencyRequest, services: ServicesDep) -> CrewVitals:
    bracelets = _bracelets(services)
    try:
        bracelets.start_scenario(body.crew_id, body.scenario)
    except UnknownCrew as exc:
        raise HTTPException(status_code=404, detail=f"Unknown crew_id '{body.crew_id}'.") from exc
    except UnknownScenario as exc:
        raise HTTPException(status_code=422, detail=f"Unknown scenario '{body.scenario}'.") from exc
    return bracelets.vitals_for(body.crew_id)


@api.post(
    "/simulation/reset",
    response_model=list[CrewVitals],
    responses=NOT_FOUND,
    tags=["simulation"],
    summary="End simulated emergencies",
    description="Signs drift back to each crew member's baseline. Omit crew_id to reset everyone.",
)
def reset_simulation(body: SimulationResetRequest, services: ServicesDep) -> list[CrewVitals]:
    bracelets = _bracelets(services)
    try:
        bracelets.reset(body.crew_id)
    except UnknownCrew as exc:
        raise HTTPException(status_code=404, detail=f"Unknown crew_id '{body.crew_id}'.") from exc
    return bracelets.vitals()


# =========================================================================== voice
@api.post(
    "/tts",
    response_class=Response,
    responses={
        200: {"content": {"audio/wav": {}}, "description": "WAV, mono, 22 050 Hz. AI-synthesized speech."},
        422: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
    tags=["voice"],
    summary="Moon-C's voice: text to speech, offline",
    description=(
        "Spanish only for now. Returns 503 while the voice loads or if it is not installed; then use a local "
        "browser voice. Units are read in full (bpm -> latidos por minuto). The text is never stored or logged. "
        "The audio is AI-synthesized (Piper neural text-to-speech): the WAV says so in its metadata "
        "(LIST/INFO comment) and the response in the X-AI-Generated header."
    ),
)
def text_to_speech(body: SpeechRequest, services: ServicesDep) -> Response:
    voice = services.voice
    # Each synthesis holds a worker thread for 0.2-0.5 s (more for long text): cap them so /tts cannot starve
    # the rest of the API. Non-blocking acquire: if all slots are busy, answer 429 at once and let the UI retry.
    if not services.tts_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=429, detail="Moon-C's voice is busy. Try again in a moment.", headers={"Retry-After": "1"}
        )
    try:
        return _synthesize(body, voice)
    finally:
        services.tts_slots.release()


def _synthesize(body: SpeechRequest, voice: MoonCVoice) -> Response:
    if body.language not in voice.languages:
        raise HTTPException(status_code=422, detail="Moon-C's voice only speaks Spanish for now.")
    try:
        audio = voice.wav(body.text)
    except VoiceUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Moon-C's voice is {voice.state}. {voice.detail}".strip()) from exc
    return Response(
        content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store", "X-AI-Generated": AI_AUDIO_NOTE}
    )


# =========================================================================== maneuvers
@api.post(
    "/maneuvers/start",
    response_model=AlertView,
    tags=["maneuvers"],
    summary="A guided maneuver was opened: alert the crew and the medical officer",
    description="Reuses the open alert if the same guide is reopened. An unknown crew_id never blocks the alert.",
)
def start_maneuver(body: ManeuverStartRequest, services: ServicesDep, language: LanguageQuery = "en") -> AlertView:
    member = services.crew.get(body.crew_id)
    alert = services.alerts.maneuver(member.crew_id if member else None, member.name if member else None, body.maneuver)
    return services.alerts.view(alert, language)


@api.post(
    "/maneuvers/reports",
    status_code=201,
    response_model=ManeuverReport,
    tags=["maneuvers"],
    summary="Store a maneuver summary for Earth",
    description="Stored on board and queued for Earth: it is marked as synced on the next contact window.",
)
def create_maneuver_report(body: ManeuverReportIn, services: ServicesDep) -> ManeuverReport:
    member = services.crew.get(body.crew_id)
    report = ManeuverReport(
        **body.model_dump(exclude={"crew_id"}),
        crew_id=member.crew_id if member else None,
        id=uuid.uuid4().hex,
        created_at=now_utc(),
        synced=False,
    )
    return services.reports.add(report)


@api.get("/maneuvers/reports", response_model=list[ManeuverReport], tags=["maneuvers"], summary="Maneuver reports")
def list_maneuver_reports(services: ServicesDep, crew_id: str | None = None) -> list[ManeuverReport]:
    return services.reports.list(lambda r: crew_id is None or r.crew_id == crew_id)


# =========================================================================== announcements and access log
@api.get("/announcements", response_model=list[Announcement], tags=["announcements"], summary="Announcements")
def list_announcements(services: ServicesDep) -> list[Announcement]:
    return services.announcements.list()


@api.post(
    "/announcements", status_code=201, response_model=Announcement, tags=["announcements"], summary="Post an announcement"
)
def create_announcement(body: AnnouncementIn, services: ServicesDep) -> Announcement:
    return services.announcements.add(Announcement(**body.model_dump(), id=uuid.uuid4().hex, at=now_utc()))


@api.post(
    "/access-log",
    status_code=201,
    response_model=AccessEntry,
    responses=NOT_FOUND,
    tags=["access"],
    summary="Record that a crew member's data was opened",
)
def record_access(body: AccessLogIn, services: ServicesDep) -> AccessEntry:
    if services.crew.get(body.crew_id) is None:
        raise HTTPException(status_code=404, detail=f"Unknown crew_id '{body.crew_id}'.")
    return services.access_log.add(AccessEntry(**body.model_dump(), id=uuid.uuid4().hex, at=now_utc()))


@api.get("/access-log", response_model=list[AccessEntry], tags=["access"], summary="Access history, newest first")
def list_access(services: ServicesDep, crew_id: str | None = None) -> list[AccessEntry]:
    return services.access_log.list(lambda e: crew_id is None or e.crew_id == crew_id)


# =========================================================================== sync
@api.post(
    "/sync/simulate",
    response_model=SyncResult,
    tags=["sync"],
    summary="Simulate a contact window with Earth",
    description="Marks every pending (assigned) measurement as synced. Unassigned readings wait for confirmation.",
)
def simulate_sync(services: ServicesDep) -> SyncResult:
    return services.sync.flush()


@api.get("/sync/status", response_model=SyncStatus, tags=["sync"], summary="Pending count and last sync time")
def sync_status(services: ServicesDep) -> SyncStatus:
    return services.sync.status()


# =========================================================================== export and privacy
CSV_FIELDS = ["id", "crew_id", "indicator", "value", "unit", "status", "timestamp", "synced"]


@api.get("/export.json", response_model=ExportJSON, tags=["data"], summary="Download measurements as JSON")
def export_json(services: ServicesDep, crew_id: str | None = None) -> JSONResponse:
    measurements = services.store.list(crew_id=crew_id)
    export = ExportJSON(
        exported_at=now_utc(),
        manual_version=services.manual.version,
        ranges_warning=services.manual.ranges_warning,
        count=len(measurements),
        measurements=measurements,
    )
    return JSONResponse(
        content=export.model_dump(mode="json"),
        headers={"Content-Disposition": 'attachment; filename="moon-c-measurements.json"'},
    )


@api.get(
    "/export.csv",
    tags=["data"],
    summary="Download measurements as CSV",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "UTF-8 CSV (with BOM so spreadsheets show °C)."}},
)
def export_csv(services: ServicesDep, crew_id: str | None = None) -> Response:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    for m in services.store.list(crew_id=crew_id):
        row = m.model_dump(mode="json")
        row["crew_id"] = row["crew_id"] or ""
        row["synced"] = "true" if m.synced else "false"
        writer.writerow(row)
    return Response(
        content="﻿" + buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="moon-c-measurements.csv"'},
    )


@api.delete(
    "/data",
    response_model=DeleteDataResponse,
    responses={400: {"model": ErrorResponse}},
    tags=["data"],
    summary="Privacy wipe: delete all crew health data",
    description=(
        "Deletes every stored measurement, maneuver report and access-log entry, and clears alerts and chat "
        "contexts. Announcements are kept. Requires confirm=true."
    ),
)
def delete_data(services: ServicesDep, confirm: bool = False) -> DeleteDataResponse:
    if not confirm:
        raise HTTPException(status_code=400, detail="Add ?confirm=true to delete all measurements.")
    deleted = services.store.wipe()
    reports = services.reports.wipe()
    access = services.access_log.wipe()
    log.info("Privacy wipe: %d measurements, %d reports, %d access entries deleted.", deleted, reports, access)
    return DeleteDataResponse(
        measurements_deleted=deleted,
        alerts_cleared=services.alerts.clear(),
        sessions_cleared=services.sessions.clear_all(),
        reports_deleted=reports,
        access_log_deleted=access,
    )


# =========================================================================== app
def _configure_logging() -> None:
    """Show Moon-C's own INFO lines under Uvicorn (which configures only its own loggers).

    Moon-C logs counts, states and error types only, never message content.
    """
    logger = logging.getLogger("moon_c")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(levelname)s:     %(name)s - %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)


async def _sweep_sessions(services: Services) -> None:
    """Drop expired chat contexts from memory, even if nobody writes to them again."""
    while True:
        await asyncio.sleep(services.settings.session_sweep_interval_s)
        services.sessions.purge_expired()


async def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 with only ``type``, ``loc`` and ``msg`` of each error.

    FastAPI's default also echoes ``input`` (the rejected value) and ``ctx``. We drop both, for every endpoint:
    - privacy: an invalid /chat message is up to 2000 characters of health talk and must not come back in the
      response (or end up in a client's error logs);
    - robustness: ``input`` can be NaN/Infinity (valid for Python's JSON parser, not for JSON), and serializing
      it made the default handler crash with a 500.
    The ``detail`` list shape is unchanged, so clients keep working.
    """
    errors = [{"type": e.get("type"), "loc": list(e.get("loc", ())), "msg": e.get("msg")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


def create_app(
    settings: Settings | None = None, *, ollama_transport: httpx.AsyncBaseTransport | None = None
) -> FastAPI:
    """Build the app. Tests pass their own settings and a mock Ollama transport."""
    settings = settings or get_settings()
    _configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        services = Services.build(settings, ollama_transport)  # loads and validates the manual
        app.state.services = services
        if settings.ollama_warmup:  # never blocks startup
            services.tasks.append(asyncio.create_task(services.ai_client.warm_up()))
        services.tasks.append(asyncio.create_task(_sweep_sessions(services)))
        services.tasks.append(asyncio.create_task(services.sync.run(settings.sync_interval_s)))
        if services.voice.state == "loading":  # loads the voice model (~3 s) without delaying startup
            services.tasks.append(asyncio.create_task(asyncio.to_thread(services.voice.load)))
        if services.bracelets is not None:
            services.tasks.append(asyncio.create_task(services.bracelets.run(settings.sim_tick_s)))
        log.info("Moon-C %s ready (manual %s, model %s).", __version__, services.manual.version, settings.ollama_model)
        try:
            yield
        finally:
            for task in services.tasks:
                task.cancel()
            for task in services.tasks:
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task
            await services.ai_client.aclose()
            app.state.services = None

    app = FastAPI(
        title="Moon-C API",
        version=__version__,
        description=DESCRIPTION,
        openapi_tags=TAGS,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.include_router(api)
    return app


app = create_app()
