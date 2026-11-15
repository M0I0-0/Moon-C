# Moon-C – backend

> **Moon-C supports the crew on board so they can monitor their health and act in time, without waiting for Earth. Moon-C does not diagnose.**

Priorities:

1. **Support and guide** the crew member.
2. **Alert** the crew and the on-board medical officer.
3. **Send data to Earth** in the background when a link is available. This never blocks anything.

Moon-C is a FastAPI service that runs fully offline on a local machine. Health and emergency answers come only from the health manual (`shared/protocols.json`). The local AI model (Ollama) is used for small talk only, and Moon-C works without it.

> ⚠️ The ranges are **reference values from published clinical guidelines and NASA standards – they must still be validated by medical experts.** Sources, deviations and space context: [shared/REFERENCES.md](../shared/REFERENCES.md).

## Repository layout

```
Moon-C/                  monorepo root
├── Backend/             this service (FastAPI)
│   ├── app/             main, config, schemas, intent, manual, evaluator, storage,
│   │                    ai, sessions, alerts, sync, chat (chat flow), crew (profiles)
│   ├── tests/           pytest suite
│   ├── requirements.txt
│   └── .env.example
├── shared/
│   ├── protocols.json   health manual: the single source of truth (en + es)
│   ├── keywords.json    router keywords (en + es), editable without code changes
│   └── crew.json        simulated crew profiles (no biometric data)
└── Frontend/            (not part of this backend)
```

The folder is named `Backend` with a capital B. Windows ignores the case, but macOS and Linux don't, so use the exact name there.

## Setup

You need Python 3.11 or newer. Internet is needed once, to install packages and pull the model. After that, everything runs offline.

### Windows (PowerShell)

```powershell
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If PowerShell blocks `Activate.ps1`, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. You can also skip activation and call the venv's Python directly: `.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000`.

### macOS and Linux

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Then open:

- API docs (try every endpoint from the browser): <http://localhost:8000/docs>
- Health check: <http://localhost:8000/status>

### Ollama (local AI for small talk)

1. Install Ollama from <https://ollama.com/download>. On Linux you can use `curl -fsSL https://ollama.com/install.sh | sh`.
2. Pull the model:

   ```bash
   ollama pull qwen3.5:4b
   ```

3. Make sure Ollama is running (it serves on `http://localhost:11434`). `GET /status` shows `ollama_reachable` and `model_available`.

When the backend starts, it loads the model in the background (`keep_alive` 30 min) without delaying startup. If Ollama is stopped, slow (over about 10 s) or the model is missing, Moon-C answers small talk with canned replies and returns `ai_used: false`. Nothing else changes.

For privacy, keep Ollama's debug logging (`OLLAMA_DEBUG`) off so prompts are not written to its logs.

**Slow machines.** Without a GPU, a 4B model can take 8–16 s per reply. In testing on the development laptop, `qwen3.5:4b` produced about 2–4 tokens/s. With the default 10 s timeout, Moon-C then falls back to canned replies most of the time. To give the model more time, raise `MOON_C_OLLAMA_TIMEOUT_S` (for example to `25`) or use a smaller model. On Windows, when Ollama is stopped, each small-talk reply also takes about 2 s longer, which is how long Windows takes to refuse a local connection.

### Tests

```bash
python -m pytest
```

The tests use a mocked Ollama and a temporary storage folder. They never touch `Backend/storage/` or a real model.

## Configuration

Every setting is optional. Use environment variables or copy `.env.example` to `Backend/.env`.

