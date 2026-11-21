/**
 * Corrección de remates totales.
 *
 * El modelo venía subestimando los remates: en 2.224 partidos de validación
 * (walk-forward, últimos 60 días) decía 69% para +20.5 y pasaba 79%.
 *
 * Se probaron factores de 1,00 a 1,12 midiendo Brier en las líneas 20.5, 22.5
 * y 24.5. El mejor equilibrio fue 1,09:
 *   Brier medio 0,1691 → 0,1588
 * Con 1,12 ya no mejora (0,1587) y empeora la línea 24.5.
 *
 * Revisión: 2026-11-21. Revalidar en la recalibración mensual.
 */
export const SHOTS_FACTOR = 1.09;
