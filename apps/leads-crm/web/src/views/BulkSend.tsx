import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { renderTemplate } from "../lib";
import type { Lead, Operator, SenderPhone, Template } from "../types";

type Props = {
  leads: Lead[];
  onClose: () => void;
  onDone: (count: number) => void;
};

export function BulkSend({ leads, onClose, onDone }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [senders, setSenders] = useState<SenderPhone[]>([]);
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // assignedTo holds the operator's phone (preferred) or name; "" = unassigned (visible to all)
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    // default: 1 hour from now, formatted for <input type="datetime-local">
    const t = new Date(Date.now() + 60 * 60 * 1000);
    t.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.listTemplates().then(setTemplates).catch(() => {}); }, []);
  useEffect(() => { api.listOperators().then(setOperators).catch(() => {}); }, []);
  useEffect(() => { api.getSetting<SenderPhone[]>("sender_phones").then((s) => setSenders(s ?? [])).catch(() => {}); }, []);

  const scheduledISO = useMemo(() => {
    if (scheduleMode !== "later") return null;
    const t = new Date(scheduledAt);
    return isNaN(t.getTime()) ? null : t.toISOString();
  }, [scheduleMode, scheduledAt]);
  const scheduleInPast = scheduledISO ? new Date(scheduledISO).getTime() < Date.now() : false;

  function applyTemplate(t: Template) {
    setBody(t.body);
    setImageUrl(t.image_url);
  }

  const eligible = leads.filter((l) => l.phone);
  const skipped = leads.length - eligible.length;
  const preview = eligible[0] ? renderTemplate(body || "(escribe el mensaje arriba)", eligible[0]) : "";

  async function submit() {
    if ((!body.trim() && !imageUrl) || eligible.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createSends({
        lead_ids: eligible.map((l) => l.id),
        body: body.trim(),
        image_url: imageUrl,
        assigned_to: assignedTo.trim() || null,
        scheduled_at: scheduledISO,
      });
      onDone(created.length);
    } catch (e: any) {
      setError(e?.message || "Error al encolar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer narrow" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="drawer-title">Enviar a {eligible.length} lead{eligible.length === 1 ? "" : "s"}</div>
            <div className="drawer-sub">
              {leads.length} seleccionado{leads.length === 1 ? "" : "s"}
              {skipped > 0 && ` · ${skipped} sin teléfono (omitidos)`}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="drawer-body">
          {templates.length > 0 && (
            <div className="card">
              <h3>Templates</h3>
              <div className="template-row">
                {templates.map((t) => (
                  <button key={t.id} className="chip" onClick={() => applyTemplate(t)}>
                    {t.image_url && "🖼 "}{t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {imageUrl && (
            <div className="card">
              <h3>Imagen adjunta</h3>
              <div className="tpl-img-preview">
                <img src={imageUrl} alt="" />
                <button className="btn ghost small" onClick={() => setImageUrl(null)}>Quitar</button>
              </div>
            </div>
          )}

          <div className="card">
            <h3>Mensaje</h3>
            <textarea
              className="input textarea"
              rows={6}
              placeholder="Hola {{nombre}}, te ofrecemos el curso de {{curso}}..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="hint">Variables: {"{{nombre}} {{curso}} {{nivel}} {{telefono}} {{asignado}}"}</div>

            {body && eligible[0] && (
              <div className="preview" style={{ marginTop: 10 }}>
                <div className="label">Vista previa para {eligible[0].name}:</div>
                <pre>{preview}</pre>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Enviar desde</h3>
            <select
              className="input"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">Cualquier celular/operadora</option>
              {senders.filter((s) => s.active).length > 0 && (
                <optgroup label="Celulares de la empresa">
                  {senders.filter((s) => s.active).map((s, i) => (
                    <option key={`s-${i}`} value={s.phone}>
                      {s.label} · {s.phone}{s.country ? ` · ${s.country}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {operators.length > 0 && (
                <optgroup label="Operadoras (por cuenta)">
                  {operators.map((o) => {
                    const value = o.phone || o.name;
                    return (
                      <option key={`u-${o.id}`} value={value}>
                        {o.name}{o.phone ? ` · ${o.phone}` : ""}{o.role === "admin" ? " · admin" : ""}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
            <div className="hint">
              La extensión de WhatsApp conectada a ese número (o esa cuenta) tomará los mensajes.
              Administra los celulares desde Ajustes → "Celulares de la empresa".
            </div>
          </div>

          <div className="card">
            <h3>Cuándo enviar</h3>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <button
                type="button"
                className={`chip ${scheduleMode === "now" ? "active" : ""}`}
                onClick={() => setScheduleMode("now")}
              >
                Ahora
              </button>
              <button
                type="button"
                className={`chip ${scheduleMode === "later" ? "active" : ""}`}
                onClick={() => setScheduleMode("later")}
              >
                Programar
              </button>
            </div>
            {scheduleMode === "later" && (
              <>
                <input
                  className="input"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <div className="hint">
                  La extensión recogerá el envío automáticamente cuando llegue la hora,
                  siempre que esté abierta y conectada.
                  {scheduleInPast && <span style={{ color: "#ef4444" }}> · La fecha está en el pasado.</span>}
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3>Destinatarios</h3>
            <div className="bulk-list">
              {eligible.slice(0, 30).map((l) => (
                <div key={l.id} className="bulk-row">
                  <span className="bulk-name">{l.name}</span>
                  <span className="bulk-phone">{l.phone}</span>
                </div>
              ))}
              {eligible.length > 30 && <div className="hint">… y {eligible.length - 30} más</div>}
            </div>
          </div>

          {error && <div className="error">{error}</div>}

          <div className="row right">
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button
              className="btn"
              onClick={submit}
              disabled={submitting || (!body.trim() && !imageUrl) || eligible.length === 0 || (scheduleMode === "later" && !scheduledISO)}
            >
              {submitting
                ? "Encolando…"
                : scheduleMode === "later"
                  ? `Programar ${eligible.length} envío${eligible.length === 1 ? "" : "s"}`
                  : `Encolar ${eligible.length} envío${eligible.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
