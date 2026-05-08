"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Camera, Loader2, Trash2, Upload, User } from "lucide-react";

interface StepFotoUploadProps {
  title: string;
  subtitle?: string;
  ctaText?: string;
  /** Recibe data URL en base64 (image/jpeg comprimido) o null si saltó. */
  onNext: (dataUrl: string | null) => void;
}

const MAX_BYTES = 700_000; // ~700KB después de compresión
const TARGET_DIM = 720; // px lado mayor — suficiente para slide deck

export function StepFotoUpload({ title, subtitle, ctaText, onNext }: StepFotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Tiene que ser una imagen (.jpg, .png, .webp).");
      }
      if (file.size > 12 * 1024 * 1024) {
        throw new Error("Imagen demasiado pesada (>12MB).");
      }
      const dataUrl = await compressImage(file, TARGET_DIM, MAX_BYTES);
      setPreview(dataUrl);
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-xl text-center"
    >
      <h2 className="text-3xl sm:text-4xl text-white font-semibold tracking-tight">{title}</h2>
      {subtitle && <p className="mt-2 text-sm sm:text-base text-gray-400">{subtitle}</p>}

      {/* Preview area */}
      <div className="mt-8 mb-6 flex justify-center">
        <div className="relative">
          <div
            className={`size-44 sm:size-52 rounded-full overflow-hidden border-4 ${
              preview ? "border-amber-500/60" : "border-gray-700/50 border-dashed"
            } bg-gray-900/60 flex items-center justify-center`}
          >
            {busy ? (
              <Loader2 className="size-10 text-amber-400 animate-spin" />
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <User className="size-16 text-gray-600" />
            )}
          </div>

          {preview && !busy && (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="absolute -top-1 -right-1 size-9 rounded-full bg-red-500/90 hover:bg-red-500 text-white flex items-center justify-center shadow-lg"
              aria-label="Quitar foto"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {!preview && !busy && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-full border-2 border-amber-500/50 bg-amber-500/10 px-6 py-3 text-amber-300 font-semibold hover:bg-amber-500/20 transition-colors"
        >
          <Upload className="size-4" />
          Elegir foto
        </button>
      )}

      {preview && !busy && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200"
        >
          <Camera className="size-4" />
          Cambiar foto
        </button>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400">{error}</p>
      )}

      <p className="mt-3 text-xs text-gray-600">
        Va a aparecer en tu deck de análisis y en la plataforma.
      </p>

      {/* Acciones */}
      <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
        <button
          type="button"
          onClick={() => onNext(null)}
          className="px-6 py-3 rounded-full text-gray-400 hover:text-white text-sm"
        >
          Saltar por ahora
        </button>
        <button
          type="button"
          onClick={() => onNext(preview)}
          disabled={!preview || busy}
          className="inline-flex items-center justify-center gap-2 px-8 py-3 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold shadow-xl shadow-amber-500/30 hover:shadow-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {ctaText ?? "Usar esta foto"}
        </button>
      </div>
    </motion.div>
  );
}

/**
 * Comprime una imagen a un data URL JPEG dentro del límite de bytes dado.
 * Reduce primero por dimensión, luego ajusta calidad si sigue siendo demasiado pesada.
 */
async function compressImage(file: File, maxDim: number, maxBytes: number): Promise<string> {
  const img = await loadImage(file);
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pudimos procesar la imagen.");
  ctx.drawImage(img, 0, 0, w, h);

  let quality = 0.86;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxBytes && quality > 0.45) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > maxBytes) {
    throw new Error("La imagen sigue siendo muy pesada — probá con otra.");
  }
  return dataUrl;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No pudimos leer la imagen."));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("No pudimos leer el archivo."));
    reader.readAsDataURL(file);
  });
}
