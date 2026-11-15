import { NextResponse } from "next/server";
import { syncLiveScores } from "@/lib/liveSync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await syncLiveScores();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
