# Paquete 4 — Cambios al bot Baileys

> **Estado**: SPEC — el código no se aplicó todavía. Dejado para ejecutar como parte de Fase 1 del plan de unificación (ver `docs/UNIFICATION_PLAN.md`).

## Contexto

Hoy `/srv/leads-crm/bot/` empuja eventos *solo* a leads-crm-api en `http://api:4000/messages`. El plan de unificación lo convierte en pipe único hacia el core (electoral) — pero como Fase 1 vamos por **dual-push** primero (a ambos backends) para minimizar riesgo en producción.

Además, el bot actualmente:
- **Skip**ea grupos / broadcasts / newsletters (`isJidGroup` etc → return).
- **Descarta** binarios de media — solo extrae `caption`.
- **No subscribe** a `messages.reaction`.
- **No envía** `name=pushName` correctamente al backend (lo manda pero el backend lo ignora — bug #5 de leads-crm).

## Cambios concretos

### 1. `crm-api.ts` — agregar dual-push a electoral

```ts
// Pull list of phones that are mapped to electoral campaigns (every N seconds).
// Cache to avoid hammering /api/cms/active-wa-phones.
const ELECTORAL_BASE = process.env.ELECTORAL_API_URL || "https://api.goberna.us";
const ELECTORAL_BOT_SECRET = process.env.ELECTORAL_BOT_SECRET || "";
let electoralPhones: Map<string /* digits-only own_number */, { campaign_id: string }> = new Map();
let lastPhoneSync = 0;

async function syncElectoralPhones() {
  if (!ELECTORAL_BOT_SECRET) return;
  if (Date.now() - lastPhoneSync < 60_000) return; // 1 min cache
  try {
    const res = await fetch(`${ELECTORAL_BASE}/api/cms/active-wa-phones`, {
      headers: { "X-Bot-Secret": ELECTORAL_BOT_SECRET },
    });
    if (!res.ok) return;
    const j = await res.json() as { phones: Array<{ number: string; campaign_id: string }> };
    electoralPhones = new Map(j.phones.map(p => [p.number, { campaign_id: p.campaign_id }]));
    lastPhoneSync = Date.now();
  } catch {}
}

// Push event to electoral with the extended schema (groups/media/reactions).
// Fire-and-forget: failure to push to electoral never blocks leads-crm flow.
export async function pushElectoralEvent(event: ElectoralWaEvent) {
  if (!ELECTORAL_BOT_SECRET) return;
  const phoneInfo = electoralPhones.get(event.own_number);
  if (!phoneInfo) return; // own_number no está mapeado a ninguna campaign electoral
  try {
    await fetch(`${ELECTORAL_BASE}/api/cms/wa-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bot-Secret": ELECTORAL_BOT_SECRET },
      body: JSON.stringify({ ...event, campaign_id: phoneInfo.campaign_id }),
    });
  } catch (e) {
    console.warn("[bot] electoral push failed:", (e as Error).message);
  }
}

// Upload media binary to electoral so we can attach a media_url to the event.
export async function uploadMediaToElectoral(buffer: Buffer, mime: string, campaignId: string): Promise<string | null> {
  if (!ELECTORAL_BOT_SECRET) return null;
  try {
    const res = await fetch(`${ELECTORAL_BASE}/api/cms/wa-media`, {
      method: "POST",
      headers: {
        "Content-Type": mime,
        "X-Bot-Secret": ELECTORAL_BOT_SECRET,
        "X-Campaign-Id": campaignId,
      },
      body: buffer,
    });
    if (!res.ok) return null;
    const j = await res.json() as { url?: string };
    return j.url ?? null;
  } catch {
    return null;
  }
}
```

### 2. `wa-instance.ts` — quitar skip de grupos/newsletters/broadcasts

```diff
- if (isJidGroup(jid)) { addLog(this.id, `⏭ group ${jid.slice(0, 30)}`); return; }
- if (isJidBroadcast(jid)) { addLog(this.id, `⏭ broadcast ${jid.slice(0, 30)}`); return; }
- if (isJidStatusBroadcast(jid)) { addLog(this.id, `⏭ status ${jid.slice(0, 30)}`); return; }
- if (isJidNewsletter(jid)) { addLog(this.id, `⏭ newsletter ${jid.slice(0, 30)}`); return; }

