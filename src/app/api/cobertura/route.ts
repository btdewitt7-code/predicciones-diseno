import { NextResponse } from "next/server";
import { espnUpcoming } from "@/lib/coverage";
import { LEAGUE_BY_CODE } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const codes = (searchParams.get("codes") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter((code) => LEAGUE_BY_CODE[code]);

  if (codes.length === 0) return NextResponse.json({ leagues: [] });

  const leagues = await Promise.all(
    codes.map(async (code) => {
      const league = LEAGUE_BY_CODE[code];
      const count = await espnUpcoming(code);
      return {
        code,
        name: league.name,
        country: league.country,
        espn: count,
      };
    }),
  );

  return NextResponse.json({ leagues });
}
