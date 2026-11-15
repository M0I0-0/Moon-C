"""Wellbeing flows: fast guided response to acute anxiety, breathing/grounding, low-mood tips, CMO notices.

Moon-C supports the crew and does NOT diagnose. Everything the user reads comes from
``shared/support_advice.json`` (sources in ``shared/REFERENCES_SUPPORT.md``; status "supuesto: validar con
profesional de salud mental"). The AI never writes these texts. The only wording of our own is the short
bridge sentences in ``BRIDGE`` below (neutral, marked "supuesto").

Flow (the hook in ``chat.py`` runs it after the direct emergency branch, so physical emergencies and
self-harm words keep opening the emergency protocols):

* acute anxiety ("estoy en pánico", "I can't calm down", ...): ONE immediate reply with
  ``anxiety_crisis.first_response`` + the ``safety_check`` question, ``guide="breathing"``. Decision: the
  safety question is in the same reply (no extra turn before help starts). "Sí" opens the emergency
  protocol; only after "No" do the "stay with me" lines say the person is safe.
* "Respirar juntos" / "Anclaje 5 sentidos" / "Ya estoy mejor" / "Sigo mal" buttons (also typed).
  "Sigo mal" offers the next exercise (2nd breathing round, then grounding); still bad after 2 rounds and the
  grounding -> automatic alert (``not_improving``). "Ya estoy mejor" -> ``after`` + offer to tell the CMO.
* automatic CMO alert (``escalate_if``): physical symptoms (emergency protocol), not improving,
  self-harm words (emergency router), repeated episodes (2nd within ``RECURRENCE_WINDOW_S``), person asks.
* low mood: ``low_mood.intro`` + 2-3 tips that rotate (never the same set twice in a session).

Privacy: no chat text is stored. Session state is minimal and short-lived (``WellbeingState``); recurrence
keeps only timestamps per crew member in memory. The alert carries only the type
(``support_escalation``), never what was said.
"""

from __future__ import annotations

import copy
import json
import logging
import random
import time
from collections.abc import Callable
from difflib import SequenceMatcher
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .alerts import AlertBoard
from .crew import CrewMember
from .intent import KeywordRouter, normalize
from .schemas import ChatResponse

if TYPE_CHECKING:
    from .intent import Intent
    from .sessions import Pending, SessionStore, WellbeingState

log = logging.getLogger("moon_c.wellbeing")

EPISODE_TTL_S = 900.0
"""An exercise episode stays open this long (Moon-C design value, supuesto)."""
RECURRENCE_WINDOW_S = 72 * 3600.0
"""'A few days' for the repeated-episode trigger (Moon-C design value, supuesto: validar con profesional)."""
MAX_EPISODES_KEPT = 20
FUZZY_RATIO = 0.88

PENDING_SAFETY = "wb_safety"
PENDING_NOTIFY = "wb_notify"
SAFETY_PROTOCOL = "chest_pain"
"""Protocol a "yes" to the safety check opens (first of the JSON's list; one protocol per reply)."""
EXTRA_SAFETY_ALERTS = ("breathing_difficulty", "fainting_unresponsive")
"""The safety question covers chest pain, fainting and shortness of breath: a "yes" opens ONE protocol
(chest_pain) and also raises these two as alerts only (no extra protocol shown)."""
AWAY_FROM_SAFE = 4
"""Index of the stay_with_me line that says 'you are safe' (only after a negative safety check)."""

