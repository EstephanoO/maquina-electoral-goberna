import { useMemo } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useExtractionCandidates, type ExtractionCandidate } from "../../../hooks/useExtractionCandidates";
import { ExtractionCandidateRow } from "../ExtractionCandidateRow";

const STATUS_OPTIONS: Array<{ key: ExtractionCandidate["status"] | "all"; label: string }> = [
  { key: "pending",  label: "Pendientes" },
  { key: "approved", label: "Aprobados" },
  { key: "applied",  label: "Aplicados" },
  { key: "rejected", label: "Rechazados" },
  { key: "all",      label: "Todos" },
];

const KIND_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "",              label: "Todo" },
  { key: "price",         label: "Precios" },
  { key: "bank_account",  label: "Cuentas" },
  { key: "yape",          label: "Yape" },
  { key: "whatsapp_link", label: "Links WA" },
  { key: "image_url",     label: "Imágenes" },
  { key: "product_name",  label: "Productos" },
  { key: "phone_other",   label: "Teléfonos" },
];

export function ExtractionTab() {
  const { items, loading, running, filters, setFilters, reload, approve, reject, runExtractor } =
    useExtractionCandidates({ status: "pending" });

  const stats = useMemo(() => ({
    total: items.length,
    high_conf: items.filter(c => c.confidence >= 0.66).length,
    by_kind: items.reduce<Record<string, number>>((acc, c) => {
      acc[c.kind] = (acc[c.kind] ?? 0) + 1;
      return acc;
    }, {}),
  }), [items]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Extracciones del histórico</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Datos extraídos de mensajes manuales del operador (precios, cuentas bancarias, Yape, links). Aprobá los que
            se vayan a aplicar al destino sugerido (instancia del bot, producto, template). Estado vive en
            <code className="text-[11px] bg-slate-100 px-1 mx-1 rounded">extraction_candidates</code> hasta que decidís.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void reload()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-md text-[13px] hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Recargar
          </button>
          <button
            onClick={() => void runExtractor()}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a3a6b] text-white rounded-md text-[13px] hover:bg-[#243d6b] disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Re-correr extractor
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-[13px]">
        <div className="flex items-center gap-1">
          <span className="text-slate-500 mr-1">Estado:</span>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setFilters(f => ({ ...f, status: s.key === "all" ? "" : s.key }))}
              className={`px-2 py-0.5 rounded text-[12px] ${
                (filters.status ?? "") === (s.key === "all" ? "" : s.key)
                  ? "bg-[#1a3a6b] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-500 mr-1">Tipo:</span>
          {KIND_OPTIONS.map(k => (
            <button
              key={k.key || "all"}
              onClick={() => setFilters(f => ({ ...f, kind: k.key || undefined }))}
              className={`px-2 py-0.5 rounded text-[12px] ${
                (filters.kind ?? "") === k.key
                  ? "bg-[#1a3a6b] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {!loading && items.length > 0 && (
        <div className="text-[12px] text-slate-500 mb-3">
          {stats.total} candidato{stats.total === 1 ? "" : "s"}
          {stats.high_conf > 0 && ` · ${stats.high_conf} con confianza alta`}
          {Object.keys(stats.by_kind).length > 0 && (
            <> · {Object.entries(stats.by_kind).map(([k, n]) => `${n} ${k}`).join(" · ")}</>
          )}
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-[13px] bg-white rounded-lg border border-slate-200">
          No hay candidatos con esos filtros. Tocá <strong>Re-correr extractor</strong> para escanear los outbounds más recientes.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2 text-left w-28">Tipo</th>
                <th className="px-3 py-2 text-left">Valor</th>
                <th className="px-3 py-2 text-right w-32">Veces · Conf</th>
                <th className="px-3 py-2 text-left w-56">Destino sugerido</th>
                <th className="px-3 py-2 w-48"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <ExtractionCandidateRow
                  key={c.id}
                  c={c}
                  onApprove={(cand, value) => approve(cand.id, { approved_value: value })}
                  onReject={(cand, reason) => reject(cand.id, reason)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
