import { useEffect, useState } from "react";
import { Package, Plus, Edit2, Trash2, Star, Calendar, Clock, DollarSign, Link2, Save, X, AlertCircle, Eye, EyeOff } from "lucide-react";
import { api } from "../api";
import { useToast } from "../toast";

type Product = {
  id: number;
  sku: string | null;
  nombre: string;
  descripcion: string;
  imagen_url: string | null;
  precio_soles: string | null;
  precio_dolares: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_semana: string | null;
  horario: string | null;
  horas_academicas: string | null;
  modalidad: string;
  link_matricula: string | null;
  cuenta_bancaria: string | null;
  yape_numero: string | null;
  classifier_pattern: string | null;
  classifier_tag: string | null;
  ai_rule_id: number | null;
  featured: boolean;
  enabled: boolean;
  rule_name?: string | null;
  rule_pattern?: string | null;
  rule_tag?: string | null;
  rule_enabled?: boolean | null;
};

const EMPTY: Partial<Product> = {
  nombre: "",
  descripcion: "",
  modalidad: "zoom",
  featured: true,
  enabled: true,
};

export default function ProductsPage() {
  const toast = useToast(); // toast is a function: (msg, kind?) => void
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"featured" | "all">("featured");
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<{ matched: boolean; tag?: string } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ products: Product[] }>(
        filter === "featured" ? "/products?featured=1" : "/products"
      );
      setProducts(data.products);
    } catch (e: any) {
      toast(`No pude cargar productos: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  async function save() {
    if (!editing) return;
    if (!editing.nombre?.trim()) {
      toast("Nombre obligatorio", "err");
      return;
    }
    if (editing.classifier_pattern) {
      try { new RegExp(editing.classifier_pattern, "i"); }
      catch (e: any) { toast(`Regex inválido: ${e.message}`, "err"); return; }
    }
    setSaving(true);
    try {
      if (editing.id) {
        await api.patch(`/products/${editing.id}`, editing);
        toast("Producto actualizado", "ok");
      } else {
        await api.post("/products", editing);
        toast("Producto creado", "ok");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: Product) {
    if (!confirm(`Deshabilitar "${p.nombre}"?`)) return;
    try {
      await api.del(`/products/${p.id}`);
      toast("Producto deshabilitado", "ok");
      await load();
    } catch (e: any) {
      toast(`Error: ${e.message}`, "err");
    }
  }

  async function testPattern() {
    if (!editing?.classifier_pattern || !testText.trim()) return;
    try {
      const re = new RegExp(editing.classifier_pattern, "i");
      const matched = re.test(testText);
      setTestResult({ matched, tag: editing.classifier_tag ?? undefined });
    } catch (e: any) {
      toast(`Regex roto: ${e.message}`, "err");
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Package className="text-blue-600" size={28} />
            Productos / Cursos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catálogo del flyer activo. Cada producto puede tener una regla de auto-clasificación
            que el bot usa para etiquetar leads automáticamente.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} /> Nuevo
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("featured")}
          className={`px-3 py-1.5 rounded-md text-sm ${filter === "featured" ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Destacados ({products.filter(p => p.featured).length})
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-md text-sm ${filter === "all" ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
        >
          Todos
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 p-8 text-center">Cargando…</div>
      ) : products.length === 0 ? (
        <div className="text-slate-400 p-8 text-center border-2 border-dashed rounded-lg">
          No hay productos. Crear el primero.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => (
            <div
              key={p.id}
              className={`border rounded-lg p-4 bg-white relative ${!p.enabled ? "opacity-50" : ""} ${p.featured ? "border-blue-200" : "border-slate-200"}`}
            >
              {p.featured && (
                <div className="absolute top-2 right-2 text-yellow-500" title="Destacado">
                  <Star size={16} fill="currentColor" />
                </div>
              )}

              <div className="flex items-start gap-3 mb-3">
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt="" className="w-16 h-16 rounded object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 font-bold">
                    {p.nombre.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 leading-tight">{p.nombre}</div>
                  {p.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{p.sku}</div>}
                </div>
              </div>

              {p.descripcion && (
                <div className="text-xs text-slate-600 mb-3 line-clamp-2">{p.descripcion}</div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                {p.precio_soles && (
                  <div className="flex items-center gap-1 text-slate-700">
                    <DollarSign size={12} className="text-green-600" />
                    S/ {p.precio_soles}
                  </div>
                )}
                {p.precio_dolares && (
                  <div className="flex items-center gap-1 text-slate-700">
                    <DollarSign size={12} className="text-green-600" />
                    $ {p.precio_dolares}
                  </div>
                )}
                {p.fecha_inicio && (
                  <div className="flex items-center gap-1 text-slate-700 col-span-2">
                    <Calendar size={12} className="text-blue-500" />
                    {new Date(p.fecha_inicio).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
                    {p.dias_semana && <span className="text-slate-500"> · {p.dias_semana}</span>}
                  </div>
                )}
                {p.horario && (
                  <div className="flex items-center gap-1 text-slate-700 col-span-2 truncate">
                    <Clock size={12} className="text-purple-500" />
                    {p.horario}
                  </div>
                )}
                {p.horas_academicas && (
                  <div className="text-slate-500">{p.horas_academicas}</div>
                )}
                <div className="text-slate-500 capitalize">{p.modalidad}</div>
              </div>

              {p.rule_pattern && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3 text-[11px]">
                  <div className="font-medium text-amber-800 flex items-center gap-1">
                    🤖 Auto-clasifica → <span className="font-mono bg-white px-1 rounded">{p.rule_tag}</span>
                  </div>
                  <div className="font-mono text-amber-700 mt-1 truncate">/{p.rule_pattern}/i</div>
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setEditing({ ...p })}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded"
                >
                  <Edit2 size={12} /> Editar
                </button>
                {p.enabled ? (
                  <button
                    onClick={() => remove(p)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={12} /> Deshabilitar
                  </button>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400">
                    <EyeOff size={12} /> Deshabilitado
                  </span>
                )}
                {p.link_matricula && (
                  <a
                    href={p.link_matricula}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded ml-auto"
                  >
                    <Link2 size={12} /> Matrícula
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-lg font-semibold">
                {editing.id ? `Editar: ${editing.nombre}` : "Nuevo producto"}
              </h2>
              <button
                onClick={() => { setEditing(null); setTestText(""); setTestResult(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <Field label="Nombre">
                <input
                  className="input"
                  value={editing.nombre ?? ""}
                  onChange={(e) => setEditing({ ...editing, nombre: e.target.value })}
                  placeholder="Diploma Técnico en Gestión Parlamentaria"
                />
              </Field>

              <Field label="Descripción">
                <textarea
                  className="input min-h-[60px]"
                  value={editing.descripcion ?? ""}
                  onChange={(e) => setEditing({ ...editing, descripcion: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="SKU">
                  <input
                    className="input"
                    value={editing.sku ?? ""}
                    onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                    placeholder="GEN5C2G1"
                  />
                </Field>
                <Field label="Imagen URL">
                  <input
                    className="input"
                    value={editing.imagen_url ?? ""}
                    onChange={(e) => setEditing({ ...editing, imagen_url: e.target.value })}
                    placeholder="https://…/flyer.jpg"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Precio S/">
                  <input
                    className="input"
                    type="number" step="0.01"
                    value={editing.precio_soles ?? ""}
                    onChange={(e) => setEditing({ ...editing, precio_soles: e.target.value })}
                  />
                </Field>
                <Field label="Precio USD">
                  <input
                    className="input"
                    type="number" step="0.01"
                    value={editing.precio_dolares ?? ""}
                    onChange={(e) => setEditing({ ...editing, precio_dolares: e.target.value })}
                  />
                </Field>
                <Field label="Modalidad">
                  <select
                    className="input"
                    value={editing.modalidad ?? "zoom"}
                    onChange={(e) => setEditing({ ...editing, modalidad: e.target.value })}
                  >
                    <option value="zoom">Zoom</option>
                    <option value="presencial">Presencial</option>
                    <option value="mixto">Mixto</option>
                    <option value="autoestudio">Autoestudio</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha inicio">
                  <input
                    className="input"
                    type="date"
                    value={editing.fecha_inicio?.slice(0, 10) ?? ""}
                    onChange={(e) => setEditing({ ...editing, fecha_inicio: e.target.value || null })}
                  />
                </Field>
                <Field label="Fecha fin">
                  <input
                    className="input"
                    type="date"
                    value={editing.fecha_fin?.slice(0, 10) ?? ""}
                    onChange={(e) => setEditing({ ...editing, fecha_fin: e.target.value || null })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Días">
                  <input
                    className="input"
                    value={editing.dias_semana ?? ""}
                    onChange={(e) => setEditing({ ...editing, dias_semana: e.target.value })}
                    placeholder="Martes y Jueves"
                  />
                </Field>
                <Field label="Horario">
                  <input
                    className="input"
                    value={editing.horario ?? ""}
                    onChange={(e) => setEditing({ ...editing, horario: e.target.value })}
                    placeholder="7:00 p.m. a 9:00 p.m. (hora Perú)"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Horas académicas">
                  <input
                    className="input"
                    value={editing.horas_academicas ?? ""}
                    onChange={(e) => setEditing({ ...editing, horas_academicas: e.target.value })}
                    placeholder="200 HORAS"
                  />
                </Field>
                <Field label="Link matrícula">
                  <input
                    className="input"
                    value={editing.link_matricula ?? ""}
                    onChange={(e) => setEditing({ ...editing, link_matricula: e.target.value })}
                    placeholder="https://escuela.goberna.club/matricula/..."
                  />
                </Field>
              </div>

              <Field label="Cuenta bancaria (texto multilinea)">
                <textarea
                  className="input min-h-[120px] font-mono text-xs"
                  value={editing.cuenta_bancaria ?? ""}
                  onChange={(e) => setEditing({ ...editing, cuenta_bancaria: e.target.value })}
                  placeholder="🏫 ESCUELA GOBERNA EIRL&#10;RUC: …&#10;BCP: …"
                />
              </Field>

              <Field label="Yape">
                <input
                  className="input"
                  value={editing.yape_numero ?? ""}
                  onChange={(e) => setEditing({ ...editing, yape_numero: e.target.value })}
                  placeholder="944531711"
                />
              </Field>

              <div className="border-t pt-4 mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-slate-700">🤖 Auto-clasificación</span>
                  <span className="text-xs text-slate-400">— el bot etiqueta leads que matchean este regex</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Regex pattern">
                    <input
                      className="input font-mono text-xs"
                      value={editing.classifier_pattern ?? ""}
                      onChange={(e) => setEditing({ ...editing, classifier_pattern: e.target.value })}
                      placeholder="(?i)gesti[oó]n\\s*parlamentari"
                    />
                  </Field>
                  <Field label="Tag a aplicar">
                    <input
                      className="input"
                      value={editing.classifier_tag ?? ""}
                      onChange={(e) => setEditing({ ...editing, classifier_tag: e.target.value })}
                      placeholder="interés:gestion-parlamentaria"
                    />
                  </Field>
                </div>

                {editing.classifier_pattern && (
                  <div className="mt-3 bg-slate-50 rounded p-3">
                    <div className="text-xs font-medium text-slate-600 mb-2">Probar contra mensaje:</div>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 text-xs"
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="Hola, quisiera info del Diploma de Gestión Parlamentaria"
                      />
                      <button
                        onClick={testPattern}
                        className="px-3 py-1 bg-slate-700 text-white rounded text-xs hover:bg-slate-800"
                      >
                        Probar
                      </button>
                    </div>
                    {testResult && (
                      <div className={`mt-2 text-xs flex items-center gap-2 ${testResult.matched ? "text-green-700" : "text-red-700"}`}>
                        {testResult.matched ? "✓ Match — aplicaría" : "✗ No match"}
                        {testResult.matched && testResult.tag && (
                          <span className="font-mono bg-white px-2 py-0.5 rounded border">{testResult.tag}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.featured ?? false}
                    onChange={(e) => setEditing({ ...editing, featured: e.target.checked })}
                  />
                  <Star size={14} /> Destacado (flyer activo)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.enabled ?? true}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
                  />
                  <Eye size={14} /> Habilitado
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-end gap-2">
              <button
                onClick={() => { setEditing(null); setTestText(""); setTestResult(null); }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !editing.nombre?.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Save size={16} /> {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: #2a4f8a;
          box-shadow: 0 0 0 3px rgba(42,79,138,0.1);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
