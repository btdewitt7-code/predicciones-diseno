import { ensureSchema, getDb, setMeta } from "../src/lib/db";
import {
  blendWithMarket,
  fitRatings,
  predictBlended,
  predictFirstHalf,
  type PlayedMatch,
} from "../src/lib/model";
import { LEAGUES } from "../src/lib/leagues";
import { cardFactorFor } from "../src/lib/cardCalibration";
import { SHOTS_FACTOR } from "../src/lib/shotCalibration";
import { buildHistoryStatements } from "../src/lib/predictionHistory";
import {
  applyAbsenceAdjustments,
  buildTeamUsage,
  computeAbsenceFactors,
  type AbsenceAdjustment,
  type AbsenceInput,
} from "../src/lib/absences";

/** Peso del mercado en el 1X2. 0 = solo modelo, 1 = solo mercado. */
const BLEND_WEIGHT = (() => {
  const raw = Number(process.env.MARKET_BLEND_WEIGHT);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.5;
})();

/** Ajuste por bajas (lesiones/sanciones). Se puede apagar con ABSENCE_ADJUST=0. */
const USE_ABSENCES = process.env.ABSENCE_ADJUST !== "0";
/**
 * Vida media de los partidos usados para ajustar ratings.
 * 90 días = más peso a la temporada actual; 180 = comportamiento anterior.
 */
const HALF_LIFE_DAYS = (() => {
  const raw = Number(process.env.MODEL_HALF_LIFE);
  return Number.isFinite(raw) && raw >= 15 && raw <= 365 ? raw : 90;
})();

/**
 * Shrink de los ratings de primer tiempo. Más alto = menos confianza en las
 * diferencias entre equipos para el 1T. Validado con backtest walk-forward:
 * 16 mejora el Brier en Perú, Inglaterra, Italia y España frente a 4.
 */
const HT_SHRINK = 16;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function toPlayed(row: Record<string, unknown>): PlayedMatch {
  return {
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
  };
}

