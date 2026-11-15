/** Zona horaria con la que se muestran los partidos en la web. */
export const APP_TIME_ZONE = process.env.APP_TIMEZONE ?? "America/Lima";

/** Diferencia (ms) entre una zona y UTC en un instante dado. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asUtc - date.getTime();
}

/** "2026-10-31T20:00:00" en una zona -> "2026-10-31T20:00:00" en UTC. */
export function zonedToUtc(local: string, timeZone: string): string {
  const [datePart, timePart = "00:00:00"] = local.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const naive = Date.UTC(year, month - 1, day, hour || 0, minute || 0);
  let utc = naive;
  for (let i = 0; i < 2; i += 1) {
    utc = naive - tzOffsetMs(new Date(utc), timeZone);
  }

  return new Date(utc).toISOString().slice(0, 19);
}

/** La fuente europea publica hora de Londres. */
export function londonToUtc(local: string): string {
  return zonedToUtc(local, "Europe/London");
}
