# `App.jsx`: the orchestrator

Source: [`front-end/src/App.jsx`](../../front-end/src/App.jsx).

`App` owns the application state and wires everything together: accounts, languages, the chat, speech, alerts, the 3D guides and the privacy timers. Components receive data and callbacks as props.

## Identity of a chat session

```js
const DEVICE_ID = crypto.randomUUID()…  // 12 alphanumeric characters, new on every page load
const sessionFor = (accountId) => `${DEVICE_ID}-${accountId}`
```

Each page load is its own chat session per account: context is never shared between tablets.

## State

| State | Kind | Purpose |
|---|---|---|
| `storedAccount` | `localStorage` `moonc.account` (default `general`) | Current account; an invalid value falls back to `general` |
| `voiceOn` | `localStorage` `moonc.voice` (`true`) | Read replies aloud |
| `subtitleMode` | `localStorage` `moonc.subtitles` (`auto`) | `auto`, `on`, `off` |
| `generalLang` | `localStorage` `moonc.generalLang` (`es`) | Language chosen with the General account's ES/EN switch |
| `talkLang` | memory, per account | Language of the last reply in the conversation |
| `logs`, `suggestions` | memory, per account | Chat log entries and quick-reply chips |
| `caption` | memory | The subtitle being shown `{id, speaker, text, kind, silent?, cut?}` |
| `busy` | memory | Waiting for a reply |
| `menuOpen`, `mobilePanel` | memory | Drawer and mobile tab (`left`/`right`) |
| `emergencyView`, `accessLog`, `vitalDetail` | memory | General account's emergency view, access times per crew member, the open vital detail |
| `greeting` | memory | Moon-C greets for 2.2 s on load and on account switch |
| `maneuver`, `mstate`, `autoGuide` | memory | Open 3D guide `{id, entorno, nonce}`, its progress `{index, paso, pasos, conteo, total, tiempo, soloManos, report}`, and whether it opened by itself |

Refs keep values that callbacks need without re-rendering: `epochRef` (bumped on account switch or inactivity reset, to drop replies still in flight), `mctl` (the maneuver controller from Model3D), `mouthRef` (mouth level from the voice), `spoken` (steps already read aloud), `lastActivity`, and others.

## Languages

```js
const accountLang = account?.preferredLanguage ?? baseLang(generalLang)  // crew: by profile; General: ES/EN switch
const convLang    = talkLang[accountId] ?? accountLang                   // conversation: last reply's language
const lang        = isGeneral ? convLang : accountLang                   // the screen
const speechLang  = speechLangFor(convLang)                              // es-MX / en-US for dictation and voices
```

- A crew member's **screen** stays in their language; Moon-C still **answers** in the language of each message.
- The General account's screen follows its conversation. `chooseGeneralLang(l)` sets the switch and forgets the General conversation's language, so screen and conversation change together.
- `document.documentElement.lang` and `document.title` follow `lang`.

## Data sources

```js
const backend    = useBackendStatus()                       // GET /status every 20 s
const localCrew  = useCrewSimulation()                      // always running, cheap
const remoteCrew = useRemoteCrew(backend.online, lang)      // GET /vitals + /alerts every 2.5 s
const sim        = backend.online && remoteCrew.ready ? remoteCrew : localCrew
const board      = useAnnouncements(backend.online)
const earth      = useSyncStatus(backend.online)
```

Moon-C's own voice is used when `backend.online && backend.info.voice === 'ready'`: `useSpeechOutput(speechLang, { moonVoice, onMouth })` ([lib/voice.md](lib/voice.md)).

## Speaking and subtitles: `say(text, speaker, spokenLang, kind)`

