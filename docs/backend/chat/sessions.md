# Chat sessions (`sessions.py`)

Source: [`Backend/app/sessions.py`](../../../Backend/app/sessions.py).

`SessionStore` keeps the short-lived chat context, keyed by `session_id`, **in memory only**. Nothing here is ever written to disk or logged.

## Data

```python
@dataclass(frozen=True)
class Turn:            # one exchange
    category: str      # the reply's category (emergency, health, support, small_talk…)
    user: str
    assistant: str

@dataclass
class Pending:         # a question Moon-C just asked
    kind: str          # safety, negated, pain_<protocol> or wound_<kind>
    protocol: str | None   # protocol a "yes" (or "no, it is happening") opens
    expires_at: float
    tries: int = 0     # times it was repeated because the answer was unclear

@dataclass
class Session:
    session_id: str
    crew_id: str | None
    last_active: float
    turns: deque[Turn]          # maxlen = max_turns
    language: str | None = None # last language detected in the user's messages
    pending: Pending | None = None
```

## Lifetime rules

| Rule | Default | Setting |
|---|---|---|
| Turns kept per session | 10 | `MOON_C_SESSION_MAX_TURNS` |
| Cleared after inactivity | 600 s (10 min) | `MOON_C_SESSION_TTL_S` |
| Pending question lifetime | 120 s | fixed (`pending_ttl_s`) |
| Background sweep of expired sessions | every 60 s | `MOON_C_SESSION_SWEEP_INTERVAL_S` |

A context is also cleared:

- on a **crew switch**: a message with a different, known `crew_id` clears turns, language and pending question and binds the session to the new crew member;
- on **bracelet identification** (`POST /identify` with `session_id`): always a fresh context bound to that crew member;
- on **`POST /session/reset`**;
- on the **privacy wipe** (`DELETE /data`), which clears every session.

`crew_id=None` in a message keeps the crew already bound to the session, so a session identified by bracelet stays personal.

## API

| Method | Purpose |
|---|---|
| `open(session_id, crew_id=None)` | Get or create the session for a new message (handles expiry and crew switch) and touch `last_active` |
| `start_for_crew(session_id, crew_id)` | Fresh session bound to a crew member (`/identify`) |
| `add_turn(session_id, turn)` | Append a turn (ignored if the session was reset meanwhile) |
| `turns(session_id)` | Copy of the turns; empty if missing or expired |
| `set_language(session_id, lang)` | Remember the last detected language |
| `set_pending(session_id, kind, protocol, tries=0)` | Remember the question just asked (replaces any previous one) |
| `pending(session_id)` | The pending question, or `None` if missing or expired |
| `clear_pending(session_id)` | Forget it (done for every message before routing) |
| `crew_of(session_id)` | Bound crew id, or `None` |
| `reset(session_id)` | Drop one session |
| `purge_expired()` | Drop every expired session (the sweeper) |
| `clear_all()` | Drop everything (privacy wipe); returns the count |

Every method takes a `threading.Lock`. The clock is injectable (`clock=time.monotonic`), which is how tests advance time.

## What uses the context

- **Language:** the session's last language is the fallback for unclear messages ([README.md](README.md#language-resolution)).
- **AI history:** only `small_talk` and `support` turns are sent to the AI ([local-ai.md](local-ai.md)).
- **Conversation detection:** if the last turn was `small_talk` or `support`, an unmatched message keeps the conversation going instead of "I'm not sure".
- **No repeats:** the last reply is compared with the new canned wording.
- **Follow-up questions:** the pending question decides how the next message is read ([chat-service.md](chat-service.md#follow-up-questions)).

The front-end mirrors the 10-minute inactivity rule: it clears the log on screen and calls `POST /session/reset` ([frontend/app.md](../../frontend/app.md#privacy-timers)).
