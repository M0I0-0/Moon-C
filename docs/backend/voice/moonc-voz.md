# Voice module (`moonc_voz/`)

Folder: [`moonc_voz/`](../../../moonc_voz/). Original guide by the voice team (Spanish): [`moonc_voz/LEEME.md`](../../../moonc_voz/LEEME.md).

Moon-C's own offline voice: the Piper voice **`es_MX-claude-high`** (Spanish, Mexico; one speaker; 22 050 Hz) with pitch and timbre adjusted by **Praat** (PSOLA "Change gender") and a two-band EQ. The backend loads it through `voice.py` ([tts.md](tts.md)); it can also run on its own as a library, a command-line tool or a small HTTP server.

```
moonc_voz/
├── moonc_voz.py                  library + CLI + local HTTP API
├── generar_frases.py             pre-generates fixed phrases to WAV/MP3
├── config.json                   voice settings (the modulator's values)
├── requirements.txt              piper-tts==1.8.0, praat-parselmouth==0.4.7, numpy, scipy
├── modelos/
│   ├── es_MX-claude-high.onnx    63 MB, stored with Git LFS
│   ├── es_MX-claude-high.onnx.json   Piper model config
│   └── es_MX-claude-high.MODEL_CARD  dataset and license (Apache 2.0)
├── frases/
│   ├── frases.json               id → text
│   └── audio/                    generated MP3s + indice.json
├── web/moonc-voz.js              browser player with the mouth synced to Moon-C
└── herramientas/modulador_voz.html   tune the voice by ear and copy the JSON
```

## Synthesis pipeline (`VozMoonC.sintetizar`)

1. **Piper** synthesizes the text sentence by sentence with `SynthesisConfig(length_scale = length_scale / velocidad, noise_scale, noise_w_scale = noise_w)`; a silence of `silencio_oracion` seconds goes between sentences.
2. **Praat** `Change gender` (pitch floor 75 Hz, ceiling 400 Hz, `formante`, new pitch median `tono_hz`, pitch range factor `entonacion`, duration factor 1.0).
3. **EQ**: low-shelf at 250 Hz (`calidez_db`) and high-shelf at 3.5 kHz (`brillo_db`) (RBJ Audio EQ Cookbook filters).
4. Normalize the peak to `volumen`.

Synthesis is serialized with a `threading.Lock` (onnxruntime and Praat run one synthesis at a time). `wav(text)` packs the result as 16-bit mono WAV bytes; `guardar(text, path)` writes it to a file.

## Settings (`config.json` / `AjustesVoz`)

| Key | Default | Effect |
|---|---|---|
| `tono_hz` | 175 | Pitch median (the original voice is around 186 Hz) |
| `formante` | 0.96 | Timbre: < 1 sounds "bigger", > 1 "smaller" |
| `entonacion` | 1.0 | < 1 flatter (robotic), > 1 more expressive |
| `velocidad` | 1.0 | Speed, applied in Piper so it does not change the pitch |
| `brillo_db` | 0 | High-shelf gain at 3.5 kHz |
| `calidez_db` | 0 | Low-shelf gain at 250 Hz |
| `noise_w` | 0.9 | Rhythm variation (higher = less monotonous) |
| `noise_scale` | 0.667 | Piper timbre variation |
| `length_scale` | 1.05 | Base phoneme duration |
| `silencio_oracion` | 0.25 | Pause between sentences (s) |
| `volumen` | 0.9 | Normalized peak (0–1) |

`AjustesVoz.desde_dict()` also accepts the nested JSON copied from the modulator (`{"eq": {...}, "piper": {...}}`); unknown keys are ignored. `AjustesVoz.cargar(path)` returns the defaults if the file does not exist.

## Using it

As a library (this is what the backend does):

