import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBaseline,
  getLeagueLogoMap,
  getLeagueSummaries,
  getLeagueTeams,
  getStandings,
  getTeamLogoMap,
} from "@/lib/queries";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { num, pct } from "@/lib/format";
import { displayTeam } from "@/lib/display";
import { TeamBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

function StrengthBar({ value }: { value: number }) {
  const width = Math.min(100, Math.max(4, (value / 2) * 100));
  const color = value >= 1.15 ? "bg-mint-400" : value <= 0.85 ? "bg-rose-400/80" : "bg-ink-600";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] tabular-nums text-mist-400">{value.toFixed(2)}</span>
    </div>
  );
}

export default async function LeagueDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const league = LEAGUE_BY_CODE[code];
  if (!league) notFound();

  const [teams, baseline, summaries, teamLogos, leagueLogos, standings] = await Promise.all([
    getLeagueTeams(code),
    getBaseline(code),
    getLeagueSummaries(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    getStandings(code),
  ]);
  const summary = summaries.find((item) => item.league_code === code);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/ligas" className="text-xs text-mist-500 transition hover:text-mint-400">
          ← Todas las ligas
        </Link>
        <span className="text-xs text-mist-500">{league.country}</span>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {leagueLogos.get(code) ? (
            <img
              src={leagueLogos.get(code)}
              alt=""
              width={26}
              height={26}
              loading="lazy"
              decoding="async"
              className="mr-2 inline-block size-[26px] align-middle object-contain"
            />
          ) : (
            <span className="mr-2 rounded bg-ink-800 px-1.5 py-0.5 align-middle text-xs font-semibold tracking-wide text-mist-400">
              {league.tag}
            </span>
          )}
          {league.name}
        </h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mist-400">
            {summary?.played.toLocaleString("es-ES")} partidos
          </span>
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mist-400">
            {num(summary?.avg_goals, 2)} goles/partido
          </span>
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mist-400">
            {num(summary?.avg_corners, 1)} córners/partido
          </span>
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mist-400">
            {num(summary?.avg_sot, 1)} tiros al arco/partido
          </span>
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mint-400">
            {pct(summary?.home_win_rate)} victorias locales
          </span>
          <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-cyan-400">
            {pct(summary?.over25_rate)} over 2.5
          </span>
        </div>
      </header>

      {summary && summary.upcoming === 0 ? (
        <p className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-xs text-mist-400">
          No hay partidos próximos cargados para esta liga. Los promedios y las fuerzas se
          actualizarán en cuanto la fuente publique la nueva jornada.
        </p>
      ) : null}

      {baseline ? (
        <section className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mist-500">Goles local</div>
            <div className="text-lg font-semibold tabular-nums text-white">{num(baseline.avg_home_goals, 2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mist-500">Goles visitante</div>
            <div className="text-lg font-semibold tabular-nums text-white">{num(baseline.avg_away_goals, 2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mist-500">Córners local</div>
            <div className="text-lg font-semibold tabular-nums text-white">{num(baseline.avg_home_corners, 2)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-mist-500">Córners visitante</div>
            <div className="text-lg font-semibold tabular-nums text-white">{num(baseline.avg_away_corners, 2)}</div>
          </div>
        </section>
      ) : null}

      {standings.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Tabla de posiciones</h2>
              <p className="text-[11px] text-mist-500">ESPN · se actualiza cada 30 min</p>
            </div>
            <span className="text-[10px] text-mist-500">{standings.length} equipos</span>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[680px] text-xs">
              <thead>
                <tr className="border-b border-ink-800 text-[10px] uppercase tracking-wide text-mist-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Equipo</th>
                  <th className="px-2 py-2 text-right">PJ</th>
                  <th className="px-2 py-2 text-right">G</th>
                  <th className="px-2 py-2 text-right">E</th>
                  <th className="px-2 py-2 text-right">P</th>
                  <th className="px-2 py-2 text-right">GF</th>
                  <th className="px-2 py-2 text-right">GC</th>
                  <th className="px-2 py-2 text-right">DG</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row) => (
                  <tr key={row.team} className="border-b border-ink-800/60 last:border-0">
                    <td className="px-3 py-2 tabular-nums text-mist-500">{row.rank}</td>
                    <td className="px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <TeamBadge
                          name={displayTeam(row.team)}
                          size={18}
                          logo={teamLogos.get(`${code}:${row.team}`)}
                        />
                        <span className="truncate text-mist-300">{displayTeam(row.team)}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.played}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.wins}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.draws}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.losses}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.goals_for}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">{row.goals_against}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-mist-400">
                      {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-white">
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card overflow-hidden">
        <div className="border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Fuerza de cada equipo</h2>
          <p className="text-[11px] text-mist-500">
            1.00 = media de la liga. Ataque por encima de 1.15 es notable; defensa por debajo de 0.85
            concede menos de lo normal.
          </p>
        </div>

        <div className="hidden grid-cols-[1.6fr_repeat(4,0.9fr)] gap-2 border-b border-ink-800 px-4 py-2 text-[10px] uppercase tracking-wide text-mist-500 sm:grid">
          <span>Equipo</span>
          <span className="text-right">Ataque local</span>
          <span className="text-right">Defensa local</span>
          <span className="text-right">Ataque visita</span>
          <span className="text-right">Defensa visita</span>
        </div>

        {teams.map((team) => (
          <div
            key={team.team}
            className="grid grid-cols-2 gap-2 border-b border-ink-800/60 px-4 py-2.5 text-xs last:border-0 sm:grid-cols-[1.6fr_repeat(4,0.9fr)] sm:items-center"
          >
            <span className="col-span-2 flex min-w-0 items-center gap-2 font-medium text-mist-300 sm:col-span-1">
              <TeamBadge
                name={team.team}
                size={20}
                logo={teamLogos.get(`${code}:${team.team}`)}
              />
              <span className="truncate">{team.team}</span>
            </span>
            <div className="flex justify-end">
              <StrengthBar value={team.att_home} />
            </div>
            <div className="flex justify-end">
              <StrengthBar value={team.def_home} />
            </div>
            <div className="flex justify-end">
              <StrengthBar value={team.att_away} />
            </div>
            <div className="flex justify-end">
              <StrengthBar value={team.def_away} />
            </div>
          </div>
        ))}
      </section>

      <p className="text-xs text-mist-500">
        Defensa alta = concede más goles. El modelo combina ataque del local con defensa del
        visitante para estimar los goles esperados de cada lado.
      </p>
    </div>
  );
}
