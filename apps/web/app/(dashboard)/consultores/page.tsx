"use client";

/**
 * /consultores — Admin: gestión de consultores políticos.
 *
 * - Lista users con role=consultor (asignaciones, global access flag)
 * - Toggle global access (acceso a TODOS los candidatos presentes y futuros)
 * - Asignar/desasignar candidatos puntuales
 * - Generar token JWT long-lived (365d) para que el consultor lo guarde en
 *   ~/.config/goberna/token y el MCP server lo use.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api-client";
import { FONT_STACK } from "@/lib/constants";
import { Button, PageHeader, SlideOver } from "@/lib/ui";

type Consultor = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  has_global_access: boolean;
  assignments_count: number;
  created_at: string;
};

type Assignment = {
  candidato_id: number;
  candidato_nombres: string;
  assigned_at: string;
};

type Candidato = {
  candidato_id: number;
  candidato_nombres: string;
  cargo_nombre: string;
  jurisdiccion_label: string;
};

export default function ConsultoresAdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.role === "admin";

  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Consultor | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [assignCandidatoId, setAssignCandidatoId] = useState("");

  useEffect(() => {
    if (user && !isAdmin) router.replace("/home");
  }, [user, isAdmin, router]);

  const fetchConsultores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; consultores: Consultor[] }>(
        "/api/admin/consultores",
      );
      if (res.ok && res.data) setConsultores(res.data.consultores ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAssignments = useCallback(async (consultorId: string) => {
    const res = await api.get<{ ok: boolean; assignments: Assignment[] }>(
      `/api/admin/consultores/${consultorId}/assignments`,
    );
    if (res.ok && res.data) setAssignments(res.data.assignments ?? []);
  }, []);

  const fetchCandidatos = useCallback(async () => {
    const res = await api.get<{ ok: boolean; candidates: Candidato[] }>(
      "/api/consultor/candidates",
    );
    if (res.ok && res.data) setCandidatos(res.data.candidates ?? []);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchConsultores();
      fetchCandidatos();
    }
  }, [isAdmin, fetchConsultores, fetchCandidatos]);

  const openConsultor = async (c: Consultor) => {
    setSelected(c);
    setToken(null);
    setAssignments([]);
    await fetchAssignments(c.user_id);
  };

  const closeConsultor = () => {
    setSelected(null);
    setToken(null);
    setAssignments([]);
    setAssignCandidatoId("");
  };

  const handleToggleGlobal = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.has_global_access) {
        await api.delete(`/api/admin/consultores/${selected.user_id}/global-access`);
      } else {
        await api.post(`/api/admin/consultores/${selected.user_id}/global-access`, {
          notes: `Otorgado desde panel admin por ${user?.email ?? "admin"}`,
        });
      }
      await fetchConsultores();
      const refreshed = (await api.get<{ ok: boolean; consultores: Consultor[] }>(
        "/api/admin/consultores",
      )).data?.consultores?.find((c) => c.user_id === selected.user_id);
      if (refreshed) setSelected(refreshed);
    } finally {
      setBusy(false);
    }
  };

  const handleAssign = async () => {
    if (!selected || !assignCandidatoId) return;
    const cid = Number.parseInt(assignCandidatoId, 10);
    if (!Number.isInteger(cid) || cid <= 0) {
      alert("candidato_id inválido");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/admin/consultores/${selected.user_id}/assignments`, {
        candidato_id: cid,
      });
      setAssignCandidatoId("");
      await fetchAssignments(selected.user_id);
      await fetchConsultores();
    } finally {
      setBusy(false);
    }
  };

  const handleUnassign = async (candidatoId: number) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.delete(
        `/api/admin/consultores/${selected.user_id}/assignments/${candidatoId}`,
      );
      await fetchAssignments(selected.user_id);
      await fetchConsultores();
    } finally {
      setBusy(false);
    }
  };

  const handleIssueToken = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<{ ok: boolean; access_token: string }>(
        `/api/admin/consultor/users/${selected.user_id}/token`,
      );
      if (res.ok && res.data) {
        setToken(res.data.access_token);
      } else {
        alert("No se pudo generar el token");
      }
    } finally {
      setBusy(false);
    }
  };

  if (user && !isAdmin) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background)", fontFamily: FONT_STACK }}>
      <div style={{ padding: "32px 32px 0" }}>
        <PageHeader
          title="Consultores"
          description="Asignaciones, acceso global, y emisión de tokens MCP"
        />
      </div>

      <div style={{ padding: "0 32px 32px" }}>
        {loading ? (
          <div style={{ padding: 32, color: "var(--color-text-tertiary)" }}>Cargando…</div>
        ) : consultores.length === 0 ? (
          <div style={{ padding: 32, color: "var(--color-text-tertiary)" }}>
            No hay usuarios con rol consultor todavía.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {consultores.map((c) => (
              <button
                key={c.user_id}
                onClick={() => openConsultor(c)}
                style={{
                  textAlign: "left",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: 16,
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{c.full_name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {c.has_global_access ? (
                    <span
                      style={{
                        background: "#fbbf24",
                        color: "#0a1f4a",
                        padding: "4px 10px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 1,
                      }}
                    >
                      Global access
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                      {c.assignments_count} asignados
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <SlideOver
        open={selected !== null}
        onClose={closeConsultor}
        title={selected?.full_name ?? ""}
        width={680}
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {selected.email}
                {selected.phone ? ` · ${selected.phone}` : ""}
              </div>
            </div>

            {/* Global access */}
            <section style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Acceso global
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
                Si está activo, el consultor ve TODOS los candidatos (presentes y futuros) sin
                necesidad de asignaciones puntuales.
              </p>
              <Button
                variant={selected.has_global_access ? "danger" : "primary"}
                onClick={handleToggleGlobal}
                disabled={busy}
              >
                {selected.has_global_access ? "Quitar acceso global" : "Otorgar acceso global"}
              </Button>
            </section>

            {/* Asignaciones puntuales (oculto si tiene global access) */}
            {!selected.has_global_access ? (
              <section style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Candidatos asignados
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <select
                    value={assignCandidatoId}
                    onChange={(e) => setAssignCandidatoId(e.target.value)}
                    style={{
                      flex: 1,
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      fontFamily: "inherit",
                      fontSize: 13,
                    }}
                  >
                    <option value="">— elegí un candidato —</option>
                    {candidatos.map((c) => (
                      <option key={c.candidato_id} value={c.candidato_id}>
                        {c.candidato_nombres} · {c.cargo_nombre} · {c.jurisdiccion_label}
                      </option>
                    ))}
                  </select>
                  <Button onClick={handleAssign} disabled={busy || !assignCandidatoId}>
                    Asignar
                  </Button>
                </div>
                {assignments.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    Sin asignaciones todavía.
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
                    {assignments.map((a) => (
                      <li
                        key={a.candidato_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          background: "var(--color-surface)",
                          borderRadius: 6,
                          fontSize: 13,
                        }}
                      >
                        <span>{a.candidato_nombres}</span>
                        <button
                          onClick={() => handleUnassign(a.candidato_id)}
                          disabled={busy}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#dc2626",
                            cursor: "pointer",
                            fontSize: 12,
                          }}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {/* Token MCP */}
            <section style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Token MCP (long-lived)
              </div>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 12px" }}>
                Generá un access_token (expira en 365d) para que el consultor lo guarde en
                <code style={{ marginLeft: 4, padding: "2px 6px", background: "var(--color-background)", borderRadius: 4 }}>
                  ~/.config/goberna/token
                </code>
                . El MCP server lo usará para llamar a la API.
              </p>
              <Button onClick={handleIssueToken} disabled={busy}>
                {token ? "Regenerar token" : "Generar token"}
              </Button>
              {token ? (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    readOnly
                    value={token}
                    rows={6}
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid var(--color-border)",
                      fontFamily: "monospace",
                      fontSize: 11,
                      resize: "vertical",
                      background: "var(--color-background)",
                    }}
                  />
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
                    Copialo y mandaselo al consultor por canal seguro. Se muestra una sola vez.
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
