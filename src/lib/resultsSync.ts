import { getDb, getMeta, setMeta } from "./db";
import { apiFootballGet } from "./apiFootball";
import { flagFavoriteLosses } from "./veto";

/** país|liga de API-Football -> código interno */
const LEAGUE_MAP: Record<string, string> = {
  "england|premier league": "E0",
  "england|championship": "E1",
  "england|league one": "E2",
  "england|league two": "E3",
  "england|national league": "EC",
  "scotland|premiership": "SC0",
  "scotland|championship": "SC1",
  "scotland|league one": "SC2",
  "germany|bundesliga": "D1",
  "germany|2. bundesliga": "D2",
  "italy|serie a": "I1",
  "italy|serie b": "I2",
  "spain|laliga": "SP1",
  "spain|la liga": "SP1",
  "spain|segunda division": "SP2",
  "spain|segunda división": "SP2",
  "france|ligue 1": "F1",
  "france|ligue 2": "F2",
  "netherlands|eredivisie": "N1",
  "belgium|jupiler pro league": "B1",
  "belgium|pro league": "B1",
  "portugal|primeira liga": "P1",
  "turkey|super lig": "T1",
  "turkey|süper lig": "T1",
  "greece|super league": "G1",
  "norway|eliteserien": "NOR",
  "norway|tippeligaen": "NOR",
  "usa|major league soccer": "MLS",
  "argentina|liga profesional": "ARG",
  "brazil|serie a": "BRA",
  "peru|primera division": "PER",
  "peru|primera división": "PER",
  "bolivia|liga profesional": "BOL",
  "bolivia|division profesional": "BOL",
  "saudi arabia|saudi pro league": "SAU",
};

