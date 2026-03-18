(() => {
  // src/background/bootstrap.js
  var API = "https://api.goberna.us";
  var EXT_VERSION = chrome.runtime.getManifest?.()?.version ?? "unknown";
  if (chrome.storage.session?.setAccessLevel) {
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  }

  // src/background/classifier.js
  function normalizePeruvianText(text) {
    return text.replace(/\bnesecit/g, "necesit").replace(/\bnececit/g, "necesit").replace(/\bnesesit/g, "necesit").replace(/\btrbajo/g, "trabajo").replace(/\btravajo/g, "trabajo").replace(/\bcanpana/g, "campana").replace(/\bjente/g, "gente").replace(/\bboto\b/g, "voto").replace(/\bbotar\b/g, "votar").replace(/\bbotamos\b/g, "votamos").replace(/\bapolla/g, "apoya").replace(/\bapollar/g, "apoyar").replace(/\baser\b/g, "hacer").replace(/\basemos/g, "hacemos").replace(/\basiendo/g, "haciendo").replace(/\breconosid/g, "reconocid").replace(/\bconosid/g, "conocid").replace(/\bconoser/g, "conocer").replace(/\bdotor\b/g, "doctor").replace(/\bingenero\b/g, "ingeniero").replace(/\bdiputao\b/g, "diputado").replace(/\bcandidao\b/g, "candidato").replace(/\bgovierno/g, "gobierno").replace(/\bgobieno/g, "gobierno").replace(/\bdesempleo/g, "desempleo").replace(/\bdesocupad/g, "desocupad").replace(/\bboluntari/g, "voluntari").replace(/\bbrigadist/g, "brigadist").replace(/\bmilitant/g, "militant").replace(/\bcordinad/g, "coordinad").replace(/\bcordinar/g, "coordinar").replace(/\bcolavorar/g, "colaborar").replace(/\bcolaborasion/g, "colaboracion").replace(/\bprovincia/g, "provincia").replace(/\bdistrito/g, "distrito").replace(/\benfermeria/g, "enfermeria").replace(/\benfermera/g, "enfermera").replace(/\bospital/g, "hospital").replace(/\bpubli[cs]idad/g, "publicidad");
  }
  var _rxDinero = /yape|plin|nequi|transferencia|deposito|cuenta.?(bancaria|ahorro|corriente|bcp|bbva|interbank|scotiabank)|numero.?de.?(yape|cuenta|plin|celular.*yape)|apoyo.?(economico|monetario|dinero|plata|financier)|ayuda.?(economica|monetaria|financier)|envi(?:ar|e|o|ame).?(?:dinero|plata|soles|dolares)|necesit(?:o|amos).*(?:dinero|plata|comprar|pagar|economic)|granito.?de.?arena|su.?voluntad|su.?buena.?voluntad|lo.?que.?pueda|alguito|algito|cualquier.?(?:cosita|ayudita|apoyito|aporte)|colaboracion.*(?:economic|monetari|dinero|plata)|aport(?:e|ar|ecito).*(?:economic|monetari|voluntari)|pasando.?(?:por|un).?momento.?(?:dificil|critico|complicado)|bajos?.?recursos|situacion.?(?:dificil|critica|precaria|economica)|\d{2,}\.?\d*\s*soles|\d{1,}\s*mil\s*soles|s\/\.?\s*\d{2,}|medicamentos?.*(?:hospital|clinica|salud|enferm)|examenes?.*(?:hospital|clinica|medic|laboratorio)|operacion.*(?:necesit|urgen|ayud|plata|dinero)|tratamiento.*(?:necesit|costoso|caro|ayud|plata)|(?:mama|papa|hijo|hija|esposo|esposa|abuel).*(?:enferm|hospital|operar|necesita)/;
  var _rxTrabajo = /busc(?:o|ando|amos).*(?:trabajo|empleo|chamba|ocupacion)|necesit(?:o|amos).*(?:trabajo|empleo|chamba)|algun.?tipo.?de.?trabajo|oferta.?(?:laboral|de.?trabajo|de.?empleo)|oportunidad.?(?:laboral|de.?trabajo|de.?empleo)|pued(?:e|o|en).*(?:dar|ofrecer|conseguir).*(?:trabajo|empleo|chamba)|desempleado|sin.?trabajo|sin.?empleo|no.?(?:tengo|consigo|encuentro).*(?:trabajo|empleo|chamba)|trabaj(?:o|ar).*(?:campana).*despu(?:e|é)s|puesto.?de.?trabajo|(?:requiero|solicito).*(?:empleo|trabajo|chamba)|colocacion.?laboral/;
  var _rxPublicidad = /publicidad.*(?:pag|programa|difusion|campana|redes|radio|tv)|programa.?(?:radial|de.?radio|televisivo)|comunicador.?social|paginas?.?(?:en.?redes|de.?facebook|de.?instagram|de.?tiktok)|seguidores.*(?:vend|ofrec|paquete|precio|mil)|\d+\s*mil\s*seguidores|precio.*(?:publicidad|difusion|campana)|cotizacion.*(?:publicidad|medios|difusion)|tari(?:f|ff)a.*(?:publicidad|radio|tv|difusion)|paquete.*(?:publicidad|redes|difusion|seguidores)|(?:radio|tv|canal|programa).*(?:cob|cost|prec|tari|pag).*(?:sol|dolar|\d{3,})|\d{3,}\s*soles.*(?:publicidad|difusion|campana)|manejo.?de.?redes.*(?:social|digital|precio|cot)/;
  var _rxSaludParts = [
    /trabajador(?:a|es)?.?de.?(?:salud|hospital)/,
    /personal.?de.?(?:salud|hospital|posta)/,
    /tecnico.?(?:en)?.?enfermeria/,
    /enfermero|enfermera|enfermeria/,
    /ministro.?de.?salud/,
    /sector.?salud/,
    /hospital.*(?:apoy|respald|trabaj|sum)/,
    /(?:medico|doctor|enfermera).*(?:apoy|respald|vot|confian)/,
    /companer(?:o|a)s?.?del?.?hospital/,
    /colegio.?(?:medico|de.?enfermeros|de.?obstetri)/
  ];
  var _rxApoyoGenerico = /(?:apoy|respald|sumarse|cuent(?:e|a).?con|vot(?:o|ar|amos)|confian)/;
  var _rxMerch = /necesit(?:o|amos).*(?:afiches|paneles|volantes|calendarios|banderolas|polos|gorr)|envi(?:ar|en|e).*(?:afiches|paneles|volantes|calendarios|banderolas|material)|material.?(?:publicitario|de.?campana|de.?propaganda|de.?difusion)|afiches.*(?:repartir|pegar|distribuir|campana)|volantes.*(?:repartir|entregar|distribuir|campana)|calendarios.*(?:repartir|entregar|distribuir|campana)|paneles?.*(?:coloc|instal|poner|ubicar)|banderolas?.*(?:coloc|instal|poner|ubicar)|material.*(?:repartir|distribuir|entregar|zona|distrito|barrio)|pedir(?:le|les)?.*(?:afiches|paneles|volantes|calendarios|material)|nos?.?falta.*(?:afiches|paneles|volantes|calendarios|material)|mandar(?:nos|me)?.*(?:afiches|paneles|volantes|calendarios|material)/;
  var _rxCoordParts = [
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
    /armar(?:emos|ando)?.*(?:equipo|grupo|comite|estructura)/
  ];
  var _rxDuroParts = [
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
    /ya.?somos.*(?:grupo|equipo|comite|personas|\d+)/
  ];
  var _rxDuroExtra = /companeros?.*(?:hospital|sector|zona|distrito|barrio)|dispuestos?.?a.?apoyar|confiamos.?en.?su.?trabajo|grupos?.?de.?apoyo|fuerza.*(?:doctor|cesar|ingeniero|candidato)/;
  var _rxBlando = /apoy(?:ar|o|e|emos).*(?:focos|cableado|indumentaria|materiales|implementos)|(?:campo|cancha|losa).*(?:deportiv|futbol|campeonato)|campeonato.*(?:apoy|ayud|patroci)|copa.?(?:peru|distrital|provincial|regional)|no.?contamos.?con.?(?:los|recursos|materiales)|club.?deportivo|mejorar.?(?:nuestro|el|la).?(?:campo|cancha|local|losa)|brind(?:ar|arle).*(?:nuestro|su).?apoyo.*apoy(?:ar|o)|queremos.*(?:brindarle|darle|ofrecerle).*(?:apoyo|respaldo).*apoy|premio.*(?:campeonato|torneo|copa|deport)|(?:trofeo|medalla|premio).*(?:campeonato|torneo|copa)|uniforme.*(?:equipo|deport|futbol|club)|camiseta.*(?:equipo|deport|futbol|club)|implementos?.?(?:deportiv|para.?el.?equipo)|iluminacion.*(?:cancha|campo|losa|parque)|techado.*(?:cancha|campo|losa|coliseo)|infraestructura.*(?:deport|comunal|barri)/;
  var _rxFlotante = /felicit(?:ar|o|arlo|aciones).*(?:trabajo|gestion|labor)|reconoc(?:er|iendo|emos).*(?:trabajo|labor|gestion)|consult(?:ar|arle|a).*(?:sobre|acerca|respecto)|quisiera.?saber|propuestas.*(?:para|del|sobre)|respecto.?a|que.?piensa.?(?:de|sobre)|que.?propone|buenas?.?(?:tardes|noches|dias|mananas).*(?:doctor|ingeniero|cesar).*inform|me.?gustaria.?(?:saber|conocer|que.?me.?diga)/;
  function classifyMessage(text) {
    if (!text || text.length < 15) return null;
    const stripped = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const lower = normalizePeruvianText(stripped);
    if (_rxDinero.test(lower)) {
      return { vote_class: "", status: "invalido", confidence: 0.9, category: "pide_dinero", reason: "Solicita apoyo economico directo / Yape / transferencia" };
    }
    if (_rxTrabajo.test(lower)) {
      return { vote_class: "", status: "invalido", confidence: 0.85, category: "pide_trabajo", reason: "Solicita empleo/trabajo a cambio de apoyo" };
    }
    if (_rxPublicidad.test(lower)) {
      return { vote_class: "", status: "invalido", confidence: 0.85, category: "publicidad_pagada", reason: "Ofrece publicidad/medios a cambio de pago" };
    }
    let saludScore = 0;
    for (const p of _rxSaludParts) {
      if (p.test(lower)) saludScore++;
    }
    const apoyoGenerico = _rxApoyoGenerico.test(lower);
    if (saludScore >= 1 && apoyoGenerico) {
      return { vote_class: "duro", status: "respondido", confidence: 0.9, category: "sector_salud", reason: "Trabajador/a de salud que apoya activamente" };
    }
    if (_rxMerch.test(lower)) {
      return { vote_class: "duro", status: "respondido", confidence: 0.85, category: "pide_merch", reason: "Solicita material de campana para distribuir (militante activo)" };
    }
    let coordScore = 0;
    for (const p of _rxCoordParts) {
      if (p.test(lower)) coordScore++;
    }
    let duroScore = coordScore;
    for (const p of _rxDuroParts) {
      if (p.test(lower)) duroScore++;
    }
    const extraMatch = lower.match(new RegExp(_rxDuroExtra.source, "g"));
    if (extraMatch) duroScore += extraMatch.length;
    if (duroScore >= 2) {
      const cat = coordScore > 0 ? "coordinador" : "apoyo_genuino";
      return { vote_class: "duro", status: "respondido", confidence: Math.min(0.7 + duroScore * 0.1, 0.95), category: cat, reason: `Apoyo organizado/militante (${duroScore} senales)` };
    }
    if (_rxBlando.test(lower)) {
      return { vote_class: "blando", status: "respondido", confidence: 0.8, category: "apoyo_condicional", reason: "Pide apoyo material a cambio de respaldo/votos" };
    }
    if (duroScore === 1) {
      return { vote_class: "duro", status: "respondido", confidence: 0.6, category: coordScore > 0 ? "coordinador" : "apoyo_probable", reason: "Senal de apoyo detectada (confianza moderada)" };
    }
    if (_rxFlotante.test(lower)) {
      return { vote_class: "flotante", status: "respondido", confidence: 0.5, category: "indeciso", reason: "Interes sin compromiso claro" };
    }
    if (saludScore >= 1) {
      return { vote_class: "flotante", status: "respondido", confidence: 0.5, category: "sector_salud_indeciso", reason: "Persona del sector salud, sin senal clara de apoyo" };
    }
    return null;
  }

  // src/background/adaptive-scoring.js
  var ADAPTIVE_STORAGE_KEY = "wspp_adaptive_weights";
  var ADAPTIVE_MAX_BOOST = 0.15;
  var ADAPTIVE_DECAY_RATE = 0.02;
  var _adaptiveWeights = {};
  chrome.storage.local.get([ADAPTIVE_STORAGE_KEY], (data) => {
    _adaptiveWeights = data[ADAPTIVE_STORAGE_KEY] || {};
    const count = Object.keys(_adaptiveWeights).length;
    if (count > 0) console.log("[WSPP ADAPTIVE] Loaded", count, "category weights");
  });
  function recordCorrection(originalCategory, correctedVoteClass, wasCorrect) {
    if (!originalCategory) return;
    const w = _adaptiveWeights[originalCategory] || { boost: 0, corrections: 0, correct: 0, wrong: 0 };
    w.corrections++;
    if (wasCorrect) {
      w.correct++;
      w.boost = Math.min(ADAPTIVE_MAX_BOOST, w.boost + ADAPTIVE_DECAY_RATE);
    } else {
      w.wrong++;
      w.boost = Math.max(-ADAPTIVE_MAX_BOOST, w.boost - ADAPTIVE_DECAY_RATE);
    }
    _adaptiveWeights[originalCategory] = w;
    chrome.storage.local.set({ [ADAPTIVE_STORAGE_KEY]: _adaptiveWeights });
    console.log(
      "[WSPP ADAPTIVE] Updated",
      originalCategory,
      "\u2192 boost:",
      w.boost.toFixed(3),
      "(correct:",
      w.correct,
      "wrong:",
      w.wrong,
      ")"
    );
  }
  function applyAdaptiveScoring(classification) {
    if (!classification || !classification.category) return classification;
    const w = _adaptiveWeights[classification.category];
    if (!w || w.corrections < 3) return classification;
    const adjusted = { ...classification };
    adjusted.confidence = Math.max(0.1, Math.min(0.98, adjusted.confidence + w.boost));
    if (w.boost !== 0) adjusted._boosted = true;
    return adjusted;
  }

  // src/background/api-client.js
  var OFFLINE_QUEUE_KEY = "wspp_offline_queue";
  var OFFLINE_QUEUE_MAX = 500;
  var OFFLINE_FLUSH_INTERVAL = 3e4;
  function enqueueOffline(path, options) {
    chrome.storage.local.get([OFFLINE_QUEUE_KEY], (data) => {
      const queue = data[OFFLINE_QUEUE_KEY] || [];
      if (queue.length >= OFFLINE_QUEUE_MAX) {
        queue.shift();
        console.warn("[WSPP OFFLINE] Queue full \u2014 dropped oldest event");
      }
      queue.push({ path, options, ts: Date.now() });
      chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
      console.log("[WSPP OFFLINE] Enqueued:", path, "| queue size:", queue.length);
    });
  }
  var _offlineFlushing = false;
  async function flushOfflineQueue() {
    if (_offlineFlushing) return;
    _offlineFlushing = true;
    try {
      const data = await new Promise((r) => chrome.storage.local.get([OFFLINE_QUEUE_KEY], r));
      const queue = data[OFFLINE_QUEUE_KEY] || [];
      if (queue.length === 0) return;
      console.log("[WSPP OFFLINE] Flushing", queue.length, "queued events...");
      const remaining = [];
      const maxAge = 24 * 60 * 60 * 1e3;
      for (const item of queue) {
        if (Date.now() - item.ts > maxAge) {
          console.log("[WSPP OFFLINE] Discarded stale event from", new Date(item.ts).toISOString());
          continue;
        }
        const result = await apiFetch(item.path, item.options);
        if (result.ok || result.status === 400 || result.status === 403) {
          console.log("[WSPP OFFLINE] Flushed:", item.path, result.ok ? "OK" : "permanent error");
        } else {
          remaining.push(item);
          console.warn("[WSPP OFFLINE] Still failing:", item.path, "\u2014 re-queued");
          break;
        }
      }
      chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: remaining });
      if (remaining.length === 0) console.log("[WSPP OFFLINE] Queue drained");
    } finally {
      _offlineFlushing = false;
    }
  }
  setInterval(flushOfflineQueue, OFFLINE_FLUSH_INTERVAL);
  setTimeout(flushOfflineQueue, 5e3);
  var _refreshPromise = null;
  async function tryRefreshToken() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = (async () => {
      try {
        const data = await new Promise((r) => chrome.storage.local.get(["wspp_refresh_token"], r));
        if (!data.wspp_refresh_token) return false;
        const res = await fetch(`${API}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: data.wspp_refresh_token })
        });
        if (!res.ok) return false;
        const json = await res.json();
        if (json.access_token) {
          const tokenData = { wspp_token: json.access_token };
          const refreshData = { wspp_refresh_token: json.refresh_token || data.wspp_refresh_token, wspp_token: json.access_token };
          if (chrome.storage.session) {
            await new Promise((r) => chrome.storage.session.set(tokenData, r));
          }
          await new Promise((r) => chrome.storage.local.set(refreshData, r));
          console.log("[WSPP AUTH] \u2713 Token refreshed");
          return true;
        }
        return false;
      } catch (err) {
        console.error("[WSPP AUTH] Refresh failed:", err.message);
        return false;
      } finally {
        _refreshPromise = null;
      }
    })();
    return _refreshPromise;
  }
  function forceReLogin() {
    chrome.storage.local.remove(["wspp_token", "wspp_refresh_token", "wspp_user", "wspp_campaign_id"]);
    console.warn("[WSPP AUTH] Session expired \u2014 user must re-login");
  }
  function _getToken(callback) {
    chrome.storage.local.get(["wspp_campaign_id", "wspp_token"], (localData) => {
      if (chrome.storage.session) {
        chrome.storage.session.get(["wspp_token"], (sessionData) => {
          const token = sessionData?.wspp_token || localData.wspp_token || null;
          callback({ wspp_token: token, wspp_campaign_id: localData.wspp_campaign_id });
        });
      } else {
        callback(localData);
      }
    });
  }
  async function apiFetch(path, options = {}, _isRetry = false) {
    return new Promise((resolve) => {
      _getToken(async (data) => {
        if (!data.wspp_token) {
          if (!_isRetry) {
            const refreshed = await tryRefreshToken();
            if (refreshed) {
              resolve(await apiFetch(path, options, true));
              return;
            }
          }
          resolve({ ok: false, error: "No auth" });
          return;
        }
        try {
          const baseHeaders = {
            "Authorization": `Bearer ${data.wspp_token}`,
            "x-campaign-id": data.wspp_campaign_id,
            "X-Extension-Version": EXT_VERSION
          };
          if (options.body) {
            baseHeaders["Content-Type"] = "application/json";
          }
          const res = await fetch(`${API}${path}`, {
            ...options,
            headers: {
              ...baseHeaders,
              ...options.headers || {}
            }
          });
          if (res.status === 401 && !_isRetry) {
            const refreshed = await tryRefreshToken();
            if (refreshed) {
              resolve(await apiFetch(path, options, true));
              return;
            }
            forceReLogin();
            resolve({ ok: false, error: "Session expired", status: 401 });
            return;
          }
          const json = await res.json();
          if (!res.ok && !json.status) json.status = res.status;
          resolve(json);
        } catch (err) {
          console.error("[WSPP API]", path, err.message);
          const method = (options.method || "GET").toUpperCase();
          if ((method === "POST" || method === "PUT") && !_isRetry) {
            enqueueOffline(path, options);
          }
          resolve({ ok: false, error: err.message, offline: true });
        }
      });
    });
  }

  // src/background/validation-client.js
  async function lookupValidation(phone) {
    if (!phone) return null;
    const res = await apiFetch(`/api/validacion/lookup?phone=${encodeURIComponent(phone)}`);
    if (res.ok && res.item) return res.item;
    return null;
  }
  async function updateValidationStatus(id, status, vote_class, notes) {
    const body = { status, vote_class: vote_class || void 0, notes: notes || void 0 };
    const res = await apiFetch(`/api/validacion/${id}/status`, {
      method: "PUT",
      body: JSON.stringify(body)
    });
    return res;
  }
  async function claimValidation(id) {
    return apiFetch(`/api/validacion/${id}/claim`, { method: "PUT" });
  }
  var _validationCache = /* @__PURE__ */ new Map();
  var CACHE_TTL = 5 * 60 * 1e3;
  async function getCachedValidation(phone) {
    if (!phone) return null;
    const cached = _validationCache.get(phone);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.item;
    }
    const item = await lookupValidation(phone);
    if (item) {
      _validationCache.set(phone, { item, ts: Date.now() });
    } else {
      _validationCache.set(phone, { item: null, ts: Date.now() - CACHE_TTL + 15e3 });
    }
    return item;
  }
  function invalidateCache(phone) {
    if (phone) _validationCache.delete(phone);
  }

  // src/background/conversation-scorer.js
  var SCORER_STORAGE_KEY = "wspp_conv_scores";
  var SCORER_CONFIG_KEY = "wspp_scorer_config";
  var SIGNAL_MAX_PER_PHONE = 20;
  var PHONE_MAX_ENTRIES = 500;
  var DEFAULT_DECAY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1e3;
  var DEFAULT_CATEGORY_WEIGHTS = {
    // ── Invalido (negativos) ──
    pide_dinero: -3,
    pide_trabajo: -2.5,
    publicidad_pagada: -2,
    // ── Duro (positivos altos) ──
    sector_salud: 2.5,
    coordinador: 3,
    apoyo_genuino: 2,
    apoyo_probable: 1,
    pide_merch: 2.5,
    // ── Blando (positivos bajos) ──
    apoyo_condicional: 1.2,
    // ── Flotante (neutros bajos) ──
    indeciso: 0.3,
    sector_salud_indeciso: 0.5,
    // ── AI-prefixed (misma lógica) ──
    ai_sector_salud: 2.5,
    ai_coordinador: 3,
    ai_apoyo_genuino: 2,
    ai_apoyo_condicional: 1.2,
    ai_indeciso: 0.3,
    ai_pide_dinero: -3,
    ai_pide_trabajo: -2.5,
    ai_publicidad_pagada: -2
  };
  var DEFAULT_THRESHOLDS = {
    duro: 2.5,
    blando: 0.8,
    flotante: 0.1
  };
  var DEFAULT_INVALIDO_LOCK_THRESHOLD = 2.5;
  var DEFAULT_INVALIDO_REVERSAL_THRESHOLD = 3;
  var CATEGORY_WEIGHTS = { ...DEFAULT_CATEGORY_WEIGHTS };
  var THRESHOLDS = { ...DEFAULT_THRESHOLDS };
  var DECAY_HALF_LIFE_MS = DEFAULT_DECAY_HALF_LIFE_MS;
  var INVALIDO_LOCK_THRESHOLD = DEFAULT_INVALIDO_LOCK_THRESHOLD;
  var INVALIDO_REVERSAL_THRESHOLD = DEFAULT_INVALIDO_REVERSAL_THRESHOLD;
  function setScorerConfig(config) {
    if (!config || typeof config !== "object") return;
    if (config.category_weights && typeof config.category_weights === "object") {
      CATEGORY_WEIGHTS = { ...DEFAULT_CATEGORY_WEIGHTS, ...config.category_weights };
    }
    if (typeof config.threshold_duro === "number") THRESHOLDS.duro = config.threshold_duro;
    if (typeof config.threshold_blando === "number") THRESHOLDS.blando = config.threshold_blando;
    if (typeof config.threshold_flotante === "number") THRESHOLDS.flotante = config.threshold_flotante;
    if (typeof config.invalido_lock_threshold === "number") INVALIDO_LOCK_THRESHOLD = config.invalido_lock_threshold;
    if (typeof config.invalido_reversal_threshold === "number") INVALIDO_REVERSAL_THRESHOLD = config.invalido_reversal_threshold;
    if (typeof config.decay_half_life_ms === "number" && config.decay_half_life_ms > 0) {
      DECAY_HALF_LIFE_MS = config.decay_half_life_ms;
    }
    chrome.storage.local.set({ [SCORER_CONFIG_KEY]: config });
    console.log("[SCORER] Config aplicada \u2014 umbrales:", THRESHOLDS, "| lock:", INVALIDO_LOCK_THRESHOLD, "| reversal:", INVALIDO_REVERSAL_THRESHOLD);
  }
  chrome.storage.local.get([SCORER_CONFIG_KEY], (data) => {
    const stored = data[SCORER_CONFIG_KEY];
    if (stored && typeof stored === "object") {
      setScorerConfig(stored);
      console.log("[SCORER] Config restaurada desde storage");
    }
  });
  var _state = /* @__PURE__ */ new Map();
  var _persistTimer = null;
  chrome.storage.local.get([SCORER_STORAGE_KEY], (data) => {
    const stored = data[SCORER_STORAGE_KEY];
    if (!stored || typeof stored !== "object") return;
    let loaded = 0;
    for (const [phone, entry] of Object.entries(stored)) {
      if (entry && Array.isArray(entry.signals)) {
        _state.set(phone, {
          signals: entry.signals
        });
        loaded++;
      }
    }
    if (loaded > 0) console.log(`[SCORER] Cargados ${loaded} tel\xE9fonos desde storage`);
  });
  function _persistImmediate() {
    if (_persistTimer !== null) {
      clearTimeout(_persistTimer);
      _persistTimer = null;
    }
    const obj = {};
    for (const [phone, entry] of _state.entries()) {
      obj[phone] = { signals: entry.signals };
    }
    chrome.storage.local.set({ [SCORER_STORAGE_KEY]: obj });
  }
  function _persist() {
    if (_persistTimer !== null) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      const obj = {};
      for (const [phone, entry] of _state.entries()) {
        obj[phone] = { signals: entry.signals };
      }
      chrome.storage.local.set({ [SCORER_STORAGE_KEY]: obj });
    }, 500);
  }
  function decayFactor(ageMs) {
    return Math.pow(0.5, ageMs / DECAY_HALF_LIFE_MS);
  }
  function _normalizePhoneKey(key) {
    if (!key) return key;
    let normalized = key;
    if (normalized.includes("@")) {
      normalized = normalized.split("@")[0];
    }
    const digits = normalized.replace(/\D/g, "");
    if (digits.length < 7) return key;
    return digits.slice(-9);
  }
  function recordSignal(phone, classification) {
    if (!phone || !classification) return;
    const key = _normalizePhoneKey(phone);
    if (!_state.has(key) && _state.size >= PHONE_MAX_ENTRIES) {
      const oldest = _state.keys().next().value;
      _state.delete(oldest);
    }
    if (!_state.has(key)) {
      _state.set(key, { signals: [] });
    }
    const entry = _state.get(key);
    const baseWeight = CATEGORY_WEIGHTS[classification.category] ?? 0;
    if (baseWeight === 0 && classification.confidence < 0.5) return;
    const signal = {
      category: classification.category,
      weight: baseWeight,
      confidence: classification.confidence,
      ts: Date.now()
    };
    entry.signals.push(signal);
    if (entry.signals.length > SIGNAL_MAX_PER_PHONE) {
      entry.signals.shift();
    }
    _persist();
  }
  function getConversationScore(phone) {
    if (!phone) return null;
    const entry = _state.get(_normalizePhoneKey(phone));
    if (!entry || entry.signals.length === 0) return null;
    const now = Date.now();
    let positiveScore = 0;
    let negativeScore = 0;
    for (const sig of entry.signals) {
      const age = now - sig.ts;
      const decay = decayFactor(age);
      const effectiveWeight = sig.weight * sig.confidence * decay;
      if (effectiveWeight > 0) {
        positiveScore += effectiveWeight;
      } else {
        negativeScore += Math.abs(effectiveWeight);
      }
    }
    const netScore = positiveScore - negativeScore;
    const lockedInvalido = negativeScore >= INVALIDO_LOCK_THRESHOLD;
    if (lockedInvalido) {
      if (positiveScore >= INVALIDO_REVERSAL_THRESHOLD) {
      } else {
        return {
          vote_class: "",
          status: "invalido",
          confidence: Math.min(0.95, 0.7 + negativeScore * 0.05),
          score: netScore,
          reason: `Invalido bloqueado (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`
        };
      }
    }
    if (netScore < -0.5 && negativeScore > positiveScore) {
      return {
        vote_class: "",
        status: "invalido",
        confidence: Math.min(0.9, 0.5 + negativeScore * 0.05),
        score: netScore,
        reason: `Score negativo (neg: ${negativeScore.toFixed(2)}, pos: ${positiveScore.toFixed(2)})`
      };
    }
    if (netScore >= THRESHOLDS.duro) {
      const topCategory = _getTopCategory(entry.signals, now, "positive");
      return {
        vote_class: "duro",
        status: "respondido",
        confidence: Math.min(0.95, 0.7 + netScore * 0.04),
        score: netScore,
        reason: `Score conversacional duro (${netScore.toFixed(2)}) \u2014 top: ${topCategory}`
      };
    }
    if (netScore >= THRESHOLDS.blando) {
      const topCategory = _getTopCategory(entry.signals, now, "positive");
      return {
        vote_class: "blando",
        status: "respondido",
        confidence: Math.min(0.85, 0.55 + netScore * 0.05),
        score: netScore,
        reason: `Score conversacional blando (${netScore.toFixed(2)}) \u2014 top: ${topCategory}`
      };
    }
    if (netScore >= THRESHOLDS.flotante) {
      return {
        vote_class: "flotante",
        status: "respondido",
        confidence: Math.min(0.7, 0.4 + netScore * 0.1),
        score: netScore,
        reason: `Score conversacional flotante (${netScore.toFixed(2)})`
      };
    }
    return null;
  }
  function mergeWithConversationScore(phone, msgClassification) {
    if (!phone) return msgClassification;
    const key = _normalizePhoneKey(phone);
    if (msgClassification) {
      recordSignal(key, msgClassification);
    }
    const conversationResult = getConversationScore(key);
    if (!conversationResult) return msgClassification;
    if (!msgClassification) return { ...conversationResult, _fromConversationHistory: true };
    const sameClass = msgClassification.vote_class === conversationResult.vote_class || msgClassification.status === "invalido" && conversationResult.status === "invalido";
    if (sameClass) {
      return {
        ...conversationResult,
        confidence: Math.min(0.97, Math.max(conversationResult.confidence, msgClassification.confidence) + 0.03),
        reason: `[CONV] ${conversationResult.reason}`,
        category: msgClassification.category
      };
    }
    return {
      ...conversationResult,
      reason: `[CONV] ${conversationResult.reason} \u2190 msg: ${msgClassification.category}`,
      category: msgClassification.category
    };
  }
  function seedConversationScore(phone, voteClass, status) {
    if (!phone) return;
    const key = _normalizePhoneKey(phone);
    let seedCategory;
    if (status === "invalido") {
      seedCategory = "pide_dinero";
    } else if (voteClass === "duro") {
      seedCategory = "apoyo_genuino";
    } else if (voteClass === "blando") {
      seedCategory = "apoyo_condicional";
    } else if (voteClass === "flotante") {
      seedCategory = "indeciso";
    } else {
      seedCategory = "indeciso";
    }
    const baseWeight = CATEGORY_WEIGHTS[seedCategory] ?? 0;
    const now = Date.now();
    const signals = [
      { category: seedCategory, weight: baseWeight, confidence: 1, ts: now - 1e3 },
      { category: seedCategory, weight: baseWeight, confidence: 1, ts: now }
    ];
    if (!_state.has(key) && _state.size >= PHONE_MAX_ENTRIES) {
      const oldest = _state.keys().next().value;
      _state.delete(oldest);
    }
    _state.set(key, { signals });
    _persistImmediate();
  }
  function recordSignalRaw(phone, category, confidence, ts) {
    if (!phone || !category) return false;
    const key = _normalizePhoneKey(phone);
    if (_state.has(key)) return false;
    const baseWeight = CATEGORY_WEIGHTS[category] ?? 0;
    if (baseWeight === 0) return false;
    if (_state.size >= PHONE_MAX_ENTRIES) {
      const oldest = _state.keys().next().value;
      _state.delete(oldest);
    }
    if (!_state.has(key)) {
      _state.set(key, { signals: [] });
    }
    const entry = _state.get(key);
    const signal = {
      category,
      weight: baseWeight,
      confidence,
      ts
      // timestamp original — decay calculado contra Date.now() al leer
    };
    entry.signals.push(signal);
    if (entry.signals.length > SIGNAL_MAX_PER_PHONE) {
      entry.signals.shift();
    }
    return true;
  }
  function flushScorerStorage() {
    _persistImmediate();
  }
  function _getTopCategory(signals, now, sign) {
    let best = null;
    let bestW = 0;
    for (const sig of signals) {
      const w = sig.weight * sig.confidence * decayFactor(now - sig.ts);
      const relevant = sign === "positive" ? w > 0 : w < 0;
      if (relevant && Math.abs(w) > Math.abs(bestW)) {
        bestW = w;
        best = sig.category;
      }
    }
    return best || "desconocido";
  }

  // src/background/gemini-fallback.js
  var _conversationHistory = /* @__PURE__ */ new Map();
  var CONV_HISTORY_MAX_PER_PHONE = 5;
  var CONV_HISTORY_MAX_PHONES = 300;
  var GEMINI_CONFIDENCE_THRESHOLD = 0.85;
  function recordConversation(phone, text, direction) {
    if (!phone || !text) return;
    const key = phone;
    if (!_conversationHistory.has(key)) {
      if (_conversationHistory.size >= CONV_HISTORY_MAX_PHONES) {
        const oldest = _conversationHistory.keys().next().value;
        _conversationHistory.delete(oldest);
      }
      _conversationHistory.set(key, []);
    }
    const history = _conversationHistory.get(key);
    history.push({ text: text.slice(0, 300), ts: Date.now(), direction });
    if (history.length > CONV_HISTORY_MAX_PER_PHONE) history.shift();
  }
  function getConversationContext(phone) {
    if (!phone) return "";
    const history = _conversationHistory.get(phone);
    if (!history || history.length === 0) return "";
    return history.map((h) => `[${h.direction === "in" ? "Votante" : "Operador"}]: ${h.text}`).join("\n");
  }
  function buildGeminiContext(phone) {
    const parts = [];
    const convScore = getConversationScore(phone);
    if (convScore) {
      const voteLabel = convScore.vote_class ? `${convScore.vote_class} (${convScore.status})` : `invalido`;
      parts.push(
        `[HISTORIAL ACUMULADO] Clasificaci\xF3n estable del contacto: ${voteLabel} | score neto: ${convScore.score.toFixed(2)} | conf: ${Math.round(convScore.confidence * 100)}%` + (convScore.reason ? ` | ${convScore.reason}` : "")
      );
    }
    const context = getConversationContext(phone);
    if (context) {
      parts.push(context);
    }
    return parts.join("\n");
  }
  async function classifyWithGeminiFallback(phone, text, fromJid) {
    const regexResult = classifyMessage(text);
    const adjusted = applyAdaptiveScoring(regexResult);
    if (adjusted && adjusted.confidence >= GEMINI_CONFIDENCE_THRESHOLD) {
      if (adjusted._boosted) {
        console.log("[WSPP AI] Regex confident (%.0f%%, boosted) \u2014 skipping Gemini", adjusted.confidence * 100);
      }
      return adjusted;
    }
    if (text.length < 15) return adjusted;
    try {
      const context = buildGeminiContext(phone || fromJid);
      const geminiResult = await apiFetch("/api/ai/classify", {
        method: "POST",
        body: JSON.stringify({
          text: text.slice(0, 2e3),
          conversation_context: context || void 0
        })
      });
      if (geminiResult.ok && geminiResult.classification) {
        const ai = geminiResult.classification;
        console.log(
          "%c  \u{1F916} GEMINI \u2192 %c" + ai.category + "%c conf: " + Math.round(ai.confidence * 100) + "%" + (geminiResult.cached ? " (cached)" : ""),
          "color:#a855f7;font-weight:700",
          "color:#FFC800;font-weight:900",
          "color:#7a95aa"
        );
        if (adjusted && adjusted.confidence >= 0.5) {
          if (ai.confidence > adjusted.confidence) {
            ai.reason = `AI: ${ai.reason} (regex: ${adjusted.category} @ ${Math.round(adjusted.confidence * 100)}%)`;
            ai.category = `ai_${ai.category}`;
            return ai;
          }
          if (adjusted.vote_class === ai.vote_class) {
            adjusted.confidence = Math.min(0.95, adjusted.confidence + 0.1);
            adjusted.reason += ` [AI confirms: ${ai.category}]`;
          }
          return adjusted;
        }
        if (ai.confidence >= 0.5 && ai.vote_class) {
          ai.category = `ai_${ai.category}`;
          return ai;
        }
      }
    } catch (err) {
      console.warn("[WSPP AI] Gemini fallback error:", err.message || err);
    }
    return adjusted;
  }

  // src/background/message-aggregator.js
  var _msgBuffer = /* @__PURE__ */ new Map();
  var MSG_BUFFER_WINDOW_MS = 12e3;
  var MSG_BUFFER_MAX_ENTRIES = 200;
  var MSG_BUFFER_MAX_TEXTS = 20;
  var MSG_BUFFER_SUPERSEDED = Object.freeze({ __superseded: true });
  function bufferMessage(phone, text) {
    if (_msgBuffer.size >= MSG_BUFFER_MAX_ENTRIES && !_msgBuffer.has(phone)) {
      const oldestKey = _msgBuffer.keys().next().value;
      const oldest = _msgBuffer.get(oldestKey);
      if (oldest) {
        clearTimeout(oldest.timer);
        const aggregated = oldest.texts.join(" ");
        _msgBuffer.delete(oldestKey);
        if (oldest.resolve) oldest.resolve(aggregated);
      }
    }
    return new Promise((resolve) => {
      const existing = _msgBuffer.get(phone);
      if (existing) {
        if (existing.texts.length < MSG_BUFFER_MAX_TEXTS) {
          existing.texts.push(text);
        }
        clearTimeout(existing.timer);
        if (existing.resolve) existing.resolve(MSG_BUFFER_SUPERSEDED);
        existing.resolve = resolve;
        existing.timer = setTimeout(() => {
          const aggregated = existing.texts.join(" ");
          _msgBuffer.delete(phone);
          resolve(aggregated);
        }, MSG_BUFFER_WINDOW_MS);
      } else {
        const entry = {
          texts: [text],
          resolve,
          timer: setTimeout(() => {
            _msgBuffer.delete(phone);
            resolve(text);
          }, MSG_BUFFER_WINDOW_MS)
        };
        _msgBuffer.set(phone, entry);
      }
    });
  }
  async function classifyWithAggregation(phone, text, fromJid) {
    if (!text) return null;
    if (text.length > 80) {
      return classifyWithGeminiFallback(phone, text, fromJid);
    }
    const bufferKey = phone || fromJid;
    if (!bufferKey) return classifyWithGeminiFallback(phone, text, fromJid);
    const aggregated = await bufferMessage(bufferKey, text);
    if (aggregated === MSG_BUFFER_SUPERSEDED) return MSG_BUFFER_SUPERSEDED;
    if (!aggregated) return null;
    return classifyWithGeminiFallback(phone, aggregated, fromJid);
  }

  // src/background/spam-detector.js
  var _outgoingLog = [];
  var SPAM_LOG_MAX = 500;
  var SPAM_WINDOW_SEC = 1200;
  var SPAM_CHECK_INTERVAL_MS = 3e4;
  var SPAM_REPORT_INTERVAL_MS = 3e5;
  var SPAM_MAX_BURST_PER_MIN = 20;
  var SPAM_REPETITION_WARN = 0.4;
  var SPAM_REPETITION_CRIT = 0.7;
  var SPAM_MIN_INTERVAL_SEC = 3;
  var ALERT_HISTORY_KEY = "wspp_spam_alerts";
  var ALERT_HISTORY_MAX = 50;
  var _lastAlertTs = /* @__PURE__ */ new Map();
  function _shouldAlert(ownNumber, level) {
    const key = ownNumber || "global";
    const m = _lastAlertTs.get(key) || {};
    const minGap = level === "critical" ? 2e4 : level === "high" ? 45e3 : 12e4;
    const now = Date.now();
    if ((m[level] || 0) + minGap > now) return false;
    m[level] = now;
    _lastAlertTs.set(key, m);
    return true;
  }
  var _numberRisk = /* @__PURE__ */ new Map();
  function _updateNumberRisk(ownNumber, level, score) {
    const key = ownNumber || "global";
    _numberRisk.set(key, { level, score, ts: Date.now() });
    const obj = {};
    for (const [k, v] of _numberRisk.entries()) obj[k] = v;
    chrome.storage.local.set({ wspp_spam_risk: obj });
  }
  function _persistAlert(ownNumber, result) {
    chrome.storage.local.get([ALERT_HISTORY_KEY], (data) => {
      const history = data[ALERT_HISTORY_KEY] || [];
      history.unshift({
        ts: Date.now(),
        own_number: ownNumber || null,
        level: result.risk_level,
        score: result.risk_score,
        warnings: result.warnings,
        msg_count: result.message_count
      });
      if (history.length > ALERT_HISTORY_MAX) history.length = ALERT_HISTORY_MAX;
      chrome.storage.local.set({ [ALERT_HISTORY_KEY]: history });
    });
  }
  function _broadcastToWaTabs(result) {
    chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: "WSPP_SPAM_WARNING",
            payload: result
          }).catch(() => {
          });
        }
      }
    });
  }
  function recordOutgoing(text, timestamp, toPhone, ownNumber) {
    if (!text) return;
    _outgoingLog.push({
      text: text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500),
      timestamp,
      to_phone: toPhone || null,
      own_number: ownNumber || null
    });
    while (_outgoingLog.length > SPAM_LOG_MAX) _outgoingLog.shift();
  }
  function localSpamCheck(forceNumber) {
    const cutoff = Math.floor(Date.now() / 1e3) - SPAM_WINDOW_SEC;
    const all = _outgoingLog.filter((m) => m.timestamp >= cutoff);
    const recent = forceNumber ? all.filter((m) => !m.own_number || m.own_number === forceNumber) : all;
    if (recent.length < 5) return null;
    const warnings = [];
    const actions = [];
    let riskScore = 0;
    const texts = recent.map((m) => m.text);
    const unique = new Set(texts).size;
    const repetitionRate = 1 - unique / texts.length;
    if (repetitionRate >= SPAM_REPETITION_CRIT) {
      riskScore += 40;
      warnings.push(`${Math.round(repetitionRate * 100)}% mensajes id\xE9nticos en 20 min`);
      actions.push("Vari\xE1 el contenido \u2014 WA detecta copy-paste masivo");
    } else if (repetitionRate >= SPAM_REPETITION_WARN) {
      riskScore += 20;
      warnings.push(`${Math.round(repetitionRate * 100)}% mensajes repetidos`);
      actions.push("Personaliz\xE1 con {{nombre}} o {{saludo}}");
    }
    const now = Math.floor(Date.now() / 1e3);
    const last60s = recent.filter((m) => m.timestamp >= now - 60);
    const last5min = recent.filter((m) => m.timestamp >= now - 300);
    if (last60s.length > SPAM_MAX_BURST_PER_MIN) {
      riskScore += 40;
      warnings.push(`${last60s.length} mensajes en el \xFAltimo minuto`);
      actions.push("DETENER env\xEDos ahora \u2014 esper\xE1 al menos 3 minutos");
    } else if (last60s.length > 12) {
      riskScore += 20;
      warnings.push(`${last60s.length} msgs/min (l\xEDmite recomendado: 12)`);
      actions.push("Reduc\xED velocidad \u2014 aument\xE1 los delays entre mensajes");
    }
    if (recent.length >= 4) {
      const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
      let tooFast = 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].timestamp - sorted[i - 1].timestamp < SPAM_MIN_INTERVAL_SEC) tooFast++;
      }
      const fastRate = tooFast / (sorted.length - 1);
      if (fastRate > 0.5) {
        riskScore += 20;
        warnings.push(`${Math.round(fastRate * 100)}% mensajes enviados en < ${SPAM_MIN_INTERVAL_SEC}s de distancia`);
        actions.push(`Esper\xE1 al menos ${SPAM_MIN_INTERVAL_SEC + 2}s entre cada mensaje`);
      } else if (fastRate > 0.3) {
        riskScore += 8;
      }
    }
    const textToContacts = /* @__PURE__ */ new Map();
    for (const m of recent) {
      if (!m.to_phone) continue;
      if (!textToContacts.has(m.text)) textToContacts.set(m.text, /* @__PURE__ */ new Set());
      textToContacts.get(m.text).add(m.to_phone);
    }
    let maxBroadcast = 0;
    const repeatedTexts = [];
    for (const [text, contacts] of textToContacts) {
      if (contacts.size > maxBroadcast) maxBroadcast = contacts.size;
      if (contacts.size > 2) repeatedTexts.push({ text: text.slice(0, 120), count: contacts.size });
    }
    repeatedTexts.sort((a, b) => b.count - a.count);
    if (maxBroadcast > 15) {
      riskScore += 30;
      warnings.push(`Mismo texto enviado a ${maxBroadcast} contactos distintos`);
      actions.push("WA detecta broadcasting \u2014 us\xE1 variables de personalizaci\xF3n");
    } else if (maxBroadcast > 8) {
      riskScore += 12;
      warnings.push(`Mismo texto a ${maxBroadcast} contactos`);
    }
    if (last5min.length > 60) {
      riskScore += 15;
      warnings.push(`${last5min.length} mensajes en los \xFAltimos 5 min`);
      actions.push("Tom\xE1 una pausa de 10 minutos");
    }
    riskScore = Math.min(100, riskScore);
    const risk_level = riskScore >= 70 ? "critical" : riskScore >= 45 ? "high" : riskScore >= 25 ? "medium" : "low";
    const cooldown_sec = risk_level === "critical" ? 180 : risk_level === "high" ? 90 : risk_level === "medium" ? 30 : 0;
    return {
      risk_level,
      risk_score: riskScore,
      warnings,
      actions,
      cooldown_sec,
      message_count: recent.length,
      own_number: recent[recent.length - 1]?.own_number || null,
      repeated_texts: repeatedTexts.slice(0, 5),
      // top 5 textos más repetidos
      unique_rate: texts.length > 0 ? Math.round(unique / texts.length * 100) : 100
    };
  }
  function checkSpamNow(ownNumber) {
    const result = localSpamCheck(ownNumber);
    if (!result || result.risk_level === "low") return result;
    const ownNum = ownNumber || result.own_number;
    _updateNumberRisk(ownNum, result.risk_level, result.risk_score);
    if (_shouldAlert(ownNum, result.risk_level)) {
      console.warn(
        "[WSPP SPAM]",
        result.risk_level.toUpperCase(),
        "| Score:",
        result.risk_score,
        "| Warnings:",
        result.warnings.join(" | ")
      );
      _broadcastToWaTabs(result);
      if (result.risk_level !== "low") _persistAlert(ownNum, result);
    }
    return result;
  }
  var _periodicCheckSeq = 0;
  setInterval(() => {
    _periodicCheckSeq++;
    const result = localSpamCheck();
    if (!result || result.risk_level === "low") return;
    const ownNum = result.own_number;
    _updateNumberRisk(ownNum, result.risk_level, result.risk_score);
    if (_shouldAlert(ownNum, result.risk_level)) {
      console.warn(
        "[WSPP SPAM periodic]",
        result.risk_level.toUpperCase(),
        "| Score:",
        result.risk_score,
        "| seq:",
        _periodicCheckSeq
      );
      _broadcastToWaTabs(result);
      _persistAlert(ownNum, result);
    }
  }, SPAM_CHECK_INTERVAL_MS);
  setInterval(() => {
    if (_outgoingLog.length < 5) return;
    const cutoff = Math.floor(Date.now() / 1e3) - 300;
    const recent = _outgoingLog.filter((m) => m.timestamp >= cutoff);
    if (recent.length < 3) return;
    apiFetch("/api/ai/spam-check", {
      method: "POST",
      body: JSON.stringify({
        own_number: recent[0]?.own_number || void 0,
        messages: recent.map((m) => ({
          text: m.text,
          timestamp: m.timestamp,
          to_phone: m.to_phone || void 0
        }))
      })
    }).then((res) => {
      if (!res.ok) return;
      const ownNum = res.own_number || recent[0]?.own_number || null;
      if (res.risk_level && res.risk_level !== "low") {
        console.warn(
          "[WSPP SPAM-SERVER]",
          res.risk_level.toUpperCase(),
          "| Score:",
          res.risk_score,
          "| Warnings:",
          (res.warnings || []).join(" | ")
        );
        _updateNumberRisk(ownNum, res.risk_level, res.risk_score);
        const serverResult = {
          risk_level: res.risk_level,
          risk_score: res.risk_score,
          warnings: res.warnings || [],
          actions: res.recommendations || [],
          cooldown_sec: res.risk_level === "critical" ? 180 : res.risk_level === "high" ? 90 : 30,
          message_count: recent.length,
          own_number: ownNum,
          source: "server"
          // lets overlay indicate this is server-validated
        };
        if (_shouldAlert(ownNum, res.risk_level)) {
          _broadcastToWaTabs(serverResult);
          _persistAlert(ownNum, serverResult);
        }
      } else if (res.risk_level === "low") {
        _updateNumberRisk(ownNum, "low", 0);
      }
    }).catch(() => {
    });
  }, SPAM_REPORT_INTERVAL_MS);

  // src/background/classification-reporter.js
  function reportClassificationEvent(data) {
    apiFetch("/api/validacion/classification-event", {
      method: "POST",
      body: JSON.stringify(data)
    }).then((res) => {
      if (res.ok) {
        console.log("[WSPP CLASSIFY-EVENT] \u2713 Reportado:", data.source, data.category);
      } else {
        console.warn("[WSPP CLASSIFY-EVENT] Error:", res.message || res.error);
      }
    }).catch((err) => {
      console.warn("[WSPP CLASSIFY-EVENT] Fetch error:", err.message);
    });
  }

  // src/background/received-handler.js
  var _phoneQueue = /* @__PURE__ */ new Map();
  function enqueueForPhone(phone, fn) {
    const key = phone || "__unknown__";
    const prev = _phoneQueue.get(key) || Promise.resolve();
    const next = prev.then(fn).catch(fn);
    _phoneQueue.set(key, next);
    next.finally(() => {
      if (_phoneQueue.get(key) === next) _phoneQueue.delete(key);
    });
    return next;
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "WSPP_RECEIVED") return;
    const { phone, contact_name, preview, own_number, msg_type, timestamp, from_jid } = msg.payload;
    const _who = contact_name || phone || (from_jid ? `@lid:${from_jid.split("@")[0]?.slice(-6)}` : "???");
    const _previewShort = (preview || "").slice(0, 80);
    console.log(
      "\n%c \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 MENSAJE ENTRANTE \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ",
      "background:#0e2640;color:#FFC800;font-weight:900;padding:4px 12px;border-radius:4px;font-size:13px"
    );
    console.log(
      "%c De: %c" + _who + "%c  |  Tipo: " + msg_type,
      "color:#7a95aa",
      "color:#e9eef3;font-weight:700",
      "color:#7a95aa"
    );
    if (_previewShort) {
      console.log('%c  \u{1F4E9} "' + _previewShort + (preview && preview.length > 80 ? '\u2026"' : '"'), "color:#5a8aaa;font-style:italic");
    }
    recordConversation(phone || from_jid, preview, "in");
    enqueueForPhone(phone || from_jid, async () => {
      const eventBody = {
        type: "message_received",
        phone: phone || void 0,
        contact_name: contact_name || void 0,
        own_number: own_number || void 0,
        preview: preview || void 0,
        detected_at: (timestamp || Math.floor(Date.now() / 1e3)) * 1e3
      };
      apiFetch("/api/cms/extension-event", {
        method: "POST",
        body: JSON.stringify(eventBody)
      }).then((j) => {
        if (j.filtered) {
          console.log("%c  \u{1F4E1} CMS: filtrado (own_number no registrado)", "color:#555");
        } else if (j.matched) {
          console.log("%c  \u{1F4E1} CMS: match con contacto " + j.contact_id, "color:#3b82f6");
        }
      });
      reportConversation(from_jid, own_number, "in", preview, phone, contact_name);
      chrome.storage.local.get(["wspp_received_count"], (data) => {
        chrome.storage.local.set({ wspp_received_count: (data.wspp_received_count ?? 0) + 1 });
      });
      const rawClassification = await classifyWithAggregation(phone, preview, from_jid);
      if (rawClassification === MSG_BUFFER_SUPERSEDED) {
        console.log("%c  \u23ED\uFE0F  Mensaje superseded por agregaci\xF3n \u2014 esperando buffer completo", "color:#7a95aa");
        sendResponse({ validation: null, superseded: true });
        return;
      }
      const phoneKey = phone || from_jid;
      const classification = mergeWithConversationScore(phoneKey, rawClassification);
      if (rawClassification && classification) {
        const confPct = Math.round(classification.confidence * 100);
        const confColor = confPct >= 85 ? "#22c55e" : confPct >= 70 ? "#f59e0b" : "#ef5350";
        const scoreOverride = classification.score !== void 0;
        console.log(
          "%c  \u{1F9E0} CLASIFICADO \u2192 %c" + classification.category + "%c  |  vote: %c" + (classification.vote_class || "invalido") + "%c  |  status: %c" + classification.status + "%c  |  conf: %c" + confPct + "%" + (scoreOverride ? `%c  |  score: %c${classification.score.toFixed(2)}` : ""),
          "color:#06b6d4;font-weight:700",
          "color:#FFC800;font-weight:900",
          "color:#555",
          "color:" + (classification.vote_class === "duro" ? "#22c55e" : classification.vote_class === "blando" ? "#f59e0b" : classification.vote_class === "flotante" ? "#a855f7" : "#ef5350") + ";font-weight:900",
          "color:#555",
          "color:#3b82f6;font-weight:700",
          "color:#555",
          "color:" + confColor + ";font-weight:900",
          ...scoreOverride ? ["color:#555", "color:#a855f7;font-weight:700"] : []
        );
        console.log("%c     Raz\xF3n: " + classification.reason, "color:#7a95aa");
        if (rawClassification && rawClassification.vote_class !== classification.vote_class) {
          console.log(
            "%c     \u21B3 Scorer: %c" + (classification.vote_class || "invalido") + "%c vs msg raw: %c" + (rawClassification.vote_class || "invalido"),
            "color:#a855f7",
            "color:#FFC800;font-weight:700",
            "color:#7a95aa",
            "color:#ef5350;font-weight:700"
          );
        }
      } else if (!classification) {
        console.log("%c  \u{1F9E0} Sin clasificaci\xF3n (mensaje muy corto o sin patrones)", "color:#555");
      }
      const validation = await getCachedValidation(phone);
      if (validation) {
        console.log(
          "%c  \u{1F50D} MATCH VALIDACI\xD3N \u2192 %c" + validation.nombre + "%c  |  tel: " + validation.telefono + "  |  estado: %c" + validation.status + "%c  |  vote: %c" + (validation.vote_class || "\u2014"),
          "color:#22c55e;font-weight:700",
          "color:#e9eef3;font-weight:900",
          "color:#555",
          "color:#3b82f6;font-weight:700",
          "color:#555",
          "color:#FFC800;font-weight:700"
        );
      } else {
        console.log("%c  \u{1F50D} Sin match en validaci\xF3n" + (phone ? " (tel: " + phone + ")" : " (sin tel\xE9fono)"), "color:#555");
      }
      let result = { validation: null };
      if (validation) {
        const canAutoClassify = classification && classification.confidence >= 0.7 && !classification._fromConversationHistory && // no escribir al backend si es solo historial acumulado sin mensaje nuevo
        (validation.status === "contactado" || validation.status === "respondido" || validation.status === "pendiente");
        const hasVoteClass = validation.vote_class && validation.vote_class !== "";
        const currentVoteClass = validation.vote_class || "";
        const currentStatus = validation.status || "";
        const newVoteClass = classification?.vote_class || "";
        const newStatus = classification?.status || "";
        const classChanged = currentVoteClass !== newVoteClass || currentStatus !== newStatus;
        const shouldClassify = canAutoClassify && classChanged;
        if (shouldClassify) {
          if (!validation.claimed_by) {
            await claimValidation(validation.id);
          }
          if (validation.status === "pendiente") {
            await updateValidationStatus(validation.id, "contactado", "", null);
          }
          const autoNote = `[AUTO] ${classification.category}: ${classification.reason} (conf: ${classification.confidence})`;
          const updateRes = await updateValidationStatus(
            validation.id,
            classification.status,
            classification.vote_class,
            autoNote
          );
          if (updateRes.ok && updateRes.item) {
            invalidateCache(phone);
            result.validation = updateRes.item;
            result.classified = true;
            result.classification = classification;
            console.log(
              "%c  \u2705 AUTO-CLASIFICADO en backend \u2192 %c" + classification.vote_class + " / " + classification.status,
              "background:#0e2640;color:#22c55e;font-weight:900;padding:2px 8px;border-radius:3px",
              "color:#FFC800;font-weight:900"
            );
            reportClassificationEvent({
              phone: phone || void 0,
              contact_name: contact_name || void 0,
              message_text: (preview || "").slice(0, 2e3),
              validation_id: validation.id,
              source: "auto",
              category: classification.category,
              vote_class: classification.vote_class,
              status: classification.status,
              confidence: classification.confidence,
              reason: classification.reason
            });
          } else {
            result.validation = validation;
            console.log("%c  \u274C Error aplicando clasificaci\xF3n: " + (updateRes.error || updateRes.message), "color:#ef5350;font-weight:700");
          }
        } else {
          if (validation.status === "contactado" && !classification) {
            await updateValidationStatus(validation.id, "respondido", "", null);
            invalidateCache(phone);
            const updated = await getCachedValidation(phone);
            result.validation = updated || validation;
            console.log("%c  \u2197\uFE0F  Auto-transici\xF3n: contactado \u2192 respondido (sin clasificar)", "color:#3b82f6");
          } else {
            result.validation = validation;
            if (hasVoteClass) {
              console.log("%c  \u23ED\uFE0F  Ya clasificado como: " + validation.vote_class + " \u2014 no se sobreescribe", "color:#7a95aa");
            } else if (classification && classification.confidence < 0.7) {
              console.log("%c  \u23ED\uFE0F  Confianza baja (" + Math.round(classification.confidence * 100) + "%) \u2014 no auto-clasifica", "color:#f59e0b");
            }
          }
          result.classified = false;
        }
      } else if (classification) {
        result.classification = classification;
        reportClassificationEvent({
          phone: phone || void 0,
          contact_name: contact_name || void 0,
          message_text: (preview || "").slice(0, 2e3),
          source: "auto",
          category: classification.category,
          vote_class: classification.vote_class,
          status: classification.status,
          confidence: classification.confidence,
          reason: classification.reason
        });
      }
      console.log(
        "%c \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 \n",
        "background:#0e2640;color:#334d63;padding:2px 12px;border-radius:4px"
      );
      sendResponse(result);
    });
    return true;
  });
  function reportConversation(jid, ownNumber, direction, text, phone, contactName) {
    if (!jid || !ownNumber) return;
    const body = {
      jid,
      own_number: ownNumber,
      direction,
      text: (text || "").slice(0, 2e3),
      phone: phone || void 0,
      contact_name: contactName || void 0,
      timestamp: Date.now()
    };
    apiFetch("/api/conversations/message", {
      method: "POST",
      body: JSON.stringify(body)
    }).then((j) => {
      if (j.ok) {
        console.log(
          `[CONV] \u2713 ${direction} \u2192 conv #${j.conversation_id}`,
          j.is_new ? "(nueva)" : `(msg #${j.message_count})`,
          j.auto_classified ? "\u{1F916} clasificada" : ""
        );
      } else {
        console.warn("[CONV] \u2717", j.error || j.message || j.code);
      }
    }).catch((err) => {
      console.warn("[CONV] error:", err?.message || err);
    });
  }

  // src/background/chat-opened-handler.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "WSPP_CHAT_OPENED") return;
    const { phone, contact_name } = msg.payload;
    (async () => {
      const validation = await getCachedValidation(phone);
      sendResponse({ validation: validation || null });
    })();
    return true;
  });

  // src/background/classify-handler.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "WSPP_CLASSIFY") return;
    const { validation_id, vote_class, status, original_category } = msg.payload;
    (async () => {
      try {
        await claimValidation(validation_id);
        const currentValidation = await getCachedValidation(msg.payload._phone);
        const res = await updateValidationStatus(validation_id, status, vote_class, "[MANUAL] Clasificado desde extensi\xF3n WA");
        if (res.ok && res.item) {
          invalidateCache(res.item.telefono);
          if (res.item.telefono || msg.payload._phone) {
            seedConversationScore(
              res.item.telefono || msg.payload._phone,
              vote_class,
              status
            );
          }
          if (original_category || currentValidation && currentValidation.vote_class) {
            const prevCategory = original_category || currentValidation?.vote_class || "";
            const wasCorrect = prevCategory === vote_class;
            recordCorrection(prevCategory, vote_class, wasCorrect);
          }
          reportClassificationEvent({
            phone: res.item.telefono || void 0,
            contact_name: res.item.nombre || void 0,
            validation_id,
            source: "manual",
            category: "manual_override",
            vote_class,
            status,
            confidence: 1,
            reason: "Clasificaci\xF3n manual desde extensi\xF3n WA"
          });
          sendResponse({ ok: true, item: res.item });
        } else {
          sendResponse({ ok: false, error: res.message || "Error al clasificar" });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });

  // src/background/audio-catalog-handlers.js
  var _audioCatalogCache = null;
  var _audioCatalogCacheTs = 0;
  var CATALOG_CACHE_TTL = 5 * 60 * 1e3;
  var _audioDataCache = /* @__PURE__ */ new Map();
  var AUDIO_DATA_CACHE_MAX = 20;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "FETCH_AUDIO_CATALOG") return;
    (async () => {
      try {
        const now = Date.now();
        if (_audioCatalogCache && now - _audioCatalogCacheTs < CATALOG_CACHE_TTL) {
          sendResponse({ ok: true, items: _audioCatalogCache });
          return;
        }
        const result = await apiFetch("/api/audio-catalog");
        if (!result.ok) {
          const errDetail = result.error || result.message || "Failed to fetch catalog";
          console.error("[WSPP CATALOG] apiFetch failed:", errDetail, "| status:", result.status);
          sendResponse({ ok: false, error: errDetail });
          return;
        }
        _audioCatalogCache = result.items || [];
        _audioCatalogCacheTs = now;
        console.log("[WSPP CATALOG] Fetched", _audioCatalogCache.length, "items");
        sendResponse({ ok: true, items: _audioCatalogCache });
      } catch (err) {
        console.error("[WSPP CATALOG] Fetch error:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "GET_CATALOG_AUDIO") return;
    const audioId = msg.id;
    if (!audioId) {
      sendResponse({ ok: false, error: "Missing audio id" });
      return true;
    }
    (async () => {
      try {
        const cached = _audioDataCache.get(audioId);
        if (cached) {
          console.log("[WSPP CATALOG] Audio from cache:", audioId);
          sendResponse({ ok: true, ...cached });
          return;
        }
        const result = await apiFetch(`/api/audio-catalog/${audioId}`);
        if (!result.ok || !result.item?.audioBase64) {
          const errDetail = result.error || result.message || "Audio not available";
          console.error("[WSPP CATALOG] audio fetch failed:", audioId, errDetail, "| status:", result.status);
          sendResponse({ ok: false, error: errDetail });
          return;
        }
        const data = {
          audioBase64: result.item.audioBase64,
          mimeType: result.item.mimeType || "audio/ogg; codecs=opus",
          label: result.item.label,
          category: result.item.category
        };
        if (_audioDataCache.size >= AUDIO_DATA_CACHE_MAX) {
          const oldest = _audioDataCache.keys().next().value;
          _audioDataCache.delete(oldest);
        }
        _audioDataCache.set(audioId, data);
        console.log("[WSPP CATALOG] Audio fetched:", audioId, data.label);
        sendResponse({ ok: true, ...data });
      } catch (err) {
        console.error("[WSPP CATALOG] Get audio error:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "GENERATE_CATALOG_AUDIO") return;
    const itemId = msg.id;
    if (!itemId) {
      sendResponse({ ok: false, error: "Missing id" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch(`/api/audio-catalog/${itemId}/generate`, { method: "POST" });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Generation failed" });
          return;
        }
        _audioDataCache.delete(itemId);
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({ ok: true, id: itemId, audioSize: result.audioSize, durationMs: result.durationMs });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "UPDATE_CATALOG_SCRIPT") return;
    const { id: itemId, script_text } = msg;
    if (!itemId || !script_text) {
      sendResponse({ ok: false, error: "Missing id or script_text" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch(`/api/audio-catalog/${itemId}`, {
          method: "PUT",
          body: JSON.stringify({ script_text })
        });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Update failed" });
          return;
        }
        _audioDataCache.delete(itemId);
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({ ok: true, id: itemId, script_text });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "BUST_AUDIO_CACHE" && msg.id) {
      _audioDataCache.delete(msg.id);
      sendResponse({ ok: true });
      return true;
    }
    if (msg.type === "BUST_CATALOG_CACHE") {
      _audioCatalogCache = null;
      _audioCatalogCacheTs = 0;
      _categoriesCache = null;
      _categoriesCacheTs = 0;
      sendResponse({ ok: true });
      return true;
    }
  });
  var _categoriesCache = null;
  var _categoriesCacheTs = 0;
  var CATEGORIES_CACHE_TTL = 5 * 60 * 1e3;
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "FETCH_CATALOG_CATEGORIES") return;
    (async () => {
      try {
        const now = Date.now();
        if (_categoriesCache && now - _categoriesCacheTs < CATEGORIES_CACHE_TTL) {
          sendResponse({ ok: true, categories: _categoriesCache });
          return;
        }
        const result = await apiFetch("/api/audio-catalog-categories");
        if (!result.ok) {
          sendResponse({ ok: false, error: result.error || result.message || "Failed to fetch categories" });
          return;
        }
        _categoriesCache = result.categories || [];
        _categoriesCacheTs = now;
        console.log("[WSPP CATALOG] Fetched", _categoriesCache.length, "categories");
        sendResponse({ ok: true, categories: _categoriesCache });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "CREATE_CATALOG_CATEGORY") return;
    const { data } = msg;
    if (!data?.key || !data?.label) {
      sendResponse({ ok: false, error: "Missing key or label" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/audio-catalog-categories", {
          method: "POST",
          body: JSON.stringify(data)
        });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Create failed" });
          return;
        }
        _categoriesCache = null;
        _categoriesCacheTs = 0;
        sendResponse({ ok: true, category: result.category });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "DELETE_CATALOG_CATEGORY") return;
    const catId = msg.id;
    if (!catId) {
      sendResponse({ ok: false, error: "Missing id" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch(`/api/audio-catalog-categories/${catId}`, { method: "DELETE" });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Delete failed" });
          return;
        }
        _categoriesCache = null;
        _categoriesCacheTs = 0;
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({ ok: true, id: catId });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "DELETE_CATALOG_ITEM") return;
    const itemId = msg.id;
    if (!itemId) {
      sendResponse({ ok: false, error: "Missing id" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch(`/api/audio-catalog/${itemId}`, { method: "DELETE" });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Delete failed" });
          return;
        }
        _audioDataCache.delete(itemId);
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({ ok: true, id: itemId });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "CREATE_CATALOG_ITEM") return;
    const { data } = msg;
    if (!data?.label || !data?.script_text) {
      sendResponse({ ok: false, error: "Missing required fields (label, script_text)" });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/audio-catalog", {
          method: "POST",
          body: JSON.stringify({ ...data, auto_generate: true })
        });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Create failed" });
          return;
        }
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({
          ok: true,
          item: result.item ?? result,
          audio_generated: result.audio_generated ?? false,
          audioSize: result.audioSize,
          durationMs: result.durationMs,
          audio_error: result.audio_error
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });

  // src/background/sent-handler.js
  var DEDUP_WINDOW_MS = 600;
  var _sentDedup = /* @__PURE__ */ new Map();
  var SENT_DEDUP_MAX = 100;
  function makeSentDedupKey(own_number, timestamp) {
    return (own_number || "unk") + ":" + Math.floor((timestamp || 0) / 2);
  }
  function processSentEvent(payload, source) {
    const { phone, own_number, contact_name, timestamp, body: msgBody } = payload;
    const messageText = msgBody || "";
    chrome.storage.local.get(["wspp_count"], (data) => {
      const next = (parseInt(data.wspp_count, 10) || 0) + 1;
      chrome.storage.local.set({ wspp_count: next });
    });
    recordOutgoing(messageText || phone || "?", timestamp || Math.floor(Date.now() / 1e3), phone, own_number);
    recordConversation(phone, messageText || "(sent)", "out");
    if (phone || contact_name) {
      const eventBody = {
        type: "message_sent",
        phone: phone || void 0,
        contact_name: contact_name || void 0,
        own_number: own_number || void 0,
        detected_at: (timestamp || Math.floor(Date.now() / 1e3)) * 1e3
      };
      console.log(`[WSPP] \u2192 sent event (${source}):`, JSON.stringify(eventBody));
      apiFetch("/api/cms/extension-event", {
        method: "POST",
        body: JSON.stringify(eventBody)
      }).then((j) => {
        if (j.ok) console.log("[WSPP backend] \u2713", j.matched ? "matched" : j.filtered ? "filtered" : "ok");
        else console.warn("[WSPP backend] \u2717", j.error || j.message || j.code);
      });
    }
    const toJid = payload.to_jid;
    if (toJid) {
      reportConversation(toJid, own_number, "out", messageText || "(mensaje enviado)", phone, contact_name);
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "WSPP_SENT") return;
    const { phone, own_number, contact_name, timestamp } = msg.payload;
    const dedupKey = makeSentDedupKey(own_number, timestamp);
    const existing = _sentDedup.get(dedupKey);
    if (existing?.processed) {
      console.log("[WSPP DEDUP] WSPP_SENT dropped \u2014 already processed by WSPP_SENT_RICH");
      sendResponse({ ok: true, deduped: true });
      return;
    }
    if (_sentDedup.size >= SENT_DEDUP_MAX && !_sentDedup.has(dedupKey)) {
      const oldestKey = _sentDedup.keys().next().value;
      const oldest = _sentDedup.get(oldestKey);
      if (oldest?.timer) clearTimeout(oldest.timer);
      _sentDedup.delete(oldestKey);
    }
    const entry = {
      payload: msg.payload,
      processed: false,
      timer: setTimeout(() => {
        const e = _sentDedup.get(dedupKey);
        if (e && !e.processed) {
          e.processed = true;
          processSentEvent(e.payload, "DOM");
          setTimeout(() => _sentDedup.delete(dedupKey), 2e3);
        }
      }, DEDUP_WINDOW_MS)
    };
    _sentDedup.set(dedupKey, entry);
    chrome.storage.local.get(["wspp_count"], (data) => {
      sendResponse({ ok: true, count: data.wspp_count ?? 0 });
    });
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== "WSPP_SENT_RICH") return;
    const { phone, own_number, contact_name, to_jid, timestamp } = msg.payload;
    const dedupKey = makeSentDedupKey(own_number, timestamp);
    const existing = _sentDedup.get(dedupKey);
    if (existing?.processed) {
      console.log("[WSPP DEDUP] WSPP_SENT_RICH arrived late \u2014 DOM event already processed");
      if (phone && !existing.payload?.phone) {
        console.log("[WSPP DEDUP] RICH has phone, DOM didn't \u2014 sending supplemental event");
        processSentEvent(msg.payload, "RICH-supplement");
      }
      sendResponse({ ok: true, deduped: true });
      return;
    }
    if (existing?.timer) {
      clearTimeout(existing.timer);
      console.log(
        "[WSPP DEDUP] WSPP_SENT_RICH supersedes buffered WSPP_SENT",
        "| DOM phone:",
        existing.payload?.phone ?? "null",
        "| RICH phone:",
        phone ?? "null"
      );
    }
    _sentDedup.set(dedupKey, { processed: true, payload: msg.payload });
    processSentEvent(msg.payload, "RICH");
    setTimeout(() => _sentDedup.delete(dedupKey), 3e3);
    sendResponse({ ok: true, source: "rich" });
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "WSPP_VALIDATOR_CONV_SENT") return;
    const { text, phone, own_number, timestamp } = msg.payload || {};
    recordOutgoing(text || phone || "?", timestamp || Math.floor(Date.now() / 1e3), phone, own_number);
    sendResponse({ ok: true });
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "WSPP_SPAM_CHECK_NOW") return;
    const result = checkSpamNow(msg.own_number || null);
    sendResponse({ result: result || null });
    return true;
  });
  chrome.tabs.onUpdated?.addListener((tabId, info, tab) => {
    if (info.status === "complete" && tab.url?.includes("web.whatsapp.com")) {
      chrome.storage.local.set({ wspp_wa_active: true });
    }
  });
  chrome.tabs.onRemoved?.addListener(() => {
    chrome.tabs.query({ url: "*://web.whatsapp.com/*" }, (tabs) => {
      chrome.storage.local.set({ wspp_wa_active: tabs.length > 0 });
    });
  });

  // src/background/blast-handlers.js
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_GET_FORM_CONTACTS") return;
    const { limit = 200, offset = 0, status = "nuevo", district, own_number } = msg;
    const qs = new URLSearchParams({ limit, offset, status });
    if (district) qs.set("district", district);
    (async () => {
      try {
        const result = await apiFetch(`/api/blast/form-contacts?${qs}`, {
          headers: own_number ? { "x-wa-number": own_number } : {}
        });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Failed" });
          return;
        }
        console.log(`[WSPP BLAST] form-contacts: ${result.contacts?.length} / ${result.total}`);
        sendResponse({ ok: true, contacts: result.contacts, total: result.total });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_MARK_HABLADO") return;
    const { ids, no_wa_ids, own_number } = msg;
    if (!ids?.length && !no_wa_ids?.length) {
      sendResponse({ ok: true, updated: 0 });
      return true;
    }
    (async () => {
      try {
        const body = { ids: ids ?? [] };
        if (no_wa_ids?.length) body.no_wa_ids = no_wa_ids;
        const result = await apiFetch("/api/blast/mark-hablado", {
          method: "PUT",
          headers: own_number ? { "x-wa-number": own_number } : {},
          body: JSON.stringify(body)
        });
        console.log(`[WSPP BLAST] marked hablado: ${result.updated} | no_wa: ${no_wa_ids?.length ?? 0}`);
        sendResponse({ ok: result.ok, updated: result.updated || 0, error: result.error });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_RETRY_NO_WA") return;
    const { own_number } = msg;
    apiFetch("/api/blast/retry-no-wa", {
      method: "POST",
      headers: own_number ? { "x-wa-number": own_number } : {},
      body: JSON.stringify({})
    }).then((r) => {
      if (r.reset > 0) console.log(`[WSPP BLAST] retry-no-wa: ${r.reset} contactos reseteados`);
    }).catch(() => {
    });
    sendResponse({ ok: true });
    return false;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_GET_CONTACTS") return;
    const { limit = 200, offset = 0, own_number } = msg;
    const qs = new URLSearchParams({ limit, offset });
    if (own_number) qs.set("own_number", own_number);
    (async () => {
      try {
        const result = await apiFetch(`/api/blast/contacts?${qs}`);
        sendResponse(result.ok ? { ok: true, contacts: result.contacts, total: result.total } : { ok: false, error: result.message || result.error });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_REPORT") return;
    const { results } = msg;
    if (!results?.length) {
      sendResponse({ ok: true, saved: 0 });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/blast/report", {
          method: "POST",
          body: JSON.stringify({ results })
        });
        sendResponse({ ok: result.ok, saved: result.saved || 0 });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_GET_STATS") return;
    (async () => {
      try {
        const result = await apiFetch("/api/blast/stats");
        sendResponse({ ok: result.ok, stats: result.stats || {}, by_number: result.by_number || {} });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_GET_NUMBER_CONFIG") return;
    const { own_number } = msg;
    if (!own_number) {
      sendResponse({ ok: true, config: null });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/blast/number-config", {
          headers: { "x-wa-number": own_number }
        });
        sendResponse({ ok: result.ok, config: result.config || null });
      } catch (err) {
        sendResponse({ ok: false, config: null, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "BLAST_GET_NUMBER_HEALTH") return;
    const { own_number } = msg;
    if (!own_number) {
      sendResponse({ ok: false, error: "No own_number", can_send: false });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/blast/number-health", {
          headers: { "x-wa-number": own_number }
        });
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: err.message, can_send: true });
      }
    })();
    return true;
  });

  // src/background/wa-validator-handlers.js
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "WA_VALIDATOR_GET_CONTACTS") return;
    const { limit = 500, offset = 0 } = msg;
    const qs = new URLSearchParams({ limit, offset, pending: "true" });
    (async () => {
      try {
        const result = await apiFetch(`/api/wa-validator/contacts?${qs}`);
        sendResponse(result.ok ? { ok: true, contacts: result.contacts, total: result.total } : { ok: false, error: result.message || result.error });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "WA_VALIDATOR_SAVE_RESULTS") return;
    const { results, own_number } = msg;
    if (!results?.length) {
      sendResponse({ ok: true, updated: 0 });
      return true;
    }
    (async () => {
      try {
        const result = await apiFetch("/api/wa-validator/results", {
          method: "POST",
          headers: own_number ? { "x-wa-number": own_number } : {},
          body: JSON.stringify({ results })
        });
        console.log(`[WA VALIDATOR] saved ${result.updated} results`);
        sendResponse({ ok: result.ok, updated: result.updated || 0 });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "WA_VALIDATOR_GET_STATS") return;
    (async () => {
      try {
        const result = await apiFetch("/api/wa-validator/stats");
        sendResponse({ ok: result.ok, summary: result.summary, by_brigadista: result.by_brigadista });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  });

  // src/background/scorer-bootstrap.js
  var BOOTSTRAP_KEY = "wspp_scorer_bootstrapped_at";
  var BOOTSTRAP_COOLDOWN_MS = 6 * 60 * 60 * 1e3;
  var _bootstrapped = false;
  async function bootstrapScorer() {
    if (_bootstrapped) return;
    _bootstrapped = true;
    const stored = await new Promise((r) => chrome.storage.local.get([BOOTSTRAP_KEY], r));
    const lastRun = stored[BOOTSTRAP_KEY] ?? 0;
    if (Date.now() - lastRun < BOOTSTRAP_COOLDOWN_MS) {
      console.log(`[SCORER BOOTSTRAP] Cooldown activo \u2014 \xFAltimo bootstrap hace ${Math.round((Date.now() - lastRun) / 6e4)}min, saltando`);
      return;
    }
    console.log("[SCORER BOOTSTRAP] Iniciando precalentamiento desde backend...");
    const t0 = Date.now();
    try {
      const cfgRes = await apiFetch("/api/validacion/scorer-config");
      if (cfgRes.ok && cfgRes.config) {
        setScorerConfig(cfgRes.config);
        console.log("[SCORER BOOTSTRAP] Config de campa\xF1a aplicada", cfgRes.has_overrides ? "(con overrides)" : "(defaults)");
      }
    } catch (err) {
      console.warn("[SCORER BOOTSTRAP] Error cargando config:", err?.message || err);
    }
    let signals;
    try {
      const res = await apiFetch("/api/validacion/scorer-bootstrap");
      if (!res.ok) {
        if (res.error === "No auth" || res.code === "AUTH_TOKEN_MISSING") {
          console.log("[SCORER BOOTSTRAP] Sin auth \u2014 se reintentar\xE1 al pr\xF3ximo arranque de SW");
        } else {
          console.warn("[SCORER BOOTSTRAP] Error del backend:", res.error || res.message || res.code);
        }
        _bootstrapped = false;
        return;
      }
      signals = res.signals;
    } catch (err) {
      console.warn("[SCORER BOOTSTRAP] Fallo de red:", err?.message || err);
      _bootstrapped = false;
      return;
    }
    if (!Array.isArray(signals) || signals.length === 0) {
      console.log("[SCORER BOOTSTRAP] Sin historial en backend para esta campa\xF1a");
      await chrome.storage.local.set({ [BOOTSTRAP_KEY]: Date.now() });
      return;
    }
    let injected = 0;
    let skipped = 0;
    for (const sig of signals) {
      if (!sig.phone || !sig.category || typeof sig.confidence !== "number" || !sig.ts) continue;
      const wasInjected = recordSignalRaw(sig.phone, sig.category, sig.confidence, sig.ts);
      if (wasInjected) injected++;
      else skipped++;
    }
    if (injected > 0) {
      flushScorerStorage();
    }
    const elapsed = Date.now() - t0;
    const phones = new Set(signals.map((s) => s.phone)).size;
    console.log(
      `[SCORER BOOTSTRAP] \u2713 ${injected} signals inyectadas (${skipped} saltadas \u2014 tel\xE9fonos ya calientes) | ${phones} phones | ${elapsed}ms`
    );
    await chrome.storage.local.set({ [BOOTSTRAP_KEY]: Date.now() });
  }

  // src/background-entry.js
  bootstrapScorer();
})();
