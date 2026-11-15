"""Maneuvers (alert + report for Earth), announcements and the access log."""

from __future__ import annotations

import json

SUMMARY = {
    "title": "RCP (paro cardiaco)",
    "environment": "Base lunar",
    "comm_delay": "unos 1.3 s",
    "evacuation": "unos 3 días",
    "started_at": "2026-11-15T02:00:00Z",
    "duration_s": 184,
    "compressions": 120,
    "cycles": 4,
    "events": [
        {"at": "2026-11-15T02:00:00Z", "elapsed_s": 0, "event": "Inicio · Base lunar"},
        {"at": "2026-11-15T02:00:20Z", "elapsed_s": 20, "event": "Paso: Comprime 30 veces"},
    ],
}


def test_starting_a_maneuver_alerts_once(client):
    first = client.post("/maneuvers/start", json={"crew_id": "moises", "maneuver": "rcp"}, params={"language": "es"})
    assert first.status_code == 200
    alert = first.json()
    assert alert["kind"] == "maneuver" and alert["protocol"] == "rcp"
    assert alert["message"] == "Alerta: guía de RCP iniciada (Moisés)"
    again = client.post("/maneuvers/start", json={"crew_id": "moises", "maneuver": "rcp"}).json()
    assert again["id"] == alert["id"]  # reopening the guide (e.g. another environment) reuses the alert
    other = client.post("/maneuvers/start", json={"crew_id": None, "maneuver": "torniquete"}).json()
    assert other["message"] == "Alert: tourniquet guide started (unidentified crew member)"
    assert len(client.get("/alerts").json()) == 2


def test_unknown_crew_never_blocks_a_maneuver(client):
    res = client.post("/maneuvers/start", json={"crew_id": "zeus", "maneuver": "atragantamiento"})
    assert res.status_code == 200 and res.json()["crew_id"] is None
    assert client.post("/maneuvers/start", json={"maneuver": "Bad Id!"}).status_code == 422


def test_report_is_stored_and_queued_for_earth(client, storage_path):
    res = client.post("/maneuvers/reports", json={"crew_id": "ana", "maneuver": "rcp", "summary": SUMMARY})
    assert res.status_code == 201
    report = res.json()
    assert report["synced"] is False and report["summary"]["compressions"] == 120
    assert [r["id"] for r in client.get("/maneuvers/reports", params={"crew_id": "ana"}).json()] == [report["id"]]
    assert client.get("/maneuvers/reports", params={"crew_id": "ruben"}).json() == []

    stored = json.loads((storage_path.parent / "maneuver_reports.json").read_text(encoding="utf-8"))
    assert stored["reports"][0]["summary"]["events"][1]["event"] == "Paso: Comprime 30 veces"

    assert client.get("/sync/status").json()["pending_reports"] == 1
    result = client.post("/sync/simulate").json()
    assert result["synced_reports"] == 1 and result["pending_reports"] == 0
    assert client.get("/maneuvers/reports").json()[0]["synced"] is True


def test_report_validation(client):
    too_many = {**SUMMARY, "events": [SUMMARY["events"][0]] * 501}
    assert client.post("/maneuvers/reports", json={"maneuver": "rcp", "summary": too_many}).status_code == 422
    long_event = {**SUMMARY, "events": [{"at": "2026-11-15T02:00:00Z", "elapsed_s": 0, "event": "x" * 201}]}
    assert client.post("/maneuvers/reports", json={"maneuver": "rcp", "summary": long_event}).status_code == 422


def test_announcements_persist_newest_first(make_client):
    client = make_client()
    assert client.get("/announcements").json() == []
    client.post("/announcements", json={"text": "Ventana con la Tierra a las 16:40", "priority": "important", "author": "Rubén"})
    client.post("/announcements", json={"text": "Toma de signos a las 18:00"})
    restarted = make_client()
    items = restarted.get("/announcements").json()
    assert [a["text"] for a in items] == ["Toma de signos a las 18:00", "Ventana con la Tierra a las 16:40"]
    assert items[0]["author"] == "General" and items[1]["priority"] == "important"
    assert client.post("/announcements", json={"text": ""}).status_code == 422
    assert client.post("/announcements", json={"text": "x", "priority": "urgent"}).status_code == 422


def test_access_log(client):
    entry = client.post("/access-log", json={"crew_id": "moises", "reason": "alert-1"})
    assert entry.status_code == 201 and entry.json()["viewer"] == "general" and entry.json()["at"]
    client.post("/access-log", json={"crew_id": "ana"})
    assert len(client.get("/access-log").json()) == 2
    assert [e["crew_id"] for e in client.get("/access-log", params={"crew_id": "moises"}).json()] == ["moises"]
    assert client.post("/access-log", json={"crew_id": "zeus"}).status_code == 404


def test_privacy_wipe_removes_reports_and_access_log_but_keeps_announcements(client):
    client.post("/maneuvers/reports", json={"crew_id": "ana", "maneuver": "rcp", "summary": SUMMARY})
    client.post("/access-log", json={"crew_id": "ana"})
    client.post("/announcements", json={"text": "Hola tripulación"})
    res = client.delete("/data", params={"confirm": "true"}).json()
    assert res["reports_deleted"] == 1 and res["access_log_deleted"] == 1
    assert client.get("/maneuvers/reports").json() == []
    assert client.get("/access-log").json() == []
    assert len(client.get("/announcements").json()) == 1
