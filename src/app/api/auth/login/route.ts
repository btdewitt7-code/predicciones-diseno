import { NextResponse, type NextRequest } from "next/server";
import { ensureSchemaOnce } from "@/lib/db";
import { findUserByEmail, verifyPassword } from "@/lib/auth";
import {
  SESSION_COOKIE,
  cleanExpiredSessions,
  createSession,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  await ensureSchemaOnce();

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Escribe correo y contraseña" },
      { status: 400 },
    );
  }

  const user = await findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { ok: false, error: "Correo o contraseña incorrectos" },
      { status: 401 },
    );
  }

  await cleanExpiredSessions();
  const token = await createSession(user.id);

  const secure =
    request.headers.get("x-forwarded-proto") === "https" ||
    request.nextUrl.protocol === "https:";

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 30 * 86_400,
  });
  return response;
}
