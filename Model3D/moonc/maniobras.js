// Moon-C · maniobras de emergencia guiadas paso a paso, adaptadas al entorno.
//
//   import { crearManiobra, MANIOBRAS, ENTORNOS, FUENTES } from './maniobras.js';
//   const m = await crearManiobra('rcp' | 'torniquete' | 'atragantamiento', {
//       THREE, scene, moon, base: './moonc/', entorno: 'iss',   // iss | transito | luna | marte | tierra
//       onPaso: (i, paso, pasos) => {}, onConteo: (n, total) => {}, onTiempo: (seg) => {} });
//   m.iniciar();                 // desde un clic (el metrónomo necesita interacción del usuario)
//   m.siguiente(); m.anterior(); m.ir('dea'); m.soloManos = true; m.entorno = 'luna';
//   paso.imagen (si existe): ilustración de apoyo, relativa a `base` (p. ej. el método de pino en microgravedad)
//   m.paqueteTierra()            // resumen con tiempos para enviar a Tierra / al registro de la app
//   en el loop: moon.update(dt); m.update(dt);   ·   m.ocultar() al salir
//   idioma: 'es' (por defecto) | 'en' al crearla; m.idioma = 'en' cambia los textos sin reiniciar (vuelve a llamar onPaso)
//
// Cada paso define: qué hace Moon-C (clip), la ayuda visual (efecto), el texto exacto por entorno,
// la fuente y el estado: 'validado' (tomado de la fuente citada) | 'supuesto' (verificar antes de uso real).
// Un paso con `solo: [...]` aparece únicamente en esos tipos de gravedad: 'microg' | 'parcial' | 'tierra'.
// Moon-C apoya la decisión; no sustituye el criterio médico ni el entrenamiento.

export const ENTORNOS = {
  iss:      { nombre: 'Estación espacial (órbita baja)', g: 'microg',  gravedad: 0,    retraso: 'casi nulo', evacuacion: 'horas a un día (nave acoplada)' },
  transito: { nombre: 'Tránsito a Marte',                g: 'microg',  gravedad: 0,    retraso: 'hasta 20 min por trayecto', evacuacion: 'no disponible' },
  luna:     { nombre: 'Base lunar',                      g: 'parcial', gravedad: 0.17, retraso: 'unos 1.3 s', evacuacion: 'unos 3 días' },
  marte:    { nombre: 'Superficie de Marte',             g: 'parcial', gravedad: 0.38, retraso: 'hasta 20 min por trayecto', evacuacion: 'no disponible' },
  tierra:   { nombre: 'Tierra (comunidad remota)',       g: 'tierra',  gravedad: 1,    retraso: 'llamada telefónica', evacuacion: 'según servicio local' },
};

export const FUENTES = {
  aha: 'AHA 2025 · Heartsaver CPR AED, componentes de RCP de calidad (resumen VUMC)',
  microg: 'Hinkelbein, Kerkhoff et al. · Guía de RCP en microgravedad DGLRM/ESAM, Scand J Trauma Resusc Emerg Med 2020;28:108',
  hipog: 'Overbeek et al. · RCP en hipogravedad, revisión sistemática, Life 2022;12:1958',
  dea: 'Guía DGLRM/ESAM 2020 + práctica estándar de DEA (verificar con el manual del equipo a bordo)',
  cruzroja: 'Cruz Roja Americana · How to Apply a Tourniquet',
  hemo: 'Thoolen y Kuypers · Control de hemorragia externa en exploración espacial, Wilderness Environ Med 2023',
  mayo: 'Mayo Clinic · Choking: First aid (ago. 2025)',
  aha_ah: 'AHA 2025 · alternar 5 golpes en la espalda y 5 compresiones abdominales (Contemporary Pediatrics, nov. 2025)',
  campo: 'Práctica de campo / adaptación propia (no está en la fuente; verificar con el protocolo de a bordo)',
};

// ---------------------------------------------------------------------------------------------
// English. Same keys as ENTORNOS, FUENTES and MANIOBRAS (step ids, and the same `textos` keys as the
// Spanish step). Anything missing falls back to Spanish. Same sources and states as the Spanish text.
export const IDIOMAS = ['es', 'en'];

const reporteEn = (maniobra) => ({
  titulo: 'Report to Earth',
  textos: {
    iss: `Moon-C sent the ${maniobra} summary (times and counts) to the flight surgeons. Their answer arrives almost in real time: follow their instructions and the decision to evacuate.`,
    transito: `Moon-C sent the ${maniobra} summary. With up to 20 minutes of delay each way, don't wait for an answer to keep going: continue with the protocol.`,
    luna: `Moon-C sent the ${maniobra} summary to Earth (about 1.3 s of delay). Follow the flight surgeons' instructions.`,
    marte: `Moon-C sent the ${maniobra} summary. The answer will take up to 20 minutes each way: the crew decides and continues.`,
    tierra: `Call the emergency number or the nearest health center and read the ${maniobra} summary that Moon-C prepared.`,
  },
});

