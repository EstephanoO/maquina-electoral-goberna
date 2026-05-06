import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Product, ProductDraft } from "../types/product";

export type ProductFilter = "featured" | "all";

export function useProducts(filter: ProductFilter) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = filter === "featured" ? "/products?featured=1" : "/products";
      const data = await api.get<{ products: Product[] }>(path);
      setProducts(data.products);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback((draft: ProductDraft) =>
    api.post<Product>("/products", draft).then(reload), [reload]);

  const update = useCallback((id: number, draft: ProductDraft) =>
    api.patch<Product>(`/products/${id}`, draft).then(reload), [reload]);

  const remove = useCallback((id: number) =>
    api.del<void>(`/products/${id}`).then(reload), [reload]);

  return { products, loading, error, reload, create, update, remove };
}

/** Validate regex without throwing — returns null if valid, error msg if not. */
export function validateRegex(pattern: string | null | undefined): string | null {
  if (!pattern) return null;
  try { new RegExp(pattern, "i"); return null; }
  catch (e: any) { return e.message; }
}
