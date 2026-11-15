"""Router flows: safety questions, negations, pain without an exact phrase, injury follow-ups,
acknowledgements, help, varied fallback. Emergency protocols are always opened by the router (never the AI)."""

from __future__ import annotations

import re

import pytest
from conftest import FakeOllama

from app.config import REPO_DIR
from app.intent import KeywordRouter, tokenize
from app.sessions import SessionStore


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
    return make_client(ollama)


@pytest.fixture
def offline(make_client):
    return make_client(FakeOllama(up=False))


@pytest.fixture(scope="module")
def router(shared_dir) -> KeywordRouter:
    return KeywordRouter.load(shared_dir / "keywords.json")


# ---------------------------------------------------------------- direct emergencies never regress
@pytest.mark.parametrize(
    "message,protocol",
    [
        ("no puedo respirar", "breathing_difficulty"),
        ("dolor de pecho", "chest_pain"),
        ("se desmayó", "fainting_unresponsive"),
        ("sangra mucho", "bleeding"),
        ("No, no puedo respirar", "breathing_difficulty"),  # "no" here is the answer, not a negation
        ("No, sangra mucho", "bleeding"),
        ("me quiero matar", "emotional_crisis"),
        ("me estoy ahogando", "breathing_difficulty"),
        ("me estoy desangrando", "bleeding"),
        ("vi todo negro y me caí", "fainting_unresponsive"),
        ("No pude respirar", "breathing_difficulty"),
        ("I could not breathe", "breathing_difficulty"),
        ("no puedo respira", "breathing_difficulty"),
        ("me duele el pexo", "chest_pain"),
        ("Pecho oprimido", "chest_pain"),
    ],
)
def test_clear_phrases_open_the_protocol_directly(live, ollama, message, protocol):
    data = chat(live, message)
    assert data["category"] == "emergency" and data["protocol"]["name"] == protocol
    assert data["ai_used"] is False and ollama.chat_calls == []


def test_emotional_crisis_keeps_its_own_intro(live):
    data = chat(live, "me quiero matar")
    assert data["reply"].startswith("Gracias por decírmelo")


# ---------------------------------------------------------------- weak phrases and stems: safety question
@pytest.mark.parametrize(
    "message,protocol",
    [
        ("me da un infarto", "chest_pain"),
        ("heart attack", "chest_pain"),
        ("quiero acabar con todo", "emotional_crisis"),
        ("quiero desaparecer", "emotional_crisis"),
        ("me siento morir", "emotional_crisis"),
        ("estoy ahogado de trabajo", "breathing_difficulty"),  # stem "ahog"
        ("necesito ayuda", "general_emergency"),
    ],
)
def test_weak_phrases_ask_a_safety_question_first(offline, message, protocol):
    ask = chat(offline, message)
    assert ask["category"] == "ambiguous" and ask["protocol"] is None
    assert ask["suggestions"][0].startswith(("Sí", "Yes")) and ask["suggestions"][1].startswith("No")
    yes = chat(offline, ask["suggestions"][0])
    assert yes["category"] == "emergency" and yes["protocol"]["name"] == protocol


def test_a_no_to_the_safety_question_does_not_open_the_protocol(offline):
    chat(offline, "me da un infarto")
    data = chat(offline, "No, estoy bien")
    assert data["category"] == "ambiguous" and data["protocol"] is None


def test_the_crisis_safety_question_opens_the_emotional_protocol_with_its_intro(offline):
    chat(offline, "quiero desaparecer")
    data = chat(offline, "Sí, necesito ayuda")
    assert data["protocol"]["name"] == "emotional_crisis" and data["reply"].startswith("Gracias por decírmelo")


def test_the_safety_question_does_not_alert_until_confirmed(live):
    chat(live, "me da un infarto", crew_id="moises")
    assert live.get("/alerts").json() == []
    chat(live, "Sí, necesito ayuda", crew_id="moises")
    assert [a["protocol"] for a in live.get("/alerts").json()] == ["chest_pain"]


# ---------------------------------------------------------------- negations (option B)
@pytest.mark.parametrize(
    "message",
    ["no sangra", "no tengo dolor de pecho", "no me desmayé", "I don't have chest pain", "no hay sangrado"],
)
def test_negated_emergency_phrase_asks_for_confirmation(offline, message):
    data = chat(offline, message)
    assert data["category"] == "ambiguous" and data["protocol"] is None
    assert data["suggestions"] == ["Sí, todo bien", "No, sí ocurre"] or data["suggestions"][0].startswith("Yes")
    assert data["reply"].startswith(("Entendido", "Understood"))


