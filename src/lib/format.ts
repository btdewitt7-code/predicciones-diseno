import { APP_TIME_ZONE } from "./time";

function parseKickoff(kickoff: string): Date {
  const raw = String(kickoff ?? "").trim();
  if (!raw) return new Date();

  // Los horarios vienen sin zona (se asume UTC). Si ya traen zona, se respeta.
  const value = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatKickoff(kickoff: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: APP_TIME_ZONE,
    ...options,
  }).format(parseKickoff(kickoff));
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function timeOf(kickoff: string): string {
  return formatKickoff(kickoff, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

export function dayLabel(kickoff: string): string {
  return formatKickoff(kickoff, { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fullDate(kickoff: string): string {
  return formatKickoff(kickoff, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de día (YYYY-MM-DD) en la zona de la app, para agrupar partidos. */
export function dayKey(kickoff: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parseKickoff(kickoff));
}

/** Partes de un día para la tira de fechas (estilo BeSoccer). */
export function dayParts(kickoff: string): { weekday: string; day: string; month: string } {
  const date = parseKickoff(kickoff);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("es-PE", { timeZone: APP_TIME_ZONE, ...options })
      .format(date)
      .replace(/\./g, "");
  return {
    weekday: format({ weekday: "short" }),
    day: format({ day: "numeric" }),
    month: format({ month: "short" }),
  };
}

/** Clave del día actual (YYYY-MM-DD) en la zona de la app. */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function dateShort(kickoff: string): string {
  return formatKickoff(kickoff, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** Para marcas de tiempo completas (ISO con zona). */
export function dateTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: APP_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function implied(odds: number | null | undefined): number | null {
  if (!odds || odds <= 1) return null;
  return 1 / odds;
}

export function margin(home: number | null, draw: number | null, away: number | null): number | null {
  if (!home || !draw || !away) return null;
  const sum = 1 / home + 1 / draw + 1 / away;
  return sum;
}

export function fairProbabilities(
  home: number | null,
  draw: number | null,
  away: number | null,
): [number, number, number] | null {
  const overround = margin(home, draw, away);
  if (!home || !draw || !away || !overround) return null;
  return [1 / home / overround, 1 / draw / overround, 1 / away / overround];
}
