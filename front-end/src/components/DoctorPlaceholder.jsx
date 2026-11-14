import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { aimAt } from '../lib/lookAt'

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra })
const REST = new THREE.Quaternion()

/** Médico provisional: no gira, respira, parpadea y sigue a la cámara con la mirada. */
export default function DoctorPlaceholder({ accent, talking, root }) {
  const m = useMemo(
    () => ({
      coat: mat('#eef1f4'),
      pants: mat('#2b3446'),
      skin: mat('#d9b08c'),
      hair: mat('#3b2b22'),
      eye: mat('#1c1f24', { roughness: 0.3, flatShading: false }),
      shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      scrub: mat('#5f8fae'),
      steth: mat('#2f3540', { roughness: 0.4 }),
      metal: mat('#c9ced6', { metalness: 0.8, roughness: 0.25 }),
      mouth: mat('#7a3b33'),
      badge: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    }),
    [],
  )
  const torso = useRef()
  const head = useRef()
  const nod = useRef()
  const eyes = useRef()
  const mouth = useRef()
  const aim = useRef({})

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime()
    m.badge.color.set(accent)
    if (torso.current) torso.current.scale.set(1, 1 + Math.sin(t * 1.6) * 0.012, 1 + Math.sin(t * 1.6) * 0.02)
    if (head.current && root?.current) aimAt(head.current, root.current, camera.position, aim.current, { rest: REST, maxAngle: 0.65 })
    if (eyes.current) eyes.current.scale.y = t % 4.2 < 0.12 ? 0.1 : 1
    if (nod.current) nod.current.rotation.x = talking ? Math.sin(t * 5) * 0.035 : Math.sin(t * 0.7) * 0.015
    if (mouth.current) mouth.current.scale.y = talking ? 0.6 + Math.abs(Math.sin(t * 11)) * 1.6 : 0.6
  })

  return (
    <group>
      {/* piernas y zapatos */}
      {[-0.11, 0.11].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.4, 0]} material={m.pants} castShadow>
            <capsuleGeometry args={[0.075, 0.55, 4, 8]} />
          </mesh>
          <mesh position={[x, 0.05, 0.04]} material={m.steth} castShadow>
            <boxGeometry args={[0.13, 0.08, 0.24]} />
          </mesh>
        </group>
      ))}

      {/* bata */}
      <group ref={torso} position={[0, 1.08, 0]}>
        <mesh material={m.coat} castShadow>
          <capsuleGeometry args={[0.25, 0.42, 4, 12]} />
        </mesh>
        <mesh position={[0, -0.34, 0]} material={m.coat} castShadow>
          <cylinderGeometry args={[0.27, 0.33, 0.42, 12, 1, true]} />
        </mesh>
        {/* uniforme debajo de la bata */}
        <mesh position={[0, 0.16, 0.2]} rotation={[0.2, 0, 0]} material={m.scrub}>
          <coneGeometry args={[0.1, 0.22, 3]} />
        </mesh>
        {/* gafete con cruz */}
        <group position={[-0.13, 0.08, 0.245]}>
          <mesh material={m.steth}>
            <boxGeometry args={[0.09, 0.11, 0.01]} />
          </mesh>
          <mesh position={[0, 0, 0.007]} material={m.badge}>
            <boxGeometry args={[0.05, 0.015, 0.004]} />
          </mesh>
          <mesh position={[0, 0, 0.007]} material={m.badge}>
            <boxGeometry args={[0.015, 0.05, 0.004]} />
          </mesh>
        </group>
        {/* estetoscopio */}
        <mesh position={[0, 0.22, 0.06]} rotation={[1.25, 0, 0]} material={m.steth}>
          <torusGeometry args={[0.15, 0.012, 6, 24, Math.PI]} />
        </mesh>
        <mesh position={[0.1, -0.02, 0.25]} material={m.steth}>
          <cylinderGeometry args={[0.008, 0.008, 0.26, 6]} />
        </mesh>
        <mesh position={[0.1, -0.16, 0.26]} rotation={[Math.PI / 2, 0, 0]} material={m.metal}>
          <cylinderGeometry args={[0.035, 0.035, 0.02, 14]} />
        </mesh>
      </group>

      {/* brazos */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.34, 1.32, 0]} rotation={[0.08, 0, s * 0.1]}>
          <mesh position={[0, -0.3, 0]} material={m.coat} castShadow>
            <capsuleGeometry args={[0.07, 0.5, 4, 8]} />
          </mesh>
          <mesh position={[0, -0.64, 0.02]} material={m.skin}>
            <icosahedronGeometry args={[0.06, 1]} />
          </mesh>
        </group>
      ))}

      {/* cuello y cabeza: la cabeza sigue a la cámara */}
      <mesh position={[0, 1.44, 0]} material={m.skin}>
        <cylinderGeometry args={[0.06, 0.07, 0.1, 8]} />
      </mesh>
      <group ref={head} position={[0, 1.5, 0]}>
        <group ref={nod}>
          <mesh position={[0, 0.14, 0]} material={m.skin} castShadow>
            <icosahedronGeometry args={[0.165, 2]} />
          </mesh>
          <mesh position={[0, 0.2, -0.025]} scale={[1.05, 0.8, 1.05]} material={m.hair}>
            <sphereGeometry args={[0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.163, 0.13, 0]} material={m.skin}>
              <sphereGeometry args={[0.03, 8, 6]} />
            </mesh>
          ))}
          <group ref={eyes} position={[0, 0.15, 0.148]}>
            {[-0.058, 0.058].map((x) => (
              <group key={x} position={[x, 0, 0]}>
                <mesh material={m.eye}>
                  <sphereGeometry args={[0.022, 12, 10]} />
                </mesh>
                <mesh position={[0.007, 0.008, 0.018]} material={m.shine}>
                  <sphereGeometry args={[0.006, 6, 4]} />
                </mesh>
              </group>
            ))}
          </group>
          {[-0.058, 0.058].map((x) => (
            <mesh key={x} position={[x, 0.205, 0.145]} rotation={[0, 0, x > 0 ? -0.12 : 0.12]} material={m.hair}>
              <boxGeometry args={[0.06, 0.012, 0.012]} />
            </mesh>
          ))}
          <mesh ref={mouth} position={[0, 0.06, 0.155]} rotation={[0, 0, Math.PI / 2]} material={m.mouth}>
            <capsuleGeometry args={[0.009, 0.04, 2, 6]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
