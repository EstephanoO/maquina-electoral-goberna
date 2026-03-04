"use client";

import type {
  CmsMetrics,
  CmsWaPhoneMetrics,
  CmsExtensionMetricsGlobal,
  CmsDeviceMetrics,
  CmsDeviceMetricsGlobal,
  CmsSourceMetrics,
  CmsSourceMetricsGlobal,
} from "@/lib/services/cms";
import type { CmsBrigadistaMetrics } from "@/lib/types";
import { FONT, HIDDEN_EMAILS, HIDDEN_NAMES, pct } from "./helpers";
import { FunnelStep } from "./funnel-step";
import { OperatorCard } from "./operator-card";
import { PhoneCard } from "./phone-card";
import { DeviceCard } from "./device-card";
import { SourceCard } from "./source-card";
import { TimeCard } from "./time-card";
import { ClockIcon } from "./clock-icon";

/** Maps WA number → display alias (same as extension constants) */
const WA_PHONE_ALIASES: Record<string, string> = {
  "51906218514": "Celular 1",
  "51906175778": "Celular 2",
  "51930700661": "Celular 3",
  "51901938157": "Celular 4",
};

type ExtensionMetrics = {
  global: CmsExtensionMetricsGlobal;
  phones: CmsWaPhoneMetrics[];
};

type DeviceData = {
  devices: CmsDeviceMetrics[];
  global: CmsDeviceMetricsGlobal;
};

type SourceData = {
  sources: CmsSourceMetrics[];
  global: CmsSourceMetricsGlobal;
};

/* ── Funnel icons (inline to keep components self-contained) ── */

function PendingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
    </svg>
  );
}

/* ── Brigadista card (inline, no extra file needed) ── */

