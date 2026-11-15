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
    expect(JSON.parse(init.body)).toEqual({ session_id: 'dev1-ana', crew_id: 'ana', message: 'hello', language: 'en' })
  })

  it('la cuenta General manda crew_id null', async () => {
    const fetch = mockFetch({ reply: 'Hola' })
    await api.chat({ sessionId: 'dev1-general', message: 'hola', language: 'es' })
    expect(JSON.parse(fetch.mock.calls[0][1].body).crew_id).toBeNull()
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
