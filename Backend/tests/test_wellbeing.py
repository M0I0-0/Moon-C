"""Wellbeing flows: acute anxiety (fast guided reply), exercises, low-mood tips, notices to the medical officer.

All texts come from shared/support_advice.json (never the AI). Alerts carry only the type, never chat text.
"""

from __future__ import annotations

import json

import pytest
from conftest import SHARED_DIR, FakeOllama

ADVICE = json.loads((SHARED_DIR / "support_advice.json").read_text(encoding="utf-8"))
ANX = ADVICE["anxiety_crisis"]
LOW = ADVICE["low_mood"]


def chat(client, message, session="w1", **extra):
    res = client.post("/chat", json={"session_id": session, "message": message, **extra})
    assert res.status_code == 200, res.text
    return res.json()


def alerts(client):
    return client.get("/alerts").json()


@pytest.fixture
def live(make_client):
    ollama = FakeOllama()
    client = make_client(ollama)
    client.ollama = ollama
    return client


ANXIETY_ES = [
    "me va a dar un ataque de pánico",
    "Me va a dar un ataque de ansiedad",
    "estoy en pánico",
    "no puedo calmarme",
    "me está dando un ataque de ansiedad",
    "estoy muy ansioso",
    "estoy muy ansiosa",
    "me late muy rápido y tengo miedo",
    "me va a dar un atake de panico",  # typo
    "estoy en panico no puedo calmarme ayudame",  # dictation, no punctuation
]
ANXIETY_EN = [
    "I'm panicking",
    "I can't calm down",
    "im having a panic attack",
    "i cant calm down",
    "my heart is racing and i'm scared",
    "I'm so anxious",
]


@pytest.mark.parametrize("message,lang", [(m, "es") for m in ANXIETY_ES] + [(m, "en") for m in ANXIETY_EN])
def test_anxiety_gets_the_fast_guided_reply(live, message, lang):
    data = chat(live, message)
    assert data["category"] == "support" and data["language"] == lang
    assert data["guide"] == "breathing"
    assert data["ai_used"] is False and live.ollama.chat_calls == []
    assert data["reply"].startswith(ANX["first_response"][lang])  # immediate, no question before help
    assert ANX["safety_check"]["question"][lang] in data["reply"]  # safety check in the same reply
    assert "supuesto" in data["source"]


def test_negated_panic_does_not_trigger(live):
    assert chat(live, "no hay pánico, todo bien")["guide"] is None


def test_physical_emergency_phrases_still_win(live):
    assert chat(live, "no puedo respirar")["category"] == "emergency"
    assert chat(live, "tengo dolor de pecho y estoy en pánico", session="w2")["category"] == "emergency"
    assert chat(live, "I'm panicking, chest pain", session="w3")["protocol"]["name"] == "chest_pain"


def test_safety_check_yes_opens_the_emergency_protocol_and_alerts(live):
    chat(live, "estoy en pánico", crew_id="ruben")
    data = chat(live, "Sí", crew_id="ruben")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "chest_pain"
    assert data["reply"].startswith(ANX["safety_check"]["if_yes"]["es"])
    assert sorted(a["protocol"] for a in alerts(live)) == ["breathing_difficulty", "chest_pain", "fainting_unresponsive"]
    chat(live, "estoy en pánico", crew_id="ruben", session="w9")
    chat(live, "Sí", crew_id="ruben", session="w9")
    assert len([a for a in alerts(live) if a["kind"] == "report"]) == 3  # no duplicates when it happens again


def test_safety_check_no_continues_and_only_then_says_safe(live):
    first = chat(live, "estoy en pánico")
    assert "estás a salvo" not in first["reply"]
    assert chat(live, "No")["reply"] == ANX["safety_check"]["if_no"]["es"]
    safe = ANX["stay_with_me"]["es"][4]
    replies = [chat(live, "Respirar juntos")["reply"] for _ in range(8)]
    assert any(safe in r for r in replies)  # allowed after a negative check


def test_stay_lines_never_say_safe_without_the_negative_check(live):
    chat(live, "estoy en pánico")
    safe = ANX["stay_with_me"]["es"][4]
    assert all(safe not in chat(live, "Respirar juntos")["reply"] for _ in range(8))


