/**
 * GOBERNA — PageHeader Component
 * Consistent page title with optional breadcrumbs and actions.
 */

import type { CSSProperties, ReactNode } from "react";
import { FONT_STACK } from "../constants";

type Breadcrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  badge?: ReactNode;
};

export function PageHeader({ title, description, breadcrumbs, actions, badge }: PageHeaderProps) {
  const containerStyle: CSSProperties = {
    marginBottom: 28,
  };

  const breadcrumbStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "var(--color-text-tertiary)",
    marginBottom: 8,
    fontFamily: FONT_STACK,
  };

  const titleRowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  };

  const titleStyle: CSSProperties = {
    fontSize: 24,
    fontWeight: 800,
    color: "var(--color-text-primary)",
    margin: 0,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
    fontFamily: FONT_STACK,
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const descriptionStyle: CSSProperties = {
    fontSize: 14,
    color: "var(--color-text-secondary)",
    margin: 0,
    marginTop: 4,
    lineHeight: 1.5,
  };

  return (
    <div style={containerStyle} className="animate-fade-in">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav style={breadcrumbStyle} aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {i > 0 && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.4 }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  style={{
                    color: "var(--color-text-tertiary)",
                    textDecoration: "none",
                    transition: "color var(--duration-fast) ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--goberna-blue-600)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-tertiary)"; }}
                >
                  {crumb.label}
                </a>
              ) : (
                <span style={{ color: i === breadcrumbs.length - 1 ? "var(--color-text-secondary)" : undefined }}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div style={titleRowStyle}>
        <div>
          <h1 style={titleStyle}>
            {title}
            {badge}
          </h1>
          {description && <p style={descriptionStyle}>{description}</p>}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
