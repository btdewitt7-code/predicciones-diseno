import type { Combo, ComboLeg } from "./combos";

export const FIRST_HALF_LINES = [0.5, 1.5, 2.5] as const;

export type FirstHalfLine = (typeof FIRST_HALF_LINES)[number];

export type FirstHalfMatch = {
  id: number;
  home_team: string;
  away_team: string;
  league_code: string;
  kickoff: string;
  prediction: {
    ht_over05: number;
    ht_over15: number;
    ht_over25: number;
  };
};

export function firstHalfProbability(match: FirstHalfMatch, line: number): number {
  if (line === 0.5) return match.prediction.ht_over05;
  if (line === 1.5) return match.prediction.ht_over15;
  if (line === 2.5) return match.prediction.ht_over25;
  return 0;
}

/**
 * Construye la selección de primer tiempo. El orden de las claves importa:
 * el hash que evita duplicados se calcula con este mismo objeto.
 */
export function firstHalfLeg(match: FirstHalfMatch, line: number): ComboLeg {
  return {
    matchId: match.id,
    matchLabel: `${match.home_team} vs ${match.away_team}`,
    leagueCode: match.league_code,
    kickoff: match.kickoff,
    market: `1T: más de ${line} goles`,
    category: "1t",
    probability: firstHalfProbability(match, line),
    rule: { type: "ht_over", line },
  };
}

export function firstHalfCombo(match: FirstHalfMatch, line: number): Combo {
  const leg = firstHalfLeg(match, line);
  return {
    id: `1t-${match.id}-${line}`,
    title: `1T · ${match.home_team} vs ${match.away_team}`,
    description: "",
    legs: [leg],
    probability: leg.probability,
    fairOdds: leg.probability > 0 ? 1 / leg.probability : 0,
  };
}
