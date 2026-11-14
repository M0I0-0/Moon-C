"""On-board alerts for the crew and the on-board medical officer.

An alert is created for every measurement in the urgent range (including
unassigned ones). Alerts live in memory only; they never include chat content.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, replace
from datetime import datetime

from .manual import Manual, format_value
from .schemas import AlertView, Measurement
from .storage import now_utc

_TEMPLATES = {
    "en": ("Alert: {who}, {what} {value}", "unidentified crew member"),
    "es": ("Alerta: {who}, {what} {value}", "tripulante sin identificar"),
}


class AlertNotFound(KeyError):
    pass


@dataclass(frozen=True)
class Alert:
    id: str
    measurement_id: str
    crew_id: str | None
    crew_name: str | None
    indicator: str
    value: float
    unit: str
    created_at: datetime
    acknowledged: bool = False
    acknowledged_at: datetime | None = None


class AlertBoard:
    def __init__(self, manual: Manual):
        self._manual = manual
        self._lock = threading.Lock()
        self._alerts: dict[str, Alert] = {}

    def create(self, measurement: Measurement, crew_name: str | None) -> Alert:
        alert = Alert(
            id=uuid.uuid4().hex,
            measurement_id=measurement.id,
            crew_id=measurement.crew_id,
            crew_name=crew_name,
            indicator=measurement.indicator,
            value=measurement.value,
            unit=measurement.unit,
            created_at=now_utc(),
        )
        with self._lock:
            self._alerts[alert.id] = alert
        return alert

    def list(self, include_acknowledged: bool = False) -> list[Alert]:
        with self._lock:
            alerts = list(self._alerts.values())
        if not include_acknowledged:
            alerts = [a for a in alerts if not a.acknowledged]
        return sorted(alerts, key=lambda a: a.created_at, reverse=True)

    def acknowledge(self, alert_id: str) -> Alert:
        """Idempotent: acknowledging twice keeps the first acknowledgement time."""
        with self._lock:
            alert = self._alerts.get(alert_id)
            if alert is None:
                raise AlertNotFound(alert_id)
            if not alert.acknowledged:
                alert = replace(alert, acknowledged=True, acknowledged_at=now_utc())
                self._alerts[alert_id] = alert
            return alert

    def reassign(self, measurement_id: str, crew_id: str, crew_name: str) -> None:
        """Called when an unassigned measurement is confirmed for a crew member."""
        with self._lock:
            for alert_id, alert in self._alerts.items():
                if alert.measurement_id == measurement_id:
                    self._alerts[alert_id] = replace(alert, crew_id=crew_id, crew_name=crew_name)

    def clear(self) -> int:
        with self._lock:
            count = len(self._alerts)
            self._alerts.clear()
            return count

    def message(self, alert: Alert, lang: str) -> str:
        template, unknown = _TEMPLATES.get(lang, _TEMPLATES["en"])
        name = self._manual.indicator_name(alert.indicator, lang)
        return template.format(
            who=alert.crew_name or unknown,
            what=name[:1].lower() + name[1:],
            value=format_value(alert.value, alert.unit),
        )

    def view(self, alert: Alert, lang: str) -> AlertView:
        return AlertView(
            id=alert.id,
            measurement_id=alert.measurement_id,
            crew_id=alert.crew_id,
            crew_name=alert.crew_name,
            indicator=alert.indicator,
            value=alert.value,
            unit=alert.unit,
            message=self.message(alert, lang),
            created_at=alert.created_at,
            acknowledged=alert.acknowledged,
            acknowledged_at=alert.acknowledged_at,
        )
