"""Chat: report a reading, ask about a crew member (answers only from alerts, never numbers or chat)."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest

from app.alerts import Alert
from app.crewdata import ago

T0 = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


def chat(client, message, crew_id=None, session_id="s1", **extra):
    body = {"session_id": session_id, "message": message, **extra}
    if crew_id:
        body["crew_id"] = crew_id
    res = client.post("/chat", json=body)
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture
def services(client):
    svc = client.app.state.services
    svc.chat.crewdata.clock = lambda: T0  # relative time is tested with a fixed clock
    return svc


def add_alert(services, crew_id, name, indicator="body_temperature", value=39.5, minutes=12, kind="vital", **kw):
    alert = Alert(
        id=f"a-{crew_id}-{indicator}-{minutes}-{kind}",
        kind=kind,
        crew_id=crew_id,
        crew_name=name,
        created_at=T0 - timedelta(minutes=minutes),
        indicator=indicator if kind == "vital" else None,
        value=value if kind == "vital" else None,
        unit="°C" if kind == "vital" else None,
        **kw,
    )
    return services.alerts._add(alert)


# --------------------------------------------------------------------------- reporting a reading
@pytest.mark.parametrize(
    "message,indicator,value,status",
    [
        ("tengo 40 de temperatura", "body_temperature", 40.0, "urgent"),
        ("my temperature is 39.5", "body_temperature", 39.5, "urgent"),
        ("mi pulso está en 130", "heart_rate", 130.0, "attention"),
        ("tengo la saturación en 88", "spo2", 88.0, "urgent"),
        ("dormí 4 horas", "sleep_hours", 4.0, "urgent"),
        ("mi temperatura es 36,8", "body_temperature", 36.8, "normal"),
    ],
)
def test_reading_is_recorded(client, services, message, indicator, value, status):
    data = chat(client, message, crew_id="ruben")
    assert data["measurement_recorded"] is True
    assert data["indicator"] == indicator
    stored = services.store.list(crew_id="ruben")
    assert len(stored) == 1 and stored[0].indicator == indicator and stored[0].value == value
    assert stored[0].status == status
    expected_steps = services.manual.what_to_do(indicator, status, data["language"])
    assert expected_steps[0] in data["reply"]  # the manual's own guidance text


def test_urgent_reading_alerts_everyone_and_opens_protocol(client, services):
    data = chat(client, "tengo 40 de temperatura", crew_id="ruben")
    assert data["protocol"]["name"] == "feeling_unwell"
    alerts = client.get("/alerts").json()  # visible without any crew account (General)
    assert [(a["crew_id"], a["indicator"], a["kind"]) for a in alerts] == [("ruben", "body_temperature", "vital")]


def test_attention_reading_also_alerts_but_without_protocol(client, services):
    data = chat(client, "mi pulso está en 120", crew_id="ana")
    assert data["protocol"] is None
    assert "alerta" in data["reply"].lower()
    assert len(services.alerts.list()) == 1


def test_normal_reading_has_no_alert(client, services):
    data = chat(client, "mi pulso es 70", crew_id="ana")
    assert data["measurement_recorded"] is True
    assert services.alerts.list() == []


def test_english_reply(client, services):
    data = chat(client, "my heart rate is 135", crew_id="ana")
    assert data["language"] == "en" and "Logged" in data["reply"]
    assert data["protocol"]["name"] == "general_emergency"


def test_several_readings_in_one_message(client, services):
    data = chat(client, "mi pulso está en 70 y tengo 39.5 de temperatura", crew_id="moises")
    assert {m.indicator for m in services.store.list(crew_id="moises")} == {"heart_rate", "body_temperature"}
    assert data["measurement_recorded"] is True


def test_blood_pressure_pair(client, services):
    chat(client, "mi presión arterial es 120/80", crew_id="moises")
    got = {m.indicator: m.value for m in services.store.list(crew_id="moises")}
    assert got == {"blood_pressure_systolic": 120.0, "blood_pressure_diastolic": 80.0}


def test_general_account_does_not_record(client, services):
    data = chat(client, "tengo 40 de temperatura")
    assert data["measurement_recorded"] is False
    assert "cuenta de tripulante" in data["reply"]
    assert services.store.list() == [] and services.alerts.list() == []


def test_implausible_value_is_asked_not_recorded(client, services):
    data = chat(client, "tengo 400 de temperatura", crew_id="ruben")
    assert data["measurement_recorded"] is False and data["suggestions"]
    assert services.store.list() == []
    # a later bare number completes the reading
    data = chat(client, "38.5", crew_id="ruben")
    assert data["measurement_recorded"] is True
    assert services.store.list()[0].value == 38.5


def test_fahrenheit_without_unit_asks_then_converts(client, services):
    data = chat(client, "tengo 104 de temperatura", crew_id="ruben")
    assert data["measurement_recorded"] is False
    assert "40 °C" in data["reply"] and data["suggestions"][0].startswith("Sí")
    assert services.store.list() == []
    done = chat(client, data["suggestions"][0], crew_id="ruben")
    assert done["measurement_recorded"] is True
    assert services.store.list()[0].value == 40.0


def test_fahrenheit_declined(client, services):
    chat(client, "my temperature is 104", crew_id="ruben")
    data = chat(client, "No", crew_id="ruben")
    assert data["measurement_recorded"] is False and services.store.list() == []


def test_explicit_fahrenheit_is_converted(client, services):
    data = chat(client, "my temperature is 102.2 °F", crew_id="ruben")
    assert data["measurement_recorded"] is True
    assert services.store.list()[0].value == 39.0
    assert "102.2 °F = 39 °C" in data["reply"]


def test_number_without_indicator_asks_with_buttons(client, services):
    data = chat(client, "tengo 130", crew_id="ruben")
    assert data["measurement_recorded"] is False and services.store.list() == []
    assert "Pulso 130" in data["suggestions"]
    done = chat(client, "Pulso 130", crew_id="ruben")
    assert done["measurement_recorded"] is True and services.store.list()[0].indicator == "heart_rate"


@pytest.mark.parametrize(
    "message", ["¿Qué temperatura es normal? 37", "necesito dormir 8 horas", "tengo 30 años", "hola 40"]
)
def test_not_a_reading(client, services, message):
    data = chat(client, message, crew_id="ruben")
    assert data["measurement_recorded"] is False
    assert services.store.list() == []


# --------------------------------------------------------------------------- relative time
def test_ago_texts():
    assert ago(timedelta(seconds=20), "es") == "Hace menos de un minuto"
    assert ago(timedelta(minutes=1), "es") == "Hace 1 minuto"
    assert ago(timedelta(minutes=12), "es") == "Hace 12 minutos"
    assert ago(timedelta(minutes=125), "es") == "Hace 2 horas"
    assert ago(timedelta(days=3), "es") == "Hace 3 días"
    assert ago(timedelta(minutes=12), "en") == "12 minutes ago"
    assert ago(timedelta(minutes=-5), "en") == "Less than a minute ago"


# --------------------------------------------------------------------------- asking about someone
def test_query_with_alert_from_general_account(client, services):
    add_alert(services, "ruben", "Rubén")
    data = chat(client, "¿cómo está Rubén?")
    assert data["reply"] == "Hace 12 minutos Rubén notificó una temperatura alta."
    assert not re.search(r"\d\d?\.\d|39", data["reply"].replace("12", ""))


@pytest.mark.parametrize(
    "message",
    ["¿qué le pasa a Ana?", "¿RUBEN tiene alguna alerta?", "estado de ánimo de Rubén", "como esta ruben", "temperatura de Rubén"],
)
def test_query_variants_es(client, services, message):
    add_alert(services, "ana", "Ana", "heart_rate", 150)
    add_alert(services, "ruben", "Rubén", "mood", 1, kind="vital")
    data = chat(client, message)
    assert data["reply"].startswith("Hace 12 minutos") or "no tiene alertas" in data["reply"]
    assert "150" not in data["reply"]


def test_query_english(client, services):
    add_alert(services, "ruben", "Rubén", "spo2", 88, minutes=3)
    data = chat(client, "how is Ruben doing?")
    assert data["reply"] == "3 minutes ago, Rubén reported low oxygen saturation."
    assert "88" not in data["reply"]


def test_query_levels(client, services):
    add_alert(services, "ana", "Ana", "heart_rate", 45, minutes=5)
    add_alert(services, "ana", "Ana", "heart_rate", 150, minutes=2)
    reply = chat(client, "¿cómo está Ana?")["reply"]
    assert reply.splitlines() == [
        "Ana tiene 2 alertas activas:",
        "- Hace 2 minutos Ana notificó un pulso alto.",
        "- Hace 5 minutos Ana notificó un pulso bajo.",
    ]


def test_query_max_three_newest_first(client, services):
    for minutes in (50, 10, 30, 20, 40):
        add_alert(services, "ana", "Ana", "heart_rate", 150, minutes=minutes)
    lines = chat(client, "¿cómo está Ana?")["reply"].splitlines()
    assert lines[0] == "Ana tiene 5 alertas activas:"
    assert [l.split()[2] for l in lines[1:4]] == ["10", "20", "30"]
    assert lines[4] == "(y 2 más)"


def test_query_acknowledged_counts_resolved_does_not(client, services):
    a = add_alert(services, "ruben", "Rubén")
    services.alerts.acknowledge(a.id)
    assert "Hace" in chat(client, "¿cómo está Rubén?")["reply"]
    services.alerts.resolve(a.id)
    assert "no tiene alertas activas" in chat(client, "¿cómo está Rubén?")["reply"]


def test_query_without_alerts(client, services):
    data = chat(client, "¿cómo está Rubén?")
    assert data["reply"] == "Rubén no tiene alertas activas. Sus datos individuales solo se comparten en una emergencia."
    en = chat(client, "how is ruben doing?")
    assert en["reply"] == "Rubén has no active alerts. Individual data is only shared in an emergency."


def test_mood_only_from_mood_alert(client, services):
    add_alert(services, "ruben", "Rubén", "body_temperature", 39.5)
    reply = chat(client, "estado de ánimo de Rubén")["reply"]
    assert "no tiene alertas sobre su estado de ánimo" in reply and "temperatura" not in reply
    add_alert(services, "ruben", "Rubén", "mood", 1, minutes=7)
    assert chat(client, "estado de ánimo de Rubén")["reply"] == (
        "Hace 7 minutos Rubén notificó un estado de ánimo bajo."
    )


def test_unknown_name(client, services):
    data = chat(client, "¿Cómo está Pedro?")
    assert "No reconozco a «Pedro»" in data["reply"]
    assert "¿Cómo está Rubén?" in data["suggestions"]
    assert "Rubén" not in data["reply"]


def test_self_query_invites_to_panel(client, services):
    none = chat(client, "¿tengo alguna alerta?", crew_id="ruben")["reply"]
    assert none == "No tienes alertas activas. Puedes ver tus propios signos en tu panel."
    add_alert(services, "ruben", "Rubén", "heart_rate", 150)
    mine = chat(client, "¿cómo está Rubén?", crew_id="ruben")["reply"]
    assert mine == "Hace 12 minutos notificaste un pulso alto. Puedes ver tus propios signos en tu panel."


def test_self_query_without_crew_account(client, services):
    assert "nombre de un tripulante" in chat(client, "¿tengo alguna alerta?")["reply"]


# --------------------------------------------------------------------------- privacy
def test_query_never_leaks_chat_text_profile_or_numbers(client, services):
    chat(client, "estoy muy estresado y extraño mi casa", crew_id="ruben", session_id="private")
    chat(client, "tengo 39.5 de temperatura", crew_id="ruben", session_id="private")
    add_alert(services, "ruben", "Rubén", "heart_rate", 161.0, minutes=4)
    add_alert(services, "ruben", "Rubén", kind="report", protocol="chest_pain", minutes=2)
    reply = chat(client, "how is Ruben doing?", session_id="other")["reply"]
    assert not re.search(r"\d+(\.\d+)?\s*(°|bpm|%)", reply)
    assert "161" not in reply and "39.5" not in reply
    for leak in ("estresado", "casa", "chest", "pecho", "extraño", "stress"):
        assert leak not in reply.lower()
    assert "reported an emergency" in reply


def test_names_in_a_number_message_never_query(client, services):
    add_alert(services, "ana", "Ana", "heart_rate", 150)
    data = chat(client, "soy Rubén, tengo 38.5 de temperatura", crew_id="ruben")
    assert data["measurement_recorded"] is True
    assert "Ana" not in data["reply"]
