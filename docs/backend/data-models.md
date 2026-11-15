# Data models (`schemas.py`)

Source: [`Backend/app/schemas.py`](../../Backend/app/schemas.py). These Pydantic v2 models are the API contract shown at `/docs`. Internal dataclasses (`Alert`, `Turn`, `Session`, `Pending`, `IndicatorSpec`, `CrewMember`…) are documented with their modules.

## Shared literal types

| Name | Values |
|---|---|
| `Language` | `en`, `es` |
| `IndicatorName` | `heart_rate`, `body_temperature`, `spo2`, `sleep_hours`, `mood`, `blood_pressure_systolic`, `blood_pressure_diastolic`, `respiratory_rate`, `radiation` |
| `Status` | `normal`, `attention`, `urgent` |
| `Category` | `emergency`, `health`, `support`, `ambiguous`, `small_talk`, `fallback` |
| `SupportMoment` | `stress`, `frustration`, `mistake`, `conflict`, `homesick`, `lonely`, `low_mood` |
| `EarthLink` | `offline`, `online` |
| `ProtocolType` | `emergency`, `guidance` |
| `AlertKind` | `vital`, `report`, `maneuver` |

Constants: `INDICATORS` (the tuple of the nine indicators, in the order used by the manual views) and `LANGUAGES = ("en", "es")`. `SESSION_ID` is the reusable field definition `Field(min_length=1, max_length=128)`.

## Status and voice

| Model | Fields |
|---|---|
| `ErrorResponse` | `detail: str` |
| `StatusResponse` | `backend: "ok"`, `version`, `ollama_reachable`, `model`, `model_available`, `earth_link`, `voice: "disabled" \| "loading" \| "ready" \| "unavailable"`, `voice_languages: list[Language]`, `manual_version`, `time` |
| `SpeechRequest` | `text` (1–1000), `language` (default `es`) |

## Manual

| Model | Fields |
|---|---|
| `Band` | `min`, `max` (inclusive), `lt`, `lte`, `gt`, `gte` (open bounds); all optional floats |
| `RangeBands` | `normal`, `attention`, `urgent`: `list[Band]` |
| `RangeView` | formatted `normal`, `attention`, `urgent` (e.g. `"41–49 or 101–130 bpm"`), `warning`, raw `bands: RangeBands` |
| `WhatToDo` | `normal`, `attention`, `urgent`: `list[str]` |
| `IndicatorView` | `indicator`, `language`, `name`, `unit`, `explanation`, `why_it_matters_in_space`, `how_to_measure: list[str]`, `ranges: RangeView`, `what_to_do: WhatToDo`, `urgent_protocol`, `source`, `version`, `last_reviewed` |
| `ProtocolView` | `name`, `type`, `language`, `title`, `intro` (optional opening line), `audience`, `steps: list[str]`, `source`, `version`, `last_reviewed` |
| `ProtocolSummary` | `name`, `type`, `title` |
| `ManualView` | `language`, `title`, `version`, `last_reviewed`, `review_status`, `source`, `mission`, `disclaimer`, `ranges_warning`, `gap_policy`, `indicators: list[IndicatorView]`, `protocols: list[ProtocolSummary]` |

## Crew

| Model | Fields |
|---|---|
| `CrewProfile` | `crew_id`, `name`, `preferredLanguage`, `role` |
| `IdentifyRequest` | `bracelet_id` (1–64), `session_id` (optional, 1–128) |
| `IdentifyResponse` | `CrewProfile` + `session_cleared: bool` |

`preferredLanguage` keeps the camelCase spelling of `crew.json`.

## Chat

| Model | Fields |
|---|---|
| `ChatRequest` | `session_id`, `crew_id` (optional, ≤ 64), `message` (whitespace stripped, 1–2000), `language` (optional) |
| `ChatResponse` | `category`, `reply`, `language`, `ai_used`, `protocol: ProtocolView \| None`, `indicator`, `moment`, `personalized` (default false), `source`, `suggestions: list[str]` |
| `SessionResetRequest` | `session_id` |
| `SessionResetResponse` | `session_id`, `cleared` |

