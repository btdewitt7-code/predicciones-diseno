import { ensureSchema, getDb, setMeta } from "../src/lib/db";
import { decodeCsv, parseCsv, seasonOf, toFloat, toInt, toKickoff } from "../src/lib/csv";
import { LEAGUES, LEAGUE_BY_CODE, type League } from "../src/lib/leagues";

/** `--league=NOR` limita la ingesta a una sola liga. */
const ONLY_LEAGUE = process.argv
  .find((arg) => arg.startsWith("--league="))
  ?.split("=")[1]
  ?.toUpperCase();

const SCOPE: League[] =
  ONLY_LEAGUE ? LEAGUES.filter((league) => league.code === ONLY_LEAGUE) : LEAGUES;
import { zonedToUtc } from "../src/lib/time";
import { storeGoalEvents, type GoalKeyEvent } from "../src/lib/goalEvents";
import { storeCardEvents } from "../src/lib/cards";

/** Códigos de temporada tipo "2627" (los últimos N cursos). */
function seasonCodes(count: number): string[] {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const startYear = month >= 7 ? year : year - 1;
  return Array.from({ length: count }, (_, index) => {
    const start = startYear - index;
    return `${String(start).slice(2)}${String(start + 1).slice(2)}`;
  });
}

const SEASONS = seasonCodes(5);
const CURRENT_SEASON = seasonCodes(1)[0];
const BASE = "https://www.football-data.co.uk/mmz4281";
const EXTRA_BASE = "https://www.football-data.co.uk/new";

type Stmt = { sql: string; args: (string | number | null)[] };

async function fetchCsv(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "predicciones-personal/1.0" } });
    if (!res.ok) return null;
    return decodeCsv(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function indexOf(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, index) => map.set(name.trim(), index));
  return map;
}

const INSERT_SQL = `INSERT INTO matches (
  league_code, season, kickoff, home_team, away_team,
  home_goals, away_goals, ht_home_goals, ht_away_goals, home_shots, away_shots, home_sot, away_sot,
  home_corners, away_corners, home_fouls, away_fouls, home_yellow, away_yellow,
  home_red, away_red, referee, odds_home, odds_draw, odds_away, odds_over25,
  odds_under25, close_home, close_draw, close_away, status
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(league_code, kickoff, home_team, away_team) DO UPDATE SET
  home_goals = COALESCE(excluded.home_goals, matches.home_goals),
  away_goals = COALESCE(excluded.away_goals, matches.away_goals),
  ht_home_goals = COALESCE(excluded.ht_home_goals, matches.ht_home_goals),
  ht_away_goals = COALESCE(excluded.ht_away_goals, matches.ht_away_goals),
  home_shots = COALESCE(excluded.home_shots, matches.home_shots),
  away_shots = COALESCE(excluded.away_shots, matches.away_shots),
  home_sot = COALESCE(excluded.home_sot, matches.home_sot),
  away_sot = COALESCE(excluded.away_sot, matches.away_sot),
  home_corners = COALESCE(excluded.home_corners, matches.home_corners),
  away_corners = COALESCE(excluded.away_corners, matches.away_corners),
  home_fouls = COALESCE(excluded.home_fouls, matches.home_fouls),
  away_fouls = COALESCE(excluded.away_fouls, matches.away_fouls),
  home_yellow = COALESCE(excluded.home_yellow, matches.home_yellow),
  away_yellow = COALESCE(excluded.away_yellow, matches.away_yellow),
  home_red = COALESCE(excluded.home_red, matches.home_red),
  away_red = COALESCE(excluded.away_red, matches.away_red),
  referee = COALESCE(excluded.referee, matches.referee),
  odds_home = COALESCE(excluded.odds_home, matches.odds_home),
  odds_draw = COALESCE(excluded.odds_draw, matches.odds_draw),
  odds_away = COALESCE(excluded.odds_away, matches.odds_away),
  odds_over25 = COALESCE(excluded.odds_over25, matches.odds_over25),
  odds_under25 = COALESCE(excluded.odds_under25, matches.odds_under25),
  close_home = COALESCE(excluded.close_home, matches.close_home),
  close_draw = COALESCE(excluded.close_draw, matches.close_draw),
  close_away = COALESCE(excluded.close_away, matches.close_away),
  status = CASE WHEN matches.status = 'played' THEN 'played' ELSE excluded.status END`;

