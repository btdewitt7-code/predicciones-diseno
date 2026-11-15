import { getDb } from "./db";
import { CUP_CODES_SQL, LEAGUES, LEAGUE_BY_CODE } from "./leagues";
import {
  buildTeamUsage,
  computeAbsenceFactors,
  type AbsenceFactors,
  type AbsenceInput,
  type TeamUsage,
} from "./absences";
import { normalizeTeam, pickSide } from "./teamMatch";
import { dayKey, todayKey } from "./format";

export type MatchRow = {
  id: number;
  league_code: string;
  season: string;
  kickoff: string;
  home_team: string;
  away_team: string;
  home_goals: number | null;
  away_goals: number | null;
  ht_home_goals: number | null;
  ht_away_goals: number | null;
  home_shots: number | null;
  away_shots: number | null;
  home_sot: number | null;
  away_sot: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_fouls: number | null;
  away_fouls: number | null;
  home_yellow: number | null;
  away_yellow: number | null;
  home_red: number | null;
  away_red: number | null;
  referee: string | null;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  odds_over25: number | null;
  odds_under25: number | null;
  close_home: number | null;
  close_draw: number | null;
  close_away: number | null;
  status: string;
};

export type PredictionRow = {
  match_id: number;
  home_win: number;
  draw: number;
  away_win: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  exp_home_goals: number;
  exp_away_goals: number;
  corners_home: number;
  corners_away: number;
  sot_home: number;
  sot_away: number;
  corners_over85: number;
  corners_over95: number;
  corners_over105: number;
  sot_over85: number;
  sot_over95: number;
  shots_home: number;
  shots_away: number;
  shots_over205: number;
  shots_over225: number;
  shots_over245: number;
  cards_home: number;
  cards_away: number;
  cards_over35: number;
  cards_over45: number;
  cards_over55: number;
  ht_home_goals: number;
  ht_away_goals: number;
  ht_over05: number;
  ht_over15: number;
  ht_over25: number;
  top_scores: string;
  confidence: number;
  created_at: string;
};

export type LiveScore = { home: number; away: number; clock: string | null };

export type RatedMatch = MatchRow & {
  prediction: PredictionRow | null;
  cupPrediction?: PredictionRow | null;
  home_promoted?: number | null;
  away_promoted?: number | null;
  live?: LiveScore | null;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function mapMatch(row: Record<string, unknown>): MatchRow {
  const numeric = [
    "home_goals",
    "away_goals",
    "ht_home_goals",
    "ht_away_goals",
    "home_shots",
    "away_shots",
    "home_sot",
    "away_sot",
    "home_corners",
    "away_corners",
    "home_fouls",
    "away_fouls",
    "home_yellow",
    "away_yellow",
    "home_red",
    "away_red",
    "odds_home",
    "odds_draw",
    "odds_away",
    "odds_over25",
    "odds_under25",
    "close_home",
    "close_draw",
    "close_away",
  ];
  const out: Record<string, unknown> = { ...row };
  for (const key of numeric) out[key] = toNumber(row[key]);
  out.id = Number(row.id);
  return out as unknown as MatchRow;
}

function mapPrediction(row: Record<string, unknown>): PredictionRow {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(row)) {
    if (key !== "top_scores" && key !== "created_at") {
      out[key] = toNumber(row[key]);
    }
  }
  out.match_id = Number(row.match_id);
  // `matches` y `predictions` comparten ht_home_goals/ht_away_goals: usamos las de la predicción.
  if (row.p_ht_home !== undefined) out.ht_home_goals = toNumber(row.p_ht_home);
  if (row.p_ht_away !== undefined) out.ht_away_goals = toNumber(row.p_ht_away);
  return out as unknown as PredictionRow;
}

/** Adjunta la predicción del modelo de copas (solo para mostrar; no entra en Value Bets ni avisos). */
async function attachCupPredictions(rows: RatedMatch[]): Promise<RatedMatch[]> {
  if (rows.length === 0) return rows;
  const db = getDb();
  const ids = [...new Set(rows.map((row) => row.id))];
  const res = await db.execute({
    sql: `SELECT * FROM cup_predictions WHERE match_id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });
  const map = new Map<number, PredictionRow>();
  for (const row of res.rows) {
    map.set(Number(row.match_id), mapPrediction(row as Record<string, unknown>));
  }
  return rows.map((row) => ({ ...row, cupPrediction: map.get(row.id) ?? null }));
}

export async function getUpcoming(leagueCode?: string): Promise<RatedMatch[]> {
  const db = getDb();
  const since = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 19);
  const args: (string | number)[] = [since];
  let sql = `SELECT m.*, p.*, rh.promoted AS home_promoted, ra.promoted AS away_promoted,
      p.ht_home_goals AS p_ht_home, p.ht_away_goals AS p_ht_away,
      l.home_goals AS live_home, l.away_goals AS live_away, l.clock AS live_clock
    FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    LEFT JOIN ratings rh ON rh.league_code = m.league_code AND rh.team = m.home_team
    LEFT JOIN ratings ra ON ra.league_code = m.league_code AND ra.team = m.away_team
    LEFT JOIN live_scores l ON l.match_id = m.id
    WHERE m.status = 'scheduled' AND m.kickoff >= ?`;
  if (leagueCode) {
    sql += ` AND m.league_code = ?`;
    args.push(leagueCode);
  }
  sql += ` ORDER BY m.kickoff ASC LIMIT 200`;

  const res = await db.execute({ sql, args });
  const rows = res.rows
    .map((row) => {
      const match = mapMatch(row as Record<string, unknown>);
      const prediction = row.match_id ? mapPrediction(row as Record<string, unknown>) : null;
      const liveHome = toNumber(row.live_home);
      return {
        ...match,
        prediction,
        home_promoted: toNumber(row.home_promoted),
        away_promoted: toNumber(row.away_promoted),
        live:
          liveHome !== null
            ? {
                home: liveHome,
                away: toNumber(row.live_away) ?? 0,
                clock: row.live_clock ? String(row.live_clock) : null,
              }
            : null,
      };
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return attachCupPredictions(rows);
}

export async function getMatchesByIds(ids: number[]): Promise<MatchRow[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT * FROM matches WHERE id IN (${placeholders})`,
    args: ids,
  });
  return res.rows.map((row) => mapMatch(row as Record<string, unknown>));
}

