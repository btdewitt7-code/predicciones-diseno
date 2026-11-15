import type { ComboRule } from "./combos";
import type { RatedMatch } from "./queries";

export type ValueCategory = "1x2" | "goles" | "corners" | "cards" | "sot";

export type MarketOddsRow = {
  match_id: number;
  market: string;
  line: number;
  over_odds: number | null;
  under_odds: number | null;
};

export type ValuePick = {
  match: RatedMatch;
  category: ValueCategory;
  label: string;
  modelProb: number;
  marketProb: number;
  odds: number;
  edge: number;
  ev: number;
  rule: ComboRule;
};

/** Ventajas mayores a esto suelen ser un error del modelo, no una cuota mal puesta. */
export const MAX_TRUSTED_EDGE = 0.2;
/** Confianza mínima de datos para que una señal cuente. */
export const MIN_CONFIDENCE = 0.55;

type Options = {
  minEdge: number;
  minProb: number;
  maxOdds: number;
};

const LABELS = ["Local", "Empate", "Visitante"] as const;

function fairTwoWay(
  over: number | null,
  under: number | null,
): { over: number; under: number } | null {
  if (!over || !under || over <= 1 || under <= 1) return null;
  const invOver = 1 / over;
  const invUnder = 1 / under;
  const sum = invOver + invUnder;
  if (!Number.isFinite(sum) || sum <= 0) return null;
  return { over: invOver / sum, under: invUnder / sum };
}

function cornersProb(match: RatedMatch, line: number): number | null {
  const p = match.prediction;
  if (!p) return null;
  if (line === 8.5) return p.corners_over85;
  if (line === 9.5) return p.corners_over95;
  if (line === 10.5) return p.corners_over105;
  return null;
}

function cardsProb(match: RatedMatch, line: number): number | null {
  const p = match.prediction;
  if (!p) return null;
  if (line === 3.5) return p.cards_over35;
  if (line === 4.5) return p.cards_over45;
  if (line === 5.5) return p.cards_over55;
  return null;
}

function sotProb(match: RatedMatch, line: number): number | null {
  const p = match.prediction;
  if (!p) return null;
  if (line === 7.5) return p.sot_over85;
  if (line === 8.5) return p.sot_over95;
  return null;
}

/**
 * Valor "útil": la jugada debe ser probable (minProb) y estar mejor pagada
 * que su probabilidad real (minEdge). Incluye 1X2, goles, córners, tarjetas
 * y tiros al arco cuando hay cuotas de mercado.
 */
