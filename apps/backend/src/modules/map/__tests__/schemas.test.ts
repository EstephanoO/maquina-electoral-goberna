import { describe, it, expect } from "vitest";
import {
  provinciasParams,
  distritosParams,
  reverseGeocodeQuery,
  searchDistritosQuery,
  geometryParams,
  tileParams,
} from "../schemas";

describe("map/schemas", () => {
  describe("provinciasParams", () => {
    it("accepts 2-char code", () => {
      const r = provinciasParams.safeParse({ coddep: "15" });
      expect(r.success).toBe(true);
    });
    it("rejects 3-char code", () => {
      const r = provinciasParams.safeParse({ coddep: "150" });
      expect(r.success).toBe(false);
    });
  });

  describe("distritosParams", () => {
    it("accepts 4-char code", () => {
      const r = distritosParams.safeParse({ codprov_full: "1501" });
      expect(r.success).toBe(true);
    });
    it("rejects 3-char code", () => {
      const r = distritosParams.safeParse({ codprov_full: "150" });
      expect(r.success).toBe(false);
    });
  });

  describe("reverseGeocodeQuery", () => {
    it("accepts coords within Peru bounds", () => {
      const r = reverseGeocodeQuery.safeParse({ lng: "-77.03", lat: "-12.04" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.lng).toBeCloseTo(-77.03);
        expect(r.data.lat).toBeCloseTo(-12.04);
      }
    });
    it("rejects longitude outside Peru", () => {
      const r = reverseGeocodeQuery.safeParse({ lng: "-40", lat: "-12" });
      expect(r.success).toBe(false);
    });
  });

  describe("searchDistritosQuery", () => {
    it("accepts valid search with defaults", () => {
      const r = searchDistritosQuery.safeParse({ q: "Lima" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.limit).toBe(20);
    });
    it("rejects empty query", () => {
      const r = searchDistritosQuery.safeParse({ q: "" });
      expect(r.success).toBe(false);
    });
  });

  describe("geometryParams", () => {
    it("accepts valid level", () => {
      const r = geometryParams.safeParse({ level: "dep", code: "15" });
      expect(r.success).toBe(true);
    });
    it("rejects invalid level", () => {
      const r = geometryParams.safeParse({ level: "country", code: "PE" });
      expect(r.success).toBe(false);
    });
  });

  describe("tileParams", () => {
    it("accepts valid tile coordinates", () => {
      const r = tileParams.safeParse({ z: "10", x: "300", y: "500" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.z).toBe(10);
        expect(r.data.x).toBe(300);
      }
    });
    it("rejects z > 22", () => {
      const r = tileParams.safeParse({ z: "25", x: "0", y: "0" });
      expect(r.success).toBe(false);
    });
  });
});
