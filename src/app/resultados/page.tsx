import Link from "next/link";
import { loadSavedCombos } from "@/lib/comboStore";
import { displayTeam } from "@/lib/display";
import { currentUser } from "@/lib/session";
import { evaluateCombo, type ComboStatus } from "@/lib/comboEval";
import { getLeagueLogoMap, getMatchesByIds, getTeamLogoMap } from "@/lib/queries";
import { dayLabel, pct, timeOf } from "@/lib/format";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { CleanSavedButton } from "@/components/clean-saved-button";
import { RemoveSavedButton } from "@/components/remove-saved-button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<ComboStatus, string> = {
  won: "Ganada",
  lost: "Perdida",
  pending: "Pendiente",
};

const STATUS_CLASS: Record<ComboStatus, string> = {
  won: "border-win-500/40 bg-win-500/10 text-win-400",
  lost: "border-rose-400/40 bg-rose-400/10 text-rose-400",
  pending: "border-ink-700 bg-ink-850 text-mist-400",
};

const LEG_ICON: Record<string, string> = {
  won: "✓",
  lost: "✗",
  pending: "⏳",
};

const LEG_CLASS: Record<string, string> = {
  won: "text-win-400",
  lost: "text-rose-400",
  pending: "text-mist-500",
};

export default async function ComboResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; dias?: string; fuente?: string; tipo?: string }>;
}) {
  const { pagina, dias, fuente, tipo } = await searchParams;
  const requestedDays = Number(dias);
  const range = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
  const sourceFilter: "model" | "cup" | undefined =
    fuente === "copas" ? "cup" : fuente === "todas" ? undefined : "model";
  const typeFilter: "single" | "multi" | undefined =
    tipo === "combinadas" ? "multi" : tipo === "simples" ? "single" : undefined;

  const user = await currentUser();
  const [snapshots, teamLogos, leagueLogos] = await Promise.all([
    loadSavedCombos(range, user?.id ?? null, sourceFilter),
    getTeamLogoMap(),
    getLeagueLogoMap(),
  ]);
  const filteredSnapshots = snapshots.filter((snapshot) =>
    typeFilter === "multi"
      ? snapshot.origin === "manual" && snapshot.legs.length > 1
      : typeFilter === "single"
        ? snapshot.legs.length === 1
        : true,
  );
  const matchIds = [
    ...new Set(filteredSnapshots.flatMap((item) => item.legs.map((leg) => leg.matchId))),
  ];
  const matches = await getMatchesByIds(matchIds);
  const matchMap = new Map(matches.map((match) => [match.id, match]));

  const evaluated = filteredSnapshots.map((snapshot) => ({
    snapshot,
    result: evaluateCombo(snapshot.legs, matchMap),
  }));

  const totals = { won: 0, lost: 0, pending: 0 };
  for (const item of evaluated) totals[item.result.status] += 1;

  const ordered = [...evaluated].sort(
    (a, b) => b.snapshot.day.localeCompare(a.snapshot.day) || a.snapshot.id - b.snapshot.id,
  );

  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(pagina ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;

  const visible = ordered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const visibleByDay = new Map<string, typeof visible>();
  for (const item of visible) {
    const list = visibleByDay.get(item.snapshot.day) ?? [];
    list.push(item);
    visibleByDay.set(item.snapshot.day, list);
  }

  const days = [...visibleByDay.keys()];

  const hrefFor = (options: {
    pagina?: number;
    dias?: number;
    fuente?: "ligas" | "copas" | "todas";
    tipo?: "simples" | "combinadas" | "todas";
  }) => {
    const params = new URLSearchParams();
    const nextRange = options.dias ?? range;
    const nextFuente =
      options.fuente ??
      (sourceFilter === "cup" ? "copas" : sourceFilter === undefined ? "todas" : "ligas");
    const nextTipo =
      options.tipo ??
      (options.fuente
        ? "todas"
        : typeFilter === "multi"
          ? "combinadas"
          : typeFilter === "single"
            ? "simples"
            : "todas");
    if (nextRange !== 7) params.set("dias", String(nextRange));
    if (nextFuente !== "ligas") params.set("fuente", nextFuente);
    if (nextTipo !== "todas") params.set("tipo", nextTipo);
    if (options.pagina && options.pagina > 1) params.set("pagina", String(options.pagina));
    const qs = params.toString();
    return qs ? `/resultados?${qs}` : "/resultados";
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Resultados de las jugadas
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
            Aquí aparecen las jugadas que hayas guardado desde la sección{" "}
            <Link href="/jugadas" className="text-mint-400 hover:underline">Jugadas</Link>. Cada
            selección se evalúa cuando el partido termina.
          </p>
        </div>

        <div className="card space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill label="Ganadas" value={String(totals.won)} tone="good" />
              <Pill label="Perdidas" value={String(totals.lost)} tone="warn" />
              <Pill label="Pendientes" value={String(totals.pending)} />
            </div>
            <CleanSavedButton days={range} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-800/70 pt-3 text-xs">
            <span className="text-mist-500">Ver</span>
            {[7, 30, 90].map((option) => (
              <Link
                key={option}
                href={hrefFor({ dias: option })}
                className={`rounded-lg border px-3 py-1.5 transition ${
                  range === option
                    ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                    : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
                }`}
              >
                {option} días
              </Link>
            ))}

            <span className="ml-2 text-mist-500">Fuente</span>
            {(
              [
                ["ligas", "Ligas", "model"],
                ["copas", "Copas", "cup"],
                ["todas", "Todas", undefined],
              ] as const
            ).map(([key, label, value]) => {
              const active = sourceFilter === value;
              return (
                <Link
                  key={key}
                  href={hrefFor({ fuente: key, pagina: 1 })}
                  className={`rounded-lg border px-3 py-1.5 transition ${
                    active
                      ? "border-mint-500/40 bg-mint-500/10 font-semibold text-mint-400"
                      : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}

            <Link
              href={hrefFor({
                tipo: typeFilter === "multi" ? "todas" : "combinadas",
                pagina: 1,
              })}
              className={`ml-2 rounded-lg border px-3 py-1.5 font-semibold transition ${
                typeFilter === "multi"
                  ? "border-amber-400/60 bg-amber-400/20 text-amber-300"
                  : "border-ink-700 bg-ink-850 text-mist-300 hover:border-amber-400/50 hover:text-amber-300"
              }`}
            >
              Combinadas
            </Link>
          </div>
        </div>
      </header>

      {evaluated.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">
            {typeFilter === "multi"
              ? "Todavía no has creado combinadas."
              : typeFilter === "single"
                ? "Todavía no has guardado jugadas simples."
                : sourceFilter === "cup"
                  ? "Todavía no has guardado jugadas de copas."
                  : sourceFilter === undefined
                    ? "Todavía no has guardado ninguna jugada."
                    : "Todavía no has guardado ninguna jugada de ligas."}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            Entra a un partido y pulsa el botón{" "}
            <span className="text-mist-300">Guardar</span> en las que quieras seguir. Las copas
            quedan separadas de las ligas.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <section key={day} className="space-y-3">
              <h2 className="text-sm font-semibold capitalize text-white">
                {dayLabel(`${day}T12:00:00`)}
              </h2>

              <div className="grid gap-3 lg:grid-cols-2">
                {(visibleByDay.get(day) ?? []).map(({ snapshot, result }) => (
                  <div key={snapshot.id} className="card overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{snapshot.title}</h3>
                          {snapshot.legs.length > 1 ? (
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                snapshot.origin === "manual"
                                  ? "border-amber-400/40 bg-amber-400/15 text-amber-300"
                                  : "border-mint-500/30 bg-mint-500/10 text-mint-400"
                              }`}
                            >
                              {snapshot.origin === "manual" ? "Combinada" : "Jugada"}
                            </span>
                          ) : null}
                          {snapshot.source === "cup" ? (
                            <span className="rounded border border-win-400/30 bg-win-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-win-400">
                              Copa
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-mist-500">
                          {snapshot.legs.length}{" "}
                          {snapshot.legs.length === 1 ? "selección" : "selecciones"} · prob.{" "}
                          {pct(snapshot.probability, 1)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`rounded-lg border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASS[result.status]}`}
                        >
                          {STATUS_LABEL[result.status]}
                        </span>
                        <RemoveSavedButton id={snapshot.id} />
                      </div>
                    </div>

                    <ul className="divide-y divide-ink-800/60">
                      {result.legs.map((item) => {
                        const [homeTeam, awayTeam] = item.leg.matchLabel.split(" vs ");
                        return (
                          <li
                            key={`${item.leg.matchId}-${item.leg.market}`}
                            className="px-4 py-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className={`w-3 shrink-0 ${LEG_CLASS[item.result]}`}>
                                  {LEG_ICON[item.result]}
                                </span>
                                <Link
                                  href={`/partido/${item.leg.matchId}`}
                                  className="inline-flex min-h-6 min-w-0 items-center truncate font-medium text-mist-200 hover:text-white"
                                >
                                  {item.leg.market}
                                </Link>
                              </span>
                              <span className="shrink-0 tabular-nums text-mist-500">
                                {item.detail}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-5 text-[10px] text-mist-500">
                              <LeagueTag
                                code={item.leg.leagueCode}
                                logo={leagueLogos.get(item.leg.leagueCode)}
                              />
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <TeamBadge
                                  name={displayTeam(homeTeam ?? "")}
                                  size={14}
                                  logo={teamLogos.get(`${item.leg.leagueCode}:${homeTeam ?? ""}`)}
                                />
                                <span className="truncate text-mist-400">
                                  {displayTeam(homeTeam ?? "")}
                                </span>
                                <span className="text-mist-500">vs</span>
                                <span className="truncate text-mist-400">
                                  {displayTeam(awayTeam ?? "")}
                                </span>
                                <TeamBadge
                                  name={displayTeam(awayTeam ?? "")}
                                  size={14}
                                  logo={teamLogos.get(`${item.leg.leagueCode}:${awayTeam ?? ""}`)}
                                />
                              </span>
                              <span>·</span>
                              <span className="whitespace-nowrap">
                                {dayLabel(item.leg.kickoff)} {timeOf(item.leg.kickoff)}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2 text-[10px] text-mist-500">
                      <span>
                        {result.won} ✓ · {result.lost} ✗ · {result.pending} ⏳
                      </span>
                      <span>Cuota justa {snapshot.fairOdds.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {totalPages > 1 ? (
            <nav
              className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
              aria-label="Paginación de resultados"
            >
              {currentPage > 1 ? (
                <Link
                  href={hrefFor({ pagina: currentPage - 1, dias: range })}
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
                  href={hrefFor({ pagina: page, dias: range })}
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
                  href={hrefFor({ pagina: currentPage + 1, dias: range })}
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
    </div>
  );
}
