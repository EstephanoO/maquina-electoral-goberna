"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getCampaign, patchCampaignConfig, patchCampaignWhatsappQrMessage } from "@/lib/services/campaigns";
import type { Campaign } from "@/lib/types";
import { WaPhonesSection } from "../../../settings/_components/wa-phones-section";

const FONT = "var(--font-montserrat), system-ui, sans-serif";

/* ═══════════════════════════════════════════════════════════════════
   GOBERNA — Per-candidate WhatsApp configuration (admin)
   /candidatos/[slug]/whatsapp
   - Header: read-only candidate identity (name, cargo, numero, partido, foto, colors)
   - WaPhonesSection: list/add/edit/delete WA numbers for THIS campaign
   - Channel URL: editable, persisted to campaigns.config.whatsapp_channel_url
   - Pairing status: placeholder until Fase 1 wires GET /api/cms/active-wa-phones
   ═══════════════════════════════════════════════════════════════════ */

export default function CandidatoWhatsAppPage() {
  const { user, campaigns: authCampaigns } = useAuth();
  const params = useParams();
  const slug = params.slug as string;

  const authCampaign = authCampaigns.find((c) => c.slug === slug);
  const campaignId = authCampaign?.id ?? null;
  const isAdmin = user?.role === "admin";
  // Candidato+ puede editar SOLO el mensaje del QR (endpoint dedicado).
  // Las otras secciones (número, canal URL, wa_phones, pairing) siguen
  // siendo admin-only.
  const canEditQrMessage = isAdmin || authCampaign?.role === "candidato";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    const res = await getCampaign(campaignId);
    setLoading(false);
    if (!res.ok) {
      setError(res.error?.message ?? "Error cargando campaña");
      return;
    }
    setCampaign(res.data?.campaign ?? null);
  }, [campaignId]);

  useEffect(() => { fetchCampaign(); }, [fetchCampaign]);

  if (!campaignId) {
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Campaña no encontrada para &ldquo;{slug}&rdquo;
      </div>
    );
  }

  if (!isAdmin && !canEditQrMessage) {
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Solo administradores pueden gestionar la configuración de WhatsApp.
      </div>
    );
  }

  if (loading && !campaign) {
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: "var(--color-text-tertiary)" }}>
        Cargando…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: FONT }}>
        <div style={{ background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", color: "var(--color-error)", padding: 16, borderRadius: 8 }}>
          {error}
        </div>
      </div>
    );
  }

  if (!campaign) return null;

  const initialChannelUrl = campaign.config?.whatsapp_channel_url ?? "";
  const initialQrNumber = campaign.config?.whatsapp_number ?? "";
  const initialQrMessage = campaign.config?.whatsapp_qr_message ?? "";

  return (
    <div style={{ padding: 24, fontFamily: FONT, maxWidth: 880 }}>
      <CandidateHeader campaign={campaign} />
      {isAdmin && (
        <QrNumberCard
          campaignId={campaign.id}
          initialNumber={initialQrNumber}
          onSaved={(updated) => setCampaign(updated)}
        />
      )}
      <QrMessageCard
        campaignId={campaign.id}
        initialMessage={initialQrMessage}
        candidateName={campaign.name}
        currentNumber={initialQrNumber}
        canSaveAsAdmin={isAdmin}
        onSaved={(updated) => setCampaign(updated)}
      />
      {isAdmin && (
        <>
          <ChannelUrlCard
            campaignId={campaign.id}
            initialUrl={initialChannelUrl}
            onSaved={(updated) => setCampaign(updated)}
          />
          <WaPhonesSection campaignId={campaign.id} />
          <PairingPlaceholderCard />
        </>
      )}
    </div>
  );
}

// Default actualizado al pedido de Zaida: mensaje en primera persona del
// referido. Si el campaign no tiene whatsapp_qr_message custom, se usa este.
// Tokens disponibles: {candidato} {brigadista}.
const DEFAULT_QR_MESSAGE =
  "Hola soy un referido de mi amigo {brigadista} y quiero apoyar tu campaña {candidato}";

