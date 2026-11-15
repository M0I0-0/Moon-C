# Hooks (`src/hooks/`)

| Hook | File | Purpose |
|---|---|---|
| [`useBackendStatus`](#usebackendstatus) | `useBackendStatus.js` | Is the backend reachable? |
| [`useRemoteCrew`](#useremotecrew) | `useRemoteCrew.js` | Live signs and alerts from the backend |
| [`useCrewSimulation`](#usecrewsimulation) | `useCrewSimulation.js` | Live signs and alerts simulated in the browser |
| [`useAnnouncements`](#useannouncements) | `useAnnouncements.js` | Announcements, backend or local |
| [`useSyncStatus`](#usesyncstatus) | `useSyncStatus.js` | Earth link queue |
| [`useSpeechOutput`, `useSpeechInput`](#usespeechoutput-and-usespeechinput) | `useSpeech.js` | Voice output and dictation |
| [`useLocalStorage`](#uselocalstorage) | `useLocalStorage.js` | State persisted in `localStorage` |

## `useBackendStatus()`

Calls `checkBackend()` (`GET /status`, 5 s timeout) on mount and every **20 s**.

Returns `{ online, checked, info, refresh, markOffline }`:

- `online`: the last check succeeded; `checked`: at least one check finished (so the UI can tell "checking" from "no link");
- `info`: the `/status` body (`voice`, `voice_languages`, `ollama_reachable`…), or `null`;
- `markOffline()`: called by `App.send` when `/chat` fails, so the next message goes to the offline assistant right away.

## `useRemoteCrew`

`useRemoteCrew(enabled, language = 'es')`: live signs and alerts from the backend's simulated bracelets: **one source for every screen**. While `enabled` (the backend is online) it polls every **2.5 s**:

```js
const [vitals, alerts] = await Promise.all([api.vitals(), api.alerts({ language })])
```

- `/alerts` is requested with `include_acknowledged=true` and the screen language, so every alert already has its `message` in the right language.
- Data is converted with `membersFromVitals()` and `alertFromBackend()` ([lib/alerts-and-vitals.md](lib/alerts-and-vitals.md)); alerts are reversed to oldest first, like the local simulation.
- `ready` is `false` when the request fails **or `/vitals` is empty** (simulation off): `App` then uses `useCrewSimulation`.

Returns the same interface as `useCrewSimulation`, plus `ready` and `refresh`:

| Member | Behavior |
|---|---|
| `members` | `{ [crew_id]: member }` ([member shape](data.md#the-member-shape)) |
| `alerts`, `activeAlerts` | All alerts / those not resolved |
| `inEmergency(crewId)` | The crew member has an active alert |
| `triggerEmergency(crewId, scenario)` | `POST /simulation/emergency`, then refresh |
| `acknowledge(id)` | Optimistic update, `POST /alerts/{id}/ack`, refresh |
| `resolve(crewId?)` | Optimistic update, then `POST /alerts/resolve` **and** `POST /simulation/reset` for that crew member (or everyone), refresh |
| `reportFromChat()` | No-op: the backend already raises the alert when the chat detects an emergency |
| `refresh()` | Poll now (used after starting a maneuver or changing data) |

## `useCrewSimulation()`

The offline twin of the backend simulation (`Backend/app/bracelets.py`), running in a `useReducer` with a tick every **2.5 s**. Same baselines, noise, limits, pull (0.22), 40 live readings and 14 days of sleep and mood.

| Constant | Content |
|---|---|
| `BASELINE` | Per crew member, the same values as the backend |
| `EMERGENCY_TYPES` (exported) | The same five scenario ids and targets as the backend: `low_oxygen`, `high_heart_rate`, `high_temperature`, `high_blood_pressure`, `solar_storm` |
| `SIM`, `DAILY` | Noise, limits and decimals per indicator |

Differences from the backend:

- an alert is created whenever an indicator is urgent and there is no open alert for that crew member and indicator (no "stable for 3 ticks" rule, no storage);
- `reportFromChat(crewId, text, protocol)` adds a `report` alert (the backend is not there to do it);
- alert texts are built on the screen ([lib/alerts-and-vitals.md](lib/alerts-and-vitals.md)).

Actions: `triggerEmergency(crewId, kind)`, `reportFromChat(crewId, text, protocol)`, `acknowledge(id)`, `resolve(crewId?)` (ends the scenario and resolves the alerts of one crew member, or everyone).

The scenario ids must match the backend: `src/lib/vitals.test.js` and `Backend/tests/test_bracelets.py` check it.

## `useAnnouncements`

`useAnnouncements(online)`:

- With the backend: `GET /announcements` on mount and every **30 s**; `post({text, priority, author = 'General'})` calls `POST /announcements` and refreshes. Every screen sees the same list.
- Without the backend (or if the request fails): starts from `SEED_ANNOUNCEMENTS` and new posts stay on this screen only (`id: local-<time>`).

Returns `{ items, post }`.

## `useSyncStatus`

`useSyncStatus(online)`: while online, `GET /sync/status` on mount and every **20 s**. Returns `{ status, refresh }`; `status` is `null` when offline. The top bar shows "Earth · N to send" (`pending + pending_reports`), and the General account's data section shows the details.

## `useSpeechOutput` and `useSpeechInput`

Details in [lib/voice.md](lib/voice.md).

`useSpeechOutput(lang, { moonVoice = false, onMouth })` returns:

| Member | Meaning |
|---|---|
| `speak(text, { lang, onEnd, onPartial })` | Speak with Moon-C's voice (Spanish, backend ready) or a local browser voice. `onEnd` always runs once, also when interrupted; `onPartial` if Moon-C's voice stopped halfway |
| `cancel()` | Stop everything |
| `canSpeak(lang)` | There is a voice for that language |
| `supported`, `hasVoices` | There is some voice / a voice for the current language |
| `hasSpeakers` | `true`/`false` if the browser lists audio outputs, `null` if it cannot tell |
| `speaking` | Audio is playing |
| `moonVoice` | Moon-C's voice is in use |

`useSpeechInput(lang, onFinal)` returns `{ supported, listening, interim, error, start, stop, clearError }`: browser dictation (`SpeechRecognition`), one utterance at a time, with interim text and localized error messages.

Also exported: `pickVoice(voices, lang)` (local voices only) and `recognitionError(code, lang)`.

## `useLocalStorage`

`useLocalStorage(key, initial)`: `useState` backed by `localStorage` (JSON). Reading and writing are wrapped in `try`, so a private window or blocked storage just falls back to the initial value. Keys used by the app: `moonc.account`, `moonc.voice`, `moonc.subtitles`, `moonc.generalLang`.
