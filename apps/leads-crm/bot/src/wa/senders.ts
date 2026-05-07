import type { WASocket, proto } from "baileys";

/**
 * Senders puros: cada función toma el sock y todos sus deps por param.
 * Hace el send, loguea, y reporta éxito o lanza. La llamada al método de la
 * instancia (`this.sendImage(...)`) sigue funcionando — solo delegamos a
 * estas funciones para mantener la lógica en un solo lugar.
 *
 * Validación común: phone debe tener 8-15 dígitos. Si no, error sincrónico.
 */

export type Logger = (msg: string) => void;

function buildJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    throw new Error(`invalid phone: ${phone} (${digits.length} digits)`);
  }
  return digits + "@s.whatsapp.net";
}

export interface SenderDeps {
  sock: WASocket | null;
  isReady: boolean;
  log: Logger;
  /** Hook llamado tras un send exitoso para que el caller pueda incrementar
   *  stats.messagesOut + cachear el payload para retry receipts. */
  onSent?: (jid: string, msgId: string | undefined, payload: proto.IMessage | undefined) => void;
}

export async function sendDocument(
  deps: SenderDeps,
  phone: string,
  docUrl: string,
  filename: string,
  caption?: string,
  mimetype = "application/pdf",
): Promise<void> {
  if (!deps.sock || !deps.isReady) throw new Error("not connected");
  const jid = buildJid(phone);
  deps.log(`📤📄 DOC to ${phone}: ${filename}`);
  try {
    const result = await deps.sock.sendMessage(jid, {
      document: { url: docUrl },
      mimetype,
      fileName: filename,
      caption: caption || "",
    });
    const msgId = result?.key?.id ?? undefined;
    deps.log(`✅ DOC SENT: msgId=${msgId || "?"}`);
    deps.onSent?.(jid, msgId, result?.message ?? undefined);
  } catch (e: any) {
    deps.log(`❌ DOC SEND FAILED: ${e.message}`);
    throw e;
  }
}

export async function sendVideo(
  deps: SenderDeps,
  phone: string,
  videoUrl: string,
  caption?: string,
): Promise<void> {
  if (!deps.sock || !deps.isReady) throw new Error("not connected");
  const jid = buildJid(phone);
  deps.log(`📤🎬 VID to ${phone}: ${videoUrl.slice(-30)}`);
  try {
    const result = await deps.sock.sendMessage(jid, {
      video: { url: videoUrl },
      caption: caption || "",
    });
    const msgId = result?.key?.id ?? undefined;
    deps.log(`✅ VID SENT: msgId=${msgId || "?"}`);
    deps.onSent?.(jid, msgId, result?.message ?? undefined);
  } catch (e: any) {
    deps.log(`❌ VID SEND FAILED: ${e.message}`);
    throw e;
  }
}

export async function sendImage(
  deps: SenderDeps,
  phone: string,
  imageUrl: string,
  caption?: string,
): Promise<void> {
  if (!deps.sock || !deps.isReady) throw new Error("not connected");
  const jid = buildJid(phone);
  deps.log(`📤📷 IMG to ${phone}: ${imageUrl.slice(-30)}${caption ? ` · "${caption.slice(0, 40)}"` : ""}`);
  try {
    const result = await deps.sock.sendMessage(jid, {
      image: { url: imageUrl },
      caption: caption || "",
    });
    const msgId = result?.key?.id ?? undefined;
    deps.log(`✅ IMG SENT ok: msgId=${msgId || "?"}`);
    deps.onSent?.(jid, msgId, result?.message ?? undefined);
  } catch (e: any) {
    deps.log(`❌ IMG SEND FAILED: ${e.message}`);
    throw e;
  }
}

export async function sendText(
  deps: SenderDeps,
  phone: string,
  text: string,
): Promise<void> {
  if (!deps.sock || !deps.isReady) throw new Error("not connected");
  const jid = buildJid(phone);
  deps.log(`📤 SEND to ${phone} (${jid}): ${text.slice(0, 50)}`);
  try {
    const result = await deps.sock.sendMessage(jid, { text });
    const msgId = result?.key?.id ?? undefined;
    deps.log(`✅ SENT ok: msgId=${msgId || "?"}`);
    deps.onSent?.(jid, msgId, result?.message ?? undefined);
  } catch (e: any) {
    deps.log(`❌ SEND FAILED: ${e.message}`);
    throw e;
  }
}
