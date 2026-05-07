/**
 * Agenda module: cuando lead pide agendar una llamada/Zoom, el bot
 *   1. Calcula próximos 3 slots disponibles
 *   2. Los presenta como mensaje legible
 *   3. Cuando lead elige, crea el appointment + envía confirmación
 *
 * Detecta:
 *   - Intent inicial: "quiero agendar", "podemos hablar?"
 *   - Confirmación: "1", "2", "3", "el lunes a las 10"
 *
 * Estado guardado por lead en memoria local (last_proposed_slots).
 * Producción: usar Redis o tabla DB. Por ahora Map en memoria es ok
 * porque el cooldown de 30min ya limita scope.
 */
import { CONFIG } from "./config.js";

export type Slot = {
  iso: string;
  weekday: number;
  hour: number;
  minute: number;
  display: string;        // "Mié 8 May · 10:30 a.m."
};

export type Appointment = {
  id: number; lead_id: number; scheduled_at: string;
  meeting_url: string | null; meeting_kind: string;
  status: string;
};

const proposedSlots = new Map<string, { slots: Slot[]; expiresAt: number }>();
const PROPOSAL_TTL_MS = 30 * 60_000;

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtSlot(d: Date): string {
  const dn = DAY_NAMES[d.getDay()];
  const day = d.getDate();
  const mon = MONTH_NAMES[d.getMonth()];
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ampm = hh >= 12 ? "p.m." : "a.m.";
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${dn} ${day} ${mon} · ${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/** Pulla slots disponibles desde el API. Retorna array Slot[] de próximos. */
export async function getNextSlots(operatorId = 4, count = 3): Promise<Slot[]> {
  try {
    const r = await fetch(`${CONFIG.apiUrl}/appointment-slots/available?operator_id=${operatorId}&limit=${count}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.slots ?? []) as Slot[];
  } catch {
    return [];
  }
}

/** Genera mensaje proponiendo slots. */
export function proposeMessage(slots: Slot[], agentName = "Kathy"): string {
  if (slots.length === 0) {
    return "¡Claro! Por ahora no tengo horarios disponibles online, pero permíteme revisar y te confirmo los próximos slots libres. 🙏";
  }
  const lines = slots.map((s, i) => `${i + 1}. ${s.display}`);
  return [
    `¡Genial! Te propongo estos horarios para nuestra llamada (hora Perú, GMT-5):`,
    "",
    ...lines,
    "",
    `Respondé con el número (1, 2 o 3) o decime otra hora que te acomode 🙂`,
    `— ${agentName}`,
  ].join("\n");
}

/** Guarda los slots propuestos por phone para matchear la respuesta. */
export function saveProposedSlots(phone: string, slots: Slot[]) {
  proposedSlots.set(phone, { slots, expiresAt: Date.now() + PROPOSAL_TTL_MS });
}

/** Devuelve slots propuestos si aún válidos. */
export function getProposedSlots(phone: string): Slot[] | null {
  const e = proposedSlots.get(phone);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { proposedSlots.delete(phone); return null; }
  return e.slots;
}

/** Detecta si la respuesta del lead elige un slot. */
export function pickSlotFromReply(body: string, slots: Slot[]): Slot | null {
  if (!slots || slots.length === 0) return null;
  const trimmed = body.trim().toLowerCase();

  // 1. Single digit answer
  const numM = trimmed.match(/^(\d)/);
  if (numM) {
    const idx = Number(numM[1]) - 1;
    if (idx >= 0 && idx < slots.length) return slots[idx];
  }

  // 2. "el lunes" / "el martes" — match weekday
  const dayMap: Record<string, number> = {
    "domingo": 0, "lunes": 1, "martes": 2, "miércoles": 3, "miercoles": 3,
    "jueves": 4, "viernes": 5, "sábado": 6, "sabado": 6,
  };
  for (const [name, wd] of Object.entries(dayMap)) {
    if (trimmed.includes(name)) {
      const slot = slots.find(s => s.weekday === wd);
      if (slot) return slot;
    }
  }

  // 3. Hour mention "10am", "10:30", "a las 11"
  const hourM = trimmed.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(a\.?m\.?|p\.?m\.?))?/);
  if (hourM) {
    let hr = Number(hourM[1]);
    const min = Number(hourM[2] ?? 0);
    const ampm = hourM[3]?.toLowerCase().replace(".", "");
    if (ampm === "pm" && hr < 12) hr += 12;
    if (ampm === "am" && hr === 12) hr = 0;
    const slot = slots.find(s => s.hour === hr && s.minute === min);
    if (slot) return slot;
  }

  return null;
}

/** Crea appointment vía API. */
export async function createAppointment(opts: {
  lead_id: number;
  scheduled_at: string;
  operator_id?: number;
  bot_instance_id?: number;
  meeting_url?: string;
  notes?: string;
}): Promise<Appointment | null> {
  try {
    const r = await fetch(`${CONFIG.apiUrl}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...opts, created_via: "bot" }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Mensaje de confirmación post-booking. */
export function confirmationMessage(slot: Slot, meetingUrl: string | null, agentName = "Kathy"): string {
  const lines = [
    `¡Perfecto! Tu llamada queda confirmada para:`,
    "",
    `📅 ${slot.display}`,
  ];
  if (meetingUrl) {
    lines.push(`🔗 Link: ${meetingUrl}`);
  } else {
    lines.push(`Te pasaré el link unas horas antes 🙂`);
  }
  lines.push("", `Nos vemos! ☺`, `— ${agentName}`);
  return lines.join("\n");
}

/** Helper: re-export fmtSlot para uso desde el endpoint. */
export { fmtSlot };
