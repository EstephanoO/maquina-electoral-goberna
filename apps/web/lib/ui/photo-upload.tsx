"use client";

import type { ChangeEvent } from "react";
import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { UPLOAD_CONFIG } from "../constants";
import { formatBytes } from "../utils";

type PhotoUploadProps = {
  value: File | null;
  preview: string | null;
  onChange: (file: File | null, preview: string | null) => void;
  onError?: (error: string) => void;
  size?: number;
  fallbackInitial?: string;
  fallbackColor?: string;
  className?: string;
};

export function PhotoUpload({
  value,
  preview,
  onChange,
  onError,
  size = 120,
  fallbackInitial,
  fallbackColor = "var(--goberna-blue-600)",
  className,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!UPLOAD_CONFIG.allowedTypes.includes(file.type as typeof UPLOAD_CONFIG.allowedTypes[number])) {
      onError?.("Tipo no permitido. Use JPG, PNG o WebP.");
      return;
    }
    if (file.size > UPLOAD_CONFIG.maxSizeBytes) {
      onError?.(`Archivo muy grande. Maximo ${UPLOAD_CONFIG.maxSizeMB}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => onChange(file, reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_CONFIG.allowedTypes.join(",")}
        onChange={handleSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cn(
          "rounded-full overflow-hidden relative flex flex-col items-center justify-center cursor-pointer font-sans text-text-tertiary text-[11px] gap-1 p-0",
          !preview && "border-2 border-dashed border-border-strong bg-goberna-blue-50",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {preview ? (
          <>
            <Image src={preview} alt="Preview" fill className="object-cover" unoptimized />
            <div
              className="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity"
              style={{ opacity: hover ? 1 : 0 }}
            >
              <span className="text-white text-xs font-semibold">Cambiar</span>
            </div>
          </>
        ) : fallbackInitial ? (
          <span className="font-extrabold" style={{ fontSize: size * 0.3, color: fallbackColor }}>
            {fallbackInitial.toUpperCase()}
          </span>
        ) : (
          <>
            <ImagePlus className="size-6" />
            <span>Click para subir</span>
          </>
        )}
      </button>
      {value && (
        <p className="text-[11px] text-text-tertiary mt-1.5 m-0">
          {value.name} ({formatBytes(value.size)})
        </p>
      )}
    </div>
  );
}
