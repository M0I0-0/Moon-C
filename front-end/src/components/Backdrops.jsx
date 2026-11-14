import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
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

function Earth({ position, radius, spin = 0.01 }) {
  const ref = useRef()
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * spin
  })
  return (
    <group position={position}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[radius, 5]} />
        <meshStandardMaterial color="#21569a" roughness={0.9} emissive="#0c2347" emissiveIntensity={0.35} />
      </mesh>
      <mesh scale={1.035}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshBasicMaterial color="#6fb0ff" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
    </group>
  )
}

function Dome({ position, scale = 1, color = '#d8d6d0' }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow>
        <sphereGeometry args={[1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.08, 48]} />
        <meshStandardMaterial color="#555" />
      </mesh>
    </group>
  )
}

function Rocks({ count, color, spread, seed, minR = 0.08, maxR = 0.5 }) {
  const rocks = useMemo(() => {
    const rnd = seeded(seed)
    return Array.from({ length: count }, () => {
      const angle = rnd() * Math.PI * 2
      const dist = 2.2 + rnd() * spread
      const r = minR + rnd() * (maxR - minR)
      let x = Math.cos(angle) * dist
      if (Math.sin(angle) > 0.2 && Math.abs(x) < 2.6) x = Math.sign(x || 1) * (2.6 + rnd())
      return {
        pos: [x, r * 0.35, Math.sin(angle) * dist - 2],
        r,
        rot: [rnd() * 3, rnd() * 3, rnd() * 3],
      }
    })
  }, [count, spread, seed, minR, maxR])
  return rocks.map((k, i) => (
    <mesh key={i} position={k.pos} rotation={k.rot} castShadow receiveShadow>
      <dodecahedronGeometry args={[k.r, 0]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </mesh>
  ))
}

function Craters({ count, seed }) {
  const craters = useMemo(() => {
    const rnd = seeded(seed)
    return Array.from({ length: count }, () => {
      const angle = rnd() * Math.PI * 2
      const dist = 3 + rnd() * 22
      return { pos: [Math.cos(angle) * dist, 0.01, Math.sin(angle) * dist - 4], r: 0.4 + rnd() * 2.2 }
    })
  }, [count, seed])
  return craters.map((c, i) => (
    <group key={i} position={c.pos}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[c.r, 32]} />
        <meshStandardMaterial color="#4f4e4b" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[c.r, c.r * 1.18, 32]} />
        <meshStandardMaterial color="#8d8a84" roughness={1} />
      </mesh>
    </group>
  ))
}

function Ground({ color, size = 120 }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
      <circleGeometry args={[size, 64]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

function SolarArray({ position, rotation }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[14, 0.12, 0.12]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.7} roughness={0.35} />
      </mesh>
      {[-5, -2.4, 2.4, 5].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[2.2, 0.03, 4.6]} />
          <meshStandardMaterial color="#26324a" metalness={0.5} roughness={0.3} emissive="#3a2a10" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

function ISS() {
  return (
    <>
      <color attach="background" args={['#04060b']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 8, 4]} intensity={2.2} castShadow />
      <directionalLight position={[-4, -6, -2]} intensity={0.5} color="#6fa8ff" />
      <Stars radius={90} depth={40} count={3500} factor={3} fade speed={0.4} />
      <Earth position={[4, -38, -34]} radius={34} spin={0.004} />
      <SolarArray position={[0, 3.2, -9]} rotation={[0.25, 0, 0]} />
    </>
  )
}

function Moon() {
  return (
    <>
      <color attach="background" args={['#020203']} />
      <ambientLight intensity={0.18} />
      <directionalLight position={[-10, 4, 3]} intensity={2.8} castShadow shadow-mapSize={[1024, 1024]} />
      <Stars radius={90} depth={40} count={4000} factor={3} fade speed={0.2} />
      <Earth position={[-16, 10, -45]} radius={2.6} spin={0.02} />
      <Ground color="#77746e" />
      <Craters count={26} seed={7} />
      <Rocks count={40} color="#8a877f" spread={16} seed={3} />
      <Dome position={[6.5, -0.08, -9]} scale={2.2} />
      <Dome position={[10, -0.08, -13]} scale={1.4} />
    </>
  )
}

function Mars() {
  return (
    <>
      <color attach="background" args={['#c4845d']} />
      <fog attach="fog" args={['#bd7a52', 14, 70]} />
      <ambientLight intensity={0.55} color="#ffd9bf" />
      <hemisphereLight args={['#f3c49e', '#6b2d17', 0.6]} />
      <directionalLight position={[8, 10, 2]} intensity={1.8} color="#ffe2c8" castShadow />
      <Ground color="#a4532f" />
      <Rocks count={70} color="#7e3a1f" spread={22} seed={11} maxR={0.7} />
      <mesh position={[-28, -6, -60]} scale={[30, 10, 10]}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#9a4e2c" roughness={1} />
      </mesh>
      <mesh position={[30, -8, -70]} scale={[36, 13, 12]}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshStandardMaterial color="#93492a" roughness={1} />
      </mesh>
      <Dome position={[-6.5, -0.08, -8]} scale={2.4} color="#e8e0d6" />
      <Dome position={[-10.5, -0.08, -12]} scale={1.5} color="#e8e0d6" />
    </>
  )
}

function Box({ args, position, color, rotation, roughness = 0.8, ...rest }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial color={color} roughness={roughness} {...rest} />
    </mesh>
  )
}

