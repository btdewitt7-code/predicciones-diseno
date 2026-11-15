import { ensureSchemaOnce, getDb, getMeta, setMeta } from "./db";
import { getMarketOdds, getUpcoming } from "./queries";
import { buildCombos } from "./combos";
import { getVetoedSet } from "./veto";
import { findValue } from "./value";
import { COLORS, sendEmbeds } from "./notify";
import { LEAGUE_BY_CODE } from "./leagues";
import { dayKey, pct, timeOf, todayKey } from "./format";

/** Probabilidad mínima de una jugada para avisar. */
const MIN_PLAY_PROB = 0.65;
/** Ventaja mínima para avisar de un valor. */
const MIN_VALUE_EDGE = 0.06;
const MIN_VALUE_PROB = 0.45;
const MAX_ITEMS = 3;
/** Como máximo dos mensajes al día para no spamear. */
const MAX_MESSAGES_PER_DAY = 2;
/** Solo partidos que empiezan en las próximas 48 horas. */
const HORIZON_HOURS = 48;
/** Por defecto se avisan las jugadas de las próximas 48 h. `NOTIFY_ONLY_TODAY=1` limita a hoy. */
const ONLY_TODAY = process.env.NOTIFY_ONLY_TODAY === "1";

type SentRow = { hash: string; kind: string };

