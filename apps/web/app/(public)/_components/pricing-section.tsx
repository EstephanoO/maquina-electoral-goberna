import Link from "next/link";
import { FONT_STACK } from "@/lib/constants";

/* ═══════════════════════════════════════════════════════════════
   Check icon SVG — inline for zero deps
   ═══════════════════════════════════════════════════════════════ */
function CheckIcon({ color = "var(--goberna-gold)" }: { color?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, marginTop: 2 }}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Plan data
   ═══════════════════════════════════════════════════════════════ */

type Plan = {
  name: string;
  badge?: string;
  price: string;
  priceNote?: string;
  strikePrice?: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted?: boolean;
  variant: "basic" | "plus" | "pro" | "enterprise";
};

const PLANS: Plan[] = [
  {
    name: "Basic",
    badge: "Activacion Temporal",
    price: "$390",
    priceNote: "USD/mes",
    description: "Arranca tu operacion territorial con lo esencial para ganar traccion en campo.",
    features: [
      "Hasta 15 agentes de campo",
      "Formularios dinamicos personalizados",
      "Mapa basico de cobertura (heatmap)",
      "Dashboard de metricas esenciales",
      "Exportacion CSV",
      "1 capacitacion estrategica",
    ],
    cta: "Comenzar Ahora",
    ctaHref: "/onboarding",
    variant: "basic",
  },
  {
    name: "Plus",
    badge: "Operacion de Campo",
    price: "$1,800",
    priceNote: "USD/mes",
    description: "Para equipos que ya operan en territorio y necesitan escalar con datos, cobertura y coordinacion real.",
    features: [
      "Hasta 50 agentes de campo",
      "Todo lo de Basic incluido",
      "Mapa de cobertura avanzado con zonas",
      "Coordinacion de brigadistas",
      "Reportes automatizados por zona",
      "Notificaciones en tiempo real",
      "Exportacion avanzada (CSV + PDF)",
      "2 capacitaciones estrategicas",
    ],
    cta: "Elegir Plus",
    ctaHref: "/onboarding",
    variant: "plus",
  },
  {
    name: "Pro",
    badge: "Inteligencia Electoral",
    price: "$4,500",
    priceNote: "USD/mes",
    strikePrice: "$6,000",
    description: "Para campanas serias que necesitan inteligencia territorial completa y operacion a escala.",
    features: [
      "Hasta 120 agentes de campo",
      "Plataformas de mensajeria integrada",
      "Modelos de priorizacion territorial",
      "Zonas calientes y frias automaticas",
      "Cruce de data historica + formularios",
      "Modulo de brigadistas con ranking",
      "API access para WhatsApp",
      "3 capacitaciones estrategicas",
    ],
    cta: "Elegir Pro",
    ctaHref: "/onboarding",
    highlighted: true,
    variant: "pro",
  },
  {
    name: "Enterprise",
    badge: "A Medida",
    price: "Contactar",
    description: "Soluciones a medida para operaciones de gran escala. Agentes ilimitados, mapas personalizados, soporte dedicado.",
    features: [
      "Agentes ilimitados",
      "Mapas personalizados por region",
      "Integraciones custom",
      "Soporte dedicado 24/7",
      "SLA garantizado",
      "Infraestructura on-premise opcional",
    ],
    cta: "Contactar Equipo",
    ctaHref: "https://wa.me/51999999999",
    variant: "enterprise",
  },
];

/* ═══════════════════════════════════════════════════════════════
   Styles helpers
   ═══════════════════════════════════════════════════════════════ */

function getCardStyle(variant: Plan["variant"], highlighted: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    padding: "40px 32px 36px",
    borderRadius: 16,
    fontFamily: FONT_STACK,
    transition: "transform 0.25s ease, box-shadow 0.25s ease",
    flex: "1 1 260px",
    maxWidth: 320,
    minWidth: 260,
  };

  if (highlighted) {
    return {
      ...base,
      background: "linear-gradient(145deg, var(--goberna-blue-950) 0%, var(--goberna-blue-900) 100%)",
      border: "2px solid var(--goberna-gold)",
      boxShadow: "0 0 60px rgba(255,200,0,0.08), 0 20px 40px rgba(0,0,0,0.15)",
      transform: "scale(1.02)",
      zIndex: 2,
    };
  }

  if (variant === "plus") {
    return {
      ...base,
      background: "var(--color-surface)",
      border: "1px solid var(--goberna-blue-200)",
      boxShadow: "0 0 30px rgba(50,112,174,0.06), var(--shadow-md)",
    };
  }

  return {
    ...base,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-md)",
  };
}

