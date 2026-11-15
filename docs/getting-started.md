# Getting started

## Requirements

| Tool | Version | Needed for |
|---|---|---|
| Python | 3.11 or newer (the code uses `asyncio.timeout`) | Backend |
| Node.js | 20 or newer | Front-end |
| Git LFS | any | Moon-C's voice model (`moonc_voz/modelos/*.onnx`, 63 MB) |
| [Ollama](https://ollama.com/download) | any recent | Optional: AI small talk. Without it, Moon-C uses canned replies |
| Chrome or Edge | recent | Dictation (Web Speech API) and listing audio outputs. Other browsers work without dictation |

Internet is needed once, to install packages and pull the models. After that everything runs offline.

## 1. Get the code and the voice model

```bash
git clone <repo-url> Moon-C
cd Moon-C
git lfs pull          # downloads moonc_voz/modelos/es_MX-claude-high.onnx
```

Without `git lfs pull` the `.onnx` file is a small text pointer. The backend still starts, but `/status` reports `voice: "unavailable"`.

## 2. Local AI (optional)

```bash
ollama pull qwen3.5:4b
```

Ollama serves on `http://localhost:11434`. Keep `OLLAMA_DEBUG` off so prompts are not written to its logs.

## 3. Backend

Windows (PowerShell):

```powershell
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements.txt
pip install -r requirements-voice.txt  # optional: Moon-C's own voice (GPL-3.0 libraries)
uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-voice.txt  # optional
uvicorn app.main:app --reload --port 8000
```

Then open:

- <http://localhost:8000/docs>: interactive API (try every endpoint with **Try it out**).
- <http://localhost:8000/status>: backend, Ollama, Earth link and voice state.

The folder is `Backend` with a capital B; macOS and Linux are case sensitive.

Optional settings go in `Backend/.env` (copy `Backend/.env.example`). Every setting is listed in [backend/configuration.md](backend/configuration.md).

## 4. Front-end

In a second terminal:

```bash
cd front-end
npm install
npm run dev            # http://localhost:5173
```

To point to another backend, create `front-end/.env.local` with `VITE_API_URL=http://host:port` (see [frontend/configuration.md](frontend/configuration.md)).

## 5. Try it

The labels below are the English ones; the screen of a Spanish-speaking crew member shows them in Spanish.

1. Open <http://localhost:5173>. The top bar shows **Backend** (green) when the link works, or **No link**.
2. Open **Menu** → **Account** → pick a crew member (for example Moisés). The screen switches to his language and his live signs.
3. Write "hola", then "me duele el pecho". The second message opens the chest-pain protocol and raises an alert.
4. **Menu → Simulation (demo)**: pick a crew member and "High temperature", then **Simulate emergency**. In a few ticks the sign turns urgent and an alert banner appears.
5. Switch to the **General** account: the crew member's row shows **Open data**; opening it is recorded in the access log. **Mark emergency as handled** resolves the alerts and ends the simulated emergency.
6. **Menu → Guided maneuvers (3D) → CPR** opens the 3D guide with a manikin. Use the arrow keys to move between steps and Esc to close.
7. **Menu → Data and link with Earth** (General account only): simulate a contact with Earth, export the measurements or delete all data.

You can also chat from a terminal while the backend runs:

```bash
cd Backend
python scripts/chat.py                 # English, no crew member
python scripts/chat.py --crew moises   # as Moisés (Spanish)
python scripts/chat.py --lang es       # force Spanish
```

`/reset` clears the conversation and `/quit` exits. Each reply shows its category, language, whether the AI was used and the response time.

## 6. Tests and lint

```bash
cd Backend && python -m pytest        # backend (mocked Ollama, temporary storage)
cd front-end && npm test              # front-end (Vitest)
cd front-end && npm run lint          # ESLint
```

Both suites read `shared/router_cases.json` and `shared/language_cases.json`, so the backend router and the front-end offline detector cannot drift apart. Details: [backend/testing.md](backend/testing.md), [frontend/testing.md](frontend/testing.md).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Small talk always gets canned replies | Ollama is stopped, the model is missing (`/status` → `model_available: false`) or it is slower than the timeout. On a laptop without GPU a 4B model can take 8–16 s: set `MOON_C_OLLAMA_TIMEOUT_S=25` (or 40 for a crew member with a support profile) in `Backend/.env` |
| Each small-talk reply takes ~2 s more on Windows | Ollama is stopped and Windows takes ~2 s to refuse a local connection. The circuit breaker then skips Ollama for `MOON_C_OLLAMA_CIRCUIT_S` (10 s) |
| `405 Method Not Allowed` when opening `/chat` in the browser | The address bar only sends GET. Use `/docs`, `scripts/chat.py` or curl (`curl.exe` in PowerShell) |
| `/status` shows `voice: "unavailable"` | `pip install -r requirements-voice.txt` was not run, or the model is still a Git LFS pointer (`git lfs pull`). The detail is in the backend log |
| `/tts` answers 429 | More than `MOON_C_TTS_MAX_CONCURRENT` (2) syntheses at once. The front-end falls back to a local voice for that sentence |
| Moon-C does not speak at all | Browsers allow audio only after a click or key press; click anywhere first. Check **Menu → Audio** and that the machine has a local voice for the language |
| Dictation button disabled | The browser has no Web Speech API (use Chrome or Edge), or the microphone permission was denied |
| The front-end shows **No link** | Backend not running on `VITE_API_URL`, or the origin is not allowed by CORS (`MOON_C_CORS_ORIGINS` / `MOON_C_CORS_ORIGIN_REGEX`) |
| The backend refuses to start with a `ManualError`, `KeywordsError`, `CrewError` or `SupportError` | A file in `shared/` is invalid. The message names the field; the backend fails fast instead of giving wrong answers |
| A support profile is ignored | It needs `consent.crew_member: true` and a `crew_id` that exists in `crew.json`. The log names the file (never its content) |
| `measurements.json.corrupt-…` appeared in `Backend/storage/` | The file was unreadable at startup; it was set aside (never deleted) and an empty one was started |
