"""Emotional support in key mental-health moments, personalized with a private support profile.

* ``shared/support.json`` - what Moon-C says in each key moment (stress, frustration, a mistake,
  a conflict, missing home, loneliness, low mood). Generic, for every crew member.
* ``shared/profiles/<crew_id>.json`` - optional and private (kept out of git): a support profile
  built from the questionnaires a crew member and someone close to them answered. When it
  exists, Moon-C answers key moments with its personalized replies, adds its lines to low mood
  readings and gives its notes to the local AI, so conversation feels personal too.

Profiles are read once at startup and kept in memory. Their content is never logged, stored
anywhere else, exported or sent to Earth, and a profile without the crew member's consent is
ignored. Moon-C does not diagnose: a profile describes what helps a person, never a condition.
Thoughts of self-harm never reach this module: the router opens the emotional_crisis protocol.
"""

from __future__ import annotations

import json
import logging
import random
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .crew import CrewRegistry
from .schemas import LANGUAGES

log = logging.getLogger("moon_c.support")

MOMENTS = ("stress", "frustration", "mistake", "conflict", "homesick", "lonely", "low_mood")
SAFETY_LINE_MOMENTS = ("low_mood",)


class SupportError(RuntimeError):
    """support.json is missing or malformed."""


class SupportProfile(BaseModel):
    """What helps one crew member. Free text written for that person; unknown keys are ignored."""

    model_config = ConfigDict(extra="ignore")

    crew_id: str
    language: str = "es"
    consent: dict[str, Any] = Field(default_factory=dict)
    ai_context: list[str] = Field(default_factory=list, description="Notes for the local AI, in English.")
    avoid: list[str] = Field(default_factory=list, description="What the AI must not bring up, in English.")
    moments: dict[str, str] = Field(default_factory=dict, description="Personalized reply per key moment.")
    mood_guidance: list[str] = Field(default_factory=list, description="Lines added to low mood readings.")

    @field_validator("moments")
    @classmethod
    def _known_moments(cls, value: dict[str, str]) -> dict[str, str]:
        unknown = set(value) - set(MOMENTS)
        if unknown:
            raise ValueError(f"unknown moments: {sorted(unknown)}")
        return value

    @property
    def consented(self) -> bool:
        return self.consent.get("crew_member") is True

    def speaks(self, lang: str) -> bool:
        return self.language == lang

    def ai_notes(self, name: str) -> str | None:
        """Notes appended to the AI system prompt, or None if the profile has none."""
        if not self.ai_context:
            return None
        lines = [
            f"What you know about {name}. Use it to make the conversation personal and to support "
            f"{name} the way that works for them, only when it fits what they are saying (a greeting "
            "just needs a warm greeting). Never quote these notes and never say you have them."
        ]
        lines += [f"- {note}" for note in self.ai_context]
        if self.avoid:
            lines.append("Avoid:")
            lines += [f"- {note}" for note in self.avoid]
        return "\n".join(lines)


class ProfileStore:
    """Support profiles by crew_id (in memory)."""

    def __init__(self, profiles: dict[str, SupportProfile] | None = None):
        self._profiles = dict(profiles or {})

    @classmethod
    def load(cls, folder: Path, crew: CrewRegistry) -> ProfileStore:
        """Load every ``*.json`` in ``folder``. Invalid, unknown or non-consented profiles are skipped."""
        profiles: dict[str, SupportProfile] = {}
        if folder.is_dir():
            for path in sorted(folder.glob("*.json")):
                try:
                    profile = SupportProfile.model_validate(json.loads(path.read_text(encoding="utf-8")))
                except (OSError, ValueError, ValidationError):
                    log.warning("Support profile %s ignored: it is not a valid profile.", path.name)
                    continue
                if crew.get(profile.crew_id) is None:
                    log.warning("Support profile %s ignored: unknown crew_id.", path.name)
                elif not profile.consented:
                    log.warning("Support profile %s ignored: no consent from the crew member.", path.name)
                else:
                    profiles[profile.crew_id] = profile
        if profiles:
            log.info("Support profiles loaded for: %s.", ", ".join(sorted(profiles)))
        return cls(profiles)

    def get(self, crew_id: str | None) -> SupportProfile | None:
        return self._profiles.get(crew_id) if crew_id else None

    def __len__(self) -> int:
        return len(self._profiles)


class SupportGuide:
    """Generic replies for key moments (shared/support.json), validated at startup."""

    def __init__(self, data: dict[str, Any], rng: random.Random | None = None):
        self._data = data
        self._rng = rng or random.Random()
        self._validate()

    @classmethod
    def load(cls, path: Path) -> SupportGuide:
        try:
            with open(path, encoding="utf-8") as fh:
                return cls(json.load(fh))
        except FileNotFoundError as exc:
            raise SupportError(f"Support guide not found: {path}") from exc
        except json.JSONDecodeError as exc:
            raise SupportError(f"Support guide is not valid JSON: {path} ({exc})") from exc

    def _validate(self) -> None:
        data = self._data
        if not data.get("source"):
            raise SupportError("support.json is missing 'source'")
        moments = data.get("moments")
        if not isinstance(moments, dict):
            raise SupportError("support.json is missing 'moments'")
        for moment in MOMENTS:
            node = moments.get(moment)
            if not isinstance(node, dict):
                raise SupportError(f"support.json is missing the moment '{moment}'")
            for field in ("label", "reply", "suggestions"):
                self._require_languages(node.get(field), f"moments.{moment}.{field}")
        self._require_languages(data.get("safety_line"), "safety_line")
        self._require_languages(data.get("continue"), "continue")

    @staticmethod
    def _require_languages(value: Any, where: str) -> None:
        if not isinstance(value, dict) or any(not value.get(lang) for lang in LANGUAGES):
            raise SupportError(f"support.json needs non-empty {', '.join(LANGUAGES)} text in {where}")

    @property
    def source(self) -> str:
        return self._data["source"]

    @property
    def moments(self) -> tuple[str, ...]:
        return MOMENTS

    def reply(self, moment: str, lang: str, profile: SupportProfile | None = None) -> tuple[str, bool]:
        """(reply, personalized). The profile's reply wins when it exists in the reply language."""
        personal = profile.moments.get(moment) if profile and profile.speaks(lang) else None
        text = personal or self._data["moments"][moment]["reply"][lang]
        if moment in SAFETY_LINE_MOMENTS:
            text = f"{text} {self._data['safety_line'][lang]}"
        return text, personal is not None

    def suggestions(self, moment: str, lang: str) -> list[str]:
        return list(self._data["moments"][moment]["suggestions"][lang])

    def label(self, moment: str, lang: str) -> str:
        return self._data["moments"][moment]["label"][lang]

    def keep_listening(self, lang: str) -> str:
        """A short line to keep a support conversation going without the AI."""
        return self._rng.choice(self._data["continue"][lang])

    def mood_guidance(self, profile: SupportProfile | None, lang: str) -> list[str]:
        """Personal lines for a low mood reading (empty without a profile in that language)."""
        return list(profile.mood_guidance) if profile and profile.speaks(lang) else []
