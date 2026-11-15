import { createHash } from "node:crypto";
import { getDb } from "./db";
import type { Combo, ComboLeg } from "./combos";

export type SavedCombo = {
  id: number;
  day: string;
  comboId: string;
  title: string;
  legs: ComboLeg[];
  probability: number;
  fairOdds: number;
  hash: string;
  source: "model" | "cup";
  origin: "manual" | "generated";
  createdAt: string;
};

/** Identifica una jugada por día y selecciones, sin depender de la probabilidad. */
export function comboHash(day: string, legs: ComboLeg[]): string {
  const key = legs
    .map((leg) => `${leg.matchId}|${leg.market}`)
    .join(">>");
  return createHash("sha256").update(`${day}|${key}`).digest("hex");
}

const hashOf = comboHash;

/** Guarda una jugada concreta del usuario. */
export async function saveCombo(
  day: string,
  combo: Combo,
  userId: number | null,
  source: "model" | "cup" = "model",
  origin: "manual" | "generated" = "generated",
): Promise<boolean> {
  if (!userId) return false;
  const db = getDb();
  const hash = hashOf(day, combo.legs);

  const res = await db.execute({
    sql: `INSERT OR IGNORE INTO saved_combos
            (user_id, day, combo_id, title, legs, probability, fair_odds, hash, created_at, source, origin)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      userId,
      day,
      combo.id,
      combo.title,
      JSON.stringify(combo.legs),
      combo.probability,
      combo.fairOdds,
      hash,
      new Date().toISOString(),
      source,
      origin,
    ],
  });

  return res.rowsAffected > 0;
}

/** Quita una jugada guardada del usuario (misma clave día + selecciones). */
export async function deleteCombo(
  day: string,
  legs: ComboLeg[],
  userId: number | null,
): Promise<boolean> {
  if (!userId) return false;
  const db = getDb();
  const hash = hashOf(day, legs);
  const res = await db.execute({
    sql: `DELETE FROM saved_combos WHERE user_id = ? AND hash = ?`,
    args: [userId, hash],
  });
  return res.rowsAffected > 0;
}

export async function loadSavedCombos(
  limitDays = 7,
  userId: number | null = null,
  source?: "model" | "cup",
): Promise<SavedCombo[]> {
  if (!userId) return [];
  const db = getDb();
  const dayArgs: (string | number)[] = [userId];
  let daySql = `SELECT DISTINCT day FROM saved_combos WHERE user_id = ?`;
  if (source) {
    daySql += ` AND source = ?`;
    dayArgs.push(source);
  }
  daySql += ` ORDER BY day DESC LIMIT ?`;
  dayArgs.push(limitDays);
  const days = await db.execute({ sql: daySql, args: dayArgs });
  if (days.rows.length === 0) return [];

  const dayList = days.rows.map((row) => String(row.day));
  const placeholders = dayList.map(() => "?").join(",");

  const res = await db.execute({
    sql: `SELECT * FROM saved_combos WHERE user_id = ? AND day IN (${placeholders})${
      source ? " AND source = ?" : ""
    } ORDER BY day DESC, id ASC`,
    args: source ? [userId, ...dayList, source] : [userId, ...dayList],
  });

  return res.rows.map((row) => {
    const legs = JSON.parse(String(row.legs)) as ComboLeg[];
    const day = String(row.day);
    return {
      id: Number(row.id),
      day,
      comboId: String(row.combo_id),
      title: String(row.title),
      legs,
      probability: Number(row.probability),
      fairOdds: Number(row.fair_odds),
      // Recalculado: así una jugada sigue reconocida aunque cambien decimales.
      hash: comboHash(day, legs),
      source: String(row.source) === "cup" ? "cup" : "model",
      origin: String(row.origin) === "manual" ? "manual" : "generated",
      createdAt: String(row.created_at),
    };
  });
}