+ const isGroup = isJidGroup(jid);
+ const isStatus = isJidStatusBroadcast(jid);
+ const isNewsletter = isJidNewsletter(jid);
+ if (isStatus) return; // status updates: never persist (privacy + noise)
+ // Groups + newsletters: persist but tag separately. broadcasts (1:N) we let through.
```

### 3. `wa-instance.ts` — handler de reactions

```ts
this.sock.ev.on("messages.reaction", async (reactions) => {
  for (const r of reactions) {
    const targetExternalId = r.key?.id;
    const reactionEmoji = r.reaction?.text || ""; // empty string = unreact
    const reactionFromMe = !!r.reaction?.key?.fromMe;
    if (!targetExternalId) continue;
    const remoteJid = r.key?.remoteJid;
    if (!remoteJid) continue;

    const phone = await this.resolvePhoneForJid(remoteJid, r);
    if (!phone) continue;

    await pushElectoralEvent({
      own_number: this.phone.replace(/\D/g, ""),
      jid: remoteJid,
      phone,
      direction: reactionFromMe ? "out" : "in",
      message_type: "reaction",
      text: reactionEmoji,
      external_id: r.key?.id,
      reaction_to_external_id: targetExternalId,
      reaction_emoji: reactionEmoji,
      timestamp: Date.now(),
    });
  }
});
```

### 4. `wa-instance.ts` — descarga de media

```ts
import { downloadMediaMessage } from "baileys";

async function extractMedia(msg: any, sock: WASocket, campaignId: string) {
  const m = msg.message;
  if (!m) return null;

  const mediaTypes: Array<{ key: string; mime: string; type: string }> = [
    { key: "imageMessage", mime: m.imageMessage?.mimetype || "image/jpeg", type: "image" },
    { key: "videoMessage", mime: m.videoMessage?.mimetype || "video/mp4", type: "video" },
    { key: "audioMessage", mime: m.audioMessage?.mimetype || "audio/ogg", type: "audio" },
    { key: "documentMessage", mime: m.documentMessage?.mimetype || "application/pdf", type: "document" },
    { key: "stickerMessage", mime: m.stickerMessage?.mimetype || "image/webp", type: "sticker" },
  ];
  for (const mt of mediaTypes) {
    if (m[mt.key]) {
      try {
        const buf = await downloadMediaMessage(msg, "buffer", {}, { logger: undefined as any, reuploadRequest: sock.updateMediaMessage });
        const url = await uploadMediaToElectoral(buf as Buffer, mt.mime, campaignId);
        if (!url) return null;
        return {
          message_type: mt.type,
          media_url: url,
          media_mime: mt.mime,
          media_size_bytes: (buf as Buffer).length,
          media_caption: m[mt.key].caption || "",
          media_duration_sec: m[mt.key].seconds || undefined,
        };
      } catch (e) {
        console.warn("[bot] media download failed:", (e as Error).message);
        return null;
      }
    }
  }
  return null;
}
```

### 5. `config.ts` — agregar env vars

```ts
electoralApiUrl: process.env.ELECTORAL_API_URL || "https://api.goberna.us",
electoralBotSecret: process.env.ELECTORAL_BOT_SECRET || "",
```

Y en `/srv/leads-crm/.env`:
```
ELECTORAL_API_URL=https://api.goberna.us
ELECTORAL_BOT_SECRET=<el mismo BOT_SHARED_SECRET del backend electoral>
```

## Steps de aplicación

```bash
# 1. SSH al server
ssh -i ~/.ssh/id_ed25519 deploy@161.132.39.165

# 2. Backup del bot src
cp -r /srv/leads-crm/bot/src /srv/leads-crm/bot/src.bak-$(date +%s)

# 3. Aplicar diffs (Edit tool desde local + scp, o vim directo)

# 4. Setear ELECTORAL_BOT_SECRET en .env (mismo valor que BOT_SHARED_SECRET del backend electoral)
echo "ELECTORAL_BOT_SECRET=<valor>" >> /srv/leads-crm/.env

# 5. Rebuild + restart
cd /srv/leads-crm
docker compose -f docker-compose.prod.yml build bot
docker compose -f docker-compose.prod.yml up -d bot

# 6. Tail logs para ver dual-push
docker logs -f leads_crm_bot 2>&1 | grep -E "electoral|wa-events"
```

## Verificación

Después del restart, mandar un WSP al `+51944531711` (peru4, ya mapeado a campaign sandbox de electoral):
- ✅ Aparece en `crm.goberna.club` (leads-crm) en línea P4
- ✅ Aparece en `electoral.goberna.club` CMS de la campaña "Pruebas WSP"
- ✅ Si fue media: imagen/audio se ve en electoral con preview
- ✅ Si fue reaction: aparece como overlay en el msg target
