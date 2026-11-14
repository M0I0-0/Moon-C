import * as THREE from 'three'

const FORWARD = new THREE.Vector3(0, 0, 1)
const _fwd = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _rootQ = new THREE.Quaternion()
const _parentQ = new THREE.Quaternion()
const _parentInv = new THREE.Quaternion()
const _want = new THREE.Quaternion()
const IDENTITY = new THREE.Quaternion()

/**
 * Gira `obj` (cabeza o hueso de la cabeza) para que mire a `target`.
 * Funciona con cualquier rig: calcula la rotación en el espacio del mundo,
 * a partir del frente del modelo (+Z de `root`), y la convierte al espacio local.
 * `state.offset` guarda la rotación suavizada entre frames.
 */
export function aimAt(obj, root, target, state, { rest, maxAngle = 0.7, ease = 0.12 } = {}) {
  if (!obj.parent) return
  root.getWorldQuaternion(_rootQ)
  _fwd.copy(FORWARD).applyQuaternion(_rootQ)
  obj.getWorldPosition(_pos)
  _dir.copy(target).sub(_pos).normalize()
  _want.setFromUnitVectors(_fwd, _dir)
  const angle = 2 * Math.acos(Math.min(1, Math.abs(_want.w)))
  if (angle > maxAngle) _want.copy(IDENTITY).slerp(_want, maxAngle / angle)

  state.offset ??= new THREE.Quaternion()
  state.offset.slerp(_want, ease)

  obj.parent.getWorldQuaternion(_parentQ)
  _parentInv.copy(_parentQ).invert()
  obj.quaternion.copy(_parentInv).multiply(state.offset).multiply(_parentQ).multiply(rest ?? obj.quaternion)
}
