# AI disclosure

This file states where and how AI tools were used in Moon-C, as the NASA Space Apps Challenge requires, and how every AI-generated element is marked in the project.

Moon-C is the team's own idea: an offline companion that helps a crew watch their health and act in time without waiting for Earth, and that never diagnoses. The team defined the requirements and the safety rules (health and emergency answers come only from the health manual, never from an AI model), made the design decisions, and reviewed and tested the results. AI was used to work faster, and inside the product only for a few clearly limited tasks.

## 1. AI tools used to build Moon-C

| Tool | What it was used for | What the team did |
|---|---|---|
| Claude and Claude Code (Anthropic) | Writing, reviewing and refactoring code and tests, and writing documentation. The whole [`docs/`](docs/README.md) folder was written with Claude Code and checked against the code | Defined what to build, decided the design, reviewed the changes and ran the tests |
| Claude (Anthropic) | Research: gathering published documents (clinical guidelines, NASA standards, spaceflight studies) where the team could find sourced reference ranges for the vital signs | Read the documents and chose the ranges. Every range cites its source in [`shared/REFERENCES.md`](shared/REFERENCES.md) and must still be validated by medical experts |

## 2. AI inside the product (at runtime)

| Component | What it does | Limits | How it is marked |
|---|---|---|---|
| Local language model: [Ollama](https://ollama.com) with `qwen3.5:4b` | Small talk and listening (greetings, a conversation after a hard moment) | Runs offline on the crew's machine. Never answers health or emergency questions: a deterministic keyword router and the manual handle those. Its replies pass a language check and a filter that discards health words and condition labels | Every reply it wrote carries `ai_used: true` in the API response (`POST /chat`), and the chat log shows an **AI** / **IA** tag next to it, with a tooltip |
| Neural text-to-speech: Piper voice `es_MX-claude-high` (Apache 2.0) + Praat | Moon-C's own Spanish voice | Runs offline. The spoken text is never stored or logged | Every `POST /tts` audio says so in its own metadata (WAV `LIST/INFO` comment) and in the `X-AI-Generated` response header. The menu says the voice is "synthesized with AI (Piper)" and the on-screen watermark says so (see below) |
| Browser speech recognition (Web Speech API in Chrome or Edge) | Dictation, when the user taps the microphone | Sends the audio to the browser's online service. Typing always works offline | The microphone tooltip and the menu say that dictation uses an online service |

The name "claude" in `es_MX-claude-high` is the name of the voice in the Piper Spanish voice collection. It is not related to Anthropic's Claude.

## 3. AI-generated media and data in the repository

| File | Content | How it is marked |
|---|---|---|
| [`Model3D/moonc/moonc_cara.jpg`](Model3D/moonc/moonc_cara.jpg), [`moonc_cara_cerrada.png`](Model3D/moonc/moonc_cara_cerrada.png) | Moon-C's face texture, generated with AI | **Visible watermark** "AI-generated · Generado con IA" in the top-left corner. That corner is a band the face shader never samples, so the character looks exactly the same in the app. Metadata: a JPEG comment / PNG text chunk and XMP with the IPTC `DigitalSourceType` `trainedAlgorithmicMedia` |
| [`Model3D/moonc/moonc_nave_rig.glb`](Model3D/moonc/moonc_nave_rig.glb) | Moon-C's 3D model, whose texture includes that face | glTF metadata: `asset.extras.aiDisclosure` |
| The running app | Moon-C on screen, speaking | **Visible watermark** over the 3D scene, always shown: "Generado con IA: cara y voz de Moon-C" / "AI-generated: Moon-C's face and voice" (with a tooltip that explains it). Every screenshot or video of the app carries it |
| [`moonc_voz/frases/audio/*.mp3`](moonc_voz/frases/audio/) | Pre-generated phrases spoken with the Piper voice | ID3 tags: comment, artist "Moon-C (voz sintetizada con IA / AI-synthesized voice)" and `TXXX:AI_GENERATED=true`. [`indice.json`](moonc_voz/frases/audio/indice.json) says so in its `ia` field. [`generar_frases.py`](moonc_voz/generar_frases.py) adds the same metadata to every phrase it generates |
| [`docs/`](docs/README.md) | Developer documentation | Written with Claude Code; stated at the end of [`docs/README.md`](docs/README.md) |

No AI-generated content in this repository uses, contains or modifies NASA logos, flags, mission identifiers or other NASA brand elements.

## 4. How to check the marks

- **Chat:** with Ollama running, say "hola" to Moon-C: the reply shows the **IA** tag in the log, and `POST /chat` returns `"ai_used": true`. Health and emergency replies never show it.
- **Voice:** `curl -D - -o hola.wav localhost:8000/tts -H "Content-Type: application/json" -d "{\"text\":\"Hola\"}"` prints the `X-AI-Generated` header; the comment is also inside `hola.wav` (file properties, or `exiftool hola.wav`).
- **Images:** open the face textures to see the watermark; `exiftool moonc_cara.jpg` shows the comment and `DigitalSourceType`.
- **Pre-generated audio:** file properties of any MP3 in `moonc_voz/frases/audio/` (or `exiftool`).

## 5. Keeping this file up to date

- A new AI-generated **image or video** needs a visible watermark (for example "Generado con IA") before it goes into the project, the demo video or the slides.
- New AI-generated **audio, code or data** needs a line in this file and metadata in the file itself where the format allows it.
- Do not use, generate or modify NASA logos, flags or mission identifiers with AI.
