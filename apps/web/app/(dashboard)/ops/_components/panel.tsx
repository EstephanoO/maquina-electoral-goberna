import type { ReactNode } from "react";

type PanelProps = {
  title: string;
  children: ReactNode;
};

export function Panel({ title, children }: PanelProps) {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "14px",
        padding: "14px",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <h2 style={{ margin: "0 0 10px", fontSize: "16px" }}>{title}</h2>
      {children}
    </section>
  );
}
