/**
 * Corrección por liga de las tarjetas.
 *
 * El modelo de tarjetas usa media vida de 180 días, así que tarda en reaccionar
 * cuando una liga cambia de tendencia. Estos factores comparan lo que predijo el
 * modelo con lo que pasó realmente en los últimos 60 días y corrigen la lambda.
 *
 * Cómo se calculan (ver `npm run calibrar-tarjetas`):
 *   ratio = tarjetas reales / tarjetas predichas
 *   factor = 1 + (ratio - 1) * n / (n + 20)   ← encoge muestras chicas hacia 1
 *
 * Solo se listan ligas con al menos 20 partidos y desvío ≥ 3%.
 * Revisión: 2026-11-20. Próxima: semanal, y recalibración completa el 1/12.
 */
export const CARD_FACTORS: Record<string, number> = {
  arg: 1.03,
  e1: 0.98,
  i2: 0.91,
  col: 0.96,
  e3: 0.95,
  i1: 1.05,
  bra: 1.07,
  e0: 1.1,
  sp2: 1.13,
  ec: 1.16,
};

export function cardFactorFor(leagueCode: string): number {
  return CARD_FACTORS[leagueCode.toLowerCase()] ?? 1;
}