| Variable | Default | Meaning |
|---|---|---|
| `MOON_C_OLLAMA_URL` | `http://localhost:11434` | Ollama server |
| `MOON_C_OLLAMA_MODEL` | `qwen3.5:4b` | Model for small talk |
| `MOON_C_OLLAMA_TIMEOUT_S` | `10` | Max wait for a small-talk reply before using a canned reply |
| `MOON_C_OLLAMA_KEEP_ALIVE` | `30m` | How long Ollama keeps the model loaded |
| `MOON_C_OLLAMA_NUM_PREDICT` | `120` | Max tokens per reply |
| `MOON_C_OLLAMA_TEMPERATURE` | `0.7` | Sampling temperature |
| `MOON_C_OLLAMA_WARMUP` | `true` | Load the model in the background at startup |
| `MOON_C_SHARED_DIR` | `../shared` | Folder with `protocols.json`, `keywords.json` and `crew.json` |
| `MOON_C_STORAGE_PATH` | `storage/measurements.json` | Measurements file (relative to `Backend/`) |
| `MOON_C_RETENTION_DAYS` | `0` | Days to keep measurements. `0` keeps them for the whole mission |
| `MOON_C_SESSION_TTL_S` | `600` | Chat context is cleared after this much inactivity |
| `MOON_C_SESSION_MAX_TURNS` | `10` | Chat turns kept per session |
| `MOON_C_EARTH_LINK` | `offline` | Simulated link. With `online`, pending data syncs in the background |
| `MOON_C_SYNC_INTERVAL_S` | `60` | Background sync interval while the link is online |
| `MOON_C_SIMULATION` | `true` | Simulated bracelets produce live vital signs. `false` turns them off |
| `MOON_C_SIM_TICK_S` | `2.5` | Seconds between simulated readings |
| `MOON_C_SNAPSHOT_INTERVAL_S` | `900` | Seconds between stored snapshots of the live signs. Status changes are always stored |
| `MOON_C_SIM_SEED` | random | Fixed seed for reproducible demos |
| `MOON_C_VOICE` | `true` | Load Moon-C's own voice for `POST /tts` (optional install, see [Speech](#speech)) |
| `MOON_C_VOICE_DIR` | `../moonc_voz` | Folder of the voice module and its model |
| `MOON_C_CORS_ORIGINS` | localhost on ports 5173 and 3000 | Comma-separated frontend origins |
| `MOON_C_CORS_ORIGIN_REGEX` | any `localhost` or `127.0.0.1` port | Extra origin pattern. Set it empty to disable |

## API

The full contract, with schemas and examples, is at `/docs`. Responses use the language sent in the request, then the crew member's `preferredLanguage`, then English (`en` or `es`).

| Method | Path | Purpose |
|---|---|---|
| GET | `/status` | Backend ok, Ollama reachable, model name, `earth_link` state, `voice` state |
| POST | `/tts` | `{text, language?}` → WAV spoken with Moon-C's own voice (Spanish only; 503 while loading or if not installed) |
| POST | `/chat` | `{session_id, crew_id?, message, language?}` → `{category, reply, language, ai_used, protocol?, indicator?, source?, suggestions}` |
| POST | `/session/reset` | `{session_id}`: forget that chat context |
| POST | `/identify` | Simulated bracelet: `{bracelet_id, session_id?}` → crew profile; clears that session's context |
| GET | `/manual`, `/manual/{indicator}` | Localized manual (`?language=en\|es`) |
| GET | `/protocols/{name}` | Emergency protocol or guidance (`chest_pain`, `breathing_difficulty`, `fainting_unresponsive`, `bleeding`, `general_emergency`, `feeling_unwell`) |
| POST | `/measurements` | `{crew_id?, indicator, value, unit, timestamp?, language?}` → measurement with `status`. Urgent creates an alert. Without `crew_id`: unassigned and `needs_confirmation: true` |
| GET | `/measurements` | Filters: `crew_id`, `indicator`, `since`, `unassigned` |
| POST | `/measurements/{id}/assign` | `{crew_id}`. Only for unassigned readings (otherwise 409) |
| GET | `/alerts` | Open alerts, for example `"Alert: Moisés, body temperature 38.2 °C"`. Kinds: `vital` (urgent reading), `report` (emergency detected in the chat), `maneuver` (guided maneuver started). Filters: `include_acknowledged`, `include_resolved` |
| POST | `/alerts/{id}/ack` | Acknowledge an alert (it stays open) |
| POST | `/alerts/{id}/resolve`, `/alerts/resolve` | Close one alert, or every open alert of a crew member (`{crew_id}`, omit it for all) |
| GET | `/vitals`, `/vitals/{crew_id}` | Live vital signs from the simulated bracelets: value, status and recent history of each indicator |
| GET | `/simulation/scenarios` | Simulated emergencies available for demos |
| POST | `/simulation/emergency`, `/simulation/reset` | Start a simulated emergency (`{crew_id, scenario}`) or end it |
| POST | `/maneuvers/start` | A guided maneuver (CPR, tourniquet, choking) was opened: raises a `maneuver` alert |
| POST, GET | `/maneuvers/reports` | Store the guide's summary for Earth (queued for sync) and list the reports |
| GET, POST | `/announcements` | Messages from the General account to the crew |
| POST, GET | `/access-log` | Record and list who opened a crew member's data during an emergency |
| POST | `/sync/simulate` | Simulated contact with Earth: marks pending measurements and maneuver reports as synced |
| GET | `/sync/status` | Pending measurements and reports, readings awaiting assignment, last sync time |
| GET | `/export.json`, `/export.csv` | Download measurements (optional `crew_id`) |
| DELETE | `/data?confirm=true` | Privacy wipe: deletes measurements, maneuver reports and the access log, and clears alerts and chat contexts. Announcements are kept |