function rowToStatement(
  league: League,
  cells: string[],
  idx: Map<string, number>,
  status: "played" | "scheduled",
  seasonOverride?: string,
): Stmt | null {
  const at = (name: string) => {
    const i = idx.get(name);
    return i === undefined ? undefined : cells[i];
  };

  const localKickoff = toKickoff(at("Date") ?? "", at("Time"));
  const kickoff = localKickoff
    ? zonedToUtc(localKickoff, league.sourceTimeZone ?? "Europe/London")
    : null;
  const homeTeam = (at("HomeTeam") ?? "").trim();
  const awayTeam = (at("AwayTeam") ?? "").trim();
  if (!kickoff || !homeTeam || !awayTeam) return null;

  const homeGoals = toInt(at("FTHG"));
  const awayGoals = toInt(at("FTAG"));
  if (status === "played" && (homeGoals === null || awayGoals === null)) return null;

  const args: (string | number | null)[] = [
    league.code,
    seasonOverride ?? seasonOf(kickoff),
    kickoff,
    homeTeam,
    awayTeam,
    status === "played" ? homeGoals : null,
    status === "played" ? awayGoals : null,
    toInt(at("HTHG")),
    toInt(at("HTAG")),
    toInt(at("HS")),
    toInt(at("AS")),
    toInt(at("HST")),
    toInt(at("AST")),
    toInt(at("HC")),
    toInt(at("AC")),
    toInt(at("HF")),
    toInt(at("AF")),
    toInt(at("HY")),
    toInt(at("AY")),
    toInt(at("HR")),
    toInt(at("AR")),
    (at("Referee") ?? "").trim() || null,
    toFloat(at("AvgH")) ?? toFloat(at("B365H")),
    toFloat(at("AvgD")) ?? toFloat(at("B365D")),
    toFloat(at("AvgA")) ?? toFloat(at("B365A")),
    toFloat(at("Avg>2.5")) ?? toFloat(at("B365>2.5")),
    toFloat(at("Avg<2.5")) ?? toFloat(at("B365<2.5")),
    toFloat(at("AvgCH")) ?? toFloat(at("B365CH")) ?? toFloat(at("PSCH")),
    toFloat(at("AvgCD")) ?? toFloat(at("B365CD")) ?? toFloat(at("PSCD")),
    toFloat(at("AvgCA")) ?? toFloat(at("B365CA")) ?? toFloat(at("PSCA")),
    status,
  ];

  return { sql: INSERT_SQL, args };
}

/** Ligas "extra": resultados y cuotas de cierre, sin estadísticas de partido. */
function extraRowToStatement(
  league: League,
  cells: string[],
  idx: Map<string, number>,
): Stmt | null {
  const at = (name: string) => {
    const i = idx.get(name);
    return i === undefined ? undefined : cells[i];
  };

  const localKickoff = toKickoff(at("Date") ?? "", at("Time"));
  const kickoff = localKickoff
    ? zonedToUtc(localKickoff, league.sourceTimeZone ?? "Europe/London")
    : null;
  const homeTeam = (at("Home") ?? "").trim();
  const awayTeam = (at("Away") ?? "").trim();
  const homeGoals = toInt(at("HG"));
  const awayGoals = toInt(at("AG"));
  if (!kickoff || !homeTeam || !awayTeam || homeGoals === null || awayGoals === null) return null;

  const season = league.calendarSeason
    ? (at("Season") ?? kickoff.slice(0, 4)).trim()
    : seasonOf(kickoff);

  const closeHome = toFloat(at("AvgCH")) ?? toFloat(at("B365CH")) ?? toFloat(at("PSCH"));
  const closeDraw = toFloat(at("AvgCD")) ?? toFloat(at("B365CD")) ?? toFloat(at("PSCD"));
  const closeAway = toFloat(at("AvgCA")) ?? toFloat(at("B365CA")) ?? toFloat(at("PSCA"));

  return {
    sql: INSERT_SQL,
    args: [
      league.code,
      season,
      kickoff,
      homeTeam,
      awayTeam,
      homeGoals,
      awayGoals,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      closeHome,
      closeDraw,
      closeAway,
      null,
      null,
      closeHome,
      closeDraw,
      closeAway,
      "played",
    ],
  };
}

async function flush(statements: Stmt[]) {
  const db = getDb();
  const chunkSize = 400;
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize), "write");
  }
}

