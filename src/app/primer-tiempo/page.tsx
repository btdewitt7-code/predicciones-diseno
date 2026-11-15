import Link from "next/link";
import { getLeagueLogoMap, getMatchesByIds, getTeamHalfLabels, getTeamLogoMap, getUpcoming } from "@/lib/queries";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { dayKey, dayLabel, num, pct, timeOf, todayKey } from "@/lib/format";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { FirstHalfSave } from "@/components/first-half-save";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { displayText } from "@/lib/display";
import { currentUser } from "@/lib/session";
import { getHtVetoedSet, isHtVetoed, listHtVetos } from "@/lib/veto";
import { FIRST_HALF_LINES, firstHalfCombo, type FirstHalfMatch } from "@/lib/firstHalf";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function pageHref(page: number, query: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("pagina", String(page));
  const qs = params.toString();
  return qs ? `/primer-tiempo?${qs}` : "/primer-tiempo";
}

export default async function FirstHalfPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; q?: string }>;
}) {
  const { pagina, q } = await searchParams;
  const query = (q ?? "").trim();
  const queryNorm = normalizeText(query);

  const user = await currentUser();
  const [upcoming, teamLogos, leagueLogos, saved, htVetoed, htVetoList] = await Promise.all([
    getUpcoming(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    loadSavedCombos(7, user?.id ?? null),
    getHtVetoedSet(),
    listHtVetos(),
  ]);

  const savedHashes = new Set(saved.map((item) => item.hash));

  // Resumen de las jugadas de primer tiempo guardadas hoy.
  const today = todayKey();
  const todayHalf = saved
    .filter(
      (item) =>
        item.day === today &&
        item.legs.length > 0 &&
        item.legs.every((leg) => leg.category === "1t"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const halfMatchIds = [...new Set(todayHalf.flatMap((item) => item.legs.map((leg) => leg.matchId)))];
  const halfMatches = halfMatchIds.length > 0 ? await getMatchesByIds(halfMatchIds) : [];
  const halfMatchMap = new Map(halfMatches.map((match) => [match.id, match]));

  type HalfStatus = "won" | "lost" | "pending";
  function halfStatus(item: (typeof todayHalf)[number]): HalfStatus {
    let pending = false;
    for (const leg of item.legs) {
      const match = halfMatchMap.get(leg.matchId);
      if (!match || match.ht_home_goals === null || match.ht_away_goals === null) {
        pending = true;
        continue;
      }
      const line = (leg.rule as { line?: number }).line ?? 0.5;
      if (match.ht_home_goals + match.ht_away_goals <= line) return "lost";
    }
    return pending ? "pending" : "won";
  }

  const halfResults = todayHalf.map((item) => ({ item, status: halfStatus(item) }));
  const halfCounts = halfResults.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { won: 0, lost: 0, pending: 0 },
  );
  const halfCombined = todayHalf.reduce(
    (product, item) => product * (Number(item.probability) || 0),
    1,
  );

  const now = Date.now() - 30 * 60_000;

  const rows = upcoming
    .filter(
      (match) =>
        match.prediction &&
        match.prediction.ht_over05 > 0 &&
        Date.parse(`${match.kickoff}Z`) >= now,
    )
    .filter(
      (match) =>
        !isHtVetoed(htVetoed, match.league_code, match.home_team) &&
        !isHtVetoed(htVetoed, match.league_code, match.away_team),
    )
    .filter((match) => {
      if (!queryNorm) return true;
      const league = LEAGUE_BY_CODE[match.league_code];
      return (
        normalizeText(match.home_team).includes(queryNorm) ||
        normalizeText(match.away_team).includes(queryNorm) ||
        normalizeText(league?.name ?? "").includes(queryNorm) ||
        normalizeText(league?.country ?? "").includes(queryNorm)
      );
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const requested = Number.parseInt(pagina ?? "1", 10);
  const currentPage = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), totalPages)
    : 1;
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const labelTeams = [
    ...new Set(visibleRows.flatMap((match) => [match.home_team, match.away_team])),
  ];
  const halfLabels = await getTeamHalfLabels(labelTeams);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Goles del primer tiempo
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
          Probabilidad de que haya al menos un gol antes del descanso, calculada con un modelo
          entrenado solo con goles de medio tiempo. Ordenado por fecha, desde ahora en adelante.
          Elige la línea (0.5, 1.5 o 2.5) y pulsa{" "}
          <span className="text-mist-300">Guardar</span> para seguirla en{" "}
          <Link href="/resultados" className="text-mint-400 hover:underline">
            Resultados
          </Link>
          .
        </p>
        <p className="max-w-2xl text-[13px] leading-relaxed text-mist-500">
          Verde ≥75% · ámbar 70-75% · rojo &lt;70%. Ojo con las combinadas: 15 selecciones
          al 78% dejan solo ~2,5% de que entren todas.
        </p>
        <p className="max-w-2xl text-[13px] leading-relaxed text-mist-500">
          Etiquetas informativas: <span className="text-rose-300">Viene de 0-0</span> = su último
          partido no tuvo gol en 1T; <span className="text-amber-300">Racha 4/10</span> = solo 4 de
          sus últimos 10 con gol en 1T. No cambian la probabilidad.
        </p>
        {htVetoList.length > 0 ? (
          <p className="max-w-2xl text-[13px] leading-relaxed text-amber-400/90">
            Vetados del 1T: {htVetoList.map((veto) => veto.team).join(", ")}. No aparecen en esta
            lista.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Partidos" value={String(rows.length)} />
          <Pill label="Con datos 1T" value={String(rows.filter((row) => row.prediction!.ht_over05 > 0).length)} tone="good" />
          <Pill label="Página" value={`${currentPage}/${totalPages}`} />
        </div>

        <form action="/primer-tiempo" className="flex w-full items-center gap-2 sm:w-auto">
          <label className="flex h-8 flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 transition focus-within:border-mint-500/50 sm:w-64">
            <svg
              viewBox="0 0 24 24"
              className="size-3.5 shrink-0 text-mist-500"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Buscar equipo o liga…"
              className="min-w-0 flex-1 bg-transparent text-xs text-white placeholder:text-mist-500 focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs text-mist-300 transition hover:border-mint-500/40 hover:text-white"
          >
            Buscar
          </button>
          {query ? (
            <Link
              href="/primer-tiempo"
              className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs leading-8 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
            >
              Limpiar
            </Link>
          ) : null}
        </form>

        {query ? (
          <p className="text-xs text-mist-400">
            {rows.length} {rows.length === 1 ? "partido" : "partidos"} para{" "}
            <span className="text-white">&quot;{query}&quot;</span>
          </p>
        ) : null}
      </header>

      {todayHalf.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Tus 1T de hoy</h2>
              <p className="text-[13px] text-mist-500">
                {todayHalf.length} guardadas · {halfCounts.won} ganadas · {halfCounts.lost} perdidas ·{" "}
                {halfCounts.pending} pendientes
              </p>
              {todayHalf.length > 1 ? (
                <p
                  className={`text-xs ${
                    halfCombined < 0.2 ? "text-amber-400/90" : "text-mist-500"
                  }`}
                >
                  Probabilidad de que entren todas: {pct(halfCombined, 1)}
                  {halfCombined < 0.2 ? " · mejor reducir selecciones" : ""}
                </p>
              ) : null}
            </div>
            <Link href="/resultados" className="text-[13px] text-mint-400 hover:underline">
              Ver en Resultados →
            </Link>
          </div>
          <ul className="divide-y divide-ink-800/70">
            {halfResults.map(({ item, status }) => {
              const labels = item.legs.map((leg) => displayText(leg.matchLabel)).join(" · ");
              const tone =
                status === "won"
                  ? "text-win-400"
                  : status === "lost"
                    ? "text-rose-400"
                    : "text-mist-400";
              const text = status === "won" ? "Ganada" : status === "lost" ? "Perdida" : "Pendiente";
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-[13px]"
                >
                  <span className="min-w-0 truncate text-mist-300">{labels}</span>
                  <span className={`shrink-0 font-semibold ${tone}`}>{text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">
            {query ? "No hay partidos que coincidan con la búsqueda." : "Todavía no hay predicciones de primer tiempo."}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {query
              ? "Prueba con otro equipo, liga o país, o pulsa Limpiar para ver todos."
              : "Ejecuta npm run ingest y luego npm run train para generarlas."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[1.6fr_repeat(4,0.8fr)_auto] gap-2 border-b border-ink-800 px-4 py-2.5 text-xs uppercase tracking-wide text-mist-500 sm:grid">
            <span>Partido</span>
            <span className="text-right">Goles 1T</span>
            <span className="text-right">Más de 0.5</span>
            <span className="text-right">Más de 1.5</span>
            <span className="text-right">Más de 2.5</span>
            <span className="text-right">Guardar</span>
          </div>

          {visibleRows.map((match) => {
            const prediction = match.prediction!;
            const homeHalf = halfLabels.get(match.home_team);
            const awayHalf = halfLabels.get(match.away_team);
            const firstHalfMatch: FirstHalfMatch = {
              id: match.id,
              home_team: match.home_team,
              away_team: match.away_team,
              league_code: match.league_code,
              kickoff: match.kickoff,
              prediction: {
                ht_over05: prediction.ht_over05,
                ht_over15: prediction.ht_over15,
                ht_over25: prediction.ht_over25,
              },
            };
            const savedLines = FIRST_HALF_LINES.filter((line) =>
              savedHashes.has(
                comboHash(dayKey(match.kickoff), firstHalfCombo(firstHalfMatch, line).legs),
              ),
            );

            return (
              <div
                key={match.id}
                className="grid grid-cols-2 gap-2 border-b border-ink-800/70 px-4 py-3 text-[15px] last:border-0 sm:grid-cols-[1.6fr_repeat(4,0.8fr)_auto] sm:items-center"
              >
                <Link
                  href={`/partido/${match.id}`}
                  className="col-span-2 grid grid-cols-2 gap-2 transition hover:bg-ink-850/40 sm:col-span-5 sm:grid-cols-[1.6fr_repeat(4,0.8fr)] sm:items-center"
                >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <div className="flex items-center gap-2 text-[13px] text-mist-500">
                    <LeagueTag
                      code={match.league_code}
                      logo={leagueLogos.get(match.league_code)}
                    />
                    <span>·</span>
                    <span>
                      {dayLabel(match.kickoff)} {timeOf(match.kickoff)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <TeamBadge
                      name={match.home_team}
                      size={22}
                      logo={teamLogos.get(`${match.league_code}:${match.home_team}`)}
                    />
                    <span className="min-w-0 flex-1 truncate text-white">{match.home_team}</span>
                    <span className="text-xs uppercase text-mist-500">vs</span>
                    <span className="min-w-0 flex-1 truncate text-right text-white">
                      {match.away_team}
                    </span>
                    <TeamBadge
                      name={match.away_team}
                      size={22}
                      logo={teamLogos.get(`${match.league_code}:${match.away_team}`)}
                    />
                  </div>
                  {homeHalf || awayHalf ? (
                    <div className="mt-1 flex flex-wrap justify-center gap-1 text-[11px]">
                      {homeHalf?.lastZero ? (
                        <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-rose-300 ring-1 ring-rose-400/30">
                          Local viene de 0-0
                        </span>
                      ) : null}
                      {homeHalf?.streak ? (
                        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-400/30">
                          Local racha {homeHalf.over}/{homeHalf.total}
                        </span>
                      ) : null}
                      {awayHalf?.lastZero ? (
                        <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-rose-300 ring-1 ring-rose-400/30">
                          Visita viene de 0-0
                        </span>
                      ) : null}
                      {awayHalf?.streak ? (
                        <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-400/30">
                          Visita racha {awayHalf.over}/{awayHalf.total}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <span className="text-right tabular-nums text-mist-300">
                  {num(prediction.ht_home_goals + prediction.ht_away_goals, 2)}
                </span>
                <span
                  className={`text-right tabular-nums font-semibold ${
                    prediction.ht_over05 >= 0.75
                      ? "text-mint-400"
                      : prediction.ht_over05 >= 0.7
                        ? "text-amber-400"
                        : "text-rose-400"
                  }`}
                >
                  {pct(prediction.ht_over05)}
                </span>
                <span className="text-right tabular-nums text-mist-300">
                  {pct(prediction.ht_over15)}
                </span>
                <span className="text-right tabular-nums text-mist-500">
                  {pct(prediction.ht_over25)}
                </span>
                </Link>

                <div className="col-span-2 flex justify-end sm:col-span-1">
                  <FirstHalfSave match={firstHalfMatch} savedLines={savedLines} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
          aria-label="Paginación de primer tiempo"
        >
          {currentPage > 1 ? (
            <Link
              href={pageHref(currentPage - 1, query)}
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
              href={pageHref(page, query)}
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
              href={pageHref(currentPage + 1, query)}
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

      <p className="text-xs leading-relaxed text-mist-500">
        «Más de 0.5» = al menos un gol antes del descanso. «Más de 1.5» = dos o más. En las ligas
        sin goles de medio tiempo en la fuente se usa una estimación del 45% del total.
      </p>
    </div>
  );
}