function renderPreview(template: string, candidateName: string): string {
  const tpl = template.trim() || DEFAULT_QR_MESSAGE;
  return tpl
    .replaceAll("{candidato}", candidateName || "la campaña")
    .replaceAll("{brigadista}", "un brigadista");
}

/* ── Header ───────────────────────────────────────────────────────── */

function CandidateHeader({ campaign }: { campaign: Campaign }) {
  const primary = campaign.config?.color_primario ?? "#163960";
  const secondary = campaign.config?.color_secundario ?? "#fbbf24";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: 20, borderRadius: 12,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      marginBottom: 16,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
        background: "var(--color-surface-hover)", position: "relative",
      }}>
        {campaign.foto_url ? (
          <Image src={campaign.foto_url} alt={campaign.name} fill style={{ objectFit: "cover" }} sizes="64px" unoptimized />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", fontSize: 24, fontWeight: 700, color: "var(--color-text-tertiary)" }}>
            {campaign.name.charAt(0)}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>
          {campaign.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {campaign.cargo && <span><strong>Cargo:</strong> {campaign.cargo}</span>}
          {campaign.numero != null && <span><strong>N°:</strong> {campaign.numero}</span>}
          {campaign.partido && <span><strong>Partido:</strong> {campaign.partido}</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <ColorChip color={primary} label="Primario" />
        <ColorChip color={secondary} label="Secundario" />
      </div>
    </div>
  );
}

function ColorChip({ color, label }: { color: string; label: string }) {
  return (
    <div title={`${label}: ${color}`} style={{
      width: 28, height: 28, borderRadius: 6, background: color,
      border: "1px solid var(--color-border)",
    }} />
  );
}

/* ── QR target number editor ──────────────────────────────────────── */

function QrNumberCard({
  campaignId,
  initialNumber,
  onSaved,
}: {
  campaignId: string;
  initialNumber: string;
  onSaved: (updated: Campaign) => void;
}) {
  const [value, setValue] = useState(initialNumber);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setValue(initialNumber); setSavedAt(null); setError(null); }, [initialNumber, campaignId]);

  const normalize = (raw: string) => raw.replace(/\D/g, "");

  const handleSave = useCallback(async () => {
    const clean = normalize(value);
    if (clean.length < 9 || clean.length > 15) {
      setError("El número debe tener entre 9 y 15 dígitos (ej. 51923895098)");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await patchCampaignConfig(campaignId, { whatsapp_number: clean });
    setSaving(false);
    if (!res.ok) {
      setError(res.error?.message ?? "Error guardando");
      return;
    }
    if (res.data?.campaign) onSaved(res.data.campaign);
    setSavedAt(Date.now());
  }, [campaignId, value, onSaved]);

  const dirty = normalize(value) !== normalize(initialNumber);

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      marginBottom: 16,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
        Número WhatsApp del QR
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--color-text-secondary)" }}>
        Cuando un brigadista muestra el código QR (mobile app) y un ciudadano lo escanea,
        WhatsApp se abre apuntando a este número. Se puede cambiar en cualquier momento.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="51923895098"
          inputMode="numeric"
          style={{
            flex: 1, fontSize: 13, padding: "8px 12px", borderRadius: 6,
            border: "1.5px solid var(--color-border)",
            background: "var(--color-surface-hover)",
            color: "var(--color-text-primary)", outline: "none",
            fontFamily: FONT, letterSpacing: "0.02em",
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: dirty ? "var(--goberna-gold)" : "var(--color-surface-hover)",
            color: dirty ? "var(--goberna-blue-950)" : "var(--color-text-tertiary)",
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            cursor: dirty && !saving ? "pointer" : "default",
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 8, marginBottom: 0 }}>
        Formato: 9 a 15 dígitos sin <code>+</code>. Para Perú: <code>51</code> + 9 dígitos
        (ej. <code>51923895098</code>).
      </p>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-error)", marginTop: 8 }}>{error}</div>
      )}
      {savedAt && !dirty && !error && (
        <div style={{ fontSize: 12, color: "var(--color-success, #16a34a)", marginTop: 8 }}>
          Guardado ✓ — la app móvil tomará el número nuevo en su próximo refresh de campaña.
        </div>
      )}
    </div>
  );
}

