import { z } from "zod";

// ── Route params ──────────────────────────────────────────────────
export const otherUserIdParams = z.object({
  otherUserId: z.string().uuid(),
});

// ── Query strings ─────────────────────────────────────────────────
export const messagesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

// ── WebSocket client messages ─────────────────────────────────────
export const wsSendMessage = z.object({
  type: z.literal("send"),
  receiverId: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const wsReadMessage = z.object({
  type: z.literal("read"),
  otherUserId: z.string().uuid(),
});

export const wsClientMessage = z.discriminatedUnion("type", [
  wsSendMessage,
  wsReadMessage,
  z.object({ type: z.literal("ping") }),
]);