export const EN = {
  entornos: {
    iss:      { nombre: 'Space station (low Earth orbit)', retraso: 'almost none', evacuacion: 'hours to a day (docked spacecraft)' },
    transito: { nombre: 'Transit to Mars',                 retraso: 'up to 20 min each way', evacuacion: 'not available' },
    luna:     { nombre: 'Lunar base',                      retraso: 'about 1.3 s', evacuacion: 'about 3 days' },
    marte:    { nombre: 'Surface of Mars',                 retraso: 'up to 20 min each way', evacuacion: 'not available' },
    tierra:   { nombre: 'Earth (remote community)',        retraso: 'phone call', evacuacion: 'depends on local services' },
  },
  fuentes: {
    aha: 'AHA 2025 · Heartsaver CPR AED, components of high-quality CPR (VUMC summary)',
    microg: 'Hinkelbein, Kerkhoff et al. · DGLRM/ESAM guideline for CPR in microgravity, Scand J Trauma Resusc Emerg Med 2020;28:108',
    hipog: 'Overbeek et al. · CPR in hypogravity, systematic review, Life 2022;12:1958',
    dea: 'DGLRM/ESAM 2020 guideline + standard AED practice (check with the on-board device manual)',
    cruzroja: 'American Red Cross · How to Apply a Tourniquet',
    hemo: 'Thoolen and Kuypers · External hemorrhage control in space exploration, Wilderness Environ Med 2023',
    mayo: 'Mayo Clinic · Choking: First aid (Aug. 2025)',
    aha_ah: 'AHA 2025 · alternate 5 back blows and 5 abdominal thrusts (Contemporary Pediatrics, Nov. 2025)',
    campo: 'Field practice / own adaptation (not in the source; check with the on-board protocol)',
  },
  registro: { paso: 'Step: ', inicio: 'Start · ', entorno: 'Environment: ', torniquete: 'Tourniquet applied ' },
  aviso: 'Generated by Moon-C. Decision support; it does not replace medical judgment.',
  maniobras: {
    rcp: {
      titulo: 'CPR (cardiac arrest)',
      atajos: { cmrs: 'The stretcher (CMRS) arrived', dea: 'The AED arrived' },
      pasos: {
        seguro: { titulo: 'Secure the scene',
          textos: {
            microg: "Stop any nearby activity and anchor your feet. Don't wait for the stretcher to start: initial CPR is done where your crewmate is.",
            parcial: 'Lay them face up on a firm surface (the stretcher or the floor). Kneel beside them.',
            tierra: 'Make sure the area is safe. Lay them face up on a firm surface and kneel beside them.' } },
        responde: { titulo: 'Do they respond?',
          texto: 'Tap their shoulder firmly twice and ask out loud: "Are you OK?".' },
        ayuda: { titulo: 'Call for help',
          textos: {
            microg: 'If they don\'t respond, shout to the crew: "Cardiac arrest, bring the CMRS stretcher and the AED!". Activate the alert to Earth.',
            parcial: 'If they don\'t respond, shout to the crew: "Cardiac arrest, bring the AED!". Activate the alert to Earth.',
            tierra: "If they don't respond, ask someone to call emergency services and bring an AED if there is one nearby." } },
        respira: { titulo: 'Check breathing',
          texto: "Look at their chest for 5 to 10 seconds. If they aren't breathing or are only gasping, start CPR now." },
        er_pos: { titulo: 'Evetts-Russomano position',
          texto: "Get above their head: pass your legs over their shoulders and cross your feet behind their back so you don't drift apart when you push. Palms down on the lower half of the breastbone, one hand on top of the other." },
        manos: { titulo: 'Place your hands',
          texto: 'Palms down: heel of one hand in the center of the chest, on the lower half of the breastbone (the mark). The other hand on top. Arms straight and shoulders right above your hands.' },
        comprime: { titulo: 'Compress 30 times',
          textos: {
            microg: "Push hard and fast: at least 5 cm, 100 to 120 per minute (follow the tick). Let the chest come all the way back up. If you can't reach the depth, switch to the reverse bear hug.",
            parcial: 'Push harder than usual: with less gravity your weight helps less and the depth drops. At least 5 cm, 100 to 120 per minute (follow the tick). Let the chest come all the way back up.',
            tierra: 'Push hard and fast: at least 5 cm deep, 100 to 120 per minute (follow the tick). Let the chest come all the way back up between compressions.' } },
        ventila: { titulo: '2 rescue breaths',
          textos: {
            microg: 'Only if there are 2 rescuers and the patient is restrained: tilt their head back, lift the chin and give 2 breaths of 1 second each. If you are alone, keep going with compressions only.',
            parcial: 'If you are trained: tilt their head back, lift the chin and give 2 breaths of 1 second each; watch the chest rise. Take no more than 10 seconds.',
            tierra: 'If you are trained: tilt their head back, lift the chin and give 2 breaths of 1 second each; watch the chest rise. Take no more than 10 seconds. If not, keep going with compressions only.' } },
        cmrs: { titulo: 'Move to the CMRS stretcher',
          imagenAlt: 'Handstand method: rescuer upside down, hands on the breastbone, feet against the ceiling',
          texto: 'As soon as the CMRS arrives, strap your crewmate in (chest and hips) and secure yourself. If there is room, use the handstand method (feet against the ceiling); if not, stay restrained standing at one side or straddling them. Keep compressing.' },
        rota: { titulo: 'Switch rescuers',
          textos: {
            microg: 'About 2 minutes have passed: switch rescuers without stopping for more than 10 seconds. Pushing without gravity tires you quickly.',
            parcial: 'About 2 minutes have passed: switch rescuers without stopping for more than 10 seconds. With less gravity you will tire faster and the depth drops.',
            tierra: 'If someone else is there, switch every 2 minutes without stopping for more than 10 seconds.' } },
        dea: { titulo: 'Use the AED',
          textos: {
            microg: 'Use the AED only with the patient strapped to the CMRS (insulated surface). Turn it on and follow its voice: one pad below the right collarbone, the other on the left side below the armpit. Nobody touches the patient during the analysis or the shock.',
            parcial: 'Turn on the AED and follow its voice: one pad below the right collarbone, the other on the left side below the armpit. Nobody touches the patient during the analysis or the shock.',
            tierra: 'Turn on the AED and follow its voice: one pad below the right collarbone, the other on the left side below the armpit. Nobody touches the patient during the analysis or the shock.' } },
        reporte: reporteEn('CPR'),
      },
    },
    torniquete: {
      titulo: 'Tourniquet (severe bleeding from an arm or leg)',
      atajos: { vigila: 'Still bleeding' },
      pasos: {
        herida: { titulo: 'Find the wound',
          textos: {
            microg: "Put on gloves if you have them (without delaying help) and protect your eyes. In microgravity blood doesn't fall: it forms floating spheres. Contain them with gauze and find where it comes from; treat the wound that bleeds the most first.",
            parcial: 'Put on gloves if you have them (without delaying help). Find where the blood comes from; if there are several wounds, treat the one that bleeds the most first.',
            tierra: 'Put on gloves if you have them (without delaying help). Find where the blood comes from; if there are several wounds, treat the one that bleeds the most first.' } },
        colocar: { titulo: 'Place the tourniquet',
          texto: 'Slide the tourniquet onto the arm and move it 5 to 7 cm above the wound, between the wound and the heart (the green area). Never over the wound or over the elbow or another joint.' },
        avisa: { titulo: 'Warn that it will hurt',
          texto: 'Tell your crewmate: "This is going to hurt, but it\'s needed to stop the bleeding".' },
        jalar: { titulo: 'PULL the strap',
          texto: 'Pull the free end of the strap (red tip) until it is as tight as possible and stick it back onto itself.' },
        girar: { titulo: 'TWIST the rod',
          texto: "Twist the rod to finish tightening. Keep twisting until the bleeding stops or it won't turn any further. Don't stop even if your crewmate complains of pain." },
        trabar: { titulo: 'LOCK the rod',
          texto: "Put the rod in the clip so it doesn't unwind." },
        hora: { titulo: 'Write down the time',
          texto: 'Write the time on the tourniquet label. Moon-C saves it in the log and includes it in the report.' },
        vigila: { titulo: "Don't loosen it",
          textos: {
            microg: "If it keeps bleeding, place a second tourniquet above the first one. Don't loosen or remove it. If the evacuation will take long (transit to Mars), the flight surgeon will decide whether to replace it with another method to control the bleeding.",
            parcial: "If it keeps bleeding, place a second tourniquet above the first one. Don't loosen or remove it. If the evacuation will take days, the flight surgeon will decide whether to replace it with another method to control the bleeding.",
            tierra: "If it keeps bleeding, place a second tourniquet above the first one, closer to the heart. Don't loosen or remove the tourniquet: only medical staff do that." } },
        reporte: reporteEn('tourniquet'),
      },
    },
    atragantamiento: {
      titulo: 'Choking (conscious adult)',
      atajos: { inconsciente: 'They lost consciousness' },
      pasos: {
        pregunta: { titulo: 'Are they choking?',
          texto: 'Ask: "Are you choking?". If they can cough forcefully, let them keep coughing. If they can\'t speak, cough or breathe (hands at the throat, bluish or gray lips), act now.' },
        ayuda: { titulo: 'Call for help',
          textos: {
            microg: 'Ask another crew member to alert Earth while you act. If you are alone, give the back blows and thrusts first.',
            parcial: 'Ask another crew member to alert Earth while you act. If you are alone, give the back blows and thrusts first.',
            tierra: 'Ask someone to call emergency services while you act. If you are alone, give the back blows and thrusts first.' } },
        ancla: { titulo: 'Anchor yourself',
          texto: 'Anchor your feet to the restraints and keep your crewmate close to you; without gravity, every blow or thrust pushes you apart.' },
        pos_golpes: { titulo: 'Support and lean them forward',
          texto: 'Stand to one side and slightly behind. Put one arm across their chest for support and bend them forward at the waist.' },
        golpes: { titulo: '5 back blows',
          texto: 'Give 5 separate blows with the heel of your hand between the shoulder blades (the mark). Firm blows, one at a time.' },
        pos_empuje: { titulo: 'Wrap your arms around their waist',
          imagenAlt: 'Abdominal thrusts: rescuer behind, fist just above the navel, push in and up',
          textos: {
            microg: "Get behind them and wrap your arms around their waist. Make a fist and place the thumb side just above the navel (the mark). Grasp the fist with your other hand. If you can't reach around them, use chest thrusts.",
            parcial: "Stand behind them with one foot slightly forward. Wrap your arms around their waist. Make a fist and place the thumb side just above the navel (the mark). Grasp the fist with your other hand. If you can't reach around them, use chest thrusts.",
            tierra: "Stand behind them with one foot slightly forward. Wrap your arms around their waist. Make a fist and place the thumb side just above the navel (the mark). Grasp the fist with your other hand. If the person is pregnant or you can't reach around them, use chest thrusts." } },
        empuje: { titulo: '5 abdominal thrusts',
          imagenAlt: 'Abdominal thrusts: rescuer behind, fist just above the navel, push in and up',
          texto: 'Give 5 quick thrusts in and up (follow the arrow), as if you were trying to lift them. Moon-C counts the rhythm.' },
        alterna: { titulo: 'Check and repeat',
          texto: 'Check whether the object came out. If not, repeat: 5 back blows and 5 abdominal thrusts, until it comes out or they lose consciousness.' },
        inconsciente: { titulo: 'If they lose consciousness',
          textos: {
            microg: 'Strap them face up to the stretcher. Look in their mouth and remove the object only if you can see it; never sweep blindly with your finger. Start CPR.',
            parcial: 'Lay them face up. Look in their mouth and remove the object only if you can see it; never sweep blindly with your finger. Start CPR.',
            tierra: 'Lay them face up on the floor. Look in their mouth and remove the object only if you can see it; never sweep blindly with your finger. Start CPR.' } },
        reporte: reporteEn('choking'),
      },
    },
  },
};

