import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ensureSchemaOnce } from "@/lib/db";
import { LEAGUES } from "@/lib/leagues";
import { RefreshButton } from "@/components/refresh-button";
import { NavLinks } from "@/components/nav-links";
import { UserBadge } from "@/components/user-badge";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BetSlip } from "@/components/bet-slip";
import { currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Predicciones | Análisis pre-partido",
  description: `Estadísticas y probabilidades pre-partido con un modelo Dixon-Coles sobre ${LEAGUES.length} competiciones de Europa y América.`,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await ensureSchemaOnce();
  const user = await currentUser();

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-ink-950 font-sans">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("theme");if(t==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark";}}catch(e){}`}
        </Script>
        <style>{`
          .app-shell { width: 100%; max-width: 1450px; margin-inline: auto; }
          .app-header { padding-block: 1.25rem; }
          @media (min-width: 1024px) { .app-shell { width: 84%; } }
        `}</style>
        <header className="sticky top-0 z-20 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur">
          <div className="app-header w-full px-3 sm:px-4 lg:px-6">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex shrink-0 items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-mint-500/15 text-mint-400 ring-1 ring-mint-500/30">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 17l5-5 4 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 8h4v4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold tracking-tight text-white">
                    Predicciones
                  </span>
                  <span className="hidden text-[10px] text-mist-500 sm:block">
                    Dixon-Coles · Goles + Tiros · {LEAGUES.length} Ligas
                  </span>
                </span>
              </Link>

              <div className="hidden min-w-0 flex-1 items-center justify-end gap-2 lg:flex">
                {user ? (
                  <>
                    <div className="scroll-thin min-w-0 overflow-x-auto">
                      <div className="flex items-center gap-0.5">
                        <NavLinks />
                        {user.isAdmin ? (
                          <>
                            <Link
                              href="/observacion"
                              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-mist-400 transition hover:bg-ink-800 hover:text-white"
                            >
                              Observación
                            </Link>
                            <Link
                              href="/usuarios"
                              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs text-mist-400 transition hover:bg-ink-800 hover:text-white"
                            >
                              Usuarios
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {user.isAdmin ? <RefreshButton /> : null}
                    <ThemeToggle />
                    <UserBadge user={user} />
                    <LogoutButton />
                  </>
                ) : null}
              </div>

              <div className="flex items-center gap-2 lg:hidden">
                {user ? (
                  <>
                    {user.isAdmin ? <RefreshButton /> : null}
                    <ThemeToggle />
                    <UserBadge user={user} compact />
                    <LogoutButton compact />
                  </>
                ) : null}
              </div>
            </div>

            {user ? (
              <div className="mt-2 flex items-center gap-2 lg:hidden">
                <div className="scroll-thin -mx-1 min-w-0 flex-1 overflow-x-auto px-1 pb-0.5">
                  <NavLinks />
                </div>
                {user.isAdmin ? (
                  <>
                    <Link
                      href="/observacion"
                      aria-label="Observación"
                      title="Observación"
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-300 transition hover:text-white"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" strokeLinecap="round" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </Link>
                    <Link
                      href="/usuarios"
                      aria-label="Usuarios"
                      title="Usuarios"
                      className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-300 transition hover:text-white"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0119 7a4 4 0 01-3 3.87" strokeLinecap="round" />
                      </svg>
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        <main className="app-shell px-4 py-8 sm:px-6">{children}</main>

        <footer className="app-shell px-4 pb-10 pt-4 text-xs text-mist-500 sm:px-6">
          {/* Datos: football-data.co.uk · Dixon-Coles con goles + tiros · */}
          Proyecto personal de análisis. Las probabilidades son estimaciones, no garantías.
        </footer>

        {user ? <BetSlip /> : null}
      </body>
    </html>
  );
}
