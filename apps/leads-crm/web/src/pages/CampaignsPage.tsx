import { Megaphone } from "lucide-react";
import { CampaignBuilder, CampaignList, RecommendationsCard } from "../components/campaigns";

export default function CampaignsPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
          <Megaphone className="w-6 h-6 text-amber-500" />
          Campañas · re-engagement p4
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Reactivá antiguos compradores · cross-sell a egresados · recontactá VIPs inactivos.
          Todo throttled vía Kathy +51944531711.
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-5">
        {/* Left: builder + list */}
        <div className="space-y-5">
          <CampaignBuilder />

          <section>
            <h2 className="text-sm font-bold text-slate-700 mb-3">Tus campañas</h2>
            <CampaignList />
          </section>
        </div>

        {/* Right: recommendations sidebar */}
        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <RecommendationsCard />
        </aside>
      </div>
    </div>
  );
}
