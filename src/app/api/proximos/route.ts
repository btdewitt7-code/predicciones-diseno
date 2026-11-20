import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Partidos que empiezan en los próximos 35 minutos.
 * Las horas se guardan sin zona (UTC), igual que en el resto de la app.
 */
export async function GET() {
  const from = new Date(Date.now() - 2 * 60_000).toISOString().slice(0, 19);
  const to = new Date(Date.now() + 35 * 60_000).toISOString().slice(0, 19);

  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, league_code, home_team, away_team, kickoff
          FROM matches
          WHERE status = 'scheduled' AND kickoff >= ? AND kickoff <= ?
          ORDER BY kickoff`,
    args: [from, to],
  });

  return NextResponse.json({
    matches: res.rows.map((row) => ({
      id: Number(row.id),
      league: String(row.league_code),
      home: String(row.home_team),
      away: String(row.away_team),
      kickoff: String(row.kickoff),
    })),
  });
}
