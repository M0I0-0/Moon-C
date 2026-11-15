"""Fallback for languages outside the four priority ones (es, en, ru, de).

Decision (user): emergency protocols are deterministic ONLY in Spanish, English, Russian and German. For any
other language Moon-C cannot promise the protocol, so it says so honestly:

1. The deterministic emergency layer always runs first (``chat.py`` classifies every message with the keywords
   of all four languages; "SOS" and a bare "112"/"911" are emergencies in any language). That code path never
   reaches this module.
2. If the message is not an emergency and looks like another language, the local multilingual AI answers in the
   SAME language the person wrote (1-2 short sentences, no medical advice), through the same post-filter as every
   other AI reply.
3. A FIXED safety line (es/en/ru/de, by the account's language, English by default) is ALWAYS added: Moon-C can
   only guide emergency protocols with certainty in es/en/ru/de; in an emergency call a crewmate and the medical
   officer.
4. Without AI (Ollama down or not installed) the reply is ONLY that line plus buttons ("SOS" and the word for
   emergency in the account's language, both always routed to the general emergency protocol).

What counts as "another language" (``is_foreign_message``), deliberately simple and offline:

* ``dominant_script``: the writing system holding most of the letters, by Unicode ranges (below).
* A script that is neither Latin nor Cyrillic (Arabic, Chinese, Japanese, Korean, Greek, Hebrew, Indic, Thai...)
  is another language, whatever ``detect_language`` says.
* Cyrillic: letters that Russian does not use (Ukrainian i/ї/є/ґ, Serbian ј/љ/њ/ћ/ђ) mean another language.
* Latin script: ``detect_language`` only counts a few common words (French shares "la", "de", "un" with Spanish and
  would be read as Spanish), so it is not trusted alone. The text is another language when it has enough letters
  (not "ok", not one word, not emoji) AND few of its words are known: a word is known if it is a very common word of
  es/en/de/ru (``COMMON_WORDS``) or appears in any keyword of shared/keywords.json. Rule: no known word at all
  (2+ words, ``MIN_LETTERS`` letters) or fewer than ``MAX_KNOWN_RATIO`` of 3+ words known; letters that es/en/de do
  not use (French/Portuguese/Italian/Polish/Turkish... accents) lower the bar to 2 words and half the words known.
  The caller only asks when the keyword router found nothing in the message.

The AI is never asked for health advice; the prompt forbids it and the post-filter drops any reply that mentions
health or emergency words of the four languages.

# supuesto: traducción por validar con traductor médico (líneas de seguridad es/en/ru/de)
"""

from __future__ import annotations

import unicodedata

from .ai import is_safe_small_talk
from .intent import KeywordRouter, normalize
from .schemas import ChatResponse

PRIORITY_LANGUAGES: tuple[str, ...] = ("es", "en", "ru", "de")

MIN_LETTERS = 10
"""A Latin text needs at least this many letters (and 2 words) to be called "another language"."""
MAX_KNOWN_RATIO = 0.34
"""Share of known words below which a Latin text of 3+ words is called "another language"."""
MAX_REPLY_CHARS = 300


def is_priority_language(lang: str | None) -> bool:
    """True for the languages with deterministic emergency protocols (es, en, ru, de)."""
    return lang in PRIORITY_LANGUAGES