`kind` is `reply`, `alert` or `announcement` (announcements do not move Moon-C's mouth).

1. A text is **speakable** if the voice is on, speakers are not known to be missing, and there is a voice for `spokenLang` (Moon-C's for Spanish, or a local one).
2. The caption is set; `silent: true` when it cannot be spoken.
3. If speakable, `tts.speak(text, { lang, onEnd, onPartial })`. If Moon-C's voice stops halfway (`onPartial`), the full text is shown even in automatic subtitle mode (`cut: true`).
4. The caption clears after `max(4 s, 420 ms × words)` (twice that when spoken).

Subtitles are shown when `subtitleMode === 'on'`, or `auto` without audio, or for a cut voice, or for a silent text unless subtitles are `off`.

## Sending a message: `send(message)`

1. Log the user's entry and clear the chips.
2. **Guide by name.** If `explicitManeuver(message)` finds "RCP", "CPR", "torniquete", "atragantamiento", "Heimlich"…, log "Opening the 3D guide: …" and `startManeuver()`; no backend call.
3. `msgLang = detectLanguage(message) ?? convLang`.
4. **Backend** (if online): `askBackend({message, crewId, sessionId: sessionFor(account), language: msgLang})`. A failure marks the backend offline.
5. If the account changed meanwhile (`epochRef`), drop the reply.
6. **Offline** fallback: after 350 ms, `askLocal({message, language: msgLang})` (emergencies only).
7. Log Moon-C's entry with `protocol`, `category`, `via` (`backend`/`local`), `aiUsed` (the reply was written by the local AI: the log shows an "AI" tag) and a suggested guide (`suggestedManeuver`) shown as a button.
8. Store the chips and the reply language (`talkLang`).
9. **Auto-open a guide** only with unambiguous words (`autoOpenManeuver`, [lib/maneuvers.md](lib/maneuvers.md)) and if no guide is open: start it (`auto: {reply, lang}`), speak only the emergency intro (`replyIntro`); the guide then reads its steps. Otherwise speak the whole reply.
10. An emergency of a crew account also calls `sim.reportFromChat()` (only the local simulation records it; the backend already raised the alert).

Dictation (`useSpeechInput(speechLang, send)`) calls `send` with the final transcript.

## Guided maneuvers

| Function | What it does |
|---|---|
| `startManeuver(id, entorno?, {notify = true, resume = false, auto = null})` | Opens a guide. Default environment: `ENV_TO_MANEUVER[envId]` (the app always uses the `home` room → `tierra`). Closes the menu and mobile panels. With `notify` and a backend, calls `POST /maneuvers/start` (alerts the crew) and refreshes the crew data. `resume` re-mounts the manikin keeping the current step (environment change) |
| `stopManeuver()` | Closes the guide and clears its state |
| `sendManeuverReport()` | On the "Report to Earth" step: takes `mctl.current.paqueteTierra()`, converts it with `toReportSummary()` and calls `POST /maneuvers/reports`. `mstate.report.status` becomes `sending`, `queued`/`synced`, `offline` or `error` |

The 3D model reports progress through `onManeuverEvent`:

| Event | Handling |
|---|---|
| `onPaso(index, paso, pasos)` | Update progress; read each step aloud **once** (`"<title>. <text>"`). On the report step without backend, read "the summary was not saved" instead of claiming it was sent. Trigger `sendManeuverReport()` once |
| `onConteo(n, total)` | Compression / blow count |
| `onTiempo(s)` | Seconds left in a timed step |
| `onReady(controller)` | The manikin is loaded. After an environment change, restore the step and the hands-only option |
| `onError()` | The guide could not load: close it, speak the full reply if the guide had opened by itself, and log "The 3D guide could not be opened…" |

If a guide opened by itself and the 3D model has not loaded after **8 s**, Moon-C reads the full chat reply instead and the panel shows it (`autoGuide.slow`).

Environment changes inside the guide try `mctl.current.cambiarEntorno(entorno)` first (no re-mount); if that is not possible, the guide is restarted with `resume: true`.

## Privacy timers

- **Inactivity.** Every 30 s: if the current account has a real conversation and nothing happened for 10 minutes (`CHAT_TTL_MS`, the same as the backend), the log is replaced with "Conversation cleared after 10 min of inactivity" and `POST /session/reset` is sent. An open guide counts as activity.
- **Account switch** (`switchAccount`): closes emergency and detail views, drops what was in flight (`dropContext`: bumps the epoch, cancels speech, closes the guide, forgets the conversation language), deletes the previous account's log, calls `POST /session/reset` for it and, for a crew member, `POST /identify` with their bracelet (fresh backend context). Logs "Session started · <name>" in the new account's language.

## Alerts

- **Announcing.** Each new alert id is announced once (voice and/or subtitle, speaker "Alert"), to the General account and to the affected crew member's account, in the screen language ([lib/alerts-and-vitals.md](lib/alerts-and-vitals.md)).
- `visibleAlerts`: all alerts for General; own alerts for a crew member. They feed the `AlertBanner`.
- `openEmergency(crewId)` (General): opens the emergency view and, the first time, records `POST /access-log` with the alert id as the reason (the time shown comes from the backend's entry).
- `resolveEmergency(crewId)`: `sim.resolve(crewId)` (resolve alerts and end the simulated emergency), close the view, forget the access time.
- `VitalDetail` opens only if allowed: own data for a crew member, or a crew member **in emergency** for General.

## Moon-C's mood

The 3D character's state is derived every render, in this priority:

| Condition | `mood` |
|---|---|
| Microphone listening | `escuchando` |
| Waiting for a reply | `pensando` |
| Speaking or showing a caption (not an announcement) | `hablando` |
| The account's worst sign is urgent (crew), or any active alert (General) | `alerta` |
| Backend checked and unreachable | `sin_enlace` |
| First 2.2 s after load or account switch | `saludo` |
| Otherwise | `atenta` |

## Quick replies

When the log is empty, the chips are starters: for General `QUICK_GENERAL` ("How do I measure oxygen saturation?", "Medical emergency", "Hello, Moon-C"), for a crew member `QUICK_CREW` ("How do I measure my temperature?", "I feel weird", "I barely slept"). After a reply, the chips are the reply's `suggestions`.

## Render tree

```
<div class="app env-home">
  <Scene/>                       3D background (Moon-C, manikin)
  <TopBar/>
  <AiMark/>                      visible AI watermark (always shown)
  <AlertBanner/>
  <aside class="panel panel-left">   ManeuverPanel (guide open) | Announcements
  <aside class="panel panel-right">  General: EmergencyDetail | CrewOverview — Crew: VitalsPanel
  <div class="bottom">               Subtitles (if shown) + ChatDock
  <VitalDetail/>                 (if allowed)
  <MenuDrawer/>
</div>
```

Props of each component: [components/README.md](components/README.md).
