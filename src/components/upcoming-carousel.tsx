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
  liveHome?: number | null;
  liveAway?: number | null;
  liveClock?: string | null;
  image?: string | null;
};

function TeamLogo({
  name,
  logo,
  small = false,
}: {
  name: string;
  logo?: string | null;
  small?: boolean;
}) {
  const size = small ? "size-6" : "size-11";
  if (logo) {
    return <img src={logo} alt="" className={`${size} shrink-0 object-contain`} loading="lazy" />;
  }
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-full bg-ink-800 text-[10px] font-semibold text-mist-400`}
    >
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
        {matches.map((match) => {
          const photo = Boolean(match.image);
          const teams = [
            { name: match.homeTeam, logo: match.homeLogo, score: match.liveHome ?? null },
            { name: match.awayTeam, logo: match.awayLogo, score: match.liveAway ?? null },
          ];
          return (
            <Link
              key={match.id}
              href={`/partido/${match.id}`}
              data-carousel-card
              className="card group relative flex h-[252px] w-[88vw] max-w-[346px] shrink-0 snap-start flex-col justify-end overflow-hidden transition hover:border-mint-500/35 sm:w-[324px]"
            >
              {match.image ? (
                <>
                  <img
                    src={match.image}
                    alt=""
                    className="pointer-events-none absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-black/10" />
                </>
              ) : null}

              <span
                className={`absolute left-2.5 top-2.5 z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-semibold ${
                  photo
                    ? "bg-black/55 text-[#fff] backdrop-blur"
                    : "bg-ink-850 text-mist-300 ring-1 ring-ink-700"
                }`}
              >
                {match.live ? (
                  <>
                    <span className="size-1.5 rounded-full bg-rose-400" />
                    EN VIVO
                    {match.liveClock ? (
                      <span className={`font-normal ${photo ? "text-white/70" : "text-mist-500"}`}>
                        {match.liveClock}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {match.day} {match.time}
                  </>
                )}
              </span>

              <div className="relative z-10 space-y-2 p-2.5">
                <div className="space-y-1">
                  {teams.map((team) => (
                    <div key={team.name} className="flex items-center gap-2">
                      <TeamLogo name={team.name} logo={team.logo} small />
                      <span
                        className={`min-w-0 flex-1 truncate text-[14px] font-semibold uppercase tracking-wide ${
                          photo ? "text-[#fff] drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]" : "text-white"
                        }`}
                      >
                        {team.name}
                      </span>
                      {team.score !== null ? (
                        <span
                          className={`shrink-0 text-xl font-bold tabular-nums ${
                            photo ? "text-[#fff]" : "text-white"
                          }`}
                        >
                          {team.score}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: "1", value: match.home },
                    { key: "X", value: match.draw },
                    { key: "2", value: match.away },
                  ].map((item) => (
                    <div
                      key={item.key}
                      className="relative z-10 rounded-lg bg-ink-850 px-1 py-1.5 text-center ring-1 ring-ink-800/60"
                    >
                      <span className="block text-[11px] text-mist-500">
                        {item.key}
                      </span>
                      <span className="block text-[16px] font-semibold tabular-nums text-win-400">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
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