const enIdioma = (idioma) => idioma === 'en';
const REGISTRO_ES = { paso: 'Paso: ', inicio: 'Inicio · ', entorno: 'Entorno: ', torniquete: 'Torniquete colocado ' };
const registroDe = (idioma) => (enIdioma(idioma) ? EN.registro : REGISTRO_ES);

/** Título de una maniobra en el idioma pedido. */
export function tituloManiobra(id, idioma = 'es') {
  return (enIdioma(idioma) && EN.maniobras[id]?.titulo) || MANIOBRAS[id]?.titulo || id;
}

/** Datos de un entorno (nombre, retraso, evacuación) en el idioma pedido. */
export function datosEntorno(key, idioma = 'es') {
  const e = ENTORNOS[key];
  return e && enIdioma(idioma) && EN.entornos[key] ? { ...e, ...EN.entornos[key] } : e;
}

/** Fuente citada en el idioma pedido. */
export function textoFuente(key, idioma = 'es') {
  return (enIdioma(idioma) && EN.fuentes[key]) || FUENTES[key] || key;
}

const reporte = (maniobra) => ({
  id: 'reporte', titulo: 'Reporta a Tierra', clip: 'hablando', efecto: 'reporte', modo: 'espera',
  textos: {
    iss: `Moon-C envió el resumen de ${maniobra} (horas y conteos) a los médicos de vuelo. La respuesta llega casi en tiempo real: sigue sus indicaciones y la decisión de evacuar.`,
    transito: `Moon-C envió el resumen de ${maniobra}. Con hasta 20 minutos de retraso por trayecto, no esperes respuesta para seguir: continúa con el protocolo.`,
    luna: `Moon-C envió el resumen de ${maniobra} a Tierra (unos 1.3 s de retraso). Sigue las indicaciones de los médicos de vuelo.`,
    marte: `Moon-C envió el resumen de ${maniobra}. La respuesta tardará hasta 20 minutos por trayecto: la tripulación decide y continúa.`,
    tierra: `Llama al número de emergencias o al centro de salud más cercano y lee el resumen de ${maniobra} que preparó Moon-C.`,
  },
  fuente: 'campo', estado: 'supuesto',
});

