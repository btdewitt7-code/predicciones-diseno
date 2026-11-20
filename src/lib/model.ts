export type PlayedMatch = {
  id: number;
  leagueCode: string;
  kickoff: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  homeCorners: number | null;
  awayCorners: number | null;
  homeSot: number | null;
  awaySot: number | null;
  homeShots?: number | null;
  awayShots?: number | null;
  htHomeGoals?: number | null;
  htAwayGoals?: number | null;
  homeYellow?: number | null;
  awayYellow?: number | null;
  homeRed?: number | null;
  awayRed?: number | null;
};

export type TeamRating = {
  attHome: number;
  defHome: number;
  attAway: number;
  defAway: number;
  cAttHome: number;
  cDefHome: number;
  cAttAway: number;
  cDefAway: number;
  sAttHome: number;
  sDefHome: number;
  sAttAway: number;
  sDefAway: number;
  shAttHome: number;
  shDefHome: number;
  shAttAway: number;
  shDefAway: number;
  cardAttHome: number;
  cardDefHome: number;
  cardAttAway: number;
  cardDefAway: number;
  totalHome: number;
  totalAway: number;
  matchesHome: number;
  matchesAway: number;
};

export type Baseline = {
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgTotalGoals: number;
  avgHomeCorners: number;
  avgAwayCorners: number;
  avgHomeSot: number;
  avgAwaySot: number;
  avgHomeShots: number;
  avgAwayShots: number;
  avgHomeCards: number;
  avgAwayCards: number;
  /** Corrección por liga de la tendencia reciente de tarjetas (1 = sin ajuste). */
  cardFactor?: number;
  matches: number;
};

export type Ratings = {
  baseline: Baseline;
  teams: Map<string, TeamRating>;
};

export type MarketPrediction = {
  lambdaHome: number;
  lambdaAway: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  cornersHome: number;
  cornersAway: number;
  cornersOver85: number;
  cornersOver95: number;
  cornersOver105: number;
  sotHome: number;
  sotAway: number;
  sotOver85: number;
  sotOver95: number;
  shotsHome: number;
  shotsAway: number;
  shotsOver205: number;
  shotsOver225: number;
  shotsOver245: number;
  cardsHome: number;
  cardsAway: number;
  cardsOver35: number;
  cardsOver45: number;
  cardsOver55: number;
  topScores: { h: number; a: number; p: number }[];
  confidence: number;
};

const HALF_LIFE_DAYS = 180;
const SHRINK = 4;
const MAX_GOALS = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function weightFor(kickoff: string, refDate: string, halfLifeDays: number): number {
  const matchTime = Date.parse(`${kickoff}Z`);
  const refTime = Date.parse(`${refDate}Z`);
  if (!Number.isFinite(matchTime) || !Number.isFinite(refTime)) return 0;
  const days = (refTime - matchTime) / 86_400_000;
  if (days < 0) return 0;
  return Math.pow(0.5, days / halfLifeDays);
}

type Acc = {
  wH: number;
  wA: number;
  wCH: number;
  wCA: number;
  wSH: number;
  wSA: number;
  gfH: number;
  gaH: number;
  gfA: number;
  gaA: number;
  cfH: number;
  caH: number;
  cfA: number;
  caA: number;
  sfH: number;
  saH: number;
  sfA: number;
  saA: number;
  wTH: number;
  wTA: number;
  sumTH: number;
  sumTA: number;
  swH: number;
  swA: number;
  sgfH: number;
  sgaH: number;
  sgfA: number;
  sgaA: number;
  kwH: number;
  kwA: number;
  kfH: number;
  kaH: number;
  kfA: number;
  kaA: number;
};

const emptyAcc = (): Acc => ({
  wH: 0,
  wA: 0,
  wCH: 0,
  wCA: 0,
  wSH: 0,
  wSA: 0,
  gfH: 0,
  gaH: 0,
  gfA: 0,
  gaA: 0,
  cfH: 0,
  caH: 0,
  cfA: 0,
  caA: 0,
  sfH: 0,
  saH: 0,
  sfA: 0,
  saA: 0,
  wTH: 0,
  wTA: 0,
  sumTH: 0,
  sumTA: 0,
  swH: 0,
  swA: 0,
  sgfH: 0,
  sgaH: 0,
  sgfA: 0,
  sgaA: 0,
  kwH: 0,
  kwA: 0,
  kfH: 0,
  kaH: 0,
  kfA: 0,
  kaA: 0,
});