/** ESPN a veces devuelve "2026-11-01T16:00Z": lo pasamos a "2026-11-01T16:00:00". */
function normalizeKickoff(value: string): string {
  const base = value.replace(/Z$/i, "").slice(0, 19);
  return base.length === 16 ? `${base}:00` : base;
}

type EspnEvent = {
  id?: string;
  date?: string;
  competitions?: {
    status?: {
      type?: { state?: string; completed?: boolean; description?: string };
      displayClock?: string;
      clock?: number;
    };
    competitors?: {
      homeAway?: string;
      score?: string;
      team?: { id?: string; displayName?: string };
    }[];
  }[];
};

/** ESPN solo devuelve datos consultando día a día, no por rango. */
async function espnScoreboard(slug: string, date: string): Promise<EspnEvent[]> {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date}`,
      { headers: { "User-Agent": "predicciones-personal/1.0" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: EspnEvent[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

async function mapPool<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Histórico reconstruido desde ESPN para ligas sin CSV (Perú). */
async function ingestEspnHistory(league: League): Promise<number> {
  const days = league.espnHistoryDays ?? 0;
  if (!days || !league.espnSlug) return 0;

  const now = Date.now();
  const dates: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dates.push(new Date(now - offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""));
  }

  const dailyEvents = await mapPool(dates, 4, (date) => espnScoreboard(league.espnSlug!, date));
  const statements: Stmt[] = [];

  for (const events of dailyEvents) {
    for (const event of events) {
      const competition = event.competitions?.[0];
      if (competition?.status?.type?.state !== "post") continue;
      const historyStatus = competition.status?.type;
      if (
        historyStatus?.completed === false ||
        /postponed|cancel|abandon|suspend/i.test(historyStatus?.description ?? "")
      ) {
        continue;
      }

      const homeSide = competition.competitors?.find((c) => c.homeAway === "home");
      const awaySide = competition.competitors?.find((c) => c.homeAway === "away");
      const homeTeam = homeSide?.team?.displayName;
      const awayTeam = awaySide?.team?.displayName;
      const homeGoals = Number(homeSide?.score);
      const awayGoals = Number(awaySide?.score);
      if (
        !homeTeam ||
        !awayTeam ||
        !Number.isFinite(homeGoals) ||
        !Number.isFinite(awayGoals) ||
        !event.date
      ) {
        continue;
      }

      const kickoff = normalizeKickoff(event.date);
      const season = league.calendarSeason ? kickoff.slice(0, 4) : seasonOf(kickoff);

      statements.push({
        sql: INSERT_SQL,
        args: [
          league.code,
          season,
          kickoff,
          homeTeam,
          awayTeam,
          homeGoals,
          awayGoals,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          "played",
        ],
      });
    }
  }

  if (statements.length > 0) await flush(statements);
  return statements.length;
}

async function ingestHistory() {
  let total = 0;
  let files = 0;
  const historyLeagues = SCOPE.filter((league) => !league.extraFile);

  for (const league of historyLeagues) {
    for (const season of SEASONS) {
      const text = await fetchCsv(`${BASE}/${season}/${league.code}.csv`);
      if (!text) continue;

      const rows = parseCsv(text);
      if (rows.length < 2) continue;
      const idx = indexOf(rows[0]);

      const statements: Stmt[] = [];
      for (const cells of rows.slice(1)) {
        const statement = rowToStatement(league, cells, idx, "played");
        if (statement) statements.push(statement);
      }

      await flush(statements);
      total += statements.length;
      files++;
      process.stdout.write(`  ${league.code} ${season}: ${statements.length} partidos\n`);
    }
  }

  for (const league of SCOPE.filter((item) => item.extraFile)) {
    const text = await fetchCsv(`${EXTRA_BASE}/${league.extraFile}.csv`);
    if (!text) continue;

    const rows = parseCsv(text);
    if (rows.length < 2) continue;
    const idx = indexOf(rows[0]);

    const statements: Stmt[] = [];
    for (const cells of rows.slice(1)) {
      const statement = extraRowToStatement(league, cells, idx);
      if (statement) statements.push(statement);
    }

    await flush(statements);
    total += statements.length;
    files++;
    console.log(`  ${league.code} histórico: ${statements.length} partidos`);
  }

  for (const league of SCOPE.filter((item) => item.espnHistoryDays)) {
    const inserted = await ingestEspnHistory(league);
    if (inserted > 0) {
      total += inserted;
      files++;
      console.log(`  ${league.code} (ESPN): ${inserted} partidos históricos`);
    }
  }

  console.log(`Histórico: ${total} partidos de ${files} archivos`);
}

const ALIASES: Record<string, string> = {
  // MLS
  "la galaxy": "los angeles galaxy",
  lafc: "los angeles fc",
  "red bull new york": "new york red bulls",
  // Argentina
  "estudiantes de la plata": "estudiantes lp",
  "instituto cordoba": "instituto",
  "belgrano cordoba": "belgrano",
  "central cordoba santiago del estero": "central cordoba",
  "atletico tucuman": "atl tucuman",
  "argentinos juniors": "argentinos jrs",
  "independiente rivadavia": "ind rivadavia",
  "gimnasia la plata": "gimnasia lp",
  "defensa y justicia": "defensa y justicia",
  "deportivo riestra": "dep riestra",
  // Perú
  "adc juan pablo ii college": "juan pablo ii",
  "juan pablo ii college": "juan pablo ii",
  // Brasil
  "red bull bragantino": "bragantino",
  chapecoense: "chapecoense sc",
  "vasco da gama": "vasco",
  flamengo: "flamengo rj",
  botafogo: "botafogo rj",
  "atletico mineiro": "atletico mg",
  "athletico paranaense": "athletico pr",
  "atletico goianiense": "atletico go",
  // México
  "atletico de san luis": "atl san luis",
  "atletico san luis": "atl san luis",
  santos: "santos laguna",
  guadalajara: "guadalajara chivas",
  // Dinamarca
  "ac horsens": "horsens",
  agf: "aarhus",
  "brondby if": "brondby",
  "fc kobenhavn": "fc copenhagen",
  "fc midtjylland": "midtjylland",
  "fc nordsjaelland": "nordsjaelland",
  "lyngby boldklub": "lyngby",
  "odense boldklub": "odense",
  "silkeborg if": "silkeborg",
  "sonderjyske fodbold": "sonderjyske",
  "viborg ff": "viborg",
  "kaa gent": "gent",
  // Copas: nombres ESPN -> nombres de liga
  "aek athens": "aek",
  "olympiacos": "olympiakos",
  "as monaco": "monaco",
  "ajax amsterdam": "ajax",
  "feyenoord rotterdam": "feyenoord",
  braga: "sp braga",
  "celta vigo": "celta",
  "rayo vallecano": "vallecano",
  "brighton hove albion": "brighton",
  "tsg hoffenheim": "hoffenheim",
  "racing genk": "genk",
  "union st gilloise": "st gilloise",
  "nec nijmegen": "nijmegen",
  "heart of midlothian": "hearts",
  "rb salzburg": "salzburg",
  "sk sturm graz": "sturm graz",
  "fc basel": "basel",
  "fc lugano": "lugano",
  "fc thun": "thun",
  "lausanne sports": "lausanne",
  "bk hacken": "hacken",
  "mjallby aif": "mjallby",
  // Suecia
  "kalmar ff": "kalmar",
  "ik sirius": "sirius",
  "halmstads bk": "halmstad",
  "hammarby if": "hammarby",
  "if elfsborg": "elfsborg",
  "degerfors if": "degerfors",
  "orgryte is": "orgryte",
  "ifk goteborg": "goteborg",
  "djurgardens if": "djurgarden",
  "if brommapojkarna": "brommapojkarna",
  "osters if": "oster",
  // Austria
  "rapid vienna": "sk rapid",
  "austria lustenau": "a lustenau",
  "sv josko ried": "ried",
  "lask linz": "lask",
  "tsv hartberg": "hartberg",
  "sc rheindorf altach": "altach",
  "wsg swarovski tirol": "tirol",
  "blau weiss linz": "bw linz",
  // Suiza
  "grasshopper zurich": "grasshoppers",
  "fc zurich": "zurich",
  "fc st gallen": "st gallen",
  "fc sion": "sion",
  "fc luzern": "luzern",
  "fc vaduz": "vaduz",
  "fc winterthur": "winterthur",
  // Bundesliga
  "fc cologne": "fc koln",
  "bayer leverkusen": "leverkusen",
  "1 fc union berlin": "union berlin",
  "fc union berlin": "union berlin",
  "sc paderborn 07": "paderborn",
  "borussia monchengladbach": "mgladbach",
  "borussia dortmund": "dortmund",
  "eintracht frankfurt": "ein frankfurt",
  "sv elversberg": "elversberg",
  "mainz 05": "mainz",
  "fc augsburg": "augsburg",
  "sc freiburg": "freiburg",
  "vfb stuttgart": "stuttgart",
  "hamburger sv": "hamburg",
  "hamburg sv": "hamburg",
  "fc schalke 04": "schalke 04",
  "werder bremen": "werder bremen",
  // LaLiga
  "atletico madrid": "ath madrid",
  "athletic club": "ath bilbao",
  "real sociedad": "sociedad",
  "real betis": "betis",
  "deportivo alaves": "alaves",
  "espanyol barcelona": "espanol",
  "espanyol": "espanol",
  "real oviedo": "oviedo",
  "racing santander": "santander",
  "deportivo la coruna": "la coruna",
  "deportivo": "la coruna",
};

function normalizeTeam(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/['.]/g, "")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const aliased = ALIASES[base] ?? base;
  return aliased
    .split(" ")
    .filter(Boolean)
    .map((token) => (token === "utd" ? "united" : token))
    .filter((token) => !["fc", "cf", "sc", "ac", "afc", "club"].includes(token))
    .join(" ");
}

function similarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

async function knownTeams(leagueCode: string): Promise<string[]> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT DISTINCT home_team AS team FROM matches WHERE league_code = ?
          UNION
          SELECT DISTINCT away_team AS team FROM matches WHERE league_code = ?`,
    args: [leagueCode, leagueCode],
  });
  return res.rows.map((row) => String(row.team));
}

