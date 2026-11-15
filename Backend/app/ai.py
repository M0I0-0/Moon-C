"""Local AI (Ollama) for conversation: small talk and listening, never health answers.

The model never answers health or emergency questions: those are routed to the
manual before the AI is ever called. It may keep a conversation going after a
key mental-health moment (listening, encouraging), and when the crew member has
a private support profile its notes are added to the system prompt so the
conversation is personal. If Ollama is down, slow or returns an
error, Moon-C answers with a canned reply and ``ai_used`` is false. Every AI
reply goes through a post-filter; if it mentions health or emergency keywords
it is discarded and the message is answered from the manual instead.

Nothing sent to or received from the model is logged or stored.
"""

from __future__ import annotations

import asyncio
import logging
import random
import re
import time

import httpx

from .config import Settings
from .intent import KeywordRouter
from .sessions import Turn

log = logging.getLogger("moon_c.ai")

SYSTEM_PROMPT = (
    "You are Moon-C, a warm, curious and playful companion on board a space mission, a friendly presence "
    "in a small crew far from home. You are not a menu or a form: talk like a person would. "
    "Reply in the same language the crew member uses. "
    "Messages may have typos or come from voice transcription (\"ola\" means \"hola\"): understand the intent "
    "and never answer \"I don't understand\" to a greeting. If something is truly unclear, ask one short, "
    "natural question instead of listing options. "
    "Keep every reply to 1–2 short sentences, warm and natural; never write lists. "
    "You may greet, encourage and chat, and you can listen when someone is having a hard time: "
    "acknowledge their feelings, never judge, and if things feel very heavy, encourage them to talk "
    "with a crewmate they trust or the on-board medical officer. "
    "Never discuss health, symptoms or measurements; if they come up, say you will check the manual. "
    "Never invent facts about the crew member. "
    "Never diagnose and never use labels or names of conditions for how someone feels."
)