export type FitOptions = {
  halfLifeDays?: number;
  shrink?: number;
  /** "goals", "sot" (tiros al arco) o "ht" (goles del primer tiempo). */
  metric?: "goals" | "sot" | "ht";
  /** Corrección de tarjetas por liga (1 = sin ajuste). */
  cardFactor?: number;
};

/** Un tiro al arco vale ~0.32 goles (media histórica de 31.662 equipos-partido). */
const SOT_TO_GOALS = 0.3188;
/** Proporción media de goles que caen en el primer tiempo cuando no hay dato. */
const FIRST_HALF_SHARE = 0.45;

function metricValue(
  goals: number,
  sot: number | null,
  ht: number | null | undefined,
  metric: "goals" | "sot" | "ht",
): number {
  if (metric === "sot" && sot !== null) return SOT_TO_GOALS * sot;
  if (metric === "ht") return ht !== null && ht !== undefined ? ht : goals * FIRST_HALF_SHARE;
  return goals;
}

export function fitRatings(
  matches: PlayedMatch[],
  refDate: string,
  options: FitOptions = {},
): Ratings {
  const halfLifeDays = options.halfLifeDays ?? 180;
  const shrink = options.shrink ?? SHRINK;
  const metric = options.metric ?? "goals";
  const usable = matches.filter((m) => weightFor(m.kickoff, refDate, halfLifeDays) > 0);

  let sumW = 0;
  let sumHG = 0;
  let sumAG = 0;
  let sumWCH = 0;
  let sumHC = 0;
  let sumAC = 0;
  let sumWSH = 0;
  let sumHST = 0;
  let sumAST = 0;
  let shotWeight = 0;
  let sumHomeShots = 0;
  let sumAwayShots = 0;
  let cardWeight = 0;
  let sumHomeCards = 0;
  let sumAwayCards = 0;

  const accs = new Map<string, Acc>();

  const accFor = (team: string) => {
    let acc = accs.get(team);
    if (!acc) {
      acc = emptyAcc();
      accs.set(team, acc);
    }
    return acc;
  };

  for (const m of usable) {
    const w = weightFor(m.kickoff, refDate, halfLifeDays);
    const home = accFor(m.homeTeam);
    const away = accFor(m.awayTeam);

    const homeScore = metricValue(m.homeGoals, m.homeSot, m.htHomeGoals, metric);
    const awayScore = metricValue(m.awayGoals, m.awaySot, m.htAwayGoals, metric);

    home.wH += w;
    home.gfH += w * homeScore;
    home.gaH += w * awayScore;
    away.wA += w;
    away.gfA += w * awayScore;
    away.gaA += w * homeScore;

    sumW += w;
    sumHG += w * homeScore;
    sumAG += w * awayScore;

    home.wTH += w;
    home.sumTH += w * (homeScore + awayScore);
    away.wTA += w;
    away.sumTA += w * (homeScore + awayScore);

    if (m.homeCorners !== null && m.awayCorners !== null) {
      home.wCH += w;
      home.cfH += w * m.homeCorners;
      home.caH += w * m.awayCorners;
      away.wCA += w;
      away.cfA += w * m.awayCorners;
      away.caA += w * m.homeCorners;
      sumWCH += w;
      sumHC += w * m.homeCorners;
      sumAC += w * m.awayCorners;
    }

    if (m.homeSot !== null && m.awaySot !== null) {
      home.wSH += w;
      home.sfH += w * m.homeSot;
      home.saH += w * m.awaySot;
      away.wSA += w;
      away.sfA += w * m.awaySot;
      away.saA += w * m.homeSot;
      sumWSH += w;
      sumHST += w * m.homeSot;
      sumAST += w * m.awaySot;
    }

    if (m.homeShots != null && m.awayShots != null) {
      home.swH += w;
      home.sgfH += w * m.homeShots;
      home.sgaH += w * m.awayShots;
      away.swA += w;
      away.sgfA += w * m.awayShots;
      away.sgaA += w * m.homeShots;
      shotWeight += w;
      sumHomeShots += w * m.homeShots;
      sumAwayShots += w * m.awayShots;
    }

    if (m.homeYellow != null && m.awayYellow != null) {
      const homeCards = m.homeYellow + (m.homeRed ?? 0);
      const awayCards = m.awayYellow + (m.awayRed ?? 0);
      home.kwH += w;
      home.kfH += w * homeCards;
      home.kaH += w * awayCards;
      away.kwA += w;
      away.kfA += w * awayCards;
      away.kaA += w * homeCards;
      cardWeight += w;
      sumHomeCards += w * homeCards;
      sumAwayCards += w * awayCards;
    }
  }

  const avgHomeGoals = sumW > 0 ? sumHG / sumW : 1.4;
  const avgAwayGoals = sumW > 0 ? sumAG / sumW : 1.1;
  const avgTotalGoals = avgHomeGoals + avgAwayGoals;

  const baseline: Baseline = {
    avgHomeGoals,
    avgAwayGoals,
    avgTotalGoals,
    avgHomeCorners: sumWCH > 0 ? sumHC / sumWCH : 5.2,
    avgAwayCorners: sumWCH > 0 ? sumAC / sumWCH : 4.4,
    avgHomeSot: sumWSH > 0 ? sumHST / sumWSH : 5.0,
    avgAwaySot: sumWSH > 0 ? sumAST / sumWSH : 4.1,
    avgHomeShots: shotWeight > 0 ? sumHomeShots / shotWeight : 13,
    avgAwayShots: shotWeight > 0 ? sumAwayShots / shotWeight : 11,
    avgHomeCards: cardWeight > 0 ? sumHomeCards / cardWeight : 2.0,
    avgAwayCards: cardWeight > 0 ? sumAwayCards / cardWeight : 2.1,
    cardFactor: options.cardFactor ?? 1,
    matches: usable.length,
  };

  const teams = new Map<string, TeamRating>();

  for (const [name, acc] of accs) {
    const k = shrink;

    const attHome = ((acc.gfH + k * baseline.avgHomeGoals) / (acc.wH + k)) / baseline.avgHomeGoals;
    const defHome = ((acc.gaH + k * baseline.avgAwayGoals) / (acc.wH + k)) / baseline.avgAwayGoals;
    const attAway = ((acc.gfA + k * baseline.avgAwayGoals) / (acc.wA + k)) / baseline.avgAwayGoals;
    const defAway = ((acc.gaA + k * baseline.avgHomeGoals) / (acc.wA + k)) / baseline.avgHomeGoals;

    const cAttHome = ((acc.cfH + k * baseline.avgHomeCorners) / (acc.wCH + k)) / baseline.avgHomeCorners;
    const cDefHome = ((acc.caH + k * baseline.avgAwayCorners) / (acc.wCH + k)) / baseline.avgAwayCorners;
    const cAttAway = ((acc.cfA + k * baseline.avgAwayCorners) / (acc.wCA + k)) / baseline.avgAwayCorners;
    const cDefAway = ((acc.caA + k * baseline.avgHomeCorners) / (acc.wCA + k)) / baseline.avgHomeCorners;

    const sAttHome = ((acc.sfH + k * baseline.avgHomeSot) / (acc.wSH + k)) / baseline.avgHomeSot;
    const sDefHome = ((acc.saH + k * baseline.avgAwaySot) / (acc.wSH + k)) / baseline.avgAwaySot;
    const sAttAway = ((acc.sfA + k * baseline.avgAwaySot) / (acc.wSA + k)) / baseline.avgAwaySot;
    const sDefAway = ((acc.saA + k * baseline.avgHomeSot) / (acc.wSA + k)) / baseline.avgHomeSot;

    const totalHome = ((acc.sumTH + k * avgTotalGoals) / (acc.wTH + k)) / avgTotalGoals;
    const totalAway = ((acc.sumTA + k * avgTotalGoals) / (acc.wTA + k)) / avgTotalGoals;

    const shAttHome =
      ((acc.sgfH + k * baseline.avgHomeShots) / (acc.swH + k)) / baseline.avgHomeShots;
    const shDefHome =
      ((acc.sgaH + k * baseline.avgAwayShots) / (acc.swH + k)) / baseline.avgAwayShots;
    const shAttAway =
      ((acc.sgfA + k * baseline.avgAwayShots) / (acc.swA + k)) / baseline.avgAwayShots;
    const shDefAway =
      ((acc.sgaA + k * baseline.avgHomeShots) / (acc.swA + k)) / baseline.avgHomeShots;

    const cardAttHome =
      ((acc.kfH + k * baseline.avgHomeCards) / (acc.kwH + k)) / baseline.avgHomeCards;
    const cardDefHome =
      ((acc.kaH + k * baseline.avgAwayCards) / (acc.kwH + k)) / baseline.avgAwayCards;
    const cardAttAway =
      ((acc.kfA + k * baseline.avgAwayCards) / (acc.kwA + k)) / baseline.avgAwayCards;
    const cardDefAway =
      ((acc.kaA + k * baseline.avgHomeCards) / (acc.kwA + k)) / baseline.avgHomeCards;

    teams.set(name, {
      attHome,
      defHome,
      attAway,
      defAway,
      cAttHome,
      cDefHome,
      cAttAway,
      cDefAway,
      sAttHome,
      sDefHome,
      sAttAway,
      sDefAway,
      shAttHome,
      shDefHome,
      shAttAway,
      shDefAway,
      cardAttHome,
      cardDefHome,
      cardAttAway,
      cardDefAway,
      totalHome,
      totalAway,
      matchesHome: acc.wH,
      matchesAway: acc.wA,
    });
  }

  return { baseline, teams };
}

