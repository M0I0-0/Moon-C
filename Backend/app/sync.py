"""Earth sync queue (simulated).

Priority 3: send data to Earth in the background when a link is available.
Nothing here ever blocks the crew. Syncing happens in a background task while
the (simulated) link is online, or on demand with POST /sync/simulate. This
prototype does not transmit anything: it only marks measurements as synced.

Only confirmed (assigned) measurements are sent; unassigned readings wait
until a crew member confirms them.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from datetime import datetime

from .records import RecordStore
from .schemas import EarthLink, ManeuverReport, SyncResult, SyncStatus
from .storage import MeasurementStore, now_utc

log = logging.getLogger("moon_c.sync")


class EarthSync:
    def __init__(
        self,
        store: MeasurementStore,
        link: EarthLink = "offline",
        reports: RecordStore[ManeuverReport] | None = None,
    ):
        self.store = store
        self.reports = reports
        self.link: EarthLink = link
        self.last_sync: datetime | None = None
        self._lock = threading.Lock()

    def status(self) -> SyncStatus:
        pending, awaiting = self.store.sync_counts()
        pending_reports = len(self.reports.list(lambda r: not r.synced)) if self.reports else 0
        return SyncStatus(
            earth_link=self.link,
            pending=pending,
            awaiting_assignment=awaiting,
            pending_reports=pending_reports,
            last_sync=self.last_sync,
        )

    def flush(self) -> SyncResult:
        """Simulate a contact window with Earth: pending measurements and maneuver reports are marked as synced."""
        with self._lock:
            synced = self.store.mark_synced()
            synced_reports = self.reports.update_where(lambda r: not r.synced, {"synced": True}) if self.reports else 0
            self.last_sync = now_utc()
        status = self.status()
        if synced or synced_reports:
            log.info("Earth sync: %d measurements and %d maneuver reports marked as synced.", synced, synced_reports)
        return SyncResult(**status.model_dump(), synced_count=synced, synced_reports=synced_reports)

    async def run(self, interval_s: float) -> None:
        """Background loop: while the link is online, sync pending data. File I/O runs off the event loop."""
        while True:
            await asyncio.sleep(interval_s)
            if self.link == "online":
                try:
                    await asyncio.to_thread(self.flush)
                except OSError as exc:  # keep trying on the next window
                    log.warning("Earth sync failed (%s); will retry.", type(exc).__name__)
