"""Crew data in the chat: report a reading, ask about a crew member.

Two things a crew member can do in the chat without leaving it:

1. REPORT a reading ("tengo 40 de temperatura", "my pulse is 130", "dormí 4 horas"). It is validated with
   the manual's limits, stored like POST /measurements does (``record_reading`` is shared with it) and
   compared with the manual's ranges. A reading in the attention or urgent range raises an on-board alert
   that every crew member (General account included) sees; an urgent one also opens the manual's protocol.
   Only crew accounts can report. A doubtful number is never stored: Moon-C asks first, with buttons.
2. ASK about someone ("¿cómo está Rubén?", "how is Ruben doing?"). Privacy: individual data is private and
   opens only in an emergency, so the answer comes ONLY from open (active or acknowledged) alerts: which
   indicator, a qualitative level ("temperatura alta"), how long ago. Never the number, never chat text,
   never a support profile. At most 3 alerts, newest first.

Matching is deterministic and offline; its keywords live in shared/keywords.json ("crew_query", "reading").
Languages: es, en, ru, de (a missing language falls back to English, never a KeyError). Text is folded like
``intent.normalize`` (casefold + NFKD, no combining marks), so Cyrillic and umlauts match; word boundaries use
word characters of any script, not only a-z.
Temperature in °F is converted to °C (``(F - 32) * 5 / 9``, one decimal). Without a unit, a temperature
between 77 and 113 is assumed to be °F only after the person confirms it.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .alerts import ALERT_STATUSES, MANEUVER_NAMES, Alert, AlertBoard
from .crew import CrewMember, CrewRegistry
from .evaluator import Evaluation, MeasurementValueError, describe, evaluate
from .manual import Manual, format_number, format_value
from .schemas import ChatResponse, Measurement
from .storage import MeasurementStore, now_utc, to_utc

MAX_ALERTS = 3
FAHRENHEIT_RANGE = (77.0, 113.0)
URGENT = "urgent"


# --------------------------------------------------------------------------- shared recording
@dataclass(frozen=True)
class RecordedReading:
    measurement: Measurement
    evaluation: Evaluation
    alert: Alert | None


def record_reading(
    manual: Manual,
    store: MeasurementStore,
    alerts: AlertBoard,
    crew: CrewMember | None,
    indicator: str,
    value: float,
    unit: str,
    timestamp: datetime | None = None,
    alert_statuses: tuple[str, ...] = ALERT_STATUSES,
) -> RecordedReading:
    """Validate, store and evaluate a reading; raise an alert for the given statuses.

    Used by POST /measurements and by the chat. Raises MeasurementValueError if the value is invalid.
    """
    evaluation = evaluate(manual, indicator, value, unit)
    measurement = Measurement(
        id=uuid.uuid4().hex,
        crew_id=crew.crew_id if crew else None,
        indicator=evaluation.indicator,
        value=evaluation.value,
        unit=evaluation.unit,
        status=evaluation.status,
        timestamp=to_utc(timestamp) if timestamp else now_utc(),
        synced=False,
    )
    store.add(measurement)
    alert = alerts.raise_vital(measurement, crew.name if crew else None) if evaluation.status in alert_statuses else None
    return RecordedReading(measurement, evaluation, alert)


def guidance_steps(manual: Manual, support, profiles, indicator: str, status: str, lang: str, crew) -> list[str]:
    """Manual steps for a reading; a low mood also gets the lines of the crew member's support profile."""
    steps = manual.what_to_do(indicator, status, lang)
    if indicator == "mood" and status != "normal" and crew is not None and support is not None and profiles is not None:
        steps = support.mood_guidance(profiles.get(crew.crew_id), lang) + steps
    return steps


# --------------------------------------------------------------------------- text helpers
def fold(text: str) -> str:
    """Lowercase, no accents or apostrophes, decimal comma -> point. Keeps digits, °, % and /."""
    text = text.replace("º", "°").replace("˚", "°").casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"['’‘`´ʼ]", "", text)
    return re.sub(r"(?<=\d),(?=\d)", ".", text)


_WORD = r"[^\W_]+"  # letters and digits of any script (not "_")


def _has(folded: str, phrase: str) -> bool:
    return re.search(rf"(?<![^\W_]){re.escape(phrase)}(?![^\W_])", folded) is not None


def _find(folded: str, phrase: str) -> int:
    m = re.search(rf"(?<![^\W_]){re.escape(phrase)}(?![^\W_])", folded)
    return m.start() if m else -1


_TRANSLIT = dict(zip(
    "абвгдезиклмнопрстуфхъыьэ",
    ["a", "b", "v", "g", "d", "e", "z", "i", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "", "y", "", "e"],
))
_TRANSLIT.update({"ж": "zh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ю": "yu", "я": "ya"})


def translit(word: str) -> str:
    """Cyrillic -> Latin (rough), to match a crew member's Latin name typed in Cyrillic ("Рубен" -> "ruben")."""
    return "".join(_TRANSLIT.get(ch, ch) for ch in word)


def _name_matches(token: str, keys: set[str]) -> bool:
    """A token is a crew name, also typed in Cyrillic or with a Russian ending ("Рубена", "Валентины")."""
    if token in keys:
        return True
    if not re.search(r"[а-я]", token):
        return False
    latin = translit(token)
    return any(latin == k or (len(k) >= 5 and latin.startswith(k[:-1]) and len(latin) - len(k) <= 2) for k in keys)


