# Alerts (`alerts.py`)

Source: [`Backend/app/alerts.py`](../../../Backend/app/alerts.py). Endpoints: [api-reference.md](../api-reference.md#alerts). Front-end: [alerts-and-vitals.md](../../frontend/lib/alerts-and-vitals.md).

Priority 2 of Moon-C is to **alert the crew and the on-board medical officer**. `AlertBoard` keeps the on-board alerts **in memory** (they are lost on restart) and every screen sees the same ones by polling `GET /alerts`.

## Kinds of alert

| Kind | Raised by | Deduplication | Fields set |
|---|---|---|---|
| `vital` | `POST /measurements` with an urgent value (one alert per reading); the simulated bracelets when a sign enters the urgent range | Bracelets: at most one open vital alert per crew member and indicator (`has_open_vital`) | `measurement_id`, `indicator`, `value`, `unit` |
| `report` | The chat detected an emergency for an identified crew member | Reuses the open alert for the same crew member and protocol | `protocol` (protocol name only, never chat text) |
| `maneuver` | `POST /maneuvers/start`: a guided maneuver was opened | Reuses the open alert for the same crew member and maneuver | `protocol` = maneuver id (`rcp`, `torniquete`, `atragantamiento`) |

## Lifecycle

```
created ──ack──▶ acknowledged (still open) ──resolve──▶ resolved
   └─────────────────────resolve──────────────────────────▶ resolved
```

- **Acknowledge** only says someone saw it; the alert stays open. Idempotent: the first `acknowledged_at` is kept.
- **Resolve** closes it. Idempotent. `resolve_crew(crew_id)` closes every open alert of one crew member, or all of them with `None`.
- After a `report` or `maneuver` alert is resolved, the same emergency opens a new alert.
- `reassign(measurement_id, crew_id, name)`: when an unassigned reading is confirmed (`POST /measurements/{id}/assign`), its alert gets the crew member's id and name.
- `clear()`: the privacy wipe drops every alert.

## The `Alert` record

A frozen dataclass: `id`, `kind`, `crew_id`, `crew_name`, `created_at`, `measurement_id`, `indicator`, `value`, `unit`, `protocol`, `acknowledged`, `acknowledged_at`, `resolved`, `resolved_at`. Changes create a new copy (`dataclasses.replace`) under a `threading.Lock`.

## Messages

`message(alert, lang)` builds the localized text; `view(alert, lang)` returns the `AlertView` with it (status is always `urgent`).

| Kind | English | Spanish |
|---|---|---|
| vital | `Alert: Moisés, body temperature 39.6 °C` | `Alerta: Moisés, temperatura corporal 39.6 °C` |
| report | `Alert: Ana reported chest pain` | `Alerta: Ana reportó dolor de pecho` |
| report (`general_emergency` or unknown protocol) | `Alert: Ana reported an emergency` | `Alerta: Ana reportó una emergencia` |
| maneuver | `Alert: CPR guide started (Rubén)` | `Alerta: guía de RCP iniciada (Rubén)` |

- The reported text is the protocol title up to the colon, with a lowercase first letter ("Chest pain: how to help" → "chest pain").
- Maneuver names come from `MANEUVER_NAMES` (`rcp` → CPR/RCP, `torniquete` → tourniquet/torniquete, `atragantamiento` → choking/atragantamiento).
- Without a crew member: "unidentified crew member" / "tripulante sin identificar".

The language is the one requested with `?language=` (English by default). The front-end asks for the language of the account that sees the alert.

## Listing

`list(include_acknowledged=False, include_resolved=False)` returns alerts newest first. By default only open, unacknowledged alerts; the front-end passes `include_acknowledged=true` so an acknowledged alert still marks the crew member as "in emergency" until it is resolved.

## How the front-end uses alerts

- The **alert banner** shows the newest unacknowledged alert visible to the account (General sees all; a crew member sees their own), with **Acknowledge** and, for General, **View data**.
- New alerts are **announced** once with voice and/or subtitles.
- While a crew member has an open alert, the General account can open their data (recorded in the access log). **Mark emergency as handled** calls `POST /alerts/resolve` and `POST /simulation/reset` for that crew member.