/* ── QR message template editor ───────────────────────────────────── */

function QrMessageCard({
  campaignId,
  initialMessage,
  candidateName,
  currentNumber,
  canSaveAsAdmin,
  onSaved,
}: {
  campaignId: string;
  initialMessage: string;
  candidateName: string;
  currentNumber: string;
  // Admin tiene acceso al patch /config genérico; candidato usa el endpoint
  // dedicado /whatsapp-qr-message. La lógica de guardado se ramifica acá.
  canSaveAsAdmin: boolean;
  onSaved: (updated: Campaign) => void;
}) {
  const [value, setValue] = useState(initialMessage);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setValue(initialMessage); setSavedAt(null); setError(null); }, [initialMessage, campaignId]);

  const handleSave = useCallback(async () => {
    if (value.length > 800) {
      setError("Máximo 800 caracteres");
      return;
    }
    setSaving(true);
    setError(null);

    // Admin pega al endpoint genérico /config (devuelve campaign full).
    // Candidato pega al endpoint dedicado /whatsapp-qr-message (devuelve solo
    // el string actualizado), así no necesita rol admin.
    if (canSaveAsAdmin) {
      const res = await patchCampaignConfig(campaignId, { whatsapp_qr_message: value });
      setSaving(false);
      if (!res.ok) {
        setError(res.error?.message ?? "Error guardando");
        return;
      }
      if (res.data?.campaign) onSaved(res.data.campaign);
      setSavedAt(Date.now());
    } else {
      const res = await patchCampaignWhatsappQrMessage(campaignId, value);
      setSaving(false);
      if (!res.ok) {
        setError(res.error?.message ?? "Error guardando");
        return;
      }
      // No tenemos la campaña entera — actualizamos solo el state local.
      // El próximo refresh del page traerá la versión persistida.
      setSavedAt(Date.now());
    }
  }, [campaignId, value, canSaveAsAdmin, onSaved]);

  const handleTest = useCallback(() => {
    const num = currentNumber.replace(/\D/g, "");
    if (num.length < 9) {
      setError("Configurá un número primero para probar");
      return;
    }
    const preview = renderPreview(value, candidateName);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(preview)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [currentNumber, value, candidateName]);

  const dirty = value.trim() !== initialMessage.trim();
  const preview = renderPreview(value, candidateName);
  const charCount = value.length;
  const overLimit = charCount > 800;

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      marginBottom: 16,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
        Mensaje pre-armado del QR
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--color-text-secondary)" }}>
        Es el texto que se manda automáticamente cuando el ciudadano escanea el QR y se abre WhatsApp.
        Podés usar <code>{"{candidato}"}</code> y <code>{"{brigadista}"}</code> como placeholders —
        se reemplazan en el momento del scan.
      </p>

      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={DEFAULT_QR_MESSAGE}
        rows={3}
        style={{
          width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: 6,
          border: "1.5px solid var(--color-border)",
          background: "var(--color-surface-hover)",
          color: "var(--color-text-primary)", outline: "none",
          fontFamily: FONT, resize: "vertical",
          boxSizing: "border-box",
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: overLimit ? "var(--color-error)" : "var(--color-text-tertiary)", marginTop: 4 }}>
        <span>{charCount} / 800</span>
        <span>Si lo dejás vacío, se usa el mensaje por defecto.</span>
      </div>

      <div style={{
        marginTop: 12, padding: 10, borderRadius: 6,
        background: "var(--color-surface-hover)",
        border: "1px dashed var(--color-border)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-tertiary)", marginBottom: 4 }}>
          Vista previa
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-primary)", whiteSpace: "pre-wrap" }}>
          {preview}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || overLimit}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: dirty && !overLimit ? "var(--goberna-gold)" : "var(--color-surface-hover)",
            color: dirty && !overLimit ? "var(--goberna-blue-950)" : "var(--color-text-tertiary)",
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            cursor: dirty && !saving && !overLimit ? "pointer" : "default",
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          style={{
            padding: "8px 16px", borderRadius: 6,
            border: "1px solid var(--color-border)",
            background: "transparent",
            color: "var(--color-text-primary)",
            fontSize: 13, fontWeight: 600, fontFamily: FONT,
            cursor: "pointer",
          }}
          title="Abre wa.me con este mensaje y el número configurado, en una pestaña nueva"
        >
          Probar QR ↗
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-error)", marginTop: 8 }}>{error}</div>
      )}
      {savedAt && !dirty && !error && (
        <div style={{ fontSize: 12, color: "var(--color-success, #16a34a)", marginTop: 8 }}>
          Guardado ✓
        </div>
      )}
    </div>
  );
}