_NUMBER = re.compile(
    r"(?<![^\W_]|[./])(\d+(?:\.\d+)?)\s*"
    r"(°\s*[cf](?![a-z])|°|[cf](?![a-z0-9])|celsius|fahrenheit|grados(?:\s+(?:celsius|fahrenheit|centigrados))?|degrees|"
    r"bpm|%|por ciento|percent|mmhg|horas?|hours?|hrs?|h(?![a-z0-9])|"
    r"градус(?:а|ов)?(?:\s+(?:цельсия|фаренгейта))?|grad(?:e)?(?:\s+(?:celsius|fahrenheit))?|"
    r"процент(?:а|ов)?|prozent|ударов\s+в\s+минуту|час(?:а|ов)?|stunden?|std(?![a-z0-9]))?"
)
_PRESSURE = re.compile(r"(?<![^\W_]|[./])(\d{2,3})\s*(?:/|sobre|over|на|zu)\s*(\d{2,3})(?![0-9])")
_SPLIT = re.compile(r";|,|\s+(?:y|and|e|pero|but|и|но|und|aber)\s+")
_BARE_NUMBER = re.compile(
    r"\s*(\d+(?:\.\d+)?)\s*(°\s*[cf]|[cf]|celsius|fahrenheit|bpm|%|horas?|hours?|h|градус(?:а|ов)?|grad|"
    r"час(?:а|ов)?|stunden?)?\s*"
)

_UNIT_INDICATOR = {
    "bpm": "heart_rate", "%": "spo2", "por ciento": "spo2", "percent": "spo2", "mmhg": "blood_pressure",
    "процент": "spo2", "процента": "spo2", "процентов": "spo2", "prozent": "spo2", "ударов в минуту": "heart_rate",
}


def _unit_kind(unit: str | None) -> str | None:
    """'c', 'f' for temperature units, otherwise the normalized unit text."""
    if not unit:
        return None
    u = unit.replace(" ", "")
    if u.startswith("°") and len(u) == 1:
        return "c"
    if u in ("°c", "c", "celsius", "gradoscelsius", "gradoscentigrados", "grados", "degrees"):
        return "c"
    if u in ("°f", "f", "fahrenheit", "gradosfahrenheit"):
        return "f"
    if u.startswith(("градус", "grad")):  # ru/de: "40 градусов", "40 Grad" (Celsius unless Fahrenheit is named)
        return "f" if ("фаренг" in u or "fahr" in u) else "c"
    return unit


def _fmt(value: float) -> str:
    return format_number(round(value, 1))


# --------------------------------------------------------------------------- relative time
def _ru_plural(n: int, forms: tuple[str, str, str]) -> str:
    """Russian plural: 1 минута, 2 минуты, 5 минут (21 -> one, 11-14 -> many)."""
    if n % 100 in range(11, 15):
        return forms[2]
    return forms[0] if n % 10 == 1 else forms[1] if n % 10 in (2, 3, 4) else forms[2]


def ago(delta: timedelta, lang: str) -> str:
    """Relative time: 'Hace 12 minutos' / '12 minutes ago' / '12 минут назад' / 'Vor 12 Minuten' (capitalized)."""
    seconds = max(0, int(delta.total_seconds()))
    minutes = seconds // 60
    if minutes < 1:
        return {
            "es": "Hace menos de un minuto",
            "ru": "Менее минуты назад",  # supuesto: traducción por validar con traductor médico
            "de": "Vor weniger als einer Minute",
        }.get(lang, "Less than a minute ago")
    if minutes < 60:
        n, es, en = minutes, ("minuto", "minutos"), ("minute", "minutes")
        ru, de = ("минуту", "минуты", "минут"), ("Minute", "Minuten")
    elif minutes < 1440:
        n, es, en = minutes // 60, ("hora", "horas"), ("hour", "hours")
        ru, de = ("час", "часа", "часов"), ("Stunde", "Stunden")
    else:
        n, es, en = minutes // 1440, ("día", "días"), ("day", "days")
        ru, de = ("день", "дня", "дней"), ("Tag", "Tagen")
    if lang == "es":
        return f"Hace {n} {es[0] if n == 1 else es[1]}"
    if lang == "ru":
        return f"{n} {_ru_plural(n, ru)} назад"
    if lang == "de":
        return f"Vor {n} {de[0] if n == 1 else de[1]}"
    return f"{n} {en[0] if n == 1 else en[1]} ago"


