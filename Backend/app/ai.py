"""Local AI (Ollama) for conversation: small talk and listening, never health answers.

The model never answers health or emergency questions: those are routed to the
manual before the AI is ever called. It may keep a conversation going after a
key mental-health moment (listening, encouraging), and when the crew member has
a private support profile its notes are added to the system prompt so the
conversation is personal. If Ollama is down, slow or returns an
error, Moon-C answers with a canned reply and ``ai_used`` is false. Every AI
reply goes through a post-filter; if it mentions health or emergency keywords
it is discarded and the message is answered from the manual instead. A reply
in a language other than the one asked for is replaced by a canned reply.

Nothing sent to or received from the model is logged or stored.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re

import httpx

from .config import Settings
from .intent import KeywordRouter
from .sessions import Turn

log = logging.getLogger("moon_c.ai")

SYSTEM_PROMPT = (
    "You are Moon-C, a warm companion on board a space mission. You are female. "
    "Keep every reply to 1–2 short sentences, warm and natural; never write lists. "
    "You may greet, encourage and chat, and you can listen when someone is having a hard time: "
    "acknowledge their feelings, never judge, and if things feel very heavy, encourage them to talk "
    "with a crewmate they trust or the on-board medical officer. "
    "Never discuss health, symptoms or measurements; if they come up, say you will check the manual. "
    "Never invent facts about the crew member. "
    "Never diagnose and never use labels or names of conditions for how someone feels."
)

# The reply language is decided before the AI is called (the crew member's language, or the
# message's on the General account), so the model must never switch: the response's `language`
# tells the front-end which voice reads it. Moon-C is female: in Spanish she speaks about
# herself in the feminine.
_LANGUAGE_LINE = {
    "en": "Always reply in English, even if the crew member writes in another language.",
    "es": "Responde siempre en español, aunque te escriban en otro idioma, y usa el femenino al hablar de ti misma.",
}

CANNED_REPLIES: dict[str, dict[str, list[str]]] = {
    "en": {
        "greeting": [
            "Good to hear from you! I'm here whenever you need me.",
            "Hello! It's good to have you here. How is your day going?",
            "Hi there! Ready when you are.",
            "Hey! Nice to see you. What's on your mind?",
            "Hello! I'm right here with you, as always.",
        ],
        "thanks": [
            "You're welcome! I'm always here.",
            "Anytime. That's what I'm here for.",
            "Happy to help!",
            "No problem at all. We're a team.",
        ],
        "farewell": [
            "See you soon! I'll be right here.",
            "Bye for now. Take care out there!",
            "Talk later! I'm here whenever you need me.",
        ],
        "casual": [
            "I'm Moon-C, your on-board companion. I'm doing well, thanks for asking!",
            "I'm always happy to chat. What would you like to talk about?",
            "That sounds good. I'm here if you want to keep talking.",
            "I'm listening. Tell me more whenever you like.",
            "Every day out here is part of something big. I'm glad to be on this mission with you.",
        ],
    },
    "es": {
        "greeting": [
            "¡Qué gusto saludarte! Aquí estoy para lo que necesites.",
            "¡Hola! Me alegra tenerte por aquí. ¿Cómo va tu día?",
            "¡Hola! Lista cuando tú lo estés.",
            "¡Hey! Qué bueno verte. ¿Qué tienes en mente?",
            "¡Hola! Aquí estoy contigo, como siempre.",
        ],
        "thanks": [
            "¡De nada! Siempre estoy aquí.",
            "Cuando quieras. Para eso estoy.",
            "¡Con gusto!",
            "No hay de qué. Somos un equipo.",
        ],
        "farewell": [
            "¡Hasta pronto! Aquí estaré.",
            "Nos vemos. ¡Cuídate mucho!",
            "¡Hablamos luego! Estoy aquí cuando me necesites.",
        ],
        "casual": [
            "Soy Moon-C, tu compañera a bordo. ¡Estoy muy bien, gracias por preguntar!",
            "Siempre me gusta conversar. ¿De qué quieres hablar?",
            "Suena bien. Aquí sigo si quieres seguir conversando.",
            "Te escucho. Cuéntame más cuando quieras.",
            "Cada día aquí es parte de algo grande. Me alegra estar en esta misión contigo.",
        ],
    },
}

_THINK_BLOCK = re.compile(r"<think>.*?(</think>|$)", re.DOTALL | re.IGNORECASE)
_SENTENCE_END = re.compile(r"[.!?…](?=[\"')\]]*\s|[\"')\]]*$)")


def clean_reply(text: str, truncated: bool = False) -> str:
    """Remove reasoning tags and whitespace; if the model hit the token limit, cut at the last full sentence."""
    text = " ".join(_THINK_BLOCK.sub(" ", text).split()).strip().strip('"').strip()
    if truncated:
        ends = list(_SENTENCE_END.finditer(text))
        if ends:
            text = text[: ends[-1].end()].strip()
    return text


def build_system_prompt(lang: str, crew_name: str | None, notes: str | None = None) -> str:
    """System prompt. ``notes`` come from the crew member's private support profile (never logged)."""
    lines = [SYSTEM_PROMPT, _LANGUAGE_LINE.get(lang, _LANGUAGE_LINE["en"])]
    if crew_name:
        lines.append(f"The crew member's name is {crew_name}.")
    prompt = " ".join(lines)
    return f"{prompt}\n\n{notes}" if notes else prompt


