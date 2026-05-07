import { Field, TextInput } from "../forms/Field";
import { ClassifierTester } from "./ClassifierTester";
import type { ProductDraft } from "../../types/product";

type Props = { draft: ProductDraft; onChange: (patch: Partial<ProductDraft>) => void };

export function ClassifierFields({ draft, onChange }: Props) {
  return (
    <div className="border-t pt-4 mt-4">
      <header className="flex items-center gap-2 mb-3">
        <span className="text-sm font-medium text-slate-700">🤖 Auto-clasificación</span>
        <span className="text-xs text-slate-400">— el bot etiqueta leads que matchean este regex</span>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Regex pattern">
          <TextInput
            className="font-mono text-xs"
            value={draft.classifier_pattern ?? ""}
            onChange={(e) => onChange({ classifier_pattern: e.target.value })}
            placeholder="(?i)gesti[oó]n\s*parlamentari"
          />
        </Field>
        <Field label="Tag a aplicar">
          <TextInput
            value={draft.classifier_tag ?? ""}
            onChange={(e) => onChange({ classifier_tag: e.target.value })}
            placeholder="interés:gestion-parlamentaria"
          />
        </Field>
      </div>

      <ClassifierTester pattern={draft.classifier_pattern} tag={draft.classifier_tag} />
    </div>
  );
}
