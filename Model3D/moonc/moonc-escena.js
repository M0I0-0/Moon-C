// Moon-C · escena lista para la app (sin internet). Uso:
//   import { montarMoonC } from './moonc/moonc-escena.js';
//   const moon = await montarMoonC(document.getElementById('laika'));   // contenedor del personaje
//   moon.setState('pensando');  moon.talk(true/false);
// Si falla (file://, sin WebGL), devuelve null: deja visible la Laika 2D actual.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMoonC } from './moonc.js';

export async function montarMoonC(el, { base = './moonc/' } = {}) {
  try {
    if (location.protocol === 'file:') throw new Error('Moon-C 3D requiere servidor local (localhost)');
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    const s = new THREE.Scene();
    const kl = new THREE.DirectionalLight(0xffffff, 1.3); kl.position.set(1, 2, 3); s.add(kl);
    s.add(new THREE.HemisphereLight(0xeef0ff, 0x8888a0, 1.4));
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50); cam.position.set(0, 0.1, 6);
    const gltf = await new GLTFLoader().loadAsync(base + 'moonc_nave_rig.glb');
    const moon = await createMoonC({ THREE, gltf, faceUrl: base + 'moonc_cara.jpg', faceClosedUrl: base + 'moonc_cara_cerrada.png' });
    s.add(moon.root); el.appendChild(r.domElement);
    const rs = () => { const w = el.clientWidth || 300, h = el.clientHeight || 300; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    new ResizeObserver(rs).observe(el); rs();
    const clk = new THREE.Clock(); let activo = true;
    document.addEventListener('visibilitychange', () => { activo = !document.hidden; clk.getDelta(); });
    r.setAnimationLoop(() => { if (!activo) return; moon.update(Math.min(clk.getDelta(), 0.05)); r.render(s, cam); });
    moon.pausar = (p) => { activo = !p; clk.getDelta(); };   // p.ej. pausar(true) al abrir Emergencia
    return moon;
  } catch (e) { console.warn('[Moon-C]', e.message); return null; }
}