# supuesto: neutral bridge wording of Moon-C, to be reviewed with the rest of the texts.
BRIDGE = {
    "es": {
        "ask_notify": "¿Quieres que avise al oficial médico?",
        "notified": "Listo: avisé al oficial médico.",
        "declined": "De acuerdo. Aquí sigo si me necesitas.",
        "recurrence": "Como te pasó hace poco, avisé al oficial médico para que esté al tanto.",
        "not_improving": "Te pido que no te quedes solo: llama a un compañero. Avisé al oficial médico.",
        "tip_label": "",
        "buttons": ["Respirar juntos", "Anclaje de 5 sentidos", "Ya estoy mejor", "Sigo mal"],
    },
    "en": {
        "ask_notify": "Do you want me to tell the medical officer?",
        "notified": "Done: I've let the medical officer know.",
        "declined": "Okay. I'm here if you need me.",
        "recurrence": "Since this happened recently, I let the medical officer know so they are aware.",
        "not_improving": "Please don't stay alone: call a crewmate. I've alerted the medical officer.",
        "tip_label": "",
        "buttons": ["Breathe together", "5-senses grounding", "I'm feeling better", "I'm still not better"],
    },
}
# supuesto: traducción por validar con traductor médico (ru, de). The button labels must keep matching the
# "wellbeing" keywords of shared/keywords.json (they are routed back through the router, never the AI).
BRIDGE["ru"] = {
    "ask_notify": "Хочешь, я сообщу медицинскому офицеру?",
    "notified": "Готово: я сообщила медицинскому офицеру.",
    "declined": "Хорошо. Я рядом, если понадоблюсь.",
    "recurrence": "Раз это случилось недавно, я сообщила медицинскому офицеру, чтобы он был в курсе.",
    "not_improving": "Прошу, не оставайся один: позови члена экипажа. Я предупредила медицинского офицера.",
    "tip_label": "",
    "buttons": ["Дышать вместе", "Заземление по 5 чувствам", "Мне лучше", "Мне все еще плохо"],
}
BRIDGE["de"] = {
    "ask_notify": "Soll ich den medizinischen Offizier informieren?",
    "notified": "Erledigt: Ich habe den medizinischen Offizier informiert.",
    "declined": "In Ordnung. Ich bin da, wenn du mich brauchst.",
    "recurrence": "Da das kürzlich schon passiert ist, habe ich den medizinischen Offizier informiert, damit er Bescheid weiß.",
    "not_improving": "Bitte bleib nicht allein: Ruf einen Kameraden. Ich habe den medizinischen Offizier alarmiert.",
    "tip_label": "",
    "buttons": ["Gemeinsam atmen", "5-Sinne-Erdung", "Mir geht es besser", "Mir geht es nicht besser"],
}
YES_NO = {"es": ["Sí", "No"], "en": ["Yes", "No"], "ru": ["Да", "Нет"], "de": ["Ja", "Nein"]}
LANGUAGES = ("es", "en", "ru", "de")


def _bridge(lang: str) -> dict[str, Any]:
    return BRIDGE.get(lang) or BRIDGE["en"]


def _fill_languages(node: Any) -> Any:
    """Give every {"en": ..., "es": ...} text node the languages it lacks (ru, de) as a copy of its English text,
    so a language whose advice is not translated yet answers in English instead of failing (never a KeyError)."""
    if isinstance(node, dict):
        for value in node.values():
            _fill_languages(value)
        if "en" in node and "es" in node:
            for lang in LANGUAGES:
                node.setdefault(lang, node["en"])
    elif isinstance(node, list):
        for value in node:
            _fill_languages(value)
    return node


class WellbeingError(RuntimeError):
    """support_advice.json or the 'wellbeing' keywords are missing or malformed."""


def _group(node: dict[str, Any], key: str) -> list[str]:
    block = node.get(key, {})
    out: list[str] = []
    for lang, values in block.items():
        if not lang.startswith("_") and isinstance(values, list):
            out.extend(normalize(str(v)) for v in values)
    return out


