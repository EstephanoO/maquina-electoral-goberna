"use client";

/**
 * GOBERNA — Voter Profiles Tab
 *
 * Unified voter tracking:
 * - KPI strip (total, by pipeline status, by vote class)
 * - Filterable/searchable table of voter profiles
 * - Expandable detail panel with edit capability
 * - Pipeline status quick-change buttons
 */

import { useEffect, useState, useCallback } from "react";
import {
  getVoterProfiles,
  getVoterProfileStats,
  updateVoterProfile,
  updateVoterPipelineStatus,
  type VoterProfile,
  type VoterProfileStats,
  type PipelineStatus,
  PIPELINE_STATUSES,
} from "@/lib/services/voter-profiles";

// ── Palette ─────────────────────────────────────────────────────────
const G = {
  gold: "#FFC800", goldDim: "#CC9F00", goldFaint: "rgba(255,200,0,0.10)",
  goldBorder: "rgba(255,200,0,0.25)", bg: "#060e18", surface: "#0c1a28",
  surfaceUp: "#0f2035", border: "rgba(255,255,255,0.06)", text: "#e9eef3",
  textMid: "#7a95aa", textDim: "#334d63", green: "#22c55e", red: "#ef5350",
  blue: "#3b82f6", orange: "#f59e0b", purple: "#a855f7", cyan: "#06b6d4",
} as const;

const STATUS_COLORS: Record<string, string> = {
  nuevo: G.textMid, contactado: G.blue, respondido: G.cyan,
  comprometido: G.green, invalido: G.red,
};
const VOTE_COLORS: Record<string, string> = {
  duro: G.green, blando: G.cyan, flotante: G.orange,
  invalido: G.red, sin_clasificar: G.textDim,
};

