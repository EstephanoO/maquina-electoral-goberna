(() => {
  // src/inject/bootstrap.js
  var WA_ORIGIN = "https://web.whatsapp.com";
  var _ownNumber = null;
  var _catalogIsConsultor = false;
  var _userRole = "agente_digital";
  function getOwnNumber() {
    return _ownNumber;
  }
  function isCatalogConsultor() {
    return _catalogIsConsultor;
  }
  function isConsultorLevel() {
    return ["admin", "consultor", "candidato"].includes(_userRole);
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
      _userRole = role;
      _catalogIsConsultor = ["admin", "consultor"].includes(role) || audioAdmin;
      console.log("[WSPP] user_role actualizado:", role, "| audio_admin:", audioAdmin, "| catalogCRUD:", _catalogIsConsultor, "| consultorLevel:", isConsultorLevel());
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
  function cachePhone(jid, phone2) {
    if (!jid || !phone2) return;
    if (_jidPhoneCache.size >= JID_CACHE_MAX) {
      const first = _jidPhoneCache.keys().next().value;
      _jidPhoneCache.delete(first);
    }
    _jidPhoneCache.set(jid, phone2);
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
  function emitSent(phone2) {
    const now = Date.now();
    if (now - _lastEmit < 300) return;
    _lastEmit = now;
    const own = getOwnNumber2();
    const name = getActiveContactName();
    window.postMessage({
      type: "WSPP_SENT",
      payload: {
        phone: phone2,
        // null si no se pudo resolver — el backend lo ignorará
        contact_name: name,
        own_number: own,
        timestamp: Math.floor(Date.now() / 1e3)
      }
    }, WA_ORIGIN);
    console.log("[WSPP] \u2713 enviado \u2192 phone:", phone2 ?? "(sin tel\xE9fono)", "| nombre:", name ?? "-", "| celular:", own ?? "NULL");
  }
  document.addEventListener("click", (e) => {
    if (!isSendButton(e.target)) return;
    const phone2 = getActivePhone();
    console.log("[WSPP] \u2713 Send click | phone:", phone2 ?? "(sin tel\xE9fono)");
    emitSent(phone2);
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
    const phone2 = getActivePhone();
    console.log("[WSPP] \u2713 Send Enter | phone:", phone2 ?? "(sin tel\xE9fono)");
    emitSent(phone2);
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
        const arrow = document.createElement("span");
        arrow.style.cssText = `color:${accentColor};flex-shrink:0;`;
        arrow.textContent = "\u2192";
        line.appendChild(arrow);
        line.appendChild(document.createTextNode(" " + a));
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
    for (const cfg2 of btnConfigs) {
      const btn = el("button", { background: cfg2.bg, color: cfg2.color, border: "1px solid " + cfg2.border, borderRadius: "6px", padding: "4px 10px", fontSize: "10px", fontWeight: "700", cursor: "pointer" }, cfg2.label);
      btn.className = "wspp-classify-btn";
      btn.setAttribute("data-vote", cfg2.vote);
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
        const jid = msg.get?.("from")?._serialized || msg.get?.("to")?._serialized;
        if (!jid || jid.includes("@g.us") || jid.includes("@broadcast")) return;
        try {
          const isFromMe = !!msg.get("id")?.fromMe;
          if (isFromMe) {
            const to = msg.get("to")?._serialized;
            if (!to || typeof to !== "string") return;
            if (to.includes("@g.us") || to.includes("@broadcast") || to.includes("@newsletter")) return;
            let phone3 = jidToNumber(to);
            if (!phone3 && to.includes("@lid")) {
              phone3 = resolvePhoneFromLid(to);
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
                phone: phone3,
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
          let phone2 = jidToNumber(from);
          const body = msg.get("body") || "";
          const msgType = msg.get("type") || "chat";
          const timestamp = msg.get("t") || Math.floor(Date.now() / 1e3);
          if (!phone2 && from.includes("@lid")) {
            phone2 = resolvePhoneFromLid(from);
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
              phone: phone2,
              contact_name: contactName,
              from_jid: from,
              preview: body.substring(0, 500),
              msg_type: msgType,
              own_number: getOwnNumber2(),
              timestamp
            }
          }, WA_ORIGIN);
          console.log("[WSPP] \u2190 recibido de:", phone2 ?? from, "| tipo:", msgType, "| preview:", body.substring(0, 60));
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
      let handleActiveChatChange = function(changedModel) {
        try {
          const active = changedModel?.active === true ? changedModel : ChatCollection._models.find((c) => c.active);
          if (!active) return;
          const jid = active.id?._serialized;
          if (!jid || jid === _lastActiveChatJid) return;
          _lastActiveChatJid = jid;
          if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@newsletter")) return;
          let phone2 = jidToNumber(jid);
          if (!phone2 && jid.includes("@lid")) {
            phone2 = resolvePhoneFromLid(jid);
          }
          const name = active.name || active.formattedTitle || active.pushname || null;
          window.postMessage({
            type: "WSPP_CHAT_OPENED",
            payload: {
              phone: phone2,
              contact_name: name,
              jid
            }
          }, WA_ORIGIN);
          console.log("[WSPP] Chat abierto:", phone2 ?? jid, "| nombre:", name ?? "-");
        } catch (err) {
          console.warn("[WSPP] chat change error:", err?.message);
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
          eventDriven = true;
          console.log("[WSPP] \u2713 Chat watcher instalado (event-driven: change:active)");
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
    // Envío de mensajes
    "WAWebSendMsgChatAction",
    // addAndSendMsgToChat
    "WAWebWidFactory",
    // createWid, @lid resolution
    "WAWebFindChatAction",
    // findOrCreateLatestChat
    "WAWebUserPrefsMeUser",
    // getMeUser — identidad propia
    "WAWebMsgKey",
    // newId — IDs de mensajes
    // Validación de números (verificado 2026-03-17)
    "WAWebUsync",
    // USyncQuery — check si número tiene WA
    "WAWebUsyncUser",
    // USyncUser — builder de query
    // Typing indicators
    "WAWebChatStateBridge",
    // sendChatStateComposing/Recording/Paused
    // PTT pipeline
    "WAWebMediaOpaqueData",
    // createFromData
    "WAWebPrepRawMedia",
    // prepRawMedia
    "WAWebMediaMmsV4Upload",
    // uploadMedia
    "WAWebMediaStorage",
    // getOrCreateMediaObject
    "WAWebMmsMediaTypes",
    // msgToMediaType
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
    let phone2 = null;
    try {
      const mod = window.require("WAWebUserPrefsMeUser");
      const me = mod?.getMeUser?.() || mod?.getMaybeMeUser?.();
      if (me) {
        const raw = me.user || me._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone2 = digits;
      }
    } catch (_) {
    }
    if (!phone2) try {
      const wid = window.require("WAWebWidFactory");
      const me = wid?.getMeWid?.() || wid?.getCurrentWid?.();
      if (me) {
        const raw = me.user || me._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone2 = digits;
      }
    } catch (_) {
    }
    if (!phone2) try {
      const { Conn } = window.require("WAWebConnModel");
      const wid = Conn?.wid || Conn?.ref;
      if (wid) {
        const raw = typeof wid === "string" ? wid : wid.user || wid._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone2 = digits;
      }
    } catch (_) {
    }
    if (!phone2) try {
      const store = window.Store;
      if (store?.Conn?.wid) {
        const raw = store.Conn.wid.user || store.Conn.wid._serialized || "";
        const digits = raw.replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone2 = digits;
      }
    } catch (_) {
    }
    if (!phone2) try {
      const waMe = localStorage.getItem("last-wid-md") || localStorage.getItem("last-wid");
      if (waMe) {
        const digits = waMe.replace(/@.+$/, "").replace(/\D/g, "");
        if (digits.length >= 9 && digits.length <= 15) phone2 = digits;
      }
    } catch (_) {
    }
    if (!phone2) return;
    setOwnNumber(phone2);
    console.log(
      "%c[WSPP] own_number auto-detectado: +" + phone2,
      "color:#34c759;font-weight:700;font-size:13px"
    );
    window.postMessage({
      type: "WSPP_OWN_NUMBER_DETECTED",
      number: phone2
    }, WA_ORIGIN);
  }
  async function openChatByPhone(phone2) {
    if (!phone2 || typeof phone2 !== "string") {
      return { ok: false, error: "No phone provided" };
    }
    const digits = phone2.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      return { ok: false, error: "Invalid phone: " + phone2 };
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
    const phone2 = e.data.phone;
    const result = await openChatByPhone(phone2);
    window.postMessage({
      type: "WSPP_OPEN_CHAT_RESULT",
      ok: result.ok,
      error: result.error || null,
      phone: phone2
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
    #wspp-cat-panel{position:fixed;top:120px;right:12px;z-index:99999;
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
    .wc-drag-handle{cursor:grab;display:flex;align-items:center;justify-content:center;padding:4px;border-radius:4px;flex-shrink:0}
    .wc-drag-handle:active{cursor:grabbing}
    .wc-drag-handle svg{width:16px;height:16px;color:#444}
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
  function _makeDraggable(panel) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    panel.addEventListener("mousedown", (e) => {
      const handle = e.target.closest(".wc-drag-handle");
      if (!handle) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.transition = "none";
      handle.style.cursor = "grabbing";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = initialLeft + dx + "px";
      panel.style.top = initialTop + dy + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      const handle = panel.querySelector(".wc-drag-handle");
      if (handle) handle.style.cursor = "grab";
    });
  }
  function _iconBtn(svg, color, title, onClick) {
    const b = _el("button", { color: color || "#8696a0", width: "24px", height: "24px", borderRadius: "6px", flexShrink: "0" }, { cls: "wc-ibtn", html: svg, title: title || "" });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
    return b;
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
    const panel = document.getElementById("wspp-cat-panel");
    if (!panel) return;
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
    const dragHandle = _el("div", { cursor: "grab" }, { cls: "wc-drag-handle", html: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>' });
    dragHandle.title = "Arrastrar para mover";
    h.appendChild(dragHandle);
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
      const oldUrl = _previewAudio.src;
      _previewAudio.pause();
      _previewAudio.src = "";
      if (oldUrl && oldUrl.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
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
        if (!_previewRAF) _previewRAF = requestAnimationFrame(_updateProgress);
      }
      playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
    });
    bar.appendChild(playBtn);
    const info = _el("div", {}, { cls: "wc-preview-info" });
    info.appendChild(_el("div", {}, { cls: "wc-preview-name", txt: _previewData.label || "Audio" }));
    const track = _el("div", {}, { cls: "wc-preview-track" });
    const fill2 = _el("div", { width: "0%" }, { cls: "wc-preview-fill" });
    track.appendChild(fill2);
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
    let _lastPlayingState = null;
    function _updateProgress() {
      if (!_previewAudio || !_previewData) {
        _previewRAF = null;
        return;
      }
      const pct = _previewAudio.duration ? _previewAudio.currentTime / _previewAudio.duration * 100 : 0;
      fill2.style.width = pct + "%";
      timeEl.textContent = `${_fmtTime(_previewAudio.currentTime)} / ${_fmtTime(_previewAudio.duration)}`;
      if (_lastPlayingState !== _previewPlaying) {
        playBtn.innerHTML = _previewPlaying ? I.pause : I.play;
        _lastPlayingState = _previewPlaying;
      }
      if (!_previewPlaying) {
        _previewRAF = null;
        return;
      }
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
        _previewAudio.play().then(() => {
          _previewPlaying = true;
          if (_catalogPanelOpen) renderCatalogPanel();
        }).catch(() => {
          _previewPlaying = false;
        });
        return;
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
      ctx.close().catch(() => {
      });
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
      const mediaData = await mediaPrep.waitForPrep();
      L("4 \u2713 mediaData ready");
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
      let pttBlob = mediaData.mediaBlob ?? mediaData.get?.("mediaBlob");
      const hasUrlMethod = pttBlob && typeof pttBlob.url === "function";
      if (!hasUrlMethod) {
        L("8 \u26A0 mediaBlob has no .url() (is", pttBlob?.constructor?.name || typeof pttBlob, ") \u2014 replacing with opaqueData");
        pttBlob = opaqueData;
        if (typeof mediaData.set === "function") {
          try {
            mediaData.set({ mediaBlob: opaqueData });
          } catch (_) {
          }
        } else {
          mediaData.mediaBlob = opaqueData;
        }
      }
      try {
        if (pttBlob && typeof pttBlob.url === "function") {
          mediaData.renderableUrl = pttBlob.url();
        }
      } catch (_) {
      }
      L("8 \u2713 renderableUrl set");
      try {
        mediaObject.consolidate(mediaData.toJSON ? mediaData.toJSON() : { ...mediaData });
        L("8b \u2713 consolidated (with mediaBlob)");
      } catch (err) {
        try {
          const mdClean = mediaData.toJSON ? mediaData.toJSON() : { ...mediaData };
          delete mdClean.mediaBlob;
          mediaObject.consolidate(mdClean);
          L("8b \u2713 consolidated (without mediaBlob, fallback)");
        } catch (err2) {
          L("8b \u26A0 consolidate failed (non-fatal):", err2.message);
        }
      }
      if (pttBlob) {
        try {
          mediaObject.mediaBlob = pttBlob;
          L("9-pre \u2713 mediaBlob set on mediaObject");
        } catch (_) {
        }
      }
      const hasMB = typeof mediaData.get === "function" ? mediaData.get("mediaBlob") : mediaData.mediaBlob;
      if (!hasMB && pttBlob) {
        if (typeof mediaData.set === "function") {
          try {
            mediaData.set({ mediaBlob: pttBlob });
          } catch (_) {
          }
        } else {
          mediaData.mediaBlob = pttBlob;
        }
        L("9-pre \u2713 mediaBlob restored on mediaData");
      } else {
        L("9-pre \u2713 mediaBlob already on mediaData");
      }
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
      const uploadFn = uploadMod.uploadMedia ?? uploadMod.encryptAndUploadMedia ?? uploadMod.default?.uploadMedia ?? uploadMod.default?.encryptAndUploadMedia ?? uploadMod.default?.encryptAndUpload;
      if (!uploadFn) throw new Error(`No uploadMedia fn in ${uploadModName}`);
      L("9b uploadFn found", typeof uploadFn, `length=${uploadFn.length}`);
      const uploadArgs = { chat, mediaData, mediaObject, mediaType, mimetype: mime };
      L(
        "9c calling uploadFn with",
        Object.keys(uploadArgs).join(", "),
        "mediaData.mediaBlob?",
        !!(typeof mediaData.get === "function" ? mediaData.get("mediaBlob") : mediaData.mediaBlob),
        "mediaData.mediaBlob.url?",
        typeof (typeof mediaData.get === "function" ? mediaData.get("mediaBlob") : mediaData.mediaBlob)?.url
      );
      const uploaded = await uploadFn(uploadArgs);
      L("9d uploaded raw", JSON.stringify(uploaded)?.slice(0, 300));
      let me = uploaded?.mediaEntry ?? uploaded;
      if (Array.isArray(me)) me = me[0];
      if (me?.kind === "error") {
        const mdDp = mediaData.directPath ?? mediaData.get?.("directPath");
        if (!mdDp) throw new Error(`Upload returned error. Check WA module logs.`);
        L("9e \u2713 directPath from mediaData side-effect");
        me = mediaData.toJSON ? mediaData.toJSON() : { ...mediaData };
      }
      L("9e mediaEntry", JSON.stringify(me)?.slice(0, 300));
      if (!me?.directPath) throw new Error(`No directPath in upload result: ${JSON.stringify(me)?.slice(0, 200)}`);
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
    const existing = document.getElementById("wspp-cat-panel");
    if (existing) {
      _closePanel();
      return;
    }
    _catalogPanelOpen = true;
    if (_catalogItems.length === 0 && !_catalogLoading) {
      _catalogLoading = true;
      window.postMessage({ type: "FETCH_AUDIO_CATALOG" }, WA_ORIGIN);
    }
    if (_catalogCategories.length === 0 && !_catalogCategoriesLoading) {
      _catalogCategoriesLoading = true;
      window.postMessage({ type: "FETCH_CATALOG_CATEGORIES" }, WA_ORIGIN);
    }
    _injectStyles();
    const panel = _el("div");
    panel.id = "wspp-cat-panel";
    Object.assign(panel.style, { position: "fixed", top: "120px", right: "12px", zIndex: "99999" });
    document.body.appendChild(panel);
    _makeDraggable(panel);
    renderCatalogPanel();
  }

  // src/inject/template-analyzer.js
  var SPAM_WORDS = [
    "oferta",
    "descuento",
    "gratis",
    "sorteo",
    "premio",
    "click aqu\xED",
    "haz click",
    "compra ya"
  ];
  function _levenshteinNorm(a, b) {
    if (!a.length || !b.length) return 1;
    const maxLen = Math.max(a.length, b.length);
    const matrix = [];
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
      for (let j = 1; j <= b.length; j++) {
        if (i === 0) {
          matrix[i][j] = j;
          continue;
        }
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
        );
      }
    }
    return 1 - matrix[a.length][b.length] / maxLen;
  }
  function _stripSpintax(tpl) {
    return tpl.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split("|")[0]).trim();
  }
  function _countEmojis(text) {
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;
    const matches = text.match(emojiRegex);
    return matches ? matches.length : 0;
  }
  function _minSpintaxOptions(tpl) {
    const matches = tpl.match(/\[([^\]]+)\]/g);
    if (!matches || !matches.length) return 0;
    return Math.min(...matches.map((m) => m.slice(1, -1).split("|").length));
  }
  function _analyzeOneTemplate(tpl) {
    const stripped = _stripSpintax(tpl);
    const signals = [];
    let score = 0;
    if (/https?:\/\/|www\.|\.com\b|\.pe\b|bit\.ly|goo\.gl/i.test(stripped)) {
      score += 15;
      signals.push({ points: 15, signal: "Contiene link", suggestion: "Si es largo, consider\xE1 quitarlo" });
    }
    const emojiCount = _countEmojis(stripped);
    if (emojiCount > 5) {
      score += 5;
      signals.push({ points: 5, signal: `${emojiCount} emojis (>5)`, suggestion: "Consider\xE1 reducir a 3-4 emojis" });
    }
    const fullText = stripped.replace(/\n---\n/g, " ");
    if (fullText.length > 500) {
      score += 5;
      signals.push({ points: 5, signal: `Texto largo (${fullText.length} chars)`, suggestion: "Consider\xE1 hacerlo m\xE1s conciso" });
    }
    if (!/\{\{nombre\}\}/i.test(tpl)) {
      score += 10;
      signals.push({ points: 10, signal: "Sin {{nombre}}", suggestion: "Agregar {{nombre}} mejora personalizaci\xF3n" });
    }
    const minOpts = _minSpintaxOptions(tpl);
    const spintaxGroups = (tpl.match(/\[([^\]]+)\]/g) || []).length;
    if (spintaxGroups > 0 && minOpts < 3) {
      score += 5;
      signals.push({ points: 5, signal: `Spintax con pocas opciones`, suggestion: "Idealmente 3+ opciones por grupo" });
    }
    const lowerText = stripped.toLowerCase();
    const foundSpam = SPAM_WORDS.filter((w) => lowerText.includes(w));
    if (foundSpam.length) {
      score += 10;
      signals.push({ points: 10, signal: `Spam: ${foundSpam.join(", ")}`, suggestion: "Palabras comerciales que WA puede marcar" });
    }
    if (/\b\d{9,}\b/.test(stripped.replace(/\{\{[^}]+\}\}/g, ""))) {
      score += 5;
      signals.push({ points: 5, signal: "Contiene n\xFAmero de tel\xE9fono", suggestion: "N\xFAmero de tel\xE9fono puede activar filtros" });
    }
    return { score, signals };
  }
  function analyzeTemplates(templates) {
    if (!templates || !templates.length) {
      return { score: 0, level: "ok", signals: [], suggestions: [] };
    }
    const analyses = templates.map((t) => _analyzeOneTemplate(t));
    let maxScore = Math.max(...analyses.map((a) => a.score));
    const allSignals = analyses.flatMap((a) => a.signals);
    if (templates.length > 1) {
      const stripped = templates.map(_stripSpintax);
      let maxSimilarity = 0;
      for (let i = 0; i < stripped.length; i++) {
        for (let j = i + 1; j < stripped.length; j++) {
          const sim = _levenshteinNorm(stripped[i], stripped[j]);
          maxSimilarity = Math.max(maxSimilarity, sim);
        }
      }
      if (maxSimilarity > 0.85) {
        maxScore += 5;
        allSignals.push({ points: 5, signal: `Plantillas similares (${Math.round(maxSimilarity * 100)}%)`, suggestion: "Vari\xE1 estructura o tono entre plantillas" });
      }
    }
    const seenSuggestions = /* @__PURE__ */ new Set();
    const suggestions = [];
    for (const s of allSignals) {
      if (!seenSuggestions.has(s.suggestion)) {
        seenSuggestions.add(s.suggestion);
        suggestions.push(s);
      }
    }
    let level = "ok";
    if (maxScore > 90) level = "danger";
    else if (maxScore > 60) level = "warning";
    return {
      score: maxScore,
      level,
      signals: allSignals,
      suggestions,
      perTemplate: analyses
    };
  }

  // node_modules/xlsx/xlsx.mjs
  var XLSX = {};
  XLSX.version = "0.18.5";
  var current_codepage = 1200;
  var current_ansi = 1252;
  var VALID_ANSI = [874, 932, 936, 949, 950, 1250, 1251, 1252, 1253, 1254, 1255, 1256, 1257, 1258, 1e4];
  var CS2CP = {
    /*::[*/
    0: 1252,
    /* ANSI */
    /*::[*/
    1: 65001,
    /* DEFAULT */
    /*::[*/
    2: 65001,
    /* SYMBOL */
    /*::[*/
    77: 1e4,
    /* MAC */
    /*::[*/
    128: 932,
    /* SHIFTJIS */
    /*::[*/
    129: 949,
    /* HANGUL */
    /*::[*/
    130: 1361,
    /* JOHAB */
    /*::[*/
    134: 936,
    /* GB2312 */
    /*::[*/
    136: 950,
    /* CHINESEBIG5 */
    /*::[*/
    161: 1253,
    /* GREEK */
    /*::[*/
    162: 1254,
    /* TURKISH */
    /*::[*/
    163: 1258,
    /* VIETNAMESE */
    /*::[*/
    177: 1255,
    /* HEBREW */
    /*::[*/
    178: 1256,
    /* ARABIC */
    /*::[*/
    186: 1257,
    /* BALTIC */
    /*::[*/
    204: 1251,
    /* RUSSIAN */
    /*::[*/
    222: 874,
    /* THAI */
    /*::[*/
    238: 1250,
    /* EASTEUROPE */
    /*::[*/
    255: 1252,
    /* OEM */
    /*::[*/
    69: 6969
    /* MISC */
  };
  var set_ansi = function(cp) {
    if (VALID_ANSI.indexOf(cp) == -1) return;
    current_ansi = CS2CP[0] = cp;
  };
  function reset_ansi() {
    set_ansi(1252);
  }
  var set_cp = function(cp) {
    current_codepage = cp;
    set_ansi(cp);
  };
  function reset_cp() {
    set_cp(1200);
    reset_ansi();
  }
  function char_codes(data) {
    var o = [];
    for (var i = 0, len = data.length; i < len; ++i) o[i] = data.charCodeAt(i);
    return o;
  }
  function utf16leread(data) {
    var o = [];
    for (var i = 0; i < data.length >> 1; ++i) o[i] = String.fromCharCode(data.charCodeAt(2 * i) + (data.charCodeAt(2 * i + 1) << 8));
    return o.join("");
  }
  function utf16beread(data) {
    var o = [];
    for (var i = 0; i < data.length >> 1; ++i) o[i] = String.fromCharCode(data.charCodeAt(2 * i + 1) + (data.charCodeAt(2 * i) << 8));
    return o.join("");
  }
  var debom = function(data) {
    var c1 = data.charCodeAt(0), c2 = data.charCodeAt(1);
    if (c1 == 255 && c2 == 254) return utf16leread(data.slice(2));
    if (c1 == 254 && c2 == 255) return utf16beread(data.slice(2));
    if (c1 == 65279) return data.slice(1);
    return data;
  };
  var _getchar = function _gc1(x) {
    return String.fromCharCode(x);
  };
  var _getansi = function _ga1(x) {
    return String.fromCharCode(x);
  };
  var $cptable;
  var DENSE = null;
  var DIF_XL = true;
  var Base64_map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  function Base64_encode(input) {
    var o = "";
    var c1 = 0, c2 = 0, c3 = 0, e1 = 0, e2 = 0, e3 = 0, e4 = 0;
    for (var i = 0; i < input.length; ) {
      c1 = input.charCodeAt(i++);
      e1 = c1 >> 2;
      c2 = input.charCodeAt(i++);
      e2 = (c1 & 3) << 4 | c2 >> 4;
      c3 = input.charCodeAt(i++);
      e3 = (c2 & 15) << 2 | c3 >> 6;
      e4 = c3 & 63;
      if (isNaN(c2)) {
        e3 = e4 = 64;
      } else if (isNaN(c3)) {
        e4 = 64;
      }
      o += Base64_map.charAt(e1) + Base64_map.charAt(e2) + Base64_map.charAt(e3) + Base64_map.charAt(e4);
    }
    return o;
  }
  function Base64_decode(input) {
    var o = "";
    var c1 = 0, c2 = 0, c3 = 0, e1 = 0, e2 = 0, e3 = 0, e4 = 0;
    input = input.replace(/[^\w\+\/\=]/g, "");
    for (var i = 0; i < input.length; ) {
      e1 = Base64_map.indexOf(input.charAt(i++));
      e2 = Base64_map.indexOf(input.charAt(i++));
      c1 = e1 << 2 | e2 >> 4;
      o += String.fromCharCode(c1);
      e3 = Base64_map.indexOf(input.charAt(i++));
      c2 = (e2 & 15) << 4 | e3 >> 2;
      if (e3 !== 64) {
        o += String.fromCharCode(c2);
      }
      e4 = Base64_map.indexOf(input.charAt(i++));
      c3 = (e3 & 3) << 6 | e4;
      if (e4 !== 64) {
        o += String.fromCharCode(c3);
      }
    }
    return o;
  }
  var has_buf = /* @__PURE__ */ function() {
    return typeof Buffer !== "undefined" && typeof process !== "undefined" && typeof process.versions !== "undefined" && !!process.versions.node;
  }();
  var Buffer_from = /* @__PURE__ */ function() {
    if (typeof Buffer !== "undefined") {
      var nbfs = !Buffer.from;
      if (!nbfs) try {
        Buffer.from("foo", "utf8");
      } catch (e) {
        nbfs = true;
      }
      return nbfs ? function(buf, enc) {
        return enc ? new Buffer(buf, enc) : new Buffer(buf);
      } : Buffer.from.bind(Buffer);
    }
    return function() {
    };
  }();
  function new_raw_buf(len) {
    if (has_buf) return Buffer.alloc ? Buffer.alloc(len) : new Buffer(len);
    return typeof Uint8Array != "undefined" ? new Uint8Array(len) : new Array(len);
  }
  function new_unsafe_buf(len) {
    if (has_buf) return Buffer.allocUnsafe ? Buffer.allocUnsafe(len) : new Buffer(len);
    return typeof Uint8Array != "undefined" ? new Uint8Array(len) : new Array(len);
  }
  var s2a = function s2a2(s) {
    if (has_buf) return Buffer_from(s, "binary");
    return s.split("").map(function(x) {
      return x.charCodeAt(0) & 255;
    });
  };
  function a2s(data) {
    if (Array.isArray(data)) return data.map(function(c) {
      return String.fromCharCode(c);
    }).join("");
    var o = [];
    for (var i = 0; i < data.length; ++i) o[i] = String.fromCharCode(data[i]);
    return o.join("");
  }
  function ab2a(data) {
    if (typeof ArrayBuffer == "undefined") throw new Error("Unsupported");
    if (data instanceof ArrayBuffer) return ab2a(new Uint8Array(data));
    var o = new Array(data.length);
    for (var i = 0; i < data.length; ++i) o[i] = data[i];
    return o;
  }
  var bconcat = has_buf ? function(bufs) {
    return Buffer.concat(bufs.map(function(buf) {
      return Buffer.isBuffer(buf) ? buf : Buffer_from(buf);
    }));
  } : function(bufs) {
    if (typeof Uint8Array !== "undefined") {
      var i = 0, maxlen = 0;
      for (i = 0; i < bufs.length; ++i) maxlen += bufs[i].length;
      var o = new Uint8Array(maxlen);
      var len = 0;
      for (i = 0, maxlen = 0; i < bufs.length; maxlen += len, ++i) {
        len = bufs[i].length;
        if (bufs[i] instanceof Uint8Array) o.set(bufs[i], maxlen);
        else if (typeof bufs[i] == "string") {
          throw "wtf";
        } else o.set(new Uint8Array(bufs[i]), maxlen);
      }
      return o;
    }
    return [].concat.apply([], bufs.map(function(buf) {
      return Array.isArray(buf) ? buf : [].slice.call(buf);
    }));
  };
  function utf8decode(content) {
    var out = [], widx = 0, L = content.length + 250;
    var o = new_raw_buf(content.length + 255);
    for (var ridx = 0; ridx < content.length; ++ridx) {
      var c = content.charCodeAt(ridx);
      if (c < 128) o[widx++] = c;
      else if (c < 2048) {
        o[widx++] = 192 | c >> 6 & 31;
        o[widx++] = 128 | c & 63;
      } else if (c >= 55296 && c < 57344) {
        c = (c & 1023) + 64;
        var d = content.charCodeAt(++ridx) & 1023;
        o[widx++] = 240 | c >> 8 & 7;
        o[widx++] = 128 | c >> 2 & 63;
        o[widx++] = 128 | d >> 6 & 15 | (c & 3) << 4;
        o[widx++] = 128 | d & 63;
      } else {
        o[widx++] = 224 | c >> 12 & 15;
        o[widx++] = 128 | c >> 6 & 63;
        o[widx++] = 128 | c & 63;
      }
      if (widx > L) {
        out.push(o.slice(0, widx));
        widx = 0;
        o = new_raw_buf(65535);
        L = 65530;
      }
    }
    out.push(o.slice(0, widx));
    return bconcat(out);
  }
  var chr0 = /\u0000/g;
  var chr1 = /[\u0001-\u0006]/g;
  function _strrev(x) {
    var o = "", i = x.length - 1;
    while (i >= 0) o += x.charAt(i--);
    return o;
  }
  function pad0(v, d) {
    var t = "" + v;
    return t.length >= d ? t : fill("0", d - t.length) + t;
  }
  function pad_(v, d) {
    var t = "" + v;
    return t.length >= d ? t : fill(" ", d - t.length) + t;
  }
  function rpad_(v, d) {
    var t = "" + v;
    return t.length >= d ? t : t + fill(" ", d - t.length);
  }
  function pad0r1(v, d) {
    var t = "" + Math.round(v);
    return t.length >= d ? t : fill("0", d - t.length) + t;
  }
  function pad0r2(v, d) {
    var t = "" + v;
    return t.length >= d ? t : fill("0", d - t.length) + t;
  }
  var p2_32 = /* @__PURE__ */ Math.pow(2, 32);
  function pad0r(v, d) {
    if (v > p2_32 || v < -p2_32) return pad0r1(v, d);
    var i = Math.round(v);
    return pad0r2(i, d);
  }
  function SSF_isgeneral(s, i) {
    i = i || 0;
    return s.length >= 7 + i && (s.charCodeAt(i) | 32) === 103 && (s.charCodeAt(i + 1) | 32) === 101 && (s.charCodeAt(i + 2) | 32) === 110 && (s.charCodeAt(i + 3) | 32) === 101 && (s.charCodeAt(i + 4) | 32) === 114 && (s.charCodeAt(i + 5) | 32) === 97 && (s.charCodeAt(i + 6) | 32) === 108;
  }
  var days = [
    ["Sun", "Sunday"],
    ["Mon", "Monday"],
    ["Tue", "Tuesday"],
    ["Wed", "Wednesday"],
    ["Thu", "Thursday"],
    ["Fri", "Friday"],
    ["Sat", "Saturday"]
  ];
  var months = [
    ["J", "Jan", "January"],
    ["F", "Feb", "February"],
    ["M", "Mar", "March"],
    ["A", "Apr", "April"],
    ["M", "May", "May"],
    ["J", "Jun", "June"],
    ["J", "Jul", "July"],
    ["A", "Aug", "August"],
    ["S", "Sep", "September"],
    ["O", "Oct", "October"],
    ["N", "Nov", "November"],
    ["D", "Dec", "December"]
  ];
  function SSF_init_table(t) {
    if (!t) t = {};
    t[0] = "General";
    t[1] = "0";
    t[2] = "0.00";
    t[3] = "#,##0";
    t[4] = "#,##0.00";
    t[9] = "0%";
    t[10] = "0.00%";
    t[11] = "0.00E+00";
    t[12] = "# ?/?";
    t[13] = "# ??/??";
    t[14] = "m/d/yy";
    t[15] = "d-mmm-yy";
    t[16] = "d-mmm";
    t[17] = "mmm-yy";
    t[18] = "h:mm AM/PM";
    t[19] = "h:mm:ss AM/PM";
    t[20] = "h:mm";
    t[21] = "h:mm:ss";
    t[22] = "m/d/yy h:mm";
    t[37] = "#,##0 ;(#,##0)";
    t[38] = "#,##0 ;[Red](#,##0)";
    t[39] = "#,##0.00;(#,##0.00)";
    t[40] = "#,##0.00;[Red](#,##0.00)";
    t[45] = "mm:ss";
    t[46] = "[h]:mm:ss";
    t[47] = "mmss.0";
    t[48] = "##0.0E+0";
    t[49] = "@";
    t[56] = '"\u4E0A\u5348/\u4E0B\u5348 "hh"\u6642"mm"\u5206"ss"\u79D2 "';
    return t;
  }
  var table_fmt = {
    0: "General",
    1: "0",
    2: "0.00",
    3: "#,##0",
    4: "#,##0.00",
    9: "0%",
    10: "0.00%",
    11: "0.00E+00",
    12: "# ?/?",
    13: "# ??/??",
    14: "m/d/yy",
    15: "d-mmm-yy",
    16: "d-mmm",
    17: "mmm-yy",
    18: "h:mm AM/PM",
    19: "h:mm:ss AM/PM",
    20: "h:mm",
    21: "h:mm:ss",
    22: "m/d/yy h:mm",
    37: "#,##0 ;(#,##0)",
    38: "#,##0 ;[Red](#,##0)",
    39: "#,##0.00;(#,##0.00)",
    40: "#,##0.00;[Red](#,##0.00)",
    45: "mm:ss",
    46: "[h]:mm:ss",
    47: "mmss.0",
    48: "##0.0E+0",
    49: "@",
    56: '"\u4E0A\u5348/\u4E0B\u5348 "hh"\u6642"mm"\u5206"ss"\u79D2 "'
  };
  var SSF_default_map = {
    5: 37,
    6: 38,
    7: 39,
    8: 40,
    //  5 -> 37 ...  8 -> 40
    23: 0,
    24: 0,
    25: 0,
    26: 0,
    // 23 ->  0 ... 26 ->  0
    27: 14,
    28: 14,
    29: 14,
    30: 14,
    31: 14,
    // 27 -> 14 ... 31 -> 14
    50: 14,
    51: 14,
    52: 14,
    53: 14,
    54: 14,
    // 50 -> 14 ... 58 -> 14
    55: 14,
    56: 14,
    57: 14,
    58: 14,
    59: 1,
    60: 2,
    61: 3,
    62: 4,
    // 59 ->  1 ... 62 ->  4
    67: 9,
    68: 10,
    // 67 ->  9 ... 68 -> 10
    69: 12,
    70: 13,
    71: 14,
    // 69 -> 12 ... 71 -> 14
    72: 14,
    73: 15,
    74: 16,
    75: 17,
    // 72 -> 14 ... 75 -> 17
    76: 20,
    77: 21,
    78: 22,
    // 76 -> 20 ... 78 -> 22
    79: 45,
    80: 46,
    81: 47,
    // 79 -> 45 ... 81 -> 47
    82: 0
    // 82 ->  0 ... 65536 -> 0 (omitted)
  };
  var SSF_default_str = {
    //  5 -- Currency,   0 decimal, black negative
    5: '"$"#,##0_);\\("$"#,##0\\)',
    63: '"$"#,##0_);\\("$"#,##0\\)',
    //  6 -- Currency,   0 decimal, red   negative
    6: '"$"#,##0_);[Red]\\("$"#,##0\\)',
    64: '"$"#,##0_);[Red]\\("$"#,##0\\)',
    //  7 -- Currency,   2 decimal, black negative
    7: '"$"#,##0.00_);\\("$"#,##0.00\\)',
    65: '"$"#,##0.00_);\\("$"#,##0.00\\)',
    //  8 -- Currency,   2 decimal, red   negative
    8: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
    66: '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
    // 41 -- Accounting, 0 decimal, No Symbol
    41: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)',
    // 42 -- Accounting, 0 decimal, $  Symbol
    42: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)',
    // 43 -- Accounting, 2 decimal, No Symbol
    43: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
    // 44 -- Accounting, 2 decimal, $  Symbol
    44: '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'
  };
  function SSF_frac(x, D, mixed) {
    var sgn = x < 0 ? -1 : 1;
    var B = x * sgn;
    var P_2 = 0, P_1 = 1, P = 0;
    var Q_2 = 1, Q_1 = 0, Q = 0;
    var A = Math.floor(B);
    while (Q_1 < D) {
      A = Math.floor(B);
      P = A * P_1 + P_2;
      Q = A * Q_1 + Q_2;
      if (B - A < 5e-8) break;
      B = 1 / (B - A);
      P_2 = P_1;
      P_1 = P;
      Q_2 = Q_1;
      Q_1 = Q;
    }
    if (Q > D) {
      if (Q_1 > D) {
        Q = Q_2;
        P = P_2;
      } else {
        Q = Q_1;
        P = P_1;
      }
    }
    if (!mixed) return [0, sgn * P, Q];
    var q = Math.floor(sgn * P / Q);
    return [q, sgn * P - q * Q, Q];
  }
  function SSF_parse_date_code(v, opts, b2) {
    if (v > 2958465 || v < 0) return null;
    var date = v | 0, time = Math.floor(86400 * (v - date)), dow = 0;
    var dout = [];
    var out = { D: date, T: time, u: 86400 * (v - date) - time, y: 0, m: 0, d: 0, H: 0, M: 0, S: 0, q: 0 };
    if (Math.abs(out.u) < 1e-6) out.u = 0;
    if (opts && opts.date1904) date += 1462;
    if (out.u > 0.9999) {
      out.u = 0;
      if (++time == 86400) {
        out.T = time = 0;
        ++date;
        ++out.D;
      }
    }
    if (date === 60) {
      dout = b2 ? [1317, 10, 29] : [1900, 2, 29];
      dow = 3;
    } else if (date === 0) {
      dout = b2 ? [1317, 8, 29] : [1900, 1, 0];
      dow = 6;
    } else {
      if (date > 60) --date;
      var d = new Date(1900, 0, 1);
      d.setDate(d.getDate() + date - 1);
      dout = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      dow = d.getDay();
      if (date < 60) dow = (dow + 6) % 7;
      if (b2) dow = SSF_fix_hijri(d, dout);
    }
    out.y = dout[0];
    out.m = dout[1];
    out.d = dout[2];
    out.S = time % 60;
    time = Math.floor(time / 60);
    out.M = time % 60;
    time = Math.floor(time / 60);
    out.H = time;
    out.q = dow;
    return out;
  }
  var SSFbasedate = /* @__PURE__ */ new Date(1899, 11, 31, 0, 0, 0);
  var SSFdnthresh = /* @__PURE__ */ SSFbasedate.getTime();
  var SSFbase1904 = /* @__PURE__ */ new Date(1900, 2, 1, 0, 0, 0);
  function datenum_local(v, date1904) {
    var epoch = /* @__PURE__ */ v.getTime();
    if (date1904) epoch -= 1461 * 24 * 60 * 60 * 1e3;
    else if (v >= SSFbase1904) epoch += 24 * 60 * 60 * 1e3;
    return (epoch - (SSFdnthresh + (/* @__PURE__ */ v.getTimezoneOffset() - /* @__PURE__ */ SSFbasedate.getTimezoneOffset()) * 6e4)) / (24 * 60 * 60 * 1e3);
  }
  function SSF_strip_decimal(o) {
    return o.indexOf(".") == -1 ? o : o.replace(/(?:\.0*|(\.\d*[1-9])0+)$/, "$1");
  }
  function SSF_normalize_exp(o) {
    if (o.indexOf("E") == -1) return o;
    return o.replace(/(?:\.0*|(\.\d*[1-9])0+)[Ee]/, "$1E").replace(/(E[+-])(\d)$/, "$10$2");
  }
  function SSF_small_exp(v) {
    var w = v < 0 ? 12 : 11;
    var o = SSF_strip_decimal(v.toFixed(12));
    if (o.length <= w) return o;
    o = v.toPrecision(10);
    if (o.length <= w) return o;
    return v.toExponential(5);
  }
  function SSF_large_exp(v) {
    var o = SSF_strip_decimal(v.toFixed(11));
    return o.length > (v < 0 ? 12 : 11) || o === "0" || o === "-0" ? v.toPrecision(6) : o;
  }
  function SSF_general_num(v) {
    var V = Math.floor(Math.log(Math.abs(v)) * Math.LOG10E), o;
    if (V >= -4 && V <= -1) o = v.toPrecision(10 + V);
    else if (Math.abs(V) <= 9) o = SSF_small_exp(v);
    else if (V === 10) o = v.toFixed(10).substr(0, 12);
    else o = SSF_large_exp(v);
    return SSF_strip_decimal(SSF_normalize_exp(o.toUpperCase()));
  }
  function SSF_general(v, opts) {
    switch (typeof v) {
      case "string":
        return v;
      case "boolean":
        return v ? "TRUE" : "FALSE";
      case "number":
        return (v | 0) === v ? v.toString(10) : SSF_general_num(v);
      case "undefined":
        return "";
      case "object":
        if (v == null) return "";
        if (v instanceof Date) return SSF_format(14, datenum_local(v, opts && opts.date1904), opts);
    }
    throw new Error("unsupported value in General format: " + v);
  }
  function SSF_fix_hijri(date, o) {
    o[0] -= 581;
    var dow = date.getDay();
    if (date < 60) dow = (dow + 6) % 7;
    return dow;
  }
  function SSF_write_date(type, fmt, val, ss0) {
    var o = "", ss = 0, tt = 0, y = val.y, out, outl = 0;
    switch (type) {
      case 98:
        y = val.y + 543;
      /* falls through */
      case 121:
        switch (fmt.length) {
          case 1:
          case 2:
            out = y % 100;
            outl = 2;
            break;
          default:
            out = y % 1e4;
            outl = 4;
            break;
        }
        break;
      case 109:
        switch (fmt.length) {
          case 1:
          case 2:
            out = val.m;
            outl = fmt.length;
            break;
          case 3:
            return months[val.m - 1][1];
          case 5:
            return months[val.m - 1][0];
          default:
            return months[val.m - 1][2];
        }
        break;
      case 100:
        switch (fmt.length) {
          case 1:
          case 2:
            out = val.d;
            outl = fmt.length;
            break;
          case 3:
            return days[val.q][0];
          default:
            return days[val.q][1];
        }
        break;
      case 104:
        switch (fmt.length) {
          case 1:
          case 2:
            out = 1 + (val.H + 11) % 12;
            outl = fmt.length;
            break;
          default:
            throw "bad hour format: " + fmt;
        }
        break;
      case 72:
        switch (fmt.length) {
          case 1:
          case 2:
            out = val.H;
            outl = fmt.length;
            break;
          default:
            throw "bad hour format: " + fmt;
        }
        break;
      case 77:
        switch (fmt.length) {
          case 1:
          case 2:
            out = val.M;
            outl = fmt.length;
            break;
          default:
            throw "bad minute format: " + fmt;
        }
        break;
      case 115:
        if (fmt != "s" && fmt != "ss" && fmt != ".0" && fmt != ".00" && fmt != ".000") throw "bad second format: " + fmt;
        if (val.u === 0 && (fmt == "s" || fmt == "ss")) return pad0(val.S, fmt.length);
        if (ss0 >= 2) tt = ss0 === 3 ? 1e3 : 100;
        else tt = ss0 === 1 ? 10 : 1;
        ss = Math.round(tt * (val.S + val.u));
        if (ss >= 60 * tt) ss = 0;
        if (fmt === "s") return ss === 0 ? "0" : "" + ss / tt;
        o = pad0(ss, 2 + ss0);
        if (fmt === "ss") return o.substr(0, 2);
        return "." + o.substr(2, fmt.length - 1);
      case 90:
        switch (fmt) {
          case "[h]":
          case "[hh]":
            out = val.D * 24 + val.H;
            break;
          case "[m]":
          case "[mm]":
            out = (val.D * 24 + val.H) * 60 + val.M;
            break;
          case "[s]":
          case "[ss]":
            out = ((val.D * 24 + val.H) * 60 + val.M) * 60 + Math.round(val.S + val.u);
            break;
          default:
            throw "bad abstime format: " + fmt;
        }
        outl = fmt.length === 3 ? 1 : 2;
        break;
      case 101:
        out = y;
        outl = 1;
        break;
    }
    var outstr = outl > 0 ? pad0(out, outl) : "";
    return outstr;
  }
  function commaify(s) {
    var w = 3;
    if (s.length <= w) return s;
    var j = s.length % w, o = s.substr(0, j);
    for (; j != s.length; j += w) o += (o.length > 0 ? "," : "") + s.substr(j, w);
    return o;
  }
  var pct1 = /%/g;
  function write_num_pct(type, fmt, val) {
    var sfmt = fmt.replace(pct1, ""), mul = fmt.length - sfmt.length;
    return write_num(type, sfmt, val * Math.pow(10, 2 * mul)) + fill("%", mul);
  }
  function write_num_cm(type, fmt, val) {
    var idx = fmt.length - 1;
    while (fmt.charCodeAt(idx - 1) === 44) --idx;
    return write_num(type, fmt.substr(0, idx), val / Math.pow(10, 3 * (fmt.length - idx)));
  }
  function write_num_exp(fmt, val) {
    var o;
    var idx = fmt.indexOf("E") - fmt.indexOf(".") - 1;
    if (fmt.match(/^#+0.0E\+0$/)) {
      if (val == 0) return "0.0E+0";
      else if (val < 0) return "-" + write_num_exp(fmt, -val);
      var period = fmt.indexOf(".");
      if (period === -1) period = fmt.indexOf("E");
      var ee = Math.floor(Math.log(val) * Math.LOG10E) % period;
      if (ee < 0) ee += period;
      o = (val / Math.pow(10, ee)).toPrecision(idx + 1 + (period + ee) % period);
      if (o.indexOf("e") === -1) {
        var fakee = Math.floor(Math.log(val) * Math.LOG10E);
        if (o.indexOf(".") === -1) o = o.charAt(0) + "." + o.substr(1) + "E+" + (fakee - o.length + ee);
        else o += "E+" + (fakee - ee);
        while (o.substr(0, 2) === "0.") {
          o = o.charAt(0) + o.substr(2, period) + "." + o.substr(2 + period);
          o = o.replace(/^0+([1-9])/, "$1").replace(/^0+\./, "0.");
        }
        o = o.replace(/\+-/, "-");
      }
      o = o.replace(/^([+-]?)(\d*)\.(\d*)[Ee]/, function($$, $1, $22, $3) {
        return $1 + $22 + $3.substr(0, (period + ee) % period) + "." + $3.substr(ee) + "E";
      });
    } else o = val.toExponential(idx);
    if (fmt.match(/E\+00$/) && o.match(/e[+-]\d$/)) o = o.substr(0, o.length - 1) + "0" + o.charAt(o.length - 1);
    if (fmt.match(/E\-/) && o.match(/e\+/)) o = o.replace(/e\+/, "e");
    return o.replace("e", "E");
  }
  var frac1 = /# (\?+)( ?)\/( ?)(\d+)/;
  function write_num_f1(r, aval, sign) {
    var den = parseInt(r[4], 10), rr = Math.round(aval * den), base = Math.floor(rr / den);
    var myn = rr - base * den, myd = den;
    return sign + (base === 0 ? "" : "" + base) + " " + (myn === 0 ? fill(" ", r[1].length + 1 + r[4].length) : pad_(myn, r[1].length) + r[2] + "/" + r[3] + pad0(myd, r[4].length));
  }
  function write_num_f2(r, aval, sign) {
    return sign + (aval === 0 ? "" : "" + aval) + fill(" ", r[1].length + 2 + r[4].length);
  }
  var dec1 = /^#*0*\.([0#]+)/;
  var closeparen = /\).*[0#]/;
  var phone = /\(###\) ###\\?-####/;
  function hashq(str) {
    var o = "", cc;
    for (var i = 0; i != str.length; ++i) switch (cc = str.charCodeAt(i)) {
      case 35:
        break;
      case 63:
        o += " ";
        break;
      case 48:
        o += "0";
        break;
      default:
        o += String.fromCharCode(cc);
    }
    return o;
  }
  function rnd(val, d) {
    var dd = Math.pow(10, d);
    return "" + Math.round(val * dd) / dd;
  }
  function dec(val, d) {
    var _frac = val - Math.floor(val), dd = Math.pow(10, d);
    if (d < ("" + Math.round(_frac * dd)).length) return 0;
    return Math.round(_frac * dd);
  }
  function carry(val, d) {
    if (d < ("" + Math.round((val - Math.floor(val)) * Math.pow(10, d))).length) {
      return 1;
    }
    return 0;
  }
  function flr(val) {
    if (val < 2147483647 && val > -2147483648) return "" + (val >= 0 ? val | 0 : val - 1 | 0);
    return "" + Math.floor(val);
  }
  function write_num_flt(type, fmt, val) {
    if (type.charCodeAt(0) === 40 && !fmt.match(closeparen)) {
      var ffmt = fmt.replace(/\( */, "").replace(/ \)/, "").replace(/\)/, "");
      if (val >= 0) return write_num_flt("n", ffmt, val);
      return "(" + write_num_flt("n", ffmt, -val) + ")";
    }
    if (fmt.charCodeAt(fmt.length - 1) === 44) return write_num_cm(type, fmt, val);
    if (fmt.indexOf("%") !== -1) return write_num_pct(type, fmt, val);
    if (fmt.indexOf("E") !== -1) return write_num_exp(fmt, val);
    if (fmt.charCodeAt(0) === 36) return "$" + write_num_flt(type, fmt.substr(fmt.charAt(1) == " " ? 2 : 1), val);
    var o;
    var r, ri, ff, aval = Math.abs(val), sign = val < 0 ? "-" : "";
    if (fmt.match(/^00+$/)) return sign + pad0r(aval, fmt.length);
    if (fmt.match(/^[#?]+$/)) {
      o = pad0r(val, 0);
      if (o === "0") o = "";
      return o.length > fmt.length ? o : hashq(fmt.substr(0, fmt.length - o.length)) + o;
    }
    if (r = fmt.match(frac1)) return write_num_f1(r, aval, sign);
    if (fmt.match(/^#+0+$/)) return sign + pad0r(aval, fmt.length - fmt.indexOf("0"));
    if (r = fmt.match(dec1)) {
      o = rnd(val, r[1].length).replace(/^([^\.]+)$/, "$1." + hashq(r[1])).replace(/\.$/, "." + hashq(r[1])).replace(/\.(\d*)$/, function($$, $1) {
        return "." + $1 + fill("0", hashq(
          /*::(*/
          r[1]
        ).length - $1.length);
      });
      return fmt.indexOf("0.") !== -1 ? o : o.replace(/^0\./, ".");
    }
    fmt = fmt.replace(/^#+([0.])/, "$1");
    if (r = fmt.match(/^(0*)\.(#*)$/)) {
      return sign + rnd(aval, r[2].length).replace(/\.(\d*[1-9])0*$/, ".$1").replace(/^(-?\d*)$/, "$1.").replace(/^0\./, r[1].length ? "0." : ".");
    }
    if (r = fmt.match(/^#{1,3},##0(\.?)$/)) return sign + commaify(pad0r(aval, 0));
    if (r = fmt.match(/^#,##0\.([#0]*0)$/)) {
      return val < 0 ? "-" + write_num_flt(type, fmt, -val) : commaify("" + (Math.floor(val) + carry(val, r[1].length))) + "." + pad0(dec(val, r[1].length), r[1].length);
    }
    if (r = fmt.match(/^#,#*,#0/)) return write_num_flt(type, fmt.replace(/^#,#*,/, ""), val);
    if (r = fmt.match(/^([0#]+)(\\?-([0#]+))+$/)) {
      o = _strrev(write_num_flt(type, fmt.replace(/[\\-]/g, ""), val));
      ri = 0;
      return _strrev(_strrev(fmt.replace(/\\/g, "")).replace(/[0#]/g, function(x2) {
        return ri < o.length ? o.charAt(ri++) : x2 === "0" ? "0" : "";
      }));
    }
    if (fmt.match(phone)) {
      o = write_num_flt(type, "##########", val);
      return "(" + o.substr(0, 3) + ") " + o.substr(3, 3) + "-" + o.substr(6);
    }
    var oa = "";
    if (r = fmt.match(/^([#0?]+)( ?)\/( ?)([#0?]+)/)) {
      ri = Math.min(
        /*::String(*/
        r[4].length,
        7
      );
      ff = SSF_frac(aval, Math.pow(10, ri) - 1, false);
      o = "" + sign;
      oa = write_num(
        "n",
        /*::String(*/
        r[1],
        ff[1]
      );
      if (oa.charAt(oa.length - 1) == " ") oa = oa.substr(0, oa.length - 1) + "0";
      o += oa + /*::String(*/
      r[2] + "/" + /*::String(*/
      r[3];
      oa = rpad_(ff[2], ri);
      if (oa.length < r[4].length) oa = hashq(r[4].substr(r[4].length - oa.length)) + oa;
      o += oa;
      return o;
    }
    if (r = fmt.match(/^# ([#0?]+)( ?)\/( ?)([#0?]+)/)) {
      ri = Math.min(Math.max(r[1].length, r[4].length), 7);
      ff = SSF_frac(aval, Math.pow(10, ri) - 1, true);
      return sign + (ff[0] || (ff[1] ? "" : "0")) + " " + (ff[1] ? pad_(ff[1], ri) + r[2] + "/" + r[3] + rpad_(ff[2], ri) : fill(" ", 2 * ri + 1 + r[2].length + r[3].length));
    }
    if (r = fmt.match(/^[#0?]+$/)) {
      o = pad0r(val, 0);
      if (fmt.length <= o.length) return o;
      return hashq(fmt.substr(0, fmt.length - o.length)) + o;
    }
    if (r = fmt.match(/^([#0?]+)\.([#0]+)$/)) {
      o = "" + val.toFixed(Math.min(r[2].length, 10)).replace(/([^0])0+$/, "$1");
      ri = o.indexOf(".");
      var lres = fmt.indexOf(".") - ri, rres = fmt.length - o.length - lres;
      return hashq(fmt.substr(0, lres) + o + fmt.substr(fmt.length - rres));
    }
    if (r = fmt.match(/^00,000\.([#0]*0)$/)) {
      ri = dec(val, r[1].length);
      return val < 0 ? "-" + write_num_flt(type, fmt, -val) : commaify(flr(val)).replace(/^\d,\d{3}$/, "0$&").replace(/^\d*$/, function($$) {
        return "00," + ($$.length < 3 ? pad0(0, 3 - $$.length) : "") + $$;
      }) + "." + pad0(ri, r[1].length);
    }
    switch (fmt) {
      case "###,##0.00":
        return write_num_flt(type, "#,##0.00", val);
      case "###,###":
      case "##,###":
      case "#,###":
        var x = commaify(pad0r(aval, 0));
        return x !== "0" ? sign + x : "";
      case "###,###.00":
        return write_num_flt(type, "###,##0.00", val).replace(/^0\./, ".");
      case "#,###.00":
        return write_num_flt(type, "#,##0.00", val).replace(/^0\./, ".");
      default:
    }
    throw new Error("unsupported format |" + fmt + "|");
  }
  function write_num_cm2(type, fmt, val) {
    var idx = fmt.length - 1;
    while (fmt.charCodeAt(idx - 1) === 44) --idx;
    return write_num(type, fmt.substr(0, idx), val / Math.pow(10, 3 * (fmt.length - idx)));
  }
  function write_num_pct2(type, fmt, val) {
    var sfmt = fmt.replace(pct1, ""), mul = fmt.length - sfmt.length;
    return write_num(type, sfmt, val * Math.pow(10, 2 * mul)) + fill("%", mul);
  }
  function write_num_exp2(fmt, val) {
    var o;
    var idx = fmt.indexOf("E") - fmt.indexOf(".") - 1;
    if (fmt.match(/^#+0.0E\+0$/)) {
      if (val == 0) return "0.0E+0";
      else if (val < 0) return "-" + write_num_exp2(fmt, -val);
      var period = fmt.indexOf(".");
      if (period === -1) period = fmt.indexOf("E");
      var ee = Math.floor(Math.log(val) * Math.LOG10E) % period;
      if (ee < 0) ee += period;
      o = (val / Math.pow(10, ee)).toPrecision(idx + 1 + (period + ee) % period);
      if (!o.match(/[Ee]/)) {
        var fakee = Math.floor(Math.log(val) * Math.LOG10E);
        if (o.indexOf(".") === -1) o = o.charAt(0) + "." + o.substr(1) + "E+" + (fakee - o.length + ee);
        else o += "E+" + (fakee - ee);
        o = o.replace(/\+-/, "-");
      }
      o = o.replace(/^([+-]?)(\d*)\.(\d*)[Ee]/, function($$, $1, $22, $3) {
        return $1 + $22 + $3.substr(0, (period + ee) % period) + "." + $3.substr(ee) + "E";
      });
    } else o = val.toExponential(idx);
    if (fmt.match(/E\+00$/) && o.match(/e[+-]\d$/)) o = o.substr(0, o.length - 1) + "0" + o.charAt(o.length - 1);
    if (fmt.match(/E\-/) && o.match(/e\+/)) o = o.replace(/e\+/, "e");
    return o.replace("e", "E");
  }
  function write_num_int(type, fmt, val) {
    if (type.charCodeAt(0) === 40 && !fmt.match(closeparen)) {
      var ffmt = fmt.replace(/\( */, "").replace(/ \)/, "").replace(/\)/, "");
      if (val >= 0) return write_num_int("n", ffmt, val);
      return "(" + write_num_int("n", ffmt, -val) + ")";
    }
    if (fmt.charCodeAt(fmt.length - 1) === 44) return write_num_cm2(type, fmt, val);
    if (fmt.indexOf("%") !== -1) return write_num_pct2(type, fmt, val);
    if (fmt.indexOf("E") !== -1) return write_num_exp2(fmt, val);
    if (fmt.charCodeAt(0) === 36) return "$" + write_num_int(type, fmt.substr(fmt.charAt(1) == " " ? 2 : 1), val);
    var o;
    var r, ri, ff, aval = Math.abs(val), sign = val < 0 ? "-" : "";
    if (fmt.match(/^00+$/)) return sign + pad0(aval, fmt.length);
    if (fmt.match(/^[#?]+$/)) {
      o = "" + val;
      if (val === 0) o = "";
      return o.length > fmt.length ? o : hashq(fmt.substr(0, fmt.length - o.length)) + o;
    }
    if (r = fmt.match(frac1)) return write_num_f2(r, aval, sign);
    if (fmt.match(/^#+0+$/)) return sign + pad0(aval, fmt.length - fmt.indexOf("0"));
    if (r = fmt.match(dec1)) {
      o = ("" + val).replace(/^([^\.]+)$/, "$1." + hashq(r[1])).replace(/\.$/, "." + hashq(r[1]));
      o = o.replace(/\.(\d*)$/, function($$, $1) {
        return "." + $1 + fill("0", hashq(r[1]).length - $1.length);
      });
      return fmt.indexOf("0.") !== -1 ? o : o.replace(/^0\./, ".");
    }
    fmt = fmt.replace(/^#+([0.])/, "$1");
    if (r = fmt.match(/^(0*)\.(#*)$/)) {
      return sign + ("" + aval).replace(/\.(\d*[1-9])0*$/, ".$1").replace(/^(-?\d*)$/, "$1.").replace(/^0\./, r[1].length ? "0." : ".");
    }
    if (r = fmt.match(/^#{1,3},##0(\.?)$/)) return sign + commaify("" + aval);
    if (r = fmt.match(/^#,##0\.([#0]*0)$/)) {
      return val < 0 ? "-" + write_num_int(type, fmt, -val) : commaify("" + val) + "." + fill("0", r[1].length);
    }
    if (r = fmt.match(/^#,#*,#0/)) return write_num_int(type, fmt.replace(/^#,#*,/, ""), val);
    if (r = fmt.match(/^([0#]+)(\\?-([0#]+))+$/)) {
      o = _strrev(write_num_int(type, fmt.replace(/[\\-]/g, ""), val));
      ri = 0;
      return _strrev(_strrev(fmt.replace(/\\/g, "")).replace(/[0#]/g, function(x2) {
        return ri < o.length ? o.charAt(ri++) : x2 === "0" ? "0" : "";
      }));
    }
    if (fmt.match(phone)) {
      o = write_num_int(type, "##########", val);
      return "(" + o.substr(0, 3) + ") " + o.substr(3, 3) + "-" + o.substr(6);
    }
    var oa = "";
    if (r = fmt.match(/^([#0?]+)( ?)\/( ?)([#0?]+)/)) {
      ri = Math.min(
        /*::String(*/
        r[4].length,
        7
      );
      ff = SSF_frac(aval, Math.pow(10, ri) - 1, false);
      o = "" + sign;
      oa = write_num(
        "n",
        /*::String(*/
        r[1],
        ff[1]
      );
      if (oa.charAt(oa.length - 1) == " ") oa = oa.substr(0, oa.length - 1) + "0";
      o += oa + /*::String(*/
      r[2] + "/" + /*::String(*/
      r[3];
      oa = rpad_(ff[2], ri);
      if (oa.length < r[4].length) oa = hashq(r[4].substr(r[4].length - oa.length)) + oa;
      o += oa;
      return o;
    }
    if (r = fmt.match(/^# ([#0?]+)( ?)\/( ?)([#0?]+)/)) {
      ri = Math.min(Math.max(r[1].length, r[4].length), 7);
      ff = SSF_frac(aval, Math.pow(10, ri) - 1, true);
      return sign + (ff[0] || (ff[1] ? "" : "0")) + " " + (ff[1] ? pad_(ff[1], ri) + r[2] + "/" + r[3] + rpad_(ff[2], ri) : fill(" ", 2 * ri + 1 + r[2].length + r[3].length));
    }
    if (r = fmt.match(/^[#0?]+$/)) {
      o = "" + val;
      if (fmt.length <= o.length) return o;
      return hashq(fmt.substr(0, fmt.length - o.length)) + o;
    }
    if (r = fmt.match(/^([#0]+)\.([#0]+)$/)) {
      o = "" + val.toFixed(Math.min(r[2].length, 10)).replace(/([^0])0+$/, "$1");
      ri = o.indexOf(".");
      var lres = fmt.indexOf(".") - ri, rres = fmt.length - o.length - lres;
      return hashq(fmt.substr(0, lres) + o + fmt.substr(fmt.length - rres));
    }
    if (r = fmt.match(/^00,000\.([#0]*0)$/)) {
      return val < 0 ? "-" + write_num_int(type, fmt, -val) : commaify("" + val).replace(/^\d,\d{3}$/, "0$&").replace(/^\d*$/, function($$) {
        return "00," + ($$.length < 3 ? pad0(0, 3 - $$.length) : "") + $$;
      }) + "." + pad0(0, r[1].length);
    }
    switch (fmt) {
      case "###,###":
      case "##,###":
      case "#,###":
        var x = commaify("" + aval);
        return x !== "0" ? sign + x : "";
      default:
        if (fmt.match(/\.[0#?]*$/)) return write_num_int(type, fmt.slice(0, fmt.lastIndexOf(".")), val) + hashq(fmt.slice(fmt.lastIndexOf(".")));
    }
    throw new Error("unsupported format |" + fmt + "|");
  }
  function write_num(type, fmt, val) {
    return (val | 0) === val ? write_num_int(type, fmt, val) : write_num_flt(type, fmt, val);
  }
  function SSF_split_fmt(fmt) {
    var out = [];
    var in_str = false;
    for (var i = 0, j = 0; i < fmt.length; ++i) switch (
      /*cc=*/
      fmt.charCodeAt(i)
    ) {
      case 34:
        in_str = !in_str;
        break;
      case 95:
      case 42:
      case 92:
        ++i;
        break;
      case 59:
        out[out.length] = fmt.substr(j, i - j);
        j = i + 1;
    }
    out[out.length] = fmt.substr(j);
    if (in_str === true) throw new Error("Format |" + fmt + "| unterminated string ");
    return out;
  }
  var SSF_abstime = /\[[HhMmSs\u0E0A\u0E19\u0E17]*\]/;
  function fmt_is_date(fmt) {
    var i = 0, c = "", o = "";
    while (i < fmt.length) {
      switch (c = fmt.charAt(i)) {
        case "G":
          if (SSF_isgeneral(fmt, i)) i += 6;
          i++;
          break;
        case '"':
          for (
            ;
            /*cc=*/
            fmt.charCodeAt(++i) !== 34 && i < fmt.length;
          ) {
          }
          ++i;
          break;
        case "\\":
          i += 2;
          break;
        case "_":
          i += 2;
          break;
        case "@":
          ++i;
          break;
        case "B":
        case "b":
          if (fmt.charAt(i + 1) === "1" || fmt.charAt(i + 1) === "2") return true;
        /* falls through */
        case "M":
        case "D":
        case "Y":
        case "H":
        case "S":
        case "E":
        /* falls through */
        case "m":
        case "d":
        case "y":
        case "h":
        case "s":
        case "e":
        case "g":
          return true;
        case "A":
        case "a":
        case "\u4E0A":
          if (fmt.substr(i, 3).toUpperCase() === "A/P") return true;
          if (fmt.substr(i, 5).toUpperCase() === "AM/PM") return true;
          if (fmt.substr(i, 5).toUpperCase() === "\u4E0A\u5348/\u4E0B\u5348") return true;
          ++i;
          break;
        case "[":
          o = c;
          while (fmt.charAt(i++) !== "]" && i < fmt.length) o += fmt.charAt(i);
          if (o.match(SSF_abstime)) return true;
          break;
        case ".":
        /* falls through */
        case "0":
        case "#":
          while (i < fmt.length && ("0#?.,E+-%".indexOf(c = fmt.charAt(++i)) > -1 || c == "\\" && fmt.charAt(i + 1) == "-" && "0#".indexOf(fmt.charAt(i + 2)) > -1)) {
          }
          break;
        case "?":
          while (fmt.charAt(++i) === c) {
          }
          break;
        case "*":
          ++i;
          if (fmt.charAt(i) == " " || fmt.charAt(i) == "*") ++i;
          break;
        case "(":
        case ")":
          ++i;
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          while (i < fmt.length && "0123456789".indexOf(fmt.charAt(++i)) > -1) {
          }
          break;
        case " ":
          ++i;
          break;
        default:
          ++i;
          break;
      }
    }
    return false;
  }
  function eval_fmt(fmt, v, opts, flen) {
    var out = [], o = "", i = 0, c = "", lst = "t", dt, j, cc;
    var hr = "H";
    while (i < fmt.length) {
      switch (c = fmt.charAt(i)) {
        case "G":
          if (!SSF_isgeneral(fmt, i)) throw new Error("unrecognized character " + c + " in " + fmt);
          out[out.length] = { t: "G", v: "General" };
          i += 7;
          break;
        case '"':
          for (o = ""; (cc = fmt.charCodeAt(++i)) !== 34 && i < fmt.length; ) o += String.fromCharCode(cc);
          out[out.length] = { t: "t", v: o };
          ++i;
          break;
        case "\\":
          var w = fmt.charAt(++i), t = w === "(" || w === ")" ? w : "t";
          out[out.length] = { t, v: w };
          ++i;
          break;
        case "_":
          out[out.length] = { t: "t", v: " " };
          i += 2;
          break;
        case "@":
          out[out.length] = { t: "T", v };
          ++i;
          break;
        case "B":
        case "b":
          if (fmt.charAt(i + 1) === "1" || fmt.charAt(i + 1) === "2") {
            if (dt == null) {
              dt = SSF_parse_date_code(v, opts, fmt.charAt(i + 1) === "2");
              if (dt == null) return "";
            }
            out[out.length] = { t: "X", v: fmt.substr(i, 2) };
            lst = c;
            i += 2;
            break;
          }
        /* falls through */
        case "M":
        case "D":
        case "Y":
        case "H":
        case "S":
        case "E":
          c = c.toLowerCase();
        /* falls through */
        case "m":
        case "d":
        case "y":
        case "h":
        case "s":
        case "e":
        case "g":
          if (v < 0) return "";
          if (dt == null) {
            dt = SSF_parse_date_code(v, opts);
            if (dt == null) return "";
          }
          o = c;
          while (++i < fmt.length && fmt.charAt(i).toLowerCase() === c) o += c;
          if (c === "m" && lst.toLowerCase() === "h") c = "M";
          if (c === "h") c = hr;
          out[out.length] = { t: c, v: o };
          lst = c;
          break;
        case "A":
        case "a":
        case "\u4E0A":
          var q = { t: c, v: c };
          if (dt == null) dt = SSF_parse_date_code(v, opts);
          if (fmt.substr(i, 3).toUpperCase() === "A/P") {
            if (dt != null) q.v = dt.H >= 12 ? "P" : "A";
            q.t = "T";
            hr = "h";
            i += 3;
          } else if (fmt.substr(i, 5).toUpperCase() === "AM/PM") {
            if (dt != null) q.v = dt.H >= 12 ? "PM" : "AM";
            q.t = "T";
            i += 5;
            hr = "h";
          } else if (fmt.substr(i, 5).toUpperCase() === "\u4E0A\u5348/\u4E0B\u5348") {
            if (dt != null) q.v = dt.H >= 12 ? "\u4E0B\u5348" : "\u4E0A\u5348";
            q.t = "T";
            i += 5;
            hr = "h";
          } else {
            q.t = "t";
            ++i;
          }
          if (dt == null && q.t === "T") return "";
          out[out.length] = q;
          lst = c;
          break;
        case "[":
          o = c;
          while (fmt.charAt(i++) !== "]" && i < fmt.length) o += fmt.charAt(i);
          if (o.slice(-1) !== "]") throw 'unterminated "[" block: |' + o + "|";
          if (o.match(SSF_abstime)) {
            if (dt == null) {
              dt = SSF_parse_date_code(v, opts);
              if (dt == null) return "";
            }
            out[out.length] = { t: "Z", v: o.toLowerCase() };
            lst = o.charAt(1);
          } else if (o.indexOf("$") > -1) {
            o = (o.match(/\$([^-\[\]]*)/) || [])[1] || "$";
            if (!fmt_is_date(fmt)) out[out.length] = { t: "t", v: o };
          }
          break;
        /* Numbers */
        case ".":
          if (dt != null) {
            o = c;
            while (++i < fmt.length && (c = fmt.charAt(i)) === "0") o += c;
            out[out.length] = { t: "s", v: o };
            break;
          }
        /* falls through */
        case "0":
        case "#":
          o = c;
          while (++i < fmt.length && "0#?.,E+-%".indexOf(c = fmt.charAt(i)) > -1) o += c;
          out[out.length] = { t: "n", v: o };
          break;
        case "?":
          o = c;
          while (fmt.charAt(++i) === c) o += c;
          out[out.length] = { t: c, v: o };
          lst = c;
          break;
        case "*":
          ++i;
          if (fmt.charAt(i) == " " || fmt.charAt(i) == "*") ++i;
          break;
        // **
        case "(":
        case ")":
          out[out.length] = { t: flen === 1 ? "t" : c, v: c };
          ++i;
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          o = c;
          while (i < fmt.length && "0123456789".indexOf(fmt.charAt(++i)) > -1) o += fmt.charAt(i);
          out[out.length] = { t: "D", v: o };
          break;
        case " ":
          out[out.length] = { t: c, v: c };
          ++i;
          break;
        case "$":
          out[out.length] = { t: "t", v: "$" };
          ++i;
          break;
        default:
          if (",$-+/():!^&'~{}<>=\u20ACacfijklopqrtuvwxzP".indexOf(c) === -1) throw new Error("unrecognized character " + c + " in " + fmt);
          out[out.length] = { t: "t", v: c };
          ++i;
          break;
      }
    }
    var bt = 0, ss0 = 0, ssm;
    for (i = out.length - 1, lst = "t"; i >= 0; --i) {
      switch (out[i].t) {
        case "h":
        case "H":
          out[i].t = hr;
          lst = "h";
          if (bt < 1) bt = 1;
          break;
        case "s":
          if (ssm = out[i].v.match(/\.0+$/)) ss0 = Math.max(ss0, ssm[0].length - 1);
          if (bt < 3) bt = 3;
        /* falls through */
        case "d":
        case "y":
        case "M":
        case "e":
          lst = out[i].t;
          break;
        case "m":
          if (lst === "s") {
            out[i].t = "M";
            if (bt < 2) bt = 2;
          }
          break;
        case "X":
          break;
        case "Z":
          if (bt < 1 && out[i].v.match(/[Hh]/)) bt = 1;
          if (bt < 2 && out[i].v.match(/[Mm]/)) bt = 2;
          if (bt < 3 && out[i].v.match(/[Ss]/)) bt = 3;
      }
    }
    switch (bt) {
      case 0:
        break;
      case 1:
        if (dt.u >= 0.5) {
          dt.u = 0;
          ++dt.S;
        }
        if (dt.S >= 60) {
          dt.S = 0;
          ++dt.M;
        }
        if (dt.M >= 60) {
          dt.M = 0;
          ++dt.H;
        }
        break;
      case 2:
        if (dt.u >= 0.5) {
          dt.u = 0;
          ++dt.S;
        }
        if (dt.S >= 60) {
          dt.S = 0;
          ++dt.M;
        }
        break;
    }
    var nstr = "", jj;
    for (i = 0; i < out.length; ++i) {
      switch (out[i].t) {
        case "t":
        case "T":
        case " ":
        case "D":
          break;
        case "X":
          out[i].v = "";
          out[i].t = ";";
          break;
        case "d":
        case "m":
        case "y":
        case "h":
        case "H":
        case "M":
        case "s":
        case "e":
        case "b":
        case "Z":
          out[i].v = SSF_write_date(out[i].t.charCodeAt(0), out[i].v, dt, ss0);
          out[i].t = "t";
          break;
        case "n":
        case "?":
          jj = i + 1;
          while (out[jj] != null && ((c = out[jj].t) === "?" || c === "D" || (c === " " || c === "t") && out[jj + 1] != null && (out[jj + 1].t === "?" || out[jj + 1].t === "t" && out[jj + 1].v === "/") || out[i].t === "(" && (c === " " || c === "n" || c === ")") || c === "t" && (out[jj].v === "/" || out[jj].v === " " && out[jj + 1] != null && out[jj + 1].t == "?"))) {
            out[i].v += out[jj].v;
            out[jj] = { v: "", t: ";" };
            ++jj;
          }
          nstr += out[i].v;
          i = jj - 1;
          break;
        case "G":
          out[i].t = "t";
          out[i].v = SSF_general(v, opts);
          break;
      }
    }
    var vv = "", myv, ostr;
    if (nstr.length > 0) {
      if (nstr.charCodeAt(0) == 40) {
        myv = v < 0 && nstr.charCodeAt(0) === 45 ? -v : v;
        ostr = write_num("n", nstr, myv);
      } else {
        myv = v < 0 && flen > 1 ? -v : v;
        ostr = write_num("n", nstr, myv);
        if (myv < 0 && out[0] && out[0].t == "t") {
          ostr = ostr.substr(1);
          out[0].v = "-" + out[0].v;
        }
      }
      jj = ostr.length - 1;
      var decpt = out.length;
      for (i = 0; i < out.length; ++i) if (out[i] != null && out[i].t != "t" && out[i].v.indexOf(".") > -1) {
        decpt = i;
        break;
      }
      var lasti = out.length;
      if (decpt === out.length && ostr.indexOf("E") === -1) {
        for (i = out.length - 1; i >= 0; --i) {
          if (out[i] == null || "n?".indexOf(out[i].t) === -1) continue;
          if (jj >= out[i].v.length - 1) {
            jj -= out[i].v.length;
            out[i].v = ostr.substr(jj + 1, out[i].v.length);
          } else if (jj < 0) out[i].v = "";
          else {
            out[i].v = ostr.substr(0, jj + 1);
            jj = -1;
          }
          out[i].t = "t";
          lasti = i;
        }
        if (jj >= 0 && lasti < out.length) out[lasti].v = ostr.substr(0, jj + 1) + out[lasti].v;
      } else if (decpt !== out.length && ostr.indexOf("E") === -1) {
        jj = ostr.indexOf(".") - 1;
        for (i = decpt; i >= 0; --i) {
          if (out[i] == null || "n?".indexOf(out[i].t) === -1) continue;
          j = out[i].v.indexOf(".") > -1 && i === decpt ? out[i].v.indexOf(".") - 1 : out[i].v.length - 1;
          vv = out[i].v.substr(j + 1);
          for (; j >= 0; --j) {
            if (jj >= 0 && (out[i].v.charAt(j) === "0" || out[i].v.charAt(j) === "#")) vv = ostr.charAt(jj--) + vv;
          }
          out[i].v = vv;
          out[i].t = "t";
          lasti = i;
        }
        if (jj >= 0 && lasti < out.length) out[lasti].v = ostr.substr(0, jj + 1) + out[lasti].v;
        jj = ostr.indexOf(".") + 1;
        for (i = decpt; i < out.length; ++i) {
          if (out[i] == null || "n?(".indexOf(out[i].t) === -1 && i !== decpt) continue;
          j = out[i].v.indexOf(".") > -1 && i === decpt ? out[i].v.indexOf(".") + 1 : 0;
          vv = out[i].v.substr(0, j);
          for (; j < out[i].v.length; ++j) {
            if (jj < ostr.length) vv += ostr.charAt(jj++);
          }
          out[i].v = vv;
          out[i].t = "t";
          lasti = i;
        }
      }
    }
    for (i = 0; i < out.length; ++i) if (out[i] != null && "n?".indexOf(out[i].t) > -1) {
      myv = flen > 1 && v < 0 && i > 0 && out[i - 1].v === "-" ? -v : v;
      out[i].v = write_num(out[i].t, out[i].v, myv);
      out[i].t = "t";
    }
    var retval = "";
    for (i = 0; i !== out.length; ++i) if (out[i] != null) retval += out[i].v;
    return retval;
  }
  var cfregex2 = /\[(=|>[=]?|<[>=]?)(-?\d+(?:\.\d*)?)\]/;
  function chkcond(v, rr) {
    if (rr == null) return false;
    var thresh = parseFloat(rr[2]);
    switch (rr[1]) {
      case "=":
        if (v == thresh) return true;
        break;
      case ">":
        if (v > thresh) return true;
        break;
      case "<":
        if (v < thresh) return true;
        break;
      case "<>":
        if (v != thresh) return true;
        break;
      case ">=":
        if (v >= thresh) return true;
        break;
      case "<=":
        if (v <= thresh) return true;
        break;
    }
    return false;
  }
  function choose_fmt(f, v) {
    var fmt = SSF_split_fmt(f);
    var l = fmt.length, lat = fmt[l - 1].indexOf("@");
    if (l < 4 && lat > -1) --l;
    if (fmt.length > 4) throw new Error("cannot find right format for |" + fmt.join("|") + "|");
    if (typeof v !== "number") return [4, fmt.length === 4 || lat > -1 ? fmt[fmt.length - 1] : "@"];
    switch (fmt.length) {
      case 1:
        fmt = lat > -1 ? ["General", "General", "General", fmt[0]] : [fmt[0], fmt[0], fmt[0], "@"];
        break;
      case 2:
        fmt = lat > -1 ? [fmt[0], fmt[0], fmt[0], fmt[1]] : [fmt[0], fmt[1], fmt[0], "@"];
        break;
      case 3:
        fmt = lat > -1 ? [fmt[0], fmt[1], fmt[0], fmt[2]] : [fmt[0], fmt[1], fmt[2], "@"];
        break;
      case 4:
        break;
    }
    var ff = v > 0 ? fmt[0] : v < 0 ? fmt[1] : fmt[2];
    if (fmt[0].indexOf("[") === -1 && fmt[1].indexOf("[") === -1) return [l, ff];
    if (fmt[0].match(/\[[=<>]/) != null || fmt[1].match(/\[[=<>]/) != null) {
      var m1 = fmt[0].match(cfregex2);
      var m2 = fmt[1].match(cfregex2);
      return chkcond(v, m1) ? [l, fmt[0]] : chkcond(v, m2) ? [l, fmt[1]] : [l, fmt[m1 != null && m2 != null ? 2 : 1]];
    }
    return [l, ff];
  }
  function SSF_format(fmt, v, o) {
    if (o == null) o = {};
    var sfmt = "";
    switch (typeof fmt) {
      case "string":
        if (fmt == "m/d/yy" && o.dateNF) sfmt = o.dateNF;
        else sfmt = fmt;
        break;
      case "number":
        if (fmt == 14 && o.dateNF) sfmt = o.dateNF;
        else sfmt = (o.table != null ? o.table : table_fmt)[fmt];
        if (sfmt == null) sfmt = o.table && o.table[SSF_default_map[fmt]] || table_fmt[SSF_default_map[fmt]];
        if (sfmt == null) sfmt = SSF_default_str[fmt] || "General";
        break;
    }
    if (SSF_isgeneral(sfmt, 0)) return SSF_general(v, o);
    if (v instanceof Date) v = datenum_local(v, o.date1904);
    var f = choose_fmt(sfmt, v);
    if (SSF_isgeneral(f[1])) return SSF_general(v, o);
    if (v === true) v = "TRUE";
    else if (v === false) v = "FALSE";
    else if (v === "" || v == null) return "";
    return eval_fmt(f[1], v, o, f[0]);
  }
  function SSF_load(fmt, idx) {
    if (typeof idx != "number") {
      idx = +idx || -1;
      for (var i = 0; i < 392; ++i) {
        if (table_fmt[i] == void 0) {
          if (idx < 0) idx = i;
          continue;
        }
        if (table_fmt[i] == fmt) {
          idx = i;
          break;
        }
      }
      if (idx < 0) idx = 391;
    }
    table_fmt[idx] = fmt;
    return idx;
  }
  function make_ssf() {
    table_fmt = SSF_init_table();
  }
  var SSFImplicit = {
    "5": '"$"#,##0_);\\("$"#,##0\\)',
    "6": '"$"#,##0_);[Red]\\("$"#,##0\\)',
    "7": '"$"#,##0.00_);\\("$"#,##0.00\\)',
    "8": '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
    "23": "General",
    "24": "General",
    "25": "General",
    "26": "General",
    "27": "m/d/yy",
    "28": "m/d/yy",
    "29": "m/d/yy",
    "30": "m/d/yy",
    "31": "m/d/yy",
    "32": "h:mm:ss",
    "33": "h:mm:ss",
    "34": "h:mm:ss",
    "35": "h:mm:ss",
    "36": "m/d/yy",
    "41": '_(* #,##0_);_(* (#,##0);_(* "-"_);_(@_)',
    "42": '_("$"* #,##0_);_("$"* (#,##0);_("$"* "-"_);_(@_)',
    "43": '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)',
    "44": '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)',
    "50": "m/d/yy",
    "51": "m/d/yy",
    "52": "m/d/yy",
    "53": "m/d/yy",
    "54": "m/d/yy",
    "55": "m/d/yy",
    "56": "m/d/yy",
    "57": "m/d/yy",
    "58": "m/d/yy",
    "59": "0",
    "60": "0.00",
    "61": "#,##0",
    "62": "#,##0.00",
    "63": '"$"#,##0_);\\("$"#,##0\\)',
    "64": '"$"#,##0_);[Red]\\("$"#,##0\\)',
    "65": '"$"#,##0.00_);\\("$"#,##0.00\\)',
    "66": '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
    "67": "0%",
    "68": "0.00%",
    "69": "# ?/?",
    "70": "# ??/??",
    "71": "m/d/yy",
    "72": "m/d/yy",
    "73": "d-mmm-yy",
    "74": "d-mmm",
    "75": "mmm-yy",
    "76": "h:mm",
    "77": "h:mm:ss",
    "78": "m/d/yy h:mm",
    "79": "mm:ss",
    "80": "[h]:mm:ss",
    "81": "mmss.0"
  };
  var dateNFregex = /[dD]+|[mM]+|[yYeE]+|[Hh]+|[Ss]+/g;
  function dateNF_regex(dateNF) {
    var fmt = typeof dateNF == "number" ? table_fmt[dateNF] : dateNF;
    fmt = fmt.replace(dateNFregex, "(\\d+)");
    return new RegExp("^" + fmt + "$");
  }
  function dateNF_fix(str, dateNF, match) {
    var Y = -1, m = -1, d = -1, H = -1, M = -1, S2 = -1;
    (dateNF.match(dateNFregex) || []).forEach(function(n, i) {
      var v = parseInt(match[i + 1], 10);
      switch (n.toLowerCase().charAt(0)) {
        case "y":
          Y = v;
          break;
        case "d":
          d = v;
          break;
        case "h":
          H = v;
          break;
        case "s":
          S2 = v;
          break;
        case "m":
          if (H >= 0) M = v;
          else m = v;
          break;
      }
    });
    if (S2 >= 0 && M == -1 && m >= 0) {
      M = m;
      m = -1;
    }
    var datestr = ("" + (Y >= 0 ? Y : (/* @__PURE__ */ new Date()).getFullYear())).slice(-4) + "-" + ("00" + (m >= 1 ? m : 1)).slice(-2) + "-" + ("00" + (d >= 1 ? d : 1)).slice(-2);
    if (datestr.length == 7) datestr = "0" + datestr;
    if (datestr.length == 8) datestr = "20" + datestr;
    var timestr = ("00" + (H >= 0 ? H : 0)).slice(-2) + ":" + ("00" + (M >= 0 ? M : 0)).slice(-2) + ":" + ("00" + (S2 >= 0 ? S2 : 0)).slice(-2);
    if (H == -1 && M == -1 && S2 == -1) return datestr;
    if (Y == -1 && m == -1 && d == -1) return timestr;
    return datestr + "T" + timestr;
  }
  var CRC32 = /* @__PURE__ */ function() {
    var CRC322 = {};
    CRC322.version = "1.2.0";
    function signed_crc_table() {
      var c = 0, table = new Array(256);
      for (var n = 0; n != 256; ++n) {
        c = n;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        c = c & 1 ? -306674912 ^ c >>> 1 : c >>> 1;
        table[n] = c;
      }
      return typeof Int32Array !== "undefined" ? new Int32Array(table) : table;
    }
    var T0 = signed_crc_table();
    function slice_by_16_tables(T) {
      var c = 0, v = 0, n = 0, table = typeof Int32Array !== "undefined" ? new Int32Array(4096) : new Array(4096);
      for (n = 0; n != 256; ++n) table[n] = T[n];
      for (n = 0; n != 256; ++n) {
        v = T[n];
        for (c = 256 + n; c < 4096; c += 256) v = table[c] = v >>> 8 ^ T[v & 255];
      }
      var out = [];
      for (n = 1; n != 16; ++n) out[n - 1] = typeof Int32Array !== "undefined" ? table.subarray(n * 256, n * 256 + 256) : table.slice(n * 256, n * 256 + 256);
      return out;
    }
    var TT = slice_by_16_tables(T0);
    var T1 = TT[0], T2 = TT[1], T3 = TT[2], T4 = TT[3], T5 = TT[4];
    var T6 = TT[5], T7 = TT[6], T8 = TT[7], T9 = TT[8], Ta = TT[9];
    var Tb = TT[10], Tc = TT[11], Td = TT[12], Te = TT[13], Tf = TT[14];
    function crc32_bstr(bstr, seed) {
      var C = seed ^ -1;
      for (var i = 0, L = bstr.length; i < L; ) C = C >>> 8 ^ T0[(C ^ bstr.charCodeAt(i++)) & 255];
      return ~C;
    }
    function crc32_buf(B, seed) {
      var C = seed ^ -1, L = B.length - 15, i = 0;
      for (; i < L; ) C = Tf[B[i++] ^ C & 255] ^ Te[B[i++] ^ C >> 8 & 255] ^ Td[B[i++] ^ C >> 16 & 255] ^ Tc[B[i++] ^ C >>> 24] ^ Tb[B[i++]] ^ Ta[B[i++]] ^ T9[B[i++]] ^ T8[B[i++]] ^ T7[B[i++]] ^ T6[B[i++]] ^ T5[B[i++]] ^ T4[B[i++]] ^ T3[B[i++]] ^ T2[B[i++]] ^ T1[B[i++]] ^ T0[B[i++]];
      L += 15;
      while (i < L) C = C >>> 8 ^ T0[(C ^ B[i++]) & 255];
      return ~C;
    }
    function crc32_str(str, seed) {
      var C = seed ^ -1;
      for (var i = 0, L = str.length, c = 0, d = 0; i < L; ) {
        c = str.charCodeAt(i++);
        if (c < 128) {
          C = C >>> 8 ^ T0[(C ^ c) & 255];
        } else if (c < 2048) {
          C = C >>> 8 ^ T0[(C ^ (192 | c >> 6 & 31)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
        } else if (c >= 55296 && c < 57344) {
          c = (c & 1023) + 64;
          d = str.charCodeAt(i++) & 1023;
          C = C >>> 8 ^ T0[(C ^ (240 | c >> 8 & 7)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | c >> 2 & 63)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | d >> 6 & 15 | (c & 3) << 4)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | d & 63)) & 255];
        } else {
          C = C >>> 8 ^ T0[(C ^ (224 | c >> 12 & 15)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | c >> 6 & 63)) & 255];
          C = C >>> 8 ^ T0[(C ^ (128 | c & 63)) & 255];
        }
      }
      return ~C;
    }
    CRC322.table = T0;
    CRC322.bstr = crc32_bstr;
    CRC322.buf = crc32_buf;
    CRC322.str = crc32_str;
    return CRC322;
  }();
  var CFB = /* @__PURE__ */ function _CFB() {
    var exports = {};
    exports.version = "1.2.1";
    function namecmp(l, r) {
      var L = l.split("/"), R = r.split("/");
      for (var i2 = 0, c = 0, Z2 = Math.min(L.length, R.length); i2 < Z2; ++i2) {
        if (c = L[i2].length - R[i2].length) return c;
        if (L[i2] != R[i2]) return L[i2] < R[i2] ? -1 : 1;
      }
      return L.length - R.length;
    }
    function dirname(p) {
      if (p.charAt(p.length - 1) == "/") return p.slice(0, -1).indexOf("/") === -1 ? p : dirname(p.slice(0, -1));
      var c = p.lastIndexOf("/");
      return c === -1 ? p : p.slice(0, c + 1);
    }
    function filename(p) {
      if (p.charAt(p.length - 1) == "/") return filename(p.slice(0, -1));
      var c = p.lastIndexOf("/");
      return c === -1 ? p : p.slice(c + 1);
    }
    function write_dos_date(buf, date) {
      if (typeof date === "string") date = new Date(date);
      var hms = date.getHours();
      hms = hms << 6 | date.getMinutes();
      hms = hms << 5 | date.getSeconds() >>> 1;
      buf.write_shift(2, hms);
      var ymd = date.getFullYear() - 1980;
      ymd = ymd << 4 | date.getMonth() + 1;
      ymd = ymd << 5 | date.getDate();
      buf.write_shift(2, ymd);
    }
    function parse_dos_date(buf) {
      var hms = buf.read_shift(2) & 65535;
      var ymd = buf.read_shift(2) & 65535;
      var val = /* @__PURE__ */ new Date();
      var d = ymd & 31;
      ymd >>>= 5;
      var m = ymd & 15;
      ymd >>>= 4;
      val.setMilliseconds(0);
      val.setFullYear(ymd + 1980);
      val.setMonth(m - 1);
      val.setDate(d);
      var S2 = hms & 31;
      hms >>>= 5;
      var M = hms & 63;
      hms >>>= 6;
      val.setHours(hms);
      val.setMinutes(M);
      val.setSeconds(S2 << 1);
      return val;
    }
    function parse_extra_field(blob) {
      prep_blob(blob, 0);
      var o = (
        /*::(*/
        {}
      );
      var flags = 0;
      while (blob.l <= blob.length - 4) {
        var type = blob.read_shift(2);
        var sz = blob.read_shift(2), tgt = blob.l + sz;
        var p = {};
        switch (type) {
          /* UNIX-style Timestamps */
          case 21589:
            {
              flags = blob.read_shift(1);
              if (flags & 1) p.mtime = blob.read_shift(4);
              if (sz > 5) {
                if (flags & 2) p.atime = blob.read_shift(4);
                if (flags & 4) p.ctime = blob.read_shift(4);
              }
              if (p.mtime) p.mt = new Date(p.mtime * 1e3);
            }
            break;
        }
        blob.l = tgt;
        o[type] = p;
      }
      return o;
    }
    var fs;
    function get_fs() {
      return fs || (fs = {});
    }
    function parse(file, options) {
      if (file[0] == 80 && file[1] == 75) return parse_zip2(file, options);
      if ((file[0] | 32) == 109 && (file[1] | 32) == 105) return parse_mad(file, options);
      if (file.length < 512) throw new Error("CFB file size " + file.length + " < 512");
      var mver = 3;
      var ssz = 512;
      var nmfs = 0;
      var difat_sec_cnt = 0;
      var dir_start = 0;
      var minifat_start = 0;
      var difat_start = 0;
      var fat_addrs = [];
      var blob = (
        /*::(*/
        file.slice(0, 512)
      );
      prep_blob(blob, 0);
      var mv = check_get_mver(blob);
      mver = mv[0];
      switch (mver) {
        case 3:
          ssz = 512;
          break;
        case 4:
          ssz = 4096;
          break;
        case 0:
          if (mv[1] == 0) return parse_zip2(file, options);
        /* falls through */
        default:
          throw new Error("Major Version: Expected 3 or 4 saw " + mver);
      }
      if (ssz !== 512) {
        blob = /*::(*/
        file.slice(0, ssz);
        prep_blob(
          blob,
          28
          /* blob.l */
        );
      }
      var header = file.slice(0, ssz);
      check_shifts(blob, mver);
      var dir_cnt = blob.read_shift(4, "i");
      if (mver === 3 && dir_cnt !== 0) throw new Error("# Directory Sectors: Expected 0 saw " + dir_cnt);
      blob.l += 4;
      dir_start = blob.read_shift(4, "i");
      blob.l += 4;
      blob.chk("00100000", "Mini Stream Cutoff Size: ");
      minifat_start = blob.read_shift(4, "i");
      nmfs = blob.read_shift(4, "i");
      difat_start = blob.read_shift(4, "i");
      difat_sec_cnt = blob.read_shift(4, "i");
      for (var q2 = -1, j = 0; j < 109; ++j) {
        q2 = blob.read_shift(4, "i");
        if (q2 < 0) break;
        fat_addrs[j] = q2;
      }
      var sectors = sectorify(file, ssz);
      sleuth_fat(difat_start, difat_sec_cnt, sectors, ssz, fat_addrs);
      var sector_list = make_sector_list(sectors, dir_start, fat_addrs, ssz);
      sector_list[dir_start].name = "!Directory";
      if (nmfs > 0 && minifat_start !== ENDOFCHAIN) sector_list[minifat_start].name = "!MiniFAT";
      sector_list[fat_addrs[0]].name = "!FAT";
      sector_list.fat_addrs = fat_addrs;
      sector_list.ssz = ssz;
      var files = {}, Paths = [], FileIndex = [], FullPaths = [];
      read_directory(dir_start, sector_list, sectors, Paths, nmfs, files, FileIndex, minifat_start);
      build_full_paths(FileIndex, FullPaths, Paths);
      Paths.shift();
      var o = {
        FileIndex,
        FullPaths
      };
      if (options && options.raw) o.raw = { header, sectors };
      return o;
    }
    function check_get_mver(blob) {
      if (blob[blob.l] == 80 && blob[blob.l + 1] == 75) return [0, 0];
      blob.chk(HEADER_SIGNATURE, "Header Signature: ");
      blob.l += 16;
      var mver = blob.read_shift(2, "u");
      return [blob.read_shift(2, "u"), mver];
    }
    function check_shifts(blob, mver) {
      var shift = 9;
      blob.l += 2;
      switch (shift = blob.read_shift(2)) {
        case 9:
          if (mver != 3) throw new Error("Sector Shift: Expected 9 saw " + shift);
          break;
        case 12:
          if (mver != 4) throw new Error("Sector Shift: Expected 12 saw " + shift);
          break;
        default:
          throw new Error("Sector Shift: Expected 9 or 12 saw " + shift);
      }
      blob.chk("0600", "Mini Sector Shift: ");
      blob.chk("000000000000", "Reserved: ");
    }
    function sectorify(file, ssz) {
      var nsectors = Math.ceil(file.length / ssz) - 1;
      var sectors = [];
      for (var i2 = 1; i2 < nsectors; ++i2) sectors[i2 - 1] = file.slice(i2 * ssz, (i2 + 1) * ssz);
      sectors[nsectors - 1] = file.slice(nsectors * ssz);
      return sectors;
    }
    function build_full_paths(FI, FP, Paths) {
      var i2 = 0, L = 0, R = 0, C = 0, j = 0, pl = Paths.length;
      var dad = [], q2 = [];
      for (; i2 < pl; ++i2) {
        dad[i2] = q2[i2] = i2;
        FP[i2] = Paths[i2];
      }
      for (; j < q2.length; ++j) {
        i2 = q2[j];
        L = FI[i2].L;
        R = FI[i2].R;
        C = FI[i2].C;
        if (dad[i2] === i2) {
          if (L !== -1 && dad[L] !== L) dad[i2] = dad[L];
          if (R !== -1 && dad[R] !== R) dad[i2] = dad[R];
        }
        if (C !== -1) dad[C] = i2;
        if (L !== -1 && i2 != dad[i2]) {
          dad[L] = dad[i2];
          if (q2.lastIndexOf(L) < j) q2.push(L);
        }
        if (R !== -1 && i2 != dad[i2]) {
          dad[R] = dad[i2];
          if (q2.lastIndexOf(R) < j) q2.push(R);
        }
      }
      for (i2 = 1; i2 < pl; ++i2) if (dad[i2] === i2) {
        if (R !== -1 && dad[R] !== R) dad[i2] = dad[R];
        else if (L !== -1 && dad[L] !== L) dad[i2] = dad[L];
      }
      for (i2 = 1; i2 < pl; ++i2) {
        if (FI[i2].type === 0) continue;
        j = i2;
        if (j != dad[j]) do {
          j = dad[j];
          FP[i2] = FP[j] + "/" + FP[i2];
        } while (j !== 0 && -1 !== dad[j] && j != dad[j]);
        dad[i2] = -1;
      }
      FP[0] += "/";
      for (i2 = 1; i2 < pl; ++i2) {
        if (FI[i2].type !== 2) FP[i2] += "/";
      }
    }
    function get_mfat_entry(entry, payload, mini) {
      var start = entry.start, size = entry.size;
      var o = [];
      var idx = start;
      while (mini && size > 0 && idx >= 0) {
        o.push(payload.slice(idx * MSSZ, idx * MSSZ + MSSZ));
        size -= MSSZ;
        idx = __readInt32LE(mini, idx * 4);
      }
      if (o.length === 0) return new_buf(0);
      return bconcat(o).slice(0, entry.size);
    }
    function sleuth_fat(idx, cnt, sectors, ssz, fat_addrs) {
      var q2 = ENDOFCHAIN;
      if (idx === ENDOFCHAIN) {
        if (cnt !== 0) throw new Error("DIFAT chain shorter than expected");
      } else if (idx !== -1) {
        var sector = sectors[idx], m = (ssz >>> 2) - 1;
        if (!sector) return;
        for (var i2 = 0; i2 < m; ++i2) {
          if ((q2 = __readInt32LE(sector, i2 * 4)) === ENDOFCHAIN) break;
          fat_addrs.push(q2);
        }
        sleuth_fat(__readInt32LE(sector, ssz - 4), cnt - 1, sectors, ssz, fat_addrs);
      }
    }
    function get_sector_list(sectors, start, fat_addrs, ssz, chkd) {
      var buf = [], buf_chain = [];
      if (!chkd) chkd = [];
      var modulus = ssz - 1, j = 0, jj = 0;
      for (j = start; j >= 0; ) {
        chkd[j] = true;
        buf[buf.length] = j;
        buf_chain.push(sectors[j]);
        var addr = fat_addrs[Math.floor(j * 4 / ssz)];
        jj = j * 4 & modulus;
        if (ssz < 4 + jj) throw new Error("FAT boundary crossed: " + j + " 4 " + ssz);
        if (!sectors[addr]) break;
        j = __readInt32LE(sectors[addr], jj);
      }
      return { nodes: buf, data: __toBuffer([buf_chain]) };
    }
    function make_sector_list(sectors, dir_start, fat_addrs, ssz) {
      var sl = sectors.length, sector_list = [];
      var chkd = [], buf = [], buf_chain = [];
      var modulus = ssz - 1, i2 = 0, j = 0, k = 0, jj = 0;
      for (i2 = 0; i2 < sl; ++i2) {
        buf = [];
        k = i2 + dir_start;
        if (k >= sl) k -= sl;
        if (chkd[k]) continue;
        buf_chain = [];
        var seen = [];
        for (j = k; j >= 0; ) {
          seen[j] = true;
          chkd[j] = true;
          buf[buf.length] = j;
          buf_chain.push(sectors[j]);
          var addr = fat_addrs[Math.floor(j * 4 / ssz)];
          jj = j * 4 & modulus;
          if (ssz < 4 + jj) throw new Error("FAT boundary crossed: " + j + " 4 " + ssz);
          if (!sectors[addr]) break;
          j = __readInt32LE(sectors[addr], jj);
          if (seen[j]) break;
        }
        sector_list[k] = { nodes: buf, data: __toBuffer([buf_chain]) };
      }
      return sector_list;
    }
    function read_directory(dir_start, sector_list, sectors, Paths, nmfs, files, FileIndex, mini) {
      var minifat_store = 0, pl = Paths.length ? 2 : 0;
      var sector = sector_list[dir_start].data;
      var i2 = 0, namelen = 0, name;
      for (; i2 < sector.length; i2 += 128) {
        var blob = (
          /*::(*/
          sector.slice(i2, i2 + 128)
        );
        prep_blob(blob, 64);
        namelen = blob.read_shift(2);
        name = __utf16le(blob, 0, namelen - pl);
        Paths.push(name);
        var o = {
          name,
          type: blob.read_shift(1),
          color: blob.read_shift(1),
          L: blob.read_shift(4, "i"),
          R: blob.read_shift(4, "i"),
          C: blob.read_shift(4, "i"),
          clsid: blob.read_shift(16),
          state: blob.read_shift(4, "i"),
          start: 0,
          size: 0
        };
        var ctime = blob.read_shift(2) + blob.read_shift(2) + blob.read_shift(2) + blob.read_shift(2);
        if (ctime !== 0) o.ct = read_date(blob, blob.l - 8);
        var mtime = blob.read_shift(2) + blob.read_shift(2) + blob.read_shift(2) + blob.read_shift(2);
        if (mtime !== 0) o.mt = read_date(blob, blob.l - 8);
        o.start = blob.read_shift(4, "i");
        o.size = blob.read_shift(4, "i");
        if (o.size < 0 && o.start < 0) {
          o.size = o.type = 0;
          o.start = ENDOFCHAIN;
          o.name = "";
        }
        if (o.type === 5) {
          minifat_store = o.start;
          if (nmfs > 0 && minifat_store !== ENDOFCHAIN) sector_list[minifat_store].name = "!StreamData";
        } else if (o.size >= 4096) {
          o.storage = "fat";
          if (sector_list[o.start] === void 0) sector_list[o.start] = get_sector_list(sectors, o.start, sector_list.fat_addrs, sector_list.ssz);
          sector_list[o.start].name = o.name;
          o.content = sector_list[o.start].data.slice(0, o.size);
        } else {
          o.storage = "minifat";
          if (o.size < 0) o.size = 0;
          else if (minifat_store !== ENDOFCHAIN && o.start !== ENDOFCHAIN && sector_list[minifat_store]) {
            o.content = get_mfat_entry(o, sector_list[minifat_store].data, (sector_list[mini] || {}).data);
          }
        }
        if (o.content) prep_blob(o.content, 0);
        files[name] = o;
        FileIndex.push(o);
      }
    }
    function read_date(blob, offset) {
      return new Date((__readUInt32LE(blob, offset + 4) / 1e7 * Math.pow(2, 32) + __readUInt32LE(blob, offset) / 1e7 - 11644473600) * 1e3);
    }
    function read_file(filename2, options) {
      get_fs();
      return parse(fs.readFileSync(filename2), options);
    }
    function read(blob, options) {
      var type = options && options.type;
      if (!type) {
        if (has_buf && Buffer.isBuffer(blob)) type = "buffer";
      }
      switch (type || "base64") {
        case "file":
          return read_file(blob, options);
        case "base64":
          return parse(s2a(Base64_decode(blob)), options);
        case "binary":
          return parse(s2a(blob), options);
      }
      return parse(
        /*::typeof blob == 'string' ? new Buffer(blob, 'utf-8') : */
        blob,
        options
      );
    }
    function init_cfb(cfb, opts) {
      var o = opts || {}, root = o.root || "Root Entry";
      if (!cfb.FullPaths) cfb.FullPaths = [];
      if (!cfb.FileIndex) cfb.FileIndex = [];
      if (cfb.FullPaths.length !== cfb.FileIndex.length) throw new Error("inconsistent CFB structure");
      if (cfb.FullPaths.length === 0) {
        cfb.FullPaths[0] = root + "/";
        cfb.FileIndex[0] = { name: root, type: 5 };
      }
      if (o.CLSID) cfb.FileIndex[0].clsid = o.CLSID;
      seed_cfb(cfb);
    }
    function seed_cfb(cfb) {
      var nm = "Sh33tJ5";
      if (CFB.find(cfb, "/" + nm)) return;
      var p = new_buf(4);
      p[0] = 55;
      p[1] = p[3] = 50;
      p[2] = 54;
      cfb.FileIndex.push({ name: nm, type: 2, content: p, size: 4, L: 69, R: 69, C: 69 });
      cfb.FullPaths.push(cfb.FullPaths[0] + nm);
      rebuild_cfb(cfb);
    }
    function rebuild_cfb(cfb, f) {
      init_cfb(cfb);
      var gc = false, s = false;
      for (var i2 = cfb.FullPaths.length - 1; i2 >= 0; --i2) {
        var _file = cfb.FileIndex[i2];
        switch (_file.type) {
          case 0:
            if (s) gc = true;
            else {
              cfb.FileIndex.pop();
              cfb.FullPaths.pop();
            }
            break;
          case 1:
          case 2:
          case 5:
            s = true;
            if (isNaN(_file.R * _file.L * _file.C)) gc = true;
            if (_file.R > -1 && _file.L > -1 && _file.R == _file.L) gc = true;
            break;
          default:
            gc = true;
            break;
        }
      }
      if (!gc && !f) return;
      var now = new Date(1987, 1, 19), j = 0;
      var fullPaths = Object.create ? /* @__PURE__ */ Object.create(null) : {};
      var data = [];
      for (i2 = 0; i2 < cfb.FullPaths.length; ++i2) {
        fullPaths[cfb.FullPaths[i2]] = true;
        if (cfb.FileIndex[i2].type === 0) continue;
        data.push([cfb.FullPaths[i2], cfb.FileIndex[i2]]);
      }
      for (i2 = 0; i2 < data.length; ++i2) {
        var dad = dirname(data[i2][0]);
        s = fullPaths[dad];
        if (!s) {
          data.push([dad, {
            name: filename(dad).replace("/", ""),
            type: 1,
            clsid: HEADER_CLSID,
            ct: now,
            mt: now,
            content: null
          }]);
          fullPaths[dad] = true;
        }
      }
      data.sort(function(x, y) {
        return namecmp(x[0], y[0]);
      });
      cfb.FullPaths = [];
      cfb.FileIndex = [];
      for (i2 = 0; i2 < data.length; ++i2) {
        cfb.FullPaths[i2] = data[i2][0];
        cfb.FileIndex[i2] = data[i2][1];
      }
      for (i2 = 0; i2 < data.length; ++i2) {
        var elt = cfb.FileIndex[i2];
        var nm = cfb.FullPaths[i2];
        elt.name = filename(nm).replace("/", "");
        elt.L = elt.R = elt.C = -(elt.color = 1);
        elt.size = elt.content ? elt.content.length : 0;
        elt.start = 0;
        elt.clsid = elt.clsid || HEADER_CLSID;
        if (i2 === 0) {
          elt.C = data.length > 1 ? 1 : -1;
          elt.size = 0;
          elt.type = 5;
        } else if (nm.slice(-1) == "/") {
          for (j = i2 + 1; j < data.length; ++j) if (dirname(cfb.FullPaths[j]) == nm) break;
          elt.C = j >= data.length ? -1 : j;
          for (j = i2 + 1; j < data.length; ++j) if (dirname(cfb.FullPaths[j]) == dirname(nm)) break;
          elt.R = j >= data.length ? -1 : j;
          elt.type = 1;
        } else {
          if (dirname(cfb.FullPaths[i2 + 1] || "") == dirname(nm)) elt.R = i2 + 1;
          elt.type = 2;
        }
      }
    }
    function _write(cfb, options) {
      var _opts = options || {};
      if (_opts.fileType == "mad") return write_mad(cfb, _opts);
      rebuild_cfb(cfb);
      switch (_opts.fileType) {
        case "zip":
          return write_zip(cfb, _opts);
      }
      var L = function(cfb2) {
        var mini_size = 0, fat_size = 0;
        for (var i3 = 0; i3 < cfb2.FileIndex.length; ++i3) {
          var file2 = cfb2.FileIndex[i3];
          if (!file2.content) continue;
          var flen2 = file2.content.length;
          if (flen2 > 0) {
            if (flen2 < 4096) mini_size += flen2 + 63 >> 6;
            else fat_size += flen2 + 511 >> 9;
          }
        }
        var dir_cnt = cfb2.FullPaths.length + 3 >> 2;
        var mini_cnt = mini_size + 7 >> 3;
        var mfat_cnt = mini_size + 127 >> 7;
        var fat_base = mini_cnt + fat_size + dir_cnt + mfat_cnt;
        var fat_cnt = fat_base + 127 >> 7;
        var difat_cnt = fat_cnt <= 109 ? 0 : Math.ceil((fat_cnt - 109) / 127);
        while (fat_base + fat_cnt + difat_cnt + 127 >> 7 > fat_cnt) difat_cnt = ++fat_cnt <= 109 ? 0 : Math.ceil((fat_cnt - 109) / 127);
        var L2 = [1, difat_cnt, fat_cnt, mfat_cnt, dir_cnt, fat_size, mini_size, 0];
        cfb2.FileIndex[0].size = mini_size << 6;
        L2[7] = (cfb2.FileIndex[0].start = L2[0] + L2[1] + L2[2] + L2[3] + L2[4] + L2[5]) + (L2[6] + 7 >> 3);
        return L2;
      }(cfb);
      var o = new_buf(L[7] << 9);
      var i2 = 0, T = 0;
      {
        for (i2 = 0; i2 < 8; ++i2) o.write_shift(1, HEADER_SIG[i2]);
        for (i2 = 0; i2 < 8; ++i2) o.write_shift(2, 0);
        o.write_shift(2, 62);
        o.write_shift(2, 3);
        o.write_shift(2, 65534);
        o.write_shift(2, 9);
        o.write_shift(2, 6);
        for (i2 = 0; i2 < 3; ++i2) o.write_shift(2, 0);
        o.write_shift(4, 0);
        o.write_shift(4, L[2]);
        o.write_shift(4, L[0] + L[1] + L[2] + L[3] - 1);
        o.write_shift(4, 0);
        o.write_shift(4, 1 << 12);
        o.write_shift(4, L[3] ? L[0] + L[1] + L[2] - 1 : ENDOFCHAIN);
        o.write_shift(4, L[3]);
        o.write_shift(-4, L[1] ? L[0] - 1 : ENDOFCHAIN);
        o.write_shift(4, L[1]);
        for (i2 = 0; i2 < 109; ++i2) o.write_shift(-4, i2 < L[2] ? L[1] + i2 : -1);
      }
      if (L[1]) {
        for (T = 0; T < L[1]; ++T) {
          for (; i2 < 236 + T * 127; ++i2) o.write_shift(-4, i2 < L[2] ? L[1] + i2 : -1);
          o.write_shift(-4, T === L[1] - 1 ? ENDOFCHAIN : T + 1);
        }
      }
      var chainit = function(w) {
        for (T += w; i2 < T - 1; ++i2) o.write_shift(-4, i2 + 1);
        if (w) {
          ++i2;
          o.write_shift(-4, ENDOFCHAIN);
        }
      };
      T = i2 = 0;
      for (T += L[1]; i2 < T; ++i2) o.write_shift(-4, consts.DIFSECT);
      for (T += L[2]; i2 < T; ++i2) o.write_shift(-4, consts.FATSECT);
      chainit(L[3]);
      chainit(L[4]);
      var j = 0, flen = 0;
      var file = cfb.FileIndex[0];
      for (; j < cfb.FileIndex.length; ++j) {
        file = cfb.FileIndex[j];
        if (!file.content) continue;
        flen = file.content.length;
        if (flen < 4096) continue;
        file.start = T;
        chainit(flen + 511 >> 9);
      }
      chainit(L[6] + 7 >> 3);
      while (o.l & 511) o.write_shift(-4, consts.ENDOFCHAIN);
      T = i2 = 0;
      for (j = 0; j < cfb.FileIndex.length; ++j) {
        file = cfb.FileIndex[j];
        if (!file.content) continue;
        flen = file.content.length;
        if (!flen || flen >= 4096) continue;
        file.start = T;
        chainit(flen + 63 >> 6);
      }
      while (o.l & 511) o.write_shift(-4, consts.ENDOFCHAIN);
      for (i2 = 0; i2 < L[4] << 2; ++i2) {
        var nm = cfb.FullPaths[i2];
        if (!nm || nm.length === 0) {
          for (j = 0; j < 17; ++j) o.write_shift(4, 0);
          for (j = 0; j < 3; ++j) o.write_shift(4, -1);
          for (j = 0; j < 12; ++j) o.write_shift(4, 0);
          continue;
        }
        file = cfb.FileIndex[i2];
        if (i2 === 0) file.start = file.size ? file.start - 1 : ENDOFCHAIN;
        var _nm = i2 === 0 && _opts.root || file.name;
        flen = 2 * (_nm.length + 1);
        o.write_shift(64, _nm, "utf16le");
        o.write_shift(2, flen);
        o.write_shift(1, file.type);
        o.write_shift(1, file.color);
        o.write_shift(-4, file.L);
        o.write_shift(-4, file.R);
        o.write_shift(-4, file.C);
        if (!file.clsid) for (j = 0; j < 4; ++j) o.write_shift(4, 0);
        else o.write_shift(16, file.clsid, "hex");
        o.write_shift(4, file.state || 0);
        o.write_shift(4, 0);
        o.write_shift(4, 0);
        o.write_shift(4, 0);
        o.write_shift(4, 0);
        o.write_shift(4, file.start);
        o.write_shift(4, file.size);
        o.write_shift(4, 0);
      }
      for (i2 = 1; i2 < cfb.FileIndex.length; ++i2) {
        file = cfb.FileIndex[i2];
        if (file.size >= 4096) {
          o.l = file.start + 1 << 9;
          if (has_buf && Buffer.isBuffer(file.content)) {
            file.content.copy(o, o.l, 0, file.size);
            o.l += file.size + 511 & -512;
          } else {
            for (j = 0; j < file.size; ++j) o.write_shift(1, file.content[j]);
            for (; j & 511; ++j) o.write_shift(1, 0);
          }
        }
      }
      for (i2 = 1; i2 < cfb.FileIndex.length; ++i2) {
        file = cfb.FileIndex[i2];
        if (file.size > 0 && file.size < 4096) {
          if (has_buf && Buffer.isBuffer(file.content)) {
            file.content.copy(o, o.l, 0, file.size);
            o.l += file.size + 63 & -64;
          } else {
            for (j = 0; j < file.size; ++j) o.write_shift(1, file.content[j]);
            for (; j & 63; ++j) o.write_shift(1, 0);
          }
        }
      }
      if (has_buf) {
        o.l = o.length;
      } else {
        while (o.l < o.length) o.write_shift(1, 0);
      }
      return o;
    }
    function find(cfb, path) {
      var UCFullPaths = cfb.FullPaths.map(function(x) {
        return x.toUpperCase();
      });
      var UCPaths = UCFullPaths.map(function(x) {
        var y = x.split("/");
        return y[y.length - (x.slice(-1) == "/" ? 2 : 1)];
      });
      var k = false;
      if (path.charCodeAt(0) === 47) {
        k = true;
        path = UCFullPaths[0].slice(0, -1) + path;
      } else k = path.indexOf("/") !== -1;
      var UCPath = path.toUpperCase();
      var w = k === true ? UCFullPaths.indexOf(UCPath) : UCPaths.indexOf(UCPath);
      if (w !== -1) return cfb.FileIndex[w];
      var m = !UCPath.match(chr1);
      UCPath = UCPath.replace(chr0, "");
      if (m) UCPath = UCPath.replace(chr1, "!");
      for (w = 0; w < UCFullPaths.length; ++w) {
        if ((m ? UCFullPaths[w].replace(chr1, "!") : UCFullPaths[w]).replace(chr0, "") == UCPath) return cfb.FileIndex[w];
        if ((m ? UCPaths[w].replace(chr1, "!") : UCPaths[w]).replace(chr0, "") == UCPath) return cfb.FileIndex[w];
      }
      return null;
    }
    var MSSZ = 64;
    var ENDOFCHAIN = -2;
    var HEADER_SIGNATURE = "d0cf11e0a1b11ae1";
    var HEADER_SIG = [208, 207, 17, 224, 161, 177, 26, 225];
    var HEADER_CLSID = "00000000000000000000000000000000";
    var consts = {
      /* 2.1 Compund File Sector Numbers and Types */
      MAXREGSECT: -6,
      DIFSECT: -4,
      FATSECT: -3,
      ENDOFCHAIN,
      FREESECT: -1,
      /* 2.2 Compound File Header */
      HEADER_SIGNATURE,
      HEADER_MINOR_VERSION: "3e00",
      MAXREGSID: -6,
      NOSTREAM: -1,
      HEADER_CLSID,
      /* 2.6.1 Compound File Directory Entry */
      EntryTypes: ["unknown", "storage", "stream", "lockbytes", "property", "root"]
    };
    function write_file(cfb, filename2, options) {
      get_fs();
      var o = _write(cfb, options);
      fs.writeFileSync(filename2, o);
    }
    function a2s2(o) {
      var out = new Array(o.length);
      for (var i2 = 0; i2 < o.length; ++i2) out[i2] = String.fromCharCode(o[i2]);
      return out.join("");
    }
    function write(cfb, options) {
      var o = _write(cfb, options);
      switch (options && options.type || "buffer") {
        case "file":
          get_fs();
          fs.writeFileSync(options.filename, o);
          return o;
        case "binary":
          return typeof o == "string" ? o : a2s2(o);
        case "base64":
          return Base64_encode(typeof o == "string" ? o : a2s2(o));
        case "buffer":
          if (has_buf) return Buffer.isBuffer(o) ? o : Buffer_from(o);
        /* falls through */
        case "array":
          return typeof o == "string" ? s2a(o) : o;
      }
      return o;
    }
    var _zlib;
    function use_zlib(zlib) {
      try {
        var InflateRaw = zlib.InflateRaw;
        var InflRaw = new InflateRaw();
        InflRaw._processChunk(new Uint8Array([3, 0]), InflRaw._finishFlushFlag);
        if (InflRaw.bytesRead) _zlib = zlib;
        else throw new Error("zlib does not expose bytesRead");
      } catch (e) {
        console.error("cannot use native zlib: " + (e.message || e));
      }
    }
    function _inflateRawSync(payload, usz) {
      if (!_zlib) return _inflate(payload, usz);
      var InflateRaw = _zlib.InflateRaw;
      var InflRaw = new InflateRaw();
      var out = InflRaw._processChunk(payload.slice(payload.l), InflRaw._finishFlushFlag);
      payload.l += InflRaw.bytesRead;
      return out;
    }
    function _deflateRawSync(payload) {
      return _zlib ? _zlib.deflateRawSync(payload) : _deflate(payload);
    }
    var CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
    var LEN_LN = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    var DST_LN = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    function bit_swap_8(n) {
      var t = (n << 1 | n << 11) & 139536 | (n << 5 | n << 15) & 558144;
      return (t >> 16 | t >> 8 | t) & 255;
    }
    var use_typed_arrays = typeof Uint8Array !== "undefined";
    var bitswap8 = use_typed_arrays ? new Uint8Array(1 << 8) : [];
    for (var q = 0; q < 1 << 8; ++q) bitswap8[q] = bit_swap_8(q);
    function bit_swap_n(n, b) {
      var rev = bitswap8[n & 255];
      if (b <= 8) return rev >>> 8 - b;
      rev = rev << 8 | bitswap8[n >> 8 & 255];
      if (b <= 16) return rev >>> 16 - b;
      rev = rev << 8 | bitswap8[n >> 16 & 255];
      return rev >>> 24 - b;
    }
    function read_bits_2(buf, bl) {
      var w = bl & 7, h = bl >>> 3;
      return (buf[h] | (w <= 6 ? 0 : buf[h + 1] << 8)) >>> w & 3;
    }
    function read_bits_3(buf, bl) {
      var w = bl & 7, h = bl >>> 3;
      return (buf[h] | (w <= 5 ? 0 : buf[h + 1] << 8)) >>> w & 7;
    }
    function read_bits_4(buf, bl) {
      var w = bl & 7, h = bl >>> 3;
      return (buf[h] | (w <= 4 ? 0 : buf[h + 1] << 8)) >>> w & 15;
    }
    function read_bits_5(buf, bl) {
      var w = bl & 7, h = bl >>> 3;
      return (buf[h] | (w <= 3 ? 0 : buf[h + 1] << 8)) >>> w & 31;
    }
    function read_bits_7(buf, bl) {
      var w = bl & 7, h = bl >>> 3;
      return (buf[h] | (w <= 1 ? 0 : buf[h + 1] << 8)) >>> w & 127;
    }
    function read_bits_n(buf, bl, n) {
      var w = bl & 7, h = bl >>> 3, f = (1 << n) - 1;
      var v = buf[h] >>> w;
      if (n < 8 - w) return v & f;
      v |= buf[h + 1] << 8 - w;
      if (n < 16 - w) return v & f;
      v |= buf[h + 2] << 16 - w;
      if (n < 24 - w) return v & f;
      v |= buf[h + 3] << 24 - w;
      return v & f;
    }
    function write_bits_3(buf, bl, v) {
      var w = bl & 7, h = bl >>> 3;
      if (w <= 5) buf[h] |= (v & 7) << w;
      else {
        buf[h] |= v << w & 255;
        buf[h + 1] = (v & 7) >> 8 - w;
      }
      return bl + 3;
    }
    function write_bits_1(buf, bl, v) {
      var w = bl & 7, h = bl >>> 3;
      v = (v & 1) << w;
      buf[h] |= v;
      return bl + 1;
    }
    function write_bits_8(buf, bl, v) {
      var w = bl & 7, h = bl >>> 3;
      v <<= w;
      buf[h] |= v & 255;
      v >>>= 8;
      buf[h + 1] = v;
      return bl + 8;
    }
    function write_bits_16(buf, bl, v) {
      var w = bl & 7, h = bl >>> 3;
      v <<= w;
      buf[h] |= v & 255;
      v >>>= 8;
      buf[h + 1] = v & 255;
      buf[h + 2] = v >>> 8;
      return bl + 16;
    }
    function realloc(b, sz) {
      var L = b.length, M = 2 * L > sz ? 2 * L : sz + 5, i2 = 0;
      if (L >= sz) return b;
      if (has_buf) {
        var o = new_unsafe_buf(M);
        if (b.copy) b.copy(o);
        else for (; i2 < b.length; ++i2) o[i2] = b[i2];
        return o;
      } else if (use_typed_arrays) {
        var a = new Uint8Array(M);
        if (a.set) a.set(b);
        else for (; i2 < L; ++i2) a[i2] = b[i2];
        return a;
      }
      b.length = M;
      return b;
    }
    function zero_fill_array(n) {
      var o = new Array(n);
      for (var i2 = 0; i2 < n; ++i2) o[i2] = 0;
      return o;
    }
    function build_tree(clens, cmap, MAX) {
      var maxlen = 1, w = 0, i2 = 0, j = 0, ccode = 0, L = clens.length;
      var bl_count = use_typed_arrays ? new Uint16Array(32) : zero_fill_array(32);
      for (i2 = 0; i2 < 32; ++i2) bl_count[i2] = 0;
      for (i2 = L; i2 < MAX; ++i2) clens[i2] = 0;
      L = clens.length;
      var ctree = use_typed_arrays ? new Uint16Array(L) : zero_fill_array(L);
      for (i2 = 0; i2 < L; ++i2) {
        bl_count[w = clens[i2]]++;
        if (maxlen < w) maxlen = w;
        ctree[i2] = 0;
      }
      bl_count[0] = 0;
      for (i2 = 1; i2 <= maxlen; ++i2) bl_count[i2 + 16] = ccode = ccode + bl_count[i2 - 1] << 1;
      for (i2 = 0; i2 < L; ++i2) {
        ccode = clens[i2];
        if (ccode != 0) ctree[i2] = bl_count[ccode + 16]++;
      }
      var cleni = 0;
      for (i2 = 0; i2 < L; ++i2) {
        cleni = clens[i2];
        if (cleni != 0) {
          ccode = bit_swap_n(ctree[i2], maxlen) >> maxlen - cleni;
          for (j = (1 << maxlen + 4 - cleni) - 1; j >= 0; --j)
            cmap[ccode | j << cleni] = cleni & 15 | i2 << 4;
        }
      }
      return maxlen;
    }
    var fix_lmap = use_typed_arrays ? new Uint16Array(512) : zero_fill_array(512);
    var fix_dmap = use_typed_arrays ? new Uint16Array(32) : zero_fill_array(32);
    if (!use_typed_arrays) {
      for (var i = 0; i < 512; ++i) fix_lmap[i] = 0;
      for (i = 0; i < 32; ++i) fix_dmap[i] = 0;
    }
    (function() {
      var dlens = [];
      var i2 = 0;
      for (; i2 < 32; i2++) dlens.push(5);
      build_tree(dlens, fix_dmap, 32);
      var clens = [];
      i2 = 0;
      for (; i2 <= 143; i2++) clens.push(8);
      for (; i2 <= 255; i2++) clens.push(9);
      for (; i2 <= 279; i2++) clens.push(7);
      for (; i2 <= 287; i2++) clens.push(8);
      build_tree(clens, fix_lmap, 288);
    })();
    var _deflateRaw = /* @__PURE__ */ function _deflateRawIIFE() {
      var DST_LN_RE = use_typed_arrays ? new Uint8Array(32768) : [];
      var j = 0, k = 0;
      for (; j < DST_LN.length - 1; ++j) {
        for (; k < DST_LN[j + 1]; ++k) DST_LN_RE[k] = j;
      }
      for (; k < 32768; ++k) DST_LN_RE[k] = 29;
      var LEN_LN_RE = use_typed_arrays ? new Uint8Array(259) : [];
      for (j = 0, k = 0; j < LEN_LN.length - 1; ++j) {
        for (; k < LEN_LN[j + 1]; ++k) LEN_LN_RE[k] = j;
      }
      function write_stored(data, out) {
        var boff = 0;
        while (boff < data.length) {
          var L = Math.min(65535, data.length - boff);
          var h = boff + L == data.length;
          out.write_shift(1, +h);
          out.write_shift(2, L);
          out.write_shift(2, ~L & 65535);
          while (L-- > 0) out[out.l++] = data[boff++];
        }
        return out.l;
      }
      function write_huff_fixed(data, out) {
        var bl = 0;
        var boff = 0;
        var addrs = use_typed_arrays ? new Uint16Array(32768) : [];
        while (boff < data.length) {
          var L = (
            /* data.length - boff; */
            Math.min(65535, data.length - boff)
          );
          if (L < 10) {
            bl = write_bits_3(out, bl, +!!(boff + L == data.length));
            if (bl & 7) bl += 8 - (bl & 7);
            out.l = bl / 8 | 0;
            out.write_shift(2, L);
            out.write_shift(2, ~L & 65535);
            while (L-- > 0) out[out.l++] = data[boff++];
            bl = out.l * 8;
            continue;
          }
          bl = write_bits_3(out, bl, +!!(boff + L == data.length) + 2);
          var hash = 0;
          while (L-- > 0) {
            var d = data[boff];
            hash = (hash << 5 ^ d) & 32767;
            var match = -1, mlen = 0;
            if (match = addrs[hash]) {
              match |= boff & ~32767;
              if (match > boff) match -= 32768;
              if (match < boff) while (data[match + mlen] == data[boff + mlen] && mlen < 250) ++mlen;
            }
            if (mlen > 2) {
              d = LEN_LN_RE[mlen];
              if (d <= 22) bl = write_bits_8(out, bl, bitswap8[d + 1] >> 1) - 1;
              else {
                write_bits_8(out, bl, 3);
                bl += 5;
                write_bits_8(out, bl, bitswap8[d - 23] >> 5);
                bl += 3;
              }
              var len_eb = d < 8 ? 0 : d - 4 >> 2;
              if (len_eb > 0) {
                write_bits_16(out, bl, mlen - LEN_LN[d]);
                bl += len_eb;
              }
              d = DST_LN_RE[boff - match];
              bl = write_bits_8(out, bl, bitswap8[d] >> 3);
              bl -= 3;
              var dst_eb = d < 4 ? 0 : d - 2 >> 1;
              if (dst_eb > 0) {
                write_bits_16(out, bl, boff - match - DST_LN[d]);
                bl += dst_eb;
              }
              for (var q2 = 0; q2 < mlen; ++q2) {
                addrs[hash] = boff & 32767;
                hash = (hash << 5 ^ data[boff]) & 32767;
                ++boff;
              }
              L -= mlen - 1;
            } else {
              if (d <= 143) d = d + 48;
              else bl = write_bits_1(out, bl, 1);
              bl = write_bits_8(out, bl, bitswap8[d]);
              addrs[hash] = boff & 32767;
              ++boff;
            }
          }
          bl = write_bits_8(out, bl, 0) - 1;
        }
        out.l = (bl + 7) / 8 | 0;
        return out.l;
      }
      return function _deflateRaw2(data, out) {
        if (data.length < 8) return write_stored(data, out);
        return write_huff_fixed(data, out);
      };
    }();
    function _deflate(data) {
      var buf = new_buf(50 + Math.floor(data.length * 1.1));
      var off = _deflateRaw(data, buf);
      return buf.slice(0, off);
    }
    var dyn_lmap = use_typed_arrays ? new Uint16Array(32768) : zero_fill_array(32768);
    var dyn_dmap = use_typed_arrays ? new Uint16Array(32768) : zero_fill_array(32768);
    var dyn_cmap = use_typed_arrays ? new Uint16Array(128) : zero_fill_array(128);
    var dyn_len_1 = 1, dyn_len_2 = 1;
    function dyn(data, boff) {
      var _HLIT = read_bits_5(data, boff) + 257;
      boff += 5;
      var _HDIST = read_bits_5(data, boff) + 1;
      boff += 5;
      var _HCLEN = read_bits_4(data, boff) + 4;
      boff += 4;
      var w = 0;
      var clens = use_typed_arrays ? new Uint8Array(19) : zero_fill_array(19);
      var ctree = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      var maxlen = 1;
      var bl_count = use_typed_arrays ? new Uint8Array(8) : zero_fill_array(8);
      var next_code = use_typed_arrays ? new Uint8Array(8) : zero_fill_array(8);
      var L = clens.length;
      for (var i2 = 0; i2 < _HCLEN; ++i2) {
        clens[CLEN_ORDER[i2]] = w = read_bits_3(data, boff);
        if (maxlen < w) maxlen = w;
        bl_count[w]++;
        boff += 3;
      }
      var ccode = 0;
      bl_count[0] = 0;
      for (i2 = 1; i2 <= maxlen; ++i2) next_code[i2] = ccode = ccode + bl_count[i2 - 1] << 1;
      for (i2 = 0; i2 < L; ++i2) if ((ccode = clens[i2]) != 0) ctree[i2] = next_code[ccode]++;
      var cleni = 0;
      for (i2 = 0; i2 < L; ++i2) {
        cleni = clens[i2];
        if (cleni != 0) {
          ccode = bitswap8[ctree[i2]] >> 8 - cleni;
          for (var j = (1 << 7 - cleni) - 1; j >= 0; --j) dyn_cmap[ccode | j << cleni] = cleni & 7 | i2 << 3;
        }
      }
      var hcodes = [];
      maxlen = 1;
      for (; hcodes.length < _HLIT + _HDIST; ) {
        ccode = dyn_cmap[read_bits_7(data, boff)];
        boff += ccode & 7;
        switch (ccode >>>= 3) {
          case 16:
            w = 3 + read_bits_2(data, boff);
            boff += 2;
            ccode = hcodes[hcodes.length - 1];
            while (w-- > 0) hcodes.push(ccode);
            break;
          case 17:
            w = 3 + read_bits_3(data, boff);
            boff += 3;
            while (w-- > 0) hcodes.push(0);
            break;
          case 18:
            w = 11 + read_bits_7(data, boff);
            boff += 7;
            while (w-- > 0) hcodes.push(0);
            break;
          default:
            hcodes.push(ccode);
            if (maxlen < ccode) maxlen = ccode;
            break;
        }
      }
      var h1 = hcodes.slice(0, _HLIT), h2 = hcodes.slice(_HLIT);
      for (i2 = _HLIT; i2 < 286; ++i2) h1[i2] = 0;
      for (i2 = _HDIST; i2 < 30; ++i2) h2[i2] = 0;
      dyn_len_1 = build_tree(h1, dyn_lmap, 286);
      dyn_len_2 = build_tree(h2, dyn_dmap, 30);
      return boff;
    }
    function inflate(data, usz) {
      if (data[0] == 3 && !(data[1] & 3)) {
        return [new_raw_buf(usz), 2];
      }
      var boff = 0;
      var header = 0;
      var outbuf = new_unsafe_buf(usz ? usz : 1 << 18);
      var woff = 0;
      var OL = outbuf.length >>> 0;
      var max_len_1 = 0, max_len_2 = 0;
      while ((header & 1) == 0) {
        header = read_bits_3(data, boff);
        boff += 3;
        if (header >>> 1 == 0) {
          if (boff & 7) boff += 8 - (boff & 7);
          var sz = data[boff >>> 3] | data[(boff >>> 3) + 1] << 8;
          boff += 32;
          if (sz > 0) {
            if (!usz && OL < woff + sz) {
              outbuf = realloc(outbuf, woff + sz);
              OL = outbuf.length;
            }
            while (sz-- > 0) {
              outbuf[woff++] = data[boff >>> 3];
              boff += 8;
            }
          }
          continue;
        } else if (header >> 1 == 1) {
          max_len_1 = 9;
          max_len_2 = 5;
        } else {
          boff = dyn(data, boff);
          max_len_1 = dyn_len_1;
          max_len_2 = dyn_len_2;
        }
        for (; ; ) {
          if (!usz && OL < woff + 32767) {
            outbuf = realloc(outbuf, woff + 32767);
            OL = outbuf.length;
          }
          var bits = read_bits_n(data, boff, max_len_1);
          var code = header >>> 1 == 1 ? fix_lmap[bits] : dyn_lmap[bits];
          boff += code & 15;
          code >>>= 4;
          if ((code >>> 8 & 255) === 0) outbuf[woff++] = code;
          else if (code == 256) break;
          else {
            code -= 257;
            var len_eb = code < 8 ? 0 : code - 4 >> 2;
            if (len_eb > 5) len_eb = 0;
            var tgt = woff + LEN_LN[code];
            if (len_eb > 0) {
              tgt += read_bits_n(data, boff, len_eb);
              boff += len_eb;
            }
            bits = read_bits_n(data, boff, max_len_2);
            code = header >>> 1 == 1 ? fix_dmap[bits] : dyn_dmap[bits];
            boff += code & 15;
            code >>>= 4;
            var dst_eb = code < 4 ? 0 : code - 2 >> 1;
            var dst = DST_LN[code];
            if (dst_eb > 0) {
              dst += read_bits_n(data, boff, dst_eb);
              boff += dst_eb;
            }
            if (!usz && OL < tgt) {
              outbuf = realloc(outbuf, tgt + 100);
              OL = outbuf.length;
            }
            while (woff < tgt) {
              outbuf[woff] = outbuf[woff - dst];
              ++woff;
            }
          }
        }
      }
      if (usz) return [outbuf, boff + 7 >>> 3];
      return [outbuf.slice(0, woff), boff + 7 >>> 3];
    }
    function _inflate(payload, usz) {
      var data = payload.slice(payload.l || 0);
      var out = inflate(data, usz);
      payload.l += out[1];
      return out[0];
    }
    function warn_or_throw(wrn, msg) {
      if (wrn) {
        if (typeof console !== "undefined") console.error(msg);
      } else throw new Error(msg);
    }
    function parse_zip2(file, options) {
      var blob = (
        /*::(*/
        file
      );
      prep_blob(blob, 0);
      var FileIndex = [], FullPaths = [];
      var o = {
        FileIndex,
        FullPaths
      };
      init_cfb(o, { root: options.root });
      var i2 = blob.length - 4;
      while ((blob[i2] != 80 || blob[i2 + 1] != 75 || blob[i2 + 2] != 5 || blob[i2 + 3] != 6) && i2 >= 0) --i2;
      blob.l = i2 + 4;
      blob.l += 4;
      var fcnt = blob.read_shift(2);
      blob.l += 6;
      var start_cd = blob.read_shift(4);
      blob.l = start_cd;
      for (i2 = 0; i2 < fcnt; ++i2) {
        blob.l += 20;
        var csz = blob.read_shift(4);
        var usz = blob.read_shift(4);
        var namelen = blob.read_shift(2);
        var efsz = blob.read_shift(2);
        var fcsz = blob.read_shift(2);
        blob.l += 8;
        var offset = blob.read_shift(4);
        var EF = parse_extra_field(
          /*::(*/
          blob.slice(blob.l + namelen, blob.l + namelen + efsz)
          /*:: :any)*/
        );
        blob.l += namelen + efsz + fcsz;
        var L = blob.l;
        blob.l = offset + 4;
        parse_local_file(blob, csz, usz, o, EF);
        blob.l = L;
      }
      return o;
    }
    function parse_local_file(blob, csz, usz, o, EF) {
      blob.l += 2;
      var flags = blob.read_shift(2);
      var meth = blob.read_shift(2);
      var date = parse_dos_date(blob);
      if (flags & 8257) throw new Error("Unsupported ZIP encryption");
      var crc32 = blob.read_shift(4);
      var _csz = blob.read_shift(4);
      var _usz = blob.read_shift(4);
      var namelen = blob.read_shift(2);
      var efsz = blob.read_shift(2);
      var name = "";
      for (var i2 = 0; i2 < namelen; ++i2) name += String.fromCharCode(blob[blob.l++]);
      if (efsz) {
        var ef = parse_extra_field(
          /*::(*/
          blob.slice(blob.l, blob.l + efsz)
          /*:: :any)*/
        );
        if ((ef[21589] || {}).mt) date = ef[21589].mt;
        if (((EF || {})[21589] || {}).mt) date = EF[21589].mt;
      }
      blob.l += efsz;
      var data = blob.slice(blob.l, blob.l + _csz);
      switch (meth) {
        case 8:
          data = _inflateRawSync(blob, _usz);
          break;
        case 0:
          break;
        // TODO: scan for magic number
        default:
          throw new Error("Unsupported ZIP Compression method " + meth);
      }
      var wrn = false;
      if (flags & 8) {
        crc32 = blob.read_shift(4);
        if (crc32 == 134695760) {
          crc32 = blob.read_shift(4);
          wrn = true;
        }
        _csz = blob.read_shift(4);
        _usz = blob.read_shift(4);
      }
      if (_csz != csz) warn_or_throw(wrn, "Bad compressed size: " + csz + " != " + _csz);
      if (_usz != usz) warn_or_throw(wrn, "Bad uncompressed size: " + usz + " != " + _usz);
      cfb_add(o, name, data, { unsafe: true, mt: date });
    }
    function write_zip(cfb, options) {
      var _opts = options || {};
      var out = [], cdirs = [];
      var o = new_buf(1);
      var method = _opts.compression ? 8 : 0, flags = 0;
      var desc = false;
      if (desc) flags |= 8;
      var i2 = 0, j = 0;
      var start_cd = 0, fcnt = 0;
      var root = cfb.FullPaths[0], fp = root, fi = cfb.FileIndex[0];
      var crcs = [];
      var sz_cd = 0;
      for (i2 = 1; i2 < cfb.FullPaths.length; ++i2) {
        fp = cfb.FullPaths[i2].slice(root.length);
        fi = cfb.FileIndex[i2];
        if (!fi.size || !fi.content || fp == "Sh33tJ5") continue;
        var start = start_cd;
        var namebuf = new_buf(fp.length);
        for (j = 0; j < fp.length; ++j) namebuf.write_shift(1, fp.charCodeAt(j) & 127);
        namebuf = namebuf.slice(0, namebuf.l);
        crcs[fcnt] = CRC32.buf(
          /*::((*/
          fi.content,
          0
        );
        var outbuf = fi.content;
        if (method == 8) outbuf = _deflateRawSync(outbuf);
        o = new_buf(30);
        o.write_shift(4, 67324752);
        o.write_shift(2, 20);
        o.write_shift(2, flags);
        o.write_shift(2, method);
        if (fi.mt) write_dos_date(o, fi.mt);
        else o.write_shift(4, 0);
        o.write_shift(-4, flags & 8 ? 0 : crcs[fcnt]);
        o.write_shift(4, flags & 8 ? 0 : outbuf.length);
        o.write_shift(4, flags & 8 ? 0 : (
          /*::(*/
          fi.content.length
        ));
        o.write_shift(2, namebuf.length);
        o.write_shift(2, 0);
        start_cd += o.length;
        out.push(o);
        start_cd += namebuf.length;
        out.push(namebuf);
        start_cd += outbuf.length;
        out.push(outbuf);
        if (flags & 8) {
          o = new_buf(12);
          o.write_shift(-4, crcs[fcnt]);
          o.write_shift(4, outbuf.length);
          o.write_shift(
            4,
            /*::(*/
            fi.content.length
          );
          start_cd += o.l;
          out.push(o);
        }
        o = new_buf(46);
        o.write_shift(4, 33639248);
        o.write_shift(2, 0);
        o.write_shift(2, 20);
        o.write_shift(2, flags);
        o.write_shift(2, method);
        o.write_shift(4, 0);
        o.write_shift(-4, crcs[fcnt]);
        o.write_shift(4, outbuf.length);
        o.write_shift(
          4,
          /*::(*/
          fi.content.length
        );
        o.write_shift(2, namebuf.length);
        o.write_shift(2, 0);
        o.write_shift(2, 0);
        o.write_shift(2, 0);
        o.write_shift(2, 0);
        o.write_shift(4, 0);
        o.write_shift(4, start);
        sz_cd += o.l;
        cdirs.push(o);
        sz_cd += namebuf.length;
        cdirs.push(namebuf);
        ++fcnt;
      }
      o = new_buf(22);
      o.write_shift(4, 101010256);
      o.write_shift(2, 0);
      o.write_shift(2, 0);
      o.write_shift(2, fcnt);
      o.write_shift(2, fcnt);
      o.write_shift(4, sz_cd);
      o.write_shift(4, start_cd);
      o.write_shift(2, 0);
      return bconcat([bconcat(out), bconcat(cdirs), o]);
    }
    var ContentTypeMap = {
      "htm": "text/html",
      "xml": "text/xml",
      "gif": "image/gif",
      "jpg": "image/jpeg",
      "png": "image/png",
      "mso": "application/x-mso",
      "thmx": "application/vnd.ms-officetheme",
      "sh33tj5": "application/octet-stream"
    };
    function get_content_type(fi, fp) {
      if (fi.ctype) return fi.ctype;
      var ext = fi.name || "", m = ext.match(/\.([^\.]+)$/);
      if (m && ContentTypeMap[m[1]]) return ContentTypeMap[m[1]];
      if (fp) {
        m = (ext = fp).match(/[\.\\]([^\.\\])+$/);
        if (m && ContentTypeMap[m[1]]) return ContentTypeMap[m[1]];
      }
      return "application/octet-stream";
    }
    function write_base64_76(bstr) {
      var data = Base64_encode(bstr);
      var o = [];
      for (var i2 = 0; i2 < data.length; i2 += 76) o.push(data.slice(i2, i2 + 76));
      return o.join("\r\n") + "\r\n";
    }
    function write_quoted_printable(text) {
      var encoded = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7E-\xFF=]/g, function(c) {
        var w = c.charCodeAt(0).toString(16).toUpperCase();
        return "=" + (w.length == 1 ? "0" + w : w);
      });
      encoded = encoded.replace(/ $/mg, "=20").replace(/\t$/mg, "=09");
      if (encoded.charAt(0) == "\n") encoded = "=0D" + encoded.slice(1);
      encoded = encoded.replace(/\r(?!\n)/mg, "=0D").replace(/\n\n/mg, "\n=0A").replace(/([^\r\n])\n/mg, "$1=0A");
      var o = [], split = encoded.split("\r\n");
      for (var si = 0; si < split.length; ++si) {
        var str = split[si];
        if (str.length == 0) {
          o.push("");
          continue;
        }
        for (var i2 = 0; i2 < str.length; ) {
          var end = 76;
          var tmp = str.slice(i2, i2 + end);
          if (tmp.charAt(end - 1) == "=") end--;
          else if (tmp.charAt(end - 2) == "=") end -= 2;
          else if (tmp.charAt(end - 3) == "=") end -= 3;
          tmp = str.slice(i2, i2 + end);
          i2 += end;
          if (i2 < str.length) tmp += "=";
          o.push(tmp);
        }
      }
      return o.join("\r\n");
    }
    function parse_quoted_printable(data) {
      var o = [];
      for (var di = 0; di < data.length; ++di) {
        var line = data[di];
        while (di <= data.length && line.charAt(line.length - 1) == "=") line = line.slice(0, line.length - 1) + data[++di];
        o.push(line);
      }
      for (var oi = 0; oi < o.length; ++oi) o[oi] = o[oi].replace(/[=][0-9A-Fa-f]{2}/g, function($$) {
        return String.fromCharCode(parseInt($$.slice(1), 16));
      });
      return s2a(o.join("\r\n"));
    }
    function parse_mime(cfb, data, root) {
      var fname = "", cte = "", ctype = "", fdata;
      var di = 0;
      for (; di < 10; ++di) {
        var line = data[di];
        if (!line || line.match(/^\s*$/)) break;
        var m = line.match(/^(.*?):\s*([^\s].*)$/);
        if (m) switch (m[1].toLowerCase()) {
          case "content-location":
            fname = m[2].trim();
            break;
          case "content-type":
            ctype = m[2].trim();
            break;
          case "content-transfer-encoding":
            cte = m[2].trim();
            break;
        }
      }
      ++di;
      switch (cte.toLowerCase()) {
        case "base64":
          fdata = s2a(Base64_decode(data.slice(di).join("")));
          break;
        case "quoted-printable":
          fdata = parse_quoted_printable(data.slice(di));
          break;
        default:
          throw new Error("Unsupported Content-Transfer-Encoding " + cte);
      }
      var file = cfb_add(cfb, fname.slice(root.length), fdata, { unsafe: true });
      if (ctype) file.ctype = ctype;
    }
    function parse_mad(file, options) {
      if (a2s2(file.slice(0, 13)).toLowerCase() != "mime-version:") throw new Error("Unsupported MAD header");
      var root = options && options.root || "";
      var data = (has_buf && Buffer.isBuffer(file) ? file.toString("binary") : a2s2(file)).split("\r\n");
      var di = 0, row = "";
      for (di = 0; di < data.length; ++di) {
        row = data[di];
        if (!/^Content-Location:/i.test(row)) continue;
        row = row.slice(row.indexOf("file"));
        if (!root) root = row.slice(0, row.lastIndexOf("/") + 1);
        if (row.slice(0, root.length) == root) continue;
        while (root.length > 0) {
          root = root.slice(0, root.length - 1);
          root = root.slice(0, root.lastIndexOf("/") + 1);
          if (row.slice(0, root.length) == root) break;
        }
      }
      var mboundary = (data[1] || "").match(/boundary="(.*?)"/);
      if (!mboundary) throw new Error("MAD cannot find boundary");
      var boundary = "--" + (mboundary[1] || "");
      var FileIndex = [], FullPaths = [];
      var o = {
        FileIndex,
        FullPaths
      };
      init_cfb(o);
      var start_di, fcnt = 0;
      for (di = 0; di < data.length; ++di) {
        var line = data[di];
        if (line !== boundary && line !== boundary + "--") continue;
        if (fcnt++) parse_mime(o, data.slice(start_di, di), root);
        start_di = di;
      }
      return o;
    }
    function write_mad(cfb, options) {
      var opts = options || {};
      var boundary = opts.boundary || "SheetJS";
      boundary = "------=" + boundary;
      var out = [
        "MIME-Version: 1.0",
        'Content-Type: multipart/related; boundary="' + boundary.slice(2) + '"',
        "",
        "",
        ""
      ];
      var root = cfb.FullPaths[0], fp = root, fi = cfb.FileIndex[0];
      for (var i2 = 1; i2 < cfb.FullPaths.length; ++i2) {
        fp = cfb.FullPaths[i2].slice(root.length);
        fi = cfb.FileIndex[i2];
        if (!fi.size || !fi.content || fp == "Sh33tJ5") continue;
        fp = fp.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7E-\xFF]/g, function(c) {
          return "_x" + c.charCodeAt(0).toString(16) + "_";
        }).replace(/[\u0080-\uFFFF]/g, function(u) {
          return "_u" + u.charCodeAt(0).toString(16) + "_";
        });
        var ca = fi.content;
        var cstr = has_buf && Buffer.isBuffer(ca) ? ca.toString("binary") : a2s2(ca);
        var dispcnt = 0, L = Math.min(1024, cstr.length), cc = 0;
        for (var csl = 0; csl <= L; ++csl) if ((cc = cstr.charCodeAt(csl)) >= 32 && cc < 128) ++dispcnt;
        var qp = dispcnt >= L * 4 / 5;
        out.push(boundary);
        out.push("Content-Location: " + (opts.root || "file:///C:/SheetJS/") + fp);
        out.push("Content-Transfer-Encoding: " + (qp ? "quoted-printable" : "base64"));
        out.push("Content-Type: " + get_content_type(fi, fp));
        out.push("");
        out.push(qp ? write_quoted_printable(cstr) : write_base64_76(cstr));
      }
      out.push(boundary + "--\r\n");
      return out.join("\r\n");
    }
    function cfb_new(opts) {
      var o = {};
      init_cfb(o, opts);
      return o;
    }
    function cfb_add(cfb, name, content, opts) {
      var unsafe = opts && opts.unsafe;
      if (!unsafe) init_cfb(cfb);
      var file = !unsafe && CFB.find(cfb, name);
      if (!file) {
        var fpath = cfb.FullPaths[0];
        if (name.slice(0, fpath.length) == fpath) fpath = name;
        else {
          if (fpath.slice(-1) != "/") fpath += "/";
          fpath = (fpath + name).replace("//", "/");
        }
        file = { name: filename(name), type: 2 };
        cfb.FileIndex.push(file);
        cfb.FullPaths.push(fpath);
        if (!unsafe) CFB.utils.cfb_gc(cfb);
      }
      file.content = content;
      file.size = content ? content.length : 0;
      if (opts) {
        if (opts.CLSID) file.clsid = opts.CLSID;
        if (opts.mt) file.mt = opts.mt;
        if (opts.ct) file.ct = opts.ct;
      }
      return file;
    }
    function cfb_del(cfb, name) {
      init_cfb(cfb);
      var file = CFB.find(cfb, name);
      if (file) {
        for (var j = 0; j < cfb.FileIndex.length; ++j) if (cfb.FileIndex[j] == file) {
          cfb.FileIndex.splice(j, 1);
          cfb.FullPaths.splice(j, 1);
          return true;
        }
      }
      return false;
    }
    function cfb_mov(cfb, old_name, new_name) {
      init_cfb(cfb);
      var file = CFB.find(cfb, old_name);
      if (file) {
        for (var j = 0; j < cfb.FileIndex.length; ++j) if (cfb.FileIndex[j] == file) {
          cfb.FileIndex[j].name = filename(new_name);
          cfb.FullPaths[j] = new_name;
          return true;
        }
      }
      return false;
    }
    function cfb_gc(cfb) {
      rebuild_cfb(cfb, true);
    }
    exports.find = find;
    exports.read = read;
    exports.parse = parse;
    exports.write = write;
    exports.writeFile = write_file;
    exports.utils = {
      cfb_new,
      cfb_add,
      cfb_del,
      cfb_mov,
      cfb_gc,
      ReadShift,
      CheckField,
      prep_blob,
      bconcat,
      use_zlib,
      _deflateRaw: _deflate,
      _inflateRaw: _inflate,
      consts
    };
    return exports;
  }();
  var _fs = void 0;
  function read_binary(path) {
    if (typeof _fs !== "undefined") return _fs.readFileSync(path);
    if (typeof Deno !== "undefined") return Deno.readFileSync(path);
    if (typeof $ !== "undefined" && typeof File !== "undefined" && typeof Folder !== "undefined") try {
      var infile = File(path);
      infile.open("r");
      infile.encoding = "binary";
      var data = infile.read();
      infile.close();
      return data;
    } catch (e) {
      if (!e.message || !e.message.match(/onstruct/)) throw e;
    }
    throw new Error("Cannot access file " + path);
  }
  function keys(o) {
    var ks = Object.keys(o), o2 = [];
    for (var i = 0; i < ks.length; ++i) if (Object.prototype.hasOwnProperty.call(o, ks[i])) o2.push(ks[i]);
    return o2;
  }
  function evert(obj) {
    var o = [], K = keys(obj);
    for (var i = 0; i !== K.length; ++i) o[obj[K[i]]] = K[i];
    return o;
  }
  var basedate = /* @__PURE__ */ new Date(1899, 11, 30, 0, 0, 0);
  function datenum(v, date1904) {
    var epoch = /* @__PURE__ */ v.getTime();
    if (date1904) epoch -= 1462 * 24 * 60 * 60 * 1e3;
    var dnthresh2 = /* @__PURE__ */ basedate.getTime() + (/* @__PURE__ */ v.getTimezoneOffset() - /* @__PURE__ */ basedate.getTimezoneOffset()) * 6e4;
    return (epoch - dnthresh2) / (24 * 60 * 60 * 1e3);
  }
  var refdate = /* @__PURE__ */ new Date();
  var dnthresh = /* @__PURE__ */ basedate.getTime() + (/* @__PURE__ */ refdate.getTimezoneOffset() - /* @__PURE__ */ basedate.getTimezoneOffset()) * 6e4;
  var refoffset = /* @__PURE__ */ refdate.getTimezoneOffset();
  function numdate(v) {
    var out = /* @__PURE__ */ new Date();
    out.setTime(v * 24 * 60 * 60 * 1e3 + dnthresh);
    if (out.getTimezoneOffset() !== refoffset) {
      out.setTime(out.getTime() + (out.getTimezoneOffset() - refoffset) * 6e4);
    }
    return out;
  }
  function parse_isodur(s) {
    var sec = 0, mt = 0, time = false;
    var m = s.match(/P([0-9\.]+Y)?([0-9\.]+M)?([0-9\.]+D)?T([0-9\.]+H)?([0-9\.]+M)?([0-9\.]+S)?/);
    if (!m) throw new Error("|" + s + "| is not an ISO8601 Duration");
    for (var i = 1; i != m.length; ++i) {
      if (!m[i]) continue;
      mt = 1;
      if (i > 3) time = true;
      switch (m[i].slice(m[i].length - 1)) {
        case "Y":
          throw new Error("Unsupported ISO Duration Field: " + m[i].slice(m[i].length - 1));
        case "D":
          mt *= 24;
        /* falls through */
        case "H":
          mt *= 60;
        /* falls through */
        case "M":
          if (!time) throw new Error("Unsupported ISO Duration Field: M");
          else mt *= 60;
        /* falls through */
        case "S":
          break;
      }
      sec += mt * parseInt(m[i], 10);
    }
    return sec;
  }
  var good_pd_date_1 = /* @__PURE__ */ new Date("2017-02-19T19:06:09.000Z");
  var good_pd_date = /* @__PURE__ */ isNaN(/* @__PURE__ */ good_pd_date_1.getFullYear()) ? /* @__PURE__ */ new Date("2/19/17") : good_pd_date_1;
  var good_pd = /* @__PURE__ */ good_pd_date.getFullYear() == 2017;
  function parseDate(str, fixdate) {
    var d = new Date(str);
    if (good_pd) {
      if (fixdate > 0) d.setTime(d.getTime() + d.getTimezoneOffset() * 60 * 1e3);
      else if (fixdate < 0) d.setTime(d.getTime() - d.getTimezoneOffset() * 60 * 1e3);
      return d;
    }
    if (str instanceof Date) return str;
    if (good_pd_date.getFullYear() == 1917 && !isNaN(d.getFullYear())) {
      var s = d.getFullYear();
      if (str.indexOf("" + s) > -1) return d;
      d.setFullYear(d.getFullYear() + 100);
      return d;
    }
    var n = str.match(/\d+/g) || ["2017", "2", "19", "0", "0", "0"];
    var out = new Date(+n[0], +n[1] - 1, +n[2], +n[3] || 0, +n[4] || 0, +n[5] || 0);
    if (str.indexOf("Z") > -1) out = new Date(out.getTime() - out.getTimezoneOffset() * 60 * 1e3);
    return out;
  }
  function cc2str(arr, debomit) {
    if (has_buf && Buffer.isBuffer(arr)) {
      if (debomit) {
        if (arr[0] == 255 && arr[1] == 254) return utf8write(arr.slice(2).toString("utf16le"));
        if (arr[1] == 254 && arr[2] == 255) return utf8write(utf16beread(arr.slice(2).toString("binary")));
      }
      return arr.toString("binary");
    }
    if (typeof TextDecoder !== "undefined") try {
      if (debomit) {
        if (arr[0] == 255 && arr[1] == 254) return utf8write(new TextDecoder("utf-16le").decode(arr.slice(2)));
        if (arr[0] == 254 && arr[1] == 255) return utf8write(new TextDecoder("utf-16be").decode(arr.slice(2)));
      }
      var rev = {
        "\u20AC": "\x80",
        "\u201A": "\x82",
        "\u0192": "\x83",
        "\u201E": "\x84",
        "\u2026": "\x85",
        "\u2020": "\x86",
        "\u2021": "\x87",
        "\u02C6": "\x88",
        "\u2030": "\x89",
        "\u0160": "\x8A",
        "\u2039": "\x8B",
        "\u0152": "\x8C",
        "\u017D": "\x8E",
        "\u2018": "\x91",
        "\u2019": "\x92",
        "\u201C": "\x93",
        "\u201D": "\x94",
        "\u2022": "\x95",
        "\u2013": "\x96",
        "\u2014": "\x97",
        "\u02DC": "\x98",
        "\u2122": "\x99",
        "\u0161": "\x9A",
        "\u203A": "\x9B",
        "\u0153": "\x9C",
        "\u017E": "\x9E",
        "\u0178": "\x9F"
      };
      if (Array.isArray(arr)) arr = new Uint8Array(arr);
      return new TextDecoder("latin1").decode(arr).replace(/[€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, function(c) {
        return rev[c] || c;
      });
    } catch (e) {
    }
    var o = [];
    for (var i = 0; i != arr.length; ++i) o.push(String.fromCharCode(arr[i]));
    return o.join("");
  }
  function dup(o) {
    if (typeof JSON != "undefined" && !Array.isArray(o)) return JSON.parse(JSON.stringify(o));
    if (typeof o != "object" || o == null) return o;
    if (o instanceof Date) return new Date(o.getTime());
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = dup(o[k]);
    return out;
  }
  function fill(c, l) {
    var o = "";
    while (o.length < l) o += c;
    return o;
  }
  function fuzzynum(s) {
    var v = Number(s);
    if (!isNaN(v)) return isFinite(v) ? v : NaN;
    if (!/\d/.test(s)) return v;
    var wt = 1;
    var ss = s.replace(/([\d]),([\d])/g, "$1$2").replace(/[$]/g, "").replace(/[%]/g, function() {
      wt *= 100;
      return "";
    });
    if (!isNaN(v = Number(ss))) return v / wt;
    ss = ss.replace(/[(](.*)[)]/, function($$, $1) {
      wt = -wt;
      return $1;
    });
    if (!isNaN(v = Number(ss))) return v / wt;
    return v;
  }
  var lower_months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  function fuzzydate(s) {
    var o = new Date(s), n = /* @__PURE__ */ new Date(NaN);
    var y = o.getYear(), m = o.getMonth(), d = o.getDate();
    if (isNaN(d)) return n;
    var lower = s.toLowerCase();
    if (lower.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/)) {
      lower = lower.replace(/[^a-z]/g, "").replace(/([^a-z]|^)[ap]m?([^a-z]|$)/, "");
      if (lower.length > 3 && lower_months.indexOf(lower) == -1) return n;
    } else if (lower.match(/[a-z]/)) return n;
    if (y < 0 || y > 8099) return n;
    if ((m > 0 || d > 1) && y != 101) return o;
    if (s.match(/[^-0-9:,\/\\]/)) return n;
    return o;
  }
  var split_regex = /* @__PURE__ */ function() {
    var safe_split_regex = "abacaba".split(/(:?b)/i).length == 5;
    return function split_regex2(str, re, def) {
      if (safe_split_regex || typeof re == "string") return str.split(re);
      var p = str.split(re), o = [p[0]];
      for (var i = 1; i < p.length; ++i) {
        o.push(def);
        o.push(p[i]);
      }
      return o;
    };
  }();
  function getdatastr(data) {
    if (!data) return null;
    if (data.content && data.type) return cc2str(data.content, true);
    if (data.data) return debom(data.data);
    if (data.asNodeBuffer && has_buf) return debom(data.asNodeBuffer().toString("binary"));
    if (data.asBinary) return debom(data.asBinary());
    if (data._data && data._data.getContent) return debom(cc2str(Array.prototype.slice.call(data._data.getContent(), 0)));
    return null;
  }
  function getdatabin(data) {
    if (!data) return null;
    if (data.data) return char_codes(data.data);
    if (data.asNodeBuffer && has_buf) return data.asNodeBuffer();
    if (data._data && data._data.getContent) {
      var o = data._data.getContent();
      if (typeof o == "string") return char_codes(o);
      return Array.prototype.slice.call(o);
    }
    if (data.content && data.type) return data.content;
    return null;
  }
  function getdata(data) {
    return data && data.name.slice(-4) === ".bin" ? getdatabin(data) : getdatastr(data);
  }
  function safegetzipfile(zip, file) {
    var k = zip.FullPaths || keys(zip.files);
    var f = file.toLowerCase().replace(/[\/]/g, "\\"), g = f.replace(/\\/g, "/");
    for (var i = 0; i < k.length; ++i) {
      var n = k[i].replace(/^Root Entry[\/]/, "").toLowerCase();
      if (f == n || g == n) return zip.files ? zip.files[k[i]] : zip.FileIndex[i];
    }
    return null;
  }
  function getzipfile(zip, file) {
    var o = safegetzipfile(zip, file);
    if (o == null) throw new Error("Cannot find file " + file + " in zip");
    return o;
  }
  function getzipdata(zip, file, safe) {
    if (!safe) return getdata(getzipfile(zip, file));
    if (!file) return null;
    try {
      return getzipdata(zip, file);
    } catch (e) {
      return null;
    }
  }
  function getzipstr(zip, file, safe) {
    if (!safe) return getdatastr(getzipfile(zip, file));
    if (!file) return null;
    try {
      return getzipstr(zip, file);
    } catch (e) {
      return null;
    }
  }
  function getzipbin(zip, file, safe) {
    if (!safe) return getdatabin(getzipfile(zip, file));
    if (!file) return null;
    try {
      return getzipbin(zip, file);
    } catch (e) {
      return null;
    }
  }
  function zipentries(zip) {
    var k = zip.FullPaths || keys(zip.files), o = [];
    for (var i = 0; i < k.length; ++i) if (k[i].slice(-1) != "/") o.push(k[i].replace(/^Root Entry[\/]/, ""));
    return o.sort();
  }
  function zip_add_file(zip, path, content) {
    if (zip.FullPaths) {
      if (typeof content == "string") {
        var res;
        if (has_buf) res = Buffer_from(content);
        else res = utf8decode(content);
        return CFB.utils.cfb_add(zip, path, res);
      }
      CFB.utils.cfb_add(zip, path, content);
    } else zip.file(path, content);
  }
  function zip_read(d, o) {
    switch (o.type) {
      case "base64":
        return CFB.read(d, { type: "base64" });
      case "binary":
        return CFB.read(d, { type: "binary" });
      case "buffer":
      case "array":
        return CFB.read(d, { type: "buffer" });
    }
    throw new Error("Unrecognized type " + o.type);
  }
  function resolve_path(path, base) {
    if (path.charAt(0) == "/") return path.slice(1);
    var result = base.split("/");
    if (base.slice(-1) != "/") result.pop();
    var target = path.split("/");
    while (target.length !== 0) {
      var step = target.shift();
      if (step === "..") result.pop();
      else if (step !== ".") result.push(step);
    }
    return result.join("/");
  }
  var XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  var attregexg = /([^"\s?>\/]+)\s*=\s*((?:")([^"]*)(?:")|(?:')([^']*)(?:')|([^'">\s]+))/g;
  var tagregex1 = /<[\/\?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?>\/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s=]+))*\s*[\/\?]?>/mg;
  var tagregex2 = /<[^>]*>/g;
  var tagregex = /* @__PURE__ */ XML_HEADER.match(tagregex1) ? tagregex1 : tagregex2;
  var nsregex = /<\w*:/;
  var nsregex2 = /<(\/?)\w+:/;
  function parsexmltag(tag, skip_root, skip_LC) {
    var z = {};
    var eq = 0, c = 0;
    for (; eq !== tag.length; ++eq) if ((c = tag.charCodeAt(eq)) === 32 || c === 10 || c === 13) break;
    if (!skip_root) z[0] = tag.slice(0, eq);
    if (eq === tag.length) return z;
    var m = tag.match(attregexg), j = 0, v = "", i = 0, q = "", cc = "", quot = 1;
    if (m) for (i = 0; i != m.length; ++i) {
      cc = m[i];
      for (c = 0; c != cc.length; ++c) if (cc.charCodeAt(c) === 61) break;
      q = cc.slice(0, c).trim();
      while (cc.charCodeAt(c + 1) == 32) ++c;
      quot = (eq = cc.charCodeAt(c + 1)) == 34 || eq == 39 ? 1 : 0;
      v = cc.slice(c + 1 + quot, cc.length - quot);
      for (j = 0; j != q.length; ++j) if (q.charCodeAt(j) === 58) break;
      if (j === q.length) {
        if (q.indexOf("_") > 0) q = q.slice(0, q.indexOf("_"));
        z[q] = v;
        if (!skip_LC) z[q.toLowerCase()] = v;
      } else {
        var k = (j === 5 && q.slice(0, 5) === "xmlns" ? "xmlns" : "") + q.slice(j + 1);
        if (z[k] && q.slice(j - 3, j) == "ext") continue;
        z[k] = v;
        if (!skip_LC) z[k.toLowerCase()] = v;
      }
    }
    return z;
  }
  function strip_ns(x) {
    return x.replace(nsregex2, "<$1");
  }
  var encodings = {
    "&quot;": '"',
    "&apos;": "'",
    "&gt;": ">",
    "&lt;": "<",
    "&amp;": "&"
  };
  var rencoding = /* @__PURE__ */ evert(encodings);
  var unescapexml = /* @__PURE__ */ function() {
    var encregex = /&(?:quot|apos|gt|lt|amp|#x?([\da-fA-F]+));/ig, coderegex = /_x([\da-fA-F]{4})_/ig;
    return function unescapexml2(text) {
      var s = text + "", i = s.indexOf("<![CDATA[");
      if (i == -1) return s.replace(encregex, function($$, $1) {
        return encodings[$$] || String.fromCharCode(parseInt($1, $$.indexOf("x") > -1 ? 16 : 10)) || $$;
      }).replace(coderegex, function(m, c) {
        return String.fromCharCode(parseInt(c, 16));
      });
      var j = s.indexOf("]]>");
      return unescapexml2(s.slice(0, i)) + s.slice(i + 9, j) + unescapexml2(s.slice(j + 3));
    };
  }();
  var decregex = /[&<>'"]/g;
  var htmlcharegex = /[\u0000-\u001f]/g;
  function escapehtml(text) {
    var s = text + "";
    return s.replace(decregex, function(y) {
      return rencoding[y];
    }).replace(/\n/g, "<br/>").replace(htmlcharegex, function(s2) {
      return "&#x" + ("000" + s2.charCodeAt(0).toString(16)).slice(-4) + ";";
    });
  }
  var xlml_fixstr = /* @__PURE__ */ function() {
    var entregex = /&#(\d+);/g;
    function entrepl($$, $1) {
      return String.fromCharCode(parseInt($1, 10));
    }
    return function xlml_fixstr2(str) {
      return str.replace(entregex, entrepl);
    };
  }();
  function parsexmlbool(value) {
    switch (value) {
      case 1:
      case true:
      case "1":
      case "true":
      case "TRUE":
        return true;
      /* case '0': case 'false': case 'FALSE':*/
      default:
        return false;
    }
  }
  function utf8reada(orig) {
    var out = "", i = 0, c = 0, d = 0, e = 0, f = 0, w = 0;
    while (i < orig.length) {
      c = orig.charCodeAt(i++);
      if (c < 128) {
        out += String.fromCharCode(c);
        continue;
      }
      d = orig.charCodeAt(i++);
      if (c > 191 && c < 224) {
        f = (c & 31) << 6;
        f |= d & 63;
        out += String.fromCharCode(f);
        continue;
      }
      e = orig.charCodeAt(i++);
      if (c < 240) {
        out += String.fromCharCode((c & 15) << 12 | (d & 63) << 6 | e & 63);
        continue;
      }
      f = orig.charCodeAt(i++);
      w = ((c & 7) << 18 | (d & 63) << 12 | (e & 63) << 6 | f & 63) - 65536;
      out += String.fromCharCode(55296 + (w >>> 10 & 1023));
      out += String.fromCharCode(56320 + (w & 1023));
    }
    return out;
  }
  function utf8readb(data) {
    var out = new_raw_buf(2 * data.length), w, i, j = 1, k = 0, ww = 0, c;
    for (i = 0; i < data.length; i += j) {
      j = 1;
      if ((c = data.charCodeAt(i)) < 128) w = c;
      else if (c < 224) {
        w = (c & 31) * 64 + (data.charCodeAt(i + 1) & 63);
        j = 2;
      } else if (c < 240) {
        w = (c & 15) * 4096 + (data.charCodeAt(i + 1) & 63) * 64 + (data.charCodeAt(i + 2) & 63);
        j = 3;
      } else {
        j = 4;
        w = (c & 7) * 262144 + (data.charCodeAt(i + 1) & 63) * 4096 + (data.charCodeAt(i + 2) & 63) * 64 + (data.charCodeAt(i + 3) & 63);
        w -= 65536;
        ww = 55296 + (w >>> 10 & 1023);
        w = 56320 + (w & 1023);
      }
      if (ww !== 0) {
        out[k++] = ww & 255;
        out[k++] = ww >>> 8;
        ww = 0;
      }
      out[k++] = w % 256;
      out[k++] = w >>> 8;
    }
    return out.slice(0, k).toString("ucs2");
  }
  function utf8readc(data) {
    return Buffer_from(data, "binary").toString("utf8");
  }
  var utf8corpus = "foo bar baz\xE2\x98\x83\xF0\x9F\x8D\xA3";
  var utf8read = has_buf && (/* @__PURE__ */ utf8readc(utf8corpus) == /* @__PURE__ */ utf8reada(utf8corpus) && utf8readc || /* @__PURE__ */ utf8readb(utf8corpus) == /* @__PURE__ */ utf8reada(utf8corpus) && utf8readb) || utf8reada;
  var utf8write = has_buf ? function(data) {
    return Buffer_from(data, "utf8").toString("binary");
  } : function(orig) {
    var out = [], i = 0, c = 0, d = 0;
    while (i < orig.length) {
      c = orig.charCodeAt(i++);
      switch (true) {
        case c < 128:
          out.push(String.fromCharCode(c));
          break;
        case c < 2048:
          out.push(String.fromCharCode(192 + (c >> 6)));
          out.push(String.fromCharCode(128 + (c & 63)));
          break;
        case (c >= 55296 && c < 57344):
          c -= 55296;
          d = orig.charCodeAt(i++) - 56320 + (c << 10);
          out.push(String.fromCharCode(240 + (d >> 18 & 7)));
          out.push(String.fromCharCode(144 + (d >> 12 & 63)));
          out.push(String.fromCharCode(128 + (d >> 6 & 63)));
          out.push(String.fromCharCode(128 + (d & 63)));
          break;
        default:
          out.push(String.fromCharCode(224 + (c >> 12)));
          out.push(String.fromCharCode(128 + (c >> 6 & 63)));
          out.push(String.fromCharCode(128 + (c & 63)));
      }
    }
    return out.join("");
  };
  var matchtag = /* @__PURE__ */ function() {
    var mtcache = {};
    return function matchtag2(f, g) {
      var t = f + "|" + (g || "");
      if (mtcache[t]) return mtcache[t];
      return mtcache[t] = new RegExp("<(?:\\w+:)?" + f + '(?: xml:space="preserve")?(?:[^>]*)>([\\s\\S]*?)</(?:\\w+:)?' + f + ">", g || "");
    };
  }();
  var htmldecode = /* @__PURE__ */ function() {
    var entities = [
      ["nbsp", " "],
      ["middot", "\xB7"],
      ["quot", '"'],
      ["apos", "'"],
      ["gt", ">"],
      ["lt", "<"],
      ["amp", "&"]
    ].map(function(x) {
      return [new RegExp("&" + x[0] + ";", "ig"), x[1]];
    });
    return function htmldecode2(str) {
      var o = str.replace(/^[\t\n\r ]+/, "").replace(/[\t\n\r ]+$/, "").replace(/>\s+/g, ">").replace(/\s+</g, "<").replace(/[\t\n\r ]+/g, " ").replace(/<\s*[bB][rR]\s*\/?>/g, "\n").replace(/<[^>]*>/g, "");
      for (var i = 0; i < entities.length; ++i) o = o.replace(entities[i][0], entities[i][1]);
      return o;
    };
  }();
  var vtregex = /* @__PURE__ */ function() {
    var vt_cache = {};
    return function vt_regex(bt) {
      if (vt_cache[bt] !== void 0) return vt_cache[bt];
      return vt_cache[bt] = new RegExp("<(?:vt:)?" + bt + ">([\\s\\S]*?)</(?:vt:)?" + bt + ">", "g");
    };
  }();
  var vtvregex = /<\/?(?:vt:)?variant>/g;
  var vtmregex = /<(?:vt:)([^>]*)>([\s\S]*)</;
  function parseVector(data, opts) {
    var h = parsexmltag(data);
    var matches = data.match(vtregex(h.baseType)) || [];
    var res = [];
    if (matches.length != h.size) {
      if (opts.WTF) throw new Error("unexpected vector length " + matches.length + " != " + h.size);
      return res;
    }
    matches.forEach(function(x) {
      var v = x.replace(vtvregex, "").match(vtmregex);
      if (v) res.push({ v: utf8read(v[2]), t: v[1] });
    });
    return res;
  }
  var wtregex = /(^\s|\s$|\n)/;
  function wxt_helper(h) {
    return keys(h).map(function(k) {
      return " " + k + '="' + h[k] + '"';
    }).join("");
  }
  function writextag(f, g, h) {
    return "<" + f + (h != null ? wxt_helper(h) : "") + (g != null ? (g.match(wtregex) ? ' xml:space="preserve"' : "") + ">" + g + "</" + f : "/") + ">";
  }
  function xlml_normalize(d) {
    if (has_buf && /*::typeof Buffer !== "undefined" && d != null && d instanceof Buffer &&*/
    Buffer.isBuffer(d)) return d.toString("utf8");
    if (typeof d === "string") return d;
    if (typeof Uint8Array !== "undefined" && d instanceof Uint8Array) return utf8read(a2s(ab2a(d)));
    throw new Error("Bad input format: expected Buffer or string");
  }
  var xlmlregex = /<(\/?)([^\s?><!\/:]*:|)([^\s?<>:\/]+)(?:[\s?:\/][^>]*)?>/mg;
  var XMLNS = {
    CORE_PROPS: "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    CUST_PROPS: "http://schemas.openxmlformats.org/officeDocument/2006/custom-properties",
    EXT_PROPS: "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
    CT: "http://schemas.openxmlformats.org/package/2006/content-types",
    RELS: "http://schemas.openxmlformats.org/package/2006/relationships",
    TCMNT: "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments",
    "dc": "http://purl.org/dc/elements/1.1/",
    "dcterms": "http://purl.org/dc/terms/",
    "dcmitype": "http://purl.org/dc/dcmitype/",
    "mx": "http://schemas.microsoft.com/office/mac/excel/2008/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "sjs": "http://schemas.openxmlformats.org/package/2006/sheetjs/core-properties",
    "vt": "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance",
    "xsd": "http://www.w3.org/2001/XMLSchema"
  };
  var XMLNS_main = [
    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "http://purl.oclc.org/ooxml/spreadsheetml/main",
    "http://schemas.microsoft.com/office/excel/2006/main",
    "http://schemas.microsoft.com/office/excel/2006/2"
  ];
  function read_double_le(b, idx) {
    var s = 1 - 2 * (b[idx + 7] >>> 7);
    var e = ((b[idx + 7] & 127) << 4) + (b[idx + 6] >>> 4 & 15);
    var m = b[idx + 6] & 15;
    for (var i = 5; i >= 0; --i) m = m * 256 + b[idx + i];
    if (e == 2047) return m == 0 ? s * Infinity : NaN;
    if (e == 0) e = -1022;
    else {
      e -= 1023;
      m += Math.pow(2, 52);
    }
    return s * Math.pow(2, e - 52) * m;
  }
  function write_double_le(b, v, idx) {
    var bs = (v < 0 || 1 / v == -Infinity ? 1 : 0) << 7, e = 0, m = 0;
    var av = bs ? -v : v;
    if (!isFinite(av)) {
      e = 2047;
      m = isNaN(v) ? 26985 : 0;
    } else if (av == 0) e = m = 0;
    else {
      e = Math.floor(Math.log(av) / Math.LN2);
      m = av * Math.pow(2, 52 - e);
      if (e <= -1023 && (!isFinite(m) || m < Math.pow(2, 52))) {
        e = -1022;
      } else {
        m -= Math.pow(2, 52);
        e += 1023;
      }
    }
    for (var i = 0; i <= 5; ++i, m /= 256) b[idx + i] = m & 255;
    b[idx + 6] = (e & 15) << 4 | m & 15;
    b[idx + 7] = e >> 4 | bs;
  }
  var ___toBuffer = function(bufs) {
    var x = [], w = 10240;
    for (var i = 0; i < bufs[0].length; ++i) if (bufs[0][i]) for (var j = 0, L = bufs[0][i].length; j < L; j += w) x.push.apply(x, bufs[0][i].slice(j, j + w));
    return x;
  };
  var __toBuffer = has_buf ? function(bufs) {
    return bufs[0].length > 0 && Buffer.isBuffer(bufs[0][0]) ? Buffer.concat(bufs[0].map(function(x) {
      return Buffer.isBuffer(x) ? x : Buffer_from(x);
    })) : ___toBuffer(bufs);
  } : ___toBuffer;
  var ___utf16le = function(b, s, e) {
    var ss = [];
    for (var i = s; i < e; i += 2) ss.push(String.fromCharCode(__readUInt16LE(b, i)));
    return ss.join("").replace(chr0, "");
  };
  var __utf16le = has_buf ? function(b, s, e) {
    if (!Buffer.isBuffer(b)) return ___utf16le(b, s, e);
    return b.toString("utf16le", s, e).replace(chr0, "");
  } : ___utf16le;
  var ___hexlify = function(b, s, l) {
    var ss = [];
    for (var i = s; i < s + l; ++i) ss.push(("0" + b[i].toString(16)).slice(-2));
    return ss.join("");
  };
  var __hexlify = has_buf ? function(b, s, l) {
    return Buffer.isBuffer(b) ? b.toString("hex", s, s + l) : ___hexlify(b, s, l);
  } : ___hexlify;
  var ___utf8 = function(b, s, e) {
    var ss = [];
    for (var i = s; i < e; i++) ss.push(String.fromCharCode(__readUInt8(b, i)));
    return ss.join("");
  };
  var __utf8 = has_buf ? function utf8_b(b, s, e) {
    return Buffer.isBuffer(b) ? b.toString("utf8", s, e) : ___utf8(b, s, e);
  } : ___utf8;
  var ___lpstr = function(b, i) {
    var len = __readUInt32LE(b, i);
    return len > 0 ? __utf8(b, i + 4, i + 4 + len - 1) : "";
  };
  var __lpstr = ___lpstr;
  var ___cpstr = function(b, i) {
    var len = __readUInt32LE(b, i);
    return len > 0 ? __utf8(b, i + 4, i + 4 + len - 1) : "";
  };
  var __cpstr = ___cpstr;
  var ___lpwstr = function(b, i) {
    var len = 2 * __readUInt32LE(b, i);
    return len > 0 ? __utf8(b, i + 4, i + 4 + len - 1) : "";
  };
  var __lpwstr = ___lpwstr;
  var ___lpp4 = function lpp4_(b, i) {
    var len = __readUInt32LE(b, i);
    return len > 0 ? __utf16le(b, i + 4, i + 4 + len) : "";
  };
  var __lpp4 = ___lpp4;
  var ___8lpp4 = function(b, i) {
    var len = __readUInt32LE(b, i);
    return len > 0 ? __utf8(b, i + 4, i + 4 + len) : "";
  };
  var __8lpp4 = ___8lpp4;
  var ___double = function(b, idx) {
    return read_double_le(b, idx);
  };
  var __double = ___double;
  var is_buf = function is_buf_a(a) {
    return Array.isArray(a) || typeof Uint8Array !== "undefined" && a instanceof Uint8Array;
  };
  if (has_buf) {
    __lpstr = function lpstr_b(b, i) {
      if (!Buffer.isBuffer(b)) return ___lpstr(b, i);
      var len = b.readUInt32LE(i);
      return len > 0 ? b.toString("utf8", i + 4, i + 4 + len - 1) : "";
    };
    __cpstr = function cpstr_b(b, i) {
      if (!Buffer.isBuffer(b)) return ___cpstr(b, i);
      var len = b.readUInt32LE(i);
      return len > 0 ? b.toString("utf8", i + 4, i + 4 + len - 1) : "";
    };
    __lpwstr = function lpwstr_b(b, i) {
      if (!Buffer.isBuffer(b)) return ___lpwstr(b, i);
      var len = 2 * b.readUInt32LE(i);
      return b.toString("utf16le", i + 4, i + 4 + len - 1);
    };
    __lpp4 = function lpp4_b(b, i) {
      if (!Buffer.isBuffer(b)) return ___lpp4(b, i);
      var len = b.readUInt32LE(i);
      return b.toString("utf16le", i + 4, i + 4 + len);
    };
    __8lpp4 = function lpp4_8b(b, i) {
      if (!Buffer.isBuffer(b)) return ___8lpp4(b, i);
      var len = b.readUInt32LE(i);
      return b.toString("utf8", i + 4, i + 4 + len);
    };
    __double = function double_(b, i) {
      if (Buffer.isBuffer(b)) return b.readDoubleLE(i);
      return ___double(b, i);
    };
    is_buf = function is_buf_b(a) {
      return Buffer.isBuffer(a) || Array.isArray(a) || typeof Uint8Array !== "undefined" && a instanceof Uint8Array;
    };
  }
  function cpdoit() {
    __utf16le = function(b, s, e) {
      return $cptable.utils.decode(1200, b.slice(s, e)).replace(chr0, "");
    };
    __utf8 = function(b, s, e) {
      return $cptable.utils.decode(65001, b.slice(s, e));
    };
    __lpstr = function(b, i) {
      var len = __readUInt32LE(b, i);
      return len > 0 ? $cptable.utils.decode(current_ansi, b.slice(i + 4, i + 4 + len - 1)) : "";
    };
    __cpstr = function(b, i) {
      var len = __readUInt32LE(b, i);
      return len > 0 ? $cptable.utils.decode(current_codepage, b.slice(i + 4, i + 4 + len - 1)) : "";
    };
    __lpwstr = function(b, i) {
      var len = 2 * __readUInt32LE(b, i);
      return len > 0 ? $cptable.utils.decode(1200, b.slice(i + 4, i + 4 + len - 1)) : "";
    };
    __lpp4 = function(b, i) {
      var len = __readUInt32LE(b, i);
      return len > 0 ? $cptable.utils.decode(1200, b.slice(i + 4, i + 4 + len)) : "";
    };
    __8lpp4 = function(b, i) {
      var len = __readUInt32LE(b, i);
      return len > 0 ? $cptable.utils.decode(65001, b.slice(i + 4, i + 4 + len)) : "";
    };
  }
  if (typeof $cptable !== "undefined") cpdoit();
  var __readUInt8 = function(b, idx) {
    return b[idx];
  };
  var __readUInt16LE = function(b, idx) {
    return b[idx + 1] * (1 << 8) + b[idx];
  };
  var __readInt16LE = function(b, idx) {
    var u = b[idx + 1] * (1 << 8) + b[idx];
    return u < 32768 ? u : (65535 - u + 1) * -1;
  };
  var __readUInt32LE = function(b, idx) {
    return b[idx + 3] * (1 << 24) + (b[idx + 2] << 16) + (b[idx + 1] << 8) + b[idx];
  };
  var __readInt32LE = function(b, idx) {
    return b[idx + 3] << 24 | b[idx + 2] << 16 | b[idx + 1] << 8 | b[idx];
  };
  var __readInt32BE = function(b, idx) {
    return b[idx] << 24 | b[idx + 1] << 16 | b[idx + 2] << 8 | b[idx + 3];
  };
  function ReadShift(size, t) {
    var o = "", oI, oR, oo = [], w, vv, i, loc;
    switch (t) {
      case "dbcs":
        loc = this.l;
        if (has_buf && Buffer.isBuffer(this)) o = this.slice(this.l, this.l + 2 * size).toString("utf16le");
        else for (i = 0; i < size; ++i) {
          o += String.fromCharCode(__readUInt16LE(this, loc));
          loc += 2;
        }
        size *= 2;
        break;
      case "utf8":
        o = __utf8(this, this.l, this.l + size);
        break;
      case "utf16le":
        size *= 2;
        o = __utf16le(this, this.l, this.l + size);
        break;
      case "wstr":
        if (typeof $cptable !== "undefined") o = $cptable.utils.decode(current_codepage, this.slice(this.l, this.l + 2 * size));
        else return ReadShift.call(this, size, "dbcs");
        size = 2 * size;
        break;
      /* [MS-OLEDS] 2.1.4 LengthPrefixedAnsiString */
      case "lpstr-ansi":
        o = __lpstr(this, this.l);
        size = 4 + __readUInt32LE(this, this.l);
        break;
      case "lpstr-cp":
        o = __cpstr(this, this.l);
        size = 4 + __readUInt32LE(this, this.l);
        break;
      /* [MS-OLEDS] 2.1.5 LengthPrefixedUnicodeString */
      case "lpwstr":
        o = __lpwstr(this, this.l);
        size = 4 + 2 * __readUInt32LE(this, this.l);
        break;
      /* [MS-OFFCRYPTO] 2.1.2 Length-Prefixed Padded Unicode String (UNICODE-LP-P4) */
      case "lpp4":
        size = 4 + __readUInt32LE(this, this.l);
        o = __lpp4(this, this.l);
        if (size & 2) size += 2;
        break;
      /* [MS-OFFCRYPTO] 2.1.3 Length-Prefixed UTF-8 String (UTF-8-LP-P4) */
      case "8lpp4":
        size = 4 + __readUInt32LE(this, this.l);
        o = __8lpp4(this, this.l);
        if (size & 3) size += 4 - (size & 3);
        break;
      case "cstr":
        size = 0;
        o = "";
        while ((w = __readUInt8(this, this.l + size++)) !== 0) oo.push(_getchar(w));
        o = oo.join("");
        break;
      case "_wstr":
        size = 0;
        o = "";
        while ((w = __readUInt16LE(this, this.l + size)) !== 0) {
          oo.push(_getchar(w));
          size += 2;
        }
        size += 2;
        o = oo.join("");
        break;
      /* sbcs and dbcs support continue records in the SST way TODO codepages */
      case "dbcs-cont":
        o = "";
        loc = this.l;
        for (i = 0; i < size; ++i) {
          if (this.lens && this.lens.indexOf(loc) !== -1) {
            w = __readUInt8(this, loc);
            this.l = loc + 1;
            vv = ReadShift.call(this, size - i, w ? "dbcs-cont" : "sbcs-cont");
            return oo.join("") + vv;
          }
          oo.push(_getchar(__readUInt16LE(this, loc)));
          loc += 2;
        }
        o = oo.join("");
        size *= 2;
        break;
      case "cpstr":
        if (typeof $cptable !== "undefined") {
          o = $cptable.utils.decode(current_codepage, this.slice(this.l, this.l + size));
          break;
        }
      /* falls through */
      case "sbcs-cont":
        o = "";
        loc = this.l;
        for (i = 0; i != size; ++i) {
          if (this.lens && this.lens.indexOf(loc) !== -1) {
            w = __readUInt8(this, loc);
            this.l = loc + 1;
            vv = ReadShift.call(this, size - i, w ? "dbcs-cont" : "sbcs-cont");
            return oo.join("") + vv;
          }
          oo.push(_getchar(__readUInt8(this, loc)));
          loc += 1;
        }
        o = oo.join("");
        break;
      default:
        switch (size) {
          case 1:
            oI = __readUInt8(this, this.l);
            this.l++;
            return oI;
          case 2:
            oI = (t === "i" ? __readInt16LE : __readUInt16LE)(this, this.l);
            this.l += 2;
            return oI;
          case 4:
          case -4:
            if (t === "i" || (this[this.l + 3] & 128) === 0) {
              oI = (size > 0 ? __readInt32LE : __readInt32BE)(this, this.l);
              this.l += 4;
              return oI;
            } else {
              oR = __readUInt32LE(this, this.l);
              this.l += 4;
            }
            return oR;
          case 8:
          case -8:
            if (t === "f") {
              if (size == 8) oR = __double(this, this.l);
              else oR = __double([this[this.l + 7], this[this.l + 6], this[this.l + 5], this[this.l + 4], this[this.l + 3], this[this.l + 2], this[this.l + 1], this[this.l + 0]], 0);
              this.l += 8;
              return oR;
            } else size = 8;
          /* falls through */
          case 16:
            o = __hexlify(this, this.l, size);
            break;
        }
    }
    this.l += size;
    return o;
  }
  var __writeUInt32LE = function(b, val, idx) {
    b[idx] = val & 255;
    b[idx + 1] = val >>> 8 & 255;
    b[idx + 2] = val >>> 16 & 255;
    b[idx + 3] = val >>> 24 & 255;
  };
  var __writeInt32LE = function(b, val, idx) {
    b[idx] = val & 255;
    b[idx + 1] = val >> 8 & 255;
    b[idx + 2] = val >> 16 & 255;
    b[idx + 3] = val >> 24 & 255;
  };
  var __writeUInt16LE = function(b, val, idx) {
    b[idx] = val & 255;
    b[idx + 1] = val >>> 8 & 255;
  };
  function WriteShift(t, val, f) {
    var size = 0, i = 0;
    if (f === "dbcs") {
      for (i = 0; i != val.length; ++i) __writeUInt16LE(this, val.charCodeAt(i), this.l + 2 * i);
      size = 2 * val.length;
    } else if (f === "sbcs") {
      if (typeof $cptable !== "undefined" && current_ansi == 874) {
        for (i = 0; i != val.length; ++i) {
          var cppayload = $cptable.utils.encode(current_ansi, val.charAt(i));
          this[this.l + i] = cppayload[0];
        }
      } else {
        val = val.replace(/[^\x00-\x7F]/g, "_");
        for (i = 0; i != val.length; ++i) this[this.l + i] = val.charCodeAt(i) & 255;
      }
      size = val.length;
    } else if (f === "hex") {
      for (; i < t; ++i) {
        this[this.l++] = parseInt(val.slice(2 * i, 2 * i + 2), 16) || 0;
      }
      return this;
    } else if (f === "utf16le") {
      var end = Math.min(this.l + t, this.length);
      for (i = 0; i < Math.min(val.length, t); ++i) {
        var cc = val.charCodeAt(i);
        this[this.l++] = cc & 255;
        this[this.l++] = cc >> 8;
      }
      while (this.l < end) this[this.l++] = 0;
      return this;
    } else switch (t) {
      case 1:
        size = 1;
        this[this.l] = val & 255;
        break;
      case 2:
        size = 2;
        this[this.l] = val & 255;
        val >>>= 8;
        this[this.l + 1] = val & 255;
        break;
      case 3:
        size = 3;
        this[this.l] = val & 255;
        val >>>= 8;
        this[this.l + 1] = val & 255;
        val >>>= 8;
        this[this.l + 2] = val & 255;
        break;
      case 4:
        size = 4;
        __writeUInt32LE(this, val, this.l);
        break;
      case 8:
        size = 8;
        if (f === "f") {
          write_double_le(this, val, this.l);
          break;
        }
      /* falls through */
      case 16:
        break;
      case -4:
        size = 4;
        __writeInt32LE(this, val, this.l);
        break;
    }
    this.l += size;
    return this;
  }
  function CheckField(hexstr, fld) {
    var m = __hexlify(this, this.l, hexstr.length >> 1);
    if (m !== hexstr) throw new Error(fld + "Expected " + hexstr + " saw " + m);
    this.l += hexstr.length >> 1;
  }
  function prep_blob(blob, pos) {
    blob.l = pos;
    blob.read_shift = /*::(*/
    ReadShift;
    blob.chk = CheckField;
    blob.write_shift = WriteShift;
  }
  function parsenoop(blob, length) {
    blob.l += length;
  }
  function new_buf(sz) {
    var o = new_raw_buf(sz);
    prep_blob(o, 0);
    return o;
  }
  function recordhopper(data, cb, opts) {
    if (!data) return;
    var tmpbyte, cntbyte, length;
    prep_blob(data, data.l || 0);
    var L = data.length, RT = 0, tgt = 0;
    while (data.l < L) {
      RT = data.read_shift(1);
      if (RT & 128) RT = (RT & 127) + ((data.read_shift(1) & 127) << 7);
      var R = XLSBRecordEnum[RT] || XLSBRecordEnum[65535];
      tmpbyte = data.read_shift(1);
      length = tmpbyte & 127;
      for (cntbyte = 1; cntbyte < 4 && tmpbyte & 128; ++cntbyte) length += ((tmpbyte = data.read_shift(1)) & 127) << 7 * cntbyte;
      tgt = data.l + length;
      var d = R.f && R.f(data, length, opts);
      data.l = tgt;
      if (cb(d, R, RT)) return;
    }
  }
  function buf_array() {
    var bufs = [], blksz = has_buf ? 256 : 2048;
    var newblk = function ba_newblk(sz) {
      var o = new_buf(sz);
      prep_blob(o, 0);
      return o;
    };
    var curbuf = newblk(blksz);
    var endbuf = function ba_endbuf() {
      if (!curbuf) return;
      if (curbuf.length > curbuf.l) {
        curbuf = curbuf.slice(0, curbuf.l);
        curbuf.l = curbuf.length;
      }
      if (curbuf.length > 0) bufs.push(curbuf);
      curbuf = null;
    };
    var next = function ba_next(sz) {
      if (curbuf && sz < curbuf.length - curbuf.l) return curbuf;
      endbuf();
      return curbuf = newblk(Math.max(sz + 1, blksz));
    };
    var end = function ba_end() {
      endbuf();
      return bconcat(bufs);
    };
    var push = function ba_push(buf) {
      endbuf();
      curbuf = buf;
      if (curbuf.l == null) curbuf.l = curbuf.length;
      next(blksz);
    };
    return { next, push, end, _bufs: bufs };
  }
  function shift_cell_xls(cell, tgt, opts) {
    var out = dup(cell);
    if (tgt.s) {
      if (out.cRel) out.c += tgt.s.c;
      if (out.rRel) out.r += tgt.s.r;
    } else {
      if (out.cRel) out.c += tgt.c;
      if (out.rRel) out.r += tgt.r;
    }
    if (!opts || opts.biff < 12) {
      while (out.c >= 256) out.c -= 256;
      while (out.r >= 65536) out.r -= 65536;
    }
    return out;
  }
  function shift_range_xls(cell, range, opts) {
    var out = dup(cell);
    out.s = shift_cell_xls(out.s, range.s, opts);
    out.e = shift_cell_xls(out.e, range.s, opts);
    return out;
  }
  function encode_cell_xls(c, biff) {
    if (c.cRel && c.c < 0) {
      c = dup(c);
      while (c.c < 0) c.c += biff > 8 ? 16384 : 256;
    }
    if (c.rRel && c.r < 0) {
      c = dup(c);
      while (c.r < 0) c.r += biff > 8 ? 1048576 : biff > 5 ? 65536 : 16384;
    }
    var s = encode_cell(c);
    if (!c.cRel && c.cRel != null) s = fix_col(s);
    if (!c.rRel && c.rRel != null) s = fix_row(s);
    return s;
  }
  function encode_range_xls(r, opts) {
    if (r.s.r == 0 && !r.s.rRel) {
      if (r.e.r == (opts.biff >= 12 ? 1048575 : opts.biff >= 8 ? 65536 : 16384) && !r.e.rRel) {
        return (r.s.cRel ? "" : "$") + encode_col(r.s.c) + ":" + (r.e.cRel ? "" : "$") + encode_col(r.e.c);
      }
    }
    if (r.s.c == 0 && !r.s.cRel) {
      if (r.e.c == (opts.biff >= 12 ? 16383 : 255) && !r.e.cRel) {
        return (r.s.rRel ? "" : "$") + encode_row(r.s.r) + ":" + (r.e.rRel ? "" : "$") + encode_row(r.e.r);
      }
    }
    return encode_cell_xls(r.s, opts.biff) + ":" + encode_cell_xls(r.e, opts.biff);
  }
  function decode_row(rowstr) {
    return parseInt(unfix_row(rowstr), 10) - 1;
  }
  function encode_row(row) {
    return "" + (row + 1);
  }
  function fix_row(cstr) {
    return cstr.replace(/([A-Z]|^)(\d+)$/, "$1$$$2");
  }
  function unfix_row(cstr) {
    return cstr.replace(/\$(\d+)$/, "$1");
  }
  function decode_col(colstr) {
    var c = unfix_col(colstr), d = 0, i = 0;
    for (; i !== c.length; ++i) d = 26 * d + c.charCodeAt(i) - 64;
    return d - 1;
  }
  function encode_col(col) {
    if (col < 0) throw new Error("invalid column " + col);
    var s = "";
    for (++col; col; col = Math.floor((col - 1) / 26)) s = String.fromCharCode((col - 1) % 26 + 65) + s;
    return s;
  }
  function fix_col(cstr) {
    return cstr.replace(/^([A-Z])/, "$$$1");
  }
  function unfix_col(cstr) {
    return cstr.replace(/^\$([A-Z])/, "$1");
  }
  function split_cell(cstr) {
    return cstr.replace(/(\$?[A-Z]*)(\$?\d*)/, "$1,$2").split(",");
  }
  function decode_cell(cstr) {
    var R = 0, C = 0;
    for (var i = 0; i < cstr.length; ++i) {
      var cc = cstr.charCodeAt(i);
      if (cc >= 48 && cc <= 57) R = 10 * R + (cc - 48);
      else if (cc >= 65 && cc <= 90) C = 26 * C + (cc - 64);
    }
    return { c: C - 1, r: R - 1 };
  }
  function encode_cell(cell) {
    var col = cell.c + 1;
    var s = "";
    for (; col; col = (col - 1) / 26 | 0) s = String.fromCharCode((col - 1) % 26 + 65) + s;
    return s + (cell.r + 1);
  }
  function decode_range(range) {
    var idx = range.indexOf(":");
    if (idx == -1) return { s: decode_cell(range), e: decode_cell(range) };
    return { s: decode_cell(range.slice(0, idx)), e: decode_cell(range.slice(idx + 1)) };
  }
  function encode_range(cs, ce) {
    if (typeof ce === "undefined" || typeof ce === "number") {
      return encode_range(cs.s, cs.e);
    }
    if (typeof cs !== "string") cs = encode_cell(cs);
    if (typeof ce !== "string") ce = encode_cell(ce);
    return cs == ce ? cs : cs + ":" + ce;
  }
  function safe_decode_range(range) {
    var o = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
    var idx = 0, i = 0, cc = 0;
    var len = range.length;
    for (idx = 0; i < len; ++i) {
      if ((cc = range.charCodeAt(i) - 64) < 1 || cc > 26) break;
      idx = 26 * idx + cc;
    }
    o.s.c = --idx;
    for (idx = 0; i < len; ++i) {
      if ((cc = range.charCodeAt(i) - 48) < 0 || cc > 9) break;
      idx = 10 * idx + cc;
    }
    o.s.r = --idx;
    if (i === len || cc != 10) {
      o.e.c = o.s.c;
      o.e.r = o.s.r;
      return o;
    }
    ++i;
    for (idx = 0; i != len; ++i) {
      if ((cc = range.charCodeAt(i) - 64) < 1 || cc > 26) break;
      idx = 26 * idx + cc;
    }
    o.e.c = --idx;
    for (idx = 0; i != len; ++i) {
      if ((cc = range.charCodeAt(i) - 48) < 0 || cc > 9) break;
      idx = 10 * idx + cc;
    }
    o.e.r = --idx;
    return o;
  }
  function safe_format_cell(cell, v) {
    var q = cell.t == "d" && v instanceof Date;
    if (cell.z != null) try {
      return cell.w = SSF_format(cell.z, q ? datenum(v) : v);
    } catch (e) {
    }
    try {
      return cell.w = SSF_format((cell.XF || {}).numFmtId || (q ? 14 : 0), q ? datenum(v) : v);
    } catch (e) {
      return "" + v;
    }
  }
  function format_cell(cell, v, o) {
    if (cell == null || cell.t == null || cell.t == "z") return "";
    if (cell.w !== void 0) return cell.w;
    if (cell.t == "d" && !cell.z && o && o.dateNF) cell.z = o.dateNF;
    if (cell.t == "e") return BErr[cell.v] || cell.v;
    if (v == void 0) return safe_format_cell(cell, cell.v);
    return safe_format_cell(cell, v);
  }
  function sheet_to_workbook(sheet, opts) {
    var n = opts && opts.sheet ? opts.sheet : "Sheet1";
    var sheets = {};
    sheets[n] = sheet;
    return { SheetNames: [n], Sheets: sheets };
  }
  function sheet_add_aoa(_ws, data, opts) {
    var o = opts || {};
    var dense = _ws ? Array.isArray(_ws) : o.dense;
    if (DENSE != null && dense == null) dense = DENSE;
    var ws = _ws || (dense ? [] : {});
    var _R = 0, _C = 0;
    if (ws && o.origin != null) {
      if (typeof o.origin == "number") _R = o.origin;
      else {
        var _origin = typeof o.origin == "string" ? decode_cell(o.origin) : o.origin;
        _R = _origin.r;
        _C = _origin.c;
      }
      if (!ws["!ref"]) ws["!ref"] = "A1:A1";
    }
    var range = { s: { c: 1e7, r: 1e7 }, e: { c: 0, r: 0 } };
    if (ws["!ref"]) {
      var _range = safe_decode_range(ws["!ref"]);
      range.s.c = _range.s.c;
      range.s.r = _range.s.r;
      range.e.c = Math.max(range.e.c, _range.e.c);
      range.e.r = Math.max(range.e.r, _range.e.r);
      if (_R == -1) range.e.r = _R = _range.e.r + 1;
    }
    for (var R = 0; R != data.length; ++R) {
      if (!data[R]) continue;
      if (!Array.isArray(data[R])) throw new Error("aoa_to_sheet expects an array of arrays");
      for (var C = 0; C != data[R].length; ++C) {
        if (typeof data[R][C] === "undefined") continue;
        var cell = { v: data[R][C] };
        var __R = _R + R, __C = _C + C;
        if (range.s.r > __R) range.s.r = __R;
        if (range.s.c > __C) range.s.c = __C;
        if (range.e.r < __R) range.e.r = __R;
        if (range.e.c < __C) range.e.c = __C;
        if (data[R][C] && typeof data[R][C] === "object" && !Array.isArray(data[R][C]) && !(data[R][C] instanceof Date)) cell = data[R][C];
        else {
          if (Array.isArray(cell.v)) {
            cell.f = data[R][C][1];
            cell.v = cell.v[0];
          }
          if (cell.v === null) {
            if (cell.f) cell.t = "n";
            else if (o.nullError) {
              cell.t = "e";
              cell.v = 0;
            } else if (!o.sheetStubs) continue;
            else cell.t = "z";
          } else if (typeof cell.v === "number") cell.t = "n";
          else if (typeof cell.v === "boolean") cell.t = "b";
          else if (cell.v instanceof Date) {
            cell.z = o.dateNF || table_fmt[14];
            if (o.cellDates) {
              cell.t = "d";
              cell.w = SSF_format(cell.z, datenum(cell.v));
            } else {
              cell.t = "n";
              cell.v = datenum(cell.v);
              cell.w = SSF_format(cell.z, cell.v);
            }
          } else cell.t = "s";
        }
        if (dense) {
          if (!ws[__R]) ws[__R] = [];
          if (ws[__R][__C] && ws[__R][__C].z) cell.z = ws[__R][__C].z;
          ws[__R][__C] = cell;
        } else {
          var cell_ref = encode_cell({ c: __C, r: __R });
          if (ws[cell_ref] && ws[cell_ref].z) cell.z = ws[cell_ref].z;
          ws[cell_ref] = cell;
        }
      }
    }
    if (range.s.c < 1e7) ws["!ref"] = encode_range(range);
    return ws;
  }
  function aoa_to_sheet(data, opts) {
    return sheet_add_aoa(null, data, opts);
  }
  function parse_Int32LE(data) {
    return data.read_shift(4, "i");
  }
  function parse_XLWideString(data) {
    var cchCharacters = data.read_shift(4);
    return cchCharacters === 0 ? "" : data.read_shift(cchCharacters, "dbcs");
  }
  function parse_StrRun(data) {
    return { ich: data.read_shift(2), ifnt: data.read_shift(2) };
  }
  function parse_RichStr(data, length) {
    var start = data.l;
    var flags = data.read_shift(1);
    var str = parse_XLWideString(data);
    var rgsStrRun = [];
    var z = { t: str, h: str };
    if ((flags & 1) !== 0) {
      var dwSizeStrRun = data.read_shift(4);
      for (var i = 0; i != dwSizeStrRun; ++i) rgsStrRun.push(parse_StrRun(data));
      z.r = rgsStrRun;
    } else z.r = [{ ich: 0, ifnt: 0 }];
    data.l = start + length;
    return z;
  }
  var parse_BrtCommentText = parse_RichStr;
  function parse_XLSBCell(data) {
    var col = data.read_shift(4);
    var iStyleRef = data.read_shift(2);
    iStyleRef += data.read_shift(1) << 16;
    data.l++;
    return { c: col, iStyleRef };
  }
  function parse_XLSBShortCell(data) {
    var iStyleRef = data.read_shift(2);
    iStyleRef += data.read_shift(1) << 16;
    data.l++;
    return { c: -1, iStyleRef };
  }
  var parse_XLSBCodeName = parse_XLWideString;
  function parse_XLNullableWideString(data) {
    var cchCharacters = data.read_shift(4);
    return cchCharacters === 0 || cchCharacters === 4294967295 ? "" : data.read_shift(cchCharacters, "dbcs");
  }
  var parse_XLNameWideString = parse_XLWideString;
  var parse_RelID = parse_XLNullableWideString;
  function parse_RkNumber(data) {
    var b = data.slice(data.l, data.l + 4);
    var fX100 = b[0] & 1, fInt = b[0] & 2;
    data.l += 4;
    var RK = fInt === 0 ? __double([0, 0, 0, 0, b[0] & 252, b[1], b[2], b[3]], 0) : __readInt32LE(b, 0) >> 2;
    return fX100 ? RK / 100 : RK;
  }
  function parse_RfX(data) {
    var cell = { s: {}, e: {} };
    cell.s.r = data.read_shift(4);
    cell.e.r = data.read_shift(4);
    cell.s.c = data.read_shift(4);
    cell.e.c = data.read_shift(4);
    return cell;
  }
  var parse_UncheckedRfX = parse_RfX;
  function parse_Xnum(data) {
    if (data.length - data.l < 8) throw "XLS Xnum Buffer underflow";
    return data.read_shift(8, "f");
  }
  function parse_BrtColor(data) {
    var out = {};
    var d = data.read_shift(1);
    var xColorType = d >>> 1;
    var index = data.read_shift(1);
    var nTS = data.read_shift(2, "i");
    var bR = data.read_shift(1);
    var bG = data.read_shift(1);
    var bB = data.read_shift(1);
    data.l++;
    switch (xColorType) {
      case 0:
        out.auto = 1;
        break;
      case 1:
        out.index = index;
        var icv = XLSIcv[index];
        if (icv) out.rgb = rgb2Hex(icv);
        break;
      case 2:
        out.rgb = rgb2Hex([bR, bG, bB]);
        break;
      case 3:
        out.theme = index;
        break;
    }
    if (nTS != 0) out.tint = nTS > 0 ? nTS / 32767 : nTS / 32768;
    return out;
  }
  function parse_FontFlags(data) {
    var d = data.read_shift(1);
    data.l++;
    var out = {
      fBold: d & 1,
      fItalic: d & 2,
      fUnderline: d & 4,
      fStrikeout: d & 8,
      fOutline: d & 16,
      fShadow: d & 32,
      fCondense: d & 64,
      fExtend: d & 128
    };
    return out;
  }
  function parse_ClipboardFormatOrString(o, w) {
    var ClipFmt = { 2: "BITMAP", 3: "METAFILEPICT", 8: "DIB", 14: "ENHMETAFILE" };
    var m = o.read_shift(4);
    switch (m) {
      case 0:
        return "";
      case 4294967295:
      case 4294967294:
        return ClipFmt[o.read_shift(4)] || "";
    }
    if (m > 400) throw new Error("Unsupported Clipboard: " + m.toString(16));
    o.l -= 4;
    return o.read_shift(0, w == 1 ? "lpstr" : "lpwstr");
  }
  function parse_ClipboardFormatOrAnsiString(o) {
    return parse_ClipboardFormatOrString(o, 1);
  }
  function parse_ClipboardFormatOrUnicodeString(o) {
    return parse_ClipboardFormatOrString(o, 2);
  }
  var VT_I2 = 2;
  var VT_I4 = 3;
  var VT_BOOL = 11;
  var VT_VARIANT = 12;
  var VT_UI4 = 19;
  var VT_FILETIME = 64;
  var VT_BLOB = 65;
  var VT_CF = 71;
  var VT_VECTOR_VARIANT = 4108;
  var VT_VECTOR_LPSTR = 4126;
  var VT_STRING = 80;
  var VT_USTR = 81;
  var VT_CUSTOM = [VT_STRING, VT_USTR];
  var DocSummaryPIDDSI = {
    /*::[*/
    1: { n: "CodePage", t: VT_I2 },
    /*::[*/
    2: { n: "Category", t: VT_STRING },
    /*::[*/
    3: { n: "PresentationFormat", t: VT_STRING },
    /*::[*/
    4: { n: "ByteCount", t: VT_I4 },
    /*::[*/
    5: { n: "LineCount", t: VT_I4 },
    /*::[*/
    6: { n: "ParagraphCount", t: VT_I4 },
    /*::[*/
    7: { n: "SlideCount", t: VT_I4 },
    /*::[*/
    8: { n: "NoteCount", t: VT_I4 },
    /*::[*/
    9: { n: "HiddenCount", t: VT_I4 },
    /*::[*/
    10: { n: "MultimediaClipCount", t: VT_I4 },
    /*::[*/
    11: { n: "ScaleCrop", t: VT_BOOL },
    /*::[*/
    12: {
      n: "HeadingPairs",
      t: VT_VECTOR_VARIANT
      /* VT_VECTOR | VT_VARIANT */
    },
    /*::[*/
    13: {
      n: "TitlesOfParts",
      t: VT_VECTOR_LPSTR
      /* VT_VECTOR | VT_LPSTR */
    },
    /*::[*/
    14: { n: "Manager", t: VT_STRING },
    /*::[*/
    15: { n: "Company", t: VT_STRING },
    /*::[*/
    16: { n: "LinksUpToDate", t: VT_BOOL },
    /*::[*/
    17: { n: "CharacterCount", t: VT_I4 },
    /*::[*/
    19: { n: "SharedDoc", t: VT_BOOL },
    /*::[*/
    22: { n: "HyperlinksChanged", t: VT_BOOL },
    /*::[*/
    23: { n: "AppVersion", t: VT_I4, p: "version" },
    /*::[*/
    24: { n: "DigSig", t: VT_BLOB },
    /*::[*/
    26: { n: "ContentType", t: VT_STRING },
    /*::[*/
    27: { n: "ContentStatus", t: VT_STRING },
    /*::[*/
    28: { n: "Language", t: VT_STRING },
    /*::[*/
    29: { n: "Version", t: VT_STRING },
    /*::[*/
    255: {},
    /* [MS-OLEPS] 2.18 */
    /*::[*/
    2147483648: { n: "Locale", t: VT_UI4 },
    /*::[*/
    2147483651: { n: "Behavior", t: VT_UI4 },
    /*::[*/
    1919054434: {}
  };
  var SummaryPIDSI = {
    /*::[*/
    1: { n: "CodePage", t: VT_I2 },
    /*::[*/
    2: { n: "Title", t: VT_STRING },
    /*::[*/
    3: { n: "Subject", t: VT_STRING },
    /*::[*/
    4: { n: "Author", t: VT_STRING },
    /*::[*/
    5: { n: "Keywords", t: VT_STRING },
    /*::[*/
    6: { n: "Comments", t: VT_STRING },
    /*::[*/
    7: { n: "Template", t: VT_STRING },
    /*::[*/
    8: { n: "LastAuthor", t: VT_STRING },
    /*::[*/
    9: { n: "RevNumber", t: VT_STRING },
    /*::[*/
    10: { n: "EditTime", t: VT_FILETIME },
    /*::[*/
    11: { n: "LastPrinted", t: VT_FILETIME },
    /*::[*/
    12: { n: "CreatedDate", t: VT_FILETIME },
    /*::[*/
    13: { n: "ModifiedDate", t: VT_FILETIME },
    /*::[*/
    14: { n: "PageCount", t: VT_I4 },
    /*::[*/
    15: { n: "WordCount", t: VT_I4 },
    /*::[*/
    16: { n: "CharCount", t: VT_I4 },
    /*::[*/
    17: { n: "Thumbnail", t: VT_CF },
    /*::[*/
    18: { n: "Application", t: VT_STRING },
    /*::[*/
    19: { n: "DocSecurity", t: VT_I4 },
    /*::[*/
    255: {},
    /* [MS-OLEPS] 2.18 */
    /*::[*/
    2147483648: { n: "Locale", t: VT_UI4 },
    /*::[*/
    2147483651: { n: "Behavior", t: VT_UI4 },
    /*::[*/
    1919054434: {}
  };
  var CountryEnum = {
    /*::[*/
    1: "US",
    // United States
    /*::[*/
    2: "CA",
    // Canada
    /*::[*/
    3: "",
    // Latin America (except Brazil)
    /*::[*/
    7: "RU",
    // Russia
    /*::[*/
    20: "EG",
    // Egypt
    /*::[*/
    30: "GR",
    // Greece
    /*::[*/
    31: "NL",
    // Netherlands
    /*::[*/
    32: "BE",
    // Belgium
    /*::[*/
    33: "FR",
    // France
    /*::[*/
    34: "ES",
    // Spain
    /*::[*/
    36: "HU",
    // Hungary
    /*::[*/
    39: "IT",
    // Italy
    /*::[*/
    41: "CH",
    // Switzerland
    /*::[*/
    43: "AT",
    // Austria
    /*::[*/
    44: "GB",
    // United Kingdom
    /*::[*/
    45: "DK",
    // Denmark
    /*::[*/
    46: "SE",
    // Sweden
    /*::[*/
    47: "NO",
    // Norway
    /*::[*/
    48: "PL",
    // Poland
    /*::[*/
    49: "DE",
    // Germany
    /*::[*/
    52: "MX",
    // Mexico
    /*::[*/
    55: "BR",
    // Brazil
    /*::[*/
    61: "AU",
    // Australia
    /*::[*/
    64: "NZ",
    // New Zealand
    /*::[*/
    66: "TH",
    // Thailand
    /*::[*/
    81: "JP",
    // Japan
    /*::[*/
    82: "KR",
    // Korea
    /*::[*/
    84: "VN",
    // Viet Nam
    /*::[*/
    86: "CN",
    // China
    /*::[*/
    90: "TR",
    // Turkey
    /*::[*/
    105: "JS",
    // Ramastan
    /*::[*/
    213: "DZ",
    // Algeria
    /*::[*/
    216: "MA",
    // Morocco
    /*::[*/
    218: "LY",
    // Libya
    /*::[*/
    351: "PT",
    // Portugal
    /*::[*/
    354: "IS",
    // Iceland
    /*::[*/
    358: "FI",
    // Finland
    /*::[*/
    420: "CZ",
    // Czech Republic
    /*::[*/
    886: "TW",
    // Taiwan
    /*::[*/
    961: "LB",
    // Lebanon
    /*::[*/
    962: "JO",
    // Jordan
    /*::[*/
    963: "SY",
    // Syria
    /*::[*/
    964: "IQ",
    // Iraq
    /*::[*/
    965: "KW",
    // Kuwait
    /*::[*/
    966: "SA",
    // Saudi Arabia
    /*::[*/
    971: "AE",
    // United Arab Emirates
    /*::[*/
    972: "IL",
    // Israel
    /*::[*/
    974: "QA",
    // Qatar
    /*::[*/
    981: "IR",
    // Iran
    /*::[*/
    65535: "US"
    // United States
  };
  var XLSFillPattern = [
    null,
    "solid",
    "mediumGray",
    "darkGray",
    "lightGray",
    "darkHorizontal",
    "darkVertical",
    "darkDown",
    "darkUp",
    "darkGrid",
    "darkTrellis",
    "lightHorizontal",
    "lightVertical",
    "lightDown",
    "lightUp",
    "lightGrid",
    "lightTrellis",
    "gray125",
    "gray0625"
  ];
  function rgbify(arr) {
    return arr.map(function(x) {
      return [x >> 16 & 255, x >> 8 & 255, x & 255];
    });
  }
  var _XLSIcv = /* @__PURE__ */ rgbify([
    /* Color Constants */
    0,
    16777215,
    16711680,
    65280,
    255,
    16776960,
    16711935,
    65535,
    /* Overridable Defaults */
    0,
    16777215,
    16711680,
    65280,
    255,
    16776960,
    16711935,
    65535,
    8388608,
    32768,
    128,
    8421376,
    8388736,
    32896,
    12632256,
    8421504,
    10066431,
    10040166,
    16777164,
    13434879,
    6684774,
    16744576,
    26316,
    13421823,
    128,
    16711935,
    16776960,
    65535,
    8388736,
    8388608,
    32896,
    255,
    52479,
    13434879,
    13434828,
    16777113,
    10079487,
    16751052,
    13408767,
    16764057,
    3368703,
    3394764,
    10079232,
    16763904,
    16750848,
    16737792,
    6710937,
    9868950,
    13158,
    3381606,
    13056,
    3355392,
    10040064,
    10040166,
    3355545,
    3355443,
    /* Other entries to appease BIFF8/12 */
    16777215,
    /* 0x40 icvForeground ?? */
    0,
    /* 0x41 icvBackground ?? */
    0,
    /* 0x42 icvFrame ?? */
    0,
    /* 0x43 icv3D ?? */
    0,
    /* 0x44 icv3DText ?? */
    0,
    /* 0x45 icv3DHilite ?? */
    0,
    /* 0x46 icv3DShadow ?? */
    0,
    /* 0x47 icvHilite ?? */
    0,
    /* 0x48 icvCtlText ?? */
    0,
    /* 0x49 icvCtlScrl ?? */
    0,
    /* 0x4A icvCtlInv ?? */
    0,
    /* 0x4B icvCtlBody ?? */
    0,
    /* 0x4C icvCtlFrame ?? */
    0,
    /* 0x4D icvCtlFore ?? */
    0,
    /* 0x4E icvCtlBack ?? */
    0,
    /* 0x4F icvCtlNeutral */
    0,
    /* 0x50 icvInfoBk ?? */
    0
    /* 0x51 icvInfoText ?? */
  ]);
  var XLSIcv = /* @__PURE__ */ dup(_XLSIcv);
  var BErr = {
    /*::[*/
    0: "#NULL!",
    /*::[*/
    7: "#DIV/0!",
    /*::[*/
    15: "#VALUE!",
    /*::[*/
    23: "#REF!",
    /*::[*/
    29: "#NAME?",
    /*::[*/
    36: "#NUM!",
    /*::[*/
    42: "#N/A",
    /*::[*/
    43: "#GETTING_DATA",
    /*::[*/
    255: "#WTF?"
  };
  var RBErr = {
    "#NULL!": 0,
    "#DIV/0!": 7,
    "#VALUE!": 15,
    "#REF!": 23,
    "#NAME?": 29,
    "#NUM!": 36,
    "#N/A": 42,
    "#GETTING_DATA": 43,
    "#WTF?": 255
  };
  var ct2type = {
    /* Workbook */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": "workbooks",
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml": "workbooks",
    "application/vnd.ms-excel.sheet.binary.macroEnabled.main": "workbooks",
    "application/vnd.ms-excel.addin.macroEnabled.main+xml": "workbooks",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": "workbooks",
    /* Worksheet */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": "sheets",
    "application/vnd.ms-excel.worksheet": "sheets",
    "application/vnd.ms-excel.binIndexWs": "TODO",
    /* Binary Index */
    /* Chartsheet */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": "charts",
    "application/vnd.ms-excel.chartsheet": "charts",
    /* Macrosheet */
    "application/vnd.ms-excel.macrosheet+xml": "macros",
    "application/vnd.ms-excel.macrosheet": "macros",
    "application/vnd.ms-excel.intlmacrosheet": "TODO",
    "application/vnd.ms-excel.binIndexMs": "TODO",
    /* Binary Index */
    /* Dialogsheet */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": "dialogs",
    "application/vnd.ms-excel.dialogsheet": "dialogs",
    /* Shared Strings */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml": "strs",
    "application/vnd.ms-excel.sharedStrings": "strs",
    /* Styles */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": "styles",
    "application/vnd.ms-excel.styles": "styles",
    /* File Properties */
    "application/vnd.openxmlformats-package.core-properties+xml": "coreprops",
    "application/vnd.openxmlformats-officedocument.custom-properties+xml": "custprops",
    "application/vnd.openxmlformats-officedocument.extended-properties+xml": "extprops",
    /* Custom Data Properties */
    "application/vnd.openxmlformats-officedocument.customXmlProperties+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.customProperty": "TODO",
    /* Comments */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": "comments",
    "application/vnd.ms-excel.comments": "comments",
    "application/vnd.ms-excel.threadedcomments+xml": "threadedcomments",
    "application/vnd.ms-excel.person+xml": "people",
    /* Metadata (Stock/Geography and Dynamic Array) */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml": "metadata",
    "application/vnd.ms-excel.sheetMetadata": "metadata",
    /* PivotTable */
    "application/vnd.ms-excel.pivotTable": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml": "TODO",
    /* Chart Objects */
    "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": "TODO",
    /* Chart Colors */
    "application/vnd.ms-office.chartcolorstyle+xml": "TODO",
    /* Chart Style */
    "application/vnd.ms-office.chartstyle+xml": "TODO",
    /* Chart Advanced */
    "application/vnd.ms-office.chartex+xml": "TODO",
    /* Calculation Chain */
    "application/vnd.ms-excel.calcChain": "calcchains",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml": "calcchains",
    /* Printer Settings */
    "application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings": "TODO",
    /* ActiveX */
    "application/vnd.ms-office.activeX": "TODO",
    "application/vnd.ms-office.activeX+xml": "TODO",
    /* Custom Toolbars */
    "application/vnd.ms-excel.attachedToolbars": "TODO",
    /* External Data Connections */
    "application/vnd.ms-excel.connections": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": "TODO",
    /* External Links */
    "application/vnd.ms-excel.externalLink": "links",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml": "links",
    /* PivotCache */
    "application/vnd.ms-excel.pivotCacheDefinition": "TODO",
    "application/vnd.ms-excel.pivotCacheRecords": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml": "TODO",
    /* Query Table */
    "application/vnd.ms-excel.queryTable": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.queryTable+xml": "TODO",
    /* Shared Workbook */
    "application/vnd.ms-excel.userNames": "TODO",
    "application/vnd.ms-excel.revisionHeaders": "TODO",
    "application/vnd.ms-excel.revisionLog": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionHeaders+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionLog+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.userNames+xml": "TODO",
    /* Single Cell Table */
    "application/vnd.ms-excel.tableSingleCells": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.tableSingleCells+xml": "TODO",
    /* Slicer */
    "application/vnd.ms-excel.slicer": "TODO",
    "application/vnd.ms-excel.slicerCache": "TODO",
    "application/vnd.ms-excel.slicer+xml": "TODO",
    "application/vnd.ms-excel.slicerCache+xml": "TODO",
    /* Sort Map */
    "application/vnd.ms-excel.wsSortMap": "TODO",
    /* Table */
    "application/vnd.ms-excel.table": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": "TODO",
    /* Themes */
    "application/vnd.openxmlformats-officedocument.theme+xml": "themes",
    /* Theme Override */
    "application/vnd.openxmlformats-officedocument.themeOverride+xml": "TODO",
    /* Timeline */
    "application/vnd.ms-excel.Timeline+xml": "TODO",
    /* verify */
    "application/vnd.ms-excel.TimelineCache+xml": "TODO",
    /* verify */
    /* VBA */
    "application/vnd.ms-office.vbaProject": "vba",
    "application/vnd.ms-office.vbaProjectSignature": "TODO",
    /* Volatile Dependencies */
    "application/vnd.ms-office.volatileDependencies": "TODO",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.volatileDependencies+xml": "TODO",
    /* Control Properties */
    "application/vnd.ms-excel.controlproperties+xml": "TODO",
    /* Data Model */
    "application/vnd.openxmlformats-officedocument.model+data": "TODO",
    /* Survey */
    "application/vnd.ms-excel.Survey+xml": "TODO",
    /* Drawing */
    "application/vnd.openxmlformats-officedocument.drawing+xml": "drawings",
    "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml": "TODO",
    "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml": "TODO",
    /* VML */
    "application/vnd.openxmlformats-officedocument.vmlDrawing": "TODO",
    "application/vnd.openxmlformats-package.relationships+xml": "rels",
    "application/vnd.openxmlformats-officedocument.oleObject": "TODO",
    /* Image */
    "image/png": "TODO",
    "sheet": "js"
  };
  function new_ct() {
    return {
      workbooks: [],
      sheets: [],
      charts: [],
      dialogs: [],
      macros: [],
      rels: [],
      strs: [],
      comments: [],
      threadedcomments: [],
      links: [],
      coreprops: [],
      extprops: [],
      custprops: [],
      themes: [],
      styles: [],
      calcchains: [],
      vba: [],
      drawings: [],
      metadata: [],
      people: [],
      TODO: [],
      xmlns: ""
    };
  }
  function parse_ct(data) {
    var ct = new_ct();
    if (!data || !data.match) return ct;
    var ctext = {};
    (data.match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (y[0].replace(nsregex, "<")) {
        case "<?xml":
          break;
        case "<Types":
          ct.xmlns = y["xmlns" + (y[0].match(/<(\w+):/) || ["", ""])[1]];
          break;
        case "<Default":
          ctext[y.Extension] = y.ContentType;
          break;
        case "<Override":
          if (ct[ct2type[y.ContentType]] !== void 0) ct[ct2type[y.ContentType]].push(y.PartName);
          break;
      }
    });
    if (ct.xmlns !== XMLNS.CT) throw new Error("Unknown Namespace: " + ct.xmlns);
    ct.calcchain = ct.calcchains.length > 0 ? ct.calcchains[0] : "";
    ct.sst = ct.strs.length > 0 ? ct.strs[0] : "";
    ct.style = ct.styles.length > 0 ? ct.styles[0] : "";
    ct.defaults = ctext;
    delete ct.calcchains;
    return ct;
  }
  var RELS = {
    WB: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    SHEET: "http://sheetjs.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
    HLINK: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
    VML: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing",
    XPATH: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath",
    XMISS: "http://schemas.microsoft.com/office/2006/relationships/xlExternalLinkPath/xlPathMissing",
    XLINK: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink",
    CXML: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml",
    CXMLP: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps",
    CMNT: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments",
    CORE_PROPS: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties",
    EXT_PROPS: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties",
    CUST_PROPS: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties",
    SST: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings",
    STY: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
    THEME: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme",
    CHART: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart",
    CHARTEX: "http://schemas.microsoft.com/office/2014/relationships/chartEx",
    CS: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chartsheet",
    WS: [
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
      "http://purl.oclc.org/ooxml/officeDocument/relationships/worksheet"
    ],
    DS: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/dialogsheet",
    MS: "http://schemas.microsoft.com/office/2006/relationships/xlMacrosheet",
    IMG: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    DRAW: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
    XLMETA: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata",
    TCMNT: "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment",
    PEOPLE: "http://schemas.microsoft.com/office/2017/10/relationships/person",
    VBA: "http://schemas.microsoft.com/office/2006/relationships/vbaProject"
  };
  function get_rels_path(file) {
    var n = file.lastIndexOf("/");
    return file.slice(0, n + 1) + "_rels/" + file.slice(n + 1) + ".rels";
  }
  function parse_rels(data, currentFilePath) {
    var rels = { "!id": {} };
    if (!data) return rels;
    if (currentFilePath.charAt(0) !== "/") {
      currentFilePath = "/" + currentFilePath;
    }
    var hash = {};
    (data.match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      if (y[0] === "<Relationship") {
        var rel = {};
        rel.Type = y.Type;
        rel.Target = y.Target;
        rel.Id = y.Id;
        if (y.TargetMode) rel.TargetMode = y.TargetMode;
        var canonictarget = y.TargetMode === "External" ? y.Target : resolve_path(y.Target, currentFilePath);
        rels[canonictarget] = rel;
        hash[y.Id] = rel;
      }
    });
    rels["!id"] = hash;
    return rels;
  }
  var CT_ODS = "application/vnd.oasis.opendocument.spreadsheet";
  function parse_manifest(d, opts) {
    var str = xlml_normalize(d);
    var Rn;
    var FEtag;
    while (Rn = xlmlregex.exec(str)) switch (Rn[3]) {
      case "manifest":
        break;
      // 4.2 <manifest:manifest>
      case "file-entry":
        FEtag = parsexmltag(Rn[0], false);
        if (FEtag.path == "/" && FEtag.type !== CT_ODS) throw new Error("This OpenDocument is not a spreadsheet");
        break;
      case "encryption-data":
      // 4.4 <manifest:encryption-data>
      case "algorithm":
      // 4.5 <manifest:algorithm>
      case "start-key-generation":
      // 4.6 <manifest:start-key-generation>
      case "key-derivation":
        throw new Error("Unsupported ODS Encryption");
      default:
        if (opts && opts.WTF) throw Rn;
    }
  }
  var CORE_PROPS = [
    ["cp:category", "Category"],
    ["cp:contentStatus", "ContentStatus"],
    ["cp:keywords", "Keywords"],
    ["cp:lastModifiedBy", "LastAuthor"],
    ["cp:lastPrinted", "LastPrinted"],
    ["cp:revision", "RevNumber"],
    ["cp:version", "Version"],
    ["dc:creator", "Author"],
    ["dc:description", "Comments"],
    ["dc:identifier", "Identifier"],
    ["dc:language", "Language"],
    ["dc:subject", "Subject"],
    ["dc:title", "Title"],
    ["dcterms:created", "CreatedDate", "date"],
    ["dcterms:modified", "ModifiedDate", "date"]
  ];
  var CORE_PROPS_REGEX = /* @__PURE__ */ function() {
    var r = new Array(CORE_PROPS.length);
    for (var i = 0; i < CORE_PROPS.length; ++i) {
      var f = CORE_PROPS[i];
      var g = "(?:" + f[0].slice(0, f[0].indexOf(":")) + ":)" + f[0].slice(f[0].indexOf(":") + 1);
      r[i] = new RegExp("<" + g + "[^>]*>([\\s\\S]*?)</" + g + ">");
    }
    return r;
  }();
  function parse_core_props(data) {
    var p = {};
    data = utf8read(data);
    for (var i = 0; i < CORE_PROPS.length; ++i) {
      var f = CORE_PROPS[i], cur = data.match(CORE_PROPS_REGEX[i]);
      if (cur != null && cur.length > 0) p[f[1]] = unescapexml(cur[1]);
      if (f[2] === "date" && p[f[1]]) p[f[1]] = parseDate(p[f[1]]);
    }
    return p;
  }
  var EXT_PROPS = [
    ["Application", "Application", "string"],
    ["AppVersion", "AppVersion", "string"],
    ["Company", "Company", "string"],
    ["DocSecurity", "DocSecurity", "string"],
    ["Manager", "Manager", "string"],
    ["HyperlinksChanged", "HyperlinksChanged", "bool"],
    ["SharedDoc", "SharedDoc", "bool"],
    ["LinksUpToDate", "LinksUpToDate", "bool"],
    ["ScaleCrop", "ScaleCrop", "bool"],
    ["HeadingPairs", "HeadingPairs", "raw"],
    ["TitlesOfParts", "TitlesOfParts", "raw"]
  ];
  function load_props_pairs(HP, TOP, props, opts) {
    var v = [];
    if (typeof HP == "string") v = parseVector(HP, opts);
    else for (var j = 0; j < HP.length; ++j) v = v.concat(HP[j].map(function(hp) {
      return { v: hp };
    }));
    var parts = typeof TOP == "string" ? parseVector(TOP, opts).map(function(x) {
      return x.v;
    }) : TOP;
    var idx = 0, len = 0;
    if (parts.length > 0) for (var i = 0; i !== v.length; i += 2) {
      len = +v[i + 1].v;
      switch (v[i].v) {
        case "Worksheets":
        case "\u5DE5\u4F5C\u8868":
        case "\u041B\u0438\u0441\u0442\u044B":
        case "\u0623\u0648\u0631\u0627\u0642 \u0627\u0644\u0639\u0645\u0644":
        case "\u30EF\u30FC\u30AF\u30B7\u30FC\u30C8":
        case "\u05D2\u05DC\u05D9\u05D5\u05E0\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4":
        case "Arbeitsbl\xE4tter":
        case "\xC7al\u0131\u015Fma Sayfalar\u0131":
        case "Feuilles de calcul":
        case "Fogli di lavoro":
        case "Folhas de c\xE1lculo":
        case "Planilhas":
        case "Regneark":
        case "Hojas de c\xE1lculo":
        case "Werkbladen":
          props.Worksheets = len;
          props.SheetNames = parts.slice(idx, idx + len);
          break;
        case "Named Ranges":
        case "Rangos con nombre":
        case "\u540D\u524D\u4ED8\u304D\u4E00\u89A7":
        case "Benannte Bereiche":
        case "Navngivne omr\xE5der":
          props.NamedRanges = len;
          props.DefinedNames = parts.slice(idx, idx + len);
          break;
        case "Charts":
        case "Diagramme":
          props.Chartsheets = len;
          props.ChartNames = parts.slice(idx, idx + len);
          break;
      }
      idx += len;
    }
  }
  function parse_ext_props(data, p, opts) {
    var q = {};
    if (!p) p = {};
    data = utf8read(data);
    EXT_PROPS.forEach(function(f) {
      var xml = (data.match(matchtag(f[0])) || [])[1];
      switch (f[2]) {
        case "string":
          if (xml) p[f[1]] = unescapexml(xml);
          break;
        case "bool":
          p[f[1]] = xml === "true";
          break;
        case "raw":
          var cur = data.match(new RegExp("<" + f[0] + "[^>]*>([\\s\\S]*?)</" + f[0] + ">"));
          if (cur && cur.length > 0) q[f[1]] = cur[1];
          break;
      }
    });
    if (q.HeadingPairs && q.TitlesOfParts) load_props_pairs(q.HeadingPairs, q.TitlesOfParts, p, opts);
    return p;
  }
  var custregex = /<[^>]+>[^<]*/g;
  function parse_cust_props(data, opts) {
    var p = {}, name = "";
    var m = data.match(custregex);
    if (m) for (var i = 0; i != m.length; ++i) {
      var x = m[i], y = parsexmltag(x);
      switch (y[0]) {
        case "<?xml":
          break;
        case "<Properties":
          break;
        case "<property":
          name = unescapexml(y.name);
          break;
        case "</property>":
          name = null;
          break;
        default:
          if (x.indexOf("<vt:") === 0) {
            var toks = x.split(">");
            var type = toks[0].slice(4), text = toks[1];
            switch (type) {
              case "lpstr":
              case "bstr":
              case "lpwstr":
                p[name] = unescapexml(text);
                break;
              case "bool":
                p[name] = parsexmlbool(text);
                break;
              case "i1":
              case "i2":
              case "i4":
              case "i8":
              case "int":
              case "uint":
                p[name] = parseInt(text, 10);
                break;
              case "r4":
              case "r8":
              case "decimal":
                p[name] = parseFloat(text);
                break;
              case "filetime":
              case "date":
                p[name] = parseDate(text);
                break;
              case "cy":
              case "error":
                p[name] = unescapexml(text);
                break;
              default:
                if (type.slice(-1) == "/") break;
                if (opts.WTF && typeof console !== "undefined") console.warn("Unexpected", x, type, toks);
            }
          } else if (x.slice(0, 2) === "</") {
          } else if (opts.WTF) throw new Error(x);
      }
    }
    return p;
  }
  var XLMLDocPropsMap = {
    Title: "Title",
    Subject: "Subject",
    Author: "Author",
    Keywords: "Keywords",
    Comments: "Description",
    LastAuthor: "LastAuthor",
    RevNumber: "Revision",
    Application: "AppName",
    /* TotalTime: 'TotalTime', */
    LastPrinted: "LastPrinted",
    CreatedDate: "Created",
    ModifiedDate: "LastSaved",
    /* Pages */
    /* Words */
    /* Characters */
    Category: "Category",
    /* PresentationFormat */
    Manager: "Manager",
    Company: "Company",
    /* Guid */
    /* HyperlinkBase */
    /* Bytes */
    /* Lines */
    /* Paragraphs */
    /* CharactersWithSpaces */
    AppVersion: "Version",
    ContentStatus: "ContentStatus",
    /* NOTE: missing from schema */
    Identifier: "Identifier",
    /* NOTE: missing from schema */
    Language: "Language"
    /* NOTE: missing from schema */
  };
  var evert_XLMLDPM;
  function xlml_set_prop(Props, tag, val) {
    if (!evert_XLMLDPM) evert_XLMLDPM = evert(XLMLDocPropsMap);
    tag = evert_XLMLDPM[tag] || tag;
    Props[tag] = val;
  }
  function parse_FILETIME(blob) {
    var dwLowDateTime = blob.read_shift(4), dwHighDateTime = blob.read_shift(4);
    return new Date((dwHighDateTime / 1e7 * Math.pow(2, 32) + dwLowDateTime / 1e7 - 11644473600) * 1e3).toISOString().replace(/\.000/, "");
  }
  function parse_lpstr(blob, type, pad) {
    var start = blob.l;
    var str = blob.read_shift(0, "lpstr-cp");
    if (pad) while (blob.l - start & 3) ++blob.l;
    return str;
  }
  function parse_lpwstr(blob, type, pad) {
    var str = blob.read_shift(0, "lpwstr");
    if (pad) blob.l += 4 - (str.length + 1 & 3) & 3;
    return str;
  }
  function parse_VtStringBase(blob, stringType, pad) {
    if (stringType === 31) return parse_lpwstr(blob);
    return parse_lpstr(blob, stringType, pad);
  }
  function parse_VtString(blob, t, pad) {
    return parse_VtStringBase(blob, t, pad === false ? 0 : 4);
  }
  function parse_VtUnalignedString(blob, t) {
    if (!t) throw new Error("VtUnalignedString must have positive length");
    return parse_VtStringBase(blob, t, 0);
  }
  function parse_VtVecLpwstrValue(blob) {
    var length = blob.read_shift(4);
    var ret = [];
    for (var i = 0; i != length; ++i) {
      var start = blob.l;
      ret[i] = blob.read_shift(0, "lpwstr").replace(chr0, "");
      if (blob.l - start & 2) blob.l += 2;
    }
    return ret;
  }
  function parse_VtVecUnalignedLpstrValue(blob) {
    var length = blob.read_shift(4);
    var ret = [];
    for (var i = 0; i != length; ++i) ret[i] = blob.read_shift(0, "lpstr-cp").replace(chr0, "");
    return ret;
  }
  function parse_VtHeadingPair(blob) {
    var start = blob.l;
    var headingString = parse_TypedPropertyValue(blob, VT_USTR);
    if (blob[blob.l] == 0 && blob[blob.l + 1] == 0 && blob.l - start & 2) blob.l += 2;
    var headerParts = parse_TypedPropertyValue(blob, VT_I4);
    return [headingString, headerParts];
  }
  function parse_VtVecHeadingPairValue(blob) {
    var cElements = blob.read_shift(4);
    var out = [];
    for (var i = 0; i < cElements / 2; ++i) out.push(parse_VtHeadingPair(blob));
    return out;
  }
  function parse_dictionary(blob, CodePage) {
    var cnt = blob.read_shift(4);
    var dict = {};
    for (var j = 0; j != cnt; ++j) {
      var pid = blob.read_shift(4);
      var len = blob.read_shift(4);
      dict[pid] = blob.read_shift(len, CodePage === 1200 ? "utf16le" : "utf8").replace(chr0, "").replace(chr1, "!");
      if (CodePage === 1200 && len % 2) blob.l += 2;
    }
    if (blob.l & 3) blob.l = blob.l >> 2 + 1 << 2;
    return dict;
  }
  function parse_BLOB(blob) {
    var size = blob.read_shift(4);
    var bytes = blob.slice(blob.l, blob.l + size);
    blob.l += size;
    if ((size & 3) > 0) blob.l += 4 - (size & 3) & 3;
    return bytes;
  }
  function parse_ClipboardData(blob) {
    var o = {};
    o.Size = blob.read_shift(4);
    blob.l += o.Size + 3 - (o.Size - 1) % 4;
    return o;
  }
  function parse_TypedPropertyValue(blob, type, _opts) {
    var t = blob.read_shift(2), ret, opts = _opts || {};
    blob.l += 2;
    if (type !== VT_VARIANT) {
      if (t !== type && VT_CUSTOM.indexOf(type) === -1 && !((type & 65534) == 4126 && (t & 65534) == 4126)) throw new Error("Expected type " + type + " saw " + t);
    }
    switch (type === VT_VARIANT ? t : type) {
      case 2:
        ret = blob.read_shift(2, "i");
        if (!opts.raw) blob.l += 2;
        return ret;
      case 3:
        ret = blob.read_shift(4, "i");
        return ret;
      case 11:
        return blob.read_shift(4) !== 0;
      case 19:
        ret = blob.read_shift(4);
        return ret;
      case 30:
        return parse_lpstr(blob, t, 4).replace(chr0, "");
      case 31:
        return parse_lpwstr(blob);
      case 64:
        return parse_FILETIME(blob);
      case 65:
        return parse_BLOB(blob);
      case 71:
        return parse_ClipboardData(blob);
      case 80:
        return parse_VtString(blob, t, !opts.raw).replace(chr0, "");
      case 81:
        return parse_VtUnalignedString(
          blob,
          t
          /*, 4*/
        ).replace(chr0, "");
      case 4108:
        return parse_VtVecHeadingPairValue(blob);
      case 4126:
      case 4127:
        return t == 4127 ? parse_VtVecLpwstrValue(blob) : parse_VtVecUnalignedLpstrValue(blob);
      default:
        throw new Error("TypedPropertyValue unrecognized type " + type + " " + t);
    }
  }
  function parse_PropertySet(blob, PIDSI) {
    var start_addr = blob.l;
    var size = blob.read_shift(4);
    var NumProps = blob.read_shift(4);
    var Props = [], i = 0;
    var CodePage = 0;
    var Dictionary = -1, DictObj = {};
    for (i = 0; i != NumProps; ++i) {
      var PropID = blob.read_shift(4);
      var Offset = blob.read_shift(4);
      Props[i] = [PropID, Offset + start_addr];
    }
    Props.sort(function(x, y) {
      return x[1] - y[1];
    });
    var PropH = {};
    for (i = 0; i != NumProps; ++i) {
      if (blob.l !== Props[i][1]) {
        var fail = true;
        if (i > 0 && PIDSI) switch (PIDSI[Props[i - 1][0]].t) {
          case 2:
            if (blob.l + 2 === Props[i][1]) {
              blob.l += 2;
              fail = false;
            }
            break;
          case 80:
            if (blob.l <= Props[i][1]) {
              blob.l = Props[i][1];
              fail = false;
            }
            break;
          case 4108:
            if (blob.l <= Props[i][1]) {
              blob.l = Props[i][1];
              fail = false;
            }
            break;
        }
        if ((!PIDSI || i == 0) && blob.l <= Props[i][1]) {
          fail = false;
          blob.l = Props[i][1];
        }
        if (fail) throw new Error("Read Error: Expected address " + Props[i][1] + " at " + blob.l + " :" + i);
      }
      if (PIDSI) {
        var piddsi = PIDSI[Props[i][0]];
        PropH[piddsi.n] = parse_TypedPropertyValue(blob, piddsi.t, { raw: true });
        if (piddsi.p === "version") PropH[piddsi.n] = String(PropH[piddsi.n] >> 16) + "." + ("0000" + String(PropH[piddsi.n] & 65535)).slice(-4);
        if (piddsi.n == "CodePage") switch (PropH[piddsi.n]) {
          case 0:
            PropH[piddsi.n] = 1252;
          /* falls through */
          case 874:
          case 932:
          case 936:
          case 949:
          case 950:
          case 1250:
          case 1251:
          case 1253:
          case 1254:
          case 1255:
          case 1256:
          case 1257:
          case 1258:
          case 1e4:
          case 1200:
          case 1201:
          case 1252:
          case 65e3:
          case -536:
          case 65001:
          case -535:
            set_cp(CodePage = PropH[piddsi.n] >>> 0 & 65535);
            break;
          default:
            throw new Error("Unsupported CodePage: " + PropH[piddsi.n]);
        }
      } else {
        if (Props[i][0] === 1) {
          CodePage = PropH.CodePage = parse_TypedPropertyValue(blob, VT_I2);
          set_cp(CodePage);
          if (Dictionary !== -1) {
            var oldpos = blob.l;
            blob.l = Props[Dictionary][1];
            DictObj = parse_dictionary(blob, CodePage);
            blob.l = oldpos;
          }
        } else if (Props[i][0] === 0) {
          if (CodePage === 0) {
            Dictionary = i;
            blob.l = Props[i + 1][1];
            continue;
          }
          DictObj = parse_dictionary(blob, CodePage);
        } else {
          var name = DictObj[Props[i][0]];
          var val;
          switch (blob[blob.l]) {
            case 65:
              blob.l += 4;
              val = parse_BLOB(blob);
              break;
            case 30:
              blob.l += 4;
              val = parse_VtString(blob, blob[blob.l - 4]).replace(/\u0000+$/, "");
              break;
            case 31:
              blob.l += 4;
              val = parse_VtString(blob, blob[blob.l - 4]).replace(/\u0000+$/, "");
              break;
            case 3:
              blob.l += 4;
              val = blob.read_shift(4, "i");
              break;
            case 19:
              blob.l += 4;
              val = blob.read_shift(4);
              break;
            case 5:
              blob.l += 4;
              val = blob.read_shift(8, "f");
              break;
            case 11:
              blob.l += 4;
              val = parsebool(blob, 4);
              break;
            case 64:
              blob.l += 4;
              val = parseDate(parse_FILETIME(blob));
              break;
            default:
              throw new Error("unparsed value: " + blob[blob.l]);
          }
          PropH[name] = val;
        }
      }
    }
    blob.l = start_addr + size;
    return PropH;
  }
  function parse_PropertySetStream(file, PIDSI, clsid) {
    var blob = file.content;
    if (!blob) return {};
    prep_blob(blob, 0);
    var NumSets, FMTID0, FMTID1, Offset0, Offset1 = 0;
    blob.chk("feff", "Byte Order: ");
    blob.read_shift(2);
    var SystemIdentifier = blob.read_shift(4);
    var CLSID = blob.read_shift(16);
    if (CLSID !== CFB.utils.consts.HEADER_CLSID && CLSID !== clsid) throw new Error("Bad PropertySet CLSID " + CLSID);
    NumSets = blob.read_shift(4);
    if (NumSets !== 1 && NumSets !== 2) throw new Error("Unrecognized #Sets: " + NumSets);
    FMTID0 = blob.read_shift(16);
    Offset0 = blob.read_shift(4);
    if (NumSets === 1 && Offset0 !== blob.l) throw new Error("Length mismatch: " + Offset0 + " !== " + blob.l);
    else if (NumSets === 2) {
      FMTID1 = blob.read_shift(16);
      Offset1 = blob.read_shift(4);
    }
    var PSet0 = parse_PropertySet(blob, PIDSI);
    var rval = { SystemIdentifier };
    for (var y in PSet0) rval[y] = PSet0[y];
    rval.FMTID = FMTID0;
    if (NumSets === 1) return rval;
    if (Offset1 - blob.l == 2) blob.l += 2;
    if (blob.l !== Offset1) throw new Error("Length mismatch 2: " + blob.l + " !== " + Offset1);
    var PSet1;
    try {
      PSet1 = parse_PropertySet(blob, null);
    } catch (e) {
    }
    for (y in PSet1) rval[y] = PSet1[y];
    rval.FMTID = [FMTID0, FMTID1];
    return rval;
  }
  function parsenoop2(blob, length) {
    blob.read_shift(length);
    return null;
  }
  function parslurp(blob, length, cb) {
    var arr = [], target = blob.l + length;
    while (blob.l < target) arr.push(cb(blob, target - blob.l));
    if (target !== blob.l) throw new Error("Slurp error");
    return arr;
  }
  function parsebool(blob, length) {
    return blob.read_shift(length) === 1;
  }
  function parseuint16(blob) {
    return blob.read_shift(2, "u");
  }
  function parseuint16a(blob, length) {
    return parslurp(blob, length, parseuint16);
  }
  function parse_Bes(blob) {
    var v = blob.read_shift(1), t = blob.read_shift(1);
    return t === 1 ? v : v === 1;
  }
  function parse_ShortXLUnicodeString(blob, length, opts) {
    var cch = blob.read_shift(opts && opts.biff >= 12 ? 2 : 1);
    var encoding = "sbcs-cont";
    var cp = current_codepage;
    if (opts && opts.biff >= 8) current_codepage = 1200;
    if (!opts || opts.biff == 8) {
      var fHighByte = blob.read_shift(1);
      if (fHighByte) {
        encoding = "dbcs-cont";
      }
    } else if (opts.biff == 12) {
      encoding = "wstr";
    }
    if (opts.biff >= 2 && opts.biff <= 5) encoding = "cpstr";
    var o = cch ? blob.read_shift(cch, encoding) : "";
    current_codepage = cp;
    return o;
  }
  function parse_XLUnicodeRichExtendedString(blob) {
    var cp = current_codepage;
    current_codepage = 1200;
    var cch = blob.read_shift(2), flags = blob.read_shift(1);
    var fExtSt = flags & 4, fRichSt = flags & 8;
    var width = 1 + (flags & 1);
    var cRun = 0, cbExtRst;
    var z = {};
    if (fRichSt) cRun = blob.read_shift(2);
    if (fExtSt) cbExtRst = blob.read_shift(4);
    var encoding = width == 2 ? "dbcs-cont" : "sbcs-cont";
    var msg = cch === 0 ? "" : blob.read_shift(cch, encoding);
    if (fRichSt) blob.l += 4 * cRun;
    if (fExtSt) blob.l += cbExtRst;
    z.t = msg;
    if (!fRichSt) {
      z.raw = "<t>" + z.t + "</t>";
      z.r = z.t;
    }
    current_codepage = cp;
    return z;
  }
  function parse_XLUnicodeStringNoCch(blob, cch, opts) {
    var retval;
    if (opts) {
      if (opts.biff >= 2 && opts.biff <= 5) return blob.read_shift(cch, "cpstr");
      if (opts.biff >= 12) return blob.read_shift(cch, "dbcs-cont");
    }
    var fHighByte = blob.read_shift(1);
    if (fHighByte === 0) {
      retval = blob.read_shift(cch, "sbcs-cont");
    } else {
      retval = blob.read_shift(cch, "dbcs-cont");
    }
    return retval;
  }
  function parse_XLUnicodeString(blob, length, opts) {
    var cch = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    if (cch === 0) {
      blob.l++;
      return "";
    }
    return parse_XLUnicodeStringNoCch(blob, cch, opts);
  }
  function parse_XLUnicodeString2(blob, length, opts) {
    if (opts.biff > 5) return parse_XLUnicodeString(blob, length, opts);
    var cch = blob.read_shift(1);
    if (cch === 0) {
      blob.l++;
      return "";
    }
    return blob.read_shift(cch, opts.biff <= 4 || !blob.lens ? "cpstr" : "sbcs-cont");
  }
  function parse_ControlInfo(blob) {
    var flags = blob.read_shift(1);
    blob.l++;
    var accel = blob.read_shift(2);
    blob.l += 2;
    return [flags, accel];
  }
  function parse_URLMoniker(blob) {
    var len = blob.read_shift(4), start = blob.l;
    var extra = false;
    if (len > 24) {
      blob.l += len - 24;
      if (blob.read_shift(16) === "795881f43b1d7f48af2c825dc4852763") extra = true;
      blob.l = start;
    }
    var url = blob.read_shift((extra ? len - 24 : len) >> 1, "utf16le").replace(chr0, "");
    if (extra) blob.l += 24;
    return url;
  }
  function parse_FileMoniker(blob) {
    var cAnti = blob.read_shift(2);
    var preamble = "";
    while (cAnti-- > 0) preamble += "../";
    var ansiPath = blob.read_shift(0, "lpstr-ansi");
    blob.l += 2;
    if (blob.read_shift(2) != 57005) throw new Error("Bad FileMoniker");
    var sz = blob.read_shift(4);
    if (sz === 0) return preamble + ansiPath.replace(/\\/g, "/");
    var bytes = blob.read_shift(4);
    if (blob.read_shift(2) != 3) throw new Error("Bad FileMoniker");
    var unicodePath = blob.read_shift(bytes >> 1, "utf16le").replace(chr0, "");
    return preamble + unicodePath;
  }
  function parse_HyperlinkMoniker(blob, length) {
    var clsid = blob.read_shift(16);
    length -= 16;
    switch (clsid) {
      case "e0c9ea79f9bace118c8200aa004ba90b":
        return parse_URLMoniker(blob, length);
      case "0303000000000000c000000000000046":
        return parse_FileMoniker(blob, length);
      default:
        throw new Error("Unsupported Moniker " + clsid);
    }
  }
  function parse_HyperlinkString(blob) {
    var len = blob.read_shift(4);
    var o = len > 0 ? blob.read_shift(len, "utf16le").replace(chr0, "") : "";
    return o;
  }
  function parse_Hyperlink(blob, length) {
    var end = blob.l + length;
    var sVer = blob.read_shift(4);
    if (sVer !== 2) throw new Error("Unrecognized streamVersion: " + sVer);
    var flags = blob.read_shift(2);
    blob.l += 2;
    var displayName, targetFrameName, moniker, oleMoniker, Loc = "", guid, fileTime;
    if (flags & 16) displayName = parse_HyperlinkString(blob, end - blob.l);
    if (flags & 128) targetFrameName = parse_HyperlinkString(blob, end - blob.l);
    if ((flags & 257) === 257) moniker = parse_HyperlinkString(blob, end - blob.l);
    if ((flags & 257) === 1) oleMoniker = parse_HyperlinkMoniker(blob, end - blob.l);
    if (flags & 8) Loc = parse_HyperlinkString(blob, end - blob.l);
    if (flags & 32) guid = blob.read_shift(16);
    if (flags & 64) fileTime = parse_FILETIME(
      blob
      /*, 8*/
    );
    blob.l = end;
    var target = targetFrameName || moniker || oleMoniker || "";
    if (target && Loc) target += "#" + Loc;
    if (!target) target = "#" + Loc;
    if (flags & 2 && target.charAt(0) == "/" && target.charAt(1) != "/") target = "file://" + target;
    var out = { Target: target };
    if (guid) out.guid = guid;
    if (fileTime) out.time = fileTime;
    if (displayName) out.Tooltip = displayName;
    return out;
  }
  function parse_LongRGBA(blob) {
    var r = blob.read_shift(1), g = blob.read_shift(1), b = blob.read_shift(1), a = blob.read_shift(1);
    return [r, g, b, a];
  }
  function parse_LongRGB(blob, length) {
    var x = parse_LongRGBA(blob, length);
    x[3] = 0;
    return x;
  }
  function parse_XLSCell(blob) {
    var rw = blob.read_shift(2);
    var col = blob.read_shift(2);
    var ixfe = blob.read_shift(2);
    return { r: rw, c: col, ixfe };
  }
  function parse_frtHeader(blob) {
    var rt = blob.read_shift(2);
    var flags = blob.read_shift(2);
    blob.l += 8;
    return { type: rt, flags };
  }
  function parse_OptXLUnicodeString(blob, length, opts) {
    return length === 0 ? "" : parse_XLUnicodeString2(blob, length, opts);
  }
  function parse_XTI(blob, length, opts) {
    var w = opts.biff > 8 ? 4 : 2;
    var iSupBook = blob.read_shift(w), itabFirst = blob.read_shift(w, "i"), itabLast = blob.read_shift(w, "i");
    return [iSupBook, itabFirst, itabLast];
  }
  function parse_RkRec(blob) {
    var ixfe = blob.read_shift(2);
    var RK = parse_RkNumber(blob);
    return [ixfe, RK];
  }
  function parse_AddinUdf(blob, length, opts) {
    blob.l += 4;
    length -= 4;
    var l = blob.l + length;
    var udfName = parse_ShortXLUnicodeString(blob, length, opts);
    var cb = blob.read_shift(2);
    l -= blob.l;
    if (cb !== l) throw new Error("Malformed AddinUdf: padding = " + l + " != " + cb);
    blob.l += cb;
    return udfName;
  }
  function parse_Ref8U(blob) {
    var rwFirst = blob.read_shift(2);
    var rwLast = blob.read_shift(2);
    var colFirst = blob.read_shift(2);
    var colLast = blob.read_shift(2);
    return { s: { c: colFirst, r: rwFirst }, e: { c: colLast, r: rwLast } };
  }
  function parse_RefU(blob) {
    var rwFirst = blob.read_shift(2);
    var rwLast = blob.read_shift(2);
    var colFirst = blob.read_shift(1);
    var colLast = blob.read_shift(1);
    return { s: { c: colFirst, r: rwFirst }, e: { c: colLast, r: rwLast } };
  }
  var parse_Ref = parse_RefU;
  function parse_FtCmo(blob) {
    blob.l += 4;
    var ot = blob.read_shift(2);
    var id = blob.read_shift(2);
    var flags = blob.read_shift(2);
    blob.l += 12;
    return [id, ot, flags];
  }
  function parse_FtNts(blob) {
    var out = {};
    blob.l += 4;
    blob.l += 16;
    out.fSharedNote = blob.read_shift(2);
    blob.l += 4;
    return out;
  }
  function parse_FtCf(blob) {
    var out = {};
    blob.l += 4;
    blob.cf = blob.read_shift(2);
    return out;
  }
  function parse_FtSkip(blob) {
    blob.l += 2;
    blob.l += blob.read_shift(2);
  }
  var FtTab = {
    /*::[*/
    0: parse_FtSkip,
    /* FtEnd */
    /*::[*/
    4: parse_FtSkip,
    /* FtMacro */
    /*::[*/
    5: parse_FtSkip,
    /* FtButton */
    /*::[*/
    6: parse_FtSkip,
    /* FtGmo */
    /*::[*/
    7: parse_FtCf,
    /* FtCf */
    /*::[*/
    8: parse_FtSkip,
    /* FtPioGrbit */
    /*::[*/
    9: parse_FtSkip,
    /* FtPictFmla */
    /*::[*/
    10: parse_FtSkip,
    /* FtCbls */
    /*::[*/
    11: parse_FtSkip,
    /* FtRbo */
    /*::[*/
    12: parse_FtSkip,
    /* FtSbs */
    /*::[*/
    13: parse_FtNts,
    /* FtNts */
    /*::[*/
    14: parse_FtSkip,
    /* FtSbsFmla */
    /*::[*/
    15: parse_FtSkip,
    /* FtGboData */
    /*::[*/
    16: parse_FtSkip,
    /* FtEdoData */
    /*::[*/
    17: parse_FtSkip,
    /* FtRboData */
    /*::[*/
    18: parse_FtSkip,
    /* FtCblsData */
    /*::[*/
    19: parse_FtSkip,
    /* FtLbsData */
    /*::[*/
    20: parse_FtSkip,
    /* FtCblsFmla */
    /*::[*/
    21: parse_FtCmo
  };
  function parse_FtArray(blob, length) {
    var tgt = blob.l + length;
    var fts = [];
    while (blob.l < tgt) {
      var ft = blob.read_shift(2);
      blob.l -= 2;
      try {
        fts.push(FtTab[ft](blob, tgt - blob.l));
      } catch (e) {
        blob.l = tgt;
        return fts;
      }
    }
    if (blob.l != tgt) blob.l = tgt;
    return fts;
  }
  function parse_BOF(blob, length) {
    var o = { BIFFVer: 0, dt: 0 };
    o.BIFFVer = blob.read_shift(2);
    length -= 2;
    if (length >= 2) {
      o.dt = blob.read_shift(2);
      blob.l -= 2;
    }
    switch (o.BIFFVer) {
      case 1536:
      /* BIFF8 */
      case 1280:
      /* BIFF5 */
      case 1024:
      /* BIFF4 */
      case 768:
      /* BIFF3 */
      case 512:
      /* BIFF2 */
      case 2:
      case 7:
        break;
      default:
        if (length > 6) throw new Error("Unexpected BIFF Ver " + o.BIFFVer);
    }
    blob.read_shift(length);
    return o;
  }
  function parse_InterfaceHdr(blob, length) {
    if (length === 0) return 1200;
    if (blob.read_shift(2) !== 1200) {
    }
    return 1200;
  }
  function parse_WriteAccess(blob, length, opts) {
    if (opts.enc) {
      blob.l += length;
      return "";
    }
    var l = blob.l;
    var UserName = parse_XLUnicodeString2(blob, 0, opts);
    blob.read_shift(length + l - blob.l);
    return UserName;
  }
  function parse_WsBool(blob, length, opts) {
    var flags = opts && opts.biff == 8 || length == 2 ? blob.read_shift(2) : (blob.l += length, 0);
    return { fDialog: flags & 16, fBelow: flags & 64, fRight: flags & 128 };
  }
  function parse_BoundSheet8(blob, length, opts) {
    var pos = blob.read_shift(4);
    var hidden = blob.read_shift(1) & 3;
    var dt = blob.read_shift(1);
    switch (dt) {
      case 0:
        dt = "Worksheet";
        break;
      case 1:
        dt = "Macrosheet";
        break;
      case 2:
        dt = "Chartsheet";
        break;
      case 6:
        dt = "VBAModule";
        break;
    }
    var name = parse_ShortXLUnicodeString(blob, 0, opts);
    if (name.length === 0) name = "Sheet1";
    return { pos, hs: hidden, dt, name };
  }
  function parse_SST(blob, length) {
    var end = blob.l + length;
    var cnt = blob.read_shift(4);
    var ucnt = blob.read_shift(4);
    var strs2 = [];
    for (var i = 0; i != ucnt && blob.l < end; ++i) {
      strs2.push(parse_XLUnicodeRichExtendedString(blob));
    }
    strs2.Count = cnt;
    strs2.Unique = ucnt;
    return strs2;
  }
  function parse_ExtSST(blob, length) {
    var extsst = {};
    extsst.dsst = blob.read_shift(2);
    blob.l += length - 2;
    return extsst;
  }
  function parse_Row(blob) {
    var z = {};
    z.r = blob.read_shift(2);
    z.c = blob.read_shift(2);
    z.cnt = blob.read_shift(2) - z.c;
    var miyRw = blob.read_shift(2);
    blob.l += 4;
    var flags = blob.read_shift(1);
    blob.l += 3;
    if (flags & 7) z.level = flags & 7;
    if (flags & 32) z.hidden = true;
    if (flags & 64) z.hpt = miyRw / 20;
    return z;
  }
  function parse_ForceFullCalculation(blob) {
    var header = parse_frtHeader(blob);
    if (header.type != 2211) throw new Error("Invalid Future Record " + header.type);
    var fullcalc = blob.read_shift(4);
    return fullcalc !== 0;
  }
  function parse_RecalcId(blob) {
    blob.read_shift(2);
    return blob.read_shift(4);
  }
  function parse_DefaultRowHeight(blob, length, opts) {
    var f = 0;
    if (!(opts && opts.biff == 2)) {
      f = blob.read_shift(2);
    }
    var miyRw = blob.read_shift(2);
    if (opts && opts.biff == 2) {
      f = 1 - (miyRw >> 15);
      miyRw &= 32767;
    }
    var fl = { Unsynced: f & 1, DyZero: (f & 2) >> 1, ExAsc: (f & 4) >> 2, ExDsc: (f & 8) >> 3 };
    return [fl, miyRw];
  }
  function parse_Window1(blob) {
    var xWn = blob.read_shift(2), yWn = blob.read_shift(2), dxWn = blob.read_shift(2), dyWn = blob.read_shift(2);
    var flags = blob.read_shift(2), iTabCur = blob.read_shift(2), iTabFirst = blob.read_shift(2);
    var ctabSel = blob.read_shift(2), wTabRatio = blob.read_shift(2);
    return {
      Pos: [xWn, yWn],
      Dim: [dxWn, dyWn],
      Flags: flags,
      CurTab: iTabCur,
      FirstTab: iTabFirst,
      Selected: ctabSel,
      TabRatio: wTabRatio
    };
  }
  function parse_Window2(blob, length, opts) {
    if (opts && opts.biff >= 2 && opts.biff < 5) return {};
    var f = blob.read_shift(2);
    return { RTL: f & 64 };
  }
  function parse_Pane() {
  }
  function parse_Font(blob, length, opts) {
    var o = {
      dyHeight: blob.read_shift(2),
      fl: blob.read_shift(2)
    };
    switch (opts && opts.biff || 8) {
      case 2:
        break;
      case 3:
      case 4:
        blob.l += 2;
        break;
      default:
        blob.l += 10;
        break;
    }
    o.name = parse_ShortXLUnicodeString(blob, 0, opts);
    return o;
  }
  function parse_LabelSst(blob) {
    var cell = parse_XLSCell(blob);
    cell.isst = blob.read_shift(4);
    return cell;
  }
  function parse_Label(blob, length, opts) {
    if (opts.biffguess && opts.biff == 2) opts.biff = 5;
    var target = blob.l + length;
    var cell = parse_XLSCell(blob, 6);
    if (opts.biff == 2) blob.l++;
    var str = parse_XLUnicodeString(blob, target - blob.l, opts);
    cell.val = str;
    return cell;
  }
  function parse_Format(blob, length, opts) {
    var numFmtId = blob.read_shift(2);
    var fmtstr = parse_XLUnicodeString2(blob, 0, opts);
    return [numFmtId, fmtstr];
  }
  var parse_BIFF2Format = parse_XLUnicodeString2;
  function parse_Dimensions(blob, length, opts) {
    var end = blob.l + length;
    var w = opts.biff == 8 || !opts.biff ? 4 : 2;
    var r = blob.read_shift(w), R = blob.read_shift(w);
    var c = blob.read_shift(2), C = blob.read_shift(2);
    blob.l = end;
    return { s: { r, c }, e: { r: R, c: C } };
  }
  function parse_RK(blob) {
    var rw = blob.read_shift(2), col = blob.read_shift(2);
    var rkrec = parse_RkRec(blob);
    return { r: rw, c: col, ixfe: rkrec[0], rknum: rkrec[1] };
  }
  function parse_MulRk(blob, length) {
    var target = blob.l + length - 2;
    var rw = blob.read_shift(2), col = blob.read_shift(2);
    var rkrecs = [];
    while (blob.l < target) rkrecs.push(parse_RkRec(blob));
    if (blob.l !== target) throw new Error("MulRK read error");
    var lastcol = blob.read_shift(2);
    if (rkrecs.length != lastcol - col + 1) throw new Error("MulRK length mismatch");
    return { r: rw, c: col, C: lastcol, rkrec: rkrecs };
  }
  function parse_MulBlank(blob, length) {
    var target = blob.l + length - 2;
    var rw = blob.read_shift(2), col = blob.read_shift(2);
    var ixfes = [];
    while (blob.l < target) ixfes.push(blob.read_shift(2));
    if (blob.l !== target) throw new Error("MulBlank read error");
    var lastcol = blob.read_shift(2);
    if (ixfes.length != lastcol - col + 1) throw new Error("MulBlank length mismatch");
    return { r: rw, c: col, C: lastcol, ixfe: ixfes };
  }
  function parse_CellStyleXF(blob, length, style, opts) {
    var o = {};
    var a = blob.read_shift(4), b = blob.read_shift(4);
    var c = blob.read_shift(4), d = blob.read_shift(2);
    o.patternType = XLSFillPattern[c >> 26];
    if (!opts.cellStyles) return o;
    o.alc = a & 7;
    o.fWrap = a >> 3 & 1;
    o.alcV = a >> 4 & 7;
    o.fJustLast = a >> 7 & 1;
    o.trot = a >> 8 & 255;
    o.cIndent = a >> 16 & 15;
    o.fShrinkToFit = a >> 20 & 1;
    o.iReadOrder = a >> 22 & 2;
    o.fAtrNum = a >> 26 & 1;
    o.fAtrFnt = a >> 27 & 1;
    o.fAtrAlc = a >> 28 & 1;
    o.fAtrBdr = a >> 29 & 1;
    o.fAtrPat = a >> 30 & 1;
    o.fAtrProt = a >> 31 & 1;
    o.dgLeft = b & 15;
    o.dgRight = b >> 4 & 15;
    o.dgTop = b >> 8 & 15;
    o.dgBottom = b >> 12 & 15;
    o.icvLeft = b >> 16 & 127;
    o.icvRight = b >> 23 & 127;
    o.grbitDiag = b >> 30 & 3;
    o.icvTop = c & 127;
    o.icvBottom = c >> 7 & 127;
    o.icvDiag = c >> 14 & 127;
    o.dgDiag = c >> 21 & 15;
    o.icvFore = d & 127;
    o.icvBack = d >> 7 & 127;
    o.fsxButton = d >> 14 & 1;
    return o;
  }
  function parse_XF(blob, length, opts) {
    var o = {};
    o.ifnt = blob.read_shift(2);
    o.numFmtId = blob.read_shift(2);
    o.flags = blob.read_shift(2);
    o.fStyle = o.flags >> 2 & 1;
    length -= 6;
    o.data = parse_CellStyleXF(blob, length, o.fStyle, opts);
    return o;
  }
  function parse_Guts(blob) {
    blob.l += 4;
    var out = [blob.read_shift(2), blob.read_shift(2)];
    if (out[0] !== 0) out[0]--;
    if (out[1] !== 0) out[1]--;
    if (out[0] > 7 || out[1] > 7) throw new Error("Bad Gutters: " + out.join("|"));
    return out;
  }
  function parse_BoolErr(blob, length, opts) {
    var cell = parse_XLSCell(blob, 6);
    if (opts.biff == 2 || length == 9) ++blob.l;
    var val = parse_Bes(blob, 2);
    cell.val = val;
    cell.t = val === true || val === false ? "b" : "e";
    return cell;
  }
  function parse_Number(blob, length, opts) {
    if (opts.biffguess && opts.biff == 2) opts.biff = 5;
    var cell = parse_XLSCell(blob, 6);
    var xnum = parse_Xnum(blob, 8);
    cell.val = xnum;
    return cell;
  }
  var parse_XLHeaderFooter = parse_OptXLUnicodeString;
  function parse_SupBook(blob, length, opts) {
    var end = blob.l + length;
    var ctab = blob.read_shift(2);
    var cch = blob.read_shift(2);
    opts.sbcch = cch;
    if (cch == 1025 || cch == 14849) return [cch, ctab];
    if (cch < 1 || cch > 255) throw new Error("Unexpected SupBook type: " + cch);
    var virtPath = parse_XLUnicodeStringNoCch(blob, cch);
    var rgst = [];
    while (end > blob.l) rgst.push(parse_XLUnicodeString(blob));
    return [cch, ctab, virtPath, rgst];
  }
  function parse_ExternName(blob, length, opts) {
    var flags = blob.read_shift(2);
    var body;
    var o = {
      fBuiltIn: flags & 1,
      fWantAdvise: flags >>> 1 & 1,
      fWantPict: flags >>> 2 & 1,
      fOle: flags >>> 3 & 1,
      fOleLink: flags >>> 4 & 1,
      cf: flags >>> 5 & 1023,
      fIcon: flags >>> 15 & 1
    };
    if (opts.sbcch === 14849) body = parse_AddinUdf(blob, length - 2, opts);
    o.body = body || blob.read_shift(length - 2);
    if (typeof body === "string") o.Name = body;
    return o;
  }
  var XLSLblBuiltIn = [
    "_xlnm.Consolidate_Area",
    "_xlnm.Auto_Open",
    "_xlnm.Auto_Close",
    "_xlnm.Extract",
    "_xlnm.Database",
    "_xlnm.Criteria",
    "_xlnm.Print_Area",
    "_xlnm.Print_Titles",
    "_xlnm.Recorder",
    "_xlnm.Data_Form",
    "_xlnm.Auto_Activate",
    "_xlnm.Auto_Deactivate",
    "_xlnm.Sheet_Title",
    "_xlnm._FilterDatabase"
  ];
  function parse_Lbl(blob, length, opts) {
    var target = blob.l + length;
    var flags = blob.read_shift(2);
    var chKey = blob.read_shift(1);
    var cch = blob.read_shift(1);
    var cce = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    var itab = 0;
    if (!opts || opts.biff >= 5) {
      if (opts.biff != 5) blob.l += 2;
      itab = blob.read_shift(2);
      if (opts.biff == 5) blob.l += 2;
      blob.l += 4;
    }
    var name = parse_XLUnicodeStringNoCch(blob, cch, opts);
    if (flags & 32) name = XLSLblBuiltIn[name.charCodeAt(0)];
    var npflen = target - blob.l;
    if (opts && opts.biff == 2) --npflen;
    var rgce = target == blob.l || cce === 0 || !(npflen > 0) ? [] : parse_NameParsedFormula(blob, npflen, opts, cce);
    return {
      chKey,
      Name: name,
      itab,
      rgce
    };
  }
  function parse_ExternSheet(blob, length, opts) {
    if (opts.biff < 8) return parse_BIFF5ExternSheet(blob, length, opts);
    var o = [], target = blob.l + length, len = blob.read_shift(opts.biff > 8 ? 4 : 2);
    while (len-- !== 0) o.push(parse_XTI(blob, opts.biff > 8 ? 12 : 6, opts));
    if (blob.l != target) throw new Error("Bad ExternSheet: " + blob.l + " != " + target);
    return o;
  }
  function parse_BIFF5ExternSheet(blob, length, opts) {
    if (blob[blob.l + 1] == 3) blob[blob.l]++;
    var o = parse_ShortXLUnicodeString(blob, length, opts);
    return o.charCodeAt(0) == 3 ? o.slice(1) : o;
  }
  function parse_NameCmt(blob, length, opts) {
    if (opts.biff < 8) {
      blob.l += length;
      return;
    }
    var cchName = blob.read_shift(2);
    var cchComment = blob.read_shift(2);
    var name = parse_XLUnicodeStringNoCch(blob, cchName, opts);
    var comment = parse_XLUnicodeStringNoCch(blob, cchComment, opts);
    return [name, comment];
  }
  function parse_ShrFmla(blob, length, opts) {
    var ref = parse_RefU(blob, 6);
    blob.l++;
    var cUse = blob.read_shift(1);
    length -= 8;
    return [parse_SharedParsedFormula(blob, length, opts), cUse, ref];
  }
  function parse_Array(blob, length, opts) {
    var ref = parse_Ref(blob, 6);
    switch (opts.biff) {
      case 2:
        blob.l++;
        length -= 7;
        break;
      case 3:
      case 4:
        blob.l += 2;
        length -= 8;
        break;
      default:
        blob.l += 6;
        length -= 12;
    }
    return [ref, parse_ArrayParsedFormula(blob, length, opts, ref)];
  }
  function parse_MTRSettings(blob) {
    var fMTREnabled = blob.read_shift(4) !== 0;
    var fUserSetThreadCount = blob.read_shift(4) !== 0;
    var cUserThreadCount = blob.read_shift(4);
    return [fMTREnabled, fUserSetThreadCount, cUserThreadCount];
  }
  function parse_NoteSh(blob, length, opts) {
    if (opts.biff < 8) return;
    var row = blob.read_shift(2), col = blob.read_shift(2);
    var flags = blob.read_shift(2), idObj = blob.read_shift(2);
    var stAuthor = parse_XLUnicodeString2(blob, 0, opts);
    if (opts.biff < 8) blob.read_shift(1);
    return [{ r: row, c: col }, stAuthor, idObj, flags];
  }
  function parse_Note(blob, length, opts) {
    return parse_NoteSh(blob, length, opts);
  }
  function parse_MergeCells(blob, length) {
    var merges = [];
    var cmcs = blob.read_shift(2);
    while (cmcs--) merges.push(parse_Ref8U(blob, length));
    return merges;
  }
  function parse_Obj(blob, length, opts) {
    if (opts && opts.biff < 8) return parse_BIFF5Obj(blob, length, opts);
    var cmo = parse_FtCmo(blob, 22);
    var fts = parse_FtArray(blob, length - 22, cmo[1]);
    return { cmo, ft: fts };
  }
  var parse_BIFF5OT = {
    8: function(blob, length) {
      var tgt = blob.l + length;
      blob.l += 10;
      var cf = blob.read_shift(2);
      blob.l += 4;
      blob.l += 2;
      blob.l += 2;
      blob.l += 2;
      blob.l += 4;
      var cchName = blob.read_shift(1);
      blob.l += cchName;
      blob.l = tgt;
      return { fmt: cf };
    }
  };
  function parse_BIFF5Obj(blob, length, opts) {
    blob.l += 4;
    var ot = blob.read_shift(2);
    var id = blob.read_shift(2);
    var grbit = blob.read_shift(2);
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 2;
    blob.l += 6;
    length -= 36;
    var fts = [];
    fts.push((parse_BIFF5OT[ot] || parsenoop)(blob, length, opts));
    return { cmo: [id, ot, grbit], ft: fts };
  }
  function parse_TxO(blob, length, opts) {
    var s = blob.l;
    var texts = "";
    try {
      blob.l += 4;
      var ot = (opts.lastobj || { cmo: [0, 0] }).cmo[1];
      var controlInfo;
      if ([0, 5, 7, 11, 12, 14].indexOf(ot) == -1) blob.l += 6;
      else controlInfo = parse_ControlInfo(blob, 6, opts);
      var cchText = blob.read_shift(2);
      blob.read_shift(2);
      parseuint16(blob, 2);
      var len = blob.read_shift(2);
      blob.l += len;
      for (var i = 1; i < blob.lens.length - 1; ++i) {
        if (blob.l - s != blob.lens[i]) throw new Error("TxO: bad continue record");
        var hdr = blob[blob.l];
        var t = parse_XLUnicodeStringNoCch(blob, blob.lens[i + 1] - blob.lens[i] - 1);
        texts += t;
        if (texts.length >= (hdr ? cchText : 2 * cchText)) break;
      }
      if (texts.length !== cchText && texts.length !== cchText * 2) {
        throw new Error("cchText: " + cchText + " != " + texts.length);
      }
      blob.l = s + length;
      return { t: texts };
    } catch (e) {
      blob.l = s + length;
      return { t: texts };
    }
  }
  function parse_HLink(blob, length) {
    var ref = parse_Ref8U(blob, 8);
    blob.l += 16;
    var hlink = parse_Hyperlink(blob, length - 24);
    return [ref, hlink];
  }
  function parse_HLinkTooltip(blob, length) {
    blob.read_shift(2);
    var ref = parse_Ref8U(blob, 8);
    var wzTooltip = blob.read_shift((length - 10) / 2, "dbcs-cont");
    wzTooltip = wzTooltip.replace(chr0, "");
    return [ref, wzTooltip];
  }
  function parse_Country(blob) {
    var o = [0, 0], d;
    d = blob.read_shift(2);
    o[0] = CountryEnum[d] || d;
    d = blob.read_shift(2);
    o[1] = CountryEnum[d] || d;
    return o;
  }
  function parse_ClrtClient(blob) {
    var ccv = blob.read_shift(2);
    var o = [];
    while (ccv-- > 0) o.push(parse_LongRGB(blob, 8));
    return o;
  }
  function parse_Palette(blob) {
    var ccv = blob.read_shift(2);
    var o = [];
    while (ccv-- > 0) o.push(parse_LongRGB(blob, 8));
    return o;
  }
  function parse_XFCRC(blob) {
    blob.l += 2;
    var o = { cxfs: 0, crc: 0 };
    o.cxfs = blob.read_shift(2);
    o.crc = blob.read_shift(4);
    return o;
  }
  function parse_ColInfo(blob, length, opts) {
    if (!opts.cellStyles) return parsenoop(blob, length);
    var w = opts && opts.biff >= 12 ? 4 : 2;
    var colFirst = blob.read_shift(w);
    var colLast = blob.read_shift(w);
    var coldx = blob.read_shift(w);
    var ixfe = blob.read_shift(w);
    var flags = blob.read_shift(2);
    if (w == 2) blob.l += 2;
    var o = { s: colFirst, e: colLast, w: coldx, ixfe, flags };
    if (opts.biff >= 5 || !opts.biff) o.level = flags >> 8 & 7;
    return o;
  }
  function parse_Setup(blob, length) {
    var o = {};
    if (length < 32) return o;
    blob.l += 16;
    o.header = parse_Xnum(blob, 8);
    o.footer = parse_Xnum(blob, 8);
    blob.l += 2;
    return o;
  }
  function parse_ShtProps(blob, length, opts) {
    var def = { area: false };
    if (opts.biff != 5) {
      blob.l += length;
      return def;
    }
    var d = blob.read_shift(1);
    blob.l += 3;
    if (d & 16) def.area = true;
    return def;
  }
  var parse_Blank = parse_XLSCell;
  var parse_Scl = parseuint16a;
  var parse_String = parse_XLUnicodeString;
  function parse_ImData(blob) {
    var cf = blob.read_shift(2);
    var env = blob.read_shift(2);
    var lcb = blob.read_shift(4);
    var o = { fmt: cf, env, len: lcb, data: blob.slice(blob.l, blob.l + lcb) };
    blob.l += lcb;
    return o;
  }
  function parse_BIFF2STR(blob, length, opts) {
    if (opts.biffguess && opts.biff == 5) opts.biff = 2;
    var cell = parse_XLSCell(blob, 6);
    ++blob.l;
    var str = parse_XLUnicodeString2(blob, length - 7, opts);
    cell.t = "str";
    cell.val = str;
    return cell;
  }
  function parse_BIFF2NUM(blob) {
    var cell = parse_XLSCell(blob, 6);
    ++blob.l;
    var num = parse_Xnum(blob, 8);
    cell.t = "n";
    cell.val = num;
    return cell;
  }
  function parse_BIFF2INT(blob) {
    var cell = parse_XLSCell(blob, 6);
    ++blob.l;
    var num = blob.read_shift(2);
    cell.t = "n";
    cell.val = num;
    return cell;
  }
  function parse_BIFF2STRING(blob) {
    var cch = blob.read_shift(1);
    if (cch === 0) {
      blob.l++;
      return "";
    }
    return blob.read_shift(cch, "sbcs-cont");
  }
  function parse_BIFF2FONTXTRA(blob, length) {
    blob.l += 6;
    blob.l += 2;
    blob.l += 1;
    blob.l += 3;
    blob.l += 1;
    blob.l += length - 13;
  }
  function parse_RString(blob, length, opts) {
    var end = blob.l + length;
    var cell = parse_XLSCell(blob, 6);
    var cch = blob.read_shift(2);
    var str = parse_XLUnicodeStringNoCch(blob, cch, opts);
    blob.l = end;
    cell.t = "str";
    cell.val = str;
    return cell;
  }
  var DBF_SUPPORTED_VERSIONS = [2, 3, 48, 49, 131, 139, 140, 245];
  var DBF = /* @__PURE__ */ function() {
    var dbf_codepage_map = {
      /* Code Pages Supported by Visual FoxPro */
      /*::[*/
      1: 437,
      /*::[*/
      2: 850,
      /*::[*/
      3: 1252,
      /*::[*/
      4: 1e4,
      /*::[*/
      100: 852,
      /*::[*/
      101: 866,
      /*::[*/
      102: 865,
      /*::[*/
      103: 861,
      /*::[*/
      104: 895,
      /*::[*/
      105: 620,
      /*::[*/
      106: 737,
      /*::[*/
      107: 857,
      /*::[*/
      120: 950,
      /*::[*/
      121: 949,
      /*::[*/
      122: 936,
      /*::[*/
      123: 932,
      /*::[*/
      124: 874,
      /*::[*/
      125: 1255,
      /*::[*/
      126: 1256,
      /*::[*/
      150: 10007,
      /*::[*/
      151: 10029,
      /*::[*/
      152: 10006,
      /*::[*/
      200: 1250,
      /*::[*/
      201: 1251,
      /*::[*/
      202: 1254,
      /*::[*/
      203: 1253,
      /* shapefile DBF extension */
      /*::[*/
      0: 20127,
      /*::[*/
      8: 865,
      /*::[*/
      9: 437,
      /*::[*/
      10: 850,
      /*::[*/
      11: 437,
      /*::[*/
      13: 437,
      /*::[*/
      14: 850,
      /*::[*/
      15: 437,
      /*::[*/
      16: 850,
      /*::[*/
      17: 437,
      /*::[*/
      18: 850,
      /*::[*/
      19: 932,
      /*::[*/
      20: 850,
      /*::[*/
      21: 437,
      /*::[*/
      22: 850,
      /*::[*/
      23: 865,
      /*::[*/
      24: 437,
      /*::[*/
      25: 437,
      /*::[*/
      26: 850,
      /*::[*/
      27: 437,
      /*::[*/
      28: 863,
      /*::[*/
      29: 850,
      /*::[*/
      31: 852,
      /*::[*/
      34: 852,
      /*::[*/
      35: 852,
      /*::[*/
      36: 860,
      /*::[*/
      37: 850,
      /*::[*/
      38: 866,
      /*::[*/
      55: 850,
      /*::[*/
      64: 852,
      /*::[*/
      77: 936,
      /*::[*/
      78: 949,
      /*::[*/
      79: 950,
      /*::[*/
      80: 874,
      /*::[*/
      87: 1252,
      /*::[*/
      88: 1252,
      /*::[*/
      89: 1252,
      /*::[*/
      108: 863,
      /*::[*/
      134: 737,
      /*::[*/
      135: 852,
      /*::[*/
      136: 857,
      /*::[*/
      204: 1257,
      /*::[*/
      255: 16969
    };
    var dbf_reverse_map = evert({
      /*::[*/
      1: 437,
      /*::[*/
      2: 850,
      /*::[*/
      3: 1252,
      /*::[*/
      4: 1e4,
      /*::[*/
      100: 852,
      /*::[*/
      101: 866,
      /*::[*/
      102: 865,
      /*::[*/
      103: 861,
      /*::[*/
      104: 895,
      /*::[*/
      105: 620,
      /*::[*/
      106: 737,
      /*::[*/
      107: 857,
      /*::[*/
      120: 950,
      /*::[*/
      121: 949,
      /*::[*/
      122: 936,
      /*::[*/
      123: 932,
      /*::[*/
      124: 874,
      /*::[*/
      125: 1255,
      /*::[*/
      126: 1256,
      /*::[*/
      150: 10007,
      /*::[*/
      151: 10029,
      /*::[*/
      152: 10006,
      /*::[*/
      200: 1250,
      /*::[*/
      201: 1251,
      /*::[*/
      202: 1254,
      /*::[*/
      203: 1253,
      /*::[*/
      0: 20127
    });
    function dbf_to_aoa(buf, opts) {
      var out = [];
      var d = new_raw_buf(1);
      switch (opts.type) {
        case "base64":
          d = s2a(Base64_decode(buf));
          break;
        case "binary":
          d = s2a(buf);
          break;
        case "buffer":
        case "array":
          d = buf;
          break;
      }
      prep_blob(d, 0);
      var ft = d.read_shift(1);
      var memo = !!(ft & 136);
      var vfp = false, l7 = false;
      switch (ft) {
        case 2:
          break;
        // dBASE II
        case 3:
          break;
        // dBASE III
        case 48:
          vfp = true;
          memo = true;
          break;
        // VFP
        case 49:
          vfp = true;
          memo = true;
          break;
        // VFP with autoincrement
        // 0x43 dBASE IV SQL table files
        // 0x63 dBASE IV SQL system files
        case 131:
          break;
        // dBASE III with memo
        case 139:
          break;
        // dBASE IV with memo
        case 140:
          l7 = true;
          break;
        // dBASE Level 7 with memo
        // case 0xCB dBASE IV SQL table files with memo
        case 245:
          break;
        // FoxPro 2.x with memo
        // case 0xFB FoxBASE
        default:
          throw new Error("DBF Unsupported Version: " + ft.toString(16));
      }
      var nrow = 0, fpos = 521;
      if (ft == 2) nrow = d.read_shift(2);
      d.l += 3;
      if (ft != 2) nrow = d.read_shift(4);
      if (nrow > 1048576) nrow = 1e6;
      if (ft != 2) fpos = d.read_shift(2);
      var rlen = d.read_shift(2);
      var current_cp = opts.codepage || 1252;
      if (ft != 2) {
        d.l += 16;
        d.read_shift(1);
        if (d[d.l] !== 0) current_cp = dbf_codepage_map[d[d.l]];
        d.l += 1;
        d.l += 2;
      }
      if (l7) d.l += 36;
      var fields = [], field = {};
      var hend = Math.min(d.length, ft == 2 ? 521 : fpos - 10 - (vfp ? 264 : 0));
      var ww = l7 ? 32 : 11;
      while (d.l < hend && d[d.l] != 13) {
        field = {};
        field.name = $cptable.utils.decode(current_cp, d.slice(d.l, d.l + ww)).replace(/[\u0000\r\n].*$/g, "");
        d.l += ww;
        field.type = String.fromCharCode(d.read_shift(1));
        if (ft != 2 && !l7) field.offset = d.read_shift(4);
        field.len = d.read_shift(1);
        if (ft == 2) field.offset = d.read_shift(2);
        field.dec = d.read_shift(1);
        if (field.name.length) fields.push(field);
        if (ft != 2) d.l += l7 ? 13 : 14;
        switch (field.type) {
          case "B":
            if ((!vfp || field.len != 8) && opts.WTF) console.log("Skipping " + field.name + ":" + field.type);
            break;
          case "G":
          // General (FoxPro and dBASE L7)
          case "P":
            if (opts.WTF) console.log("Skipping " + field.name + ":" + field.type);
            break;
          case "+":
          // Autoincrement (dBASE L7 only)
          case "0":
          // _NullFlags (VFP only)
          case "@":
          // Timestamp (dBASE L7 only)
          case "C":
          // Character (dBASE II)
          case "D":
          // Date (dBASE III)
          case "F":
          // Float (dBASE IV)
          case "I":
          // Long (VFP and dBASE L7)
          case "L":
          // Logical (dBASE II)
          case "M":
          // Memo (dBASE III)
          case "N":
          // Number (dBASE II)
          case "O":
          // Double (dBASE L7 only)
          case "T":
          // Datetime (VFP only)
          case "Y":
            break;
          default:
            throw new Error("Unknown Field Type: " + field.type);
        }
      }
      if (d[d.l] !== 13) d.l = fpos - 1;
      if (d.read_shift(1) !== 13) throw new Error("DBF Terminator not found " + d.l + " " + d[d.l]);
      d.l = fpos;
      var R = 0, C = 0;
      out[0] = [];
      for (C = 0; C != fields.length; ++C) out[0][C] = fields[C].name;
      while (nrow-- > 0) {
        if (d[d.l] === 42) {
          d.l += rlen;
          continue;
        }
        ++d.l;
        out[++R] = [];
        C = 0;
        for (C = 0; C != fields.length; ++C) {
          var dd = d.slice(d.l, d.l + fields[C].len);
          d.l += fields[C].len;
          prep_blob(dd, 0);
          var s = $cptable.utils.decode(current_cp, dd);
          switch (fields[C].type) {
            case "C":
              if (s.trim().length) out[R][C] = s.replace(/\s+$/, "");
              break;
            case "D":
              if (s.length === 8) out[R][C] = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
              else out[R][C] = s;
              break;
            case "F":
              out[R][C] = parseFloat(s.trim());
              break;
            case "+":
            case "I":
              out[R][C] = l7 ? dd.read_shift(-4, "i") ^ 2147483648 : dd.read_shift(4, "i");
              break;
            case "L":
              switch (s.trim().toUpperCase()) {
                case "Y":
                case "T":
                  out[R][C] = true;
                  break;
                case "N":
                case "F":
                  out[R][C] = false;
                  break;
                case "":
                case "?":
                  break;
                default:
                  throw new Error("DBF Unrecognized L:|" + s + "|");
              }
              break;
            case "M":
              if (!memo) throw new Error("DBF Unexpected MEMO for type " + ft.toString(16));
              out[R][C] = "##MEMO##" + (l7 ? parseInt(s.trim(), 10) : dd.read_shift(4));
              break;
            case "N":
              s = s.replace(/\u0000/g, "").trim();
              if (s && s != ".") out[R][C] = +s || 0;
              break;
            case "@":
              out[R][C] = new Date(dd.read_shift(-8, "f") - 621356832e5);
              break;
            case "T":
              out[R][C] = new Date((dd.read_shift(4) - 2440588) * 864e5 + dd.read_shift(4));
              break;
            case "Y":
              out[R][C] = dd.read_shift(4, "i") / 1e4 + dd.read_shift(4, "i") / 1e4 * Math.pow(2, 32);
              break;
            case "O":
              out[R][C] = -dd.read_shift(-8, "f");
              break;
            case "B":
              if (vfp && fields[C].len == 8) {
                out[R][C] = dd.read_shift(8, "f");
                break;
              }
            /* falls through */
            case "G":
            case "P":
              dd.l += fields[C].len;
              break;
            case "0":
              if (fields[C].name === "_NullFlags") break;
            /* falls through */
            default:
              throw new Error("DBF Unsupported data type " + fields[C].type);
          }
        }
      }
      if (ft != 2) {
        if (d.l < d.length && d[d.l++] != 26) throw new Error("DBF EOF Marker missing " + (d.l - 1) + " of " + d.length + " " + d[d.l - 1].toString(16));
      }
      if (opts && opts.sheetRows) out = out.slice(0, opts.sheetRows);
      opts.DBF = fields;
      return out;
    }
    function dbf_to_sheet(buf, opts) {
      var o = opts || {};
      if (!o.dateNF) o.dateNF = "yyyymmdd";
      var ws = aoa_to_sheet(dbf_to_aoa(buf, o), o);
      ws["!cols"] = o.DBF.map(function(field) {
        return {
          wch: field.len,
          DBF: field
        };
      });
      delete o.DBF;
      return ws;
    }
    function dbf_to_workbook(buf, opts) {
      try {
        return sheet_to_workbook(dbf_to_sheet(buf, opts), opts);
      } catch (e) {
        if (opts && opts.WTF) throw e;
      }
      return { SheetNames: [], Sheets: {} };
    }
    var _RLEN = { "B": 8, "C": 250, "L": 1, "D": 8, "?": 0, "": 0 };
    function sheet_to_dbf(ws, opts) {
      var o = opts || {};
      if (+o.codepage >= 0) set_cp(+o.codepage);
      if (o.type == "string") throw new Error("Cannot write DBF to JS string");
      var ba = buf_array();
      var aoa = sheet_to_json(ws, { header: 1, raw: true, cellDates: true });
      var headers = aoa[0], data = aoa.slice(1), cols = ws["!cols"] || [];
      var i = 0, j = 0, hcnt = 0, rlen = 1;
      for (i = 0; i < headers.length; ++i) {
        if (((cols[i] || {}).DBF || {}).name) {
          headers[i] = cols[i].DBF.name;
          ++hcnt;
          continue;
        }
        if (headers[i] == null) continue;
        ++hcnt;
        if (typeof headers[i] === "number") headers[i] = headers[i].toString(10);
        if (typeof headers[i] !== "string") throw new Error("DBF Invalid column name " + headers[i] + " |" + typeof headers[i] + "|");
        if (headers.indexOf(headers[i]) !== i) {
          for (j = 0; j < 1024; ++j)
            if (headers.indexOf(headers[i] + "_" + j) == -1) {
              headers[i] += "_" + j;
              break;
            }
        }
      }
      var range = safe_decode_range(ws["!ref"]);
      var coltypes = [];
      var colwidths = [];
      var coldecimals = [];
      for (i = 0; i <= range.e.c - range.s.c; ++i) {
        var guess = "", _guess = "", maxlen = 0;
        var col = [];
        for (j = 0; j < data.length; ++j) {
          if (data[j][i] != null) col.push(data[j][i]);
        }
        if (col.length == 0 || headers[i] == null) {
          coltypes[i] = "?";
          continue;
        }
        for (j = 0; j < col.length; ++j) {
          switch (typeof col[j]) {
            /* TODO: check if L2 compat is desired */
            case "number":
              _guess = "B";
              break;
            case "string":
              _guess = "C";
              break;
            case "boolean":
              _guess = "L";
              break;
            case "object":
              _guess = col[j] instanceof Date ? "D" : "C";
              break;
            default:
              _guess = "C";
          }
          maxlen = Math.max(maxlen, String(col[j]).length);
          guess = guess && guess != _guess ? "C" : _guess;
        }
        if (maxlen > 250) maxlen = 250;
        _guess = ((cols[i] || {}).DBF || {}).type;
        if (_guess == "C") {
          if (cols[i].DBF.len > maxlen) maxlen = cols[i].DBF.len;
        }
        if (guess == "B" && _guess == "N") {
          guess = "N";
          coldecimals[i] = cols[i].DBF.dec;
          maxlen = cols[i].DBF.len;
        }
        colwidths[i] = guess == "C" || _guess == "N" ? maxlen : _RLEN[guess] || 0;
        rlen += colwidths[i];
        coltypes[i] = guess;
      }
      var h = ba.next(32);
      h.write_shift(4, 318902576);
      h.write_shift(4, data.length);
      h.write_shift(2, 296 + 32 * hcnt);
      h.write_shift(2, rlen);
      for (i = 0; i < 4; ++i) h.write_shift(4, 0);
      h.write_shift(4, 0 | (+dbf_reverse_map[
        /*::String(*/
        current_ansi
        /*::)*/
      ] || 3) << 8);
      for (i = 0, j = 0; i < headers.length; ++i) {
        if (headers[i] == null) continue;
        var hf = ba.next(32);
        var _f = (headers[i].slice(-10) + "\0\0\0\0\0\0\0\0\0\0\0").slice(0, 11);
        hf.write_shift(1, _f, "sbcs");
        hf.write_shift(1, coltypes[i] == "?" ? "C" : coltypes[i], "sbcs");
        hf.write_shift(4, j);
        hf.write_shift(1, colwidths[i] || _RLEN[coltypes[i]] || 0);
        hf.write_shift(1, coldecimals[i] || 0);
        hf.write_shift(1, 2);
        hf.write_shift(4, 0);
        hf.write_shift(1, 0);
        hf.write_shift(4, 0);
        hf.write_shift(4, 0);
        j += colwidths[i] || _RLEN[coltypes[i]] || 0;
      }
      var hb = ba.next(264);
      hb.write_shift(4, 13);
      for (i = 0; i < 65; ++i) hb.write_shift(4, 0);
      for (i = 0; i < data.length; ++i) {
        var rout = ba.next(rlen);
        rout.write_shift(1, 0);
        for (j = 0; j < headers.length; ++j) {
          if (headers[j] == null) continue;
          switch (coltypes[j]) {
            case "L":
              rout.write_shift(1, data[i][j] == null ? 63 : data[i][j] ? 84 : 70);
              break;
            case "B":
              rout.write_shift(8, data[i][j] || 0, "f");
              break;
            case "N":
              var _n = "0";
              if (typeof data[i][j] == "number") _n = data[i][j].toFixed(coldecimals[j] || 0);
              for (hcnt = 0; hcnt < colwidths[j] - _n.length; ++hcnt) rout.write_shift(1, 32);
              rout.write_shift(1, _n, "sbcs");
              break;
            case "D":
              if (!data[i][j]) rout.write_shift(8, "00000000", "sbcs");
              else {
                rout.write_shift(4, ("0000" + data[i][j].getFullYear()).slice(-4), "sbcs");
                rout.write_shift(2, ("00" + (data[i][j].getMonth() + 1)).slice(-2), "sbcs");
                rout.write_shift(2, ("00" + data[i][j].getDate()).slice(-2), "sbcs");
              }
              break;
            case "C":
              var _s = String(data[i][j] != null ? data[i][j] : "").slice(0, colwidths[j]);
              rout.write_shift(1, _s, "sbcs");
              for (hcnt = 0; hcnt < colwidths[j] - _s.length; ++hcnt) rout.write_shift(1, 32);
              break;
          }
        }
      }
      ba.next(1).write_shift(1, 26);
      return ba.end();
    }
    return {
      to_workbook: dbf_to_workbook,
      to_sheet: dbf_to_sheet,
      from_sheet: sheet_to_dbf
    };
  }();
  var SYLK = /* @__PURE__ */ function() {
    var sylk_escapes = {
      AA: "\xC0",
      BA: "\xC1",
      CA: "\xC2",
      DA: 195,
      HA: "\xC4",
      JA: 197,
      AE: "\xC8",
      BE: "\xC9",
      CE: "\xCA",
      HE: "\xCB",
      AI: "\xCC",
      BI: "\xCD",
      CI: "\xCE",
      HI: "\xCF",
      AO: "\xD2",
      BO: "\xD3",
      CO: "\xD4",
      DO: 213,
      HO: "\xD6",
      AU: "\xD9",
      BU: "\xDA",
      CU: "\xDB",
      HU: "\xDC",
      Aa: "\xE0",
      Ba: "\xE1",
      Ca: "\xE2",
      Da: 227,
      Ha: "\xE4",
      Ja: 229,
      Ae: "\xE8",
      Be: "\xE9",
      Ce: "\xEA",
      He: "\xEB",
      Ai: "\xEC",
      Bi: "\xED",
      Ci: "\xEE",
      Hi: "\xEF",
      Ao: "\xF2",
      Bo: "\xF3",
      Co: "\xF4",
      Do: 245,
      Ho: "\xF6",
      Au: "\xF9",
      Bu: "\xFA",
      Cu: "\xFB",
      Hu: "\xFC",
      KC: "\xC7",
      Kc: "\xE7",
      q: "\xE6",
      z: "\u0153",
      a: "\xC6",
      j: "\u0152",
      DN: 209,
      Dn: 241,
      Hy: 255,
      S: 169,
      c: 170,
      R: 174,
      "B ": 180,
      /*::[*/
      0: 176,
      /*::[*/
      1: 177,
      /*::[*/
      2: 178,
      /*::[*/
      3: 179,
      /*::[*/
      5: 181,
      /*::[*/
      6: 182,
      /*::[*/
      7: 183,
      Q: 185,
      k: 186,
      b: 208,
      i: 216,
      l: 222,
      s: 240,
      y: 248,
      "!": 161,
      '"': 162,
      "#": 163,
      "(": 164,
      "%": 165,
      "'": 167,
      "H ": 168,
      "+": 171,
      ";": 187,
      "<": 188,
      "=": 189,
      ">": 190,
      "?": 191,
      "{": 223
    };
    var sylk_char_regex = new RegExp("\x1BN(" + keys(sylk_escapes).join("|").replace(/\|\|\|/, "|\\||").replace(/([?()+])/g, "\\$1") + "|\\|)", "gm");
    var sylk_char_fn = function(_, $1) {
      var o = sylk_escapes[$1];
      return typeof o == "number" ? _getansi(o) : o;
    };
    var decode_sylk_char = function($$, $1, $22) {
      var newcc = $1.charCodeAt(0) - 32 << 4 | $22.charCodeAt(0) - 48;
      return newcc == 59 ? $$ : _getansi(newcc);
    };
    sylk_escapes["|"] = 254;
    function sylk_to_aoa(d, opts) {
      switch (opts.type) {
        case "base64":
          return sylk_to_aoa_str(Base64_decode(d), opts);
        case "binary":
          return sylk_to_aoa_str(d, opts);
        case "buffer":
          return sylk_to_aoa_str(has_buf && Buffer.isBuffer(d) ? d.toString("binary") : a2s(d), opts);
        case "array":
          return sylk_to_aoa_str(cc2str(d), opts);
      }
      throw new Error("Unrecognized type " + opts.type);
    }
    function sylk_to_aoa_str(str, opts) {
      var records = str.split(/[\n\r]+/), R = -1, C = -1, ri = 0, rj = 0, arr = [];
      var formats = [];
      var next_cell_format = null;
      var sht = {}, rowinfo = [], colinfo = [], cw = [];
      var Mval = 0, j;
      if (+opts.codepage >= 0) set_cp(+opts.codepage);
      for (; ri !== records.length; ++ri) {
        Mval = 0;
        var rstr = records[ri].trim().replace(/\x1B([\x20-\x2F])([\x30-\x3F])/g, decode_sylk_char).replace(sylk_char_regex, sylk_char_fn);
        var record = rstr.replace(/;;/g, "\0").split(";").map(function(x) {
          return x.replace(/\u0000/g, ";");
        });
        var RT = record[0], val;
        if (rstr.length > 0) switch (RT) {
          case "ID":
            break;
          /* header */
          case "E":
            break;
          /* EOF */
          case "B":
            break;
          /* dimensions */
          case "O":
            break;
          /* options? */
          case "W":
            break;
          /* window? */
          case "P":
            if (record[1].charAt(0) == "P")
              formats.push(rstr.slice(3).replace(/;;/g, ";"));
            break;
          case "C":
            var C_seen_K = false, C_seen_X = false, C_seen_S = false, C_seen_E = false, _R = -1, _C = -1;
            for (rj = 1; rj < record.length; ++rj) switch (record[rj].charAt(0)) {
              case "A":
                break;
              // TODO: comment
              case "X":
                C = parseInt(record[rj].slice(1)) - 1;
                C_seen_X = true;
                break;
              case "Y":
                R = parseInt(record[rj].slice(1)) - 1;
                if (!C_seen_X) C = 0;
                for (j = arr.length; j <= R; ++j) arr[j] = [];
                break;
              case "K":
                val = record[rj].slice(1);
                if (val.charAt(0) === '"') val = val.slice(1, val.length - 1);
                else if (val === "TRUE") val = true;
                else if (val === "FALSE") val = false;
                else if (!isNaN(fuzzynum(val))) {
                  val = fuzzynum(val);
                  if (next_cell_format !== null && fmt_is_date(next_cell_format)) val = numdate(val);
                } else if (!isNaN(fuzzydate(val).getDate())) {
                  val = parseDate(val);
                }
                if (typeof $cptable !== "undefined" && typeof val == "string" && (opts || {}).type != "string" && (opts || {}).codepage) val = $cptable.utils.decode(opts.codepage, val);
                C_seen_K = true;
                break;
              case "E":
                C_seen_E = true;
                var formula = rc_to_a1(record[rj].slice(1), { r: R, c: C });
                arr[R][C] = [arr[R][C], formula];
                break;
              case "S":
                C_seen_S = true;
                arr[R][C] = [arr[R][C], "S5S"];
                break;
              case "G":
                break;
              // unknown
              case "R":
                _R = parseInt(record[rj].slice(1)) - 1;
                break;
              case "C":
                _C = parseInt(record[rj].slice(1)) - 1;
                break;
              default:
                if (opts && opts.WTF) throw new Error("SYLK bad record " + rstr);
            }
            if (C_seen_K) {
              if (arr[R][C] && arr[R][C].length == 2) arr[R][C][0] = val;
              else arr[R][C] = val;
              next_cell_format = null;
            }
            if (C_seen_S) {
              if (C_seen_E) throw new Error("SYLK shared formula cannot have own formula");
              var shrbase = _R > -1 && arr[_R][_C];
              if (!shrbase || !shrbase[1]) throw new Error("SYLK shared formula cannot find base");
              arr[R][C][1] = shift_formula_str(shrbase[1], { r: R - _R, c: C - _C });
            }
            break;
          case "F":
            var F_seen = 0;
            for (rj = 1; rj < record.length; ++rj) switch (record[rj].charAt(0)) {
              case "X":
                C = parseInt(record[rj].slice(1)) - 1;
                ++F_seen;
                break;
              case "Y":
                R = parseInt(record[rj].slice(1)) - 1;
                for (j = arr.length; j <= R; ++j) arr[j] = [];
                break;
              case "M":
                Mval = parseInt(record[rj].slice(1)) / 20;
                break;
              case "F":
                break;
              /* ??? */
              case "G":
                break;
              /* hide grid */
              case "P":
                next_cell_format = formats[parseInt(record[rj].slice(1))];
                break;
              case "S":
                break;
              /* cell style */
              case "D":
                break;
              /* column */
              case "N":
                break;
              /* font */
              case "W":
                cw = record[rj].slice(1).split(" ");
                for (j = parseInt(cw[0], 10); j <= parseInt(cw[1], 10); ++j) {
                  Mval = parseInt(cw[2], 10);
                  colinfo[j - 1] = Mval === 0 ? { hidden: true } : { wch: Mval };
                  process_col(colinfo[j - 1]);
                }
                break;
              case "C":
                C = parseInt(record[rj].slice(1)) - 1;
                if (!colinfo[C]) colinfo[C] = {};
                break;
              case "R":
                R = parseInt(record[rj].slice(1)) - 1;
                if (!rowinfo[R]) rowinfo[R] = {};
                if (Mval > 0) {
                  rowinfo[R].hpt = Mval;
                  rowinfo[R].hpx = pt2px(Mval);
                } else if (Mval === 0) rowinfo[R].hidden = true;
                break;
              default:
                if (opts && opts.WTF) throw new Error("SYLK bad record " + rstr);
            }
            if (F_seen < 1) next_cell_format = null;
            break;
          default:
            if (opts && opts.WTF) throw new Error("SYLK bad record " + rstr);
        }
      }
      if (rowinfo.length > 0) sht["!rows"] = rowinfo;
      if (colinfo.length > 0) sht["!cols"] = colinfo;
      if (opts && opts.sheetRows) arr = arr.slice(0, opts.sheetRows);
      return [arr, sht];
    }
    function sylk_to_sheet(d, opts) {
      var aoasht = sylk_to_aoa(d, opts);
      var aoa = aoasht[0], ws = aoasht[1];
      var o = aoa_to_sheet(aoa, opts);
      keys(ws).forEach(function(k) {
        o[k] = ws[k];
      });
      return o;
    }
    function sylk_to_workbook(d, opts) {
      return sheet_to_workbook(sylk_to_sheet(d, opts), opts);
    }
    function write_ws_cell_sylk(cell, ws, R, C) {
      var o = "C;Y" + (R + 1) + ";X" + (C + 1) + ";K";
      switch (cell.t) {
        case "n":
          o += cell.v || 0;
          if (cell.f && !cell.F) o += ";E" + a1_to_rc(cell.f, { r: R, c: C });
          break;
        case "b":
          o += cell.v ? "TRUE" : "FALSE";
          break;
        case "e":
          o += cell.w || cell.v;
          break;
        case "d":
          o += '"' + (cell.w || cell.v) + '"';
          break;
        case "s":
          o += '"' + cell.v.replace(/"/g, "").replace(/;/g, ";;") + '"';
          break;
      }
      return o;
    }
    function write_ws_cols_sylk(out, cols) {
      cols.forEach(function(col, i) {
        var rec = "F;W" + (i + 1) + " " + (i + 1) + " ";
        if (col.hidden) rec += "0";
        else {
          if (typeof col.width == "number" && !col.wpx) col.wpx = width2px(col.width);
          if (typeof col.wpx == "number" && !col.wch) col.wch = px2char(col.wpx);
          if (typeof col.wch == "number") rec += Math.round(col.wch);
        }
        if (rec.charAt(rec.length - 1) != " ") out.push(rec);
      });
    }
    function write_ws_rows_sylk(out, rows) {
      rows.forEach(function(row, i) {
        var rec = "F;";
        if (row.hidden) rec += "M0;";
        else if (row.hpt) rec += "M" + 20 * row.hpt + ";";
        else if (row.hpx) rec += "M" + 20 * px2pt(row.hpx) + ";";
        if (rec.length > 2) out.push(rec + "R" + (i + 1));
      });
    }
    function sheet_to_sylk(ws, opts) {
      var preamble = ["ID;PWXL;N;E"], o = [];
      var r = safe_decode_range(ws["!ref"]), cell;
      var dense = Array.isArray(ws);
      var RS = "\r\n";
      preamble.push("P;PGeneral");
      preamble.push("F;P0;DG0G8;M255");
      if (ws["!cols"]) write_ws_cols_sylk(preamble, ws["!cols"]);
      if (ws["!rows"]) write_ws_rows_sylk(preamble, ws["!rows"]);
      preamble.push("B;Y" + (r.e.r - r.s.r + 1) + ";X" + (r.e.c - r.s.c + 1) + ";D" + [r.s.c, r.s.r, r.e.c, r.e.r].join(" "));
      for (var R = r.s.r; R <= r.e.r; ++R) {
        for (var C = r.s.c; C <= r.e.c; ++C) {
          var coord = encode_cell({ r: R, c: C });
          cell = dense ? (ws[R] || [])[C] : ws[coord];
          if (!cell || cell.v == null && (!cell.f || cell.F)) continue;
          o.push(write_ws_cell_sylk(cell, ws, R, C, opts));
        }
      }
      return preamble.join(RS) + RS + o.join(RS) + RS + "E" + RS;
    }
    return {
      to_workbook: sylk_to_workbook,
      to_sheet: sylk_to_sheet,
      from_sheet: sheet_to_sylk
    };
  }();
  var DIF = /* @__PURE__ */ function() {
    function dif_to_aoa(d, opts) {
      switch (opts.type) {
        case "base64":
          return dif_to_aoa_str(Base64_decode(d), opts);
        case "binary":
          return dif_to_aoa_str(d, opts);
        case "buffer":
          return dif_to_aoa_str(has_buf && Buffer.isBuffer(d) ? d.toString("binary") : a2s(d), opts);
        case "array":
          return dif_to_aoa_str(cc2str(d), opts);
      }
      throw new Error("Unrecognized type " + opts.type);
    }
    function dif_to_aoa_str(str, opts) {
      var records = str.split("\n"), R = -1, C = -1, ri = 0, arr = [];
      for (; ri !== records.length; ++ri) {
        if (records[ri].trim() === "BOT") {
          arr[++R] = [];
          C = 0;
          continue;
        }
        if (R < 0) continue;
        var metadata = records[ri].trim().split(",");
        var type = metadata[0], value = metadata[1];
        ++ri;
        var data = records[ri] || "";
        while ((data.match(/["]/g) || []).length & 1 && ri < records.length - 1) data += "\n" + records[++ri];
        data = data.trim();
        switch (+type) {
          case -1:
            if (data === "BOT") {
              arr[++R] = [];
              C = 0;
              continue;
            } else if (data !== "EOD") throw new Error("Unrecognized DIF special command " + data);
            break;
          case 0:
            if (data === "TRUE") arr[R][C] = true;
            else if (data === "FALSE") arr[R][C] = false;
            else if (!isNaN(fuzzynum(value))) arr[R][C] = fuzzynum(value);
            else if (!isNaN(fuzzydate(value).getDate())) arr[R][C] = parseDate(value);
            else arr[R][C] = value;
            ++C;
            break;
          case 1:
            data = data.slice(1, data.length - 1);
            data = data.replace(/""/g, '"');
            if (DIF_XL && data && data.match(/^=".*"$/)) data = data.slice(2, -1);
            arr[R][C++] = data !== "" ? data : null;
            break;
        }
        if (data === "EOD") break;
      }
      if (opts && opts.sheetRows) arr = arr.slice(0, opts.sheetRows);
      return arr;
    }
    function dif_to_sheet(str, opts) {
      return aoa_to_sheet(dif_to_aoa(str, opts), opts);
    }
    function dif_to_workbook(str, opts) {
      return sheet_to_workbook(dif_to_sheet(str, opts), opts);
    }
    var sheet_to_dif = /* @__PURE__ */ function() {
      var push_field = function pf(o, topic, v, n, s) {
        o.push(topic);
        o.push(v + "," + n);
        o.push('"' + s.replace(/"/g, '""') + '"');
      };
      var push_value = function po(o, type, v, s) {
        o.push(type + "," + v);
        o.push(type == 1 ? '"' + s.replace(/"/g, '""') + '"' : s);
      };
      return function sheet_to_dif2(ws) {
        var o = [];
        var r = safe_decode_range(ws["!ref"]), cell;
        var dense = Array.isArray(ws);
        push_field(o, "TABLE", 0, 1, "sheetjs");
        push_field(o, "VECTORS", 0, r.e.r - r.s.r + 1, "");
        push_field(o, "TUPLES", 0, r.e.c - r.s.c + 1, "");
        push_field(o, "DATA", 0, 0, "");
        for (var R = r.s.r; R <= r.e.r; ++R) {
          push_value(o, -1, 0, "BOT");
          for (var C = r.s.c; C <= r.e.c; ++C) {
            var coord = encode_cell({ r: R, c: C });
            cell = dense ? (ws[R] || [])[C] : ws[coord];
            if (!cell) {
              push_value(o, 1, 0, "");
              continue;
            }
            switch (cell.t) {
              case "n":
                var val = DIF_XL ? cell.w : cell.v;
                if (!val && cell.v != null) val = cell.v;
                if (val == null) {
                  if (DIF_XL && cell.f && !cell.F) push_value(o, 1, 0, "=" + cell.f);
                  else push_value(o, 1, 0, "");
                } else push_value(o, 0, val, "V");
                break;
              case "b":
                push_value(o, 0, cell.v ? 1 : 0, cell.v ? "TRUE" : "FALSE");
                break;
              case "s":
                push_value(o, 1, 0, !DIF_XL || isNaN(cell.v) ? cell.v : '="' + cell.v + '"');
                break;
              case "d":
                if (!cell.w) cell.w = SSF_format(cell.z || table_fmt[14], datenum(parseDate(cell.v)));
                if (DIF_XL) push_value(o, 0, cell.w, "V");
                else push_value(o, 1, 0, cell.w);
                break;
              default:
                push_value(o, 1, 0, "");
            }
          }
        }
        push_value(o, -1, 0, "EOD");
        var RS = "\r\n";
        var oo = o.join(RS);
        return oo;
      };
    }();
    return {
      to_workbook: dif_to_workbook,
      to_sheet: dif_to_sheet,
      from_sheet: sheet_to_dif
    };
  }();
  var ETH = /* @__PURE__ */ function() {
    function decode(s) {
      return s.replace(/\\b/g, "\\").replace(/\\c/g, ":").replace(/\\n/g, "\n");
    }
    function encode(s) {
      return s.replace(/\\/g, "\\b").replace(/:/g, "\\c").replace(/\n/g, "\\n");
    }
    function eth_to_aoa(str, opts) {
      var records = str.split("\n"), R = -1, C = -1, ri = 0, arr = [];
      for (; ri !== records.length; ++ri) {
        var record = records[ri].trim().split(":");
        if (record[0] !== "cell") continue;
        var addr = decode_cell(record[1]);
        if (arr.length <= addr.r) {
          for (R = arr.length; R <= addr.r; ++R) if (!arr[R]) arr[R] = [];
        }
        R = addr.r;
        C = addr.c;
        switch (record[2]) {
          case "t":
            arr[R][C] = decode(record[3]);
            break;
          case "v":
            arr[R][C] = +record[3];
            break;
          case "vtf":
            var _f = record[record.length - 1];
          /* falls through */
          case "vtc":
            switch (record[3]) {
              case "nl":
                arr[R][C] = +record[4] ? true : false;
                break;
              default:
                arr[R][C] = +record[4];
                break;
            }
            if (record[2] == "vtf") arr[R][C] = [arr[R][C], _f];
        }
      }
      if (opts && opts.sheetRows) arr = arr.slice(0, opts.sheetRows);
      return arr;
    }
    function eth_to_sheet(d, opts) {
      return aoa_to_sheet(eth_to_aoa(d, opts), opts);
    }
    function eth_to_workbook(d, opts) {
      return sheet_to_workbook(eth_to_sheet(d, opts), opts);
    }
    var header = [
      "socialcalc:version:1.5",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=SocialCalcSpreadsheetControlSave"
    ].join("\n");
    var sep = [
      "--SocialCalcSpreadsheetControlSave",
      "Content-type: text/plain; charset=UTF-8"
    ].join("\n") + "\n";
    var meta = [
      "# SocialCalc Spreadsheet Control Save",
      "part:sheet"
    ].join("\n");
    var end = "--SocialCalcSpreadsheetControlSave--";
    function sheet_to_eth_data(ws) {
      if (!ws || !ws["!ref"]) return "";
      var o = [], oo = [], cell, coord = "";
      var r = decode_range(ws["!ref"]);
      var dense = Array.isArray(ws);
      for (var R = r.s.r; R <= r.e.r; ++R) {
        for (var C = r.s.c; C <= r.e.c; ++C) {
          coord = encode_cell({ r: R, c: C });
          cell = dense ? (ws[R] || [])[C] : ws[coord];
          if (!cell || cell.v == null || cell.t === "z") continue;
          oo = ["cell", coord, "t"];
          switch (cell.t) {
            case "s":
            case "str":
              oo.push(encode(cell.v));
              break;
            case "n":
              if (!cell.f) {
                oo[2] = "v";
                oo[3] = cell.v;
              } else {
                oo[2] = "vtf";
                oo[3] = "n";
                oo[4] = cell.v;
                oo[5] = encode(cell.f);
              }
              break;
            case "b":
              oo[2] = "vt" + (cell.f ? "f" : "c");
              oo[3] = "nl";
              oo[4] = cell.v ? "1" : "0";
              oo[5] = encode(cell.f || (cell.v ? "TRUE" : "FALSE"));
              break;
            case "d":
              var t = datenum(parseDate(cell.v));
              oo[2] = "vtc";
              oo[3] = "nd";
              oo[4] = "" + t;
              oo[5] = cell.w || SSF_format(cell.z || table_fmt[14], t);
              break;
            case "e":
              continue;
          }
          o.push(oo.join(":"));
        }
      }
      o.push("sheet:c:" + (r.e.c - r.s.c + 1) + ":r:" + (r.e.r - r.s.r + 1) + ":tvf:1");
      o.push("valueformat:1:text-wiki");
      return o.join("\n");
    }
    function sheet_to_eth(ws) {
      return [header, sep, meta, sep, sheet_to_eth_data(ws), end].join("\n");
    }
    return {
      to_workbook: eth_to_workbook,
      to_sheet: eth_to_sheet,
      from_sheet: sheet_to_eth
    };
  }();
  var PRN = /* @__PURE__ */ function() {
    function set_text_arr(data, arr, R, C, o) {
      if (o.raw) arr[R][C] = data;
      else if (data === "") {
      } else if (data === "TRUE") arr[R][C] = true;
      else if (data === "FALSE") arr[R][C] = false;
      else if (!isNaN(fuzzynum(data))) arr[R][C] = fuzzynum(data);
      else if (!isNaN(fuzzydate(data).getDate())) arr[R][C] = parseDate(data);
      else arr[R][C] = data;
    }
    function prn_to_aoa_str(f, opts) {
      var o = opts || {};
      var arr = [];
      if (!f || f.length === 0) return arr;
      var lines = f.split(/[\r\n]/);
      var L = lines.length - 1;
      while (L >= 0 && lines[L].length === 0) --L;
      var start = 10, idx = 0;
      var R = 0;
      for (; R <= L; ++R) {
        idx = lines[R].indexOf(" ");
        if (idx == -1) idx = lines[R].length;
        else idx++;
        start = Math.max(start, idx);
      }
      for (R = 0; R <= L; ++R) {
        arr[R] = [];
        var C = 0;
        set_text_arr(lines[R].slice(0, start).trim(), arr, R, C, o);
        for (C = 1; C <= (lines[R].length - start) / 10 + 1; ++C)
          set_text_arr(lines[R].slice(start + (C - 1) * 10, start + C * 10).trim(), arr, R, C, o);
      }
      if (o.sheetRows) arr = arr.slice(0, o.sheetRows);
      return arr;
    }
    var guess_seps = {
      /*::[*/
      44: ",",
      /*::[*/
      9: "	",
      /*::[*/
      59: ";",
      /*::[*/
      124: "|"
    };
    var guess_sep_weights = {
      /*::[*/
      44: 3,
      /*::[*/
      9: 2,
      /*::[*/
      59: 1,
      /*::[*/
      124: 0
    };
    function guess_sep(str) {
      var cnt = {}, instr = false, end = 0, cc = 0;
      for (; end < str.length; ++end) {
        if ((cc = str.charCodeAt(end)) == 34) instr = !instr;
        else if (!instr && cc in guess_seps) cnt[cc] = (cnt[cc] || 0) + 1;
      }
      cc = [];
      for (end in cnt) if (Object.prototype.hasOwnProperty.call(cnt, end)) {
        cc.push([cnt[end], end]);
      }
      if (!cc.length) {
        cnt = guess_sep_weights;
        for (end in cnt) if (Object.prototype.hasOwnProperty.call(cnt, end)) {
          cc.push([cnt[end], end]);
        }
      }
      cc.sort(function(a, b) {
        return a[0] - b[0] || guess_sep_weights[a[1]] - guess_sep_weights[b[1]];
      });
      return guess_seps[cc.pop()[1]] || 44;
    }
    function dsv_to_sheet_str(str, opts) {
      var o = opts || {};
      var sep = "";
      if (DENSE != null && o.dense == null) o.dense = DENSE;
      var ws = o.dense ? [] : {};
      var range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
      if (str.slice(0, 4) == "sep=") {
        if (str.charCodeAt(5) == 13 && str.charCodeAt(6) == 10) {
          sep = str.charAt(4);
          str = str.slice(7);
        } else if (str.charCodeAt(5) == 13 || str.charCodeAt(5) == 10) {
          sep = str.charAt(4);
          str = str.slice(6);
        } else sep = guess_sep(str.slice(0, 1024));
      } else if (o && o.FS) sep = o.FS;
      else sep = guess_sep(str.slice(0, 1024));
      var R = 0, C = 0, v = 0;
      var start = 0, end = 0, sepcc = sep.charCodeAt(0), instr = false, cc = 0, startcc = str.charCodeAt(0);
      str = str.replace(/\r\n/mg, "\n");
      var _re = o.dateNF != null ? dateNF_regex(o.dateNF) : null;
      function finish_cell() {
        var s = str.slice(start, end);
        var cell = {};
        if (s.charAt(0) == '"' && s.charAt(s.length - 1) == '"') s = s.slice(1, -1).replace(/""/g, '"');
        if (s.length === 0) cell.t = "z";
        else if (o.raw) {
          cell.t = "s";
          cell.v = s;
        } else if (s.trim().length === 0) {
          cell.t = "s";
          cell.v = s;
        } else if (s.charCodeAt(0) == 61) {
          if (s.charCodeAt(1) == 34 && s.charCodeAt(s.length - 1) == 34) {
            cell.t = "s";
            cell.v = s.slice(2, -1).replace(/""/g, '"');
          } else if (fuzzyfmla(s)) {
            cell.t = "n";
            cell.f = s.slice(1);
          } else {
            cell.t = "s";
            cell.v = s;
          }
        } else if (s == "TRUE") {
          cell.t = "b";
          cell.v = true;
        } else if (s == "FALSE") {
          cell.t = "b";
          cell.v = false;
        } else if (!isNaN(v = fuzzynum(s))) {
          cell.t = "n";
          if (o.cellText !== false) cell.w = s;
          cell.v = v;
        } else if (!isNaN(fuzzydate(s).getDate()) || _re && s.match(_re)) {
          cell.z = o.dateNF || table_fmt[14];
          var k = 0;
          if (_re && s.match(_re)) {
            s = dateNF_fix(s, o.dateNF, s.match(_re) || []);
            k = 1;
          }
          if (o.cellDates) {
            cell.t = "d";
            cell.v = parseDate(s, k);
          } else {
            cell.t = "n";
            cell.v = datenum(parseDate(s, k));
          }
          if (o.cellText !== false) cell.w = SSF_format(cell.z, cell.v instanceof Date ? datenum(cell.v) : cell.v);
          if (!o.cellNF) delete cell.z;
        } else {
          cell.t = "s";
          cell.v = s;
        }
        if (cell.t == "z") {
        } else if (o.dense) {
          if (!ws[R]) ws[R] = [];
          ws[R][C] = cell;
        } else ws[encode_cell({ c: C, r: R })] = cell;
        start = end + 1;
        startcc = str.charCodeAt(start);
        if (range.e.c < C) range.e.c = C;
        if (range.e.r < R) range.e.r = R;
        if (cc == sepcc) ++C;
        else {
          C = 0;
          ++R;
          if (o.sheetRows && o.sheetRows <= R) return true;
        }
      }
      outer: for (; end < str.length; ++end) switch (cc = str.charCodeAt(end)) {
        case 34:
          if (startcc === 34) instr = !instr;
          break;
        case sepcc:
        case 10:
        case 13:
          if (!instr && finish_cell()) break outer;
          break;
        default:
          break;
      }
      if (end - start > 0) finish_cell();
      ws["!ref"] = encode_range(range);
      return ws;
    }
    function prn_to_sheet_str(str, opts) {
      if (!(opts && opts.PRN)) return dsv_to_sheet_str(str, opts);
      if (opts.FS) return dsv_to_sheet_str(str, opts);
      if (str.slice(0, 4) == "sep=") return dsv_to_sheet_str(str, opts);
      if (str.indexOf("	") >= 0 || str.indexOf(",") >= 0 || str.indexOf(";") >= 0) return dsv_to_sheet_str(str, opts);
      return aoa_to_sheet(prn_to_aoa_str(str, opts), opts);
    }
    function prn_to_sheet(d, opts) {
      var str = "", bytes = opts.type == "string" ? [0, 0, 0, 0] : firstbyte(d, opts);
      switch (opts.type) {
        case "base64":
          str = Base64_decode(d);
          break;
        case "binary":
          str = d;
          break;
        case "buffer":
          if (opts.codepage == 65001) str = d.toString("utf8");
          else if (opts.codepage && typeof $cptable !== "undefined") str = $cptable.utils.decode(opts.codepage, d);
          else str = has_buf && Buffer.isBuffer(d) ? d.toString("binary") : a2s(d);
          break;
        case "array":
          str = cc2str(d);
          break;
        case "string":
          str = d;
          break;
        default:
          throw new Error("Unrecognized type " + opts.type);
      }
      if (bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191) str = utf8read(str.slice(3));
      else if (opts.type != "string" && opts.type != "buffer" && opts.codepage == 65001) str = utf8read(str);
      else if (opts.type == "binary" && typeof $cptable !== "undefined" && opts.codepage) str = $cptable.utils.decode(opts.codepage, $cptable.utils.encode(28591, str));
      if (str.slice(0, 19) == "socialcalc:version:") return ETH.to_sheet(opts.type == "string" ? str : utf8read(str), opts);
      return prn_to_sheet_str(str, opts);
    }
    function prn_to_workbook(d, opts) {
      return sheet_to_workbook(prn_to_sheet(d, opts), opts);
    }
    function sheet_to_prn(ws) {
      var o = [];
      var r = safe_decode_range(ws["!ref"]), cell;
      var dense = Array.isArray(ws);
      for (var R = r.s.r; R <= r.e.r; ++R) {
        var oo = [];
        for (var C = r.s.c; C <= r.e.c; ++C) {
          var coord = encode_cell({ r: R, c: C });
          cell = dense ? (ws[R] || [])[C] : ws[coord];
          if (!cell || cell.v == null) {
            oo.push("          ");
            continue;
          }
          var w = (cell.w || (format_cell(cell), cell.w) || "").slice(0, 10);
          while (w.length < 10) w += " ";
          oo.push(w + (C === 0 ? " " : ""));
        }
        o.push(oo.join(""));
      }
      return o.join("\n");
    }
    return {
      to_workbook: prn_to_workbook,
      to_sheet: prn_to_sheet,
      from_sheet: sheet_to_prn
    };
  }();
  function read_wb_ID(d, opts) {
    var o = opts || {}, OLD_WTF = !!o.WTF;
    o.WTF = true;
    try {
      var out = SYLK.to_workbook(d, o);
      o.WTF = OLD_WTF;
      return out;
    } catch (e) {
      o.WTF = OLD_WTF;
      if (!e.message.match(/SYLK bad record ID/) && OLD_WTF) throw e;
      return PRN.to_workbook(d, opts);
    }
  }
  var WK_ = /* @__PURE__ */ function() {
    function lotushopper(data, cb, opts) {
      if (!data) return;
      prep_blob(data, data.l || 0);
      var Enum = opts.Enum || WK1Enum;
      while (data.l < data.length) {
        var RT = data.read_shift(2);
        var R = Enum[RT] || Enum[65535];
        var length = data.read_shift(2);
        var tgt = data.l + length;
        var d = R.f && R.f(data, length, opts);
        data.l = tgt;
        if (cb(d, R, RT)) return;
      }
    }
    function lotus_to_workbook(d, opts) {
      switch (opts.type) {
        case "base64":
          return lotus_to_workbook_buf(s2a(Base64_decode(d)), opts);
        case "binary":
          return lotus_to_workbook_buf(s2a(d), opts);
        case "buffer":
        case "array":
          return lotus_to_workbook_buf(d, opts);
      }
      throw "Unsupported type " + opts.type;
    }
    function lotus_to_workbook_buf(d, opts) {
      if (!d) return d;
      var o = opts || {};
      if (DENSE != null && o.dense == null) o.dense = DENSE;
      var s = o.dense ? [] : {}, n = "Sheet1", next_n = "", sidx = 0;
      var sheets = {}, snames = [], realnames = [];
      var refguess = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      var sheetRows = o.sheetRows || 0;
      if (d[2] == 0) {
        if (d[3] == 8 || d[3] == 9) {
          if (d.length >= 16 && d[14] == 5 && d[15] === 108) throw new Error("Unsupported Works 3 for Mac file");
        }
      }
      if (d[2] == 2) {
        o.Enum = WK1Enum;
        lotushopper(d, function(val, R, RT) {
          switch (RT) {
            case 0:
              o.vers = val;
              if (val >= 4096) o.qpro = true;
              break;
            case 6:
              refguess = val;
              break;
            /* RANGE */
            case 204:
              if (val) next_n = val;
              break;
            /* SHEETNAMECS */
            case 222:
              next_n = val;
              break;
            /* SHEETNAMELP */
            case 15:
            /* LABEL */
            case 51:
              if (!o.qpro) val[1].v = val[1].v.slice(1);
            /* falls through */
            case 13:
            /* INTEGER */
            case 14:
            /* NUMBER */
            case 16:
              if (RT == 14 && (val[2] & 112) == 112 && (val[2] & 15) > 1 && (val[2] & 15) < 15) {
                val[1].z = o.dateNF || table_fmt[14];
                if (o.cellDates) {
                  val[1].t = "d";
                  val[1].v = numdate(val[1].v);
                }
              }
              if (o.qpro) {
                if (val[3] > sidx) {
                  s["!ref"] = encode_range(refguess);
                  sheets[n] = s;
                  snames.push(n);
                  s = o.dense ? [] : {};
                  refguess = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
                  sidx = val[3];
                  n = next_n || "Sheet" + (sidx + 1);
                  next_n = "";
                }
              }
              var tmpcell = o.dense ? (s[val[0].r] || [])[val[0].c] : s[encode_cell(val[0])];
              if (tmpcell) {
                tmpcell.t = val[1].t;
                tmpcell.v = val[1].v;
                if (val[1].z != null) tmpcell.z = val[1].z;
                if (val[1].f != null) tmpcell.f = val[1].f;
                break;
              }
              if (o.dense) {
                if (!s[val[0].r]) s[val[0].r] = [];
                s[val[0].r][val[0].c] = val[1];
              } else s[encode_cell(val[0])] = val[1];
              break;
            default:
          }
        }, o);
      } else if (d[2] == 26 || d[2] == 14) {
        o.Enum = WK3Enum;
        if (d[2] == 14) {
          o.qpro = true;
          d.l = 0;
        }
        lotushopper(d, function(val, R, RT) {
          switch (RT) {
            case 204:
              n = val;
              break;
            /* SHEETNAMECS */
            case 22:
              val[1].v = val[1].v.slice(1);
            /* falls through */
            case 23:
            /* NUMBER17 */
            case 24:
            /* NUMBER18 */
            case 25:
            /* FORMULA19 */
            case 37:
            /* NUMBER25 */
            case 39:
            /* NUMBER27 */
            case 40:
              if (val[3] > sidx) {
                s["!ref"] = encode_range(refguess);
                sheets[n] = s;
                snames.push(n);
                s = o.dense ? [] : {};
                refguess = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
                sidx = val[3];
                n = "Sheet" + (sidx + 1);
              }
              if (sheetRows > 0 && val[0].r >= sheetRows) break;
              if (o.dense) {
                if (!s[val[0].r]) s[val[0].r] = [];
                s[val[0].r][val[0].c] = val[1];
              } else s[encode_cell(val[0])] = val[1];
              if (refguess.e.c < val[0].c) refguess.e.c = val[0].c;
              if (refguess.e.r < val[0].r) refguess.e.r = val[0].r;
              break;
            case 27:
              if (val[14e3]) realnames[val[14e3][0]] = val[14e3][1];
              break;
            case 1537:
              realnames[val[0]] = val[1];
              if (val[0] == sidx) n = val[1];
              break;
            default:
              break;
          }
        }, o);
      } else throw new Error("Unrecognized LOTUS BOF " + d[2]);
      s["!ref"] = encode_range(refguess);
      sheets[next_n || n] = s;
      snames.push(next_n || n);
      if (!realnames.length) return { SheetNames: snames, Sheets: sheets };
      var osheets = {}, rnames = [];
      for (var i = 0; i < realnames.length; ++i) if (sheets[snames[i]]) {
        rnames.push(realnames[i] || snames[i]);
        osheets[realnames[i]] = sheets[realnames[i]] || sheets[snames[i]];
      } else {
        rnames.push(realnames[i]);
        osheets[realnames[i]] = { "!ref": "A1" };
      }
      return { SheetNames: rnames, Sheets: osheets };
    }
    function sheet_to_wk1(ws, opts) {
      var o = opts || {};
      if (+o.codepage >= 0) set_cp(+o.codepage);
      if (o.type == "string") throw new Error("Cannot write WK1 to JS string");
      var ba = buf_array();
      var range = safe_decode_range(ws["!ref"]);
      var dense = Array.isArray(ws);
      var cols = [];
      write_biff_rec(ba, 0, write_BOF_WK1(1030));
      write_biff_rec(ba, 6, write_RANGE(range));
      var max_R = Math.min(range.e.r, 8191);
      for (var R = range.s.r; R <= max_R; ++R) {
        var rr = encode_row(R);
        for (var C = range.s.c; C <= range.e.c; ++C) {
          if (R === range.s.r) cols[C] = encode_col(C);
          var ref = cols[C] + rr;
          var cell = dense ? (ws[R] || [])[C] : ws[ref];
          if (!cell || cell.t == "z") continue;
          if (cell.t == "n") {
            if ((cell.v | 0) == cell.v && cell.v >= -32768 && cell.v <= 32767) write_biff_rec(ba, 13, write_INTEGER(R, C, cell.v));
            else write_biff_rec(ba, 14, write_NUMBER(R, C, cell.v));
          } else {
            var str = format_cell(cell);
            write_biff_rec(ba, 15, write_LABEL(R, C, str.slice(0, 239)));
          }
        }
      }
      write_biff_rec(ba, 1);
      return ba.end();
    }
    function book_to_wk3(wb, opts) {
      var o = opts || {};
      if (+o.codepage >= 0) set_cp(+o.codepage);
      if (o.type == "string") throw new Error("Cannot write WK3 to JS string");
      var ba = buf_array();
      write_biff_rec(ba, 0, write_BOF_WK3(wb));
      for (var i = 0, cnt = 0; i < wb.SheetNames.length; ++i) if ((wb.Sheets[wb.SheetNames[i]] || {})["!ref"]) write_biff_rec(ba, 27, write_XFORMAT_SHEETNAME(wb.SheetNames[i], cnt++));
      var wsidx = 0;
      for (i = 0; i < wb.SheetNames.length; ++i) {
        var ws = wb.Sheets[wb.SheetNames[i]];
        if (!ws || !ws["!ref"]) continue;
        var range = safe_decode_range(ws["!ref"]);
        var dense = Array.isArray(ws);
        var cols = [];
        var max_R = Math.min(range.e.r, 8191);
        for (var R = range.s.r; R <= max_R; ++R) {
          var rr = encode_row(R);
          for (var C = range.s.c; C <= range.e.c; ++C) {
            if (R === range.s.r) cols[C] = encode_col(C);
            var ref = cols[C] + rr;
            var cell = dense ? (ws[R] || [])[C] : ws[ref];
            if (!cell || cell.t == "z") continue;
            if (cell.t == "n") {
              write_biff_rec(ba, 23, write_NUMBER_17(R, C, wsidx, cell.v));
            } else {
              var str = format_cell(cell);
              write_biff_rec(ba, 22, write_LABEL_16(R, C, wsidx, str.slice(0, 239)));
            }
          }
        }
        ++wsidx;
      }
      write_biff_rec(ba, 1);
      return ba.end();
    }
    function write_BOF_WK1(v) {
      var out = new_buf(2);
      out.write_shift(2, v);
      return out;
    }
    function write_BOF_WK3(wb) {
      var out = new_buf(26);
      out.write_shift(2, 4096);
      out.write_shift(2, 4);
      out.write_shift(4, 0);
      var rows = 0, cols = 0, wscnt = 0;
      for (var i = 0; i < wb.SheetNames.length; ++i) {
        var name = wb.SheetNames[i];
        var ws = wb.Sheets[name];
        if (!ws || !ws["!ref"]) continue;
        ++wscnt;
        var range = decode_range(ws["!ref"]);
        if (rows < range.e.r) rows = range.e.r;
        if (cols < range.e.c) cols = range.e.c;
      }
      if (rows > 8191) rows = 8191;
      out.write_shift(2, rows);
      out.write_shift(1, wscnt);
      out.write_shift(1, cols);
      out.write_shift(2, 0);
      out.write_shift(2, 0);
      out.write_shift(1, 1);
      out.write_shift(1, 2);
      out.write_shift(4, 0);
      out.write_shift(4, 0);
      return out;
    }
    function parse_RANGE(blob, length, opts) {
      var o = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
      if (length == 8 && opts.qpro) {
        o.s.c = blob.read_shift(1);
        blob.l++;
        o.s.r = blob.read_shift(2);
        o.e.c = blob.read_shift(1);
        blob.l++;
        o.e.r = blob.read_shift(2);
        return o;
      }
      o.s.c = blob.read_shift(2);
      o.s.r = blob.read_shift(2);
      if (length == 12 && opts.qpro) blob.l += 2;
      o.e.c = blob.read_shift(2);
      o.e.r = blob.read_shift(2);
      if (length == 12 && opts.qpro) blob.l += 2;
      if (o.s.c == 65535) o.s.c = o.e.c = o.s.r = o.e.r = 0;
      return o;
    }
    function write_RANGE(range) {
      var out = new_buf(8);
      out.write_shift(2, range.s.c);
      out.write_shift(2, range.s.r);
      out.write_shift(2, range.e.c);
      out.write_shift(2, range.e.r);
      return out;
    }
    function parse_cell(blob, length, opts) {
      var o = [{ c: 0, r: 0 }, { t: "n", v: 0 }, 0, 0];
      if (opts.qpro && opts.vers != 20768) {
        o[0].c = blob.read_shift(1);
        o[3] = blob.read_shift(1);
        o[0].r = blob.read_shift(2);
        blob.l += 2;
      } else {
        o[2] = blob.read_shift(1);
        o[0].c = blob.read_shift(2);
        o[0].r = blob.read_shift(2);
      }
      return o;
    }
    function parse_LABEL(blob, length, opts) {
      var tgt = blob.l + length;
      var o = parse_cell(blob, length, opts);
      o[1].t = "s";
      if (opts.vers == 20768) {
        blob.l++;
        var len = blob.read_shift(1);
        o[1].v = blob.read_shift(len, "utf8");
        return o;
      }
      if (opts.qpro) blob.l++;
      o[1].v = blob.read_shift(tgt - blob.l, "cstr");
      return o;
    }
    function write_LABEL(R, C, s) {
      var o = new_buf(7 + s.length);
      o.write_shift(1, 255);
      o.write_shift(2, C);
      o.write_shift(2, R);
      o.write_shift(1, 39);
      for (var i = 0; i < o.length; ++i) {
        var cc = s.charCodeAt(i);
        o.write_shift(1, cc >= 128 ? 95 : cc);
      }
      o.write_shift(1, 0);
      return o;
    }
    function parse_INTEGER(blob, length, opts) {
      var o = parse_cell(blob, length, opts);
      o[1].v = blob.read_shift(2, "i");
      return o;
    }
    function write_INTEGER(R, C, v) {
      var o = new_buf(7);
      o.write_shift(1, 255);
      o.write_shift(2, C);
      o.write_shift(2, R);
      o.write_shift(2, v, "i");
      return o;
    }
    function parse_NUMBER(blob, length, opts) {
      var o = parse_cell(blob, length, opts);
      o[1].v = blob.read_shift(8, "f");
      return o;
    }
    function write_NUMBER(R, C, v) {
      var o = new_buf(13);
      o.write_shift(1, 255);
      o.write_shift(2, C);
      o.write_shift(2, R);
      o.write_shift(8, v, "f");
      return o;
    }
    function parse_FORMULA(blob, length, opts) {
      var tgt = blob.l + length;
      var o = parse_cell(blob, length, opts);
      o[1].v = blob.read_shift(8, "f");
      if (opts.qpro) blob.l = tgt;
      else {
        var flen = blob.read_shift(2);
        wk1_fmla_to_csf(blob.slice(blob.l, blob.l + flen), o);
        blob.l += flen;
      }
      return o;
    }
    function wk1_parse_rc(B, V, col) {
      var rel = V & 32768;
      V &= ~32768;
      V = (rel ? B : 0) + (V >= 8192 ? V - 16384 : V);
      return (rel ? "" : "$") + (col ? encode_col(V) : encode_row(V));
    }
    var FuncTab = {
      51: ["FALSE", 0],
      52: ["TRUE", 0],
      70: ["LEN", 1],
      80: ["SUM", 69],
      81: ["AVERAGEA", 69],
      82: ["COUNTA", 69],
      83: ["MINA", 69],
      84: ["MAXA", 69],
      111: ["T", 1]
    };
    var BinOpTab = [
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      // eslint-disable-line no-mixed-spaces-and-tabs
      "",
      "+",
      "-",
      "*",
      "/",
      "^",
      "=",
      "<>",
      // eslint-disable-line no-mixed-spaces-and-tabs
      "<=",
      ">=",
      "<",
      ">",
      "",
      "",
      "",
      "",
      // eslint-disable-line no-mixed-spaces-and-tabs
      "&",
      "",
      "",
      "",
      "",
      "",
      "",
      ""
      // eslint-disable-line no-mixed-spaces-and-tabs
    ];
    function wk1_fmla_to_csf(blob, o) {
      prep_blob(blob, 0);
      var out = [], argc = 0, R = "", C = "", argL = "", argR = "";
      while (blob.l < blob.length) {
        var cc = blob[blob.l++];
        switch (cc) {
          case 0:
            out.push(blob.read_shift(8, "f"));
            break;
          case 1:
            {
              C = wk1_parse_rc(o[0].c, blob.read_shift(2), true);
              R = wk1_parse_rc(o[0].r, blob.read_shift(2), false);
              out.push(C + R);
            }
            break;
          case 2:
            {
              var c = wk1_parse_rc(o[0].c, blob.read_shift(2), true);
              var r = wk1_parse_rc(o[0].r, blob.read_shift(2), false);
              C = wk1_parse_rc(o[0].c, blob.read_shift(2), true);
              R = wk1_parse_rc(o[0].r, blob.read_shift(2), false);
              out.push(c + r + ":" + C + R);
            }
            break;
          case 3:
            if (blob.l < blob.length) {
              console.error("WK1 premature formula end");
              return;
            }
            break;
          case 4:
            out.push("(" + out.pop() + ")");
            break;
          case 5:
            out.push(blob.read_shift(2));
            break;
          case 6:
            {
              var Z2 = "";
              while (cc = blob[blob.l++]) Z2 += String.fromCharCode(cc);
              out.push('"' + Z2.replace(/"/g, '""') + '"');
            }
            break;
          case 8:
            out.push("-" + out.pop());
            break;
          case 23:
            out.push("+" + out.pop());
            break;
          case 22:
            out.push("NOT(" + out.pop() + ")");
            break;
          case 20:
          case 21:
            {
              argR = out.pop();
              argL = out.pop();
              out.push(["AND", "OR"][cc - 20] + "(" + argL + "," + argR + ")");
            }
            break;
          default:
            if (cc < 32 && BinOpTab[cc]) {
              argR = out.pop();
              argL = out.pop();
              out.push(argL + BinOpTab[cc] + argR);
            } else if (FuncTab[cc]) {
              argc = FuncTab[cc][1];
              if (argc == 69) argc = blob[blob.l++];
              if (argc > out.length) {
                console.error("WK1 bad formula parse 0x" + cc.toString(16) + ":|" + out.join("|") + "|");
                return;
              }
              var args = out.slice(-argc);
              out.length -= argc;
              out.push(FuncTab[cc][0] + "(" + args.join(",") + ")");
            } else if (cc <= 7) return console.error("WK1 invalid opcode " + cc.toString(16));
            else if (cc <= 24) return console.error("WK1 unsupported op " + cc.toString(16));
            else if (cc <= 30) return console.error("WK1 invalid opcode " + cc.toString(16));
            else if (cc <= 115) return console.error("WK1 unsupported function opcode " + cc.toString(16));
            else return console.error("WK1 unrecognized opcode " + cc.toString(16));
        }
      }
      if (out.length == 1) o[1].f = "" + out[0];
      else console.error("WK1 bad formula parse |" + out.join("|") + "|");
    }
    function parse_cell_3(blob) {
      var o = [{ c: 0, r: 0 }, { t: "n", v: 0 }, 0];
      o[0].r = blob.read_shift(2);
      o[3] = blob[blob.l++];
      o[0].c = blob[blob.l++];
      return o;
    }
    function parse_LABEL_16(blob, length) {
      var o = parse_cell_3(blob, length);
      o[1].t = "s";
      o[1].v = blob.read_shift(length - 4, "cstr");
      return o;
    }
    function write_LABEL_16(R, C, wsidx, s) {
      var o = new_buf(6 + s.length);
      o.write_shift(2, R);
      o.write_shift(1, wsidx);
      o.write_shift(1, C);
      o.write_shift(1, 39);
      for (var i = 0; i < s.length; ++i) {
        var cc = s.charCodeAt(i);
        o.write_shift(1, cc >= 128 ? 95 : cc);
      }
      o.write_shift(1, 0);
      return o;
    }
    function parse_NUMBER_18(blob, length) {
      var o = parse_cell_3(blob, length);
      o[1].v = blob.read_shift(2);
      var v = o[1].v >> 1;
      if (o[1].v & 1) {
        switch (v & 7) {
          case 0:
            v = (v >> 3) * 5e3;
            break;
          case 1:
            v = (v >> 3) * 500;
            break;
          case 2:
            v = (v >> 3) / 20;
            break;
          case 3:
            v = (v >> 3) / 200;
            break;
          case 4:
            v = (v >> 3) / 2e3;
            break;
          case 5:
            v = (v >> 3) / 2e4;
            break;
          case 6:
            v = (v >> 3) / 16;
            break;
          case 7:
            v = (v >> 3) / 64;
            break;
        }
      }
      o[1].v = v;
      return o;
    }
    function parse_NUMBER_17(blob, length) {
      var o = parse_cell_3(blob, length);
      var v1 = blob.read_shift(4);
      var v2 = blob.read_shift(4);
      var e = blob.read_shift(2);
      if (e == 65535) {
        if (v1 === 0 && v2 === 3221225472) {
          o[1].t = "e";
          o[1].v = 15;
        } else if (v1 === 0 && v2 === 3489660928) {
          o[1].t = "e";
          o[1].v = 42;
        } else o[1].v = 0;
        return o;
      }
      var s = e & 32768;
      e = (e & 32767) - 16446;
      o[1].v = (1 - s * 2) * (v2 * Math.pow(2, e + 32) + v1 * Math.pow(2, e));
      return o;
    }
    function write_NUMBER_17(R, C, wsidx, v) {
      var o = new_buf(14);
      o.write_shift(2, R);
      o.write_shift(1, wsidx);
      o.write_shift(1, C);
      if (v == 0) {
        o.write_shift(4, 0);
        o.write_shift(4, 0);
        o.write_shift(2, 65535);
        return o;
      }
      var s = 0, e = 0, v1 = 0, v2 = 0;
      if (v < 0) {
        s = 1;
        v = -v;
      }
      e = Math.log2(v) | 0;
      v /= Math.pow(2, e - 31);
      v2 = v >>> 0;
      if ((v2 & 2147483648) == 0) {
        v /= 2;
        ++e;
        v2 = v >>> 0;
      }
      v -= v2;
      v2 |= 2147483648;
      v2 >>>= 0;
      v *= Math.pow(2, 32);
      v1 = v >>> 0;
      o.write_shift(4, v1);
      o.write_shift(4, v2);
      e += 16383 + (s ? 32768 : 0);
      o.write_shift(2, e);
      return o;
    }
    function parse_FORMULA_19(blob, length) {
      var o = parse_NUMBER_17(blob, 14);
      blob.l += length - 14;
      return o;
    }
    function parse_NUMBER_25(blob, length) {
      var o = parse_cell_3(blob, length);
      var v1 = blob.read_shift(4);
      o[1].v = v1 >> 6;
      return o;
    }
    function parse_NUMBER_27(blob, length) {
      var o = parse_cell_3(blob, length);
      var v1 = blob.read_shift(8, "f");
      o[1].v = v1;
      return o;
    }
    function parse_FORMULA_28(blob, length) {
      var o = parse_NUMBER_27(blob, 14);
      blob.l += length - 10;
      return o;
    }
    function parse_SHEETNAMECS(blob, length) {
      return blob[blob.l + length - 1] == 0 ? blob.read_shift(length, "cstr") : "";
    }
    function parse_SHEETNAMELP(blob, length) {
      var len = blob[blob.l++];
      if (len > length - 1) len = length - 1;
      var o = "";
      while (o.length < len) o += String.fromCharCode(blob[blob.l++]);
      return o;
    }
    function parse_SHEETINFOQP(blob, length, opts) {
      if (!opts.qpro || length < 21) return;
      var id = blob.read_shift(1);
      blob.l += 17;
      blob.l += 1;
      blob.l += 2;
      var nm = blob.read_shift(length - 21, "cstr");
      return [id, nm];
    }
    function parse_XFORMAT(blob, length) {
      var o = {}, tgt = blob.l + length;
      while (blob.l < tgt) {
        var dt = blob.read_shift(2);
        if (dt == 14e3) {
          o[dt] = [0, ""];
          o[dt][0] = blob.read_shift(2);
          while (blob[blob.l]) {
            o[dt][1] += String.fromCharCode(blob[blob.l]);
            blob.l++;
          }
          blob.l++;
        }
      }
      return o;
    }
    function write_XFORMAT_SHEETNAME(name, wsidx) {
      var out = new_buf(5 + name.length);
      out.write_shift(2, 14e3);
      out.write_shift(2, wsidx);
      for (var i = 0; i < name.length; ++i) {
        var cc = name.charCodeAt(i);
        out[out.l++] = cc > 127 ? 95 : cc;
      }
      out[out.l++] = 0;
      return out;
    }
    var WK1Enum = {
      /*::[*/
      0: { n: "BOF", f: parseuint16 },
      /*::[*/
      1: { n: "EOF" },
      /*::[*/
      2: { n: "CALCMODE" },
      /*::[*/
      3: { n: "CALCORDER" },
      /*::[*/
      4: { n: "SPLIT" },
      /*::[*/
      5: { n: "SYNC" },
      /*::[*/
      6: { n: "RANGE", f: parse_RANGE },
      /*::[*/
      7: { n: "WINDOW1" },
      /*::[*/
      8: { n: "COLW1" },
      /*::[*/
      9: { n: "WINTWO" },
      /*::[*/
      10: { n: "COLW2" },
      /*::[*/
      11: { n: "NAME" },
      /*::[*/
      12: { n: "BLANK" },
      /*::[*/
      13: { n: "INTEGER", f: parse_INTEGER },
      /*::[*/
      14: { n: "NUMBER", f: parse_NUMBER },
      /*::[*/
      15: { n: "LABEL", f: parse_LABEL },
      /*::[*/
      16: { n: "FORMULA", f: parse_FORMULA },
      /*::[*/
      24: { n: "TABLE" },
      /*::[*/
      25: { n: "ORANGE" },
      /*::[*/
      26: { n: "PRANGE" },
      /*::[*/
      27: { n: "SRANGE" },
      /*::[*/
      28: { n: "FRANGE" },
      /*::[*/
      29: { n: "KRANGE1" },
      /*::[*/
      32: { n: "HRANGE" },
      /*::[*/
      35: { n: "KRANGE2" },
      /*::[*/
      36: { n: "PROTEC" },
      /*::[*/
      37: { n: "FOOTER" },
      /*::[*/
      38: { n: "HEADER" },
      /*::[*/
      39: { n: "SETUP" },
      /*::[*/
      40: { n: "MARGINS" },
      /*::[*/
      41: { n: "LABELFMT" },
      /*::[*/
      42: { n: "TITLES" },
      /*::[*/
      43: { n: "SHEETJS" },
      /*::[*/
      45: { n: "GRAPH" },
      /*::[*/
      46: { n: "NGRAPH" },
      /*::[*/
      47: { n: "CALCCOUNT" },
      /*::[*/
      48: { n: "UNFORMATTED" },
      /*::[*/
      49: { n: "CURSORW12" },
      /*::[*/
      50: { n: "WINDOW" },
      /*::[*/
      51: { n: "STRING", f: parse_LABEL },
      /*::[*/
      55: { n: "PASSWORD" },
      /*::[*/
      56: { n: "LOCKED" },
      /*::[*/
      60: { n: "QUERY" },
      /*::[*/
      61: { n: "QUERYNAME" },
      /*::[*/
      62: { n: "PRINT" },
      /*::[*/
      63: { n: "PRINTNAME" },
      /*::[*/
      64: { n: "GRAPH2" },
      /*::[*/
      65: { n: "GRAPHNAME" },
      /*::[*/
      66: { n: "ZOOM" },
      /*::[*/
      67: { n: "SYMSPLIT" },
      /*::[*/
      68: { n: "NSROWS" },
      /*::[*/
      69: { n: "NSCOLS" },
      /*::[*/
      70: { n: "RULER" },
      /*::[*/
      71: { n: "NNAME" },
      /*::[*/
      72: { n: "ACOMM" },
      /*::[*/
      73: { n: "AMACRO" },
      /*::[*/
      74: { n: "PARSE" },
      /*::[*/
      102: { n: "PRANGES??" },
      /*::[*/
      103: { n: "RRANGES??" },
      /*::[*/
      104: { n: "FNAME??" },
      /*::[*/
      105: { n: "MRANGES??" },
      /*::[*/
      204: { n: "SHEETNAMECS", f: parse_SHEETNAMECS },
      /*::[*/
      222: { n: "SHEETNAMELP", f: parse_SHEETNAMELP },
      /*::[*/
      65535: { n: "" }
    };
    var WK3Enum = {
      /*::[*/
      0: { n: "BOF" },
      /*::[*/
      1: { n: "EOF" },
      /*::[*/
      2: { n: "PASSWORD" },
      /*::[*/
      3: { n: "CALCSET" },
      /*::[*/
      4: { n: "WINDOWSET" },
      /*::[*/
      5: { n: "SHEETCELLPTR" },
      /*::[*/
      6: { n: "SHEETLAYOUT" },
      /*::[*/
      7: { n: "COLUMNWIDTH" },
      /*::[*/
      8: { n: "HIDDENCOLUMN" },
      /*::[*/
      9: { n: "USERRANGE" },
      /*::[*/
      10: { n: "SYSTEMRANGE" },
      /*::[*/
      11: { n: "ZEROFORCE" },
      /*::[*/
      12: { n: "SORTKEYDIR" },
      /*::[*/
      13: { n: "FILESEAL" },
      /*::[*/
      14: { n: "DATAFILLNUMS" },
      /*::[*/
      15: { n: "PRINTMAIN" },
      /*::[*/
      16: { n: "PRINTSTRING" },
      /*::[*/
      17: { n: "GRAPHMAIN" },
      /*::[*/
      18: { n: "GRAPHSTRING" },
      /*::[*/
      19: { n: "??" },
      /*::[*/
      20: { n: "ERRCELL" },
      /*::[*/
      21: { n: "NACELL" },
      /*::[*/
      22: { n: "LABEL16", f: parse_LABEL_16 },
      /*::[*/
      23: { n: "NUMBER17", f: parse_NUMBER_17 },
      /*::[*/
      24: { n: "NUMBER18", f: parse_NUMBER_18 },
      /*::[*/
      25: { n: "FORMULA19", f: parse_FORMULA_19 },
      /*::[*/
      26: { n: "FORMULA1A" },
      /*::[*/
      27: { n: "XFORMAT", f: parse_XFORMAT },
      /*::[*/
      28: { n: "DTLABELMISC" },
      /*::[*/
      29: { n: "DTLABELCELL" },
      /*::[*/
      30: { n: "GRAPHWINDOW" },
      /*::[*/
      31: { n: "CPA" },
      /*::[*/
      32: { n: "LPLAUTO" },
      /*::[*/
      33: { n: "QUERY" },
      /*::[*/
      34: { n: "HIDDENSHEET" },
      /*::[*/
      35: { n: "??" },
      /*::[*/
      37: { n: "NUMBER25", f: parse_NUMBER_25 },
      /*::[*/
      38: { n: "??" },
      /*::[*/
      39: { n: "NUMBER27", f: parse_NUMBER_27 },
      /*::[*/
      40: { n: "FORMULA28", f: parse_FORMULA_28 },
      /*::[*/
      142: { n: "??" },
      /*::[*/
      147: { n: "??" },
      /*::[*/
      150: { n: "??" },
      /*::[*/
      151: { n: "??" },
      /*::[*/
      152: { n: "??" },
      /*::[*/
      153: { n: "??" },
      /*::[*/
      154: { n: "??" },
      /*::[*/
      155: { n: "??" },
      /*::[*/
      156: { n: "??" },
      /*::[*/
      163: { n: "??" },
      /*::[*/
      174: { n: "??" },
      /*::[*/
      175: { n: "??" },
      /*::[*/
      176: { n: "??" },
      /*::[*/
      177: { n: "??" },
      /*::[*/
      184: { n: "??" },
      /*::[*/
      185: { n: "??" },
      /*::[*/
      186: { n: "??" },
      /*::[*/
      187: { n: "??" },
      /*::[*/
      188: { n: "??" },
      /*::[*/
      195: { n: "??" },
      /*::[*/
      201: { n: "??" },
      /*::[*/
      204: { n: "SHEETNAMECS", f: parse_SHEETNAMECS },
      /*::[*/
      205: { n: "??" },
      /*::[*/
      206: { n: "??" },
      /*::[*/
      207: { n: "??" },
      /*::[*/
      208: { n: "??" },
      /*::[*/
      256: { n: "??" },
      /*::[*/
      259: { n: "??" },
      /*::[*/
      260: { n: "??" },
      /*::[*/
      261: { n: "??" },
      /*::[*/
      262: { n: "??" },
      /*::[*/
      263: { n: "??" },
      /*::[*/
      265: { n: "??" },
      /*::[*/
      266: { n: "??" },
      /*::[*/
      267: { n: "??" },
      /*::[*/
      268: { n: "??" },
      /*::[*/
      270: { n: "??" },
      /*::[*/
      271: { n: "??" },
      /*::[*/
      384: { n: "??" },
      /*::[*/
      389: { n: "??" },
      /*::[*/
      390: { n: "??" },
      /*::[*/
      393: { n: "??" },
      /*::[*/
      396: { n: "??" },
      /*::[*/
      512: { n: "??" },
      /*::[*/
      514: { n: "??" },
      /*::[*/
      513: { n: "??" },
      /*::[*/
      516: { n: "??" },
      /*::[*/
      517: { n: "??" },
      /*::[*/
      640: { n: "??" },
      /*::[*/
      641: { n: "??" },
      /*::[*/
      642: { n: "??" },
      /*::[*/
      643: { n: "??" },
      /*::[*/
      644: { n: "??" },
      /*::[*/
      645: { n: "??" },
      /*::[*/
      646: { n: "??" },
      /*::[*/
      647: { n: "??" },
      /*::[*/
      648: { n: "??" },
      /*::[*/
      658: { n: "??" },
      /*::[*/
      659: { n: "??" },
      /*::[*/
      660: { n: "??" },
      /*::[*/
      661: { n: "??" },
      /*::[*/
      662: { n: "??" },
      /*::[*/
      665: { n: "??" },
      /*::[*/
      666: { n: "??" },
      /*::[*/
      768: { n: "??" },
      /*::[*/
      772: { n: "??" },
      /*::[*/
      1537: { n: "SHEETINFOQP", f: parse_SHEETINFOQP },
      /*::[*/
      1600: { n: "??" },
      /*::[*/
      1602: { n: "??" },
      /*::[*/
      1793: { n: "??" },
      /*::[*/
      1794: { n: "??" },
      /*::[*/
      1795: { n: "??" },
      /*::[*/
      1796: { n: "??" },
      /*::[*/
      1920: { n: "??" },
      /*::[*/
      2048: { n: "??" },
      /*::[*/
      2049: { n: "??" },
      /*::[*/
      2052: { n: "??" },
      /*::[*/
      2688: { n: "??" },
      /*::[*/
      10998: { n: "??" },
      /*::[*/
      12849: { n: "??" },
      /*::[*/
      28233: { n: "??" },
      /*::[*/
      28484: { n: "??" },
      /*::[*/
      65535: { n: "" }
    };
    return {
      sheet_to_wk1,
      book_to_wk3,
      to_workbook: lotus_to_workbook
    };
  }();
  function parse_rpr(rpr) {
    var font = {}, m = rpr.match(tagregex), i = 0;
    var pass = false;
    if (m) for (; i != m.length; ++i) {
      var y = parsexmltag(m[i]);
      switch (y[0].replace(/\w*:/g, "")) {
        /* 18.8.12 condense CT_BooleanProperty */
        /* ** not required . */
        case "<condense":
          break;
        /* 18.8.17 extend CT_BooleanProperty */
        /* ** not required . */
        case "<extend":
          break;
        /* 18.8.36 shadow CT_BooleanProperty */
        /* ** not required . */
        case "<shadow":
          if (!y.val) break;
        /* falls through */
        case "<shadow>":
        case "<shadow/>":
          font.shadow = 1;
          break;
        case "</shadow>":
          break;
        /* 18.4.1 charset CT_IntProperty TODO */
        case "<charset":
          if (y.val == "1") break;
          font.cp = CS2CP[parseInt(y.val, 10)];
          break;
        /* 18.4.2 outline CT_BooleanProperty TODO */
        case "<outline":
          if (!y.val) break;
        /* falls through */
        case "<outline>":
        case "<outline/>":
          font.outline = 1;
          break;
        case "</outline>":
          break;
        /* 18.4.5 rFont CT_FontName */
        case "<rFont":
          font.name = y.val;
          break;
        /* 18.4.11 sz CT_FontSize */
        case "<sz":
          font.sz = y.val;
          break;
        /* 18.4.10 strike CT_BooleanProperty */
        case "<strike":
          if (!y.val) break;
        /* falls through */
        case "<strike>":
        case "<strike/>":
          font.strike = 1;
          break;
        case "</strike>":
          break;
        /* 18.4.13 u CT_UnderlineProperty */
        case "<u":
          if (!y.val) break;
          switch (y.val) {
            case "double":
              font.uval = "double";
              break;
            case "singleAccounting":
              font.uval = "single-accounting";
              break;
            case "doubleAccounting":
              font.uval = "double-accounting";
              break;
          }
        /* falls through */
        case "<u>":
        case "<u/>":
          font.u = 1;
          break;
        case "</u>":
          break;
        /* 18.8.2 b */
        case "<b":
          if (y.val == "0") break;
        /* falls through */
        case "<b>":
        case "<b/>":
          font.b = 1;
          break;
        case "</b>":
          break;
        /* 18.8.26 i */
        case "<i":
          if (y.val == "0") break;
        /* falls through */
        case "<i>":
        case "<i/>":
          font.i = 1;
          break;
        case "</i>":
          break;
        /* 18.3.1.15 color CT_Color TODO: tint, theme, auto, indexed */
        case "<color":
          if (y.rgb) font.color = y.rgb.slice(2, 8);
          break;
        case "<color>":
        case "<color/>":
        case "</color>":
          break;
        /* 18.8.18 family ST_FontFamily */
        case "<family":
          font.family = y.val;
          break;
        case "<family>":
        case "<family/>":
        case "</family>":
          break;
        /* 18.4.14 vertAlign CT_VerticalAlignFontProperty TODO */
        case "<vertAlign":
          font.valign = y.val;
          break;
        case "<vertAlign>":
        case "<vertAlign/>":
        case "</vertAlign>":
          break;
        /* 18.8.35 scheme CT_FontScheme TODO */
        case "<scheme":
          break;
        case "<scheme>":
        case "<scheme/>":
        case "</scheme>":
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (y[0].charCodeAt(1) !== 47 && !pass) throw new Error("Unrecognized rich format " + y[0]);
      }
    }
    return font;
  }
  var parse_rs = /* @__PURE__ */ function() {
    var tregex = matchtag("t"), rpregex = matchtag("rPr");
    function parse_r(r) {
      var t = r.match(tregex);
      if (!t) return { t: "s", v: "" };
      var o = { t: "s", v: unescapexml(t[1]) };
      var rpr = r.match(rpregex);
      if (rpr) o.s = parse_rpr(rpr[1]);
      return o;
    }
    var rregex = /<(?:\w+:)?r>/g, rend = /<\/(?:\w+:)?r>/;
    return function parse_rs2(rs) {
      return rs.replace(rregex, "").split(rend).map(parse_r).filter(function(r) {
        return r.v;
      });
    };
  }();
  var rs_to_html = /* @__PURE__ */ function parse_rs_factory() {
    var nlregex = /(\r\n|\n)/g;
    function parse_rpr2(font, intro, outro) {
      var style = [];
      if (font.u) style.push("text-decoration: underline;");
      if (font.uval) style.push("text-underline-style:" + font.uval + ";");
      if (font.sz) style.push("font-size:" + font.sz + "pt;");
      if (font.outline) style.push("text-effect: outline;");
      if (font.shadow) style.push("text-shadow: auto;");
      intro.push('<span style="' + style.join("") + '">');
      if (font.b) {
        intro.push("<b>");
        outro.push("</b>");
      }
      if (font.i) {
        intro.push("<i>");
        outro.push("</i>");
      }
      if (font.strike) {
        intro.push("<s>");
        outro.push("</s>");
      }
      var align = font.valign || "";
      if (align == "superscript" || align == "super") align = "sup";
      else if (align == "subscript") align = "sub";
      if (align != "") {
        intro.push("<" + align + ">");
        outro.push("</" + align + ">");
      }
      outro.push("</span>");
      return font;
    }
    function r_to_html(r) {
      var terms = [[], r.v, []];
      if (!r.v) return "";
      if (r.s) parse_rpr2(r.s, terms[0], terms[2]);
      return terms[0].join("") + terms[1].replace(nlregex, "<br/>") + terms[2].join("");
    }
    return function parse_rs2(rs) {
      return rs.map(r_to_html).join("");
    };
  }();
  var sitregex = /<(?:\w+:)?t[^>]*>([^<]*)<\/(?:\w+:)?t>/g;
  var sirregex = /<(?:\w+:)?r>/;
  var sirphregex = /<(?:\w+:)?rPh.*?>([\s\S]*?)<\/(?:\w+:)?rPh>/g;
  function parse_si(x, opts) {
    var html = opts ? opts.cellHTML : true;
    var z = {};
    if (!x) return { t: "" };
    if (x.match(/^\s*<(?:\w+:)?t[^>]*>/)) {
      z.t = unescapexml(utf8read(x.slice(x.indexOf(">") + 1).split(/<\/(?:\w+:)?t>/)[0] || ""));
      z.r = utf8read(x);
      if (html) z.h = escapehtml(z.t);
    } else if (
      /*y = */
      x.match(sirregex)
    ) {
      z.r = utf8read(x);
      z.t = unescapexml(utf8read((x.replace(sirphregex, "").match(sitregex) || []).join("").replace(tagregex, "")));
      if (html) z.h = rs_to_html(parse_rs(z.r));
    }
    return z;
  }
  var sstr0 = /<(?:\w+:)?sst([^>]*)>([\s\S]*)<\/(?:\w+:)?sst>/;
  var sstr1 = /<(?:\w+:)?(?:si|sstItem)>/g;
  var sstr2 = /<\/(?:\w+:)?(?:si|sstItem)>/;
  function parse_sst_xml(data, opts) {
    var s = [], ss = "";
    if (!data) return s;
    var sst = data.match(sstr0);
    if (sst) {
      ss = sst[2].replace(sstr1, "").split(sstr2);
      for (var i = 0; i != ss.length; ++i) {
        var o = parse_si(ss[i].trim(), opts);
        if (o != null) s[s.length] = o;
      }
      sst = parsexmltag(sst[1]);
      s.Count = sst.count;
      s.Unique = sst.uniqueCount;
    }
    return s;
  }
  function parse_BrtBeginSst(data) {
    return [data.read_shift(4), data.read_shift(4)];
  }
  function parse_sst_bin(data, opts) {
    var s = [];
    var pass = false;
    recordhopper(data, function hopper_sst(val, R, RT) {
      switch (RT) {
        case 159:
          s.Count = val[0];
          s.Unique = val[1];
          break;
        case 19:
          s.push(val);
          break;
        case 160:
          return true;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        default:
          if (R.T) {
          }
          if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    });
    return s;
  }
  function _JS2ANSI(str) {
    if (typeof $cptable !== "undefined") return $cptable.utils.encode(current_ansi, str);
    var o = [], oo = str.split("");
    for (var i = 0; i < oo.length; ++i) o[i] = oo[i].charCodeAt(0);
    return o;
  }
  function parse_CRYPTOVersion(blob, length) {
    var o = {};
    o.Major = blob.read_shift(2);
    o.Minor = blob.read_shift(2);
    if (length >= 4) blob.l += length - 4;
    return o;
  }
  function parse_DataSpaceVersionInfo(blob) {
    var o = {};
    o.id = blob.read_shift(0, "lpp4");
    o.R = parse_CRYPTOVersion(blob, 4);
    o.U = parse_CRYPTOVersion(blob, 4);
    o.W = parse_CRYPTOVersion(blob, 4);
    return o;
  }
  function parse_DataSpaceMapEntry(blob) {
    var len = blob.read_shift(4);
    var end = blob.l + len - 4;
    var o = {};
    var cnt = blob.read_shift(4);
    var comps = [];
    while (cnt-- > 0) comps.push({ t: blob.read_shift(4), v: blob.read_shift(0, "lpp4") });
    o.name = blob.read_shift(0, "lpp4");
    o.comps = comps;
    if (blob.l != end) throw new Error("Bad DataSpaceMapEntry: " + blob.l + " != " + end);
    return o;
  }
  function parse_DataSpaceMap(blob) {
    var o = [];
    blob.l += 4;
    var cnt = blob.read_shift(4);
    while (cnt-- > 0) o.push(parse_DataSpaceMapEntry(blob));
    return o;
  }
  function parse_DataSpaceDefinition(blob) {
    var o = [];
    blob.l += 4;
    var cnt = blob.read_shift(4);
    while (cnt-- > 0) o.push(blob.read_shift(0, "lpp4"));
    return o;
  }
  function parse_TransformInfoHeader(blob) {
    var o = {};
    blob.read_shift(4);
    blob.l += 4;
    o.id = blob.read_shift(0, "lpp4");
    o.name = blob.read_shift(0, "lpp4");
    o.R = parse_CRYPTOVersion(blob, 4);
    o.U = parse_CRYPTOVersion(blob, 4);
    o.W = parse_CRYPTOVersion(blob, 4);
    return o;
  }
  function parse_Primary(blob) {
    var hdr = parse_TransformInfoHeader(blob);
    hdr.ename = blob.read_shift(0, "8lpp4");
    hdr.blksz = blob.read_shift(4);
    hdr.cmode = blob.read_shift(4);
    if (blob.read_shift(4) != 4) throw new Error("Bad !Primary record");
    return hdr;
  }
  function parse_EncryptionHeader(blob, length) {
    var tgt = blob.l + length;
    var o = {};
    o.Flags = blob.read_shift(4) & 63;
    blob.l += 4;
    o.AlgID = blob.read_shift(4);
    var valid = false;
    switch (o.AlgID) {
      case 26126:
      case 26127:
      case 26128:
        valid = o.Flags == 36;
        break;
      case 26625:
        valid = o.Flags == 4;
        break;
      case 0:
        valid = o.Flags == 16 || o.Flags == 4 || o.Flags == 36;
        break;
      default:
        throw "Unrecognized encryption algorithm: " + o.AlgID;
    }
    if (!valid) throw new Error("Encryption Flags/AlgID mismatch");
    o.AlgIDHash = blob.read_shift(4);
    o.KeySize = blob.read_shift(4);
    o.ProviderType = blob.read_shift(4);
    blob.l += 8;
    o.CSPName = blob.read_shift(tgt - blob.l >> 1, "utf16le");
    blob.l = tgt;
    return o;
  }
  function parse_EncryptionVerifier(blob, length) {
    var o = {}, tgt = blob.l + length;
    blob.l += 4;
    o.Salt = blob.slice(blob.l, blob.l + 16);
    blob.l += 16;
    o.Verifier = blob.slice(blob.l, blob.l + 16);
    blob.l += 16;
    blob.read_shift(4);
    o.VerifierHash = blob.slice(blob.l, tgt);
    blob.l = tgt;
    return o;
  }
  function parse_EncryptionInfo(blob) {
    var vers = parse_CRYPTOVersion(blob);
    switch (vers.Minor) {
      case 2:
        return [vers.Minor, parse_EncInfoStd(blob, vers)];
      case 3:
        return [vers.Minor, parse_EncInfoExt(blob, vers)];
      case 4:
        return [vers.Minor, parse_EncInfoAgl(blob, vers)];
    }
    throw new Error("ECMA-376 Encrypted file unrecognized Version: " + vers.Minor);
  }
  function parse_EncInfoStd(blob) {
    var flags = blob.read_shift(4);
    if ((flags & 63) != 36) throw new Error("EncryptionInfo mismatch");
    var sz = blob.read_shift(4);
    var hdr = parse_EncryptionHeader(blob, sz);
    var verifier = parse_EncryptionVerifier(blob, blob.length - blob.l);
    return { t: "Std", h: hdr, v: verifier };
  }
  function parse_EncInfoExt() {
    throw new Error("File is password-protected: ECMA-376 Extensible");
  }
  function parse_EncInfoAgl(blob) {
    var KeyData = ["saltSize", "blockSize", "keyBits", "hashSize", "cipherAlgorithm", "cipherChaining", "hashAlgorithm", "saltValue"];
    blob.l += 4;
    var xml = blob.read_shift(blob.length - blob.l, "utf8");
    var o = {};
    xml.replace(tagregex, function xml_agile(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<?xml":
          break;
        case "<encryption":
        case "</encryption>":
          break;
        case "<keyData":
          KeyData.forEach(function(k) {
            o[k] = y[k];
          });
          break;
        case "<dataIntegrity":
          o.encryptedHmacKey = y.encryptedHmacKey;
          o.encryptedHmacValue = y.encryptedHmacValue;
          break;
        case "<keyEncryptors>":
        case "<keyEncryptors":
          o.encs = [];
          break;
        case "</keyEncryptors>":
          break;
        case "<keyEncryptor":
          o.uri = y.uri;
          break;
        case "</keyEncryptor>":
          break;
        case "<encryptedKey":
          o.encs.push(y);
          break;
        default:
          throw y[0];
      }
    });
    return o;
  }
  function parse_RC4CryptoHeader(blob, length) {
    var o = {};
    var vers = o.EncryptionVersionInfo = parse_CRYPTOVersion(blob, 4);
    length -= 4;
    if (vers.Minor != 2) throw new Error("unrecognized minor version code: " + vers.Minor);
    if (vers.Major > 4 || vers.Major < 2) throw new Error("unrecognized major version code: " + vers.Major);
    o.Flags = blob.read_shift(4);
    length -= 4;
    var sz = blob.read_shift(4);
    length -= 4;
    o.EncryptionHeader = parse_EncryptionHeader(blob, sz);
    length -= sz;
    o.EncryptionVerifier = parse_EncryptionVerifier(blob, length);
    return o;
  }
  function parse_RC4Header(blob) {
    var o = {};
    var vers = o.EncryptionVersionInfo = parse_CRYPTOVersion(blob, 4);
    if (vers.Major != 1 || vers.Minor != 1) throw "unrecognized version code " + vers.Major + " : " + vers.Minor;
    o.Salt = blob.read_shift(16);
    o.EncryptedVerifier = blob.read_shift(16);
    o.EncryptedVerifierHash = blob.read_shift(16);
    return o;
  }
  function crypto_CreatePasswordVerifier_Method1(Password) {
    var Verifier = 0, PasswordArray;
    var PasswordDecoded = _JS2ANSI(Password);
    var len = PasswordDecoded.length + 1, i, PasswordByte;
    var Intermediate1, Intermediate2, Intermediate3;
    PasswordArray = new_raw_buf(len);
    PasswordArray[0] = PasswordDecoded.length;
    for (i = 1; i != len; ++i) PasswordArray[i] = PasswordDecoded[i - 1];
    for (i = len - 1; i >= 0; --i) {
      PasswordByte = PasswordArray[i];
      Intermediate1 = (Verifier & 16384) === 0 ? 0 : 1;
      Intermediate2 = Verifier << 1 & 32767;
      Intermediate3 = Intermediate1 | Intermediate2;
      Verifier = Intermediate3 ^ PasswordByte;
    }
    return Verifier ^ 52811;
  }
  var crypto_CreateXorArray_Method1 = /* @__PURE__ */ function() {
    var PadArray = [187, 255, 255, 186, 255, 255, 185, 128, 0, 190, 15, 0, 191, 15, 0];
    var InitialCode = [57840, 7439, 52380, 33984, 4364, 3600, 61902, 12606, 6258, 57657, 54287, 34041, 10252, 43370, 20163];
    var XorMatrix = [44796, 19929, 39858, 10053, 20106, 40212, 10761, 31585, 63170, 64933, 60267, 50935, 40399, 11199, 17763, 35526, 1453, 2906, 5812, 11624, 23248, 885, 1770, 3540, 7080, 14160, 28320, 56640, 55369, 41139, 20807, 41614, 21821, 43642, 17621, 28485, 56970, 44341, 19019, 38038, 14605, 29210, 60195, 50791, 40175, 10751, 21502, 43004, 24537, 18387, 36774, 3949, 7898, 15796, 31592, 63184, 47201, 24803, 49606, 37805, 14203, 28406, 56812, 17824, 35648, 1697, 3394, 6788, 13576, 27152, 43601, 17539, 35078, 557, 1114, 2228, 4456, 30388, 60776, 51953, 34243, 7079, 14158, 28316, 14128, 28256, 56512, 43425, 17251, 34502, 7597, 13105, 26210, 52420, 35241, 883, 1766, 3532, 4129, 8258, 16516, 33032, 4657, 9314, 18628];
    var Ror = function(Byte) {
      return (Byte / 2 | Byte * 128) & 255;
    };
    var XorRor = function(byte1, byte2) {
      return Ror(byte1 ^ byte2);
    };
    var CreateXorKey_Method1 = function(Password) {
      var XorKey = InitialCode[Password.length - 1];
      var CurrentElement = 104;
      for (var i = Password.length - 1; i >= 0; --i) {
        var Char = Password[i];
        for (var j = 0; j != 7; ++j) {
          if (Char & 64) XorKey ^= XorMatrix[CurrentElement];
          Char *= 2;
          --CurrentElement;
        }
      }
      return XorKey;
    };
    return function(password) {
      var Password = _JS2ANSI(password);
      var XorKey = CreateXorKey_Method1(Password);
      var Index = Password.length;
      var ObfuscationArray = new_raw_buf(16);
      for (var i = 0; i != 16; ++i) ObfuscationArray[i] = 0;
      var Temp, PasswordLastChar, PadIndex;
      if ((Index & 1) === 1) {
        Temp = XorKey >> 8;
        ObfuscationArray[Index] = XorRor(PadArray[0], Temp);
        --Index;
        Temp = XorKey & 255;
        PasswordLastChar = Password[Password.length - 1];
        ObfuscationArray[Index] = XorRor(PasswordLastChar, Temp);
      }
      while (Index > 0) {
        --Index;
        Temp = XorKey >> 8;
        ObfuscationArray[Index] = XorRor(Password[Index], Temp);
        --Index;
        Temp = XorKey & 255;
        ObfuscationArray[Index] = XorRor(Password[Index], Temp);
      }
      Index = 15;
      PadIndex = 15 - Password.length;
      while (PadIndex > 0) {
        Temp = XorKey >> 8;
        ObfuscationArray[Index] = XorRor(PadArray[PadIndex], Temp);
        --Index;
        --PadIndex;
        Temp = XorKey & 255;
        ObfuscationArray[Index] = XorRor(Password[Index], Temp);
        --Index;
        --PadIndex;
      }
      return ObfuscationArray;
    };
  }();
  var crypto_DecryptData_Method1 = function(password, Data, XorArrayIndex, XorArray, O) {
    if (!O) O = Data;
    if (!XorArray) XorArray = crypto_CreateXorArray_Method1(password);
    var Index, Value;
    for (Index = 0; Index != Data.length; ++Index) {
      Value = Data[Index];
      Value ^= XorArray[XorArrayIndex];
      Value = (Value >> 5 | Value << 3) & 255;
      O[Index] = Value;
      ++XorArrayIndex;
    }
    return [O, XorArrayIndex, XorArray];
  };
  var crypto_MakeXorDecryptor = function(password) {
    var XorArrayIndex = 0, XorArray = crypto_CreateXorArray_Method1(password);
    return function(Data) {
      var O = crypto_DecryptData_Method1("", Data, XorArrayIndex, XorArray);
      XorArrayIndex = O[1];
      return O[0];
    };
  };
  function parse_XORObfuscation(blob, length, opts, out) {
    var o = { key: parseuint16(blob), verificationBytes: parseuint16(blob) };
    if (opts.password) o.verifier = crypto_CreatePasswordVerifier_Method1(opts.password);
    out.valid = o.verificationBytes === o.verifier;
    if (out.valid) out.insitu = crypto_MakeXorDecryptor(opts.password);
    return o;
  }
  function parse_FilePassHeader(blob, length, oo) {
    var o = oo || {};
    o.Info = blob.read_shift(2);
    blob.l -= 2;
    if (o.Info === 1) o.Data = parse_RC4Header(blob, length);
    else o.Data = parse_RC4CryptoHeader(blob, length);
    return o;
  }
  function parse_FilePass(blob, length, opts) {
    var o = { Type: opts.biff >= 8 ? blob.read_shift(2) : 0 };
    if (o.Type) parse_FilePassHeader(blob, length - 2, o);
    else parse_XORObfuscation(blob, opts.biff >= 8 ? length : length - 2, opts, o);
    return o;
  }
  var RTF = /* @__PURE__ */ function() {
    function rtf_to_sheet(d, opts) {
      switch (opts.type) {
        case "base64":
          return rtf_to_sheet_str(Base64_decode(d), opts);
        case "binary":
          return rtf_to_sheet_str(d, opts);
        case "buffer":
          return rtf_to_sheet_str(has_buf && Buffer.isBuffer(d) ? d.toString("binary") : a2s(d), opts);
        case "array":
          return rtf_to_sheet_str(cc2str(d), opts);
      }
      throw new Error("Unrecognized type " + opts.type);
    }
    function rtf_to_sheet_str(str, opts) {
      var o = opts || {};
      var ws = o.dense ? [] : {};
      var rows = str.match(/\\trowd.*?\\row\b/g);
      if (!rows.length) throw new Error("RTF missing table");
      var range = { s: { c: 0, r: 0 }, e: { c: 0, r: rows.length - 1 } };
      rows.forEach(function(rowtf, R) {
        if (Array.isArray(ws)) ws[R] = [];
        var rtfre = /\\\w+\b/g;
        var last_index = 0;
        var res;
        var C = -1;
        while (res = rtfre.exec(rowtf)) {
          switch (res[0]) {
            case "\\cell":
              var data = rowtf.slice(last_index, rtfre.lastIndex - res[0].length);
              if (data[0] == " ") data = data.slice(1);
              ++C;
              if (data.length) {
                var cell = { v: data, t: "s" };
                if (Array.isArray(ws)) ws[R][C] = cell;
                else ws[encode_cell({ r: R, c: C })] = cell;
              }
              break;
          }
          last_index = rtfre.lastIndex;
        }
        if (C > range.e.c) range.e.c = C;
      });
      ws["!ref"] = encode_range(range);
      return ws;
    }
    function rtf_to_workbook(d, opts) {
      return sheet_to_workbook(rtf_to_sheet(d, opts), opts);
    }
    function sheet_to_rtf(ws) {
      var o = ["{\\rtf1\\ansi"];
      var r = safe_decode_range(ws["!ref"]), cell;
      var dense = Array.isArray(ws);
      for (var R = r.s.r; R <= r.e.r; ++R) {
        o.push("\\trowd\\trautofit1");
        for (var C = r.s.c; C <= r.e.c; ++C) o.push("\\cellx" + (C + 1));
        o.push("\\pard\\intbl");
        for (C = r.s.c; C <= r.e.c; ++C) {
          var coord = encode_cell({ r: R, c: C });
          cell = dense ? (ws[R] || [])[C] : ws[coord];
          if (!cell || cell.v == null && (!cell.f || cell.F)) continue;
          o.push(" " + (cell.w || (format_cell(cell), cell.w)));
          o.push("\\cell");
        }
        o.push("\\pard\\intbl\\row");
      }
      return o.join("") + "}";
    }
    return {
      to_workbook: rtf_to_workbook,
      to_sheet: rtf_to_sheet,
      from_sheet: sheet_to_rtf
    };
  }();
  function hex2RGB(h) {
    var o = h.slice(h[0] === "#" ? 1 : 0).slice(0, 6);
    return [parseInt(o.slice(0, 2), 16), parseInt(o.slice(2, 4), 16), parseInt(o.slice(4, 6), 16)];
  }
  function rgb2Hex(rgb) {
    for (var i = 0, o = 1; i != 3; ++i) o = o * 256 + (rgb[i] > 255 ? 255 : rgb[i] < 0 ? 0 : rgb[i]);
    return o.toString(16).toUpperCase().slice(1);
  }
  function rgb2HSL(rgb) {
    var R = rgb[0] / 255, G = rgb[1] / 255, B = rgb[2] / 255;
    var M = Math.max(R, G, B), m = Math.min(R, G, B), C = M - m;
    if (C === 0) return [0, 0, R];
    var H6 = 0, S2 = 0, L2 = M + m;
    S2 = C / (L2 > 1 ? 2 - L2 : L2);
    switch (M) {
      case R:
        H6 = ((G - B) / C + 6) % 6;
        break;
      case G:
        H6 = (B - R) / C + 2;
        break;
      case B:
        H6 = (R - G) / C + 4;
        break;
    }
    return [H6 / 6, S2, L2 / 2];
  }
  function hsl2RGB(hsl) {
    var H = hsl[0], S2 = hsl[1], L = hsl[2];
    var C = S2 * 2 * (L < 0.5 ? L : 1 - L), m = L - C / 2;
    var rgb = [m, m, m], h6 = 6 * H;
    var X;
    if (S2 !== 0) switch (h6 | 0) {
      case 0:
      case 6:
        X = C * h6;
        rgb[0] += C;
        rgb[1] += X;
        break;
      case 1:
        X = C * (2 - h6);
        rgb[0] += X;
        rgb[1] += C;
        break;
      case 2:
        X = C * (h6 - 2);
        rgb[1] += C;
        rgb[2] += X;
        break;
      case 3:
        X = C * (4 - h6);
        rgb[1] += X;
        rgb[2] += C;
        break;
      case 4:
        X = C * (h6 - 4);
        rgb[2] += C;
        rgb[0] += X;
        break;
      case 5:
        X = C * (6 - h6);
        rgb[2] += X;
        rgb[0] += C;
        break;
    }
    for (var i = 0; i != 3; ++i) rgb[i] = Math.round(rgb[i] * 255);
    return rgb;
  }
  function rgb_tint(hex, tint) {
    if (tint === 0) return hex;
    var hsl = rgb2HSL(hex2RGB(hex));
    if (tint < 0) hsl[2] = hsl[2] * (1 + tint);
    else hsl[2] = 1 - (1 - hsl[2]) * (1 - tint);
    return rgb2Hex(hsl2RGB(hsl));
  }
  var DEF_MDW = 6;
  var MAX_MDW = 15;
  var MIN_MDW = 1;
  var MDW = DEF_MDW;
  function width2px(width) {
    return Math.floor((width + Math.round(128 / MDW) / 256) * MDW);
  }
  function px2char(px) {
    return Math.floor((px - 5) / MDW * 100 + 0.5) / 100;
  }
  function char2width(chr) {
    return Math.round((chr * MDW + 5) / MDW * 256) / 256;
  }
  function cycle_width(collw) {
    return char2width(px2char(width2px(collw)));
  }
  function find_mdw_colw(collw) {
    var delta = Math.abs(collw - cycle_width(collw)), _MDW = MDW;
    if (delta > 5e-3) {
      for (MDW = MIN_MDW; MDW < MAX_MDW; ++MDW) if (Math.abs(collw - cycle_width(collw)) <= delta) {
        delta = Math.abs(collw - cycle_width(collw));
        _MDW = MDW;
      }
    }
    MDW = _MDW;
  }
  function process_col(coll) {
    if (coll.width) {
      coll.wpx = width2px(coll.width);
      coll.wch = px2char(coll.wpx);
      coll.MDW = MDW;
    } else if (coll.wpx) {
      coll.wch = px2char(coll.wpx);
      coll.width = char2width(coll.wch);
      coll.MDW = MDW;
    } else if (typeof coll.wch == "number") {
      coll.width = char2width(coll.wch);
      coll.wpx = width2px(coll.width);
      coll.MDW = MDW;
    }
    if (coll.customWidth) delete coll.customWidth;
  }
  var DEF_PPI = 96;
  var PPI = DEF_PPI;
  function px2pt(px) {
    return px * 96 / PPI;
  }
  function pt2px(pt) {
    return pt * PPI / 96;
  }
  var XLMLPatternTypeMap = {
    "None": "none",
    "Solid": "solid",
    "Gray50": "mediumGray",
    "Gray75": "darkGray",
    "Gray25": "lightGray",
    "HorzStripe": "darkHorizontal",
    "VertStripe": "darkVertical",
    "ReverseDiagStripe": "darkDown",
    "DiagStripe": "darkUp",
    "DiagCross": "darkGrid",
    "ThickDiagCross": "darkTrellis",
    "ThinHorzStripe": "lightHorizontal",
    "ThinVertStripe": "lightVertical",
    "ThinReverseDiagStripe": "lightDown",
    "ThinHorzCross": "lightGrid"
  };
  function parse_borders(t, styles, themes, opts) {
    styles.Borders = [];
    var border = {};
    var pass = false;
    (t[0].match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<borders":
        case "<borders>":
        case "</borders>":
          break;
        /* 18.8.4 border CT_Border */
        case "<border":
        case "<border>":
        case "<border/>":
          border = /*::(*/
          {};
          if (y.diagonalUp) border.diagonalUp = parsexmlbool(y.diagonalUp);
          if (y.diagonalDown) border.diagonalDown = parsexmlbool(y.diagonalDown);
          styles.Borders.push(border);
          break;
        case "</border>":
          break;
        /* note: not in spec, appears to be CT_BorderPr */
        case "<left/>":
          break;
        case "<left":
        case "<left>":
          break;
        case "</left>":
          break;
        /* note: not in spec, appears to be CT_BorderPr */
        case "<right/>":
          break;
        case "<right":
        case "<right>":
          break;
        case "</right>":
          break;
        /* 18.8.43 top CT_BorderPr */
        case "<top/>":
          break;
        case "<top":
        case "<top>":
          break;
        case "</top>":
          break;
        /* 18.8.6 bottom CT_BorderPr */
        case "<bottom/>":
          break;
        case "<bottom":
        case "<bottom>":
          break;
        case "</bottom>":
          break;
        /* 18.8.13 diagonal CT_BorderPr */
        case "<diagonal":
        case "<diagonal>":
        case "<diagonal/>":
          break;
        case "</diagonal>":
          break;
        /* 18.8.25 horizontal CT_BorderPr */
        case "<horizontal":
        case "<horizontal>":
        case "<horizontal/>":
          break;
        case "</horizontal>":
          break;
        /* 18.8.44 vertical CT_BorderPr */
        case "<vertical":
        case "<vertical>":
        case "<vertical/>":
          break;
        case "</vertical>":
          break;
        /* 18.8.37 start CT_BorderPr */
        case "<start":
        case "<start>":
        case "<start/>":
          break;
        case "</start>":
          break;
        /* 18.8.16 end CT_BorderPr */
        case "<end":
        case "<end>":
        case "<end/>":
          break;
        case "</end>":
          break;
        /* 18.8.? color CT_Color */
        case "<color":
        case "<color>":
          break;
        case "<color/>":
        case "</color>":
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (opts && opts.WTF) {
            if (!pass) throw new Error("unrecognized " + y[0] + " in borders");
          }
      }
    });
  }
  function parse_fills(t, styles, themes, opts) {
    styles.Fills = [];
    var fill2 = {};
    var pass = false;
    (t[0].match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<fills":
        case "<fills>":
        case "</fills>":
          break;
        /* 18.8.20 fill CT_Fill */
        case "<fill>":
        case "<fill":
        case "<fill/>":
          fill2 = {};
          styles.Fills.push(fill2);
          break;
        case "</fill>":
          break;
        /* 18.8.24 gradientFill CT_GradientFill */
        case "<gradientFill>":
          break;
        case "<gradientFill":
        case "</gradientFill>":
          styles.Fills.push(fill2);
          fill2 = {};
          break;
        /* 18.8.32 patternFill CT_PatternFill */
        case "<patternFill":
        case "<patternFill>":
          if (y.patternType) fill2.patternType = y.patternType;
          break;
        case "<patternFill/>":
        case "</patternFill>":
          break;
        /* 18.8.3 bgColor CT_Color */
        case "<bgColor":
          if (!fill2.bgColor) fill2.bgColor = {};
          if (y.indexed) fill2.bgColor.indexed = parseInt(y.indexed, 10);
          if (y.theme) fill2.bgColor.theme = parseInt(y.theme, 10);
          if (y.tint) fill2.bgColor.tint = parseFloat(y.tint);
          if (y.rgb) fill2.bgColor.rgb = y.rgb.slice(-6);
          break;
        case "<bgColor/>":
        case "</bgColor>":
          break;
        /* 18.8.19 fgColor CT_Color */
        case "<fgColor":
          if (!fill2.fgColor) fill2.fgColor = {};
          if (y.theme) fill2.fgColor.theme = parseInt(y.theme, 10);
          if (y.tint) fill2.fgColor.tint = parseFloat(y.tint);
          if (y.rgb != null) fill2.fgColor.rgb = y.rgb.slice(-6);
          break;
        case "<fgColor/>":
        case "</fgColor>":
          break;
        /* 18.8.38 stop CT_GradientStop */
        case "<stop":
        case "<stop/>":
          break;
        case "</stop>":
          break;
        /* 18.8.? color CT_Color */
        case "<color":
        case "<color/>":
          break;
        case "</color>":
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (opts && opts.WTF) {
            if (!pass) throw new Error("unrecognized " + y[0] + " in fills");
          }
      }
    });
  }
  function parse_fonts(t, styles, themes, opts) {
    styles.Fonts = [];
    var font = {};
    var pass = false;
    (t[0].match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<fonts":
        case "<fonts>":
        case "</fonts>":
          break;
        /* 18.8.22 font CT_Font */
        case "<font":
        case "<font>":
          break;
        case "</font>":
        case "<font/>":
          styles.Fonts.push(font);
          font = {};
          break;
        /* 18.8.29 name CT_FontName */
        case "<name":
          if (y.val) font.name = utf8read(y.val);
          break;
        case "<name/>":
        case "</name>":
          break;
        /* 18.8.2  b CT_BooleanProperty */
        case "<b":
          font.bold = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<b/>":
          font.bold = 1;
          break;
        /* 18.8.26 i CT_BooleanProperty */
        case "<i":
          font.italic = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<i/>":
          font.italic = 1;
          break;
        /* 18.4.13 u CT_UnderlineProperty */
        case "<u":
          switch (y.val) {
            case "none":
              font.underline = 0;
              break;
            case "single":
              font.underline = 1;
              break;
            case "double":
              font.underline = 2;
              break;
            case "singleAccounting":
              font.underline = 33;
              break;
            case "doubleAccounting":
              font.underline = 34;
              break;
          }
          break;
        case "<u/>":
          font.underline = 1;
          break;
        /* 18.4.10 strike CT_BooleanProperty */
        case "<strike":
          font.strike = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<strike/>":
          font.strike = 1;
          break;
        /* 18.4.2  outline CT_BooleanProperty */
        case "<outline":
          font.outline = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<outline/>":
          font.outline = 1;
          break;
        /* 18.8.36 shadow CT_BooleanProperty */
        case "<shadow":
          font.shadow = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<shadow/>":
          font.shadow = 1;
          break;
        /* 18.8.12 condense CT_BooleanProperty */
        case "<condense":
          font.condense = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<condense/>":
          font.condense = 1;
          break;
        /* 18.8.17 extend CT_BooleanProperty */
        case "<extend":
          font.extend = y.val ? parsexmlbool(y.val) : 1;
          break;
        case "<extend/>":
          font.extend = 1;
          break;
        /* 18.4.11 sz CT_FontSize */
        case "<sz":
          if (y.val) font.sz = +y.val;
          break;
        case "<sz/>":
        case "</sz>":
          break;
        /* 18.4.14 vertAlign CT_VerticalAlignFontProperty */
        case "<vertAlign":
          if (y.val) font.vertAlign = y.val;
          break;
        case "<vertAlign/>":
        case "</vertAlign>":
          break;
        /* 18.8.18 family CT_FontFamily */
        case "<family":
          if (y.val) font.family = parseInt(y.val, 10);
          break;
        case "<family/>":
        case "</family>":
          break;
        /* 18.8.35 scheme CT_FontScheme */
        case "<scheme":
          if (y.val) font.scheme = y.val;
          break;
        case "<scheme/>":
        case "</scheme>":
          break;
        /* 18.4.1 charset CT_IntProperty */
        case "<charset":
          if (y.val == "1") break;
          y.codepage = CS2CP[parseInt(y.val, 10)];
          break;
        /* 18.?.? color CT_Color */
        case "<color":
          if (!font.color) font.color = {};
          if (y.auto) font.color.auto = parsexmlbool(y.auto);
          if (y.rgb) font.color.rgb = y.rgb.slice(-6);
          else if (y.indexed) {
            font.color.index = parseInt(y.indexed, 10);
            var icv = XLSIcv[font.color.index];
            if (font.color.index == 81) icv = XLSIcv[1];
            if (!icv) icv = XLSIcv[1];
            font.color.rgb = icv[0].toString(16) + icv[1].toString(16) + icv[2].toString(16);
          } else if (y.theme) {
            font.color.theme = parseInt(y.theme, 10);
            if (y.tint) font.color.tint = parseFloat(y.tint);
            if (y.theme && themes.themeElements && themes.themeElements.clrScheme) {
              font.color.rgb = rgb_tint(themes.themeElements.clrScheme[font.color.theme].rgb, font.color.tint || 0);
            }
          }
          break;
        case "<color/>":
        case "</color>":
          break;
        /* note: sometimes mc:AlternateContent appears bare */
        case "<AlternateContent":
          pass = true;
          break;
        case "</AlternateContent>":
          pass = false;
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (opts && opts.WTF) {
            if (!pass) throw new Error("unrecognized " + y[0] + " in fonts");
          }
      }
    });
  }
  function parse_numFmts(t, styles, opts) {
    styles.NumberFmt = [];
    var k = keys(table_fmt);
    for (var i = 0; i < k.length; ++i) styles.NumberFmt[k[i]] = table_fmt[k[i]];
    var m = t[0].match(tagregex);
    if (!m) return;
    for (i = 0; i < m.length; ++i) {
      var y = parsexmltag(m[i]);
      switch (strip_ns(y[0])) {
        case "<numFmts":
        case "</numFmts>":
        case "<numFmts/>":
        case "<numFmts>":
          break;
        case "<numFmt":
          {
            var f = unescapexml(utf8read(y.formatCode)), j = parseInt(y.numFmtId, 10);
            styles.NumberFmt[j] = f;
            if (j > 0) {
              if (j > 392) {
                for (j = 392; j > 60; --j) if (styles.NumberFmt[j] == null) break;
                styles.NumberFmt[j] = f;
              }
              SSF_load(f, j);
            }
          }
          break;
        case "</numFmt>":
          break;
        default:
          if (opts.WTF) throw new Error("unrecognized " + y[0] + " in numFmts");
      }
    }
  }
  var cellXF_uint = ["numFmtId", "fillId", "fontId", "borderId", "xfId"];
  var cellXF_bool = ["applyAlignment", "applyBorder", "applyFill", "applyFont", "applyNumberFormat", "applyProtection", "pivotButton", "quotePrefix"];
  function parse_cellXfs(t, styles, opts) {
    styles.CellXf = [];
    var xf;
    var pass = false;
    (t[0].match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x), i = 0;
      switch (strip_ns(y[0])) {
        case "<cellXfs":
        case "<cellXfs>":
        case "<cellXfs/>":
        case "</cellXfs>":
          break;
        /* 18.8.45 xf CT_Xf */
        case "<xf":
        case "<xf/>":
          xf = y;
          delete xf[0];
          for (i = 0; i < cellXF_uint.length; ++i) if (xf[cellXF_uint[i]])
            xf[cellXF_uint[i]] = parseInt(xf[cellXF_uint[i]], 10);
          for (i = 0; i < cellXF_bool.length; ++i) if (xf[cellXF_bool[i]])
            xf[cellXF_bool[i]] = parsexmlbool(xf[cellXF_bool[i]]);
          if (styles.NumberFmt && xf.numFmtId > 392) {
            for (i = 392; i > 60; --i) if (styles.NumberFmt[xf.numFmtId] == styles.NumberFmt[i]) {
              xf.numFmtId = i;
              break;
            }
          }
          styles.CellXf.push(xf);
          break;
        case "</xf>":
          break;
        /* 18.8.1 alignment CT_CellAlignment */
        case "<alignment":
        case "<alignment/>":
          var alignment = {};
          if (y.vertical) alignment.vertical = y.vertical;
          if (y.horizontal) alignment.horizontal = y.horizontal;
          if (y.textRotation != null) alignment.textRotation = y.textRotation;
          if (y.indent) alignment.indent = y.indent;
          if (y.wrapText) alignment.wrapText = parsexmlbool(y.wrapText);
          xf.alignment = alignment;
          break;
        case "</alignment>":
          break;
        /* 18.8.33 protection CT_CellProtection */
        case "<protection":
          break;
        case "</protection>":
        case "<protection/>":
          break;
        /* note: sometimes mc:AlternateContent appears bare */
        case "<AlternateContent":
          pass = true;
          break;
        case "</AlternateContent>":
          pass = false;
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (opts && opts.WTF) {
            if (!pass) throw new Error("unrecognized " + y[0] + " in cellXfs");
          }
      }
    });
  }
  var parse_sty_xml = /* @__PURE__ */ function make_pstyx() {
    var numFmtRegex = /<(?:\w+:)?numFmts([^>]*)>[\S\s]*?<\/(?:\w+:)?numFmts>/;
    var cellXfRegex = /<(?:\w+:)?cellXfs([^>]*)>[\S\s]*?<\/(?:\w+:)?cellXfs>/;
    var fillsRegex = /<(?:\w+:)?fills([^>]*)>[\S\s]*?<\/(?:\w+:)?fills>/;
    var fontsRegex = /<(?:\w+:)?fonts([^>]*)>[\S\s]*?<\/(?:\w+:)?fonts>/;
    var bordersRegex = /<(?:\w+:)?borders([^>]*)>[\S\s]*?<\/(?:\w+:)?borders>/;
    return function parse_sty_xml2(data, themes, opts) {
      var styles = {};
      if (!data) return styles;
      data = data.replace(/<!--([\s\S]*?)-->/mg, "").replace(/<!DOCTYPE[^\[]*\[[^\]]*\]>/gm, "");
      var t;
      if (t = data.match(numFmtRegex)) parse_numFmts(t, styles, opts);
      if (t = data.match(fontsRegex)) parse_fonts(t, styles, themes, opts);
      if (t = data.match(fillsRegex)) parse_fills(t, styles, themes, opts);
      if (t = data.match(bordersRegex)) parse_borders(t, styles, themes, opts);
      if (t = data.match(cellXfRegex)) parse_cellXfs(t, styles, opts);
      return styles;
    };
  }();
  function parse_BrtFmt(data, length) {
    var numFmtId = data.read_shift(2);
    var stFmtCode = parse_XLWideString(data, length - 2);
    return [numFmtId, stFmtCode];
  }
  function parse_BrtFont(data, length, opts) {
    var out = {};
    out.sz = data.read_shift(2) / 20;
    var grbit = parse_FontFlags(data, 2, opts);
    if (grbit.fItalic) out.italic = 1;
    if (grbit.fCondense) out.condense = 1;
    if (grbit.fExtend) out.extend = 1;
    if (grbit.fShadow) out.shadow = 1;
    if (grbit.fOutline) out.outline = 1;
    if (grbit.fStrikeout) out.strike = 1;
    var bls = data.read_shift(2);
    if (bls === 700) out.bold = 1;
    switch (data.read_shift(2)) {
      /* case 0: out.vertAlign = "baseline"; break; */
      case 1:
        out.vertAlign = "superscript";
        break;
      case 2:
        out.vertAlign = "subscript";
        break;
    }
    var underline = data.read_shift(1);
    if (underline != 0) out.underline = underline;
    var family = data.read_shift(1);
    if (family > 0) out.family = family;
    var bCharSet = data.read_shift(1);
    if (bCharSet > 0) out.charset = bCharSet;
    data.l++;
    out.color = parse_BrtColor(data, 8);
    switch (data.read_shift(1)) {
      /* case 0: out.scheme = "none": break; */
      case 1:
        out.scheme = "major";
        break;
      case 2:
        out.scheme = "minor";
        break;
    }
    out.name = parse_XLWideString(data, length - 21);
    return out;
  }
  var parse_BrtFill = parsenoop;
  function parse_BrtXF(data, length) {
    var tgt = data.l + length;
    var ixfeParent = data.read_shift(2);
    var ifmt = data.read_shift(2);
    data.l = tgt;
    return { ixfe: ixfeParent, numFmtId: ifmt };
  }
  var parse_BrtBorder = parsenoop;
  function parse_sty_bin(data, themes, opts) {
    var styles = {};
    styles.NumberFmt = [];
    for (var y in table_fmt) styles.NumberFmt[y] = table_fmt[y];
    styles.CellXf = [];
    styles.Fonts = [];
    var state = [];
    var pass = false;
    recordhopper(data, function hopper_sty(val, R, RT) {
      switch (RT) {
        case 44:
          styles.NumberFmt[val[0]] = val[1];
          SSF_load(val[1], val[0]);
          break;
        case 43:
          styles.Fonts.push(val);
          if (val.color.theme != null && themes && themes.themeElements && themes.themeElements.clrScheme) {
            val.color.rgb = rgb_tint(themes.themeElements.clrScheme[val.color.theme].rgb, val.color.tint || 0);
          }
          break;
        case 1025:
          break;
        case 45:
          break;
        case 46:
          break;
        case 47:
          if (state[state.length - 1] == 617) {
            styles.CellXf.push(val);
          }
          break;
        case 48:
        /* BrtStyle */
        case 507:
        /* BrtDXF */
        case 572:
        /* BrtMRUColor */
        case 475:
          break;
        case 1171:
        /* BrtDXF14 */
        case 2102:
        /* BrtDXF15 */
        case 1130:
        /* BrtSlicerStyleElement */
        case 512:
        /* BrtTableStyleElement */
        case 2095:
        /* BrtTimelineStyleElement */
        case 3072:
          break;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        case 37:
          state.push(RT);
          pass = true;
          break;
        case 38:
          state.pop();
          pass = false;
          break;
        default:
          if (R.T > 0) state.push(RT);
          else if (R.T < 0) state.pop();
          else if (!pass || opts.WTF && state[state.length - 1] != 37) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    });
    return styles;
  }
  var XLSXThemeClrScheme = [
    "</a:lt1>",
    "</a:dk1>",
    "</a:lt2>",
    "</a:dk2>",
    "</a:accent1>",
    "</a:accent2>",
    "</a:accent3>",
    "</a:accent4>",
    "</a:accent5>",
    "</a:accent6>",
    "</a:hlink>",
    "</a:folHlink>"
  ];
  function parse_clrScheme(t, themes, opts) {
    themes.themeElements.clrScheme = [];
    var color = {};
    (t[0].match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (y[0]) {
        /* 20.1.6.2 clrScheme (Color Scheme) CT_ColorScheme */
        case "<a:clrScheme":
        case "</a:clrScheme>":
          break;
        /* 20.1.2.3.32 srgbClr CT_SRgbColor */
        case "<a:srgbClr":
          color.rgb = y.val;
          break;
        /* 20.1.2.3.33 sysClr CT_SystemColor */
        case "<a:sysClr":
          color.rgb = y.lastClr;
          break;
        /* 20.1.4.1.1 accent1 (Accent 1) */
        /* 20.1.4.1.2 accent2 (Accent 2) */
        /* 20.1.4.1.3 accent3 (Accent 3) */
        /* 20.1.4.1.4 accent4 (Accent 4) */
        /* 20.1.4.1.5 accent5 (Accent 5) */
        /* 20.1.4.1.6 accent6 (Accent 6) */
        /* 20.1.4.1.9 dk1 (Dark 1) */
        /* 20.1.4.1.10 dk2 (Dark 2) */
        /* 20.1.4.1.15 folHlink (Followed Hyperlink) */
        /* 20.1.4.1.19 hlink (Hyperlink) */
        /* 20.1.4.1.22 lt1 (Light 1) */
        /* 20.1.4.1.23 lt2 (Light 2) */
        case "<a:dk1>":
        case "</a:dk1>":
        case "<a:lt1>":
        case "</a:lt1>":
        case "<a:dk2>":
        case "</a:dk2>":
        case "<a:lt2>":
        case "</a:lt2>":
        case "<a:accent1>":
        case "</a:accent1>":
        case "<a:accent2>":
        case "</a:accent2>":
        case "<a:accent3>":
        case "</a:accent3>":
        case "<a:accent4>":
        case "</a:accent4>":
        case "<a:accent5>":
        case "</a:accent5>":
        case "<a:accent6>":
        case "</a:accent6>":
        case "<a:hlink>":
        case "</a:hlink>":
        case "<a:folHlink>":
        case "</a:folHlink>":
          if (y[0].charAt(1) === "/") {
            themes.themeElements.clrScheme[XLSXThemeClrScheme.indexOf(y[0])] = color;
            color = {};
          } else {
            color.name = y[0].slice(3, y[0].length - 1);
          }
          break;
        default:
          if (opts && opts.WTF) throw new Error("Unrecognized " + y[0] + " in clrScheme");
      }
    });
  }
  function parse_fontScheme() {
  }
  function parse_fmtScheme() {
  }
  var clrsregex = /<a:clrScheme([^>]*)>[\s\S]*<\/a:clrScheme>/;
  var fntsregex = /<a:fontScheme([^>]*)>[\s\S]*<\/a:fontScheme>/;
  var fmtsregex = /<a:fmtScheme([^>]*)>[\s\S]*<\/a:fmtScheme>/;
  function parse_themeElements(data, themes, opts) {
    themes.themeElements = {};
    var t;
    [
      /* clrScheme CT_ColorScheme */
      ["clrScheme", clrsregex, parse_clrScheme],
      /* fontScheme CT_FontScheme */
      ["fontScheme", fntsregex, parse_fontScheme],
      /* fmtScheme CT_StyleMatrix */
      ["fmtScheme", fmtsregex, parse_fmtScheme]
    ].forEach(function(m) {
      if (!(t = data.match(m[1]))) throw new Error(m[0] + " not found in themeElements");
      m[2](t, themes, opts);
    });
  }
  var themeltregex = /<a:themeElements([^>]*)>[\s\S]*<\/a:themeElements>/;
  function parse_theme_xml(data, opts) {
    if (!data || data.length === 0) data = write_theme();
    var t;
    var themes = {};
    if (!(t = data.match(themeltregex))) throw new Error("themeElements not found in theme");
    parse_themeElements(t[0], themes, opts);
    themes.raw = data;
    return themes;
  }
  function write_theme(Themes, opts) {
    if (opts && opts.themeXLSX) return opts.themeXLSX;
    if (Themes && typeof Themes.raw == "string") return Themes.raw;
    var o = [XML_HEADER];
    o[o.length] = '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">';
    o[o.length] = "<a:themeElements>";
    o[o.length] = '<a:clrScheme name="Office">';
    o[o.length] = '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>';
    o[o.length] = '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>';
    o[o.length] = '<a:dk2><a:srgbClr val="1F497D"/></a:dk2>';
    o[o.length] = '<a:lt2><a:srgbClr val="EEECE1"/></a:lt2>';
    o[o.length] = '<a:accent1><a:srgbClr val="4F81BD"/></a:accent1>';
    o[o.length] = '<a:accent2><a:srgbClr val="C0504D"/></a:accent2>';
    o[o.length] = '<a:accent3><a:srgbClr val="9BBB59"/></a:accent3>';
    o[o.length] = '<a:accent4><a:srgbClr val="8064A2"/></a:accent4>';
    o[o.length] = '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5>';
    o[o.length] = '<a:accent6><a:srgbClr val="F79646"/></a:accent6>';
    o[o.length] = '<a:hlink><a:srgbClr val="0000FF"/></a:hlink>';
    o[o.length] = '<a:folHlink><a:srgbClr val="800080"/></a:folHlink>';
    o[o.length] = "</a:clrScheme>";
    o[o.length] = '<a:fontScheme name="Office">';
    o[o.length] = "<a:majorFont>";
    o[o.length] = '<a:latin typeface="Cambria"/>';
    o[o.length] = '<a:ea typeface=""/>';
    o[o.length] = '<a:cs typeface=""/>';
    o[o.length] = '<a:font script="Jpan" typeface="\uFF2D\uFF33 \uFF30\u30B4\u30B7\u30C3\u30AF"/>';
    o[o.length] = '<a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/>';
    o[o.length] = '<a:font script="Hans" typeface="\u5B8B\u4F53"/>';
    o[o.length] = '<a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/>';
    o[o.length] = '<a:font script="Arab" typeface="Times New Roman"/>';
    o[o.length] = '<a:font script="Hebr" typeface="Times New Roman"/>';
    o[o.length] = '<a:font script="Thai" typeface="Tahoma"/>';
    o[o.length] = '<a:font script="Ethi" typeface="Nyala"/>';
    o[o.length] = '<a:font script="Beng" typeface="Vrinda"/>';
    o[o.length] = '<a:font script="Gujr" typeface="Shruti"/>';
    o[o.length] = '<a:font script="Khmr" typeface="MoolBoran"/>';
    o[o.length] = '<a:font script="Knda" typeface="Tunga"/>';
    o[o.length] = '<a:font script="Guru" typeface="Raavi"/>';
    o[o.length] = '<a:font script="Cans" typeface="Euphemia"/>';
    o[o.length] = '<a:font script="Cher" typeface="Plantagenet Cherokee"/>';
    o[o.length] = '<a:font script="Yiii" typeface="Microsoft Yi Baiti"/>';
    o[o.length] = '<a:font script="Tibt" typeface="Microsoft Himalaya"/>';
    o[o.length] = '<a:font script="Thaa" typeface="MV Boli"/>';
    o[o.length] = '<a:font script="Deva" typeface="Mangal"/>';
    o[o.length] = '<a:font script="Telu" typeface="Gautami"/>';
    o[o.length] = '<a:font script="Taml" typeface="Latha"/>';
    o[o.length] = '<a:font script="Syrc" typeface="Estrangelo Edessa"/>';
    o[o.length] = '<a:font script="Orya" typeface="Kalinga"/>';
    o[o.length] = '<a:font script="Mlym" typeface="Kartika"/>';
    o[o.length] = '<a:font script="Laoo" typeface="DokChampa"/>';
    o[o.length] = '<a:font script="Sinh" typeface="Iskoola Pota"/>';
    o[o.length] = '<a:font script="Mong" typeface="Mongolian Baiti"/>';
    o[o.length] = '<a:font script="Viet" typeface="Times New Roman"/>';
    o[o.length] = '<a:font script="Uigh" typeface="Microsoft Uighur"/>';
    o[o.length] = '<a:font script="Geor" typeface="Sylfaen"/>';
    o[o.length] = "</a:majorFont>";
    o[o.length] = "<a:minorFont>";
    o[o.length] = '<a:latin typeface="Calibri"/>';
    o[o.length] = '<a:ea typeface=""/>';
    o[o.length] = '<a:cs typeface=""/>';
    o[o.length] = '<a:font script="Jpan" typeface="\uFF2D\uFF33 \uFF30\u30B4\u30B7\u30C3\u30AF"/>';
    o[o.length] = '<a:font script="Hang" typeface="\uB9D1\uC740 \uACE0\uB515"/>';
    o[o.length] = '<a:font script="Hans" typeface="\u5B8B\u4F53"/>';
    o[o.length] = '<a:font script="Hant" typeface="\u65B0\u7D30\u660E\u9AD4"/>';
    o[o.length] = '<a:font script="Arab" typeface="Arial"/>';
    o[o.length] = '<a:font script="Hebr" typeface="Arial"/>';
    o[o.length] = '<a:font script="Thai" typeface="Tahoma"/>';
    o[o.length] = '<a:font script="Ethi" typeface="Nyala"/>';
    o[o.length] = '<a:font script="Beng" typeface="Vrinda"/>';
    o[o.length] = '<a:font script="Gujr" typeface="Shruti"/>';
    o[o.length] = '<a:font script="Khmr" typeface="DaunPenh"/>';
    o[o.length] = '<a:font script="Knda" typeface="Tunga"/>';
    o[o.length] = '<a:font script="Guru" typeface="Raavi"/>';
    o[o.length] = '<a:font script="Cans" typeface="Euphemia"/>';
    o[o.length] = '<a:font script="Cher" typeface="Plantagenet Cherokee"/>';
    o[o.length] = '<a:font script="Yiii" typeface="Microsoft Yi Baiti"/>';
    o[o.length] = '<a:font script="Tibt" typeface="Microsoft Himalaya"/>';
    o[o.length] = '<a:font script="Thaa" typeface="MV Boli"/>';
    o[o.length] = '<a:font script="Deva" typeface="Mangal"/>';
    o[o.length] = '<a:font script="Telu" typeface="Gautami"/>';
    o[o.length] = '<a:font script="Taml" typeface="Latha"/>';
    o[o.length] = '<a:font script="Syrc" typeface="Estrangelo Edessa"/>';
    o[o.length] = '<a:font script="Orya" typeface="Kalinga"/>';
    o[o.length] = '<a:font script="Mlym" typeface="Kartika"/>';
    o[o.length] = '<a:font script="Laoo" typeface="DokChampa"/>';
    o[o.length] = '<a:font script="Sinh" typeface="Iskoola Pota"/>';
    o[o.length] = '<a:font script="Mong" typeface="Mongolian Baiti"/>';
    o[o.length] = '<a:font script="Viet" typeface="Arial"/>';
    o[o.length] = '<a:font script="Uigh" typeface="Microsoft Uighur"/>';
    o[o.length] = '<a:font script="Geor" typeface="Sylfaen"/>';
    o[o.length] = "</a:minorFont>";
    o[o.length] = "</a:fontScheme>";
    o[o.length] = '<a:fmtScheme name="Office">';
    o[o.length] = "<a:fillStyleLst>";
    o[o.length] = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    o[o.length] = '<a:gradFill rotWithShape="1">';
    o[o.length] = "<a:gsLst>";
    o[o.length] = '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="35000"><a:schemeClr val="phClr"><a:tint val="37000"/><a:satMod val="300000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="15000"/><a:satMod val="350000"/></a:schemeClr></a:gs>';
    o[o.length] = "</a:gsLst>";
    o[o.length] = '<a:lin ang="16200000" scaled="1"/>';
    o[o.length] = "</a:gradFill>";
    o[o.length] = '<a:gradFill rotWithShape="1">';
    o[o.length] = "<a:gsLst>";
    o[o.length] = '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="100000"/><a:shade val="100000"/><a:satMod val="130000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="100000"><a:schemeClr val="phClr"><a:tint val="50000"/><a:shade val="100000"/><a:satMod val="350000"/></a:schemeClr></a:gs>';
    o[o.length] = "</a:gsLst>";
    o[o.length] = '<a:lin ang="16200000" scaled="0"/>';
    o[o.length] = "</a:gradFill>";
    o[o.length] = "</a:fillStyleLst>";
    o[o.length] = "<a:lnStyleLst>";
    o[o.length] = '<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"><a:shade val="95000"/><a:satMod val="105000"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/></a:ln>';
    o[o.length] = '<a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
    o[o.length] = '<a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
    o[o.length] = "</a:lnStyleLst>";
    o[o.length] = "<a:effectStyleLst>";
    o[o.length] = "<a:effectStyle>";
    o[o.length] = "<a:effectLst>";
    o[o.length] = '<a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="38000"/></a:srgbClr></a:outerShdw>';
    o[o.length] = "</a:effectLst>";
    o[o.length] = "</a:effectStyle>";
    o[o.length] = "<a:effectStyle>";
    o[o.length] = "<a:effectLst>";
    o[o.length] = '<a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw>';
    o[o.length] = "</a:effectLst>";
    o[o.length] = "</a:effectStyle>";
    o[o.length] = "<a:effectStyle>";
    o[o.length] = "<a:effectLst>";
    o[o.length] = '<a:outerShdw blurRad="40000" dist="23000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="35000"/></a:srgbClr></a:outerShdw>';
    o[o.length] = "</a:effectLst>";
    o[o.length] = '<a:scene3d><a:camera prst="orthographicFront"><a:rot lat="0" lon="0" rev="0"/></a:camera><a:lightRig rig="threePt" dir="t"><a:rot lat="0" lon="0" rev="1200000"/></a:lightRig></a:scene3d>';
    o[o.length] = '<a:sp3d><a:bevelT w="63500" h="25400"/></a:sp3d>';
    o[o.length] = "</a:effectStyle>";
    o[o.length] = "</a:effectStyleLst>";
    o[o.length] = "<a:bgFillStyleLst>";
    o[o.length] = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    o[o.length] = '<a:gradFill rotWithShape="1">';
    o[o.length] = "<a:gsLst>";
    o[o.length] = '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/><a:satMod val="350000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="40000"><a:schemeClr val="phClr"><a:tint val="45000"/><a:shade val="99000"/><a:satMod val="350000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="20000"/><a:satMod val="255000"/></a:schemeClr></a:gs>';
    o[o.length] = "</a:gsLst>";
    o[o.length] = '<a:path path="circle"><a:fillToRect l="50000" t="-80000" r="50000" b="180000"/></a:path>';
    o[o.length] = "</a:gradFill>";
    o[o.length] = '<a:gradFill rotWithShape="1">';
    o[o.length] = "<a:gsLst>";
    o[o.length] = '<a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/><a:satMod val="300000"/></a:schemeClr></a:gs>';
    o[o.length] = '<a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/><a:satMod val="200000"/></a:schemeClr></a:gs>';
    o[o.length] = "</a:gsLst>";
    o[o.length] = '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>';
    o[o.length] = "</a:gradFill>";
    o[o.length] = "</a:bgFillStyleLst>";
    o[o.length] = "</a:fmtScheme>";
    o[o.length] = "</a:themeElements>";
    o[o.length] = "<a:objectDefaults>";
    o[o.length] = "<a:spDef>";
    o[o.length] = '<a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></a:style>';
    o[o.length] = "</a:spDef>";
    o[o.length] = "<a:lnDef>";
    o[o.length] = '<a:spPr/><a:bodyPr/><a:lstStyle/><a:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></a:style>';
    o[o.length] = "</a:lnDef>";
    o[o.length] = "</a:objectDefaults>";
    o[o.length] = "<a:extraClrSchemeLst/>";
    o[o.length] = "</a:theme>";
    return o.join("");
  }
  function parse_Theme(blob, length, opts) {
    var end = blob.l + length;
    var dwThemeVersion = blob.read_shift(4);
    if (dwThemeVersion === 124226) return;
    if (!opts.cellStyles) {
      blob.l = end;
      return;
    }
    var data = blob.slice(blob.l);
    blob.l = end;
    var zip;
    try {
      zip = zip_read(data, { type: "array" });
    } catch (e) {
      return;
    }
    var themeXML = getzipstr(zip, "theme/theme/theme1.xml", true);
    if (!themeXML) return;
    return parse_theme_xml(themeXML, opts);
  }
  function parse_ColorTheme(blob) {
    return blob.read_shift(4);
  }
  function parse_FullColorExt(blob) {
    var o = {};
    o.xclrType = blob.read_shift(2);
    o.nTintShade = blob.read_shift(2);
    switch (o.xclrType) {
      case 0:
        blob.l += 4;
        break;
      case 1:
        o.xclrValue = parse_IcvXF(blob, 4);
        break;
      case 2:
        o.xclrValue = parse_LongRGBA(blob, 4);
        break;
      case 3:
        o.xclrValue = parse_ColorTheme(blob, 4);
        break;
      case 4:
        blob.l += 4;
        break;
    }
    blob.l += 8;
    return o;
  }
  function parse_IcvXF(blob, length) {
    return parsenoop(blob, length);
  }
  function parse_XFExtGradient(blob, length) {
    return parsenoop(blob, length);
  }
  function parse_ExtProp(blob) {
    var extType = blob.read_shift(2);
    var cb = blob.read_shift(2) - 4;
    var o = [extType];
    switch (extType) {
      case 4:
      case 5:
      case 7:
      case 8:
      case 9:
      case 10:
      case 11:
      case 13:
        o[1] = parse_FullColorExt(blob, cb);
        break;
      case 6:
        o[1] = parse_XFExtGradient(blob, cb);
        break;
      case 14:
      case 15:
        o[1] = blob.read_shift(cb === 1 ? 1 : 2);
        break;
      default:
        throw new Error("Unrecognized ExtProp type: " + extType + " " + cb);
    }
    return o;
  }
  function parse_XFExt(blob, length) {
    var end = blob.l + length;
    blob.l += 2;
    var ixfe = blob.read_shift(2);
    blob.l += 2;
    var cexts = blob.read_shift(2);
    var ext = [];
    while (cexts-- > 0) ext.push(parse_ExtProp(blob, end - blob.l));
    return { ixfe, ext };
  }
  function update_xfext(xf, xfext) {
    xfext.forEach(function(xfe) {
      switch (xfe[0]) {
        /* 2.5.108 extPropData */
        case 4:
          break;
        /* foreground color */
        case 5:
          break;
        /* background color */
        case 6:
          break;
        /* gradient fill */
        case 7:
          break;
        /* top cell border color */
        case 8:
          break;
        /* bottom cell border color */
        case 9:
          break;
        /* left cell border color */
        case 10:
          break;
        /* right cell border color */
        case 11:
          break;
        /* diagonal cell border color */
        case 13:
          break;
        case 14:
          break;
        /* font scheme */
        case 15:
          break;
      }
    });
  }
  function parse_BrtMdtinfo(data, length) {
    return {
      flags: data.read_shift(4),
      version: data.read_shift(4),
      name: parse_XLWideString(data, length - 8)
    };
  }
  function parse_BrtMdb(data) {
    var out = [];
    var cnt = data.read_shift(4);
    while (cnt-- > 0)
      out.push([data.read_shift(4), data.read_shift(4)]);
    return out;
  }
  function parse_BrtBeginEsmdb(data) {
    data.l += 4;
    return data.read_shift(4) != 0;
  }
  function parse_xlmeta_bin(data, name, _opts) {
    var out = { Types: [], Cell: [], Value: [] };
    var opts = _opts || {};
    var state = [];
    var pass = false;
    var metatype = 2;
    recordhopper(data, function(val, R, RT) {
      switch (RT) {
        case 335:
          out.Types.push({ name: val.name });
          break;
        case 51:
          val.forEach(function(r) {
            if (metatype == 1)
              out.Cell.push({ type: out.Types[r[0] - 1].name, index: r[1] });
            else if (metatype == 0)
              out.Value.push({ type: out.Types[r[0] - 1].name, index: r[1] });
          });
          break;
        case 337:
          metatype = val ? 1 : 0;
          break;
        case 338:
          metatype = 2;
          break;
        case 35:
          state.push(RT);
          pass = true;
          break;
        case 36:
          state.pop();
          pass = false;
          break;
        default:
          if (R.T) {
          } else if (!pass || opts.WTF && state[state.length - 1] != 35)
            throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    });
    return out;
  }
  function parse_xlmeta_xml(data, name, opts) {
    var out = { Types: [], Cell: [], Value: [] };
    if (!data)
      return out;
    var pass = false;
    var metatype = 2;
    var lastmeta;
    data.replace(tagregex, function(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<?xml":
          break;
        case "<metadata":
        case "</metadata>":
          break;
        case "<metadataTypes":
        case "</metadataTypes>":
          break;
        case "<metadataType":
          out.Types.push({ name: y.name });
          break;
        case "</metadataType>":
          break;
        case "<futureMetadata":
          for (var j = 0; j < out.Types.length; ++j)
            if (out.Types[j].name == y.name)
              lastmeta = out.Types[j];
          break;
        case "</futureMetadata>":
          break;
        case "<bk>":
          break;
        case "</bk>":
          break;
        case "<rc":
          if (metatype == 1)
            out.Cell.push({ type: out.Types[y.t - 1].name, index: +y.v });
          else if (metatype == 0)
            out.Value.push({ type: out.Types[y.t - 1].name, index: +y.v });
          break;
        case "</rc>":
          break;
        case "<cellMetadata":
          metatype = 1;
          break;
        case "</cellMetadata>":
          metatype = 2;
          break;
        case "<valueMetadata":
          metatype = 0;
          break;
        case "</valueMetadata>":
          metatype = 2;
          break;
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
        case "<extLst/>":
          break;
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        case "<rvb":
          if (!lastmeta)
            break;
          if (!lastmeta.offsets)
            lastmeta.offsets = [];
          lastmeta.offsets.push(+y.i);
          break;
        default:
          if (!pass && opts.WTF)
            throw new Error("unrecognized " + y[0] + " in metadata");
      }
      return x;
    });
    return out;
  }
  function parse_cc_xml(data) {
    var d = [];
    if (!data) return d;
    var i = 1;
    (data.match(tagregex) || []).forEach(function(x) {
      var y = parsexmltag(x);
      switch (y[0]) {
        case "<?xml":
          break;
        /* 18.6.2  calcChain CT_CalcChain 1 */
        case "<calcChain":
        case "<calcChain>":
        case "</calcChain>":
          break;
        /* 18.6.1  c CT_CalcCell 1 */
        case "<c":
          delete y[0];
          if (y.i) i = y.i;
          else y.i = i;
          d.push(y);
          break;
      }
    });
    return d;
  }
  function parse_BrtCalcChainItem$(data) {
    var out = {};
    out.i = data.read_shift(4);
    var cell = {};
    cell.r = data.read_shift(4);
    cell.c = data.read_shift(4);
    out.r = encode_cell(cell);
    var flags = data.read_shift(1);
    if (flags & 2) out.l = "1";
    if (flags & 8) out.a = "1";
    return out;
  }
  function parse_cc_bin(data, name, opts) {
    var out = [];
    var pass = false;
    recordhopper(data, function hopper_cc(val, R, RT) {
      switch (RT) {
        case 63:
          out.push(val);
          break;
        default:
          if (R.T) {
          } else if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    });
    return out;
  }
  function parse_xlink_xml() {
  }
  function parse_xlink_bin(data, rel, name, _opts) {
    if (!data) return data;
    var opts = _opts || {};
    var pass = false, end = false;
    recordhopper(data, function xlink_parse(val, R, RT) {
      if (end) return;
      switch (RT) {
        case 359:
        /* 'BrtSupTabs' */
        case 363:
        /* 'BrtExternTableStart' */
        case 364:
        /* 'BrtExternTableEnd' */
        case 366:
        /* 'BrtExternRowHdr' */
        case 367:
        /* 'BrtExternCellBlank' */
        case 368:
        /* 'BrtExternCellReal' */
        case 369:
        /* 'BrtExternCellBool' */
        case 370:
        /* 'BrtExternCellError' */
        case 371:
        /* 'BrtExternCellString' */
        case 472:
        /* 'BrtExternValueMeta' */
        case 577:
        /* 'BrtSupNameStart' */
        case 578:
        /* 'BrtSupNameValueStart' */
        case 579:
        /* 'BrtSupNameValueEnd' */
        case 580:
        /* 'BrtSupNameNum' */
        case 581:
        /* 'BrtSupNameErr' */
        case 582:
        /* 'BrtSupNameSt' */
        case 583:
        /* 'BrtSupNameNil' */
        case 584:
        /* 'BrtSupNameBool' */
        case 585:
        /* 'BrtSupNameFmla' */
        case 586:
        /* 'BrtSupNameBits' */
        case 587:
          break;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        default:
          if (R.T) {
          } else if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    }, opts);
  }
  function parse_drawing(data, rels) {
    if (!data) return "??";
    var id = (data.match(/<c:chart [^>]*r:id="([^"]*)"/) || ["", ""])[1];
    return rels["!id"][id].Target;
  }
  function sheet_insert_comments(sheet, comments, threaded, people) {
    var dense = Array.isArray(sheet);
    var cell;
    comments.forEach(function(comment) {
      var r = decode_cell(comment.ref);
      if (dense) {
        if (!sheet[r.r]) sheet[r.r] = [];
        cell = sheet[r.r][r.c];
      } else cell = sheet[comment.ref];
      if (!cell) {
        cell = { t: "z" };
        if (dense) sheet[r.r][r.c] = cell;
        else sheet[comment.ref] = cell;
        var range = safe_decode_range(sheet["!ref"] || "BDWGO1000001:A1");
        if (range.s.r > r.r) range.s.r = r.r;
        if (range.e.r < r.r) range.e.r = r.r;
        if (range.s.c > r.c) range.s.c = r.c;
        if (range.e.c < r.c) range.e.c = r.c;
        var encoded = encode_range(range);
        if (encoded !== sheet["!ref"]) sheet["!ref"] = encoded;
      }
      if (!cell.c) cell.c = [];
      var o = { a: comment.author, t: comment.t, r: comment.r, T: threaded };
      if (comment.h) o.h = comment.h;
      for (var i = cell.c.length - 1; i >= 0; --i) {
        if (!threaded && cell.c[i].T) return;
        if (threaded && !cell.c[i].T) cell.c.splice(i, 1);
      }
      if (threaded && people) for (i = 0; i < people.length; ++i) {
        if (o.a == people[i].id) {
          o.a = people[i].name || o.a;
          break;
        }
      }
      cell.c.push(o);
    });
  }
  function parse_comments_xml(data, opts) {
    if (data.match(/<(?:\w+:)?comments *\/>/)) return [];
    var authors = [];
    var commentList = [];
    var authtag = data.match(/<(?:\w+:)?authors>([\s\S]*)<\/(?:\w+:)?authors>/);
    if (authtag && authtag[1]) authtag[1].split(/<\/\w*:?author>/).forEach(function(x) {
      if (x === "" || x.trim() === "") return;
      var a = x.match(/<(?:\w+:)?author[^>]*>(.*)/);
      if (a) authors.push(a[1]);
    });
    var cmnttag = data.match(/<(?:\w+:)?commentList>([\s\S]*)<\/(?:\w+:)?commentList>/);
    if (cmnttag && cmnttag[1]) cmnttag[1].split(/<\/\w*:?comment>/).forEach(function(x) {
      if (x === "" || x.trim() === "") return;
      var cm = x.match(/<(?:\w+:)?comment[^>]*>/);
      if (!cm) return;
      var y = parsexmltag(cm[0]);
      var comment = { author: y.authorId && authors[y.authorId] || "sheetjsghost", ref: y.ref, guid: y.guid };
      var cell = decode_cell(y.ref);
      if (opts.sheetRows && opts.sheetRows <= cell.r) return;
      var textMatch = x.match(/<(?:\w+:)?text>([\s\S]*)<\/(?:\w+:)?text>/);
      var rt = !!textMatch && !!textMatch[1] && parse_si(textMatch[1]) || { r: "", t: "", h: "" };
      comment.r = rt.r;
      if (rt.r == "<t></t>") rt.t = rt.h = "";
      comment.t = (rt.t || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      if (opts.cellHTML) comment.h = rt.h;
      commentList.push(comment);
    });
    return commentList;
  }
  function parse_tcmnt_xml(data, opts) {
    var out = [];
    var pass = false, comment = {}, tidx = 0;
    data.replace(tagregex, function xml_tcmnt(x, idx) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<?xml":
          break;
        /* 2.6.207 ThreadedComments CT_ThreadedComments */
        case "<ThreadedComments":
          break;
        case "</ThreadedComments>":
          break;
        /* 2.6.205 threadedComment CT_ThreadedComment */
        case "<threadedComment":
          comment = { author: y.personId, guid: y.id, ref: y.ref, T: 1 };
          break;
        case "</threadedComment>":
          if (comment.t != null) out.push(comment);
          break;
        case "<text>":
        case "<text":
          tidx = idx + x.length;
          break;
        case "</text>":
          comment.t = data.slice(tidx, idx).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
          break;
        /* 2.6.206 mentions CT_ThreadedCommentMentions TODO */
        case "<mentions":
        case "<mentions>":
          pass = true;
          break;
        case "</mentions>":
          pass = false;
          break;
        /* 2.6.202 mention CT_Mention TODO */
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
        case "<extLst/>":
          break;
        /* 18.2.7  ext CT_Extension + */
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (!pass && opts.WTF) throw new Error("unrecognized " + y[0] + " in threaded comments");
      }
      return x;
    });
    return out;
  }
  function parse_people_xml(data, opts) {
    var out = [];
    var pass = false;
    data.replace(tagregex, function xml_tcmnt(x) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<?xml":
          break;
        /* 2.4.85 personList CT_PersonList */
        case "<personList":
          break;
        case "</personList>":
          break;
        /* 2.6.203 person CT_Person TODO: providers */
        case "<person":
          out.push({ name: y.displayname, id: y.id });
          break;
        case "</person>":
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
        case "<extLst/>":
          break;
        /* 18.2.7  ext CT_Extension + */
        case "<ext":
          pass = true;
          break;
        case "</ext>":
          pass = false;
          break;
        default:
          if (!pass && opts.WTF) throw new Error("unrecognized " + y[0] + " in threaded comments");
      }
      return x;
    });
    return out;
  }
  function parse_BrtBeginComment(data) {
    var out = {};
    out.iauthor = data.read_shift(4);
    var rfx = parse_UncheckedRfX(data, 16);
    out.rfx = rfx.s;
    out.ref = encode_cell(rfx.s);
    data.l += 16;
    return out;
  }
  var parse_BrtCommentAuthor = parse_XLWideString;
  function parse_comments_bin(data, opts) {
    var out = [];
    var authors = [];
    var c = {};
    var pass = false;
    recordhopper(data, function hopper_cmnt(val, R, RT) {
      switch (RT) {
        case 632:
          authors.push(val);
          break;
        case 635:
          c = val;
          break;
        case 637:
          c.t = val.t;
          c.h = val.h;
          c.r = val.r;
          break;
        case 636:
          c.author = authors[c.iauthor];
          delete c.iauthor;
          if (opts.sheetRows && c.rfx && opts.sheetRows <= c.rfx.r) break;
          if (!c.t) c.t = "";
          delete c.rfx;
          out.push(c);
          break;
        case 3072:
          break;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        case 37:
          break;
        case 38:
          break;
        default:
          if (R.T) {
          } else if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    });
    return out;
  }
  var CT_VBA = "application/vnd.ms-office.vbaProject";
  function make_vba_xls(cfb) {
    var newcfb = CFB.utils.cfb_new({ root: "R" });
    cfb.FullPaths.forEach(function(p, i) {
      if (p.slice(-1) === "/" || !p.match(/_VBA_PROJECT_CUR/))
        return;
      var newpath = p.replace(/^[^\/]*/, "R").replace(/\/_VBA_PROJECT_CUR\u0000*/, "");
      CFB.utils.cfb_add(newcfb, newpath, cfb.FileIndex[i].content);
    });
    return CFB.write(newcfb);
  }
  function parse_ds_bin() {
    return { "!type": "dialog" };
  }
  function parse_ds_xml() {
    return { "!type": "dialog" };
  }
  function parse_ms_bin() {
    return { "!type": "macro" };
  }
  function parse_ms_xml() {
    return { "!type": "macro" };
  }
  var rc_to_a1 = /* @__PURE__ */ function() {
    var rcregex = /(^|[^A-Za-z_])R(\[?-?\d+\]|[1-9]\d*|)C(\[?-?\d+\]|[1-9]\d*|)(?![A-Za-z0-9_])/g;
    var rcbase = { r: 0, c: 0 };
    function rcfunc($$, $1, $22, $3) {
      var cRel = false, rRel = false;
      if ($22.length == 0) rRel = true;
      else if ($22.charAt(0) == "[") {
        rRel = true;
        $22 = $22.slice(1, -1);
      }
      if ($3.length == 0) cRel = true;
      else if ($3.charAt(0) == "[") {
        cRel = true;
        $3 = $3.slice(1, -1);
      }
      var R = $22.length > 0 ? parseInt($22, 10) | 0 : 0, C = $3.length > 0 ? parseInt($3, 10) | 0 : 0;
      if (cRel) C += rcbase.c;
      else --C;
      if (rRel) R += rcbase.r;
      else --R;
      return $1 + (cRel ? "" : "$") + encode_col(C) + (rRel ? "" : "$") + encode_row(R);
    }
    return function rc_to_a12(fstr, base) {
      rcbase = base;
      return fstr.replace(rcregex, rcfunc);
    };
  }();
  var crefregex = /(^|[^._A-Z0-9])([$]?)([A-Z]{1,2}|[A-W][A-Z]{2}|X[A-E][A-Z]|XF[A-D])([$]?)(10[0-3]\d{4}|104[0-7]\d{3}|1048[0-4]\d{2}|10485[0-6]\d|104857[0-6]|[1-9]\d{0,5})(?![_.\(A-Za-z0-9])/g;
  var a1_to_rc = /* @__PURE__ */ function() {
    return function a1_to_rc2(fstr, base) {
      return fstr.replace(crefregex, function($0, $1, $22, $3, $4, $5) {
        var c = decode_col($3) - ($22 ? 0 : base.c);
        var r = decode_row($5) - ($4 ? 0 : base.r);
        var R = r == 0 ? "" : !$4 ? "[" + r + "]" : r + 1;
        var C = c == 0 ? "" : !$22 ? "[" + c + "]" : c + 1;
        return $1 + "R" + R + "C" + C;
      });
    };
  }();
  function shift_formula_str(f, delta) {
    return f.replace(crefregex, function($0, $1, $22, $3, $4, $5) {
      return $1 + ($22 == "$" ? $22 + $3 : encode_col(decode_col($3) + delta.c)) + ($4 == "$" ? $4 + $5 : encode_row(decode_row($5) + delta.r));
    });
  }
  function shift_formula_xlsx(f, range, cell) {
    var r = decode_range(range), s = r.s, c = decode_cell(cell);
    var delta = { r: c.r - s.r, c: c.c - s.c };
    return shift_formula_str(f, delta);
  }
  function fuzzyfmla(f) {
    if (f.length == 1) return false;
    return true;
  }
  function _xlfn(f) {
    return f.replace(/_xlfn\./g, "");
  }
  function parseread1(blob) {
    blob.l += 1;
    return;
  }
  function parse_ColRelU(blob, length) {
    var c = blob.read_shift(length == 1 ? 1 : 2);
    return [c & 16383, c >> 14 & 1, c >> 15 & 1];
  }
  function parse_RgceArea(blob, length, opts) {
    var w = 2;
    if (opts) {
      if (opts.biff >= 2 && opts.biff <= 5) return parse_RgceArea_BIFF2(blob, length, opts);
      else if (opts.biff == 12) w = 4;
    }
    var r = blob.read_shift(w), R = blob.read_shift(w);
    var c = parse_ColRelU(blob, 2);
    var C = parse_ColRelU(blob, 2);
    return { s: { r, c: c[0], cRel: c[1], rRel: c[2] }, e: { r: R, c: C[0], cRel: C[1], rRel: C[2] } };
  }
  function parse_RgceArea_BIFF2(blob) {
    var r = parse_ColRelU(blob, 2), R = parse_ColRelU(blob, 2);
    var c = blob.read_shift(1);
    var C = blob.read_shift(1);
    return { s: { r: r[0], c, cRel: r[1], rRel: r[2] }, e: { r: R[0], c: C, cRel: R[1], rRel: R[2] } };
  }
  function parse_RgceAreaRel(blob, length, opts) {
    if (opts.biff < 8) return parse_RgceArea_BIFF2(blob, length, opts);
    var r = blob.read_shift(opts.biff == 12 ? 4 : 2), R = blob.read_shift(opts.biff == 12 ? 4 : 2);
    var c = parse_ColRelU(blob, 2);
    var C = parse_ColRelU(blob, 2);
    return { s: { r, c: c[0], cRel: c[1], rRel: c[2] }, e: { r: R, c: C[0], cRel: C[1], rRel: C[2] } };
  }
  function parse_RgceLoc(blob, length, opts) {
    if (opts && opts.biff >= 2 && opts.biff <= 5) return parse_RgceLoc_BIFF2(blob, length, opts);
    var r = blob.read_shift(opts && opts.biff == 12 ? 4 : 2);
    var c = parse_ColRelU(blob, 2);
    return { r, c: c[0], cRel: c[1], rRel: c[2] };
  }
  function parse_RgceLoc_BIFF2(blob) {
    var r = parse_ColRelU(blob, 2);
    var c = blob.read_shift(1);
    return { r: r[0], c, cRel: r[1], rRel: r[2] };
  }
  function parse_RgceElfLoc(blob) {
    var r = blob.read_shift(2);
    var c = blob.read_shift(2);
    return { r, c: c & 255, fQuoted: !!(c & 16384), cRel: c >> 15, rRel: c >> 15 };
  }
  function parse_RgceLocRel(blob, length, opts) {
    var biff = opts && opts.biff ? opts.biff : 8;
    if (biff >= 2 && biff <= 5) return parse_RgceLocRel_BIFF2(blob, length, opts);
    var r = blob.read_shift(biff >= 12 ? 4 : 2);
    var cl = blob.read_shift(2);
    var cRel = (cl & 16384) >> 14, rRel = (cl & 32768) >> 15;
    cl &= 16383;
    if (rRel == 1) while (r > 524287) r -= 1048576;
    if (cRel == 1) while (cl > 8191) cl = cl - 16384;
    return { r, c: cl, cRel, rRel };
  }
  function parse_RgceLocRel_BIFF2(blob) {
    var rl = blob.read_shift(2);
    var c = blob.read_shift(1);
    var rRel = (rl & 32768) >> 15, cRel = (rl & 16384) >> 14;
    rl &= 16383;
    if (rRel == 1 && rl >= 8192) rl = rl - 16384;
    if (cRel == 1 && c >= 128) c = c - 256;
    return { r: rl, c, cRel, rRel };
  }
  function parse_PtgArea(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    var area = parse_RgceArea(blob, opts.biff >= 2 && opts.biff <= 5 ? 6 : 8, opts);
    return [type, area];
  }
  function parse_PtgArea3d(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    var ixti = blob.read_shift(2, "i");
    var w = 8;
    if (opts) switch (opts.biff) {
      case 5:
        blob.l += 12;
        w = 6;
        break;
      case 12:
        w = 12;
        break;
    }
    var area = parse_RgceArea(blob, w, opts);
    return [type, ixti, area];
  }
  function parse_PtgAreaErr(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    blob.l += opts && opts.biff > 8 ? 12 : opts.biff < 8 ? 6 : 8;
    return [type];
  }
  function parse_PtgAreaErr3d(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    var ixti = blob.read_shift(2);
    var w = 8;
    if (opts) switch (opts.biff) {
      case 5:
        blob.l += 12;
        w = 6;
        break;
      case 12:
        w = 12;
        break;
    }
    blob.l += w;
    return [type, ixti];
  }
  function parse_PtgAreaN(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    var area = parse_RgceAreaRel(blob, length - 1, opts);
    return [type, area];
  }
  function parse_PtgArray(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    blob.l += opts.biff == 2 ? 6 : opts.biff == 12 ? 14 : 7;
    return [type];
  }
  function parse_PtgAttrBaxcel(blob) {
    var bitSemi = blob[blob.l + 1] & 1;
    var bitBaxcel = 1;
    blob.l += 4;
    return [bitSemi, bitBaxcel];
  }
  function parse_PtgAttrChoose(blob, length, opts) {
    blob.l += 2;
    var offset = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    var o = [];
    for (var i = 0; i <= offset; ++i) o.push(blob.read_shift(opts && opts.biff == 2 ? 1 : 2));
    return o;
  }
  function parse_PtgAttrGoto(blob, length, opts) {
    var bitGoto = blob[blob.l + 1] & 255 ? 1 : 0;
    blob.l += 2;
    return [bitGoto, blob.read_shift(opts && opts.biff == 2 ? 1 : 2)];
  }
  function parse_PtgAttrIf(blob, length, opts) {
    var bitIf = blob[blob.l + 1] & 255 ? 1 : 0;
    blob.l += 2;
    return [bitIf, blob.read_shift(opts && opts.biff == 2 ? 1 : 2)];
  }
  function parse_PtgAttrIfError(blob) {
    var bitIf = blob[blob.l + 1] & 255 ? 1 : 0;
    blob.l += 2;
    return [bitIf, blob.read_shift(2)];
  }
  function parse_PtgAttrSemi(blob, length, opts) {
    var bitSemi = blob[blob.l + 1] & 255 ? 1 : 0;
    blob.l += opts && opts.biff == 2 ? 3 : 4;
    return [bitSemi];
  }
  function parse_PtgAttrSpaceType(blob) {
    var type = blob.read_shift(1), cch = blob.read_shift(1);
    return [type, cch];
  }
  function parse_PtgAttrSpace(blob) {
    blob.read_shift(2);
    return parse_PtgAttrSpaceType(blob, 2);
  }
  function parse_PtgAttrSpaceSemi(blob) {
    blob.read_shift(2);
    return parse_PtgAttrSpaceType(blob, 2);
  }
  function parse_PtgRef(blob, length, opts) {
    var type = (blob[blob.l] & 96) >> 5;
    blob.l += 1;
    var loc = parse_RgceLoc(blob, 0, opts);
    return [type, loc];
  }
  function parse_PtgRefN(blob, length, opts) {
    var type = (blob[blob.l] & 96) >> 5;
    blob.l += 1;
    var loc = parse_RgceLocRel(blob, 0, opts);
    return [type, loc];
  }
  function parse_PtgRef3d(blob, length, opts) {
    var type = (blob[blob.l] & 96) >> 5;
    blob.l += 1;
    var ixti = blob.read_shift(2);
    if (opts && opts.biff == 5) blob.l += 12;
    var loc = parse_RgceLoc(blob, 0, opts);
    return [type, ixti, loc];
  }
  function parse_PtgFunc(blob, length, opts) {
    var type = (blob[blob.l] & 96) >> 5;
    blob.l += 1;
    var iftab = blob.read_shift(opts && opts.biff <= 3 ? 1 : 2);
    return [FtabArgc[iftab], Ftab[iftab], type];
  }
  function parse_PtgFuncVar(blob, length, opts) {
    var type = blob[blob.l++];
    var cparams = blob.read_shift(1), tab = opts && opts.biff <= 3 ? [type == 88 ? -1 : 0, blob.read_shift(1)] : parsetab(blob);
    return [cparams, (tab[0] === 0 ? Ftab : Cetab)[tab[1]]];
  }
  function parsetab(blob) {
    return [blob[blob.l + 1] >> 7, blob.read_shift(2) & 32767];
  }
  function parse_PtgAttrSum(blob, length, opts) {
    blob.l += opts && opts.biff == 2 ? 3 : 4;
    return;
  }
  function parse_PtgExp(blob, length, opts) {
    blob.l++;
    if (opts && opts.biff == 12) return [blob.read_shift(4, "i"), 0];
    var row = blob.read_shift(2);
    var col = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    return [row, col];
  }
  function parse_PtgErr(blob) {
    blob.l++;
    return BErr[blob.read_shift(1)];
  }
  function parse_PtgInt(blob) {
    blob.l++;
    return blob.read_shift(2);
  }
  function parse_PtgBool(blob) {
    blob.l++;
    return blob.read_shift(1) !== 0;
  }
  function parse_PtgNum(blob) {
    blob.l++;
    return parse_Xnum(blob, 8);
  }
  function parse_PtgStr(blob, length, opts) {
    blob.l++;
    return parse_ShortXLUnicodeString(blob, length - 1, opts);
  }
  function parse_SerAr(blob, biff) {
    var val = [blob.read_shift(1)];
    if (biff == 12) switch (val[0]) {
      case 2:
        val[0] = 4;
        break;
      /* SerBool */
      case 4:
        val[0] = 16;
        break;
      /* SerErr */
      case 0:
        val[0] = 1;
        break;
      /* SerNum */
      case 1:
        val[0] = 2;
        break;
    }
    switch (val[0]) {
      case 4:
        val[1] = parsebool(blob, 1) ? "TRUE" : "FALSE";
        if (biff != 12) blob.l += 7;
        break;
      case 37:
      /* appears to be an alias */
      case 16:
        val[1] = BErr[blob[blob.l]];
        blob.l += biff == 12 ? 4 : 8;
        break;
      case 0:
        blob.l += 8;
        break;
      case 1:
        val[1] = parse_Xnum(blob, 8);
        break;
      case 2:
        val[1] = parse_XLUnicodeString2(blob, 0, { biff: biff > 0 && biff < 8 ? 2 : biff });
        break;
      default:
        throw new Error("Bad SerAr: " + val[0]);
    }
    return val;
  }
  function parse_PtgExtraMem(blob, cce, opts) {
    var count = blob.read_shift(opts.biff == 12 ? 4 : 2);
    var out = [];
    for (var i = 0; i != count; ++i) out.push((opts.biff == 12 ? parse_UncheckedRfX : parse_Ref8U)(blob, 8));
    return out;
  }
  function parse_PtgExtraArray(blob, length, opts) {
    var rows = 0, cols = 0;
    if (opts.biff == 12) {
      rows = blob.read_shift(4);
      cols = blob.read_shift(4);
    } else {
      cols = 1 + blob.read_shift(1);
      rows = 1 + blob.read_shift(2);
    }
    if (opts.biff >= 2 && opts.biff < 8) {
      --rows;
      if (--cols == 0) cols = 256;
    }
    for (var i = 0, o = []; i != rows && (o[i] = []); ++i)
      for (var j = 0; j != cols; ++j) o[i][j] = parse_SerAr(blob, opts.biff);
    return o;
  }
  function parse_PtgName(blob, length, opts) {
    var type = blob.read_shift(1) >>> 5 & 3;
    var w = !opts || opts.biff >= 8 ? 4 : 2;
    var nameindex = blob.read_shift(w);
    switch (opts.biff) {
      case 2:
        blob.l += 5;
        break;
      case 3:
      case 4:
        blob.l += 8;
        break;
      case 5:
        blob.l += 12;
        break;
    }
    return [type, 0, nameindex];
  }
  function parse_PtgNameX(blob, length, opts) {
    if (opts.biff == 5) return parse_PtgNameX_BIFF5(blob, length, opts);
    var type = blob.read_shift(1) >>> 5 & 3;
    var ixti = blob.read_shift(2);
    var nameindex = blob.read_shift(4);
    return [type, ixti, nameindex];
  }
  function parse_PtgNameX_BIFF5(blob) {
    var type = blob.read_shift(1) >>> 5 & 3;
    var ixti = blob.read_shift(2, "i");
    blob.l += 8;
    var nameindex = blob.read_shift(2);
    blob.l += 12;
    return [type, ixti, nameindex];
  }
  function parse_PtgMemArea(blob, length, opts) {
    var type = blob.read_shift(1) >>> 5 & 3;
    blob.l += opts && opts.biff == 2 ? 3 : 4;
    var cce = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    return [type, cce];
  }
  function parse_PtgMemFunc(blob, length, opts) {
    var type = blob.read_shift(1) >>> 5 & 3;
    var cce = blob.read_shift(opts && opts.biff == 2 ? 1 : 2);
    return [type, cce];
  }
  function parse_PtgRefErr(blob, length, opts) {
    var type = blob.read_shift(1) >>> 5 & 3;
    blob.l += 4;
    if (opts.biff < 8) blob.l--;
    if (opts.biff == 12) blob.l += 2;
    return [type];
  }
  function parse_PtgRefErr3d(blob, length, opts) {
    var type = (blob[blob.l++] & 96) >> 5;
    var ixti = blob.read_shift(2);
    var w = 4;
    if (opts) switch (opts.biff) {
      case 5:
        w = 15;
        break;
      case 12:
        w = 6;
        break;
    }
    blob.l += w;
    return [type, ixti];
  }
  var parse_PtgMemErr = parsenoop;
  var parse_PtgMemNoMem = parsenoop;
  var parse_PtgTbl = parsenoop;
  function parse_PtgElfLoc(blob, length, opts) {
    blob.l += 2;
    return [parse_RgceElfLoc(blob, 4, opts)];
  }
  function parse_PtgElfNoop(blob) {
    blob.l += 6;
    return [];
  }
  var parse_PtgElfCol = parse_PtgElfLoc;
  var parse_PtgElfColS = parse_PtgElfNoop;
  var parse_PtgElfColSV = parse_PtgElfNoop;
  var parse_PtgElfColV = parse_PtgElfLoc;
  function parse_PtgElfLel(blob) {
    blob.l += 2;
    return [parseuint16(blob), blob.read_shift(2) & 1];
  }
  var parse_PtgElfRadical = parse_PtgElfLoc;
  var parse_PtgElfRadicalLel = parse_PtgElfLel;
  var parse_PtgElfRadicalS = parse_PtgElfNoop;
  var parse_PtgElfRw = parse_PtgElfLoc;
  var parse_PtgElfRwV = parse_PtgElfLoc;
  var PtgListRT = [
    "Data",
    "All",
    "Headers",
    "??",
    "?Data2",
    "??",
    "?DataHeaders",
    "??",
    "Totals",
    "??",
    "??",
    "??",
    "?DataTotals",
    "??",
    "??",
    "??",
    "?Current"
  ];
  function parse_PtgList(blob) {
    blob.l += 2;
    var ixti = blob.read_shift(2);
    var flags = blob.read_shift(2);
    var idx = blob.read_shift(4);
    var c = blob.read_shift(2);
    var C = blob.read_shift(2);
    var rt = PtgListRT[flags >> 2 & 31];
    return { ixti, coltype: flags & 3, rt, idx, c, C };
  }
  function parse_PtgSxName(blob) {
    blob.l += 2;
    return [blob.read_shift(4)];
  }
  function parse_PtgSheet(blob, length, opts) {
    blob.l += 5;
    blob.l += 2;
    blob.l += opts.biff == 2 ? 1 : 4;
    return ["PTGSHEET"];
  }
  function parse_PtgEndSheet(blob, length, opts) {
    blob.l += opts.biff == 2 ? 4 : 5;
    return ["PTGENDSHEET"];
  }
  function parse_PtgMemAreaN(blob) {
    var type = blob.read_shift(1) >>> 5 & 3;
    var cce = blob.read_shift(2);
    return [type, cce];
  }
  function parse_PtgMemNoMemN(blob) {
    var type = blob.read_shift(1) >>> 5 & 3;
    var cce = blob.read_shift(2);
    return [type, cce];
  }
  function parse_PtgAttrNoop(blob) {
    blob.l += 4;
    return [0, 0];
  }
  var PtgTypes = {
    /*::[*/
    1: { n: "PtgExp", f: parse_PtgExp },
    /*::[*/
    2: { n: "PtgTbl", f: parse_PtgTbl },
    /*::[*/
    3: { n: "PtgAdd", f: parseread1 },
    /*::[*/
    4: { n: "PtgSub", f: parseread1 },
    /*::[*/
    5: { n: "PtgMul", f: parseread1 },
    /*::[*/
    6: { n: "PtgDiv", f: parseread1 },
    /*::[*/
    7: { n: "PtgPower", f: parseread1 },
    /*::[*/
    8: { n: "PtgConcat", f: parseread1 },
    /*::[*/
    9: { n: "PtgLt", f: parseread1 },
    /*::[*/
    10: { n: "PtgLe", f: parseread1 },
    /*::[*/
    11: { n: "PtgEq", f: parseread1 },
    /*::[*/
    12: { n: "PtgGe", f: parseread1 },
    /*::[*/
    13: { n: "PtgGt", f: parseread1 },
    /*::[*/
    14: { n: "PtgNe", f: parseread1 },
    /*::[*/
    15: { n: "PtgIsect", f: parseread1 },
    /*::[*/
    16: { n: "PtgUnion", f: parseread1 },
    /*::[*/
    17: { n: "PtgRange", f: parseread1 },
    /*::[*/
    18: { n: "PtgUplus", f: parseread1 },
    /*::[*/
    19: { n: "PtgUminus", f: parseread1 },
    /*::[*/
    20: { n: "PtgPercent", f: parseread1 },
    /*::[*/
    21: { n: "PtgParen", f: parseread1 },
    /*::[*/
    22: { n: "PtgMissArg", f: parseread1 },
    /*::[*/
    23: { n: "PtgStr", f: parse_PtgStr },
    /*::[*/
    26: { n: "PtgSheet", f: parse_PtgSheet },
    /*::[*/
    27: { n: "PtgEndSheet", f: parse_PtgEndSheet },
    /*::[*/
    28: { n: "PtgErr", f: parse_PtgErr },
    /*::[*/
    29: { n: "PtgBool", f: parse_PtgBool },
    /*::[*/
    30: { n: "PtgInt", f: parse_PtgInt },
    /*::[*/
    31: { n: "PtgNum", f: parse_PtgNum },
    /*::[*/
    32: { n: "PtgArray", f: parse_PtgArray },
    /*::[*/
    33: { n: "PtgFunc", f: parse_PtgFunc },
    /*::[*/
    34: { n: "PtgFuncVar", f: parse_PtgFuncVar },
    /*::[*/
    35: { n: "PtgName", f: parse_PtgName },
    /*::[*/
    36: { n: "PtgRef", f: parse_PtgRef },
    /*::[*/
    37: { n: "PtgArea", f: parse_PtgArea },
    /*::[*/
    38: { n: "PtgMemArea", f: parse_PtgMemArea },
    /*::[*/
    39: { n: "PtgMemErr", f: parse_PtgMemErr },
    /*::[*/
    40: { n: "PtgMemNoMem", f: parse_PtgMemNoMem },
    /*::[*/
    41: { n: "PtgMemFunc", f: parse_PtgMemFunc },
    /*::[*/
    42: { n: "PtgRefErr", f: parse_PtgRefErr },
    /*::[*/
    43: { n: "PtgAreaErr", f: parse_PtgAreaErr },
    /*::[*/
    44: { n: "PtgRefN", f: parse_PtgRefN },
    /*::[*/
    45: { n: "PtgAreaN", f: parse_PtgAreaN },
    /*::[*/
    46: { n: "PtgMemAreaN", f: parse_PtgMemAreaN },
    /*::[*/
    47: { n: "PtgMemNoMemN", f: parse_PtgMemNoMemN },
    /*::[*/
    57: { n: "PtgNameX", f: parse_PtgNameX },
    /*::[*/
    58: { n: "PtgRef3d", f: parse_PtgRef3d },
    /*::[*/
    59: { n: "PtgArea3d", f: parse_PtgArea3d },
    /*::[*/
    60: { n: "PtgRefErr3d", f: parse_PtgRefErr3d },
    /*::[*/
    61: { n: "PtgAreaErr3d", f: parse_PtgAreaErr3d },
    /*::[*/
    255: {}
  };
  var PtgDupes = {
    /*::[*/
    64: 32,
    /*::[*/
    96: 32,
    /*::[*/
    65: 33,
    /*::[*/
    97: 33,
    /*::[*/
    66: 34,
    /*::[*/
    98: 34,
    /*::[*/
    67: 35,
    /*::[*/
    99: 35,
    /*::[*/
    68: 36,
    /*::[*/
    100: 36,
    /*::[*/
    69: 37,
    /*::[*/
    101: 37,
    /*::[*/
    70: 38,
    /*::[*/
    102: 38,
    /*::[*/
    71: 39,
    /*::[*/
    103: 39,
    /*::[*/
    72: 40,
    /*::[*/
    104: 40,
    /*::[*/
    73: 41,
    /*::[*/
    105: 41,
    /*::[*/
    74: 42,
    /*::[*/
    106: 42,
    /*::[*/
    75: 43,
    /*::[*/
    107: 43,
    /*::[*/
    76: 44,
    /*::[*/
    108: 44,
    /*::[*/
    77: 45,
    /*::[*/
    109: 45,
    /*::[*/
    78: 46,
    /*::[*/
    110: 46,
    /*::[*/
    79: 47,
    /*::[*/
    111: 47,
    /*::[*/
    88: 34,
    /*::[*/
    120: 34,
    /*::[*/
    89: 57,
    /*::[*/
    121: 57,
    /*::[*/
    90: 58,
    /*::[*/
    122: 58,
    /*::[*/
    91: 59,
    /*::[*/
    123: 59,
    /*::[*/
    92: 60,
    /*::[*/
    124: 60,
    /*::[*/
    93: 61,
    /*::[*/
    125: 61
  };
  var Ptg18 = {
    /*::[*/
    1: { n: "PtgElfLel", f: parse_PtgElfLel },
    /*::[*/
    2: { n: "PtgElfRw", f: parse_PtgElfRw },
    /*::[*/
    3: { n: "PtgElfCol", f: parse_PtgElfCol },
    /*::[*/
    6: { n: "PtgElfRwV", f: parse_PtgElfRwV },
    /*::[*/
    7: { n: "PtgElfColV", f: parse_PtgElfColV },
    /*::[*/
    10: { n: "PtgElfRadical", f: parse_PtgElfRadical },
    /*::[*/
    11: { n: "PtgElfRadicalS", f: parse_PtgElfRadicalS },
    /*::[*/
    13: { n: "PtgElfColS", f: parse_PtgElfColS },
    /*::[*/
    15: { n: "PtgElfColSV", f: parse_PtgElfColSV },
    /*::[*/
    16: { n: "PtgElfRadicalLel", f: parse_PtgElfRadicalLel },
    /*::[*/
    25: { n: "PtgList", f: parse_PtgList },
    /*::[*/
    29: { n: "PtgSxName", f: parse_PtgSxName },
    /*::[*/
    255: {}
  };
  var Ptg19 = {
    /*::[*/
    0: { n: "PtgAttrNoop", f: parse_PtgAttrNoop },
    /*::[*/
    1: { n: "PtgAttrSemi", f: parse_PtgAttrSemi },
    /*::[*/
    2: { n: "PtgAttrIf", f: parse_PtgAttrIf },
    /*::[*/
    4: { n: "PtgAttrChoose", f: parse_PtgAttrChoose },
    /*::[*/
    8: { n: "PtgAttrGoto", f: parse_PtgAttrGoto },
    /*::[*/
    16: { n: "PtgAttrSum", f: parse_PtgAttrSum },
    /*::[*/
    32: { n: "PtgAttrBaxcel", f: parse_PtgAttrBaxcel },
    /*::[*/
    33: { n: "PtgAttrBaxcel", f: parse_PtgAttrBaxcel },
    /*::[*/
    64: { n: "PtgAttrSpace", f: parse_PtgAttrSpace },
    /*::[*/
    65: { n: "PtgAttrSpaceSemi", f: parse_PtgAttrSpaceSemi },
    /*::[*/
    128: { n: "PtgAttrIfError", f: parse_PtgAttrIfError },
    /*::[*/
    255: {}
  };
  function parse_RgbExtra(blob, length, rgce, opts) {
    if (opts.biff < 8) return parsenoop(blob, length);
    var target = blob.l + length;
    var o = [];
    for (var i = 0; i !== rgce.length; ++i) {
      switch (rgce[i][0]) {
        case "PtgArray":
          rgce[i][1] = parse_PtgExtraArray(blob, 0, opts);
          o.push(rgce[i][1]);
          break;
        case "PtgMemArea":
          rgce[i][2] = parse_PtgExtraMem(blob, rgce[i][1], opts);
          o.push(rgce[i][2]);
          break;
        case "PtgExp":
          if (opts && opts.biff == 12) {
            rgce[i][1][1] = blob.read_shift(4);
            o.push(rgce[i][1]);
          }
          break;
        case "PtgList":
        /* TODO: PtgList -> PtgExtraList */
        case "PtgElfRadicalS":
        /* TODO: PtgElfRadicalS -> PtgExtraElf */
        case "PtgElfColS":
        /* TODO: PtgElfColS -> PtgExtraElf */
        case "PtgElfColSV":
          throw "Unsupported " + rgce[i][0];
        default:
          break;
      }
    }
    length = target - blob.l;
    if (length !== 0) o.push(parsenoop(blob, length));
    return o;
  }
  function parse_Rgce(blob, length, opts) {
    var target = blob.l + length;
    var R, id, ptgs = [];
    while (target != blob.l) {
      length = target - blob.l;
      id = blob[blob.l];
      R = PtgTypes[id] || PtgTypes[PtgDupes[id]];
      if (id === 24 || id === 25) R = (id === 24 ? Ptg18 : Ptg19)[blob[blob.l + 1]];
      if (!R || !R.f) {
        parsenoop(blob, length);
      } else {
        ptgs.push([R.n, R.f(blob, length, opts)]);
      }
    }
    return ptgs;
  }
  function stringify_array(f) {
    var o = [];
    for (var i = 0; i < f.length; ++i) {
      var x = f[i], r = [];
      for (var j = 0; j < x.length; ++j) {
        var y = x[j];
        if (y) switch (y[0]) {
          // TODO: handle embedded quotes
          case 2:
            r.push('"' + y[1].replace(/"/g, '""') + '"');
            break;
          default:
            r.push(y[1]);
        }
        else r.push("");
      }
      o.push(r.join(","));
    }
    return o.join(";");
  }
  var PtgBinOp = {
    PtgAdd: "+",
    PtgConcat: "&",
    PtgDiv: "/",
    PtgEq: "=",
    PtgGe: ">=",
    PtgGt: ">",
    PtgLe: "<=",
    PtgLt: "<",
    PtgMul: "*",
    PtgNe: "<>",
    PtgPower: "^",
    PtgSub: "-"
  };
  function formula_quote_sheet_name(sname, opts) {
    if (!sname && !(opts && opts.biff <= 5 && opts.biff >= 2)) throw new Error("empty sheet name");
    if (/[^\w\u4E00-\u9FFF\u3040-\u30FF]/.test(sname)) return "'" + sname + "'";
    return sname;
  }
  function get_ixti_raw(supbooks, ixti, opts) {
    if (!supbooks) return "SH33TJSERR0";
    if (opts.biff > 8 && (!supbooks.XTI || !supbooks.XTI[ixti])) return supbooks.SheetNames[ixti];
    if (!supbooks.XTI) return "SH33TJSERR6";
    var XTI = supbooks.XTI[ixti];
    if (opts.biff < 8) {
      if (ixti > 1e4) ixti -= 65536;
      if (ixti < 0) ixti = -ixti;
      return ixti == 0 ? "" : supbooks.XTI[ixti - 1];
    }
    if (!XTI) return "SH33TJSERR1";
    var o = "";
    if (opts.biff > 8) switch (supbooks[XTI[0]][0]) {
      case 357:
        o = XTI[1] == -1 ? "#REF" : supbooks.SheetNames[XTI[1]];
        return XTI[1] == XTI[2] ? o : o + ":" + supbooks.SheetNames[XTI[2]];
      case 358:
        if (opts.SID != null) return supbooks.SheetNames[opts.SID];
        return "SH33TJSSAME" + supbooks[XTI[0]][0];
      case 355:
      /* 'BrtSupBookSrc' */
      /* falls through */
      default:
        return "SH33TJSSRC" + supbooks[XTI[0]][0];
    }
    switch (supbooks[XTI[0]][0][0]) {
      case 1025:
        o = XTI[1] == -1 ? "#REF" : supbooks.SheetNames[XTI[1]] || "SH33TJSERR3";
        return XTI[1] == XTI[2] ? o : o + ":" + supbooks.SheetNames[XTI[2]];
      case 14849:
        return supbooks[XTI[0]].slice(1).map(function(name) {
          return name.Name;
        }).join(";;");
      //return "SH33TJSERR8";
      default:
        if (!supbooks[XTI[0]][0][3]) return "SH33TJSERR2";
        o = XTI[1] == -1 ? "#REF" : supbooks[XTI[0]][0][3][XTI[1]] || "SH33TJSERR4";
        return XTI[1] == XTI[2] ? o : o + ":" + supbooks[XTI[0]][0][3][XTI[2]];
    }
  }
  function get_ixti(supbooks, ixti, opts) {
    var ixtiraw = get_ixti_raw(supbooks, ixti, opts);
    return ixtiraw == "#REF" ? ixtiraw : formula_quote_sheet_name(ixtiraw, opts);
  }
  function stringify_formula(formula, range, cell, supbooks, opts) {
    var biff = opts && opts.biff || 8;
    var _range = (
      /*range != null ? range :*/
      { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } }
    );
    var stack = [], e1, e2, c, ixti = 0, nameidx = 0, r, sname = "";
    if (!formula[0] || !formula[0][0]) return "";
    var last_sp = -1, sp = "";
    for (var ff = 0, fflen = formula[0].length; ff < fflen; ++ff) {
      var f = formula[0][ff];
      switch (f[0]) {
        case "PtgUminus":
          stack.push("-" + stack.pop());
          break;
        case "PtgUplus":
          stack.push("+" + stack.pop());
          break;
        case "PtgPercent":
          stack.push(stack.pop() + "%");
          break;
        case "PtgAdd":
        /* [MS-XLS] 2.5.198.26 */
        case "PtgConcat":
        /* [MS-XLS] 2.5.198.43 */
        case "PtgDiv":
        /* [MS-XLS] 2.5.198.45 */
        case "PtgEq":
        /* [MS-XLS] 2.5.198.56 */
        case "PtgGe":
        /* [MS-XLS] 2.5.198.64 */
        case "PtgGt":
        /* [MS-XLS] 2.5.198.65 */
        case "PtgLe":
        /* [MS-XLS] 2.5.198.68 */
        case "PtgLt":
        /* [MS-XLS] 2.5.198.69 */
        case "PtgMul":
        /* [MS-XLS] 2.5.198.75 */
        case "PtgNe":
        /* [MS-XLS] 2.5.198.78 */
        case "PtgPower":
        /* [MS-XLS] 2.5.198.82 */
        case "PtgSub":
          e1 = stack.pop();
          e2 = stack.pop();
          if (last_sp >= 0) {
            switch (formula[0][last_sp][1][0]) {
              case 0:
                sp = fill(" ", formula[0][last_sp][1][1]);
                break;
              case 1:
                sp = fill("\r", formula[0][last_sp][1][1]);
                break;
              default:
                sp = "";
                if (opts.WTF) throw new Error("Unexpected PtgAttrSpaceType " + formula[0][last_sp][1][0]);
            }
            e2 = e2 + sp;
            last_sp = -1;
          }
          stack.push(e2 + PtgBinOp[f[0]] + e1);
          break;
        case "PtgIsect":
          e1 = stack.pop();
          e2 = stack.pop();
          stack.push(e2 + " " + e1);
          break;
        case "PtgUnion":
          e1 = stack.pop();
          e2 = stack.pop();
          stack.push(e2 + "," + e1);
          break;
        case "PtgRange":
          e1 = stack.pop();
          e2 = stack.pop();
          stack.push(e2 + ":" + e1);
          break;
        case "PtgAttrChoose":
          break;
        case "PtgAttrGoto":
          break;
        case "PtgAttrIf":
          break;
        case "PtgAttrIfError":
          break;
        case "PtgRef":
          c = shift_cell_xls(f[1][1], _range, opts);
          stack.push(encode_cell_xls(c, biff));
          break;
        case "PtgRefN":
          c = cell ? shift_cell_xls(f[1][1], cell, opts) : f[1][1];
          stack.push(encode_cell_xls(c, biff));
          break;
        case "PtgRef3d":
          ixti = /*::Number(*/
          f[1][1];
          c = shift_cell_xls(f[1][2], _range, opts);
          sname = get_ixti(supbooks, ixti, opts);
          var w = sname;
          stack.push(sname + "!" + encode_cell_xls(c, biff));
          break;
        case "PtgFunc":
        /* [MS-XLS] 2.5.198.62 */
        case "PtgFuncVar":
          var argc = f[1][0], func = f[1][1];
          if (!argc) argc = 0;
          argc &= 127;
          var args = argc == 0 ? [] : stack.slice(-argc);
          stack.length -= argc;
          if (func === "User") func = args.shift();
          stack.push(func + "(" + args.join(",") + ")");
          break;
        case "PtgBool":
          stack.push(f[1] ? "TRUE" : "FALSE");
          break;
        case "PtgInt":
          stack.push(
            /*::String(*/
            f[1]
            /*::)*/
          );
          break;
        case "PtgNum":
          stack.push(String(f[1]));
          break;
        case "PtgStr":
          stack.push('"' + f[1].replace(/"/g, '""') + '"');
          break;
        case "PtgErr":
          stack.push(
            /*::String(*/
            f[1]
            /*::)*/
          );
          break;
        case "PtgAreaN":
          r = shift_range_xls(f[1][1], cell ? { s: cell } : _range, opts);
          stack.push(encode_range_xls(r, opts));
          break;
        case "PtgArea":
          r = shift_range_xls(f[1][1], _range, opts);
          stack.push(encode_range_xls(r, opts));
          break;
        case "PtgArea3d":
          ixti = /*::Number(*/
          f[1][1];
          r = f[1][2];
          sname = get_ixti(supbooks, ixti, opts);
          stack.push(sname + "!" + encode_range_xls(r, opts));
          break;
        case "PtgAttrSum":
          stack.push("SUM(" + stack.pop() + ")");
          break;
        case "PtgAttrBaxcel":
        /* [MS-XLS] 2.5.198.33 */
        case "PtgAttrSemi":
          break;
        case "PtgName":
          nameidx = f[1][2];
          var lbl = (supbooks.names || [])[nameidx - 1] || (supbooks[0] || [])[nameidx];
          var name = lbl ? lbl.Name : "SH33TJSNAME" + String(nameidx);
          if (name && name.slice(0, 6) == "_xlfn." && !opts.xlfn) name = name.slice(6);
          stack.push(name);
          break;
        case "PtgNameX":
          var bookidx = f[1][1];
          nameidx = f[1][2];
          var externbook;
          if (opts.biff <= 5) {
            if (bookidx < 0) bookidx = -bookidx;
            if (supbooks[bookidx]) externbook = supbooks[bookidx][nameidx];
          } else {
            var o = "";
            if (((supbooks[bookidx] || [])[0] || [])[0] == 14849) {
            } else if (((supbooks[bookidx] || [])[0] || [])[0] == 1025) {
              if (supbooks[bookidx][nameidx] && supbooks[bookidx][nameidx].itab > 0) {
                o = supbooks.SheetNames[supbooks[bookidx][nameidx].itab - 1] + "!";
              }
            } else o = supbooks.SheetNames[nameidx - 1] + "!";
            if (supbooks[bookidx] && supbooks[bookidx][nameidx]) o += supbooks[bookidx][nameidx].Name;
            else if (supbooks[0] && supbooks[0][nameidx]) o += supbooks[0][nameidx].Name;
            else {
              var ixtidata = (get_ixti_raw(supbooks, bookidx, opts) || "").split(";;");
              if (ixtidata[nameidx - 1]) o = ixtidata[nameidx - 1];
              else o += "SH33TJSERRX";
            }
            stack.push(o);
            break;
          }
          if (!externbook) externbook = { Name: "SH33TJSERRY" };
          stack.push(externbook.Name);
          break;
        case "PtgParen":
          var lp = "(", rp = ")";
          if (last_sp >= 0) {
            sp = "";
            switch (formula[0][last_sp][1][0]) {
              // $FlowIgnore
              case 2:
                lp = fill(" ", formula[0][last_sp][1][1]) + lp;
                break;
              // $FlowIgnore
              case 3:
                lp = fill("\r", formula[0][last_sp][1][1]) + lp;
                break;
              // $FlowIgnore
              case 4:
                rp = fill(" ", formula[0][last_sp][1][1]) + rp;
                break;
              // $FlowIgnore
              case 5:
                rp = fill("\r", formula[0][last_sp][1][1]) + rp;
                break;
              default:
                if (opts.WTF) throw new Error("Unexpected PtgAttrSpaceType " + formula[0][last_sp][1][0]);
            }
            last_sp = -1;
          }
          stack.push(lp + stack.pop() + rp);
          break;
        case "PtgRefErr":
          stack.push("#REF!");
          break;
        case "PtgRefErr3d":
          stack.push("#REF!");
          break;
        case "PtgExp":
          c = { c: f[1][1], r: f[1][0] };
          var q = { c: cell.c, r: cell.r };
          if (supbooks.sharedf[encode_cell(c)]) {
            var parsedf = supbooks.sharedf[encode_cell(c)];
            stack.push(stringify_formula(parsedf, _range, q, supbooks, opts));
          } else {
            var fnd = false;
            for (e1 = 0; e1 != supbooks.arrayf.length; ++e1) {
              e2 = supbooks.arrayf[e1];
              if (c.c < e2[0].s.c || c.c > e2[0].e.c) continue;
              if (c.r < e2[0].s.r || c.r > e2[0].e.r) continue;
              stack.push(stringify_formula(e2[1], _range, q, supbooks, opts));
              fnd = true;
              break;
            }
            if (!fnd) stack.push(
              /*::String(*/
              f[1]
              /*::)*/
            );
          }
          break;
        case "PtgArray":
          stack.push("{" + stringify_array(
            /*::(*/
            f[1]
            /*:: :any)*/
          ) + "}");
          break;
        case "PtgMemArea":
          break;
        case "PtgAttrSpace":
        /* [MS-XLS] 2.5.198.38 */
        case "PtgAttrSpaceSemi":
          last_sp = ff;
          break;
        case "PtgTbl":
          break;
        case "PtgMemErr":
          break;
        case "PtgMissArg":
          stack.push("");
          break;
        case "PtgAreaErr":
          stack.push("#REF!");
          break;
        case "PtgAreaErr3d":
          stack.push("#REF!");
          break;
        case "PtgList":
          stack.push("Table" + f[1].idx + "[#" + f[1].rt + "]");
          break;
        case "PtgMemAreaN":
        case "PtgMemNoMemN":
        case "PtgAttrNoop":
        case "PtgSheet":
        case "PtgEndSheet":
          break;
        case "PtgMemFunc":
          break;
        case "PtgMemNoMem":
          break;
        case "PtgElfCol":
        /* [MS-XLS] 2.5.198.46 */
        case "PtgElfColS":
        /* [MS-XLS] 2.5.198.47 */
        case "PtgElfColSV":
        /* [MS-XLS] 2.5.198.48 */
        case "PtgElfColV":
        /* [MS-XLS] 2.5.198.49 */
        case "PtgElfLel":
        /* [MS-XLS] 2.5.198.50 */
        case "PtgElfRadical":
        /* [MS-XLS] 2.5.198.51 */
        case "PtgElfRadicalLel":
        /* [MS-XLS] 2.5.198.52 */
        case "PtgElfRadicalS":
        /* [MS-XLS] 2.5.198.53 */
        case "PtgElfRw":
        /* [MS-XLS] 2.5.198.54 */
        case "PtgElfRwV":
          throw new Error("Unsupported ELFs");
        case "PtgSxName":
          throw new Error("Unrecognized Formula Token: " + String(f));
        default:
          throw new Error("Unrecognized Formula Token: " + String(f));
      }
      var PtgNonDisp = ["PtgAttrSpace", "PtgAttrSpaceSemi", "PtgAttrGoto"];
      if (opts.biff != 3) {
        if (last_sp >= 0 && PtgNonDisp.indexOf(formula[0][ff][0]) == -1) {
          f = formula[0][last_sp];
          var _left = true;
          switch (f[1][0]) {
            /* note: some bad XLSB files omit the PtgParen */
            case 4:
              _left = false;
            /* falls through */
            case 0:
              sp = fill(" ", f[1][1]);
              break;
            case 5:
              _left = false;
            /* falls through */
            case 1:
              sp = fill("\r", f[1][1]);
              break;
            default:
              sp = "";
              if (opts.WTF) throw new Error("Unexpected PtgAttrSpaceType " + f[1][0]);
          }
          stack.push((_left ? sp : "") + stack.pop() + (_left ? "" : sp));
          last_sp = -1;
        }
      }
    }
    if (stack.length > 1 && opts.WTF) throw new Error("bad formula stack");
    return stack[0];
  }
  function parse_ArrayParsedFormula(blob, length, opts) {
    var target = blob.l + length, len = opts.biff == 2 ? 1 : 2;
    var rgcb, cce = blob.read_shift(len);
    if (cce == 65535) return [[], parsenoop(blob, length - 2)];
    var rgce = parse_Rgce(blob, cce, opts);
    if (length !== cce + len) rgcb = parse_RgbExtra(blob, length - cce - len, rgce, opts);
    blob.l = target;
    return [rgce, rgcb];
  }
  function parse_XLSCellParsedFormula(blob, length, opts) {
    var target = blob.l + length, len = opts.biff == 2 ? 1 : 2;
    var rgcb, cce = blob.read_shift(len);
    if (cce == 65535) return [[], parsenoop(blob, length - 2)];
    var rgce = parse_Rgce(blob, cce, opts);
    if (length !== cce + len) rgcb = parse_RgbExtra(blob, length - cce - len, rgce, opts);
    blob.l = target;
    return [rgce, rgcb];
  }
  function parse_NameParsedFormula(blob, length, opts, cce) {
    var target = blob.l + length;
    var rgce = parse_Rgce(blob, cce, opts);
    var rgcb;
    if (target !== blob.l) rgcb = parse_RgbExtra(blob, target - blob.l, rgce, opts);
    return [rgce, rgcb];
  }
  function parse_SharedParsedFormula(blob, length, opts) {
    var target = blob.l + length;
    var rgcb, cce = blob.read_shift(2);
    var rgce = parse_Rgce(blob, cce, opts);
    if (cce == 65535) return [[], parsenoop(blob, length - 2)];
    if (length !== cce + 2) rgcb = parse_RgbExtra(blob, target - cce - 2, rgce, opts);
    return [rgce, rgcb];
  }
  function parse_FormulaValue(blob) {
    var b;
    if (__readUInt16LE(blob, blob.l + 6) !== 65535) return [parse_Xnum(blob), "n"];
    switch (blob[blob.l]) {
      case 0:
        blob.l += 8;
        return ["String", "s"];
      case 1:
        b = blob[blob.l + 2] === 1;
        blob.l += 8;
        return [b, "b"];
      case 2:
        b = blob[blob.l + 2];
        blob.l += 8;
        return [b, "e"];
      case 3:
        blob.l += 8;
        return ["", "s"];
    }
    return [];
  }
  function parse_Formula(blob, length, opts) {
    var end = blob.l + length;
    var cell = parse_XLSCell(blob, 6);
    if (opts.biff == 2) ++blob.l;
    var val = parse_FormulaValue(blob, 8);
    var flags = blob.read_shift(1);
    if (opts.biff != 2) {
      blob.read_shift(1);
      if (opts.biff >= 5) {
        blob.read_shift(4);
      }
    }
    var cbf = parse_XLSCellParsedFormula(blob, end - blob.l, opts);
    return { cell, val: val[0], formula: cbf, shared: flags >> 3 & 1, tt: val[1] };
  }
  function parse_XLSBParsedFormula(data, length, opts) {
    var cce = data.read_shift(4);
    var rgce = parse_Rgce(data, cce, opts);
    var cb = data.read_shift(4);
    var rgcb = cb > 0 ? parse_RgbExtra(data, cb, rgce, opts) : null;
    return [rgce, rgcb];
  }
  var parse_XLSBArrayParsedFormula = parse_XLSBParsedFormula;
  var parse_XLSBCellParsedFormula = parse_XLSBParsedFormula;
  var parse_XLSBNameParsedFormula = parse_XLSBParsedFormula;
  var parse_XLSBSharedParsedFormula = parse_XLSBParsedFormula;
  var Cetab = {
    0: "BEEP",
    1: "OPEN",
    2: "OPEN.LINKS",
    3: "CLOSE.ALL",
    4: "SAVE",
    5: "SAVE.AS",
    6: "FILE.DELETE",
    7: "PAGE.SETUP",
    8: "PRINT",
    9: "PRINTER.SETUP",
    10: "QUIT",
    11: "NEW.WINDOW",
    12: "ARRANGE.ALL",
    13: "WINDOW.SIZE",
    14: "WINDOW.MOVE",
    15: "FULL",
    16: "CLOSE",
    17: "RUN",
    22: "SET.PRINT.AREA",
    23: "SET.PRINT.TITLES",
    24: "SET.PAGE.BREAK",
    25: "REMOVE.PAGE.BREAK",
    26: "FONT",
    27: "DISPLAY",
    28: "PROTECT.DOCUMENT",
    29: "PRECISION",
    30: "A1.R1C1",
    31: "CALCULATE.NOW",
    32: "CALCULATION",
    34: "DATA.FIND",
    35: "EXTRACT",
    36: "DATA.DELETE",
    37: "SET.DATABASE",
    38: "SET.CRITERIA",
    39: "SORT",
    40: "DATA.SERIES",
    41: "TABLE",
    42: "FORMAT.NUMBER",
    43: "ALIGNMENT",
    44: "STYLE",
    45: "BORDER",
    46: "CELL.PROTECTION",
    47: "COLUMN.WIDTH",
    48: "UNDO",
    49: "CUT",
    50: "COPY",
    51: "PASTE",
    52: "CLEAR",
    53: "PASTE.SPECIAL",
    54: "EDIT.DELETE",
    55: "INSERT",
    56: "FILL.RIGHT",
    57: "FILL.DOWN",
    61: "DEFINE.NAME",
    62: "CREATE.NAMES",
    63: "FORMULA.GOTO",
    64: "FORMULA.FIND",
    65: "SELECT.LAST.CELL",
    66: "SHOW.ACTIVE.CELL",
    67: "GALLERY.AREA",
    68: "GALLERY.BAR",
    69: "GALLERY.COLUMN",
    70: "GALLERY.LINE",
    71: "GALLERY.PIE",
    72: "GALLERY.SCATTER",
    73: "COMBINATION",
    74: "PREFERRED",
    75: "ADD.OVERLAY",
    76: "GRIDLINES",
    77: "SET.PREFERRED",
    78: "AXES",
    79: "LEGEND",
    80: "ATTACH.TEXT",
    81: "ADD.ARROW",
    82: "SELECT.CHART",
    83: "SELECT.PLOT.AREA",
    84: "PATTERNS",
    85: "MAIN.CHART",
    86: "OVERLAY",
    87: "SCALE",
    88: "FORMAT.LEGEND",
    89: "FORMAT.TEXT",
    90: "EDIT.REPEAT",
    91: "PARSE",
    92: "JUSTIFY",
    93: "HIDE",
    94: "UNHIDE",
    95: "WORKSPACE",
    96: "FORMULA",
    97: "FORMULA.FILL",
    98: "FORMULA.ARRAY",
    99: "DATA.FIND.NEXT",
    100: "DATA.FIND.PREV",
    101: "FORMULA.FIND.NEXT",
    102: "FORMULA.FIND.PREV",
    103: "ACTIVATE",
    104: "ACTIVATE.NEXT",
    105: "ACTIVATE.PREV",
    106: "UNLOCKED.NEXT",
    107: "UNLOCKED.PREV",
    108: "COPY.PICTURE",
    109: "SELECT",
    110: "DELETE.NAME",
    111: "DELETE.FORMAT",
    112: "VLINE",
    113: "HLINE",
    114: "VPAGE",
    115: "HPAGE",
    116: "VSCROLL",
    117: "HSCROLL",
    118: "ALERT",
    119: "NEW",
    120: "CANCEL.COPY",
    121: "SHOW.CLIPBOARD",
    122: "MESSAGE",
    124: "PASTE.LINK",
    125: "APP.ACTIVATE",
    126: "DELETE.ARROW",
    127: "ROW.HEIGHT",
    128: "FORMAT.MOVE",
    129: "FORMAT.SIZE",
    130: "FORMULA.REPLACE",
    131: "SEND.KEYS",
    132: "SELECT.SPECIAL",
    133: "APPLY.NAMES",
    134: "REPLACE.FONT",
    135: "FREEZE.PANES",
    136: "SHOW.INFO",
    137: "SPLIT",
    138: "ON.WINDOW",
    139: "ON.DATA",
    140: "DISABLE.INPUT",
    142: "OUTLINE",
    143: "LIST.NAMES",
    144: "FILE.CLOSE",
    145: "SAVE.WORKBOOK",
    146: "DATA.FORM",
    147: "COPY.CHART",
    148: "ON.TIME",
    149: "WAIT",
    150: "FORMAT.FONT",
    151: "FILL.UP",
    152: "FILL.LEFT",
    153: "DELETE.OVERLAY",
    155: "SHORT.MENUS",
    159: "SET.UPDATE.STATUS",
    161: "COLOR.PALETTE",
    162: "DELETE.STYLE",
    163: "WINDOW.RESTORE",
    164: "WINDOW.MAXIMIZE",
    166: "CHANGE.LINK",
    167: "CALCULATE.DOCUMENT",
    168: "ON.KEY",
    169: "APP.RESTORE",
    170: "APP.MOVE",
    171: "APP.SIZE",
    172: "APP.MINIMIZE",
    173: "APP.MAXIMIZE",
    174: "BRING.TO.FRONT",
    175: "SEND.TO.BACK",
    185: "MAIN.CHART.TYPE",
    186: "OVERLAY.CHART.TYPE",
    187: "SELECT.END",
    188: "OPEN.MAIL",
    189: "SEND.MAIL",
    190: "STANDARD.FONT",
    191: "CONSOLIDATE",
    192: "SORT.SPECIAL",
    193: "GALLERY.3D.AREA",
    194: "GALLERY.3D.COLUMN",
    195: "GALLERY.3D.LINE",
    196: "GALLERY.3D.PIE",
    197: "VIEW.3D",
    198: "GOAL.SEEK",
    199: "WORKGROUP",
    200: "FILL.GROUP",
    201: "UPDATE.LINK",
    202: "PROMOTE",
    203: "DEMOTE",
    204: "SHOW.DETAIL",
    206: "UNGROUP",
    207: "OBJECT.PROPERTIES",
    208: "SAVE.NEW.OBJECT",
    209: "SHARE",
    210: "SHARE.NAME",
    211: "DUPLICATE",
    212: "APPLY.STYLE",
    213: "ASSIGN.TO.OBJECT",
    214: "OBJECT.PROTECTION",
    215: "HIDE.OBJECT",
    216: "SET.EXTRACT",
    217: "CREATE.PUBLISHER",
    218: "SUBSCRIBE.TO",
    219: "ATTRIBUTES",
    220: "SHOW.TOOLBAR",
    222: "PRINT.PREVIEW",
    223: "EDIT.COLOR",
    224: "SHOW.LEVELS",
    225: "FORMAT.MAIN",
    226: "FORMAT.OVERLAY",
    227: "ON.RECALC",
    228: "EDIT.SERIES",
    229: "DEFINE.STYLE",
    240: "LINE.PRINT",
    243: "ENTER.DATA",
    249: "GALLERY.RADAR",
    250: "MERGE.STYLES",
    251: "EDITION.OPTIONS",
    252: "PASTE.PICTURE",
    253: "PASTE.PICTURE.LINK",
    254: "SPELLING",
    256: "ZOOM",
    259: "INSERT.OBJECT",
    260: "WINDOW.MINIMIZE",
    265: "SOUND.NOTE",
    266: "SOUND.PLAY",
    267: "FORMAT.SHAPE",
    268: "EXTEND.POLYGON",
    269: "FORMAT.AUTO",
    272: "GALLERY.3D.BAR",
    273: "GALLERY.3D.SURFACE",
    274: "FILL.AUTO",
    276: "CUSTOMIZE.TOOLBAR",
    277: "ADD.TOOL",
    278: "EDIT.OBJECT",
    279: "ON.DOUBLECLICK",
    280: "ON.ENTRY",
    281: "WORKBOOK.ADD",
    282: "WORKBOOK.MOVE",
    283: "WORKBOOK.COPY",
    284: "WORKBOOK.OPTIONS",
    285: "SAVE.WORKSPACE",
    288: "CHART.WIZARD",
    289: "DELETE.TOOL",
    290: "MOVE.TOOL",
    291: "WORKBOOK.SELECT",
    292: "WORKBOOK.ACTIVATE",
    293: "ASSIGN.TO.TOOL",
    295: "COPY.TOOL",
    296: "RESET.TOOL",
    297: "CONSTRAIN.NUMERIC",
    298: "PASTE.TOOL",
    302: "WORKBOOK.NEW",
    305: "SCENARIO.CELLS",
    306: "SCENARIO.DELETE",
    307: "SCENARIO.ADD",
    308: "SCENARIO.EDIT",
    309: "SCENARIO.SHOW",
    310: "SCENARIO.SHOW.NEXT",
    311: "SCENARIO.SUMMARY",
    312: "PIVOT.TABLE.WIZARD",
    313: "PIVOT.FIELD.PROPERTIES",
    314: "PIVOT.FIELD",
    315: "PIVOT.ITEM",
    316: "PIVOT.ADD.FIELDS",
    318: "OPTIONS.CALCULATION",
    319: "OPTIONS.EDIT",
    320: "OPTIONS.VIEW",
    321: "ADDIN.MANAGER",
    322: "MENU.EDITOR",
    323: "ATTACH.TOOLBARS",
    324: "VBAActivate",
    325: "OPTIONS.CHART",
    328: "VBA.INSERT.FILE",
    330: "VBA.PROCEDURE.DEFINITION",
    336: "ROUTING.SLIP",
    338: "ROUTE.DOCUMENT",
    339: "MAIL.LOGON",
    342: "INSERT.PICTURE",
    343: "EDIT.TOOL",
    344: "GALLERY.DOUGHNUT",
    350: "CHART.TREND",
    352: "PIVOT.ITEM.PROPERTIES",
    354: "WORKBOOK.INSERT",
    355: "OPTIONS.TRANSITION",
    356: "OPTIONS.GENERAL",
    370: "FILTER.ADVANCED",
    373: "MAIL.ADD.MAILER",
    374: "MAIL.DELETE.MAILER",
    375: "MAIL.REPLY",
    376: "MAIL.REPLY.ALL",
    377: "MAIL.FORWARD",
    378: "MAIL.NEXT.LETTER",
    379: "DATA.LABEL",
    380: "INSERT.TITLE",
    381: "FONT.PROPERTIES",
    382: "MACRO.OPTIONS",
    383: "WORKBOOK.HIDE",
    384: "WORKBOOK.UNHIDE",
    385: "WORKBOOK.DELETE",
    386: "WORKBOOK.NAME",
    388: "GALLERY.CUSTOM",
    390: "ADD.CHART.AUTOFORMAT",
    391: "DELETE.CHART.AUTOFORMAT",
    392: "CHART.ADD.DATA",
    393: "AUTO.OUTLINE",
    394: "TAB.ORDER",
    395: "SHOW.DIALOG",
    396: "SELECT.ALL",
    397: "UNGROUP.SHEETS",
    398: "SUBTOTAL.CREATE",
    399: "SUBTOTAL.REMOVE",
    400: "RENAME.OBJECT",
    412: "WORKBOOK.SCROLL",
    413: "WORKBOOK.NEXT",
    414: "WORKBOOK.PREV",
    415: "WORKBOOK.TAB.SPLIT",
    416: "FULL.SCREEN",
    417: "WORKBOOK.PROTECT",
    420: "SCROLLBAR.PROPERTIES",
    421: "PIVOT.SHOW.PAGES",
    422: "TEXT.TO.COLUMNS",
    423: "FORMAT.CHARTTYPE",
    424: "LINK.FORMAT",
    425: "TRACER.DISPLAY",
    430: "TRACER.NAVIGATE",
    431: "TRACER.CLEAR",
    432: "TRACER.ERROR",
    433: "PIVOT.FIELD.GROUP",
    434: "PIVOT.FIELD.UNGROUP",
    435: "CHECKBOX.PROPERTIES",
    436: "LABEL.PROPERTIES",
    437: "LISTBOX.PROPERTIES",
    438: "EDITBOX.PROPERTIES",
    439: "PIVOT.REFRESH",
    440: "LINK.COMBO",
    441: "OPEN.TEXT",
    442: "HIDE.DIALOG",
    443: "SET.DIALOG.FOCUS",
    444: "ENABLE.OBJECT",
    445: "PUSHBUTTON.PROPERTIES",
    446: "SET.DIALOG.DEFAULT",
    447: "FILTER",
    448: "FILTER.SHOW.ALL",
    449: "CLEAR.OUTLINE",
    450: "FUNCTION.WIZARD",
    451: "ADD.LIST.ITEM",
    452: "SET.LIST.ITEM",
    453: "REMOVE.LIST.ITEM",
    454: "SELECT.LIST.ITEM",
    455: "SET.CONTROL.VALUE",
    456: "SAVE.COPY.AS",
    458: "OPTIONS.LISTS.ADD",
    459: "OPTIONS.LISTS.DELETE",
    460: "SERIES.AXES",
    461: "SERIES.X",
    462: "SERIES.Y",
    463: "ERRORBAR.X",
    464: "ERRORBAR.Y",
    465: "FORMAT.CHART",
    466: "SERIES.ORDER",
    467: "MAIL.LOGOFF",
    468: "CLEAR.ROUTING.SLIP",
    469: "APP.ACTIVATE.MICROSOFT",
    470: "MAIL.EDIT.MAILER",
    471: "ON.SHEET",
    472: "STANDARD.WIDTH",
    473: "SCENARIO.MERGE",
    474: "SUMMARY.INFO",
    475: "FIND.FILE",
    476: "ACTIVE.CELL.FONT",
    477: "ENABLE.TIPWIZARD",
    478: "VBA.MAKE.ADDIN",
    480: "INSERTDATATABLE",
    481: "WORKGROUP.OPTIONS",
    482: "MAIL.SEND.MAILER",
    485: "AUTOCORRECT",
    489: "POST.DOCUMENT",
    491: "PICKLIST",
    493: "VIEW.SHOW",
    494: "VIEW.DEFINE",
    495: "VIEW.DELETE",
    509: "SHEET.BACKGROUND",
    510: "INSERT.MAP.OBJECT",
    511: "OPTIONS.MENONO",
    517: "MSOCHECKS",
    518: "NORMAL",
    519: "LAYOUT",
    520: "RM.PRINT.AREA",
    521: "CLEAR.PRINT.AREA",
    522: "ADD.PRINT.AREA",
    523: "MOVE.BRK",
    545: "HIDECURR.NOTE",
    546: "HIDEALL.NOTES",
    547: "DELETE.NOTE",
    548: "TRAVERSE.NOTES",
    549: "ACTIVATE.NOTES",
    620: "PROTECT.REVISIONS",
    621: "UNPROTECT.REVISIONS",
    647: "OPTIONS.ME",
    653: "WEB.PUBLISH",
    667: "NEWWEBQUERY",
    673: "PIVOT.TABLE.CHART",
    753: "OPTIONS.SAVE",
    755: "OPTIONS.SPELL",
    808: "HIDEALL.INKANNOTS"
  };
  var Ftab = {
    0: "COUNT",
    1: "IF",
    2: "ISNA",
    3: "ISERROR",
    4: "SUM",
    5: "AVERAGE",
    6: "MIN",
    7: "MAX",
    8: "ROW",
    9: "COLUMN",
    10: "NA",
    11: "NPV",
    12: "STDEV",
    13: "DOLLAR",
    14: "FIXED",
    15: "SIN",
    16: "COS",
    17: "TAN",
    18: "ATAN",
    19: "PI",
    20: "SQRT",
    21: "EXP",
    22: "LN",
    23: "LOG10",
    24: "ABS",
    25: "INT",
    26: "SIGN",
    27: "ROUND",
    28: "LOOKUP",
    29: "INDEX",
    30: "REPT",
    31: "MID",
    32: "LEN",
    33: "VALUE",
    34: "TRUE",
    35: "FALSE",
    36: "AND",
    37: "OR",
    38: "NOT",
    39: "MOD",
    40: "DCOUNT",
    41: "DSUM",
    42: "DAVERAGE",
    43: "DMIN",
    44: "DMAX",
    45: "DSTDEV",
    46: "VAR",
    47: "DVAR",
    48: "TEXT",
    49: "LINEST",
    50: "TREND",
    51: "LOGEST",
    52: "GROWTH",
    53: "GOTO",
    54: "HALT",
    55: "RETURN",
    56: "PV",
    57: "FV",
    58: "NPER",
    59: "PMT",
    60: "RATE",
    61: "MIRR",
    62: "IRR",
    63: "RAND",
    64: "MATCH",
    65: "DATE",
    66: "TIME",
    67: "DAY",
    68: "MONTH",
    69: "YEAR",
    70: "WEEKDAY",
    71: "HOUR",
    72: "MINUTE",
    73: "SECOND",
    74: "NOW",
    75: "AREAS",
    76: "ROWS",
    77: "COLUMNS",
    78: "OFFSET",
    79: "ABSREF",
    80: "RELREF",
    81: "ARGUMENT",
    82: "SEARCH",
    83: "TRANSPOSE",
    84: "ERROR",
    85: "STEP",
    86: "TYPE",
    87: "ECHO",
    88: "SET.NAME",
    89: "CALLER",
    90: "DEREF",
    91: "WINDOWS",
    92: "SERIES",
    93: "DOCUMENTS",
    94: "ACTIVE.CELL",
    95: "SELECTION",
    96: "RESULT",
    97: "ATAN2",
    98: "ASIN",
    99: "ACOS",
    100: "CHOOSE",
    101: "HLOOKUP",
    102: "VLOOKUP",
    103: "LINKS",
    104: "INPUT",
    105: "ISREF",
    106: "GET.FORMULA",
    107: "GET.NAME",
    108: "SET.VALUE",
    109: "LOG",
    110: "EXEC",
    111: "CHAR",
    112: "LOWER",
    113: "UPPER",
    114: "PROPER",
    115: "LEFT",
    116: "RIGHT",
    117: "EXACT",
    118: "TRIM",
    119: "REPLACE",
    120: "SUBSTITUTE",
    121: "CODE",
    122: "NAMES",
    123: "DIRECTORY",
    124: "FIND",
    125: "CELL",
    126: "ISERR",
    127: "ISTEXT",
    128: "ISNUMBER",
    129: "ISBLANK",
    130: "T",
    131: "N",
    132: "FOPEN",
    133: "FCLOSE",
    134: "FSIZE",
    135: "FREADLN",
    136: "FREAD",
    137: "FWRITELN",
    138: "FWRITE",
    139: "FPOS",
    140: "DATEVALUE",
    141: "TIMEVALUE",
    142: "SLN",
    143: "SYD",
    144: "DDB",
    145: "GET.DEF",
    146: "REFTEXT",
    147: "TEXTREF",
    148: "INDIRECT",
    149: "REGISTER",
    150: "CALL",
    151: "ADD.BAR",
    152: "ADD.MENU",
    153: "ADD.COMMAND",
    154: "ENABLE.COMMAND",
    155: "CHECK.COMMAND",
    156: "RENAME.COMMAND",
    157: "SHOW.BAR",
    158: "DELETE.MENU",
    159: "DELETE.COMMAND",
    160: "GET.CHART.ITEM",
    161: "DIALOG.BOX",
    162: "CLEAN",
    163: "MDETERM",
    164: "MINVERSE",
    165: "MMULT",
    166: "FILES",
    167: "IPMT",
    168: "PPMT",
    169: "COUNTA",
    170: "CANCEL.KEY",
    171: "FOR",
    172: "WHILE",
    173: "BREAK",
    174: "NEXT",
    175: "INITIATE",
    176: "REQUEST",
    177: "POKE",
    178: "EXECUTE",
    179: "TERMINATE",
    180: "RESTART",
    181: "HELP",
    182: "GET.BAR",
    183: "PRODUCT",
    184: "FACT",
    185: "GET.CELL",
    186: "GET.WORKSPACE",
    187: "GET.WINDOW",
    188: "GET.DOCUMENT",
    189: "DPRODUCT",
    190: "ISNONTEXT",
    191: "GET.NOTE",
    192: "NOTE",
    193: "STDEVP",
    194: "VARP",
    195: "DSTDEVP",
    196: "DVARP",
    197: "TRUNC",
    198: "ISLOGICAL",
    199: "DCOUNTA",
    200: "DELETE.BAR",
    201: "UNREGISTER",
    204: "USDOLLAR",
    205: "FINDB",
    206: "SEARCHB",
    207: "REPLACEB",
    208: "LEFTB",
    209: "RIGHTB",
    210: "MIDB",
    211: "LENB",
    212: "ROUNDUP",
    213: "ROUNDDOWN",
    214: "ASC",
    215: "DBCS",
    216: "RANK",
    219: "ADDRESS",
    220: "DAYS360",
    221: "TODAY",
    222: "VDB",
    223: "ELSE",
    224: "ELSE.IF",
    225: "END.IF",
    226: "FOR.CELL",
    227: "MEDIAN",
    228: "SUMPRODUCT",
    229: "SINH",
    230: "COSH",
    231: "TANH",
    232: "ASINH",
    233: "ACOSH",
    234: "ATANH",
    235: "DGET",
    236: "CREATE.OBJECT",
    237: "VOLATILE",
    238: "LAST.ERROR",
    239: "CUSTOM.UNDO",
    240: "CUSTOM.REPEAT",
    241: "FORMULA.CONVERT",
    242: "GET.LINK.INFO",
    243: "TEXT.BOX",
    244: "INFO",
    245: "GROUP",
    246: "GET.OBJECT",
    247: "DB",
    248: "PAUSE",
    251: "RESUME",
    252: "FREQUENCY",
    253: "ADD.TOOLBAR",
    254: "DELETE.TOOLBAR",
    255: "User",
    256: "RESET.TOOLBAR",
    257: "EVALUATE",
    258: "GET.TOOLBAR",
    259: "GET.TOOL",
    260: "SPELLING.CHECK",
    261: "ERROR.TYPE",
    262: "APP.TITLE",
    263: "WINDOW.TITLE",
    264: "SAVE.TOOLBAR",
    265: "ENABLE.TOOL",
    266: "PRESS.TOOL",
    267: "REGISTER.ID",
    268: "GET.WORKBOOK",
    269: "AVEDEV",
    270: "BETADIST",
    271: "GAMMALN",
    272: "BETAINV",
    273: "BINOMDIST",
    274: "CHIDIST",
    275: "CHIINV",
    276: "COMBIN",
    277: "CONFIDENCE",
    278: "CRITBINOM",
    279: "EVEN",
    280: "EXPONDIST",
    281: "FDIST",
    282: "FINV",
    283: "FISHER",
    284: "FISHERINV",
    285: "FLOOR",
    286: "GAMMADIST",
    287: "GAMMAINV",
    288: "CEILING",
    289: "HYPGEOMDIST",
    290: "LOGNORMDIST",
    291: "LOGINV",
    292: "NEGBINOMDIST",
    293: "NORMDIST",
    294: "NORMSDIST",
    295: "NORMINV",
    296: "NORMSINV",
    297: "STANDARDIZE",
    298: "ODD",
    299: "PERMUT",
    300: "POISSON",
    301: "TDIST",
    302: "WEIBULL",
    303: "SUMXMY2",
    304: "SUMX2MY2",
    305: "SUMX2PY2",
    306: "CHITEST",
    307: "CORREL",
    308: "COVAR",
    309: "FORECAST",
    310: "FTEST",
    311: "INTERCEPT",
    312: "PEARSON",
    313: "RSQ",
    314: "STEYX",
    315: "SLOPE",
    316: "TTEST",
    317: "PROB",
    318: "DEVSQ",
    319: "GEOMEAN",
    320: "HARMEAN",
    321: "SUMSQ",
    322: "KURT",
    323: "SKEW",
    324: "ZTEST",
    325: "LARGE",
    326: "SMALL",
    327: "QUARTILE",
    328: "PERCENTILE",
    329: "PERCENTRANK",
    330: "MODE",
    331: "TRIMMEAN",
    332: "TINV",
    334: "MOVIE.COMMAND",
    335: "GET.MOVIE",
    336: "CONCATENATE",
    337: "POWER",
    338: "PIVOT.ADD.DATA",
    339: "GET.PIVOT.TABLE",
    340: "GET.PIVOT.FIELD",
    341: "GET.PIVOT.ITEM",
    342: "RADIANS",
    343: "DEGREES",
    344: "SUBTOTAL",
    345: "SUMIF",
    346: "COUNTIF",
    347: "COUNTBLANK",
    348: "SCENARIO.GET",
    349: "OPTIONS.LISTS.GET",
    350: "ISPMT",
    351: "DATEDIF",
    352: "DATESTRING",
    353: "NUMBERSTRING",
    354: "ROMAN",
    355: "OPEN.DIALOG",
    356: "SAVE.DIALOG",
    357: "VIEW.GET",
    358: "GETPIVOTDATA",
    359: "HYPERLINK",
    360: "PHONETIC",
    361: "AVERAGEA",
    362: "MAXA",
    363: "MINA",
    364: "STDEVPA",
    365: "VARPA",
    366: "STDEVA",
    367: "VARA",
    368: "BAHTTEXT",
    369: "THAIDAYOFWEEK",
    370: "THAIDIGIT",
    371: "THAIMONTHOFYEAR",
    372: "THAINUMSOUND",
    373: "THAINUMSTRING",
    374: "THAISTRINGLENGTH",
    375: "ISTHAIDIGIT",
    376: "ROUNDBAHTDOWN",
    377: "ROUNDBAHTUP",
    378: "THAIYEAR",
    379: "RTD",
    380: "CUBEVALUE",
    381: "CUBEMEMBER",
    382: "CUBEMEMBERPROPERTY",
    383: "CUBERANKEDMEMBER",
    384: "HEX2BIN",
    385: "HEX2DEC",
    386: "HEX2OCT",
    387: "DEC2BIN",
    388: "DEC2HEX",
    389: "DEC2OCT",
    390: "OCT2BIN",
    391: "OCT2HEX",
    392: "OCT2DEC",
    393: "BIN2DEC",
    394: "BIN2OCT",
    395: "BIN2HEX",
    396: "IMSUB",
    397: "IMDIV",
    398: "IMPOWER",
    399: "IMABS",
    400: "IMSQRT",
    401: "IMLN",
    402: "IMLOG2",
    403: "IMLOG10",
    404: "IMSIN",
    405: "IMCOS",
    406: "IMEXP",
    407: "IMARGUMENT",
    408: "IMCONJUGATE",
    409: "IMAGINARY",
    410: "IMREAL",
    411: "COMPLEX",
    412: "IMSUM",
    413: "IMPRODUCT",
    414: "SERIESSUM",
    415: "FACTDOUBLE",
    416: "SQRTPI",
    417: "QUOTIENT",
    418: "DELTA",
    419: "GESTEP",
    420: "ISEVEN",
    421: "ISODD",
    422: "MROUND",
    423: "ERF",
    424: "ERFC",
    425: "BESSELJ",
    426: "BESSELK",
    427: "BESSELY",
    428: "BESSELI",
    429: "XIRR",
    430: "XNPV",
    431: "PRICEMAT",
    432: "YIELDMAT",
    433: "INTRATE",
    434: "RECEIVED",
    435: "DISC",
    436: "PRICEDISC",
    437: "YIELDDISC",
    438: "TBILLEQ",
    439: "TBILLPRICE",
    440: "TBILLYIELD",
    441: "PRICE",
    442: "YIELD",
    443: "DOLLARDE",
    444: "DOLLARFR",
    445: "NOMINAL",
    446: "EFFECT",
    447: "CUMPRINC",
    448: "CUMIPMT",
    449: "EDATE",
    450: "EOMONTH",
    451: "YEARFRAC",
    452: "COUPDAYBS",
    453: "COUPDAYS",
    454: "COUPDAYSNC",
    455: "COUPNCD",
    456: "COUPNUM",
    457: "COUPPCD",
    458: "DURATION",
    459: "MDURATION",
    460: "ODDLPRICE",
    461: "ODDLYIELD",
    462: "ODDFPRICE",
    463: "ODDFYIELD",
    464: "RANDBETWEEN",
    465: "WEEKNUM",
    466: "AMORDEGRC",
    467: "AMORLINC",
    468: "CONVERT",
    724: "SHEETJS",
    469: "ACCRINT",
    470: "ACCRINTM",
    471: "WORKDAY",
    472: "NETWORKDAYS",
    473: "GCD",
    474: "MULTINOMIAL",
    475: "LCM",
    476: "FVSCHEDULE",
    477: "CUBEKPIMEMBER",
    478: "CUBESET",
    479: "CUBESETCOUNT",
    480: "IFERROR",
    481: "COUNTIFS",
    482: "SUMIFS",
    483: "AVERAGEIF",
    484: "AVERAGEIFS"
  };
  var FtabArgc = {
    2: 1,
    3: 1,
    10: 0,
    15: 1,
    16: 1,
    17: 1,
    18: 1,
    19: 0,
    20: 1,
    21: 1,
    22: 1,
    23: 1,
    24: 1,
    25: 1,
    26: 1,
    27: 2,
    30: 2,
    31: 3,
    32: 1,
    33: 1,
    34: 0,
    35: 0,
    38: 1,
    39: 2,
    40: 3,
    41: 3,
    42: 3,
    43: 3,
    44: 3,
    45: 3,
    47: 3,
    48: 2,
    53: 1,
    61: 3,
    63: 0,
    65: 3,
    66: 3,
    67: 1,
    68: 1,
    69: 1,
    70: 1,
    71: 1,
    72: 1,
    73: 1,
    74: 0,
    75: 1,
    76: 1,
    77: 1,
    79: 2,
    80: 2,
    83: 1,
    85: 0,
    86: 1,
    89: 0,
    90: 1,
    94: 0,
    95: 0,
    97: 2,
    98: 1,
    99: 1,
    101: 3,
    102: 3,
    105: 1,
    106: 1,
    108: 2,
    111: 1,
    112: 1,
    113: 1,
    114: 1,
    117: 2,
    118: 1,
    119: 4,
    121: 1,
    126: 1,
    127: 1,
    128: 1,
    129: 1,
    130: 1,
    131: 1,
    133: 1,
    134: 1,
    135: 1,
    136: 2,
    137: 2,
    138: 2,
    140: 1,
    141: 1,
    142: 3,
    143: 4,
    144: 4,
    161: 1,
    162: 1,
    163: 1,
    164: 1,
    165: 2,
    172: 1,
    175: 2,
    176: 2,
    177: 3,
    178: 2,
    179: 1,
    184: 1,
    186: 1,
    189: 3,
    190: 1,
    195: 3,
    196: 3,
    197: 1,
    198: 1,
    199: 3,
    201: 1,
    207: 4,
    210: 3,
    211: 1,
    212: 2,
    213: 2,
    214: 1,
    215: 1,
    225: 0,
    229: 1,
    230: 1,
    231: 1,
    232: 1,
    233: 1,
    234: 1,
    235: 3,
    244: 1,
    247: 4,
    252: 2,
    257: 1,
    261: 1,
    271: 1,
    273: 4,
    274: 2,
    275: 2,
    276: 2,
    277: 3,
    278: 3,
    279: 1,
    280: 3,
    281: 3,
    282: 3,
    283: 1,
    284: 1,
    285: 2,
    286: 4,
    287: 3,
    288: 2,
    289: 4,
    290: 3,
    291: 3,
    292: 3,
    293: 4,
    294: 1,
    295: 3,
    296: 1,
    297: 3,
    298: 1,
    299: 2,
    300: 3,
    301: 3,
    302: 4,
    303: 2,
    304: 2,
    305: 2,
    306: 2,
    307: 2,
    308: 2,
    309: 3,
    310: 2,
    311: 2,
    312: 2,
    313: 2,
    314: 2,
    315: 2,
    316: 4,
    325: 2,
    326: 2,
    327: 2,
    328: 2,
    331: 2,
    332: 2,
    337: 2,
    342: 1,
    343: 1,
    346: 2,
    347: 1,
    350: 4,
    351: 3,
    352: 1,
    353: 2,
    360: 1,
    368: 1,
    369: 1,
    370: 1,
    371: 1,
    372: 1,
    373: 1,
    374: 1,
    375: 1,
    376: 1,
    377: 1,
    378: 1,
    382: 3,
    385: 1,
    392: 1,
    393: 1,
    396: 2,
    397: 2,
    398: 2,
    399: 1,
    400: 1,
    401: 1,
    402: 1,
    403: 1,
    404: 1,
    405: 1,
    406: 1,
    407: 1,
    408: 1,
    409: 1,
    410: 1,
    414: 4,
    415: 1,
    416: 1,
    417: 2,
    420: 1,
    421: 1,
    422: 2,
    424: 1,
    425: 2,
    426: 2,
    427: 2,
    428: 2,
    430: 3,
    438: 3,
    439: 3,
    440: 3,
    443: 2,
    444: 2,
    445: 2,
    446: 2,
    447: 6,
    448: 6,
    449: 2,
    450: 2,
    464: 2,
    468: 3,
    476: 2,
    479: 1,
    480: 2,
    65535: 0
  };
  function ods_to_csf_formula(f) {
    if (f.slice(0, 3) == "of:") f = f.slice(3);
    if (f.charCodeAt(0) == 61) {
      f = f.slice(1);
      if (f.charCodeAt(0) == 61) f = f.slice(1);
    }
    f = f.replace(/COM\.MICROSOFT\./g, "");
    f = f.replace(/\[((?:\.[A-Z]+[0-9]+)(?::\.[A-Z]+[0-9]+)?)\]/g, function($$, $1) {
      return $1.replace(/\./g, "");
    });
    f = f.replace(/\[.(#[A-Z]*[?!])\]/g, "$1");
    return f.replace(/[;~]/g, ",").replace(/\|/g, ";");
  }
  function ods_to_csf_3D(r) {
    var a = r.split(":");
    var s = a[0].split(".")[0];
    return [s, a[0].split(".")[1] + (a.length > 1 ? ":" + (a[1].split(".")[1] || a[1].split(".")[0]) : "")];
  }
  var strs = {};
  var _ssfopts = {};
  function default_margins(margins, mode) {
    if (!margins) return;
    var defs = [0.7, 0.7, 0.75, 0.75, 0.3, 0.3];
    if (mode == "xlml") defs = [1, 1, 1, 1, 0.5, 0.5];
    if (margins.left == null) margins.left = defs[0];
    if (margins.right == null) margins.right = defs[1];
    if (margins.top == null) margins.top = defs[2];
    if (margins.bottom == null) margins.bottom = defs[3];
    if (margins.header == null) margins.header = defs[4];
    if (margins.footer == null) margins.footer = defs[5];
  }
  function safe_format(p, fmtid, fillid, opts, themes, styles) {
    try {
      if (opts.cellNF) p.z = table_fmt[fmtid];
    } catch (e) {
      if (opts.WTF) throw e;
    }
    if (p.t === "z" && !opts.cellStyles) return;
    if (p.t === "d" && typeof p.v === "string") p.v = parseDate(p.v);
    if ((!opts || opts.cellText !== false) && p.t !== "z") try {
      if (table_fmt[fmtid] == null) SSF_load(SSFImplicit[fmtid] || "General", fmtid);
      if (p.t === "e") p.w = p.w || BErr[p.v];
      else if (fmtid === 0) {
        if (p.t === "n") {
          if ((p.v | 0) === p.v) p.w = p.v.toString(10);
          else p.w = SSF_general_num(p.v);
        } else if (p.t === "d") {
          var dd = datenum(p.v);
          if ((dd | 0) === dd) p.w = dd.toString(10);
          else p.w = SSF_general_num(dd);
        } else if (p.v === void 0) return "";
        else p.w = SSF_general(p.v, _ssfopts);
      } else if (p.t === "d") p.w = SSF_format(fmtid, datenum(p.v), _ssfopts);
      else p.w = SSF_format(fmtid, p.v, _ssfopts);
    } catch (e) {
      if (opts.WTF) throw e;
    }
    if (!opts.cellStyles) return;
    if (fillid != null) try {
      p.s = styles.Fills[fillid];
      if (p.s.fgColor && p.s.fgColor.theme && !p.s.fgColor.rgb) {
        p.s.fgColor.rgb = rgb_tint(themes.themeElements.clrScheme[p.s.fgColor.theme].rgb, p.s.fgColor.tint || 0);
        if (opts.WTF) p.s.fgColor.raw_rgb = themes.themeElements.clrScheme[p.s.fgColor.theme].rgb;
      }
      if (p.s.bgColor && p.s.bgColor.theme) {
        p.s.bgColor.rgb = rgb_tint(themes.themeElements.clrScheme[p.s.bgColor.theme].rgb, p.s.bgColor.tint || 0);
        if (opts.WTF) p.s.bgColor.raw_rgb = themes.themeElements.clrScheme[p.s.bgColor.theme].rgb;
      }
    } catch (e) {
      if (opts.WTF && styles.Fills) throw e;
    }
  }
  function parse_ws_xml_dim(ws, s) {
    var d = safe_decode_range(s);
    if (d.s.r <= d.e.r && d.s.c <= d.e.c && d.s.r >= 0 && d.s.c >= 0) ws["!ref"] = encode_range(d);
  }
  var mergecregex = /<(?:\w:)?mergeCell ref="[A-Z0-9:]+"\s*[\/]?>/g;
  var sheetdataregex = /<(?:\w+:)?sheetData[^>]*>([\s\S]*)<\/(?:\w+:)?sheetData>/;
  var hlinkregex = /<(?:\w:)?hyperlink [^>]*>/mg;
  var dimregex = /"(\w*:\w*)"/;
  var colregex = /<(?:\w:)?col\b[^>]*[\/]?>/g;
  var afregex = /<(?:\w:)?autoFilter[^>]*([\/]|>([\s\S]*)<\/(?:\w:)?autoFilter)>/g;
  var marginregex = /<(?:\w:)?pageMargins[^>]*\/>/g;
  var sheetprregex = /<(?:\w:)?sheetPr\b(?:[^>a-z][^>]*)?\/>/;
  var sheetprregex2 = /<(?:\w:)?sheetPr[^>]*(?:[\/]|>([\s\S]*)<\/(?:\w:)?sheetPr)>/;
  var svsregex = /<(?:\w:)?sheetViews[^>]*(?:[\/]|>([\s\S]*)<\/(?:\w:)?sheetViews)>/;
  function parse_ws_xml(data, opts, idx, rels, wb, themes, styles) {
    if (!data) return data;
    if (!rels) rels = { "!id": {} };
    if (DENSE != null && opts.dense == null) opts.dense = DENSE;
    var s = opts.dense ? [] : {};
    var refguess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
    var data1 = "", data2 = "";
    var mtch = data.match(sheetdataregex);
    if (mtch) {
      data1 = data.slice(0, mtch.index);
      data2 = data.slice(mtch.index + mtch[0].length);
    } else data1 = data2 = data;
    var sheetPr = data1.match(sheetprregex);
    if (sheetPr) parse_ws_xml_sheetpr(sheetPr[0], s, wb, idx);
    else if (sheetPr = data1.match(sheetprregex2)) parse_ws_xml_sheetpr2(sheetPr[0], sheetPr[1] || "", s, wb, idx, styles, themes);
    var ridx = (data1.match(/<(?:\w*:)?dimension/) || { index: -1 }).index;
    if (ridx > 0) {
      var ref = data1.slice(ridx, ridx + 50).match(dimregex);
      if (ref) parse_ws_xml_dim(s, ref[1]);
    }
    var svs = data1.match(svsregex);
    if (svs && svs[1]) parse_ws_xml_sheetviews(svs[1], wb);
    var columns = [];
    if (opts.cellStyles) {
      var cols = data1.match(colregex);
      if (cols) parse_ws_xml_cols(columns, cols);
    }
    if (mtch) parse_ws_xml_data(mtch[1], s, opts, refguess, themes, styles);
    var afilter = data2.match(afregex);
    if (afilter) s["!autofilter"] = parse_ws_xml_autofilter(afilter[0]);
    var merges = [];
    var _merge = data2.match(mergecregex);
    if (_merge) for (ridx = 0; ridx != _merge.length; ++ridx)
      merges[ridx] = safe_decode_range(_merge[ridx].slice(_merge[ridx].indexOf('"') + 1));
    var hlink = data2.match(hlinkregex);
    if (hlink) parse_ws_xml_hlinks(s, hlink, rels);
    var margins = data2.match(marginregex);
    if (margins) s["!margins"] = parse_ws_xml_margins(parsexmltag(margins[0]));
    if (!s["!ref"] && refguess.e.c >= refguess.s.c && refguess.e.r >= refguess.s.r) s["!ref"] = encode_range(refguess);
    if (opts.sheetRows > 0 && s["!ref"]) {
      var tmpref = safe_decode_range(s["!ref"]);
      if (opts.sheetRows <= +tmpref.e.r) {
        tmpref.e.r = opts.sheetRows - 1;
        if (tmpref.e.r > refguess.e.r) tmpref.e.r = refguess.e.r;
        if (tmpref.e.r < tmpref.s.r) tmpref.s.r = tmpref.e.r;
        if (tmpref.e.c > refguess.e.c) tmpref.e.c = refguess.e.c;
        if (tmpref.e.c < tmpref.s.c) tmpref.s.c = tmpref.e.c;
        s["!fullref"] = s["!ref"];
        s["!ref"] = encode_range(tmpref);
      }
    }
    if (columns.length > 0) s["!cols"] = columns;
    if (merges.length > 0) s["!merges"] = merges;
    return s;
  }
  function parse_ws_xml_sheetpr(sheetPr, s, wb, idx) {
    var data = parsexmltag(sheetPr);
    if (!wb.Sheets[idx]) wb.Sheets[idx] = {};
    if (data.codeName) wb.Sheets[idx].CodeName = unescapexml(utf8read(data.codeName));
  }
  function parse_ws_xml_sheetpr2(sheetPr, body, s, wb, idx) {
    parse_ws_xml_sheetpr(sheetPr.slice(0, sheetPr.indexOf(">")), s, wb, idx);
  }
  function parse_ws_xml_hlinks(s, data, rels) {
    var dense = Array.isArray(s);
    for (var i = 0; i != data.length; ++i) {
      var val = parsexmltag(utf8read(data[i]), true);
      if (!val.ref) return;
      var rel = ((rels || {})["!id"] || [])[val.id];
      if (rel) {
        val.Target = rel.Target;
        if (val.location) val.Target += "#" + unescapexml(val.location);
      } else {
        val.Target = "#" + unescapexml(val.location);
        rel = { Target: val.Target, TargetMode: "Internal" };
      }
      val.Rel = rel;
      if (val.tooltip) {
        val.Tooltip = val.tooltip;
        delete val.tooltip;
      }
      var rng = safe_decode_range(val.ref);
      for (var R = rng.s.r; R <= rng.e.r; ++R) for (var C = rng.s.c; C <= rng.e.c; ++C) {
        var addr = encode_cell({ c: C, r: R });
        if (dense) {
          if (!s[R]) s[R] = [];
          if (!s[R][C]) s[R][C] = { t: "z", v: void 0 };
          s[R][C].l = val;
        } else {
          if (!s[addr]) s[addr] = { t: "z", v: void 0 };
          s[addr].l = val;
        }
      }
    }
  }
  function parse_ws_xml_margins(margin) {
    var o = {};
    ["left", "right", "top", "bottom", "header", "footer"].forEach(function(k) {
      if (margin[k]) o[k] = parseFloat(margin[k]);
    });
    return o;
  }
  function parse_ws_xml_cols(columns, cols) {
    var seencol = false;
    for (var coli = 0; coli != cols.length; ++coli) {
      var coll = parsexmltag(cols[coli], true);
      if (coll.hidden) coll.hidden = parsexmlbool(coll.hidden);
      var colm = parseInt(coll.min, 10) - 1, colM = parseInt(coll.max, 10) - 1;
      if (coll.outlineLevel) coll.level = +coll.outlineLevel || 0;
      delete coll.min;
      delete coll.max;
      coll.width = +coll.width;
      if (!seencol && coll.width) {
        seencol = true;
        find_mdw_colw(coll.width);
      }
      process_col(coll);
      while (colm <= colM) columns[colm++] = dup(coll);
    }
  }
  function parse_ws_xml_autofilter(data) {
    var o = { ref: (data.match(/ref="([^"]*)"/) || [])[1] };
    return o;
  }
  var sviewregex = /<(?:\w:)?sheetView(?:[^>a-z][^>]*)?\/?>/;
  function parse_ws_xml_sheetviews(data, wb) {
    if (!wb.Views) wb.Views = [{}];
    (data.match(sviewregex) || []).forEach(function(r, i) {
      var tag = parsexmltag(r);
      if (!wb.Views[i]) wb.Views[i] = {};
      if (+tag.zoomScale) wb.Views[i].zoom = +tag.zoomScale;
      if (parsexmlbool(tag.rightToLeft)) wb.Views[i].RTL = true;
    });
  }
  var parse_ws_xml_data = /* @__PURE__ */ function() {
    var cellregex = /<(?:\w+:)?c[ \/>]/, rowregex = /<\/(?:\w+:)?row>/;
    var rregex = /r=["']([^"']*)["']/, isregex = /<(?:\w+:)?is>([\S\s]*?)<\/(?:\w+:)?is>/;
    var refregex = /ref=["']([^"']*)["']/;
    var match_v = matchtag("v"), match_f = matchtag("f");
    return function parse_ws_xml_data2(sdata, s, opts, guess, themes, styles) {
      var ri = 0, x = "", cells = [], cref = [], idx = 0, i = 0, cc = 0, d = "", p;
      var tag, tagr = 0, tagc = 0;
      var sstr, ftag;
      var fmtid = 0, fillid = 0;
      var do_format = Array.isArray(styles.CellXf), cf;
      var arrayf = [];
      var sharedf = [];
      var dense = Array.isArray(s);
      var rows = [], rowobj = {}, rowrite = false;
      var sheetStubs = !!opts.sheetStubs;
      for (var marr = sdata.split(rowregex), mt = 0, marrlen = marr.length; mt != marrlen; ++mt) {
        x = marr[mt].trim();
        var xlen = x.length;
        if (xlen === 0) continue;
        var rstarti = 0;
        outa: for (ri = 0; ri < xlen; ++ri) switch (
          /*x.charCodeAt(ri)*/
          x[ri]
        ) {
          case ">":
            if (
              /*x.charCodeAt(ri-1) != 47*/
              x[ri - 1] != "/"
            ) {
              ++ri;
              break outa;
            }
            if (opts && opts.cellStyles) {
              tag = parsexmltag(x.slice(rstarti, ri), true);
              tagr = tag.r != null ? parseInt(tag.r, 10) : tagr + 1;
              tagc = -1;
              if (opts.sheetRows && opts.sheetRows < tagr) continue;
              rowobj = {};
              rowrite = false;
              if (tag.ht) {
                rowrite = true;
                rowobj.hpt = parseFloat(tag.ht);
                rowobj.hpx = pt2px(rowobj.hpt);
              }
              if (tag.hidden == "1") {
                rowrite = true;
                rowobj.hidden = true;
              }
              if (tag.outlineLevel != null) {
                rowrite = true;
                rowobj.level = +tag.outlineLevel;
              }
              if (rowrite) rows[tagr - 1] = rowobj;
            }
            break;
          case "<":
            rstarti = ri;
            break;
        }
        if (rstarti >= ri) break;
        tag = parsexmltag(x.slice(rstarti, ri), true);
        tagr = tag.r != null ? parseInt(tag.r, 10) : tagr + 1;
        tagc = -1;
        if (opts.sheetRows && opts.sheetRows < tagr) continue;
        if (guess.s.r > tagr - 1) guess.s.r = tagr - 1;
        if (guess.e.r < tagr - 1) guess.e.r = tagr - 1;
        if (opts && opts.cellStyles) {
          rowobj = {};
          rowrite = false;
          if (tag.ht) {
            rowrite = true;
            rowobj.hpt = parseFloat(tag.ht);
            rowobj.hpx = pt2px(rowobj.hpt);
          }
          if (tag.hidden == "1") {
            rowrite = true;
            rowobj.hidden = true;
          }
          if (tag.outlineLevel != null) {
            rowrite = true;
            rowobj.level = +tag.outlineLevel;
          }
          if (rowrite) rows[tagr - 1] = rowobj;
        }
        cells = x.slice(ri).split(cellregex);
        for (var rslice = 0; rslice != cells.length; ++rslice) if (cells[rslice].trim().charAt(0) != "<") break;
        cells = cells.slice(rslice);
        for (ri = 0; ri != cells.length; ++ri) {
          x = cells[ri].trim();
          if (x.length === 0) continue;
          cref = x.match(rregex);
          idx = ri;
          i = 0;
          cc = 0;
          x = "<c " + (x.slice(0, 1) == "<" ? ">" : "") + x;
          if (cref != null && cref.length === 2) {
            idx = 0;
            d = cref[1];
            for (i = 0; i != d.length; ++i) {
              if ((cc = d.charCodeAt(i) - 64) < 1 || cc > 26) break;
              idx = 26 * idx + cc;
            }
            --idx;
            tagc = idx;
          } else ++tagc;
          for (i = 0; i != x.length; ++i) if (x.charCodeAt(i) === 62) break;
          ++i;
          tag = parsexmltag(x.slice(0, i), true);
          if (!tag.r) tag.r = encode_cell({ r: tagr - 1, c: tagc });
          d = x.slice(i);
          p = { t: "" };
          if ((cref = d.match(match_v)) != null && /*::cref != null && */
          cref[1] !== "") p.v = unescapexml(cref[1]);
          if (opts.cellFormula) {
            if ((cref = d.match(match_f)) != null && /*::cref != null && */
            cref[1] !== "") {
              p.f = unescapexml(utf8read(cref[1])).replace(/\r\n/g, "\n");
              if (!opts.xlfn) p.f = _xlfn(p.f);
              if (
                /*::cref != null && cref[0] != null && */
                cref[0].indexOf('t="array"') > -1
              ) {
                p.F = (d.match(refregex) || [])[1];
                if (p.F.indexOf(":") > -1) arrayf.push([safe_decode_range(p.F), p.F]);
              } else if (
                /*::cref != null && cref[0] != null && */
                cref[0].indexOf('t="shared"') > -1
              ) {
                ftag = parsexmltag(cref[0]);
                var ___f = unescapexml(utf8read(cref[1]));
                if (!opts.xlfn) ___f = _xlfn(___f);
                sharedf[parseInt(ftag.si, 10)] = [ftag, ___f, tag.r];
              }
            } else if (cref = d.match(/<f[^>]*\/>/)) {
              ftag = parsexmltag(cref[0]);
              if (sharedf[ftag.si]) p.f = shift_formula_xlsx(sharedf[ftag.si][1], sharedf[ftag.si][2], tag.r);
            }
            var _tag = decode_cell(tag.r);
            for (i = 0; i < arrayf.length; ++i)
              if (_tag.r >= arrayf[i][0].s.r && _tag.r <= arrayf[i][0].e.r) {
                if (_tag.c >= arrayf[i][0].s.c && _tag.c <= arrayf[i][0].e.c)
                  p.F = arrayf[i][1];
              }
          }
          if (tag.t == null && p.v === void 0) {
            if (p.f || p.F) {
              p.v = 0;
              p.t = "n";
            } else if (!sheetStubs) continue;
            else p.t = "z";
          } else p.t = tag.t || "n";
          if (guess.s.c > tagc) guess.s.c = tagc;
          if (guess.e.c < tagc) guess.e.c = tagc;
          switch (p.t) {
            case "n":
              if (p.v == "" || p.v == null) {
                if (!sheetStubs) continue;
                p.t = "z";
              } else p.v = parseFloat(p.v);
              break;
            case "s":
              if (typeof p.v == "undefined") {
                if (!sheetStubs) continue;
                p.t = "z";
              } else {
                sstr = strs[parseInt(p.v, 10)];
                p.v = sstr.t;
                p.r = sstr.r;
                if (opts.cellHTML) p.h = sstr.h;
              }
              break;
            case "str":
              p.t = "s";
              p.v = p.v != null ? utf8read(p.v) : "";
              if (opts.cellHTML) p.h = escapehtml(p.v);
              break;
            case "inlineStr":
              cref = d.match(isregex);
              p.t = "s";
              if (cref != null && (sstr = parse_si(cref[1]))) {
                p.v = sstr.t;
                if (opts.cellHTML) p.h = sstr.h;
              } else p.v = "";
              break;
            case "b":
              p.v = parsexmlbool(p.v);
              break;
            case "d":
              if (opts.cellDates) p.v = parseDate(p.v, 1);
              else {
                p.v = datenum(parseDate(p.v, 1));
                p.t = "n";
              }
              break;
            /* error string in .w, number in .v */
            case "e":
              if (!opts || opts.cellText !== false) p.w = p.v;
              p.v = RBErr[p.v];
              break;
          }
          fmtid = fillid = 0;
          cf = null;
          if (do_format && tag.s !== void 0) {
            cf = styles.CellXf[tag.s];
            if (cf != null) {
              if (cf.numFmtId != null) fmtid = cf.numFmtId;
              if (opts.cellStyles) {
                if (cf.fillId != null) fillid = cf.fillId;
              }
            }
          }
          safe_format(p, fmtid, fillid, opts, themes, styles);
          if (opts.cellDates && do_format && p.t == "n" && fmt_is_date(table_fmt[fmtid])) {
            p.t = "d";
            p.v = numdate(p.v);
          }
          if (tag.cm && opts.xlmeta) {
            var cm = (opts.xlmeta.Cell || [])[+tag.cm - 1];
            if (cm && cm.type == "XLDAPR") p.D = true;
          }
          if (dense) {
            var _r = decode_cell(tag.r);
            if (!s[_r.r]) s[_r.r] = [];
            s[_r.r][_r.c] = p;
          } else s[tag.r] = p;
        }
      }
      if (rows.length > 0) s["!rows"] = rows;
    };
  }();
  function parse_BrtRowHdr(data, length) {
    var z = {};
    var tgt = data.l + length;
    z.r = data.read_shift(4);
    data.l += 4;
    var miyRw = data.read_shift(2);
    data.l += 1;
    var flags = data.read_shift(1);
    data.l = tgt;
    if (flags & 7) z.level = flags & 7;
    if (flags & 16) z.hidden = true;
    if (flags & 32) z.hpt = miyRw / 20;
    return z;
  }
  var parse_BrtWsDim = parse_UncheckedRfX;
  function parse_BrtWsFmtInfo() {
  }
  function parse_BrtWsProp(data, length) {
    var z = {};
    var f = data[data.l];
    ++data.l;
    z.above = !(f & 64);
    z.left = !(f & 128);
    data.l += 18;
    z.name = parse_XLSBCodeName(data, length - 19);
    return z;
  }
  function parse_BrtCellBlank(data) {
    var cell = parse_XLSBCell(data);
    return [cell];
  }
  function parse_BrtShortBlank(data) {
    var cell = parse_XLSBShortCell(data);
    return [cell];
  }
  function parse_BrtCellBool(data) {
    var cell = parse_XLSBCell(data);
    var fBool = data.read_shift(1);
    return [cell, fBool, "b"];
  }
  function parse_BrtShortBool(data) {
    var cell = parse_XLSBShortCell(data);
    var fBool = data.read_shift(1);
    return [cell, fBool, "b"];
  }
  function parse_BrtCellError(data) {
    var cell = parse_XLSBCell(data);
    var bError = data.read_shift(1);
    return [cell, bError, "e"];
  }
  function parse_BrtShortError(data) {
    var cell = parse_XLSBShortCell(data);
    var bError = data.read_shift(1);
    return [cell, bError, "e"];
  }
  function parse_BrtCellIsst(data) {
    var cell = parse_XLSBCell(data);
    var isst = data.read_shift(4);
    return [cell, isst, "s"];
  }
  function parse_BrtShortIsst(data) {
    var cell = parse_XLSBShortCell(data);
    var isst = data.read_shift(4);
    return [cell, isst, "s"];
  }
  function parse_BrtCellReal(data) {
    var cell = parse_XLSBCell(data);
    var value = parse_Xnum(data);
    return [cell, value, "n"];
  }
  function parse_BrtShortReal(data) {
    var cell = parse_XLSBShortCell(data);
    var value = parse_Xnum(data);
    return [cell, value, "n"];
  }
  function parse_BrtCellRk(data) {
    var cell = parse_XLSBCell(data);
    var value = parse_RkNumber(data);
    return [cell, value, "n"];
  }
  function parse_BrtShortRk(data) {
    var cell = parse_XLSBShortCell(data);
    var value = parse_RkNumber(data);
    return [cell, value, "n"];
  }
  function parse_BrtCellRString(data) {
    var cell = parse_XLSBCell(data);
    var value = parse_RichStr(data);
    return [cell, value, "is"];
  }
  function parse_BrtCellSt(data) {
    var cell = parse_XLSBCell(data);
    var value = parse_XLWideString(data);
    return [cell, value, "str"];
  }
  function parse_BrtShortSt(data) {
    var cell = parse_XLSBShortCell(data);
    var value = parse_XLWideString(data);
    return [cell, value, "str"];
  }
  function parse_BrtFmlaBool(data, length, opts) {
    var end = data.l + length;
    var cell = parse_XLSBCell(data);
    cell.r = opts["!row"];
    var value = data.read_shift(1);
    var o = [cell, value, "b"];
    if (opts.cellFormula) {
      data.l += 2;
      var formula = parse_XLSBCellParsedFormula(data, end - data.l, opts);
      o[3] = stringify_formula(formula, null, cell, opts.supbooks, opts);
    } else data.l = end;
    return o;
  }
  function parse_BrtFmlaError(data, length, opts) {
    var end = data.l + length;
    var cell = parse_XLSBCell(data);
    cell.r = opts["!row"];
    var value = data.read_shift(1);
    var o = [cell, value, "e"];
    if (opts.cellFormula) {
      data.l += 2;
      var formula = parse_XLSBCellParsedFormula(data, end - data.l, opts);
      o[3] = stringify_formula(formula, null, cell, opts.supbooks, opts);
    } else data.l = end;
    return o;
  }
  function parse_BrtFmlaNum(data, length, opts) {
    var end = data.l + length;
    var cell = parse_XLSBCell(data);
    cell.r = opts["!row"];
    var value = parse_Xnum(data);
    var o = [cell, value, "n"];
    if (opts.cellFormula) {
      data.l += 2;
      var formula = parse_XLSBCellParsedFormula(data, end - data.l, opts);
      o[3] = stringify_formula(formula, null, cell, opts.supbooks, opts);
    } else data.l = end;
    return o;
  }
  function parse_BrtFmlaString(data, length, opts) {
    var end = data.l + length;
    var cell = parse_XLSBCell(data);
    cell.r = opts["!row"];
    var value = parse_XLWideString(data);
    var o = [cell, value, "str"];
    if (opts.cellFormula) {
      data.l += 2;
      var formula = parse_XLSBCellParsedFormula(data, end - data.l, opts);
      o[3] = stringify_formula(formula, null, cell, opts.supbooks, opts);
    } else data.l = end;
    return o;
  }
  var parse_BrtMergeCell = parse_UncheckedRfX;
  function parse_BrtHLink(data, length) {
    var end = data.l + length;
    var rfx = parse_UncheckedRfX(data, 16);
    var relId = parse_XLNullableWideString(data);
    var loc = parse_XLWideString(data);
    var tooltip = parse_XLWideString(data);
    var display = parse_XLWideString(data);
    data.l = end;
    var o = { rfx, relId, loc, display };
    if (tooltip) o.Tooltip = tooltip;
    return o;
  }
  function parse_BrtPane() {
  }
  function parse_BrtArrFmla(data, length, opts) {
    var end = data.l + length;
    var rfx = parse_RfX(data, 16);
    var fAlwaysCalc = data.read_shift(1);
    var o = [rfx];
    o[2] = fAlwaysCalc;
    if (opts.cellFormula) {
      var formula = parse_XLSBArrayParsedFormula(data, end - data.l, opts);
      o[1] = formula;
    } else data.l = end;
    return o;
  }
  function parse_BrtShrFmla(data, length, opts) {
    var end = data.l + length;
    var rfx = parse_UncheckedRfX(data, 16);
    var o = [rfx];
    if (opts.cellFormula) {
      var formula = parse_XLSBSharedParsedFormula(data, end - data.l, opts);
      o[1] = formula;
      data.l = end;
    } else data.l = end;
    return o;
  }
  var BrtMarginKeys = ["left", "right", "top", "bottom", "header", "footer"];
  function parse_BrtMargins(data) {
    var margins = {};
    BrtMarginKeys.forEach(function(k) {
      margins[k] = parse_Xnum(data, 8);
    });
    return margins;
  }
  function parse_BrtBeginWsView(data) {
    var f = data.read_shift(2);
    data.l += 28;
    return { RTL: f & 32 };
  }
  function parse_BrtDVal() {
  }
  function parse_BrtDVal14() {
  }
  function parse_ws_bin(data, _opts, idx, rels, wb, themes, styles) {
    if (!data) return data;
    var opts = _opts || {};
    if (!rels) rels = { "!id": {} };
    if (DENSE != null && opts.dense == null) opts.dense = DENSE;
    var s = opts.dense ? [] : {};
    var ref;
    var refguess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
    var state = [];
    var pass = false, end = false;
    var row, p, cf, R, C, addr, sstr, rr, cell;
    var merges = [];
    opts.biff = 12;
    opts["!row"] = 0;
    var ai = 0, af = false;
    var arrayf = [];
    var sharedf = {};
    var supbooks = opts.supbooks || /*::(*/
    wb.supbooks || [[]];
    supbooks.sharedf = sharedf;
    supbooks.arrayf = arrayf;
    supbooks.SheetNames = wb.SheetNames || wb.Sheets.map(function(x) {
      return x.name;
    });
    if (!opts.supbooks) {
      opts.supbooks = supbooks;
      if (wb.Names) for (var i = 0; i < wb.Names.length; ++i) supbooks[0][i + 1] = wb.Names[i];
    }
    var colinfo = [], rowinfo = [];
    var seencol = false;
    XLSBRecordEnum[16] = { n: "BrtShortReal", f: parse_BrtShortReal };
    var cm, vm;
    recordhopper(data, function ws_parse(val, RR, RT) {
      if (end) return;
      switch (RT) {
        case 148:
          ref = val;
          break;
        case 0:
          row = val;
          if (opts.sheetRows && opts.sheetRows <= row.r) end = true;
          rr = encode_row(R = row.r);
          opts["!row"] = row.r;
          if (val.hidden || val.hpt || val.level != null) {
            if (val.hpt) val.hpx = pt2px(val.hpt);
            rowinfo[val.r] = val;
          }
          break;
        case 2:
        /* 'BrtCellRk' */
        case 3:
        /* 'BrtCellError' */
        case 4:
        /* 'BrtCellBool' */
        case 5:
        /* 'BrtCellReal' */
        case 6:
        /* 'BrtCellSt' */
        case 7:
        /* 'BrtCellIsst' */
        case 8:
        /* 'BrtFmlaString' */
        case 9:
        /* 'BrtFmlaNum' */
        case 10:
        /* 'BrtFmlaBool' */
        case 11:
        /* 'BrtFmlaError' */
        case 13:
        /* 'BrtShortRk' */
        case 14:
        /* 'BrtShortError' */
        case 15:
        /* 'BrtShortBool' */
        case 16:
        /* 'BrtShortReal' */
        case 17:
        /* 'BrtShortSt' */
        case 18:
        /* 'BrtShortIsst' */
        case 62:
          p = { t: val[2] };
          switch (val[2]) {
            case "n":
              p.v = val[1];
              break;
            case "s":
              sstr = strs[val[1]];
              p.v = sstr.t;
              p.r = sstr.r;
              break;
            case "b":
              p.v = val[1] ? true : false;
              break;
            case "e":
              p.v = val[1];
              if (opts.cellText !== false) p.w = BErr[p.v];
              break;
            case "str":
              p.t = "s";
              p.v = val[1];
              break;
            case "is":
              p.t = "s";
              p.v = val[1].t;
              break;
          }
          if (cf = styles.CellXf[val[0].iStyleRef]) safe_format(p, cf.numFmtId, null, opts, themes, styles);
          C = val[0].c == -1 ? C + 1 : val[0].c;
          if (opts.dense) {
            if (!s[R]) s[R] = [];
            s[R][C] = p;
          } else s[encode_col(C) + rr] = p;
          if (opts.cellFormula) {
            af = false;
            for (ai = 0; ai < arrayf.length; ++ai) {
              var aii = arrayf[ai];
              if (row.r >= aii[0].s.r && row.r <= aii[0].e.r) {
                if (C >= aii[0].s.c && C <= aii[0].e.c) {
                  p.F = encode_range(aii[0]);
                  af = true;
                }
              }
            }
            if (!af && val.length > 3) p.f = val[3];
          }
          if (refguess.s.r > row.r) refguess.s.r = row.r;
          if (refguess.s.c > C) refguess.s.c = C;
          if (refguess.e.r < row.r) refguess.e.r = row.r;
          if (refguess.e.c < C) refguess.e.c = C;
          if (opts.cellDates && cf && p.t == "n" && fmt_is_date(table_fmt[cf.numFmtId])) {
            var _d = SSF_parse_date_code(p.v);
            if (_d) {
              p.t = "d";
              p.v = new Date(_d.y, _d.m - 1, _d.d, _d.H, _d.M, _d.S, _d.u);
            }
          }
          if (cm) {
            if (cm.type == "XLDAPR") p.D = true;
            cm = void 0;
          }
          if (vm) vm = void 0;
          break;
        case 1:
        /* 'BrtCellBlank' */
        case 12:
          if (!opts.sheetStubs || pass) break;
          p = { t: "z", v: void 0 };
          C = val[0].c == -1 ? C + 1 : val[0].c;
          if (opts.dense) {
            if (!s[R]) s[R] = [];
            s[R][C] = p;
          } else s[encode_col(C) + rr] = p;
          if (refguess.s.r > row.r) refguess.s.r = row.r;
          if (refguess.s.c > C) refguess.s.c = C;
          if (refguess.e.r < row.r) refguess.e.r = row.r;
          if (refguess.e.c < C) refguess.e.c = C;
          if (cm) {
            if (cm.type == "XLDAPR") p.D = true;
            cm = void 0;
          }
          if (vm) vm = void 0;
          break;
        case 176:
          merges.push(val);
          break;
        case 49:
          {
            cm = ((opts.xlmeta || {}).Cell || [])[val - 1];
          }
          break;
        case 494:
          var rel = rels["!id"][val.relId];
          if (rel) {
            val.Target = rel.Target;
            if (val.loc) val.Target += "#" + val.loc;
            val.Rel = rel;
          } else if (val.relId == "") {
            val.Target = "#" + val.loc;
          }
          for (R = val.rfx.s.r; R <= val.rfx.e.r; ++R) for (C = val.rfx.s.c; C <= val.rfx.e.c; ++C) {
            if (opts.dense) {
              if (!s[R]) s[R] = [];
              if (!s[R][C]) s[R][C] = { t: "z", v: void 0 };
              s[R][C].l = val;
            } else {
              addr = encode_cell({ c: C, r: R });
              if (!s[addr]) s[addr] = { t: "z", v: void 0 };
              s[addr].l = val;
            }
          }
          break;
        case 426:
          if (!opts.cellFormula) break;
          arrayf.push(val);
          cell = opts.dense ? s[R][C] : s[encode_col(C) + rr];
          cell.f = stringify_formula(val[1], refguess, { r: row.r, c: C }, supbooks, opts);
          cell.F = encode_range(val[0]);
          break;
        case 427:
          if (!opts.cellFormula) break;
          sharedf[encode_cell(val[0].s)] = val[1];
          cell = opts.dense ? s[R][C] : s[encode_col(C) + rr];
          cell.f = stringify_formula(val[1], refguess, { r: row.r, c: C }, supbooks, opts);
          break;
        /* identical to 'ColInfo' in XLS */
        case 60:
          if (!opts.cellStyles) break;
          while (val.e >= val.s) {
            colinfo[val.e--] = { width: val.w / 256, hidden: !!(val.flags & 1), level: val.level };
            if (!seencol) {
              seencol = true;
              find_mdw_colw(val.w / 256);
            }
            process_col(colinfo[val.e + 1]);
          }
          break;
        case 161:
          s["!autofilter"] = { ref: encode_range(val) };
          break;
        case 476:
          s["!margins"] = val;
          break;
        case 147:
          if (!wb.Sheets[idx]) wb.Sheets[idx] = {};
          if (val.name) wb.Sheets[idx].CodeName = val.name;
          if (val.above || val.left) s["!outline"] = { above: val.above, left: val.left };
          break;
        case 137:
          if (!wb.Views) wb.Views = [{}];
          if (!wb.Views[0]) wb.Views[0] = {};
          if (val.RTL) wb.Views[0].RTL = true;
          break;
        case 485:
          break;
        case 64:
        /* 'BrtDVal' */
        case 1053:
          break;
        case 151:
          break;
        case 152:
        /* 'BrtSel' */
        case 175:
        /* 'BrtAFilterDateGroupItem' */
        case 644:
        /* 'BrtActiveX' */
        case 625:
        /* 'BrtBigName' */
        case 562:
        /* 'BrtBkHim' */
        case 396:
        /* 'BrtBrk' */
        case 1112:
        /* 'BrtCFIcon' */
        case 1146:
        /* 'BrtCFRuleExt' */
        case 471:
        /* 'BrtCFVO' */
        case 1050:
        /* 'BrtCFVO14' */
        case 649:
        /* 'BrtCellIgnoreEC' */
        case 1105:
        /* 'BrtCellIgnoreEC14' */
        case 589:
        /* 'BrtCellSmartTagProperty' */
        case 607:
        /* 'BrtCellWatch' */
        case 564:
        /* 'BrtColor' */
        case 1055:
        /* 'BrtColor14' */
        case 168:
        /* 'BrtColorFilter' */
        case 174:
        /* 'BrtCustomFilter' */
        case 1180:
        /* 'BrtCustomFilter14' */
        case 499:
        /* 'BrtDRef' */
        case 507:
        /* 'BrtDXF' */
        case 550:
        /* 'BrtDrawing' */
        case 171:
        /* 'BrtDynamicFilter' */
        case 167:
        /* 'BrtFilter' */
        case 1177:
        /* 'BrtFilter14' */
        case 169:
        /* 'BrtIconFilter' */
        case 1181:
        /* 'BrtIconFilter14' */
        case 551:
        /* 'BrtLegacyDrawing' */
        case 552:
        /* 'BrtLegacyDrawingHF' */
        case 661:
        /* 'BrtListPart' */
        case 639:
        /* 'BrtOleObject' */
        case 478:
        /* 'BrtPageSetup' */
        case 537:
        /* 'BrtPhoneticInfo' */
        case 477:
        /* 'BrtPrintOptions' */
        case 536:
        /* 'BrtRangeProtection' */
        case 1103:
        /* 'BrtRangeProtection14' */
        case 680:
        /* 'BrtRangeProtectionIso' */
        case 1104:
        /* 'BrtRangeProtectionIso14' */
        case 1024:
        /* 'BrtRwDescent' */
        case 663:
        /* 'BrtSheetCalcProp' */
        case 535:
        /* 'BrtSheetProtection' */
        case 678:
        /* 'BrtSheetProtectionIso' */
        case 504:
        /* 'BrtSlc' */
        case 1043:
        /* 'BrtSparkline' */
        case 428:
        /* 'BrtTable' */
        case 170:
        /* 'BrtTop10Filter' */
        case 3072:
        /* 'BrtUid' */
        case 50:
        /* 'BrtValueMeta' */
        case 2070:
        /* 'BrtWebExtension' */
        case 1045:
          break;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        case 37:
          state.push(RT);
          pass = true;
          break;
        case 38:
          state.pop();
          pass = false;
          break;
        default:
          if (RR.T) {
          } else if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    }, opts);
    delete opts.supbooks;
    delete opts["!row"];
    if (!s["!ref"] && (refguess.s.r < 2e6 || ref && (ref.e.r > 0 || ref.e.c > 0 || ref.s.r > 0 || ref.s.c > 0))) s["!ref"] = encode_range(ref || refguess);
    if (opts.sheetRows && s["!ref"]) {
      var tmpref = safe_decode_range(s["!ref"]);
      if (opts.sheetRows <= +tmpref.e.r) {
        tmpref.e.r = opts.sheetRows - 1;
        if (tmpref.e.r > refguess.e.r) tmpref.e.r = refguess.e.r;
        if (tmpref.e.r < tmpref.s.r) tmpref.s.r = tmpref.e.r;
        if (tmpref.e.c > refguess.e.c) tmpref.e.c = refguess.e.c;
        if (tmpref.e.c < tmpref.s.c) tmpref.s.c = tmpref.e.c;
        s["!fullref"] = s["!ref"];
        s["!ref"] = encode_range(tmpref);
      }
    }
    if (merges.length > 0) s["!merges"] = merges;
    if (colinfo.length > 0) s["!cols"] = colinfo;
    if (rowinfo.length > 0) s["!rows"] = rowinfo;
    return s;
  }
  function parse_Cache(data) {
    var col = [];
    var num = data.match(/^<c:numCache>/);
    var f;
    (data.match(/<c:pt idx="(\d*)">(.*?)<\/c:pt>/mg) || []).forEach(function(pt) {
      var q = pt.match(/<c:pt idx="(\d*?)"><c:v>(.*)<\/c:v><\/c:pt>/);
      if (!q) return;
      col[+q[1]] = num ? +q[2] : q[2];
    });
    var nf = unescapexml((data.match(/<c:formatCode>([\s\S]*?)<\/c:formatCode>/) || ["", "General"])[1]);
    (data.match(/<c:f>(.*?)<\/c:f>/mg) || []).forEach(function(F) {
      f = F.replace(/<.*?>/g, "");
    });
    return [col, nf, f];
  }
  function parse_chart(data, name, opts, rels, wb, csheet) {
    var cs = csheet || { "!type": "chart" };
    if (!data) return csheet;
    var C = 0, R = 0, col = "A";
    var refguess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
    (data.match(/<c:numCache>[\s\S]*?<\/c:numCache>/gm) || []).forEach(function(nc) {
      var cache = parse_Cache(nc);
      refguess.s.r = refguess.s.c = 0;
      refguess.e.c = C;
      col = encode_col(C);
      cache[0].forEach(function(n, i) {
        cs[col + encode_row(i)] = { t: "n", v: n, z: cache[1] };
        R = i;
      });
      if (refguess.e.r < R) refguess.e.r = R;
      ++C;
    });
    if (C > 0) cs["!ref"] = encode_range(refguess);
    return cs;
  }
  function parse_cs_xml(data, opts, idx, rels, wb) {
    if (!data) return data;
    if (!rels) rels = { "!id": {} };
    var s = { "!type": "chart", "!drawel": null, "!rel": "" };
    var m;
    var sheetPr = data.match(sheetprregex);
    if (sheetPr) parse_ws_xml_sheetpr(sheetPr[0], s, wb, idx);
    if (m = data.match(/drawing r:id="(.*?)"/)) s["!rel"] = m[1];
    if (rels["!id"][s["!rel"]]) s["!drawel"] = rels["!id"][s["!rel"]];
    return s;
  }
  function parse_BrtCsProp(data, length) {
    data.l += 10;
    var name = parse_XLWideString(data, length - 10);
    return { name };
  }
  function parse_cs_bin(data, opts, idx, rels, wb) {
    if (!data) return data;
    if (!rels) rels = { "!id": {} };
    var s = { "!type": "chart", "!drawel": null, "!rel": "" };
    var state = [];
    var pass = false;
    recordhopper(data, function cs_parse(val, R, RT) {
      switch (RT) {
        case 550:
          s["!rel"] = val;
          break;
        case 651:
          if (!wb.Sheets[idx]) wb.Sheets[idx] = {};
          if (val.name) wb.Sheets[idx].CodeName = val.name;
          break;
        case 562:
        /* 'BrtBkHim' */
        case 652:
        /* 'BrtCsPageSetup' */
        case 669:
        /* 'BrtCsProtection' */
        case 679:
        /* 'BrtCsProtectionIso' */
        case 551:
        /* 'BrtLegacyDrawing' */
        case 552:
        /* 'BrtLegacyDrawingHF' */
        case 476:
        /* 'BrtMargins' */
        case 3072:
          break;
        case 35:
          pass = true;
          break;
        case 36:
          pass = false;
          break;
        case 37:
          state.push(RT);
          break;
        case 38:
          state.pop();
          break;
        default:
          if (R.T > 0) state.push(RT);
          else if (R.T < 0) state.pop();
          else if (!pass || opts.WTF) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    }, opts);
    if (rels["!id"][s["!rel"]]) s["!drawel"] = rels["!id"][s["!rel"]];
    return s;
  }
  var WBPropsDef = [
    ["allowRefreshQuery", false, "bool"],
    ["autoCompressPictures", true, "bool"],
    ["backupFile", false, "bool"],
    ["checkCompatibility", false, "bool"],
    ["CodeName", ""],
    ["date1904", false, "bool"],
    ["defaultThemeVersion", 0, "int"],
    ["filterPrivacy", false, "bool"],
    ["hidePivotFieldList", false, "bool"],
    ["promptedSolutions", false, "bool"],
    ["publishItems", false, "bool"],
    ["refreshAllConnections", false, "bool"],
    ["saveExternalLinkValues", true, "bool"],
    ["showBorderUnselectedTables", true, "bool"],
    ["showInkAnnotation", true, "bool"],
    ["showObjects", "all"],
    ["showPivotChartFilter", false, "bool"],
    ["updateLinks", "userSet"]
  ];
  var WBViewDef = [
    ["activeTab", 0, "int"],
    ["autoFilterDateGrouping", true, "bool"],
    ["firstSheet", 0, "int"],
    ["minimized", false, "bool"],
    ["showHorizontalScroll", true, "bool"],
    ["showSheetTabs", true, "bool"],
    ["showVerticalScroll", true, "bool"],
    ["tabRatio", 600, "int"],
    ["visibility", "visible"]
    //window{Height,Width}, {x,y}Window
  ];
  var SheetDef = [
    //['state', 'visible']
  ];
  var CalcPrDef = [
    ["calcCompleted", "true"],
    ["calcMode", "auto"],
    ["calcOnSave", "true"],
    ["concurrentCalc", "true"],
    ["fullCalcOnLoad", "false"],
    ["fullPrecision", "true"],
    ["iterate", "false"],
    ["iterateCount", "100"],
    ["iterateDelta", "0.001"],
    ["refMode", "A1"]
  ];
  function push_defaults_array(target, defaults) {
    for (var j = 0; j != target.length; ++j) {
      var w = target[j];
      for (var i = 0; i != defaults.length; ++i) {
        var z = defaults[i];
        if (w[z[0]] == null) w[z[0]] = z[1];
        else switch (z[2]) {
          case "bool":
            if (typeof w[z[0]] == "string") w[z[0]] = parsexmlbool(w[z[0]]);
            break;
          case "int":
            if (typeof w[z[0]] == "string") w[z[0]] = parseInt(w[z[0]], 10);
            break;
        }
      }
    }
  }
  function push_defaults(target, defaults) {
    for (var i = 0; i != defaults.length; ++i) {
      var z = defaults[i];
      if (target[z[0]] == null) target[z[0]] = z[1];
      else switch (z[2]) {
        case "bool":
          if (typeof target[z[0]] == "string") target[z[0]] = parsexmlbool(target[z[0]]);
          break;
        case "int":
          if (typeof target[z[0]] == "string") target[z[0]] = parseInt(target[z[0]], 10);
          break;
      }
    }
  }
  function parse_wb_defaults(wb) {
    push_defaults(wb.WBProps, WBPropsDef);
    push_defaults(wb.CalcPr, CalcPrDef);
    push_defaults_array(wb.WBView, WBViewDef);
    push_defaults_array(wb.Sheets, SheetDef);
    _ssfopts.date1904 = parsexmlbool(wb.WBProps.date1904);
  }
  var badchars = /* @__PURE__ */ "][*?/\\".split("");
  function check_ws_name(n, safe) {
    if (n.length > 31) {
      if (safe) return false;
      throw new Error("Sheet names cannot exceed 31 chars");
    }
    var _good = true;
    badchars.forEach(function(c) {
      if (n.indexOf(c) == -1) return;
      if (!safe) throw new Error("Sheet name cannot contain : \\ / ? * [ ]");
      _good = false;
    });
    return _good;
  }
  var wbnsregex = /<\w+:workbook/;
  function parse_wb_xml(data, opts) {
    if (!data) throw new Error("Could not find file");
    var wb = (
      /*::(*/
      { AppVersion: {}, WBProps: {}, WBView: [], Sheets: [], CalcPr: {}, Names: [], xmlns: "" }
    );
    var pass = false, xmlns = "xmlns";
    var dname = {}, dnstart = 0;
    data.replace(tagregex, function xml_wb(x, idx) {
      var y = parsexmltag(x);
      switch (strip_ns(y[0])) {
        case "<?xml":
          break;
        /* 18.2.27 workbook CT_Workbook 1 */
        case "<workbook":
          if (x.match(wbnsregex)) xmlns = "xmlns" + x.match(/<(\w+):/)[1];
          wb.xmlns = y[xmlns];
          break;
        case "</workbook>":
          break;
        /* 18.2.13 fileVersion CT_FileVersion ? */
        case "<fileVersion":
          delete y[0];
          wb.AppVersion = y;
          break;
        case "<fileVersion/>":
        case "</fileVersion>":
          break;
        /* 18.2.12 fileSharing CT_FileSharing ? */
        case "<fileSharing":
          break;
        case "<fileSharing/>":
          break;
        /* 18.2.28 workbookPr CT_WorkbookPr ? */
        case "<workbookPr":
        case "<workbookPr/>":
          WBPropsDef.forEach(function(w) {
            if (y[w[0]] == null) return;
            switch (w[2]) {
              case "bool":
                wb.WBProps[w[0]] = parsexmlbool(y[w[0]]);
                break;
              case "int":
                wb.WBProps[w[0]] = parseInt(y[w[0]], 10);
                break;
              default:
                wb.WBProps[w[0]] = y[w[0]];
            }
          });
          if (y.codeName) wb.WBProps.CodeName = utf8read(y.codeName);
          break;
        case "</workbookPr>":
          break;
        /* 18.2.29 workbookProtection CT_WorkbookProtection ? */
        case "<workbookProtection":
          break;
        case "<workbookProtection/>":
          break;
        /* 18.2.1  bookViews CT_BookViews ? */
        case "<bookViews":
        case "<bookViews>":
        case "</bookViews>":
          break;
        /* 18.2.30   workbookView CT_BookView + */
        case "<workbookView":
        case "<workbookView/>":
          delete y[0];
          wb.WBView.push(y);
          break;
        case "</workbookView>":
          break;
        /* 18.2.20 sheets CT_Sheets 1 */
        case "<sheets":
        case "<sheets>":
        case "</sheets>":
          break;
        // aggregate sheet
        /* 18.2.19   sheet CT_Sheet + */
        case "<sheet":
          switch (y.state) {
            case "hidden":
              y.Hidden = 1;
              break;
            case "veryHidden":
              y.Hidden = 2;
              break;
            default:
              y.Hidden = 0;
          }
          delete y.state;
          y.name = unescapexml(utf8read(y.name));
          delete y[0];
          wb.Sheets.push(y);
          break;
        case "</sheet>":
          break;
        /* 18.2.15 functionGroups CT_FunctionGroups ? */
        case "<functionGroups":
        case "<functionGroups/>":
          break;
        /* 18.2.14   functionGroup CT_FunctionGroup + */
        case "<functionGroup":
          break;
        /* 18.2.9  externalReferences CT_ExternalReferences ? */
        case "<externalReferences":
        case "</externalReferences>":
        case "<externalReferences>":
          break;
        /* 18.2.8    externalReference CT_ExternalReference + */
        case "<externalReference":
          break;
        /* 18.2.6  definedNames CT_DefinedNames ? */
        case "<definedNames/>":
          break;
        case "<definedNames>":
        case "<definedNames":
          pass = true;
          break;
        case "</definedNames>":
          pass = false;
          break;
        /* 18.2.5    definedName CT_DefinedName + */
        case "<definedName":
          {
            dname = {};
            dname.Name = utf8read(y.name);
            if (y.comment) dname.Comment = y.comment;
            if (y.localSheetId) dname.Sheet = +y.localSheetId;
            if (parsexmlbool(y.hidden || "0")) dname.Hidden = true;
            dnstart = idx + x.length;
          }
          break;
        case "</definedName>":
          {
            dname.Ref = unescapexml(utf8read(data.slice(dnstart, idx)));
            wb.Names.push(dname);
          }
          break;
        case "<definedName/>":
          break;
        /* 18.2.2  calcPr CT_CalcPr ? */
        case "<calcPr":
          delete y[0];
          wb.CalcPr = y;
          break;
        case "<calcPr/>":
          delete y[0];
          wb.CalcPr = y;
          break;
        case "</calcPr>":
          break;
        /* 18.2.16 oleSize CT_OleSize ? (ref required) */
        case "<oleSize":
          break;
        /* 18.2.4  customWorkbookViews CT_CustomWorkbookViews ? */
        case "<customWorkbookViews>":
        case "</customWorkbookViews>":
        case "<customWorkbookViews":
          break;
        /* 18.2.3  customWorkbookView CT_CustomWorkbookView + */
        case "<customWorkbookView":
        case "</customWorkbookView>":
          break;
        /* 18.2.18 pivotCaches CT_PivotCaches ? */
        case "<pivotCaches>":
        case "</pivotCaches>":
        case "<pivotCaches":
          break;
        /* 18.2.17 pivotCache CT_PivotCache ? */
        case "<pivotCache":
          break;
        /* 18.2.21 smartTagPr CT_SmartTagPr ? */
        case "<smartTagPr":
        case "<smartTagPr/>":
          break;
        /* 18.2.23 smartTagTypes CT_SmartTagTypes ? */
        case "<smartTagTypes":
        case "<smartTagTypes>":
        case "</smartTagTypes>":
          break;
        /* 18.2.22 smartTagType CT_SmartTagType ? */
        case "<smartTagType":
          break;
        /* 18.2.24 webPublishing CT_WebPublishing ? */
        case "<webPublishing":
        case "<webPublishing/>":
          break;
        /* 18.2.11 fileRecoveryPr CT_FileRecoveryPr ? */
        case "<fileRecoveryPr":
        case "<fileRecoveryPr/>":
          break;
        /* 18.2.26 webPublishObjects CT_WebPublishObjects ? */
        case "<webPublishObjects>":
        case "<webPublishObjects":
        case "</webPublishObjects>":
          break;
        /* 18.2.25 webPublishObject CT_WebPublishObject ? */
        case "<webPublishObject":
          break;
        /* 18.2.10 extLst CT_ExtensionList ? */
        case "<extLst":
        case "<extLst>":
        case "</extLst>":
        case "<extLst/>":
          break;
        /* 18.2.7  ext CT_Extension + */
        case "<ext":
          pass = true;
          break;
        //TODO: check with versions of excel
        case "</ext>":
          pass = false;
          break;
        /* Others */
        case "<ArchID":
          break;
        case "<AlternateContent":
        case "<AlternateContent>":
          pass = true;
          break;
        case "</AlternateContent>":
          pass = false;
          break;
        /* TODO */
        case "<revisionPtr":
          break;
        default:
          if (!pass && opts.WTF) throw new Error("unrecognized " + y[0] + " in workbook");
      }
      return x;
    });
    if (XMLNS_main.indexOf(wb.xmlns) === -1) throw new Error("Unknown Namespace: " + wb.xmlns);
    parse_wb_defaults(wb);
    return wb;
  }
  function parse_BrtBundleSh(data, length) {
    var z = {};
    z.Hidden = data.read_shift(4);
    z.iTabID = data.read_shift(4);
    z.strRelID = parse_RelID(data, length - 8);
    z.name = parse_XLWideString(data);
    return z;
  }
  function parse_BrtWbProp(data, length) {
    var o = {};
    var flags = data.read_shift(4);
    o.defaultThemeVersion = data.read_shift(4);
    var strName = length > 8 ? parse_XLWideString(data) : "";
    if (strName.length > 0) o.CodeName = strName;
    o.autoCompressPictures = !!(flags & 65536);
    o.backupFile = !!(flags & 64);
    o.checkCompatibility = !!(flags & 4096);
    o.date1904 = !!(flags & 1);
    o.filterPrivacy = !!(flags & 8);
    o.hidePivotFieldList = !!(flags & 1024);
    o.promptedSolutions = !!(flags & 16);
    o.publishItems = !!(flags & 2048);
    o.refreshAllConnections = !!(flags & 262144);
    o.saveExternalLinkValues = !!(flags & 128);
    o.showBorderUnselectedTables = !!(flags & 4);
    o.showInkAnnotation = !!(flags & 32);
    o.showObjects = ["all", "placeholders", "none"][flags >> 13 & 3];
    o.showPivotChartFilter = !!(flags & 32768);
    o.updateLinks = ["userSet", "never", "always"][flags >> 8 & 3];
    return o;
  }
  function parse_BrtFRTArchID$(data, length) {
    var o = {};
    data.read_shift(4);
    o.ArchID = data.read_shift(4);
    data.l += length - 8;
    return o;
  }
  function parse_BrtName(data, length, opts) {
    var end = data.l + length;
    data.l += 4;
    data.l += 1;
    var itab = data.read_shift(4);
    var name = parse_XLNameWideString(data);
    var formula = parse_XLSBNameParsedFormula(data, 0, opts);
    var comment = parse_XLNullableWideString(data);
    data.l = end;
    var out = { Name: name, Ptg: formula };
    if (itab < 268435455) out.Sheet = itab;
    if (comment) out.Comment = comment;
    return out;
  }
  function parse_wb_bin(data, opts) {
    var wb = { AppVersion: {}, WBProps: {}, WBView: [], Sheets: [], CalcPr: {}, xmlns: "" };
    var state = [];
    var pass = false;
    if (!opts) opts = {};
    opts.biff = 12;
    var Names = [];
    var supbooks = [[]];
    supbooks.SheetNames = [];
    supbooks.XTI = [];
    XLSBRecordEnum[16] = { n: "BrtFRTArchID$", f: parse_BrtFRTArchID$ };
    recordhopper(data, function hopper_wb(val, R, RT) {
      switch (RT) {
        case 156:
          supbooks.SheetNames.push(val.name);
          wb.Sheets.push(val);
          break;
        case 153:
          wb.WBProps = val;
          break;
        case 39:
          if (val.Sheet != null) opts.SID = val.Sheet;
          val.Ref = stringify_formula(val.Ptg, null, null, supbooks, opts);
          delete opts.SID;
          delete val.Ptg;
          Names.push(val);
          break;
        case 1036:
          break;
        case 357:
        /* 'BrtSupSelf' */
        case 358:
        /* 'BrtSupSame' */
        case 355:
        /* 'BrtSupBookSrc' */
        case 667:
          if (!supbooks[0].length) supbooks[0] = [RT, val];
          else supbooks.push([RT, val]);
          supbooks[supbooks.length - 1].XTI = [];
          break;
        case 362:
          if (supbooks.length === 0) {
            supbooks[0] = [];
            supbooks[0].XTI = [];
          }
          supbooks[supbooks.length - 1].XTI = supbooks[supbooks.length - 1].XTI.concat(val);
          supbooks.XTI = supbooks.XTI.concat(val);
          break;
        case 361:
          break;
        case 2071:
        /* 'BrtAbsPath15' */
        case 158:
        /* 'BrtBookView' */
        case 143:
        /* 'BrtBeginBundleShs' */
        case 664:
        /* 'BrtBeginFnGroup' */
        case 353:
          break;
        /* case 'BrtModelTimeGroupingCalcCol' */
        case 3072:
        /* 'BrtUid' */
        case 3073:
        /* 'BrtRevisionPtr' */
        case 534:
        /* 'BrtBookProtection' */
        case 677:
        /* 'BrtBookProtectionIso' */
        case 157:
        /* 'BrtCalcProp' */
        case 610:
        /* 'BrtCrashRecErr' */
        case 2050:
        /* 'BrtDecoupledPivotCacheID' */
        case 155:
        /* 'BrtFileRecover' */
        case 548:
        /* 'BrtFileSharing' */
        case 676:
        /* 'BrtFileSharingIso' */
        case 128:
        /* 'BrtFileVersion' */
        case 665:
        /* 'BrtFnGroup' */
        case 2128:
        /* 'BrtModelRelationship' */
        case 2125:
        /* 'BrtModelTable' */
        case 549:
        /* 'BrtOleSize' */
        case 2053:
        /* 'BrtPivotTableRef' */
        case 596:
        /* 'BrtSmartTagType' */
        case 2076:
        /* 'BrtTableSlicerCacheID' */
        case 2075:
        /* 'BrtTableSlicerCacheIDs' */
        case 2082:
        /* 'BrtTimelineCachePivotCacheID' */
        case 397:
        /* 'BrtUserBookView' */
        case 154:
        /* 'BrtWbFactoid' */
        case 1117:
        /* 'BrtWbProp14' */
        case 553:
        /* 'BrtWebOpt' */
        case 2091:
          break;
        case 35:
          state.push(RT);
          pass = true;
          break;
        case 36:
          state.pop();
          pass = false;
          break;
        case 37:
          state.push(RT);
          pass = true;
          break;
        case 38:
          state.pop();
          pass = false;
          break;
        case 16:
          break;
        default:
          if (R.T) {
          } else if (!pass || opts.WTF && state[state.length - 1] != 37 && state[state.length - 1] != 35) throw new Error("Unexpected record 0x" + RT.toString(16));
      }
    }, opts);
    parse_wb_defaults(wb);
    wb.Names = Names;
    wb.supbooks = supbooks;
    return wb;
  }
  function parse_wb(data, name, opts) {
    if (name.slice(-4) === ".bin") return parse_wb_bin(data, opts);
    return parse_wb_xml(data, opts);
  }
  function parse_ws(data, name, idx, opts, rels, wb, themes, styles) {
    if (name.slice(-4) === ".bin") return parse_ws_bin(data, opts, idx, rels, wb, themes, styles);
    return parse_ws_xml(data, opts, idx, rels, wb, themes, styles);
  }
  function parse_cs(data, name, idx, opts, rels, wb, themes, styles) {
    if (name.slice(-4) === ".bin") return parse_cs_bin(data, opts, idx, rels, wb, themes, styles);
    return parse_cs_xml(data, opts, idx, rels, wb, themes, styles);
  }
  function parse_ms(data, name, idx, opts, rels, wb, themes, styles) {
    if (name.slice(-4) === ".bin") return parse_ms_bin(data, opts, idx, rels, wb, themes, styles);
    return parse_ms_xml(data, opts, idx, rels, wb, themes, styles);
  }
  function parse_ds(data, name, idx, opts, rels, wb, themes, styles) {
    if (name.slice(-4) === ".bin") return parse_ds_bin(data, opts, idx, rels, wb, themes, styles);
    return parse_ds_xml(data, opts, idx, rels, wb, themes, styles);
  }
  function parse_sty(data, name, themes, opts) {
    if (name.slice(-4) === ".bin") return parse_sty_bin(data, themes, opts);
    return parse_sty_xml(data, themes, opts);
  }
  function parse_theme(data, name, opts) {
    return parse_theme_xml(data, opts);
  }
  function parse_sst(data, name, opts) {
    if (name.slice(-4) === ".bin") return parse_sst_bin(data, opts);
    return parse_sst_xml(data, opts);
  }
  function parse_cmnt(data, name, opts) {
    if (name.slice(-4) === ".bin") return parse_comments_bin(data, opts);
    return parse_comments_xml(data, opts);
  }
  function parse_cc(data, name, opts) {
    if (name.slice(-4) === ".bin") return parse_cc_bin(data, name, opts);
    return parse_cc_xml(data, name, opts);
  }
  function parse_xlink(data, rel, name, opts) {
    if (name.slice(-4) === ".bin") return parse_xlink_bin(data, rel, name, opts);
    return parse_xlink_xml(data, rel, name, opts);
  }
  function parse_xlmeta(data, name, opts) {
    if (name.slice(-4) === ".bin") return parse_xlmeta_bin(data, name, opts);
    return parse_xlmeta_xml(data, name, opts);
  }
  var attregexg2 = /([\w:]+)=((?:")([^"]*)(?:")|(?:')([^']*)(?:'))/g;
  var attregex2 = /([\w:]+)=((?:")(?:[^"]*)(?:")|(?:')(?:[^']*)(?:'))/;
  function xlml_parsexmltag(tag, skip_root) {
    var words = tag.split(/\s+/);
    var z = [];
    if (!skip_root) z[0] = words[0];
    if (words.length === 1) return z;
    var m = tag.match(attregexg2), y, j, w, i;
    if (m) for (i = 0; i != m.length; ++i) {
      y = m[i].match(attregex2);
      if ((j = y[1].indexOf(":")) === -1) z[y[1]] = y[2].slice(1, y[2].length - 1);
      else {
        if (y[1].slice(0, 6) === "xmlns:") w = "xmlns" + y[1].slice(6);
        else w = y[1].slice(j + 1);
        z[w] = y[2].slice(1, y[2].length - 1);
      }
    }
    return z;
  }
  function xlml_parsexmltagobj(tag) {
    var words = tag.split(/\s+/);
    var z = {};
    if (words.length === 1) return z;
    var m = tag.match(attregexg2), y, j, w, i;
    if (m) for (i = 0; i != m.length; ++i) {
      y = m[i].match(attregex2);
      if ((j = y[1].indexOf(":")) === -1) z[y[1]] = y[2].slice(1, y[2].length - 1);
      else {
        if (y[1].slice(0, 6) === "xmlns:") w = "xmlns" + y[1].slice(6);
        else w = y[1].slice(j + 1);
        z[w] = y[2].slice(1, y[2].length - 1);
      }
    }
    return z;
  }
  var XLMLFormatMap;
  function xlml_format(format, value) {
    var fmt = XLMLFormatMap[format] || unescapexml(format);
    if (fmt === "General") return SSF_general(value);
    return SSF_format(fmt, value);
  }
  function xlml_set_custprop(Custprops, key, cp, val) {
    var oval = val;
    switch ((cp[0].match(/dt:dt="([\w.]+)"/) || ["", ""])[1]) {
      case "boolean":
        oval = parsexmlbool(val);
        break;
      case "i2":
      case "int":
        oval = parseInt(val, 10);
        break;
      case "r4":
      case "float":
        oval = parseFloat(val);
        break;
      case "date":
      case "dateTime.tz":
        oval = parseDate(val);
        break;
      case "i8":
      case "string":
      case "fixed":
      case "uuid":
      case "bin.base64":
        break;
      default:
        throw new Error("bad custprop:" + cp[0]);
    }
    Custprops[unescapexml(key)] = oval;
  }
  function safe_format_xlml(cell, nf, o) {
    if (cell.t === "z") return;
    if (!o || o.cellText !== false) try {
      if (cell.t === "e") {
        cell.w = cell.w || BErr[cell.v];
      } else if (nf === "General") {
        if (cell.t === "n") {
          if ((cell.v | 0) === cell.v) cell.w = cell.v.toString(10);
          else cell.w = SSF_general_num(cell.v);
        } else cell.w = SSF_general(cell.v);
      } else cell.w = xlml_format(nf || "General", cell.v);
    } catch (e) {
      if (o.WTF) throw e;
    }
    try {
      var z = XLMLFormatMap[nf] || nf || "General";
      if (o.cellNF) cell.z = z;
      if (o.cellDates && cell.t == "n" && fmt_is_date(z)) {
        var _d = SSF_parse_date_code(cell.v);
        if (_d) {
          cell.t = "d";
          cell.v = new Date(_d.y, _d.m - 1, _d.d, _d.H, _d.M, _d.S, _d.u);
        }
      }
    } catch (e) {
      if (o.WTF) throw e;
    }
  }
  function process_style_xlml(styles, stag, opts) {
    if (opts.cellStyles) {
      if (stag.Interior) {
        var I2 = stag.Interior;
        if (I2.Pattern) I2.patternType = XLMLPatternTypeMap[I2.Pattern] || I2.Pattern;
      }
    }
    styles[stag.ID] = stag;
  }
  function parse_xlml_data(xml, ss, data, cell, base, styles, csty, row, arrayf, o) {
    var nf = "General", sid = cell.StyleID, S2 = {};
    o = o || {};
    var interiors = [];
    var i = 0;
    if (sid === void 0 && row) sid = row.StyleID;
    if (sid === void 0 && csty) sid = csty.StyleID;
    while (styles[sid] !== void 0) {
      if (styles[sid].nf) nf = styles[sid].nf;
      if (styles[sid].Interior) interiors.push(styles[sid].Interior);
      if (!styles[sid].Parent) break;
      sid = styles[sid].Parent;
    }
    switch (data.Type) {
      case "Boolean":
        cell.t = "b";
        cell.v = parsexmlbool(xml);
        break;
      case "String":
        cell.t = "s";
        cell.r = xlml_fixstr(unescapexml(xml));
        cell.v = xml.indexOf("<") > -1 ? unescapexml(ss || xml).replace(/<.*?>/g, "") : cell.r;
        break;
      case "DateTime":
        if (xml.slice(-1) != "Z") xml += "Z";
        cell.v = (parseDate(xml) - new Date(Date.UTC(1899, 11, 30))) / (24 * 60 * 60 * 1e3);
        if (cell.v !== cell.v) cell.v = unescapexml(xml);
        else if (cell.v < 60) cell.v = cell.v - 1;
        if (!nf || nf == "General") nf = "yyyy-mm-dd";
      /* falls through */
      case "Number":
        if (cell.v === void 0) cell.v = +xml;
        if (!cell.t) cell.t = "n";
        break;
      case "Error":
        cell.t = "e";
        cell.v = RBErr[xml];
        if (o.cellText !== false) cell.w = xml;
        break;
      default:
        if (xml == "" && ss == "") {
          cell.t = "z";
        } else {
          cell.t = "s";
          cell.v = xlml_fixstr(ss || xml);
        }
        break;
    }
    safe_format_xlml(cell, nf, o);
    if (o.cellFormula !== false) {
      if (cell.Formula) {
        var fstr = unescapexml(cell.Formula);
        if (fstr.charCodeAt(0) == 61) fstr = fstr.slice(1);
        cell.f = rc_to_a1(fstr, base);
        delete cell.Formula;
        if (cell.ArrayRange == "RC") cell.F = rc_to_a1("RC:RC", base);
        else if (cell.ArrayRange) {
          cell.F = rc_to_a1(cell.ArrayRange, base);
          arrayf.push([safe_decode_range(cell.F), cell.F]);
        }
      } else {
        for (i = 0; i < arrayf.length; ++i)
          if (base.r >= arrayf[i][0].s.r && base.r <= arrayf[i][0].e.r) {
            if (base.c >= arrayf[i][0].s.c && base.c <= arrayf[i][0].e.c)
              cell.F = arrayf[i][1];
          }
      }
    }
    if (o.cellStyles) {
      interiors.forEach(function(x) {
        if (!S2.patternType && x.patternType) S2.patternType = x.patternType;
      });
      cell.s = S2;
    }
    if (cell.StyleID !== void 0) cell.ixfe = cell.StyleID;
  }
  function xlml_clean_comment(comment) {
    comment.t = comment.v || "";
    comment.t = comment.t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    comment.v = comment.w = comment.ixfe = void 0;
  }
  function parse_xlml_xml(d, _opts) {
    var opts = _opts || {};
    make_ssf();
    var str = debom(xlml_normalize(d));
    if (opts.type == "binary" || opts.type == "array" || opts.type == "base64") {
      if (typeof $cptable !== "undefined") str = $cptable.utils.decode(65001, char_codes(str));
      else str = utf8read(str);
    }
    var opening = str.slice(0, 1024).toLowerCase(), ishtml = false;
    opening = opening.replace(/".*?"/g, "");
    if ((opening.indexOf(">") & 1023) > Math.min(opening.indexOf(",") & 1023, opening.indexOf(";") & 1023)) {
      var _o = dup(opts);
      _o.type = "string";
      return PRN.to_workbook(str, _o);
    }
    if (opening.indexOf("<?xml") == -1) ["html", "table", "head", "meta", "script", "style", "div"].forEach(function(tag) {
      if (opening.indexOf("<" + tag) >= 0) ishtml = true;
    });
    if (ishtml) return html_to_workbook(str, opts);
    XLMLFormatMap = {
      "General Number": "General",
      "General Date": table_fmt[22],
      "Long Date": "dddd, mmmm dd, yyyy",
      "Medium Date": table_fmt[15],
      "Short Date": table_fmt[14],
      "Long Time": table_fmt[19],
      "Medium Time": table_fmt[18],
      "Short Time": table_fmt[20],
      "Currency": '"$"#,##0.00_);[Red]\\("$"#,##0.00\\)',
      "Fixed": table_fmt[2],
      "Standard": table_fmt[4],
      "Percent": table_fmt[10],
      "Scientific": table_fmt[11],
      "Yes/No": '"Yes";"Yes";"No";@',
      "True/False": '"True";"True";"False";@',
      "On/Off": '"Yes";"Yes";"No";@'
    };
    var Rn;
    var state = [], tmp;
    if (DENSE != null && opts.dense == null) opts.dense = DENSE;
    var sheets = {}, sheetnames = [], cursheet = opts.dense ? [] : {}, sheetname = "";
    var cell = {}, row = {};
    var dtag = xlml_parsexmltag('<Data ss:Type="String">'), didx = 0;
    var c = 0, r = 0;
    var refguess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
    var styles = {}, stag = {};
    var ss = "", fidx = 0;
    var merges = [];
    var Props = {}, Custprops = {}, pidx = 0, cp = [];
    var comments = [], comment = {};
    var cstys = [], csty, seencol = false;
    var arrayf = [];
    var rowinfo = [], rowobj = {}, cc = 0, rr = 0;
    var Workbook = { Sheets: [], WBProps: { date1904: false } }, wsprops = {};
    xlmlregex.lastIndex = 0;
    str = str.replace(/<!--([\s\S]*?)-->/mg, "");
    var raw_Rn3 = "";
    while (Rn = xlmlregex.exec(str)) switch (Rn[3] = (raw_Rn3 = Rn[3]).toLowerCase()) {
      case "data":
        if (raw_Rn3 == "data") {
          if (Rn[1] === "/") {
            if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
          } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") state.push([Rn[3], true]);
          break;
        }
        if (state[state.length - 1][1]) break;
        if (Rn[1] === "/") parse_xlml_data(str.slice(didx, Rn.index), ss, dtag, state[state.length - 1][0] == /*"Comment"*/
        "comment" ? comment : cell, { c, r }, styles, cstys[c], row, arrayf, opts);
        else {
          ss = "";
          dtag = xlml_parsexmltag(Rn[0]);
          didx = Rn.index + Rn[0].length;
        }
        break;
      case "cell":
        if (Rn[1] === "/") {
          if (comments.length > 0) cell.c = comments;
          if ((!opts.sheetRows || opts.sheetRows > r) && cell.v !== void 0) {
            if (opts.dense) {
              if (!cursheet[r]) cursheet[r] = [];
              cursheet[r][c] = cell;
            } else cursheet[encode_col(c) + encode_row(r)] = cell;
          }
          if (cell.HRef) {
            cell.l = { Target: unescapexml(cell.HRef) };
            if (cell.HRefScreenTip) cell.l.Tooltip = cell.HRefScreenTip;
            delete cell.HRef;
            delete cell.HRefScreenTip;
          }
          if (cell.MergeAcross || cell.MergeDown) {
            cc = c + (parseInt(cell.MergeAcross, 10) | 0);
            rr = r + (parseInt(cell.MergeDown, 10) | 0);
            merges.push({ s: { c, r }, e: { c: cc, r: rr } });
          }
          if (!opts.sheetStubs) {
            if (cell.MergeAcross) c = cc + 1;
            else ++c;
          } else if (cell.MergeAcross || cell.MergeDown) {
            for (var cma = c; cma <= cc; ++cma) {
              for (var cmd = r; cmd <= rr; ++cmd) {
                if (cma > c || cmd > r) {
                  if (opts.dense) {
                    if (!cursheet[cmd]) cursheet[cmd] = [];
                    cursheet[cmd][cma] = { t: "z" };
                  } else cursheet[encode_col(cma) + encode_row(cmd)] = { t: "z" };
                }
              }
            }
            c = cc + 1;
          } else ++c;
        } else {
          cell = xlml_parsexmltagobj(Rn[0]);
          if (cell.Index) c = +cell.Index - 1;
          if (c < refguess.s.c) refguess.s.c = c;
          if (c > refguess.e.c) refguess.e.c = c;
          if (Rn[0].slice(-2) === "/>") ++c;
          comments = [];
        }
        break;
      case "row":
        if (Rn[1] === "/" || Rn[0].slice(-2) === "/>") {
          if (r < refguess.s.r) refguess.s.r = r;
          if (r > refguess.e.r) refguess.e.r = r;
          if (Rn[0].slice(-2) === "/>") {
            row = xlml_parsexmltag(Rn[0]);
            if (row.Index) r = +row.Index - 1;
          }
          c = 0;
          ++r;
        } else {
          row = xlml_parsexmltag(Rn[0]);
          if (row.Index) r = +row.Index - 1;
          rowobj = {};
          if (row.AutoFitHeight == "0" || row.Height) {
            rowobj.hpx = parseInt(row.Height, 10);
            rowobj.hpt = px2pt(rowobj.hpx);
            rowinfo[r] = rowobj;
          }
          if (row.Hidden == "1") {
            rowobj.hidden = true;
            rowinfo[r] = rowobj;
          }
        }
        break;
      case "worksheet":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
          sheetnames.push(sheetname);
          if (refguess.s.r <= refguess.e.r && refguess.s.c <= refguess.e.c) {
            cursheet["!ref"] = encode_range(refguess);
            if (opts.sheetRows && opts.sheetRows <= refguess.e.r) {
              cursheet["!fullref"] = cursheet["!ref"];
              refguess.e.r = opts.sheetRows - 1;
              cursheet["!ref"] = encode_range(refguess);
            }
          }
          if (merges.length) cursheet["!merges"] = merges;
          if (cstys.length > 0) cursheet["!cols"] = cstys;
          if (rowinfo.length > 0) cursheet["!rows"] = rowinfo;
          sheets[sheetname] = cursheet;
        } else {
          refguess = { s: { r: 2e6, c: 2e6 }, e: { r: 0, c: 0 } };
          r = c = 0;
          state.push([Rn[3], false]);
          tmp = xlml_parsexmltag(Rn[0]);
          sheetname = unescapexml(tmp.Name);
          cursheet = opts.dense ? [] : {};
          merges = [];
          arrayf = [];
          rowinfo = [];
          wsprops = { name: sheetname, Hidden: 0 };
          Workbook.Sheets.push(wsprops);
        }
        break;
      case "table":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
        } else if (Rn[0].slice(-2) == "/>") break;
        else {
          state.push([Rn[3], false]);
          cstys = [];
          seencol = false;
        }
        break;
      case "style":
        if (Rn[1] === "/") process_style_xlml(styles, stag, opts);
        else stag = xlml_parsexmltag(Rn[0]);
        break;
      case "numberformat":
        stag.nf = unescapexml(xlml_parsexmltag(Rn[0]).Format || "General");
        if (XLMLFormatMap[stag.nf]) stag.nf = XLMLFormatMap[stag.nf];
        for (var ssfidx = 0; ssfidx != 392; ++ssfidx) if (table_fmt[ssfidx] == stag.nf) break;
        if (ssfidx == 392) {
          for (ssfidx = 57; ssfidx != 392; ++ssfidx) if (table_fmt[ssfidx] == null) {
            SSF_load(stag.nf, ssfidx);
            break;
          }
        }
        break;
      case "column":
        if (state[state.length - 1][0] !== /*'Table'*/
        "table") break;
        csty = xlml_parsexmltag(Rn[0]);
        if (csty.Hidden) {
          csty.hidden = true;
          delete csty.Hidden;
        }
        if (csty.Width) csty.wpx = parseInt(csty.Width, 10);
        if (!seencol && csty.wpx > 10) {
          seencol = true;
          MDW = DEF_MDW;
          for (var _col = 0; _col < cstys.length; ++_col) if (cstys[_col]) process_col(cstys[_col]);
        }
        if (seencol) process_col(csty);
        cstys[csty.Index - 1 || cstys.length] = csty;
        for (var i = 0; i < +csty.Span; ++i) cstys[cstys.length] = dup(csty);
        break;
      case "namedrange":
        if (Rn[1] === "/") break;
        if (!Workbook.Names) Workbook.Names = [];
        var _NamedRange = parsexmltag(Rn[0]);
        var _DefinedName = {
          Name: _NamedRange.Name,
          Ref: rc_to_a1(_NamedRange.RefersTo.slice(1), { r: 0, c: 0 })
        };
        if (Workbook.Sheets.length > 0) _DefinedName.Sheet = Workbook.Sheets.length - 1;
        Workbook.Names.push(_DefinedName);
        break;
      case "namedcell":
        break;
      case "b":
        break;
      case "i":
        break;
      case "u":
        break;
      case "s":
        break;
      case "em":
        break;
      case "h2":
        break;
      case "h3":
        break;
      case "sub":
        break;
      case "sup":
        break;
      case "span":
        break;
      case "alignment":
        break;
      case "borders":
        break;
      case "border":
        break;
      case "font":
        if (Rn[0].slice(-2) === "/>") break;
        else if (Rn[1] === "/") ss += str.slice(fidx, Rn.index);
        else fidx = Rn.index + Rn[0].length;
        break;
      case "interior":
        if (!opts.cellStyles) break;
        stag.Interior = xlml_parsexmltag(Rn[0]);
        break;
      case "protection":
        break;
      case "author":
      case "title":
      case "description":
      case "created":
      case "keywords":
      case "subject":
      case "category":
      case "company":
      case "lastauthor":
      case "lastsaved":
      case "lastprinted":
      case "version":
      case "revision":
      case "totaltime":
      case "hyperlinkbase":
      case "manager":
      case "contentstatus":
      case "identifier":
      case "language":
      case "appname":
        if (Rn[0].slice(-2) === "/>") break;
        else if (Rn[1] === "/") xlml_set_prop(Props, raw_Rn3, str.slice(pidx, Rn.index));
        else pidx = Rn.index + Rn[0].length;
        break;
      case "paragraphs":
        break;
      case "styles":
      case "workbook":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
        } else state.push([Rn[3], false]);
        break;
      case "comment":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
          xlml_clean_comment(comment);
          comments.push(comment);
        } else {
          state.push([Rn[3], false]);
          tmp = xlml_parsexmltag(Rn[0]);
          comment = { a: tmp.Author };
        }
        break;
      case "autofilter":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") {
          var AutoFilter = xlml_parsexmltag(Rn[0]);
          cursheet["!autofilter"] = { ref: rc_to_a1(AutoFilter.Range).replace(/\$/g, "") };
          state.push([Rn[3], true]);
        }
        break;
      case "name":
        break;
      case "datavalidation":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
        } else {
          if (Rn[0].charAt(Rn[0].length - 2) !== "/") state.push([Rn[3], true]);
        }
        break;
      case "pixelsperinch":
        break;
      case "componentoptions":
      case "documentproperties":
      case "customdocumentproperties":
      case "officedocumentsettings":
      case "pivottable":
      case "pivotcache":
      case "names":
      case "mapinfo":
      case "pagebreaks":
      case "querytable":
      case "sorting":
      case "schema":
      //case 'data' /*case 'data'*/:
      case "conditionalformatting":
      case "smarttagtype":
      case "smarttags":
      case "excelworkbook":
      case "workbookoptions":
      case "worksheetoptions":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw new Error("Bad state: " + tmp.join("|"));
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") state.push([Rn[3], true]);
        break;
      case "null":
        break;
      default:
        if (state.length == 0 && Rn[3] == "document") return parse_fods(str, opts);
        if (state.length == 0 && Rn[3] == "uof") return parse_fods(str, opts);
        var seen = true;
        switch (state[state.length - 1][0]) {
          /* OfficeDocumentSettings */
          case "officedocumentsettings":
            switch (Rn[3]) {
              case "allowpng":
                break;
              case "removepersonalinformation":
                break;
              case "downloadcomponents":
                break;
              case "locationofcomponents":
                break;
              case "colors":
                break;
              case "color":
                break;
              case "index":
                break;
              case "rgb":
                break;
              case "targetscreensize":
                break;
              case "readonlyrecommended":
                break;
              default:
                seen = false;
            }
            break;
          /* ComponentOptions */
          case "componentoptions":
            switch (Rn[3]) {
              case "toolbar":
                break;
              case "hideofficelogo":
                break;
              case "spreadsheetautofit":
                break;
              case "label":
                break;
              case "caption":
                break;
              case "maxheight":
                break;
              case "maxwidth":
                break;
              case "nextsheetnumber":
                break;
              default:
                seen = false;
            }
            break;
          /* ExcelWorkbook */
          case "excelworkbook":
            switch (Rn[3]) {
              case "date1904":
                Workbook.WBProps.date1904 = true;
                break;
              case "windowheight":
                break;
              case "windowwidth":
                break;
              case "windowtopx":
                break;
              case "windowtopy":
                break;
              case "tabratio":
                break;
              case "protectstructure":
                break;
              case "protectwindow":
                break;
              case "protectwindows":
                break;
              case "activesheet":
                break;
              case "displayinknotes":
                break;
              case "firstvisiblesheet":
                break;
              case "supbook":
                break;
              case "sheetname":
                break;
              case "sheetindex":
                break;
              case "sheetindexfirst":
                break;
              case "sheetindexlast":
                break;
              case "dll":
                break;
              case "acceptlabelsinformulas":
                break;
              case "donotsavelinkvalues":
                break;
              case "iteration":
                break;
              case "maxiterations":
                break;
              case "maxchange":
                break;
              case "path":
                break;
              case "xct":
                break;
              case "count":
                break;
              case "selectedsheets":
                break;
              case "calculation":
                break;
              case "uncalced":
                break;
              case "startupprompt":
                break;
              case "crn":
                break;
              case "externname":
                break;
              case "formula":
                break;
              case "colfirst":
                break;
              case "collast":
                break;
              case "wantadvise":
                break;
              case "boolean":
                break;
              case "error":
                break;
              case "text":
                break;
              case "ole":
                break;
              case "noautorecover":
                break;
              case "publishobjects":
                break;
              case "donotcalculatebeforesave":
                break;
              case "number":
                break;
              case "refmoder1c1":
                break;
              case "embedsavesmarttags":
                break;
              default:
                seen = false;
            }
            break;
          /* WorkbookOptions */
          case "workbookoptions":
            switch (Rn[3]) {
              case "owcversion":
                break;
              case "height":
                break;
              case "width":
                break;
              default:
                seen = false;
            }
            break;
          /* WorksheetOptions */
          case "worksheetoptions":
            switch (Rn[3]) {
              case "visible":
                if (Rn[0].slice(-2) === "/>") {
                } else if (Rn[1] === "/") switch (str.slice(pidx, Rn.index)) {
                  case "SheetHidden":
                    wsprops.Hidden = 1;
                    break;
                  case "SheetVeryHidden":
                    wsprops.Hidden = 2;
                    break;
                }
                else pidx = Rn.index + Rn[0].length;
                break;
              case "header":
                if (!cursheet["!margins"]) default_margins(cursheet["!margins"] = {}, "xlml");
                if (!isNaN(+parsexmltag(Rn[0]).Margin)) cursheet["!margins"].header = +parsexmltag(Rn[0]).Margin;
                break;
              case "footer":
                if (!cursheet["!margins"]) default_margins(cursheet["!margins"] = {}, "xlml");
                if (!isNaN(+parsexmltag(Rn[0]).Margin)) cursheet["!margins"].footer = +parsexmltag(Rn[0]).Margin;
                break;
              case "pagemargins":
                var pagemargins = parsexmltag(Rn[0]);
                if (!cursheet["!margins"]) default_margins(cursheet["!margins"] = {}, "xlml");
                if (!isNaN(+pagemargins.Top)) cursheet["!margins"].top = +pagemargins.Top;
                if (!isNaN(+pagemargins.Left)) cursheet["!margins"].left = +pagemargins.Left;
                if (!isNaN(+pagemargins.Right)) cursheet["!margins"].right = +pagemargins.Right;
                if (!isNaN(+pagemargins.Bottom)) cursheet["!margins"].bottom = +pagemargins.Bottom;
                break;
              case "displayrighttoleft":
                if (!Workbook.Views) Workbook.Views = [];
                if (!Workbook.Views[0]) Workbook.Views[0] = {};
                Workbook.Views[0].RTL = true;
                break;
              case "freezepanes":
                break;
              case "frozennosplit":
                break;
              case "splithorizontal":
              case "splitvertical":
                break;
              case "donotdisplaygridlines":
                break;
              case "activerow":
                break;
              case "activecol":
                break;
              case "toprowbottompane":
                break;
              case "leftcolumnrightpane":
                break;
              case "unsynced":
                break;
              case "print":
                break;
              case "printerrors":
                break;
              case "panes":
                break;
              case "scale":
                break;
              case "pane":
                break;
              case "number":
                break;
              case "layout":
                break;
              case "pagesetup":
                break;
              case "selected":
                break;
              case "protectobjects":
                break;
              case "enableselection":
                break;
              case "protectscenarios":
                break;
              case "validprinterinfo":
                break;
              case "horizontalresolution":
                break;
              case "verticalresolution":
                break;
              case "numberofcopies":
                break;
              case "activepane":
                break;
              case "toprowvisible":
                break;
              case "leftcolumnvisible":
                break;
              case "fittopage":
                break;
              case "rangeselection":
                break;
              case "papersizeindex":
                break;
              case "pagelayoutzoom":
                break;
              case "pagebreakzoom":
                break;
              case "filteron":
                break;
              case "fitwidth":
                break;
              case "fitheight":
                break;
              case "commentslayout":
                break;
              case "zoom":
                break;
              case "lefttoright":
                break;
              case "gridlines":
                break;
              case "allowsort":
                break;
              case "allowfilter":
                break;
              case "allowinsertrows":
                break;
              case "allowdeleterows":
                break;
              case "allowinsertcols":
                break;
              case "allowdeletecols":
                break;
              case "allowinserthyperlinks":
                break;
              case "allowformatcells":
                break;
              case "allowsizecols":
                break;
              case "allowsizerows":
                break;
              case "nosummaryrowsbelowdetail":
                if (!cursheet["!outline"]) cursheet["!outline"] = {};
                cursheet["!outline"].above = true;
                break;
              case "tabcolorindex":
                break;
              case "donotdisplayheadings":
                break;
              case "showpagelayoutzoom":
                break;
              case "nosummarycolumnsrightdetail":
                if (!cursheet["!outline"]) cursheet["!outline"] = {};
                cursheet["!outline"].left = true;
                break;
              case "blackandwhite":
                break;
              case "donotdisplayzeros":
                break;
              case "displaypagebreak":
                break;
              case "rowcolheadings":
                break;
              case "donotdisplayoutline":
                break;
              case "noorientation":
                break;
              case "allowusepivottables":
                break;
              case "zeroheight":
                break;
              case "viewablerange":
                break;
              case "selection":
                break;
              case "protectcontents":
                break;
              default:
                seen = false;
            }
            break;
          /* PivotTable */
          case "pivottable":
          case "pivotcache":
            switch (Rn[3]) {
              case "immediateitemsondrop":
                break;
              case "showpagemultipleitemlabel":
                break;
              case "compactrowindent":
                break;
              case "location":
                break;
              case "pivotfield":
                break;
              case "orientation":
                break;
              case "layoutform":
                break;
              case "layoutsubtotallocation":
                break;
              case "layoutcompactrow":
                break;
              case "position":
                break;
              case "pivotitem":
                break;
              case "datatype":
                break;
              case "datafield":
                break;
              case "sourcename":
                break;
              case "parentfield":
                break;
              case "ptlineitems":
                break;
              case "ptlineitem":
                break;
              case "countofsameitems":
                break;
              case "item":
                break;
              case "itemtype":
                break;
              case "ptsource":
                break;
              case "cacheindex":
                break;
              case "consolidationreference":
                break;
              case "filename":
                break;
              case "reference":
                break;
              case "nocolumngrand":
                break;
              case "norowgrand":
                break;
              case "blanklineafteritems":
                break;
              case "hidden":
                break;
              case "subtotal":
                break;
              case "basefield":
                break;
              case "mapchilditems":
                break;
              case "function":
                break;
              case "refreshonfileopen":
                break;
              case "printsettitles":
                break;
              case "mergelabels":
                break;
              case "defaultversion":
                break;
              case "refreshname":
                break;
              case "refreshdate":
                break;
              case "refreshdatecopy":
                break;
              case "versionlastrefresh":
                break;
              case "versionlastupdate":
                break;
              case "versionupdateablemin":
                break;
              case "versionrefreshablemin":
                break;
              case "calculation":
                break;
              default:
                seen = false;
            }
            break;
          /* PageBreaks */
          case "pagebreaks":
            switch (Rn[3]) {
              case "colbreaks":
                break;
              case "colbreak":
                break;
              case "rowbreaks":
                break;
              case "rowbreak":
                break;
              case "colstart":
                break;
              case "colend":
                break;
              case "rowend":
                break;
              default:
                seen = false;
            }
            break;
          /* AutoFilter */
          case "autofilter":
            switch (Rn[3]) {
              case "autofiltercolumn":
                break;
              case "autofiltercondition":
                break;
              case "autofilterand":
                break;
              case "autofilteror":
                break;
              default:
                seen = false;
            }
            break;
          /* QueryTable */
          case "querytable":
            switch (Rn[3]) {
              case "id":
                break;
              case "autoformatfont":
                break;
              case "autoformatpattern":
                break;
              case "querysource":
                break;
              case "querytype":
                break;
              case "enableredirections":
                break;
              case "refreshedinxl9":
                break;
              case "urlstring":
                break;
              case "htmltables":
                break;
              case "connection":
                break;
              case "commandtext":
                break;
              case "refreshinfo":
                break;
              case "notitles":
                break;
              case "nextid":
                break;
              case "columninfo":
                break;
              case "overwritecells":
                break;
              case "donotpromptforfile":
                break;
              case "textwizardsettings":
                break;
              case "source":
                break;
              case "number":
                break;
              case "decimal":
                break;
              case "thousandseparator":
                break;
              case "trailingminusnumbers":
                break;
              case "formatsettings":
                break;
              case "fieldtype":
                break;
              case "delimiters":
                break;
              case "tab":
                break;
              case "comma":
                break;
              case "autoformatname":
                break;
              case "versionlastedit":
                break;
              case "versionlastrefresh":
                break;
              default:
                seen = false;
            }
            break;
          case "datavalidation":
            switch (Rn[3]) {
              case "range":
                break;
              case "type":
                break;
              case "min":
                break;
              case "max":
                break;
              case "sort":
                break;
              case "descending":
                break;
              case "order":
                break;
              case "casesensitive":
                break;
              case "value":
                break;
              case "errorstyle":
                break;
              case "errormessage":
                break;
              case "errortitle":
                break;
              case "inputmessage":
                break;
              case "inputtitle":
                break;
              case "combohide":
                break;
              case "inputhide":
                break;
              case "condition":
                break;
              case "qualifier":
                break;
              case "useblank":
                break;
              case "value1":
                break;
              case "value2":
                break;
              case "format":
                break;
              case "cellrangelist":
                break;
              default:
                seen = false;
            }
            break;
          case "sorting":
          case "conditionalformatting":
            switch (Rn[3]) {
              case "range":
                break;
              case "type":
                break;
              case "min":
                break;
              case "max":
                break;
              case "sort":
                break;
              case "descending":
                break;
              case "order":
                break;
              case "casesensitive":
                break;
              case "value":
                break;
              case "errorstyle":
                break;
              case "errormessage":
                break;
              case "errortitle":
                break;
              case "cellrangelist":
                break;
              case "inputmessage":
                break;
              case "inputtitle":
                break;
              case "combohide":
                break;
              case "inputhide":
                break;
              case "condition":
                break;
              case "qualifier":
                break;
              case "useblank":
                break;
              case "value1":
                break;
              case "value2":
                break;
              case "format":
                break;
              default:
                seen = false;
            }
            break;
          /* MapInfo (schema) */
          case "mapinfo":
          case "schema":
          case "data":
            switch (Rn[3]) {
              case "map":
                break;
              case "entry":
                break;
              case "range":
                break;
              case "xpath":
                break;
              case "field":
                break;
              case "xsdtype":
                break;
              case "filteron":
                break;
              case "aggregate":
                break;
              case "elementtype":
                break;
              case "attributetype":
                break;
              /* These are from xsd (XML Schema Definition) */
              case "schema":
              case "element":
              case "complextype":
              case "datatype":
              case "all":
              case "attribute":
              case "extends":
                break;
              case "row":
                break;
              default:
                seen = false;
            }
            break;
          /* SmartTags (can be anything) */
          case "smarttags":
            break;
          default:
            seen = false;
            break;
        }
        if (seen) break;
        if (Rn[3].match(/!\[CDATA/)) break;
        if (!state[state.length - 1][1]) throw "Unrecognized tag: " + Rn[3] + "|" + state.join("|");
        if (state[state.length - 1][0] === /*'CustomDocumentProperties'*/
        "customdocumentproperties") {
          if (Rn[0].slice(-2) === "/>") break;
          else if (Rn[1] === "/") xlml_set_custprop(Custprops, raw_Rn3, cp, str.slice(pidx, Rn.index));
          else {
            cp = Rn;
            pidx = Rn.index + Rn[0].length;
          }
          break;
        }
        if (opts.WTF) throw "Unrecognized tag: " + Rn[3] + "|" + state.join("|");
    }
    var out = {};
    if (!opts.bookSheets && !opts.bookProps) out.Sheets = sheets;
    out.SheetNames = sheetnames;
    out.Workbook = Workbook;
    out.SSF = dup(table_fmt);
    out.Props = Props;
    out.Custprops = Custprops;
    return out;
  }
  function parse_xlml(data, opts) {
    fix_read_opts(opts = opts || {});
    switch (opts.type || "base64") {
      case "base64":
        return parse_xlml_xml(Base64_decode(data), opts);
      case "binary":
      case "buffer":
      case "file":
        return parse_xlml_xml(data, opts);
      case "array":
        return parse_xlml_xml(a2s(data), opts);
    }
  }
  function parse_compobj(obj) {
    var v = {};
    var o = obj.content;
    o.l = 28;
    v.AnsiUserType = o.read_shift(0, "lpstr-ansi");
    v.AnsiClipboardFormat = parse_ClipboardFormatOrAnsiString(o);
    if (o.length - o.l <= 4) return v;
    var m = o.read_shift(4);
    if (m == 0 || m > 40) return v;
    o.l -= 4;
    v.Reserved1 = o.read_shift(0, "lpstr-ansi");
    if (o.length - o.l <= 4) return v;
    m = o.read_shift(4);
    if (m !== 1907505652) return v;
    v.UnicodeClipboardFormat = parse_ClipboardFormatOrUnicodeString(o);
    m = o.read_shift(4);
    if (m == 0 || m > 40) return v;
    o.l -= 4;
    v.Reserved2 = o.read_shift(0, "lpwstr");
  }
  var CONTINUE_RT = [60, 1084, 2066, 2165, 2175];
  function slurp(RecordType, R, blob, length, opts) {
    var l = length;
    var bufs = [];
    var d = blob.slice(blob.l, blob.l + l);
    if (opts && opts.enc && opts.enc.insitu && d.length > 0) switch (RecordType) {
      case 9:
      case 521:
      case 1033:
      case 2057:
      case 47:
      case 405:
      case 225:
      case 406:
      case 312:
      case 404:
      case 10:
        break;
      case 133:
        break;
      default:
        opts.enc.insitu(d);
    }
    bufs.push(d);
    blob.l += l;
    var nextrt = __readUInt16LE(blob, blob.l), next = XLSRecordEnum[nextrt];
    var start = 0;
    while (next != null && CONTINUE_RT.indexOf(nextrt) > -1) {
      l = __readUInt16LE(blob, blob.l + 2);
      start = blob.l + 4;
      if (nextrt == 2066) start += 4;
      else if (nextrt == 2165 || nextrt == 2175) {
        start += 12;
      }
      d = blob.slice(start, blob.l + 4 + l);
      bufs.push(d);
      blob.l += 4 + l;
      next = XLSRecordEnum[nextrt = __readUInt16LE(blob, blob.l)];
    }
    var b = bconcat(bufs);
    prep_blob(b, 0);
    var ll = 0;
    b.lens = [];
    for (var j = 0; j < bufs.length; ++j) {
      b.lens.push(ll);
      ll += bufs[j].length;
    }
    if (b.length < length) throw "XLS Record 0x" + RecordType.toString(16) + " Truncated: " + b.length + " < " + length;
    return R.f(b, b.length, opts);
  }
  function safe_format_xf(p, opts, date1904) {
    if (p.t === "z") return;
    if (!p.XF) return;
    var fmtid = 0;
    try {
      fmtid = p.z || p.XF.numFmtId || 0;
      if (opts.cellNF) p.z = table_fmt[fmtid];
    } catch (e) {
      if (opts.WTF) throw e;
    }
    if (!opts || opts.cellText !== false) try {
      if (p.t === "e") {
        p.w = p.w || BErr[p.v];
      } else if (fmtid === 0 || fmtid == "General") {
        if (p.t === "n") {
          if ((p.v | 0) === p.v) p.w = p.v.toString(10);
          else p.w = SSF_general_num(p.v);
        } else p.w = SSF_general(p.v);
      } else p.w = SSF_format(fmtid, p.v, { date1904: !!date1904, dateNF: opts && opts.dateNF });
    } catch (e) {
      if (opts.WTF) throw e;
    }
    if (opts.cellDates && fmtid && p.t == "n" && fmt_is_date(table_fmt[fmtid] || String(fmtid))) {
      var _d = SSF_parse_date_code(p.v);
      if (_d) {
        p.t = "d";
        p.v = new Date(_d.y, _d.m - 1, _d.d, _d.H, _d.M, _d.S, _d.u);
      }
    }
  }
  function make_cell(val, ixfe, t) {
    return { v: val, ixfe, t };
  }
  function parse_workbook(blob, options) {
    var wb = { opts: {} };
    var Sheets = {};
    if (DENSE != null && options.dense == null) options.dense = DENSE;
    var out = options.dense ? [] : {};
    var Directory = {};
    var range = {};
    var last_formula = null;
    var sst = [];
    var cur_sheet = "";
    var Preamble = {};
    var lastcell, last_cell = "", cc, cmnt, rngC, rngR;
    var sharedf = {};
    var arrayf = [];
    var temp_val;
    var country;
    var XFs = [];
    var palette = [];
    var Workbook = { Sheets: [], WBProps: { date1904: false }, Views: [{}] }, wsprops = {};
    var get_rgb = function getrgb(icv) {
      if (icv < 8) return XLSIcv[icv];
      if (icv < 64) return palette[icv - 8] || XLSIcv[icv];
      return XLSIcv[icv];
    };
    var process_cell_style = function pcs(cell, line, options2) {
      var xfd = line.XF.data;
      if (!xfd || !xfd.patternType || !options2 || !options2.cellStyles) return;
      line.s = {};
      line.s.patternType = xfd.patternType;
      var t;
      if (t = rgb2Hex(get_rgb(xfd.icvFore))) {
        line.s.fgColor = { rgb: t };
      }
      if (t = rgb2Hex(get_rgb(xfd.icvBack))) {
        line.s.bgColor = { rgb: t };
      }
    };
    var addcell = function addcell2(cell, line, options2) {
      if (file_depth > 1) return;
      if (options2.sheetRows && cell.r >= options2.sheetRows) return;
      if (options2.cellStyles && line.XF && line.XF.data) process_cell_style(cell, line, options2);
      delete line.ixfe;
      delete line.XF;
      lastcell = cell;
      last_cell = encode_cell(cell);
      if (!range || !range.s || !range.e) range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      if (cell.r < range.s.r) range.s.r = cell.r;
      if (cell.c < range.s.c) range.s.c = cell.c;
      if (cell.r + 1 > range.e.r) range.e.r = cell.r + 1;
      if (cell.c + 1 > range.e.c) range.e.c = cell.c + 1;
      if (options2.cellFormula && line.f) {
        for (var afi = 0; afi < arrayf.length; ++afi) {
          if (arrayf[afi][0].s.c > cell.c || arrayf[afi][0].s.r > cell.r) continue;
          if (arrayf[afi][0].e.c < cell.c || arrayf[afi][0].e.r < cell.r) continue;
          line.F = encode_range(arrayf[afi][0]);
          if (arrayf[afi][0].s.c != cell.c || arrayf[afi][0].s.r != cell.r) delete line.f;
          if (line.f) line.f = "" + stringify_formula(arrayf[afi][1], range, cell, supbooks, opts);
          break;
        }
      }
      {
        if (options2.dense) {
          if (!out[cell.r]) out[cell.r] = [];
          out[cell.r][cell.c] = line;
        } else out[last_cell] = line;
      }
    };
    var opts = {
      enc: false,
      // encrypted
      sbcch: 0,
      // cch in the preceding SupBook
      snames: [],
      // sheetnames
      sharedf,
      // shared formulae by address
      arrayf,
      // array formulae array
      rrtabid: [],
      // RRTabId
      lastuser: "",
      // Last User from WriteAccess
      biff: 8,
      // BIFF version
      codepage: 0,
      // CP from CodePage record
      winlocked: 0,
      // fLockWn from WinProtect
      cellStyles: !!options && !!options.cellStyles,
      WTF: !!options && !!options.wtf
    };
    if (options.password) opts.password = options.password;
    var themes;
    var merges = [];
    var objects = [];
    var colinfo = [], rowinfo = [];
    var seencol = false;
    var supbooks = [];
    supbooks.SheetNames = opts.snames;
    supbooks.sharedf = opts.sharedf;
    supbooks.arrayf = opts.arrayf;
    supbooks.names = [];
    supbooks.XTI = [];
    var last_RT = 0;
    var file_depth = 0;
    var BIFF2Fmt = 0, BIFF2FmtTable = [];
    var FilterDatabases = [];
    var last_lbl;
    opts.codepage = 1200;
    set_cp(1200);
    var seen_codepage = false;
    while (blob.l < blob.length - 1) {
      var s = blob.l;
      var RecordType = blob.read_shift(2);
      if (RecordType === 0 && last_RT === 10) break;
      var length = blob.l === blob.length ? 0 : blob.read_shift(2);
      var R = XLSRecordEnum[RecordType];
      if (R && R.f) {
        if (options.bookSheets) {
          if (last_RT === 133 && RecordType !== 133) break;
        }
        last_RT = RecordType;
        if (R.r === 2 || R.r == 12) {
          var rt = blob.read_shift(2);
          length -= 2;
          if (!opts.enc && rt !== RecordType && ((rt & 255) << 8 | rt >> 8) !== RecordType) throw new Error("rt mismatch: " + rt + "!=" + RecordType);
          if (R.r == 12) {
            blob.l += 10;
            length -= 10;
          }
        }
        var val = {};
        if (RecordType === 10) val = /*::(*/
        R.f(blob, length, opts);
        else val = /*::(*/
        slurp(RecordType, R, blob, length, opts);
        if (file_depth == 0 && [9, 521, 1033, 2057].indexOf(last_RT) === -1) continue;
        switch (RecordType) {
          case 34:
            wb.opts.Date1904 = Workbook.WBProps.date1904 = val;
            break;
          case 134:
            wb.opts.WriteProtect = true;
            break;
          case 47:
            if (!opts.enc) blob.l = 0;
            opts.enc = val;
            if (!options.password) throw new Error("File is password-protected");
            if (val.valid == null) throw new Error("Encryption scheme unsupported");
            if (!val.valid) throw new Error("Password is incorrect");
            break;
          case 92:
            opts.lastuser = val;
            break;
          case 66:
            var cpval = Number(val);
            switch (cpval) {
              case 21010:
                cpval = 1200;
                break;
              case 32768:
                cpval = 1e4;
                break;
              case 32769:
                cpval = 1252;
                break;
            }
            set_cp(opts.codepage = cpval);
            seen_codepage = true;
            break;
          case 317:
            opts.rrtabid = val;
            break;
          case 25:
            opts.winlocked = val;
            break;
          case 439:
            wb.opts["RefreshAll"] = val;
            break;
          case 12:
            wb.opts["CalcCount"] = val;
            break;
          case 16:
            wb.opts["CalcDelta"] = val;
            break;
          case 17:
            wb.opts["CalcIter"] = val;
            break;
          case 13:
            wb.opts["CalcMode"] = val;
            break;
          case 14:
            wb.opts["CalcPrecision"] = val;
            break;
          case 95:
            wb.opts["CalcSaveRecalc"] = val;
            break;
          case 15:
            opts.CalcRefMode = val;
            break;
          // TODO: implement R1C1
          case 2211:
            wb.opts.FullCalc = val;
            break;
          case 129:
            if (val.fDialog) out["!type"] = "dialog";
            if (!val.fBelow) (out["!outline"] || (out["!outline"] = {})).above = true;
            if (!val.fRight) (out["!outline"] || (out["!outline"] = {})).left = true;
            break;
          // TODO
          case 224:
            XFs.push(val);
            break;
          case 430:
            supbooks.push([val]);
            supbooks[supbooks.length - 1].XTI = [];
            break;
          case 35:
          case 547:
            supbooks[supbooks.length - 1].push(val);
            break;
          case 24:
          case 536:
            last_lbl = {
              Name: val.Name,
              Ref: stringify_formula(val.rgce, range, null, supbooks, opts)
            };
            if (val.itab > 0) last_lbl.Sheet = val.itab - 1;
            supbooks.names.push(last_lbl);
            if (!supbooks[0]) {
              supbooks[0] = [];
              supbooks[0].XTI = [];
            }
            supbooks[supbooks.length - 1].push(val);
            if (val.Name == "_xlnm._FilterDatabase" && val.itab > 0) {
              if (val.rgce && val.rgce[0] && val.rgce[0][0] && val.rgce[0][0][0] == "PtgArea3d")
                FilterDatabases[val.itab - 1] = { ref: encode_range(val.rgce[0][0][1][2]) };
            }
            break;
          case 22:
            opts.ExternCount = val;
            break;
          case 23:
            if (supbooks.length == 0) {
              supbooks[0] = [];
              supbooks[0].XTI = [];
            }
            supbooks[supbooks.length - 1].XTI = supbooks[supbooks.length - 1].XTI.concat(val);
            supbooks.XTI = supbooks.XTI.concat(val);
            break;
          case 2196:
            if (opts.biff < 8) break;
            if (last_lbl != null) last_lbl.Comment = val[1];
            break;
          case 18:
            out["!protect"] = val;
            break;
          /* for sheet or book */
          case 19:
            if (val !== 0 && opts.WTF) console.error("Password verifier: " + val);
            break;
          case 133:
            {
              Directory[val.pos] = val;
              opts.snames.push(val.name);
            }
            break;
          case 10:
            {
              if (--file_depth) break;
              if (range.e) {
                if (range.e.r > 0 && range.e.c > 0) {
                  range.e.r--;
                  range.e.c--;
                  out["!ref"] = encode_range(range);
                  if (options.sheetRows && options.sheetRows <= range.e.r) {
                    var tmpri = range.e.r;
                    range.e.r = options.sheetRows - 1;
                    out["!fullref"] = out["!ref"];
                    out["!ref"] = encode_range(range);
                    range.e.r = tmpri;
                  }
                  range.e.r++;
                  range.e.c++;
                }
                if (merges.length > 0) out["!merges"] = merges;
                if (objects.length > 0) out["!objects"] = objects;
                if (colinfo.length > 0) out["!cols"] = colinfo;
                if (rowinfo.length > 0) out["!rows"] = rowinfo;
                Workbook.Sheets.push(wsprops);
              }
              if (cur_sheet === "") Preamble = out;
              else Sheets[cur_sheet] = out;
              out = options.dense ? [] : {};
            }
            break;
          case 9:
          case 521:
          case 1033:
          case 2057:
            {
              if (opts.biff === 8) opts.biff = {
                /*::[*/
                9: 2,
                /*::[*/
                521: 3,
                /*::[*/
                1033: 4
              }[RecordType] || {
                /*::[*/
                512: 2,
                /*::[*/
                768: 3,
                /*::[*/
                1024: 4,
                /*::[*/
                1280: 5,
                /*::[*/
                1536: 8,
                /*::[*/
                2: 2,
                /*::[*/
                7: 2
              }[val.BIFFVer] || 8;
              opts.biffguess = val.BIFFVer == 0;
              if (val.BIFFVer == 0 && val.dt == 4096) {
                opts.biff = 5;
                seen_codepage = true;
                set_cp(opts.codepage = 28591);
              }
              if (opts.biff == 8 && val.BIFFVer == 0 && val.dt == 16) opts.biff = 2;
              if (file_depth++) break;
              out = options.dense ? [] : {};
              if (opts.biff < 8 && !seen_codepage) {
                seen_codepage = true;
                set_cp(opts.codepage = options.codepage || 1252);
              }
              if (opts.biff < 5 || val.BIFFVer == 0 && val.dt == 4096) {
                if (cur_sheet === "") cur_sheet = "Sheet1";
                range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
                var fakebs8 = { pos: blob.l - length, name: cur_sheet };
                Directory[fakebs8.pos] = fakebs8;
                opts.snames.push(cur_sheet);
              } else cur_sheet = (Directory[s] || { name: "" }).name;
              if (val.dt == 32) out["!type"] = "chart";
              if (val.dt == 64) out["!type"] = "macro";
              merges = [];
              objects = [];
              opts.arrayf = arrayf = [];
              colinfo = [];
              rowinfo = [];
              seencol = false;
              wsprops = { Hidden: (Directory[s] || { hs: 0 }).hs, name: cur_sheet };
            }
            break;
          case 515:
          case 3:
          case 2:
            {
              if (out["!type"] == "chart") {
                if (options.dense ? (out[val.r] || [])[val.c] : out[encode_cell({ c: val.c, r: val.r })]) ++val.c;
              }
              temp_val = { ixfe: val.ixfe, XF: XFs[val.ixfe] || {}, v: val.val, t: "n" };
              if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
              safe_format_xf(temp_val, options, wb.opts.Date1904);
              addcell({ c: val.c, r: val.r }, temp_val, options);
            }
            break;
          case 5:
          case 517:
            {
              temp_val = { ixfe: val.ixfe, XF: XFs[val.ixfe], v: val.val, t: val.t };
              if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
              safe_format_xf(temp_val, options, wb.opts.Date1904);
              addcell({ c: val.c, r: val.r }, temp_val, options);
            }
            break;
          case 638:
            {
              temp_val = { ixfe: val.ixfe, XF: XFs[val.ixfe], v: val.rknum, t: "n" };
              if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
              safe_format_xf(temp_val, options, wb.opts.Date1904);
              addcell({ c: val.c, r: val.r }, temp_val, options);
            }
            break;
          case 189:
            {
              for (var j = val.c; j <= val.C; ++j) {
                var ixfe = val.rkrec[j - val.c][0];
                temp_val = { ixfe, XF: XFs[ixfe], v: val.rkrec[j - val.c][1], t: "n" };
                if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
                safe_format_xf(temp_val, options, wb.opts.Date1904);
                addcell({ c: j, r: val.r }, temp_val, options);
              }
            }
            break;
          case 6:
          case 518:
          case 1030:
            {
              if (val.val == "String") {
                last_formula = val;
                break;
              }
              temp_val = make_cell(val.val, val.cell.ixfe, val.tt);
              temp_val.XF = XFs[temp_val.ixfe];
              if (options.cellFormula) {
                var _f = val.formula;
                if (_f && _f[0] && _f[0][0] && _f[0][0][0] == "PtgExp") {
                  var _fr = _f[0][0][1][0], _fc = _f[0][0][1][1];
                  var _fe = encode_cell({ r: _fr, c: _fc });
                  if (sharedf[_fe]) temp_val.f = "" + stringify_formula(val.formula, range, val.cell, supbooks, opts);
                  else temp_val.F = ((options.dense ? (out[_fr] || [])[_fc] : out[_fe]) || {}).F;
                } else temp_val.f = "" + stringify_formula(val.formula, range, val.cell, supbooks, opts);
              }
              if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
              safe_format_xf(temp_val, options, wb.opts.Date1904);
              addcell(val.cell, temp_val, options);
              last_formula = val;
            }
            break;
          case 7:
          case 519:
            {
              if (last_formula) {
                last_formula.val = val;
                temp_val = make_cell(val, last_formula.cell.ixfe, "s");
                temp_val.XF = XFs[temp_val.ixfe];
                if (options.cellFormula) {
                  temp_val.f = "" + stringify_formula(last_formula.formula, range, last_formula.cell, supbooks, opts);
                }
                if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
                safe_format_xf(temp_val, options, wb.opts.Date1904);
                addcell(last_formula.cell, temp_val, options);
                last_formula = null;
              } else throw new Error("String record expects Formula");
            }
            break;
          case 33:
          case 545:
            {
              arrayf.push(val);
              var _arraystart = encode_cell(val[0].s);
              cc = options.dense ? (out[val[0].s.r] || [])[val[0].s.c] : out[_arraystart];
              if (options.cellFormula && cc) {
                if (!last_formula) break;
                if (!_arraystart || !cc) break;
                cc.f = "" + stringify_formula(val[1], range, val[0], supbooks, opts);
                cc.F = encode_range(val[0]);
              }
            }
            break;
          case 1212:
            {
              if (!options.cellFormula) break;
              if (last_cell) {
                if (!last_formula) break;
                sharedf[encode_cell(last_formula.cell)] = val[0];
                cc = options.dense ? (out[last_formula.cell.r] || [])[last_formula.cell.c] : out[encode_cell(last_formula.cell)];
                (cc || {}).f = "" + stringify_formula(val[0], range, lastcell, supbooks, opts);
              }
            }
            break;
          case 253:
            temp_val = make_cell(sst[val.isst].t, val.ixfe, "s");
            if (sst[val.isst].h) temp_val.h = sst[val.isst].h;
            temp_val.XF = XFs[temp_val.ixfe];
            if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
            safe_format_xf(temp_val, options, wb.opts.Date1904);
            addcell({ c: val.c, r: val.r }, temp_val, options);
            break;
          case 513:
            if (options.sheetStubs) {
              temp_val = { ixfe: val.ixfe, XF: XFs[val.ixfe], t: "z" };
              if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
              safe_format_xf(temp_val, options, wb.opts.Date1904);
              addcell({ c: val.c, r: val.r }, temp_val, options);
            }
            break;
          case 190:
            if (options.sheetStubs) {
              for (var _j = val.c; _j <= val.C; ++_j) {
                var _ixfe = val.ixfe[_j - val.c];
                temp_val = { ixfe: _ixfe, XF: XFs[_ixfe], t: "z" };
                if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
                safe_format_xf(temp_val, options, wb.opts.Date1904);
                addcell({ c: _j, r: val.r }, temp_val, options);
              }
            }
            break;
          case 214:
          case 516:
          case 4:
            temp_val = make_cell(val.val, val.ixfe, "s");
            temp_val.XF = XFs[temp_val.ixfe];
            if (BIFF2Fmt > 0) temp_val.z = BIFF2FmtTable[temp_val.ixfe >> 8 & 63];
            safe_format_xf(temp_val, options, wb.opts.Date1904);
            addcell({ c: val.c, r: val.r }, temp_val, options);
            break;
          case 0:
          case 512:
            {
              if (file_depth === 1) range = val;
            }
            break;
          case 252:
            {
              sst = val;
            }
            break;
          case 1054:
            {
              if (opts.biff == 4) {
                BIFF2FmtTable[BIFF2Fmt++] = val[1];
                for (var b4idx = 0; b4idx < BIFF2Fmt + 163; ++b4idx) if (table_fmt[b4idx] == val[1]) break;
                if (b4idx >= 163) SSF_load(val[1], BIFF2Fmt + 163);
              } else SSF_load(val[1], val[0]);
            }
            break;
          case 30:
            {
              BIFF2FmtTable[BIFF2Fmt++] = val;
              for (var b2idx = 0; b2idx < BIFF2Fmt + 163; ++b2idx) if (table_fmt[b2idx] == val) break;
              if (b2idx >= 163) SSF_load(val, BIFF2Fmt + 163);
            }
            break;
          case 229:
            merges = merges.concat(val);
            break;
          case 93:
            objects[val.cmo[0]] = opts.lastobj = val;
            break;
          case 438:
            opts.lastobj.TxO = val;
            break;
          case 127:
            opts.lastobj.ImData = val;
            break;
          case 440:
            {
              for (rngR = val[0].s.r; rngR <= val[0].e.r; ++rngR)
                for (rngC = val[0].s.c; rngC <= val[0].e.c; ++rngC) {
                  cc = options.dense ? (out[rngR] || [])[rngC] : out[encode_cell({ c: rngC, r: rngR })];
                  if (cc) cc.l = val[1];
                }
            }
            break;
          case 2048:
            {
              for (rngR = val[0].s.r; rngR <= val[0].e.r; ++rngR)
                for (rngC = val[0].s.c; rngC <= val[0].e.c; ++rngC) {
                  cc = options.dense ? (out[rngR] || [])[rngC] : out[encode_cell({ c: rngC, r: rngR })];
                  if (cc && cc.l) cc.l.Tooltip = val[1];
                }
            }
            break;
          case 28:
            {
              if (opts.biff <= 5 && opts.biff >= 2) break;
              cc = options.dense ? (out[val[0].r] || [])[val[0].c] : out[encode_cell(val[0])];
              var noteobj = objects[val[2]];
              if (!cc) {
                if (options.dense) {
                  if (!out[val[0].r]) out[val[0].r] = [];
                  cc = out[val[0].r][val[0].c] = { t: "z" };
                } else {
                  cc = out[encode_cell(val[0])] = { t: "z" };
                }
                range.e.r = Math.max(range.e.r, val[0].r);
                range.s.r = Math.min(range.s.r, val[0].r);
                range.e.c = Math.max(range.e.c, val[0].c);
                range.s.c = Math.min(range.s.c, val[0].c);
              }
              if (!cc.c) cc.c = [];
              cmnt = { a: val[1], t: noteobj.TxO.t };
              cc.c.push(cmnt);
            }
            break;
          case 2173:
            update_xfext(XFs[val.ixfe], val.ext);
            break;
          case 125:
            {
              if (!opts.cellStyles) break;
              while (val.e >= val.s) {
                colinfo[val.e--] = { width: val.w / 256, level: val.level || 0, hidden: !!(val.flags & 1) };
                if (!seencol) {
                  seencol = true;
                  find_mdw_colw(val.w / 256);
                }
                process_col(colinfo[val.e + 1]);
              }
            }
            break;
          case 520:
            {
              var rowobj = {};
              if (val.level != null) {
                rowinfo[val.r] = rowobj;
                rowobj.level = val.level;
              }
              if (val.hidden) {
                rowinfo[val.r] = rowobj;
                rowobj.hidden = true;
              }
              if (val.hpt) {
                rowinfo[val.r] = rowobj;
                rowobj.hpt = val.hpt;
                rowobj.hpx = pt2px(val.hpt);
              }
            }
            break;
          case 38:
          case 39:
          case 40:
          case 41:
            if (!out["!margins"]) default_margins(out["!margins"] = {});
            out["!margins"][{ 38: "left", 39: "right", 40: "top", 41: "bottom" }[RecordType]] = val;
            break;
          case 161:
            if (!out["!margins"]) default_margins(out["!margins"] = {});
            out["!margins"].header = val.header;
            out["!margins"].footer = val.footer;
            break;
          case 574:
            if (val.RTL) Workbook.Views[0].RTL = true;
            break;
          case 146:
            palette = val;
            break;
          case 2198:
            themes = val;
            break;
          case 140:
            country = val;
            break;
          case 442:
            {
              if (!cur_sheet) Workbook.WBProps.CodeName = val || "ThisWorkbook";
              else wsprops.CodeName = val || wsprops.name;
            }
            break;
        }
      } else {
        if (!R) console.error("Missing Info for XLS Record 0x" + RecordType.toString(16));
        blob.l += length;
      }
    }
    wb.SheetNames = keys(Directory).sort(function(a, b) {
      return Number(a) - Number(b);
    }).map(function(x) {
      return Directory[x].name;
    });
    if (!options.bookSheets) wb.Sheets = Sheets;
    if (!wb.SheetNames.length && Preamble["!ref"]) {
      wb.SheetNames.push("Sheet1");
      if (wb.Sheets) wb.Sheets["Sheet1"] = Preamble;
    } else wb.Preamble = Preamble;
    if (wb.Sheets) FilterDatabases.forEach(function(r, i) {
      wb.Sheets[wb.SheetNames[i]]["!autofilter"] = r;
    });
    wb.Strings = sst;
    wb.SSF = dup(table_fmt);
    if (opts.enc) wb.Encryption = opts.enc;
    if (themes) wb.Themes = themes;
    wb.Metadata = {};
    if (country !== void 0) wb.Metadata.Country = country;
    if (supbooks.names.length > 0) Workbook.Names = supbooks.names;
    wb.Workbook = Workbook;
    return wb;
  }
  var PSCLSID = {
    SI: "e0859ff2f94f6810ab9108002b27b3d9",
    DSI: "02d5cdd59c2e1b10939708002b2cf9ae",
    UDI: "05d5cdd59c2e1b10939708002b2cf9ae"
  };
  function parse_xls_props(cfb, props, o) {
    var DSI = CFB.find(cfb, "/!DocumentSummaryInformation");
    if (DSI && DSI.size > 0) try {
      var DocSummary = parse_PropertySetStream(DSI, DocSummaryPIDDSI, PSCLSID.DSI);
      for (var d in DocSummary) props[d] = DocSummary[d];
    } catch (e) {
      if (o.WTF) throw e;
    }
    var SI = CFB.find(cfb, "/!SummaryInformation");
    if (SI && SI.size > 0) try {
      var Summary = parse_PropertySetStream(SI, SummaryPIDSI, PSCLSID.SI);
      for (var s in Summary) if (props[s] == null) props[s] = Summary[s];
    } catch (e) {
      if (o.WTF) throw e;
    }
    if (props.HeadingPairs && props.TitlesOfParts) {
      load_props_pairs(props.HeadingPairs, props.TitlesOfParts, props, o);
      delete props.HeadingPairs;
      delete props.TitlesOfParts;
    }
  }
  function parse_xlscfb(cfb, options) {
    if (!options) options = {};
    fix_read_opts(options);
    reset_cp();
    if (options.codepage) set_ansi(options.codepage);
    var CompObj, WB;
    if (cfb.FullPaths) {
      if (CFB.find(cfb, "/encryption")) throw new Error("File is password-protected");
      CompObj = CFB.find(cfb, "!CompObj");
      WB = CFB.find(cfb, "/Workbook") || CFB.find(cfb, "/Book");
    } else {
      switch (options.type) {
        case "base64":
          cfb = s2a(Base64_decode(cfb));
          break;
        case "binary":
          cfb = s2a(cfb);
          break;
        case "buffer":
          break;
        case "array":
          if (!Array.isArray(cfb)) cfb = Array.prototype.slice.call(cfb);
          break;
      }
      prep_blob(cfb, 0);
      WB = { content: cfb };
    }
    var WorkbookP;
    var _data;
    if (CompObj) parse_compobj(CompObj);
    if (options.bookProps && !options.bookSheets) WorkbookP = {};
    else {
      var T = has_buf ? "buffer" : "array";
      if (WB && WB.content) WorkbookP = parse_workbook(WB.content, options);
      else if ((_data = CFB.find(cfb, "PerfectOffice_MAIN")) && _data.content) WorkbookP = WK_.to_workbook(_data.content, (options.type = T, options));
      else if ((_data = CFB.find(cfb, "NativeContent_MAIN")) && _data.content) WorkbookP = WK_.to_workbook(_data.content, (options.type = T, options));
      else if ((_data = CFB.find(cfb, "MN0")) && _data.content) throw new Error("Unsupported Works 4 for Mac file");
      else throw new Error("Cannot find Workbook stream");
      if (options.bookVBA && cfb.FullPaths && CFB.find(cfb, "/_VBA_PROJECT_CUR/VBA/dir")) WorkbookP.vbaraw = make_vba_xls(cfb);
    }
    var props = {};
    if (cfb.FullPaths) parse_xls_props(
      /*::((*/
      cfb,
      props,
      options
    );
    WorkbookP.Props = WorkbookP.Custprops = props;
    if (options.bookFiles) WorkbookP.cfb = cfb;
    return WorkbookP;
  }
  var XLSBRecordEnum = {
    /*::[*/
    0: {
      /* n:"BrtRowHdr", */
      f: parse_BrtRowHdr
    },
    /*::[*/
    1: {
      /* n:"BrtCellBlank", */
      f: parse_BrtCellBlank
    },
    /*::[*/
    2: {
      /* n:"BrtCellRk", */
      f: parse_BrtCellRk
    },
    /*::[*/
    3: {
      /* n:"BrtCellError", */
      f: parse_BrtCellError
    },
    /*::[*/
    4: {
      /* n:"BrtCellBool", */
      f: parse_BrtCellBool
    },
    /*::[*/
    5: {
      /* n:"BrtCellReal", */
      f: parse_BrtCellReal
    },
    /*::[*/
    6: {
      /* n:"BrtCellSt", */
      f: parse_BrtCellSt
    },
    /*::[*/
    7: {
      /* n:"BrtCellIsst", */
      f: parse_BrtCellIsst
    },
    /*::[*/
    8: {
      /* n:"BrtFmlaString", */
      f: parse_BrtFmlaString
    },
    /*::[*/
    9: {
      /* n:"BrtFmlaNum", */
      f: parse_BrtFmlaNum
    },
    /*::[*/
    10: {
      /* n:"BrtFmlaBool", */
      f: parse_BrtFmlaBool
    },
    /*::[*/
    11: {
      /* n:"BrtFmlaError", */
      f: parse_BrtFmlaError
    },
    /*::[*/
    12: {
      /* n:"BrtShortBlank", */
      f: parse_BrtShortBlank
    },
    /*::[*/
    13: {
      /* n:"BrtShortRk", */
      f: parse_BrtShortRk
    },
    /*::[*/
    14: {
      /* n:"BrtShortError", */
      f: parse_BrtShortError
    },
    /*::[*/
    15: {
      /* n:"BrtShortBool", */
      f: parse_BrtShortBool
    },
    /*::[*/
    16: {
      /* n:"BrtShortReal", */
      f: parse_BrtShortReal
    },
    /*::[*/
    17: {
      /* n:"BrtShortSt", */
      f: parse_BrtShortSt
    },
    /*::[*/
    18: {
      /* n:"BrtShortIsst", */
      f: parse_BrtShortIsst
    },
    /*::[*/
    19: {
      /* n:"BrtSSTItem", */
      f: parse_RichStr
    },
    /*::[*/
    20: {
      /* n:"BrtPCDIMissing" */
    },
    /*::[*/
    21: {
      /* n:"BrtPCDINumber" */
    },
    /*::[*/
    22: {
      /* n:"BrtPCDIBoolean" */
    },
    /*::[*/
    23: {
      /* n:"BrtPCDIError" */
    },
    /*::[*/
    24: {
      /* n:"BrtPCDIString" */
    },
    /*::[*/
    25: {
      /* n:"BrtPCDIDatetime" */
    },
    /*::[*/
    26: {
      /* n:"BrtPCDIIndex" */
    },
    /*::[*/
    27: {
      /* n:"BrtPCDIAMissing" */
    },
    /*::[*/
    28: {
      /* n:"BrtPCDIANumber" */
    },
    /*::[*/
    29: {
      /* n:"BrtPCDIABoolean" */
    },
    /*::[*/
    30: {
      /* n:"BrtPCDIAError" */
    },
    /*::[*/
    31: {
      /* n:"BrtPCDIAString" */
    },
    /*::[*/
    32: {
      /* n:"BrtPCDIADatetime" */
    },
    /*::[*/
    33: {
      /* n:"BrtPCRRecord" */
    },
    /*::[*/
    34: {
      /* n:"BrtPCRRecordDt" */
    },
    /*::[*/
    35: {
      /* n:"BrtFRTBegin", */
      T: 1
    },
    /*::[*/
    36: {
      /* n:"BrtFRTEnd", */
      T: -1
    },
    /*::[*/
    37: {
      /* n:"BrtACBegin", */
      T: 1
    },
    /*::[*/
    38: {
      /* n:"BrtACEnd", */
      T: -1
    },
    /*::[*/
    39: {
      /* n:"BrtName", */
      f: parse_BrtName
    },
    /*::[*/
    40: {
      /* n:"BrtIndexRowBlock" */
    },
    /*::[*/
    42: {
      /* n:"BrtIndexBlock" */
    },
    /*::[*/
    43: {
      /* n:"BrtFont", */
      f: parse_BrtFont
    },
    /*::[*/
    44: {
      /* n:"BrtFmt", */
      f: parse_BrtFmt
    },
    /*::[*/
    45: {
      /* n:"BrtFill", */
      f: parse_BrtFill
    },
    /*::[*/
    46: {
      /* n:"BrtBorder", */
      f: parse_BrtBorder
    },
    /*::[*/
    47: {
      /* n:"BrtXF", */
      f: parse_BrtXF
    },
    /*::[*/
    48: {
      /* n:"BrtStyle" */
    },
    /*::[*/
    49: {
      /* n:"BrtCellMeta", */
      f: parse_Int32LE
    },
    /*::[*/
    50: {
      /* n:"BrtValueMeta" */
    },
    /*::[*/
    51: {
      /* n:"BrtMdb" */
      f: parse_BrtMdb
    },
    /*::[*/
    52: {
      /* n:"BrtBeginFmd", */
      T: 1
    },
    /*::[*/
    53: {
      /* n:"BrtEndFmd", */
      T: -1
    },
    /*::[*/
    54: {
      /* n:"BrtBeginMdx", */
      T: 1
    },
    /*::[*/
    55: {
      /* n:"BrtEndMdx", */
      T: -1
    },
    /*::[*/
    56: {
      /* n:"BrtBeginMdxTuple", */
      T: 1
    },
    /*::[*/
    57: {
      /* n:"BrtEndMdxTuple", */
      T: -1
    },
    /*::[*/
    58: {
      /* n:"BrtMdxMbrIstr" */
    },
    /*::[*/
    59: {
      /* n:"BrtStr" */
    },
    /*::[*/
    60: {
      /* n:"BrtColInfo", */
      f: parse_ColInfo
    },
    /*::[*/
    62: {
      /* n:"BrtCellRString", */
      f: parse_BrtCellRString
    },
    /*::[*/
    63: {
      /* n:"BrtCalcChainItem$", */
      f: parse_BrtCalcChainItem$
    },
    /*::[*/
    64: {
      /* n:"BrtDVal", */
      f: parse_BrtDVal
    },
    /*::[*/
    65: {
      /* n:"BrtSxvcellNum" */
    },
    /*::[*/
    66: {
      /* n:"BrtSxvcellStr" */
    },
    /*::[*/
    67: {
      /* n:"BrtSxvcellBool" */
    },
    /*::[*/
    68: {
      /* n:"BrtSxvcellErr" */
    },
    /*::[*/
    69: {
      /* n:"BrtSxvcellDate" */
    },
    /*::[*/
    70: {
      /* n:"BrtSxvcellNil" */
    },
    /*::[*/
    128: {
      /* n:"BrtFileVersion" */
    },
    /*::[*/
    129: {
      /* n:"BrtBeginSheet", */
      T: 1
    },
    /*::[*/
    130: {
      /* n:"BrtEndSheet", */
      T: -1
    },
    /*::[*/
    131: {
      /* n:"BrtBeginBook", */
      T: 1,
      f: parsenoop,
      p: 0
    },
    /*::[*/
    132: {
      /* n:"BrtEndBook", */
      T: -1
    },
    /*::[*/
    133: {
      /* n:"BrtBeginWsViews", */
      T: 1
    },
    /*::[*/
    134: {
      /* n:"BrtEndWsViews", */
      T: -1
    },
    /*::[*/
    135: {
      /* n:"BrtBeginBookViews", */
      T: 1
    },
    /*::[*/
    136: {
      /* n:"BrtEndBookViews", */
      T: -1
    },
    /*::[*/
    137: {
      /* n:"BrtBeginWsView", */
      T: 1,
      f: parse_BrtBeginWsView
    },
    /*::[*/
    138: {
      /* n:"BrtEndWsView", */
      T: -1
    },
    /*::[*/
    139: {
      /* n:"BrtBeginCsViews", */
      T: 1
    },
    /*::[*/
    140: {
      /* n:"BrtEndCsViews", */
      T: -1
    },
    /*::[*/
    141: {
      /* n:"BrtBeginCsView", */
      T: 1
    },
    /*::[*/
    142: {
      /* n:"BrtEndCsView", */
      T: -1
    },
    /*::[*/
    143: {
      /* n:"BrtBeginBundleShs", */
      T: 1
    },
    /*::[*/
    144: {
      /* n:"BrtEndBundleShs", */
      T: -1
    },
    /*::[*/
    145: {
      /* n:"BrtBeginSheetData", */
      T: 1
    },
    /*::[*/
    146: {
      /* n:"BrtEndSheetData", */
      T: -1
    },
    /*::[*/
    147: {
      /* n:"BrtWsProp", */
      f: parse_BrtWsProp
    },
    /*::[*/
    148: {
      /* n:"BrtWsDim", */
      f: parse_BrtWsDim,
      p: 16
    },
    /*::[*/
    151: {
      /* n:"BrtPane", */
      f: parse_BrtPane
    },
    /*::[*/
    152: {
      /* n:"BrtSel" */
    },
    /*::[*/
    153: {
      /* n:"BrtWbProp", */
      f: parse_BrtWbProp
    },
    /*::[*/
    154: {
      /* n:"BrtWbFactoid" */
    },
    /*::[*/
    155: {
      /* n:"BrtFileRecover" */
    },
    /*::[*/
    156: {
      /* n:"BrtBundleSh", */
      f: parse_BrtBundleSh
    },
    /*::[*/
    157: {
      /* n:"BrtCalcProp" */
    },
    /*::[*/
    158: {
      /* n:"BrtBookView" */
    },
    /*::[*/
    159: {
      /* n:"BrtBeginSst", */
      T: 1,
      f: parse_BrtBeginSst
    },
    /*::[*/
    160: {
      /* n:"BrtEndSst", */
      T: -1
    },
    /*::[*/
    161: {
      /* n:"BrtBeginAFilter", */
      T: 1,
      f: parse_UncheckedRfX
    },
    /*::[*/
    162: {
      /* n:"BrtEndAFilter", */
      T: -1
    },
    /*::[*/
    163: {
      /* n:"BrtBeginFilterColumn", */
      T: 1
    },
    /*::[*/
    164: {
      /* n:"BrtEndFilterColumn", */
      T: -1
    },
    /*::[*/
    165: {
      /* n:"BrtBeginFilters", */
      T: 1
    },
    /*::[*/
    166: {
      /* n:"BrtEndFilters", */
      T: -1
    },
    /*::[*/
    167: {
      /* n:"BrtFilter" */
    },
    /*::[*/
    168: {
      /* n:"BrtColorFilter" */
    },
    /*::[*/
    169: {
      /* n:"BrtIconFilter" */
    },
    /*::[*/
    170: {
      /* n:"BrtTop10Filter" */
    },
    /*::[*/
    171: {
      /* n:"BrtDynamicFilter" */
    },
    /*::[*/
    172: {
      /* n:"BrtBeginCustomFilters", */
      T: 1
    },
    /*::[*/
    173: {
      /* n:"BrtEndCustomFilters", */
      T: -1
    },
    /*::[*/
    174: {
      /* n:"BrtCustomFilter" */
    },
    /*::[*/
    175: {
      /* n:"BrtAFilterDateGroupItem" */
    },
    /*::[*/
    176: {
      /* n:"BrtMergeCell", */
      f: parse_BrtMergeCell
    },
    /*::[*/
    177: {
      /* n:"BrtBeginMergeCells", */
      T: 1
    },
    /*::[*/
    178: {
      /* n:"BrtEndMergeCells", */
      T: -1
    },
    /*::[*/
    179: {
      /* n:"BrtBeginPivotCacheDef", */
      T: 1
    },
    /*::[*/
    180: {
      /* n:"BrtEndPivotCacheDef", */
      T: -1
    },
    /*::[*/
    181: {
      /* n:"BrtBeginPCDFields", */
      T: 1
    },
    /*::[*/
    182: {
      /* n:"BrtEndPCDFields", */
      T: -1
    },
    /*::[*/
    183: {
      /* n:"BrtBeginPCDField", */
      T: 1
    },
    /*::[*/
    184: {
      /* n:"BrtEndPCDField", */
      T: -1
    },
    /*::[*/
    185: {
      /* n:"BrtBeginPCDSource", */
      T: 1
    },
    /*::[*/
    186: {
      /* n:"BrtEndPCDSource", */
      T: -1
    },
    /*::[*/
    187: {
      /* n:"BrtBeginPCDSRange", */
      T: 1
    },
    /*::[*/
    188: {
      /* n:"BrtEndPCDSRange", */
      T: -1
    },
    /*::[*/
    189: {
      /* n:"BrtBeginPCDFAtbl", */
      T: 1
    },
    /*::[*/
    190: {
      /* n:"BrtEndPCDFAtbl", */
      T: -1
    },
    /*::[*/
    191: {
      /* n:"BrtBeginPCDIRun", */
      T: 1
    },
    /*::[*/
    192: {
      /* n:"BrtEndPCDIRun", */
      T: -1
    },
    /*::[*/
    193: {
      /* n:"BrtBeginPivotCacheRecords", */
      T: 1
    },
    /*::[*/
    194: {
      /* n:"BrtEndPivotCacheRecords", */
      T: -1
    },
    /*::[*/
    195: {
      /* n:"BrtBeginPCDHierarchies", */
      T: 1
    },
    /*::[*/
    196: {
      /* n:"BrtEndPCDHierarchies", */
      T: -1
    },
    /*::[*/
    197: {
      /* n:"BrtBeginPCDHierarchy", */
      T: 1
    },
    /*::[*/
    198: {
      /* n:"BrtEndPCDHierarchy", */
      T: -1
    },
    /*::[*/
    199: {
      /* n:"BrtBeginPCDHFieldsUsage", */
      T: 1
    },
    /*::[*/
    200: {
      /* n:"BrtEndPCDHFieldsUsage", */
      T: -1
    },
    /*::[*/
    201: {
      /* n:"BrtBeginExtConnection", */
      T: 1
    },
    /*::[*/
    202: {
      /* n:"BrtEndExtConnection", */
      T: -1
    },
    /*::[*/
    203: {
      /* n:"BrtBeginECDbProps", */
      T: 1
    },
    /*::[*/
    204: {
      /* n:"BrtEndECDbProps", */
      T: -1
    },
    /*::[*/
    205: {
      /* n:"BrtBeginECOlapProps", */
      T: 1
    },
    /*::[*/
    206: {
      /* n:"BrtEndECOlapProps", */
      T: -1
    },
    /*::[*/
    207: {
      /* n:"BrtBeginPCDSConsol", */
      T: 1
    },
    /*::[*/
    208: {
      /* n:"BrtEndPCDSConsol", */
      T: -1
    },
    /*::[*/
    209: {
      /* n:"BrtBeginPCDSCPages", */
      T: 1
    },
    /*::[*/
    210: {
      /* n:"BrtEndPCDSCPages", */
      T: -1
    },
    /*::[*/
    211: {
      /* n:"BrtBeginPCDSCPage", */
      T: 1
    },
    /*::[*/
    212: {
      /* n:"BrtEndPCDSCPage", */
      T: -1
    },
    /*::[*/
    213: {
      /* n:"BrtBeginPCDSCPItem", */
      T: 1
    },
    /*::[*/
    214: {
      /* n:"BrtEndPCDSCPItem", */
      T: -1
    },
    /*::[*/
    215: {
      /* n:"BrtBeginPCDSCSets", */
      T: 1
    },
    /*::[*/
    216: {
      /* n:"BrtEndPCDSCSets", */
      T: -1
    },
    /*::[*/
    217: {
      /* n:"BrtBeginPCDSCSet", */
      T: 1
    },
    /*::[*/
    218: {
      /* n:"BrtEndPCDSCSet", */
      T: -1
    },
    /*::[*/
    219: {
      /* n:"BrtBeginPCDFGroup", */
      T: 1
    },
    /*::[*/
    220: {
      /* n:"BrtEndPCDFGroup", */
      T: -1
    },
    /*::[*/
    221: {
      /* n:"BrtBeginPCDFGItems", */
      T: 1
    },
    /*::[*/
    222: {
      /* n:"BrtEndPCDFGItems", */
      T: -1
    },
    /*::[*/
    223: {
      /* n:"BrtBeginPCDFGRange", */
      T: 1
    },
    /*::[*/
    224: {
      /* n:"BrtEndPCDFGRange", */
      T: -1
    },
    /*::[*/
    225: {
      /* n:"BrtBeginPCDFGDiscrete", */
      T: 1
    },
    /*::[*/
    226: {
      /* n:"BrtEndPCDFGDiscrete", */
      T: -1
    },
    /*::[*/
    227: {
      /* n:"BrtBeginPCDSDTupleCache", */
      T: 1
    },
    /*::[*/
    228: {
      /* n:"BrtEndPCDSDTupleCache", */
      T: -1
    },
    /*::[*/
    229: {
      /* n:"BrtBeginPCDSDTCEntries", */
      T: 1
    },
    /*::[*/
    230: {
      /* n:"BrtEndPCDSDTCEntries", */
      T: -1
    },
    /*::[*/
    231: {
      /* n:"BrtBeginPCDSDTCEMembers", */
      T: 1
    },
    /*::[*/
    232: {
      /* n:"BrtEndPCDSDTCEMembers", */
      T: -1
    },
    /*::[*/
    233: {
      /* n:"BrtBeginPCDSDTCEMember", */
      T: 1
    },
    /*::[*/
    234: {
      /* n:"BrtEndPCDSDTCEMember", */
      T: -1
    },
    /*::[*/
    235: {
      /* n:"BrtBeginPCDSDTCQueries", */
      T: 1
    },
    /*::[*/
    236: {
      /* n:"BrtEndPCDSDTCQueries", */
      T: -1
    },
    /*::[*/
    237: {
      /* n:"BrtBeginPCDSDTCQuery", */
      T: 1
    },
    /*::[*/
    238: {
      /* n:"BrtEndPCDSDTCQuery", */
      T: -1
    },
    /*::[*/
    239: {
      /* n:"BrtBeginPCDSDTCSets", */
      T: 1
    },
    /*::[*/
    240: {
      /* n:"BrtEndPCDSDTCSets", */
      T: -1
    },
    /*::[*/
    241: {
      /* n:"BrtBeginPCDSDTCSet", */
      T: 1
    },
    /*::[*/
    242: {
      /* n:"BrtEndPCDSDTCSet", */
      T: -1
    },
    /*::[*/
    243: {
      /* n:"BrtBeginPCDCalcItems", */
      T: 1
    },
    /*::[*/
    244: {
      /* n:"BrtEndPCDCalcItems", */
      T: -1
    },
    /*::[*/
    245: {
      /* n:"BrtBeginPCDCalcItem", */
      T: 1
    },
    /*::[*/
    246: {
      /* n:"BrtEndPCDCalcItem", */
      T: -1
    },
    /*::[*/
    247: {
      /* n:"BrtBeginPRule", */
      T: 1
    },
    /*::[*/
    248: {
      /* n:"BrtEndPRule", */
      T: -1
    },
    /*::[*/
    249: {
      /* n:"BrtBeginPRFilters", */
      T: 1
    },
    /*::[*/
    250: {
      /* n:"BrtEndPRFilters", */
      T: -1
    },
    /*::[*/
    251: {
      /* n:"BrtBeginPRFilter", */
      T: 1
    },
    /*::[*/
    252: {
      /* n:"BrtEndPRFilter", */
      T: -1
    },
    /*::[*/
    253: {
      /* n:"BrtBeginPNames", */
      T: 1
    },
    /*::[*/
    254: {
      /* n:"BrtEndPNames", */
      T: -1
    },
    /*::[*/
    255: {
      /* n:"BrtBeginPName", */
      T: 1
    },
    /*::[*/
    256: {
      /* n:"BrtEndPName", */
      T: -1
    },
    /*::[*/
    257: {
      /* n:"BrtBeginPNPairs", */
      T: 1
    },
    /*::[*/
    258: {
      /* n:"BrtEndPNPairs", */
      T: -1
    },
    /*::[*/
    259: {
      /* n:"BrtBeginPNPair", */
      T: 1
    },
    /*::[*/
    260: {
      /* n:"BrtEndPNPair", */
      T: -1
    },
    /*::[*/
    261: {
      /* n:"BrtBeginECWebProps", */
      T: 1
    },
    /*::[*/
    262: {
      /* n:"BrtEndECWebProps", */
      T: -1
    },
    /*::[*/
    263: {
      /* n:"BrtBeginEcWpTables", */
      T: 1
    },
    /*::[*/
    264: {
      /* n:"BrtEndECWPTables", */
      T: -1
    },
    /*::[*/
    265: {
      /* n:"BrtBeginECParams", */
      T: 1
    },
    /*::[*/
    266: {
      /* n:"BrtEndECParams", */
      T: -1
    },
    /*::[*/
    267: {
      /* n:"BrtBeginECParam", */
      T: 1
    },
    /*::[*/
    268: {
      /* n:"BrtEndECParam", */
      T: -1
    },
    /*::[*/
    269: {
      /* n:"BrtBeginPCDKPIs", */
      T: 1
    },
    /*::[*/
    270: {
      /* n:"BrtEndPCDKPIs", */
      T: -1
    },
    /*::[*/
    271: {
      /* n:"BrtBeginPCDKPI", */
      T: 1
    },
    /*::[*/
    272: {
      /* n:"BrtEndPCDKPI", */
      T: -1
    },
    /*::[*/
    273: {
      /* n:"BrtBeginDims", */
      T: 1
    },
    /*::[*/
    274: {
      /* n:"BrtEndDims", */
      T: -1
    },
    /*::[*/
    275: {
      /* n:"BrtBeginDim", */
      T: 1
    },
    /*::[*/
    276: {
      /* n:"BrtEndDim", */
      T: -1
    },
    /*::[*/
    277: {
      /* n:"BrtIndexPartEnd" */
    },
    /*::[*/
    278: {
      /* n:"BrtBeginStyleSheet", */
      T: 1
    },
    /*::[*/
    279: {
      /* n:"BrtEndStyleSheet", */
      T: -1
    },
    /*::[*/
    280: {
      /* n:"BrtBeginSXView", */
      T: 1
    },
    /*::[*/
    281: {
      /* n:"BrtEndSXVI", */
      T: -1
    },
    /*::[*/
    282: {
      /* n:"BrtBeginSXVI", */
      T: 1
    },
    /*::[*/
    283: {
      /* n:"BrtBeginSXVIs", */
      T: 1
    },
    /*::[*/
    284: {
      /* n:"BrtEndSXVIs", */
      T: -1
    },
    /*::[*/
    285: {
      /* n:"BrtBeginSXVD", */
      T: 1
    },
    /*::[*/
    286: {
      /* n:"BrtEndSXVD", */
      T: -1
    },
    /*::[*/
    287: {
      /* n:"BrtBeginSXVDs", */
      T: 1
    },
    /*::[*/
    288: {
      /* n:"BrtEndSXVDs", */
      T: -1
    },
    /*::[*/
    289: {
      /* n:"BrtBeginSXPI", */
      T: 1
    },
    /*::[*/
    290: {
      /* n:"BrtEndSXPI", */
      T: -1
    },
    /*::[*/
    291: {
      /* n:"BrtBeginSXPIs", */
      T: 1
    },
    /*::[*/
    292: {
      /* n:"BrtEndSXPIs", */
      T: -1
    },
    /*::[*/
    293: {
      /* n:"BrtBeginSXDI", */
      T: 1
    },
    /*::[*/
    294: {
      /* n:"BrtEndSXDI", */
      T: -1
    },
    /*::[*/
    295: {
      /* n:"BrtBeginSXDIs", */
      T: 1
    },
    /*::[*/
    296: {
      /* n:"BrtEndSXDIs", */
      T: -1
    },
    /*::[*/
    297: {
      /* n:"BrtBeginSXLI", */
      T: 1
    },
    /*::[*/
    298: {
      /* n:"BrtEndSXLI", */
      T: -1
    },
    /*::[*/
    299: {
      /* n:"BrtBeginSXLIRws", */
      T: 1
    },
    /*::[*/
    300: {
      /* n:"BrtEndSXLIRws", */
      T: -1
    },
    /*::[*/
    301: {
      /* n:"BrtBeginSXLICols", */
      T: 1
    },
    /*::[*/
    302: {
      /* n:"BrtEndSXLICols", */
      T: -1
    },
    /*::[*/
    303: {
      /* n:"BrtBeginSXFormat", */
      T: 1
    },
    /*::[*/
    304: {
      /* n:"BrtEndSXFormat", */
      T: -1
    },
    /*::[*/
    305: {
      /* n:"BrtBeginSXFormats", */
      T: 1
    },
    /*::[*/
    306: {
      /* n:"BrtEndSxFormats", */
      T: -1
    },
    /*::[*/
    307: {
      /* n:"BrtBeginSxSelect", */
      T: 1
    },
    /*::[*/
    308: {
      /* n:"BrtEndSxSelect", */
      T: -1
    },
    /*::[*/
    309: {
      /* n:"BrtBeginISXVDRws", */
      T: 1
    },
    /*::[*/
    310: {
      /* n:"BrtEndISXVDRws", */
      T: -1
    },
    /*::[*/
    311: {
      /* n:"BrtBeginISXVDCols", */
      T: 1
    },
    /*::[*/
    312: {
      /* n:"BrtEndISXVDCols", */
      T: -1
    },
    /*::[*/
    313: {
      /* n:"BrtEndSXLocation", */
      T: -1
    },
    /*::[*/
    314: {
      /* n:"BrtBeginSXLocation", */
      T: 1
    },
    /*::[*/
    315: {
      /* n:"BrtEndSXView", */
      T: -1
    },
    /*::[*/
    316: {
      /* n:"BrtBeginSXTHs", */
      T: 1
    },
    /*::[*/
    317: {
      /* n:"BrtEndSXTHs", */
      T: -1
    },
    /*::[*/
    318: {
      /* n:"BrtBeginSXTH", */
      T: 1
    },
    /*::[*/
    319: {
      /* n:"BrtEndSXTH", */
      T: -1
    },
    /*::[*/
    320: {
      /* n:"BrtBeginISXTHRws", */
      T: 1
    },
    /*::[*/
    321: {
      /* n:"BrtEndISXTHRws", */
      T: -1
    },
    /*::[*/
    322: {
      /* n:"BrtBeginISXTHCols", */
      T: 1
    },
    /*::[*/
    323: {
      /* n:"BrtEndISXTHCols", */
      T: -1
    },
    /*::[*/
    324: {
      /* n:"BrtBeginSXTDMPS", */
      T: 1
    },
    /*::[*/
    325: {
      /* n:"BrtEndSXTDMPs", */
      T: -1
    },
    /*::[*/
    326: {
      /* n:"BrtBeginSXTDMP", */
      T: 1
    },
    /*::[*/
    327: {
      /* n:"BrtEndSXTDMP", */
      T: -1
    },
    /*::[*/
    328: {
      /* n:"BrtBeginSXTHItems", */
      T: 1
    },
    /*::[*/
    329: {
      /* n:"BrtEndSXTHItems", */
      T: -1
    },
    /*::[*/
    330: {
      /* n:"BrtBeginSXTHItem", */
      T: 1
    },
    /*::[*/
    331: {
      /* n:"BrtEndSXTHItem", */
      T: -1
    },
    /*::[*/
    332: {
      /* n:"BrtBeginMetadata", */
      T: 1
    },
    /*::[*/
    333: {
      /* n:"BrtEndMetadata", */
      T: -1
    },
    /*::[*/
    334: {
      /* n:"BrtBeginEsmdtinfo", */
      T: 1
    },
    /*::[*/
    335: {
      /* n:"BrtMdtinfo", */
      f: parse_BrtMdtinfo
    },
    /*::[*/
    336: {
      /* n:"BrtEndEsmdtinfo", */
      T: -1
    },
    /*::[*/
    337: {
      /* n:"BrtBeginEsmdb", */
      f: parse_BrtBeginEsmdb,
      T: 1
    },
    /*::[*/
    338: {
      /* n:"BrtEndEsmdb", */
      T: -1
    },
    /*::[*/
    339: {
      /* n:"BrtBeginEsfmd", */
      T: 1
    },
    /*::[*/
    340: {
      /* n:"BrtEndEsfmd", */
      T: -1
    },
    /*::[*/
    341: {
      /* n:"BrtBeginSingleCells", */
      T: 1
    },
    /*::[*/
    342: {
      /* n:"BrtEndSingleCells", */
      T: -1
    },
    /*::[*/
    343: {
      /* n:"BrtBeginList", */
      T: 1
    },
    /*::[*/
    344: {
      /* n:"BrtEndList", */
      T: -1
    },
    /*::[*/
    345: {
      /* n:"BrtBeginListCols", */
      T: 1
    },
    /*::[*/
    346: {
      /* n:"BrtEndListCols", */
      T: -1
    },
    /*::[*/
    347: {
      /* n:"BrtBeginListCol", */
      T: 1
    },
    /*::[*/
    348: {
      /* n:"BrtEndListCol", */
      T: -1
    },
    /*::[*/
    349: {
      /* n:"BrtBeginListXmlCPr", */
      T: 1
    },
    /*::[*/
    350: {
      /* n:"BrtEndListXmlCPr", */
      T: -1
    },
    /*::[*/
    351: {
      /* n:"BrtListCCFmla" */
    },
    /*::[*/
    352: {
      /* n:"BrtListTrFmla" */
    },
    /*::[*/
    353: {
      /* n:"BrtBeginExternals", */
      T: 1
    },
    /*::[*/
    354: {
      /* n:"BrtEndExternals", */
      T: -1
    },
    /*::[*/
    355: {
      /* n:"BrtSupBookSrc", */
      f: parse_RelID
    },
    /*::[*/
    357: {
      /* n:"BrtSupSelf" */
    },
    /*::[*/
    358: {
      /* n:"BrtSupSame" */
    },
    /*::[*/
    359: {
      /* n:"BrtSupTabs" */
    },
    /*::[*/
    360: {
      /* n:"BrtBeginSupBook", */
      T: 1
    },
    /*::[*/
    361: {
      /* n:"BrtPlaceholderName" */
    },
    /*::[*/
    362: {
      /* n:"BrtExternSheet", */
      f: parse_ExternSheet
    },
    /*::[*/
    363: {
      /* n:"BrtExternTableStart" */
    },
    /*::[*/
    364: {
      /* n:"BrtExternTableEnd" */
    },
    /*::[*/
    366: {
      /* n:"BrtExternRowHdr" */
    },
    /*::[*/
    367: {
      /* n:"BrtExternCellBlank" */
    },
    /*::[*/
    368: {
      /* n:"BrtExternCellReal" */
    },
    /*::[*/
    369: {
      /* n:"BrtExternCellBool" */
    },
    /*::[*/
    370: {
      /* n:"BrtExternCellError" */
    },
    /*::[*/
    371: {
      /* n:"BrtExternCellString" */
    },
    /*::[*/
    372: {
      /* n:"BrtBeginEsmdx", */
      T: 1
    },
    /*::[*/
    373: {
      /* n:"BrtEndEsmdx", */
      T: -1
    },
    /*::[*/
    374: {
      /* n:"BrtBeginMdxSet", */
      T: 1
    },
    /*::[*/
    375: {
      /* n:"BrtEndMdxSet", */
      T: -1
    },
    /*::[*/
    376: {
      /* n:"BrtBeginMdxMbrProp", */
      T: 1
    },
    /*::[*/
    377: {
      /* n:"BrtEndMdxMbrProp", */
      T: -1
    },
    /*::[*/
    378: {
      /* n:"BrtBeginMdxKPI", */
      T: 1
    },
    /*::[*/
    379: {
      /* n:"BrtEndMdxKPI", */
      T: -1
    },
    /*::[*/
    380: {
      /* n:"BrtBeginEsstr", */
      T: 1
    },
    /*::[*/
    381: {
      /* n:"BrtEndEsstr", */
      T: -1
    },
    /*::[*/
    382: {
      /* n:"BrtBeginPRFItem", */
      T: 1
    },
    /*::[*/
    383: {
      /* n:"BrtEndPRFItem", */
      T: -1
    },
    /*::[*/
    384: {
      /* n:"BrtBeginPivotCacheIDs", */
      T: 1
    },
    /*::[*/
    385: {
      /* n:"BrtEndPivotCacheIDs", */
      T: -1
    },
    /*::[*/
    386: {
      /* n:"BrtBeginPivotCacheID", */
      T: 1
    },
    /*::[*/
    387: {
      /* n:"BrtEndPivotCacheID", */
      T: -1
    },
    /*::[*/
    388: {
      /* n:"BrtBeginISXVIs", */
      T: 1
    },
    /*::[*/
    389: {
      /* n:"BrtEndISXVIs", */
      T: -1
    },
    /*::[*/
    390: {
      /* n:"BrtBeginColInfos", */
      T: 1
    },
    /*::[*/
    391: {
      /* n:"BrtEndColInfos", */
      T: -1
    },
    /*::[*/
    392: {
      /* n:"BrtBeginRwBrk", */
      T: 1
    },
    /*::[*/
    393: {
      /* n:"BrtEndRwBrk", */
      T: -1
    },
    /*::[*/
    394: {
      /* n:"BrtBeginColBrk", */
      T: 1
    },
    /*::[*/
    395: {
      /* n:"BrtEndColBrk", */
      T: -1
    },
    /*::[*/
    396: {
      /* n:"BrtBrk" */
    },
    /*::[*/
    397: {
      /* n:"BrtUserBookView" */
    },
    /*::[*/
    398: {
      /* n:"BrtInfo" */
    },
    /*::[*/
    399: {
      /* n:"BrtCUsr" */
    },
    /*::[*/
    400: {
      /* n:"BrtUsr" */
    },
    /*::[*/
    401: {
      /* n:"BrtBeginUsers", */
      T: 1
    },
    /*::[*/
    403: {
      /* n:"BrtEOF" */
    },
    /*::[*/
    404: {
      /* n:"BrtUCR" */
    },
    /*::[*/
    405: {
      /* n:"BrtRRInsDel" */
    },
    /*::[*/
    406: {
      /* n:"BrtRREndInsDel" */
    },
    /*::[*/
    407: {
      /* n:"BrtRRMove" */
    },
    /*::[*/
    408: {
      /* n:"BrtRREndMove" */
    },
    /*::[*/
    409: {
      /* n:"BrtRRChgCell" */
    },
    /*::[*/
    410: {
      /* n:"BrtRREndChgCell" */
    },
    /*::[*/
    411: {
      /* n:"BrtRRHeader" */
    },
    /*::[*/
    412: {
      /* n:"BrtRRUserView" */
    },
    /*::[*/
    413: {
      /* n:"BrtRRRenSheet" */
    },
    /*::[*/
    414: {
      /* n:"BrtRRInsertSh" */
    },
    /*::[*/
    415: {
      /* n:"BrtRRDefName" */
    },
    /*::[*/
    416: {
      /* n:"BrtRRNote" */
    },
    /*::[*/
    417: {
      /* n:"BrtRRConflict" */
    },
    /*::[*/
    418: {
      /* n:"BrtRRTQSIF" */
    },
    /*::[*/
    419: {
      /* n:"BrtRRFormat" */
    },
    /*::[*/
    420: {
      /* n:"BrtRREndFormat" */
    },
    /*::[*/
    421: {
      /* n:"BrtRRAutoFmt" */
    },
    /*::[*/
    422: {
      /* n:"BrtBeginUserShViews", */
      T: 1
    },
    /*::[*/
    423: {
      /* n:"BrtBeginUserShView", */
      T: 1
    },
    /*::[*/
    424: {
      /* n:"BrtEndUserShView", */
      T: -1
    },
    /*::[*/
    425: {
      /* n:"BrtEndUserShViews", */
      T: -1
    },
    /*::[*/
    426: {
      /* n:"BrtArrFmla", */
      f: parse_BrtArrFmla
    },
    /*::[*/
    427: {
      /* n:"BrtShrFmla", */
      f: parse_BrtShrFmla
    },
    /*::[*/
    428: {
      /* n:"BrtTable" */
    },
    /*::[*/
    429: {
      /* n:"BrtBeginExtConnections", */
      T: 1
    },
    /*::[*/
    430: {
      /* n:"BrtEndExtConnections", */
      T: -1
    },
    /*::[*/
    431: {
      /* n:"BrtBeginPCDCalcMems", */
      T: 1
    },
    /*::[*/
    432: {
      /* n:"BrtEndPCDCalcMems", */
      T: -1
    },
    /*::[*/
    433: {
      /* n:"BrtBeginPCDCalcMem", */
      T: 1
    },
    /*::[*/
    434: {
      /* n:"BrtEndPCDCalcMem", */
      T: -1
    },
    /*::[*/
    435: {
      /* n:"BrtBeginPCDHGLevels", */
      T: 1
    },
    /*::[*/
    436: {
      /* n:"BrtEndPCDHGLevels", */
      T: -1
    },
    /*::[*/
    437: {
      /* n:"BrtBeginPCDHGLevel", */
      T: 1
    },
    /*::[*/
    438: {
      /* n:"BrtEndPCDHGLevel", */
      T: -1
    },
    /*::[*/
    439: {
      /* n:"BrtBeginPCDHGLGroups", */
      T: 1
    },
    /*::[*/
    440: {
      /* n:"BrtEndPCDHGLGroups", */
      T: -1
    },
    /*::[*/
    441: {
      /* n:"BrtBeginPCDHGLGroup", */
      T: 1
    },
    /*::[*/
    442: {
      /* n:"BrtEndPCDHGLGroup", */
      T: -1
    },
    /*::[*/
    443: {
      /* n:"BrtBeginPCDHGLGMembers", */
      T: 1
    },
    /*::[*/
    444: {
      /* n:"BrtEndPCDHGLGMembers", */
      T: -1
    },
    /*::[*/
    445: {
      /* n:"BrtBeginPCDHGLGMember", */
      T: 1
    },
    /*::[*/
    446: {
      /* n:"BrtEndPCDHGLGMember", */
      T: -1
    },
    /*::[*/
    447: {
      /* n:"BrtBeginQSI", */
      T: 1
    },
    /*::[*/
    448: {
      /* n:"BrtEndQSI", */
      T: -1
    },
    /*::[*/
    449: {
      /* n:"BrtBeginQSIR", */
      T: 1
    },
    /*::[*/
    450: {
      /* n:"BrtEndQSIR", */
      T: -1
    },
    /*::[*/
    451: {
      /* n:"BrtBeginDeletedNames", */
      T: 1
    },
    /*::[*/
    452: {
      /* n:"BrtEndDeletedNames", */
      T: -1
    },
    /*::[*/
    453: {
      /* n:"BrtBeginDeletedName", */
      T: 1
    },
    /*::[*/
    454: {
      /* n:"BrtEndDeletedName", */
      T: -1
    },
    /*::[*/
    455: {
      /* n:"BrtBeginQSIFs", */
      T: 1
    },
    /*::[*/
    456: {
      /* n:"BrtEndQSIFs", */
      T: -1
    },
    /*::[*/
    457: {
      /* n:"BrtBeginQSIF", */
      T: 1
    },
    /*::[*/
    458: {
      /* n:"BrtEndQSIF", */
      T: -1
    },
    /*::[*/
    459: {
      /* n:"BrtBeginAutoSortScope", */
      T: 1
    },
    /*::[*/
    460: {
      /* n:"BrtEndAutoSortScope", */
      T: -1
    },
    /*::[*/
    461: {
      /* n:"BrtBeginConditionalFormatting", */
      T: 1
    },
    /*::[*/
    462: {
      /* n:"BrtEndConditionalFormatting", */
      T: -1
    },
    /*::[*/
    463: {
      /* n:"BrtBeginCFRule", */
      T: 1
    },
    /*::[*/
    464: {
      /* n:"BrtEndCFRule", */
      T: -1
    },
    /*::[*/
    465: {
      /* n:"BrtBeginIconSet", */
      T: 1
    },
    /*::[*/
    466: {
      /* n:"BrtEndIconSet", */
      T: -1
    },
    /*::[*/
    467: {
      /* n:"BrtBeginDatabar", */
      T: 1
    },
    /*::[*/
    468: {
      /* n:"BrtEndDatabar", */
      T: -1
    },
    /*::[*/
    469: {
      /* n:"BrtBeginColorScale", */
      T: 1
    },
    /*::[*/
    470: {
      /* n:"BrtEndColorScale", */
      T: -1
    },
    /*::[*/
    471: {
      /* n:"BrtCFVO" */
    },
    /*::[*/
    472: {
      /* n:"BrtExternValueMeta" */
    },
    /*::[*/
    473: {
      /* n:"BrtBeginColorPalette", */
      T: 1
    },
    /*::[*/
    474: {
      /* n:"BrtEndColorPalette", */
      T: -1
    },
    /*::[*/
    475: {
      /* n:"BrtIndexedColor" */
    },
    /*::[*/
    476: {
      /* n:"BrtMargins", */
      f: parse_BrtMargins
    },
    /*::[*/
    477: {
      /* n:"BrtPrintOptions" */
    },
    /*::[*/
    478: {
      /* n:"BrtPageSetup" */
    },
    /*::[*/
    479: {
      /* n:"BrtBeginHeaderFooter", */
      T: 1
    },
    /*::[*/
    480: {
      /* n:"BrtEndHeaderFooter", */
      T: -1
    },
    /*::[*/
    481: {
      /* n:"BrtBeginSXCrtFormat", */
      T: 1
    },
    /*::[*/
    482: {
      /* n:"BrtEndSXCrtFormat", */
      T: -1
    },
    /*::[*/
    483: {
      /* n:"BrtBeginSXCrtFormats", */
      T: 1
    },
    /*::[*/
    484: {
      /* n:"BrtEndSXCrtFormats", */
      T: -1
    },
    /*::[*/
    485: {
      /* n:"BrtWsFmtInfo", */
      f: parse_BrtWsFmtInfo
    },
    /*::[*/
    486: {
      /* n:"BrtBeginMgs", */
      T: 1
    },
    /*::[*/
    487: {
      /* n:"BrtEndMGs", */
      T: -1
    },
    /*::[*/
    488: {
      /* n:"BrtBeginMGMaps", */
      T: 1
    },
    /*::[*/
    489: {
      /* n:"BrtEndMGMaps", */
      T: -1
    },
    /*::[*/
    490: {
      /* n:"BrtBeginMG", */
      T: 1
    },
    /*::[*/
    491: {
      /* n:"BrtEndMG", */
      T: -1
    },
    /*::[*/
    492: {
      /* n:"BrtBeginMap", */
      T: 1
    },
    /*::[*/
    493: {
      /* n:"BrtEndMap", */
      T: -1
    },
    /*::[*/
    494: {
      /* n:"BrtHLink", */
      f: parse_BrtHLink
    },
    /*::[*/
    495: {
      /* n:"BrtBeginDCon", */
      T: 1
    },
    /*::[*/
    496: {
      /* n:"BrtEndDCon", */
      T: -1
    },
    /*::[*/
    497: {
      /* n:"BrtBeginDRefs", */
      T: 1
    },
    /*::[*/
    498: {
      /* n:"BrtEndDRefs", */
      T: -1
    },
    /*::[*/
    499: {
      /* n:"BrtDRef" */
    },
    /*::[*/
    500: {
      /* n:"BrtBeginScenMan", */
      T: 1
    },
    /*::[*/
    501: {
      /* n:"BrtEndScenMan", */
      T: -1
    },
    /*::[*/
    502: {
      /* n:"BrtBeginSct", */
      T: 1
    },
    /*::[*/
    503: {
      /* n:"BrtEndSct", */
      T: -1
    },
    /*::[*/
    504: {
      /* n:"BrtSlc" */
    },
    /*::[*/
    505: {
      /* n:"BrtBeginDXFs", */
      T: 1
    },
    /*::[*/
    506: {
      /* n:"BrtEndDXFs", */
      T: -1
    },
    /*::[*/
    507: {
      /* n:"BrtDXF" */
    },
    /*::[*/
    508: {
      /* n:"BrtBeginTableStyles", */
      T: 1
    },
    /*::[*/
    509: {
      /* n:"BrtEndTableStyles", */
      T: -1
    },
    /*::[*/
    510: {
      /* n:"BrtBeginTableStyle", */
      T: 1
    },
    /*::[*/
    511: {
      /* n:"BrtEndTableStyle", */
      T: -1
    },
    /*::[*/
    512: {
      /* n:"BrtTableStyleElement" */
    },
    /*::[*/
    513: {
      /* n:"BrtTableStyleClient" */
    },
    /*::[*/
    514: {
      /* n:"BrtBeginVolDeps", */
      T: 1
    },
    /*::[*/
    515: {
      /* n:"BrtEndVolDeps", */
      T: -1
    },
    /*::[*/
    516: {
      /* n:"BrtBeginVolType", */
      T: 1
    },
    /*::[*/
    517: {
      /* n:"BrtEndVolType", */
      T: -1
    },
    /*::[*/
    518: {
      /* n:"BrtBeginVolMain", */
      T: 1
    },
    /*::[*/
    519: {
      /* n:"BrtEndVolMain", */
      T: -1
    },
    /*::[*/
    520: {
      /* n:"BrtBeginVolTopic", */
      T: 1
    },
    /*::[*/
    521: {
      /* n:"BrtEndVolTopic", */
      T: -1
    },
    /*::[*/
    522: {
      /* n:"BrtVolSubtopic" */
    },
    /*::[*/
    523: {
      /* n:"BrtVolRef" */
    },
    /*::[*/
    524: {
      /* n:"BrtVolNum" */
    },
    /*::[*/
    525: {
      /* n:"BrtVolErr" */
    },
    /*::[*/
    526: {
      /* n:"BrtVolStr" */
    },
    /*::[*/
    527: {
      /* n:"BrtVolBool" */
    },
    /*::[*/
    528: {
      /* n:"BrtBeginCalcChain$", */
      T: 1
    },
    /*::[*/
    529: {
      /* n:"BrtEndCalcChain$", */
      T: -1
    },
    /*::[*/
    530: {
      /* n:"BrtBeginSortState", */
      T: 1
    },
    /*::[*/
    531: {
      /* n:"BrtEndSortState", */
      T: -1
    },
    /*::[*/
    532: {
      /* n:"BrtBeginSortCond", */
      T: 1
    },
    /*::[*/
    533: {
      /* n:"BrtEndSortCond", */
      T: -1
    },
    /*::[*/
    534: {
      /* n:"BrtBookProtection" */
    },
    /*::[*/
    535: {
      /* n:"BrtSheetProtection" */
    },
    /*::[*/
    536: {
      /* n:"BrtRangeProtection" */
    },
    /*::[*/
    537: {
      /* n:"BrtPhoneticInfo" */
    },
    /*::[*/
    538: {
      /* n:"BrtBeginECTxtWiz", */
      T: 1
    },
    /*::[*/
    539: {
      /* n:"BrtEndECTxtWiz", */
      T: -1
    },
    /*::[*/
    540: {
      /* n:"BrtBeginECTWFldInfoLst", */
      T: 1
    },
    /*::[*/
    541: {
      /* n:"BrtEndECTWFldInfoLst", */
      T: -1
    },
    /*::[*/
    542: {
      /* n:"BrtBeginECTwFldInfo", */
      T: 1
    },
    /*::[*/
    548: {
      /* n:"BrtFileSharing" */
    },
    /*::[*/
    549: {
      /* n:"BrtOleSize" */
    },
    /*::[*/
    550: {
      /* n:"BrtDrawing", */
      f: parse_RelID
    },
    /*::[*/
    551: {
      /* n:"BrtLegacyDrawing" */
    },
    /*::[*/
    552: {
      /* n:"BrtLegacyDrawingHF" */
    },
    /*::[*/
    553: {
      /* n:"BrtWebOpt" */
    },
    /*::[*/
    554: {
      /* n:"BrtBeginWebPubItems", */
      T: 1
    },
    /*::[*/
    555: {
      /* n:"BrtEndWebPubItems", */
      T: -1
    },
    /*::[*/
    556: {
      /* n:"BrtBeginWebPubItem", */
      T: 1
    },
    /*::[*/
    557: {
      /* n:"BrtEndWebPubItem", */
      T: -1
    },
    /*::[*/
    558: {
      /* n:"BrtBeginSXCondFmt", */
      T: 1
    },
    /*::[*/
    559: {
      /* n:"BrtEndSXCondFmt", */
      T: -1
    },
    /*::[*/
    560: {
      /* n:"BrtBeginSXCondFmts", */
      T: 1
    },
    /*::[*/
    561: {
      /* n:"BrtEndSXCondFmts", */
      T: -1
    },
    /*::[*/
    562: {
      /* n:"BrtBkHim" */
    },
    /*::[*/
    564: {
      /* n:"BrtColor" */
    },
    /*::[*/
    565: {
      /* n:"BrtBeginIndexedColors", */
      T: 1
    },
    /*::[*/
    566: {
      /* n:"BrtEndIndexedColors", */
      T: -1
    },
    /*::[*/
    569: {
      /* n:"BrtBeginMRUColors", */
      T: 1
    },
    /*::[*/
    570: {
      /* n:"BrtEndMRUColors", */
      T: -1
    },
    /*::[*/
    572: {
      /* n:"BrtMRUColor" */
    },
    /*::[*/
    573: {
      /* n:"BrtBeginDVals", */
      T: 1
    },
    /*::[*/
    574: {
      /* n:"BrtEndDVals", */
      T: -1
    },
    /*::[*/
    577: {
      /* n:"BrtSupNameStart" */
    },
    /*::[*/
    578: {
      /* n:"BrtSupNameValueStart" */
    },
    /*::[*/
    579: {
      /* n:"BrtSupNameValueEnd" */
    },
    /*::[*/
    580: {
      /* n:"BrtSupNameNum" */
    },
    /*::[*/
    581: {
      /* n:"BrtSupNameErr" */
    },
    /*::[*/
    582: {
      /* n:"BrtSupNameSt" */
    },
    /*::[*/
    583: {
      /* n:"BrtSupNameNil" */
    },
    /*::[*/
    584: {
      /* n:"BrtSupNameBool" */
    },
    /*::[*/
    585: {
      /* n:"BrtSupNameFmla" */
    },
    /*::[*/
    586: {
      /* n:"BrtSupNameBits" */
    },
    /*::[*/
    587: {
      /* n:"BrtSupNameEnd" */
    },
    /*::[*/
    588: {
      /* n:"BrtEndSupBook", */
      T: -1
    },
    /*::[*/
    589: {
      /* n:"BrtCellSmartTagProperty" */
    },
    /*::[*/
    590: {
      /* n:"BrtBeginCellSmartTag", */
      T: 1
    },
    /*::[*/
    591: {
      /* n:"BrtEndCellSmartTag", */
      T: -1
    },
    /*::[*/
    592: {
      /* n:"BrtBeginCellSmartTags", */
      T: 1
    },
    /*::[*/
    593: {
      /* n:"BrtEndCellSmartTags", */
      T: -1
    },
    /*::[*/
    594: {
      /* n:"BrtBeginSmartTags", */
      T: 1
    },
    /*::[*/
    595: {
      /* n:"BrtEndSmartTags", */
      T: -1
    },
    /*::[*/
    596: {
      /* n:"BrtSmartTagType" */
    },
    /*::[*/
    597: {
      /* n:"BrtBeginSmartTagTypes", */
      T: 1
    },
    /*::[*/
    598: {
      /* n:"BrtEndSmartTagTypes", */
      T: -1
    },
    /*::[*/
    599: {
      /* n:"BrtBeginSXFilters", */
      T: 1
    },
    /*::[*/
    600: {
      /* n:"BrtEndSXFilters", */
      T: -1
    },
    /*::[*/
    601: {
      /* n:"BrtBeginSXFILTER", */
      T: 1
    },
    /*::[*/
    602: {
      /* n:"BrtEndSXFilter", */
      T: -1
    },
    /*::[*/
    603: {
      /* n:"BrtBeginFills", */
      T: 1
    },
    /*::[*/
    604: {
      /* n:"BrtEndFills", */
      T: -1
    },
    /*::[*/
    605: {
      /* n:"BrtBeginCellWatches", */
      T: 1
    },
    /*::[*/
    606: {
      /* n:"BrtEndCellWatches", */
      T: -1
    },
    /*::[*/
    607: {
      /* n:"BrtCellWatch" */
    },
    /*::[*/
    608: {
      /* n:"BrtBeginCRErrs", */
      T: 1
    },
    /*::[*/
    609: {
      /* n:"BrtEndCRErrs", */
      T: -1
    },
    /*::[*/
    610: {
      /* n:"BrtCrashRecErr" */
    },
    /*::[*/
    611: {
      /* n:"BrtBeginFonts", */
      T: 1
    },
    /*::[*/
    612: {
      /* n:"BrtEndFonts", */
      T: -1
    },
    /*::[*/
    613: {
      /* n:"BrtBeginBorders", */
      T: 1
    },
    /*::[*/
    614: {
      /* n:"BrtEndBorders", */
      T: -1
    },
    /*::[*/
    615: {
      /* n:"BrtBeginFmts", */
      T: 1
    },
    /*::[*/
    616: {
      /* n:"BrtEndFmts", */
      T: -1
    },
    /*::[*/
    617: {
      /* n:"BrtBeginCellXFs", */
      T: 1
    },
    /*::[*/
    618: {
      /* n:"BrtEndCellXFs", */
      T: -1
    },
    /*::[*/
    619: {
      /* n:"BrtBeginStyles", */
      T: 1
    },
    /*::[*/
    620: {
      /* n:"BrtEndStyles", */
      T: -1
    },
    /*::[*/
    625: {
      /* n:"BrtBigName" */
    },
    /*::[*/
    626: {
      /* n:"BrtBeginCellStyleXFs", */
      T: 1
    },
    /*::[*/
    627: {
      /* n:"BrtEndCellStyleXFs", */
      T: -1
    },
    /*::[*/
    628: {
      /* n:"BrtBeginComments", */
      T: 1
    },
    /*::[*/
    629: {
      /* n:"BrtEndComments", */
      T: -1
    },
    /*::[*/
    630: {
      /* n:"BrtBeginCommentAuthors", */
      T: 1
    },
    /*::[*/
    631: {
      /* n:"BrtEndCommentAuthors", */
      T: -1
    },
    /*::[*/
    632: {
      /* n:"BrtCommentAuthor", */
      f: parse_BrtCommentAuthor
    },
    /*::[*/
    633: {
      /* n:"BrtBeginCommentList", */
      T: 1
    },
    /*::[*/
    634: {
      /* n:"BrtEndCommentList", */
      T: -1
    },
    /*::[*/
    635: {
      /* n:"BrtBeginComment", */
      T: 1,
      f: parse_BrtBeginComment
    },
    /*::[*/
    636: {
      /* n:"BrtEndComment", */
      T: -1
    },
    /*::[*/
    637: {
      /* n:"BrtCommentText", */
      f: parse_BrtCommentText
    },
    /*::[*/
    638: {
      /* n:"BrtBeginOleObjects", */
      T: 1
    },
    /*::[*/
    639: {
      /* n:"BrtOleObject" */
    },
    /*::[*/
    640: {
      /* n:"BrtEndOleObjects", */
      T: -1
    },
    /*::[*/
    641: {
      /* n:"BrtBeginSxrules", */
      T: 1
    },
    /*::[*/
    642: {
      /* n:"BrtEndSxRules", */
      T: -1
    },
    /*::[*/
    643: {
      /* n:"BrtBeginActiveXControls", */
      T: 1
    },
    /*::[*/
    644: {
      /* n:"BrtActiveX" */
    },
    /*::[*/
    645: {
      /* n:"BrtEndActiveXControls", */
      T: -1
    },
    /*::[*/
    646: {
      /* n:"BrtBeginPCDSDTCEMembersSortBy", */
      T: 1
    },
    /*::[*/
    648: {
      /* n:"BrtBeginCellIgnoreECs", */
      T: 1
    },
    /*::[*/
    649: {
      /* n:"BrtCellIgnoreEC" */
    },
    /*::[*/
    650: {
      /* n:"BrtEndCellIgnoreECs", */
      T: -1
    },
    /*::[*/
    651: {
      /* n:"BrtCsProp", */
      f: parse_BrtCsProp
    },
    /*::[*/
    652: {
      /* n:"BrtCsPageSetup" */
    },
    /*::[*/
    653: {
      /* n:"BrtBeginUserCsViews", */
      T: 1
    },
    /*::[*/
    654: {
      /* n:"BrtEndUserCsViews", */
      T: -1
    },
    /*::[*/
    655: {
      /* n:"BrtBeginUserCsView", */
      T: 1
    },
    /*::[*/
    656: {
      /* n:"BrtEndUserCsView", */
      T: -1
    },
    /*::[*/
    657: {
      /* n:"BrtBeginPcdSFCIEntries", */
      T: 1
    },
    /*::[*/
    658: {
      /* n:"BrtEndPCDSFCIEntries", */
      T: -1
    },
    /*::[*/
    659: {
      /* n:"BrtPCDSFCIEntry" */
    },
    /*::[*/
    660: {
      /* n:"BrtBeginListParts", */
      T: 1
    },
    /*::[*/
    661: {
      /* n:"BrtListPart" */
    },
    /*::[*/
    662: {
      /* n:"BrtEndListParts", */
      T: -1
    },
    /*::[*/
    663: {
      /* n:"BrtSheetCalcProp" */
    },
    /*::[*/
    664: {
      /* n:"BrtBeginFnGroup", */
      T: 1
    },
    /*::[*/
    665: {
      /* n:"BrtFnGroup" */
    },
    /*::[*/
    666: {
      /* n:"BrtEndFnGroup", */
      T: -1
    },
    /*::[*/
    667: {
      /* n:"BrtSupAddin" */
    },
    /*::[*/
    668: {
      /* n:"BrtSXTDMPOrder" */
    },
    /*::[*/
    669: {
      /* n:"BrtCsProtection" */
    },
    /*::[*/
    671: {
      /* n:"BrtBeginWsSortMap", */
      T: 1
    },
    /*::[*/
    672: {
      /* n:"BrtEndWsSortMap", */
      T: -1
    },
    /*::[*/
    673: {
      /* n:"BrtBeginRRSort", */
      T: 1
    },
    /*::[*/
    674: {
      /* n:"BrtEndRRSort", */
      T: -1
    },
    /*::[*/
    675: {
      /* n:"BrtRRSortItem" */
    },
    /*::[*/
    676: {
      /* n:"BrtFileSharingIso" */
    },
    /*::[*/
    677: {
      /* n:"BrtBookProtectionIso" */
    },
    /*::[*/
    678: {
      /* n:"BrtSheetProtectionIso" */
    },
    /*::[*/
    679: {
      /* n:"BrtCsProtectionIso" */
    },
    /*::[*/
    680: {
      /* n:"BrtRangeProtectionIso" */
    },
    /*::[*/
    681: {
      /* n:"BrtDValList" */
    },
    /*::[*/
    1024: {
      /* n:"BrtRwDescent" */
    },
    /*::[*/
    1025: {
      /* n:"BrtKnownFonts" */
    },
    /*::[*/
    1026: {
      /* n:"BrtBeginSXTupleSet", */
      T: 1
    },
    /*::[*/
    1027: {
      /* n:"BrtEndSXTupleSet", */
      T: -1
    },
    /*::[*/
    1028: {
      /* n:"BrtBeginSXTupleSetHeader", */
      T: 1
    },
    /*::[*/
    1029: {
      /* n:"BrtEndSXTupleSetHeader", */
      T: -1
    },
    /*::[*/
    1030: {
      /* n:"BrtSXTupleSetHeaderItem" */
    },
    /*::[*/
    1031: {
      /* n:"BrtBeginSXTupleSetData", */
      T: 1
    },
    /*::[*/
    1032: {
      /* n:"BrtEndSXTupleSetData", */
      T: -1
    },
    /*::[*/
    1033: {
      /* n:"BrtBeginSXTupleSetRow", */
      T: 1
    },
    /*::[*/
    1034: {
      /* n:"BrtEndSXTupleSetRow", */
      T: -1
    },
    /*::[*/
    1035: {
      /* n:"BrtSXTupleSetRowItem" */
    },
    /*::[*/
    1036: {
      /* n:"BrtNameExt" */
    },
    /*::[*/
    1037: {
      /* n:"BrtPCDH14" */
    },
    /*::[*/
    1038: {
      /* n:"BrtBeginPCDCalcMem14", */
      T: 1
    },
    /*::[*/
    1039: {
      /* n:"BrtEndPCDCalcMem14", */
      T: -1
    },
    /*::[*/
    1040: {
      /* n:"BrtSXTH14" */
    },
    /*::[*/
    1041: {
      /* n:"BrtBeginSparklineGroup", */
      T: 1
    },
    /*::[*/
    1042: {
      /* n:"BrtEndSparklineGroup", */
      T: -1
    },
    /*::[*/
    1043: {
      /* n:"BrtSparkline" */
    },
    /*::[*/
    1044: {
      /* n:"BrtSXDI14" */
    },
    /*::[*/
    1045: {
      /* n:"BrtWsFmtInfoEx14" */
    },
    /*::[*/
    1046: {
      /* n:"BrtBeginConditionalFormatting14", */
      T: 1
    },
    /*::[*/
    1047: {
      /* n:"BrtEndConditionalFormatting14", */
      T: -1
    },
    /*::[*/
    1048: {
      /* n:"BrtBeginCFRule14", */
      T: 1
    },
    /*::[*/
    1049: {
      /* n:"BrtEndCFRule14", */
      T: -1
    },
    /*::[*/
    1050: {
      /* n:"BrtCFVO14" */
    },
    /*::[*/
    1051: {
      /* n:"BrtBeginDatabar14", */
      T: 1
    },
    /*::[*/
    1052: {
      /* n:"BrtBeginIconSet14", */
      T: 1
    },
    /*::[*/
    1053: {
      /* n:"BrtDVal14", */
      f: parse_BrtDVal14
    },
    /*::[*/
    1054: {
      /* n:"BrtBeginDVals14", */
      T: 1
    },
    /*::[*/
    1055: {
      /* n:"BrtColor14" */
    },
    /*::[*/
    1056: {
      /* n:"BrtBeginSparklines", */
      T: 1
    },
    /*::[*/
    1057: {
      /* n:"BrtEndSparklines", */
      T: -1
    },
    /*::[*/
    1058: {
      /* n:"BrtBeginSparklineGroups", */
      T: 1
    },
    /*::[*/
    1059: {
      /* n:"BrtEndSparklineGroups", */
      T: -1
    },
    /*::[*/
    1061: {
      /* n:"BrtSXVD14" */
    },
    /*::[*/
    1062: {
      /* n:"BrtBeginSXView14", */
      T: 1
    },
    /*::[*/
    1063: {
      /* n:"BrtEndSXView14", */
      T: -1
    },
    /*::[*/
    1064: {
      /* n:"BrtBeginSXView16", */
      T: 1
    },
    /*::[*/
    1065: {
      /* n:"BrtEndSXView16", */
      T: -1
    },
    /*::[*/
    1066: {
      /* n:"BrtBeginPCD14", */
      T: 1
    },
    /*::[*/
    1067: {
      /* n:"BrtEndPCD14", */
      T: -1
    },
    /*::[*/
    1068: {
      /* n:"BrtBeginExtConn14", */
      T: 1
    },
    /*::[*/
    1069: {
      /* n:"BrtEndExtConn14", */
      T: -1
    },
    /*::[*/
    1070: {
      /* n:"BrtBeginSlicerCacheIDs", */
      T: 1
    },
    /*::[*/
    1071: {
      /* n:"BrtEndSlicerCacheIDs", */
      T: -1
    },
    /*::[*/
    1072: {
      /* n:"BrtBeginSlicerCacheID", */
      T: 1
    },
    /*::[*/
    1073: {
      /* n:"BrtEndSlicerCacheID", */
      T: -1
    },
    /*::[*/
    1075: {
      /* n:"BrtBeginSlicerCache", */
      T: 1
    },
    /*::[*/
    1076: {
      /* n:"BrtEndSlicerCache", */
      T: -1
    },
    /*::[*/
    1077: {
      /* n:"BrtBeginSlicerCacheDef", */
      T: 1
    },
    /*::[*/
    1078: {
      /* n:"BrtEndSlicerCacheDef", */
      T: -1
    },
    /*::[*/
    1079: {
      /* n:"BrtBeginSlicersEx", */
      T: 1
    },
    /*::[*/
    1080: {
      /* n:"BrtEndSlicersEx", */
      T: -1
    },
    /*::[*/
    1081: {
      /* n:"BrtBeginSlicerEx", */
      T: 1
    },
    /*::[*/
    1082: {
      /* n:"BrtEndSlicerEx", */
      T: -1
    },
    /*::[*/
    1083: {
      /* n:"BrtBeginSlicer", */
      T: 1
    },
    /*::[*/
    1084: {
      /* n:"BrtEndSlicer", */
      T: -1
    },
    /*::[*/
    1085: {
      /* n:"BrtSlicerCachePivotTables" */
    },
    /*::[*/
    1086: {
      /* n:"BrtBeginSlicerCacheOlapImpl", */
      T: 1
    },
    /*::[*/
    1087: {
      /* n:"BrtEndSlicerCacheOlapImpl", */
      T: -1
    },
    /*::[*/
    1088: {
      /* n:"BrtBeginSlicerCacheLevelsData", */
      T: 1
    },
    /*::[*/
    1089: {
      /* n:"BrtEndSlicerCacheLevelsData", */
      T: -1
    },
    /*::[*/
    1090: {
      /* n:"BrtBeginSlicerCacheLevelData", */
      T: 1
    },
    /*::[*/
    1091: {
      /* n:"BrtEndSlicerCacheLevelData", */
      T: -1
    },
    /*::[*/
    1092: {
      /* n:"BrtBeginSlicerCacheSiRanges", */
      T: 1
    },
    /*::[*/
    1093: {
      /* n:"BrtEndSlicerCacheSiRanges", */
      T: -1
    },
    /*::[*/
    1094: {
      /* n:"BrtBeginSlicerCacheSiRange", */
      T: 1
    },
    /*::[*/
    1095: {
      /* n:"BrtEndSlicerCacheSiRange", */
      T: -1
    },
    /*::[*/
    1096: {
      /* n:"BrtSlicerCacheOlapItem" */
    },
    /*::[*/
    1097: {
      /* n:"BrtBeginSlicerCacheSelections", */
      T: 1
    },
    /*::[*/
    1098: {
      /* n:"BrtSlicerCacheSelection" */
    },
    /*::[*/
    1099: {
      /* n:"BrtEndSlicerCacheSelections", */
      T: -1
    },
    /*::[*/
    1100: {
      /* n:"BrtBeginSlicerCacheNative", */
      T: 1
    },
    /*::[*/
    1101: {
      /* n:"BrtEndSlicerCacheNative", */
      T: -1
    },
    /*::[*/
    1102: {
      /* n:"BrtSlicerCacheNativeItem" */
    },
    /*::[*/
    1103: {
      /* n:"BrtRangeProtection14" */
    },
    /*::[*/
    1104: {
      /* n:"BrtRangeProtectionIso14" */
    },
    /*::[*/
    1105: {
      /* n:"BrtCellIgnoreEC14" */
    },
    /*::[*/
    1111: {
      /* n:"BrtList14" */
    },
    /*::[*/
    1112: {
      /* n:"BrtCFIcon" */
    },
    /*::[*/
    1113: {
      /* n:"BrtBeginSlicerCachesPivotCacheIDs", */
      T: 1
    },
    /*::[*/
    1114: {
      /* n:"BrtEndSlicerCachesPivotCacheIDs", */
      T: -1
    },
    /*::[*/
    1115: {
      /* n:"BrtBeginSlicers", */
      T: 1
    },
    /*::[*/
    1116: {
      /* n:"BrtEndSlicers", */
      T: -1
    },
    /*::[*/
    1117: {
      /* n:"BrtWbProp14" */
    },
    /*::[*/
    1118: {
      /* n:"BrtBeginSXEdit", */
      T: 1
    },
    /*::[*/
    1119: {
      /* n:"BrtEndSXEdit", */
      T: -1
    },
    /*::[*/
    1120: {
      /* n:"BrtBeginSXEdits", */
      T: 1
    },
    /*::[*/
    1121: {
      /* n:"BrtEndSXEdits", */
      T: -1
    },
    /*::[*/
    1122: {
      /* n:"BrtBeginSXChange", */
      T: 1
    },
    /*::[*/
    1123: {
      /* n:"BrtEndSXChange", */
      T: -1
    },
    /*::[*/
    1124: {
      /* n:"BrtBeginSXChanges", */
      T: 1
    },
    /*::[*/
    1125: {
      /* n:"BrtEndSXChanges", */
      T: -1
    },
    /*::[*/
    1126: {
      /* n:"BrtSXTupleItems" */
    },
    /*::[*/
    1128: {
      /* n:"BrtBeginSlicerStyle", */
      T: 1
    },
    /*::[*/
    1129: {
      /* n:"BrtEndSlicerStyle", */
      T: -1
    },
    /*::[*/
    1130: {
      /* n:"BrtSlicerStyleElement" */
    },
    /*::[*/
    1131: {
      /* n:"BrtBeginStyleSheetExt14", */
      T: 1
    },
    /*::[*/
    1132: {
      /* n:"BrtEndStyleSheetExt14", */
      T: -1
    },
    /*::[*/
    1133: {
      /* n:"BrtBeginSlicerCachesPivotCacheID", */
      T: 1
    },
    /*::[*/
    1134: {
      /* n:"BrtEndSlicerCachesPivotCacheID", */
      T: -1
    },
    /*::[*/
    1135: {
      /* n:"BrtBeginConditionalFormattings", */
      T: 1
    },
    /*::[*/
    1136: {
      /* n:"BrtEndConditionalFormattings", */
      T: -1
    },
    /*::[*/
    1137: {
      /* n:"BrtBeginPCDCalcMemExt", */
      T: 1
    },
    /*::[*/
    1138: {
      /* n:"BrtEndPCDCalcMemExt", */
      T: -1
    },
    /*::[*/
    1139: {
      /* n:"BrtBeginPCDCalcMemsExt", */
      T: 1
    },
    /*::[*/
    1140: {
      /* n:"BrtEndPCDCalcMemsExt", */
      T: -1
    },
    /*::[*/
    1141: {
      /* n:"BrtPCDField14" */
    },
    /*::[*/
    1142: {
      /* n:"BrtBeginSlicerStyles", */
      T: 1
    },
    /*::[*/
    1143: {
      /* n:"BrtEndSlicerStyles", */
      T: -1
    },
    /*::[*/
    1144: {
      /* n:"BrtBeginSlicerStyleElements", */
      T: 1
    },
    /*::[*/
    1145: {
      /* n:"BrtEndSlicerStyleElements", */
      T: -1
    },
    /*::[*/
    1146: {
      /* n:"BrtCFRuleExt" */
    },
    /*::[*/
    1147: {
      /* n:"BrtBeginSXCondFmt14", */
      T: 1
    },
    /*::[*/
    1148: {
      /* n:"BrtEndSXCondFmt14", */
      T: -1
    },
    /*::[*/
    1149: {
      /* n:"BrtBeginSXCondFmts14", */
      T: 1
    },
    /*::[*/
    1150: {
      /* n:"BrtEndSXCondFmts14", */
      T: -1
    },
    /*::[*/
    1152: {
      /* n:"BrtBeginSortCond14", */
      T: 1
    },
    /*::[*/
    1153: {
      /* n:"BrtEndSortCond14", */
      T: -1
    },
    /*::[*/
    1154: {
      /* n:"BrtEndDVals14", */
      T: -1
    },
    /*::[*/
    1155: {
      /* n:"BrtEndIconSet14", */
      T: -1
    },
    /*::[*/
    1156: {
      /* n:"BrtEndDatabar14", */
      T: -1
    },
    /*::[*/
    1157: {
      /* n:"BrtBeginColorScale14", */
      T: 1
    },
    /*::[*/
    1158: {
      /* n:"BrtEndColorScale14", */
      T: -1
    },
    /*::[*/
    1159: {
      /* n:"BrtBeginSxrules14", */
      T: 1
    },
    /*::[*/
    1160: {
      /* n:"BrtEndSxrules14", */
      T: -1
    },
    /*::[*/
    1161: {
      /* n:"BrtBeginPRule14", */
      T: 1
    },
    /*::[*/
    1162: {
      /* n:"BrtEndPRule14", */
      T: -1
    },
    /*::[*/
    1163: {
      /* n:"BrtBeginPRFilters14", */
      T: 1
    },
    /*::[*/
    1164: {
      /* n:"BrtEndPRFilters14", */
      T: -1
    },
    /*::[*/
    1165: {
      /* n:"BrtBeginPRFilter14", */
      T: 1
    },
    /*::[*/
    1166: {
      /* n:"BrtEndPRFilter14", */
      T: -1
    },
    /*::[*/
    1167: {
      /* n:"BrtBeginPRFItem14", */
      T: 1
    },
    /*::[*/
    1168: {
      /* n:"BrtEndPRFItem14", */
      T: -1
    },
    /*::[*/
    1169: {
      /* n:"BrtBeginCellIgnoreECs14", */
      T: 1
    },
    /*::[*/
    1170: {
      /* n:"BrtEndCellIgnoreECs14", */
      T: -1
    },
    /*::[*/
    1171: {
      /* n:"BrtDxf14" */
    },
    /*::[*/
    1172: {
      /* n:"BrtBeginDxF14s", */
      T: 1
    },
    /*::[*/
    1173: {
      /* n:"BrtEndDxf14s", */
      T: -1
    },
    /*::[*/
    1177: {
      /* n:"BrtFilter14" */
    },
    /*::[*/
    1178: {
      /* n:"BrtBeginCustomFilters14", */
      T: 1
    },
    /*::[*/
    1180: {
      /* n:"BrtCustomFilter14" */
    },
    /*::[*/
    1181: {
      /* n:"BrtIconFilter14" */
    },
    /*::[*/
    1182: {
      /* n:"BrtPivotCacheConnectionName" */
    },
    /*::[*/
    2048: {
      /* n:"BrtBeginDecoupledPivotCacheIDs", */
      T: 1
    },
    /*::[*/
    2049: {
      /* n:"BrtEndDecoupledPivotCacheIDs", */
      T: -1
    },
    /*::[*/
    2050: {
      /* n:"BrtDecoupledPivotCacheID" */
    },
    /*::[*/
    2051: {
      /* n:"BrtBeginPivotTableRefs", */
      T: 1
    },
    /*::[*/
    2052: {
      /* n:"BrtEndPivotTableRefs", */
      T: -1
    },
    /*::[*/
    2053: {
      /* n:"BrtPivotTableRef" */
    },
    /*::[*/
    2054: {
      /* n:"BrtSlicerCacheBookPivotTables" */
    },
    /*::[*/
    2055: {
      /* n:"BrtBeginSxvcells", */
      T: 1
    },
    /*::[*/
    2056: {
      /* n:"BrtEndSxvcells", */
      T: -1
    },
    /*::[*/
    2057: {
      /* n:"BrtBeginSxRow", */
      T: 1
    },
    /*::[*/
    2058: {
      /* n:"BrtEndSxRow", */
      T: -1
    },
    /*::[*/
    2060: {
      /* n:"BrtPcdCalcMem15" */
    },
    /*::[*/
    2067: {
      /* n:"BrtQsi15" */
    },
    /*::[*/
    2068: {
      /* n:"BrtBeginWebExtensions", */
      T: 1
    },
    /*::[*/
    2069: {
      /* n:"BrtEndWebExtensions", */
      T: -1
    },
    /*::[*/
    2070: {
      /* n:"BrtWebExtension" */
    },
    /*::[*/
    2071: {
      /* n:"BrtAbsPath15" */
    },
    /*::[*/
    2072: {
      /* n:"BrtBeginPivotTableUISettings", */
      T: 1
    },
    /*::[*/
    2073: {
      /* n:"BrtEndPivotTableUISettings", */
      T: -1
    },
    /*::[*/
    2075: {
      /* n:"BrtTableSlicerCacheIDs" */
    },
    /*::[*/
    2076: {
      /* n:"BrtTableSlicerCacheID" */
    },
    /*::[*/
    2077: {
      /* n:"BrtBeginTableSlicerCache", */
      T: 1
    },
    /*::[*/
    2078: {
      /* n:"BrtEndTableSlicerCache", */
      T: -1
    },
    /*::[*/
    2079: {
      /* n:"BrtSxFilter15" */
    },
    /*::[*/
    2080: {
      /* n:"BrtBeginTimelineCachePivotCacheIDs", */
      T: 1
    },
    /*::[*/
    2081: {
      /* n:"BrtEndTimelineCachePivotCacheIDs", */
      T: -1
    },
    /*::[*/
    2082: {
      /* n:"BrtTimelineCachePivotCacheID" */
    },
    /*::[*/
    2083: {
      /* n:"BrtBeginTimelineCacheIDs", */
      T: 1
    },
    /*::[*/
    2084: {
      /* n:"BrtEndTimelineCacheIDs", */
      T: -1
    },
    /*::[*/
    2085: {
      /* n:"BrtBeginTimelineCacheID", */
      T: 1
    },
    /*::[*/
    2086: {
      /* n:"BrtEndTimelineCacheID", */
      T: -1
    },
    /*::[*/
    2087: {
      /* n:"BrtBeginTimelinesEx", */
      T: 1
    },
    /*::[*/
    2088: {
      /* n:"BrtEndTimelinesEx", */
      T: -1
    },
    /*::[*/
    2089: {
      /* n:"BrtBeginTimelineEx", */
      T: 1
    },
    /*::[*/
    2090: {
      /* n:"BrtEndTimelineEx", */
      T: -1
    },
    /*::[*/
    2091: {
      /* n:"BrtWorkBookPr15" */
    },
    /*::[*/
    2092: {
      /* n:"BrtPCDH15" */
    },
    /*::[*/
    2093: {
      /* n:"BrtBeginTimelineStyle", */
      T: 1
    },
    /*::[*/
    2094: {
      /* n:"BrtEndTimelineStyle", */
      T: -1
    },
    /*::[*/
    2095: {
      /* n:"BrtTimelineStyleElement" */
    },
    /*::[*/
    2096: {
      /* n:"BrtBeginTimelineStylesheetExt15", */
      T: 1
    },
    /*::[*/
    2097: {
      /* n:"BrtEndTimelineStylesheetExt15", */
      T: -1
    },
    /*::[*/
    2098: {
      /* n:"BrtBeginTimelineStyles", */
      T: 1
    },
    /*::[*/
    2099: {
      /* n:"BrtEndTimelineStyles", */
      T: -1
    },
    /*::[*/
    2100: {
      /* n:"BrtBeginTimelineStyleElements", */
      T: 1
    },
    /*::[*/
    2101: {
      /* n:"BrtEndTimelineStyleElements", */
      T: -1
    },
    /*::[*/
    2102: {
      /* n:"BrtDxf15" */
    },
    /*::[*/
    2103: {
      /* n:"BrtBeginDxfs15", */
      T: 1
    },
    /*::[*/
    2104: {
      /* n:"BrtEndDxfs15", */
      T: -1
    },
    /*::[*/
    2105: {
      /* n:"BrtSlicerCacheHideItemsWithNoData" */
    },
    /*::[*/
    2106: {
      /* n:"BrtBeginItemUniqueNames", */
      T: 1
    },
    /*::[*/
    2107: {
      /* n:"BrtEndItemUniqueNames", */
      T: -1
    },
    /*::[*/
    2108: {
      /* n:"BrtItemUniqueName" */
    },
    /*::[*/
    2109: {
      /* n:"BrtBeginExtConn15", */
      T: 1
    },
    /*::[*/
    2110: {
      /* n:"BrtEndExtConn15", */
      T: -1
    },
    /*::[*/
    2111: {
      /* n:"BrtBeginOledbPr15", */
      T: 1
    },
    /*::[*/
    2112: {
      /* n:"BrtEndOledbPr15", */
      T: -1
    },
    /*::[*/
    2113: {
      /* n:"BrtBeginDataFeedPr15", */
      T: 1
    },
    /*::[*/
    2114: {
      /* n:"BrtEndDataFeedPr15", */
      T: -1
    },
    /*::[*/
    2115: {
      /* n:"BrtTextPr15" */
    },
    /*::[*/
    2116: {
      /* n:"BrtRangePr15" */
    },
    /*::[*/
    2117: {
      /* n:"BrtDbCommand15" */
    },
    /*::[*/
    2118: {
      /* n:"BrtBeginDbTables15", */
      T: 1
    },
    /*::[*/
    2119: {
      /* n:"BrtEndDbTables15", */
      T: -1
    },
    /*::[*/
    2120: {
      /* n:"BrtDbTable15" */
    },
    /*::[*/
    2121: {
      /* n:"BrtBeginDataModel", */
      T: 1
    },
    /*::[*/
    2122: {
      /* n:"BrtEndDataModel", */
      T: -1
    },
    /*::[*/
    2123: {
      /* n:"BrtBeginModelTables", */
      T: 1
    },
    /*::[*/
    2124: {
      /* n:"BrtEndModelTables", */
      T: -1
    },
    /*::[*/
    2125: {
      /* n:"BrtModelTable" */
    },
    /*::[*/
    2126: {
      /* n:"BrtBeginModelRelationships", */
      T: 1
    },
    /*::[*/
    2127: {
      /* n:"BrtEndModelRelationships", */
      T: -1
    },
    /*::[*/
    2128: {
      /* n:"BrtModelRelationship" */
    },
    /*::[*/
    2129: {
      /* n:"BrtBeginECTxtWiz15", */
      T: 1
    },
    /*::[*/
    2130: {
      /* n:"BrtEndECTxtWiz15", */
      T: -1
    },
    /*::[*/
    2131: {
      /* n:"BrtBeginECTWFldInfoLst15", */
      T: 1
    },
    /*::[*/
    2132: {
      /* n:"BrtEndECTWFldInfoLst15", */
      T: -1
    },
    /*::[*/
    2133: {
      /* n:"BrtBeginECTWFldInfo15", */
      T: 1
    },
    /*::[*/
    2134: {
      /* n:"BrtFieldListActiveItem" */
    },
    /*::[*/
    2135: {
      /* n:"BrtPivotCacheIdVersion" */
    },
    /*::[*/
    2136: {
      /* n:"BrtSXDI15" */
    },
    /*::[*/
    2137: {
      /* n:"BrtBeginModelTimeGroupings", */
      T: 1
    },
    /*::[*/
    2138: {
      /* n:"BrtEndModelTimeGroupings", */
      T: -1
    },
    /*::[*/
    2139: {
      /* n:"BrtBeginModelTimeGrouping", */
      T: 1
    },
    /*::[*/
    2140: {
      /* n:"BrtEndModelTimeGrouping", */
      T: -1
    },
    /*::[*/
    2141: {
      /* n:"BrtModelTimeGroupingCalcCol" */
    },
    /*::[*/
    3072: {
      /* n:"BrtUid" */
    },
    /*::[*/
    3073: {
      /* n:"BrtRevisionPtr" */
    },
    /*::[*/
    4096: {
      /* n:"BrtBeginDynamicArrayPr", */
      T: 1
    },
    /*::[*/
    4097: {
      /* n:"BrtEndDynamicArrayPr", */
      T: -1
    },
    /*::[*/
    5002: {
      /* n:"BrtBeginRichValueBlock", */
      T: 1
    },
    /*::[*/
    5003: {
      /* n:"BrtEndRichValueBlock", */
      T: -1
    },
    /*::[*/
    5081: {
      /* n:"BrtBeginRichFilters", */
      T: 1
    },
    /*::[*/
    5082: {
      /* n:"BrtEndRichFilters", */
      T: -1
    },
    /*::[*/
    5083: {
      /* n:"BrtRichFilter" */
    },
    /*::[*/
    5084: {
      /* n:"BrtBeginRichFilterColumn", */
      T: 1
    },
    /*::[*/
    5085: {
      /* n:"BrtEndRichFilterColumn", */
      T: -1
    },
    /*::[*/
    5086: {
      /* n:"BrtBeginCustomRichFilters", */
      T: 1
    },
    /*::[*/
    5087: {
      /* n:"BrtEndCustomRichFilters", */
      T: -1
    },
    /*::[*/
    5088: {
      /* n:"BrtCustomRichFilter" */
    },
    /*::[*/
    5089: {
      /* n:"BrtTop10RichFilter" */
    },
    /*::[*/
    5090: {
      /* n:"BrtDynamicRichFilter" */
    },
    /*::[*/
    5092: {
      /* n:"BrtBeginRichSortCondition", */
      T: 1
    },
    /*::[*/
    5093: {
      /* n:"BrtEndRichSortCondition", */
      T: -1
    },
    /*::[*/
    5094: {
      /* n:"BrtRichFilterDateGroupItem" */
    },
    /*::[*/
    5095: {
      /* n:"BrtBeginCalcFeatures", */
      T: 1
    },
    /*::[*/
    5096: {
      /* n:"BrtEndCalcFeatures", */
      T: -1
    },
    /*::[*/
    5097: {
      /* n:"BrtCalcFeature" */
    },
    /*::[*/
    5099: {
      /* n:"BrtExternalLinksPr" */
    },
    /*::[*/
    65535: { n: "" }
  };
  var XLSRecordEnum = {
    /* [MS-XLS] 2.3 Record Enumeration 2021-08-17 */
    /*::[*/
    6: {
      /* n:"Formula", */
      f: parse_Formula
    },
    /*::[*/
    10: {
      /* n:"EOF", */
      f: parsenoop2
    },
    /*::[*/
    12: {
      /* n:"CalcCount", */
      f: parseuint16
    },
    //
    /*::[*/
    13: {
      /* n:"CalcMode", */
      f: parseuint16
    },
    //
    /*::[*/
    14: {
      /* n:"CalcPrecision", */
      f: parsebool
    },
    //
    /*::[*/
    15: {
      /* n:"CalcRefMode", */
      f: parsebool
    },
    //
    /*::[*/
    16: {
      /* n:"CalcDelta", */
      f: parse_Xnum
    },
    //
    /*::[*/
    17: {
      /* n:"CalcIter", */
      f: parsebool
    },
    //
    /*::[*/
    18: {
      /* n:"Protect", */
      f: parsebool
    },
    /*::[*/
    19: {
      /* n:"Password", */
      f: parseuint16
    },
    /*::[*/
    20: {
      /* n:"Header", */
      f: parse_XLHeaderFooter
    },
    /*::[*/
    21: {
      /* n:"Footer", */
      f: parse_XLHeaderFooter
    },
    /*::[*/
    23: {
      /* n:"ExternSheet", */
      f: parse_ExternSheet
    },
    /*::[*/
    24: {
      /* n:"Lbl", */
      f: parse_Lbl
    },
    /*::[*/
    25: {
      /* n:"WinProtect", */
      f: parsebool
    },
    /*::[*/
    26: {
      /* n:"VerticalPageBreaks", */
    },
    /*::[*/
    27: {
      /* n:"HorizontalPageBreaks", */
    },
    /*::[*/
    28: {
      /* n:"Note", */
      f: parse_Note
    },
    /*::[*/
    29: {
      /* n:"Selection", */
    },
    /*::[*/
    34: {
      /* n:"Date1904", */
      f: parsebool
    },
    /*::[*/
    35: {
      /* n:"ExternName", */
      f: parse_ExternName
    },
    /*::[*/
    38: {
      /* n:"LeftMargin", */
      f: parse_Xnum
    },
    // *
    /*::[*/
    39: {
      /* n:"RightMargin", */
      f: parse_Xnum
    },
    // *
    /*::[*/
    40: {
      /* n:"TopMargin", */
      f: parse_Xnum
    },
    // *
    /*::[*/
    41: {
      /* n:"BottomMargin", */
      f: parse_Xnum
    },
    // *
    /*::[*/
    42: {
      /* n:"PrintRowCol", */
      f: parsebool
    },
    /*::[*/
    43: {
      /* n:"PrintGrid", */
      f: parsebool
    },
    /*::[*/
    47: {
      /* n:"FilePass", */
      f: parse_FilePass
    },
    /*::[*/
    49: {
      /* n:"Font", */
      f: parse_Font
    },
    /*::[*/
    51: {
      /* n:"PrintSize", */
      f: parseuint16
    },
    /*::[*/
    60: {
      /* n:"Continue", */
    },
    /*::[*/
    61: {
      /* n:"Window1", */
      f: parse_Window1
    },
    /*::[*/
    64: {
      /* n:"Backup", */
      f: parsebool
    },
    /*::[*/
    65: {
      /* n:"Pane", */
      f: parse_Pane
    },
    /*::[*/
    66: {
      /* n:"CodePage", */
      f: parseuint16
    },
    /*::[*/
    77: {
      /* n:"Pls", */
    },
    /*::[*/
    80: {
      /* n:"DCon", */
    },
    /*::[*/
    81: {
      /* n:"DConRef", */
    },
    /*::[*/
    82: {
      /* n:"DConName", */
    },
    /*::[*/
    85: {
      /* n:"DefColWidth", */
      f: parseuint16
    },
    /*::[*/
    89: {
      /* n:"XCT", */
    },
    /*::[*/
    90: {
      /* n:"CRN", */
    },
    /*::[*/
    91: {
      /* n:"FileSharing", */
    },
    /*::[*/
    92: {
      /* n:"WriteAccess", */
      f: parse_WriteAccess
    },
    /*::[*/
    93: {
      /* n:"Obj", */
      f: parse_Obj
    },
    /*::[*/
    94: {
      /* n:"Uncalced", */
    },
    /*::[*/
    95: {
      /* n:"CalcSaveRecalc", */
      f: parsebool
    },
    //
    /*::[*/
    96: {
      /* n:"Template", */
    },
    /*::[*/
    97: {
      /* n:"Intl", */
    },
    /*::[*/
    99: {
      /* n:"ObjProtect", */
      f: parsebool
    },
    /*::[*/
    125: {
      /* n:"ColInfo", */
      f: parse_ColInfo
    },
    /*::[*/
    128: {
      /* n:"Guts", */
      f: parse_Guts
    },
    /*::[*/
    129: {
      /* n:"WsBool", */
      f: parse_WsBool
    },
    /*::[*/
    130: {
      /* n:"GridSet", */
      f: parseuint16
    },
    /*::[*/
    131: {
      /* n:"HCenter", */
      f: parsebool
    },
    /*::[*/
    132: {
      /* n:"VCenter", */
      f: parsebool
    },
    /*::[*/
    133: {
      /* n:"BoundSheet8", */
      f: parse_BoundSheet8
    },
    /*::[*/
    134: {
      /* n:"WriteProtect", */
    },
    /*::[*/
    140: {
      /* n:"Country", */
      f: parse_Country
    },
    /*::[*/
    141: {
      /* n:"HideObj", */
      f: parseuint16
    },
    /*::[*/
    144: {
      /* n:"Sort", */
    },
    /*::[*/
    146: {
      /* n:"Palette", */
      f: parse_Palette
    },
    /*::[*/
    151: {
      /* n:"Sync", */
    },
    /*::[*/
    152: {
      /* n:"LPr", */
    },
    /*::[*/
    153: {
      /* n:"DxGCol", */
    },
    /*::[*/
    154: {
      /* n:"FnGroupName", */
    },
    /*::[*/
    155: {
      /* n:"FilterMode", */
    },
    /*::[*/
    156: {
      /* n:"BuiltInFnGroupCount", */
      f: parseuint16
    },
    /*::[*/
    157: {
      /* n:"AutoFilterInfo", */
    },
    /*::[*/
    158: {
      /* n:"AutoFilter", */
    },
    /*::[*/
    160: {
      /* n:"Scl", */
      f: parse_Scl
    },
    /*::[*/
    161: {
      /* n:"Setup", */
      f: parse_Setup
    },
    /*::[*/
    174: {
      /* n:"ScenMan", */
    },
    /*::[*/
    175: {
      /* n:"SCENARIO", */
    },
    /*::[*/
    176: {
      /* n:"SxView", */
    },
    /*::[*/
    177: {
      /* n:"Sxvd", */
    },
    /*::[*/
    178: {
      /* n:"SXVI", */
    },
    /*::[*/
    180: {
      /* n:"SxIvd", */
    },
    /*::[*/
    181: {
      /* n:"SXLI", */
    },
    /*::[*/
    182: {
      /* n:"SXPI", */
    },
    /*::[*/
    184: {
      /* n:"DocRoute", */
    },
    /*::[*/
    185: {
      /* n:"RecipName", */
    },
    /*::[*/
    189: {
      /* n:"MulRk", */
      f: parse_MulRk
    },
    /*::[*/
    190: {
      /* n:"MulBlank", */
      f: parse_MulBlank
    },
    /*::[*/
    193: {
      /* n:"Mms", */
      f: parsenoop2
    },
    /*::[*/
    197: {
      /* n:"SXDI", */
    },
    /*::[*/
    198: {
      /* n:"SXDB", */
    },
    /*::[*/
    199: {
      /* n:"SXFDB", */
    },
    /*::[*/
    200: {
      /* n:"SXDBB", */
    },
    /*::[*/
    201: {
      /* n:"SXNum", */
    },
    /*::[*/
    202: {
      /* n:"SxBool", */
      f: parsebool
    },
    /*::[*/
    203: {
      /* n:"SxErr", */
    },
    /*::[*/
    204: {
      /* n:"SXInt", */
    },
    /*::[*/
    205: {
      /* n:"SXString", */
    },
    /*::[*/
    206: {
      /* n:"SXDtr", */
    },
    /*::[*/
    207: {
      /* n:"SxNil", */
    },
    /*::[*/
    208: {
      /* n:"SXTbl", */
    },
    /*::[*/
    209: {
      /* n:"SXTBRGIITM", */
    },
    /*::[*/
    210: {
      /* n:"SxTbpg", */
    },
    /*::[*/
    211: {
      /* n:"ObProj", */
    },
    /*::[*/
    213: {
      /* n:"SXStreamID", */
    },
    /*::[*/
    215: {
      /* n:"DBCell", */
    },
    /*::[*/
    216: {
      /* n:"SXRng", */
    },
    /*::[*/
    217: {
      /* n:"SxIsxoper", */
    },
    /*::[*/
    218: {
      /* n:"BookBool", */
      f: parseuint16
    },
    /*::[*/
    220: {
      /* n:"DbOrParamQry", */
    },
    /*::[*/
    221: {
      /* n:"ScenarioProtect", */
      f: parsebool
    },
    /*::[*/
    222: {
      /* n:"OleObjectSize", */
    },
    /*::[*/
    224: {
      /* n:"XF", */
      f: parse_XF
    },
    /*::[*/
    225: {
      /* n:"InterfaceHdr", */
      f: parse_InterfaceHdr
    },
    /*::[*/
    226: {
      /* n:"InterfaceEnd", */
      f: parsenoop2
    },
    /*::[*/
    227: {
      /* n:"SXVS", */
    },
    /*::[*/
    229: {
      /* n:"MergeCells", */
      f: parse_MergeCells
    },
    /*::[*/
    233: {
      /* n:"BkHim", */
    },
    /*::[*/
    235: {
      /* n:"MsoDrawingGroup", */
    },
    /*::[*/
    236: {
      /* n:"MsoDrawing", */
    },
    /*::[*/
    237: {
      /* n:"MsoDrawingSelection", */
    },
    /*::[*/
    239: {
      /* n:"PhoneticInfo", */
    },
    /*::[*/
    240: {
      /* n:"SxRule", */
    },
    /*::[*/
    241: {
      /* n:"SXEx", */
    },
    /*::[*/
    242: {
      /* n:"SxFilt", */
    },
    /*::[*/
    244: {
      /* n:"SxDXF", */
    },
    /*::[*/
    245: {
      /* n:"SxItm", */
    },
    /*::[*/
    246: {
      /* n:"SxName", */
    },
    /*::[*/
    247: {
      /* n:"SxSelect", */
    },
    /*::[*/
    248: {
      /* n:"SXPair", */
    },
    /*::[*/
    249: {
      /* n:"SxFmla", */
    },
    /*::[*/
    251: {
      /* n:"SxFormat", */
    },
    /*::[*/
    252: {
      /* n:"SST", */
      f: parse_SST
    },
    /*::[*/
    253: {
      /* n:"LabelSst", */
      f: parse_LabelSst
    },
    /*::[*/
    255: {
      /* n:"ExtSST", */
      f: parse_ExtSST
    },
    /*::[*/
    256: {
      /* n:"SXVDEx", */
    },
    /*::[*/
    259: {
      /* n:"SXFormula", */
    },
    /*::[*/
    290: {
      /* n:"SXDBEx", */
    },
    /*::[*/
    311: {
      /* n:"RRDInsDel", */
    },
    /*::[*/
    312: {
      /* n:"RRDHead", */
    },
    /*::[*/
    315: {
      /* n:"RRDChgCell", */
    },
    /*::[*/
    317: {
      /* n:"RRTabId", */
      f: parseuint16a
    },
    /*::[*/
    318: {
      /* n:"RRDRenSheet", */
    },
    /*::[*/
    319: {
      /* n:"RRSort", */
    },
    /*::[*/
    320: {
      /* n:"RRDMove", */
    },
    /*::[*/
    330: {
      /* n:"RRFormat", */
    },
    /*::[*/
    331: {
      /* n:"RRAutoFmt", */
    },
    /*::[*/
    333: {
      /* n:"RRInsertSh", */
    },
    /*::[*/
    334: {
      /* n:"RRDMoveBegin", */
    },
    /*::[*/
    335: {
      /* n:"RRDMoveEnd", */
    },
    /*::[*/
    336: {
      /* n:"RRDInsDelBegin", */
    },
    /*::[*/
    337: {
      /* n:"RRDInsDelEnd", */
    },
    /*::[*/
    338: {
      /* n:"RRDConflict", */
    },
    /*::[*/
    339: {
      /* n:"RRDDefName", */
    },
    /*::[*/
    340: {
      /* n:"RRDRstEtxp", */
    },
    /*::[*/
    351: {
      /* n:"LRng", */
    },
    /*::[*/
    352: {
      /* n:"UsesELFs", */
      f: parsebool
    },
    /*::[*/
    353: {
      /* n:"DSF", */
      f: parsenoop2
    },
    /*::[*/
    401: {
      /* n:"CUsr", */
    },
    /*::[*/
    402: {
      /* n:"CbUsr", */
    },
    /*::[*/
    403: {
      /* n:"UsrInfo", */
    },
    /*::[*/
    404: {
      /* n:"UsrExcl", */
    },
    /*::[*/
    405: {
      /* n:"FileLock", */
    },
    /*::[*/
    406: {
      /* n:"RRDInfo", */
    },
    /*::[*/
    407: {
      /* n:"BCUsrs", */
    },
    /*::[*/
    408: {
      /* n:"UsrChk", */
    },
    /*::[*/
    425: {
      /* n:"UserBView", */
    },
    /*::[*/
    426: {
      /* n:"UserSViewBegin", */
    },
    /*::[*/
    427: {
      /* n:"UserSViewEnd", */
    },
    /*::[*/
    428: {
      /* n:"RRDUserView", */
    },
    /*::[*/
    429: {
      /* n:"Qsi", */
    },
    /*::[*/
    430: {
      /* n:"SupBook", */
      f: parse_SupBook
    },
    /*::[*/
    431: {
      /* n:"Prot4Rev", */
      f: parsebool
    },
    /*::[*/
    432: {
      /* n:"CondFmt", */
    },
    /*::[*/
    433: {
      /* n:"CF", */
    },
    /*::[*/
    434: {
      /* n:"DVal", */
    },
    /*::[*/
    437: {
      /* n:"DConBin", */
    },
    /*::[*/
    438: {
      /* n:"TxO", */
      f: parse_TxO
    },
    /*::[*/
    439: {
      /* n:"RefreshAll", */
      f: parsebool
    },
    //
    /*::[*/
    440: {
      /* n:"HLink", */
      f: parse_HLink
    },
    /*::[*/
    441: {
      /* n:"Lel", */
    },
    /*::[*/
    442: {
      /* n:"CodeName", */
      f: parse_XLUnicodeString
    },
    /*::[*/
    443: {
      /* n:"SXFDBType", */
    },
    /*::[*/
    444: {
      /* n:"Prot4RevPass", */
      f: parseuint16
    },
    /*::[*/
    445: {
      /* n:"ObNoMacros", */
    },
    /*::[*/
    446: {
      /* n:"Dv", */
    },
    /*::[*/
    448: {
      /* n:"Excel9File", */
      f: parsenoop2
    },
    /*::[*/
    449: {
      /* n:"RecalcId", */
      f: parse_RecalcId,
      r: 2
    },
    /*::[*/
    450: {
      /* n:"EntExU2", */
      f: parsenoop2
    },
    /*::[*/
    512: {
      /* n:"Dimensions", */
      f: parse_Dimensions
    },
    /*::[*/
    513: {
      /* n:"Blank", */
      f: parse_Blank
    },
    /*::[*/
    515: {
      /* n:"Number", */
      f: parse_Number
    },
    /*::[*/
    516: {
      /* n:"Label", */
      f: parse_Label
    },
    /*::[*/
    517: {
      /* n:"BoolErr", */
      f: parse_BoolErr
    },
    /*::[*/
    519: {
      /* n:"String", */
      f: parse_String
    },
    /*::[*/
    520: {
      /* n:"Row", */
      f: parse_Row
    },
    /*::[*/
    523: {
      /* n:"Index", */
    },
    /*::[*/
    545: {
      /* n:"Array", */
      f: parse_Array
    },
    /*::[*/
    549: {
      /* n:"DefaultRowHeight", */
      f: parse_DefaultRowHeight
    },
    /*::[*/
    566: {
      /* n:"Table", */
    },
    /*::[*/
    574: {
      /* n:"Window2", */
      f: parse_Window2
    },
    /*::[*/
    638: {
      /* n:"RK", */
      f: parse_RK
    },
    /*::[*/
    659: {
      /* n:"Style", */
    },
    /*::[*/
    1048: {
      /* n:"BigName", */
    },
    /*::[*/
    1054: {
      /* n:"Format", */
      f: parse_Format
    },
    /*::[*/
    1084: {
      /* n:"ContinueBigName", */
    },
    /*::[*/
    1212: {
      /* n:"ShrFmla", */
      f: parse_ShrFmla
    },
    /*::[*/
    2048: {
      /* n:"HLinkTooltip", */
      f: parse_HLinkTooltip
    },
    /*::[*/
    2049: {
      /* n:"WebPub", */
    },
    /*::[*/
    2050: {
      /* n:"QsiSXTag", */
    },
    /*::[*/
    2051: {
      /* n:"DBQueryExt", */
    },
    /*::[*/
    2052: {
      /* n:"ExtString", */
    },
    /*::[*/
    2053: {
      /* n:"TxtQry", */
    },
    /*::[*/
    2054: {
      /* n:"Qsir", */
    },
    /*::[*/
    2055: {
      /* n:"Qsif", */
    },
    /*::[*/
    2056: {
      /* n:"RRDTQSIF", */
    },
    /*::[*/
    2057: {
      /* n:"BOF", */
      f: parse_BOF
    },
    /*::[*/
    2058: {
      /* n:"OleDbConn", */
    },
    /*::[*/
    2059: {
      /* n:"WOpt", */
    },
    /*::[*/
    2060: {
      /* n:"SXViewEx", */
    },
    /*::[*/
    2061: {
      /* n:"SXTH", */
    },
    /*::[*/
    2062: {
      /* n:"SXPIEx", */
    },
    /*::[*/
    2063: {
      /* n:"SXVDTEx", */
    },
    /*::[*/
    2064: {
      /* n:"SXViewEx9", */
    },
    /*::[*/
    2066: {
      /* n:"ContinueFrt", */
    },
    /*::[*/
    2067: {
      /* n:"RealTimeData", */
    },
    /*::[*/
    2128: {
      /* n:"ChartFrtInfo", */
    },
    /*::[*/
    2129: {
      /* n:"FrtWrapper", */
    },
    /*::[*/
    2130: {
      /* n:"StartBlock", */
    },
    /*::[*/
    2131: {
      /* n:"EndBlock", */
    },
    /*::[*/
    2132: {
      /* n:"StartObject", */
    },
    /*::[*/
    2133: {
      /* n:"EndObject", */
    },
    /*::[*/
    2134: {
      /* n:"CatLab", */
    },
    /*::[*/
    2135: {
      /* n:"YMult", */
    },
    /*::[*/
    2136: {
      /* n:"SXViewLink", */
    },
    /*::[*/
    2137: {
      /* n:"PivotChartBits", */
    },
    /*::[*/
    2138: {
      /* n:"FrtFontList", */
    },
    /*::[*/
    2146: {
      /* n:"SheetExt", */
    },
    /*::[*/
    2147: {
      /* n:"BookExt", */
      r: 12
    },
    /*::[*/
    2148: {
      /* n:"SXAddl", */
    },
    /*::[*/
    2149: {
      /* n:"CrErr", */
    },
    /*::[*/
    2150: {
      /* n:"HFPicture", */
    },
    /*::[*/
    2151: {
      /* n:"FeatHdr", */
      f: parsenoop2
    },
    /*::[*/
    2152: {
      /* n:"Feat", */
    },
    /*::[*/
    2154: {
      /* n:"DataLabExt", */
    },
    /*::[*/
    2155: {
      /* n:"DataLabExtContents", */
    },
    /*::[*/
    2156: {
      /* n:"CellWatch", */
    },
    /*::[*/
    2161: {
      /* n:"FeatHdr11", */
    },
    /*::[*/
    2162: {
      /* n:"Feature11", */
    },
    /*::[*/
    2164: {
      /* n:"DropDownObjIds", */
    },
    /*::[*/
    2165: {
      /* n:"ContinueFrt11", */
    },
    /*::[*/
    2166: {
      /* n:"DConn", */
    },
    /*::[*/
    2167: {
      /* n:"List12", */
    },
    /*::[*/
    2168: {
      /* n:"Feature12", */
    },
    /*::[*/
    2169: {
      /* n:"CondFmt12", */
    },
    /*::[*/
    2170: {
      /* n:"CF12", */
    },
    /*::[*/
    2171: {
      /* n:"CFEx", */
    },
    /*::[*/
    2172: {
      /* n:"XFCRC", */
      f: parse_XFCRC,
      r: 12
    },
    /*::[*/
    2173: {
      /* n:"XFExt", */
      f: parse_XFExt,
      r: 12
    },
    /*::[*/
    2174: {
      /* n:"AutoFilter12", */
    },
    /*::[*/
    2175: {
      /* n:"ContinueFrt12", */
    },
    /*::[*/
    2180: {
      /* n:"MDTInfo", */
    },
    /*::[*/
    2181: {
      /* n:"MDXStr", */
    },
    /*::[*/
    2182: {
      /* n:"MDXTuple", */
    },
    /*::[*/
    2183: {
      /* n:"MDXSet", */
    },
    /*::[*/
    2184: {
      /* n:"MDXProp", */
    },
    /*::[*/
    2185: {
      /* n:"MDXKPI", */
    },
    /*::[*/
    2186: {
      /* n:"MDB", */
    },
    /*::[*/
    2187: {
      /* n:"PLV", */
    },
    /*::[*/
    2188: {
      /* n:"Compat12", */
      f: parsebool,
      r: 12
    },
    /*::[*/
    2189: {
      /* n:"DXF", */
    },
    /*::[*/
    2190: {
      /* n:"TableStyles", */
      r: 12
    },
    /*::[*/
    2191: {
      /* n:"TableStyle", */
    },
    /*::[*/
    2192: {
      /* n:"TableStyleElement", */
    },
    /*::[*/
    2194: {
      /* n:"StyleExt", */
    },
    /*::[*/
    2195: {
      /* n:"NamePublish", */
    },
    /*::[*/
    2196: {
      /* n:"NameCmt", */
      f: parse_NameCmt,
      r: 12
    },
    /*::[*/
    2197: {
      /* n:"SortData", */
    },
    /*::[*/
    2198: {
      /* n:"Theme", */
      f: parse_Theme,
      r: 12
    },
    /*::[*/
    2199: {
      /* n:"GUIDTypeLib", */
    },
    /*::[*/
    2200: {
      /* n:"FnGrp12", */
    },
    /*::[*/
    2201: {
      /* n:"NameFnGrp12", */
    },
    /*::[*/
    2202: {
      /* n:"MTRSettings", */
      f: parse_MTRSettings,
      r: 12
    },
    /*::[*/
    2203: {
      /* n:"CompressPictures", */
      f: parsenoop2
    },
    /*::[*/
    2204: {
      /* n:"HeaderFooter", */
    },
    /*::[*/
    2205: {
      /* n:"CrtLayout12", */
    },
    /*::[*/
    2206: {
      /* n:"CrtMlFrt", */
    },
    /*::[*/
    2207: {
      /* n:"CrtMlFrtContinue", */
    },
    /*::[*/
    2211: {
      /* n:"ForceFullCalculation", */
      f: parse_ForceFullCalculation
    },
    /*::[*/
    2212: {
      /* n:"ShapePropsStream", */
    },
    /*::[*/
    2213: {
      /* n:"TextPropsStream", */
    },
    /*::[*/
    2214: {
      /* n:"RichTextStream", */
    },
    /*::[*/
    2215: {
      /* n:"CrtLayout12A", */
    },
    /*::[*/
    4097: {
      /* n:"Units", */
    },
    /*::[*/
    4098: {
      /* n:"Chart", */
    },
    /*::[*/
    4099: {
      /* n:"Series", */
    },
    /*::[*/
    4102: {
      /* n:"DataFormat", */
    },
    /*::[*/
    4103: {
      /* n:"LineFormat", */
    },
    /*::[*/
    4105: {
      /* n:"MarkerFormat", */
    },
    /*::[*/
    4106: {
      /* n:"AreaFormat", */
    },
    /*::[*/
    4107: {
      /* n:"PieFormat", */
    },
    /*::[*/
    4108: {
      /* n:"AttachedLabel", */
    },
    /*::[*/
    4109: {
      /* n:"SeriesText", */
    },
    /*::[*/
    4116: {
      /* n:"ChartFormat", */
    },
    /*::[*/
    4117: {
      /* n:"Legend", */
    },
    /*::[*/
    4118: {
      /* n:"SeriesList", */
    },
    /*::[*/
    4119: {
      /* n:"Bar", */
    },
    /*::[*/
    4120: {
      /* n:"Line", */
    },
    /*::[*/
    4121: {
      /* n:"Pie", */
    },
    /*::[*/
    4122: {
      /* n:"Area", */
    },
    /*::[*/
    4123: {
      /* n:"Scatter", */
    },
    /*::[*/
    4124: {
      /* n:"CrtLine", */
    },
    /*::[*/
    4125: {
      /* n:"Axis", */
    },
    /*::[*/
    4126: {
      /* n:"Tick", */
    },
    /*::[*/
    4127: {
      /* n:"ValueRange", */
    },
    /*::[*/
    4128: {
      /* n:"CatSerRange", */
    },
    /*::[*/
    4129: {
      /* n:"AxisLine", */
    },
    /*::[*/
    4130: {
      /* n:"CrtLink", */
    },
    /*::[*/
    4132: {
      /* n:"DefaultText", */
    },
    /*::[*/
    4133: {
      /* n:"Text", */
    },
    /*::[*/
    4134: {
      /* n:"FontX", */
      f: parseuint16
    },
    /*::[*/
    4135: {
      /* n:"ObjectLink", */
    },
    /*::[*/
    4146: {
      /* n:"Frame", */
    },
    /*::[*/
    4147: {
      /* n:"Begin", */
    },
    /*::[*/
    4148: {
      /* n:"End", */
    },
    /*::[*/
    4149: {
      /* n:"PlotArea", */
    },
    /*::[*/
    4154: {
      /* n:"Chart3d", */
    },
    /*::[*/
    4156: {
      /* n:"PicF", */
    },
    /*::[*/
    4157: {
      /* n:"DropBar", */
    },
    /*::[*/
    4158: {
      /* n:"Radar", */
    },
    /*::[*/
    4159: {
      /* n:"Surf", */
    },
    /*::[*/
    4160: {
      /* n:"RadarArea", */
    },
    /*::[*/
    4161: {
      /* n:"AxisParent", */
    },
    /*::[*/
    4163: {
      /* n:"LegendException", */
    },
    /*::[*/
    4164: {
      /* n:"ShtProps", */
      f: parse_ShtProps
    },
    /*::[*/
    4165: {
      /* n:"SerToCrt", */
    },
    /*::[*/
    4166: {
      /* n:"AxesUsed", */
    },
    /*::[*/
    4168: {
      /* n:"SBaseRef", */
    },
    /*::[*/
    4170: {
      /* n:"SerParent", */
    },
    /*::[*/
    4171: {
      /* n:"SerAuxTrend", */
    },
    /*::[*/
    4174: {
      /* n:"IFmtRecord", */
    },
    /*::[*/
    4175: {
      /* n:"Pos", */
    },
    /*::[*/
    4176: {
      /* n:"AlRuns", */
    },
    /*::[*/
    4177: {
      /* n:"BRAI", */
    },
    /*::[*/
    4187: {
      /* n:"SerAuxErrBar", */
    },
    /*::[*/
    4188: {
      /* n:"ClrtClient", */
      f: parse_ClrtClient
    },
    /*::[*/
    4189: {
      /* n:"SerFmt", */
    },
    /*::[*/
    4191: {
      /* n:"Chart3DBarShape", */
    },
    /*::[*/
    4192: {
      /* n:"Fbi", */
    },
    /*::[*/
    4193: {
      /* n:"BopPop", */
    },
    /*::[*/
    4194: {
      /* n:"AxcExt", */
    },
    /*::[*/
    4195: {
      /* n:"Dat", */
    },
    /*::[*/
    4196: {
      /* n:"PlotGrowth", */
    },
    /*::[*/
    4197: {
      /* n:"SIIndex", */
    },
    /*::[*/
    4198: {
      /* n:"GelFrame", */
    },
    /*::[*/
    4199: {
      /* n:"BopPopCustom", */
    },
    /*::[*/
    4200: {
      /* n:"Fbi2", */
    },
    /*::[*/
    0: {
      /* n:"Dimensions", */
      f: parse_Dimensions
    },
    /*::[*/
    1: {
      /* n:"BIFF2BLANK", */
    },
    /*::[*/
    2: {
      /* n:"BIFF2INT", */
      f: parse_BIFF2INT
    },
    /*::[*/
    3: {
      /* n:"BIFF2NUM", */
      f: parse_BIFF2NUM
    },
    /*::[*/
    4: {
      /* n:"BIFF2STR", */
      f: parse_BIFF2STR
    },
    /*::[*/
    5: {
      /* n:"BoolErr", */
      f: parse_BoolErr
    },
    /*::[*/
    7: {
      /* n:"String", */
      f: parse_BIFF2STRING
    },
    /*::[*/
    8: {
      /* n:"BIFF2ROW", */
    },
    /*::[*/
    9: {
      /* n:"BOF", */
      f: parse_BOF
    },
    /*::[*/
    11: {
      /* n:"Index", */
    },
    /*::[*/
    22: {
      /* n:"ExternCount", */
      f: parseuint16
    },
    /*::[*/
    30: {
      /* n:"BIFF2FORMAT", */
      f: parse_BIFF2Format
    },
    /*::[*/
    31: {
      /* n:"BIFF2FMTCNT", */
    },
    /* 16-bit cnt of BIFF2FORMAT records */
    /*::[*/
    32: {
      /* n:"BIFF2COLINFO", */
    },
    /*::[*/
    33: {
      /* n:"Array", */
      f: parse_Array
    },
    /*::[*/
    36: {
      /* n:"COLWIDTH", */
    },
    /*::[*/
    37: {
      /* n:"DefaultRowHeight", */
      f: parse_DefaultRowHeight
    },
    // 0x2c ??
    // 0x2d ??
    // 0x2e ??
    // 0x30 FONTCOUNT: number of fonts
    /*::[*/
    50: {
      /* n:"BIFF2FONTXTRA", */
      f: parse_BIFF2FONTXTRA
    },
    // 0x35: INFOOPTS
    // 0x36: TABLE (BIFF2 only)
    // 0x37: TABLE2 (BIFF2 only)
    // 0x38: WNDESK
    // 0x39 ??
    // 0x3a: BEGINPREF
    // 0x3b: ENDPREF
    /*::[*/
    62: {
      /* n:"BIFF2WINDOW2", */
    },
    // 0x3f ??
    // 0x46: SHOWSCROLL
    // 0x47: SHOWFORMULA
    // 0x48: STATUSBAR
    // 0x49: SHORTMENUS
    // 0x4A:
    // 0x4B:
    // 0x4C:
    // 0x4E:
    // 0x4F:
    // 0x58: TOOLBAR (BIFF3)
    /* - - - */
    /*::[*/
    52: {
      /* n:"DDEObjName", */
    },
    /*::[*/
    67: {
      /* n:"BIFF2XF", */
    },
    /*::[*/
    68: {
      /* n:"BIFF2XFINDEX", */
      f: parseuint16
    },
    /*::[*/
    69: {
      /* n:"BIFF2FONTCLR", */
    },
    /*::[*/
    86: {
      /* n:"BIFF4FMTCNT", */
    },
    /* 16-bit cnt, similar to BIFF2 */
    /*::[*/
    126: {
      /* n:"RK", */
    },
    /* Not necessarily same as 0x027e */
    /*::[*/
    127: {
      /* n:"ImData", */
      f: parse_ImData
    },
    /*::[*/
    135: {
      /* n:"Addin", */
    },
    /*::[*/
    136: {
      /* n:"Edg", */
    },
    /*::[*/
    137: {
      /* n:"Pub", */
    },
    // 0x8A
    // 0x8B LH: alternate menu key flag (BIFF3/4)
    // 0x8E
    // 0x8F
    /*::[*/
    145: {
      /* n:"Sub", */
    },
    // 0x93 STYLE
    /*::[*/
    148: {
      /* n:"LHRecord", */
    },
    /*::[*/
    149: {
      /* n:"LHNGraph", */
    },
    /*::[*/
    150: {
      /* n:"Sound", */
    },
    // 0xA2 FNPROTO: function prototypes (BIFF4)
    // 0xA3
    // 0xA8
    /*::[*/
    169: {
      /* n:"CoordList", */
    },
    /*::[*/
    171: {
      /* n:"GCW", */
    },
    /*::[*/
    188: {
      /* n:"ShrFmla", */
    },
    /* Not necessarily same as 0x04bc */
    /*::[*/
    191: {
      /* n:"ToolbarHdr", */
    },
    /*::[*/
    192: {
      /* n:"ToolbarEnd", */
    },
    /*::[*/
    194: {
      /* n:"AddMenu", */
    },
    /*::[*/
    195: {
      /* n:"DelMenu", */
    },
    /*::[*/
    214: {
      /* n:"RString", */
      f: parse_RString
    },
    /*::[*/
    223: {
      /* n:"UDDesc", */
    },
    /*::[*/
    234: {
      /* n:"TabIdConf", */
    },
    /*::[*/
    354: {
      /* n:"XL5Modify", */
    },
    /*::[*/
    421: {
      /* n:"FileSharing2", */
    },
    /*::[*/
    518: {
      /* n:"Formula", */
      f: parse_Formula
    },
    /*::[*/
    521: {
      /* n:"BOF", */
      f: parse_BOF
    },
    /*::[*/
    536: {
      /* n:"Lbl", */
      f: parse_Lbl
    },
    /*::[*/
    547: {
      /* n:"ExternName", */
      f: parse_ExternName
    },
    /*::[*/
    561: {
      /* n:"Font", */
    },
    /*::[*/
    579: {
      /* n:"BIFF3XF", */
    },
    /*::[*/
    1030: {
      /* n:"Formula", */
      f: parse_Formula
    },
    /*::[*/
    1033: {
      /* n:"BOF", */
      f: parse_BOF
    },
    /*::[*/
    1091: {
      /* n:"BIFF4XF", */
    },
    /*::[*/
    2157: {
      /* n:"FeatInfo", */
    },
    /*::[*/
    2163: {
      /* n:"FeatInfo11", */
    },
    /*::[*/
    2177: {
      /* n:"SXAddl12", */
    },
    /*::[*/
    2240: {
      /* n:"AutoWebPub", */
    },
    /*::[*/
    2241: {
      /* n:"ListObj", */
    },
    /*::[*/
    2242: {
      /* n:"ListField", */
    },
    /*::[*/
    2243: {
      /* n:"ListDV", */
    },
    /*::[*/
    2244: {
      /* n:"ListCondFmt", */
    },
    /*::[*/
    2245: {
      /* n:"ListCF", */
    },
    /*::[*/
    2246: {
      /* n:"FMQry", */
    },
    /*::[*/
    2247: {
      /* n:"FMSQry", */
    },
    /*::[*/
    2248: {
      /* n:"PLV", */
    },
    /*::[*/
    2249: {
      /* n:"LnExt", */
    },
    /*::[*/
    2250: {
      /* n:"MkrExt", */
    },
    /*::[*/
    2251: {
      /* n:"CrtCoopt", */
    },
    /*::[*/
    2262: {
      /* n:"FRTArchId$", */
      r: 12
    },
    /*::[*/
    29282: {}
  };
  function write_biff_rec(ba, type, payload, length) {
    var t = type;
    if (isNaN(t)) return;
    var len = length || (payload || []).length || 0;
    var o = ba.next(4);
    o.write_shift(2, t);
    o.write_shift(2, len);
    if (
      /*:: len != null &&*/
      len > 0 && is_buf(payload)
    ) ba.push(payload);
  }
  function html_to_sheet(str, _opts) {
    var opts = _opts || {};
    if (DENSE != null && opts.dense == null) opts.dense = DENSE;
    var ws = opts.dense ? [] : {};
    str = str.replace(/<!--.*?-->/g, "");
    var mtch = str.match(/<table/i);
    if (!mtch) throw new Error("Invalid HTML: could not find <table>");
    var mtch2 = str.match(/<\/table/i);
    var i = mtch.index, j = mtch2 && mtch2.index || str.length;
    var rows = split_regex(str.slice(i, j), /(:?<tr[^>]*>)/i, "<tr>");
    var R = -1, C = 0, RS = 0, CS = 0;
    var range = { s: { r: 1e7, c: 1e7 }, e: { r: 0, c: 0 } };
    var merges = [];
    for (i = 0; i < rows.length; ++i) {
      var row = rows[i].trim();
      var hd = row.slice(0, 3).toLowerCase();
      if (hd == "<tr") {
        ++R;
        if (opts.sheetRows && opts.sheetRows <= R) {
          --R;
          break;
        }
        C = 0;
        continue;
      }
      if (hd != "<td" && hd != "<th") continue;
      var cells = row.split(/<\/t[dh]>/i);
      for (j = 0; j < cells.length; ++j) {
        var cell = cells[j].trim();
        if (!cell.match(/<t[dh]/i)) continue;
        var m = cell, cc = 0;
        while (m.charAt(0) == "<" && (cc = m.indexOf(">")) > -1) m = m.slice(cc + 1);
        for (var midx = 0; midx < merges.length; ++midx) {
          var _merge = merges[midx];
          if (_merge.s.c == C && _merge.s.r < R && R <= _merge.e.r) {
            C = _merge.e.c + 1;
            midx = -1;
          }
        }
        var tag = parsexmltag(cell.slice(0, cell.indexOf(">")));
        CS = tag.colspan ? +tag.colspan : 1;
        if ((RS = +tag.rowspan) > 1 || CS > 1) merges.push({ s: { r: R, c: C }, e: { r: R + (RS || 1) - 1, c: C + CS - 1 } });
        var _t = tag.t || tag["data-t"] || "";
        if (!m.length) {
          C += CS;
          continue;
        }
        m = htmldecode(m);
        if (range.s.r > R) range.s.r = R;
        if (range.e.r < R) range.e.r = R;
        if (range.s.c > C) range.s.c = C;
        if (range.e.c < C) range.e.c = C;
        if (!m.length) {
          C += CS;
          continue;
        }
        var o = { t: "s", v: m };
        if (opts.raw || !m.trim().length || _t == "s") {
        } else if (m === "TRUE") o = { t: "b", v: true };
        else if (m === "FALSE") o = { t: "b", v: false };
        else if (!isNaN(fuzzynum(m))) o = { t: "n", v: fuzzynum(m) };
        else if (!isNaN(fuzzydate(m).getDate())) {
          o = { t: "d", v: parseDate(m) };
          if (!opts.cellDates) o = { t: "n", v: datenum(o.v) };
          o.z = opts.dateNF || table_fmt[14];
        }
        if (opts.dense) {
          if (!ws[R]) ws[R] = [];
          ws[R][C] = o;
        } else ws[encode_cell({ r: R, c: C })] = o;
        C += CS;
      }
    }
    ws["!ref"] = encode_range(range);
    if (merges.length) ws["!merges"] = merges;
    return ws;
  }
  function make_html_row(ws, r, R, o) {
    var M = ws["!merges"] || [];
    var oo = [];
    for (var C = r.s.c; C <= r.e.c; ++C) {
      var RS = 0, CS = 0;
      for (var j = 0; j < M.length; ++j) {
        if (M[j].s.r > R || M[j].s.c > C) continue;
        if (M[j].e.r < R || M[j].e.c < C) continue;
        if (M[j].s.r < R || M[j].s.c < C) {
          RS = -1;
          break;
        }
        RS = M[j].e.r - M[j].s.r + 1;
        CS = M[j].e.c - M[j].s.c + 1;
        break;
      }
      if (RS < 0) continue;
      var coord = encode_cell({ r: R, c: C });
      var cell = o.dense ? (ws[R] || [])[C] : ws[coord];
      var w = cell && cell.v != null && (cell.h || escapehtml(cell.w || (format_cell(cell), cell.w) || "")) || "";
      var sp = {};
      if (RS > 1) sp.rowspan = RS;
      if (CS > 1) sp.colspan = CS;
      if (o.editable) w = '<span contenteditable="true">' + w + "</span>";
      else if (cell) {
        sp["data-t"] = cell && cell.t || "z";
        if (cell.v != null) sp["data-v"] = cell.v;
        if (cell.z != null) sp["data-z"] = cell.z;
        if (cell.l && (cell.l.Target || "#").charAt(0) != "#") w = '<a href="' + cell.l.Target + '">' + w + "</a>";
      }
      sp.id = (o.id || "sjs") + "-" + coord;
      oo.push(writextag("td", w, sp));
    }
    var preamble = "<tr>";
    return preamble + oo.join("") + "</tr>";
  }
  var HTML_BEGIN = '<html><head><meta charset="utf-8"/><title>SheetJS Table Export</title></head><body>';
  var HTML_END = "</body></html>";
  function html_to_workbook(str, opts) {
    var mtch = str.match(/<table[\s\S]*?>[\s\S]*?<\/table>/gi);
    if (!mtch || mtch.length == 0) throw new Error("Invalid HTML: could not find <table>");
    if (mtch.length == 1) return sheet_to_workbook(html_to_sheet(mtch[0], opts), opts);
    var wb = book_new();
    mtch.forEach(function(s, idx) {
      book_append_sheet(wb, html_to_sheet(s, opts), "Sheet" + (idx + 1));
    });
    return wb;
  }
  function make_html_preamble(ws, R, o) {
    var out = [];
    return out.join("") + "<table" + (o && o.id ? ' id="' + o.id + '"' : "") + ">";
  }
  function sheet_to_html(ws, opts) {
    var o = opts || {};
    var header = o.header != null ? o.header : HTML_BEGIN;
    var footer = o.footer != null ? o.footer : HTML_END;
    var out = [header];
    var r = decode_range(ws["!ref"]);
    o.dense = Array.isArray(ws);
    out.push(make_html_preamble(ws, r, o));
    for (var R = r.s.r; R <= r.e.r; ++R) out.push(make_html_row(ws, r, R, o));
    out.push("</table>" + footer);
    return out.join("");
  }
  function sheet_add_dom(ws, table, _opts) {
    var opts = _opts || {};
    if (DENSE != null) opts.dense = DENSE;
    var or_R = 0, or_C = 0;
    if (opts.origin != null) {
      if (typeof opts.origin == "number") or_R = opts.origin;
      else {
        var _origin = typeof opts.origin == "string" ? decode_cell(opts.origin) : opts.origin;
        or_R = _origin.r;
        or_C = _origin.c;
      }
    }
    var rows = table.getElementsByTagName("tr");
    var sheetRows = Math.min(opts.sheetRows || 1e7, rows.length);
    var range = { s: { r: 0, c: 0 }, e: { r: or_R, c: or_C } };
    if (ws["!ref"]) {
      var _range = decode_range(ws["!ref"]);
      range.s.r = Math.min(range.s.r, _range.s.r);
      range.s.c = Math.min(range.s.c, _range.s.c);
      range.e.r = Math.max(range.e.r, _range.e.r);
      range.e.c = Math.max(range.e.c, _range.e.c);
      if (or_R == -1) range.e.r = or_R = _range.e.r + 1;
    }
    var merges = [], midx = 0;
    var rowinfo = ws["!rows"] || (ws["!rows"] = []);
    var _R = 0, R = 0, _C = 0, C = 0, RS = 0, CS = 0;
    if (!ws["!cols"]) ws["!cols"] = [];
    for (; _R < rows.length && R < sheetRows; ++_R) {
      var row = rows[_R];
      if (is_dom_element_hidden(row)) {
        if (opts.display) continue;
        rowinfo[R] = { hidden: true };
      }
      var elts = row.children;
      for (_C = C = 0; _C < elts.length; ++_C) {
        var elt = elts[_C];
        if (opts.display && is_dom_element_hidden(elt)) continue;
        var v = elt.hasAttribute("data-v") ? elt.getAttribute("data-v") : elt.hasAttribute("v") ? elt.getAttribute("v") : htmldecode(elt.innerHTML);
        var z = elt.getAttribute("data-z") || elt.getAttribute("z");
        for (midx = 0; midx < merges.length; ++midx) {
          var m = merges[midx];
          if (m.s.c == C + or_C && m.s.r < R + or_R && R + or_R <= m.e.r) {
            C = m.e.c + 1 - or_C;
            midx = -1;
          }
        }
        CS = +elt.getAttribute("colspan") || 1;
        if ((RS = +elt.getAttribute("rowspan") || 1) > 1 || CS > 1) merges.push({ s: { r: R + or_R, c: C + or_C }, e: { r: R + or_R + (RS || 1) - 1, c: C + or_C + (CS || 1) - 1 } });
        var o = { t: "s", v };
        var _t = elt.getAttribute("data-t") || elt.getAttribute("t") || "";
        if (v != null) {
          if (v.length == 0) o.t = _t || "z";
          else if (opts.raw || v.trim().length == 0 || _t == "s") {
          } else if (v === "TRUE") o = { t: "b", v: true };
          else if (v === "FALSE") o = { t: "b", v: false };
          else if (!isNaN(fuzzynum(v))) o = { t: "n", v: fuzzynum(v) };
          else if (!isNaN(fuzzydate(v).getDate())) {
            o = { t: "d", v: parseDate(v) };
            if (!opts.cellDates) o = { t: "n", v: datenum(o.v) };
            o.z = opts.dateNF || table_fmt[14];
          }
        }
        if (o.z === void 0 && z != null) o.z = z;
        var l = "", Aelts = elt.getElementsByTagName("A");
        if (Aelts && Aelts.length) {
          for (var Aelti = 0; Aelti < Aelts.length; ++Aelti) if (Aelts[Aelti].hasAttribute("href")) {
            l = Aelts[Aelti].getAttribute("href");
            if (l.charAt(0) != "#") break;
          }
        }
        if (l && l.charAt(0) != "#") o.l = { Target: l };
        if (opts.dense) {
          if (!ws[R + or_R]) ws[R + or_R] = [];
          ws[R + or_R][C + or_C] = o;
        } else ws[encode_cell({ c: C + or_C, r: R + or_R })] = o;
        if (range.e.c < C + or_C) range.e.c = C + or_C;
        C += CS;
      }
      ++R;
    }
    if (merges.length) ws["!merges"] = (ws["!merges"] || []).concat(merges);
    range.e.r = Math.max(range.e.r, R - 1 + or_R);
    ws["!ref"] = encode_range(range);
    if (R >= sheetRows) ws["!fullref"] = encode_range((range.e.r = rows.length - _R + R - 1 + or_R, range));
    return ws;
  }
  function parse_dom_table(table, _opts) {
    var opts = _opts || {};
    var ws = opts.dense ? [] : {};
    return sheet_add_dom(ws, table, _opts);
  }
  function table_to_book(table, opts) {
    return sheet_to_workbook(parse_dom_table(table, opts), opts);
  }
  function is_dom_element_hidden(element) {
    var display = "";
    var get_computed_style = get_get_computed_style_function(element);
    if (get_computed_style) display = get_computed_style(element).getPropertyValue("display");
    if (!display) display = element.style && element.style.display;
    return display === "none";
  }
  function get_get_computed_style_function(element) {
    if (element.ownerDocument.defaultView && typeof element.ownerDocument.defaultView.getComputedStyle === "function") return element.ownerDocument.defaultView.getComputedStyle;
    if (typeof getComputedStyle === "function") return getComputedStyle;
    return null;
  }
  function parse_text_p(text) {
    var fixed = text.replace(/[\t\r\n]/g, " ").trim().replace(/ +/g, " ").replace(/<text:s\/>/g, " ").replace(/<text:s text:c="(\d+)"\/>/g, function($$, $1) {
      return Array(parseInt($1, 10) + 1).join(" ");
    }).replace(/<text:tab[^>]*\/>/g, "	").replace(/<text:line-break\/>/g, "\n");
    var v = unescapexml(fixed.replace(/<[^>]*>/g, ""));
    return [v];
  }
  var number_formats_ods = {
    /* ods name: [short ssf fmt, long ssf fmt] */
    day: ["d", "dd"],
    month: ["m", "mm"],
    year: ["y", "yy"],
    hours: ["h", "hh"],
    minutes: ["m", "mm"],
    seconds: ["s", "ss"],
    "am-pm": ["A/P", "AM/PM"],
    "day-of-week": ["ddd", "dddd"],
    era: ["e", "ee"],
    /* there is no native representation of LO "Q" format */
    quarter: ["\\Qm", 'm\\"th quarter"']
  };
  function parse_content_xml(d, _opts) {
    var opts = _opts || {};
    if (DENSE != null && opts.dense == null) opts.dense = DENSE;
    var str = xlml_normalize(d);
    var state = [], tmp;
    var tag;
    var NFtag = { name: "" }, NF = "", pidx = 0;
    var sheetag;
    var rowtag;
    var Sheets = {}, SheetNames = [];
    var ws = opts.dense ? [] : {};
    var Rn, q;
    var ctag = { value: "" };
    var textp = "", textpidx = 0, textptag;
    var textR = [];
    var R = -1, C = -1, range = { s: { r: 1e6, c: 1e7 }, e: { r: 0, c: 0 } };
    var row_ol = 0;
    var number_format_map = {};
    var merges = [], mrange = {}, mR = 0, mC = 0;
    var rowinfo = [], rowpeat = 1, colpeat = 1;
    var arrayf = [];
    var WB = { Names: [] };
    var atag = {};
    var _Ref = ["", ""];
    var comments = [], comment = {};
    var creator = "", creatoridx = 0;
    var isstub = false, intable = false;
    var i = 0;
    xlmlregex.lastIndex = 0;
    str = str.replace(/<!--([\s\S]*?)-->/mg, "").replace(/<!DOCTYPE[^\[]*\[[^\]]*\]>/gm, "");
    while (Rn = xlmlregex.exec(str)) switch (Rn[3] = Rn[3].replace(/_.*$/, "")) {
      case "table":
      case "\u5DE5\u4F5C\u8868":
        if (Rn[1] === "/") {
          if (range.e.c >= range.s.c && range.e.r >= range.s.r) ws["!ref"] = encode_range(range);
          else ws["!ref"] = "A1:A1";
          if (opts.sheetRows > 0 && opts.sheetRows <= range.e.r) {
            ws["!fullref"] = ws["!ref"];
            range.e.r = opts.sheetRows - 1;
            ws["!ref"] = encode_range(range);
          }
          if (merges.length) ws["!merges"] = merges;
          if (rowinfo.length) ws["!rows"] = rowinfo;
          sheetag.name = sheetag["\u540D\u79F0"] || sheetag.name;
          if (typeof JSON !== "undefined") JSON.stringify(sheetag);
          SheetNames.push(sheetag.name);
          Sheets[sheetag.name] = ws;
          intable = false;
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") {
          sheetag = parsexmltag(Rn[0], false);
          R = C = -1;
          range.s.r = range.s.c = 1e7;
          range.e.r = range.e.c = 0;
          ws = opts.dense ? [] : {};
          merges = [];
          rowinfo = [];
          intable = true;
        }
        break;
      case "table-row-group":
        if (Rn[1] === "/") --row_ol;
        else ++row_ol;
        break;
      case "table-row":
      case "\u884C":
        if (Rn[1] === "/") {
          R += rowpeat;
          rowpeat = 1;
          break;
        }
        rowtag = parsexmltag(Rn[0], false);
        if (rowtag["\u884C\u53F7"]) R = rowtag["\u884C\u53F7"] - 1;
        else if (R == -1) R = 0;
        rowpeat = +rowtag["number-rows-repeated"] || 1;
        if (rowpeat < 10) {
          for (i = 0; i < rowpeat; ++i) if (row_ol > 0) rowinfo[R + i] = { level: row_ol };
        }
        C = -1;
        break;
      case "covered-table-cell":
        if (Rn[1] !== "/") ++C;
        if (opts.sheetStubs) {
          if (opts.dense) {
            if (!ws[R]) ws[R] = [];
            ws[R][C] = { t: "z" };
          } else ws[encode_cell({ r: R, c: C })] = { t: "z" };
        }
        textp = "";
        textR = [];
        break;
      /* stub */
      case "table-cell":
      case "\u6570\u636E":
        if (Rn[0].charAt(Rn[0].length - 2) === "/") {
          ++C;
          ctag = parsexmltag(Rn[0], false);
          colpeat = parseInt(ctag["number-columns-repeated"] || "1", 10);
          q = {
            t: "z",
            v: null
            /*:: , z:null, w:"",c:[]*/
          };
          if (ctag.formula && opts.cellFormula != false) q.f = ods_to_csf_formula(unescapexml(ctag.formula));
          if ((ctag["\u6570\u636E\u7C7B\u578B"] || ctag["value-type"]) == "string") {
            q.t = "s";
            q.v = unescapexml(ctag["string-value"] || "");
            if (opts.dense) {
              if (!ws[R]) ws[R] = [];
              ws[R][C] = q;
            } else {
              ws[encode_cell({ r: R, c: C })] = q;
            }
          }
          C += colpeat - 1;
        } else if (Rn[1] !== "/") {
          ++C;
          textp = "";
          textpidx = 0;
          textR = [];
          colpeat = 1;
          var rptR = rowpeat ? R + rowpeat - 1 : R;
          if (C > range.e.c) range.e.c = C;
          if (C < range.s.c) range.s.c = C;
          if (R < range.s.r) range.s.r = R;
          if (rptR > range.e.r) range.e.r = rptR;
          ctag = parsexmltag(Rn[0], false);
          comments = [];
          comment = {};
          q = {
            t: ctag["\u6570\u636E\u7C7B\u578B"] || ctag["value-type"],
            v: null
            /*:: , z:null, w:"",c:[]*/
          };
          if (opts.cellFormula) {
            if (ctag.formula) ctag.formula = unescapexml(ctag.formula);
            if (ctag["number-matrix-columns-spanned"] && ctag["number-matrix-rows-spanned"]) {
              mR = parseInt(ctag["number-matrix-rows-spanned"], 10) || 0;
              mC = parseInt(ctag["number-matrix-columns-spanned"], 10) || 0;
              mrange = { s: { r: R, c: C }, e: { r: R + mR - 1, c: C + mC - 1 } };
              q.F = encode_range(mrange);
              arrayf.push([mrange, q.F]);
            }
            if (ctag.formula) q.f = ods_to_csf_formula(ctag.formula);
            else for (i = 0; i < arrayf.length; ++i)
              if (R >= arrayf[i][0].s.r && R <= arrayf[i][0].e.r) {
                if (C >= arrayf[i][0].s.c && C <= arrayf[i][0].e.c)
                  q.F = arrayf[i][1];
              }
          }
          if (ctag["number-columns-spanned"] || ctag["number-rows-spanned"]) {
            mR = parseInt(ctag["number-rows-spanned"], 10) || 0;
            mC = parseInt(ctag["number-columns-spanned"], 10) || 0;
            mrange = { s: { r: R, c: C }, e: { r: R + mR - 1, c: C + mC - 1 } };
            merges.push(mrange);
          }
          if (ctag["number-columns-repeated"]) colpeat = parseInt(ctag["number-columns-repeated"], 10);
          switch (q.t) {
            case "boolean":
              q.t = "b";
              q.v = parsexmlbool(ctag["boolean-value"]);
              break;
            case "float":
              q.t = "n";
              q.v = parseFloat(ctag.value);
              break;
            case "percentage":
              q.t = "n";
              q.v = parseFloat(ctag.value);
              break;
            case "currency":
              q.t = "n";
              q.v = parseFloat(ctag.value);
              break;
            case "date":
              q.t = "d";
              q.v = parseDate(ctag["date-value"]);
              if (!opts.cellDates) {
                q.t = "n";
                q.v = datenum(q.v);
              }
              q.z = "m/d/yy";
              break;
            case "time":
              q.t = "n";
              q.v = parse_isodur(ctag["time-value"]) / 86400;
              if (opts.cellDates) {
                q.t = "d";
                q.v = numdate(q.v);
              }
              q.z = "HH:MM:SS";
              break;
            case "number":
              q.t = "n";
              q.v = parseFloat(ctag["\u6570\u636E\u6570\u503C"]);
              break;
            default:
              if (q.t === "string" || q.t === "text" || !q.t) {
                q.t = "s";
                if (ctag["string-value"] != null) {
                  textp = unescapexml(ctag["string-value"]);
                  textR = [];
                }
              } else throw new Error("Unsupported value type " + q.t);
          }
        } else {
          isstub = false;
          if (q.t === "s") {
            q.v = textp || "";
            if (textR.length) q.R = textR;
            isstub = textpidx == 0;
          }
          if (atag.Target) q.l = atag;
          if (comments.length > 0) {
            q.c = comments;
            comments = [];
          }
          if (textp && opts.cellText !== false) q.w = textp;
          if (isstub) {
            q.t = "z";
            delete q.v;
          }
          if (!isstub || opts.sheetStubs) {
            if (!(opts.sheetRows && opts.sheetRows <= R)) {
              for (var rpt = 0; rpt < rowpeat; ++rpt) {
                colpeat = parseInt(ctag["number-columns-repeated"] || "1", 10);
                if (opts.dense) {
                  if (!ws[R + rpt]) ws[R + rpt] = [];
                  ws[R + rpt][C] = rpt == 0 ? q : dup(q);
                  while (--colpeat > 0) ws[R + rpt][C + colpeat] = dup(q);
                } else {
                  ws[encode_cell({ r: R + rpt, c: C })] = q;
                  while (--colpeat > 0) ws[encode_cell({ r: R + rpt, c: C + colpeat })] = dup(q);
                }
                if (range.e.c <= C) range.e.c = C;
              }
            }
          }
          colpeat = parseInt(ctag["number-columns-repeated"] || "1", 10);
          C += colpeat - 1;
          colpeat = 0;
          q = {
            /*:: t:"", v:null, z:null, w:"",c:[]*/
          };
          textp = "";
          textR = [];
        }
        atag = {};
        break;
      // 9.1.4 <table:table-cell>
      /* pure state */
      case "document":
      // TODO: <office:document> is the root for FODS
      case "document-content":
      case "\u7535\u5B50\u8868\u683C\u6587\u6863":
      // 3.1.3.2 <office:document-content>
      case "spreadsheet":
      case "\u4E3B\u4F53":
      // 3.7 <office:spreadsheet>
      case "scripts":
      // 3.12 <office:scripts>
      case "styles":
      // TODO <office:styles>
      case "font-face-decls":
      // 3.14 <office:font-face-decls>
      case "master-styles":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw "Bad state: " + tmp;
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") state.push([Rn[3], true]);
        break;
      case "annotation":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw "Bad state: " + tmp;
          comment.t = textp;
          if (textR.length) comment.R = textR;
          comment.a = creator;
          comments.push(comment);
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") {
          state.push([Rn[3], false]);
        }
        creator = "";
        creatoridx = 0;
        textp = "";
        textpidx = 0;
        textR = [];
        break;
      case "creator":
        if (Rn[1] === "/") {
          creator = str.slice(creatoridx, Rn.index);
        } else creatoridx = Rn.index + Rn[0].length;
        break;
      /* ignore state */
      case "meta":
      case "\u5143\u6570\u636E":
      // TODO: <office:meta> <uof:元数据> FODS/UOF
      case "settings":
      // TODO: <office:settings>
      case "config-item-set":
      // TODO: <office:config-item-set>
      case "config-item-map-indexed":
      // TODO: <office:config-item-map-indexed>
      case "config-item-map-entry":
      // TODO: <office:config-item-map-entry>
      case "config-item-map-named":
      // TODO: <office:config-item-map-entry>
      case "shapes":
      // 9.2.8 <table:shapes>
      case "frame":
      // 10.4.2 <draw:frame>
      case "text-box":
      // 10.4.3 <draw:text-box>
      case "image":
      // 10.4.4 <draw:image>
      case "data-pilot-tables":
      // 9.6.2 <table:data-pilot-tables>
      case "list-style":
      // 16.30 <text:list-style>
      case "form":
      // 13.13 <form:form>
      case "dde-links":
      // 9.8 <table:dde-links>
      case "event-listeners":
      // TODO
      case "chart":
        if (Rn[1] === "/") {
          if ((tmp = state.pop())[0] !== Rn[3]) throw "Bad state: " + tmp;
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") state.push([Rn[3], false]);
        textp = "";
        textpidx = 0;
        textR = [];
        break;
      case "scientific-number":
        break;
      case "currency-symbol":
        break;
      case "currency-style":
        break;
      case "number-style":
      // 16.27.2 <number:number-style>
      case "percentage-style":
      // 16.27.9 <number:percentage-style>
      case "date-style":
      // 16.27.10 <number:date-style>
      case "time-style":
        if (Rn[1] === "/") {
          number_format_map[NFtag.name] = NF;
          if ((tmp = state.pop())[0] !== Rn[3]) throw "Bad state: " + tmp;
        } else if (Rn[0].charAt(Rn[0].length - 2) !== "/") {
          NF = "";
          NFtag = parsexmltag(Rn[0], false);
          state.push([Rn[3], true]);
        }
        break;
      case "script":
        break;
      // 3.13 <office:script>
      case "libraries":
        break;
      // TODO: <ooo:libraries>
      case "automatic-styles":
        break;
      // 3.15.3 <office:automatic-styles>
      case "default-style":
      // TODO: <style:default-style>
      case "page-layout":
        break;
      // TODO: <style:page-layout>
      case "style":
        break;
      case "map":
        break;
      // 16.3 <style:map>
      case "font-face":
        break;
      // 16.21 <style:font-face>
      case "paragraph-properties":
        break;
      // 17.6 <style:paragraph-properties>
      case "table-properties":
        break;
      // 17.15 <style:table-properties>
      case "table-column-properties":
        break;
      // 17.16 <style:table-column-properties>
      case "table-row-properties":
        break;
      // 17.17 <style:table-row-properties>
      case "table-cell-properties":
        break;
      // 17.18 <style:table-cell-properties>
      case "number":
        switch (state[state.length - 1][0]) {
          case "time-style":
          case "date-style":
            tag = parsexmltag(Rn[0], false);
            NF += number_formats_ods[Rn[3]][tag.style === "long" ? 1 : 0];
            break;
        }
        break;
      case "fraction":
        break;
      // TODO 16.27.6 <number:fraction>
      case "day":
      // 16.27.11 <number:day>
      case "month":
      // 16.27.12 <number:month>
      case "year":
      // 16.27.13 <number:year>
      case "era":
      // 16.27.14 <number:era>
      case "day-of-week":
      // 16.27.15 <number:day-of-week>
      case "week-of-year":
      // 16.27.16 <number:week-of-year>
      case "quarter":
      // 16.27.17 <number:quarter>
      case "hours":
      // 16.27.19 <number:hours>
      case "minutes":
      // 16.27.20 <number:minutes>
      case "seconds":
      // 16.27.21 <number:seconds>
      case "am-pm":
        switch (state[state.length - 1][0]) {
          case "time-style":
          case "date-style":
            tag = parsexmltag(Rn[0], false);
            NF += number_formats_ods[Rn[3]][tag.style === "long" ? 1 : 0];
            break;
        }
        break;
      case "boolean-style":
        break;
      // 16.27.23 <number:boolean-style>
      case "boolean":
        break;
      // 16.27.24 <number:boolean>
      case "text-style":
        break;
      // 16.27.25 <number:text-style>
      case "text":
        if (Rn[0].slice(-2) === "/>") break;
        else if (Rn[1] === "/") switch (state[state.length - 1][0]) {
          case "number-style":
          case "date-style":
          case "time-style":
            NF += str.slice(pidx, Rn.index);
            break;
        }
        else pidx = Rn.index + Rn[0].length;
        break;
      case "named-range":
        tag = parsexmltag(Rn[0], false);
        _Ref = ods_to_csf_3D(tag["cell-range-address"]);
        var nrange = { Name: tag.name, Ref: _Ref[0] + "!" + _Ref[1] };
        if (intable) nrange.Sheet = SheetNames.length;
        WB.Names.push(nrange);
        break;
      case "text-content":
        break;
      // 16.27.27 <number:text-content>
      case "text-properties":
        break;
      // 16.27.27 <style:text-properties>
      case "embedded-text":
        break;
      // 16.27.4 <number:embedded-text>
      case "body":
      case "\u7535\u5B50\u8868\u683C":
        break;
      // 3.3 16.9.6 19.726.3
      case "forms":
        break;
      // 12.25.2 13.2
      case "table-column":
        break;
      // 9.1.6 <table:table-column>
      case "table-header-rows":
        break;
      // 9.1.7 <table:table-header-rows>
      case "table-rows":
        break;
      // 9.1.12 <table:table-rows>
      /* TODO: outline levels */
      case "table-column-group":
        break;
      // 9.1.10 <table:table-column-group>
      case "table-header-columns":
        break;
      // 9.1.11 <table:table-header-columns>
      case "table-columns":
        break;
      // 9.1.12 <table:table-columns>
      case "null-date":
        break;
      // 9.4.2 <table:null-date> TODO: date1904
      case "graphic-properties":
        break;
      // 17.21 <style:graphic-properties>
      case "calculation-settings":
        break;
      // 9.4.1 <table:calculation-settings>
      case "named-expressions":
        break;
      // 9.4.11 <table:named-expressions>
      case "label-range":
        break;
      // 9.4.9 <table:label-range>
      case "label-ranges":
        break;
      // 9.4.10 <table:label-ranges>
      case "named-expression":
        break;
      // 9.4.13 <table:named-expression>
      case "sort":
        break;
      // 9.4.19 <table:sort>
      case "sort-by":
        break;
      // 9.4.20 <table:sort-by>
      case "sort-groups":
        break;
      // 9.4.22 <table:sort-groups>
      case "tab":
        break;
      // 6.1.4 <text:tab>
      case "line-break":
        break;
      // 6.1.5 <text:line-break>
      case "span":
        break;
      // 6.1.7 <text:span>
      case "p":
      case "\u6587\u672C\u4E32":
        if (["master-styles"].indexOf(state[state.length - 1][0]) > -1) break;
        if (Rn[1] === "/" && (!ctag || !ctag["string-value"])) {
          var ptp = parse_text_p(str.slice(textpidx, Rn.index), textptag);
          textp = (textp.length > 0 ? textp + "\n" : "") + ptp[0];
        } else {
          textptag = parsexmltag(Rn[0], false);
          textpidx = Rn.index + Rn[0].length;
        }
        break;
      // <text:p>
      case "s":
        break;
      // <text:s>
      case "database-range":
        if (Rn[1] === "/") break;
        try {
          _Ref = ods_to_csf_3D(parsexmltag(Rn[0])["target-range-address"]);
          Sheets[_Ref[0]]["!autofilter"] = { ref: _Ref[1] };
        } catch (e) {
        }
        break;
      case "date":
        break;
      // <*:date>
      case "object":
        break;
      // 10.4.6.2 <draw:object>
      case "title":
      case "\u6807\u9898":
        break;
      // <*:title> OR <uof:标题>
      case "desc":
        break;
      // <*:desc>
      case "binary-data":
        break;
      // 10.4.5 TODO: b64 blob
      /* 9.2 Advanced Tables */
      case "table-source":
        break;
      // 9.2.6
      case "scenario":
        break;
      // 9.2.6
      case "iteration":
        break;
      // 9.4.3 <table:iteration>
      case "content-validations":
        break;
      // 9.4.4 <table:
      case "content-validation":
        break;
      // 9.4.5 <table:
      case "help-message":
        break;
      // 9.4.6 <table:
      case "error-message":
        break;
      // 9.4.7 <table:
      case "database-ranges":
        break;
      // 9.4.14 <table:database-ranges>
      case "filter":
        break;
      // 9.5.2 <table:filter>
      case "filter-and":
        break;
      // 9.5.3 <table:filter-and>
      case "filter-or":
        break;
      // 9.5.4 <table:filter-or>
      case "filter-condition":
        break;
      // 9.5.5 <table:filter-condition>
      case "list-level-style-bullet":
        break;
      // 16.31 <text:
      case "list-level-style-number":
        break;
      // 16.32 <text:
      case "list-level-properties":
        break;
      // 17.19 <style:
      /* 7.3 Document Fields */
      case "sender-firstname":
      // 7.3.6.2
      case "sender-lastname":
      // 7.3.6.3
      case "sender-initials":
      // 7.3.6.4
      case "sender-title":
      // 7.3.6.5
      case "sender-position":
      // 7.3.6.6
      case "sender-email":
      // 7.3.6.7
      case "sender-phone-private":
      // 7.3.6.8
      case "sender-fax":
      // 7.3.6.9
      case "sender-company":
      // 7.3.6.10
      case "sender-phone-work":
      // 7.3.6.11
      case "sender-street":
      // 7.3.6.12
      case "sender-city":
      // 7.3.6.13
      case "sender-postal-code":
      // 7.3.6.14
      case "sender-country":
      // 7.3.6.15
      case "sender-state-or-province":
      // 7.3.6.16
      case "author-name":
      // 7.3.7.1
      case "author-initials":
      // 7.3.7.2
      case "chapter":
      // 7.3.8
      case "file-name":
      // 7.3.9
      case "template-name":
      // 7.3.9
      case "sheet-name":
        break;
      case "event-listener":
        break;
      /* TODO: FODS Properties */
      case "initial-creator":
      case "creation-date":
      case "print-date":
      case "generator":
      case "document-statistic":
      case "user-defined":
      case "editing-duration":
      case "editing-cycles":
        break;
      /* TODO: FODS Config */
      case "config-item":
        break;
      /* TODO: style tokens */
      case "page-number":
        break;
      // TODO <text:page-number>
      case "page-count":
        break;
      // TODO <text:page-count>
      case "time":
        break;
      // TODO <text:time>
      /* 9.3 Advanced Table Cells */
      case "cell-range-source":
        break;
      // 9.3.1 <table:
      case "detective":
        break;
      // 9.3.2 <table:
      case "operation":
        break;
      // 9.3.3 <table:
      case "highlighted-range":
        break;
      // 9.3.4 <table:
      /* 9.6 Data Pilot Tables <table: */
      case "data-pilot-table":
      // 9.6.3
      case "source-cell-range":
      // 9.6.5
      case "source-service":
      // 9.6.6
      case "data-pilot-field":
      // 9.6.7
      case "data-pilot-level":
      // 9.6.8
      case "data-pilot-subtotals":
      // 9.6.9
      case "data-pilot-subtotal":
      // 9.6.10
      case "data-pilot-members":
      // 9.6.11
      case "data-pilot-member":
      // 9.6.12
      case "data-pilot-display-info":
      // 9.6.13
      case "data-pilot-sort-info":
      // 9.6.14
      case "data-pilot-layout-info":
      // 9.6.15
      case "data-pilot-field-reference":
      // 9.6.16
      case "data-pilot-groups":
      // 9.6.17
      case "data-pilot-group":
      // 9.6.18
      case "data-pilot-group-member":
        break;
      /* 10.3 Drawing Shapes */
      case "rect":
        break;
      /* 14.6 DDE Connections */
      case "dde-connection-decls":
      // 14.6.2 <text:
      case "dde-connection-decl":
      // 14.6.3 <text:
      case "dde-link":
      // 14.6.4 <table:
      case "dde-source":
        break;
      case "properties":
        break;
      // 13.7 <form:properties>
      case "property":
        break;
      // 13.8 <form:property>
      case "a":
        if (Rn[1] !== "/") {
          atag = parsexmltag(Rn[0], false);
          if (!atag.href) break;
          atag.Target = unescapexml(atag.href);
          delete atag.href;
          if (atag.Target.charAt(0) == "#" && atag.Target.indexOf(".") > -1) {
            _Ref = ods_to_csf_3D(atag.Target.slice(1));
            atag.Target = "#" + _Ref[0] + "!" + _Ref[1];
          } else if (atag.Target.match(/^\.\.[\\\/]/)) atag.Target = atag.Target.slice(3);
        }
        break;
      /* non-standard */
      case "table-protection":
        break;
      case "data-pilot-grand-total":
        break;
      // <table:
      case "office-document-common-attrs":
        break;
      // bare
      default:
        switch (Rn[2]) {
          case "dc:":
          // TODO: properties
          case "calcext:":
          // ignore undocumented extensions
          case "loext:":
          // ignore undocumented extensions
          case "ooo:":
          // ignore undocumented extensions
          case "chartooo:":
          // ignore undocumented extensions
          case "draw:":
          // TODO: drawing
          case "style:":
          // TODO: styles
          case "chart:":
          // TODO: charts
          case "form:":
          // TODO: forms
          case "uof:":
          // TODO: uof
          case "\u8868:":
          // TODO: uof
          case "\u5B57:":
            break;
          default:
            if (opts.WTF) throw new Error(Rn);
        }
    }
    var out = {
      Sheets,
      SheetNames,
      Workbook: WB
    };
    if (opts.bookSheets) delete /*::(*/
    out.Sheets;
    return out;
  }
  function parse_ods(zip, opts) {
    opts = opts || {};
    if (safegetzipfile(zip, "META-INF/manifest.xml")) parse_manifest(getzipdata(zip, "META-INF/manifest.xml"), opts);
    var content = getzipstr(zip, "content.xml");
    if (!content) throw new Error("Missing content.xml in ODS / UOF file");
    var wb = parse_content_xml(utf8read(content), opts);
    if (safegetzipfile(zip, "meta.xml")) wb.Props = parse_core_props(getzipdata(zip, "meta.xml"));
    return wb;
  }
  function parse_fods(data, opts) {
    return parse_content_xml(data, opts);
  }
  function u8_to_dataview(array) {
    return new DataView(array.buffer, array.byteOffset, array.byteLength);
  }
  function u8str(u8) {
    return typeof TextDecoder != "undefined" ? new TextDecoder().decode(u8) : utf8read(a2s(u8));
  }
  function u8concat(u8a) {
    var len = u8a.reduce(function(acc, x) {
      return acc + x.length;
    }, 0);
    var out = new Uint8Array(len);
    var off = 0;
    u8a.forEach(function(u8) {
      out.set(u8, off);
      off += u8.length;
    });
    return out;
  }
  function popcnt(x) {
    x -= x >> 1 & 1431655765;
    x = (x & 858993459) + (x >> 2 & 858993459);
    return (x + (x >> 4) & 252645135) * 16843009 >>> 24;
  }
  function readDecimal128LE(buf, offset) {
    var exp = (buf[offset + 15] & 127) << 7 | buf[offset + 14] >> 1;
    var mantissa = buf[offset + 14] & 1;
    for (var j = offset + 13; j >= offset; --j)
      mantissa = mantissa * 256 + buf[j];
    return (buf[offset + 15] & 128 ? -mantissa : mantissa) * Math.pow(10, exp - 6176);
  }
  function parse_varint49(buf, ptr) {
    var l = ptr ? ptr[0] : 0;
    var usz = buf[l] & 127;
    varint:
      if (buf[l++] >= 128) {
        usz |= (buf[l] & 127) << 7;
        if (buf[l++] < 128)
          break varint;
        usz |= (buf[l] & 127) << 14;
        if (buf[l++] < 128)
          break varint;
        usz |= (buf[l] & 127) << 21;
        if (buf[l++] < 128)
          break varint;
        usz += (buf[l] & 127) * Math.pow(2, 28);
        ++l;
        if (buf[l++] < 128)
          break varint;
        usz += (buf[l] & 127) * Math.pow(2, 35);
        ++l;
        if (buf[l++] < 128)
          break varint;
        usz += (buf[l] & 127) * Math.pow(2, 42);
        ++l;
        if (buf[l++] < 128)
          break varint;
      }
    if (ptr)
      ptr[0] = l;
    return usz;
  }
  function varint_to_i32(buf) {
    var l = 0, i32 = buf[l] & 127;
    varint:
      if (buf[l++] >= 128) {
        i32 |= (buf[l] & 127) << 7;
        if (buf[l++] < 128)
          break varint;
        i32 |= (buf[l] & 127) << 14;
        if (buf[l++] < 128)
          break varint;
        i32 |= (buf[l] & 127) << 21;
        if (buf[l++] < 128)
          break varint;
        i32 |= (buf[l] & 127) << 28;
      }
    return i32;
  }
  function parse_shallow(buf) {
    var out = [], ptr = [0];
    while (ptr[0] < buf.length) {
      var off = ptr[0];
      var num = parse_varint49(buf, ptr);
      var type = num & 7;
      num = Math.floor(num / 8);
      var len = 0;
      var res;
      if (num == 0)
        break;
      switch (type) {
        case 0:
          {
            var l = ptr[0];
            while (buf[ptr[0]++] >= 128)
              ;
            res = buf.slice(l, ptr[0]);
          }
          break;
        case 5:
          len = 4;
          res = buf.slice(ptr[0], ptr[0] + len);
          ptr[0] += len;
          break;
        case 1:
          len = 8;
          res = buf.slice(ptr[0], ptr[0] + len);
          ptr[0] += len;
          break;
        case 2:
          len = parse_varint49(buf, ptr);
          res = buf.slice(ptr[0], ptr[0] + len);
          ptr[0] += len;
          break;
        case 3:
        case 4:
        default:
          throw new Error("PB Type ".concat(type, " for Field ").concat(num, " at offset ").concat(off));
      }
      var v = { data: res, type };
      if (out[num] == null)
        out[num] = [v];
      else
        out[num].push(v);
    }
    return out;
  }
  function mappa(data, cb) {
    return (data == null ? void 0 : data.map(function(d) {
      return cb(d.data);
    })) || [];
  }
  function parse_iwa_file(buf) {
    var _a;
    var out = [], ptr = [0];
    while (ptr[0] < buf.length) {
      var len = parse_varint49(buf, ptr);
      var ai = parse_shallow(buf.slice(ptr[0], ptr[0] + len));
      ptr[0] += len;
      var res = {
        id: varint_to_i32(ai[1][0].data),
        messages: []
      };
      ai[2].forEach(function(b) {
        var mi = parse_shallow(b.data);
        var fl = varint_to_i32(mi[3][0].data);
        res.messages.push({
          meta: mi,
          data: buf.slice(ptr[0], ptr[0] + fl)
        });
        ptr[0] += fl;
      });
      if ((_a = ai[3]) == null ? void 0 : _a[0])
        res.merge = varint_to_i32(ai[3][0].data) >>> 0 > 0;
      out.push(res);
    }
    return out;
  }
  function parse_snappy_chunk(type, buf) {
    if (type != 0)
      throw new Error("Unexpected Snappy chunk type ".concat(type));
    var ptr = [0];
    var usz = parse_varint49(buf, ptr);
    var chunks = [];
    while (ptr[0] < buf.length) {
      var tag = buf[ptr[0]] & 3;
      if (tag == 0) {
        var len = buf[ptr[0]++] >> 2;
        if (len < 60)
          ++len;
        else {
          var c = len - 59;
          len = buf[ptr[0]];
          if (c > 1)
            len |= buf[ptr[0] + 1] << 8;
          if (c > 2)
            len |= buf[ptr[0] + 2] << 16;
          if (c > 3)
            len |= buf[ptr[0] + 3] << 24;
          len >>>= 0;
          len++;
          ptr[0] += c;
        }
        chunks.push(buf.slice(ptr[0], ptr[0] + len));
        ptr[0] += len;
        continue;
      } else {
        var offset = 0, length = 0;
        if (tag == 1) {
          length = (buf[ptr[0]] >> 2 & 7) + 4;
          offset = (buf[ptr[0]++] & 224) << 3;
          offset |= buf[ptr[0]++];
        } else {
          length = (buf[ptr[0]++] >> 2) + 1;
          if (tag == 2) {
            offset = buf[ptr[0]] | buf[ptr[0] + 1] << 8;
            ptr[0] += 2;
          } else {
            offset = (buf[ptr[0]] | buf[ptr[0] + 1] << 8 | buf[ptr[0] + 2] << 16 | buf[ptr[0] + 3] << 24) >>> 0;
            ptr[0] += 4;
          }
        }
        chunks = [u8concat(chunks)];
        if (offset == 0)
          throw new Error("Invalid offset 0");
        if (offset > chunks[0].length)
          throw new Error("Invalid offset beyond length");
        if (length >= offset) {
          chunks.push(chunks[0].slice(-offset));
          length -= offset;
          while (length >= chunks[chunks.length - 1].length) {
            chunks.push(chunks[chunks.length - 1]);
            length -= chunks[chunks.length - 1].length;
          }
        }
        chunks.push(chunks[0].slice(-offset, -offset + length));
      }
    }
    var o = u8concat(chunks);
    if (o.length != usz)
      throw new Error("Unexpected length: ".concat(o.length, " != ").concat(usz));
    return o;
  }
  function decompress_iwa_file(buf) {
    var out = [];
    var l = 0;
    while (l < buf.length) {
      var t = buf[l++];
      var len = buf[l] | buf[l + 1] << 8 | buf[l + 2] << 16;
      l += 3;
      out.push(parse_snappy_chunk(t, buf.slice(l, l + len)));
      l += len;
    }
    if (l !== buf.length)
      throw new Error("data is not a valid framed stream!");
    return u8concat(out);
  }
  function parse_old_storage(buf, sst, rsst, v) {
    var dv = u8_to_dataview(buf);
    var flags = dv.getUint32(4, true);
    var data_offset = (v > 1 ? 12 : 8) + popcnt(flags & (v > 1 ? 3470 : 398)) * 4;
    var ridx = -1, sidx = -1, ieee = NaN, dt = new Date(2001, 0, 1);
    if (flags & 512) {
      ridx = dv.getUint32(data_offset, true);
      data_offset += 4;
    }
    data_offset += popcnt(flags & (v > 1 ? 12288 : 4096)) * 4;
    if (flags & 16) {
      sidx = dv.getUint32(data_offset, true);
      data_offset += 4;
    }
    if (flags & 32) {
      ieee = dv.getFloat64(data_offset, true);
      data_offset += 8;
    }
    if (flags & 64) {
      dt.setTime(dt.getTime() + dv.getFloat64(data_offset, true) * 1e3);
      data_offset += 8;
    }
    var ret;
    switch (buf[2]) {
      case 0:
        break;
      case 2:
        ret = { t: "n", v: ieee };
        break;
      case 3:
        ret = { t: "s", v: sst[sidx] };
        break;
      case 5:
        ret = { t: "d", v: dt };
        break;
      case 6:
        ret = { t: "b", v: ieee > 0 };
        break;
      case 7:
        ret = { t: "n", v: ieee / 86400 };
        break;
      case 8:
        ret = { t: "e", v: 0 };
        break;
      case 9:
        {
          if (ridx > -1)
            ret = { t: "s", v: rsst[ridx] };
          else if (sidx > -1)
            ret = { t: "s", v: sst[sidx] };
          else if (!isNaN(ieee))
            ret = { t: "n", v: ieee };
          else
            throw new Error("Unsupported cell type ".concat(buf.slice(0, 4)));
        }
        break;
      default:
        throw new Error("Unsupported cell type ".concat(buf.slice(0, 4)));
    }
    return ret;
  }
  function parse_new_storage(buf, sst, rsst) {
    var dv = u8_to_dataview(buf);
    var flags = dv.getUint32(8, true);
    var data_offset = 12;
    var ridx = -1, sidx = -1, d128 = NaN, ieee = NaN, dt = new Date(2001, 0, 1);
    if (flags & 1) {
      d128 = readDecimal128LE(buf, data_offset);
      data_offset += 16;
    }
    if (flags & 2) {
      ieee = dv.getFloat64(data_offset, true);
      data_offset += 8;
    }
    if (flags & 4) {
      dt.setTime(dt.getTime() + dv.getFloat64(data_offset, true) * 1e3);
      data_offset += 8;
    }
    if (flags & 8) {
      sidx = dv.getUint32(data_offset, true);
      data_offset += 4;
    }
    if (flags & 16) {
      ridx = dv.getUint32(data_offset, true);
      data_offset += 4;
    }
    var ret;
    switch (buf[1]) {
      case 0:
        break;
      case 2:
        ret = { t: "n", v: d128 };
        break;
      case 3:
        ret = { t: "s", v: sst[sidx] };
        break;
      case 5:
        ret = { t: "d", v: dt };
        break;
      case 6:
        ret = { t: "b", v: ieee > 0 };
        break;
      case 7:
        ret = { t: "n", v: ieee / 86400 };
        break;
      case 8:
        ret = { t: "e", v: 0 };
        break;
      case 9:
        {
          if (ridx > -1)
            ret = { t: "s", v: rsst[ridx] };
          else
            throw new Error("Unsupported cell type ".concat(buf[1], " : ").concat(flags & 31, " : ").concat(buf.slice(0, 4)));
        }
        break;
      case 10:
        ret = { t: "n", v: d128 };
        break;
      default:
        throw new Error("Unsupported cell type ".concat(buf[1], " : ").concat(flags & 31, " : ").concat(buf.slice(0, 4)));
    }
    return ret;
  }
  function parse_cell_storage(buf, sst, rsst) {
    switch (buf[0]) {
      case 0:
      case 1:
      case 2:
      case 3:
        return parse_old_storage(buf, sst, rsst, buf[0]);
      case 5:
        return parse_new_storage(buf, sst, rsst);
      default:
        throw new Error("Unsupported payload version ".concat(buf[0]));
    }
  }
  function parse_TSP_Reference(buf) {
    var pb = parse_shallow(buf);
    return parse_varint49(pb[1][0].data);
  }
  function parse_TST_TableDataList(M, root) {
    var pb = parse_shallow(root.data);
    var type = varint_to_i32(pb[1][0].data);
    var entries = pb[3];
    var data = [];
    (entries || []).forEach(function(entry) {
      var le = parse_shallow(entry.data);
      var key = varint_to_i32(le[1][0].data) >>> 0;
      switch (type) {
        case 1:
          data[key] = u8str(le[3][0].data);
          break;
        case 8:
          {
            var rt = M[parse_TSP_Reference(le[9][0].data)][0];
            var rtp = parse_shallow(rt.data);
            var rtpref = M[parse_TSP_Reference(rtp[1][0].data)][0];
            var mtype = varint_to_i32(rtpref.meta[1][0].data);
            if (mtype != 2001)
              throw new Error("2000 unexpected reference to ".concat(mtype));
            var tswpsa = parse_shallow(rtpref.data);
            data[key] = tswpsa[3].map(function(x) {
              return u8str(x.data);
            }).join("");
          }
          break;
      }
    });
    return data;
  }
  function parse_TST_TileRowInfo(u8, type) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    var pb = parse_shallow(u8);
    var R = varint_to_i32(pb[1][0].data) >>> 0;
    var cnt = varint_to_i32(pb[2][0].data) >>> 0;
    var wide_offsets = ((_b = (_a = pb[8]) == null ? void 0 : _a[0]) == null ? void 0 : _b.data) && varint_to_i32(pb[8][0].data) > 0 || false;
    var used_storage_u8, used_storage;
    if (((_d = (_c = pb[7]) == null ? void 0 : _c[0]) == null ? void 0 : _d.data) && type != 0) {
      used_storage_u8 = (_f = (_e = pb[7]) == null ? void 0 : _e[0]) == null ? void 0 : _f.data;
      used_storage = (_h = (_g = pb[6]) == null ? void 0 : _g[0]) == null ? void 0 : _h.data;
    } else if (((_j = (_i = pb[4]) == null ? void 0 : _i[0]) == null ? void 0 : _j.data) && type != 1) {
      used_storage_u8 = (_l = (_k = pb[4]) == null ? void 0 : _k[0]) == null ? void 0 : _l.data;
      used_storage = (_n = (_m = pb[3]) == null ? void 0 : _m[0]) == null ? void 0 : _n.data;
    } else
      throw "NUMBERS Tile missing ".concat(type, " cell storage");
    var width = wide_offsets ? 4 : 1;
    var used_storage_offsets = u8_to_dataview(used_storage_u8);
    var offsets = [];
    for (var C = 0; C < used_storage_u8.length / 2; ++C) {
      var off = used_storage_offsets.getUint16(C * 2, true);
      if (off < 65535)
        offsets.push([C, off]);
    }
    if (offsets.length != cnt)
      throw "Expected ".concat(cnt, " cells, found ").concat(offsets.length);
    var cells = [];
    for (C = 0; C < offsets.length - 1; ++C)
      cells[offsets[C][0]] = used_storage.subarray(offsets[C][1] * width, offsets[C + 1][1] * width);
    if (offsets.length >= 1)
      cells[offsets[offsets.length - 1][0]] = used_storage.subarray(offsets[offsets.length - 1][1] * width);
    return { R, cells };
  }
  function parse_TST_Tile(M, root) {
    var _a;
    var pb = parse_shallow(root.data);
    var storage = ((_a = pb == null ? void 0 : pb[7]) == null ? void 0 : _a[0]) ? varint_to_i32(pb[7][0].data) >>> 0 > 0 ? 1 : 0 : -1;
    var ri = mappa(pb[5], function(u8) {
      return parse_TST_TileRowInfo(u8, storage);
    });
    return {
      nrows: varint_to_i32(pb[4][0].data) >>> 0,
      data: ri.reduce(function(acc, x) {
        if (!acc[x.R])
          acc[x.R] = [];
        x.cells.forEach(function(cell, C) {
          if (acc[x.R][C])
            throw new Error("Duplicate cell r=".concat(x.R, " c=").concat(C));
          acc[x.R][C] = cell;
        });
        return acc;
      }, [])
    };
  }
  function parse_TST_TableModelArchive(M, root, ws) {
    var _a;
    var pb = parse_shallow(root.data);
    var range = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    range.e.r = (varint_to_i32(pb[6][0].data) >>> 0) - 1;
    if (range.e.r < 0)
      throw new Error("Invalid row varint ".concat(pb[6][0].data));
    range.e.c = (varint_to_i32(pb[7][0].data) >>> 0) - 1;
    if (range.e.c < 0)
      throw new Error("Invalid col varint ".concat(pb[7][0].data));
    ws["!ref"] = encode_range(range);
    var store = parse_shallow(pb[4][0].data);
    var sst = parse_TST_TableDataList(M, M[parse_TSP_Reference(store[4][0].data)][0]);
    var rsst = ((_a = store[17]) == null ? void 0 : _a[0]) ? parse_TST_TableDataList(M, M[parse_TSP_Reference(store[17][0].data)][0]) : [];
    var tile = parse_shallow(store[3][0].data);
    var _R = 0;
    tile[1].forEach(function(t) {
      var tl = parse_shallow(t.data);
      var ref = M[parse_TSP_Reference(tl[2][0].data)][0];
      var mtype = varint_to_i32(ref.meta[1][0].data);
      if (mtype != 6002)
        throw new Error("6001 unexpected reference to ".concat(mtype));
      var _tile = parse_TST_Tile(M, ref);
      _tile.data.forEach(function(row, R) {
        row.forEach(function(buf, C) {
          var addr = encode_cell({ r: _R + R, c: C });
          var res = parse_cell_storage(buf, sst, rsst);
          if (res)
            ws[addr] = res;
        });
      });
      _R += _tile.nrows;
    });
  }
  function parse_TST_TableInfoArchive(M, root) {
    var pb = parse_shallow(root.data);
    var out = { "!ref": "A1" };
    var tableref = M[parse_TSP_Reference(pb[2][0].data)];
    var mtype = varint_to_i32(tableref[0].meta[1][0].data);
    if (mtype != 6001)
      throw new Error("6000 unexpected reference to ".concat(mtype));
    parse_TST_TableModelArchive(M, tableref[0], out);
    return out;
  }
  function parse_TN_SheetArchive(M, root) {
    var _a;
    var pb = parse_shallow(root.data);
    var out = {
      name: ((_a = pb[1]) == null ? void 0 : _a[0]) ? u8str(pb[1][0].data) : "",
      sheets: []
    };
    var shapeoffs = mappa(pb[2], parse_TSP_Reference);
    shapeoffs.forEach(function(off) {
      M[off].forEach(function(m) {
        var mtype = varint_to_i32(m.meta[1][0].data);
        if (mtype == 6e3)
          out.sheets.push(parse_TST_TableInfoArchive(M, m));
      });
    });
    return out;
  }
  function parse_TN_DocumentArchive(M, root) {
    var out = book_new();
    var pb = parse_shallow(root.data);
    var sheetoffs = mappa(pb[1], parse_TSP_Reference);
    sheetoffs.forEach(function(off) {
      M[off].forEach(function(m) {
        var mtype = varint_to_i32(m.meta[1][0].data);
        if (mtype == 2) {
          var root2 = parse_TN_SheetArchive(M, m);
          root2.sheets.forEach(function(sheet, idx) {
            book_append_sheet(out, sheet, idx == 0 ? root2.name : root2.name + "_" + idx, true);
          });
        }
      });
    });
    if (out.SheetNames.length == 0)
      throw new Error("Empty NUMBERS file");
    return out;
  }
  function parse_numbers_iwa(cfb) {
    var _a, _b, _c, _d;
    var M = {}, indices = [];
    cfb.FullPaths.forEach(function(p) {
      if (p.match(/\.iwpv2/))
        throw new Error("Unsupported password protection");
    });
    cfb.FileIndex.forEach(function(s) {
      if (!s.name.match(/\.iwa$/))
        return;
      var o;
      try {
        o = decompress_iwa_file(s.content);
      } catch (e) {
        return console.log("?? " + s.content.length + " " + (e.message || e));
      }
      var packets;
      try {
        packets = parse_iwa_file(o);
      } catch (e) {
        return console.log("## " + (e.message || e));
      }
      packets.forEach(function(packet) {
        M[packet.id] = packet.messages;
        indices.push(packet.id);
      });
    });
    if (!indices.length)
      throw new Error("File has no messages");
    var docroot = ((_d = (_c = (_b = (_a = M == null ? void 0 : M[1]) == null ? void 0 : _a[0]) == null ? void 0 : _b.meta) == null ? void 0 : _c[1]) == null ? void 0 : _d[0].data) && varint_to_i32(M[1][0].meta[1][0].data) == 1 && M[1][0];
    if (!docroot)
      indices.forEach(function(idx) {
        M[idx].forEach(function(iwam) {
          var mtype = varint_to_i32(iwam.meta[1][0].data) >>> 0;
          if (mtype == 1) {
            if (!docroot)
              docroot = iwam;
            else
              throw new Error("Document has multiple roots");
          }
        });
      });
    if (!docroot)
      throw new Error("Cannot find Document root");
    return parse_TN_DocumentArchive(M, docroot);
  }
  function fix_opts_func(defaults) {
    return function fix_opts(opts) {
      for (var i = 0; i != defaults.length; ++i) {
        var d = defaults[i];
        if (opts[d[0]] === void 0) opts[d[0]] = d[1];
        if (d[2] === "n") opts[d[0]] = Number(opts[d[0]]);
      }
    };
  }
  function fix_read_opts(opts) {
    fix_opts_func([
      ["cellNF", false],
      /* emit cell number format string as .z */
      ["cellHTML", true],
      /* emit html string as .h */
      ["cellFormula", true],
      /* emit formulae as .f */
      ["cellStyles", false],
      /* emits style/theme as .s */
      ["cellText", true],
      /* emit formatted text as .w */
      ["cellDates", false],
      /* emit date cells with type `d` */
      ["sheetStubs", false],
      /* emit empty cells */
      ["sheetRows", 0, "n"],
      /* read n rows (0 = read all rows) */
      ["bookDeps", false],
      /* parse calculation chains */
      ["bookSheets", false],
      /* only try to get sheet names (no Sheets) */
      ["bookProps", false],
      /* only try to get properties (no Sheets) */
      ["bookFiles", false],
      /* include raw file structure (keys, files, cfb) */
      ["bookVBA", false],
      /* include vba raw data (vbaraw) */
      ["password", ""],
      /* password */
      ["WTF", false]
      /* WTF mode (throws errors) */
    ])(opts);
  }
  function get_sheet_type(n) {
    if (RELS.WS.indexOf(n) > -1) return "sheet";
    if (RELS.CS && n == RELS.CS) return "chart";
    if (RELS.DS && n == RELS.DS) return "dialog";
    if (RELS.MS && n == RELS.MS) return "macro";
    return n && n.length ? n : "sheet";
  }
  function safe_parse_wbrels(wbrels, sheets) {
    if (!wbrels) return 0;
    try {
      wbrels = sheets.map(function pwbr(w) {
        if (!w.id) w.id = w.strRelID;
        return [w.name, wbrels["!id"][w.id].Target, get_sheet_type(wbrels["!id"][w.id].Type)];
      });
    } catch (e) {
      return null;
    }
    return !wbrels || wbrels.length === 0 ? null : wbrels;
  }
  function safe_parse_sheet(zip, path, relsPath, sheet, idx, sheetRels, sheets, stype, opts, wb, themes, styles) {
    try {
      sheetRels[sheet] = parse_rels(getzipstr(zip, relsPath, true), path);
      var data = getzipdata(zip, path);
      var _ws;
      switch (stype) {
        case "sheet":
          _ws = parse_ws(data, path, idx, opts, sheetRels[sheet], wb, themes, styles);
          break;
        case "chart":
          _ws = parse_cs(data, path, idx, opts, sheetRels[sheet], wb, themes, styles);
          if (!_ws || !_ws["!drawel"]) break;
          var dfile = resolve_path(_ws["!drawel"].Target, path);
          var drelsp = get_rels_path(dfile);
          var draw = parse_drawing(getzipstr(zip, dfile, true), parse_rels(getzipstr(zip, drelsp, true), dfile));
          var chartp = resolve_path(draw, dfile);
          var crelsp = get_rels_path(chartp);
          _ws = parse_chart(getzipstr(zip, chartp, true), chartp, opts, parse_rels(getzipstr(zip, crelsp, true), chartp), wb, _ws);
          break;
        case "macro":
          _ws = parse_ms(data, path, idx, opts, sheetRels[sheet], wb, themes, styles);
          break;
        case "dialog":
          _ws = parse_ds(data, path, idx, opts, sheetRels[sheet], wb, themes, styles);
          break;
        default:
          throw new Error("Unrecognized sheet type " + stype);
      }
      sheets[sheet] = _ws;
      var tcomments = [];
      if (sheetRels && sheetRels[sheet]) keys(sheetRels[sheet]).forEach(function(n) {
        var dfile2 = "";
        if (sheetRels[sheet][n].Type == RELS.CMNT) {
          dfile2 = resolve_path(sheetRels[sheet][n].Target, path);
          var comments = parse_cmnt(getzipdata(zip, dfile2, true), dfile2, opts);
          if (!comments || !comments.length) return;
          sheet_insert_comments(_ws, comments, false);
        }
        if (sheetRels[sheet][n].Type == RELS.TCMNT) {
          dfile2 = resolve_path(sheetRels[sheet][n].Target, path);
          tcomments = tcomments.concat(parse_tcmnt_xml(getzipdata(zip, dfile2, true), opts));
        }
      });
      if (tcomments && tcomments.length) sheet_insert_comments(_ws, tcomments, true, opts.people || []);
    } catch (e) {
      if (opts.WTF) throw e;
    }
  }
  function strip_front_slash(x) {
    return x.charAt(0) == "/" ? x.slice(1) : x;
  }
  function parse_zip(zip, opts) {
    make_ssf();
    opts = opts || {};
    fix_read_opts(opts);
    if (safegetzipfile(zip, "META-INF/manifest.xml")) return parse_ods(zip, opts);
    if (safegetzipfile(zip, "objectdata.xml")) return parse_ods(zip, opts);
    if (safegetzipfile(zip, "Index/Document.iwa")) {
      if (typeof Uint8Array == "undefined") throw new Error("NUMBERS file parsing requires Uint8Array support");
      if (typeof parse_numbers_iwa != "undefined") {
        if (zip.FileIndex) return parse_numbers_iwa(zip);
        var _zip = CFB.utils.cfb_new();
        zipentries(zip).forEach(function(e) {
          zip_add_file(_zip, e, getzipbin(zip, e));
        });
        return parse_numbers_iwa(_zip);
      }
      throw new Error("Unsupported NUMBERS file");
    }
    if (!safegetzipfile(zip, "[Content_Types].xml")) {
      if (safegetzipfile(zip, "index.xml.gz")) throw new Error("Unsupported NUMBERS 08 file");
      if (safegetzipfile(zip, "index.xml")) throw new Error("Unsupported NUMBERS 09 file");
      throw new Error("Unsupported ZIP file");
    }
    var entries = zipentries(zip);
    var dir = parse_ct(getzipstr(zip, "[Content_Types].xml"));
    var xlsb = false;
    var sheets, binname;
    if (dir.workbooks.length === 0) {
      binname = "xl/workbook.xml";
      if (getzipdata(zip, binname, true)) dir.workbooks.push(binname);
    }
    if (dir.workbooks.length === 0) {
      binname = "xl/workbook.bin";
      if (!getzipdata(zip, binname, true)) throw new Error("Could not find workbook");
      dir.workbooks.push(binname);
      xlsb = true;
    }
    if (dir.workbooks[0].slice(-3) == "bin") xlsb = true;
    var themes = {};
    var styles = {};
    if (!opts.bookSheets && !opts.bookProps) {
      strs = [];
      if (dir.sst) try {
        strs = parse_sst(getzipdata(zip, strip_front_slash(dir.sst)), dir.sst, opts);
      } catch (e) {
        if (opts.WTF) throw e;
      }
      if (opts.cellStyles && dir.themes.length) themes = parse_theme(getzipstr(zip, dir.themes[0].replace(/^\//, ""), true) || "", dir.themes[0], opts);
      if (dir.style) styles = parse_sty(getzipdata(zip, strip_front_slash(dir.style)), dir.style, themes, opts);
    }
    dir.links.map(function(link) {
      try {
        var rels = parse_rels(getzipstr(zip, get_rels_path(strip_front_slash(link))), link);
        return parse_xlink(getzipdata(zip, strip_front_slash(link)), rels, link, opts);
      } catch (e) {
      }
    });
    var wb = parse_wb(getzipdata(zip, strip_front_slash(dir.workbooks[0])), dir.workbooks[0], opts);
    var props = {}, propdata = "";
    if (dir.coreprops.length) {
      propdata = getzipdata(zip, strip_front_slash(dir.coreprops[0]), true);
      if (propdata) props = parse_core_props(propdata);
      if (dir.extprops.length !== 0) {
        propdata = getzipdata(zip, strip_front_slash(dir.extprops[0]), true);
        if (propdata) parse_ext_props(propdata, props, opts);
      }
    }
    var custprops = {};
    if (!opts.bookSheets || opts.bookProps) {
      if (dir.custprops.length !== 0) {
        propdata = getzipstr(zip, strip_front_slash(dir.custprops[0]), true);
        if (propdata) custprops = parse_cust_props(propdata, opts);
      }
    }
    var out = {};
    if (opts.bookSheets || opts.bookProps) {
      if (wb.Sheets) sheets = wb.Sheets.map(function pluck(x) {
        return x.name;
      });
      else if (props.Worksheets && props.SheetNames.length > 0) sheets = props.SheetNames;
      if (opts.bookProps) {
        out.Props = props;
        out.Custprops = custprops;
      }
      if (opts.bookSheets && typeof sheets !== "undefined") out.SheetNames = sheets;
      if (opts.bookSheets ? out.SheetNames : opts.bookProps) return out;
    }
    sheets = {};
    var deps = {};
    if (opts.bookDeps && dir.calcchain) deps = parse_cc(getzipdata(zip, strip_front_slash(dir.calcchain)), dir.calcchain, opts);
    var i = 0;
    var sheetRels = {};
    var path, relsPath;
    {
      var wbsheets = wb.Sheets;
      props.Worksheets = wbsheets.length;
      props.SheetNames = [];
      for (var j = 0; j != wbsheets.length; ++j) {
        props.SheetNames[j] = wbsheets[j].name;
      }
    }
    var wbext = xlsb ? "bin" : "xml";
    var wbrelsi = dir.workbooks[0].lastIndexOf("/");
    var wbrelsfile = (dir.workbooks[0].slice(0, wbrelsi + 1) + "_rels/" + dir.workbooks[0].slice(wbrelsi + 1) + ".rels").replace(/^\//, "");
    if (!safegetzipfile(zip, wbrelsfile)) wbrelsfile = "xl/_rels/workbook." + wbext + ".rels";
    var wbrels = parse_rels(getzipstr(zip, wbrelsfile, true), wbrelsfile.replace(/_rels.*/, "s5s"));
    if ((dir.metadata || []).length >= 1) {
      opts.xlmeta = parse_xlmeta(getzipdata(zip, strip_front_slash(dir.metadata[0])), dir.metadata[0], opts);
    }
    if ((dir.people || []).length >= 1) {
      opts.people = parse_people_xml(getzipdata(zip, strip_front_slash(dir.people[0])), opts);
    }
    if (wbrels) wbrels = safe_parse_wbrels(wbrels, wb.Sheets);
    var nmode = getzipdata(zip, "xl/worksheets/sheet.xml", true) ? 1 : 0;
    wsloop: for (i = 0; i != props.Worksheets; ++i) {
      var stype = "sheet";
      if (wbrels && wbrels[i]) {
        path = "xl/" + wbrels[i][1].replace(/[\/]?xl\//, "");
        if (!safegetzipfile(zip, path)) path = wbrels[i][1];
        if (!safegetzipfile(zip, path)) path = wbrelsfile.replace(/_rels\/.*$/, "") + wbrels[i][1];
        stype = wbrels[i][2];
      } else {
        path = "xl/worksheets/sheet" + (i + 1 - nmode) + "." + wbext;
        path = path.replace(/sheet0\./, "sheet.");
      }
      relsPath = path.replace(/^(.*)(\/)([^\/]*)$/, "$1/_rels/$3.rels");
      if (opts && opts.sheets != null) switch (typeof opts.sheets) {
        case "number":
          if (i != opts.sheets) continue wsloop;
          break;
        case "string":
          if (props.SheetNames[i].toLowerCase() != opts.sheets.toLowerCase()) continue wsloop;
          break;
        default:
          if (Array.isArray && Array.isArray(opts.sheets)) {
            var snjseen = false;
            for (var snj = 0; snj != opts.sheets.length; ++snj) {
              if (typeof opts.sheets[snj] == "number" && opts.sheets[snj] == i) snjseen = 1;
              if (typeof opts.sheets[snj] == "string" && opts.sheets[snj].toLowerCase() == props.SheetNames[i].toLowerCase()) snjseen = 1;
            }
            if (!snjseen) continue wsloop;
          }
      }
      safe_parse_sheet(zip, path, relsPath, props.SheetNames[i], i, sheetRels, sheets, stype, opts, wb, themes, styles);
    }
    out = {
      Directory: dir,
      Workbook: wb,
      Props: props,
      Custprops: custprops,
      Deps: deps,
      Sheets: sheets,
      SheetNames: props.SheetNames,
      Strings: strs,
      Styles: styles,
      Themes: themes,
      SSF: dup(table_fmt)
    };
    if (opts && opts.bookFiles) {
      if (zip.files) {
        out.keys = entries;
        out.files = zip.files;
      } else {
        out.keys = [];
        out.files = {};
        zip.FullPaths.forEach(function(p, idx) {
          p = p.replace(/^Root Entry[\/]/, "");
          out.keys.push(p);
          out.files[p] = zip.FileIndex[idx];
        });
      }
    }
    if (opts && opts.bookVBA) {
      if (dir.vba.length > 0) out.vbaraw = getzipdata(zip, strip_front_slash(dir.vba[0]), true);
      else if (dir.defaults && dir.defaults.bin === CT_VBA) out.vbaraw = getzipdata(zip, "xl/vbaProject.bin", true);
    }
    return out;
  }
  function parse_xlsxcfb(cfb, _opts) {
    var opts = _opts || {};
    var f = "Workbook", data = CFB.find(cfb, f);
    try {
      f = "/!DataSpaces/Version";
      data = CFB.find(cfb, f);
      if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
      parse_DataSpaceVersionInfo(data.content);
      f = "/!DataSpaces/DataSpaceMap";
      data = CFB.find(cfb, f);
      if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
      var dsm = parse_DataSpaceMap(data.content);
      if (dsm.length !== 1 || dsm[0].comps.length !== 1 || dsm[0].comps[0].t !== 0 || dsm[0].name !== "StrongEncryptionDataSpace" || dsm[0].comps[0].v !== "EncryptedPackage")
        throw new Error("ECMA-376 Encrypted file bad " + f);
      f = "/!DataSpaces/DataSpaceInfo/StrongEncryptionDataSpace";
      data = CFB.find(cfb, f);
      if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
      var seds = parse_DataSpaceDefinition(data.content);
      if (seds.length != 1 || seds[0] != "StrongEncryptionTransform")
        throw new Error("ECMA-376 Encrypted file bad " + f);
      f = "/!DataSpaces/TransformInfo/StrongEncryptionTransform/!Primary";
      data = CFB.find(cfb, f);
      if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
      parse_Primary(data.content);
    } catch (e) {
    }
    f = "/EncryptionInfo";
    data = CFB.find(cfb, f);
    if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
    var einfo = parse_EncryptionInfo(data.content);
    f = "/EncryptedPackage";
    data = CFB.find(cfb, f);
    if (!data || !data.content) throw new Error("ECMA-376 Encrypted file missing " + f);
    if (einfo[0] == 4 && typeof decrypt_agile !== "undefined") return decrypt_agile(einfo[1], data.content, opts.password || "", opts);
    if (einfo[0] == 2 && typeof decrypt_std76 !== "undefined") return decrypt_std76(einfo[1], data.content, opts.password || "", opts);
    throw new Error("File is password-protected");
  }
  function firstbyte(f, o) {
    var x = "";
    switch ((o || {}).type || "base64") {
      case "buffer":
        return [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]];
      case "base64":
        x = Base64_decode(f.slice(0, 12));
        break;
      case "binary":
        x = f;
        break;
      case "array":
        return [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7]];
      default:
        throw new Error("Unrecognized type " + (o && o.type || "undefined"));
    }
    return [x.charCodeAt(0), x.charCodeAt(1), x.charCodeAt(2), x.charCodeAt(3), x.charCodeAt(4), x.charCodeAt(5), x.charCodeAt(6), x.charCodeAt(7)];
  }
  function read_cfb(cfb, opts) {
    if (CFB.find(cfb, "EncryptedPackage")) return parse_xlsxcfb(cfb, opts);
    return parse_xlscfb(cfb, opts);
  }
  function read_zip(data, opts) {
    var zip, d = data;
    var o = opts || {};
    if (!o.type) o.type = has_buf && Buffer.isBuffer(data) ? "buffer" : "base64";
    zip = zip_read(d, o);
    return parse_zip(zip, o);
  }
  function read_plaintext(data, o) {
    var i = 0;
    main: while (i < data.length) switch (data.charCodeAt(i)) {
      case 10:
      case 13:
      case 32:
        ++i;
        break;
      case 60:
        return parse_xlml(data.slice(i), o);
      default:
        break main;
    }
    return PRN.to_workbook(data, o);
  }
  function read_plaintext_raw(data, o) {
    var str = "", bytes = firstbyte(data, o);
    switch (o.type) {
      case "base64":
        str = Base64_decode(data);
        break;
      case "binary":
        str = data;
        break;
      case "buffer":
        str = data.toString("binary");
        break;
      case "array":
        str = cc2str(data);
        break;
      default:
        throw new Error("Unrecognized type " + o.type);
    }
    if (bytes[0] == 239 && bytes[1] == 187 && bytes[2] == 191) str = utf8read(str);
    o.type = "binary";
    return read_plaintext(str, o);
  }
  function read_utf16(data, o) {
    var d = data;
    if (o.type == "base64") d = Base64_decode(d);
    d = $cptable.utils.decode(1200, d.slice(2), "str");
    o.type = "binary";
    return read_plaintext(d, o);
  }
  function bstrify(data) {
    return !data.match(/[^\x00-\x7F]/) ? data : utf8write(data);
  }
  function read_prn(data, d, o, str) {
    if (str) {
      o.type = "string";
      return PRN.to_workbook(data, o);
    }
    return PRN.to_workbook(d, o);
  }
  function readSync(data, opts) {
    reset_cp();
    var o = opts || {};
    if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) return readSync(new Uint8Array(data), (o = dup(o), o.type = "array", o));
    if (typeof Uint8Array !== "undefined" && data instanceof Uint8Array && !o.type) o.type = typeof Deno !== "undefined" ? "buffer" : "array";
    var d = data, n = [0, 0, 0, 0], str = false;
    if (o.cellStyles) {
      o.cellNF = true;
      o.sheetStubs = true;
    }
    _ssfopts = {};
    if (o.dateNF) _ssfopts.dateNF = o.dateNF;
    if (!o.type) o.type = has_buf && Buffer.isBuffer(data) ? "buffer" : "base64";
    if (o.type == "file") {
      o.type = has_buf ? "buffer" : "binary";
      d = read_binary(data);
      if (typeof Uint8Array !== "undefined" && !has_buf) o.type = "array";
    }
    if (o.type == "string") {
      str = true;
      o.type = "binary";
      o.codepage = 65001;
      d = bstrify(data);
    }
    if (o.type == "array" && typeof Uint8Array !== "undefined" && data instanceof Uint8Array && typeof ArrayBuffer !== "undefined") {
      var ab = new ArrayBuffer(3), vu = new Uint8Array(ab);
      vu.foo = "bar";
      if (!vu.foo) {
        o = dup(o);
        o.type = "array";
        return readSync(ab2a(d), o);
      }
    }
    switch ((n = firstbyte(d, o))[0]) {
      case 208:
        if (n[1] === 207 && n[2] === 17 && n[3] === 224 && n[4] === 161 && n[5] === 177 && n[6] === 26 && n[7] === 225) return read_cfb(CFB.read(d, o), o);
        break;
      case 9:
        if (n[1] <= 8) return parse_xlscfb(d, o);
        break;
      case 60:
        return parse_xlml(d, o);
      case 73:
        if (n[1] === 73 && n[2] === 42 && n[3] === 0) throw new Error("TIFF Image File is not a spreadsheet");
        if (n[1] === 68) return read_wb_ID(d, o);
        break;
      case 84:
        if (n[1] === 65 && n[2] === 66 && n[3] === 76) return DIF.to_workbook(d, o);
        break;
      case 80:
        return n[1] === 75 && n[2] < 9 && n[3] < 9 ? read_zip(d, o) : read_prn(data, d, o, str);
      case 239:
        return n[3] === 60 ? parse_xlml(d, o) : read_prn(data, d, o, str);
      case 255:
        if (n[1] === 254) {
          return read_utf16(d, o);
        } else if (n[1] === 0 && n[2] === 2 && n[3] === 0) return WK_.to_workbook(d, o);
        break;
      case 0:
        if (n[1] === 0) {
          if (n[2] >= 2 && n[3] === 0) return WK_.to_workbook(d, o);
          if (n[2] === 0 && (n[3] === 8 || n[3] === 9)) return WK_.to_workbook(d, o);
        }
        break;
      case 3:
      case 131:
      case 139:
      case 140:
        return DBF.to_workbook(d, o);
      case 123:
        if (n[1] === 92 && n[2] === 114 && n[3] === 116) return RTF.to_workbook(d, o);
        break;
      case 10:
      case 13:
      case 32:
        return read_plaintext_raw(d, o);
      case 137:
        if (n[1] === 80 && n[2] === 78 && n[3] === 71) throw new Error("PNG Image File is not a spreadsheet");
        break;
    }
    if (DBF_SUPPORTED_VERSIONS.indexOf(n[0]) > -1 && n[2] <= 12 && n[3] <= 31) return DBF.to_workbook(d, o);
    return read_prn(data, d, o, str);
  }
  function make_json_row(sheet, r, R, cols, header, hdr, dense, o) {
    var rr = encode_row(R);
    var defval = o.defval, raw = o.raw || !Object.prototype.hasOwnProperty.call(o, "raw");
    var isempty = true;
    var row = header === 1 ? [] : {};
    if (header !== 1) {
      if (Object.defineProperty) try {
        Object.defineProperty(row, "__rowNum__", { value: R, enumerable: false });
      } catch (e) {
        row.__rowNum__ = R;
      }
      else row.__rowNum__ = R;
    }
    if (!dense || sheet[R]) for (var C = r.s.c; C <= r.e.c; ++C) {
      var val = dense ? sheet[R][C] : sheet[cols[C] + rr];
      if (val === void 0 || val.t === void 0) {
        if (defval === void 0) continue;
        if (hdr[C] != null) {
          row[hdr[C]] = defval;
        }
        continue;
      }
      var v = val.v;
      switch (val.t) {
        case "z":
          if (v == null) break;
          continue;
        case "e":
          v = v == 0 ? null : void 0;
          break;
        case "s":
        case "d":
        case "b":
        case "n":
          break;
        default:
          throw new Error("unrecognized type " + val.t);
      }
      if (hdr[C] != null) {
        if (v == null) {
          if (val.t == "e" && v === null) row[hdr[C]] = null;
          else if (defval !== void 0) row[hdr[C]] = defval;
          else if (raw && v === null) row[hdr[C]] = null;
          else continue;
        } else {
          row[hdr[C]] = raw && (val.t !== "n" || val.t === "n" && o.rawNumbers !== false) ? v : format_cell(val, v, o);
        }
        if (v != null) isempty = false;
      }
    }
    return { row, isempty };
  }
  function sheet_to_json(sheet, opts) {
    if (sheet == null || sheet["!ref"] == null) return [];
    var val = { t: "n", v: 0 }, header = 0, offset = 1, hdr = [], v = 0, vv = "";
    var r = { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
    var o = opts || {};
    var range = o.range != null ? o.range : sheet["!ref"];
    if (o.header === 1) header = 1;
    else if (o.header === "A") header = 2;
    else if (Array.isArray(o.header)) header = 3;
    else if (o.header == null) header = 0;
    switch (typeof range) {
      case "string":
        r = safe_decode_range(range);
        break;
      case "number":
        r = safe_decode_range(sheet["!ref"]);
        r.s.r = range;
        break;
      default:
        r = range;
    }
    if (header > 0) offset = 0;
    var rr = encode_row(r.s.r);
    var cols = [];
    var out = [];
    var outi = 0, counter = 0;
    var dense = Array.isArray(sheet);
    var R = r.s.r, C = 0;
    var header_cnt = {};
    if (dense && !sheet[R]) sheet[R] = [];
    var colinfo = o.skipHidden && sheet["!cols"] || [];
    var rowinfo = o.skipHidden && sheet["!rows"] || [];
    for (C = r.s.c; C <= r.e.c; ++C) {
      if ((colinfo[C] || {}).hidden) continue;
      cols[C] = encode_col(C);
      val = dense ? sheet[R][C] : sheet[cols[C] + rr];
      switch (header) {
        case 1:
          hdr[C] = C - r.s.c;
          break;
        case 2:
          hdr[C] = cols[C];
          break;
        case 3:
          hdr[C] = o.header[C - r.s.c];
          break;
        default:
          if (val == null) val = { w: "__EMPTY", t: "s" };
          vv = v = format_cell(val, null, o);
          counter = header_cnt[v] || 0;
          if (!counter) header_cnt[v] = 1;
          else {
            do {
              vv = v + "_" + counter++;
            } while (header_cnt[vv]);
            header_cnt[v] = counter;
            header_cnt[vv] = 1;
          }
          hdr[C] = vv;
      }
    }
    for (R = r.s.r + offset; R <= r.e.r; ++R) {
      if ((rowinfo[R] || {}).hidden) continue;
      var row = make_json_row(sheet, r, R, cols, header, hdr, dense, o);
      if (row.isempty === false || (header === 1 ? o.blankrows !== false : !!o.blankrows)) out[outi++] = row.row;
    }
    out.length = outi;
    return out;
  }
  var qreg = /"/g;
  function make_csv_row(sheet, r, R, cols, fs, rs, FS, o) {
    var isempty = true;
    var row = [], txt = "", rr = encode_row(R);
    for (var C = r.s.c; C <= r.e.c; ++C) {
      if (!cols[C]) continue;
      var val = o.dense ? (sheet[R] || [])[C] : sheet[cols[C] + rr];
      if (val == null) txt = "";
      else if (val.v != null) {
        isempty = false;
        txt = "" + (o.rawNumbers && val.t == "n" ? val.v : format_cell(val, null, o));
        for (var i = 0, cc = 0; i !== txt.length; ++i) if ((cc = txt.charCodeAt(i)) === fs || cc === rs || cc === 34 || o.forceQuotes) {
          txt = '"' + txt.replace(qreg, '""') + '"';
          break;
        }
        if (txt == "ID") txt = '"ID"';
      } else if (val.f != null && !val.F) {
        isempty = false;
        txt = "=" + val.f;
        if (txt.indexOf(",") >= 0) txt = '"' + txt.replace(qreg, '""') + '"';
      } else txt = "";
      row.push(txt);
    }
    if (o.blankrows === false && isempty) return null;
    return row.join(FS);
  }
  function sheet_to_csv(sheet, opts) {
    var out = [];
    var o = opts == null ? {} : opts;
    if (sheet == null || sheet["!ref"] == null) return "";
    var r = safe_decode_range(sheet["!ref"]);
    var FS = o.FS !== void 0 ? o.FS : ",", fs = FS.charCodeAt(0);
    var RS = o.RS !== void 0 ? o.RS : "\n", rs = RS.charCodeAt(0);
    var endregex = new RegExp((FS == "|" ? "\\|" : FS) + "+$");
    var row = "", cols = [];
    o.dense = Array.isArray(sheet);
    var colinfo = o.skipHidden && sheet["!cols"] || [];
    var rowinfo = o.skipHidden && sheet["!rows"] || [];
    for (var C = r.s.c; C <= r.e.c; ++C) if (!(colinfo[C] || {}).hidden) cols[C] = encode_col(C);
    var w = 0;
    for (var R = r.s.r; R <= r.e.r; ++R) {
      if ((rowinfo[R] || {}).hidden) continue;
      row = make_csv_row(sheet, r, R, cols, fs, rs, FS, o);
      if (row == null) {
        continue;
      }
      if (o.strip) row = row.replace(endregex, "");
      if (row || o.blankrows !== false) out.push((w++ ? RS : "") + row);
    }
    delete o.dense;
    return out.join("");
  }
  function sheet_to_txt(sheet, opts) {
    if (!opts) opts = {};
    opts.FS = "	";
    opts.RS = "\n";
    var s = sheet_to_csv(sheet, opts);
    if (typeof $cptable == "undefined" || opts.type == "string") return s;
    var o = $cptable.utils.encode(1200, s, "str");
    return String.fromCharCode(255) + String.fromCharCode(254) + o;
  }
  function sheet_to_formulae(sheet) {
    var y = "", x, val = "";
    if (sheet == null || sheet["!ref"] == null) return [];
    var r = safe_decode_range(sheet["!ref"]), rr = "", cols = [], C;
    var cmds = [];
    var dense = Array.isArray(sheet);
    for (C = r.s.c; C <= r.e.c; ++C) cols[C] = encode_col(C);
    for (var R = r.s.r; R <= r.e.r; ++R) {
      rr = encode_row(R);
      for (C = r.s.c; C <= r.e.c; ++C) {
        y = cols[C] + rr;
        x = dense ? (sheet[R] || [])[C] : sheet[y];
        val = "";
        if (x === void 0) continue;
        else if (x.F != null) {
          y = x.F;
          if (!x.f) continue;
          val = x.f;
          if (y.indexOf(":") == -1) y = y + ":" + y;
        }
        if (x.f != null) val = x.f;
        else if (x.t == "z") continue;
        else if (x.t == "n" && x.v != null) val = "" + x.v;
        else if (x.t == "b") val = x.v ? "TRUE" : "FALSE";
        else if (x.w !== void 0) val = "'" + x.w;
        else if (x.v === void 0) continue;
        else if (x.t == "s") val = "'" + x.v;
        else val = "" + x.v;
        cmds[cmds.length] = y + "=" + val;
      }
    }
    return cmds;
  }
  function sheet_add_json(_ws, js, opts) {
    var o = opts || {};
    var offset = +!o.skipHeader;
    var ws = _ws || {};
    var _R = 0, _C = 0;
    if (ws && o.origin != null) {
      if (typeof o.origin == "number") _R = o.origin;
      else {
        var _origin = typeof o.origin == "string" ? decode_cell(o.origin) : o.origin;
        _R = _origin.r;
        _C = _origin.c;
      }
    }
    var cell;
    var range = { s: { c: 0, r: 0 }, e: { c: _C, r: _R + js.length - 1 + offset } };
    if (ws["!ref"]) {
      var _range = safe_decode_range(ws["!ref"]);
      range.e.c = Math.max(range.e.c, _range.e.c);
      range.e.r = Math.max(range.e.r, _range.e.r);
      if (_R == -1) {
        _R = _range.e.r + 1;
        range.e.r = _R + js.length - 1 + offset;
      }
    } else {
      if (_R == -1) {
        _R = 0;
        range.e.r = js.length - 1 + offset;
      }
    }
    var hdr = o.header || [], C = 0;
    js.forEach(function(JS, R) {
      keys(JS).forEach(function(k) {
        if ((C = hdr.indexOf(k)) == -1) hdr[C = hdr.length] = k;
        var v = JS[k];
        var t = "z";
        var z = "";
        var ref = encode_cell({ c: _C + C, r: _R + R + offset });
        cell = ws_get_cell_stub(ws, ref);
        if (v && typeof v === "object" && !(v instanceof Date)) {
          ws[ref] = v;
        } else {
          if (typeof v == "number") t = "n";
          else if (typeof v == "boolean") t = "b";
          else if (typeof v == "string") t = "s";
          else if (v instanceof Date) {
            t = "d";
            if (!o.cellDates) {
              t = "n";
              v = datenum(v);
            }
            z = o.dateNF || table_fmt[14];
          } else if (v === null && o.nullError) {
            t = "e";
            v = 0;
          }
          if (!cell) ws[ref] = cell = { t, v };
          else {
            cell.t = t;
            cell.v = v;
            delete cell.w;
            delete cell.R;
            if (z) cell.z = z;
          }
          if (z) cell.z = z;
        }
      });
    });
    range.e.c = Math.max(range.e.c, _C + hdr.length - 1);
    var __R = encode_row(_R);
    if (offset) for (C = 0; C < hdr.length; ++C) ws[encode_col(C + _C) + __R] = { t: "s", v: hdr[C] };
    ws["!ref"] = encode_range(range);
    return ws;
  }
  function json_to_sheet(js, opts) {
    return sheet_add_json(null, js, opts);
  }
  function ws_get_cell_stub(ws, R, C) {
    if (typeof R == "string") {
      if (Array.isArray(ws)) {
        var RC = decode_cell(R);
        if (!ws[RC.r]) ws[RC.r] = [];
        return ws[RC.r][RC.c] || (ws[RC.r][RC.c] = { t: "z" });
      }
      return ws[R] || (ws[R] = { t: "z" });
    }
    if (typeof R != "number") return ws_get_cell_stub(ws, encode_cell(R));
    return ws_get_cell_stub(ws, encode_cell({ r: R, c: C || 0 }));
  }
  function wb_sheet_idx(wb, sh) {
    if (typeof sh == "number") {
      if (sh >= 0 && wb.SheetNames.length > sh) return sh;
      throw new Error("Cannot find sheet # " + sh);
    } else if (typeof sh == "string") {
      var idx = wb.SheetNames.indexOf(sh);
      if (idx > -1) return idx;
      throw new Error("Cannot find sheet name |" + sh + "|");
    } else throw new Error("Cannot find sheet |" + sh + "|");
  }
  function book_new() {
    return { SheetNames: [], Sheets: {} };
  }
  function book_append_sheet(wb, ws, name, roll) {
    var i = 1;
    if (!name) {
      for (; i <= 65535; ++i, name = void 0) if (wb.SheetNames.indexOf(name = "Sheet" + i) == -1) break;
    }
    if (!name || wb.SheetNames.length >= 65535) throw new Error("Too many worksheets");
    if (roll && wb.SheetNames.indexOf(name) >= 0) {
      var m = name.match(/(^.*?)(\d+)$/);
      i = m && +m[2] || 0;
      var root = m && m[1] || name;
      for (++i; i <= 65535; ++i) if (wb.SheetNames.indexOf(name = root + i) == -1) break;
    }
    check_ws_name(name);
    if (wb.SheetNames.indexOf(name) >= 0) throw new Error("Worksheet with name |" + name + "| already exists!");
    wb.SheetNames.push(name);
    wb.Sheets[name] = ws;
    return name;
  }
  function book_set_sheet_visibility(wb, sh, vis) {
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [];
    var idx = wb_sheet_idx(wb, sh);
    if (!wb.Workbook.Sheets[idx]) wb.Workbook.Sheets[idx] = {};
    switch (vis) {
      case 0:
      case 1:
      case 2:
        break;
      default:
        throw new Error("Bad sheet visibility setting " + vis);
    }
    wb.Workbook.Sheets[idx].Hidden = vis;
  }
  function cell_set_number_format(cell, fmt) {
    cell.z = fmt;
    return cell;
  }
  function cell_set_hyperlink(cell, target, tooltip) {
    if (!target) {
      delete cell.l;
    } else {
      cell.l = { Target: target };
      if (tooltip) cell.l.Tooltip = tooltip;
    }
    return cell;
  }
  function cell_set_internal_link(cell, range, tooltip) {
    return cell_set_hyperlink(cell, "#" + range, tooltip);
  }
  function cell_add_comment(cell, text, author) {
    if (!cell.c) cell.c = [];
    cell.c.push({ t: text, a: author || "SheetJS" });
  }
  function sheet_set_array_formula(ws, range, formula, dynamic) {
    var rng = typeof range != "string" ? range : safe_decode_range(range);
    var rngstr = typeof range == "string" ? range : encode_range(range);
    for (var R = rng.s.r; R <= rng.e.r; ++R) for (var C = rng.s.c; C <= rng.e.c; ++C) {
      var cell = ws_get_cell_stub(ws, R, C);
      cell.t = "n";
      cell.F = rngstr;
      delete cell.v;
      if (R == rng.s.r && C == rng.s.c) {
        cell.f = formula;
        if (dynamic) cell.D = true;
      }
    }
    return ws;
  }
  var utils = {
    encode_col,
    encode_row,
    encode_cell,
    encode_range,
    decode_col,
    decode_row,
    split_cell,
    decode_cell,
    decode_range,
    format_cell,
    sheet_add_aoa,
    sheet_add_json,
    sheet_add_dom,
    aoa_to_sheet,
    json_to_sheet,
    table_to_sheet: parse_dom_table,
    table_to_book,
    sheet_to_csv,
    sheet_to_txt,
    sheet_to_json,
    sheet_to_html,
    sheet_to_formulae,
    sheet_to_row_object_array: sheet_to_json,
    sheet_get_cell: ws_get_cell_stub,
    book_new,
    book_append_sheet,
    book_set_sheet_visibility,
    cell_set_number_format,
    cell_set_hyperlink,
    cell_set_internal_link,
    cell_add_comment,
    sheet_set_array_formula,
    consts: {
      SHEET_VISIBLE: 0,
      SHEET_HIDDEN: 1,
      SHEET_VERY_HIDDEN: 2
    }
  };
  var version = XLSX.version;

  // src/inject/excel-loader.js
  var _contacts = [];
  var _fileName = null;
  var _loadError = null;
  var PHONE_HINTS = ["telefono", "tel\xE9fono", "celular", "cel", "phone", "n\xFAmero", "numero", "movil", "m\xF3vil", "whatsapp", "wa", "nro", "tel"];
  var NAME_HINTS = ["nombre", "name", "nombres", "contacto", "persona", "nombres y apellidos", "nombre completo", "nombre_completo"];
  function _normalizeHeader(h) {
    return String(h || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function _detectColumn(headers, hints) {
    const normalized = headers.map(_normalizeHeader);
    for (const hint of hints) {
      const idx = normalized.indexOf(hint);
      if (idx !== -1) return idx;
    }
    for (const hint of hints) {
      const idx = normalized.findIndex((h) => h.includes(hint));
      if (idx !== -1) return idx;
    }
    return -1;
  }
  function _normalizePhone(raw) {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, "");
    if (!digits || digits.length < 9) return null;
    if (digits.length >= 11 && digits.startsWith("51")) {
      digits = digits.slice(2);
    }
    return digits;
  }
  function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      _contacts = [];
      _fileName = null;
      _loadError = null;
      if (!file) {
        _loadError = "No se seleccion\xF3 archivo";
        reject(_loadError);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        _loadError = "Error al leer el archivo";
        reject(_loadError);
      };
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = readSync(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            _loadError = "El archivo no tiene hojas";
            reject(_loadError);
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          const rows = utils.sheet_to_json(sheet, { header: 1, defval: "" });
          if (rows.length < 2) {
            _loadError = "El archivo est\xE1 vac\xEDo o solo tiene headers";
            reject(_loadError);
            return;
          }
          const headers = rows[0].map((h) => String(h || ""));
          const phoneCol = _detectColumn(headers, PHONE_HINTS);
          const nameCol = _detectColumn(headers, NAME_HINTS);
          if (phoneCol === -1) {
            _loadError = "No se encontr\xF3 columna de tel\xE9fono. Headers: " + headers.join(", ");
            reject(_loadError);
            return;
          }
          const contacts = [];
          const seenPhones = /* @__PURE__ */ new Set();
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rawPhone = row[phoneCol];
            const phone2 = _normalizePhone(rawPhone);
            if (!phone2) continue;
            if (seenPhones.has(phone2)) continue;
            seenPhones.add(phone2);
            const rawName = nameCol !== -1 ? String(row[nameCol] || "").trim() : "";
            contacts.push({
              id: `xl_${i}_${phone2}`,
              // synthetic ID
              nombre: rawName || "",
              apellidos: "",
              telefono: phone2,
              departamento: "",
              distrito: "",
              encuestador: "",
              cms_status: "nuevo",
              heat_score: 1
            });
          }
          if (!contacts.length) {
            _loadError = "No se encontraron tel\xE9fonos v\xE1lidos en el archivo";
            reject(_loadError);
            return;
          }
          _contacts = contacts;
          _fileName = file.name;
          _loadError = null;
          console.log(`[EXCEL] Cargados ${contacts.length} contactos de "${file.name}" (phone col=${phoneCol}, name col=${nameCol})`);
          resolve({ contacts, fileName: file.name, phoneCol: headers[phoneCol], nameCol: nameCol !== -1 ? headers[nameCol] : null });
        } catch (err) {
          _loadError = "Error parseando archivo: " + err.message;
          console.error("[EXCEL] Parse error:", err);
          reject(_loadError);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  function getExcelFileName() {
    return _fileName;
  }
  function getExcelError() {
    return _loadError;
  }
  function clearExcelContacts() {
    _contacts = [];
    _fileName = null;
    _loadError = null;
  }

  // src/inject/blast-panel.js
  var CFG_KEY = "wspp_blast_cfg_v8";
  var TPL_KEY = "wspp_blast_tpls_v6";
  var DEFAULTS = {
    batchSize: 10,
    // cuántos contactos pedir por fetch al backend
    brigadista: "",
    burstSize: 12,
    // cuántos msgs antes de descanso obligatorio
    burstRestSec: 90
    // descanso entre bursts (segundos)
  };
  function _loadCfg() {
    try {
      const r = localStorage.getItem(CFG_KEY);
      return r ? { ...DEFAULTS, ...JSON.parse(r) } : { ...DEFAULTS };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }
  function _saveCfg(c) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(c));
    } catch (_) {
    }
  }
  var cfg = _loadCfg();
  var DEFAULT_TPL = "{{nombre}}, [buenas tardes|buen d\xEDa|buenas]. Te saluda C\xE9sar V\xE1squez, candidato al Senado Nacional.\n---\n[Nos llegaron tus datos a trav\xE9s de|Tus datos nos llegaron por medio de|Tu contacto nos lleg\xF3 gracias a] mi equipo de campa\xF1a en {{departamento}}, por medio de {{brigadista}}.";
  var DEFAULT_TPL2 = "[Buenas tardes|Buen d\xEDa|Buenas] {{nombre}}. Soy C\xE9sar V\xE1squez, candidato al Senado Nacional #3 \u{1F1F5}\u{1F1EA}\n---\n[Tu n\xFAmero me lleg\xF3 a trav\xE9s de|Me contact\xF3 de tu parte|Tus datos nos llegaron por] {{brigadista}}, de [nuestro equipo en|mi equipo de campa\xF1a en] {{departamento}}.";
  var DEFAULT_TPL3 = "{{nombre}}, [buenas tardes|buen d\xEDa|buenas]. Soy C\xE9sar V\xE1squez, candidato al Senado Nacional. [Nos llegaron tus datos gracias a|Tu contacto nos lleg\xF3 por medio de] {{brigadista}} de mi equipo en {{departamento}}.";
  var DEFAULT_TPL4 = "[Hola|Buenas|Buenas tardes] {{nombre}}, \xBF[c\xF3mo est\xE1s?|todo bien?|c\xF3mo te va?]\n---\nTe [saluda|escribe|habla] C\xE9sar V\xE1squez, candidato al Senado Nacional #3. [Tu n\xFAmero me lleg\xF3 gracias a|Tus datos me los comparti\xF3] {{brigadista}} de {{departamento}}.";
  function _loadTpls() {
    try {
      const r = localStorage.getItem(TPL_KEY);
      if (r) {
        const p = JSON.parse(r);
        if (p.length) return p;
      }
    } catch (_) {
    }
    return [DEFAULT_TPL, DEFAULT_TPL2, DEFAULT_TPL3, DEFAULT_TPL4];
  }
  function _saveTpls(t) {
    try {
      localStorage.setItem(TPL_KEY, JSON.stringify(t));
    } catch (_) {
    }
  }
  var tpls = _loadTpls();
  var _running = false;
  var _countdown = 0;
  var _countdownTimer = null;
  var _onUpdate = null;
  var _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
  var _lastResults = [];
  var _trackedMsgs = [];
  var _tplIndex = 0;
  var _totalPending = null;
  var _blastLimit = 0;
  var _sessionSent = 0;
  var LS_HISTORY_KEY = "wspp_blast_history_v1";
  var LS_SENT_KEY = "wspp_blast_sent_v1";
  var LS_SENT_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
  var _sentPhones = /* @__PURE__ */ new Set();
  var _sentIds = /* @__PURE__ */ new Set();
  var _historyPhones = /* @__PURE__ */ new Set();
  var _historyFilteredCount = 0;
  function _loadHistory() {
    try {
      const raw = localStorage.getItem(LS_HISTORY_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.savedAt && Date.now() - data.savedAt > LS_SENT_TTL_MS) {
        localStorage.removeItem(LS_HISTORY_KEY);
        return;
      }
      if (Array.isArray(data.phones)) {
        _historyPhones = new Set(data.phones);
        console.log(`[BLAST] Historial cargado: ${_historyPhones.size} tel\xE9fonos enviados previamente`);
      }
    } catch (_) {
    }
  }
  function _saveHistory() {
    try {
      for (const p of _sentPhones) _historyPhones.add(p);
      const all = [..._historyPhones];
      const phones = all.length > 2e4 ? all.slice(-2e4) : all;
      localStorage.setItem(LS_HISTORY_KEY, JSON.stringify({
        phones,
        savedAt: Date.now(),
        count: phones.length
      }));
    } catch (_) {
    }
  }
  _loadHistory();
  var _excelContacts = [];
  var _excelCursor = 0;
  var _currentSessionId = null;
  var _hasSentThisSession = false;
  function _saveSentToStorage() {
    if (!_hasSentThisSession) return;
    _saveHistory();
  }
  var _inFlight = /* @__PURE__ */ new Set();
  var _ackInterval = null;
  function _startAckTracking() {
    if (_ackInterval) return;
    _ackInterval = setInterval(_pollAcks, 5e3);
  }
  function _stopAckTracking() {
    if (_ackInterval) {
      clearInterval(_ackInterval);
      _ackInterval = null;
    }
    for (const entry of _trackedMsgs) entry.msgModel = null;
    _trackedMsgs = [];
  }
  function _pollAcks() {
    let changed = false;
    const now = Date.now();
    for (const entry of _trackedMsgs) {
      if (!entry.msgModel) continue;
      const ack = typeof entry.msgModel.get === "function" ? entry.msgModel.get("ack") : entry.msgModel.ack;
      const newAck = Number(ack) || 0;
      if (newAck !== entry.lastAck) {
        entry.lastAck = newAck;
        const result = _lastResults.find((r) => r.telefono === entry.telefono && r.status !== "failed");
        if (result) result.ack = newAck;
        changed = true;
      }
      if (newAck >= 2) entry.msgModel = null;
    }
    _trackedMsgs = _trackedMsgs.filter((e) => {
      if (!e.msgModel && e.lastAck >= 2 && now - e.ts > 3e4) return false;
      if (now - e.ts > 3e5) {
        e.msgModel = null;
        return false;
      }
      return true;
    });
    if (!_trackedMsgs.length) _stopAckTracking();
    if (changed) _notify();
  }
  function _trackMessage(msgModel, telefono) {
    const ack = typeof msgModel.get === "function" ? msgModel.get("ack") : msgModel.ack || 0;
    _trackedMsgs.push({ msgModel, telefono, lastAck: Number(ack) || 0, ts: Date.now() });
    _startAckTracking();
  }
  function _notify() {
    if (_onUpdate) _onUpdate();
  }
  var SALUDOS = ["Hola", "Buenas", "Buenos d\xEDas", "Hola buen d\xEDa", "Qu\xE9 tal", "Buenas tardes"];
  var CIERRES = ["Gracias!", "Saludos!", "Un abrazo!", "Hasta pronto!", "\xC9xitos!"];
  var EMOJIS = ["\u{1F44B}", "\u{1F64C}", "\u2705", "\u{1F60A}", "\u{1F31F}", "\u{1F4AC}"];
  function _hashSeed(str, offset) {
    let h = offset * 2654435761;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 2246822519);
      h ^= h >>> 13;
    }
    return Math.abs(h);
  }
  function _spinVariants(text, seed) {
    let counter = 0;
    return text.replace(/\[([^\]]+)\]/g, (_, inner) => {
      const opts = inner.split("|");
      const pick = opts[_hashSeed(String(seed + counter), counter) % opts.length];
      counter++;
      return pick;
    });
  }
  function _toTitleCase(word) {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  function _titleCasePhrase(phrase) {
    if (!phrase) return "";
    return phrase.split(/\s+/).map(_toTitleCase).join(" ");
  }
  function _v(name) {
    return new RegExp(`\\{\\{${name}\\}{1,2}`, "gi");
  }
  function _applyVars(text, c, seed) {
    const rawNombre = ((c.nombre || "") + " " + (c.apellidos || "")).trim().split(/\s+/)[0] || "amigo";
    const nombre = _toTitleCase(rawNombre);
    const rawBrigadista = (c.encuestador || "").trim();
    const brigadista = _toTitleCase(rawBrigadista.split(/\s+/)[0] || "un colaborador");
    const now = /* @__PURE__ */ new Date();
    return text.replace(_v("nombre"), nombre).replace(_v("brigadista"), brigadista).replace(_v("departamento"), _titleCasePhrase((c.departamento || c.distrito || "").trim()) || "tu zona").replace(_v("saludo"), SALUDOS[_hashSeed(String(seed), 1) % SALUDOS.length]).replace(_v("cierre"), CIERRES[_hashSeed(String(seed), 2) % CIERRES.length]).replace(_v("emoji"), EMOJIS[_hashSeed(String(seed), 3) % EMOJIS.length]).replace(_v("distrito"), c.distrito || "").replace(_v("fecha"), now.toLocaleDateString("es-PE")).replace(_v("hora"), now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
  }
  function _spinMessage(tpl, c, idx) {
    const seed = idx * 137 + (c.id ? c.id.charCodeAt(0) : 0);
    const parts = tpl.split(/^[ \t]*---[ \t]*$/m);
    return parts.map((part) => {
      const spun = _spinVariants(part.trim(), seed);
      const resolved = _applyVars(spun, c, seed);
      return resolved.trim();
    }).filter((p) => p.length > 0);
  }
  function _req(...names) {
    for (const n of names) {
      try {
        const m = window.require(n);
        if (m) return m;
      } catch (_) {
      }
    }
    throw new Error("WA module: " + names.join("/"));
  }
  function _normalizePhone2(tel) {
    const d = String(tel).replace(/\D/g, "");
    if (!d) return null;
    return d.length === 9 ? "51" + d : d;
  }
  async function _checkExistsOnWA(normalizedPhone) {
    try {
      const usyncMod = _req("WAWebUsync", "WAWebUsyncQuery", "WAWebUSyncModule");
      const userMod = _req("WAWebUsyncUser", "WAWebUSyncUserUtils", "WAWebUSyncUser");
      const USyncQuery = usyncMod?.USyncQuery || usyncMod?.default?.USyncQuery || usyncMod;
      const USyncUser = userMod?.USyncUser || userMod?.default?.USyncUser || userMod;
      if (!USyncQuery || !USyncUser) return null;
      const query = new USyncQuery().withContext("interactive").withContactProtocol().withUser(new USyncUser().withPhone(normalizedPhone));
      const response = await query.execute();
      const type = response?.list?.[0]?.contact?.type;
      if (!type) return null;
      return type === "in";
    } catch (_) {
      return null;
    }
  }
  async function _simulateTyping(chat, text) {
    try {
      const csb = _req("WAWebChatStateBridge");
      if (csb.sendChatStateComposing) {
        await csb.sendChatStateComposing(chat.id);
        const charMs = 40 + Math.random() * 40;
        const baseMs = text.length * charMs;
        const jitter = baseMs * (0.7 + Math.random() * 0.6);
        const thinkPause = Math.random() < 0.3 ? _humanRandom(500, 2e3) : 0;
        const typingMs = Math.max(1200, Math.min(12e3, jitter + thinkPause));
        await _sleep(typingMs);
        if (csb.sendChatStatePaused) await csb.sendChatStatePaused(chat.id);
      }
    } catch (_) {
    }
  }
  async function _sendToChat(chat, text) {
    await _simulateTyping(chat, text);
    const meMod = _req("WAWebUserPrefsMeUser");
    const meUser = (meMod.getMaybeMePnUser ?? meMod.getMeUser).call(meMod);
    const MsgKey = _req("WAWebMsgKey");
    const { unproxy } = _req("WAWebStateUtils");
    const { MsgCollection } = _req("WAWebMsgCollection");
    const idStr = await MsgKey.newId();
    const key = MsgKey.from({ fromMe: true, remote: chat.id, id: idStr });
    let eph = {};
    try {
      const em = _req("WAWebGetEphemeralFieldsMsgActionsUtils", "WAWebEphemeralFields", "WAWebEphemeralUtils");
      const fn = em.getEphemeralFields ?? em.default?.getEphemeralFields;
      if (fn) eph = fn(chat);
    } catch (_) {
    }
    let capturedModel = null;
    const onAdd = (msg) => {
      if (msg.get?.("id")?.id === idStr && msg.get?.("id")?.fromMe) {
        capturedModel = msg;
        MsgCollection.off("add", onAdd);
      }
    };
    MsgCollection.on("add", onAdd);
    try {
      const [p0] = _req("WAWebSendMsgChatAction").addAndSendMsgToChat(unproxy(chat), {
        ...eph,
        id: key,
        type: "chat",
        body: text,
        from: meUser,
        to: chat.id,
        local: true,
        self: "out",
        t: Math.floor(Date.now() / 1e3),
        isNewMsg: true
      });
      await p0;
    } finally {
      MsgCollection.off("add", onAdd);
    }
    if (!capturedModel) {
      const models = MsgCollection.models || MsgCollection._models || [];
      try {
        capturedModel = (Array.isArray(models) ? models : Array.from(models)).find(
          (m) => m.get?.("id")?.id === idStr && m.get?.("id")?.fromMe
        ) || null;
      } catch (_) {
        capturedModel = null;
      }
    }
    if (!capturedModel) {
      await new Promise((r) => setTimeout(r, 500));
      const models2 = MsgCollection.models || MsgCollection._models || [];
      try {
        capturedModel = (Array.isArray(models2) ? models2 : Array.from(models2)).find(
          (m) => m.get?.("id")?.id === idStr && m.get?.("id")?.fromMe
        ) || null;
      } catch (_) {
      }
    }
    return capturedModel;
  }
  function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function _startCountdown(sec, phase) {
    _countdown = sec;
    clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
      _countdown = Math.max(0, _countdown - 1);
      const timerEl = document.getElementById("sb-timer-label");
      if (timerEl) {
        timerEl.textContent = `\u23F1\uFE0F ${_countdown}s`;
      } else {
        _notify();
      }
      if (_countdown <= 0) clearInterval(_countdownTimer);
    }, 1e3);
  }
  function _stopCountdown() {
    clearInterval(_countdownTimer);
    _countdown = 0;
  }
  var _preClaimedIds = /* @__PURE__ */ new Set();
  function _fetchBatch(limit) {
    const result = [];
    while (result.length < limit && _excelCursor < _excelContacts.length) {
      const c = _excelContacts[_excelCursor++];
      const np = _normalizePhone2(c.telefono);
      if (c.id && _sentIds.has(c.id)) continue;
      if (np && _sentPhones.has(np)) continue;
      result.push(c);
    }
    _totalPending = Math.max(0, _excelContacts.length - _excelCursor);
    console.log(`[BLAST FETCH] Excel batch: ${result.length} contactos, cursor=${_excelCursor}/${_excelContacts.length}, pending=${_totalPending}`);
    return Promise.resolve(result);
  }
  var LS_RETRY_KEY = "wspp_blast_retry_hablado";
  async function _markHablado(ids, no_wa_ids) {
    for (const id of ids) _sentIds.add(id);
    console.log(`[BLAST] markHablado local: ${ids.length} hablado, ${(no_wa_ids || []).length} no_wa`);
    return true;
  }
  function _reportSkips(skips) {
    if (!skips.length) return;
    window.postMessage({
      type: "BLAST_REPORT_SKIPS",
      skips: skips.map((s) => ({
        contact_id: s.contact_id ?? null,
        phone: getOwnNumber() || "",
        contact_phone: s.contact_phone,
        contact_name: s.contact_name ?? null,
        reason: s.reason
      })),
      own_number: getOwnNumber()
    }, WA_ORIGIN);
  }
  var _lastHealth = null;
  function _fetchHealth() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve(null);
      }, 8e3);
      function onReply(e) {
        if (e.source !== window || e.data?.type !== "BLAST_NUMBER_HEALTH_READY") return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        _lastHealth = e.data;
        resolve(e.data);
      }
      window.addEventListener("message", onReply);
      window.postMessage({
        type: "BLAST_GET_NUMBER_HEALTH",
        own_number: getOwnNumber()
      }, WA_ORIGIN);
    });
  }
  function _isWithinSendWindow() {
    const now = /* @__PURE__ */ new Date();
    const peruHour = new Date(now.toLocaleString("en-US", { timeZone: "America/Lima" })).getHours();
    return peruHour >= 8 && peruHour < 21;
  }
  function _humanRandom(min, max) {
    const r = (Math.random() + Math.random() + Math.random()) / 3;
    return min + Math.floor(r * (max - min));
  }
  function _adaptiveDelay() {
    const risk = _lastHealth?.risk_level || "low";
    switch (risk) {
      case "critical":
        return _humanRandom(25e3, 45e3);
      // 25-45s
      case "high":
        return _humanRandom(12e3, 25e3);
      // 12-25s
      case "medium":
        return _humanRandom(8e3, 15e3);
      // 8-15s
      default:
        return _humanRandom(4e3, 1e4);
    }
  }
  var _remoteConfig = null;
  var _remoteConfigLoadedAt = 0;
  var REMOTE_CONFIG_TTL = 10 * 60 * 1e3;
  function _fetchRemoteConfig() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve(null);
      }, 5e3);
      function onReply(e) {
        if (e.source !== window || e.data?.type !== "BLAST_NUMBER_CONFIG_READY") return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        resolve(e.data.config || null);
      }
      window.addEventListener("message", onReply);
      window.postMessage({
        type: "BLAST_GET_NUMBER_CONFIG",
        own_number: getOwnNumber()
      }, WA_ORIGIN);
    });
  }
  async function _loadRemoteConfig() {
    if (_remoteConfig && Date.now() - _remoteConfigLoadedAt < REMOTE_CONFIG_TTL) return;
    const rc = await _fetchRemoteConfig();
    if (rc) {
      _remoteConfig = rc;
      _remoteConfigLoadedAt = Date.now();
      if (rc.burst_size) cfg.burstSize = rc.burst_size;
      if (rc.burst_rest_sec) cfg.burstRestSec = rc.burst_rest_sec;
      _saveCfg(cfg);
      console.log("[BLAST CONFIG] Remote config loaded:", JSON.stringify(rc).slice(0, 200));
    }
  }
  var _lastSpamResult = null;
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "WSPP_SPAM_WARNING") return;
    _lastSpamResult = e.data.payload || null;
    _notify();
  });
  var _globalStats = null;
  function _fetchGlobalStats() {
    window.postMessage({ type: "BLAST_GET_STATS" }, WA_ORIGIN);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "BLAST_STATS_READY") return;
    if (e.data.ok) {
      _globalStats = {
        ...e.data.stats,
        by_number: e.data.by_number ?? {},
        // Map field names sidebar expects
        total_hablado: e.data.stats?.total_sent ?? 0,
        total_pending: e.data.stats?.total_pending ?? 0
      };
      _notify();
    }
  });
  var _previewContacts = [];
  var _previewLoading = false;
  var _previewReady = false;
  var _previewSkippedIds = /* @__PURE__ */ new Set();
  var _previewMessages = /* @__PURE__ */ new Map();
  var _previewFlags = /* @__PURE__ */ new Map();
  var _burstCount = 0;
  async function _checkPreviewContact(c) {
    const np = _normalizePhone2(c.telefono);
    if (!np) {
      _previewFlags.set(c.id, { inContacts: false, noWA: null, invalid: true });
      return;
    }
    const flags = { inContacts: false, noWA: null, invalid: false };
    try {
      const { ContactCollection } = window.require("WAWebContactCollection");
      if (ContactCollection?._models) {
        const rawDigits = np.replace(/\D/g, "");
        for (const model of ContactCollection._models) {
          const modelPhone = (model.number || model.userid || model.phoneNumber || "").replace(/\D/g, "");
          if (modelPhone && (modelPhone === rawDigits || modelPhone.endsWith(rawDigits.slice(-9)))) {
            flags.inContacts = true;
            break;
          }
        }
      }
    } catch (_) {
    }
    try {
      const exists = await _checkExistsOnWA(np);
      flags.noWA = exists === false ? true : exists === true ? false : null;
    } catch (_) {
      flags.noWA = null;
    }
    _previewFlags.set(c.id, flags);
  }
  async function _checkAllPreviewContacts(contacts) {
    const batchSize = 20;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const slice = contacts.slice(i, i + batchSize);
      await Promise.all(slice.map((c) => _checkPreviewContact(c)));
    }
    for (const c of contacts) {
      const f = _previewFlags.get(c.id);
      if (f?.inContacts) {
        _previewSkippedIds.add(c.id);
      }
    }
  }
  function getConfig() {
    return cfg;
  }
  function setConfig(c) {
    cfg = { ...cfg, ...c };
    _saveCfg(cfg);
  }
  function getTemplates() {
    return tpls;
  }
  function setTemplates(t) {
    tpls = t;
    _saveTpls(t);
  }
  function isRunning() {
    return _running;
  }
  function getCountdown() {
    return _countdown;
  }
  function getKpis() {
    return { ..._kpis };
  }
  function getLastResults() {
    return _lastResults;
  }
  function getTotalPending() {
    return _totalPending;
  }
  function setOnUpdate(fn) {
    _onUpdate = fn;
  }
  function getTplIndex() {
    return _tplIndex;
  }
  function isWithinBlastWindow() {
    return _isWithinSendWindow();
  }
  function setBlastLimit(n) {
    _blastLimit = n;
  }
  function getBlastLimit() {
    return _blastLimit;
  }
  function getSessionSent() {
    return _sessionSent;
  }
  async function startBlast() {
    if (_running) return;
    if (!tpls.length || !tpls[0].trim()) return;
    if (!_excelContacts.length && !_confirmedPreview?.length) {
      _lastResults.unshift({ nombre: "\u274C Sin Excel", telefono: "", status: "failed", ack: -1, error: "Sub\xED un archivo Excel con contactos primero." });
      _notify();
      return;
    }
    const activeNumber = getOwnNumber();
    if (!activeNumber) {
      _lastResults.unshift({ nombre: "\u274C Sin n\xFAmero", telefono: "", status: "failed", ack: -1, error: "No se detect\xF3 el n\xFAmero. Recarg\xE1 WA Web." });
      _notify();
      return;
    }
    _excelCursor = 0;
    _preClaimedIds.clear();
    _inFlight.clear();
    _trackedMsgs = [];
    _sentIds.clear();
    console.log(`[BLAST] Sesi\xF3n limpia \u2014 historial: ${_historyPhones.size} tel\xE9fonos, sesi\xF3n: ${_sentPhones.size}`);
    _currentSessionId = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    _hasSentThisSession = false;
    console.log(`[BLAST] Iniciando sesi\xF3n=${_currentSessionId}`);
    if (!_confirmedPreview) _previewOnlyMode = false;
    _running = true;
    _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
    _lastResults = [];
    _trackedMsgs = [];
    _totalPending = null;
    _sessionSent = 0;
    _burstCount = 0;
    let _consecutiveFailures = 0;
    _notify();
    await _loadRemoteConfig();
    if (!_isWithinSendWindow()) {
      console.log("[BLAST] Fuera de ventana horaria (8am-9pm Peru) \u2014 no se inicia");
      _running = false;
      _notify();
      return;
    }
    while (_running) {
      if (!_isWithinSendWindow()) {
        console.log("[BLAST] Fuera de ventana horaria (8am-9pm Peru) \u2014 parando");
        _running = false;
        _stopCountdown();
        _notify();
        break;
      }
      const health = await _fetchHealth();
      if (health && health.can_send === false) {
        const waitUntil = health.next_available_at;
        console.log(`[BLAST] Rate limit \u2014 can_send=false, next=${waitUntil}`);
        _notify();
        const waitMs = waitUntil ? Math.min(3e5, Math.max(5e3, new Date(waitUntil).getTime() - Date.now())) : 6e4;
        _startCountdown(Math.ceil(waitMs / 1e3), "cooldown");
        await _sleep(waitMs);
        _stopCountdown();
        continue;
      }
      if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
        console.log("[BLAST] L\xEDmite alcanzado \u2014 parando");
        _running = false;
        _stopCountdown();
        _notify();
        break;
      }
      if (_consecutiveFailures >= 5) {
        console.warn("[BLAST] Circuit breaker: 5+ fallos consecutivos \u2014 pausando 60s");
        _notify();
        _startCountdown(60, "circuit-breaker");
        await _sleep(6e4);
        _stopCountdown();
        _consecutiveFailures = 0;
        continue;
      }
      const burstMax = cfg.burstSize || 12;
      const burstRestSec = cfg.burstRestSec || 90;
      if (_burstCount >= burstMax) {
        const restMs = burstRestSec * 1e3 + _humanRandom(0, 15e3);
        console.log(`[BLAST] Burst rest: ${_burstCount} msgs enviados, descansando ${Math.round(restMs / 1e3)}s`);
        _startCountdown(Math.ceil(restMs / 1e3), "descanso");
        _notify();
        await _sleep(restMs);
        _stopCountdown();
        _burstCount = 0;
        if (!_running) break;
      }
      let rawBatch;
      if (_confirmedPreview && _confirmedPreview.length) {
        rawBatch = _confirmedPreview;
        _confirmedPreview = null;
        console.log(`[BLAST LOOP] usando ${rawBatch.length} contactos del preview confirmado`);
      } else if (_previewOnlyMode) {
        console.log("[BLAST LOOP] Preview-only mode \u2014 no m\xE1s contactos, parando");
        _running = false;
        _stopCountdown();
        _notify();
        break;
      } else {
        rawBatch = await _fetchBatch(cfg.batchSize);
        console.log(`[BLAST LOOP] batch recibido: ${rawBatch.length} contactos`);
      }
      if (!rawBatch.length) {
        console.log("[BLAST LOOP] Batch vac\xEDo \u2014 no hay m\xE1s contactos pendientes, parando loop");
        try {
          localStorage.removeItem(LS_SENT_KEY);
        } catch (_) {
        }
        _running = false;
        _stopCountdown();
        _notify();
        break;
      }
      const batch = rawBatch.filter((c) => {
        if (c.id && _sentIds.has(c.id)) return false;
        const np = _normalizePhone2(c.telefono);
        if (np && _sentPhones.has(np)) return false;
        return true;
      });
      console.log(`[BLAST LOOP] tras dedup local: ${batch.length}/${rawBatch.length} contactos`);
      if (!batch.length) {
        _dedupRetries = (_dedupRetries || 0) + 1;
        if (_dedupRetries >= 3) {
          console.log("[BLAST LOOP] 3 consecutive all-dedup batches \u2014 stopping");
          try {
            localStorage.removeItem(LS_SENT_KEY);
          } catch (_) {
          }
          _running = false;
          _stopCountdown();
          _notify();
          break;
        }
        console.log(`[BLAST LOOP] Batch all dedup'd \u2014 retry ${_dedupRetries}/3`);
        await _sleep(1e3);
        continue;
      }
      _dedupRetries = 0;
      const habladoBatch = [];
      const noWaBatch = [];
      const skipsBatch = [];
      const sentResults = [];
      const filteredBatch = batch;
      for (let i = 0; i < filteredBatch.length && _running; i++) {
        const c = filteredBatch[i];
        const normalizedPhone = _normalizePhone2(c.telefono);
        const jid = normalizedPhone ? normalizedPhone + "@c.us" : null;
        const cName = ((c.nombre || "") + " " + (c.apellidos || "")).trim() || "\u2014";
        const lockKey = (normalizedPhone || "") + ":" + (c.id || "");
        if (_inFlight.has(lockKey)) continue;
        if (normalizedPhone && _sentPhones.has(normalizedPhone)) continue;
        if (c.id && _sentIds.has(c.id)) continue;
        _inFlight.add(lockKey);
        if (!((c.nombre || "") + " " + (c.apellidos || "")).trim()) {
          _kpis.skipped++;
          if (c.id) _sentIds.add(c.id);
          skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? "", contact_name: null, reason: "sin_nombre" });
          _lastResults.unshift({ nombre: "\u2014 Sin nombre", telefono: c.telefono, status: "skipped", ack: -1, error: "Sin nombre \u2014 skip" });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
        if (!jid) {
          _kpis.failed++;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error: "Tel inv\xE1lido" });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
        const hasWA = await _checkExistsOnWA(normalizedPhone);
        if (hasWA === false) {
          console.log("[BLAST] Skip \u2014 sin WA (USyncQuery):", cName, c.telefono);
          _kpis.no_wa++;
          if (c.id) noWaBatch.push(c.id);
          if (normalizedPhone) _sentPhones.add(normalizedPhone);
          if (c.id) _sentIds.add(c.id);
          skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? "", contact_name: cName, reason: "usync_no_wa" });
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "skipped", ack: -1, error: "Sin WA \u2014 skip" });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
        try {
          const { ContactCollection } = window.require("WAWebContactCollection");
          if (ContactCollection?._models) {
            const normalizedPhoneRaw = c.telefono?.replace(/\D/g, "") || normalizedPhone?.replace(/\D/g, "");
            let alreadySaved = false;
            for (const model of ContactCollection._models) {
              const modelPhone = (model.number || model.userid || model.phoneNumber || "").replace(/\D/g, "");
              if (modelPhone && modelPhone === normalizedPhoneRaw) {
                alreadySaved = true;
                break;
              }
            }
            if (alreadySaved) {
              console.log("[BLAST] Skip \u2014 contacto ya agendado en WA:", cName, c.telefono);
              _kpis.skipped++;
              skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? "", contact_name: cName, reason: "contact_collection_agendado" });
              _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "skipped", ack: -1, error: "Agendado en WA \u2014 skip" });
              if (_lastResults.length > 30) _lastResults.length = 30;
              _notify();
              _inFlight.delete(lockKey);
              continue;
            }
          }
        } catch (_) {
        }
        let chat = null;
        try {
          const wf = _req("WAWebWidFactory");
          const wid = wf.createWid(jid);
          const coll = _req("WAWebCollections");
          chat = coll.Chat.get(wid);
          if (!chat) {
            const FC = _req("WAWebFindChatAction");
            const r = await FC.findOrCreateLatestChat(wid);
            chat = r?.chat ?? r;
          }
          if (!chat) throw new Error("No se resolvi\xF3 el chat");
          const lastReceivedKey = chat.get?.("lastReceivedKey");
          const msgCount = chat.get?.("msgCount") || 0;
          if (lastReceivedKey && msgCount > 0) {
            console.log("[BLAST] Skip \u2014 WA ya tiene chat con historial:", cName, c.telefono);
            _kpis.skipped++;
            skipsBatch.push({ contact_id: c.id ?? null, contact_phone: c.telefono ?? "", contact_name: cName, reason: "last_received_key" });
            _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "skipped", ack: -1, error: "Chat con historial \u2014 skip" });
            if (_lastResults.length > 30) _lastResults.length = 30;
            _notify();
            _inFlight.delete(lockKey);
            continue;
          }
        } catch (err) {
          _kpis.no_wa++;
          if (c.id) noWaBatch.push(c.id);
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error: "Sin WA: " + err.message });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          _inFlight.delete(lockKey);
          continue;
        }
        const tpl = tpls[_tplIndex % tpls.length];
        const parts = _spinMessage(tpl, c, _tplIndex);
        const text = parts[0];
        try {
          for (let p = 0; p < parts.length && _running; p++) {
            const partText = parts[p];
            if (p > 0) await _sleep(_humanRandom(1500, 4e3));
            const partModel = await _sendToChat(chat, partText);
            if (p === 0 && partModel) _trackMessage(partModel, c.telefono);
          }
          _kpis.sent++;
          _sessionSent++;
          _tplIndex++;
          _burstCount++;
          _hasSentThisSession = true;
          if (c.id) habladoBatch.push(c.id);
          if (normalizedPhone) _sentPhones.add(normalizedPhone);
          if (c.id) _sentIds.add(c.id);
          _saveSentToStorage();
          window.postMessage({
            type: "BLAST_REPORT_CONVERSATION",
            jid,
            own_number: getOwnNumber() || "",
            phone: c.telefono ?? "",
            contact_name: cName
          }, WA_ORIGIN);
          sentResults.push({
            phone: c.telefono ?? "",
            contact_name: ((c.nombre || "") + " " + (c.apellidos || "")).trim() || null,
            message: text?.slice(0, 200) ?? null,
            status: "sent",
            error: null,
            own_number: getOwnNumber() || "",
            contact_id: c.id ?? null
          });
          _consecutiveFailures = 0;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "sent", ack: 0, error: null });
          if (_blastLimit > 0 && _sessionSent >= _blastLimit) {
            console.log("[BLAST] L\xEDmite alcanzado \u2014 parando");
            _running = false;
            _stopCountdown();
            _notify();
            break;
          }
        } catch (err) {
          _kpis.failed++;
          _consecutiveFailures++;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error: err.message });
        }
        if (_lastResults.length > 30) _lastResults.length = 30;
        _notify();
        _inFlight.delete(lockKey);
        if (_running && i < filteredBatch.length - 1) {
          const delay = _adaptiveDelay();
          _startCountdown(Math.ceil(delay / 1e3), "delay");
          await _sleep(delay);
          _stopCountdown();
        }
      }
      if (habladoBatch.length || noWaBatch.length) {
        await _markHablado([...habladoBatch], [...noWaBatch]).catch((err) => {
          console.warn("[BLAST] batch mark-hablado failed:", err?.message);
        });
      }
      if (sentResults.length) {
        window.postMessage({
          type: "BLAST_REPORT_RESULTS",
          results: sentResults
        }, WA_ORIGIN);
      }
      _saveSentToStorage();
      _reportSkips(skipsBatch);
      const batchProcessed = habladoBatch.length + noWaBatch.length + skipsBatch.length;
      if (_totalPending !== null && batchProcessed > 0) _totalPending = Math.max(0, _totalPending - batchProcessed);
      _notify();
      if (_running) {
        await _sleep(2e3);
      }
    }
    _running = false;
    _stopCountdown();
    _stopAckTracking();
    _notify();
  }
  async function loadPreview() {
    if (_previewLoading || _running) return;
    _previewLoading = true;
    _previewReady = false;
    _previewContacts = [];
    _previewSkippedIds.clear();
    _previewMessages.clear();
    _notify();
    await _loadRemoteConfig();
    const limit = _blastLimit > 0 ? _blastLimit : cfg.batchSize || 10;
    const contacts = await _fetchBatch(Math.min(limit, 200));
    if (!contacts.length) {
      _previewLoading = false;
      _notify();
      return;
    }
    let tplIdx = _tplIndex;
    for (const c of contacts) {
      const tpl = tpls[tplIdx % tpls.length];
      const parts = _spinMessage(tpl, c, tplIdx);
      _previewMessages.set(c.id, parts);
      tplIdx++;
    }
    _previewContacts = contacts;
    _notify();
    await _checkAllPreviewContacts(contacts);
    _previewLoading = false;
    _previewReady = true;
    _notify();
  }
  function getPreviewContacts() {
    return _previewContacts;
  }
  function isPreviewLoading() {
    return _previewLoading;
  }
  function isPreviewReady() {
    return _previewReady;
  }
  function getPreviewSkipped() {
    return _previewSkippedIds;
  }
  function getPreviewMessage(id) {
    return _previewMessages.get(id) || [];
  }
  function getPreviewFlags() {
    return _previewFlags;
  }
  function previewSkipContact(id) {
    if (_previewSkippedIds.has(id)) {
      _previewSkippedIds.delete(id);
    } else {
      _previewSkippedIds.add(id);
    }
    _notify();
  }
  async function previewMarkHabladoAndReplace(id) {
    const contact = _previewContacts.find((c) => c.id === id);
    if (!contact) return;
    _previewSkippedIds.add(id);
    _notify();
    await _markHablado([id], []);
    console.log("[PREVIEW] Marked hablado:", id, contact.telefono);
    const np = _normalizePhone2(contact.telefono);
    if (np) _sentPhones.add(np);
    _sentIds.add(id);
    const replacements = await _fetchBatch(1);
    if (replacements.length) {
      const rep = replacements[0];
      const existingIds = new Set(_previewContacts.map((c) => c.id));
      if (!existingIds.has(rep.id) && !_sentIds.has(rep.id)) {
        const tplIdx = _tplIndex + _previewContacts.length;
        const tpl = tpls[tplIdx % tpls.length];
        _previewMessages.set(rep.id, _spinMessage(tpl, rep, tplIdx));
        await _checkPreviewContact(rep);
        const idx = _previewContacts.findIndex((c) => c.id === id);
        if (idx !== -1) {
          _previewContacts[idx] = rep;
          _previewSkippedIds.delete(id);
        } else {
          _previewContacts.push(rep);
        }
        console.log("[PREVIEW] Replaced with:", rep.nombre, rep.telefono);
      }
    }
    _notify();
  }
  function previewCancel() {
    _previewContacts = [];
    _previewSkippedIds.clear();
    _previewMessages.clear();
    _previewFlags.clear();
    _previewReady = false;
    _previewLoading = false;
    _notify();
  }
  function previewConfirm() {
    if (!_previewReady || !_previewContacts.length) return;
    const confirmed = _previewContacts.filter((c) => !_previewSkippedIds.has(c.id));
    if (!confirmed.length) {
      previewCancel();
      return;
    }
    _confirmedPreview = confirmed;
    _blastLimit = confirmed.length;
    _previewOnlyMode = true;
    _previewReady = false;
    _previewFlags.clear();
    _notify();
    startBlast();
  }
  var _confirmedPreview = null;
  var _previewOnlyMode = false;
  function setExcelContacts(contacts) {
    const all = contacts || [];
    const beforeCount = all.length;
    _excelContacts = all.filter((c) => {
      const phone2 = (c.telefono || "").replace(/\D/g, "");
      if (!phone2) return true;
      return !_historyPhones.has(phone2);
    });
    _historyFilteredCount = beforeCount - _excelContacts.length;
    _excelCursor = 0;
    _totalPending = _excelContacts.length;
    if (_historyFilteredCount > 0) {
      console.log(`[BLAST] Excel: ${beforeCount} total, ${_historyFilteredCount} ya enviados antes, ${_excelContacts.length} nuevos`);
    } else {
      console.log(`[BLAST] Excel contacts set: ${_excelContacts.length} (todos nuevos)`);
    }
    _notify();
  }
  function getExcelContactCount() {
    return _excelContacts.length;
  }
  function getExcelFilteredCount() {
    return _historyFilteredCount;
  }
  function getHistoryCount() {
    return _historyPhones.size;
  }
  function hasExcelLoaded() {
    return _excelContacts.length > 0;
  }
  function clearHistory() {
    _historyPhones.clear();
    _historyFilteredCount = 0;
    try {
      localStorage.removeItem(LS_HISTORY_KEY);
    } catch (_) {
    }
    console.log("[BLAST] Historial de enviados limpiado");
  }
  function isPaused() {
    return false;
  }
  function getPhase() {
    return "";
  }
  function refreshPendingCount() {
    _totalPending = Math.max(0, _excelContacts.length - _excelCursor - _sentIds.size);
    _notify();
  }
  function getPeruTimeStr() {
    return (/* @__PURE__ */ new Date()).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
  }
  function getNumberHealth() {
    return _lastHealth;
  }
  function isNumberAuthorized() {
    return _lastHealth?.can_send ?? null;
  }
  function fetchNumberHealth() {
    _fetchHealth();
  }
  function fetchNumberConfig() {
  }
  function getLastSpamResult() {
    return _lastSpamResult;
  }
  function getGlobalStats() {
    return _globalStats;
  }
  function fetchGlobalStats() {
    _fetchGlobalStats();
  }
  function pauseBlast() {
    _running = false;
    _stopCountdown();
    _notify();
  }
  function resumeBlast() {
    if (_running) return;
    startBlast();
  }
  function resetSession() {
    _saveHistory();
    _sentPhones.clear();
    _sentIds.clear();
    _excelCursor = 0;
    try {
      localStorage.removeItem(LS_SENT_KEY);
    } catch (_) {
    }
    try {
      localStorage.removeItem(LS_RETRY_KEY);
    } catch (_) {
    }
    _preClaimedIds.clear();
    _inFlight.clear();
    _trackedMsgs = [];
    _kpis = { sent: 0, failed: 0, no_wa: 0, skipped: 0 };
    _lastResults = [];
    _totalPending = null;
    _running = false;
    _tplIndex = 0;
    _sessionSent = 0;
    _blastLimit = 0;
    _burstCount = 0;
    _hasSentThisSession = false;
    _confirmedPreview = null;
    _previewOnlyMode = false;
    _previewContacts = [];
    _previewSkippedIds.clear();
    _previewMessages.clear();
    _previewFlags.clear();
    _previewReady = false;
    _previewLoading = false;
    _stopCountdown();
    _stopAckTracking();
    _notify();
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
  var _open = false;
  var _contacts2 = [];
  var _total = 0;
  var _running2 = false;
  var _paused = false;
  var _idx = 0;
  var _sessionCount = 0;
  var _burstCount2 = 0;
  var _results = [];
  var _countdown2 = 0;
  var _countdownTimer2 = null;
  var _activeNumber = null;
  var _startTime = null;
  var _phase = "";
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
  var _usyncCache = /* @__PURE__ */ new Map();
  var USYNC_CACHE_TTL_MS = 30 * 60 * 1e3;
  var USYNC_CACHE_MAX = 600;
  async function _checkPhonesSilentBatch(phones) {
    const results = {};
    const toQuery = [];
    const now = Date.now();
    for (const phone2 of phones) {
      const cached = _usyncCache.get(phone2);
      if (cached && now - cached.ts < USYNC_CACHE_TTL_MS) {
        results[phone2] = { exists: cached.exists, reason: "cache" };
      } else {
        toQuery.push(phone2);
      }
    }
    if (!toQuery.length) return results;
    let usyncOk = false;
    try {
      const usyncMod = _req2("WAWebUsync", "WAWebUsyncQuery", "WAWebUSyncModule");
      const userMod = _req2("WAWebUsyncUser", "WAWebUSyncUserUtils", "WAWebUSyncUser");
      const USyncQuery = usyncMod?.USyncQuery || usyncMod?.default?.USyncQuery || usyncMod;
      const USyncUser = userMod?.USyncUser || userMod?.default?.USyncUser || userMod;
      if (USyncQuery && USyncUser) {
        const query = new USyncQuery().withContext("interactive").withContactProtocol();
        for (const phone2 of toQuery) {
          query.withUser(new USyncUser().withPhone(phone2));
        }
        const response = await query.execute();
        const list = response?.list || [];
        const byPhone = {};
        for (const item of list) {
          const phone2 = item?.contact?.content;
          const type = item?.contact?.type;
          if (phone2) byPhone[phone2] = type;
        }
        for (const phone2 of toQuery) {
          const type = byPhone[phone2];
          const exists = type === "in";
          const reason = type || "no_response";
          results[phone2] = { exists, reason };
          _usyncCache.set(phone2, { exists, ts: now });
        }
        if (_usyncCache.size > USYNC_CACHE_MAX) {
          const overflow = _usyncCache.size - USYNC_CACHE_MAX;
          const iter = _usyncCache.keys();
          for (let i = 0; i < overflow; i++) _usyncCache.delete(iter.next().value);
        }
        usyncOk = true;
      }
    } catch (_) {
    }
    if (!usyncOk) {
      for (const phone2 of toQuery) {
        if (results[phone2]) continue;
        try {
          const wf = _req2("WAWebWidFactory");
          const coll = _req2("WAWebCollections");
          if (wf && coll) {
            const wid = wf.createWid(phone2 + "@c.us");
            const chat = coll.Chat?.get(wid);
            if (chat) {
              results[phone2] = { exists: true, reason: "in_store" };
              _usyncCache.set(phone2, { exists: true, ts: now });
              continue;
            }
          }
        } catch (_) {
        }
        results[phone2] = { exists: false, reason: "usync_unavailable" };
      }
    }
    if (_usyncCache.size > USYNC_CACHE_MAX) {
      const overflow = _usyncCache.size - USYNC_CACHE_MAX;
      const iter = _usyncCache.keys();
      for (let i = 0; i < overflow; i++) _usyncCache.delete(iter.next().value);
    }
    return results;
  }
  async function _spamCheckBeforeSend() {
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
  function _recordOutgoingBridge(text, phone2) {
    window.postMessage({
      type: "WSPP_VALIDATOR_CONV_SENT",
      payload: { text, phone: phone2, own_number: getOwnNumber(), timestamp: Math.floor(Date.now() / 1e3) }
    }, WA_ORIGIN);
  }
  async function _sendConvMessage(phone2, nombre) {
    return new Promise((resolve) => {
      const digits = String(phone2).replace(/\D/g, "");
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
  function _esc(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }
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
  function _saveResults(results) {
    if (!results.length) return;
    window.postMessage({
      type: "WA_VALIDATOR_SAVE_RESULTS",
      results: results.map((r) => ({ id: r.id, wa_valid: r.wa_valid, mode: r.mode || "silent" })),
      own_number: _activeNumber
    }, WA_ORIGIN);
  }
  var USYNC_BATCH_SIZE = 20;
  async function _run() {
    if (_running2 || _paused) return;
    if (!_contacts2.length) {
      _toast2("Carga los contactos primero", "#ef5350");
      return;
    }
    _running2 = true;
    _paused = false;
    const batch = [];
    _render();
    const sessionMax = _mode === "conv" ? SESSION_MAX_CONV : SESSION_MAX_SILENT;
    while (_idx < _contacts2.length && _running2 && !_paused) {
      if (_sessionCount >= sessionMax) {
        _paused = _running2 = false;
        _stopCountdown2();
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        const msg = _mode === "conv" ? `${sessionMax} mensajes enviados. Descans\xE1 10 min antes de reanudar.` : `${sessionMax} verificados. Descans\xE1 5 min y reanud\xE1.`;
        _toast2(msg, "#ff9f0a", 1e4);
        _render();
        break;
      }
      if (_mode === "silent") {
        const remaining = Math.min(
          USYNC_BATCH_SIZE,
          sessionMax - _sessionCount,
          _contacts2.length - _idx
        );
        const slice = _contacts2.slice(_idx, _idx + remaining);
        const normalized = slice.map((c2) => {
          const d = String(c2.telefono).replace(/\D/g, "");
          return d.length === 9 ? "51" + d : d;
        });
        _phase = `Verificando batch ${_idx + 1}\u2013${_idx + slice.length}`;
        _render();
        let batchResults = {};
        try {
          batchResults = await _checkPhonesSilentBatch(normalized);
        } catch (_) {
        }
        for (let i = 0; i < slice.length; i++) {
          if (!_running2 || _paused) break;
          const c2 = slice[i];
          const norm = normalized[i];
          const r2 = batchResults[norm] || { exists: false, reason: "error" };
          const result2 = { ...c2, wa_valid: r2.exists, mode: "silent" };
          batch.push(result2);
          _results.push(result2);
          _sessionCount++;
        }
        _idx += slice.length;
        _render();
        if (batch.length >= 20) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        if (_running2 && !_paused && _idx < _contacts2.length) {
          const d = SILENT_DELAY_MIN + Math.random() * (SILENT_DELAY_MAX - SILENT_DELAY_MIN);
          _startCountdown2(d);
          _render();
          await _sleep2(d);
          _stopCountdown2();
        }
        continue;
      }
      if (_burstCount2 >= CONV_BURST_MAX) {
        _burstCount2 = 0;
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        _toast2(`Pausa de 2 min para evitar detecci\xF3n (${_sessionCount} msgs enviados)`, "#ff9f0a", CONV_BURST_REST);
        _startCountdown2(CONV_BURST_REST);
        _render();
        await _sleep2(CONV_BURST_REST);
        _stopCountdown2();
        if (!_running2 || _paused) break;
      }
      const c = _contacts2[_idx];
      const spamCheck = await _spamCheckBeforeSend();
      if (spamCheck.shouldPause) {
        _paused = _running2 = false;
        _stopCountdown2();
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        const coolMin = Math.ceil((spamCheck.cooldown_sec || 180) / 60);
        _toast2(
          `\u{1F6A8} RIESGO CR\xCDTICO \u2014 Validador pausado.
Esper\xE1 ${coolMin} min antes de reanudar.`,
          "#dc2626",
          15e3
        );
        _render();
        break;
      }
      const r = await _sendConvMessage(c.telefono, c.nombre);
      if (r.sent) {
        const tpl = _randomTemplate(c.nombre);
        _recordOutgoingBridge(tpl, c.telefono);
      } else {
        console.log("[WA VALIDATOR CONV] failed for", c.telefono, ":", r.reason);
      }
      _burstCount2++;
      const result = { ...c, wa_valid: r.sent, mode: "conv" };
      batch.push(result);
      _results.push(result);
      _sessionCount++;
      _idx++;
      _render();
      if (batch.length >= 20) {
        _saveResults([...batch]);
        batch.length = 0;
      }
      if (_running2 && !_paused && _idx < _contacts2.length) {
        const d = _randomDelay();
        _startCountdown2(d);
        _render();
        await _sleep2(d);
        _stopCountdown2();
      }
    }
    if (batch.length) {
      _saveResults([...batch]);
      batch.length = 0;
    }
    if (!_paused && _idx >= _contacts2.length) {
      _running2 = false;
      _stopCountdown2();
      const valid = _results.filter((r) => r.wa_valid).length;
      const invalid = _results.filter((r) => !r.wa_valid).length;
      const modeLabel = _mode === "conv" ? "mensajes enviados" : "verificados sin mensajes";
      _toast2(`\u2705 Completado \u2014 ${valid} con WA \xB7 ${invalid} sin WA \xB7 ${modeLabel}`, "#25d366", 6e3);
    }
    _running2 = false;
    _render();
  }
  function _render() {
    const el = document.getElementById("wspp-val-panel");
    if (!_open) {
      if (el) el.remove();
      return;
    }
    _activeNumber = getOwnNumber();
    const valid = _results.filter((r) => r.wa_valid === true).length;
    const invalid = _results.filter((r) => r.wa_valid === false).length;
    const pending = _contacts2.length - _idx;
    const pct = _contacts2.length ? Math.round(_idx / _contacts2.length * 100) : 0;
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
        <span style="font-size:13px;font-weight:700;color:${_activeNumber ? "#60a5fa" : "#ff9f0a"};">
          ${_activeNumber ? "+" + _activeNumber : "\u23F3 detectando..."}
        </span>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.05);">
        ${[
      ["Total", _total, "#60a5fa"],
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
          <span>${_idx} / ${_contacts2.length} procesados</span>
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
            \u{1F4CB} Cargar ${_total || "..."} n\xFAmeros
          </button>
        ` : !_running2 && !_paused ? `
          <button id="wspp-val-start" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px ${modeColor}33;">
            \u25B6 ${isConv ? "Iniciar conversaciones" : "Verificar"} (${_contacts2.length - _idx})
          </button>
          <button id="wspp-val-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">\u21BA</button>
        ` : _running2 ? `
          <div style="flex:1;padding:9px 12px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${isConv ? `\u{1F4AC} Enviando \xB7 ${_sessionCount} msgs \xB7 burst ${_burstCount2}/${CONV_BURST_MAX}` : `\u{1F535} Verificando \xB7 ${_sessionCount} en esta sesi\xF3n`}
          </div>
          <button id="wspp-val-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">\u23F8 Pausar</button>
        ` : _paused && _idx < _contacts2.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            \u23F8 Pausado en ${_idx}/${_contacts2.length}. Listo para reanudar.
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
      ${_results.length ? `
      <div style="padding:0 16px 16px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px;">\xDAltimos procesados</div>
        <div style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;">
          ${_results.slice(-12).reverse().map((r) => `
            <div style="display:flex;align-items:center;gap:7px;padding:5px 9px;background:rgba(255,255,255,.02);border-radius:6px;border:1px solid rgba(255,255,255,.04);">
              <span style="font-size:13px;flex-shrink:0;">${r.wa_valid ? "\u2705" : "\u274C"}</span>
              <span style="font-size:12px;color:${r.wa_valid ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.5)"};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${_esc(r.nombre) || "?"} \xB7 +${_esc(r.telefono)}
              </span>
              <span style="font-size:10px;color:rgba(255,255,255,.15);flex-shrink:0;">
                ${r.mode === "conv" ? "\u{1F4AC}" : "\u{1F50D}"} ${_esc((r.encuestador || "").slice(0, 14))}
              </span>
            </div>
          `).join("")}
        </div>
      </div>` : ""}
    </div>
  `;
    if (el) el.outerHTML = html;
    else document.body.insertAdjacentHTML("beforeend", html);
    _ensureDelegation();
  }
  var _delegationBound = false;
  function _ensureDelegation() {
    if (_delegationBound) return;
    document.addEventListener("click", _handleValClick);
    _delegationBound = true;
  }
  function _handleValClick(e) {
    const panel = document.getElementById("wspp-val-panel");
    if (!panel) return;
    if (!panel.contains(e.target)) return;
    const btn = e.target.closest("button[id]") || e.target.closest("[id]");
    if (!btn) return;
    const id = btn.id;
    if (id === "wspp-val-close") {
      _open = false;
      if (_running2) {
        _running2 = false;
        _paused = true;
        _stopCountdown2();
      }
      _render();
    } else if (id === "wspp-mode-silent") {
      if (!_running2) {
        _mode = "silent";
        _render();
      }
    } else if (id === "wspp-mode-conv") {
      if (!_running2) {
        _mode = "conv";
        _render();
      }
    } else if (id === "wspp-val-load" || id === "wspp-val-reload") {
      if (id === "wspp-val-reload") {
        _contacts2 = [];
        _results = [];
        _idx = 0;
        _sessionCount = 0;
        _burstCount2 = 0;
        _running2 = false;
        _paused = false;
      }
      _load();
    } else if (id === "wspp-val-start") {
      _startTime = Date.now();
      _burstCount2 = 0;
      _run();
    } else if (id === "wspp-val-pause") {
      _paused = true;
      _running2 = false;
      _stopCountdown2();
      _render();
    } else if (id === "wspp-val-resume") {
      _sessionCount = 0;
      _burstCount2 = 0;
      _paused = false;
      _run();
    } else if (id === "wspp-val-stats") {
      window.postMessage({ type: "WA_VALIDATOR_GET_STATS_REQ" }, WA_ORIGIN);
    }
  }
  function _load() {
    _activeNumber = getOwnNumber();
    const btn = document.getElementById("wspp-val-load") || document.getElementById("wspp-val-reload");
    if (btn) {
      btn.textContent = "\u23F3 Cargando...";
      btn.disabled = true;
    }
    window.postMessage({ type: "WA_VALIDATOR_GET_CONTACTS", limit: 500, offset: _idx }, WA_ORIGIN);
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
              ${_esc(b.encuestador) || "Sin nombre"}
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
        _toast2("Error cargando contactos: " + (e.data.error || "?"), "#ef5350");
        _render();
        return;
      }
      _contacts2 = e.data.contacts || [];
      _total = e.data.total || _contacts2.length;
      _idx = 0;
      _sessionCount = 0;
      _burstCount2 = 0;
      _results = [];
      _running2 = false;
      _paused = false;
      _toast2(`\u2705 ${_contacts2.length} n\xFAmeros cargados`, "#60a5fa");
      _render();
      return;
    }
    if (e.data?.type === "WA_VALIDATOR_STATS_READY") {
      _showStats(e.data.summary, e.data.by_brigadista);
      return;
    }
  });
  function toggleValidatorPanel() {
    _open = !_open;
    _render();
  }

  // src/inject/sidebar.js
  var _cachedAnalysis = null;
  var _cachedTplsHash = "";
  var _blastSessionStart = null;
  var SIDEBAR_W = 380;
  var SIDEBAR_ID = "wspp-sidebar";
  var FAB_ID = "wspp-sidebar-fab";
  var TAB_KEY = "wspp_sidebar_tab";
  var Z = {
    fab: 10010,
    toasts: 10010,
    blast: 10009,
    validator: 10008,
    sidebar: 10007,
    valOverlay: 10006,
    valStats: 10005,
    spamWarning: 10004,
    spamBlocker: 10003,
    catalogPanel: 10002
  };
  var S = {
    bg: "#ffffff",
    card: "#f7f8fa",
    border: "#e5e7eb",
    text: "#1a1a1a",
    muted: "#6b7280",
    accent: "#25d366",
    accentBg: "#ecfdf5",
    danger: "#ef4444",
    dangerBg: "#fef2f2",
    warn: "#f59e0b",
    warnBg: "#fffbeb",
    blue: "#3b82f6",
    blueBg: "#eff6ff"
  };
  var _open2 = false;
  var _savedTab = localStorage.getItem(TAB_KEY) || "blast";
  var _tab = _savedTab === "audios" ? "blast" : _savedTab;
  var $2 = (id) => document.getElementById(id);
  function _esc2(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  setOnUpdate(() => {
    if (_open2 && _tab === "blast") _renderContent();
  });
  var AUDIO_FAB_ID = "wspp-audio-fab";
  function insertSidebarFAB() {
    if ($2(FAB_ID)) return;
    const container = document.createElement("div");
    container.id = "wspp-fab-container";
    Object.assign(container.style, {
      position: "fixed",
      right: "0",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: String(Z.fab),
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      pointerEvents: "auto"
    });
    const audioFab = document.createElement("button");
    audioFab.id = AUDIO_FAB_ID;
    audioFab.title = "Audios";
    audioFab.innerHTML = "\u{1F399}";
    Object.assign(audioFab.style, {
      width: "28px",
      height: "36px",
      borderRadius: "6px 0 0 6px",
      background: "#00a884",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: "14px",
      lineHeight: "1",
      boxShadow: "-2px 0 12px rgba(0,0,0,.15)",
      userSelect: "none",
      WebkitUserSelect: "none"
    });
    audioFab.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleCatalogPanel();
    });
    audioFab.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    container.appendChild(audioFab);
    _tryInsertWaFab(container);
    document.body.appendChild(container);
  }
  function _tryInsertWaFab(container) {
    if ($2(FAB_ID)) return;
    if (!isConsultorLevel()) return;
    const ctr = container || document.getElementById("wspp-fab-container");
    if (!ctr) return;
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.title = "Goberna Blast";
    fab.textContent = "WA";
    Object.assign(fab.style, {
      width: "28px",
      height: "48px",
      borderRadius: "6px 0 0 6px",
      background: S.accent,
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: "11px",
      fontWeight: "800",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      letterSpacing: "0",
      boxShadow: "-2px 0 12px rgba(0,0,0,.15)",
      userSelect: "none",
      WebkitUserSelect: "none"
    });
    fab.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleSidebar();
    });
    fab.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    ctr.appendChild(fab);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "WSPP_SET_USER_ROLE") return;
    setTimeout(() => _tryInsertWaFab(), 100);
  });
  function toggleSidebar() {
    _open2 = !_open2;
    const fab = $2(FAB_ID);
    const container = document.getElementById("wspp-fab-container");
    if (_open2) {
      if (container) container.style.right = SIDEBAR_W + "px";
      if (fab) {
        fab.style.background = "#374151";
        fab.textContent = "\u2715";
      }
      _renderSidebar();
      if (!isRunning()) refreshPendingCount();
      fetchNumberHealth();
      fetchNumberConfig();
      fetchGlobalStats();
    } else {
      if (container) container.style.right = "0";
      if (fab) {
        fab.style.background = S.accent;
        fab.textContent = "WA";
      }
      const el = $2(SIDEBAR_ID);
      if (el) {
        el.style.transform = `translateX(${SIDEBAR_W}px)`;
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 260);
      }
    }
  }
  function _renderSidebar() {
    let el = $2(SIDEBAR_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = SIDEBAR_ID;
      Object.assign(el.style, {
        position: "fixed",
        top: "0",
        right: "0",
        width: SIDEBAR_W + "px",
        height: "100vh",
        zIndex: String(Z.sidebar),
        background: S.bg,
        borderLeft: `1px solid ${S.border}`,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.15), -2px 0 8px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
        color: S.text,
        transform: `translateX(${SIDEBAR_W}px)`,
        opacity: "0",
        transition: "transform .25s ease, opacity .2s ease",
        overflowX: "hidden"
      });
      el.addEventListener("click", (e) => {
        if (e.target.closest('button, input, textarea, select, a, [role="button"]')) e.stopPropagation();
      });
      el.addEventListener("mousedown", (e) => {
        if (e.target.closest('button, input, textarea, select, a, [role="button"]')) e.stopPropagation();
      });
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = "translateX(0)";
        el.style.opacity = "1";
      });
    }
    _delegationBound2 = false;
    el.innerHTML = `
    <div style="padding:14px 16px 10px;border-bottom:1px solid ${S.border};display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
      <div>
        <div style="font-size:15px;font-weight:700;">Goberna</div>
        <div style="font-size:11px;color:${S.muted};">${getOwnNumber() ? "+" + getOwnNumber() : "Detectando..."}</div>
      </div>
      <button id="sb-close" style="background:none;border:none;color:${S.muted};font-size:18px;cursor:pointer;padding:4px;">\u2715</button>
    </div>
    <div style="display:flex;border-bottom:1px solid ${S.border};flex-shrink:0;">
      ${_tabBtn("blast", "\u{1F4E8}", "Blast")}
      ${_tabBtn("validar", "\u2705", "Validar")}
    </div>
    <div id="sb-content" style="flex:1;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;"></div>
  `;
    _bindShell();
    _renderContent();
  }
  function _tabBtn(id, icon, label) {
    const active = _tab === id;
    return `<button data-tab="${id}" style="
    flex:1;padding:10px 4px;border:none;cursor:pointer;
    background:${active ? S.bg : S.card};color:${active ? S.accent : S.muted};
    font-size:11px;font-weight:${active ? "700" : "500"};
    border-bottom:2px solid ${active ? S.accent : "transparent"};
  "><div style="font-size:14px;">${icon}</div>${label}</button>`;
  }
  var _delegationBound2 = false;
  function _renderContent() {
    const el = $2("sb-content");
    if (!el) return;
    const running = isRunning();
    const activeEl = document.activeElement;
    const isEditing = activeEl && el.contains(activeEl) && (activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT");
    if (running || isEditing) {
      const timerEl = document.getElementById("sb-timer-label");
      if (timerEl) {
        const countdown = getCountdown();
        if (countdown > 0) {
          const m = Math.floor(countdown / 60);
          const s = countdown % 60;
          timerEl.textContent = `\u23F1\uFE0F ${m > 0 ? m + "m " : ""}${s}s`;
          timerEl.style.display = "";
        } else {
          timerEl.style.display = "none";
        }
      }
      const kpis = getKpis();
      const kpiEls = el.querySelectorAll("[data-kpi]");
      for (const k of kpiEls) {
        const key = k.dataset.kpi;
        if (key && kpis[key] !== void 0) k.textContent = kpis[key];
      }
      const sentEl = document.getElementById("sb-session-sent");
      if (sentEl) sentEl.textContent = getSessionSent();
      const pctEl = document.getElementById("sb-limit-pct");
      if (pctEl) {
        const limit = getBlastLimit();
        const sent = getSessionSent();
        if (limit > 0) pctEl.style.width = Math.min(100, Math.round(sent / limit * 100)) + "%";
      }
      const resultsContainer = document.getElementById("sb-results-list");
      if (resultsContainer) {
        const results = getLastResults();
        const rendered = resultsContainer.children.length;
        if (results.length !== rendered) {
          resultsContainer.innerHTML = results.slice(0, 12).map((r) => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:${r.status === "failed" ? S.dangerBg : S.bg};border:1px solid ${r.status === "failed" ? "#fecaca" : S.border};border-radius:5px;font-size:11px;">
            <span style="flex-shrink:0;font-size:10px;min-width:20px;">${_ackIcon(r.ack ?? -1)}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.status === "failed" ? S.danger : S.text};">
              ${_esc2(r.nombre || "?")}
            </span>
            <span style="font-size:10px;color:${S.muted};flex-shrink:0;">${r.telefono ? "+" + r.telefono : ""}</span>
          </div>
        `).join("");
        }
      }
      const speedEl = document.getElementById("sb-speed");
      if (speedEl && _blastSessionStart) {
        const elapsedMin = Math.max(1, (Date.now() - _blastSessionStart) / 6e4);
        speedEl.textContent = (kpis.sent / elapsedMin).toFixed(1) + " msg/min";
      }
      return;
    }
    el.innerHTML = _contentHTML();
    _bindContentInputs();
    if (!_delegationBound2) {
      _delegationBound2 = true;
      el.addEventListener("click", _handleDelegatedClick);
      el.addEventListener("change", _handleDelegatedChange);
      el.addEventListener("input", _handleDelegatedInput);
    }
  }
  async function _handleDelegatedClick(e) {
    const btn = e.target.closest("button, [data-action]");
    if (!btn) return;
    const id = btn.id;
    const skip = btn.dataset?.skip;
    const markH = btn.dataset?.markhablado;
    const preset = btn.dataset?.preset;
    const tplDel = btn.dataset?.tplDel;
    console.log("[SIDEBAR] delegated click:", id || skip || markH || preset || tplDel || btn.dataset?.audioSend || "?");
    if (id === "sb-refresh") {
      refreshPendingCount();
      fetchGlobalStats();
      _toast3("Actualizando...");
    } else if (id === "sb-excel-clear") {
      clearExcelContacts();
      setExcelContacts([]);
      _renderContent();
    } else if (id === "sb-history-clear") {
      clearHistory();
      _toast3("Historial limpiado");
      _renderContent();
    } else if (id === "sb-start") {
      console.log("[SIDEBAR] sb-start clicked \u2192 loading preview");
      loadPreview();
    } else if (id === "sb-preview-confirm") {
      previewConfirm();
    } else if (id === "sb-preview-cancel") {
      previewCancel();
    } else if (id === "sb-pause") {
      pauseBlast();
    } else if (id === "sb-resume") {
      resumeBlast();
    } else if (id === "sb-reset") {
      resetSession();
      refreshPendingCount();
      _renderContent();
    } else if (id === "sb-tpl-add") {
      const t = getTemplates();
      t.push(`[Hola|Buenas|Buenas tardes] {{nombre}} \xBF[c\xF3mo est\xE1s?|todo bien?|c\xF3mo te va?]
---
[Mensaje ${t.length + 1} \u2014 edit\xE1 este bloque]`);
      setTemplates(t);
      _renderContent();
    } else if (id === "sb-open-validator") {
      toggleValidatorPanel();
    } else if (preset) {
      const n = Number(preset);
      setConfig({ batchSize: n });
      const inp = document.querySelector('[data-cfg="batchSize"]');
      if (inp) inp.value = n;
      document.querySelectorAll("[data-preset]").forEach((b) => {
        const active = Number(b.dataset.preset) === n;
        b.style.borderColor = active ? S.accent : S.border;
        b.style.background = active ? S.accentBg : S.bg;
        b.style.color = active ? S.accent : S.muted;
      });
      const startBtn = $2("sb-start");
      if (startBtn) startBtn.textContent = `\u25B6 Enviar a ${n} personas`;
    } else if (id && id.startsWith("sb-limit-")) {
      const n = Number(id.replace("sb-limit-", ""));
      setBlastLimit(n);
      _renderContent();
    } else if (btn.dataset?.limit !== void 0) {
      const n = Number(btn.dataset.limit);
      setBlastLimit(n);
      _renderContent();
    } else if (tplDel !== void 0) {
      const t = getTemplates();
      if (t.length > 1) {
        t.splice(Number(tplDel), 1);
        setTemplates(t);
        _renderContent();
      }
    } else if (btn.dataset?.previewSkip) {
      previewSkipContact(btn.dataset.previewSkip);
    } else if (btn.dataset?.previewHablado) {
      const hId = btn.dataset.previewHablado;
      btn.disabled = true;
      btn.textContent = "\u23F3";
      previewMarkHabladoAndReplace(hId);
    }
  }
  function _handleDelegatedChange(e) {
    const inp = e.target.closest("[data-cfg]");
    if (!inp) return;
    const v = Math.max(Number(inp.min || 1), Math.min(Number(inp.max || 9999), Number(inp.value)));
    inp.value = v;
    setConfig({ [inp.dataset.cfg]: v });
    if (inp.dataset.cfg === "batchSize") {
      document.querySelectorAll("[data-preset]").forEach((b) => {
        const active = Number(b.dataset.preset) === v;
        b.style.borderColor = active ? S.accent : S.border;
        b.style.background = active ? S.accentBg : S.bg;
        b.style.color = active ? S.accent : S.muted;
      });
      const startBtn = $2("sb-start");
      if (startBtn) startBtn.textContent = `\u25B6 Enviar a ${v} personas`;
    }
  }
  function _handleDelegatedInput(e) {
    const tpl = e.target.closest("[data-tpl]");
    if (tpl) {
      const idx = Number(tpl.dataset.tpl);
      const t = getTemplates();
      t[idx] = tpl.value;
      setTemplates(t);
      const preview = document.getElementById("sb-tpl-preview-" + idx);
      if (preview) {
        const fakeParts = _previewSpin(tpl.value);
        if (fakeParts.length === 1) {
          preview.textContent = "\u25B6 " + fakeParts[0].slice(0, 80) + (fakeParts[0].length > 80 ? "\u2026" : "");
        } else {
          preview.innerHTML = fakeParts.map(
            (p, i) => `<span style="display:block;margin-bottom:1px;">\u2709\uFE0F ${i + 1}: ${_esc2(p.slice(0, 60))}${p.length > 60 ? "\u2026" : ""}</span>`
          ).join("");
        }
      }
    }
  }
  function _bindContentInputs() {
    document.querySelectorAll("[data-tpl]").forEach((ta) => {
      const idx = Number(ta.dataset.tpl);
      const preview = document.getElementById("sb-tpl-preview-" + idx);
      if (preview) {
        const fakeParts = _previewSpin(ta.value);
        if (fakeParts.length === 1) {
          preview.textContent = "\u25B6 " + fakeParts[0].slice(0, 80) + (fakeParts[0].length > 80 ? "\u2026" : "");
        } else {
          preview.innerHTML = fakeParts.map(
            (p, i) => `<span style="display:block;margin-bottom:1px;">\u2709\uFE0F ${i + 1}: ${_esc2(p.slice(0, 60))}${p.length > 60 ? "\u2026" : ""}</span>`
          ).join("");
        }
      }
    });
    const excelInput = document.getElementById("sb-excel-input");
    if (excelInput) {
      excelInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          _toast3("Cargando Excel...");
          const result = await parseExcelFile(file);
          setExcelContacts(result.contacts);
          _toast3(`\u2705 ${result.contacts.length} contactos cargados`);
          _renderContent();
        } catch (err) {
          _toast3("\u274C " + (err || "Error al cargar"));
          _renderContent();
        }
      });
    }
    const dropzone = document.getElementById("sb-excel-dropzone");
    if (dropzone) {
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.style.borderColor = S.accent;
        dropzone.style.background = S.accentBg;
      });
      dropzone.addEventListener("dragleave", () => {
        dropzone.style.borderColor = S.border;
        dropzone.style.background = "transparent";
      });
      dropzone.addEventListener("drop", async (e) => {
        e.preventDefault();
        dropzone.style.borderColor = S.border;
        dropzone.style.background = "transparent";
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        try {
          _toast3("Cargando Excel...");
          const result = await parseExcelFile(file);
          setExcelContacts(result.contacts);
          _toast3(`\u2705 ${result.contacts.length} contactos cargados`);
          _renderContent();
        } catch (err) {
          _toast3("\u274C " + (err || "Error al cargar"));
          _renderContent();
        }
      });
    }
  }
  function _contentHTML() {
    if (_tab === "blast") return _blastHTML();
    if (_tab === "validar") return _validarHTML();
    return "";
  }
  function _bindShell() {
    $2("sb-close")?.addEventListener("click", toggleSidebar);
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.addEventListener("click", () => {
        _tab = b.dataset.tab;
        localStorage.setItem(TAB_KEY, _tab);
        _renderSidebar();
        if (_tab === "blast" && !isRunning()) {
          refreshPendingCount();
          fetchGlobalStats();
        }
      });
    });
  }
  function _blastHTML() {
    const cfg2 = getConfig();
    const tpls2 = getTemplates();
    const running = isRunning();
    const paused = isPaused();
    const countdown = getCountdown();
    const phase = getPhase();
    const kpis = getKpis();
    const pending = getTotalPending();
    const results = getLastResults();
    const totalSent = kpis.sent;
    const totalProcessed = totalSent + kpis.failed + kpis.no_wa + kpis.skipped;
    const hasActivity = totalProcessed > 0 || running;
    let timerLabel = "";
    if (countdown > 0) {
      const m = Math.floor(countdown / 60);
      const s = countdown % 60;
      const labels = { prewarm: "\u23F3 Preparando", delay: "\u23F1\uFE0F Pr\xF3ximo", pausa: "\u2615 Pausa", descanso: "\u{1F634} Descanso", cargando: "\u{1F4E5} Cargando", micro: "\u{1FAD6} Micro-pausa" };
      timerLabel = `${labels[phase] || "\u23F1\uFE0F"} ${m > 0 ? m + "m " : ""}${s}s`;
    } else if (phase === "cargando") {
      timerLabel = "\u{1F4E5} Cargando...";
    }
    const tplsHash = tpls2.join("\n");
    if (_cachedTplsHash !== tplsHash) {
      _cachedTplsHash = tplsHash;
      _cachedAnalysis = analyzeTemplates(tpls2);
    }
    const analysis = _cachedAnalysis || { level: "ok", suggestions: [] };
    if (!_blastSessionStart && running) _blastSessionStart = Date.now();
    if (!running) _blastSessionStart = null;
    const sessionStart = _blastSessionStart || Date.now();
    const elapsedMin = Math.max(1, (Date.now() - sessionStart) / 6e4);
    const msgPerMin = totalProcessed > 0 ? (totalSent / elapsedMin).toFixed(1) : "0";
    const estRemaining = pending !== null && totalSent > 0 ? Math.round(pending / (totalSent / elapsedMin)) : null;
    const inWindow = isWithinBlastWindow();
    const peruTime = getPeruTimeStr();
    const ownNum = getOwnNumber();
    const nHealth = getNumberHealth();
    const nAuth = isNumberAuthorized();
    const gs = getGlobalStats();
    const pendingLabel = pending === null ? "..." : pending.toLocaleString("es-PE");
    const hasPending = pending === null || pending > 0;
    const gsTotal = gs?.total_contacts ?? 0;
    const gsHablado = gs?.total_hablado ?? 0;
    const gsPending = gs?.total_pending ?? 0;
    const gsSent = gs?.total_sent ?? 0;
    const gsPct = gsTotal > 0 ? Math.round(gsHablado / gsTotal * 100) : 0;
    const byNum = gs?.by_number ?? {};
    const byNumEntries = Object.entries(byNum).filter(([, v]) => v.today > 0 || v.sent > 0).sort(([, a], [, b]) => b.today - a.today).slice(0, 6);
    return `<div style="padding:14px;display:flex;flex-direction:column;gap:12px;">

    <!-- ESTADO DEL N\xDAMERO -->
    <div style="background:${!ownNum ? S.dangerBg : nAuth === false ? S.warnBg : nHealth && !nHealth.can_send ? S.dangerBg : S.card};border:1px solid ${!ownNum ? "#fecaca" : nAuth === false ? "#fde68a" : S.border};border-radius:10px;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:${nHealth ? "6" : "0"}px;">
        <span style="font-size:16px;">${!ownNum ? "\u274C" : nAuth === false ? "\u{1F6AB}" : "\u{1F4F1}"}</span>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;color:${!ownNum ? S.danger : nAuth === false ? S.warn : S.text};">
            ${!ownNum ? "N\xFAmero no detectado" : nAuth === false ? "N\xFAmero no autorizado" : "+" + ownNum}
          </div>
          <div style="font-size:10px;color:${S.muted};">
            ${!ownNum ? "Recarg\xE1 WhatsApp Web para detectar el celular" : nAuth === false ? "Este celular no est\xE1 registrado para blast" : nAuth === true ? "\u2705 Registrado" : "Verificando..."}
          </div>
        </div>
      </div>
      ${nHealth ? `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:10px;color:${S.muted};margin-top:4px;">
        <div>Hora: <b style="color:${nHealth.sent_last_hour >= nHealth.hourly_limit * 0.8 ? S.danger : S.text};">${nHealth.sent_last_hour}/${nHealth.hourly_limit}</b></div>
        <div>Hoy: <b style="color:${nHealth.sent_today >= nHealth.daily_limit * 0.8 ? S.danger : S.text};">${nHealth.sent_today}/${nHealth.daily_limit}</b></div>
        <div>Edad: <b>${nHealth.age_days}d</b></div>
      </div>
      ` : ""}
    </div>

    <!-- PROGRESO SESI\xD3N -->
    ${hasExcelLoaded() ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.accent};">${(pending !== null ? pending : getExcelContactCount()).toLocaleString("es-PE")}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Pendientes</div>
        </div>
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.text};">${getExcelContactCount().toLocaleString("es-PE")}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Total Excel</div>
        </div>
      </div>
      ${totalSent > 0 ? (() => {
      const xlPct = Math.round(totalSent / getExcelContactCount() * 100);
      return `<div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:4px;">
            <span>Completado</span>
            <span style="font-weight:700;color:${xlPct >= 80 ? S.accent : S.text};">${xlPct}%</span>
          </div>
          <div style="height:6px;background:${S.border};border-radius:3px;overflow:hidden;">
            <div style="height:100%;width:${xlPct}%;background:${xlPct >= 80 ? S.accent : xlPct >= 50 ? S.blue : S.warn};border-radius:3px;transition:width .4s ease;"></div>
          </div>
        </div>`;
    })() : ""}
    </div>
    ` : ""}

    <!-- KPIs -->
    ${hasActivity ? `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
      ${[
      ["\u2713", kpis.sent, "Enviado", "#6b7280", "sent"],
      ["\u2717", kpis.failed, "Fallidos", S.danger, "failed"],
      ["\u{1F4F5}", kpis.no_wa, "Sin WA", "#9ca3af", "no_wa"],
      ["\u23ED", kpis.skipped, "Saltados", S.muted, "skipped"]
    ].map(([icon, val, label, color, key]) => `
        <div style="background:${S.card};border:1px solid ${S.border};border-radius:8px;padding:8px 4px;text-align:center;">
          <div data-kpi="${key}" style="font-size:16px;font-weight:800;color:${color};">${val}</div>
          <div style="font-size:9px;color:${S.muted};margin-top:2px;">${icon} ${label}</div>
        </div>
      `).join("")}
    </div>
    ` : ""}

    <!-- PROGRESS BAR (cuando hay l\xEDmite activo) -->
    ${(() => {
      const limit = getBlastLimit();
      const sent = getSessionSent();
      if (!running || limit === 0) return "";
      const pct = Math.min(100, Math.round(sent / limit * 100));
      const done = sent >= limit;
      return `
      <div style="background:${done ? S.accentBg : S.card};border:1px solid ${done ? "rgba(37,211,102,0.3)" : S.border};border-radius:10px;padding:12px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-bottom:6px;">
          <span style="color:${done ? S.accent : S.text};">${done ? "\u2705 L\xEDmite alcanzado" : "\u{1F4E4} Enviando..."}</span>
          <span><span id="sb-session-sent">${sent}</span> / ${limit}</span>
        </div>
        <div style="height:8px;background:${S.border};border-radius:4px;overflow:hidden;">
          <div id="sb-limit-pct" style="height:100%;width:${pct}%;background:${done ? S.accent : "#3b82f6"};border-radius:4px;transition:width .3s ease;"></div>
        </div>
        ${done ? `<div style="font-size:10px;color:${S.muted};margin-top:6px;text-align:center;">Listo \u2014 par\xE1 o inici\xE1 otra tanda</div>` : ""}
      </div>`;
    })()}


    <!-- STEALTH STATS (solo con actividad) -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Sesi\xF3n actual</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;">
        <div><span style="color:${S.muted};">Velocidad</span><br><b id="sb-speed">${msgPerMin} msg/min</b></div>
        <div><span style="color:${S.muted};">Est. restante</span><br><b>${estRemaining !== null ? estRemaining > 60 ? Math.round(estRemaining / 60) + "h" : estRemaining + " min" : "\u2014"}</b></div>
        <div><span style="color:${S.muted};">Plantilla</span><br><b>#${getTplIndex() % tpls2.length + 1} de ${tpls2.length}</b></div>
      </div>
      ${(() => {
      const spam = getLastSpamResult();
      if (!spam || spam.riskLevel === "low" || !spam.score) return "";
      const isHigh = spam.riskLevel === "critical" || spam.riskLevel === "high";
      const color = isHigh ? S.danger : S.warn;
      const bg = isHigh ? S.dangerBg : S.warnBg;
      return `
        <div style="margin-top:8px;background:${bg};border:1px solid ${isHigh ? "#fecaca" : "#fde68a"};border-radius:8px;padding:8px 10px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="font-size:12px;">${isHigh ? "\u{1F6A8}" : "\u26A0\uFE0F"}</span>
            <span style="font-size:11px;font-weight:700;color:${color};">Spam: ${spam.riskLevel.toUpperCase()} (${spam.score}/100)</span>
          </div>
          ${spam.warnings.slice(0, 3).map((w) => `<div style="font-size:10px;color:${S.muted};padding-left:20px;">\u25CF ${_esc2(w)}</div>`).join("")}
          ${spam.actions.length ? spam.actions.slice(0, 2).map((a) => `<div style="font-size:10px;color:${color};padding-left:20px;font-weight:600;">\u2192 ${_esc2(a)}</div>`).join("") : ""}
          ${spam.repeatedTexts?.length ? `
            <div style="margin-top:6px;padding-left:20px;">
              <div style="font-size:9px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Mensajes repetidos:</div>
              ${spam.repeatedTexts.slice(0, 3).map((rt) => `
                <div style="font-size:10px;color:${S.muted};padding:3px 6px;margin-bottom:2px;background:rgba(0,0,0,0.03);border-radius:4px;border-left:2px solid ${color};">
                  <span style="color:${color};font-weight:600;">${rt.count}x</span> "${_esc2(rt.text.length > 80 ? rt.text.slice(0, 80) + "\u2026" : rt.text)}"
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>`;
    })()}
    </div>
    ` : ""}

    <!-- TEMPLATE RISK ANALYSIS -->
    ${analysis.score > 0 ? `
    <div style="background:${analysis.level === "danger" ? S.dangerBg : analysis.level === "warning" ? S.warnBg : S.card};border:1px solid ${analysis.level === "danger" ? "#fecaca" : analysis.level === "warning" ? "#fde68a" : S.border};border-radius:10px;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:14px;">${analysis.level === "danger" ? "\u{1F6A8}" : analysis.level === "warning" ? "\u26A0\uFE0F" : "\u2705"}</span>
        <div>
          <div style="font-size:11px;font-weight:700;color:${analysis.level === "danger" ? S.danger : analysis.level === "warning" ? S.warn : S.accent};">
            Riesgo: ${analysis.level === "danger" ? "ALTO" : analysis.level === "warning" ? "MEDIO" : "BAJO"} (${analysis.score} pts)
          </div>
        </div>
      </div>
      ${analysis.suggestions.length ? `
      <div style="display:flex;flex-direction:column;gap:3px;">
        ${analysis.suggestions.slice(0, 4).map((s) => `
          <div style="font-size:10px;color:${S.muted};padding-left:22px;">\u2192 ${_esc2(s)}</div>
        `).join("")}
      </div>
      ` : ""}
    </div>
    ` : ""}

    <!-- L\xCDMITE -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">\xBFCu\xE1ntos envi\xE1s?</div>
      <div style="display:flex;gap:5px;margin-bottom:6px;flex-wrap:wrap;">
        ${[25, 50, 75, 100].map((n) => `
          <button data-limit="${n}" style="
            flex:1;min-width:50px;padding:8px 4px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;
            border:2px solid ${getBlastLimit() === n ? S.accent : S.border};
            background:${getBlastLimit() === n ? S.accentBg : S.bg};
            color:${getBlastLimit() === n ? S.accent : S.muted};
            transition:all .15s;
          ">${n}</button>
        `).join("")}
        <button data-limit="0" title="Hasta que acaben o lo pares" style="
          flex:1;min-width:50px;padding:8px 4px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;
          border:2px solid ${getBlastLimit() === 0 ? S.accent : S.border};
          background:${getBlastLimit() === 0 ? S.accentBg : S.bg};
          color:${getBlastLimit() === 0 ? S.accent : S.muted};
          transition:all .15s;
        ">\u221E</button>
      </div>
      ${getBlastLimit() === 0 ? `<div style="font-size:10px;color:${S.muted};text-align:center;">Loop infinito \u2014 par\xE1 vos cuando quieras</div>` : ""}
    </div>

    <!-- ANTI-BAN CONFIG -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:11px;font-weight:700;color:${S.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">
        Anti-ban \xB7 Pausa entre tandas
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div>
          <label style="font-size:10px;color:${S.muted};display:block;margin-bottom:2px;">Msgs por tanda</label>
          <input type="number" data-cfg="burstSize" value="${cfg2.burstSize || 12}" min="5" max="30" style="
            width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid ${S.border};
            border-radius:6px;background:${S.bg};color:${S.text};font-size:13px;font-weight:600;
            outline:none;text-align:center;
          " />
        </div>
        <div>
          <label style="font-size:10px;color:${S.muted};display:block;margin-bottom:2px;">Descanso (seg)</label>
          <input type="number" data-cfg="burstRestSec" value="${cfg2.burstRestSec || 90}" min="30" max="300" style="
            width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid ${S.border};
            border-radius:6px;background:${S.bg};color:${S.text};font-size:13px;font-weight:600;
            outline:none;text-align:center;
          " />
        </div>
      </div>
      <div style="font-size:10px;color:${S.muted};margin-top:4px;">Cada ${cfg2.burstSize || 12} msgs \u2192 pausa de ${cfg2.burstRestSec || 90}s + variaci\xF3n aleatoria</div>
    </div>

    <!-- EXCEL UPLOAD -->
    <div style="background:${S.card};border:1px solid ${hasExcelLoaded() ? S.accent : S.border};border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:700;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;">
          \u{1F4C4} Contactos desde Excel
        </div>
        ${getHistoryCount() > 0 ? `<span style="font-size:10px;color:${S.muted};background:${S.bg};padding:2px 6px;border-radius:4px;border:1px solid ${S.border};">${getHistoryCount()} enviados antes</span>` : ""}
      </div>
      ${hasExcelLoaded() ? `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${S.accentBg};border:1px solid ${S.accent}30;border-radius:8px;">
          <span style="font-size:18px;">\u2705</span>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:${S.accent};">${getExcelContactCount()} contactos nuevos</div>
            <div style="font-size:10px;color:${S.muted};">${_esc2(getExcelFileName() || "archivo.xlsx")}</div>
          </div>
          <button id="sb-excel-clear" style="padding:4px 8px;border-radius:6px;border:1px solid ${S.danger}40;background:${S.dangerBg};color:${S.danger};font-size:10px;font-weight:700;cursor:pointer;">\u2715</button>
        </div>
        ${getExcelFilteredCount() > 0 ? `
        <div style="font-size:10px;color:${S.warn};margin-top:6px;padding:6px 8px;background:${S.warnBg};border:1px solid ${S.warn}20;border-radius:6px;">
          \u26A0\uFE0F ${getExcelFilteredCount()} contactos ya enviados antes fueron excluidos autom\xE1ticamente
        </div>` : ""}
      ` : `
        <label id="sb-excel-dropzone" style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
          padding:16px;border:2px dashed ${S.border};border-radius:10px;cursor:pointer;
          transition:border-color .15s, background .15s;
        ">
          <span style="font-size:28px;">\u{1F4C1}</span>
          <span style="font-size:12px;font-weight:600;color:${S.text};">Subir archivo Excel</span>
          <span style="font-size:10px;color:${S.muted};">.xlsx, .xls o .csv \u2014 con columna de tel\xE9fono y nombre</span>
          <input type="file" id="sb-excel-input" accept=".xlsx,.xls,.csv" style="display:none;" />
        </label>
        ${getExcelError() ? `<div style="font-size:10px;color:${S.danger};margin-top:6px;padding:6px 8px;background:${S.dangerBg};border-radius:6px;">\u274C ${_esc2(getExcelError())}</div>` : ""}
      `}
      ${getHistoryCount() > 0 ? `
      <div style="margin-top:6px;text-align:right;">
        <button id="sb-history-clear" style="padding:3px 8px;border-radius:5px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:10px;cursor:pointer;">Limpiar historial (${getHistoryCount()})</button>
      </div>` : ""}
    </div>

    <!-- PLANTILLAS -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <span style="font-size:12px;font-weight:700;">Mensajes (${tpls2.length})</span>
          ${tpls2.length > 1 ? `<span style="
            margin-left:8px;font-size:10px;font-weight:700;
            background:${S.accentBg};color:${S.accent};
            padding:2px 7px;border-radius:10px;
          ">pr\xF3xima: #${getTplIndex() % tpls2.length + 1}</span>` : ""}
        </div>
        ${tpls2.length < 5 ? `<button id="sb-tpl-add" style="${_smallBtn(S.accent, S.accentBg)}">+ Nuevo</button>` : ""}
      </div>

      <!-- Hint de sintaxis -->
      <div style="background:rgba(37,211,102,0.06);border:1px solid rgba(37,211,102,0.15);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:11px;color:${S.muted};line-height:1.8;">
        <div style="color:${S.accent};font-weight:700;margin-bottom:4px;">Sintaxis de variaciones</div>
        <div><code style="color:${S.accent};background:rgba(37,211,102,0.1);padding:1px 5px;border-radius:3px;font-weight:600;">[Hola!|Buenas!|Qu\xE9 tal!]</code> \u2192 elige una al azar</div>
        <div><code style="color:${S.accent};background:rgba(37,211,102,0.1);padding:1px 5px;border-radius:3px;font-weight:600;">---</code> \u2192 corte: env\xEDa como mensaje separado</div>
        <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;">
          ${["{{nombre}}", "{{brigadista}}", "{{departamento}}", "{{distrito}}", "{{saludo}}", "{{cierre}}", "{{emoji}}", "{{fecha}}"].map(
      (v) => `<code style="color:${S.accent};background:rgba(37,211,102,0.08);padding:1px 5px;border-radius:3px;">${v}</code>`
    ).join("")}
        </div>
      </div>

      ${tpls2.map((t, i) => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:10px;color:${S.muted};font-weight:600;">MENSAJE ${i + 1}</span>
            ${tpls2.length > 1 ? `<button data-tpl-del="${i}" style="background:none;border:none;color:${S.danger};cursor:pointer;font-size:11px;padding:2px 4px;">\u2715 Borrar</button>` : ""}
          </div>
          <textarea data-tpl="${i}" rows="5" style="
            width:100%;box-sizing:border-box;border:1px solid ${S.border};border-radius:8px;background:${S.bg};
            color:${S.text};font-size:12px;padding:10px;line-height:1.6;
            font-family:inherit;resize:vertical;outline:none;
          ">${_esc2(t)}</textarea>
          <div id="sb-tpl-preview-${i}" style="margin-top:4px;font-size:10px;color:${S.muted};line-height:1.5;font-style:italic;min-height:14px;"></div>
        </div>
      `).join("")}

    </div>

    <!-- TIMER + LOG -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      ${timerLabel ? `<div id="sb-timer-label" style="font-size:12px;color:${S.accent};font-weight:600;margin-bottom:8px;">${timerLabel}</div>` : '<div id="sb-timer-label" style="display:none"></div>'}
      ${results.length ? `
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">\xDAltimos enviados</div>
      <div id="sb-results-list" style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        ${results.slice(0, 12).map((r) => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:${r.status === "failed" ? S.dangerBg : S.bg};border:1px solid ${r.status === "failed" ? "#fecaca" : S.border};border-radius:5px;font-size:11px;">
            <span style="flex-shrink:0;font-size:10px;min-width:20px;">${_ackIcon(r.ack ?? -1)}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.status === "failed" ? S.danger : S.text};">
              ${_esc2(r.nombre || "?")}
            </span>
            <span style="font-size:10px;color:${S.muted};flex-shrink:0;">${r.telefono ? "+" + r.telefono : ""}</span>
          </div>
        `).join("")}
      </div>
      ` : ""}
      ${!running && totalProcessed > 0 ? `
        <button id="sb-reset" style="margin-top:8px;width:100%;padding:6px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:11px;cursor:pointer;">Limpiar sesi\xF3n</button>
      ` : ""}
    </div>
    ` : ""}

    <!-- PREVIEW DE CONTACTOS -->
    ${(() => {
      const pvLoading = isPreviewLoading();
      const pvReady = isPreviewReady();
      const pvContacts = getPreviewContacts();
      const pvSkipped = getPreviewSkipped();
      const pvHasContacts = getPreviewContacts().length > 0;
      if (pvLoading) {
        return `
        <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:20px;text-align:center;">
          <div style="font-size:24px;margin-bottom:8px;">${pvHasContacts ? "\u{1F50D}" : "\u{1F4E5}"}</div>
          <div style="font-size:13px;font-weight:600;color:${S.text};">${pvHasContacts ? "Verificando " + getPreviewContacts().length + " contactos..." : "Cargando contactos..."}</div>
          <div style="font-size:11px;color:${S.muted};margin-top:4px;">${pvHasContacts ? "Comprobando si tienen WA y si ya los tenemos agendados" : "Preparando preview"}</div>
        </div>`;
      }
      if (pvReady && pvContacts.length > 0) {
        const pvFlags = getPreviewFlags();
        const active = pvContacts.filter((c) => !pvSkipped.has(c.id));
        const flaggedInContacts = pvContacts.filter((c) => pvFlags.get(c.id)?.inContacts).length;
        const flaggedNoWA = pvContacts.filter((c) => pvFlags.get(c.id)?.noWA === true).length;
        const byDepto = {};
        const byBrig = {};
        for (const c of active) {
          const d = c.departamento || c.distrito || "Sin depto";
          const b = c.encuestador || "Sin brigadista";
          byDepto[d] = (byDepto[d] || 0) + 1;
          byBrig[b] = (byBrig[b] || 0) + 1;
        }
        const deptoEntries = Object.entries(byDepto).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const brigEntries = Object.entries(byBrig).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return `
        <div style="background:${S.card};border:2px solid ${S.accent};border-radius:10px;padding:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div>
              <div style="font-size:13px;font-weight:700;color:${S.accent};">\u{1F4CB} Preview: ${active.length} contactos</div>
              <div style="font-size:10px;color:${S.muted};">
                ${pvSkipped.size > 0 ? pvSkipped.size + " saltados \xB7 " : ""}
                ${flaggedInContacts > 0 ? `<span style="color:${S.warn};">${flaggedInContacts} agendados</span> \xB7 ` : ""}
                ${flaggedNoWA > 0 ? `<span style="color:${S.danger};">${flaggedNoWA} sin WA</span> \xB7 ` : ""}
                Revis\xE1 antes de enviar
              </div>
            </div>
            <button id="sb-preview-cancel" style="padding:4px 10px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:11px;cursor:pointer;">\u2715</button>
          </div>

          <!-- Resumen por departamento -->
          ${deptoEntries.length > 1 ? `
          <div style="margin-bottom:8px;">
            <div style="font-size:10px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Por departamento</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${deptoEntries.map(([d, n]) => `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${S.blueBg};color:${S.blue};font-weight:600;">${_esc2(d)} (${n})</span>`).join("")}
            </div>
          </div>` : ""}

          <!-- Resumen por brigadista -->
          ${brigEntries.length > 1 ? `
          <div style="margin-bottom:8px;">
            <div style="font-size:10px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Por brigadista</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${brigEntries.map(([b, n]) => `<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${S.warnBg};color:${S.warn};font-weight:600;">${_esc2(b.split(" ")[0])} (${n})</span>`).join("")}
            </div>
          </div>` : ""}

          <!-- Lista de contactos -->
          <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;margin-bottom:10px;">
            ${pvContacts.map((c) => {
          const skipped = pvSkipped.has(c.id);
          const flags = pvFlags.get(c.id) || {};
          const msgParts = getPreviewMessage(c.id);
          const msgPreview = msgParts.length ? msgParts[0].slice(0, 80) + (msgParts[0].length > 80 ? "\u2026" : "") : "\u2014";
          const nombre = ((c.nombre || "") + " " + (c.apellidos || "")).trim() || "\u2014";
          const isInContacts = flags.inContacts;
          const isNoWA = flags.noWA === true;
          const hasProblem = isInContacts || isNoWA;
          const borderColor = skipped ? "#fecaca" : isNoWA ? "#fecaca" : isInContacts ? "#fde68a" : S.border;
          const bgColor = skipped ? S.dangerBg : isNoWA ? S.dangerBg : isInContacts ? S.warnBg : S.bg;
          return `
              <div style="padding:6px 8px;background:${bgColor};border:1px solid ${borderColor};border-radius:6px;opacity:${skipped ? "0.4" : "1"};transition:opacity .15s;">
                <div style="display:flex;align-items:center;gap:5px;">
                  <!-- Toggle skip -->
                  <button data-preview-skip="${c.id}" title="${skipped ? "Incluir de nuevo" : "Saltar este contacto"}" style="width:20px;height:20px;border-radius:4px;border:1px solid ${skipped ? S.danger : S.border};background:${skipped ? S.danger : S.bg};color:${skipped ? "#fff" : S.muted};font-size:10px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;">${skipped ? "\u2715" : "\u2713"}</button>
                  <!-- Contact info -->
                  <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:4px;">
                      <span style="font-size:11px;font-weight:600;color:${S.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${_esc2(nombre)}</span>
                      ${isInContacts ? `<span style="font-size:8px;padding:1px 5px;border-radius:8px;background:${S.warnBg};color:${S.warn};font-weight:700;flex-shrink:0;border:1px solid #fde68a;">AGENDADO</span>` : ""}
                      ${isNoWA ? `<span style="font-size:8px;padding:1px 5px;border-radius:8px;background:${S.dangerBg};color:${S.danger};font-weight:700;flex-shrink:0;border:1px solid #fecaca;">SIN WA</span>` : ""}
                      <span style="font-size:10px;color:${S.muted};flex-shrink:0;">+${_esc2(c.telefono || "")}</span>
                    </div>
                    <div style="font-size:10px;color:${S.muted};margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc2(msgPreview)}">\u{1F4AC} ${_esc2(msgPreview)}</div>
                    ${c.encuestador ? `<div style="font-size:9px;color:${S.blue};margin-top:1px;">\u{1F464} ${_esc2(c.encuestador)} \xB7 ${_esc2(c.departamento || c.distrito || "")}</div>` : ""}
                  </div>
                  <!-- Mark hablado + replace button -->
                  ${!skipped ? `<button data-preview-hablado="${c.id}" title="Ya habl\xE9 \u2014 marcar y reemplazar" style="padding:2px 6px;border-radius:4px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:9px;cursor:pointer;flex-shrink:0;white-space:nowrap;">Ya habl\xE9</button>` : ""}
                </div>
              </div>`;
        }).join("")}
          </div>

          <!-- Botones confirmar/cancelar -->
          <div style="display:flex;gap:8px;">
            <button id="sb-preview-confirm" style="
              flex:1;padding:12px;border-radius:10px;border:none;
              background:${active.length > 0 ? S.accent : S.muted};color:#fff;font-size:14px;font-weight:700;cursor:pointer;
              box-shadow:${active.length > 0 ? "0 2px 12px " + S.accent + "40" : "none"};
              ${active.length === 0 ? "pointer-events:none;opacity:0.5;" : ""}
            ">\u2705 Confirmar y enviar (${active.length})</button>
          </div>
          <div style="font-size:10px;color:${S.muted};text-align:center;margin-top:6px;">
            \u2713 = saltar \xB7 "Ya habl\xE9" = marcar hablado + traer otro contacto
          </div>
        </div>`;
      }
      return "";
    })()}

    <!-- CONTROLES -->
    ${!running && !paused && hasExcelLoaded() && !isPreviewReady() && !isPreviewLoading() ? `
      <button id="sb-start" style="
        width:100%;padding:14px;border-radius:10px;border:none;
        background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 12px ${S.accent}40;
      ">\u{1F4CB} Preview y enviar ${getBlastLimit() === 0 ? "(" + getExcelContactCount() + ")" : getBlastLimit()}</button>
    ` : !running && !paused && !hasExcelLoaded() && !isPreviewReady() && !isPreviewLoading() ? `
      <div style="text-align:center;padding:12px;background:${S.warnBg};border:1px solid ${S.warn}30;border-radius:10px;font-size:13px;color:${S.warn};font-weight:600;">
        \u{1F4C4} Sub\xED un Excel para empezar
      </div>
    ` : running ? `
      <button id="sb-pause" style="
        width:100%;padding:14px;border-radius:10px;border:1px solid ${S.warn}40;
        background:${S.warnBg};color:${S.warn};font-size:15px;font-weight:700;cursor:pointer;
      ">\u23F8 Pausar</button>
    ` : paused && hasExcelLoaded() ? `
      <button id="sb-resume" style="
        width:100%;padding:14px;border-radius:10px;border:none;
        background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 12px ${S.accent}40;
      ">\u25B6 Reanudar</button>
    ` : ""}

  </div>`;
  }
  function _ackIcon(ack) {
    if (ack === -1) return "\u2717";
    if (ack === 0) return "\u{1F550}";
    if (ack === 1) return "\u2713";
    if (ack === 2) return "\u2713\u2713";
    if (ack >= 3) return '<span style="color:#53bdeb;">\u2713\u2713</span>';
    return "\u{1F550}";
  }
  function _smallBtn(color, bg) {
    return `padding:5px 10px;border-radius:6px;border:none;background:${bg};color:${color};font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap`;
  }
  function _validarHTML() {
    return `<div style="padding:40px 20px;text-align:center;">
    <div style="font-size:36px;margin-bottom:12px;">\u2705</div>
    <div style="font-size:14px;font-weight:600;margin-bottom:6px;">Validaci\xF3n de n\xFAmeros</div>
    <div style="font-size:12px;color:${S.muted};margin-bottom:16px;">Verifica qu\xE9 n\xFAmeros tienen WhatsApp activo</div>
    <button id="sb-open-validator" style="
      padding:10px 24px;border-radius:8px;border:none;
      background:${S.blueBg};color:${S.blue};font-size:13px;font-weight:600;cursor:pointer;
    ">Abrir Validador</button>
  </div>`;
  }
  function _previewSpin(tpl) {
    const now = /* @__PURE__ */ new Date();
    const parts = tpl.split(/^[ \t]*---[ \t]*$/m);
    return parts.map((part) => {
      const spun = part.replace(/\[([^\]]+)\]/g, (_, inner) => inner.split("|")[0]);
      return spun.replace(/\{\{nombre\}\}/gi, "Mar\xEDa").replace(/\{\{brigadista\}\}/gi, "Alberto").replace(/\{\{departamento\}\}/gi, "Lambayeque").replace(/\{\{distrito\}\}/gi, "Chiclayo").replace(/\{\{saludo\}\}/gi, "Hola").replace(/\{\{cierre\}\}/gi, "Saludos!").replace(/\{\{emoji\}\}/gi, "\u{1F44B}").replace(/\{\{fecha\}\}/gi, now.toLocaleDateString("es-PE")).replace(/\{\{hora\}\}/gi, now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })).trim();
    }).filter((p) => p.length > 0);
  }
  function _toast3(text, bg = S.accent) {
    const t = document.createElement("div");
    Object.assign(t.style, { position: "fixed", bottom: "80px", left: "50%", transform: "translateX(-50%)", background: bg, color: "#fff", padding: "8px 18px", borderRadius: "8px", fontSize: "12px", fontWeight: "600", zIndex: String(Z.toasts), boxShadow: "0 4px 16px rgba(0,0,0,.2)" });
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3e3);
  }

  // src/inject-entry.js
  if (document.readyState === "complete") {
    setTimeout(tryInstallWAListeners, 5e3);
  } else {
    window.addEventListener("load", () => setTimeout(tryInstallWAListeners, 5e3));
  }
  var _fabRetries = 0;
  var tryInsertFAB = () => {
    if (document.body) insertSidebarFAB();
    else if (++_fabRetries < 30) setTimeout(tryInsertFAB, 1e3);
  };
  setTimeout(tryInsertFAB, 3500);
})();
/*! Bundled license information:

xlsx/xlsx.mjs:
  (*! xlsx.js (C) 2013-present SheetJS -- http://sheetjs.com *)

xlsx/xlsx.mjs:
  (*! sheetjs (C) 2013-present SheetJS -- http://sheetjs.com *)
*/
