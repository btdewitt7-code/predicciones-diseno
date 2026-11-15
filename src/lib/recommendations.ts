import type { Combo, ComboCategory, ComboLeg, ComboRule } from "./combos";
import type { MatchRow, PredictionRow } from "./queries";
import { fairProbabilities } from "./format";
import { isHtVetoed, isVetoed } from "./veto";
import { LEAGUE_BY_CODE } from "./leagues";

export type Recommendation = {
  id: string;
  label: string;
  market: string;
  probability: number;
  fairOdds: number;
  edge: number | null;
  combo: Combo;
};

type Candidate = {
  id: string;
  market: string;
  category: ComboCategory;
  probability: number;
  rule: ComboRule;
  edge: number | null;
};

const MIN_PROB = 0.55;
const MAX_PROB = 0.9;
const MIN_VALUE = 0.06;

/**
 * Sugerencias para un solo partido: la más probable, la de mejor valor
 * frente a la cuota y una de goles/córners. No guarda nada por sí sola.
 */
export function buildRecommendations(
  match: MatchRow,
  prediction: PredictionRow,
  vetoed: Set<string> = new Set(),
  htVetoed: Set<string> = new Set(),
  cupMode = false,
): Recommendation[] {
  const market = fairProbabilities(
    match.close_home ?? match.odds_home,
    match.close_draw ?? match.odds_draw,
    match.close_away ?? match.odds_away,
  );

  const candidates: Candidate[] = [];
  const add = (
    id: string,
    marketLabel: string,
    category: ComboCategory,
    probability: number,
    rule: ComboRule,
    edge: number | null = null,
  ) => {
    if (!Number.isFinite(probability) || probability <= 0.05 || probability >= 0.97) return;
    // El primer tiempo exige 65% o más para aparecer como recomendación.
    if (category === "1t" && probability < 0.65) return;
    candidates.push({ id, market: marketLabel, category, probability, rule, edge });
  };

  const homeVetoed = isVetoed(vetoed, match.league_code, match.home_team);
  const awayVetoed = isVetoed(vetoed, match.league_code, match.away_team);
  const htVetoedMatch =
    isHtVetoed(htVetoed, match.league_code, match.home_team) ||
    isHtVetoed(htVetoed, match.league_code, match.away_team);

  if (!homeVetoed) {
    add(
      "home",
      `Gana ${match.home_team}`,
      "ganador",
      prediction.home_win,
      { type: "home_win" },
      market ? prediction.home_win - market[0] : null,
    );
  }
  add(
    "draw",
    "Empate",
    "ganador",
    prediction.draw,
    { type: "draw" },
    market ? prediction.draw - market[1] : null,
  );
  if (!awayVetoed) {
    add(
      "away",
      `Gana ${match.away_team}`,
      "ganador",
      prediction.away_win,
      { type: "away_win" },
      market ? prediction.away_win - market[2] : null,
    );
  }

  const favoriteIsHome = prediction.home_win >= prediction.away_win;
  const favoriteTeam = favoriteIsHome ? match.home_team : match.away_team;
  const favoriteVetoed = favoriteIsHome ? homeVetoed : awayVetoed;
  const doubleChanceProb = favoriteIsHome
    ? prediction.home_win + prediction.draw
    : prediction.away_win + prediction.draw;

  // Doble oportunidad: solo se oculta cuando el favorito tiene 70% o más.
  const favoriteWinProb = Math.max(prediction.home_win, prediction.away_win);
  const doubleChancePaysTooLittle = Math.round(favoriteWinProb * 100) >= 70;

  if (!favoriteVetoed && (cupMode || !doubleChancePaysTooLittle)) {
    add(
      "dc",
      `${favoriteTeam} o empate`,
      "ganador",
      doubleChanceProb,
      favoriteIsHome ? { type: "home_or_draw" } : { type: "away_or_draw" },
    );
  }

  const expectedTotal = prediction.exp_home_goals + prediction.exp_away_goals;

  add("over15", "Más de 1.5 goles", "goles", prediction.over15, {
    type: "over_goals",
    line: 1.5,
  });
  add(
    "over25",
    "Más de 2.5 goles",
    "goles",
    prediction.over25,
    { type: "over_goals", line: 2.5 },
    match.odds_over25 ? prediction.over25 - 1 / match.odds_over25 : null,
  );
  add(
    "under25",
    "Menos de 2.5 goles",
    "goles",
    1 - prediction.over25,
    { type: "under_goals", line: 2.5 },
    match.odds_under25 ? 1 - prediction.over25 - 1 / match.odds_under25 : null,
  );
  // Under 3.5 solo si el partido se espera cerrado. Con xG > 2.5 el under
  // es frágil: un solo gol lo deja al borde y dos lo tumban.
  if (expectedTotal <= 2.5) {
    add("under35", "Menos de 3.5 goles", "goles", 1 - prediction.over35, {
      type: "under_goals",
      line: 3.5,
    });
  }
  add("btts", "Ambos marcan", "btts", prediction.btts, { type: "btts" });

  const limitedStats = LEAGUE_BY_CODE[match.league_code]?.limitedStats === true;

  if (prediction.ht_over05 > 0 && !htVetoedMatch && !cupMode) {
    add("ht05", "1T: más de 0.5 goles", "1t", prediction.ht_over05, {
      type: "ht_over",
      line: 0.5,
    });
    add("ht15", "1T: más de 1.5 goles", "1t", prediction.ht_over15, {
      type: "ht_over",
      line: 1.5,
    });
  }
  if (!limitedStats && prediction.corners_over85 > 0) {
    // Solo +8.5. Las líneas +9.5 y +10.5 están sobreconfiadas: en los
    // últimos 30 días daban ~60% y acertaban ~52% y ~48%.
    add("corn85", "Córners más de 8.5", "corners", prediction.corners_over85, {
      type: "corners_over",
      line: 8.5,
    });
  }
  if (prediction.cards_over35 > 0) {
    add("cards35", "Tarjetas más de 3.5", "tarjetas", prediction.cards_over35, {
      type: "cards_over",
      line: 3.5,
    });
  }
  if (!limitedStats && prediction.shots_over205 > 0) {
    add("shots205", "Remates más de 20.5", "remates", prediction.shots_over205, {
      type: "shots_over",
      line: 20.5,
    });
  }
  if (!limitedStats && prediction.sot_over85 > 0) {
    add("sot75", "Tiros al arco más de 7.5", "remates", prediction.sot_over85, {
      type: "sot_over",
      line: 7.5,
    });
  }

  if (cupMode && prediction.exp_away_goals > 0) {
    const lambda = prediction.exp_away_goals;
    add(
      "away_over05",
      `Marca ${match.away_team}`,
      "goles",
      1 - Math.exp(-lambda),
      { type: "team_goals_over", team: "away", line: 0.5 },
    );
    add(
      "away_over15",
      `${match.away_team} 2+ goles`,
      "goles",
      1 - Math.exp(-lambda) * (1 + lambda),
      { type: "team_goals_over", team: "away", line: 1.5 },
    );
  }

  const likely = candidates.filter(
    (item) => item.probability >= MIN_PROB && item.probability <= MAX_PROB,
  );

  if (cupMode) {
    const labels: Record<ComboCategory, string> = {
      ganador: "Ganador",
      goles: "Goles",
      btts: "Ambos marcan",
      "1t": "Primer tiempo",
      corners: "Córners",
      tarjetas: "Tarjetas",
      remates: "Remates",
    };
    return candidates
      .filter((item) => item.probability >= 0.6 && item.probability < 0.9)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 8)
      .map((candidate) => {
        const leg: ComboLeg = {
          matchId: match.id,
          matchLabel: `${match.home_team} vs ${match.away_team}`,
          leagueCode: match.league_code,
          kickoff: match.kickoff,
          market: candidate.market,
          category: candidate.category,
          probability: candidate.probability,
          rule: candidate.rule,
        };
        const combo: Combo = {
          id: `rec-${match.id}-${candidate.id}`,
          title: candidate.market,
          description: `${match.home_team} vs ${match.away_team}`,
          legs: [leg],
          probability: candidate.probability,
          fairOdds: candidate.probability > 0 ? 1 / candidate.probability : 0,
        };
        return {
          id: candidate.id,
          label: candidate.id === "dc" ? "Doble oportunidad" : labels[candidate.category],
          market: candidate.market,
          probability: candidate.probability,
          fairOdds: combo.fairOdds,
          edge: null,
          combo,
        };
      });
  }

  const favoriteId = prediction.home_win >= prediction.away_win ? "home" : "away";

  const safest = [...likely].sort((a, b) => b.probability - a.probability)[0] ?? null;

  const value = cupMode
    ? null
    : candidates
        .filter(
          (item) =>
            item.id === favoriteId &&
            item.edge !== null &&
            item.edge >= MIN_VALUE &&
            item.probability >= 0.4 &&
            item.id !== safest?.id,
        )
        .sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0] ?? null;

  const secondaryPool = likely.filter(
    (item) => item.id !== safest?.id && item.id !== value?.id,
  );

  const differentCategory = secondaryPool.filter(
    (item) =>
      item.category !== safest?.category &&
      item.category !== value?.category &&
      ["goles", "btts", "corners", "1t"].includes(item.category),
  );

  const secondary =
    [...(differentCategory.length > 0 ? differentCategory : secondaryPool)].sort(
      (a, b) => b.probability - a.probability,
    )[0] ?? null;

  const favoriteWin = candidates.find((item) => item.id === favoriteId) ?? null;
  const doubleChancePick = candidates.find((item) => item.id === "dc") ?? null;

  const picks: { candidate: Candidate; label: string }[] = [];
  const pushPick = (candidate: Candidate | null, label: string) => {
    if (!candidate) return;
    if (picks.some((pick) => pick.candidate.id === candidate.id)) return;
    picks.push({ candidate, label });
  };

  // El ganador del favorito, si es claro, va primero y con su propia etiqueta.
  if (favoriteWin && favoriteWin.probability >= 0.6) pushPick(favoriteWin, "Ganador");
  pushPick(doubleChancePick, "Doble oportunidad");
  pushPick(safest, "La más probable");
  pushPick(
    value,
    value && (value.probability < 0.55 || prediction.confidence < 0.7)
      ? "Valor · riesgo alto"
      : "Valor en el favorito",
  );
  pushPick(secondary, "Alternativa");

  return picks.slice(0, 4).map(({ candidate, label }) => {
    const leg: ComboLeg = {
      matchId: match.id,
      matchLabel: `${match.home_team} vs ${match.away_team}`,
      leagueCode: match.league_code,
      kickoff: match.kickoff,
      market: candidate.market,
      category: candidate.category,
      probability: candidate.probability,
      rule: candidate.rule,
    };

    const combo: Combo = {
      id: `rec-${match.id}-${candidate.id}`,
      title: candidate.market,
      description: `${match.home_team} vs ${match.away_team}`,
      legs: [leg],
      probability: candidate.probability,
      fairOdds: candidate.probability > 0 ? 1 / candidate.probability : 0,
    };

    return {
      id: candidate.id,
      label,
      market: candidate.market,
      probability: candidate.probability,
      fairOdds: combo.fairOdds,
      edge: candidate.edge,
      combo,
    };
  });
}
