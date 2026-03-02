"use client";

import { useState } from "react";
import { SCORING_TAGS, computeScore, classifyVote } from "@/lib/services/validacion";
import type { ValidationItem } from "@/lib/services/validacion";
import type { VisualColumn } from "./constants";

/** Map vote class to the correct visual column */
export function scoreToColumn(tags: string[]): VisualColumn {
    const score = computeScore(tags);
    const cls = classifyVote(score);
    if (cls === "duro") return "voto_duro";
    if (cls === "blando") return "voto_blando";
    return "respondido";
}

const CLASS_LABELS: Record<string, { label: string; color: string }> = {
    duro: { label: "VOTO DURO", color: "#15803d" },
    blando: { label: "VOTO BLANDO", color: "#ca8a04" },
    tibio: { label: "TIBIO", color: "#94a3b8" },
};

export function ClassifyModal({
    item,
    targetCol,
    onConfirm,
    onCancel,
}: {
    item: ValidationItem;
    targetCol: VisualColumn;
    /** Called with the chosen tags — caller decides the actual destination column */
    onConfirm: (tags: string[], resolvedCol: VisualColumn) => void;
    onCancel: () => void;
}) {
    const [localTags, setLocalTags] = useState<string[]>(item.tags ?? []);

    function toggle(key: string) {
        setLocalTags((prev) =>
            prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
        );
    }

    const score = computeScore(localTags);
    const cls = classifyVote(score);
    const resolved = scoreToColumn(localTags);
    const meta = CLASS_LABELS[cls];

    const targetLabel: Record<VisualColumn, string> = {
        pendiente: "Pendiente", contactado: "Contactado",
        respondido: "Respondido", voto_blando: "Voto Blando",
        voto_duro: "Voto Duro", invalido: "Inválido",
    };

    const movedTo = targetCol !== resolved ? targetLabel[resolved] : null;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
            onClick={onCancel}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div>
                    <p className="text-[9px] font-black text-slate-400 tracking-widest mb-0.5">CLASIFICAR RESPUESTA</p>
                    <p className="text-[13px] font-bold text-slate-800 truncate">{item.nombre || "Contacto"}</p>
                </div>

                {/* Tag pills */}
                <div className="flex flex-wrap gap-1.5">
                    {SCORING_TAGS.map((tag) => {
                        const active = localTags.includes(tag.key);
                        return (
                            <button
                                key={tag.key}
                                type="button"
                                onClick={() => toggle(tag.key)}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${active
                                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                        : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                                    }`}
                            >
                                {tag.label} <span className="font-black">+{tag.points}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Score + classification */}
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-400">Score:</span>
                    <span className="font-black text-slate-700">{score}</span>
                    <span
                        className="font-black ml-1 px-2 py-0.5 rounded-full text-[9px]"
                        style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                        {meta.label}
                    </span>
                </div>

                {/* Destination notice */}
                {movedTo && (
                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[10px] text-amber-700 font-semibold">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        Puntaje insuficiente — se moverá a <strong className="ml-0.5">{movedTo}</strong>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-1">
                    <button
                        type="button"
                        onClick={() => onConfirm(localTags, resolved)}
                        className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-[12px] font-bold hover:bg-emerald-600 transition-colors cursor-pointer border-none"
                    >
                        Confirmar
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-[12px] font-semibold hover:bg-slate-200 transition-colors cursor-pointer border-none"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}
