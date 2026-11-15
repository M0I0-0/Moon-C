# Moon-C documentation

> **Moon-C supports the crew on board so they can monitor their health and act in time, without waiting for Earth. Moon-C does not diagnose.**

Moon-C is an offline, on-board health companion for a space crew. A FastAPI backend routes chat messages, evaluates vital signs against a health manual, raises alerts and queues data for Earth. A React + react-three-fiber front-end shows Moon-C as a 3D character who talks, listens, shows live vital signs and guides emergency maneuvers (CPR, tourniquet, choking) step by step.

These pages document the whole repository, module by module. The existing READMEs stay where they are (they are the quick-start guides); these docs go deeper.

## Map of the docs

```
docs/
├── README.md                     ← you are here (index, reading paths, glossary)
├── architecture.md               how all the pieces fit together, data flows, online/offline modes
├── getting-started.md            install, run, test, troubleshoot
├── shared-data.md                the shared/ folder: the single source of truth read by both sides
│
├── backend/                      FastAPI service (Backend/)
│   ├── README.md                 overview, module map, startup lifecycle, conventions
│   ├── configuration.md          every MOON_C_* setting
│   ├── api-reference.md          every endpoint, with requests, responses and errors
│   ├── data-models.md            the Pydantic models (schemas.py)
│   ├── testing.md                pytest suite, fixtures, terminal chat helper
│   ├── chat/                     the conversation pipeline
│   │   ├── README.md             how a message is handled end to end, language resolution
│   │   ├── intent-router.md      intent.py + keywords.json
│   │   ├── chat-service.md       chat.py (categories, follow-up questions, replies)
│   │   ├── local-ai.md           ai.py (Ollama, canned replies, post-filter)
│   │   ├── sessions.md           sessions.py (short-lived chat context)
│   │   └── emotional-support.md  support.py + support.json + private profiles
│   ├── health/                   the clinical side
│   │   ├── manual.md             manual.py + protocols.json
│   │   ├── evaluator.md          evaluator.py (normal / attention / urgent)
│   │   ├── alerts.md             alerts.py (vital, report, maneuver alerts)
│   │   └── bracelets-and-crew.md bracelets.py (simulation) + crew.py
│   ├── data/                     persistence
│   │   ├── storage.md            storage.py + records.py, export, privacy wipe
│   │   └── earth-sync.md         sync.py (simulated link with Earth)
│   └── voice/                    Moon-C's own voice
│       ├── tts.md                voice.py + POST /tts
│       └── moonc-voz.md          the moonc_voz/ module (Piper + Praat)
│
└── frontend/                     React app (front-end/) and the 3D character (Model3D/)
    ├── README.md                 overview, stack, folder structure, online/offline modes
    ├── configuration.md          env vars, Vite aliases, ESLint, npm scripts
    ├── app.md                    App.jsx: state, accounts, languages, chat, maneuvers
    ├── data.md                   src/data (manual helpers, environments, seed announcements)
    ├── hooks.md                  every custom hook
    ├── styles.md                 index.css: theme tokens, layout, responsive rules
    ├── testing.md                Vitest suites and the shared cases
    ├── components/
    │   ├── README.md             UI components (panels, chat, menu, alerts) with their props
    │   └── scene-3d.md           Scene, MoonCModel, ModelSlot, placeholders, room backdrop
    ├── lib/
    │   ├── api-client.md         lib/api.js
    │   ├── offline-assistant.md  lib/assistant.js (emergency detector without backend)
    │   ├── i18n-and-language.md  lib/i18n.js + lib/language.js
    │   ├── alerts-and-vitals.md  lib/alerts.js + lib/vitals.js
    │   ├── maneuvers.md          lib/maneuvers.js (bridge to Model3D)
    │   └── voice.md              lib/moonVoice.js + speech input/output
    └── model3d/                  Model3D/moonc
        ├── README.md             assets, how the app loads them, standalone mount
        ├── character.md          moonc.js: body animation, face shader, states
        └── maneuvers.md          maniobras.js: environments, steps, controller API
```

## Reading paths