# Qualitative level of an alert: (low, high). Spanish phrases include their article.
_LEVEL = {
    "es": {
        "heart_rate": ("un pulso bajo", "un pulso alto"),
        "body_temperature": ("una temperatura baja", "una temperatura alta"),
        "spo2": ("una saturación de oxígeno baja", "una saturación de oxígeno alta"),
        "sleep_hours": ("poco sueño", "demasiado sueño"),
        "mood": ("un estado de ánimo bajo", "un estado de ánimo bajo"),
        "blood_pressure_systolic": ("una presión sistólica baja", "una presión sistólica alta"),
        "blood_pressure_diastolic": ("una presión diastólica baja", "una presión diastólica alta"),
        "respiratory_rate": ("una frecuencia respiratoria baja", "una frecuencia respiratoria alta"),
        "radiation": ("una radiación baja", "una radiación alta"),
    },
    "en": {
        "heart_rate": ("a low heart rate", "a high heart rate"),
        "body_temperature": ("a low temperature", "a high temperature"),
        "spo2": ("low oxygen saturation", "high oxygen saturation"),
        "sleep_hours": ("too little sleep", "too much sleep"),
        "mood": ("a low mood", "a low mood"),
        "blood_pressure_systolic": ("low systolic blood pressure", "high systolic blood pressure"),
        "blood_pressure_diastolic": ("low diastolic blood pressure", "high diastolic blood pressure"),
        "respiratory_rate": ("a low respiratory rate", "a high respiratory rate"),
        "radiation": ("low radiation", "high radiation"),
    },
    # supuesto: traducción por validar con traductor médico (ru)
    "ru": {
        "heart_rate": ("низкий пульс", "высокий пульс"),
        "body_temperature": ("низкая температура", "высокая температура"),
        "spo2": ("низкое насыщение кислородом", "высокое насыщение кислородом"),
        "sleep_hours": ("мало сна", "слишком много сна"),
        "mood": ("пониженное настроение", "пониженное настроение"),
        "blood_pressure_systolic": ("низкое систолическое давление", "высокое систолическое давление"),
        "blood_pressure_diastolic": ("низкое диастолическое давление", "высокое диастолическое давление"),
        "respiratory_rate": ("низкая частота дыхания", "высокая частота дыхания"),
        "radiation": ("низкая радиация", "высокая радиация"),
    },
    # supuesto: traducción por validar con traductor médico (de); Akkusativ nach "gemeldet"
    "de": {
        "heart_rate": ("einen niedrigen Puls", "einen hohen Puls"),
        "body_temperature": ("eine niedrige Temperatur", "eine hohe Temperatur"),
        "spo2": ("eine niedrige Sauerstoffsättigung", "eine hohe Sauerstoffsättigung"),
        "sleep_hours": ("zu wenig Schlaf", "zu viel Schlaf"),
        "mood": ("eine gedrückte Stimmung", "eine gedrückte Stimmung"),
        "blood_pressure_systolic": ("einen niedrigen systolischen Blutdruck", "einen hohen systolischen Blutdruck"),
        "blood_pressure_diastolic": ("einen niedrigen diastolischen Blutdruck", "einen hohen diastolischen Blutdruck"),
        "respiratory_rate": ("eine niedrige Atemfrequenz", "eine hohe Atemfrequenz"),
        "radiation": ("eine niedrige Strahlung", "eine hohe Strahlung"),
    },
}