export async function getMarketOdds(matchIds: number[]) {
  if (matchIds.length === 0) return [];
  const db = getDb();
  const placeholders = matchIds.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT match_id, market, line, over_odds, under_odds
          FROM market_odds WHERE match_id IN (${placeholders})`,
    args: matchIds,
  });
  return res.rows.map((row) => ({
    match_id: Number(row.match_id),
    market: String(row.market),
    line: Number(row.line),
    over_odds: row.over_odds === null ? null : Number(row.over_odds),
    under_odds: row.under_odds === null ? null : Number(row.under_odds),
  }));
}

export async function getRecentResults(limit = 24, leagueCode?: string): Promise<RatedMatch[]> {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 19);
  const args: (string | number)[] = [now];
  let sql = `SELECT m.*, p.* FROM matches m
    LEFT JOIN predictions p ON p.match_id = m.id
    WHERE m.status = 'played' AND m.kickoff <= ?`;
  if (leagueCode) {
    sql += ` AND m.league_code = ?`;
    args.push(leagueCode);
  }
  sql += ` ORDER BY m.kickoff DESC LIMIT ?`;
  args.push(limit);

  const res = await db.execute({ sql, args });
  return res.rows.map((row) => {
    const match = mapMatch(row as Record<string, unknown>);
    const prediction = row.match_id ? mapPrediction(row as Record<string, unknown>) : null;
    return { ...match, prediction };
  });
}

export async function searchMatches(
  query: string,
  leagueCode?: string,
  limit = 60,
): Promise<RatedMatch[]> {
  const db = getDb();
  const q = query.trim();
  if (!q) return [];

  const like = `%${q}%`;
  const normalized = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const leagueCodes = LEAGUES.filter((league) => {
    const text = `${league.name} ${league.country} ${league.tag}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return text.includes(normalized);
  }).map((league) => league.code);

  const textConditions = ["m.home_team LIKE ?", "m.away_team LIKE ?"];
  const args: (string | number)[] = [like, like];
  if (leagueCodes.length > 0) {
    textConditions.push(`m.league_code IN (${leagueCodes.map(() => "?").join(",")})`);
    args.push(...leagueCodes);
  }
  const conditions = [`(${textConditions.join(" OR ")})`];
  if (leagueCode) {
    conditions.push("m.league_code = ?");
    args.push(leagueCode);
  }
  args.push(limit);

  const res = await db.execute({
    sql: `SELECT m.*, p.* FROM matches m
          LEFT JOIN predictions p ON p.match_id = m.id
          WHERE ${conditions.join(" AND ")}
          ORDER BY CASE WHEN m.status = 'played' THEN 0 ELSE 1 END,
                   CASE WHEN m.status = 'played' THEN m.kickoff END DESC,
                   m.kickoff ASC
          LIMIT ?`,
    args,
  });

  const rows = res.rows.map((row) => {
    const match = mapMatch(row as Record<string, unknown>);
    const prediction = row.match_id ? mapPrediction(row as Record<string, unknown>) : null;
    return { ...match, prediction };
  });
  return attachCupPredictions(rows);
}

export type TieContext = {
  other: MatchRow;
  firstLeg: MatchRow;
  secondLeg: MatchRow;
};

/** Si el partido es parte de una llave a doble partido, devuelve la otra pierna. */
export async function getTieContext(match: MatchRow): Promise<TieContext | null> {
  const db = getDb();
  const kickoffMs = Date.parse(`${match.kickoff}Z`);
  if (!Number.isFinite(kickoffMs)) return null;

  const from = new Date(kickoffMs - 21 * 86_400_000).toISOString().slice(0, 19);
  const to = new Date(kickoffMs + 21 * 86_400_000).toISOString().slice(0, 19);

  const res = await db.execute({
    sql: `SELECT * FROM matches
          WHERE league_code = ? AND id <> ? AND kickoff BETWEEN ? AND ?
            AND ((home_team = ? AND away_team = ?) OR (home_team = ? AND away_team = ?))
          ORDER BY kickoff`,
    args: [
      match.league_code,
      match.id,
      from,
      to,
      match.home_team,
      match.away_team,
      match.away_team,
      match.home_team,
    ],
  });

  const otherRow = res.rows[0];
  if (!otherRow) return null;
  const other = mapMatch(otherRow as Record<string, unknown>);
  const firstLeg = match.kickoff <= other.kickoff ? match : other;
  const secondLeg = match.kickoff <= other.kickoff ? other : match;

  return { other, firstLeg, secondLeg };
}

export type TeamLeagueSnapshot = {
  team: string;
  leagueCode: string;
  season: string;
  position: number;
  teams: number;
  points: number;
  played: number;
  form: ("W" | "D" | "L")[];
};

/** Nombres repetidos en países distintos: forzar la liga correcta. */
const DOMESTIC_LEAGUE_HINT: Record<string, string> = {
  Liverpool: "E0",
};

/** Cómo va un equipo en su liga doméstica (última temporada jugada). */
export async function getTeamLeagueSnapshot(
  team: string,
): Promise<TeamLeagueSnapshot | null> {
  const db = getDb();

  // Nombre canónico: la copa usa el nombre de ESPN y la liga el del CSV.
  const knownRes = await db.execute({
    sql: `SELECT name FROM (
            SELECT home_team AS name FROM matches
            WHERE status='played' AND kickoff >= datetime('now','-400 days')
              AND league_code NOT IN (${CUP_CODES_SQL})
            UNION
            SELECT away_team AS name FROM matches
            WHERE status='played' AND kickoff >= datetime('now','-400 days')
              AND league_code NOT IN (${CUP_CODES_SQL})
          )`,
    args: [],
  });
  const known = knownRes.rows.map((row) => String(row.name));
  const target = normalizeTeam(team);
  const canonical =
    known.find((name) => name === team) ??
    known.find((name) => normalizeTeam(name) === target) ??
    null;
  if (!canonical) return null;

  const leaguesRes = await db.execute({
    sql: `SELECT league_code, MAX(kickoff) AS last
          FROM matches
          WHERE status='played' AND kickoff >= datetime('now','-400 days')
            AND league_code NOT IN (${CUP_CODES_SQL})
            AND (home_team = ? OR away_team = ?)
          GROUP BY league_code
          ORDER BY last DESC`,
    args: [canonical, canonical],
  });
  if (leaguesRes.rows.length === 0) return null;

  const hint = DOMESTIC_LEAGUE_HINT[canonical] ?? DOMESTIC_LEAGUE_HINT[team];
  let leagueCode: string;

  if (hint && leaguesRes.rows.some((row) => String(row.league_code) === hint)) {
    leagueCode = hint;
  } else {
    const countries = new Set(
      leaguesRes.rows.map(
        (row) =>
          LEAGUE_BY_CODE[String(row.league_code)]?.country ?? String(row.league_code),
      ),
    );
    // Nombre repetido en países distintos: no adivinar.
    if (countries.size > 1) return null;
    leagueCode = String(leaguesRes.rows[0].league_code);
  }

  const seasonRes = await db.execute({
    sql: `SELECT season FROM matches
          WHERE status='played' AND home_goals IS NOT NULL
            AND league_code = ? AND (home_team = ? OR away_team = ?)
          ORDER BY kickoff DESC LIMIT 1`,
    args: [leagueCode, canonical, canonical],
  });
  const seasonRow = seasonRes.rows[0];
  if (!seasonRow) return null;
  const season = String(seasonRow.season);

  const rows = await db.execute({
    sql: `SELECT home_team, away_team, home_goals, away_goals FROM matches
          WHERE league_code = ? AND season = ? AND status='played'
            AND home_goals IS NOT NULL AND away_goals IS NOT NULL`,
    args: [leagueCode, season],
  });

  const table = new Map<string, { pts: number; gd: number; played: number }>();
  const touch = (name: string) => {
    const entry = table.get(name) ?? { pts: 0, gd: 0, played: 0 };
    table.set(name, entry);
    return entry;
  };

  for (const row of rows.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const hg = Number(row.home_goals);
    const ag = Number(row.away_goals);
    const h = touch(home);
    const a = touch(away);
    h.played += 1;
    a.played += 1;
    h.gd += hg - ag;
    a.gd += ag - hg;
    if (hg > ag) h.pts += 3;
    else if (hg < ag) a.pts += 3;
    else {
      h.pts += 1;
      a.pts += 1;
    }
  }

  const ordered = [...table.entries()].sort(
    (x, y) => y[1].pts - x[1].pts || y[1].gd - x[1].gd,
  );
  const index = ordered.findIndex(([name]) => name === canonical);
  if (index < 0 || ordered.length < 4) return null;

  const formRes = await db.execute({
    sql: `SELECT home_team, away_team, home_goals, away_goals FROM matches
          WHERE league_code = ? AND season = ? AND status='played'
            AND (home_team = ? OR away_team = ?)
          ORDER BY kickoff DESC LIMIT 5`,
    args: [leagueCode, season, canonical, canonical],
  });

  const form = formRes.rows.map((row) => {
    const isHome = String(row.home_team) === canonical;
    const scored = Number(isHome ? row.home_goals : row.away_goals);
    const conceded = Number(isHome ? row.away_goals : row.home_goals);
    return scored > conceded ? "W" : scored < conceded ? "L" : "D";
  }) as ("W" | "D" | "L")[];

  const entry = table.get(canonical);
  if (!entry) return null;

  return {
    team: canonical,
    leagueCode,
    season,
    position: index + 1,
    teams: ordered.length,
    points: entry.pts,
    played: entry.played,
    form,
  };
}

