// Moon-C · controlador del personaje (cuerpo + cara)
// Uso:
//   import { createMoonC } from './moonc.js';
//   const moon = await createMoonC({ THREE, gltf, faceUrl: 'moonc_cara.jpg' });   // usa también moonc_cara_cerrada.png
//   scene.add(moon.root);  moon.setState('escuchando');  // en el loop: moon.update(dt)
//   moon.talk(true|false)  · o moon.setMouth(0..1) con el volumen real del audio
//   moon.express({...})    · ajuste manual de cara (ver FACE_PRESETS)
//
// La cara usa una "calcomanía" frontal (moonc_cara.jpg) que el shader deforma:
// párpados superior/inferior, cejas (manchas claras), mirada y boca.
//
// AI disclosure: the face texture (moonc_cara.jpg, moonc_cara_cerrada.png) was generated with AI. Its
// "AI-generated" watermark sits in the top band of the image, which the shader never samples. See AI_DISCLOSURE.md.

export const STATES = ['tranquila','atenta','alerta','escuchando','pensando','hablando','sin_enlace','saludo','rcp','rcp_manos','rcp_hombros','rcp_respira','llamar','senalar','tq_colocar','tq_jalar','tq_girar','tq_trabar','ah_sostener','ah_golpes','ah_abrazo','ah_empuje','rcp_er_pos','rcp_er','ah_cuenta'];

// Coordenadas en el espacio del modelo (x, y), medidas sobre la cara horneada
const FACE = {
  min: [-0.5, -0.1], size: [1.0, 0.6],
  eyeC: [[-0.245, 0.150], [0.244, 0.150]], eyeR: [0.109, 0.097],
  // manchas blancas (cejas): elipse ajustada sobre la textura · ax = [semieje menor, mayor] · ang = giro del eje menor
  browC: [[-0.1826, 0.2679], [0.1862, 0.2691]], browR: [0.064, 0.057], browAx: [0.045, 0.060], browAng: [0.925, -0.867],
  browFur: '#9a99a7', browCol: '#f6f6f8',
  mouthC: [0.007, -0.004],
  fur: '#a9a9b5', cheek: '#fdfdfd', lash: '#17161d', mouthIn: '#3d3742', tongue: '#b9a4ad',
};

