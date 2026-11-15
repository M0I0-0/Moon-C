import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Backdrop } from './Backdrops'
import ModelSlot from './ModelSlot'
import DoctorPlaceholder from './DoctorPlaceholder'
import MoonCModel from './MoonCModel'
import { ASSISTANT_MODEL_URL, ASSISTANT_MODEL_YAW } from '../config'

const ACCENT = { iss: '#8fc1e3', moon: '#e6d6ad', mars: '#f2a477', home: '#d9895b' }
const BASE = { home: '#e8dccb' }

/**
 * La bitácora tapa la parte baja de la pantalla: corre la imagen hacia arriba la mitad de su alto
 * para que Moon-C quede centrada en el espacio libre y se vea completa, sea cual sea el tamaño de la ventana.
 */
function DockOffset() {
  const { camera, size } = useThree()
  useEffect(() => {
    const dock = document.querySelector('.dock')
    if (!dock) return undefined
    const apply = () => {
      const h = Math.min(dock.offsetHeight + 12, size.height * 0.55)
      camera.setViewOffset(size.width, size.height, 0, h / 2, size.width, size.height)
      camera.updateProjectionMatrix()
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(dock)
    return () => {
      ro.disconnect()
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }, [camera, size])
  return null
}

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
function Assistant({ accent, talking, mood, maneuver, ctrlRef, onManeuverEvent, mouthRef, language }) {
  const root = useRef()
  useFrame(({ camera }) => {
    const g = root.current
    if (!g) return
    // En una maniobra Moon-C queda de frente (la cámara y el maniquí están calculados para esa pose).
    const want = maneuver ? 0 : Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z)
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
        <MoonCModel
          mood={mood}
          root={root}
          fallback={placeholder}
          maneuver={maneuver}
          ctrlRef={ctrlRef}
          onEvent={onManeuverEvent}
          speaking={talking}
          mouthRef={mouthRef}
          language={language}
        />
      )}
    </group>
  )
}

export default function Scene({ envId, talking, mood, maneuver, ctrlRef, onManeuverEvent, mouthRef, language }) {
  const accent = ACCENT[envId] ?? ACCENT.iss
  const base = BASE[envId] ?? '#1b1f26'
  return (
    <div className="scene" aria-hidden="true">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.5, 5.4], fov: 40, near: 0.3, far: 80 }}>
        <DockOffset />
        <Backdrop />
        <Platform color={accent} base={base} />
        <Assistant
          accent={accent}
          talking={talking}
          mood={mood}
          maneuver={maneuver}
          ctrlRef={ctrlRef}
          onManeuverEvent={onManeuverEvent}
          mouthRef={mouthRef}
          language={language}
        />
        <OrbitControls
          makeDefault
          target={[0, 1, 0]}
          enablePan={false}
          minDistance={1}
          maxDistance={9}
          minPolarAngle={Math.PI / 2.7}
          maxPolarAngle={Math.PI / 2.05}
          enableDamping
        />
      </Canvas>
    </div>
  )
}
