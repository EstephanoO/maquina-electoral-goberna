"use client";

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";

/* ── Types ── */

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastCtx {
  toast: (message: string, variant?: ToastVariant) => void;
}

/* ── Context ── */

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

/* ── Individual toast ── */

const VARIANT_STYLES: Record<ToastVariant, { bg: string; icon: string; iconColor: string }> = {
  success: { bg: "bg-emerald-600", icon: "\u2713", iconColor: "text-emerald-200" },
  error: { bg: "bg-red-600", icon: "\u2715", iconColor: "text-red-200" },
  info: { bg: "bg-slate-700", icon: "\u2139", iconColor: "text-slate-300" },
};

function Toast({ item, onDone }: { item: ToastItem; onDone: (id: string) => void }) {
  const [phase, setPhase] = useState<"enter" | "visible" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("visible"), 20);
    const t2 = setTimeout(() => setPhase("exit"), 2600);
    const t3 = setTimeout(() => onDone(item.id), 2900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [item.id, onDone]);

  const s = VARIANT_STYLES[item.variant];
  const isVisible = phase === "visible";

  return (
    <div
      className={`
        flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-white text-[13px] font-medium
        transition-all duration-300 ease-out
        ${s.bg}
        ${isVisible
          ? "opacity-100 translate-y-0 translate-x-0 scale-100"
          : phase === "enter"
            ? "opacity-0 translate-y-3 scale-95"
            : "opacity-0 -translate-y-1 scale-95"
        }
      `}
      style={{
        boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.1)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span className={`font-bold text-sm ${s.iconColor}`}>{s.icon}</span>
      {item.message}
    </div>
  );
}

/* ── Provider ── */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-2), { id, message, variant }]); // max 3 toasts
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onDone={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
