"""Pydantic models for every request and response.

These models define the API contract shown on the interactive ``/docs`` page.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

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
Category = Literal["emergency", "health", "ambiguous", "small_talk", "fallback"]
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
    manual_version: str
    time: datetime


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
    normal: str = Field(examples=["60–100 bpm"])
    attention: str = Field(examples=["50–59 or 101–120 bpm"])
    urgent: str = Field(examples=["< 50 or > 120 bpm"])
    warning: str = Field(description="EXAMPLE VALUES – must be validated by medical experts")
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
    message: str = Field(min_length=1, max_length=2000, examples=["Good morning, Moon-C"])
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
    last_sync: datetime | None


class SyncResult(SyncStatus):
    synced_count: int


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
