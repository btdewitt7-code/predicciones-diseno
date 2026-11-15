import type { Client } from "@libsql/client";
import { pickSide } from "./teamMatch";

export type GoalKeyEvent = {
  type?: { text?: string };
  clock?: { displayValue?: string };
  team?: { displayName?: string };
  scoringPlay?: boolean;
  participants?: { athlete?: { displayName?: string } }[];
};

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

/** Guarda los goles de un partido a partir del resumen de ESPN. */
export async function storeGoalEvents(
  db: Client,
  matchId: number,
  homeTeam: string,
  awayTeam: string,
  keyEvents: GoalKeyEvent[] | undefined,
) {
  const goals = (keyEvents ?? []).filter((event) => event.scoringPlay);
  if (goals.length === 0) return;

  await db.execute({ sql: `DELETE FROM goal_events WHERE match_id = ?`, args: [matchId] });

  const statements = goals
    .map((event) => {
      const teamName = event.team?.displayName ?? "";
      const player = event.participants?.[0]?.athlete?.displayName ?? "";
      const assist = event.participants?.[1]?.athlete?.displayName ?? null;
      const minute = event.clock?.displayValue ?? "";
      if (!player || !minute) return null;

      const side = pickSide(teamName, homeTeam, awayTeam);
      const typeText = (event.type?.text ?? "").toLowerCase();
      const kind = typeText.includes("penalty")
        ? "penalty"
        : typeText.includes("own")
          ? "own"
          : "goal";

      return {
        sql: `INSERT INTO goal_events (match_id, minute, side, team, player, assist, kind)
              VALUES (?,?,?,?,?,?,?)
              ON CONFLICT(match_id, minute, player) DO UPDATE SET
                side = excluded.side,
                team = excluded.team,
                assist = excluded.assist,
                kind = excluded.kind`,
        args: [matchId, minute, side, teamName, player, assist, kind],
      };
    })
    .filter((statement): statement is NonNullable<typeof statement> => statement !== null);

  if (statements.length > 0) await db.batch(statements, "write");
}
