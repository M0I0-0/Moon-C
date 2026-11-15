# Front-end overview

The front-end (`front-end/`) is the screen of Moon-C: a 3D Moon-C in a living room, a chat log with text and voice input, live vital signs, alerts, announcements and step-by-step 3D guides for emergency maneuvers. It works with the backend and, in a reduced way, without it.

Stack:

| Package | Version | Use |
|---|---|---|
| React / React DOM | 19 | UI |
| Vite + `@vitejs/plugin-react` | 6 / 4 | Dev server and build |
| three | 0.170 | 3D engine |
| `@react-three/fiber` | 9 | React renderer for three.js |
| `@react-three/drei` | 10 | `OrbitControls`, `useGLTF`, `useAnimations` |
| Vitest | 3 | Tests |
| ESLint | 9 (+ react-hooks, react-refresh) | Lint |

There is no router, no state library and no CSS framework: one page, React state and hooks, and one stylesheet.

## Folder structure

```
front-end/
├── index.html              root element, title, theme color
├── vite.config.js          aliases @shared and @model3d, dev server limited to front-end/, ../shared, ../Model3D
├── eslint.config.js
├── package.json            scripts: dev, build, lint, test, preview
├── .env.example            VITE_API_URL and 3D model overrides
├── public/
│   ├── favicon.svg
│   └── models/README.md    how to use your own .glb/.stl
└── src/
    ├── main.jsx            createRoot + StrictMode
    ├── App.jsx             the orchestrator: state, accounts, languages, chat, maneuvers, timers
    ├── config.js           API_URL, 3D model overrides, speech language codes
    ├── index.css           all styles
    ├── components/         UI panels and the 3D scene
    ├── hooks/              data sources (backend or local), speech, localStorage
    ├── lib/                API client, offline assistant, i18n, alerts, vitals, maneuvers, voice, 3D helpers
    └── data/               manual helpers (reads ../shared), environments, seed announcements
```

## Documentation of each part

| Part | Page |
|---|---|
| Settings, Vite, ESLint, scripts | [configuration.md](configuration.md) |
| `App.jsx` | [app.md](app.md) |
| `src/data/` | [data.md](data.md) |
| `src/hooks/` | [hooks.md](hooks.md) |
| UI components | [components/README.md](components/README.md) |
| 3D scene components and helpers | [components/scene-3d.md](components/scene-3d.md) |
| `lib/api.js` | [lib/api-client.md](lib/api-client.md) |
| `lib/assistant.js` | [lib/offline-assistant.md](lib/offline-assistant.md) |
| `lib/i18n.js`, `lib/language.js` | [lib/i18n-and-language.md](lib/i18n-and-language.md) |
| `lib/alerts.js`, `lib/vitals.js` | [lib/alerts-and-vitals.md](lib/alerts-and-vitals.md) |
| `lib/maneuvers.js` | [lib/maneuvers.md](lib/maneuvers.md) |
| `lib/moonVoice.js`, speech hooks | [lib/voice.md](lib/voice.md) |
| `index.css` | [styles.md](styles.md) |
| Tests | [testing.md](testing.md) |
| `Model3D/` (character and maneuvers) | [model3d/README.md](model3d/README.md), [character.md](model3d/character.md), [maneuvers.md](model3d/maneuvers.md) |

## Screen layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar: Menu · Moon-C · account · ES/EN · Backend · Earth · Voice · UTC  │
│ AlertBanner (only with unacknowledged alerts)                            │
├───────────────┬──────────────────────────────────────┬───────────────────┤
│ Left panel    │                                      │ Right panel       │
│ Announcements │        Scene (full background):      │ General: Crew     │
│ or            │        Moon-C in the living room,    │  overview or      │
│ ManeuverPanel │        manikin during a guide        │  EmergencyDetail  │
│ (during a     │                                      │ Crew: VitalsPanel │
│  3D guide)    │                                      │  ("My vitals")    │
├───────────────┴──────────────────────────────────────┴───────────────────┤
│ Subtitles (when shown) + ChatDock: log, quick replies, mic, input, send  │
└──────────────────────────────────────────────────────────────────────────┘
  Overlays: MenuDrawer (left), VitalDetail (dialog)
```

On narrow screens (≤ 960 px) the side panels become tabs in the top bar ([styles.md](styles.md#responsive-rules)).

## How data flows inside the app

- `App.jsx` owns the state and passes it down as props. There is no context provider.
- **Data sources** are hooks with the same interface on both sides of the link: `useRemoteCrew` (backend) and `useCrewSimulation` (browser) both return `{members, alerts, activeAlerts, inEmergency, triggerEmergency, reportFromChat, acknowledge, resolve}`. `App` picks the remote one when the backend is online and its simulation is running ([hooks.md](hooks.md)).
- **Every backend call** goes through `src/lib/api.js` ([api-client.md](lib/api-client.md)).
- The **manual, keywords and crew** come straight from `../shared` through the `@shared` alias; the **3D character and the maneuver logic** from `../Model3D` through `@model3d`.

## Accounts

| Account | Screen language | Right panel | Can |
|---|---|---|---|
| `general` | Follows its conversation; ES/EN switch | Crew overview; a crew member's data only during their emergency (logged) | Post announcements, log readings for anyone (or unassigned), confirm unassigned readings, Earth sync, export, wipe |
| A crew member | Their `preferredLanguage` | Their own vital signs | Chat as themselves, log their own readings |

The current account, voice on/off, subtitle mode and the General account's language are remembered in `localStorage` (`moonc.account`, `moonc.voice`, `moonc.subtitles`, `moonc.generalLang`). An invalid stored account falls back to General.

## Online and offline

`useBackendStatus` checks `GET /status` every 20 s. Without the backend the chat answers emergencies only (same keywords and manual), vital signs are simulated in the browser, announcements stay on this screen and data features are hidden. The full table is in [architecture.md](../architecture.md#online-and-offline-modes).

## Scripts

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the build
npm test          # vitest run
npm run lint      # eslint .
```

The dev server only serves `front-end/`, `../shared` and `../Model3D` (never `Backend/storage`). See [configuration.md](configuration.md).
