# Storage (`storage.py`, `records.py`)

Sources: [`Backend/app/storage.py`](../../../Backend/app/storage.py), [`Backend/app/records.py`](../../../Backend/app/records.py).

Moon-C writes very little to disk, and never chat text, transcripts or audio. Everything is plain JSON in one folder (the parent of `MOON_C_STORAGE_PATH`, by default `Backend/storage/`, gitignored).

| File | Store | Content | Time field |
|---|---|---|---|
| `measurements.json` | `MeasurementStore` | Readings: `id, crew_id, indicator, value, unit, status, timestamp, synced` | `timestamp` |
| `maneuver_reports.json` | `RecordStore[ManeuverReport]` (key `reports`) | Summary of a guided maneuver: times, counts, step names | `created_at` |
| `access_log.json` | `RecordStore[AccessEntry]` (key `access_log`) | Who opened whose data during an emergency, when and why | `at` |
| `announcements.json` | `RecordStore[Announcement]` (key `announcements`) | Messages from the General account | `at` |

Alerts, chat context and live signs are **memory only** and are lost on restart.

> ⚠️ The repository is inside OneDrive, so this folder is uploaded to the cloud. For real use set `MOON_C_STORAGE_PATH` to a folder that is not synced. The files are not encrypted.

## File format

```json
{
  "schema_version": 1,
  "measurements": [
    { "id": "9f1c…", "crew_id": "moises", "indicator": "heart_rate", "value": 74.0, "unit": "bpm",
      "status": "normal", "timestamp": "2026-11-15T14:05:00Z", "synced": false }
  ]
}
```

Record files use the same shape with their own key (`reports`, `access_log`, `announcements`). Text is written with `ensure_ascii=False` and indented.

## Safe writes

`write_json_atomic(path, payload)`:

1. create the folder if needed;
2. write to a temporary file in the **same folder** (`.<name>.<random>.tmp`), flush and `fsync`;
3. `os.replace()` it over the target. On Windows, antivirus or OneDrive can hold the file for a moment, so a `PermissionError` is retried up to 8 times with a growing pause (50 ms, 100 ms, …);
4. on any error the temporary file is removed.

A crash or a concurrent request can never leave a half-written file. Every store also guards its state with a re-entrant lock.

## Corrupt files

At startup, an unreadable file (invalid JSON, wrong shape, invalid record) is **never deleted**: `set_aside_corrupt()` renames it to `<name>.corrupt-<YYYYMMDDTHHMMSSZ>`, logs a warning with the new name and the store starts empty.

## Retention

`MOON_C_RETENTION_DAYS` (default `0` = keep everything for the whole mission) applies to every file. Records older than the cutoff (by their time field) are pruned at load time and whenever a record is added.

## `MeasurementStore`

| Method | Behavior |
|---|---|
| `load()` | Read the file (or start empty), prune, log `Loaded N measurements.` |
| `add(m)` | Insert, prune, save |
| `add_many(list)` | Insert a batch with one file write (used by the simulated bracelets) |
| `get(id)` | One measurement or `None` |
| `list(crew_id, indicator, since, unassigned)` | Filtered, sorted oldest first. `since` naive = UTC |
| `assign(id, crew_id)` | Only for unassigned readings: sets the crew member and `synced=False`. Raises `MeasurementNotFound` / `AlreadyAssigned` |
| `sync_counts()` | `(pending, awaiting_assignment)`: unsynced assigned and unsynced unassigned readings |
| `mark_synced()` | Mark every unsynced **assigned** reading as synced; returns the count |
| `wipe()` | Delete everything (the file is rewritten empty); returns the count |

Helpers in the same module: `now_utc()` and `to_utc(dt)` (naive datetimes are taken as UTC).

## `RecordStore[T]`

A small generic store for Pydantic models: `RecordStore(path, Model, key=..., time_field=..., retention_days=...)`.

| Method | Behavior |
|---|---|
| `load()` | Read the file if it exists (a file is created only when the first record is written) |
| `add(record)` | Append, prune, save |
| `list(predicate=None, newest_first=True)` | Filtered and sorted by the time field |
| `update_where(predicate, changes)` | Copy matching records with `changes` (used to mark reports as synced) |
| `wipe()` | Delete every record (rewrites the file only if it exists) |

## What the privacy wipe does

`DELETE /data?confirm=true`:

| Data | Effect |
|---|---|
| Measurements | Deleted |
| Maneuver reports | Deleted |
| Access log | Deleted |
| Alerts | Cleared (memory) |
| Chat sessions | Cleared (memory) |
| Announcements | **Kept** |

The counts are returned and logged (only counts).

## Exports

`GET /export.json` and `GET /export.csv` (optional `crew_id`) download measurements only, never chat, reports, the access log or support profiles. The JSON includes `exported_at`, `manual_version` and `ranges_warning`; the CSV starts with a UTF-8 BOM so spreadsheet programs show `°C` correctly. See [api-reference.md](../api-reference.md#exports).

## Tests

`test_measurements.py` (file content limited to the measurement fields, restart survival, corrupt file set aside, retention), `test_records.py` (reports queued for Earth, announcements persisted newest first, access log, wipe keeps announcements), `test_privacy.py` (no chat text on disk or in the logs; chat alone writes nothing) and `test_sync_export.py`.
