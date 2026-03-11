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
          const res = await fetch(`${API}${path}`, {
            ...options,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${data.wspp_token}`,
              "x-campaign-id": data.wspp_campaign_id,
              "X-Extension-Version": EXT_VERSION,
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
      const context = getConversationContext(phone || fromJid);
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
  var SPAM_LOG_MAX = 200;
  var SPAM_CHECK_INTERVAL_MS = 6e4;
  var SPAM_REPORT_INTERVAL_MS = 3e5;
  var SPAM_MAX_BURST_PER_MIN = 25;
  var SPAM_REPETITION_WARN = 0.5;
  var SPAM_REPETITION_CRIT = 0.8;
  var SPAM_MIN_INTERVAL_SEC = 2;
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
  function localSpamCheck() {
    const cutoff = Math.floor(Date.now() / 1e3) - 600;
    const recent = _outgoingLog.filter((m) => m.timestamp >= cutoff);
    if (recent.length < 5) return null;
    const warnings = [];
    let riskScore = 0;
    const texts = recent.map((m) => m.text);
    const unique = new Set(texts).size;
    const repetitionRate = 1 - unique / texts.length;
    if (repetitionRate >= SPAM_REPETITION_CRIT) {
      riskScore += 40;
      warnings.push(`\u26A0\uFE0F ${Math.round(repetitionRate * 100)}% mensajes id\xE9nticos en \xFAltimos 10 min. Alto riesgo de bloqueo.`);
    } else if (repetitionRate >= SPAM_REPETITION_WARN) {
      riskScore += 20;
      warnings.push(`${Math.round(repetitionRate * 100)}% mensajes repetidos. Vari\xE1 el contenido.`);
    }
    const lastMinute = recent.filter((m) => m.timestamp >= Math.floor(Date.now() / 1e3) - 60);
    if (lastMinute.length > SPAM_MAX_BURST_PER_MIN) {
      riskScore += 35;
      warnings.push(`\u26A0\uFE0F ${lastMinute.length} mensajes en el \xFAltimo minuto. DETENER env\xEDos.`);
    } else if (lastMinute.length > 15) {
      riskScore += 15;
      warnings.push(`${lastMinute.length} msg/min. Reducir velocidad.`);
    }
    if (recent.length >= 3) {
      const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
      let tooFast = 0;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].timestamp - sorted[i - 1].timestamp < SPAM_MIN_INTERVAL_SEC) tooFast++;
      }
      if (tooFast > sorted.length * 0.5) {
        riskScore += 15;
        warnings.push("Enviando muy r\xE1pido. Esperar 3-5s entre mensajes.");
      }
    }
    const textToContacts = /* @__PURE__ */ new Map();
    for (const m of recent) {
      if (!m.to_phone) continue;
      if (!textToContacts.has(m.text)) textToContacts.set(m.text, /* @__PURE__ */ new Set());
      textToContacts.get(m.text).add(m.to_phone);
    }
    let maxBroadcast = 0;
    for (const [, contacts] of textToContacts) {
      if (contacts.size > maxBroadcast) maxBroadcast = contacts.size;
    }
    if (maxBroadcast > 15) {
      riskScore += 25;
      warnings.push(`Mismo mensaje a ${maxBroadcast} contactos. Personalizar cada mensaje.`);
    }
    riskScore = Math.min(100, riskScore);
    const risk_level = riskScore >= 70 ? "critical" : riskScore >= 45 ? "high" : riskScore >= 25 ? "medium" : "low";
    return { risk_level, risk_score: riskScore, warnings, message_count: recent.length };
  }
  var _lastSpamAlert = 0;
  setInterval(() => {
    const result = localSpamCheck();
    if (!result || result.risk_level === "low") return;
    const now = Date.now();
    const minInterval = result.risk_level === "critical" ? 3e4 : result.risk_level === "high" ? 6e4 : 18e4;
    if (now - _lastSpamAlert < minInterval) return;
    _lastSpamAlert = now;
    console.warn(
      "[WSPP SPAM]",
      result.risk_level.toUpperCase(),
      "| Score:",
      result.risk_score,
      "| Warnings:",
      result.warnings.join(" | ")
    );
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
        messages: recent.map((m) => ({ text: m.text, timestamp: m.timestamp, to_phone: m.to_phone || void 0 }))
      })
    }).then((res) => {
      if (res.ok && res.risk_level !== "low") {
        console.warn(
          "[WSPP SPAM-SERVER]",
          res.risk_level.toUpperCase(),
          "| Score:",
          res.risk_score,
          "| Warnings:",
          (res.warnings || []).join(" | ")
        );
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
      const classification = await classifyWithAggregation(phone, preview, from_jid);
      if (classification === MSG_BUFFER_SUPERSEDED) {
        console.log("%c  \u23ED\uFE0F  Mensaje superseded por agregaci\xF3n \u2014 esperando buffer completo", "color:#7a95aa");
        sendResponse({ validation: null, superseded: true });
        return;
      }
      if (classification) {
        const confPct = Math.round(classification.confidence * 100);
        const confColor = confPct >= 85 ? "#22c55e" : confPct >= 70 ? "#f59e0b" : "#ef5350";
        console.log(
          "%c  \u{1F9E0} CLASIFICADO \u2192 %c" + classification.category + "%c  |  vote: %c" + (classification.vote_class || "invalido") + "%c  |  status: %c" + classification.status + "%c  |  conf: %c" + confPct + "%",
          "color:#06b6d4;font-weight:700",
          "color:#FFC800;font-weight:900",
          "color:#555",
          "color:" + (classification.vote_class === "duro" ? "#22c55e" : classification.vote_class === "blando" ? "#f59e0b" : classification.vote_class === "flotante" ? "#a855f7" : "#ef5350") + ";font-weight:900",
          "color:#555",
          "color:#3b82f6;font-weight:700",
          "color:#555",
          "color:" + confColor + ";font-weight:900"
        );
        console.log("%c     Raz\xF3n: " + classification.reason, "color:#7a95aa");
      } else {
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
        const canAutoClassify = classification && classification.confidence >= 0.7 && (validation.status === "contactado" || validation.status === "respondido" || validation.status === "pendiente");
        const hasVoteClass = validation.vote_class && validation.vote_class !== "";
        const shouldClassify = canAutoClassify && (!hasVoteClass || classification.status === "invalido");
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
      sendResponse({ ok: true });
      return true;
    }
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
          body: JSON.stringify(data)
        });
        if (!result.ok) {
          sendResponse({ ok: false, error: result.message || result.error || "Create failed" });
          return;
        }
        _audioCatalogCache = null;
        _audioCatalogCacheTs = 0;
        sendResponse({ ok: true, item: result.item ?? result });
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
})();
