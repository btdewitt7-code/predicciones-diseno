import { NextResponse } from "next/server";
import { getMatch } from "@/lib/queries";
import { getPlayerShotLeaders } from "@/lib/playerShots";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const matchId = Number(new URL(request.url).searchParams.get("matchId"));
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ available: false, home: [], away: [] }, { status: 400 });
  }

  const data = await getMatch(matchId);
  if (!data) {
    return NextResponse.json({ available: false, home: [], away: [] });
  }

  try {
    const result = await getPlayerShotLeaders(data.match);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ available: false, home: [], away: [] }, { status: 500 });
  }
}
