import { NextResponse } from "next/server";
import { buildHomeAlerts } from "@/lib/alerts";
import { getMeta } from "@/lib/db";
import {
  getConfirmedUpcomingLineups,
  getCounts,
  getMarketOdds,
  getUpcoming,
} from "@/lib/queries";
import { getHtVetoedSet } from "@/lib/veto";

export const dynamic = "force-dynamic";

export async function GET() {
  const [upcoming, confirmedLineups, htVetoed, counts, trainedAt, resultsSyncAt] =
    await Promise.all([
      getUpcoming(),
      getConfirmedUpcomingLineups(3),
      getHtVetoedSet(),
      getCounts(),
      getMeta("trained_at"),
      getMeta("results_sync_at"),
    ]);

  const marketOdds = await getMarketOdds(upcoming.map((match) => match.id));
  const { alerts, valueCount } = buildHomeAlerts({
    matches: upcoming,
    marketOdds,
    confirmedLineups,
    htVetoed,
  });

  return NextResponse.json({
    alerts,
    valueCount,
    upcoming: upcoming.length,
    played: counts.played,
    trainedAt,
    resultsSyncAt,
  });
}
