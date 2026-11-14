import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Backdrop } from './Backdrops'
import ModelSlot from './ModelSlot'
import PlaceholderModel from './PlaceholderModel'
import DoctorPlaceholder from './DoctorPlaceholder'
import MoonCModel from './MoonCModel'
import { ASSISTANT_MODEL_URL, ASSISTANT_MODEL_YAW, CREW_MODEL_URL, CREW_MODEL_YAW } from '../config'

const STATUS_COLOR = { normal: null, attention: '#e2b34a', urgent: '#e5574b' }
const ACCENT = { iss: '#8fc1e3', moon: '#e6d6ad', mars: '#f2a477', home: '#d9895b' }
const BASE = { home: '#e8dccb' }
const CREW_SPOT = [1.4, 0, 0.6]

function Platform({ color, base }) {
  return (
    <group>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <cylinderGeometry args={[1.25, 1.35, 0.08, 64]} />
        <meshStandardMaterial color={base} metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[1.08, 1.13, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[0.55, 0.57, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

/** Asistente Moon-C: no da vueltas; el cuerpo gira suave hacia la cámara y la cabeza la sigue. */
function Assistant({ accent, talking, mood }) {
  const root = useRef()
  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    const want = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z)
    let d = want - g.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    g.rotation.y += d * 0.06
  })
  const placeholder = <DoctorPlaceholder accent={accent} talking={talking} root={root} />
  return (
    <group ref={root}>
      {ASSISTANT_MODEL_URL ? (
        <ModelSlot
          url={ASSISTANT_MODEL_URL}
          yaw={ASSISTANT_MODEL_YAW}
          height={1.78}
          color="#e9edf1"
          lookAtCamera
          root={root}
          fallback={placeholder}
        />
      ) : (
        <MoonCModel mood={mood} root={root} fallback={placeholder} />
      )}
    </group>
  )
}

const TAG_DOT = { normal: '#5cbf8a', attention: '#e2b34a', urgent: '#e5574b' }

/** Etiqueta flotante dibujada en un canvas (sprite), siempre de frente a la cámara. */
function Tag({ text, status, position }) {
  const { texture, aspect } = useMemo(() => {
    const px = 2
    const font = `600 ${26 * px}px "Segoe UI", system-ui, sans-serif`
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = font
    const h = 46 * px
    const w = Math.ceil(ctx.measureText(text).width + 70 * px)
    ctx.canvas.width = w
    ctx.canvas.height = h
    ctx.font = font
    ctx.fillStyle = 'rgba(10, 13, 18, 0.85)'
    ctx.strokeStyle = status === 'urgent' ? TAG_DOT.urgent : 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    ctx.roundRect(px, px, w - 2 * px, h - 2 * px, h / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = TAG_DOT[status] ?? TAG_DOT.normal
    ctx.beginPath()
    ctx.arc(26 * px, h / 2, 7 * px, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e8ecf1'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 44 * px, h / 2 + px)
    const tex = new THREE.CanvasTexture(ctx.canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { texture: tex, aspect: w / h }
  }, [text, status])
  useEffect(() => () => texture.dispose(), [texture])
  const height = 0.11
  return (
    <sprite position={position} scale={[height * aspect, height, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} />
    </sprite>
  )
}

/** Tripulante en miniatura a un lado, sobre su propio pedestal. */
function CrewMini({ tint, base, status, label }) {
  return (
    <group position={CREW_SPOT}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.06, 40]} />
        <meshStandardMaterial color={base} metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.062, 0]}>
        <ringGeometry args={[0.3, 0.33, 64]} />
        <meshBasicMaterial color={tint} transparent opacity={0.9} />
      </mesh>
      <group position={[0, 0.06, 0]} scale={0.42}>
        <ModelSlot
          url={CREW_MODEL_URL}
          yaw={CREW_MODEL_YAW}
          height={1.75}
          color={tint}
          fallback={<PlaceholderModel tint={tint} status={status} speaking={false} />}
        />
      </group>
      {label && <Tag text={label} status={status} position={[0, 1.0, 0]} />}
    </group>
  )
}

export default function Scene({ envId, status, talking, mood, showCrew, crewLabel }) {
  const accent = ACCENT[envId] ?? ACCENT.iss
  const tint = STATUS_COLOR[status] ?? accent
  const base = BASE[envId] ?? '#1b1f26'
  return (
    <div className="scene" aria-hidden="true">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 5.4], fov: 40 }}>
        <Backdrop envId={envId} />
        <Platform color={accent} base={base} />
        <Assistant accent={accent} talking={talking} mood={mood} />
        {showCrew && <CrewMini tint={tint} base={base} status={status} label={crewLabel} />}
        <OrbitControls
          target={[0, 1, 0]}
          enablePan={false}
          minDistance={3}
          maxDistance={9}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
        />
      </Canvas>
    </div>
  )
}
