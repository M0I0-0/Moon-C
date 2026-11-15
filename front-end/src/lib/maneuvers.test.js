import { describe, expect, it } from 'vitest'
import {
  ENTORNOS,
  FUENTES,
  MANEUVERS_EN,
  MANEUVER_LIST,
  MANIOBRAS,
  environmentName,
  explicitManeuver,
  maneuverTitle,
  sourceText,
  toReportSummary,
} from './maneuvers'

describe('maniobras en inglés (Model3D/moonc/maniobras.js)', () => {
  it.each(MANEUVER_LIST)('%s: cada paso y atajo tiene su texto en inglés, con las mismas variantes', (id) => {
    const en = MANEUVERS_EN.maniobras[id]
    expect(en.titulo).toBeTruthy()
    for (const paso of MANIOBRAS[id].pasos) {
      const tr = en.pasos[paso.id]
      expect(tr?.titulo, paso.id).toBeTruthy()
      if (paso.textos) expect(Object.keys(tr.textos ?? {}).sort(), paso.id).toEqual(Object.keys(paso.textos).sort())
      else expect(tr.texto, paso.id).toBeTruthy()
      if (paso.imagenAlt) expect(tr.imagenAlt, paso.id).toBeTruthy()
    }
    for (const atajo of MANIOBRAS[id].atajos ?? []) expect(en.atajos[atajo.paso], atajo.paso).toBeTruthy()
  })

  it('entornos y fuentes en los dos idiomas', () => {
    for (const key of Object.keys(ENTORNOS)) {
      expect(MANEUVERS_EN.entornos[key]).toMatchObject({
        nombre: expect.any(String),
        retraso: expect.any(String),
        evacuacion: expect.any(String),
      })
      expect(environmentName(key, 'es')).toBe(ENTORNOS[key].nombre)
    }
    for (const key of Object.keys(FUENTES)) expect(sourceText(key, 'en')).toBe(MANEUVERS_EN.fuentes[key])
    expect(environmentName('luna', 'en')).toBe('Lunar base')
  })

  it('el título sigue el idioma de la pantalla', () => {
    expect(maneuverTitle('rcp', 'es')).toBe('RCP (paro cardiaco)')
    expect(maneuverTitle('rcp', 'en')).toBe('CPR (cardiac arrest)')
  })

  it('la guía se puede pedir por nombre en los dos idiomas', () => {
    expect(explicitManeuver('Guíame con la RCP')).toBe('rcp')
    expect(explicitManeuver('Guide me through CPR')).toBe('rcp')
    expect(explicitManeuver('How do I use a tourniquet?')).toBe('torniquete')
    expect(explicitManeuver('He is choking')).toBe('atragantamiento')
    expect(explicitManeuver('Se está atragantando')).toBe('atragantamiento')
    expect(explicitManeuver('Hello')).toBeNull()
  })
})

describe('toReportSummary', () => {
  it('convierte el "Resumen para Tierra" de Model3D al formato del backend', () => {
    const pkg = {
      maniobra: 'Torniquete (sangrado grave en brazo o pierna)',
      entorno: 'Base lunar',
      retrasoComunicacion: 'unos 1.3 s',
      evacuacion: 'unos 3 días',
      inicio: '2026-11-15T02:00:00.000Z',
      duracionSeg: 95.4,
      compresiones: undefined,
      ciclos: undefined,
      torniquete: 'TQ 14:32',
      eventos: [
        { hora: '2026-11-15T02:00:00.000Z', seg: 0, evento: 'Inicio · Base lunar' },
        { hora: '2026-11-15T02:01:10.000Z', seg: 70, evento: 'Torniquete colocado TQ 14:32' },
      ],
      aviso: 'Generado por Moon-C.',
    }
    expect(toReportSummary(pkg)).toEqual({
      title: 'Torniquete (sangrado grave en brazo o pierna)',
      environment: 'Base lunar',
      comm_delay: 'unos 1.3 s',
      evacuation: 'unos 3 días',
      started_at: '2026-11-15T02:00:00.000Z',
      duration_s: 95,
      compressions: null,
      cycles: null,
      tourniquet_time: 'TQ 14:32',
      events: [
        { at: '2026-11-15T02:00:00.000Z', elapsed_s: 0, event: 'Inicio · Base lunar' },
        { at: '2026-11-15T02:01:10.000Z', elapsed_s: 70, event: 'Torniquete colocado TQ 14:32' },
      ],
    })
  })

  it('respeta los límites del backend (500 eventos, textos cortos)', () => {
    const eventos = Array.from({ length: 600 }, (_, i) => ({ hora: '2026-11-15T02:00:00Z', seg: i, evento: 'x'.repeat(300) }))
    const out = toReportSummary({ maniobra: 'RCP', entorno: 'ISS', duracionSeg: 10, eventos })
    expect(out.events).toHaveLength(500)
    expect(out.events[0].event).toHaveLength(200)
    expect(out.events.at(-1).elapsed_s).toBe(599)
  })
})
