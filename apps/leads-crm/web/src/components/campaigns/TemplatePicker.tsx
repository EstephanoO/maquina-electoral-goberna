import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Image as ImageIcon, FileVideo, Check } from "lucide-react";
import { api } from "../../api";
import { Field, TextInput } from "../forms/Field";

type Template = {
  id: number;
  name: string;
  body: string;
  category: string | null;
  uses_count: number;
  image_url: string | null;
  document_url: string | null;
  video_url: string | null;
  media_kind: string | null;
};

type Props = {
  selectedId: number | null;
  onChange: (id: number | null, tpl: Template | null) => void;
};

export function TemplatePicker({ selectedId, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const q = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<Template[]>("/templates"),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (q.data ?? []).forEach(t => { if (t.category) set.add(t.category); });
    return ["all", ...Array.from(set).sort()];
  }, [q.data]);

  const filtered = useMemo(() => {
    let list = q.data ?? [];
    if (category !== "all") list = list.filter(t => t.category === category);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(term) || t.body.toLowerCase().includes(term));
    }
    return list.sort((a, b) => b.uses_count - a.uses_count);
  }, [q.data, category, search]);

  const selectedTpl = (q.data ?? []).find(t => t.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar template…"
            className="pl-8"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-field max-w-[160px]"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === "all" ? "Todas categorías" : c}</option>
          ))}
        </select>
      </div>

      {selectedTpl && (
        <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-blue-700" />
              <span className="text-sm font-bold text-blue-900">Seleccionado: {selectedTpl.name}</span>
            </div>
            <button onClick={() => onChange(null, null)} className="text-xs text-slate-500 hover:text-red-600">Quitar</button>
          </div>
          <pre className="text-[11px] text-slate-700 whitespace-pre-wrap line-clamp-4 font-sans">{selectedTpl.body}</pre>
          <MediaIndicator t={selectedTpl} />
        </div>
      )}

      <div className="max-h-[260px] overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2">
        {q.isLoading ? (
          <div className="text-xs text-slate-400 text-center py-4">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">Sin resultados</div>
        ) : (
          filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onChange(t.id, t)}
              className={`w-full text-left p-2 rounded transition ${
                t.id === selectedId
                  ? "bg-blue-100 ring-1 ring-blue-400"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-semibold text-slate-800 truncate">{t.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {t.category && <span className="badge bg-slate-100 text-slate-600">{t.category}</span>}
                  <MediaBadge t={t} />
                  <span className="text-[10px] text-slate-400 tabular-nums">{t.uses_count}× uso</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">{t.body.slice(0, 140)}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function MediaBadge({ t }: { t: Template }) {
  if (t.image_url)    return <span className="badge bg-blue-100 text-blue-700 gap-0.5"><ImageIcon size={9} /></span>;
  if (t.document_url) return <span className="badge bg-rose-100 text-rose-700 gap-0.5"><FileText size={9} /></span>;
  if (t.video_url)    return <span className="badge bg-violet-100 text-violet-700 gap-0.5"><FileVideo size={9} /></span>;
  return null;
}

function MediaIndicator({ t }: { t: Template }) {
  if (t.image_url) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-blue-700">
        <ImageIcon size={12} /> Incluye imagen: {t.image_url.slice(-30)}
      </div>
    );
  }
  if (t.document_url) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-rose-700">
        <FileText size={12} /> Incluye PDF: {t.document_url.slice(-30)}
      </div>
    );
  }
  if (t.video_url) {
    return (
      <div className="mt-2 flex items-center gap-2 text-[11px] text-violet-700">
        <FileVideo size={12} /> Incluye video
      </div>
    );
  }
  return null;
}
