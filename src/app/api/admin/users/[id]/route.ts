import { NextResponse } from "next/server";
import { ensureSchemaOnce } from "@/lib/db";
import {
  countAdmins,
  deleteUser,
  getUserById,
  updateUser,
} from "@/lib/auth";
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Usuario inválido" }, { status: 400 });
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Ese usuario no existe" }, { status: 404 });
  }

  let body: {
    email?: string;
    name?: string;
    password?: string;
    isAdmin?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Correo inválido" }, { status: 400 });
  }
  if (body.password !== undefined && body.password.length > 0 && body.password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 },
    );
  }
  if (body.isAdmin === false && target.isAdmin && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { ok: false, error: "Debe quedar al menos un administrador" },
      { status: 400 },
    );
  }

  try {
    await updateUser(id, {
      email,
      name: body.name,
      isAdmin: body.isAdmin,
      password: body.password,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: "Ese correo ya está registrado" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Usuario inválido" }, { status: 400 });
  }
  if (id === guard.user.id) {
    return NextResponse.json(
      { ok: false, error: "No puedes borrar tu propio usuario" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ ok: false, error: "Ese usuario no existe" }, { status: 404 });
  }
  if (target.isAdmin && (await countAdmins()) <= 1) {
    return NextResponse.json(
      { ok: false, error: "Debe quedar al menos un administrador" },
      { status: 400 },
    );
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
