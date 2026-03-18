import { memo } from "react";

type StatCardProps = {
  title: string;
  value: string;
  detail: string;
  tone: "good" | "bad" | "warn" | "info";
};

const toneMap: Record<StatCardProps["tone"], { bg: string; fg: string; border: string }> = {
  good: { bg: "var(--color-success-bg)", fg: "var(--color-success)", border: "var(--color-success-border)" },
  bad: { bg: "var(--color-error-bg)", fg: "var(--color-error)", border: "var(--color-error-border)" },
  warn: { bg: "var(--color-warning-bg)", fg: "var(--color-warning)", border: "var(--color-warning-border)" },
  info: { bg: "var(--color-info-bg)", fg: "var(--color-info)", border: "var(--color-info-border)" },
};

export const StatCard = memo(function StatCard({ title, value, detail, tone }: StatCardProps) {
  const colors = toneMap[tone];

  return (
    <article style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "12px" }}>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)" }}>{title}</p>
      <p style={{ margin: "6px 0 4px", fontSize: "24px", fontWeight: 700, color: colors.fg }}>{value}</p>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)" }}>{detail}</p>
    </article>
  );
});
