"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type CarouselMatch = {
  id: number;
  leagueCode: string;
  leagueName: string;
  leagueCountry: string;
  leagueLogo?: string | null;
  day: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  home: string;
  draw: string;
  away: string;
  live: boolean;
};

function TeamLogo({ name, logo }: { name: string; logo?: string | null }) {
  if (logo) {
    return <img src={logo} alt="" className="size-9 object-contain" loading="lazy" />;
  }
  return (
    <span className="grid size-9 place-items-center rounded-full bg-ink-800 text-[10px] font-semibold text-mist-400">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function UpcomingCarousel({ matches }: { matches: CarouselMatch[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || matches.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      const track = trackRef.current;
      if (!track) return;
      const card = track.querySelector<HTMLElement>("[data-carousel-card]");
      const step = card ? card.offsetWidth + 12 : 280;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
    }, 5500);

    return () => window.clearInterval(id);
  }, [paused, matches.length]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-carousel-card]");
    const step = card ? card.offsetWidth + 12 : 280;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  if (matches.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-ui-section font-semibold text-white">Partidos destacados</h2>
          <p className="text-ui-caption text-mist-500">
            Próximos partidos y probabilidades del modelo.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Anterior"
            className="grid size-8 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-400 transition hover:border-mint-500/40 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Siguiente"
            className="grid size-8 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-mist-400 transition hover:border-mint-500/40 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="scroll-thin flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
      >
        {matches.map((match) => (
          <Link
            key={match.id}
            href={`/partido/${match.id}`}
            data-carousel-card
            className="card group flex w-[270px] shrink-0 snap-start flex-col overflow-hidden transition hover:border-mint-500/35"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-800/70 px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-mist-500">
                {match.leagueLogo ? (
                  <img src={match.leagueLogo} alt="" className="size-4 object-contain" loading="lazy" />
                ) : null}
                <span className="truncate">{match.leagueName}</span>
              </span>
              <span className="shrink-0 text-[10px] text-mist-500">
                {match.live ? (
                  <span className="mr-1 rounded bg-rose-400/15 px-1.5 py-0.5 font-semibold text-rose-300">
                    EN VIVO
                  </span>
                ) : null}
                {match.day} · {match.time}
              </span>
            </div>

            <div className="flex flex-1 items-center justify-between gap-2 px-3 py-4">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                <TeamLogo name={match.homeTeam} logo={match.homeLogo} />
                <span className="w-full truncate text-xs font-semibold text-white">
                  {match.homeTeam}
                </span>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-mist-500">vs</span>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                <TeamLogo name={match.awayTeam} logo={match.awayLogo} />
                <span className="w-full truncate text-xs font-semibold text-white">
                  {match.awayTeam}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 border-t border-ink-800/70 px-3 py-2 text-center text-[10px]">
              <div>
                <span className="block text-mist-500">L</span>
                <span className="font-semibold tabular-nums text-win-400">{match.home}</span>
              </div>
              <div>
                <span className="block text-mist-500">X</span>
                <span className="font-semibold tabular-nums text-mist-300">{match.draw}</span>
              </div>
              <div>
                <span className="block text-mist-500">V</span>
                <span className="font-semibold tabular-nums text-mist-300">{match.away}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
