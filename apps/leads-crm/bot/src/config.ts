/** Central configuration — all env vars read here */

export interface PhoneConfig {
  id: string;
  label: string;
  phone: string;
  testOnly?: boolean;
}

export const CONFIG = {
  port: Number(process.env.BOT_PORT) || 4020,
  apiUrl: process.env.API_URL || "http://localhost:4010",
  apiToken: process.env.API_TOKEN || null,
  // Electoral dual-push (Fase 1 del UNIFICATION_PLAN). Si electoralBotSecret
  // está vacío, no hay dual-push y el bot funciona como antes (solo leads-crm).
  electoralApiUrl: process.env.ELECTORAL_API_URL || "https://api.goberna.us",
  electoralBotSecret: process.env.ELECTORAL_BOT_SECRET || "",
  autoReply: process.env.AUTO_REPLY !== "false",
  autoReplyLeads: process.env.AUTO_REPLY_LEADS ? process.env.AUTO_REPLY_LEADS.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [],
  // AI auto-reply leads (uses Gemini instead of templates)
  aiAutoReplyLeads: process.env.AI_AUTO_REPLY_LEADS ? process.env.AI_AUTO_REPLY_LEADS.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [],
  sessionsDir: process.env.SESSIONS_DIR || "./sessions",
  phones: JSON.parse(
    process.env.PHONES ||
      JSON.stringify([
        { id: "peru1", label: "Perú 1", phone: "+51986855496" },
        { id: "peru2", label: "Perú 2", phone: "+51986394450" },
        { id: "peru3", label: "Perú 3 (Test)", phone: "+51000000000", testOnly: true },
      ])
  ) as PhoneConfig[],
  replyCooldownMs: 30 * 60 * 1000,
  hoursStart: 0,
  hoursEnd: 24,
  hoursSatEnd: 24,
} as const;