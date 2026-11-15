# Front-end tests

```bash
cd front-end
npm test            # vitest run (all suites, once)
npx vitest          # watch mode
npx vitest run src/lib/assistant.test.js
```

Tests sit next to the code (`*.test.js`, `*.test.jsx`) and run in Vitest's default Node environment: there is no DOM emulation, so components are rendered to static HTML with `react-dom/server` and browser APIs are mocked by hand where needed.

## Suites

| File | Covers |
|---|---|
| `src/lib/assistant.test.js` | The offline emergency detector agrees with the backend on `shared/router_cases.json` (direct, safety, negated, pain, not an emergency); "no puedo respirar" is the symptom; the crisis is never negated; `answer()`; safety-question flows in `askLocal`; replies in the crew member's language; unknown language → Spanish; `normalize` |
| `src/lib/language.test.js` | `detectLanguage` passes `shared/language_cases.json` (same cases as `Backend/app/language.py`) |
| `src/lib/i18n.test.js` | Same keys in both languages, same placeholders, nothing empty, no text left in the other language, a text for every scenario / maneuver / status / guide state / language name, `formatTime` |
| `src/components/i18n.render.test.jsx` | Renders the whole dashboard (top bar, menu, alert banner, vitals, crew overview, emergency detail, vital detail, announcements, maneuver panel, chat, subtitles) in each language and checks no fixed text of the other language leaks; the ES/EN switch only for General; alerts in the account's language; guide title and environments in the screen language |
| `src/lib/api.test.js` | Each `api` method builds the right request (path, method, body; `crew_id: null` for General; no body on GET); HTTP errors become `ApiError` with the backend's detail |
| `src/lib/alerts.test.js` | Alert texts: vital (units per language), reported, fallback text, backend message used as is, maneuver |
| `src/lib/vitals.test.js` | Backend → component shapes; every indicator shown exists in the manual; blood pressure uses the systolic bands; urgent protocols come from the manual; **the simulation scenarios match `Backend/app/bracelets.py`** and each reaches the urgent range |
| `src/lib/maneuvers.test.js` | English texts of `Model3D/moonc/maniobras.js`, environments and sources in both languages, titles follow the screen language, guides by name, `autoOpenManeuver` only with unambiguous words, `replyIntro`, `toReportSummary` and its limits |
| `src/lib/maneuverLanguage.test.js` | A guide created by `crearManiobra` (real three.js, `GLTFLoader` mocked to return an empty manikin, a stub Moon-C, sound off) starts in English, defaults to Spanish, and changes language mid-guide without restarting |
| `src/lib/moonVoice.test.js` | `splitForSpeech`: first sentence alone, merging, decimals and units not cut, long sentences cut at commas or spaces |
| `src/hooks/useSpeech.test.js` | `pickVoice`: exact local voice, then a local variant, never a network voice |

## Contracts shared with the backend

Several tests read the same files as the backend suite, so the two sides cannot drift:

| Shared file or rule | Front-end test | Backend test |
|---|---|---|
| `shared/router_cases.json` | `assistant.test.js` | `test_shared_cases.py` |
| `shared/language_cases.json` | `language.test.js` | `test_language.py` |
| Language word lists | (source of truth: both files) | `test_router_flows.py::test_language_word_lists_match_the_front_end` |
| Scenario ids and targets | `vitals.test.js` | `test_bracelets.py::test_scenario_ids_match_the_front_end` |
| `shared/protocols.json` bands | `vitals.test.js` | `test_evaluator.py`, `test_manual.py` |

## Writing tests

- Prefer pure functions in `src/lib/` (they are easy to test without a browser); keep components thin.
- To test a component, render it with `renderToStaticMarkup` and assert on the HTML, as `i18n.render.test.jsx` does.
- Mock `fetch` with `vi.stubGlobal('fetch', vi.fn(...))` and restore it with `vi.unstubAllGlobals()`, as `api.test.js` does; never call a real backend.
- Mock three.js loaders with `vi.mock(...)` to test Model3D logic without WebGL or `.glb` files, as `maneuverLanguage.test.js` does.
- New UI text needs both languages; the i18n tests fail otherwise.
