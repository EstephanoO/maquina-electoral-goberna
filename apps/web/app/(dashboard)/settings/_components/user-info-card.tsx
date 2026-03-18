"use client";

interface UserInfoCardProps {
  user: {
    full_name?: string;
    email?: string;
    role?: string;
  } | null;
}

export function UserInfoCard({ user }: UserInfoCardProps) {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-tertiary)", textTransform: "uppercase", marginBottom: 8 }}>
        Cuenta
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
        {user?.full_name}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
        {user?.email}
      </div>
      <div style={{ marginTop: 8 }}>
        <span
          style={{
            display: "inline-block",
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            borderRadius: 20,
            background: user?.role === "admin" ? "var(--goberna-gold)" : "var(--goberna-blue-100)",
            color: user?.role === "admin" ? "var(--goberna-blue-950)" : "var(--goberna-blue-600)",
          }}
        >
          {user?.role}
        </span>
      </div>
    </div>
  );
}
