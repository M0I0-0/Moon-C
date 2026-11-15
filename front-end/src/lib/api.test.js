import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => data })

function mockFetch(data, status) {
  const fetch = vi.fn(async () => reply(data, status))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('chat manda sesión, tripulante, mensaje e idioma', async () => {
    const fetch = mockFetch({ reply: 'Hi!' })
    await api.chat({ sessionId: 'dev1-ana', crewId: 'ana', message: 'hello', language: 'en' })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:8000/chat')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      session_id: 'dev1-ana',
      crew_id: 'ana',
      message: 'hello',
      language: 'en',
      auto_language: false,
    })
  })

  it('la cuenta General manda crew_id null y pide contestar en el idioma del mensaje', async () => {
    const fetch = mockFetch({ reply: 'Hola' })
    await api.chat({ sessionId: 'dev1-general', message: 'hola', language: 'es', autoLanguage: true })
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.crew_id).toBeNull()
    expect(body.auto_language).toBe(true)
  })

  it('las alertas se piden en inglés', async () => {
    const fetch = mockFetch([])
    await api.alerts()
    await api.ackAlert('a1')
    expect(fetch.mock.calls[0][0]).toContain('language=en')
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8000/alerts/a1/ack?language=en')
  })

  it('identify y resetSession usan los endpoints del backend', async () => {
    const fetch = mockFetch({})
    await api.identify({ braceletId: 'BR-001', sessionId: 'dev1-moises' })
    await api.resetSession('dev1-ana')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:8000/identify',
      'http://localhost:8000/session/reset',
    ])
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ bracelet_id: 'BR-001', session_id: 'dev1-moises' })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ session_id: 'dev1-ana' })
  })

  it('un GET no manda cuerpo ni Content-Type', async () => {
    const fetch = mockFetch({ backend: 'ok' })
    await api.status()
    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('GET')
    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })

  it('un error HTTP lanza ApiError con el detalle del backend', async () => {
    mockFetch({ detail: 'Unknown bracelet.' }, 404)
    await expect(api.identify({ braceletId: 'X', sessionId: 's' })).rejects.toMatchObject({
      status: 404,
      message: 'Unknown bracelet.',
    })
  })
})

describe('api (fase 3)', () => {
  it('maniobras: alerta al abrir y reporte para Tierra', async () => {
    const fetch = mockFetch({})
    await api.startManeuver({ crewId: 'moises', maneuver: 'rcp' })
    await api.sendManeuverReport({ crewId: null, maneuver: 'torniquete', summary: { title: 'Torniquete' } })
    // Sin ?language: la alerta sale en inglés, el idioma común de la tripulación.
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8000/maneuvers/start')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ crew_id: 'moises', maneuver: 'rcp' })
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8000/maneuvers/reports')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ crew_id: null, maneuver: 'torniquete', summary: { title: 'Torniquete' } })
  })

  it('anuncios y registro de accesos', async () => {
    const fetch = mockFetch({})
    await api.postAnnouncement({ text: 'Hola', priority: 'important', author: 'General' })
    await api.logAccess({ crewId: 'ana', reason: 'a1' })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ text: 'Hola', priority: 'important', author: 'General' })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ crew_id: 'ana', viewer: 'general', reason: 'a1' })
  })
})

describe('api (fase 4)', () => {
  it('lecturas: registrar y confirmar de quién es', async () => {
    const fetch = mockFetch({})
    await api.createMeasurement({ crewId: null, indicator: 'blood_pressure_systolic', value: 122, unit: 'mmHg', language: 'es' })
    await api.assignMeasurement('m1', 'ruben')
    await api.unassignedMeasurements()
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      crew_id: null,
      indicator: 'blood_pressure_systolic',
      value: 122,
      unit: 'mmHg',
      language: 'es',
    })
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:8000/measurements/m1/assign')
    expect(fetch.mock.calls[2][0]).toBe('http://localhost:8000/measurements?unassigned=true')
  })

  it('enlace con la Tierra, exportar y borrar', async () => {
    const fetch = mockFetch({})
    await api.syncStatus()
    await api.syncSimulate()
    await api.deleteAllData()
    expect(fetch.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET http://localhost:8000/sync/status',
      'POST http://localhost:8000/sync/simulate',
      'DELETE http://localhost:8000/data?confirm=true',
    ])
    expect(api.exportUrl('csv')).toBe('http://localhost:8000/export.csv')
  })
})
