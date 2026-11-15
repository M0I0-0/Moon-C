# Moon-C

> **Moon-C supports the crew on board so they can monitor their health and act in time, without waiting for Earth. Moon-C does not diagnose.**

Priorities: 1) support and guide the crew member, 2) alert the crew and the on-board medical officer, 3) send data to Earth in the background when a link is available, never blocking anything.

Everything runs offline on one machine. The ranges come from published clinical guidelines (NEWS2, AHA/ACC, WHO, AASM/SRS) and NASA standards, adjusted for spaceflight; sources and space context are in [shared/REFERENCES.md](shared/REFERENCES.md). They **must still be validated by medical experts**, and the protocol steps are illustrative.

## Repository

| Folder | What it is | Docs |
|---|---|---|
| `Backend/` | FastAPI service: chat router, health manual, simulated bracelets, alerts, storage, Earth sync | [Backend/README.md](Backend/README.md) |
| `front-end/` | React + Vite + react-three-fiber app with the 3D Moon-C assistant | [front-end/README.md](front-end/README.md) |
| `Model3D/` | Moon-C character (rigged GLB, face shader) and the guided maneuvers | — |
| `moonc_voz/` | Moon-C's own offline voice: Piper `es_MX-claude-high` + Praat. The model is stored with Git LFS | [moonc_voz/LEEME.md](moonc_voz/LEEME.md) |
| `shared/` | Single source of truth read by backend and front-end: `protocols.json` (manual), `keywords.json`, `crew.json`, `router_cases.json` (test cases both sides must agree on) | [shared/REFERENCES.md](shared/REFERENCES.md) (where every range comes from) |

## Run everything

You need Python 3.11+, Node 20+ and [Ollama](https://ollama.com/download). Ollama is optional: without it, small talk uses canned replies.

```bash
# 1. Local AI for small talk (once)
ollama pull qwen3.5:4b

# 2. Backend -> http://localhost:8000/docs
git lfs pull                      # Moon-C's voice model (63 MB, Git LFS)
cd Backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-voice.txt   # optional: Moon-C's own voice (GPL-3.0 libraries)
uvicorn app.main:app --reload --port 8000

# 3. Front-end -> http://localhost:5173 (second terminal)
cd front-end
npm install
npm run dev
```

On a slow laptop, put `MOON_C_OLLAMA_TIMEOUT_S=25` in `Backend/.env` so the model has time to answer. See [Backend/README.md](Backend/README.md) for every setting.

## How the pieces connect

- **Chat:** the front-end sends each message to `POST /chat` in the crew member's language. Emergencies and health questions are answered from the manual, and only small talk uses the local AI. Without the backend, the front-end still detects emergencies with the same keywords.
- **Language:** Moon-C replies in the language you write or speak in, on every account. The screen is in each crew member's language (by nationality); the General account's screen follows its conversation and has an ES/EN switch. Alerts are shown in the language of the account. See [Backend/README.md](Backend/README.md#language).
- **Vital signs and alerts:** simulated bracelets in the backend produce the live signs (`/vitals`). Urgent values, emergencies detected in the chat and opened 3D maneuver guides raise on-board alerts (`/alerts`), and every screen sees the same ones.
- **Maneuvers:** opening a guide alerts the medical officer. The "Report to Earth" step stores the summary, which is queued for the next contact with Earth (`/sync`).
- **Emotional support:** Moon-C recognizes key mental-health moments (stress, a mistake, missing home, low mood…) and answers them with care. Thoughts of self-harm open a crisis protocol and alert the medical officer. A crew member can have a private support profile built from questionnaires (today, Rubén): Moon-C and the local AI then answer in the way that works for that person. Profiles stay out of git; see [Backend/README.md](Backend/README.md#emotional-support-and-personal-profiles).
- **Voice:** Spanish replies are spoken with Moon-C's own offline voice (`POST /tts`). The front-end requests it sentence by sentence, so it starts talking right away, and moves her mouth with the real volume of the audio. English replies, or a backend without the voice installed, fall back to a voice installed on the machine (or subtitles if there is none for that language).
- **Privacy:** chat text and audio are never stored or logged. Only measurements and safety records (maneuver reports, access log, announcements) are stored, in `Backend/storage/`. That folder is gitignored, but OneDrive will still sync it if the repo lives there.

## Use of AI

We used AI tools (Claude and Claude Code) to help write code, tests and documentation, and to gather the published documents behind the reference ranges. Inside the product, Moon-C uses AI only for small talk (a local Ollama model, never for health answers) and for her voice (Piper neural text-to-speech). Moon-C's face texture was generated with AI. Every AI-generated element is marked with a visible watermark, an "AI" tag or metadata: see [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## Tests

```bash
cd Backend && python -m pytest      # backend
cd front-end && npm test            # front-end (Vitest)
```

Both suites read `shared/router_cases.json`, so the backend router and the front-end offline emergency detector can't drift apart.
