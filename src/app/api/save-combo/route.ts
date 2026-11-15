import { NextResponse } from "next/server";
import { ensureSchemaOnce, getDb } from "@/lib/db";
import { deleteCombo, saveCombo } from "@/lib/comboStore";
import { currentUser } from "@/lib/session";
import { dayKey, todayKey } from "@/lib/format";
import { isCupLeague } from "@/lib/leagues";
import type { Combo, ComboLeg } from "@/lib/combos";

function safeDay(kickoff: string | undefined, explicit: string | null): string {
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  if (!kickoff) return todayKey();
  try {
    const key = dayKey(kickoff);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : todayKey();
  } catch {
    return todayKey();
  }
}

export async function POST(request: Request) {
  await ensureSchemaOnce();

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Inicia sesión para guardar" },
      { status: 401 },
    );
  }

  let body: Partial<Combo> & { day?: string; origin?: string };
  try {
    body = (await request.json()) as Partial<Combo> & { day?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const legs = (Array.isArray(body.legs) ? body.legs : []).filter(
    (leg): leg is ComboLeg =>
      Boolean(leg) &&
      typeof leg.market === "string" &&
      leg.market.length > 0 &&
      (typeof leg.matchId === "number" || typeof (leg as { matchId?: unknown }).matchId === "string"),
  );

  if (legs.length === 0) {
    return NextResponse.json({ ok: false, error: "Jugada inválida" }, { status: 400 });
  }

  const day = safeDay(legs[0]?.kickoff, body.day ?? null);
  const probability = Number(body.probability);
  const fairOdds = Number(body.fairOdds);

  const matchIds = [
    ...new Set(
      legs
        .map((leg) => Number(leg.matchId))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  let source: "model" | "cup" = "model";
  if (matchIds.length > 0) {
    const db = getDb();
    const res = await db.execute({
      sql: `SELECT league_code FROM matches WHERE id IN (${matchIds.map(() => "?").join(",")})`,
      args: matchIds,
    });
    if (res.rows.some((row) => isCupLeague(String(row.league_code)))) {
      source = "cup";
    }
  }

  const saved = await saveCombo(
    day,
    {
      id: typeof body.id === "string" && body.id ? body.id : "jugada",
      title: typeof body.title === "string" && body.title ? body.title : "Jugada",
      description: typeof body.description === "string" ? body.description : "",
      legs,
      probability: Number.isFinite(probability) ? probability : 0,
      fairOdds: Number.isFinite(fairOdds) ? fairOdds : 0,
    },
    user.id,
    source,
    body.origin === "manual" ? "manual" : "generated",
  );

  return NextResponse.json({ ok: true, saved, day });
}

export async function DELETE(request: Request) {
  await ensureSchemaOnce();

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Inicia sesión para quitar" },
      { status: 401 },
    );
  }

  let body: { legs?: ComboLeg[]; day?: string };
  try {
    body = (await request.json()) as { legs?: ComboLeg[]; day?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const legs = (Array.isArray(body.legs) ? body.legs : []).filter(
    (leg): leg is ComboLeg =>
      Boolean(leg) &&
      typeof leg.market === "string" &&
      leg.market.length > 0 &&
      (typeof leg.matchId === "number" || typeof (leg as { matchId?: unknown }).matchId === "string"),
  );

  if (legs.length === 0) {
    return NextResponse.json({ ok: false, error: "Jugada inválida" }, { status: 400 });
  }

  const day = safeDay(legs[0]?.kickoff, body.day ?? null);
  const deleted = await deleteCombo(day, legs, user.id);

  return NextResponse.json({ ok: true, deleted });
}
