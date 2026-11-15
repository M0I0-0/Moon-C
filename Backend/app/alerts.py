"""On-board alerts for the crew and the on-board medical officer.

Kinds of alert:

* ``vital``    - a reading in the urgent range. POST /measurements raises one per urgent
                 reading; the simulated bracelets keep at most one open alert per crew
                 member and indicator.
* ``report``   - the chat detected an emergency for an identified crew member.
* ``maneuver`` - a guided emergency maneuver (CPR, tourniquet, choking) was started.

An alert stays open until it is resolved; acknowledging it only says someone saw it.
Alerts live in memory only and never include chat text: a report alert keeps just
the protocol name.

Alerts about a crew member are in English (``ALERT_LANGUAGE``), the crew's common
language, whatever language each crew member uses with Moon-C. A Spanish text is
still available on request (``?language=es``).
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, replace
from datetime import datetime

from .manual import Manual, format_value
from .schemas import AlertView, Measurement
from .storage import now_utc

ALERT_LANGUAGE = "en"

_TEXTS = {
    "en": {
        "vital": "Alert: {who}, {what} {value}",
        "report": "Alert: {who} reported {what}",
        "maneuver": "Alert: {what} guide started ({who})",
        "unknown": "unidentified crew member",
        "emergency": "an emergency",
    },
    "es": {
        "vital": "Alerta: {who}, {what} {value}",
        "report": "Alerta: {who} reportó {what}",
        "maneuver": "Alerta: guía de {what} iniciada ({who})",
        "unknown": "tripulante sin identificar",
        "emergency": "una emergencia",
    },
}

# Guided maneuvers defined by the 3D app (Model3D/moonc/maniobras.js).
MANEUVER_NAMES = {
    "rcp": {"en": "CPR", "es": "RCP"},
    "torniquete": {"en": "tourniquet", "es": "torniquete"},
    "atragantamiento": {"en": "choking", "es": "atragantamiento"},
}


class AlertNotFound(KeyError):
    pass


@dataclass(frozen=True)
class Alert:
    id: str
    kind: str
    crew_id: str | None
    crew_name: str | None
    created_at: datetime
    measurement_id: str | None = None
    indicator: str | None = None
    value: float | None = None
    unit: str | None = None
    protocol: str | None = None
    acknowledged: bool = False
    acknowledged_at: datetime | None = None
    resolved: bool = False
    resolved_at: datetime | None = None


class AlertBoard:
    def __init__(self, manual: Manual):
        self._manual = manual
        self._lock = threading.Lock()
        self._alerts: dict[str, Alert] = {}

    def _add(self, alert: Alert) -> Alert:
        with self._lock:
            self._alerts[alert.id] = alert
        return alert

    def _open_matching(self, **fields) -> Alert | None:
        with self._lock:
            for alert in self._alerts.values():
                if not alert.resolved and all(getattr(alert, k) == v for k, v in fields.items()):
                    return alert
        return None

    # ------------------------------------------------------------------ creation
    def create(self, measurement: Measurement, crew_name: str | None) -> Alert:
        """Vital alert for an urgent measurement."""
        return self._add(
            Alert(
                id=uuid.uuid4().hex,
                kind="vital",
                crew_id=measurement.crew_id,
                crew_name=crew_name,
                created_at=now_utc(),
                measurement_id=measurement.id,
                indicator=measurement.indicator,
                value=measurement.value,
                unit=measurement.unit,
            )
        )

    def report(self, crew_id: str | None, crew_name: str | None, protocol: str) -> Alert:
        """Emergency detected in the chat. Reuses the open alert for the same crew member and protocol."""
        existing = self._open_matching(kind="report", crew_id=crew_id, protocol=protocol)
        if existing:
            return existing
        return self._add(
            Alert(
                id=uuid.uuid4().hex,
                kind="report",
                crew_id=crew_id,
                crew_name=crew_name,
                created_at=now_utc(),
                protocol=protocol,
            )
        )

    def maneuver(self, crew_id: str | None, crew_name: str | None, maneuver_id: str) -> Alert:
        """Guided maneuver started. Reuses the open alert for the same crew member and maneuver."""
        existing = self._open_matching(kind="maneuver", crew_id=crew_id, protocol=maneuver_id)
        if existing:
            return existing
        return self._add(
            Alert(
                id=uuid.uuid4().hex,
                kind="maneuver",
                crew_id=crew_id,
                crew_name=crew_name,
                created_at=now_utc(),
                protocol=maneuver_id,
            )
        )

    def has_open_vital(self, crew_id: str | None, indicator: str) -> bool:
        return self._open_matching(kind="vital", crew_id=crew_id, indicator=indicator) is not None

    # ------------------------------------------------------------------ queries and changes
    def list(self, include_acknowledged: bool = False, include_resolved: bool = False) -> list[Alert]:
        with self._lock:
            alerts = list(self._alerts.values())
        if not include_resolved:
            alerts = [a for a in alerts if not a.resolved]
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

    def resolve(self, alert_id: str) -> Alert:
        """Close an alert. Idempotent: resolving twice keeps the first time."""
        with self._lock:
            alert = self._alerts.get(alert_id)
            if alert is None:
                raise AlertNotFound(alert_id)
            if not alert.resolved:
                alert = replace(alert, resolved=True, resolved_at=now_utc())
                self._alerts[alert_id] = alert
            return alert

    def resolve_crew(self, crew_id: str | None) -> list[Alert]:
        """Close every open alert of one crew member (``None`` = every alert)."""
        resolved = []
        with self._lock:
            for alert_id, alert in self._alerts.items():
                if not alert.resolved and (crew_id is None or alert.crew_id == crew_id):
                    alert = replace(alert, resolved=True, resolved_at=now_utc())
                    self._alerts[alert_id] = alert
                    resolved.append(alert)
        return resolved

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

    # ------------------------------------------------------------------ presentation
    def message(self, alert: Alert, lang: str = ALERT_LANGUAGE) -> str:
        texts = _TEXTS.get(lang, _TEXTS[ALERT_LANGUAGE])
        who = alert.crew_name or texts["unknown"]
        if alert.kind == "report":
            if alert.protocol == "general_emergency" or not self._manual.has_protocol(alert.protocol or ""):
                what = texts["emergency"]
            else:
                title = self._manual.protocol_view(alert.protocol, lang).title.split(":")[0]
                what = title[:1].lower() + title[1:]
            return texts["report"].format(who=who, what=what)
        if alert.kind == "maneuver":
            names = MANEUVER_NAMES.get(alert.protocol or "", {})
            return texts["maneuver"].format(who=who, what=names.get(lang) or names.get("en") or alert.protocol)
        name = self._manual.indicator_name(alert.indicator, lang)
        return texts["vital"].format(
            who=who, what=name[:1].lower() + name[1:], value=format_value(alert.value, alert.unit)
        )

    def view(self, alert: Alert, lang: str = ALERT_LANGUAGE) -> AlertView:
        return AlertView(
            id=alert.id,
            kind=alert.kind,
            measurement_id=alert.measurement_id,
            crew_id=alert.crew_id,
            crew_name=alert.crew_name,
            indicator=alert.indicator,
            value=alert.value,
            unit=alert.unit,
            protocol=alert.protocol,
            message=self.message(alert, lang),
            created_at=alert.created_at,
            acknowledged=alert.acknowledged,
            acknowledged_at=alert.acknowledged_at,
            resolved=alert.resolved,
            resolved_at=alert.resolved_at,
        )
