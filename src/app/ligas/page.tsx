import Link from "next/link";
import { getLeagueLogoMap, getLeagueSummaries } from "@/lib/queries";
import { LEAGUES } from "@/lib/leagues";
import { num, pct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const [summaries, leagueLogos] = await Promise.all([getLeagueSummaries(), getLeagueLogoMap()]);
  const byCode = new Map(summaries.map((summary) => [summary.league_code, summary]));

  const rows = LEAGUES.map((league) => ({
    league,
    summary: byCode.get(league.code),
  })).filter((row) => row.summary);

  const totalPlayed = summaries.reduce((acc, item) => acc + item.played, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Ligas y promedios
        </h1>
        <p className="max-w-2xl text-sm text-mist-400">
          {totalPlayed.toLocaleString("es-ES")} partidos analizados. Los promedios de cada liga son
          la base del modelo: definen cuántos goles, córners y tiros al arco se esperan en un partido
          medio.
        </p>
      </header>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[1.6fr_repeat(6,0.7fr)] gap-2 border-b border-ink-800 px-4 py-2.5 text-[10px] uppercase tracking-wide text-mist-500 sm:grid">
          <span>Competición</span>
          <span className="text-right">Partidos</span>
          <span className="text-right">Goles</span>
          <span className="text-right">Córners</span>
          <span className="text-right">T. arco</span>
          <span className="text-right">Local</span>
          <span className="text-right">O2.5</span>
        </div>

        {rows.map(({ league, summary }) => (
          <Link
            key={league.code}
            href={`/ligas/${league.code}`}
            className="grid grid-cols-2 gap-2 border-b border-ink-800/70 px-4 py-3 text-sm transition last:border-0 hover:bg-ink-850/60 sm:grid-cols-[1.6fr_repeat(6,0.7fr)]"
          >
            <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
              {leagueLogos.get(league.code) ? (
                <img
                  src={leagueLogos.get(league.code)}
                  alt=""
                  width={18}
                  height={18}
                  loading="lazy"
                  decoding="async"
                  className="size-[18px] shrink-0 object-contain"
                />
              ) : (
                <span className="rounded bg-ink-800 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-mist-400">
                  {league.tag}
                </span>
              )}
              <span className="font-medium text-white">{league.name}</span>
              <span className="text-xs text-mist-500">{league.country}</span>
            </div>
            <span className="text-right tabular-nums text-mist-300">
              {summary?.played.toLocaleString("es-ES")}
            </span>
            <span className="text-right tabular-nums text-mist-300">{num(summary?.avg_goals, 2)}</span>
            <span className="text-right tabular-nums text-mist-300">{num(summary?.avg_corners, 1)}</span>
            <span className="text-right tabular-nums text-mist-300">{num(summary?.avg_sot, 1)}</span>
            <span className="text-right tabular-nums text-mint-400">{pct(summary?.home_win_rate)}</span>
            <span className="text-right tabular-nums text-cyan-400">{pct(summary?.over25_rate)}</span>
          </Link>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-mist-500">
        «Local» es el porcentaje de victorias del equipo de casa. «O2.5» es el porcentaje de partidos
        con más de 2.5 goles. Los promedios incluyen las tres últimas temporadas con ponderación por
        antigüedad (vida media de 180 días).
      </p>
    </div>
  );
}
