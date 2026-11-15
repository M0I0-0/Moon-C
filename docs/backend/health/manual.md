# Health manual (`manual.py`)

Source: [`Backend/app/manual.py`](../../../Backend/app/manual.py). Data: [`shared/protocols.json`](../../../shared/protocols.json) (format and current values in [shared-data.md](../../shared-data.md#protocolsjson)). Sources of every range: [`shared/REFERENCES.md`](../../../shared/REFERENCES.md).

The manual is the **single source of truth** for indicators, ranges and protocols. Every health or emergency answer comes from it; the AI never answers health questions. `Manual` loads the file once, validates it at startup and serves localized views.

> ⚠️ The ranges are reference values from published guidelines and NASA standards. They must still be validated by medical experts, and the protocol steps are illustrative.

## Loading and validation

`Manual.load(path)` raises `ManualError` (and the backend does not start) when:

| Check | Example message |
|---|---|
| File missing or not valid JSON | `Health manual not found: …` |
| A top-level section (`manual`, `indicators`, `protocols`) is missing | `Manual is missing the 'indicators' section` |
| `manual.title`, `mission`, `disclaimer`, `gap_policy` lack `en` or `es` | `Manual needs non-empty en, es text in manual.mission` |
| `manual.version`, `last_reviewed`, `source`, `ranges_warning` missing | `Manual is missing manual.version` |
| One of the nine indicators is missing | `Manual is missing indicator 'spo2'` |
| An indicator lacks a localized `name`, `explanation`, `why_it_matters_in_space`, `how_to_measure` or `what_to_do.<status>` | — |
| An indicator lacks `unit`, `unit_aliases`, `valid_range`, `ranges`, `source`, `version`, `last_reviewed` | — |
| A status has no band, a band is empty or invalid | `Manual needs at least one band in indicators.mood.ranges.urgent` |
| `urgent_protocol` names a protocol that does not exist | — |
| A protocol's `type` is not `emergency`/`guidance`, or it lacks a localized `title`, `audience`, `steps` (or `intro`, when present), or `source`, `version`, `last_reviewed` | — |

Failing fast is deliberate: a broken manual must stop the backend with a clear message instead of giving wrong answers later.

## `IndicatorSpec`

For each indicator the manual builds a machine-readable spec used by the [evaluator](evaluator.md) and the [bracelets](bracelets-and-crew.md):

| Field | Meaning |
|---|---|
| `key` | Indicator id |
| `unit` | Canonical unit (`bpm`, `°C`, `%`, `h`, `/5`, `mmHg`, `breaths/min`, `µSv/h`) |
| `unit_aliases` | Accepted spellings, normalized with `normalize_unit_text()` (lowercase, `º` → `°`, no spaces) |
| `valid_min`, `valid_max` | Physically plausible values; outside them a reading is rejected |
| `integer_only` | Whole numbers only (`mood`) |
| `bands` | `RangeBands` with the `normal`, `attention` and `urgent` bands |

`spec.canonical_unit(unit)` returns the canonical unit if `unit` is accepted, else `None`.

## Accessors

| Member | Returns |
|---|---|
| `version`, `source`, `ranges_warning` | Manual metadata |
| `protocol_names` | Every protocol name |
| `has_indicator(key)`, `has_protocol(name)` | Existence checks |
| `spec(key)` | The `IndicatorSpec` |
| `indicator_name(key, lang)` | Localized name ("Heart rate" / "Frecuencia cardiaca") |
| `indicator_source(key)` | Source text of an indicator |
| `what_to_do(key, status, lang)` | List of steps for that status |
| `meta_text(field, lang)` | A localized `manual.<field>` |
| `ranges_text(key, status, lang)` | Formatted bands, e.g. `"41–49 or 101–130 bpm"`, `"≤ 40 o ≥ 131 bpm"` |

## Views (API responses)

| Method | Model | Used by |
|---|---|---|
| `indicator_view(key, lang)` | `IndicatorView` | `GET /manual/{indicator}`, chat indicator answers |
| `protocol_view(name, lang)` | `ProtocolView` | `GET /protocols/{name}`, chat emergencies and guidance, alert texts |
| `manual_view(lang)` | `ManualView` | `GET /manual` |

Localized texts fall back to English when a language is missing (`_t(texts, lang)`), although validation already requires both.

## Formatting helpers

Also used by the evaluator and the alerts:

| Function | Example |
|---|---|
| `format_number(38.0)` | `"38"` (`:g` format: no trailing zeros) |
| `format_value(38.2, "°C")` | `"38.2 °C"`; units starting with `/` are glued: `format_value(1, "/5")` → `"1/5"` |
| `format_band(Band(min=50, max=100))` | `"50–100"`; open bounds use `<`, `≤`, `>`, `≥` (`Band(gte=131)` → `"≥ 131"`) |
| `normalize_unit_text(" ºC ")` | `"°c"` |

## Front-end use of the same file

The front-end imports `protocols.json` directly (`src/data/manual.js`) to classify values, show names, ranges and "what to do", and to answer emergencies offline. It shows blood pressure as one indicator whose status is the systolic one ([frontend/data.md](../../frontend/data.md)).

## Changing the manual

1. Edit `shared/protocols.json`, in both languages. Keep `source`, `version` and `last_reviewed` up to date, and update `shared/REFERENCES.md` when a range changes.
2. Restart the backend; a validation error names the field.
3. Run `python -m pytest`. `test_evaluator.py` has boundary cases per indicator (they must change with the ranges), `test_manual.py` checks localization, required emergency steps, the absence of diagnostic language and that the disclaimer says Moon-C does not diagnose.
4. Run `npm test` in `front-end/`: the offline assistant and the vitals helpers read the same file.
