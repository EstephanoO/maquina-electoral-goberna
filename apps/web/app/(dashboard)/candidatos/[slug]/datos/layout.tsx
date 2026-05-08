"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Tab = { key: string; label: string; href: (slug: string) => string; adminOnly?: boolean };

const TABS: Tab[] = [
  { key: "voluntarios", label: "Voluntarios",   href: (s) => `/candidatos/${s}/datos/voluntarios` },
  { key: "formularios", label: "Formularios",   href: (s) => `/candidatos/${s}/datos/formularios`, adminOnly: true },
  { key: "leads",       label: "Leads app",     href: (s) => `/candidatos/${s}/datos/leads`,       adminOnly: true },
  { key: "exports",     label: "Exportar",      href: (s) => `/candidatos/${s}/datos/exports` },
];

export default function DatosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const slug = (params.slug as string) ?? "";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", fontFamily: FONT }}>
      {/* Tab strip */}
      <nav
        aria-label="Hub Datos"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "8px 20px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          flexShrink: 0,
          overflowX: "auto",
          scrollbarWidth: "none",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: "var(--color-text-tertiary)",
            paddingRight: 12,
            whiteSpace: "nowrap",
          }}
        >
          Datos
        </span>
        {visibleTabs.map((tab) => {
          const href = tab.href(slug);
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={tab.key}
              href={href}
              prefetch
              style={{
                padding: "7px 14px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
                whiteSpace: "nowrap",
                background: isActive ? "var(--goberna-blue-900, #0f172a)" : "transparent",
                color: isActive ? "#ffffff" : "var(--color-text-secondary)",
                transition: "background 0.15s ease, color 0.15s ease",
                border: isActive ? "1px solid transparent" : "1px solid var(--color-border)",
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ flex: 1, padding: 24 }}>
        {children}
      </div>
    </div>
  );
}
