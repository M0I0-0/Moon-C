"""Shared router cases (shared/router_cases.json): the front-end offline detector runs the same cases."""

from __future__ import annotations

import json

import pytest

from app.config import REPO_DIR
from app.intent import KeywordRouter

CASES = json.loads((REPO_DIR / "shared" / "router_cases.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def router(shared_dir) -> KeywordRouter:
    return KeywordRouter.load(shared_dir / "keywords.json")


@pytest.mark.parametrize("case", CASES["emergency"], ids=lambda c: c["text"])
def test_shared_emergency_cases(router, case):
    intent = router.classify(case["text"])
    assert intent.category == "emergency"
    assert intent.protocol == case["protocol"]


@pytest.mark.parametrize("text", CASES["not_emergency"])
def test_shared_non_emergency_cases(router, text):
    assert router.classify(text).category != "emergency"


@pytest.mark.parametrize("group,confirm", [("safety", "safety"), ("negated", "negated"), ("pain", "pain")])
def test_shared_confirmation_cases(router, group, confirm):
    """Weak phrases, negations and pain without an exact phrase ask first: never a direct protocol."""
    for case in CASES[group]:
        intent = router.classify(case["text"])
        assert (intent.category, intent.confirm, intent.protocol) == ("ambiguous", confirm, case["protocol"]), case