Indicators and units: `heart_rate` (bpm), `body_temperature` (°C), `spo2` (%), `sleep_hours` (h), `mood` (/5, whole numbers 1–5). Common unit spellings are accepted (`C`, `celsius`, `hours`, `1-5`…). Other units, such as °F, are rejected with 422 instead of being converted.

The quickest way to talk to Moon-C is the terminal chat helper. Run it with the backend running, from `Backend/`, in a second terminal:

```bash
python scripts/chat.py                 # English, no crew member
python scripts/chat.py --crew moises   # as Moisés (Spanish)
```

It prints each reply with its category, language, whether the AI was used and the response time. `/reset` clears the conversation and `/quit` exits.

Your browser can only send GET requests, so opening `/chat` in the address bar returns `405 Method Not Allowed`. Use `/docs` (**Try it out**), the script above or curl:

Quick try (bash; in PowerShell, use `curl.exe` or the `/docs` page):

```bash
curl -s localhost:8000/chat -H "Content-Type: application/json" \
  -d '{"session_id":"tablet-1","message":"chest pain","language":"es"}'
curl -s localhost:8000/measurements -H "Content-Type: application/json" \
  -d '{"crew_id":"moises","indicator":"body_temperature","value":38.2,"unit":"°C"}'
curl -s localhost:8000/alerts
```

## How a chat message is handled

The router (`app/intent.py`) normalizes the text (lowercase, no accents, no punctuation) and checks these categories in strict order:

1. **emergency**: chest pain, can't breathe, passed out, unresponsive, bleeding… The keywords of both languages are always checked, whatever the active language. Moon-C returns the manual protocol, written for the crewmate who is helping. The AI is never called.
2. **health**: indicator names or symptoms. Moon-C answers from the manual. The AI is never called.
3. **ambiguous**: "I feel weird", "me siento raro". Moon-C asks "Does something hurt, or do you feel tired?"
4. **small_talk**: greetings, thanks, casual chat. Moon-C uses the local AI or a canned reply. If an AI reply mentions health or emergency keywords, it is discarded and the message is answered by the health router.
5. **fallback**: an honest "I'm not sure" with options.

To change keywords, edit `shared/keywords.json` and restart the backend. To change health content, edit `shared/protocols.json`: it is validated at startup, and a broken manual stops the backend with a clear error instead of giving wrong answers.

## Privacy