def test_buttons_and_guides(live):
    first = chat(live, "estoy en pánico")
    assert {"Anclaje de 5 sentidos", "Ya estoy mejor", "Sigo mal"} <= set(first["suggestions"])
    grounding = chat(live, "Anclaje de 5 sentidos")
    assert grounding["guide"] == "grounding" and "1. " in grounding["reply"]
    assert ANX["grounding"]["steps"][0]["text"]["es"] in grounding["reply"]
    breathing = chat(live, "Respirar juntos")
    assert breathing["guide"] == "breathing" and "4 s" in breathing["reply"]
    assert breathing["suggestions"] == ["Respirar juntos", "Anclaje de 5 sentidos", "Ya estoy mejor", "Sigo mal"]


@pytest.mark.parametrize(
    "message,guide",
    [
        ("quiero respirar", "breathing"),
        ("ayúdame a calmarme", "breathing"),
        ("anclaje", "grounding"),
        ("help me calm down", "breathing"),
        ("5 senses grounding", "grounding"),
        ("breathe together", "breathing"),
    ],
)
def test_exercises_are_requested_with_phrases(live, message, guide):
    data = chat(live, message)
    assert data["guide"] == guide and data["category"] == "support"
    assert live.ollama.chat_calls == []


def test_better_gives_the_after_text_and_offers_the_cmo(live):
    chat(live, "estoy en pánico", crew_id="ruben")
    data = chat(live, "Ya estoy mejor", crew_id="ruben")
    assert data["reply"] == ANX["after"]["es"]
    assert data["suggestions"] == ANX["after"]["suggestions"]["es"]
    assert alerts(live) == []  # offered, not sent
    yes = chat(live, "Sí, avisa al oficial médico", crew_id="ruben")
    assert "avisé al oficial médico" in yes["reply"]
    assert [(a["kind"], a["protocol"]) for a in alerts(live)] == [("support", "support_escalation")]


def test_declining_the_notice_sends_nothing(live):
    chat(live, "estoy en pánico", crew_id="ruben")
    chat(live, "Ya estoy mejor", crew_id="ruben")
    chat(live, "Ahora no", crew_id="ruben")
    assert alerts(live) == []


def test_better_without_an_episode_is_not_hijacked(live):
    assert chat(live, "ya estoy mejor", session="w9")["reply"] != ANX["after"]["es"]


def test_still_bad_walks_the_exercises_then_alerts_automatically(live):
    chat(live, "estoy en pánico", crew_id="ruben")  # round 1
    second = chat(live, "Sigo mal", crew_id="ruben")
    assert second["guide"] == "breathing" and alerts(live) == []  # round 2
    third = chat(live, "Sigo mal", crew_id="ruben")
    assert third["guide"] == "grounding" and alerts(live) == []
    last = chat(live, "Sigo mal", crew_id="ruben")
    assert last["guide"] is None and "oficial médico" in last["reply"]
    assert [(a["kind"], a["protocol"]) for a in alerts(live)] == [("support", "support_escalation")]


def test_alert_never_reveals_the_conversation(live):
    chat(live, "estoy en pánico y me siento muy mal por lo que pasó con Ana", crew_id="ruben")
    chat(live, "avisa al oficial médico", crew_id="ruben")
    blob = json.dumps(alerts(live), ensure_ascii=False)
    assert "Ana" not in blob and "pánico" not in blob and "pasó" not in blob
    es = live.get("/alerts", params={"language": "es"}).json()[0]
    assert es["message"] == "Alerta: Rubén necesita apoyo del oficial médico"
    en = live.get("/alerts", params={"language": "en"}).json()[0]
    assert en["message"] == "Alert: Rubén needs support from the medical officer"


def test_user_asks_during_an_episode_alerts_without_asking(live):
    chat(live, "I'm panicking", crew_id="ana")
    data = chat(live, "I want to talk to someone", crew_id="ana")
    assert "medical officer" in data["reply"]
    assert len(alerts(live)) == 1


def test_self_harm_words_during_an_episode_open_emotional_crisis_and_alert(live):
    chat(live, "estoy en pánico", crew_id="ruben")
    data = chat(live, "no quiero seguir, quiero hacerme daño", crew_id="ruben")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "emotional_crisis"
    assert [a["protocol"] for a in alerts(live)] == ["emotional_crisis"]


