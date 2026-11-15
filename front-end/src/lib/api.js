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

export const api = {
  // /status consulta a Ollama: si está apagado, Windows tarda ~2 s en rechazar la conexión.
  status: () => request('/status', { ms: 5000 }),

  // El backend espera a la IA hasta MOON_C_OLLAMA_TIMEOUT_S (10–25 s): margen de sobra.
  chat: ({ sessionId, crewId, message, language }) =>
    request('/chat', {
      method: 'POST',
      body: { session_id: sessionId, crew_id: crewId ?? null, message, language },
      ms: 45000,
    }),
  resetSession: (sessionId) => request('/session/reset', { method: 'POST', body: { session_id: sessionId } }),
  identify: ({ braceletId, sessionId }) =>
    request('/identify', { method: 'POST', body: { bracelet_id: braceletId, session_id: sessionId } }),
}
