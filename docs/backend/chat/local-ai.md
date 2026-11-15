# Local AI (`ai.py`)

Source: [`Backend/app/ai.py`](../../../Backend/app/ai.py).

Moon-C uses a local [Ollama](https://ollama.com) model (`qwen3.5:4b` by default) **only for conversation**: small talk, listening after a key mental-health moment, open-ended messages and the wording of one injury question. Health and emergency questions are routed to the manual before the AI is ever called. If Ollama is down, slow or returns something unusable, Moon-C answers with a canned reply and `ai_used` is `false`; nothing else changes.

Nothing sent to or received from the model is logged or stored.

## `OllamaClient`

An async client (`httpx.AsyncClient`, base URL `MOON_C_OLLAMA_URL`). Tests inject an `httpx.MockTransport`.

| Method | Ollama API | Behavior |
|---|---|---|
| `status()` | `GET /api/tags` (timeout `ollama_status_timeout_s`, 2 s) | Returns `(reachable, model_available)`. The model counts as available under its name or `<name>:latest`. Cached for `ollama_status_ttl_s` (10 s). A failure opens the circuit; a success closes it |
| `warm_up()` | `POST /api/generate` with only `model` and `keep_alive` (timeout 180 s) | Loads the model into memory. Runs as a background task at startup when `MOON_C_OLLAMA_WARMUP=true`; logs a warning on failure |
| `chat(messages)` | `POST /api/chat` | Returns the reply text or `None`. See below |
| `aclose()` | — | Closes the HTTP client at shutdown |

### `chat(messages)`

Payload:

```json
{
  "model": "qwen3.5:4b", "messages": [...], "stream": false, "think": false,
  "keep_alive": "30m",
  "options": { "num_predict": 120, "temperature": 0.7 }
}
```

- The whole request runs inside `asyncio.timeout(ollama_timeout_s)` (10 s by default).
- **Circuit breaker.** After a connection error (`ConnectError`, `ConnectTimeout`), Ollama is skipped for `ollama_circuit_s` seconds (10) and `/status` is marked unreachable. On Windows a refused local connection takes about 2 s, so without this every message would pay it again. HTTP errors, timeouts and bad JSON return `None` without opening the circuit.
- The reply goes through `clean_reply()`: removes `<think>…</think>` reasoning blocks, collapses whitespace and quotes, and, if the model stopped because of `num_predict` (`done_reason == "length"`), cuts at the last full sentence.

## `SmallTalk`

| Method | Returns |
|---|---|
| `canned(lang, kind)` | A random canned reply for `greeting`, `thanks`, `farewell` or `casual` (default) |
| `reply(message, history, lang, crew_name, kind, notes=None)` | `(text, ai_used)`: the model's reply, or a canned one |
| `wound_reply(message, history, lang, crew_name, kind)` | The AI's wording of the injury question (`check`) or reassurance (`minor`), or `None` |

### System prompt

`build_system_prompt(lang, crew_name, notes)` joins:

1. `SYSTEM_PROMPT`: Moon-C is a warm, curious and playful companion on a space mission; replies are 1–2 short sentences, never lists; understand typos and voice transcription ("ola" = "hola"); may greet, encourage, chat and listen; encourage talking to a trusted crewmate or the medical officer when things feel heavy; **never discuss health, symptoms or measurements** ("say you will check the manual"); never invent facts; never diagnose or use labels for how someone feels.
2. The language line: "Always reply in English, even if the crew member writes in another language." or "Responde siempre en español, aunque te escriban en otro idioma, y usa el femenino al hablar de ti misma."
3. "The crew member's name is …" when known.
4. The crew member's support-profile notes, after a blank line, when there are any ([emotional-support.md](emotional-support.md#what-the-ai-receives)).

Messages sent: the system prompt, then the session's `small_talk`/`support` turns as user/assistant pairs (at most 10 turns), then the new message.

### Canned replies

`CANNED_REPLIES[lang][kind]` holds 3–5 lines per kind and language (17 per language). Tests check there are at least ten per language, that none touches health words, and that none is detected as the other language. Moon-C is feminine in Spanish ("¡Hola! Lista cuando tú lo estés.", "tu compañera a bordo"). There are no "fun fact" replies by design.

## Post-filter

`is_safe_small_talk(reply, router)` is `not router.mentions_health_or_emergency(reply)` ([intent-router.md](intent-router.md#post-filter-mentions_health_or_emergencytext)). An AI reply that mentions an emergency phrase, an indicator, a symptom or a label ("depression", "trastorno") is discarded:

- during a support conversation, Moon-C answers with a "keep listening" line from `support.json`;
- otherwise the message is answered from the manual instead.

The filter is keyword based, so it can discard a harmless reply; the user then gets the manual-based answer, which is the safe side.

The second guard is the **language check** in `chat.py`: an AI reply detected in the other language is replaced by a canned reply in the right one, because a small model tends to mirror the user's language.

## Injury wording

For a possible cut, `wound_reply()` sends a short dedicated prompt (`WOUND_PROMPTS["check"]` or `["minor"]`) plus the language line and the last 4 conversation turns. The text is used only if `is_valid_wound_reply()`: 1–280 characters, a single line, **no digits** and no bullets. Otherwise the fixed text is used. The question itself, its buttons and what the answer opens stay deterministic ([chat-service.md](chat-service.md#follow-up-questions)).

## Performance notes

On the development laptop (2-core i3, no GPU) `qwen3.5:4b` produces about 2–4 tokens/s: 8–16 s per reply, so with the default 10 s timeout many replies are canned. With a support profile the first reply of a conversation takes about 25 s and later ones 10–15 s. Raise `MOON_C_OLLAMA_TIMEOUT_S` (25, or 40 with a profile) or use a smaller model. The front-end waits up to 45 s for `/chat`.