export const MANIOBRAS = {
  rcp: {
    titulo: 'RCP (paro cardiaco)', maniqui: 'maniqui_rcp.glb', frecuencia: 110, compresiones: 30,
    atajos: [{ texto: 'Llegó la camilla (CMRS)', paso: 'cmrs', solo: ['microg'] }, { texto: 'Llegó el DEA', paso: 'dea' }],
    rotacion: { cada: 120, paso: 'rota', tras: 'ventila' },     // cambiar de rescatista cada ~2 min
    pasos: [
      { id: 'seguro', titulo: 'Asegura la escena', clip: 'senalar', efecto: 'correas', modo: 'espera',
        textos: {
          microg: 'Detén cualquier actividad cercana y ancla tus pies. No esperes la camilla para empezar: la RCP inicial se hace donde está tu compañero.',
          parcial: 'Acuéstalo boca arriba sobre una superficie firme (la camilla o el piso). Arrodíllate a su lado.',
          tierra: 'Revisa que el lugar sea seguro. Acuéstalo boca arriba sobre una superficie firme y arrodíllate a su lado.' },
        fuente: 'microg', estado: 'validado' },
      { id: 'responde', titulo: '¿Responde?', clip: 'rcp_hombros', modo: 'espera',
        texto: 'Toca su hombro con firmeza dos veces y pregunta en voz alta: "¿Estás bien?".', fuente: 'aha', estado: 'validado' },
      { id: 'ayuda', titulo: 'Pide ayuda', clip: 'llamar', modo: 'espera',
        textos: {
          microg: 'Si no responde, grita a la tripulación: "¡Paro, traigan la camilla CMRS y el DEA!". Activa el aviso a Tierra.',
          parcial: 'Si no responde, grita a la tripulación: "¡Paro, traigan el DEA!". Activa el aviso a Tierra.',
          tierra: 'Si no responde, pide a alguien que llame a emergencias y traiga un DEA si hay uno cerca.' },
        fuente: 'aha', estado: 'validado' },
      { id: 'respira', titulo: 'Revisa la respiración', clip: 'rcp_respira', modo: 'tiempo', segundos: 10,
        texto: 'Mira su pecho entre 5 y 10 segundos. Si no respira o solo boquea, empieza la RCP ya.', fuente: 'aha', estado: 'validado' },
      { id: 'er_pos', titulo: 'Posición Evetts-Russomano', clip: 'rcp_er_pos', efecto: 'marca', pose: 'er', solo: ['microg'], modo: 'espera',
        texto: 'Colócate sobre su cabeza: pasa tus piernas por encima de sus hombros y cruza los pies detrás de su espalda para no separarte al empujar. Palmas hacia abajo sobre la mitad inferior del esternón, una mano sobre otra.',
        fuente: 'microg', estado: 'validado' },
      { id: 'manos', titulo: 'Coloca las manos', clip: 'rcp_manos', efecto: 'marca', solo: ['parcial', 'tierra'], modo: 'espera',
        texto: 'Palmas hacia abajo: talón de una mano en el centro del pecho, sobre la mitad inferior del esternón (la marca). La otra mano encima. Brazos rectos y hombros justo sobre tus manos.', fuente: 'aha', estado: 'validado' },
      { id: 'comprime', titulo: 'Comprime 30 veces', clip: (c) => c.er ? 'rcp_er' : 'rcp', pose: 'er?', efecto: 'compresion', modo: 'conteo',
        textos: {
          microg: 'Empuja fuerte y rápido: al menos 5 cm, de 100 a 120 por minuto (sigue el tic). Deja que el pecho regrese por completo. Si no logras la profundidad, cambia al abrazo de oso invertido.',
          parcial: 'Empuja más fuerte de lo normal: con menos gravedad tu peso ayuda menos y la profundidad baja. Al menos 5 cm, de 100 a 120 por minuto (sigue el tic). Deja que el pecho regrese por completo.',
          tierra: 'Empuja fuerte y rápido: al menos 5 cm de profundidad, de 100 a 120 por minuto (sigue el tic). Deja que el pecho regrese por completo entre cada compresión.' },
        fuentePor: { microg: 'microg', parcial: 'hipog', tierra: 'aha' }, estado: 'validado' },
      { id: 'ventila', titulo: '2 ventilaciones', clip: 'rcp_respira', efecto: 'ventila', pose: 'er?', modo: 'tiempo', segundos: 5,
        textos: {
          microg: 'Solo si hay 2 rescatistas y el paciente está sujeto: inclina su cabeza, levanta la barbilla y da 2 ventilaciones de 1 segundo. Si estás solo, sigue solo con compresiones.',
          parcial: 'Si estás entrenado: inclina su cabeza, levanta la barbilla y da 2 ventilaciones de 1 segundo; mira que el pecho suba. No tardes más de 10 segundos.',
          tierra: 'Si estás entrenado: inclina su cabeza, levanta la barbilla y da 2 ventilaciones de 1 segundo; mira que el pecho suba. No tardes más de 10 segundos. Si no, sigue solo con compresiones.' },
        fuentePor: { microg: 'microg', parcial: 'aha', tierra: 'aha' }, estado: 'validado' },
      { id: 'cmrs', titulo: 'Pasa a la camilla CMRS', clip: 'senalar', efecto: 'correas', solo: ['microg'], modo: 'espera',
        imagen: 'metodo_pino.jpg', imagenAlt: 'Método de pino: rescatista de cabeza, manos en el esternón, pies contra el techo',
        texto: 'En cuanto llegue la CMRS, sujeta a tu compañero con las correas (pecho y cadera) y sujétate tú. Si el espacio lo permite, usa el método de pino (pies contra el techo); si no, sujeto de pie a un lado o a horcajadas. Sigue comprimiendo.',
        fuente: 'microg', estado: 'validado' },
      { id: 'rota', titulo: 'Cambia de rescatista', clip: 'llamar', modo: 'espera',
        textos: {
          microg: 'Pasaron unos 2 minutos: cambia de rescatista sin parar más de 10 segundos. Empujar sin gravedad cansa rápido.',
          parcial: 'Pasaron unos 2 minutos: cambia de rescatista sin parar más de 10 segundos. Con menos gravedad te cansarás más rápido y la profundidad baja.',
          tierra: 'Si hay otra persona, cambien cada 2 minutos sin parar más de 10 segundos.' },
        fuentePor: { microg: 'campo', parcial: 'hipog', tierra: 'campo' }, estado: 'supuesto' },
      { id: 'dea', titulo: 'Usa el DEA', clip: 'senalar', efecto: 'dea', modo: 'espera',
        textos: {
          microg: 'Usa el DEA solo con el paciente sujeto a la CMRS (superficie aislada). Enciéndelo y sigue su voz: un parche bajo la clavícula derecha, otro en el costado izquierdo bajo la axila. Nadie lo toca durante el análisis o la descarga.',
          parcial: 'Enciende el DEA y sigue su voz: un parche bajo la clavícula derecha, otro en el costado izquierdo bajo la axila. Nadie lo toca durante el análisis o la descarga.',
          tierra: 'Enciende el DEA y sigue su voz: un parche bajo la clavícula derecha, otro en el costado izquierdo bajo la axila. Nadie lo toca durante el análisis o la descarga.' },
        fuente: 'dea', estado: 'supuesto' },
      reporte('la RCP'),
    ],
    ciclo: { comprime: 'ventila', ventila: 'comprime', cmrs: 'comprime', rota: 'comprime', dea: 'comprime', reporte: 'reporte' },
    montar: montarRCP,
  },
  torniquete: {
    titulo: 'Torniquete (sangrado grave en brazo o pierna)', maniqui: 'maniqui_brazo.glb',
    atajos: [{ texto: 'Sigue sangrando', paso: 'vigila' }],
    pasos: [
      { id: 'herida', titulo: 'Ubica la herida', clip: 'senalar', modo: 'espera',
        textos: {
          microg: 'Ponte guantes si los tienes (sin retrasar la ayuda) y protégete los ojos. En microgravedad la sangre no cae: forma esferas que flotan. Contenlas con gasas y encuentra de dónde sale; atiende primero la herida que sangra más.',
          parcial: 'Ponte guantes si los tienes (sin retrasar la ayuda). Encuentra de dónde sale la sangre; si hay varias heridas, atiende primero la que sangra más.',
          tierra: 'Ponte guantes si los tienes (sin retrasar la ayuda). Encuentra de dónde sale la sangre; si hay varias heridas, atiende primero la que sangra más.' },
        fuentePor: { microg: 'campo', parcial: 'cruzroja', tierra: 'cruzroja' }, estadoPor: { microg: 'supuesto' }, estado: 'validado' },
      { id: 'colocar', titulo: 'Coloca el torniquete', clip: 'tq_colocar', modo: 'espera',
        texto: 'Pasa el torniquete por el brazo y deslízalo de 5 a 7 cm por encima de la herida, entre la herida y el corazón (la zona verde). Nunca sobre la herida ni sobre el codo u otra articulación.', fuente: 'cruzroja', estado: 'validado' },
      { id: 'avisa', titulo: 'Avisa que dolerá', clip: 'hablando', modo: 'espera',
        texto: 'Dile a tu compañero: "Va a doler, pero es necesario para parar el sangrado".', fuente: 'cruzroja', estado: 'validado' },
      { id: 'jalar', titulo: 'JALA la correa', clip: 'tq_jalar', modo: 'espera',
        texto: 'Jala el extremo libre de la correa (punta roja) hasta que quede lo más apretado posible y pégala sobre sí misma.', fuente: 'cruzroja', estado: 'validado' },
      { id: 'girar', titulo: 'GIRA la varilla', clip: 'tq_girar', modo: 'espera',
        texto: 'Gira la varilla para terminar de apretar. Sigue girando hasta que el sangrado se detenga o ya no gire más. No te detengas aunque tu compañero se queje de dolor.', fuente: 'cruzroja', estado: 'validado' },
      { id: 'trabar', titulo: 'TRABA la varilla', clip: 'tq_trabar', modo: 'espera',
        texto: 'Mete la varilla en el clip para que no se desenrolle.', fuente: 'cruzroja', estado: 'validado' },
      { id: 'hora', titulo: 'Anota la hora', clip: 'senalar', modo: 'espera',
        texto: 'Escribe la hora en la etiqueta del torniquete. Moon-C la guarda en el registro y la incluye en el reporte.', fuente: 'campo', estado: 'supuesto' },
      { id: 'vigila', titulo: 'No lo aflojes', clip: 'atenta', modo: 'espera',
        textos: {
          microg: 'Si sigue sangrando, coloca un segundo torniquete por encima del primero. No lo aflojes ni lo quites. Si la evacuación tardará (tránsito a Marte), el médico de vuelo decidirá si cambiarlo por otro método para controlar el sangrado.',
          parcial: 'Si sigue sangrando, coloca un segundo torniquete por encima del primero. No lo aflojes ni lo quites. Si la evacuación tardará días, el médico de vuelo decidirá si cambiarlo por otro método para controlar el sangrado.',
          tierra: 'Si sigue sangrando, coloca un segundo torniquete por encima del primero, más cerca del corazón. No aflojes ni quites el torniquete: solo lo hace personal médico.' },
        fuentePor: { microg: 'hemo', parcial: 'hemo', tierra: 'cruzroja' }, estado: 'validado' },
      reporte('el torniquete'),
    ],
    ciclo: { reporte: 'reporte' },
    montar: montarTorniquete,
  },
  atragantamiento: {
    titulo: 'Atragantamiento (adulto consciente)', maniqui: 'maniqui_torso.glb',
    atajos: [{ texto: 'Perdió el conocimiento', paso: 'inconsciente' }],
    pasos: [
      { id: 'pregunta', titulo: '¿Se está ahogando?', clip: 'hablando', modo: 'espera',
        texto: 'Pregunta: "¿Te estás ahogando?". Si puede toser con fuerza, deja que siga tosiendo. Si no puede hablar, toser ni respirar (manos al cuello, labios azulados o grises), actúa ya.', fuente: 'mayo', estado: 'validado' },
      { id: 'ayuda', titulo: 'Pide ayuda', clip: 'llamar', modo: 'espera',
        textos: {
          microg: 'Pide a otro tripulante que avise a Tierra mientras tú actúas. Si estás solo, primero da los golpes y las compresiones.',
          parcial: 'Pide a otro tripulante que avise a Tierra mientras tú actúas. Si estás solo, primero da los golpes y las compresiones.',
          tierra: 'Pide a alguien que llame a emergencias mientras tú actúas. Si estás solo, primero da los golpes y las compresiones.' },
        fuente: 'mayo', estado: 'validado' },
      { id: 'ancla', titulo: 'Ánclate', clip: 'senalar', solo: ['microg'], modo: 'espera',
        texto: 'Ancla tus pies a las sujeciones y mantén a tu compañero pegado a ti; sin gravedad, cada golpe o compresión los separa.', fuente: 'campo', estado: 'supuesto' },
      { id: 'pos_golpes', titulo: 'Sostén e inclina', clip: 'ah_sostener', efecto: 'omoplatos', inclinar: true, modo: 'espera',
        texto: 'Colócate a un lado y un poco detrás. Pasa un brazo por delante de su pecho para sostenerlo e inclínalo hacia adelante por la cintura.', fuente: 'mayo', estado: 'validado' },
      { id: 'golpes', titulo: '5 golpes en la espalda', clip: 'ah_golpes', efecto: 'omoplatos', inclinar: true, modo: 'conteo', total: 5, periodo: 1.1,
        texto: 'Da 5 golpes separados con el talón de la mano, entre los omóplatos (la marca). Golpes firmes, uno por uno.', fuente: 'mayo', estado: 'validado' },
      { id: 'pos_empuje', titulo: 'Rodea su cintura', clip: 'senalar', efecto: 'ombligo', modo: 'espera',
        imagen: 'heimlich.jpg', imagenAlt: 'Compresiones abdominales: rescatista detrás, puño justo arriba del ombligo, empuje hacia adentro y arriba',
        textos: {
          microg: 'Párate detrás y rodea su cintura con los brazos. Haz un puño y coloca el lado del pulgar justo arriba del ombligo (la marca). Sujeta el puño con la otra mano. Si no alcanzas a rodearlo, usa compresiones en el pecho.',
          parcial: 'Párate detrás, con un pie un poco adelante. Rodea su cintura con los brazos. Haz un puño y coloca el lado del pulgar justo arriba del ombligo (la marca). Sujeta el puño con la otra mano. Si no alcanzas a rodearlo, usa compresiones en el pecho.',
          tierra: 'Párate detrás, con un pie un poco adelante. Rodea su cintura con los brazos. Haz un puño y coloca el lado del pulgar justo arriba del ombligo (la marca). Sujeta el puño con la otra mano. Si está embarazada o no alcanzas a rodearla, usa compresiones en el pecho.' },
        fuente: 'mayo', estado: 'validado' },
      { id: 'empuje', titulo: '5 compresiones abdominales', clip: 'ah_cuenta', efecto: 'empuje', modo: 'conteo', total: 5, periodo: 1.1,
        imagen: 'heimlich.jpg', imagenAlt: 'Compresiones abdominales: rescatista detrás, puño justo arriba del ombligo, empuje hacia adentro y arriba',
        texto: 'Da 5 compresiones rápidas hacia adentro y hacia arriba (sigue la flecha), como si quisieras levantarlo. Moon-C cuenta el ritmo.', fuente: 'mayo', estado: 'validado' },
      { id: 'alterna', titulo: 'Revisa y repite', clip: 'atenta', modo: 'espera',
        texto: 'Revisa si salió el objeto. Si no, repite: 5 golpes en la espalda y 5 compresiones abdominales, hasta que salga o pierda el conocimiento.', fuente: 'aha_ah', estado: 'validado' },
      { id: 'inconsciente', titulo: 'Si pierde el conocimiento', clip: 'senalar', modo: 'espera',
        textos: {
          microg: 'Sujétalo a la camilla boca arriba. Mira en su boca y saca el objeto solo si lo ves; nunca barras a ciegas con el dedo. Empieza la RCP.',
          parcial: 'Recuéstalo boca arriba. Mira en su boca y saca el objeto solo si lo ves; nunca barras a ciegas con el dedo. Empieza la RCP.',
          tierra: 'Recuéstalo boca arriba en el piso. Mira en su boca y saca el objeto solo si lo ves; nunca barras a ciegas con el dedo. Empieza la RCP.' },
        fuente: 'mayo', estado: 'validado' },
      reporte('el atragantamiento'),
    ],
    ciclo: { empuje: 'alterna', alterna: 'golpes', reporte: 'reporte' },
    montar: montarAtragantamiento,
  },
};

