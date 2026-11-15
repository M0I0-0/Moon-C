"""Pydantic models for every request and response.

These models define the API contract shown on the interactive ``/docs`` page.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Language = Literal["en", "es"]
IndicatorName = Literal[
    "heart_rate",
    "body_temperature",
    "spo2",
    "sleep_hours",
    "mood",
    "blood_pressure_systolic",
    "blood_pressure_diastolic",
    "respiratory_rate",
    "radiation",
]
Status = Literal["normal", "attention", "urgent"]
Category = Literal["emergency", "health", "support", "ambiguous", "small_talk", "fallback"]
SupportMoment = Literal["stress", "frustration", "mistake", "conflict", "homesick", "lonely", "low_mood"]
EarthLink = Literal["offline", "online"]
ProtocolType = Literal["emergency", "guidance"]
AlertKind = Literal["vital", "report", "maneuver"]

INDICATORS: tuple[str, ...] = (
    "heart_rate",
    "body_temperature",
    "spo2",
    "sleep_hours",
    "mood",
    "blood_pressure_systolic",
    "blood_pressure_diastolic",
    "respiratory_rate",
    "radiation",
)
LANGUAGES: tuple[str, ...] = ("en", "es")

SESSION_ID = Field(min_length=1, max_length=128, examples=["tablet-galley-1"])


class ErrorResponse(BaseModel):
    detail: str = Field(examples=["Unknown crew_id 'zeus'."])


# --------------------------------------------------------------------------- status
class StatusResponse(BaseModel):
    backend: Literal["ok"] = "ok"
    version: str
    ollama_reachable: bool = Field(description="Ollama answered on its API.")
    model: str = Field(description="Ollama model used for small talk.")
    model_available: bool = Field(description="The model is pulled in Ollama.")
    earth_link: EarthLink = Field(description="Simulated link with Earth.")
    voice: Literal["disabled", "loading", "ready", "unavailable"] = Field(
        "disabled", description="Moon-C's own voice (POST /tts). If not ready, use a local browser voice."
    )
    voice_languages: list[Language] = Field(default_factory=list, description="Languages Moon-C's voice speaks.")
    manual_version: str
    time: datetime


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1000, examples=["Hola, soy Moon-C."])
    language: Language = "es"


# --------------------------------------------------------------------------- manual
class Band(BaseModel):
    """One range band. ``min``/``max`` are inclusive; ``lt``/``lte``/``gt``/``gte`` are open bounds."""

    min: float | None = None
    max: float | None = None
    lt: float | None = None
    lte: float | None = None
    gt: float | None = None
    gte: float | None = None


class RangeBands(BaseModel):
    normal: list[Band]
    attention: list[Band]
    urgent: list[Band]


class RangeView(BaseModel):
    normal: str = Field(examples=["50–100 bpm"])
    attention: str = Field(examples=["41–49 or 101–130 bpm"])
    urgent: str = Field(examples=["≤ 40 or ≥ 131 bpm"])
    warning: str = Field(description="Reference values from published guidelines – must be validated by medical experts")
    bands: RangeBands


class WhatToDo(BaseModel):
    normal: list[str]
    attention: list[str]
    urgent: list[str]


class IndicatorView(BaseModel):
    indicator: IndicatorName
    language: Language
    name: str
    unit: str
    explanation: str
    why_it_matters_in_space: str
    how_to_measure: list[str]
    ranges: RangeView
    what_to_do: WhatToDo
    urgent_protocol: str | None = Field(None, description="Protocol to show when this indicator is urgent.")
    source: str
    version: str
    last_reviewed: str


class ProtocolView(BaseModel):
    name: str = Field(examples=["chest_pain"])
    type: ProtocolType
    language: Language
    title: str
    intro: str | None = Field(None, description="Opening line said before the steps (replaces the generic one).")
    audience: str
    steps: list[str]
    source: str
    version: str
    last_reviewed: str


class ProtocolSummary(BaseModel):
    name: str
    type: ProtocolType
    title: str


class ManualView(BaseModel):
    language: Language
    title: str
    version: str
    last_reviewed: str
    review_status: str
    source: str
    mission: str
    disclaimer: str
    ranges_warning: str
    gap_policy: str
    indicators: list[IndicatorView]
    protocols: list[ProtocolSummary]


# --------------------------------------------------------------------------- crew
class CrewProfile(BaseModel):
    crew_id: str = Field(examples=["moises"])
    name: str = Field(examples=["Moisés"])
    preferredLanguage: Language
    role: str | None = Field(None, examples=["flight_engineer"])


class IdentifyRequest(BaseModel):
    bracelet_id: str = Field(min_length=1, max_length=64, examples=["BR-001"])
    session_id: str | None = Field(
        None,
        min_length=1,
        max_length=128,
        description="If given, the chat context of this session is cleared and bound to the crew member.",
    )


class IdentifyResponse(CrewProfile):
    session_cleared: bool


# --------------------------------------------------------------------------- chat
class ChatRequest(BaseModel):
    session_id: str = SESSION_ID
    crew_id: str | None = Field(None, max_length=64, examples=["moises"])
    # Stripped before validating: a message of only spaces is empty (422).
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)] = Field(
        examples=["Good morning, Moon-C"]
    )
    language: Language | None = Field(
        None, description="Reply language. Falls back to the crew member's preferredLanguage, then English."
    )


class ChatResponse(BaseModel):
    category: Category
    reply: str
    language: Language
    ai_used: bool = Field(description="True only if the reply text was generated by the local AI model.")
    protocol: ProtocolView | None = Field(None, description="Emergency protocol or guidance from the manual.")
    indicator: IndicatorName | None = Field(None, description="Indicator the reply is about.")
    moment: SupportMoment | None = Field(None, description="Key mental-health moment (category support).")
    personalized: bool = Field(
        False, description="True if the reply used the crew member's private support profile."
    )
    source: str | None = Field(None, description="Manual source for health and emergency replies.")
    suggestions: list[str] = Field(default_factory=list, description="Optional quick replies for the UI.")


class SessionResetRequest(BaseModel):
    session_id: str = SESSION_ID


class SessionResetResponse(BaseModel):
    session_id: str
    cleared: bool


# --------------------------------------------------------------------------- measurements
class MeasurementIn(BaseModel):
    crew_id: str | None = Field(
        None, max_length=64, examples=["moises"], description="Omit to store as unassigned (needs confirmation)."
    )
    indicator: IndicatorName
    value: float = Field(allow_inf_nan=False, examples=[38.2])
    unit: str = Field(min_length=1, max_length=32, examples=["°C"])
    timestamp: datetime | None = Field(None, description="ISO 8601. Defaults to now (UTC). Naive times are UTC.")
    language: Language | None = None


class Measurement(BaseModel):
    id: str
    crew_id: str | None = Field(description="null = unassigned")
    indicator: IndicatorName
    value: float
    unit: str
    status: Status
    timestamp: datetime
    synced: bool


class AlertView(BaseModel):
    id: str
    kind: AlertKind = Field(
        "vital",
        description="vital = urgent reading; report = emergency detected in the chat; maneuver = guided maneuver started.",
    )
    measurement_id: str | None = Field(None, description="Set for vital alerts.")
    crew_id: str | None
    crew_name: str | None
    indicator: IndicatorName | None = Field(None, description="Set for vital alerts.")
    value: float | None = None
    unit: str | None = None
    protocol: str | None = Field(None, description="Report alerts: protocol name. Maneuver alerts: maneuver id.")
    status: Literal["urgent"] = "urgent"
    message: str = Field(examples=["Alert: Moisés, body temperature 38.2 °C"])
    created_at: datetime
    acknowledged: bool
    acknowledged_at: datetime | None
    resolved: bool = False
    resolved_at: datetime | None = None


class AlertResolveRequest(BaseModel):
    crew_id: str | None = Field(None, description="Resolve every open alert of this crew member. Omit for all.")


# --------------------------------------------------------------------------- live vitals (simulated bracelets)
class LiveIndicator(BaseModel):
    value: float
    unit: str
    status: Status
    history: list[float] = Field(description="Oldest first. Live signs: last readings. Sleep and mood: last days.")


class CrewVitals(BaseModel):
    crew_id: str
    name: str
    updated_at: datetime
    scenario: str | None = Field(None, description="Simulated emergency in progress, if any.")
    overall_status: Status
    indicators: dict[str, LiveIndicator]


class Scenario(BaseModel):
    id: str = Field(examples=["low_oxygen"])
    label: str


class SimulationEmergencyRequest(BaseModel):
    crew_id: str = Field(min_length=1, max_length=64, examples=["moises"])
    scenario: str = Field(min_length=1, max_length=64, examples=["high_temperature"])


class SimulationResetRequest(BaseModel):
    crew_id: str | None = Field(None, description="Omit to end every simulated emergency.")


class MeasurementResult(Measurement):
    needs_confirmation: bool = Field(description="True when crew_id is missing: ask who the reading belongs to.")
    language: Language
    message: str
    guidance: list[str] = Field(description="What to do, from the manual, for this status.")
    alert: AlertView | None = None
    source: str


class AssignRequest(BaseModel):
    crew_id: str = Field(min_length=1, max_length=64, examples=["moises"])


# --------------------------------------------------------------------------- sync, export, data
class SyncStatus(BaseModel):
    earth_link: EarthLink
    pending: int = Field(description="Assigned measurements waiting to be sent to Earth.")
    awaiting_assignment: int = Field(description="Unassigned measurements: not sent until confirmed.")
    pending_reports: int = Field(0, description="Maneuver reports waiting to be sent to Earth.")
    last_sync: datetime | None


class SyncResult(SyncStatus):
    synced_count: int
    synced_reports: int = 0


class ExportJSON(BaseModel):
    exported_at: datetime
    manual_version: str
    ranges_warning: str
    count: int
    measurements: list[Measurement]


class DeleteDataResponse(BaseModel):
    measurements_deleted: int
    alerts_cleared: int
    sessions_cleared: int
    reports_deleted: int = 0
    access_log_deleted: int = 0


# --------------------------------------------------------------------------- maneuvers
MANEUVER_ID = Field(pattern=r"^[a-z_]{1,40}$", examples=["rcp"], description="Guided maneuver id from the 3D app.")


class ManeuverStartRequest(BaseModel):
    crew_id: str | None = Field(None, max_length=64, description="Account that opened the guide (may be the helper).")
    maneuver: str = MANEUVER_ID


class ManeuverEvent(BaseModel):
    at: datetime
    elapsed_s: int = Field(ge=0, le=7 * 86400)
    event: str = Field(max_length=200, examples=["Torniquete colocado TQ 14:32"])


class ManeuverSummary(BaseModel):
    """Summary prepared by the guide ("Resumen para Tierra"). Generated by the app, never chat text."""

    title: str = Field(max_length=200, examples=["RCP (paro cardiaco)"])
    environment: str = Field(max_length=100, examples=["Base lunar"])
    comm_delay: str | None = Field(None, max_length=100)
    evacuation: str | None = Field(None, max_length=100)
    started_at: datetime | None = None
    duration_s: int = Field(0, ge=0, le=7 * 86400)
    compressions: int | None = Field(None, ge=0)
    cycles: int | None = Field(None, ge=0)
    tourniquet_time: str | None = Field(None, max_length=40)
    events: list[ManeuverEvent] = Field(default_factory=list, max_length=500)


class ManeuverReportIn(BaseModel):
    crew_id: str | None = Field(None, max_length=64, description="Account that ran the guide.")
    maneuver: str = MANEUVER_ID
    summary: ManeuverSummary


class ManeuverReport(ManeuverReportIn):
    id: str
    created_at: datetime
    synced: bool = Field(description="Sent to Earth (simulated).")


# --------------------------------------------------------------------------- announcements and access log
class AnnouncementIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    priority: Literal["normal", "important"] = "normal"
    author: str = Field("General", min_length=1, max_length=80)


class Announcement(AnnouncementIn):
    id: str
    at: datetime


class AccessLogIn(BaseModel):
    crew_id: str = Field(min_length=1, max_length=64, description="Crew member whose data was opened.")
    viewer: str = Field("general", min_length=1, max_length=64, description="Account that opened it.")
    reason: str | None = Field(None, max_length=64, description="Alert id that justified the access.")


class AccessEntry(AccessLogIn):
    id: str
    at: datetime
