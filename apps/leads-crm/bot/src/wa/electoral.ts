import {
  type WASocket,
  isJidGroup, isJidNewsletter, isJidBroadcast, isJidStatusBroadcast,
  downloadMediaMessage,
} from "baileys";
import {
  pushElectoralEvent, uploadMediaToElectoral,
  syncElectoralPhones, getElectoralCampaignFor,
} from "../crm-api.js";
import { extractText } from "./utils.js";
import type { LidResolver } from "./lid-resolver.js";

/**
 * Electoral dual-push: los mismos mensajes que leads-crm procesa también
 * se empujan a electoral.goberna.club (otro CRM hermano que indexa grupos /
 * newsletters / reactions / media — cosas que leads-crm descarta).
 *
 * Fire-and-forget: si electoral cae, leads-crm sigue funcionando. Si el bot
 * no tiene own_number mapeado a una campaña electoral, todo es no-op.
 */

export interface ElectoralContext {
  sock: () => WASocket | null;
  ownPhone: string;
  lidResolver: LidResolver;
  log: (msg: string) => void;
}

export async function handleElectoralEvent(ctx: ElectoralContext, msg: any): Promise<void> {
  const ownDigits = ctx.ownPhone.replace(/\D/g, "");
  const jid: string | undefined = msg.key?.remoteJid;
  if (!jid) return;
  const isFromMe = !!msg.key?.fromMe;

  // Refresh perezoso del mapping de phones electoral.
  await syncElectoralPhones();
  const mapping = getElectoralCampaignFor(ownDigits);
  if (!mapping) return;

  // Status broadcasts: privacy + ruido. Skip incluso para electoral.
  if (isJidStatusBroadcast(jid)) return;

  const isGroup = isJidGroup(jid);
  const isNewsletter = isJidNewsletter(jid);
  const isBroadcast = isJidBroadcast(jid);

  // Resolver phone del autor del mensaje. En 1:1 = el remote_jid; en grupo
  // = msg.key.participantPn o msg.key.participant.
  let senderJid: string | undefined;
  let senderPhone: string | undefined;
  const senderName: string | undefined = isFromMe ? undefined : (msg.pushName || undefined);

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
    const resolved = await ctx.lidResolver.resolve(jid, msg);
    if (resolved) senderPhone = resolved;
  }

  // Resolve group subject best-effort
  let groupSubject: string | undefined;
  if (isGroup) {
    try {
      const meta = await ctx.sock()?.groupMetadata?.(jid);
      groupSubject = meta?.subject || undefined;
    } catch {
      // groupMetadata puede fallar si no somos miembros — ignorar.
    }
  }

  // Detectar tipo + extraer media si aplica
  const mediaInfo = await extractMediaForElectoral(ctx, msg, mapping.campaign_id);
  const messageType = mediaInfo?.message_type ?? "text";
  const text = extractText(msg) ?? "";

  // Quoted reply context
  const m = msg.message ?? {};
  const ictx = m.extendedTextMessage?.contextInfo
    ?? m.imageMessage?.contextInfo
    ?? m.videoMessage?.contextInfo
    ?? m.audioMessage?.contextInfo
    ?? m.documentMessage?.contextInfo;
  const quotedExternalId = ictx?.stanzaId || undefined;

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
  ctx.log(`🛰 electoral push ${messageType}${isGroup ? " group" : ""}${mediaInfo ? " w/media" : ""}`);
}

/** Reaction → electoral con message_type='reaction'. */
export async function handleElectoralReaction(ctx: ElectoralContext, r: any): Promise<void> {
  const ownDigits = ctx.ownPhone.replace(/\D/g, "");
  await syncElectoralPhones();
  const mapping = getElectoralCampaignFor(ownDigits);
  if (!mapping) return;

  const targetExternalId = r.key?.id;
  const reactionEmoji = r.reaction?.text || "";
  if (!targetExternalId) return;
  const remoteJid: string | undefined = r.key?.remoteJid;
  if (!remoteJid) return;
  if (isJidStatusBroadcast(remoteJid)) return;

  const isGroup = isJidGroup(remoteJid);
  const isFromMe = !!r.reaction?.key?.fromMe || !!r.key?.fromMe;

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
  ctx.log(`🛰 electoral reaction ${reactionEmoji} → ${targetExternalId.slice(0, 12)}`);
}

/**
 * Si el mensaje tiene media adjunta (image/audio/video/doc/sticker), la
 * descarga vía Baileys y la sube a /api/cms/wa-media de electoral. Devuelve
 * la URL pública + metadata. Null si no hay media o el upload falló.
 */
export async function extractMediaForElectoral(
  ctx: ElectoralContext,
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
    { key: "imageMessage",    defaultMime: "image/jpeg",          type: "image" },
    { key: "videoMessage",    defaultMime: "video/mp4",           type: "video", durationField: "seconds" },
    { key: "audioMessage",    defaultMime: "audio/ogg",           type: "audio", durationField: "seconds" },
    { key: "documentMessage", defaultMime: "application/pdf",     type: "document" },
    { key: "stickerMessage",  defaultMime: "image/webp",          type: "sticker" },
  ];
  const found = mediaTypes.find(mt => m[mt.key]);
  if (!found) return null;

  const node = m[found.key];
  const mime = node.mimetype || found.defaultMime;
  const caption = node.caption || undefined;
  const duration = found.durationField ? node[found.durationField] : undefined;

  let buffer: Buffer;
  try {
    const sock = ctx.sock();
    buffer = (await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger: undefined as any, reuploadRequest: sock!.updateMediaMessage },
    )) as Buffer;
  } catch (e: any) {
    ctx.log(`⚠ media download failed (${found.type}): ${e?.message ?? e}`);
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
