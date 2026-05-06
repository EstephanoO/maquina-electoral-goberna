import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Template } from "../types";

export function Templates() {
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setItems(await api.listTemplates());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing?.name?.trim() || !editing?.body?.trim()) return;
    if (editing.id) {
      await api.updateTemplate(editing.id, {
        name: editing.name, body: editing.body, image_url: editing.image_url ?? null,
      });
    } else {
      await api.createTemplate({
        name: editing.name, body: editing.body, image_url: editing.image_url ?? null,
      } as any);
    }
    setEditing(null);
    load();
  }

  async function remove(id: number) {
    if (!confirm("¿Eliminar este template?")) return;
    await api.deleteTemplate(id);
    load();
  }

  return (
    <>
      <div className="main-header">
        <div>
          <h2>Templates de mensaje</h2>
          <div className="sub">
            Soporta <code>[opción1|opción2]</code> (variantes aleatorias), <code>---</code> (segundo mensaje) y variables <code>{"{{nombre}}"}</code>.
          </div>
        </div>
        <button className="btn" onClick={() => setEditing({ name: "", body: "", image_url: null })}>
          + Nuevo template
        </button>
      </div>

      {loading ? <div className="empty">Cargando…</div> : (
        items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📝</div>
            <div>Aún no hay templates. Crea uno para mandar mensajes rápidos.</div>
          </div>
        ) : (
          <div className="tpl-grid">
            {items.map((t) => (
              <div key={t.id} className="tpl-card">
                {t.image_url && <img src={t.image_url} alt="" className="tpl-img" />}
                <div className="tpl-name">{t.name}</div>
                <div className="tpl-body">{t.body}</div>
                <div className="tpl-actions">
                  <button className="btn ghost small" onClick={() => setEditing(t)}>Editar</button>
                  <button className="btn ghost small danger" onClick={() => remove(t.id)}>Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {editing && (
        <TemplateEditor
          template={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </>
  );
}

// -------- Editor drawer --------
function TemplateEditor({
  template, onChange, onClose, onSave,
}: {
  template: Partial<Template>;
  onChange: (t: Partial<Template>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [previews, setPreviews] = useState<string[][]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-preview when body changes (debounced)
  useEffect(() => {
    const body = template.body ?? "";
    if (!body.trim()) { setPreviews([]); return; }
    const t = setTimeout(async () => {
      try { setPreviews(await api.previewTemplate(body)); }
      catch { setPreviews([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [template.body]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const url = await api.uploadTemplateImage(f);
      onChange({ ...template, image_url: url });
    } catch (err: any) {
      alert("Error subiendo imagen: " + (err?.message ?? "unknown"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title">{template.id ? "Editar template" : "Nuevo template"}</div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="drawer-body">
          <label className="field">
            <span className="label">Nombre</span>
            <input
              className="input"
              value={template.name ?? ""}
              onChange={(e) => onChange({ ...template, name: e.target.value })}
              placeholder="Ej: Bienvenida Oratoria"
            />
          </label>

          <label className="field">
            <span className="label">Cuerpo del mensaje</span>
            <textarea
              className="input textarea highlighted"
              rows={7}
              value={template.body ?? ""}
              onChange={(e) => onChange({ ...template, body: e.target.value })}
              placeholder={'[Hola|Buenas] {{nombre}}, ¿tienes 2 min?\n---\n[Avísame|Confírmame] por favor 🙏'}
            />
          </label>

          <SyntaxHelp body={template.body ?? ""} />

          {/* Image upload */}
          <div className="field">
            <span className="label">Imagen adjunta (opcional)</span>
            {template.image_url ? (
              <div className="tpl-img-preview">
                <img src={template.image_url} alt="" />
                <button className="btn ghost small danger" onClick={() => onChange({ ...template, image_url: null })}>
                  Quitar imagen
                </button>
              </div>
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                <button className="btn ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? "Subiendo…" : "📎 Subir imagen (máx 10MB)"}
                </button>
              </div>
            )}
          </div>

          {/* Live preview */}
          {previews.length > 0 && (
            <div className="field">
              <span className="label">Vista previa · 3 variantes (datos de muestra)</span>
              <div className="preview-grid">
                {previews.map((parts, i) => (
                  <div key={i} className="preview-variant">
                    <div className="preview-variant-label">Variante {i + 1}</div>
                    {template.image_url && <img src={template.image_url} alt="" className="preview-img" />}
                    {parts.map((p, j) => (
                      <div key={j} className="preview-bubble">
                        <pre>{p}</pre>
                        {j < parts.length - 1 && <span className="preview-split">— segundo mensaje —</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="row right">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn" onClick={onSave} disabled={!template.name?.trim() || !template.body?.trim()}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SyntaxHelp({ body }: { body: string }) {
  const hasSpin = /\[[^\]]*\|[^\]]*\]/.test(body);
  const hasSplit = /---/.test(body);
  const vars = [...new Set([...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))];

  return (
    <div className="syntax-help">
      <div className="syntax-row">
        <code>[a|b|c]</code> <span>→ elige una aleatoriamente por destinatario (anti-spam)</span>
        {hasSpin && <span className="syntax-ok">✓ detectado</span>}
      </div>
      <div className="syntax-row">
        <code>---</code> <span>→ divide el mensaje, se envía como varios mensajes consecutivos</span>
        {hasSplit && <span className="syntax-ok">✓ detectado</span>}
      </div>
      <div className="syntax-row">
        <code>{"{{variable}}"}</code> <span>→ disponibles: nombre, nombre_completo, curso, intereses, nivel, telefono, asignado</span>
      </div>
      {vars.length > 0 && (
        <div className="syntax-row">
          Variables en uso: {vars.map((v) => <code key={v}>{`{{${v}}}`}</code>)}
        </div>
      )}
    </div>
  );
}
