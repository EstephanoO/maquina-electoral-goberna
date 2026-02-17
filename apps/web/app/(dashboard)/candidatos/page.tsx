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
import { Tabs, SlideOver, Spinner, Button } from "../../../lib/ui";

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
  const { user } = useAuth();
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
      router.replace("/");
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
    <div style={{ fontFamily: FONT_STACK, animation: "goberna-fade-in .4s ease-out" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "var(--color-text-primary)",
                margin: "0 0 4px",
              }}
            >
              Candidatos & Solicitudes
            </h1>
            <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: 0 }}>
              Gestione candidatos y apruebe solicitudes de acceso de usuarios.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreatePanel(true)}>
            + Nuevo Candidato
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as "solicitudes" | "candidatos")}
      />

      {/* Loading */}
      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <Spinner size={28} />
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
        title="Nuevo Candidato"
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
        title="Editar Candidato"
      >
        {editingCandidate && (
          <EditCandidateForm
            candidate={editingCandidate}
            onSuccess={() => {
              setEditingCandidate(null);
              fetchAll();
            }}
            onCancel={() => setEditingCandidate(null)}
          />
        )}
      </SlideOver>
    </div>
  );
}