// ---------------------------------------------------------------------------------------------
const brillo = (THREE, geo, color) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
const mate = (THREE, c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0, ...extra });

function montarRCP({ THREE, grupo, caja, morph, moon }) {
  const CP = [-0.02, -0.458, 0.585];
  // posición Evetts-Russomano: Moon-C flota sobre la cabeza del paciente mirando hacia sus pies
  const ER = { pos: new THREE.Vector3(0.533, 0.158, 0.605), rotY: -Math.PI / 2 };
  const marca = brillo(THREE, new THREE.RingGeometry(0.045, 0.065, 40), 0x9d8cff); marca.rotation.x = -Math.PI / 2; marca.position.set(CP[0], CP[1] + 0.006, CP[2]);
  const correas = new THREE.Group(), L = caja.max.x - caja.min.x;
  for (const f of [0.30, 0.62]) { const c = brillo(THREE, new THREE.BoxGeometry(0.05, 0.03, caja.max.z - caja.min.z + 0.01), 0x9d8cff); c.position.set(caja.min.x + 0.05 + (L - 0.10) * f, caja.min.y + 0.02, (caja.min.z + caja.max.z) / 2); correas.add(c); }
  const dea = new THREE.Group();
  const equipo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.12), mate(THREE, 0x3f8f5a)); equipo.position.set(caja.max.x + 0.02, caja.min.y + 0.03, caja.min.z + 0.02);
  const boton = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 24), mate(THREE, 0xffd34d)); boton.position.y = 0.035; equipo.add(boton);
  const parche = () => new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.004, 0.04), mate(THREE, 0xf4f4f6));
  const p1 = parche(); p1.position.set(CP[0] + 0.21, CP[1] + 0.012, CP[2] + 0.08); p1.scale.setScalar(1.6);
  const p2 = parche(); p2.position.set(CP[0] + 0.03, CP[1] - 0.03, CP[2] - 0.16); p2.rotation.x = 0.5; p2.scale.setScalar(1.6);
  dea.add(equipo, p1, p2); dea.visible = false; grupo.add(marca, correas, dea);
  let mezcla = 0;                                          // 0 = de pie junto a la camilla · 1 = Evetts-Russomano
  const colocar = () => {
    const k = mezcla * mezcla * (3 - 2 * mezcla);
    moon.root.position.set(ER.pos.x * k, ER.pos.y * k, ER.pos.z * k);
    moon.root.rotation.y = ER.rotY * k;
  };
  return {
    reiniciar() { dea.visible = false; mezcla = 0; colocar(); },
    soltar() { mezcla = 0; colocar(); },
    update(p, t, comp, dt, ctx) {
      const pul = 0.5 + 0.5 * Math.sin(t * 5);
      marca.material.opacity = p.efecto === 'marca' ? 0.35 + 0.5 * pul : (p.efecto === 'compresion' ? 0.35 : 0);
      correas.children.forEach(c => c.material.opacity = p.efecto === 'correas' && (p.id !== 'seguro' || ctx.g !== 'microg') ? 0.25 + 0.45 * pul : 0);
      if (p.efecto === 'dea') dea.visible = true;
      const quiereER = p.pose === 'er' || (p.pose === 'er?' && ctx.er);
      mezcla += ((quiereER ? 1 : 0) - mezcla) * Math.min(1, (dt || 0.016) * 3);
      colocar();
      let m = comp;
      if (p.efecto === 'ventila') { const k = t % 2.5; m = k < 1 ? -0.7 * Math.sin(Math.PI * k) : 0; }
      if (morph) morph.morphTargetInfluences[0] = m;
    },
  };
}

