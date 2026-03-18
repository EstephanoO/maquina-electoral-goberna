"use client";

export type CardTag = {
  label: string;
  color: string; // CSS color string
};

export type KanbanCardData = {
  id: string;
  title: string;
  subtitle?: string;
  tags?: CardTag[];
  badge?: string;
  badgeColor?: string;
  href?: string;
  meta?: string; // e.g. "hace 2h", agente name
  source: "meet" | "cms" | "access" | "lead" | "support" | "custom";
};

export function KanbanCard({ card, onMove, canMoveLeft, canMoveRight }: {
  card: KanbanCardData;
  onMove: (id: string, direction: "left" | "right") => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
}) {
  const sourceColors: Record<KanbanCardData["source"], string> = {
    meet: "#7C3AED",
    cms: "#0EA5E9",
    access: "#F59E0B",
    lead: "#10B981",
    support: "#EF4444",
    custom: "#6B7280",
  };

  const sourceLabels: Record<KanbanCardData["source"], string> = {
    meet: "Reunión",
    cms: "CMS",
    access: "Acceso",
    lead: "Lead",
    support: "Soporte",
    custom: "Tarea",
  };

  const dotColor = sourceColors[card.source];

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        boxShadow: "var(--shadow-sm)",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Source indicator + badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          fontSize: 10,
          fontWeight: 600,
          color: dotColor,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
          {sourceLabels[card.source]}
        </span>
        {card.badge && (
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 99,
            background: card.badgeColor ? `${card.badgeColor}18` : "var(--color-surface-active)",
            color: card.badgeColor ?? "var(--color-text-tertiary)",
          }}>
            {card.badge}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.4 }}>
        {card.href ? (
          <a href={card.href} style={{ color: "inherit", textDecoration: "none" }}>
            {card.title}
          </a>
        ) : card.title}
      </div>

      {/* Subtitle */}
      {card.subtitle && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
          {card.subtitle}
        </div>
      )}

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {card.tags.map((tag) => (
            <span key={tag.label} style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 99,
              background: `${tag.color}18`,
              color: tag.color,
              border: `1px solid ${tag.color}30`,
            }}>
              {tag.label}
            </span>
          ))}
        </div>
      )}

      {/* Footer: meta + move buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        {card.meta && (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{card.meta}</span>
        )}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {canMoveLeft && (
            <button
              type="button"
              onClick={() => onMove(card.id, "left")}
              title="Mover a columna anterior"
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                cursor: "pointer",
                padding: "2px 7px",
                fontSize: 12,
                color: "var(--color-text-tertiary)",
                transition: "all 0.15s ease",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-active)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              ←
            </button>
          )}
          {canMoveRight && (
            <button
              type="button"
              onClick={() => onMove(card.id, "right")}
              title="Mover a siguiente columna"
              style={{
                background: "none",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                cursor: "pointer",
                padding: "2px 7px",
                fontSize: 12,
                color: "var(--color-text-tertiary)",
                transition: "all 0.15s ease",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-active)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
