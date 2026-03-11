// classifier.js — clasificación de mensajes por patrones keyword.

/**
 * Normalizador de texto peruano coloquial.
 * Corrige errores ortográficos frecuentes en mensajes de WhatsApp
 * de personas con nivel educativo variado en Perú.
 *
 * IMPORTANTE: Se aplica DESPUÉS de toLowerCase() + strip acentos.
 * No corrige todo, solo los patrones más frecuentes que afectan clasificación.
 */
export function normalizePeruvianText(text) {
  return text
    .replace(/\bnesecit/g, 'necesit')
    .replace(/\bnececit/g, 'necesit')
    .replace(/\bnesesit/g, 'necesit')
    .replace(/\btrbajo/g, 'trabajo')
    .replace(/\btravajo/g, 'trabajo')
    .replace(/\bcanpana/g, 'campana')
    .replace(/\bjente/g, 'gente')
    .replace(/\bboto\b/g, 'voto')
    .replace(/\bbotar\b/g, 'votar')
    .replace(/\bbotamos\b/g, 'votamos')
    .replace(/\bapolla/g, 'apoya')
    .replace(/\bapollar/g, 'apoyar')
    .replace(/\baser\b/g, 'hacer')
    .replace(/\basemos/g, 'hacemos')
    .replace(/\basiendo/g, 'haciendo')
    .replace(/\breconosid/g, 'reconocid')
    .replace(/\bconosid/g, 'conocid')
    .replace(/\bconoser/g, 'conocer')
    .replace(/\bdotor\b/g, 'doctor')
    .replace(/\bingenero\b/g, 'ingeniero')
    .replace(/\bdiputao\b/g, 'diputado')
    .replace(/\bcandidao\b/g, 'candidato')
    .replace(/\bgovierno/g, 'gobierno')
    .replace(/\bgobieno/g, 'gobierno')
    .replace(/\bdesempleo/g, 'desempleo')
    .replace(/\bdesocupad/g, 'desocupad')
    .replace(/\bboluntari/g, 'voluntari')
    .replace(/\bbrigadist/g, 'brigadist')
    .replace(/\bmilitant/g, 'militant')
    .replace(/\bcordinad/g, 'coordinad')
    .replace(/\bcordinar/g, 'coordinar')
    .replace(/\bcolavorar/g, 'colaborar')
    .replace(/\bcolaborasion/g, 'colaboracion')
    .replace(/\bprovincia/g, 'provincia')
    .replace(/\bdistrito/g, 'distrito')
    .replace(/\benfermeria/g, 'enfermeria')
    .replace(/\benfermera/g, 'enfermera')
    .replace(/\bospital/g, 'hospital')
    .replace(/\bpubli[cs]idad/g, 'publicidad');
}

