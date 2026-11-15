# Front-end configuration

## Environment variables

Vite exposes variables that start with `VITE_`. Put them in `front-end/.env.local` (gitignored; see `front-end/.env.example`) and restart `npm run dev`.

| Variable | Default | Read in | Meaning |
|---|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | `src/config.js` → `API_URL` (trailing `/` removed) | Backend base URL. If it does not answer, the app runs offline |
| `VITE_ASSISTANT_MODEL_URL` | empty | `ASSISTANT_MODEL_URL` | Replace Moon-C with another model served from `public/models` (`.glb`, `.gltf` or `.stl`). Empty = the Moon-C character from `../Model3D/moonc` |
| `VITE_ASSISTANT_MODEL_YAW` | `0` | `ASSISTANT_MODEL_YAW` | Rotation in degrees if that model faces away (for example `180`) |
| `VITE_STL_Z_UP` | `true` | `STL_Z_UP` | STL files are assumed Z-up and rotated to stand; set `false` if yours are Y-up |

`VITE_DOCTOR_MODEL_URL` and `VITE_DOCTOR_MODEL_YAW` are still accepted as legacy names of the assistant variables.

> Note: `front-end/public/models/README.md` also mentions `VITE_CREW_MODEL_URL` / `VITE_CREW_MODEL_YAW` and a miniature crew member. The current code does not read them; that part of the scene was removed.

## `src/config.js`

| Export | Value |
|---|---|
| `API_URL` | From `VITE_API_URL` |
| `ASSISTANT_MODEL_URL`, `ASSISTANT_MODEL_YAW`, `STL_Z_UP` | From the variables above |
| `speechLangFor(lang)` | Speech code for dictation and voices: `es` → `es-MX`, `en` → `en-US` (default `es-MX`) |

## `vite.config.js`

```js
resolve.alias = {
  '@shared':      '../shared',                          // protocols.json, keywords.json, crew.json
  '@model3d':     '../Model3D',                         // moonc.js, maniobras.js, .glb, textures
  'three/addons': './node_modules/three/examples/jsm',  // Model3D/moonc/maniobras.js imports 'three/addons/...'
}
server.port = 5173
server.fs.allow = [front-end workspace root, ../shared, ../Model3D]
```

- The aliases keep a **single source of truth**: the front-end reads the same manual, keywords and crew as the backend, and loads the 3D character straight from `Model3D/`, so changes there are visible at once.
- `three/addons` is aliased because `Model3D/` lives outside `front-end/` and has no `node_modules` of its own.
- `fs.allow` limits what the dev server may serve: `front-end/`, `../shared` and `../Model3D` only, **never** the rest of the repository (for example `Backend/storage`, which holds the crew's measurements).
- Asset imports with `?url` (`import glbUrl from '@model3d/moonc/moonc_nave_rig.glb?url'`) give the URL Vite serves for each file.

## ESLint (`eslint.config.js`)

Flat config for `**/*.{js,jsx}` (ignores `dist`): browser globals, ES modules with JSX, `@eslint/js` recommended rules, `react-hooks` recommended rules, `react-refresh/only-export-components` as a warning (constant exports allowed) and `no-unused-vars` that ignores names starting with a capital letter or `_`.

## `package.json` scripts

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `vite build` (output in `dist/`, gitignored) |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `lint` | `eslint .` |

## `index.html`

`<html lang="es">` (the app updates `lang` and `document.title` to the screen language at runtime), theme color `#05070c`, favicon `public/favicon.svg`, root element `#root`, entry `/src/main.jsx`.

## Browser requirements

- WebGL 2 for the 3D character (without it a simple placeholder figure is shown).
- Web Audio for Moon-C's voice and the maneuver metronome. Audio starts only after the first click or key press.
- Web Speech API for dictation (Chrome, Edge) and `speechSynthesis` for local voices. Only voices installed on the machine are used (`localService`), never network voices.
- `navigator.mediaDevices.enumerateDevices()` to know whether there are speakers (Chrome and Edge list audio outputs; Firefox and Safari do not).
