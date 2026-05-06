import { useMemo } from "react";
import { Eye } from "lucide-react";
import { usePreviewSegment } from "../../hooks/useCampaigns";
import { personalize } from "../../lib/campaign-personalize";
import { Avatar } from "../ui";

type Props = {
  filter: any | null;
  body: string;
};

export function PersonalizationPreview({ filter, body }: Props) {
  const { data } = usePreviewSegment(filter);

  const samples = useMemo(() => {
    if (!data?.sample) return [];
    return data.sample.slice(0, 3).map(s => ({
      lead: s,
      rendered: personalize(body, {
        name: s.name,
        phone: s.phone,
        country: s.country,
        last_course: s.last_course,
        n_purchases: 0,
        buyer_tier: s.buyer_tier,
      }),
    }));
  }, [data, body]);

  if (!filter) return null;
  if (samples.length === 0) {
    return (
      <div className="text-xs text-slate-400 italic text-center py-3">
        Preview personalizado disponible al elegir segmento + escribir mensaje
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
        <Eye className="w-3 h-3" /> Preview personalizado · 3 leads del segmento
      </div>
      {samples.map((s, i) => (
        <article key={i} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <header className="bg-slate-50 border-b border-slate-100 px-2.5 py-1.5 flex items-center gap-2">
            <Avatar name={s.lead.name || s.lead.phone} size="xs" />
            <span className="text-xs font-semibold text-slate-700 truncate flex-1">
              {s.lead.name || s.lead.phone}
            </span>
            {s.lead.country && <span className="text-[10px] text-slate-500">{s.lead.country}</span>}
          </header>
          <pre className="px-3 py-2 text-[11px] text-slate-700 whitespace-pre-wrap font-sans line-clamp-6">
            {s.rendered}
          </pre>
        </article>
      ))}
    </div>
  );
}
