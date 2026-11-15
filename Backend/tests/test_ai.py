"""Local AI: request options, canned fallback, timeout, post-filter, warm-up and /status."""

from __future__ import annotations

import time

import pytest
from conftest import FakeOllama

from app.ai import CANNED_REPLIES, SYSTEM_PROMPT, clean_reply
from app.intent import KeywordRouter

ALL_CANNED = {lang: [r for replies in kinds.values() for r in replies] for lang, kinds in CANNED_REPLIES.items()}


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_small_talk_uses_ai_with_required_options(make_client):
    ollama = FakeOllama(reply="Good morning, Ana! Ready for a great day?")
    data = chat(make_client(ollama), "Good morning, Moon-C", crew_id="ana")
    assert data["category"] == "small_talk"
    assert data["ai_used"] is True
    assert data["reply"] == "Good morning, Ana! Ready for a great day?"

    payload = ollama.chat_calls[0]
    assert payload["model"] == "qwen3.5:4b"
    assert payload["think"] is False and payload["stream"] is False
    assert payload["keep_alive"] == "30m"
    assert payload["options"] == {"num_predict": 120, "temperature": 0.7}
    system = payload["messages"][0]
    assert system["role"] == "system" and system["content"].startswith(SYSTEM_PROMPT)
    assert "Always reply in English, even if the crew member writes in another language." in system["content"]
    assert "Ana" in system["content"]
    assert "same language the crew member uses" not in system["content"]  # it contradicted the line above
    assert payload["messages"][-1] == {"role": "user", "content": "Good morning, Moon-C"}


def test_spanish_small_talk(make_client):
    ollama = FakeOllama(reply="¡Buenos días, Moisés! Que tengas un gran día.")
    data = chat(make_client(ollama), "Buenos días, Moon-C", crew_id="moises")
    assert data["language"] == "es" and data["ai_used"] is True
    system = ollama.chat_calls[0]["messages"][0]["content"]
    # Moon-C is female, and the model must not switch language.
    assert "Responde siempre en español, aunque te escriban en otro idioma, y usa el femenino al hablar de ti misma." in system


@pytest.mark.parametrize(
    ("message", "language", "kind"),
    [
        ("Good morning, Moon-C", "en", "greeting"),
        ("Buenos días, Moon-C", "es", "greeting"),
        ("Thanks!", "en", "thanks"),
        ("Gracias", "es", "thanks"),
        ("Bye", "en", "farewell"),
        ("¿Cómo estás?", "es", "casual"),
    ],
)
def test_canned_reply_when_ollama_is_down(make_client, message, language, kind):
    data = chat(make_client(FakeOllama(up=False)), message, language=language)
    assert data["category"] == "small_talk"
    assert data["ai_used"] is False
    assert data["reply"] in CANNED_REPLIES[language][kind]


@pytest.mark.parametrize(
    "ollama",
    [FakeOllama(chat_status=500), FakeOllama(chat_status=404), FakeOllama(reply="   "), FakeOllama(reply="<think>hmm")],
    ids=["http-500", "model-missing", "empty", "only-thinking"],
)
def test_canned_reply_on_bad_responses(make_client, ollama):
    data = chat(make_client(ollama), "Hello")
    assert data["ai_used"] is False
    assert data["reply"] in ALL_CANNED["en"]


def test_slow_ollama_times_out(make_client):
    client = make_client(FakeOllama(delay=2.0), ollama_timeout_s=0.3)
    start = time.perf_counter()
    data = chat(client, "Hello")
    assert data["ai_used"] is False
    assert time.perf_counter() - start < 1.5


def test_at_least_ten_canned_replies_per_language():
    for lang in ("en", "es"):
        assert len(set(ALL_CANNED[lang])) >= 10


def test_canned_replies_never_touch_health(shared_dir):
    router = KeywordRouter.load(shared_dir / "keywords.json")
    for replies in ALL_CANNED.values():
        for reply in replies:
            assert not router.mentions_health_or_emergency(reply), reply


def test_canned_replies_vary(make_client):
    client = make_client(FakeOllama(up=False))
    assert len({chat(client, "hello", session_id=f"s{i}")["reply"] for i in range(30)}) > 1


def test_post_filter_reroutes_symptom_reply(make_client):
    ollama = FakeOllama(reply="You might have a fever, check your temperature and rest.")
    data = chat(make_client(ollama), "Good morning, Moon-C")
    assert len(ollama.chat_calls) == 1  # the AI was asked...
    assert data["category"] == "health"  # ...but its reply was discarded
    assert data["ai_used"] is False
    assert "fever" not in data["reply"]
    assert data["reply"].startswith("I'll check the manual")
    assert data["source"]


def test_post_filter_reroutes_in_spanish(make_client):
    data = chat(make_client(FakeOllama(reply="Parece que tienes fiebre, mide tu temperatura.")), "Hola", language="es")
    assert data["category"] == "health" and data["ai_used"] is False
    assert data["reply"].startswith("Para cualquier tema de salud")


def test_post_filter_discards_emergency_words(make_client):
    data = chat(make_client(FakeOllama(reply="If you have chest pain, call someone.")), "Tell me a joke")
    assert data["category"] == "health" and data["ai_used"] is False


def test_post_filter_keeps_pleasantries(make_client):
    data = chat(make_client(FakeOllama(reply="Good night, sleep well!")), "Good night, Moon-C")
    assert data["category"] == "small_talk" and data["ai_used"] is True


def test_clean_reply():
    assert clean_reply("<think>reasoning</think> Hello there!") == "Hello there!"
    assert clean_reply("Hello there. How are you to", truncated=True) == "Hello there."
    assert clean_reply('"Quoted reply."') == "Quoted reply."
    assert clean_reply("  Multi\n line   reply ") == "Multi line reply"


def test_status(make_client):
    up = make_client(FakeOllama()).get("/status").json()
    assert up["backend"] == "ok"
    assert up["ollama_reachable"] is True and up["model_available"] is True
    assert up["model"] == "qwen3.5:4b"
    assert up["earth_link"] == "offline"
    down = make_client(FakeOllama(up=False)).get("/status").json()
    assert down["ollama_reachable"] is False and down["model_available"] is False
    other = make_client(FakeOllama(models=("llama3:8b",))).get("/status").json()
    assert other["ollama_reachable"] is True and other["model_available"] is False


def test_model_name_is_configurable(make_client):
    ollama = FakeOllama(models=("tiny:1b",))
    client = make_client(ollama, ollama_model="tiny:1b")
    assert client.get("/status").json()["model"] == "tiny:1b"
    chat(client, "hello")
    assert ollama.chat_calls[0]["model"] == "tiny:1b"


def test_warm_up_does_not_block_startup(make_client):
    ollama = FakeOllama(delay=3.0)
    start = time.perf_counter()
    client = make_client(ollama, ollama_warmup=True)
    assert time.perf_counter() - start < 2.0
    assert client.get("/manual/mood").status_code == 200  # serving while the model loads
    assert ("/api/generate", {"model": "qwen3.5:4b", "keep_alive": "30m"}) in ollama.requests
