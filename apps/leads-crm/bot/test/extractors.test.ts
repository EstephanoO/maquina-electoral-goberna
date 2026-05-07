import { describe, it, expect } from "vitest";
import { extractFromMessage, buildLeadPatch } from "../src/extractors.js";

/** NER ligero: extracción de email, DNI, ciudad, intent signals. */
describe("extractFromMessage", () => {
  it("extrae email", () => {
    const r = extractFromMessage("hola mi correo es maria@gmail.com gracias");
    expect(r.email).toBe("maria@gmail.com");
  });

  it("extrae DNI peruano (8 dígitos tras 'DNI')", () => {
    const r = extractFromMessage("mi DNI es 12345678 y vivo en Lima");
    expect(r.dni).toBe("12345678");
  });

  it("detecta sales_ready cuando dice 'quiero inscribirme'", () => {
    const r = extractFromMessage("hola, quiero inscribirme en el curso de marketing");
    expect(r.sales_ready).toBe(true);
    expect(r.intent_strength).toBeGreaterThan(0.7);
  });

  it("detecta payment_proof con 'ya hice el pago' (sin acentos)", () => {
    // NOTA: la regex usa \\b, que en JS no matchea correctamente cuando hay
    // acentos al final (í/é). Frases legítimas como 'ya transferí', 'ya pagué',
    // 'ya deposité' NO matchean. Solo variantes ASCII funcionan. Bug
    // pre-existente — fix queda para Sprint 2 (regex unicode-aware con \\p{L}).
    const r = extractFromMessage("ya hice el pago de 250 soles");
    expect(r.payment_proof).toBe(true);
    expect(r.intent_strength).toBe(1.0);
  });

  it("body vacío o muy corto devuelve objeto vacío", () => {
    expect(extractFromMessage("")).toEqual({});
    expect(extractFromMessage("a")).toEqual({});
  });
});

describe("buildLeadPatch", () => {
  it("NO pisa campos ya seteados — política conservadora", () => {
    const patch = buildLeadPatch(
      { email: "old@x.com", dni: "11111111" },
      { email: "new@x.com", dni: "22222222", country: "Perú" }
    );
    expect(patch.email).toBeUndefined();
    expect(patch.dni).toBeUndefined();
    expect(patch.country).toBe("Perú"); // este sí entra (no estaba seteado)
  });

  it("rellena campos null/empty", () => {
    const patch = buildLeadPatch(
      { email: null, country: null },
      { email: "a@b.com", country: "Perú", ocupacion: "abogado" }
    );
    expect(patch.email).toBe("a@b.com");
    expect(patch.country).toBe("Perú");
    expect(patch.ocupacion).toBe("abogado");
  });

  it("trata 'Unknown' como vacío para country (caso histórico de migration)", () => {
    const patch = buildLeadPatch({ country: "Unknown" }, { country: "México" });
    expect(patch.country).toBe("México");
  });
});
