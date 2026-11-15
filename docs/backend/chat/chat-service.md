# Chat service (`chat.py`)

Source: [`Backend/app/chat.py`](../../../Backend/app/chat.py). Overview of the pipeline: [README.md](README.md).

`ChatService` decides what Moon-C answers. It is built once in `Services.build()`:

```python
ChatService(manual, router, crew, sessions, SmallTalk(ai_client),
            alerts=alerts, support=support, profiles=profiles, rng=None)
```

`rng` (a `random.Random`) picks among canned wordings; by default it shares the small-talk generator, so one seed fixes every wording in tests.

## `handle(req: ChatRequest) -> ChatResponse`

1. **Crew.** `crew.get(req.crew_id)`; an unknown id is ignored. The session is opened with that crew id (a different known id clears the context: a crew switch). If the request has no crew id, the crew bound to the session (by `/identify`) is used.
2. **Language.** `detect_language(message)`; a clear result is stored in the session. Reply language = detected → session → request → crew `preferredLanguage` → `en`.
3. **Route.** `intent = router.classify(message)`.
4. **Pending question.** The pending question (if any, and not expired) is read and **cleared**. If the message is not an emergency, `_answer_pending()` tries to read it as the answer.
5. **Reply**, first match wins:

| Condition | Handler |
|---|---|
| `intent.category == "emergency"` | `_emergency(protocol)` |
| the pending question was answered | that answer |
| `health` | `_health(intent)` |
| `support` (guide loaded) | `_support(intent)` |
| `support` without a guide | `_health(Intent("health", indicator="mood"))` |
| `ambiguous` with `confirm` | `_ask(kind, protocol)` |
| `ambiguous` with `wound` | `_wound(kind)` |
| `ambiguous` | clarifying question with buttons |
| `small_talk/help` | capabilities + buttons |
| `small_talk/ack` | `_ack()` |
| `small_talk` | `_small_talk()` |
| a conversation is going on (last turn was `small_talk` or `support`) | `_small_talk(casual)` |
| otherwise | `_open_ended()` |

6. **Turn.** `sessions.add_turn(session_id, Turn(category, message, reply))`.

## Emergencies: `_emergency(protocol_name, lang, crew)`

```
<intro> <title>: 1. <step> 2. <step> ...
```

- `intro` is the protocol's own `intro` when it has one (`emotional_crisis`), otherwise "This may be an emergency. Call a crewmate and the on-board medical officer now." / "Esto puede ser una emergencia…".
- The response carries the full `ProtocolView` (the front-end renders the steps as a list) and its `source`.
- If the crew member is identified, `alerts.report(crew_id, name, protocol)` raises (or reuses) a `report` alert. Only the protocol name is kept.
- The AI is never called.

## Health: `_health(intent, lang)`

| Intent | Reply |
|---|---|
| `symptom=True` | The `feeling_unwell` guidance: `"<title>: 1. … 2. …"`, with `protocol`, `indicator` (if named) and `source` |
| `indicator` set | `"<name>: <explanation> Normal range (reference values): <normal>. How to measure: 1. … If you log a reading, I will compare it with the manual."` |
| neither | "I'll check the manual for anything about health…" with topic buttons (heart rate, temperature, oxygen, sleep, mood) |

## Support: `_support(intent, lang, crew)`

`support.reply(moment, lang, profile)` returns the crew member's own reply (from their private profile, if it exists in that language) or the generic one; low mood replies always end with the safety line. The response has `moment`, `personalized`, `source` and the moment's suggestion buttons. See [emotional-support.md](emotional-support.md).

## Follow-up questions

Moon-C asks a question when it must not assume an emergency, remembers it as `Pending(kind, protocol, expires_at, tries)` for 2 minutes, and lets the next message answer it deterministically. The AI never decides the answer.

| `kind` | Asked when | Question (en) | Buttons (en) | Alarming answer → protocol |
|---|---|---|---|---|
| `safety` | Weak phrase, word stem or bare call for help | "I want to make sure you're okay. Are you in danger or do you need help right now?" | Yes, I need help / No, I'm okay | "yes" → the scanned protocol (`general_emergency` for "help me") |
| `negated` | An emergency phrase with a negation ("no sangra") | "Understood. Are you sure everything is okay?" | Yes, all good / No, it is happening | **"no"** → the protocol |
| `pain_chest_pain` | Chest discomfort without an exact phrase | "Is it a strong pain or pressure?" | Yes, it's strong / No, it's mild | "yes" (or a heavy word) → `chest_pain` |
| `pain_breathing_difficulty` | Breathing trouble without an exact phrase | "Are you short of breath or breathing with a lot of difficulty?" | Yes, I'm short of breath / No, it's mild | "yes" → `breathing_difficulty` |
| `wound_check` | A cut, wound or scrape | "I'm sorry to hear that. Is it bleeding heavily? …" (the AI may word it) | It's bleeding a lot / It's minor / There's no blood | "yes" → `bleeding` |
| `wound_burn` | A burn | "Is the burn large, blistered, or on the face or hands?" | Yes, it's serious / No, it's small | "yes" → `general_emergency` |
| `wound_head` | A blow to the head | "Was there loss of consciousness, vomiting, dizziness or confusion?" | Yes, there was / No, none | "yes" → `general_emergency` |
| `wound_fall` | A fall | "Is there strong pain, trouble moving, a blow to the head or loss of consciousness?" | Yes, one of them / No, none | "yes" → `general_emergency` |
| `wound_twist` | A sprain or twist | "Is there a lot of pain or swelling, or can't it bear weight or move?" | Yes, it's serious / No, it's mild | "yes" → `general_emergency` |

