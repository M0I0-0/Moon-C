import * as THREE from 'three'

/** Escala el objeto a `height` y lo apoya en el piso, centrado en X/Z. */
export function fitToHeight(object, height) {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const s = size.y > 0 ? height / size.y : 1
  const center = box.getCenter(new THREE.Vector3())
  return { scale: s, offset: [-center.x * s, -box.min.y * s, -center.z * s] }
}
