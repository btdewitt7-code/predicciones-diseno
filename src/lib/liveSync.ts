import { getDb } from "./db";
import { LEAGUE_BY_CODE } from "./leagues";
import { teamSimilarity } from "./teamMatch";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";

/** No repetir la consulta a la misma liga antes de este tiempo. */
const LEAGUE_THROTTLE_MS = 20_000;
/** Ventana de partidos que consideramos "en juego". */
const LIVE_WINDOW_HOURS = (() => {
  const raw = Number(process.env.LIVE_WINDOW_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 2.5;
})();

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  team?: { id?: string; displayName?: string };
};

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: {
    status?: {
      type?: { state?: string; completed?: boolean; description?: string };
      displayClock?: string;
    };
    competitors?: EspnCompetitor[];
  }[];
};

type LiveMatch = {
  id: number;
  league_code: string;
  kickoff: string;
  home_team: string;
  away_team: string;
};

const leagueFetchedAt = new Map<string, number>();
let inFlight: Promise<LiveResult> | null = null;

export type LiveResult = { live: number; finished: number; checked: number };

type EspnSummary = {
  header?: {
    competitions?: {
      competitors?: {
        homeAway?: string;
        linescores?: { displayValue?: string }[];
      }[];
    }[];
  };
  boxscore?: {
    teams?: {
      team?: { id?: string };
      statistics?: { name?: string; value?: number; displayValue?: string }[];
    }[];
  };
  keyEvents?: {
    type?: { type?: string; text?: string };
    clock?: { displayValue?: string };
    team?: { id?: string; displayName?: string };
    participants?: { athlete?: { displayName?: string } }[];
  }[];
};

function statValue(
  box: { statistics?: { name?: string; value?: number; displayValue?: string }[] } | undefined,
  name: string,
): number | null {
  const stat = box?.statistics?.find((item) => item.name === name);
  if (!stat) return null;
  const value = Number(stat.value ?? stat.displayValue);
  return Number.isFinite(value) ? value : null;
}