// PERF v7.1.0: Pre-compiled regex patterns at module scope
const _rxDinero = /yape|plin|nequi|transferencia|deposito|cuenta.?(bancaria|ahorro|corriente|bcp|bbva|interbank|scotiabank)|numero.?de.?(yape|cuenta|plin|celular.*yape)|apoyo.?(economico|monetario|dinero|plata|financier)|ayuda.?(economica|monetaria|financier)|envi(?:ar|e|o|ame).?(?:dinero|plata|soles|dolares)|necesit(?:o|amos).*(?:dinero|plata|comprar|pagar|economic)|granito.?de.?arena|su.?voluntad|su.?buena.?voluntad|lo.?que.?pueda|alguito|algito|cualquier.?(?:cosita|ayudita|apoyito|aporte)|colaboracion.*(?:economic|monetari|dinero|plata)|aport(?:e|ar|ecito).*(?:economic|monetari|voluntari)|pasando.?(?:por|un).?momento.?(?:dificil|critico|complicado)|bajos?.?recursos|situacion.?(?:dificil|critica|precaria|economica)|\d{2,}\.?\d*\s*soles|\d{1,}\s*mil\s*soles|s\/\.?\s*\d{2,}|medicamentos?.*(?:hospital|clinica|salud|enferm)|examenes?.*(?:hospital|clinica|medic|laboratorio)|operacion.*(?:necesit|urgen|ayud|plata|dinero)|tratamiento.*(?:necesit|costoso|caro|ayud|plata)|(?:mama|papa|hijo|hija|esposo|esposa|abuel).*(?:enferm|hospital|operar|necesita)/;
const _rxTrabajo = /busc(?:o|ando|amos).*(?:trabajo|empleo|chamba|ocupacion)|necesit(?:o|amos).*(?:trabajo|empleo|chamba)|algun.?tipo.?de.?trabajo|oferta.?(?:laboral|de.?trabajo|de.?empleo)|oportunidad.?(?:laboral|de.?trabajo|de.?empleo)|pued(?:e|o|en).*(?:dar|ofrecer|conseguir).*(?:trabajo|empleo|chamba)|desempleado|sin.?trabajo|sin.?empleo|no.?(?:tengo|consigo|encuentro).*(?:trabajo|empleo|chamba)|trabaj(?:o|ar).*(?:campana).*despu(?:e|é)s|puesto.?de.?trabajo|(?:requiero|solicito).*(?:empleo|trabajo|chamba)|colocacion.?laboral/;
const _rxPublicidad = /publicidad.*(?:pag|programa|difusion|campana|redes|radio|tv)|programa.?(?:radial|de.?radio|televisivo)|comunicador.?social|paginas?.?(?:en.?redes|de.?facebook|de.?instagram|de.?tiktok)|seguidores.*(?:vend|ofrec|paquete|precio|mil)|\d+\s*mil\s*seguidores|precio.*(?:publicidad|difusion|campana)|cotizacion.*(?:publicidad|medios|difusion)|tari(?:f|ff)a.*(?:publicidad|radio|tv|difusion)|paquete.*(?:publicidad|redes|difusion|seguidores)|(?:radio|tv|canal|programa).*(?:cob|cost|prec|tari|pag).*(?:sol|dolar|\d{3,})|\d{3,}\s*soles.*(?:publicidad|difusion|campana)|manejo.?de.?redes.*(?:social|digital|precio|cot)/;
const _rxSaludParts = [
  /trabajador(?:a|es)?.?de.?(?:salud|hospital)/,
  /personal.?de.?(?:salud|hospital|posta)/,
  /tecnico.?(?:en)?.?enfermeria/,
  /enfermero|enfermera|enfermeria/,
  /ministro.?de.?salud/,
  /sector.?salud/,
  /hospital.*(?:apoy|respald|trabaj|sum)/,
  /(?:medico|doctor|enfermera).*(?:apoy|respald|vot|confian)/,
  /companer(?:o|a)s?.?del?.?hospital/,
  /colegio.?(?:medico|de.?enfermeros|de.?obstetri)/,
];
const _rxApoyoGenerico = /(?:apoy|respald|sumarse|cuent(?:e|a).?con|vot(?:o|ar|amos)|confian)/;
const _rxMerch = /necesit(?:o|amos).*(?:afiches|paneles|volantes|calendarios|banderolas|polos|gorr)|envi(?:ar|en|e).*(?:afiches|paneles|volantes|calendarios|banderolas|material)|material.?(?:publicitario|de.?campana|de.?propaganda|de.?difusion)|afiches.*(?:repartir|pegar|distribuir|campana)|volantes.*(?:repartir|entregar|distribuir|campana)|calendarios.*(?:repartir|entregar|distribuir|campana)|paneles?.*(?:coloc|instal|poner|ubicar)|banderolas?.*(?:coloc|instal|poner|ubicar)|material.*(?:repartir|distribuir|entregar|zona|distrito|barrio)|pedir(?:le|les)?.*(?:afiches|paneles|volantes|calendarios|material)|nos?.?falta.*(?:afiches|paneles|volantes|calendarios|material)|mandar(?:nos|me)?.*(?:afiches|paneles|volantes|calendarios|material)/;
const _rxCoordParts = [
  /coordinador(?:a|es)?.*(?:zona|distrito|region|sector|campana|provincial)/,
  /soy.?(?:el|la)?.?coordinador/,
  /voluntari(?:o|a|os|as).*(?:sum|organ|inscri|registr|apoy)/,
  /organiz(?:ar|ando|amos).*(?:grupo|comite|base|equipo|gente|voluntari)/,
  /coordinando.*(?:zona|distrito|region|sector|campana)/,
  /representante.*(?:zona|distrito|region|sector|partido)/,
  /responsable.*(?:zona|distrito|region|sector)/,
  /lider(?:esa)?.*(?:zona|barrio|comunidad|distrito)/,
  /dirigente.*(?:barri|comun|distrit|vecin|zona)/,
  /base.?partidaria/,
  /armar(?:emos|ando)?.*(?:equipo|grupo|comite|estructura)/,
];
const _rxDuroParts = [
  /cuent(?:e|a|en).?con.?(?:nuestro|mi|todo|el).?(?:respaldo|apoyo|voto)/,
  /estamos.?(?:listos|dispuestos|organizados|firmes).*(?:apoy|trabaj|sum)/,
  /(?:grupo|equipo|comite).?de.?apoyo/,
  /militante|militando|militancia/,
  /repartiendo.?(?:calendarios|volantes|material|afiches)/,
  /canal.?de.?whatsapp/,
  /fortalec(?:er|iendo).*(?:campana|partido|movimiento)/,
  /sumando.?esfuerzos/,
  /app.?3|alianza.?para.?el.?progreso/,
  /con.?fuerza.?(?:doctor|ingeniero|hermano|cesar|candidato)/,
  /seguir.?(?:sumando|apoyando|trabajando).*(?:campana|partido)/,
  /nuestr(?:o|a)s?.?famili(?:a|as).*(?:apoy|respald|vot)/,
  /formar.*(?:grupo|comite|base|estructura).*(?:apoyo|campana|distrito)/,
  /trabajar.?coordinadamente/,
  /todo(?:s)?.?(?:el|la|los|las)?.?(?:barrio|distrito|zona|comunidad).*(?:apoy|respald|vot)/,
  /vamos.?(?:con|por|a.?ganar|a.?apoyar|arriba)/,
  /a.?ganar.?(?:estas|las)?.?elecciones/,
  /compromet(?:ido|ida|idos|idas).*(?:campana|partido|candidatura|doctor)/,
  /incondicional(?:es)?.*(?:apoy|respald)/,
  /adelante.*(?:doctor|ingeniero|cesar|candidato|hermano)/,
  /ya.?somos.*(?:grupo|equipo|comite|personas|\d+)/,
];
const _rxDuroExtra = /companeros?.*(?:hospital|sector|zona|distrito|barrio)|dispuestos?.?a.?apoyar|confiamos.?en.?su.?trabajo|grupos?.?de.?apoyo|fuerza.*(?:doctor|cesar|ingeniero|candidato)/;
const _rxBlando = /apoy(?:ar|o|e|emos).*(?:focos|cableado|indumentaria|materiales|implementos)|(?:campo|cancha|losa).*(?:deportiv|futbol|campeonato)|campeonato.*(?:apoy|ayud|patroci)|copa.?(?:peru|distrital|provincial|regional)|no.?contamos.?con.?(?:los|recursos|materiales)|club.?deportivo|mejorar.?(?:nuestro|el|la).?(?:campo|cancha|local|losa)|brind(?:ar|arle).*(?:nuestro|su).?apoyo.*apoy(?:ar|o)|queremos.*(?:brindarle|darle|ofrecerle).*(?:apoyo|respaldo).*apoy|premio.*(?:campeonato|torneo|copa|deport)|(?:trofeo|medalla|premio).*(?:campeonato|torneo|copa)|uniforme.*(?:equipo|deport|futbol|club)|camiseta.*(?:equipo|deport|futbol|club)|implementos?.?(?:deportiv|para.?el.?equipo)|iluminacion.*(?:cancha|campo|losa|parque)|techado.*(?:cancha|campo|losa|coliseo)|infraestructura.*(?:deport|comunal|barri)/;
const _rxFlotante = /felicit(?:ar|o|arlo|aciones).*(?:trabajo|gestion|labor)|reconoc(?:er|iendo|emos).*(?:trabajo|labor|gestion)|consult(?:ar|arle|a).*(?:sobre|acerca|respecto)|quisiera.?saber|propuestas.*(?:para|del|sobre)|respecto.?a|que.?piensa.?(?:de|sobre)|que.?propone|buenas?.?(?:tardes|noches|dias|mananas).*(?:doctor|ingeniero|cesar).*inform|me.?gustaria.?(?:saber|conocer|que.?me.?diga)/;

