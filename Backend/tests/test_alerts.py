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
    chat(client, "Emergency!", crew_id="ruben")
    assert client.get("/alerts").json()[0]["message"] == "Alert: Rubén reported an emergency"


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
    chat(client, "bleeding", crew_id="ruben")
    closed = client.post("/alerts/resolve", json={}).json()
    assert len(closed) == 2
    assert client.get("/alerts").json() == []


# --------------------------------------------------------------------------- vital alerts: attention + urgent, one open per indicator
def reading(client, indicator, value, unit, crew_id="ruben"):
    res = client.post("/measurements", json={"crew_id": crew_id, "indicator": indicator, "value": value, "unit": unit})
    assert res.status_code == 201, res.text
    return res.json()


def test_attention_reading_through_the_api_alerts_too(client):
    data = reading(client, "heart_rate", 120, "bpm")
    assert data["status"] == "attention" and data["alert"]["status"] == "attention"
    assert [a["indicator"] for a in client.get("/alerts").json()] == ["heart_rate"]


def test_two_readings_of_the_same_indicator_keep_one_alert_and_raise_its_level(client):
    first = reading(client, "heart_rate", 120, "bpm")["alert"]
    second = reading(client, "heart_rate", 140, "bpm")["alert"]
    assert second["id"] == first["id"] and second["status"] == "urgent" and second["value"] == 140
    assert second["updated_at"] >= first["created_at"]
    reading(client, "heart_rate", 118, "bpm")  # a lower level never downgrades the open alert
    (only,) = client.get("/alerts").json()
    assert only["id"] == first["id"] and only["status"] == "urgent" and only["value"] == 140


def test_different_indicators_or_members_get_different_alerts(client):
    reading(client, "heart_rate", 120, "bpm")
    reading(client, "body_temperature", 39.5, "°C")
    reading(client, "heart_rate", 120, "bpm", crew_id="ana")
    assert len(client.get("/alerts").json()) == 3


def test_resolving_and_reporting_again_opens_a_new_alert(client):
    first = reading(client, "heart_rate", 120, "bpm")["alert"]
    client.post(f"/alerts/{first['id']}/resolve")
    again = reading(client, "heart_rate", 121, "bpm")["alert"]
    assert again["id"] != first["id"]
    assert len(client.get("/alerts").json()) == 1


def test_chat_and_api_share_the_same_open_alert(client):
    chat(client, "mi pulso está en 120", crew_id="ruben")
    api_alert = reading(client, "heart_rate", 125, "bpm")["alert"]
    assert len(client.get("/alerts").json()) == 1 and api_alert["value"] == 125


def test_unassigned_readings_never_merge(client):
    for _ in range(2):
        res = client.post("/measurements", json={"indicator": "heart_rate", "value": 120, "unit": "bpm"})
        assert res.status_code == 201
    assert len(client.get("/alerts").json()) == 2


def test_alert_line_in_ru_de_with_english_fallback(client):
    reading(client, "heart_rate", 140, "bpm")
    texts = {lang: client.get("/alerts", params={"language": lang}).json()[0]["message"] for lang in ("en", "ru", "de")}
    assert texts["ru"].startswith("Тревога:") and texts["de"].startswith("Alarm:") and texts["en"].startswith("Alert:")


def test_support_alert_has_its_own_kind_and_no_conversation_content(client):
    chat(client, "estoy en pánico", crew_id="ruben")
    chat(client, "avisa al oficial médico", crew_id="ruben")
    (alert,) = client.get("/alerts").json()
    assert alert["kind"] == "support" and alert["indicator"] is None and alert["value"] is None
    for lang, word in (("es", "apoyo"), ("en", "support"), ("ru", "поддерж"), ("de", "Unterstützung")):
        message = client.get("/alerts", params={"language": lang}).json()[0]["message"]
        assert word in message and "pánico" not in message