/** Al cerrar un partido, guarda el 1T y las estadísticas desde ESPN. */
export async function enrichClosedMatch(
  leagueSlug: string,
  eventId: string,
  matchId: number,
  homeId?: string,
  awayId?: string,
): Promise<void> {
  try {
    const res = await fetch(`${ESPN}/${leagueSlug}/summary?event=${eventId}`, {
      headers: { "User-Agent": "predicciones-personal/1.0" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as EspnSummary;

    const competitors = data.header?.competitions?.[0]?.competitors ?? [];
    const line = (side: string) => {
      const raw = competitors.find((item) => item.homeAway === side)?.linescores?.[0]
        ?.displayValue;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };

    const boxes = data.boxscore?.teams ?? [];
    const homeBox = boxes.find((box) => String(box.team?.id) === String(homeId));
    const awayBox = boxes.find((box) => String(box.team?.id) === String(awayId));

    await getDb().execute({
      sql: `UPDATE matches SET
              ht_home_goals = COALESCE(?, ht_home_goals),
              ht_away_goals = COALESCE(?, ht_away_goals),
              home_shots = COALESCE(?, home_shots),
              away_shots = COALESCE(?, away_shots),
              home_sot = COALESCE(?, home_sot),
              away_sot = COALESCE(?, away_sot),
              home_corners = COALESCE(?, home_corners),
              away_corners = COALESCE(?, away_corners),
              home_fouls = COALESCE(?, home_fouls),
              away_fouls = COALESCE(?, away_fouls),
              home_yellow = COALESCE(?, home_yellow),
              away_yellow = COALESCE(?, away_yellow),
              home_red = COALESCE(?, home_red),
              away_red = COALESCE(?, away_red)
            WHERE id = ?`,
      args: [
        line("home"),
        line("away"),
        statValue(homeBox, "totalShots"),
        statValue(awayBox, "totalShots"),
        statValue(homeBox, "shotsOnTarget"),
        statValue(awayBox, "shotsOnTarget"),
        statValue(homeBox, "wonCorners"),
        statValue(awayBox, "wonCorners"),
        statValue(homeBox, "foulsCommitted"),
        statValue(awayBox, "foulsCommitted"),
        statValue(homeBox, "yellowCards"),
        statValue(awayBox, "yellowCards"),
        statValue(homeBox, "redCards"),
        statValue(awayBox, "redCards"),
        matchId,
      ],
    });

    // Goles por jugador, solo si el partido aún no los tiene.
    const goals = (data.keyEvents ?? []).filter((key) => {
      const type = (key.type?.type ?? "").toLowerCase();
      return (type.includes("goal") || type.includes("penalty")) && !type.includes("miss");
    });

    if (goals.length > 0) {
      const existing = await getDb().execute({
        sql: `SELECT COUNT(*) AS n FROM goal_events WHERE match_id = ?`,
        args: [matchId],
      });
      if (Number(existing.rows[0]?.n) === 0) {
        const statements: { sql: string; args: (string | number | null)[] }[] = [];
        for (const key of goals) {
          const player = key.participants?.[0]?.athlete?.displayName ?? "";
          const minute = key.clock?.displayValue ?? "";
          if (!player || !minute) continue;
          const type = (key.type?.type ?? "").toLowerCase();
          const kind = type.includes("own")
            ? "own"
            : type.includes("penalty")
              ? "penalty"
              : "goal";
          const side =
            homeId && key.team?.id && String(key.team.id) === String(homeId)
              ? "home"
              : "away";
          statements.push({
            sql: `INSERT OR REPLACE INTO goal_events
                    (match_id, minute, side, team, player, assist, kind)
                  VALUES (?,?,?,?,?,?,?)`,
            args: [matchId, minute, side, key.team?.displayName ?? "", player, null, kind],
          });
        }
        if (statements.length > 0) await getDb().batch(statements, "write");
      }
    }
  } catch {
    // Si ESPN no responde, el partido queda cerrado y el backfill lo completa.
  }
}

/**
 * Actualiza solo los marcadores de los partidos en juego usando ESPN.
 * No toca API-Football ni reentrena nada.
 */
export async function syncLiveScores(options?: { force?: boolean }): Promise<LiveResult> {
  if (inFlight) return inFlight;
  inFlight = run(options?.force ?? false).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(force: boolean): Promise<LiveResult> {
  const db = getDb();
  const now = Date.now();
  const from = new Date(now - LIVE_WINDOW_HOURS * 3600_000).toISOString().slice(0, 19);
  const to = new Date(now).toISOString().slice(0, 19);

  const res = await db.execute({
    sql: `SELECT id, league_code, kickoff, home_team, away_team FROM matches
          WHERE status = 'scheduled' AND kickoff BETWEEN ? AND ?`,
    args: [from, to],
  });

  const matches = res.rows.map((row) => ({
    id: Number(row.id),
    league_code: String(row.league_code),
    kickoff: String(row.kickoff),
    home_team: String(row.home_team),
    away_team: String(row.away_team),
  })) as LiveMatch[];

  if (matches.length === 0) return { live: 0, finished: 0, checked: 0 };

  const byLeague = new Map<string, LiveMatch[]>();
  for (const match of matches) {
    const list = byLeague.get(match.league_code) ?? [];
    list.push(match);
    byLeague.set(match.league_code, list);
  }

  let live = 0;
  let finished = 0;
  let checked = 0;

  for (const [code, leagueMatches] of byLeague) {
    const last = leagueFetchedAt.get(code) ?? 0;
    if (!force && now - last < LEAGUE_THROTTLE_MS) continue;

    const league = LEAGUE_BY_CODE[code];
    if (!league?.espnSlug) continue;

    leagueFetchedAt.set(code, now);

    // ESPN indexa por fecha local de la liga: probamos el día del partido y el anterior.
    const dates = new Set<string>();
    for (const match of leagueMatches) {
      const kickoff = new Date(`${match.kickoff}Z`);
      dates.add(kickoff.toISOString().slice(0, 10).replace(/-/g, ""));
      dates.add(new Date(kickoff.getTime() - 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""));
    }

    const eventsById = new Map<string, EspnEvent>();
    try {
      for (const date of dates) {
        const response = await fetch(`${ESPN}/${league.espnSlug}/scoreboard?dates=${date}`, {
          headers: { "User-Agent": "predicciones-personal/1.0" },
          signal: AbortSignal.timeout(6000),
          cache: "no-store",
        });
        if (!response.ok) continue;
        const data = (await response.json()) as { events?: EspnEvent[] };
        for (const event of data.events ?? []) {
          eventsById.set(`${event.date}|${event.competitions?.[0]?.competitors?.[0]?.team?.displayName}`, event);
        }
      }
    } catch {
      continue;
    }

    const events = [...eventsById.values()];
    checked += 1;

    for (const event of events) {
      const competition = event.competitions?.[0];
      if (!competition) continue;

      const statusType = competition.status?.type;
      const state = statusType?.state;
      if (state !== "in" && state !== "post") continue;
      if (/postponed|cancel|abandon|suspend/i.test(statusType?.description ?? "")) continue;
      if (state === "post" && statusType?.completed === false) continue;

      const homeSide = competition.competitors?.find((c) => c.homeAway === "home");
      const awaySide = competition.competitors?.find((c) => c.homeAway === "away");
      const homeName = homeSide?.team?.displayName ?? "";
      const awayName = awaySide?.team?.displayName ?? "";
      const eventMs = Date.parse(event.date ?? "");
      if (!homeName || !awayName || !Number.isFinite(eventMs)) continue;

      const homeGoals = Number(homeSide?.score);
      const awayGoals = Number(awaySide?.score);
      if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

      const best = leagueMatches
        .map((match) => ({
          match,
          score:
            teamSimilarity(match.home_team, homeName) +
            teamSimilarity(match.away_team, awayName),
          gap: Math.abs(Date.parse(`${match.kickoff}Z`) - eventMs),
        }))
        .filter((candidate) => candidate.gap <= 45 * 60_000)
        .sort((a, b) => b.score - a.score)[0];

      if (!best || best.score < 1.2) continue;

      if (state === "in") {
        await db.execute({
          sql: `INSERT INTO live_scores (match_id, home_goals, away_goals, clock, updated_at)
                VALUES (?,?,?,?,?)
                ON CONFLICT(match_id) DO UPDATE SET
                  home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
                  clock = excluded.clock,
                  updated_at = excluded.updated_at`,
          args: [
            best.match.id,
            homeGoals,
            awayGoals,
            competition.status?.displayClock ?? null,
            new Date().toISOString(),
          ],
        });
        live += 1;
      } else {
        await db.execute({
          sql: `UPDATE matches SET home_goals = ?, away_goals = ?, status = 'played' WHERE id = ?`,
          args: [homeGoals, awayGoals, best.match.id],
        });
        await enrichClosedMatch(
          league.espnSlug,
          String(event.id),
          best.match.id,
          homeSide?.team?.id,
          awaySide?.team?.id,
        );
        await db.execute({ sql: `DELETE FROM live_scores WHERE match_id = ?`, args: [best.match.id] });
        finished += 1;
      }
    }
  }

  return { live, finished, checked };
}
