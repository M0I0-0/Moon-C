"""Key mental-health moments, the emotional crisis protocol and private support profiles.

Tests use a made-up profile written to a temporary folder: they never read a real (private) one,
except test_local_profiles_are_valid, which only validates whatever exists on this machine.
"""

from __future__ import annotations

import json
import logging
import re

import pytest
from conftest import FakeOllama
from test_manual import DIAGNOSTIC_TERMS

from app.config import REPO_DIR
from app.crew import CrewRegistry
from app.intent import KeywordRouter
from app.support import MOMENTS, ProfileStore, SupportGuide, SupportProfile

SHARED = REPO_DIR / "shared"

PROFILE = {
    "crew_id": "ruben",
    "language": "es",
    "consent": {"crew_member": True, "friend": True},
    "ai_context": ["He stays calm under pressure and needs to talk things out with someone he trusts."],
    "avoid": ["Do not bring up romantic relationships unless he does."],
    "moments": {
        "stress": "Rubén, sé que sueles mantener la calma: si hoy te pesa, es mucho. ¿Me cuentas?",
        "low_mood": "Rubén, lo que haces por los demás sí deja huella.",
    },
    "mood_guidance": ["Línea personal de prueba para el ánimo."],
}


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def router() -> KeywordRouter:
    return KeywordRouter.load(SHARED / "keywords.json")


@pytest.fixture
def guide() -> SupportGuide:
    return SupportGuide.load(SHARED / "support.json")


@pytest.fixture
def profiles_dir(tmp_path):
    folder = tmp_path / "private_profiles"
    folder.mkdir()
    (folder / "ruben.json").write_text(json.dumps(PROFILE, ensure_ascii=False), encoding="utf-8")
    return folder


@pytest.fixture
def ollama() -> FakeOllama:
    return FakeOllama(reply="Te escucho, Rubén. Cuéntame qué pasó.")


@pytest.fixture
def client(make_client, ollama, profiles_dir):
    return make_client(ollama, profiles_dir=profiles_dir)


# ---------------------------------------------------------------------------------------- router
@pytest.mark.parametrize(
    ("text", "moment"),
    [
        ("Estoy muy estresado", "stress"),
        ("Tengo mucha presión con la caminata espacial", "stress"),
        ("I'm so stressed today", "stress"),
        ("Me siento bloqueado con este reporte", "frustration"),
        ("I'm frustrated with the robotic arm", "frustration"),
        ("Me equivoqué en la maniobra", "mistake"),
        ("I messed up the docking checklist", "mistake"),
        ("Discutí con Ana", "conflict"),
        ("Ana is mad at me", "conflict"),
        ("Extraño a mi familia", "homesick"),
        ("I miss my family", "homesick"),
        ("Me siento solo", "lonely"),
        ("I feel so lonely", "lonely"),
        ("Hoy estoy triste", "low_mood"),
        ("Siento que no soy suficiente", "low_mood"),
        ("I'm feeling down", "low_mood"),
    ],
)
def test_key_moments_are_detected(router, text, moment):
    intent = router.classify(text)
    assert (intent.category, intent.moment) == ("support", moment)


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("Estoy estresado y me duele la cabeza", "health"),  # a symptom wins over a feeling
        ("¿Cómo está mi presión arterial?", "health"),
        ("How is my mood?", "health"),
        ("Me siento extraño", "ambiguous"),  # 'extraño' = strange, not missing home
        ("Me muero de risa", "fallback"),
        ("Ya no quiero vivir", "emergency"),
        ("Estoy triste y quiero hacerme daño", "emergency"),  # crisis always wins
    ],
)
def test_moment_precedence(router, text, category):
    assert router.classify(text).category == category


def test_every_moment_has_keywords_and_replies(router, guide):
    assert router.support_moments == set(MOMENTS) == set(guide.moments)


def test_ai_may_talk_about_feelings_but_never_name_conditions(router):
    assert not router.mentions_health_or_emergency("Es normal sentir estrés en una misión así. Aquí estoy.")
    assert not router.mentions_health_or_emergency("I'm sorry you feel lonely today.")
    assert router.mentions_health_or_emergency("Eso suena a depresión.")
    assert router.mentions_health_or_emergency("It could be an anxiety disorder.")
    assert router.mentions_health_or_emergency("Check your heart rate.")


# ------------------------------------------------------------------------------------- support
def test_generic_support_reply_without_a_profile(client, ollama):
    data = chat(client, "I miss my family", crew_id="ana")
    assert data["category"] == "support" and data["moment"] == "homesick"
    assert data["personalized"] is False and data["ai_used"] is False
    assert data["reply"].startswith("It's natural to miss")
    assert data["suggestions"] and data["source"].startswith("Moon-C support guide")
    assert ollama.chat_calls == []


