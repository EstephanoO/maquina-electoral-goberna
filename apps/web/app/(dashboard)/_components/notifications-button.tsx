"use client";

/**
 * NotificationsButton — sidebar dropdown for access requests, leads, support messages.
 * Extracted from layout.tsx (~210 lines).
 */

import { useState, useCallback } from "react";
import { BellIcon } from "./icons";
import { navLinkBase } from "./nav-config";

// ── Types ───────────────────────────────────────────────────────────

type Notification = {
  id: string;
  title: string;
  subtitle?: string;
  type: "access" | "lead" | "support" | "meet";
  time: string;
};

type NotificationsButtonProps = {
  showLabel: boolean;
  isMobile: boolean;
  onClose: () => void;
};

// ── Helpers (module-scope, not recreated per render) ─────────────────

const TYPE_COLORS: Record<string, string> = {
  access: "#F59E0B",
  lead: "#10B981",
  support: "#EF4444",
  meet: "#7C3AED",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

// ── Component ───────────────────────────────────────────────────────

export function NotificationsButton({ showLabel, isMobile, onClose }: NotificationsButtonProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (fetched) return;
    setLoading(true);
    const notifs: Notification[] = [];

    // Access requests
    try {
      const res = await fetch("/api/access-requests", { credentials: "same-origin" });
      if (res.ok) {
        const json = await res.json() as {
          ok: boolean;
          access_requests?: Array<{ id: string; user_full_name?: string; status: string; requested_at: string }>;
        };
        if (json.ok && Array.isArray(json.access_requests)) {
          for (const r of json.access_requests.filter((x) => x.status === "pending").slice(0, 5)) {
            notifs.push({ id: `access-${r.id}`, title: "Solicitud de acceso pendiente", subtitle: r.user_full_name, type: "access", time: relTime(r.requested_at) });
          }
        }
      }
    } catch { /* noop */ }

    // Support conversations
    try {
      const res = await fetch("/api/support/conversations", { credentials: "same-origin" });
      if (res.ok) {
        const json = await res.json() as {
          ok: boolean;
          conversations?: Array<{ other_user_id: string; other_user_name?: string; unread_count?: number; updated_at: string }>;
        };
        if (json.ok && Array.isArray(json.conversations)) {
          for (const c of json.conversations.filter((x) => (x.unread_count ?? 0) > 0).slice(0, 3)) {
            notifs.push({ id: `support-${c.other_user_id}`, title: "Mensaje sin leer", subtitle: c.other_user_name, type: "support", time: relTime(c.updated_at) });
          }
        }
      }
    } catch { /* noop */ }

    // Leads
    try {
      const res = await fetch("/api/leads", { credentials: "same-origin" });
      if (res.ok) {
        const json = await res.json() as {
          ok: boolean;
          leads?: Array<{ id: string; nombre?: string; created_at: string }>;
        };
        if (json.ok && Array.isArray(json.leads)) {
          for (const l of json.leads.slice(0, 3)) {
            notifs.push({ id: `lead-${l.id}`, title: "Nuevo lead", subtitle: l.nombre, type: "lead", time: relTime(l.created_at) });
          }
        }
      }
    } catch { /* noop */ }

    setNotifications(notifs);
    setFetched(true);
    setLoading(false);
  }, [fetched]);

  const handleToggle = useCallback(() => {
    setOpen((o) => {
      if (!o) void fetchNotifications();
      return !o;
    });
  }, [fetchNotifications]);

  const count = notifications.length;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={handleToggle}
        title="Notificaciones"
        style={{
          ...navLinkBase,
          padding: showLabel ? "10px 20px" : "10px 0",
          justifyContent: showLabel ? "flex-start" : "center",
          background: open ? "var(--sidebar-active-bg)" : "transparent",
          borderTop: "1px solid var(--sidebar-border)",
          borderLeft: "3px solid transparent",
          color: open ? "var(--sidebar-text-active)" : "rgba(255,255,255,0.45)",
          fontWeight: open ? 600 : 400,
          position: "relative",
        }}
        aria-label="Notificaciones"
      >
        <span style={{ flexShrink: 0, display: "flex", alignItems: "center", width: 20, justifyContent: "center", position: "relative" }}>
          <BellIcon />
          {count > 0 && (
            <span style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#EF4444",
              fontSize: 9,
              fontWeight: 800,
              color: "#FFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1.5px solid var(--sidebar-bg, #163960)",
            }}>
              {count > 9 ? "9+" : count}
            </span>
          )}
        </span>
        {showLabel && <span>Notificaciones</span>}
        {!showLabel && <span className="sidebar-tooltip">Notificaciones</span>}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 998 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: "absolute",
            bottom: "100%",
            left: showLabel ? 0 : 72,
            width: 320,
            background: "#FFFFFF",
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            zIndex: 999,
            overflow: "hidden",
            marginBottom: 4,
          }}>
            {/* Header */}
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #E8EDF5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#163960" }}>Notificaciones</span>
              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, background: "#EF444418", color: "#EF4444", padding: "2px 8px", borderRadius: 99 }}>
                  {count} nuevas
                </span>
              )}
            </div>

            {/* Content */}
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {loading ? (
                <div style={{ padding: "24px 16px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                  Cargando...
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                  Sin notificaciones
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #F1F5F9",
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: TYPE_COLORS[n.type] ?? "#94A3B8", flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#163960" }}>{n.title}</div>
                      {n.subtitle && <div style={{ fontSize: 12, color: "#64748B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.subtitle}</div>}
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{n.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 16px", borderTop: "1px solid #E8EDF5" }}>
              <a
                href="/gestion"
                onClick={() => { setOpen(false); if (isMobile) onClose(); }}
                style={{ fontSize: 12, fontWeight: 700, color: "#163960", textDecoration: "none" }}
              >
                Ver tablero de gestion →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
