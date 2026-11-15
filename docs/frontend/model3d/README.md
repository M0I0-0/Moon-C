# Model3D: the Moon-C character and the guided maneuvers

Folder: [`Model3D/`](../../../Model3D/). It holds plain ES modules and assets that do not depend on React. The front-end imports them through the Vite alias `@model3d` ([configuration.md](../configuration.md#viteconfigjs)); they can also run on any web page with `moonc-escena.js`.

| Page | Covers |
|---|---|
| [character.md](character.md) | `moonc.js`: body animation, face shader, states, mouth, lighting |
| [maneuvers.md](maneuvers.md) | `maniobras.js`: environments, sources, the three guides, the controller API, English texts |

## Files

```
Model3D/
├── moonc/
│   ├── moonc.js                 character controller (createMoonC, FACE_PRESETS, iluminarEscena)
│   ├── maniobras.js             guided maneuvers (crearManiobra, MANIOBRAS, ENTORNOS, FUENTES, EN)
│   ├── moonc-escena.js          standalone mount for any page (montarMoonC)
│   ├── moonc_nave_rig.glb       Moon-C's rigged body + 25 animation clips (2.9 MB)
│   ├── moonc_cara.jpg           face "decal" read by the face shader
│   ├── moonc_cara_cerrada.png   the same face without eyes (eyelid skin, closed eyes)
│   ├── maniqui_rcp.glb          CPR manikin (morph target `compresion`)
│   ├── maniqui_brazo.glb        arm manikin for the tourniquet
│   ├── maniqui_torso.glb        torso manikin for choking (morph target `empuje`)
│   ├── metodo_pino.jpg          illustration: the "pine" CPR method in microgravity
│   └── heimlich.jpg             illustration: abdominal thrusts
└── vendor/three/                three.js r169 (MIT) for standalone pages: three.module.js,
                                 GLTFLoader.js, BufferGeometryUtils.js, LICENSE
```

### The rig (`moonc_nave_rig.glb`)

- One skin with bones `hips`, `spine`, `chest`, `neck`, `head`, three ear bones per side, `upperarm`/`forearm` and `thigh`/`shin` per side, and a four-bone tail.
- Meshes: the body (`Mesh_0`, material `MoonC_piel`) and two arm meshes (`Brazo_L`, `Brazo_R`, material `MoonC_brazo`).
- **25 animation clips named after the states**: `tranquila`, `atenta`, `alerta`, `escuchando`, `pensando`, `hablando`, `sin_enlace`, `saludo`, and the maneuver clips `rcp`, `rcp_manos`, `rcp_hombros`, `rcp_respira`, `rcp_er_pos`, `rcp_er`, `llamar`, `senalar`, `tq_colocar`, `tq_jalar`, `tq_girar`, `tq_trabar`, `ah_sostener`, `ah_golpes`, `ah_abrazo`, `ah_empuje`, `ah_cuenta`.

`moon.setState(name)` plays the clip with that name, so a new state needs a clip in the GLB and (optionally) a face preset.

## How the front-end uses it

| What | Where |
|---|---|
| Load the body and create the character | `src/components/MoonCModel.jsx` → `createMoonC()` ([components/scene-3d.md](../components/scene-3d.md#mooncmodel)) |
| Open a guide next to Moon-C | `MoonCModel.jsx` → `crearManiobra()` |
| Manikin and illustration URLs, cameras, when to open a guide, the report | `src/lib/maneuvers.js` ([lib/maneuvers.md](../lib/maneuvers.md)) |
| Step panel | `src/components/ManeuverPanel.jsx` |

Assets are imported with `?url` (`import glbUrl from '@model3d/moonc/moonc_nave_rig.glb?url'`) and passed explicitly (`archivos`), because the modules would otherwise build URLs from a `base` folder. `maniobras.js` imports `three/addons/loaders/GLTFLoader.js` dynamically; Vite aliases `three/addons` to the front-end's own three.js (0.170).

## Standalone use (`moonc-escena.js`)

For a plain web page (served from `localhost`; `file://` is refused):

```html
<script type="importmap">
  { "imports": { "three": "./Model3D/vendor/three/build/three.module.js",
                 "three/addons/": "./Model3D/vendor/three/examples/jsm/" } }
</script>
<div id="moonc" style="width: 400px; height: 400px"></div>
<script type="module">
  import { montarMoonC } from './Model3D/moonc/moonc-escena.js'
  const moon = await montarMoonC(document.getElementById('moonc'), { base: './Model3D/moonc/' })
  moon?.setState('pensando')
  const m = await moon.maniobra('rcp', { entorno: 'iss', onPaso: (i, paso) => console.log(paso.titulo) })
  m.iniciar()            // from a click: the metronome needs a user gesture
  // moon.cerrarManiobra() when done
</script>
```

`montarMoonC(el, { base = './moonc/', sombras = true })` creates its own renderer (antialias, transparent, `powerPreference: 'low-power'`, pixel ratio ≤ 1.5), camera and lighting (`iluminarEscena`), resizes with the container, pauses when the tab is hidden and returns the character with three extra methods:

| Method | Behavior |
|---|---|
| `moon.maniobra(id, options)` | Opens a guide (closing the previous one) and points the camera at it |
| `moon.cerrarManiobra()` | Closes it and returns the camera |
| `moon.pausar(bool)` | Pauses or resumes rendering |

It returns `null` (and logs why) if WebGL or the files are not available, so the page can keep a 2D fallback. Its comments still use the old name "Laika" in places.

The voice team's player (`moonc_voz/web/moonc-voz.js`) works with the object returned here: it calls `moon.talk()` and `moon.setMouth()` ([backend/voice/moonc-voz.md](../../backend/voice/moonc-voz.md#browser-player-webmoonc-vozjs)).

## Editing assets

- Keep clip names equal to the state names used in code (`STATES` in `moonc.js`, the `clip` of each maneuver step).
- The face shader relies on coordinates measured on the baked face texture (`FACE` in `moonc.js`): changing the body mesh or the face texture means re-measuring them.
- Manikins: the CPR and torso manikins drive their first morph target from the compression animation; the arm manikin is posed in code.
- The laptop that runs Moon-C is low-end: keep textures small and meshes light.
