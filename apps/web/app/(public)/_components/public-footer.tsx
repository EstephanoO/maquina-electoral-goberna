import { FONT_STACK } from "@/lib/constants";

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        background: "var(--goberna-blue-950)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        padding: "32px 24px",
        fontFamily: FONT_STACK,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: 3,
              color: "var(--goberna-gold)",
            }}
          >
            GOBERNA
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            Grupo Goberna
          </span>
        </div>

        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
          {year} Todos los derechos reservados.
        </span>
      </div>
    </footer>
  );
}
