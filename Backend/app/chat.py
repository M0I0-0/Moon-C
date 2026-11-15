"""Chat flow: route each message, answer from the manual or the AI, keep short-lived context.

* emergency  -> the protocol from the manual (never the AI); thoughts of self-harm included
* health     -> the manual (never the AI)
* support    -> a key mental-health moment: the support guide, personalized with the crew
                member's private support profile when there is one (never the AI)
* ambiguous  -> a clarifying question. Safety questions (weak emergency phrase, negated phrase, chest or
                breathing trouble without an exact phrase) and injury questions are remembered in the
                session (``Pending``, a couple of minutes) so the next message answers them: a "yes"
                opens the protocol, deterministically. The AI never decides that.
* small_talk -> the local AI (with the support profile's notes), or a canned reply; AI replies
                pass the post-filter. Acknowledgements ("ok", "jajaja", emoji) and "help" are canned.
* fallback   -> an honest "I'm not sure" with options (several wordings), unless a conversation is
                already going on: then the AI keeps it going

Language: the message's own language when clear, then the session's last one, then the request's,
the crew member's preferredLanguage, then English. The reply is always in the language the response
says: an AI reply in another language is replaced by a canned one.

Clinical wording below (follow-up questions and reassurance) is deliberately conservative: it only asks
and, when the answer is serious, escalates to an emergency protocol. It gives no new treatment.
# supuesto: validar con experto médico (todos los textos marcados abajo)
"""

from __future__ import annotations

import random

from .ai import SmallTalk, is_safe_small_talk
from .alerts import AlertBoard
from .crew import CrewMember, CrewRegistry
from .intent import Intent, KeywordRouter, tokenize
from .language import detect_language
from .manual import Manual
from .schemas import ChatRequest, ChatResponse
from .sessions import Pending, SessionStore, Turn
from .support import ProfileStore, SupportGuide

