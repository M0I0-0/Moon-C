# Moon-C · módulo de voz (offline)

Voz **es_MX-claude-high** (Piper) con tono y timbre neutralizados mediante Praat (PSOLA). Funciona sin internet.

```
moonc_voz/
├── moonc_voz.py          # librería + CLI + API HTTP local
├── generar_frases.py     # pre-genera frases fijas a WAV/MP3
├── config.json           # ajustes de la voz (los del modulador)
├── requirements.txt
├── modelos/              # es_MX-claude-high.onnx (+ .json, MODEL_CARD) — 63 MB
├── frases/
│   ├── frases.json       # id → texto
│   └── audio/            # MP3 ya generados + indice.json
├── web/moonc-voz.js      # reproductor de navegador + boca sincronizada con Moon-C
└── herramientas/modulador_voz.html   # para afinar la voz a oído y copiar el JSON
```

## 1. Instalación
Python 3.9+ (probado con 3.11). `ffmpeg` solo se necesita si quieres MP3.
```bash
pip install -r requirements.txt
```

## 2. Dos formas de usarlo

| Modo | Cuándo usarlo | Trade-off |
|---|---|---|
| **A. Frases pregeneradas** (`generar_frases.py` → MP3) | Alertas y guías de maniobras con texto fijo | Cero latencia y sin Python en producción; cada texto nuevo exige regenerar |
| **B. API local** (`moonc_voz.py --servir`) | Respuestas dinámicas del chatbot | Cualquier texto; necesita Python en el equipo; medido: 0.16 s para una frase corta y 0.48 s para una de 66 caracteres en un CPU de 2 núcleos |

### A. Pregenerar
```bash
python generar_frases.py --mp3                # lee frases/frases.json → frases/audio/
```

### B. API HTTP local
```bash
python moonc_voz.py --servir                  # http://127.0.0.1:8765
```
- `GET /salud` devuelve `{ok, ajustes}`.
- `POST /tts` con body `{"texto": "...", "ajustes": {...opcional}}` devuelve `audio/wav` (mono, 22 050 Hz). Errores: 400 + `{"error"}`. El texto tiene un tope de 1000 caracteres.

| Variable de entorno | Default |
|---|---|
| `MOONC_VOZ_MODELO` | `modelos/es_MX-claude-high.onnx` |
| `MOONC_VOZ_CONFIG` | `config.json` |
| `MOONC_VOZ_HOST` | `127.0.0.1` (solo local; no exponer a red sin autenticación) |
| `MOONC_VOZ_PUERTO` | `8765` |
| `MOONC_VOZ_CORS` | `*` (en producción, poner el origen del front) |

### Como librería (si el backend ya es Python)
```python
from moonc_voz import VozMoonC, AjustesVoz
voz = VozMoonC()                                   # cargar una vez al arrancar
wav = voz.wav("Atención: tu pulso está alto.")     # bytes WAV
audio = voz.sintetizar("Hola")                     # np.float32, voz.sr Hz
voz.wav("Hola", AjustesVoz(tono_hz=170))           # ajustes por llamada
```
También se puede montar `VozMoonC.wav()` en una ruta de FastAPI o Flask existente en lugar de usar `servir()`.

## 3. Front: boca sincronizada
```js
import { crearVozMoonC } from './moonc_voz/web/moonc-voz.js';
const moon = await montarMoonC(el, { base: './Model3D/' });   // el que ya tienen
const voz  = crearVozMoonC({ moon, api: 'http://127.0.0.1:8765' });

await voz.reproducir('./moonc_voz/frases/audio/alerta_pulso.mp3'); // modo A
await voz.decir('Tu frecuencia cardiaca ya se estabilizó.');       // modo B
voz.detener();
```
Usa `moon.talk()` y `moon.setMouth(volumen)`. La boca se calibra con `ganancia` (6 por defecto; bájala si la boca se abre de más) y `suavizado` (0–1). Las respuestas de la API se guardan en caché (32 frases).
Los navegadores solo permiten audio después de un clic o toque del usuario, así que la primera llamada debe salir de un gesto.

## 4. Ajustes (`config.json`)
| Clave | Default | Efecto |
|---|---|---|
| `tono_hz` | 175 | Mediana del tono. La voz original ronda 186 Hz |
| `formante` | 0.96 | Timbre: <1 suena más "grande", >1 más "pequeña" |
| `entonacion` | 1.0 | <1 suena más plana y robótica; >1 más expresiva |
| `velocidad` | 1.0 | Se aplica en Piper, así que no altera el tono |
| `brillo_db` / `calidez_db` | 0 | EQ shelving de 3.5 kHz / 250 Hz |
| `noise_w` | 0.9 | Variación de ritmo (más alto = menos monótono) |
| `noise_scale` | 0.667 | Variación de timbre de Piper |
| `length_scale` | 1.05 | Duración base de los fonemas |
| `silencio_oracion` | 0.25 | Pausa entre oraciones (s) |

`config.json` acepta tal cual el JSON que copia `herramientas/modulador_voz.html` (formato con `eq` y `piper` anidados).

## 5. Licencias (revisar antes de distribuir)
| Componente | Licencia |
|---|---|
| Modelo de voz `es_MX-claude-high` | Apache 2.0 (ver `modelos/MODEL_CARD`) |
| `piper-tts` 1.8 (OHF-Voice/piper1-gpl) | GPL-3.0-or-later |
| `praat-parselmouth` | GPL-3.0 |
| numpy / scipy | BSD |

GPL-3.0 implica que, si se **distribuye** software que incluye estas librerías, hay que publicar su código bajo GPL. Un proyecto abierto de hackathon normalmente cumple; un producto cerrado no. Alternativas si hiciera falta: usar `piper-tts==1.2.0` (MIT, API distinta) o el binario de Piper como proceso aparte. La interpretación legal debe validarla quien vea licencias en Techmaleon; esto no es asesoría legal.
