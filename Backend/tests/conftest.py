"""Shared pytest fixtures. Tests never touch backend/storage or a real Ollama."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import REPO_DIR, Settings
from app.manual import Manual

SHARED_DIR = REPO_DIR / "shared"


class FakeOllama:
    """Mock Ollama HTTP API. Records requests in memory so tests can inspect them."""

    def __init__(
        self,
        reply: str = "Good morning! Ready for a great day?",
        *,
        up: bool = True,
        chat_status: int = 200,
        delay: float = 0.0,
        done_reason: str = "stop",
        models: tuple[str, ...] = ("qwen3.5:4b",),
    ):
        self.reply = reply
        self.up = up
        self.chat_status = chat_status
        self.delay = delay
        self.done_reason = done_reason
        self.models = models
        self.requests: list[tuple[str, dict]] = []

    async def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        self.requests.append((request.url.path, body))
        if not self.up:
            raise httpx.ConnectError("Ollama is down", request=request)
        if self.delay:
            await asyncio.sleep(self.delay)
        path = request.url.path
        if path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": m, "model": m} for m in self.models]})
        if path == "/api/generate":
            return httpx.Response(200, json={"model": self.models[0], "done": True})
        if path == "/api/chat":
            if self.chat_status != 200:
                return httpx.Response(self.chat_status, json={"error": "model failure"})
            return httpx.Response(
                200,
                json={
                    "message": {"role": "assistant", "content": self.reply},
                    "done": True,
                    "done_reason": self.done_reason,
                },
            )
        return httpx.Response(404, json={"error": "not found"})

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handler)

    @property
    def chat_calls(self) -> list[dict]:
        return [body for path, body in self.requests if path == "/api/chat"]


@pytest.fixture(scope="session")
def shared_dir() -> Path:
    return SHARED_DIR


@pytest.fixture(scope="session")
def manual() -> Manual:
    return Manual.load(SHARED_DIR / "protocols.json")


@pytest.fixture
def storage_path(tmp_path) -> Path:
    return tmp_path / "storage" / "measurements.json"


@pytest.fixture
def settings(storage_path) -> Settings:
    return Settings(
        _env_file=None,
        shared_dir=SHARED_DIR,
        storage_path=storage_path,
        ollama_warmup=False,
        earth_link="offline",
    )


@pytest.fixture
def make_client(settings):
    """Factory: build a TestClient (startup and shutdown included).

    ``ollama`` is a FakeOllama; by default Ollama is down, so no test can reach a real model.
    """
    from app.main import create_app

    clients: list[TestClient] = []

    def _make(ollama: FakeOllama | None = None, **overrides) -> TestClient:
        app_settings = settings.model_copy(update=overrides) if overrides else settings
        ollama = ollama or FakeOllama(up=False)
        client = TestClient(create_app(app_settings, ollama_transport=ollama.transport))
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> TestClient:
    return make_client()
