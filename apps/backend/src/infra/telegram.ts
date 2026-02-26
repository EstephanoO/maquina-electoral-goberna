/**
 * GOBERNA — Telegram Notification Service
 *
 * Central fire-and-forget notification to the Goberna Telegram group.
 * All sends are best-effort — never blocks the caller.
 */

import type { AppEnv } from "../config/env";

let _env: AppEnv | null = null;

/** Call once at startup to wire the env config. */
export function initTelegram(env: AppEnv) {
  _env = env;
}

function send(text: string) {
  if (!_env?.telegramBotToken || !_env?.telegramChatId) return;
  const url = `https://api.telegram.org/bot${_env.telegramBotToken}/sendMessage`;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: _env.telegramChatId, text, parse_mode: "Markdown" }),
  }).catch(() => {});
}

// ── Public helpers (one per notification type) ──────────────────

export function tgLead(nombre: string, correo: string, plataforma: string) {
  send(`📲 *Nuevo lead TestFlight*\n\n👤 ${nombre}\n📧 ${correo}\n📱 ${plataforma}`);
}

export function tgServiceDown(service: string) {
  send(`🔴 *ALERTA: ${service} caido*\n\nEl servicio no responde. Revisar VPS.`);
}

export function tgServiceRecovered(service: string) {
  send(`🟢 *${service} recuperado*\n\nEl servicio responde con normalidad.`);
}

export function tgSystemResources(cpu: number, mem: number, disk: number | null) {
  const lines: string[] = [];
  if (cpu > 80) lines.push(`🔥 CPU: ${cpu.toFixed(1)}%`);
  if (mem > 85) lines.push(`🔥 RAM: ${mem.toFixed(1)}%`);
  if (disk !== null && disk > 70) lines.push(`🔥 Disco: ${disk.toFixed(1)}%`);
  if (lines.length === 0) return;
  send(`⚠️ *Recursos criticos VPS*\n\n${lines.join("\n")}`);
}

export function tgQueueBackpressure(domain: "tracking" | "forms") {
  send(`🟠 *Backpressure: ${domain}*\n\nLa cola esta llena, se estan rechazando datos (503).`);
}

export function tgDlq(domain: "tracking" | "forms", reason: string) {
  send(`🔴 *DLQ: ${domain}*\n\nMensaje enviado a dead letter queue.\n${reason}`);
}

export function tgSupportMessage(senderName: string, body: string) {
  const preview = body.length > 200 ? `${body.slice(0, 200)}...` : body;
  send(`💬 *Mensaje de soporte*\n\n👤 ${senderName}\n\n${preview}`);
}