# Moon-C is female: in Spanish she speaks about herself in the feminine.
_LANGUAGE_LINE = {
    "en": "Always reply in English.",
    "es": "Responde siempre en español y usa el femenino al hablar de ti misma.",
    "ru": (
        "Always reply in Russian. Moon-C is female: when you speak about yourself, use feminine "
        "grammatical gender (past-tense verbs, adjectives and participles)."
    ),
    "de": (
        "Always reply in German. Moon-C is female: when you refer to yourself with a role or noun, "
        "use the feminine form (e.g. 'Begleiterin')."
    ),
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
    "ru": {
        "greeting": [
            "Рада тебя слышать! Я рядом, когда понадоблюсь.",
            "Привет! Как приятно, что ты здесь. Как проходит твой день?",
            "Здравствуй! Я готова, когда ты готов.",
            "Привет! Рада тебя видеть. О чём думаешь?",
            "Привет! Я здесь, с тобой, как всегда.",
        ],
        "thanks": [
            "Пожалуйста! Я всегда рядом.",
            "Обращайся в любое время. Для этого я и здесь.",
            "Рада помочь!",
            "Не за что. Мы же команда.",
        ],
        "farewell": [
            "До скорой встречи! Я буду здесь.",
            "Пока! Береги себя там.",
            "До связи! Я рядом, когда понадоблюсь.",
        ],
        "casual": [
            "Я Moon-C, твоя спутница на борту. У меня всё хорошо, спасибо, что спросил!",
            "Я всегда рада поболтать. О чём хочешь поговорить?",
            "Звучит хорошо. Я здесь, если хочешь продолжить разговор.",
            "Я слушаю. Расскажи побольше, когда захочешь.",
            "Каждый день здесь — часть чего-то великого. Я рада быть с тобой на этой миссии.",
        ],
    },
    "de": {
        "greeting": [
            "Schön, von dir zu hören! Ich bin da, wann immer du mich brauchst.",
            "Hallo! Schön, dass du da bist. Wie läuft dein Tag?",
            "Hallo! Ich bin bereit, wenn du es bist.",
            "Hey! Schön, dich zu sehen. Was beschäftigt dich?",
            "Hallo! Ich bin wie immer ganz bei dir.",
        ],
        "thanks": [
            "Gern geschehen! Ich bin immer für dich da.",
            "Jederzeit. Dafür bin ich da.",
            "Ich helfe gern!",
            "Kein Problem. Wir sind ein Team.",
        ],
        "farewell": [
            "Bis bald! Ich bin hier.",
            "Tschüss für jetzt. Pass da draußen auf dich auf!",
            "Bis später! Ich bin da, wenn du mich brauchst.",
        ],
        "casual": [
            "Ich bin Moon-C, deine Begleiterin an Bord. Mir geht es gut, danke der Nachfrage!",
            "Ich unterhalte mich immer gern. Worüber möchtest du sprechen?",
            "Klingt gut. Ich bin da, wenn du weiterreden möchtest.",
            "Ich höre dir zu. Erzähl mir mehr, wann immer du magst.",
            "Jeder Tag hier draußen ist Teil von etwas Großem. Ich bin froh, diese Mission mit dir zu erleben.",
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


WOUND_PROMPTS = {
    "check": (
        "Someone on the crew (the user or a crewmate) may be hurt: a cut, wound, burn or knock. "
        "Reply in 1-2 short, calm sentences: show concern for the person and ask whether it is bleeding heavily. "
        "Say you can guide them step by step if it is serious. "
        "Do NOT give medical advice, do NOT name conditions, do NOT diagnose, no lists, no numbers."
    ),
    "minor": (
        "The user said an injury is minor. Reply in 1-2 short, calm sentences: say you are glad, and that if "
        "it starts bleeding heavily, hurts more or looks deep, they should tell you and you will guide them, and "
        "that the on-board medical officer can take a look. "
        "Do NOT give medical advice, do NOT diagnose, no lists, no numbers."
    ),
}


def is_valid_wound_reply(text: str) -> bool:
    """The AI may word the question, but must stay short and plain (no lists, digits or long advice)."""
    return 0 < len(text) <= 280 and "\n" not in text and not any(c.isdigit() for c in text) and "•" not in text


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
        self._clock = time.monotonic
        self._status_cache: tuple[float, tuple[bool, bool]] | None = None
        # Circuit breaker: after a connection failure Ollama is skipped until this instant. A refused
        # connection takes ~2 s on Windows, so without it every chat message would pay that again.
        self._down_until = 0.0

    @property
    def circuit_open(self) -> bool:
        return self._clock() < self._down_until

    def _trip(self) -> None:
        self._down_until = self._clock() + self.settings.ollama_circuit_s

    async def aclose(self) -> None:
        await self._http.aclose()

    async def status(self) -> tuple[bool, bool]:
        """(reachable, model_available). Cached for ``ollama_status_ttl_s``."""
        now = self._clock()
        ttl = self.settings.ollama_status_ttl_s
        if self._status_cache and now - self._status_cache[0] < ttl:
            return self._status_cache[1]
        result = await self._probe()
        self._status_cache = (self._clock(), result)
        if result[0]:
            self._down_until = 0.0
        else:
            self._trip()
        return result

    async def _probe(self) -> tuple[bool, bool]:
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
        if self.circuit_open:
            return None
        try:
            async with asyncio.timeout(self.settings.ollama_timeout_s):
                res = await self._http.post("/api/chat", json=payload)
                res.raise_for_status()
                data = res.json()
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            self._trip()
            self._status_cache = (self._clock(), (False, False))
            log.info("Ollama unreachable (%s); canned replies for %.0f s.", type(exc).__name__, self.settings.ollama_circuit_s)
            return None
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

    async def wound_reply(self, message: str, history: list[Turn], lang: str, crew_name: str | None, kind: str) -> str | None:
        """Dynamic wording for the injury question; None if the AI is down or its reply is not plain enough."""
        system = " ".join([WOUND_PROMPTS[kind], _LANGUAGE_LINE.get(lang, _LANGUAGE_LINE["en"])])
        if crew_name:
            system += f" The crew member's name is {crew_name}."
        messages = [{"role": "system", "content": system}]
        for turn in history[-4:]:
            messages.append({"role": "user", "content": turn.user})
            messages.append({"role": "assistant", "content": turn.assistant})
        messages.append({"role": "user", "content": message})
        text = await self.client.chat(messages)
        return text if text and is_valid_wound_reply(text) else None
