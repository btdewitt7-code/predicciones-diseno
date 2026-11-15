/** Decodifica CSV de football-data.co.uk: UTF-8 con BOM en fixtures, windows-1252 en históricos. */
export function decodeCsv(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const decoder = new TextDecoder(hasUtf8Bom ? "utf-8" : "windows-1252");
  return decoder.decode(bytes).replace(/^\uFEFF/, "");
}

/** Parser CSV mínimo con soporte de comillas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** "15/08/2026" + "18:30" -> "2026-08-15T18:30:00" (hora local del archivo, sin zona). */
export function toKickoff(date: string, time?: string): string | null {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec((date ?? "").trim());
  if (!dateMatch) return null;

  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const rawYear = Number(dateMatch[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  let hour = 12;
  let minute = 0;
  const timeMatch = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

/** Temporada tipo "2627" a partir de la fecha. */
export function seasonOf(kickoff: string): string {
  const year = Number(kickoff.slice(0, 4));
  const month = Number(kickoff.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  const yy = String(startYear).slice(2);
  const next = String(startYear + 1).slice(2);
  return `${yy}${next}`;
}

export function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function toFloat(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
