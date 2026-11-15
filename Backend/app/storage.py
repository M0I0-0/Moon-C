"""JSON persistence for measurements only.

Privacy: this is the only data Moon-C writes to disk. Each record holds exactly
id, crew_id (null = unassigned), indicator, value, unit, status, timestamp and
synced. Chat messages, transcripts and audio are never persisted.

Writes are atomic (temp file + rename) and guarded by a lock, so a crash or a
concurrent request cannot leave a half-written file.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .schemas import Measurement

log = logging.getLogger("moon_c.storage")

SCHEMA_VERSION = 1


class MeasurementNotFound(KeyError):
    pass


class AlreadyAssigned(Exception):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_utc(value: datetime) -> datetime:
    """Naive datetimes are taken as UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class MeasurementStore:
    def __init__(self, path: Path, retention_days: int = 0):
        self.path = path
        self.retention_days = retention_days
        self._lock = threading.RLock()
        self._items: dict[str, Measurement] = {}

    # ------------------------------------------------------------------ file I/O
    def load(self) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            if not self.path.exists():
                self._items = {}
                return
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                items = [Measurement.model_validate(m) for m in raw["measurements"]]
            except (OSError, ValueError, KeyError, TypeError):
                backup = self.path.with_name(f"{self.path.name}.corrupt-{now_utc():%Y%m%dT%H%M%SZ}")
                os.replace(self.path, backup)
                log.warning("Measurements file was unreadable; moved it to %s and started empty.", backup.name)
                items = []
            self._items = {m.id: m for m in items}
            if self._prune():
                self._save()
            log.info("Loaded %d measurements.", len(self._items))

    def _save(self) -> None:
        payload = {
            "schema_version": SCHEMA_VERSION,
            "measurements": [m.model_dump(mode="json") for m in self._items.values()],
        }
        text = json.dumps(payload, ensure_ascii=False, indent=2)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=self.path.parent, prefix=f".{self.path.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(text)
                fh.flush()
                os.fsync(fh.fileno())
            self._replace_with_retry(tmp_name)
        except BaseException:
            if os.path.exists(tmp_name):
                os.remove(tmp_name)
            raise

    def _replace_with_retry(self, tmp_name: str, attempts: int = 8) -> None:
        # On Windows, antivirus or OneDrive can hold the target file for a moment.
        for attempt in range(attempts):
            try:
                os.replace(tmp_name, self.path)
                return
            except PermissionError:
                if attempt == attempts - 1:
                    raise
                time.sleep(0.05 * (attempt + 1))

    def _prune(self) -> bool:
        if self.retention_days <= 0:
            return False
        cutoff = now_utc() - timedelta(days=self.retention_days)
        old = [mid for mid, m in self._items.items() if m.timestamp < cutoff]
        for mid in old:
            del self._items[mid]
        return bool(old)

    # ------------------------------------------------------------------ operations
    def add(self, measurement: Measurement) -> Measurement:
        with self._lock:
            self._items[measurement.id] = measurement
            self._prune()
            self._save()
            return measurement

    def add_many(self, measurements: list[Measurement]) -> None:
        """Add a batch with a single file write (used by the simulated bracelets)."""
        if not measurements:
            return
        with self._lock:
            for measurement in measurements:
                self._items[measurement.id] = measurement
            self._prune()
            self._save()

    def get(self, measurement_id: str) -> Measurement | None:
        with self._lock:
            return self._items.get(measurement_id)

    def list(
        self,
        crew_id: str | None = None,
        indicator: str | None = None,
        since: datetime | None = None,
        unassigned: bool | None = None,
    ) -> list[Measurement]:
        since = to_utc(since) if since else None
        with self._lock:
            items = list(self._items.values())
        out = [
            m
            for m in items
            if (crew_id is None or m.crew_id == crew_id)
            and (indicator is None or m.indicator == indicator)
            and (since is None or m.timestamp >= since)
            and (unassigned is None or (m.crew_id is None) == unassigned)
        ]
        return sorted(out, key=lambda m: m.timestamp)

    def assign(self, measurement_id: str, crew_id: str) -> Measurement:
        with self._lock:
            current = self._items.get(measurement_id)
            if current is None:
                raise MeasurementNotFound(measurement_id)
            if current.crew_id is not None:
                raise AlreadyAssigned(measurement_id)
            # Not synced yet with its owner: send it (again) on the next sync.
            updated = current.model_copy(update={"crew_id": crew_id, "synced": False})
            self._items[measurement_id] = updated
            self._save()
            return updated

    def sync_counts(self) -> tuple[int, int]:
        """(pending, awaiting_assignment). Unassigned readings wait until confirmed."""
        with self._lock:
            pending = sum(1 for m in self._items.values() if not m.synced and m.crew_id is not None)
            awaiting = sum(1 for m in self._items.values() if not m.synced and m.crew_id is None)
        return pending, awaiting

    def mark_synced(self) -> int:
        """Mark every pending (assigned, not yet synced) measurement as synced."""
        with self._lock:
            ids = [mid for mid, m in self._items.items() if not m.synced and m.crew_id is not None]
            for mid in ids:
                self._items[mid] = self._items[mid].model_copy(update={"synced": True})
            if ids:
                self._save()
            return len(ids)

    def wipe(self) -> int:
        with self._lock:
            count = len(self._items)
            self._items = {}
            self._save()
            return count
