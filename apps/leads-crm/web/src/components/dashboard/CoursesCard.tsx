import { Package } from "lucide-react";
import { ConfigCard } from "../cards/ConfigCard";
import { ProductRow } from "./ProductRow";
import type { ProductSummary } from "../../hooks/useDashboardData";
import { gotoView } from "../../hooks/useGoto";

type Props = { products: ProductSummary[]; productRulesCount: number };

export function CoursesCard({ products, productRulesCount }: Props) {
  return (
    <ConfigCard
      icon={Package}
      iconColor="text-blue-600 bg-blue-50"
      title="Cursos activos"
      subtitle={`${products.length} en el flyer · ${productRulesCount} con auto-tag`}
      ctaLabel="Editar productos"
      onCtaClick={() => gotoView("products")}
      empty={products.length === 0 ? "Sin productos configurados" : null}
    >
      <div className="space-y-2">
        {products.slice(0, 6).map(p => <ProductRow key={p.id} p={p} />)}
      </div>
    </ConfigCard>
  );
}
