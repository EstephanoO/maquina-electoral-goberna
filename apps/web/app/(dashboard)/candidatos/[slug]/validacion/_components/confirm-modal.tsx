"use client";

import type { ReactNode } from "react";

export function ConfirmModal({
    open,
    title,
    description,
    confirmLabel = "Confirmar",
    confirmClass = "bg-red-600 hover:bg-red-700 text-white",
    onConfirm,
    onCancel,
}: {
    open: boolean;
    title: string;
    description?: ReactNode;
    confirmLabel?: string;
    confirmClass?: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
            style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                <div>
                    <h2 id="modal-title" className="text-[15px] font-bold text-slate-800">{title}</h2>
                    {description && <p className="text-[13px] text-slate-500 mt-1">{description}</p>}
                </div>
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-[13px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors border-none cursor-pointer"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors border-none cursor-pointer ${confirmClass}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
