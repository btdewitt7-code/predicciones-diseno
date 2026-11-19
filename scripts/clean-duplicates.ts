import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";

/**
 * Busca partidos duplicados (mismo equipo dos veces el mismo día) y elimina
 * los que ya no existen en API-Football.
 *
 *   npm run duplicados           -> solo muestra qué haría
 *   npm run duplicados -- --borrar -> hace backup y borra
 */

const BASE = "https://v3.football.api-sports.io";

const TABLES = [
  "predictions",
  "cup_predictions",
  "prediction_history",
  "market_odds",
  "value_odds",
  "lineups",
  "injuries",
  "player_match_stats",
  "card_events",
  "goal_events",
  "lineup_adjustments",
  "live_scores",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function loadKey(): string | undefined {
  if (process.env.API_FOOTBALL_KEY) return process.env.API_FOOTBALL_KEY;
  try {
    const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("API_FOOTBALL_KEY="));
    return line?.slice("API_FOOTBALL_KEY=".length).trim();
  } catch {
    return undefined;
  }
}

type Row = { id: number; kickoff: string; home_team: string; away_team: string };

/** true = existe, false = no existe, null = no se pudo confirmar. */
async function fixtureExists(id: number, key: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${BASE}/fixtures?id=${id}`, {
      headers: { "x-apisports-key": key },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      response?: unknown[];
      errors?: Record<string, unknown> | unknown[];
    };
    const errors = json.errors;
    const hasErrors = Array.isArray(errors)
      ? errors.length > 0
      : errors
        ? Object.keys(errors).length > 0
        : false;
    // Sin cuota o con error, la API responde vacío: no sirve para concluir nada.
    if (hasErrors) return null;
    if (!Array.isArray(json.response)) return null;
    return json.response.length > 0;
  } catch {
    return null;
  }
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.log("Falta API_FOOTBALL_KEY.");
    return;
  }

  const remove = process.argv.includes("--borrar");
  const db = getDb();

  const dup = await db.execute({
    sql: `SELECT home_team, date(kickoff) AS dia
          FROM matches
          WHERE status = 'scheduled'
          GROUP BY home_team, dia
          HAVING COUNT(*) > 1`,
    args: [],
  });

  if (dup.rows.length === 0) {
    console.log("No hay equipos con dos partidos el mismo día.");
    return;
  }

  const stale: Row[] = [];

  for (const group of dup.rows) {
    const rows = await db.execute({
      sql: `SELECT id, kickoff, home_team, away_team
            FROM matches
            WHERE status = 'scheduled' AND home_team = ? AND date(kickoff) = ?`,
      args: [String(group.home_team), String(group.dia)],
    });

    console.log(`\n${group.home_team} · ${group.dia}`);
    for (const raw of rows.rows) {
      const row: Row = {
        id: Number(raw.id),
        kickoff: String(raw.kickoff),
        home_team: String(raw.home_team),
        away_team: String(raw.away_team),
      };

      const first = await fixtureExists(row.id, key);
      await sleep(700);
      // Doble confirmación: solo se considera sobrante si la API lo niega dos veces.
      const exists = first === false ? await fixtureExists(row.id, key) : first;
      await sleep(700);

      const label = `${row.id} · ${row.kickoff.slice(11, 16)} · ${row.home_team} vs ${row.away_team}`;
      if (exists === true) {
        console.log(`  ✓ existe   ${label}`);
      } else if (exists === false) {
        console.log(`  ✗ sobra    ${label}`);
        stale.push(row);
      } else {
        console.log(`  ? sin dato ${label} (no se toca)`);
      }
    }
  }

  if (stale.length === 0) {
    console.log("\nNada para borrar.");
    return;
  }

  if (!remove) {
    console.log(`\nSe borrarían ${stale.length} partidos. Ejecuta con --borrar para hacerlo.`);
    return;
  }

  const base = fs.existsSync("D:\\") ? "D:\\BACKUPPREDICCIONES" : path.join(process.cwd(), "backups");
  fs.mkdirSync(base, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const backup = path.join(base, `backup-${stamp}-antes-duplicados.db`);
  await db.execute({ sql: `VACUUM INTO ?`, args: [backup] });
  console.log(`\nBackup: ${backup}`);

  for (const row of stale) {
    for (const table of TABLES) {
      try {
        await db.execute({ sql: `DELETE FROM ${table} WHERE match_id = ?`, args: [row.id] });
      } catch {
        // tabla sin match_id
      }
    }
    await db.execute({ sql: `DELETE FROM matches WHERE id = ?`, args: [row.id] });
    console.log(`Borrado ${row.id} · ${row.home_team} vs ${row.away_team}`);
  }

  console.log(`\nListo: ${stale.length} partidos eliminados.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
