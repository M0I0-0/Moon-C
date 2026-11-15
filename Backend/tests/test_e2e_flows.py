"""End-to-end flows through the real app (TestClient): wellbeing, crew data by chat, emergencies, other languages."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest
from conftest import SHARED_DIR, FakeOllama

from app.multilingual import EMERGENCY_BUTTONS, SAFETY_LINE
from app.storage import now_utc
from app.wellbeing import BRIDGE, YES_NO

ADVICE = json.loads((SHARED_DIR / "support_advice.json").read_text(encoding="utf-8"))
ANX, LOW = ADVICE["anxiety_crisis"], ADVICE["low_mood"]
LANGS = ["es", "en", "ru", "de"]
ANXIETY = {"es": "estoy en pánico", "en": "I'm panicking", "ru": "Я паникую", "de": "Ich habe eine Panikattacke"}
LOW_MOOD = {"es": "me siento triste", "en": "I feel sad", "ru": "Мне грустно", "de": "Ich bin traurig"}
STILL_BAD = {"es": "sigo mal", "en": "I'm still not better", "ru": "Мне все еще плохо", "de": "Mir geht es nicht besser"}
FEVER = {"es": "tengo 40 de temperatura", "ru": "у меня температура 40", "de": "ich habe 40 Grad Fieber"}
EMERGENCY = {
    "es": ("tengo dolor de pecho", "chest_pain"),
    "en": ("I have chest pain", "chest_pain"),
    "ru": ("У меня боль в груди", "chest_pain"),
    "de": ("Ich habe Brustschmerzen", "chest_pain"),
}
FRENCH = "Bonjour, je voudrais savoir comment fonctionne la station"
CHINESE = "你好，我头疼得厉害"


def chat(client, message, session="e1", **extra):
    res = client.post("/chat", json={"session_id": session, "message": message, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def alerts(client, **params):
    return client.get("/alerts", params=params).json()


@pytest.fixture
def offline(make_client):
    return make_client(FakeOllama(up=False))


@pytest.fixture
def live(make_client):
    ollama = FakeOllama(reply="Bonjour ! Je suis là pour discuter avec vous.")
    client = make_client(ollama)
    client.ollama = ollama
    return client


# --------------------------------------------------------------------------- (a) acute anxiety
@pytest.mark.parametrize("lang", LANGS)
def test_acute_anxiety_flow(offline, lang):
    first = chat(offline, ANXIETY[lang], crew_id="ruben", language=lang)
    assert first["category"] == "support" and first["guide"] == "breathing" and first["language"] == lang
    assert first["reply"].startswith(ANX["first_response"][lang])  # help starts before any question
    assert first["reply"].endswith(ANX["safety_check"]["question"][lang])
    assert first["suggestions"][:2] == YES_NO[lang]
    assert first["ai_used"] is False
    yes = chat(offline, YES_NO[lang][0], crew_id="ruben", language=lang)
    assert yes["category"] == "emergency" and yes["protocol"]["name"] == "chest_pain"
    found = alerts(offline)
    assert sorted(a["protocol"] for a in found) == ["breathing_difficulty", "chest_pain", "fainting_unresponsive"]
    assert len({a["id"] for a in found}) == 3


@pytest.mark.parametrize("lang", LANGS)
def test_still_bad_twice_escalates_to_the_medical_officer(offline, lang):
    chat(offline, ANXIETY[lang], crew_id="ruben", language=lang)
    chat(offline, YES_NO[lang][1], crew_id="ruben", language=lang)
    assert alerts(offline) == []
    chat(offline, STILL_BAD[lang], crew_id="ruben", language=lang)  # 2nd breathing round
    grounding = chat(offline, STILL_BAD[lang], crew_id="ruben", language=lang)
    assert grounding["guide"] == "grounding" and alerts(offline) == []
    last = chat(offline, STILL_BAD[lang], crew_id="ruben", language=lang)
    assert last["reply"] == BRIDGE[lang]["not_improving"]
    (alert,) = alerts(offline)
    assert alert["kind"] == "support" and alert["crew_id"] == "ruben"


# --------------------------------------------------------------------------- (b) low mood
@pytest.mark.parametrize("lang", LANGS)
def test_low_mood_gives_intro_and_tips_without_repeating(offline, lang):
    first = chat(offline, LOW_MOOD[lang], language=lang)
    assert first["category"] == "support" and first["moment"] == "low_mood" and first["ai_used"] is False
    assert first["reply"].startswith(LOW["intro"][lang])
    tips = {t["id"]: t["text"][lang] for t in LOW["tips"]}
    shown_first = {i for i, text in tips.items() if text in first["reply"]}
    assert len(shown_first) == 2
    second = chat(offline, LOW_MOOD[lang], language=lang)
    shown_second = {i for i, text in tips.items() if text in second["reply"]}
    assert len(shown_second) == 3 and not shown_first & shown_second


# --------------------------------------------------------------------------- wellbeing buttons in the 4 languages
def _episode(client, lang, session):
    chat(client, ANXIETY[lang], session=session, crew_id="ruben", language=lang)


@pytest.mark.parametrize("lang", LANGS)
def test_every_wellbeing_button_is_recognised(offline, lang):
    breathe_b, ground_b, better_b, worse_b = BRIDGE[lang]["buttons"]
    advice = ANX["suggestions"][lang]  # breathe, grounding, notify, better
    count = 0

    def run(label):
        nonlocal count
        count += 1
        _episode(offline, lang, f"btn{count}")
        return chat(offline, label, session=f"btn{count}", crew_id="ruben", language=lang)

    for label in {breathe_b, advice[0]}:
        assert run(label)["guide"] == "breathing", label
    for label in {ground_b, advice[1]}:
        assert run(label)["guide"] == "grounding", label
    for label in {better_b, advice[3]}:
        assert run(label)["reply"] == ANX["after"][lang], label
    data = run(worse_b)
    assert data["category"] == "support" and data["guide"] == "breathing", worse_b
    assert run(advice[2])["reply"] == BRIDGE[lang]["notified"], advice[2]
    assert "support" in [a["kind"] for a in alerts(offline)]


@pytest.mark.parametrize("lang", LANGS)
def test_after_and_low_mood_suggestions_are_recognised(offline, lang):
    after = ANX["after"]["suggestions"][lang]
    for session, index, expected in (("aft1", 1, "declined"), ("aft2", 0, "notified")):
        _episode(offline, lang, session)
        chat(offline, BRIDGE[lang]["buttons"][2], session=session, crew_id="ruben", language=lang)  # better
        data = chat(offline, after[index], session=session, crew_id="ruben", language=lang)
        assert data["reply"] == BRIDGE[lang][expected], after[index]

    activity, talk, notify = LOW["suggestions"][lang]
    small = next(t["text"][lang] for t in LOW["tips"] if t["id"] == "small_activity")
    assert chat(offline, activity, session="lm1", crew_id="ruben", language=lang)["reply"] == small
    asked = chat(offline, talk, session="lm2", crew_id="ruben", language=lang)["reply"]
    assert asked.endswith(BRIDGE[lang]["ask_notify"])
    assert chat(offline, notify, session="lm3", crew_id="ruben", language=lang)["reply"] == BRIDGE[lang]["notified"]


# --------------------------------------------------------------------------- (c) crew data by chat
@pytest.mark.parametrize("lang", ["es", "ru", "de"])
def test_reading_by_chat_stores_measurement_and_raises_a_visible_alert(offline, lang):
    data = chat(offline, FEVER[lang], crew_id="ruben")
    assert data["measurement_recorded"] is True and data["indicator"] == "body_temperature"
    assert data["language"] == lang
    (alert,) = alerts(offline)  # visible without any crew account
    assert (alert["kind"], alert["crew_id"], alert["indicator"], alert["status"]) == (
        "vital", "ruben", "body_temperature", "urgent"
    )
    stored = offline.get("/measurements", params={"crew_id": "ruben"}).json()
    assert [(m["indicator"], m["value"]) for m in stored] == [("body_temperature", 40.0)]


def test_general_account_asks_how_a_crew_member_is_and_minutes_follow_the_last_notice(offline):
    crewdata = offline.app.state.services.chat.crewdata
    chat(offline, "tengo 40 de temperatura", crew_id="ruben")
    base = now_utc()
    crewdata.clock = lambda: base + timedelta(minutes=12)
    reply = chat(offline, "¿cómo está Rubén?", session="g1")["reply"]
    assert reply == "Hace 12 minutos Rubén notificó una temperatura alta."
    assert "40" not in reply
    chat(offline, "tengo 40.5 de temperatura", crew_id="ruben")  # same open alert: its time moves to the last notice
    assert len(alerts(offline)) == 1
    crewdata.clock = lambda: base + timedelta(minutes=13)
    reply = chat(offline, "¿cómo está Rubén?", session="g2")["reply"]
    # counted from the latest notice (a few ms after `base`), not from the first one (before it): 12, not 13
    assert reply == "Hace 12 minutos Rubén notificó una temperatura alta."


def test_without_alerts_the_answer_is_the_privacy_message(offline):
    chat(offline, "mi pulso es 70", crew_id="ruben")  # normal reading: no alert
    reply = chat(offline, "¿cómo está Rubén?", session="g5")["reply"]
    assert reply == "Rubén no tiene alertas activas. Sus datos individuales solo se comparten en una emergencia."
    assert "70" not in reply


# --------------------------------------------------------------------------- (d) direct emergencies
@pytest.mark.parametrize("lang", LANGS)
def test_direct_emergencies_still_open_the_protocol(offline, lang):
    message, protocol = EMERGENCY[lang]
    data = chat(offline, message, crew_id="ana")
    assert data["category"] == "emergency" and data["protocol"]["name"] == protocol and data["language"] == lang
    assert data["ai_used"] is False


# --------------------------------------------------------------------------- (e) other languages
@pytest.mark.parametrize("message", [FRENCH, CHINESE])
def test_other_language_without_ai_gets_only_the_safety_line_and_sos(offline, message):
    data = chat(offline, message)
    assert data["reply"] == SAFETY_LINE["en"] and data["ai_used"] is False
    assert data["suggestions"] == EMERGENCY_BUTTONS["en"] and "SOS" in data["suggestions"]


@pytest.mark.parametrize("message", [FRENCH, CHINESE])
def test_other_language_with_ai_gets_ai_reply_plus_safety_line(live, message):
    data = chat(live, message, language="de")
    assert data["ai_used"] is True
    assert data["reply"] == f"{live.ollama.reply} {SAFETY_LINE['de']}"
    assert data["suggestions"] == EMERGENCY_BUTTONS["de"]


# --------------------------------------------------------------------------- (f) es/en regressions
def test_es_en_basics_unchanged(offline):
    assert chat(offline, "dolor de pecho", session="r1")["protocol"]["name"] == "chest_pain"
    assert chat(offline, "I can't breathe", session="r2")["protocol"]["name"] == "breathing_difficulty"
    assert chat(offline, "Hola", session="r3")["category"] == "small_talk"
    assert chat(offline, "my heart rate is 70", session="r4", crew_id="ana")["measurement_recorded"] is True
    assert alerts(offline) == []
