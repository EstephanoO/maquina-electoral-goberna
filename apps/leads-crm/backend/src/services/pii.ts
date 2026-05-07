/**
 * PII detection en learned_replies. Si una respuesta histórica de Kathy
 * mencionaba el nombre o teléfono del lead original, no se puede auto-reusar
 * para otro lead — diría "Hola María" a un lead llamado Juan. Se flagea
 * has_pii=true y se ofrece como sugerencia al operador, no auto-uso.
 *
 * Conservador: cualquier match (nombre con ≥4 chars o teléfono) → flag.
 */

export function detectPIIInResponse(
  response: string,
  lead: { name: string | null; phone: string | null }
): { hasPII: boolean; redacted: string | null } {
  let redacted = response;
  let hasPII = false;

  // Phone — variantes comunes (con y sin separadores)
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, "");
    if (digits.length >= 8 && response.includes(digits)) {
      hasPII = true;
      redacted = redacted.replaceAll(digits, "{{telefono}}");
    }
    if (response.includes(lead.phone)) {
      hasPII = true;
      redacted = redacted.replaceAll(lead.phone, "{{telefono}}");
    }
  }

  // Name — solo si tiene ≥4 chars (evita falsos positivos con "Ana", "Eva")
  if (lead.name && lead.name.trim().length >= 4) {
    const name = lead.name.trim();
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
    if (re.test(response)) {
      hasPII = true;
      redacted = redacted.replace(re, "{{nombre}}");
    }
    // Primer nombre solo (ej. "Juan Pérez" → "Juan")
    const firstName = name.split(/\s+/)[0];
    if (firstName.length >= 4) {
      const fre = new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "i");
      if (fre.test(response)) {
        hasPII = true;
        redacted = redacted.replace(fre, "{{nombre}}");
      }
    }
  }

  return { hasPII, redacted: hasPII ? redacted : null };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
