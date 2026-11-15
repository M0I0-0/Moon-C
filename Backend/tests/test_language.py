import pytest

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
    ],
)
def test_detect_language(text, expected):
    assert detect_language(text) == expected
