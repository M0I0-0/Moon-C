"""Reply language: detection (shared cases), the General account's auto_language, AI replies in the
wrong language, and alerts in English."""

from __future__ import annotations

import json

import pytest
from conftest import FakeOllama

from app.ai import CANNED_REPLIES
from app.config import REPO_DIR
from app.intent import KeywordRouter, KeywordsError

CASES = json.loads((REPO_DIR / "shared" / "language_cases.json").read_text(encoding="utf-8"))["cases"]
OTHER = {"en": "es", "es": "en"}


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture(scope="module")
def router(shared_dir) -> KeywordRouter:
    return KeywordRouter.load(shared_dir / "keywords.json")


# --------------------------------------------------------------------------- detection
@pytest.mark.parametrize("case", CASES, ids=lambda c: c["text"])
def test_shared_language_cases(router, case):
    """The front-end (src/lib/assistant.js, detectLanguage) runs the same cases."""
    assert router.detect_language(case["text"]) == case["language"]


def test_hint_lists_exist_for_both_languages(shared_dir):
    hints = json.loads((shared_dir / "keywords.json").read_text(encoding="utf-8"))["language_hints"]
    assert len(hints["en"]) > 100 and len(hints["es"]) > 100


def test_a_word_in_both_languages_is_rejected(shared_dir):
    data = json.loads((shared_dir / "keywords.json").read_text(encoding="utf-8"))
    data["language_hints"]["es"].append("the")
    with pytest.raises(KeywordsError, match="'the'"):
        KeywordRouter(data)


def test_hints_must_be_single_words(shared_dir):
    data = json.loads((shared_dir / "keywords.json").read_text(encoding="utf-8"))
    data["language_hints"]["en"].append("good morning")
    with pytest.raises(KeywordsError, match="single words"):
        KeywordRouter(data)


@pytest.mark.parametrize("lang", ["en", "es"])
def test_canned_replies_are_never_taken_for_the_other_language(router, lang):
    for replies in CANNED_REPLIES[lang].values():
        for reply in replies:
            assert router.detect_language(reply) != OTHER[lang], reply


@pytest.mark.parametrize("lang", ["en", "es"])
def test_support_replies_are_never_taken_for_the_other_language(router, shared_dir, lang):
    support = json.loads((shared_dir / "support.json").read_text(encoding="utf-8"))
    texts = [m["reply"][lang] for m in support["moments"].values()] + support["continue"][lang]
    for text in texts:
        assert router.detect_language(text) != OTHER[lang], text


# --------------------------------------------------------------------------- auto_language (General account)
@pytest.fixture
def ollama() -> FakeOllama:
    return FakeOllama()


@pytest.fixture
def live(make_client, ollama):
    return make_client(ollama)


def test_auto_language_answers_in_the_message_language(live):
    en = chat(live, "What is a normal heart rate?", language="es", auto_language=True)
    assert en["language"] == "en" and en["reply"].startswith("Heart rate:")
    es = chat(live, "¿Cuál es mi pulso normal?", language="en", auto_language=True)
    assert es["language"] == "es" and es["reply"].startswith("Frecuencia cardiaca:")


@pytest.mark.parametrize("current", ["en", "es"])
def test_auto_language_keeps_the_current_language_when_unclear(live, current):
    assert chat(live, "ok", language=current, auto_language=True)["language"] == current


def test_auto_language_covers_emergencies_and_support(live, ollama):
    emergency = chat(live, "I can't breathe", language="es", auto_language=True)
    assert emergency["category"] == "emergency" and emergency["language"] == "en"
    assert emergency["protocol"]["language"] == "en" and emergency["reply"].startswith("This may be an emergency")
    support = chat(live, "Estoy muy estresado", language="en", auto_language=True, session_id="s2")
    assert support["category"] == "support" and support["language"] == "es"
    assert ollama.chat_calls == []


def test_without_auto_language_the_account_language_wins(live):
    """Crew accounts keep their language (by nationality): Moisés gets Spanish even if he writes in English."""
    data = chat(live, "What is a normal heart rate?", crew_id="moises")
    assert data["language"] == "es" and data["reply"].startswith("Frecuencia cardiaca:")


def test_auto_language_tells_the_ai_which_language_to_use(make_client):
    ollama = FakeOllama(reply="Hi! I'm doing great, thanks for asking.")
    data = chat(make_client(ollama), "Hi Moon-C, how are you?", language="es", auto_language=True)
    assert data["language"] == "en" and data["ai_used"] is True
    system = ollama.chat_calls[0]["messages"][0]["content"]
    assert "Always reply in English" in system and "Responde siempre en español" not in system


# --------------------------------------------------------------------------- AI reply in the wrong language
def test_ai_reply_in_another_language_is_replaced(make_client):
    """Ana (English) writes in Spanish and the model answers in Spanish: the reply would be read with the
    English voice and say language=en. Moon-C answers with a canned English reply instead."""
    ollama = FakeOllama(reply="¡Hola Ana! Estoy aquí contigo y lista para lo que necesites.")
    data = chat(make_client(ollama), "Hola Moon-C, ¿cómo estás hoy?", crew_id="ana")
    assert data["language"] == "en"
    assert data["ai_used"] is False
    assert data["reply"] in [r for replies in CANNED_REPLIES["en"].values() for r in replies]


def test_ai_reply_in_the_right_language_is_kept(make_client):
    ollama = FakeOllama(reply="¡Hola Moisés! Qué gusto saludarte.")
    data = chat(make_client(ollama), "Hola Moon-C", crew_id="moises")
    assert data["ai_used"] is True and data["reply"] == "¡Hola Moisés! Qué gusto saludarte."


def test_ai_reply_in_another_language_during_support_keeps_listening(make_client, shared_dir):
    support = json.loads((shared_dir / "support.json").read_text(encoding="utf-8"))
    ollama = FakeOllama(reply="Te entiendo, cuéntame más de lo que pasa.")
    client = make_client(ollama)
    assert chat(client, "I'm very stressed", crew_id="ana")["category"] == "support"
    data = chat(client, "It is all the work on the station", crew_id="ana")
    assert data["language"] == "en" and data["ai_used"] is False
    assert data["reply"] in support["continue"]["en"]


# --------------------------------------------------------------------------- alerts in English
def test_alerts_are_in_english_for_every_crew_member(live):
    chat(live, "Me duele el pecho", crew_id="moises")  # Moisés uses Spanish with Moon-C
    live.post("/maneuvers/start", json={"crew_id": "valentina", "maneuver": "rcp"})
    messages = sorted(a["message"] for a in live.get("/alerts").json())
    assert messages == ["Alert: CPR guide started (Valentina)", "Alert: Moisés reported chest pain"]


def test_maneuver_start_returns_the_alert_in_english(live):
    res = live.post("/maneuvers/start", json={"crew_id": "moises", "maneuver": "torniquete"})
    assert res.json()["message"] == "Alert: tourniquet guide started (Moisés)"


def test_spanish_alert_text_is_still_available_on_request(live):
    chat(live, "Me duele el pecho", crew_id="moises")
    assert live.get("/alerts", params={"language": "es"}).json()[0]["message"] == "Alerta: Moisés reportó dolor de pecho"
