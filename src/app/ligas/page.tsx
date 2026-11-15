import Link from "next/link";
import { getLeagueLogoMap, getLeagueSummaries } from "@/lib/queries";
import { LEAGUES } from "@/lib/leagues";

export const dynamic = "force-dynamic";

export default async function LeaguesPage() {
  const [summaries, leagueLogos] = await Promise.all([getLeagueSummaries(), getLeagueLogoMap()]);
  const byCode = new Map(summaries.map((summary) => [summary.league_code, summary]));

  const totalPlayed = summaries.reduce((acc, item) => acc + item.played, 0);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Ligas</h1>
        <p className="max-w-2xl text-sm text-mist-400">
          {totalPlayed.toLocaleString("es-ES")} partidos analizados. Elige una competición para ver
          promedios, tabla y próximos partidos.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {LEAGUES.map((league) => {
          const summary = byCode.get(league.code);
          const logo = leagueLogos.get(league.code);
          const upcoming = summary?.upcoming ?? 0;

          return (
            <Link
              key={league.code}
              href={`/ligas/${league.code}`}
              className="group flex items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900/80 p-3.5 transition hover:border-win-400/40 hover:bg-ink-850"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink-850 ring-1 ring-ink-800">
                {logo ? (
                  <img
                    src={logo}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    decoding="async"
                    className="size-7 object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-semibold tracking-wide text-mist-400">
                    {league.tag}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">
                  {league.name}
                </span>
                <span className="block truncate text-[11px] text-mist-500">
                  {league.country}
                  {league.noModel ? " · Tabla" : ""}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="block text-2xl font-semibold leading-none tabular-nums text-win-400">
                  {upcoming}
                </span>
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wide text-mist-500">
                  Próx.
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-mist-500">
        «Próx.» son los partidos próximos cargados para esa competición. Toca una liga para ver sus
        promedios, la tabla de posiciones y los partidos disponibles.
      </p>
    </div>
  );
}
