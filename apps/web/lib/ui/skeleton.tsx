/**
 * GOBERNA — Skeleton Component
 * Shimmer loading placeholders for content areas.
 */

import type { CSSProperties } from "react";

type SkeletonProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = "var(--radius-sm)",
  className,
  style,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ""}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Pre-built skeleton patterns for common layouts.
 */

export function SkeletonCard() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 20px",
      }}
    >
      <Skeleton width={120} height={12} style={{ marginBottom: 12 }} />
      <Skeleton width={80} height={28} style={{ marginBottom: 8 }} />
      <Skeleton width={160} height={12} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Skeleton width={120} height={12} />
        <Skeleton width={80} height={12} />
        <Skeleton width={100} height={12} />
        <Skeleton width={60} height={12} />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 16,
            padding: "14px 16px",
            borderBottom: "1px solid var(--color-border)",
            opacity: 1 - i * 0.12,
          }}
        >
          <Skeleton width={120} height={14} />
          <Skeleton width={80} height={14} />
          <Skeleton width={100} height={14} />
          <Skeleton width={60} height={14} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ items = 4 }: { items?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            opacity: 1 - i * 0.15,
          }}
        >
          <Skeleton width={40} height={40} borderRadius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="40%" height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
