import type { RatedMatch } from "./queries";
import { dayKey, todayKey } from "./format";
import { isVetoed } from "./veto";
import { LEAGUE_BY_CODE } from "./leagues";

export type ComboCategory =
  | "ganador"
  | "goles"
  | "btts"
  | "1t"
  | "corners"
  | "remates"
  | "tarjetas";

export type ComboRule =
  | { type: "home_win" }
  | { type: "draw" }
  | { type: "away_win" }
  | { type: "home_or_draw" }
  | { type: "away_or_draw" }
  | { type: "over_goals"; line: number }
  | { type: "under_goals"; line: number }
  | { type: "team_goals_over"; team: "home" | "away"; line: number }
  | { type: "btts" }
  | { type: "ht_over"; line: number }
  | { type: "corners_over"; line: number }
  | { type: "corners_under"; line: number }
  | { type: "cards_over"; line: number }
  | { type: "cards_under"; line: number }
  | { type: "shots_over"; line: number }
  | { type: "shots_under"; line: number }
  | { type: "sot_over"; line: number }
  | { type: "sot_under"; line: number };

export type ComboLeg = {
  matchId: number;
  matchLabel: string;
  leagueCode: string;
  kickoff: string;
  market: string;
  category: ComboCategory;
  probability: number;
  rule: ComboRule;
  /** El equipo tiene bajas que mueven el modelo de forma importante. */
  risky?: boolean;
};

export type Combo = {
  id: string;
  title: string;
  description: string;
  legs: ComboLeg[];
  probability: number;
  fairOdds: number;
};

const MAX_LEGS = 3;
const WINDOW_HOURS = 48;
const MIN_PROB = 0.55;
const MAX_PROB = 0.93;
/** Cuántos partidos de hoy hacen falta para darles prioridad. */
const TODAY_MIN_MATCHES = 3;
/** Ventaja de probabilidad para las selecciones de hoy. */
const TODAY_BOOST = 0.05;

function legsOf(match: RatedMatch, vetoed: Set<string>): ComboLeg[] {
  const prediction = match.prediction;
  if (!prediction) return [];

  const base = {
    matchId: match.id,
    matchLabel: `${match.home_team} vs ${match.away_team}`,
    leagueCode: match.league_code,
    kickoff: match.kickoff,
  };

  const limitedStats = LEAGUE_BY_CODE[match.league_code]?.limitedStats === true;

  const winnerLegs: {
    market: string;
    category: ComboCategory;
    probability: number;
    rule: ComboRule;
  }[] = [];

  if (!isVetoed(vetoed, match.league_code, match.home_team)) {
    winnerLegs.push({
      market: `Gana ${match.home_team}`,
      category: "ganador",
      probability: prediction.home_win,
      rule: { type: "home_win" },
    });
  }
  if (!isVetoed(vetoed, match.league_code, match.away_team)) {
    winnerLegs.push({
      market: `Gana ${match.away_team}`,
      category: "ganador",
      probability: prediction.away_win,
      rule: { type: "away_win" },
    });
  }

  const candidates: {
    market: string;
    category: ComboCategory;
    probability: number;
    rule: ComboRule;
  }[] = [
    ...winnerLegs,
    {
      market: "Más de 1.5 goles",
      category: "goles",
      probability: prediction.over15,
      rule: { type: "over_goals", line: 1.5 },
    },
    {
      market: "Más de 2.5 goles",
      category: "goles",
      probability: prediction.over25,
      rule: { type: "over_goals", line: 2.5 },
    },
    {
      market: "Menos de 3.5 goles",
      category: "goles",
      probability: 1 - prediction.over35,
      rule: { type: "under_goals", line: 3.5 },
    },
    {
      market: "Ambos marcan",
      category: "btts",
      probability: prediction.btts,
      rule: { type: "btts" },
    },
  ];

  if (prediction.ht_over05 > 0) {
    candidates.push({
      market: "1T: más de 0.5 goles",
      category: "1t",
      probability: prediction.ht_over05,
      rule: { type: "ht_over", line: 0.5 },
    });
    candidates.push({
      market: "1T: más de 1.5 goles",
      category: "1t",
      probability: prediction.ht_over15,
      rule: { type: "ht_over", line: 1.5 },
    });
  }
  if (!limitedStats && prediction.corners_over85 > 0) {
    candidates.push({
      market: "Córners más de 8.5",
      category: "corners",
      probability: prediction.corners_over85,
      rule: { type: "corners_over", line: 8.5 },
    });
    candidates.push({
      market: "Córners más de 9.5",
      category: "corners",
      probability: prediction.corners_over95,
      rule: { type: "corners_over", line: 9.5 },
    });
  }
  if (prediction.cards_over35 > 0) {
    candidates.push({
      market: "Tarjetas más de 3.5",
      category: "tarjetas",
      probability: prediction.cards_over35,
      rule: { type: "cards_over", line: 3.5 },
    });
  }
  if (!limitedStats && prediction.shots_over205 > 0) {
    candidates.push({
      market: "Remates más de 20.5",
      category: "remates",
      probability: prediction.shots_over205,
      rule: { type: "shots_over", line: 20.5 },
    });
    candidates.push({
      market: "Remates más de 22.5",
      category: "remates",
      probability: prediction.shots_over225,
      rule: { type: "shots_over", line: 22.5 },
    });
  }
  if (!limitedStats && prediction.sot_over85 > 0) {
    candidates.push({
      market: "Tiros al arco más de 7.5",
      category: "remates",
      probability: prediction.sot_over85,
      rule: { type: "sot_over", line: 7.5 },
    });
  }

  return candidates.map((candidate) => ({ ...base, ...candidate }));
}

