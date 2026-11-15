"""Per-message language detection (es / en / ru / de), deterministic and offline.

ALGORITHM (the frontend mirror front-end/src/lib/language.js MUST implement the same; keep both in sync):
  1. Russian: among the alphabetic characters of the RAW text, if at least 50 % are Cyrillic
     (U+0400-U+04FF) -> "ru". No letters at all (digits, emoji, punctuation) -> None.
  2. Spanish / English: whole-word hits of very common words that belong to only one of the two
     languages (_ES / _EN, words they share are left out). The text is normalized like the keyword
     router, so accents and apostrophes do not matter.
  3. German: computed on the RAW lowercase text (normalize() strips umlauts, so they must be seen
     before it). Tokens are runs of [a-zäöüß]; score = whole-word hits in _DE
     (words that exist only in German, or are far more common there; ambiguous ones such as
     "was", "die", "hat", "im", "arm" are left out) + 2 if the text contains any of ä ö ü ß.
  4. The highest score among es / en / de wins; a tie (including 0-0-0) returns None and the caller
     keeps the language already in use.
"""

from __future__ import annotations

import re

from .intent import normalize

_ES = frozenset(
    "hola buenas buenos dias tardes noches gracias porfa por favor el la los las un una unos unas de del que "
    "como cuando donde quien cual es soy eres estoy esta estas estan tengo tienes tiene siento sientes puedo "
    "puede quiero necesito ayuda ayudame mi mis tu tus su muy mas pero y o con sin para pq porque si yo "
    "nosotros estamos tenemos duele dolor respirar sangre sangrado desmayo desmayado cansado cansada "
    "hablo espanol ingles entiendo entiendes dime cuentame algo nada todo bien mal hoy ahora aqui adios chao queme cai caigo golpee cabeza tobillo rodilla raspe torci corte lastime pecho infarto ahogo ahogando asfixio matar sangra sangrando desmaye cortada herida quemadura mano brazo pierna".split()
)
_EN = frozenset(
    "hi hello hey thanks thank you please the an is are am was were be been i im ive my mine your yours "
    "his her their we they it this that these those what when where who why how do does did dont doesnt "
    "didnt cant cannot can could would should will have has had feel feeling feels need help want to of "
    "for with without and or but not very more speak english spanish understand tell something nothing "
    "everything good bad today now here pain breathe breathing bleeding fainted tired sleep sleepy bye goodbye burned burnt hit head fell fall ankle knee twisted sprained cut hurt chest heart attack drowning kill myself die hand arm leg".split()
)

# German-only function words and a few very common health words. Keep in sync with language.js.
_DE = frozenset(
    "ich du er sie wir ihr ist nicht und der das ein eine einen mein meine meinen mir mich dir dich "
    "bitte danke hallo guten morgen abend tag wie wo wer warum wann habe hast haben bin bist sind "
    "brauche brauchst hilfe kopf kopfschmerzen schmerzen schmerz brust atmen atme blut blutet blutung "
    "mit ohne für aber auch sehr heute jetzt hier gut schlecht müde schwindel schwindelig kann kannst "
    "kein keine nein ja doch bei zu auf von zum zur dem den nichts alles etwas sprechen deutsch "
    "englisch verstehe verstehst sag erzähl tschüss ohnmächtig verletzt gefallen gestürzt gebrochen "
    "verbrannt verbrennung wunde knöchel knie bein herz herzinfarkt ersticken tut weh fühle "
    "fühlst nacht abend".split()
)
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_ALPHA = re.compile(r"[^\W\d_]")
_DE_TOKEN = re.compile(r"[a-zäöüß]+")
_DE_CHARS = re.compile(r"[äöüß]")


def detect_language(text: str) -> str | None:
    """Return "es", "en", "ru" or "de" when the text clearly belongs to one, otherwise None."""
    letters = _ALPHA.findall(text)
    if not letters:
        return None
    if sum(bool(_CYRILLIC.match(c)) for c in letters) * 2 >= len(letters):
        return "ru"
    words = normalize(text).split()
    scores = {
        "es": sum(w in _ES for w in words),
        "en": sum(w in _EN for w in words),
    }
    lower = text.lower()
    scores["de"] = sum(w in _DE for w in _DE_TOKEN.findall(lower)) + (2 if _DE_CHARS.search(lower) else 0)
    best = max(scores.values())
    leaders = [lang for lang, n in scores.items() if n == best]
    if best == 0 or len(leaders) != 1:
        return None
    return leaders[0]
