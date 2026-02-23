import { FONT_STACK } from "@/lib/constants";

const FEATURES = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
    title: "Geovisores Interactivos",
    description:
      "Mapas vectoriales con datos del Peru a nivel de departamento, provincia y distrito. Navegacion drill-down para explorar el territorio completo.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Operacion de Campo",
    description:
      "Gestion de equipos territoriales con tracking en tiempo real, formularios de campo y jerarquias organizacionales.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10" />
        <path d="M12 20V4" />
        <path d="M6 20v-6" />
      </svg>
    ),
    title: "Datos Electorales",
    description:
      "Informacion publica de locales de votacion, candidatos por zona y division politica del Peru visualizada en mapas interactivos.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--goberna-gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <line x1="9" y1="9" x2="15" y2="9" />
        <line x1="9" y1="13" x2="13" y2="13" />
      </svg>
    ),
    title: "CRM Territorial",
    description:
      "Sistema de gestion de contactos con integracion WhatsApp, seguimiento de conversaciones y metricas de alcance por zona.",
  },
] as const;

export function AboutSection() {
  return (
    <section
      id="nosotros"
      style={{
        padding: "96px 24px",
        background: "var(--color-background)",
        fontFamily: FONT_STACK,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Section header */}
        <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 64px" }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--goberna-gold-600)",
              display: "block",
              marginBottom: 16,
            }}
          >
            Grupo Goberna
          </span>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 16px",
              lineHeight: 1.2,
            }}
          >
            Inteligencia territorial para quienes{" "}
            <span style={{ color: "var(--goberna-blue-700)" }}>construyen el Peru</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            Combinamos tecnologia geoespacial con operacion de campo para dar
            visibilidad total sobre el territorio. Desde la data publica hasta
            la gestion privada de campanas.
          </p>
        </div>

        {/* Feature cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 24,
          }}
        >
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              style={{
                padding: 32,
                borderRadius: "var(--radius-lg)",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                transition: "box-shadow 0.2s ease, border-color 0.2s ease",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-md)",
                  background: "var(--goberna-blue-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 20,
                }}
              >
                {feature.icon}
              </div>

              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  margin: "0 0 8px",
                }}
              >
                {feature.title}
              </h3>

              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
