"""Health manual: structure, localization and wording rules."""

from __future__ import annotations

import copy
import json
import re

import pytest

from app.manual import Manual, ManualError
from app.schemas import INDICATORS

EMERGENCIES = ("chest_pain", "breathing_difficulty", "fainting_unresponsive", "bleeding")
WARNING = "EXAMPLE VALUES – must be validated by medical experts"

# Words that would turn guidance into a diagnosis. The manual must never use them.
DIAGNOSTIC_TERMS = [
    "diagnosis", "diagnosed", "you have a", "you have an", "you are suffering", "heart attack", "infarction",
    "stroke", "infection", "hypoxia", "hypothermia", "hyperthermia", "tachycardia", "bradycardia",
    "arrhythmia", "pneumonia", "depression", "disorder", "disease",
    "diagnóstico", "tienes un", "tienes una", "infarto", "infección", "hipoxia", "hipotermia",
    "taquicardia", "bradicardia", "arritmia", "neumonía", "depresión", "trastorno", "enfermedad",
]


def _all_texts(node, skip_keys=("mission", "disclaimer")):
    if isinstance(node, dict):
        for key, value in node.items():
            if key not in skip_keys:
                yield from _all_texts(value, skip_keys)
    elif isinstance(node, list):
        for item in node:
            yield from _all_texts(item, skip_keys)
    elif isinstance(node, str):
        yield node


def test_manual_has_all_indicators_and_protocols(manual):
    for key in INDICATORS:
        assert manual.has_indicator(key)
    for name in (*EMERGENCIES, "general_emergency", "feeling_unwell"):
        assert manual.has_protocol(name)


@pytest.mark.parametrize("indicator", INDICATORS)
def test_indicator_views_are_localized(manual, indicator):
    en = manual.indicator_view(indicator, "en")
    es = manual.indicator_view(indicator, "es")
    assert en.name != es.name
    assert en.explanation != es.explanation
    assert en.how_to_measure and es.how_to_measure
    assert en.what_to_do.attention and en.what_to_do.urgent
    assert en.ranges.warning == WARNING
    assert en.source and en.version and en.last_reviewed


def test_range_texts(manual):
    view = manual.indicator_view("heart_rate", "en")
    assert view.ranges.normal == "60–100 bpm"
    assert view.ranges.attention == "50–59 or 101–120 bpm"
    assert view.ranges.urgent == "< 50 or > 120 bpm"
    temp = manual.indicator_view("body_temperature", "es")
    assert temp.ranges.urgent == "≥ 38 o < 35.5 °C"
    assert manual.indicator_view("mood", "en").ranges.normal == "3–5"


def test_example_values_are_marked(shared_dir):
    raw = (shared_dir / "protocols.json").read_text(encoding="utf-8")
    data = json.loads(raw)
    assert data["_warning"] == WARNING
    for key in INDICATORS:
        assert data["indicators"][key]["ranges"]["_warning"] == WARNING


@pytest.mark.parametrize("name", EMERGENCIES)
@pytest.mark.parametrize("lang", ["en", "es"])
def test_emergency_protocols_cover_required_steps(manual, name, lang):
    view = manual.protocol_view(name, lang)
    text = " ".join(view.steps).lower()
    assert view.type == "emergency"
    if lang == "en":
        assert "safe" in text and "medical officer" in text
        assert "vehicle emergency procedure" in text and "every 5 minutes" in text
    else:
        assert "a salvo" in text and "oficial médico" in text
        assert "procedimiento de emergencia del vehículo" in text and "cada 5 minutos" in text


def test_no_diagnostic_language(shared_dir):
    data = json.loads((shared_dir / "protocols.json").read_text(encoding="utf-8"))
    for text in _all_texts(data):
        lowered = text.lower()
        for term in DIAGNOSTIC_TERMS:
            assert not re.search(rf"\b{re.escape(term)}\b", lowered), f"'{term}' found in: {text}"


def test_disclaimer_says_moon_c_does_not_diagnose(manual):
    assert "does not diagnose" in manual.manual_view("en").mission
    assert "no diagnostica" in manual.manual_view("es").disclaimer


def test_broken_manual_fails_fast(shared_dir):
    data = json.loads((shared_dir / "protocols.json").read_text(encoding="utf-8"))
    broken = copy.deepcopy(data)
    del broken["indicators"]["spo2"]
    with pytest.raises(ManualError, match="spo2"):
        Manual(broken)
    broken = copy.deepcopy(data)
    broken["protocols"]["bleeding"]["steps"]["es"] = []
    with pytest.raises(ManualError, match="bleeding"):
        Manual(broken)
