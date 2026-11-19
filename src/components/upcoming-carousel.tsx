"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";

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
    return <img src={logo} alt="" className="size-10 object-contain" loading="lazy" />;
  }
  return (
    <span className="grid size-10 place-items-center rounded-full bg-ink-800 text-[10px] font-semibold text-mist-400">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function UpcomingCarousel({ matches }: { matches: CarouselMatch[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false, captured: false });
  const velocity = useRef(0);
  const lastPoint = useRef({ x: 0, time: 0 });
  const glide = useRef<number | null>(null);

  useEffect(() => () => cancelGlide(), []);

  // Oculta la flecha del lado en el que ya no queda nada por recorrer.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const sync = () => {
      setAtStart(track.scrollLeft <= 4);
      setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
    };
    sync();
    track.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(track);
    return () => {
      track.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, [matches.length]);

  useEffect(() => {
    if (paused || dragging || matches.length <= 1) return;
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
  }, [paused, dragging, matches.length]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    cancelGlide();
    const card = track.querySelector<HTMLElement>("[data-carousel-card]");
    const step = card ? card.offsetWidth + 12 : 280;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  function cancelGlide() {
    if (glide.current !== null) {
      cancelAnimationFrame(glide.current);
      glide.current = null;
    }
  }

  function snapToNearest() {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-carousel-card]");
    const step = card ? card.offsetWidth + 12 : 282;
    const max = track.scrollWidth - track.clientWidth;
    const target = Math.min(max, Math.max(0, Math.round(track.scrollLeft / step) * step));
    track.scrollTo({ left: target, behavior: "smooth" });
  }

  function startGlide() {
    const run = () => {
      const track = trackRef.current;
      if (!track) return;
      const v = velocity.current;
      if (Math.abs(v) < 0.03) {
        velocity.current = 0;
        glide.current = null;
        snapToNearest();
        return;
      }
      track.scrollLeft += v * 16;
      velocity.current = v * 0.93;
      glide.current = requestAnimationFrame(run);
    };
    cancelGlide();
    glide.current = requestAnimationFrame(run);
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    cancelGlide();
    velocity.current = 0;
    lastPoint.current = { x: event.clientX, time: performance.now() };
    drag.current = {
      active: true,
      startX: event.clientX,
      startLeft: track.scrollLeft,
      moved: false,
      captured: false,
    };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || !drag.current.active) return;
    const now = performance.now();
    const dt = now - lastPoint.current.time;
    if (dt > 0) velocity.current = -(event.clientX - lastPoint.current.x) / dt;
    lastPoint.current = { x: event.clientX, time: now };
    const delta = event.clientX - drag.current.startX;
    if (!drag.current.captured && Math.abs(delta) > 5) {
      drag.current.moved = true;
      try {
        track.setPointerCapture(event.pointerId);
        drag.current.captured = true;
      } catch {
        /* puntero sintetico */
      }
    }
    track.scrollLeft = drag.current.startLeft - delta;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!drag.current.active) return;
    drag.current.active = false;
    setDragging(false);
    try { if (track?.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId); } catch { /* puntero sintetico */ }
    if (!drag.current.moved) return;
    if (Math.abs(velocity.current) > 0.12) {
      startGlide();
    } else {
      snapToNearest();
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!drag.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current.moved = false;
  };

  if (matches.length === 0) return null;

  return (
    <section className="relative">
      <div
        ref={trackRef}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(event) => event.preventDefault()}
        className={`flex gap-3 overflow-x-auto pb-1 select-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {matches.map((match) => (
          <Link
            key={match.id}
            href={`/partido/${match.id}`}
            data-carousel-card
            className="card group flex w-[80vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden transition hover:border-mint-500/35 sm:w-[270px]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ink-800/70 px-3 py-2.5">
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

            <div className="flex flex-1 items-center justify-between gap-2 px-3 py-6">
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

            <div className="grid grid-cols-3 gap-1 border-t border-ink-800/70 px-3 py-2.5 text-center text-[10px]">
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

      <button
        type="button"
        onClick={() => move(-1)}
        aria-label="Anterior"
        aria-hidden={atStart}
        tabIndex={atStart ? -1 : 0}
        className={`absolute left-1.5 top-[40%] z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-ink-700/80 bg-ink-950/85 text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.7)] backdrop-blur transition-opacity duration-200 hover:border-mint-500/40 hover:text-mint-300 ${
          atStart ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => move(1)}
        aria-label="Siguiente"
        aria-hidden={atEnd}
        tabIndex={atEnd ? -1 : 0}
        className={`absolute right-1.5 top-[40%] z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-ink-700/80 bg-ink-950/85 text-white shadow-[0_6px_20px_-8px_rgba(0,0,0,0.7)] backdrop-blur transition-opacity duration-200 hover:border-mint-500/40 hover:text-mint-300 ${
          atEnd ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}
