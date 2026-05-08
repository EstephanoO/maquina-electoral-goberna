import { OnboardingStep } from "@/types/onboarding/domain/steps";

/**
 * Onboarding Fase 1 — alta mínima de candidatura (Goberna 2026-05-08).
 *
 * Solo crea la cuenta del candidato con info básica + cargo + jurisdicción +
 * organización política. Sin URL pública, sin DNS, sin QR/WhatsApp, sin
 * "máquina electoral". Lo demás se configura después dentro de la app.
 *
 * Steps:
 *   1. datos          (Nombres / Apellidos / País / DNI / Teléfono)
 *   2. actor          (Candidato / Estratega)
 *   3. level          (Presidencia / Parlamento / Gobierno Local)
 *   4. cargoApi       (cargo + cascada de jurisdicción con mapa)
 *   5. organizacionApi (organización política, opcional)
 *   6. provisioning   (creando cuenta)
 *   7. doneFinal      (entra a Fase 2 — contexto + análisis)
 *
 * NOTA: Sin contraseña en Fase 1. La autenticación real se maneja
 * después (OTP/magic-link). Fase 2 abre al usuario al dashboard
 * con análisis de jurisdicción, electoral y de competencia.
 *
 * Removed:
 *   - role (redundante con cargoApi — pedía cargo dos veces)
 *   - slug (URL pública / DNS — fuera de scope, se configura después)
 *   - waSession / campaignStrategy / strategyCombination /
 *     campaignAssignment (todos fuera de Fase 1)
 */
/**
 * Capítulos lógicos que agrupan los pasos para el indicador de progreso
 * estilo deck. Cada uno aparece como pill "Capítulo X de 5 · Etiqueta"
 * arriba del step en el wizard.
 */
const CH_IDENTIDAD = { num: "01", total: 5, label: "Tu identidad" };
const CH_ROL = { num: "02", total: 5, label: "Tu rol" };
const CH_CANDIDATURA = { num: "03", total: 5, label: "Tu candidatura" };
const CH_IMAGEN = { num: "04", total: 5, label: "Tu imagen" };
const CH_PLATAFORMA = { num: "05", total: 5, label: "Tu plataforma" };

export const onboardingSteps: OnboardingStep[] = [
  {
    id: "datos",
    title: "Empecemos por lo básico",
    subtitle: "Toma menos de 2 minutos.",
    chapter: CH_IDENTIDAD,
    type: "form",
    required: true,
    ctaText: "Continuar",
    fields: [
      {
        id: "firstName",
        label: "Nombres",
        type: "text",
        placeholder: "Ej: Juan Carlos",
        required: true,
        minLength: 2,
        maxLength: 80,
        autoComplete: "given-name",
      },
      {
        id: "lastName",
        label: "Apellidos",
        type: "text",
        placeholder: "Ej: Pérez Quispe",
        required: true,
        minLength: 2,
        maxLength: 80,
        autoComplete: "family-name",
      },
      {
        id: "country",
        label: "País",
        type: "select",
        required: true,
        options: [
          { value: "PE", label: "Perú" },
          { value: "MX", label: "México" },
          { value: "EC", label: "Ecuador" },
        ],
      },
      {
        id: "documentoNumero",
        label: "DNI",
        type: "text",
        placeholder: "12345678",
        required: true,
        minLength: 8,
        maxLength: 12,
        pattern: "^\\d{8,12}$",
        helper: "8 dígitos sin espacios",
      },
      {
        id: "phone",
        label: "Teléfono (opcional)",
        type: "text",
        placeholder: "987654321",
        autoComplete: "tel",
        helper: "Para enviarte el link de acceso por WhatsApp",
      },
    ],
  },

  {
    id: "actor",
    title: "¿Cuál es tu rol en la campaña?",
    chapter: CH_ROL,
    type: "single-select",
    required: true,
    guideText:
      "Ambos roles tienen acceso total a la plataforma. Solo uno puede ser director de la campaña.",
    options: [
      {
        value: "candidate",
        label: "Candidato",
        description: "Te estás preparando para competir",
        icon: "user-check",
      },
      {
        value: "strategist",
        label: "Estratega",
        description: "Diriges la estrategia política",
        icon: "shield",
      },
    ],
  },

  {
    id: "level",
    title: "¿A qué nivel político apuntás?",
    subtitle: "Elegí el nivel de gobierno que te interesa.",
    chapter: CH_ROL,
    type: "single-select",
    required: true,
    options: [
      {
        value: "PRESIDENCIAL",
        label: "Presidencia",
        description: "Presidente",
        icon: "crown",
      },
      {
        value: "PARLAMENTARIO",
        label: "Parlamento",
        description: "Senadores, Diputados, Parlamento Andino",
        icon: "users",
      },
      {
        value: "GOBIERNO_LOCAL",
        label: "Gobierno Local",
        description: "Gobernador Regional, Alcalde Provincial, Alcalde Distrital",
        icon: "building",
      },
    ],
  },

  {
    id: "cargoApi",
    title: "¿A qué cargo apuntás?",
    subtitle: "Según el nivel que elegiste.",
    chapter: CH_CANDIDATURA,
    type: "api-cargo",
    required: true,
  },

  {
    id: "organizacionApi",
    title: "¿Por qué organización política?",
    subtitle:
      "Si vas como independiente o todavía no tenés alianza, podés saltarlo.",
    chapter: CH_CANDIDATURA,
    type: "api-organizacion",
    required: false,
  },

  {
    id: "foto",
    title: "Subí tu foto de campaña",
    subtitle:
      "Va a aparecer en tu deck de análisis y en la plataforma. Si no la tenés ahora, la subís después.",
    chapter: CH_IMAGEN,
    type: "foto-upload",
    required: false,
  },

  {
    id: "provisioning",
    title: "Armando tu Máquina Electoral",
    subtitle: "Cargando contexto, análisis electoral y competencia...",
    chapter: CH_PLATAFORMA,
    type: "provisioning",
  },

  {
    id: "doneFinal",
    title: "Tu campaña ya tiene su sala de guerra",
    subtitle:
      "Entrá al dashboard para ver el análisis de tu jurisdicción y planear tu estrategia.",
    chapter: CH_PLATAFORMA,
    type: "done-final",
  },
];
