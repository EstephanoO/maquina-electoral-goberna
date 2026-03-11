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
        background: "#F8FAFC",
        borderRadius: 14,
        border: "1px solid #E8EDF5",
        overflow: "hidden",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "14px 16px 12px",
        borderBottom: "1px solid #E8EDF5",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#FFFFFF",
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
            color: "#163960",
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
            color: "rgba(22,57,96,0.3)",
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
            border: "1.5px dashed #D1D9E6",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 12,
            color: "rgba(22,57,96,0.4)",
            fontWeight: 600,
            transition: "all 0.15s ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#94A3B8";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(22,57,96,0.7)";
            (e.currentTarget as HTMLButtonElement).style.background = "#F1F5F9";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#D1D9E6";
            (e.currentTarget as HTMLButtonElement).style.color = "rgba(22,57,96,0.4)";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
        >
          + Agregar tarea
        </button>
      </div>
    </div>
  );
}