```python
from moonc_voz import VozMoonC, AjustesVoz
voz = VozMoonC()                          # load once: model + config.json
wav = voz.wav("Atención: tu pulso está alto.")
audio = voz.sintetizar("Hola")            # float32 numpy array at voz.sr Hz
voz.wav("Hola", AjustesVoz(tono_hz=170))  # settings per call
```

From the command line:

```bash
python moonc_voz.py "Hola, soy Moon-C" -o hola.wav
python moonc_voz.py --config otro.json "Hola"
python moonc_voz.py --servir              # HTTP API on http://127.0.0.1:8765
```

### Standalone HTTP API (`--servir`)

A minimal server built on the standard library (the backend does **not** use it; it has its own `POST /tts`).

| Route | Behavior |
|---|---|
| `GET /salud` | `{ok: true, ajustes: {...}}` |
| `POST /tts` | Body `{"texto": "...", "ajustes": {...optional}}` → `audio/wav`. Text capped at 1000 characters, body at 64 kB. Errors → 400 `{"error": "..."}` |
| `OPTIONS *` | CORS preflight |

| Environment variable | Default |
|---|---|
| `MOONC_VOZ_MODELO` | `modelos/es_MX-claude-high.onnx` |
| `MOONC_VOZ_CONFIG` | `config.json` |
| `MOONC_VOZ_HOST` | `127.0.0.1` (local only; do not expose it without authentication) |
| `MOONC_VOZ_PUERTO` | `8765` |
| `MOONC_VOZ_CORS` | `*` (set the front-end origin in production) |

## Pre-generated phrases (`generar_frases.py`)

For fixed texts (alerts, maneuver lines) with zero latency and no Python at runtime:

```bash
python generar_frases.py --mp3          # frases/frases.json → frases/audio/*.mp3 + indice.json (MP3 needs ffmpeg)
python generar_frases.py --frases mis.json --salida audio/ --config config.json
```

`frases.json` maps an id to a text (`saludo`, `alerta_pulso`, `guia_rcp` today); `indice.json` maps each id to its file and text. The current app synthesizes on demand through the backend and does not use these files.

## Browser player (`web/moonc-voz.js`)

`crearVozMoonC({ moon, api, ganancia = 6, suavizado = 0.35, cache = 32 })` returns `{ decir(texto, ajustes?), reproducir(url), detener(), hablando }`. It plays the WAV/MP3 through Web Audio, measures the RMS volume each frame and calls `moon.setMouth(level)` / `moon.talk(bool)` so Moon-C's mouth follows the real audio. Responses are cached (32 phrases).

The front-end's `src/lib/moonVoice.js` is based on this player, with one difference: it splits the text into sentences and plays one while the next is synthesized ([frontend/lib/voice.md](../../frontend/lib/voice.md)).

## Modulator (`herramientas/modulador_voz.html`)

A standalone page (open it in a browser, no server or Python needed) to tune the voice by ear. It embeds pre-rendered clips of three sample phrases (alert, greeting, CPR guide) for every pitch (160–190 Hz, in 5 Hz steps) and five formant values, and applies speed, brightness and warmth live with Web Audio. Presets: *Original sin procesar*, *Neutra*, *Cálida*, *Clara*. **Copiar ajustes** copies the JSON (nested `eq` and `piper` format), which can be pasted into `config.json` as is.

## Licenses

| Component | License |
|---|---|
| Voice model `es_MX-claude-high` | Apache 2.0 (`modelos/es_MX-claude-high.MODEL_CARD`) |
| `piper-tts` 1.8 (OHF-Voice/piper1-gpl) | GPL-3.0-or-later |
| `praat-parselmouth` | GPL-3.0 |
| numpy, scipy | BSD |

GPL-3.0 means that distributing software that includes these libraries requires publishing its code under the GPL. Alternatives if needed: `piper-tts==1.2.0` (MIT, different API) or the Piper binary as a separate process. This is not legal advice.

## Performance

Measured on a 2-core CPU: 0.16 s for a short phrase and 0.48 s for a 66-character one; about 3 s to load the model.
