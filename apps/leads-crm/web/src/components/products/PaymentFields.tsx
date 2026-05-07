import { Field, TextInput, TextArea } from "../forms/Field";
import type { ProductDraft } from "../../types/product";

type Props = { draft: ProductDraft; onChange: (patch: Partial<ProductDraft>) => void };

export function PaymentFields({ draft, onChange }: Props) {
  return (
    <>
      <Field label="Cuenta bancaria (texto multilinea)">
        <TextArea
          className="min-h-[120px] font-mono text-xs"
          value={draft.cuenta_bancaria ?? ""}
          onChange={(e) => onChange({ cuenta_bancaria: e.target.value })}
          placeholder="🏫 ESCUELA GOBERNA EIRL&#10;RUC: …&#10;BCP: …"
        />
      </Field>
      <Field label="Yape">
        <TextInput
          value={draft.yape_numero ?? ""}
          onChange={(e) => onChange({ yape_numero: e.target.value })}
          placeholder="944531711"
        />
      </Field>
    </>
  );
}