export async function getMatch(
  id: number,
): Promise<{
  match: MatchRow;
  prediction: PredictionRow | null;
  cupPrediction: PredictionRow | null;
  live: LiveScore | null;
} | null> {
  const db = getDb();
  const res = await db.execute({ sql: `SELECT * FROM matches WHERE id = ?`, args: [id] });
  const row = res.rows[0];
  if (!row) return null;
  const match = mapMatch(row as Record<string, unknown>);

  const predRes = await db.execute({
    sql: `SELECT * FROM predictions WHERE match_id = ?`,
    args: [id],
  });
  const predRow = predRes.rows[0];

  const cupPredRes = await db.execute({
    sql: `SELECT * FROM cup_predictions WHERE match_id = ?`,
    args: [id],
  });
  const cupPredRow = cupPredRes.rows[0];

  const liveRes = await db.execute({
    sql: `SELECT * FROM live_scores WHERE match_id = ?`,
    args: [id],
  });
  const liveRow = liveRes.rows[0];

  return {
    match,
    prediction: predRow ? mapPrediction(predRow as Record<string, unknown>) : null,
    cupPrediction: cupPredRow ? mapPrediction(cupPredRow as Record<string, unknown>) : null,
    live: liveRow
      ? {
          home: Number(liveRow.home_goals),
          away: Number(liveRow.away_goals),
          clock: liveRow.clock ? String(liveRow.clock) : null,
        }
      : null,
  };
}

export async function getTeamForm(
  leagueCode: string,
  team: string,
  beforeKickoff: string,
  limit = 5,
): Promise<MatchRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM matches
      WHERE league_code = ? AND status = 'played' AND kickoff < ?
        AND (home_team = ? OR away_team = ?)
      ORDER BY kickoff DESC LIMIT ?`,
    args: [leagueCode, beforeKickoff, team, team, limit],
  });
  return res.rows.map((row) => mapMatch(row as Record<string, unknown>));
}

export async function getHeadToHead(
  leagueCode: string,
  homeTeam: string,
  awayTeam: string,
  beforeKickoff: string,
  limit = 5,
): Promise<MatchRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM matches
      WHERE league_code = ? AND status = 'played' AND kickoff < ?
        AND ((home_team = ? AND away_team = ?) OR (home_team = ? AND away_team = ?))
      ORDER BY kickoff DESC LIMIT ?`,
    args: [leagueCode, beforeKickoff, homeTeam, awayTeam, awayTeam, homeTeam, limit],
  });
  return res.rows.map((row) => mapMatch(row as Record<string, unknown>));
}

export type LeagueSummary = {
  league_code: string;
  teams: number;
  played: number;
  upcoming: number;
  avg_goals: number | null;
  avg_corners: number | null;
  avg_sot: number | null;
  home_win_rate: number | null;
  btts_rate: number | null;
  over25_rate: number | null;
};

export async function getLeagueSummaries(): Promise<LeagueSummary[]> {
  const db = getDb();
  const res = await db.execute(`
    SELECT
      league_code,
      COUNT(DISTINCT home_team) + COUNT(DISTINCT away_team) AS teams,
      SUM(CASE WHEN status = 'played' THEN 1 ELSE 0 END) AS played,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS upcoming,
      AVG(CASE WHEN status = 'played' THEN home_goals + away_goals END) AS avg_goals,
      AVG(CASE WHEN status = 'played' THEN home_corners + away_corners END) AS avg_corners,
      AVG(CASE WHEN status = 'played' THEN home_sot + away_sot END) AS avg_sot,
      AVG(CASE WHEN status = 'played' THEN (home_goals > away_goals) END) AS home_win_rate,
      AVG(CASE WHEN status = 'played' THEN (home_goals > 0 AND away_goals > 0) END) AS btts_rate,
      AVG(CASE WHEN status = 'played' THEN (home_goals + away_goals) > 2.5 END) AS over25_rate
    FROM matches
    GROUP BY league_code
  `);
  return res.rows.map((row) => ({
    league_code: String(row.league_code),
    teams: Number(row.teams),
    played: Number(row.played),
    upcoming: Number(row.upcoming),
    avg_goals: toNumber(row.avg_goals),
    avg_corners: toNumber(row.avg_corners),
    avg_sot: toNumber(row.avg_sot),
    home_win_rate: toNumber(row.home_win_rate),
    btts_rate: toNumber(row.btts_rate),
    over25_rate: toNumber(row.over25_rate),
  }));
}

export type TeamRatingRow = {
  league_code: string;
  team: string;
  att_home: number;
  def_home: number;
  att_away: number;
  def_away: number;
  c_att_home: number;
  c_def_home: number;
  c_att_away: number;
  c_def_away: number;
  s_att_home: number;
  s_def_home: number;
  s_att_away: number;
  s_def_away: number;
  matches_home: number;
  matches_away: number;
};

