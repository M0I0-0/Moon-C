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
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .ai import OllamaClient, SmallTalk
from .alerts import AlertBoard, AlertNotFound
from .chat import ChatService
from .config import Settings, get_settings
from .crew import CrewRegistry
from .evaluator import MeasurementValueError, describe, evaluate
from .intent import KeywordRouter
from .manual import Manual
from .schemas import (
    AlertView,
    AssignRequest,
    ChatRequest,
    ChatResponse,
    DeleteDataResponse,
    ErrorResponse,
    ExportJSON,
    IdentifyRequest,
    IdentifyResponse,
    IndicatorName,
    IndicatorView,
    Language,
    ManualView,
    Measurement,
    MeasurementIn,
    MeasurementResult,
    ProtocolView,
    SessionResetRequest,
    SessionResetResponse,
    StatusResponse,
    SyncResult,
    SyncStatus,
)
from .sessions import SessionStore
from .storage import AlreadyAssigned, MeasurementNotFound, MeasurementStore, now_utc, to_utc
from .sync import EarthSync

log = logging.getLogger("moon_c")

DESCRIPTION = """
**Moon-C supports the crew on board so they can monitor their health and act in time,
without waiting for Earth. Moon-C does not diagnose.**

Priorities: 1) support and guide the crew member, 2) alert the crew and the on-board
medical officer, 3) send data to Earth in the background when a link is available
(never blocking).

* Runs fully offline. The local AI model (Ollama) is used for small talk only.
* Health and emergency answers come only from the manual (`shared/protocols.json`).
* Ranges are **EXAMPLE VALUES – must be validated by medical experts**.
* Only measurements are stored. Chat messages are never persisted or logged.
"""

TAGS = [
    {"name": "status", "description": "Backend, AI model and Earth link state."},
    {"name": "chat", "description": "Conversation with Moon-C (keyword router + manual; AI for small talk only)."},
    {"name": "crew", "description": "Simulated bracelet identification."},
    {"name": "manual", "description": "Health manual: indicators, ranges and protocols."},
    {"name": "measurements", "description": "Readings, compared with the manual's example ranges."},
    {"name": "alerts", "description": "On-board alerts for urgent readings."},
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
    sync: EarthSync
    tasks: list[asyncio.Task] = field(default_factory=list)

    @classmethod
    def build(cls, settings: Settings, ollama_transport: httpx.AsyncBaseTransport | None = None) -> Services:
        manual = Manual.load(settings.shared_dir / "protocols.json")
        router = KeywordRouter.load(settings.shared_dir / "keywords.json")
        crew = CrewRegistry.load(settings.shared_dir / "crew.json")
        store = MeasurementStore(settings.storage_path, settings.retention_days)
        store.load()
        sessions = SessionStore(max_turns=settings.session_max_turns, ttl_s=settings.session_ttl_s)
        ai_client = OllamaClient(settings, transport=ollama_transport)
        return cls(
            settings=settings,
            manual=manual,
            router=router,
            crew=crew,
            store=store,
            alerts=AlertBoard(manual),
            sessions=sessions,
            ai_client=ai_client,
            chat=ChatService(manual, router, crew, sessions, SmallTalk(ai_client)),
            sync=EarthSync(store, link=settings.earth_link),
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
        evaluation = evaluate(services.manual, body.indicator, body.value, body.unit)
    except MeasurementValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    measurement = Measurement(
        id=uuid.uuid4().hex,
        crew_id=crew.crew_id if crew else None,
        indicator=evaluation.indicator,
        value=evaluation.value,
        unit=evaluation.unit,
        status=evaluation.status,
        timestamp=to_utc(body.timestamp) if body.timestamp else now_utc(),
        synced=False,
    )
    services.store.add(measurement)
    alert = services.alerts.create(measurement, crew.name if crew else None) if evaluation.status == "urgent" else None

    lang = body.language or (crew.preferredLanguage if crew else None) or "en"
    needs_confirmation = crew is None
    return MeasurementResult(
        **measurement.model_dump(),
        needs_confirmation=needs_confirmation,
        language=lang,
        message=describe(services.manual, evaluation, lang, needs_confirmation),
        guidance=services.manual.what_to_do(evaluation.indicator, evaluation.status, lang),
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
@api.get("/alerts", response_model=list[AlertView], tags=["alerts"], summary="Active on-board alerts")
def list_alerts(
    services: ServicesDep,
    language: LanguageQuery = "en",
    include_acknowledged: bool = False,
) -> list[AlertView]:
    return [services.alerts.view(a, language) for a in services.alerts.list(include_acknowledged)]


@api.post(
    "/alerts/{alert_id}/ack", response_model=AlertView, responses=NOT_FOUND, tags=["alerts"], summary="Acknowledge"
)
def acknowledge_alert(alert_id: str, services: ServicesDep, language: LanguageQuery = "en") -> AlertView:
    try:
        alert = services.alerts.acknowledge(alert_id)
    except AlertNotFound as exc:
        raise HTTPException(status_code=404, detail="Alert not found.") from exc
    return services.alerts.view(alert, language)


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
    summary="Privacy wipe: delete all measurements",
    description="Deletes every stored measurement and clears alerts and chat contexts. Requires confirm=true.",
)
def delete_data(services: ServicesDep, confirm: bool = False) -> DeleteDataResponse:
    if not confirm:
        raise HTTPException(status_code=400, detail="Add ?confirm=true to delete all measurements.")
    deleted = services.store.wipe()
    log.info("Privacy wipe: %d measurements deleted.", deleted)
    return DeleteDataResponse(
        measurements_deleted=deleted,
        alerts_cleared=services.alerts.clear(),
        sessions_cleared=services.sessions.clear_all(),
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
    app.include_router(api)
    return app


app = create_app()
