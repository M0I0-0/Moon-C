"""Moon-C's voice (/tts): optional loading, Spanish only, spoken forms, privacy."""

from __future__ import annotations

import importlib.util
import logging
import time

import pytest

from app.config import REPO_DIR
from app.voice import AI_AUDIO_NOTE, MoonCVoice, spoken_form, with_ai_metadata

# Same shape as moonc_voz/moonc_voz.py (dataclass + `from __future__ import annotations` on purpose:
# loading it requires registering the module first). It returns the text it was asked to say.
FAKE_MODULE = '''
from __future__ import annotations
from dataclasses import dataclass

@dataclass
class AjustesVoz:
    tono_hz: float = 175.0

class VozMoonC:
    sr = 22050
    def __init__(self, *args, **kwargs):
        self.ajustes = AjustesVoz()
    def wav(self, texto, ajustes=None):
        return b"RIFF" + texto.encode("utf-8")
'''


@pytest.fixture
def fake_voice_dir(tmp_path):
    folder = tmp_path / "moonc_voz"
    folder.mkdir()
    (folder / "moonc_voz.py").write_text(FAKE_MODULE, encoding="utf-8")
    return folder


def wait_for_voice(client, timeout=10.0) -> dict:
    deadline = time.monotonic() + timeout
    status = client.get("/status").json()
    while status["voice"] == "loading" and time.monotonic() < deadline:
        time.sleep(0.05)
        status = client.get("/status").json()
    return status


def test_voice_speaks_spanish(make_client, fake_voice_dir):
    client = make_client(voice=True, voice_dir=fake_voice_dir)
    status = wait_for_voice(client)
    assert status["voice"] == "ready" and status["voice_languages"] == ["es"]
    res = client.post("/tts", json={"text": "Hola, soy Moon-C. Tu pulso: 72 bpm."})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert res.headers["cache-control"] == "no-store"
    assert res.content == "RIFFHola, soy Mun Si. Tu pulso: 72 latidos por minuto.".encode()


def test_voice_is_marked_as_ai_generated(make_client, fake_voice_dir):
    client = make_client(voice=True, voice_dir=fake_voice_dir)
    wait_for_voice(client)
    res = client.post("/tts", json={"text": "Hola"})
    assert res.status_code == 200
    assert res.headers["x-ai-generated"] == AI_AUDIO_NOTE


def test_wav_metadata_says_the_audio_is_ai_generated():
    import io
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"\x01\x00" * 100)
    marked = with_ai_metadata(buffer.getvalue())
    assert marked[:4] == b"RIFF" and marked[8:12] == b"WAVE"
    assert int.from_bytes(marked[4:8], "little") == len(marked) - 8
    assert b"LIST" in marked and b"INFO" in marked and AI_AUDIO_NOTE.encode() in marked
    with wave.open(io.BytesIO(marked)) as w:  # still a valid WAV with the same audio
        assert w.getframerate() == 22050 and w.readframes(100) == b"\x01\x00" * 100
    assert with_ai_metadata(b"RIFFnot a wav") == b"RIFFnot a wav"


def test_english_is_not_spoken_by_moon_c_voice(make_client, fake_voice_dir):
    client = make_client(voice=True, voice_dir=fake_voice_dir)
    wait_for_voice(client)
    assert client.post("/tts", json={"text": "Hello", "language": "en"}).status_code == 422


def test_validation(make_client, fake_voice_dir):
    client = make_client(voice=True, voice_dir=fake_voice_dir)
    wait_for_voice(client)
    assert client.post("/tts", json={"text": ""}).status_code == 422
    assert client.post("/tts", json={"text": "x" * 1001}).status_code == 422


def test_disabled_voice(client):
    status = client.get("/status").json()
    assert status["voice"] == "disabled" and status["voice_languages"] == []
    assert client.post("/tts", json={"text": "Hola"}).status_code == 503


def test_missing_voice_module_does_not_break_the_backend(make_client, tmp_path):
    client = make_client(voice=True, voice_dir=tmp_path / "nowhere")
    assert wait_for_voice(client)["voice"] == "unavailable"
    res = client.post("/tts", json={"text": "Hola"})
    assert res.status_code == 503 and "unavailable" in res.json()["detail"]
    assert client.post("/chat", json={"session_id": "s", "message": "chest pain"}).json()["category"] == "emergency"


def test_spoken_text_is_never_logged(make_client, fake_voice_dir, caplog):
    client = make_client(voice=True, voice_dir=fake_voice_dir)
    wait_for_voice(client)
    with caplog.at_level(logging.DEBUG):
        client.post("/tts", json={"text": "Frase secreta zebra-42"})
    assert "zebra" not in caplog.text


@pytest.mark.parametrize(
    ("text", "spoken"),
    [
        ("Alerta: Moisés, temperatura corporal 38.2 °C", "Alerta: Moisés, temperatura corporal 38.2 grados"),
        ("SpO2 95 %", "saturación de oxígeno 95 por ciento"),
        ("SpO₂", "saturación de oxígeno"),
        ("presión 120 mmHg", "presión 120 milímetros de mercurio"),
        ("radiación 28 µSv/h", "radiación 28 microsieverts por hora"),
        ("frecuencia respiratoria 16 rpm", "frecuencia respiratoria 16 respiraciones por minuto"),
        ("ánimo 1/5", "ánimo 1 de 5"),
        ("dormiste 6.4 h", "dormiste 6.4 horas"),
        ("Ventana a las 16:40 UTC", "Ventana a las 16:40 u te ce"),
        ("Hola, soy Moon-C.", "Hola, soy Mun Si."),
        ("hora de comer", "hora de comer"),  # words are not touched
    ],
)
def test_spoken_forms(text, spoken):
    assert spoken_form(text) == spoken


@pytest.mark.skipif(
    importlib.util.find_spec("piper") is None or not (REPO_DIR / "moonc_voz" / "modelos" / "es_MX-claude-high.onnx").is_file(),
    reason="voice libraries or model not installed",
)
def test_real_voice_produces_wav():
    voice = MoonCVoice(REPO_DIR / "moonc_voz")
    voice.load()
    assert voice.state == "ready", voice.detail
    audio = voice.wav("Hola, soy Moon-C.")
    assert audio[:4] == b"RIFF" and audio[8:12] == b"WAVE"
    assert int.from_bytes(audio[24:28], "little") == 22050
    assert len(audio) > 22050  # more than half a second of speech
    assert AI_AUDIO_NOTE.encode() in audio  # marked as AI-generated in its metadata
