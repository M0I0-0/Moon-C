"""Simulated bracelets: live signs, stored readings, alerts and demo scenarios."""

from __future__ import annotations

import random

import pytest

from app.alerts import AlertBoard
from app.bracelets import DAILY, LIVE, SimulatedBracelets, UnknownCrew, UnknownScenario
from app.crew import CrewRegistry
from app.evaluator import evaluate
from app.storage import MeasurementStore


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def parts(manual, shared_dir, tmp_path):
    crew = CrewRegistry.load(shared_dir / "crew.json")
    store = MeasurementStore(tmp_path / "measurements.json")
    store.load()
    alerts = AlertBoard(manual)
    clock = Clock()
    bracelets = SimulatedBracelets(
        manual, crew, store, alerts, rng=random.Random(7), snapshot_interval_s=900, clock=clock
    )
    return bracelets, store, alerts, clock


def advance(bracelets, store, ticks=1):
    for _ in range(ticks):
        store.add_many(bracelets.tick())


def tick_until(bracelets, store, predicate, limit=200):
    for _ in range(limit):
        store.add_many(bracelets.tick())
        if predicate():
            return True
    return False


def status(bracelets, crew_id, indicator):
    return bracelets.vitals_for(crew_id).indicators[indicator].status


def vital_alerts(alerts, indicator=None):
    found = [a for a in alerts.list(include_acknowledged=True, include_resolved=True) if a.kind == "vital"]
    return [a for a in found if indicator is None or a.indicator == indicator]


def test_every_crew_member_has_live_and_daily_signs(parts):
    bracelets, *_ = parts
    vitals = bracelets.vitals()
    assert [v.crew_id for v in vitals] == ["moises", "ana", "kenji", "valentina"]
    for v in vitals:
        assert set(v.indicators) == set(LIVE) | set(DAILY)
        assert all(len(v.indicators[i].history) == 40 for i in LIVE)
        assert all(len(v.indicators[i].history) == 14 for i in DAILY)
        assert v.scenario is None
    assert bracelets.vitals_for("moises").indicators["sleep_hours"].status == "attention"  # baseline 6.4 h


def test_simulated_values_are_always_valid_readings(parts, manual):
    bracelets, store, *_ = parts
    for _ in range(50):
        advance(bracelets, store)
        for v in bracelets.vitals():
            for indicator, live in v.indicators.items():
                evaluate(manual, indicator, live.value, live.unit)  # raises if out of range


def test_quiet_crew_raises_no_alerts_and_stores_little(parts):
    bracelets, store, alerts, _ = parts
    advance(bracelets, store, 100)
    assert vital_alerts(alerts) == []
    assert len(store.list()) < 40  # only settled status changes, never every reading (100 x 28)


def test_emergency_raises_one_alert_per_indicator(parts):
    bracelets, store, alerts, _ = parts
    bracelets.start_scenario("moises", "low_oxygen")
    assert tick_until(bracelets, store, lambda: status(bracelets, "moises", "spo2") == "urgent")
    advance(bracelets, store, 40)
    spo2 = vital_alerts(alerts, "spo2")
    assert len(spo2) == 1
    assert spo2[0].crew_id == "moises" and spo2[0].crew_name == "Moisés"
    stored = store.get(spo2[0].measurement_id)
    assert stored is not None and stored.status == "urgent" and stored.indicator == "spo2"
    assert bracelets.vitals_for("moises").overall_status == "urgent"


def test_resolved_alert_does_not_return_while_still_urgent_but_rearms_later(parts):
    bracelets, store, alerts, _ = parts
    bracelets.start_scenario("ana", "high_temperature")
    assert tick_until(bracelets, store, lambda: status(bracelets, "ana", "body_temperature") == "urgent")
    alerts.resolve_crew("ana")
    advance(bracelets, store, 30)  # still urgent: no new alert after resolving
    assert len(vital_alerts(alerts, "body_temperature")) == 1

    bracelets.reset("ana")
    assert tick_until(bracelets, store, lambda: status(bracelets, "ana", "body_temperature") == "normal")
    advance(bracelets, store, 10)
    bracelets.start_scenario("ana", "high_temperature")
    assert tick_until(bracelets, store, lambda: len(vital_alerts(alerts, "body_temperature")) == 2)


def test_open_alert_is_not_duplicated(parts):
    bracelets, store, alerts, _ = parts
    bracelets.start_scenario("kenji", "solar_storm")
    assert tick_until(bracelets, store, lambda: status(bracelets, "kenji", "radiation") == "urgent")
    bracelets.reset("kenji")
    assert tick_until(bracelets, store, lambda: status(bracelets, "kenji", "radiation") == "normal")
    advance(bracelets, store, 10)
    bracelets.start_scenario("kenji", "solar_storm")
    advance(bracelets, store, 60)
    assert len(vital_alerts(alerts, "radiation")) == 1  # the first alert was never resolved


