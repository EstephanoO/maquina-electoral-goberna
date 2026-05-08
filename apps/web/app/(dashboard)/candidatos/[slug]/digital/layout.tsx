"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

type Tab = { key: string; label: string; href: (slug: string) => string };

const TABS: Tab[] = [
  { key: "chat",       label: "Chat",       href: (s) => `/candidatos/${s}/digital/chat` },
  { key: "metricas",   label: "Métricas",   href: (s) => `/candidatos/${s}/digital/metricas` },
  { key: "validacion", label: "Validación", href: (s) => `/candidatos/${s}/digital/validacion` },
  { key: "monitor",    label: "Monitor WA", href: (s) => `/candidatos/${s}/digital/monitor` },
  { key: "whatsapp",   label: "Configuración", href: (s) => `/candidatos/${s}/digital/whatsapp` },
];

export default function DigitalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const slug = (params.slug as string) ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", fontFamily: FONT }}>
      {/* Tab strip */}
      <nav
        aria-label="Hub Digital"
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
          Digital
        </span>
        {TABS.map((tab) => {
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

      {/* Children area — flex:1, scroll y own */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {children}
      </div>
    </div>
  );
}
