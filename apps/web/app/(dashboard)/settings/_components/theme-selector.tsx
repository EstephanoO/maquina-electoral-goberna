"use client";

interface ThemeSelectorProps {
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
}

export function ThemeSelector({ theme, setTheme }: ThemeSelectorProps) {
  const isDark = theme === "dark";

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: 24,
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 8px" }}>
        Tema
      </h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 16px" }}>
        Elija el tema visual para todo el dashboard.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {([
          { id: "light", label: "Claro" },
          { id: "dark", label: "Oscuro" },
        ] as const).map((option) => {
          const active = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setTheme(option.id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                borderRadius: 999,
                border: `1px solid ${active ? (isDark ? "#8fb2da" : "var(--color-primary)") : "var(--color-border-strong)"}`,
                background: active ? "var(--color-surface-active)" : "var(--color-surface)",
                color: active ? (isDark ? "#e2ecff" : "var(--color-primary)") : "var(--color-text-secondary)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: active && isDark ? "0 0 0 1px rgba(143,178,218,0.35) inset" : "none",
              }}
            >
              {option.id === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
