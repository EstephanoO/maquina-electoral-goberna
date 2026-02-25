"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { listCmsContacts, type CmsContact, type CmsVoteTier } from "@/lib/services/cms";
import { AnimatedList } from "@/registry/magicui/animated-list";

const FONT = "var(--font-montserrat), system-ui, sans-serif";
const PAGE_LIMIT = 100;
const TAG_COLOR_PALETTE = [
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#84cc16",
  "#ec4899",
  "#6366f1",
] as const;

type LevelKey = CmsVoteTier;

type LevelConfig = {
  key: LevelKey;
  title: string;
  subtitle: string;
  accent: string;
  emptyLabel: string;
};

const LEVELS: LevelConfig[] = [
  {
    key: "contacto_basura",
    title: "Contacto basura",
    subtitle: "Nivel 1",
    accent: "#ef4444",
    emptyLabel: "No hay contactos clasificados como basura",
  },
  {
    key: "voto_blando",
    title: "Voto blando",
    subtitle: "Nivel 2",
    accent: "#f59e0b",
    emptyLabel: "No hay contactos clasificados como voto blando",
  },
  {
    key: "voto_duro",
    title: "Voto duro",
    subtitle: "Nivel 3",
    accent: "#10b981",
    emptyLabel: "No hay contactos clasificados como voto duro",
  },
];

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return "SN";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatPhone(phone: string): string {
  if (!phone) return "";
  if (phone.startsWith("+")) return phone;
  return `+51${phone}`;
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateShort(dateStr: string | null | undefined): string {
  const parsed = parseDate(dateStr);
  if (!parsed) return "--/--";
  return parsed.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function getLastInteractionMs(contact: CmsContact): number {
  const values = [
    contact.cms_respondieron_at,
    contact.cms_hablado_at,
    contact.cms_claimed_at,
    contact.created_at,
  ];

  return values.reduce((max, value) => {
    if (!value) return max;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return max;
    return Math.max(max, parsed);
  }, 0);
}

function formatRelative(dateMs: number): string {
  if (!dateMs) return "Sin actividad";
  const diffMs = Date.now() - dateMs;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function hashTag(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getTagColor(tagName: string): string {
  const normalized = tagName.trim().toLowerCase();
  if (!normalized) return TAG_COLOR_PALETTE[0];
  return TAG_COLOR_PALETTE[hashTag(normalized) % TAG_COLOR_PALETTE.length];
}

export default function CmsPipelinePage() {
  const { activeCampaignId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contactsByLevel, setContactsByLevel] = useState<Record<LevelKey, CmsContact[]>>({
    contacto_basura: [],
    voto_blando: [],
    voto_duro: [],
  });
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  const loadPipeline = useCallback(async () => {
    if (!activeCampaignId) return;

    setLoading(true);
    setError(null);

    const allContacts: CmsContact[] = [];
    let offset = 0;
    let total = 0;
    let pageCount = 0;

    while (pageCount < 50) {
      const result = await listCmsContacts(activeCampaignId, "todos", PAGE_LIMIT, offset, "");
      if (!result.ok) {
        setError("No se pudieron cargar los niveles del pipeline.");
        setLoading(false);
        return;
      }

      total = result.total;
      allContacts.push(...result.contacts);
      offset += result.contacts.length;
      pageCount += 1;

      if (allContacts.length >= total || result.contacts.length === 0) break;
    }

    const grouped: Record<LevelKey, CmsContact[]> = {
      contacto_basura: [],
      voto_blando: [],
      voto_duro: [],
    };

    let missingTier = 0;
    for (const contact of allContacts) {
      const tier = contact.cms_operator_notes?.vote_tier;
      if (tier === "contacto_basura" || tier === "voto_blando" || tier === "voto_duro") {
        grouped[tier].push(contact);
      } else {
        missingTier += 1;
      }
    }

    setContactsByLevel({
      contacto_basura: grouped.contacto_basura.slice().sort((a, b) => getLastInteractionMs(b) - getLastInteractionMs(a)),
      voto_blando: grouped.voto_blando.slice().sort((a, b) => getLastInteractionMs(b) - getLastInteractionMs(a)),
      voto_duro: grouped.voto_duro.slice().sort((a, b) => getLastInteractionMs(b) - getLastInteractionMs(a)),
    });
    setUnclassifiedCount(missingTier);
    setLoading(false);
  }, [activeCampaignId]);

  useEffect(() => {
    void loadPipeline();
  }, [loadPipeline]);

  const totalContacts = useMemo(
    () => contactsByLevel.contacto_basura.length + contactsByLevel.voto_blando.length + contactsByLevel.voto_duro.length,
    [contactsByLevel],
  );

  if (!activeCampaignId) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: "center",
          fontFamily: FONT,
          color: "#64748b",
        }}
      >
        Selecciona una campana para ver el pipeline.
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: FONT,
        minHeight: "calc(100dvh - 64px)",
        height: "calc(100dvh - 64px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/cms"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#1e293b",
            textDecoration: "none",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <title>Volver</title>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Volver al chat CMS
        </Link>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 999,
              border: "1px solid #d6dde6",
              background: "#ffffff",
              color: "#334155",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>Pipeline de 3 niveles</span>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#94a3b8",
              }}
            />
            <span>{totalContacts} contactos</span>
          </div>

          {unclassifiedCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "1px solid #fed7aa",
                background: "#fff7ed",
                color: "#9a3412",
                borderRadius: 999,
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 700,
              }}
              title="Contactos sin vote_tier definido"
            >
              Sin clasificar: {unclassifiedCount}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              void loadPipeline();
            }}
            disabled={loading}
            style={{
              border: "1px solid #d6dde6",
              background: "#ffffff",
              color: "#334155",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading ? "Cargando..." : "Recargar"}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            borderRadius: 10,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            border: "1px solid #d6dde6",
            borderRadius: 16,
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#64748b",
            fontWeight: 600,
          }}
        >
          Cargando pipeline...
        </div>
      ) : (
        <div className="cms-pipeline-scroll">
          <div className="cms-pipeline-grid">
            {LEVELS.map((level) => {
              const contacts = contactsByLevel[level.key];

              return (
                <section key={level.key} className="cms-pipeline-column">
                  <header className="cms-pipeline-column-header">
                    <div>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        {level.title}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color: "#64748b",
                        }}
                      >
                        {level.subtitle}
                      </div>
                    </div>

                    <span
                      style={{
                        minWidth: 30,
                        padding: "4px 8px",
                        borderRadius: 999,
                        textAlign: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#0f172a",
                        border: "1px solid #dbe3ec",
                        background: "#ffffff",
                      }}
                    >
                      {contacts.length}
                    </span>
                  </header>

                  <div
                    style={{
                      height: 3,
                      margin: "0 12px",
                      borderRadius: 999,
                      background: level.accent,
                    }}
                  />

                  <div className="cms-pipeline-column-body">
                    {contacts.length === 0 ? (
                      <div
                        style={{
                          margin: "16px 12px",
                          padding: "16px 12px",
                          borderRadius: 12,
                          border: "1px dashed #cbd5e1",
                          textAlign: "center",
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        {level.emptyLabel}
                      </div>
                    ) : (
                      <AnimatedList className="cms-pipeline-list" delay={90}>
                        {contacts.map((contact) => {
                          const name = contact.nombre?.trim() || "Sin nombre";
                          const zone = contact.zona || contact.distrito || "Sin zona";
                          const lastActivityMs = getLastInteractionMs(contact);
                          const activityLabel = formatRelative(lastActivityMs);
                          const tags = (contact.cms_tags ?? []).slice(0, 3);

                          return (
                            <article
                              key={contact.id}
                              style={{
                                borderRadius: 14,
                                border: "1px solid #d6dde6",
                                background: "#ffffff",
                                padding: "10px 12px",
                                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <div
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: "50%",
                                      border: "1px solid #d7e0ec",
                                      background: "#dbe3ec",
                                      color: "#1e293b",
                                      fontSize: 12,
                                      fontWeight: 800,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {getInitials(name)}
                                  </div>

                                  <div style={{ minWidth: 0 }}>
                                    <div
                                      style={{
                                        fontSize: 14,
                                        fontWeight: 700,
                                        color: "#0f172a",
                                        lineHeight: 1.2,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {name}
                                    </div>
                                    <div
                                      style={{
                                        marginTop: 2,
                                        fontSize: 12,
                                        color: "#475569",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      {zone}
                                    </div>
                                  </div>
                                </div>

                                <span
                                  style={{
                                    flexShrink: 0,
                                    fontSize: 11,
                                    color: "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  {formatDateShort(contact.created_at)}
                                </span>
                              </div>

                              {contact.telefono && (
                                <div
                                  style={{
                                    marginTop: 8,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    color: "#25D366",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                    <title>WhatsApp</title>
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                  </svg>
                                  {formatPhone(contact.telefono)}
                                </div>
                              )}

                              <div
                                style={{
                                  marginTop: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flexWrap: "wrap",
                                    minHeight: 22,
                                  }}
                                >
                                  {tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 4,
                                        borderRadius: 999,
                                        border: "1px solid #dbe3ec",
                                        background: "#f8fafc",
                                        padding: "3px 8px",
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: getTagColor(tag),
                                        maxWidth: 120,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: 7,
                                          height: 7,
                                          borderRadius: "50%",
                                          background: getTagColor(tag),
                                          flexShrink: 0,
                                        }}
                                      />
                                      {tag}
                                    </span>
                                  ))}
                                </div>

                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    flexShrink: 0,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: "#475569",
                                  }}
                                  title="Ultima interaccion"
                                >
                                  <span
                                    style={{
                                      width: 7,
                                      height: 7,
                                      borderRadius: "50%",
                                      background: level.accent,
                                      flexShrink: 0,
                                    }}
                                  />
                                  {activityLabel}
                                </span>
                              </div>
                            </article>
                          );
                        })}
                      </AnimatedList>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        .cms-pipeline-scroll {
          flex: 1;
          min-height: 0;
          overflow-x: auto;
          overflow-y: hidden;
          padding-bottom: 4px;
        }

        .cms-pipeline-grid {
          height: 100%;
          min-width: 980px;
          display: grid;
          grid-template-columns: repeat(3, minmax(300px, 1fr));
          gap: 12px;
        }

        .cms-pipeline-column {
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid #d6dde6;
          border-radius: 16px;
          overflow: hidden;
          background: #f8fafc;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
        }

        .cms-pipeline-column-header {
          padding: 12px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          background: #f1f5f9;
        }

        .cms-pipeline-column-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
        }

        .cms-pipeline-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px;
        }

        @media (max-width: 1024px) {
          .cms-pipeline-grid {
            min-width: 900px;
            grid-template-columns: repeat(3, minmax(280px, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
