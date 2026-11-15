"""Languages outside es/en/ru/de: AI fallback + a fixed honest safety line; emergencies stay deterministic."""

from __future__ import annotations

import pytest
from conftest import FakeOllama

from app.config import REPO_DIR
from app.intent import KeywordRouter
from app.multilingual import (
    EMERGENCY_BUTTONS,
    SAFETY_LINE,
    build_reply,
    dominant_script,
    is_foreign_message,
    is_priority_language,
    safety_line,
)

VOCABULARY = KeywordRouter.load(REPO_DIR / "shared" / "keywords.json").vocabulary  # words the router knows
FRENCH = "Bonjour, je voudrais savoir comment fonctionne la station"
CHINESE = "你好，我头疼得厉害"
ARABIC = "مرحبا، أحتاج إلى مساعدة"
UKRAINIAN = "Мені потрібна допомога з системою"


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def ollama() -> FakeOllama:
    return FakeOllama(reply="Bonjour ! Je suis là pour discuter avec vous.")


@pytest.fixture
def live(make_client, ollama):
    return make_client(ollama)


@pytest.fixture
def offline(make_client):
    return make_client(FakeOllama(up=False))


# --------------------------------------------------------------------------- units
def test_is_priority_language():
    assert all(is_priority_language(x) for x in ("es", "en", "ru", "de"))
    assert not any(is_priority_language(x) for x in ("fr", "zh", "pt", None, ""))


@pytest.mark.parametrize(
    "text,script",
    [("hello there", "latin"), ("Привет, мир", "cyrillic"), ("你好，我头疼", "han"), ("こんにちは", "kana"),
     ("안녕하세요", "hangul"), ("مرحبا", "arabic"), ("Γεια σου", "greek"), ("שלום", "hebrew"),
     ("नमस्ते", "indic"), ("สวัสดี", "thai_lao"), ("Ayúdame, ¿qué pasó? Straße", "latin")],
)
def test_dominant_script(text, script):
    assert dominant_script(text)[0] == script


@pytest.mark.parametrize("text", ["", "ok", "😀", "123 456", "!!!", "👍👍"])
def test_no_letters_or_emoji_is_never_another_language(text):
    assert dominant_script(text) == (None, 0) or dominant_script(text)[1] < 3
    assert not is_foreign_message(text, None, VOCABULARY)


@pytest.mark.parametrize(
    "text,detected,foreign",
    [
        (FRENCH, None, True), (CHINESE, None, True), (ARABIC, None, True), ("こんにちは、頭が痛いです", None, True),
        ("두통이 너무 심해요", None, True), (UKRAINIAN, None, True), (UKRAINIAN, "ru", True),
        ("Ciao, come funziona la stazione spaziale", None, True),
        # not another language
        ("hora", None, False), ("ok", None, False), ("holaaa", None, False), ("helo", None, False),
        ("grcias", None, False), ("Moon-C", None, False), ("Merci", None, False),  # one word: too little evidence
        ("Привет, как дела?", "ru", False), ("Ich brauche Hilfe", "de", False), ("Estoy bien gracias", "es", False),
        ("What time is the docking?", "en", False), ("Привет", None, False),
    ],
)
def test_is_foreign_message(text, detected, foreign):
    assert is_foreign_message(text, detected, VOCABULARY) is foreign


def test_the_safety_line_exists_in_the_four_languages_and_defaults_to_english():
    assert set(SAFETY_LINE) == {"es", "en", "ru", "de"} == set(EMERGENCY_BUTTONS)
    assert safety_line("fr") == safety_line(None) == SAFETY_LINE["en"]
    for lang, line in SAFETY_LINE.items():
        assert line.strip() and build_reply(None, lang) == line
        assert build_reply("Hola", lang) == f"Hola {line}"


# --------------------------------------------------------------------------- API: AI down -> only the fixed line
@pytest.mark.parametrize("message", [FRENCH, CHINESE, ARABIC, UKRAINIAN])
def test_another_language_without_ai_gets_only_the_safety_line_and_sos(offline, message):
    data = chat(offline, message)
    assert data["category"] == "fallback" and data["ai_used"] is False
    assert data["reply"] == SAFETY_LINE["en"]  # no account language: English
    assert data["suggestions"] == EMERGENCY_BUTTONS["en"] and "SOS" in data["suggestions"]
    assert data["protocol"] is None and data["language"] == "en"


@pytest.mark.parametrize("lang", ["es", "en", "ru", "de"])
def test_the_line_follows_the_language_of_the_account(offline, lang):
    data = chat(offline, FRENCH, language=lang)
    assert data["reply"] == SAFETY_LINE[lang] and data["language"] == lang
    assert chat(offline, FRENCH, crew_id="moises", session_id="c")["reply"] == SAFETY_LINE["es"]  # crew preference