| If you want to… | Read, in order |
|---|---|
| Get the project running | [getting-started.md](getting-started.md) |
| Understand the big picture | [architecture.md](architecture.md) → [backend/README.md](backend/README.md) → [frontend/README.md](frontend/README.md) |
| Change what Moon-C says or detects in the chat | [backend/chat/README.md](backend/chat/README.md) → [intent-router.md](backend/chat/intent-router.md) → [chat-service.md](backend/chat/chat-service.md) → [frontend/lib/offline-assistant.md](frontend/lib/offline-assistant.md) |
| Change health ranges, protocols or indicators | [shared-data.md](shared-data.md) → [backend/health/manual.md](backend/health/manual.md) → [backend/health/evaluator.md](backend/health/evaluator.md) → [`shared/REFERENCES.md`](../shared/REFERENCES.md) |
| Work on alerts and live vital signs | [backend/health/bracelets-and-crew.md](backend/health/bracelets-and-crew.md) → [backend/health/alerts.md](backend/health/alerts.md) → [frontend/lib/alerts-and-vitals.md](frontend/lib/alerts-and-vitals.md) → [frontend/hooks.md](frontend/hooks.md) |
| Work on the 3D character or the guided maneuvers | [frontend/model3d/README.md](frontend/model3d/README.md) → [character.md](frontend/model3d/character.md) → [maneuvers.md](frontend/model3d/maneuvers.md) → [frontend/lib/maneuvers.md](frontend/lib/maneuvers.md) |
| Work on the voice | [backend/voice/moonc-voz.md](backend/voice/moonc-voz.md) → [backend/voice/tts.md](backend/voice/tts.md) → [frontend/lib/voice.md](frontend/lib/voice.md) |
| Add or translate UI text | [frontend/lib/i18n-and-language.md](frontend/lib/i18n-and-language.md) |
| Understand what is stored and what never is | [architecture.md#privacy-model](architecture.md#privacy-model) → [backend/data/storage.md](backend/data/storage.md) |

## Other documents in the repository

| File | Language | What it covers |
|---|---|---|
| [`README.md`](../README.md) | English | Project summary and the quickest way to run everything |
| [`Backend/README.md`](../Backend/README.md) | English | Backend setup, settings, API table, privacy and limitations |
| [`front-end/README.md`](../front-end/README.md) | Spanish | Front-end usage and features |
| [`front-end/public/models/README.md`](../front-end/public/models/README.md) | Spanish | Replacing the 3D model with your own `.glb`/`.stl` |
| [`moonc_voz/LEEME.md`](../moonc_voz/LEEME.md) | Spanish | The voice module (written by the voice team) |
| [`shared/REFERENCES.md`](../shared/REFERENCES.md) | English | Where every clinical range comes from, and its space context |

## Conventions you will meet in the code

- **Moon-C does not diagnose.** Replies say how a value compares with the manual and which manual steps apply. Labels or names of conditions are filtered out of AI replies (see [local-ai.md](backend/chat/local-ai.md#post-filter)).
- **Health and emergency answers come only from the manual** (`shared/protocols.json`). The local AI (Ollama) is used for small talk and listening only, and everything works without it.
- **Privacy first.** Chat text and audio are never stored or logged. Logs contain counts, states and error types only. See [architecture.md#privacy-model](architecture.md#privacy-model).
- **`supuesto: validar con experto médico`** ("assumption: validate with a medical expert") marks clinical wording that still needs review. In the maneuvers each step carries `estado: 'validado' | 'supuesto'`.
- **Two languages, English and Spanish**, everywhere. Moon-C replies in the language of each message; see [architecture.md#languages](architecture.md#languages).
- **Code language.** The backend is written in English. Front-end identifiers are English, but most comments and test names are Spanish. `Model3D/` and `moonc_voz/` use Spanish identifiers (see the glossary below).
- **Product name.** The companion is called Moon-C (she). Old comments may still say "Laika", the previous name. Environment variables use the prefix `MOON_C_` and loggers are named `moon_c`.

## Glossary of Spanish identifiers

| Term in code | Meaning |
|---|---|
| `maniobra`, `maniobras` | Guided emergency maneuver(s) |
| `rcp` / `RCP` | CPR (cardiopulmonary resuscitation) |
| `torniquete` | Tourniquet |
| `atragantamiento` | Choking |
| `paso`, `pasos` | Step(s) of a maneuver |
| `entorno` | Maneuver environment: `iss`, `transito` (transit to Mars), `luna` (Moon), `marte` (Mars), `tierra` (Earth) |
| `maniquí` (`maniqui_*.glb`) | Training manikin shown next to Moon-C |
| `conteo`, `tiempo`, `espera` | Step modes: counted (compressions), timed, wait for the user |
| `atajos` | Shortcut buttons inside a guide ("The AED arrived") |
| `soloManos` | Hands-only CPR (compressions without ventilations) |
| `paqueteTierra` | "Report for Earth" package produced by a guide |
| `DEA` | AED (automated external defibrillator) |
| `CMRS` | Crew Medical Restraint System (the medical stretcher on a station) |
| `validado` / `supuesto` | Step taken from the cited source / assumption to verify |
| `fuente`, `FUENTES` | Cited source of a step |
| `bitácora` | The chat log at the bottom of the screen |
| `cuenta General` | The shared "General" account (crew overview, announcements) |
| `tripulante` | Crew member |
| `pulsera` | Bracelet (simulated wearable that identifies a crew member) |
| `anuncios` | Announcements |
| `voz`, `frases`, `ajustes` | Voice, phrases, settings (voice module) |
| `tono_hz`, `formante`, `entonacion` | Pitch, formant (timbre), intonation (voice settings) |
| Character states | `tranquila` (calm), `atenta` (attentive), `alerta` (alert), `escuchando` (listening), `pensando` (thinking), `hablando` (talking), `sin_enlace` (no link), `saludo` (greeting) |

---

Last reviewed against the code on 2026-11-15 (branch `feature/language-merge`).
