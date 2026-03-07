"use client";

import { useAuth } from "../../../lib/auth-context";
import { api } from "../../../lib/api-client";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════════════
   GOBERNA — Admin: Formularios Dinámicos
   ═══════════════════════════════════════════════════════════════════════════ */

type Campaign = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
};

type FormField = {
  id: string;
  type: "text" | "number" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "date" | "location" | "photo";
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: string[];
  };
  options?: { value: string; label: string }[];
  defaultValue?: unknown;
};

type FormSchema = {
  version: string;
  fields: FormField[];
};

type FormDefinition = {
  id: string;
  campaign_id: string;
  name: string;
  slug: string;
  description: string | null;
  schema: FormSchema;
  status: "draft" | "active" | "archived";
  created_at: string;
  campaign_name?: string;
};

type Tab = "formularios" | "crear";

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Teléfono" },
  { value: "textarea", label: "Texto largo" },
  { value: "select", label: "Selección única" },
  { value: "radio", label: "Opción única (radio)" },
  { value: "checkbox", label: "Selección múltiple" },
  { value: "date", label: "Fecha" },
  { value: "location", label: "Ubicación GPS" },
  { value: "photo", label: "Foto" },
];

// Default fields that every form starts with
const DEFAULT_FIELDS: FormField[] = [
  {
    id: "nombre",
    type: "text",
    label: "Nombre completo",
    placeholder: "Ingresa nombre y apellidos",
    required: true,
    validation: { min: 3 },
  },
  {
    id: "telefono",
    type: "phone",
    label: "Teléfono",
    placeholder: "999 888 777",
    required: true,
    validation: { pattern: "^[0-9]{9}$" },
  },
  {
    id: "ubicacion",
    type: "location",
    label: "Ubicación GPS",
    required: true,
  },
];

