"""Compares a measurement with the ranges in the health manual.

The ranges live in shared/protocols.json (reference values from published
guidelines and NASA standards, see shared/REFERENCES.md – must be validated by
medical experts); this module only applies them. The same rule is used for
every indicator:

1. ``urgent``    if the value falls in any urgent band;
2. ``normal``    if it falls in any normal band;
3. ``attention`` otherwise. This covers the explicit attention bands and any
   gap between bands (for example 38.05 °C or 100.5 bpm), so a value is never
   silently treated as normal.

Moon-C does not diagnose: a status only says how a value compares with the
manual and which manual steps apply.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .manual import Manual, format_number, format_value
from .schemas import Band, RangeBands, Status


class MeasurementValueError(ValueError):
    """The value or unit cannot be accepted for this indicator."""


@dataclass(frozen=True)
class Evaluation:
    indicator: str
    value: float
    unit: str
    status: Status


def band_matches(band: Band, value: float) -> bool:
    if band.min is not None and value < band.min:
        return False
    if band.max is not None and value > band.max:
        return False
    if band.lt is not None and not value < band.lt:
        return False
    if band.lte is not None and not value <= band.lte:
        return False
    if band.gt is not None and not value > band.gt:
        return False
    if band.gte is not None and not value >= band.gte:
        return False
    return True


def classify(bands: RangeBands, value: float) -> Status:
    if any(band_matches(b, value) for b in bands.urgent):
        return "urgent"
    if any(band_matches(b, value) for b in bands.normal):
        return "normal"
    return "attention"


def evaluate(manual: Manual, indicator: str, value: float, unit: str) -> Evaluation:
    """Validate a reading and return its status. Raises MeasurementValueError if invalid."""
    if not manual.has_indicator(indicator):
        raise MeasurementValueError(f"Unknown indicator '{indicator}'.")
    spec = manual.spec(indicator)

    canonical = spec.canonical_unit(unit)
    if canonical is None:
        raise MeasurementValueError(f"Unit '{unit}' is not valid for {indicator}. Use '{spec.unit}'.")

    value = float(value)
    if not math.isfinite(value):
        raise MeasurementValueError("Value must be a finite number.")
    if spec.integer_only and not value.is_integer():
        raise MeasurementValueError(f"{indicator} must be a whole number.")
    if not spec.valid_min <= value <= spec.valid_max:
        raise MeasurementValueError(
            f"{indicator} must be between {format_number(spec.valid_min)} and "
            f"{format_number(spec.valid_max)} {spec.unit}. Please check the reading."
        )
    return Evaluation(indicator=indicator, value=value, unit=canonical, status=classify(spec.bands, value))


_MESSAGES = {
    "en": {
        "normal": "{name} {value}: within the normal range (reference values).",
        "attention": "{name} {value}: needs attention. The normal reference range is {normal}.",
        "urgent": "{name} {value}: urgent range. An on-board alert was created for the medical officer.",
        "confirm": "Who is this reading for? Please confirm the crew member.",
    },
    "es": {
        "normal": "{name} {value}: dentro del rango normal (valores de referencia).",
        "attention": "{name} {value}: requiere atención. El rango normal de referencia es {normal}.",
        "urgent": "{name} {value}: rango urgente. Se creó una alerta a bordo para el oficial médico.",
        "confirm": "¿De quién es esta lectura? Confirma el tripulante.",
    },
}


def describe(manual: Manual, evaluation: Evaluation, lang: str, needs_confirmation: bool) -> str:
    """Short, non-diagnostic summary of a reading for the UI and text-to-speech."""
    texts = _MESSAGES.get(lang, _MESSAGES["en"])
    message = texts[evaluation.status].format(
        name=manual.indicator_name(evaluation.indicator, lang),
        value=format_value(evaluation.value, evaluation.unit),
        normal=manual.ranges_text(evaluation.indicator, "normal", lang),
    )
    return f"{message} {texts['confirm']}" if needs_confirmation else message
