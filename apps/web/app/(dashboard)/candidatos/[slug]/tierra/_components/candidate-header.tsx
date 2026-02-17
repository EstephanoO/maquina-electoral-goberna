"use client";

import Image from "next/image";

type CampaignInfo = {
  id: string;
  name: string;
  slug: string;
  cargo: string | null;
  numero: number | null;
  partido: string | null;
  foto_url: string | null;
};

type Props = {
  campaign: CampaignInfo;
  primaryColor: string;
  secondaryColor: string;
};

export function CandidateHeader({ campaign, primaryColor, secondaryColor }: Props) {
  const initials = campaign.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 24px",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      {/* Logo/Photo */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          backgroundColor: primaryColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
          border: `3px solid ${secondaryColor}`,
        }}
      >
        {campaign.foto_url ? (
          <Image
            src={campaign.foto_url}
            alt={campaign.name}
            width={56}
            height={56}
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
            unoptimized
          />
        ) : (
          <span style={{ color: "#ffffff", fontSize: 20, fontWeight: 700 }}>{initials}</span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#64748b",
            marginBottom: 2,
          }}
        >
          Candidatura
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{campaign.name}</div>
        <div style={{ fontSize: 13, color: "#64748b" }}>
          {campaign.cargo && <span>{campaign.cargo}</span>}
          {campaign.partido && (
            <>
              {campaign.cargo && <span style={{ margin: "0 6px" }}>·</span>}
              <span style={{ color: primaryColor, fontWeight: 600 }}>
                {campaign.partido}
                {campaign.numero && ` #${campaign.numero}`}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
