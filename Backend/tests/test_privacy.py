"""Privacy: chat text is never persisted or logged; only measurement fields reach the disk."""

from __future__ import annotations

import json
import logging

from conftest import FakeOllama

ALLOWED_KEYS = {"id", "crew_id", "indicator", "value", "unit", "status", "timestamp", "synced"}
MESSAGES = [
    "Good morning, Moon-C",
    "I have chest pain",
    "What is a normal pulse?",
    "I feel weird",
    "My secret phrase is zebra-42",
    "Buenos días, me siento raro",
]


def test_measurements_file_contains_no_chat_text(make_client, storage_path, caplog):
    ollama = FakeOllama(reply="Morning! Ready for a great day?")
    client = make_client(ollama)
    with caplog.at_level(logging.DEBUG):
        for i, message in enumerate(MESSAGES):
            res = client.post("/chat", json={"session_id": "s", "crew_id": "ana", "message": message})
            assert res.status_code == 200
            client.post("/measurements", json={"crew_id": "ana", "indicator": "heart_rate", "value": 70 + i, "unit": "bpm"})
        client.post("/measurements", json={"indicator": "mood", "value": 4, "unit": "/5"})

    stored = storage_path.read_text(encoding="utf-8")
    for message in MESSAGES:
        assert message.lower() not in stored.lower()
    for fragment in ("zebra", "morning", "chest", "secret", "raro", "Ready for a great day"):
        assert fragment.lower() not in stored.lower()
    records = json.loads(stored)["measurements"]
    assert len(records) == len(MESSAGES) + 1
    assert all(set(record) == ALLOWED_KEYS for record in records)

    # Nothing from the conversation reached the logs either (ours, httpx's or anyone else's).
    for message in MESSAGES:
        assert message not in caplog.text
    assert "zebra" not in caplog.text
    assert "Ready for a great day" not in caplog.text

    # No other file was written (no transcripts, no temp files left behind).
    assert sorted(p.name for p in storage_path.parent.iterdir()) == ["measurements.json"]


def test_chat_alone_writes_nothing_to_disk(make_client, storage_path):
    client = make_client()
    for message in MESSAGES:
        client.post("/chat", json={"session_id": "s", "message": message})
    assert not storage_path.exists()
    assert list(storage_path.parent.iterdir()) == []
