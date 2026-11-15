import { fitRatings, type PlayedMatch, type Ratings, type TeamRating } from "./model";
import { normalizeTeam } from "./teamMatch";

/**
 * Anclaje de las copas a las ligas domésticas.
 *
 * El modelo de copa se entrena solo con partidos de la copa. Muchos equipos
 * aparecen por primera vez (recién clasificados), así que sus ratings de copa
 * serían un valor neutro. Aquí se rellenan con su rating doméstico, corregido
 * por un factor de fuerza de su liga estimado a partir de los equipos de esa
 * liga que sí jugaron la copa.
 */

type Factor = { att: number; def: number };

export type DomesticEntry = {
  leagueCode: string;
  goals: TeamRating;
  sot: TeamRating;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Índice equipo normalizado -> rating doméstico (goles y tiros al arco). */
export function buildDomesticIndex(
  matches: PlayedMatch[],
  refDate: string,
): Map<string, DomesticEntry> {
  const byLeague = new Map<string, PlayedMatch[]>();
  for (const match of matches) {
    const list = byLeague.get(match.leagueCode) ?? [];
    list.push(match);
    byLeague.set(match.leagueCode, list);
  }

  const index = new Map<string, DomesticEntry>();
  for (const [leagueCode, leagueMatches] of byLeague) {
    if (leagueMatches.length < 20) continue;
    const goals = fitRatings(leagueMatches, refDate, { halfLifeDays: 90 });
    const sot = fitRatings(leagueMatches, refDate, {
      halfLifeDays: 90,
      metric: "sot",
    });

    for (const [team, rating] of goals.teams) {
      const key = normalizeTeam(team);
      const apps = rating.matchesHome + rating.matchesAway;
      const previous = index.get(key);
      const previousApps = previous
        ? previous.goals.matchesHome + previous.goals.matchesAway
        : -1;
      if (apps >= previousApps) {
        index.set(key, {
          leagueCode,
          goals: rating,
          sot: sot.teams.get(team) ?? rating,
        });
      }
    }
  }

  return index;
}

/**
 * Factor de liga: cuánto se mueve un equipo de esa liga al pasar de la escala
 * doméstica a la de la copa. Se estima comparando el rating de copa de cada
 * equipo con su rating doméstico (así se cancela la calidad propia del equipo).
 */
function buildLeagueFactors(
  cup: Ratings,
  domestic: Map<string, DomesticEntry>,
  metric: "goals" | "sot",
): Map<string, Factor> {
  const acc = new Map<string, { att: number; def: number; n: number }>();

  for (const [team, rating] of cup.teams) {
    const entry = domestic.get(normalizeTeam(team));
    if (!entry) continue;

    // Muestra mínima en copa para que el ratio no sea puro ruido.
    const apps = rating.matchesHome + rating.matchesAway;
    if (apps < 2.5) continue;

    const local = metric === "goals" ? entry.goals : entry.sot;
    const localAtt = (local.attHome + local.attAway) / 2;
    const localDef = (local.defHome + local.defAway) / 2;
    if (localAtt <= 0.2 || localDef <= 0.2) continue;

    const cupAtt = (rating.attHome + rating.attAway) / 2;
    const cupDef = (rating.defHome + rating.defAway) / 2;
    const attRatio = clamp(cupAtt / localAtt, 0.5, 2);
    const defRatio = clamp(cupDef / localDef, 0.5, 2);

    const current = acc.get(entry.leagueCode) ?? { att: 0, def: 0, n: 0 };
    current.att += Math.log(attRatio);
    current.def += Math.log(defRatio);
    current.n += 1;
    acc.set(entry.leagueCode, current);
  }

  const factors = new Map<string, Factor>();
  for (const [league, { att, def, n }] of acc) {
    const shrink = n / (n + 2);
    factors.set(league, {
      att: Math.exp((att / n) * shrink),
      def: Math.exp((def / n) * shrink),
    });
  }
  return factors;
}

/**
 * Devuelve copias de los ratings de copa con los equipos "fríos" rellenos
 * desde su liga doméstica. No modifica los originales.
 */
export function augmentWithDomestic(
  cupGoals: Ratings,
  cupSot: Ratings,
  domestic: Map<string, DomesticEntry>,
  teams: string[],
): { goals: Ratings; sot: Ratings } {
  const goalFactors = buildLeagueFactors(cupGoals, domestic, "goals");
  const sotFactors = buildLeagueFactors(cupSot, domestic, "sot");

  const goals: Ratings = {
    baseline: cupGoals.baseline,
    teams: new Map(cupGoals.teams),
  };
  const sot: Ratings = {
    baseline: cupSot.baseline,
    teams: new Map(cupSot.teams),
  };

  for (const team of teams) {
    const entry = domestic.get(normalizeTeam(team));
    if (!entry) continue;

    const goalCup = goals.teams.get(team);
    const goalApps = goalCup ? goalCup.matchesHome + goalCup.matchesAway : 0;
    if (!goalCup || goalApps < 2.5) {
      const factor = goalFactors.get(entry.leagueCode) ?? { att: 1, def: 1 };
      goals.teams.set(team, {
        ...entry.goals,
        attHome: entry.goals.attHome * factor.att,
        attAway: entry.goals.attAway * factor.att,
        defHome: entry.goals.defHome * factor.def,
        defAway: entry.goals.defAway * factor.def,
        matchesHome: 4,
        matchesAway: 4,
      });
    }

    const sotCup = sot.teams.get(team);
    const sotApps = sotCup ? sotCup.matchesHome + sotCup.matchesAway : 0;
    if (!sotCup || sotApps < 2.5) {
      const factor = sotFactors.get(entry.leagueCode) ?? { att: 1, def: 1 };
      sot.teams.set(team, {
        ...entry.sot,
        attHome: entry.sot.attHome * factor.att,
        attAway: entry.sot.attAway * factor.att,
        defHome: entry.sot.defHome * factor.def,
        defAway: entry.sot.defAway * factor.def,
        matchesHome: 4,
        matchesAway: 4,
      });
    }
  }

  return { goals, sot };
}