// Presets de cara por estado. Índice 0 = ojo/ceja derecha del personaje (lado -x).
// lid: párpado superior (0 abierto, 1 cerrado) · low: párpado inferior (0..1, sonrisa/entrecerrar)
// brow: [dx, dy] desplazamiento de ceja · browRot: giro (+ = interior arriba, "ojos de cachorro")
// look: mirada [x, y] (-1..1) · blink: segundos entre parpadeos [min, max] (null = sin parpadeo)
export const FACE_PRESETS = {
  // browS: escala de cada ceja [ancho, alto] (1 = original)
  tranquila:  { lid:[0.10,0.10], low:[0,0], brow:[[0,0],[0,0]],               browRot:[0,0],         browS:[[1,1],[1,1]],          look:[0,0],       blink:[2.5,6],  saccade:0.35 },
  atenta:     { lid:[0,0],       low:[0,0],       brow:[[0.006,0.032],[-0.006,0.032]],browRot:[0.45,0.45],  browS:[[0.95,1.08],[0.95,1.08]],look:[0,0.08],    blink:[5,9],    saccade:0.12 },
  alerta:     { lid:[0,0],       low:[0,0],       brow:[[0,0.040],[0,0.040]],       browRot:[-0.15,-0.15], browS:[[0.9,1.12],[0.9,1.12]],  look:[0,0],       blink:[6,10],   saccade:0.6, saccadeFast:true },
  escuchando: { lid:[0.04,0.04], low:[0.05,0.05], brow:[[0.004,0.022],[-0.004,0.034]],browRot:[0.40,0.55],  browS:[[1,1.05],[1,1.08]],    look:[0.2,0.1],   blink:[3.5,7],  saccade:0.15 },
  pensando:   { lid:[0.14,0.14], low:[0.10,0.10], brow:[[0.004,0.040],[0,0.004]],  browRot:[0.30,-0.10],  browS:[[0.95,1.1],[1,1]],      look:[0.55,0.6],  blink:[3,6],    saccade:0.25 },
  hablando:   { lid:[0.08,0.08], low:[0.12,0.12], brow:[[0,0.010],[0,0.010]],       browRot:[0.15,0.15],   browS:[[1,1],[1,1]],          look:[0,0],       blink:[2,4.5],  saccade:0.3, talk:true },
  sin_enlace: { lid:[1,1],       low:[0,0],       brow:[[0,-0.012],[0,-0.012]],     browRot:[0.20,0.20],   browS:[[1.08,0.85],[1.08,0.85]],look:[0,-0.3],   blink:null,     saccade:0, arc:[-1,-1] },
  rcp:        { lid:[0.16,0.16], low:[0.06,0.06], brow:[[0.004,-0.006],[-0.004,-0.006]],browRot:[-0.30,-0.30], browS:[[1.05,0.9],[1.05,0.9]], look:[0,-0.7],  blink:[4,8],    saccade:0.05 },
  saludo:     { lid:[1,1],       low:[0,0],       brow:[[0,0.030],[0,0.030]],       browRot:[0.25,0.25],   browS:[[1,1.05],[1,1.05]],    look:[0,0],       blink:null,     saccade:0, arc:[1,1] },
};
// alias de cara para los pasos de maniobras
Object.assign(FACE_PRESETS, {
  rcp_manos: FACE_PRESETS.rcp,
  rcp_hombros: { ...FACE_PRESETS.hablando, look: [0.4, -0.5] },
  rcp_respira: { ...FACE_PRESETS.atenta, look: [0.5, -0.6], blink: [5, 9] },
  llamar: { ...FACE_PRESETS.hablando, brow: [[0, 0.03], [0, 0.03]], browRot: [0.2, 0.2] },
  senalar: { ...FACE_PRESETS.atenta, look: [0.2, -0.5] },
  tq_colocar: FACE_PRESETS.rcp, tq_girar: FACE_PRESETS.rcp, tq_trabar: FACE_PRESETS.rcp,
  rcp_er_pos: FACE_PRESETS.rcp, rcp_er: FACE_PRESETS.rcp,
  ah_sostener: FACE_PRESETS.rcp, ah_golpes: { ...FACE_PRESETS.rcp, lid: [0.2, 0.2] }, ah_abrazo: FACE_PRESETS.rcp, ah_empuje: { ...FACE_PRESETS.rcp, lid: [0.25, 0.25] }, ah_cuenta: { ...FACE_PRESETS.hablando, look: [0.5, -0.4] },
  tq_jalar: { ...FACE_PRESETS.rcp, lid: [0.25, 0.25], brow: [[0, -0.01], [0, -0.01]] },
});

// Iluminación recomendada (estilo vinil suave): luz principal con sombras, relleno, contorno y sombra en el piso.
export function iluminarEscena(THREE, renderer, scene, { piso = -0.95, sombras = true } = {}) {
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (sombras) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const g = new THREE.Group(); g.name = 'iluminacion';
  const hemi = new THREE.HemisphereLight(0xe9ecff, 0x6b6880, 0.9);
  const key = new THREE.DirectionalLight(0xfff6ee, 2.2); key.position.set(2.2, 3.2, 3.0);
  if (sombras) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 12 }); }
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6); fill.position.set(-3, 1.2, 2);
  const rim = new THREE.DirectionalLight(0xc9d2ff, 1.4); rim.position.set(-1.5, 2.5, -3.5);
  g.add(hemi, key, fill, rim);
  if (sombras) {
    const suelo = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
    suelo.rotation.x = -Math.PI / 2; suelo.position.y = piso; suelo.receiveShadow = true; g.add(suelo);
  }
  scene.add(g);
  scene.traverse(o => { if (o.isMesh && o !== g) { o.castShadow = sombras; o.receiveShadow = sombras; } });
  return g;
}