const FINISHED = new Set(["FT", "AET", "PEN"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT"]);

const THROTTLE_MS = 40 * 60_000;
/** Ventana de búsqueda de resultados. Se puede ampliar con RESULTS_LOOKBACK_HOURS. */
const LOOKBACK_HOURS = (() => {
  const raw = Number(process.env.RESULTS_LOOKBACK_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
})();
const SAME_MATCH_HOURS = 6;
/** Un partido no puede haber terminado antes de ~1 h 40 min. */
const MIN_MATCH_MINUTES = 100;

type ApiFixture = {
  fixture?: {
    date?: string;
    status?: { short?: string; elapsed?: number | null };
  };
  league?: { country?: string; name?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
  score?: { halftime?: { home?: number | null; away?: number | null } };
};

type DbMatch = {
  id: number;
  league_code: string;
  kickoff: string;
  home_team: string;
  away_team: string;
};

function normalize(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return base
    .split(" ")
    .filter((token) => token && !["fc", "cf", "sc", "ac", "afc", "club", "de", "del"].includes(token))
    .map((token) => (token === "utd" ? "united" : token))
    .join(" ");
}

function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.startsWith(y) || y.startsWith(x)) return 0.9;

  const setA = new Set(x.split(" "));
  const setB = new Set(y.split(" "));
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  if (intersection === 0) return 0;
  const contained = intersection === Math.min(setA.size, setB.size) ? 0.85 : 0;
  return Math.max(contained, intersection / new Set([...setA, ...setB]).size);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchFixtures(date: string, key: string): Promise<ApiFixture[]> {
  const json = await apiFootballGet<{ response?: ApiFixture[] }>(
    `fixtures?date=${date}`,
    key,
  );
  return json?.response ?? [];
}

type SyncResult = {
  matches: number;
  updated: number;
  live: number;
  reason?: string;
};

let inFlight: Promise<SyncResult> | null = null;

/**
 * Cierra partidos que ya terminaron y actualiza marcadores en vivo usando
 * API-Football (funciona para ligas donde ESPN no publica resultados).
 * Por defecto se ejecuta como máximo cada 40 minutos y respeta el
 * presupuesto diario de peticiones.
 */
export async function syncRecentResults(options?: { force?: boolean }): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = run(options?.force ?? false).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(force: boolean): Promise<SyncResult> {
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) return { matches: 0, updated: 0, live: 0, reason: "sin API_FOOTBALL_KEY" };

  if (!force) {
    const last = await getMeta("results_sync_at");
    if (last && Date.now() - Date.parse(last) < THROTTLE_MS) {
      return { matches: 0, updated: 0, live: 0, reason: "reciente" };
    }
  }

  const db = getDb();
  const now = Date.now();
  const from = new Date(now - LOOKBACK_HOURS * 3600_000).toISOString().slice(0, 19);
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
  })) as DbMatch[];

  if (matches.length === 0) {
    await setMeta("results_sync_at", new Date().toISOString());
    return { matches: 0, updated: 0, live: 0, reason: "sin partidos pendientes" };
  }

  // Si el partido pendiente más antiguo acaba de empezar, todavía no hay
  // resultado que consultar: se ahorra la petición.
  const oldest = Math.min(
    ...matches.map((match) => Date.parse(`${match.kickoff}Z`)),
  );
  if (Number.isFinite(oldest) && now - oldest < MIN_MATCH_MINUTES * 60_000) {
    await setMeta("results_sync_at", new Date().toISOString());
    return { matches: matches.length, updated: 0, live: 0, reason: "aún jugándose" };
  }

  const dates = [...new Set(matches.map((match) => match.kickoff.slice(0, 10)))];
  const fixtures: ApiFixture[] = [];
  for (const date of dates) {
    fixtures.push(...(await fetchFixtures(date, key)));
  }

  const byLeague = new Map<string, ApiFixture[]>();
  for (const fixture of fixtures) {
    const leagueKey = `${(fixture.league?.country ?? "").toLowerCase()}|${(fixture.league?.name ?? "").toLowerCase()}`;
    const code = LEAGUE_MAP[leagueKey];
    if (!code || !fixture.fixture?.date) continue;
    const list = byLeague.get(code) ?? [];
    list.push(fixture);
    byLeague.set(code, list);
  }

  let updated = 0;
  let live = 0;

  for (const match of matches) {
    const candidates = byLeague.get(match.league_code) ?? [];
    if (candidates.length === 0) continue;

    const kickoffMs = Date.parse(`${match.kickoff}Z`);
    let best: { fixture: ApiFixture; score: number; gap: number } | null = null;

    for (const fixture of candidates) {
      const dateMs = Date.parse(fixture.fixture?.date ?? "");
      if (!Number.isFinite(dateMs)) continue;
      const gap = Math.abs(dateMs - kickoffMs);
      if (gap > SAME_MATCH_HOURS * 3600_000) continue;

      const home = similarity(match.home_team, fixture.teams?.home?.name ?? "");
      const away = similarity(match.away_team, fixture.teams?.away?.name ?? "");
      const score = home + away;
      if (score < 1.3) continue;

      if (!best || score > best.score || (score === best.score && gap < best.gap)) {
        best = { fixture, score, gap };
      }
    }

    if (!best) continue;

    const status = best.fixture.fixture?.status?.short ?? "";
    const homeGoals = toNumber(best.fixture.goals?.home);
    const awayGoals = toNumber(best.fixture.goals?.away);

    if (FINISHED.has(status) && homeGoals !== null && awayGoals !== null) {
      const htHome = toNumber(best.fixture.score?.halftime?.home);
      const htAway = toNumber(best.fixture.score?.halftime?.away);

      await db.execute({
        sql: `UPDATE matches SET
                home_goals = ?, away_goals = ?,
                ht_home_goals = COALESCE(?, ht_home_goals),
                ht_away_goals = COALESCE(?, ht_away_goals),
                status = 'played'
              WHERE id = ?`,
        args: [homeGoals, awayGoals, htHome, htAway, match.id],
      });
      await db.execute({ sql: `DELETE FROM live_scores WHERE match_id = ?`, args: [match.id] });
      updated += 1;
      continue;
    }

    if (LIVE.has(status) && homeGoals !== null && awayGoals !== null) {
      const elapsed = best.fixture.fixture?.status?.elapsed;
      await db.execute({
        sql: `INSERT INTO live_scores (match_id, home_goals, away_goals, clock, updated_at)
              VALUES (?,?,?,?,?)
              ON CONFLICT(match_id) DO UPDATE SET
                home_goals = excluded.home_goals,
                away_goals = excluded.away_goals,
                clock = excluded.clock,
                updated_at = excluded.updated_at`,
        args: [
          match.id,
          homeGoals,
          awayGoals,
          elapsed ? `${elapsed}'` : null,
          new Date().toISOString(),
        ],
      });
      live += 1;
    }
  }

  // Un equipo que pierde como claro favorito queda vigilado unos días.
  if (updated > 0) {
    await flagFavoriteLosses().catch(() => undefined);
  }

  await setMeta("results_sync_at", new Date().toISOString());
  return { matches: matches.length, updated, live };
}
