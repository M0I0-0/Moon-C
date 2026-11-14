# Moon-C · front-end

Interfaz web (React + Vite + react-three-fiber) para el asistente de salud Moon-C.

## Uso

```bash
cd front-end
npm install
npm run dev        # http://localhost:5173
```

Si el backend (`Backend/`) está corriendo en `http://localhost:8000`, el chat usa `POST /chat`.
Si no, responde un simulador local que usa el mismo manual (`shared/protocols.json` y `shared/keywords.json`).
La URL se cambia con `VITE_API_URL` en `.env.local` (ver `.env.example`).

## Qué incluye

- **Escena 3D central** con el personaje Moon-C de `../Model3D/moonc` (no da vueltas y mira a la cámara).
  Cambia de expresión según lo que pasa: escuchando (micrófono), pensando (esperando respuesta),
  hablando, alerta (emergencia) y saludo al cambiar de cuenta. A un lado, el tripulante en miniatura
  (se oculta en Menú → Escena). Ver `public/models/README.md` para usar otros `.glb`/`.stl`.
  El componente que lo carga es `src/components/ModelSlot.jsx` (recibe `tint`, `status`, `speaking`).
- **Menú (arriba a la izquierda)**: cuenta (General o tripulante), ambiente (Estación Espacial,
  Base Lunar, Base en Marte, Casa), audio/subtítulos y simulación de emergencias para la demo.
- **Cuenta General**: publica anuncios y ve el estado de la tripulación. Los signos de cada
  tripulante están bloqueados y solo se abren cuando hay una alerta activa (el acceso queda registrado).
- **Cuenta individual**: signos vitales simulados en vivo, qué hacer según el manual y chat propio.
- **Entrada** por texto o micrófono (Web Speech API; funciona en Chrome y Edge).
- **Salida** por voz (`speechSynthesis`) y subtítulos. En modo automático los subtítulos aparecen
  si no hay bocinas, no hay voces instaladas o la voz está apagada.

Todos los datos de signos vitales son simulados y los rangos son de ejemplo, pendientes de validación médica.

## Estructura

```
src/
  App.jsx               composición y estado principal
  components/           escena 3D, paneles, chat, menú
  hooks/                simulación de tripulación, voz, estado del backend
  lib/assistant.js      cliente de /chat + simulador local
  data/                 manual (lee ../shared), ambientes, anuncios de ejemplo
```
