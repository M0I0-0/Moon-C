import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createMoonC } from '@model3d/moonc/moonc.js'
import glbUrl from '@model3d/moonc/moonc_nave_rig.glb?url'
import faceUrl from '@model3d/moonc/moonc_cara.jpg?url'
import faceClosedUrl from '@model3d/moonc/moonc_cara_cerrada.png?url'
import { aimAt } from '../lib/lookAt'
import { fitToHeight } from '../lib/fit'

function dispose(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.geometry?.dispose()
    for (const m of [].concat(o.material ?? [])) m.dispose()
  })
}

/**
 * Personaje Moon-C (Model3D/moonc): cuerpo con rig, animaciones por estado
 * y cara con shader. La cabeza sigue a la cámara encima de la animación.
 * Mientras carga, o si falla (sin WebGL2, archivo faltante), muestra `fallback`.
 */
export default function MoonCModel({ mood = 'atenta', height = 1.55, root, fallback }) {
  const [moon, setMoon] = useState(null)
  const [failed, setFailed] = useState(false)
  const aim = useRef({})

  useEffect(() => {
    let alive = true
    let created = null
    new GLTFLoader()
      .loadAsync(glbUrl)
      .then((gltf) => createMoonC({ THREE, gltf, faceUrl, faceClosedUrl }))
      .then((m) => {
        created = m
        m.root.traverse((o) => {
          if (o.isMesh) o.castShadow = o.receiveShadow = true
        })
        if (alive) setMoon(m)
        else dispose(m.root)
      })
      .catch((e) => {
        console.warn('[Moon-C] No se pudo cargar el personaje, se usa el provisional.', e)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      if (created) {
        created.mixer.stopAllAction()
        dispose(created.root)
      }
    }
  }, [])

  const fit = useMemo(() => (moon ? fitToHeight(moon.root, height) : null), [moon, height])
  const head = useMemo(() => moon?.root.getObjectByName('head') ?? null, [moon])

  useEffect(() => {
    if (moon && moon.state !== mood) moon.setState(mood)
  }, [moon, mood])

  useFrame(({ camera }, dt) => {
    if (!moon) return
    moon.update(Math.min(dt, 0.05))
    if (head && root?.current) {
      aimAt(head, root.current, camera.position, aim.current, { rest: head.quaternion.clone(), maxAngle: 0.45 })
    }
  })

  if (failed || !moon) return fallback
  return (
    <group position={fit.offset} scale={fit.scale}>
      <primitive object={moon.root} />
    </group>
  )
}
