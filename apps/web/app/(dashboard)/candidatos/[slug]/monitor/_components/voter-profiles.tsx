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
import { MONITOR_THEME as G } from "./theme";
import { MetricCard } from "./metric-card";

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

function voteClassLabel(v: string): string {
  return v === "duro" ? "Duro" : v === "blando" ? "Blando" : v === "flotante" ? "Flotante" : v === "invalido" ? "Invalido" : v;
}

function StatusIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5L15.5 10" />
    </svg>
  );
}

function VoteIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
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
    background: G.surfaceAlt, border: `1px solid ${G.borderStrong}`,
    color: G.text, fontSize: 12, outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: G.textMid, textTransform: "uppercase",
    letterSpacing: "0.5px", marginBottom: 4,
  };

  return (
    <div style={{
      background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
      padding: "20px 24px", marginTop: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: G.brandBlue }}>Editar Perfil</span>
        <span style={{ fontSize: 10, color: G.textDim }}>Actualiza los datos del perfil</span>
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
                background: G.surfaceAlt, color: G.textDim,
              }}>{n}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 14px", borderRadius: 12, border: `1px solid ${G.borderStrong}`,
          background: G.surfaceAlt, color: G.textMid, fontSize: 11, fontWeight: 700, cursor: "pointer",
          transition: "transform 0.18s ease, background-color 0.18s ease, border-color 0.18s ease",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = "translateY(-1px)";
          event.currentTarget.style.background = G.surfaceSoft;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.background = G.surfaceAlt;
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
          Cancelar
        </button>
        <button type="button" onClick={handleSave} disabled={saving} style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 16px", borderRadius: 12, border: "none",
          background: G.green, color: "#fff", fontSize: 11, fontWeight: 700,
          cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1,
          transition: "transform 0.18s ease, filter 0.18s ease",
        }}
        onMouseEnter={(event) => {
          if (saving) return;
          event.currentTarget.style.transform = "translateY(-1px)";
          event.currentTarget.style.filter = "brightness(1.03)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.filter = "brightness(1)";
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

function EditProfileModal({ profile, campaignId, onSaved, onClose }: {
  profile: VoterProfile;
  campaignId: string;
  onSaved: (p: VoterProfile) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        zIndex: 80,
      }}
    >
      <button
        type="button"
        aria-label="Cerrar modal de editar perfil"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: "none",
          background: "rgba(15, 23, 42, 0.32)",
          backdropFilter: "blur(4px)",
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(920px, 100%)",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          borderRadius: 28,
        }}
      >
        <EditPanel profile={profile} campaignId={campaignId} onSaved={onSaved} onClose={onClose} />
      </div>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: G.text, lineHeight: 1.1 }}>
            {profile.canonical_name || fmtPhone(profile.canonical_phone)}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: G.textDim }}>
            {fmtPhone(profile.canonical_phone)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Editar perfil"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: `1px solid ${G.borderStrong}`,
            background: G.surfaceSoft,
            color: G.brandBlue,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      {/* Info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
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

      {/* Pipeline buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {PIPELINE_STATUSES.map(s => (
          <button
            key={s}
            type="button"
            disabled={changingStatus || profile.pipeline_status === s}
            onClick={() => handleStatusChange(s)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700,
              border: `1px solid ${profile.pipeline_status === s ? STATUS_COLORS[s] : G.borderStrong}`,
              background: profile.pipeline_status === s ? `${STATUS_COLORS[s]}12` : G.surface,
              color: profile.pipeline_status === s ? STATUS_COLORS[s] : G.textDim,
              cursor: profile.pipeline_status === s || changingStatus ? "default" : "pointer",
              textTransform: "capitalize", transition: "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
            }}
          >
            <StatusIcon color={profile.pipeline_status === s ? STATUS_COLORS[s] : G.textDim} />
            {s}
          </button>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, padding: "7px 12px", borderRadius: 999, background: `${VOTE_COLORS[profile.vote_class] ?? G.textDim}12`, color: VOTE_COLORS[profile.vote_class] ?? G.textDim, textTransform: "capitalize", border: `1px solid ${VOTE_COLORS[profile.vote_class] ?? G.borderStrong}` }}>
          <VoteIcon color={VOTE_COLORS[profile.vote_class] ?? G.textDim} />
          {profile.vote_class ? voteClassLabel(profile.vote_class) : "No definido"}
        </span>
      </div>

      {/* Tags */}
      {profile.tags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
          {profile.tags.map(t => (
            <span key={t} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 6,
                background: G.surfaceSoft, color: G.brandBlue, fontWeight: 700,
            }}>{t}</span>
          ))}
        </div>
      )}

      {/* Notes */}
      {profile.notes && (
        <div style={{
          padding: "8px 12px", borderRadius: 8, marginBottom: 10,
          background: G.surfaceAlt, border: `1px solid ${G.border}`,
          fontSize: 11, color: G.textMid, lineHeight: 1.5,
        }}>
          {profile.notes}
        </div>
      )}

      {editing && (
        <EditProfileModal
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

function DeltaCard({ label, value, color, percentage }: { label: string; value: number; color: string; percentage: number }) {
  const positive = percentage >= 50;
  const tone = positive ? G.green : G.red;

  return (
    <div style={{
      padding: "14px 16px",
      background: G.surface,
      border: `1px solid ${G.borderStrong}`,
      borderRadius: 24,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: G.textMid, textTransform: "uppercase", letterSpacing: "2.4px" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: G.text, lineHeight: 1 }}>{value.toLocaleString()}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: tone }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {positive ? <path d="m7 14 5-5 5 5" /> : <path d="m7 10 5 5 5-5" />}
        </svg>
        <span style={{ fontSize: 12, fontWeight: 800 }}>{Math.round(percentage)}%</span>
      </div>
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
  const [selectedProfile, setSelectedProfile] = useState<VoterProfile | null>(null);

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
    setSelectedProfile((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(page / PAGE_SIZE) + 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ══ KPI Strip ══ */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <DeltaCard label="Total Votantes" value={stats.total} color={G.brandBlue} percentage={(stats.with_wa_contact / Math.max(stats.total, 1)) * 100} />
          <MetricCard
            label="Respondieron"
            value={stats.with_responses}
            color={G.green}
            trend={[stats.with_responses, Math.max(stats.with_wa_contact - stats.with_responses, 0), stats.total]}
            trendType="line"
          />
          <MetricCard
            label="Comprometidos"
            value={Number(stats.by_status.comprometido ?? 0)}
            color={STATUS_COLORS.comprometido}
            trend={[
              Number(stats.by_status.nuevo ?? 0),
              Number(stats.by_status.contactado ?? 0),
              Number(stats.by_status.respondido ?? 0),
              Number(stats.by_status.comprometido ?? 0),
            ]}
            trendType="line"
          />
        </div>
      )}

      {/* ══ Filters ══ */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
        background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
        padding: "10px 16px",
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") loadData(0); }}
          placeholder="Buscar nombre, telefono, zona..."
          style={{
            flex: 1, minWidth: 180, padding: "7px 12px", borderRadius: 14,
            background: G.surfaceAlt, border: `1px solid ${G.borderStrong}`,
            color: G.text, fontSize: 12, outline: "none",
          }}
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: "7px 10px", borderRadius: 14,
            background: G.surfaceAlt, border: `1px solid ${G.borderStrong}`,
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
            padding: "7px 10px", borderRadius: 14,
            background: G.surfaceAlt, border: `1px solid ${G.borderStrong}`,
            color: G.text, fontSize: 11, cursor: "pointer",
          }}
        >
          <option value="">Todas las clasificaciones</option>
          <option value="duro">Duro</option>
          <option value="blando">Blando</option>
          <option value="flotante">Flotante</option>
          <option value="invalido">Invalido</option>
        </select>
      </div>

      {/* ══ Error ══ */}
      {error && (
        <div style={{
          background: G.redSoft, border: `1px solid ${G.red}`,
          borderRadius: 24, padding: "10px 16px", fontSize: 12, color: G.red,
        }}>{error}</div>
      )}

      {/* ══ Table ══ */}
      <div style={{
        background: G.surface, border: `1px solid ${G.borderStrong}`, borderRadius: 24,
        overflow: "hidden",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${G.border}` }}>
              {["Nombre", "Telefono", "Estado", "Voto", "Capturado"].map(h => (
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
                onOpen={() => setSelectedProfile(p)}
              />
            ))}
            {profiles.length === 0 && !loading && (
              <tr>
                <td colSpan={5} style={{ padding: 30, textAlign: "center", color: G.textDim }}>
                  {search || statusFilter || voteFilter ? "Sin resultados para estos filtros" : "Sin perfiles de votantes"}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: 30, textAlign: "center", color: G.textDim }}>
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
                 width: 34, height: 34, borderRadius: 999, border: `1px solid ${G.borderStrong}`,
                 background: "transparent", color: currentPage <= 1 ? G.textDim : G.text,
                 fontSize: 11, cursor: currentPage <= 1 ? "default" : "pointer",
                 display: "inline-flex", alignItems: "center", justifyContent: "center",
               }}
              aria-label="Pagina anterior"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span style={{ fontSize: 11, color: G.textMid }}>
              {currentPage} / {totalPages} ({total} total)
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => loadData(page + PAGE_SIZE)}
              style={{
                  width: 34, height: 34, borderRadius: 999, border: `1px solid ${G.borderStrong}`,
                  background: "transparent", color: currentPage >= totalPages ? G.textDim : G.text,
                 fontSize: 11, cursor: currentPage >= totalPages ? "default" : "pointer",
                 display: "inline-flex", alignItems: "center", justifyContent: "center",
               }}
              aria-label="Pagina siguiente"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {selectedProfile && (
        <ProfileDetailModal
          profile={selectedProfile}
          campaignId={campaignId}
          onUpdate={handleProfileUpdate}
          onClose={() => setSelectedProfile(null)}
        />
      )}
    </div>
  );
}

// ── Table row ───────────────────────────────────────────────────────

function ProfileTableRow({ profile, onOpen }: {
  profile: VoterProfile;
  onOpen: () => void;
}) {
  const p = profile;
  return (
    <tr
      onClick={onOpen}
      style={{
        borderBottom: `1px solid ${G.border}`,
        cursor: "pointer", transition: "background 0.15s",
        background: "transparent",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = G.surfaceAlt; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
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
            <span style={{ fontSize: 9, color: G.textDim }}>No definido</span>
          )}
        </td>
        <td style={{ padding: "10px 12px", color: G.textDim, fontSize: 10 }}>
          {fmtDate(p.first_captured_at)}
        </td>
    </tr>
  );
}

function ProfileDetailModal({ profile, campaignId, onUpdate, onClose }: {
  profile: VoterProfile;
  campaignId: string;
  onUpdate: (p: VoterProfile) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <button
        type="button"
        aria-label="Cerrar modal de perfil"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, border: "none", background: "rgba(15, 23, 42, 0.32)", backdropFilter: "blur(4px)", cursor: "pointer" }}
      />
      <div style={{ position: "relative", width: "min(760px, 100%)", maxHeight: "calc(100vh - 48px)", overflowY: "auto", background: G.surfaceAlt, borderRadius: 28, padding: 12 }}>
        <ProfileDetail profile={profile} campaignId={campaignId} onUpdate={onUpdate} />
      </div>
    </div>
  );
}
