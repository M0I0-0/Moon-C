# The Moon-C character (`moonc.js`)

Source: [`Model3D/moonc/moonc.js`](../../../Model3D/moonc/moonc.js).

`moonc.js` turns the rigged GLB into a living character: body animations by state, and a face drawn by a **shader** on top of a baked face texture (eyelids, eyebrows, gaze and mouth), with natural blinking and eye movements. It has no React or app dependencies.

## API

```js
import { createMoonC, iluminarEscena, STATES, FACE_PRESETS } from './moonc.js'

const gltf = await new GLTFLoader().loadAsync('moonc_nave_rig.glb')
const moon = await createMoonC({ THREE, gltf, faceUrl: 'moonc_cara.jpg', faceClosedUrl: 'moonc_cara_cerrada.png', crossfade: 0.45 })
scene.add(moon.root)
// every frame:
moon.update(dt)
```

`createMoonC({ THREE, gltf, faceUrl, faceClosedUrl?, crossfade = 0.45 })` loads both face textures (if `faceClosedUrl` is omitted it uses `<faceUrl>` with `_cerrada.png`) and returns:

| Member | Meaning |
|---|---|
| `root` | `gltf.scene`, to add to your scene |
| `mixer` | The `THREE.AnimationMixer` |
| `states` | Clip names found in the GLB |
| `state` | Current state |
| `setState(name)` | Cross-fade (0.45 s) to the clip `name` and its face preset. Unknown names are ignored |
| `update(dt)` | Advance animations, blinking, gaze, mouth and eyebrows. Call every frame |
| `action(name)` | The `AnimationAction` of a clip, or `null` (maneuvers use it to sync counts with the motion) |
| `talk(on)` | Animate the mouth with irregular syllables (3–6 per second) |
| `setMouth(level)` | Drive the mouth with a real audio level `0..1`; `null` gives it back to `talk` / the state |
| `express(preset)` | Manual face override (any `FACE_PRESETS` fields); `express(null)` clears it |
| `blink()` | Force a blink now |
| `uniforms` | The shader uniforms (advanced tuning) |

## States

`STATES` lists the 25 clips: the moods `tranquila` (calm), `atenta` (attentive), `alerta` (alert), `escuchando` (listening), `pensando` (thinking), `hablando` (talking), `sin_enlace` (no link), `saludo` (greeting), and the maneuver clips (`rcp*`, `llamar`, `senalar`, `tq_*`, `ah_*`). The app sets the moods from what is happening ([app.md](../app.md#moon-cs-mood)); guides set the maneuver clips step by step ([maneuvers.md](maneuvers.md)).

`createMoonC` starts in `tranquila`.

## Face presets

`FACE_PRESETS[state]` defines the face of each state; the maneuver states reuse or tweak them (`rcp_manos = rcp`, `llamar` = talking with raised eyebrows…). Index 0 of each pair is the character's right eye/eyebrow (the −x side).

| Field | Meaning |
|---|---|
| `lid: [r, l]` | Upper eyelid, 0 open … 1 closed |
| `low: [r, l]` | Lower eyelid (cheek rising: smile, squint) |
| `brow: [[dx, dy], [dx, dy]]` | Eyebrow offset |
| `browRot: [r, l]` | Eyebrow rotation (+ = inner end up, "puppy eyes") |
| `browS: [[w, h], [w, h]]` | Eyebrow scale |
| `look: [x, y]` | Gaze, −1 … 1 |
| `blink: [min, max]` | Seconds between blinks, or `null` for no blinking |
| `saccade`, `saccadeFast` | Amplitude and speed of small eye movements |
| `talk` | The state talks by itself (`hablando`) |
| `arc: [r, l]` | Shape of a closed eye: `+1` a happy "^" (greeting), `−1` a sleepy "‿" (`sin_enlace`) |

Examples: `pensando` looks up and to the side with one eyebrow raised; `alerta` opens the eyes wide with fast eye movements; `sin_enlace` closes the eyes in a sleepy arc and looks down; `saludo` closes them in a happy arc.

## How the face works

The body was generated with its face baked into the texture. Instead of separate eye meshes, the material's shader is patched (`onBeforeCompile`) to redraw the front of the head every frame:

- **Coordinates.** `FACE` holds positions measured on the baked face in model space (eye centers and radii, eyebrow ellipses, mouth center, colors of fur, cheeks, lashes, mouth interior and tongue).
- **Gaze.** Inside each eye, the face texture is sampled with an offset (`uLook`), so the iris moves.
- **Eyelids.** The closed-face texture (`moonc_cara_cerrada.png`, the face without eyes) provides the eyelid skin. The lid edge is a curve that moves from open to closed (or to the `arc` shape), with a lash line of even thickness, a curled lash at the outer corner and a lower lid for smiles. In the vertex shader, a closed eye's socket is filled up to the surrounding skin so it does not look sunken.
- **Eyebrows.** The light fur patches are the eyebrows: the original patch is painted over with fur color and redrawn moved, rotated and scaled (`uBrowOff`, `uBrowRot`, `uBrowS`).
- **Mouth.** Under the ":3" mouth, an opening grows with `uMouth` (mouth interior color, a tongue at the bottom and an outline).
- **Shading.** Smooth normals around the eyes and a little emissive light keep the face soft ("soft vinyl" look). Materials are set to `metalness 0`, `roughness 1`, and the normal map is toned down.

Each material gets a stable program cache key (`moonc-face-tex` or `-vc`), so the patched shader compiles once.

## The update loop

`update(dt)` every frame:

1. `mixer.update(dt)` (body animation).
2. **Blinking**: at random intervals within the preset's `blink` range; a fast close (~40 % of 0.14–0.2 s) and a slower opening; 15 % of blinks are double.
3. **Saccades**: small random gaze targets scaled by `saccade`, every 0.8–2.6 s (0.25–0.8 s with `saccadeFast`).
4. **Mouth** (see below), and eyebrows that rise slightly with the mouth while talking (emphasis).
5. Every value is eased toward its target (`damp`) and written to the uniforms.

### Mouth

Priority:

1. `setMouth(level)` with a number: the mouth follows that level. The app passes the RMS volume of Moon-C's real voice ([lib/voice.md](../lib/voice.md#mouth-sync)).
2. Otherwise, while talking (`talk(true)` or the `hablando` preset): random syllables of 0.11–0.26 s, 18 % of them closed.
3. Otherwise closed.

## `iluminarEscena(THREE, renderer, scene, { piso = -0.95, sombras = true })`

The recommended lighting for standalone pages ("soft vinyl"): neutral tone mapping, sRGB output, soft PCF shadows, a hemisphere light, a warm key light with a 2048 px shadow map, a cool fill, a rim light and a shadow-catching floor circle at height `piso`. Returns the lighting group. The React app uses its own room lighting instead ([components/scene-3d.md](../components/scene-3d.md#backdrop-backdropsjsx)).

## Changing the character

- A new mood: add a clip with the same name to the GLB, add the name to `STATES`, optionally a `FACE_PRESETS` entry, and set it from `App.jsx`.
- Fine-tune expressions in `FACE_PRESETS` (values are small: eyebrow offsets around 0.01–0.04 model units).
- If the face texture or the head mesh changes, re-measure `FACE` and the eye-plane constants in the uniforms (`uEyePl`, `uEyeN`).