class Wellbeing:
    def __init__(
        self,
        advice: dict[str, Any],
        keywords: dict[str, Any],
        rng: random.Random | None = None,
        wall_clock: Callable[[], float] = time.time,
    ):
        try:
            advice = _fill_languages(copy.deepcopy(advice))
            self._advice = advice
            self._low = advice["low_mood"]
            self._anx = advice["anxiety_crisis"]
            kw = keywords["wellbeing"]
            self._kw = {
                name: _group(kw, name)
                for name in (
                    "anxiety", "anxiety_stems", "negators", "breathing", "grounding", "better", "worse",
                    "notify", "talk", "decline", "low_mood", "when_help", "activity",
                )
            }
            self._combos = [[normalize(w) for w in lst] for lst in kw["anxiety_combos"]["lists"]]
            self._tips = {tip["id"]: tip for tip in self._low["tips"]}
            _ = (self._anx["first_response"], self._anx["safety_check"], self._anx["breathing"],
                 self._anx["grounding"], self._anx["stay_with_me"], self._anx["after"], self._low["intro"])
        except (KeyError, TypeError, AttributeError) as exc:
            raise WellbeingError(f"wellbeing data is malformed: {exc!r}") from exc
        self._fuzzy_phrases = [(p, p.split()) for p in self._kw["anxiety"] if len(p.split()) >= 3]
        self._rng = rng or random.Random()
        self._wall = wall_clock
        self._episodes: dict[str, list[float]] = {}
        self._sessions: SessionStore | None = None
        self._alerts: AlertBoard | None = None
        self._emergency: Callable[[str | None, str, CrewMember | None], ChatResponse] | None = None
        self._router: KeywordRouter | None = None

    @classmethod
    def load(
        cls, shared_dir: Path, rng: random.Random | None = None, wall_clock: Callable[[], float] = time.time
    ) -> Wellbeing:
        try:
            advice = json.loads((shared_dir / "support_advice.json").read_text(encoding="utf-8"))
            keywords = json.loads((shared_dir / "keywords.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise WellbeingError(f"wellbeing files could not be read from {shared_dir}: {exc}") from exc
        return cls(advice, keywords, rng, wall_clock)

    def attach(
        self,
        sessions: SessionStore,
        alerts: AlertBoard | None,
        router: KeywordRouter,
        emergency: Callable[[str | None, str, CrewMember | None], ChatResponse],
    ) -> None:
        self._sessions, self._alerts, self._router, self._emergency = sessions, alerts, router, emergency

    # ------------------------------------------------------------------ detection
    @staticmethod
    def _has(padded: str, phrases: list[str]) -> bool:
        return any(f" {p} " in padded for p in phrases)

    def _negated_before(self, padded: str, pos: int) -> bool:
        return any(w in self._kw["negators"] for w in padded[:pos].split()[-2:])

    def is_anxiety(self, text: str) -> bool:
        """Clear signs of acute anxiety (es, en, ru, de), tolerant to typos and dictation without punctuation."""
        norm = normalize(text)
        if not norm:
            return False
        padded = f" {norm} "
        tokens = norm.split()
        for phrase in self._kw["anxiety"]:
            pos = padded.find(f" {phrase} ")
            if pos >= 0 and not self._negated_before(padded, pos):
                return True
        for i, token in enumerate(tokens):
            if any(token.startswith(stem) for stem in self._kw["anxiety_stems"]):
                if not any(w in self._kw["negators"] for w in tokens[max(0, i - 2) : i]):
                    return True
        for combo in self._combos:
            if all(any(t.startswith(w) for t in tokens) for w in combo):
                return True
        window_tokens = tokens[:80]
        for phrase, words in self._fuzzy_phrases:
            n = len(words)
            for i in range(len(window_tokens) - n + 1):
                chunk = " ".join(window_tokens[i : i + n])
                if SequenceMatcher(None, chunk, phrase).ratio() >= FUZZY_RATIO and not (
                    i and window_tokens[i - 1] in self._kw["negators"]
                ):
                    return True
        return False

    def _active(self, session_id: str) -> bool:
        state = self._sessions.wellbeing(session_id) if self._sessions else None
        return bool(state and state.episode_expires > self._sessions.now())

    def detect(
        self, message: str, intent: Intent, pending: Pending | None, session_id: str, skip_low_mood: bool = False
    ) -> str | None:
        """Wellbeing action for this message, or None (route it normally). Never called for emergencies."""
        if self._sessions is None:
            return None
        padded = f" {normalize(message)} "
        if pending is not None and pending.kind in (PENDING_SAFETY, PENDING_NOTIFY):
            if pending.kind == PENDING_NOTIFY and self._has(padded, self._kw["decline"]):
                return "notify_no"
            explicit = self.is_anxiety(message) or any(
                self._has(padded, self._kw[k]) for k in ("notify", "talk", "grounding", "breathing", "worse", "better")
            )  # "no puedo calmarme" starts with "no" but is not the answer
            answer = None if explicit or self._router is None else self._router.answer(message, graded=False)
            if answer is not None:
                prefix = "safety" if pending.kind == PENDING_SAFETY else "notify"
                return f"{prefix}_{answer}"
        weak_help = intent.category == "ambiguous" and intent.confirm == "safety"  # "ayúdame a calmarme"
        if intent.category == "ambiguous" and (intent.wound or (intent.confirm and not weak_help)):
            return None  # an injury or safety question about a body symptom wins
        kw, active = self._kw, self._active(session_id)
        if self._has(padded, kw["notify"]):
            return "notify"
        if self._has(padded, kw["talk"]):
            return "talk"
        if active and self._has(padded, kw["worse"]):
            return "worse"
        if active and self._has(padded, kw["better"]):
            return "better"
        if self.is_anxiety(message):
            return "worse" if active else "anxiety"
        if self._has(padded, kw["grounding"]):
            return "grounding"
        if self._has(padded, kw["breathing"]):
            return "breathing"
        if self._has(padded, kw["activity"]):
            return "activity"
        if self._has(padded, kw["when_help"]):
            return "help"
        if weak_help:
            return None  # a bare "help me" keeps its safety question
        is_low = (intent.category == "support" and intent.moment == "low_mood") or self._has(padded, kw["low_mood"])
        return "low_mood" if is_low and not skip_low_mood else None

    # ------------------------------------------------------------------ responses
    def respond(self, action: str, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        state = self._sessions.wellbeing(session_id) if self._sessions else None
        if state is None:  # no session: stateless fallback
            from .sessions import WellbeingState

            state = WellbeingState()
        handler = getattr(self, f"_do_{action}")
        return handler(state, session_id, lang, crew)

    def _out(
        self, text: str, lang: str, suggestions: list[str] | None = None, guide: str | None = None, moment: str | None = None
    ) -> ChatResponse:
        return ChatResponse(
            category="support",
            reply=text,
            language=lang,
            ai_used=False,
            moment=moment,
            source=f"Moon-C support advice v{self._advice.get('version', '?')} (shared/support_advice.json); "
            "supuesto: validar con profesional de salud mental",
            suggestions=suggestions or [],
            guide=guide,
        )

    def _buttons(self, lang: str) -> list[str]:
        return list(_bridge(lang)["buttons"])

    def _notify(self, state: WellbeingState, crew: CrewMember | None) -> None:
        """Alert the crew and the medical officer. Only the alert type is recorded, never the conversation."""
        state.notified = True
        if self._alerts is not None:
            self._alerts.support(crew.crew_id if crew else None, crew.name if crew else None)

    def _is_new_episode(self, state: WellbeingState, session_id: str, now: float) -> None:
        state.episode_expires = now + EPISODE_TTL_S
        state.rounds, state.grounded, state.safety, state.notified = 0, False, None, False

    def _repeated(self, key: str) -> bool:
        """Record this episode (timestamp only) and say whether there was another one in the window."""
        now = self._wall()
        recent = [t for t in self._episodes.get(key, []) if now - t < RECURRENCE_WINDOW_S]
        repeated = bool(recent)
        recent.append(now)
        self._episodes[key] = recent[-MAX_EPISODES_KEPT:]
        for k in [k for k, v in self._episodes.items() if not v or now - v[-1] >= RECURRENCE_WINDOW_S]:
            del self._episodes[k]
        return repeated

    def _cues(self, lang: str) -> str:  # texts in a language without a translation fall back to English
        b = self._anx["breathing"]
        cues = b["cues"]
        return f"{cues['inhale'][lang]} ({b['inhale_s']} s). {cues['exhale'][lang]} ({b['exhale_s']} s)."

    def _stay(self, state: WellbeingState, lang: str) -> str:
        lines = self._anx["stay_with_me"][lang]
        allowed = [i for i in range(len(lines)) if i != AWAY_FROM_SAFE or state.safety == "clear"]
        state.stay_index = (state.stay_index + 1) % len(allowed)
        return lines[allowed[state.stay_index]]

    def _do_anxiety(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        self._is_new_episode(state, session_id, self._sessions.now())
        state.rounds, state.safety = 1, "asked"
        safety = self._anx["safety_check"]
        text = f"{self._anx['first_response'][lang]} {safety['question'][lang]}"
        if self._repeated(crew.crew_id if crew else f"session:{session_id}"):
            self._notify(state, crew)  # trigger repeated_episodes
            text += f" {_bridge(lang)['recurrence']}"
        self._sessions.set_pending(session_id, PENDING_SAFETY, SAFETY_PROTOCOL)
        suggestions = YES_NO.get(lang, YES_NO["en"]) + self._buttons(lang)[1:]
        return self._out(text, lang, suggestions, guide="breathing")

    def _do_safety_yes(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        state.episode_expires, state.notified = 0.0, True
        response = self._emergency(SAFETY_PROTOCOL, lang, crew)  # also alerts the crew and the medical officer
        if self._alerts is not None and crew is not None:  # AlertBoard.report reuses open alerts: no duplicates
            for protocol in EXTRA_SAFETY_ALERTS:
                self._alerts.report(crew.crew_id, crew.name, protocol)
        text = f"{self._anx['safety_check']['if_yes'][lang]} {response.reply}"
        return response.model_copy(update={"reply": text})

    def _do_safety_no(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        state.safety = "clear"
        return self._out(self._anx["safety_check"]["if_no"][lang], lang, self._buttons(lang))

    def _breathing_reply(self, state: WellbeingState, session_id: str, lang: str, start: bool) -> ChatResponse:
        if start:
            text = f"{self._anx['first_response'][lang]} {self._cues(lang)}"
        else:
            text = f"{self._stay(state, lang)} {self._cues(lang)}"
        return self._out(text, lang, self._buttons(lang), guide="breathing")

    def _do_breathing(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        starting = not self._active(session_id)
        if starting:
            self._is_new_episode(state, session_id, self._sessions.now())
        state.rounds += 1
        response = self._breathing_reply(state, session_id, lang, starting)
        if not starting:
            return response
        # A new episode started by a request: the same safety check as for acute anxiety.
        state.safety = "asked"
        self._sessions.set_pending(session_id, PENDING_SAFETY, SAFETY_PROTOCOL)
        text = f"{response.reply} {self._anx['safety_check']['question'][lang]}"
        return response.model_copy(update={"reply": text, "suggestions": YES_NO.get(lang, YES_NO["en"]) + self._buttons(lang)[1:]})

    def _do_grounding(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        if not self._active(session_id):
            self._is_new_episode(state, session_id, self._sessions.now())
        state.grounded = True
        steps = self._anx["grounding"]["steps"]
        text = " ".join(f"{i}. {s['text'][lang]}" for i, s in enumerate(steps, 1))
        return self._out(text, lang, self._buttons(lang), guide="grounding")

    def _do_worse(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        if state.rounds < 2:
            state.rounds += 1
            return self._breathing_reply(state, session_id, lang, False)
        if not state.grounded:
            return self._do_grounding(state, session_id, lang, crew)
        self._notify(state, crew)  # trigger not_improving
        state.episode_expires = self._sessions.now() + EPISODE_TTL_S
        return self._out(_bridge(lang)["not_improving"], lang, self._buttons(lang)[:2])

    def _do_better(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        state.episode_expires = 0.0
        after = self._anx["after"]
        self._sessions.set_pending(session_id, PENDING_NOTIFY, None)
        return self._out(after[lang], lang, list(after["suggestions"][lang]))

    def _do_notify(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        self._notify(state, crew)  # trigger user_asks
        return self._out(_bridge(lang)["notified"], lang, self._buttons(lang) if self._active(session_id) else [])

    _do_notify_yes = _do_notify

    def _do_notify_no(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        return self._out(_bridge(lang)["declined"], lang)

    def _do_talk(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        if self._active(session_id):
            return self._do_notify(state, session_id, lang, crew)  # trigger user_asks during an episode
        text = f"{self._tips['talk_connect']['text'][lang]} {_bridge(lang)['ask_notify']}"
        self._sessions.set_pending(session_id, PENDING_NOTIFY, None)
        return self._out(text, lang, list(self._anx["after"]["suggestions"][lang][:2]), moment="low_mood")

    def _do_activity(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        return self._out(self._tips["small_activity"]["text"][lang], lang, list(self._low["suggestions"][lang]), moment="low_mood")

    def _do_help(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        return self._out(self._low["when_to_get_help"][lang], lang, list(self._low["suggestions"][lang]), moment="low_mood")

    def _pick_tips(self, state: WellbeingState, count: int) -> list[dict[str, Any]]:
        """Tips not shown yet in this session; when they run out, the oldest shown ones come back first."""
        ids = list(self._tips)
        fresh = [i for i in ids if i not in state.tips_shown]
        self._rng.shuffle(fresh)
        chosen = fresh[:count]
        if len(chosen) < count:
            older = [i for i in state.tips_shown if i not in chosen][: count - len(chosen)]
            state.tips_shown = [i for i in state.tips_shown if i not in older]
            chosen += older
        state.tips_shown = [i for i in state.tips_shown if i not in chosen] + chosen
        return [self._tips[i] for i in chosen]

    def _do_low_mood(self, state: WellbeingState, session_id: str, lang: str, crew: CrewMember | None) -> ChatResponse:
        state.low_mood_count += 1
        tips = self._pick_tips(state, 2 if state.low_mood_count == 1 else 3)
        parts = [self._low["intro"][lang]] + [t["text"][lang] for t in tips]
        if state.low_mood_count >= 3:  # several times in this session
            parts.append(self._low["when_to_get_help"][lang])
        return self._out(" ".join(parts), lang, list(self._low["suggestions"][lang]), moment="low_mood")
