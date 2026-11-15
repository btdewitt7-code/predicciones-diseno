import { NextResponse } from "next/server";
import { ensureSchemaOnce } from "@/lib/db";
import { createUser, listUsersWithStats } from "@/lib/auth";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  await ensureSchemaOnce();
  const user = await currentUser();
  if (!user) {
    return { error: NextResponse.json({ ok: false, error: "Inicia sesión" }, { status: 401 }) };
  }
  if (!user.isAdmin) {
    return { error: NextResponse.json({ ok: false, error: "Solo el administrador" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  return NextResponse.json({ ok: true, users: await listUsersWithStats() });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: { email?: string; name?: string; password?: string; isAdmin?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const name = body.name?.trim() ?? "";
  const password = body.password ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 },
    );
  }

  try {
    const id = await createUser({
      email,
      name: name || null,
      password,
      isAdmin: Boolean(body.isAdmin),
    });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: "Ese correo ya está registrado" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "No se pudo crear" }, { status: 500 });
  }
}
