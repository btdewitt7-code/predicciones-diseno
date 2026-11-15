import Link from "next/link";
import { getAbsenceRiskMap, getLeagueLogoMap, getTeamLogoMap, getUpcoming } from "@/lib/queries";
import { buildCombos } from "@/lib/combos";
import { dayKey, dayLabel, pct, timeOf, todayKey } from "@/lib/format";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { SaveComboButton } from "@/components/save-combo-button";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { displayTeam, displayText } from "@/lib/display";
import { currentUser } from "@/lib/session";
import { getVetoedSet } from "@/lib/veto";
import { syncRecentResults } from "@/lib/resultsSync";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;

function pageHref(page: number): string {
  return page <= 1 ? "/jugadas" : `/jugadas?pagina=${page}`;
}

export default async function CombosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { pagina } = await searchParams;

  await syncRecentResults().catch(() => undefined);

  const user = await currentUser();
  const [upcoming, teamLogos, leagueLogos, saved, vetoed, absenceRisk] = await Promise.all([
    getUpcoming(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    loadSavedCombos(7, user?.id ?? null),
    getVetoedSet(),
    getAbsenceRiskMap(),
  ]);

  const riskyMatches = new Set(
    [...absenceRisk.entries()]
      .filter(([, risk]) => risk.risky)
      .map(([matchId]) => matchId),
  );

  const savedHashes = new Set(saved.map((item) => item.hash));
  const now = Date.now() - 30 * 60_000;
  const available = upcoming.filter(
    (match) => Date.parse(`${match.kickoff}Z`) >= now,
  );
  const combos = buildCombos(upcoming, vetoed, riskyMatches);

  const totalPages = Math.max(1, Math.ceil(combos.length / PAGE_SIZE));
  const requested = Number.parseInt(pagina ?? "1", 10);
  const currentPage = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), totalPages)
    : 1;
  const visible = combos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={120} />

      <header className="space-y-2">
        <div className="flex gap-1.5 text-xs">
          <span className="rounded-lg border border-mint-500/40 bg-mint-500/10 px-2.5 py-1 font-medium text-mint-400">
            Seguras
          </span>
          <Link
            href="/sonadoras"
            className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
          >
            Soñadoras
          </Link>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Jugadas del día
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
          Jugadas de 1, 2 o 3 selecciones armadas solo con el modelo, sin cuotas de mercado.
          Usan partidos de las próximas 48 horas (priorizando hoy) que aún no han empezado.
          Pulsa <span className="text-mist-300">Guardar</span> en las que quieras seguir y verás el
          resultado en la sección Resultados.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Jugadas" value={String(combos.length)} tone="good" />
          <Pill label="Próximas 48 h" value={String(available.length)} />
          <Pill label="Página" value={`${currentPage}/${totalPages}`} />
        </div>
      </header>

      {combos.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">No hay partidos suficientes en las próximas 48 h.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Las jugadas necesitan partidos sin empezar y con probabilidades altas. Revisa la página{" "}
            <span className="text-mint-400">Partidos</span> para ver los próximos días.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((item) => {
              const itemHash = comboHash(
                dayKey(item.legs[0]?.kickoff ?? ""),
                item.legs,
              );
              const repeatedMatches = [
                ...new Set(
                  item.legs
                    .filter((leg) =>
                      saved.some(
                        (entry) =>
                          entry.hash !== itemHash &&
                          entry.legs.some((savedLeg) => savedLeg.matchId === leg.matchId),
                      ),
                    )
                    .map((leg) => leg.matchLabel),
                ),
              ];
              const hasRisky = item.legs.some((leg) => leg.risky);

              return (
            <section key={item.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-800 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                  <p className="text-[11px] text-mist-500">{item.description}</p>
                  {hasRisky ? (
                    <span
                      className="mt-1 inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400"
                      title="Incluye un equipo con bajas que mueven el modelo"
                    >
                      ⚠️ Bajas importantes
                    </span>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] uppercase tracking-wide text-mist-500">Prob. combinada</div>
                  <div className="text-lg font-semibold tabular-nums text-mint-400">
                    {pct(item.probability, 1)}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-ink-800/70">
                {item.legs.map((leg) => (
                  <Link
                    key={`${leg.matchId}-${leg.market}`}
                    href={`/partido/${leg.matchId}`}
                    className="block px-4 py-3 transition hover:bg-ink-850/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm text-white">{leg.market}</span>
                        {leg.risky ? (
                          <span
                            title="Equipo con bajas importantes"
                            className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1 py-0.5 text-[9px] text-amber-400"
                          >
                            ⚠️
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-mist-200">
                        {pct(leg.probability)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-mist-500">
                      <LeagueTag
                        code={leg.leagueCode}
                        logo={leagueLogos.get(leg.leagueCode)}
                      />
                      <span>·</span>
                      <span>
                        {dayLabel(leg.kickoff)} {timeOf(leg.kickoff)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-mist-400">
                      <TeamBadge
                        name={displayTeam(leg.matchLabel.split(" vs ")[0])}
                        size={18}
                        logo={teamLogos.get(`${leg.leagueCode}:${leg.matchLabel.split(" vs ")[0]}`)}
                      />
                      <span className="truncate">{displayText(leg.matchLabel)}</span>
                      <TeamBadge
                        name={displayTeam(leg.matchLabel.split(" vs ")[1] ?? "")}
                        size={18}
                        logo={teamLogos.get(`${leg.leagueCode}:${leg.matchLabel.split(" vs ")[1] ?? ""}`)}
                      />
                    </div>
                  </Link>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-ink-800 px-4 py-2.5 text-[11px] text-mist-500">
                <span>{item.legs.length} selecciones</span>
                <div className="flex items-center gap-3">
                  <span>
                    Cuota justa:{" "}
                    <span className="font-semibold text-mist-300">{item.fairOdds.toFixed(2)}</span>
                  </span>
                  <SaveComboButton
                    combo={item}
                    repeatedMatches={repeatedMatches}
                    initialSaved={savedHashes.has(
                      comboHash(dayKey(item.legs[0]?.kickoff ?? ""), item.legs),
                    )}
                  />
                </div>
              </div>
            </section>
              );
            })}
        </div>

        {totalPages > 1 ? (
          <nav
            className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
            aria-label="Paginación de jugadas"
          >
            {currentPage > 1 ? (
              <Link
                href={pageHref(currentPage - 1)}
                className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
              >
                ← Anterior
              </Link>
            ) : (
              <span className="rounded-lg border border-ink-800 px-3 py-1.5 text-mist-500/50">
                ← Anterior
              </span>
            )}

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Link
                key={page}
                href={pageHref(page)}
                aria-current={page === currentPage ? "page" : undefined}
                className={`min-w-8 rounded-lg border px-2.5 py-1.5 text-center tabular-nums transition ${
                  page === currentPage
                    ? "border-mint-500/40 bg-mint-500/10 font-semibold text-mint-400"
                    : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
                }`}
              >
                {page}
              </Link>
            ))}

            {currentPage < totalPages ? (
              <Link
                href={pageHref(currentPage + 1)}
                className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
              >
                Siguiente →
              </Link>
            ) : (
              <span className="rounded-lg border border-ink-800 px-3 py-1.5 text-mist-500/50">
                Siguiente →
              </span>
            )}
          </nav>
        ) : null}
        </div>
      )}

      <div className="card space-y-1.5 p-4 text-xs leading-relaxed text-mist-400">
        <p className="font-semibold text-white">Cómo leerlo</p>
        <p>
          La <span className="text-mist-300">probabilidad combinada</span> es el producto de las
          selecciones. Si cada una acierta el 70% y el 60%, la combinada acierta el 42% de las veces.
        </p>
        <p>
          La <span className="text-mist-300">cuota justa</span> es 1 ÷ probabilidad. Si tu casa paga
          más que eso, hay valor; si paga menos, no.
        </p>
        <p>
          No es una recomendación de apuesta: es una forma rápida de ver qué ve el modelo con más
          confianza.
        </p>
      </div>
    </div>
  );
}