- **Measurements** are stored in `Backend/storage/measurements.json` (gitignored). Each record has id, crew_id (null = unassigned), indicator, value, unit, status, timestamp and synced. The simulated bracelets store a reading only when a status changes and in a periodic snapshot, never every second.
- **Safety records** are stored next to them: `maneuver_reports.json` (the guide's summary: times, counts and step names), `access_log.json` (who opened whose data and when) and `announcements.json`. None of them contains chat text.
- All writes are atomic (temp file, then rename) and guarded by a lock. `MOON_C_RETENTION_DAYS` applies to every file.
- **Chat messages, transcripts and audio are never stored**, and message content is never logged. An alert raised from the chat keeps only the protocol name.
- Chat context lives only in memory, keyed by `session_id`. It keeps at most 10 turns and is cleared after 10 minutes of inactivity, on a crew switch, on `/identify` and on `POST /session/reset`.
- No biometric data of any kind. Crew profiles hold only an id, a name, a bracelet id, a language and a role.
- ⚠️ **This repository is inside a OneDrive folder.** OneDrive uploads `Backend/storage/measurements.json` to the cloud like any other file there. For real use, set `MOON_C_STORAGE_PATH` to a folder that is not synced.

## Speech

**Moon-C's own voice (text-to-speech, offline).** `POST /tts` speaks Spanish with the voice the voice team built in `moonc_voz/`: the Piper voice `es_MX-claude-high`, with pitch and timbre adjusted with Praat. See `moonc_voz/LEEME.md` for how to tune it. On the development laptop the model loads in about 3 s, in the background so it doesn't delay startup, and a sentence takes 0.2–0.5 s. Units are rewritten so they are read in full ("72 bpm" → "72 latidos por minuto", "Moon-C" → "Mun Si"); the list is `SPOKEN_FORMS_ES` in `app/voice.py`. The text is never stored or logged.

It is an optional install:

```bash
git lfs pull                               # the 63 MB model is stored with Git LFS
pip install -r requirements-voice.txt      # piper-tts, praat-parselmouth, numpy, scipy
```

Without it, `/status` reports `voice: "unavailable"` and the front-end uses a voice installed on the machine, or subtitles. English replies always use that local voice, because Moon-C's voice only speaks Spanish for now.

> ⚠️ **License:** `piper-tts` 1.8 and `praat-parselmouth` are **GPL-3.0**. Distributing the backend with them installed means distributing it under GPL-compatible terms. An open hackathon project usually complies, but have someone who handles licenses confirm it.

**Speech-to-text** is still done by the browser's dictation, which uses an online service. A future on-board version could use a local engine such as **Vosk** or **whisper.cpp**.

## Limitations

- **Not medically validated.** The ranges come from published guidelines (NEWS2, AHA/ACC, WHO, AASM/SRS) and NASA standards, but they are for healthy adults at rest, they are not personal baselines, and some thresholds (mood, radiation alerts) are Moon-C design choices. The protocol steps are illustrative. All of it must be validated by medical experts before any real use; see [shared/REFERENCES.md](../shared/REFERENCES.md).
- **Keyword routing, not understanding.** The router can't read negation: "I don't have chest pain" still opens the emergency protocol, which is the safe side by design. It doesn't handle typos and supports English and Spanish only.
- **The post-filter is keyword-based.** It can discard a harmless AI reply. In that case the user gets the manual-based answer instead.
- **Alerts, chat context and live signs live in memory.** They are lost on restart; measurements and safety records are not. Run a single process (no multiple Uvicorn workers).
- **Simulated bracelets.** Live signs come from a simulation (`MOON_C_SIMULATION`) until real sensors exist; its readings are stored like real ones.
- **Earth sync is simulated.** Nothing is transmitted or encrypted. Only confirmed (assigned) readings are queued.
- **No authentication.** The backend assumes a trusted on-board network. CORS is limited to localhost by default.
- **The bracelet is simulated** through `POST /identify` and `shared/crew.json`.
- **JSON storage** rewrites the file on each write. That suits a mission's worth of readings, not high-frequency sensor streams.
