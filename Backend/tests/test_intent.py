"""Keyword router: classification order, both languages, normalization and post-filter."""

from __future__ import annotations

import pytest

from app.intent import KeywordRouter, KeywordsError, normalize


@pytest.fixture(scope="module")
def router(shared_dir) -> KeywordRouter:
    return KeywordRouter.load(shared_dir / "keywords.json")


EMERGENCY_EN = [
    ("chest pain", "chest_pain"),
    ("I have chest pain", "chest_pain"),
    ("My chest hurts a lot", "chest_pain"),
    ("I can't breathe!", "breathing_difficulty"),
    ("Shortness of breath after the run", "breathing_difficulty"),
    ("He passed out in the node", "fainting_unresponsive"),
    ("She is unresponsive", "fainting_unresponsive"),
    ("There is a lot of bleeding from his hand", "bleeding"),
    ("Emergency!", "general_emergency"),
]
EMERGENCY_ES = [
    ("dolor de pecho", "chest_pain"),
    ("Tengo dolor de pecho", "chest_pain"),
    ("Me duele el pecho", "chest_pain"),
    ("¡No puedo respirar!", "breathing_difficulty"),
    ("Me falta el aire", "breathing_difficulty"),
    ("Me desmayé hace un rato", "fainting_unresponsive"),
    ("Moisés no responde", "fainting_unresponsive"),
    ("Hay sangrado en su brazo", "bleeding"),
    ("¡Emergencia!", "general_emergency"),
]


@pytest.mark.parametrize(("text", "protocol"), EMERGENCY_EN + EMERGENCY_ES)
def test_emergency_phrases(router, text, protocol):
    intent = router.classify(text)
    assert intent.category == "emergency"
    assert intent.protocol == protocol


def test_at_least_five_emergency_phrases_per_language():
    assert len(EMERGENCY_EN) >= 5 and len(EMERGENCY_ES) >= 5


@pytest.mark.parametrize(
    ("text", "indicator", "symptom"),
    [
        ("What is a normal pulse?", "heart_rate", False),
        ("How do I measure my temperature?", "body_temperature", False),
        ("What's my oxygen level?", "spo2", False),
        ("Where is the pulse oximeter?", "spo2", False),  # longest keyword wins the tie
        ("I didn't sleep well", "sleep_hours", False),
        ("How is my mood?", "mood", False),
        ("I feel sick", None, True),
        ("It hurts", None, True),
        ("¿Cuál es mi pulso?", "heart_rate", False),
        ("Tengo fiebre", "body_temperature", False),
        ("No dormí bien", "sleep_hours", False),
        ("Me siento mal", None, True),
        ("Me duele la cabeza", None, True),
        ("I feel sick and have a fever", "body_temperature", True),
    ],
)
def test_health_phrases(router, text, indicator, symptom):
    intent = router.classify(text)
    assert intent.category == "health"
    assert intent.indicator == indicator
    assert intent.symptom is symptom


@pytest.mark.parametrize("text", ["I feel weird", "I'm not okay", "Something is off", "Me siento raro", "No estoy bien"])
def test_ambiguous_phrases(router, text):
    assert router.classify(text).category == "ambiguous"


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("Good morning, Moon-C", "greeting"),
        ("Buenos días, Moon-C", "greeting"),
        ("Thanks!", "thanks"),
        ("Muchas gracias", "thanks"),
        ("How are you?", "casual"),
        ("Cuéntame un chiste", "casual"),
        ("Adiós", "farewell"),
        ("I'm okay", "casual"),
    ],
)
def test_small_talk_phrases(router, text, kind):
    intent = router.classify(text)
    assert intent.category == "small_talk"
    assert intent.small_talk_type == kind


@pytest.mark.parametrize("text", ["What time is the docking?", "asdfgh", "", "   ", "?!", "This is a test", "I'm going to Spain"])
def test_fallback(router, text):
    assert router.classify(text).category == "fallback"