function Sofa({ position, rotation }) {
  const fabric = '#7fa69a'
  return (
    <group position={position} rotation={rotation}>
      <Box args={[2.6, 0.42, 1]} position={[0, 0.29, 0]} color={fabric} />
      <Box args={[2.6, 0.75, 0.24]} position={[0, 0.78, -0.4]} color={fabric} />
      <Box args={[0.26, 0.62, 1]} position={[-1.3, 0.5, 0]} color="#6f9488" />
      <Box args={[0.26, 0.62, 1]} position={[1.3, 0.5, 0]} color="#6f9488" />
      <Box args={[1.12, 0.14, 0.78]} position={[-0.58, 0.57, 0.06]} color="#8db3a6" />
      <Box args={[1.12, 0.14, 0.78]} position={[0.58, 0.57, 0.06]} color="#8db3a6" />
      <Box args={[0.5, 0.42, 0.14]} position={[-0.8, 0.86, -0.22]} rotation={[-0.2, 0.15, 0.08]} color="#f2c86b" />
      <Box args={[0.46, 0.4, 0.14]} position={[0.86, 0.85, -0.22]} rotation={[-0.2, -0.2, -0.06]} color="#e9a07a" />
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
        <cylinderGeometry args={[0.22, 0.24, 0.05, 24]} />
        <meshStandardMaterial color="#3d3029" />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.65, 12]} />
        <meshStandardMaterial color="#3d3029" metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <cylinderGeometry args={[0.2, 0.34, 0.38, 32, 1, true]} />
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
        <cylinderGeometry args={[0.22, 0.17, 0.44, 24]} />
        <meshStandardMaterial color="#c9744f" roughness={0.9} />
      </mesh>
      {leaves.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} castShadow>
          <icosahedronGeometry args={[r, 0]} />
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
      <Box args={[1.5, 2.1, 0.4]} position={[0, 1.05, -0.02]} color="#9b6b4a" />
      {[0.4, 1.0, 1.6].map((y) => (
        <Box key={y} args={[1.36, 0.03, 0.36]} position={[0, y, 0.03]} color="#b98560" />
      ))}
      <Box args={[1.36, 1.86, 0.02]} position={[0, 1.07, -0.19]} color="#7d5338" />
      {books.map((b, i) => (
        <Box key={i} args={[b.w, b.h, 0.26]} position={[b.x, b.y, 0.06]} color={b.c} />
      ))}
    </group>
  )
}

function Frame({ position, size, color }) {
  return (
    <group position={position}>
      <Box args={[size[0] + 0.1, size[1] + 0.1, 0.04]} color="#f7efe3" />
      <mesh position={[0, 0, 0.025]}>
        <planeGeometry args={size} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    </group>
  )
}

