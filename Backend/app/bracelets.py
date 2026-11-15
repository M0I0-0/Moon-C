"""Simulated bracelets: live vital signs for each crew member (there are no real sensors yet).

* Live values move a little every tick (MOON_C_SIM_TICK_S) and live in memory only.
* A reading is stored as a measurement only when an indicator settles on a new status
  (an urgent value is stored at once) and in a periodic snapshot
  (MOON_C_SNAPSHOT_INTERVAL_S). Never on every tick.
* Moving into the urgent range raises one on-board alert per crew member and indicator.
  While the value stays urgent no new alert is raised, even if the alert was resolved;
  it can fire again only after the value has settled outside the urgent range.
* Sleep and mood are daily self-reports: their simulated history covers the last 14 days.

Statuses come from the manual's reference ranges (shared/protocols.json, sources in
shared/REFERENCES.md) – must be validated by medical experts.
"""

from __future__ import annotations

import asyncio
import logging
import random
import threading
import time
import uuid
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from .alerts import AlertBoard
from .crew import CrewRegistry
from .evaluator import classify
from .manual import Manual
from .schemas import CrewVitals, LiveIndicator, Measurement, Scenario
from .storage import MeasurementStore, now_utc

log = logging.getLogger("moon_c.bracelets")

LIVE = (
    "heart_rate",
    "blood_pressure_systolic",
    "blood_pressure_diastolic",
    "spo2",
    "respiratory_rate",
    "body_temperature",
    "radiation",
)
DAILY = ("sleep_hours", "mood")
HISTORY = 40  # live readings kept for the charts
DAYS = 14  # days of sleep and mood history
STABLE_TICKS = 3  # ticks a new (non-urgent) status must hold before it is stored
PULL = 0.22  # how fast a value moves toward its target on each tick

# Noise per tick, physical limits and decimals of each simulated signal.
SIGNALS = {
    "heart_rate": (2.2, 35, 200, 0),
    "blood_pressure_systolic": (2.5, 60, 230, 0),
    "spo2": (0.6, 70, 100, 0),
    "respiratory_rate": (0.8, 5, 45, 0),
    "body_temperature": (0.06, 34, 42, 1),
    "radiation": (2.5, 5, 5000, 0),
    "sleep_hours": (0.9, 3, 10, 1),
    "mood": (0.8, 1, 5, 0),
}

BASELINES = {
    "moises": {"heart_rate": 74, "blood_pressure_systolic": 122, "spo2": 98, "respiratory_rate": 15,
               "body_temperature": 36.6, "radiation": 28, "sleep_hours": 6.4, "mood": 4},
    "ana": {"heart_rate": 66, "blood_pressure_systolic": 112, "spo2": 97, "respiratory_rate": 14,
            "body_temperature": 36.5, "radiation": 24, "sleep_hours": 7.6, "mood": 4},
    "kenji": {"heart_rate": 62, "blood_pressure_systolic": 118, "spo2": 98, "respiratory_rate": 13,
              "body_temperature": 36.7, "radiation": 31, "sleep_hours": 7.2, "mood": 5},
    "valentina": {"heart_rate": 79, "blood_pressure_systolic": 126, "spo2": 97, "respiratory_rate": 17,
                  "body_temperature": 36.9, "radiation": 26, "sleep_hours": 8.1, "mood": 3},
}
DEFAULT_BASELINE = BASELINES["kenji"]

# Simulated emergencies for demos: label and the values the signals drift toward.
SCENARIOS = {
    "low_oxygen": (
        {"en": "Low oxygen saturation", "es": "Baja saturación de oxígeno"},
        {"spo2": 86, "heart_rate": 118, "respiratory_rate": 32},
    ),
    "high_heart_rate": (
        {"en": "Very high heart rate", "es": "Frecuencia cardiaca muy alta"},
        {"heart_rate": 138, "blood_pressure_systolic": 150},
    ),
    "high_temperature": (
        {"en": "High temperature", "es": "Temperatura alta"},
        {"body_temperature": 39.6, "heart_rate": 104, "respiratory_rate": 22},
    ),
    "high_blood_pressure": (
        {"en": "Very high blood pressure", "es": "Presión arterial muy alta"},
        {"blood_pressure_systolic": 188, "heart_rate": 96},
    ),
    "solar_storm": (
        {"en": "Solar storm (radiation)", "es": "Tormenta solar (radiación)"},
        {"radiation": 1500},
    ),
}

