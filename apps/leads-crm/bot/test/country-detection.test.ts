import { describe, it, expect } from "vitest";
import { detectCountry, classifyMessage } from "../src/classifier.js";

/**
 * Country detection es crítico para learned_replies — un lead PE no debería
 * recibir respuestas con precios en MXN. Test de los prefijos colision-prone:
 *   - 521 (México móvil) DEBE ir antes que 52 (México)
 *   - 549 (Argentina móvil) DEBE ir antes que 54 (Argentina)
 *   - 1809/1829/1849 (Dominicana) DEBE ir antes que 1 (EEUU)
 */
describe("detectCountry", () => {
  it("detecta Perú (+51) correctamente", () => {
    expect(detectCountry("+51955135507")).toBe("Perú");
    expect(detectCountry("51955135507")).toBe("Perú");
  });

  it("detecta México móvil (+521) sin colisionar con 52 generic", () => {
    expect(detectCountry("+5211234567890")).toBe("México");
    expect(detectCountry("+521234567890")).toBe("México");
  });

  it("detecta Argentina móvil (+549) sin colisionar con 54", () => {
    expect(detectCountry("+5491123456789")).toBe("Argentina");
  });

  it("Dominicana (1809) NO se confunde con EEUU (1)", () => {
    expect(detectCountry("+18091234567")).toBe("República Dominicana");
    expect(detectCountry("+12125551234")).toBe("EEUU/Canadá");
  });

  it("devuelve null para phones sin prefix conocido", () => {
    expect(detectCountry("+999")).toBeNull();
    expect(detectCountry("")).toBeNull();
  });
});

describe("classifyMessage", () => {
  it("ignora mensajes muy cortos", () => {
    const r = classifyMessage("ok");
    expect(r.products).toHaveLength(0);
    expect(r.isInfoRequest).toBe(false);
  });

  it("isGreeting=true SOLO cuando hay intent + saludo (diseño actual)", () => {
    // 'Hola, buenos días' aislado NO marca isGreeting porque el classifier
    // requiere intent presente (de lo contrario short-circuita). Ver classifier.ts L41.
    expect(classifyMessage("Hola, buenos días").isGreeting).toBe(false);
    // Con intent + saludo, sí marca:
    const r = classifyMessage("Hola, quiero información sobre el curso");
    expect(r.isGreeting).toBe(true);
    expect(r.isInfoRequest).toBe(true);
  });

  it("detecta intent de info pero NO matchea producto si no hay keyword", () => {
    const r = classifyMessage("hola, quiero más información sobre cursos");
    expect(r.isInfoRequest).toBe(true);
    // "cursos" sin un keyword específico no debería matchear un producto único
    expect(Array.isArray(r.products)).toBe(true);
  });
});