/**
 * Clasificador de mensajes entrantes por patrones de keywords.
 * Retorna: { vote_class, status, confidence, category, reason } o null.
 */
export function classifyMessage(text) {
  if (!text || text.length < 15) return null;

  const stripped = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const lower = normalizePeruvianText(stripped);

  if (_rxDinero.test(lower)) {
    return { vote_class: '', status: 'invalido', confidence: 0.9, category: 'pide_dinero', reason: 'Solicita apoyo economico directo / Yape / transferencia' };
  }

  if (_rxTrabajo.test(lower)) {
    return { vote_class: '', status: 'invalido', confidence: 0.85, category: 'pide_trabajo', reason: 'Solicita empleo/trabajo a cambio de apoyo' };
  }

  if (_rxPublicidad.test(lower)) {
    return { vote_class: '', status: 'invalido', confidence: 0.85, category: 'publicidad_pagada', reason: 'Ofrece publicidad/medios a cambio de pago' };
  }

  let saludScore = 0;
  for (const p of _rxSaludParts) { if (p.test(lower)) saludScore++; }

  const apoyoGenerico = _rxApoyoGenerico.test(lower);
  if (saludScore >= 1 && apoyoGenerico) {
    return { vote_class: 'duro', status: 'respondido', confidence: 0.9, category: 'sector_salud', reason: 'Trabajador/a de salud que apoya activamente' };
  }

  if (_rxMerch.test(lower)) {
    return { vote_class: 'duro', status: 'respondido', confidence: 0.85, category: 'pide_merch', reason: 'Solicita material de campana para distribuir (militante activo)' };
  }

  let coordScore = 0;
  for (const p of _rxCoordParts) { if (p.test(lower)) coordScore++; }

  let duroScore = coordScore;
  for (const p of _rxDuroParts) { if (p.test(lower)) duroScore++; }
  const extraMatch = lower.match(new RegExp(_rxDuroExtra.source, 'g'));
  if (extraMatch) duroScore += extraMatch.length;

  if (duroScore >= 2) {
    const cat = coordScore > 0 ? 'coordinador' : 'apoyo_genuino';
    return { vote_class: 'duro', status: 'respondido', confidence: Math.min(0.7 + duroScore * 0.1, 0.95), category: cat, reason: `Apoyo organizado/militante (${duroScore} senales)` };
  }

  if (_rxBlando.test(lower)) {
    return { vote_class: 'blando', status: 'respondido', confidence: 0.8, category: 'apoyo_condicional', reason: 'Pide apoyo material a cambio de respaldo/votos' };
  }

  if (duroScore === 1) {
    return { vote_class: 'duro', status: 'respondido', confidence: 0.6, category: coordScore > 0 ? 'coordinador' : 'apoyo_probable', reason: 'Senal de apoyo detectada (confianza moderada)' };
  }

  if (_rxFlotante.test(lower)) {
    return { vote_class: 'flotante', status: 'respondido', confidence: 0.5, category: 'indeciso', reason: 'Interes sin compromiso claro' };
  }

  if (saludScore >= 1) {
    return { vote_class: 'flotante', status: 'respondido', confidence: 0.5, category: 'sector_salud_indeciso', reason: 'Persona del sector salud, sin senal clara de apoyo' };
  }

  return null;
}
