// Texturas procedurales para la sala (sin archivos externos: funciona offline).
import * as THREE from 'three'

function seeded(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const canvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function toTexture(c, { repeat, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

const jitter = (rnd, v, amount) => v + (rnd() - 0.5) * 2 * amount

/** Tarima de madera: tablones con veta, nudos y juntas. Sirve de color y de relieve. */
export function woodFloor({ repeat = [3.5, 2.75], aniso } = {}) {
  const S = 1024
  const c = canvas(S, S)
  const g = c.getContext('2d')
  const rnd = seeded(7)
  const cols = 8
  const w = S / cols
  for (let col = 0; col < cols; col++) {
    let y = -rnd() * 300
    while (y < S) {
      const len = 260 + rnd() * 300
      const hue = jitter(rnd, 30, 2.5)
      const sat = jitter(rnd, 42, 5)
      const lit = jitter(rnd, 56, 5)
      const x = col * w
      g.fillStyle = `hsl(${hue} ${sat}% ${lit}%)`
      g.fillRect(x, y, w, len)
      // veta: líneas largas y onduladas
      for (let k = 0; k < 26; k++) {
        const gx = x + 4 + rnd() * (w - 8)
        const amp = 1 + rnd() * 3
        const ph = rnd() * 6
        g.strokeStyle = rnd() < 0.6 ? `rgba(80,45,20,${0.05 + rnd() * 0.1})` : `rgba(255,235,205,${0.04 + rnd() * 0.07})`
        g.lineWidth = 0.6 + rnd() * 1.4
        g.beginPath()
        for (let t = 0; t <= len; t += 12) {
          const px = gx + Math.sin(t / 55 + ph) * amp
          if (t === 0) g.moveTo(px, y + t)
          else g.lineTo(px, y + t)
        }
        g.stroke()
      }
      // nudo ocasional
      if (rnd() < 0.3) {
        const kx = x + w * (0.3 + rnd() * 0.4)
        const ky = y + len * (0.2 + rnd() * 0.6)
        for (let r = 3; r > 0; r--) {
          g.strokeStyle = `rgba(70,38,16,${0.1 + 0.07 * r})`
          g.lineWidth = 1.2
          g.beginPath()
          g.ellipse(kx, ky, 4 * r, 8 * r, 0, 0, Math.PI * 2)
          g.stroke()
        }
      }
      // juntas entre tablones
      g.fillStyle = 'rgba(52,30,16,0.6)'
      g.fillRect(x, y, w, 2)
      y += len
    }
    g.fillStyle = 'rgba(52,30,16,0.6)'
    g.fillRect(col * w, 0, 2, S)
  }
  return toTexture(c, { repeat, aniso })
}

/** Pared pintada: grano fino y manchado suave para que no se vea plana. */
export function plaster({ base = '#f6ead8', repeat = [3, 1.5], aniso } = {}) {
  const S = 512
  const c = canvas(S, S)
  const g = c.getContext('2d')
  const rnd = seeded(21)
  g.fillStyle = base
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const r = 70 + rnd() * 130
    const grad = g.createRadialGradient(x, y, 0, x, y, r)
    const dark = rnd() < 0.5
    grad.addColorStop(0, dark ? 'rgba(120,85,50,0.05)' : 'rgba(255,255,255,0.12)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(120,90,60,${0.02 + rnd() * 0.04})` : `rgba(255,255,255,${0.05 + rnd() * 0.08})`
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2)
  }
  return toTexture(c, { repeat, aniso })
}

/** Tapete circular: trama tejida, aros decorativos y flecos. */
export function rug({ aniso } = {}) {
  const S = 1024
  const R = S / 2
  const c = canvas(S, S)
  const g = c.getContext('2d')
  const rnd = seeded(3)
  g.clearRect(0, 0, S, S)
  g.save()
  g.beginPath()
  g.arc(R, R, R - 2, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = '#ebcdae'
  g.fillRect(0, 0, S, S)
  // trama: hilos finos en dos direcciones
  for (let i = 0; i < S; i += 3) {
    g.fillStyle = `rgba(150,105,70,${0.04 + rnd() * 0.05})`
    g.fillRect(i, 0, 1, S)
    g.fillStyle = `rgba(255,245,230,${0.05 + rnd() * 0.05})`
    g.fillRect(0, i, S, 1)
  }
  const ring = (r0, r1, color) => {
    g.strokeStyle = color
    g.lineWidth = (r1 - r0) * R
    g.beginPath()
    g.arc(R, R, ((r0 + r1) / 2) * R, 0, Math.PI * 2)
    g.stroke()
  }
  ring(0.84, 0.89, '#d9895b')
  ring(0.78, 0.795, 'rgba(217,137,91,0.6)')
  ring(0.46, 0.475, 'rgba(217,137,91,0.45)')
  // rombos decorativos entre los aros
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2
    const r = 0.67 * R
    g.save()
    g.translate(R + Math.cos(a) * r, R + Math.sin(a) * r)
    g.rotate(a + Math.PI / 4)
    g.fillStyle = k % 2 ? 'rgba(217,137,91,0.55)' : 'rgba(127,166,154,0.55)'
    g.fillRect(-9, -9, 18, 18)
    g.restore()
  }
  // sombra suave hacia el borde (da grosor)
  const edge = g.createRadialGradient(R, R, R * 0.9, R, R, R)
  edge.addColorStop(0, 'rgba(90,55,30,0)')
  edge.addColorStop(1, 'rgba(90,55,30,0.25)')
  g.fillStyle = edge
  g.fillRect(0, 0, S, S)
  g.restore()
  return toTexture(c, { aniso })
}

/** Vista por la ventana: cielo en degradado, sol, nubes y colinas en capas. */
export function windowView({ aniso } = {}) {
  const W = 1024
  const H = 660
  const c = canvas(W, H)
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#8cc4ee')
  sky.addColorStop(0.65, '#cfe9f8')
  sky.addColorStop(1, '#eef7fb')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  const sun = g.createRadialGradient(W * 0.22, H * 0.25, 0, W * 0.22, H * 0.25, 130)
  sun.addColorStop(0, 'rgba(255,248,214,1)')
  sun.addColorStop(0.18, 'rgba(255,244,200,0.95)')
  sun.addColorStop(1, 'rgba(255,244,200,0)')
  g.fillStyle = sun
  g.fillRect(0, 0, W, H)
  const rnd = seeded(11)
  g.filter = 'blur(6px)'
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W
    const y = H * (0.12 + rnd() * 0.3)
    g.fillStyle = `rgba(255,255,255,${0.55 + rnd() * 0.3})`
    for (let k = 0; k < 5; k++) {
      g.beginPath()
      g.ellipse(x + k * 34 - 70, y + Math.sin(k * 1.7) * 9, 48 + rnd() * 24, 22 + rnd() * 10, 0, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.filter = 'none'
  const hills = [
    { y: 0.62, a: 38, f: 0.007, c0: '#b3d9a3', c1: '#9fcf8f' },
    { y: 0.72, a: 46, f: 0.011, c0: '#97cc86', c1: '#7fbb6f' },
    { y: 0.84, a: 30, f: 0.016, c0: '#7fba70', c1: '#69a85c' },
  ]
  hills.forEach((h, i) => {
    const grad = g.createLinearGradient(0, H * h.y - h.a, 0, H)
    grad.addColorStop(0, h.c0)
    grad.addColorStop(1, h.c1)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x <= W; x += 8) g.lineTo(x, H * h.y + Math.sin(x * h.f + i * 2) * h.a)
    g.lineTo(W, H)
    g.fill()
  })
  return toTexture(c, { aniso })
}

/** Cuadro de pared: composición abstracta suave con la paleta dada. */
export function artPrint({ seed = 1, palette, aniso }) {
  const S = 256
  const c = canvas(S, S)
  const g = c.getContext('2d')
  const rnd = seeded(seed)
  const [bg, a, b, d] = palette
  const grad = g.createLinearGradient(0, 0, 0, S)
  grad.addColorStop(0, bg)
  grad.addColorStop(1, a)
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  g.fillStyle = d
  g.beginPath()
  g.arc(S * (0.3 + rnd() * 0.4), S * (0.28 + rnd() * 0.12), S * (0.1 + rnd() * 0.06), 0, Math.PI * 2)
  g.fill()
  ;[b, a].forEach((col, i) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, S)
    for (let x = 0; x <= S; x += 8) g.lineTo(x, S * (0.62 + i * 0.14) + Math.sin(x * 0.03 + seed + i) * 18)
    g.lineTo(S, S)
    g.fill()
  })
  return toTexture(c, { aniso })
}

/** Grano fino en gris para dar relieve de tela (se usa como bumpMap). */
export function fabricBump({ repeat = [4, 4], aniso } = {}) {
  const S = 128
  const c = canvas(S, S)
  const g = c.getContext('2d')
  g.fillStyle = '#808080'
  g.fillRect(0, 0, S, S)
  const rnd = seeded(5)
  for (let y = 0; y < S; y += 2) {
    for (let x = 0; x < S; x += 2) {
      const v = 128 + (rnd() - 0.5) * 36
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x, y, 2, 2)
    }
  }
  return toTexture(c, { repeat, aniso, srgb: false })
}