const INJECTED_STYLES = `
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
  const [activeTab, setActiveTab] = useState<Tab>("formularios");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [editForm, setEditForm] = useState<FormDefinition | null>(null);

  // Form builder state
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formFields, setFormFields] = useState<FormField[]>([]);
  const [formStatus, setFormStatus] = useState<"draft" | "active" | "archived">("draft");

  // Field editor state
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [showFieldEditor, setShowFieldEditor] = useState(false);

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
      const res = await api.get<{ form_definitions: FormDefinition[] }>(`/api/form-definitions${params}`);
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
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user && user.role !== "admin") {
      router.push("/home");
      return;
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && user.role === "admin") {
      loadCampaigns();
    }
  }, [user, loadCampaigns]);

  useEffect(() => {
    if (selectedCampaign && user?.role === "admin") {
      loadForms();
    }
  }, [selectedCampaign, user, loadForms]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };

  const handleNameChange = (name: string) => {
    setFormName(name);
    if (!formSlug || formSlug === generateSlug(formName)) {
      setFormSlug(generateSlug(name));
    }
  };

  const addField = () => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type: "text",
      label: "Nuevo campo",
      required: false,
    };
    setEditingField(newField);
    setShowFieldEditor(true);
  };

  const saveField = () => {
    if (!editingField) return;

    const existingIndex = formFields.findIndex((f) => f.id === editingField.id);
    if (existingIndex >= 0) {
      setFormFields((prev) =>
        prev.map((f, i) => (i === existingIndex ? editingField : f))
      );
    } else {
      setFormFields((prev) => [...prev, editingField]);
    }
    setShowFieldEditor(false);
    setEditingField(null);
  };

  const deleteField = (fieldId: string) => {
    setFormFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    const newFields = [...formFields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFormFields(newFields);
  };

  const handleSaveForm = async () => {
    if (!formName || !formSlug || formFields.length === 0 || !selectedCampaign) {
      alert("Por favor completa todos los campos y agrega al menos un campo");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        campaign_id: selectedCampaign,
        name: formName,
        slug: formSlug,
        description: formDescription || undefined,
        schema: {
          version: "1.0",
          fields: formFields,
        },
        status: formStatus,
      };

      if (editForm) {
        await api.put(`/api/form-definitions/${editForm.id}`, payload);
      } else {
        await api.post("/api/form-definitions", payload);
      }

      // Reset form
      setFormName("");
      setFormSlug("");
      setFormDescription("");
      setFormFields([]);
      setFormStatus("draft");
      setEditForm(null);
      setActiveTab("formularios");
      loadForms();
    } catch (err) {
      console.error("Error saving form:", err);
      alert("Error al guardar formulario");
    } finally {
      setSaving(false);
    }
  };

  const handleEditForm = (form: FormDefinition) => {
    setEditForm(form);
    setFormName(form.name);
    setFormSlug(form.slug);
    setFormDescription(form.description || "");
    setFormFields(form.schema.fields || []);
    setFormStatus(form.status);
    setSelectedCampaign(form.campaign_id);
    setActiveTab("crear");
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm("¿Estás seguro de eliminar este formulario?")) return;
    try {
      await api.delete(`/api/form-definitions/${formId}`);
      loadForms();
    } catch (err) {
      console.error("Error deleting form:", err);
      alert("Error al eliminar formulario");
    }
  };

  const handleToggleStatus = async (form: FormDefinition) => {
    const newStatus = form.status === "active" ? "archived" : "active";
    try {
      await api.put(`/api/form-definitions/${form.id}`, { status: newStatus });
      loadForms();
    } catch (err) {
      console.error("Error toggling status:", err);
      alert("Error al cambiar estado");
    }
  };

  const exportJson = () => {
    const schema = {
      version: "1.0",
      fields: formFields,
    };
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formSlug || "formulario"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const schema = JSON.parse(ev.target?.result as string);
          if (schema.fields && Array.isArray(schema.fields)) {
            setFormFields(schema.fields);
          }
        } catch {
          alert("Archivo JSON inválido");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (authLoading || !user) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc"
      }}>
        <div style={{
          width: 40,
          height: 40,
          border: "3px solid #e2e8f0",
          borderTopColor: "#163960",
          borderRadius: "50%",
          animation: "goberna-spin 1s linear infinite"
        }} />
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px"
      }}>
        {/* Header */}
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          marginBottom: 32
        }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 800,
            color: "#163960",
            margin: 0,
            fontFamily: "Montserrat, sans-serif"
          }}>
            📋 Formularios Dinámicos
          </h1>
          <p style={{
            color: "#64748b",
            marginTop: 8,
            fontSize: 15
          }}>
            Diseña formularios personalizados para cada candidato
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          gap: 8,
          marginBottom: 24
        }}>
          <button
            onClick={() => { setActiveTab("formularios"); setEditForm(null); }}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              background: activeTab === "formularios" ? "#163960" : "#e2e8f0",
              color: activeTab === "formularios" ? "white" : "#475569",
              transition: "all 0.2s"
            }}
          >
            📋 Lista de Formularios
          </button>
          <button
            onClick={() => {
              setActiveTab("crear");
              setEditForm(null);
              setFormName("");
              setFormSlug("");
              setFormDescription("");
              setFormFields([...DEFAULT_FIELDS]);
              setFormStatus("draft");
            }}
            style={{
              padding: "12px 24px",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              background: activeTab === "crear" ? "#163960" : "#e2e8f0",
              color: activeTab === "crear" ? "white" : "#475569",
              transition: "all 0.2s"
            }}
          >
            ➕ Crear Formulario
          </button>
        </div>

        {/* Campaign Filter */}
        <div style={{
          maxWidth: 1200,
          margin: "0 auto",
          marginBottom: 24
        }}>
          <label style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#475569",
            marginBottom: 8
          }}>
            Filtrar por candidato
          </label>
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 14,
              background: "white",
              minWidth: 280,
              cursor: "pointer"
            }}
          >
            <option value="">Todos los candidatos</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.cargo} #{c.numero}
              </option>
            ))}
          </select>
        </div>

        {activeTab === "formularios" ? (
          /* Lista de Formularios */
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                Cargando...
              </div>
            ) : forms.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: 60,
                background: "white",
                borderRadius: 12,
                border: "2px dashed #e2e8f0"
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
                <p style={{ color: "#64748b", margin: 0 }}>
                  No hay formularios para este candidato
                </p>
                <button
                  onClick={() => setActiveTab("crear")}
                  style={{
                    marginTop: 16,
                    padding: "10px 20px",
                    background: "#163960",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  Crear primer formulario
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {forms.map((form) => (
                  <div
                    key={form.id}
                    style={{
                      background: "white",
                      borderRadius: 12,
                      padding: 20,
                      border: "1px solid #e2e8f0",
                      animation: "goberna-fade-in 0.3s ease-out"
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start"
                    }}>
                      <div>
                        <h3 style={{
                          margin: 0,
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#163960"
                        }}>
                          {form.name}
                        </h3>
                        <p style={{
                          margin: "4px 0 0",
                          fontSize: 13,
                          color: "#64748b"
                        }}>
                          {form.campaign_name} • {form.schema?.fields?.length || 0} campos
                        </p>
                        {form.description && (
                          <p style={{
                            margin: "8px 0 0",
                            fontSize: 14,
                            color: "#475569"
                          }}>
                            {form.description}
                          </p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{
                          padding: "4px 12px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          background: form.status === "active" ? "#dcfce7" : "#fef3c7",
                          color: form.status === "active" ? "#166534" : "#92400e"
                        }}>
                          {form.status === "active" ? "Activo" : "Borrador"}
                        </span>
                        <button
                          onClick={() => handleToggleStatus(form)}
                          style={{
                            padding: "6px 12px",
                            border: "none",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: form.status === "active" ? "#fef3c7" : "#dcfce7",
                            color: form.status === "active" ? "#92400e" : "#166534"
                          }}
                        >
                          {form.status === "active" ? "Archivar" : "Activar"}
                        </button>
                        <button
                          onClick={() => handleEditForm(form)}
                          style={{
                            padding: "6px 12px",
                            border: "1px solid #e2e8f0",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: "white",
                            color: "#475569"
                          }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleDeleteForm(form.id)}
                          style={{
                            padding: "6px 12px",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            background: "white",
                            color: "#dc2626"
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Editor de Formulario */
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24
            }}>
              {/* Left: Form Info & Fields */}
              <div>
                {/* Form Info */}
                <div style={{
                  background: "white",
                  borderRadius: 12,
                  padding: 24,
                  border: "1px solid #e2e8f0",
                  marginBottom: 24
                }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#163960" }}>
                    Información del Formulario
                  </h3>
                  
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                      Candidato *
                    </label>
                    <select
                      value={selectedCampaign}
                      onChange={(e) => setSelectedCampaign(e.target.value)}
                      disabled={!!editForm}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        background: editForm ? "#f1f5f9" : "white"
                      }}
                    >
                      <option value="">Seleccionar candidato</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.cargo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                      Nombre del Formulario *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="Encuesta Puerta a Puerta"
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 14
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                      Slug (URL) *
                    </label>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={(e) => setFormSlug(generateSlug(e.target.value))}
                      placeholder="encuesta-puerta"
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        fontFamily: "monospace"
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                      Descripción
                    </label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Descripción opcional del formulario"
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 14,
                        resize: "vertical"
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                      Estado
                    </label>
                    <div style={{ display: "flex", gap: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="radio"
                          checked={formStatus === "draft"}
                          onChange={() => setFormStatus("draft")}
                        />
                        <span style={{ fontSize: 14 }}>Borrador</span>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="radio"
                          checked={formStatus === "active"}
                          onChange={() => setFormStatus("active")}
                        />
                        <span style={{ fontSize: 14 }}>Activo</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Fields List */}
                <div style={{
                  background: "white",
                  borderRadius: 12,
                  padding: 24,
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16
                  }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#163960" }}>
                      Campos ({formFields.length})
                    </h3>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={importJson}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid #e2e8f0",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: "white",
                          color: "#475569"
                        }}
                      >
                        📥 Importar JSON
                      </button>
                      <button
                        onClick={exportJson}
                        disabled={formFields.length === 0}
                        style={{
                          padding: "6px 12px",
                          border: "1px solid #e2e8f0",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: formFields.length === 0 ? "not-allowed" : "pointer",
                          background: formFields.length === 0 ? "#f1f5f9" : "white",
                          color: formFields.length === 0 ? "#94a3b8" : "#475569"
                        }}
                      >
                        📤 Exportar JSON
                      </button>
                    </div>
                  </div>

                  {formFields.length === 0 ? (
                    <div style={{
                      textAlign: "center",
                      padding: 32,
                      border: "2px dashed #e2e8f0",
                      borderRadius: 8,
                      color: "#94a3b8"
                    }}>
                      No hay campos. Agrega el primer campo.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {formFields.map((field, index) => (
                        <div
                          key={field.id}
                          style={{
                            padding: 12,
                            border: "1px solid #e2e8f0",
                            borderRadius: 8,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: "#163960" }}>
                              {field.label}
                            </span>
                            <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>
                              {field.type} {field.required && "• requerido"}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              onClick={() => moveField(index, "up")}
                              disabled={index === 0}
                              style={{
                                padding: "4px 8px",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: index === 0 ? "not-allowed" : "pointer",
                                background: "transparent",
                                color: index === 0 ? "#cbd5e1" : "#64748b"
                              }}
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => moveField(index, "down")}
                              disabled={index === formFields.length - 1}
                              style={{
                                padding: "4px 8px",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: index === formFields.length - 1 ? "not-allowed" : "pointer",
                                background: "transparent",
                                color: index === formFields.length - 1 ? "#cbd5e1" : "#64748b"
                              }}
                            >
                              ↓
                            </button>
                            <button
                              onClick={() => { setEditingField(field); setShowFieldEditor(true); }}
                              style={{
                                padding: "4px 8px",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: "pointer",
                                background: "transparent",
                                color: "#64748b"
                              }}
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteField(field.id)}
                              style={{
                                padding: "4px 8px",
                                border: "none",
                                borderRadius: 4,
                                fontSize: 12,
                                cursor: "pointer",
                                background: "transparent",
                                color: "#dc2626"
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={addField}
                    style={{
                      width: "100%",
                      marginTop: 16,
                      padding: 12,
                      border: "2px dashed #e2e8f0",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "pointer",
                      background: "transparent",
                      color: "#163960"
                    }}
                  >
                    ➕ Agregar Campo
                  </button>
                </div>
              </div>

              {/* Right: Preview */}
              <div>
                <div style={{
                  background: "white",
                  borderRadius: 12,
                  padding: 24,
                  border: "1px solid #e2e8f0",
                  position: "sticky",
                  top: 24
                }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#163960" }}>
                    Vista Previa
                  </h3>
                  
                  {formFields.length === 0 ? (
                    <div style={{
                      textAlign: "center",
                      padding: 40,
                      color: "#94a3b8"
                    }}>
                      Agrega campos para ver la preview
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 16 }}>
                      {formFields.map((field) => (
                        <div key={field.id}>
                          <label style={{
                            display: "block",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#374151",
                            marginBottom: 6
                          }}>
                            {field.label}
                            {field.required && <span style={{ color: "#dc2626" }}> *</span>}
                          </label>
                          {field.type === "textarea" ? (
                            <textarea
                              placeholder={field.placeholder || field.label}
                              disabled
                              rows={3}
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                fontSize: 14,
                                background: "#f9fafb"
                              }}
                            />
                          ) : field.type === "select" ? (
                            <select
                              disabled
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                fontSize: 14,
                                background: "#f9fafb"
                              }}
                            >
                              <option>Seleccionar...</option>
                              {field.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : field.type === "radio" ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              {field.options?.map((opt) => (
                                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <input type="radio" disabled />
                                  <span style={{ fontSize: 14 }}>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                          ) : field.type === "checkbox" ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              {field.options?.map((opt) => (
                                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <input type="checkbox" disabled />
                                  <span style={{ fontSize: 14 }}>{opt.label}</span>
                                </label>
                              ))}
                            </div>
                          ) : field.type === "location" ? (
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: "12px 16px",
                              borderRadius: 10,
                              border: "2px dashed #3B82F6",
                              background: "#EFF6FF",
                              cursor: "not-allowed",
                            }}>
                              <span style={{ fontSize: 20 }}>📍</span>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: "#1E40AF" }}>
                                  Captura de ubicación GPS
                                </div>
                                <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 2 }}>
                                  El agente presionará este botón para capturar coordenadas UTM
                                </div>
                              </div>
                            </div>
                          ) : (
                            <input
                              type={field.type === "phone" ? "tel" : field.type}
                              placeholder={field.placeholder || field.label}
                              disabled
                              style={{
                                width: "100%",
                                padding: "10px 14px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                fontSize: 14,
                                background: "#f9fafb"
                              }}
                            />
                          )}
                          {field.helpText && (
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                              {field.helpText}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Save Button */}
                <button
                  onClick={handleSaveForm}
                  disabled={saving || !formName || !formSlug || formFields.length === 0 || !selectedCampaign}
                  style={{
                    width: "100%",
                    marginTop: 24,
                    padding: 14,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: saving || !formName || !formSlug || formFields.length === 0 || !selectedCampaign
                      ? "not-allowed"
                      : "pointer",
                    background: saving || !formName || !formSlug || formFields.length === 0 || !selectedCampaign
                      ? "#94a3b8"
                      : "#163960",
                    color: "white",
                    transition: "all 0.2s"
                  }}
                >
                  {saving ? "Guardando..." : editForm ? "Actualizar Formulario" : "Crear Formulario"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Field Editor Modal */}
        {showFieldEditor && editingField && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200
          }}>
            <div style={{
              background: "white",
              borderRadius: 16,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              maxHeight: "90vh",
              overflow: "auto"
            }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700, color: "#163960" }}>
                {editingField.id.startsWith("field_") ? "Nuevo Campo" : "Editar Campo"}
              </h3>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Tipo de Campo *
                </label>
                <select
                  value={editingField.type}
                  onChange={(e) => setEditingField({ ...editingField, type: e.target.value as FormField["type"] })}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 14
                  }}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Etiqueta (Label) *
                </label>
                <input
                  type="text"
                  value={editingField.label}
                  onChange={(e) => setEditingField({ ...editingField, label: e.target.value })}
                  placeholder="Nombre completo"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Placeholder
                </label>
                <input
                  type="text"
                  value={editingField.placeholder || ""}
                  onChange={(e) => setEditingField({ ...editingField, placeholder: e.target.value })}
                  placeholder="Ej: Ingresa tu nombre"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                  Texto de Ayuda
                </label>
                <input
                  type="text"
                  value={editingField.helpText || ""}
                  onChange={(e) => setEditingField({ ...editingField, helpText: e.target.value })}
                  placeholder="Información adicional para el usuario"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    fontSize: 14
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={editingField.required}
                    onChange={(e) => setEditingField({ ...editingField, required: e.target.checked })}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Campo requerido</span>
                </label>
              </div>

              {/* Options for select/radio/checkbox */}
              {["select", "radio", "checkbox"].includes(editingField.type) && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                    Opciones *
                  </label>
                  <div style={{ display: "grid", gap: 8 }}>
                    {(editingField.options || []).map((opt, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => {
                            const newOptions = [...(editingField.options || [])];
                            newOptions[idx] = { ...opt, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, "_") };
                            setEditingField({ ...editingField, options: newOptions });
                          }}
                          placeholder="Label"
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                        />
                        <button
                          onClick={() => {
                            const newOptions = (editingField.options || []).filter((_, i) => i !== idx);
                            setEditingField({ ...editingField, options: newOptions });
                          }}
                          style={{ padding: "8px 12px", border: "none", borderRadius: 6, background: "#fee2e2", color: "#dc2626", cursor: "pointer" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                        const newOptions = [...(editingField.options || []), { value: "", label: "" }];
                        setEditingField({ ...editingField, options: newOptions });
                      }}
                      style={{ padding: "8px", border: "1px dashed #e2e8f0", borderRadius: 6, background: "transparent", color: "#163960", cursor: "pointer", fontSize: 13 }}
                    >
                      + Agregar opción
                    </button>
                  </div>
                </div>
              )}

              {/* Validation for text/number */}
              {["text", "number", "textarea"].includes(editingField.type) && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                    Validación
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: "#64748b" }}>Mínimo</label>
                      <input
                        type="number"
                        value={editingField.validation?.min || ""}
                        onChange={(e) => setEditingField({
                          ...editingField,
                          validation: { ...editingField.validation, min: e.target.value ? Number(e.target.value) : undefined }
                        })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#64748b" }}>Máximo</label>
                      <input
                        type="number"
                        value={editingField.validation?.max || ""}
                        onChange={(e) => setEditingField({
                          ...editingField,
                          validation: { ...editingField.validation, max: e.target.value ? Number(e.target.value) : undefined }
                        })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                <button
                  onClick={() => { setShowFieldEditor(false); setEditingField(null); }}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "white",
                    color: "#475569"
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={saveField}
                  disabled={!editingField.label}
                  style={{
                    flex: 1,
                    padding: 12,
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: !editingField.label ? "not-allowed" : "pointer",
                    background: !editingField.label ? "#94a3b8" : "#163960",
                    color: "white"
                  }}
                >
                  Guardar Campo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
