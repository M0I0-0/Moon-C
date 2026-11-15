import { describe, expect, it } from 'vitest'
import { toReportSummary } from './maneuvers'

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
