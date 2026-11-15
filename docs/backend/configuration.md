# Backend configuration

Source: [`Backend/app/config.py`](../../Backend/app/config.py), example file [`Backend/.env.example`](../../Backend/.env.example).

Every setting is optional and has a safe offline default. `Settings` is a pydantic-settings class:

- environment variables use the prefix **`MOON_C_`** (`ollama_model` → `MOON_C_OLLAMA_MODEL`), case-insensitive;
- values can also come from **`Backend/.env`** (UTF-8). Real environment variables win over the file;
- unknown variables are ignored (`extra="ignore"`);
- **relative paths are resolved against `Backend/`**, wherever Uvicorn is started from;
- `get_settings()` returns a fresh `Settings()`; `create_app()` reads it once at startup. Restart after changing anything.

Invalid values (for example a negative timeout) stop the backend at startup with a pydantic validation error.

## Local AI (Ollama, small talk only)

| Variable | Default | Constraint | Meaning |
|---|---|---|---|
| `MOON_C_OLLAMA_URL` | `http://localhost:11434` | | Ollama server |
| `MOON_C_OLLAMA_MODEL` | `qwen3.5:4b` | | Model for small talk. `/status` also accepts `<model>:latest` as available |
| `MOON_C_OLLAMA_TIMEOUT_S` | `10` | > 0 | Max wait for a chat reply; after it, a canned reply is used. Raise to 25 (or 40 with a support profile) on a slow laptop |
| `MOON_C_OLLAMA_KEEP_ALIVE` | `30m` | | How long Ollama keeps the model loaded after each call |
| `MOON_C_OLLAMA_NUM_PREDICT` | `120` | > 0 | Max tokens per reply. A reply cut by this limit is trimmed to its last full sentence |
| `MOON_C_OLLAMA_TEMPERATURE` | `0.7` | 0–2 | Sampling temperature |
| `MOON_C_OLLAMA_WARMUP` | `true` | | Load the model in the background at startup |
| `MOON_C_OLLAMA_WARMUP_TIMEOUT_S` | `180` | > 0 | Timeout of that warm-up request |
| `MOON_C_OLLAMA_STATUS_TIMEOUT_S` | `2` | > 0 | Timeout of the `GET /api/tags` probe used by `/status` |
| `MOON_C_OLLAMA_STATUS_TTL_S` | `10` | ≥ 0 | Cache of the `/status` probe. `0` = probe on every call |
| `MOON_C_OLLAMA_CIRCUIT_S` | `10` | ≥ 0 | After a connection failure, skip Ollama for this many seconds and use canned replies. `0` = off |

## Data

| Variable | Default | Meaning |
|---|---|---|
| `MOON_C_SHARED_DIR` | `../shared` | Folder with `protocols.json`, `keywords.json`, `crew.json`, `support.json` |
| `MOON_C_PROFILES_DIR` | `<shared_dir>/profiles` | Private support profiles, one JSON per crew member |
| `MOON_C_STORAGE_PATH` | `storage/measurements.json` | Measurements file. The other record files (`maneuver_reports.json`, `access_log.json`, `announcements.json`) go in **the same folder** |
| `MOON_C_RETENTION_DAYS` | `0` (≥ 0) | Days to keep measurements and records. `0` keeps them for the whole mission |

> ⚠️ The default storage folder is inside the repository, which lives in OneDrive: OneDrive uploads it. For real use, set `MOON_C_STORAGE_PATH` to an absolute path outside any synced folder.

## Chat sessions (memory only)

| Variable | Default | Constraint | Meaning |
|---|---|---|---|
| `MOON_C_SESSION_TTL_S` | `600` | > 0 | A chat context is cleared after this much inactivity |
| `MOON_C_SESSION_MAX_TURNS` | `10` | > 0 | Turns kept per session |
| `MOON_C_SESSION_SWEEP_INTERVAL_S` | `60` | > 0 | How often the background sweeper drops expired sessions |

The front-end uses the same 10-minute window (`CHAT_TTL_MS` in `App.jsx`). The lifetime of a pending follow-up question (120 s) is fixed in `SessionStore`.

## Earth link (simulated)

| Variable | Default | Meaning |
|---|---|---|
| `MOON_C_EARTH_LINK` | `offline` | `offline`: data waits until `POST /sync/simulate`. `online`: the background loop marks pending data as synced |
| `MOON_C_SYNC_INTERVAL_S` | `60` (> 0) | Interval of that loop |

## Simulated bracelets

| Variable | Default | Constraint | Meaning |
|---|---|---|---|
| `MOON_C_SIMULATION` | `true` | | Live vital signs. With `false`, `GET /vitals` returns `[]` and the simulation endpoints answer 409 |
| `MOON_C_SIM_TICK_S` | `2.5` | > 0 | Seconds between simulated readings |
| `MOON_C_SNAPSHOT_INTERVAL_S` | `900` | > 0 | Seconds between stored snapshots of every live sign. Status changes are always stored |
| `MOON_C_SIM_SEED` | random | int | Fixed random seed of the bracelet simulation, for reproducible demos. It does not affect the chat's canned wordings (those use their own generator; tests replace `services.chat._rng` to fix them) |

## Voice (offline Spanish text-to-speech)

| Variable | Default | Constraint | Meaning |
|---|---|---|---|
| `MOON_C_VOICE` | `true` | | Load Moon-C's own voice for `POST /tts`. `false` → `/status` reports `voice: "disabled"` |
| `MOON_C_VOICE_DIR` | `../moonc_voz` | | Folder of the voice module and its model |
| `MOON_C_TTS_MAX_CONCURRENT` | `2` | ≥ 1 | Simultaneous syntheses; more requests get 429 with `Retry-After: 1` |

## CORS

| Variable | Default | Meaning |
|---|---|---|
| `MOON_C_CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000` | Comma-separated list of allowed front-end origins |
| `MOON_C_CORS_ORIGIN_REGEX` | `^https?://(localhost\|127\.0\.0\.1)(:\d+)?$` | Extra allowed pattern (any localhost port). An empty value disables it |

There is no authentication: the backend assumes a trusted on-board network. Keep CORS limited to the machines that run the front-end.

## Example `.env` for a slow laptop

```dotenv
MOON_C_OLLAMA_TIMEOUT_S=25
MOON_C_SIM_SEED=7
MOON_C_RETENTION_DAYS=0
```

## Settings in tests

`tests/conftest.py` builds `Settings(_env_file=None, ...)` so a developer's `.env` never leaks into the tests, and overrides: the real `shared/` folder, a temporary `storage_path`, an empty profiles folder, `ollama_warmup=False`, `earth_link="offline"`, `simulation=False` and `voice=False`. A test can change any value with `make_client(**overrides)`. See [testing.md](testing.md).