async function main() {
  const db = await ensureSchema();
  const refDate = new Date().toISOString().slice(0, 19);

  const playedRes = await db.execute(
    `SELECT id, league_code, kickoff, home_team, away_team, home_goals, away_goals,
            home_corners, away_corners, home_sot, away_sot, home_shots, away_shots,
            home_yellow, away_yellow, home_red, away_red, ht_home_goals, ht_away_goals
     FROM matches WHERE status = 'played'`,
  );
  const played = playedRes.rows.map((row) => toPlayed(row as Record<string, unknown>));

  const byLeague = new Map<string, PlayedMatch[]>();
  for (const match of played) {
    const list = byLeague.get(match.leagueCode) ?? [];
    list.push(match);
    byLeague.set(match.leagueCode, list);
  }

  // ---- Bajas: uso reciente de jugadores + lesiones/sanciones por partido ----
  const injuriesRes = await db.execute(
    "SELECT match_id, side, player, category FROM injuries",
  );
  const injuriesByMatch = new Map<number, AbsenceInput[]>();
  for (const row of injuriesRes.rows) {
    const matchId = Number(row.match_id);
    const list = injuriesByMatch.get(matchId) ?? [];
    list.push({
      matchId,
      side: String(row.side) === "away" ? "away" : "home",
      player: String(row.player),
      category: String(row.category),
    });
    injuriesByMatch.set(matchId, list);
  }

  const usageCutoff = new Date(Date.now() - 365 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const usageRes = await db.execute({
    sql: `SELECT p.team, p.player,
                 COUNT(*) AS apps,
                 COALESCE(SUM(p.goals), 0) AS goals,
                 COALESCE(SUM(p.shots), 0) AS shots,
                 COALESCE(SUM(p.sot), 0) AS sot
          FROM player_match_stats p
          JOIN matches m ON m.id = p.match_id
          WHERE m.status = 'played' AND m.kickoff >= ?
          GROUP BY p.team, p.player`,
    args: [usageCutoff],
  });
  const teamUsage = buildTeamUsage(
    usageRes.rows.map((row) => ({
      team: String(row.team),
      player: String(row.player),
      apps: Number(row.apps),
      goals: Number(row.goals),
      shots: Number(row.shots),
      sot: Number(row.sot),
    })),
  );

  let totalPredictions = 0;
  let adjustedMatches = 0;

  for (const league of LEAGUES) {
    if (league.noModel) continue;
    const matches = byLeague.get(league.code) ?? [];
    if (matches.length === 0) continue;

    const ratings = fitRatings(matches, refDate, {
      halfLifeDays: HALF_LIFE_DAYS,
      cardFactor: cardFactorFor(league.code),
      shotsFactor: SHOTS_FACTOR,
    });
    const ratingsSot = fitRatings(matches, refDate, {
      halfLifeDays: HALF_LIFE_DAYS,
      metric: "sot",
    });
    const ratingsHt = fitRatings(matches, refDate, {
      halfLifeDays: HALF_LIFE_DAYS,
      shrink: HT_SHRINK,
      metric: "ht",
    });

    // Recién ascendidos: equipos que aparecen esta temporada y no en la anterior.
    const seasonsRes = await db.execute({
      sql: `SELECT season, home_team AS team FROM matches WHERE league_code = ?
            UNION
            SELECT season, away_team AS team FROM matches WHERE league_code = ?`,
      args: [league.code, league.code],
    });
    const teamsBySeason = new Map<string, Set<string>>();
    for (const row of seasonsRes.rows) {
      const season = String(row.season);
      const set = teamsBySeason.get(season) ?? new Set<string>();
      set.add(String(row.team));
      teamsBySeason.set(season, set);
    }
    const seasonList = [...teamsBySeason.keys()].sort();
    const currentSeason = seasonList[seasonList.length - 1];
    const previousSeason = seasonList[seasonList.length - 2];
    const promoted = new Set<string>();
    if (currentSeason && previousSeason) {
      const previousTeams = teamsBySeason.get(previousSeason) ?? new Set<string>();
      for (const team of teamsBySeason.get(currentSeason) ?? []) {
        if (!previousTeams.has(team)) promoted.add(team);
      }
    }

    await db.execute({
      sql: `INSERT INTO league_baseline (
        league_code, avg_home_goals, avg_away_goals, avg_total_goals, avg_home_corners, avg_away_corners,
        avg_home_sot, avg_away_sot, matches
      ) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(league_code) DO UPDATE SET
        avg_home_goals = excluded.avg_home_goals,
        avg_away_goals = excluded.avg_away_goals,
        avg_total_goals = excluded.avg_total_goals,
        avg_home_corners = excluded.avg_home_corners,
        avg_away_corners = excluded.avg_away_corners,
        avg_home_sot = excluded.avg_home_sot,
        avg_away_sot = excluded.avg_away_sot,
        matches = excluded.matches`,
      args: [
        league.code,
        ratings.baseline.avgHomeGoals,
        ratings.baseline.avgAwayGoals,
        ratings.baseline.avgTotalGoals,
        ratings.baseline.avgHomeCorners,
        ratings.baseline.avgAwayCorners,
        ratings.baseline.avgHomeSot,
        ratings.baseline.avgAwaySot,
        ratings.baseline.matches,
      ],
    });

    await db.execute({
      sql: `DELETE FROM ratings WHERE league_code = ?`,
      args: [league.code],
    });

    const ratingStatements = [...ratings.teams.entries()].map(([team, r]) => ({
      sql: `INSERT INTO ratings (
        league_code, team, att_home, def_home, att_away, def_away,
        c_att_home, c_def_home, c_att_away, c_def_away,
        s_att_home, s_def_home, s_att_away, s_def_away,
        total_home, total_away, promoted,
        matches_home, matches_away
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [
        league.code,
        team,
        r.attHome,
        r.defHome,
        r.attAway,
        r.defAway,
        r.cAttHome,
        r.cDefHome,
        r.cAttAway,
        r.cDefAway,
        r.sAttHome,
        r.sDefHome,
        r.sAttAway,
        r.sDefAway,
        r.totalHome,
        r.totalAway,
        promoted.has(team) ? 1 : 0,
        r.matchesHome,
        r.matchesAway,
      ],
    }));
    if (ratingStatements.length > 0) {
      await db.batch(ratingStatements, "write");
    }

    const fixturesRes = await db.execute({
      sql: `SELECT id, home_team, away_team,
                   close_home, close_draw, close_away,
                   odds_home, odds_draw, odds_away
            FROM matches
            WHERE league_code = ? AND status = 'scheduled'
              AND kickoff > datetime('now')`,
      args: [league.code],
    });

    const predictionStatements = fixturesRes.rows.map((row) => {
      const homeTeam = String(row.home_team);
      const awayTeam = String(row.away_team);

      const absences = USE_ABSENCES
        ? injuriesByMatch.get(Number(row.id)) ?? []
        : [];
      const homeFactors = computeAbsenceFactors(
        absences.filter((absence) => absence.side === "home"),
        teamUsage.get(homeTeam),
      );
      const awayFactors = computeAbsenceFactors(
        absences.filter((absence) => absence.side === "away"),
        teamUsage.get(awayTeam),
      );
      if (homeFactors.count > 0 || awayFactors.count > 0) adjustedMatches += 1;

      const adjustments: AbsenceAdjustment[] = [
        { team: homeTeam, venue: "home", factors: homeFactors },
        { team: awayTeam, venue: "away", factors: awayFactors },
      ];

      const adjustedRatings = applyAbsenceAdjustments(ratings, adjustments);
      const adjustedSot = applyAbsenceAdjustments(ratingsSot, adjustments);
      const adjustedHt = applyAbsenceAdjustments(ratingsHt, adjustments);

      const base = predictBlended(adjustedRatings, adjustedSot, homeTeam, awayTeam);
      const prediction = blendWithMarket(
        base,
        num(row.close_home) ?? num(row.odds_home),
        num(row.close_draw) ?? num(row.odds_draw),
        num(row.close_away) ?? num(row.odds_away),
        BLEND_WEIGHT,
      );
      const firstHalf = predictFirstHalf(adjustedHt, homeTeam, awayTeam);
      if (promoted.has(homeTeam) || promoted.has(awayTeam)) {
        prediction.confidence = Math.max(0.15, prediction.confidence * 0.6);
      }
      return {
        sql: `INSERT INTO predictions (
          match_id, home_win, draw, away_win, over15, over25, over35, btts,
          exp_home_goals, exp_away_goals, corners_home, corners_away,
          sot_home, sot_away, corners_over85, corners_over95, corners_over105,
          sot_over85, sot_over95, shots_home, shots_away, shots_over205,
          shots_over225, shots_over245, cards_home, cards_away, cards_over35,
          cards_over45, cards_over55, ht_home_goals, ht_away_goals, ht_over05,
          ht_over15, ht_over25, top_scores, confidence, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(match_id) DO UPDATE SET
          home_win = excluded.home_win,
          draw = excluded.draw,
          away_win = excluded.away_win,
          over15 = excluded.over15,
          over25 = excluded.over25,
          over35 = excluded.over35,
          btts = excluded.btts,
          exp_home_goals = excluded.exp_home_goals,
          exp_away_goals = excluded.exp_away_goals,
          corners_home = excluded.corners_home,
          corners_away = excluded.corners_away,
          sot_home = excluded.sot_home,
          sot_away = excluded.sot_away,
          corners_over85 = excluded.corners_over85,
          corners_over95 = excluded.corners_over95,
          corners_over105 = excluded.corners_over105,
          sot_over85 = excluded.sot_over85,
          sot_over95 = excluded.sot_over95,
          shots_home = excluded.shots_home,
          shots_away = excluded.shots_away,
          shots_over205 = excluded.shots_over205,
          shots_over225 = excluded.shots_over225,
          shots_over245 = excluded.shots_over245,
          cards_home = excluded.cards_home,
          cards_away = excluded.cards_away,
          cards_over35 = excluded.cards_over35,
          cards_over45 = excluded.cards_over45,
          cards_over55 = excluded.cards_over55,
          ht_home_goals = excluded.ht_home_goals,
          ht_away_goals = excluded.ht_away_goals,
          ht_over05 = excluded.ht_over05,
          ht_over15 = excluded.ht_over15,
          ht_over25 = excluded.ht_over25,
          top_scores = excluded.top_scores,
          confidence = excluded.confidence,
          created_at = excluded.created_at`,
        args: [
          Number(row.id),
          prediction.homeWin,
          prediction.draw,
          prediction.awayWin,
          prediction.over15,
          prediction.over25,
          prediction.over35,
          prediction.btts,
          prediction.lambdaHome,
          prediction.lambdaAway,
          prediction.cornersHome,
          prediction.cornersAway,
          prediction.sotHome,
          prediction.sotAway,
          prediction.cornersOver85,
          prediction.cornersOver95,
          prediction.cornersOver105,
          prediction.sotOver85,
          prediction.sotOver95,
          prediction.shotsHome,
          prediction.shotsAway,
          prediction.shotsOver205,
          prediction.shotsOver225,
          prediction.shotsOver245,
          prediction.cardsHome,
          prediction.cardsAway,
          prediction.cardsOver35,
          prediction.cardsOver45,
          prediction.cardsOver55,
          firstHalf.lambdaHome,
          firstHalf.lambdaAway,
          firstHalf.over05,
          firstHalf.over15,
          firstHalf.over25,
          JSON.stringify(prediction.topScores),
          prediction.confidence,
          new Date().toISOString(),
        ],
      };
    });

    if (predictionStatements.length > 0) {
      await db.batch(predictionStatements, "write");
      try {
        await db.batch(
          buildHistoryStatements(predictionStatements, "model"),
          "write",
        );
      } catch (error) {
        console.error("No se pudo congelar el histórico de esta liga:", error);
      }
    }

    totalPredictions += predictionStatements.length;
    console.log(
      `${league.code.padEnd(4)} ${String(ratings.teams.size).padStart(3)} equipos · ${predictionStatements.length} predicciones`,
    );
  }

  await setMeta("trained_at", new Date().toISOString());
  console.log(`\nModelo entrenado. ${totalPredictions} predicciones generadas.`);
  if (USE_ABSENCES) {
    console.log(`Ajuste por bajas aplicado en ${adjustedMatches} partidos.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
