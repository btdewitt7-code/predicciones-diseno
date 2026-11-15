import { NextResponse } from "next/server";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { getStandings, getTeamLogoMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get("league") ?? "").toUpperCase();

  if (!LEAGUE_BY_CODE[league]) {
    return NextResponse.json({ standings: [] }, { status: 404 });
  }

  const [standings, logos] = await Promise.all([
    getStandings(league),
    getTeamLogoMap(),
  ]);

  const leagueLogos = [...logos.entries()]
    .filter(([key]) => key.startsWith(`${league}:`))
    .map(([key, url]) => ({ team: key.slice(league.length + 1), url }));

  const withLogos = standings.map((row) => {
    const exact = leagueLogos.find((item) => item.team === row.team);
    const normalized = normalize(row.team);
    const similar =
      exact ??
      leagueLogos.find((item) => {
        const name = normalize(item.team);
        return name.includes(normalized) || normalized.includes(name);
      });
    return { ...row, logo_url: similar?.url ?? null };
  });

  return NextResponse.json(
    { standings: withLogos },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
