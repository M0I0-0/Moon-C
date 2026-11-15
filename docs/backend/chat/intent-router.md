# Intent router (`intent.py`)

Source: [`Backend/app/intent.py`](../../../Backend/app/intent.py). Keywords: [`shared/keywords.json`](../../../shared/keywords.json). Front-end mirror of the emergency part: [`front-end/src/lib/assistant.js`](../../../front-end/src/lib/assistant.js) ([offline-assistant.md](../../frontend/lib/offline-assistant.md)).

`KeywordRouter` turns a message into an `Intent`. It is deterministic and offline: no model ever decides whether something is an emergency. All the words live in `keywords.json`, so most changes need no code.

## Text normalization

`normalize(text)`:

1. `casefold()` and Unicode NFKD, then drop combining marks (accents): "Respiración" → "respiracion", "SpO₂" → "spo2".
2. Remove apostrophes of every kind (`'’‘`´ʼ`): "can't" → "cant".
3. Replace any other non-word character (and `_`) with a space; collapse spaces.

```python
normalize("¡No puedo RESPIRAR! Can't breathe… SpO₂?")  # 'no puedo respirar cant breathe spo2'
```

`tokenize(text) -> (tokens, breaks)` does the same but also remembers, for each token, whether punctuation (`, ; . : ! ? ¿ ¡ ( ) …`, a line break or a spaced dash) sits right before it. Negation never crosses punctuation: in "No, sangra mucho" the "no" answers something else and "sangra" is a real emergency.

Keywords are normalized the same way when loaded. Matching is on **whole words**: the text is padded with spaces and searched for `" <keyword> "`.

## The `Intent` result

| Field | Set for | Meaning |
|---|---|---|
| `category` | always | `emergency`, `health`, `support`, `ambiguous`, `small_talk`, `fallback` |
| `protocol` | `emergency`; `ambiguous` with `confirm` | Protocol to open (now, or after a "yes") |
| `indicator` | `health` | Indicator named in the message |
| `symptom` | `health` | The message describes feeling unwell |
| `small_talk_type` | `small_talk` | `greeting`, `thanks`, `farewell`, `casual`, `help`, `ack` |
| `moment` | `support` | Key mental-health moment |
| `wound` | `ambiguous` | Injury follow-up: `check` (cut: ask about bleeding), `burn`, `head`, `fall`, `twist`, or `minor` |
| `confirm` | `ambiguous` | Safety question before a protocol: `safety`, `negated` or `pain` |

## Classification order

`classify(text)` checks, in this strict order, and returns at the first hit:

| # | Check | Result |
|---|---|---|
| 0 | Nothing left after normalization | Emoji only → `small_talk/ack`; otherwise `fallback` |
| 1 | **Emergency scan** (every language, always) | Clear phrase → `emergency`; weak phrase or stem → `ambiguous, confirm=safety`; only negated hits → `ambiguous, confirm=negated` |
| 2 | Bare call for help, at most 4 words ("help me", "necesito ayuda") | `ambiguous, confirm=safety, protocol=general_emergency` |
| 3 | **Pain question**: a chest/breathing word plus a discomfort word, without an exact phrase | `ambiguous, confirm=pain` (or `negated` if every discomfort word is negated) |
| 4 | Injury: minor phrase ("es poca cosa", "no blood") | `ambiguous, wound=minor` |
| 5 | Injury: wound phrase or stem ("me corté", "I fell", "quemadur…") after removing idioms | `ambiguous, wound=<kind>` |
| 6 | Symptom ("I feel sick", "me duele") | `health, symptom=True` (+ `indicator` if one is named) |
| 7 | Support moment ("stressed", "extraño a mi familia") | `support, moment=<moment>` |
| 8 | Indicator ("pulse", "temperatura") | `health, indicator=<indicator>` |
| 9 | Vague discomfort ("I feel weird") | `ambiguous` |
| 10 | "What can you do?", "menu", "ayuda" (at most 4 words) | `small_talk/help` |
| 11 | Greeting, thanks, farewell, casual | `small_talk/<type>` |
| 12 | Acknowledgement (at most 3 words: "ok", "vale") or laughter ("jajaja", "haha", "lol", "xd") | `small_talk/ack` |
| 13 | A greeting/thanks/farewell with a typo ("ola", "holaaa", "grcias") | `small_talk/<type>` |
| 14 | — | `fallback` |

Why this order: emergencies first, always; then the questions that protect against a missed emergency; symptoms before support (feeling sick is a health question); support before indicators ("I'm tired and stressed" is a moment, not a question about sleep); small talk last.

### Emergency scan in detail

The `emergency` section of `keywords.json` has one node per protocol:

```jsonc
"chest_pain": {
  "en": ["chest pain", "my chest hurts", ...],     // clear phrases: open the protocol
  "es": ["dolor de pecho", "me duele el pecho", ...],
  "weak":  { "en": ["heart attack"], "es": ["me da un infarto", ...] },  // ask first
  "stems": { "en": ["infarct"], "es": ["infart"] }                        // word beginnings: ask first
},
"emotional_crisis": { ..., "negatable": false },  // never treated as negated
"general_emergency": { "fallback": true, ... }     // only if nothing more specific matches
```

`_scan_emergency(tokens, breaks)` returns `("direct" | "safety" | "negated", protocol)` or `None`:

1. Clear phrases of the specific protocols. A non-negated hit → `direct`.
2. Clear phrases of `general_emergency` ("emergency", "socorro"). A non-negated hit → `direct`.
3. Weak phrases and stems → `safety`. A stem never re-reads words already inside a phrase hit ("no me da un infarto").
4. Only negated hits found → `negated`.

When several hits compete, the **earliest** in the message wins; at the same position the **longest** keyword wins. So "I can't breathe and I have chest pain" opens `breathing_difficulty`, and "Emergency, he is bleeding" opens `bleeding` (specific protocols are checked before the general one).

**Negation.** A hit is negated when a negator (`no`, `not`, `never`, `dont`, `sin`, `nunca`…) sits at most 3 words before it, with only filler words between them (`tengo`, `have`, `any`, `me`, `muy`…) and no punctuation. It is not applied:

- to protocols with `negatable: false` (`emotional_crisis`): "no quiero vivir" is the crisis itself;
- when the phrase already contains a negator or an `exempt` word ("no puedo respirar", "cant breathe"): that is the symptom.

### Pain question

`pain_question` lists, for `chest_pain` and `breathing_difficulty`, `where` stems ("pecho", "chest", "respir", "breath") and `feel` stems ("dolor", "molest", "tight", "hard"), plus exact `feel_words` ("mal"). If a message has both (on different words) it gets `confirm=pain`: "Me molesta el pecho" asks "Is it a strong pain or pressure?". If every feel word is negated, it is `negated` instead.

### Injuries

- Idioms in `wound.exclude` are removed first ("golpe de suerte", "se cayó el sistema", "burned out", "fell asleep").
- `wound_minor` phrases → `wound=minor`.
- `wound.phrases` (whole words) or `wound.stems` (word beginnings, so "cortada", "cortadura" both match `cortad`) → a possible injury.
- `_wound_kind()` picks the follow-up question with the first kind in `wound.kinds` that has a hit, in file order: `head`, `burn`, `twist`, `cut` (→ `check`), `fall`. Default `check`.

### Typos in short greetings

`_fuzzy_small_talk()` runs only for messages of up to 3 words that matched nothing else. It collapses letters repeated 3+ times ("holaaa" → "hola") and accepts one insertion, deletion or substitution against single-word greeting/thanks/farewell keywords of at least 4 letters. Words shorter than 3 letters and real words one letter away from a greeting (`hora`, `hoja`, `sola`, `solo`, `bola`, `cola`, `mola`, `gracia`, `horas`) are never read as small talk.

## Reading answers: `answer(text, graded=True)`

Used for the replies to Moon-C's own questions. Returns `"yes"`, `"no"` or `None`.

1. If `graded` (injury and pain questions): the first token starting with a `heavy` stem ("mucho", "fuerte", "grave", "serious", "bad") means `yes`, unless negated just before it ("no es grave" → `no`). Otherwise any `light` stem ("poco", "leve", "minor", "little") means `no`.
2. Else the **first word** decides: a `yes` word ("sí", "claro", "yes", "yeah") or a `no` word ("no", "nope", "nel").
3. "No sé" is not an answer (`None`), and neither is anything else.

Plain yes/no questions (`safety`, `negated`) skip step 1.

## Post-filter: `mentions_health_or_emergency(text)`

Used on every AI reply ([local-ai.md](local-ai.md#post-filter)). Returns true if the text contains an emergency phrase, a `general_emergency` phrase, an indicator word, a symptom word or a label from `post_filter_block` ("depression", "disorder", "trastorno", "ataque de pánico"). Everyday pleasantries in `post_filter_allow` ("sleep well", "buen humor") are removed first, so "Good night, sleep well!" survives.

## Loading and validation

`KeywordRouter.load(path)` reads the file; `__init__` builds one `(group, keyword)` table per section. It raises `KeywordsError` when:

- the file is missing or is not valid JSON;
- a required section (`emergency`, `health.indicators`, `health.symptoms`, `ambiguous`, `small_talk`) is missing or has the wrong shape;
- an indicator name is not one of the nine known indicators;
- there are no emergency keywords at all.

Two properties are used elsewhere: `emergency_protocols` (protocol names with keywords) and `support_moments` (moments with keywords; `main.py` checks each has a reply in `support.json`).

## Examples

| Message | Intent |
|---|---|
| "Dolor de pecho" | `emergency`, `chest_pain` |
| "I can't breathe and I have chest pain" | `emergency`, `breathing_difficulty` (earliest) |
| "Guíame con la RCP" | `emergency`, `fainting_unresponsive` |
| "No sangra pero es una emergencia" | `emergency`, `general_emergency` ("no sangra" is negated) |
| "Heart attack" | `ambiguous`, `confirm=safety`, `chest_pain` |
| "I'm drowning in work" | `ambiguous`, `confirm=safety`, `breathing_difficulty` (stem `drown`) |
| "No tengo dolor de pecho" | `ambiguous`, `confirm=negated`, `chest_pain` |
| "Me molesta el pecho" | `ambiguous`, `confirm=pain`, `chest_pain` |
| "Me torcí el tobillo" | `ambiguous`, `wound=twist` |
| "Me siento mal" | `health`, `symptom=True` |
| "Estoy muy estresado" | `support`, `stress` |
| "What is a normal pulse?" | `health`, `heart_rate` |
| "Me siento raro" | `ambiguous` |
| "holaaa" | `small_talk`, `greeting` |
| "Fue un golpe de suerte" | not an injury (idiom removed) |

The full list both routers must pass is `shared/router_cases.json` ([shared-data.md](../../shared-data.md#router_casesjson)).

## Limitations

- Keyword matching, not understanding. Negation is handled only in the narrow way above; "I don't have chest pain" asks for confirmation (the safe side) instead of being dismissed.
- Typos are handled only for short greetings and the few misspellings listed as keywords ("pexo", "breath").
- English and Spanish only.

## Changing keywords

1. Edit `shared/keywords.json` (both languages).
2. Add the case to `shared/router_cases.json` if it is about emergencies.
3. Restart the backend and run `python -m pytest` and `npm test`: the front-end detector reads the same file.