def test_periodic_snapshot_stores_every_live_sign(parts):
    bracelets, store, _, clock = parts
    before = len(store.list())
    clock.now += 901
    advance(bracelets, store)
    snapshot = store.list()[before:]
    assert len(snapshot) >= 4 * len(LIVE)
    assert {m.indicator for m in snapshot} >= set(LIVE)


def test_demo_controls_validate_input(parts):
    bracelets, *_ = parts
    with pytest.raises(UnknownCrew):
        bracelets.start_scenario("zeus", "low_oxygen")
    with pytest.raises(UnknownScenario):
        bracelets.start_scenario("moises", "zombies")
    with pytest.raises(UnknownCrew):
        bracelets.reset("zeus")
    bracelets.start_scenario("moises", "solar_storm")
    bracelets.start_scenario("ana", "solar_storm")
    bracelets.reset()
    assert all(v.scenario is None for v in bracelets.vitals())


def test_scenario_labels_are_localized_and_neutral(parts):
    bracelets, *_ = parts
    es = {s.id: s.label for s in bracelets.scenarios("es")}
    assert es["high_temperature"] == "Temperatura alta"
    assert {s.id for s in bracelets.scenarios("en")} == set(es)


# --------------------------------------------------------------------------- API


@pytest.fixture
def sim_client(make_client):
    # The background loop never fires during a test (1 h tick); tests advance the bracelets by hand.
    return make_client(simulation=True, sim_tick_s=3600, sim_seed=11)


def api_advance(client, ticks=1):
    services = client.app.state.services
    for _ in range(ticks):
        services.store.add_many(services.bracelets.tick())


def test_vitals_endpoints(sim_client):
    vitals = sim_client.get("/vitals").json()
    assert [v["crew_id"] for v in vitals] == ["moises", "ana", "kenji", "valentina"]
    moises = sim_client.get("/vitals/moises").json()
    assert moises["indicators"]["blood_pressure_systolic"]["unit"] == "mmHg"
    assert len(moises["indicators"]["heart_rate"]["history"]) == 40
    assert sim_client.get("/vitals/zeus").status_code == 404


def test_simulated_emergency_flows_into_alerts(sim_client):
    res = sim_client.post("/simulation/emergency", json={"crew_id": "moises", "scenario": "high_temperature"})
    assert res.status_code == 200 and res.json()["scenario"] == "high_temperature"
    for _ in range(200):
        api_advance(sim_client)
        alerts = sim_client.get("/alerts").json()
        if any(a["indicator"] == "body_temperature" for a in alerts):
            break
    temperature = [a for a in alerts if a["indicator"] == "body_temperature"]
    assert len(temperature) == 1
    assert temperature[0]["kind"] == "vital"
    assert temperature[0]["message"].startswith("Alert: Moisés, body temperature 3")

    closed = sim_client.post("/alerts/resolve", json={"crew_id": "moises"}).json()
    assert {a["id"] for a in closed} >= {temperature[0]["id"]} and all(a["resolved"] for a in closed)
    assert sim_client.get("/alerts").json() == []
    assert len(sim_client.get("/alerts", params={"include_resolved": "true"}).json()) == len(closed)

    reset = sim_client.post("/simulation/reset", json={"crew_id": "moises"}).json()
    assert all(v["scenario"] is None for v in reset)


def test_simulation_input_errors(sim_client):
    assert sim_client.post("/simulation/emergency", json={"crew_id": "zeus", "scenario": "low_oxygen"}).status_code == 404
    assert sim_client.post("/simulation/emergency", json={"crew_id": "ana", "scenario": "zombies"}).status_code == 422
    assert sim_client.post("/simulation/reset", json={"crew_id": "zeus"}).status_code == 404
    scenarios = sim_client.get("/simulation/scenarios", params={"language": "es"}).json()
    assert {"id": "solar_storm", "label": "Tormenta solar (radiación)"} in scenarios


def test_simulation_disabled(client):
    assert client.get("/vitals").json() == []
    assert client.get("/vitals/moises").status_code == 409
    assert client.get("/simulation/scenarios").status_code == 409
    assert client.post("/simulation/reset", json={}).status_code == 409


def test_scenario_ids_match_the_front_end():
    # Keep in sync with EMERGENCY_TYPES in front-end/src/hooks/useCrewSimulation.js (and its test).
    from app.bracelets import SCENARIOS

    assert list(SCENARIOS) == ["low_oxygen", "high_heart_rate", "high_temperature", "high_blood_pressure", "solar_storm"]