`_answer_pending(pending, intent, req, lang, crew)`:

1. A `health` or `support` message is a new topic ("no me siento bien"): return `None` and route it normally.
2. `router.answer(message, graded=kind not in ("safety", "negated"))`.
3. Not understood: if this is the first retry, the message has at most 3 words and it is not itself a new safety/injury question, ask the same question again prefixed with "I want to be sure. " (`tries + 1`). Otherwise give up (`None`) and route normally. It never loops.
4. Alarming answer → `_emergency(pending.protocol or "general_emergency")`.
5. Otherwise: for `wound_check`, the "minor injury" reassurance (`_wound("minor")`); for the rest, a reassurance line (`no_safety`, `no_negated`, `no_pain`, `no_wound`), e.g. "Understood. If it changes or gets worse, tell me and I'll guide you. The on-board medical officer can also take a look."

An emergency in the message always wins over the pending question.

## Injuries: `_wound(req, kind, lang, crew)`

- `burn`, `head`, `fall`, `twist`: a fixed clinical question via `_ask()` (the AI prompts only cover cuts).
- `check` (a cut) and `minor`: `small_talk.wound_reply()` lets the AI word the question or the reassurance, with strict rules (short, no lists, no numbers, no advice; see [local-ai.md](local-ai.md#injury-wording)). If the AI is down or its text is not plain enough, the canned `wound_check` / `wound_minor` text is used. `check` sets the pending `wound_check` question; the response is `ambiguous` with the three bleeding buttons.

## Small talk: `_small_talk(req, intent, lang, crew)`

1. History = this session's `small_talk` and `support` turns only (health turns never reach the AI).
2. `notes` = the crew member's support profile notes, if any ([emotional-support.md](emotional-support.md)).
3. `small_talk.reply(message, history, lang, name, kind, notes)` → `(text, ai_used)`.
4. **Language check.** If the AI answered in the other language, use a canned reply in `lang`.
5. **Post-filter.** If the AI reply mentions health or emergency words or a label:
   - during a support conversation → a "keep listening" line ("I'm listening. Take your time.");
   - otherwise → discard it and answer from the manual (`_health` of the re-routed message).
6. **No repeats.** A canned line is never the same as the previous reply in the session (up to 6 retries). During a support conversation, canned lines are "keep listening" lines instead of a cheerful "Hello!".
7. `personalized` is true only when the AI was used with profile notes.

## Brief replies

- `_ack()` ("ok", "jaja", 👍): one of four short lines ("Got it. I'm here if you need anything."), never the same twice in a row; during a support conversation a "keep listening" line.
- `help`: "I can explain your indicators…, log a reading, guide you step by step in an emergency or keep you company…" with buttons (Heart rate, Temperature, I feel sick, I'm stressed).
- `ambiguous`: "I want to make sure I understand. Does something hurt, or do you feel tired?" with buttons (Something hurts, I feel tired, I'm okay). The labels route back through the router.

## Open-ended messages: `_open_ended()`

Nothing matched and no conversation is going on. Moon-C tries the AI as a companion (same filters). If the AI was not used, the reply is a `fallback`: one of four honest "I'm not sure" wordings (never the same twice in a row) with topic buttons. In the middle of a conversation the canned small-talk line is kept instead.

## Texts and buttons

All fixed texts live in `TEXTS["en" | "es"]` and the quick replies in `SUGGESTIONS[...]["en" | "es"]` at the top of `chat.py`. Moon-C speaks about herself in the feminine in Spanish ("Quiero estar segura"). Clinical wording (follow-up questions and reassurance) is deliberately conservative: it only asks and escalates; it gives no new treatment. It is marked `supuesto: validar con experto médico`.

The offline detector in the front-end repeats the safety/negated/pain questions, buttons and reassurance lines word for word ([offline-assistant.md](../../frontend/lib/offline-assistant.md)). Change both together.
