import type { ComboLeg } from "./combos";
import type { MatchRow } from "./queries";

export type LegResult = "won" | "lost" | "pending";
export type ComboStatus = "won" | "lost" | "pending";

export type EvaluatedLeg = {
  leg: ComboLeg;
  result: LegResult;
  detail: string;
};

export type EvaluatedCombo = {
  status: ComboStatus;
  legs: EvaluatedLeg[];
  won: number;
  lost: number;
  pending: number;
};

function sumOrNull(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a + b;
}

function evaluate(condition: boolean | null): LegResult {
  if (condition === null) return "pending";
  return condition ? "won" : "lost";
}

export function evaluateLeg(leg: ComboLeg, match: MatchRow | undefined): EvaluatedLeg {
  if (!match) return { leg, result: "pending", detail: "sin datos" };
  if (match.status !== "played") return { leg, result: "pending", detail: "por jugar" };

  const home = match.home_goals ?? 0;
  const away = match.away_goals ?? 0;
  const total = home + away;

  switch (leg.rule.type) {
    case "home_win":
      return { leg, result: evaluate(home > away), detail: `${home}-${away}` };
    case "draw":
      return { leg, result: evaluate(home === away), detail: `${home}-${away}` };
    case "home_or_draw":
      return { leg, result: evaluate(home >= away), detail: `${home}-${away}` };
    case "away_or_draw":
      return { leg, result: evaluate(away >= home), detail: `${home}-${away}` };
    case "away_win":
      return { leg, result: evaluate(away > home), detail: `${home}-${away}` };
    case "over_goals":
      return { leg, result: evaluate(total > leg.rule.line), detail: `${total} goles` };
    case "under_goals":
      return { leg, result: evaluate(total < leg.rule.line), detail: `${total} goles` };
    case "team_goals_over": {
      const goals = leg.rule.team === "home" ? match.home_goals : match.away_goals;
      return {
        leg,
        result: evaluate(goals === null ? null : goals > leg.rule.line),
        detail: goals === null ? "sin goles" : `${goals} goles (${leg.rule.team === "home" ? "local" : "visitante"})`,
      };
    }
    case "btts":
      return {
        leg,
        result: evaluate(home > 0 && away > 0),
        detail: home > 0 && away > 0 ? "sí" : "no",
      };
    case "ht_over": {
      const ht = sumOrNull(match.ht_home_goals, match.ht_away_goals);
      return {
        leg,
        result: evaluate(ht === null ? null : ht > leg.rule.line),
        detail: ht === null ? "sin datos 1T" : `${ht} goles 1T`,
      };
    }
    case "corners_over": {
      const corners = sumOrNull(match.home_corners, match.away_corners);
      return {
        leg,
        result: evaluate(corners === null ? null : corners > leg.rule.line),
        detail: corners === null ? "sin córners" : `${corners} córners`,
      };
    }
    case "corners_under": {
      const corners = sumOrNull(match.home_corners, match.away_corners);
      return {
        leg,
        result: evaluate(corners === null ? null : corners < leg.rule.line),
        detail: corners === null ? "sin córners" : `${corners} córners`,
      };
    }
    case "cards_over": {
      const cards = sumOrNull(
        sumOrNull(match.home_yellow, match.away_yellow),
        sumOrNull(match.home_red, match.away_red),
      );
      return {
        leg,
        result: evaluate(cards === null ? null : cards > leg.rule.line),
        detail: cards === null ? "sin tarjetas" : `${cards} tarjetas`,
      };
    }
    case "cards_under": {
      const cards = sumOrNull(
        sumOrNull(match.home_yellow, match.away_yellow),
        sumOrNull(match.home_red, match.away_red),
      );
      return {
        leg,
        result: evaluate(cards === null ? null : cards < leg.rule.line),
        detail: cards === null ? "sin tarjetas" : `${cards} tarjetas`,
      };
    }
    case "shots_over": {
      const shots = sumOrNull(match.home_shots, match.away_shots);
      return {
        leg,
        result: evaluate(shots === null ? null : shots > leg.rule.line),
        detail: shots === null ? "sin remates" : `${shots} remates`,
      };
    }
    case "shots_under": {
      const shots = sumOrNull(match.home_shots, match.away_shots);
      return {
        leg,
        result: evaluate(shots === null ? null : shots < leg.rule.line),
        detail: shots === null ? "sin remates" : `${shots} remates`,
      };
    }
    case "sot_over": {
      const sot = sumOrNull(match.home_sot, match.away_sot);
      return {
        leg,
        result: evaluate(sot === null ? null : sot > leg.rule.line),
        detail: sot === null ? "sin tiros al arco" : `${sot} al arco`,
      };
    }
    case "sot_under": {
      const sot = sumOrNull(match.home_sot, match.away_sot);
      return {
        leg,
        result: evaluate(sot === null ? null : sot < leg.rule.line),
        detail: sot === null ? "sin tiros al arco" : `${sot} al arco`,
      };
    }
    default:
      return { leg, result: "pending", detail: "" };
  }
}

export function evaluateCombo(
  legs: ComboLeg[],
  matches: Map<number, MatchRow>,
): EvaluatedCombo {
  const evaluated = legs.map((leg) => evaluateLeg(leg, matches.get(leg.matchId)));
  const lost = evaluated.filter((item) => item.result === "lost").length;
  const won = evaluated.filter((item) => item.result === "won").length;
  const pending = evaluated.filter((item) => item.result === "pending").length;

  const status: ComboStatus = lost > 0 ? "lost" : pending === 0 && won === legs.length ? "won" : "pending";

  return { status, legs: evaluated, won, lost, pending };
}
