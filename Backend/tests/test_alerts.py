"""Alert kinds and lifecycle: chat reports, acknowledge vs resolve, dedupe, no chat text."""

from __future__ import annotations


def chat(client, message, **extra):
    body = {"session_id": extra.pop("session_id", "s1"), "message": message, **extra}
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


def test_chat_emergency_raises_a_report_alert(client):
    assert chat(client, "My chest hurts a lot right now", crew_id="ana")["category"] == "emergency"
    alerts = client.get("/alerts").json()
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert["kind"] == "report" and alert["protocol"] == "chest_pain"
    assert alert["crew_id"] == "ana" and alert["indicator"] is None and alert["measurement_id"] is None
    assert alert["message"] == "Alert: Ana reported chest pain"
    assert "right now" not in str(alert)  # no chat text in the alert
    es = client.get("/alerts", params={"language": "es"}).json()[0]
    assert es["message"] == "Alerta: Ana reportó dolor de pecho"


def test_repeated_report_reuses_the_open_alert(client):
    chat(client, "chest pain", crew_id="moises")
    chat(client, "dolor de pecho", crew_id="moises")
    assert len(client.get("/alerts").json()) == 1
    chat(client, "No puedo respirar", crew_id="moises")
    assert len(client.get("/alerts").json()) == 2  # a different protocol is a new alert


def test_general_emergency_message(client):
    chat(client, "Emergency!", crew_id="kenji")
    assert client.get("/alerts").json()[0]["message"] == "Alert: Kenji reported an emergency"


def test_no_report_without_an_identified_crew_member(client):
    assert chat(client, "chest pain")["category"] == "emergency"
    assert client.get("/alerts").json() == []


def test_identified_session_counts_as_crew(client):
    client.post("/identify", json={"bracelet_id": "BR-004", "session_id": "tab"})
    chat(client, "Hay sangrado en su brazo", session_id="tab")
    assert client.get("/alerts", params={"language": "es"}).json()[0]["message"] == "Alerta: Valentina reportó sangrado"


def test_acknowledge_is_not_resolve(client):
    chat(client, "bleeding", crew_id="ana")
    alert_id = client.get("/alerts").json()[0]["id"]
    client.post(f"/alerts/{alert_id}/ack")
    acknowledged = client.get("/alerts", params={"include_acknowledged": "true"}).json()
    assert acknowledged[0]["acknowledged"] is True and acknowledged[0]["resolved"] is False

    resolved = client.post(f"/alerts/{alert_id}/resolve").json()
    assert resolved["resolved"] is True and resolved["resolved_at"]
    again = client.post(f"/alerts/{alert_id}/resolve").json()
    assert again["resolved_at"] == resolved["resolved_at"]  # idempotent
    assert client.get("/alerts", params={"include_acknowledged": "true"}).json() == []
    assert client.post("/alerts/nope/resolve").status_code == 404


def test_after_resolving_a_new_report_opens_a_new_alert(client):
    chat(client, "chest pain", crew_id="ana")
    client.post("/alerts/resolve", json={"crew_id": "ana"})
    chat(client, "chest pain", crew_id="ana")
    assert len(client.get("/alerts").json()) == 1
    assert len(client.get("/alerts", params={"include_resolved": "true"}).json()) == 2


def test_resolve_all(client):
    chat(client, "chest pain", crew_id="ana")
    chat(client, "bleeding", crew_id="kenji")
    closed = client.post("/alerts/resolve", json={}).json()
    assert len(closed) == 2
    assert client.get("/alerts").json() == []
