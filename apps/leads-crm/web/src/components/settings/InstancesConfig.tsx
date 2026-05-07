import { useState } from "react";
import { Smartphone, Plus } from "lucide-react";
import { useBotInstances } from "../../hooks/useConfig";
import { useToast } from "../../toast";
import { InstanceCard } from "./InstanceCard";
import { InstanceEditor } from "./InstanceEditor";
import { CopyConfigDialog } from "./CopyConfigDialog";
import type { BotInstance } from "../../types/config";

export function InstancesConfig() {
  const toast = useToast();
  const { instances, loading, update, create, copyFrom } = useBotInstances();
  const [editing, setEditing] = useState<BotInstance | null>(null);
  const [copying, setCopying] = useState<BotInstance | null>(null);

  if (loading) return <div className="p-6 text-center text-slate-400">Cargando…</div>;

  async function addNew() {
    const slug = prompt("Slug del nuevo instance (ej: p5):");
    if (!slug) return;
    const display_name = prompt("Display name:", `Instancia ${slug}`);
    if (!display_name) return;
    try { await create({ slug, display_name, agent_name: "Goberna" }); toast("Instancia creada", "ok"); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-600" />
            Instancias del bot ({instances.length})
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configuración por celular. Cada instancia puede tener su propio agente, productos,
            cuenta bancaria, prompt y reglas. Usá <strong>Copiar</strong> para clonar la
            configuración entre instancias.
          </p>
        </div>
        <button
          onClick={addNew}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded"
        >
          <Plus size={14} /> Nueva instancia
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {instances.map(inst => (
          <InstanceCard
            key={inst.id}
            instance={inst}
            onEdit={() => setEditing(inst)}
            onCopyTo={() => setCopying(inst)}
          />
        ))}
      </div>

      <InstanceEditor instance={editing} onClose={() => setEditing(null)} onSave={update} />
      <CopyConfigDialog
        source={copying}
        candidates={instances}
        onClose={() => setCopying(null)}
        onCopy={copyFrom}
      />
    </div>
  );
}