/* ── Channel URL editor ───────────────────────────────────────────── */

function ChannelUrlCard({
  campaignId,
  initialUrl,
  onSaved,
}: {
  campaignId: string;
  initialUrl: string;
  onSaved: (updated: Campaign) => void;
}) {
  const [value, setValue] = useState(initialUrl);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset local state when the campaign changes
  useEffect(() => { setValue(initialUrl); setSavedAt(null); setError(null); }, [initialUrl, campaignId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const res = await patchCampaignConfig(campaignId, { whatsapp_channel_url: value.trim() });
    setSaving(false);
    if (!res.ok) {
      setError(res.error?.message ?? "Error guardando");
      return;
    }
    if (res.data?.campaign) onSaved(res.data.campaign);
    setSavedAt(Date.now());
  }, [campaignId, value, onSaved]);

  const dirty = value.trim() !== initialUrl.trim();

  return (
    <div style={{
      padding: 20, borderRadius: 12,
      background: "var(--color-surface)", border: "1px solid var(--color-border)",
      marginBottom: 16,
    }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>
        Canal de WhatsApp
      </h3>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--color-text-secondary)" }}>
        URL pública del canal de difusión donde el candidato comparte updates. Se enlaza desde el CMS.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://whatsapp.com/channel/0029Vb..."
          style={{
            flex: 1, fontSize: 13, padding: "8px 12px", borderRadius: 6,
            border: "1.5px solid var(--color-border)",
            background: "var(--color-surface-hover)",
            color: "var(--color-text-primary)", outline: "none",
            fontFamily: FONT,
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: dirty ? "var(--goberna-gold)" : "var(--color-surface-hover)",
            color: dirty ? "var(--goberna-blue-950)" : "var(--color-text-tertiary)",
            fontSize: 13, fontWeight: 700, fontFamily: FONT,
            cursor: dirty && !saving ? "pointer" : "default",
          }}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12, color: "var(--color-error)", marginTop: 8 }}>{error}</div>
      )}
      {savedAt && !dirty && !error && (
        <div style={{ fontSize: 12, color: "var(--color-success, #16a34a)", marginTop: 8 }}>
          Guardado ✓
        </div>
      )}
    </div>
  );
}

/* ── Pairing placeholder ──────────────────────────────────────────── */

function PairingPlaceholderCard() {
  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: "var(--color-surface)", border: "1px dashed var(--color-border)",
      marginTop: 16, fontFamily: FONT,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>🟡</span>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)" }}>
          Pairing del bot Baileys
        </h3>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
        Pendiente de Fase 1: cuando el bot lea los números desde electoral
        (<code>GET /api/cms/active-wa-phones</code>), aquí se va a mostrar el estado de pairing por
        número (Conectado / Desconectado / Esperando QR) más el botón para emparejar.
      </p>
    </div>
  );
}