export async function getLeagueTeams(leagueCode: string): Promise<TeamRatingRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM ratings WHERE league_code = ? ORDER BY (att_home + att_away - def_home - def_away) DESC`,
    args: [leagueCode],
  });
  return res.rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(row)) {
      if (key !== "league_code" && key !== "team") out[key] = toNumber(row[key]);
    }
    return out as unknown as TeamRatingRow;
  });
}

/** Mapa `${leagueCode}:${team}` -> URL del escudo. */
export async function getTeamLogoMap(): Promise<Map<string, string>> {
  const db = getDb();
  const res = await db.execute(`SELECT league_code, team, logo_url FROM team_logos`);
  return new Map(
    res.rows.map((row) => [
      `${String(row.league_code)}:${String(row.team)}`,
      String(row.logo_url),
    ]),
  );
}

export async function getLeagueLogoMap(): Promise<Map<string, string>> {
  const db = getDb();
  const res = await db.execute(`SELECT league_code, logo_url FROM league_logos`);
  return new Map(res.rows.map((row) => [String(row.league_code), String(row.logo_url)]));
}

export type GoalEvent = {
  match_id: number;
  minute: string;
  side: string;
  team: string;
  player: string;
  assist: string | null;
  kind: string;
};

export async function getGoalEvents(matchId: number): Promise<GoalEvent[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM goal_events WHERE match_id = ? ORDER BY minute + 0`,
    args: [matchId],
  });
  return res.rows as unknown as GoalEvent[];
}

export type CardLeader = {
  player: string;
  yellows: number;
  reds: number;
  total: number;
};

export async function getCardLeaders(
  leagueCode: string,
  team: string,
  sinceKickoff: string,
  limit = 4,
): Promise<CardLeader[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT ce.player AS player, ce.team AS team, ce.color AS color,
                 m.home_team AS home_team, m.away_team AS away_team
          FROM card_events ce
          JOIN matches m ON m.id = ce.match_id
          WHERE m.league_code = ? AND m.kickoff >= ?`,
    args: [leagueCode, sinceKickoff],
  });

  const counts = new Map<string, { yellows: number; reds: number }>();
  for (const row of res.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    // El lado se recalcula desde el nombre real: más fiable que lo guardado.
    const owner = pickSide(String(row.team), home, away) === "home" ? home : away;
    if (owner !== team) continue;

    const player = String(row.player);
    const entry = counts.get(player) ?? { yellows: 0, reds: 0 };
    if (String(row.color) === "red") entry.reds += 1;
    else entry.yellows += 1;
    counts.set(player, entry);
  }

  return [...counts.entries()]
    .map(([player, entry]) => ({
      player,
      yellows: entry.yellows,
      reds: entry.reds,
      total: entry.yellows + entry.reds,
    }))
    .sort((a, b) => b.total - a.total || b.yellows - a.yellows)
    .slice(0, limit);
}

export type InjuryRow = {
  match_id: number;
  side: string;
  player: string;
  status: string;
  reason: string;
  category: string;
  team: string;
};

export async function getInjuries(matchId: number): Promise<InjuryRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM injuries WHERE match_id = ? ORDER BY side, category, player`,
    args: [matchId],
  });
  return res.rows as unknown as InjuryRow[];
}

export type LineupRow = {
  match_id: number;
  side: string;
  team: string;
  player: string;
  number: number | null;
  position: string | null;
  starter: number;
  formation: string | null;
  updated_at: string;
};

