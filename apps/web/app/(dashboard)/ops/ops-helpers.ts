export function sanitizeApiBase(rawValue: string): string {
  const value = rawValue.trim();
  if (!value || value === "undefined" || value === "null") {
    return "";
  }

  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      return "";
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function statusClassSum(record: Record<string, number> | undefined, classPrefix: "2" | "4" | "5"): number {
  if (!record) return 0;
  let total = 0;
  for (const [status, count] of Object.entries(record)) {
    if (status.startsWith(classPrefix)) total += count;
  }
  return total;
}

export function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function clampDelta(next: number, prev: number): number {
  const delta = next - prev;
  return delta > 0 ? delta : 0;
}
