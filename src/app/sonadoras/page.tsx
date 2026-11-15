import Link from "next/link";
import { getLeagueLogoMap, getTeamLogoMap, getUpcoming } from "@/lib/queries";
import { buildDreamCombos } from "@/lib/combos";
import { dayKey, dayLabel, pct, timeOf } from "@/lib/format";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { SaveComboButton } from "@/components/save-combo-button";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { displayTeam, displayText } from "@/lib/display";
import { currentUser } from "@/lib/session";
import { getVetoedSet } from "@/lib/veto";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;

export default async function DreamCombosPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { pagina } = await searchParams;

  const user = await currentUser();
  const [upcoming, teamLogos, leagueLogos, saved, vetoed] = await Promise.all([
    getUpcoming(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    loadSavedCombos(7, user?.id ?? null),
    getVetoedSet(),
  ]);

  const savedHashes = new Set(saved.map((item) => item.hash));
  const combos = buildDreamCombos(upcoming, vetoed);

  const totalPages = Math.max(1, Math.ceil(combos.length / PAGE_SIZE));
  const requested = Number.parseInt(pagina ?? "1", 10);
  const currentPage = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), totalPages)
    : 1;
  const visible = combos.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hrefFor = (page: number) =>
    page <= 1 ? "/sonadoras" : `/sonadoras?pagina=${page}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex gap-1.5 text-xs">
          <Link
            href="/jugadas"
            className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
          >
            Seguras
          </Link>
          <span className="rounded-lg border border-mint-500/40 bg-mint-500/10 px-2.5 py-1 font-medium text-mint-400">
            Soñadoras
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Soñadoras
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
          Combinadas largas de 6, 9 y 12 selecciones, mezclando ligas y sin el límite de 3.
          Cuota alta y probabilidad baja: son para soñar, no para apostar en serio.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Soñadoras" value={String(combos.length)} />
          <Pill
            label="Selecciones máx."
            value={String(Math.max(0, ...combos.map((combo) => combo.legs.length)))}
          />
          <Pill label="Página" value={`${currentPage}/${totalPages}`} />
        </div>
      </header>

      {combos.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">No hay partidos suficientes ahora mismo.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Las soñadoras necesitan partidos sin empezar en las próximas 48 horas.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => (
            <section key={item.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-800 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                  <p className="text-[11px] text-mist-500">{item.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] uppercase tracking-wide text-mist-500">
                    Prob. combinada
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-mint-400">
                    {pct(item.probability, 2)}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-ink-800/70">
                {item.legs.map((leg) => (
                  <Link
                    key={`${leg.matchId}-${leg.market}`}
                    href={`/partido/${leg.matchId}`}
                    className="block px-4 py-2.5 transition hover:bg-ink-850/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-white">{leg.market}</span>
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
                    <span className="font-semibold text-mist-300">
                      {item.fairOdds.toFixed(2)}
                    </span>
                  </span>
                  <SaveComboButton
                    combo={item}
                    initialSaved={savedHashes.has(
                      comboHash(dayKey(item.legs[0]?.kickoff ?? ""), item.legs),
                    )}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
          aria-label="Paginación de soñadoras"
        >
          {currentPage > 1 ? (
            <Link
              href={hrefFor(currentPage - 1)}
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
              href={hrefFor(page)}
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
              href={hrefFor(currentPage + 1)}
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

      <div className="card space-y-1.5 p-4 text-xs leading-relaxed text-mist-400">
        <p className="font-semibold text-white">Cómo leer una soñadora</p>
        <p>
          La probabilidad combinada es el producto de las selecciones. Con 12 selecciones al 60%
          cada una, la combinada acierta el <span className="text-mist-300">0.2%</span> de las veces.
        </p>
        <p>
          Sirven para jugar poco y soñar mucho, no para apostar fuerte. Cada selección se puede
          seguir igual en <span className="text-mint-400">Resultados</span>.
        </p>
      </div>
    </div>
  );
}