// ── Helpers ──────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function fmtPhone(p: string): string {
  if (p.length === 9) return `+51 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  return p;
}

// ══════════════════════════════════════════════════════════════════════
// EDIT PANEL
// ══════════════════════════════════════════════════════════════════════

function EditPanel({ profile, campaignId, onSaved, onClose }: {
  profile: VoterProfile; campaignId: string;
  onSaved: (p: VoterProfile) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    canonical_name: profile.canonical_name,
    zona: profile.zona,
    distrito: profile.distrito,
    domicilio: profile.domicilio,
    local_votacion: profile.local_votacion,
    vote_class: profile.vote_class,
    notes: profile.notes,
    tags: profile.tags.join(", "),
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const res = await updateVoterProfile(campaignId, profile.id, {
      canonical_name: form.canonical_name,
      zona: form.zona,
      distrito: form.distrito,
      domicilio: form.domicilio,
      local_votacion: form.local_votacion,
      vote_class: form.vote_class,
      notes: form.notes,
      tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
    });
    setSaving(false);
    if (res.ok && res.profile) onSaved(res.profile);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    background: G.surfaceUp, border: `1px solid ${G.border}`,
    color: G.text, fontSize: 12, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase",
    letterSpacing: "0.5px", marginBottom: 4,
  };

  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.goldBorder}`, borderRadius: 14,
      padding: "20px 24px", marginTop: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: G.gold }}>Editar Perfil</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={handleSave} disabled={saving} style={{
            padding: "6px 16px", borderRadius: 8, border: "none",
            background: G.green, color: "#fff", fontSize: 11, fontWeight: 700,
            cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1,
          }}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={onClose} style={{
            padding: "6px 12px", borderRadius: 8, border: `1px solid ${G.border}`,
            background: "transparent", color: G.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>
            Cancelar
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={labelStyle}>Nombre</div>
          <input value={form.canonical_name} onChange={e => setForm(f => ({ ...f, canonical_name: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Clasificacion</div>
          <select value={form.vote_class} onChange={e => setForm(f => ({ ...f, vote_class: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
            <option value="">Sin clasificar</option>
            <option value="duro">Duro</option>
            <option value="blando">Blando</option>
            <option value="flotante">Flotante</option>
            <option value="invalido">Invalido</option>
          </select>
        </div>
        <div>
          <div style={labelStyle}>Zona</div>
          <input value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Distrito</div>
          <input value={form.distrito} onChange={e => setForm(f => ({ ...f, distrito: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Domicilio</div>
          <input value={form.domicilio} onChange={e => setForm(f => ({ ...f, domicilio: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Local de Votacion</div>
          <input value={form.local_votacion} onChange={e => setForm(f => ({ ...f, local_votacion: e.target.value }))} style={inputStyle} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>Notas</div>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>Tags (separados por coma)</div>
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} style={inputStyle} placeholder="voto_seguro, sector_salud, zona_norte" />
        </div>
      </div>

      {/* Name variants */}
      {profile.name_variants.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={labelStyle}>Nombres observados</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {profile.name_variants.map(n => (
              <span key={n} style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 6,
                background: "rgba(255,255,255,0.04)", color: G.textDim,
              }}>{n}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DETAIL ROW (expandable)
// ══════════════════════════════════════════════════════════════════════

function ProfileDetail({ profile, campaignId, onUpdate }: {
  profile: VoterProfile; campaignId: string;
  onUpdate: (p: VoterProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  const handleStatusChange = async (newStatus: PipelineStatus) => {
    setChangingStatus(true);
    const res = await updateVoterPipelineStatus(campaignId, profile.id, newStatus);
    setChangingStatus(false);
    if (res.ok && res.profile) onUpdate(res.profile);
  };

  return (
    <div style={{ padding: "12px 16px" }}>
      {/* Pipeline buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {PIPELINE_STATUSES.map(s => (
          <button
            key={s}
            type="button"
            disabled={changingStatus || profile.pipeline_status === s}
            onClick={() => handleStatusChange(s)}
            style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 700,
              border: profile.pipeline_status === s ? `2px solid ${STATUS_COLORS[s]}` : `1px solid ${G.border}`,
              background: profile.pipeline_status === s ? `${STATUS_COLORS[s]}15` : "transparent",
              color: profile.pipeline_status === s ? STATUS_COLORS[s] : G.textDim,
              cursor: profile.pipeline_status === s || changingStatus ? "default" : "pointer",
              textTransform: "capitalize", transition: "all 0.2s",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <InfoItem label="Telefono" value={fmtPhone(profile.canonical_phone)} />
        <InfoItem label="Zona" value={profile.zona || "\u2014"} />
        <InfoItem label="Distrito" value={profile.distrito || "\u2014"} />
        <InfoItem label="Domicilio" value={profile.domicilio || "\u2014"} />
        <InfoItem label="Local Votacion" value={profile.local_votacion || "\u2014"} />
        <InfoItem label="WA Enviados" value={String(profile.wa_sent_count)} color={G.cyan} />
        <InfoItem label="WA Recibidos" value={String(profile.wa_received_count)} color={G.green} />
        <InfoItem label="Capturado" value={fmtDate(profile.first_captured_at)} />
        <InfoItem label="Ultimo contacto" value={fmtDate(profile.last_contacted_at)} />
        {profile.category && <InfoItem label="Categoria" value={profile.category} color={G.purple} />}
        {profile.confidence != null && <InfoItem label="Confianza IA" value={`${Math.round(profile.confidence * 100)}%`} />}
      </div>

      {/* Tags */}
      {profile.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {profile.tags.map(t => (
            <span key={t} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 6,
              background: `${G.gold}15`, color: G.goldDim, fontWeight: 700,
            }}>{t}</span>
          ))}
        </div>
      )}

      {/* Notes */}
      {profile.notes && (
        <div style={{
          padding: "8px 12px", borderRadius: 8, marginBottom: 10,
          background: "rgba(255,255,255,0.02)", border: `1px solid ${G.border}`,
          fontSize: 11, color: G.textMid, lineHeight: 1.5,
        }}>
          {profile.notes}
        </div>
      )}

      {/* Edit button */}
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        style={{
          padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700,
          border: `1px solid ${G.goldBorder}`, background: G.goldFaint,
          color: G.gold, cursor: "pointer",
        }}
      >
        {editing ? "Ocultar editor" : "Editar perfil"}
      </button>

      {editing && (
        <EditPanel
          profile={profile}
          campaignId={campaignId}
          onSaved={(p) => { onUpdate(p); setEditing(false); }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: G.textDim, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: color ?? G.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════

export function VoterProfilesTab({ campaignId }: { campaignId: string }) {
  const [profiles, setProfiles] = useState<VoterProfile[]>([]);
  const [stats, setStats] = useState<VoterProfileStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [voteFilter, setVoteFilter] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;

  const loadData = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    const [profilesRes, statsRes] = await Promise.all([
      getVoterProfiles(campaignId, {
        pipeline_status: statusFilter || undefined,
        vote_class: voteFilter || undefined,
        search: search || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
      getVoterProfileStats(campaignId),
    ]);

    if (!profilesRes.ok) { setError(profilesRes.error ?? "Error"); setLoading(false); return; }
    setProfiles(profilesRes.items ?? []);
    setTotal(profilesRes.total ?? 0);
    setPage(offset);

    if (statsRes.ok && statsRes.stats) setStats(statsRes.stats);
    setLoading(false);
  }, [campaignId, statusFilter, voteFilter, search]);

  useEffect(() => { loadData(0); }, [loadData]);

  const handleProfileUpdate = useCallback((updated: VoterProfile) => {
    setProfiles(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(page / PAGE_SIZE) + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ══ KPI Strip ══ */}
      {stats && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <MiniKpi label="Total Votantes" value={stats.total} color={G.gold} />
          {Object.entries(stats.by_status).map(([s, c]) => (
            <MiniKpi key={s} label={s} value={c as number} color={STATUS_COLORS[s] ?? G.textMid} />
          ))}
          <MiniKpi label="Con WA" value={stats.with_wa_contact} color={G.cyan} />
          <MiniKpi label="Respondieron" value={stats.with_responses} color={G.green} />
        </div>
      )}

      {/* ══ Filters ══ */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
        padding: "10px 16px",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") loadData(0); }}
          placeholder="Buscar nombre, telefono, zona..."
          style={{
            flex: 1, minWidth: 180, padding: "7px 12px", borderRadius: 8,
            background: G.surfaceUp, border: `1px solid ${G.border}`,
            color: G.text, fontSize: 12, outline: "none",
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: "7px 10px", borderRadius: 8,
            background: G.surfaceUp, border: `1px solid ${G.border}`,
            color: G.text, fontSize: 11, cursor: "pointer",
          }}
        >
          <option value="">Todos los estados</option>
          {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={voteFilter}
          onChange={e => setVoteFilter(e.target.value)}
          style={{
            padding: "7px 10px", borderRadius: 8,
            background: G.surfaceUp, border: `1px solid ${G.border}`,
            color: G.text, fontSize: 11, cursor: "pointer",
          }}
        >
          <option value="">Todas las clasificaciones</option>
          <option value="duro">Duro</option>
          <option value="blando">Blando</option>
          <option value="flotante">Flotante</option>
          <option value="invalido">Invalido</option>
        </select>
        <button
          type="button"
          onClick={() => loadData(0)}
          disabled={loading}
          style={{
            padding: "7px 14px", borderRadius: 8, border: `1px solid ${G.goldBorder}`,
            background: G.goldFaint, color: G.gold, fontSize: 11, fontWeight: 700,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "\u00B7\u00B7\u00B7" : "Buscar"}
        </button>
      </div>

      {/* ══ Error ══ */}
      {error && (
        <div style={{
          background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.22)",
          borderRadius: 10, padding: "10px 16px", fontSize: 12, color: G.red,
        }}>{error}</div>
      )}

      {/* ══ Table ══ */}
      <div style={{
        background: G.surface, border: `1px solid ${G.border}`, borderRadius: 12,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${G.border}` }}>
              {["Nombre", "Telefono", "Estado", "Voto", "Zona", "WA", "Capturado", "Contacto"].map(h => (
                <th key={h} style={{
                  padding: "10px 12px", textAlign: "left", fontWeight: 800,
                  color: G.textMid, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 9,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <ProfileTableRow
                key={p.id}
                profile={p}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                campaignId={campaignId}
                onUpdate={handleProfileUpdate}
              />
            ))}
            {profiles.length === 0 && !loading && (
              <tr>
                <td colSpan={8} style={{ padding: 30, textAlign: "center", color: G.textDim }}>
                  {search || statusFilter || voteFilter ? "Sin resultados para estos filtros" : "Sin perfiles de votantes"}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 30, textAlign: "center", color: G.textDim }}>
                  Cargando...
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
            padding: "12px 16px", borderTop: `1px solid ${G.border}`,
          }}>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => loadData(page - PAGE_SIZE)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: `1px solid ${G.border}`,
                background: "transparent", color: currentPage <= 1 ? G.textDim : G.text,
                fontSize: 11, cursor: currentPage <= 1 ? "default" : "pointer",
              }}
            >
              Anterior
            </button>
            <span style={{ fontSize: 11, color: G.textMid }}>
              {currentPage} / {totalPages} ({total} total)
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => loadData(page + PAGE_SIZE)}
              style={{
                padding: "5px 12px", borderRadius: 6, border: `1px solid ${G.border}`,
                background: "transparent", color: currentPage >= totalPages ? G.textDim : G.text,
                fontSize: 11, cursor: currentPage >= totalPages ? "default" : "pointer",
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Table row ───────────────────────────────────────────────────────

function ProfileTableRow({ profile, expanded, onToggle, campaignId, onUpdate }: {
  profile: VoterProfile; expanded: boolean;
  onToggle: () => void; campaignId: string;
  onUpdate: (p: VoterProfile) => void;
}) {
  const p = profile;
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          borderBottom: `1px solid ${G.border}`,
          cursor: "pointer", transition: "background 0.15s",
          background: expanded ? G.surfaceUp : "transparent",
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <td style={{ padding: "10px 12px", fontWeight: 700, color: G.text, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.canonical_name || fmtPhone(p.canonical_phone)}
        </td>
        <td style={{ padding: "10px 12px", color: G.textDim, fontFamily: "monospace", fontSize: 10 }}>
          {p.canonical_phone}
        </td>
        <td style={{ padding: "10px 12px" }}>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
            background: `${STATUS_COLORS[p.pipeline_status] ?? G.textDim}15`,
            color: STATUS_COLORS[p.pipeline_status] ?? G.textDim,
            textTransform: "capitalize",
          }}>{p.pipeline_status}</span>
        </td>
        <td style={{ padding: "10px 12px" }}>
          {p.vote_class ? (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
              background: `${VOTE_COLORS[p.vote_class] ?? G.textDim}15`,
              color: VOTE_COLORS[p.vote_class] ?? G.textDim,
              textTransform: "capitalize",
            }}>{p.vote_class}</span>
          ) : (
            <span style={{ fontSize: 9, color: G.textDim }}>\u2014</span>
          )}
        </td>
        <td style={{ padding: "10px 12px", color: G.textDim, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.zona || p.distrito || "\u2014"}
        </td>
        <td style={{ padding: "10px 12px" }}>
          {(p.wa_sent_count > 0 || p.wa_received_count > 0) ? (
            <span style={{ fontSize: 10, color: G.cyan }}>
              {p.wa_sent_count}\u2191 {p.wa_received_count}\u2193
            </span>
          ) : (
            <span style={{ fontSize: 9, color: G.textDim }}>\u2014</span>
          )}
        </td>
        <td style={{ padding: "10px 12px", color: G.textDim, fontSize: 10 }}>
          {fmtDate(p.first_captured_at)}
        </td>
        <td style={{ padding: "10px 12px", color: G.textDim, fontSize: 10 }}>
          {fmtDate(p.last_contacted_at)}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: G.surfaceUp, borderBottom: `1px solid ${G.goldBorder}` }}>
            <ProfileDetail profile={p} campaignId={campaignId} onUpdate={onUpdate} />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Mini KPI ────────────────────────────────────────────────────────

function MiniKpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10, minWidth: 90,
      background: `linear-gradient(135deg, ${G.surface} 0%, ${G.surfaceUp} 100%)`,
      border: `1px solid ${G.border}`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value.toLocaleString()}</div>
      <div style={{
        fontSize: 8, fontWeight: 800, color: G.textMid, textTransform: "uppercase",
        letterSpacing: "0.6px", marginTop: 3,
      }}>{label}</div>
    </div>
  );
}