def test_personalized_support_reply_with_a_profile(client, ollama):
    data = chat(client, "Estoy muy estresado", crew_id="ruben")
    assert data["category"] == "support" and data["moment"] == "stress"
    assert data["personalized"] is True and data["language"] == "es"
    assert data["reply"] == PROFILE["moments"]["stress"]
    assert ollama.chat_calls == []


def test_moment_without_a_personal_reply_falls_back_to_the_guide(client):
    data = chat(client, "Me equivoqué en la maniobra", crew_id="ruben")
    assert data["personalized"] is False and data["reply"].startswith("Equivocarse es parte de aprender")


def test_low_mood_always_ends_with_the_safety_line(client):
    for crew_id in ("ruben", "valentina"):
        data = chat(client, "Hoy estoy triste", crew_id=crew_id, session_id=crew_id)
        assert data["reply"].endswith("Si en algún momento piensas en hacerte daño, dímelo a mí o a un compañero de inmediato.")
    assert chat(client, "Hoy estoy triste", crew_id="ruben", session_id="r2")["reply"].startswith("Rubén, lo que haces")


def test_profile_in_another_language_is_not_used(client):
    data = chat(client, "I'm so stressed", crew_id="ruben", language="en")
    assert data["personalized"] is False and data["reply"].startswith("Thank you for telling me")


def test_conversation_continues_with_the_ai_and_the_profile(client, ollama):
    chat(client, "Estoy muy estresado", crew_id="ruben")
    data = chat(client, "Es que el reporte de la misión no avanza y todos dependen de mí", crew_id="ruben")
    assert data["category"] == "small_talk" and data["ai_used"] is True and data["personalized"] is True
    messages = ollama.chat_calls[-1]["messages"]
    system = messages[0]["content"]
    assert "He stays calm under pressure" in system and "Do not bring up romantic relationships" in system
    assert "never use labels" in system and "Never quote these notes" in system
    assert messages[1]["content"] == "Estoy muy estresado"  # the support turn is part of the context
    assert messages[2]["content"] == PROFILE["moments"]["stress"]


def test_small_talk_is_personalized_only_for_the_crew_member_with_a_profile(client, ollama):
    chat(client, "Hola", crew_id="ruben", session_id="a")
    assert "He stays calm under pressure" in ollama.chat_calls[-1]["messages"][0]["content"]
    data = chat(client, "Hola", crew_id="valentina", session_id="b")
    assert "What you know about" not in ollama.chat_calls[-1]["messages"][0]["content"]
    assert data["personalized"] is False


def test_unmatched_message_outside_a_conversation_is_still_fallback(client, ollama):
    assert chat(client, "Esto es una prueba", crew_id="ruben")["category"] == "fallback"
    assert ollama.chat_calls == []


def test_ai_reply_with_a_label_is_replaced_by_a_listening_line(make_client, profiles_dir, guide):
    ollama = FakeOllama(reply="Parece que tienes depresión.")
    client = make_client(ollama, profiles_dir=profiles_dir)
    chat(client, "Hoy estoy triste", crew_id="ruben")
    data = chat(client, "No sé, todo me pesa", crew_id="ruben")
    assert data["ai_used"] is False and "depresión" not in data["reply"]
    assert data["reply"] in guide._data["continue"]["es"]


def test_without_ai_a_support_conversation_keeps_listening(make_client, profiles_dir, guide):
    client = make_client(FakeOllama(up=False), profiles_dir=profiles_dir)
    chat(client, "Me siento solo", crew_id="ruben")
    data = chat(client, "Hoy nadie habló conmigo en todo el día", crew_id="ruben")
    assert data["ai_used"] is False and data["reply"] in guide._data["continue"]["es"]


# -------------------------------------------------------------------------------------- crisis
@pytest.mark.parametrize("message", ["Ya no quiero vivir", "I want to kill myself"])
def test_crisis_opens_the_protocol_and_alerts_the_medical_officer(client, ollama, message):
    data = chat(client, message, crew_id="ruben")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "emotional_crisis"
    assert data["ai_used"] is False and ollama.chat_calls == []
    assert data["reply"].startswith(data["protocol"]["intro"])
    assert data["protocol"]["intro"].startswith("Gracias por decírmelo")  # Rubén's language
    assert client.get("/alerts").json()[0]["message"] == "Alert: Rubén reported emotional crisis"