export async function createMoonC({ THREE, gltf, faceUrl, faceClosedUrl, crossfade = 0.45 }) {
  const T = THREE, root = gltf.scene;
  const faceTex = await new T.TextureLoader().loadAsync(faceUrl);
  faceTex.colorSpace = T.SRGBColorSpace; faceTex.flipY = true; faceTex.anisotropy = 4;
  const faceClosed = await new T.TextureLoader().loadAsync(faceClosedUrl || faceUrl.replace(/\.jpg$/, '_cerrada.png'));
  faceClosed.colorSpace = T.SRGBColorSpace; faceClosed.flipY = true;
  const col = (h) => new T.Color(h);
  const U = {
    uFace: { value: faceTex }, uFaceClosed: { value: faceClosed }, uMin: { value: new T.Vector2(...FACE.min) }, uSize: { value: new T.Vector2(...FACE.size) },
    uEyeC: { value: FACE.eyeC.map(c => new T.Vector2(...c)) }, uEyeR: { value: new T.Vector2(...FACE.eyeR) },
    uEyePl: { value: [new T.Vector3(0.6174, 0.3922, 0.0857), new T.Vector3(0.6099, -0.5805, 0.1228)] }, uClosed: { value: new T.Vector2() },
    uEyeN: { value: [new T.Vector3(-0.525, -0.093, 0.846), new T.Vector3(0.664, 0.006, 0.748)] },
    uBrowC: { value: FACE.browC.map(c => new T.Vector2(...c)) }, uBrowR: { value: new T.Vector2(...FACE.browR) },
    uMouthC: { value: new T.Vector2(...FACE.mouthC) },
    uLid: { value: new T.Vector2() }, uLow: { value: new T.Vector2() },
    uBrowOff: { value: [new T.Vector2(), new T.Vector2()] }, uBrowRot: { value: new T.Vector2() },
    uBrowAx: { value: new T.Vector2(...FACE.browAx) }, uBrowAng: { value: new T.Vector2(...FACE.browAng) },
    uBrowS: { value: [new T.Vector2(1,1), new T.Vector2(1,1)] }, uBrowFur: { value: col(FACE.browFur) }, uBrowCol: { value: col(FACE.browCol) },
    uPadOn: { value: 0 },   // almohadillas ahora son geometría en los brazos
    uPadCol: { value: col('#5e5c6a') }, uPadC: { value: [new T.Vector2(-0.410, -0.552), new T.Vector2(0.370, -0.552)] }, uPadU: { value: [new T.Vector2(-0.47, -0.88), new T.Vector2(0.47, -0.88)] },
    uLook: { value: new T.Vector2() }, uMouth: { value: 0 }, uArc: { value: new T.Vector2(-1,-1) },
    uFur: { value: col(FACE.fur) }, uCheek: { value: col(FACE.cheek) }, uLash: { value: col(FACE.lash) },
    uMouthIn: { value: col(FACE.mouthIn) }, uTongue: { value: col(FACE.tongue) },
  };

  root.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    m.metalness = 0; m.roughness = 1; m.roughnessMap = null; m.metalnessMap = null; m.envMapIntensity = 0.5;
    if (m.normalScale) m.normalScale.set(0.35, 0.35);   // menos ruido de Meshy
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRest; varying vec3 vRestN; varying vec3 vSmoothN; uniform vec2 uEyeC[2], uEyeR; uniform vec3 uEyeN[2]; uniform vec3 uEyePl[2]; uniform vec2 uClosed;')
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
  { vec3 sn = normalize((position - vec3(-0.02, 0.25, 0.10)) / vec3(0.36, 0.36, 0.11));
    for (int i = 0; i < 2; i++) {   // bajo el párpado: misma orientación que la piel alrededor del ojo
      float w = 1.0 - smoothstep(1.0, 1.45, length((position.xy - uEyeC[i]) / (uEyeR * vec2(1.05, 1.08))));
      sn = normalize(mix(sn, uEyeN[i], w * step(0.15, position.z)));
    }
  #ifdef USE_SKINNING
    sn = (skinMatrix * vec4(sn, 0.0)).xyz;
  #endif
    vSmoothN = normalMatrix * sn; }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vRest = position; vRestN = normal;
for (int i = 0; i < 2; i++) {   // ojo cerrado: la cuenca se rellena hasta la piel de alrededor
  vec2 qe = (position.xy - uEyeC[i]) / (uEyeR * vec2(1.05, 1.08));
  float re = length(qe);
  float pz = uEyePl[i].x + uEyePl[i].y * position.x + uEyePl[i].z * position.y;
  float we = uClosed[i] * (1.0 - smoothstep(1.0, 1.25, re)) * step(pz - 0.3, position.z) * step(0.05, position.z);
  transformed.z = mix(transformed.z, pz + 0.012 * max(0.0, 1.0 - re * re), we);
}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vRest; varying vec3 vRestN; varying vec3 vSmoothN;
uniform sampler2D uFace, uFaceClosed; uniform vec2 uMin, uSize, uEyeC[2], uEyeR, uBrowC[2], uBrowR, uMouthC, uLid, uLow, uBrowOff[2], uBrowRot, uLook;
uniform float uMouth; uniform vec2 uArc; uniform vec2 uBrowAx, uBrowAng, uBrowS[2]; uniform vec3 uBrowFur, uBrowCol; uniform vec3 uFur, uCheek, uLash, uMouthIn, uTongue;
float faceFlat = 0.0; float pawFlat = 0.0;
uniform vec3 uPadCol; uniform vec2 uPadC[2], uPadU[2]; uniform float uPadOn;
float blob(vec2 p, vec2 c, vec2 u, vec2 r){ vec2 d = p - c; vec2 l = vec2(dot(d, vec2(u.y, -u.x)), dot(d, u)) / r; float e = length(l); float aa = max(fwidth(e), 0.03); return 1.0 - smoothstep(1.0 - aa, 1.0 + aa, e); }
vec2 rot2(vec2 v, float a){ float c=cos(a), s=sin(a); return vec2(c*v.x-s*v.y, s*v.x+c*v.y); }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.10;')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, pawFlat));\nnormal = normalize(mix(normal, normalize(vSmoothN) * (gl_FrontFacing ? 1.0 : -1.0), faceFlat));')
        .replace('#include <map_fragment>', `#include <map_fragment>
{                                               // almohadillas: mismo diseño y posición en ambas patas (palma, hacia el frente)
  for (int k = 0; k < 2; k++) {
    float sx = (k == 0) ? -1.0 : 1.0;
    float inPaw = step(0.27, vRest.x * sx) * step(-0.70, vRest.y) * step(vRest.y, -0.40) * step(0.12, vRest.z);
    if (inPaw * uPadOn > 0.0) {
      pawFlat = 1.0;
      vec2 pp = vRest.xy, u = normalize(uPadU[k]), n = vec2(u.y, -u.x), cc = uPadC[k];
      float pf = smoothstep(0.25, 0.5, normalize(vRestN).z);   // solo la cara de la palma
      float pad = blob(pp, cc - u * 0.026, u, vec2(0.046, 0.036));            // cojín principal (hacia la muñeca)
      pad = max(pad, blob(pp, cc + u * 0.044 - n * 0.040, u, vec2(0.016, 0.020)));   // deditos (hacia la punta)
      pad = max(pad, blob(pp, cc + u * 0.056,             u, vec2(0.017, 0.021)));
      pad = max(pad, blob(pp, cc + u * 0.044 + n * 0.040, u, vec2(0.016, 0.020)));
      diffuseColor.rgb = mix(diffuseColor.rgb, uPadCol, pad * pf);
    }
  }
}
{
  float front = smoothstep(0.12, 0.22, vRest.z);
  if (front > 0.0) {
    vec2 p = vRest.xy, src = p; float m = 0.0;
    for (int i = 0; i < 2; i++) {               // mirada: mover iris dentro del ojo
      vec2 q = (p - uEyeC[i]) / uEyeR;
      float f = 1.0 - smoothstep(0.55, 0.98, length(q));
      src -= uLook * uEyeR * 0.22 * f;
      m = max(m, f);
    }
    vec3 c = diffuseColor.rgb;
    float nzf = smoothstep(0.55, 0.8, normalize(vRestN).z);
    if (m > 0.0) c = mix(c, texture2D(uFace, (src - uMin) / uSize).rgb, m * front * nzf);
    vec4 cl = texture2D(uFaceClosed, (p - uMin) / uSize);   // cara sin ojos (piel de párpado)
    for (int i = 0; i < 2; i++) {               // párpados
      vec2 q = (p - uEyeC[i]) / (uEyeR * vec2(1.05, 1.08));
      float r = length(q);
      if (r < 2.1) {
        float lid = clamp((uLid[i] - 0.12) / 0.88, 0.0, 1.0);
        float full = smoothstep(0.78, 0.96, lid);
        float zone = cl.a * (1.0 - smoothstep(1.85, 2.1, r));
        c = mix(c, cl.rgb, full * zone * front);             // cerrado: sin pestañas sueltas
        // tonos reales de la piel alrededor de este ojo (arriba = pelaje, abajo = mejilla)
        vec2 R = uEyeR * vec2(1.05, 1.08);
        vec3 furS = texture2D(uFaceClosed, (uEyeC[i] + vec2(0.0, 1.95) * R - uMin) / uSize).rgb;
        vec3 chkS = texture2D(uFaceClosed, (uEyeC[i] + vec2(0.0, -1.7) * R - uMin) / uSize).rgb;
        float hh = sqrt(max(0.0, 1.0 - q.x * q.x));
        float lineY = mix(0.80 * hh, uArc[i] * 0.75 * hh - (uArc[i] > 0.0 ? 0.30 : 0.02), lid);
        vec3 twoTone = mix(furS, chkS, smoothstep(-0.45, -0.95, q.y));
        float solid = full * (1.0 - smoothstep(1.3, 1.75, r));      // zona del ojo: color liso, sin recortes
        c = mix(c, twoTone, solid * front);
        faceFlat = max(faceFlat, solid * front);
        if (r < 1.16) {
          float inside = 1.0 - smoothstep(1.06, 1.16, r);
          float h = sqrt(max(0.0, 1.0 - q.x * q.x));
          float closedE = uArc[i] * 0.75 * h - (uArc[i] > 0.0 ? 0.30 : 0.02);   // +1: ^ alegre · -1: ‿ dormido
          float edge = mix(0.80 * h, closedE, lid);
          float act = step(0.001, lid);
          float cover = smoothstep(edge - 0.03, edge + 0.03, q.y) * act;
          // piel del párpado: gris del pelaje sobre la línea, mejilla (cara sin ojos) debajo
          c = mix(c, twoTone, cover * inside * front);        // parpadeo parcial: mismo tono
          faceFlat = max(faceFlat, cover * inside * front);
          float outer = (i == 0) ? -1.0 : 1.0;              // lado exterior del ojo
          float A = mix(0.80, uArc[i] * 0.75, lid);
          float slope = clamp(A * (-q.x / max(h, 0.3)) * (uEyeR.y / uEyeR.x), -2.0, 2.0);   // grosor parejo a lo largo de la curva
          float dist = abs(q.y - edge) / sqrt(1.0 + slope * slope);
          float taper = smoothstep(1.02, 0.45, abs(q.x));
          float lw = mix(0.11, 0.075, full) * (0.35 + 0.65 * taper);
          float aa = max(fwidth(dist), 0.008);
          float lash = (1.0 - smoothstep(lw - aa, lw + aa, dist)) * act * smoothstep(0.97, 0.88, abs(q.x)) * inside;
          if (full > 0.0) {                       // una pestaña curva en la esquina exterior
            float hx = sqrt(max(0.0, 1.0 - 0.7744));
            vec2 e0 = vec2(outer * 0.88, uArc[i] * 0.75 * hx - (uArc[i] > 0.0 ? 0.30 : 0.02));
            vec2 rel = (q - e0) * vec2(outer, 1.0);
            float up = uArc[i] > 0.0 ? 1.0 : -1.0;
            float t = clamp(rel.x / 0.26, 0.0, 1.0);
            float yc = up * 0.18 * t * t;                 // curva suave hacia afuera
            float dw = abs(rel.y - yc) / sqrt(1.0 + pow(up * 0.36 * t / 0.26, 2.0));
            float w2 = 0.05 * (1.0 - t);
            float fl = (1.0 - smoothstep(w2 - aa, w2 + aa, dw)) * step(0.0, rel.x) * step(rel.x, 0.26);
            lash = max(lash, fl * full);
          }
          c = mix(c, uLash, lash * front);
          float low = uLow[i];                   // párpado inferior (mejilla que sube)
          float e2 = -h * (1.0 - 2.0 * clamp(low, 0.0, 1.0)) - 0.02;
          float cov2 = smoothstep(e2 + 0.04, e2 - 0.04, q.y) * step(0.001, low) * inside * (1.0 - cover) * (1.0 - full);
          c = mix(c, cl.rgb, cov2 * front);
          float l2 = (1.0 - smoothstep(0.03, 0.065, abs(q.y - e2))) * smoothstep(0.02, 0.15, low) * smoothstep(1.0, 0.75, abs(q.x)) * inside * (1.0 - cover) * (1.0 - full);
          c = mix(c, uLash, 0.55 * l2 * front);
        }
      }
    }
    for (int i = 0; i < 2; i++) {               // cejas = manchas blancas: borrar la original y dibujarla movida
      float side = (i == 0) ? 1.0 : -1.0;
      vec2 l0 = rot2(p - uBrowC[i], -uBrowAng[i]) / uBrowAx;
      float orig = 1.0 - smoothstep(1.25, 1.6, length(l0));
      float keep = smoothstep(0.42, 0.25, dot(c, vec3(0.299, 0.587, 0.114)));   // no tocar pestañas negras
      orig *= 1.0 - keep;
      c = mix(c, uBrowFur, orig * front);
      float ang = uBrowAng[i] - uBrowRot[i] * side;           // + = interior arriba
      vec2 l = rot2(p - uBrowC[i] - uBrowOff[i], -ang) / (uBrowAx * uBrowS[i]);
      float e = length(l), aa = max(fwidth(e) * 1.2, 0.04);
      float spot = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, e);
      spot *= 1.0 - keep;
      c = mix(c, uBrowCol, spot * front);
      faceFlat = max(faceFlat, max(orig * (1.0 - smoothstep(0.9, 1.5, length(l0))), spot) * front);
    }
    if (uMouth > 0.01) {                        // boca abierta bajo el ":3"
      vec2 q = (p - uMouthC) / vec2(0.040 + 0.008 * uMouth, 0.050 * uMouth + 0.002);
      float sh = q.y < 0.0 ? length(q) : 2.0;
      float mo = 1.0 - smoothstep(0.92, 1.0, sh);
      vec3 inner = mix(uMouthIn, uTongue, smoothstep(-0.25, -0.85, q.y) * smoothstep(0.9, 0.3, abs(q.x)));
      c = mix(c, inner, mo * front);
      c = mix(c, uLash, (1.0 - smoothstep(0.0, 0.12, abs(sh - 0.96))) * 0.6 * mo * front);
    }
    diffuseColor.rgb = c;
  }
}`);
    };
    m.customProgramCacheKey = () => 'moonc-face-' + (m.map ? 'tex' : 'vc');
    m.needsUpdate = true;
  });

  // ---- animación del cuerpo ----
  const mixer = new T.AnimationMixer(root), acts = {};
  for (const c of gltf.animations) acts[c.name] = mixer.clipAction(c);
  let state = 'tranquila', cur = null;

  // ---- estado facial con suavizado ----
  const F = { browS:[[1,1],[1,1]], arc:[-1,-1], lid:[0,0], low:[0,0], brow:[[0,0],[0,0]], browRot:[0,0], look:[0,0], mouth:0 };
  let target = structuredClone(FACE_PRESETS.tranquila), manual = {};
  let blinkT = 0, nextBlink = 2, blinkDur = 0.16, blinking = -1, doubleBlink = false;
  let lookOff = [0,0], lookTarget = [0,0], nextSacc = 1, mouthExt = null, talking = false, talkPh = 0, syl = 0, sylT = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

  function setState(name) {
    if (!acts[name]) return;
    const a = acts[name]; a.reset().setEffectiveWeight(1).fadeIn(crossfade).play();
    if (cur && cur !== a) cur.fadeOut(crossfade);
    cur = a; state = name; target = structuredClone(FACE_PRESETS[name] || FACE_PRESETS.tranquila);
    talking = !!target.talk; nextBlink = target.blink ? rnd(0.3, 1.5) : 1e9;
  }

  function update(dt) {
    mixer.update(dt);
    const tg = { ...target, ...manual };
    // parpadeo natural: cierre rápido (~70 ms), apertura más lenta, a veces doble
    blinkT += dt;
    if (tg.blink && blinking < 0 && blinkT > nextBlink) { blinking = 0; blinkDur = rnd(0.14, 0.2); doubleBlink = Math.random() < 0.15; }
    let blinkAmt = 0;
    if (blinking >= 0) {
      blinking += dt; const x = blinking / blinkDur;
      blinkAmt = x < 0.4 ? x / 0.4 : Math.max(0, 1 - (x - 0.4) / 0.6);
      if (x >= 1) { blinking = doubleBlink ? -0.0001 : -1; if (doubleBlink) { doubleBlink = false; blinking = 0; blinkDur *= 0.9; } else { blinkT = 0; nextBlink = rnd(...(tg.blink || [3,6])); } }
    }
    // micro-movimientos de mirada (sacádicos)
    nextSacc -= dt;
    if (nextSacc <= 0 && tg.saccade > 0) {
      lookTarget = [rnd(-1,1) * tg.saccade, rnd(-0.6,0.6) * tg.saccade];
      nextSacc = tg.saccadeFast ? rnd(0.25, 0.8) : rnd(0.8, 2.6);
    }
    for (let i = 0; i < 2; i++) lookOff[i] = damp(lookOff[i], lookTarget[i], 25, dt);
    // boca al hablar: sílabas irregulares 3-6 por segundo, o volumen externo
    let mTarget = 0;
    if (mouthExt !== null) mTarget = mouthExt;
    else if (talking) {
      sylT -= dt;
      if (sylT <= 0) { syl = Math.random() < 0.18 ? 0 : rnd(0.35, 1); sylT = rnd(0.11, 0.26); }
      mTarget = syl;
    }
    F.mouth = damp(F.mouth, mTarget, 18, dt);
    const emph = talking ? F.mouth * 0.008 : 0;  // las cejas acompañan el énfasis
    for (let i = 0; i < 2; i++) {
      const lidT = Math.max(tg.lid[i], 0) + (1 - Math.max(tg.lid[i], 0)) * blinkAmt;
      F.lid[i] = blinking >= 0 ? lidT : damp(F.lid[i], tg.lid[i], 8, dt);
      F.low[i] = damp(F.low[i], tg.low[i], 6, dt);
      F.brow[i][0] = damp(F.brow[i][0], tg.brow[i][0], 7, dt);
      F.brow[i][1] = damp(F.brow[i][1], tg.brow[i][1] + emph, 7, dt);
      F.browRot[i] = damp(F.browRot[i], tg.browRot[i], 7, dt);
      const bs = (tg.browS || [[1,1],[1,1]])[i];
      F.browS[i][0] = damp(F.browS[i][0], bs[0], 7, dt); F.browS[i][1] = damp(F.browS[i][1], bs[1] + emph * 6, 7, dt);
      U.uBrowS.value[i].set(F.browS[i][0], F.browS[i][1]);
      F.look[i] = damp(F.look[i], tg.look[i] + lookOff[i], 12, dt);
    }
    U.uLid.value.set(F.lid[0], F.lid[1]);
    const cls = v => { const l = Math.min(1, Math.max(0, (v - 0.12) / 0.88)); const t = Math.min(1, Math.max(0, (l - 0.6) / 0.36)); return t * t * (3 - 2 * t); };
    U.uClosed.value.set(cls(F.lid[0]), cls(F.lid[1])); U.uLow.value.set(F.low[0], F.low[1]);
    U.uBrowOff.value[0].set(...F.brow[0]); U.uBrowOff.value[1].set(...F.brow[1]);
    U.uBrowRot.value.set(F.browRot[0], F.browRot[1]); U.uLook.value.set(F.look[0], F.look[1]);
    U.uMouth.value = F.mouth;
    for (let i = 0; i < 2; i++) F.arc[i] = damp(F.arc[i], (tg.arc || [-1,-1])[i], 10, dt);
    U.uArc.value.set(F.arc[0], F.arc[1]);
  }

  setState('tranquila');
  return {
    root, mixer, states: Object.keys(acts), get state() { return state; },
    setState, update,
    action(name) { return acts[name] || null; },
    talk(on) { talking = !!on; },
    setMouth(v) { mouthExt = v == null ? null : Math.max(0, Math.min(1, v)); },
    express(p) { manual = p || {}; },
    blink() { blinkT = nextBlink + 1; },
    uniforms: U,
  };
}
