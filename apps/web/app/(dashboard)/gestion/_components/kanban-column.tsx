"use client";

import { KanbanCard, type KanbanCardData } from "./kanban-card";

export type KanbanColumnData = {
  id: string;
  title: string;
  color: string;       // accent color
  cards: KanbanCardData[];
};

export function KanbanColumn({
  column,
  columnIndex,
  totalColumns,
  onMove,
  onAddCard,
}: {
  column: KanbanColumnData;
  columnIndex: number;
  totalColumns: number;
  onMove: (cardId: string, fromColId: string, direction: "left" | "right") => void;
  onAddCard: (colId: string) => void;
}) {
  return (
    <div
      style={{
        minWidth: 300,
        maxWidth: 340,
        flex: "0 0 300px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: "var(--color-surface-hover)",
        borderRadius: 14,
        border: "1px solid var(--color-border)",
        overflow: "hidden",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--color-surface)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: column.color,
            flexShrink: 0,
          }} />
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}>
            {column.title}
          </span>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: column.color,
          background: `${column.color}18`,
          padding: "2px 8px",
          borderRadius: 99,
        }}>
          {column.cards.length}
        </span>
      </div>

      {/* Cards list */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 200,
      }}>
        {column.cards.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "32px 16px",
            color: "var(--color-text-tertiary)",
            fontSize: 13,
            fontStyle: "italic",
          }}>
            Sin tarjetas
          </div>
        ) : (
          column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onMove={(id, dir) => onMove(id, column.id, dir)}
              canMoveLeft={columnIndex > 0}
              canMoveRight={columnIndex < totalColumns - 1}
            />
          ))
        )}
      </div>

      {/* Add card button */}
      <div style={{ padding: "8px 12px 12px", flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => onAddCard(column.id)}
          style={{
            width: "100%",
            padding: "8px",
            background: "none",
            border: "1.5px dashed var(--color-border)",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            fontWeight: 600,
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-strong)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-active)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-tertiary)";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
        >
          + Agregar tarea
        </button>
      </div>
    </div>
  );
}
