import { memo } from "react";
import type { ExtensionMonitorPhone } from "@/lib/services/cms";
import type { getMonitorTheme } from "./theme";
import { fmtRel } from "./monitor-helpers";

interface PhoneCardProps {
  phone: ExtensionMonitorPhone;
  slotName: string;
  maxSent: number;
  G: ReturnType<typeof getMonitorTheme>;
}

export const PhoneCard = memo(function PhoneCard({ phone, slotName, maxSent, G }: PhoneCardProps) {
  const active = phone.wa_sent > 0;
  const pct = maxSent > 0 ? (phone.wa_sent / maxSent) * 100 : 0;
  const topOp = [...phone.operators].sort((a, b) => b.wa_sent - a.wa_sent)[0];

  return (
    <div style={{
      padding: "18px", borderRadius: 18,
      background: G.surface,
      border: `1px solid ${active ? G.brandBlue : G.border}`,
      boxShadow: "0 12px 28px rgba(22,57,96,0.06)",
      transition: "border-color 0.3s ease, background-color 0.3s ease",
      minHeight: 220,
      height: "100%",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 11, fontWeight: 900, color: active ? G.brandBlue : G.textMid,
            letterSpacing: "0.3px",
          }}>
            {slotName}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: G.textDim }}>
          {fmtRel(phone.last_event_at)}
        </span>
      </div>

      {/* Sent count + bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: active ? G.brandBlue : G.textMid, lineHeight: 1 }}>
            {phone.wa_sent}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim, alignSelf: "flex-end" }}>
            {phone.unique_contacts} contactos
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 999, background: G.surfaceSoft, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 999,
            background: active ? G.brandBlue : "transparent",
            transition: "width 0.6s ease",
          }} />
        </div>
      </div>

      {/* Operators list */}
      {phone.operators.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1 }}>
          {phone.operators.sort((a, b) => b.wa_sent - a.wa_sent).map((op) => {
            const name = op.full_name.split(" ")[0] ?? op.email.split("@")[0];
            return (
              <div key={op.operator_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: G.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "45%" }}>
                  {name}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: G.brandBlue }}>
                    {op.wa_sent}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: G.sky }}>
                    {op.unique_phones} ct
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: G.textDim }}>{"\u2014"}</span>
        </div>
      )}

      {topOp && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${G.border}` }}>
          <span style={{ fontSize: 10, color: G.textDim }}>Top operador: </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: G.text }}>{topOp.full_name}</span>
        </div>
      )}
    </div>
  );
});