function montarTorniquete({ THREE, grupo }) {
  // brazo de entrenamiento: eje a lo largo de x (mano hacia -x, hombro hacia +x)
  const AX = -0.02, CY = -0.547, CZ = 0.56, R = 0.091;
  const HERIDA = new THREE.Vector3(-0.11, -0.456, 0.56);
  const NEGRO = 0x2a2a33;
  const tq = new THREE.Group(); tq.position.set(AX, CY, CZ); grupo.add(tq);
  const banda = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.038, 48, 1, true), mate(THREE, NEGRO, { side: THREE.DoubleSide }));
  banda.rotation.z = Math.PI / 2; tq.add(banda);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.07), mate(THREE, NEGRO)); tq.add(base);
  const piv = new THREE.Group(); tq.add(piv);
  const varilla = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.12, 16), mate(THREE, 0x1c1c22));
  varilla.rotation.x = Math.PI / 2; piv.add(varilla);
  const punta = (z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), mate(THREE, 0xd94141)); m.position.z = z; return m; };
  piv.add(punta(0.06), punta(-0.06));
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.016), mate(THREE, NEGRO)); tq.add(clip);
  const clipBr = brillo(THREE, new THREE.BoxGeometry(0.04, 0.032, 0.026), 0x9d8cff); clip.add(clipBr);
  const cola = new THREE.Group(); tq.add(cola);
  const colaM = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.004, 1), mate(THREE, NEGRO)); colaM.position.z = -0.5; cola.add(colaM);
  const puntaRoja = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.005, 0.02), mate(THREE, 0xd94141)); cola.add(puntaRoja);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const etiqueta = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.017), new THREE.MeshBasicMaterial({ map: tex }));
  etiqueta.rotation.x = -Math.PI / 2; tq.add(etiqueta);
  let horaTxt = '';
  const escribir = (txt) => { const c = cv.getContext('2d'); c.fillStyle = '#f2f2f5'; c.fillRect(0, 0, 256, 96); c.fillStyle = '#c62f2f'; c.font = 'bold 56px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 128, 52); tex.needsUpdate = true; };
  const zona = brillo(THREE, new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.04, 40, 1, true), 0x57d68d); zona.material.side = THREE.DoubleSide;
  zona.rotation.z = Math.PI / 2; zona.position.set(AX, CY, CZ); grupo.add(zona);
  const anillo = brillo(THREE, new THREE.RingGeometry(0.022, 0.03, 32), 0xff5a5a); anillo.rotation.x = -Math.PI / 2; anillo.position.copy(HERIDA); anillo.position.y += 0.004; grupo.add(anillo);
  const gotas = [];
  for (let k = 0; k < 9; k++) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 8), new THREE.MeshStandardMaterial({ color: 0xa3121b, roughness: 0.25, transparent: true }));
    const a = k * 2.399; g.userData = { f: k / 9, dir: new THREE.Vector3(Math.cos(a) * 0.6, 0.55 + 0.4 * ((k * 7) % 5) / 5, Math.sin(a) * 0.6 + 0.4).normalize() };
    grupo.add(g); gotas.push(g);
  }
  const segundo = brillo(THREE, new THREE.CylinderGeometry(R + 0.014, R + 0.014, 0.036, 40, 1, true), 0x9d8cff); segundo.material.side = THREE.DoubleSide;
  segundo.rotation.z = Math.PI / 2; segundo.position.set(AX + 0.075, CY, CZ); grupo.add(segundo);

  const S = { colocado: 0, apretado: 0, giro: 0, trabado: 0 };
  const orden = ['herida', 'colocar', 'avisa', 'jalar', 'girar', 'trabar', 'hora', 'vigila', 'reporte'];
  const ease = (x) => x * x * (3 - 2 * x), clamp = (x) => Math.max(0, Math.min(1, x));
  function pose() {
    const r = R + 0.003 + 0.028 * (1 - S.apretado) - 0.002 * S.giro;
    banda.scale.set(r, 1, r);
    tq.position.x = AX - 0.3 * (1 - ease(S.colocado));
    tq.visible = S.colocado > 0;
    const top = r + 0.001;
    base.position.y = top + 0.006;
    piv.position.y = top + 0.019;
    piv.rotation.y = ease(S.giro) * Math.PI * 6;
    clip.position.set(0, top + 0.016, 0.071);
    const largo = 0.11 * (1 - S.apretado) + 0.04;
    cola.position.set(0, top + 0.003, -0.035);
    cola.rotation.x = 0.7 * (1 - S.apretado);
    colaM.scale.z = largo; colaM.position.z = -largo / 2; puntaRoja.position.z = -largo;
    etiqueta.position.set(0, top + 0.006, -0.06); etiqueta.visible = !!horaTxt;
  }
  return {
    reiniciar() { S.colocado = S.apretado = S.giro = S.trabado = 0; horaTxt = ''; pose(); },
    update(p, t, comp, dt, ctx) {
      const k = orden.indexOf(p.id), pul = 0.5 + 0.5 * Math.sin(t * 5);
      S.colocado = k > 1 ? 1 : (k === 1 ? clamp(t / 1.6) : 0);
      S.apretado = k > 3 ? 1 : (k === 3 ? clamp(t / 1.6) : 0);
      S.giro = k > 4 ? 1 : (k === 4 ? clamp(t / 4.5) : 0);
      S.trabado = k > 5 ? 1 : (k === 5 ? (t > 0.6 ? 1 : 0) : 0);
      if (k >= 6 && !horaTxt) { const d = new Date(); horaTxt = 'TQ ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); escribir(horaTxt); ctx.anotar(registroDe(ctx.idioma).torniquete + horaTxt); }
      if (k < 6) horaTxt = '';
      pose();
      zona.material.opacity = k === 1 ? 0.25 + 0.4 * pul : 0;
      anillo.material.opacity = k === 0 ? 0.4 + 0.5 * pul : 0;
      clipBr.material.opacity = k === 5 ? 0.3 + 0.5 * pul : 0;
      segundo.material.opacity = k === 7 ? 0.15 + 0.3 * pul : 0;
      const flujo = 1 - (0.35 * S.apretado + 0.65 * S.giro);
      const g0 = ctx.gravedad;                                   // 0 = microgravedad: la sangre flota en esferas
      gotas.forEach((g, n) => {
        const u = g.userData; u.f = (u.f + (g0 === 0 ? 0.004 : 0.016) * (0.6 + flujo)) % 1; const f = u.f;
        if (g0 === 0) {                                           // esferas que se alejan despacio y crecen
          g.position.copy(HERIDA).addScaledVector(u.dir, 0.012 + 0.09 * f); g.scale.setScalar(0.8 + 1.4 * f);
        } else {                                                   // gotas que caen; más lento con poca gravedad
          const caida = 0.07 * Math.min(1, 0.35 + g0);
          g.position.set(HERIDA.x + 0.006 * Math.sin(f * 9 + n), HERIDA.y - 0.004 - caida * f * f, HERIDA.z + 0.035 + 0.025 * f); g.scale.setScalar(1);
        }
        g.material.opacity = flujo > 0.02 ? Math.min(1, flujo * 1.5) * (1 - f * 0.85) : 0; g.visible = g.material.opacity > 0.01;
      });
    },
    get hora() { return horaTxt; },
  };
}

