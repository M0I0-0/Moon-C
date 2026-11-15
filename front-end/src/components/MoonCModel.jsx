import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createMoonC } from '@model3d/moonc/moonc.js'
import { crearManiobra } from '@model3d/moonc/maniobras.js'
import glbUrl from '@model3d/moonc/moonc_nave_rig.glb?url'
import faceUrl from '@model3d/moonc/moonc_cara.jpg?url'
import faceClosedUrl from '@model3d/moonc/moonc_cara_cerrada.png?url'
import { aimAt } from '../lib/lookAt'
import { fitToHeight } from '../lib/fit'
import { MANEUVER_CAMS, MANEUVER_FILES } from '../lib/maneuvers'

const HOME_CAM = { pos: new THREE.Vector3(0, 1.5, 5.4), target: new THREE.Vector3(0, 1, 0) }

function dispose(root) {
  root.traverse((o) => {
    if (!o.isMesh) return
    o.geometry?.dispose()
    for (const m of [].concat(o.material ?? [])) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose()
      m.dispose()
    }
  })
}

/**
 * Personaje Moon-C (Model3D/moonc): cuerpo con rig, animaciones por estado
 * y cara con shader. La cabeza sigue a la cámara encima de la animación.
 * Si recibe `maneuver` ({ id, entorno, nonce }), monta el maniquí de esa maniobra a su lado,
 * lleva la cámara hacia él y reporta el avance con `ctrlRef` (controlador) y `onEvent`.
 * Mientras carga, o si falla (sin WebGL2, archivo faltante), muestra `fallback`.
 */
export default function MoonCModel({ mood = 'atenta', height = 1.55, root, fallback, maneuver, ctrlRef, onEvent, speaking = false, mouthRef }) {
  const [moon, setMoon] = useState(null)
  const [failed, setFailed] = useState(false)
  const aim = useRef({})
  const holder = useRef()
  const cam = useRef(null) // animación de cámara { pos, target }
  const moodRef = useRef(mood)
  const eventRef = useRef(onEvent)
  const speakingRef = useRef(speaking)
  const { controls } = useThree()

  useEffect(() => {
    moodRef.current = mood
    eventRef.current = onEvent
    speakingRef.current = speaking
  })

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

  // Estado de ánimo (solo cuando no hay maniobra: la maniobra elige sus propios clips).
  useEffect(() => {
    if (moon && !maneuver && moon.state !== mood) moon.setState(mood)
  }, [moon, mood, maneuver])

  // Maniobra guiada: carga el maniquí, la arranca y la limpia al cerrar o cambiar.
  const mId = maneuver?.id
  const mEnv = maneuver?.entorno
  const mNonce = maneuver?.nonce
  // El entorno inicial se lee al montar; los cambios posteriores los aplica `cambiarEntorno` sin remontar el maniquí.
  const envRef = useRef(mEnv)
  envRef.current = mEnv
  useEffect(() => {
    ctrlRef?.current?.cambiarEntorno?.(mEnv)
  }, [mEnv, ctrlRef])
  useEffect(() => {
    const group = holder.current
    if (!moon || !mId || !group) return undefined
    let alive = true
    let ctrl = null
    const emit = (name, ...args) => eventRef.current?.[name]?.(...args)

    // Cámara: del modelo a coordenadas del mundo (Moon-C queda de frente, sin girar hacia la cámara).
    const [p, t] = MANEUVER_CAMS[mId]
    group.updateMatrixWorld(true)
    cam.current = {
      pos: group.localToWorld(new THREE.Vector3(...p)),
      target: group.localToWorld(new THREE.Vector3(...t)),
    }

    crearManiobra(mId, {
      THREE,
      scene: group,
      moon,
      archivos: MANEUVER_FILES,
      entorno: envRef.current,
      onPaso: (i, paso, pasos) => emit('onPaso', i, paso, pasos),
      onConteo: (n, total) => emit('onConteo', n, total),
      onTiempo: (s) => emit('onTiempo', s),
    })
      .then((m) => {
        if (!alive) {
          group.remove(m.grupo)
          dispose(m.grupo)
          return
        }
        ctrl = m
        if (ctrlRef) ctrlRef.current = m
        m.iniciar()
        emit('onReady', m)
      })
      .catch((e) => {
        console.warn('[Moon-C] No se pudo abrir la maniobra.', e)
        if (alive) emit('onError', e)
      })

    return () => {
      alive = false
      if (ctrlRef) ctrlRef.current = null
      if (ctrl) {
        ctrl.ocultar()
        group.remove(ctrl.grupo)
        dispose(ctrl.grupo)
      }
      moon.root.position.set(0, 0, 0)
      moon.root.rotation.y = 0
      moon.setState(moodRef.current)
      cam.current = { pos: HOME_CAM.pos.clone(), target: HOME_CAM.target.clone() }
    }
  }, [moon, mId, mNonce, ctrlRef])

  useFrame(({ camera }, dt) => {
    if (!moon) return
    const step = Math.min(dt, 0.05)
    // Con la voz de Moon-C la boca sigue el volumen real del audio; null = animación normal.
    moon.setMouth(mouthRef?.current ?? null)
    moon.update(step)
    const ctrl = ctrlRef?.current
    if (ctrl) {
      ctrl.update(step)
      // En una maniobra la boca sigue a la voz (o a los subtítulos), sin importar qué animación esté haciendo.
      moon.talk(speakingRef.current)
    }
    if (head && root?.current && !ctrl) {
      aimAt(head, root.current, camera.position, aim.current, { rest: head.quaternion.clone(), maxAngle: 0.45 })
    }
    // Transición suave de la cámara; al llegar se suelta para que el usuario pueda orbitar.
    const c = cam.current
    if (c && controls) {
      const k = 1 - Math.exp(-3 * step)
      camera.position.lerp(c.pos, k)
      controls.target.lerp(c.target, k)
      controls.update()
      if (camera.position.distanceTo(c.pos) < 0.02 && controls.target.distanceTo(c.target) < 0.02) cam.current = null
    }
  })

  if (failed || !moon) return fallback
  return (
    <group ref={holder} position={fit.offset} scale={fit.scale}>
      <primitive object={moon.root} />
    </group>
  )
}
