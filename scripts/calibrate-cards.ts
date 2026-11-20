import { createClient } from "@libsql/client";

/**
 * Sugerencia de factores de tarjetas por liga.
 *
 * Compara las tarjetas que predijo el modelo con las reales de los últimos
 * `--dias` días y propone un factor con encogimiento para muestras chicas.
 * No escribe nada: solo imprime la tabla para actualizar
 * `src/lib/cardCalibration.ts` a mano.
 *
 * Uso: npm run calibrar-tarjetas
 */

const DAYS = 60;
const MIN_MATCHES = 20;
const MIN_DEVIATION = 0.03;
const SHRINK = 20;

const fmt = (value: number) => value.toFixed(2);

(async () => {
  const db = createClient({ url: "file:data/predicciones.db" });
  const from = new Date(Date.now() - DAYS * 86_400_000).toISOString().slice(0, 19);

  const res = await db.execute({
    sql: `SELECT m.league_code,
                 COUNT(*) AS n,
                 SUM(p.cards_home + p.cards_away) AS pred,
                 SUM(m.home_yellow + m.away_yellow
                     + COALESCE(m.home_red, 0) + COALESCE(m.away_red, 0)) AS real
          FROM matches m
          JOIN predictions p ON p.match_id = m.id
          WHERE m.status = 'played'
            AND m.home_yellow IS NOT NULL AND m.away_yellow IS NOT NULL
            AND m.kickoff >= ?
          GROUP BY m.league_code
          ORDER BY n DESC`,
    args: [from],
  });

  console.log(`Ventana: últimos ${DAYS} días\n`);
  console.log("Liga   n    modelo  real   ratio  factor sugerido");

  const suggestions: { code: string; factor: number }[] = [];
  for (const row of res.rows) {
    const n = Number(row.n);
    const pred = Number(row.pred);
    const real = Number(row.real);
    if (n < MIN_MATCHES || pred <= 0) continue;

    const ratio = real / pred;
    const factor = 1 + (ratio - 1) * (n / (n + SHRINK));
    const rounded = Math.round(factor * 100) / 100;
    if (Math.abs(rounded - 1) < MIN_DEVIATION) continue;

    suggestions.push({ code: String(row.league_code).toLowerCase(), factor: rounded });
    console.log(
      `${String(row.league_code).padEnd(6)} ${String(n).padStart(3)}  ${fmt(pred / n).padStart(6)}  ${fmt(real / n).padStart(5)}  ${ratio.toFixed(3)}  ${fmt(rounded)}`
    );
  }

  console.log("\nTabla para src/lib/cardCalibration.ts:\n");
  for (const item of suggestions) console.log(`  ${item.code}: ${fmt(item.factor)},`);
})();
