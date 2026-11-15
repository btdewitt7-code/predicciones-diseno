import { NextResponse } from "next/server";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { getStandings } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const league = (searchParams.get("league") ?? "").toUpperCase();

  if (!LEAGUE_BY_CODE[league]) {
    return NextResponse.json({ standings: [] }, { status: 404 });
  }

  const standings = await getStandings(league);
  return NextResponse.json(
    { standings },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
