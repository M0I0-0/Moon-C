"""In-memory chat context: turn limit, inactivity, crew switch, reset and identification."""

from __future__ import annotations

from conftest import FakeOllama

from app.sessions import SessionStore, Turn


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def turn(i: int = 0) -> Turn:
    return Turn("small_talk", f"user {i}", f"moon-c {i}")


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_keeps_at_most_ten_turns():
    store = SessionStore(max_turns=10)
    store.open("s")
    for i in range(12):
        store.add_turn("s", turn(i))
    turns = store.turns("s")
    assert len(turns) == 10
    assert turns[0].user == "user 2"


def test_cleared_after_ten_minutes_of_inactivity():
    clock = Clock()
    store = SessionStore(ttl_s=600, clock=clock)
    store.open("s", "ana")
    store.add_turn("s", turn())
    clock.now += 599
    assert len(store.turns("s")) == 1
    clock.now += 2
    assert store.turns("s") == []
    session = store.open("s")
    assert len(session.turns) == 0 and session.crew_id is None


def test_sweeper_drops_expired_sessions():
    clock = Clock()
    store = SessionStore(ttl_s=600, clock=clock)
    store.open("a")
    store.open("b")
    clock.now += 601
    store.open("c")
    assert store.purge_expired() == 2
    assert len(store) == 1


def test_crew_switch_clears_context():
    store = SessionStore()
    store.open("s", "ana")
    store.add_turn("s", turn())
    store.open("s", None)  # crew not given: keep the bound crew and context
    store.open("s", "ana")  # same crew: keep
    assert len(store.turns("s")) == 1
    store.open("s", "ruben")  # switch: clear
    assert store.turns("s") == []
    assert store.crew_of("s") == "ruben"


def test_chat_context_is_limited_to_ten_turns(make_client):
    client = make_client()
    for _ in range(12):
        chat(client, "hello", session_id="s")
    assert len(client.app.state.services.sessions.turns("s")) == 10


def test_small_talk_history_is_sent_to_the_ai(make_client):
    ollama = FakeOllama(reply="Nice to see you!")
    client = make_client(ollama)
    chat(client, "Hello", session_id="s")
    chat(client, "How are you?", session_id="s")
    messages = ollama.chat_calls[1]["messages"]
    assert [m["role"] for m in messages] == ["system", "user", "assistant", "user"]
    assert messages[1]["content"] == "Hello" and messages[2]["content"] == "Nice to see you!"


def test_health_turns_are_not_sent_to_the_ai(make_client):
    ollama = FakeOllama(reply="Nice to see you!")
    client = make_client(ollama)
    chat(client, "What is a normal pulse?", session_id="s")
    chat(client, "Hello", session_id="s")
    assert [m["role"] for m in ollama.chat_calls[0]["messages"]] == ["system", "user"]


def test_crew_switch_via_chat_clears_context(make_client):
    client = make_client()
    sessions = client.app.state.services.sessions
    chat(client, "hello", session_id="s", crew_id="ana")
    chat(client, "thanks", session_id="s", crew_id="ana")
    assert len(sessions.turns("s")) == 2
    chat(client, "hola", session_id="s", crew_id="moises")
    assert len(sessions.turns("s")) == 1
    assert sessions.crew_of("s") == "moises"


def test_session_reset(make_client):
    client = make_client()
    chat(client, "hello", session_id="s", crew_id="ana")
    res = client.post("/session/reset", json={"session_id": "s"})
    assert res.json() == {"session_id": "s", "cleared": True}
    sessions = client.app.state.services.sessions
    assert sessions.turns("s") == [] and sessions.crew_of("s") is None


def test_identify(make_client):
    client = make_client()
    chat(client, "hello", session_id="tablet", crew_id="ana")
    res = client.post("/identify", json={"bracelet_id": "br-001", "session_id": "tablet"})
    assert res.status_code == 200
    assert res.json() == {
        "crew_id": "moises",
        "name": "Moisés",
        "preferredLanguage": "es",
        "role": "flight_engineer",
        "session_cleared": True,
    }
    sessions = client.app.state.services.sessions
    assert sessions.turns("tablet") == [] and sessions.crew_of("tablet") == "moises"
    assert client.post("/identify", json={"bracelet_id": "BR-999"}).status_code == 404
    plain = client.post("/identify", json={"bracelet_id": "BR-002"}).json()
    assert plain["crew_id"] == "ana" and plain["session_cleared"] is False
