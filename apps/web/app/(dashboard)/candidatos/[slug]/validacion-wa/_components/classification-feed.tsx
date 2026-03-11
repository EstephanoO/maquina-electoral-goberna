/**
 * GOBERNA — Classification Feed (iOS style)
 * Real-time classification events feed — compact SF Pro aesthetic.
 */

"use client";

import { useState, useCallback } from "react";
import type { ClassificationEvent } from "@/lib/services/classification";

const SF = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";

const CAT: Record<string, { bg: string; fg: string; label: string }> = {
  saludo:          { bg: "rgba(0,122,255,.1)",  fg: "#007aff", label: "Saludo" },
  apoyo:           { bg: "rgba(52,199,89,.1)",  fg: "#34c759", label: "Apoyo" },
  rechazo:         { bg: "rgba(255,59,48,.1)",  fg: "#ff3b30", label: "Rechazo" },
  consulta:        { bg: "rgba(255,149,0,.1)",  fg: "#ff9500", label: "Consulta" },
  spam:            { bg: "rgba(175,82,222,.1)", fg: "#af52de", label: "Spam" },
  no_contesta:     { bg: "rgba(142,142,147,.1)",fg: "#8e8e93", label: "No contesta" },
  numero_invalido: { bg: "rgba(255,59,48,.1)",  fg: "#ff3b30", label: "Invalido" },
  otro:            { bg: "rgba(142,142,147,.1)",fg: "#8e8e93", label: "Otro" },
};

const VOTE: Record<string, { bg: string; fg: string }> = {
  duro:      { bg: "#34c759", fg: "#fff" },
  blando:    { bg: "#007aff", fg: "#fff" },
  flotante:  { bg: "#af52de", fg: "#fff" },
  imposible: { bg: "#ff3b30", fg: "#fff" },
};

type CorrectState = { eventId: string; currentVote: string; currentStatus: string } | null;

type Props = {
  events: ClassificationEvent[];
  connected: boolean;
  onCorrect: (eventId: string, voteClass: string, status: string) => void;
};

export function ClassificationFeed({ events, connected, onCorrect }: Props) {
  const [correctState, setCorrectState] = useState<CorrectState>(null);
  const [selectedVote, setSelectedVote] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const openCorrect = useCallback((ev: ClassificationEvent) => {
    setCorrectState({ eventId: ev.id, currentVote: ev.vote_class, currentStatus: ev.status });
    setSelectedVote(ev.corrected_vote_class ?? ev.vote_class);
    setSelectedStatus(ev.corrected_status ?? ev.status);
  }, []);

  const confirmCorrect = useCallback(() => {
    if (!correctState) return;
    onCorrect(correctState.eventId, selectedVote, selectedStatus);
    setCorrectState(null);
  }, [correctState, selectedVote, selectedStatus, onCorrect]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: SF }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "0.5px solid rgba(60,60,67,.12)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "rgba(249,249,249,.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#34c759" : "#ff3b30", boxShadow: connected ? "0 0 6px rgba(52,199,89,.4)" : "none" }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e", letterSpacing: "-0.3px" }}>En vivo</span>
        <span style={{ fontSize: 12, color: "#8e8e93", marginLeft: "auto" }}>{events.length}</span>
      </div>

      {/* Events */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
        {events.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#c7c7cc", fontSize: 13 }}>
            Esperando clasificaciones...
          </div>
        )}
        {events.map((ev) => (
          <EventRow key={ev.id} event={ev} onCorrect={openCorrect} />
        ))}
      </div>

      {/* iOS-style correction sheet */}
      {correctState && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.32)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#f2f2f7", borderRadius: "16px 16px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 400, boxShadow: "0 -4px 40px rgba(0,0,0,.15)", fontFamily: SF }} role="dialog" aria-label="Corregir clasificacion">
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "#c7c7cc", margin: "0 auto 16px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1c1c1e", textAlign: "center", marginBottom: 20, letterSpacing: "-0.4px" }}>Corregir</h3>

            <label htmlFor="ios-vote" style={{ fontSize: 12, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4, paddingLeft: 4 }}>Clase de voto</label>
            <select id="ios-vote" value={selectedVote} onChange={(e) => setSelectedVote(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", background: "#fff", fontSize: 15, color: "#1c1c1e", marginBottom: 14, appearance: "none", WebkitAppearance: "none" }}>
              <option value="duro">Duro</option>
              <option value="blando">Blando</option>
              <option value="flotante">Flotante</option>
              <option value="imposible">Imposible</option>
            </select>

            <label htmlFor="ios-status" style={{ fontSize: 12, fontWeight: 600, color: "#8e8e93", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 4, paddingLeft: 4 }}>Estado</label>
            <select id="ios-status" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "none", background: "#fff", fontSize: 15, color: "#1c1c1e", marginBottom: 20, appearance: "none", WebkitAppearance: "none" }}>
              <option value="respondido">Respondido</option>
              <option value="contactado">Contactado</option>
              <option value="invalido">Invalido</option>
            </select>

            <button type="button" onClick={confirmCorrect} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "#007aff", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 8, letterSpacing: "-0.2px" }}>Guardar</button>
            <button type="button" onClick={() => setCorrectState(null)} style={{ width: "100%", padding: "14px", borderRadius: 12, border: "none", background: "transparent", color: "#007aff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event: ev, onCorrect }: { event: ClassificationEvent; onCorrect: (ev: ClassificationEvent) => void }) {
  const cat = CAT[ev.category] ?? CAT.otro;
  const vc = VOTE[ev.corrected_vote_class ?? ev.vote_class];
  const ts = new Date(ev.created_at);
  const time = `${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`;
  const isCorrected = !!ev.corrected_vote_class;

  return (
    <div style={{ padding: "9px 14px", borderBottom: "0.5px solid rgba(60,60,67,.08)", background: isCorrected ? "rgba(255,204,0,.06)" : "transparent" }}>
      {/* Name + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1c1c1e", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
          {ev.contact_name ?? ev.nombre ?? ev.phone ?? "?"}
        </span>
        <span style={{ fontSize: 10, color: "#c7c7cc", fontFeatureSettings: '"tnum"' }}>{time}</span>
      </div>

      {/* Message */}
      {ev.message_text && (
        <div style={{ fontSize: 12, color: "#8e8e93", marginBottom: 5, lineHeight: 1.35, maxHeight: 34, overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.1px" }}>
          {ev.message_text.slice(0, 100)}{ev.message_text.length > 100 ? "..." : ""}
        </div>
      )}

      {/* Pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: cat.bg, color: cat.fg, textTransform: "uppercase", letterSpacing: "0.3px" }}>{cat.label}</span>
        {vc && <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: vc.bg, color: vc.fg, textTransform: "uppercase", letterSpacing: "0.3px" }}>{ev.corrected_vote_class ?? ev.vote_class}</span>}
        <span style={{ fontSize: 10, color: "#c7c7cc" }}>{(ev.confidence * 100).toFixed(0)}%</span>
        {isCorrected && <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: "rgba(255,204,0,.15)", color: "#ff9500" }}>CORREGIDO</span>}
        <button type="button" onClick={() => onCorrect(ev)} style={{ marginLeft: "auto", fontSize: 10, color: "#007aff", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}>
          Corregir
        </button>
      </div>
    </div>
  );
}
