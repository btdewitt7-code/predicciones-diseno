import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";

let client: Client | null = null;

export function getDb(): Client {
  if (client) return client;

  const url = process.env.DATABASE_URL ?? "file:./data/predicciones.db";
  fs.mkdirSync("./data", { recursive: true });
  client = createClient({ url });
  // La web y el script de actualización comparten el archivo: esperamos al lock
  // en vez de fallar con SQLITE_BUSY.
  client.execute("PRAGMA busy_timeout = 8000").catch(() => undefined);
  return client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    league_code TEXT NOT NULL,
    season TEXT NOT NULL,
    kickoff TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_goals INTEGER,
    away_goals INTEGER,
    ht_home_goals INTEGER,
    ht_away_goals INTEGER,
    home_shots INTEGER,
    away_shots INTEGER,
    home_sot INTEGER,
    away_sot INTEGER,
    home_corners INTEGER,
    away_corners INTEGER,
    home_fouls INTEGER,
    away_fouls INTEGER,
    home_yellow INTEGER,
    away_yellow INTEGER,
    home_red INTEGER,
    away_red INTEGER,
    referee TEXT,
    odds_home REAL,
    odds_draw REAL,
    odds_away REAL,
    odds_over25 REAL,
    odds_under25 REAL,
    close_home REAL,
    close_draw REAL,
    close_away REAL,
    status TEXT NOT NULL DEFAULT 'played',
    UNIQUE(league_code, kickoff, home_team, away_team)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff)`,
  `CREATE INDEX IF NOT EXISTS idx_matches_league ON matches(league_code, season)`,
  `CREATE TABLE IF NOT EXISTS predictions (
    match_id INTEGER PRIMARY KEY,
    home_win REAL NOT NULL,
    draw REAL NOT NULL,
    away_win REAL NOT NULL,
    over15 REAL NOT NULL,
    over25 REAL NOT NULL,
    over35 REAL NOT NULL,
    btts REAL NOT NULL,
    exp_home_goals REAL NOT NULL,
    exp_away_goals REAL NOT NULL,
    corners_home REAL NOT NULL,
    corners_away REAL NOT NULL,
    sot_home REAL NOT NULL,
    sot_away REAL NOT NULL,
    corners_over85 REAL NOT NULL,
    corners_over95 REAL NOT NULL,
    corners_over105 REAL NOT NULL,
    sot_over85 REAL NOT NULL,
    sot_over95 REAL NOT NULL,
    shots_home REAL NOT NULL DEFAULT 0,
    shots_away REAL NOT NULL DEFAULT 0,
    shots_over205 REAL NOT NULL DEFAULT 0,
    shots_over225 REAL NOT NULL DEFAULT 0,
    shots_over245 REAL NOT NULL DEFAULT 0,
    cards_home REAL NOT NULL DEFAULT 0,
    cards_away REAL NOT NULL DEFAULT 0,
    cards_over35 REAL NOT NULL DEFAULT 0,
    cards_over45 REAL NOT NULL DEFAULT 0,
    cards_over55 REAL NOT NULL DEFAULT 0,
    ht_home_goals REAL NOT NULL DEFAULT 0,
    ht_away_goals REAL NOT NULL DEFAULT 0,
    ht_over05 REAL NOT NULL DEFAULT 0,
    ht_over15 REAL NOT NULL DEFAULT 0,
    ht_over25 REAL NOT NULL DEFAULT 0,
    top_scores TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cup_predictions (
    match_id INTEGER PRIMARY KEY,
    home_win REAL NOT NULL,
    draw REAL NOT NULL,
    away_win REAL NOT NULL,
    over15 REAL NOT NULL,
    over25 REAL NOT NULL,
    over35 REAL NOT NULL,
    btts REAL NOT NULL,
    exp_home_goals REAL NOT NULL,
    exp_away_goals REAL NOT NULL,
    corners_home REAL NOT NULL,
    corners_away REAL NOT NULL,
    sot_home REAL NOT NULL,
    sot_away REAL NOT NULL,
    corners_over85 REAL NOT NULL,
    corners_over95 REAL NOT NULL,
    corners_over105 REAL NOT NULL,
    sot_over85 REAL NOT NULL,
    sot_over95 REAL NOT NULL,
    shots_home REAL NOT NULL DEFAULT 0,
    shots_away REAL NOT NULL DEFAULT 0,
    shots_over205 REAL NOT NULL DEFAULT 0,
    shots_over225 REAL NOT NULL DEFAULT 0,
    shots_over245 REAL NOT NULL DEFAULT 0,
    cards_home REAL NOT NULL DEFAULT 0,
    cards_away REAL NOT NULL DEFAULT 0,
    cards_over35 REAL NOT NULL DEFAULT 0,
    cards_over45 REAL NOT NULL DEFAULT 0,
    cards_over55 REAL NOT NULL DEFAULT 0,
    ht_home_goals REAL NOT NULL DEFAULT 0,
    ht_away_goals REAL NOT NULL DEFAULT 0,
    ht_over05 REAL NOT NULL DEFAULT 0,
    ht_over15 REAL NOT NULL DEFAULT 0,
    ht_over25 REAL NOT NULL DEFAULT 0,
    top_scores TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    source TEXT NOT NULL,
    snapshot_day TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    UNIQUE (match_id, source, snapshot_day)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_prediction_history_day
     ON prediction_history (snapshot_day)`,
  `CREATE TABLE IF NOT EXISTS ratings (
    league_code TEXT NOT NULL,
    team TEXT NOT NULL,
    att_home REAL NOT NULL,
    def_home REAL NOT NULL,
    att_away REAL NOT NULL,
    def_away REAL NOT NULL,
    c_att_home REAL NOT NULL,
    c_def_home REAL NOT NULL,
    c_att_away REAL NOT NULL,
    c_def_away REAL NOT NULL,
    s_att_home REAL NOT NULL,
    s_def_home REAL NOT NULL,
    s_att_away REAL NOT NULL,
    s_def_away REAL NOT NULL,
    total_home REAL NOT NULL DEFAULT 1,
    total_away REAL NOT NULL DEFAULT 1,
    promoted INTEGER NOT NULL DEFAULT 0,
    matches_home REAL NOT NULL,
    matches_away REAL NOT NULL,
    PRIMARY KEY (league_code, team)
  )`,
  `CREATE TABLE IF NOT EXISTS league_baseline (
    league_code TEXT PRIMARY KEY,
    avg_home_goals REAL NOT NULL,
    avg_away_goals REAL NOT NULL,
    avg_total_goals REAL NOT NULL DEFAULT 0,
    avg_home_corners REAL NOT NULL,
    avg_away_corners REAL NOT NULL,
    avg_home_sot REAL NOT NULL,
    avg_away_sot REAL NOT NULL,
    matches INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS saved_combos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    day TEXT NOT NULL,
    combo_id TEXT NOT NULL,
    title TEXT NOT NULL,
    legs TEXT NOT NULL,
    probability REAL NOT NULL,
    fair_odds REAL NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'model',
    origin TEXT NOT NULL DEFAULT 'generated',
    UNIQUE (user_id, hash)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_logos (
    league_code TEXT NOT NULL,
    team TEXT NOT NULL,
    logo_url TEXT NOT NULL,
    PRIMARY KEY (league_code, team)
  )`,
  `CREATE TABLE IF NOT EXISTS league_logos (
    league_code TEXT PRIMARY KEY,
    logo_url TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS card_events (
    match_id INTEGER NOT NULL,
    minute TEXT NOT NULL,
    side TEXT NOT NULL,
    team TEXT NOT NULL,
    player TEXT NOT NULL,
    color TEXT NOT NULL,
    PRIMARY KEY (match_id, minute, player)
  )`,
  `CREATE TABLE IF NOT EXISTS goal_events (
    match_id INTEGER NOT NULL,
    minute TEXT NOT NULL,
    side TEXT NOT NULL,
    team TEXT NOT NULL,
    player TEXT NOT NULL,
    assist TEXT,
    kind TEXT NOT NULL,
    PRIMARY KEY (match_id, minute, player)
  )`,
  `CREATE TABLE IF NOT EXISTS player_match_stats (
    match_id INTEGER NOT NULL,
    team TEXT NOT NULL,
    player TEXT NOT NULL,
    shots INTEGER,
    sot INTEGER,
    goals INTEGER,
    yellow INTEGER,
    red INTEGER,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (match_id, player)
  )`,
  `CREATE TABLE IF NOT EXISTS market_odds (
    match_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    line REAL NOT NULL,
    over_odds REAL,
    under_odds REAL,
    bookmakers INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (match_id, market, line)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications_sent (
    match_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (match_id, kind)
  )`,
  `CREATE TABLE IF NOT EXISTS team_veto (
    team TEXT NOT NULL,
    league_code TEXT NOT NULL,
    note TEXT,
    until TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (team, league_code)
  )`,
  `CREATE TABLE IF NOT EXISTS team_ht_veto (
    team TEXT NOT NULL,
    league_code TEXT NOT NULL,
    note TEXT,
    until TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (team, league_code)
  )`,
  `CREATE TABLE IF NOT EXISTS plays_sent (
    hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    sent_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS live_scores (
    match_id INTEGER PRIMARY KEY,
    home_goals INTEGER NOT NULL,
    away_goals INTEGER NOT NULL,
    clock TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS injuries (
    match_id INTEGER NOT NULL,
    side TEXT NOT NULL,
    player TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    category TEXT NOT NULL,
    team TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (match_id, player)
  )`,
  `CREATE TABLE IF NOT EXISTS lineups (
    match_id INTEGER NOT NULL,
    side TEXT NOT NULL,
    team TEXT NOT NULL,
    player TEXT NOT NULL,
    number INTEGER,
    position TEXT,
    starter INTEGER NOT NULL DEFAULT 0,
    formation TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (match_id, side, player)
  )`,
  `CREATE TABLE IF NOT EXISTS value_odds (
    match_id INTEGER NOT NULL,
    market TEXT NOT NULL,
    line REAL NOT NULL,
    over_odds REAL,
    under_odds REAL,
    bookmakers INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (match_id, market, line)
  )`,
  `CREATE TABLE IF NOT EXISTS standings (    league_code TEXT NOT NULL,
    team TEXT NOT NULL,
    group_name TEXT,
    rank INTEGER NOT NULL,
    played INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    draws INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    goals_for INTEGER NOT NULL,
    goals_against INTEGER NOT NULL,
    goal_diff INTEGER NOT NULL,
    points INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (league_code, team)
  )`,
  `CREATE TABLE IF NOT EXISTS lineup_adjustments (    match_id INTEGER PRIMARY KEY,
    base_lambda_home REAL NOT NULL,
    base_lambda_away REAL NOT NULL,
    home_attack REAL NOT NULL,
    home_defense REAL NOT NULL,
    away_attack REAL NOT NULL,
    away_defense REAL NOT NULL,
    base_home_win REAL NOT NULL,
    base_draw REAL NOT NULL,
    base_away_win REAL NOT NULL,
    last_home_win REAL NOT NULL,
    last_draw REAL NOT NULL,
    last_away_win REAL NOT NULL,
    applied_at TEXT NOT NULL,
    notified_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

const ALTERS = [
  `ALTER TABLE ratings ADD COLUMN promoted INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE ratings ADD COLUMN total_home REAL NOT NULL DEFAULT 1`,
  `ALTER TABLE ratings ADD COLUMN total_away REAL NOT NULL DEFAULT 1`,
  `ALTER TABLE league_baseline ADD COLUMN avg_total_goals REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN shots_home REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN shots_away REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN shots_over205 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN shots_over225 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN shots_over245 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN cards_home REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN cards_away REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN cards_over35 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN cards_over45 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN cards_over55 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE matches ADD COLUMN ht_home_goals INTEGER`,
  `ALTER TABLE matches ADD COLUMN ht_away_goals INTEGER`,
  `ALTER TABLE predictions ADD COLUMN ht_home_goals REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN ht_away_goals REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN ht_over05 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN ht_over15 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE predictions ADD COLUMN ht_over25 REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE player_match_stats ADD COLUMN yellow INTEGER`,
  `ALTER TABLE player_match_stats ADD COLUMN red INTEGER`,
  `ALTER TABLE standings ADD COLUMN group_name TEXT`,
  `ALTER TABLE saved_combos ADD COLUMN source TEXT NOT NULL DEFAULT 'model'`,
  `ALTER TABLE saved_combos ADD COLUMN origin TEXT NOT NULL DEFAULT 'generated'`,
];

let schemaPromise: Promise<Client> | null = null;

export async function ensureSchema(): Promise<Client> {
  const db = getDb();
  await db.execute("PRAGMA busy_timeout = 8000");
  await db.execute("PRAGMA journal_mode = WAL");
  await db.batch(SCHEMA, "write");
  for (const sql of ALTERS) {
    try {
      await db.execute(sql);
    } catch {
      // La columna ya existe: es seguro ignorar.
    }
  }

  // Migración: la tabla vieja tenía `hash` único global. Ahora es por usuario.
  const info = await db.execute("PRAGMA table_info(saved_combos)");
  const hasUserId = info.rows.some((row) => String(row.name) === "user_id");
  if (!hasUserId) {
    await db.execute(`ALTER TABLE saved_combos ADD COLUMN user_id INTEGER`);
    await db.execute(`CREATE TABLE IF NOT EXISTS saved_combos_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      day TEXT NOT NULL,
      combo_id TEXT NOT NULL,
      title TEXT NOT NULL,
      legs TEXT NOT NULL,
      probability REAL NOT NULL,
      fair_odds REAL NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'model',
      origin TEXT NOT NULL DEFAULT 'generated',
      UNIQUE (user_id, hash)
    )`);
    await db.execute(`INSERT OR IGNORE INTO saved_combos_v2
        (id, user_id, day, combo_id, title, legs, probability, fair_odds, hash, created_at)
      SELECT id, NULL, day, combo_id, title, legs, probability, fair_odds, hash, created_at
      FROM saved_combos`);
    await db.execute(`DROP TABLE saved_combos`);
    await db.execute(`ALTER TABLE saved_combos_v2 RENAME TO saved_combos`);
  }

  return db;
}

/** Crea el esquema una sola vez por proceso (para la web). */
export function ensureSchemaOnce(): Promise<Client> {
  if (!schemaPromise) schemaPromise = ensureSchema();
  return schemaPromise;
}

export async function setMeta(key: string, value: string) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  });
}

export async function getMeta(key: string): Promise<string | null> {
  const db = getDb();
  const res = await db.execute({ sql: `SELECT value FROM meta WHERE key = ?`, args: [key] });
  const row = res.rows[0];
  return row ? String(row.value) : null;
}
