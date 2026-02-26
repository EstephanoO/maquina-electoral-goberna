/**
 * @deprecated Use `import { tgLead } from "../../infra/telegram"` instead.
 * This file is kept for backwards compatibility but delegates to the central service.
 */
import type { AppEnv } from "../../config/env";
import { tgLead } from "../../infra/telegram";

export function notifyTelegram(_env: AppEnv, nombre: string, correo: string, plataforma: string) {
  tgLead(nombre, correo, plataforma);
}