@pytest.mark.parametrize("lang", ["es", "en", "ru", "de"])
def test_the_buttons_of_the_safety_line_open_the_general_emergency(offline, lang):
    buttons = chat(offline, FRENCH, language=lang)["suggestions"]
    assert len(buttons) == 2
    for i, label in enumerate(buttons):
        data = chat(offline, label, language=lang, session_id=f"b{i}")
        assert data["category"] == "emergency" and data["protocol"]["name"] == "general_emergency"
        assert data["language"] == lang or label == "SOS"


# --------------------------------------------------------------------------- API: AI up -> AI reply + the fixed line
def test_another_language_with_ai_gets_the_ai_reply_and_always_the_safety_line(live, ollama):
    data = chat(live, FRENCH, language="de")
    assert data["ai_used"] is True and data["category"] == "small_talk"
    assert data["reply"] == f"{ollama.reply} {SAFETY_LINE['de']}"
    assert data["suggestions"] == EMERGENCY_BUTTONS["de"]
    (call,) = ollama.chat_calls
    system = call["messages"][0]["content"]
    assert "SAME language" in system and "medical advice" in system and "medical officer" in system
    assert call["messages"][-1] == {"role": "user", "content": FRENCH}


@pytest.mark.parametrize(
    "reply",
    [
        "Take some medicine for the fever and rest.",  # health words: the same post-filter as every AI reply
        "Vous avez peut-être une dépression.",  # a label for how someone feels
        "• Première ligne • Deuxième ligne",  # a bullet list
        "x" * 400,  # too long
    ],
)
def test_an_unsafe_or_long_ai_reply_is_dropped_but_the_line_stays(make_client, reply):
    data = chat(make_client(FakeOllama(reply=reply)), FRENCH)
    assert data["ai_used"] is False and data["reply"] == SAFETY_LINE["en"]


def test_ai_errors_fall_back_to_the_line(make_client):
    data = chat(make_client(FakeOllama(chat_status=500)), CHINESE)
    assert data["ai_used"] is False and data["reply"] == SAFETY_LINE["en"]


# --------------------------------------------------------------------------- emergencies are never decided by the AI
@pytest.mark.parametrize(
    "message",
    ["SOS", "SOS j'ai besoin d'aide pour la station spatiale", "我需要 SOS 帮助", "نحتاج SOS الآن", "112", "911"],
)
def test_sos_and_emergency_numbers_are_emergencies_in_any_language(live, ollama, message):
    data = chat(live, message)
    assert data["category"] == "emergency" and data["protocol"]["name"] == "general_emergency"
    assert data["ai_used"] is False and ollama.chat_calls == []


def test_the_emergency_layer_runs_before_the_foreign_language_path(live, ollama):
    # A French sentence with a Spanish emergency keyword: the router reads every language.
    data = chat(live, "Bonjour la station, il est inconsciente et ne répond pas")
    assert data["category"] == "emergency" and data["protocol"]["name"] == "fainting_unresponsive"
    assert ollama.chat_calls == []


# --------------------------------------------------------------------------- no regression for es / en
@pytest.mark.parametrize("message", ["hora", "ok", "helo", "grcias", "holaaa", "😀", "What time is the docking?"])
def test_priority_language_messages_never_take_the_foreign_path(live, ollama, message):
    data = chat(live, message)
    assert SAFETY_LINE["en"] not in data["reply"] and SAFETY_LINE["es"] not in data["reply"]
    assert data["suggestions"] != EMERGENCY_BUTTONS["en"]


def test_a_foreign_message_does_not_change_the_language_of_the_session(offline):
    assert chat(offline, "hola", session_id="k")["language"] == "es"
    assert chat(offline, FRENCH, session_id="k")["category"] == "fallback"
    assert chat(offline, "ok", session_id="k")["language"] == "es"


def test_ru_de_messages_are_not_foreign(offline):
    for message in ("Привет, как дела?", "Расскажи про Марс", "Hallo, wie geht es dir?", "Erzähl mir etwas über den Mond"):
        data = chat(offline, message)
        assert SAFETY_LINE["en"] not in data["reply"], message


# --------------------------------------------------------------------------- language_hint (router keywords)
@pytest.mark.parametrize(
    "text,lang",
    [("Notfall", "de"), ("Puls", "de"), ("Brustschmerzen", "de"), ("Кровотечение", "ru"), ("Пульс", "ru"), ("dolor de pecho", "es"),
     ("chest pain", "en"), ("Wie geht es Rubén?", "de")],
)
def test_language_hint_fills_the_gaps_of_the_detector(text, lang):
    from app.config import REPO_DIR
    from app.intent import KeywordRouter

    router = KeywordRouter.load(REPO_DIR / "shared" / "keywords.json")
    assert router.language_hint(text)[0] == lang


def test_language_hint_ignores_words_shared_by_languages():
    from app.config import REPO_DIR
    from app.intent import KeywordRouter

    router = KeywordRouter.load(REPO_DIR / "shared" / "keywords.json")
    assert router.language_hint("ok") == (None, 0)
    assert router.language_hint("no") == (None, 0)
    assert router.language_hint("") == (None, 0)