function getCtaStyle(variant: Plan["variant"], highlighted: boolean): React.CSSProperties {
  if (highlighted) {
    return {
      display: "block",
      width: "100%",
      textAlign: "center" as const,
      padding: "14px 24px",
      fontSize: 15,
      fontWeight: 700,
      color: "#0f172a",
      textDecoration: "none",
      borderRadius: 10,
      background: "var(--goberna-gold)",
      boxShadow: "0 4px 20px rgba(255,200,0,0.3)",
      transition: "all 0.2s ease",
      fontFamily: FONT_STACK,
      border: "none",
      cursor: "pointer",
    };
  }

  if (variant === "enterprise") {
    return {
      display: "block",
      width: "100%",
      textAlign: "center" as const,
      padding: "14px 24px",
      fontSize: 15,
      fontWeight: 600,
      color: "var(--goberna-blue-900)",
      textDecoration: "none",
      borderRadius: 10,
      background: "transparent",
      border: "2px solid var(--goberna-blue-900)",
      transition: "all 0.2s ease",
      fontFamily: FONT_STACK,
      cursor: "pointer",
    };
  }

  return {
    display: "block",
    width: "100%",
    textAlign: "center" as const,
    padding: "14px 24px",
    fontSize: 15,
    fontWeight: 600,
    color: "#ffffff",
    textDecoration: "none",
    borderRadius: 10,
    background: "var(--goberna-blue-900)",
    transition: "all 0.2s ease",
    fontFamily: FONT_STACK,
    border: "none",
    cursor: "pointer",
  };
}

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

export function PricingSection() {
  return (
    <section
      id="planes"
      style={{
        padding: "96px 24px",
        background: "var(--color-background)",
        fontFamily: FONT_STACK,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
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
            Planes
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
            Elige el plan que{" "}
            <span style={{ color: "var(--goberna-blue-700)" }}>escala contigo</span>
          </h2>
          <p
            style={{
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--color-text-secondary)",
              margin: 0,
            }}
          >
            Desde operaciones de activacion hasta campanas de alcance nacional.
            Cada plan incluye soporte, actualizaciones y acceso completo a la plataforma.
          </p>
        </div>

        {/* Cards */}
        <div
          style={{
            display: "flex",
            gap: 24,
            justifyContent: "center",
            alignItems: "stretch",
            flexWrap: "wrap",
          }}
        >
          {PLANS.map((plan) => {
            const isHighlighted = plan.highlighted ?? false;
            const textColor = isHighlighted ? "#ffffff" : "var(--color-text-primary)";
            const secondaryColor = isHighlighted ? "rgba(255,255,255,0.6)" : "var(--color-text-secondary)";
            const checkColor = isHighlighted ? "var(--goberna-gold)" : "var(--goberna-gold-600)";
            const featureTextColor = isHighlighted ? "rgba(255,255,255,0.85)" : "var(--color-text-secondary)";

            return (
              <div
                key={plan.name}
                style={getCardStyle(plan.variant, isHighlighted)}
              >
                {/* Popular badge for Pro */}
                {isHighlighted && (
                  <div
                    style={{
                      position: "absolute",
                      top: -14,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "6px 20px",
                      borderRadius: 100,
                      background: "var(--goberna-gold)",
                      color: "#0f172a",
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                      boxShadow: "0 4px 12px rgba(255,200,0,0.3)",
                    }}
                  >
                    Mas Popular
                  </div>
                )}

                {/* Badge */}
                {plan.badge && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      color: isHighlighted ? "var(--goberna-gold-300)" : "var(--goberna-gold-600)",
                      marginBottom: 8,
                      display: "block",
                    }}
                  >
                    {plan.badge}
                  </span>
                )}

                {/* Plan name */}
                <h3
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: textColor,
                    margin: "0 0 12px",
                    lineHeight: 1.2,
                  }}
                >
                  {plan.name}
                </h3>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  {plan.strikePrice && (
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: secondaryColor,
                        textDecoration: "line-through",
                        opacity: 0.6,
                      }}
                    >
                      {plan.strikePrice}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: plan.price === "Contactar" ? 28 : 40,
                      fontWeight: 800,
                      color: isHighlighted ? "var(--goberna-gold)" : textColor,
                      lineHeight: 1,
                    }}
                  >
                    {plan.price}
                  </span>
                  {plan.priceNote && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: secondaryColor,
                      }}
                    >
                      {plan.priceNote}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: secondaryColor,
                    margin: "0 0 28px",
                  }}
                >
                  {plan.description}
                </p>

                {/* Divider */}
                <div
                  style={{
                    height: 1,
                    background: isHighlighted ? "rgba(255,255,255,0.1)" : "var(--color-border)",
                    marginBottom: 24,
                  }}
                />

                {/* Features */}
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "0 0 32px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    flex: 1,
                  }}
                >
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        fontSize: 14,
                        lineHeight: 1.5,
                        color: featureTextColor,
                      }}
                    >
                      <CheckIcon color={checkColor} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={plan.ctaHref}
                  style={getCtaStyle(plan.variant, isHighlighted)}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