function poissonPmf(lambda: number, max = MAX_GOALS): number[] {
  const out = new Array<number>(max + 1).fill(0);
  let p = Math.exp(-lambda);
  out[0] = p;
  for (let k = 1; k <= max; k++) {
    p = (p * lambda) / k;
    out[k] = p;
  }
  return out;
}

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  let x = z - 1;
  let a = LANCZOS[0];
  for (let i = 1; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i);
  const t = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Binomial negativa (mezcla Gamma-Poisson). Con r grande tiende a Poisson;
 * con r pequeño engorda las colas y corrige la sobreconfianza del modelo.
 */
function nbPmf(lambda: number, r: number, max = MAX_GOALS): number[] {
  const out = new Array<number>(max + 1).fill(0);
  if (!Number.isFinite(r) || r <= 0) return poissonPmf(lambda, max);
  const logR = Math.log(r / (r + lambda));
  const logL = Math.log(lambda / (r + lambda));
  for (let k = 0; k <= max; k++) {
    out[k] = Math.exp(
      lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * logR + k * logL,
    );
  }
  return out;
}

function overLine(lambda: number, line: number, dispersion: number): number {
  // P(X > line) para líneas .5
  const threshold = Math.floor(line) + 1;
  const dist = nbPmf(lambda, dispersion, Math.max(threshold + 8, 20));
  let underOrEqual = 0;
  for (let k = 0; k < threshold; k++) underOrEqual += dist[k] ?? 0;
  return clamp(1 - underOrEqual, 0, 1);
}