export async function getLineups(matchId: number): Promise<LineupRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM lineups WHERE match_id = ?
          ORDER BY starter DESC, side, rowid`,
    args: [matchId],
  });
  return res.rows as unknown as LineupRow[];
}

export type LineupAdjustmentRow = {
  match_id: number;
  home_attack: number;
  home_defense: number;
  away_attack: number;
  away_defense: number;
  applied_at: string;
};

export async function getLineupAdjustment(
  matchId: number,
): Promise<LineupAdjustmentRow | null> {
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM lineup_adjustments WHERE match_id = ?",
    args: [matchId],
  });
  return (res.rows[0] as unknown as LineupAdjustmentRow) ?? null;
}

export type FirstHalfGoalGame = {
  matchId: number;
  kickoff: string;
  opponent: string;
  isHome: boolean;
  htHome: number;
  htAway: number;
  minute: string | null;
  player: string | null;
};

/** Últimos partidos del equipo con al menos un gol antes del descanso. */
export async function getFirstHalfGoalHistory(
  team: string,
  beforeKickoff: string,
  limit = 5,
): Promise<FirstHalfGoalGame[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, kickoff, home_team, away_team, ht_home_goals, ht_away_goals
          FROM matches
          WHERE status = 'played' AND kickoff < ?
            AND (home_team = ? OR away_team = ?)
            AND (ht_home_goals > 0 OR ht_away_goals > 0)
          ORDER BY kickoff DESC LIMIT 15`,
    args: [beforeKickoff, team, team],
  });
  if (res.rows.length === 0) return [];

  const ids = res.rows.map((row) => Number(row.id));
  const eventsRes = await db.execute({
    sql: `SELECT match_id, minute, player FROM goal_events
          WHERE match_id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });

  const byMatch = new Map<number, { minute: string; player: string; value: number }[]>();
  for (const event of eventsRes.rows) {
    const raw = String(event.minute ?? "");
    const value = Number(raw.match(/(\d+)/)?.[1]);
    if (!Number.isFinite(value) || value > 45) continue;
    const matchId = Number(event.match_id);
    const list = byMatch.get(matchId) ?? [];
    list.push({ minute: raw, player: String(event.player ?? ""), value });
    byMatch.set(matchId, list);
  }

  const games: FirstHalfGoalGame[] = [];
  for (const row of res.rows) {
    const matchId = Number(row.id);
    const goals = (byMatch.get(matchId) ?? []).sort((a, b) => a.value - b.value);
    const first = goals[0] ?? null;
    const isHome = String(row.home_team) === team;
    games.push({
      matchId,
      kickoff: String(row.kickoff),
      opponent: isHome ? String(row.away_team) : String(row.home_team),
      isHome,
      htHome: Number(row.ht_home_goals ?? 0),
      htAway: Number(row.ht_away_goals ?? 0),
      minute: first?.minute ?? null,
      player: first?.player ?? null,
    });
    if (games.length >= limit) break;
  }

  return games;
}

export type StandingRow = {
  league_code: string;
  team: string;
  group_name: string | null;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  updated_at: string;
};

/** Tabla de posiciones desde ESPN, con caché de 30 minutos. */
export async function getStandings(leagueCode: string): Promise<StandingRow[]> {
  const db = getDb();
  const cached = await db.execute({
    sql: "SELECT * FROM standings WHERE league_code = ? ORDER BY rank",
    args: [leagueCode],
  });
  const cachedRows = cached.rows as unknown as StandingRow[];
  const updatedAt = cachedRows[0]?.updated_at ? Date.parse(cachedRows[0].updated_at) : 0;
  if (cachedRows.length > 0 && Date.now() - updatedAt < 30 * 60_000) {
    return cachedRows;
  }

  const league = LEAGUE_BY_CODE[leagueCode];
  if (!league?.espnSlug) return cachedRows;

  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/soccer/${league.espnSlug}/standings`,
      {
        headers: { "User-Agent": "predicciones-personal/1.0" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!res.ok) return cachedRows;

    type EspnEntry = {
      team?: { displayName?: string; name?: string };
      stats?: { name?: string; value?: number }[];
    };
    const data = (await res.json()) as {
      children?: { name?: string; standings?: { entries?: unknown[] } }[];
    };
    const groups = (data.children ?? [])
      .map((child) => ({
        name: child.name ?? null,
        entries: (child.standings?.entries ?? []) as EspnEntry[],
      }))
      .filter((group) => group.entries.length > 0);
    if (groups.length === 0) return cachedRows;

    const now = new Date().toISOString();
    const rows: StandingRow[] = [];
    for (const group of groups) {
      group.entries.forEach((entry, index) => {
        const team = entry.team?.displayName ?? entry.team?.name ?? "";
        if (!team) return;
        const stat = (name: string) => {
          const value = entry.stats?.find((item) => item.name === name)?.value;
          const number = Number(value);
          return Number.isFinite(number) ? number : 0;
        };
        rows.push({
          league_code: leagueCode,
          team,
          group_name: group.name,
          rank: stat("rank") || index + 1,
          played: stat("gamesPlayed"),
          wins: stat("wins"),
          draws: stat("ties"),
          losses: stat("losses"),
          goals_for: stat("pointsFor"),
          goals_against: stat("pointsAgainst"),
          goal_diff: stat("pointDifferential"),
          points: stat("points"),
          updated_at: now,
        });
      });
    }

    if (rows.length > 0) {
      await db.execute({
        sql: "DELETE FROM standings WHERE league_code = ?",
        args: [leagueCode],
      });
      await db.batch(
        rows.map((row) => ({
          sql: `INSERT INTO standings
                  (league_code, team, group_name, rank, played, wins, draws, losses,
                   goals_for, goals_against, goal_diff, points, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          args: [
            row.league_code,
            row.team,
            row.group_name,
            row.rank,
            row.played,
            row.wins,
            row.draws,
            row.losses,
            row.goals_for,
            row.goals_against,
            row.goal_diff,
            row.points,
            row.updated_at,
          ],
        })),
        "write",
      );
    }

    return rows.sort((a, b) => a.rank - b.rank);
  } catch {
    return cachedRows;
  }
}

export type CardSample = {
  average: number | null;
  total: number;
  matches: number;
};

/** Amarillas del equipo en liga + copas, para una muestra más amplia. */
export async function getTeamCardSample(
  team: string,
  beforeKickoff: string,
  limit = 20,
  leagueCode: string | null = null,
): Promise<CardSample> {
  const db = getDb();
  const filter = leagueCode
    ? { sql: `AND league_code IN (${CUP_CODES_SQL}, ?)`, args: [leagueCode] }
    : { sql: `AND league_code IN (${CUP_CODES_SQL})`, args: [] as string[] };
  const res = await db.execute({
    sql: `SELECT home_team, away_team, home_yellow, away_yellow
          FROM matches
          WHERE status = 'played' AND kickoff < ?
            AND (home_team = ? OR away_team = ?)
            ${filter.sql}
          ORDER BY kickoff DESC LIMIT 40`,
    args: [beforeKickoff, team, team, ...filter.args],
  });

  let total = 0;
  let matches = 0;
  for (const row of res.rows) {
    const isHome = String(row.home_team) === team;
    const yellow = isHome ? row.home_yellow : row.away_yellow;
    if (yellow === null) continue;
    total += Number(yellow);
    matches += 1;
    if (matches >= limit) break;
  }

  return {
    average: matches > 0 ? total / matches : null,
    total,
    matches,
  };
}

export type ValueOddRow = {
  match_id: number;
  market: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
  updated_at: string;
};

export async function getValueOdds(matchId: number): Promise<ValueOddRow[]> {
  const db = getDb();
  const res = await db.execute({
    sql: "SELECT * FROM value_odds WHERE match_id = ? ORDER BY market, line",
    args: [matchId],
  });
  return res.rows as unknown as ValueOddRow[];
}

export type TeamStatSample = {
  average: number | null;
  total: number;
  matches: number;
};

/** Media de una estadística del equipo en liga + copas (muestra amplia). */
export async function getTeamStatSample(
  team: string,
  beforeKickoff: string,
  stat: "cards" | "corners" | "sot" | "shots" | "goals",
  limit = 20,
  leagueCode: string | null = null,
): Promise<TeamStatSample> {
  const db = getDb();
  const filter = leagueCode
    ? { sql: `AND league_code IN (${CUP_CODES_SQL}, ?)`, args: [leagueCode] }
    : { sql: `AND league_code IN (${CUP_CODES_SQL})`, args: [] as string[] };
  const res = await db.execute({
    sql: `SELECT home_team, away_team, home_goals, away_goals,
                 home_corners, away_corners, home_sot, away_sot,
                 home_shots, away_shots, home_yellow, away_yellow, league_code
          FROM matches
          WHERE status = 'played' AND kickoff < ?
            AND (home_team = ? OR away_team = ?)
            ${filter.sql}
          ORDER BY kickoff DESC LIMIT 40`,
    args: [beforeKickoff, team, team, ...filter.args],
  });

  let total = 0;
  let matches = 0;
  for (const row of res.rows) {
    const isHome = String(row.home_team) === team;
    let value: number | null = null;
    if (stat === "goals") {
      if (row.home_goals === null || row.away_goals === null) continue;
      value = Number(row.home_goals) + Number(row.away_goals);
    } else if (stat === "cards") {
      value = isHome ? Number(row.home_yellow) : Number(row.away_yellow);
    } else if (stat === "corners") {
      value = isHome ? Number(row.home_corners) : Number(row.away_corners);
    } else if (stat === "sot") {
      value = isHome ? Number(row.home_sot) : Number(row.away_sot);
    } else {
      value = isHome ? Number(row.home_shots) : Number(row.away_shots);
    }
    if (!Number.isFinite(value)) continue;
    total += value;
    matches += 1;
    if (matches >= limit) break;
  }

  return {
    average: matches > 0 ? total / matches : null,
    total,
    matches,
  };
}

/** Uso reciente de la plantilla (apariciones, goles y remates) para medir bajas. */export async function getTeamUsage(team: string): Promise<TeamUsage | undefined> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT p.player,
                 COUNT(*) AS apps,
                 COALESCE(SUM(p.goals), 0) AS goals,
                 COALESCE(SUM(p.shots), 0) AS shots,
                 COALESCE(SUM(p.sot), 0) AS sot
          FROM player_match_stats p
          JOIN matches m ON m.id = p.match_id
          WHERE p.team = ? AND m.status = 'played'
            AND m.kickoff >= date('now', '-365 days')
          GROUP BY p.player`,
    args: [team],
  });

  if (res.rows.length === 0) return undefined;

  const usage = buildTeamUsage(
    res.rows.map((row) => ({
      team,
      player: String(row.player),
      apps: Number(row.apps),
      goals: Number(row.goals),
      shots: Number(row.shots),
      sot: Number(row.sot),
    })),
  );

  return usage.get(team);
}

export type MatchAbsenceRisk = {
  home: AbsenceFactors;
  away: AbsenceFactors;
  risky: boolean;
};

/** Riesgo de bajas por partido, con el mismo criterio que usa el modelo. */
export async function getAbsenceRiskMap(): Promise<Map<number, MatchAbsenceRisk>> {
  const db = getDb();
  const injuriesRes = await db.execute(
    "SELECT match_id, side, team, player, category FROM injuries",
  );
  if (injuriesRes.rows.length === 0) return new Map();

  const usageRes = await db.execute({
    sql: `SELECT p.team, p.player,
                 COUNT(*) AS apps,
                 COALESCE(SUM(p.goals), 0) AS goals,
                 COALESCE(SUM(p.shots), 0) AS shots,
                 COALESCE(SUM(p.sot), 0) AS sot
          FROM player_match_stats p
          JOIN matches m ON m.id = p.match_id
          WHERE m.status = 'played' AND m.kickoff >= date('now', '-365 days')
          GROUP BY p.team, p.player`,
  });
  const usage = buildTeamUsage(
    usageRes.rows.map((row) => ({
      team: String(row.team),
      player: String(row.player),
      apps: Number(row.apps),
      goals: Number(row.goals),
      shots: Number(row.shots),
      sot: Number(row.sot),
    })),
  );

  const byMatch = new Map<
    number,
    { home: (AbsenceInput & { team: string })[]; away: (AbsenceInput & { team: string })[] }
  >();
  for (const row of injuriesRes.rows) {
    const matchId = Number(row.match_id);
    const group = byMatch.get(matchId) ?? { home: [], away: [] };
    const side = String(row.side) === "away" ? "away" : "home";
    group[side].push({
      matchId,
      side,
      team: String(row.team),
      player: String(row.player),
      category: String(row.category),
    });
    byMatch.set(matchId, group);
  }

  const result = new Map<number, MatchAbsenceRisk>();
  for (const [matchId, group] of byMatch) {
    const homeTeam = group.home[0]?.team;
    const awayTeam = group.away[0]?.team;
    const home = computeAbsenceFactors(group.home, homeTeam ? usage.get(homeTeam) : undefined);
    const away = computeAbsenceFactors(group.away, awayTeam ? usage.get(awayTeam) : undefined);
    result.set(matchId, {
      home,
      away,
      risky:
        home.attack <= 0.93 ||
        home.defense >= 1.07 ||
        away.attack <= 0.93 ||
        away.defense >= 1.07,
    });
  }

  return result;
}

export type RefereeStats = { matches: number; avgCards: number };

export async function getRefereeStats(
  leagueCode: string,
  referee: string,
): Promise<RefereeStats | null> {
  if (!referee) return null;
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS n,
                 AVG(home_yellow + away_yellow + COALESCE(home_red, 0) + COALESCE(away_red, 0)) AS avg_cards
          FROM matches
          WHERE league_code = ? AND referee = ? AND status = 'played' AND home_yellow IS NOT NULL`,
    args: [leagueCode, referee],
  });
  const row = res.rows[0];
  const matches = Number(row?.n ?? 0);
  if (matches < 5) return null;
  return { matches, avgCards: Number(row?.avg_cards ?? 0) };
}

export async function getTeamFlags(
  leagueCode: string,
  teams: string[],
): Promise<Map<string, boolean>> {
  const db = getDb();
  const placeholders = teams.map(() => "?").join(",");
  const res = await db.execute({
    sql: `SELECT team, promoted FROM ratings WHERE league_code = ? AND team IN (${placeholders})`,
    args: [leagueCode, ...teams],
  });
  const map = new Map<string, boolean>();
  for (const row of res.rows) {
    map.set(String(row.team), Number(row.promoted) === 1);
  }
  return map;
}

export async function getBaseline(leagueCode: string) {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT * FROM league_baseline WHERE league_code = ?`,
    args: [leagueCode],
  });
  const row = res.rows[0];
  if (!row) return null;
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(row)) {
    if (key !== "league_code") out[key] = toNumber(row[key]);
  }
  return out as unknown as {
    league_code: string;
    avg_home_goals: number;
    avg_away_goals: number;
    avg_home_corners: number;
    avg_away_corners: number;
    avg_home_sot: number;
    avg_away_sot: number;
    matches: number;
  };
}

export type LeagueAverages = {
  matches: number;
  goals: number;
  over15: number;
  over25: number;
  btts: number;
  cards: number;
  corners: number;
  sot: number;
  shots: number;
};

/** Promedios reales de la liga (últimos 400 días), solo para comparar en pantalla. */
export async function getLeagueAverages(leagueCode: string): Promise<LeagueAverages | null> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT
            COUNT(*) AS n,
            AVG(home_goals + away_goals) AS goals,
            AVG(CASE WHEN home_goals + away_goals > 1.5 THEN 1.0 ELSE 0 END) AS over15,
            AVG(CASE WHEN home_goals + away_goals > 2.5 THEN 1.0 ELSE 0 END) AS over25,
            AVG(CASE WHEN home_goals > 0 AND away_goals > 0 THEN 1.0 ELSE 0 END) AS btts,
            AVG(home_yellow + away_yellow + COALESCE(home_red, 0) + COALESCE(away_red, 0)) AS cards,
            AVG(home_corners + away_corners) AS corners,
            AVG(home_sot + away_sot) AS sot,
            AVG(home_shots + away_shots) AS shots
          FROM matches
          WHERE league_code = ? AND status = 'played' AND home_goals IS NOT NULL
            AND kickoff >= datetime('now', '-400 days')`,
    args: [leagueCode],
  });
  const row = res.rows[0];
  if (!row || Number(row.n) === 0) return null;
  return {
    matches: Number(row.n),
    goals: Number(row.goals),
    over15: Number(row.over15),
    over25: Number(row.over25),
    btts: Number(row.btts),
    cards: Number(row.cards),
    corners: Number(row.corners),
    sot: Number(row.sot),
    shots: Number(row.shots),
  };
}

export async function getCounts() {
  const db = getDb();
  const res = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM matches WHERE status = 'played') AS played,
      (SELECT COUNT(*) FROM matches WHERE status = 'scheduled') AS scheduled,
      (SELECT COUNT(*) FROM predictions) AS predictions
  `);
  const row = res.rows[0];
  return {
    played: Number(row?.played ?? 0),
    scheduled: Number(row?.scheduled ?? 0),
    predictions: Number(row?.predictions ?? 0),
  };
}

