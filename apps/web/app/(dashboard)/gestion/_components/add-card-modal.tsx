"use client";

import { useState } from "react";
import type { KanbanCardData } from "./kanban-card";

type Props = {
  columnId: string;
  columnTitle: string;
  onAdd: (colId: string, card: KanbanCardData) => void;
  onClose: () => void;
};

export function AddCardModal({ columnId, columnTitle, onAdd, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(columnId, {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: title.trim(),
      subtitle: subtitle.trim() || undefined,
      source: "custom",
      meta: "Ahora",
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(3px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 16,
          padding: "28px 28px 24px",
          width: 420,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(22,57,96,0.4)", marginBottom: 4 }}>
            Agregar a &ldquo;{columnTitle}&rdquo;
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#163960" }}>
            Nueva tarea
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#163960", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
              Titulo *
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Revisar reportes de campaña..."
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1.5px solid #E8EDF5",
                borderRadius: 10,
                fontSize: 14,
                color: "#163960",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#163960"; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#E8EDF5"; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#163960", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>
              Descripcion
            </label>
            <textarea
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Detalle opcional..."
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1.5px solid #E8EDF5",
                borderRadius: 10,
                fontSize: 14,
                color: "#163960",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
              onFocus={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#163960"; }}
              onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#E8EDF5"; }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px",
                background: "#F1F5F9",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                color: "#64748B",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              style={{
                padding: "10px 24px",
                background: title.trim() ? "#163960" : "#E8EDF5",
                border: "none",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                color: title.trim() ? "#FFFFFF" : "#94A3B8",
                cursor: title.trim() ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                transition: "all 0.15s ease",
              }}
            >
              Agregar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
