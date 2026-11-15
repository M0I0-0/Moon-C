# Evaluator (`evaluator.py`)

Source: [`Backend/app/evaluator.py`](../../../Backend/app/evaluator.py). Front-end twin: `classify()` in [`front-end/src/data/manual.js`](../../../front-end/src/data/manual.js).

The evaluator compares a reading with the manual's reference ranges. It only applies the ranges in `shared/protocols.json`; it does not hold any value itself. A status says how a value compares with the manual and which manual steps apply. **It is not a diagnosis.**

## The rule

The same rule for every indicator:

1. **`urgent`** if the value falls in any urgent band;
2. **`normal`** if it falls in any normal band;
3. **`attention`** otherwise.

Step 3 covers the explicit attention bands **and any gap between bands** (for example 38.05 °C, or 100.5 bpm between the normal 50–100 and the attention 101–130). A value is never silently treated as normal. This is the manual's `gap_policy`.

`band_matches(band, value)` checks every bound present in the band: `min`/`max` are inclusive, `lt`/`lte`/`gt`/`gte` are strict or inclusive open bounds. `classify(bands, value)` applies the rule. The simulated bracelets use the same `classify()`.

## `evaluate(manual, indicator, value, unit) -> Evaluation`

Validates a reading and returns `Evaluation(indicator, value, unit, status)` with the canonical unit. Raises `MeasurementValueError` (→ HTTP 422 with the message) when:

| Problem | Message |
|---|---|
| Unknown indicator | `Unknown indicator 'x'.` |
| Unit not accepted for the indicator | `Unit 'F' is not valid for body_temperature. Use '°C'.` |
| NaN or infinity | `Value must be a finite number.` |
| A decimal value for `mood` | `mood must be a whole number.` |
| Outside the valid range | `heart_rate must be between 1 and 300 bpm. Please check the reading.` |

Units are matched against the indicator's `unit_aliases` after normalization (`"c"`, `"celsius"`, `"grados"` → `°C`; `"lpm"` → `bpm`; `"1-5"` → `/5`). Values are never converted between unit systems: °F is rejected.

## `describe(manual, evaluation, lang, needs_confirmation) -> str`

A short, non-diagnostic sentence for the UI and for text-to-speech:

| Status | English | Spanish |
|---|---|---|
| normal | `Heart rate 72 bpm: within the normal range (reference values).` | `… dentro del rango normal (valores de referencia).` |
| attention | `Body temperature 38.2 °C: needs attention. The normal reference range is 36.1–38 °C.` | `… requiere atención. El rango normal de referencia es …` |
| urgent | `Oxygen saturation (SpO2) 88 %: urgent range. An on-board alert was created for the medical officer.` | `… rango urgente. Se creó una alerta a bordo para el oficial médico.` |

With `needs_confirmation` (a reading without `crew_id`) it appends "Who is this reading for? Please confirm the crew member." / "¿De quién es esta lectura? Confirma el tripulante."

## Where it is used

- `POST /measurements`: `evaluate()` → store → alert if urgent → `describe()` and the manual's `what_to_do` for that status ([api-reference.md](../api-reference.md#post-measurements)).
- `SimulatedBracelets`: `classify()` on every tick ([bracelets-and-crew.md](bracelets-and-crew.md)).

## Tests

`tests/test_evaluator.py`:

- `test_boundaries`: a table of boundary values per indicator (just inside and just outside each band), and `test_every_indicator_has_boundary_cases` makes sure every indicator has some;
- `test_manual_bands_agree_with_evaluator`: values derived from the manual's own bands land in the expected status;
- `test_unit_aliases`, `test_invalid_readings_are_rejected`.

When you change a range in the manual, update the boundary table in that test.
