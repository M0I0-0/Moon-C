# Modelos 3D

El asistente del centro es el personaje **Moon-C** de `../../Model3D/moonc/` (GLB con rig, animaciones por
estado y cara con shader). Se carga directo de esa carpeta, así que cualquier cambio ahí se ve en la app.

Para usar otros modelos, coloca aquí los archivos (`.glb`, `.gltf` o `.stl`) y define las rutas en `front-end/.env.local`:

    VITE_ASSISTANT_MODEL_URL=/models/otro-asistente.glb   # opcional, reemplaza a Moon-C
    VITE_CREW_MODEL_URL=/models/tripulante.stl

Reinicia `npm run dev` después de cambiar `.env.local`.

- Se escalan y centran solos (el asistente al centro, el tripulante en miniatura), no importa la unidad del archivo.
- **GLB/GLTF:** se respetan materiales y texturas. Si el modelo trae animaciones, se reproduce la que se llame
  `idle`/`breath`/`stand` (o la primera). Si tiene un hueso llamado `Head`/`head`/`cabeza`, el asistente lo usa
  para mirar a la cámara.
- **STL:** no guarda colores ni huesos, así que se pinta con el color de la escena y el asistente mira a la cámara
  girando todo el cuerpo. Si el modelo aparece acostado, cambia `VITE_STL_Z_UP`.
- Si un modelo aparece de espaldas, usa `VITE_ASSISTANT_MODEL_YAW=180` (o `VITE_CREW_MODEL_YAW`).
- Si un archivo no carga o tiene otro formato, se usa el modelo provisional y se avisa en la consola.
