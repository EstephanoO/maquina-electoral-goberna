import { Megaphone } from "lucide-react";
import { CampaignBuilder, CampaignList } from "../components/campaigns";

export default function CampaignsPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-amber-500" />
            Campañas de re-engagement
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Reactivá antiguos compradores · cross-sell a egresados · recontactá VIPs inactivos.
            Todo throttled vía el bot Kathy para no bannear el número.
          </p>
        </div>
      </header>

      <CampaignBuilder />

      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-3">Tus campañas</h2>
        <CampaignList />
      </section>
    </div>
  );
}
