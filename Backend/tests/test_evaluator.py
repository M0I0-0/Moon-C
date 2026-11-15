"""Evaluator: boundary values for every indicator (reference ranges, sources in shared/REFERENCES.md)."""

from __future__ import annotations

import math

import pytest

from app.evaluator import MeasurementValueError, evaluate
from app.schemas import INDICATORS

UNITS = {
    "heart_rate": "bpm",
    "body_temperature": "°C",
    "spo2": "%",
    "sleep_hours": "h",
    "mood": "/5",
    "blood_pressure_systolic": "mmHg",
    "blood_pressure_diastolic": "mmHg",
    "respiratory_rate": "breaths/min",
    "radiation": "µSv/h",
}

BOUNDARIES = [
    # heart_rate: normal 50–100 (ACC/AHA/HRS); urgent <=40 or >=131 (NEWS2 red); attention in between
    ("heart_rate", 30, "urgent"),
    ("heart_rate", 40, "urgent"),
    ("heart_rate", 40.5, "attention"),
    ("heart_rate", 41, "attention"),
    ("heart_rate", 49, "attention"),
    ("heart_rate", 49.5, "attention"),
    ("heart_rate", 50, "normal"),
    ("heart_rate", 100, "normal"),
    ("heart_rate", 100.5, "attention"),
    ("heart_rate", 101, "attention"),
    ("heart_rate", 130, "attention"),
    ("heart_rate", 130.5, "attention"),
    ("heart_rate", 131, "urgent"),
    # body_temperature: normal 36.1–38.0 (NEWS2 0 points, allows the ~1 °C in-flight rise);
    # attention 35.1–36.0 or 38.1–39.0; urgent <=35.0 or >=39.1
    ("body_temperature", 34.0, "urgent"),
    ("body_temperature", 35.0, "urgent"),
    ("body_temperature", 35.05, "attention"),
    ("body_temperature", 35.1, "attention"),
    ("body_temperature", 36.0, "attention"),
    ("body_temperature", 36.1, "normal"),
    ("body_temperature", 37.5, "normal"),
    ("body_temperature", 38.0, "normal"),
    ("body_temperature", 38.05, "attention"),
    ("body_temperature", 38.1, "attention"),
    ("body_temperature", 39.0, "attention"),
    ("body_temperature", 39.05, "attention"),
    ("body_temperature", 39.1, "urgent"),
    ("body_temperature", 40.2, "urgent"),
    # spo2: normal 95–100; attention 92–94; urgent <=91 (NEWS2 scale 1)
    ("spo2", 85, "urgent"),
    ("spo2", 91, "urgent"),
    ("spo2", 91.5, "attention"),
    ("spo2", 92, "attention"),
    ("spo2", 94, "attention"),
    ("spo2", 94.5, "attention"),
    ("spo2", 95, "normal"),
    ("spo2", 100, "normal"),
    # sleep_hours: normal 7–9 (AASM/SRS); attention 5–6.9 or >9; urgent <5 (prior sleep-wake rule)
    ("sleep_hours", 0, "urgent"),
    ("sleep_hours", 4.9, "urgent"),
    ("sleep_hours", 5, "attention"),
    ("sleep_hours", 6, "attention"),
    ("sleep_hours", 6.9, "attention"),
    ("sleep_hours", 6.95, "attention"),
    ("sleep_hours", 7, "normal"),
    ("sleep_hours", 9, "normal"),
    ("sleep_hours", 9.05, "attention"),
    ("sleep_hours", 11, "attention"),
    # mood: normal 3–5; attention 2; urgent 1
    ("mood", 1, "urgent"),
    ("mood", 2, "attention"),
    ("mood", 3, "normal"),
    ("mood", 5, "normal"),
    # blood_pressure_systolic: normal 101–129; attention 91–100 or 130–180; urgent <=90 (NEWS2) or >180 (AHA/ACC)
    ("blood_pressure_systolic", 80, "urgent"),
    ("blood_pressure_systolic", 90, "urgent"),
    ("blood_pressure_systolic", 90.5, "attention"),
    ("blood_pressure_systolic", 91, "attention"),
    ("blood_pressure_systolic", 100, "attention"),
    ("blood_pressure_systolic", 100.5, "attention"),
    ("blood_pressure_systolic", 101, "normal"),
    ("blood_pressure_systolic", 129, "normal"),
    ("blood_pressure_systolic", 129.5, "attention"),
    ("blood_pressure_systolic", 130, "attention"),
    ("blood_pressure_systolic", 180, "attention"),
    ("blood_pressure_systolic", 181, "urgent"),
    # blood_pressure_diastolic: normal 60–79; attention <60 or 80–120; urgent >120 (AHA/ACC)
    ("blood_pressure_diastolic", 40, "attention"),
    ("blood_pressure_diastolic", 59, "attention"),
    ("blood_pressure_diastolic", 59.5, "attention"),
    ("blood_pressure_diastolic", 60, "normal"),
    ("blood_pressure_diastolic", 79, "normal"),
    ("blood_pressure_diastolic", 79.5, "attention"),
    ("blood_pressure_diastolic", 80, "attention"),
    ("blood_pressure_diastolic", 120, "attention"),
    ("blood_pressure_diastolic", 121, "urgent"),
    # respiratory_rate: normal 12–20; attention 9–11 or 21–24; urgent <=8 or >=25 (NEWS2)
    ("respiratory_rate", 6, "urgent"),
    ("respiratory_rate", 8, "urgent"),
    ("respiratory_rate", 8.5, "attention"),
    ("respiratory_rate", 9, "attention"),
    ("respiratory_rate", 11, "attention"),
    ("respiratory_rate", 12, "normal"),
    ("respiratory_rate", 20, "normal"),
    ("respiratory_rate", 21, "attention"),
    ("respiratory_rate", 24, "attention"),
    ("respiratory_rate", 24.5, "attention"),
    ("respiratory_rate", 25, "urgent"),
    # radiation (µSv/h): normal 0–100 (every space habitat's background); attention 101–999; urgent >=1000
    ("radiation", 0, "normal"),
    ("radiation", 57, "normal"),  # lunar surface background (Chang'e-4)
    ("radiation", 100, "normal"),
    ("radiation", 100.5, "attention"),
    ("radiation", 101, "attention"),
    ("radiation", 999, "attention"),
    ("radiation", 999.5, "attention"),
    ("radiation", 1000, "urgent"),
]