export type FirstHalfWatchAlert = {
  team: string;
  over: number;
  total: number;
};

export type FirstHalfWatchRow = {
  matchId: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  model: number;
  alerts: FirstHalfWatchAlert[];
};

/**
 * Alerta 1T: el modelo da >=70% a "más de 0.5" pero el equipo falla el
 * primer tiempo en más de la mitad de sus últimos 10 partidos (mínimo 5).
 */
export async function getFirstHalfWatchlist(): Promise<FirstHalfWatchRow[]> {
  const db = getDb();
  const upcoming = await db.execute(`
    SELECT m.id, m.league_code, m.kickoff, m.home_team, m.away_team, p.ht_over05
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    WHERE m.status = 'scheduled' AND p.ht_over05 >= 0.70
    ORDER BY m.kickoff ASC
    LIMIT 200
  `);
  if (upcoming.rows.length === 0) return [];

  const teams = new Set<string>();
  for (const row of upcoming.rows) {
    teams.add(String(row.home_team));
    teams.add(String(row.away_team));
  }

  const teamList = [...teams];
  const placeholders = teamList.map(() => "?").join(",");
  const played = await db.execute({
    sql: `SELECT league_code, kickoff, home_team, away_team, ht_home_goals, ht_away_goals
          FROM matches
          WHERE status = 'played'
            AND ht_home_goals IS NOT NULL AND ht_away_goals IS NOT NULL
            AND (home_team IN (${placeholders}) OR away_team IN (${placeholders}))`,
    args: [...teamList, ...teamList],
  });

  const history = new Map<string, { kickoff: string; over: boolean }[]>();
  for (const row of played.rows) {
    const over = Number(row.ht_home_goals) + Number(row.ht_away_goals) > 0;
    for (const team of [String(row.home_team), String(row.away_team)]) {
      if (!teams.has(team)) continue;
      const key = `${String(row.league_code)}|${team}`;
      const list = history.get(key) ?? [];
      list.push({ kickoff: String(row.kickoff), over });
      history.set(key, list);
    }
  }

  const rows: FirstHalfWatchRow[] = [];
  const seen = new Map<string, string[]>();
  for (const row of upcoming.rows) {
    const kickoff = String(row.kickoff);
    const fixtureKey = `${String(row.league_code)}|${String(row.home_team)}|${String(row.away_team)}`;
    const times = seen.get(fixtureKey) ?? [];
    const duplicate = times.some(
      (time) => Math.abs(Date.parse(kickoff) - Date.parse(time)) < 36 * 3600_000,
    );
    if (duplicate) continue;
    times.push(kickoff);
    seen.set(fixtureKey, times);

    const alerts: FirstHalfWatchAlert[] = [];
    for (const team of [String(row.home_team), String(row.away_team)]) {
      const list = (history.get(`${String(row.league_code)}|${team}`) ?? [])
        .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
        .slice(0, 10);
      if (list.length < 5) continue;
      const over = list.filter((item) => item.over).length;
      if (over / list.length < 0.5) {
        alerts.push({ team, over, total: list.length });
      }
    }
    if (alerts.length === 0) continue;

    rows.push({
      matchId: Number(row.id),
      leagueCode: String(row.league_code),
      kickoff: String(row.kickoff),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      model: Number(row.ht_over05),
      alerts,
    });
  }

  return rows;
}

