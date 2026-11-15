# Front-end data (`src/data/`)

## `manual.js`: the manual on the front-end side

Source: [`front-end/src/data/manual.js`](../../front-end/src/data/manual.js).

Imports the shared files through the Vite alias and re-exports them:

```js
import protocols from '@shared/protocols.json'
import keywords from '@shared/keywords.json'
import crewFile from '@shared/crew.json'
export { protocols, keywords }
```

### Indicators shown on screen

The front-end shows **eight** indicators. Blood pressure is one row whose value is `systolic/diastolic` and whose **status is the systolic one** (`MANUAL_KEY = { blood_pressure: 'blood_pressure_systolic' }`).

| Export | Value |
|---|---|
| `INDICATORS` | `heart_rate`, `blood_pressure`, `spo2`, `respiratory_rate`, `body_temperature`, `radiation`, `sleep_hours`, `mood` (screen order) |
| `LIVE_INDICATORS` | The first six (they change every 2.5 s); sleep and mood are daily |
| `toManualKey(indicator)` | `blood_pressure` → `blood_pressure_systolic`, others unchanged |
| `fromManual(indicator)` | Whether the indicator exists in the manual |

### Labels and units

| Export | Example |
|---|---|
| `shortLabel(indicator, lang)` | `heart_rate` → "Pulso" / "Pulse"; `spo2` → "SpO₂" |
| `indicatorName(indicator, lang)` | The manual's full name ("Frecuencia cardiaca") |
| `UNIT` | Unit sent to the backend and shown in Spanish: `lpm`, `mmHg`, `%`, `rpm`, `µSv/h`, `°C`, `h`, `/5` (all accepted by the manual's `unit_aliases`) |
| `unitLabel(indicator, lang)` | `bpm` and `br/min` in English, otherwise `UNIT` |
| `roleLabel(role, lang)` | `flight_engineer` → "Ingeniería de vuelo" / "Flight engineer", `medical_officer`, `commander`, `mission_specialist` |

### Crew

| Export | Value |
|---|---|
| `CREW` | `crew.json` members plus `initials` (first two letters of the name, upper case) |
| `crewById(id)` | Member or `null` |

### Classification and manual texts

| Export | Behavior |
|---|---|
| `classify(indicator, value)` | **Same rule as `Backend/app/evaluator.py`**: urgent band → `urgent`; normal band → `normal`; otherwise `attention` |
| `worstStatus(statuses)` | `urgent` > `attention` > `normal` |
| `normalRange(indicator, lang)` | `{min, max, text}` of the **first** normal band ("50–100 bpm"), used by the charts |
| `whatToDo(indicator, status, lang)` | The manual's steps for that status |
| `protocolView(name, lang)` | `{name, type, title, intro, audience, steps, source}` or `null` |
| `PROTOCOL_FOR_INDICATOR` | `urgent_protocol` of each indicator (default `general_emergency`); shown in the General account's emergency view |
| `displayValue(indicator, values)` | `"122/73"` for blood pressure (uses `values.bp_diastolic`), otherwise `formatValue` |
| `formatValue(indicator, value)` | One decimal for temperature and sleep, whole numbers otherwise |

Texts fall back to Spanish when a language is missing (`texts[lang] ?? texts.es`).

### The `member` shape

Components receive a crew member's live data in this shape, produced both by the local simulation and by `memberFromVitals()` ([lib/alerts-and-vitals.md](lib/alerts-and-vitals.md)):

```js
{
  values:  { heart_rate: 74, blood_pressure: 122, bp_diastolic: 73, spo2: 98, respiratory_rate: 15,
             body_temperature: 36.6, radiation: 28, sleep_hours: 6.4, mood: 4 },
  history: { heart_rate: [/* 40 readings */], …, sleep_hours: [/* 14 days */], mood: [/* 14 days */] },
  emergency: null | 'low_oxygen' | …,   // simulated scenario in progress
  updatedAt: 1763215500000               // ms
}
```

## `environments.js`

```js
export const ENVIRONMENTS = {
  home: { id: 'home', nameKey: 'env.home.name', placeKey: 'env.home.place' },
}
```

The app uses a single environment: the living room ("home mode"). `App` applies the CSS class `env-home` (warm light theme) and `Scene` the home accent color and room backdrop. Maneuvers map the app environment to a maneuver environment with `ENV_TO_MANEUVER` (`home` → `tierra`).

> ⚠️ Known issue: `TopBar` shows `tr(lang, env.nameKey) · tr(lang, env.placeKey)`, but the dictionary keys are `envHomeName` and `envHomePlace` (`src/lib/i18n.js`). Since `tr()` returns the key itself when it is missing, the top bar currently shows the literal text `env.home.name · env.home.place`. Fix: use `nameKey: 'envHomeName', placeKey: 'envHomePlace'`. (The file's comment also points to `src/i18n/strings.js`, which no longer exists.)

## `announcements.js`

`SEED_ANNOUNCEMENTS`: two example announcements (from the commander and the medical officer, in Spanish, timestamped 25 and 70 minutes before page load). They are shown only when the backend is unreachable; with a backend, announcements come from `GET /announcements` ([hooks.md](hooks.md#useannouncements)).
