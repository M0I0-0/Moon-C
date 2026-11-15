# Moon-C · front-end

Interfaz web (React + Vite + react-three-fiber) para el asistente de salud Moon-C.

## Uso

```bash
cd front-end
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas (Vitest)
npm run lint
```

Con el backend (`Backend/`) corriendo en `http://localhost:8000`, todo pasa por él: chat (`/chat`),
signos en vivo de las pulseras simuladas (`/vitals`), alertas (`/alerts`), maniobras y su resumen para
Tierra (`/maneuvers/*`), anuncios, registro de accesos, lecturas a mano (`/measurements`) y enlace con la
Tierra (`/sync/*`). Así todas las pantallas ven lo mismo.

Sin backend, la app sigue funcionando: el chat solo atiende emergencias (con las mismas palabras clave y
el mismo manual que el backend, `shared/`) y los signos se simulan en el navegador.
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
- **Entrada** por texto o micrófono (Web Speech API; funciona en Chrome y Edge). Ojo: el dictado del
  navegador usa un servicio en internet y envía el audio a ese servicio; escribir funciona sin conexión.
- **Salida** por voz y subtítulos. En español habla con la **voz propia de Moon-C** (backend `POST /tts`,
  voz de `../moonc_voz`, sin internet). La pide oración por oración para empezar a hablar enseguida y mueve
  la boca con el volumen real del audio (`src/lib/moonVoice.js`, basado en `moonc_voz/web/moonc-voz.js`).
  En inglés, o si el backend no tiene la voz instalada, usa una voz instalada en el equipo (`speechSynthesis`,
  nunca voces de red). En modo automático los subtítulos aparecen si no hay bocinas, no hay voz para el
  idioma o la voz está apagada.
- **Idioma**: cada tripulante usa el de su perfil (`preferredLanguage` de `shared/crew.json`, por
  nacionalidad). La cuenta General cambia con el botón ES/EN (arriba o en el menú) y también sola: Moon-C
  contesta en el idioma en que le escribes o hablas (`auto_language` del backend) y toda la pantalla cambia
  con ella, igual que la voz y el dictado. Sin backend, el front detecta el idioma con la misma regla
  (`detectLanguage` en `src/lib/assistant.js`, casos compartidos en `shared/language_cases.json`). Los textos
  de la interfaz están en `src/i18n/strings.js` (español e inglés; `src/i18n/i18n.test.js` revisa que no
  falte ninguno) y los de las maniobras 3D en `Model3D/moonc/maniobras.js` (`EN`).
- **Alertas**: las de un tripulante (por ejemplo, saturación baja) van **siempre en inglés**, el idioma común
  de la tripulación, sin importar el idioma de la cuenta (`src/lib/alerts.js`). Se leen con una voz en inglés
  del equipo; si no hay, se muestran como subtítulo.

Todos los datos de signos vitales son simulados. Los rangos vienen de guías clínicas (NEWS2, AHA/ACC, OMS, AASM/SRS) y estándares de la NASA, ajustados al espacio (fuentes en `../shared/REFERENCES.md`), y siguen pendientes de validación médica.

## Estructura

```
src/
  App.jsx               composición y estado principal
  components/           escena 3D, paneles, chat, menú
  hooks/                signos y alertas del backend (useRemoteCrew) o locales (useCrewSimulation),
                        anuncios, enlace con la Tierra, voz, estado del backend
  lib/api.js            cliente del backend (todas las llamadas pasan por aquí)
  lib/assistant.js      chat: backend o, sin enlace, solo emergencias; detección de idioma
  lib/alerts.js         texto de las alertas (siempre en inglés)
  lib/vitals.js         convierte /vitals y /alerts a la forma de los componentes
  i18n/                 textos de la interfaz en español e inglés, y el idioma actual (useI18n)
  data/                 manual (lee ../shared), ambientes, anuncios de ejemplo
```