# --------------------------------------------------------------------------- script detection
# Unicode ranges (inclusive). Letters outside every range count as "other".
_SCRIPT_RANGES: tuple[tuple[str, tuple[tuple[int, int], ...]], ...] = (
    ("latin", ((0x0041, 0x024F), (0x1E00, 0x1EFF), (0x2C60, 0x2C7F), (0xA720, 0xA7FF), (0xFF21, 0xFF5A))),
    ("cyrillic", ((0x0400, 0x052F), (0x1C80, 0x1C8F), (0x2DE0, 0x2DFF), (0xA640, 0xA69F))),
    ("greek", ((0x0370, 0x03FF), (0x1F00, 0x1FFF))),
    ("hebrew", ((0x0590, 0x05FF),)),
    ("arabic", ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))),
    ("indic", ((0x0900, 0x0DFF),)),
    ("thai_lao", ((0x0E00, 0x0EFF),)),
    ("han", ((0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF), (0x20000, 0x2A6DF))),
    ("kana", ((0x3040, 0x30FF), (0x31F0, 0x31FF))),
    ("hangul", ((0x1100, 0x11FF), (0x3130, 0x318F), (0xAC00, 0xD7AF))),
)
_NOT_RUSSIAN = frozenset("іїєґўјљњћђ")  # Ukrainian, Belarusian and Serbian letters Russian does not use
_RUSSIAN_ONLY = frozenset("ыэъ")
# Accented letters that Spanish, English, German and Russian do not use (French, Portuguese, Italian, Polish, ...).
_FOREIGN_LETTERS = frozenset("çàèùâêîôûëïœãõìòłąęśźżćńğşıřěčžůåøæășțđ")

# Very common words (folded like intent.normalize) so an ordinary sentence of the four languages is never "foreign".
COMMON_WORDS = frozenset(
    (
        "the a an and or but if so to of in on at for with from by as is are was were be been am i you he she it we "
        "they me my your his her our their this that these those what when where who why how not no yes do does did "
        "have has had can could will would should just about there here now then than very more some any all one "
        "el la los las un una unos unas y o pero si que de del en con por para es son era fue ser soy eres somos "
        "yo tu mi me te se lo le les nos como cuando donde quien por que no si muy mas ya hay tengo tiene "
        "sobre entre hasta desde sin sus esto eso esta estos ese otro cada todo nada bien mal aqui alli hoy "
        "ahora tambien siempre nunca algo tiene puede quiero necesito hacer hablar decir "
        "about from into over after before again also always never something nothing want need tell make talk say "
        "über für auch noch schon nur dann mehr sehr hier jetzt immer nie etwas nichts will möchte brauche sagen "
        "der die das den dem des ein eine einen einem einer und oder aber wenn dass ist sind war waren bin bist "
        "ich du er sie es wir ihr mich mir dir ihm nicht kein keine ja nein wie was wo wer warum mit von zu im am "
        "и в во не на я с со что он она оно мы вы они это как а то все так его только но да ты к у же за бы по "
        "от о из ну мне меня мой моя мое мои ли или если уже нет"
    ).split()
)


def script_of(ch: str) -> str | None:
    """Writing system of a letter (None if ``ch`` is not a letter)."""
    if not unicodedata.category(ch).startswith("L"):
        return None
    code = ord(ch)
    for name, ranges in _SCRIPT_RANGES:
        if any(lo <= code <= hi for lo, hi in ranges):
            return name
    return "other"


def dominant_script(text: str) -> tuple[str | None, int]:
    """(script with most letters, number of letters). ``(None, 0)`` without letters (digits, emoji, symbols)."""
    counts: dict[str, int] = {}
    for ch in text:
        name = script_of(ch)
        if name:
            counts[name] = counts.get(name, 0) + 1
    if not counts:
        return None, 0
    return max(counts, key=counts.__getitem__), sum(counts.values())


def _known_ratio(text: str, known: frozenset[str]) -> tuple[int, float]:
    """(number of words, share of them that Moon-C knows) over the folded words of ``text``."""
    words = [w for w in normalize(text).split() if any(c.isalpha() for c in w)]
    if not words:
        return 0, 1.0
    hits = sum(w in COMMON_WORDS or w in known for w in words)
    return len(words), hits / len(words)


def is_foreign_message(text: str, detected: str | None = None, known: frozenset[str] = frozenset()) -> bool:
    """True if ``text`` looks like a language outside es/en/ru/de (see the module docstring).

    ``detected``: result of ``detect_language`` (only used to leave Cyrillic text alone: it is Russian unless it
    has letters Russian does not use). ``known``: the router's vocabulary (``KeywordRouter.vocabulary``).
    """
    script, letters = dominant_script(text)
    if not script or not letters:
        return False
    if script not in ("latin", "cyrillic"):
        return True
    if script == "cyrillic":
        lowered = text.casefold()
        return any(c in _NOT_RUSSIAN for c in lowered) and not any(c in _RUSSIAN_ONLY for c in lowered)
    words, ratio = _known_ratio(text, known)
    if letters < MIN_LETTERS or words < 2:
        return False
    if any(c in _FOREIGN_LETTERS for c in text.casefold()):
        return ratio < 0.5
    return ratio == 0 or (words >= 3 and ratio < MAX_KNOWN_RATIO)


