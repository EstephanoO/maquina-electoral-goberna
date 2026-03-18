"use client";

/**
 * GOBERNA — Admin: Formularios Dinamicos
 * Thin orchestrator — delegates to FormList & FormBuilder.
 */

import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api-client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { FormList, FormBuilder } from "./_components";
import type { Campaign, FormField, FormDefinition } from "./_components";

type Tab = "list" | "builder";

const STYLES = `
@keyframes goberna-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes goberna-spin {
  to { transform: rotate(360deg); }
}
`;

export default function FormulariosPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("list");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [editForm, setEditForm] = useState<FormDefinition | null>(null);

  /* ── Role guard (login redirect handled by middleware) ─────────────── */

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.push("/home");
    }
  }, [user, authLoading, router]);

  /* ── Data loading ─────────────────────────────────────────────────────── */

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get<{ campaigns: Campaign[] }>("/api/campaigns");
      if (res.ok && res.data?.campaigns) {
        setCampaigns(res.data.campaigns);
        if (res.data.campaigns.length > 0) {
          setSelectedCampaign(res.data.campaigns[0].id);
        }
      }
    } catch (err) {
      console.error("Error loading campaigns:", err);
    }
  }, []);

  const loadForms = useCallback(async () => {
    try {
      const params = selectedCampaign ? `?campaign_id=${selectedCampaign}` : "";
      const res = await api.get<{ form_definitions: FormDefinition[] }>(
        `/api/form-definitions${params}`,
      );
      if (res.ok && res.data?.form_definitions) {
        setForms(res.data.form_definitions);
      }
    } catch (err) {
      console.error("Error loading forms:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedCampaign]);

  useEffect(() => {
    if (user?.role === "admin") loadCampaigns();
  }, [user, loadCampaigns]);

  useEffect(() => {
    if (selectedCampaign && user?.role === "admin") loadForms();
  }, [selectedCampaign, user, loadForms]);

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const handleEdit = useCallback((form: FormDefinition) => {
    setEditForm(form);
    setTab("builder");
  }, []);

  const handleDelete = useCallback(
    async (formId: string) => {
      if (!confirm("Estas seguro de eliminar este formulario?")) return;
      try {
        await api.delete(`/api/form-definitions/${formId}`);
        loadForms();
      } catch (err) {
        console.error("Error deleting form:", err);
        alert("Error al eliminar formulario");
      }
    },
    [loadForms],
  );

  const handleToggleStatus = useCallback(
    async (form: FormDefinition) => {
      const newStatus = form.status === "active" ? "archived" : "active";
      try {
        await api.put(`/api/form-definitions/${form.id}`, { status: newStatus });
        loadForms();
      } catch (err) {
        console.error("Error toggling status:", err);
        alert("Error al cambiar estado");
      }
    },
    [loadForms],
  );

  const handleSave = useCallback(
    async (payload: {
      campaign_id: string;
      name: string;
      slug: string;
      description?: string;
      schema: { version: string; fields: FormField[] };
      status: "draft" | "active";
    }) => {
      setSaving(true);
      try {
        if (editForm) {
          await api.put(`/api/form-definitions/${editForm.id}`, payload);
        } else {
          await api.post("/api/form-definitions", payload);
        }
        setEditForm(null);
        setTab("list");
        loadForms();
      } catch (err) {
        console.error("Error saving form:", err);
        alert("Error al guardar formulario");
      } finally {
        setSaving(false);
      }
    },
    [editForm, loadForms],
  );

  const handleCancel = useCallback(() => {
    setEditForm(null);
    setTab("list");
  }, []);

  const handleCreateNew = useCallback(() => {
    setEditForm(null);
    setTab("builder");
  }, []);

  /* ── Loading state ────────────────────────────────────────────────────── */

  if (authLoading || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-surface-hover)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid var(--color-border)",
            borderTopColor: "var(--color-primary)",
            borderRadius: "50%",
            animation: "goberna-spin 1s linear infinite",
          }}
        />
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div style={{ minHeight: "100vh", background: "var(--color-surface-hover)", padding: 24 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "var(--color-primary)",
                margin: 0,
                fontFamily: "Montserrat, sans-serif",
              }}
            >
              Formularios Dinamicos
            </h1>
            <p style={{ color: "var(--color-text-secondary)", marginTop: 8, fontSize: 15 }}>
              Disena formularios personalizados para cada candidato
            </p>
          </div>

          {/* Content */}
          {tab === "list" ? (
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
              onSave={handleSave}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </>
  );
}