def test_negation_flow_all_good_or_it_is_happening(offline):
    chat(offline, "no sangra", session_id="a")
    assert chat(offline, "Sí, todo bien", session_id="a")["category"] == "ambiguous"
    chat(offline, "no sangra", session_id="b")
    assert chat(offline, "No, sí ocurre", session_id="b")["protocol"]["name"] == "bleeding"


def test_negation_does_not_hide_a_second_real_symptom(offline):
    data = chat(offline, "no se desmayó pero sangra mucho")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "bleeding"


def test_self_harm_is_never_treated_as_negated(offline):
    assert chat(offline, "no quiero vivir")["category"] == "emergency"
    assert chat(offline, "no me quiero matar", session_id="x")["category"] == "emergency"


# ---------------------------------------------------------------- pain without an exact phrase
@pytest.mark.parametrize(
    "message,protocol",
    [
        ("me molesta el pecho", "chest_pain"),
        ("tengo una molestia en el pecho", "chest_pain"),
        ("respiro raro", "breathing_difficulty"),
        ("me duele al respirar", "breathing_difficulty"),
    ],
)
def test_chest_or_breathing_discomfort_asks_if_it_is_strong(offline, message, protocol):
    ask = chat(offline, message)
    assert ask["category"] == "ambiguous" and len(ask["suggestions"]) == 2
    assert chat(offline, ask["suggestions"][0])["protocol"]["name"] == protocol
    chat(offline, message, session_id="other")
    assert chat(offline, "No, es leve", session_id="other")["category"] == "ambiguous"


def test_chest_pain_question_wording(offline):
    ask = chat(offline, "me molesta el pecho")
    assert ask["reply"] == "¿Es un dolor fuerte u opresión?"
    assert ask["suggestions"] == ["Sí, es fuerte", "No, es leve"]


# ---------------------------------------------------------------- injuries: one question per type
@pytest.mark.parametrize(
    "message,keyword",
    [
        ("me quemé", "quemadura"),
        ("me golpeé la cabeza", "conocimiento"),
        ("me caí", "dolor fuerte"),
        ("me torcí el tobillo", "hinchazón"),
        ("I burned my hand", "burn"),
        ("I hit my head", "consciousness"),
        ("I fell", "pain"),
    ],
)
def test_each_injury_type_asks_its_own_question_not_the_bleeding_one(offline, message, keyword):
    data = chat(offline, message)
    assert data["category"] == "ambiguous" and keyword in data["reply"]
    assert "sangr" not in data["reply"] and "bleeding" not in data["reply"]
    assert len(data["suggestions"]) == 2


def test_serious_answer_to_a_burn_escalates_and_mild_reassures(offline):
    ask = chat(offline, "me quemé", session_id="a")
    esc = chat(offline, ask["suggestions"][0], session_id="a")
    assert esc["category"] == "emergency" and esc["protocol"]["name"] == "general_emergency"
    chat(offline, "me quemé", session_id="b")
    mild = chat(offline, "No, es pequeña", session_id="b")
    assert mild["category"] == "ambiguous" and mild["protocol"] is None


def test_scrape_asks_about_bleeding(offline):
    data = chat(offline, "me raspé la rodilla")
    assert "sangrando" in data["reply"] and len(data["suggestions"]) == 3


@pytest.mark.parametrize("text", ["poco", "no mucho", "es leve", "No es grave", "no es muy grave", "Es poca cosa"])
def test_free_text_mild_answer_reassures(offline, text):
    chat(offline, "me lastimé la mano")
    data = chat(offline, text)
    assert data["category"] == "ambiguous" and data["protocol"] is None and "sangre" not in data["reply"].lower()


@pytest.mark.parametrize("text", ["es grave", "bastante", "mucho", "Sí", "No, es grave"])
def test_free_text_serious_answer_opens_the_bleeding_protocol(offline, text):
    chat(offline, "me lastimé la mano")
    data = chat(offline, text)
    assert data["category"] == "emergency" and data["protocol"]["name"] == "bleeding"


def test_unrelated_message_after_the_question_is_a_new_topic(offline):
    chat(offline, "me lastimé la mano")
    assert chat(offline, "no me siento bien")["category"] == "health"
    # The pending question was consumed: "mucho" alone is no longer an injury answer.
    assert chat(offline, "mucho")["category"] != "emergency"


def test_a_muddled_answer_is_asked_once_more_then_dropped(offline):
    chat(offline, "me quemé")
    again = chat(offline, "mmm")
    assert again["category"] == "ambiguous" and again["reply"].startswith("Quiero estar segura")
    assert chat(offline, "mmm")["category"] != "ambiguous"