function buildLegs(
  matches: RatedMatch[],
  vetoed: Set<string>,
  riskyMatches?: Set<number>,
): ComboLeg[] {
  const now = Date.now() - 30 * 60_000;
  const horizon = now + WINDOW_HOURS * 3600_000;
  const today = todayKey();

  const upcoming = matches.filter((match) => {
    const kickoff = Date.parse(`${match.kickoff}Z`);
    return kickoff >= now && kickoff <= horizon;
  });

  // Si hoy quedan pocos partidos (tarde), se usan los de los próximos días.
  const todayCount = upcoming.filter((match) => dayKey(match.kickoff) === today).length;
  const boostToday = todayCount >= TODAY_MIN_MATCHES;

  return upcoming
    .flatMap((match) => legsOf(match, vetoed))
    .filter((leg) => {
      if (leg.probability < MIN_PROB || leg.probability > MAX_PROB) return false;
      // El primer tiempo es más volátil: exigimos 65% o más.
      if (leg.category === "1t" && leg.probability < 0.65) return false;
      return true;
    })
    .map((leg) => ({
      leg,
      score:
        leg.probability +
        (boostToday && dayKey(leg.kickoff) === today ? TODAY_BOOST : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => ({
      ...item.leg,
      risky: riskyMatches?.has(item.leg.matchId) ?? false,
    }));
}

function pickSequential(
  pool: ComboLeg[],
  options: {
    from?: number;
    filter?: (leg: ComboLeg) => boolean;
    diversify?: boolean;
    max?: number;
    uniqueLeagues?: boolean;
    usage?: Map<number, number>;
    maxUsage?: number;
    leagueUsage?: Map<string, number>;
    maxLeagueUsage?: number;
    marketUsage?: Map<string, number>;
    maxMarketUsage?: number;
  },
): ComboLeg[] {
  const legs: ComboLeg[] = [];
  const usedMatches = new Set<number>();
  const usedCategories = new Set<string>();
  const usedLeagues = new Set<string>();
  const max = options.max ?? MAX_LEGS;

  for (let i = options.from ?? 0; i < pool.length && legs.length < max; i += 1) {
    const leg = pool[i];
    if (options.filter && !options.filter(leg)) continue;
    if (usedMatches.has(leg.matchId)) continue;
    if (options.diversify && usedCategories.has(leg.category)) continue;
    if (options.uniqueLeagues && usedLeagues.has(leg.leagueCode)) continue;
    if (
      options.usage &&
      options.maxUsage &&
      (options.usage.get(leg.matchId) ?? 0) >= options.maxUsage
    ) {
      continue;
    }
    if (
      options.leagueUsage &&
      options.maxLeagueUsage &&
      (options.leagueUsage.get(leg.leagueCode) ?? 0) >= options.maxLeagueUsage
    ) {
      continue;
    }
    if (
      options.marketUsage &&
      options.maxMarketUsage &&
      (options.marketUsage.get(leg.market) ?? 0) >= options.maxMarketUsage
    ) {
      continue;
    }
    legs.push(leg);
    usedMatches.add(leg.matchId);
    usedCategories.add(leg.category);
    usedLeagues.add(leg.leagueCode);
  }

  return legs;
}

/** Elige una selección por cada "hueco", probando categorías en orden. */
function pickSlots(pool: ComboLeg[], slots: ComboCategory[][]): ComboLeg[] {
  const legs: ComboLeg[] = [];
  const usedMatches = new Set<number>();

  for (const slot of slots) {
    const leg = pool.find(
      (candidate) => slot.includes(candidate.category) && !usedMatches.has(candidate.matchId),
    );
    if (leg) {
      legs.push(leg);
      usedMatches.add(leg.matchId);
    }
  }

  return legs;
}

function combo(id: string, title: string, description: string, legs: ComboLeg[]): Combo {
  const probability = legs.reduce((acc, leg) => acc * leg.probability, 1);
  return {
    id,
    title,
    description,
    legs,
    probability,
    fairOdds: probability > 0 ? 1 / probability : 0,
  };
}

type Strategy = {
  id: string;
  title: string;
  description: string;
  max: number;
  variants: number;
  minLegs?: number;
  filter?: (leg: ComboLeg) => boolean;
  diversify?: boolean;
  uniqueLeagues?: boolean;
  pool?: ComboLeg[];
  pick?: (pool: ComboLeg[]) => ComboLeg[];
};

const MAX_COMBOS = 30;

/** Estrategias de alta probabilidad que no deben usar equipos con bajas graves. */
const SAFE_STRATEGIES = new Set(["simple", "doble", "triple"]);

export function buildCombos(
  matches: RatedMatch[],
  vetoed: Set<string> = new Set(),
  riskyMatches?: Set<number>,
): Combo[] {
  const pool = buildLegs(matches, vetoed, riskyMatches);
  if (pool.length === 0) return [];

  const safePool = pool.filter((leg) => !leg.risky);

  const combos: Combo[] = [];
  const seen = new Set<string>();
  const matchUsage = new Map<number, number>();
  const leagueUsage = new Map<string, number>();
  const marketUsage = new Map<string, number>();

  const push = (item: Combo, minLegs = 1): boolean => {
    if (item.legs.length < minLegs) return false;
    const key = item.legs
      .map((leg) => `${leg.matchId}:${leg.market}`)
      .sort()
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    combos.push(item);
    for (const leg of item.legs) {
      matchUsage.set(leg.matchId, (matchUsage.get(leg.matchId) ?? 0) + 1);
      leagueUsage.set(leg.leagueCode, (leagueUsage.get(leg.leagueCode) ?? 0) + 1);
      marketUsage.set(leg.market, (marketUsage.get(leg.market) ?? 0) + 1);
    }
    return true;
  };

  // Las selecciones con menor probabilidad (siempre por encima del mínimo)
  // sirven para armar jugadas de cuota más alta.
  const highOddsPool = [...pool].sort((a, b) => a.probability - b.probability);

  const strategies: Strategy[] = [
    {
      id: "simple",
      title: "Jugada simple",
      description: "La selección más probable del día, sin combinar.",
      max: 1,
      variants: 1,
    },
    {
      id: "doble",
      title: "Doble segura",
      description: "Dos selecciones de alta probabilidad en partidos distintos.",
      max: 2,
      variants: 1,
      minLegs: 2,
    },
    {
      id: "triple",
      title: "Triple segura",
      description: "Las tres selecciones con mayor probabilidad del modelo.",
      max: 3,
      variants: 1,
      minLegs: 3,
    },
    {
      id: "clasica",
      title: "Ganador + goles + córners",
      description: "Una de cada: posible ganador, goles/ambos marcan y córners o remates.",
      max: 3,
      variants: 1,
      minLegs: 3,
      pick: (current) =>
        pickSlots(current, [["ganador"], ["goles", "btts"], ["corners", "remates"]]),
    },
    {
      id: "variada",
      title: "Mercados variados",
      description: "Tres mercados distintos sin repetir categoría.",
      max: 3,
      variants: 4,
      minLegs: 3,
      diversify: true,
    },
    {
      id: "goles",
      title: "Fiesta de goles",
      description: "Goles y ambos marcan en partidos con tendencia ofensiva.",
      max: 3,
      variants: 4,
      minLegs: 2,
      diversify: true,
      filter: (leg) => leg.category === "goles" || leg.category === "btts",
    },
    {
      id: "primer-tiempo",
      title: "Todo al primer tiempo",
      description: "Solo goles antes del descanso.",
      max: 3,
      variants: 4,
      minLegs: 2,
      filter: (leg) => leg.category === "1t",
    },
    {
      id: "cerrada",
      title: "Partido cerrado",
      description: "Menos goles, córners y remates: apuestas de partido trabado.",
      max: 3,
      variants: 4,
      minLegs: 2,
      diversify: true,
      filter: (leg) =>
        leg.market.includes("Menos de") ||
        leg.category === "corners" ||
        leg.category === "remates",
    },
    {
      id: "corners",
      title: "Lluvia de córners",
      description: "Partidos con tendencia a muchos córners.",
      max: 3,
      variants: 3,
      minLegs: 2,
      filter: (leg) => leg.category === "corners",
    },
    {
      id: "remates",
      title: "Partidos con remates",
      description: "Tiros y tiros al arco por encima de la media.",
      max: 3,
      variants: 3,
      minLegs: 2,
      filter: (leg) => leg.category === "remates",
    },
    {
      id: "tarjetas",
      title: "Partidos calientes",
      description: "Tarjetas por encima de la media en partidos picantes.",
      max: 3,
      variants: 3,
      minLegs: 2,
      filter: (leg) => leg.category === "tarjetas",
    },
    {
      id: "ligas",
      title: "Mezcla de ligas",
      description: "Tres selecciones de ligas distintas para repartir el riesgo.",
      max: 3,
      variants: 3,
      minLegs: 3,
      uniqueLeagues: true,
      diversify: true,
    },
    {
      id: "cuota",
      title: "Cuota alta",
      description: "Selecciones algo menos probables pero con mejor cuota justa.",
      max: 2,
      variants: 3,
      minLegs: 2,
      pool: highOddsPool,
    },
    {
      id: "favoritos",
      title: "Favoritos del día",
      description: "Solo ganadores: locales o visitantes que el modelo ve claros.",
      max: 3,
      variants: 3,
      minLegs: 2,
      filter: (leg) => leg.category === "ganador",
    },
  ];

  const MAX_VARIANTS = 4;
  /** Cada cuántos puestos se desplaza el pool en cada variante. */
  const STRIDE = 5;
  /** Cuántas veces puede repetirse un mismo partido entre todas las jugadas. */
  const MAX_MATCH_USAGE = 2;
  /** Cuántas selecciones puede aportar una misma liga. */
  const MAX_LEAGUE_USAGE = 6;
  /** Cuántas veces puede repetirse el mismo mercado en toda la lista. */
  const MAX_MARKET_USAGE = 5;

  for (let round = 0; round < MAX_VARIANTS; round += 1) {
    for (const strategy of strategies) {
      if (round >= strategy.variants) continue;

      const legs = strategy.pick
        ? strategy.pick(
            strategy.pool ?? (SAFE_STRATEGIES.has(strategy.id) ? safePool : pool),
          )
        : pickSequential(
            strategy.pool ?? (SAFE_STRATEGIES.has(strategy.id) ? safePool : pool),
            {
              from: round * STRIDE,
              max: strategy.max,
              filter: strategy.filter,
              diversify: strategy.diversify,
              uniqueLeagues: strategy.uniqueLeagues,
              usage: matchUsage,
              maxUsage: MAX_MATCH_USAGE,
              leagueUsage,
              maxLeagueUsage: MAX_LEAGUE_USAGE,
              marketUsage,
              maxMarketUsage: MAX_MARKET_USAGE,
            },
          );

      const minLegs = strategy.minLegs ?? 1;
      if (legs.length < minLegs) continue;

      const title = round === 0 ? strategy.title : `${strategy.title} ${round + 1}`;
      push(combo(`${strategy.id}-${round}`, title, strategy.description, legs), minLegs);

      if (combos.length >= MAX_COMBOS) return combos;
    }
  }

  return combos;
}

const DREAM_SIZES = [6, 9, 12];
const DREAM_MIN = 0.45;
const DREAM_MAX = 0.72;

/**
 * Combinadas largas ("soñadoras"): muchas selecciones, ligas mezcladas y
 * sin el límite de 3. Alto riesgo, cuota alta.
 */
export function buildDreamCombos(
  matches: RatedMatch[],
  vetoed: Set<string> = new Set(),
): Combo[] {
  const now = Date.now() - 30 * 60_000;
  const horizon = now + WINDOW_HOURS * 3600_000;
  const today = todayKey();

  const pool = matches
    .filter((match) => {
      const kickoff = Date.parse(`${match.kickoff}Z`);
      return kickoff >= now && kickoff <= horizon;
    })
    .flatMap((match) => legsOf(match, vetoed))
    .filter((leg) => leg.probability >= DREAM_MIN && leg.probability <= DREAM_MAX)
    .filter((leg) => !(leg.category === "1t" && leg.probability < 0.65))
    .map((leg) => ({
      leg,
      score: leg.probability + (dayKey(leg.kickoff) === today ? 0.03 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.leg);

  const combos: Combo[] = [];
  const seen = new Set<string>();

  const pick = (size: number, start: number): ComboLeg[] => {
    const legs: ComboLeg[] = [];
    const usedMatches = new Set<number>();
    const usedLeagues = new Set<string>();

    // Primero una selección por liga (máxima variedad).
    for (let i = start; i < pool.length && legs.length < size; i += 1) {
      const leg = pool[i];
      if (usedMatches.has(leg.matchId) || usedLeagues.has(leg.leagueCode)) continue;
      legs.push(leg);
      usedMatches.add(leg.matchId);
      usedLeagues.add(leg.leagueCode);
    }

    // Si faltan, completamos con cualquier partido distinto.
    for (let i = 0; i < pool.length && legs.length < size; i += 1) {
      const leg = pool[i];
      if (usedMatches.has(leg.matchId)) continue;
      legs.push(leg);
      usedMatches.add(leg.matchId);
    }

    return legs;
  };

  DREAM_SIZES.forEach((size, sizeIndex) => {
    for (let variant = 0; variant < 3; variant += 1) {
      const legs = pick(size, variant * 9 + sizeIndex * 3);
      if (legs.length < 4) continue;

      const key = legs
        .map((leg) => `${leg.matchId}:${leg.market}`)
        .sort()
        .join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      const letter = ["A", "B", "C"][variant] ?? String(variant + 1);
      const realSize = legs.length;
      combos.push(
        combo(
          `sonadora-${realSize}-${variant}`,
          `Soñadora x${realSize} · ${letter}`,
          `${realSize} selecciones de ligas distintas. Variante ${letter}. Alto riesgo.`,
          legs,
        ),
      );
    }
  });

  return combos;
}
