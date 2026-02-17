/**
 * GOBERNA — useFileUpload Hook
 * Handle file selection with validation and preview.
 */

import { useState, useCallback, useRef, type ChangeEvent } from "react";
import { UPLOAD_CONFIG } from "../constants";

type UseFileUploadOptions = {
  maxSizeBytes?: number;
  allowedTypes?: readonly string[];
  onError?: (error: string) => void;
};

type UseFileUploadReturn = {
  file: File | null;
  preview: string | null;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  openFilePicker: () => void;
  clear: () => void;
};

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const {
    maxSizeBytes = UPLOAD_CONFIG.maxSizeBytes,
    allowedTypes = UPLOAD_CONFIG.allowedTypes,
    onError,
  } = options;

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      // Validate type
      if (!allowedTypes.includes(selectedFile.type)) {
        const err = `Tipo no permitido. Use: ${allowedTypes.join(", ")}`;
        setError(err);
        onError?.(err);
        return;
      }

      // Validate size
      if (selectedFile.size > maxSizeBytes) {
        const err = `Archivo muy grande. Máximo ${maxSizeBytes / 1024 / 1024}MB`;
        setError(err);
        onError?.(err);
        return;
      }

      setFile(selectedFile);
      setError(null);

      // Create preview for images
      if (selectedFile.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      }
    },
    [allowedTypes, maxSizeBytes, onError],
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const clear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  return {
    file,
    preview,
    error,
    inputRef,
    handleSelect,
    openFilePicker,
    clear,
  };
}