function montarAtragantamiento({ THREE, grupo, modelo, morph, moon }) {
  // torso de entrenamiento a escala real (igual que el maniquí de RCP), sobre una base en el piso.
  const PIV = new THREE.Vector3(-0.02, -0.942, 0.584), OMO = new THREE.Vector3(-0.02, -0.246, 0.469), ABD = new THREE.Vector3(-0.02, -0.71, 0.75);
  const piv = new THREE.Group(); piv.position.copy(PIV); grupo.add(piv);
  modelo.position.sub(PIV); piv.add(modelo);
  const marcaO = brillo(THREE, new THREE.RingGeometry(0.035, 0.05, 32), 0x9d8cff); marcaO.position.copy(OMO).sub(PIV); marcaO.position.z -= 0.006; marcaO.rotation.y = Math.PI; piv.add(marcaO);
  const marcaA = brillo(THREE, new THREE.RingGeometry(0.03, 0.044, 32), 0x9d8cff); marcaA.position.copy(ABD).sub(PIV); marcaA.position.z += 0.006; piv.add(marcaA);
  const flecha = new THREE.Group(); flecha.position.copy(ABD).sub(PIV); flecha.position.z += 0.11; flecha.scale.setScalar(1.8); piv.add(flecha);
  const fm = new THREE.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0, depthWrite: false });
  const curva = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.02, 0.03), new THREE.Vector3(0, -0.02, -0.04), new THREE.Vector3(0, 0.05, -0.05)), 16, 0.005, 8), fm);
  const cono = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.03, 16), fm); cono.position.set(0, 0.06, -0.05);
  flecha.add(curva, cono);
  let lean = 0, cerca = 0;
  const LEAN = 0.26;                                  // ~15° hacia adelante para los golpes
  const colocar = () => { const k = cerca * cerca * (3 - 2 * cerca); moon.root.position.set(0, 0, -0.3 + 0.36 * k); moon.root.rotation.y = 0; };
  return {
    reiniciar() { lean = 0; piv.rotation.x = 0; cerca = 0; colocar(); },
    soltar() { moon.root.position.set(0, 0, 0); },
    update(p, t, comp, dt) {
      const pul = 0.5 + 0.5 * Math.sin(t * 5), k = Math.min(1, (dt || 0.016) * 3);
      lean += ((p.inclinar ? LEAN : 0) - lean) * k;
      cerca += ((p.inclinar ? 1 : 0) - cerca) * k;     // Moon-C se acerca para golpear y se aparta para las compresiones
      colocar();
      piv.rotation.x = lean + (p.id === 'golpes' ? 0.05 * comp : 0);
      marcaO.material.opacity = p.efecto === 'omoplatos' ? (p.modo === 'conteo' ? 0.4 : 0.35 + 0.5 * pul) : 0;
      marcaA.material.opacity = p.efecto === 'ombligo' ? 0.35 + 0.5 * pul : (p.efecto === 'empuje' ? 0.45 : 0);
      fm.opacity = p.efecto === 'empuje' || p.efecto === 'ombligo' ? 0.4 + 0.5 * pul : 0;
      if (morph) morph.morphTargetInfluences[0] = p.efecto === 'empuje' ? comp : 0;
    },
  };
}