@pytest.mark.parametrize(("indicator", "value", "expected"), BOUNDARIES)
def test_boundaries(manual, indicator, value, expected):
    assert evaluate(manual, indicator, value, UNITS[indicator]).status == expected


def test_every_indicator_has_boundary_cases():
    covered = {indicator for indicator, _, _ in BOUNDARIES}
    assert covered == set(INDICATORS)
    for indicator in INDICATORS:
        statuses = {status for ind, _, status in BOUNDARIES if ind == indicator}
        assert statuses == {"normal", "attention", "urgent"}, indicator


@pytest.mark.parametrize("indicator", INDICATORS)
def test_manual_bands_agree_with_evaluator(manual, indicator):
    """Every endpoint of every band in protocols.json classifies as that band's status."""
    bands = manual.spec(indicator).bands
    for status in ("normal", "attention", "urgent"):
        for band in getattr(bands, status):
            points = [p for p in (band.min, band.max, band.lte, band.gte) if p is not None]
            points += [band.lt - 0.1] if band.lt is not None else []
            points += [band.gt + 0.1] if band.gt is not None else []
            for point in points:
                assert evaluate(manual, indicator, point, UNITS[indicator]).status == status, (indicator, point)


@pytest.mark.parametrize(
    ("indicator", "unit", "canonical"),
    [
        ("body_temperature", "C", "°C"),
        ("body_temperature", "ºC", "°C"),
        ("body_temperature", "celsius", "°C"),
        ("heart_rate", "BPM", "bpm"),
        ("spo2", "percent", "%"),
        ("sleep_hours", "hours", "h"),
        ("sleep_hours", "horas", "h"),
        ("mood", "1-5", "/5"),
        ("blood_pressure_systolic", "mm Hg", "mmHg"),
        ("respiratory_rate", "rpm", "breaths/min"),
        ("radiation", "uSv/h", "µSv/h"),
        ("radiation", "μSv/h", "µSv/h"),  # Greek mu is accepted too
    ],
)
def test_unit_aliases(manual, indicator, unit, canonical):
    value = {
        "body_temperature": 36.6,
        "heart_rate": 70,
        "spo2": 98,
        "sleep_hours": 8,
        "mood": 4,
        "blood_pressure_systolic": 118,
        "respiratory_rate": 15,
        "radiation": 25,
    }[indicator]
    assert evaluate(manual, indicator, value, unit).unit == canonical


@pytest.mark.parametrize(
    ("indicator", "value", "unit"),
    [
        ("body_temperature", 100.4, "°F"),  # wrong unit: no silent conversion
        ("heart_rate", 70, "%"),
        ("mood", 2.5, "/5"),  # mood is a whole number
        ("mood", 6, "/5"),
        ("spo2", 101, "%"),
        ("heart_rate", 0, "bpm"),
        ("body_temperature", 50, "°C"),
        ("sleep_hours", 25, "h"),
        ("heart_rate", math.nan, "bpm"),
        ("heart_rate", math.inf, "bpm"),
    ],
)
def test_invalid_readings_are_rejected(manual, indicator, value, unit):
    with pytest.raises(MeasurementValueError):
        evaluate(manual, indicator, value, unit)


@pytest.mark.parametrize("lang,start", [("ru", "Частота сердечных"), ("de", "Herzfrequenz"), ("fr", "Heart")])
def test_describe_in_ru_de_falls_back_to_english(manual, lang, start):
    from app.evaluator import describe

    ev = evaluate(manual, "heart_rate", 120, "bpm")
    text = describe(manual, ev, lang, True)
    assert text.startswith(start)
    assert ("needs attention" in text) == (lang == "fr")
