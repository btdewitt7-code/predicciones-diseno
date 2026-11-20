import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "pred_sesion";
const DEMO_COOKIE = "pred_demo";

function demoActivo(token: string | null | undefined): boolean {
  const expected = process.env.DEMO_TOKEN;
  const until = process.env.DEMO_UNTIL;
  if (!expected || !until || !token || token !== expected) return false;
  const time = Date.parse(until);
  return Number.isFinite(time) && Date.now() <= time;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const demo = request.cookies.get(DEMO_COOKIE)?.value;
  const demoHeader = request.headers.get("x-demo-token");

  // Enlace de invitado: ?acceso=TOKEN deja la sesión andando en la misma visita,
  // aunque el cliente no guarde cookies (se reescribe la URL sin el parámetro).
  const acceso = request.nextUrl.searchParams.get("acceso");
  if (demoActivo(acceso)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("acceso");
    request.cookies.set(DEMO_COOKIE, acceso as string);
    const response = NextResponse.rewrite(url, { request });
    response.cookies.set(DEMO_COOKIE, acceso as string, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(process.env.DEMO_UNTIL as string),
    });
    return response;
  }

  if (pathname === "/entrar") {
    if (token) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!token && !demoActivo(demo) && !demoActivo(demoHeader)) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|ogg|json|txt)).*)",
  ],
};
