import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTS = [
  { pos: [0, 1.66, 0], geo: <icosahedronGeometry args={[0.19, 1]} /> },
  { pos: [0, 1.43, 0], geo: <cylinderGeometry args={[0.06, 0.07, 0.1, 8]} /> },
  { pos: [0, 1.1, 0], geo: <capsuleGeometry args={[0.24, 0.42, 4, 10]} /> },
  { pos: [-0.37, 1.08, 0], rot: [0, 0, 0.14], geo: <capsuleGeometry args={[0.065, 0.58, 4, 8]} /> },
  { pos: [0.37, 1.08, 0], rot: [0, 0, -0.14], geo: <capsuleGeometry args={[0.065, 0.58, 4, 8]} /> },
  { pos: [-0.12, 0.42, 0], geo: <capsuleGeometry args={[0.085, 0.6, 4, 8]} /> },
  { pos: [0.12, 0.42, 0], geo: <capsuleGeometry args={[0.085, 0.6, 4, 8]} /> },
]

/**
 * Modelo provisional: una figura humana sencilla mientras se termina el modelo 3D real.
 * Recibe las mismas props que recibirá el modelo final (tint, status, speaking).
 */
export default function PlaceholderModel({ tint, status, speaking }) {
  const group = useRef()
  const scan = useRef()
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.55,
        metalness: 0.15,
        flatShading: true,
        transparent: true,
        opacity: 0.93,
      }),
    [],
  )
  const scanMaterial = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }), [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    material.color.set(tint)
    material.emissive.set(tint)
    scanMaterial.color.set(tint)
    const pulse = status === 'urgent' ? 0.3 + Math.abs(Math.sin(t * 4)) * 0.55 : 0.2
    material.emissiveIntensity = speaking ? pulse + Math.abs(Math.sin(t * 9)) * 0.25 : pulse
    if (group.current) {
      group.current.rotation.y = t * 0.25
      group.current.position.y = 0.06 + Math.sin(t * 1.3) * 0.03
    }
    if (scan.current) scan.current.position.y = 0.2 + ((Math.sin(t * 0.9) + 1) / 2) * 1.55
  })

  return (
    <group ref={group}>
      {PARTS.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={p.rot ?? [0, 0, 0]} material={material} castShadow>
          {p.geo}
        </mesh>
      ))}
      <mesh ref={scan} rotation={[Math.PI / 2, 0, 0]} material={scanMaterial}>
        <torusGeometry args={[0.48, 0.006, 6, 64]} />
      </mesh>
    </group>
  )
}
