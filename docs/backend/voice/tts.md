# Text-to-speech endpoint (`voice.py`)

Source: [`Backend/app/voice.py`](../../../Backend/app/voice.py). The voice engine itself: [moonc-voz.md](moonc-voz.md). Front-end player: [frontend/lib/voice.md](../../frontend/lib/voice.md).

`POST /tts` speaks **Spanish** with Moon-C's own offline voice, built by the voice team in `moonc_voz/` (Piper `es_MX-claude-high` with pitch and timbre adjusted by Praat). It is an optional install; without it the backend runs normally and the front-end uses a local browser voice or subtitles.

## Install

```bash
git lfs pull                               # the 63 MB model is stored with Git LFS
pip install -r requirements-voice.txt      # = ../moonc_voz/requirements.txt: piper-tts 1.8.0, praat-parselmouth 0.4.7, numpy, scipy
```

> ⚠️ `piper-tts` 1.8 and `praat-parselmouth` are **GPL-3.0**. Distributing the backend with them installed means distributing it under GPL-compatible terms. The project is meant to be open source; have someone who handles licenses confirm it before distributing it any other way.

## `MoonCVoice`

```python
MoonCVoice(voice_dir: Path, enabled: bool = True)
```

| Member | Meaning |
|---|---|
| `state` | `disabled` (`MOON_C_VOICE=false`), `loading` (until `load()` finishes), `ready`, `unavailable` |
| `detail` | Why it is unavailable (no message content) |
| `languages` | `("es",)` |
| `load()` | Blocking (~3 s): imports `moonc_voz.py`, creates `VozMoonC()` (default model and `config.json` of that folder) and synthesizes "Hola." once to warm up. Run at startup with `asyncio.to_thread`, so it never delays startup |
| `wav(text)` | WAV bytes (mono, 22 050 Hz) of `spoken_form(text)[:1000]`. Raises `VoiceUnavailable` unless `ready` |

`_import_voice_module(path)` loads `moonc_voz/moonc_voz.py` by file path with `importlib` (it is not an installed package) and registers it in `sys.modules` (its dataclasses need that).

Failure reasons recorded in `detail` and logged as a warning:

| Cause | `detail` |
|---|---|
| Libraries not installed | `voice libraries not installed (<missing module, e.g. numpy>); run pip install -r requirements-voice.txt` |
| Model missing, still a Git LFS pointer, bad config… | `could not load the voice (<ExceptionType>); see moonc_voz/LEEME.md` |

## Spoken forms

Without help the Spanish voice spells units out ("72 bpm" → "be pe eme"). `spoken_form(text)` rewrites them with `SPOKEN_FORMS_ES`, a list of `(regex, replacement)` you can edit freely:

| Written | Spoken |
|---|---|
| `SpO2`, `SpO₂` | saturación de oxígeno |
| `38.2 °C` | 38.2 grados |
| `bpm`, `lpm` | latidos por minuto |
| `mmHg`, `mm Hg` | milímetros de mercurio |
| `µSv/h`, `μSv/h`, `uSv/h` | microsieverts por hora |
| `breaths/min`, `rpm` | respiraciones por minuto |
| `4/5` | 4 de 5 |
| `95 %` | 95 por ciento |
| `7 h` | 7 horas |
| `Moon-C` | Mun Si |
| `UTC` | u te ce |

## The endpoint

`POST /tts` with `SpeechRequest {text (1–1000), language = "es"}`:

1. Take a slot of `tts_slots` (`BoundedSemaphore(MOON_C_TTS_MAX_CONCURRENT)`, default 2) **without waiting**. If none is free → **429** with `Retry-After: 1`. Each synthesis holds a worker thread for 0.2–0.5 s (more for long text), so the cap keeps `/tts` from starving the rest of the API.
2. `language` not in `voice.languages` → **422** "Moon-C's voice only speaks Spanish for now."
3. Voice not ready → **503** "Moon-C's voice is loading." (or `unavailable` / `disabled` plus the detail).
4. → **200** `audio/wav` with `Cache-Control: no-store`. The slot is always released, also on errors.

The text is never stored or logged (tested).

`GET /status` reports `voice` and `voice_languages` (`["es"]` when ready), which the front-end uses to choose between Moon-C's voice and a local voice.

## Performance

On the development laptop the model loads in about 3 s and a sentence takes 0.2–0.5 s. The front-end asks for one sentence at a time and plays one while the next is synthesized, so long replies start talking right away.

## Tests

`tests/test_voice.py` uses a **fake voice module** written to a temporary folder (so tests do not need the GPL libraries): Spanish is spoken, English is refused, validation, disabled voice, a missing module does not break the backend, spoken text is never logged, the spoken forms table. `test_real_voice_produces_wav` runs only if the real voice is installed. `test_hardening.py` covers the 429 path and slot release.

## Future work

Speech-to-text is still done by the browser (online). A future on-board version could use a local engine such as **Vosk** or **whisper.cpp**, and Moon-C's voice could add English.
