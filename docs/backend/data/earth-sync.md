# Earth sync (`sync.py`)

Source: [`Backend/app/sync.py`](../../../Backend/app/sync.py).

Priority 3 of Moon-C: **send data to Earth in the background when a link is available, never blocking the crew.** This prototype transmits nothing: it only marks data as synced, to show the queue working.

## What is queued

| Data | Queued when | Notes |
|---|---|---|
| Measurements | Stored with a `crew_id` (`synced: false`) | **Unassigned readings wait** until someone confirms whose they are (`POST /measurements/{id}/assign`); assigning one makes it pending again |
| Maneuver reports | Stored by `POST /maneuvers/reports` | The "Report to Earth" step of a guide |

Never queued: chat, alerts, the access log, announcements, support profiles.

## `EarthSync`

```python
EarthSync(store: MeasurementStore, link: "offline" | "online" = "offline", reports: RecordStore | None = None)
```

| Member | Behavior |
|---|---|
| `link` | Simulated link state, from `MOON_C_EARTH_LINK` |
| `last_sync` | Time of the last contact window, or `None` |
| `status()` | `SyncStatus`: link, pending measurements, readings awaiting assignment, pending reports, last sync |
| `flush()` | One contact window: mark every pending assigned measurement and every pending report as synced, set `last_sync`; returns `SyncResult` with `synced_count` and `synced_reports`. Logs the counts only when something was synced |
| `run(interval_s)` | Background loop: every `MOON_C_SYNC_INTERVAL_S` (60 s), if `link == "online"`, run `flush()` in a worker thread. An `OSError` is logged and retried on the next window |

## Endpoints

- `POST /sync/simulate`: run `flush()` now (the **Simulate contact with Earth** button in the General account's menu).
- `GET /sync/status`: the queue. The front-end polls it every 20 s and shows "Earth · N to send" in the top bar ([frontend/hooks.md](../../frontend/hooks.md#usesyncstatus)).

## Modes

| `MOON_C_EARTH_LINK` | Behavior |
|---|---|
| `offline` (default) | Data waits until `POST /sync/simulate` |
| `online` | The background loop flushes every interval |

## Toward a real link

A real implementation would replace `flush()` with an actual transfer (encrypted, with acknowledgements) and mark only what Earth confirmed. Keep the rules: never block the crew, send only assigned readings, never send chat or profiles.
