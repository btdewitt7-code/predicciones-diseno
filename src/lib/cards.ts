import type { Client } from "@libsql/client";
import type { GoalKeyEvent } from "./goalEvents";
import { pickSide } from "./teamMatch";

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['.]/g, "")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const setA = new Set(normalize(a).split(" ").filter(Boolean));
  const setB = new Set(normalize(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / new Set([...setA, ...setB]).size;
}

/** Guarda amarillas y rojas de un partido a partir del resumen de ESPN. */
export async function storeCardEvents(
  db: Client,
  matchId: number,
  homeTeam: string,
  awayTeam: string,
  keyEvents: GoalKeyEvent[] | undefined,
) {
  const cards = (keyEvents ?? []).filter((event) => {
    const text = (event.type?.text ?? "").toLowerCase();
    return text.includes("yellow card") || text.includes("red card");
  });
  if (cards.length === 0) return;

  await db.execute({ sql: `DELETE FROM card_events WHERE match_id = ?`, args: [matchId] });

  const statements = cards
    .map((event) => {
      const text = (event.type?.text ?? "").toLowerCase();
      const color = text.includes("red") ? "red" : "yellow";
      const teamName = event.team?.displayName ?? "";
      const player = event.participants?.[0]?.athlete?.displayName ?? "";
      const minute = event.clock?.displayValue ?? "";
      if (!player || !minute) return null;

      const side = pickSide(teamName, homeTeam, awayTeam);

      return {
        sql: `INSERT INTO card_events (match_id, minute, side, team, player, color)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT(match_id, minute, player) DO UPDATE SET
                side = excluded.side,
                team = excluded.team,
                color = excluded.color`,
        args: [matchId, minute, side, teamName, player, color],
      };
    })
    .filter((statement): statement is NonNullable<typeof statement> => statement !== null);

  if (statements.length > 0) await db.batch(statements, "write");
}
