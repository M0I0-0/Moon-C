# UI components (`src/components/`)

Every component is a function component that receives data and callbacks from `App.jsx` ([app.md](../app.md)) and a `lang` prop (`'es'` by default) for its fixed texts, looked up with `tr(lang, key)` ([i18n-and-language.md](../lib/i18n-and-language.md)). Texts that come from the backend, the manual or Model3D already carry their own language. Styles: [styles.md](../styles.md).

The 3D components (`Scene`, `MoonCModel`, `ModelSlot`, `DoctorPlaceholder`, `PlaceholderModel`, `Backdrops`) are documented in [scene-3d.md](scene-3d.md).

| Component | Where on screen | Shown to |
|---|---|---|
| [`TopBar`](#topbar) (+ `LanguageSwitch`) | Top | Everyone |
| [`AiMark`](#aimark) | Top center, over the 3D scene | Everyone, always |
| [`AlertBanner`](#alertbanner) | Under the top bar | Account with unacknowledged visible alerts |
| [`Announcements`](#announcements) | Left panel | Everyone (posting: General) |
| [`ManeuverPanel`](#maneuverpanel) | Left panel, replaces announcements | While a 3D guide is open |
| [`CrewOverview`](#crewoverview-and-emergencydetail) | Right panel | General |
| [`EmergencyDetail`](#crewoverview-and-emergencydetail) | Right panel | General, during a crew member's emergency |
| [`VitalsPanel`](#vitalspanel) | Right panel | Crew account (own data), inside `EmergencyDetail` |
| [`VitalDetail`](#vitaldetail) (+ `Sparkline`) | Dialog | Own data, or General during an emergency |
| [`ChatDock`](#chatdock) | Bottom | Everyone |
| [`Subtitles`](#subtitles) | Above the chat | When subtitles are shown |
| [`MenuDrawer`](#menudrawer) (+ `MeasurementEntry`, `DataSection`) | Left drawer | Everyone (data section: General) |
| [`Icons`](#icons) | — | — |

## `TopBar`

`TopBar({ env, account, backendOnline, earth, audioAvailable, showSubs, onMenu, mobilePanel, setMobilePanel, isGeneral, lang, onLanguage })`

- **Menu** button, the brand "Moon-C" with the environment name and place (see the known issue in [data.md](../data.md#environmentsjs)).
- Pills: the account (initials avatar, or "GE"), the language, **Backend** / **No link**, **Earth** with "· N to send" (`earth.pending + earth.pending_reports`; tooltip with the link state), the audio mode (Voice, Voice + subs or Subtitles) and a UTC clock that ticks every second.
- **Mobile tabs** (narrow screens): "Announcements" and "Crew" / "My vitals" toggle `mobilePanel` between `left`, `right` and `null`.

`LanguageSwitch({ lang, account, onChange, className })` (exported): for a crew account a read-only pill with the language (tooltip: the screen follows the profile, Moon-C replies in the language you write in); for General an ES/EN radio group. Also used in the menu.

## `AiMark`

`AiMark({ lang })`: the visible AI watermark required by the NASA Space Apps rules ([`AI_DISCLOSURE.md`](../../../AI_DISCLOSURE.md)). A small pill over the 3D scene, under the top bar, always shown, so every screenshot or video of the app carries it: "Generado con IA: cara y voz de Moon-C" / "AI-generated: Moon-C's face and voice". Its tooltip explains that the face texture was generated with AI, that her own voice is a synthesized neural voice (Piper), and that replies marked AI in the log are written by the local AI. An alert banner or an open mobile panel may cover it for a moment.

## `AlertBanner`

`AlertBanner({ alerts, isGeneral, onOpen, onAck, lang })` renders nothing without unacknowledged alerts. Otherwise it shows the **newest** one (`alertText(a, lang)`), a line saying who was notified ("The medical officer has been notified." for General, "Tell a crewmate. The General account has been notified." for a crew member) plus "· N more alerts", **View data** (General → `onOpen(crewId)`) and **Acknowledge** (`onAck(id)`). `role="alert"`.

## `Announcements`

`Announcements({ items, canPost, onPost, limit, lang })`

- General (`canPost`): a form with a 280-character textarea, **Important** and **Read aloud** checkboxes and **Post** → `onPost({text, priority, readAloud})`. `App` posts it and, if asked, reads it with a voice of the language it is written in.
- The list shows author, time and text exactly as written; important ones are highlighted. Crew accounts see the latest 3 (`limit`).

## `ManeuverPanel`

`ManeuverPanel({ id, entorno, state, ctrlRef, onEnv, onSoloManos, onClose, lang, notice })` drives a 3D guide ([lib/maneuvers.md](../lib/maneuvers.md), [model3d/maneuvers.md](../model3d/maneuvers.md)).

- Header: "3D guide" and the maneuver title; close button.
- **Environment** select (`ENTORNOS`: station, transit to Mars, Moon, Mars, Earth) → `onEnv(entorno)`.
- Auto-open notice: "Moon-C opened this guide because you described an emergency. If it is not what you need, close it (Esc)." If the model is slow, the chat reply is shown meanwhile.
- While loading: "Preparing the mannequin…".
- Progress dots, "Step n of total", step title and text, optional illustration (`paso.imagen`), a big counter for counted steps (`conteo / total`) or a countdown for timed steps, the step's state badge (`validated` / `assumption`) and its cited source.
- **Previous** / **Next** (`ctrl.anterior()` / `ctrl.siguiente()`); CPR adds **Finish and report** (`ctrl.ir('reporte')`); shortcut chips (`ctrl.atajos`, e.g. "The AED arrived").
- CPR: **Compressions only (no breaths)** checkbox → `onSoloManos`.
- **Summary for Earth** toggles a preformatted view of `ctrl.paqueteTierra()` (title, environment, delay, duration, compressions, tourniquet time, timed events).
- Report status line (`saving…`, `queued`, `sent`, `not saved: write it down`). On the report step, the step text that claims the summary was sent is replaced unless it was really saved.
- Disclaimer: decision support, does not replace medical judgment or training; steps marked *assumption* are pending validation.
- Keyboard: ← / → change step, Esc closes the guide (ignored while typing or while the menu is open).

## `CrewOverview` and `EmergencyDetail`

`CrewOverview({ members, activeAlerts, onOpen, lang })` (default export): the General account's crew list. Each row shows initials, name and role; with an active alert the row is highlighted and has **Open data** (`onOpen(crewId)`), otherwise a lock and "No alerts". Footer: time of the last bracelet reading. Header note: "Individual data is private. It opens only in an emergency."

`EmergencyDetail({ crewId, member, alerts, accessAt, onBack, onResolve, onSelectVital, lang })` (named export):

- back link to the crew list;
- access note: "Emergency access to <name>'s data · logged at <time>";
- the reasons (`alertReason`: "<label> in urgent range", "<guide> opened", "Reported by voice/text: <what>") with times;
- the crew member's `VitalsPanel`;
- the protocol to follow: the `urgent_protocol` of the first vital alert's indicator, otherwise `general_emergency`, with its audience and steps;
- **Mark emergency as handled** → `onResolve(crewId)`.

## `VitalsPanel`

`VitalsPanel({ member, title, subtitle, onSelect, lang })`: a summary line ("All in range", "1 value out of range", "N values out of range") and one row per indicator (`INDICATORS`) with a status dot, short label, value and unit. A row click → `onSelect(indicator)`. Footer hint about reference ranges.

## `VitalDetail`

`VitalDetail({ crew, member, indicator, onClose, onNav, lang })`: a dialog over an overlay.

- value with unit and a status chip;
- a `Sparkline` of the history with the normal band shaded ("Last 40 readings · every 2.5 s" or "Last 14 days");
- minimum, average, maximum and normal range;
- "What to do" from the manual for a non-normal status, or "No action needed";
- source note (from the manual; for blood pressure "The status uses the systolic value.");
- previous / next indicator buttons; keyboard ← / → and Esc.

`Sparkline({ values, min, max, normal, width = 120, height = 32, fluid })`: an SVG polyline scaled to `[min(min, values), max(max, values)]`, with an optional normal-range rectangle; `fluid` stretches to the container width.

## `ChatDock`

`ChatDock({ log, suggestions, busy, onSend, onManeuver, mic, placeholder, lang })`

- **Log** ("Log" / "Bitácora") collapsible with a message count. Entries:
  - `system`: a centered note ("Session started · Ana", "Conversation cleared…");
  - `user` / `assistant`: name, time and, for offline replies, an "offline" tag. Replies written by the local AI (`aiUsed`, from the backend's `ai_used`) get an **AI** / **IA** tag with a tooltip ("Reply written by the local AI (Ollama). Moon-C never uses it for health topics."). Replies with a protocol render the intro, the protocol title and an ordered list of steps; emergencies are highlighted;
  - a suggested guide adds **Open 3D guide: <name>** → `onManeuver(id)`.
- **Quick-reply chips** → `onSend(label)` (disabled while busy).
- **Composer**: microphone button (`mic.start` / `mic.stop`, disabled without dictation; tooltip warns that browser dictation uses the internet), text input (max 2000 characters; shows the interim transcript while listening) and send button.
- A note under the composer for dictation errors or "Dictation is not available in this browser: you can type."

## `Subtitles`

`Subtitles({ caption, interim, lang })`: while dictating, the user's interim text with the speaker "You"; otherwise the current caption (speaker and text; alerts styled differently). `aria-live="polite"`.

## `MenuDrawer`

`MenuDrawer({ open, onClose, accountId, setAccountId, inEmergency, voiceOn, setVoiceOn, subtitleMode, setSubtitleMode, audio, onSimulate, onReset, onManeuver, online, lang, onLanguage, sync, onDataChanged })`. Esc or the overlay closes it. Sections:

| Section | Content |
|---|---|
| Guided maneuvers (3D) | CPR (cardiac arrest), Tourniquet (severe bleeding from an arm or leg), Choking (conscious adult) → `onManeuver(id)` |
| Account | General and each crew member (role and bracelet; a red dot during an active emergency) → `setAccountId(id)` (`App.switchAccount`) |
| Language | Crew: a note that the screen follows the profile. General: ES/EN switch |
| Log a reading | `MeasurementEntry` (re-mounted per account) |
| Audio and subtitles | **Read replies aloud** toggle with a note on which voice is used (Moon-C's own, a local one, none, no speakers); subtitles Automatic / Always / Off; a note that browser dictation sends audio to an online service |
| Simulation (demo) | Crew member + scenario selects (`EMERGENCY_TYPES`), **Simulate emergency** (`onSimulate`, closes the menu) and **Reset** (`onReset`: resolve everything) |
| Data and link with Earth | General only: `DataSection` |

### `MeasurementEntry`

`MeasurementEntry({ accountId, online, lang })`: log a reading by hand (`POST /measurements`). Needs the backend ("Logging readings needs a link with the backend.").

- General picks the crew member or **Unassigned (confirm later)**; a crew account always logs for itself.
- Indicator select (the eight screen indicators). Blood pressure asks for systolic and diastolic and sends **two** readings. Decimal commas are accepted (`36,8`).
- The unit sent is `UNIT[indicator]` and the result's message and guidance come back in the screen language. The worst status's guidance is listed.
- An unassigned reading shows one button per crew member to confirm it (`POST /measurements/{id}/assign`).
- General also sees up to 5 pending unassigned readings with a "Whose is it?" select.

### `DataSection`

`DataSection({ online, sync, onChanged, lang })` (General only, needs the backend):

- link line: state, readings and reports to send, unassigned readings, last contact;
- **Simulate contact with Earth** (`POST /sync/simulate`);
- **Export JSON** / **Export CSV** (download links to `/export.json` and `/export.csv`);
- **Delete all data** after a confirmation dialog (`DELETE /data?confirm=true`); announcements are kept;
- a status line with the result. `onChanged()` refreshes the Earth status and the crew data.

## `Icons`

Inline SVG icons (24×24 viewBox, stroke `currentColor`, `aria-hidden`): `MenuIcon`, `CloseIcon`, `MicIcon`, `SendIcon`, `LockIcon`, `AlertIcon`, `SpeakerIcon`, `CaptionIcon`, `ChevronIcon`, `BackIcon`, `MegaphoneIcon`. Extra props (size, class) are spread onto the `<svg>`.
