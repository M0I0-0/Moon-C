"""Per-message language detection (Spanish / English), deterministic and offline.

Counts whole-word hits of very common words that belong to only one of the two
languages (words both share, like "no", "me" or "a", are left out). The text is
normalized like the keyword router, so accents and apostrophes do not matter.
A tie or no hits returns None: the caller keeps the language already in use.
"""

from __future__ import annotations

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


def detect_language(text: str) -> str | None:
    """Return "es" or "en" when the text clearly belongs to one, otherwise None."""
    words = normalize(text).split()
    es = sum(w in _ES for w in words)
    en = sum(w in _EN for w in words)
    if es == en:
        return None
    return "es" if es > en else "en"
