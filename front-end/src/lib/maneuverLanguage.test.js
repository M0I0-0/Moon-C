// La guía 3D (Model3D/moonc/maniobras.js) arranca en el idioma de la pantalla y cambia de idioma a media
// guía sin reiniciarse. Se prueba con three.js real y un maniquí vacío (sin WebGL ni archivos .glb).
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { crearManiobra } from '@model3d/moonc/maniobras.js'

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync() {
      return { scene: new THREE.Group() }
    }
  },
}))

const moon = () => ({ root: new THREE.Object3D(), setState() {}, action: () => null })

async function guide(idioma) {
  const pasos = []
  const m = await crearManiobra('rcp', {
    THREE,
    scene: new THREE.Group(),
    moon: moon(),
    entorno: 'iss',
    idioma,
    sonido: false,
    onPaso: (i, paso) => pasos.push(paso),
  })
  m.iniciar()
  return { m, pasos }
}

describe('guía 3D en inglés', () => {
  it('arranca en inglés: pasos, atajos y resumen para Tierra', async () => {
    const { m, pasos } = await guide('en')
    expect(pasos[0].titulo).toBe('Secure the scene')
    expect(pasos[0].texto).toMatch(/^Stop any nearby activity/)
    expect(m.atajos.map((a) => a.texto)).toEqual(['The stretcher (CMRS) arrived', 'The AED arrived'])
    const pkg = m.paqueteTierra()
    expect(pkg.maniobra).toBe('CPR (cardiac arrest)')
    expect(pkg.entorno).toBe('Space station (low Earth orbit)')
    expect(pkg.eventos.map((e) => e.evento)).toEqual(['Start · Space station (low Earth orbit)', 'Step: Secure the scene'])
  })

  it('por defecto sigue en español', async () => {
    const { pasos } = await guide(undefined)
    expect(pasos[0].titulo).toBe('Asegura la escena')
  })

  it('cambia de idioma a media guía sin reiniciarla', async () => {
    const { m, pasos } = await guide('es')
    m.siguiente()
    expect(pasos.at(-1).titulo).toBe('¿Responde?')
    m.idioma = 'en'
    expect(m.indice).toBe(1)
    expect(pasos.at(-1).titulo).toBe('Do they respond?')
    expect(m.paso.texto).toMatch(/^Tap their shoulder/)
    m.idioma = 'fr' // idioma desconocido: no cambia nada
    expect(m.idioma).toBe('en')
  })
})
