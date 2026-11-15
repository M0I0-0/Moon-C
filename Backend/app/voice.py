"""Moon-C's own voice: offline text-to-speech from moonc_voz/ (Piper + Praat). Spanish only.

The voice module was built by the voice team (moonc_voz/, see its LEEME.md). Its libraries
(piper-tts and praat-parselmouth, both GPL-3.0) are an optional install:

    pip install -r requirements-voice.txt

Without them, or without the model (moonc_voz/modelos, stored with Git LFS), the backend runs
normally, /status reports the voice as unavailable and the front-end uses a local browser voice
or subtitles. The text sent to /tts is never stored or logged.
"""

from __future__ import annotations

import importlib.util
import logging
import re
import sys
from pathlib import Path
from typing import Literal

log = logging.getLogger("moon_c.voice")

VoiceState = Literal["disabled", "loading", "ready", "unavailable"]
LANGUAGES = ("es",)
MAX_CHARS = 1000

# AI disclosure (NASA Space Apps rules, see AI_DISCLOSURE.md): every WAV served by /tts says in its own
# metadata that it is AI-synthesized speech. Never put the spoken text in the metadata.
AI_AUDIO_NOTE = "AI-generated speech: Piper neural text-to-speech (es_MX-claude-high) + Praat. Moon-C's voice."
AI_AUDIO_SOFTWARE = "Moon-C moonc_voz (Piper TTS + Praat)"

# How units, abbreviations and the name are read aloud. Without this the Spanish voice spells
# them out ("72 bpm" -> "be pe eme"). Edit freely: (pattern, spoken form).
SPOKEN_FORMS_ES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bSpO(?:2|₂)"), "saturación de oxígeno"),
    (re.compile(r"(\d)\s*°\s*C\b"), r"\1 grados"),
    (re.compile(r"\b(?:bpm|lpm)\b"), "latidos por minuto"),
    (re.compile(r"\bmm ?Hg\b"), "milímetros de mercurio"),
    (re.compile(r"[µμu]Sv/h"), "microsieverts por hora"),
    (re.compile(r"\bbreaths/min\b|\brpm\b"), "respiraciones por minuto"),
    (re.compile(r"(\d)\s*/\s*5\b"), r"\1 de 5"),
    (re.compile(r"(\d)\s*%"), r"\1 por ciento"),
    (re.compile(r"(\d)\s*h\b"), r"\1 horas"),
    (re.compile(r"\bMoon-C\b"), "Mun Si"),
    (re.compile(r"\bUTC\b"), "u te ce"),
]


def spoken_form(text: str) -> str:
    """Rewrite units and abbreviations the way they should be heard."""
    for pattern, replacement in SPOKEN_FORMS_ES:
        text = pattern.sub(replacement, text)
    return text


def _info_subchunk(chunk_id: bytes, text: str) -> bytes:
    data = text.encode("ascii", "replace") + b"\x00"
    if len(data) % 2:
        data += b"\x00"
    return chunk_id + len(data).to_bytes(4, "little") + data


def with_ai_metadata(wav: bytes) -> bytes:
    """Append a RIFF LIST/INFO chunk (comment and software) saying the audio is AI-generated.

    Players ignore it; anything that is not a RIFF/WAVE file is returned unchanged.
    """
    if len(wav) < 12 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        return wav
    info = b"INFO" + _info_subchunk(b"ICMT", AI_AUDIO_NOTE) + _info_subchunk(b"ISFT", AI_AUDIO_SOFTWARE)
    pad = b"\x00" if len(wav) % 2 else b""  # RIFF chunks start on even offsets
    out = wav + pad + b"LIST" + len(info).to_bytes(4, "little") + info
    return out[:4] + (len(out) - 8).to_bytes(4, "little") + out[8:]


class VoiceUnavailable(RuntimeError):
    pass


def _import_voice_module(path: Path):
    """Load moonc_voz.py from its folder (it is not a package installed in the venv)."""
    if not path.is_file():
        raise FileNotFoundError(path)
    spec = importlib.util.spec_from_file_location("moonc_voz", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses needs the module registered before it runs
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(spec.name, None)
        raise
    return module


class MoonCVoice:
    def __init__(self, voice_dir: Path, enabled: bool = True):
        self.voice_dir = voice_dir
        self.state: VoiceState = "loading" if enabled else "disabled"
        self.detail = ""
        self.languages = LANGUAGES
        self._voice = None

    def load(self) -> None:
        """Import the module and load the model (blocking, ~3 s). Runs off the event loop at startup."""
        if self.state == "disabled":
            return
        try:
            module = _import_voice_module(self.voice_dir / "moonc_voz.py")
            # Its defaults read moonc_voz/modelos/es_MX-claude-high.onnx and moonc_voz/config.json.
            self._voice = module.VozMoonC()
            self._voice.wav("Hola.")  # warm-up: the first synthesis is slower
        except ImportError as exc:
            self._unavailable(f"voice libraries not installed ({exc.name}); run pip install -r requirements-voice.txt")
        except Exception as exc:  # missing model, Git LFS pointer instead of the model, bad config...
            self._unavailable(f"could not load the voice ({type(exc).__name__}); see moonc_voz/LEEME.md")
        else:
            self.state = "ready"
            log.info("Moon-C voice ready (%s Hz).", self._voice.sr)

    def _unavailable(self, why: str) -> None:
        self.state = "unavailable"
        self.detail = why
        log.warning("Moon-C voice unavailable: %s. The front-end will use a local browser voice.", why)

    def wav(self, text: str) -> bytes:
        """WAV bytes (mono, 22 050 Hz), marked as AI-generated in their metadata.

        The module serialises synthesis with its own lock.
        """
        if self.state != "ready" or self._voice is None:
            raise VoiceUnavailable(self.state)
        return with_ai_metadata(self._voice.wav(spoken_form(text)[:MAX_CHARS]))
