import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { PromptOverride } from "../types/training";

export type PromptForm = {
  extra_context: string;
  extra_categories: string;
  few_shot_json: string;
  enabled: boolean;
};

const EMPTY: PromptForm = { extra_context: "", extra_categories: "", few_shot_json: "[]", enabled: true };

export function usePromptOverride() {
  const [prompt, setPrompt] = useState<PromptOverride | null>(null);
  const [form, setForm] = useState<PromptForm>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await api.get<PromptOverride>("/ai/prompt");
      setPrompt(p);
      setForm({
        extra_context: p.extra_context ?? "",
        extra_categories: p.extra_categories ?? "",
        few_shot_json: JSON.stringify(p.few_shot_examples ?? [], null, 2),
        enabled: p.enabled,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    let fewShot;
    try {
      fewShot = JSON.parse(form.few_shot_json);
      if (!Array.isArray(fewShot)) throw new Error("debe ser un array");
    } catch (e: any) {
      throw new Error(`Few-shot JSON inválido: ${e.message}`);
    }
    await api.patch("/ai/prompt", {
      extra_context: form.extra_context,
      extra_categories: form.extra_categories,
      few_shot_examples: fewShot,
      enabled: form.enabled,
    });
    void load();
  }, [form, load]);

  return { prompt, form, setForm, loading, save };
}
