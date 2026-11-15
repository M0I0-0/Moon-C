// Cliente del backend de Moon-C (FastAPI). Todas las llamadas al backend pasan por aquí.
import { API_URL } from '../config'

const timeout = (ms) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined)

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `HTTP ${status}`)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, ms = 8000 } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: timeout(ms),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json()).detail
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(res.status, typeof detail === 'string' ? detail : '')
  }
  return res.status === 204 ? null : res.json()
}

/** Voz propia de Moon-C: WAV (ArrayBuffer) del backend. Solo español por ahora. */
async function tts(text, language = 'es') {
  const res = await fetch(`${API_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal: timeout(20000),
  })
  if (!res.ok) throw new ApiError(res.status, `Voz de Moon-C no disponible (HTTP ${res.status})`)
  return res.arrayBuffer()
}

export const api = {
  tts,
  // /status consulta a Ollama: si está apagado, Windows tarda ~2 s en rechazar la conexión.
  status: () => request('/status', { ms: 5000 }),

  // El backend espera a la IA hasta MOON_C_OLLAMA_TIMEOUT_S (10–25 s): margen de sobra.
  // autoLanguage (cuenta General): contesta en el idioma del mensaje; `language` queda de respaldo.
  chat: ({ sessionId, crewId, message, language, autoLanguage = false }) =>
    request('/chat', {
      method: 'POST',
      body: { session_id: sessionId, crew_id: crewId ?? null, message, language, auto_language: autoLanguage },
      ms: 45000,
    }),
  resetSession: (sessionId) => request('/session/reset', { method: 'POST', body: { session_id: sessionId } }),
  identify: ({ braceletId, sessionId }) =>
    request('/identify', { method: 'POST', body: { bracelet_id: braceletId, session_id: sessionId } }),

  // Pulseras simuladas: signos en vivo y emergencias de demostración.
  vitals: () => request('/vitals', { ms: 5000 }),
  simulateEmergency: (crewId, scenario) =>
    request('/simulation/emergency', { method: 'POST', body: { crew_id: crewId, scenario } }),
  simulationReset: (crewId = null) => request('/simulation/reset', { method: 'POST', body: { crew_id: crewId } }),

  // Alertas a bordo. Por defecto: abiertas (vistas o no), en inglés (el idioma común de la tripulación).
  alerts: ({ language = 'en', includeAcknowledged = true, includeResolved = false } = {}) =>
    request(
      `/alerts?${new URLSearchParams({
        language,
        include_acknowledged: includeAcknowledged,
        include_resolved: includeResolved,
      })}`,
      { ms: 5000 },
    ),
  ackAlert: (id, language = 'en') => request(`/alerts/${encodeURIComponent(id)}/ack?language=${language}`, { method: 'POST' }),
  resolveAlert: (id, language = 'en') =>
    request(`/alerts/${encodeURIComponent(id)}/resolve?language=${language}`, { method: 'POST' }),
  resolveCrewAlerts: (crewId = null) => request('/alerts/resolve', { method: 'POST', body: { crew_id: crewId } }),

  // Maniobras guiadas: alerta al abrir la guía (en inglés, como todas) y resumen para la Tierra al terminar.
  startManeuver: ({ crewId, maneuver }) =>
    request('/maneuvers/start', { method: 'POST', body: { crew_id: crewId ?? null, maneuver } }),
  sendManeuverReport: ({ crewId, maneuver, summary }) =>
    request('/maneuvers/reports', { method: 'POST', body: { crew_id: crewId ?? null, maneuver, summary } }),

  // Anuncios de la cuenta General y registro de accesos a datos de un tripulante.
  announcements: () => request('/announcements'),
  postAnnouncement: ({ text, priority, author }) =>
    request('/announcements', { method: 'POST', body: { text, priority, author } }),
  logAccess: ({ crewId, viewer = 'general', reason = null }) =>
    request('/access-log', { method: 'POST', body: { crew_id: crewId, viewer, reason } }),

  // Lecturas registradas a mano y confirmación de las que llegaron sin tripulante.
  createMeasurement: ({ crewId, indicator, value, unit, language }) =>
    request('/measurements', { method: 'POST', body: { crew_id: crewId ?? null, indicator, value, unit, language } }),
  unassignedMeasurements: () => request('/measurements?unassigned=true'),
  assignMeasurement: (id, crewId) =>
    request(`/measurements/${encodeURIComponent(id)}/assign`, { method: 'POST', body: { crew_id: crewId } }),

  // Enlace con la Tierra (simulado), exportación y borrado por privacidad.
  syncStatus: () => request('/sync/status', { ms: 5000 }),
  syncSimulate: () => request('/sync/simulate', { method: 'POST' }),
  exportUrl: (format) => `${API_URL}/export.${format}`,
  deleteAllData: () => request('/data?confirm=true', { method: 'DELETE' }),
}
