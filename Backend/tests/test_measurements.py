"""Measurements, assignment, alerts and storage."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from app.schemas import Measurement
from app.storage import MeasurementStore

ALLOWED_KEYS = {"id", "crew_id", "indicator", "value", "unit", "status", "timestamp", "synced"}


def post(client, **body):
    return client.post("/measurements", json=body)


def test_missing_crew_id_is_stored_unassigned(client):
    res = post(client, indicator="heart_rate", value=72, unit="bpm")
    assert res.status_code == 201
    data = res.json()
    assert data["crew_id"] is None
    assert data["needs_confirmation"] is True
    assert data["status"] == "normal"
    assert data["synced"] is False
    assert "confirm" in data["message"].lower()
    listed = client.get("/measurements", params={"unassigned": "true"}).json()
    assert [m["id"] for m in listed] == [data["id"]]


def test_assign_works_only_once(client):
    mid = post(client, indicator="spo2", value=97, unit="%").json()["id"]
    first = client.post(f"/measurements/{mid}/assign", json={"crew_id": "ana"})
    assert first.status_code == 200
    assert first.json()["crew_id"] == "ana"
    second = client.post(f"/measurements/{mid}/assign", json={"crew_id": "moises"})
    assert second.status_code == 409
    assert client.get("/measurements", params={"crew_id": "ana"}).json()[0]["id"] == mid


def test_assign_errors(client):
    mid = post(client, indicator="spo2", value=97, unit="%").json()["id"]
    assert client.post("/measurements/nope/assign", json={"crew_id": "ana"}).status_code == 404
    assert client.post(f"/measurements/{mid}/assign", json={"crew_id": "zeus"}).status_code == 404
    assigned = post(client, crew_id="ana", indicator="spo2", value=97, unit="%").json()["id"]
    assert client.post(f"/measurements/{assigned}/assign", json={"crew_id": "ruben"}).status_code == 409


def test_urgent_reading_creates_alert(client):
    res = post(client, crew_id="moises", indicator="body_temperature", value=39.4, unit="°C")
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "urgent"
    assert data["needs_confirmation"] is False
    assert data["language"] == "es"  # Moisés prefers Spanish: the reading's message and guidance...
    assert data["guidance"] and "oficial médico" in " ".join(data["guidance"])
    # ...but alerts about a crew member are always in English, the crew's common language.
    assert data["alert"]["message"] == "Alert: Moisés, body temperature 39.4 °C"

    alerts = client.get("/alerts").json()
    assert [a["message"] for a in alerts] == ["Alert: Moisés, body temperature 39.4 °C"]
    assert alerts[0]["measurement_id"] == data["id"]


def test_non_urgent_readings_do_not_alert(client):
    post(client, crew_id="ana", indicator="body_temperature", value=37.5, unit="°C")
    post(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    assert client.get("/alerts").json() == []


def test_acknowledge_alert(client):
    alert_id = post(client, crew_id="ana", indicator="spo2", value=88, unit="%").json()["alert"]["id"]
    res = client.post(f"/alerts/{alert_id}/ack")
    assert res.status_code == 200 and res.json()["acknowledged"] is True
    first_ack = res.json()["acknowledged_at"]
    assert client.post(f"/alerts/{alert_id}/ack").json()["acknowledged_at"] == first_ack  # idempotent
    assert client.get("/alerts").json() == []
    assert len(client.get("/alerts", params={"include_acknowledged": "true"}).json()) == 1
    assert client.post("/alerts/nope/ack").status_code == 404


def test_unassigned_urgent_alert_gets_name_after_assign(client):
    data = post(client, indicator="mood", value=1, unit="/5").json()
    assert data["alert"]["message"] == "Alert: unidentified crew member, mood 1/5"
    client.post(f"/measurements/{data['id']}/assign", json={"crew_id": "ruben"})
    assert client.get("/alerts").json()[0]["message"] == "Alert: Rubén, mood 1/5"


def test_validation_errors(client):
    assert post(client, crew_id="zeus", indicator="spo2", value=97, unit="%").status_code == 404
    bad_unit = post(client, indicator="body_temperature", value=100.4, unit="°F")
    assert bad_unit.status_code == 422 and "°C" in bad_unit.json()["detail"]
    assert post(client, indicator="mood", value=2.5, unit="/5").status_code == 422
    assert post(client, indicator="glucose", value=5, unit="mmol/L").status_code == 422
    assert post(client, indicator="spo2", value=97).status_code == 422
    assert client.get("/measurements").json() == []


def test_language_resolution_for_measurements(client):
    assert post(client, crew_id="moises", indicator="heart_rate", value=70, unit="bpm").json()["language"] == "es"
    res = post(client, crew_id="moises", indicator="heart_rate", value=70, unit="bpm", language="en").json()
    assert res["language"] == "en" and "normal range" in res["message"]
    assert post(client, indicator="heart_rate", value=70, unit="bpm").json()["language"] == "en"


def test_filters(client):
    base = datetime(2026, 11, 1, tzinfo=timezone.utc)
    post(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm", timestamp=base.isoformat())
    post(client, crew_id="ana", indicator="sleep_hours", value=7.5, unit="h", timestamp=(base + timedelta(days=2)).isoformat())
    post(client, crew_id="ruben", indicator="heart_rate", value=65, unit="bpm", timestamp=(base + timedelta(days=3)).isoformat())

    assert len(client.get("/measurements").json()) == 3
    assert len(client.get("/measurements", params={"crew_id": "ana"}).json()) == 2
    assert len(client.get("/measurements", params={"indicator": "heart_rate"}).json()) == 2
    since = client.get("/measurements", params={"since": (base + timedelta(days=1)).isoformat()}).json()
    assert [m["indicator"] for m in since] == ["sleep_hours", "heart_rate"]  # chronological
    assert client.get("/measurements", params={"unassigned": "true"}).json() == []


def test_naive_timestamp_is_utc(client):
    data = post(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm", timestamp="2026-11-14T08:30:00").json()
    assert datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00")) == datetime(
        2026, 11, 14, 8, 30, tzinfo=timezone.utc
    )


def test_file_contains_only_measurement_fields(client, storage_path):
    post(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    post(client, indicator="mood", value=4, unit="score")
    data = json.loads(storage_path.read_text(encoding="utf-8"))
    assert data["schema_version"] == 1
    assert len(data["measurements"]) == 2
    for record in data["measurements"]:
        assert set(record) == ALLOWED_KEYS
    assert [p.name for p in storage_path.parent.iterdir()] == ["measurements.json"]  # no temp files left


def test_measurements_survive_restart(make_client):
    mid = make_client().post("/measurements", json={"crew_id": "ana", "indicator": "spo2", "value": 96, "unit": "%"}).json()["id"]
    restarted = make_client()
    assert [m["id"] for m in restarted.get("/measurements").json()] == [mid]


def test_corrupted_file_is_set_aside(storage_path, make_client):
    storage_path.parent.mkdir(parents=True)
    storage_path.write_text("{not json", encoding="utf-8")
    client = make_client()
    assert client.get("/measurements").json() == []
    assert any(p.name.startswith("measurements.json.corrupt-") for p in storage_path.parent.iterdir())


def test_retention_prunes_old_measurements(tmp_path):
    store = MeasurementStore(tmp_path / "m.json", retention_days=1)
    store.load()
    old = datetime.now(timezone.utc) - timedelta(days=3)
    for i, ts in enumerate([old, datetime.now(timezone.utc)]):
        store.add(
            Measurement(
                id=f"m{i}", crew_id="ana", indicator="heart_rate", value=70, unit="bpm",
                status="normal", timestamp=ts, synced=False,
            )
        )
    assert [m.id for m in store.list()] == ["m1"]


def test_retention_zero_keeps_everything(tmp_path):
    store = MeasurementStore(tmp_path / "m.json", retention_days=0)
    store.load()
    store.add(
        Measurement(
            id="old", crew_id="ana", indicator="heart_rate", value=70, unit="bpm", status="normal",
            timestamp=datetime(2020, 1, 1, tzinfo=timezone.utc), synced=False,
        )
    )
    assert [m.id for m in store.list()] == ["old"]
