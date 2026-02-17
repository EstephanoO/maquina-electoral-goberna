/**
 * GOBERNA — PhotoUpload Component
 * Circular photo upload with preview.
 */

"use client";

import type { CSSProperties, ChangeEvent } from "react";
import Image from "next/image";
import { useRef, useState } from "react";
import { UPLOAD_CONFIG, FONT_STACK } from "../constants";
import { formatBytes } from "../utils";

type PhotoUploadProps = {
  value: File | null;
  preview: string | null;
  onChange: (file: File | null, preview: string | null) => void;
  onError?: (error: string) => void;
  size?: number;
  fallbackInitial?: string;
  fallbackColor?: string;
};

export function PhotoUpload({
  value,
  preview,
  onChange,
  onError,
  size = 120,
  fallbackInitial,
  fallbackColor = "var(--goberna-blue-600)",
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate
    if (!UPLOAD_CONFIG.allowedTypes.includes(file.type as typeof UPLOAD_CONFIG.allowedTypes[number])) {
      onError?.("Tipo no permitido. Use JPG, PNG o WebP.");
      return;
    }
    if (file.size > UPLOAD_CONFIG.maxSizeBytes) {
      onError?.(`Archivo muy grande. Máximo ${UPLOAD_CONFIG.maxSizeMB}MB.`);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      onChange(file, reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: preview ? "none" : "2px dashed var(--color-border-strong)",
    background: "var(--goberna-blue-50)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontFamily: FONT_STACK,
    color: "var(--color-text-tertiary)",
    fontSize: 11,
    gap: 4,
    padding: 0,
    overflow: "hidden",
    position: "relative",
  };

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: hover ? 1 : 0,
    transition: "opacity 0.2s ease",
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_CONFIG.allowedTypes.join(",")}
        onChange={handleSelect}
        style={{ display: "none" }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={containerStyle}
      >
        {preview ? (
          <>
            <Image src={preview} alt="Preview" fill style={{ objectFit: "cover" }} unoptimized />
            <div style={overlayStyle}>
              <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>Cambiar</span>
            </div>
          </>
        ) : fallbackInitial ? (
          <span style={{ fontSize: size * 0.3, fontWeight: 800, color: fallbackColor }}>
            {fallbackInitial.toUpperCase()}
          </span>
        ) : (
          <>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Subir foto</title>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Click para subir</span>
          </>
        )}
      </button>
      {value && (
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6 }}>
          {value.name} ({formatBytes(value.size)})
        </p>
      )}
    </div>
  );
}
