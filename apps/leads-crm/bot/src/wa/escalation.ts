import { CONFIG } from "../config.js";

/**
 * Escalation handler: cuando el bot detectó un intent sensible (credenciales /
 * datos personales / acceso a campus), `decideAutoReply` lo flagea y este
 * handler se encarga de:
 *   1. Crear audit row en /escalations (POST)
 *   2. Mandar WhatsApp al notify_phone con el contexto del lead
 *   3. Update audit row con notify_status (sent | failed)
 *
 * Idempotente respecto a la respuesta del lead — esa la mandó decideAutoReply
 * via holding template (no la mandamos de nuevo acá).
 */

export interface EscalationInput {
  reason: string;
  notify_phone: string;
  bot_instance_id: number;
}

export interface EscalationContext {
  /** Quien manda el WhatsApp al operador. La instance lo provee. */
  sendMessage: (phone: string, text: string) => Promise<void>;
  log: (msg: string) => void;
}

export async function handleEscalation(
  ctx: EscalationContext,
  esc: EscalationInput,
  leadId: number | null,
  leadName: string | null,
  leadPhone: string,
  inboundBody: string,
): Promise<void> {
  const apiUrl = process.env.API_URL || "http://api:4000";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CONFIG.apiToken) headers["Authorization"] = `Bearer ${CONFIG.apiToken}`;

  // 1. Audit row
  let escalationId: number | null = null;
  try {
    const r = await fetch(`${apiUrl}/escalations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_id: leadId,
        bot_instance_id: esc.bot_instance_id,
        reason: esc.reason,
        inbound_body: inboundBody,
        notified_phone: esc.notify_phone,
        notify_status: "pending",
      }),
    });
    if (r.ok) {
      const j: any = await r.json();
      escalationId = j.id ?? null;
    }
  } catch (e: any) {
    ctx.log(`⚠ escalation audit failed: ${e.message}`);
  }

  // 2. WhatsApp al operador con contexto. No bloqueante — si falla actualizamos
  //    el row con notify_status='failed'.
  let notifyStatus: "sent" | "failed" = "sent";
  let notifyError: string | null = null;
  const summary =
    `🚨 *Escalation* (${esc.reason})\n` +
    `Lead: ${leadName || leadPhone} (${leadPhone})\n` +
    `Mensaje: "${inboundBody.slice(0, 200)}"` +
    (leadId ? `\n\nhttps://crm.goberna.club/chat?lead=${leadId}` : "");
  try {
    await ctx.sendMessage(esc.notify_phone, summary);
    ctx.log(`🚨 escalation NOTIFIED → ${esc.notify_phone} (${esc.reason})`);
  } catch (e: any) {
    notifyStatus = "failed";
    notifyError = e.message;
    ctx.log(`⚠ escalation notify FAILED → ${esc.notify_phone}: ${e.message}`);
  }

  // 3. Update audit row con resultado
  if (escalationId) {
    try {
      await fetch(`${apiUrl}/escalations/${escalationId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ notify_status: notifyStatus, notify_error: notifyError }),
      });
    } catch { /* fire-and-forget */ }
  }
}
