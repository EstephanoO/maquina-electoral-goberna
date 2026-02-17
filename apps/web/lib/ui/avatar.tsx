/**
 * GOBERNA — Avatar Component
 * Display user/candidate avatar with image or initials fallback.
 */

import type { CSSProperties } from "react";
import Image from "next/image";
import { getInitials } from "../utils";

type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: number;
  borderColor?: string;
  className?: string;
};

export function Avatar({
  name,
  imageUrl,
  size = 48,
  borderColor = "var(--goberna-blue-500)",
}: AvatarProps) {
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    overflow: "hidden",
    border: `2px solid ${borderColor}`,
    flexShrink: 0,
    background: "var(--goberna-blue-100)",
    position: "relative",
  };

  const initialsStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: size * 0.375,
    fontWeight: 800,
    color: borderColor,
  };

  return (
    <div style={containerStyle}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          style={{ objectFit: "cover" }}
          unoptimized
        />
      ) : (
        <div style={initialsStyle}>{getInitials(name, 1)}</div>
      )}
    </div>
  );
}
