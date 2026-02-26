import type { AppEnv } from "../../config/env";

/**
 * Send a Telegram notification when a new lead arrives.
 * Fire-and-forget — never blocks the HTTP response.
 */
export function notifyTelegram(env: AppEnv, nombre: string, correo: string, plataforma: string) {
  if (!env.telegramBotToken || !env.telegramChatId) return;

  const text = `📲 *Nuevo lead TestFlight*\n\n👤 ${nombre}\n📧 ${correo}\n📱 ${plataforma}`;
  const url = `https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: env.telegramChatId,
      text,
      parse_mode: "Markdown",
    }),
  }).catch(() => {
    // Silently ignore — Telegram is best-effort
  });
}
