"""In-memory chat context, keyed by session_id.

Privacy rules:
* Nothing here is ever written to disk or logged.
* At most ``max_turns`` turns are kept per session.
* A session is cleared after ``ttl_s`` seconds of inactivity, when the crew
  member changes (crew switch or bracelet identification), and on
  POST /session/reset. A background sweeper also drops expired sessions from
  memory so old context does not linger.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Turn:
    category: str
    user: str
    assistant: str


@dataclass
class Session:
    session_id: str
    crew_id: str | None
    last_active: float
    turns: deque[Turn] = field(default_factory=deque)


class SessionStore:
    def __init__(self, max_turns: int = 10, ttl_s: float = 600, clock: Callable[[], float] = time.monotonic):
        self.max_turns = max_turns
        self.ttl_s = ttl_s
        self._clock = clock
        self._lock = threading.Lock()
        self._sessions: dict[str, Session] = {}

    def _new(self, session_id: str, crew_id: str | None) -> Session:
        session = Session(session_id, crew_id, self._clock(), deque(maxlen=self.max_turns))
        self._sessions[session_id] = session
        return session

    def _expired(self, session: Session) -> bool:
        return self._clock() - session.last_active > self.ttl_s

    def open(self, session_id: str, crew_id: str | None = None) -> Session:
        """Get (or create) a session for a new message.

        Expired sessions start empty. A different, known ``crew_id`` is a crew
        switch: the context is cleared and the session is bound to the new crew
        member. ``crew_id=None`` keeps the crew already bound to the session.
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or self._expired(session):
                session = self._new(session_id, crew_id)
            elif crew_id is not None and crew_id != session.crew_id:
                session.turns.clear()
                session.crew_id = crew_id
            session.last_active = self._clock()
            return session

    def start_for_crew(self, session_id: str, crew_id: str) -> None:
        """Bracelet identification: always starts a fresh context bound to ``crew_id``."""
        with self._lock:
            self._new(session_id, crew_id)

    def add_turn(self, session_id: str, turn: Turn) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:  # it may have been reset meanwhile
                session.turns.append(turn)
                session.last_active = self._clock()

    def turns(self, session_id: str) -> list[Turn]:
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None or self._expired(session):
                return []
            return list(session.turns)

    def crew_of(self, session_id: str) -> str | None:
        with self._lock:
            session = self._sessions.get(session_id)
            return None if session is None or self._expired(session) else session.crew_id

    def reset(self, session_id: str) -> bool:
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def purge_expired(self) -> int:
        with self._lock:
            expired = [sid for sid, s in self._sessions.items() if self._expired(s)]
            for sid in expired:
                del self._sessions[sid]
            return len(expired)

    def clear_all(self) -> int:
        with self._lock:
            count = len(self._sessions)
            self._sessions.clear()
            return count

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)