## Measurements

| Model | Fields |
|---|---|
| `MeasurementIn` | `crew_id` (optional), `indicator`, `value` (float, NaN/Infinity rejected), `unit` (1–32), `timestamp` (optional), `language` (optional) |
| `Measurement` | `id`, `crew_id` (`null` = unassigned), `indicator`, `value`, `unit`, `status`, `timestamp`, `synced` |
| `MeasurementResult` | `Measurement` + `needs_confirmation`, `language`, `message`, `guidance: list[str]`, `alert: AlertView \| None`, `source` |
| `AssignRequest` | `crew_id` (1–64) |

`Measurement` is exactly what is written to `measurements.json`: nothing else about a reading is ever stored.

## Alerts

| Model | Fields |
|---|---|
| `AlertView` | `id`, `kind` (default `vital`), `measurement_id`, `crew_id`, `crew_name`, `indicator`, `value`, `unit`, `protocol` (report: protocol name; maneuver: maneuver id), `status: "urgent"`, `message` (localized), `created_at`, `acknowledged`, `acknowledged_at`, `resolved`, `resolved_at` |
| `AlertResolveRequest` | `crew_id` (optional; omit for every alert) |

## Live vitals and simulation

| Model | Fields |
|---|---|
| `LiveIndicator` | `value`, `unit`, `status`, `history: list[float]` (oldest first) |
| `CrewVitals` | `crew_id`, `name`, `updated_at`, `scenario` (simulated emergency in progress), `overall_status`, `indicators: dict[str, LiveIndicator]` |
| `Scenario` | `id`, `label` |
| `SimulationEmergencyRequest` | `crew_id` (1–64), `scenario` (1–64) |
| `SimulationResetRequest` | `crew_id` (optional) |

## Sync, export and wipe

| Model | Fields |
|---|---|
| `SyncStatus` | `earth_link`, `pending` (assigned measurements to send), `awaiting_assignment`, `pending_reports`, `last_sync` |
| `SyncResult` | `SyncStatus` + `synced_count`, `synced_reports` |
| `ExportJSON` | `exported_at`, `manual_version`, `ranges_warning`, `count`, `measurements` |
| `DeleteDataResponse` | `measurements_deleted`, `alerts_cleared`, `sessions_cleared`, `reports_deleted`, `access_log_deleted` |

## Maneuvers

`MANEUVER_ID` = `Field(pattern=r"^[a-z_]{1,40}$")`.

| Model | Fields |
|---|---|
| `ManeuverStartRequest` | `crew_id` (optional; the account that opened the guide, possibly the helper), `maneuver` |
| `ManeuverEvent` | `at`, `elapsed_s` (0 – 7 days), `event` (≤ 200) |
| `ManeuverSummary` | `title` (≤ 200), `environment` (≤ 100), `comm_delay`, `evacuation` (≤ 100), `started_at`, `duration_s` (0 – 7 days), `compressions`, `cycles` (≥ 0), `tourniquet_time` (≤ 40), `events` (≤ 500) |
| `ManeuverReportIn` | `crew_id`, `maneuver`, `summary` |
| `ManeuverReport` | `ManeuverReportIn` + `id`, `created_at`, `synced` |

The front-end builds `ManeuverSummary` from the guide's `paqueteTierra()` with `toReportSummary()` ([frontend/lib/maneuvers.md](../frontend/lib/maneuvers.md#toreportsummarypkg)).

## Announcements and access log

| Model | Fields |
|---|---|
| `AnnouncementIn` | `text` (1–500), `priority: "normal" \| "important"`, `author` (default `General`, 1–80) |
| `Announcement` | `AnnouncementIn` + `id`, `at` |
| `AccessLogIn` | `crew_id` (1–64), `viewer` (default `general`), `reason` (optional alert id, ≤ 64) |
| `AccessEntry` | `AccessLogIn` + `id`, `at` |
