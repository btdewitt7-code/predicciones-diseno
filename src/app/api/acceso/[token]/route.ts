import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { createSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Acceso temporal para una IA o un revisor externo.
 *
 * Requiere en el entorno:
 *   DEMO_TOKEN  → cadena secreta que va en la URL
 *   DEMO_UNTIL  → fecha ISO de vencimiento (ej. 2026-11-20T14:30:00Z)
 *   DEMO_EMAIL  → correo del usuario invitado (sin permisos de admin)
 *
 * Al vencer, las sesiones del invitado dejan de valer solas.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const expected = process.env.DEMO_TOKEN;
  const until = process.env.DEMO_UNTIL;
  const email = process.env.DEMO_EMAIL ?? "invitado@dogebets.win";

  if (!expected || !until) {
    return new NextResponse("Acceso no configurado", { status: 404 });
  }

  const expiresAt = new Date(until);
  if (!Number.isFinite(expiresAt.getTime()) || Date.now() > expiresAt.getTime()) {
    return new NextResponse("Acceso vencido", { status: 403 });
  }

  if (!token || token !== expected) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const db = await ensureSchema();
  const found = await db.execute({
    sql: `SELECT id FROM users WHERE email = ?`,
    args: [email],
  });

  let userId: number;
  if (found.rows.length > 0) {
    userId = Number(found.rows[0].id);
    await db.execute({
      sql: `UPDATE users SET is_admin = 0 WHERE id = ?`,
      args: [userId],
    });
  } else {
    const inserted = await db.execute({
      sql: `INSERT INTO users (email, name, password_hash, is_admin, created_at)
            VALUES (?,?,?,?,?)`,
      args: [email, "Invitado IA", randomBytes(32).toString("hex"), 0, new Date().toISOString()],
    });
    userId = Number(inserted.lastInsertRowid);
  }

  // Una sola sesión activa: al volver a entrar se cierran las anteriores.
  await db.execute({ sql: `DELETE FROM sessions WHERE user_id = ?`, args: [userId] });

  const session = await createSession(userId, expiresAt);
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
