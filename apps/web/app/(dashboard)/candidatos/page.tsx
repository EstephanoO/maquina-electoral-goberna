/**
 * GOBERNA — Candidatos Page
 * Admin page for managing candidates and access requests.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// Context
import { useAuth } from "../../../lib/auth-context";

// UI Components
import { Tabs, SlideOver, Spinner, Button, PageHeader, SkeletonList } from "../../../lib/ui";

// Hooks
import { useInjectStyles } from "../../../lib/hooks";

// Services
import { listCampaigns, listAccessRequests } from "../../../lib/services";

// Types
import type { Campaign, AccessRequest } from "../../../lib/types";

// Feature Components
import { CandidateList, AccessRequestList, CreateCandidateForm, EditCandidateForm } from "./_components";

// Constants
import { FONT_STACK } from "../../../lib/constants";

// ── Page Component ─────────────────────────────────────────────────

export default function CandidatosPage() {
  const { user, refreshSession } = useAuth();
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = useState<"candidatos" | "solicitudes">("candidatos");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Campaign | null>(null);

  const isAdmin = user?.role === "admin";

  // Inject animation styles
  useInjectStyles();

  // Redirect non-admin users
  useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/home");
    }
  }, [user, isAdmin, router]);

  // Fetch data
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignsRes, requestsRes] = await Promise.all([
        listCampaigns(),
        listAccessRequests("pending"),
      ]);

      if (campaignsRes.ok && campaignsRes.data) {
        setCampaigns(campaignsRes.data.campaigns);
      }
      if (requestsRes.ok && requestsRes.data) {
        setRequests(requestsRes.data.access_requests);
      }
    } catch {
      // Silently fail — user sees empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchAll();
    }
  }, [isAdmin, fetchAll]);

  // Early return for non-admin
  if (!isAdmin) return null;

  const pendingCount = requests.length;

  const tabs = [
    { id: "candidatos", label: "Candidatos" },
    { id: "solicitudes", label: "Solicitudes", badge: pendingCount },
  ];

  return (
    <div style={{ fontFamily: FONT_STACK }}>
      <PageHeader
        title="Candidatos & Solicitudes"
        description="Gestione candidatos y apruebe solicitudes de acceso de usuarios."
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Candidatos" }]}
        badge={
          pendingCount > 0 ? (
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--radius-full)",
              background: "var(--color-warning-bg)",
              color: "var(--color-warning)",
            }}>
              {pendingCount} pendientes
            </span>
          ) : undefined
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreatePanel(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6 }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuevo Candidato
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as "solicitudes" | "candidatos")}
      />

      {/* Loading */}
      {loading && (
        <div style={{ padding: "24px 0" }}>
          <SkeletonList items={5} />
        </div>
      )}

      {/* Tab: Solicitudes */}
      {!loading && activeTab === "solicitudes" && (
        <AccessRequestList requests={requests} onResolved={fetchAll} />
      )}

      {/* Tab: Candidatos */}
      {!loading && activeTab === "candidatos" && (
        <CandidateList candidates={campaigns} onEdit={setEditingCandidate} />
      )}

      {/* Create Candidate Slide-over */}
      <SlideOver
        open={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="NUEVO CANDIDATO"
      >
        <CreateCandidateForm
          onSuccess={() => {
            setShowCreatePanel(false);
            fetchAll();
          }}
          onCancel={() => setShowCreatePanel(false)}
        />
      </SlideOver>

      {/* Edit Candidate Slide-over */}
      <SlideOver
        open={editingCandidate !== null}
        onClose={() => setEditingCandidate(null)}
        title="EDITAR CANDIDATO"
      >
        {editingCandidate && (
          <EditCandidateForm
            candidate={editingCandidate}
            onSuccess={() => {
              setEditingCandidate(null);
              fetchAll();
              refreshSession(); // Update sidebar campaign names immediately
            }}
            onCancel={() => setEditingCandidate(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
