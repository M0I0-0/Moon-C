# API reference

Source: [`Backend/app/main.py`](../../Backend/app/main.py). Models: [data-models.md](data-models.md).

The live, interactive contract is at <http://localhost:8000/docs> (Swagger UI) and `/openapi.json`. This page adds the behavior that the schema alone does not tell.

## Conventions

- **Base URL:** `http://localhost:8000` (front-end: `VITE_API_URL`).
- **JSON** in and out, except `/tts` (returns WAV) and `/export.csv` (returns CSV).
- **Language.** `/chat` replies in the language of the message (see [chat/README.md](chat/README.md#language-resolution)). Other endpoints take `?language=en|es` (or a `language` field), then fall back to the crew member's `preferredLanguage`, then English.
- **Times** are ISO 8601 in UTC. Naive input times are taken as UTC.
- **No authentication.** `crew_id` is trusted as sent.

### Errors

| Status | Body | When |
|---|---|---|
| 400 | `{"detail": "..."}` | `DELETE /data` without `confirm=true` |
| 404 | `{"detail": "Unknown crew_id 'zeus'."}` | Unknown crew, bracelet, indicator, protocol, measurement or alert |
| 409 | `{"detail": "..."}` | Simulation disabled; measurement already assigned |
| 422 | `{"detail": [{"type", "loc", "msg"}]}` | Request validation (the rejected input is **never** echoed back) |
| 422 | `{"detail": "..."}` | A reading rejected by the manual (unit, range, whole number); `/tts` in English; unknown scenario |
| 429 | `{"detail": "Moon-C's voice is busy. Try again in a moment."}` + `Retry-After: 1` | Too many `/tts` at once |
| 503 | `{"detail": "Moon-C is starting up."}` | Any route before the services are ready |
| 503 | `{"detail": "Moon-C's voice is loading. ..."}` | `/tts` while the voice is not ready |

## Endpoint index

| Tag | Method | Path |
|---|---|---|
| status | GET | [`/status`](#get-status) |
| chat | POST | [`/chat`](#post-chat) |
| chat | POST | [`/session/reset`](#post-sessionreset) |
| crew | POST | [`/identify`](#post-identify) |
| manual | GET | [`/manual`](#get-manual), [`/manual/{indicator}`](#get-manualindicator), [`/protocols/{name}`](#get-protocolsname) |
| measurements | POST, GET | [`/measurements`](#post-measurements), [`/measurements`](#get-measurements) |
| measurements | POST | [`/measurements/{id}/assign`](#post-measurementsidassign) |
| alerts | GET | [`/alerts`](#get-alerts) |
| alerts | POST | [`/alerts/{id}/ack`](#post-alertsidack), [`/alerts/{id}/resolve`](#post-alertsidresolve), [`/alerts/resolve`](#post-alertsresolve) |
| vitals | GET | [`/vitals`](#get-vitals), [`/vitals/{crew_id}`](#get-vitalscrew_id) |
| simulation | GET, POST | [`/simulation/scenarios`](#get-simulationscenarios), [`/simulation/emergency`](#post-simulationemergency), [`/simulation/reset`](#post-simulationreset) |
| voice | POST | [`/tts`](#post-tts) |
| maneuvers | POST, GET | [`/maneuvers/start`](#post-maneuversstart), [`/maneuvers/reports`](#post-maneuversreports) |
| announcements | GET, POST | [`/announcements`](#announcements) |
| access | POST, GET | [`/access-log`](#access-log) |
| sync | POST, GET | [`/sync/simulate`](#post-syncsimulate), [`/sync/status`](#get-syncstatus) |
| data | GET, DELETE | [`/export.json`, `/export.csv`](#exports), [`/data`](#delete-data) |

---

## Status

### `GET /status`

Backend, AI model, Earth link and voice state. Used by the front-end every 20 s to decide between online and offline mode.

```json
{
  "backend": "ok", "version": "0.1.0",
  "ollama_reachable": true, "model": "qwen3.5:4b", "model_available": true,
  "earth_link": "offline",
  "voice": "ready", "voice_languages": ["es"],
  "manual_version": "0.2.0", "time": "2026-11-15T14:05:00Z"
}
```

- The Ollama probe (`GET /api/tags`, 2 s timeout) is cached for `MOON_C_OLLAMA_STATUS_TTL_S` (10 s). A failed probe opens the chat's circuit breaker; a successful one closes it.
- `voice` is `disabled`, `loading`, `ready` or `unavailable`. `voice_languages` is empty unless the voice is ready.

## Chat

### `POST /chat`

```json
{ "session_id": "a1b2c3d4e5f6-moises", "crew_id": "moises", "message": "me duele el pecho", "language": "es" }
```

| Field | Rules |
|---|---|
| `session_id` | 1–128 characters. One context per id (the front-end uses `<device>-<account>`) |
| `crew_id` | Optional, ≤ 64. Unknown ids are ignored (the reply is generic, never an error) |
| `message` | Stripped, then 1–2000 characters (a message of only spaces → 422) |
| `language` | Optional `en`/`es`. Used only when the message itself is unclear |

Response (`ChatResponse`):

```json
{
  "category": "emergency",
  "reply": "Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo. Dolor de pecho: cómo ayudar: 1. ... 2. ...",
  "language": "es", "ai_used": false, "personalized": false,
  "protocol": { "name": "chest_pain", "type": "emergency", "title": "Dolor de pecho: cómo ayudar", "steps": ["..."], "...": "..." },
  "indicator": null, "moment": null, "source": "Moon-C example manual v0.1 – ...",
  "suggestions": []
}
```

- `category`: `emergency`, `health`, `support`, `ambiguous`, `small_talk` or `fallback`. How each is chosen: [chat/README.md](chat/README.md).
- `ai_used` is true only if the reply text came from the local model. `personalized` is true if a private support profile shaped it.
- `suggestions` are quick-reply buttons; their labels are routed back through the router when tapped.
- An emergency for an identified crew member (by `crew_id` or by the session's bracelet) raises a `report` alert. Messages are never stored or logged.

### `POST /session/reset`

`{"session_id": "..."}` → `{"session_id": "...", "cleared": true}`. Forgets that chat context (turns, language, pending question). Always answers `cleared: true`.

## Crew

### `POST /identify`

Simulated bracelet: `{"bracelet_id": "BR-001", "session_id": "optional"}` → the crew profile plus `session_cleared`.

```json
{ "crew_id": "moises", "name": "Moisés", "preferredLanguage": "es", "role": "flight_engineer", "session_cleared": true }
```

- Bracelet ids are matched trimmed and case-insensitively (`br-001` works).
- With `session_id`, that session starts a fresh context bound to the crew member.
- 404 `Unknown bracelet.`

## Manual

All three take `?language=en|es` (default `en`).

### `GET /manual`

The whole manual (`ManualView`): title, version, review status, mission, disclaimer, ranges warning, gap policy, every indicator view and a summary of every protocol.

### `GET /manual/{indicator}`

One `IndicatorView`: name, unit, explanation, why it matters in space, how to measure, `ranges` (formatted texts such as `"50–100 bpm"` plus the raw bands), `what_to_do` per status, `urgent_protocol`, source, version. 404 for an unknown indicator.

### `GET /protocols/{name}`

One `ProtocolView` (`chest_pain`, `breathing_difficulty`, `fainting_unresponsive`, `bleeding`, `emotional_crisis`, `general_emergency`, `feeling_unwell`). 404 for an unknown name.

## Measurements

Indicators: `heart_rate`, `body_temperature`, `spo2`, `sleep_hours`, `mood`, `blood_pressure_systolic`, `blood_pressure_diastolic`, `respiratory_rate`, `radiation`. Accepted units: [shared-data.md](../shared-data.md#indicators).

### `POST /measurements`

```json
{ "crew_id": "moises", "indicator": "body_temperature", "value": 38.2, "unit": "°C", "timestamp": null, "language": "es" }
```

→ **201** `MeasurementResult`:

```json
{
  "id": "9f1c…", "crew_id": "moises", "indicator": "body_temperature", "value": 38.2, "unit": "°C",
  "status": "attention", "timestamp": "2026-11-15T14:05:00Z", "synced": false,
  "needs_confirmation": false, "language": "es",
  "message": "Temperatura corporal 38.2 °C: requiere atención. El rango normal de referencia es 36.1–38 °C.",
  "guidance": ["..."], "alert": null, "source": "Bands: NEWS2 temperature scoring ..."
}
```

- The value is validated and classified by [the evaluator](health/evaluator.md). Errors → 422 with a readable message: wrong unit (`Unit 'F' is not valid for body_temperature. Use '°C'.`), non-finite value, mood not a whole number, value outside the valid range. °F is rejected, never converted.
- The stored unit is the canonical one (`C` → `°C`).
- `status: "urgent"` creates a `vital` alert, returned in `alert`.
- Without `crew_id` the reading is stored unassigned, `needs_confirmation` is true and the message asks whose it is. It is not sent to Earth until assigned.
- `guidance` holds the manual's steps for that status. For a low mood (status not normal) of a crew member with a support profile in the same language, the profile's `mood_guidance` lines come first.
- Unknown `crew_id` → 404.

### `GET /measurements`

Filters: `crew_id`, `indicator`, `since` (ISO 8601; naive = UTC), `unassigned` (`true` = only unassigned, `false` = only assigned). Sorted oldest first.

### `POST /measurements/{id}/assign`

`{"crew_id": "moises"}` → the updated `Measurement`. Only for unassigned readings: 409 if already assigned, 404 for an unknown measurement or crew. The reading becomes pending for Earth again, and any alert raised for it gets the crew member's name.

## Alerts

Alert kinds: `vital` (urgent reading), `report` (emergency detected in the chat), `maneuver` (a guided maneuver was opened). Details: [health/alerts.md](health/alerts.md).

### `GET /alerts`

Query: `language` (default `en`), `include_acknowledged` (default `false`), `include_resolved` (default `false`). Newest first. By default only open alerts nobody has acknowledged; the front-end asks for `include_acknowledged=true`.

```json
[{
  "id": "4be2…", "kind": "vital", "measurement_id": "9f1c…", "crew_id": "moises", "crew_name": "Moisés",
  "indicator": "body_temperature", "value": 39.6, "unit": "°C", "protocol": null, "status": "urgent",
  "message": "Alert: Moisés, body temperature 39.6 °C",
  "created_at": "…", "acknowledged": false, "acknowledged_at": null, "resolved": false, "resolved_at": null
}]
```

### `POST /alerts/{id}/ack`

Marks it as seen; it stays open. Idempotent (keeps the first time). 404 if unknown. Takes `?language=`.

### `POST /alerts/{id}/resolve`

Closes it. Idempotent. 404 if unknown. Takes `?language=`.

### `POST /alerts/resolve`

`{"crew_id": "moises"}` closes every open alert of that crew member; `{}` or `{"crew_id": null}` closes every open alert. Returns the alerts that were closed.

## Vitals and simulation

### `GET /vitals`

Live signs of every crew member from the simulated bracelets (`[]` when `MOON_C_SIMULATION=false`):

```json
[{
  "crew_id": "moises", "name": "Moisés", "updated_at": "…", "scenario": null, "overall_status": "normal",
  "indicators": {
    "heart_rate": { "value": 74, "unit": "bpm", "status": "normal", "history": [73, 75, 74, "…"] },
    "sleep_hours": { "value": 6.4, "unit": "h", "status": "attention", "history": ["14 days…"] }
  }
}]
```

Live signs keep their last 40 readings; `sleep_hours` and `mood` keep 14 days. `overall_status` is the worst status of all indicators.

### `GET /vitals/{crew_id}`

One crew member. 404 if unknown, 409 if the simulation is off.

### `GET /simulation/scenarios`

`[{"id": "low_oxygen", "label": "Low oxygen saturation"}, …]` in `?language=`. Scenarios: `low_oxygen`, `high_heart_rate`, `high_temperature`, `high_blood_pressure`, `solar_storm`. 409 if the simulation is off.

### `POST /simulation/emergency`

`{"crew_id": "valentina", "scenario": "high_temperature"}` → that crew member's `CrewVitals`. The signs drift toward the scenario values over the next ticks (they are not set at once). 404 unknown crew, 422 unknown scenario, 409 simulation off.

### `POST /simulation/reset`

`{"crew_id": "valentina"}` or `{}` for everyone → every `CrewVitals`. Signs drift back to their baselines. 404 unknown crew, 409 simulation off.

## Voice

### `POST /tts`

`{"text": "Hola, soy Moon-C.", "language": "es"}` → `audio/wav` (mono, 22 050 Hz), header `Cache-Control: no-store`.

| Status | When |
|---|---|
| 200 | WAV bytes |
| 422 | `language` is not spoken by Moon-C's voice (only `es` for now), or `text` is empty or longer than 1000 characters |
| 429 | All `MOON_C_TTS_MAX_CONCURRENT` slots busy (`Retry-After: 1`) |
| 503 | The voice is `loading`, `unavailable` or `disabled` (the detail says why) |

Units and the name are rewritten before synthesis ("72 bpm" → "72 latidos por minuto", "Moon-C" → "Mun Si"). The text is never stored or logged. See [voice/tts.md](voice/tts.md).

## Maneuvers

### `POST /maneuvers/start`

`{"crew_id": "moises" | null, "maneuver": "rcp"}` with `?language=` → the `maneuver` alert (`AlertView`). `maneuver` must match `^[a-z_]{1,40}$` (the 3D app uses `rcp`, `torniquete`, `atragantamiento`). Reopening the same guide for the same account reuses the open alert. An unknown `crew_id` never blocks the alert (it is stored without a name).

### `POST /maneuvers/reports`

Stores the guide's "Report for Earth" summary, queued for the next contact with Earth. → **201** `ManeuverReport`.

```json
{
  "crew_id": "moises", "maneuver": "rcp",
  "summary": {
    "title": "RCP (paro cardiaco)", "environment": "Tierra (comunidad remota)",
    "comm_delay": "llamada telefónica", "evacuation": "según servicio local",
    "started_at": "2026-11-15T14:00:00Z", "duration_s": 312, "compressions": 270, "cycles": 9,
    "tourniquet_time": null,
    "events": [{ "at": "2026-11-15T14:00:01Z", "elapsed_s": 1, "event": "Paso: Asegura la escena" }]
  }
}
```

Limits: texts up to 200/100/40 characters, durations up to 7 days, at most 500 events. The summary is generated by the guide, never chat text.

### `GET /maneuvers/reports`

Optional `crew_id`. Newest first.

## Announcements

- `GET /announcements` → every announcement, newest first.
- `POST /announcements` `{"text": "...", "priority": "normal" | "important", "author": "General"}` → **201** `Announcement` with `id` and `at`. `text` 1–500 characters (the UI limits it to 280), `author` 1–80.

Announcements survive the privacy wipe.

## Access log

- `POST /access-log` `{"crew_id": "ana", "viewer": "general", "reason": "<alert id>"}` → **201** `AccessEntry` (`id`, `at`). 404 for an unknown crew member.
- `GET /access-log?crew_id=ana` → entries, newest first.

The General account records an entry the first time it opens a crew member's data during an emergency.

## Sync

### `POST /sync/simulate`

Simulates a contact window with Earth: every pending **assigned** measurement and every pending maneuver report is marked as synced.

```json
{ "earth_link": "offline", "pending": 0, "awaiting_assignment": 2, "pending_reports": 0,
  "last_sync": "2026-11-15T14:10:00Z", "synced_count": 37, "synced_reports": 1 }
```

### `GET /sync/status`

The same fields without the counts of the last sync: link state, pending measurements, readings awaiting assignment, pending reports, last sync time.

## Data

### Exports

- `GET /export.json?crew_id=` → attachment `moon-c-measurements.json`: `{exported_at, manual_version, ranges_warning, count, measurements[]}`.
- `GET /export.csv?crew_id=` → attachment `moon-c-measurements.csv`, UTF-8 with BOM (so spreadsheets show `°C`), columns `id,crew_id,indicator,value,unit,status,timestamp,synced` (`crew_id` empty when unassigned, `synced` as `true`/`false`).

Only measurements are exported: never chat, reports, access log or support profiles.

### `DELETE /data`

Privacy wipe. Requires `?confirm=true` (otherwise 400). Deletes every measurement, maneuver report and access-log entry, and clears alerts and chat contexts. Announcements are kept.

```json
{ "measurements_deleted": 120, "alerts_cleared": 3, "sessions_cleared": 2, "reports_deleted": 1, "access_log_deleted": 1 }
```

## Quick try with curl

```bash
curl -s localhost:8000/chat -H "Content-Type: application/json" \
  -d '{"session_id":"tablet-1","message":"chest pain","language":"es"}'
curl -s localhost:8000/measurements -H "Content-Type: application/json" \
  -d '{"crew_id":"moises","indicator":"body_temperature","value":38.2,"unit":"°C"}'
curl -s "localhost:8000/alerts?language=es"
curl -s localhost:8000/tts -H "Content-Type: application/json" -d '{"text":"Hola"}' -o hola.wav
```

In PowerShell use `curl.exe` (not the `curl` alias), or the `/docs` page.
