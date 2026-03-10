"use client";

/**
 * GOBERNA — Agent Quality Control
 *
 * Per-operator quality dashboard showing:
 * - Red-flag alert cards (anomalies)
 * - Per-operator table merging extension-monitor + conversation stats
 * - Expandable conversation detail with message thread + AI reason
 *
 * Uses same dark palette (G) and inline styles as the rest of the monitor.
 */

import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  getExtensionMonitor,
  type ExtensionMonitorPhone,
  type ExtensionMonitorOperator,
} from "@/lib/services/cms";
import {
  getConversationStats,
  getConversations,
  type Conversation,
  type ConversationStats,
} from "@/lib/services/conversations";

// ── Palette (shared with page.tsx) ──────────────────────────────────
const G = {
  gold: "#FFC800",
  goldDim: "#CC9F00",
  goldFaint: "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)",
  bg: "#060e18",
  surface: "#0c1a28",
  surfaceUp: "#0f2035",
  border: "rgba(255,255,255,0.06)",
  text: "#e9eef3",
  textMid: "#7a95aa",
  textDim: "#334d63",
  green: "#22c55e",
  red: "#ef5350",
  blue: "#3b82f6",
  orange: "#f59e0b",
  purple: "#a855f7",
  cyan: "#06b6d4",
} as const;

// ── Types ───────────────────────────────────────────────────────────

type OperatorRow = {
  operator_id: string;
  name: string;
  phones: string[];
  wa_sent: number;
  unique_contacts: number;
  msgs_per_contact: number;
  conversations_total: number;
  conversations_classified: number;
  conversations_with_inbound: number;
  response_rate: number;
  by_vote_class: Record<string, number>;
};

type Alert = {
  id: string;
  severity: "high" | "medium";
  title: string;
  detail: string;
  operator: string;
  metric: string;
  value: string;
};

// ── Helpers ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "\u2014";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function voteClassColor(vc: string): string {
  if (vc.includes("duro")) return G.green;
  if (vc.includes("blando")) return G.cyan;
  if (vc.includes("invalido") || vc.includes("basura")) return G.red;
  return G.textMid;
}

function voteClassLabel(vc: string): string {
  if (vc.includes("duro")) return "Duro";
  if (vc.includes("blando")) return "Blando";
  if (vc.includes("invalido") || vc.includes("basura")) return "Invalido";
  return vc;
}

// ══════════════════════════════════════════════════════════════════════
// ALERT CARD
// ══════════════════════════════════════════════════════════════════════

function AlertCard({ alert }: { alert: Alert }) {
  const borderColor = alert.severity === "high" ? G.red : G.orange;
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 12,
      background: `linear-gradient(135deg, ${G.surface} 0%, ${alert.severity === "high" ? "rgba(239,83,80,0.06)" : "rgba(245,158,11,0.06)"} 100%)`,
      border: `1px solid ${borderColor}30`,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, width: 3, height: "100%",
        background: borderColor,
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: borderColor }}>
          {alert.severity === "high" ? "\u26A0" : "\u26A1"} {alert.title}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
          background: `${borderColor}18`, color: borderColor,
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          {alert.severity}
        </span>
      </div>
      <div style={{ fontSize: 11, color: G.textMid, lineHeight: 1.4 }}>{alert.detail}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: G.text }}>{alert.operator}</span>
        <span style={{ fontSize: 10, color: G.textDim }}>{alert.metric}: <span style={{ color: borderColor, fontWeight: 800 }}>{alert.value}</span></span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CONVERSATION DETAIL PANEL
// ══════════════════════════════════════════════════════════════════════