def test_second_episode_in_a_few_days_alerts_automatically(live):
    first = chat(live, "estoy en pánico", crew_id="ruben", session="a")
    assert alerts(live) == [] and "avisé" not in first["reply"]
    second = chat(live, "no puedo calmarme", crew_id="ruben", session="b")  # new session, same person
    assert "avisé al oficial médico" in second["reply"]
    assert [(a["kind"], a["protocol"]) for a in alerts(live)] == [("support", "support_escalation")]


def test_recurrence_expires_after_the_window():
    from app.wellbeing import RECURRENCE_WINDOW_S, Wellbeing

    now = [1000.0]
    wb = Wellbeing.load(SHARED_DIR, wall_clock=lambda: now[0])
    assert wb._repeated("ruben") is False
    now[0] += 3600
    assert wb._repeated("ruben") is True
    now[0] += RECURRENCE_WINDOW_S + 1
    assert wb._repeated("ruben") is False
    assert all(isinstance(t, float) for v in wb._episodes.values() for t in v)  # timestamps only, no text


def test_low_mood_gives_intro_and_rotating_tips(live):
    tip_texts = {t["id"]: t["text"]["es"] for t in LOW["tips"]}
    seen = []
    for message in ("me siento muy triste", "no tengo ánimo"):
        data = chat(live, message)
        assert data["category"] == "support" and data["moment"] == "low_mood" and data["ai_used"] is False
        assert data["reply"].startswith(LOW["intro"]["es"])
        used = {i for i, t in tip_texts.items() if t in data["reply"]}
        assert 2 <= len(used) <= 3
        seen.append(used)
    assert data["suggestions"] == LOW["suggestions"]["es"]
    assert seen[0] != seen[1]  # not the same tips twice in a row


def test_low_mood_tips_do_not_repeat_until_all_were_shown(live):
    tips = {t["text"]["en"]: t["id"] for t in LOW["tips"]}
    r1 = chat(live, "i feel very sad")["reply"]
    r2 = chat(live, "i feel very sad")["reply"]
    first = {i for t, i in tips.items() if t in r1}
    second = {i for t, i in tips.items() if t in r2}
    assert len(first) == 2 and len(second) == 3
    assert len(first | second) == len(tips)  # the five tips were all used before any came back
    assert len(first & second) == 0


@pytest.mark.parametrize(
    "message",
    ["me siento muy triste", "no tengo ánimo", "estoy desanimado", "todo me da igual", "Hoy estoy triste", "I feel very sad"],
)
def test_low_mood_phrases(live, message):
    data = chat(live, message)
    assert data["moment"] == "low_mood" and "supuesto" in data["source"]


def test_low_mood_third_time_adds_when_to_get_help(live):
    replies = [chat(live, "me siento muy triste")["reply"] for _ in range(3)]
    assert LOW["when_to_get_help"]["es"] not in replies[1]
    assert LOW["when_to_get_help"]["es"] in replies[2]
    asked = chat(live, "cuándo debo pedir ayuda", session="other")
    assert asked["reply"] == LOW["when_to_get_help"]["es"]


def test_low_mood_talk_button_asks_before_notifying(live):
    data = chat(live, "Quiero hablar con alguien", crew_id="ruben")
    assert "¿Quieres que avise al oficial médico?" in data["reply"] and alerts(live) == []
    chat(live, "Sí", crew_id="ruben")
    assert len(alerts(live)) == 1


def test_self_harm_still_goes_to_emotional_crisis(live):
    data = chat(live, "estoy triste y quiero hacerme daño")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "emotional_crisis"


def test_english_reply_in_english(live):
    data = chat(live, "I can't calm down", language="es")
    assert data["language"] == "en" and data["reply"].startswith(ANX["first_response"]["en"])
    assert chat(live, "Still not better")["guide"] == "breathing"


def test_no_clinical_labels_in_user_text(live):
    forbidden = ("depresi", "trastorno", "diagnóstic", "depression", "disorder", "panic attack", "ataque de pánico")
    messages = ["me va a dar un ataque de pánico", "me siento muy triste", "anclaje", "quiero respirar"]
    replies = [chat(live, m, session=f"s{i}")["reply"].lower() for i, m in enumerate(messages)]
    assert not any(f in r for r in replies for f in forbidden)


def test_wellbeing_state_is_cleared_on_reset(live):
    chat(live, "estoy en pánico")
    live.post("/session/reset", json={"session_id": "w1"})
    assert chat(live, "Sigo mal")["guide"] is None  # no open episode any more
