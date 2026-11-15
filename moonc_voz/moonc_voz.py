"""Moon-C · módulo de voz offline.

Piper (voz es_MX-claude-high) + Praat/PSOLA para tono y timbre + EQ de dos bandas.
Uso como librería:
    from moonc_voz import VozMoonC
    voz = VozMoonC()                       # carga modelo y config.json una sola vez
    wav_bytes = voz.wav("Hola, soy Moon-C")
Uso por terminal:
    python moonc_voz.py "Hola, soy Moon-C" -o hola.wav
    python moonc_voz.py --servir           # API HTTP local (ver LEEME.md)
Variables de entorno: MOONC_VOZ_MODELO, MOONC_VOZ_CONFIG, MOONC_VOZ_HOST, MOONC_VOZ_PUERTO, MOONC_VOZ_CORS.
"""
from __future__ import annotations
import argparse, io, json, os, threading, wave
from dataclasses import dataclass, asdict, fields
from pathlib import Path

import numpy as np
import parselmouth as pm
from parselmouth.praat import call
from piper import PiperVoice, SynthesisConfig
from scipy.signal import lfilter

RAIZ = Path(__file__).resolve().parent
MODELO = Path(os.getenv("MOONC_VOZ_MODELO", RAIZ / "modelos" / "es_MX-claude-high.onnx"))
CONFIG = Path(os.getenv("MOONC_VOZ_CONFIG", RAIZ / "config.json"))


@dataclass
class AjustesVoz:
    tono_hz: float = 175.0          # mediana de tono objetivo (la voz original ronda 186 Hz)
    formante: float = 0.96          # <1 voz más "grande", >1 más "pequeña"
    entonacion: float = 1.0         # 1 = natural; <1 más plana (suena robótica), >1 más expresiva
    velocidad: float = 1.0          # 1 = normal; se aplica en Piper (no deforma el tono)
    brillo_db: float = 0.0          # high-shelf 3.5 kHz
    calidez_db: float = 0.0         # low-shelf 250 Hz
    noise_w: float = 0.9            # variación de ritmo de Piper (más alto = menos monótono)
    noise_scale: float = 0.667      # variación de timbre de Piper (valor por defecto)
    length_scale: float = 1.05      # duración base de fonemas
    silencio_oracion: float = 0.25  # segundos entre oraciones
    volumen: float = 0.9            # pico normalizado 0..1

    @classmethod
    def desde_dict(cls, d: dict) -> "AjustesVoz":
        """Acepta el formato plano o el JSON que copia el modulador (voz_moonc_mx.html)."""
        plano = dict(d)
        plano.update(plano.pop("eq", {}) or {})
        pip = plano.pop("piper", {}) or {}
        plano.setdefault("noise_w", pip.get("noise_w", cls.noise_w))
        plano.setdefault("length_scale", pip.get("length_scale", cls.length_scale))
        validos = {f.name for f in fields(cls)}
        return cls(**{k: float(v) for k, v in plano.items() if k in validos})

    @classmethod
    def cargar(cls, ruta: Path | str = CONFIG) -> "AjustesVoz":
        ruta = Path(ruta)
        return cls.desde_dict(json.loads(ruta.read_text("utf-8"))) if ruta.exists() else cls()


def _shelf(x: np.ndarray, sr: int, f0: float, db: float, alto: bool) -> np.ndarray:
    """Filtro shelving RBJ (Audio EQ Cookbook), pendiente S=1."""
    if abs(db) < 0.05:
        return x
    A = 10 ** (db / 40); w = 2 * np.pi * f0 / sr; cw, sw = np.cos(w), np.sin(w)
    al = sw / 2 * np.sqrt(2); s = 2 * np.sqrt(A) * al; k = -1 if alto else 1
    b = [A * ((A + 1) + k * (A - 1) * cw + s), -2 * k * A * ((A - 1) + k * (A + 1) * cw), A * ((A + 1) + k * (A - 1) * cw - s)]
    a = [(A + 1) - k * (A - 1) * cw + s, 2 * k * ((A - 1) - k * (A + 1) * cw), (A + 1) - k * (A - 1) * cw - s]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x)


