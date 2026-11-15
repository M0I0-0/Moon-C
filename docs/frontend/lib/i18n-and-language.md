# UI texts and language (`lib/i18n.js`, `lib/language.js`)

Sources: [`front-end/src/lib/i18n.js`](../../../front-end/src/lib/i18n.js), [`front-end/src/lib/language.js`](../../../front-end/src/lib/language.js). The language rules of the whole app: [architecture.md](../../architecture.md#languages).

## `i18n.js`: fixed interface texts

All fixed texts of the interface live in one dictionary, Spanish by default and English for English-speaking accounts:

```js
export const DICT = { es: { key: 'texto', … }, en: { key: 'text', … } }
```

Texts that come from the backend (chat replies, alert messages, measurement messages), from the manual (indicator names, ranges, protocols) or from Model3D (maneuver steps, environments, sources) already carry their own language and are **not** in this dictionary.

| Export | Behavior |
|---|---|
| `tr(lang, key, vars)` | The text of `key` in `baseLang(lang)`, falling back to Spanish and then to the key itself; `{name}` placeholders are replaced from `vars` |
| `baseLang(lang)` | `'en'` for anything starting with `en` (`en`, `en-US`), otherwise `'es'` |
| `LANGUAGES` | `['es', 'en']` |
| `localeFor(lang)` | `en-US` or `es-MX`, for dates and times |
| `formatTime(value, lang)` | Short time in the locale's format (14:05 / 02:05 PM) |
| `QUICK_GENERAL` | Starter chips of the General account per language |

```js
tr('en', 'sessionStarted', { name: 'Ana' })   // "Session started · Ana"
tr('es', 'guideStep', { n: 2, total: 9 })     // "Paso 2 de 9"
```

### Key families

Most keys are plain names (`menu`, `send`, `crewTitle`…). Some are built from ids, so every id needs a key in both languages:

| Pattern | Ids |
|---|---|
| `scenario_<id>` | `low_oxygen`, `high_heart_rate`, `high_temperature`, `high_blood_pressure`, `solar_storm` |
| `maneuverLabel_<id>`, `maneuverHint_<id>`, `maneuverGuide_<id>` | `rcp`, `torniquete`, `atragantamiento` |
| `status_<status>` | `normal`, `attention`, `urgent` |
| `guideState_<state>` | `validado`, `supuesto` |
| `langName_<lang>` | `es`, `en` |

### Rules enforced by tests

`src/lib/i18n.test.js` and `src/components/i18n.render.test.jsx` check that:

- both languages have exactly the same keys;
- every text has the same `{placeholders}` in both languages and none is empty;
- no Spanish text was left in the English dictionary or vice versa;
- there is a text for every scenario, maneuver, status, guide state and language name;
- rendering the dashboard panels (top bar, menu, alert banner, vitals, crew overview, emergency detail, vital detail, announcements, maneuver panel, chat, subtitles) in one language never shows a fixed text that only exists in the other language;
- the ES/EN switch appears only for the General account, alerts follow the account's language, and the 3D guide's title and environments follow the screen language.

### Adding a text

1. Add the key to `DICT.es` **and** `DICT.en`, with the same placeholders.
2. Use it with `tr(lang, 'myKey', vars)`; components already receive `lang`.
3. Run `npm test`.

## `language.js`: the language of each message

`detectLanguage(text) -> 'es' | 'en' | null` mirrors `Backend/app/language.py` word for word: it counts whole-word hits in two sets of very common words that exist in only one language and returns the majority, or `null` on a tie or no hits ([backend/chat/README.md](../../backend/chat/README.md#language-detection)).

The front-end uses it:

- in `App.send()` to choose the language sent to `/chat` and, offline, the language of `askLocal()`;
- to read an announcement with a voice of the language it is written in.

With the backend, the reply's `language` field decides the conversation language.

The two word lists must stay identical: `Backend/tests/test_router_flows.py::test_language_word_lists_match_the_front_end` parses `language.js` and compares the sets, and both suites run `shared/language_cases.json`.
