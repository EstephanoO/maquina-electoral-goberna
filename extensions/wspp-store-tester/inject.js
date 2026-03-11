(() => {
  // src/inject/bootstrap.js
  var WA_ORIGIN = "https://web.whatsapp.com";
  var _ownNumber = null;
  var _catalogIsConsultor = false;
  function setOwnNumber(num) {
    _ownNumber = num || null;
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "WSPP_SET_OWN_NUMBER") {
      _ownNumber = e.data.number || null;
      console.log("[WSPP] own_number actualizado:", _ownNumber ?? "NULL");
      return;
    }
    if (e.data?.type === "WSPP_SET_USER_ROLE") {
      const role = e.data.role || "agente_digital";
      _catalogIsConsultor = ["admin", "consultor"].includes(role);
      console.log("[WSPP] user_role actualizado:", role, "| consultor:", _catalogIsConsultor);
      return;
    }
  });

  // src/inject/jid-resolver.js
  var _jidPhoneCache = /* @__PURE__ */ new Map();
  var JID_CACHE_MAX = 2e3;
  var _contactIndex = null;
  var _chatIndex = null;
  var _indexBuiltAt = 0;
  var INDEX_REFRESH_MS = 6e4;
  function getContactIndex() {
    const now = Date.now();
    if (_contactIndex && now - _indexBuiltAt < INDEX_REFRESH_MS) return _contactIndex;
    try {
      const { ContactCollection } = window.require("WAWebContactCollection");
      if (ContactCollection && ContactCollection._models) {
        _contactIndex = /* @__PURE__ */ new Map();
        for (const c of ContactCollection._models) {
          const key = c.id?._serialized;
          if (key) _contactIndex.set(key, c);
        }
        _indexBuiltAt = now;
      }
    } catch (_) {
    }
    return _contactIndex;
  }
  function getChatIndex() {
    const now = Date.now();
    if (_chatIndex && now - _indexBuiltAt < INDEX_REFRESH_MS) return _chatIndex;
    try {
      const { ChatCollection } = window.require("WAWebChatCollection");
      if (ChatCollection && ChatCollection._models) {
        _chatIndex = /* @__PURE__ */ new Map();
        for (const c of ChatCollection._models) {
          const key = c.id?._serialized;
          if (key) _chatIndex.set(key, c);
        }
      }
    } catch (_) {
    }
    return _chatIndex;
  }
  function cachePhone(jid, phone) {
    if (!jid || !phone) return;
    if (_jidPhoneCache.size >= JID_CACHE_MAX) {
      const first = _jidPhoneCache.keys().next().value;
      _jidPhoneCache.delete(first);
    }
    _jidPhoneCache.set(jid, phone);
  }
  function jidToNumber(jid) {
    if (!jid || typeof jid !== "string") return null;
    if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@newsletter")) return null;
    if (jid.includes("@lid")) return null;
    const num = jid.replace(/@.+$/, "").replace(/\D/g, "");
    return num.length >= 10 && num.length <= 13 ? num : null;
  }
  function resolvePhoneFromLid(lidJid) {
    if (!lidJid || !lidJid.includes("@lid")) return null;
    const cached = _jidPhoneCache.get(lidJid);
    if (cached) return cached;
    let resolved = null;
    try {
      const contactIdx = getContactIndex();
      if (contactIdx) {
        const contact = contactIdx.get(lidJid);
        if (contact) {
          const candidates = [
            contact.userid,
            contact.number,
            contact.phoneNumber,
            contact.jid?.user,
            contact.plaintextDisabled
            // some WA versions store phone here
          ];
          for (const val of candidates) {
            if (val && typeof val === "string") {
              const digits = val.replace(/\D/g, "");
              if (digits.length >= 9 && digits.length <= 15) {
                resolved = digits;
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[WSPP] resolvePhoneFromLid S1 error:", e.message);
    }
    if (!resolved) try {
      const chatIdx = getChatIndex();
      if (chatIdx) {
        const chat = chatIdx.get(lidJid);
        if (chat) {
          const contact = chat.contact;
          if (contact) {
            const candidates = [contact.userid, contact.number, contact.phoneNumber];
            for (const val of candidates) {
              if (val && typeof val === "string") {
                const digits = val.replace(/\D/g, "");
                if (digits.length >= 9 && digits.length <= 15) {
                  resolved = digits;
                  break;
                }
              }
            }
          }
          if (!resolved && chat.formattedUser) {
            const digits = chat.formattedUser.replace(/\D/g, "");
            if (digits.length >= 9 && digits.length <= 15) resolved = digits;
          }
        }
      }
    } catch (e) {
      console.warn("[WSPP] resolvePhoneFromLid S2 error:", e.message);
    }
    if (!resolved) try {
      const wid = window.require("WAWebWidFactory");
      if (wid && typeof wid.numberForLid === "function") {
        const num = wid.numberForLid(lidJid);
        if (num) {
          const digits = String(num).replace(/\D/g, "");
          if (digits.length >= 9 && digits.length <= 15) resolved = digits;
        }
      }
    } catch (e) {
      console.warn("[WSPP] resolvePhoneFromLid S3 error:", e.message);
    }
    if (!resolved) try {
      const header = document.querySelector("#main header");
      if (header) {
        const spans = header.querySelectorAll("span[title], span[dir]");
        for (const s of spans) {
          const txt = (s.getAttribute("title") || s.textContent || "").trim();
          const digits = txt.replace(/[^0-9]/g, "");
          if (digits.length >= 9 && digits.length <= 15) {
            resolved = digits;
            break;
          }
        }
      }
    } catch (e) {
      console.warn("[WSPP] resolvePhoneFromLid S4 error:", e.message);
    }
    if (resolved) {
      cachePhone(lidJid, resolved);
      console.log("[WSPP] @lid resolved:", lidJid.substring(0, 15) + "\u2026", "\u2192", resolved, "(cached)");
    }
    return resolved;
  }
  function getActiveContactName() {
    try {
      const selected = document.querySelector('#pane-side [aria-selected="true"]') ?? document.querySelector('[aria-selected="true"]');
      if (selected) {
        const spans = selected.querySelectorAll("span[title]");
        for (const s of spans) {
          const t = (s.getAttribute("title") || "").trim();
          if (t && t.length > 1 && !/^[\u200e\u200f\u202a-\u202e\s.]+$/.test(t)) {
            return t;
          }
        }
      }
    } catch (_) {
    }
    try {
      const allComposers = document.querySelectorAll('[role="textbox"][contenteditable="true"]');
      for (const composer of allComposers) {
        const aria = composer.getAttribute("aria-label") || "";
        if (/búsqueda|search|buscar/i.test(aria)) continue;
        const m = aria.match(/^(?:Escribe a|Type a message to)\s+(.+?)\.?$/i);
        if (m) return m[1].trim();
      }
    } catch (_) {
    }
    return null;
  }
  function getOwnNumber() {
    if (_ownNumber) return _ownNumber;
    try {
      const mod = window.require("WAWebUserPrefsMeUser");
      const me = mod?.getMeUser?.() || mod?.getMaybeMeUser?.();
      if (me) {
        const digits = (me.user || me._serialized || "").replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) return digits;
      }
    } catch (_) {
    }
    try {
      const { Conn } = window.require("WAWebConnModel");
      const wid = Conn?.wid;
      if (wid) {
        const digits = (wid.user || wid._serialized || "").replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) return digits;
      }
    } catch (_) {
    }
    try {
      const waMe = localStorage.getItem("last-wid-md") || localStorage.getItem("last-wid");
      if (waMe) {
        const digits = waMe.replace(/@.+$/, "").replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) return digits;
      }
    } catch (_) {
    }
    return null;
  }
  function normalizePhone(raw) {
    if (!raw) return null;
    const n = raw.replace(/\D/g, "");
    return n.length >= 10 && n.length <= 13 ? n : null;
  }
  function getActivePhone() {
    try {
      const selected = document.querySelector('#pane-side [aria-selected="true"]') ?? document.querySelector('[aria-selected="true"]');
      if (selected) {
        const spans = selected.querySelectorAll("span[title]");
        for (const s of spans) {
          const n = normalizePhone(s.getAttribute("title"));
          if (n) return n;
        }
      }
    } catch (_) {
    }
    try {
      const { ChatCollection } = window.require("WAWebChatCollection");
      if (ChatCollection && ChatCollection._models) {
        const active = ChatCollection._models.find((c) => c.active);
        if (active && active.id?._serialized) {
          const n = jidToNumber(active.id._serialized);
          if (n) return n;
          if (active.id._serialized.includes("@lid")) {
            const resolved = resolvePhoneFromLid(active.id._serialized);
            if (resolved) return resolved;
          }
        }
      }
    } catch (_) {
    }
    return null;
  }

  // src/inject/send-hook.js
  function isSendButton(el) {
    let node = el;
    for (let i = 0; i < 6; i++) {
      if (!node || node === document.body) break;
      const testid = node.getAttribute?.("data-testid");
      if (testid === "send") return true;
      const icon = node.getAttribute?.("data-icon");
      if (icon === "send" || icon === "wds-ic-send-filled") return true;
      const tag = node.tagName;
      if (tag === "BUTTON" || node.getAttribute?.("role") === "button") {
        const aria = (node.getAttribute?.("aria-label") || "").trim().toLowerCase();
        if (aria === "enviar" || aria === "send" || /\b(enviar|send)\b/.test(aria)) return true;
      }
      node = node.parentElement;
    }
    return false;
  }
  var _lastEmit = 0;
  function emitSent(phone) {
    const now = Date.now();
    if (now - _lastEmit < 300) return;
    _lastEmit = now;
    const own = getOwnNumber();
    const name = getActiveContactName();
    window.postMessage({
      type: "WSPP_SENT",
      payload: {
        phone,
        // null si no se pudo resolver — el backend lo ignorará
        contact_name: name,
        own_number: own,
        timestamp: Math.floor(Date.now() / 1e3)
      }
    }, WA_ORIGIN);
    console.log("[WSPP] \u2713 enviado \u2192 phone:", phone ?? "(sin tel\xE9fono)", "| nombre:", name ?? "-", "| celular:", own ?? "NULL");
  }
  document.addEventListener("click", (e) => {
    if (!isSendButton(e.target)) return;
    const phone = getActivePhone();
    console.log("[WSPP] \u2713 Send click | phone:", phone ?? "(sin tel\xE9fono)");
    emitSent(phone);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey) return;
    const active = document.activeElement;
    if (!active) return;
    const role = active.getAttribute("role");
    const testid = active.getAttribute("data-testid");
    const ariaLabel = active.getAttribute("aria-label") || "";
    if (/búsqueda|search|buscar/i.test(ariaLabel)) return;
    const isComposer = testid === "conversation-compose-box-input" || role === "textbox" && /escribe|message|type|escribir/i.test(ariaLabel) || role === "textbox" && active.getAttribute("contenteditable") === "true" && !ariaLabel;
    if (!isComposer) return;
    const phone = getActivePhone();
    console.log("[WSPP] \u2713 Send Enter | phone:", phone ?? "(sin tel\xE9fono)");
    emitSent(phone);
  }, true);
  console.log("[WSPP] \u2713 listeners activos \u2014 own_number viene del popup");

  // src/inject/validation-overlay.js
  var _currentOverlay = null;
  var _spamOverlay = null;
  function showSpamWarning(data) {
    if (!data || !data.warnings || data.warnings.length === 0) return;
    removeSpamWarning();
    const overlay = document.createElement("div");
    overlay.id = "wspp-spam-warning";
    const isCritical = data.risk_level === "critical";
    const isHigh = data.risk_level === "high";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "99999",
      background: isCritical ? "#dc2626" : isHigh ? "#ea580c" : "#ca8a04",
      color: "#fff",
      padding: "12px 20px",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0,0,0,.3)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "13px",
      maxWidth: "500px",
      cursor: "pointer",
      transition: "opacity .3s"
    });
    const title = document.createElement("div");
    title.style.fontWeight = "800";
    title.style.marginBottom = "4px";
    title.style.fontSize = "14px";
    title.textContent = isCritical ? "RIESGO CRITICO DE BLOQUEO" : isHigh ? "RIESGO ALTO \u2014 Reducir velocidad" : "Advertencia de spam";
    overlay.appendChild(title);
    for (const w of data.warnings.slice(0, 3)) {
      const line = document.createElement("div");
      line.style.fontSize = "12px";
      line.style.opacity = "0.9";
      line.textContent = w;
      overlay.appendChild(line);
    }
    const score = document.createElement("div");
    score.style.fontSize = "10px";
    score.style.opacity = "0.7";
    score.style.marginTop = "4px";
    score.textContent = `Score: ${data.risk_score}/100 | ${data.message_count} msgs recientes`;
    overlay.appendChild(score);
    overlay.addEventListener("click", () => removeSpamWarning());
    document.body.appendChild(overlay);
    _spamOverlay = overlay;
    const dismissMs = isCritical ? 3e4 : isHigh ? 15e3 : 8e3;
    setTimeout(() => removeSpamWarning(), dismissMs);
  }
  function removeSpamWarning() {
    if (_spamOverlay) {
      _spamOverlay.remove();
      _spamOverlay = null;
    }
    const existing = document.getElementById("wspp-spam-warning");
    if (existing) existing.remove();
  }
  function showValidationOverlay(data) {
    removeValidationOverlay();
    if (!data || !data.id) return;
    const statusColors = {
      pendiente: { bg: "#f1f5f9", text: "#64748b", label: "PENDIENTE" },
      contactado: { bg: "#dbeafe", text: "#2563eb", label: "CONTACTADO" },
      respondido: { bg: "#e0f2fe", text: "#0891b2", label: "RESPONDIDO" },
      invalido: { bg: "#fee2e2", text: "#dc2626", label: "IMPOSIBLE" }
    };
    const voteColors = {
      duro: { bg: "#dcfce7", text: "#15803d", label: "VOTO DURO" },
      blando: { bg: "#fef9c3", text: "#ca8a04", label: "VOTO BLANDO" },
      flotante: { bg: "#ede9fe", text: "#7c3aed", label: "FLOTANTE" }
    };
    const st = statusColors[data.status] || statusColors.pendiente;
    const vc = data.vote_class ? voteColors[data.vote_class] : null;
    const displayStatus = vc || st;
    const overlay = document.createElement("div");
    overlay.id = "wspp-validation-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "72px",
      right: "24px",
      zIndex: "99998",
      background: "#ffffff",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(0,0,0,.15)",
      border: "1px solid #e2e8f0",
      padding: "12px 16px",
      minWidth: "220px",
      maxWidth: "300px",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "12px",
      transition: "opacity .2s, transform .2s",
      opacity: "0",
      transform: "translateY(-8px)",
      cursor: "pointer"
    });
    function el(tag, styles, children) {
      const node = document.createElement(tag);
      if (styles) Object.assign(node.style, styles);
      if (typeof children === "string") node.textContent = children;
      else if (Array.isArray(children)) children.forEach((c) => {
        if (c) node.appendChild(c);
      });
      return node;
    }
    const headerRow = el("div", { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }, [
      el("div", { background: displayStatus.bg, color: displayStatus.text, padding: "2px 8px", borderRadius: "6px", fontWeight: "700", fontSize: "10px", letterSpacing: ".5px" }, displayStatus.label),
      el("span", { color: "#94a3b8", fontSize: "10px" }, data.zona || "")
    ]);
    overlay.appendChild(headerRow);
    overlay.appendChild(el("div", { fontWeight: "600", color: "#1e293b", fontSize: "13px", marginBottom: "2px" }, data.nombre || "Sin nombre"));
    const infoText = (data.telefono || "") + (data.encuestador ? " | Enc: " + data.encuestador : "");
    overlay.appendChild(el("div", { color: "#64748b", fontSize: "11px", marginBottom: "4px" }, infoText));
    if (data.claimed_by_name) {
      overlay.appendChild(el("div", { color: "#94a3b8", fontSize: "10px" }, "Reclamado: " + data.claimed_by_name));
    }
    const classifyPanel = el("div", { display: "none", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e2e8f0" });
    classifyPanel.id = "wspp-classify-panel";
    classifyPanel.appendChild(el("div", { fontSize: "10px", color: "#64748b", fontWeight: "600", marginBottom: "6px" }, "CLASIFICAR:"));
    const btnContainer = el("div", { display: "flex", flexWrap: "wrap", gap: "4px" });
    const btnConfigs = [
      { vote: "duro", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", label: "Voto Duro" },
      { vote: "blando", bg: "#fef9c3", color: "#ca8a04", border: "#fde68a", label: "Voto Blando" },
      { vote: "flotante", bg: "#ede9fe", color: "#7c3aed", border: "#ddd6fe", label: "Flotante" },
      { vote: "invalido", bg: "#fee2e2", color: "#dc2626", border: "#fecaca", label: "Imposible" }
    ];
    for (const cfg of btnConfigs) {
      const btn = el("button", { background: cfg.bg, color: cfg.color, border: "1px solid " + cfg.border, borderRadius: "6px", padding: "4px 10px", fontSize: "10px", fontWeight: "700", cursor: "pointer" }, cfg.label);
      btn.className = "wspp-classify-btn";
      btn.setAttribute("data-vote", cfg.vote);
      btnContainer.appendChild(btn);
    }
    classifyPanel.appendChild(btnContainer);
    overlay.appendChild(classifyPanel);
    const toast = el("div", { display: "none", marginTop: "6px", padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: "600", textAlign: "center" });
    toast.id = "wspp-overlay-toast";
    overlay.appendChild(toast);
    overlay.addEventListener("click", (e) => {
      const panel = overlay.querySelector("#wspp-classify-panel");
      if (panel && !e.target.closest(".wspp-classify-btn")) {
        panel.style.display = panel.style.display === "none" ? "block" : "none";
      }
    });
    overlay.addEventListener("click", (e) => {
      const btn = e.target.closest(".wspp-classify-btn");
      if (!btn) return;
      e.stopPropagation();
      const vote = btn.getAttribute("data-vote");
      window.postMessage({
        type: "WSPP_CLASSIFY",
        payload: {
          validation_id: data.id,
          vote_class: vote === "invalido" ? "" : vote,
          status: vote === "invalido" ? "invalido" : "respondido",
          _phone: data.telefono || null,
          original_category: data.vote_class || null
        }
      }, WA_ORIGIN);
      overlay.querySelectorAll(".wspp-classify-btn").forEach((b) => {
        b.style.opacity = "0.5";
        b.style.pointerEvents = "none";
      });
    });
    document.body.appendChild(overlay);
    _currentOverlay = overlay;
    requestAnimationFrame(() => {
      overlay.style.opacity = "1";
      overlay.style.transform = "translateY(0)";
    });
  }
  function removeValidationOverlay() {
    if (_currentOverlay) {
      _currentOverlay.remove();
      _currentOverlay = null;
    }
    const existing = document.getElementById("wspp-validation-overlay");
    if (existing) existing.remove();
  }
  function updateOverlayStatus(data) {
    const overlay = document.getElementById("wspp-validation-overlay");
    if (!overlay || !data) return;
    showValidationOverlay(data);
  }
  function showOverlayToast(message, type) {
    const toast = document.getElementById("wspp-overlay-toast");
    if (!toast) return;
    toast.style.display = "block";
    toast.style.background = type === "success" ? "#dcfce7" : "#fee2e2";
    toast.style.color = type === "success" ? "#15803d" : "#dc2626";
    toast.textContent = message;
    const overlay = document.getElementById("wspp-validation-overlay");
    if (overlay) {
      overlay.querySelectorAll(".wspp-classify-btn").forEach((b) => {
        b.style.opacity = "1";
        b.style.pointerEvents = "auto";
      });
    }
    setTimeout(() => {
      toast.style.display = "none";
    }, 3e3);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "WSPP_VALIDATION_DATA") {
      const data = e.data.payload;
      showValidationOverlay(data);
      return;
    }
    if (e.data?.type === "WSPP_VALIDATION_CLEAR") {
      removeValidationOverlay();
      return;
    }
    if (e.data?.type === "WSPP_CLASSIFY_RESULT") {
      if (e.data.ok) {
        updateOverlayStatus(e.data.payload);
        showOverlayToast("Clasificado correctamente", "success");
      } else {
        showOverlayToast(e.data.error || "Error al clasificar", "error");
      }
      return;
    }
    if (e.data?.type === "WSPP_SPAM_WARNING") {
      showSpamWarning(e.data.payload);
      return;
    }
  });

  // src/inject/wa-module-installer.js
  var _msgListenerInstalled = false;
  var _chatWatcherInstalled = false;
  var _lastActiveChatJid = null;
  function installIncomingMessageListener() {
    if (_msgListenerInstalled) return;
    try {
      const { MsgCollection } = window.require("WAWebMsgCollection");
      if (!MsgCollection || !MsgCollection.on) {
        console.log("[WSPP] MsgCollection no disponible a\xFAn");
        return;
      }
      MsgCollection.on("add", (msg) => {
        try {
          const isFromMe = !!msg.get("id")?.fromMe;
          if (isFromMe) {
            const to = msg.get("to")?._serialized;
            if (!to || typeof to !== "string") return;
            if (to.includes("@g.us") || to.includes("@broadcast") || to.includes("@newsletter")) return;
            let phone2 = jidToNumber(to);
            if (!phone2 && to.includes("@lid")) {
              phone2 = resolvePhoneFromLid(to);
            }
            let contactName2 = null;
            try {
              const cidx = getContactIndex();
              if (cidx) {
                const contact = cidx.get(to);
                if (contact) contactName2 = contact.pushname || contact.name || contact.formattedName || null;
              }
            } catch (_) {
            }
            const outBody = msg.get("body") || "";
            window.postMessage({
              type: "WSPP_SENT_RICH",
              payload: {
                phone: phone2,
                contact_name: contactName2 || getActiveContactName_local(),
                own_number: getOwnNumber(),
                to_jid: to,
                timestamp: msg.get("t") || Math.floor(Date.now() / 1e3),
                body: outBody.substring(0, 500)
              }
            }, WA_ORIGIN);
            return;
          }
          const from = msg.get("from")?._serialized;
          if (!from || typeof from !== "string") return;
          if (from.includes("@g.us") || from.includes("@broadcast") || from.includes("@newsletter")) return;
          let phone = jidToNumber(from);
          const body = msg.get("body") || "";
          const msgType = msg.get("type") || "chat";
          const timestamp = msg.get("t") || Math.floor(Date.now() / 1e3);
          if (!phone && from.includes("@lid")) {
            phone = resolvePhoneFromLid(from);
          }
          let contactName = null;
          try {
            const cidx = getContactIndex();
            if (cidx) {
              const contact = cidx.get(from);
              if (contact) {
                contactName = contact.pushname || contact.name || contact.formattedName || null;
              }
            }
          } catch (_) {
          }
          window.postMessage({
            type: "WSPP_RECEIVED",
            payload: {
              phone,
              contact_name: contactName,
              from_jid: from,
              preview: body.substring(0, 500),
              msg_type: msgType,
              own_number: getOwnNumber(),
              timestamp
            }
          }, WA_ORIGIN);
          console.log("[WSPP] \u2190 recibido de:", phone ?? from, "| tipo:", msgType, "| preview:", body.substring(0, 60));
        } catch (err) {
          console.error("[WSPP] Error procesando mensaje:", err);
        }
      });
      _msgListenerInstalled = true;
      console.log("[WSPP] \u2713 Listener de mensajes entrantes instalado (MsgCollection.on add)");
    } catch (err) {
      console.log("[WSPP] MsgCollection a\xFAn no disponible:", err.message);
    }
  }
  function getActiveContactName_local() {
    try {
      const selected = document.querySelector('#pane-side [aria-selected="true"]') ?? document.querySelector('[aria-selected="true"]');
      if (selected) {
        const spans = selected.querySelectorAll("span[title]");
        for (const s of spans) {
          const t = (s.getAttribute("title") || "").trim();
          if (t && t.length > 1 && !/^[\u200e\u200f\u202a-\u202e\s.]+$/.test(t)) return t;
        }
      }
    } catch (_) {
    }
    return null;
  }
  function installChatWatcher() {
    if (_chatWatcherInstalled) return;
    try {
      let handleActiveChatChange = function() {
        try {
          const active = ChatCollection._models.find((c) => c.active);
          if (!active) return;
          const jid = active.id?._serialized;
          if (!jid || jid === _lastActiveChatJid) return;
          _lastActiveChatJid = jid;
          if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@newsletter")) return;
          let phone = jidToNumber(jid);
          if (!phone && jid.includes("@lid")) {
            phone = resolvePhoneFromLid(jid);
          }
          const name = active.name || active.formattedTitle || active.pushname || null;
          window.postMessage({
            type: "WSPP_CHAT_OPENED",
            payload: {
              phone,
              contact_name: name,
              jid
            }
          }, WA_ORIGIN);
          console.log("[WSPP] Chat abierto:", phone ?? jid, "| nombre:", name ?? "-");
        } catch (_) {
        }
      };
      const { ChatCollection } = window.require("WAWebChatCollection");
      if (!ChatCollection || !ChatCollection._models) {
        console.log("[WSPP] ChatCollection no disponible a\xFAn");
        return;
      }
      let eventDriven = false;
      try {
        if (typeof ChatCollection.on === "function") {
          ChatCollection.on("change:active", handleActiveChatChange);
          ChatCollection.on("change", handleActiveChatChange);
          eventDriven = true;
          console.log("[WSPP] \u2713 Chat watcher instalado (event-driven: ChatCollection.on)");
        }
      } catch (_) {
      }
      if (!eventDriven) {
        setInterval(handleActiveChatChange, 2e3);
        console.log("[WSPP] \u2713 Chat watcher instalado (polling fallback cada 2s)");
      }
      _chatWatcherInstalled = true;
    } catch (err) {
      console.log("[WSPP] ChatCollection a\xFAn no disponible:", err.message);
    }
  }
  var MAX_WA_LISTENER_RETRIES = 30;
  var _waListenerRetries = 0;
  var WA_REQUIRED_MODULES = [
    "WAWebMsgCollection",
    "WAWebChatCollection",
    "WAWebContactCollection"
  ];
  var WA_OPTIONAL_MODULES = [
    "WAWebMediaOpaqueData",
    // PTT: media opaque data wrapper
    "WAWebPrepRawMedia",
    // PTT: prepRawMedia({ isPtt: true }) pipeline
    "WAWebSendMsgChatAction",
    // PTT: addAndSendMsgToChat
    "WAWebWidFactory",
    // @lid resolution + chat lookup
    "WAWebFindChatAction"
    // PTT: fallback chat resolver
  ];
  function runModuleHealthCheck() {
    const missing = [];
    const missingOptional = [];
    for (const mod of WA_REQUIRED_MODULES) {
      try {
        window.require(mod);
      } catch (_) {
        missing.push(mod);
      }
    }
    for (const mod of WA_OPTIONAL_MODULES) {
      try {
        window.require(mod);
      } catch (_) {
        missingOptional.push(mod);
      }
    }
    if (missing.length > 0) {
      console.error("[WSPP HEALTH] CRITICAL \u2014 missing required modules:", missing.join(", "));
      showHealthBadge("error", "Extension desactualizada \u2014 faltan modulos: " + missing.join(", "));
    } else if (missingOptional.length > 0) {
      console.warn("[WSPP HEALTH] Optional modules missing:", missingOptional.join(", "));
      showHealthBadge("warn", "Funciones limitadas \u2014 faltan: " + missingOptional.join(", "));
    } else {
      console.log("[WSPP HEALTH] All modules OK");
    }
  }
  var _healthBadge = null;
  function showHealthBadge(level, message) {
    if (_healthBadge) _healthBadge.remove();
    const badge = document.createElement("div");
    badge.id = "wspp-health-badge";
    const isError = level === "error";
    Object.assign(badge.style, {
      position: "fixed",
      bottom: "16px",
      left: "16px",
      zIndex: "99999",
      background: isError ? "#dc2626" : "#ca8a04",
      color: "#fff",
      padding: "8px 14px",
      borderRadius: "8px",
      fontSize: "11px",
      fontWeight: "600",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: "0 2px 12px rgba(0,0,0,.3)",
      maxWidth: "320px",
      cursor: "pointer"
    });
    badge.textContent = (isError ? "WSPP: " : "WSPP: ") + message;
    badge.title = "Click para cerrar";
    badge.addEventListener("click", () => badge.remove());
    document.body.appendChild(badge);
    _healthBadge = badge;
    if (!isError) setTimeout(() => {
      if (_healthBadge === badge) badge.remove();
    }, 15e3);
  }
  function detectOwnNumber() {
    if (_ownNumber) return;
    let phone = null;
    try {
      const mod = window.require("WAWebUserPrefsMeUser");
      const me = mod?.getMeUser?.() || mod?.getMaybeMeUser?.();
      if (me) {
        const raw = me.user || me._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone = digits;
      }
    } catch (_) {
    }
    if (!phone) try {
      const wid = window.require("WAWebWidFactory");
      const me = wid?.getMeWid?.() || wid?.getCurrentWid?.();
      if (me) {
        const raw = me.user || me._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone = digits;
      }
    } catch (_) {
    }
    if (!phone) try {
      const { Conn } = window.require("WAWebConnModel");
      const wid = Conn?.wid || Conn?.ref;
      if (wid) {
        const raw = typeof wid === "string" ? wid : wid.user || wid._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone = digits;
      }
    } catch (_) {
    }
    if (!phone) try {
      const store = window.Store;
      if (store?.Conn?.wid) {
        const raw = store.Conn.wid.user || store.Conn.wid._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone = digits;
      }
    } catch (_) {
    }
    if (!phone) try {
      const waMe = localStorage.getItem("last-wid-md") || localStorage.getItem("last-wid");
      if (waMe) {
        const digits = waMe.replace(/@.+$/, "").replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone = digits;
      }
    } catch (_) {
    }
    if (!phone) return;
    setOwnNumber(phone);
    console.log(
      "%c[WSPP] own_number auto-detectado: +" + phone,
      "color:#34c759;font-weight:700;font-size:13px"
    );
    window.postMessage({
      type: "WSPP_OWN_NUMBER_DETECTED",
      number: phone
    }, WA_ORIGIN);
  }
  function tryInstallWAListeners() {
    if (!window.require) {
      _waListenerRetries++;
      if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
        setTimeout(tryInstallWAListeners, 2e3);
      } else {
        console.warn("[WSPP] window.require never appeared after", MAX_WA_LISTENER_RETRIES, "retries \u2014 giving up");
        showHealthBadge("error", "WhatsApp Web no detectado \u2014 recarga la pagina");
      }
      return;
    }
    installIncomingMessageListener();
    installChatWatcher();
    if (!_msgListenerInstalled || !_chatWatcherInstalled) {
      _waListenerRetries++;
      if (_waListenerRetries < MAX_WA_LISTENER_RETRIES) {
        setTimeout(tryInstallWAListeners, 3e3);
      } else {
        console.warn("[WSPP] WA listeners not installed after", MAX_WA_LISTENER_RETRIES, "retries \u2014 giving up");
        showHealthBadge("error", "No se pudieron instalar los listeners \u2014 recarga la pagina");
      }
    } else {
      runModuleHealthCheck();
      detectOwnNumber();
    }
  }

  // src/inject/audio-catalog-panel.js
  var _catalogItems = [];
  var _catalogCategories = [];
  var _catalogCategoriesLoading = false;
  var _catalogPanelOpen = false;
  var _catalogLoading = false;
  var _catalogEditingId = null;
  var _catalogView = "grid";
  var _catalogDetailId = null;
  var _catalogCategory = null;
  var _pendingRegenId = null;
  var _pendingRegenBtn = null;
  var _pendingUpdateId = null;
  var _pendingUpdateBtn = null;
  var _pendingDeleteId = null;
  var _pendingDeleteBtn = null;
  var _pendingCreateBtn = null;
  var _pendingDeleteCatBtn = null;
  var CATALOG_SVG = {
    mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    saludo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    agradecimiento: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    pedir_voto: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    respuesta_trabajo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    respuesta_dinero: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    invitacion_evento: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    despedida: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    propuestas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    // New category icons
    cuando_llaman: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    impulsar_canal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    agendar: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>`,
    apoyo_historico: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    opiniones: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    pedir_apoyo: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    compartir_canal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    saludos: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    cerrar_conv: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
    compartir_mensaje: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    mantener_contacto: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    responder_opiniones: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
    send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    waveform: `<svg width="52" height="20" viewBox="0 0 52 20" fill="none"><rect x="0"  y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".4"/><rect x="5"  y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="10" y="2"  width="3" height="16" rx="1.5" fill="currentColor" opacity=".8"/><rect x="15" y="6"  width="3" height="8"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="20" y="3"  width="3" height="14" rx="1.5" fill="currentColor"/><rect x="25" y="7"  width="3" height="6"  rx="1.5" fill="currentColor" opacity=".7"/><rect x="30" y="1"  width="3" height="18" rx="1.5" fill="currentColor" opacity=".9"/><rect x="35" y="5"  width="3" height="10" rx="1.5" fill="currentColor" opacity=".6"/><rect x="40" y="8"  width="3" height="4"  rx="1.5" fill="currentColor" opacity=".5"/><rect x="45" y="4"  width="3" height="12" rx="1.5" fill="currentColor" opacity=".7"/><rect x="49" y="9"  width="3" height="2"  rx="1" fill="currentColor" opacity=".3"/></svg>`
  };
  var _FALLBACK_LABELS = {
    saludo: "Saludo",
    agradecimiento: "Agradecimiento",
    pedir_voto: "Voto",
    respuesta_trabajo: "Trabajo",
    respuesta_dinero: "Dinero",
    invitacion_evento: "Evento",
    despedida: "Despedida",
    propuestas: "Propuestas"
  };
  var _FALLBACK_COLORS = {
    saludo: "#00a884",
    agradecimiento: "#ef5350",
    pedir_voto: "#f59e0b",
    respuesta_trabajo: "#818cf8",
    respuesta_dinero: "#34d399",
    invitacion_evento: "#38bdf8",
    despedida: "#c084fc",
    propuestas: "#fbbf24"
  };
  var _DEFAULT_ACCENT = "#8696a0";
  function _getCatLabel(catKey) {
    const cat = _catalogCategories.find((c) => c.key === catKey);
    if (cat) return cat.label;
    return _FALLBACK_LABELS[catKey] || catKey;
  }
  function _getCatColors(catKey) {
    const cat = _catalogCategories.find((c) => c.key === catKey);
    const accent = cat?.color || _FALLBACK_COLORS[catKey] || _DEFAULT_ACCENT;
    return { bg: `${accent}18`, accent };
  }
  function _getCatIcon(catKey) {
    const cat = _catalogCategories.find((c) => c.key === catKey);
    const iconKey = cat?.icon || catKey;
    return CATALOG_SVG[iconKey] || CATALOG_SVG.propuestas;
  }
  function _getCatSortOrder(catKey) {
    const cat = _catalogCategories.find((c) => c.key === catKey);
    return cat?.sort_order ?? 999;
  }
  function _getCatId(catKey) {
    const cat = _catalogCategories.find((c) => c.key === catKey);
    return cat?.id || null;
  }
  function injectCatalogStyles() {
    if (document.getElementById("wspp-catalog-styles")) return;
    const root = document.head || document.documentElement;
    if (!root) return;
    const s = document.createElement("style");
    s.id = "wspp-catalog-styles";
    s.textContent = `
    @keyframes wspp-slide-up {
      from { opacity:0; transform:translateY(16px) scale(.97); }
      to   { opacity:1; transform:translateY(0)    scale(1);   }
    }
    @keyframes wspp-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes wspp-pulse-dot {
      0%,100% { opacity:1; } 50% { opacity:.3; }
    }
    .wspp-catalog-item:hover .wspp-item-actions { opacity:1 !important; }
    .wspp-catalog-item:hover { background: #2a3942 !important; }
    .wspp-send-btn:hover { background: #008f72 !important; transform: scale(1.04); }
    .wspp-icon-btn:hover { background: rgba(255,255,255,.08) !important; }
    .wspp-catalog-item.wspp-sending { pointer-events:none; }
    .wspp-catalog-item.wspp-sending .wspp-waveform { color:#00a884; }
    .wspp-spinning { animation: wspp-spin .7s linear infinite; }
    .wspp-edit-area { resize:none; outline:none; }
    .wspp-edit-area:focus { border-color:#00a884 !important; }
    .wspp-edit-area::placeholder { color: #636366; }
    select option { background: #2c2c2e; color: #e9edef; }
  `;
    root.appendChild(s);
  }
  function _fmtDuration(ms) {
    if (!ms) return "";
    const s = Math.round(ms / 1e3);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function createCatalogButton() {
    const btn = document.createElement("button");
    btn.id = "wspp-catalog-btn";
    btn.title = "Audios Goberna \u2014 C\xE9sar V\xE1squez";
    btn.innerHTML = CATALOG_SVG.mic;
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "80px",
      right: "24px",
      zIndex: "99999",
      width: "52px",
      height: "52px",
      borderRadius: "50%",
      border: "none",
      background: "linear-gradient(135deg,#00a884 0%,#008f72 100%)",
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "box-shadow .2s, transform .15s"
    });
    btn.addEventListener("mouseenter", () => {
      if (!_catalogPanelOpen) btn.style.transform = "scale(1.08)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
    });
    btn.addEventListener("click", toggleCatalogPanel);
    document.body.appendChild(btn);
    return btn;
  }
  function toggleCatalogPanel() {
    const existing = document.getElementById("wspp-catalog-panel");
    if (existing) {
      existing.remove();
      _catalogPanelOpen = false;
      _catalogEditingId = null;
      const btn2 = document.getElementById("wspp-catalog-btn");
      if (btn2) btn2.style.boxShadow = "0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)";
      return;
    }
    _catalogPanelOpen = true;
    const btn = document.getElementById("wspp-catalog-btn");
    if (btn) btn.style.boxShadow = "0 0 0 3px rgba(0,168,132,.4), 0 4px 16px rgba(0,168,132,.5)";
    if (_catalogItems.length === 0 && !_catalogLoading) {
      _catalogLoading = true;
      window.postMessage({ type: "FETCH_AUDIO_CATALOG" }, WA_ORIGIN);
    }
    if (_catalogCategories.length === 0 && !_catalogCategoriesLoading) {
      _catalogCategoriesLoading = true;
      window.postMessage({ type: "FETCH_CATALOG_CATEGORIES" }, WA_ORIGIN);
    }
    renderCatalogPanel();
  }
  function renderCatalogPanel() {
    injectCatalogStyles();
    let panel = document.getElementById("wspp-catalog-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "wspp-catalog-panel";
      Object.assign(panel.style, {
        position: "fixed",
        bottom: "148px",
        right: "16px",
        zIndex: "99999",
        width: "340px",
        background: "#1c1c1e",
        borderRadius: "20px",
        boxShadow: "0 12px 48px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.07)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
        animation: "wspp-slide-up .25s cubic-bezier(.16,1,.3,1)",
        maxHeight: "560px"
      });
      document.body.appendChild(panel);
    }
    panel.innerHTML = "";
    if (_catalogView === "detail" && _catalogDetailId) {
      _renderDetailView(panel);
    } else if (_catalogView === "create") {
      _renderCreateView(panel);
    } else if (_catalogView === "category" && _catalogCategory) {
      _renderCategoryView(panel);
    } else {
      _catalogView = "grid";
      _renderGridView(panel);
    }
  }
  function _mkHeader(title, onBack, rightEl) {
    const hdr = document.createElement("div");
    Object.assign(hdr.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "13px 14px 10px",
      borderBottom: "1px solid rgba(255,255,255,.06)",
      flexShrink: "0",
      background: "#1c1c1e"
    });
    if (onBack) {
      const back = document.createElement("button");
      back.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
      Object.assign(back.style, {
        background: "none",
        border: "none",
        color: "#00a884",
        cursor: "pointer",
        padding: "2px",
        display: "flex",
        alignItems: "center",
        flexShrink: "0"
      });
      back.addEventListener("click", onBack);
      hdr.appendChild(back);
    } else {
      const pill = document.createElement("div");
      Object.assign(pill.style, {
        width: "28px",
        height: "28px",
        borderRadius: "8px",
        background: "linear-gradient(135deg,#00a884,#007a62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        flexShrink: "0"
      });
      pill.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
      hdr.appendChild(pill);
    }
    const titleEl = document.createElement("div");
    Object.assign(titleEl.style, {
      flex: "1",
      color: "#fff",
      fontSize: "15px",
      fontWeight: "700",
      letterSpacing: "-.2px"
    });
    titleEl.textContent = title;
    hdr.appendChild(titleEl);
    if (rightEl) {
      hdr.appendChild(rightEl);
    }
    const closeX = document.createElement("button");
    closeX.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    Object.assign(closeX.style, {
      width: "26px",
      height: "26px",
      borderRadius: "50%",
      background: "rgba(255,255,255,.1)",
      border: "none",
      color: "#8696a0",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0"
    });
    closeX.addEventListener("click", _closePanel);
    hdr.appendChild(closeX);
    return hdr;
  }
  function _closePanel() {
    const panel = document.getElementById("wspp-catalog-panel");
    if (panel) panel.remove();
    _catalogPanelOpen = false;
    _catalogView = "grid";
    _catalogDetailId = null;
    _catalogCategory = null;
    _catalogEditingId = null;
    const fab = document.getElementById("wspp-catalog-btn");
    if (fab) fab.style.boxShadow = "0 4px 16px rgba(0,168,132,.45), 0 2px 4px rgba(0,0,0,.3)";
  }
  function _renderGridView(panel) {
    const loading = _catalogLoading && _catalogItems.length === 0;
    let addBtn = null;
    if (_catalogIsConsultor) {
      addBtn = document.createElement("button");
      addBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      Object.assign(addBtn.style, {
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        background: "rgba(0,168,132,.15)",
        border: "none",
        color: "#00a884",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0"
      });
      addBtn.title = "Crear nueva plantilla";
      addBtn.addEventListener("click", () => {
        _catalogCategory = null;
        _catalogView = "create";
        renderCatalogPanel();
      });
    }
    panel.appendChild(_mkHeader("C\xE9sar V\xE1squez", null, addBtn));
    const body = document.createElement("div");
    Object.assign(body.style, {
      overflowY: "auto",
      flex: "1",
      padding: "10px",
      scrollbarWidth: "thin",
      scrollbarColor: "#3a3a3c transparent"
    });
    if (loading) {
      const wrap = document.createElement("div");
      Object.assign(wrap.style, { display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0", gap: "10px" });
      const sp = document.createElement("div");
      Object.assign(sp.style, { width: "22px", height: "22px", borderRadius: "50%", border: "3px solid rgba(0,168,132,.2)", borderTopColor: "#00a884" });
      sp.classList.add("wspp-spinning");
      const txt = document.createElement("div");
      Object.assign(txt.style, { color: "#8e8e93", fontSize: "12px" });
      txt.textContent = "Cargando...";
      wrap.appendChild(sp);
      wrap.appendChild(txt);
      body.appendChild(wrap);
    } else if (_catalogItems.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, { color: "#8e8e93", textAlign: "center", padding: "32px 0", fontSize: "13px" });
      empty.textContent = "No hay plantillas disponibles";
      body.appendChild(empty);
    } else {
      const grouped = {};
      _catalogItems.forEach((item) => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      });
      _catalogCategories.forEach((cat) => {
        if (!grouped[cat.key]) grouped[cat.key] = [];
      });
      const allCats = Object.keys(grouped).sort((a, b) => _getCatSortOrder(a) - _getCatSortOrder(b));
      const grid = document.createElement("div");
      Object.assign(grid.style, {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "7px"
      });
      allCats.forEach((cat) => {
        const items = grouped[cat];
        const colors = _getCatColors(cat);
        const catSvg = _getCatIcon(cat);
        const readyCount = items.filter((i) => i.has_audio).length;
        const tile = document.createElement("div");
        Object.assign(tile.style, {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "9px 4px 7px",
          borderRadius: "13px",
          background: "#2c2c2e",
          cursor: "pointer",
          transition: "transform .12s, background .12s",
          position: "relative",
          minHeight: "72px"
        });
        const iconWrap = document.createElement("div");
        Object.assign(iconWrap.style, {
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background: colors.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.accent,
          marginBottom: "5px",
          boxShadow: `0 2px 8px ${colors.accent}28`
        });
        iconWrap.innerHTML = catSvg;
        iconWrap.querySelector("svg").setAttribute("width", "20");
        iconWrap.querySelector("svg").setAttribute("height", "20");
        const lbl = document.createElement("div");
        Object.assign(lbl.style, {
          fontSize: "9px",
          fontWeight: "700",
          color: "#ebebf5",
          textAlign: "center",
          lineHeight: "1.2",
          width: "100%",
          padding: "0 2px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        });
        lbl.textContent = _getCatLabel(cat);
        const badge = document.createElement("div");
        Object.assign(badge.style, {
          position: "absolute",
          bottom: "5px",
          left: "6px",
          minWidth: "16px",
          height: "16px",
          borderRadius: "8px",
          background: readyCount > 0 ? colors.accent : "#636366",
          color: "#fff",
          fontSize: "9px",
          fontWeight: "800",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 4px"
        });
        badge.textContent = String(items.length);
        tile.appendChild(iconWrap);
        tile.appendChild(lbl);
        tile.appendChild(badge);
        tile.addEventListener("mousedown", () => {
          tile.style.transform = "scale(.93)";
          tile.style.background = "#3a3a3c";
        });
        tile.addEventListener("mouseup", () => {
          tile.style.transform = "scale(1)";
          tile.style.background = "#2c2c2e";
        });
        tile.addEventListener("mouseleave", () => {
          tile.style.transform = "scale(1)";
          tile.style.background = "#2c2c2e";
        });
        tile.addEventListener("click", () => {
          _catalogCategory = cat;
          _catalogView = "category";
          renderCatalogPanel();
        });
        grid.appendChild(tile);
      });
      body.appendChild(grid);
    }
    panel.appendChild(body);
    panel.appendChild(_mkStatusBar());
  }
  function _renderCategoryView(panel) {
    const cat = _catalogCategory;
    const items = _catalogItems.filter((i) => i.category === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const colors = _getCatColors(cat);
    let rightBtns = null;
    if (_catalogIsConsultor) {
      rightBtns = document.createElement("div");
      Object.assign(rightBtns.style, { display: "flex", alignItems: "center", gap: "4px", flexShrink: "0" });
      const addBtn = document.createElement("button");
      addBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      Object.assign(addBtn.style, {
        width: "26px",
        height: "26px",
        borderRadius: "50%",
        background: `${colors.accent}22`,
        border: "none",
        color: colors.accent,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      });
      addBtn.title = "Agregar plantilla en esta categor\xEDa";
      addBtn.addEventListener("click", () => {
        _catalogView = "create";
        renderCatalogPanel();
      });
      rightBtns.appendChild(addBtn);
      const delCatBtn = document.createElement("button");
      delCatBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
      Object.assign(delCatBtn.style, {
        width: "26px",
        height: "26px",
        borderRadius: "50%",
        background: "rgba(239,83,80,.12)",
        border: "none",
        color: "#ef5350",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      });
      delCatBtn.title = "Eliminar categor\xEDa (y todos sus audios)";
      delCatBtn.addEventListener("click", () => {
        const catLabel = _getCatLabel(cat);
        if (!confirm(`\xBFEliminar la categor\xEDa "${catLabel}" y TODOS sus audios? Esta acci\xF3n no se puede deshacer.`)) return;
        const catId = _getCatId(cat);
        if (!catId) {
          _showCatalogStatus("Categor\xEDa no encontrada en API", "#ef5350", 3e3);
          return;
        }
        _handleDeleteCategory(catId, cat, delCatBtn);
      });
      rightBtns.appendChild(delCatBtn);
    }
    panel.appendChild(_mkHeader(
      _getCatLabel(cat),
      () => {
        _catalogView = "grid";
        renderCatalogPanel();
      },
      rightBtns
    ));
    const body = document.createElement("div");
    Object.assign(body.style, {
      overflowY: "auto",
      flex: "1",
      scrollbarWidth: "thin",
      scrollbarColor: "#3a3a3c transparent"
    });
    if (items.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, { color: "#8e8e93", textAlign: "center", padding: "28px 0", fontSize: "12px" });
      empty.textContent = "Sin plantillas en esta categor\xEDa";
      body.appendChild(empty);
    } else {
      items.forEach((item, idx) => {
        const row = document.createElement("div");
        row.className = "wspp-catalog-item";
        const isLast = idx === items.length - 1;
        Object.assign(row.style, {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,.05)",
          cursor: item.has_audio ? "pointer" : "default",
          transition: "background .1s",
          position: "relative"
        });
        const iconCol = document.createElement("div");
        Object.assign(iconCol.style, {
          width: "32px",
          height: "32px",
          borderRadius: "9px",
          flexShrink: "0",
          background: item.has_audio ? colors.bg : "rgba(99,99,102,.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: item.has_audio ? colors.accent : "#636366"
        });
        iconCol.innerHTML = item.has_audio ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
        const textCol = document.createElement("div");
        Object.assign(textCol.style, { flex: "1", minWidth: "0" });
        const rowLabel = document.createElement("div");
        Object.assign(rowLabel.style, {
          fontSize: "13px",
          fontWeight: "600",
          color: item.has_audio ? "#e9edef" : "#636366",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        });
        rowLabel.textContent = item.label;
        const rowDesc = document.createElement("div");
        Object.assign(rowDesc.style, {
          fontSize: "11px",
          color: "#636366",
          marginTop: "1px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        });
        const dur = _fmtDuration(item.duration_ms);
        rowDesc.textContent = item.description || (dur ? `\u23F1 ${dur}` : "");
        textCol.appendChild(rowLabel);
        if (item.description || dur) textCol.appendChild(rowDesc);
        row.appendChild(iconCol);
        row.appendChild(textCol);
        if (_catalogIsConsultor) {
          const editBtn = document.createElement("button");
          editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
          Object.assign(editBtn.style, {
            background: "rgba(255,255,255,.06)",
            border: "none",
            color: "#8696a0",
            cursor: "pointer",
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: "0",
            transition: "background .12s, color .12s"
          });
          const _eAccent = colors.accent;
          editBtn.addEventListener("mouseenter", () => {
            editBtn.style.background = `${_eAccent}22`;
            editBtn.style.color = _eAccent;
          });
          editBtn.addEventListener("mouseleave", () => {
            editBtn.style.background = "rgba(255,255,255,.06)";
            editBtn.style.color = "#8696a0";
          });
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            _catalogDetailId = item.id;
            _catalogView = "detail";
            renderCatalogPanel();
          });
          row.appendChild(editBtn);
        }
        if (item.has_audio) {
          row.addEventListener("mouseenter", () => {
            row.style.background = "rgba(255,255,255,.04)";
          });
          row.addEventListener("mouseleave", () => {
            row.style.background = "transparent";
          });
          row.addEventListener("click", () => handleCatalogItemClick(item.id, item.label));
        }
        body.appendChild(row);
      });
    }
    panel.appendChild(body);
    panel.appendChild(_mkStatusBar());
  }
  function _renderDetailView(panel) {
    const item = _catalogItems.find((i) => i.id === _catalogDetailId);
    if (!item) {
      _catalogView = "category";
      renderCatalogPanel();
      return;
    }
    const colors = _getCatColors(item.category);
    const catSvg = _getCatIcon(item.category);
    const dur = _fmtDuration(item.duration_ms);
    panel.appendChild(_mkHeader(item.label, () => {
      _catalogView = "category";
      renderCatalogPanel();
    }));
    const body = document.createElement("div");
    Object.assign(body.style, { overflowY: "auto", flex: "1", padding: "14px" });
    const metaRow = document.createElement("div");
    Object.assign(metaRow.style, { display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" });
    const iconBig = document.createElement("div");
    Object.assign(iconBig.style, {
      width: "48px",
      height: "48px",
      borderRadius: "13px",
      background: colors.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: colors.accent,
      flexShrink: "0"
    });
    iconBig.innerHTML = catSvg;
    iconBig.querySelector("svg").setAttribute("width", "24");
    iconBig.querySelector("svg").setAttribute("height", "24");
    const metaText = document.createElement("div");
    const catBadge = document.createElement("div");
    Object.assign(catBadge.style, {
      display: "inline-block",
      fontSize: "10px",
      fontWeight: "700",
      color: colors.accent,
      background: colors.bg,
      padding: "2px 8px",
      borderRadius: "20px",
      marginBottom: "4px",
      textTransform: "uppercase"
    });
    catBadge.textContent = _getCatLabel(item.category);
    const descEl = document.createElement("div");
    Object.assign(descEl.style, { fontSize: "11px", color: "#8e8e93", lineHeight: "1.4" });
    descEl.textContent = item.description || "";
    const durEl = document.createElement("div");
    Object.assign(durEl.style, { fontSize: "10px", color: "#636366", marginTop: "2px" });
    durEl.textContent = dur ? `\u23F1 ${dur}` : "";
    metaText.appendChild(catBadge);
    metaText.appendChild(descEl);
    if (dur) metaText.appendChild(durEl);
    metaRow.appendChild(iconBig);
    metaRow.appendChild(metaText);
    body.appendChild(metaRow);
    body.appendChild(_mkDetailLabel("Gui\xF3n"));
    const textarea = document.createElement("textarea");
    textarea.id = "wspp-detail-script";
    textarea.className = "wspp-edit-area";
    textarea.value = item.script_text || "";
    Object.assign(textarea.style, {
      width: "100%",
      minHeight: "88px",
      padding: "10px 12px",
      background: "#2c2c2e",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "12px",
      color: "#e9edef",
      fontSize: "12px",
      lineHeight: "1.6",
      fontFamily: "inherit",
      boxSizing: "border-box",
      marginBottom: "10px"
    });
    body.appendChild(textarea);
    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", flexDirection: "column", gap: "8px" });
    const saveBtn = _mkActionBtn("Guardar gui\xF3n", "#00a884", CATALOG_SVG.check);
    saveBtn.addEventListener("click", () => {
      const s = textarea.value.trim();
      if (!s) return;
      _handleUpdateScript(item.id, s, saveBtn);
    });
    actions.appendChild(saveBtn);
    const regenBtn = _mkActionBtn("Regenerar audio", "#818cf8", CATALOG_SVG.refresh);
    regenBtn.addEventListener("click", () => _handleRegenerate(item.id, regenBtn));
    actions.appendChild(regenBtn);
    const delBtn = _mkActionBtn(
      "Eliminar plantilla",
      "#ef5350",
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`
    );
    Object.assign(delBtn.style, { background: "rgba(239,83,80,.12)", color: "#ef5350" });
    delBtn.addEventListener("click", () => {
      if (!confirm(`\xBFEliminar "${item.label}"? Esta acci\xF3n no se puede deshacer.`)) return;
      _handleDeleteItem(item.id, delBtn);
    });
    actions.appendChild(delBtn);
    body.appendChild(actions);
    panel.appendChild(body);
    panel.appendChild(_mkStatusBar());
  }
  function _renderCreateView(panel) {
    const preselectedCat = _catalogView === "create" && _catalogCategory ? _catalogCategory : _catalogCategories[0]?.key || "saludo";
    const backTarget = _catalogCategory ? "category" : "grid";
    panel.appendChild(_mkHeader("Nueva plantilla", () => {
      _catalogView = backTarget;
      renderCatalogPanel();
    }));
    const CATEGORY_OPTIONS = _catalogCategories.length > 0 ? _catalogCategories.map((c) => ({ value: c.key, label: c.label })) : Object.entries(_FALLBACK_LABELS).map(([k, v]) => ({ value: k, label: v }));
    const body = document.createElement("div");
    Object.assign(body.style, { overflowY: "auto", flex: "1", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" });
    body.appendChild(_mkDetailLabel("Nombre"));
    const labelInput = _mkTextInput("Ej: Saludo inicial");
    body.appendChild(labelInput);
    body.appendChild(_mkDetailLabel("Descripci\xF3n corta"));
    const descInput = _mkTextInput("Para qui\xE9n es este audio");
    body.appendChild(descInput);
    body.appendChild(_mkDetailLabel("Categor\xEDa"));
    const catSel = document.createElement("select");
    Object.assign(catSel.style, {
      width: "100%",
      padding: "10px 12px",
      background: "#2c2c2e",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "12px",
      color: "#e9edef",
      fontSize: "13px",
      cursor: "pointer"
    });
    CATEGORY_OPTIONS.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === preselectedCat) o.selected = true;
      catSel.appendChild(o);
    });
    body.appendChild(catSel);
    body.appendChild(_mkDetailLabel("Gui\xF3n (texto que se convertir\xE1 en audio)"));
    const scriptArea = document.createElement("textarea");
    scriptArea.className = "wspp-edit-area";
    scriptArea.placeholder = "Hola, habla el doctor C\xE9sar V\xE1squez...";
    Object.assign(scriptArea.style, {
      width: "100%",
      minHeight: "88px",
      padding: "10px 12px",
      background: "#2c2c2e",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "12px",
      color: "#e9edef",
      fontSize: "12px",
      lineHeight: "1.6",
      fontFamily: "inherit",
      boxSizing: "border-box"
    });
    body.appendChild(scriptArea);
    body.appendChild(_mkDetailLabel("Orden de aparici\xF3n"));
    const sortInput = document.createElement("input");
    sortInput.type = "number";
    sortInput.min = "0";
    sortInput.max = "999";
    sortInput.value = "0";
    sortInput.placeholder = "0";
    Object.assign(sortInput.style, {
      width: "100%",
      padding: "10px 12px",
      background: "#2c2c2e",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "12px",
      color: "#e9edef",
      fontSize: "13px",
      fontFamily: "inherit",
      boxSizing: "border-box",
      outline: "none"
    });
    body.appendChild(sortInput);
    body.appendChild(_mkDetailLabel("Voice ID (opcional \u2014 dejar vac\xEDo para voz por defecto)"));
    const voiceInput = _mkTextInput("iaSdolcffUuIlEi5pdbj");
    body.appendChild(voiceInput);
    const createBtn = _mkActionBtn("Crear y generar audio", "#00a884", CATALOG_SVG.check);
    createBtn.addEventListener("click", () => {
      const label = labelInput.value.trim();
      const desc = descInput.value.trim();
      const cat = catSel.value;
      const script = scriptArea.value.trim();
      const sortOrder = parseInt(sortInput.value, 10) || 0;
      const voiceId = voiceInput.value.trim() || void 0;
      if (!label || !script) {
        _showCatalogStatus("Nombre y gui\xF3n son obligatorios", "#ef5350", 3e3);
        return;
      }
      _catalogCategory = cat;
      _handleCreateItem({ label, description: desc, category: cat, script_text: script, sort_order: sortOrder, voice_id: voiceId }, createBtn);
    });
    body.appendChild(createBtn);
    panel.appendChild(body);
    panel.appendChild(_mkStatusBar());
  }
  function _mkStatusBar() {
    const bar = document.createElement("div");
    bar.id = "wspp-catalog-status";
    Object.assign(bar.style, {
      padding: "0 14px",
      background: "#1c1c1e",
      borderTop: "1px solid rgba(255,255,255,.05)",
      color: "#8e8e93",
      fontSize: "12px",
      textAlign: "center",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      height: "0",
      overflow: "hidden",
      transition: "height .2s, padding .2s"
    });
    return bar;
  }
  function _mkDetailLabel(text) {
    const l = document.createElement("div");
    Object.assign(l.style, { fontSize: "11px", color: "#8e8e93", fontWeight: "600", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "4px" });
    l.textContent = text;
    return l;
  }
  function _mkTextInput(placeholder) {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.placeholder = placeholder;
    inp.className = "wspp-edit-area";
    Object.assign(inp.style, {
      width: "100%",
      padding: "10px 12px",
      background: "#2c2c2e",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: "12px",
      color: "#e9edef",
      fontSize: "13px",
      fontFamily: "inherit",
      boxSizing: "border-box",
      outline: "none"
    });
    return inp;
  }
  function _mkActionBtn(label, color, iconSvg) {
    const btn = document.createElement("button");
    btn.innerHTML = `<span style="display:flex;align-items:center;gap:6px;">${iconSvg}<span>${label}</span></span>`;
    Object.assign(btn.style, {
      width: "100%",
      padding: "11px",
      borderRadius: "12px",
      border: "none",
      background: `${color}22`,
      color,
      fontSize: "13px",
      fontWeight: "700",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background .15s"
    });
    btn.addEventListener("mouseenter", () => {
      btn.style.background = `${color}33`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = `${color}22`;
    });
    return btn;
  }
  function _handleRegenerate(itemId, btn) {
    const origContent = btn.innerHTML;
    const spinner = document.createElement("div");
    Object.assign(spinner.style, { width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#00a884", flexShrink: "0" });
    spinner.classList.add("wspp-spinning");
    btn.innerHTML = "";
    btn.appendChild(spinner);
    btn.disabled = true;
    _showCatalogStatus("Regenerando audio...", "#8696a0");
    window.postMessage({ type: "GENERATE_CATALOG_AUDIO", id: itemId }, WA_ORIGIN);
    _pendingRegenId = itemId;
    _pendingRegenBtn = { el: btn, orig: origContent };
  }
  function _handleUpdateScript(itemId, newScript, btn) {
    const origContent = btn.innerHTML;
    btn.textContent = "Guardando...";
    btn.disabled = true;
    window.postMessage({ type: "UPDATE_CATALOG_SCRIPT", id: itemId, script_text: newScript }, WA_ORIGIN);
    _pendingUpdateId = itemId;
    _pendingUpdateBtn = { el: btn, orig: origContent };
  }
  function _handleDeleteItem(itemId, btn) {
    const origContent = btn.innerHTML;
    btn.textContent = "Eliminando...";
    btn.disabled = true;
    window.postMessage({ type: "DELETE_CATALOG_ITEM", id: itemId }, WA_ORIGIN);
    _pendingDeleteId = itemId;
    _pendingDeleteBtn = { el: btn, orig: origContent };
  }
  function _handleCreateItem(data, btn) {
    const origContent = btn.innerHTML;
    btn.textContent = "Creando...";
    btn.disabled = true;
    window.postMessage({ type: "CREATE_CATALOG_ITEM", data }, WA_ORIGIN);
    _pendingCreateBtn = { el: btn, orig: origContent };
  }
  function _handleDeleteCategory(catId, catKey, btn) {
    const origContent = btn.innerHTML;
    btn.innerHTML = "";
    const spinner = document.createElement("div");
    Object.assign(spinner.style, { width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,.2)", borderTopColor: "#ef5350" });
    spinner.classList.add("wspp-spinning");
    btn.appendChild(spinner);
    btn.disabled = true;
    window.postMessage({ type: "DELETE_CATALOG_CATEGORY", id: catId }, WA_ORIGIN);
    _pendingDeleteCatBtn = { el: btn, orig: origContent, catKey };
  }
  function _showCatalogStatus(text, color, duration) {
    const bar = document.getElementById("wspp-catalog-status");
    if (!bar) return;
    bar.textContent = text;
    bar.style.color = color || "#8696a0";
    bar.style.display = "flex";
    bar.style.height = "36px";
    bar.style.padding = "0 16px";
    if (duration) {
      setTimeout(() => {
        bar.style.height = "0";
        bar.style.padding = "0 16px";
        setTimeout(() => {
          bar.style.display = "none";
        }, 200);
      }, duration);
    }
  }
  function handleCatalogItemClick(audioId, label) {
    if (!audioId) return;
    _showCatalogStatus("Cargando audio...", "#8696a0");
    document.querySelectorAll(".wspp-catalog-item").forEach((el) => {
      el.style.pointerEvents = "none";
      el.style.opacity = "0.5";
    });
    window.postMessage({ type: "GET_CATALOG_AUDIO", id: audioId }, WA_ORIGIN);
  }
  async function _generateWaveform(audioFile) {
    try {
      const audioData = await audioFile.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const rawData = audioBuffer.getChannelData(0);
      const samples = 64;
      const blockSize = Math.floor(rawData.length / samples);
      const filteredData = [];
      for (let i = 0; i < samples; i++) {
        const blockStart = blockSize * i;
        let sum = 0;
        for (let j = 0; j < blockSize; j++) sum += Math.abs(rawData[blockStart + j]);
        filteredData.push(sum / blockSize);
      }
      const multiplier = Math.pow(Math.max(...filteredData), -1);
      return new Uint8Array(filteredData.map((n) => Math.floor(100 * n * multiplier)));
    } catch (e) {
      console.warn("[WSPP CATALOG] Waveform generation failed (non-fatal):", e.message);
      return void 0;
    }
  }
  async function sendAudioAsPTT(audioBase64, mimeType) {
    const mime = mimeType || "audio/ogg; codecs=opus";
    try {
      if (typeof window.require !== "function") {
        console.error("[WSPP CATALOG] window.require not available \u2014 WA Web still loading?");
        return false;
      }
      const chatJid = _lastActiveChatJid;
      if (!chatJid) {
        console.error("[WSPP CATALOG] No active chat JID \u2014 open a conversation first");
        return false;
      }
      let chat = null;
      try {
        const Collections = window.require("WAWebCollections");
        const widFactory = window.require("WAWebWidFactory");
        const wid = widFactory.createWid(chatJid);
        chat = Collections.Chat.get(wid);
        if (!chat) {
          const FindChat = window.require("WAWebFindChatAction");
          const result = await FindChat.findOrCreateLatestChat(wid);
          chat = result?.chat ?? result;
        }
      } catch (err) {
        console.error("[WSPP CATALOG] Failed to resolve chat model:", err);
        return false;
      }
      if (!chat) {
        console.error("[WSPP CATALOG] Chat model not found for JID:", chatJid);
        return false;
      }
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], "voice_cesar_vasquez.ogg", { type: mime, lastModified: Date.now() });
      const OpaqueData = window.require("WAWebMediaOpaqueData");
      const opaqueData = await OpaqueData.createFromData(file, mime);
      const { prepRawMedia } = window.require("WAWebPrepRawMedia");
      const mediaPrep = prepRawMedia(opaqueData, {
        isPtt: true,
        asSticker: false,
        asGif: false,
        asDocument: false
      });
      const mediaData = await mediaPrep.waitForPrep();
      console.log("[WSPP CATALOG] prepRawMedia done, type:", mediaData.type, "filehash:", mediaData.filehash?.slice(0, 12));
      const waveform = await _generateWaveform(file);
      if (waveform) mediaData.waveform = waveform;
      const { getOrCreateMediaObject } = window.require("WAWebMediaStorage");
      const mediaObject = getOrCreateMediaObject(mediaData.filehash);
      const { msgToMediaType } = window.require("WAWebMmsMediaTypes");
      const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });
      if (!(mediaData.mediaBlob instanceof OpaqueData)) {
        mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
      }
      mediaData.renderableUrl = mediaData.mediaBlob.url();
      mediaObject.consolidate(mediaData.toJSON());
      mediaData.mediaBlob.autorelease();
      const { uploadMedia } = window.require("WAWebMediaMmsV4Upload");
      const uploadedMedia = await uploadMedia({ mimetype: mediaData.mimetype, mediaObject, mediaType });
      const mediaEntry = uploadedMedia?.mediaEntry;
      if (!mediaEntry) throw new Error("Upload failed: no mediaEntry returned");
      mediaData.set({
        clientUrl: mediaEntry.mmsUrl,
        deprecatedMms3Url: mediaEntry.deprecatedMms3Url,
        directPath: mediaEntry.directPath,
        mediaKey: mediaEntry.mediaKey,
        mediaKeyTimestamp: mediaEntry.mediaKeyTimestamp,
        filehash: mediaObject.filehash,
        encFilehash: mediaEntry.encFilehash,
        uploadhash: mediaEntry.uploadHash,
        size: mediaObject.size,
        streamingSidecar: mediaEntry.sidecar,
        firstFrameSidecar: mediaEntry.firstFrameSidecar
      });
      console.log("[WSPP CATALOG] Upload done, directPath:", mediaEntry.directPath?.slice(0, 30));
      const { getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
      const meUser = getMaybeMePnUser();
      const newId = await window.require("WAWebMsgKey").newId();
      const MsgKey = window.require("WAWebMsgKey");
      const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: "out" });
      const ephemeralFields = window.require("WAWebGetEphemeralFieldsMsgActionsUtils").getEphemeralFields(chat);
      const mediaJSON = mediaData.toJSON ? mediaData.toJSON() : mediaData;
      const message = {
        ...mediaJSON,
        ...ephemeralFields,
        id: newMsgKey,
        ack: 0,
        from: meUser,
        to: chat.id,
        local: true,
        self: "out",
        t: Math.floor(Date.now() / 1e3),
        isNewMsg: true,
        type: "ptt",
        mimetype: mime
      };
      const { addAndSendMsgToChat } = window.require("WAWebSendMsgChatAction");
      const [msgPromise] = addAndSendMsgToChat(chat, message);
      await msgPromise;
      console.log("[WSPP CATALOG] PTT voice note sent to", chatJid);
      return true;
    } catch (err) {
      console.error("[WSPP CATALOG] PTT send error:", err.message, err.stack?.slice(0, 300));
      return false;
    }
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "AUDIO_CATALOG_READY") {
      _catalogLoading = false;
      if (e.data.ok && e.data.items) {
        _catalogItems = e.data.items;
        console.log("[WSPP CATALOG] Loaded", _catalogItems.length, "items");
      } else {
        console.warn("[WSPP CATALOG] Error loading catalog:", e.data.error);
      }
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    if (e.data?.type === "CATALOG_AUDIO_READY") {
      if (!e.data.ok || !e.data.audioBase64) {
        console.error("[WSPP CATALOG] Audio error:", e.data.error);
        _showCatalogStatus("Error: " + (e.data.error || "audio no disponible"), "#ef5350", 3500);
        document.querySelectorAll(".wspp-catalog-item").forEach((el) => {
          el.style.pointerEvents = "";
          el.style.opacity = "";
        });
        return;
      }
      _showCatalogStatus("Enviando nota de voz...", "#00a884");
      sendAudioAsPTT(e.data.audioBase64, e.data.mimeType).then((ok) => {
        if (ok) {
          _showCatalogStatus((e.data.label || "Audio") + " \u2014 enviado \u2713", "#00a884", 3e3);
          console.log("[WSPP CATALOG] PTT voice note sent successfully");
        } else {
          _showCatalogStatus("Error al enviar \u2014 abre un chat primero", "#ef5350", 3500);
        }
        setTimeout(() => {
          document.querySelectorAll(".wspp-catalog-item").forEach((el) => {
            el.style.pointerEvents = "";
            el.style.opacity = "";
          });
        }, 1200);
      });
      return;
    }
    if (e.data?.type === "GENERATE_CATALOG_AUDIO_DONE") {
      if (_pendingRegenBtn) {
        _pendingRegenBtn.el.innerHTML = _pendingRegenBtn.orig;
        _pendingRegenBtn.el.disabled = false;
        _pendingRegenBtn = null;
      }
      if (e.data.ok) {
        const idx = _catalogItems.findIndex((i) => i.id === e.data.id);
        if (idx >= 0) {
          _catalogItems[idx] = { ..._catalogItems[idx], has_audio: true, audio_size: e.data.audioSize, duration_ms: e.data.durationMs };
        }
        window.postMessage({ type: "BUST_AUDIO_CACHE", id: e.data.id }, WA_ORIGIN);
        _showCatalogStatus("Audio regenerado \u2713", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al regenerar: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      _pendingRegenId = null;
      return;
    }
    if (e.data?.type === "UPDATE_CATALOG_SCRIPT_DONE") {
      if (_pendingUpdateBtn) {
        _pendingUpdateBtn.el.innerHTML = _pendingUpdateBtn.orig;
        _pendingUpdateBtn.el.disabled = false;
        _pendingUpdateBtn = null;
      }
      if (e.data.ok) {
        const idx = _catalogItems.findIndex((i) => i.id === e.data.id);
        if (idx >= 0) {
          _catalogItems[idx] = { ..._catalogItems[idx], script_text: e.data.script_text, has_audio: false, audio_size: 0, duration_ms: 0 };
        }
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogEditingId = null;
        _showCatalogStatus("Gui\xF3n guardado \u2014 regener\xE1 el audio \u2713", "#00a884", 3e3);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al guardar: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      _pendingUpdateId = null;
      return;
    }
    if (e.data?.type === "DELETE_CATALOG_ITEM_DONE") {
      if (_pendingDeleteBtn) {
        _pendingDeleteBtn.el.innerHTML = _pendingDeleteBtn.orig;
        _pendingDeleteBtn.el.disabled = false;
        _pendingDeleteBtn = null;
      }
      if (e.data.ok) {
        _catalogItems = _catalogItems.filter((i) => i.id !== e.data.id);
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogView = "category";
        _catalogDetailId = null;
        _showCatalogStatus("Plantilla eliminada \u2713", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al eliminar: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      _pendingDeleteId = null;
      return;
    }
    if (e.data?.type === "CREATE_CATALOG_ITEM_DONE") {
      if (_pendingCreateBtn) {
        _pendingCreateBtn.el.innerHTML = _pendingCreateBtn.orig;
        _pendingCreateBtn.el.disabled = false;
        _pendingCreateBtn = null;
      }
      if (e.data.ok && e.data.item) {
        _catalogItems.push(e.data.item);
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogCategory = e.data.item.category;
        _catalogView = "category";
        if (e.data.audio_generated) {
          _showCatalogStatus("Plantilla creada con audio \u2713", "#00a884", 3e3);
        } else if (e.data.audio_error) {
          _showCatalogStatus("Plantilla creada \u2014 audio fall\xF3: " + e.data.audio_error.slice(0, 60), "#f59e0b", 5e3);
        } else {
          _showCatalogStatus("Plantilla creada \u2014 gener\xE1 el audio \u2713", "#00a884", 3e3);
        }
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al crear: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      return;
    }
    if (e.data?.type === "CATALOG_CATEGORIES_READY") {
      _catalogCategoriesLoading = false;
      if (e.data.ok && e.data.categories) {
        _catalogCategories = e.data.categories;
        console.log("[WSPP CATALOG] Loaded", _catalogCategories.length, "categories");
      } else {
        console.warn("[WSPP CATALOG] Error loading categories:", e.data.error);
      }
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    if (e.data?.type === "CREATE_CATALOG_CATEGORY_DONE") {
      if (e.data.ok && e.data.category) {
        _catalogCategories.push(e.data.category);
        _showCatalogStatus("Categor\xEDa creada \u2713", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al crear categor\xEDa: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      return;
    }
    if (e.data?.type === "DELETE_CATALOG_CATEGORY_DONE") {
      if (_pendingDeleteCatBtn) {
        _pendingDeleteCatBtn.el.innerHTML = _pendingDeleteCatBtn.orig;
        _pendingDeleteCatBtn.el.disabled = false;
      }
      if (e.data.ok) {
        const deletedKey = _pendingDeleteCatBtn?.catKey;
        _catalogCategories = _catalogCategories.filter((c) => c.id !== e.data.id);
        if (deletedKey) {
          _catalogItems = _catalogItems.filter((i) => i.category !== deletedKey);
        }
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogView = "grid";
        _catalogCategory = null;
        _showCatalogStatus("Categor\xEDa eliminada \u2713", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else {
        _showCatalogStatus("Error al eliminar categor\xEDa: " + (e.data.error || "intenta de nuevo"), "#ef5350", 4e3);
      }
      _pendingDeleteCatBtn = null;
      return;
    }
  });
  var MAX_CATALOG_BTN_RETRIES = 30;
  var _catalogBtnRetries = 0;
  function waitForChatAndInsertButton() {
    if (document.getElementById("wspp-catalog-btn")) return;
    if (document.querySelector("#main") || document.querySelector(".two")) {
      createCatalogButton();
      console.log("[WSPP CATALOG] Button inserted");
      return;
    }
    _catalogBtnRetries++;
    if (_catalogBtnRetries < MAX_CATALOG_BTN_RETRIES) {
      setTimeout(waitForChatAndInsertButton, 2e3);
    } else {
      console.warn("[WSPP CATALOG] Chat container not found after", MAX_CATALOG_BTN_RETRIES, "retries");
    }
  }

  // src/inject-entry.js
  if (document.readyState === "complete") {
    setTimeout(tryInstallWAListeners, 5e3);
  } else {
    window.addEventListener("load", () => setTimeout(tryInstallWAListeners, 5e3));
  }
  if (document.readyState === "complete") {
    setTimeout(waitForChatAndInsertButton, 3e3);
  } else {
    window.addEventListener("load", () => setTimeout(waitForChatAndInsertButton, 3e3));
  }
})();
