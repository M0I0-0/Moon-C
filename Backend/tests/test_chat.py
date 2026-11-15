"""/chat routing through the API: emergency and health never use the AI."""

from __future__ import annotations

import pytest
from conftest import FakeOllama

from app.chat import TEXTS


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


@pytest.mark.parametrize("message,language", [("chest pain", "en"), ("dolor de pecho", "es")])
def test_chest_pain_is_emergency_in_either_language(live, ollama, message, language):
    # The reply follows the language of the message, whatever language the request asks for.
    data = chat(live, message, language="es" if language == "en" else "en")
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


def test_fallback_offers_options_when_the_ai_is_down(make_client):
    client = make_client(FakeOllama(up=False))
    data = chat(client, "What time is the docking?")
    assert data["category"] == "fallback"
    assert data["ai_used"] is False
    assert data["reply"] in TEXTS["en"]["fallback"]  # one of several wordings (was a single fixed sentence)
    assert all(chat(client, s)["category"] == "health" for s in data["suggestions"])


def test_unmatched_message_is_answered_by_the_ai(live, ollama):
    data = chat(live, "What time is the docking?")
    assert data["category"] == "small_talk" and data["ai_used"] is True
    assert len(ollama.chat_calls) == 1


@pytest.mark.parametrize("message", ["ola", "holaaa", "ola Moon-C", "grcias", "helo"])
def test_typos_in_short_greetings_are_still_small_talk(make_client, message):
    # AI down: the router alone must recognize the greeting (a canned reply, not "I didn't get that").
    data = chat(make_client(FakeOllama(up=False)), message)
    assert data["category"] == "small_talk" and data["ai_used"] is False


def test_a_typo_never_turns_a_real_message_into_a_greeting(live):
    # "hora" is one letter from "hola" but is not a greeting: it goes to the AI as open talk.
    assert chat(live, "hora")["ai_used"] is True
    assert chat(live, "no puedo respirar")["category"] == "emergency"


def test_language_resolution(live):
    # No clear language in the text ("ok"): request, then crew preference, then English.
    assert chat(live, "ok", crew_id="moises")["language"] == "es"
    assert chat(live, "ok", crew_id="moises", language="en")["language"] == "en"
    assert chat(live, "ok", session_id="anonymous")["language"] == "en"
    assert chat(live, "ok", session_id="other", crew_id="ana")["language"] == "en"


def test_reply_follows_the_language_of_each_message(live):
    assert chat(live, "hola", session_id="auto", crew_id="moises")["language"] == "es"
    assert chat(live, "i dont speak spanish", session_id="auto", crew_id="moises")["language"] == "en"
    # Ambiguous text keeps the language the person switched to...
    assert chat(live, "ok", session_id="auto", crew_id="moises")["language"] == "en"
    # ...and a clear message switches back.
    assert chat(live, "gracias, estoy bien", session_id="auto", crew_id="moises")["language"] == "es"


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


@pytest.mark.parametrize(
    "message",
    ["un compañero mío se hizo una cortada en el brazo", "me lastimé la mano", "tengo una herida", "he got a deep wound", "se quemo con la estufa"],
)
def test_a_possible_injury_asks_how_bad_it_is(make_client, message):
    data = chat(make_client(FakeOllama(up=False)), message)
    assert data["category"] == "ambiguous" and data["ai_used"] is False
    assert "?" in data["reply"] and data["protocol"] is None
    assert len(data["suggestions"]) == (2 if message == "se quemo con la estufa" else 3)  # a burn asks its own question


def test_the_injury_question_leads_to_the_bleeding_protocol_or_reassurance(make_client):
    client = make_client(FakeOllama(up=False))
    ask = chat(client, "se hizo una cortada", session_id="w")
    assert chat(client, ask["suggestions"][0], session_id="w")["protocol"]["name"] == "bleeding"
    for text in ask["suggestions"][1:]:
        assert chat(client, text, session_id="w")["category"] == "ambiguous"


def test_the_ai_words_the_injury_question_when_available(make_client):
    data = chat(make_client(FakeOllama(reply="Uy, lamento eso. ¿Está sangrando mucho?")), "se hizo una cortada")
    assert data["ai_used"] is True and data["reply"] == "Uy, lamento eso. ¿Está sangrando mucho?"


def test_an_ai_reply_with_a_list_or_numbers_is_discarded_for_injuries(make_client):
    data = chat(make_client(FakeOllama(reply="1. Lava la herida\n2. Pon un vendaje")), "se hizo una cortada")
    assert data["ai_used"] is False and "?" in data["reply"]
