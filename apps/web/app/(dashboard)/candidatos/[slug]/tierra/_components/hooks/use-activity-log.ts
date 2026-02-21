/* ========== Activity Log — build log entries from forms + stats ========== */

import { useCallback, useMemo, useState } from "react";
import type { FormRecord } from "@/lib/services";
import type { CampaignStats } from "@/lib/types";
import { formCoordsToLatLng } from "@/lib/utils";
import type { LogEntry } from "../types";

/**
 * Build activity log entries from recent forms and campaign stats events.
 * Returns sorted entries (newest first) and clear/click handlers.
 */
export function useActivityLog(
  forms: FormRecord[],
  stats: CampaignStats | undefined,
  onFlyToPoint: (lng: number, lat: number, zoom: number) => void,
) {
  const [logClearedAt, setLogClearedAt] = useState(0);

  const logEntries = useMemo((): LogEntry[] => {
    const entries: LogEntry[] = forms.slice(0, 50).map((f) => {
      const coords = formCoordsToLatLng(f.x, f.y, f.zona);
      return {
        id: `form-${f.id}`,
        type: "form_new" as const,
        agentName: f.encuestador || "Agente",
        message: `registro a ${f.nombre || "contacto"}`,
        timestamp: new Date(f.created_at),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
    });

    if (stats?.recent_events) {
      for (const ev of stats.recent_events) {
        entries.push({
          id: `ev-${ev.timestamp}-${ev.agent_id}`,
          type: ev.type,
          agentName: ev.agent_name,
          message: ev.message,
          timestamp: new Date(ev.timestamp),
          lat: null,
          lng: null,
        });
      }
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const filtered = logClearedAt > 0
      ? entries.filter((e) => e.timestamp.getTime() > logClearedAt)
      : entries;
    return filtered.slice(0, 60);
  }, [forms, stats, logClearedAt]);

  const handleClearLog = useCallback(() => {
    setLogClearedAt(Date.now());
  }, []);

  const handleLogEntryClick = useCallback((entry: LogEntry) => {
    if (entry.lat != null && entry.lng != null) {
      onFlyToPoint(entry.lng, entry.lat, 17);
    }
  }, [onFlyToPoint]);

  return { logEntries, handleClearLog, handleLogEntryClick };
}
