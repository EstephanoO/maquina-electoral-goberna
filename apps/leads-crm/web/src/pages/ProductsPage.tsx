import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { useProducts, type ProductFilter } from "../hooks/useProducts";
import { ProductCard, ProductFormModal, ProductFilterTabs } from "../components/products";
import { EMPTY_PRODUCT, type Product, type ProductDraft } from "../types/product";
import { useToast } from "../toast";

export default function ProductsPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<ProductFilter>("featured");
  const { products, loading, create, update, remove } = useProducts(filter);
  const [editing, setEditing] = useState<ProductDraft | null>(null);

  const featuredCount = products.filter(p => p.featured).length;

  async function handleSave(draft: ProductDraft) {
    return draft.id ? update(draft.id, draft) : create(draft);
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Deshabilitar "${p.nombre}"?`)) return;
    try { await remove(p.id); toast("Producto deshabilitado", "ok"); }
    catch (e: any) { toast(`Error: ${e.message}`, "err"); }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
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
          onClick={() => setEditing({ ...EMPTY_PRODUCT })}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={18} /> Nuevo
        </button>
      </header>

      <ProductFilterTabs value={filter} onChange={setFilter} featuredCount={featuredCount} />

      {loading ? (
        <div className="text-slate-400 p-8 text-center">Cargando…</div>
      ) : products.length === 0 ? (
        <div className="text-slate-400 p-8 text-center border-2 border-dashed rounded-lg">
          No hay productos. Crear el primero.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(p => (
            <ProductCard key={p.id} p={p} onEdit={(prod) => setEditing(prod)} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <ProductFormModal draft={editing} onClose={() => setEditing(null)} onSave={handleSave} />
    </div>
  );
}
