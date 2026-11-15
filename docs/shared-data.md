# Shared data (`shared/`)

`shared/` is the single source of truth for everything both sides must agree on. The backend reads it at startup (folder set by `MOON_C_SHARED_DIR`, default `../shared`) and validates it; a broken file stops the backend with a clear error instead of giving wrong answers. The front-end imports the same JSON at build time through the Vite alias `@shared` (`front-end/vite.config.js`).

| File | Read by | Purpose | Documented in |
|---|---|---|---|
| `protocols.json` | Backend `manual.py`; front-end `src/data/manual.js` | The health manual: indicators, ranges, what to do, protocols | [backend/health/manual.md](backend/health/manual.md) |
| `keywords.json` | Backend `intent.py`; front-end `src/lib/assistant.js` | Router keywords (en + es) | [backend/chat/intent-router.md](backend/chat/intent-router.md) |
| `crew.json` | Backend `crew.py`; front-end `src/data/manual.js` | Simulated crew: id, name, bracelet, language, role | [backend/health/bracelets-and-crew.md](backend/health/bracelets-and-crew.md) |
| `support.json` | Backend `support.py` | What Moon-C says in key mental-health moments | [backend/chat/emotional-support.md](backend/chat/emotional-support.md) |
| `support_profile.example.json` | Tests (`test_support.py`) | Format of a private support profile, with made-up content | [backend/chat/emotional-support.md](backend/chat/emotional-support.md#support-profiles) |
| `profiles/<crew_id>.json` | Backend `support.py` | **Private** support profiles (gitignored) | same |
| `router_cases.json` | Backend `tests/test_shared_cases.py`; front-end `src/lib/assistant.test.js` | Emergency-detection cases both routers must pass | [below](#router_casesjson) |
| `language_cases.json` | Backend `tests/test_language.py`; front-end `src/lib/language.test.js` | Language-detection cases both sides must pass | [below](#language_casesjson) |
| `REFERENCES.md` | People | Source of every range, deviations and space context | [`shared/REFERENCES.md`](../shared/REFERENCES.md) |

Questionnaires used to write the private profiles (`shared/*.docx`) are also gitignored.

## Editing rules

- **Restart the backend** after editing any file in `shared/`; it is read once at startup. The Vite dev server reloads the front-end by itself.
- Keys that start with `_` (`_comment`, `_warning`, `_matching`) are comments and are ignored by both loaders.
- Every text a person reads must exist in **both** `en` and `es`. The manual and the support guide refuse to load otherwise.
- Never use diagnostic language (names of conditions). Tests scan the manual and the support guide for it (`test_manual.py::test_no_diagnostic_language`, `test_support.py::test_support_guide_has_no_diagnostic_language`).
- After changing keywords or the manual, run both test suites: `router_cases.json` must still pass on both sides.

## `protocols.json`

```jsonc
{
  "_comment": "...", "_warning": "REFERENCE VALUES ...",
  "manual": { "title": {en, es}, "version": "0.2.0", "last_reviewed": "2026-11-15",
              "review_status": "...", "source": "...", "ranges_warning": "...",
              "mission": {en, es}, "disclaimer": {en, es}, "gap_policy": {en, es} },
  "indicators": { "<indicator>": { ... } },   // exactly the 9 indicators below
  "protocols":  { "<name>": { ... } }
}
```

### Indicators

Each indicator has: `unit`, `unit_aliases`, `valid_range {min, max}`, optional `integer_only`, optional `urgent_protocol`, localized `name`, `explanation`, `why_it_matters_in_space`, `how_to_measure` (list), `ranges` (`normal`, `attention`, `urgent`: lists of bands), localized `what_to_do` per status, `source`, `version`, `last_reviewed`.

A **band** uses `min`/`max` (inclusive) and/or `lt`, `lte`, `gt`, `gte` (open bounds). Values that fall in no band (a gap) are `attention`.

| Indicator | Unit | Accepted units (aliases) | Valid range | Normal | Attention | Urgent | `urgent_protocol` |
|---|---|---|---|---|---|---|---|
| `heart_rate` | bpm | bpm, beats/min, beats per minute, /min, lpm, latidos por minuto | 1–300 | 50–100 | 41–49 · 101–130 | ≤ 40 · ≥ 131 | `general_emergency` |
| `body_temperature` | °C | °C, ºC, C, deg C, celsius, grados, grados celsius | 25–45 | 36.1–38.0 | 35.1–36.0 · 38.1–39.0 | ≤ 35.0 · ≥ 39.1 | `feeling_unwell` |
| `spo2` | % | %, percent, pct, porcentaje, por ciento | 1–100 | 95–100 | 92–94 | ≤ 91 | `breathing_difficulty` |
| `sleep_hours` | h | h, hr, hrs, hour, hours, hora, horas | 0–24 | 7–9 | 5–6.9 · > 9 | < 5 | `feeling_unwell` |
| `mood` | /5 (whole numbers) | /5, 1-5, 1–5, score, points, scale, puntos, escala, puntuacion, puntuación | 1–5 | 3–5 | 2 | 1 | `feeling_unwell` |
| `blood_pressure_systolic` | mmHg | mmHg, mm Hg | 40–300 | 101–129 | 91–100 · 130–180 | ≤ 90 · > 180 | `general_emergency` |
| `blood_pressure_diastolic` | mmHg | mmHg, mm Hg | 20–200 | 60–79 | < 60 · 80–120 | > 120 | `general_emergency` |
| `respiratory_rate` | breaths/min | breaths/min, breaths per minute, rpm, resp/min, /min, respiraciones por minuto | 1–80 | 12–20 | 9–11 · 21–24 | ≤ 8 · ≥ 25 | `breathing_difficulty` |
| `radiation` | µSv/h | µSv/h, μSv/h, uSv/h, microsievert/h, microsieverts per hour, microsieverts por hora | 0–100000 | 0–100 | 101–999 | ≥ 1000 | `general_emergency` |

> ⚠️ These are reference values from published guidelines (NEWS2, AHA/ACC, WHO, AASM/SRS) and NASA standards, for healthy adults at rest. **They must still be validated by medical experts.** The mood scale and the radiation thresholds are Moon-C design choices. Full sources: [`shared/REFERENCES.md`](../shared/REFERENCES.md).

The indicator list itself is fixed in code (`INDICATORS` in `Backend/app/schemas.py`). Adding an indicator means changing the schema, the manual, the keywords and, if it is live, the bracelet simulation and the front-end lists.

### Protocols

Each protocol has `type` (`emergency` or `guidance`), localized `title`, `audience`, `steps` (list), optional localized `intro` (an opening line that replaces the generic "This may be an emergency…"), `source`, `version`, `last_reviewed`.

| Name | Type | Title (en) | Steps | Notes |
|---|---|---|---|---|
| `chest_pain` | emergency | Chest pain: how to help | 6 | |
| `breathing_difficulty` | emergency | Difficulty breathing: how to help | 5 | Also choking |
| `fainting_unresponsive` | emergency | Fainting or unresponsive: how to help | 6 | Also "CPR" |
| `bleeding` | emergency | Bleeding: how to help | 6 | Also "tourniquet" |
| `emotional_crisis` | emergency | Emotional crisis: what to do now | 6 | Has its own `intro`; never personalized; follows WHO mhGAP principles |
| `general_emergency` | emergency | Emergency: first steps | 5 | Used when no specific protocol matches |
| `feeling_unwell` | guidance | Feeling unwell: what to do | 4 | Answer to symptoms ("I feel sick") |

The steps are illustrative and not clinically validated.

## `keywords.json`

Keyword lists for the router, one list per language for each group. Text and keywords are normalized the same way (lowercase, no accents, no apostrophes, punctuation → spaces) and keywords match whole words. Top-level groups:

| Group | Used for |
|---|---|
| `emergency.<protocol>` | Clear phrases that open the protocol; optional `weak` (ask a safety question first), `stems` (word beginnings, also weak), `negatable: false` (never treated as negated), `fallback: true` (only if nothing more specific matches: `general_emergency`) |
| `health.indicators.<indicator>` | Words that name an indicator ("pulse", "fiebre") |
| `health.symptoms` | Feeling unwell ("I feel sick", "me duele") |
| `support.<moment>` | Key mental-health moments: `stress`, `frustration`, `mistake`, `conflict`, `homesick`, `lonely`, `low_mood` |
| `wound` | Possible injuries: `phrases`, `stems`, idioms to `exclude` ("golpe de suerte", "burned out") and `kinds` (head, burn, twist, cut, fall) that pick the follow-up question |
| `wound_minor` | Answers that say an injury is minor |
| `negation` | `negators`, `fillers` that may sit between a negator and a phrase, and `exempt` words ("cant") that make a phrase the symptom itself |
| `pain_question` | Chest or breathing discomfort without an exact phrase: a `where` word plus a `feel` word |
| `safety_help` | A bare call for help (at most 4 words) and the protocol a "yes" opens |
| `help` | "What can you do?" (at most 4 words) |
| `ack` | Short acknowledgements ("ok", "vale"; at most 3 words) |
| `followup` | `yes`/`no` first words and `heavy`/`light` stems for graded answers |
| `ambiguous` | Vague discomfort ("I feel weird") |
| `small_talk.<type>` | `greeting`, `thanks`, `farewell`, `casual` |
| `post_filter_block` | Labels an AI reply may never contain ("depression", "trastorno") |
| `post_filter_allow` | Pleasantries removed before the post-filter ("sleep well") |

Every support moment in `keywords.json` must have a reply in `support.json`, or the backend refuses to start. How each group is used is explained in [backend/chat/intent-router.md](backend/chat/intent-router.md).

## `crew.json`

```json
{ "crew": [ { "crew_id": "moises", "name": "Moisés", "bracelet_id": "BR-001",
              "preferredLanguage": "es", "role": "flight_engineer" }, ... ] }
```

| crew_id | Name | Bracelet | Language | Role |
|---|---|---|---|---|
| `moises` | Moisés | BR-001 | es | flight_engineer |
| `ana` | Ana | BR-002 | en | medical_officer |
| `ruben` | Rubén | BR-003 | es | commander |
| `valentina` | Valentina | BR-004 | es | mission_specialist |

No biometric data of any kind. `crew_id` and `bracelet_id` must be unique; `preferredLanguage` must be `en` or `es`. The bracelet simulation has a baseline per `crew_id` (others use Rubén's baseline). The front-end shows role names from `ROLES` in `src/data/manual.js`.

## `support.json`

```jsonc
{
  "version": "0.1.0", "last_reviewed": "2026-11-15", "source": "...",
  "moments": { "<moment>": { "label": {en, es}, "reply": {en, es}, "suggestions": {en: [...], es: [...]} } },
  "safety_line": {en, es},   // appended to low_mood replies
  "continue": {en: [...], es: [...]}  // "keep listening" lines when the AI is unavailable
}
```

All seven moments are required. See [backend/chat/emotional-support.md](backend/chat/emotional-support.md).

## `router_cases.json`

Shared test cases for emergency detection. The backend router and the front-end offline detector must agree on every case:

| Key | Meaning | Expected result |
|---|---|---|
| `emergency` | `{text, protocol}` | Opens `protocol` directly |
| `safety` | `{text, protocol}` | A weak phrase or bare call for help: category `ambiguous`, `confirm: "safety"`, a "yes" opens `protocol` |
| `negated` | `{text, protocol}` | An emergency phrase with a negation: `confirm: "negated"` |
| `pain` | `{text, protocol}` | Chest or breathing trouble without an exact phrase: `confirm: "pain"` |
| `not_emergency` | strings | Never an emergency |

Add a case here whenever you fix a routing bug; both suites pick it up.

## `language_cases.json`

`{text, language}` pairs, where `language` is `en`, `es` or `null` (unclear: Moon-C keeps the language already in use). Both `Backend/app/language.py` and `front-end/src/lib/language.js` must return the expected value for every case.
