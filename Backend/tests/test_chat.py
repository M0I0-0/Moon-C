"""/chat routing through the API: emergency and health never use the AI."""

from __future__ import annotations

import pytest
from conftest import FakeOllama


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def ollama() -> FakeOllama:
    return FakeOllama()


@pytest.fixture
def live(make_client, ollama):
    """Client whose (fake) Ollama is up, to prove it is NOT called where it must not be."""
    return make_client(ollama)


@pytest.mark.parametrize("language", ["en", "es"])
@pytest.mark.parametrize("message", ["chest pain", "dolor de pecho"])
def test_chest_pain_is_emergency_in_either_language(live, ollama, message, language):
    data = chat(live, message, language=language)
    assert data["category"] == "emergency"
    assert data["ai_used"] is False
    assert data["protocol"]["name"] == "chest_pain"
    assert data["language"] == language
    assert data["source"]
    assert ollama.chat_calls == []


def test_emergency_reply_in_spanish(live):
    data = chat(live, "¡No puedo respirar!", language="es")
    assert data["reply"].startswith("Esto puede ser una emergencia")
    assert "oficial médico" in data["reply"]
    assert data["protocol"]["name"] == "breathing_difficulty"
    assert data["protocol"]["steps"][0].startswith("Pon a la persona")


@pytest.mark.parametrize("message", ["What is a normal pulse?", "I feel sick", "Tengo fiebre", "How much should I sleep?"])
def test_health_never_calls_ai(live, ollama, message):
    data = chat(live, message)
    assert data["category"] == "health"
    assert data["ai_used"] is False
    assert data["source"]
    assert ollama.chat_calls == []


def test_indicator_answer_comes_from_manual(live):
    data = chat(live, "What is a normal pulse?")
    assert data["indicator"] == "heart_rate"
    assert "50–100 bpm" in data["reply"] and "reference values" in data["reply"]
    es = chat(live, "¿Cuál es mi pulso?", language="es")
    assert es["reply"].startswith("Frecuencia cardiaca:")


def test_symptom_answer_uses_guidance(live):
    data = chat(live, "I feel sick and have a fever")
    assert data["protocol"]["name"] == "feeling_unwell"
    assert data["protocol"]["type"] == "guidance"
    assert data["indicator"] == "body_temperature"


def test_ambiguous_asks_clarifying_question(live, ollama):
    en = chat(live, "I feel weird")
    assert en["category"] == "ambiguous"
    assert en["reply"].endswith("Does something hurt, or do you feel tired?")
    es = chat(live, "Me siento raro", language="es")
    assert es["reply"].endswith("¿Te duele algo o sientes cansancio?")
    assert ollama.chat_calls == []


def test_clarifying_suggestions_route_back(live):
    suggestions = chat(live, "I feel weird")["suggestions"]
    assert [chat(live, s)["category"] for s in suggestions] == ["health", "health", "small_talk"]


def test_fallback_offers_options(live, ollama):
    data = chat(live, "What time is the docking?")
    assert data["category"] == "fallback"
    assert data["ai_used"] is False
    assert "not sure" in data["reply"]
    assert ollama.chat_calls == []
    assert all(chat(live, s)["category"] == "health" for s in data["suggestions"])


def test_language_resolution(live):
    assert chat(live, "hello", crew_id="moises")["language"] == "es"
    assert chat(live, "hello", crew_id="moises", language="en")["language"] == "en"
    assert chat(live, "hello", session_id="anonymous")["language"] == "en"
    assert chat(live, "hello", session_id="other", crew_id="ana")["language"] == "en"


def test_unknown_crew_never_blocks_an_emergency(live):
    data = chat(live, "He is bleeding", crew_id="zeus")
    assert data["category"] == "emergency"
    assert data["language"] == "en"


def test_identified_crew_is_used_when_crew_id_is_omitted(live):
    live.post("/identify", json={"bracelet_id": "BR-001", "session_id": "tablet"})
    assert chat(live, "hola", session_id="tablet")["language"] == "es"


def test_chat_validation(live):
    assert live.post("/chat", json={"session_id": "s", "message": ""}).status_code == 422
    assert live.post("/chat", json={"message": "hi"}).status_code == 422
    assert live.post("/chat", json={"session_id": "s", "message": "hi", "language": "fr"}).status_code == 422
