import { describe, it, expect } from "vitest";
import { detectSensitiveIntent, typingDelayFor } from "../src/auto-reply-v2.js";

/**
 * Tests de detectSensitiveIntent — el último firewall antes de que el bot
 * conteste con LLM/learned_reply algo sobre credenciales o datos personales.
 * Cuando esto matchea, el bot escala a humano sí o sí. Falsos positivos
 * son aceptables (operador atiende). Falsos negativos son catastróficos.
 */
describe("detectSensitiveIntent", () => {
  it("matchea pedidos explícitos de contraseña / clave / credenciales", () => {
    expect(detectSensitiveIntent("cuál es la contraseña del campus?")).toBe("credentials");
    expect(detectSensitiveIntent("dame la clave de acceso")).toBe("credentials");
    expect(detectSensitiveIntent("necesito mis credenciales")).toBe("credentials");
  });

  it("matchea 'olvidé mi contraseña' y variantes de recuperación", () => {
    expect(detectSensitiveIntent("olvidé mi contraseña")).toBe("credentials");
    expect(detectSensitiveIntent("no recuerdo mi clave")).toBe("credentials");
    expect(detectSensitiveIntent("quiero recuperar mi cuenta")).toBe("credentials");
  });

  it("matchea problemas de acceso al campus / plataforma (cualquier reason aplica)", () => {
    // Acá el orden de los SENSITIVE_PATTERNS importa: 'no puedo ingresar' matchea
    // antes la regla 'no me deja...' (credentials) que la 'acceso al campus'
    // (campus_access). Los dos son válidos para escalar — el reason exacto es
    // un detalle interno de logging.
    const validReasons = ["credentials", "campus_access"];
    expect(validReasons).toContain(detectSensitiveIntent("no puedo ingresar al campus"));
    expect(validReasons).toContain(detectSensitiveIntent("no me deja entrar al moodle"));
    expect(validReasons).toContain(detectSensitiveIntent("no consigo acceder al portal"));
  });

  it("matchea DNI con número en el body", () => {
    expect(detectSensitiveIntent("mi DNI es 12345678")).toBe("sensitive_personal_data");
  });

  it("NO matchea consultas neutrales que mencionan 'curso' o 'precio'", () => {
    expect(detectSensitiveIntent("cuál es el precio del curso?")).toBeNull();
    expect(detectSensitiveIntent("info del diplomado por favor")).toBeNull();
    expect(detectSensitiveIntent("hola, quiero inscribirme")).toBeNull();
  });

  it("NO matchea body vacío o muy corto", () => {
    expect(detectSensitiveIntent("")).toBeNull();
    expect(detectSensitiveIntent("ok")).toBeNull();
  });
});

describe("typingDelayFor", () => {
  it("delay base ~1.5s para mensajes cortos", () => {
    expect(typingDelayFor("hola")).toBeGreaterThanOrEqual(1500);
    expect(typingDelayFor("hola")).toBeLessThan(2000);
  });

  it("escala con la longitud", () => {
    const shortDelay = typingDelayFor("hola");
    const longDelay = typingDelayFor("a".repeat(100));
    expect(longDelay).toBeGreaterThan(shortDelay);
  });

  it("cap a 8s para no parecer humano-imposible-de-rápido en mensajes muy largos", () => {
    const veryLong = "a".repeat(2000);
    expect(typingDelayFor(veryLong)).toBe(8_000);
  });
});
