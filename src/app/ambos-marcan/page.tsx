import Link from "next/link";
import { getLeagueLogoMap, getTeamLogoMap, getUpcoming, type RatedMatch } from "@/lib/queries";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { dayLabel, dayKey, pct, timeOf } from "@/lib/format";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { SaveComboButton } from "@/components/save-combo-button";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { currentUser } from "@/lib/session";
import type { Combo, ComboLeg } from "@/lib/combos";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function bttsCombo(match: RatedMatch): Combo | null {
  const prediction = match.prediction;
  if (!prediction || prediction.btts <= 0) return null;

  const leg: ComboLeg = {
    matchId: match.id,
    matchLabel: `${match.home_team} vs ${match.away_team}`,
    leagueCode: match.league_code,
    kickoff: match.kickoff,
    market: "Ambos marcan",
    category: "btts",
    probability: prediction.btts,
    rule: { type: "btts" },
  };

  return {
    id: `btts-${match.id}`,
    title: "Ambos marcan",
    description: `${match.home_team} vs ${match.away_team}`,
    legs: [leg],
    probability: prediction.btts,
    fairOdds: prediction.btts > 0 ? 1 / prediction.btts : 0,
  };
}

function hrefFor(options: { pagina?: number; q?: string; min?: string; orden?: string }): string {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.min) params.set("min", options.min);
  if (options.orden && options.orden !== "probabilidad") params.set("orden", options.orden);
  if (options.pagina && options.pagina > 1) params.set("pagina", String(options.pagina));
  const qs = params.toString();
  return qs ? `/ambos-marcan?${qs}` : "/ambos-marcan";
}

export default async function BttsPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; q?: string; min?: string; orden?: string }>;
}) {
  const { pagina, q, min, orden } = await searchParams;
  const query = (q ?? "").trim();
  const queryNorm = normalizeText(query);
  const threshold = min === "60" ? 0.6 : min === "70" ? 0.7 : 0;
  const sortByDate = orden === "fecha";

  const user = await currentUser();
  const [upcoming, teamLogos, leagueLogos, saved] = await Promise.all([
    getUpcoming(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    loadSavedCombos(7, user?.id ?? null),
  ]);

  const savedHashes = new Set(saved.map((item) => item.hash));

  const now = Date.now();

  const rows = upcoming
    .filter(
      (match) =>
        match.prediction &&
        match.prediction.btts >= Math.max(0.01, threshold) &&
        Date.parse(`${match.kickoff}Z`) >= now,
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
    .sort((a, b) => {
      if (sortByDate) return a.kickoff.localeCompare(b.kickoff);
      const diff = (b.prediction?.btts ?? 0) - (a.prediction?.btts ?? 0);
      return diff !== 0 ? diff : a.kickoff.localeCompare(b.kickoff);
    });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(pagina ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const strong = rows.filter((match) => (match.prediction?.btts ?? 0) >= 0.6).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Ambos marcan
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-mist-400">
          Probabilidad de que los dos equipos anoten (BTTS), desde ahora en adelante y solo con
          partidos que aún no han empezado. Pulsa <span className="text-mist-300">Guardar</span>{" "}
          para seguirla en Resultados.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Partidos" value={String(rows.length)} />
          <Pill label="≥60%" value={String(strong)} tone="good" />
          <Pill label="Página" value={`${currentPage}/${totalPages}`} />
        </div>

        <form action="/ambos-marcan" className="flex w-full items-center gap-2 sm:w-auto">
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
          {min ? <input type="hidden" name="min" value={min} /> : null}
          {sortByDate ? <input type="hidden" name="orden" value="fecha" /> : null}
          <button
            type="submit"
            className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs text-mist-300 transition hover:border-mint-500/40 hover:text-white"
          >
            Buscar
          </button>
          {query ? (
            <Link
              href={hrefFor({ min, orden })}
              className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs leading-8 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
            >
              Limpiar
            </Link>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mist-500">Filtrar:</span>
          {[
            { value: "", label: "Todos" },
            { value: "60", label: "≥60%" },
            { value: "70", label: "≥70%" },
          ].map((option) => {
            const active = (min ?? "") === option.value;
            return (
              <Link
                key={option.value || "todos"}
                href={hrefFor({ q: query, min: option.value, orden })}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  active
                    ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                    : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mist-500">Orden:</span>
          {[
            { value: "probabilidad", label: "Mayor probabilidad" },
            { value: "fecha", label: "Fecha" },
          ].map((option) => {
            const active = sortByDate ? option.value === "fecha" : option.value === "probabilidad";
            return (
              <Link
                key={option.value}
                href={hrefFor({ q: query, min, orden: option.value })}
                className={`rounded-lg border px-2.5 py-1 transition ${
                  active
                    ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                    : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
                }`}
              >
                {option.label}
              </Link>
            );
          })}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">No hay partidos con esa probabilidad.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Prueba bajando el filtro a “Todos” o revisa la página{" "}
            <Link href="/" className="text-mint-400 hover:underline">
              Partidos
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-ink-800/70">
            {visible.map((match) => {
              const prediction = match.prediction!;
              const combo = bttsCombo(match);
              const homeLogo = teamLogos.get(`${match.league_code}:${match.home_team}`);
              const awayLogo = teamLogos.get(`${match.league_code}:${match.away_team}`);

              return (
                <div
                  key={match.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-ink-850/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] text-mist-500">
                      <LeagueTag
                        code={match.league_code}
                        logo={leagueLogos.get(match.league_code)}
                      />
                      <span>·</span>
                      <span>
                        {dayLabel(match.kickoff)} {timeOf(match.kickoff)}
                      </span>
                    </div>
                    <Link
                      href={`/partido/${match.id}`}
                      className="mt-1 flex items-center gap-2"
                    >
                      <TeamBadge name={match.home_team} size={20} logo={homeLogo} />
                      <span className="min-w-0 truncate text-sm text-white">{match.home_team}</span>
                      <span className="text-[10px] uppercase text-mist-500">vs</span>
                      <span className="min-w-0 truncate text-sm text-white">{match.away_team}</span>
                      <TeamBadge name={match.away_team} size={20} logo={awayLogo} />
                    </Link>
                  </div>

                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <div className="text-base font-semibold tabular-nums text-mint-400">
                        {pct(prediction.btts)}
                      </div>
                      <div className="text-[9px] uppercase tracking-wide text-mist-500">
                        Ambos marcan
                      </div>
                    </div>
                    <div className="hidden text-right text-[10px] text-mist-500 sm:block">
                      Cuota justa
                      <div className="font-semibold text-mist-300">
                        {(prediction.btts > 0 ? 1 / prediction.btts : 0).toFixed(2)}
                      </div>
                    </div>
                    {combo ? (
                      <SaveComboButton
                        combo={combo}
                        initialSaved={savedHashes.has(
                          comboHash(dayKey(combo.legs[0]?.kickoff ?? ""), combo.legs),
                        )}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
          aria-label="Paginación de ambos marcan"
        >
          {currentPage > 1 ? (
            <Link
              href={hrefFor({ pagina: currentPage - 1, q: query, min, orden })}
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
              href={hrefFor({ pagina: page, q: query, min, orden })}
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
              href={hrefFor({ pagina: currentPage + 1, q: query, min, orden })}
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
        Probabilidad de que ambos equipos anoten. La cuota justa es 1 ÷ probabilidad: si la casa
        paga más, hay valor.
      </p>
    </div>
  );
}
