import pytest

from app.ai import CANNED_REPLIES
from app.language import detect_language


@pytest.mark.parametrize(
    "text,expected",
    [
        ("i dont speak spanish", "en"),
        ("hi", "en"),
        ("I can't breathe", "en"),
        ("Hola, buenos días", "es"),
        ("me duele el pecho", "es"),
        ("no puedo respirar", "es"),
        ("ok", None),
        ("Moon-C", None),
        # Russian: Cyrillic script
        ("Привет, мне плохо", "ru"),
        ("Я не могу дышать", "ru"),
        ("у меня болит грудь", "ru"),
        ("Спасибо!", "ru"),
        # German: function words and umlauts on the RAW text
        ("Ich kann nicht atmen", "de"),
        ("Hallo, ich habe Schmerzen in der Brust", "de"),
        ("Mir ist schwindelig und ich bin müde", "de"),
        ("Danke", "de"),
        ("Tschüss", "de"),
        ("Füße", "de"),
        ("ÄÖÜ", "de"),
        # no letters
        ("123", None),
        ("😀", None),
        ("", None),
        ("!!! 12:30", None),
        # mixes
        ("hola, ich habe Schmerzen", "de"),
        ("Привет, I need help", "en"),
        ("Привет hi, мне нужна помощь", "ru"),
    ],
)
def test_detect_language(text, expected):
    assert detect_language(text) == expected


def test_canned_replies_have_same_shape_in_all_languages():
    shape = {k: len(v) for k, v in CANNED_REPLIES["en"].items()}
    for lang in ("es", "ru", "de"):
        assert {k: len(v) for k, v in CANNED_REPLIES[lang].items()} == shape


# --------------------------------------------------------------------------- shared cases (backend and front-end)
import json  # noqa: E402

from conftest import FakeOllama  # noqa: E402

from app.config import REPO_DIR  # noqa: E402

SHARED_CASES = json.loads((REPO_DIR / "shared" / "language_cases.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", SHARED_CASES, ids=lambda c: c["text"])
def test_shared_language_cases(case):
    """The front-end copy of the word lists (src/lib/language.js) runs the same cases."""
    assert detect_language(case["text"]) == case["language"]


@pytest.mark.parametrize("lang,other", [("en", "es"), ("es", "en")])
def test_canned_replies_are_never_taken_for_the_other_language(lang, other):
    for replies in CANNED_REPLIES[lang].values():
        for reply in replies:
            assert detect_language(reply) != other, reply


# --------------------------------------------------------------------------- AI reply in another language
def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_ai_reply_in_another_language_is_replaced(make_client):
    """Moisés writes in English, so the reply is in English; a 4B model sometimes still answers in
    Spanish (his profile language). That reply would be labelled "en" and read with the English voice,
    so Moon-C answers with a canned English reply instead."""
    ollama = FakeOllama(reply="¡Hola Moisés! Estoy aquí contigo y lista para lo que necesites.")
    data = chat(make_client(ollama), "Hi Moon-C, how are you today?", crew_id="moises")
    assert data["language"] == "en"
    assert data["ai_used"] is False
    assert data["reply"] in [r for replies in CANNED_REPLIES["en"].values() for r in replies]


def test_ai_reply_in_the_message_language_is_kept(make_client):
    ollama = FakeOllama(reply="¡Hola Ana! Qué gusto saludarte.")
    data = chat(make_client(ollama), "Hola Moon-C, ¿cómo estás hoy?", crew_id="ana")
    assert data["language"] == "es" and data["ai_used"] is True
    assert data["reply"] == "¡Hola Ana! Qué gusto saludarte."


def test_ai_reply_in_another_language_during_support_keeps_listening(make_client, shared_dir):
    support = json.loads((shared_dir / "support.json").read_text(encoding="utf-8"))
    ollama = FakeOllama(reply="Te entiendo, cuéntame más de lo que pasa.")
    client = make_client(ollama)
    assert chat(client, "I'm very stressed", crew_id="ana")["category"] == "support"
    data = chat(client, "It is all the work on the station", crew_id="ana")
    assert data["language"] == "en" and data["ai_used"] is False
    assert data["reply"] in support["continue"]["en"]