function tau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

export type PredictOptions = {
  rho?: number;
  goalDispersion?: number;
  countDispersion?: number;
  /** Multiplicador por equipo según su forma reciente (1 = neutral). */
  form?: Map<string, number>;
};

const FORM_WINDOW = 10;
/**
 * Peso de la forma reciente en el modelo. Desactivado (0) a propósito:
 * en el backtest, darle peso mejoraba el 1X2 en 0.1 pp (ruido) pero
 * empeoraba BTTS (Brier 0.2497 -> 0.2516). La forma se muestra en la
 * ficha, pero no mueve las probabilidades.
 */
const FORM_WEIGHT = 0;
const FORM_BASELINE_PPG = 1.35;

/**
 * Forma reciente: puntos por partido en los últimos N encuentros.
 * Devuelve un multiplicador suave (0.85 - 1.15) por equipo.
 */
export function formFactors(
  matches: PlayedMatch[],
  before: string,
  window = FORM_WINDOW,
  weight = FORM_WEIGHT,
): Map<string, number> {
  const byTeam = new Map<string, { kickoff: string; scored: number; conceded: number }[]>();

  for (const match of matches) {
    if (match.kickoff >= before) continue;
    const home = byTeam.get(match.homeTeam) ?? [];
    home.push({ kickoff: match.kickoff, scored: match.homeGoals, conceded: match.awayGoals });
    byTeam.set(match.homeTeam, home);

    const away = byTeam.get(match.awayTeam) ?? [];
    away.push({ kickoff: match.kickoff, scored: match.awayGoals, conceded: match.homeGoals });
    byTeam.set(match.awayTeam, away);
  }

  const factors = new Map<string, number>();
  for (const [team, games] of byTeam) {
    games.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
    const recent = games.slice(0, window);
    if (recent.length < 3) continue;

    let points = 0;
    for (const game of recent) {
      points += game.scored > game.conceded ? 3 : game.scored === game.conceded ? 1 : 0;
    }
    const ppg = points / recent.length;
    factors.set(team, clamp(1 + weight * (ppg - FORM_BASELINE_PPG), 0.85, 1.15));
  }

  return factors;
}