async function loadSent(): Promise<Set<string>> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT hash FROM plays_sent WHERE sent_at >= datetime('now', '-7 days')`,
  });
  return new Set(res.rows.map((row) => String(row.hash)));
}

async function markSent(rows: SentRow[]): Promise<void> {
  if (rows.length === 0) return;
  const db = getDb();
  await db.batch(
    rows.map((row) => ({
      sql: `INSERT OR IGNORE INTO plays_sent (hash, kind, sent_at) VALUES (?,?,?)`,
      args: [row.hash, row.kind, new Date().toISOString()],
    })),
    "write",
  );
}

async function messagesAvailable(): Promise<boolean> {
  const today = todayKey();
  const savedDay = await getMeta("notify_plays_day");
  if (savedDay !== today) {
    await setMeta("notify_plays_day", today);
    await setMeta("notify_plays_count", "0");
    return true;
  }
  const count = Number(await getMeta("notify_plays_count")) || 0;
  return count < MAX_MESSAGES_PER_DAY;
}

async function bumpMessages(): Promise<void> {
  const count = Number(await getMeta("notify_plays_count")) || 0;
  await setMeta("notify_plays_count", String(count + 1));
}

function hashOf(kind: string, parts: string[]): string {
  return `${kind}:${parts.slice().sort().join("|")}`;
}

/** Avisa de las jugadas nuevas con probabilidad alta. */
async function notifyStrongPlays(): Promise<number> {
  const [upcoming, vetoed, sent] = await Promise.all([
    getUpcoming(),
    getVetoedSet(),
    loadSent(),
  ]);

  const now = Date.now();
  const horizon = now + HORIZON_HOURS * 3600_000;
  const available = upcoming.filter((match) => {
    const kickoff = Date.parse(`${match.kickoff}Z`);
    return kickoff >= now && kickoff <= horizon;
  });

  const today = todayKey();
  const combos = buildCombos(available, vetoed)
    .filter((combo) => combo.probability >= MIN_PLAY_PROB)
    .filter((combo) =>
      combo.legs.every((leg) => Date.parse(`${leg.kickoff}Z`) >= now),
    )
    .filter((combo) =>
      ONLY_TODAY ? combo.legs.every((leg) => dayKey(leg.kickoff) === today) : true,
    )
    .sort((a, b) => {
      const aToday = dayKey(a.legs[0]?.kickoff ?? "") === today ? 1 : 0;
      const bToday = dayKey(b.legs[0]?.kickoff ?? "") === today ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;
      return b.probability - a.probability;
    });

  const fresh = combos
    .map((combo) => ({
      combo,
      hash: hashOf("play", combo.legs.map((leg) => `${leg.matchId}:${leg.market}`)),
    }))
    .filter((item) => !sent.has(item.hash))
    .slice(0, MAX_ITEMS);

  if (fresh.length === 0) return 0;

  const embeds = fresh.map(({ combo }) => ({
    title: `⚽ ${combo.title} · ${pct(combo.probability)}`,
    color: COLORS.green,
    description: combo.legs
      .map((leg) => {
        const league = LEAGUE_BY_CODE[leg.leagueCode];
        const where = league ? `${league.name} · ${timeOf(leg.kickoff)}` : timeOf(leg.kickoff);
        return `**${leg.market}**\n${leg.matchLabel}\n${where}`;
      })
      .join("\n\n"),
    footer: { text: `Cuota justa ${combo.fairOdds.toFixed(2)} · Predicciones` },
  }));

  const result = await sendEmbeds(embeds);
  if (!result.sent) return 0;

  await markSent(fresh.map((item) => ({ hash: item.hash, kind: "play" })));
  await bumpMessages();
  return fresh.length;
}

/** Avisa de los valores claros contra la cuota del mercado. */
async function notifyValue(): Promise<number> {
  const [upcoming, sent] = await Promise.all([
    getUpcoming(),
    loadSent(),
  ]);

  const now = Date.now();
  const horizon = now + HORIZON_HOURS * 3600_000;
  const available = upcoming.filter((match) => {
    const kickoff = Date.parse(`${match.kickoff}Z`);
    return kickoff >= now && kickoff <= horizon;
  });
  if (available.length === 0) return 0;

  const marketOdds = await getMarketOdds(available.map((match) => match.id));
  const picks = findValue(available, marketOdds, {
    minEdge: MIN_VALUE_EDGE,
    minProb: MIN_VALUE_PROB,
    maxOdds: 5,
  })
    .filter((pick) => pick.edge <= 0.2)
    .sort((a, b) => b.edge - a.edge);

  const fresh = picks
    .map((pick) => ({
      pick,
      hash: hashOf("value", [`${pick.match.id}:${pick.category}:${pick.label}`]),
    }))
    .filter((item) => !sent.has(item.hash))
    .slice(0, MAX_ITEMS);

  if (fresh.length === 0) return 0;

  const embeds = fresh.map(({ pick }) => {
    const league = LEAGUE_BY_CODE[pick.match.league_code];
    return {
      title: `💎 ${pick.label}`,
      color: COLORS.blue,
      description: `${pick.match.home_team} vs ${pick.match.away_team}\n${
        league?.name ?? pick.match.league_code
      } · ${timeOf(pick.match.kickoff)}`,
      fields: [
        { name: "Modelo", value: pct(pick.modelProb), inline: true },
        { name: "Mercado", value: pct(pick.marketProb), inline: true },
        { name: "Ventaja", value: `+${(pick.edge * 100).toFixed(1)}%`, inline: true },
        { name: "Cuota", value: pick.odds.toFixed(2), inline: true },
      ],
      footer: { text: "Predicciones · valor de mercado" },
    };
  });

  const result = await sendEmbeds(embeds);
  if (!result.sent) return 0;

  await markSent(fresh.map((item) => ({ hash: item.hash, kind: "value" })));
  await bumpMessages();
  return fresh.length;
}

/**
 * Avisos de jugadas fuertes y valor claro.
 * Máximo dos mensajes al día y sin repetir jugadas ya avisadas.
 */
let inFlight: Promise<{ plays: number; value: number }> | null = null;

export function notifyPlays(): Promise<{ plays: number; value: number }> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<{ plays: number; value: number }> {
  await ensureSchemaOnce();

  if (!(await messagesAvailable())) return { plays: 0, value: 0 };

  const plays = await notifyStrongPlays().catch(() => 0);
  if (plays > 0 && !(await messagesAvailable())) {
    return { plays, value: 0 };
  }
  const value = await notifyValue().catch(() => 0);
  return { plays, value };
}
