import { describe, it, expect } from "vitest";
import {
  contactIdParams,
  listContactsQuery,
  updateNotesSchema,
  setTagsSchema,
  extensionEventSchema,
  publicContactSchema,
  waPhoneSchema,
  extensionMonitorQuery,
  brigadistasMetricsQuery,
} from "../schemas";

describe("cms/schemas", () => {
  describe("contactIdParams", () => {
    it("accepts valid UUID", () => {
      const r = contactIdParams.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" });
      expect(r.success).toBe(true);
    });
    it("rejects non-UUID", () => {
      const r = contactIdParams.safeParse({ id: "not-a-uuid" });
      expect(r.success).toBe(false);
    });
  });

  describe("listContactsQuery", () => {
    it("uses defaults for empty query", () => {
      const r = listContactsQuery.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.status).toBe("nuevo");
        expect(r.data.limit).toBe(100);
        expect(r.data.offset).toBe(0);
      }
    });
    it("rejects limit > 500", () => {
      const r = listContactsQuery.safeParse({ limit: 999 });
      expect(r.success).toBe(false);
    });
    it("coerces string limit to number", () => {
      const r = listContactsQuery.safeParse({ limit: "50" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.limit).toBe(50);
    });
  });

  describe("updateNotesSchema", () => {
    it("accepts empty object with defaults", () => {
      const r = updateNotesSchema.safeParse({});
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.vote_tier).toBe("contacto_basura");
        expect(r.data.signal_score).toBe(0);
      }
    });
    it("rejects signal_score out of range", () => {
      const r = updateNotesSchema.safeParse({ signal_score: 999 });
      expect(r.success).toBe(false);
    });
    it("accepts valid vote_tier", () => {
      const r = updateNotesSchema.safeParse({ vote_tier: "voto_duro" });
      expect(r.success).toBe(true);
    });
  });

  describe("setTagsSchema", () => {
    it("accepts valid tags array", () => {
      const r = setTagsSchema.safeParse({ tags: ["urgente", "vip"] });
      expect(r.success).toBe(true);
    });
    it("rejects more than 20 tags", () => {
      const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
      const r = setTagsSchema.safeParse({ tags });
      expect(r.success).toBe(false);
    });
    it("rejects empty tag strings", () => {
      const r = setTagsSchema.safeParse({ tags: [""] });
      expect(r.success).toBe(false);
    });
  });

  describe("extensionEventSchema", () => {
    it("accepts message_sent with phone", () => {
      const r = extensionEventSchema.safeParse({ type: "message_sent", phone: "51987654321" });
      expect(r.success).toBe(true);
    });
    it("accepts message_received with contact_name", () => {
      const r = extensionEventSchema.safeParse({ type: "message_received", contact_name: "Juan" });
      expect(r.success).toBe(true);
    });
    it("rejects without phone nor contact_name", () => {
      const r = extensionEventSchema.safeParse({ type: "message_sent" });
      expect(r.success).toBe(false);
    });
  });

  describe("publicContactSchema", () => {
    it("accepts valid public contact", () => {
      const r = publicContactSchema.safeParse({
        campaign_slug: "cesar-vasquez",
        nombre: "Maria Garcia",
        telefono: "987654321",
      });
      expect(r.success).toBe(true);
    });
    it("rejects missing nombre", () => {
      const r = publicContactSchema.safeParse({
        campaign_slug: "test",
        telefono: "987654321",
      });
      expect(r.success).toBe(false);
    });
  });

  describe("waPhoneSchema", () => {
    it("accepts valid phone", () => {
      const r = waPhoneSchema.safeParse({ number: "51987654321", alias: "Celular 1" });
      expect(r.success).toBe(true);
    });
    it("rejects short number", () => {
      const r = waPhoneSchema.safeParse({ number: "123", alias: "Test" });
      expect(r.success).toBe(false);
    });
  });

  describe("extensionMonitorQuery", () => {
    it("accepts valid UUID", () => {
      const r = extensionMonitorQuery.safeParse({ campaign_id: "550e8400-e29b-41d4-a716-446655440000" });
      expect(r.success).toBe(true);
    });
    it("rejects non-UUID", () => {
      const r = extensionMonitorQuery.safeParse({ campaign_id: "not-uuid" });
      expect(r.success).toBe(false);
    });
  });
});
