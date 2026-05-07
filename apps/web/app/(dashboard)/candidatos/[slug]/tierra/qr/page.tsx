"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { api } from "@/lib/services";
import { useTheme } from "@/lib/theme-context";

const QrMap = dynamic(() => import("./qr-map"), { ssr: false });

type ScanRecord = {
  scanned_at: string;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
};

type TrackerData = {
  tracker: { scan_count: number; created_at: string };
  recent_scans: ScanRecord[];
};

export default function QrPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const { data, isLoading } = useQuery({
    queryKey: ["qr-tracker", "wa-channel", "full"],
    queryFn: async () => {
      const res = await api.get<TrackerData>("/api/qr-trackers/wa-channel/stats");
      if (!res.ok || !res.data) throw new Error("Failed");
      return res.data;
    },
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  const scanCount = data?.tracker?.scan_count ?? 0;

  const geoScans = useMemo(() => {
    if (!data?.recent_scans) return [];
    return data.recent_scans.filter((s) => s.lat != null && s.lon != null);
  }, [data?.recent_scans]);

  const todayScans = useMemo(() => {
    if (!data?.recent_scans) return 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    return data.recent_scans.filter((s) => s.scanned_at.slice(0, 10) === todayStr).length;
  }, [data?.recent_scans]);

  const locationGroups = useMemo(() => {
    if (!data?.recent_scans) return [];
    const counts = new Map<string, number>();
    for (const s of data.recent_scans) {
      const parts = [s.city, s.region, s.country].filter(Boolean);
      if (parts.length === 0) continue;
      const key = parts.join(", ");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  }, [data?.recent_scans]);

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${isDark ? "bg-[#090D15]" : "bg-slate-50"}`}>
      {/* Header */}
      <div className={`shrink-0 flex items-center justify-between px-4 h-14 ${isDark ? "bg-[#0f172a] border-b border-[#1d2f43]" : "bg-white border-b border-slate-200"}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#25D366" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden="true">
              <rect x="2" y="2" width="6" height="6" /><rect x="16" y="2" width="6" height="6" /><rect x="2" y="16" width="6" height="6" />
              <rect x="10" y="10" width="4" height="4" />
            </svg>
          </div>
          <h1 className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
            QR Tracker
          </h1>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold tabular-nums ${isDark ? "bg-[#1e293b] text-slate-100" : "bg-slate-100 text-slate-800"}`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {scanCount.toLocaleString("es-PE")} total
          </div>
          {todayScans > 0 && (
            <div className={`px-3 py-1.5 rounded-full text-[12px] font-bold tabular-nums ${isDark ? "bg-emerald-900/40 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>
              +{todayScans} hoy
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex">
        {/* Map */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-6 h-6 border-2 rounded-full animate-spin ${isDark ? "border-[#343b47] border-t-slate-200" : "border-slate-200 border-t-slate-600"}`} />
            </div>
          ) : (
            <QrMap scans={geoScans} isDark={isDark} />
          )}
        </div>

        {/* Sidebar */}
        <div className={`w-[280px] shrink-0 overflow-y-auto ${isDark ? "bg-[#0f172a] border-l border-[#1d2f43]" : "bg-white border-l border-slate-200"}`}>
          <div className="p-4">
            <h2 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              Ubicaciones
            </h2>
            {locationGroups.length === 0 ? (
              <p className={`text-[12px] ${isDark ? "text-slate-500" : "text-slate-400"}`}>Sin datos de ubicacion aun</p>
            ) : (
              <div className="flex flex-col gap-2">
                {locationGroups.map((g) => (
                  <div key={g.location} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg ${isDark ? "bg-[#1e293b]/50" : "bg-slate-50"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className={`text-[12px] truncate ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                        {g.location}
                      </span>
                    </div>
                    <span className={`text-[13px] font-black tabular-nums shrink-0 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                      {g.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent scans */}
          {geoScans.length > 0 && (
            <div className={`p-4 ${isDark ? "border-t border-[#1d2f43]" : "border-t border-slate-100"}`}>
              <h2 className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Ultimos escaneos
              </h2>
              <div className="flex flex-col gap-1.5">
                {geoScans.slice(0, 15).map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className={`text-[11px] truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {[s.city, s.region].filter(Boolean).join(", ") || "Desconocido"}
                    </span>
                    <span className={`text-[10px] tabular-nums shrink-0 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                      {new Date(s.scanned_at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