export type FirstHalfFailureRow = {
  matchId: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  model: number;
  homeRate: { over: number; total: number };
  awayRate: { over: number; total: number };
};

/**
 * Partidos recientes con 70%+ del modelo a "1T más de 0.5" que terminaron
 * 0-0 al descanso. Es una lista de equipos a vigilar, no una recomendación.
 */
export async function getFirstHalfFailures(days = 7): Promise<FirstHalfFailureRow[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);
  const res = await db.execute({
    sql: `SELECT m.id, m.league_code, m.kickoff, m.home_team, m.away_team, p.ht_over05
          FROM matches m JOIN predictions p ON p.match_id = m.id
          WHERE m.ht_home_goals IS NOT NULL AND m.ht_away_goals IS NOT NULL
            AND m.ht_home_goals + m.ht_away_goals = 0
            AND p.ht_over05 >= 0.70
            AND m.kickoff >= ?
          ORDER BY m.kickoff DESC`,
    args: [since],
  });

  const rows: FirstHalfFailureRow[] = [];
  for (const row of res.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const kickoff = String(row.kickoff);

    const rate = async (team: string) => {
      const games = await db.execute({
        sql: `SELECT ht_home_goals, ht_away_goals FROM matches
              WHERE status = 'played' AND kickoff < ?
                AND (home_team = ? OR away_team = ?)
                AND ht_home_goals IS NOT NULL AND ht_away_goals IS NOT NULL
              ORDER BY kickoff DESC LIMIT 10`,
        args: [kickoff, team, team],
      });
      const total = games.rows.length;
      const over = games.rows.filter(
        (game) => Number(game.ht_home_goals) + Number(game.ht_away_goals) >= 1,
      ).length;
      return { over, total };
    };

    rows.push({
      matchId: Number(row.id),
      leagueCode: String(row.league_code),
      kickoff,
      homeTeam: home,
      awayTeam: away,
      model: Number(row.ht_over05),
      homeRate: await rate(home),
      awayRate: await rate(away),
    });
  }

  return rows;
}

export type LastMatchFailureRow = {
  matchId: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  model: number;
  home: { team: string; prevKickoff: string; prevOpponent: string; prevModel: number } | null;
  away: { team: string; prevKickoff: string; prevOpponent: string; prevModel: number } | null;
};

/**
 * Próximos partidos donde un equipo falló el 1T en su partido anterior
 * (0-0 al descanso) y el modelo de aquel partido daba 70% o más.
 * Es solo una marca de observación: no bloquea el aviso.
 */
export async function getLastMatchFailures(days = 30): Promise<LastMatchFailureRow[]> {
  const db = getDb();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 19);

  const upcoming = await db.execute({
    sql: `SELECT m.id, m.league_code, m.kickoff, m.home_team, m.away_team, p.ht_over05
          FROM matches m JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'scheduled' AND m.kickoff >= datetime('now')
          ORDER BY m.kickoff`,
  });
  if (upcoming.rows.length === 0) return [];

  const played = await db.execute({
    sql: `SELECT m.kickoff, m.home_team, m.away_team, m.ht_home_goals, m.ht_away_goals,
                 p.ht_over05
          FROM matches m LEFT JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'played' AND m.kickoff >= ?
            AND m.ht_home_goals IS NOT NULL AND m.ht_away_goals IS NOT NULL
          ORDER BY m.kickoff DESC`,
    args: [since],
  });

  const last = new Map<
    string,
    { kickoff: string; opponent: string; ht: number; model: number }
  >();
  for (const row of played.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const ht = Number(row.ht_home_goals) + Number(row.ht_away_goals);
    const model = Number(row.ht_over05 ?? 0);
    if (!last.has(home)) {
      last.set(home, { kickoff: String(row.kickoff), opponent: away, ht, model });
    }
    if (!last.has(away)) {
      last.set(away, { kickoff: String(row.kickoff), opponent: home, ht, model });
    }
  }

  const rows: LastMatchFailureRow[] = [];
  for (const row of upcoming.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const homeLast = last.get(home);
    const awayLast = last.get(away);

    const homeFailure =
      homeLast && homeLast.ht === 0 && homeLast.model >= 0.7
        ? {
            team: home,
            prevKickoff: homeLast.kickoff,
            prevOpponent: homeLast.opponent,
            prevModel: homeLast.model,
          }
        : null;
    const awayFailure =
      awayLast && awayLast.ht === 0 && awayLast.model >= 0.7
        ? {
            team: away,
            prevKickoff: awayLast.kickoff,
            prevOpponent: awayLast.opponent,
            prevModel: awayLast.model,
          }
        : null;

    if (!homeFailure && !awayFailure) continue;

    rows.push({
      matchId: Number(row.id),
      leagueCode: String(row.league_code),
      kickoff: String(row.kickoff),
      homeTeam: home,
      awayTeam: away,
      model: Number(row.ht_over05),
      home: homeFailure,
      away: awayFailure,
    });
  }

  return rows;
}

