import fs from "node:fs";
import path from "node:path";
import { imageSlug } from "../src/lib/carouselImages";

/**
 * Descarga UNA sola vez las fotos del carrusel a public/carousel.
 *
 * Modo lista (recomendado): edita public/carousel/fuentes.json
 *   [{ "home": "Vasco", "away": "Internacional", "url": "https://..." }]
 *   npm run fotos              -> baja las que falten
 *   npm run fotos -- --force   -> vuelve a bajarlas todas
 *
 * Modo automático (TheSportsDB, imágenes de club):
 *   npm run fotos -- --auto
 */

const DIR = path.join(process.cwd(), "public", "carousel");
const SOURCES = path.join(DIR, "fuentes.json");
const CREDITS = path.join(DIR, "creditos.txt");
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
const SPORTSDB_KEY = process.env.SPORTSDB_KEY ?? "123";

type Source = { home: string; away: string; buscar?: string; url: string };

type SportsTeam = {
  strTeam?: string;
  strFanart1?: string | null;
  strFanart2?: string | null;
  strFanart3?: string | null;
  strFanart4?: string | null;
  strBanner?: string | null;
  strTeamFanart1?: string | null;
  strTeamFanart2?: string | null;
  strTeamFanart3?: string | null;
  strTeamFanart4?: string | null;
  strTeamBanner?: string | null;
  strStadiumThumb?: string | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function exists(base: string): string | null {
  for (const extension of EXTENSIONS) {
    if (fs.existsSync(path.join(DIR, `${base}${extension}`))) return `${base}${extension}`;
  }
  return null;
}

function credit(line: string) {
  fs.appendFileSync(CREDITS, `${new Date().toISOString().slice(0, 10)}  ${line}\r\n`, "utf8");
}

async function download(url: string, base: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "dogebets/1.0 (personal project)" } });
    if (!res.ok) {
      console.log(`  HTTP ${res.status}`);
      return null;
    }
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      console.log(`  no es imagen (${type || "sin tipo"})`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 8_000) {
      console.log("  archivo demasiado pequeño");
      return null;
    }
    const fromUrl = url.split("?")[0].match(/\.(jpe?g|png|webp)$/i)?.[0]?.toLowerCase();
    const extension = fromUrl ?? (type.includes("png") ? ".png" : type.includes("webp") ? ".webp" : ".jpg");
    const file = `${base}${extension}`;
    fs.writeFileSync(path.join(DIR, file), buffer);
    return `${file} (${Math.round(buffer.length / 1024)} KB)`;
  } catch (error) {
    console.log(`  error: ${(error as Error).message}`);
    return null;
  }
}

async function fromSources(force: boolean) {
  if (!fs.existsSync(SOURCES)) {
    console.log(`No existe ${SOURCES}. Crea la lista de fotos y vuelve a ejecutar.`);
    return;
  }

  const list = JSON.parse(fs.readFileSync(SOURCES, "utf8")) as Source[];
  if (!Array.isArray(list) || list.length === 0) {
    console.log("La lista de fuentes está vacía. Agrega { home, away, url }.");
    return;
  }

  let saved = 0;
  let skipped = 0;

  for (const item of list) {
    const base = `${imageSlug(item.home)}-${imageSlug(item.away)}`;
    if (!force && exists(base)) {
      skipped += 1;
      continue;
    }
    if (!item.url || !/^https?:\/\//.test(item.url)) {
      continue;
    }
    console.log(`→ ${item.home} vs ${item.away}`);
    const file = await download(item.url, base);
    if (file) {
      saved += 1;
      credit(`${file}  ${item.url}`);
      console.log(`  ✓ ${file}`);
    }
  }

  console.log(`\nListo: ${saved} nuevas, ${skipped} ya existían.`);
}

async function searchTeam(name: string, attempt = 0): Promise<SportsTeam | null> {
  const ALIASES: Record<string, string> = {
    Aarhus: "AGF Aarhus",
  };
  const query = ALIASES[name] ?? name;
  const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/searchteams.php?t=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "dogebets/1.0" } });
    if (res.status === 429) {
      if (attempt < 2) {
        console.log("  límite alcanzado, esperando 25 s…");
        await sleep(25000);
        return searchTeam(name, attempt + 1);
      }
      console.log("  TheSportsDB: límite alcanzado (429). Prueba más tarde o usa fuentes.json.");
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { teams?: SportsTeam[] | null };
    return json.teams?.[0] ?? null;
  } catch {
    return null;
  }
}

