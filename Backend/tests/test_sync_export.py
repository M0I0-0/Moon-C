"""Simulated Earth sync, exports and the privacy wipe."""

from __future__ import annotations

import csv
import io
import json
import time

CSV_FIELDS = ["id", "crew_id", "indicator", "value", "unit", "status", "timestamp", "synced"]


def add(client, **body):
    res = client.post("/measurements", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def test_sync_status_and_simulate(client):
    add(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    add(client, crew_id="kenji", indicator="spo2", value=97, unit="%")
    unassigned = add(client, indicator="mood", value=4, unit="/5")

    assert client.get("/sync/status").json() == {
        "earth_link": "offline",
        "pending": 2,
        "awaiting_assignment": 1,
        "pending_reports": 0,
        "last_sync": None,
    }
    result = client.post("/sync/simulate").json()
    assert result["synced_count"] == 2
    assert result["pending"] == 0 and result["awaiting_assignment"] == 1
    assert result["last_sync"]

    synced = {m["id"]: m["synced"] for m in client.get("/measurements").json()}
    assert synced[unassigned["id"]] is False and sum(synced.values()) == 2

    # Once confirmed, the reading joins the queue.
    client.post(f"/measurements/{unassigned['id']}/assign", json={"crew_id": "ana"})
    assert client.get("/sync/status").json()["pending"] == 1
    assert client.post("/sync/simulate").json()["synced_count"] == 1


def test_synced_flag_is_persisted(client, storage_path):
    add(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    client.post("/sync/simulate")
    records = json.loads(storage_path.read_text(encoding="utf-8"))["measurements"]
    assert [r["synced"] for r in records] == [True]


def test_background_sync_when_link_is_online(make_client):
    client = make_client(earth_link="online", sync_interval_s=0.1)
    assert client.get("/status").json()["earth_link"] == "online"
    add(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    deadline = time.monotonic() + 3
    while client.get("/sync/status").json()["pending"] and time.monotonic() < deadline:
        time.sleep(0.05)
    status = client.get("/sync/status").json()
    assert status["pending"] == 0 and status["last_sync"]


def test_no_background_sync_while_offline(make_client):
    client = make_client(sync_interval_s=0.1)
    add(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    time.sleep(0.4)
    assert client.get("/sync/status").json()["pending"] == 1


def test_export_json(client):
    add(client, crew_id="ana", indicator="heart_rate", value=70, unit="bpm")
    add(client, crew_id="kenji", indicator="sleep_hours", value=6, unit="h")
    res = client.get("/export.json")
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"]
    data = res.json()
    assert data["count"] == 2
    assert data["ranges_warning"] == "EXAMPLE VALUES – must be validated by medical experts"
    assert set(data["measurements"][0]) == set(CSV_FIELDS)
    assert client.get("/export.json", params={"crew_id": "kenji"}).json()["count"] == 1


def test_export_csv(client):
    add(client, crew_id="moises", indicator="body_temperature", value=38.2, unit="°C")
    add(client, indicator="mood", value=3, unit="/5")
    res = client.get("/export.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))
    assert list(rows[0]) == CSV_FIELDS
    assert rows[0]["crew_id"] == "moises" and rows[0]["unit"] == "°C"
    assert rows[0]["status"] == "urgent" and rows[0]["synced"] == "false"
    assert rows[1]["crew_id"] == ""


def test_delete_data_requires_confirmation(client, storage_path):
    add(client, crew_id="ana", indicator="spo2", value=88, unit="%")  # urgent -> alert
    client.post("/chat", json={"session_id": "s", "message": "hello"})
    assert client.delete("/data").status_code == 400
    assert client.delete("/data", params={"confirm": "false"}).status_code == 400
    assert len(client.get("/measurements").json()) == 1

    res = client.delete("/data", params={"confirm": "true"})
    assert res.json() == {
        "measurements_deleted": 1,
        "alerts_cleared": 1,
        "sessions_cleared": 1,
        "reports_deleted": 0,
        "access_log_deleted": 0,
    }
    assert client.get("/measurements").json() == []
    assert client.get("/alerts").json() == []
    assert json.loads(storage_path.read_text(encoding="utf-8"))["measurements"] == []
