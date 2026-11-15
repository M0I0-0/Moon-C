# Guided maneuvers (`maniobras.js`)

Source: [`Model3D/moonc/maniobras.js`](../../../Model3D/moonc/maniobras.js). App bridge: [lib/maneuvers.md](../lib/maneuvers.md). Panel: [components/README.md](../components/README.md#maneuverpanel).

Three emergency maneuvers guided step by step, with Moon-C demonstrating each step on a training manikin, **adapted to the environment** (microgravity, partial gravity or Earth): CPR, tourniquet and choking. Each step names its source and whether it was taken from that source (`validado`) or is an assumption to verify (`supuesto`).

> Moon-C supports the decision; it does not replace medical judgment or training. Steps marked `supuesto` are pending validation.

## Environments (`ENTORNOS`)

| Key | Name (en) | Gravity type `g` | Gravity | Communication delay | Evacuation |
|---|---|---|---|---|---|
| `iss` | Space station (low Earth orbit) | `microg` | 0 | almost none | hours to a day (docked spacecraft) |
| `transito` | Transit to Mars | `microg` | 0 | up to 20 min each way | not available |
| `luna` | Lunar base | `parcial` | 0.17 | about 1.3 s | about 3 days |
| `marte` | Surface of Mars | `parcial` | 0.38 | up to 20 min each way | not available |
| `tierra` | Earth (remote community) | `tierra` | 1 | phone call | depends on local services |

A step's text can depend on the exact environment (`textos.iss`) or on the gravity type (`textos.microg`). A step with `solo: [...]` exists only in those gravity types.

## Sources (`FUENTES`)

| Key | Source |
|---|---|
| `aha` | AHA 2025 · Heartsaver CPR AED, components of high-quality CPR (VUMC summary) |
| `microg` | Hinkelbein, Kerkhoff et al. · DGLRM/ESAM guideline for CPR in microgravity (2020) |
| `hipog` | Overbeek et al. · CPR in hypogravity, systematic review (2022) |
| `dea` | DGLRM/ESAM 2020 + standard AED practice (check with the on-board device manual) |
| `cruzroja` | American Red Cross · How to Apply a Tourniquet |
| `hemo` | Thoolen and Kuypers · External hemorrhage control in space exploration (2023) |
| `mayo` | Mayo Clinic · Choking: First aid (Aug. 2025) |
| `aha_ah` | AHA 2025 · alternate 5 back blows and 5 abdominal thrusts |
| `campo` | Field practice / own adaptation (not in the source; check with the on-board protocol) |

## The three guides (`MANIOBRAS`)

### CPR (`rcp`): "CPR (cardiac arrest)"

Manikin `maniqui_rcp.glb`; compression rate **110/min**, **30** compressions per cycle.

| Step id | Title (en) | Mode | Only in | Source | State |
|---|---|---|---|---|---|
| `seguro` | Secure the scene | wait | | microg | validado |
| `responde` | Do they respond? | wait | | aha | validado |
| `ayuda` | Call for help | wait | | aha | validado |
| `respira` | Check breathing | timed, 10 s | | aha | validado |
| `er_pos` | Evetts-Russomano position | wait | microg | microg | validado |
| `manos` | Place your hands | wait | parcial, tierra | aha | validado |
| `comprime` | Compress 30 times | counted | | microg / hipog / aha | validado |
| `ventila` | 2 rescue breaths | timed, 5 s | | microg / aha | validado |
| `cmrs` | Move to the CMRS stretcher (illustration: `metodo_pino.jpg`) | wait | microg | microg | validado |
| `rota` | Switch rescuers | wait | | campo / hipog | supuesto |
| `dea` | Use the AED | wait | | dea | supuesto |
| `reporte` | Report to Earth | wait | | campo | supuesto |

- **Cycle**: `comprime → ventila → comprime …`; after `cmrs`, `rota` or `dea` it goes back to `comprime`.
- **Rescuer rotation**: about every 120 s, after a `ventila`, the guide jumps to `rota`.
- **Hands-only** (`soloManos`): no ventilations; after 30 compressions the count restarts (or rotates by time).
- In microgravity, before the stretcher arrives, compressions use the Evetts-Russomano clip (`rcp_er`): Moon-C floats over the patient's head.
- Shortcuts: "The stretcher (CMRS) arrived" (microgravity only) → `cmrs`; "The AED arrived" → `dea`.

### Tourniquet (`torniquete`): "Tourniquet (severe bleeding from an arm or leg)"

Manikin `maniqui_brazo.glb`.

| Step id | Title (en) | Source | State |
|---|---|---|---|
| `herida` | Find the wound | cruzroja (microg: campo) | validado (microg: supuesto) |
| `colocar` | Place the tourniquet | cruzroja | validado |
| `avisa` | Warn that it will hurt | cruzroja | validado |
| `jalar` | PULL the strap | cruzroja | validado |
| `girar` | TWIST the rod | cruzroja | validado |
| `trabar` | LOCK the rod | cruzroja | validado |
| `hora` | Write down the time | campo | supuesto |
| `vigila` | Don't loosen it | hemo / cruzroja | validado |
| `reporte` | Report to Earth | campo | supuesto |

All steps wait for the user. At the `hora` step the tag on the tourniquet shows the time (`TQ 14:32`) and it is written to the log and the report. Shortcut: "Still bleeding" → `vigila`.

### Choking (`atragantamiento`): "Choking (conscious adult)"

Manikin `maniqui_torso.glb`.

| Step id | Title (en) | Mode | Only in | Source | State |
|---|---|---|---|---|---|
| `pregunta` | Are they choking? | wait | | mayo | validado |
| `ayuda` | Call for help | wait | | mayo | validado |
| `ancla` | Anchor yourself | wait | microg | campo | supuesto |
| `pos_golpes` | Support and lean them forward | wait | | mayo | validado |
| `golpes` | 5 back blows | counted, 5 (1.1 s each) | | mayo | validado |
| `pos_empuje` | Wrap your arms around their waist (illustration: `heimlich.jpg`) | wait | | mayo | validado |
| `empuje` | 5 abdominal thrusts | counted, 5 (1.1 s each) | | mayo | validado |
| `alterna` | Check and repeat | wait | | aha_ah | validado |
| `inconsciente` | If they lose consciousness | wait | | mayo | validado |
| `reporte` | Report to Earth | wait | | campo | supuesto |

Cycle: `empuje → alterna → golpes → …` until the object comes out. Shortcut: "They lost consciousness" → `inconsciente`.

### The report step

Every guide ends with `reporte` ("Report to Earth"), whose text depends on the environment: near-real-time answer on the station, "don't wait for an answer" in transit, ~1.3 s on the Moon, "the crew decides and continues" on Mars, "call the emergency number" on Earth. The app saves the summary in the backend when it reaches this step and replaces the text if the summary could not be saved ([app.md](../app.md#guided-maneuvers)).

## Step definition

```js
{
  id: 'comprime', titulo: 'Comprime 30 veces',
  clip: 'rcp' | (ctx) => ctx.er ? 'rcp_er' : 'rcp',   // Moon-C's animation
  efecto: 'compresion',                               // visual aid on the manikin
  modo: 'espera' | 'conteo' | 'tiempo',               // wait for the user / count / countdown
  segundos: 10, total: 5, periodo: 1.1,               // timed length; count; seconds per count
  texto: '…' | textos: { iss: '…', microg: '…', parcial: '…', tierra: '…' },
  fuente: 'aha' | fuentePor: { microg: 'microg', parcial: 'hipog', tierra: 'aha' },
  estado: 'validado' | estadoPor: { microg: 'supuesto' },
  solo: ['microg'],                                   // only in these gravity types
  imagen: 'heimlich.jpg', imagenAlt: '…',             // optional illustration
  pose: 'er' | 'er?', inclinar: true,                 // scene hints (Evetts-Russomano pose, lean forward)
}
```

The controller resolves each step for the current environment and language: `titulo`, `texto`, `imagenAlt`, `fuente` and `estado` arrive ready to show in `onPaso`.

## Visual aids on the manikins

| Guide | Aids (`efecto`) |
|---|---|
| CPR | A pulsing mark on the lower half of the sternum (`marca`, also during `compresion`); glowing straps when tying to the stretcher (`correas`); the AED appears (`dea`); the chest sinks with each compression (morph target `compresion`, synced with the animation) and rises during ventilations; Moon-C blends between standing beside the patient and the Evetts-Russomano pose |
| Tourniquet | The strap, rod and clip move through placed → tightened → twisted → locked; the time tag; blood that **floats away as growing spheres in microgravity** or falls as drops (slower with low gravity) |
| Choking | The torso leans about 15° forward for the back blows and Moon-C moves closer; marks between the shoulder blades (`omoplatos`) and above the navel (`ombligo`); an arrow and the abdomen moving in with each thrust (morph target `empuje`) |

Counted steps play a **metronome tick** (Web Audio oscillator: 880 Hz, 1320 Hz every 10th and on the last count), unless created with `sonido: false`. Audio needs a user gesture first, so start a guide from a click.

## `crearManiobra(id, options)` → controller

```js
const m = await crearManiobra('rcp', {
  THREE, scene, moon,                 // three.js, the parent group, the character from createMoonC()
  base: './moonc/', archivos: {},     // where the manikin is, or explicit URLs by file name
  entorno: 'iss', idioma: 'es',       // environment and language ('es' | 'en')
  onPaso: (i, paso, pasos) => {},     // entered a step (also re-sent after a language change)
  onConteo: (n, total) => {},         // a count happened
  onTiempo: (secondsLeft) => {},      // timed step countdown
  sonido: true,                       // metronome
})
m.iniciar()
// every frame: moon.update(dt); m.update(dt)
```

It loads the manikin (`archivos[def.maniqui]` or `base + def.maniqui`) with a dynamic `import('three/addons/loaders/GLTFLoader.js')`, adds it hidden to `scene` and builds the visual aids. An unknown id throws.

| Member | Behavior |
|---|---|
| `iniciar()` | Filter the steps for the environment, show the manikin, reset counts and the event log, start the clock, enter step 0 |
| `siguiente()` / `anterior()` | Next step (following `ciclo` and the rotation rule) / previous step |
| `ir(id or index)`, `irA(id)` | Jump to a step (`irA` returns `false` if it does not exist here) |
| `update(dt)` | Advance time; count compressions/blows from the clip's phase (one count per animation cycle, when the phase crosses its midpoint and the clip is mostly blended in); move to the next step when a count or a countdown ends; update the visual aids |
| `cambiarEntorno(key)` | Change environment **without restarting**: re-filter the steps and keep the current one (or the next one that exists in the new environment). Returns `false` for an unknown key |
| `entorno` (get/set) | Current environment. Setting it while a guide runs does not re-filter the steps: use `cambiarEntorno()` |
| `idioma` (get/set) | `'es'`/`'en'`; setting it while running re-sends the current step translated |
| `soloManos` (get/set) | Hands-only CPR |
| `pasos`, `paso`, `indice`, `conteo`, `hora` | Current state (`hora` = tourniquet time label) |
| `atajos` | Shortcut buttons for this environment and language `[{texto, paso}]` |
| `paqueteTierra()` | The "Summary for Earth" (below) |
| `detener()` | Stop (Moon-C goes back to `atenta`) |
| `ocultar()` | Stop, hide the manikin, Moon-C back to `tranquila`, close the audio context |
| `grupo`, `def` | The manikin's three.js group and the guide's definition |

### Event log and `paqueteTierra()`

Every step entered, the start, environment changes and the tourniquet time are logged as `{hora, seg, evento}` ("Step: Check breathing", "Start · Space station (low Earth orbit)", "Tourniquet applied TQ 14:32"), in the guide's language.

```js
m.paqueteTierra() → {
  maniobra, entorno, retrasoComunicacion, evacuacion,   // localized names
  inicio, duracionSeg, compresiones, ciclos, torniquete,
  eventos: [{ hora, seg, evento }, …],
  aviso: 'Generated by Moon-C. Decision support; it does not replace medical judgment.'
}
```

The app converts it with `toReportSummary()` and stores it with `POST /maneuvers/reports` ([lib/maneuvers.md](../lib/maneuvers.md#toreportsummarypkg)).

## English texts (`EN`)

`IDIOMAS = ['es', 'en']`. `EN` has the same keys as the Spanish definitions: `entornos`, `fuentes`, `registro` (log prefixes), `aviso`, and `maniobras[id]` with `titulo`, `atajos[stepId]` and `pasos[stepId]` (`titulo`, `texto`/`textos`, `imagenAlt`). Anything missing falls back to Spanish. Sources and states are shared.

Helpers: `tituloManiobra(id, idioma)`, `datosEntorno(key, idioma)`, `textoFuente(key, idioma)`.

Tests: `front-end/src/lib/maneuvers.test.js` and `maneuverLanguage.test.js` ([testing.md](../testing.md)).

## Adding or editing a step

1. Edit the step in `MANIOBRAS` (Spanish) and its translation in `EN.maniobras` with the same `id` and `textos` keys.
2. Cite a `fuente` and set `estado` honestly (`supuesto` when it is not taken from the source).
3. If it uses a new clip, add the clip to `moonc_nave_rig.glb` and to `STATES` ([character.md](character.md)).
4. Run `npm test` in `front-end/`.