function BrigadistaCard({
  brig,
  maxTotal,
}: {
  brig: CmsBrigadistaMetrics;
  maxTotal: number;
}) {
  const totalWorked = brig.hablados + brig.respondieron + brig.archivados;
  const segments = [
    { count: brig.respondieron, color: "#7c3aed", label: "Contestaron" },
    { count: brig.hablados, color: "#16a34a", label: "Hablados" },
    { count: brig.archivados, color: "#9ca3af", label: "Archivados" },
  ];
  const firstName = brig.full_name.split(" ")[0] || brig.email.split("@")[0] || "—";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: 12,
        padding: "16px 20px",
        border: "1px solid var(--color-border)",
        fontFamily: FONT,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: totalWorked > 0 ? "#f0fdf4" : "var(--color-border)",
            color: totalWorked > 0 ? "#16a34a" : "var(--color-text-tertiary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--color-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brig.full_name || firstName}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brig.total_captures} capturas totales
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: totalWorked > 0 ? "#16a34a" : "var(--color-text-tertiary)",
              lineHeight: 1,
            }}
          >
            {totalWorked}
          </div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontWeight: 600 }}>
            gestionados
          </div>
        </div>
      </div>

      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "var(--color-border)",
          overflow: "hidden",
          display: "flex",
          marginBottom: 10,
        }}
      >
        {segments.map((s) => {
          const segPct = maxTotal > 0 ? (s.count / maxTotal) * 100 : 0;
          return segPct > 0 ? (
            <div
              key={s.label}
              style={{ width: `${segPct}%`, height: "100%", background: s.color, transition: "width 0.4s ease" }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null;
        })}
      </div>

      <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block" }}
            />
            <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main exported component ── */

export function MetricsBody({
  metrics,
  extensionMetrics,
  brigadistas,
  deviceData,
  sourceData,
}: {
  metrics: CmsMetrics;
  extensionMetrics?: ExtensionMetrics | null;
  brigadistas?: CmsBrigadistaMetrics[] | null;
  deviceData?: DeviceData | null;
  sourceData?: SourceData | null;
}) {
  const g = metrics.global_totals;
  const contacted = g.hablados + g.respondieron;
  const tm = metrics.time_metrics;

  const visibleOperators = metrics.operators.filter(
    (op) => !HIDDEN_EMAILS.has(op.email.toLowerCase()) && !HIDDEN_NAMES.has(op.full_name),
  );
  const maxWorked = Math.max(
    1,
    ...visibleOperators.map((op) => op.hablados + op.respondieron + op.archivados),
  );
  const sortedOperators = [...visibleOperators].sort(
    (a, b) =>
      b.hablados + b.respondieron + b.archivados - (a.hablados + a.respondieron + a.archivados),
  );

  const visibleBrigadistas = (brigadistas ?? []).filter(
    (b) => !HIDDEN_EMAILS.has(b.email.toLowerCase()) && !HIDDEN_NAMES.has(b.full_name),
  );
  const maxBrigWorked = Math.max(
    1,
    ...visibleBrigadistas.map((b) => b.hablados + b.respondieron + b.archivados),
  );
  const sortedBrigadistas = [...visibleBrigadistas].sort(
    (a, b) =>
      b.hablados + b.respondieron + b.archivados - (a.hablados + a.respondieron + a.archivados),
  );

  return (
    <>
      {/* ── Funnel ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 28, alignItems: "stretch" }}>
        <FunnelStep label="Pendientes" count={g.nuevos} total={g.total} color="#ef4444" icon={<PendingIcon />} />
        <FunnelStep label="Hablados" count={g.hablados} total={g.total} color="#16a34a" icon={<PhoneIcon />} />
        <FunnelStep label="Contestaron" count={g.respondieron} total={g.total} color="#7c3aed" icon={<CheckIcon />} />
        <FunnelStep label="Archivados" count={g.archivados} total={g.total} color="#9ca3af" icon={<ArchiveIcon />} isLast />
      </div>

      {/* ── Conversion Summary ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 200px",
            background: "#f0fdf4",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid #bbf7d0",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#166534",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Tasa de Contacto
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>
            {pct(contacted, g.total)}%
          </div>
          <div style={{ fontSize: 11, color: "#166534", marginTop: 4 }}>
            {contacted} de {g.total} contactados
          </div>
        </div>

        <div
          style={{
            flex: "1 1 200px",
            background: "#f5f3ff",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid #ddd6fe",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#5b21b6",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Tasa de Respuesta
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed", lineHeight: 1 }}>
            {pct(g.respondieron, contacted)}%
          </div>
          <div style={{ fontSize: 11, color: "#5b21b6", marginTop: 4 }}>
            {g.respondieron} de {contacted} respondieron
          </div>
        </div>

        <div
          style={{
            flex: "1 1 200px",
            background: "var(--goberna-blue-50, #eff6ff)",
            borderRadius: 12,
            padding: "16px 20px",
            border: "1px solid var(--goberna-blue-200, #bfdbfe)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--goberna-blue-900)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 4,
            }}
          >
            Eficiencia Global
          </div>
          <div
            style={{ fontSize: 32, fontWeight: 800, color: "var(--goberna-blue-600, #2563eb)", lineHeight: 1 }}
          >
            {pct(g.respondieron, g.total)}%
          </div>
          <div style={{ fontSize: 11, color: "var(--goberna-blue-900)", marginTop: 4 }}>
            {g.respondieron} respuestas de {g.total} total
          </div>
        </div>
      </div>

      {/* ── Sala de Operaciones (devices with live operator) ─────────── */}
      {deviceData && deviceData.devices.length > 0 && (() => {
        const { devices, global: dg } = deviceData;
        const activeDevices = devices.filter((d) => d.active_operator_id !== null);
        const sortedDevices = [...devices].sort((a, b) => {
          // Active first, then by total work descending
          const aActive = a.active_operator_id ? 1 : 0;
          const bActive = b.active_operator_id ? 1 : 0;
          if (bActive !== aActive) return bActive - aActive;
          const aTotal = a.hablados + a.respondieron + a.archivados;
          const bTotal = b.hablados + b.respondieron + b.archivados;
          return bTotal - aTotal;
        });

        return (
          <>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--color-text-primary)",
                margin: "0 0 8px",
                letterSpacing: "0.02em",
                fontFamily: FONT,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              SALA DE OPERACIONES
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                }}
              >
                {devices.length} celular{devices.length !== 1 ? "es" : ""}
              </span>
              {activeDevices.length > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#16a34a",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 20,
                    padding: "2px 10px",
                  }}
                >
                  {activeDevices.length} activo{activeDevices.length !== 1 ? "s" : ""}
                </span>
              )}
            </h2>

            {/* Global summary row */}
            <div
              style={{
                background: "var(--goberna-blue-50, #eff6ff)",
                border: "1px solid var(--goberna-blue-200, #bfdbfe)",
                borderRadius: 12,
                padding: "12px 20px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 0,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "0 0 auto", marginRight: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--goberna-blue-900, #1e3a5f)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 2,
                  }}
                >
                  Total todos los dispositivos
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {dg.active_devices} dispositivo{dg.active_devices !== 1 ? "s" : ""} activo{dg.active_devices !== 1 ? "s" : ""} ahora
                </div>
              </div>
              {[
                { val: dg.hablados,      label: "Hablados",    color: "#16a34a" },
                { val: dg.respondieron,  label: "Contestaron", color: "#7c3aed" },
                { val: dg.archivados,    label: "Archivados",  color: "#9ca3af" },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: "1 1 70px",
                    textAlign: "center",
                    borderLeft: "1px solid var(--goberna-blue-200, #bfdbfe)",
                    padding: "0 12px",
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                    {s.val}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-tertiary)",
                      marginTop: 2,
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Device cards */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 28,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {sortedDevices.map((device, i) => (
                <DeviceCard key={device.wa_number} device={device} rank={i + 1} />
              ))}
            </div>
          </>
        );
      })()}

      {/* ── Por Celular (extensión) — PRIMERO, antes de operadoras ──── */}
      {extensionMetrics && extensionMetrics.phones.length > 0 && (() => {
        const { global: ext, phones } = extensionMetrics;
        const extContacted = ext.hablados + ext.respondieron;
        const maxTotal = Math.max(1, ...phones.map((p) => p.total_interactions));

        return (
          <>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--color-text-primary)",
                margin: "0 0 8px",
                letterSpacing: "0.02em",
                fontFamily: FONT,
              }}
            >
              POR CELULAR
              <span
                style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}
              >
                {phones.length} celular{phones.length !== 1 ? "es" : ""} activo{phones.length !== 1 ? "s" : ""}
              </span>
            </h2>

            {/* ── Resumen total — fila compacta ── */}
            <div
              style={{
                background: "var(--goberna-blue-50, #eff6ff)",
                border: "1px solid var(--goberna-blue-200, #bfdbfe)",
                borderRadius: 12,
                padding: "12px 20px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 0,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "0 0 auto", marginRight: 20 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--goberna-blue-900, #1e3a5f)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 2,
                  }}
                >
                  Total todos los celulares
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {ext.total_interactions} interacciones
                </div>
              </div>
              {[
                { val: ext.hablados,                                               label: "Hablados",    color: "#16a34a" },
                { val: ext.respondieron,                                           label: "Contestaron", color: "#7c3aed" },
                { val: ext.archivados,                                             label: "Archivados",  color: "#9ca3af" },
                { val: `${pct(extContacted, ext.total_interactions)}%`,            label: "Contacto",    color: "#2563eb" },
                { val: `${pct(ext.respondieron, extContacted)}%`,                  label: "Respuesta",   color: "#7c3aed" },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: "1 1 70px",
                    textAlign: "center",
                    borderLeft: "1px solid var(--goberna-blue-200, #bfdbfe)",
                    padding: "0 12px",
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                    {s.val}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--color-text-tertiary)",
                      marginTop: 2,
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Tarjetas individuales — fila horizontal fija ── */}
            <div
              style={{
                display: "flex",
                gap: 12,
                marginBottom: 28,
                overflowX: "auto",
                paddingBottom: 4,
              }}
            >
              {phones.map((phone, i) => (
                <div key={phone.wa_number} style={{ flex: "0 0 260px", minWidth: 260 }}>
                  <PhoneCard
                    phone={phone}
                    maxTotal={maxTotal}
                    rank={i + 1}
                    alias={WA_PHONE_ALIASES[phone.wa_number]}
                  />
                </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* ── Por Origen (territorio vs meta vs manual) ────────────────── */}
      {sourceData && sourceData.sources.length > 0 && (() => {
        const { sources } = sourceData;
        const maxTotal = Math.max(1, ...sources.map((s) => s.total));

        return (
          <>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: "var(--color-text-primary)",
                margin: "0 0 14px",
                letterSpacing: "0.02em",
                fontFamily: FONT,
              }}
            >
              POR ORIGEN
              <span
                style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}
              >
                origen de captacion de contactos
              </span>
            </h2>
            <div
              style={{
                display: "flex",
                gap: 16,
                marginBottom: 28,
                flexWrap: "wrap",
              }}
            >
              {sources.map((s) => (
                <SourceCard key={s.source} source={s} maxTotal={maxTotal} />
              ))}
            </div>
          </>
        );
      })()}

      {/* ── Time Metrics ─────────────────────────────────────────────── */}
      {tm && (tm.total_with_hablado > 0 || tm.total_with_respondieron > 0) && (
        <>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 14px",
              letterSpacing: "0.02em",
            }}
          >
            TIEMPOS DE GESTION
          </h2>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            <TimeCard
              label="WSP → Hablado"
              avg={tm.avg_claim_to_hablado_mins}
              median={tm.median_claim_to_hablado_mins}
              count={tm.total_with_hablado}
              color="#16a34a"
              icon={<ClockIcon color="#16a34a" />}
            />
            <TimeCard
              label="Hablado → Contesto"
              avg={tm.avg_hablado_to_respondieron_mins}
              median={tm.median_hablado_to_respondieron_mins}
              count={tm.total_with_respondieron}
              color="#7c3aed"
              icon={<ClockIcon color="#7c3aed" />}
            />
          </div>
        </>
      )}

      {/* ── Agentes Digitales (operadoras — por sesión) ──────────────── */}
      <h2
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: "var(--color-text-primary)",
          margin: "0 0 14px",
          letterSpacing: "0.02em",
          fontFamily: FONT,
        }}
      >
        AGENTES DIGITALES
        <span
          style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}
        >
          {sortedOperators.length} activo{sortedOperators.length !== 1 ? "s" : ""}
        </span>
      </h2>

      {sortedOperators.length === 0 ? (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-tertiary)",
            fontSize: 14,
            marginBottom: 28,
          }}
        >
          Sin agentes digitales activos
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {sortedOperators.map((op) => (
            <OperatorCard
              key={`${op.user_id}-${op.campaign_id}`}
              op={op}
              maxWorked={maxWorked}
            />
          ))}
        </div>
      )}

      {/* ── Por Brigadista (capturas dedup por teléfono) ─────────────── */}
      {sortedBrigadistas.length > 0 && (
        <>
          <h2
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              margin: "0 0 14px",
              letterSpacing: "0.02em",
              fontFamily: FONT,
            }}
          >
            POR BRIGADISTA
            <span
              style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", marginLeft: 8 }}
            >
              capturas únicas por teléfono
            </span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: 12,
              marginBottom: 28,
            }}
          >
            {sortedBrigadistas.map((brig) => (
              <BrigadistaCard key={brig.brigadista_id} brig={brig} maxTotal={maxBrigWorked} />
            ))}
          </div>
        </>
      )}

      <div style={{ height: 48 }} />
    </>
  );
}
