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
      const audioAdmin = !!e.data.perm_audio_admin;
      _catalogIsConsultor = ["admin", "consultor"].includes(role) || audioAdmin;
      console.log("[WSPP] user_role actualizado:", role, "| audio_admin:", audioAdmin, "| catalogCRUD:", _catalogIsConsultor);
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
  async function openChatByPhone(phone) {
    if (!phone || typeof phone !== "string") {
      return { ok: false, error: "No phone provided" };
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return { ok: false, error: "Invalid phone: " + phone };
    }
    if (typeof window.require !== "function") {
      return { ok: false, error: "WA Web not loaded (window.require missing)" };
    }
    try {
      const widFactory = window.require("WAWebWidFactory");
      const wid = widFactory.createWid(digits + "@c.us");
      const FindChat = window.require("WAWebFindChatAction");
      const result = await FindChat.findOrCreateLatestChat(wid);
      const chat = result?.chat ?? result;
      if (!chat) {
        return { ok: false, error: "Could not resolve chat for " + digits };
      }
      console.log("[WSPP] Chat opened for:", digits);
      return { ok: true };
    } catch (err) {
      console.error("[WSPP] openChatByPhone error:", err);
      return { ok: false, error: err.message || "Unknown error" };
    }
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
  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== "WSPP_OPEN_CHAT") return;
    const phone = e.data.phone;
    const result = await openChatByPhone(phone);
    window.postMessage({
      type: "WSPP_OPEN_CHAT_RESULT",
      ok: result.ok,
      error: result.error || null,
      phone
    }, WA_ORIGIN);
  });

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
  var _previewAudio = null;
  var _previewData = null;
  var _previewPlaying = false;
  var _previewLoadingId = null;
  var _previewRAF = null;
  var I = {
    mic: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`,
    refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    back: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`,
    plus: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    noaudio: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    stop: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  };
  var CAT_ICONS = {
    saludo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    agradecimiento: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
    pedir_voto: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    respuesta_trabajo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    respuesta_dinero: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    invitacion_evento: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    despedida: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    propuestas: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
    cuando_llaman: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    impulsar_canal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    agendar: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    apoyo_historico: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    opiniones: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    pedir_apoyo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    compartir_canal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    saludos: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,
    cerrar_conv: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`,
    compartir_mensaje: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    mantener_contacto: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
    responder_opiniones: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`
  };
  var _DEFAULT_ACCENT = "#8696a0";
  var _DEFAULT_SVG = I.mic;
  function _getCatLabel(k) {
    return _catalogCategories.find((c) => c.key === k)?.label || k;
  }
  function _hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${a})`;
  }
  function _getCatColors(k) {
    const cat = _catalogCategories.find((c) => c.key === k);
    const ac = cat?.color || _DEFAULT_ACCENT;
    return { bg: _hexToRgba(ac, 0.13), accent: ac };
  }
  function _getCatIcon(k) {
    const cat = _catalogCategories.find((c) => c.key === k);
    const ik = cat?.icon || k;
    return CAT_ICONS[ik] || CAT_ICONS[k] || _DEFAULT_SVG;
  }
  function _getCatSortOrder(k) {
    return _catalogCategories.find((c) => c.key === k)?.sort_order ?? 999;
  }
  function _getCatId(k) {
    return _catalogCategories.find((c) => c.key === k)?.id || null;
  }
  function _fmtDur(ms) {
    if (!ms) return "";
    const s = Math.round(ms / 1e3);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function _injectStyles() {
    if (document.getElementById("wspp-cat-css")) return;
    const s = document.createElement("style");
    s.id = "wspp-cat-css";
    s.textContent = `
    @keyframes wspp-su{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes wspp-sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    .wspp-sp{animation:wspp-sp .7s linear infinite}
    #wspp-cat-panel{position:fixed;bottom:128px;right:12px;z-index:99999;
      width:min(310px,calc(100vw - 24px));max-height:min(460px,calc(100vh - 170px));
      background:#111;border-radius:16px;overflow:hidden;display:flex;flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;
      animation:wspp-su .2s cubic-bezier(.16,1,.3,1);
      box-shadow:0 8px 40px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06)}
    #wspp-cat-panel *{box-sizing:border-box}
    .wc-hdr{display:flex;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;background:#111}
    .wc-body{overflow-y:auto;flex:1;scrollbar-width:thin;scrollbar-color:#333 transparent}
    .wc-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .1s}
    .wc-row:hover{background:rgba(255,255,255,.04)}
    .wc-row:last-child{border-bottom:none}
    .wc-chip{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:20px;cursor:pointer;transition:transform .1s,background .1s;white-space:nowrap;flex-shrink:0;border:none;font-family:inherit}
    .wc-chip:active{transform:scale(.93)}
    .wc-ibtn{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:opacity .12s}
    .wc-ibtn:hover{opacity:.8}
    .wc-input{width:100%;padding:8px 10px;background:#1a1a1c;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#e9edef;font-size:12px;font-family:inherit;outline:none}
    .wc-input:focus{border-color:#00a884}
    .wc-textarea{resize:none;min-height:64px;line-height:1.5}
    .wc-btn{width:100%;padding:9px;border-radius:10px;border:none;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:background .15s;font-family:inherit}
    .wc-lbl{font-size:10px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px}
    .wc-toast{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;pointer-events:none;z-index:10;transition:opacity .3s;white-space:nowrap;max-width:90%}
    select.wc-input option{background:#1a1a1c;color:#e9edef}
    .wc-preview{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#1a1a1c;border-top:1px solid rgba(255,255,255,.08);flex-shrink:0}
    .wc-preview-play{width:30px;height:30px;border-radius:50%;border:none;background:#00a884;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .12s}
    .wc-preview-play:hover{background:#00c49a}
    .wc-preview-play:active{transform:scale(.92)}
    .wc-preview-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .wc-preview-name{font-size:11px;font-weight:600;color:#e9edef;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wc-preview-track{position:relative;width:100%;height:4px;background:rgba(255,255,255,.08);border-radius:2px;cursor:pointer}
    .wc-preview-fill{position:absolute;left:0;top:0;height:100%;background:#00a884;border-radius:2px;transition:width .05s linear}
    .wc-preview-time{font-size:9px;color:#666;font-variant-numeric:tabular-nums}
    .wc-preview-send{height:28px;padding:0 10px;border-radius:14px;border:none;background:#00a884;color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;transition:background .12s;font-family:inherit;white-space:nowrap}
    .wc-preview-send:hover{background:#00c49a}
    .wc-preview-send:active{transform:scale(.95)}
  `;
    (document.head || document.documentElement).appendChild(s);
  }
  function _el(tag, styles, attrs) {
    const e = document.createElement(tag);
    if (styles) Object.assign(e.style, styles);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (k === "cls") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "txt") e.textContent = v;
      else e.setAttribute(k, v);
    });
    return e;
  }
  function _iconBtn(svg, color, title, onClick) {
    const b = _el("button", { color: color || "#8696a0", width: "24px", height: "24px", borderRadius: "6px", flexShrink: "0" }, { cls: "wc-ibtn", html: svg, title: title || "" });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
  }
  function createCatalogButton() {
    const btn = _el("button", {
      position: "fixed",
      bottom: "72px",
      right: "18px",
      zIndex: "99999",
      width: "44px",
      height: "44px",
      borderRadius: "50%",
      border: "none",
      background: "linear-gradient(135deg,#00a884,#008f72)",
      color: "#fff",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 3px 12px rgba(0,168,132,.4), 0 1px 3px rgba(0,0,0,.3)",
      transition: "box-shadow .2s, transform .15s"
    }, { html: I.mic });
    btn.id = "wspp-catalog-btn";
    btn.title = "Audios C\xE9sar V\xE1squez";
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
    const existing = document.getElementById("wspp-cat-panel");
    if (existing) {
      _closePanel();
      return;
    }
    _catalogPanelOpen = true;
    const fab = document.getElementById("wspp-catalog-btn");
    if (fab) fab.style.boxShadow = "0 0 0 3px rgba(0,168,132,.35), 0 3px 12px rgba(0,168,132,.4)";
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
  function _closePanel() {
    _destroyPreview();
    const p = document.getElementById("wspp-cat-panel");
    if (p) p.remove();
    _catalogPanelOpen = false;
    _catalogView = "grid";
    _catalogDetailId = null;
    _catalogCategory = null;
    _catalogEditingId = null;
    const fab = document.getElementById("wspp-catalog-btn");
    if (fab) fab.style.boxShadow = "0 3px 12px rgba(0,168,132,.4), 0 1px 3px rgba(0,0,0,.3)";
  }
  function renderCatalogPanel() {
    _injectStyles();
    let panel = document.getElementById("wspp-cat-panel");
    if (!panel) {
      panel = _el("div");
      panel.id = "wspp-cat-panel";
      document.body.appendChild(panel);
    }
    panel.innerHTML = "";
    if (_catalogView === "detail" && _catalogDetailId) _renderDetail(panel);
    else if (_catalogView === "create") _renderCreate(panel);
    else if (_catalogView === "category" && _catalogCategory) _renderCategory(panel);
    else {
      _catalogView = "grid";
      _renderGrid(panel);
    }
    if (_previewData || _previewLoadingId) _renderPreviewBar(panel);
  }
  function _mkHdr(title, onBack, rightEls) {
    const h = _el("div", {}, { cls: "wc-hdr" });
    if (onBack) {
      h.appendChild(_iconBtn(I.back, "#00a884", "Volver", onBack));
    } else {
      const pill = _el("div", { width: "24px", height: "24px", borderRadius: "7px", background: "linear-gradient(135deg,#00a884,#007a62)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: "0" }, { html: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>` });
      h.appendChild(pill);
    }
    const t = _el("div", { flex: "1", color: "#fff", fontSize: "13px", fontWeight: "700", letterSpacing: "-.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, { txt: title });
    h.appendChild(t);
    if (rightEls) rightEls.forEach((el) => h.appendChild(el));
    h.appendChild(_iconBtn(I.close, "#666", "Cerrar", _closePanel));
    return h;
  }
  function _toast(text, color, ms) {
    const panel = document.getElementById("wspp-cat-panel");
    if (!panel) return;
    let t = panel.querySelector(".wc-toast");
    if (t) t.remove();
    t = _el("div", { background: color === "#ef5350" ? "rgba(239,83,80,.9)" : color === "#f59e0b" ? "rgba(245,158,11,.9)" : "rgba(0,168,132,.9)", color: "#fff" }, { cls: "wc-toast", txt: text });
    panel.appendChild(t);
    if (ms) setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 300);
    }, ms);
  }
  function _spinner(size, color) {
    const s = _el("div", { width: size + "px", height: size + "px", borderRadius: "50%", border: `2px solid rgba(255,255,255,.15)`, borderTopColor: color || "#00a884", flexShrink: "0" }, { cls: "wspp-sp" });
    return s;
  }
  function _renderGrid(panel) {
    const loading = _catalogLoading && _catalogItems.length === 0;
    const rightBtns = [];
    if (_catalogIsConsultor) {
      rightBtns.push(_iconBtn(I.plus, "#00a884", "Crear plantilla", () => {
        _catalogCategory = null;
        _catalogView = "create";
        renderCatalogPanel();
      }));
    }
    panel.appendChild(_mkHdr("C\xE9sar V\xE1squez", null, rightBtns));
    const body = _el("div", {}, { cls: "wc-body" });
    if (loading) {
      const w = _el("div", { display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: "8px" });
      w.appendChild(_spinner(18, "#00a884"));
      w.appendChild(_el("div", { color: "#666", fontSize: "11px" }, { txt: "Cargando..." }));
      body.appendChild(w);
    } else if (_catalogItems.length === 0 && _catalogCategories.length === 0) {
      body.appendChild(_el("div", { color: "#666", textAlign: "center", padding: "24px 0", fontSize: "12px" }, { txt: "Sin plantillas disponibles" }));
    } else {
      const grouped = {};
      _catalogItems.forEach((item) => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      });
      _catalogCategories.forEach((cat) => {
        if (!grouped[cat.key]) grouped[cat.key] = [];
      });
      const cats = Object.keys(grouped).sort((a, b) => _getCatSortOrder(a) - _getCatSortOrder(b));
      const list = _el("div", { padding: "6px 8px", display: "flex", flexDirection: "column", gap: "3px" });
      cats.forEach((cat) => {
        const items = grouped[cat];
        const colors = _getCatColors(cat);
        const readyCount = items.filter((i) => i.has_audio).length;
        const row = _el("div", {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "7px 8px",
          borderRadius: "10px",
          cursor: "pointer",
          transition: "background .1s"
        });
        row.addEventListener("mouseenter", () => {
          row.style.background = "rgba(255,255,255,.04)";
        });
        row.addEventListener("mouseleave", () => {
          row.style.background = "transparent";
        });
        const ic = _el("div", {
          width: "30px",
          height: "30px",
          borderRadius: "8px",
          flexShrink: "0",
          background: colors.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.accent
        }, { html: _getCatIcon(cat) });
        row.appendChild(ic);
        const txt = _el("div", { flex: "1", minWidth: "0" });
        const lbl = _el("div", { fontSize: "12px", fontWeight: "600", color: "#e9edef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, { txt: _getCatLabel(cat) });
        const sub = _el("div", { fontSize: "10px", color: "#666" }, { txt: `${readyCount}/${items.length} listos` });
        txt.appendChild(lbl);
        txt.appendChild(sub);
        row.appendChild(txt);
        row.appendChild(_el("div", { color: "#444", flexShrink: "0" }, { html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>` }));
        row.addEventListener("click", () => {
          _catalogCategory = cat;
          _catalogView = "category";
          renderCatalogPanel();
        });
        list.appendChild(row);
      });
      body.appendChild(list);
    }
    panel.appendChild(body);
  }
  function _renderCategory(panel) {
    const cat = _catalogCategory;
    const items = _catalogItems.filter((i) => i.category === cat).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const colors = _getCatColors(cat);
    const rightBtns = [];
    if (_catalogIsConsultor) {
      rightBtns.push(_iconBtn(I.plus, colors.accent, "Agregar plantilla", () => {
        _catalogView = "create";
        renderCatalogPanel();
      }));
      rightBtns.push(_iconBtn(I.trash, "#ef5350", "Eliminar categor\xEDa", () => {
        if (!confirm(`\xBFEliminar "${_getCatLabel(cat)}" y TODOS sus audios?`)) return;
        const catId = _getCatId(cat);
        if (!catId) {
          _toast("Categor\xEDa no encontrada", "#ef5350", 2500);
          return;
        }
        _handleDeleteCategory(catId, cat, null);
      }));
    }
    panel.appendChild(_mkHdr(_getCatLabel(cat), () => {
      _catalogView = "grid";
      renderCatalogPanel();
    }, rightBtns));
    const body = _el("div", {}, { cls: "wc-body" });
    if (items.length === 0) {
      body.appendChild(_el("div", { color: "#666", textAlign: "center", padding: "20px 0", fontSize: "11px" }, { txt: "Sin plantillas aqu\xED" }));
    } else {
      items.forEach((item) => {
        const isActive = _previewData?.id === item.id || _previewLoadingId === item.id;
        const row = _el("div", {}, { cls: "wc-row" });
        row.style.cursor = item.has_audio ? "pointer" : "default";
        if (isActive) row.style.background = "rgba(0,168,132,.08)";
        const dot = _el("div", {
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          flexShrink: "0",
          background: isActive ? "#00a884" : item.has_audio ? colors.accent : "#444"
        });
        if (_previewLoadingId === item.id) {
          dot.style.animation = "wspp-sp .7s linear infinite";
        }
        row.appendChild(dot);
        const txt = _el("div", { flex: "1", minWidth: "0" });
        const lbl = _el("div", {
          fontSize: "12px",
          fontWeight: "600",
          color: item.has_audio ? "#e9edef" : "#555",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }, { txt: item.label });
        txt.appendChild(lbl);
        const dur = _fmtDur(item.duration_ms);
        if (dur) txt.appendChild(_el("div", { fontSize: "10px", color: "#555" }, { txt: dur }));
        row.appendChild(txt);
        if (_catalogIsConsultor) {
          row.appendChild(_iconBtn(I.edit, "#666", "Editar", () => {
            _catalogDetailId = item.id;
            _catalogView = "detail";
            renderCatalogPanel();
          }));
        }
        if (item.has_audio) {
          row.addEventListener("click", () => handleCatalogItemClick(item.id, item.label));
        }
        body.appendChild(row);
      });
    }
    panel.appendChild(body);
  }
  function _renderDetail(panel) {
    const item = _catalogItems.find((i) => i.id === _catalogDetailId);
    if (!item) {
      _catalogView = "category";
      renderCatalogPanel();
      return;
    }
    const colors = _getCatColors(item.category);
    panel.appendChild(_mkHdr(item.label, () => {
      _catalogView = "category";
      renderCatalogPanel();
    }));
    const body = _el("div", { padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }, { cls: "wc-body" });
    const meta = _el("div", { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" });
    const badge = _el("div", { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", fontWeight: "700", color: colors.accent, background: colors.bg, padding: "2px 8px", borderRadius: "12px" });
    badge.innerHTML = _getCatIcon(item.category);
    badge.appendChild(document.createTextNode(" " + _getCatLabel(item.category)));
    meta.appendChild(badge);
    const dur = _fmtDur(item.duration_ms);
    if (dur) meta.appendChild(_el("div", { fontSize: "10px", color: "#555" }, { txt: dur }));
    if (item.description) meta.appendChild(_el("div", { fontSize: "10px", color: "#666", flex: "1 0 100%" }, { txt: item.description }));
    body.appendChild(meta);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Gui\xF3n" }));
    const ta = _el("textarea", { minHeight: "70px" }, { cls: "wc-input wc-textarea" });
    ta.value = item.script_text || "";
    body.appendChild(ta);
    const acts = _el("div", { display: "flex", flexDirection: "column", gap: "6px" });
    const saveBtn = _el("button", { background: "rgba(0,168,132,.13)", color: "#00a884" }, { cls: "wc-btn", html: `${I.check} Guardar gui\xF3n` });
    saveBtn.addEventListener("click", () => {
      const s = ta.value.trim();
      if (!s) return;
      _handleUpdateScript(item.id, s, saveBtn);
    });
    acts.appendChild(saveBtn);
    const regenBtn = _el("button", { background: "rgba(129,140,248,.13)", color: "#818cf8" }, { cls: "wc-btn", html: `${I.refresh} Regenerar audio` });
    regenBtn.addEventListener("click", () => _handleRegenerate(item.id, regenBtn));
    acts.appendChild(regenBtn);
    const delBtn = _el("button", { background: "rgba(239,83,80,.1)", color: "#ef5350" }, { cls: "wc-btn", html: `${I.trash} Eliminar` });
    delBtn.addEventListener("click", () => {
      if (!confirm(`\xBFEliminar "${item.label}"?`)) return;
      _handleDeleteItem(item.id, delBtn);
    });
    acts.appendChild(delBtn);
    body.appendChild(acts);
    panel.appendChild(body);
  }
  function _renderCreate(panel) {
    const preselectedCat = _catalogCategory || (_catalogCategories[0]?.key || "saludo");
    const backTarget = _catalogCategory ? "category" : "grid";
    panel.appendChild(_mkHdr("Nueva plantilla", () => {
      _catalogView = backTarget;
      renderCatalogPanel();
    }));
    const body = _el("div", { padding: "10px 12px", display: "flex", flexDirection: "column", gap: "7px" }, { cls: "wc-body" });
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Nombre" }));
    const labelInp = _el("input", {}, { cls: "wc-input", type: "text", placeholder: "Ej: Saludo inicial" });
    body.appendChild(labelInp);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Descripci\xF3n" }));
    const descInp = _el("input", {}, { cls: "wc-input", type: "text", placeholder: "Para qui\xE9n es este audio" });
    body.appendChild(descInp);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Categor\xEDa" }));
    const catSel = _el("select", { cursor: "pointer", WebkitAppearance: "none", appearance: "none" }, { cls: "wc-input" });
    _catalogCategories.slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).forEach((c) => {
      const o = _el("option");
      o.value = c.key;
      o.textContent = c.label;
      if (c.key === preselectedCat) o.selected = true;
      catSel.appendChild(o);
    });
    body.appendChild(catSel);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Gui\xF3n" }));
    const scriptTa = _el("textarea", {}, { cls: "wc-input wc-textarea", placeholder: "Hola, habla el doctor C\xE9sar V\xE1squez..." });
    body.appendChild(scriptTa);
    const row2 = _el("div", { display: "flex", gap: "8px" });
    const orderWrap = _el("div", { flex: "1" });
    orderWrap.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Orden" }));
    const sortInp = _el("input", {}, { cls: "wc-input", type: "number", min: "0", max: "999", value: "0" });
    orderWrap.appendChild(sortInp);
    row2.appendChild(orderWrap);
    const voiceWrap = _el("div", { flex: "2" });
    voiceWrap.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Voice ID (opcional)" }));
    const voiceInp = _el("input", {}, { cls: "wc-input", type: "text", placeholder: "Voz por defecto" });
    voiceWrap.appendChild(voiceInp);
    row2.appendChild(voiceWrap);
    body.appendChild(row2);
    const createBtn = _el("button", { background: "rgba(0,168,132,.13)", color: "#00a884", marginTop: "2px" }, { cls: "wc-btn", html: `${I.check} Crear y generar audio` });
    createBtn.addEventListener("click", () => {
      const label = labelInp.value.trim();
      const script = scriptTa.value.trim();
      if (!label || !script) {
        _toast("Nombre y gui\xF3n son obligatorios", "#ef5350", 2500);
        return;
      }
      _catalogCategory = catSel.value;
      _handleCreateItem({ label, description: descInp.value.trim(), category: catSel.value, script_text: script, sort_order: parseInt(sortInp.value, 10) || 0, voice_id: voiceInp.value.trim() || void 0 }, createBtn);
    });
    body.appendChild(createBtn);
    panel.appendChild(body);
  }
  function _handleRegenerate(id, btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = "";
    btn.appendChild(_spinner(12, "#818cf8"));
    btn.disabled = true;
    _toast("Regenerando...", "#8696a0");
    window.postMessage({ type: "GENERATE_CATALOG_AUDIO", id }, WA_ORIGIN);
    _pendingRegenId = id;
    _pendingRegenBtn = { el: btn, orig };
  }
  function _handleUpdateScript(id, text, btn) {
    const orig = btn.innerHTML;
    btn.textContent = "Guardando...";
    btn.disabled = true;
    window.postMessage({ type: "UPDATE_CATALOG_SCRIPT", id, script_text: text }, WA_ORIGIN);
    _pendingUpdateId = id;
    _pendingUpdateBtn = { el: btn, orig };
  }
  function _handleDeleteItem(id, btn) {
    const orig = btn.innerHTML;
    btn.textContent = "Eliminando...";
    btn.disabled = true;
    window.postMessage({ type: "DELETE_CATALOG_ITEM", id }, WA_ORIGIN);
    _pendingDeleteId = id;
    _pendingDeleteBtn = { el: btn, orig };
  }
  function _handleCreateItem(data, btn) {
    const orig = btn.innerHTML;
    btn.textContent = "Creando...";
    btn.disabled = true;
    window.postMessage({ type: "CREATE_CATALOG_ITEM", data }, WA_ORIGIN);
    _pendingCreateBtn = { el: btn, orig };
  }
  function _handleDeleteCategory(catId, catKey, btn) {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = "";
      btn.appendChild(_spinner(10, "#ef5350"));
      btn.disabled = true;
      _pendingDeleteCatBtn = { el: btn, orig, catKey };
    } else {
      _pendingDeleteCatBtn = { el: null, orig: "", catKey };
    }
    window.postMessage({ type: "DELETE_CATALOG_CATEGORY", id: catId }, WA_ORIGIN);
  }
  function _destroyPreview() {
    if (_previewRAF) {
      cancelAnimationFrame(_previewRAF);
      _previewRAF = null;
    }
    if (_previewAudio) {
      _previewAudio.pause();
      _previewAudio.src = "";
      _previewAudio = null;
    }
    _previewData = null;
    _previewPlaying = false;
    _previewLoadingId = null;
  }
  function _fmtTime(s) {
    if (!s || !isFinite(s)) return "0:00";
    const sec = Math.floor(s);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }
  function _renderPreviewBar(panel) {
    const bar = _el("div", {}, { cls: "wc-preview" });
    if (_previewLoadingId && !_previewData) {
      const item = _catalogItems.find((i) => i.id === _previewLoadingId);
      bar.appendChild(_spinner(16, "#00a884"));
      bar.appendChild(_el("div", { flex: "1", fontSize: "11px", color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, { txt: item ? `Cargando ${item.label}...` : "Cargando..." }));
      const cancelBtn = _iconBtn(I.stop, "#666", "Cancelar", () => {
        _destroyPreview();
        if (_catalogPanelOpen) renderCatalogPanel();
      });
      bar.appendChild(cancelBtn);
      panel.appendChild(bar);
      return;
    }
    if (!_previewData || !_previewAudio) return;
    const playBtn = _el("button", {}, { cls: "wc-preview-play", html: _previewPlaying ? I.pause : I.play });
    playBtn.addEventListener("click", () => {
      if (_previewPlaying) {
        _previewAudio.pause();
        _previewPlaying = false;
      } else {
        _previewAudio.play();
        _previewPlaying = true;
      }
      playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
    });
    bar.appendChild(playBtn);
    const info = _el("div", {}, { cls: "wc-preview-info" });
    info.appendChild(_el("div", {}, { cls: "wc-preview-name", txt: _previewData.label || "Audio" }));
    const track = _el("div", {}, { cls: "wc-preview-track" });
    const fill = _el("div", { width: "0%" }, { cls: "wc-preview-fill" });
    track.appendChild(fill);
    track.addEventListener("click", (e) => {
      if (!_previewAudio || !_previewAudio.duration) return;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      _previewAudio.currentTime = pct * _previewAudio.duration;
    });
    info.appendChild(track);
    const timeEl = _el("div", {}, { cls: "wc-preview-time", txt: `${_fmtTime(_previewAudio.currentTime)} / ${_fmtTime(_previewAudio.duration)}` });
    info.appendChild(timeEl);
    bar.appendChild(info);
    function _updateProgress() {
      if (!_previewAudio) return;
      const pct = _previewAudio.duration ? _previewAudio.currentTime / _previewAudio.duration * 100 : 0;
      fill.style.width = pct + "%";
      timeEl.textContent = `${_fmtTime(_previewAudio.currentTime)} / ${_fmtTime(_previewAudio.duration)}`;
      playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
      _previewRAF = requestAnimationFrame(_updateProgress);
    }
    if (_previewRAF) cancelAnimationFrame(_previewRAF);
    _previewRAF = requestAnimationFrame(_updateProgress);
    const discardBtn = _iconBtn(I.stop, "#666", "Descartar", () => {
      _destroyPreview();
      if (_catalogPanelOpen) renderCatalogPanel();
    });
    bar.appendChild(discardBtn);
    const sendBtn = _el("button", {}, { cls: "wc-preview-send", html: `${I.send} Enviar` });
    sendBtn.addEventListener("click", () => {
      if (!_previewData) return;
      const { audioBase64, mimeType, label } = _previewData;
      _previewAudio.pause();
      _previewPlaying = false;
      sendBtn.textContent = "...";
      sendBtn.disabled = true;
      _toast("Enviando nota de voz...", "#00a884");
      sendAudioAsPTT(audioBase64, mimeType).then((ok) => {
        if (ok) {
          _toast((label || "Audio") + " enviado \u2713", "#00a884", 2500);
          _destroyPreview();
        } else {
          _toast("Error \u2014 abre un chat primero", "#ef5350", 3e3);
          sendBtn.innerHTML = `${I.send} Enviar`;
          sendBtn.disabled = false;
        }
        if (_catalogPanelOpen) renderCatalogPanel();
      });
    });
    bar.appendChild(sendBtn);
    panel.appendChild(bar);
  }
  function _loadPreviewAudio(audioBase64, mimeType, label, id) {
    _destroyPreview();
    const mime = mimeType || "audio/ogg; codecs=opus";
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    _previewAudio = new Audio(url);
    _previewData = { audioBase64, mimeType: mime, label, id };
    _previewLoadingId = null;
    _previewPlaying = false;
    _previewAudio.addEventListener("ended", () => {
      _previewPlaying = false;
      if (_catalogPanelOpen) renderCatalogPanel();
    });
    _previewAudio.play().then(() => {
      _previewPlaying = true;
      if (_catalogPanelOpen) renderCatalogPanel();
    }).catch(() => {
    });
    if (_catalogPanelOpen) renderCatalogPanel();
  }
  function handleCatalogItemClick(audioId, label) {
    if (!audioId) return;
    if (_previewData?.id === audioId && _previewAudio) {
      if (_previewPlaying) {
        _previewAudio.pause();
        _previewPlaying = false;
      } else {
        _previewAudio.play();
        _previewPlaying = true;
      }
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    _destroyPreview();
    _previewLoadingId = audioId;
    if (_catalogPanelOpen) renderCatalogPanel();
    window.postMessage({ type: "GET_CATALOG_AUDIO", id: audioId }, WA_ORIGIN);
  }
  async function _generateWaveform(audioFile) {
    try {
      const audioData = await audioFile.arrayBuffer();
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await ctx.decodeAudioData(audioData);
      const raw = buf.getChannelData(0);
      const samples = 64, bs = Math.floor(raw.length / samples), fd = [];
      for (let i = 0; i < samples; i++) {
        const start = bs * i;
        let sum = 0;
        for (let j = 0; j < bs; j++) sum += Math.abs(raw[start + j]);
        fd.push(sum / bs);
      }
      const mult = Math.pow(Math.max(...fd), -1);
      return new Uint8Array(fd.map((n) => Math.floor(100 * n * mult)));
    } catch {
      return void 0;
    }
  }
  async function sendAudioAsPTT(audioBase64, mimeType) {
    const mime = mimeType || "audio/ogg; codecs=opus";
    try {
      if (typeof window.require !== "function") {
        console.error("[WSPP CATALOG] window.require not available");
        return false;
      }
      const chatJid = _lastActiveChatJid;
      if (!chatJid) {
        console.error("[WSPP CATALOG] No active chat JID");
        return false;
      }
      let chat = null;
      try {
        const Collections = window.require("WAWebCollections");
        const widFactory = window.require("WAWebWidFactory");
        const wid = widFactory.createWid(chatJid);
        chat = Collections.Chat.get(wid);
        if (!chat) {
          const FC = window.require("WAWebFindChatAction");
          const r = await FC.findOrCreateLatestChat(wid);
          chat = r?.chat ?? r;
        }
      } catch (err) {
        console.error("[WSPP CATALOG] Failed to resolve chat:", err);
        return false;
      }
      if (!chat) {
        console.error("[WSPP CATALOG] Chat not found for:", chatJid);
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
      const mediaPrep = prepRawMedia(opaqueData, { isPtt: true, asSticker: false, asGif: false, asDocument: false });
      const mediaData = await mediaPrep.waitForPrep();
      const waveform = await _generateWaveform(file);
      if (waveform) mediaData.waveform = waveform;
      const { getOrCreateMediaObject } = window.require("WAWebMediaStorage");
      const mediaObject = getOrCreateMediaObject(mediaData.filehash);
      const { msgToMediaType } = window.require("WAWebMmsMediaTypes");
      const mediaType = msgToMediaType({ type: mediaData.type, isGif: false });
      if (!(mediaData.mediaBlob instanceof OpaqueData)) mediaData.mediaBlob = await OpaqueData.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
      mediaData.renderableUrl = mediaData.mediaBlob.url();
      mediaObject.consolidate(mediaData.toJSON());
      mediaData.mediaBlob.autorelease();
      const { uploadMedia } = window.require("WAWebMediaMmsV4Upload");
      const uploaded = await uploadMedia({ mimetype: mediaData.mimetype, mediaObject, mediaType });
      const me = uploaded?.mediaEntry;
      if (!me) throw new Error("Upload failed: no mediaEntry");
      mediaData.set({ clientUrl: me.mmsUrl, deprecatedMms3Url: me.deprecatedMms3Url, directPath: me.directPath, mediaKey: me.mediaKey, mediaKeyTimestamp: me.mediaKeyTimestamp, filehash: mediaObject.filehash, encFilehash: me.encFilehash, uploadhash: me.uploadHash, size: mediaObject.size, streamingSidecar: me.sidecar, firstFrameSidecar: me.firstFrameSidecar });
      const { getMaybeMePnUser } = window.require("WAWebUserPrefsMeUser");
      const meUser = getMaybeMePnUser();
      const newId = await window.require("WAWebMsgKey").newId();
      const MsgKey = window.require("WAWebMsgKey");
      const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: "out" });
      const ephemeralFields = window.require("WAWebGetEphemeralFieldsMsgActionsUtils").getEphemeralFields(chat);
      const mediaJSON = mediaData.toJSON ? mediaData.toJSON() : mediaData;
      const message = { ...mediaJSON, ...ephemeralFields, id: newMsgKey, ack: 0, from: meUser, to: chat.id, local: true, self: "out", t: Math.floor(Date.now() / 1e3), isNewMsg: true, type: "ptt", mimetype: mime };
      const { addAndSendMsgToChat } = window.require("WAWebSendMsgChatAction");
      const [msgPromise] = addAndSendMsgToChat(chat, message);
      await msgPromise;
      console.log("[WSPP CATALOG] PTT sent to", chatJid);
      return true;
    } catch (err) {
      console.error("[WSPP CATALOG] PTT send error:", err.message);
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
      } else console.warn("[WSPP CATALOG] Load error:", e.data.error);
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    if (e.data?.type === "CATALOG_AUDIO_READY") {
      if (!e.data.ok || !e.data.audioBase64) {
        _previewLoadingId = null;
        _toast("Error: " + (e.data.error || "audio no disponible"), "#ef5350", 3e3);
        if (_catalogPanelOpen) renderCatalogPanel();
        return;
      }
      _loadPreviewAudio(e.data.audioBase64, e.data.mimeType, e.data.label || "Audio", e.data.id);
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
        if (idx >= 0) _catalogItems[idx] = { ..._catalogItems[idx], has_audio: true, audio_size: e.data.audioSize, duration_ms: e.data.durationMs };
        window.postMessage({ type: "BUST_AUDIO_CACHE", id: e.data.id }, WA_ORIGIN);
        _toast("Audio regenerado \u2713", "#00a884", 2e3);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || "intenta de nuevo"), "#ef5350", 3500);
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
        if (idx >= 0) _catalogItems[idx] = { ..._catalogItems[idx], script_text: e.data.script_text, has_audio: false, audio_size: 0, duration_ms: 0 };
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogEditingId = null;
        _toast("Gui\xF3n guardado \u2014 regener\xE1 el audio", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || "intenta de nuevo"), "#ef5350", 3500);
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
        _toast("Eliminada \u2713", "#00a884", 2e3);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || "intenta de nuevo"), "#ef5350", 3500);
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
        if (e.data.audio_generated) _toast("Creada con audio \u2713", "#00a884", 2500);
        else if (e.data.audio_error) _toast("Creada \u2014 audio fall\xF3", "#f59e0b", 3500);
        else _toast("Creada \u2014 gener\xE1 el audio", "#00a884", 2500);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || "intenta de nuevo"), "#ef5350", 3500);
      return;
    }
    if (e.data?.type === "CATALOG_CATEGORIES_READY") {
      _catalogCategoriesLoading = false;
      if (e.data.ok && e.data.categories) {
        _catalogCategories = e.data.categories;
        console.log("[WSPP CATALOG] Loaded", _catalogCategories.length, "categories");
      }
      if (_catalogPanelOpen) renderCatalogPanel();
      return;
    }
    if (e.data?.type === "CREATE_CATALOG_CATEGORY_DONE") {
      if (e.data.ok && e.data.category) {
        _catalogCategories.push(e.data.category);
        _toast("Categor\xEDa creada \u2713", "#00a884", 2e3);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || ""), "#ef5350", 3500);
      return;
    }
    if (e.data?.type === "DELETE_CATALOG_CATEGORY_DONE") {
      if (_pendingDeleteCatBtn?.el) {
        _pendingDeleteCatBtn.el.innerHTML = _pendingDeleteCatBtn.orig;
        _pendingDeleteCatBtn.el.disabled = false;
      }
      if (e.data.ok) {
        const dk = _pendingDeleteCatBtn?.catKey;
        _catalogCategories = _catalogCategories.filter((c) => c.id !== e.data.id);
        if (dk) _catalogItems = _catalogItems.filter((i) => i.category !== dk);
        window.postMessage({ type: "BUST_CATALOG_CACHE" }, WA_ORIGIN);
        _catalogView = "grid";
        _catalogCategory = null;
        _toast("Categor\xEDa eliminada \u2713", "#00a884", 2e3);
        if (_catalogPanelOpen) renderCatalogPanel();
      } else _toast("Error: " + (e.data.error || ""), "#ef5350", 3500);
      _pendingDeleteCatBtn = null;
      return;
    }
  });
  var MAX_RETRIES = 30;
  var _retries = 0;
  function waitForChatAndInsertButton() {
    if (document.getElementById("wspp-catalog-btn")) return;
    if (document.querySelector("#main") || document.querySelector(".two")) {
      createCatalogButton();
      console.log("[WSPP CATALOG] Button inserted");
      return;
    }
    _retries++;
    if (_retries < MAX_RETRIES) setTimeout(waitForChatAndInsertButton, 2e3);
    else console.warn("[WSPP CATALOG] Chat not found after", MAX_RETRIES, "retries");
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
