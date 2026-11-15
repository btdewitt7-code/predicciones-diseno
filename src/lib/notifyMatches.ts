import { ensureSchema, getDb, getMeta, setMeta } from "./db";
import { COLORS, sendEmbeds } from "./notify";
import { LEAGUE_BY_CODE } from "./leagues";
import { APP_TIME_ZONE, zonedToUtc } from "./time";
import { dayKey, dayLabel, pct, timeOf, todayKey } from "./format";
import { getFirstHalfWatchlist } from "./queries";
import { getHtVetoedSet, isHtVetoed } from "./veto";

const STARTUP_KIND = "first-half-startup";
const PRE_WINDOWS = [
  { kind: "first-half-pre30", label: "faltan 30 min", maxMinutes: 30, minMinutes: 10 },
  { kind: "first-half-pre10", label: "faltan 10 min", maxMinutes: 10, minMinutes: 0 },
];

function threshold(): number {
  const raw = Number(process.env.FIRST_HALF_THRESHOLD);
  if (Number.isFinite(raw) && raw > 0.5 && raw <= 0.95) return raw;
  return 0.7;
}

type NotifyMatch = {
  id: number;
  league_code: string;
  kickoff: string;
  home_team: string;
  away_team: string;
  ht_over05: number;
};

async function matchesBetween(fromIso: string, toIso: string): Promise<NotifyMatch[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT m.id, m.league_code, m.kickoff, m.home_team, m.away_team, p.ht_over05
          FROM matches m JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'scheduled' AND m.kickoff BETWEEN ? AND ?
            AND p.ht_over05 >= ?
          ORDER BY m.kickoff`,
    args: [fromIso, toIso, threshold()],
  });
  return res.rows.map((row) => ({
    id: Number(row.id),
    league_code: String(row.league_code),
    kickoff: String(row.kickoff),
    home_team: String(row.home_team),
    away_team: String(row.away_team),
    ht_over05: Number(row.ht_over05),
  }));
}

async function sentIds(kind: string): Promise<Set<number>> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT match_id FROM notifications_sent WHERE kind = ?`,
    args: [kind],
  });
  return new Set(res.rows.map((row) => Number(row.match_id)));
}

async function sendOneByOne(
  matches: NotifyMatch[],
  kind: string,
  label?: string,
): Promise<number> {
  if (matches.length === 0) return 0;
  const db = getDb();
  const already = await sentIds(kind);
  const skipObserved = process.env.OBSERVATION_SKIP_NOTIFY !== "0";
  const observedTeams = skipObserved
    ? new Set(
        (await getFirstHalfWatchlist()).flatMap((row) => row.alerts.map((alert) => alert.team)),
      )
    : new Set<string>();
  const htVetoed = skipObserved ? await getHtVetoedSet() : new Set<string>();
  let sent = 0;

  for (const match of matches) {
    if (already.has(match.id)) continue;
    // Equipos en observación: no se avisan por 1T (son justo los de racha floja).
    if (observedTeams.has(match.home_team) || observedTeams.has(match.away_team)) continue;
    if (
      skipObserved &&
      (isHtVetoed(htVetoed, match.league_code, match.home_team) ||
        isHtVetoed(htVetoed, match.league_code, match.away_team))
    ) {
      continue;
    }

    const league = LEAGUE_BY_CODE[match.league_code];
    const embed = {
      title: `⚽ ${match.home_team} vs ${match.away_team}`,
      color: COLORS.amber,
      description: `${dayLabel(match.kickoff)} ${timeOf(match.kickoff)}\n${
        league?.name ?? match.league_code
      }${league?.country ? ` · ${league.country}` : ""}`,
      fields: [
        {
          name: `1T más de 0.5 · ≥${Math.round(threshold() * 100)}%`,
          value: pct(match.ht_over05),
          inline: true,
        },
      ],
      footer: {
        text: label ? `Aviso: ${label}` : "Predicciones · primer tiempo",
      },
    };

    const result = await sendEmbeds([embed]);
    if (!result.sent) continue;

    await db.execute({
      sql: `INSERT OR IGNORE INTO notifications_sent (match_id, kind, sent_at) VALUES (?,?,?)`,
      args: [match.id, kind, new Date().toISOString()],
    });
    sent += 1;

    // Pequeña pausa para no saturar el webhook.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return sent;
}

/** Partidos de hoy (hora Perú) que aún no empiezan y no se avisaron al abrir la app. */
export async function notifyTodayStartup(): Promise<number> {
  await ensureSchema();
  const now = new Date();
  const today = todayKey();

  const from = zonedToUtc(`${today}T00:00:00`, APP_TIME_ZONE);
  const to = zonedToUtc(`${today}T23:59:59`, APP_TIME_ZONE);

  const matches = (await matchesBetween(from, to)).filter(
    (match) => Date.parse(`${match.kickoff}Z`) > Date.now(),
  );
  return sendOneByOne(matches, STARTUP_KIND);
}

/** Aviso individual para partidos de hoy: faltan 30 min y faltan 10 min. */
export async function notifyBeforeKickoff(): Promise<number> {
  await ensureSchema();
  const now = Date.now();
  const today = todayKey();

  const from = new Date(now).toISOString().slice(0, 19);
  const to = new Date(now + 31 * 60_000).toISOString().slice(0, 19);

  const matches = (await matchesBetween(from, to)).filter(
    (match) =>
      dayKey(match.kickoff) === today && Date.parse(`${match.kickoff}Z`) > now,
  );

  let sent = 0;
  for (const window of PRE_WINDOWS) {
    const inWindow = matches.filter((match) => {
      const minutes = (Date.parse(`${match.kickoff}Z`) - now) / 60_000;
      return minutes > window.minMinutes && minutes <= window.maxMinutes;
    });
    sent += await sendOneByOne(inWindow, window.kind, window.label);
  }

  return sent;
}

/**
 * Al abrir la app: una sola vez por día.
 * Devuelve cuántos avisos envió (0 si ya se hizo hoy).
 */
let startupInFlight: Promise<number> | null = null;

export function notifyStartupIfNeeded(): Promise<number> {
  if (startupInFlight) return startupInFlight;

  startupInFlight = (async () => {
    await ensureSchema();
    const today = todayKey();
    const last = await getMeta("notify_startup_day");
    if (last === today) return 0;

    const sent = await notifyTodayStartup();
    await setMeta("notify_startup_day", today);
    return sent;
  })().finally(() => {
    startupInFlight = null;
  });

  return startupInFlight;
}
