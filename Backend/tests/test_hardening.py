"""QA hardening: NaN/Infinity, blank messages, 422 privacy, Ollama latency (cache + circuit breaker), /tts limits."""

from __future__ import annotations

import threading
import time

from tests.conftest import FakeOllama

CASUAL = {"session_id": "s1", "message": "Good morning, Moon-C"}


# --------------------------------------------------------------------------- NaN / Infinity
def test_nan_and_infinity_give_422_not_500(client):
    for literal in ("NaN", "Infinity", "-Infinity"):
        body = '{"indicator": "heart_rate", "value": %s, "unit": "bpm"}' % literal
        res = client.post("/measurements", content=body, headers={"content-type": "application/json"})
        assert res.status_code == 422, literal
        assert "detail" in res.json()


def test_nan_in_other_endpoints_is_422(client):
    res = client.post("/chat", content='{"session_id": "s", "message": NaN}', headers={"content-type": "application/json"})
    assert res.status_code == 422


# --------------------------------------------------------------------------- blank messages and 422 privacy
def test_blank_chat_message_is_422(client):
    for message in ("   ", "\n\t ", ""):
        assert client.post("/chat", json={"session_id": "s", "message": message}).status_code == 422


def test_chat_message_is_stripped(client):
    res = client.post("/chat", json={"session_id": "s", "message": "  hola  "})
    assert res.status_code == 200


def test_422_does_not_echo_the_input(client):
    secret = "dolor-secreto-" + "x" * 2100
    res = client.post("/chat", json={"session_id": "s", "message": secret})
    assert res.status_code == 422
    assert "dolor-secreto" not in res.text
    assert "input" not in res.text and "ctx" not in res.text
    err = res.json()["detail"][0]
    assert err["loc"] == ["body", "message"] and err["msg"]


# --------------------------------------------------------------------------- unknown crew_id
def test_unknown_crew_id_is_ignored_and_not_personalized(client):
    res = client.post("/chat", json={**CASUAL, "crew_id": "zeus"})
    assert res.status_code == 200
    assert res.json()["personalized"] is False
    emergency = client.post("/chat", json={"session_id": "s2", "crew_id": "zeus", "message": "I have chest pain"})
    assert emergency.status_code == 200
    assert emergency.json()["category"] == "emergency" and emergency.json()["personalized"] is False


# --------------------------------------------------------------------------- Ollama: cache and circuit breaker
def test_status_is_cached(make_client):
    ollama = FakeOllama(up=True)
    client = make_client(ollama, ollama_status_ttl_s=60)
    for _ in range(3):
        assert client.get("/status").json()["ollama_reachable"] is True
    assert sum(1 for path, _ in ollama.requests if path == "/api/tags") == 1


def test_status_ttl_zero_disables_cache(make_client):
    ollama = FakeOllama(up=True)
    client = make_client(ollama, ollama_status_ttl_s=0)
    client.get("/status")
    client.get("/status")
    assert sum(1 for path, _ in ollama.requests if path == "/api/tags") == 2


def test_chat_circuit_breaker_skips_a_down_ollama(make_client):
    ollama = FakeOllama(up=False)
    client = make_client(ollama, ollama_circuit_s=60, ollama_status_ttl_s=60)
    first = client.post("/chat", json=CASUAL)
    assert first.status_code == 200 and first.json()["ai_used"] is False
    attempts = len(ollama.requests)
    assert attempts == 1
    for i in range(3):
        res = client.post("/chat", json={**CASUAL, "session_id": f"n{i}"})
        assert res.status_code == 200 and res.json()["ai_used"] is False and res.json()["reply"]
    assert len(ollama.requests) == attempts  # no new connection attempts
    assert client.get("/status").json()["ollama_reachable"] is False
    assert len(ollama.requests) == attempts  # status reuses what the failed chat learned


def test_chat_retries_after_the_circuit_expires(make_client):
    ollama = FakeOllama(up=False)
    client = make_client(ollama, ollama_circuit_s=60)
    client.post("/chat", json=CASUAL)
    ai = client.app.state.services.ai_client
    ollama.up = True
    assert client.post("/chat", json=CASUAL).json()["ai_used"] is False  # still open
    ai._down_until = time.monotonic() - 1  # TTL elapsed
    res = client.post("/chat", json=CASUAL)
    assert res.json()["ai_used"] is True
    assert ai.circuit_open is False


def test_circuit_breaker_off_retries_every_time(make_client):
    ollama = FakeOllama(up=False)
    client = make_client(ollama, ollama_circuit_s=0)
    client.post("/chat", json=CASUAL)
    client.post("/chat", json={**CASUAL, "session_id": "b"})
    assert len(ollama.chat_calls) == 2


def test_server_error_does_not_open_the_circuit(make_client):
    ollama = FakeOllama(chat_status=500)
    client = make_client(ollama, ollama_circuit_s=60)
    client.post("/chat", json=CASUAL)
    client.post("/chat", json={**CASUAL, "session_id": "b"})
    assert len(ollama.chat_calls) == 2  # Ollama is up, just failing: keep trying


# --------------------------------------------------------------------------- /tts concurrency
class SlowVoice:
    """Stands in for the loaded voice model: blocks until released."""

    sr = 22050

    def __init__(self):
        self.entered = threading.Semaphore(0)
        self.release = threading.Event()

    def wav(self, text):
        self.entered.release()
        self.release.wait(5)
        return b"RIFF"


def test_tts_saturated_returns_429_then_recovers(make_client):
    client = make_client(tts_max_concurrent=1)
    voice = client.app.state.services.voice
    slow = SlowVoice()
    voice._voice, voice.state = slow, "ready"
    results = []
    worker = threading.Thread(target=lambda: results.append(client.post("/tts", json={"text": "Hola"})))
    worker.start()
    assert slow.entered.acquire(timeout=5)  # the only slot is busy
    busy = client.post("/tts", json={"text": "Hola otra vez"})
    assert busy.status_code == 429
    assert busy.headers["retry-after"] == "1" and "busy" in busy.json()["detail"]
    slow.release.set()
    worker.join(5)
    assert results[0].status_code == 200
    assert client.post("/tts", json={"text": "Hola"}).status_code == 200  # slot released


def test_tts_slot_is_released_on_error(make_client):
    client = make_client(tts_max_concurrent=1)
    for _ in range(3):  # voice disabled -> 503 each time, never 429
        assert client.post("/tts", json={"text": "Hola"}).status_code == 503


def test_tts_length_limit_still_enforced(client):
    assert client.post("/tts", json={"text": "x" * 1001}).status_code == 422
    assert client.post("/tts", json={"text": "x" * 1000}).status_code in (200, 503)