def test_crisis_is_never_personalized(client):
    data = chat(client, "Me quiero morir", crew_id="ruben")
    assert "personalized" in data and data["personalized"] is False
    assert PROFILE["moments"]["low_mood"] not in data["reply"]


# ------------------------------------------------------------------------------ mood readings
def test_low_mood_reading_adds_the_profile_lines(client):
    data = client.post("/measurements", json={"crew_id": "ruben", "indicator": "mood", "value": 2, "unit": "/5"}).json()
    assert data["guidance"][0] == PROFILE["mood_guidance"][0]
    other = client.post("/measurements", json={"crew_id": "valentina", "indicator": "mood", "value": 2, "unit": "/5"}).json()
    assert PROFILE["mood_guidance"][0] not in other["guidance"]
    good = client.post("/measurements", json={"crew_id": "ruben", "indicator": "mood", "value": 4, "unit": "/5"}).json()
    assert PROFILE["mood_guidance"][0] not in good["guidance"]


# ------------------------------------------------------------------------------------ profiles
def test_profiles_are_loaded_only_with_consent_and_a_known_crew_member(tmp_path, caplog):
    crew = CrewRegistry.load(SHARED / "crew.json")
    (tmp_path / "ruben.json").write_text(json.dumps(PROFILE), encoding="utf-8")
    (tmp_path / "ana.json").write_text(json.dumps({**PROFILE, "crew_id": "ana", "consent": {}}), encoding="utf-8")
    (tmp_path / "zeus.json").write_text(json.dumps({**PROFILE, "crew_id": "zeus"}), encoding="utf-8")
    (tmp_path / "broken.json").write_text("{not json", encoding="utf-8")
    (tmp_path / "bad_moment.json").write_text(json.dumps({**PROFILE, "moments": {"joy": "?"}}), encoding="utf-8")
    with caplog.at_level(logging.INFO, logger="moon_c"):
        store = ProfileStore.load(tmp_path, crew)
    assert len(store) == 1 and store.get("ruben") is not None
    assert store.get("ana") is None and store.get(None) is None
    logs = caplog.text
    assert "no consent" in logs and "unknown crew_id" in logs and "not a valid profile" in logs
    assert "calm under pressure" not in logs and "sueles mantener la calma" not in logs  # never the content


def test_missing_profiles_folder_is_fine(tmp_path):
    assert len(ProfileStore.load(tmp_path / "nope", CrewRegistry.load(SHARED / "crew.json"))) == 0


def test_chat_never_logs_profile_content(client, caplog):
    with caplog.at_level(logging.DEBUG):
        chat(client, "Estoy muy estresado", crew_id="ruben")
        chat(client, "Todo depende de mí", crew_id="ruben")
    assert "sueles mantener la calma" not in caplog.text and "calm under pressure" not in caplog.text
    assert "Todo depende de mí" not in caplog.text


def test_example_profile_is_valid():
    profile = SupportProfile.model_validate(json.loads((SHARED / "support_profile.example.json").read_text(encoding="utf-8")))
    assert profile.consented and profile.moments and profile.ai_notes("Example")


def test_local_profiles_are_valid():
    """Validates the private profiles on this machine, if any (they are never committed)."""
    folder = SHARED / "profiles"
    files = sorted(folder.glob("*.json")) if folder.is_dir() else []
    if not files:
        pytest.skip("no private support profiles on this machine")
    crew = CrewRegistry.load(SHARED / "crew.json")
    for path in files:
        profile = SupportProfile.model_validate(json.loads(path.read_text(encoding="utf-8")))
        assert crew.get(profile.crew_id) is not None, path.name
        assert profile.consented, path.name
        texts = [*profile.moments.values(), *profile.mood_guidance]
        for text in texts:
            for term in DIAGNOSTIC_TERMS:
                assert not re.search(rf"\b{re.escape(term)}\b", text.lower()), (path.name, term)


# -------------------------------------------------------------------------------------- wording
def test_support_guide_has_no_diagnostic_language():
    data = json.loads((SHARED / "support.json").read_text(encoding="utf-8"))

    def texts(node):
        if isinstance(node, dict):
            for key, value in node.items():
                if not key.startswith("_"):
                    yield from texts(value)
        elif isinstance(node, list):
            for value in node:
                yield from texts(value)
        elif isinstance(node, str):
            yield node

    for text in texts(data["moments"]):
        for term in DIAGNOSTIC_TERMS:
            assert not re.search(rf"\b{re.escape(term)}\b", text.lower()), (term, text)