function matchTeam(name: string, known: string[]): string | null {
  const target = normalizeTeam(name);
  let best: string | null = null;
  let bestScore = 0;
  for (const candidate of known) {
    const score = similarity(target, normalizeTeam(candidate));
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore >= 0.7 ? best : null;
}

/** Próximos partidos desde ESPN para cualquier liga con slug (CSV incluido). */
async function ingestEspnFixtures() {
  // El CSV de football-data a veces viene atrasado o sin algunas ligas:
  // ESPN cubre el hueco para todas las competiciones con slug.
  const leagues = SCOPE.filter((league) => league.espnSlug);
  if (leagues.length === 0) return;

  const now = Date.now();
  const dates: string[] = [];
  for (let offset = 0; offset <= 14; offset += 1) {
    dates.push(new Date(now + offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""));
  }

  for (const league of leagues) {
    try {
      const known = await knownTeams(league.code);
      const dailyEvents = await mapPool(dates, 4, (date) => espnScoreboard(league.espnSlug!, date));
      const statements: Stmt[] = [];
      const unmatched: string[] = [];
      const liveScores: {
        kickoff: string;
        home: string;
        away: string;
        homeGoals: number;
        awayGoals: number;
        clock: string | null;
      }[] = [];

      for (const event of dailyEvents.flat()) {
        const competition = event.competitions?.[0];
        if (!competition) continue;
        const statusType = competition.status?.type;
        const state = statusType?.state;
        if (state !== "pre" && state !== "in" && state !== "post") continue;

        // ESPN usa state "post" también para aplazados/suspendidos: no son resultados.
        const abnormal = /postponed|cancel|abandon|suspend/i.test(statusType?.description ?? "");
        if (abnormal || (state === "post" && statusType?.completed === false)) continue;

        const homeSide = competition.competitors?.find((c) => c.homeAway === "home");
        const awaySide = competition.competitors?.find((c) => c.homeAway === "away");
        const homeName = homeSide?.team?.displayName ?? "";
        const awayName = awaySide?.team?.displayName ?? "";
        if (!homeName || !awayName || !event.date) continue;

        const isPost = state === "post";
        const homeGoals = isPost && Number.isFinite(Number(homeSide?.score)) ? Number(homeSide?.score) : null;
        const awayGoals = isPost && Number.isFinite(Number(awaySide?.score)) ? Number(awaySide?.score) : null;

        const home = matchTeam(homeName, known);
        const away = matchTeam(awayName, known);
        if (!home || !away) {
          if (!home) unmatched.push(homeName);
          if (!away) unmatched.push(awayName);
          continue;
        }

        const kickoff = normalizeKickoff(event.date);
        const season = league.calendarSeason
          ? kickoff.slice(0, 4)
          : seasonOf(kickoff);

        if (state === "in") {
          liveScores.push({
            kickoff,
            home,
            away,
            homeGoals: Number(homeSide?.score) || 0,
            awayGoals: Number(awaySide?.score) || 0,
            clock: competition.status?.displayClock ?? null,
          });
        }

        statements.push({
          sql: INSERT_SQL,
          args: [
            league.code,
            season,
            kickoff,
            home,
            away,
            homeGoals,
            awayGoals,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            isPost ? "played" : "scheduled",
          ],
        });
      }

      if (statements.length > 0) await flush(statements);

      const db = getDb();
      for (const live of liveScores) {
        const found = await db.execute({
          sql: `SELECT id FROM matches WHERE league_code = ? AND kickoff = ? AND home_team = ? AND away_team = ?`,
          args: [league.code, live.kickoff, live.home, live.away],
        });
        const matchId = found.rows[0]?.id;
        if (!matchId) continue;

        await db.execute({
          sql: `INSERT INTO live_scores (match_id, home_goals, away_goals, clock, updated_at)
                VALUES (?,?,?,?,?)
                ON CONFLICT(match_id) DO UPDATE SET
                  home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
                  clock = excluded.clock,
                  updated_at = excluded.updated_at`,
          args: [
            Number(matchId),
            live.homeGoals,
            live.awayGoals,
            live.clock,
            new Date().toISOString(),
          ],
        });
      }

      console.log(`  ${league.code} (ESPN): ${statements.length} partidos actualizados`);
      if (unmatched.length > 0) {
        console.log(`    sin emparejar (${unmatched.length}): ${[...new Set(unmatched)].slice(0, 8).join(" | ")}`);
      }
    } catch {
      console.log(`  ${league.code} (ESPN): sin datos`);
    }
  }
}

/** Resultados recientes: solo la temporada en curso de las ligas europeas. */
async function ingestRecentResults() {
  let updated = 0;

  for (const league of SCOPE.filter((item) => !item.extraFile && !item.espnHistoryDays)) {
    const text = await fetchCsv(`${BASE}/${CURRENT_SEASON}/${league.code}.csv`);
    if (!text) continue;

    const rows = parseCsv(text);
    if (rows.length < 2) continue;
    const idx = indexOf(rows[0]);

    const statements: Stmt[] = [];
    for (const cells of rows.slice(1)) {
      const statement = rowToStatement(league, cells, idx, "played");
      if (statement) statements.push(statement);
    }

    if (statements.length > 0) await flush(statements);
    updated += statements.length;
  }

  console.log(`  Resultados ${CURRENT_SEASON}: ${updated} partidos revisados`);
}

type EspnBoxTeam = {
  team?: { id?: string };
  statistics?: { name?: string; displayValue?: string }[];
};

function espnStat(box: EspnBoxTeam | undefined, name: string): number | null {
  const found = (box?.statistics ?? []).find((stat) => stat.name === name);
  const value = Number(found?.displayValue);
  return Number.isFinite(value) ? value : null;
}

/** Resultado y estadísticas de partidos pendientes, desde ESPN.
 *  Empareja por equipos en una ventana amplia para cubrir cambios de fecha. */
async function ingestEspnResults() {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, league_code, kickoff, home_team, away_team
          FROM matches
          WHERE status = 'scheduled'
            AND kickoff < datetime('now')
            AND kickoff >= datetime('now', '-7 days')`,
  });

  type PendingMatch = {
    id: number;
    kickoff: string;
    homeTeam: string;
    awayTeam: string;
  };
  const byLeague = new Map<string, PendingMatch[]>();
  for (const row of res.rows) {
    const leagueCode = String(row.league_code);
    const list = byLeague.get(leagueCode) ?? [];
    list.push({
      id: Number(row.id),
      kickoff: String(row.kickoff),
      homeTeam: String(row.home_team),
      awayTeam: String(row.away_team),
    });
    byLeague.set(leagueCode, list);
  }

  let updated = 0;
  let postponed = 0;

  for (const [leagueCode, pending] of byLeague) {
    const league = LEAGUE_BY_CODE[leagueCode];
    if (!league?.espnSlug) continue;

    // La fecha guardada puede venir desfasada: se revisan días alrededor.
    const dates = new Set<string>();
    for (const match of pending) {
      const base = Date.parse(`${match.kickoff}Z`);
      if (!Number.isFinite(base)) continue;
      for (const offset of [-1, 0, 1, 2]) {
        dates.add(
          new Date(base + offset * 86_400_000).toISOString().slice(0, 10).replace(/-/g, ""),
        );
      }
    }

    for (const date of dates) {
      const events = await espnScoreboard(league.espnSlug, date);

      for (const event of events) {
        const competition = event.competitions?.[0];
        const resultType = competition?.status?.type;
        if (!competition || !event.id || !event.date) continue;

        const isPostponed = /postponed|cancel|abandon|suspend/i.test(
          resultType?.description ?? "",
        );
        if (!isPostponed && resultType?.state !== "post") continue;
        if (!isPostponed && resultType?.completed === false) continue;

        const kickoff = normalizeKickoff(event.date);
        const kickoffMs = Date.parse(`${kickoff}Z`);

        const homeSide = competition.competitors?.find((c) => c.homeAway === "home");
        const awaySide = competition.competitors?.find((c) => c.homeAway === "away");
        const homeName = homeSide?.team?.displayName ?? "";
        const awayName = awaySide?.team?.displayName ?? "";

        // Se empareja por equipos en una ventana amplia: un partido aplazado
        // puede haberse jugado 1-2 días después de la fecha guardada.
        const best = pending
          .map((match) => {
            const gap = Math.abs(Date.parse(`${match.kickoff}Z`) - kickoffMs);
            return {
              match,
              gap,
              score:
                similarity(normalizeTeam(homeName), normalizeTeam(match.homeTeam)) +
                similarity(normalizeTeam(awayName), normalizeTeam(match.awayTeam)),
            };
          })
          .filter((candidate) => candidate.score >= 1.3 && candidate.gap <= 48 * 3600_000)
          .sort((a, b) => b.score - a.score || a.gap - b.gap)[0];

        if (!best) continue;

        if (isPostponed) {
          await db.execute({
            sql: `UPDATE matches SET status = 'postponed' WHERE id = ?`,
            args: [best.match.id],
          });
          pending.splice(pending.indexOf(best.match), 1);
          postponed += 1;
          continue;
        }

        const summaryRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espnSlug}/summary?event=${event.id}`,
          { headers: { "User-Agent": "predicciones-personal/1.0" } },
        );
        if (!summaryRes.ok) continue;

        const summary = (await summaryRes.json()) as {
          boxscore?: { teams?: EspnBoxTeam[] };
          header?: {
            competitions?: {
              competitors?: {
                homeAway?: string;
                linescores?: { displayValue?: string }[];
              }[];
            }[];
          };
          keyEvents?: GoalKeyEvent[];
        };
        const boxes = summary.boxscore?.teams ?? [];
        const homeBox = boxes.find((box) => String(box.team?.id) === String(homeSide?.team?.id));
        const awayBox = boxes.find((box) => String(box.team?.id) === String(awaySide?.team?.id));
        if (!homeBox || !awayBox) continue;

        const homeGoals = Number(homeSide?.score);
        const awayGoals = Number(awaySide?.score);
        if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;

        const headerCompetitors = summary.header?.competitions?.[0]?.competitors ?? [];
        const htHomeRaw = headerCompetitors.find((c) => c.homeAway === "home")?.linescores?.[0]?.displayValue;
        const htAwayRaw = headerCompetitors.find((c) => c.homeAway === "away")?.linescores?.[0]?.displayValue;
        const htHome = htHomeRaw !== undefined && Number.isFinite(Number(htHomeRaw)) ? Number(htHomeRaw) : null;
        const htAway = htAwayRaw !== undefined && Number.isFinite(Number(htAwayRaw)) ? Number(htAwayRaw) : null;

        // Si ya existe otra fila con la fecha corregida, no se toca la clave
        // única: se cierra esta fila con su fecha original.
        const duplicate = await db.execute({
          sql: `SELECT 1 AS ok FROM matches
                WHERE league_code = ? AND kickoff = ? AND home_team = ? AND away_team = ?
                  AND id != ? LIMIT 1`,
          args: [leagueCode, kickoff, best.match.homeTeam, best.match.awayTeam, best.match.id],
        });
        const targetKickoff = duplicate.rows.length > 0 ? best.match.kickoff : kickoff;

        await db.execute({
          sql: `UPDATE matches SET
                  kickoff = ?,
                  home_goals = ?, away_goals = ?,
                  ht_home_goals = COALESCE(?, ht_home_goals),
                  ht_away_goals = COALESCE(?, ht_away_goals),
                  home_shots = ?, away_shots = ?,
                  home_sot = ?, away_sot = ?,
                  home_corners = ?, away_corners = ?,
                  home_fouls = ?, away_fouls = ?,
                  home_yellow = ?, away_yellow = ?,
                  home_red = ?, away_red = ?,
                  status = 'played'
                WHERE id = ?`,
          args: [
            targetKickoff,
            homeGoals,
            awayGoals,
            htHome,
            htAway,
            espnStat(homeBox, "totalShots"),
            espnStat(awayBox, "totalShots"),
            espnStat(homeBox, "shotsOnTarget"),
            espnStat(awayBox, "shotsOnTarget"),
            espnStat(homeBox, "wonCorners"),
            espnStat(awayBox, "wonCorners"),
            espnStat(homeBox, "foulsCommitted"),
            espnStat(awayBox, "foulsCommitted"),
            espnStat(homeBox, "yellowCards"),
            espnStat(awayBox, "yellowCards"),
            espnStat(homeBox, "redCards"),
            espnStat(awayBox, "redCards"),
            best.match.id,
          ],
        });
        await db.execute({
          sql: `DELETE FROM live_scores WHERE match_id = ?`,
          args: [best.match.id],
        });

        await storeGoalEvents(
          db,
          best.match.id,
          best.match.homeTeam,
          best.match.awayTeam,
          summary.keyEvents,
        );
        await storeCardEvents(
          db,
          best.match.id,
          best.match.homeTeam,
          best.match.awayTeam,
          summary.keyEvents,
        );

        pending.splice(pending.indexOf(best.match), 1);
        updated += 1;
      }
    }
  }

  if (updated > 0 || postponed > 0) {
    console.log(
      `  ESPN resultados: ${updated} partidos cerrados${postponed > 0 ? `, ${postponed} aplazados` : ""}`,
    );
  }
}

