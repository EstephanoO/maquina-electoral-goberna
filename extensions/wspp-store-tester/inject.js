(() => {
  // src/inject/bootstrap.js
  var WA_ORIGIN = "https://web.whatsapp.com";
  var _ownNumber = null;
  var _catalogIsConsultor = false;
  function getOwnNumber() {
    return _ownNumber;
  }
  function isCatalogConsultor() {
    return _catalogIsConsultor;
  }
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
  function getOwnNumber2() {
    const fromStorage = getOwnNumber();
    if (fromStorage) return fromStorage;
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
    const own = getOwnNumber2();
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
  var _spamBlocker = null;
  var _cooldownTimer = null;
  var _cooldownRemain = 0;
  function showSpamWarning(data) {
    if (!data || !data.warnings || data.warnings.length === 0) return;
    removeSpamWarning();
    const isCritical = data.risk_level === "critical";
    const isHigh = data.risk_level === "high";
    const isMedium = data.risk_level === "medium";
    const bgColor = isCritical ? "#7f1d1d" : isHigh ? "#78350f" : "#713f12";
    const borderColor = isCritical ? "#dc2626" : isHigh ? "#ea580c" : "#ca8a04";
    const accentColor = isCritical ? "#fca5a5" : isHigh ? "#fed7aa" : "#fde68a";
    const cooldownSec = data.cooldown_sec || (isCritical ? 180 : isHigh ? 90 : 30);
    const actions = data.actions || [];
    const isServer = data.source === "server";
    if (isCritical) {
      _spamBlocker = document.createElement("div");
      _spamBlocker.id = "wspp-spam-blocker";
      Object.assign(_spamBlocker.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483640",
        // spamBlocker — below everything
        background: "rgba(127,29,29,.25)",
        backdropFilter: "blur(1px)",
        pointerEvents: "none"
        // doesn't block clicks — just visual warning
      });
      document.body.appendChild(_spamBlocker);
      setTimeout(() => {
        if (_spamBlocker) {
          _spamBlocker.remove();
          _spamBlocker = null;
        }
      }, cooldownSec * 1e3);
    }
    const overlay = document.createElement("div");
    overlay.id = "wspp-spam-warning";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: "2147483641",
      // spamWarning — above blocker, below sidebar
      background: bgColor,
      border: `1px solid ${borderColor}`,
      color: "#fff",
      padding: "14px 18px",
      borderRadius: "14px",
      boxShadow: "0 8px 32px rgba(0,0,0,.5)",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "12px",
      maxWidth: "480px",
      minWidth: "300px",
      userSelect: "none",
      transition: "opacity .3s, transform .3s"
    });
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      marginBottom: "10px"
    });
    const icon = document.createElement("div");
    icon.style.cssText = `font-size:22px;line-height:1;flex-shrink:0;`;
    icon.textContent = isCritical ? "\u{1F6A8}" : isHigh ? "\u26A0\uFE0F" : "\u{1F4E2}";
    header.appendChild(icon);
    const titleWrap = document.createElement("div");
    titleWrap.style.flex = "1";
    const title = document.createElement("div");
    title.style.cssText = `font-weight:800;font-size:14px;letter-spacing:-.3px;`;
    title.textContent = isCritical ? "RIESGO CR\xCDTICO DE BLOQUEO" : isHigh ? "RIESGO ALTO \u2014 Reducir velocidad" : "Advertencia de spam";
    titleWrap.appendChild(title);
    const meta = document.createElement("div");
    meta.style.cssText = `font-size:10px;opacity:.6;margin-top:2px;`;
    meta.textContent = `Score ${data.risk_score}/100 \xB7 ${data.message_count} msgs \xB7 ${isServer ? "An\xE1lisis servidor" : "An\xE1lisis local"}`;
    titleWrap.appendChild(meta);
    header.appendChild(titleWrap);
    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = `background:none;border:none;color:rgba(255,255,255,.4);font-size:16px;cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0;`;
    closeBtn.textContent = "\u2715";
    if (isCritical) {
      closeBtn.style.opacity = "0.2";
      closeBtn.style.pointerEvents = "none";
      setTimeout(() => {
        closeBtn.style.opacity = "0.6";
        closeBtn.style.pointerEvents = "auto";
      }, 3e4);
    }
    closeBtn.addEventListener("click", removeSpamWarning);
    header.appendChild(closeBtn);
    overlay.appendChild(header);
    for (const w of data.warnings.slice(0, 4)) {
      const line = document.createElement("div");
      line.style.cssText = `
      display:flex;gap:6px;align-items:flex-start;
      padding:5px 8px;margin-bottom:4px;
      background:rgba(255,255,255,.06);border-radius:7px;
      font-size:12px;line-height:1.4;
    `;
      const dot = document.createElement("span");
      dot.style.cssText = `color:${accentColor};margin-top:1px;flex-shrink:0;font-size:11px;`;
      dot.textContent = "\u25CF";
      const txt = document.createElement("span");
      txt.style.opacity = "0.85";
      txt.textContent = w;
      line.appendChild(dot);
      line.appendChild(txt);
      overlay.appendChild(line);
    }
    if (actions.length > 0) {
      const actHeader = document.createElement("div");
      actHeader.style.cssText = `font-size:10px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;`;
      actHeader.textContent = "QU\xC9 HACER:";
      overlay.appendChild(actHeader);
      for (const a of actions.slice(0, 3)) {
        const line = document.createElement("div");
        line.style.cssText = `
        display:flex;gap:6px;align-items:flex-start;
        padding:4px 8px;margin-bottom:3px;
        background:rgba(255,255,255,.04);border-radius:6px;
        font-size:11px;line-height:1.4;color:rgba(255,255,255,.8);
      `;
        line.innerHTML = `<span style="color:${accentColor};flex-shrink:0;">\u2192</span> ${a}`;
        overlay.appendChild(line);
      }
    }
    if (cooldownSec > 0) {
      const barWrap = document.createElement("div");
      barWrap.style.cssText = `margin-top:10px;`;
      const barLabel = document.createElement("div");
      barLabel.style.cssText = `display:flex;justify-content:space-between;font-size:10px;color:rgba(255,255,255,.5);margin-bottom:4px;`;
      const barText = document.createElement("span");
      barText.id = "wspp-spam-cooldown-label";
      barText.textContent = `Cooldown recomendado: ${cooldownSec}s`;
      const barPct = document.createElement("span");
      barPct.id = "wspp-spam-cooldown-pct";
      barPct.textContent = "100%";
      barLabel.appendChild(barText);
      barLabel.appendChild(barPct);
      barWrap.appendChild(barLabel);
      const barTrack = document.createElement("div");
      barTrack.style.cssText = `background:rgba(255,255,255,.1);border-radius:4px;height:5px;overflow:hidden;`;
      const barFill = document.createElement("div");
      barFill.id = "wspp-spam-cooldown-bar";
      barFill.style.cssText = `background:${borderColor};width:100%;height:100%;border-radius:4px;transition:width .5s linear;`;
      barTrack.appendChild(barFill);
      barWrap.appendChild(barTrack);
      overlay.appendChild(barWrap);
      _cooldownRemain = cooldownSec;
      clearInterval(_cooldownTimer);
      _cooldownTimer = setInterval(() => {
        _cooldownRemain = Math.max(0, _cooldownRemain - 1);
        const pct = Math.round(_cooldownRemain / cooldownSec * 100);
        const fillEl = document.getElementById("wspp-spam-cooldown-bar");
        const labelEl = document.getElementById("wspp-spam-cooldown-label");
        const pctEl = document.getElementById("wspp-spam-cooldown-pct");
        if (fillEl) fillEl.style.width = pct + "%";
        if (pctEl) pctEl.textContent = pct + "%";
        if (labelEl) labelEl.textContent = _cooldownRemain > 0 ? `Cooldown: ${_cooldownRemain}s restantes` : "\u2705 Listo para reanudar";
        if (_cooldownRemain <= 0) {
          clearInterval(_cooldownTimer);
          if (!isCritical) setTimeout(removeSpamWarning, 2e3);
        }
      }, 1e3);
    }
    document.body.appendChild(overlay);
    _spamOverlay = overlay;
    if (!isCritical) {
      const autoDismiss = (cooldownSec + (isHigh ? cooldownSec : 0)) * 1e3;
      setTimeout(() => removeSpamWarning(), autoDismiss);
    }
  }
  function removeSpamWarning() {
    clearInterval(_cooldownTimer);
    _cooldownRemain = 0;
    if (_spamOverlay) {
      _spamOverlay.remove();
      _spamOverlay = null;
    }
    if (_spamBlocker) {
      _spamBlocker.remove();
      _spamBlocker = null;
    }
    const existing = document.getElementById("wspp-spam-warning");
    if (existing) existing.remove();
    const blocker = document.getElementById("wspp-spam-blocker");
    if (blocker) blocker.remove();
  }
  function showValidationOverlay(data) {
    removeValidationOverlay();
    if (!data || !data.id) return;
    const statusColors = {
      pendiente: { bg: "rgba(255,149,0,.12)", text: "#ff9f0a", label: "PENDIENTE" },
      contactado: { bg: "rgba(96,165,250,.12)", text: "#60a5fa", label: "CONTACTADO" },
      respondido: { bg: "rgba(167,139,250,.12)", text: "#a78bfa", label: "RESPONDIDO" },
      invalido: { bg: "rgba(239,83,80,.12)", text: "#ef5350", label: "IMPOSIBLE" }
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
      // Push right when sidebar is open (360px + gap)
      right: document.getElementById("wspp-sidebar") ? "384px" : "24px",
      zIndex: "2147483643",
      // validationOverlay — above WA, below sidebar
      background: "#0f1923",
      borderRadius: "12px",
      boxShadow: "0 4px 24px rgba(0,0,0,.5)",
      border: "1px solid rgba(255,255,255,.08)",
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
      el("span", { color: "rgba(255,255,255,.4)", fontSize: "10px" }, data.zona || "")
    ]);
    overlay.appendChild(headerRow);
    overlay.appendChild(el("div", { fontWeight: "600", color: "#e9edef", fontSize: "13px", marginBottom: "2px" }, data.nombre || "Sin nombre"));
    const infoText = (data.telefono || "") + (data.encuestador ? " | Enc: " + data.encuestador : "");
    overlay.appendChild(el("div", { color: "rgba(255,255,255,.55)", fontSize: "11px", marginBottom: "4px" }, infoText));
    if (data.claimed_by_name) {
      overlay.appendChild(el("div", { color: "rgba(255,255,255,.4)", fontSize: "10px" }, "Reclamado: " + data.claimed_by_name));
    }
    const classifyPanel = el("div", { display: "none", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #e2e8f0" });
    classifyPanel.id = "wspp-classify-panel";
    classifyPanel.appendChild(el("div", { fontSize: "10px", color: "rgba(255,255,255,.55)", fontWeight: "600", marginBottom: "6px" }, "CLASIFICAR:"));
    const btnContainer = el("div", { display: "flex", flexWrap: "wrap", gap: "4px" });
    const btnConfigs = [
      { vote: "duro", bg: "rgba(52,199,89,.12)", color: "#34c759", border: "rgba(52,199,89,.3)", label: "Voto Duro" },
      { vote: "blando", bg: "rgba(253,230,138,.12)", color: "#fde68a", border: "rgba(253,230,138,.3)", label: "Voto Blando" },
      { vote: "flotante", bg: "rgba(167,139,250,.12)", color: "#a78bfa", border: "rgba(167,139,250,.3)", label: "Flotante" },
      { vote: "invalido", bg: "rgba(239,83,80,.12)", color: "#ef5350", border: "rgba(239,83,80,.3)", label: "Imposible" }
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
    toast.style.background = type === "success" ? "rgba(52,199,89,.15)" : "rgba(239,83,80,.15)";
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
      showValidationOverlay(e.data.payload);
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
  function getLastActiveChatJid() {
    return _lastActiveChatJid;
  }
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
                own_number: getOwnNumber2(),
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
              own_number: getOwnNumber2(),
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
    // PTT pipeline — each has fallback alternatives checked at runtime
    "WAWebMediaOpaqueData",
    // or WAWebMediaOpaqueDataUtils
    "WAWebPrepRawMedia",
    // or WAWebPrepareMediaUtils
    "WAWebSendMsgChatAction",
    // PTT: addAndSendMsgToChat
    "WAWebWidFactory",
    // @lid resolution + chat lookup
    "WAWebFindChatAction",
    // PTT: fallback chat resolver
    "WAWebMediaMmsV4Upload",
    // or WAWebMediaUploadUtils / WAWebUploadManager
    "WAWebMediaStorage",
    // or WAWebMediaStorageUtils
    "WAWebMmsMediaTypes",
    // or WAWebMediaTypes
    "WAWebGetEphemeralFieldsMsgActionsUtils"
    // optional: disappearing msgs
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
    if (getOwnNumber2()) return;
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
  function _toggleCatalogPanelInternal() {
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
    _showNewCatForm = false;
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
    if (isCatalogConsultor()) {
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
    if (isCatalogConsultor()) {
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
        if (isCatalogConsultor()) {
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
  var _showNewCatForm = false;
  function _renderCreate(panel) {
    const preselectedCat = _catalogCategory || (_catalogCategories[0]?.key || "saludo");
    const backTarget = _catalogCategory ? "category" : "grid";
    panel.appendChild(_mkHdr("Nueva plantilla", () => {
      _showNewCatForm = false;
      _catalogView = backTarget;
      renderCatalogPanel();
    }));
    const body = _el("div", { padding: "10px 12px", display: "flex", flexDirection: "column", gap: "7px" }, { cls: "wc-body" });
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Categor\xEDa" }));
    if (!_showNewCatForm) {
      const catRow = _el("div", { display: "flex", gap: "6px", alignItems: "center" });
      const catSel = _el("select", { cursor: "pointer", WebkitAppearance: "none", appearance: "none", flex: "1" }, { cls: "wc-input" });
      catSel.id = "wspp-create-cat-sel";
      _catalogCategories.slice().sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)).forEach((c) => {
        const o = _el("option");
        o.value = c.key;
        o.textContent = c.label;
        if (c.key === preselectedCat) o.selected = true;
        catSel.appendChild(o);
      });
      catRow.appendChild(catSel);
      const newCatBtn = _el("button", { flexShrink: "0", background: "rgba(0,168,132,.1)", color: "#00a884", fontSize: "11px", fontWeight: "700", padding: "7px 10px", borderRadius: "10px", border: "none", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }, { html: `${I.plus} Nueva` });
      newCatBtn.addEventListener("click", () => {
        _showNewCatForm = true;
        renderCatalogPanel();
      });
      catRow.appendChild(newCatBtn);
      body.appendChild(catRow);
    } else {
      const catForm = _el("div", { background: "rgba(255,255,255,.03)", borderRadius: "10px", padding: "8px", display: "flex", flexDirection: "column", gap: "6px", border: "1px solid rgba(0,168,132,.15)" });
      const catNameRow = _el("div", { display: "flex", gap: "6px" });
      const catLabelInp = _el("input", { flex: "1" }, { cls: "wc-input", type: "text", placeholder: "Nombre (ej: Propuestas)" });
      catLabelInp.id = "wspp-newcat-label";
      catNameRow.appendChild(catLabelInp);
      catForm.appendChild(catNameRow);
      const PALETTE = ["#00a884", "#818cf8", "#f59e0b", "#ef5350", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#8696a0"];
      const colorRow = _el("div", { display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" });
      colorRow.appendChild(_el("div", { fontSize: "10px", color: "#666", marginRight: "2px" }, { txt: "Color:" }));
      let _selectedColor = PALETTE[0];
      PALETTE.forEach((c) => {
        const swatch = _el("div", {
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: c,
          cursor: "pointer",
          border: c === _selectedColor ? "2px solid #fff" : "2px solid transparent",
          transition: "border .1s",
          flexShrink: "0"
        });
        swatch.addEventListener("click", () => {
          _selectedColor = c;
          colorRow.querySelectorAll('div[style*="border-radius: 50%"], div[style*="border-radius:50%"]').forEach((s) => {
            s.style.border = "2px solid transparent";
          });
          swatch.style.border = "2px solid #fff";
        });
        colorRow.appendChild(swatch);
      });
      catForm.appendChild(colorRow);
      const catActRow = _el("div", { display: "flex", gap: "6px" });
      const cancelCatBtn = _el("button", { flex: "1", background: "rgba(255,255,255,.06)", color: "#888" }, { cls: "wc-btn", txt: "Cancelar" });
      cancelCatBtn.addEventListener("click", () => {
        _showNewCatForm = false;
        renderCatalogPanel();
      });
      catActRow.appendChild(cancelCatBtn);
      const saveCatBtn = _el("button", { flex: "1", background: "rgba(0,168,132,.13)", color: "#00a884" }, { cls: "wc-btn", html: `${I.check} Crear categor\xEDa` });
      saveCatBtn.addEventListener("click", () => {
        const label = catLabelInp.value.trim();
        if (!label) {
          _toast("Nombre de categor\xEDa obligatorio", "#ef5350", 2500);
          return;
        }
        const key = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        if (!key) {
          _toast("Nombre inv\xE1lido", "#ef5350", 2500);
          return;
        }
        if (_catalogCategories.some((c) => c.key === key)) {
          _toast("Ya existe una categor\xEDa con ese nombre", "#f59e0b", 2500);
          return;
        }
        saveCatBtn.textContent = "Creando...";
        saveCatBtn.disabled = true;
        const sortOrder = _catalogCategories.length;
        window.postMessage({ type: "CREATE_CATALOG_CATEGORY", data: { key, label, color: _selectedColor, sort_order: sortOrder } }, WA_ORIGIN);
        const _onCatCreated = (ev) => {
          if (ev.source !== window || ev.data?.type !== "CREATE_CATALOG_CATEGORY_DONE") return;
          window.removeEventListener("message", _onCatCreated);
          if (ev.data.ok) {
            _catalogCategory = key;
            _showNewCatForm = false;
          } else {
            saveCatBtn.textContent = "Crear categor\xEDa";
            saveCatBtn.disabled = false;
          }
        };
        window.addEventListener("message", _onCatCreated);
      });
      catActRow.appendChild(saveCatBtn);
      catForm.appendChild(catActRow);
      body.appendChild(catForm);
    }
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Nombre" }));
    const labelInp = _el("input", {}, { cls: "wc-input", type: "text", placeholder: "Ej: Saludo inicial" });
    body.appendChild(labelInp);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Gui\xF3n" }));
    const scriptTa = _el("textarea", {}, { cls: "wc-input wc-textarea", placeholder: "Hola, habla el doctor C\xE9sar V\xE1squez..." });
    body.appendChild(scriptTa);
    body.appendChild(_el("div", {}, { cls: "wc-lbl", txt: "Orden" }));
    const sortInp = _el("input", { width: "70px" }, { cls: "wc-input", type: "number", min: "0", max: "999", value: "0" });
    body.appendChild(sortInp);
    const createBtn = _el("button", { background: "rgba(0,168,132,.13)", color: "#00a884", marginTop: "2px" }, { cls: "wc-btn", html: `${I.check} Crear y generar audio` });
    createBtn.addEventListener("click", () => {
      const label = labelInp.value.trim();
      const script = scriptTa.value.trim();
      if (!label || !script) {
        _toast("Nombre y gui\xF3n son obligatorios", "#ef5350", 2500);
        return;
      }
      const catSel = document.getElementById("wspp-create-cat-sel");
      const category = _showNewCatForm ? _catalogCategory : catSel?.value || preselectedCat;
      if (!category) {
        _toast("Seleccion\xE1 una categor\xEDa", "#ef5350", 2500);
        return;
      }
      _catalogCategory = category;
      _handleCreateItem({ label, category, script_text: script, sort_order: parseInt(sortInp.value, 10) || 0 }, createBtn);
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
  function _requireAny(...names) {
    for (const name of names) {
      try {
        const m = window.require(name);
        if (m) return m;
      } catch (_) {
      }
    }
    throw new Error("None of these WA modules found: " + names.join(", "));
  }
  async function sendAudioAsPTT(audioBase64, mimeType) {
    const mime = mimeType || "audio/ogg; codecs=opus";
    const L = (step, ...args) => console.log(`[WSPP PTT] ${step}`, ...args);
    const E = (step, err) => console.error(`[WSPP PTT] \u2717 ${step}:`, err?.message ?? err, err?.stack?.slice(0, 300));
    try {
      if (typeof window.require !== "function") {
        E("init", "window.require not available");
        return false;
      }
      const chatJid = getLastActiveChatJid();
      if (!chatJid) {
        E("init", "No active chat JID \u2014 open a chat first");
        return false;
      }
      L("start", `jid=${chatJid} mime=${mime} base64len=${audioBase64?.length}`);
      let chat = null;
      try {
        const widFactory = _requireAny("WAWebWidFactory");
        const wid = widFactory.createWid(chatJid);
        L("1a wid", wid?._serialized ?? wid);
        const coll = _requireAny("WAWebCollections");
        chat = coll.Chat.get(wid);
        if (!chat) {
          L("1b findOrCreate", "not in store, calling findOrCreateLatestChat");
          const FC = _requireAny("WAWebFindChatAction");
          const r = await FC.findOrCreateLatestChat(wid);
          chat = r?.chat ?? r;
        }
      } catch (err) {
        E("Step 1 chat", err);
        return false;
      }
      if (!chat) {
        E("Step 1 chat", "chat is null after resolve");
        return false;
      }
      L("1 \u2713 chat resolved", chat.id?._serialized ?? chat.id);
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], "voz_goberna.ogg", { type: mime, lastModified: Date.now() });
      L("2 \u2713 file", `${file.size} bytes`);
      const OpaqueData = _requireAny("WAWebMediaOpaqueData", "WAWebMediaOpaqueDataUtils");
      L("3a OpaqueData module", Object.keys(OpaqueData).join(", "));
      const opaqueData = await OpaqueData.createFromData(file, mime);
      L("3 \u2713 opaqueData", typeof opaqueData);
      const prepMod = _requireAny("WAWebPrepRawMedia", "WAWebPrepareMediaUtils");
      const prepRawMedia = prepMod.prepRawMedia ?? prepMod.default?.prepRawMedia ?? prepMod.default;
      L("4a prepRawMedia fn", typeof prepRawMedia, `length=${prepRawMedia?.length}`);
      const mediaPrep = prepRawMedia(opaqueData, { isPtt: true, asSticker: false, asGif: false, asDocument: false });
      L("4b mediaPrep", typeof mediaPrep, Object.keys(mediaPrep).join(", "));
      const mediaData = await mediaPrep.waitForPrep();
      L("4 \u2713 mediaData", `type=${mediaData.type ?? mediaData.get?.("type")} filehash=${(mediaData.filehash ?? mediaData.get?.("filehash"))?.slice(0, 16)}`);
      try {
        const waveform = await _generateWaveform(file);
        if (waveform) {
          if (typeof mediaData.set === "function") mediaData.set({ waveform });
          else mediaData.waveform = waveform;
          L("5 \u2713 waveform", waveform.length, "samples");
        }
      } catch (_) {
        L("5 waveform skip");
      }
      const storageMod = _requireAny("WAWebMediaStorage", "WAWebMediaStorageUtils", "WAWebMediaStorageManager");
      L("6a storage module", Object.keys(storageMod).join(", "));
      const getOrCreate = storageMod.getOrCreateMediaObject ?? storageMod.default?.getOrCreateMediaObject;
      const filehash = mediaData.filehash ?? mediaData.get?.("filehash");
      const mediaObject = getOrCreate(filehash);
      L("6 \u2713 mediaObject", typeof mediaObject, Object.keys(mediaObject).slice(0, 8).join(", "));
      const typesMod = _requireAny("WAWebMmsMediaTypes", "WAWebMediaMsgTypes", "WAWebMediaTypes");
      const msgToType = typesMod.msgToMediaType ?? typesMod.default?.msgToMediaType;
      const mdType = mediaData.type ?? mediaData.get?.("type") ?? "ptt";
      const mediaType = msgToType({ type: mdType, isGif: false });
      L("7 \u2713 mediaType", mediaType, `from type=${mdType}`);
      const rawBlob = mediaData.mediaBlob ?? mediaData.get?.("mediaBlob");
      const isOpaque = rawBlob && typeof rawBlob.url === "function" && typeof rawBlob.autorelease === "function";
      let pttBlob = rawBlob;
      if (!isOpaque) {
        L("8 re-wrap mediaBlob as OpaqueData");
        pttBlob = await OpaqueData.createFromData(rawBlob, rawBlob?.type || mime);
      }
      mediaData.renderableUrl = pttBlob.url();
      L("8 \u2713 renderableUrl set");
      const mdJson = mediaData.toJSON ? mediaData.toJSON() : { ...mediaData };
      mediaObject.consolidate(mdJson);
      L("8b \u2713 consolidated");
      let uploadMod = null, uploadModName = null;
      for (const name of ["WAWebMediaMmsV4Upload", "WAWebMediaUploadUtils", "WAWebUploadManager", "WAWebMediaMmsUpload", "WAWebMmsUpload"]) {
        try {
          uploadMod = window.require(name);
          uploadModName = name;
          break;
        } catch (_) {
        }
      }
      if (!uploadMod) throw new Error("No upload module found");
      L("9a upload module", uploadModName, Object.keys(uploadMod).join(", "));
      const uploadFn = uploadMod.uploadMedia ?? uploadMod.default?.uploadMedia ?? uploadMod.default?.encryptAndUpload;
      if (!uploadFn) throw new Error(`No uploadMedia fn in ${uploadModName}`);
      L("9b uploadFn found", typeof uploadFn, `length=${uploadFn.length}`);
      const uploadArgs = { chat, mediaData, mediaObject, mediaType, mimetype: mime };
      L("9c calling uploadFn with", Object.keys(uploadArgs).join(", "));
      const uploaded = await uploadFn(uploadArgs);
      L("9d uploaded raw", JSON.stringify(uploaded)?.slice(0, 300));
      pttBlob.autorelease();
      const me = uploaded?.mediaEntry ?? uploaded;
      L("9e mediaEntry", JSON.stringify(me)?.slice(0, 300));
      if (!me?.directPath) {
        throw new Error(`Upload OK but no directPath. me=${JSON.stringify(me)?.slice(0, 200)}`);
      }
      L("9 \u2713 upload done", `directPath=${me.directPath?.slice(0, 40)}`);
      const uploadFields = {
        clientUrl: me.mmsUrl ?? me.url,
        deprecatedMms3Url: me.deprecatedMms3Url,
        directPath: me.directPath,
        mediaKey: me.mediaKey,
        mediaKeyTimestamp: me.mediaKeyTimestamp,
        filehash: mediaObject.filehash,
        encFilehash: me.encFilehash,
        uploadhash: me.uploadHash ?? me.uploadhash,
        size: mediaObject.size,
        streamingSidecar: me.sidecar,
        firstFrameSidecar: me.firstFrameSidecar
      };
      if (typeof mediaData.set === "function") mediaData.set(uploadFields);
      else Object.assign(mediaData, uploadFields);
      L("10 \u2713 mediaData patched");
      const meMod = _requireAny("WAWebUserPrefsMeUser");
      const meUser = (meMod.getMaybeMePnUser ?? meMod.getMeUser ?? meMod.default?.getMaybeMePnUser).call(meMod);
      L("11a meUser", meUser?._serialized ?? meUser);
      const MsgKey = _requireAny("WAWebMsgKey");
      const newId = await MsgKey.newId();
      const newMsgKey = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: "out" });
      L("11b msgKey", newId);
      let ephemeralFields = {};
      try {
        const ephMod = _requireAny("WAWebGetEphemeralFieldsMsgActionsUtils", "WAWebEphemeralFields", "WAWebEphemeralUtils");
        const getEph = ephMod.getEphemeralFields ?? ephMod.default?.getEphemeralFields;
        if (getEph) ephemeralFields = getEph(chat);
        L("11c ephemeral", Object.keys(ephemeralFields).join(", ") || "none");
      } catch (_) {
      }
      const mediaJSON = mediaData.toJSON ? mediaData.toJSON() : { ...mediaData };
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
      L("11d message keys", Object.keys(message).join(", "));
      const sendMod = _requireAny("WAWebSendMsgChatAction");
      L("11e sendMod", Object.keys(sendMod).join(", "));
      const [msgPromise] = sendMod.addAndSendMsgToChat(chat, message);
      await msgPromise;
      L("\u2705 PTT sent to", chatJid);
      return true;
    } catch (err) {
      E("sendAudioAsPTT", err);
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
  function toggleCatalogPanel() {
    if (_catalogPanelOpen) {
      _closePanel();
    } else {
      _toggleCatalogPanelInternal();
    }
  }

  // src/inject/blast-panel.js
  async function _spamCheckBeforeSend() {
    return new Promise((resolve) => {
      window.postMessage({ type: "WSPP_SPAM_CHECK_NOW" }, WA_ORIGIN);
      const onResult = (e) => {
        if (e.source !== window) return;
        if (e.data?.type !== "WSPP_SPAM_CHECK_RESULT") return;
        window.removeEventListener("message", onResult);
        const r = e.data.result;
        resolve({
          shouldPause: r?.risk_level === "critical",
          cooldown_sec: r?.cooldown_sec || 0,
          result: r
        });
      };
      window.addEventListener("message", onResult);
      setTimeout(() => {
        window.removeEventListener("message", onResult);
        resolve({ shouldPause: false, cooldown_sec: 0, result: null });
      }, 500);
    });
  }
  var WARM_NUMBERS = /* @__PURE__ */ new Set(["51901938157", "51930700661"]);
  var SESSION_MAX = 50;
  var DAILY_MAX = 200;
  var CONSEC_FAIL_LIMIT = 3;
  var PREWARM_WAIT_MS = 3e4;
  var DELAY_MIN = 1e4;
  var DELAY_MAX = 22e3;
  var DELAY_MICRO_MIN = 45e3;
  var DELAY_MICRO_MAX = 9e4;
  var DELAY_BREAK_MIN = 18e4;
  var DELAY_BREAK_MAX = 3e5;
  var _open = false;
  var _contacts = [];
  var _total = 0;
  var _message = "";
  var _running = false;
  var _paused = false;
  var _results = [];
  var _idx = 0;
  var _sessionSent = 0;
  var _dailyCount = 0;
  var _warmupStart = null;
  var _countdown = 0;
  var _countdownTimer = null;
  var _activeNumber = null;
  var _phase = "delay";
  var _habladoBatch = [];
  var _segmentInfo = null;
  var _dailyKey = (n) => `wspp_blast_daily_${n || "global"}`;
  var _warmupKey = (n) => `wspp_blast_warmup_${n || "global"}`;
  function _loadState() {
    _activeNumber = getOwnNumber();
    const n = _activeNumber;
    try {
      const ws = localStorage.getItem(_warmupKey(n));
      _warmupStart = ws ? Number(ws) : null;
      const raw = localStorage.getItem(_dailyKey(n));
      if (raw) {
        const { date, count } = JSON.parse(raw);
        const today = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
        _dailyCount = date === today ? Number(count) : 0;
      } else {
        _dailyCount = 0;
      }
    } catch (_) {
      _dailyCount = 0;
    }
  }
  function _saveDaily(c) {
    try {
      const today = new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
      localStorage.setItem(_dailyKey(_activeNumber), JSON.stringify({ date: today, count: c }));
    } catch (_) {
    }
  }
  function _initWarmup() {
    if (_warmupStart) return;
    _warmupStart = WARM_NUMBERS.has(_activeNumber || "") ? Date.now() - 14 * 864e5 : Date.now();
    try {
      localStorage.setItem(_warmupKey(_activeNumber), String(_warmupStart));
    } catch (_) {
    }
  }
  function _dailyLimit() {
    if (!_warmupStart) return 20;
    const d = (Date.now() - _warmupStart) / 864e5;
    if (d < 3) return 20;
    if (d < 7) return 50;
    if (d < 14) return 100;
    return DAILY_MAX;
  }
  function _warmupDay() {
    return _warmupStart ? Math.floor((Date.now() - _warmupStart) / 864e5) + 1 : 0;
  }
  function _delay(sent) {
    if (sent > 0 && sent % 25 === 0)
      return DELAY_BREAK_MIN + Math.random() * (DELAY_BREAK_MAX - DELAY_BREAK_MIN);
    if (sent > 0 && sent % 10 === 0)
      return DELAY_MICRO_MIN + Math.random() * (DELAY_MICRO_MAX - DELAY_MICRO_MIN);
    const r = Math.random();
    return DELAY_MIN + r * r * (DELAY_MAX - DELAY_MIN) + (Math.random() < 0.1 ? Math.random() * 12e3 : 0);
  }
  var SALUDOS = ["Hola", "Buenas", "Buenos d\xEDas", "Hola buen d\xEDa", "Qu\xE9 tal", "Hola, buen d\xEDa", "Buenas tardes", "Buenas noches"];
  var CIERRES = ["Gracias!", "Saludos!", "Un abrazo!", "Hasta pronto!", "Que tengas buen d\xEDa!", "\xC9xitos!"];
  var EMOJIS = ["", "", "", "", "", "\u{1F44B}", "\u{1F64C}", "\u2705", "\u{1F1F5}\u{1F1EA}"];
  var pick = (a, s) => a[Math.abs(s) % a.length];
  function _personalize(tpl, c, seed) {
    const nombre = ((c.nombre || "") + " " + (c.apellidos || "")).trim().split(/\s+/)[0] || "amigo";
    const saludo = pick(SALUDOS, seed);
    const cierre = pick(CIERRES, seed + 7);
    const emoji = pick(EMOJIS, seed + 13);
    const distrito = c.distrito || "";
    let msg = tpl.replace(/\{\{nombre\}\}/gi, nombre).replace(/\{\{saludo\}\}/gi, saludo).replace(/\{\{cierre\}\}/gi, cierre).replace(/\{\{emoji\}\}/gi, emoji).replace(/\{\{distrito\}\}/gi, distrito).trim();
    if (!/\{\{saludo\}\}/i.test(tpl) && !/^(hola|buenas|buenos|qué)/i.test(msg))
      msg = `${saludo} ${nombre}! ${msg}`;
    if (!/[.!?]$/.test(msg))
      msg += pick([".", "!", " !"], seed + 17);
    if (emoji) msg += " " + emoji;
    return msg;
  }
  function _phoneToJid(telefono) {
    const digits = String(telefono).replace(/\D/g, "");
    if (!digits) return null;
    const normalized = digits.length === 9 ? "51" + digits : digits;
    return normalized + "@c.us";
  }
  function _req(...names) {
    for (const n of names) {
      try {
        const m = window.require(n);
        if (m) return m;
      } catch (_) {
      }
    }
    throw new Error("WA module not found: " + names.join(" / "));
  }
  async function _prewarmChat(jid) {
    if (typeof window.require !== "function") throw new Error("WA Web no cargado");
    const wf = _req("WAWebWidFactory");
    const wid = wf.createWid(jid);
    const coll = _req("WAWebCollections");
    let chat = coll.Chat.get(wid);
    if (!chat) {
      const FC = _req("WAWebFindChatAction");
      const r = await FC.findOrCreateLatestChat(wid);
      chat = r?.chat ?? r;
    }
    if (!chat) throw new Error("No existe en WA: " + jid);
    return chat;
  }
  async function _sendToChat(chat, text) {
    const meMod = _req("WAWebUserPrefsMeUser");
    const meUser = (meMod.getMaybeMePnUser ?? meMod.getMeUser ?? meMod.default?.getMaybeMePnUser).call(meMod);
    const MsgKey = _req("WAWebMsgKey");
    const newId = await MsgKey.newId();
    const key = new MsgKey({ from: meUser, to: chat.id, id: newId, selfDir: "out" });
    let eph = {};
    try {
      const em = _req("WAWebGetEphemeralFieldsMsgActionsUtils", "WAWebEphemeralFields", "WAWebEphemeralUtils");
      const fn = em.getEphemeralFields ?? em.default?.getEphemeralFields;
      if (fn) eph = fn(chat);
    } catch (_) {
    }
    const [p] = _req("WAWebSendMsgChatAction").addAndSendMsgToChat(chat, {
      ...eph,
      id: key,
      type: "chat",
      body: text,
      ack: 0,
      from: meUser,
      to: chat.id,
      local: true,
      self: "out",
      t: Math.floor(Date.now() / 1e3),
      isNewMsg: true
    });
    await p;
  }
  function _startCountdown(ms, phase = "delay") {
    _phase = phase;
    _countdown = Math.ceil(ms / 1e3);
    clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
      _countdown = Math.max(0, _countdown - 1);
      const el = document.getElementById("wspp-blast-countdown");
      if (!el) return;
      if (_countdown <= 0) {
        el.textContent = _phase === "prewarm" ? "Enviando mensaje..." : "Enviando...";
        return;
      }
      if (_phase === "prewarm") {
        el.textContent = `\u23F3 Preparando contacto... ${_countdown}s`;
      } else if (_phase === "break") {
        const m = Math.floor(_countdown / 60);
        const s = _countdown % 60;
        el.textContent = `\u2615 Pausa anti-ban ${m}:${String(s).padStart(2, "0")}`;
      } else {
        el.textContent = `Pr\xF3ximo en ${_countdown}s`;
      }
    }, 1e3);
  }
  function _stopCountdown() {
    clearInterval(_countdownTimer);
    _countdown = 0;
    _phase = "delay";
  }
  function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function _toast2(text, color = "#25d366", ms = 4e3) {
    const t = document.createElement("div");
    Object.assign(t.style, {
      position: "fixed",
      bottom: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      background: color,
      color: "#fff",
      padding: "10px 20px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "600",
      zIndex: "2147483647",
      boxShadow: "0 4px 20px rgba(0,0,0,.35)",
      maxWidth: "360px",
      textAlign: "center",
      lineHeight: "1.4"
    });
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function _reportLog(results) {
    if (!results.length) return;
    window.postMessage({ type: "BLAST_REPORT_RESULTS", results }, WA_ORIGIN);
  }
  function _flushHablado() {
    if (!_habladoBatch.length) return;
    window.postMessage({
      type: "BLAST_MARK_HABLADO",
      ids: [..._habladoBatch],
      own_number: _activeNumber
    }, WA_ORIGIN);
    _habladoBatch = [];
  }
  async function _run() {
    if (_running || _paused) return;
    if (!_message.trim()) {
      _toast2("Escribe el mensaje", "#ef5350");
      return;
    }
    if (!_contacts.length) {
      _toast2("Carga los contactos primero", "#ef5350");
      return;
    }
    _loadState();
    _initWarmup();
    const limit = _dailyLimit();
    if (_dailyCount >= limit) {
      _toast2(`L\xEDmite diario (${limit}) alcanzado para +${_activeNumber}.
Usa otra pesta\xF1a o contin\xFAa ma\xF1ana.`, "#ef5350", 7e3);
      return;
    }
    _running = true;
    _paused = false;
    let consecFails = 0;
    const logBatch = [];
    _render();
    while (_idx < _contacts.length && _running && !_paused) {
      if (_sessionSent >= SESSION_MAX) {
        _paused = _running = false;
        _stopCountdown();
        _flushHablado();
        _toast2(`Pausa: ${SESSION_MAX} enviados esta sesi\xF3n.
Espera 10 min y reanuda.`, "#ff9f0a", 1e4);
        _render();
        break;
      }
      if (_dailyCount >= limit) {
        _paused = _running = false;
        _stopCountdown();
        _flushHablado();
        _toast2(`L\xEDmite diario (${limit}) para +${_activeNumber}.
Contin\xFAa ma\xF1ana.`, "#ef5350", 8e3);
        _render();
        break;
      }
      const c = _contacts[_idx];
      const jid = _phoneToJid(c.telefono);
      const seed = (c.id || "").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) + _idx;
      const text = _personalize(_message, c, seed);
      let status = "sent", error = null;
      if (!jid) {
        status = "failed";
        error = "Tel\xE9fono inv\xE1lido: " + c.telefono;
      } else {
        const spamCheck = await _spamCheckBeforeSend();
        if (spamCheck.shouldPause) {
          _paused = _running = false;
          _stopCountdown();
          _flushHablado();
          const coolMin = Math.ceil((spamCheck.cooldown_sec || 180) / 60);
          _toast2(
            `\u{1F6A8} RIESGO CR\xCDTICO \u2014 Blast pausado autom\xE1ticamente.
Esper\xE1 ${coolMin} min antes de reanudar.`,
            "#dc2626",
            15e3
          );
          _render();
          break;
        }
        let chat = null;
        try {
          chat = await _prewarmChat(jid);
        } catch (err) {
          status = "failed";
          error = err.message;
          consecFails++;
          console.error(`[WSPP BLAST] \u2717 prewarm +${c.telefono} \u2014 ${err.message}`);
          if (consecFails >= CONSEC_FAIL_LIMIT) {
            _paused = _running = false;
            _stopCountdown();
            _flushHablado();
            _toast2(`\u26A0\uFE0F ${CONSEC_FAIL_LIMIT} fallos consecutivos.
Verifica WhatsApp Web.`, "#ef5350", 1e4);
            logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
            _results.push({ ...c, status, error });
            _idx++;
            _render();
            _reportLog([...logBatch]);
            logBatch.length = 0;
            break;
          }
          logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
          _results.push({ ...c, status, error });
          _idx++;
          _render();
          if (logBatch.length >= 10) {
            _reportLog([...logBatch]);
            logBatch.length = 0;
          }
          if (_running && !_paused && _idx < _contacts.length) {
            const d = _delay(_sessionSent);
            _startCountdown(d, "delay");
            _render();
            await _sleep(d);
            _stopCountdown();
          }
          continue;
        }
        if (_running && !_paused) {
          _startCountdown(PREWARM_WAIT_MS, "prewarm");
          _render();
          await _sleep(PREWARM_WAIT_MS);
          _stopCountdown();
        }
        if (!_running || _paused) break;
        try {
          await _sendToChat(chat, text);
          _sessionSent++;
          _dailyCount++;
          consecFails = 0;
          _saveDaily(_dailyCount);
          if (c.id) _habladoBatch.push(c.id);
          if (_habladoBatch.length >= 10) _flushHablado();
          console.log(`[WSPP BLAST] \u2713 +${_activeNumber} | ${c.nombre} | +${c.telefono}`);
        } catch (err) {
          status = "failed";
          error = err.message;
          consecFails++;
          console.error(`[WSPP BLAST] \u2717 send +${c.telefono} \u2014 ${err.message}`);
          if (consecFails >= CONSEC_FAIL_LIMIT) {
            _paused = _running = false;
            _stopCountdown();
            _flushHablado();
            _toast2(`\u26A0\uFE0F ${CONSEC_FAIL_LIMIT} fallos consecutivos.
Verifica WhatsApp Web.`, "#ef5350", 1e4);
            logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
            _results.push({ ...c, status, error });
            _idx++;
            _render();
            _reportLog([...logBatch]);
            logBatch.length = 0;
            break;
          }
        }
      }
      logBatch.push({ phone: c.telefono, contact_name: `${c.nombre} ${c.apellidos}`.trim(), message: text, status, error, own_number: _activeNumber });
      _results.push({ ...c, status, error });
      _idx++;
      _render();
      if (logBatch.length >= 10) {
        _reportLog([...logBatch]);
        logBatch.length = 0;
      }
      if (_running && !_paused && _idx < _contacts.length) {
        const d = _delay(_sessionSent);
        const phase = d >= DELAY_BREAK_MIN ? "break" : "delay";
        _startCountdown(d, phase);
        _render();
        await _sleep(d);
        _stopCountdown();
      }
    }
    if (logBatch.length) _reportLog([...logBatch]);
    _flushHablado();
    if (!_paused && _idx >= _contacts.length) {
      _running = false;
      _stopCountdown();
      const sent = _results.filter((r) => r.status === "sent").length;
      _toast2(`\u2705 +${_activeNumber} \u2014 ${sent} enviados \xB7 ${sent} marcados como hablado`, "#25d366", 6e3);
    }
    _running = false;
    _render();
  }
  function _render() {
    const el = document.getElementById("wspp-blast-panel");
    if (!_open) {
      if (el) el.remove();
      return;
    }
    _loadState();
    const lim = _dailyLimit();
    const remaining = Math.max(0, lim - _dailyCount);
    const wDay = _warmupDay();
    const inWarmup = wDay <= 14 && !WARM_NUMBERS.has(_activeNumber || "");
    const sent = _results.filter((r) => r.status === "sent").length;
    const failed = _results.filter((r) => r.status === "failed").length;
    const pct = _contacts.length ? Math.round(_idx / _contacts.length * 100) : 0;
    const numShow = _activeNumber ? `+${_activeNumber}` : "\u23F3 detectando...";
    const html = `
    <div id="wspp-blast-panel" style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:460px;max-height:94vh;overflow-y:auto;
      background:#0c1a0f;border:1px solid rgba(37,211,102,.18);border-radius:16px;
      box-shadow:0 24px 64px rgba(0,0,0,.8);z-index:2147483646;/* blast modal */
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
    ">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:9px;background:rgba(37,211,102,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;">Blast Brigadistas</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);">12,258 personas \xB7 nuevo \u2192 hablado autom\xE1tico</div>
          </div>
        </div>
        <button id="wspp-blast-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;">\u2715</button>
      </div>

      <!-- N\xFAmero activo + slot del call center -->
      <div style="margin:10px 16px 0;padding:8px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);">N\xFAmero activo</div>
          ${_segmentInfo ? `<div style="font-size:11px;color:rgba(37,211,102,.5);margin-top:1px;">\u{1F4DE} Call Center \xB7 Slot ${_segmentInfo.segment_idx + 1}/${_segmentInfo.total_slots}${_segmentInfo.label ? " \xB7 " + _segmentInfo.label : ""}</div>` : ""}
        </div>
        <div style="font-size:13px;font-weight:700;color:${_activeNumber ? "#25d366" : "#ff9f0a"};">
          ${numShow}
          ${_activeNumber ? `<span style="font-size:10px;color:rgba(255,255,255,.5);margin-left:5px;">${WARM_NUMBERS.has(_activeNumber) ? "\u{1F525} warm" : `d\xEDa ${wDay}/14`}</span>` : ""}
        </div>
      </div>

      ${inWarmup ? `
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,149,0,.07);border:1px solid rgba(255,149,0,.15);border-radius:8px;font-size:11px;color:#ff9f0a;line-height:1.5;">
        \u{1F512} Warmup d\xEDa ${wDay}/14 \u2014 l\xEDmite hoy: <strong>${lim} mensajes</strong>
      </div>` : ""}

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);">
        ${[
      ["Total", _total, "#25d366"],
      ["Enviados", sent, "#34c759"],
      ["Fallidos", failed, "#ef5350"],
      ["Sesi\xF3n", `${_sessionSent}/${SESSION_MAX}`, "#ff9f0a"],
      ["Hoy", `${_dailyCount}/${lim}`, "#60a5fa"]
    ].map(([l, v, c]) => `
          <div style="text-align:center;padding:5px 2px;background:rgba(255,255,255,.03);border-radius:7px;">
            <div style="font-size:15px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;margin-top:1px;">${l}</div>
          </div>
        `).join("")}
      </div>

      <!-- Progreso -->
      ${_contacts.length ? `
      <div style="padding:10px 16px 5px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">
          <span>${_idx} / ${_contacts.length}</span>
          <span id="wspp-blast-countdown" style="color:${_running ? "#25d366" : "rgba(255,255,255,.5)"};">
            ${_running && _countdown > 0 ? `Pr\xF3ximo en ${_countdown}s` : _running ? "Enviando..." : ""}
          </span>
          <span>${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,#25d366,#34c759);width:${pct}%;height:100%;border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>` : ""}

      <!-- Mensaje -->
      <div style="padding:10px 16px 8px;">
        <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1.2px;display:block;margin-bottom:5px;">Mensaje</label>
        <textarea id="wspp-blast-msg" rows="4" placeholder="{{saludo}} {{nombre}}! Soy C\xE9sar V\xE1squez de {{distrito}}..." style="
          width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.1);border-radius:8px;
          color:#fff;font-size:13px;line-height:1.55;padding:10px 12px;
          resize:vertical;font-family:inherit;outline:none;
        ">${_message}</textarea>
        <div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:4px;line-height:1.5;">
          <code style="color:rgba(37,211,102,.6);">{{nombre}}</code>
          <code style="color:rgba(37,211,102,.6);">{{saludo}}</code>
          <code style="color:rgba(37,211,102,.6);">{{cierre}}</code>
          <code style="color:rgba(37,211,102,.6);">{{distrito}}</code>
          <code style="color:rgba(37,211,102,.6);">{{emoji}}</code>
          \xB7 pre-warm 30s \u2192 msg \u2192 delay 10-22s \xB7 c/10: 45-90s \xB7 c/25: 3-5min
        </div>
      </div>

      <!-- Controles -->
      <div style="padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${!_contacts.length ? `
          <button id="wspp-blast-load" style="flex:1;padding:11px 16px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.2);border-radius:9px;color:#25d366;font-size:13px;font-weight:700;cursor:pointer;">
            \u{1F4CB} Cargar ${_total || 12258} brigadistas
          </button>
        ` : !_running && !_paused ? `
          ${remaining > 0 ? `
            <button id="wspp-blast-start" style="flex:1;padding:11px 16px;background:#25d366;border:none;border-radius:9px;color:#0c1a0f;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px rgba(37,211,102,.2);">
              \u25B6 Enviar a ${Math.min(_contacts.length - _idx, remaining)} personas
            </button>
          ` : `
            <div style="flex:1;padding:11px;background:rgba(239,83,80,.07);border:1px solid rgba(239,83,80,.16);border-radius:9px;font-size:12px;color:#ef5350;text-align:center;">
              L\xEDmite diario (${lim}) alcanzado para ${numShow}. Usa otra pesta\xF1a.
            </div>
          `}
          <button id="wspp-blast-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">\u21BA</button>
        ` : _running ? `
          <div style="flex:1;padding:9px 12px;background:rgba(37,211,102,.05);border:1px solid rgba(37,211,102,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${_phase === "prewarm" ? `\u23F3 Preparando contacto ${_idx + 1} \xB7 ${_sessionSent} enviados \xB7 esperando 30s` : _phase === "break" ? `\u2615 Pausa anti-ban \xB7 ${_sessionSent} enviados \xB7 ${_dailyCount}/${lim} hoy` : `\u{1F7E2} Enviando \xB7 ${_sessionSent} sesi\xF3n \xB7 ${_dailyCount}/${lim} hoy \xB7 marcando hablado \u2705`}
          </div>
          <button id="wspp-blast-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">\u23F8 Pausar</button>
        ` : _paused && _idx < _contacts.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            \u23F8 Pausado en ${_idx}/${_contacts.length}.
            ${_sessionSent >= SESSION_MAX ? " Espera 10 min (anti-baneo)." : " Listo para reanudar."}
          </div>
          <button id="wspp-blast-resume" style="flex:1;padding:11px 16px;background:#25d366;border:none;border-radius:9px;color:#0c1a0f;font-size:13px;font-weight:800;cursor:pointer;">\u25B6 Reanudar</button>
        ` : `
          <div style="width:100%;padding:9px;background:rgba(37,211,102,.06);border:1px solid rgba(37,211,102,.14);border-radius:9px;font-size:12px;color:#25d366;text-align:center;font-weight:600;">
            \u2705 Sesi\xF3n completa \u2014 ${sent} enviados y marcados como <strong>hablado</strong>
          </div>
          <button id="wspp-blast-reload" style="flex:1;padding:11px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.5);font-size:13px;cursor:pointer;">Nueva sesi\xF3n \u21BA</button>
        `}
      </div>

      <!-- \xDAltimos -->
      ${_results.length ? `
      <div style="padding:0 16px 16px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">\xDAltimos enviados</div>
        <div style="max-height:150px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
          ${_results.slice(-10).reverse().map((r) => `
            <div style="display:flex;align-items:center;gap:7px;padding:5px 9px;background:rgba(255,255,255,.02);border-radius:6px;border:1px solid rgba(255,255,255,.04);">
              <span style="font-size:13px;flex-shrink:0;">${r.status === "sent" ? "\u2705" : "\u274C"}</span>
              <span style="font-size:12px;color:${r.status === "sent" ? "rgba(255,255,255,.6)" : "#ef5350"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${r.nombre || ""} ${r.apellidos || ""} \xB7 +${r.telefono || "?"}
              </span>
              <span style="font-size:10px;color:rgba(255,255,255,.55);flex-shrink:0;">${r.distrito || ""}</span>
            </div>
          `).join("")}
        </div>
      </div>` : ""}
    </div>
  `;
    if (el) el.outerHTML = html;
    else document.body.insertAdjacentHTML("beforeend", html);
    document.getElementById("wspp-blast-close")?.addEventListener("click", () => {
      _open = false;
      if (_running) {
        _running = false;
        _paused = true;
        _stopCountdown();
        _flushHablado();
      }
      _render();
    });
    document.getElementById("wspp-blast-msg")?.addEventListener("input", (e) => {
      _message = e.target.value;
    });
    document.getElementById("wspp-blast-load")?.addEventListener("click", _load);
    document.getElementById("wspp-blast-reload")?.addEventListener("click", () => {
      _contacts = [];
      _results = [];
      _idx = 0;
      _sessionSent = 0;
      _running = false;
      _paused = false;
      _habladoBatch = [];
      _load();
    });
    document.getElementById("wspp-blast-start")?.addEventListener("click", () => {
      _message = document.getElementById("wspp-blast-msg")?.value || _message;
      _run();
    });
    document.getElementById("wspp-blast-pause")?.addEventListener("click", () => {
      _paused = true;
      _running = false;
      _stopCountdown();
      _flushHablado();
      _render();
    });
    document.getElementById("wspp-blast-resume")?.addEventListener("click", () => {
      _sessionSent = 0;
      _paused = false;
      _message = document.getElementById("wspp-blast-msg")?.value || _message;
      _run();
    });
  }
  function _loadSegmentInfo() {
    const own = getOwnNumber();
    if (!own) return;
    window.postMessage({ type: "BLAST_GET_NUMBER_CONFIG", own_number: own }, WA_ORIGIN);
  }
  function _load() {
    _loadState();
    const btn = document.getElementById("wspp-blast-load") || document.getElementById("wspp-blast-reload");
    if (btn) {
      btn.textContent = "\u23F3 Cargando...";
      btn.disabled = true;
    }
    window.postMessage({
      type: "BLAST_GET_FORM_CONTACTS",
      limit: 200,
      offset: 0,
      status: "nuevo"
    }, WA_ORIGIN);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "BLAST_FORM_CONTACTS_READY") {
      if (!e.data.ok) {
        _toast2("Error: " + (e.data.error || "desconocido"), "#ef5350");
        _render();
        return;
      }
      _contacts = e.data.contacts || [];
      _total = e.data.total || _contacts.length;
      _results = [];
      _idx = 0;
      _sessionSent = 0;
      _running = false;
      _paused = false;
      _habladoBatch = [];
      if (e.data.segment_idx !== void 0) {
        _segmentInfo = {
          segment_idx: e.data.segment_idx,
          total_slots: e.data.total_slots,
          label: _segmentInfo?.label ?? null
        };
      }
      _loadState();
      const slotLabel = _segmentInfo ? ` \xB7 Slot ${_segmentInfo.segment_idx + 1}/${_segmentInfo.total_slots}` : "";
      console.log(`[WSPP BLAST] ${_contacts.length} contactos cargados (total: ${_total})${slotLabel} | l\xEDmite hoy: ${_dailyLimit()}`);
      _toast2(`\u2705 ${_contacts.length} contactos${slotLabel} \xB7 ${_dailyLimit()}/d\xEDa para +${_activeNumber || "?"}`, "#25d366");
      _render();
      return;
    }
    if (e.data?.type === "BLAST_NUMBER_CONFIG_READY") {
      if (e.data.config) {
        _segmentInfo = e.data.config;
        _render();
      }
    }
  });
  function toggleBlastPanel() {
    _open = !_open;
    if (_open) {
      _loadState();
      _loadSegmentInfo();
    }
    _render();
  }

  // src/inject/wa-validator-panel.js
  var SILENT_DELAY_MIN = 2e3;
  var SILENT_DELAY_MAX = 4e3;
  var SESSION_MAX_SILENT = 500;
  var CONV_DELAY_MIN = 15e3;
  var CONV_DELAY_MAX = 45e3;
  var CONV_BURST_MAX = 8;
  var CONV_BURST_REST = 12e4;
  var SESSION_MAX_CONV = 100;
  var CONV_TEMPLATES = [
    (nombre) => `Hola ${nombre} \u{1F44B}`,
    (nombre) => `Buenos d\xEDas ${nombre} \u{1F31F}`,
    (nombre) => `Hola ${nombre}, \xBFc\xF3mo est\xE1s?`,
    (nombre) => `Buenas ${nombre} \u{1F44B}`,
    (nombre) => `Hola ${nombre}! \u{1F60A}`
  ];
  function _randomTemplate(nombre) {
    const fn = CONV_TEMPLATES[Math.floor(Math.random() * CONV_TEMPLATES.length)];
    return fn(nombre || "estimado/a");
  }
  var _mode = "silent";
  var _open2 = false;
  var _contacts2 = [];
  var _total2 = 0;
  var _running2 = false;
  var _paused2 = false;
  var _idx2 = 0;
  var _sessionCount = 0;
  var _burstCount = 0;
  var _results2 = [];
  var _countdown2 = 0;
  var _countdownTimer2 = null;
  var _activeNumber2 = null;
  var _startTime = null;
  function _req2(...names) {
    for (const n of names) {
      try {
        const m = window.require(n);
        if (m) return m;
      } catch (_) {
      }
    }
    return null;
  }
  async function _checkPhoneSilent(phone) {
    const digits = String(phone).replace(/\D/g, "");
    if (!digits || digits.length < 9) return { exists: false, reason: "invalid_phone" };
    const normalized = digits.length === 9 ? "51" + digits : digits;
    try {
      const svc = _req2("WAWebQueryExistsService", "WAWebPhoneExistsService");
      if (svc?.queryExists) {
        const result = await svc.queryExists(normalized + "@c.us");
        if (result !== null && result !== void 0) {
          return { exists: !!result?.jid || !!result?.status || result === true };
        }
      }
    } catch (_) {
    }
    try {
      const svc = _req2("WAWebPhoneNumberQueryService");
      if (svc?.queryPhoneNumber) {
        const result = await svc.queryPhoneNumber(normalized);
        return { exists: !!result?.jid || !!result?.exists };
      }
    } catch (_) {
    }
    try {
      const wf = _req2("WAWebWidFactory");
      const wid = wf?.createWid(normalized + "@c.us");
      if (!wid) return { exists: false, reason: "no_wid" };
      const coll = _req2("WAWebCollections");
      const chat = coll?.Chat?.get(wid);
      if (chat) return { exists: true, reason: "in_store" };
      const FC = _req2("WAWebFindChatAction");
      if (FC?.queryExists) {
        const r = await FC.queryExists(wid);
        return { exists: !!r };
      }
      if (FC?.findOrCreateLatestChat) {
        const r = await FC.findOrCreateLatestChat(wid);
        return { exists: !!(r?.chat ?? r) };
      }
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("not found") || msg.includes("no existe") || msg.includes("invalid")) {
        return { exists: false, reason: "not_found" };
      }
      return { exists: false, reason: "error:" + err.message };
    }
    return { exists: false, reason: "unresolved" };
  }
  async function _spamCheckBeforeSend2() {
    return new Promise((resolve) => {
      window.postMessage({ type: "WSPP_SPAM_CHECK_NOW", own_number: getOwnNumber() }, WA_ORIGIN);
      const onResult = (e) => {
        if (e.source !== window) return;
        if (e.data?.type !== "WSPP_SPAM_CHECK_RESULT") return;
        window.removeEventListener("message", onResult);
        const r = e.data.result;
        resolve({ shouldPause: r?.risk_level === "critical", cooldown_sec: r?.cooldown_sec || 0, result: r });
      };
      window.addEventListener("message", onResult);
      setTimeout(() => {
        window.removeEventListener("message", onResult);
        resolve({ shouldPause: false, cooldown_sec: 0, result: null });
      }, 500);
    });
  }
  function _recordOutgoingBridge(text, phone) {
    window.postMessage({
      type: "WSPP_VALIDATOR_CONV_SENT",
      payload: { text, phone, own_number: getOwnNumber(), timestamp: Math.floor(Date.now() / 1e3) }
    }, WA_ORIGIN);
  }
  async function _sendConvMessage(phone, nombre) {
    return new Promise((resolve) => {
      const digits = String(phone).replace(/\D/g, "");
      if (!digits || digits.length < 9) {
        resolve({ sent: false, reason: "invalid_phone" });
        return;
      }
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onResult);
        resolve({ sent: false, reason: "timeout_open" });
      }, 12e3);
      const onResult = (e) => {
        if (e.source !== window) return;
        if (e.data?.type !== "WSPP_OPEN_CHAT_RESULT") return;
        if (e.data.phone !== digits) return;
        window.removeEventListener("message", onResult);
        clearTimeout(timeout);
        if (!e.data.ok) {
          resolve({ sent: false, reason: e.data.error || "open_failed" });
          return;
        }
        setTimeout(() => {
          const sent = _typeAndSend(_randomTemplate(nombre));
          resolve({ sent, reason: sent ? "ok" : "compose_failed" });
        }, 800);
      };
      window.addEventListener("message", onResult);
      window.postMessage({ type: "WSPP_OPEN_CHAT", phone: digits }, WA_ORIGIN);
    });
  }
  function _typeAndSend(text) {
    try {
      const composer = document.querySelector(
        '[data-testid="conversation-compose-box-input"], div[role="textbox"][contenteditable="true"]:not([aria-label*="b\xFAsqueda"]):not([aria-label*="search"])'
      );
      if (!composer) return false;
      composer.focus();
      document.execCommand("insertText", false, text);
      setTimeout(() => {
        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
          cancelable: true
        });
        composer.dispatchEvent(enterEvent);
      }, 200 + Math.random() * 300);
      return true;
    } catch (_) {
      return false;
    }
  }
  var _sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
  function _randomDelay() {
    if (_mode === "conv") {
      return CONV_DELAY_MIN + Math.random() * (CONV_DELAY_MAX - CONV_DELAY_MIN);
    }
    return SILENT_DELAY_MIN + Math.random() * (SILENT_DELAY_MAX - SILENT_DELAY_MIN);
  }
  function _startCountdown2(ms) {
    _countdown2 = Math.ceil(ms / 1e3);
    clearInterval(_countdownTimer2);
    _countdownTimer2 = setInterval(() => {
      _countdown2 = Math.max(0, _countdown2 - 1);
      const el = document.getElementById("wspp-val-countdown");
      if (el) el.textContent = _countdown2 > 0 ? `Pr\xF3ximo en ${_countdown2}s` : "Verificando...";
    }, 1e3);
  }
  function _stopCountdown2() {
    clearInterval(_countdownTimer2);
    _countdown2 = 0;
  }
  function _toast3(text, color = "#25d366", ms = 4e3) {
    const t = document.createElement("div");
    Object.assign(t.style, {
      position: "fixed",
      bottom: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      background: color,
      color: "#fff",
      padding: "10px 20px",
      borderRadius: "8px",
      fontSize: "13px",
      fontWeight: "600",
      zIndex: "2147483647",
      boxShadow: "0 4px 20px rgba(0,0,0,.35)",
      maxWidth: "360px",
      textAlign: "center",
      lineHeight: "1.4"
    });
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function _saveResults(results) {
    if (!results.length) return;
    window.postMessage({
      type: "WA_VALIDATOR_SAVE_RESULTS",
      results: results.map((r) => ({ id: r.id, wa_valid: r.wa_valid, mode: r.mode || "silent" })),
      own_number: _activeNumber2
    }, WA_ORIGIN);
  }
  async function _run2() {
    if (_running2 || _paused2) return;
    if (!_contacts2.length) {
      _toast3("Carga los contactos primero", "#ef5350");
      return;
    }
    _running2 = true;
    _paused2 = false;
    const batch = [];
    _render2();
    const sessionMax = _mode === "conv" ? SESSION_MAX_CONV : SESSION_MAX_SILENT;
    while (_idx2 < _contacts2.length && _running2 && !_paused2) {
      if (_sessionCount >= sessionMax) {
        _paused2 = _running2 = false;
        _stopCountdown2();
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        const msg = _mode === "conv" ? `${sessionMax} mensajes enviados. Descans\xE1 10 min antes de reanudar.` : `${sessionMax} verificados. Descans\xE1 5 min y reanud\xE1.`;
        _toast3(msg, "#ff9f0a", 1e4);
        _render2();
        break;
      }
      if (_mode === "conv" && _burstCount >= CONV_BURST_MAX) {
        _burstCount = 0;
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        _toast3(`Pausa de 2 min para evitar detecci\xF3n (${_sessionCount} msgs enviados)`, "#ff9f0a", CONV_BURST_REST);
        _startCountdown2(CONV_BURST_REST);
        _render2();
        await _sleep2(CONV_BURST_REST);
        _stopCountdown2();
        if (!_running2 || _paused2) break;
      }
      const c = _contacts2[_idx2];
      let waValid = false;
      let modeUsed = _mode;
      if (_mode === "conv") {
        const spamCheck = await _spamCheckBeforeSend2();
        if (spamCheck.shouldPause) {
          _paused2 = _running2 = false;
          _stopCountdown2();
          if (batch.length) {
            _saveResults([...batch]);
            batch.length = 0;
          }
          const coolMin = Math.ceil((spamCheck.cooldown_sec || 180) / 60);
          _toast3(
            `\u{1F6A8} RIESGO CR\xCDTICO \u2014 Validador pausado.
Esper\xE1 ${coolMin} min antes de reanudar.`,
            "#dc2626",
            15e3
          );
          _render2();
          break;
        }
        const r = await _sendConvMessage(c.telefono, c.nombre);
        waValid = r.sent;
        if (r.sent) {
          const tpl = _randomTemplate(c.nombre);
          _recordOutgoingBridge(tpl, c.telefono);
        } else {
          console.log("[WA VALIDATOR CONV] failed for", c.telefono, ":", r.reason);
        }
        _burstCount++;
      } else {
        const r = await _checkPhoneSilent(c.telefono);
        waValid = r.exists;
      }
      const result = { ...c, wa_valid: waValid, mode: modeUsed };
      batch.push(result);
      _results2.push(result);
      _sessionCount++;
      _idx2++;
      _render2();
      if (batch.length >= 20) {
        _saveResults([...batch]);
        batch.length = 0;
      }
      if (_running2 && !_paused2 && _idx2 < _contacts2.length) {
        const d = _randomDelay();
        _startCountdown2(d);
        _render2();
        await _sleep2(d);
        _stopCountdown2();
      }
    }
    if (batch.length) {
      _saveResults([...batch]);
      batch.length = 0;
    }
    if (!_paused2 && _idx2 >= _contacts2.length) {
      _running2 = false;
      _stopCountdown2();
      const valid = _results2.filter((r) => r.wa_valid).length;
      const invalid = _results2.filter((r) => !r.wa_valid).length;
      const modeLabel = _mode === "conv" ? "mensajes enviados" : "verificados sin mensajes";
      _toast3(`\u2705 Completado \u2014 ${valid} con WA \xB7 ${invalid} sin WA \xB7 ${modeLabel}`, "#25d366", 6e3);
    }
    _running2 = false;
    _render2();
  }
  function _render2() {
    const el = document.getElementById("wspp-val-panel");
    if (!_open2) {
      if (el) el.remove();
      return;
    }
    _activeNumber2 = getOwnNumber();
    const valid = _results2.filter((r) => r.wa_valid === true).length;
    const invalid = _results2.filter((r) => r.wa_valid === false).length;
    const pending = _contacts2.length - _idx2;
    const pct = _contacts2.length ? Math.round(_idx2 / _contacts2.length * 100) : 0;
    const isSilent = _mode === "silent";
    const isConv = _mode === "conv";
    const speedLabel = _sessionCount > 0 && _startTime ? `${Math.round(_sessionCount / ((Date.now() - _startTime) / 36e5))}/h` : "\u2014";
    const modeColor = isSilent ? "#60a5fa" : "#a78bfa";
    const modeLabel = isSilent ? "Silencioso" : "Conversaci\xF3n";
    const modeDesc = isSilent ? "Verifica sin abrir chats ni enviar mensajes" : "Abre chat + env\xEDa saludo \xB7 anti-baneo activo";
    const html = `
    <div id="wspp-val-panel" style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:480px;max-height:92vh;overflow-y:auto;
      background:#0a0f1e;border:1px solid rgba(96,165,250,.2);border-radius:16px;
      box-shadow:0 24px 64px rgba(0,0,0,.8);z-index:2147483645;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
    ">
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.06);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:9px;background:rgba(96,165,250,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#60a5fa"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;">Validador WA \xB7 Goberna</div>
            <div style="font-size:10px;color:rgba(255,255,255,.5);">Limpieza de base \xB7 M\xE9trica de brigadistas</div>
          </div>
        </div>
        <button id="wspp-val-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:18px;cursor:pointer;padding:4px 8px;line-height:1;">\u2715</button>
      </div>

      <!-- Selector de modo -->
      <div style="margin:12px 16px 0;display:flex;gap:6px;">
        <button id="wspp-mode-silent" style="
          flex:1;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;
          background:${isSilent ? "rgba(96,165,250,.15)" : "rgba(255,255,255,.03)"};
          border:1px solid ${isSilent ? "rgba(96,165,250,.4)" : "rgba(255,255,255,.07)"};
          color:${isSilent ? "#60a5fa" : "rgba(255,255,255,.35)"};
          transition:all .15s;
          ${_running2 ? "opacity:0.4;pointer-events:none;" : ""}
        ">
          \u{1F50D} Silencioso<br>
          <span style="font-size:10px;font-weight:400;opacity:.7;">2-4s por n\xFAmero</span>
        </button>
        <button id="wspp-mode-conv" style="
          flex:1;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;
          background:${isConv ? "rgba(167,139,250,.15)" : "rgba(255,255,255,.03)"};
          border:1px solid ${isConv ? "rgba(167,139,250,.4)" : "rgba(255,255,255,.07)"};
          color:${isConv ? "#a78bfa" : "rgba(255,255,255,.35)"};
          transition:all .15s;
          ${_running2 ? "opacity:0.4;pointer-events:none;" : ""}
        ">
          \u{1F4AC} Conversaci\xF3n<br>
          <span style="font-size:10px;font-weight:400;opacity:.7;">15-45s \xB7 anti-baneo</span>
        </button>
      </div>

      <!-- Modo activo info -->
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:8px;font-size:11px;color:rgba(255,255,255,.4);">
        <span style="color:${modeColor};font-weight:700;">${modeLabel}</span>
        \xB7 ${modeDesc}
        ${isConv ? `<br><span style="color:rgba(255,149,0,.6);">\u26A0\uFE0F Usa delays de 15-45s y pausa cada ${CONV_BURST_MAX} msgs \u2014 cumple best practices</span>` : ""}
      </div>

      <!-- N\xFAmero activo -->
      <div style="margin:8px 16px 0;padding:7px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:11px;color:rgba(255,255,255,.4);">N\xFAmero activo</span>
        <span style="font-size:13px;font-weight:700;color:${_activeNumber2 ? "#60a5fa" : "#ff9f0a"};">
          ${_activeNumber2 ? "+" + _activeNumber2 : "\u23F3 detectando..."}
        </span>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);">
        ${[
      ["Total", _total2, "#60a5fa"],
      ["\u2705 Con WA", valid, "#34c759"],
      ["\u274C Sin WA", invalid, "#ef5350"],
      ["Pendientes", pending, "#ff9f0a"],
      ["Vel.", speedLabel, "#a78bfa"]
    ].map(([l, v, c]) => `
          <div style="text-align:center;padding:5px 2px;background:rgba(255,255,255,.03);border-radius:7px;">
            <div style="font-size:15px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.55);text-transform:uppercase;margin-top:1px;">${l}</div>
          </div>
        `).join("")}
      </div>

      <!-- Progreso -->
      ${_contacts2.length ? `
      <div style="padding:10px 16px 5px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">
          <span>${_idx2} / ${_contacts2.length} procesados</span>
          <span id="wspp-val-countdown" style="color:${_running2 ? modeColor : "rgba(255,255,255,.5)"};">
            ${_running2 && _countdown2 > 0 ? `Pr\xF3ximo en ${_countdown2}s` : _running2 ? "Procesando..." : ""}
          </span>
          <span>${pct}%</span>
        </div>
        <div style="background:rgba(255,255,255,.06);border-radius:4px;height:5px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,${modeColor},${isSilent ? "#a78bfa" : "#60a5fa"});width:${pct}%;height:100%;border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>` : ""}

      <!-- Controles -->
      <div style="padding:10px 16px 14px;display:flex;gap:8px;flex-wrap:wrap;">
        ${!_contacts2.length ? `
          <button id="wspp-val-load" style="flex:1;padding:11px 16px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:9px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer;">
            \u{1F4CB} Cargar ${_total2 || "..."} n\xFAmeros
          </button>
        ` : !_running2 && !_paused2 ? `
          <button id="wspp-val-start" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px ${modeColor}33;">
            \u25B6 ${isConv ? "Iniciar conversaciones" : "Verificar"} (${_contacts2.length - _idx2})
          </button>
          <button id="wspp-val-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">\u21BA</button>
        ` : _running2 ? `
          <div style="flex:1;padding:9px 12px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${isConv ? `\u{1F4AC} Enviando \xB7 ${_sessionCount} msgs \xB7 burst ${_burstCount}/${CONV_BURST_MAX}` : `\u{1F535} Verificando \xB7 ${_sessionCount} en esta sesi\xF3n`}
          </div>
          <button id="wspp-val-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">\u23F8 Pausar</button>
        ` : _paused2 && _idx2 < _contacts2.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            \u23F8 Pausado en ${_idx2}/${_contacts2.length}. Listo para reanudar.
          </div>
          <button id="wspp-val-resume" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;">\u25B6 Reanudar</button>
        ` : `
          <div style="width:100%;padding:9px;background:rgba(52,199,89,.06);border:1px solid rgba(52,199,89,.14);border-radius:9px;font-size:12px;color:#34c759;text-align:center;font-weight:600;">
            \u2705 Completado \u2014 ${valid} con WA \xB7 ${invalid} sin WA
          </div>
          <button id="wspp-val-stats" style="flex:1;padding:11px 16px;background:rgba(167,139,250,.1);border:1px solid rgba(167,139,250,.2);border-radius:9px;color:#a78bfa;font-size:13px;font-weight:700;cursor:pointer;">\u{1F4CA} Reporte brigadistas</button>
        `}
      </div>

      <!-- \xDAltimos resultados -->
      ${_results2.length ? `
      <div style="padding:0 16px 16px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">\xDAltimos procesados</div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
          ${_results2.slice(-12).reverse().map((r) => `
            <div style="display:flex;align-items:center;gap:7px;padding:5px 9px;background:rgba(255,255,255,.02);border-radius:6px;border:1px solid rgba(255,255,255,.04);">
              <span style="font-size:13px;flex-shrink:0;">${r.wa_valid ? "\u2705" : "\u274C"}</span>
              <span style="font-size:12px;color:${r.wa_valid ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.5)"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${r.nombre || "?"} \xB7 +${r.telefono}
              </span>
              <span style="font-size:10px;color:rgba(255,255,255,.15);flex-shrink:0;">
                ${r.mode === "conv" ? "\u{1F4AC}" : "\u{1F50D}"} ${(r.encuestador || "").slice(0, 14)}
              </span>
            </div>
          `).join("")}
        </div>
      </div>` : ""}
    </div>
  `;
    if (el) el.outerHTML = html;
    else document.body.insertAdjacentHTML("beforeend", html);
    document.getElementById("wspp-val-close")?.addEventListener("click", () => {
      _open2 = false;
      if (_running2) {
        _running2 = false;
        _paused2 = true;
        _stopCountdown2();
      }
      _render2();
    });
    document.getElementById("wspp-mode-silent")?.addEventListener("click", () => {
      if (_running2) return;
      _mode = "silent";
      _render2();
    });
    document.getElementById("wspp-mode-conv")?.addEventListener("click", () => {
      if (_running2) return;
      _mode = "conv";
      _render2();
    });
    document.getElementById("wspp-val-load")?.addEventListener("click", _load2);
    document.getElementById("wspp-val-reload")?.addEventListener("click", () => {
      _contacts2 = [];
      _results2 = [];
      _idx2 = 0;
      _sessionCount = 0;
      _burstCount = 0;
      _running2 = false;
      _paused2 = false;
      _load2();
    });
    document.getElementById("wspp-val-start")?.addEventListener("click", () => {
      _startTime = Date.now();
      _burstCount = 0;
      _run2();
    });
    document.getElementById("wspp-val-pause")?.addEventListener("click", () => {
      _paused2 = true;
      _running2 = false;
      _stopCountdown2();
      _render2();
    });
    document.getElementById("wspp-val-resume")?.addEventListener("click", () => {
      _sessionCount = 0;
      _burstCount = 0;
      _paused2 = false;
      _run2();
    });
    document.getElementById("wspp-val-stats")?.addEventListener("click", () => {
      window.postMessage({ type: "WA_VALIDATOR_GET_STATS_REQ" }, WA_ORIGIN);
    });
  }
  function _load2() {
    _activeNumber2 = getOwnNumber();
    const btn = document.getElementById("wspp-val-load") || document.getElementById("wspp-val-reload");
    if (btn) {
      btn.textContent = "\u23F3 Cargando...";
      btn.disabled = true;
    }
    window.postMessage({ type: "WA_VALIDATOR_GET_CONTACTS", limit: 500, offset: _idx2 }, WA_ORIGIN);
  }
  function _showStats(summary, byBrigadista) {
    const existing = document.getElementById("wspp-val-stats-panel");
    if (existing) {
      existing.remove();
      return;
    }
    const topBad = (byBrigadista || []).filter((b) => b.invalid > 0).sort((a, b) => (b.invalid_rate_pct || 0) - (a.invalid_rate_pct || 0)).slice(0, 15);
    const html = `
    <div id="wspp-val-stats-panel" style="
      position:fixed;top:50%;right:20px;transform:translateY(-50%);
      width:400px;max-height:82vh;overflow-y:auto;
      background:#0a0f1e;border:1px solid rgba(167,139,250,.2);border-radius:14px;
      box-shadow:0 16px 48px rgba(0,0,0,.7);z-index:2147483642;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#fff;
      padding:16px;
    ">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:#a78bfa;">\u{1F4CA} Reporte por Brigadista</div>
        <button id="wspp-stats-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:16px;cursor:pointer;">\u2715</button>
      </div>

      <!-- Summary global -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:14px;">
        ${[
      ["Total", summary?.total || 0, "#60a5fa"],
      ["Con WA", summary?.valid || 0, "#34c759"],
      ["Sin WA", summary?.invalid || 0, "#ef5350"],
      ["Pendiente", summary?.pending || 0, "#ff9f0a"]
    ].map(([l, v, c]) => `
          <div style="text-align:center;padding:6px;background:rgba(255,255,255,.03);border-radius:8px;">
            <div style="font-size:18px;font-weight:800;color:${c};">${v}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;">${l}</div>
          </div>
        `).join("")}
      </div>

      <!-- Tasa global de inv\xE1lidos -->
      ${summary?.total ? `
      <div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:rgba(255,255,255,.5);">Tasa inv\xE1lidos global</span>
        <span style="font-weight:700;color:${summary.invalid / summary.total > 0.3 ? "#ef5350" : summary.invalid / summary.total > 0.15 ? "#ff9f0a" : "#34c759"};">${Math.round(summary.invalid / summary.total * 100)}%</span>
      </div>` : ""}

      <!-- Brigadistas con m\xE1s inv\xE1lidos -->
      <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
        Brigadistas con m\xE1s n\xFAmeros inv\xE1lidos
      </div>
      ${topBad.length === 0 ? `
        <div style="font-size:12px;color:rgba(255,255,255,.5);text-align:center;padding:16px;">
          Sin datos \u2014 ejecut\xE1 la validaci\xF3n primero
        </div>
      ` : topBad.map((b) => {
      const pct = Number(b.invalid_rate_pct) || 0;
      const pctColor = pct > 40 ? "#ef5350" : pct > 20 ? "#ff9f0a" : "#a78bfa";
      return `
        <div style="padding:8px 10px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.04);margin-bottom:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:230px;">
              ${b.encuestador || "Sin nombre"}
            </span>
            <span style="font-size:12px;font-weight:800;color:${pctColor};">${pct}% inv.</span>
          </div>
          <div style="display:flex;gap:12px;font-size:11px;color:rgba(255,255,255,.35);">
            <span>\u{1F4CB} ${b.total} total</span>
            <span style="color:#34c759;">\u2705 ${b.valid || 0}</span>
            <span style="color:#ef5350;">\u274C ${b.invalid}</span>
            <span style="color:#ff9f0a;">\u23F3 ${b.pending || 0}</span>
          </div>
          <!-- Barra de inv\xE1lidos -->
          <div style="margin-top:5px;background:rgba(255,255,255,.05);border-radius:3px;height:3px;overflow:hidden;">
            <div style="background:${pctColor};width:${Math.min(100, pct)}%;height:100%;border-radius:3px;"></div>
          </div>
        </div>
      `;
    }).join("")}
    </div>
  `;
    document.body.insertAdjacentHTML("beforeend", html);
    document.getElementById("wspp-stats-close")?.addEventListener("click", () => {
      document.getElementById("wspp-val-stats-panel")?.remove();
    });
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "WA_VALIDATOR_CONTACTS_READY") {
      if (!e.data.ok) {
        _toast3("Error cargando contactos: " + (e.data.error || "?"), "#ef5350");
        _render2();
        return;
      }
      _contacts2 = e.data.contacts || [];
      _total2 = e.data.total || _contacts2.length;
      _idx2 = 0;
      _sessionCount = 0;
      _burstCount = 0;
      _results2 = [];
      _running2 = false;
      _paused2 = false;
      _toast3(`\u2705 ${_contacts2.length} n\xFAmeros cargados`, "#60a5fa");
      _render2();
      return;
    }
    if (e.data?.type === "WA_VALIDATOR_STATS_READY") {
      _showStats(e.data.summary, e.data.by_brigadista);
      return;
    }
  });
  function toggleValidatorPanel() {
    _open2 = !_open2;
    _render2();
  }

  // src/inject/sidebar.js
  var SIDEBAR_WIDTH = 360;
  var SIDEBAR_ID = "wspp-sidebar";
  var FAB_ID = "wspp-sidebar-fab";
  var WA_APP_SEL = "#app";
  var STORAGE_KEY = "wspp_sidebar_tab";
  var Z = {
    fab: 2147483647,
    // FAB siempre encima de todo
    toasts: 2147483647,
    // toasts al mismo nivel que FAB (temporales, no se solapan con FAB)
    blast: 2147483646,
    // blast modal encima del sidebar
    validator: 2147483645,
    // validator modal debajo del blast, encima del sidebar
    sidebar: 2147483644,
    // sidebar debajo de modales
    valOverlay: 2147483643,
    // validation overlay debajo del sidebar pero encima de WA
    valStats: 2147483642,
    // validator stats panel
    spamWarning: 2147483641,
    // spam warning
    spamBlocker: 2147483640,
    // semitransparent blocker
    catalogPanel: 2147483639
    // catálogo panel legacy
  };
  var C = {
    bg: "#0f1923",
    bgTab: "#0a1118",
    border: "rgba(255,255,255,0.07)",
    accent: "#25d366",
    accentDim: "rgba(37,211,102,0.15)",
    text: "#e9edef",
    muted: "rgba(255,255,255,0.4)",
    danger: "#ef5350",
    warn: "#ff9f0a"
  };
  var _open3 = false;
  var _activeTab = localStorage.getItem(STORAGE_KEY) || "contacts";
  var _allContacts = [];
  var _filteredList = [];
  var _totalContacts = 0;
  var _contactsLoading = false;
  var _contactsLoaded = false;
  var _activeFilter = "";
  var _searchQuery = "";
  var _searchTimer = null;
  var ROW_HEIGHT = 56;
  var OVERSCAN = 8;
  var VIEWPORT_ROWS = 12;
  var _audioItems = [];
  var _audioLoading = false;
  var _audioLoaded = false;
  var $ = (id) => document.getElementById(id);
  function _setTab(tab) {
    _activeTab = tab;
    localStorage.setItem(STORAGE_KEY, tab);
    _renderTabs();
    _renderContent();
    if (tab === "contacts" && !_contactsLoaded && !_contactsLoading) _loadContacts();
    if (tab === "audios" && !_audioLoaded && !_audioLoading) _loadAudios();
  }
  function _loadContacts() {
    _contactsLoading = true;
    const countEl = $("wspp-contacts-count");
    if (countEl) countEl.textContent = "Cargando contactos...";
    window.postMessage({ type: "BLAST_GET_FORM_CONTACTS", limit: 500, offset: 0, status: "" }, WA_ORIGIN);
  }
  function _loadAudios() {
    _audioLoading = true;
    window.postMessage({ type: "FETCH_AUDIO_CATALOG" }, WA_ORIGIN);
  }
  function _applyFilters() {
    let list = _allContacts;
    if (_activeFilter) {
      list = list.filter((c) => {
        const status = c.cms_status || "pendiente";
        const vote = c.vote_class || "";
        return status === _activeFilter || vote === _activeFilter;
      });
    }
    if (_searchQuery.length >= 2) {
      const q = _searchQuery.toLowerCase();
      list = list.filter((c) => {
        const name = ((c.nombre || "") + " " + (c.apellidos || "")).toLowerCase();
        const tel = c.telefono || "";
        return name.includes(q) || tel.includes(q);
      });
    }
    _filteredList = list;
    _renderVirtualList();
  }
  function _renderVirtualList() {
    const container = $("wspp-contacts-list");
    const countEl = $("wspp-contacts-count");
    if (!container) return;
    const total = _filteredList.length;
    if (countEl) {
      const filterLabel = _activeFilter ? ` \xB7 ${_activeFilter}` : "";
      const searchLabel = _searchQuery ? ` \xB7 "${_searchQuery}"` : "";
      countEl.textContent = `${total.toLocaleString("es-PE")} contactos${filterLabel}${searchLabel}`;
    }
    if (total === 0) {
      container.innerHTML = `<div style="text-align:center;padding:24px 12px;color:${C.muted};font-size:12px;">
      ${_contactsLoading ? "Cargando..." : _searchQuery ? 'Sin resultados para "' + _searchQuery + '"' : "Sin contactos con este filtro"}
    </div>`;
      container.style.height = "auto";
      return;
    }
    const totalHeight = total * ROW_HEIGHT;
    container.style.height = Math.min(totalHeight, VIEWPORT_ROWS * ROW_HEIGHT) + "px";
    container.style.overflowY = "auto";
    container.style.position = "relative";
    container.style.overscrollBehavior = "contain";
    container.innerHTML = `<div id="wspp-vscroll-spacer" style="height:${totalHeight}px;position:relative;"></div>`;
    const spacer = $("wspp-vscroll-spacer");
    const renderVisible = () => {
      const scrollTop = container.scrollTop;
      const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
      const endIdx = Math.min(total, startIdx + VIEWPORT_ROWS + OVERSCAN * 2);
      let html = "";
      for (let i = startIdx; i < endIdx; i++) {
        const c = _filteredList[i];
        html += `<div style="position:absolute;top:${i * ROW_HEIGHT}px;left:0;right:0;height:${ROW_HEIGHT}px;padding:0 4px;">${renderContactRow(c)}</div>`;
      }
      spacer.innerHTML = html;
      _bindContactRowEvents(spacer);
    };
    renderVisible();
    let _scrollRAF = null;
    container.addEventListener("scroll", () => {
      if (_scrollRAF) cancelAnimationFrame(_scrollRAF);
      _scrollRAF = requestAnimationFrame(renderVisible);
    }, { passive: true });
  }
  function _bindContactRowEvents(root) {
    root.querySelectorAll(".wspp-contact-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        const actions = row.querySelector(".wspp-contact-actions");
        if (!actions) return;
        const isOpen = actions.style.display === "flex";
        root.querySelectorAll(".wspp-contact-actions").forEach((a) => a.style.display = "none");
        actions.style.display = isOpen ? "none" : "flex";
      });
    });
    root.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const phone = btn.dataset.phone;
        if (action === "send") {
          window.postMessage({ type: "WSPP_OPEN_CHAT", phone }, WA_ORIGIN);
          return;
        }
        const voteMap = { duro: "duro", blando: "blando", flotante: "flotante", invalido: "" };
        const statusMap = { duro: "respondido", blando: "respondido", flotante: "respondido", invalido: "invalido" };
        window.postMessage({
          type: "WSPP_CLASSIFY",
          payload: { validation_id: id, vote_class: voteMap[action], status: statusMap[action], _phone: phone || null }
        }, WA_ORIGIN);
        const row = btn.closest(".wspp-contact-row");
        if (row) {
          row.style.opacity = "0.4";
          row.style.pointerEvents = "none";
        }
      });
    });
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "BLAST_FORM_CONTACTS_READY") {
      _contactsLoading = false;
      _contactsLoaded = true;
      if (e.data.ok) {
        _allContacts = e.data.contacts || [];
        _totalContacts = e.data.total || _allContacts.length;
        console.log(`[SIDEBAR] ${_allContacts.length} contactos cargados (total: ${_totalContacts})`);
        _applyFilters();
      } else {
        const countEl = $("wspp-contacts-count");
        if (countEl) countEl.textContent = "Error al cargar: " + (e.data.error || "?");
      }
      return;
    }
    if (e.data?.type === "AUDIO_CATALOG_READY") {
      _audioLoading = false;
      _audioLoaded = true;
      if (e.data.ok) {
        _audioItems = e.data.items || [];
        console.log(`[SIDEBAR] ${_audioItems.length} audios cargados`);
        updateAudioList(_audioItems);
      }
      return;
    }
    if (e.data?.type === "GENERATE_CATALOG_AUDIO_DONE") {
      if (e.data.ok) {
        _audioLoaded = false;
        if (_activeTab === "audios") _loadAudios();
      }
      return;
    }
  });
  function _pushWaLayout(open) {
    const app = document.querySelector(WA_APP_SEL);
    if (!app) return;
    if (open) {
      app.style.transition = "padding-right 0.25s ease";
      app.style.paddingRight = SIDEBAR_WIDTH + "px";
    } else {
      app.style.paddingRight = "0";
    }
  }
  function insertSidebarFAB() {
    if ($(FAB_ID)) return;
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.title = "Goberna \u2014 Panel lateral";
    fab.innerHTML = _fabIcon(false);
    Object.assign(fab.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: String(Z.fab),
      width: "48px",
      height: "48px",
      borderRadius: "50%",
      background: "#163960",
      border: "none",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 4px 20px rgba(0,0,0,.5)",
      transition: "transform 0.15s, background 0.15s"
    });
    fab.addEventListener("mouseenter", () => {
      fab.style.transform = "scale(1.12)";
    });
    fab.addEventListener("mouseleave", () => {
      fab.style.transform = "scale(1)";
    });
    fab.addEventListener("click", toggleSidebar);
    document.body.appendChild(fab);
  }
  function _fabIcon(open) {
    if (open) {
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="white">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
    }
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="white">
    <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
  </svg>`;
  }
  function toggleSidebar() {
    _open3 = !_open3;
    const fab = $(FAB_ID);
    if (fab) {
      fab.innerHTML = _fabIcon(_open3);
      fab.style.transition = "right 0.25s ease, background 0.15s ease";
      fab.style.background = _open3 ? "#0d2137" : "#163960";
      if (_open3) {
        fab.style.right = SIDEBAR_WIDTH + 12 + "px";
      } else {
        setTimeout(() => {
          if (!_open3) fab.style.right = "20px";
        }, 250);
      }
    }
    _pushWaLayout(_open3);
    if (_open3) {
      _renderSidebar();
      if (_activeTab === "contacts" && !_contactsLoaded && !_contactsLoading) _loadContacts();
      if (_activeTab === "audios" && !_audioLoaded && !_audioLoading) _loadAudios();
    } else {
      const el = $(SIDEBAR_ID);
      if (el) {
        el.style.transform = `translateX(${SIDEBAR_WIDTH}px)`;
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 260);
      }
    }
  }
  function _renderSidebar() {
    let el = $(SIDEBAR_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = SIDEBAR_ID;
      Object.assign(el.style, {
        position: "fixed",
        top: "0",
        right: "0",
        width: SIDEBAR_WIDTH + "px",
        height: "100vh",
        zIndex: String(Z.sidebar),
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        boxShadow: "-8px 0 32px rgba(0,0,0,.4)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif,'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji'",
        color: C.text,
        transform: `translateX(${SIDEBAR_WIDTH}px)`,
        opacity: "0",
        transition: "transform 0.25s ease, opacity 0.2s ease",
        overflowX: "hidden"
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = "translateX(0)";
        el.style.opacity = "1";
      });
    }
    el.innerHTML = `
    ${_headerHTML()}
    ${_tabBarHTML()}
    <div id="wspp-sidebar-content" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;">
      ${_contentHTML()}
    </div>
    ${_footerHTML()}
  `;
    _bindEvents();
  }
  function _headerHTML() {
    const own = getOwnNumber();
    const ownLabel = own ? `+${own}` : "\u23F3 detectando...";
    return `
    <div style="
      padding:12px 16px 8px;
      border-bottom:1px solid ${C.border};
      display:flex;align-items:center;justify-content:space-between;
      flex-shrink:0;
    ">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="
          width:28px;height:28px;border-radius:7px;
          background:rgba(37,211,102,.12);
          display:flex;align-items:center;justify-content:center;
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="${C.accent}">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
          </svg>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;letter-spacing:-.3px;">Goberna</div>
          <div style="font-size:11px;color:${C.muted};">${ownLabel}</div>
        </div>
      </div>
      <button id="wspp-sidebar-close" style="
        background:none;border:none;color:${C.muted};
        font-size:16px;cursor:pointer;padding:4px;line-height:1;
        border-radius:4px;
      ">\u2715</button>
    </div>
  `;
  }
  var TABS = [
    { id: "contacts", icon: "\u{1F4CB}", label: "Contactos" },
    { id: "audios", icon: "\u{1F399}", label: "Audios" },
    { id: "status", icon: "\u{1F4CA}", label: "Estado" }
  ];
  function _tabBarHTML() {
    return `
    <div style="
      display:flex;border-bottom:1px solid ${C.border};
      flex-shrink:0;background:${C.bgTab};
    ">
      ${TABS.map((t) => {
      const active = _activeTab === t.id;
      return `
          <button data-tab="${t.id}" style="
            flex:1;padding:10px 4px;border:none;cursor:pointer;
            background:${active ? C.bg : "transparent"};
            color:${active ? C.accent : C.muted};
            font-size:11px;font-weight:${active ? "700" : "500"};
            border-bottom:2px solid ${active ? C.accent : "transparent"};
            transition:all .15s;
          ">
            <div style="font-size:14px;margin-bottom:2px;">${t.icon}</div>
            ${t.label}
          </button>
        `;
    }).join("")}
    </div>
  `;
  }
  function _contentHTML() {
    if (_activeTab === "contacts") return _contactsTabHTML();
    if (_activeTab === "audios") return _audiosTabHTML();
    if (_activeTab === "status") return _statusTabHTML();
    return "";
  }
  function _footerHTML() {
    return `
    <div style="
      padding:8px 12px;border-top:1px solid ${C.border};
      display:flex;gap:6px;flex-shrink:0;
    ">
      <button id="wspp-sidebar-blast-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:${C.accentDim};color:${C.accent};
        font-size:11px;font-weight:700;
      ">\u26A1 Blast</button>
      <button id="wspp-sidebar-val-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:rgba(96,165,250,.1);color:#60a5fa;
        font-size:11px;font-weight:700;
      ">\u2705 Validar</button>
      ${isCatalogConsultor() ? `
      <button id="wspp-sidebar-catalog-btn" style="
        flex:1;padding:9px;border-radius:8px;border:none;cursor:pointer;
        background:rgba(167,139,250,.1);color:#a78bfa;
        font-size:11px;font-weight:700;
      ">\u{1F3B5} Cat\xE1logo</button>
      ` : ""}
    </div>
  `;
  }
  function _contactsTabHTML() {
    return `
    <div style="padding:10px 12px 4px;">

      <!-- Barra de b\xFAsqueda -->
      <div style="
        display:flex;gap:6px;align-items:center;
        background:rgba(255,255,255,.05);border:1px solid ${C.border};
        border-radius:8px;padding:6px 10px;margin-bottom:8px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${C.muted}">
          <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
        </svg>
        <input
          id="wspp-contacts-search"
          placeholder="Buscar por nombre o n\xFAmero..."
          style="
            background:none;border:none;outline:none;
            color:${C.text};font-size:12px;flex:1;
          "
        />
      </div>

      <!-- Filtros r\xE1pidos -->
      <div style="display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap;">
        ${[
      { key: "pendiente", label: "\u23F3 Pendiente", color: "#ff9f0a" },
      { key: "hablado", label: "\u{1F4AC} Hablado", color: "#60a5fa" },
      { key: "duro", label: "\u2705 Duro", color: "#34c759" },
      { key: "blando", label: "\u{1F7E1} Blando", color: "#fde68a" },
      { key: "flotante", label: "\u{1F7E3} Flotante", color: "#a78bfa" }
    ].map((f) => `
          <button data-filter="${f.key}" style="
            padding:3px 8px;border-radius:12px;border:1px solid ${f.color}33;
            background:${f.color}11;color:${f.color};
            font-size:10px;cursor:pointer;font-weight:600;
            white-space:nowrap;
          ">${f.label}</button>
        `).join("")}
      </div>

      <!-- Subt\xEDtulo con conteo -->
      <div id="wspp-contacts-count" style="
        font-size:10px;color:${C.muted};
        text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;
      ">Cargando contactos...</div>
    </div>

    <!-- Lista de contactos (scrollable) -->
    <div id="wspp-contacts-list" style="
      padding:0 8px 8px;
      display:flex;flex-direction:column;gap:3px;
    ">
      <div style="text-align:center;padding:24px 12px;color:${C.muted};font-size:12px;line-height:1.6;">
        Toc\xE1 <strong style="color:${C.accent};">\u26A1 Blast</strong> o <strong style="color:#60a5fa;">\u2705 Validar</strong> abajo para cargar contactos
      </div>
    </div>
  `;
  }
  function renderContactRow(contact) {
    const nombre = ((contact.nombre || "") + " " + (contact.apellidos || "")).trim() || "\u2014";
    const tel = contact.telefono || "\u2014";
    const dist = contact.distrito || "";
    const status = contact.cms_status || "pendiente";
    const vote = contact.vote_class || "";
    const waOk = contact.wa_valid === true;
    const waNull = contact.wa_valid === null || contact.wa_valid === void 0;
    const statusColor = {
      pendiente: "#ff9f0a",
      hablado: "#60a5fa",
      respondido: "#a78bfa",
      invalido: "#ef5350"
    }[status] || C.muted;
    const voteColor = {
      duro: "#34c759",
      blando: "#fde68a",
      flotante: "#a78bfa"
    }[vote] || "transparent";
    const voteLabel = { duro: "Duro", blando: "Blando", flotante: "Flotante" }[vote] || "";
    const waIcon = waNull ? "\u2753" : waOk ? "\u2705" : "\u274C";
    return `
    <div
      data-contact-id="${contact.id}"
      data-phone="${tel}"
      class="wspp-contact-row"
      style="
        padding:8px 10px;border-radius:8px;
        background:rgba(255,255,255,.03);
        border:1px solid ${C.border};
        cursor:pointer;
        transition:background .1s;
      "
    >
      <!-- Fila principal -->
      <div style="display:flex;align-items:center;gap:8px;">
        <!-- Indicador de vote_class -->
        <div style="
          width:3px;height:32px;border-radius:2px;flex-shrink:0;
          background:${vote ? voteColor : C.border};
        "></div>

        <!-- Info -->
        <div style="flex:1;min-width:0;">
          <div style="
            font-size:12px;font-weight:600;color:${C.text};
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
          ">${nombre}</div>
          <div style="font-size:10px;color:${C.muted};margin-top:1px;">
            ${tel}${dist ? " \xB7 " + dist : ""}
          </div>
        </div>

        <!-- Badges derecha -->
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
          <span style="font-size:10px;color:${statusColor};font-weight:600;">${status}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:11px;" title="WhatsApp: ${waNull ? "sin verificar" : waOk ? "tiene WA" : "sin WA"}">${waIcon}</span>
            ${vote ? `<span style="font-size:11px;font-weight:700;color:${voteColor};background:${voteColor}22;padding:1px 5px;border-radius:8px;">${voteLabel}</span>` : ""}
          </div>
        </div>
      </div>

      <!-- Acciones (colapsadas \u2014 se expanden al click en la fila) -->
      <div class="wspp-contact-actions" style="
        display:none;margin-top:7px;padding-top:6px;
        border-top:1px solid ${C.border};
        gap:4px;flex-wrap:wrap;
      ">
        <button data-action="send" data-phone="${tel}" data-name="${nombre}" style="
          flex:1;min-width:60px;padding:5px 6px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(37,211,102,.12);color:${C.accent};font-size:10px;font-weight:700;
        ">\u{1F4AC} Escribir</button>
        <button data-action="duro" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(52,199,89,.1);color:#34c759;font-size:10px;font-weight:700;
        ">\u2705 Duro</button>
        <button data-action="blando" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(253,230,138,.1);color:#fde68a;font-size:10px;font-weight:700;
        ">\u{1F7E1} Blando</button>
        <button data-action="flotante" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(167,139,250,.1);color:#a78bfa;font-size:10px;font-weight:700;
        ">\u{1F7E3} Float.</button>
        <button data-action="invalido" data-id="${contact.id}" style="
          padding:5px 8px;border-radius:6px;border:none;cursor:pointer;
          background:rgba(239,83,80,.1);color:${C.danger};font-size:10px;font-weight:700;
        ">\u274C Desc.</button>
      </div>
    </div>
  `;
  }
  function _audiosTabHTML() {
    return `
    <div style="padding:10px 12px 4px;">
      <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
        Cat\xE1logo de audios \xB7 Toc\xE1 para previsualizar \xB7 Envi\xE1 al chat activo
      </div>

      <!-- Filtro por categor\xEDa -->
      <div id="wspp-audio-cat-filter" style="
        display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;
      ">
        <button data-audio-cat="all" style="
          padding:3px 10px;border-radius:12px;border:1px solid ${C.accent}55;
          background:${C.accentDim};color:${C.accent};
          font-size:10px;cursor:pointer;white-space:nowrap;font-weight:700;
        ">Todos</button>
      </div>
    </div>

    <!-- Lista de audios -->
    <div id="wspp-audio-list" style="padding:0 8px 8px;display:flex;flex-direction:column;gap:3px;">
      <div style="text-align:center;padding:24px 0;color:${C.muted};font-size:12px;">
        Cargando cat\xE1logo...
      </div>
    </div>
  `;
  }
  function renderAudioRow(item) {
    const dur = item.duration_ms ? _fmtDuration(item.duration_ms) : "\u2014";
    const size = item.audio_size ? _fmtSize(item.audio_size) : "";
    const hasAudio = !!item.has_audio;
    return `
    <div
      data-audio-id="${item.id}"
      class="wspp-audio-row"
      style="
        padding:8px 10px;border-radius:8px;
        background:rgba(255,255,255,.03);
        border:1px solid ${C.border};
        display:flex;align-items:center;gap:8px;
        cursor:${hasAudio ? "pointer" : "default"};
        opacity:${hasAudio ? "1" : "0.5"};
      "
    >
      <!-- Play / Sin audio -->
      <div style="
        width:32px;height:32px;border-radius:50%;flex-shrink:0;
        background:${hasAudio ? C.accentDim : "rgba(255,255,255,.05)"};
        display:flex;align-items:center;justify-content:center;
      ">
        ${hasAudio ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="${C.accent}"><path d="M8 5v14l11-7z"/></svg>` : `<span style="font-size:14px;color:${C.muted};">\u2014</span>`}
      </div>

      <!-- Info -->
      <div style="flex:1;min-width:0;">
        <div style="
          font-size:12px;font-weight:600;color:${C.text};
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        ">${item.label}</div>
        <div style="font-size:10px;color:${C.muted};margin-top:1px;">
          ${item.category}${dur !== "\u2014" ? " \xB7 " + dur : ""}${size ? " \xB7 " + size : ""}
        </div>
      </div>

      <!-- Bot\xF3n enviar -->
      ${hasAudio ? `
        <button data-audio-send="${item.id}" style="
          padding:5px 10px;border-radius:6px;border:1px solid rgba(37,211,102,.3);cursor:pointer;
          background:${C.accentDim};color:${C.accent};
          font-size:10px;font-weight:700;flex-shrink:0;
          white-space:nowrap;
        ">Enviar PTT</button>
      ` : `
        <button data-audio-regen="${item.id}" style="
          padding:5px 8px;border-radius:6px;border:1px solid rgba(255,149,0,.3);
          background:rgba(255,149,0,.08);color:${C.warn};cursor:pointer;
          font-size:10px;font-weight:700;flex-shrink:0;
        ">Generar</button>
      `}
    </div>
  `;
  }
  function _fmtDuration(ms) {
    const s = Math.floor(ms / 1e3);
    return s < 60 ? s + "s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function _fmtSize(bytes) {
    return bytes < 1024 ? bytes + "B" : bytes < 1048576 ? Math.round(bytes / 1024) + "KB" : (bytes / 1048576).toFixed(1) + "MB";
  }
  function _statusTabHTML() {
    const own = getOwnNumber();
    return `
    <div style="padding:12px;">

      <!-- N\xFAmero activo -->
      <div style="
        padding:10px 12px;border-radius:10px;
        background:rgba(255,255,255,.04);border:1px solid ${C.border};
        margin-bottom:8px;
      ">
        <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">
          N\xFAmero activo
        </div>
        <div style="font-size:18px;font-weight:800;color:${own ? C.accent : C.warn};">
          ${own ? "+" + own : "\u23F3 Detectando..."}
        </div>
        ${own ? `<div style="font-size:10px;color:${C.muted};margin-top:2px;">
          ${/* warmup info injected by caller */
    ""}
        </div>` : ""}
      </div>

      <!-- Spam risk indicator -->
      <div id="wspp-sidebar-spam-status" style="
        padding:10px 12px;border-radius:10px;
        background:rgba(255,255,255,.04);border:1px solid ${C.border};
        margin-bottom:8px;
      ">
        <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">
          Riesgo de spam
        </div>
        <div id="wspp-sidebar-risk-text" style="font-size:13px;font-weight:700;color:#34c759;">
          \u2705 Sin riesgo detectado
        </div>
      </div>

      <!-- Stats del d\xEDa -->
      <div style="
        display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;
      ">
        ${[
      { id: "stat-sent", label: "Enviados hoy", color: C.accent },
      { id: "stat-limit", label: "L\xEDmite hoy", color: "#60a5fa" },
      { id: "stat-valid", label: "Validados WA", color: "#34c759" },
      { id: "stat-pending", label: "Pendientes", color: C.warn }
    ].map((s) => `
          <div style="
            padding:10px;border-radius:8px;
            background:rgba(255,255,255,.04);border:1px solid ${C.border};
            text-align:center;
          ">
            <div id="wspp-${s.id}" style="font-size:20px;font-weight:800;color:${s.color};">\u2014</div>
            <div style="font-size:11px;color:${C.muted};margin-top:2px;text-transform:uppercase;">${s.label}</div>
          </div>
        `).join("")}
      </div>

      <!-- Alertas de spam recientes -->
      <div style="font-size:10px;color:${C.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
        Alertas recientes
      </div>
      <div id="wspp-sidebar-spam-alerts" style="
        display:flex;flex-direction:column;gap:3px;
      ">
        <div style="font-size:11px;color:${C.muted};padding:8px 0;">Sin alertas</div>
      </div>

    </div>
  `;
  }
  function _renderTabs() {
    const el = $(SIDEBAR_ID);
    if (!el) return;
    const tabBar = el.querySelector("[data-tab]")?.closest("div");
    if (tabBar) tabBar.outerHTML = _tabBarHTML();
  }
  function _renderContent() {
    const content = $("wspp-sidebar-content");
    if (content) {
      content.innerHTML = _contentHTML();
      _bindContentEvents();
    }
  }
  function _bindEvents() {
    $("wspp-sidebar-close")?.addEventListener("click", toggleSidebar);
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => _setTab(btn.dataset.tab));
    });
    $("wspp-sidebar-blast-btn")?.addEventListener("click", () => {
      toggleBlastPanel();
    });
    $("wspp-sidebar-val-btn")?.addEventListener("click", () => {
      toggleValidatorPanel();
    });
    $("wspp-sidebar-catalog-btn")?.addEventListener("click", () => {
      toggleCatalogPanel();
    });
    _bindContentEvents();
  }
  function _bindContentEvents() {
    document.querySelectorAll(".wspp-contact-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-action]")) return;
        const actions = row.querySelector(".wspp-contact-actions");
        if (!actions) return;
        const isOpen = actions.style.display === "flex";
        document.querySelectorAll(".wspp-contact-actions").forEach((a) => a.style.display = "none");
        actions.style.display = isOpen ? "none" : "flex";
      });
    });
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        const phone = btn.dataset.phone;
        const name = btn.dataset.name || "";
        if (action === "send") {
          window.postMessage({ type: "WSPP_OPEN_CHAT", phone }, WA_ORIGIN);
          return;
        }
        const voteMap = { duro: "duro", blando: "blando", flotante: "flotante", invalido: "" };
        const statusMap = { duro: "respondido", blando: "respondido", flotante: "respondido", invalido: "invalido" };
        window.postMessage({
          type: "WSPP_CLASSIFY",
          payload: {
            validation_id: id,
            vote_class: voteMap[action],
            status: statusMap[action],
            _phone: phone || null
          }
        }, WA_ORIGIN);
        const row = btn.closest(".wspp-contact-row");
        if (row) {
          row.style.opacity = "0.5";
          row.style.pointerEvents = "none";
        }
      });
    });
    document.querySelectorAll(".wspp-audio-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("[data-audio-send]") || e.target.closest("[data-audio-regen]")) return;
        const id = row.dataset.audioId;
        if (id) window.postMessage({ type: "GET_CATALOG_AUDIO", id }, WA_ORIGIN);
      });
    });
    document.querySelectorAll("[data-audio-send]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.postMessage({ type: "SIDEBAR_SEND_AUDIO_PTT", id: btn.dataset.audioSend }, WA_ORIGIN);
      });
    });
    document.querySelectorAll("[data-audio-regen]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.textContent = "\u23F3";
        btn.disabled = true;
        window.postMessage({ type: "GENERATE_CATALOG_AUDIO", id: btn.dataset.audioRegen }, WA_ORIGIN);
      });
    });
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-filter]").forEach((b) => {
          b.style.fontWeight = "600";
          b.style.opacity = "0.7";
          b.style.background = b.style.background.replace(/11$/, "11");
        });
        const f = btn.dataset.filter;
        if (_activeFilter === f) {
          _activeFilter = "";
        } else {
          _activeFilter = f;
          btn.style.fontWeight = "800";
          btn.style.opacity = "1";
        }
        _applyFilters();
      });
    });
    $("wspp-contacts-search")?.addEventListener("input", (e) => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        _searchQuery = (e.target.value || "").trim();
        _applyFilters();
      }, 200);
    });
  }
  function updateAudioList(items) {
    const list = $("wspp-audio-list");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:24px 0;color:${C.muted};font-size:12px;">Sin audios en el cat\xE1logo</div>`;
      return;
    }
    list.innerHTML = items.map(renderAudioRow).join("");
    const catFilter = $("wspp-audio-cat-filter");
    if (catFilter) {
      const cats = [...new Set(items.map((i) => i.category))].sort();
      catFilter.innerHTML = `
      <button data-audio-cat="all" style="
        padding:3px 10px;border-radius:12px;border:1px solid ${C.accent}55;
        background:${C.accentDim};color:${C.accent};
        font-size:10px;cursor:pointer;white-space:nowrap;font-weight:700;
      ">Todos</button>
      ${cats.map((c) => `
        <button data-audio-cat="${c}" style="
          padding:3px 10px;border-radius:12px;
          border:1px solid ${C.border};background:rgba(255,255,255,.04);color:${C.muted};
          font-size:10px;cursor:pointer;white-space:nowrap;
        ">${c}</button>
      `).join("")}
    `;
      catFilter.querySelectorAll("[data-audio-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const cat = btn.dataset.audioCat;
          const filtered = cat === "all" ? items : items.filter((i) => i.category === cat);
          const list2 = $("wspp-audio-list");
          if (list2) {
            list2.innerHTML = filtered.map(renderAudioRow).join("");
            _bindContentEvents();
          }
        });
      });
    }
    _bindContentEvents();
  }

  // src/inject-entry.js
  if (document.readyState === "complete") {
    setTimeout(tryInstallWAListeners, 5e3);
  } else {
    window.addEventListener("load", () => setTimeout(tryInstallWAListeners, 5e3));
  }
  var tryInsertFAB = () => {
    if (document.body) insertSidebarFAB();
    else setTimeout(tryInsertFAB, 1e3);
  };
  setTimeout(tryInsertFAB, 3500);
})();