function HouseWindow({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 1.7]} />
        <meshBasicMaterial color="#bfe1f7" />
      </mesh>
      <mesh position={[0.7, -0.45, -0.01]}>
        <circleGeometry args={[0.95, 32]} />
        <meshBasicMaterial color="#9fd08f" />
      </mesh>
      <mesh position={[-0.8, -0.6, -0.008]}>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial color="#86c27b" />
      </mesh>
      <mesh position={[-0.75, 0.45, -0.01]}>
        <circleGeometry args={[0.16, 24]} />
        <meshBasicMaterial color="#fff3c4" />
      </mesh>
      <Box args={[2.75, 0.08, 0.1]} position={[0, 0.88, 0]} color="#fbf6ee" />
      <Box args={[2.75, 0.1, 0.18]} position={[0, -0.88, 0.04]} color="#fbf6ee" />
      <Box args={[0.08, 1.8, 0.1]} position={[-1.34, 0, 0]} color="#fbf6ee" />
      <Box args={[0.08, 1.8, 0.1]} position={[1.34, 0, 0]} color="#fbf6ee" />
      <Box args={[0.05, 1.7, 0.06]} position={[0, 0, 0]} color="#fbf6ee" />
      <Box args={[2.6, 0.05, 0.06]} position={[0, 0.05, 0]} color="#fbf6ee" />
      <Box args={[0.55, 2.3, 0.06]} position={[-1.7, -0.05, 0.08]} color="#f0b48f" />
      <Box args={[0.55, 2.3, 0.06]} position={[1.7, -0.05, 0.08]} color="#f0b48f" />
      <Plant position={[0.9, -0.83, 0.1]} scale={0.45} />
    </group>
  )
}

function Home() {
  return (
    <>
      <color attach="background" args={['#efe2cf']} />
      <ambientLight intensity={0.7} color="#fff3e2" />
      <hemisphereLight args={['#fff6e8', '#b98a66', 0.7]} />
      <directionalLight position={[4, 7, 6]} intensity={1.5} color="#fff0dc" castShadow shadow-mapSize={[1024, 1024]} />
      {/* piso de madera y tapete */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, -0.5]} receiveShadow>
        <planeGeometry args={[14, 11]} />
        <meshStandardMaterial color="#c79a6e" roughness={0.85} />
      </mesh>
      {Array.from({ length: 13 }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-6 + i, -0.079, -0.5]}>
          <planeGeometry args={[0.015, 11]} />
          <meshBasicMaterial color="#a77c55" />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.075, 0]} receiveShadow>
        <circleGeometry args={[2.3, 64]} />
        <meshStandardMaterial color="#e9c9a8" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.074, 0]}>
        <ringGeometry args={[1.95, 2.05, 64]} />
        <meshBasicMaterial color="#d9895b" />
      </mesh>
      {/* paredes */}
      <Box args={[14, 4.6, 0.2]} position={[0, 2.22, -6]} color="#f6ead8" roughness={1} />
      <Box args={[14, 0.14, 0.06]} position={[0, 0, -5.88]} color="#fbf6ee" />
      <Box args={[0.2, 4.6, 11]} position={[-7, 2.22, -0.5]} color="#f1e1cb" roughness={1} />
      <Box args={[0.2, 4.6, 11]} position={[7, 2.22, -0.5]} color="#f1e1cb" roughness={1} />
      <HouseWindow position={[0, 2.1, -5.88]} />
      <Frame position={[-3.3, 2.55, -5.88]} size={[0.9, 0.65]} color="#8fb8d6" />
      <Frame position={[-2.25, 2.2, -5.88]} size={[0.5, 0.65]} color="#f2c86b" />
      <Frame position={[3.2, 2.45, -5.88]} size={[0.75, 0.75]} color="#e9a07a" />
      {/* muebles */}
      <Sofa position={[-3.4, -0.08, -3.6]} rotation={[0, 0.35, 0]} />
      <Box args={[1.1, 0.06, 0.6]} position={[-2.2, 0.36, -2.2]} rotation={[0, 0.35, 0]} color="#b98560" />
      <Box args={[0.9, 0.36, 0.45]} position={[-2.2, 0.12, -2.2]} rotation={[0, 0.35, 0]} color="#9b6b4a" />
      <mesh position={[-2.05, 0.46, -2.2]}>
        <cylinderGeometry args={[0.06, 0.05, 0.14, 16]} />
        <meshStandardMaterial color="#fbf6ee" />
      </mesh>
      <FloorLamp position={[-5.3, -0.08, -4.6]} />
      <Bookshelf position={[4.2, -0.08, -5.6]} />
      <Plant position={[5.6, -0.08, -4.9]} scale={1.3} />
      <Plant position={[-5.8, -0.08, -1.5]} scale={1.1} />
      <Plant position={[2.6, -0.08, -5.3]} scale={0.8} />
    </>
  )
}

export function Backdrop({ envId }) {
  if (envId === 'home') return <Home />
  if (envId === 'moon') return <Moon />
  if (envId === 'mars') return <Mars />
  return <ISS />
}
