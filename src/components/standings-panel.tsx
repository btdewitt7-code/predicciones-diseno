"use client";

import { useEffect, useRef, useState } from "react";
import { displayTeam } from "@/lib/display";

type Standing = {
  league_code: string;
  team: string;
  group_name: string | null;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_diff: number;
  points: number;
  updated_at: string;
};

function sameTeam(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

export function StandingsPanel({
  leagueCode,
  leagueName,
  homeTeam,
  awayTeam,
}: {
  leagueCode: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
}) {
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    requested.current = false;
    setRows(null);
    setFailed(false);
  }, [leagueCode]);

  useEffect(() => {
    const load = () => {
      if (requested.current) return;
      requested.current = true;
      fetch(`/api/standings?league=${encodeURIComponent(leagueCode)}`, { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) throw new Error("standings");
          return (await res.json()) as { standings?: Standing[] };
        })
        .then((json) => setRows(json.standings ?? []))
        .catch(() => {
          setFailed(true);
          setRows([]);
        });
    };

    const onTabChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "posiciones") load();
    };

    window.addEventListener("match-tab-change", onTabChange);
    return () => window.removeEventListener("match-tab-change", onTabChange);
  }, [leagueCode]);

  if (rows === null) {
    return (
      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Tabla de posiciones</h2>
        <p className="text-[12px] text-mist-500">
          {failed ? "No se pudo cargar la tabla." : "Cargando tabla de posiciones…"}
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card p-5">
        <h2 className="mb-1 text-[15px] font-semibold text-white">Tabla de posiciones</h2>
        <p className="text-[12px] text-mist-500">
          No hay tabla de posiciones disponible para {leagueName}.
        </p>
      </div>
    );
  }

  const byGroup = new Map<string, Standing[]>();
  for (const row of rows) {
    const key = row.group_name?.trim() || "General";
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }
  const groups = [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="card p-5">
      <h2 className="mb-1 text-[15px] font-semibold text-white">Tabla de posiciones</h2>
      <p className="mb-4 text-[11px] text-mist-500">{leagueName}</p>

      <div className="space-y-5">
        {groups.map(([group, list]) => (
          <div key={group}>
            {groups.length > 1 || group !== "General" ? (
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-mist-500">
                {group}
              </h3>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-ink-800 text-[10px] uppercase tracking-wide text-mist-500">
                    <th className="w-8 py-2 pr-2 text-right">#</th>
                    <th className="py-2 pr-2">Equipo</th>
                    <th className="w-10 py-2 text-right">PJ</th>
                    <th className="hidden w-10 py-2 text-right sm:table-cell">G</th>
                    <th className="hidden w-10 py-2 text-right sm:table-cell">E</th>
                    <th className="hidden w-10 py-2 text-right sm:table-cell">P</th>
                    <th className="w-12 py-2 text-right">DG</th>
                    <th className="w-12 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => {
                    const highlighted =
                      sameTeam(row.team, homeTeam) || sameTeam(row.team, awayTeam);
                    return (
                      <tr
                        key={`${group}-${row.team}-${row.rank}`}
                        className={`border-b border-ink-800/60 last:border-b-0 ${
                          highlighted ? "bg-mint-500/10" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 text-right tabular-nums text-mist-500">
                          {row.rank}
                        </td>
                        <td
                          className={`max-w-[180px] truncate py-2 pr-2 ${
                            highlighted ? "font-semibold text-white" : "text-mist-300"
                          }`}
                        >
                          {displayTeam(row.team)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-mist-400">
                          {row.played}
                        </td>
                        <td className="hidden py-2 text-right tabular-nums text-mist-400 sm:table-cell">
                          {row.wins}
                        </td>
                        <td className="hidden py-2 text-right tabular-nums text-mist-400 sm:table-cell">
                          {row.draws}
                        </td>
                        <td className="hidden py-2 text-right tabular-nums text-mist-400 sm:table-cell">
                          {row.losses}
                        </td>
                        <td className="py-2 text-right tabular-nums text-mist-400">
                          {row.goal_diff > 0 ? "+" : ""}
                          {row.goal_diff}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums text-white">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