TEXTS = {
    "es": {
        "notified": "{ago} {who} notificó {what}.",
        "notified_self": "{ago} notificaste {what}.",
        "emergency": "una emergencia",
        "support": "que necesita apoyo",
        "maneuver": "el inicio de una guía de {name}",
        "out_of_range": "un valor fuera de rango",
        "several": "{who} tiene {n} alertas activas:",
        "several_self": "Tienes {n} alertas activas:",
        "more": "(y {n} más)",
        "none": "{who} no tiene alertas activas. Sus datos individuales solo se comparten en una emergencia.",
        "none_focus": "{who} no tiene alertas sobre {topic}. Sus datos individuales solo se comparten en una emergencia.",
        "none_self": "No tienes alertas activas.",
        "own_panel": " Puedes ver tus propios signos en tu panel.",
        "unknown": "No reconozco a «{name}» en la tripulación. Dime el nombre de un tripulante.",
        "who": "No sé de quién hablas con la cuenta General. Dime el nombre de un tripulante.",
        "ask_crew": "¿Cómo está {name}?",
        "general": (
            "Para registrar una lectura, entra a tu cuenta de tripulante. "
            "Con la cuenta General no registro lecturas a nombre de nadie."
        ),
        "recorded": "Registrado.",
        "alerted": "Avisé a la tripulación con una alerta a bordo.",
        "what_to_do": "Qué hacer:",
        "protocol": "Abrí el protocolo: {title}.",
        "converted": "({orig} °F = {c} °C)",
        "ask_indicator": "¿A qué indicador corresponde {value}? No lo registré todavía.",
        "ask_value": (
            "{value} no parece {name} (esperaba entre {lo} y {hi} {unit}). No lo registré. "
            "Dime el valor otra vez o cancela."
        ),
        "ask_fahrenheit": "{value} parece estar en °F, equivale a {c} °C. ¿Registro {c} °C como tu temperatura?",
        "ask_integer": "{name} se registra con un número entero. No lo registré. Dime el valor otra vez o cancela.",
        "cancelled": "Listo, no registré nada.",
        "yes_fahrenheit": "Sí, registrar {c} °C",
        "no": "No",
        "cancel": "Cancelar",
        "names": {
            "body_temperature": "Temperatura",
            "heart_rate": "Pulso",
            "spo2": "Saturación",
            "sleep_hours": "Sueño",
            "mood": "Ánimo",
            "respiratory_rate": "Respiración",
        },
        "topics": {
            "body_temperature": "su temperatura",
            "heart_rate": "su pulso",
            "spo2": "su saturación de oxígeno",
            "sleep_hours": "su sueño",
            "mood": "su estado de ánimo",
            "respiratory_rate": "su respiración",
        },
    },
    "en": {
        "notified": "{ago}, {who} reported {what}.",
        "notified_self": "{ago}, you reported {what}.",
        "emergency": "an emergency",
        "support": "needing support",
        "maneuver": "the start of a {name} guide",
        "out_of_range": "an out-of-range value",
        "several": "{who} has {n} active alerts:",
        "several_self": "You have {n} active alerts:",
        "more": "(and {n} more)",
        "none": "{who} has no active alerts. Individual data is only shared in an emergency.",
        "none_focus": "{who} has no alerts about {topic}. Individual data is only shared in an emergency.",
        "none_self": "You have no active alerts.",
        "own_panel": " You can see your own signs in your panel.",
        "unknown": "I don't recognize \"{name}\" in the crew. Tell me a crew member's name.",
        "who": "With the General account I don't know who you mean. Tell me a crew member's name.",
        "ask_crew": "How is {name} doing?",
        "general": (
            "To log a reading, sign in to your crew account. "
            "With the General account I don't log readings on anyone's behalf."
        ),
        "recorded": "Logged.",
        "alerted": "I alerted the crew with an on-board alert.",
        "what_to_do": "What to do:",
        "protocol": "I opened the protocol: {title}.",
        "converted": "({orig} °F = {c} °C)",
        "ask_indicator": "Which indicator is {value}? I haven't logged it yet.",
        "ask_value": (
            "{value} doesn't look like {name} (I expected between {lo} and {hi} {unit}). I didn't log it. "
            "Tell me the value again or cancel."
        ),
        "ask_fahrenheit": "{value} looks like °F, which is {c} °C. Shall I log {c} °C as your temperature?",
        "ask_integer": "{name} is logged as a whole number. I didn't log it. Tell me the value again or cancel.",
        "cancelled": "Okay, I logged nothing.",
        "yes_fahrenheit": "Yes, log {c} °C",
        "no": "No",
        "cancel": "Cancel",
        "names": {
            "body_temperature": "Temperature",
            "heart_rate": "Pulse",
            "spo2": "Oxygen",
            "sleep_hours": "Sleep",
            "mood": "Mood",
            "respiratory_rate": "Breathing",
        },
        "topics": {
            "body_temperature": "their temperature",
            "heart_rate": "their pulse",
            "spo2": "their oxygen saturation",
            "sleep_hours": "their sleep",
            "mood": "their mood",
            "respiratory_rate": "their breathing",
        },
    },
    # supuesto: traducción por validar con traductor médico (ru)
    "ru": {
        "notified": "{ago}. {who}: {what}.",
        "notified_self": "{ago}. Твоё сообщение: {what}.",
        "emergency": "экстренная ситуация",
        "support": "потребность в поддержке",
        "maneuver": "начало руководства: {name}",
        "out_of_range": "значение вне диапазона",
        "several": "{who}: активных оповещений — {n}:",
        "several_self": "У тебя активных оповещений — {n}:",
        "more": "(и ещё {n})",
        "none": "{who}: активных оповещений нет. Личные данные передаются только в экстренной ситуации.",
        "none_focus": "{who}: оповещений по теме «{topic}» нет. Личные данные передаются только в экстренной ситуации.",
        "none_self": "У тебя нет активных оповещений.",
        "own_panel": " Свои показатели ты можешь посмотреть на своей панели.",
        "unknown": "Я не нахожу «{name}» в экипаже. Назови имя члена экипажа.",
        "who": "С общим аккаунтом я не знаю, о ком ты. Назови имя члена экипажа.",
        "ask_crew": "Как дела у {name}?",
        "general": (
            "Чтобы записать показание, войди в аккаунт члена экипажа. "
            "С общим аккаунтом я не записываю показания ни на чьё имя."
        ),
        "recorded": "Записано.",
        "alerted": "Я предупредила экипаж бортовым оповещением.",
        "what_to_do": "Что делать:",
        "protocol": "Я открыла протокол: {title}.",
        "converted": "({orig} °F = {c} °C)",
        "ask_indicator": "К какому показателю относится {value}? Я пока ничего не записала.",
        "ask_value": (
            "{value} не похоже на показатель «{name}» (ожидалось от {lo} до {hi} {unit}). Я не записала. "
            "Назови значение ещё раз или отмени."
        ),
        "ask_fahrenheit": "{value} похоже на °F, это {c} °C. Записать {c} °C как твою температуру?",
        "ask_integer": "Показатель «{name}» записывается целым числом. Я не записала. Назови значение ещё раз или отмени.",
        "cancelled": "Хорошо, я ничего не записала.",
        "yes_fahrenheit": "Да, записать {c} °C",
        "no": "Нет",
        "cancel": "Отмена",
        "names": {
            "body_temperature": "Температура",
            "heart_rate": "Пульс",
            "spo2": "Сатурация",
            "sleep_hours": "Сон",
            "mood": "Настроение",
            "respiratory_rate": "Дыхание",
        },
        "topics": {
            "body_temperature": "температура",
            "heart_rate": "пульс",
            "spo2": "насыщение кислородом",
            "sleep_hours": "сон",
            "mood": "настроение",
            "respiratory_rate": "дыхание",
        },
    },
    # supuesto: traducción por validar con traductor médico (de)
    "de": {
        "notified": "{ago} hat {who} {what} gemeldet.",
        "notified_self": "{ago} hast du {what} gemeldet.",
        "emergency": "einen Notfall",
        "support": "Unterstützungsbedarf",
        "maneuver": "den Beginn einer Anleitung: {name}",
        "out_of_range": "einen Wert außerhalb des Bereichs",
        "several": "{who} hat {n} aktive Warnungen:",
        "several_self": "Du hast {n} aktive Warnungen:",
        "more": "(und {n} weitere)",
        "none": "{who} hat keine aktiven Warnungen. Individuelle Daten werden nur in einem Notfall geteilt.",
        "none_focus": "{who} hat keine Warnungen zum Thema {topic}. Individuelle Daten werden nur in einem Notfall geteilt.",
        "none_self": "Du hast keine aktiven Warnungen.",
        "own_panel": " Deine eigenen Werte siehst du in deinem Panel.",
        "unknown": "Ich kenne „{name}“ in der Crew nicht. Nenne mir den Namen eines Crewmitglieds.",
        "who": "Mit dem allgemeinen Konto weiß ich nicht, wen du meinst. Nenne mir den Namen eines Crewmitglieds.",
        "ask_crew": "Wie geht es {name}?",
        "general": (
            "Um einen Messwert einzutragen, melde dich mit deinem Crew-Konto an. "
            "Mit dem allgemeinen Konto trage ich keine Messwerte im Namen anderer ein."
        ),
        "recorded": "Eingetragen.",
        "alerted": "Ich habe die Crew mit einer Warnung an Bord informiert.",
        "what_to_do": "Was zu tun ist:",
        "protocol": "Ich habe das Protokoll geöffnet: {title}.",
        "converted": "({orig} °F = {c} °C)",
        "ask_indicator": "Zu welchem Wert gehört {value}? Ich habe es noch nicht eingetragen.",
        "ask_value": (
            "{value} sieht nicht nach „{name}“ aus (erwartet zwischen {lo} und {hi} {unit}). Ich habe es nicht "
            "eingetragen. Nenne mir den Wert noch einmal oder brich ab."
        ),
        "ask_fahrenheit": "{value} sieht nach °F aus, das sind {c} °C. Soll ich {c} °C als deine Temperatur eintragen?",
        "ask_integer": "„{name}“ wird als ganze Zahl eingetragen. Ich habe es nicht eingetragen. Nenne mir den Wert noch einmal oder brich ab.",
        "cancelled": "In Ordnung, ich habe nichts eingetragen.",
        "yes_fahrenheit": "Ja, {c} °C eintragen",
        "no": "Nein",
        "cancel": "Abbrechen",
        "names": {
            "body_temperature": "Temperatur",
            "heart_rate": "Puls",
            "spo2": "Sauerstoff",
            "sleep_hours": "Schlaf",
            "mood": "Stimmung",
            "respiratory_rate": "Atmung",
        },
        "topics": {
            "body_temperature": "Temperatur",
            "heart_rate": "Puls",
            "spo2": "Sauerstoffsättigung",
            "sleep_hours": "Schlaf",
            "mood": "Stimmung",
            "respiratory_rate": "Atmung",
        },
    },
}


