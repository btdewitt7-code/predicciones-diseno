import { NextResponse } from "next/server";
import { ensureSchemaOnce, getDb } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  await ensureSchemaOnce();

  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Inicia sesión" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const all = url.searchParams.get("all");
  const before = url.searchParams.get("before");
  const id = Number(url.searchParams.get("id"));
  const db = getDb();

  if (Number.isFinite(id) && id > 0) {
    const result = await db.execute({
      sql: "DELETE FROM saved_combos WHERE user_id = ? AND id = ?",
      args: [user.id, id],
    });
    return NextResponse.json({ ok: true, deleted: result.rowsAffected });
  }

  if (all === "1") {
    const result = await db.execute({
      sql: "DELETE FROM saved_combos WHERE user_id = ?",
      args: [user.id],
    });
    return NextResponse.json({ ok: true, deleted: result.rowsAffected });
  }

  if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return NextResponse.json({ ok: false, error: "fecha inválida" }, { status: 400 });
  }

  const result = await db.execute({
    sql: "DELETE FROM saved_combos WHERE user_id = ? AND day < ?",
    args: [user.id, before],
  });

  return NextResponse.json({ ok: true, deleted: result.rowsAffected });
}
