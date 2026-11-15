# Alerts and vitals helpers (`lib/alerts.js`, `lib/vitals.js`)

Sources: [`front-end/src/lib/alerts.js`](../../../front-end/src/lib/alerts.js), [`front-end/src/lib/vitals.js`](../../../front-end/src/lib/vitals.js). Backend side: [backend/health/alerts.md](../../backend/health/alerts.md), [backend/health/bracelets-and-crew.md](../../backend/health/bracelets-and-crew.md).

The components work with one shape of crew data and one shape of alert, whether the data comes from the backend (`useRemoteCrew`) or from the browser simulation (`useCrewSimulation`). `vitals.js` converts the backend's responses into that shape; `alerts.js` writes alert texts in the language of the account that sees them.

## `vitals.js`: backend → component shapes

| Export | Behavior |
|---|---|
| `toFrontIndicator(indicator)` | `blood_pressure_systolic` → `blood_pressure`; others unchanged |
| `memberFromVitals(vitals)` | One `CrewVitals` → `{ values, history, emergency, updatedAt }` ([member shape](../data.md#the-member-shape)). The diastolic value goes to `values.bp_diastolic` (no history); `emergency` is the active scenario; `updatedAt` in ms |
| `membersFromVitals(list)` | `{ [crew_id]: member }` |
| `alertFromBackend(alert)` | One `AlertView` → the local alert shape (below), keeping the backend's localized `message` |

### The alert shape used by components

```js
{
  id, kind,                 // 'vital' | 'report' | 'maneuver'
  crewId, indicator,        // indicator in front-end form (blood_pressure), vital alerts only
  value, unit,              // vital alerts only
  protocol,                 // report: protocol name; maneuver: maneuver id
  text,                     // fallback description (local alerts; Spanish for converted ones)
  message,                  // backend alerts: the full text, already in the requested language
  createdAt,                // ms
  acknowledged, resolved,
}
```

## `alerts.js`: alert texts

Backend alerts already bring `message` in the requested language (`useRemoteCrew` asks `/alerts?language=<screen language>`). Local alerts (no backend) are written here.

| Function | Example (en) |
|---|---|
| `alertText(alert, lang)` | `message` if present; otherwise vital: "Alert: Ana, SpO₂ 86 %"; report: "Alert: Ana reported chest pain" |
| `alertReason(alert, lang)` | For the General account's emergency view: "SpO₂ in urgent range", "CPR guide opened", "Reported by voice/text: chest pain" |
| `reportedText(protocolName, lang)` | The protocol title before the colon, lowercased first letter ("chest pain"); "an emergency" for `general_emergency` or no protocol |
| `maneuverGuideText(maneuver, lang)` | "CPR guide", "tourniquet guide", "choking guide" (`maneuverGuide_<id>`) |

Units follow the account's language (`bpm` in English, `lpm` in Spanish).

## Where alerts go

1. **Source.** `useRemoteCrew` (backend, polled every 2.5 s) or `useCrewSimulation` (browser).
2. **Visible alerts.** General sees every alert; a crew account sees only its own.
3. **Announcement.** `App` speaks/subtitles each new alert once with `alertText(a, lang)`.
4. **Banner.** `AlertBanner` shows the newest unacknowledged one.
5. **Emergency view.** `EmergencyDetail` lists `alertReason()` for each of the crew member's active alerts.
6. **Resolution.** "Mark emergency as handled" → `sim.resolve(crewId)`.

## Tests

- `src/lib/vitals.test.js`: `memberFromVitals` produces the same shape as the local simulation; every indicator shown exists in the manual; `alertFromBackend` for vital, report (only the protocol name) and maneuver alerts; blood pressure uses the systolic bands; each urgent indicator's protocol comes from the manual; the simulation scenarios match `Backend/app/bracelets.py` and each reaches the urgent range.
- `src/lib/alerts.test.js`: vital alerts (Spanish and English units), reported emergencies, stored text fallback, backend text used as is, maneuver alerts.
