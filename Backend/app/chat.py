"""Chat flow: route each message, answer from the manual or the AI, keep short-lived context.

* emergency  -> the protocol from the manual (never the AI)
* health     -> the manual (never the AI)
* ambiguous  -> a clarifying question
* small_talk -> the local AI, or a canned reply; AI replies pass the post-filter
* fallback   -> an honest "I'm not sure" with options

Language: the request's language, then the crew member's preferredLanguage, then English.
"""

from __future__ import annotations

from .ai import SmallTalk, is_safe_small_talk
from .alerts import AlertBoard
from .crew import CrewMember, CrewRegistry
from .intent import Intent, KeywordRouter
from .manual import Manual
from .schemas import ChatRequest, ChatResponse
from .sessions import SessionStore, Turn

TEXTS = {
    "en": {
        "emergency_intro": "This may be an emergency. Call a crewmate and the on-board medical officer now.",
        "indicator": (
            "{name}: {explanation} Normal range (example values): {normal}. How to measure: {steps} "
            "If you log a reading, I will compare it with the manual."
        ),
        "health_generic": (
            "I'll check the manual for anything about health. I can explain heart rate, body temperature, "
            "oxygen, sleep or mood, or help you log a reading."
        ),
        "clarify": "I want to make sure I understand. Does something hurt, or do you feel tired?",
        "fallback": (
            "I'm not sure I understood that. I can explain a health indicator, help you log a measurement, "
            "or guide you through an emergency protocol. What would you like to do?"
        ),
    },
    "es": {
        "emergency_intro": "Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo.",
        "indicator": (
            "{name}: {explanation} Rango normal (valores de ejemplo): {normal}. Cómo medir: {steps} "
            "Si registras una lectura, la comparo con el manual."
        ),
        "health_generic": (
            "Para cualquier tema de salud, reviso el manual. Puedo explicarte la frecuencia cardiaca, la "
            "temperatura corporal, el oxígeno, el sueño o el estado de ánimo, o ayudarte a registrar una lectura."
        ),
        "clarify": "Quiero asegurarme de entenderte. ¿Te duele algo o sientes cansancio?",
        "fallback": (
            "No estoy segura de haberte entendido. Puedo explicarte un indicador de salud, ayudarte a registrar "
            "una medición o guiarte en un protocolo de emergencia. ¿Qué quieres hacer?"
        ),
    },
}

SUGGESTIONS = {
    "clarify": {
        "en": ["Something hurts", "I feel tired", "I'm okay"],
        "es": ["Me duele algo", "Siento cansancio", "Estoy bien"],
    },
    "topics": {
        "en": ["Heart rate", "Temperature", "Oxygen (SpO2)", "Sleep", "Mood"],
        "es": ["Frecuencia cardiaca", "Temperatura", "Oxígeno (SpO2)", "Sueño", "Estado de ánimo"],
    },
}

FEELING_UNWELL = "feeling_unwell"


def numbered(steps: list[str]) -> str:
    return " ".join(f"{i}. {step}" for i, step in enumerate(steps, 1))


class ChatService:
    def __init__(
        self,
        manual: Manual,
        router: KeywordRouter,
        crew: CrewRegistry,
        sessions: SessionStore,
        small_talk: SmallTalk,
        alerts: AlertBoard | None = None,
    ):
        self.manual = manual
        self.router = router
        self.crew = crew
        self.sessions = sessions
        self.small_talk = small_talk
        self.alerts = alerts

    async def handle(self, req: ChatRequest) -> ChatResponse:
        # An unknown crew_id never blocks a reply (an emergency must always be answered).
        requested_crew = self.crew.get(req.crew_id)
        session = self.sessions.open(req.session_id, requested_crew.crew_id if requested_crew else None)
        crew = requested_crew or self.crew.get(session.crew_id)
        lang = req.language or (crew.preferredLanguage if crew else None) or "en"

        intent = self.router.classify(req.message)
        if intent.category == "emergency":
            response = self._emergency(intent, lang)
            if self.alerts is not None and crew is not None:
                # Priority 2: alert the crew and the medical officer. Only the protocol name is kept.
                self.alerts.report(crew.crew_id, crew.name, intent.protocol)
        elif intent.category == "health":
            response = self._health(intent, lang)
        elif intent.category == "ambiguous":
            response = self._reply("ambiguous", TEXTS[lang]["clarify"], lang, SUGGESTIONS["clarify"][lang])
        elif intent.category == "small_talk":
            response = await self._small_talk(req, intent, lang, crew)
        else:
            response = self._reply("fallback", TEXTS[lang]["fallback"], lang, SUGGESTIONS["topics"][lang])

        self.sessions.add_turn(req.session_id, Turn(response.category, req.message, response.reply))
        return response

    # ------------------------------------------------------------------ categories
    @staticmethod
    def _reply(category: str, text: str, lang: str, suggestions: list[str] | None = None) -> ChatResponse:
        return ChatResponse(category=category, reply=text, language=lang, ai_used=False, suggestions=suggestions or [])

    def _emergency(self, intent: Intent, lang: str) -> ChatResponse:
        protocol = self.manual.protocol_view(intent.protocol, lang)
        reply = f"{TEXTS[lang]['emergency_intro']} {protocol.title}: {numbered(protocol.steps)}"
        return ChatResponse(
            category="emergency", reply=reply, language=lang, ai_used=False, protocol=protocol, source=protocol.source
        )

    def _health(self, intent: Intent, lang: str) -> ChatResponse:
        """The health router: answers only from the manual."""
        if intent.symptom:
            guidance = self.manual.protocol_view(FEELING_UNWELL, lang)
            return ChatResponse(
                category="health",
                reply=f"{guidance.title}: {numbered(guidance.steps)}",
                language=lang,
                ai_used=False,
                protocol=guidance,
                indicator=intent.indicator,
                source=guidance.source,
            )
        if intent.indicator:
            view = self.manual.indicator_view(intent.indicator, lang)
            reply = TEXTS[lang]["indicator"].format(
                name=view.name,
                explanation=view.explanation,
                normal=view.ranges.normal,
                steps=numbered(view.how_to_measure),
            )
            return ChatResponse(
                category="health",
                reply=reply,
                language=lang,
                ai_used=False,
                indicator=intent.indicator,
                source=view.source,
            )
        return ChatResponse(
            category="health",
            reply=TEXTS[lang]["health_generic"],
            language=lang,
            ai_used=False,
            source=self.manual.source,
            suggestions=SUGGESTIONS["topics"][lang],
        )

    async def _small_talk(self, req: ChatRequest, intent: Intent, lang: str, crew: CrewMember | None) -> ChatResponse:
        history = [t for t in self.sessions.turns(req.session_id) if t.category == "small_talk"]
        text, ai_used = await self.small_talk.reply(
            req.message, history, lang, crew.name if crew else None, intent.small_talk_type
        )
        if ai_used and not is_safe_small_talk(text, self.router):
            # Post-filter: discard the AI reply and re-route the message through the health router.
            rerouted = self.router.classify(req.message)
            return self._health(rerouted if rerouted.category == "health" else Intent("health"), lang)
        return ChatResponse(category="small_talk", reply=text, language=lang, ai_used=ai_used)
