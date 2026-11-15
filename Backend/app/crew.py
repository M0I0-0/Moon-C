"""Simulated crew profiles (shared/crew.json). Identity and language only, no biometrics."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .schemas import SUPPORTED_LANGUAGES, CrewProfile


class CrewError(RuntimeError):
    pass


@dataclass(frozen=True)
class CrewMember:
    crew_id: str
    name: str
    bracelet_id: str
    preferredLanguage: str
    role: str | None = None

    def profile(self) -> CrewProfile:
        return CrewProfile(
            crew_id=self.crew_id, name=self.name, preferredLanguage=self.preferredLanguage, role=self.role
        )


def _bracelet_key(bracelet_id: str) -> str:
    return bracelet_id.strip().upper()


class CrewRegistry:
    def __init__(self, members: list[CrewMember]):
        self._by_id = {m.crew_id: m for m in members}
        self._by_bracelet = {_bracelet_key(m.bracelet_id): m for m in members}
        if len(self._by_id) != len(members) or len(self._by_bracelet) != len(members):
            raise CrewError("crew.json has duplicate crew_id or bracelet_id values")
        for m in members:
            if m.preferredLanguage not in SUPPORTED_LANGUAGES:
                raise CrewError(f"crew.json: unsupported preferredLanguage for {m.crew_id}")

    @classmethod
    def load(cls, path: Path) -> CrewRegistry:
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            members = [
                CrewMember(
                    crew_id=c["crew_id"],
                    name=c["name"],
                    bracelet_id=c["bracelet_id"],
                    preferredLanguage=c["preferredLanguage"],
                    role=c.get("role"),
                )
                for c in data["crew"]
            ]
        except FileNotFoundError as exc:
            raise CrewError(f"Crew file not found: {path}") from exc
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise CrewError(f"crew.json is malformed: {exc!r}") from exc
        return cls(members)

    def get(self, crew_id: str | None) -> CrewMember | None:
        return self._by_id.get(crew_id) if crew_id else None

    def by_bracelet(self, bracelet_id: str) -> CrewMember | None:
        return self._by_bracelet.get(_bracelet_key(bracelet_id))

    def all(self) -> list[CrewMember]:
        return list(self._by_id.values())