export function predictMatch(
  ratings: Ratings,
  homeTeam: string,
  awayTeam: string,
  options: PredictOptions = {},
): MarketPrediction {
  const rho = options.rho ?? -0.06;
  const goalDispersion = options.goalDispersion ?? 12;
  const countDispersion = options.countDispersion ?? 15;
  const b = ratings.baseline;
  const home = ratings.teams.get(homeTeam);
  const away = ratings.teams.get(awayTeam);

  const homeForm = options.form?.get(homeTeam) ?? 1;
  const awayForm = options.form?.get(awayTeam) ?? 1;

  const homeAttack = (home?.attHome ?? 1) * homeForm;
  const homeDefense = (home?.defHome ?? 1) / homeForm;
  const awayAttack = (away?.attAway ?? 1) * awayForm;
  const awayDefense = (away?.defAway ?? 1) / awayForm;

  let lambdaHome = clamp(b.avgHomeGoals * homeAttack * awayDefense, 0.15, 5.5);
  let lambdaAway = clamp(b.avgAwayGoals * awayAttack * homeDefense, 0.15, 5.5);

  // Ajuste por "temperatura" del partido: cuántos goles suele haber en los
  // partidos de cada equipo. Corrige la tendencia del modelo a acercarse
  // demasiado a la media cuando se enfrentan dos equipos de perfil bajo.
  const totalIndex = clamp(
    Math.sqrt(
      clamp(home?.totalHome ?? 1, 0.55, 1.8) * clamp(away?.totalAway ?? 1, 0.55, 1.8),
    ),
    0.65,
    1.6,
  );
  const targetTotal = clamp(b.avgTotalGoals * totalIndex, 1.1, 6);
  const currentTotal = lambdaHome + lambdaAway;
  if (currentTotal > 0) {
    const scale = targetTotal / currentTotal;
    lambdaHome = clamp(lambdaHome * scale, 0.15, 6);
    lambdaAway = clamp(lambdaAway * scale, 0.15, 6);
  }

  const cornersHome = clamp(
    b.avgHomeCorners * (home?.cAttHome ?? 1) * (away?.cDefAway ?? 1),
    0.5,
    12,
  );
  const cornersAway = clamp(
    b.avgAwayCorners * (away?.cAttAway ?? 1) * (home?.cDefHome ?? 1),
    0.5,
    12,
  );

  const sotHome = clamp(
    b.avgHomeSot * (home?.sAttHome ?? 1) * (away?.sDefAway ?? 1),
    0.5,
    10,
  );
  const sotAway = clamp(
    b.avgAwaySot * (away?.sAttAway ?? 1) * (home?.sDefHome ?? 1),
    0.5,
    10,
  );

  const shotsHome = clamp(
    b.avgHomeShots * (home?.shAttHome ?? 1) * (away?.shDefAway ?? 1),
    3,
    30,
  );
  const shotsAway = clamp(
    b.avgAwayShots * (away?.shAttAway ?? 1) * (home?.shDefHome ?? 1),
    3,
    30,
  );

  const cardsHome = clamp(
    b.avgHomeCards * (home?.cardAttHome ?? 1) * (away?.cardDefAway ?? 1) * (b.cardFactor ?? 1),
    0.3,
    9,
  );
  const cardsAway = clamp(
    b.avgAwayCards * (away?.cardAttAway ?? 1) * (home?.cardDefHome ?? 1) * (b.cardFactor ?? 1),
    0.3,
    9,
  );

  const ph = nbPmf(lambdaHome, goalDispersion);
  const pa = nbPmf(lambdaAway, goalDispersion);

  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    matrix[h] = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph[h] * pa[a] * tau(h, a, lambdaHome, lambdaAway, rho);
      matrix[h][a] = p;
      total += p;
    }
  }

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;
  const scores: { h: number; a: number; p: number }[] = [];

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = matrix[h][a] / total;
      const goals = h + a;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (goals >= 2) over15 += p;
      if (goals >= 3) over25 += p;
      if (goals >= 4) over35 += p;
      if (h > 0 && a > 0) btts += p;
      scores.push({ h, a, p });
    }
  }

  scores.sort((x, y) => y.p - x.p);

  const totalCorners = cornersHome + cornersAway;
  const totalSot = sotHome + sotAway;

  const minMatches = Math.min(
    (home?.matchesHome ?? 0) + (home?.matchesAway ?? 0),
    (away?.matchesHome ?? 0) + (away?.matchesAway ?? 0),
  );
  const confidence = clamp(minMatches / 10, 0.2, 1);

  return {
    lambdaHome,
    lambdaAway,
    homeWin,
    draw,
    awayWin,
    over15,
    over25,
    over35,
    btts,
    cornersHome,
    cornersAway,
    cornersOver85: overLine(totalCorners, 8.5, countDispersion),
    cornersOver95: overLine(totalCorners, 9.5, countDispersion),
    cornersOver105: overLine(totalCorners, 10.5, countDispersion),
    sotHome,
    sotAway,
    sotOver85: overLine(totalSot, 7.5, countDispersion),
    sotOver95: overLine(totalSot, 8.5, countDispersion),
    shotsHome,
    shotsAway,
    shotsOver205: overLine(shotsHome + shotsAway, 20.5, countDispersion),
    shotsOver225: overLine(shotsHome + shotsAway, 22.5, countDispersion),
    shotsOver245: overLine(shotsHome + shotsAway, 24.5, countDispersion),
    cardsHome,
    cardsAway,
    cardsOver35: overLine(cardsHome + cardsAway, 3.5, countDispersion),
    cardsOver45: overLine(cardsHome + cardsAway, 4.5, countDispersion),
    cardsOver55: overLine(cardsHome + cardsAway, 5.5, countDispersion),
    topScores: scores.slice(0, 6).map((s) => ({
      h: s.h,
      a: s.a,
      p: s.p,
    })),
    confidence,
  };
}

