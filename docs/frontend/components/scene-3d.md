# 3D scene (`Scene`, `MoonCModel`, `ModelSlot`, placeholders, backdrop)

Sources: [`Scene.jsx`](../../../front-end/src/components/Scene.jsx), [`MoonCModel.jsx`](../../../front-end/src/components/MoonCModel.jsx), [`ModelSlot.jsx`](../../../front-end/src/components/ModelSlot.jsx), [`DoctorPlaceholder.jsx`](../../../front-end/src/components/DoctorPlaceholder.jsx), [`PlaceholderModel.jsx`](../../../front-end/src/components/PlaceholderModel.jsx), [`Backdrops.jsx`](../../../front-end/src/components/Backdrops.jsx), helpers in [`src/lib/lookAt.js`](../../../front-end/src/lib/lookAt.js), [`fit.js`](../../../front-end/src/lib/fit.js), [`textures.js`](../../../front-end/src/lib/textures.js).

The background of the whole screen is a react-three-fiber `<Canvas>`: Moon-C stands on a platform in a living room and, during a guide, a training manikin appears next to her. The character and the maneuver logic come from `Model3D/` ([model3d/README.md](../model3d/README.md)).

## Component tree

```
<Scene envId talking mood maneuver ctrlRef onManeuverEvent mouthRef language>
  <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 5.4], fov: 40 }}>
    <DockOffset/>          keeps Moon-C centered above the chat dock
    <Backdrop/>            the living room
    <Platform/>            round base with accent rings
    <Assistant>            turns smoothly toward the camera
      ModelSlot (VITE_ASSISTANT_MODEL_URL set)  |  MoonCModel (default)
        fallback: DoctorPlaceholder
    <OrbitControls/>
```

## `Scene`

`Scene({ envId, talking, mood, maneuver, ctrlRef, onManeuverEvent, mouthRef, language })`, rendered `aria-hidden` (it is decoration; everything important is also in the panels).

- **Camera**: position `[0, 1.5, 5.4]`, FOV 40, near 0.3, far 80. Device pixel ratio between 1 and 2.
- **`OrbitControls`**: target `[0, 1, 0]`, no pan, distance 1–9, polar angle limited to a band near the horizon, damping on. The user can orbit; guides move the camera themselves.
- **`DockOffset`**: the chat dock covers the bottom of the screen, so the camera's view offset is shifted up by half the dock's height (at most 55 % of the canvas), tracked with a `ResizeObserver`. Moon-C stays centered in the free space at any window size.
- **`Platform`**: a metallic cylinder with two glowing rings in the environment's accent color (`ACCENT.home = #d9895b`).
- **`Assistant`**: a group that rotates a little each frame toward the camera (Moon-C never spins). During a maneuver it faces forward, because the guide's camera and manikin are placed for that pose.

## `MoonCModel`

`MoonCModel({ mood = 'atenta', height = 1.55, root, fallback, maneuver, ctrlRef, onEvent, speaking, mouthRef, language })`

**Loading.** On mount it loads `@model3d/moonc/moonc_nave_rig.glb` with `GLTFLoader` and creates the character with `createMoonC({ THREE, gltf, faceUrl, faceClosedUrl })` ([model3d/character.md](../model3d/character.md)). Meshes cast and receive shadows. The model is scaled to 1.55 m and placed on the floor with `fitToHeight()`. While loading, or if loading fails (no WebGL 2, missing file), `fallback` is shown and a warning is logged. On unmount, animations stop and geometries, materials and textures are disposed.

