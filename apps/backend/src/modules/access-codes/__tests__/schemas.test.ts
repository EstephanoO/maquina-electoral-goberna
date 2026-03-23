import { describe, it, expect } from "vitest";
import { validateCodeParams, campaignIdParams } from "../schemas";

describe("access-codes/schemas", () => {
  describe("validateCodeParams", () => {
    it("accepts valid code", () => {
      const r = validateCodeParams.safeParse({ code: "ABC123" });
      expect(r.success).toBe(true);
    });
    it("rejects empty code", () => {
      const r = validateCodeParams.safeParse({ code: "" });
      expect(r.success).toBe(false);
    });
    it("trims whitespace", () => {
      const r = validateCodeParams.safeParse({ code: "  ABC123  " });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.code).toBe("ABC123");
    });
  });

  describe("campaignIdParams", () => {
    it("accepts valid UUID", () => {
      const r = campaignIdParams.safeParse({ campaignId: "550e8400-e29b-41d4-a716-446655440000" });
      expect(r.success).toBe(true);
    });
    it("rejects non-UUID", () => {
      const r = campaignIdParams.safeParse({ campaignId: "not-a-uuid" });
      expect(r.success).toBe(false);
    });
  });
});