TEXTS = {
    "en": {
        "emergency_intro": "This may be an emergency. Call a crewmate and the on-board medical officer now.",
        "indicator": (
            "{name}: {explanation} Normal range (reference values): {normal}. How to measure: {steps} "
            "If you log a reading, I will compare it with the manual."
        ),
        "health_generic": (
            "I'll check the manual for anything about health. I can explain heart rate, body temperature, "
            "oxygen, sleep or mood, or help you log a reading."
        ),
        "clarify": "I want to make sure I understand. Does something hurt, or do you feel tired?",
        # supuesto: validar con experto médico
        "wound_check": "I'm sorry to hear that. Is it bleeding heavily? Tell me and I'll guide you step by step.",
        "wound_minor": (
            "Good to hear. If it starts bleeding heavily, hurts more or looks deep, tell me and I'll guide you. "
            "The on-board medical officer can also take a look."
        ),
        "wound_burn": "I'm sorry to hear that. Is the burn large, blistered, or on the face or hands?",
        "wound_head": "I'm sorry to hear that. Was there loss of consciousness, vomiting, dizziness or confusion?",
        "wound_fall": (
            "That sounds scary. Is there strong pain, trouble moving, a blow to the head or loss of consciousness?"
        ),
        "wound_twist": "I'm sorry to hear that. Is there a lot of pain or swelling, or can't it bear weight or move?",
        "q_safety": "I want to make sure you're okay. Are you in danger or do you need help right now?",
        "q_negated": "Understood. Are you sure everything is okay?",
        "q_pain_chest_pain": "Is it a strong pain or pressure?",
        "q_pain_breathing_difficulty": "Are you short of breath or breathing with a lot of difficulty?",
        "retry": "I want to be sure. ",
        "no_safety": "I'm glad. I'm still here: if anything changes, tell me.",
        "no_negated": "Good to hear. If anything changes, tell me and I'll guide you right away.",
        "no_pain": (
            "Understood. If it gets stronger or turns into pressure, tell me and I'll guide you. "
            "The on-board medical officer can also check you."
        ),
        "no_wound": (
            "Understood. If it changes or gets worse, tell me and I'll guide you. "
            "The on-board medical officer can also take a look."
        ),
        "help": (
            "I can explain your indicators (heart rate, temperature, oxygen, sleep, mood), log a reading, "
            "guide you step by step in an emergency or keep you company if you feel stressed or far from home. "
            "What do you need?"
        ),
        "fallback": [
            (
                "I didn't quite get that. Could you tell me another way? If it's about your health or an "
                "emergency, I'm here: I can explain an indicator, log a reading or guide you step by step."
            ),
            "Hmm, I'm not sure what you mean. Try telling me differently, or pick one of these options.",
            "I got lost there. Is it about your health, a reading or how you feel? Tell me and we'll sort it out.",
            "I'm not sure I follow. I can help with indicators, readings, how you feel or an emergency.",
        ],
        "ack": [
            "Got it. I'm here if you need anything.",
            "Perfect. Tell me whenever you want to continue.",
            "Okay! Anything else I can help with?",
            "👍 I'm right here.",
        ],
    },
    "es": {
        "emergency_intro": "Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo.",
        "indicator": (
            "{name}: {explanation} Rango normal (valores de referencia): {normal}. Cómo medir: {steps} "
            "Si registras una lectura, la comparo con el manual."
        ),
        "health_generic": (
            "Para cualquier tema de salud, reviso el manual. Puedo explicarte la frecuencia cardiaca, la "
            "temperatura corporal, el oxígeno, el sueño o el estado de ánimo, o ayudarte a registrar una lectura."
        ),
        "clarify": "Quiero asegurarme de entenderte. ¿Te duele algo o sientes cansancio?",
        # supuesto: validar con experto médico
        "wound_check": "Lamento escuchar eso. ¿Está sangrando mucho? Dímelo y te guío paso a paso.",
        "wound_minor": (
            "Qué bueno. Si empieza a sangrar mucho, duele más o se ve profunda, dímelo y te guío. "
            "El oficial médico a bordo también puede revisarla."
        ),
        "wound_burn": "Lamento escuchar eso. ¿La quemadura es grande, tiene ampollas o está en la cara o las manos?",
        "wound_head": "Lamento escuchar eso. ¿Hubo pérdida de conocimiento, vómito, mareo o confusión?",
        "wound_fall": (
            "Qué susto. ¿Hay dolor fuerte, dificultad para moverse, golpe en la cabeza o pérdida de conocimiento?"
        ),
        "wound_twist": "Lamento escuchar eso. ¿Hay mucho dolor o hinchazón, o no se puede apoyar o mover?",
        "q_safety": "Quiero asegurarme de que estás bien. ¿Estás en peligro o necesitas ayuda ahora?",
        "q_negated": "Entendido. ¿Seguro que todo está bien?",
        "q_pain_chest_pain": "¿Es un dolor fuerte u opresión?",
        "q_pain_breathing_difficulty": "¿Te falta el aire o respiras con mucha dificultad?",
        "retry": "Quiero estar segura. ",
        "no_safety": "Me alegra. Sigo aquí: si algo cambia, dímelo.",
        "no_negated": "Qué bueno. Si algo cambia, dímelo y te guío al momento.",
        "no_pain": (
            "Entendido. Si aumenta o se vuelve opresión, dímelo y te guío. "
            "El oficial médico a bordo también puede revisarte."
        ),
        "no_wound": (
            "Entendido. Si cambia o empeora, dímelo y te guío. "
            "El oficial médico a bordo también puede revisarlo."
        ),
        "help": (
            "Puedo explicarte tus indicadores (pulso, temperatura, oxígeno, sueño, ánimo), registrar una lectura, "
            "guiarte paso a paso en una emergencia o acompañarte si estás estresado o lejos de casa. "
            "¿Qué necesitas?"
        ),
        "fallback": [
            (
                "No te entendí bien, ¿me lo cuentas de otra forma? Si es de tu salud o una emergencia, aquí "
                "estoy: puedo explicarte un indicador, registrar una lectura o guiarte paso a paso."
            ),
            "Mmm, no estoy segura de qué quieres decir. Cuéntamelo distinto o elige una de estas opciones.",
            "Me perdí un poco. ¿Es sobre tu salud, una lectura o cómo te sientes? Dime y lo resolvemos.",
            "No termino de captarlo. Puedo ayudarte con indicadores, lecturas, cómo te sientes o una emergencia.",
        ],
        "ack": [
            "Va. Aquí sigo por si necesitas algo.",
            "Perfecto. Dime cuando quieras continuar.",
            "¡Listo! ¿Algo más en lo que te pueda ayudar?",
            "👍 Aquí estoy.",
        ],
    },
}

