"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function MobileSearch() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className="grid size-9 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-300 transition hover:border-mint-500/40 hover:text-white lg:hidden"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>

      {mounted && open
        ? createPortal(
            <div className="fixed inset-0 z-[60] lg:hidden">
              <button
                type="button"
                aria-label="Cerrar búsqueda"
                onClick={() => setOpen(false)}
                className="absolute inset-0 h-full w-full cursor-default bg-black/55 backdrop-blur-sm"
              />

              <form
                action="/"
                className="absolute inset-x-0 top-0 flex items-center gap-2 border-b border-ink-800 bg-ink-950 px-3 py-3"
              >
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 transition focus-within:border-mint-500/50">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 shrink-0 text-mist-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    ref={inputRef}
                    type="search"
                    name="q"
                    placeholder="Buscar equipo o liga…"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-mist-500 focus:outline-none"
                  />
                </label>

                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-lg bg-mint-500/15 px-3 text-xs font-medium text-mint-300 ring-1 ring-mint-500/30 transition hover:bg-mint-500/25"
                >
                  Buscar
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar búsqueda"
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-mist-400 transition hover:bg-ink-800 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </form>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
