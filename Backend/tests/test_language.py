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