def test_pending_question_is_per_session(offline):
    chat(offline, "me lastimé la mano", session_id="a")
    assert chat(offline, "mucho", session_id="b")["category"] != "emergency"


def test_pending_expires_after_its_ttl():
    now = [0.0]
    store = SessionStore(ttl_s=600, clock=lambda: now[0], pending_ttl_s=120)
    store.open("s")
    store.set_pending("s", "safety", "chest_pain")
    now[0] = 100
    assert store.pending("s").protocol == "chest_pain"
    now[0] = 121
    assert store.pending("s") is None


def test_pending_is_cleared_on_crew_switch_and_reset():
    store = SessionStore()
    store.open("s", "moises")
    store.set_pending("s", "safety", "chest_pain")
    store.open("s", "ana")
    assert store.pending("s") is None
    store.set_pending("s", "safety", "chest_pain")
    store.reset("s")
    assert store.pending("s") is None


@pytest.mark.parametrize("message", ["fue un golpe de suerte", "me cae mal el desayuno", "estoy muerto de cansancio", "I'm burned out"])
def test_idioms_do_not_open_injury_conflict_or_emergency(offline, message):
    data = chat(offline, message)
    assert data["category"] not in ("emergency",)
    assert not (data["category"] == "ambiguous" and "?" in data["reply"] and "sangr" in data["reply"])
    assert data["moment"] != "conflict"


# ---------------------------------------------------------------- acknowledgements, help, variety
@pytest.mark.parametrize("message", ["ok", "vale", "👍", "😀", "jajaja", "haha", "Okey"])
def test_short_acknowledgements_get_a_brief_natural_reply(live, ollama, message):
    data = chat(live, message)
    assert data["category"] == "small_talk" and data["ai_used"] is False
    assert "entend" not in data["reply"].lower() and "didn't quite get" not in data["reply"]
    assert len(data["reply"]) < 80 and ollama.chat_calls == []


@pytest.mark.parametrize("message", ["ayuda", "help", "dime algo"])
def test_help_lists_capabilities_with_buttons(offline, message):
    data = chat(offline, message)
    assert data["category"] == "small_talk" and len(data["suggestions"]) >= 3
    for suggestion in data["suggestions"]:
        assert chat(offline, suggestion, session_id="b")["category"] in ("health", "support")


def test_repeated_greeting_never_repeats_the_same_phrase_twice_in_a_row(offline):
    replies = [chat(offline, "hola")["reply"] for _ in range(12)]
    assert all(a != b for a, b in zip(replies, replies[1:]))


def test_fallback_varies_between_wordings(offline):
    replies = [chat(offline, "What time is the docking?")["reply"] for _ in range(10)]
    assert len(set(replies)) >= 3
    assert all(a != b for a, b in zip(replies, replies[1:]))


def test_fallback_is_seedable(make_client):
    import random

    def run(seed):
        client = make_client(FakeOllama(up=False))
        client.app.state.services.chat._rng = random.Random(seed)
        return [chat(client, "What time is the docking?", session_id=f"s{i}")["reply"] for i in range(6)]

    assert run(7) == run(7)


def test_bye_in_a_spanish_session_is_answered_in_english(offline):
    assert chat(offline, "hola")["language"] == "es"
    assert chat(offline, "bye")["language"] == "en"


# ---------------------------------------------------------------- router unit checks
def test_tokenize_marks_punctuation_breaks():
    tokens, breaks = tokenize("No, sangra mucho")
    assert tokens == ["no", "sangra", "mucho"] and breaks == [False, True, False]


@pytest.mark.parametrize(
    "text,graded,expected",
    [
        ("poco", True, "no"),
        ("no mucho", True, "no"),
        ("bastante", True, "yes"),
        ("No, es grave", True, "yes"),
        ("no es grave", True, "no"),
        ("Sí, necesito ayuda", False, "yes"),
        ("No, estoy bien", False, "no"),
        ("no sé", True, None),
        ("mmm", True, None),
    ],
)
def test_answer_reading(router, text, graded, expected):
    assert router.answer(text, graded=graded) == expected


def test_language_word_lists_match_the_front_end():
    from app import language

    js = (REPO_DIR / "front-end" / "src" / "lib" / "language.js").read_text(encoding="utf-8")
    for name, words in (("ES", language._ES), ("EN", language._EN)):
        match = re.search(rf"const {name} = new Set\(\s*'([^']+)'", js)
        assert match, name
        assert set(match.group(1).split(" ")) == set(words), name
