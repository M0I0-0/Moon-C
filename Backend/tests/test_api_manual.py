"""Manual and protocol endpoints."""

from __future__ import annotations


def test_manual_endpoint(client):
    en = client.get("/manual").json()
    es = client.get("/manual", params={"language": "es"}).json()
    assert en["language"] == "en" and es["language"] == "es"
    assert "does not diagnose" in en["mission"]
    assert [i["indicator"] for i in en["indicators"]] == [
        "heart_rate",
        "body_temperature",
        "spo2",
        "sleep_hours",
        "mood",
        "blood_pressure_systolic",
        "blood_pressure_diastolic",
        "respiratory_rate",
        "radiation",
    ]
    assert {i["indicator"]: i["urgent_protocol"] for i in en["indicators"]}["spo2"] == "breathing_difficulty"
    assert {p["name"] for p in en["protocols"]} >= {"chest_pain", "breathing_difficulty", "fainting_unresponsive", "bleeding"}
    assert en["ranges_warning"] == "REFERENCE VALUES from published guidelines and NASA standards – must be validated by medical experts"


def test_indicator_endpoint(client):
    res = client.get("/manual/body_temperature", params={"language": "es"})
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Temperatura corporal"
    assert data["ranges"]["urgent"] == "≤ 35 o ≥ 39.1 °C"
    assert "shared/REFERENCES.md" in data["source"]
    assert data["what_to_do"]["urgent"]
    assert client.get("/manual/blood_sugar").status_code == 404
    assert client.get("/manual/spo2", params={"language": "fr"}).status_code == 422


def test_protocol_endpoint(client):
    data = client.get("/protocols/chest_pain").json()
    assert data["type"] == "emergency"
    assert any("medical officer" in step for step in data["steps"])
    assert client.get("/protocols/bleeding", params={"language": "es"}).json()["title"] == "Sangrado: cómo ayudar"
    assert client.get("/protocols/unknown").status_code == 404
