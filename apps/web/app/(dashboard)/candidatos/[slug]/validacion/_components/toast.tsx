"use client";

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from "react";

/* ─── Types ─── */

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
    id: string;
    message: string;
    variant: ToastVariant;
}

interface ToastCtx {
    toast: (message: string, variant?: ToastVariant) => void;
}

/* ─── Context ─── */

const ToastContext = createContext<ToastCtx>({ toast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

/* ─── Individual toast ─── */

function Toast({ item, onDone }: { item: ToastItem; onDone: (id: string) => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Animate in
        const t1 = setTimeout(() => setVisible(true), 10);
        // Animate out then remove
        const t2 = setTimeout(() => setVisible(false), 2800);
        const t3 = setTimeout(() => onDone(item.id), 3100);
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }, [item.id, onDone]);

    const colors: Record<ToastVariant, string> = {
        success: "bg-emerald-600 border-emerald-500",
        error: "bg-red-600 border-red-500",
        info: "bg-slate-700 border-slate-600",
    };
    const icons: Record<ToastVariant, string> = {
        success: "✓",
        error: "✕",
        info: "ℹ",
    };

    return (
        <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-white text-[13px] font-medium shadow-xl transition-all duration-300 ${colors[item.variant]} ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
        >
            <span className="font-bold text-sm">{icons[item.variant]}</span>
            {item.message}
        </div>
    );
}

/* ─── Provider ─── */

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const toast = useCallback((message: string, variant: ToastVariant = "info") => {
        const id = Math.random().toString(36).slice(2);
        setToasts((prev) => [...prev, { id, message, variant }]);
    }, []);

    const remove = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map((item) => (
                    <Toast key={item.id} item={item} onDone={remove} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