function ConversationDetail({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.goldBorder}`, borderRadius: 14,
      padding: "20px 24px", marginTop: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: G.gold }}>
            {conv.contact_name ?? conv.phone ?? conv.jid}
          </div>
          <div style={{ fontSize: 10, color: G.textDim, marginTop: 2 }}>
            Linea: {conv.own_number} | {conv.message_count} msgs | {conv.inbound_count} inbound
          </div>
        </div>
        <button type="button" onClick={onClose} style={{
          background: "transparent", border: `1px solid ${G.border}`, borderRadius: 8,
          color: G.textMid, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer",
        }}>
          Cerrar
        </button>
      </div>

      {/* Classification */}
      {conv.vote_class && (
        <div style={{
          display: "flex", gap: 10, alignItems: "center", marginBottom: 14,
          padding: "10px 14px", borderRadius: 10,
          background: `${voteClassColor(conv.vote_class)}10`,
          border: `1px solid ${voteClassColor(conv.vote_class)}25`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: voteClassColor(conv.vote_class) }}>
            {voteClassLabel(conv.vote_class)}
          </span>
          {conv.category && (
            <span style={{ fontSize: 10, color: G.textMid }}>
              Cat: {conv.category}
            </span>
          )}
          {conv.confidence != null && (
            <span style={{ fontSize: 10, color: G.textDim }}>
              {Math.round(conv.confidence * 100)}% conf
            </span>
          )}
        </div>
      )}

      {/* AI Reason */}
      {conv.reason && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 14,
          background: "rgba(168,85,247,0.06)", border: `1px solid rgba(168,85,247,0.15)`,
          fontSize: 11, color: G.textMid, lineHeight: 1.5, fontStyle: "italic",
        }}>
          <span style={{ fontWeight: 800, color: G.purple, fontStyle: "normal" }}>IA: </span>
          {conv.reason}
        </div>
      )}

      {/* Message thread */}
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {(conv.messages ?? []).map((msg, i) => {
          const isIn = msg.d === "in";
          return (
            <div key={`${msg.ts}-${msg.d}`} style={{
              alignSelf: isIn ? "flex-start" : "flex-end",
              maxWidth: "75%", padding: "8px 12px", borderRadius: 10,
              background: isIn ? "rgba(34,197,94,0.10)" : "rgba(59,130,246,0.10)",
              border: `1px solid ${isIn ? "rgba(34,197,94,0.18)" : "rgba(59,130,246,0.18)"}`,
            }}>
              <div style={{ fontSize: 11, color: G.text, lineHeight: 1.4, wordBreak: "break-word" }}>
                {msg.t}
              </div>
              <div style={{ fontSize: 9, color: G.textDim, marginTop: 3, textAlign: "right" }}>
                {msg.op && <span style={{ marginRight: 6 }}>{msg.op}</span>}
                {new Date(msg.ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
        {(!conv.messages || conv.messages.length === 0) && (
          <div style={{ fontSize: 11, color: G.textDim, textAlign: "center", padding: 20 }}>
            Sin mensajes registrados
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════

export function AgentQuality({ campaignId }: { campaignId: string }) {
  // ── State ───────────────────────────────────────────────────────
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [convStats, setConvStats] = useState<ConversationStats | null>(null);
  const [suspectConvs, setSuspectConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [sortKey, setSortKey] = useState<"wa_sent" | "msgs_per_contact" | "response_rate">("wa_sent");
  const [sortAsc, setSortAsc] = useState(false);

  // ── Data load ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [monitorRes, statsRes, invalidRes] = await Promise.all([
        getExtensionMonitor(campaignId),
        getConversationStats(campaignId),
        getConversations(campaignId, { classified_by: "gemini", limit: 30 }),
      ]);

      if (!monitorRes.ok) { setError(monitorRes.error ?? "Error loading monitor"); return; }
      const phones = monitorRes.phones ?? [];

      // Build per-operator from extension-monitor
      const opMap = new Map<string, {
        name: string; phones: Set<string>; wa_sent: number; unique_contacts: number;
      }>();

      for (const phone of phones) {
        const alias = phone.alias ?? phone.own_number;
        for (const op of phone.operators) {
          const existing = opMap.get(op.operator_id);
          if (existing) {
            existing.phones.add(alias);
            existing.wa_sent += op.wa_sent;
            existing.unique_contacts += op.unique_phones;
          } else {
            opMap.set(op.operator_id, {
              name: op.full_name || op.email.split("@")[0],
              phones: new Set([alias]),
              wa_sent: op.wa_sent,
              unique_contacts: op.unique_phones,
            });
          }
        }
      }

      // Merge with conversation stats by_owner
      const stats = statsRes.ok ? (statsRes.stats ?? null) : null;
      setConvStats(stats);

      const ownerMap = new Map<string, {
        count: number; classified: number;
      }>();
      if (stats?.by_owner) {
        for (const o of stats.by_owner) {
          ownerMap.set(o.owner_id, { count: o.count, classified: o.classified });
        }
      }

      // Build final rows
      const rows: OperatorRow[] = [];
      for (const [opId, opData] of opMap) {
        const convData = ownerMap.get(opId);
        const mpc = opData.unique_contacts > 0
          ? Math.round((opData.wa_sent / opData.unique_contacts) * 10) / 10
          : 0;
        rows.push({
          operator_id: opId,
          name: opData.name,
          phones: [...opData.phones],
          wa_sent: opData.wa_sent,
          unique_contacts: opData.unique_contacts,
          msgs_per_contact: mpc,
          conversations_total: convData?.count ?? 0,
          conversations_classified: convData?.classified ?? 0,
          conversations_with_inbound: 0, // requires per-owner query, leave 0 for now
          response_rate: 0,
          by_vote_class: {},
        });
      }

      setOperators(rows);

      // Build alerts
      const newAlerts: Alert[] = [];
      for (const row of rows) {
        if (row.msgs_per_contact > 15) {
          newAlerts.push({
            id: `spam-${row.operator_id}`,
            severity: row.msgs_per_contact > 20 ? "high" : "medium",
            title: "Posible Spam",
            detail: `${row.name} envia en promedio ${row.msgs_per_contact} mensajes por contacto. Valor esperado: 8-12.`,
            operator: row.name,
            metric: "Msgs/Contacto",
            value: String(row.msgs_per_contact),
          });
        }
        if (row.unique_contacts < 10 && row.wa_sent > 50) {
          newAlerts.push({
            id: `low-reach-${row.operator_id}`,
            severity: "medium",
            title: "Bajo Alcance",
            detail: `${row.name} envio ${row.wa_sent} msgs a solo ${row.unique_contacts} contactos unicos. Puede estar re-enviando al mismo grupo.`,
            operator: row.name,
            metric: "Contactos Unicos",
            value: String(row.unique_contacts),
          });
        }
        if (row.wa_sent > 200 && row.conversations_total === 0) {
          newAlerts.push({
            id: `no-convs-${row.operator_id}`,
            severity: "medium",
            title: "Sin Conversaciones",
            detail: `${row.name} tiene ${row.wa_sent} envios pero 0 conversaciones registradas. Extension puede no estar activa.`,
            operator: row.name,
            metric: "Conversaciones",
            value: "0",
          });
        }
      }
      setAlerts(newAlerts.sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1)));

      // Suspect conversations (invalido + zero inbound)
      if (invalidRes.ok && invalidRes.items) {
        const suspect = invalidRes.items.filter(c =>
          c.vote_class?.includes("invalido") || c.vote_class?.includes("basura") || c.inbound_count === 0
        );
        setSuspectConvs(suspect.slice(0, 15));
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Sort ───────────────────────────────────────────────────────
  const handleSort = useCallback((key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey]);

  const sorted = [...operators].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    return (a[sortKey] - b[sortKey]) * mul;
  });

  // ── Chart data ─────────────────────────────────────────────────
  const chartData = operators
    .filter(op => op.wa_sent > 0)
    .sort((a, b) => b.msgs_per_contact - a.msgs_per_contact)
    .map(op => ({
      name: op.name.split(" ")[0],
      ratio: op.msgs_per_contact,
      flagged: op.msgs_per_contact > 15,
    }));

  // ── Vote class chart ───────────────────────────────────────────
  const voteClasses = convStats?.by_vote_class ?? {};
  const voteChartData = Object.entries(voteClasses).map(([cls, count]) => ({
    name: voteClassLabel(cls),
    value: count as number,
    color: voteClassColor(cls),
  }));

  // ── Render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: G.textDim, fontSize: 13 }}>
        Cargando datos de calidad...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: "20px 0", background: "rgba(239,83,80,0.07)",
        border: "1px solid rgba(239,83,80,0.22)", borderRadius: 10,
        padding: "14px 20px", fontSize: 13, color: G.red,
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ══ KPI Strip ══ */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <KpiCard label="Operadores" value={operators.length} color={G.gold} />
        <KpiCard label="Total Enviados" value={operators.reduce((s, o) => s + o.wa_sent, 0)} color={G.cyan} />
        <KpiCard label="Contactos Unicos" value={operators.reduce((s, o) => s + o.unique_contacts, 0)} color={G.blue} />
        <KpiCard label="Conversaciones" value={convStats?.total ?? 0} color={G.purple} />
        <KpiCard label="Clasificadas" value={convStats?.classified ?? 0} color={G.green} />
        <KpiCard label="Alertas" value={alerts.length} color={alerts.length > 0 ? G.red : G.green} />
      </div>

      {/* ══ Alerts ══ */}
      {alerts.length > 0 && (
        <div>
          <div style={{
            fontSize: 12, fontWeight: 900, color: G.red, letterSpacing: "0.6px",
            textTransform: "uppercase", marginBottom: 10, paddingLeft: 4,
          }}>
            Alertas de Calidad ({alerts.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10 }}>
            {alerts.map(a => <AlertCard key={a.id} alert={a} />)}
          </div>
        </div>
      )}

      {/* ══ Two-column: Charts ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Msgs per contact bar chart */}
        <div style={{
          background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 900, color: G.gold, letterSpacing: "0.6px",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            Ratio Msgs / Contacto
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: G.textDim, fontSize: 10 }}
                  axisLine={{ stroke: G.border }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: G.textDim, fontSize: 10 }}
                  axisLine={{ stroke: G.border }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: G.surfaceUp, border: `1px solid ${G.border}`,
                    borderRadius: 8, fontSize: 11, color: G.text,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="ratio" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.flagged ? G.red : G.cyan} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: G.textDim, fontSize: 11, padding: 20, textAlign: "center" }}>Sin datos</div>
          )}
          <div style={{ fontSize: 9, color: G.textDim, marginTop: 4, textAlign: "center" }}>
            Rojo = ratio &gt; 15 (sospecha de spam)
          </div>
        </div>

        {/* Vote class breakdown */}
        <div style={{
          background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 900, color: G.gold, letterSpacing: "0.6px",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            Clasificaciones por Tipo
          </div>
          {voteChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={voteChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: G.textDim, fontSize: 10 }}
                  axisLine={{ stroke: G.border }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: G.textDim, fontSize: 10 }}
                  axisLine={{ stroke: G.border }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: G.surfaceUp, border: `1px solid ${G.border}`,
                    borderRadius: 8, fontSize: 11, color: G.text,
                  }}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {voteChartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: G.textDim, fontSize: 11, padding: 20, textAlign: "center" }}>Sin clasificaciones</div>
          )}
        </div>
      </div>

      {/* ══ Operator Table ══ */}
      <div style={{
        background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${G.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{
            fontSize: 12, fontWeight: 900, color: G.gold, letterSpacing: "0.6px",
            textTransform: "uppercase",
          }}>
            Rendimiento por Operador
          </span>
          <button type="button" onClick={loadData} style={{
            padding: "4px 12px", borderRadius: 6,
            border: `1px solid ${G.goldBorder}`, background: G.goldFaint,
            color: G.gold, fontSize: 10, fontWeight: 800, cursor: "pointer",
          }}>
            {"\u21BB"} Refrescar
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${G.border}` }}>
                {[
                  { key: null, label: "Operador" },
                  { key: null, label: "Linea(s)" },
                  { key: "wa_sent" as const, label: "Enviados" },
                  { key: null, label: "Contactos" },
                  { key: "msgs_per_contact" as const, label: "Msgs/Contacto" },
                  { key: null, label: "Convs" },
                  { key: null, label: "Clasificadas" },
                  { key: "response_rate" as const, label: "Con Inbound" },
                ].map((col) => (
                  <th
                    key={col.label}
                    onClick={col.key ? () => handleSort(col.key!) : undefined}
                    onKeyDown={col.key ? (e) => { if (e.key === "Enter" || e.key === " ") handleSort(col.key!); } : undefined}
                    style={{
                      padding: "10px 14px", textAlign: col.label === "Operador" ? "left" : "right",
                      fontWeight: 800, color: G.textMid, textTransform: "uppercase",
                      letterSpacing: "0.5px", fontSize: 9,
                      cursor: col.key ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    {col.label}
                    {col.key && sortKey === col.key && (
                      <span style={{ marginLeft: 3 }}>{sortAsc ? "\u25B2" : "\u25BC"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((op) => {
                const flagged = op.msgs_per_contact > 15;
                return (
                  <tr
                    key={op.operator_id}
                    style={{
                      borderBottom: `1px solid ${G.border}`,
                      background: flagged ? "rgba(239,83,80,0.04)" : "transparent",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${G.surfaceUp}`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = flagged ? "rgba(239,83,80,0.04)" : "transparent"; }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: flagged ? G.red : G.text }}>
                      {flagged && <span style={{ marginRight: 4 }}>{"\u26A0"}</span>}
                      {op.name}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.textDim }}>
                      {op.phones.map(p => p.replace("Vasquez ", "V")).join(", ")}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: G.gold }}>
                      {op.wa_sent.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.cyan }}>
                      {op.unique_contacts}
                    </td>
                    <td style={{
                      padding: "10px 14px", textAlign: "right", fontWeight: 800,
                      color: op.msgs_per_contact > 15 ? G.red : op.msgs_per_contact > 12 ? G.orange : G.green,
                    }}>
                      {op.msgs_per_contact}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.purple }}>
                      {op.conversations_total}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.green }}>
                      {op.conversations_classified}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.blue }}>
                      {op.conversations_with_inbound}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 20, textAlign: "center", color: G.textDim }}>
                    Sin datos de operadores
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ Suspect Conversations ══ */}
      {suspectConvs.length > 0 && (
        <div style={{
          background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 12, fontWeight: 900, color: G.orange, letterSpacing: "0.6px",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            Conversaciones Sospechosas ({suspectConvs.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suspectConvs.map((conv) => (
              <div key={conv.id}>
                <button
                  type="button"
                  onClick={() => setSelectedConv(selectedConv?.id === conv.id ? null : conv)}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                    background: selectedConv?.id === conv.id ? G.surfaceUp : "transparent",
                    border: `1px solid ${selectedConv?.id === conv.id ? G.goldBorder : G.border}`,
                    transition: "all 0.2s", width: "100%", textAlign: "left",
                    font: "inherit", color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: conv.vote_class ? `${voteClassColor(conv.vote_class)}18` : "rgba(255,255,255,0.04)",
                      color: conv.vote_class ? voteClassColor(conv.vote_class) : G.textDim,
                    }}>
                      {conv.vote_class ? voteClassLabel(conv.vote_class) : "pending"}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: G.text }}>
                      {conv.contact_name ?? conv.phone ?? conv.jid.slice(0, 15)}
                    </span>
                    {conv.owner_name && (
                      <span style={{ fontSize: 10, color: G.textDim }}>
                        por {conv.owner_name}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: G.textDim }}>
                      {conv.message_count} msgs | {conv.inbound_count} in
                    </span>
                    <span style={{ fontSize: 10, color: G.textDim }}>
                      {fmtTime(conv.updated_at)}
                    </span>
                    <span style={{ fontSize: 12, color: G.textMid }}>
                      {selectedConv?.id === conv.id ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>
                </button>
                {selectedConv?.id === conv.id && (
                  <ConversationDetail conv={conv} onClose={() => setSelectedConv(null)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small KPI Card ──────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, padding: "14px 16px",
      background: `linear-gradient(135deg, ${G.surface} 0%, ${G.surfaceUp} 100%)`,
      border: `1px solid ${G.border}`, borderRadius: 12,
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div style={{
        fontSize: 9, fontWeight: 800, color: G.textMid, textTransform: "uppercase",
        letterSpacing: "0.8px", marginTop: 4,
      }}>
        {label}
      </div>
    </div>
  );
}
