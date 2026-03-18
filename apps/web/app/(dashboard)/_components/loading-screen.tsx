"use client";

import Image from "next/image";

export function LoadingScreen() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-background)",
        zIndex: 9999,
        gap: 20,
      }}
    >
      <Image
        src="/isotipo_2_-removebg-preview.png"
        alt="GOBERNA"
        width={56}
        height={56}
        style={{ borderRadius: "var(--radius-md)" }}
        priority
      />
      <div
        style={{
          width: 28,
          height: 28,
          border: "2.5px solid var(--goberna-blue-100)",
          borderTopColor: "var(--goberna-blue-800)",
          borderRadius: "50%",
          animation: "spin 0.75s linear infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 3,
          color: "var(--color-text-tertiary)",
        }}
      >
        GOBERNA
      </span>
    </div>
  );
}
