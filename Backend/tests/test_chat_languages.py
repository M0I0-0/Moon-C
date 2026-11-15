"""/chat in Russian and German: emergencies, safety questions, injuries, wellbeing, readings, crew questions.

The texts of the manual and of the support files are translated by other work streams; where they may still be
missing these tests only require a reply (the server falls back to English, never a KeyError).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from conftest import FakeOllama

from app.alerts import Alert
from app.chat import SUGGESTIONS, TEXTS

T0 = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


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


@pytest.fixture
def services(offline):
    svc = offline.app.state.services
    svc.chat.crewdata.clock = lambda: T0
    return svc


# --------------------------------------------------------------------------- texts: complete, never a KeyError
def test_ru_de_texts_cover_every_english_key():
    for lang in ("ru", "de"):
        assert set(TEXTS[lang]) == set(TEXTS["en"]), lang
        assert all(isinstance(TEXTS[lang][k], list) == isinstance(TEXTS["en"][k], list) for k in TEXTS["en"])
        for key, options in SUGGESTIONS.items():
            assert len(options[lang]) == len(options["en"]), (lang, key)


# --------------------------------------------------------------------------- emergencies
@pytest.mark.parametrize(
    "message,language,protocol",
    [
        ("У меня боль в груди", "ru", "chest_pain"), ("Не могу дышать", "ru", "breathing_difficulty"),
        ("Он потерял сознание", "ru", "fainting_unresponsive"), ("Кровотечение", "ru", "bleeding"),
        ("Хочу умереть", "ru", "emotional_crisis"), ("Экстренная ситуация", "ru", "general_emergency"),
        ("Ich kann nicht atmen", "de", "breathing_difficulty"), ("Brustschmerzen", "de", "chest_pain"),
        ("Er ist bewusstlos", "de", "fainting_unresponsive"), ("Blutung", "de", "bleeding"),
        ("Ich will sterben", "de", "emotional_crisis"), ("Notfall", "de", "general_emergency"),
    ],
)
def test_ru_de_emergencies_open_the_protocol_without_the_ai(live, ollama, message, language, protocol):
    # The request asks for English: the message's own language wins.
    data = chat(live, message, language="en")
    assert data["category"] == "emergency" and data["ai_used"] is False
    assert data["protocol"]["name"] == protocol
    assert data["language"] == language
    assert data["protocol"]["steps"] and data["reply"]
    assert ollama.chat_calls == []


@pytest.mark.parametrize("message", ["SOS", "sos", "112", "911"])
def test_sos_and_emergency_numbers_always_open_the_general_emergency(live, ollama, message):
    for language in ("es", "en", "ru", "de"):
        data = chat(live, message, language=language, session_id=f"s-{language}")
        assert data["category"] == "emergency" and data["protocol"]["name"] == "general_emergency"
    assert ollama.chat_calls == []


# --------------------------------------------------------------------------- safety questions (ru / de)
@pytest.mark.parametrize(
    "weak,language,yes,no",
    [("Сердечный приступ", "ru", "safety", "safety"), ("Herzinfarkt", "de", "safety", "safety")],
)
def test_weak_phrase_asks_and_only_yes_opens_the_protocol(offline, weak, language, yes, no):
    ask = chat(offline, weak, session_id="a")
    assert ask["category"] == "ambiguous" and ask["language"] == language and ask["protocol"] is None
    assert ask["reply"] == TEXTS[language]["q_safety"]
    assert ask["suggestions"] == SUGGESTIONS["safety"][language]
    opened = chat(offline, ask["suggestions"][0], session_id="a")
    assert opened["category"] == "emergency" and opened["protocol"]["name"] == "chest_pain"
    chat(offline, weak, session_id="b")
    declined = chat(offline, ask["suggestions"][1], session_id="b")
    assert declined["category"] == "ambiguous" and declined["reply"] == TEXTS[language]["no_safety"]


@pytest.mark.parametrize("language,message", [("ru", "У меня нет боли в груди"), ("de", "Ich habe keine Brustschmerzen")])
def test_negated_phrase_asks_for_confirmation(offline, language, message):
    ask = chat(offline, message, session_id="n")
    assert ask["reply"] == TEXTS[language]["q_negated"] and ask["suggestions"] == SUGGESTIONS["negated"][language]
    assert chat(offline, ask["suggestions"][1], session_id="n")["category"] == "emergency"  # "no, it is happening"


@pytest.mark.parametrize("language,message", [("ru", "Грудь странно давит"), ("de", "Meine Brust fühlt sich komisch an")])
def test_pain_without_an_exact_phrase_asks_how_strong(offline, language, message):
    ask = chat(offline, message, session_id="p")
    assert ask["reply"] == TEXTS[language]["q_pain_chest_pain"]
    assert chat(offline, ask["suggestions"][0], session_id="p")["category"] == "emergency"
    chat(offline, message, session_id="p2")
    assert chat(offline, ask["suggestions"][1], session_id="p2")["reply"] == TEXTS[language]["no_pain"]


# --------------------------------------------------------------------------- injuries (ru / de)
@pytest.mark.parametrize(
    "language,message,kind",
    [("ru", "Я порезался", "wound_check"), ("ru", "Я обжегся", "wound_burn"), ("ru", "Я ударился головой", "wound_head"),
     ("ru", "Я упал", "wound_fall"), ("ru", "Я подвернул ногу", "wound_twist"),
     ("de", "Ich habe mich geschnitten", "wound_check"), ("de", "Ich habe mich verbrannt", "wound_burn"),
     ("de", "Ich habe mir den Kopf gestoßen", "wound_head"), ("de", "Ich bin gestürzt", "wound_fall"),
     ("de", "Ich bin umgeknickt", "wound_twist")],
)
def test_injury_question_and_answers_route_back(offline, language, message, kind):
    ask = chat(offline, message, session_id="w")
    texts = TEXTS[language]
    assert ask["category"] == "ambiguous" and ask["ai_used"] is False
    assert ask["reply"] == texts[kind]
    key = "wound" if kind == "wound_check" else kind
    assert ask["suggestions"] == SUGGESTIONS[key][language]
    serious = chat(offline, ask["suggestions"][0], session_id="w")
    assert serious["category"] == "emergency"
    assert serious["protocol"]["name"] == ("bleeding" if kind == "wound_check" else "general_emergency")
    chat(offline, message, session_id="w2")
    for label in ask["suggestions"][1:]:
        chat(offline, message, session_id="w3")
        assert chat(offline, label, session_id="w3")["category"] == "ambiguous", label


def test_the_ai_words_the_injury_question_in_the_users_language(make_client):
    ollama = FakeOllama(reply="Мне жаль. Кровотечение сильное?")
    data = chat(make_client(ollama), "Я порезался")
    assert data["ai_used"] is True and data["language"] == "ru"
    assert "Always reply in" in ollama.chat_calls[0]["messages"][0]["content"] or "русск" in ollama.chat_calls[0]["messages"][0]["content"]


# --------------------------------------------------------------------------- the rest of the router flows
@pytest.mark.parametrize(
    "language,message",
    [("ru", "Какой у меня пульс?"), ("ru", "Мне плохо"), ("de", "Wie hoch ist mein Puls?"), ("de", "Mir ist übel")],
)
def test_health_never_calls_the_ai_in_ru_de(live, ollama, language, message):
    data = chat(live, message)
    assert data["category"] == "health" and data["ai_used"] is False and data["language"] == language
    assert data["reply"]
    assert ollama.chat_calls == []


@pytest.mark.parametrize(
    "language,message,key",
    [("ru", "Мне странно", "clarify"), ("de", "Mir ist komisch", "clarify"), ("ru", "Помощь", "help"), ("de", "Was kannst du?", "help")],
)
def test_clarify_and_help_texts(offline, language, message, key):
    data = chat(offline, message)
    assert data["reply"] == TEXTS[language][key] and data["suggestions"] == SUGGESTIONS[key][language]


@pytest.mark.parametrize("language", ["ru", "de"])
def test_every_quick_reply_routes_to_a_deterministic_answer(offline, language):
    """Buttons are routed back through the router: the AI must never be what answers them."""
    labels = []
    for key in ("clarify", "topics", "help"):
        labels += SUGGESTIONS[key][language]
    for i, label in enumerate(labels):
        data = chat(offline, label, session_id=f"q{i}")
        assert data["language"] == language, label
        assert data["category"] in ("health", "support", "small_talk"), (label, data["category"])
        assert data["ai_used"] is False


def test_the_fallback_and_small_talk_in_ru_de_when_the_ai_is_down(offline):
    ack = chat(offline, "Понятно", session_id="x")
    assert ack["category"] == "small_talk" and ack["reply"] in TEXTS["ru"]["ack"]
    ack = chat(offline, "alles klar", session_id="y")
    assert ack["category"] == "small_talk" and ack["reply"] in TEXTS["de"]["ack"]
    assert chat(offline, "Привет", session_id="z")["category"] == "small_talk"
    assert chat(offline, "Danke", session_id="z2")["category"] == "small_talk"


# --------------------------------------------------------------------------- wellbeing
@pytest.mark.parametrize("language,message", [("ru", "Я паникую"), ("ru", "У меня паническая атака"), ("de", "Ich habe eine Panikattacke"), ("de", "Ich kann mich nicht beruhigen")])
def test_acute_anxiety_opens_the_guided_response(offline, language, message):
    data = chat(offline, message)
    assert data["category"] == "support" and data["guide"] == "breathing" and data["language"] == language
    assert data["ai_used"] is False and len(data["suggestions"]) >= 3


@pytest.mark.parametrize("language,no_panic", [("ru", "Нет паники"), ("de", "Keine Panik")])
def test_a_negated_panic_is_not_an_episode(offline, language, no_panic):
    assert chat(offline, no_panic).get("guide") is None


@pytest.mark.parametrize("language", ["ru", "de"])
def test_wellbeing_buttons_route_back_to_the_flow(offline, language):
    from app.wellbeing import BRIDGE, YES_NO

    first = chat(offline, {"ru": "Я паникую", "de": "Ich habe eine Panikattacke"}[language], session_id="wb")
    assert first["suggestions"][:2] == YES_NO[language]
    breathe, ground, better, worse = BRIDGE[language]["buttons"]
    assert chat(offline, ground, session_id="wb")["guide"] == "grounding"
    assert chat(offline, breathe, session_id="wb")["guide"] == "breathing"
    after = chat(offline, better, session_id="wb")
    assert after["category"] == "support" and after["guide"] is None
    chat(offline, {"ru": "Я паникую", "de": "Ich habe eine Panikattacke"}[language], session_id="wb2")
    assert chat(offline, worse, session_id="wb2")["category"] == "support"


@pytest.mark.parametrize("language,message", [("ru", "Я в стрессе"), ("ru", "Мне грустно"), ("de", "Ich bin gestresst"), ("de", "Ich bin traurig")])
def test_support_moments_answer_even_if_the_support_texts_are_not_translated_yet(offline, language, message):
    data = chat(offline, message)
    assert data["category"] == "support" and data["language"] == language and data["reply"]


@pytest.mark.parametrize("language,message", [("ru", "Хочу поговорить с кем-то"), ("de", "Ich will mit jemandem reden")])
def test_talk_to_someone_offers_the_medical_officer(offline, language, message):
    from app.wellbeing import BRIDGE

    data = chat(offline, message)
    assert data["category"] == "support" and BRIDGE[language]["ask_notify"] in data["reply"]


# --------------------------------------------------------------------------- readings and crew questions
@pytest.mark.parametrize(
    "language,message,indicator,value",
    [
        ("ru", "у меня температура 40", "body_temperature", 40.0),
        ("ru", "У меня 38,5 градусов", "body_temperature", 38.5),
        ("ru", "мой пульс 130", "heart_rate", 130.0),
        ("ru", "я спал 4 часа", "sleep_hours", 4.0),
        ("ru", "сатурация 88", "spo2", 88.0),
        ("de", "ich habe 40 Grad Fieber", "body_temperature", 40.0),
        ("de", "meine Temperatur ist 36,8", "body_temperature", 36.8),
        ("de", "mein Puls ist 130", "heart_rate", 130.0),
        ("de", "ich habe 4 Stunden geschlafen", "sleep_hours", 4.0),
        ("de", "Sauerstoff 88", "spo2", 88.0),
    ],
)
def test_reading_by_chat_in_ru_de(offline, services, language, message, indicator, value):
    data = chat(offline, message, crew_id="ruben")
    assert data["measurement_recorded"] is True and data["language"] == language
    assert data["reply"].startswith({"ru": "Записано.", "de": "Eingetragen."}[language])
    stored = services.store.list(crew_id="ruben")
    assert len(stored) == 1 and stored[0].indicator == indicator and stored[0].value == value


def test_reading_ru_de_general_account_does_not_record_and_texts_exist(offline, services):
    for message, key in (("у меня температура 40", "ru"), ("ich habe 40 Grad Fieber", "de")):
        data = chat(offline, message, session_id=key)
        assert data["measurement_recorded"] is False and data["language"] == key
    assert services.store.list() == []


def test_reading_ru_de_questions_are_not_readings(offline, services):
    for message in ("Какая нормальная температура?", "Was ist ein normaler Puls?", "Сколько нужно спать?"):
        assert chat(offline, message, crew_id="ruben")["measurement_recorded"] is False
    assert services.store.list(crew_id="ruben") == []


def test_fahrenheit_confirmation_in_russian_and_german(offline, services):
    ask = chat(offline, "у меня температура 101", crew_id="ruben", session_id="f1")
    assert "°F" in ask["reply"] and len(ask["suggestions"]) == 2
    done = chat(offline, ask["suggestions"][0], crew_id="ruben", session_id="f1")
    assert done["measurement_recorded"] is True
    ask = chat(offline, "Meine Temperatur ist 101", crew_id="ruben", session_id="f2")
    assert "°F" in ask["reply"]
    assert chat(offline, ask["suggestions"][1], crew_id="ruben", session_id="f2")["measurement_recorded"] is False


def _alert(services, crew_id, name, minutes=12):
    alert = Alert(
        id=f"a-{crew_id}-{minutes}", kind="vital", crew_id=crew_id, crew_name=name,
        created_at=T0 - timedelta(minutes=minutes), indicator="body_temperature", value=39.5, unit="°C",
    )
    return services.alerts._add(alert)


@pytest.mark.parametrize(
    "language,question",
    [("ru", "Как дела у Рубена?"), ("ru", "Как себя чувствует Rubén?"), ("de", "Wie geht es Rubén?"), ("de", "Wie geht's Ruben?")],
)
def test_crew_question_in_ru_de_answers_only_from_alerts(offline, services, language, question):
    none = chat(offline, question, session_id="c1")
    assert none["language"] == language and "Rubén" in none["reply"] and "39" not in none["reply"]
    _alert(services, "ruben", "Rubén")
    data = chat(offline, question, session_id="c2")
    assert "Rubén" in data["reply"] and "39" not in data["reply"]
    if language == "ru":
        assert "12 минут назад" in data["reply"] and "высокая температура" in data["reply"]
    else:
        assert "Vor 12 Minuten" in data["reply"] and "eine hohe Temperatur" in data["reply"]


def test_unknown_crew_member_in_ru_de(offline, services):
    assert "Педро" in chat(offline, "Как дела у Педро?", session_id="u1")["reply"]
    assert "Pedro" in chat(offline, "Wie geht es Pedro?", session_id="u2")["reply"]
    # "Wie geht es dir?" is not a question about a crew member
    assert chat(offline, "Wie geht es dir?", session_id="u3")["category"] == "small_talk"


def test_self_question_in_ru_de(offline, services):
    assert chat(offline, "Есть ли у меня оповещения?", crew_id="ruben", session_id="m1")["reply"].startswith("У тебя нет активных")
    assert chat(offline, "Habe ich Warnungen?", crew_id="ruben", session_id="m2")["reply"].startswith("Du hast keine aktiven")


def test_relative_time_in_ru_and_de():
    from app.crewdata import ago

    assert ago(timedelta(minutes=1), "ru") == "1 минуту назад"
    assert ago(timedelta(minutes=3), "ru") == "3 минуты назад"
    assert ago(timedelta(minutes=12), "ru") == "12 минут назад"
    assert ago(timedelta(minutes=21), "ru") == "21 минуту назад"
    assert ago(timedelta(hours=5), "ru") == "5 часов назад"
    assert ago(timedelta(days=2), "ru") == "2 дня назад"
    assert ago(timedelta(minutes=1), "de") == "Vor 1 Minute"
    assert ago(timedelta(hours=5), "de") == "Vor 5 Stunden"
    assert ago(timedelta(seconds=5), "de") == "Vor weniger als einer Minute"
    assert ago(timedelta(minutes=2), "fr") == "2 minutes ago"  # unknown language: English, no KeyError


# --------------------------------------------------------------------------- language resolution
def test_language_of_the_message_wins_and_the_session_keeps_it(offline):
    assert chat(offline, "Привет", session_id="l", crew_id="moises")["language"] == "ru"
    assert chat(offline, "ok", session_id="l", crew_id="moises")["language"] == "ru"
    assert chat(offline, "Hallo", session_id="l", crew_id="moises")["language"] == "de"
    assert chat(offline, "hola", session_id="l", crew_id="moises")["language"] == "es"


def test_a_request_in_ru_or_de_is_accepted(offline):
    for language in ("ru", "de"):
        assert chat(offline, "ok", language=language, session_id=f"r-{language}")["language"] == language
