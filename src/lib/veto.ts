import { ensureSchemaOnce, getDb } from "./db";

export type TeamVeto = {
  team: string;
  league_code: string;
  note: string | null;
  until: string | null;
};

/** Clave única para comparar equipos entre ligas. */
export function vetoKey(leagueCode: string, team: string): string {
  return `${leagueCode}:${team}`.trim().toLowerCase();
}

export function isVetoed(
  vetoed: Set<string>,
  leagueCode: string,
  team: string,
): boolean {
  return vetoed.has(vetoKey(leagueCode, team));
}

/** Equipos marcados como "no favoritos" que siguen vigentes. */
export async function getVetoedSet(): Promise<Set<string>> {
  await ensureSchemaOnce();
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT team, league_code FROM team_veto
          WHERE until IS NULL OR until >= date('now')`,
  });
  return new Set(
    res.rows.map((row) => vetoKey(String(row.league_code), String(row.team))),
  );
}

export async function listVetos(): Promise<TeamVeto[]> {
  await ensureSchemaOnce();
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT team, league_code, note, until FROM team_veto
          ORDER BY league_code, team`,
  });
  return res.rows.map((row) => ({
    team: String(row.team),
    league_code: String(row.league_code),
    note: row.note === null ? null : String(row.note),
    until: row.until === null ? null : String(row.until),
  }));
}

/** Equipos vetados solo para el mercado de "1T más de 0.5". */
export async function getHtVetoedSet(): Promise<Set<string>> {
  await ensureSchemaOnce();
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT team, league_code FROM team_ht_veto
          WHERE until IS NULL OR until >= date('now')`,
  });
  return new Set(
    res.rows.map((row) => vetoKey(String(row.league_code), String(row.team))),
  );
}

export function isHtVetoed(
  vetoed: Set<string>,
  leagueCode: string,
  team: string,
): boolean {
  return vetoed.has(vetoKey(leagueCode, team));
}

export async function listHtVetos(): Promise<TeamVeto[]> {
  await ensureSchemaOnce();
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT team, league_code, note, until FROM team_ht_veto
          ORDER BY league_code, team`,
  });
  return res.rows.map((row) => ({
    team: String(row.team),
    league_code: String(row.league_code),
    note: row.note === null ? null : String(row.note),
    until: row.until === null ? null : String(row.until),
  }));
}

const LOOKBACK_DAYS = 3;
const FAVORITE_MIN = 0.6;
const VETO_DAYS = 21;

/**
 * Marca como vigilado a todo equipo que perdió siendo claro favorito.
 * Devuelve cuántos equipos nuevos se añadieron.
 */
export async function flagFavoriteLosses(): Promise<number> {
  await ensureSchemaOnce();
  const db = getDb();

  const res = await db.execute({
    sql: `SELECT m.league_code, m.kickoff, m.home_team, m.away_team,
                 m.home_goals, m.away_goals, p.home_win, p.away_win
          FROM matches m
          JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'played'
            AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL
            AND m.kickoff >= datetime('now', ?)
            AND (
              (p.home_win >= ? AND m.home_goals < m.away_goals)
              OR (p.away_win >= ? AND m.away_goals < m.home_goals)
            )`,
    args: [`-${LOOKBACK_DAYS} days`, FAVORITE_MIN, FAVORITE_MIN],
  });

  const until = new Date(Date.now() + VETO_DAYS * 86_400_000).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  let added = 0;

  for (const row of res.rows) {
    const homeLost = Number(row.home_goals) < Number(row.away_goals);
    const team = homeLost ? String(row.home_team) : String(row.away_team);
    const rival = homeLost ? String(row.away_team) : String(row.home_team);
    const note = `Perdió como favorito ${row.home_goals}-${row.away_goals} vs ${rival} (${String(
      row.kickoff,
    ).slice(0, 10)})`;

    const result = await db.execute({
      sql: `INSERT OR IGNORE INTO team_veto (team, league_code, note, until, created_at)
            VALUES (?,?,?,?,?)`,
      args: [team, String(row.league_code), note, until, now],
    });

    if (result.rowsAffected > 0) added += 1;
  }

  return added;
}
