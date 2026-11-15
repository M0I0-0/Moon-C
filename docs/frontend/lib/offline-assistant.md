# Offline assistant (`lib/assistant.js`)

Source: [`front-end/src/lib/assistant.js`](../../../front-end/src/lib/assistant.js). Backend twin: [backend/chat/intent-router.md](../../backend/chat/intent-router.md) and [chat-service.md](../../backend/chat/chat-service.md#follow-up-questions).

When the backend does not answer, Moon-C **only handles emergencies**. To do that safely, this module repeats the backend's emergency rules with the same data: `shared/keywords.json` (clear phrases, weak phrases, stems, negation, pain questions, bare calls for help, yes/no answers) and `shared/protocols.json` (the protocols). Everything else waits for the link.

Both implementations must pass every case in `shared/router_cases.json` (`src/lib/assistant.test.js` and `Backend/tests/test_shared_cases.py`).

## Online helpers

| Function | Behavior |
|---|---|
| `checkBackend()` | `api.status()`, or `null` on any error |
| `askBackend({ message, crewId, sessionId, language })` | `api.chat(...)` + `via: 'backend'` |

## Text processing (same as the backend)

| Function | Mirrors | Behavior |
|---|---|---|
| `normalize(text)` | `intent.normalize` | Lowercase, NFKD without accents, no apostrophes, other punctuation → spaces |
| `tokenize(message)` | `intent.tokenize` | `{ tokens, breaks }`: words and whether punctuation sits right before each one |
| `negatedBefore(tokens, breaks, i)` | `KeywordRouter._negated` | A negator at most 3 words before, only fillers between, no punctuation |

## Detection

| Function | Returns |
|---|---|
| `scanEmergency(message)` | `{ kind, protocol }` or `null`, with `kind` = `direct` (clear phrase), `safety` (weak phrase, stem or bare call for help), `negated` (only negated hits) or `pain` (chest/breathing discomfort without an exact phrase) |
| `detectEmergency(message)` | The protocol name when `kind === 'direct'`, else `null` |
| `answer(message, graded = true)` | `'yes'`, `'no'` or `null`: heavy/light stems when graded, then the first word; "no sé" is not an answer (same as `KeywordRouter.answer`) |

The scan order is the backend's: specific clear phrases → general emergency → weak phrases and stems → negated hits → bare call for help (≤ 4 words) → pain question. Earliest hit wins; ties go to the longest keyword. `emotional_crisis` is never negated; phrases with a negator or an exempt word ("no puedo respirar", "cant breathe") are the symptom itself.

## `askLocal({ message, language = 'es', now = Date.now() })`

Returns a response with the same shape as `/chat` plus `via: 'local'` (`ai_used: false`, `language`, `suggestions`, `category`, `reply`, `protocol?`). An unknown language falls back to Spanish.

1. **Direct emergency** → `category: 'emergency'`, the protocol from the manual (`protocolView`) and the reply `"<intro> <title>: 1. … 2. …"` (the protocol's own `intro` for `emotional_crisis`, otherwise "This may be an emergency. Call a crewmate and the on-board medical officer now."). A direct emergency always wins over a pending question.
2. **Pending question** (asked within the last **2 minutes**, kept in a module-level variable):
   - a message about another topic (it contains a symptom, indicator or support keyword) is not an answer;
   - an alarming answer opens the protocol: "yes", or **"no"** for the `negated` question ("Are you sure everything is okay?");
   - a reassuring answer gets the matching reassurance line;
   - an unclear short answer (≤ 3 words) is asked once more, prefixed with "I want to be sure. ".
3. **Safety, negated or pain** → ask the question with its buttons and remember it (`category: 'ambiguous'`).
4. Anything else → `category: 'fallback'`: "I can't reach my system right now, so I can only help with emergencies. If this is one, tell me what's happening: chest pain, can't breathe, fainting or bleeding." with buttons (Chest pain, Can't breathe, Passed out, Bleeding).

The texts live in `OFFLINE[lang]` (`intro`, `reply`, `suggestions`, `questions`, `buttons`, `retry`, `reassure`). The questions, buttons and reassurance lines are copied word for word from `Backend/app/chat.py`: change both together. The clinical wording is marked "supuesto: validar con experto médico". Only the pain question is read as a graded answer ("es leve", "mucho"); the safety and negated questions take a plain yes/no.

`resetLocal()` forgets the pending question.

Differences from the backend: no injury questions, no health or support answers, no small talk, no alerts (the local simulation records a `report` alert through `App`), and the pending question is shared by the whole page rather than per session.

## Tests

`src/lib/assistant.test.js`: the shared router cases (`emergency`, `not_emergency`, `safety`, `negated`, `pain`), "no puedo respirar" is not a negation, the crisis is never negated, `answer()`, the safety-question flows (weak phrase → yes opens; no does not; "quiero desaparecer" → yes opens the crisis with its intro; negation → "No, sí ocurre" opens; pain question; expiry and new topics; a direct emergency beats the pending question; English texts), protocol replies in the crew member's language, unknown language → Spanish, and `normalize`.