_ORDER = {"normal": 0, "attention": 1, "urgent": 2}


class UnknownCrew(KeyError):
    pass


class UnknownScenario(KeyError):
    pass


@dataclass
class _Signal:
    value: float
    history: deque
    status: str
    stored_status: str
    pending: str | None = None
    pending_ticks: int = 0


@dataclass
class _Bracelet:
    crew_id: str
    name: str
    baseline: dict
    signals: dict[str, _Signal] = field(default_factory=dict)
    scenario: str | None = None
    updated_at: datetime = field(default_factory=now_utc)


class SimulatedBracelets:
    def __init__(
        self,
        manual: Manual,
        crew: CrewRegistry,
        store: MeasurementStore,
        alerts: AlertBoard,
        *,
        rng: random.Random | None = None,
        snapshot_interval_s: float = 900.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._manual = manual
        self._store = store
        self._alerts = alerts
        self._rng = rng or random.Random()
        self._snapshot_interval_s = snapshot_interval_s
        self._clock = clock
        self._last_snapshot = clock()
        self._lock = threading.Lock()
        self._bracelets = {m.crew_id: self._new_bracelet(m.crew_id, m.name) for m in crew.all()}

    # ------------------------------------------------------------------ signals
    def _status(self, indicator: str, value: float) -> str:
        return classify(self._manual.spec(indicator).bands, value)

    def _jitter(self, indicator: str, current: float, target: float, pull: float = PULL) -> float:
        noise, low, high, decimals = SIGNALS[indicator]
        value = min(high, max(low, current + (target - current) * pull + self._rng.uniform(-noise, noise)))
        return round(value, decimals) if decimals else float(round(value))

    def _diastolic(self, systolic: float) -> float:
        return float(round(systolic * 0.6 + self._rng.uniform(-1.5, 1.5)))

    def _signal(self, indicator: str, history: list[float]) -> _Signal:
        status = self._status(indicator, history[-1])
        maxlen = DAYS if indicator in DAILY else HISTORY
        return _Signal(value=history[-1], history=deque(history, maxlen=maxlen), status=status, stored_status=status)

    def _new_bracelet(self, crew_id: str, name: str) -> _Bracelet:
        base = BASELINES.get(crew_id, DEFAULT_BASELINE)
        bracelet = _Bracelet(crew_id=crew_id, name=name, baseline=base)
        systolic_history: list[float] = []
        for indicator in LIVE:
            if indicator == "blood_pressure_diastolic":
                history = [self._diastolic(s) for s in systolic_history]
            else:
                value, history = base[indicator], []
                for _ in range(HISTORY):
                    value = self._jitter(indicator, value, base[indicator])
                    history.append(value)
                if indicator == "blood_pressure_systolic":
                    systolic_history = history
            bracelet.signals[indicator] = self._signal(indicator, history)
        for indicator in DAILY:
            days = [self._jitter(indicator, base[indicator], base[indicator], pull=1) for _ in range(DAYS - 1)]
            bracelet.signals[indicator] = self._signal(indicator, [*days, float(base[indicator])])
        return bracelet

    def _measurement(self, bracelet: _Bracelet, indicator: str, signal: _Signal, timestamp: datetime) -> Measurement:
        return Measurement(
            id=uuid.uuid4().hex,
            crew_id=bracelet.crew_id,
            indicator=indicator,
            value=signal.value,
            unit=self._manual.spec(indicator).unit,
            status=signal.status,
            timestamp=timestamp,
            synced=False,
        )

    # ------------------------------------------------------------------ simulation step
    def tick(self) -> list[Measurement]:
        """Advance every bracelet one reading. Returns the measurements that should be stored."""
        now = now_utc()
        to_store: list[Measurement] = []
        new_urgent: list[tuple[Measurement, str]] = []
        with self._lock:
            for bracelet in self._bracelets.values():
                target = dict(bracelet.baseline)
                if bracelet.scenario:
                    target.update(SCENARIOS[bracelet.scenario][1])
                for indicator in LIVE:
                    signal = bracelet.signals[indicator]
                    if indicator == "blood_pressure_diastolic":
                        signal.value = self._diastolic(bracelet.signals["blood_pressure_systolic"].value)
                    else:
                        signal.value = self._jitter(indicator, signal.value, target[indicator])
                    signal.history.append(signal.value)
                    signal.status = self._status(indicator, signal.value)

                    if signal.status == signal.stored_status:
                        signal.pending, signal.pending_ticks = None, 0
                        continue
                    if signal.status == signal.pending:
                        signal.pending_ticks += 1
                    else:
                        signal.pending, signal.pending_ticks = signal.status, 1
                    if signal.status == "urgent" or signal.pending_ticks >= STABLE_TICKS:
                        measurement = self._measurement(bracelet, indicator, signal, now)
                        to_store.append(measurement)
                        signal.stored_status = signal.status
                        signal.pending, signal.pending_ticks = None, 0
                        if signal.status == "urgent":
                            new_urgent.append((measurement, bracelet.name))
                bracelet.updated_at = now

            if self._clock() - self._last_snapshot >= self._snapshot_interval_s:
                self._last_snapshot = self._clock()
                for bracelet in self._bracelets.values():
                    for indicator in LIVE:
                        to_store.append(self._measurement(bracelet, indicator, bracelet.signals[indicator], now))

        for measurement, name in new_urgent:
            if not self._alerts.has_open_vital(measurement.crew_id, measurement.indicator):
                self._alerts.create(measurement, name)
        return to_store

    async def run(self, tick_s: float) -> None:
        """Background loop. Storing runs off the event loop and never blocks requests."""
        while True:
            await asyncio.sleep(tick_s)
            try:
                batch = self.tick()
                if batch:
                    await asyncio.to_thread(self._store.add_many, batch)
            except Exception:  # the simulation must never take the backend down
                log.exception("Simulated bracelets: tick failed; retrying on the next one.")

    # ------------------------------------------------------------------ demo controls
    def scenarios(self, lang: str) -> list[Scenario]:
        return [Scenario(id=key, label=label.get(lang) or label["en"]) for key, (label, _) in SCENARIOS.items()]

    def start_scenario(self, crew_id: str, scenario: str) -> None:
        if scenario not in SCENARIOS:
            raise UnknownScenario(scenario)
        with self._lock:
            bracelet = self._bracelets.get(crew_id)
            if bracelet is None:
                raise UnknownCrew(crew_id)
            bracelet.scenario = scenario

    def reset(self, crew_id: str | None = None) -> None:
        """End the simulated emergency of one crew member (``None`` = everyone)."""
        with self._lock:
            if crew_id is not None and crew_id not in self._bracelets:
                raise UnknownCrew(crew_id)
            for bracelet in self._bracelets.values():
                if crew_id is None or bracelet.crew_id == crew_id:
                    bracelet.scenario = None

    # ------------------------------------------------------------------ views
    def _view(self, bracelet: _Bracelet) -> CrewVitals:
        indicators = {
            indicator: LiveIndicator(
                value=signal.value,
                unit=self._manual.spec(indicator).unit,
                status=signal.status,
                history=list(signal.history),
            )
            for indicator, signal in bracelet.signals.items()
        }
        overall = max((s.status for s in bracelet.signals.values()), key=_ORDER.__getitem__)
        return CrewVitals(
            crew_id=bracelet.crew_id,
            name=bracelet.name,
            updated_at=bracelet.updated_at,
            scenario=bracelet.scenario,
            overall_status=overall,
            indicators=indicators,
        )

    def vitals(self) -> list[CrewVitals]:
        with self._lock:
            return [self._view(b) for b in self._bracelets.values()]

    def vitals_for(self, crew_id: str) -> CrewVitals:
        with self._lock:
            bracelet = self._bracelets.get(crew_id)
            if bracelet is None:
                raise UnknownCrew(crew_id)
            return self._view(bracelet)