**Mood.** When no guide is open, `moon.setState(mood)` switches the body animation and face preset (`escuchando`, `pensando`, `hablando`, `alerta`, `sin_enlace`, `saludo`, `atenta`; see [app.md](../app.md#moon-cs-mood)).

**Every frame** (`useFrame`):

1. `moon.setMouth(mouthRef.current ?? null)`: with Moon-C's voice the mouth follows the real audio level; `null` returns to the normal animation.
2. `moon.update(dt)` (capped at 50 ms).
3. During a guide: `controller.update(dt)` and `moon.talk(speaking)` so the mouth moves while a step is read.
4. Without a guide: the head bone (`head`) aims at the camera on top of the animation (`aimAt`, max 0.45 rad).
5. Camera transition: the camera and the orbit target ease toward the guide's viewpoint (`MANEUVER_CAMS`) or back home (`[0, 1.5, 5.4]` → `[0, 1, 0]`), and are released when they arrive so the user can orbit again.

**Guides.** When `maneuver = { id, entorno, nonce }` changes, it computes the guide's camera in world coordinates, calls `crearManiobra(id, { THREE, scene: <Moon-C's group>, moon, archivos: MANEUVER_FILES, entorno, idioma: language, onPaso, onConteo, onTiempo })`, stores the controller in `ctrlRef.current`, sets the language again (it may have changed while loading), calls `iniciar()` and emits `onReady(controller)`. Errors emit `onError`. On close it hides and disposes the manikin, resets Moon-C's position, rotation and state, and moves the camera home. A new `nonce` restarts the guide.

Two props are applied **without re-mounting** the manikin: `entorno` (calls `controller.cambiarEntorno()`) and `language` (sets `controller.idioma`, which re-sends the current step translated).

## `ModelSlot`

`ModelSlot({ url, fallback, height = 1.75, color = '#cfd6de', yaw = 0, lookAtCamera = false, root })` loads a custom model when `VITE_ASSISTANT_MODEL_URL` is set ([configuration.md](../configuration.md)).

| Format | Loader | Behavior |
|---|---|---|
| `.glb`, `.gltf` | drei `useGLTF` + `SkeletonUtils.clone` | Materials and textures kept; plays the first animation named like `idle`/`breath`/`stand` (or the first one); if a bone or object named `head`/`cabeza` exists (not `top`/`end`/`tip`), it aims at the camera |
| `.stl` | `STLLoader` | Rotated Z-up → Y-up unless `VITE_STL_Z_UP=false`; centered, scaled to `height`; painted with vertex colors if present, otherwise `color` |
| anything else | — | `fallback` + a console warning |

Loading runs inside `Suspense` (fallback while loading) and an error boundary (fallback and a warning if it fails). `yaw` rotates the model in degrees.

## `DoctorPlaceholder`

The fallback figure, built from simple flat-shaded primitives: a doctor in a white coat with a badge in the accent color, a stethoscope, breathing torso, blinking eyes, a head that follows the camera (`aimAt`, max 0.65 rad) and a mouth that moves while `talking`.

## `PlaceholderModel`

A simple rotating human figure with a scanning ring, tinted by `tint` and pulsing when `status === 'urgent'`. **It is not used anywhere in the current app** (kept from an earlier version of the scene).

## `Backdrop` (`Backdrops.jsx`)

The app always shows the **living room** ("home mode"):

- warm background color, ambient and hemisphere light, and a key directional light with soft 2048 px shadows;
- wooden floor and a round woven rug, plaster walls, a window with a painted view, curtains and a small plant on the sill, three framed abstract prints;
- furniture: a sofa, a coffee table with a cup, a floor lamp, a bookshelf with colored books and three potted plants.

All textures are **generated procedurally on canvases** at startup (no image files), with the GPU's maximum anisotropy (up to 16), and disposed on unmount. `useHomeTextures()` builds them once:

| Generator (`lib/textures.js`) | Produces |
|---|---|
| `woodFloor({ repeat, aniso })` | Wooden planks with grain, knots and joints (also used as bump map) |
| `plaster({ base, repeat, aniso })` | Painted wall with fine grain and soft blotches |
| `rug({ aniso })` | Circular woven rug with rings and fringe (transparent outside the circle) |
| `windowView({ aniso })` | Sky gradient, sun, clouds and layered hills |
| `artPrint({ seed, palette, aniso })` | A soft abstract composition from a palette |
| `fabricBump({ repeat, aniso })` | Fine gray grain used as a fabric bump map |

A seeded random generator (`seeded(seed)`) makes the generated details the same on every load.

## Helpers

| Function | File | What it does |
|---|---|---|
| `aimAt(obj, root, target, state, { rest, maxAngle = 0.7, ease = 0.12 })` | `lib/lookAt.js` | Rotates `obj` (a head or head bone) so it looks at `target`. Works with any rig: computes the rotation in world space from the model's forward axis (+Z of `root`), limits it to `maxAngle`, smooths it between frames (`state.offset`) and converts it to the bone's local space on top of its `rest` rotation |
| `fitToHeight(object, height)` | `lib/fit.js` | Returns `{ scale, offset }` that scale the object to `height` and stand it on the floor, centered in X/Z |

## Performance notes

The development laptop is low-end (2-core i3, Intel UHD), so the scene keeps things light: one shadow-casting light, procedurally generated textures created once, models disposed on unmount, DPR capped at 2, and the character's own update loop capped at 50 ms steps. When adding 3D content, prefer simple materials and reuse textures.
