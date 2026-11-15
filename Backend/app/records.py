"""JSON persistence for safety records that are not measurements.

* maneuver reports - summary of a guided emergency maneuver (times, counts, steps);
* access log       - who opened a crew member's data during an emergency, and when;
* announcements    - messages from the General account to the crew.

None of these records contains chat text. They use the same atomic writes as the
measurements, and MOON_C_RETENTION_DAYS applies to them too. A file is created only
when the first record is written.
"""

from __future__ import annotations

import json
import threading
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path
from typing import Generic, TypeVar

from pydantic import BaseModel

from .storage import now_utc, set_aside_corrupt, write_json_atomic

T = TypeVar("T", bound=BaseModel)

SCHEMA_VERSION = 1


class RecordStore(Generic[T]):
    def __init__(self, path: Path, model: type[T], *, key: str, time_field: str, retention_days: int = 0):
        self.path = path
        self._model = model
        self._key = key
        self._time_field = time_field
        self.retention_days = retention_days
        self._lock = threading.RLock()
        self._items: list[T] = []

    def load(self) -> None:
        with self._lock:
            if not self.path.exists():
                self._items = []
                return
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
                self._items = [self._model.model_validate(r) for r in raw[self._key]]
            except (OSError, ValueError, KeyError, TypeError):
                set_aside_corrupt(self.path, self._key.replace("_", " ").capitalize())
                self._items = []
            if self._prune():
                self._save()

    def _prune(self) -> bool:
        if self.retention_days <= 0:
            return False
        cutoff = now_utc() - timedelta(days=self.retention_days)
        kept = [r for r in self._items if getattr(r, self._time_field) >= cutoff]
        changed = len(kept) != len(self._items)
        self._items = kept
        return changed

    def _save(self) -> None:
        write_json_atomic(
            self.path, {"schema_version": SCHEMA_VERSION, self._key: [r.model_dump(mode="json") for r in self._items]}
        )

    def add(self, record: T) -> T:
        with self._lock:
            self._items.append(record)
            self._prune()
            self._save()
            return record

    def list(self, predicate: Callable[[T], bool] | None = None, newest_first: bool = True) -> list[T]:
        with self._lock:
            items = [r for r in self._items if predicate is None or predicate(r)]
        items.sort(key=lambda r: getattr(r, self._time_field), reverse=newest_first)
        return items

    def update_where(self, predicate: Callable[[T], bool], changes: dict) -> int:
        with self._lock:
            count = 0
            for i, record in enumerate(self._items):
                if predicate(record):
                    self._items[i] = record.model_copy(update=changes)
                    count += 1
            if count:
                self._save()
            return count

    def wipe(self) -> int:
        with self._lock:
            count = len(self._items)
            self._items = []
            if self.path.exists():
                self._save()
            return count
