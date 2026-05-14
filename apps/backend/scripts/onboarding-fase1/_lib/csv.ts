/**
 * CSV parser mínimo compartido para los scripts de ingest.
 * Soporta quoted fields + escaped quotes (""), líneas multi-row.
 */
export function parseCSV(text: string): Array<Record<string, string>> {
  const lines: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuote && text[i + 1] === '"') { buf += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === "\n" && !inQuote) {
      lines.push(buf);
      buf = "";
    } else if (c !== "\r" || inQuote) {
      buf += c;
    }
  }
  if (buf.length > 0) lines.push(buf);

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.map((s) => s.trim());
  };

  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]!).map((h) => h.toLowerCase().trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]!.trim()) continue;
    const cells = parseLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (cells[j] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

export function parseInt0(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,_\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isInteger(n) ? n : null;
}

export function parseMoney(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,_\s]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) { args[key] = next; i++; }
      else args[key] = true;
    }
  }
  return args;
}

/**
 * Normaliza nombres de distritos/provincias para match case+tilde-insensitive.
 * 'CARABAYLLO' / 'Carabayllo' / 'Carabaýllo' → 'carabayllo'.
 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
