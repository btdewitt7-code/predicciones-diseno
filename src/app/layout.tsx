import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { ensureSchemaOnce } from "@/lib/db";
import { LEAGUES } from "@/lib/leagues";
import { RefreshButton } from "@/components/refresh-button";
import { NavLinks } from "@/components/nav-links";
import { NavIcon } from "@/components/nav-icons";
import { MobileNav } from "@/components/mobile-nav";
import { MobileTabBar } from "@/components/mobile-tabbar";
import { UserBadge } from "@/components/user-badge";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BetSlip } from "@/components/bet-slip";
import { currentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dogebets | Análisis pre-partido",
  description: `Estadísticas y probabilidades pre-partido con un modelo Dixon-Coles sobre ${LEAGUES.length} competiciones de Europa y América.`,
};

function SearchForm({ className = "" }: { className?: string }) {
  return (
    <form action="/" className={`min-w-0 items-center gap-2 ${className}`}>
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 transition focus-within:border-mint-500/50">
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 text-mist-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          name="q"
          placeholder="Buscar equipo o liga…"
          className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-mist-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        className="h-9 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-3 text-xs text-mist-300 transition hover:border-mint-500/40 hover:text-white"
      >
        Buscar
      </button>
    </form>
  );
}

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

        <div className="min-h-screen lg:flex">
          <aside className="sticky top-0 hidden h-screen w-14 shrink-0 flex-col border-r border-ink-800/80 bg-ink-950/90 px-1.5 py-4 lg:flex xl:w-44 xl:px-2.5">
            <Link href="/" className="flex shrink-0 items-center justify-center gap-2.5 xl:justify-start xl:px-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint-500/15 text-mint-400 ring-1 ring-mint-500/30">
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <ellipse cx="12" cy="16" rx="5" ry="4" />
                  <circle cx="5.5" cy="10" r="2" />
                  <circle cx="9.5" cy="6.5" r="2" />
                  <circle cx="14.5" cy="6.5" r="2" />
                  <circle cx="18.5" cy="10" r="2" />
                </svg>
              </span>
              <span className="hidden min-w-0 flex-col leading-tight xl:flex">
                <span className="text-base font-semibold tracking-tight text-white">Dogebets</span>
                <span className="truncate text-[10px] text-mist-500">Análisis de fútbol</span>
              </span>
            </Link>

            {user ? (
              <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
                <div className="mb-2 hidden px-2.5 text-[10px] font-semibold uppercase tracking-wide text-mist-500 xl:block">
                  Análisis
                </div>
                <NavLinks vertical rail />
                {user.isAdmin ? (
                  <div className="mt-4 border-t border-ink-800/70 pt-4">
                    <div className="mb-2 hidden px-2.5 text-[10px] font-semibold uppercase tracking-wide text-mist-500 xl:block">
                      Admin
                    </div>
                    <Link
                      href="/observacion"
                      title="Observación"
                      className="flex items-center justify-center gap-2.5 rounded-lg border-l-2 border-transparent py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white xl:justify-start xl:px-2.5"
                    >
                      <NavIcon href="/observacion" className="size-4" />
                      <span className="hidden truncate xl:inline">Observación</span>
                    </Link>
                    <Link
                      href="/usuarios"
                      title="Usuarios"
                      className="flex items-center justify-center gap-2.5 rounded-lg border-l-2 border-transparent py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white xl:justify-start xl:px-2.5"
                    >
                      <NavIcon href="/usuarios" className="size-4" />
                      <span className="hidden truncate xl:inline">Usuarios</span>
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-auto border-t border-ink-800/70 pt-3">
              <div className="flex flex-col items-center gap-2">
                {user?.isAdmin ? (
                  <>
                    <span className="xl:hidden">
                      <RefreshButton compact />
                    </span>
                    <span className="hidden xl:block">
                      <RefreshButton />
                    </span>
                  </>
                ) : null}
                <ThemeToggle />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-ink-800/80 bg-ink-950/85 backdrop-blur">
              <div className="px-3 py-2.5 sm:px-4 lg:px-6">
                <div className="flex items-center gap-2">
                  {user ? <MobileNav isAdmin={user.isAdmin} /> : null}

                  <Link href="/" className="flex shrink-0 items-center gap-2 lg:hidden">
                    <span className="grid size-8 place-items-center rounded-lg bg-mint-500/15 text-mint-400 ring-1 ring-mint-500/30">
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <ellipse cx="12" cy="16" rx="5" ry="4" />
                        <circle cx="5.5" cy="10" r="2" />
                        <circle cx="9.5" cy="6.5" r="2" />
                        <circle cx="14.5" cy="6.5" r="2" />
                        <circle cx="18.5" cy="10" r="2" />
                      </svg>
                    </span>
                    <span className="text-sm font-semibold tracking-tight text-white">Dogebets</span>
                  </Link>

                  <SearchForm className="hidden lg:flex lg:max-w-2xl" />

                  <div className="ml-auto flex items-center gap-2">
                    {user ? (
                      <>
                        <div className="hidden lg:flex lg:items-center lg:gap-2">
                          <UserBadge user={user} />
                          <LogoutButton />
                        </div>
                        <div className="flex items-center gap-2 lg:hidden">
                          <UserBadge user={user} />
                          <LogoutButton compact />
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>

                <SearchForm className="mt-3 flex lg:hidden" />
              </div>
            </header>

            <main className="mx-auto w-full max-w-[1660px] px-4 pb-24 pt-3 sm:px-6 sm:pt-4 lg:pb-6 lg:pt-6">{children}</main>

            <footer className="mx-auto w-full max-w-[1660px] px-4 pb-24 pt-2 text-xs text-mist-500 sm:px-6 lg:pb-10">
              Proyecto personal de análisis. Las probabilidades son estimaciones, no garantías.
            </footer>
          </div>
        </div>

        {user ? <MobileTabBar /> : null}
        {user ? <BetSlip /> : null}
      </body>
    </html>
  );
}