export type TodayFailureWatchRow = {
  matchId: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  model: number;
  failures: {
    team: string;
    failedMatchId: number;
    failedKickoff: string;
    failedOpponent: string;
    failedModel: number;
  }[];
};

/**
 * Próximos partidos de los equipos que fallaron el 1T HOY (0-0 al descanso
 * con 70%+ del modelo). Es solo observación: no bloquea los avisos.
 */
export async function getTodayFailureWatchlist(): Promise<TodayFailureWatchRow[]> {
  const db = getDb();
  const today = todayKey();
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 19);

  const failuresRes = await db.execute({
    sql: `SELECT m.id, m.kickoff, m.home_team, m.away_team, p.ht_over05
          FROM matches m JOIN predictions p ON p.match_id = m.id
          WHERE m.ht_home_goals IS NOT NULL AND m.ht_away_goals IS NOT NULL
            AND m.ht_home_goals + m.ht_away_goals = 0
            AND p.ht_over05 >= 0.70
            AND m.kickoff >= ?
          ORDER BY m.kickoff DESC`,
    args: [since],
  });

  const todays = failuresRes.rows.filter(
    (row) => dayKey(String(row.kickoff)) === today,
  );
  if (todays.length === 0) return [];

  const byTeam = new Map<
    string,
    {
      team: string;
      failedMatchId: number;
      failedKickoff: string;
      failedOpponent: string;
      failedModel: number;
    }
  >();
  for (const row of todays) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const failedMatchId = Number(row.id);
    const failedKickoff = String(row.kickoff);
    const failedModel = Number(row.ht_over05);
    byTeam.set(home, { team: home, failedMatchId, failedKickoff, failedOpponent: away, failedModel });
    byTeam.set(away, { team: away, failedMatchId, failedKickoff, failedOpponent: home, failedModel });
  }

  const upcoming = await db.execute({
    sql: `SELECT m.id, m.league_code, m.kickoff, m.home_team, m.away_team, p.ht_over05
          FROM matches m JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'scheduled' AND m.kickoff > datetime('now')
          ORDER BY m.kickoff`,
  });

  const rows: TodayFailureWatchRow[] = [];
  for (const row of upcoming.rows) {
    const home = String(row.home_team);
    const away = String(row.away_team);
    const homeFailure = byTeam.get(home);
    const awayFailure = byTeam.get(away);
    if (!homeFailure && !awayFailure) continue;

    const failures = [homeFailure, awayFailure].filter(
      (failure): failure is NonNullable<typeof failure> => Boolean(failure),
    );
    if (failures.some((failure) => failure.failedMatchId === Number(row.id))) continue;

    rows.push({
      matchId: Number(row.id),
      leagueCode: String(row.league_code),
      kickoff: String(row.kickoff),
      homeTeam: home,
      awayTeam: away,
      model: Number(row.ht_over05),
      failures,
    });
  }

  return rows;
}

export type TeamHalfLabel = {
  lastZero: boolean;
  lastHT: number | null;
  streak: boolean;
  rate: number;
  over: number;
  total: number;
  lastKickoff: string | null;
};

/**
 * Etiquetas informativas de 1T por equipo: si viene de un 0-0 al descanso
 * y su racha de los últimos 10. No modifica ninguna probabilidad.
 */
export async function getTeamHalfLabels(
  teams: string[],
): Promise<Map<string, TeamHalfLabel>> {
  const db = getDb();
  const unique = [...new Set(teams)];
  if (unique.length === 0) return new Map();

  const since = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 19);
  const res = await db.execute({
    sql: `SELECT home_team, away_team, ht_home_goals, ht_away_goals, kickoff
          FROM matches
          WHERE status = 'played' AND ht_home_goals IS NOT NULL AND ht_away_goals IS NOT NULL
            AND kickoff >= ?
          ORDER BY kickoff DESC`,
    args: [since],
  });

  const wanted = new Set(unique);
  const history = new Map<string, { kickoff: string; ht: number }[]>();
  for (const row of res.rows) {
    const ht = Number(row.ht_home_goals) + Number(row.ht_away_goals);
    for (const team of [String(row.home_team), String(row.away_team)]) {
      if (!wanted.has(team)) continue;
      const list = history.get(team) ?? [];
      if (list.length < 10) {
        list.push({ kickoff: String(row.kickoff), ht });
        history.set(team, list);
      }
    }
  }

  const labels = new Map<string, TeamHalfLabel>();
  for (const team of unique) {
    const list = history.get(team) ?? [];
    const total = list.length;
    const over = list.filter((game) => game.ht >= 1).length;
    const rate = total > 0 ? over / total : 0;
    labels.set(team, {
      lastZero: total > 0 && list[0].ht === 0,
      lastHT: total > 0 ? list[0].ht : null,
      streak: total >= 5 && rate < 0.5,
      rate,
      over,
      total,
      lastKickoff: list[0]?.kickoff ?? null,
    });
  }

  return labels;
}

export type SentFirstHalfAlert = {
  matchId: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  model: number | null;
  kinds: string[];
  sentAt: string;
};

/** Avisos de 1T enviados hoy al Discord (inicio, 30 min o 10 min). */
export async function getSentFirstHalfAlerts(): Promise<SentFirstHalfAlert[]> {
  const db = getDb();
  const today = todayKey();
  const res = await db.execute({
    sql: `SELECT n.match_id, n.kind, n.sent_at, m.league_code, m.kickoff,
                 m.home_team, m.away_team, p.ht_over05
          FROM notifications_sent n
          JOIN matches m ON m.id = n.match_id
          LEFT JOIN predictions p ON p.match_id = m.id
          WHERE n.kind IN ('first-half-startup', 'first-half-pre30', 'first-half-pre10')
            AND m.status != 'played'
            AND m.kickoff >= datetime('now', '-2.25 hours')
          ORDER BY m.kickoff, n.sent_at DESC`,
  });

  const byMatch = new Map<number, SentFirstHalfAlert>();
  for (const row of res.rows) {
    if (dayKey(String(row.kickoff)) !== today) continue;
    const id = Number(row.match_id);
    const kind = String(row.kind);
    const current = byMatch.get(id);
    if (current) {
      if (!current.kinds.includes(kind)) current.kinds.push(kind);
      if (String(row.sent_at) > current.sentAt) current.sentAt = String(row.sent_at);
      continue;
    }
    byMatch.set(id, {
      matchId: id,
      leagueCode: String(row.league_code),
      kickoff: String(row.kickoff),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
      model: row.ht_over05 === null ? null : Number(row.ht_over05),
      kinds: [kind],
      sentAt: String(row.sent_at),
    });
  }

  return [...byMatch.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
