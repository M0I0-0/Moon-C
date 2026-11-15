"""Russian and German in the keyword router (deterministic, offline): emergencies, negations, injuries, wellbeing.

Normalization decision (same function in app/intent.py and front-end/src/lib/assistant.js): casefold (German
sharp s -> ss) + NFKD + no combining marks. German umlauts -> a/o/u; Russian e-diaeresis -> e and short i -> i.
"""

from __future__ import annotations

import json

import pytest

from app.config import REPO_DIR
from app.intent import KeywordRouter, normalize, tokenize


@pytest.fixture(scope="module")
def router(shared_dir) -> KeywordRouter:
    return KeywordRouter.load(shared_dir / "keywords.json")


KEYWORDS = json.loads((REPO_DIR / "shared" / "keywords.json").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- normalization
@pytest.mark.parametrize(
    "text,expected",
    [
        ("Ich kann nicht ATMEN, Brustschmerzen, Straße", "ich kann nicht atmen brustschmerzen strasse"),
        ("Müde Öl Übel", "mude ol ubel"),
        ("Мне больно, ёлка, дышать не могу", "мне больно елка дышать не могу"),
        ("Мой Й", "мои и"),
        ("¡No puedo RESPIRAR! Can't breathe… SpO₂?", "no puedo respirar cant breathe spo2"),
    ],
)
def test_normalize_is_stable_for_cyrillic_and_german(text, expected):
    assert normalize(text) == expected  # the front end tests the same strings


def test_ru_de_spellings_with_and_without_diacritics_are_equivalent(router):
    for a, b in [("Ich möchte sterben", "Ich mochte sterben"), ("Ohnmächtig", "ohnmachtig"), ("Он потерял сознание", "ОН ПОТЕРЯЛ СОЗНАНИЕ")]:
        assert router.classify(a) == router.classify(b)
    assert router.classify("Я потерял сознание").protocol == router.classify("я потеряЛ сознание").protocol


def test_tokenize_keeps_cyrillic_and_german_words_and_breaks():
    tokens, breaks = tokenize("Нет, он без сознания! Ich kann nicht atmen.")
    assert tokens == ["нет", "он", "без", "сознания", "ich", "kann", "nicht", "atmen"]
    assert breaks[1] is True and breaks[4] is True  # a comma / a full stop right before


# --------------------------------------------------------------------------- coverage: ru and de everywhere
def _language_nodes(node, path=()):
    if isinstance(node, dict):
        if "es" in node and isinstance(node["es"], list):
            yield path, node
        for key, value in node.items():
            yield from _language_nodes(value, path + (key,))


def test_every_keyword_list_with_es_has_ru_and_de():
    missing = [".".join(map(str, path)) for path, node in _language_nodes(KEYWORDS) if "ru" not in node or "de" not in node]
    assert missing == []


def test_every_priority_emergency_protocol_has_ru_and_de_phrases():
    for name, node in KEYWORDS["emergency"].items():
        if name.startswith("_"):
            continue
        assert node["ru"] and node["de"], name


# --------------------------------------------------------------------------- emergencies
EMERGENCIES = [
    ("боль в груди", "chest_pain"), ("У меня болит грудь", "chest_pain"), ("Давит в груди", "chest_pain"),
    ("У меня сердечный приступ", "chest_pain"),
    ("не могу дышать", "breathing_difficulty"), ("Я задыхаюсь!", "breathing_difficulty"),
    ("Мне не хватает воздуха", "breathing_difficulty"), ("Он подавился", "breathing_difficulty"),
    ("Он потерял сознание", "fainting_unresponsive"), ("Я теряю сознание", "fainting_unresponsive"),
    ("Она без сознания", "fainting_unresponsive"), ("Нужна реанимация", "fainting_unresponsive"),
    ("Кровотечение", "bleeding"), ("У него идет кровь", "bleeding"), ("Много крови", "bleeding"),
    ("Хочу умереть", "emotional_crisis"), ("Я хочу покончить с собой", "emotional_crisis"),
    ("Не хочу жить", "emotional_crisis"), ("Хочу себя убить", "emotional_crisis"),
    ("Экстренная ситуация", "general_emergency"), ("Спасите!", "general_emergency"),
    ("Ich kann nicht atmen", "breathing_difficulty"), ("Ich bekomme keine Luft", "breathing_difficulty"),
    ("Er erstickt", "breathing_difficulty"), ("Er hat sich verschluckt", "breathing_difficulty"),
    ("Brustschmerzen", "chest_pain"), ("Mir tut die Brust weh", "chest_pain"), ("Ich habe einen Herzinfarkt", "chest_pain"),
    ("Er ist bewusstlos", "fainting_unresponsive"), ("Sie wurde ohnmächtig? Sie ist ohnmächtig geworden", "fainting_unresponsive"),
    ("Blutung", "bleeding"), ("Er blutet stark", "bleeding"), ("Viel Blut", "bleeding"),
    ("Ich will sterben", "emotional_crisis"), ("Ich möchte nicht mehr leben", "emotional_crisis"),
    ("Ich will mich umbringen", "emotional_crisis"), ("Selbstmord", "emotional_crisis"),
    ("Notfall", "general_emergency"), ("Medizinischer Notfall!", "general_emergency"),
    # transliterated umlauts typed on a keyboard without them
    ("Ich moechte sterben", "emotional_crisis"), ("Er ist ohnmaechtig geworden", "fainting_unresponsive"),
]


@pytest.mark.parametrize("text,protocol", EMERGENCIES, ids=[t for t, _ in EMERGENCIES])
def test_ru_de_direct_emergencies(router, text, protocol):
    intent = router.classify(text)
    assert (intent.category, intent.protocol) == ("emergency", protocol)


@pytest.mark.parametrize("text", ["SOS", "sos!", "112", "911", "Call 911", "llama al 112", "Позвоните 112", "Ruf 112 an"])
def test_sos_and_emergency_numbers_are_always_emergencies(router, text):
    assert router.classify(text).category == "emergency"


@pytest.mark.parametrize("text", ["Mi pulso es 112", "Мой пульс 112", "Mein Puls ist 112", "I have 911 messages", "el 112 no me gusta"])
def test_an_emergency_number_inside_a_sentence_is_not_an_emergency(router, text):
    assert router.classify(text).category != "emergency"


@pytest.mark.parametrize(
    "text,protocol",
    [("Сердечный приступ", "chest_pain"), ("Хочу исчезнуть", "emotional_crisis"), ("Я тону в работе", "breathing_difficulty"),
     ("Herzinfarkt", "chest_pain"), ("Ich ertrinke in Arbeit", "breathing_difficulty"), ("Ich will verschwinden", "emotional_crisis")],
)
def test_weak_phrases_ask_a_safety_question_first(router, text, protocol):
    intent = router.classify(text)
    assert (intent.category, intent.confirm, intent.protocol) == ("ambiguous", "safety", protocol)


@pytest.mark.parametrize("text", ["Помогите", "Мне нужна помощь", "Hilfe", "Ich brauche Hilfe", "Hilf mir"])
def test_a_bare_call_for_help_asks_if_the_person_is_in_danger(router, text):
    intent = router.classify(text)
    assert (intent.category, intent.confirm, intent.protocol) == ("ambiguous", "safety", "general_emergency")


# --------------------------------------------------------------------------- negation and the 3-word limit
@pytest.mark.parametrize(
    "text,protocol",
    [("У меня нет боли в груди", "chest_pain"), ("Нет кровотечения", "bleeding"), ("У него нет никакого кровотечения", "bleeding"),
     ("Это не экстренная ситуация", "general_emergency"), ("Я не чувствую боли в груди", "chest_pain"),
     ("Ich habe keine Brustschmerzen", "chest_pain"), ("Er ist nicht bewusstlos", "fainting_unresponsive"),
     ("Ich habe keine starke Blutung", "bleeding"), ("Das ist kein Notfall", "general_emergency")],
)
def test_negated_phrases_ask_for_confirmation(router, text, protocol):
    intent = router.classify(text)
    assert (intent.category, intent.confirm, intent.protocol) == ("ambiguous", "negated", protocol)


@pytest.mark.parametrize(
    "text,protocol",
    [("Не знаю что делать, он потерял сознание", "fainting_unresponsive"),  # "не" is four words away
     ("Нет, он без сознания", "fainting_unresponsive"),  # a comma cuts the negation
     ("Нет, не могу дышать", "breathing_difficulty"),  # the phrase itself carries the negation
     ("Ich weiß nicht, was ich tun soll, er ist bewusstlos", "fainting_unresponsive"),
     ("Nein, er blutet stark", "bleeding"),
     ("Ich will nicht mehr leben", "emotional_crisis"),  # self-harm is never negated
     ("Не хочу жить", "emotional_crisis")],
)
def test_negation_does_not_hide_a_real_emergency(router, text, protocol):
    intent = router.classify(text)
    assert (intent.category, intent.protocol) == ("emergency", protocol)


def test_known_limit_a_negator_after_the_verb_is_not_read_as_a_negation(router):
    # "Er blutet nicht" (German puts "nicht" after the verb) opens the protocol: a false alarm, never a miss.
    assert router.classify("Er blutet nicht").category == "emergency"


@pytest.mark.parametrize(
    "text,protocol",
    [("Грудь странно давит", "chest_pain"), ("Дыхание какое-то странное", "breathing_difficulty"),
     ("Meine Brust fühlt sich komisch an", "chest_pain"), ("Atmen fühlt sich schwer an", "breathing_difficulty")],
)
def test_pain_without_an_exact_phrase_asks_how_strong(router, text, protocol):
    intent = router.classify(text)
    assert (intent.category, intent.confirm, intent.protocol) == ("ambiguous", "pain", protocol)


# --------------------------------------------------------------------------- answers
@pytest.mark.parametrize(
    "text,graded,expected",
    [("не знаю", True, None), ("Нет, я в порядке", False, "no"), ("Да, мне нужна помощь", False, "yes"),
     ("не сильно", True, "no"), ("очень сильно", True, "yes"), ("немного", True, "no"),
     ("Nein weiß nicht", True, None), ("Nein, mir geht es gut", False, "no"), ("Ja, ich brauche Hilfe", False, "yes"),
     ("nicht schlimm", True, "no"), ("sehr stark", True, "yes"), ("ein bisschen", True, "no"),
     ("no sé", True, None), ("no", False, "no")],
)
def test_answers_to_moon_cs_questions(router, text, graded, expected):
    assert router.answer(text, graded=graded) == expected


# --------------------------------------------------------------------------- injuries
@pytest.mark.parametrize(
    "text,wound",
    [("Я порезался", "check"), ("У меня рана на руке", "check"), ("Я обжегся", "burn"), ("Я ударился головой", "head"),
     ("Я упал", "fall"), ("Я подвернул ногу", "twist"), ("Это просто царапина", "minor"), ("Нет крови", "minor"),
     ("Ich habe mich geschnitten", "check"), ("Ich habe mich verbrannt", "burn"), ("Ich habe mir den Kopf gestoßen", "head"),
     ("Ich bin gestürzt", "fall"), ("Ich bin umgeknickt", "twist"), ("Nur ein Kratzer", "minor"), ("Kein Blut", "minor")],
)
def test_injuries(router, text, wound):
    intent = router.classify(text)
    assert (intent.category, intent.wound) == ("ambiguous", wound)


@pytest.mark.parametrize(
    "text",
    ["Температура упала", "Упал сигнал связи", "Он упал духом", "Эмоциональное выгорание", "Das Wetter ist wunderbar",
     "Es hat mir gefallen", "Ich bin ausgebrannt", "Die Temperatur ist gefallen"],
)
def test_idioms_do_not_open_the_injury_flow(router, text):
    assert router.classify(text).wound is None


# --------------------------------------------------------------------------- health, support, small talk
@pytest.mark.parametrize(
    "text,indicator,symptom",
    [("Какой у меня пульс?", "heart_rate", False), ("Что такое нормальная температура?", "body_temperature", False),
     ("Какая у меня сатурация", "spo2", False), ("Как мое давление?", "blood_pressure_systolic", False),
     ("Мне плохо", None, True), ("Тошнит", None, True),
     ("Wie hoch ist mein Puls?", "heart_rate", False), ("Was ist ein normaler Blutdruck?", "blood_pressure_systolic", False),
     ("Wie hoch ist meine Sauerstoffsättigung", "spo2", False), ("Mir ist übel", None, True),
     ("Ich fühle mich schlecht", None, True), ("Ich habe Kopfschmerzen", None, True)],
)
def test_health_ru_de(router, text, indicator, symptom):
    intent = router.classify(text)
    assert (intent.category, intent.indicator, intent.symptom) == ("health", indicator, symptom)


@pytest.mark.parametrize(
    "text,moment",
    [("Я в стрессе", "stress"), ("Я ошибся", "mistake"), ("Мы поругались", "conflict"), ("Скучаю по дому", "homesick"),
     ("Мне одиноко", "lonely"), ("Мне грустно", "low_mood"), ("Я разочарован", "frustration"),
     ("Ich bin gestresst", "stress"), ("Ich habe Mist gebaut", "mistake"), ("Wir hatten Streit", "conflict"),
     ("Ich habe Heimweh", "homesick"), ("Ich fühle mich einsam", "lonely"), ("Ich bin traurig", "low_mood"),
     ("Ich bin frustriert", "frustration")],
)
def test_support_moments_ru_de(router, text, moment):
    intent = router.classify(text)
    assert (intent.category, intent.moment) == ("support", moment)


@pytest.mark.parametrize(
    "text,kind",
    [("Привет", "greeting"), ("Спасибо", "thanks"), ("Пока", "farewell"), ("Как дела?", "casual"), ("Спсибо", "thanks"),
     ("Hallo", "greeting"), ("Danke", "thanks"), ("Tschüss", "farewell"), ("Wie geht's?", "casual"), ("Dankeee", "thanks"),
     ("Помощь", "help"), ("Что ты умеешь?", "help"), ("Was kannst du?", "help"),
     ("Ок", "ack"), ("Понятно", "ack"), ("хахаха", "ack"), ("Verstanden", "ack"), ("alles klar", "ack"), ("hahaha", "ack")],
)
def test_small_talk_ru_de(router, text, kind):
    intent = router.classify(text)
    assert (intent.category, intent.small_talk_type) == ("small_talk", kind)


def test_the_four_word_limit_for_help_and_the_three_word_limit_for_acks_still_hold(router):
    assert router.classify("помощь по системе охлаждения станции пожалуйста").small_talk_type != "help"
    assert router.classify("хорошо я понял что дальше будем делать").small_talk_type != "ack"


def test_post_filter_knows_ru_and_de_health_words(router):
    for reply in ["У тебя высокая температура.", "Das klingt nach einer Depression.", "Это похоже на депрессию.", "Dein Puls ist hoch."]:
        assert router.mentions_health_or_emergency(reply), reply
    for reply in ["Спокойной ночи, хорошо выспись!", "Gute Nacht, schlaf gut!", "Рада тебя слышать!", "Schön, von dir zu hören!"]:
        assert not router.mentions_health_or_emergency(reply), reply


def test_no_new_false_alarm_for_everyday_ru_de_text(router):
    for text in ["Давай поговорим о Луне", "Какая сегодня погода на станции?", "Расскажи про Марс", "Erzähl mir etwas über den Mond",
                 "Wie spät ist es?", "Ich habe Hunger", "Я хочу кофе", "Das Wasser ist kalt"]:
        assert router.classify(text).category not in ("emergency",), text
        intent = router.classify(text)
        assert not (intent.category == "ambiguous" and intent.confirm), text
