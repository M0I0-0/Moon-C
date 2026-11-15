# Voice: output, mouth sync and dictation

Sources: [`front-end/src/lib/moonVoice.js`](../../../front-end/src/lib/moonVoice.js), [`front-end/src/hooks/useSpeech.js`](../../../front-end/src/hooks/useSpeech.js). Backend side: [backend/voice/tts.md](../../backend/voice/tts.md).

## Which voice speaks

| Text language | Backend online and `voice: "ready"` | Otherwise |
|---|---|---|
| Spanish | **Moon-C's own voice** (`POST /tts`), mouth synced to the audio | A local Spanish voice, else subtitles |
| English | A local English voice | A local English voice, else subtitles |

"Local" means a `speechSynthesis` voice **installed on the machine** (`localService`). Network voices ("Google español") send the text to a server and do not work offline, so they are never used. If Moon-C's voice fails for a sentence (429, 503, timeout), that sentence is spoken with a local voice.

Each text is read with a voice of its own language: Moon-C may answer in English on a Spanish screen.

## `moonVoice.js`: Moon-C's voice player

Based on the voice team's `moonc_voz/web/moonc-voz.js`, with one difference: the text is synthesized **sentence by sentence**, and each piece plays while the next one is being prepared, so a long reply (an emergency protocol) starts sounding right away.

### `splitForSpeech(text, max = 220)`

1. Collapse whitespace and split after `.`, `!`, `?`, `…`, `;` or `:`.
2. The **first sentence goes alone** (it is synthesized first and plays immediately), unless it is shorter than 12 characters.
3. Later sentences are merged up to `max` characters; a piece shorter than 12 characters ("1.") is always merged with the next, so step numbers never sound alone.
4. A sentence longer than `max` is cut at a comma or a space (`hardSplit`).

Decimals such as "38.2" are not split (the split needs whitespace after the period).

### `createMoonVoice({ fetchAudio, onLevel, ganancia = 6, suavizado = 0.35, cache = 32 })`

Returns `{ speak(text), stop(), speaking }`.

- `fetchAudio(text)` → `Promise<ArrayBuffer>` (WAV). `useSpeechOutput` passes `(text) => api.tts(text, 'es')`.
- Decoded buffers are cached by text (32 entries, oldest dropped).
- `speak(text)` stops what was playing, splits the text, prefetches the next piece while playing the current one, and resolves `true` when everything played. If the **first** piece fails the promise **rejects** (the caller switches to a local voice); if a later piece fails it resolves `false` (cut halfway).
- A single shared `AudioContext` is created on demand and resumed; it is unlocked by the first `pointerdown` or `keydown`, because browsers allow audio only after a user gesture.

### Mouth sync

While a piece plays, an `AnalyserNode` reads the waveform every animation frame and computes its RMS volume:

```js
level += (min(1, rms * ganancia) - level) * (1 - suavizado)
onLevel(level < 0.04 ? 0 : level)      // null when playback stops
```

`App` stores the level in `mouthRef`; `MoonCModel` calls `moon.setMouth(mouthRef.current)` every frame, so her mouth opens with the real audio. `null` gives the mouth back to the normal talking animation ([model3d/character.md](../model3d/character.md#mouth)). Lower `ganancia` if the mouth opens too much.

## `useSpeechOutput(lang, { moonVoice = false, onMouth })`

- Loads the browser's voice list and updates it on `voiceschanged`.
- `pickVoice(voices, lang)` (exported): among **local** voices, the exact language (`es-MX`), then another variant of the same language (`es-ES`), then any voice whose code starts with it; else `null`.
- **Speakers.** `navigator.mediaDevices.enumerateDevices()` (and on `devicechange`): `hasSpeakers` is `true` if an audio output is listed, `false` if the browser lists devices and supports `setSinkId` but none is an output, `null` when it cannot tell (Firefox, Safari).

`speak(text, { lang, onEnd, onPartial })`:

1. The previous utterance is settled: its `onEnd` runs once, even if it was interrupted.
2. Spanish text with `moonVoice` → the Moon-C player; mouth levels go to `onMouth`. Completed → `onEnd`; cut halfway → `onPartial` then `onEnd`; failed → speak this text with a local voice.
3. Otherwise → `SpeechSynthesisUtterance` with the picked local voice at rate 1.02. Without a voice for that language nothing is spoken and `onEnd` runs at once (the app shows the subtitle).

`cancel()` stops both players and settles the pending `onEnd`. `canSpeak(lang)` tells whether some voice can read that language. `supported`, `hasVoices`, `speaking` and `moonVoice` describe the current state. `App` uses them to decide subtitles and the top bar's audio pill ([app.md](../app.md#speaking-and-subtitles-saytext-speaker-spokenlang-kind)).

## `useSpeechInput(lang, onFinal)`: dictation

Uses the browser's `SpeechRecognition` / `webkitSpeechRecognition` (Chrome, Edge).

- `start()`: one utterance (`continuous = false`), interim results on, recognition language = `speechLangFor(conversation language)` (`es-MX` / `en-US`).
- `interim` holds the partial transcript (shown in the input and as a "You" subtitle); the final transcript is passed to `onFinal` (`App.send`).
- `stop()`, `listening`, `supported`, `error`, `clearError()`. The recognizer is aborted on unmount.
- Errors are shown in the screen language: `not-allowed` (microphone permission denied), `service-not-allowed`, `no-speech`, `audio-capture` (no microphone), `network` (dictation needs a connection), anything else → "The microphone could not be used." (`recognitionError(code, lang)`).

> ⚠️ Browser dictation sends the audio to an online service (Google or Microsoft) and does not work offline. The UI says so in the microphone tooltip and in the menu. Typing always works. A local engine (Vosk, whisper.cpp) is future work.

## Tests

- `src/lib/moonVoice.test.js`: the first sentence goes alone, merging up to the maximum without loose step numbers, decimals and units are not cut, short texts stay whole, very long sentences are cut at commas or spaces.
- `src/hooks/useSpeech.test.js`: `pickVoice` picks the exact local voice, then another local variant, and never a network voice.