class VozMoonC:
    def __init__(self, modelo: Path | str = MODELO, ajustes: AjustesVoz | None = None):
        self.voz = PiperVoice.load(str(modelo))
        self.sr = self.voz.config.sample_rate
        self.ajustes = ajustes or AjustesVoz.cargar()
        self._lock = threading.Lock()   # onnxruntime/praat: una síntesis a la vez

    def sintetizar(self, texto: str, ajustes: AjustesVoz | None = None) -> np.ndarray:
        """Devuelve audio float32 mono a self.sr Hz."""
        a = ajustes or self.ajustes
        cfg = SynthesisConfig(length_scale=a.length_scale / max(a.velocidad, 0.1),
                              noise_scale=a.noise_scale, noise_w_scale=a.noise_w)
        pausa = np.zeros(int(a.silencio_oracion * self.sr), dtype=np.float32)
        with self._lock:
            trozos = []
            for ch in self.voz.synthesize(texto, syn_config=cfg):
                trozos += [ch.audio_int16_array.astype(np.float32) / 32768, pausa]
            if not trozos:
                return np.zeros(0, dtype=np.float32)
            x = np.concatenate(trozos[:-1] or trozos)
            s = pm.Sound(x.astype(np.float64), self.sr)
            # Change gender: piso, techo de tono, factor formante, mediana nueva, factor de rango, factor de duración
            y = call(s, "Change gender", 75, 400, a.formante, a.tono_hz, a.entonacion, 1.0).values[0]
        y = _shelf(y, self.sr, 250, a.calidez_db, alto=False)
        y = _shelf(y, self.sr, 3500, a.brillo_db, alto=True)
        pico = np.max(np.abs(y)) or 1.0
        return (y / pico * a.volumen).astype(np.float32)

    def wav(self, texto: str, ajustes: AjustesVoz | None = None) -> bytes:
        y = self.sintetizar(texto, ajustes)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(self.sr)
            w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
        return buf.getvalue()

    def guardar(self, texto: str, ruta: Path | str, ajustes: AjustesVoz | None = None) -> Path:
        ruta = Path(ruta); ruta.write_bytes(self.wav(texto, ajustes)); return ruta


def servir(voz: VozMoonC) -> None:
    """API mínima con la librería estándar. POST /tts {"texto": "...", "ajustes": {...opcional}} → audio/wav."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    host = os.getenv("MOONC_VOZ_HOST", "127.0.0.1"); puerto = int(os.getenv("MOONC_VOZ_PUERTO", "8765"))
    cors = os.getenv("MOONC_VOZ_CORS", "*")
    MAX_TXT = 1000

    class H(BaseHTTPRequestHandler):
        def _cab(self, code, tipo="application/json"):
            self.send_response(code); self.send_header("Content-Type", tipo)
            self.send_header("Access-Control-Allow-Origin", cors)
            self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.end_headers()

        def do_OPTIONS(self): self._cab(204)

        def do_GET(self):
            if self.path == "/salud":
                self._cab(200); self.wfile.write(json.dumps({"ok": True, "ajustes": asdict(voz.ajustes)}).encode())
            else:
                self._cab(404); self.wfile.write(b'{"error":"no encontrado"}')

        def do_POST(self):
            if self.path != "/tts":
                self._cab(404); self.wfile.write(b'{"error":"no encontrado"}'); return
            try:
                n = int(self.headers.get("Content-Length", 0))
                d = json.loads(self.rfile.read(min(n, 64_000)) or b"{}")
                texto = str(d.get("texto", "")).strip()[:MAX_TXT]
                if not texto:
                    raise ValueError("falta 'texto'")
                aj = AjustesVoz.desde_dict({**asdict(voz.ajustes), **d["ajustes"]}) if d.get("ajustes") else None
                audio = voz.wav(texto, aj)
            except Exception as e:  # respuesta controlada, sin traza al cliente
                self._cab(400); self.wfile.write(json.dumps({"error": str(e)}).encode()); return
            self._cab(200, "audio/wav"); self.wfile.write(audio)

        def log_message(self, *a): pass

    print(f"Moon-C voz escuchando en http://{host}:{puerto}  (POST /tts, GET /salud)")
    ThreadingHTTPServer((host, puerto), H).serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Voz offline de Moon-C")
    ap.add_argument("texto", nargs="?", help="texto a sintetizar")
    ap.add_argument("-o", "--salida", default="moonc.wav")
    ap.add_argument("--config", default=str(CONFIG), help="JSON de ajustes (formato plano o del modulador)")
    ap.add_argument("--servir", action="store_true", help="levanta la API HTTP local")
    arg = ap.parse_args()
    v = VozMoonC(ajustes=AjustesVoz.cargar(arg.config))
    if arg.servir:
        servir(v)
    elif arg.texto:
        print("Guardado:", v.guardar(arg.texto, arg.salida))
    else:
        ap.print_help()
