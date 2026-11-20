"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLinks } from "@/components/nav-links";
import { RefreshButton } from "@/components/refresh-button";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        aria-expanded={open}
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-300 transition hover:text-white lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
      </button>

      {mounted && open
        ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-sm"
          />

          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[82vw] flex-col border-r border-ink-800 bg-ink-950 px-3 py-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 px-1">
              <Link href="/" className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-mint-500/15 text-mint-400 ring-1 ring-mint-500/30">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <ellipse cx="12" cy="16" rx="5" ry="4" />
                    <circle cx="5.5" cy="10" r="2" />
                    <circle cx="9.5" cy="6.5" r="2" />
                    <circle cx="14.5" cy="6.5" r="2" />
                    <circle cx="18.5" cy="10" r="2" />
                  </svg>
                </span>
                <span className="truncate text-sm font-semibold tracking-tight text-white">
                  Dogebets
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-mist-400 transition hover:bg-ink-800 hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-mist-500">
                Análisis
              </div>
              <NavLinks vertical />

              {isAdmin ? (
                <div className="mt-4 border-t border-ink-800/70 pt-4">
                  <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wide text-mist-500">
                    Admin
                  </div>
                  <Link
                    href="/observacion"
                    className="flex items-center gap-2 rounded-lg border-l-2 border-transparent px-3 py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white"
                  >
                    <span className="size-1.5 rounded-full bg-ink-600" />
                    Observación
                  </Link>
                  <Link
                    href="/usuarios"
                    className="flex items-center gap-2 rounded-lg border-l-2 border-transparent px-3 py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white"
                  >
                    <span className="size-1.5 rounded-full bg-ink-600" />
                    Usuarios
                  </Link>
                  <Link
                    href="/cobertura"
                    className="flex items-center gap-2 rounded-lg border-l-2 border-transparent px-3 py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white"
                  >
                    <span className="size-1.5 rounded-full bg-ink-600" />
                    Cobertura
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="mt-auto flex items-center gap-2 border-t border-ink-800/70 pt-3">
              {isAdmin ? <RefreshButton /> : null}
              <ThemeToggle />
            </div>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
