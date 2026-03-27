"use client";

import { memo, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme-context";
import { api } from "@/lib/services/api";

type Props = {
  campaignId: string;
  primaryColor: string;
  currentUrl?: string;
  onSaved: (url: string) => void;
};

/**
 * Inline config for setting the WhatsApp channel URL on a campaign.
 * Shows as a banner when URL is not set, or a small edit button when it is.
 */
export const QRChannelConfig = memo(function QRChannelConfig({
  campaignId,
  primaryColor,
  currentUrl,
  onSaved,
}: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(currentUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Ingresa una URL valida");
      return;
    }
    if (!trimmed.startsWith("https://")) {
      setError("La URL debe empezar con https://");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // First fetch current config to merge
      const getRes = await api.get<{ campaign: { config: Record<string, unknown> } }>(`/api/campaigns/${campaignId}`);
      const existingConfig = (getRes.ok && getRes.data?.campaign?.config) ? getRes.data.campaign.config : {};

      const newConfig = { ...existingConfig, whatsapp_channel_url: trimmed };

      const res = await api.put(`/api/campaigns/${campaignId}`, { config: newConfig });

      if (res.ok) {
        onSaved(trimmed);
        setEditing(false);
      } else {
        setError(res.error?.message ?? "Error guardando");
      }
    } catch {
      setError("Error de conexion");
    } finally {
      setSaving(false);
    }
  }, [url, campaignId, onSaved]);

  // If URL exists and not editing, show small edit button
  if (currentUrl && !editing) {
    return (
      <button
        type="button"
        onClick={() => { setUrl(currentUrl); setEditing(true); }}
        className={`text-[10px] font-medium px-2 py-1 rounded-md border-none cursor-pointer transition-colors ${
          isDark ? "text-slate-500 hover:text-slate-300 bg-transparent" : "text-slate-400 hover:text-slate-600 bg-transparent"
        }`}
        title="Editar link de canal WhatsApp"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline mr-1">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        Editar canal WA
      </button>
    );
  }

  // No URL set → prompt banner / or editing mode
  return (
    <div className={`mx-4 my-3 p-3 rounded-xl border ${
      isDark ? "bg-[#0f172a] border-[#2a303b]" : "bg-slate-50 border-slate-200"
    }`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${primaryColor}20` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-semibold mb-1.5 ${isDark ? "text-slate-200" : "text-slate-700"}`}>
            {currentUrl ? "Editar canal de WhatsApp" : "Configura el canal de WhatsApp"}
          </p>
          <p className={`text-[11px] mb-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            {currentUrl
              ? "Actualiza el link del canal para el QR de tus entrevistadores."
              : "Agrega el link de tu canal de WhatsApp para habilitar el QR que tus entrevistadores pueden mostrar en campo."
            }
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(""); }}
              placeholder="https://whatsapp.com/channel/..."
              className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-[12px] border outline-none transition-colors ${
                isDark
                  ? "bg-[#1e293b] border-[#334155] text-slate-200 placeholder:text-slate-500 focus:border-slate-400"
                  : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-slate-400"
              }`}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg border-none cursor-pointer text-white text-[12px] font-semibold shrink-0 transition-opacity disabled:opacity-50"
              style={{ background: primaryColor }}
            >
              {saving ? "..." : "Guardar"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className={`px-3 py-2 rounded-lg border cursor-pointer text-[12px] font-medium shrink-0 ${
                  isDark ? "border-slate-600 bg-[#1e293b] text-slate-300" : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                Cancelar
              </button>
            )}
          </div>
          {error && <p className="text-[11px] text-red-500 mt-1.5">{error}</p>}
        </div>
      </div>
    </div>
  );
});
