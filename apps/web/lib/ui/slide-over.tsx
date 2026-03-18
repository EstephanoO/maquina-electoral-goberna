"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
};

export function SlideOver({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
  className,
}: SlideOverProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-black/45 border-none cursor-default p-0"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative h-full max-w-[92vw] bg-surface shadow-xl flex flex-col animate-slide-in-right",
          className,
        )}
        style={{ width }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
          <h2 className="text-lg font-extrabold text-text-primary m-0 font-sans">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-8 flex items-center justify-center bg-transparent border-none cursor-pointer rounded-sm text-text-tertiary hover:text-text-primary transition-colors"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}
