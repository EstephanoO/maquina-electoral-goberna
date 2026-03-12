"use client";

/**
 * GOBERNA — Agent Quality Control
 *
 * Per-operator quality dashboard showing:
 * - Red-flag alert cards (anomalies)
 * - Per-operator table merging extension-monitor + conversation stats
 * - Expandable conversation detail with message thread + AI reason
 *
 * Uses the same white institutional palette as Monitor WA.
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
import { MONITOR_THEME as G } from "./theme";
import { MetricCard } from "./metric-card";

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
  const borderColor = alert.severity === "high" ? G.red : "#d96b5f";
  return (
    <div style={{
      padding: "16px 18px", borderRadius: 24,
      background: G.surface,
      border: `1px solid ${borderColor}`,
      overflow: "visible",
      boxShadow: "none",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, paddingBottom: 8, borderBottom: `1px solid ${G.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: borderColor, display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0, lineHeight: 1.4 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={borderColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          <span style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{alert.title}</span>
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
          background: G.surfaceSoft, color: borderColor,
          textTransform: "uppercase", letterSpacing: "0.5px",
          flexShrink: 0,
        }}>
          {alert.severity}
        </span>
      </div>
      <div style={{ fontSize: 11, color: G.textMid, lineHeight: 1.5, whiteSpace: "normal", wordBreak: "break-word" }}>{alert.detail}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
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
      background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
      padding: "20px 24px", marginTop: 12,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: G.brandBlue }}>
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
          background: G.purpleSoft, border: `1px solid ${G.borderStrong}`,
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
              background: isIn ? G.greenSoft : G.skySoft,
              border: `1px solid ${G.borderStrong}`,
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
        <div style={{ padding: 40, textAlign: "center", color: G.textDim, fontSize: 13, background: G.surfaceAlt, borderRadius: 24, border: `1px solid ${G.borderStrong}` }}>
          Cargando datos de calidad...
        </div>
    );
  }

  if (error) {
    return (
        <div style={{
          margin: "20px 0", background: G.redSoft,
          border: `1px solid ${G.red}`, borderRadius: 24,
          padding: "14px 20px", fontSize: 13, color: G.red,
        }}>
          {error}
        </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ══ KPI Strip ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <MetricCard
          label="Operadores"
          value={operators.length}
          color={G.brandBlue}
          trendType="donut"
          donutValue={operators.filter((operator) => operator.wa_sent > 0).length}
          donutTotal={Math.max(operators.length, 1)}
          donutLabel={`${operators.filter((operator) => operator.wa_sent > 0).length}/${Math.max(operators.length, 1)}`}
        />
        <MetricCard
          label="Ratio Promedio"
          value={Math.round((operators.reduce((s, o) => s + o.msgs_per_contact, 0) / Math.max(operators.length, 1)) * 10) / 10}
          color="#d96b5f"
          trend={operators.map((operator) => operator.msgs_per_contact).filter((value) => value > 0)}
          trendType="line"
        />
        <MetricCard
          label="Alertas"
          value={alerts.length}
          color={alerts.length > 0 ? G.red : G.green}
          trend={[alerts.filter((alert) => alert.severity === "high").length, alerts.filter((alert) => alert.severity === "medium").length, alerts.length]}
          trendType="line"
        />
      </div>

      {/* ══ Alerts ══ */}
      <div style={{
        background: G.surface,
        border: `1px solid ${G.borderStrong}`,
        borderRadius: 24,
        padding: "16px 18px",
      }}>
        <div style={{
          fontSize: 12, fontWeight: 900, color: G.textMid, letterSpacing: "3px",
          textTransform: "uppercase", marginBottom: 10, paddingLeft: 4,
        }}>
          Alertas de Calidad ({alerts.length})
        </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", paddingRight: 6 }}>
          {alerts.length > 0 ? alerts.map((a) => <AlertCard key={a.id} alert={a} />) : (
            <div style={{ padding: 20, borderRadius: 16, background: G.surfaceAlt, color: G.textDim, fontSize: 12, textAlign: "center" }}>
              Sin alertas de calidad en este momento.
            </div>
          )}
        </div>
      </div>

      {/* ══ Two-column: Charts ══ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {/* Msgs per contact bar chart */}
        <div style={{
          background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, color: G.textMid, letterSpacing: "3px",
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
                    background: G.surface, border: `1px solid ${G.borderStrong}`,
                    borderRadius: 16, fontSize: 11, color: G.text,
                  }}
                  cursor={{ fill: G.surfaceSoft }}
                />
                <Bar dataKey="ratio" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.flagged ? G.red : G.teal} />
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
            background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
            padding: "16px 20px",
          }}>
            <div style={{
            fontSize: 11, fontWeight: 800, color: G.textMid, letterSpacing: "3px",
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
                    background: G.surface, border: `1px solid ${G.borderStrong}`,
                    borderRadius: 16, fontSize: 11, color: G.text,
                  }}
                  cursor={{ fill: G.surfaceSoft }}
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
        background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
        overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: `1px solid ${G.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: G.textMid, letterSpacing: "3px",
            textTransform: "uppercase",
          }}>
            Rendimiento por Operador
          </span>
          <button type="button" onClick={loadData} style={{
            padding: "4px 12px", borderRadius: 6,
            border: `1px solid ${G.borderStrong}`, background: G.surfaceSoft,
            color: G.brandBlue, fontSize: 10, fontWeight: 800, cursor: "pointer",
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
                       background: flagged ? G.redSoft : "transparent",
                       transition: "background 0.2s",
                     }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${G.surfaceAlt}`; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = flagged ? G.redSoft : "transparent"; }}
                  >
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: flagged ? G.red : G.text }}>
                      {flagged && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={G.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 4, display: "inline-block", verticalAlign: "-1px" }}>
                          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                        </svg>
                      )}
                      {op.name}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.textDim }}>
                      {op.phones.map(p => p.replace("Vasquez ", "V")).join(", ")}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: G.brandBlue }}>
                      {op.wa_sent.toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.teal }}>
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
                    <td style={{ padding: "10px 14px", textAlign: "right", color: G.sky }}>
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
          background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
          padding: "16px 20px",
        }}>
          <div style={{
            fontSize: 12, fontWeight: 800, color: G.textMid, letterSpacing: "3px",
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
                    background: selectedConv?.id === conv.id ? G.surfaceAlt : "transparent",
                    border: `1px solid ${selectedConv?.id === conv.id ? G.borderStrong : G.border}`,
                    transition: "background-color 0.2s ease, border-color 0.2s ease", width: "100%", textAlign: "left",
                    font: "inherit", color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: conv.vote_class ? `${voteClassColor(conv.vote_class)}18` : G.surfaceAlt,
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
