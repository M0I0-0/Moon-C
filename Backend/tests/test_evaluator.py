"""Evaluator: boundary values for every indicator (EXAMPLE VALUES)."""

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
    # heart_rate: normal 60–100; attention 50–59 or 101–120; urgent <50 or >120
    ("heart_rate", 49, "urgent"),
    ("heart_rate", 49.9, "urgent"),
    ("heart_rate", 50, "attention"),
    ("heart_rate", 59, "attention"),
    ("heart_rate", 59.5, "attention"),
    ("heart_rate", 60, "normal"),
    ("heart_rate", 100, "normal"),
    ("heart_rate", 100.5, "attention"),
    ("heart_rate", 101, "attention"),
    ("heart_rate", 120, "attention"),
    ("heart_rate", 120.1, "urgent"),
    ("heart_rate", 121, "urgent"),
    # body_temperature: normal 36.1–37.2; attention 37.3–37.9; urgent >=38.0 or <35.5
    ("body_temperature", 35.4, "urgent"),
    ("body_temperature", 35.5, "attention"),
    ("body_temperature", 36.0, "attention"),
    ("body_temperature", 36.1, "normal"),
    ("body_temperature", 37.2, "normal"),
    ("body_temperature", 37.25, "attention"),
    ("body_temperature", 37.3, "attention"),
    ("body_temperature", 37.9, "attention"),
    ("body_temperature", 37.95, "attention"),
    ("body_temperature", 38.0, "urgent"),
    ("body_temperature", 38.2, "urgent"),
    # spo2: normal 95–100; attention 91–94; urgent <=90
    ("spo2", 85, "urgent"),
    ("spo2", 90, "urgent"),
    ("spo2", 90.5, "attention"),
    ("spo2", 91, "attention"),
    ("spo2", 94, "attention"),
    ("spo2", 94.5, "attention"),
    ("spo2", 95, "normal"),
    ("spo2", 100, "normal"),
    # sleep_hours: normal 7–9; attention 5–6.9 or 9.1–10; urgent <4 (gaps -> attention)
    ("sleep_hours", 0, "urgent"),
    ("sleep_hours", 3.9, "urgent"),
    ("sleep_hours", 4, "attention"),
    ("sleep_hours", 4.5, "attention"),
    ("sleep_hours", 5, "attention"),
    ("sleep_hours", 6.9, "attention"),
    ("sleep_hours", 7, "normal"),
    ("sleep_hours", 9, "normal"),
    ("sleep_hours", 9.05, "attention"),
    ("sleep_hours", 9.1, "attention"),
    ("sleep_hours", 10, "attention"),
    ("sleep_hours", 11, "attention"),
    # mood: normal 3–5; attention 2; urgent 1
    ("mood", 1, "urgent"),
    ("mood", 2, "attention"),
    ("mood", 3, "normal"),
    ("mood", 5, "normal"),
    # blood_pressure_systolic: normal 90–129; attention 80–89 or 130–179; urgent >=180 or <80
    ("blood_pressure_systolic", 79, "urgent"),
    ("blood_pressure_systolic", 80, "attention"),
    ("blood_pressure_systolic", 89, "attention"),
    ("blood_pressure_systolic", 90, "normal"),
    ("blood_pressure_systolic", 129, "normal"),
    ("blood_pressure_systolic", 130, "attention"),
    ("blood_pressure_systolic", 179, "attention"),
    ("blood_pressure_systolic", 180, "urgent"),
    # blood_pressure_diastolic: normal 60–84; attention 40–59 or 85–119; urgent >=120 or <40
    ("blood_pressure_diastolic", 39, "urgent"),
    ("blood_pressure_diastolic", 40, "attention"),
    ("blood_pressure_diastolic", 59, "attention"),
    ("blood_pressure_diastolic", 60, "normal"),
    ("blood_pressure_diastolic", 84, "normal"),
    ("blood_pressure_diastolic", 85, "attention"),
    ("blood_pressure_diastolic", 119, "attention"),
    ("blood_pressure_diastolic", 120, "urgent"),
    # respiratory_rate: normal 12–20; attention 8–11 or 21–30; urgent <8 or >30
    ("respiratory_rate", 7, "urgent"),
    ("respiratory_rate", 8, "attention"),
    ("respiratory_rate", 11, "attention"),
    ("respiratory_rate", 12, "normal"),
    ("respiratory_rate", 20, "normal"),
    ("respiratory_rate", 21, "attention"),
    ("respiratory_rate", 30, "attention"),
    ("respiratory_rate", 31, "urgent"),
    # radiation: normal 0–50; attention >50; urgent >100 (µSv/h)
    ("radiation", 0, "normal"),
    ("radiation", 50, "normal"),
    ("radiation", 50.5, "attention"),
    ("radiation", 100, "attention"),
    ("radiation", 100.5, "urgent"),
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
