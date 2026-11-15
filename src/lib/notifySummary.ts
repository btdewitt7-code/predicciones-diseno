import { ensureSchemaOnce, getMeta, setMeta } from "./db";
import { getMarketOdds, getUpcoming } from "./queries";
import { buildCombos } from "./combos";
import { getVetoedSet } from "./veto";
import { findValue } from "./value";
import { COLORS, sendEmbeds, type Embed } from "./notify";
import { dayKey, dayLabel, pct, timeOf, todayKey } from "./format";

/** Resumen diario de jugadas y valores que siguen activos. */
const MAX_PLAYS = 4;
const MAX_VALUES = 3;
const HORIZON_HOURS = 48;
/** Por defecto se resume lo de las próximas 48 h. `NOTIFY_ONLY_TODAY=1` limita a hoy. */
const ONLY_TODAY = process.env.NOTIFY_ONLY_TODAY === "1";

export async function notifyDailySummary(): Promise<number> {
  await ensureSchemaOnce();

  const today = todayKey();
  if ((await getMeta("notify_summary_day")) === today) return 0;

  const [upcoming, vetoed] = await Promise.all([getUpcoming(), getVetoedSet()]);
  const now = Date.now();
  const horizon = now + HORIZON_HOURS * 3600_000;
  const active = upcoming.filter((match) => {
    const kickoff = Date.parse(`${match.kickoff}Z`);
    return kickoff >= now && kickoff <= horizon;
  });

  if (active.length === 0) {
    await setMeta("notify_summary_day", today);
    return 0;
  }

  const combos = buildCombos(active, vetoed)
    .filter((combo) => combo.probability >= 0.6)
    .filter((combo) =>
      ONLY_TODAY ? combo.legs.every((leg) => dayKey(leg.kickoff) === today) : true,
    )
    .slice(0, MAX_PLAYS);

  const marketOdds = await getMarketOdds(active.map((match) => match.id));
  const values = findValue(active, marketOdds, {
    minEdge: 0.05,
    minProb: 0.4,
    maxOdds: 5,
  })
    .filter((pick) => (ONLY_TODAY ? dayKey(pick.match.kickoff) === today : true))
    .sort((a, b) => b.edge - a.edge)
    .slice(0, MAX_VALUES);

  const embeds: Embed[] = [];

  if (combos.length > 0) {
    embeds.push({
      title: `🎯 Jugadas activas · ${dayLabel(`${today}T12:00:00`)}`,
      color: COLORS.green,
      description: combos
        .map(
          (combo) =>
            `**${combo.title} · ${pct(combo.probability)}**\n${combo.legs
              .map((leg) => `${leg.matchLabel} (${timeOf(leg.kickoff)})`)
              .join("\n")}`,
        )
        .join("\n\n"),
      footer: { text: "Predicciones · partidos sin empezar" },
    });
  }

  if (values.length > 0) {
    embeds.push({
      title: "💎 Valores activos",
      color: COLORS.blue,
      description: values
        .map(
          (pick) =>
            `**${pick.label}**\n${pick.match.home_team} vs ${pick.match.away_team} · ${timeOf(
              pick.match.kickoff,
            )}\nModelo ${pct(pick.modelProb)} vs mercado ${pct(pick.marketProb)} (+${(
              pick.edge * 100
            ).toFixed(1)}%)`,
        )
        .join("\n\n"),
      footer: { text: "Predicciones · valor de mercado" },
    });
  }

  if (embeds.length === 0) {
    await setMeta("notify_summary_day", today);
    return 0;
  }

  const result = await sendEmbeds(embeds);
  if (!result.sent) return 0;

  await setMeta("notify_summary_day", today);
  return combos.length + values.length;
}