export function findValue(
  matches: RatedMatch[],
  marketOdds: MarketOddsRow[],
  options: Options,
): ValuePick[] {
  const { minEdge, minProb, maxOdds } = options;
  const oddsByMatch = new Map<number, MarketOddsRow[]>();
  for (const row of marketOdds) {
    const list = oddsByMatch.get(row.match_id) ?? [];
    list.push(row);
    oddsByMatch.set(row.match_id, list);
  }

  const picks: ValuePick[] = [];

  for (const match of matches) {
    const prediction = match.prediction;
    if (!prediction) continue;
    if (match.home_promoted || match.away_promoted) continue;
    if (prediction.confidence < MIN_CONFIDENCE) continue;

    const consider = (
      category: ValueCategory,
      label: string,
      modelProb: number,
      marketProb: number,
      odds: number,
      rule: ComboRule,
    ) => {
      if (!Number.isFinite(modelProb) || !Number.isFinite(marketProb)) return;
      if (!Number.isFinite(odds) || odds <= 1 || odds > maxOdds) return;
      if (modelProb < minProb) return;
      const edge = modelProb - marketProb;
      if (edge < minEdge || edge > MAX_TRUSTED_EDGE) return;
      const ev = modelProb * odds - 1;
      picks.push({
        match,
        category,
        label,
        modelProb,
        marketProb,
        odds,
        edge,
        ev,
        rule,
      });
    };

    // 1X2
    const oddsHome = match.close_home ?? match.odds_home;
    const oddsDraw = match.close_draw ?? match.odds_draw;
    const oddsAway = match.close_away ?? match.odds_away;
    if (oddsHome && oddsDraw && oddsAway) {
      const overround = 1 / oddsHome + 1 / oddsDraw + 1 / oddsAway;
      if (Number.isFinite(overround) && overround > 0) {
        const market = [
          1 / oddsHome / overround,
          1 / oddsDraw / overround,
          1 / oddsAway / overround,
        ];
        const model = [prediction.home_win, prediction.draw, prediction.away_win];
        const odds = [oddsHome, oddsDraw, oddsAway];
        const rules: ComboRule[] = [
          { type: "home_win" },
          { type: "draw" },
          { type: "away_win" },
        ];
        let best: { i: number; score: number } | null = null;
        for (let i = 0; i < 3; i += 1) {
          const edge = model[i] - market[i];
          if (model[i] < minProb || edge < minEdge || edge > MAX_TRUSTED_EDGE) continue;
          if (odds[i] > maxOdds) continue;
          const score = model[i] * edge;
          if (!best || score > best.score) best = { i, score };
        }
        if (best) {
          const i = best.i;
          consider(
            "1x2",
            LABELS[i],
            model[i],
            market[i],
            odds[i],
            rules[i],
          );
        }
      }
    }

    // Goles 2.5
    if (match.odds_over25 && match.odds_under25) {
      const fair = fairTwoWay(match.odds_over25, match.odds_under25);
      if (fair) {
        consider(
          "goles",
          `Más de 2.5 goles`,
          prediction.over25,
          fair.over,
          match.odds_over25,
          { type: "over_goals", line: 2.5 },
        );
        consider(
          "goles",
          `Menos de 2.5 goles`,
          1 - prediction.over25,
          fair.under,
          match.odds_under25,
          { type: "under_goals", line: 2.5 },
        );
      }
    }

    // Córners, tarjetas y tiros al arco con cuotas reales
    for (const row of oddsByMatch.get(match.id) ?? []) {
      if (row.market === "corners") {
        const modelOver = cornersProb(match, row.line);
        const fair = fairTwoWay(row.over_odds, row.under_odds);
        if (modelOver === null || !fair) continue;
        consider(
          "corners",
          `Córners más de ${row.line}`,
          modelOver,
          fair.over,
          row.over_odds ?? 0,
          { type: "corners_over", line: row.line },
        );
        consider(
          "corners",
          `Córners menos de ${row.line}`,
          1 - modelOver,
          fair.under,
          row.under_odds ?? 0,
          { type: "corners_under", line: row.line },
        );
      } else if (row.market === "cards") {
        const modelOver = cardsProb(match, row.line);
        const fair = fairTwoWay(row.over_odds, row.under_odds);
        if (modelOver === null || !fair) continue;
        consider(
          "cards",
          `Tarjetas más de ${row.line}`,
          modelOver,
          fair.over,
          row.over_odds ?? 0,
          { type: "cards_over", line: row.line },
        );
        consider(
          "cards",
          `Tarjetas menos de ${row.line}`,
          1 - modelOver,
          fair.under,
          row.under_odds ?? 0,
          { type: "cards_under", line: row.line },
        );
      } else if (row.market === "sot") {
        const modelOver = sotProb(match, row.line);
        const fair = fairTwoWay(row.over_odds, row.under_odds);
        if (modelOver === null || !fair) continue;
        consider(
          "sot",
          `Tiros al arco más de ${row.line}`,
          modelOver,
          fair.over,
          row.over_odds ?? 0,
          { type: "sot_over", line: row.line },
        );
        consider(
          "sot",
          `Tiros al arco menos de ${row.line}`,
          1 - modelOver,
          fair.under,
          row.under_odds ?? 0,
          { type: "sot_under", line: row.line },
        );
      }
    }
  }

  return picks.sort((a, b) => b.modelProb * b.edge - a.modelProb * a.edge);
}