/**
 * Mezcla dos lecturas del mismo partido: una construida con goles y otra con
 * tiros al arco. Los tiros son más estables que los goles, así que el promedio
 * de ambas probabilidades acierta más que cualquiera por separado.
 */
export function predictBlended(
  ratingsGoals: Ratings,
  ratingsSot: Ratings,
  homeTeam: string,
  awayTeam: string,
): MarketPrediction {
  const goals = predictMatch(ratingsGoals, homeTeam, awayTeam);
  const sot = predictMatch(ratingsSot, homeTeam, awayTeam);

  const mix = (a: number, b: number) => (a + b) / 2;

  const homeWin = mix(goals.homeWin, sot.homeWin);
  const draw = mix(goals.draw, sot.draw);
  const awayWin = mix(goals.awayWin, sot.awayWin);
  const sum = homeWin + draw + awayWin || 1;

  return {
    ...goals,
    homeWin: homeWin / sum,
    draw: draw / sum,
    awayWin: awayWin / sum,
    over15: mix(goals.over15, sot.over15),
    over25: mix(goals.over25, sot.over25),
    over35: mix(goals.over35, sot.over35),
    btts: mix(goals.btts, sot.btts),
    lambdaHome: mix(goals.lambdaHome, sot.lambdaHome),
    lambdaAway: mix(goals.lambdaAway, sot.lambdaAway),
    confidence: goals.confidence,
  };
}

/**
 * Mezcla las probabilidades 1X2 con las del mercado (sin margen).
 * `weight` es cuánto pesa el mercado: 0 = solo modelo, 1 = solo mercado.
 */
export function blendWithMarket(
  prediction: MarketPrediction,
  oddsHome: number | null,
  oddsDraw: number | null,
  oddsAway: number | null,
  weight = 0.5,
): MarketPrediction {
  const w = Math.min(1, Math.max(0, weight));
  if (w === 0) return prediction;
  if (!oddsHome || !oddsDraw || !oddsAway) return prediction;
  if (oddsHome <= 1 || oddsDraw <= 1 || oddsAway <= 1) return prediction;

  const raw = [1 / oddsHome, 1 / oddsDraw, 1 / oddsAway];
  const marketSum = raw[0] + raw[1] + raw[2];
  if (!Number.isFinite(marketSum) || marketSum <= 0) return prediction;

  const model = [prediction.homeWin, prediction.draw, prediction.awayWin];
  const blended = model.map(
    (value, index) => value * (1 - w) + (raw[index] / marketSum) * w,
  );
  const total = blended[0] + blended[1] + blended[2];
  if (!Number.isFinite(total) || total <= 0) return prediction;

  return {
    ...prediction,
    homeWin: blended[0] / total,
    draw: blended[1] / total,
    awayWin: blended[2] / total,
  };
}

