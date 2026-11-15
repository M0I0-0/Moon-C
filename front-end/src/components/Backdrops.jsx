import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { artPrint, fabricBump, plaster, rug, windowView, woodFloor } from '../lib/textures'

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

/** Texturas de la sala: se generan una vez (con el máximo de anisotropía de la GPU) y se liberan al salir. */
function useHomeTextures() {
  const gl = useThree((s) => s.gl)
  const tex = useMemo(() => {
    const aniso = Math.min(16, gl.capabilities.getMaxAnisotropy())
    return {
      floor: woodFloor({ aniso }),
      wall: plaster({ aniso }),
      sideWall: plaster({ base: '#f1e1cb', repeat: [2.5, 1.5], aniso }),
      rug: rug({ aniso }),
      view: windowView({ aniso }),
      fabric: fabricBump({ aniso }),
      art: [
        artPrint({ seed: 4, palette: ['#cfe3f2', '#8fb8d6', '#6f9bbd', '#fff3c4'], aniso }),
        artPrint({ seed: 9, palette: ['#fbe7a9', '#f2c86b', '#e0a43f', '#fff8de'], aniso }),
        artPrint({ seed: 15, palette: ['#f7d3bd', '#e9a07a', '#cf7f56', '#fff1e3'], aniso }),
      ],
    }
  }, [gl])
  useEffect(
    () => () => {
      Object.values(tex)
        .flat()
        .forEach((t) => t.dispose())
    },
    [tex],
  )
  return tex
}

function Box({ args, position, color, rotation, roughness = 0.8, ...rest }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} {...rest} />
    </mesh>
  )
}

function Sofa({ position, rotation, bump }) {
  const fabric = '#7fa69a'
  const f = { bumpMap: bump, bumpScale: 0.25, roughness: 0.95 }
  return (
    <group position={position} rotation={rotation}>
      <Box args={[2.08, 0.42, 1]} position={[0, 0.29, 0]} color={fabric} {...f} />
      <Box args={[2.56, 0.75, 0.24]} position={[0, 0.78, -0.4]} color={fabric} {...f} />
      <Box args={[0.26, 0.62, 1.04]} position={[-1.17, 0.5, 0.01]} color="#6f9488" {...f} />
      <Box args={[0.26, 0.62, 1.04]} position={[1.17, 0.5, 0.01]} color="#6f9488" {...f} />
      <Box args={[0.98, 0.14, 0.78]} position={[-0.52, 0.57, 0.06]} color="#8db3a6" {...f} />
      <Box args={[0.98, 0.14, 0.78]} position={[0.52, 0.57, 0.06]} color="#8db3a6" {...f} />
      <Box args={[0.5, 0.42, 0.14]} position={[-0.8, 0.86, -0.22]} rotation={[-0.2, 0.15, 0.08]} color="#f2c86b" {...f} />
      <Box args={[0.46, 0.4, 0.14]} position={[0.86, 0.85, -0.22]} rotation={[-0.2, -0.2, -0.06]} color="#e9a07a" {...f} />
      {[-1.2, 1.2].map((x) => (
        <Box key={x} args={[0.08, 0.08, 0.8]} position={[x, 0.04, 0]} color="#5a3d2b" />
      ))}
    </group>
  )
}

function FloorLamp({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.22, 0.24, 0.05, 32]} />
        <meshStandardMaterial color="#3d3029" />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.65, 16]} />
        <meshStandardMaterial color="#3d3029" metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <cylinderGeometry args={[0.2, 0.34, 0.38, 48, 1, true]} />
        <meshStandardMaterial color="#fff1d6" emissive="#ffcf8a" emissiveIntensity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 1.65, 0]} intensity={6} distance={6} decay={2} color="#ffc98a" />
    </group>
  )
}

function Plant({ position, scale = 1 }) {
  const leaves = useMemo(() => {
    const rnd = seeded(position[0] * 100 + position[2] * 7)
    return Array.from({ length: 9 }, () => [(rnd() - 0.5) * 0.45, 0.55 + rnd() * 0.55, (rnd() - 0.5) * 0.45, 0.16 + rnd() * 0.12])
  }, [position])
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.17, 0.44, 32]} />
        <meshStandardMaterial color="#c9744f" roughness={0.9} />
      </mesh>
      {leaves.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 1]} />
          <meshStandardMaterial color={i % 2 ? '#5f9b5a' : '#77b26c'} roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  )
}

const BOOK_COLORS = ['#d9895b', '#7fa69a', '#f2c86b', '#8a9fc7', '#c75f5f', '#e7dccb']

function Bookshelf({ position, rotation }) {
  const books = useMemo(() => {
    const rnd = seeded(42)
    const out = []
    for (const y of [0.42, 1.02, 1.62]) {
      let x = -0.6
      while (x < 0.55) {
        const w = 0.07 + rnd() * 0.07
        const h = 0.32 + rnd() * 0.16
        out.push({ x: x + w / 2, y: y + h / 2, w, h, c: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] })
        x += w + 0.01
        if (rnd() < 0.12) x += 0.18
      }
    }
    return out
  }, [])
  return (
    <group position={position} rotation={rotation}>
      <Box args={[1.5, 2.1, 0.4]} position={[0, 1.05, -0.02]} color="#9b6b4a" roughness={0.6} />
      {[0.4, 1.0, 1.6].map((y) => (
        <Box key={y} args={[1.36, 0.03, 0.36]} position={[0, y, 0.03]} color="#b98560" roughness={0.6} />
      ))}
      <Box args={[1.36, 1.86, 0.02]} position={[0, 1.07, -0.19]} color="#7d5338" />
      {books.map((b, i) => (
        <Box key={i} args={[b.w, b.h, 0.26]} position={[b.x, b.y, 0.06]} color={b.c} roughness={0.7} />
      ))}
    </group>
  )
}