# Quick replies. Labels are routed back through the router: "yes" answers open the protocol, never the AI.
# supuesto: validar con experto médico (textos de preguntas y botones clínicos)
SUGGESTIONS = {
    "wound": {
        "en": ["It's bleeding a lot", "It's minor", "There's no blood"],
        "es": ["Sangra mucho", "Es poca cosa", "No hay sangre"],
    },
    "wound_burn": {"en": ["Yes, it's serious", "No, it's small"], "es": ["Sí, es seria", "No, es pequeña"]},
    "wound_head": {"en": ["Yes, there was", "No, none"], "es": ["Sí, hubo", "No, ninguno"]},
    "wound_fall": {"en": ["Yes, one of them", "No, none"], "es": ["Sí, alguno", "No, ninguno"]},
    "wound_twist": {"en": ["Yes, it's serious", "No, it's mild"], "es": ["Sí, es serio", "No, es leve"]},
    "safety": {"en": ["Yes, I need help", "No, I'm okay"], "es": ["Sí, necesito ayuda", "No, estoy bien"]},
    "negated": {"en": ["Yes, all good", "No, it is happening"], "es": ["Sí, todo bien", "No, sí ocurre"]},
    "pain_chest_pain": {"en": ["Yes, it's strong", "No, it's mild"], "es": ["Sí, es fuerte", "No, es leve"]},
    "pain_breathing_difficulty": {
        "en": ["Yes, I'm short of breath", "No, it's mild"],
        "es": ["Sí, me falta el aire", "No, es leve"],
    },
    "clarify": {
        "en": ["Something hurts", "I feel tired", "I'm okay"],
        "es": ["Me duele algo", "Siento cansancio", "Estoy bien"],
    },
    "topics": {
        "en": ["Heart rate", "Temperature", "Oxygen (SpO2)", "Sleep", "Mood"],
        "es": ["Frecuencia cardiaca", "Temperatura", "Oxígeno (SpO2)", "Sueño", "Estado de ánimo"],
    },
    "help": {
        "en": ["Heart rate", "Temperature", "I feel sick", "I'm stressed"],
        "es": ["Frecuencia cardiaca", "Temperatura", "Me siento mal", "Estoy estresado"],
    },
}

