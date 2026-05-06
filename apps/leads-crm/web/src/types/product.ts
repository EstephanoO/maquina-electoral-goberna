export type Product = {
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

  // Joined from ai_rules
  rule_name?: string | null;
  rule_pattern?: string | null;
  rule_tag?: string | null;
  rule_enabled?: boolean | null;
};

export type ProductDraft = Partial<Product>;

export const EMPTY_PRODUCT: ProductDraft = {
  nombre: "",
  descripcion: "",
  modalidad: "zoom",
  featured: true,
  enabled: true,
};