@pytest.mark.parametrize(
    ("text", "category"),
    [
        ("Hello Moon-C, I have chest pain", "emergency"),  # emergency beats small talk
        ("I feel weird and my chest hurts", "emergency"),  # emergency beats ambiguous
        ("Good morning, my pulse is high", "health"),  # health beats small talk
        ("I feel weird, I have a headache", "health"),  # health beats ambiguous
        ("Thanks, I'm not okay", "ambiguous"),  # ambiguous beats small talk
        ("My chest pain is gone but I can't breathe", "emergency"),
    ],
)
def test_strict_order(router, text, category):
    assert router.classify(text).category == category


def test_earliest_emergency_wins(router):
    assert router.classify("I can't breathe and I have chest pain").protocol == "breathing_difficulty"
    assert router.classify("Emergency, he is bleeding").protocol == "bleeding"  # specific beats general


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("¿Cómo está mi SpO₂?", "como esta mi spo2"),
        ("CAN'T BREATHE", "cant breathe"),
        ("Me desmayé", "me desmaye"),
        ("Sueño, ánimo, mañana", "sueno animo manana"),
        ("hello___world!!", "hello world"),
    ],
)
def test_normalize(raw, expected):
    assert normalize(raw) == expected


@pytest.mark.parametrize(
    ("reply", "flagged"),
    [
        ("Good morning! Ready for a great day?", False),
        ("Good night, sleep well!", False),
        ("¡Ánimo, Moisés! Hoy va a ser un gran día.", False),
        ("¡Que descanses!", False),
        ("You might have a fever, check your temperature.", True),
        ("Make sure to check your pulse.", True),
        ("Si te duele algo, avísame.", True),
        ("Sounds like chest pain, be careful.", True),
    ],
)
def test_post_filter(router, reply, flagged):
    assert router.mentions_health_or_emergency(reply) is flagged


def test_malformed_keywords_fail_fast():
    with pytest.raises(KeywordsError):
        KeywordRouter({"emergency": {}})
    with pytest.raises(KeywordsError):
        KeywordRouter(
            {
                "emergency": {"x": {"en": ["help"]}},
                "health": {"indicators": {"blood_sugar": {"en": ["sugar"]}}, "symptoms": {"en": []}},
                "ambiguous": {"en": []},
                "small_talk": {},
            }
        )


@pytest.mark.parametrize(
    "text,kind",
    [
        ("me quemé", "burn"),
        ("I burned my hand", "burn"),
        ("me golpeé la cabeza", "head"),
        ("I hit my head", "head"),
        ("me caí", "fall"),
        ("I fell", "fall"),
        ("me torcí el tobillo", "twist"),
        ("I twisted my ankle", "twist"),
        ("me raspé la rodilla", "check"),
        ("se hizo una cortada", "check"),
        ("me caí y me corté la mano", "check"),  # a cut asks about bleeding even after a fall
    ],
)
def test_injury_kinds(router, text, kind):
    intent = router.classify(text)
    assert (intent.category, intent.wound) == ("ambiguous", kind)


@pytest.mark.parametrize(
    "text",
    ["fue un golpe de suerte", "golpe de estado", "I'm burned out", "I fell asleep", "se cayo el sistema", "me cae mal el desayuno"],
)
def test_idioms_are_not_injuries_or_conflicts(router, text):
    intent = router.classify(text)
    assert intent.wound is None and intent.moment != "conflict" and intent.category != "emergency"


@pytest.mark.parametrize(
    "text,kind",
    [("ok", "ack"), ("vale", "ack"), ("👍", "ack"), ("😀", "ack"), ("jajaja", "ack"), ("help", "help"), ("ayuda", "help"), ("dime algo", "help")],
)
def test_acknowledgements_and_help(router, text, kind):
    intent = router.classify(text)
    assert (intent.category, intent.small_talk_type) == ("small_talk", kind)


def test_bare_ok_inside_a_real_question_is_not_an_acknowledgement(router):
    assert router.classify("ok what time is the docking").small_talk_type != "ack"
    assert router.classify("gracias, ok").small_talk_type == "thanks"
