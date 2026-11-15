"""Keyword router.

Classifies a message in this strict order:

1. ``emergency``  - checked with the keywords of *every* language, always (thoughts of
                    self-harm included: the ``emotional_crisis`` protocol). Only clear
                    phrases open a protocol directly. Weak phrases and word stems ("ahog-",
                    "me da un infarto"), a negated phrase ("no sangra") and chest or breathing
                    trouble without an exact phrase become an ``ambiguous`` intent with
                    ``confirm`` set: Moon-C asks a safety question first and only a "yes" opens
                    the protocol. Emergencies are never decided by the AI.
2. ``health``     - symptoms ("I feel sick"), with the indicator if one is named.
3. ``support``    - key mental-health moments: stress, frustration, a mistake, a conflict,
                    missing home, loneliness, low mood.
4. ``health``     - indicator names ("what is a normal pulse?").
5. ``ambiguous``  - vague discomfort ("I feel weird"): Moon-C asks a clarifying question.
6. ``small_talk`` - greetings, thanks, casual chat (the AI may answer).
7. ``fallback``   - nothing matched.

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


_BREAK_MARK = "xbreakx"
_BREAKS = re.compile(r"[,;.:!?¿¡()…\n\r]|\s[-–—]\s")
_LAUGH = re.compile(r"^(?:([jh][aeiou])\1+[jh]?|l+o+l+|lmao+|x+d+)$")


def tokenize(text: str) -> tuple[list[str], list[bool]]:
    """Tokens of the normalized text plus, for each token, whether a comma, period or similar
    punctuation sits right before it (negation does not cross punctuation: "No, sangra mucho")."""
    text = unicodedata.normalize("NFKD", text.casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = _APOSTROPHES.sub("", text)
    text = _BREAKS.sub(f" {_BREAK_MARK} ", text)
    text = _NON_WORD.sub(" ", text)
    tokens: list[str] = []
    breaks: list[bool] = []
    pending = False
    for word in text.split():
        if word == _BREAK_MARK:
            pending = True
            continue
        tokens.append(word)
        breaks.append(pending)
        pending = False
    return tokens, breaks


def _find_phrase(tokens: list[str], phrase: tuple[str, ...]) -> list[int]:
    n = len(phrase)
    return [i for i in range(len(tokens) - n + 1) if tuple(tokens[i : i + n]) == phrase]


_REPEATED = re.compile(r"(.)\1{2,}")
# Short real words one letter away from a greeting ("hora" ~ "hola"): never read as small talk.
_NOT_SMALL_TALK = frozenset({"hora", "horas", "hoja", "sola", "solo", "bola", "cola", "mola", "gracia"})


def _within_one_edit(a: str, b: str) -> bool:
    """True if ``a`` and ``b`` differ by at most one insertion, deletion or substitution."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    if len(a) == len(b):
        return a[i + 1 :] == b[i + 1 :]
    return a[i:] == b[i + 1 :]


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
    moment: str | None = None
    """Key mental-health moment (category ``support``)."""
    wound: str | None = None
    """Possible injury (category ``ambiguous``): ``check`` (cut: ask about bleeding), ``burn``, ``head``,
    ``fall``, ``twist`` (each asks its own question) or ``minor`` (it is minor)."""
    confirm: str | None = None
    """Safety question before any protocol (category ``ambiguous``, ``protocol`` says which one a "yes" opens):
    ``safety`` (weak phrase or bare call for help), ``negated`` (an emergency phrase with a negation)
    or ``pain`` (chest or breathing trouble without an exact phrase)."""


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
            nodes = {name: node for name, node in emergency.items() if not name.startswith("_")}
            self._not_negatable = {name for name, node in nodes.items() if node.get("negatable") is False}
            self._weak = [(name, kw) for name, node in nodes.items() for kw in _phrases(node.get("weak", {}))]
            self._stems = [(name, kw) for name, node in nodes.items() for kw in _phrases(node.get("stems", {}))]
            negation = data.get("negation", {})
            self._negators = set(_phrases(negation.get("negators", {})))
            self._fillers = set(_phrases(negation.get("fillers", {})))
            self._exempt = self._negators | set(_phrases(negation.get("exempt", {})))
            self._pain = [
                (
                    name,
                    _phrases(cfg.get("where", {})),
                    _phrases(cfg.get("feel", {})),
                    set(_phrases(cfg.get("feel_words", {}))),
                )
                for name, cfg in data.get("pain_question", {}).items()
                if not name.startswith("_")
            ]
            safety_help = data.get("safety_help", {})
            self._safety_help = [("safety", kw) for kw in _phrases(safety_help)]
            self._safety_protocol = safety_help.get("protocol", "general_emergency")
            self._help = [("help", kw) for kw in _phrases(data.get("help", {}))]
            self._ack = [("ack", kw) for kw in _phrases(data.get("ack", {}))]
            followup = data.get("followup", {})
            self._yes = set(_phrases(followup.get("yes", {})))
            self._no = set(_phrases(followup.get("no", {})))
            self._heavy = _phrases(followup.get("heavy", {}))
            self._light = _phrases(followup.get("light", {}))
            self._indicators = [
                (name, kw) for name, node in health["indicators"].items() if not name.startswith("_")
                for kw in _phrases(node)
            ]
            self._symptoms = [("symptom", kw) for kw in _phrases(health["symptoms"])]
            self._support = [
                (name, kw) for name, node in data.get("support", {}).items() if not name.startswith("_")
                for kw in _phrases(node)
            ]
            self._ambiguous = [("ambiguous", kw) for kw in _phrases(data["ambiguous"])]
            wound = data.get("wound", {})
            self._wound = [("wound", kw) for kw in _phrases(wound.get("phrases", {}))]
            self._wound_stems = _phrases(wound.get("stems", {}))
            self._wound_exclude = sorted(_phrases(wound.get("exclude", {})), key=len, reverse=True)
            self._wound_kinds = [
                (name, _phrases(node)) for name, node in wound.get("kinds", {}).items() if not name.startswith("_")
            ]
            self._wound_minor = [("minor", kw) for kw in _phrases(data.get("wound_minor", {}))]
            self._small_talk = [
                (name, kw) for name, node in data["small_talk"].items() if not name.startswith("_")
                for kw in _phrases(node)
            ]
            self._allow = sorted(_phrases(data.get("post_filter_allow", {})), key=len, reverse=True)
            self._block = [("label", kw) for kw in _phrases(data.get("post_filter_block", {}))]
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

    @property
    def support_moments(self) -> set[str]:
        return {name for name, _ in self._support}

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

    # ------------------------------------------------------------------ emergency scan
    def _negated(self, tokens: list[str], breaks: list[bool], start: int) -> bool:
        """A negator at most 3 words before ``start``, with only filler words between and no punctuation."""
        j = start
        for _ in range(3):
            if j == 0 or breaks[j]:
                return False
            j -= 1
            if tokens[j] in self._negators:
                return True
            if tokens[j] not in self._fillers:
                return False
        return False

    def _scan_emergency(self, tokens: list[str], breaks: list[bool]) -> tuple[str, str] | None:
        """("direct" | "safety" | "negated", protocol) or None.

        Direct: a clear phrase, not negated. Safety: a weak phrase or word stem. Negated: only negated
        hits. Thoughts of self-harm are never negated (``negatable: false``), and a phrase that already
        contains a negation or a "cant" ("no puedo respirar") is the symptom itself.
        """

        covered: set[int] = set()  # tokens inside a phrase hit: a stem must not re-read them ("no me da un infarto")

        def hits(table: list[tuple[str, str]], stem: bool = False) -> tuple[list, list]:
            plain: list[tuple[int, int, str]] = []
            negated: list[tuple[int, int, str]] = []
            for protocol, kw in table:
                words = tuple(kw.split())
                if stem:
                    starts = [i for i, t in enumerate(tokens) if t.startswith(kw) and i not in covered]
                else:
                    starts = _find_phrase(tokens, words)
                    for i in starts:
                        covered.update(range(i, i + len(words)))
                for i in starts:
                    is_neg = (
                        protocol not in self._not_negatable
                        and not (set(words) & self._exempt)
                        and self._negated(tokens, breaks, i)
                    )
                    (negated if is_neg else plain).append((i, -len(kw), protocol))
            return sorted(plain), sorted(negated)

        strong, strong_neg = hits(self._emergency)
        if strong:
            return "direct", strong[0][2]
        general, general_neg = hits(self._emergency_fallback)
        if general:
            return "direct", general[0][2]
        weak, weak_neg = hits(self._weak)
        stem, stem_neg = hits(self._stems, stem=True)
        soft = sorted(weak + stem)
        if soft:
            return "safety", soft[0][2]
        negated = sorted(strong_neg + general_neg + weak_neg + stem_neg)
        if negated:
            return "negated", negated[0][2]
        return None

    def _scan_pain(self, tokens: list[str], breaks: list[bool]) -> tuple[str, str] | None:
        """Chest or breathing discomfort without an exact phrase: ("pain" | "negated", protocol)."""
        for protocol, where, feel, feel_words in self._pain:
            where_at = {i for i, t in enumerate(tokens) if any(t.startswith(w) for w in where)}
            feel_at = [
                i for i, t in enumerate(tokens)
                if i not in where_at and (t in feel_words or any(t.startswith(f) for f in feel))
            ]
            if where_at and feel_at:
                if all(self._negated(tokens, breaks, i) for i in feel_at):
                    return "negated", protocol
                return "pain", protocol
        return None

    def classify(self, text: str) -> Intent:
        """Classify a message. Language independent: every language's keywords are checked."""
        normalized = normalize(text)
        if not normalized:
            if any(unicodedata.category(ch) == "So" for ch in text):  # emoji only
                return Intent("small_talk", small_talk_type="ack")
            return Intent("fallback")
        padded = f" {normalized} "
        tokens, breaks = tokenize(text)

        scan = self._scan_emergency(tokens, breaks)
        if scan:
            kind, protocol = scan
            if kind == "direct":
                return Intent("emergency", protocol=protocol)
            return Intent("ambiguous", protocol=protocol, confirm=kind)

        if len(tokens) <= 4 and self._best(padded, self._safety_help):
            return Intent("ambiguous", protocol=self._safety_protocol, confirm="safety")

        pain = self._scan_pain(tokens, breaks)
        if pain:
            return Intent("ambiguous", protocol=pain[1], confirm=pain[0])

        # Idioms ("golpe de suerte", "burned out") must not open the injury flow.
        wound_padded = padded
        for phrase in self._wound_exclude:
            wound_padded = wound_padded.replace(f" {phrase} ", " ")
        wound_tokens = wound_padded.split()

        if self._best(wound_padded, self._wound_minor):
            return Intent("ambiguous", wound="minor")
        if self._best(wound_padded, self._wound) or any(
            w.startswith(stem) for w in wound_tokens for stem in self._wound_stems
        ):
            return Intent("ambiguous", wound=self._wound_kind(wound_tokens))

        indicator = self._best(padded, self._indicators)
        symptom = self._best(padded, self._symptoms)
        if symptom:
            return Intent("health", indicator=indicator.group if indicator else None, symptom=True)

        moment = self._best(padded, self._support)
        if moment:
            return Intent("support", moment=moment.group)

        if indicator:
            return Intent("health", indicator=indicator.group)

        if self._best(padded, self._ambiguous):
            return Intent("ambiguous")

        if len(tokens) <= 4 and self._best(padded, self._help):
            return Intent("small_talk", small_talk_type="help")

        small_talk = self._best(padded, self._small_talk)
        if small_talk:
            return Intent("small_talk", small_talk_type=small_talk.group)

        if len(tokens) <= 3 and (self._best(padded, self._ack) or any(_LAUGH.match(t) for t in tokens)):
            return Intent("small_talk", small_talk_type="ack")

        typo = self._fuzzy_small_talk(normalized)
        if typo:
            return Intent("small_talk", small_talk_type=typo)

        return Intent("fallback")

    def answer(self, text: str, graded: bool = True) -> str | None:
        """Read a reply to one of Moon-C's questions: "yes", "no" or None (not understood).

        ``graded`` also understands degrees ("poco", "no mucho", "bastante", "es leve"): a heavy word is
        "yes" unless negated just before ("no es grave"), a light word is "no". Plain yes/no questions skip
        that. Otherwise the first word decides ("Sí, ...", "No, ..."); "no sé" is not an answer.
        """
        tokens, breaks = tokenize(text)
        if not tokens:
            return None
        if graded:
            for i, token in enumerate(tokens):
                if any(token.startswith(stem) for stem in self._heavy):
                    return "no" if self._negated(tokens, breaks, i) else "yes"
            if any(token.startswith(stem) for token in tokens for stem in self._light):
                return "no"
        first = tokens[0]
        if first in self._yes:
            return "yes"
        if first in self._no and tokens[1:2] != ["se"]:
            return "no"
        return None

    def _wound_kind(self, words: list[str]) -> str:
        """Which follow-up question the injury gets (first kind in keywords.json with a hit)."""
        for name, stems in self._wound_kinds:
            if any(w.startswith(stem) for w in words for stem in stems):
                return "check" if name == "cut" else name
        return "check"

    def _fuzzy_small_talk(self, normalized: str) -> str | None:
        """Greeting, thanks or farewell with a typo ("ola", "holaaa", "grcias").

        Only for very short messages (up to 3 words) that matched nothing else, and never for
        health or emergency words: a typo must not turn a real message into a greeting.
        """
        words = _REPEATED.sub(r"\1", normalized).split()
        if not words or len(words) > 3:
            return None
        for word in words:
            if len(word) < 3 or word in _NOT_SMALL_TALK:
                continue
            for group, kw in self._small_talk:
                if " " not in kw and len(kw) >= 4 and _within_one_edit(word, kw):
                    return group
        return None

    def mentions_health_or_emergency(self, text: str) -> bool:
        """Post-filter for AI replies: True if the text touches health or emergency topics.

        Everyday pleasantries listed in ``post_filter_allow`` ("sleep well") are
        removed first so they do not trigger the filter. Labels listed in
        ``post_filter_block`` ("depression", "disorder") always trigger it: talking
        about feelings is fine, naming conditions is not (Moon-C does not diagnose).
        """
        padded = f" {normalize(text)} "
        for phrase in self._allow:
            target = f" {phrase} "
            while target in padded:  # loop: str.replace skips back-to-back repeats
                padded = padded.replace(target, " ")
        return any(
            self._best(padded, table)
            for table in (self._emergency, self._emergency_fallback, self._indicators, self._symptoms, self._block)
        )