// ---------------------------------------------------------------------------------------------
export async function crearManiobra(id, { THREE, scene, moon, base = './', archivos = {}, entorno = 'iss', idioma = 'es', onPaso, onConteo, onTiempo, sonido = true } = {}) {
  const def = MANIOBRAS[id]; if (!def) throw new Error('Maniobra desconocida: ' + id);
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const g = await new GLTFLoader().loadAsync(archivos[def.maniqui] || base + def.maniqui);
  const grupo = new THREE.Group(); grupo.add(g.scene); grupo.visible = false; scene.add(grupo);
  let morph = null;
  g.scene.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true; o.material.metalness = 0; if (o.morphTargetInfluences && !morph) morph = o; } });
  const caja = new THREE.Box3().setFromObject(g.scene);
  const escena = def.montar({ THREE, grupo, caja, morph, moon, modelo: g.scene });

  let ctxAudio = null;
  const tic = (fuerte) => { if (!sonido) return; try {
    ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctxAudio.createOscillator(), v = ctxAudio.createGain(); o.frequency.value = fuerte ? 1320 : 880; v.gain.value = 0.0001;
    o.connect(v); v.connect(ctxAudio.destination); const t = ctxAudio.currentTime;
    v.gain.exponentialRampToValueAtTime(0.18, t + 0.005); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); o.start(t); o.stop(t + 0.08);
  } catch (e) {} };

  let env = ENTORNOS[entorno] ? entorno : 'iss';
  let lang = IDIOMAS.includes(idioma) ? idioma : 'es';
  let pasos = [], i = -1, activo = false, tPaso = 0, conteo = 0, ultimaFase = 0, soloManos = false;
  let tInicio = 0, tReloj = 0, tUltRotacion = 0, total = { compresiones: 0, ciclos: 0 }, registro = [], enCMRS = false;
  const anotar = (evento) => registro.push({ hora: new Date().toISOString(), seg: Math.round(tReloj), evento });
  const ctx = {
    get g() { return ENTORNOS[env].g; }, get gravedad() { return ENTORNOS[env].gravedad; }, get entorno() { return env; },
    get er() { return ENTORNOS[env].g === 'microg' && !enCMRS; }, get idioma() { return lang; }, anotar,
  };
  const elegir = (o) => o && ((o.textos && (o.textos[env] || o.textos[ctx.g])) || o.texto);
  const filtrar = () => def.pasos.filter(p => !p.solo || p.solo.includes(ctx.g)).map(p => {
    const tr = (enIdioma(lang) && EN.maniobras[id]?.pasos?.[p.id]) || null;   // sin traducción: español
    return {
      ...p,
      titulo: (tr && tr.titulo) || p.titulo,
      texto: elegir(tr) || elegir(p),
      imagenAlt: (tr && tr.imagenAlt) || p.imagenAlt,
      fuente: (p.fuentePor && p.fuentePor[ctx.g]) || p.fuente,
      estado: (p.estadoPor && p.estadoPor[ctx.g]) || p.estado,
    };
  });
  const idx = (pid) => pasos.findIndex(p => p.id === pid);
  function entrar(k) {
    if (k < 0 || k >= pasos.length) return;
    i = k; tPaso = 0;
    const p = pasos[i];
    if (p.id === 'cmrs') enCMRS = true;
    const clip = typeof p.clip === 'function' ? p.clip(ctx) : p.clip;
    moon.setState(clip);
    const a = moon.action(clip); if (a && p.modo === 'conteo') { a.time = 0; ultimaFase = 0; conteo = 0; onConteo && onConteo(0, p.total || def.compresiones); }
    anotar(registroDe(lang).paso + p.titulo);
    onPaso && onPaso(i, p, pasos);
  }
  function despues() {
    const p = pasos[i];
    const r = def.rotacion;
    if (r && p.id === r.tras && tReloj - tUltRotacion >= r.cada && idx(r.paso) >= 0) { tUltRotacion = tReloj; return entrar(idx(r.paso)); }
    let sig = def.ciclo && def.ciclo[p.id];
    if (sig === 'ventila' && soloManos) sig = 'comprime';
    if (sig === p.id) return;
    if (sig && idx(sig) >= 0) return entrar(idx(sig));
    entrar(i + 1);
  }
  function paqueteTierra() {
    const E = datosEntorno(env, lang);
    return {
      maniobra: tituloManiobra(id, lang), entorno: E.nombre, retrasoComunicacion: E.retraso, evacuacion: E.evacuacion,
      inicio: tInicio ? new Date(tInicio).toISOString() : null, duracionSeg: Math.round(tReloj),
      compresiones: total.compresiones || undefined, ciclos: total.ciclos || undefined,
      torniquete: escena.hora || undefined, eventos: registro.slice(),
      aviso: enIdioma(lang) ? EN.aviso : 'Generado por Moon-C. Apoyo a la decisión; no sustituye el criterio médico.',
    };
  }
  return {
    grupo, def,
    get pasos() { return pasos; }, get paso() { return pasos[i]; }, get indice() { return i; }, get conteo() { return conteo; },
    get soloManos() { return soloManos; }, set soloManos(v) { soloManos = !!v; },
    get entorno() { return env; }, set entorno(v) { if (ENTORNOS[v]) { env = v; if (!activo) pasos = filtrar(); } },
    get idioma() { return lang; },
    set idioma(v) {                                   // cambia los textos sin reiniciar la guía
      if (!IDIOMAS.includes(v) || v === lang) return;
      lang = v;
      if (!activo) return;
      pasos = filtrar();
      if (pasos[i]) onPaso && onPaso(i, pasos[i], pasos);
    },
    get atajos() {
      return (def.atajos || []).filter(a => !a.solo || a.solo.includes(ctx.g))
        .map(a => ({ ...a, texto: (enIdioma(lang) && EN.maniobras[id]?.atajos?.[a.paso]) || a.texto }));
    },
    get hora() { return escena.hora || null; },
    paqueteTierra,
    iniciar() {
      pasos = filtrar(); grupo.visible = true; activo = true; enCMRS = false; registro = []; total = { compresiones: 0, ciclos: 0 };
      tInicio = Date.now(); tReloj = 0; tUltRotacion = 0; escena.reiniciar(); anotar(registroDe(lang).inicio + datosEntorno(env, lang).nombre); entrar(0);
    },
    siguiente() { if (activo) despues(); },
    anterior() { if (activo) entrar(i - 1); },
    ir(pid) { if (activo) entrar(typeof pid === 'number' ? pid : idx(pid)); },
    detener() { activo = false; escena.soltar && escena.soltar(); moon.setState('atenta'); },
    // Cambia de entorno SIN reiniciar la maniobra: vuelve a filtrar los pasos y conserva el actual
    // (si ese paso no existe en el nuevo entorno, pasa al siguiente que sí exista). Devuelve false si no existe el entorno.
    cambiarEntorno(v) {
      if (!ENTORNOS[v]) return false;
      if (v === env) return true;
      env = v;
      if (!activo) { pasos = filtrar(); return true; }
      const actual = pasos[i] && pasos[i].id, orden = def.pasos.map(p => p.id);
      pasos = filtrar(); anotar(registroDe(lang).entorno + datosEntorno(env, lang).nombre);
      let k = idx(actual);
      if (k < 0) { for (let j = orden.indexOf(actual) + 1; j < orden.length && k < 0; j++) k = idx(orden[j]); }
      if (k < 0) k = pasos.length - 1;
      if (pasos[k].id === actual) { i = k; onPaso && onPaso(i, pasos[i], pasos); } else entrar(k);   // mismo paso: sigue el conteo/tiempo
      return true;
    },
    irA(pid) { if (!activo) return false; const k = idx(pid); if (k < 0) return false; entrar(k); return true; },
    ocultar() { this.detener(); grupo.visible = false; moon.setState('tranquila'); if (ctxAudio) { try { ctxAudio.close(); } catch (e) {} ctxAudio = null; } },
    update(dt) {
      if (!activo) return;
      tPaso += dt; tReloj += dt; const p = pasos[i]; let comp = 0;
      if (p.modo === 'conteo') {
        const periodo = p.periodo || 60 / (def.frecuencia || 110), tot = p.total || def.compresiones;
        const clip = typeof p.clip === 'function' ? p.clip(ctx) : p.clip;
        const a = moon.action(clip); const w = a ? a.getEffectiveWeight() : 0;
        const f = a ? a.time / periodo : 0; comp = (0.5 - 0.5 * Math.cos(2 * Math.PI * f)) * w; const fr = f % 1;
        if (ultimaFase < 0.5 && fr >= 0.5 && w > 0.5) {
          conteo++; total.compresiones++; onConteo && onConteo(conteo, tot); tic(conteo % 10 === 0 || conteo === tot);
          if (conteo >= tot) {
            if (soloManos && def.ciclo && def.ciclo[p.id] === 'ventila') {   // solo compresiones: sin ventilaciones, no hay ciclos; rota por tiempo
              const r = def.rotacion;
              if (r && tReloj - tUltRotacion >= r.cada && idx(r.paso) >= 0) { tUltRotacion = tReloj; entrar(idx(r.paso)); }
              else { conteo = 0; onConteo && onConteo(0, tot); }
            } else { total.ciclos++; despues(); }
          }
        }
        ultimaFase = fr;
      }
      escena.update(p, tPaso, comp, dt, ctx);
      if (p.modo === 'tiempo') { onTiempo && onTiempo(Math.max(0, Math.ceil(p.segundos - tPaso))); if (tPaso >= p.segundos) despues(); }
    },
  };
}
