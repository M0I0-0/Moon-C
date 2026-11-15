// Moon-C · reproductor de voz para el navegador, con la boca sincronizada.
// Reproduce audio de la API (POST /tts) o un archivo pregenerado, y mueve la boca de Moon-C con el volumen real.
//
//   import { crearVozMoonC } from './moonc-voz.js';
//   const voz = crearVozMoonC({ moon, api: 'http://127.0.0.1:8765' });
//   await voz.decir('Atención: tu pulso está alto.');        // vía API
//   await voz.reproducir('./audio/alerta_pulso.mp3');         // pregenerado, sin servidor
//   voz.detener();
//
// `moon` es lo que devuelve createMoonC()/montarMoonC(): usa moon.talk(bool) y moon.setMouth(0..1).

export function crearVozMoonC({ moon = null, api = null, ganancia = 6, suavizado = 0.35, cache = 32 } = {}) {
  let ctx = null, fuente = null, raf = 0, nivel = 0;
  const memo = new Map();   // texto+ajustes → AudioBuffer (evita sintetizar dos veces la misma frase)

  function contexto() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  async function bufferDesde(resp) {
    if (!resp.ok) throw new Error(`Voz Moon-C: HTTP ${resp.status} ${await resp.text().catch(() => '')}`);
    return contexto().decodeAudioData(await resp.arrayBuffer());
  }

  function boca(analizador) {
    const datos = new Float32Array(analizador.fftSize);
    const paso = () => {
      analizador.getFloatTimeDomainData(datos);
      let s = 0; for (let i = 0; i < datos.length; i++) s += datos[i] * datos[i];
      const rms = Math.sqrt(s / datos.length);
      nivel += (Math.min(1, rms * ganancia) - nivel) * (1 - suavizado);
      moon?.setMouth?.(nivel < 0.04 ? 0 : nivel);
      raf = requestAnimationFrame(paso);
    };
    paso();
  }

  function tocar(buffer) {
    detener();
    const c = contexto();
    const an = c.createAnalyser(); an.fftSize = 1024;
    fuente = c.createBufferSource(); fuente.buffer = buffer;
    fuente.connect(an).connect(c.destination);
    moon?.talk?.(true); boca(an);
    return new Promise((ok) => {
      const yo = fuente;
      yo.onended = () => { if (fuente === yo) terminar(); ok(); };
      yo.start();
    });
  }

  function terminar() {
    cancelAnimationFrame(raf); raf = 0; nivel = 0; fuente = null;
    moon?.setMouth?.(null); moon?.talk?.(false);
  }

  function detener() {
    if (fuente) { try { fuente.onended = null; fuente.stop(); } catch {} }
    terminar();
  }

  return {
    /** Sintetiza en la API local y reproduce. `ajustes` opcional (mismo formato que config.json). */
    async decir(texto, ajustes = null) {
      if (!api) throw new Error('Voz Moon-C: falta la opción `api`');
      const k = JSON.stringify([texto, ajustes]);
      let buf = memo.get(k);
      if (!buf) {
        buf = await bufferDesde(await fetch(`${api.replace(/\/$/, '')}/tts`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ajustes ? { texto, ajustes } : { texto }),
        }));
        memo.set(k, buf); if (memo.size > cache) memo.delete(memo.keys().next().value);
      }
      return tocar(buf);
    },
    /** Reproduce un WAV/MP3 pregenerado (generar_frases.py). */
    async reproducir(url) {
      let buf = memo.get(url);
      if (!buf) { buf = await bufferDesde(await fetch(url)); memo.set(url, buf); }
      return tocar(buf);
    },
    detener,
    get hablando() { return !!fuente; },
  };
}