# --------------------------------------------------------------------------- fixed texts
SAFETY_LINE = {
    "en": (
        "Moon-C can only guide emergency protocols with certainty in Spanish, English, Russian and German. "
        "If this is an emergency, call a crewmate and the on-board medical officer now."
    ),
    "es": (
        "Moon-C solo puede guiar protocolos de emergencia con certeza en español, inglés, ruso y alemán. "
        "Si es una emergencia, llama ahora a un compañero y al oficial médico a bordo."
    ),
    "ru": (
        "Moon-C может уверенно вести экстренные протоколы только на испанском, английском, русском и немецком. "
        "Если это экстренная ситуация, сейчас же позови члена экипажа и бортового медицинского офицера."
    ),
    "de": (
        "Moon-C kann Notfallprotokolle nur auf Spanisch, Englisch, Russisch und Deutsch sicher begleiten. "
        "Wenn es ein Notfall ist, ruf jetzt sofort einen Kameraden und den medizinischen Offizier an Bord."
    ),
}
# Buttons: "SOS" works in every language; the second one is the word for "emergency" in the account's language.
# Both are matched by shared/keywords.json (general_emergency) and open the general emergency protocol.
EMERGENCY_BUTTONS = {
    "en": ["SOS", "Emergency"],
    "es": ["SOS", "Emergencia"],
    "ru": ["SOS", "Экстренная ситуация"],
    "de": ["SOS", "Notfall"],
}

SYSTEM_PROMPT = (
    "You are Moon-C, a friendly assistant on a space mission. "
    "Reply in the SAME language as the user's message, in 1-2 short sentences, no lists. "
    "Do NOT give medical advice, do not diagnose and do not name conditions or treatments. "
    "If anything sounds urgent or like an emergency, say they should call a crewmate and the on-board medical "
    "officer right away. Never invent facts."
)


def safety_line(lang: str | None) -> str:
    return SAFETY_LINE.get(lang or "en") or SAFETY_LINE["en"]


def emergency_buttons(lang: str | None) -> list[str]:
    return list(EMERGENCY_BUTTONS.get(lang or "en") or EMERGENCY_BUTTONS["en"])


def build_reply(ai_text: str | None, lang: str | None) -> str:
    """The AI sentence (if any) followed by the fixed safety line, which is never left out."""
    line = safety_line(lang)
    return f"{ai_text} {line}" if ai_text else line


def is_valid_reply(text: str) -> bool:
    """The AI may chat, but must stay short and plain (no lists, no long advice)."""
    return 0 < len(text) <= MAX_REPLY_CHARS and "\n" not in text and "•" not in text


# --------------------------------------------------------------------------- the service
class MultilingualFallback:
    """AI reply in the user's language + fixed safety line. ``client`` is an ``OllamaClient`` (or None)."""

    def __init__(self, client, router: KeywordRouter):
        self.client = client
        self.router = router

    async def ai_reply(self, message: str) -> str | None:
        """One short, filtered AI reply in the user's language, or None (AI down, slow, unsafe or too long)."""
        if self.client is None:
            return None
        text = await self.client.chat(
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": message}]
        )
        if not text or not is_valid_reply(text) or not is_safe_small_talk(text, self.router):
            return None
        return text

    async def respond(self, message: str, account_lang: str | None) -> ChatResponse:
        """ChatResponse for a message in another language. ``account_lang``: language of the account (or None)."""
        lang = account_lang if is_priority_language(account_lang) else "en"
        ai_text = await self.ai_reply(message)
        return ChatResponse(
            category="small_talk" if ai_text else "fallback",
            reply=build_reply(ai_text, lang),
            language=lang,
            ai_used=ai_text is not None,
            suggestions=emergency_buttons(lang),
        )
