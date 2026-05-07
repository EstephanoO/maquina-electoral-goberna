import { Field, TextInput, TextArea, Select } from "../forms/Field";
import type { ProductDraft } from "../../types/product";

type Props = {
  draft: ProductDraft;
  onChange: (patch: Partial<ProductDraft>) => void;
};

export function ProductBasicFields({ draft, onChange }: Props) {
  const set = <K extends keyof ProductDraft>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [k]: e.target.value } as any);

  return (
    <>
      <Field label="Nombre">
        <TextInput value={draft.nombre ?? ""} onChange={set("nombre")} placeholder="Diploma Técnico en Gestión Parlamentaria" />
      </Field>

      <Field label="Descripción">
        <TextArea value={draft.descripcion ?? ""} onChange={set("descripcion")} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="SKU">
          <TextInput value={draft.sku ?? ""} onChange={set("sku")} placeholder="GEN5C2G1" />
        </Field>
        <Field label="Imagen URL">
          <TextInput value={draft.imagen_url ?? ""} onChange={set("imagen_url")} placeholder="https://…/flyer.jpg" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Precio S/">
          <TextInput type="number" step="0.01" value={draft.precio_soles ?? ""} onChange={set("precio_soles")} />
        </Field>
        <Field label="Precio USD">
          <TextInput type="number" step="0.01" value={draft.precio_dolares ?? ""} onChange={set("precio_dolares")} />
        </Field>
        <Field label="Modalidad">
          <Select value={draft.modalidad ?? "zoom"} onChange={set("modalidad")}>
            <option value="zoom">Zoom</option>
            <option value="presencial">Presencial</option>
            <option value="mixto">Mixto</option>
            <option value="autoestudio">Autoestudio</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha inicio">
          <TextInput type="date" value={draft.fecha_inicio?.slice(0, 10) ?? ""} onChange={(e) => onChange({ fecha_inicio: e.target.value || null })} />
        </Field>
        <Field label="Fecha fin">
          <TextInput type="date" value={draft.fecha_fin?.slice(0, 10) ?? ""} onChange={(e) => onChange({ fecha_fin: e.target.value || null })} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Días"><TextInput value={draft.dias_semana ?? ""} onChange={set("dias_semana")} placeholder="Martes y Jueves" /></Field>
        <Field label="Horario"><TextInput value={draft.horario ?? ""} onChange={set("horario")} placeholder="7:00 p.m. a 9:00 p.m." /></Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Horas académicas"><TextInput value={draft.horas_academicas ?? ""} onChange={set("horas_academicas")} placeholder="200 HORAS" /></Field>
        <Field label="Link matrícula"><TextInput value={draft.link_matricula ?? ""} onChange={set("link_matricula")} placeholder="https://escuela.goberna.club/..." /></Field>
      </div>
    </>
  );
}
