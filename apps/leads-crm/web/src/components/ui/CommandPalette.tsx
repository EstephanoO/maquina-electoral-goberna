import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, MessageCircle, Users, LayoutDashboard, FileBarChart,
  Brain, Package, Settings, AlertCircle, Crown, ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Action = {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
  group: "Navegación" | "Acciones" | "Buscar";
  keywords?: string[];
};

type Props = { open: boolean; onClose: () => void };

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const actions: Action[] = useMemo(() => [
    { id: "nav-chat",      group: "Navegación", icon: MessageCircle,   label: "Ir a Chat",            hint: "G C", keywords: ["chats","mensajes","whatsapp"], run: () => navigate("/chat") },
    { id: "nav-leads",     group: "Navegación", icon: Users,           label: "Ir a Leads",           hint: "G L", run: () => navigate("/leads") },
    { id: "nav-dash",      group: "Navegación", icon: LayoutDashboard, label: "Ir a Dashboard",       hint: "G D", run: () => navigate("/dashboard") },
    { id: "nav-reports",   group: "Navegación", icon: FileBarChart,    label: "Ir a Reportes",        hint: "G R", run: () => navigate("/reports") },
    { id: "nav-training",  group: "Navegación", icon: Brain,           label: "Ir a Entrenamiento IA", hint: "G T", keywords: ["reglas","prompt","sandbox","ia"], run: () => navigate("/training") },
    { id: "nav-products",  group: "Navegación", icon: Package,         label: "Ir a Productos",       hint: "G P", keywords: ["cursos","diplomas"], run: () => navigate("/products") },
    { id: "nav-settings",  group: "Navegación", icon: Settings,        label: "Ir a Configuración",   hint: "G S", keywords: ["embudo","instancias","bancos","stage"], run: () => navigate("/settings") },

    { id: "act-attention",   group: "Acciones",   icon: AlertCircle,   label: "Ver atención humana pendiente",  keywords: ["pendiente","ayuda","alerta"], run: () => navigate("/chat") },
    { id: "act-vip",         group: "Acciones",   icon: Crown,         label: "Ver clientes VIP",                keywords: ["mejores","top","compradores"], run: () => navigate("/leads") },
  ], [navigate]);

  // Filter
  const filtered = useMemo(() => {
    if (!q.trim()) return actions;
    const term = q.toLowerCase();
    return actions.filter(a =>
      a.label.toLowerCase().includes(term) ||
      (a.keywords ?? []).some(k => k.toLowerCase().includes(term))
    );
  }, [actions, q]);

  // Group
  const grouped = useMemo(() => {
    const m = new Map<string, Action[]>();
    for (const a of filtered) {
      if (!m.has(a.group)) m.set(a.group, []);
      m.get(a.group)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  // Reset on open
  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(filtered.length - 1, i + 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(0, i - 1)); return; }
      if (e.key === "Enter")     {
        e.preventDefault();
        const a = filtered[active];
        if (a) { a.run(); onClose(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="cmdk-overlay" onClick={onClose} />
      <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Escribe un comando o navega…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
          />
          <kbd>esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {grouped.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">Sin resultados</div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {group}
                </div>
                {items.map((a) => {
                  const idx = filtered.indexOf(a);
                  const isActive = idx === active;
                  return (
                    <button
                      key={a.id}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => { a.run(); onClose(); }}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition ${
                        isActive ? "bg-slate-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <a.icon className={`w-4 h-4 ${isActive ? "text-[#1B365D]" : "text-slate-400"}`} />
                      <span className="flex-1 text-left">{a.label}</span>
                      {a.hint && <kbd className="text-[10px]">{a.hint}</kbd>}
                      {isActive && <ArrowRight className="w-3 h-3 text-slate-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
            <span className="flex items-center gap-1"><kbd>↵</kbd> abrir</span>
          </div>
          <span>Goberna CRM</span>
        </div>
      </div>
    </>
  );
}

/** Hook que escucha Cmd+K / Ctrl+K y devuelve open/close. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, close: () => setOpen(false) };
}