function Frame({ position, size, map }) {
  return (
    <group position={position}>
      <Box args={[size[0] + 0.1, size[1] + 0.1, 0.04]} color="#f7efe3" roughness={0.5} />
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={map} roughness={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  )
}

function HouseWindow({ position, view, bump }) {
  const frame = { color: '#fbf6ee', roughness: 0.45 }
  return (
    <group position={position}>
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[2.6, 1.7]} />
        <meshBasicMaterial map={view} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      <Box args={[2.75, 0.08, 0.1]} position={[0, 0.88, 0]} {...frame} />
      <Box args={[2.75, 0.1, 0.18]} position={[0, -0.88, 0.04]} {...frame} />
      <Box args={[0.08, 1.8, 0.1]} position={[-1.34, 0, 0]} {...frame} />
      <Box args={[0.08, 1.8, 0.1]} position={[1.34, 0, 0]} {...frame} />
      <Box args={[0.05, 1.7, 0.06]} position={[0, 0, 0]} {...frame} />
      <Box args={[2.6, 0.05, 0.06]} position={[0, 0.05, 0]} {...frame} />
      <Box args={[0.55, 2.3, 0.06]} position={[-1.7, -0.05, 0.08]} color="#f0b48f" bumpMap={bump} bumpScale={0.5} roughness={0.95} />
      <Box args={[0.55, 2.3, 0.06]} position={[1.7, -0.05, 0.08]} color="#f0b48f" bumpMap={bump} bumpScale={0.5} roughness={0.95} />
      <Plant position={[0.9, -0.83, 0.1]} scale={0.45} />
    </group>
  )
}

function Home() {
  const t = useHomeTextures()
  return (
    <>
      <color attach="background" args={['#efe2cf']} />
      <ambientLight intensity={0.7} color="#fff3e2" />
      <hemisphereLight args={['#fff6e8', '#b98a66', 0.7]} />
      <directionalLight
        position={[4, 7, 6]}
        intensity={1.5}
        color="#fff0dc"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-camera-near={1}
        shadow-camera-far={24}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      {/* piso de tarima y tapete */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, -0.5]} receiveShadow>
        <planeGeometry args={[14, 11]} />
        <meshStandardMaterial map={t.floor} bumpMap={t.floor} bumpScale={0.8} roughness={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.074, 0]} receiveShadow>
        <circleGeometry args={[2.3, 96]} />
        <meshStandardMaterial map={t.rug} bumpMap={t.rug} bumpScale={0.6} roughness={1} transparent />
      </mesh>
      {/* paredes */}
      <Box args={[14, 4.6, 0.2]} position={[0, 2.22, -6]} color="#ffffff" map={t.wall} bumpMap={t.wall} bumpScale={0.4} roughness={1} />
      <Box args={[14, 0.14, 0.06]} position={[0, 0, -5.88]} color="#fbf6ee" roughness={0.45} />
      <Box args={[0.2, 4.6, 11]} position={[-7, 2.22, -0.5]} color="#ffffff" map={t.sideWall} roughness={1} />
      <Box args={[0.2, 4.6, 11]} position={[7, 2.22, -0.5]} color="#ffffff" map={t.sideWall} roughness={1} />
      <HouseWindow position={[0, 2.1, -5.88]} view={t.view} bump={t.fabric} />
      <Frame position={[-3.3, 2.55, -5.88]} size={[0.9, 0.65]} map={t.art[0]} />
      <Frame position={[-2.25, 2.2, -5.88]} size={[0.5, 0.65]} map={t.art[1]} />
      <Frame position={[3.2, 2.45, -5.88]} size={[0.75, 0.75]} map={t.art[2]} />
      {/* muebles */}
      <Sofa position={[-3.4, -0.08, -3.6]} rotation={[0, 0.35, 0]} bump={t.fabric} />
      <Box args={[1.1, 0.06, 0.6]} position={[-2.2, 0.36, -2.2]} rotation={[0, 0.35, 0]} color="#b98560" roughness={0.5} />
      <Box args={[0.9, 0.36, 0.45]} position={[-2.2, 0.12, -2.2]} rotation={[0, 0.35, 0]} color="#9b6b4a" roughness={0.6} />
      <mesh position={[-2.05, 0.46, -2.2]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.14, 24]} />
        <meshStandardMaterial color="#fbf6ee" roughness={0.3} />
      </mesh>
      <FloorLamp position={[-5.3, -0.08, -4.6]} />
      <Bookshelf position={[4.2, -0.08, -5.6]} />
      <Plant position={[5.6, -0.08, -4.9]} scale={1.3} />
      <Plant position={[-5.8, -0.08, -1.5]} scale={1.1} />
      <Plant position={[2.6, -0.08, -5.3]} scale={0.8} />
    </>
  )
}

/** La app usa siempre la sala (modo hogar). */
export function Backdrop() {
  return <Home />
}
