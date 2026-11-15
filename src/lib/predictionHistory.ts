/**
 * Congela una copia de cada predicción en `prediction_history`.
 *
 * La app sigue leyendo `predictions`/`cup_predictions`; esta tabla es solo
 * el registro histórico (pre-partido) para el récord, ROI y calibración.
 */
export const PREDICTION_COLUMNS = [
  "match_id",
  "home_win",
  "draw",
  "away_win",
  "over15",
  "over25",
  "over35",
  "btts",
  "exp_home_goals",
  "exp_away_goals",
  "corners_home",
  "corners_away",
  "sot_home",
  "sot_away",
  "corners_over85",
  "corners_over95",
  "corners_over105",
  "sot_over85",
  "sot_over95",
  "shots_home",
  "shots_away",
  "shots_over205",
  "shots_over225",
  "shots_over245",
  "cards_home",
  "cards_away",
  "cards_over35",
  "cards_over45",
  "cards_over55",
  "ht_home_goals",
  "ht_away_goals",
  "ht_over05",
  "ht_over15",
  "ht_over25",
  "top_scores",
  "confidence",
  "created_at",
] as const;

type Statement = {
  sql: string;
  args: (string | number | null)[];
};

/**
 * Convierte las sentencias de inserción de `predictions`/`cup_predictions`
 * en sentencias para `prediction_history`. Usa `args` (mismo orden que
 * PREDICTION_COLUMNS) y no toca la tabla original.
 */
export function buildHistoryStatements(
  statements: Statement[],
  source: "model" | "cup",
): Statement[] {
  const snapshotDay = new Date().toISOString().slice(0, 10);
  const snapshotAt = new Date().toISOString();

  return statements.map((statement) => {
    const payload: Record<string, unknown> = {};
    PREDICTION_COLUMNS.forEach((column, index) => {
      payload[column] = statement.args[index] ?? null;
    });

    return {
      sql: `INSERT INTO prediction_history
              (match_id, source, snapshot_day, created_at, payload)
            VALUES (?,?,?,?,?)
            ON CONFLICT(match_id, source, snapshot_day) DO UPDATE SET
              payload = excluded.payload,
              created_at = excluded.created_at`,
      args: [
        Number(statement.args[0]),
        source,
        snapshotDay,
        snapshotAt,
        JSON.stringify(payload),
      ],
    };
  });
}
