import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { STL_Z_UP } from '../config'
import { aimAt } from '../lib/lookAt'
import { fitToHeight as normalize } from '../lib/fit'

function modelFormat(url) {
  const ext = url.split(/[?#]/)[0].split('.').pop().toLowerCase()
  if (ext === 'stl') return 'stl'
  if (ext === 'glb' || ext === 'gltf') return 'gltf'
  return null
}

class ModelErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn('No se pudo cargar el modelo 3D, se usa el provisional.', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function StlModel({ url, height, color }) {
  const source = useLoader(STLLoader, url)
  const geometry = useMemo(() => {
    const g = source.clone()
    if (STL_Z_UP) g.rotateX(-Math.PI / 2)
    g.computeVertexNormals()
    g.computeBoundingBox()
    const { min, max } = g.boundingBox
    const s = height / (max.y - min.y || 1)
    g.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2)
    g.scale(s, s, s)
    return g
  }, [source, height])
  // Los STL no traen color: si el archivo tiene colores por vértice se usan, si no el tono de la escena.
  const vertexColors = Boolean(source.hasColors)
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={vertexColors ? '#ffffff' : color} vertexColors={vertexColors} roughness={0.6} metalness={0.1} />
    </mesh>
  )
}

const HEAD_NAME = /head|cabeza/i

function GltfModel({ url, height, lookAtCamera, root }) {
  const { scene, animations } = useGLTF(url)
  const model = useMemo(() => cloneSkinned(scene), [scene])
  const fit = useMemo(() => normalize(model, height), [model, height])
  const group = useRef()
  const { actions, names } = useAnimations(animations, group)
  const head = useMemo(() => {
    let found = null
    model.traverse((o) => {
      if (!found && HEAD_NAME.test(o.name) && !/top|end|tip/i.test(o.name)) found = o
    })
    return found
  }, [model])
  const rest = useMemo(() => head?.quaternion.clone(), [head])
  const aim = useRef({})

  useEffect(() => {
    model.traverse((o) => {
      if (o.isMesh) o.castShadow = o.receiveShadow = true
    })
  }, [model])

  useEffect(() => {
    const idle = names.find((n) => /idle|breath|stand/i.test(n)) ?? names[0]
    actions[idle]?.reset().fadeIn(0.4).play()
    return () => actions[idle]?.fadeOut(0.3)
  }, [actions, names])

  useFrame(({ camera }) => {
    if (!lookAtCamera || !head || !root?.current) return
    aimAt(head, root.current, camera.position, aim.current, {
      rest: names.length ? head.quaternion.clone() : rest,
      maxAngle: 0.6,
    })
  })

  return (
    <group ref={group} position={fit.offset} scale={fit.scale}>
      <primitive object={model} />
    </group>
  )
}

/**
 * Carga un modelo .glb/.gltf/.stl; si no hay URL, el formato no se reconoce o
 * falla la carga, muestra `fallback` (el modelo provisional).
 */
export default function ModelSlot({ url, fallback, height = 1.75, color = '#cfd6de', yaw = 0, lookAtCamera = false, root }) {
  const format = url ? modelFormat(url) : null
  if (!format) {
    if (url) console.warn(`Formato de modelo no soportado: ${url} (usa .glb, .gltf o .stl)`)
    return fallback
  }
  return (
    <ModelErrorBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}>
        <group rotation={[0, (yaw * Math.PI) / 180, 0]}>
          {format === 'stl' ? (
            <StlModel url={url} height={height} color={color} />
          ) : (
            <GltfModel url={url} height={height} lookAtCamera={lookAtCamera} root={root} />
          )}
        </group>
      </Suspense>
    </ModelErrorBoundary>
  )
}