def _texts(lang: str) -> dict:
    """Texts of a language; a language without them (or a missing key) falls back to English."""
    return {**TEXTS["en"], **TEXTS.get(lang, {})}


# --------------------------------------------------------------------------- parsing structures
@dataclass(frozen=True)
class Item:
    indicator: str  # a manual indicator; blood pressure = "blood_pressure_systolic" with ``pair`` set
    value: float
    unit: str | None = None  # "c", "f" or None
    pair: tuple[float, float] | None = None


@dataclass
class _Pending:
    kind: str  # confirm | value | indicator
    expires: datetime
    indicator: str | None = None
    value: float | None = None


class CrewData:
    def __init__(
        self,
        manual: Manual,
        crew: CrewRegistry,
        store: MeasurementStore,
        alerts: AlertBoard,
        keywords: dict,
        support=None,
        profiles=None,
        clock: Callable[[], datetime] = now_utc,
        pending_ttl_s: int = 120,
    ):
        self.manual = manual
        self.crew = crew
        self.store = store
        self.alerts = alerts
        self.support = support
        self.profiles = profiles
        self.clock = clock  # injectable: tests control the relative time
        self.pending_ttl = timedelta(seconds=pending_ttl_s)
        self._pending: dict[str, _Pending] = {}

        query, reading = keywords["crew_query"], keywords["reading"]
        self._cues = self._flat(query["cues"])
        self._self_cues = self._flat(query["self_cues"])
        self._of_cues = [fold(c) for c in query["of_cues"]]
        self._ignore = {n for n in query["ignore_names"]}
        self._kw = {ind: self._flat(langs) for ind, langs in reading["indicators"].items()}
        self._markers = set(self._flat(reading["report_markers"]))
        self._not_reading = [fold(p) for p in reading["not_reading"]]
        self._yes = set(fold(w) for w in reading["yes"])
        self._no = set(fold(w) for w in reading["no"])
        self._names = [(m, {fold(m.name), fold(m.crew_id)}) for m in crew.all()]

    @classmethod
    def from_file(cls, path: Path, *args, **kwargs) -> CrewData:
        import json

        with open(path, encoding="utf-8") as fh:
            return cls(*args, keywords=json.load(fh), **kwargs)

    @staticmethod
    def _flat(langs: dict) -> list[str]:
        return [fold(p) for phrases in langs.values() for p in phrases]

    # ------------------------------------------------------------------ entry point
    def handle(self, session_id: str, message: str, lang: str, crew: CrewMember | None) -> ChatResponse | None:
        """A reply, or None when the message is neither a reading nor a question about a crew member."""
        folded = fold(message)
        pending = self._take(session_id)
        if pending is not None:
            answer = self._answer_pending(session_id, pending, folded, lang, crew)
            if answer is not None:
                return answer
        question = self._query(folded, message, lang, crew)
        if question is not None:
            return question
        return self._reading(session_id, folded, message, lang, crew)

    # ------------------------------------------------------------------ pending (own state, a couple of minutes)
    def _take(self, session_id: str) -> _Pending | None:
        pending = self._pending.pop(session_id, None)
        return pending if pending and pending.expires > self.clock() else None

    def _ask(self, session_id: str, kind: str, indicator: str | None = None, value: float | None = None) -> None:
        self._pending[session_id] = _Pending(kind, self.clock() + self.pending_ttl, indicator, value)

    def _answer_pending(
        self, session_id: str, pending: _Pending, folded: str, lang: str, crew: CrewMember | None
    ) -> ChatResponse | None:
        words = re.findall(_WORD, folded)
        first = words[0] if words else ""
        if first in self._no and len(words) <= 3:
            return self._plain(_texts(lang)["cancelled"], lang)
        if pending.kind == "confirm" and first in self._yes and crew is not None:
            return self._record_all([Item(pending.indicator, pending.value, "c")], lang, crew)
        if pending.kind == "value" and crew is not None:
            m = _BARE_NUMBER.fullmatch(folded)
            if m:
                item = Item(pending.indicator, float(m.group(1)), _unit_kind(m.group(2)))
                return self._items_reply(session_id, [item], lang, crew)
        return None  # something else: handle it normally

    # ------------------------------------------------------------------ asking about a crew member
    def _members_in(self, folded: str) -> list[CrewMember]:
        tokens = set(re.findall(_WORD, folded))
        return [m for m, keys in self._names if any(_name_matches(t, keys) for t in tokens)]

    def _unknown_name(self, original: str, folded: str) -> str | None:
        cap = r"([^\W\d_][\w]*)"  # any letter; "must be capitalized" is checked below
        patterns = [
            rf"(?i:c[oó]mo\s+(?:est[aá]|se\s+encuentra|se\s+siente|anda|va)|qu[eé]\s+le\s+pasa\s+a|qu[eé]\s+tiene|"
            rf"how\s+is|how['’]s|what['’]?s\s+wrong\s+with|how\s+are)\s+(?:a\s+|al\s+)?{cap}",
            rf"{cap}\s+(?i:tiene|has|got)\s+(?i:alguna|any)\s+alert",
            # supuesto: traducción por validar con traductor médico (ru, de)
            rf"(?i:как\s+дела\s+у|как\s+себя\s+чувствует|как\s+поживает|что\s+с|что\s+случилось\s+с|как\s+там|"
            rf"новости\s+о|новости\s+про|состояние|самочувствие|настроение|тревоги|оповещения)\s+{cap}",
            rf"(?i:wie\s+geht(?:\s+es|['’]?s)|wie\s+f[üu]hlt\s+sich|was\s+ist\s+mit|was\s+hat|geht\s+es|"
            rf"status\s+von|zustand\s+von|stimmung\s+von|gesundheit\s+von|neuigkeiten\s+von|nachrichten\s+von|"
            rf"warnungen\s+(?:von|für|fur))\s+{cap}",
        ]
        if any(_has(folded, c) for c in self._of_cues):
            patterns.append(rf"\b(?i:de|of|for)\s+{cap}")
        for pattern in patterns:
            for m in re.finditer(pattern, original):
                name = m.group(1)
                if name[0].isupper() and name not in self._ignore and not self._members_in(fold(name)):
                    return name
        return None

    def _query(self, folded: str, original: str, lang: str, crew: CrewMember | None) -> ChatResponse | None:
        named = self._members_in(folded)
        cue = any(_has(folded, c) for c in self._cues)
        self_cue = any(_has(folded, c) for c in self._self_cues)
        if re.search(r"\d", folded):  # a number is a report, not a question
            return None
        if not (named and cue) and not self_cue:
            unknown = self._unknown_name(original, folded) if cue else None
            if unknown is None:
                return None
            text = _texts(lang)["unknown"].format(name=unknown)
            return self._plain(text, lang, self._crew_buttons(lang))
        if named and cue:
            target = named[0]
        elif crew is not None:
            target = crew
        else:
            return self._plain(_texts(lang)["who"], lang, self._crew_buttons(lang))
        focus = self._focus(folded)
        return self._plain(self._alerts_text(target, crew, focus, lang), lang)

    def _focus(self, folded: str) -> str | None:
        for indicator, phrases in self._kw.items():
            if indicator != "blood_pressure" and any(_has(folded, p) for p in phrases):
                return indicator
        return None

    def _crew_buttons(self, lang: str) -> list[str]:
        return [_texts(lang)["ask_crew"].format(name=m.name) for m in self.crew.all()]

    def _alerts_text(self, target: CrewMember, asker: CrewMember | None, focus: str | None, lang: str) -> str:
        texts = _texts(lang)
        is_self = asker is not None and asker.crew_id == target.crew_id
        open_alerts = [
            a
            for a in self.alerts.list(include_acknowledged=True, include_resolved=False)
            if a.crew_id == target.crew_id and (focus is None or a.indicator == focus)
        ]
        panel = texts["own_panel"] if is_self else ""
        if not open_alerts:
            if is_self:
                return texts["none_self"] + panel
            if focus:
                return texts["none_focus"].format(who=target.name, topic=texts["topics"][focus])
            return texts["none"].format(who=target.name)
        shown = open_alerts[:MAX_ALERTS]  # AlertBoard.list is newest first
        lines = [self._alert_line(a, target, is_self, lang) for a in shown]
        if len(open_alerts) == 1:
            return lines[0] + panel
        head = texts["several_self"].format(n=len(open_alerts)) if is_self else texts["several"].format(
            who=target.name, n=len(open_alerts)
        )
        extra = [texts["more"].format(n=len(open_alerts) - MAX_ALERTS)] if len(open_alerts) > MAX_ALERTS else []
        return "\n".join([head, *[f"- {line}" for line in lines], *extra]) + panel

    def _alert_line(self, alert: Alert, target: CrewMember, is_self: bool, lang: str) -> str:
        texts = _texts(lang)
        what = self._alert_what(alert, lang)
        when = ago(self.clock() - alert.last_at, lang)
        key = "notified_self" if is_self else "notified"
        return texts[key].format(ago=when, who=target.name, what=what)

    def _alert_what(self, alert: Alert, lang: str) -> str:
        """Indicator and qualitative level only: never the number."""
        texts = _texts(lang)
        if alert.kind == "support":
            return texts["support"]
        if alert.kind == "report":
            return texts["emergency"]
        if alert.kind == "maneuver":
            names = MANEUVER_NAMES.get(alert.protocol or "", {})
            return texts["maneuver"].format(name=names.get(lang) or names.get("en") or "first aid")
        phrases = _LEVEL.get(lang, _LEVEL["en"]).get(alert.indicator or "")
        if phrases is None or alert.value is None:
            return texts["out_of_range"]
        return phrases[0] if self._is_low(alert.indicator, alert.value) else phrases[1]

    def _is_low(self, indicator: str, value: float) -> bool:
        lows, highs = [], []
        for band in self.manual.spec(indicator).bands.normal:
            for bound in (band.min, band.gte, band.gt):
                if bound is not None:
                    lows.append(bound)
            for bound in (band.max, band.lte, band.lt):
                if bound is not None:
                    highs.append(bound)
        if lows and value < min(lows):
            return True
        if highs and value > max(highs):
            return False
        return bool(lows and highs and value < (min(lows) + max(highs)) / 2)

    # ------------------------------------------------------------------ reporting a reading
    def _reading(self, session_id: str, folded: str, original: str, lang: str, crew: CrewMember | None) -> ChatResponse | None:
        if "?" in original or "¿" in original or any(_has(folded, p) for p in self._not_reading):
            return None
        words = re.findall(_WORD, folded)
        marked = bool(self._markers & set(words)) or len(words) <= 5
        if not marked:
            return None
        items: list[Item] = []
        orphans: list[float] = []
        for clause in _SPLIT.split(folded):
            parsed = self._parse_clause(clause)
            if parsed is None:
                continue
            indicator, numbers, pair = parsed
            if indicator is None:
                orphans.extend(v for v, _ in numbers)
            elif pair:
                items.append(Item("blood_pressure_systolic", pair[0], pair=pair))
            else:
                items.append(Item(indicator, numbers[0][0], numbers[0][1]))
        if not items:
            if len(orphans) == 1 and len(words) <= 7 and self._markers & set(words):
                return self._ask_indicator(session_id, orphans[0], lang, crew)
            return None
        if crew is None:
            return self._plain(_texts(lang)["general"], lang)
        return self._items_reply(session_id, items, lang, crew)

    def _parse_clause(self, clause: str):
        """(indicator or None, [(number, unit kind)], pressure pair) or None without a number."""
        matches = list(_NUMBER.finditer(clause))
        if not matches:
            return None
        best: tuple[int, str] | None = None
        for indicator, phrases in self._kw.items():
            for phrase in phrases:
                pos = _find(clause, phrase)
                if pos >= 0 and (best is None or pos < best[0]):
                    best = (pos, indicator)
        indicator = best[1] if best else None
        numbers = [(float(m.group(1)), _unit_kind(m.group(2)), m.start(), m.group(2)) for m in matches]
        if indicator is None:
            for _, _, _, raw in numbers:
                if raw and " ".join(raw.split()) in _UNIT_INDICATOR:
                    indicator = _UNIT_INDICATOR[" ".join(raw.split())]
                    break
                if raw and _unit_kind(raw) in ("c", "f") and raw.strip() not in ("c", "f", "h"):
                    indicator = "body_temperature"
                    break
        if indicator is None:
            return None, [(n[0], n[1]) for n in numbers], None
        if indicator == "blood_pressure":
            m = _PRESSURE.search(clause)
            return (indicator, [(float(m.group(1)), None)], (float(m.group(1)), float(m.group(2)))) if m else None
        anchor = best[0] if best else numbers[0][2]
        # Prefer a number with this indicator's own unit, then the one closest to the keyword.
        own = {"body_temperature": ("c", "f"), "heart_rate": ("bpm",), "spo2": ("%", "por ciento", "percent")}
        numbers.sort(key=lambda n: (_unit_kind(n[3]) not in own.get(indicator, ()), abs(n[2] - anchor)))
        value, unit, _, _ = numbers[0]
        return indicator, [(value, unit)], None

    def _resolve(self, item: Item):
        """('ok', Item) or (issue kind, details) for a value that must not be stored without asking."""
        if item.pair is not None:
            systolic = self.manual.spec("blood_pressure_systolic")
            diastolic = self.manual.spec("blood_pressure_diastolic")
            for spec, v in ((systolic, item.pair[0]), (diastolic, item.pair[1])):
                if not spec.valid_min <= v <= spec.valid_max:
                    return "range", spec
            return "ok", item
        value, unit = item.value, item.unit
        if item.indicator == "body_temperature":
            if unit == "f":
                return self._resolve(Item(item.indicator, round((value - 32) * 5 / 9, 1), "converted:" + _fmt(value)))
            if unit is None and FAHRENHEIT_RANGE[0] <= value <= FAHRENHEIT_RANGE[1]:
                return "fahrenheit", round((value - 32) * 5 / 9, 1)
        spec = self.manual.spec(item.indicator)
        if not spec.valid_min <= value <= spec.valid_max:
            return "range", spec
        if spec.integer_only and not float(value).is_integer():
            return "integer", spec
        return "ok", item

    def _items_reply(self, session_id: str, items: list[Item], lang: str, crew: CrewMember) -> ChatResponse:
        texts = _texts(lang)
        resolved: list[Item] = []
        for item in items:
            kind, detail = self._resolve(item)
            if kind == "ok":
                resolved.append(detail)
                continue
            name = self.manual.indicator_name(item.indicator, lang).lower()
            value = format_value(item.value, "°F" if item.unit == "f" else self.manual.spec(item.indicator).unit)
            if kind == "fahrenheit":
                value = _fmt(item.value)
                self._ask(session_id, "confirm", item.indicator, detail)
                c = _fmt(detail)
                return self._plain(
                    texts["ask_fahrenheit"].format(value=f"{value}", c=c),
                    lang,
                    [texts["yes_fahrenheit"].format(c=c), texts["no"]],
                )
            self._ask(session_id, "value", item.indicator)
            if kind == "integer":
                return self._plain(texts["ask_integer"].format(name=name.capitalize()), lang, [texts["cancel"]])
            return self._plain(
                texts["ask_value"].format(
                    value=value, name=name, lo=format_number(detail.valid_min), hi=format_number(detail.valid_max),
                    unit=detail.unit,
                ),
                lang,
                [texts["cancel"]],
            )
        return self._record_all(resolved, lang, crew)

    def _ask_indicator(self, session_id: str, value: float, lang: str, crew: CrewMember | None) -> ChatResponse:
        texts = _texts(lang)
        self._ask(session_id, "indicator")
        shown = _fmt(value)
        buttons = []
        for indicator, label in texts["names"].items():
            spec = self.manual.spec(indicator)
            if spec.valid_min <= value <= spec.valid_max and not (spec.integer_only and not float(value).is_integer()):
                buttons.append(f"{label} {shown}")
        return self._plain(texts["ask_indicator"].format(value=shown), lang, [*buttons, texts["cancel"]])

    def _record_all(self, items: list[Item], lang: str, crew: CrewMember) -> ChatResponse:
        texts = _texts(lang)
        blocks: list[str] = []
        protocol = None
        first_indicator: str | None = None
        urgent_protocol: str | None = None
        for item in items:
            pairs = [("blood_pressure_systolic", item.pair[0]), ("blood_pressure_diastolic", item.pair[1])] if item.pair else [
                (item.indicator, item.value)
            ]
            note = ""
            if item.unit and item.unit.startswith("converted:"):
                note = " " + texts["converted"].format(orig=item.unit.split(":", 1)[1], c=_fmt(item.value))
            for indicator, value in pairs:
                spec = self.manual.spec(indicator)
                try:
                    done = record_reading(
                        self.manual, self.store, self.alerts, crew, indicator, value, spec.unit,
                    )
                except MeasurementValueError:
                    return self._plain(texts["cancelled"], lang)
                status = done.evaluation.status
                lines = [texts["recorded"] + note, describe(self.manual, done.evaluation, lang, False)]
                if status == "attention":
                    lines.append(texts["alerted"])
                steps = guidance_steps(self.manual, self.support, self.profiles, indicator, status, lang, crew)
                if steps:
                    lines.append(texts["what_to_do"] + " " + " ".join(f"{i}. {s}" for i, s in enumerate(steps, 1)))
                if status == URGENT and urgent_protocol is None:
                    urgent_protocol = self.manual.indicator_view(indicator, lang).urgent_protocol
                    if urgent_protocol and self.manual.has_protocol(urgent_protocol):
                        protocol = self.manual.protocol_view(urgent_protocol, lang)
                        lines.append(texts["protocol"].format(title=protocol.title))
                blocks.append(" ".join(lines))
                first_indicator = first_indicator or indicator
                note = ""
        return ChatResponse(
            category="health",
            reply="\n".join(blocks),
            language=lang,
            ai_used=False,
            indicator=first_indicator,
            protocol=protocol,
            source=self.manual.indicator_source(first_indicator) if first_indicator else None,
            measurement_recorded=True,
        )

    @staticmethod
    def _plain(text: str, lang: str, suggestions: list[str] | None = None) -> ChatResponse:
        return ChatResponse(category="health", reply=text, language=lang, ai_used=False, suggestions=suggestions or [])
