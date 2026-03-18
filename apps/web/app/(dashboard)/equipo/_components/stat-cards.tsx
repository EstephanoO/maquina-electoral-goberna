/**
 * GOBERNA — Team Summary Strip
 * Consolidated KPI banner: total hero + role distribution bar + role breakdown pills.
 */

import type { CSSProperties } from "react";
import { IconUsers, IconClock } from "../../../../lib/ui";
import { getRoleConfig, ROLES } from "./role-config";
import { FONT_STACK } from "../../../../lib/constants";

// ── Types ───────────────────────────────────────────────────────────

type StatGridProps = {
  total: number;
  statsByRole: Record<string, number>;
  pendingCount: number;
};

// ── Distribution Bar ────────────────────────────────────────────────

function DistributionBar({ statsByRole, total }: { statsByRole: Record<string, number>; total: number }) {
  if (total === 0) return null;

  const segments = Object.entries(statsByRole)
    .map(([role, count]) => ({ role, count, config: getRoleConfig(role) }))
    .sort((a, b) => b.config.level - a.config.level);

  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", width: "100%" }}>
      {segments.map(({ role, count, config }) => (
        <div
          key={role}
          title={`${config.shortLabel}: ${count}`}
          style={{
            width: `${(count / total) * 100}%`,
            minWidth: count > 0 ? 4 : 0,
            background: config.bgColor,
            transition: "width 0.4s ease",
          }}
        />
      ))}
    </div>
  );
}

// ── Role Pill ───────────────────────────────────────────────────────

function RolePill({ role, count }: { role: string; count: number }) {
  const config = getRoleConfig(role);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 14px",
      background: "var(--color-surface)",
      borderRadius: 10,
      border: "1px solid var(--color-border)",
      minWidth: 0,
    }}>
      {/* Accent icon */}
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: config.bgColor,
        border: `1.5px solid ${config.borderColor}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <config.icon size={16} color="#fff" />
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 20,
          fontWeight: 800,
          color: config.color,
          lineHeight: 1,
          fontFamily: FONT_STACK,
        }}>
          {count}
        </div>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: "var(--color-text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          marginTop: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {config.shortLabel}
        </div>
      </div>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

export function StatGrid({ total, statsByRole, pendingCount }: StatGridProps) {
  const sorted = Object.entries(statsByRole)
    .sort(([, a], [, b]) => b - a);

  return (
    <div style={{
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 24px",
      boxShadow: "var(--shadow-sm)",
      marginBottom: 24,
      fontFamily: FONT_STACK,
    }}>
      {/* Top row: hero total + pending badge */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "var(--goberna-blue-50)",
            border: "1.5px solid var(--goberna-blue-200)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
            <IconUsers size={22} color="var(--goberna-blue-600)" />
          </div>
          <div>
            <div style={{
              fontSize: 36,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}>
              {total}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginTop: 2,
            }}>
              Miembros del equipo
            </div>
          </div>
        </div>

        {pendingCount > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            background: "var(--color-warning-bg)",
            border: "1px solid var(--color-warning-border)",
            borderRadius: 10,
          }}>
            <IconClock size={16} color="var(--color-warning)" />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-warning)", lineHeight: 1 }}>
                {pendingCount}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-warning)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Pendientes
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Distribution bar */}
      {total > 0 && (
        <div style={{ marginBottom: 16 }}>
          <DistributionBar statsByRole={statsByRole} total={total} />
        </div>
      )}

      {/* Role pills */}
      {sorted.length > 0 && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}>
          {sorted.map(([role, count]) => (
            <RolePill key={role} role={role} count={count} />
          ))}
        </div>
      )}
    </div>
  );
}
