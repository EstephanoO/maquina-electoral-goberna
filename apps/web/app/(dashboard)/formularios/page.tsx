"use client";

/**
 * GOBERNA — Formularios Dinámicos
 * Page orchestrator: delegates rendering to feature components.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api-client";
import { Spinner } from "../../../lib/ui";
import { useInjectStyles } from "../../../lib/hooks/use-inject-styles";
import { FormList, FormBuilder } from "./_components";
import type { Campaign, FormDefinition } from "./_components";

type View = "list" | "builder";

export default function FormulariosPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<View>("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [editForm, setEditForm] = useState<FormDefinition | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useInjectStyles();

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) { router.push("/login"); return; }
    if (user && user.role !== "admin") { router.push("/"); }
  }, [user, authLoading, router]);

  const loadCampaigns = useCallback(async () => {
    const res = await api.get<{ campaigns: Campaign[] }>("/api/campaigns");
    if (res.ok && res.data?.campaigns) {
      setCampaigns(res.data.campaigns);
      if (res.data.campaigns.length > 0 && !selectedCampaign) {
        setSelectedCampaign(res.data.campaigns[0].id);
      }
    }
  }, [selectedCampaign]);

  const loadForms = useCallback(async () => {
    setLoading(true);
    const params = selectedCampaign ? `?campaign_id=${selectedCampaign}` : "";
    const res = await api.get<{ form_definitions: FormDefinition[] }>(`/api/form-definitions${params}`);
    if (res.ok && res.data?.form_definitions) setForms(res.data.form_definitions);
    setLoading(false);
  }, [selectedCampaign]);

  useEffect(() => {
    if (user?.role === "admin") loadCampaigns();
  }, [user, loadCampaigns]);

  useEffect(() => {
    if (user?.role === "admin") loadForms();
  }, [user, loadForms]);

  const handleSaveForm = async (payload: Parameters<typeof api.post>[1]) => {
    setSaving(true);
    try {
      if (editForm) {
        await api.put(`/api/form-definitions/${editForm.id}`, payload);
      } else {
        await api.post("/api/form-definitions", payload);
      }
      setEditForm(null);
      setView("list");
      loadForms();
    } catch (err) {
      console.error("Error saving form:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (form: FormDefinition) => {
    setEditForm(form);
    setView("builder");
  };

  const handleDelete = async (formId: string) => {
    if (deleteConfirm !== formId) { setDeleteConfirm(formId); return; }
    setDeleteConfirm(null);
    await api.delete(`/api/form-definitions/${formId}`);
    loadForms();
  };

  const handleToggleStatus = async (form: FormDefinition) => {
    const newStatus = form.status === "active" ? "archived" : "active";
    await api.put(`/api/form-definitions/${form.id}`, { status: newStatus });
    loadForms();
  };

  const handleCreateNew = () => {
    setEditForm(null);
    setView("builder");
  };

  const handleCancel = () => {
    setEditForm(null);
    setView("list");
  };

  // ── Loading state ──────────────────────────────────────────────────
  if (authLoading || !user) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-surface)", padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>

          {/* Page header (list view only) */}
          {view === "list" && (
            <div style={{ marginBottom: 28 }}>
              <h1 style={{
                fontSize: 26,
                fontWeight: 800,
                color: "var(--goberna-blue-900)",
                margin: 0,
                fontFamily: "var(--font-montserrat), system-ui, sans-serif",
              }}>
                Formularios Dinámicos
              </h1>
              <p style={{ color: "var(--color-text-tertiary)", marginTop: 6, fontSize: 14 }}>
                Diseña formularios personalizados para cada candidato
              </p>
            </div>
          )}

          {/* Delete confirmation inline banner */}
          {deleteConfirm && (
            <div style={{
              background: "#fff3cd",
              border: "1px solid #ffd900",
              borderRadius: 10,
              padding: "12px 20px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#92400e" }}>
                ¿Confirmas eliminar este formulario? Esta acción es irreversible.
              </span>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
              >
                Eliminar
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 }}
              >
                Cancelar
              </button>
            </div>
          )}

          {view === "list" ? (
            <FormList
              forms={forms}
              campaigns={campaigns}
              loading={loading}
              selectedCampaign={selectedCampaign}
              onSelectCampaign={setSelectedCampaign}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleStatus={handleToggleStatus}
              onCreateNew={handleCreateNew}
            />
          ) : (
            <FormBuilder
              campaigns={campaigns}
              editForm={editForm}
              saving={saving}
              onSave={handleSaveForm}
              onCancel={handleCancel}
            />
          )}
        </div>
    </div>
  );
}
