import type { WASocket } from "baileys";

/**
 * LID → phone resolver con cache. Baileys v7 usa LIDs (anonymous identifiers)
 * para algunos contactos, pero el CRM necesita el phone real para identificar
 * al lead. Tres estrategias en orden de confianza:
 *
 *   1. msg.key.participantPn — Baileys v7 entrega el phone JID junto al LID
 *   2. msg.key.participant — legacy path, ya viene como phone JID
 *   3. lidMapping store — Baileys mapea LID→PN desde tráfico previo
 *
 * Si ninguna funciona, devuelve null (NO inventamos un phone falso —
 * preferimos perder el mensaje a guardar un lead con phone incorrecto).
 */
export class LidResolver {
  private cache = new Map<string, string>();

  constructor(
    private sock: () => WASocket | null,
    private log: (msg: string) => void,
  ) {}

  /** Pre-popula el cache desde un evento contacts.upsert/update. */
  recordContact(id: string, lid: string | undefined): void {
    if (!lid) return;
    if (id?.includes("@s.whatsapp.net")) {
      const phone = "+" + id.replace("@s.whatsapp.net", "");
      this.cache.set(lid, phone);
      this.log(`📇 Contact map: ${lid.slice(0, 20)} → ${phone}`);
    }
  }

  async resolve(lid: string, msg: any): Promise<string | null> {
    if (this.cache.has(lid)) return this.cache.get(lid)!;

    // Method 1: participantPn (Baileys v7)
    const participantPn: string | undefined = msg.key?.participantPn || msg.participantPn;
    if (participantPn && participantPn.includes("@s.whatsapp.net")) {
      const digits = participantPn.replace("@s.whatsapp.net", "").split(":")[0];
      if (digits.length >= 8 && digits.length <= 15) {
        const phone = "+" + digits;
        this.cache.set(lid, phone);
        this.log(`📇 LID→phone via participantPn: ${lid.slice(0, 20)} → ${phone}`);
        return phone;
      }
    }

    // Method 2: participant (legacy path)
    const participant: string | undefined = msg.key?.participant;
    if (participant && participant.includes("@s.whatsapp.net")) {
      const digits = participant.replace("@s.whatsapp.net", "").split(":")[0];
      if (digits.length >= 8 && digits.length <= 15) {
        const phone = "+" + digits;
        this.cache.set(lid, phone);
        return phone;
      }
    }

    // Method 3: Baileys v7 LID mapping store
    try {
      const sock = this.sock();
      const repo = (sock as any)?.signalRepository;
      const pn: string | null | undefined = await repo?.lidMapping?.getPNForLID?.(lid);
      if (pn && pn.includes("@s.whatsapp.net")) {
        const digits = pn.replace("@s.whatsapp.net", "").split(":")[0];
        if (digits.length >= 8 && digits.length <= 15) {
          const phone = "+" + digits;
          this.cache.set(lid, phone);
          this.log(`📇 LID→phone via lidMapping: ${lid.slice(0, 20)} → ${phone}`);
          return phone;
        }
      }
    } catch (e: any) {
      this.log(`⚠ lidMapping.getPNForLID failed: ${e.message}`);
    }

    this.log(`⚠ LID not resolved. pushName: ${msg.pushName || "?"}`);
    return null;
  }
}
