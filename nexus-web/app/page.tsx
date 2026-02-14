"use client";

import { useEffect, useMemo, useState } from "react";

type HealthResponse = {
  ok?: boolean;
  service?: string;
  ts?: string;
};

export default function Home() {
  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_MAP_API_BASE ?? "/api", []);
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("Conectando con backend...");

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      try {
        const healthUrl = apiBase.endsWith("/api") ? `${apiBase}/health` : `${apiBase}/api/health`;
        const response = await fetch(healthUrl, { cache: "no-store" });
        const data = (await response.json()) as HealthResponse;

        if (!cancelled && response.ok && data.ok) {
          setStatus("ok");
          setMessage(`health ok (${data.service ?? "backend"})`);
          return;
        }

        if (!cancelled) {
          setStatus("error");
          setMessage("backend sin respuesta valida");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("error conectando al backend");
        }
      }
    };

    void checkHealth();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        background: "linear-gradient(180deg, #f7fafc 0%, #e2e8f0 100%)",
      }}
    >
      <section
        style={{
          width: "min(680px, 92vw)",
          padding: "24px",
          borderRadius: "12px",
          background: "#ffffff",
          border: "1px solid #cbd5e1",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px" }}>Backend Check</h1>
        <p style={{ marginTop: "12px", marginBottom: 0 }}>
          Estado: <strong>{status === "ok" ? "OK" : status === "checking" ? "CHECKING" : "ERROR"}</strong>
        </p>
        <p style={{ marginTop: "8px", marginBottom: 0 }}>{message}</p>
        <p style={{ marginTop: "12px", marginBottom: 0, color: "#475569" }}>API base: {apiBase}</p>
      </section>
    </main>
  );
}
