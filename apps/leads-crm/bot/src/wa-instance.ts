/**
 * WhatsApp instance using Baileys.
 * No Puppeteer, no Chromium — direct WebSocket to WhatsApp servers.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  type WASocket,
  type BaileysEventMap,
  type WAMessage,
  type WAMessageKey,
  type proto,
  isJidGroup,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
  getContentType,
  jidNormalizedUser,
  downloadMediaMessage,
} from "baileys";
import { Boom } from "@hapi/boom";
import P from "pino";
import { join } from "path";
import { rmSync } from "fs";
import { CONFIG, type PhoneConfig } from "./config.js";
import { classifyMessage, getCourse, applyCustomRules } from "./classifier.js";

// Slug para tags: "Consultor Político" → "consultor-politico". Usado para que
// los tags queden consistentes (sin acentos, espacios, mayúsculas).
function slugifyTag(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
import {
  crmApi,
  pushElectoralEvent,
  uploadMediaToElectoral,
  syncElectoralPhones,
  getElectoralCampaignFor,
} from "./crm-api.js";
import { getAutoResponse, getOutOfHoursResponse, isWithinHours } from "./auto-reply.js";
import { decideAutoReply, typingDelayFor } from "./auto-reply-v2.js";

const logger = P({ level: "warn" });

export interface InstanceStats {
  messagesIn: number;
  messagesOut: number;
  autoReplies: number;
  errors: number;
  startedAt: string;
}

export interface InstanceState {
  id: string;
  label: string;
  phone: string;
  status: "initializing" | "waiting_qr" | "connecting" | "ready" | "disconnected" | "auth_failed" | "error";
  qr: string | null;
  stats: InstanceStats;
}

// Debug log ring buffer (last 100 entries per instance)
const MAX_LOGS = 100;
export const debugLogs = new Map<string, string[]>();

function addLog(id: string, msg: string) {
  if (!debugLogs.has(id)) debugLogs.set(id, []);
  const logs = debugLogs.get(id)!;
  const ts = new Date().toISOString().slice(11, 19);
  logs.push(`[${ts}] ${msg}`);
  if (logs.length > MAX_LOGS) logs.shift();
}

// Cooldown tracker per chat
const recentReplies = new Map<string, number>();
const recentMessages = new Map<string, Array<{ body: string; fromMe: boolean }>>();

// Prune old entries every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of recentReplies) {
    if (now - v > CONFIG.replyCooldownMs * 2) recentReplies.delete(k);
  }
}, 10 * 60 * 1000);

export class WAInstance {
  readonly id: string;
  readonly label: string;
  readonly phone: string;
  readonly testOnly: boolean;
  private sock: WASocket | null = null;
  private _status: InstanceState["status"] = "initializing";
  private _qr: string | null = null;
  // Set when destroy/restart/logout runs — suppresses auto-reconnect from close handler
  private intentionalStop = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  // Cache of recent messages keyed by `${jid}:${id}` so `getMessage` can answer
  // retry receipts from recipients who failed to decrypt. Without this, the
  // recipient sees "Esperando mensaje, esto puede tomar tiempo…" indefinitely.
  private messageCache = new Map<string, proto.IMessage>();
  private static MESSAGE_CACHE_LIMIT = 2000;
  readonly stats: InstanceStats = {
    messagesIn: 0, messagesOut: 0, autoReplies: 0, errors: 0,
    startedAt: new Date().toISOString(),
  };

  constructor(config: PhoneConfig) {
    this.id = config.id;
    this.label = config.label;
    this.phone = config.phone;
    this.testOnly = config.testOnly || false;
  }

  get state(): InstanceState {
    return {
      id: this.id, label: this.label, phone: this.phone,
      status: this._status, qr: this._qr, stats: { ...this.stats },
    };
  }

  async start(): Promise<void> {
    // Cancel any pending auto-reconnect before starting a new socket
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.intentionalStop = false;
    console.log(`[bot:${this.id}] Starting ${this.label} (${this.phone})...`);
    const authDir = join(CONFIG.sessionsDir, this.id);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.ubuntu("Chrome"),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      defaultQueryTimeoutMs: 60_000,
      connectTimeoutMs: 60_000,
      // Called when a recipient couldn't decrypt a message we sent and asks
      // for a retry. Returning the original payload lets Baileys re-encrypt
      // with fresh Signal keys instead of dropping the retry silently.
      getMessage: async (key: WAMessageKey) => {
        const cached = this.lookupCachedMessage(key.remoteJid || "", key.id || "");
        if (cached) {
          addLog(this.id, `🔁 retry: serving cached msg ${key.id?.slice(0, 12)} → ${(key.remoteJid || "").slice(0, 25)}`);
          return cached;
        }
        addLog(this.id, `⚠ retry: NO CACHE for ${key.id?.slice(0, 12)} → ${(key.remoteJid || "").slice(0, 25)}`);
        return undefined;
      },
    });

    // Save credentials on update
    this.sock.ev.on("creds.update", saveCreds);

    // Connection updates (QR, connected, disconnected)
    this.sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      addLog(this.id, `connection.update: ${JSON.stringify({ connection, hasQR: !!qr, lastDisconnect: lastDisconnect?.error?.message })}`);

      if (qr) {
        this._qr = qr;
        this._status = "waiting_qr";
        console.log(`[bot:${this.id}] QR code generated — scan from phone`);
      }

      if (connection === "connecting") {
        this._status = "connecting";
        this._qr = null;
      }

      if (connection === "open") {
        this._status = "ready";
        this._qr = null;
        console.log(`[bot:${this.id}] ✓ Connected — ${this.label}`);
      }

      if (connection === "close") {
        this._qr = null;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          this._status = "auth_failed";
          console.warn(`[bot:${this.id}] Logged out — need to re-scan QR`);
        } else if (this.intentionalStop) {
          // destroy/restart/logout is in charge — don't schedule auto-reconnect
          this._status = "disconnected";
          addLog(this.id, `close (intentional, code ${statusCode}) — no auto-reconnect`);
        } else {
          this._status = "disconnected";
          console.warn(`[bot:${this.id}] Disconnected (code ${statusCode}) — reconnecting in 5s...`);
          // Clean up old socket before reconnecting
          try { this.sock?.end(undefined); } catch {}
          this.sock = null;
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.start().catch((e) => console.error(`[bot:${this.id}] reconnect failed:`, e.message));
          }, 5000);
        }
      }
    });

    // Delivery / read receipts (helps diagnose "sent but not delivered" issues)
    this.sock.ev.on("messages.update", (updates) => {
      for (const u of updates) {
        const status = (u.update as any)?.status;
        if (status !== undefined) {
          const label = status === 1 ? "server-ack" : status === 2 ? "delivered" : status === 3 ? "read" : status === 4 ? "played" : `status=${status}`;
          const out = u.key?.fromMe ? "OUT" : "IN";
          addLog(this.id, `🔔 ${out} ack ${label} → ${(u.key?.remoteJid || "?").slice(0, 25)} msgId=${u.key?.id?.slice(0, 12) || "?"}`);
        }
      }
    });

    // Build LID→phone map from contacts sync
    this.sock.ev.on("contacts.upsert", (contacts) => {
      for (const c of contacts) {
        const id = c.id; // could be LID or phone JID
        const lid = (c as any).lid; // some contacts have a lid field
        if (lid && id?.includes("@s.whatsapp.net")) {
          const phone = "+" + id.replace("@s.whatsapp.net", "");
          this.lidCache.set(lid, phone);
          addLog(this.id, `📇 Contact map: ${lid.slice(0, 20)} → ${phone}`);
        }
        // Also map the reverse: if id is a LID and there's a notify/name with digits
        if (id?.includes("@lid")) {
          const verifiedName = (c as any).verifiedName || (c as any).notify || "";
          if (verifiedName) addLog(this.id, `📇 LID contact: ${id.slice(0, 20)} name=${verifiedName}`);
        }
      }
    });

    this.sock.ev.on("contacts.update", (contacts) => {
      for (const c of contacts) {
        const id = c.id;
        const lid = (c as any).lid;
        if (lid && id?.includes("@s.whatsapp.net")) {
          const phone = "+" + id.replace("@s.whatsapp.net", "");
          this.lidCache.set(lid, phone);
        }
      }
    });

    // Incoming messages
    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      addLog(this.id, `messages.upsert: type=${type} count=${messages.length}`);
      // Cache every message we see (incoming + outgoing) so `getMessage` can
      // answer retry receipts. Both `notify` and `append` types matter —
      // outgoing sends arrive as `append`.
      for (const msg of messages) {
        if (msg.key?.remoteJid && msg.key?.id && msg.message) {
          this.cacheMessage(msg.key.remoteJid, msg.key.id, msg.message);
        }
      }
      if (type !== "notify") return;
      for (const msg of messages) {
        try {
          // 1) leads-crm flow original (1:1 text) — sin tocar.
          await this.handleMessage(msg);
        } catch (e: any) {
          this.stats.errors++;
          addLog(this.id, `ERROR handleMessage: ${e.message}`);
          console.error(`[bot:${this.id}] Message handler error:`, e.message);
        }
        try {
          // 2) electoral dual-push (Fase 1 UNIFICATION_PLAN) — fire-and-forget,
          //    soporta grupos / media / newsletters / broadcasts. Si el bot no
          //    tiene ELECTORAL_BOT_SECRET seteado, esto es un no-op.
          await this.handleElectoralEvent(msg);
        } catch (e: any) {
          addLog(this.id, `ERROR electoral push: ${e.message}`);
          // No incrementamos errors aquí — electoral failures no afectan leads-crm.
        }
      }
    });

    // Reactions: emoji clicks sobre mensajes previos. Solo electoral (leads-crm
    // no modela reactions). El reaction trae el `key.id` del mensaje target.
    this.sock.ev.on("messages.reaction", async (reactions) => {
      for (const r of reactions) {
        try {
          await this.handleElectoralReaction(r);
        } catch (e: any) {
          addLog(this.id, `ERROR reaction: ${e.message}`);
        }
      }
    });
  }

  // Normalize JID so that retry lookups work regardless of device suffix or
  // agent hint. WhatsApp retries come back addressed to device-specific JIDs
  // like `51955135507:11@s.whatsapp.net`, but we cache by the base user JID.
  private normalizeJid(jid: string): string {
    if (!jid) return jid;
    // Strip `:N` device suffix before the `@`: `51955135507:11@s.whatsapp.net` → `51955135507@s.whatsapp.net`
    const at = jid.indexOf("@");
    if (at <= 0) return jid;
    const user = jid.slice(0, at);
    const server = jid.slice(at);
    const colon = user.indexOf(":");
    const bareUser = colon >= 0 ? user.slice(0, colon) : user;
    return bareUser + server;
  }

  private cacheMessage(jid: string, id: string, message: proto.IMessage) {
    const baseJid = this.normalizeJid(jid);
    const key = `${baseJid}:${id}`;
    this.messageCache.set(key, message);
    // Simple FIFO eviction to keep memory bounded
    if (this.messageCache.size > WAInstance.MESSAGE_CACHE_LIMIT) {
      const firstKey = this.messageCache.keys().next().value;
      if (firstKey) this.messageCache.delete(firstKey);
    }
  }

  private lookupCachedMessage(jid: string, id: string): proto.IMessage | undefined {
    if (!id) return undefined;
    // First try exact JID (covers the raw-JID case); then the device-stripped
    // form so that retries from `51955135507:11@...` still hit the entry
    // cached under the base `51955135507@...`.
    return this.messageCache.get(`${jid}:${id}`) || this.messageCache.get(`${this.normalizeJid(jid)}:${id}`);
  }

  private async handleMessage(msg: any): Promise<void> {
    const jid = msg.key?.remoteJid;
    const isFromMe = !!msg.key?.fromMe;

    // Para fromMe, remoteJid es el RECIPIENTE (no nosotros). Resolvemos
    // y persistimos como direction="out" — así los mensajes que el operador
    // manda manualmente desde el WhatsApp real aparecen en el CRM.

    if (!jid) {
      addLog(this.id, `⏭ no remoteJid on msg key`);
      return;
    }

    // Skip groups, broadcasts, status, newsletters — log which one
    if (isJidGroup(jid)) { addLog(this.id, `⏭ group ${jid.slice(0, 30)} — pushName=${msg.pushName || "?"}`); return; }
    if (isJidBroadcast(jid)) { addLog(this.id, `⏭ broadcast ${jid.slice(0, 30)}`); return; }
    if (isJidStatusBroadcast(jid)) { addLog(this.id, `⏭ status ${jid.slice(0, 30)}`); return; }
    if (isJidNewsletter(jid)) { addLog(this.id, `⏭ newsletter ${jid.slice(0, 30)}`); return; }

    // Extract text body. Detect message type — antes hacíamos early return si
    // no había body (texto), pero eso descartaba todas las imágenes/audios sin
    // caption. Ahora detectamos el tipo y dejamos pasar — si hay media,
    // intentamos descargarla y subirla a electoral para obtener una URL pública
    // que se incluye en el `meta` de la interaction de leads-crm. (Audit 2026-05-06.)
    const body = this.extractText(msg) ?? "";
    const detectedType = this.detectMessageType(msg);
    if (!body.trim() && detectedType === "text") {
      const mtype = msg.message ? Object.keys(msg.message).filter((k) => !k.startsWith("message")).join(",") : "null";
      addLog(this.id, `⏭ no text body and no media — jid=${jid.slice(0, 25)} types=${mtype} pushName=${msg.pushName || "?"}`);
      return;
    }

    // Resolve phone number from JID
    let phone: string;
    if (jid.includes("@s.whatsapp.net")) {
      // Normal JID: 51955135507@s.whatsapp.net
      const digits = jid.replace("@s.whatsapp.net", "");
      if (!digits || digits.length < 8 || digits.length > 15) {
        addLog(this.id, `⏭ Invalid phone: ${digits}`);
        return;
      }
      phone = "+" + digits;
    } else if (jid.includes("@lid")) {
      // LID: try to resolve real phone via participant or msg.key
      const resolved = await this.resolveLidPhone(jid, msg);
      if (!resolved) {
        addLog(this.id, `⏭ LID unresolved: ${jid.slice(0, 25)} — msg: ${body.slice(0, 40)}`);
        return;
      }
      phone = resolved;
      addLog(this.id, `🔗 LID resolved: ${jid.slice(0, 20)} → ${phone}`);
    } else {
      addLog(this.id, `⏭ Unknown JID type: ${jid.slice(0, 30)}`);
      return;
    }

    // Extract contact name (solo aplica para inbound)
    const contactName = isFromMe ? "" : (msg.pushName || "");
    const timestamp = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    if (isFromMe) {
      this.stats.messagesOut = (this.stats.messagesOut || 0) + 1;
      addLog(this.id, `📤 OUT (manual) → ${phone}: ${body.slice(0, 60)}`);
      console.log(`[bot:${this.id}] 📤 (manual) ${phone}: ${body.slice(0, 80)}`);
    } else {
      this.stats.messagesIn++;
      addLog(this.id, `📥 IN from ${contactName || phone}: ${body.slice(0, 60)}`);
      console.log(`[bot:${this.id}] 📥 ${contactName || phone}: ${body.slice(0, 80)}`);
    }

    if (this.testOnly) {
      addLog(this.id, `🧪 TEST mode — saving to CRM (will clean on disconnect)`);
    }

    // Si el msg tiene media y este own_number está mapeado a una campaña
    // electoral, intentamos descargar + upload para tener URL pública. La
    // misma URL la usamos en el push a electoral (handleElectoralEvent) y
    // en `meta` de leads-crm para que el chat de crm.goberna.club pueda
    // renderizar la imagen / audio / video. El upload es idempotente por
    // hash sha256 — re-runs sobre el mismo binario no duplican archivo.
    let mediaInfo: Awaited<ReturnType<typeof this.extractMediaForElectoral>> = null;
    if (detectedType !== "text") {
      const ownDigits = this.phone.replace(/\D/g, "");
      const mapping = getElectoralCampaignFor(ownDigits);
      if (mapping) {
        mediaInfo = await this.extractMediaForElectoral(msg, mapping.campaign_id);
        if (mediaInfo) {
          addLog(this.id, `📦 media uploaded → ${mediaInfo.message_type} ${mediaInfo.media_url.slice(-30)}`);
        }
      }
    }

    // Build meta JSONB para leads-crm. Si no hay media, mandamos solo el tipo
    // detectado (útil para reactions / locations / contacts más adelante).
    const meta: Record<string, unknown> = {
      message_type: detectedType,
    };
    if (mediaInfo) {
      meta.media_url = mediaInfo.media_url;
      meta.media_mime = mediaInfo.media_mime;
      meta.media_size_bytes = mediaInfo.media_size_bytes;
      if (mediaInfo.media_caption) meta.media_caption = mediaInfo.media_caption;
      if (mediaInfo.media_duration_sec) meta.media_duration_sec = mediaInfo.media_duration_sec;
    }

    // 1. Record in CRM (in OR out). Body queda como caption si hay media,
    // sino el texto plano. Meta lleva los detalles del tipo.
    const result = await crmApi.recordMessage({
      phone,
      name: contactName || undefined,
      direction: isFromMe ? "out" : "in",
      body: body || (mediaInfo?.media_caption ?? ""),
      assigned_to: this.phone,
      timestamp,
      external_id: msg.key.id || undefined,
      meta,
    });

    if (!result) { addLog(this.id, `⚠ recordMessage returned null for ${phone}`); return; }
    const { lead, interaction } = result;
    addLog(this.id, `✅ CRM saved: lead=${lead.id} (${lead.name}) interaction=${interaction?.id ?? "dedup"} dir=${isFromMe ? "out" : "in"}`);

    // 2. Classify + auto-reply: SOLO inbound. Mensajes propios del operador
    //    no se clasifican ni disparan auto-reply.
    if (isFromMe) return;

    const classified = classifyMessage(body);
    if (classified.products.length > 0) addLog(this.id, `🏷 Classified: ${classified.products.join(", ")}`);

    // Custom rules dinámicas — el operador/admin las edita en /training y se
    // aplican sin redeploy (cache 60s en classifier.ts). Devuelve un array de
    // tags que matchearon. Se mergean con los tags hardcoded del PRODUCT_RULES.
    const customTags = await applyCustomRules(body).catch(() => []);
    if (customTags.length > 0) addLog(this.id, `🤖 Custom rules: ${customTags.join(", ")}`);

    // Si NO matcheó nada (ni products ni custom), no hay nada que persistir.
    if (classified.products.length === 0 && customTags.length === 0) return;

    if (classified.products.length > 0) {
      console.log(`[bot:${this.id}] 🏷️ Classified: ${classified.products.join(", ")} for ${contactName || phone}`);
    }

    // Persistir clasificación + custom rules tags al lead.
    const productTags = classified.products.map((p) => `interés:${slugifyTag(p)}`);
    const tagsToAdd = [...productTags, ...customTags];
    const primaryCourse = classified.products[0]
      ? getCourse(classified.products[0]) || classified.products[0]
      : null;

    try {
      const existingTags = (lead as { tags?: string[] }).tags ?? [];
      const mergedTags = Array.from(new Set([...existingTags, ...tagsToAdd]));

      await crmApi.updateLead(lead.id, {
        tags: mergedTags,
        ...(primaryCourse && !(lead as { course?: string | null }).course ? { course: primaryCourse } : {}),
      });
      addLog(this.id, `✅ Lead updated: tags+=${tagsToAdd.join(",")}${primaryCourse ? ` course=${primaryCourse}` : ""}`);
    } catch (e: any) {
      addLog(this.id, `⚠ updateLead failed: ${e.message}`);
    }

    // ── AUTO-REPLY (v2: DB-driven) ──────────────────────────────────────
    // Sólo si bot_instances.auto_reply = TRUE para esta instancia. El operador
    // puede activar/desactivar desde /settings sin redeploy. Cooldown 30min
    // por phone para evitar spam.
    try {
      const decision = await decideAutoReply({
        instanceSlug: this.id,
        ownPhone: this.phone,
        fromPhone: phone,
        body,
        classifiedProducts: classified.products,
        customTags,
      });
      if (decision.sent) {
        addLog(this.id, `🤖 auto-reply: matched template "${decision.template_name}"${decision.image_url ? " 📷" : ""} — typing…`);
        const delay = typingDelayFor(decision.body);
        try { await this.sock?.sendPresenceUpdate("composing", jid); } catch {}
        await new Promise((r) => setTimeout(r, delay));
        try { await this.sock?.sendPresenceUpdate("paused", jid); } catch {}
        if (decision.image_url) {
          await this.sendImage(phone, decision.image_url, decision.body);
        } else {
          await this.sendMessage(phone, decision.body);
        }
        addLog(this.id, `🤖 auto-reply SENT (${decision.body.length} chars)`);
        try {
          await crmApi.recordMessage({
            phone,
            direction: "out",
            body: decision.body,
            assigned_to: this.phone,
            timestamp: new Date().toISOString(),
            external_id: `auto-reply-${decision.template_id}-${Date.now()}`,
            meta: {
              message_type: decision.image_url ? "image" : "text",
              auto_reply: true, template_id: decision.template_id, template_name: decision.template_name,
              ...(decision.image_url ? { media_url: decision.image_url } : {}),
            },
          });
        } catch (e: any) {
          addLog(this.id, `⚠ auto-reply log failed: ${e.message}`);
        }

        // Sequence: send follow-up messages (e.g. TEMARIO image after flyer)
        if (decision.sequence && decision.sequence.length > 0) {
          for (const step of decision.sequence) {
            await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
            try {
              if (step.media_kind === "image" && step.image_url) {
                await this.sendImage(phone, step.image_url, step.body || "");
              } else {
                await this.sendMessage(phone, step.body);
              }
              addLog(this.id, `🤖 sequence step SENT: ${step.template_name}`);
              await crmApi.recordMessage({
                phone, direction: "out",
                body: step.body || "",
                assigned_to: this.phone,
                timestamp: new Date().toISOString(),
                external_id: `auto-reply-seq-${step.template_id}-${Date.now()}`,
                meta: {
                  message_type: step.media_kind === "image" ? "image" : "text",
                  auto_reply: true, template_id: step.template_id, template_name: step.template_name,
                  ...(step.image_url ? { media_url: step.image_url } : {}),
                },
              });
            } catch (e: any) {
              addLog(this.id, `⚠ sequence step failed: ${e.message}`);
              break; // stop sequence on first failure
            }
          }
        }
      } else {
        addLog(this.id, `🤖 auto-reply skip: ${decision.reason}`);
      }
    } catch (e: any) {
      addLog(this.id, `⚠ auto-reply error: ${e.message}`);
    }
  }

  // LID → phone cache
  private lidCache = new Map<string, string>();

  private async resolveLidPhone(lid: string, msg: any): Promise<string | null> {
    // Check cache first
    if (this.lidCache.has(lid)) return this.lidCache.get(lid)!;

    // Method 1: msg.key.participantPn — Baileys v7 delivers the real phone JID
    // alongside the LID in this field for DMs and group messages.
    const participantPn: string | undefined = msg.key?.participantPn || msg.participantPn;
    if (participantPn && participantPn.includes("@s.whatsapp.net")) {
      const digits = participantPn.replace("@s.whatsapp.net", "").split(":")[0];
      if (digits.length >= 8 && digits.length <= 15) {
        const phone = "+" + digits;
        this.lidCache.set(lid, phone);
        addLog(this.id, `📇 LID→phone via participantPn: ${lid.slice(0, 20)} → ${phone}`);
        return phone;
      }
    }

    // Method 2: msg.key.participant if it's already a phone JID (legacy path)
    const participant: string | undefined = msg.key?.participant;
    if (participant && participant.includes("@s.whatsapp.net")) {
      const digits = participant.replace("@s.whatsapp.net", "").split(":")[0];
      if (digits.length >= 8 && digits.length <= 15) {
        const phone = "+" + digits;
        this.lidCache.set(lid, phone);
        return phone;
      }
    }

    // Method 3: Baileys v7 LID mapping store — maps LID → PN from prior traffic
    try {
      const repo = (this.sock as any)?.signalRepository;
      const pn: string | null | undefined = await repo?.lidMapping?.getPNForLID?.(lid);
      if (pn && pn.includes("@s.whatsapp.net")) {
        const digits = pn.replace("@s.whatsapp.net", "").split(":")[0];
        if (digits.length >= 8 && digits.length <= 15) {
          const phone = "+" + digits;
          this.lidCache.set(lid, phone);
          addLog(this.id, `📇 LID→phone via lidMapping: ${lid.slice(0, 20)} → ${phone}`);
          return phone;
        }
      }
    } catch (e: any) {
      addLog(this.id, `⚠ lidMapping.getPNForLID failed: ${e.message}`);
    }

    // Could not resolve — do NOT save anything with a fake phone
    addLog(this.id, `⚠ LID not resolved. pushName: ${msg.pushName || "?"}`);
    return null;
  }

  /**
   * Detecta el tipo de mensaje a partir del shape de msg.message. Devuelve un
   * label del enum compartido con electoral wa-events. Útil para que leads-crm
   * sepa qué renderizar (imagen/audio/video/etc) sin tener que inspeccionar
   * el binario por sí solo.
   */
  private detectMessageType(msg: any): "text" | "image" | "audio" | "video" | "document" | "sticker" | "location" | "contact" | "system" {
    const m = msg.message;
    if (!m) return "system";
    if (m.imageMessage) return "image";
    if (m.videoMessage) return "video";
    if (m.audioMessage) return "audio";
    if (m.documentMessage) return "document";
    if (m.stickerMessage) return "sticker";
    if (m.locationMessage || m.liveLocationMessage) return "location";
    if (m.contactMessage || m.contactsArrayMessage) return "contact";
    return "text";
  }

  private extractText(msg: any): string | null {
    const m = msg.message;
    if (!m) return null;
    // Text
    if (m.conversation) return m.conversation;
    if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
    // Media captions
    if (m.imageMessage?.caption) return m.imageMessage.caption;
    if (m.videoMessage?.caption) return m.videoMessage.caption;
    if (m.documentMessage?.caption) return m.documentMessage.caption;
    // Button/list replies (user clicked a button or list item)
    if (m.buttonsResponseMessage?.selectedDisplayText) return m.buttonsResponseMessage.selectedDisplayText;
    if (m.listResponseMessage?.title) return m.listResponseMessage.title;
    if (m.templateButtonReplyMessage?.selectedDisplayText) return m.templateButtonReplyMessage.selectedDisplayText;
    // Interactive responses
    if (m.interactiveResponseMessage?.body?.text) return m.interactiveResponseMessage.body.text;
    return null;
  }

  /** Send a message to a phone number */
  /** Send image via URL with optional caption. Uses Baileys image message. */
  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<void> {
    if (!this.sock || this._status !== "ready") throw new Error("not connected");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) throw new Error(`invalid phone: ${phone}`);
    const jid = digits + "@s.whatsapp.net";
    addLog(this.id, `📤📷 IMG to ${phone}: ${imageUrl.slice(-30)}${caption ? ` · "${caption.slice(0, 40)}"` : ""}`);
    try {
      const result = await this.sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: caption || "",
      });
      const msgId = result?.key?.id;
      addLog(this.id, `✅ IMG SENT ok: msgId=${msgId || "?"}`);
      this.stats.messagesOut++;
    } catch (e: any) {
      addLog(this.id, `❌ IMG SEND FAILED: ${e.message}`);
      throw e;
    }
  }

  async sendMessage(phone: string, text: string): Promise<void> {
    if (!this.sock || this._status !== "ready") throw new Error("not connected");
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) throw new Error(`invalid phone: ${phone} (${digits.length} digits)`);
    const jid = digits + "@s.whatsapp.net";
    addLog(this.id, `📤 SEND to ${phone} (${jid}): ${text.slice(0, 50)}`);
    try {
      const result = await this.sock.sendMessage(jid, { text });
      const msgId = result?.key?.id;
      addLog(this.id, `✅ SENT ok: msgId=${msgId || "?"}`);
      // Cache the payload so retry receipts can be answered. WhatsApp fans the
      // message out to every device of the recipient *and* every companion
      // device of ourselves, so we index under both JIDs — either side may
      // request a retry.
      if (msgId && result?.message) {
        this.cacheMessage(jid, msgId, result.message);
        const meJid = (this.sock as any)?.authState?.creds?.me?.id;
        if (meJid) this.cacheMessage(meJid, msgId, result.message);
      }
      this.stats.messagesOut++;
    } catch (e: any) {
      addLog(this.id, `❌ SEND FAILED: ${e.message}`);
      throw e;
    }
  }

  async destroy(): Promise<void> {
    this.intentionalStop = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    try { this.sock?.end(undefined); } catch {}
    this.sock = null;
    this._status = "disconnected";
    // Test mode: delete session files on disconnect
    if (this.testOnly) {
      const authDir = join(CONFIG.sessionsDir, this.id);
      try { rmSync(authDir, { recursive: true, force: true }); console.log(`[bot:${this.id}] 🧪 [TEST] Session deleted`); } catch {}
    }
  }

  /** Logout: disconnect + delete session + require new QR scan */
  async logout(): Promise<void> {
    addLog(this.id, "🚪 Logging out — deleting session");
    this.intentionalStop = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    try { await this.sock?.logout(); } catch {}
    try { this.sock?.end(undefined); } catch {}
    this.sock = null;
    this._status = "disconnected";
    // Always delete session on logout
    const authDir = join(CONFIG.sessionsDir, this.id);
    try { rmSync(authDir, { recursive: true, force: true }); } catch {}
    console.log(`[bot:${this.id}] Logged out — session deleted`);
    // Restart to generate new QR
    await sleep(2000);
    await this.start();
  }

  async restart(): Promise<void> {
    await this.destroy();
    await sleep(3000);
    await this.start();
  }

  /** Check if a phone number is registered on WhatsApp (diagnostic) */
  async checkOnWhatsApp(phone: string): Promise<{ exists: boolean; jid?: string }> {
    if (!this.sock || this._status !== "ready") throw new Error("not connected");
    const digits = phone.replace(/\D/g, "");
    const res = await this.sock.onWhatsApp(digits);
    const r = res?.[0];
    return { exists: !!r?.exists, jid: r?.jid };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ELECTORAL DUAL-PUSH (Fase 1 UNIFICATION_PLAN, 2026-05-06)
  //
  // Estos métodos no afectan el flujo leads-crm — corren en paralelo y son
  // fire-and-forget. Soportan grupos / media / reacciones / newsletters
  // que el flow original de leads-crm descarta.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Empuja eventos a electoral. Refresca el mapping de phones cada 60s en el
   * primer evento de cada batch (lazy sync, no polling activo).
   */
  private async handleElectoralEvent(msg: any): Promise<void> {
    const ownDigits = this.phone.replace(/\D/g, "");
    const jid: string | undefined = msg.key?.remoteJid;
    if (!jid) return;
    const isFromMe = !!msg.key?.fromMe;

    // Refresh perezoso del mapping de phones electoral.
    await syncElectoralPhones();
    const mapping = getElectoralCampaignFor(ownDigits);
    if (!mapping) return; // own_number no mapeado a electoral, no-op.

    // Status broadcasts: privacy + ruido. Skip incluso para electoral.
    if (isJidStatusBroadcast(jid)) return;

    const isGroup = isJidGroup(jid);
    const isNewsletter = isJidNewsletter(jid);
    const isBroadcast = isJidBroadcast(jid);

    // Resolver phone del autor del mensaje. En 1:1 = el remote_jid; en grupo
    // = msg.key.participantPn o msg.key.participant.
    let senderJid: string | undefined;
    let senderPhone: string | undefined;
    let senderName: string | undefined = isFromMe ? undefined : (msg.pushName || undefined);

    if (isGroup) {
      const participant: string | undefined = msg.key?.participant;
      const participantPn: string | undefined = msg.key?.participantPn;
      senderJid = participantPn || participant;
      if (senderJid?.includes("@s.whatsapp.net")) {
        const digits = senderJid.replace("@s.whatsapp.net", "").split(":")[0];
        if (digits.length >= 8 && digits.length <= 15) senderPhone = "+" + digits;
      }
    } else if (jid.includes("@s.whatsapp.net")) {
      const digits = jid.replace("@s.whatsapp.net", "");
      if (digits.length >= 8 && digits.length <= 15) senderPhone = "+" + digits;
    } else if (jid.includes("@lid")) {
      const resolved = await this.resolveLidPhone(jid, msg);
      if (resolved) senderPhone = resolved;
    }

    // Detect group subject
    let groupSubject: string | undefined;
    if (isGroup && this.sock) {
      try {
        const meta = await this.sock.groupMetadata(jid);
        groupSubject = meta?.subject || undefined;
      } catch {
        // groupMetadata puede fallar si no somos miembros — ignorar.
      }
    }

    // Detectar tipo de mensaje + extraer media si aplica.
    const mediaInfo = await this.extractMediaForElectoral(msg, mapping.campaign_id);
    const messageType = mediaInfo?.message_type ?? "text";
    const text = this.extractText(msg) ?? "";

    // Quoted reply
    const m = msg.message ?? {};
    const ctx = m.extendedTextMessage?.contextInfo
      ?? m.imageMessage?.contextInfo
      ?? m.videoMessage?.contextInfo
      ?? m.audioMessage?.contextInfo
      ?? m.documentMessage?.contextInfo;
    const quotedExternalId = ctx?.stanzaId || undefined;

    const event = {
      own_number: ownDigits,
      jid,
      phone: senderPhone,
      contact_name: senderName,
      direction: (isFromMe ? "out" : "in") as "in" | "out",
      text,
      timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
      external_id: msg.key?.id || undefined,
      message_type: messageType,
      ...(mediaInfo ? {
        media_url: mediaInfo.media_url,
        media_mime: mediaInfo.media_mime,
        media_size_bytes: mediaInfo.media_size_bytes,
        media_caption: mediaInfo.media_caption,
        media_duration_sec: mediaInfo.media_duration_sec,
      } : {}),
      ...(isGroup || isNewsletter || isBroadcast ? { is_group: isGroup, group_subject: groupSubject } : {}),
      ...(isGroup ? { sender_jid: senderJid, sender_name: senderName } : {}),
      ...(quotedExternalId ? { quoted_external_id: quotedExternalId } : {}),
    };

    await pushElectoralEvent(event);
    addLog(this.id, `🛰 electoral push ${messageType}${isGroup ? " group" : ""}${mediaInfo ? " w/media" : ""}`);
  }

  /** Reaction handler — empuja a electoral con message_type='reaction'. */
  private async handleElectoralReaction(r: any): Promise<void> {
    const ownDigits = this.phone.replace(/\D/g, "");
    await syncElectoralPhones();
    const mapping = getElectoralCampaignFor(ownDigits);
    if (!mapping) return;

    const targetExternalId = r.key?.id;
    const reactionEmoji = r.reaction?.text || ""; // empty = unreact
    if (!targetExternalId) return;
    const remoteJid: string | undefined = r.key?.remoteJid;
    if (!remoteJid) return;
    if (isJidStatusBroadcast(remoteJid)) return;

    const isGroup = isJidGroup(remoteJid);
    const isFromMe = !!r.reaction?.key?.fromMe || !!r.key?.fromMe;

    // Resolver phone del que reaccionó
    let senderPhone: string | undefined;
    if (isGroup) {
      const p = r.key?.participantPn || r.key?.participant;
      if (p?.includes("@s.whatsapp.net")) {
        const digits = p.replace("@s.whatsapp.net", "").split(":")[0];
        if (digits.length >= 8 && digits.length <= 15) senderPhone = "+" + digits;
      }
    } else if (remoteJid.includes("@s.whatsapp.net")) {
      const digits = remoteJid.replace("@s.whatsapp.net", "");
      if (digits.length >= 8 && digits.length <= 15) senderPhone = "+" + digits;
    }

    await pushElectoralEvent({
      own_number: ownDigits,
      jid: remoteJid,
      phone: senderPhone,
      direction: isFromMe ? "out" : "in",
      message_type: "reaction",
      text: reactionEmoji,
      external_id: r.reaction?.key?.id || undefined,
      reaction_to_external_id: targetExternalId,
      reaction_emoji: reactionEmoji,
      timestamp: Date.now(),
      ...(isGroup ? { is_group: true } : {}),
    });
    addLog(this.id, `🛰 electoral reaction ${reactionEmoji} → ${targetExternalId.slice(0, 12)}`);
  }

  /**
   * Si el mensaje tiene media adjunta (image/audio/video/doc/sticker), la
   * descarga y la sube al endpoint /api/cms/wa-media de electoral. Devuelve
   * la URL pública + metadata para meter en el wa-event. Null si no hay media
   * o si el upload falló.
   */
  private async extractMediaForElectoral(
    msg: any,
    campaignId: string,
  ): Promise<{
    message_type: string;
    media_url: string;
    media_mime: string;
    media_size_bytes: number;
    media_caption?: string;
    media_duration_sec?: number;
  } | null> {
    const m = msg.message;
    if (!m) return null;

    type MType = { key: string; defaultMime: string; type: string; durationField?: string };
    const mediaTypes: MType[] = [
      { key: "imageMessage", defaultMime: "image/jpeg", type: "image" },
      { key: "videoMessage", defaultMime: "video/mp4", type: "video", durationField: "seconds" },
      { key: "audioMessage", defaultMime: "audio/ogg", type: "audio", durationField: "seconds" },
      { key: "documentMessage", defaultMime: "application/pdf", type: "document" },
      { key: "stickerMessage", defaultMime: "image/webp", type: "sticker" },
    ];
    const found = mediaTypes.find((mt) => m[mt.key]);
    if (!found) return null;

    const node = m[found.key];
    const mime = node.mimetype || found.defaultMime;
    const caption = node.caption || undefined;
    const duration = found.durationField ? node[found.durationField] : undefined;

    let buffer: Buffer;
    try {
      buffer = (await downloadMediaMessage(
        msg,
        "buffer",
        {},
        { logger: undefined as any, reuploadRequest: this.sock!.updateMediaMessage },
      )) as Buffer;
    } catch (e: any) {
      addLog(this.id, `⚠ media download failed (${found.type}): ${e?.message ?? e}`);
      return null;
    }

    const upload = await uploadMediaToElectoral(buffer, mime, campaignId);
    if (!upload) return null;

    return {
      message_type: found.type,
      media_url: upload.url,
      media_mime: mime,
      media_size_bytes: upload.size_bytes,
      media_caption: caption,
      media_duration_sec: duration,
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
