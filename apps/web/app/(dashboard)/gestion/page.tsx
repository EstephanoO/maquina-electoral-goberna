"use client";

/**
 * /gestion — Tablero Kanban de gestión operativa
 *
 * Acceso: admin + consultor (excluye candidato, brigadista, agente)
 * Vinculado a datos reales del sistema: meets, accesos, leads, CMS, soporte.
 *
 * Columnas: Pendiente → En progreso → Completado
 * Las tarjetas de sistema se cargan al montar y son de solo lectura (movibles localmente).
 * Las tarjetas custom se agregan manualmente y persisten en localStorage por sesión.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { KanbanColumn } from "./_components/kanban-column";
import { AddCardModal } from "./_components/add-card-modal";
import { ALLOWED_ROLES, COLUMNS_TEMPLATE, mapRole } from "./gestion-helpers";
import { useGestionBoard } from "./use-gestion-board";

// ── Page component ────────────────────────────────────────────────────
export default function GestionPage() {
  const { user, activeCampaignId } = useAuth();
  const router = useRouter();

  const uiRole = mapRole(user?.role ?? "");

  // Role guard — redirect non-allowed roles
  useEffect(() => {
    if (user && !ALLOWED_ROLES.has(uiRole)) {
      router.replace("/home");
    }
  }, [user, uiRole, router]);

  const { loading, columns, totalCards, handleMove, handleAddCard } = useGestionBoard({
    userId: user?.id,
    activeCampaignId,
  });

  const [addingToCol, setAddingToCol] = useState<{ id: string; title: string } | null>(null);

  // Guard: don't render for unauthorized roles
  if (user && !ALLOWED_ROLES.has(uiRole)) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)" }}>
      {/* Header */}
      <div style={{
        background: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        padding: "20px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "var(--color-text-tertiary)", marginBottom: 4 }}>
            Gestión operativa
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.2 }}>
            Tablero
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 16 }}>
            {columns.map((col) => (
              <div key={col.id} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: col.color }}>{col.cards.length}</div>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--color-text-tertiary)" }}>{col.title}</div>
              </div>
            ))}
          </div>

          {!loading && (
            <div style={{
              padding: "6px 14px",
              background: "var(--color-primary)",
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-on-primary)",
            }}>
              {totalCards} tarjetas
            </div>
          )}
        </div>
      </div>

      {/* Board */}
      <div style={{ padding: "24px 32px", overflowX: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 16 }}>
            {COLUMNS_TEMPLATE.map((col) => (
              <div key={col.id} style={{
                minWidth: 300,
                height: 400,
                background: "var(--color-surface-active)",
                borderRadius: 14,
                border: "1px solid var(--color-border)",
                animation: "pulse 1.5s ease-in-out infinite",
              }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: "fit-content" }}>
            {columns.map((col, idx) => (
              <KanbanColumn
                key={col.id}
                column={col}
                columnIndex={idx}
                totalColumns={columns.length}
                onMove={handleMove}
                onAddCard={(colId) => {
                  const colDef = COLUMNS_TEMPLATE.find((c) => c.id === colId);
                  if (colDef) setAddingToCol({ id: colDef.id, title: colDef.title });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info footer */}
      {!loading && (
        <div style={{ padding: "0 32px 24px" }}>
          <div style={{
            fontSize: 12,
            color: "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-success)", display: "inline-block" }} />
            Datos vinculados al sistema — Solicitudes de acceso, Reuniones, Leads y Soporte se cargan automáticamente.
            Usa las flechas ← → para mover tarjetas entre columnas. Las posiciones se guardan en esta sesión.
          </div>
        </div>
      )}

      {/* Add card modal */}
      {addingToCol && (
        <AddCardModal
          columnId={addingToCol.id}
          columnTitle={addingToCol.title}
          onAdd={handleAddCard}
          onClose={() => setAddingToCol(null)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