export type GoalsMarkets = {
  homeWin: number;
  draw: number;
  awayWin: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  topScores: { h: number; a: number; p: number }[];
};

/**
 * Recalcula los mercados de goles a partir de lambdas ajustadas
 * (por ejemplo, tras confirmar la alineación). No toca córners/remates/tarjetas.
 */
export function goalsMarketsFromLambdas(
  lambdaHome: number,
  lambdaAway: number,
  options: { rho?: number; goalDispersion?: number } = {},
): GoalsMarkets {
  const rho = options.rho ?? -0.06;
  const goalDispersion = options.goalDispersion ?? 12;

  const ph = nbPmf(lambdaHome, goalDispersion);
  const pa = nbPmf(lambdaAway, goalDispersion);

  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    matrix[h] = [];
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = ph[h] * pa[a] * tau(h, a, lambdaHome, lambdaAway, rho);
      matrix[h][a] = p;
      total += p;
    }
  }

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let over35 = 0;
  let btts = 0;
  const scores: { h: number; a: number; p: number }[] = [];

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = matrix[h][a] / total;
      const goals = h + a;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (goals >= 2) over15 += p;
      if (goals >= 3) over25 += p;
      if (goals >= 4) over35 += p;
      if (h > 0 && a > 0) btts += p;
      scores.push({ h, a, p });
    }
  }

  scores.sort((x, y) => y.p - x.p);

  return {
    homeWin,
    draw,
    awayWin,
    over15,
    over25,
    over35,
    btts,
    topScores: scores.slice(0, 6),
  };
}

export type FirstHalfPrediction = {  lambdaHome: number;
  lambdaAway: number;
  over05: number;
  over15: number;
  over25: number;
  btts: number;
};

/** Mercados de primer tiempo a partir de ratings entrenados solo con goles del descanso. */
export function predictFirstHalf(
  ratings: Ratings,
  homeTeam: string,
  awayTeam: string,
): FirstHalfPrediction {
  const b = ratings.baseline;
  const home = ratings.teams.get(homeTeam);
  const away = ratings.teams.get(awayTeam);

  const lambdaHome = clamp(
    b.avgHomeGoals * (home?.attHome ?? 1) * (away?.defAway ?? 1),
    0.05,
    3.5,
  );
  const lambdaAway = clamp(
    b.avgAwayGoals * (away?.attAway ?? 1) * (home?.defHome ?? 1),
    0.05,
    3.5,
  );

  const ph = poissonPmf(lambdaHome, 6);
  const pa = poissonPmf(lambdaAway, 6);

  let total = 0;
  let over05 = 0;
  let over15 = 0;
  let over25 = 0;
  let btts = 0;

  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const p = ph[h] * pa[a];
      total += p;
      const goals = h + a;
      if (goals >= 1) over05 += p;
      if (goals >= 2) over15 += p;
      if (goals >= 3) over25 += p;
      if (h > 0 && a > 0) btts += p;
    }
  }

  const safe = total || 1;
  return {
    lambdaHome,
    lambdaAway,
    over05: over05 / safe,
    over15: over15 / safe,
    over25: over25 / safe,
    btts: btts / safe,
  };
}

export function outcomeOf(homeGoals: number, awayGoals: number): 0 | 1 | 2 {
  if (homeGoals > awayGoals) return 0;
  if (homeGoals === awayGoals) return 1;
  return 2;
}

export function accuracy(predicted: number, actual: number): number {
  return predicted === actual ? 1 : 0;
}

export function logLoss(probabilities: number[], actual: number): number {
  const p = clamp(probabilities[actual], 1e-12, 1);
  return -Math.log(p);
}

export function brier3(probabilities: number[], actual: number): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const target = i === actual ? 1 : 0;
    sum += (probabilities[i] - target) ** 2;
  }
  return sum;
}

export function brierBinary(p: number, actual: boolean): number {
  return (p - (actual ? 1 : 0)) ** 2;
}
