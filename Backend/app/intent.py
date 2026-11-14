"""Keyword router.

Classifies a message in this strict order:

1. ``emergency``  - checked with the keywords of *every* language, always.
2. ``health``     - indicator names or symptoms.
3. ``ambiguous``  - vague discomfort ("I feel weird"): Moon-C asks a clarifying question.
4. ``small_talk`` - greetings, thanks, casual chat (the only category that may use the AI).
5. ``fallback``   - nothing matched.

All keywords live in shared/keywords.json. Matching is deterministic and
offline: the text and the keywords are normalized the same way, keywords match
whole words only, and the earliest match wins (ties go to the longest keyword).
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .schemas import INDICATORS, Category

_APOSTROPHES = re.compile(r"['’‘`´ʼ]")
_NON_WORD = re.compile(r"[^\w\s]|_")


def normalize(text: str) -> str:
    """Lowercase, remove accents and apostrophes, turn other punctuation into spaces.

    >>> normalize("¡No puedo RESPIRAR! Can't breathe… SpO₂?")
    'no puedo respirar cant breathe spo2'
    """
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _APOSTROPHES.sub("", text)
    text = _NON_WORD.sub(" ", text)
    return " ".join(text.split())


class KeywordsError(RuntimeError):
    """keywords.json is missing or malformed."""


@dataclass(frozen=True)
class Match:
    group: str
    keyword: str
    position: int


@dataclass(frozen=True)
class Intent:
    category: Category
    protocol: str | None = None
    """Emergency protocol name (category ``emergency``)."""
    indicator: str | None = None
    """Indicator the message is about (category ``health``)."""
    symptom: bool = False
    """The message describes feeling unwell (category ``health``)."""
    small_talk_type: str | None = None
    """greeting, thanks, farewell or casual (category ``small_talk``)."""


def _phrases(node: Any) -> list[str]:
    """Collect keyword lists of every language from a {"en": [...], "es": [...]} node."""
    if not isinstance(node, dict):
        raise KeywordsError("Expected an object with one keyword list per language")
    out: list[str] = []
    for key, value in node.items():
        if key.startswith("_") or not isinstance(value, list):
            continue
        out.extend(normalize(str(v)) for v in value)
    return [p for p in dict.fromkeys(out) if p]


class KeywordRouter:
    """Loads keywords.json and classifies messages."""

    def __init__(self, data: dict[str, Any]):
        try:
            emergency = data["emergency"]
            health = data["health"]
            self._emergency = [
                (name, kw) for name, node in emergency.items() if not name.startswith("_") and not node.get("fallback")
                for kw in _phrases(node)
            ]
            self._emergency_fallback = [
                (name, kw) for name, node in emergency.items() if not name.startswith("_") and node.get("fallback")
                for kw in _phrases(node)
            ]
            self._indicators = [
                (name, kw) for name, node in health["indicators"].items() if not name.startswith("_")
                for kw in _phrases(node)
            ]
            self._symptoms = [("symptom", kw) for kw in _phrases(health["symptoms"])]
            self._ambiguous = [("ambiguous", kw) for kw in _phrases(data["ambiguous"])]
            self._small_talk = [
                (name, kw) for name, node in data["small_talk"].items() if not name.startswith("_")
                for kw in _phrases(node)
            ]
            self._allow = sorted(_phrases(data.get("post_filter_allow", {})), key=len, reverse=True)
        except (KeyError, AttributeError, TypeError) as exc:
            raise KeywordsError(f"keywords.json is malformed: {exc!r}") from exc

        unknown = {name for name, _ in self._indicators} - set(INDICATORS)
        if unknown:
            raise KeywordsError(f"keywords.json has unknown indicators: {sorted(unknown)}")
        if not self._emergency:
            raise KeywordsError("keywords.json has no emergency keywords")

    @classmethod
    def load(cls, path: Path) -> KeywordRouter:
        try:
            with open(path, encoding="utf-8") as fh:
                return cls(json.load(fh))
        except FileNotFoundError as exc:
            raise KeywordsError(f"Keywords file not found: {path}") from exc
        except json.JSONDecodeError as exc:
            raise KeywordsError(f"Keywords file is not valid JSON: {path} ({exc})") from exc

    @property
    def emergency_protocols(self) -> set[str]:
        return {name for name, _ in self._emergency + self._emergency_fallback}

    # ------------------------------------------------------------------ matching
    @staticmethod
    def _best(padded: str, table: list[tuple[str, str]]) -> Match | None:
        best: Match | None = None
        for group, kw in table:
            pos = padded.find(f" {kw} ")
            if pos < 0:
                continue
            if best is None or pos < best.position or (pos == best.position and len(kw) > len(best.keyword)):
                best = Match(group, kw, pos)
        return best

    def classify(self, text: str) -> Intent:
        """Classify a message. Language independent: every language's keywords are checked."""
        normalized = normalize(text)
        if not normalized:
            return Intent("fallback")
        padded = f" {normalized} "

        emergency = self._best(padded, self._emergency) or self._best(padded, self._emergency_fallback)
        if emergency:
            return Intent("emergency", protocol=emergency.group)

        indicator = self._best(padded, self._indicators)
        symptom = self._best(padded, self._symptoms)
        if indicator or symptom:
            return Intent("health", indicator=indicator.group if indicator else None, symptom=symptom is not None)

        if self._best(padded, self._ambiguous):
            return Intent("ambiguous")

        small_talk = self._best(padded, self._small_talk)
        if small_talk:
            return Intent("small_talk", small_talk_type=small_talk.group)

        return Intent("fallback")

    def mentions_health_or_emergency(self, text: str) -> bool:
        """Post-filter for AI replies: True if the text touches health or emergency topics.

        Everyday pleasantries listed in ``post_filter_allow`` ("sleep well") are
        removed first so they do not trigger the filter.
        """
        padded = f" {normalize(text)} "
        for phrase in self._allow:
            target = f" {phrase} "
            while target in padded:  # loop: str.replace skips back-to-back repeats
                padded = padded.replace(target, " ")
        return any(
            self._best(padded, table)
            for table in (self._emergency, self._emergency_fallback, self._indicators, self._symptoms)
        )
