// Idioma de la interfaz (español o inglés). Cada tripulante usa el idioma de su perfil
// (preferredLanguage de shared/crew.json, por nacionalidad); la cuenta General lo cambia con el
// botón ES/EN o sola, cuando le escriben en el otro idioma. Las alertas van siempre en inglés.
import { createContext, useContext } from 'react'
import { STRINGS } from './strings'

export const LANGUAGES = ['es', 'en']
const LOCALES = { es: 'es-MX', en: 'en-US' }

export const toLanguage = (lang) => (LANGUAGES.includes(lang) ? lang : 'es')

/** Texto de la interfaz. {nombre} se reemplaza con vars.nombre; una clave desconocida se devuelve tal cual. */
export function translate(lang, key, vars) {
  const text = STRINGS[toLanguage(lang)][key] ?? STRINGS.es[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match))
}

/** Hora corta (14:05 / 02:05 PM) en el formato del idioma. */
export function formatTime(value, lang) {
  return new Date(value).toLocaleTimeString(LOCALES[toLanguage(lang)], { hour: '2-digit', minute: '2-digit' })
}

export function makeI18n(lang) {
  const l = toLanguage(lang)
  return { lang: l, t: (key, vars) => translate(l, key, vars), time: (value) => formatTime(value, l) }
}

export const I18nContext = createContext(makeI18n('es'))

/** { lang, t, time } del idioma actual de la pantalla. */
export const useI18n = () => useContext(I18nContext)
