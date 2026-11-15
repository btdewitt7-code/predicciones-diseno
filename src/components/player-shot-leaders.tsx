"use client";

import { useEffect, useState } from "react";

type Leader = {
  player: string;
  sot: number;
  shots: number;
  goals: number;
  apps: number;
};

type CardLeader = {
  player: string;
  yellow: number;
  red: number;
  apps: number;
};

type Data = {
  available: boolean;
  home: Leader[];
  away: Leader[];
  homeCards: CardLeader[];
  awayCards: CardLeader[];
};

export function PlayerShotLeaders({
  matchId,
  home,
  away,
}: {
  matchId: number;
  home: string;
  away: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    fetch(`/api/player-shots?matchId=${matchId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: Data) => {
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) {
          setData({ available: false, home: [], away: [], homeCards: [], awayCards: [] });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [matchId]);

  if (loading) {
    return <p className="mt-4 text-[10px] text-mist-500">Cargando jugadores…</p>;
  }

  if (!data?.available || (data.home.length === 0 && data.away.length === 0)) {
    return null;
  }

  return (
    <div>
      <h3 className="mb-3 text-base font-semibold text-white">
        Jugadores con más tiros al arco · últimos 5
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { team: home, list: data.home },
          { team: away, list: data.away },
        ].map(({ team, list }) =>
          list.length > 0 ? (
            <div key={team}>
              <p className="mb-1 text-[13px] font-medium text-mist-300">{team}</p>
              <ul className="space-y-1.5">
                {list.map((leader) => (
                  <li
                    key={leader.player}
                    className="flex items-center justify-between gap-2 text-[13px] text-mist-500"
                  >
                    <span className="min-w-0 truncate text-mist-300">{leader.player}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">
                      <span className="font-semibold text-win-400">{leader.sot}</span>
                      <span className="text-mist-500/70"> / {leader.shots} remates</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

export function PlayerCardLeaders({
  matchId,
  home,
  away,
  homeLogo,
  awayLogo,
}: {
  matchId: number;
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    fetch(`/api/player-shots?matchId=${matchId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: Data) => {
        if (alive) setData(json);
      })
      .catch(() => {
        if (alive) {
          setData({ available: false, home: [], away: [], homeCards: [], awayCards: [] });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [matchId]);

  if (loading) {
    return <p className="mt-4 text-[10px] text-mist-500">Cargando jugadores…</p>;
  }

  if (
    !data?.available ||
    ((data.homeCards?.length ?? 0) === 0 && (data.awayCards?.length ?? 0) === 0)
  ) {
    return null;
  }

  return (
    <div>
      <h3 className="text-base font-semibold text-white">
        Jugadores con más tarjetas · últimos 5
      </h3>
      <p className="mb-3 mt-0.5 text-[13px] text-mist-500">Los más amonestados de cada equipo.</p>

      <div className="space-y-4">
        {[
          { team: home, list: data.homeCards ?? [], logo: homeLogo },
          { team: away, list: data.awayCards ?? [], logo: awayLogo },
        ].map(({ team, list, logo }) => {
          if (list.length === 0) return null;
          const half = Math.ceil(list.length / 2);
          const columns = [list.slice(0, half), list.slice(half)];
          const rows = Math.max(columns[0].length, columns[1].length);
          return (
            <div key={team}>
              <div className="mb-2 flex items-center gap-2 border-b border-ink-800/60 pb-1.5">
                {logo ? <img src={logo} alt="" className="size-5 object-contain" /> : null}
                <span className="text-[13px] font-semibold text-white">{team}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-8">
                {columns.map((column, columnIndex) => (
                  <div key={columnIndex} className="space-y-1.5">
                    {Array.from({ length: rows }).map((_, rowIndex) => {
                      const leader = column[rowIndex];
                      return (
                        <div
                          key={leader?.player ?? `empty-${rowIndex}`}
                          className="flex items-center justify-between gap-2 text-[13px]"
                        >
                          <span className="min-w-0 truncate text-mist-300">
                            {leader?.player ?? "—"}
                          </span>
                          {leader ? (
                            <span className="shrink-0 whitespace-nowrap tabular-nums">
                              <span className="font-semibold text-amber-400">{leader.yellow}</span>
                              <span className="text-mist-500/70"> A</span>
                              {leader.red > 0 ? (
                                <>
                                  <span className="text-mist-500/40"> · </span>
                                  <span className="font-semibold text-rose-400">{leader.red}</span>
                                  <span className="text-mist-500/70"> R</span>
                                </>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-mist-500/40">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