def is_safe_small_talk(reply: str, router: KeywordRouter) -> bool:
    """Post-filter: False if an AI reply touches health or emergency topics."""
    return not router.mentions_health_or_emergency(reply)


class OllamaClient:
    """Async client for a local Ollama server."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self._http = httpx.AsyncClient(
            base_url=settings.ollama_url, transport=transport, timeout=settings.ollama_timeout_s
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def status(self) -> tuple[bool, bool]:
        """(reachable, model_available)."""
        try:
            res = await self._http.get("/api/tags", timeout=self.settings.ollama_status_timeout_s)
            res.raise_for_status()
            models = res.json().get("models", [])
        except (httpx.HTTPError, ValueError, AttributeError):
            return False, False
        names = {m.get("name") for m in models if isinstance(m, dict)} | {
            m.get("model") for m in models if isinstance(m, dict)
        }
        model = self.settings.ollama_model
        return True, model in names or f"{model}:latest" in names

    async def warm_up(self) -> bool:
        """Load the model into memory (empty prompt). Runs in the background at startup."""
        try:
            res = await self._http.post(
                "/api/generate",
                json={"model": self.settings.ollama_model, "keep_alive": self.settings.ollama_keep_alive},
                timeout=self.settings.ollama_warmup_timeout_s,
            )
            res.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("Ollama warm-up failed (%s). Canned replies will be used until it is available.", type(exc).__name__)
            return False
        log.info("Ollama model '%s' is warm.", self.settings.ollama_model)
        return True

    async def chat(self, messages: list[dict[str, str]]) -> str | None:
        """Return the model's reply, or None if Ollama is unavailable, slow or returns nothing usable."""
        payload = {
            "model": self.settings.ollama_model,
            "messages": messages,
            "stream": False,
            "think": False,
            "keep_alive": self.settings.ollama_keep_alive,
            "options": {
                "num_predict": self.settings.ollama_num_predict,
                "temperature": self.settings.ollama_temperature,
            },
        }
        try:
            async with asyncio.timeout(self.settings.ollama_timeout_s):
                res = await self._http.post("/api/chat", json=payload)
                res.raise_for_status()
                data = res.json()
        except (httpx.HTTPError, TimeoutError, ValueError) as exc:
            log.info("Ollama unavailable for small talk (%s); using a canned reply.", type(exc).__name__)
            return None
        message = data.get("message") if isinstance(data, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            return None
        return clean_reply(content, truncated=data.get("done_reason") == "length") or None


class SmallTalk:
    """Small-talk replies: the local model when available, canned replies otherwise."""

    def __init__(self, client: OllamaClient, rng: random.Random | None = None):
        self.client = client
        self._rng = rng or random.Random()

    def canned(self, lang: str, kind: str | None) -> str:
        replies = CANNED_REPLIES.get(lang, CANNED_REPLIES["en"])
        return self._rng.choice(replies.get(kind or "casual", replies["casual"]))

    async def reply(
        self,
        message: str,
        history: list[Turn],
        lang: str,
        crew_name: str | None,
        kind: str | None,
        notes: str | None = None,
    ) -> tuple[str, bool]:
        """(reply, ai_used). ``notes``: the crew member's support profile, for a personal conversation."""
        messages = [{"role": "system", "content": build_system_prompt(lang, crew_name, notes)}]
        for turn in history:
            messages.append({"role": "user", "content": turn.user})
            messages.append({"role": "assistant", "content": turn.assistant})
        messages.append({"role": "user", "content": message})
        text = await self.client.chat(messages)
        if text:
            return text, True
        return self.canned(lang, kind), False
