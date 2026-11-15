const env = import.meta.env

export const API_URL = (env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
// Modelos 3D (.glb, .gltf o .stl) servidos desde public/models. Vacío = modelo provisional.
// Vacío = personaje Moon-C de ../Model3D. Una ruta .glb/.stl lo reemplaza por otro modelo.
export const ASSISTANT_MODEL_URL = env.VITE_ASSISTANT_MODEL_URL || env.VITE_DOCTOR_MODEL_URL || ''
// Giro en grados si el modelo no mira hacia el frente (+Z), por ejemplo 180.
export const ASSISTANT_MODEL_YAW = Number(env.VITE_ASSISTANT_MODEL_YAW || env.VITE_DOCTOR_MODEL_YAW || 0)
// La mayoría de los STL vienen con Z hacia arriba; se rotan para que queden de pie.
export const STL_Z_UP = env.VITE_STL_Z_UP !== 'false'
// Voz (dictado y lectura) según el idioma del tripulante: preferredLanguage de shared/crew.json.
const SPEECH_LANGS = { es: 'es-MX', en: 'en-US' }
export const speechLangFor = (lang) => SPEECH_LANGS[lang] ?? SPEECH_LANGS.es