async function ingestFixtures() {
  const text = await fetchCsv("https://www.football-data.co.uk/fixtures.csv");
  if (!text) {
    console.log("No se pudo descargar fixtures.csv");
    return;
  }

  const rows = parseCsv(text);
  const idx = indexOf(rows[0]);
  const codes = new Set(SCOPE.filter((league) => !league.extraFile).map((l) => l.code));

  const statements: Stmt[] = [];
  for (const cells of rows.slice(1)) {
    const div = (cells[idx.get("Div") ?? -1] ?? "").trim();
    if (!codes.has(div)) continue;
    const league = LEAGUE_BY_CODE[div];
    if (!league) continue;
    const statement = rowToStatement(league, cells, idx, "scheduled");
    if (statement) statements.push(statement);
  }

  const db = getDb();
  // No borrar partidos recientes sin resultado: el sincronizador de ESPN
  // puede cerrarlos 1-2 días después por cambios de fecha.
  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 19);
  await db.execute({
    sql: `DELETE FROM matches WHERE status = 'scheduled' AND kickoff < ?`,
    args: [staleBefore],
  });

  await flush(statements);
  console.log(`Próximos: ${statements.length} partidos programados`);
  await ingestEspnFixtures();
  await ingestEspnResults();
}

async function main() {
  const fixturesOnly = process.argv.includes("--fixtures-only");
  console.log(
    fixturesOnly
      ? "Actualizando solo próximos partidos…\n"
      : "Descargando datos de football-data.co.uk…\n",
  );
  await ensureSchema();
  if (fixturesOnly) {
    await ingestRecentResults();
  } else {
    await ingestHistory();
    console.log("");
  }
  await ingestFixtures();
  await setMeta("ingested_at", new Date().toISOString());

  const db = getDb();
  const counts = await db.execute(`
    SELECT
      (SELECT COUNT(*) FROM matches WHERE status='played') AS played,
      (SELECT COUNT(*) FROM matches WHERE status='scheduled') AS scheduled
  `);
  const row = counts.rows[0];
  console.log(`\nTotal en base de datos: ${row.played} jugados, ${row.scheduled} programados`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
