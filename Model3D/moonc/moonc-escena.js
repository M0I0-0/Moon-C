// Moon-C · escena lista para la app (sin internet). Uso:
//   import { montarMoonC } from './moonc/moonc-escena.js';
//   const moon = await montarMoonC(document.getElementById('laika'));   // contenedor del personaje
//   moon.setState('pensando');  moon.talk(true/false);
//   const m = await moon.maniobra('rcp', { entorno: 'iss', onPaso, onConteo, onTiempo });  // 'rcp' | 'torniquete' | 'atragantamiento'
//   m.iniciar(); m.siguiente(); m.ir('dea'); m.paqueteTierra();  ·  moon.cerrarManiobra() al salir
// Si falla (file://, sin WebGL), devuelve null: deja visible la Laika 2D actual.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMoonC, iluminarEscena } from './moonc.js';
import { crearManiobra } from './maniobras.js';

export async function montarMoonC(el, opciones = {}) {
  const { base = './moonc/' } = opciones;   // opciones.sombras = false en equipos muy limitados
  try {
    if (location.protocol === 'file:') throw new Error('Moon-C 3D requiere servidor local (localhost)');
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const s = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50); cam.position.set(0, 0.1, 6); cam.lookAt(0, 0, 0);
    const gltf = await new GLTFLoader().loadAsync(base + 'moonc_nave_rig.glb');
    const moon = await createMoonC({ THREE, gltf, faceUrl: base + 'moonc_cara.jpg', faceClosedUrl: base + 'moonc_cara_cerrada.png' });
    s.add(moon.root); el.appendChild(r.domElement);
    iluminarEscena(THREE, r, s, { sombras: opciones.sombras !== false });
    const rs = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    new ResizeObserver(rs).observe(el); rs();
    const clk = new THREE.Clock(); let activo = true;
    document.addEventListener('visibilitychange', () => { activo = !document.hidden; clk.getDelta(); });
    let man = null;
    const CAMS = { normal: [[0, 0.1, 6], [0, 0, 0]], rcp: [[1.2, 1.0, 4.2], [0.15, -0.4, 0.55]], torniquete: [[0.9, 0.35, 2.3], [-0.12, -0.45, 0.5]], atragantamiento: [[-2.6, 0.4, 2.4], [0, -0.4, 0.45]] };
    const apuntar = (k) => { const [p, t] = CAMS[k] || CAMS.normal; cam.position.set(...p); cam.lookAt(...t); };
    r.setAnimationLoop(() => { if (!activo) return; const dt = Math.min(clk.getDelta(), 0.05); moon.update(dt); if (man) man.update(dt); r.render(s, cam); });
    moon.maniobra = async (id, op = {}) => {
      if (man) moon.cerrarManiobra();
      man = await crearManiobra(id, { THREE, scene: s, moon, base, ...op });
      man.grupo.traverse(o => { if (o.isMesh && o.material && !o.material.transparent) { o.castShadow = o.receiveShadow = opciones.sombras !== false; } });
      man.grupo.visible = true; apuntar(id); return man;
    };
    moon.cerrarManiobra = () => { if (!man) return; man.ocultar(); s.remove(man.grupo); man = null; apuntar('normal'); };
    moon.pausar = (p) => { activo = !p; clk.getDelta(); };   // p.ej. pausar(true) al abrir Emergencia
    return moon;
  } catch (e) { console.warn('[Moon-C]', e.message); return null; }
}