FEELING_UNWELL = "feeling_unwell"
CONVERSATION = ("small_talk", "support")
# Protocol opened by a "yes" to an injury question: bleeding for a cut, otherwise the general emergency
# (call the crew and the medical officer). supuesto: validar con experto médico
WOUND_PROTOCOL = {"check": "bleeding"}
WOUND_ESCALATION = "general_emergency"
# Questions whose answer is a degree ("a lot", "a little") rather than a plain yes/no.
PLAIN_YES_NO = ("safety", "negated")


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
        support: SupportGuide | None = None,
        profiles: ProfileStore | None = None,
        rng: random.Random | None = None,
    ):
        self.manual = manual
        self.router = router
        self.crew = crew
        self.sessions = sessions
        self.small_talk = small_talk
        self.alerts = alerts
        self.support = support
        self.profiles = profiles or ProfileStore()
        # Seedable: shares the small-talk generator by default, so one seed fixes every canned wording.
        self._rng = rng or getattr(small_talk, "_rng", None) or random.Random()

    async def handle(self, req: ChatRequest) -> ChatResponse:
        # An unknown crew_id never blocks a reply (an emergency must always be answered).
        requested_crew = self.crew.get(req.crew_id)
        session = self.sessions.open(req.session_id, requested_crew.crew_id if requested_crew else None)
        crew = requested_crew or self.crew.get(session.crew_id)
        # Reply in the language the person is using now. Without a clear signal ("ok", "gracias/thanks" ties),
        # keep the session's last detected language, then the request's, then the crew member's.
        detected = detect_language(req.message)
        if detected:
            self.sessions.set_language(req.session_id, detected)
        lang = detected or session.language or req.language or (crew.preferredLanguage if crew else None) or "en"

        intent = self.router.classify(req.message)
        # A pending question is consumed by this message; the handlers below set a new one if needed.
        pending = self.sessions.pending(req.session_id)
        self.sessions.clear_pending(req.session_id)
        answered = None
        if pending is not None and intent.category != "emergency":
            answered = await self._answer_pending(pending, intent, req, lang, crew)

        if intent.category == "emergency":
            response = self._emergency(intent.protocol, lang, crew)
        elif answered is not None:
            response = answered
        elif intent.category == "health":
            response = self._health(intent, lang)
        elif intent.category == "support" and self.support is not None:
            response = self._support(intent, lang, crew)
        elif intent.category == "support":  # no support guide loaded: answer about the mood indicator
            response = self._health(Intent("health", indicator="mood"), lang)
        elif intent.category == "ambiguous" and intent.confirm:
            response = self._ask(self._confirm_kind(intent), intent.protocol, lang, req.session_id)
        elif intent.category == "ambiguous" and intent.wound:
            response = await self._wound(req, intent.wound, lang, crew)
        elif intent.category == "ambiguous":
            response = self._reply("ambiguous", TEXTS[lang]["clarify"], lang, SUGGESTIONS["clarify"][lang])
        elif intent.category == "small_talk" and intent.small_talk_type == "help":
            response = self._reply("small_talk", TEXTS[lang]["help"], lang, SUGGESTIONS["help"][lang])
        elif intent.category == "small_talk" and intent.small_talk_type == "ack":
            response = self._ack(req.session_id, lang)
        elif intent.category == "small_talk":
            response = await self._small_talk(req, intent, lang, crew)
        elif self._in_conversation(req.session_id):
            # Nothing matched, but a conversation is going on: keep it going instead of "I'm not sure".
            response = await self._small_talk(req, Intent("small_talk", small_talk_type="casual"), lang, crew)
        else:
            response = await self._open_ended(req, lang, crew)

        self.sessions.add_turn(req.session_id, Turn(response.category, req.message, response.reply))
        return response

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _reply(category: str, text: str, lang: str, suggestions: list[str] | None = None) -> ChatResponse:
        return ChatResponse(category=category, reply=text, language=lang, ai_used=False, suggestions=suggestions or [])

    def _last_reply(self, session_id: str) -> str | None:
        turns = self.sessions.turns(session_id)
        return turns[-1].assistant if turns else None

    def _pick(self, options: list[str], session_id: str) -> str:
        """A random wording that is not the one just used in this session."""
        last = self._last_reply(session_id)
        return self._rng.choice([o for o in options if o != last] or options)

    @staticmethod
    def _confirm_kind(intent: Intent) -> str:
        return f"pain_{intent.protocol}" if intent.confirm == "pain" else str(intent.confirm)

    # ------------------------------------------------------------------ pending questions
    def _ask(self, kind: str, protocol: str | None, lang: str, session_id: str, retry: bool = False, tries: int = 0) -> ChatResponse:
        """Ask a safety, pain or injury question and remember it: the next message answers it."""
        self.sessions.set_pending(session_id, kind, protocol, tries)
        text = TEXTS[lang][f"q_{kind}"] if f"q_{kind}" in TEXTS[lang] else TEXTS[lang][kind]
        if retry:
            text = TEXTS[lang]["retry"] + text
        suggestions = SUGGESTIONS["wound" if kind == "wound_check" else kind][lang]
        return self._reply("ambiguous", text, lang, suggestions)

    async def _answer_pending(
        self, pending: Pending, intent: Intent, req: ChatRequest, lang: str, crew: CrewMember | None
    ) -> ChatResponse | None:
        """Interpret this message as the answer to the pending question; None = route it normally."""
        if intent.category in ("health", "support"):  # "no me siento bien": a new topic, not an answer
            return None
        answer = self.router.answer(req.message, graded=pending.kind not in PLAIN_YES_NO)
        if answer is None:
            # Not understood. A short message is probably a muddled answer: ask once more, never loop.
            if pending.tries < 1 and len(tokenize(req.message)[0]) <= 3 and not (
                intent.category == "ambiguous" and (intent.confirm or intent.wound)
            ):
                return self._ask(pending.kind, pending.protocol, lang, req.session_id, retry=True, tries=pending.tries + 1)
            return None
        # "negated": the question is "are you sure everything is fine?", so "no" is the alarming answer.
        alarming = answer == "no" if pending.kind == "negated" else answer == "yes"
        if alarming:
            return self._emergency(pending.protocol or WOUND_ESCALATION, lang, crew)
        group = pending.kind.split("_")[0]
        if pending.kind == "wound_check":
            return await self._wound(req, "minor", lang, crew)
        return self._reply("ambiguous", TEXTS[lang][f"no_{group}"], lang)

    # ------------------------------------------------------------------ categories
    async def _wound(self, req: ChatRequest, kind: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        """Possible injury: ask how bad it is (never assume an emergency). The AI words the cut question."""
        if kind not in ("check", "minor"):
            # Burn, head, fall, twist: fixed clinical wording (the AI prompts only cover cuts).
            return self._ask(f"wound_{kind}", WOUND_PROTOCOL.get(kind, WOUND_ESCALATION), lang, req.session_id)
        history = [t for t in self.sessions.turns(req.session_id) if t.category in CONVERSATION]
        text = await self.small_talk.wound_reply(req.message, history, lang, crew.name if crew else None, kind)
        ai_used = text is not None
        if kind == "check":
            self.sessions.set_pending(req.session_id, "wound_check", WOUND_PROTOCOL["check"])
        return ChatResponse(
            category="ambiguous",
            reply=text or TEXTS[lang][f"wound_{kind}"],
            language=lang,
            ai_used=ai_used,
            suggestions=SUGGESTIONS["wound"][lang] if kind == "check" else [],
        )

    def _ack(self, session_id: str, lang: str) -> ChatResponse:
        """"ok", "vale", emoji, laughter: a brief, natural reply (no "I didn't get that")."""
        history = [t for t in self.sessions.turns(session_id) if t.category in CONVERSATION]
        if self.support is not None and any(t.category == "support" for t in history):
            return self._reply("small_talk", self.support.keep_listening(lang), lang)
        return self._reply("small_talk", self._pick(TEXTS[lang]["ack"], session_id), lang)

    async def _open_ended(self, req: ChatRequest, lang: str, crew: CrewMember | None) -> ChatResponse:
        """Nothing matched: let the AI answer like a companion (the same post-filter applies).

        Without the AI there is no honest way to answer, so the "I'm not sure" reply is used,
        except in the middle of a conversation, where a canned line keeps it going.
        """
        response = await self._small_talk(req, Intent("small_talk", small_talk_type="casual"), lang, crew)
        if response.ai_used or response.category != "small_talk" or self._in_conversation(req.session_id):
            return response
        text = self._pick(TEXTS[lang]["fallback"], req.session_id)
        return self._reply("fallback", text, lang, SUGGESTIONS["topics"][lang])

    def _in_conversation(self, session_id: str) -> bool:
        turns = self.sessions.turns(session_id)
        return bool(turns) and turns[-1].category in CONVERSATION

    def _emergency(self, protocol_name: str | None, lang: str, crew: CrewMember | None) -> ChatResponse:
        protocol = self.manual.protocol_view(protocol_name, lang)
        intro = protocol.intro or TEXTS[lang]["emergency_intro"]
        reply = f"{intro} {protocol.title}: {numbered(protocol.steps)}"
        if self.alerts is not None and crew is not None:
            # Priority 2: alert the crew and the medical officer. Only the protocol name is kept.
            self.alerts.report(crew.crew_id, crew.name, protocol_name)
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

    def _support(self, intent: Intent, lang: str, crew: CrewMember | None) -> ChatResponse:
        """A key mental-health moment: the support guide, personalized with the crew member's profile."""
        profile = self.profiles.get(crew.crew_id if crew else None)
        text, personalized = self.support.reply(intent.moment, lang, profile)
        return ChatResponse(
            category="support",
            reply=text,
            language=lang,
            ai_used=False,
            moment=intent.moment,
            personalized=personalized,
            source=self.support.source,
            suggestions=self.support.suggestions(intent.moment, lang),
        )

    async def _small_talk(self, req: ChatRequest, intent: Intent, lang: str, crew: CrewMember | None) -> ChatResponse:
        history = [t for t in self.sessions.turns(req.session_id) if t.category in CONVERSATION]
        supporting = self.support is not None and any(t.category == "support" for t in history)
        profile = self.profiles.get(crew.crew_id if crew else None)
        notes = profile.ai_notes(crew.name) if profile and crew else None
        text, ai_used = await self.small_talk.reply(
            req.message, history, lang, crew.name if crew else None, intent.small_talk_type, notes=notes
        )
        if ai_used and detect_language(text) not in (None, lang):
            # The model answered in another language than the one this reply is labelled with: the
            # front-end would read it with the wrong voice. Use a canned reply in `lang` instead.
            text, ai_used = self.small_talk.canned(lang, intent.small_talk_type), False
        if ai_used and not is_safe_small_talk(text, self.router):
            if supporting:
                # Mid-conversation about how they feel: keep listening instead of switching to the manual.
                return ChatResponse(
                    category="small_talk", reply=self.support.keep_listening(lang), language=lang, ai_used=False
                )
            # Post-filter: discard the AI reply and re-route the message through the health router.
            rerouted = self.router.classify(req.message)
            return self._health(rerouted if rerouted.category == "health" else Intent("health"), lang)
        if not ai_used:
            # Canned lines: never the same one twice in a row ("hola", "hola").
            last = self._last_reply(req.session_id)
            make = (lambda: self.support.keep_listening(lang)) if supporting else (
                lambda: self.small_talk.canned(lang, intent.small_talk_type)
            )
            if supporting:
                text = make()  # a canned "Hello!" would not fit here
            for _ in range(6):
                if text != last:
                    break
                text = make()
        return ChatResponse(
            category="small_talk",
            reply=text,
            language=lang,
            ai_used=ai_used,
            personalized=ai_used and notes is not None,
        )
