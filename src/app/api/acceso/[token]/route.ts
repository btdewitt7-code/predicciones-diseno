import { NextResponse } from "next/server";
import { DEMO_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Acceso temporal para una IA o un revisor externo.
 *
 * Requiere en el entorno:
 *   DEMO_TOKEN  → cadena secreta que va en la URL
 *   DEMO_UNTIL  → fecha ISO de vencimiento (ej. 2026-11-20T14:30:00Z)
 *   DEMO_EMAIL  → correo del usuario invitado (sin permisos de admin)
 *
 * Deja una cookie `pred_demo`; al vencer deja de valer sola.
 * Además, cualquier página acepta `?acceso=TOKEN` o el encabezado
 * `x-demo-token` (útil para clientes que no guardan cookies).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const expected = process.env.DEMO_TOKEN;
  const until = process.env.DEMO_UNTIL;

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

  // Detrás del proxy el `request.url` puede venir como localhost: se arma el
  // destino con el host reenviado (Vercel, Cloudflare, etc.).
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const hostOk = forwardedHost && /^[a-z0-9.-]+(:\d+)?$/i.test(forwardedHost);
  const origin = hostOk
    ? `${forwardedProto ?? (forwardedHost.startsWith("localhost") ? "http" : "https")}://${forwardedHost}`
    : new URL(request.url).origin;

  const response = NextResponse.redirect(new URL("/", origin));
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
