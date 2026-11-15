import { ensureSchema, getDb } from "./db";
import { getTeamForm, type MatchRow } from "./queries";
import { LEAGUE_BY_CODE } from "./leagues";
import { teamSimilarity } from "./teamMatch";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const MAX_MATCHES = 5;
const SENTINEL = "__none__";

type AthleteStat = { name?: string; value?: number; displayValue?: string };

type EspnSummary = {
  rosters?: {
    team?: { displayName?: string };
    roster?: { athlete?: { displayName?: string }; stats?: AthleteStat[] }[];
  }[];
};

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: {
    competitors?: {
      homeAway?: string;
      team?: { displayName?: string };
    }[];
  }[];
};

export type ShotLeader = {
  player: string;
  team: string;
  sot: number;
  shots: number;
  goals: number;
  apps: number;
};

export type CardLeader = {
  player: string;
  team: string;
  yellow: number;
  red: number;
  apps: number;
};

export type PlayerStatsResult = {
  available: boolean;
  home: ShotLeader[];
  away: ShotLeader[];
  homeCards: CardLeader[];
  awayCards: CardLeader[];
};

const inflight = new Map<number, Promise<PlayerStatsResult>>();

function emptyResult(available: boolean): PlayerStatsResult {
  return { available, home: [], away: [], homeCards: [], awayCards: [] };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "predicciones-personal/1.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function findEventId(slug: string, match: MatchRow): Promise<string | null> {
  const kickoff = new Date(`${match.kickoff}Z`);
  const dates = new Set([
    kickoff.toISOString().slice(0, 10).replace(/-/g, ""),
    new Date(kickoff.getTime() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
  ]);

  for (const date of dates) {
    const data = await fetchJson<{ events?: EspnEvent[] }>(
      `${ESPN}/${slug}/scoreboard?dates=${date}`,
    );
    for (const event of data?.events ?? []) {
      const eventMs = Date.parse(event.date ?? "");
      if (!Number.isFinite(eventMs)) continue;
      if (Math.abs(eventMs - kickoff.getTime()) > 45 * 60_000) continue;

      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home")?.team?.displayName ?? "";
      const away = competitors.find((c) => c.homeAway === "away")?.team?.displayName ?? "";
      if (
        home &&
        away &&
        teamSimilarity(home, match.home_team) >= 0.6 &&
        teamSimilarity(away, match.away_team) >= 0.6
      ) {
        return event.id ?? null;
      }
    }
  }

  return null;
}

async function markEmpty(matchId: number, team: string) {
  const db = getDb();
  await db.execute({
    sql: `INSERT OR IGNORE INTO player_match_stats
            (match_id, team, player, shots, sot, goals, yellow, red, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [matchId, team, SENTINEL, null, null, null, null, null, new Date().toISOString()],
  });
}

async function ensureMatchStats(match: MatchRow, slug: string) {
  const db = getDb();
  // Caché válida: ya se intentó, o ya tiene tarjetas (versión nueva de los datos).
  const cached = await db.execute({
    sql: `SELECT 1 AS ok FROM player_match_stats
          WHERE match_id = ? AND (player = ? OR yellow IS NOT NULL) LIMIT 1`,
    args: [match.id, SENTINEL],
  });
  if (cached.rows.length > 0) return;

  const eventId = await findEventId(slug, match);
  if (!eventId) {
    await markEmpty(match.id, match.home_team);
    return;
  }

  const summary = await fetchJson<EspnSummary>(`${ESPN}/${slug}/summary?event=${eventId}`);
  const rosters = summary?.rosters ?? [];
  if (rosters.length === 0) {
    await markEmpty(match.id, match.home_team);
    return;
  }

  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  const now = new Date().toISOString();

  for (const side of rosters) {
    const espnName = side.team?.displayName ?? "";
    const isHome =
      teamSimilarity(espnName, match.home_team) >= teamSimilarity(espnName, match.away_team);
    const teamName = isHome ? match.home_team : match.away_team;

    for (const athlete of side.roster ?? []) {
      const name = athlete.athlete?.displayName;
      if (!name) continue;
      const stat = (key: string) => {
        const found = athlete.stats?.find((item) => item.name === key);
        const value = Number(found?.value ?? found?.displayValue ?? 0);
        return Number.isFinite(value) ? value : 0;
      };
      statements.push({
        sql: `INSERT INTO player_match_stats
                (match_id, team, player, shots, sot, goals, yellow, red, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?)
              ON CONFLICT(match_id, player) DO UPDATE SET
                team = excluded.team,
                shots = excluded.shots,
                sot = excluded.sot,
                goals = excluded.goals,
                yellow = excluded.yellow,
                red = excluded.red,
                updated_at = excluded.updated_at`,
        args: [
          match.id,
          teamName,
          name,
          stat("totalShots"),
          stat("shotsOnTarget"),
          stat("totalGoals"),
          stat("yellowCards"),
          stat("redCards"),
          now,
        ],
      });
    }
  }

  if (statements.length === 0) {
    await markEmpty(match.id, match.home_team);
    return;
  }

  await db.batch(statements, "write");
}

async function mapPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await fn(items[current]);
    }
  });
  await Promise.all(workers);
}

async function run(match: MatchRow): Promise<PlayerStatsResult> {
  await ensureSchema();
  const league = LEAGUE_BY_CODE[match.league_code];
  if (!league?.espnSlug) return emptyResult(false);

  const [homeForm, awayForm] = await Promise.all([
    getTeamForm(match.league_code, match.home_team, match.kickoff, MAX_MATCHES),
    getTeamForm(match.league_code, match.away_team, match.kickoff, MAX_MATCHES),
  ]);

  const unique = new Map<number, MatchRow>();
  for (const item of [...homeForm, ...awayForm]) unique.set(item.id, item);

  await mapPool([...unique.values()], 3, (item) => ensureMatchStats(item, league.espnSlug!));

  const ids = [...unique.keys()];
  if (ids.length === 0) return emptyResult(true);

  const placeholders = ids.map(() => "?").join(",");
  const db = getDb();

  const shotsRes = await db.execute({
    sql: `SELECT player, team, SUM(sot) AS sot, SUM(shots) AS shots, SUM(goals) AS goals, COUNT(*) AS apps
          FROM player_match_stats
          WHERE match_id IN (${placeholders}) AND player <> ?
          GROUP BY player, team
          ORDER BY sot DESC, shots DESC`,
    args: [...ids, SENTINEL],
  });

  const cardsRes = await db.execute({
    sql: `SELECT player, team, SUM(yellow) AS yellow, SUM(red) AS red, COUNT(*) AS apps
          FROM player_match_stats
          WHERE match_id IN (${placeholders}) AND player <> ?
          GROUP BY player, team
          ORDER BY (SUM(yellow) + SUM(red)) DESC, yellow DESC`,
    args: [...ids, SENTINEL],
  });

  const shots: ShotLeader[] = shotsRes.rows
    .map((row) => ({
      player: String(row.player),
      team: String(row.team),
      sot: Number(row.sot ?? 0),
      shots: Number(row.shots ?? 0),
      goals: Number(row.goals ?? 0),
      apps: Number(row.apps ?? 0),
    }))
    .filter((item) => item.sot > 0);

  const cards: CardLeader[] = cardsRes.rows
    .map((row) => ({
      player: String(row.player),
      team: String(row.team),
      yellow: Number(row.yellow ?? 0),
      red: Number(row.red ?? 0),
      apps: Number(row.apps ?? 0),
    }))
    .filter((item) => item.yellow + item.red > 0);

  return {
    available: true,
    home: shots.filter((item) => item.team === match.home_team).slice(0, 5),
    away: shots.filter((item) => item.team === match.away_team).slice(0, 5),
    homeCards: cards.filter((item) => item.team === match.home_team).slice(0, 5),
    awayCards: cards.filter((item) => item.team === match.away_team).slice(0, 5),
  };
}

/** Jugadores con más tiros al arco y tarjetas en los últimos 5 (con caché). */
export async function getPlayerShotLeaders(match: MatchRow): Promise<PlayerStatsResult> {
  const existing = inflight.get(match.id);
  if (existing) return existing;

  const promise = run(match).finally(() => {
    inflight.delete(match.id);
  });
  inflight.set(match.id, promise);
  return promise;
}
