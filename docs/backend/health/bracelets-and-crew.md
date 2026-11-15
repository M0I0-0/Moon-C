# Simulated bracelets and crew (`bracelets.py`, `crew.py`)

Sources: [`Backend/app/bracelets.py`](../../../Backend/app/bracelets.py), [`Backend/app/crew.py`](../../../Backend/app/crew.py). Data: [`shared/crew.json`](../../../shared/crew.json).

There are no real sensors yet. Each crew member wears a **simulated bracelet** that identifies them and produces live vital signs. The front-end has a copy of the same simulation for when the backend is unreachable ([frontend/hooks.md](../../frontend/hooks.md#usecrewsimulation)).

## Crew registry (`crew.py`)

`CrewRegistry.load(shared_dir / "crew.json")` reads the simulated crew profiles: identity and language only, **no biometric data of any kind**.

| Member | Purpose |
|---|---|
| `CrewMember` | Frozen dataclass: `crew_id`, `name`, `bracelet_id`, `preferredLanguage`, `role`; `profile()` → `CrewProfile` for the API |
| `get(crew_id)` | Member or `None` (also for `None`) |
| `by_bracelet(bracelet_id)` | Member by bracelet id, matched trimmed and upper-cased |
| `all()` | Every member |

Raises `CrewError` for a missing or malformed file, duplicate `crew_id` or `bracelet_id`, or a `preferredLanguage` other than `en`/`es`.

`POST /identify` is the simulated bracelet tap: it returns the profile and, with a `session_id`, starts a fresh chat context bound to that crew member ([sessions.md](../chat/sessions.md)).

## What the simulation produces

| Group | Indicators | History kept | Moves |
|---|---|---|---|
| Live signs (`LIVE`) | `heart_rate`, `blood_pressure_systolic`, `blood_pressure_diastolic`, `spo2`, `respiratory_rate`, `body_temperature`, `radiation` | last 40 readings (`HISTORY`) | every tick (`MOON_C_SIM_TICK_S`, 2.5 s) |
| Daily self-reports (`DAILY`) | `sleep_hours`, `mood` | last 14 days (`DAYS`) | generated once at startup |

Live values and statuses live in memory. `GET /vitals` returns them with their history for the charts.

## Signals, baselines and noise

Each signal moves toward a **target** (the crew member's baseline, or the scenario's value during a simulated emergency):

```
value = clamp(current + (target - current) * PULL + uniform(-noise, +noise), low, high)   # PULL = 0.22
```

then rounded to the signal's decimals. The diastolic pressure is derived: `round(systolic * 0.6 ± 1.5)`.

| Signal | Noise per tick | Physical limits | Decimals |
|---|---|---|---|
| heart_rate | 2.2 | 35–200 | 0 |
| blood_pressure_systolic | 2.5 | 60–230 | 0 |
| spo2 | 0.6 | 70–100 | 0 |
| respiratory_rate | 0.8 | 5–45 | 0 |
| body_temperature | 0.06 | 34–42 | 1 |
| radiation | 2.5 | 5–5000 | 0 |
| sleep_hours | 0.9 | 3–10 | 1 |
| mood | 0.8 | 1–5 | 0 |

Baselines (`BASELINES`; any other crew id uses Rubén's):

| Crew | HR | Systolic | SpO2 | Resp. | Temp. | Radiation | Sleep | Mood |
|---|---|---|---|---|---|---|---|---|
| moises | 74 | 122 | 98 | 15 | 36.6 | 28 | 6.4 | 4 |
| ana | 66 | 112 | 97 | 14 | 36.5 | 24 | 7.6 | 4 |
| ruben | 62 | 118 | 98 | 13 | 36.7 | 31 | 7.2 | 5 |
| valentina | 79 | 126 | 97 | 17 | 36.9 | 26 | 8.1 | 3 |

Tests check that every baseline (and the derived diastolic pressure) is in the normal range, with one deliberate exception: Moisés's 6.4 h of sleep is in the attention band. They also check that every simulated value is a valid reading for the manual.

## Simulated emergencies (demo scenarios)

| Scenario id | Label (en) | Targets |
|---|---|---|
| `low_oxygen` | Low oxygen saturation | SpO2 86, HR 118, resp. 32 |
| `high_heart_rate` | Very high heart rate | HR 138, systolic 150 |
| `high_temperature` | High temperature | temp. 39.6, HR 104, resp. 22 |
| `high_blood_pressure` | Very high blood pressure | systolic 188, HR 96 |
| `solar_storm` | Solar storm (radiation) | radiation 1500 |

Labels are neutral on purpose (Moon-C does not diagnose). Every scenario drives at least one sign into the urgent range (tested). The values drift there over a few ticks, like a real bracelet. The ids must match `EMERGENCY_TYPES` in `front-end/src/hooks/useCrewSimulation.js` (tested on both sides).

Controls: `start_scenario(crew_id, scenario)`, `reset(crew_id=None)` (`None` = everyone), `scenarios(lang)`. Exposed as `POST /simulation/emergency`, `POST /simulation/reset` and `GET /simulation/scenarios`.

## What is stored, and when alerts fire

`tick()` advances every bracelet once and returns the measurements to store. For each live signal:

1. compute the new value and its status with the manual's bands ([evaluator.md](evaluator.md));
2. if the status equals the last **stored** status → nothing to store;
3. otherwise count how many consecutive ticks the new status holds;
4. store a measurement when the new status is `urgent` (at once) or has held for **3 ticks** (`STABLE_TICKS`); it becomes the stored status;
5. a newly stored `urgent` status raises a `vital` alert, unless that crew member already has an open vital alert for that indicator.

Consequences:

- A reading is stored only when a status settles, never on every tick.
- While a value stays urgent no new alert is raised, even if the alert was resolved. It can fire again only after the value settled outside the urgent range and came back.
- Every `MOON_C_SNAPSHOT_INTERVAL_S` (900 s) a snapshot of every live sign of every crew member is stored too.

`run(tick_s)` is the background loop: sleep, `tick()`, then `store.add_many(batch)` in a worker thread (one file write per batch). Any exception is logged and the loop continues: the simulation must never take the backend down.

Stored readings are normal `Measurement` records (assigned, `synced: false`), so they are exported and queued for Earth like readings entered by hand.

## Views

`vitals()` / `vitals_for(crew_id)` return `CrewVitals`: name, `updated_at`, active `scenario`, `overall_status` (the worst status of all indicators, including sleep and mood) and, per indicator, `LiveIndicator(value, unit, status, history)`.

## Turning it off

`MOON_C_SIMULATION=false`: no bracelets are created, `GET /vitals` returns `[]`, `/vitals/{crew_id}` and the simulation endpoints answer 409. The front-end then falls back to its local simulation (`useRemoteCrew.ready` is false when `/vitals` is empty).

`MOON_C_SIM_SEED` fixes the random generator for reproducible demos. The clock is injectable (`clock=time.monotonic`) so tests can trigger snapshots.
