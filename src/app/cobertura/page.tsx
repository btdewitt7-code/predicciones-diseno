import { redirect } from "next/navigation";
import { CoverageCheck } from "@/components/coverage-check";
import { LEAGUES } from "@/lib/leagues";
import { getLeagueSummaries } from "@/lib/queries";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const user = await currentUser();
  if (!user?.isAdmin) redirect("/");

  const summaries = await getLeagueSummaries();
  const byCode = new Map(summaries.map((summary) => [summary.league_code, summary]));

  const rows = LEAGUES.map((league) => ({
    code: league.code,
    name: league.name,
    country: league.country,
    upcoming: byCode.get(league.code)?.upcoming ?? 0,
  })).sort((a, b) => a.upcoming - b.upcoming || a.name.localeCompare(b.name));

  const zeroCodes = rows.filter((row) => row.upcoming === 0).map((row) => row.code);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Cobertura</h1>
        <p className="max-w-2xl text-sm text-mist-400">
          Revisa qué ligas se quedaron sin partidos próximos y si la fuente tiene jornadas para
          cargar.
        </p>
      </header>

      <CoverageCheck codes={zeroCodes} />

      <section className="card overflow-hidden">
        <div className="border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Próximos partidos por liga</h2>
          <p className="text-xs text-mist-500">
            {rows.filter((row) => row.upcoming > 0).length} con partidos · {zeroCodes.length} en 0
          </p>
        </div>
        <ul className="divide-y divide-ink-800/70">
          {rows.map((row) => (
            <li key={row.code} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
              <span className="min-w-0 truncate text-mist-300">
                {row.name} <span className="text-mist-500">· {row.country}</span>
              </span>
              <span
                className={`shrink-0 font-semibold tabular-nums ${
                  row.upcoming > 0 ? "text-white" : "text-amber-300"
                }`}
              >
                {row.upcoming}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