function pickImage(team: SportsTeam | null): string | null {
  if (!team) return null;
  return (
    team.strFanart1 ||
    team.strFanart2 ||
    team.strFanart3 ||
    team.strFanart4 ||
    team.strBanner ||
    team.strTeamFanart1 ||
    team.strTeamFanart2 ||
    team.strTeamFanart3 ||
    team.strTeamFanart4 ||
    team.strTeamBanner ||
    team.strStadiumThumb ||
    null
  );
}

async function listMatches() {
  const { getDb } = await import("../src/lib/db");
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT home_team, away_team, kickoff
          FROM matches
          WHERE status = 'scheduled'
            AND date(kickoff) IN (date('now'), date('now', '+1 day'))
          ORDER BY kickoff
          LIMIT 30`,
    args: [],
  });

  const rows = result.rows as unknown as { home_team: string; away_team: string; kickoff: string }[];
  let previous: Source[] = [];
  try {
    previous = JSON.parse(fs.readFileSync(SOURCES, "utf8")) as Source[];
  } catch {
    previous = [];
  }

  const byKey = new Map(previous.map((item) => [`${imageSlug(item.home)}-${imageSlug(item.away)}`, item]));
  const list: Source[] = rows.map((row) => {
    const key = `${imageSlug(row.home_team)}-${imageSlug(row.away_team)}`;
    const existing = byKey.get(key);
    return {
      home: row.home_team,
      away: row.away_team,
      buscar: existing?.buscar ?? `${row.home_team} ${row.away_team} festejo jugadores`,
      url: existing?.url ?? "",
    };
  });

  fs.writeFileSync(SOURCES, JSON.stringify(list, null, 2) + "\r\n", "utf8");
  console.log(`Lista actualizada: ${list.length} partidos de hoy y ma?ana en`);
  console.log(`  ${SOURCES}`);
  console.log("Pega la URL de cada foto en \"url\" y ejecuta npm run fotos.");
}

async function fromSportsDb(limit: number, force: boolean) {
  const { getDb } = await import("../src/lib/db");
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT home_team, away_team, league_code
          FROM matches
          WHERE status = 'scheduled'
            AND date(kickoff) IN (date('now'), date('now', '+1 day'))
          ORDER BY kickoff
          LIMIT ?`,
    args: [limit],
  });

  const rows = result.rows as unknown as { home_team: string; away_team: string }[];
  if (rows.length === 0) {
    console.log("No hay partidos próximos.");
    return;
  }

  const cache = new Map<string, string | null>();
  let saved = 0;
  let skipped = 0;

  for (const row of rows) {
    const base = `${imageSlug(row.home_team)}-${imageSlug(row.away_team)}`;
    if (!force && exists(base)) {
      skipped += 1;
      continue;
    }

    let url: string | null = null;
    for (const team of [row.home_team, row.away_team]) {
      if (!cache.has(team)) {
        const found = await searchTeam(team);
        cache.set(team, pickImage(found));
        await sleep(1500);
      }
      url = cache.get(team) ?? null;
      if (url) break;
    }

    if (!url) {
      console.log(`— ${row.home_team} vs ${row.away_team}: sin imagen`);
      continue;
    }

    const file = await download(url, base);
    if (file) {
      saved += 1;
      credit(`${file}  ${url}`);
      console.log(`✓ ${row.home_team} vs ${row.away_team} -> ${file}`);
    }
  }

  console.log(`\nListo: ${saved} nuevas, ${skipped} ya existían.`);
}

async function main() {
  const args = process.argv.slice(2);
  fs.mkdirSync(DIR, { recursive: true });

  if (args.includes("--listar")) {
    await listMatches();
    return;
  }

  if (args.includes("--auto")) {
    const limitArg = args.find((value) => /^\d+$/.test(value));
    await fromSportsDb(Number(limitArg ?? 10), args.includes("--force"));
    return;
  }

  await fromSources(args.includes("--force"));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
