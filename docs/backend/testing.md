# Backend tests and tools

## Running the suite

```bash
cd Backend
python -m pytest                       # everything (quiet mode, see pytest.ini)
python -m pytest tests/test_intent.py  # one file
python -m pytest -k emergency          # by name
```

`pytest.ini`: `testpaths = tests`, `pythonpath = .` (so `import app` works), `addopts = -q`, and it silences Starlette's TestClient notice about httpx.

The tests **never** touch `Backend/storage/`, a real Ollama, your `.env` or a real support profile.

## Fixtures (`tests/conftest.py`)

| Fixture / helper | What it gives you |
|---|---|
| `FakeOllama(reply=..., up=True, chat_status=200, delay=0, done_reason="stop", models=("qwen3.5:4b",))` | A mock of Ollama's HTTP API (`/api/tags`, `/api/generate`, `/api/chat`) served through `httpx.MockTransport`. `up=False` raises `ConnectError`; `requests` and `chat_calls` record what was sent |
| `shared_dir` | The real `shared/` folder |
| `manual` | `Manual.load(shared/protocols.json)` (session scope) |
| `storage_path` | `tmp_path / "storage" / "measurements.json"` |
| `settings` | `Settings(_env_file=None, shared_dir=…, storage_path=…, profiles_dir=<empty tmp folder>, ollama_warmup=False, earth_link="offline", simulation=False, voice=False)` |
| `make_client(ollama=None, **overrides)` | A `TestClient` built with `create_app(settings, ollama_transport=...)`, started and closed for you. **By default Ollama is down**, so no test can reach a real model. Overrides change any setting (`make_client(simulation=True)`) |
| `client` | `make_client()` with defaults |

Typical test:

```python
from conftest import FakeOllama

def test_small_talk_uses_the_ai(make_client):
    ollama = FakeOllama(reply="Good morning! Ready for a great day?")
    client = make_client(ollama)
    r = client.post("/chat", json={"session_id": "t1", "message": "Good morning"}).json()
    assert r["category"] == "small_talk" and r["ai_used"] is True
    assert ollama.chat_calls[0]["options"]["num_predict"] == 120
```

To control time, build the stores directly with an injected clock (`SessionStore(clock=...)`, `SimulatedBracelets(clock=...)`). To fix canned wordings, replace `client.app.state.services.chat._rng` with a seeded `random.Random`.

## What each file covers

| File | Focus |
|---|---|
| `test_intent.py` | Router: emergency phrases (≥ 5 per language), health, ambiguous, small talk, fallback, strict order, earliest emergency wins, normalization, post-filter, malformed keywords fail fast, injury kinds, idioms, acknowledgements and help |
| `test_shared_cases.py` | Every case in `shared/router_cases.json` (the front-end runs the same ones) |
| `test_router_flows.py` | Full chat flows: clear phrases open protocols, safety/negated/pain questions and their answers, injuries, pending-question expiry and reset, idioms, brief replies, no repeated wordings, seedable fallback, language per message, `tokenize`, `answer()`, and that the language word lists match `front-end/src/lib/language.js` |
| `test_chat.py` | Emergencies in both languages, health never calls the AI, indicator and symptom answers, clarifying question, fallback, typos in greetings, language resolution, unknown crew never blocks an emergency, validation, injury questions and AI wording |
| `test_ai.py` | Ollama options, Spanish small talk, canned replies when down / bad responses / slow, canned replies never touch health, post-filter, `clean_reply`, `/status`, configurable model, warm-up does not block startup |
| `test_language.py` | `detect_language`, `shared/language_cases.json`, canned replies are never taken for the other language, AI replies in the wrong language are replaced |
| `test_sessions.py` | 10 turns max, 10-minute expiry, sweeper, crew switch, only small talk history reaches the AI, `/session/reset`, `/identify` |
| `test_support.py` | Key moments, precedence, keywords ↔ replies, no labels, generic vs personalized replies, safety line, profile language, AI notes, crisis is never personalized, mood guidance, consent rules, example and local profiles are valid, no diagnostic language, profile content never logged |
| `test_manual.py`, `test_api_manual.py` | Manual completeness, localization, range texts, sources, required emergency steps, no diagnostic language, broken manual fails fast; the `/manual` and `/protocols` endpoints |
| `test_evaluator.py` | Boundary values per indicator, manual bands agree with the evaluator, unit aliases, invalid readings |
| `test_measurements.py` | Unassigned readings and assignment, urgent → alert, validation, language, filters, naive timestamps, file content, restart, corrupt file, retention |
| `test_alerts.py` | Report alerts from the chat, reuse, acknowledge vs resolve, resolve all |
| `test_bracelets.py` | Live and daily signs, valid values, quiet crew, one alert per indicator, re-arming, snapshots, demo controls, localized neutral labels, endpoints, scenario ids match the front-end, every scenario reaches urgent, baselines in range |
| `test_records.py` | Maneuver alert once, unknown crew never blocks, report queued for Earth, validation, announcements, access log, wipe keeps announcements |
| `test_sync_export.py` | Sync status and simulation, persisted `synced` flag, background sync online/offline, JSON and CSV export, wipe confirmation |
| `test_voice.py` | `/tts` with a fake voice module; English refused; disabled/missing voice; text never logged; spoken forms; real voice if installed |
| `test_hardening.py` | NaN/Infinity → 422 (not 500), blank message, stripped message, 422 never echoes input, unknown crew, `/status` cache, circuit breaker, `/tts` 429 and slot release, text length limit |
| `test_privacy.py` | No chat text in the measurements file or the logs; chat alone writes nothing to disk |

## Terminal chat helper (`scripts/chat.py`)

Talk to a running backend without the front-end:

```bash
python scripts/chat.py                       # English, no crew member
python scripts/chat.py --crew moises         # as Moisés
python scripts/chat.py --lang es             # force Spanish
python scripts/chat.py --url http://host:8000
```

It checks `/status` first (prints the version, whether the AI is on and the model), uses a random `cli-xxxxxxxx` session id, and prints each reply with its category, language, AI/no AI, time, protocol, indicator and suggestions. `/reset` calls `POST /session/reset`; `/quit` or `/exit` leaves. Nothing is saved.

## Adding tests

- Put routing cases that both sides must agree on in `shared/router_cases.json` or `shared/language_cases.json` instead of only in a Python test.
- Use `make_client(FakeOllama(...))` for anything that involves the AI; never depend on a real model.
- If a feature writes to disk, assert on the file content (only allowed fields) and on the logs (no message content), like `test_privacy.py`.
