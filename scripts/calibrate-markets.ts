import { createClient } from "@libsql/client";
import fs from "node:fs";
import { blendWithMarket, fitRatings, predictBlended, predictFirstHalf, type PlayedMatch } from "../src/lib/model";
import { cardFactorFor } from "../src/lib/cardCalibration";

/**
 * Calibración walk-forward por mercado.
 *
 * Recalcula las predicciones de cada mes usando solo partidos anteriores,
 * como si el modelo hubiera estado corriendo en vivo. Con eso se puede
 * entrenar la curva de calibración y validarla en los últimos 60 días.
 *
 * Uso: npm run calibrar-mercados
 */

const HISTORY_DAYS = 420;
const MIN_HISTORY = 120;
const HALF_LIFE = 90;
const TEST_FROM = "2026-09-21T00:00:00";
const L2 = 0.02;

type Pair = { p: number; y: number; kickoff: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function fitPlatt(pairs: Pair[]): { a: number; b: number } {
  let a = 1;
  let b = 0;
  const lr = 0.15;
  const xs = pairs.map(({ p }) => logit(clamp(p, 0.02, 0.98)));
  const ys = pairs.map(({ y }) => y);

  for (let step = 0; step < 4000; step += 1) {
    let ga = L2 * 2 * (a - 1);
    let gb = L2 * 2 * b;
    for (let i = 0; i < xs.length; i += 1) {
      const q = sigmoid(a * xs[i] + b);
      const err = q - ys[i];
      ga += (err * xs[i]) / xs.length;
      gb += err / xs.length;
    }
    a -= lr * ga;
    b -= lr * gb;
    if (Math.abs(ga) < 1e-7 && Math.abs(gb) < 1e-7) break;
  }
  return { a, b };
}

const brier = (pairs: Pair[], fn: (p: number) => number) =>
  pairs.reduce((sum, { p, y }) => sum + (fn(p) - y) ** 2, 0) / pairs.length;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

(async () => {
  const db = createClient({ url: "file:data/predicciones.db" });
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 19);

  const res = await db.execute({
    sql: `SELECT * FROM matches WHERE status='played' AND home_goals IS NOT NULL AND kickoff >= ? ORDER BY kickoff`,
    args: [since],
  });

  const matches = res.rows.map((row) => ({
    id: Number(row.id),
    leagueCode: String(row.league_code),
    kickoff: String(row.kickoff),
    homeTeam: String(row.home_team),
    awayTeam: String(row.away_team),
    homeGoals: Number(row.home_goals),
    awayGoals: Number(row.away_goals),
    homeCorners: num(row.home_corners),
    awayCorners: num(row.away_corners),
    homeSot: num(row.home_sot),
    awaySot: num(row.away_sot),
    homeShots: num(row.home_shots),
    awayShots: num(row.away_shots),
    homeYellow: num(row.home_yellow),
    awayYellow: num(row.away_yellow),
    homeRed: num(row.home_red),
    awayRed: num(row.away_red),
    htHomeGoals: num(row.ht_home_goals),
    htAwayGoals: num(row.ht_away_goals),
    oddsHome: num(row.close_home) ?? num(row.odds_home),
    oddsDraw: num(row.close_draw) ?? num(row.odds_draw),
    oddsAway: num(row.close_away) ?? num(row.odds_away),
  })) as PlayedMatch[];

  const byLeague = new Map<string, PlayedMatch[]>();
  for (const match of matches) {
    const list = byLeague.get(match.leagueCode) ?? [];
    list.push(match);
    byLeague.set(match.leagueCode, list);
  }

  const months = [...new Set(matches.map((m) => m.kickoff.slice(0, 7)))].filter((m) => m >= "2026-01").sort();
  const markets = new Map<string, Pair[]>();

  const push = (key: string, p: number, y: boolean, kickoff: string) => {
    if (!Number.isFinite(p)) return;
    const list = markets.get(key) ?? [];
    list.push({ p: clamp(p, 0.001, 0.999), y: y ? 1 : 0, kickoff });
    markets.set(key, list);
  };

  for (const [league, list] of byLeague) {
    if (list.length < MIN_HISTORY) continue;
    for (const month of months) {
      const cutoff = `${month}-01T00:00:00`;
      const history = list.filter((m) => m.kickoff < cutoff);
      const test = list.filter((m) => m.kickoff.startsWith(month));
      if (history.length < MIN_HISTORY || test.length === 0) continue;

      const ratings = fitRatings(history, cutoff, { halfLifeDays: HALF_LIFE, cardFactor: cardFactorFor(league) });
      const ratingsSot = fitRatings(history, cutoff, { halfLifeDays: HALF_LIFE, metric: "sot" });
      const ratingsHt = fitRatings(history, cutoff, { halfLifeDays: HALF_LIFE, shrink: 16, metric: "ht" });

      for (const m of test) {
        const base = predictBlended(ratings, ratingsSot, m.homeTeam, m.awayTeam);
        const pred = blendWithMarket(base, m.oddsHome ?? null, m.oddsDraw ?? null, m.oddsAway ?? null, 0.5);
        const ht = predictFirstHalf(ratingsHt, m.homeTeam, m.awayTeam);
        const k = m.kickoff;
        const hg = m.homeGoals;
        const ag = m.awayGoals;
        const total = hg + ag;
        const cards = (m.homeYellow ?? 0) + (m.awayYellow ?? 0) + (m.homeRed ?? 0) + (m.awayRed ?? 0);
        const corners = (m.homeCorners ?? 0) + (m.awayCorners ?? 0);
        const shots = (m.homeShots ?? 0) + (m.awayShots ?? 0);
        const sot = (m.homeSot ?? 0) + (m.awaySot ?? 0);
        const htGoals = (m.htHomeGoals ?? 0) + (m.htAwayGoals ?? 0);

        const dc = [
          { p: pred.homeWin + pred.draw, y: hg >= ag },
          { p: pred.draw + pred.awayWin, y: ag >= hg },
          { p: pred.homeWin + pred.awayWin, y: hg !== ag },
        ].sort((x, y) => y.p - x.p)[0];
        push("Doble oportunidad", dc.p, dc.y, k);

        const probs = [pred.homeWin, pred.draw, pred.awayWin];
        const idx = probs.indexOf(Math.max(...probs));
        const outcome = hg > ag ? 0 : hg === ag ? 1 : 2;
        push("1X2 favorito", probs[idx], idx === outcome, k);

        push("Over 1.5", pred.over15, total > 1.5, k);
        push("Under 3.5", 1 - pred.over35, total < 3.5, k);
        push("Over 2.5", pred.over25, total > 2.5, k);
        push("Ambos marcan", pred.btts, hg > 0 && ag > 0, k);
        push("1T over 0.5", ht.over05, htGoals > 0.5, k);
        push("1T over 1.5", ht.over15, htGoals > 1.5, k);
        push("Remates +20.5", pred.shotsOver205, shots > 20.5, k);
        push("Remates +22.5", pred.shotsOver225, shots > 22.5, k);
        push("Remates +24.5", pred.shotsOver245, shots > 24.5, k);
        push("Córners +8.5", pred.cornersOver85, corners > 8.5, k);
        push("Córners +9.5", pred.cornersOver95, corners > 9.5, k);
        push("Córners +10.5", pred.cornersOver105, corners > 10.5, k);
        push("Tarjetas +3.5", pred.cardsOver35, cards > 3.5, k);
        push("Tarjetas +4.5", pred.cardsOver45, cards > 4.5, k);
        push("Tiros al arco -9.5", 1 - pred.sotOver95, sot < 9.5, k);
      }
    }
    console.log(`✓ ${league}`);
  }

  const saved: Record<string, { a: number; b: number; n: number }> = {};
  console.log("\nMercado".padEnd(20), " nTest  Brier↓   pred→real");
  console.log("-".repeat(72));

  for (const [name, pairs] of markets) {
    const train = pairs.filter((x) => x.kickoff < TEST_FROM);
    const test = pairs.filter((x) => x.kickoff >= TEST_FROM);
    if (train.length < 300 || test.length < 100) {
      console.log(`${name.padEnd(20)} ${String(test.length).padStart(5)}  (muestra insuficiente)`);
      continue;
    }

    const { a, b } = fitPlatt(train);
    const apply = (p: number) => sigmoid(a * logit(clamp(p, 0.02, 0.98)) + b);
    const before = brier(test, (p) => p);
    const after = brier(test, apply);
    const avgP = test.reduce((s, x) => s + x.p, 0) / test.length;
    const avgQ = test.reduce((s, x) => s + apply(x.p), 0) / test.length;
    const real = test.reduce((s, x) => s + x.y, 0) / test.length;

    saved[name] = { a, b, n: train.length };
    console.log(
      `${name.padEnd(20)} ${String(test.length).padStart(5)}  ${before.toFixed(4)}→${after.toFixed(4)}` +
        `  ${(avgP * 100).toFixed(0)}%→${(avgQ * 100).toFixed(0)}% vs real ${(real * 100).toFixed(0)}%`
    );
  }

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/market-calibration.json", JSON.stringify(saved, null, 2));
  console.log("\nGuardado en data/market-calibration.json");
})();
