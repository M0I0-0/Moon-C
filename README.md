# Moon-C

> **Moon-C supports the crew on board so they can monitor their health and act in time, without waiting for Earth. Moon-C does not diagnose.**

Priorities: 1) support and guide the crew member, 2) alert the crew and the on-board medical officer, 3) send data to Earth in the background when a link is available, never blocking anything.

Everything runs offline on one machine. Ranges and protocols are **EXAMPLE VALUES – must be validated by medical experts.**

## Repository

| Folder | What it is | Docs |
|---|---|---|
| `Backend/` | FastAPI service: chat router, health manual, simulated bracelets, alerts, storage, Earth sync | [Backend/README.md](Backend/README.md) |
| `front-end/` | React + Vite + react-three-fiber app with the 3D Moon-C assistant | [front-end/README.md](front-end/README.md) |
| `Model3D/` | Moon-C character (rigged GLB, face shader) and the guided maneuvers | — |
| `shared/` | Single source of truth read by backend and front-end: `protocols.json` (manual), `keywords.json`, `crew.json`, `router_cases.json` (test cases both sides must agree on) | — |

## Run everything

You need Python 3.11+, Node 20+ and [Ollama](https://ollama.com/download). Ollama is optional: without it, small talk uses canned replies.

```bash
# 1. Local AI for small talk (once)
ollama pull qwen3.5:4b

# 2. Backend -> http://localhost:8000/docs
cd Backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Front-end -> http://localhost:5173 (second terminal)
cd front-end
npm install
npm run dev
```

On a slow laptop, put `MOON_C_OLLAMA_TIMEOUT_S=25` in `Backend/.env` so the model has time to answer. See [Backend/README.md](Backend/README.md) for every setting.

## How the pieces connect

- **Chat:** the front-end sends each message to `POST /chat` in the crew member's language. Emergencies and health questions are answered from the manual, and only small talk uses the local AI. Without the backend, the front-end still detects emergencies with the same keywords.
- **Vital signs and alerts:** simulated bracelets in the backend produce the live signs (`/vitals`). Urgent values, emergencies detected in the chat and opened 3D maneuver guides raise on-board alerts (`/alerts`), and every screen sees the same ones.
- **Maneuvers:** opening a guide alerts the medical officer. The "Report to Earth" step stores the summary, which is queued for the next contact with Earth (`/sync`).
- **Privacy:** chat text and audio are never stored or logged. Only measurements and safety records (maneuver reports, access log, announcements) are stored, in `Backend/storage/`. That folder is gitignored, but OneDrive will still sync it if the repo lives there.

## Tests

```bash
cd Backend && python -m pytest      # backend
cd front-end && npm test            # front-end (Vitest)
```

Both suites read `shared/router_cases.json`, so the backend router and the front-end offline emergency detector can't drift apart.
