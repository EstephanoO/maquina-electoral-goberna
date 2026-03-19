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
      let handleActiveChatChange = function(changedModel) {
        try {
          const active = changedModel?.active === true ? changedModel : ChatCollection._models.find((c) => c.active);
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
    let _lastPlayingState = null;
    function _updateProgress() {
      if (!_previewAudio || !_previewData) {
        _previewRAF = null;
        return;
      }
      const pct = _previewAudio.duration ? _previewAudio.currentTime / _previewAudio.duration * 100 : 0;
      fill.style.width = pct + "%";
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
      let pttBlob = rawBlob;
      try {
        if (pttBlob && typeof pttBlob.url === "function") {
          mediaData.renderableUrl = pttBlob.url();
        }
      } catch (_) {
      }
      L("8 \u2713 renderableUrl set");
      const mdJson = mediaData.toJSON ? mediaData.toJSON() : { ...mediaData };
      delete mdJson.mediaBlob;
      try {
        mediaObject.consolidate(mdJson);
        L("8b \u2713 consolidated");
      } catch (err) {
        L("8b \u26A0 consolidate failed (non-fatal):", err.message);
      }
      if (pttBlob) {
        try {
          const rawBlobObj = typeof pttBlob.blob === "function" ? await pttBlob.blob() : pttBlob;
          if (rawBlobObj) mediaObject.blob = rawBlobObj;
        } catch (_) {
        }
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
      L("9c calling uploadFn with", Object.keys(uploadArgs).join(", "));
      const uploaded = await uploadFn(uploadArgs);
      L("9d uploaded raw", JSON.stringify(uploaded)?.slice(0, 300));
      if (pttBlob && typeof pttBlob.autorelease === "function") pttBlob.autorelease();
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

  // src/inject/template-analyzer.js
  var SPAM_WORDS = [
    "oferta",
    "descuento",
    "gratis",
    "promo",
    "promoci\xF3n",
    "promocion",
    "sorteo",
    "regalo",
    "gana",
    "ganar",
    "premios",
    "premio",
    "click aqu\xED",
    "haz click",
    "compra ya",
    "aprovecha",
    "\xFAltimo d\xEDa",
    "\xFAltimas horas",
    "time limited",
    "oferta limitada"
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
      score += 30;
      signals.push({ points: 30, signal: "Tiene URL/link", suggestion: "Elimin\xE1 el link \u2014 envialo despu\xE9s de que respondan" });
    }
    const emojiCount = _countEmojis(stripped);
    if (emojiCount > 3) {
      score += 10;
      signals.push({ points: 10, signal: `${emojiCount} emojis (>3)`, suggestion: "Reduc\xED los emojis a m\xE1ximo 2-3" });
    }
    const fullText = stripped.replace(/\n---\n/g, " ");
    if (fullText.length > 300) {
      score += 10;
      signals.push({ points: 10, signal: `Texto largo (${fullText.length} chars)`, suggestion: "Reduc\xED a menos de 200 caracteres \u2014 la gente no lee msgs largos de desconocidos" });
    }
    if (!/\{\{nombre\}\}/i.test(tpl)) {
      score += 20;
      signals.push({ points: 20, signal: "Sin personalizaci\xF3n {{nombre}}", suggestion: "Agreg\xE1 {{nombre}} al inicio del saludo \u2014 personalizaci\xF3n = legitimidad" });
    }
    const minOpts = _minSpintaxOptions(tpl);
    const spintaxGroups = (tpl.match(/\[([^\]]+)\]/g) || []).length;
    if (spintaxGroups > 0 && minOpts < 3) {
      score += 10;
      signals.push({ points: 10, signal: `Spintax con pocas opciones (m\xEDn ${minOpts})`, suggestion: "Agreg\xE1 m\xE1s variantes \u2014 m\xEDnimo 3 opciones por cada [...]" });
    }
    const lowerText = stripped.toLowerCase();
    const foundSpam = SPAM_WORDS.filter((w) => lowerText.includes(w));
    if (foundSpam.length) {
      score += 25;
      signals.push({ points: 25, signal: `Palabras spam: ${foundSpam.join(", ")}`, suggestion: 'Evit\xE1 palabras comerciales \u2014 WA penaliza "oferta", "descuento", etc.' });
    }
    if (/\b\d{9,}\b/.test(stripped.replace(/\{\{[^}]+\}\}/g, ""))) {
      score += 15;
      signals.push({ points: 15, signal: "Contiene n\xFAmero de tel\xE9fono", suggestion: "Sac\xE1 el n\xFAmero \u2014 redirecci\xF3n en primer contacto = sospechoso" });
    }
    if (!tpl.includes("---")) {
      score += 5;
      signals.push({ points: 5, signal: "Un solo mensaje (sin ---)", suggestion: "Divid\xED en 2-3 mensajes con --- para parecer m\xE1s natural" });
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
      if (maxSimilarity > 0.7) {
        maxScore += 15;
        allSignals.push({ points: 15, signal: `Plantillas muy similares (${Math.round(maxSimilarity * 100)}%)`, suggestion: "Las plantillas deben ser m\xE1s diferentes entre s\xED \u2014 vari\xE1 estructura, largo y tono" });
      }
    }
    const seenSuggestions = /* @__PURE__ */ new Set();
    const suggestions = [];
    for (const s of allSignals) {
      if (!seenSuggestions.has(s.suggestion)) {
        seenSuggestions.add(s.suggestion);
        suggestions.push(s.suggestion);
      }
    }
    let level = "ok";
    if (maxScore > 40) level = "danger";
    else if (maxScore > 20) level = "warning";
    return {
      score: maxScore,
      level,
      signals: allSignals,
      suggestions,
      perTemplate: analyses
    };
  }

  // src/inject/blast-panel.js
  async function _spamCheck() {
    return new Promise((resolve) => {
      window.postMessage({ type: "WSPP_SPAM_CHECK_NOW" }, WA_ORIGIN);
      const h = (e) => {
        if (e.source !== window || e.data?.type !== "WSPP_SPAM_CHECK_RESULT") return;
        window.removeEventListener("message", h);
        const r = e.data.result;
        resolve({
          shouldPause: r?.risk_level === "critical" || r?.risk_level === "high",
          riskLevel: r?.risk_level || "low",
          score: r?.risk_score || 0,
          warnings: r?.warnings || [],
          actions: r?.actions || [],
          cooldown: r?.cooldown_sec || 0,
          repeatedTexts: r?.repeated_texts || [],
          uniqueRate: r?.unique_rate ?? 100
        });
      };
      window.addEventListener("message", h);
      setTimeout(() => {
        window.removeEventListener("message", h);
        resolve({ shouldPause: false, riskLevel: "low", score: 0, warnings: [], actions: [], cooldown: 0 });
      }, 1500);
    });
  }
  var CFG_KEY = "wspp_blast_cfg_v4";
  var TPL_KEY = "wspp_blast_tpls_v6";
  var DEFAULTS = {
    batchSize: 5,
    // pedir de 5 en 5 — coincide con BULK_SIZE
    delaySec: 2,
    // 2s entre cada mensaje dentro del bulk (sprint rápido)
    prewarmSec: 0,
    // sin prewarm — la pausa de 30s entre bulks es el respiro
    pausaCada: 10,
    pausaSec: 60,
    descansoSec: 300,
    brigadista: ""
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
  var _paused = false;
  var _countdown = 0;
  var _countdownTimer = null;
  var _phase2 = "";
  var _consecFails = 0;
  var _totalPending = null;
  var _onUpdate = null;
  var _kpis = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, no_wa: 0 };
  var _lastResults = [];
  var _trackedMsgs = [];
  var _sentThisSession = /* @__PURE__ */ new Set();
  var _sentIds = /* @__PURE__ */ new Set();
  var _habladoIds = /* @__PURE__ */ new Set();
  function _persistDedup(phone) {
    window.postMessage({ type: "BLAST_DEDUP_ADD", phone }, WA_ORIGIN);
  }
  function _loadPersistedDedup(phones) {
    if (Array.isArray(phones)) {
      for (const p of phones) {
        if (p.includes("-")) {
          _habladoIds.add(p);
          _sentIds.add(p);
        } else {
          _sentThisSession.add(p);
        }
      }
      console.log("[BLAST] Loaded", phones.length, "persisted dedup entries");
    }
  }
  var _dedupReady = false;
  var _dedupReadyResolve = null;
  var _dedupReadyPromise = new Promise((res) => {
    _dedupReadyResolve = res;
  });
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "BLAST_DEDUP_LOADED") {
      _loadPersistedDedup(e.data.phones || []);
      if (!_dedupReady) {
        _dedupReady = true;
        _dedupReadyResolve?.();
      }
    }
  });
  window.postMessage({ type: "BLAST_DEDUP_REQUEST" }, WA_ORIGIN);
  setTimeout(() => {
    if (!_dedupReady) {
      _dedupReady = true;
      _dedupReadyResolve?.();
    }
  }, 3e3);
  var _inFlight = /* @__PURE__ */ new Set();
  var _respondedPhones = /* @__PURE__ */ new Set();
  var _tplIndex = 0;
  var _sessionSent = 0;
  var _previewContacts = [];
  var _previewSkipped = /* @__PURE__ */ new Set();
  var _previewLoading = false;
  var _previewReady = false;
  function getPreviewContacts() {
    return _previewContacts;
  }
  function isPreviewLoading() {
    return _previewLoading;
  }
  function isPreviewReady() {
    return _previewReady;
  }
  async function fetchPreview(n = 5) {
    console.log("[BLAST] fetchPreview start, n:", n);
    _previewLoading = true;
    _previewReady = false;
    _previewContacts = [];
    _previewSkipped.clear();
    _notify();
    try {
      const raw = await _fetchBatch(n * 4);
      console.log("[BLAST] fetchPreview raw:", raw.length, "contacts");
      const filtered = [];
      for (const c of raw) {
        if (c.id && !_habladoIds.has(c.id) && !_sentIds.has(c.id)) {
          filtered.push(c);
          if (filtered.length >= n) break;
        }
      }
      _previewContacts = filtered;
      console.log("[BLAST] fetchPreview filtered:", filtered.length, "contacts");
    } catch (err) {
      console.error("[BLAST] fetchPreview error:", err);
      _previewContacts = [];
    }
    _previewLoading = false;
    _notify();
  }
  var _previewBuffer = [];
  async function _fetchOneNew() {
    if (!_previewBuffer.length) {
      _previewBuffer = await _fetchBatch(20);
    }
    const currentIds = new Set(_previewContacts.map((c) => c.id));
    while (_previewBuffer.length) {
      const c = _previewBuffer.shift();
      if (c.id && !_habladoIds.has(c.id) && !_sentIds.has(c.id) && !currentIds.has(c.id)) {
        return c;
      }
    }
    return null;
  }
  async function previewMarkHablado(id) {
    _habladoIds.add(id);
    _sentIds.add(id);
    _persistDedup(id);
    const ok = await _markHablado([id], []);
    console.log("[BLAST] previewMarkHablado", id, "ok:", ok);
    _previewContacts = _previewContacts.filter((c) => c.id !== id);
    try {
      const replacement = await _fetchOneNew();
      if (replacement) _previewContacts.push(replacement);
    } catch (_) {
    }
    _notify();
  }
  async function previewSkipAndReplace(id) {
    _habladoIds.add(id);
    _sentIds.add(id);
    _persistDedup(id);
    await _markHablado([id], []);
    _previewContacts = _previewContacts.filter((c) => c.id !== id);
    try {
      const replacement = await _fetchOneNew();
      if (replacement) _previewContacts.push(replacement);
    } catch (_) {
    }
    _notify();
  }
  function previewConfirm() {
    _previewReady = true;
    _notify();
  }
  function previewCancel() {
    _previewContacts = [];
    _previewSkipped.clear();
    _previewLoading = false;
    _previewReady = false;
    _notify();
  }
  var _lastSpamResult = null;
  function getLastSpamResult() {
    return _lastSpamResult;
  }
  var BLOCK_SIZE = 50;
  var BULK_SIZE = 5;
  var BULK_DELAY_MIN = 30;
  var BULK_DELAY_MAX = 30;
  var _checkpoint = null;
  var _checkpointPolling = null;
  var _blockId = null;
  var _blockSent = 0;
  function getCheckpoint() {
    return _checkpoint;
  }
  function getBlockSent() {
    return _blockSent;
  }
  function _newBlockId() {
    return `blk_${Date.now()}_${(getOwnNumber() || "x").slice(-4)}`;
  }
  function _fetchBlockStats(blockId) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve(null);
      }, 8e3);
      function onReply(e) {
        if (e.source !== window || e.data?.type !== "BLAST_BLOCK_STATS_READY") return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        resolve(e.data.ok ? e.data : null);
      }
      window.addEventListener("message", onReply);
      window.postMessage({ type: "BLAST_GET_BLOCK_STATS", block_id: blockId, own_number: getOwnNumber() }, WA_ORIGIN);
    });
  }
  function _stopCheckpointPolling() {
    if (_checkpointPolling) {
      clearInterval(_checkpointPolling);
      _checkpointPolling = null;
    }
  }
  var _loopRunning = false;
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
  function isPaused() {
    return _paused;
  }
  function getCountdown() {
    return _countdown;
  }
  function getPhase() {
    return _phase2;
  }
  function getTotalPending() {
    return _totalPending;
  }
  function getKpis() {
    return { ..._kpis };
  }
  function getLastResults() {
    return _lastResults;
  }
  function setOnUpdate(fn) {
    _onUpdate = fn;
  }
  function getTplIndex() {
    return _tplIndex;
  }
  var _globalStats = null;
  var _globalStatsTimer = null;
  function getGlobalStats() {
    return _globalStats;
  }
  function fetchGlobalStats() {
    window.postMessage({ type: "BLAST_GET_STATS" }, WA_ORIGIN);
  }
  function _startStatsRefresh() {
    if (_globalStatsTimer) return;
    _globalStatsTimer = setInterval(fetchGlobalStats, 3e4);
  }
  function _stopStatsRefresh() {
    if (_globalStatsTimer) {
      clearInterval(_globalStatsTimer);
      _globalStatsTimer = null;
    }
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "BLAST_STATS_READY") return;
    if (e.data.ok && e.data.stats) {
      _globalStats = {
        total_contacts: e.data.stats.total_contacts ?? 0,
        total_sent: e.data.stats.total_sent ?? 0,
        total_pending: e.data.stats.total_pending ?? 0,
        total_failed: e.data.stats.total_failed ?? 0,
        total_no_wa: e.data.stats.total_no_wa ?? 0,
        // hablado = total con cms_status hablado (= total - pending)
        total_hablado: (e.data.stats.total_contacts ?? 0) - (e.data.stats.total_pending ?? 0),
        by_number: e.data.by_number ?? {}
      };
    }
    _notify();
  });
  var _numberHealth = null;
  var _numberAuthorized = null;
  function getNumberHealth() {
    return _numberHealth;
  }
  function isNumberAuthorized() {
    return _numberAuthorized;
  }
  function fetchNumberHealth() {
    const num = getOwnNumber();
    if (!num) {
      _numberHealth = null;
      _numberAuthorized = null;
      _notify();
      return;
    }
    window.postMessage({ type: "BLAST_GET_NUMBER_HEALTH", own_number: num }, WA_ORIGIN);
  }
  function fetchNumberConfig() {
    const num = getOwnNumber();
    if (!num) return;
    window.postMessage({ type: "BLAST_GET_NUMBER_CONFIG", own_number: num }, WA_ORIGIN);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "BLAST_NUMBER_HEALTH_READY") {
      if (e.data.ok) {
        _numberHealth = {
          sent_last_hour: e.data.sent_last_hour ?? 0,
          sent_today: e.data.sent_today ?? 0,
          daily_limit: e.data.daily_limit ?? 200,
          hourly_limit: e.data.hourly_limit ?? 50,
          can_send: e.data.can_send ?? true,
          risk_level: e.data.risk_level ?? "low",
          age_days: e.data.age_days ?? 0,
          warm_up_limit: e.data.warm_up_limit ?? 200
        };
      }
      _notify();
      return;
    }
    if (e.data?.type === "BLAST_NUMBER_CONFIG_READY") {
      _numberAuthorized = e.data.config !== null;
      _notify();
      return;
    }
  });
  function _notify() {
    if (_onUpdate) _onUpdate();
  }
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
  }
  function _pollAcks() {
    let changed = false;
    for (const entry of _trackedMsgs) {
      if (!entry.msgModel) continue;
      const ack = typeof entry.msgModel.get === "function" ? entry.msgModel.get("ack") : entry.msgModel.ack;
      const newAck = Number(ack) || 0;
      if (newAck !== entry.lastAck) {
        const oldKey = _ackToKey(entry.lastAck);
        const newKey = _ackToKey(newAck);
        if (oldKey) _kpis[oldKey] = Math.max(0, _kpis[oldKey] - 1);
        if (newKey) _kpis[newKey] = (_kpis[newKey] || 0) + 1;
        entry.lastAck = newAck;
        const result = _lastResults.find((r) => r.telefono === entry.telefono && r.status !== "failed");
        if (result) result.ack = newAck;
        changed = true;
      }
    }
    const now = Date.now();
    _trackedMsgs = _trackedMsgs.filter((e) => {
      if (e.lastAck >= 3 && now - e.ts > 12e4) return false;
      if (now - e.ts > 6e5) return false;
      return true;
    });
    if (!_trackedMsgs.length) _stopAckTracking();
    if (changed) _notify();
  }
  function _ackToKey(ack) {
    if (ack <= 0) return "pending";
    if (ack === 1) return "sent";
    if (ack === 2) return "delivered";
    if (ack >= 3) return "read";
    return "pending";
  }
  function _trackMessage(msgModel, contactName, telefono) {
    const ack = typeof msgModel.get === "function" ? msgModel.get("ack") : msgModel.ack || 0;
    const key = _ackToKey(Number(ack) || 0);
    _kpis[key] = (_kpis[key] || 0) + 1;
    _trackedMsgs.push({ msgModel, contactName, telefono, lastAck: Number(ack) || 0, ts: Date.now() });
    _startAckTracking();
    _notify();
  }
  var _reqIdCounter = 0;
  function _nextReqId() {
    return "blast_" + ++_reqIdCounter + "_" + Date.now();
  }
  var _pendingRequests = /* @__PURE__ */ new Map();
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "BLAST_FORM_CONTACTS_READY") return;
    const reqId = e.data.reqId;
    if (!reqId) return;
    const pending = _pendingRequests.get(reqId);
    if (!pending) return;
    clearTimeout(pending.timer);
    _pendingRequests.delete(reqId);
    if (e.data.ok) {
      _totalPending = e.data.total ?? _totalPending;
      pending.resolve(e.data.contacts || []);
      _notify();
    } else {
      pending.resolve([]);
    }
  });
  function refreshPendingCount() {
    const reqId = _nextReqId();
    const timer = setTimeout(() => {
      _pendingRequests.delete(reqId);
    }, 1e4);
    _pendingRequests.set(reqId, {
      resolve: (contacts) => {
      },
      timer
    });
    window.postMessage({ type: "BLAST_GET_FORM_CONTACTS", limit: 1, offset: 0, status: "nuevo", brigadista: cfg.brigadista || "", reqId, own_number: getOwnNumber() }, WA_ORIGIN);
  }
  function _fetchBatch(limit) {
    return new Promise((resolve) => {
      const reqId = _nextReqId();
      const timer = setTimeout(() => {
        if (_pendingRequests.has(reqId)) {
          _pendingRequests.delete(reqId);
          resolve([]);
        }
      }, 15e3);
      _pendingRequests.set(reqId, { resolve, timer });
      window.postMessage({ type: "BLAST_GET_FORM_CONTACTS", limit, offset: 0, status: "nuevo", brigadista: cfg.brigadista || "", reqId, own_number: getOwnNumber() }, WA_ORIGIN);
    });
  }
  function _markHablado(ids, no_wa_ids) {
    if (!ids.length && !no_wa_ids?.length) return Promise.resolve(false);
    return new Promise((resolve) => {
      const reqId = "mh_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        console.warn("[BLAST] markHablado timeout \u2014 ids:", ids.length);
        resolve(false);
      }, 8e3);
      function onReply(e) {
        if (e.source !== window || e.data?.type !== "BLAST_MARK_HABLADO_DONE" || e.data.reqId !== reqId) return;
        window.removeEventListener("message", onReply);
        clearTimeout(timer);
        resolve(e.data.ok ?? false);
        setTimeout(fetchGlobalStats, 500);
      }
      window.addEventListener("message", onReply);
      window.postMessage({ type: "BLAST_MARK_HABLADO", ids, no_wa_ids: no_wa_ids ?? [], own_number: getOwnNumber(), reqId }, WA_ORIGIN);
    });
  }
  function _retryNoWa() {
    window.postMessage({ type: "BLAST_RETRY_NO_WA", own_number: getOwnNumber() }, WA_ORIGIN);
  }
  function _reportLog(results) {
    if (results.length) window.postMessage({ type: "BLAST_REPORT_RESULTS", results, own_number: getOwnNumber() }, WA_ORIGIN);
  }
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.data?.type !== "WSPP_INCOMING_MSG") return;
    const phone = (e.data.phone || "").replace(/\D/g, "");
    if (phone && _sentThisSession.has(phone)) {
      _respondedPhones.add(phone);
      console.log("[BLAST] Auto-exclusi\xF3n: contacto respondi\xF3 \u2192", phone);
    }
  });
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
      const chosen = opts[_hashSeed(String(seed + counter), counter) % opts.length];
      counter++;
      return chosen;
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
  function _applyVars(text, c, seed) {
    const rawNombre = ((c.nombre || "") + " " + (c.apellidos || "")).trim().split(/\s+/)[0] || "amigo";
    const nombre = _toTitleCase(rawNombre);
    const rawBrigadista = (c.encuestador || "").trim();
    const brigadista = _toTitleCase(rawBrigadista.split(/\s+/)[0] || "un colaborador");
    const now = /* @__PURE__ */ new Date();
    return text.replace(/\{\{nombre\}\}/gi, nombre).replace(/\{\{brigadista\}\}/gi, brigadista).replace(/\{\{departamento\}\}/gi, _titleCasePhrase((c.departamento || c.distrito || "").trim()) || "tu zona").replace(/\{\{saludo\}\}/gi, SALUDOS[_hashSeed(String(seed), 1) % SALUDOS.length]).replace(/\{\{cierre\}\}/gi, CIERRES[_hashSeed(String(seed), 2) % CIERRES.length]).replace(/\{\{emoji\}\}/gi, EMOJIS[_hashSeed(String(seed), 3) % EMOJIS.length]).replace(/\{\{distrito\}\}/gi, c.distrito || "").replace(/\{\{fecha\}\}/gi, now.toLocaleDateString("es-PE")).replace(/\{\{hora\}\}/gi, now.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }));
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
  function _normalizePhone(tel) {
    const d = String(tel).replace(/\D/g, "");
    if (!d) return null;
    return d.length === 9 ? "51" + d : d;
  }
  async function _checkExistsOnWA(normalizedPhone) {
    try {
      const { USyncQuery } = window.require("WAWebUsync");
      const { USyncUser } = window.require("WAWebUsyncUser");
      if (!USyncQuery || !USyncUser) return null;
      const query = new USyncQuery().withContext("interactive").withContactProtocol().withUser(new USyncUser().withPhone(normalizedPhone));
      const response = await query.execute();
      const item = response?.list?.[0];
      const type = item?.contact?.type;
      if (!type) return null;
      return type === "in";
    } catch (_) {
      return null;
    }
  }
  async function _prewarmChat(jid) {
    const wf = _req("WAWebWidFactory");
    const wid = wf.createWid(jid);
    const coll = _req("WAWebCollections");
    let chat = coll.Chat.get(wid);
    if (chat) return { chat, alreadyInStore: true };
    const FC = _req("WAWebFindChatAction");
    const r = await FC.findOrCreateLatestChat(wid);
    chat = r?.chat ?? r;
    if (!chat) throw new Error("N\xFAmero no existe en WA");
    return { chat, alreadyInStore: false };
  }
  async function _simulateTyping(chat, text) {
    try {
      const csb = _req("WAWebChatStateBridge");
      if (csb.sendChatStateComposing) {
        await csb.sendChatStateComposing(chat.id);
        const typingMs = Math.max(800, Math.min(4e3, text.length * 30));
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
    const key = MsgKey.from({
      fromMe: true,
      remote: chat.id,
      // Wid object — puede ser @lid o @c.us
      id: idStr
      // string hexadecimal
    });
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
  function _gaussianRandom(mean, stddev) {
    let u, v, s;
    do {
      u = Math.random() * 2 - 1;
      v = Math.random() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    return mean + stddev * u * mul;
  }
  function _gaussianDelay(delaySec) {
    const raw = _gaussianRandom(delaySec, delaySec * 0.4);
    return Math.max(5, Math.min(delaySec * 3, Math.round(raw)));
  }
  var _msgsSinceBreak = 0;
  var _nextBreakAt = 3 + Math.floor(Math.random() * 5);
  function _shouldMicroBreak() {
    _msgsSinceBreak++;
    if (_msgsSinceBreak >= _nextBreakAt) {
      _msgsSinceBreak = 0;
      _nextBreakAt = 3 + Math.floor(Math.random() * 5);
      return true;
    }
    return false;
  }
  function _microBreakDuration() {
    return 30 + Math.floor(Math.random() * 61);
  }
  function _getPeruTime() {
    const now = /* @__PURE__ */ new Date();
    const peruOffset = -5 * 60;
    const utc = now.getTime() + now.getTimezoneOffset() * 6e4;
    return new Date(utc + peruOffset * 6e4);
  }
  function _isWithinBlastWindow() {
    const peru = _getPeruTime();
    const day = peru.getDay();
    const hour = peru.getHours();
    const minute = peru.getMinutes();
    const timeDecimal = hour + minute / 60;
    if (day === 0) return false;
    if (day === 6) return timeDecimal >= 9 && timeDecimal < 14;
    return timeDecimal >= 8 && timeDecimal < 20;
  }
  function isWithinBlastWindow() {
    return _isWithinBlastWindow();
  }
  function getPeruTimeStr() {
    const p = _getPeruTime();
    return p.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function _startCountdown(sec, phase) {
    _phase2 = phase;
    _countdown = sec;
    clearInterval(_countdownTimer);
    _countdownTimer = setInterval(() => {
      _countdown = Math.max(0, _countdown - 1);
      const timerEl = document.getElementById("sb-timer-label");
      if (timerEl) {
        const m = Math.floor(_countdown / 60), s = _countdown % 60;
        const labels = { delay: "\u23F1\uFE0F", prewarm: "\u{1F525}", descanso: "\u2615", pausa: "\u23F8\uFE0F", cargando: "\u{1F4E1}", micro: "\u{1F92B}", marcando: "\u2705", checkpoint: "\u23F8 Checkpoint" };
        timerEl.textContent = `${labels[_phase2] || "\u23F1\uFE0F"} ${m > 0 ? m + "m " : ""}${s}s`;
      } else {
        _notify();
      }
      if (_countdown <= 0) clearInterval(_countdownTimer);
    }, 1e3);
  }
  function _stopCountdown() {
    clearInterval(_countdownTimer);
    _countdown = 0;
    _phase2 = "";
  }
  async function startBlast() {
    if (_running) return;
    if (_loopRunning) return;
    if (_previewLoading) return;
    if (!tpls.length || !tpls[0].trim()) return;
    if (!_dedupReady) {
      _phase2 = "cargando";
      _notify();
      await _dedupReadyPromise;
    }
    if (!_previewReady) {
      await fetchPreview(5);
      return;
    }
    _previewContacts = [];
    _previewReady = false;
    const activeNumber = getOwnNumber();
    if (!activeNumber) {
      _lastResults.unshift({ nombre: "\u274C Sin n\xFAmero", telefono: "", status: "blocked", ack: -1, error: "No se detect\xF3 el n\xFAmero de este dispositivo. Recarg\xE1 WhatsApp Web." });
      _notify();
      return;
    }
    if (_numberAuthorized === false) {
      _lastResults.unshift({ nombre: "\u{1F6AB} No autorizado", telefono: "+" + activeNumber, status: "blocked", ack: -1, error: "Este n\xFAmero no est\xE1 registrado como celular de blast. Contact\xE1 al coordinador." });
      _notify();
      return;
    }
    if (_numberHealth && !_numberHealth.can_send) {
      _lastResults.unshift({ nombre: "\u26A0\uFE0F L\xEDmite alcanzado", telefono: "+" + activeNumber, status: "blocked", ack: -1, error: `Hoy: ${_numberHealth.sent_today}/${_numberHealth.daily_limit} msgs. Hora: ${_numberHealth.sent_last_hour}/${_numberHealth.hourly_limit}. Esper\xE1.` });
      _notify();
      return;
    }
    if (!_isWithinBlastWindow()) {
      _lastResults.unshift({ nombre: "\u{1F550} Fuera de horario", telefono: "", status: "blocked", ack: -1, error: "Horario no permitido (" + getPeruTimeStr() + "). Lun-Vie 8-20h, S\xE1b 9-14h, Dom no." });
      _notify();
      return;
    }
    _running = true;
    _paused = false;
    _consecFails = 0;
    _loopRunning = true;
    _msgsSinceBreak = 0;
    _retryNoWa();
    fetchGlobalStats();
    _startStatsRefresh();
    _notify();
    while (_running && !_paused) {
      fetchNumberHealth();
      _phase2 = "cargando";
      _notify();
      const rawBatch = await _fetchBatch(BULK_SIZE);
      const batch = rawBatch.filter((c) => {
        if (c.id && _habladoIds.has(c.id)) {
          console.log("[BLAST] Pre-filtro dedup \u2014 ya procesado:", c.id);
          return false;
        }
        const np = _normalizePhone(c.telefono);
        if (np && _sentThisSession.has(np)) {
          console.log("[BLAST] Pre-filtro dedup \u2014 tel\xE9fono ya enviado:", np);
          return false;
        }
        return true;
      });
      if (!batch.length) {
        _running = false;
        _stopCountdown();
        _notify();
        break;
      }
      const logBatch = [];
      const habladoBatch = [];
      const noWaBatch = [];
      let batchSent = 0;
      const sc = await _spamCheck();
      _lastSpamResult = sc;
      if (sc.shouldPause) {
        _running = false;
        _stopCountdown();
        const reasons = sc.warnings.length ? sc.warnings.slice(0, 3).join(" \xB7 ") : "Patr\xF3n de env\xEDo detectado como spam";
        const whatToDo = sc.actions.length ? "\n\u2192 " + sc.actions.slice(0, 2).join("\n\u2192 ") : "";
        _lastResults.unshift({
          nombre: sc.riskLevel === "critical" ? "\u{1F6A8} RIESGO CR\xCDTICO" : "\u26A0\uFE0F RIESGO ALTO",
          telefono: "",
          status: "failed",
          ack: -1,
          error: `Score: ${sc.score}/100 | ${reasons}${whatToDo}`
        });
        _notify();
        break;
      }
      if (!_blockId) {
        _blockId = _newBlockId();
        _blockSent = 0;
        _checkpoint = null;
      }
      if (_blockSent >= BLOCK_SIZE) {
        _phase2 = "checkpoint";
        _notify();
        while (_running && !_paused) {
          const stats = await _fetchBlockStats(_blockId);
          if (stats) {
            _checkpoint = stats;
            _notify();
          }
          if (_checkpoint?.unlocked_50) break;
          _startCountdown(30, "checkpoint");
          _notify();
          await _sleep(3e4);
          _stopCountdown();
        }
        _blockId = _newBlockId();
        _blockSent = 0;
        _checkpoint = null;
        if (!_running || _paused) break;
      }
      for (let i = 0; i < batch.length && _running && !_paused; i++) {
        const c = batch[i];
        const normalizedPhone = _normalizePhone(c.telefono);
        const jid = normalizedPhone ? normalizedPhone + "@c.us" : null;
        const tpl = tpls[_tplIndex % tpls.length];
        const parts = _spinMessage(tpl, c, _tplIndex);
        const text = parts[0];
        const cName = ((c.nombre || "") + " " + (c.apellidos || "")).trim();
        let status = "sent", error = null;
        const rawNombreCheck = ((c.nombre || "") + " " + (c.apellidos || "")).trim();
        if (!rawNombreCheck) {
          console.log("[BLAST] Skip sin nombre \u2014 tel:", c.telefono);
          if (c.id) {
            _habladoIds.add(c.id);
            habladoBatch.push(c.id);
          }
          if (normalizedPhone) {
            _sentThisSession.add(normalizedPhone);
            _persistDedup(normalizedPhone);
          }
          if (c.id) {
            _sentIds.add(c.id);
            _persistDedup(c.id);
          }
          _lastResults.unshift({ nombre: "\u2014 Sin nombre", telefono: c.telefono, status: "skipped", ack: -1, error: "Sin nombre" });
          if (_lastResults.length > 30) _lastResults.length = 30;
          _notify();
          continue;
        }
        const lockKey = (normalizedPhone || "") + ":" + (c.id || "");
        if (normalizedPhone && _sentThisSession.has(normalizedPhone) || c.id && _sentIds.has(c.id) || lockKey && _inFlight.has(lockKey)) {
          console.log("[BLAST] Dedup local \u2014 ya enviado/en vuelo:", normalizedPhone || c.id);
          continue;
        }
        if (normalizedPhone && _respondedPhones.has(normalizedPhone)) {
          console.log("[BLAST] Auto-exclusi\xF3n \u2014 contacto respondi\xF3:", normalizedPhone);
          continue;
        }
        if (normalizedPhone) {
          _sentThisSession.add(normalizedPhone);
          _persistDedup(normalizedPhone);
        }
        if (c.id) {
          _sentIds.add(c.id);
          _habladoIds.add(c.id);
          _persistDedup(c.id);
        }
        if (lockKey) _inFlight.add(lockKey);
        if (!jid) {
          status = "failed";
          error = "Tel inv\xE1lido";
          _kpis.failed++;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error });
          if (_lastResults.length > 30) _lastResults.length = 30;
          logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber, contact_id: c.id ?? null, block_id: _blockId });
          _notify();
          continue;
        }
        if (normalizedPhone) {
          const hasWA = await _checkExistsOnWA(normalizedPhone);
          if (hasWA === false) {
            _kpis.no_wa = (_kpis.no_wa || 0) + 1;
            _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "no_wa", ack: -1, error: "Sin WhatsApp" });
            if (_lastResults.length > 30) _lastResults.length = 30;
            logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status: "no_wa", error: "Sin WhatsApp", own_number: activeNumber });
            if (c.id) {
              _habladoIds.add(c.id);
              noWaBatch.push(c.id);
            }
            if (lockKey) _inFlight.delete(lockKey);
            _notify();
            continue;
          }
        }
        let chat = null;
        let alreadyInStore = false;
        try {
          const pw = await _prewarmChat(jid);
          chat = pw.chat;
          alreadyInStore = pw.alreadyInStore;
        } catch (err) {
          status = "failed";
          error = err.message;
          _consecFails++;
          _kpis.failed++;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error });
          if (_lastResults.length > 30) _lastResults.length = 30;
          logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber, contact_id: c.id ?? null, block_id: _blockId });
          _notify();
          if (lockKey) _inFlight.delete(lockKey);
          if (_consecFails >= 3) {
            _running = false;
            _stopCountdown();
            _reportLog([...logBatch]);
            break;
          }
          continue;
        }
        if (_running && !_paused && !alreadyInStore && cfg.prewarmSec > 0) {
          _startCountdown(cfg.prewarmSec, "prewarm");
          _notify();
          await _sleep(cfg.prewarmSec * 1e3);
          _stopCountdown();
        }
        if (!_running || _paused) break;
        let msgModel = null;
        try {
          for (let p = 0; p < parts.length && _running && !_paused; p++) {
            const partText = parts[p];
            if (p > 0) {
              const partDelay = 1e3 + Math.random() * 3e3 + p * 500;
              await _sleep(partDelay);
            }
            const partModel = await _sendToChat(chat, partText);
            if (p === 0) {
              msgModel = partModel;
              if (partModel) {
                _trackMessage(partModel, cName, c.telefono);
              } else {
                _kpis.pending++;
              }
            }
          }
          batchSent++;
          _sessionSent++;
          _blockSent++;
          if (batchSent > 0 && batchSent % 5 === 0 && _numberHealth) {
            fetchNumberHealth();
          }
          _tplIndex++;
          _consecFails = 0;
          if (c.id) habladoBatch.push(c.id);
          _lastResults.unshift({
            nombre: cName,
            telefono: c.telefono,
            status: "sent",
            ack: msgModel?.get?.("ack") ?? 0,
            error: null,
            parts: parts.length
          });
        } catch (err) {
          status = "failed";
          error = err.message;
          _consecFails++;
          _kpis.failed++;
          _lastResults.unshift({ nombre: cName, telefono: c.telefono, status: "failed", ack: -1, error });
          if (_consecFails >= 3) {
            _running = false;
            _stopCountdown();
            logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber, contact_id: c.id ?? null, block_id: _blockId });
            _reportLog([...logBatch]);
            break;
          }
        } finally {
          if (lockKey) _inFlight.delete(lockKey);
        }
        if (_lastResults.length > 30) _lastResults.length = 30;
        logBatch.push({ phone: c.telefono, contact_name: cName, message: text, status, error, own_number: activeNumber, contact_id: c.id ?? null, block_id: _blockId });
        _notify();
        if (logBatch.length >= 10) {
          _reportLog([...logBatch]);
          logBatch.length = 0;
        }
        if (_running && !_paused && i < batch.length - 1) {
          if (!_isWithinBlastWindow()) {
            _paused = true;
            _running = false;
            _stopCountdown();
            _lastResults.unshift({ nombre: "\u{1F550} Fuera de horario", telefono: "", status: "paused", ack: -1, error: "Pausa por ventana horaria (" + getPeruTimeStr() + ")" });
            _notify();
            break;
          }
          if (batchSent > 0 && batchSent % BULK_SIZE === 0) {
            const bulkDelay = BULK_DELAY_MIN + Math.floor(Math.random() * (BULK_DELAY_MAX - BULK_DELAY_MIN + 1));
            _startCountdown(bulkDelay, "pausa");
            _notify();
            await _sleep(bulkDelay * 1e3);
            _stopCountdown();
          } else if (_shouldMicroBreak()) {
            const breakSec = _microBreakDuration();
            _startCountdown(breakSec, "micro");
            _notify();
            await _sleep(breakSec * 1e3);
            _stopCountdown();
          } else if (cfg.delaySec > 0) {
            const actual = _gaussianDelay(cfg.delaySec);
            _startCountdown(actual, "delay");
            _notify();
            await _sleep(actual * 1e3);
            _stopCountdown();
          }
        }
      }
      if (habladoBatch.length || noWaBatch.length) {
        _phase2 = "marcando";
        _notify();
        await _markHablado([...habladoBatch], [...noWaBatch]);
        habladoBatch.length = 0;
        noWaBatch.length = 0;
      }
      if (logBatch.length) _reportLog([...logBatch]);
      if (_totalPending !== null) _totalPending = Math.max(0, _totalPending - batchSent);
      _notify();
      if (!_running || _paused) break;
      _startCountdown(5, "cargando");
      _notify();
      await _sleep(5e3);
      _stopCountdown();
    }
    _running = false;
    _loopRunning = false;
    _stopCountdown();
    _stopStatsRefresh();
    fetchGlobalStats();
    _notify();
  }
  function pauseBlast() {
    _paused = true;
    _running = false;
    _stopCountdown();
    _notify();
  }
  function resumeBlast() {
    if (_loopRunning) return;
    _paused = false;
    startBlast();
  }
  function resetSession() {
    _sentThisSession.clear();
    _sentIds.clear();
    _habladoIds.clear();
    _inFlight.clear();
    delete window.__blastSessionStart;
    _previewBuffer = [];
    window.postMessage({ type: "BLAST_DEDUP_CLEAR" }, WA_ORIGIN);
    _respondedPhones.clear();
    _loopRunning = false;
    _tplIndex = 0;
    _sessionSent = 0;
    _blockId = null;
    _blockSent = 0;
    _checkpoint = null;
    _stopCheckpointPolling();
    _previewContacts = [];
    _previewSkipped.clear();
    _previewLoading = false;
    _previewReady = false;
    _kpis = { pending: 0, sent: 0, delivered: 0, read: 0, failed: 0, no_wa: 0 };
    _lastResults = [];
    _trackedMsgs = [];
    _totalPending = null;
    _running = false;
    _paused = false;
    _stopCountdown();
    _stopAckTracking();
    _stopStatsRefresh();
    fetchGlobalStats();
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
  var _contacts = [];
  var _total = 0;
  var _running2 = false;
  var _paused2 = false;
  var _idx = 0;
  var _sessionCount = 0;
  var _burstCount = 0;
  var _results = [];
  var _countdown2 = 0;
  var _countdownTimer2 = null;
  var _activeNumber = null;
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
  var _usyncCache = /* @__PURE__ */ new Map();
  var USYNC_CACHE_TTL_MS = 30 * 60 * 1e3;
  var USYNC_CACHE_MAX = 600;
  async function _checkPhonesSilentBatch(phones) {
    const results = {};
    const toQuery = [];
    const now = Date.now();
    for (const phone of phones) {
      const cached = _usyncCache.get(phone);
      if (cached && now - cached.ts < USYNC_CACHE_TTL_MS) {
        results[phone] = { exists: cached.exists, reason: "cache" };
      } else {
        toQuery.push(phone);
      }
    }
    if (!toQuery.length) return results;
    let usyncOk = false;
    try {
      const { USyncQuery } = window.require("WAWebUsync");
      const { USyncUser } = window.require("WAWebUsyncUser");
      if (USyncQuery && USyncUser) {
        const query = new USyncQuery().withContext("interactive").withContactProtocol();
        for (const phone of toQuery) {
          query.withUser(new USyncUser().withPhone(phone));
        }
        const response = await query.execute();
        const list = response?.list || [];
        const byPhone = {};
        for (const item of list) {
          const phone = item?.contact?.content;
          const type = item?.contact?.type;
          if (phone) byPhone[phone] = type;
        }
        for (const phone of toQuery) {
          const type = byPhone[phone];
          const exists = type === "in";
          const reason = type || "no_response";
          results[phone] = { exists, reason };
          _usyncCache.set(phone, { exists, ts: now });
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
      for (const phone of toQuery) {
        if (results[phone]) continue;
        try {
          const wf = _req2("WAWebWidFactory");
          const coll = _req2("WAWebCollections");
          if (wf && coll) {
            const wid = wf.createWid(phone + "@c.us");
            const chat = coll.Chat?.get(wid);
            if (chat) {
              results[phone] = { exists: true, reason: "in_store" };
              _usyncCache.set(phone, { exists: true, ts: now });
              continue;
            }
          }
        } catch (_) {
        }
        results[phone] = { exists: false, reason: "usync_unavailable" };
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
    if (_running2 || _paused2) return;
    if (!_contacts.length) {
      _toast2("Carga los contactos primero", "#ef5350");
      return;
    }
    _running2 = true;
    _paused2 = false;
    const batch = [];
    _render();
    const sessionMax = _mode === "conv" ? SESSION_MAX_CONV : SESSION_MAX_SILENT;
    while (_idx < _contacts.length && _running2 && !_paused2) {
      if (_sessionCount >= sessionMax) {
        _paused2 = _running2 = false;
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
          _contacts.length - _idx
        );
        const slice = _contacts.slice(_idx, _idx + remaining);
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
          if (!_running2 || _paused2) break;
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
        if (_running2 && !_paused2 && _idx < _contacts.length) {
          const d = SILENT_DELAY_MIN + Math.random() * (SILENT_DELAY_MAX - SILENT_DELAY_MIN);
          _startCountdown2(d);
          _render();
          await _sleep2(d);
          _stopCountdown2();
        }
        continue;
      }
      if (_burstCount >= CONV_BURST_MAX) {
        _burstCount = 0;
        if (batch.length) {
          _saveResults([...batch]);
          batch.length = 0;
        }
        _toast2(`Pausa de 2 min para evitar detecci\xF3n (${_sessionCount} msgs enviados)`, "#ff9f0a", CONV_BURST_REST);
        _startCountdown2(CONV_BURST_REST);
        _render();
        await _sleep2(CONV_BURST_REST);
        _stopCountdown2();
        if (!_running2 || _paused2) break;
      }
      const c = _contacts[_idx];
      const spamCheck = await _spamCheckBeforeSend();
      if (spamCheck.shouldPause) {
        _paused2 = _running2 = false;
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
      _burstCount++;
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
      if (_running2 && !_paused2 && _idx < _contacts.length) {
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
    if (!_paused2 && _idx >= _contacts.length) {
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
    const pending = _contacts.length - _idx;
    const pct = _contacts.length ? Math.round(_idx / _contacts.length * 100) : 0;
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
      ${_contacts.length ? `
      <div style="padding:10px 16px 5px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);margin-bottom:4px;">
          <span>${_idx} / ${_contacts.length} procesados</span>
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
        ${!_contacts.length ? `
          <button id="wspp-val-load" style="flex:1;padding:11px 16px;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:9px;color:#60a5fa;font-size:13px;font-weight:700;cursor:pointer;">
            \u{1F4CB} Cargar ${_total || "..."} n\xFAmeros
          </button>
        ` : !_running2 && !_paused2 ? `
          <button id="wspp-val-start" style="flex:1;padding:11px 16px;background:${modeColor};border:none;border-radius:9px;color:#0a0f1e;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 4px 20px ${modeColor}33;">
            \u25B6 ${isConv ? "Iniciar conversaciones" : "Verificar"} (${_contacts.length - _idx})
          </button>
          <button id="wspp-val-reload" title="Recargar" style="padding:11px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:9px;color:rgba(255,255,255,.4);font-size:14px;cursor:pointer;">\u21BA</button>
        ` : _running2 ? `
          <div style="flex:1;padding:9px 12px;background:rgba(96,165,250,.05);border:1px solid rgba(96,165,250,.1);border-radius:9px;font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">
            ${isConv ? `\u{1F4AC} Enviando \xB7 ${_sessionCount} msgs \xB7 burst ${_burstCount}/${CONV_BURST_MAX}` : `\u{1F535} Verificando \xB7 ${_sessionCount} en esta sesi\xF3n`}
          </div>
          <button id="wspp-val-pause" style="padding:11px 16px;background:rgba(255,149,0,.1);border:1px solid rgba(255,149,0,.2);border-radius:9px;color:#ff9f0a;font-size:13px;font-weight:700;cursor:pointer;">\u23F8 Pausar</button>
        ` : _paused2 && _idx < _contacts.length ? `
          <div style="width:100%;padding:9px 12px;background:rgba(255,149,0,.06);border:1px solid rgba(255,149,0,.14);border-radius:9px;font-size:12px;color:#ff9f0a;line-height:1.5;">
            \u23F8 Pausado en ${_idx}/${_contacts.length}. Listo para reanudar.
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
        _paused2 = true;
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
        _contacts = [];
        _results = [];
        _idx = 0;
        _sessionCount = 0;
        _burstCount = 0;
        _running2 = false;
        _paused2 = false;
      }
      _load();
    } else if (id === "wspp-val-start") {
      _startTime = Date.now();
      _burstCount = 0;
      _run();
    } else if (id === "wspp-val-pause") {
      _paused2 = true;
      _running2 = false;
      _stopCountdown2();
      _render();
    } else if (id === "wspp-val-resume") {
      _sessionCount = 0;
      _burstCount = 0;
      _paused2 = false;
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
        _toast2("Error cargando contactos: " + (e.data.error || "?"), "#ef5350");
        _render();
        return;
      }
      _contacts = e.data.contacts || [];
      _total = e.data.total || _contacts.length;
      _idx = 0;
      _sessionCount = 0;
      _burstCount = 0;
      _results = [];
      _running2 = false;
      _paused2 = false;
      _toast2(`\u2705 ${_contacts.length} n\xFAmeros cargados`, "#60a5fa");
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
  var _tab = localStorage.getItem(TAB_KEY) || "blast";
  var _audioItems = [];
  var _audioLoaded = false;
  var _audioLoading = false;
  var $ = (id) => document.getElementById(id);
  function _esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  setOnUpdate(() => {
    if (_open2 && _tab === "blast") _renderContent();
  });
  function insertSidebarFAB() {
    if ($(FAB_ID)) return;
    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.title = "Goberna Blast";
    fab.textContent = "WA";
    Object.assign(fab.style, {
      // Posición: pegado a la derecha, centrado verticalmente
      position: "fixed",
      right: "0",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: String(Z.fab),
      // Forma: rectángulo vertical pegado al borde
      width: "28px",
      height: "64px",
      borderRadius: "6px 0 0 6px",
      // Estilo
      background: S.accent,
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: "11px",
      fontWeight: "800",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      letterSpacing: "0",
      boxShadow: "-2px 0 12px rgba(0,0,0,.15)",
      // Solo responde a click directo — sin hover que cause click accidental
      userSelect: "none",
      WebkitUserSelect: "none",
      // Bloquear propagación de eventos hacia WA
      pointerEvents: "auto"
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
    document.body.appendChild(fab);
  }
  function toggleSidebar() {
    _open2 = !_open2;
    const fab = $(FAB_ID);
    if (_open2) {
      if (fab) {
        fab.style.right = SIDEBAR_W + "px";
        fab.style.background = "#374151";
        fab.textContent = "\u2715";
      }
      _renderSidebar();
      if (!isRunning()) refreshPendingCount();
      fetchNumberHealth();
      fetchNumberConfig();
      fetchGlobalStats();
    } else {
      if (fab) {
        fab.style.right = "0";
        fab.style.background = S.accent;
        fab.textContent = "WA";
      }
      const el = $(SIDEBAR_ID);
      if (el) {
        el.style.transform = `translateX(${SIDEBAR_W}px)`;
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
      ${_tabBtn("audios", "\u{1F399}", "Audios")}
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
    const el = $("sb-content");
    if (!el) return;
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
    } else if (id === "sb-brigadista-clear") {
      setConfig({ brigadista: "" });
      refreshPendingCount();
      _renderContent();
    } else if (id === "sb-start") {
      console.log("[SIDEBAR] sb-start clicked");
      startBlast();
    } else if (id === "sb-pause") {
      pauseBlast();
    } else if (id === "sb-resume") {
      resumeBlast();
    } else if (id === "sb-reset") {
      resetSession();
      refreshPendingCount();
      _renderContent();
    } else if (id === "sb-preview-cancel") {
      previewCancel();
      _renderContent();
    } else if (id === "sb-preview-confirm") {
      btn.disabled = true;
      btn.textContent = "Enviando...";
      previewConfirm();
      await startBlast();
    } else if (id === "sb-tpl-add") {
      const t = getTemplates();
      t.push(`[Hola|Buenas|Buenas tardes] {{nombre}} \xBF[c\xF3mo est\xE1s?|todo bien?|c\xF3mo te va?]
---
[Mensaje ${t.length + 1} \u2014 edit\xE1 este bloque]`);
      setTemplates(t);
      _renderContent();
    } else if (id === "sb-open-validator") {
      toggleValidatorPanel();
    } else if (skip) {
      btn.disabled = true;
      btn.textContent = "...";
      try {
        await previewSkipAndReplace(skip);
      } catch (err) {
        console.error("[SIDEBAR] skip error:", err);
      }
      _renderContent();
    } else if (markH) {
      btn.disabled = true;
      btn.textContent = "...";
      try {
        await previewMarkHablado(markH);
      } catch (err) {
        console.error("[SIDEBAR] markHablado error:", err);
      }
      _renderContent();
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
      const startBtn = $("sb-start");
      if (startBtn) startBtn.textContent = `\u25B6 Enviar a ${n} personas`;
    } else if (tplDel !== void 0) {
      const t = getTemplates();
      if (t.length > 1) {
        t.splice(Number(tplDel), 1);
        setTemplates(t);
        _renderContent();
      }
    } else if (btn.dataset?.audioSend) {
      const aid = btn.dataset.audioSend;
      btn.textContent = "\u23F3";
      btn.disabled = true;
      const h = (ev) => {
        if (ev.source !== window || ev.data?.type !== "CATALOG_AUDIO_READY" || ev.data.id !== aid) return;
        window.removeEventListener("message", h);
        sendAudioAsPTT(ev.data.audioBase64, ev.data.mimeType).then((ok) => {
          btn.textContent = ok ? "\u2713" : "\u2717";
          setTimeout(() => {
            btn.textContent = "Enviar";
            btn.disabled = false;
          }, 3e3);
        });
      };
      window.addEventListener("message", h);
      setTimeout(() => {
        window.removeEventListener("message", h);
        btn.textContent = "Enviar";
        btn.disabled = false;
      }, 15e3);
      window.postMessage({ type: "GET_CATALOG_AUDIO", id: aid }, WA_ORIGIN);
    } else if (btn.dataset?.audioRegen) {
      btn.textContent = "\u23F3";
      btn.disabled = true;
      window.postMessage({ type: "GENERATE_CATALOG_AUDIO", id: btn.dataset.audioRegen }, WA_ORIGIN);
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
      const startBtn = $("sb-start");
      if (startBtn) startBtn.textContent = `\u25B6 Enviar a ${v} personas`;
    }
  }
  var _brigTimer = null;
  function _handleDelegatedInput(e) {
    const tpl = e.target.closest("[data-tpl]");
    const brig = e.target.id === "sb-brigadista-input" ? e.target : null;
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
            (p, i) => `<span style="display:block;margin-bottom:1px;">\u2709\uFE0F ${i + 1}: ${_esc(p.slice(0, 60))}${p.length > 60 ? "\u2026" : ""}</span>`
          ).join("");
        }
      }
    }
    if (brig) {
      clearTimeout(_brigTimer);
      _brigTimer = setTimeout(() => {
        setConfig({ brigadista: brig.value.trim() });
        refreshPendingCount();
        _renderContent();
      }, 600);
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
            (p, i) => `<span style="display:block;margin-bottom:1px;">\u2709\uFE0F ${i + 1}: ${_esc(p.slice(0, 60))}${p.length > 60 ? "\u2026" : ""}</span>`
          ).join("");
        }
      }
    });
  }
  function _contentHTML() {
    if (_tab === "blast") return _blastHTML();
    if (_tab === "audios") return _audiosHTML();
    if (_tab === "validar") return _validarHTML();
    return "";
  }
  function _bindShell() {
    $("sb-close")?.addEventListener("click", toggleSidebar);
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.addEventListener("click", () => {
        _tab = b.dataset.tab;
        localStorage.setItem(TAB_KEY, _tab);
        _renderSidebar();
        if (_tab === "audios" && !_audioLoaded && !_audioLoading) _loadAudios();
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
    const totalSent = kpis.pending + kpis.sent + kpis.delivered + kpis.read;
    const totalProcessed = totalSent + kpis.failed + (kpis.no_wa || 0);
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
    const sessionStart = window.__blastSessionStart || Date.now();
    if (!window.__blastSessionStart && running) window.__blastSessionStart = Date.now();
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

    <!-- STATS GLOBALES DEL SERVIDOR -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:11px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;">Progreso global \u2014 todos los celulares</div>
        <button id="sb-refresh" style="padding:4px 10px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:11px;cursor:pointer;">\u21BB</button>
      </div>

      <!-- Tres contadores grandes -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.accent};">${gs ? gsPending.toLocaleString("es-PE") : "..."}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Pendientes</div>
        </div>
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:#6b7280;">${gs ? gsHablado.toLocaleString("es-PE") : "..."}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Hablados</div>
        </div>
        <div style="background:${S.bg};border:1px solid ${S.border};border-radius:8px;padding:10px 6px;text-align:center;">
          <div style="font-size:22px;font-weight:800;color:${S.text};">${gs ? gsTotal.toLocaleString("es-PE") : "..."}</div>
          <div style="font-size:10px;color:${S.muted};margin-top:2px;">Total</div>
        </div>
      </div>

      <!-- Barra de progreso -->
      ${gs ? `
      <div style="margin-bottom:${byNumEntries.length ? "10" : "0"}px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:4px;">
          <span>Completado</span>
          <span style="font-weight:700;color:${gsPct >= 80 ? S.accent : S.text};">${gsPct}%</span>
        </div>
        <div style="height:6px;background:${S.border};border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${gsPct}%;background:${gsPct >= 80 ? S.accent : gsPct >= 50 ? S.blue : S.warn};border-radius:3px;transition:width .4s ease;"></div>
        </div>
      </div>
      ` : ""}

      <!-- Desglose por celular (solo si hay datos hoy) -->
      ${byNumEntries.length ? `
      <div style="border-top:1px solid ${S.border};padding-top:8px;">
        <div style="font-size:10px;color:${S.muted};font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Hoy por celular</div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          ${byNumEntries.map(([num, v]) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
              <span style="color:${S.muted};font-size:10px;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="+${num}">${v.label ? _esc(v.label) : "+" + num.slice(-4)}</span>
              <div style="flex:1;height:4px;background:${S.border};border-radius:2px;overflow:hidden;">
                <div style="height:100%;width:${gsTotal > 0 ? Math.min(100, Math.round(v.sent / gsTotal * 100 * 6)) : 0}%;background:${S.accent};border-radius:2px;"></div>
              </div>
              <span style="font-weight:700;color:${S.text};min-width:28px;text-align:right;">${v.today}</span>
              <span style="color:${S.muted};font-size:10px;">hoy</span>
            </div>
          `).join("")}
        </div>
      </div>
      ` : ""}
    </div>

    <!-- KPIs -->
    ${hasActivity ? `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;">
      ${[
      ["\u2713", kpis.sent, "Enviado", "#6b7280"],
      ["\u2713\u2713", kpis.delivered, "Entregado", S.accent],
      ['<span style="color:#53bdeb;">\u2713\u2713</span>', kpis.read, "Le\xEDdo", "#53bdeb"],
      ["\u2717", kpis.failed, "Fallido", S.danger],
      ["\u{1F4F5}", kpis.no_wa || 0, "Sin WA", "#9ca3af"]
    ].map(([icon, val, label, color]) => `
        <div style="background:${S.card};border:1px solid ${S.border};border-radius:8px;padding:8px 4px;text-align:center;">
          <div style="font-size:16px;font-weight:800;color:${color};">${val}</div>
          <div style="font-size:9px;color:${S.muted};margin-top:2px;">${icon} ${label}</div>
        </div>
      `).join("")}
    </div>
    ` : ""}

    <!-- VENTANA HORARIA + STEALTH STATS -->
    <div style="background:${inWindow ? S.accentBg : S.dangerBg};border:1px solid ${inWindow ? "rgba(37,211,102,0.3)" : "#fecaca"};border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">${inWindow ? "\u{1F7E2}" : "\u{1F534}"}</span>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:${inWindow ? S.accent : S.danger};">${inWindow ? "Ventana activa" : "Fuera de horario"}</div>
        <div style="font-size:10px;color:${S.muted};">Per\xFA ${peruTime} \xB7 Lun-Vie 8-20h \xB7 S\xE1b 9-14h</div>
      </div>
    </div>

    <!-- STEALTH STATS (solo con actividad) -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Sesi\xF3n actual</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:11px;">
        <div><span style="color:${S.muted};">Velocidad</span><br><b>${msgPerMin} msg/min</b></div>
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
          ${spam.warnings.slice(0, 3).map((w) => `<div style="font-size:10px;color:${S.muted};padding-left:20px;">\u25CF ${_esc(w)}</div>`).join("")}
          ${spam.actions.length ? spam.actions.slice(0, 2).map((a) => `<div style="font-size:10px;color:${color};padding-left:20px;font-weight:600;">\u2192 ${_esc(a)}</div>`).join("") : ""}
          ${spam.repeatedTexts?.length ? `
            <div style="margin-top:6px;padding-left:20px;">
              <div style="font-size:9px;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Mensajes repetidos:</div>
              ${spam.repeatedTexts.slice(0, 3).map((rt) => `
                <div style="font-size:10px;color:${S.muted};padding:3px 6px;margin-bottom:2px;background:rgba(0,0,0,0.03);border-radius:4px;border-left:2px solid ${color};">
                  <span style="color:${color};font-weight:600;">${rt.count}x</span> "${_esc(rt.text.length > 80 ? rt.text.slice(0, 80) + "\u2026" : rt.text)}"
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
          <div style="font-size:10px;color:${S.muted};padding-left:22px;">\u2192 ${_esc(s)}</div>
        `).join("")}
      </div>
      ` : ""}
    </div>
    ` : ""}

    <!-- TANDA -->
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      <div style="font-size:12px;font-weight:700;margin-bottom:8px;">\xBFA cu\xE1ntos envi\xE1s por tanda?</div>
      <div style="display:flex;gap:5px;margin-bottom:8px;flex-wrap:wrap;">
        ${[10, 25, 50, 100, 200].map((n) => `
          <button data-preset="${n}" style="
            flex:1;min-width:40px;padding:7px 4px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;
            border:2px solid ${cfg2.batchSize === n ? S.accent : S.border};
            background:${cfg2.batchSize === n ? S.accentBg : S.bg};
            color:${cfg2.batchSize === n ? S.accent : S.muted};
            transition:all .1s;
          ">${n}</button>
        `).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;color:${S.muted};white-space:nowrap;">O escrib\xED:</span>
        <input type="number" data-cfg="batchSize" value="${cfg2.batchSize}" min="1" max="500" style="
          flex:1;padding:6px 8px;border:1px solid ${S.border};border-radius:6px;
          background:${S.bg};color:${S.text};font-size:13px;font-weight:700;
          outline:none;text-align:center;box-sizing:border-box;
        " />
        <span style="font-size:11px;color:${S.muted};white-space:nowrap;">personas</span>
      </div>
    </div>

    <!-- FILTRO BRIGADISTA -->
    <div style="background:${S.card};border:1px solid ${cfg2.brigadista ? S.accent : S.border};border-radius:10px;padding:10px 12px;">
      <div style="font-size:11px;font-weight:700;color:${S.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">
        Filtrar por brigadista
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" id="sb-brigadista-input" placeholder="Ej: Ricardo Rea\xF1o" value="${_esc(cfg2.brigadista || "")}" style="
          flex:1;padding:7px 10px;border:1px solid ${S.border};border-radius:6px;
          background:${S.bg};color:${S.text};font-size:12px;outline:none;
        " />
        ${cfg2.brigadista ? `<button id="sb-brigadista-clear" style="padding:6px 10px;border-radius:6px;border:1px solid ${S.border};background:${S.bg};color:${S.danger};font-size:11px;font-weight:700;cursor:pointer;">\u2715</button>` : ""}
      </div>
      ${cfg2.brigadista ? `<div style="font-size:10px;color:${S.accent};margin-top:4px;font-weight:600;">Filtrando solo contactos de: ${_esc(cfg2.brigadista)}</div>` : ""}
    </div>

    <!-- CONFIG AVANZADA -->
    <details style="background:${S.card};border:1px solid ${S.border};border-radius:10px;overflow:hidden;">
      <summary style="padding:12px;font-size:12px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;">
        <span>\u2699\uFE0F Timing anti-baneo</span>
        <span style="font-size:10px;color:${S.muted};">\u25BE</span>
      </summary>
      <div style="padding:0 12px 12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${_cfgField("delaySec", "Espera entre msgs (seg)", cfg2.delaySec, 3, 120)}
        ${_cfgField("prewarmSec", "Pre-warm (seg)", cfg2.prewarmSec, 0, 120)}
        ${_cfgField("pausaCada", "Pausa cada N msgs", cfg2.pausaCada, 3, 50)}
        ${_cfgField("pausaSec", "Duraci\xF3n pausa (seg)", cfg2.pausaSec, 10, 600)}
        ${_cfgField("descansoSec", "Descanso c/25 (seg)", cfg2.descansoSec, 30, 900)}
      </div>
    </details>

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
          ">${_esc(t)}</textarea>
          <div id="sb-tpl-preview-${i}" style="margin-top:4px;font-size:10px;color:${S.muted};line-height:1.5;font-style:italic;min-height:14px;"></div>
        </div>
      `).join("")}

    </div>

    <!-- CHECKPOINT UI -->
    ${(() => {
      const cp = getCheckpoint();
      const bs = getBlockSent();
      if (!running && !cp) return "";
      const pct10 = cp ? Math.min(100, Math.round(cp.response_rate / 0.1 * 100)) : 0;
      const pct50 = cp ? Math.min(100, Math.round(cp.response_rate / 0.5 * 100)) : 0;
      const rPct = cp ? Math.round(cp.response_rate * 100) : 0;
      const blockPct = Math.min(100, Math.round(bs / 50 * 100));
      return `
      <div style="background:${S.card};border:2px solid ${cp?.unlocked_50 ? S.accent : cp?.unlocked_10 ? S.warn : S.border};border-radius:12px;padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-size:12px;font-weight:700;color:${S.text};">
            ${cp ? "\u23F8 Checkpoint \u2014 esperando respuestas" : `\u{1F4E6} Bloque actual: ${bs}/50`}
          </div>
          ${cp ? `<span style="font-size:14px;font-weight:800;color:${rPct >= 50 ? S.accent : rPct >= 10 ? S.warn : S.danger};">${rPct}%</span>` : ""}
        </div>

        ${!cp ? `
          <!-- Progreso de env\xEDo hacia 50 -->
          <div style="margin-bottom:4px;">
            <div style="height:6px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${blockPct}%;background:${S.accent};border-radius:3px;transition:width .3s;"></div>
            </div>
            <div style="font-size:10px;color:${S.muted};margin-top:3px;">${bs} enviados de 50 \u2192 checkpoint autom\xE1tico</div>
          </div>
        ` : `
          <!-- Barra hacia 10% (desbloqueo vista) -->
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:3px;">
              <span>Vista (10%)</span>
              <span style="font-weight:700;color:${cp.unlocked_10 ? S.accent : S.muted};">${cp.unlocked_10 ? "\u2713 Desbloqueado" : "Esperando..."}</span>
            </div>
            <div style="height:5px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct10}%;background:${S.warn};border-radius:3px;transition:width .4s;"></div>
            </div>
          </div>
          <!-- Barra hacia 50% (desbloqueo env\xEDo) -->
          <div>
            <div style="display:flex;justify-content:space-between;font-size:10px;color:${S.muted};margin-bottom:3px;">
              <span>Enviar siguientes 50 (50%)</span>
              <span style="font-weight:700;color:${cp.unlocked_50 ? S.accent : S.muted};">${cp.unlocked_50 ? "\u2713 Listo" : `${cp.responded}/${Math.ceil(cp.sent * 0.5)} respuestas`}</span>
            </div>
            <div style="height:5px;background:${S.border};border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${pct50}%;background:${cp.unlocked_50 ? S.accent : "#3b82f6"};border-radius:3px;transition:width .4s;"></div>
            </div>
          </div>
          <div style="font-size:10px;color:${S.muted};margin-top:6px;">
            ${cp.responded} de ${cp.sent} respondieron \xB7 actualizando cada 30s
          </div>
        `}
      </div>`;
    })()}

    <!-- TIMER + LOG -->
    ${hasActivity ? `
    <div style="background:${S.card};border:1px solid ${S.border};border-radius:10px;padding:12px;">
      ${timerLabel ? `<div id="sb-timer-label" style="font-size:12px;color:${S.accent};font-weight:600;margin-bottom:8px;">${timerLabel}</div>` : '<div id="sb-timer-label" style="display:none"></div>'}
      ${results.length ? `
      <div style="font-size:10px;color:${S.muted};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">\xDAltimos enviados</div>
      <div style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;">
        ${results.slice(0, 12).map((r) => `
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:${r.status === "failed" ? S.dangerBg : S.bg};border:1px solid ${r.status === "failed" ? "#fecaca" : S.border};border-radius:5px;font-size:11px;">
            <span style="flex-shrink:0;font-size:10px;min-width:20px;">${_ackIcon(r.ack ?? -1)}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${r.status === "failed" ? S.danger : S.text};">
              ${_esc(r.nombre || "?")}
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

    <!-- PREVIEW \u2014 muestra pr\xF3ximos contactos antes de arrancar -->
    ${isPreviewLoading() ? `
      <div style="background:${S.card};border:1px solid ${S.border};border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:13px;color:${S.muted};">Cargando preview...</div>
      </div>
    ` : getPreviewContacts().length > 0 && !isPreviewReady() && !running ? `
      <div style="background:${S.card};border:1px solid ${S.border};border-radius:12px;padding:14px;">
        <div style="font-size:12px;font-weight:700;color:${S.text};margin-bottom:10px;">
          \u{1F441} Pr\xF3ximos a enviar \u2014 revis\xE1 antes de confirmar
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
          ${getPreviewContacts().map((c) => {
      const nombre = ((c.nombre || "") + " " + (c.apellidos || "")).trim() || "\u2014 Sin nombre";
      return `
            <div style="
              display:flex;align-items:center;gap:8px;padding:8px 10px;
              background:${S.bg};border:1px solid ${S.border};border-radius:8px;
            ">
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;color:${S.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  ${_esc(nombre)}
                </div>
                <div style="font-size:10px;color:${S.muted};margin-top:1px;">
                  +${_esc(c.telefono || "?")}
                  ${c.departamento ? ` \xB7 ${_esc(c.departamento)}` : ""}
                  ${c.heat_score === 2 ? " \u{1F525}" : ""}
                </div>
              </div>
              <button data-skip="${_esc(c.id)}" title="Saltear (marca hablado)" style="padding:4px 10px;border-radius:5px;border:1px solid ${S.border};background:${S.bg};color:${S.muted};font-size:10px;cursor:pointer;flex-shrink:0;">Saltear</button>
              <button data-markhablado="${_esc(c.id)}" title="Ya le hablamos" style="padding:4px 10px;border-radius:5px;border:1px solid #fecaca;background:#fef2f2;color:${S.danger};font-size:10px;font-weight:600;cursor:pointer;flex-shrink:0;">\u2713 Hablado</button>
            </div>`;
    }).join("")}
        </div>
        <div style="display:flex;gap:8px;">
          <button id="sb-preview-cancel" style="
            flex:1;padding:10px;border-radius:8px;border:1px solid ${S.border};
            background:${S.bg};color:${S.muted};font-size:13px;font-weight:600;cursor:pointer;
          ">\u2715 Cancelar</button>
          <button id="sb-preview-confirm" style="
            flex:2;padding:10px;border-radius:8px;border:none;
            background:${S.accent};color:#fff;font-size:13px;font-weight:700;cursor:pointer;
            box-shadow:0 2px 8px ${S.accent}40;
          ">\u25B6 Confirmar y enviar</button>
        </div>
      </div>
    ` : ""}

    <!-- CONTROLES -->
    ${!running && !paused && hasPending && !isPreviewLoading() && getPreviewContacts().length === 0 ? `
      ${!inWindow ? `
        <div style="text-align:center;padding:12px;background:${S.dangerBg};border:1px solid #fecaca;border-radius:10px;font-size:12px;color:${S.danger};font-weight:600;">
          \u{1F534} No se puede enviar fuera de horario (${peruTime})
        </div>
      ` : analysis.level === "danger" ? `
        <div style="margin-bottom:6px;text-align:center;padding:8px;background:${S.dangerBg};border:1px solid #fecaca;border-radius:8px;font-size:11px;color:${S.danger};">
          \u26A0\uFE0F Las plantillas tienen riesgo ALTO \u2014 revis\xE1 las sugerencias arriba
        </div>
        <button id="sb-start" data-force="true" style="
          width:100%;padding:14px;border-radius:10px;border:1px solid ${S.danger};
          background:${S.dangerBg};color:${S.danger};font-size:15px;font-weight:700;cursor:pointer;
        ">\u26A0\uFE0F Enviar igual a ${cfg2.batchSize} personas</button>
      ` : `
        <button id="sb-start" style="
          width:100%;padding:14px;border-radius:10px;border:none;
          background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
          box-shadow:0 2px 12px ${S.accent}40;
        ">\u25B6 Enviar a ${cfg2.batchSize} personas</button>
      `}
    ` : running ? `
      <button id="sb-pause" style="
        width:100%;padding:14px;border-radius:10px;border:1px solid ${S.warn}40;
        background:${S.warnBg};color:${S.warn};font-size:15px;font-weight:700;cursor:pointer;
      ">\u23F8 Pausar</button>
    ` : paused ? `
      <button id="sb-resume" style="
        width:100%;padding:14px;border-radius:10px;border:none;
        background:${S.accent};color:#fff;font-size:15px;font-weight:700;cursor:pointer;
      ">\u25B6 Reanudar</button>
    ` : !hasPending && pending !== null ? `
      <div style="text-align:center;padding:12px;background:${S.accentBg};border-radius:10px;font-size:13px;color:${S.accent};font-weight:600;">
        \u2705 No hay m\xE1s pendientes
      </div>
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
  function _cfgField(key, label, value, min, max) {
    return `<div>
    <label style="font-size:11px;color:${S.muted};display:block;margin-bottom:2px;">${label}</label>
    <input type="number" data-cfg="${key}" value="${value}" min="${min}" max="${max}" style="
      width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid ${S.border};
      border-radius:6px;background:${S.bg};color:${S.text};font-size:13px;font-weight:600;
      outline:none;text-align:center;
    " />
  </div>`;
  }
  function _audiosHTML() {
    if (_audioLoading) return `<div style="padding:40px;text-align:center;color:${S.muted};font-size:12px;">Cargando audios...</div>`;
    if (!_audioItems.length) return `<div style="padding:40px;text-align:center;color:${S.muted};font-size:12px;">Sin audios</div>`;
    return `<div style="padding:10px;display:flex;flex-direction:column;gap:4px;">
    ${_audioItems.map((item) => {
      const dur = item.duration_ms ? Math.floor(item.duration_ms / 1e3) + "s" : "";
      const has = !!item.has_audio;
      return `<div data-audio-id="${item.id}" style="
        display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:${S.card};border:1px solid ${S.border};border-radius:8px;
        cursor:${has ? "pointer" : "default"};opacity:${has ? "1" : ".5"};
      ">
        <div style="width:28px;height:28px;border-radius:50%;background:${has ? S.accentBg : S.card};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;">
          ${has ? "\u25B6" : "\u2014"}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_esc(item.label)}</div>
          <div style="font-size:10px;color:${S.muted};">${_esc(item.category)}${dur ? " \xB7 " + dur : ""}</div>
        </div>
        ${has ? `<button data-audio-send="${item.id}" style="${_smallBtn(S.accent, S.accentBg)}">Enviar</button>` : `<button data-audio-regen="${item.id}" style="${_smallBtn(S.warn, S.warnBg)}">Generar</button>`}
      </div>`;
    }).join("")}
  </div>`;
  }
  function _loadAudios() {
    _audioLoading = true;
    _renderContent();
    window.postMessage({ type: "FETCH_AUDIO_CATALOG" }, WA_ORIGIN);
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
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    if (e.data?.type === "AUDIO_CATALOG_READY") {
      _audioLoading = false;
      _audioLoaded = true;
      if (e.data.ok) _audioItems = e.data.items || [];
      if (_tab === "audios") _renderContent();
    }
    if (e.data?.type === "GENERATE_CATALOG_AUDIO_DONE") {
      if (e.data.ok) {
        _audioLoaded = false;
        if (_tab === "audios") _loadAudios();
      }
    }
  });

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
