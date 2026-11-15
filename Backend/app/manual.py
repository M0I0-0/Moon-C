"""Loads the health manual (shared/protocols.json) and serves localized views of it.

The manual is the single source of truth for indicators, ranges and protocols.
It is validated when the backend starts, so a broken file fails fast with a
clear message instead of producing wrong answers later.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .schemas import (
    INDICATORS,
    LANGUAGES,
    Band,
    IndicatorView,
    ManualView,
    ProtocolSummary,
    ProtocolView,
    RangeBands,
    RangeView,
    WhatToDo,
)

STATUSES = ("normal", "attention", "urgent")
_OR = {"en": " or ", "es": " o "}


class ManualError(RuntimeError):
    """The manual file is missing or malformed."""


def normalize_unit_text(unit: str) -> str:
    """Normalize a unit string for comparison: '°C', 'ºc' and ' deg C ' style variants."""
    return unit.strip().lower().replace("º", "°").replace(" ", "")


def format_number(value: float) -> str:
    """38.0 -> '38', 38.2 -> '38.2', 6.9 -> '6.9'."""
    return f"{value:g}"


def format_value(value: float, unit: str) -> str:
    """'38.2 °C', '95 %', '1/5'."""
    return f"{format_number(value)}{unit}" if unit.startswith("/") else f"{format_number(value)} {unit}"


def format_band(band: Band) -> str:
    if band.min is not None and band.max is not None:
        if band.min == band.max:
            return format_number(band.min)
        return f"{format_number(band.min)}–{format_number(band.max)}"
    for attr, symbol in (("lt", "<"), ("lte", "≤"), ("gt", ">"), ("gte", "≥"), ("min", "≥"), ("max", "≤")):
        bound = getattr(band, attr)
        if bound is not None:
            return f"{symbol} {format_number(bound)}"
    return "?"


@dataclass(frozen=True)
class IndicatorSpec:
    """Machine-readable part of an indicator (used by the evaluator)."""

    key: str
    unit: str
    unit_aliases: frozenset[str]
    valid_min: float
    valid_max: float
    integer_only: bool
    bands: RangeBands

    def canonical_unit(self, unit: str) -> str | None:
        """Return the canonical unit if ``unit`` is accepted for this indicator, else None."""
        return self.unit if normalize_unit_text(unit) in self.unit_aliases else None


class Manual:
    """In-memory, validated copy of the health manual."""

    def __init__(self, data: dict[str, Any]):
        self._data = data
        self._validate()
        self._specs = {key: self._build_spec(key) for key in INDICATORS}

    # ------------------------------------------------------------------ loading
    @classmethod
    def load(cls, path: Path) -> Manual:
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except FileNotFoundError as exc:
            raise ManualError(f"Health manual not found: {path}") from exc
        except json.JSONDecodeError as exc:
            raise ManualError(f"Health manual is not valid JSON: {path} ({exc})") from exc
        return cls(data)

    def _validate(self) -> None:
        data = self._data
        for section in ("manual", "indicators", "protocols"):
            if not isinstance(data.get(section), dict):
                raise ManualError(f"Manual is missing the '{section}' section")
        meta = data["manual"]
        for field in ("title", "mission", "disclaimer", "gap_policy"):
            self._require_languages(meta.get(field), f"manual.{field}")
        for field in ("version", "last_reviewed", "source", "ranges_warning"):
            if not meta.get(field):
                raise ManualError(f"Manual is missing manual.{field}")

        for key in INDICATORS:
            ind = data["indicators"].get(key)
            if not isinstance(ind, dict):
                raise ManualError(f"Manual is missing indicator '{key}'")
            where = f"indicators.{key}"
            for field in ("name", "explanation", "why_it_matters_in_space", "how_to_measure"):
                self._require_languages(ind.get(field), f"{where}.{field}")
            for field in ("unit", "unit_aliases", "valid_range", "ranges", "source", "version", "last_reviewed"):
                if field not in ind:
                    raise ManualError(f"Manual is missing {where}.{field}")
            for status in STATUSES:
                self._require_languages(ind.get("what_to_do", {}).get(status), f"{where}.what_to_do.{status}")
                bands = ind["ranges"].get(status)
                if not isinstance(bands, list) or not bands:
                    raise ManualError(f"Manual needs at least one band in {where}.ranges.{status}")
            urgent_protocol = ind.get("urgent_protocol")
            if urgent_protocol is not None and urgent_protocol not in data["protocols"]:
                raise ManualError(f"{where}.urgent_protocol '{urgent_protocol}' is not a protocol in the manual")

        for name, proto in data["protocols"].items():
            where = f"protocols.{name}"
            if proto.get("type") not in ("emergency", "guidance"):
                raise ManualError(f"{where}.type must be 'emergency' or 'guidance'")
            for field in ("title", "audience", "steps"):
                self._require_languages(proto.get(field), f"{where}.{field}")
            if "intro" in proto:
                self._require_languages(proto["intro"], f"{where}.intro")
            for field in ("source", "version", "last_reviewed"):
                if not proto.get(field):
                    raise ManualError(f"Manual is missing {where}.{field}")

    @staticmethod
    def _require_languages(value: Any, where: str) -> None:
        if not isinstance(value, dict) or any(not value.get(lang) for lang in LANGUAGES):
            raise ManualError(f"Manual needs non-empty {', '.join(LANGUAGES)} text in {where}")

    def _build_spec(self, key: str) -> IndicatorSpec:
        ind = self._data["indicators"][key]
        try:
            bands = RangeBands(**{status: [Band(**b) for b in ind["ranges"][status]] for status in STATUSES})
        except (TypeError, ValueError) as exc:
            raise ManualError(f"Invalid range band in indicators.{key}: {exc}") from exc
        for status in STATUSES:
            for band in getattr(bands, status):
                if all(v is None for v in band.model_dump().values()):
                    raise ManualError(f"Empty range band in indicators.{key}.ranges.{status}")
        aliases = {normalize_unit_text(a) for a in ind["unit_aliases"]} | {normalize_unit_text(ind["unit"])}
        return IndicatorSpec(
            key=key,
            unit=ind["unit"],
            unit_aliases=frozenset(aliases),
            valid_min=float(ind["valid_range"]["min"]),
            valid_max=float(ind["valid_range"]["max"]),
            integer_only=bool(ind.get("integer_only", False)),
            bands=bands,
        )

    # ------------------------------------------------------------------ accessors
    @property
    def version(self) -> str:
        return self._data["manual"]["version"]

    @property
    def source(self) -> str:
        return self._data["manual"]["source"]

    @property
    def ranges_warning(self) -> str:
        return self._data["manual"]["ranges_warning"]

    @property
    def protocol_names(self) -> list[str]:
        return list(self._data["protocols"])

    def has_indicator(self, key: str) -> bool:
        return key in self._specs

    def has_protocol(self, name: str) -> bool:
        return name in self._data["protocols"]

    def spec(self, key: str) -> IndicatorSpec:
        return self._specs[key]

    def indicator_name(self, key: str, lang: str) -> str:
        return _t(self._data["indicators"][key]["name"], lang)

    def indicator_source(self, key: str) -> str:
        return self._data["indicators"][key]["source"]

    def what_to_do(self, key: str, status: str, lang: str) -> list[str]:
        return list(_t(self._data["indicators"][key]["what_to_do"][status], lang))

    def meta_text(self, field: str, lang: str) -> str:
        return _t(self._data["manual"][field], lang)

    # ------------------------------------------------------------------ views
    def ranges_text(self, key: str, status: str, lang: str) -> str:
        spec = self._specs[key]
        joined = _OR.get(lang, _OR["en"]).join(format_band(b) for b in getattr(spec.bands, status))
        return joined if spec.unit.startswith("/") else f"{joined} {spec.unit}"

    def indicator_view(self, key: str, lang: str) -> IndicatorView:
        ind = self._data["indicators"][key]
        spec = self._specs[key]
        return IndicatorView(
            indicator=key,
            language=lang,
            name=_t(ind["name"], lang),
            unit=spec.unit,
            explanation=_t(ind["explanation"], lang),
            why_it_matters_in_space=_t(ind["why_it_matters_in_space"], lang),
            how_to_measure=list(_t(ind["how_to_measure"], lang)),
            ranges=RangeView(
                normal=self.ranges_text(key, "normal", lang),
                attention=self.ranges_text(key, "attention", lang),
                urgent=self.ranges_text(key, "urgent", lang),
                warning=self.ranges_warning,
                bands=spec.bands,
            ),
            what_to_do=WhatToDo(**{s: self.what_to_do(key, s, lang) for s in STATUSES}),
            urgent_protocol=ind.get("urgent_protocol"),
            source=ind["source"],
            version=ind["version"],
            last_reviewed=ind["last_reviewed"],
        )

    def protocol_view(self, name: str, lang: str) -> ProtocolView:
        proto = self._data["protocols"][name]
        return ProtocolView(
            name=name,
            type=proto["type"],
            language=lang,
            title=_t(proto["title"], lang),
            intro=_t(proto["intro"], lang) if "intro" in proto else None,
            audience=_t(proto["audience"], lang),
            steps=list(_t(proto["steps"], lang)),
            source=proto["source"],
            version=proto["version"],
            last_reviewed=proto["last_reviewed"],
        )

    def manual_view(self, lang: str) -> ManualView:
        meta = self._data["manual"]
        return ManualView(
            language=lang,
            title=_t(meta["title"], lang),
            version=meta["version"],
            last_reviewed=meta["last_reviewed"],
            review_status=meta.get("review_status", ""),
            source=meta["source"],
            mission=_t(meta["mission"], lang),
            disclaimer=_t(meta["disclaimer"], lang),
            ranges_warning=meta["ranges_warning"],
            gap_policy=_t(meta["gap_policy"], lang),
            indicators=[self.indicator_view(key, lang) for key in INDICATORS],
            protocols=[
                ProtocolSummary(name=name, type=p["type"], title=_t(p["title"], lang))
                for name, p in self._data["protocols"].items()
            ],
        )


def _t(texts: dict[str, Any], lang: str) -> Any:
    """Pick the text for ``lang``, falling back to English."""
    return texts.get(lang) or texts["en"]
