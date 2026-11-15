# API client (`lib/api.js`)

Source: [`front-end/src/lib/api.js`](../../../front-end/src/lib/api.js). Backend side: [backend/api-reference.md](../../backend/api-reference.md).

**Every call to the backend goes through this module.** It wraps `fetch` with a base URL, JSON handling, timeouts and a typed error.

## `request(path, { method = 'GET', body, ms = 8000 })`

- URL: `${API_URL}${path}` (`API_URL` from `VITE_API_URL`, default `http://localhost:8000`).
- A body is sent as JSON with `Content-Type: application/json`; a GET sends neither body nor header.
- Timeout with `AbortSignal.timeout(ms)` (when the browser supports it).
- A non-2xx response throws `ApiError(status, detail)`, where `detail` is the backend's `{"detail": "..."}` string when there is one (validation lists are not shown).
- 204 → `null`; otherwise the parsed JSON.

```js
export class ApiError extends Error { status }   // err.message = backend detail or "HTTP <status>"
```

## `api` methods

| Method | HTTP | Timeout | Notes |
|---|---|---|---|
| `status()` | `GET /status` | 5 s | On Windows a stopped Ollama makes `/status` take ~2 s |
| `chat({ sessionId, crewId, message, language })` | `POST /chat` | **45 s** | `crew_id` is `null` for the General account. The backend may wait for the AI up to `MOON_C_OLLAMA_TIMEOUT_S` (10–40 s) |
| `resetSession(sessionId)` | `POST /session/reset` | 8 s | |
| `identify({ braceletId, sessionId })` | `POST /identify` | 8 s | |
| `vitals()` | `GET /vitals` | 5 s | |
| `simulateEmergency(crewId, scenario)` | `POST /simulation/emergency` | 8 s | |
| `simulationReset(crewId = null)` | `POST /simulation/reset` | 8 s | `null` = everyone |
| `alerts({ language = 'es', includeAcknowledged = true, includeResolved = false })` | `GET /alerts?…` | 5 s | Acknowledged alerts are included by default |
| `ackAlert(id, language = 'es')` | `POST /alerts/{id}/ack` | 8 s | |
| `resolveAlert(id, language = 'es')` | `POST /alerts/{id}/resolve` | 8 s | |
| `resolveCrewAlerts(crewId = null)` | `POST /alerts/resolve` | 8 s | `null` = every alert |
| `startManeuver({ crewId, maneuver, language = 'es' })` | `POST /maneuvers/start?language=` | 8 s | |
| `sendManeuverReport({ crewId, maneuver, summary })` | `POST /maneuvers/reports` | 8 s | `summary` from `toReportSummary()` |
| `announcements()` | `GET /announcements` | 8 s | |
| `postAnnouncement({ text, priority, author })` | `POST /announcements` | 8 s | |
| `logAccess({ crewId, viewer = 'general', reason = null })` | `POST /access-log` | 8 s | `reason` = alert id |
| `createMeasurement({ crewId, indicator, value, unit, language })` | `POST /measurements` | 8 s | |
| `unassignedMeasurements()` | `GET /measurements?unassigned=true` | 8 s | |
| `assignMeasurement(id, crewId)` | `POST /measurements/{id}/assign` | 8 s | |
| `syncStatus()` | `GET /sync/status` | 5 s | |
| `syncSimulate()` | `POST /sync/simulate` | 8 s | |
| `exportUrl(format)` | — | — | Returns `${API_URL}/export.json` or `.csv` for a download link |
| `deleteAllData()` | `DELETE /data?confirm=true` | 8 s | |
| `tts(text, language = 'es')` | `POST /tts` | 20 s | Returns an `ArrayBuffer` (WAV). Throws `ApiError` on any non-2xx (429, 422, 503) so the caller can fall back to a local voice |

Path parameters are escaped with `encodeURIComponent`.

## Related helpers in `lib/assistant.js`

- `checkBackend()`: `api.status()` or `null` on any error (used by `useBackendStatus`).
- `askBackend({ message, crewId, sessionId, language })`: `api.chat(...)` plus `via: 'backend'`.

## Tests

`src/lib/api.test.js` mocks `fetch` and checks the request of each method (path, method, body, `crew_id: null` for General, no body on GET) and that an HTTP error becomes an `ApiError` with the backend's detail.

## Adding a call

1. Add the endpoint to the backend ([backend/README.md](../../backend/README.md#common-changes)).
2. Add a method to `api` with an explicit timeout if it can be slow.
3. Add a case to `api.test.js`.
