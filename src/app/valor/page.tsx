import Link from "next/link";
import {
  getCounts,
  getLeagueLogoMap,
  getMarketOdds,
  getTeamLogoMap,
  getUpcoming,
} from "@/lib/queries";
import { LEAGUES, LEAGUE_BY_CODE } from "@/lib/leagues";
import { dayLabel, dayKey, num, pct, timeOf } from "@/lib/format";
import { findValue, type ValueCategory, type ValuePick } from "@/lib/value";
import { LeagueTag, Pill, TeamBadge } from "@/components/ui";
import { SaveComboButton } from "@/components/save-combo-button";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { currentUser } from "@/lib/session";
import type { Combo, ComboCategory, ComboLeg } from "@/lib/combos";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 6;
const EDGE_OPTIONS = [3, 6, 8];
const PROB_OPTIONS = [30, 40, 50, 60];
const MARKET_OPTIONS: { value: string; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "1x2", label: "1X2" },
  { value: "goles", label: "Goles" },
  { value: "corners", label: "Córners" },
  { value: "cards", label: "Tarjetas" },
  { value: "sot", label: "Tiros al arco" },
];
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "valor", label: "Más valor" },
  { value: "ventaja", label: "Mayor ventaja" },
  { value: "probabilidad", label: "Más probable" },
  { value: "fecha", label: "Fecha" },
];

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const CATEGORY_TO_COMBO: Record<ValueCategory, ComboCategory> = {
  "1x2": "ganador",
  goles: "goles",
  corners: "corners",
  cards: "tarjetas",
  sot: "remates",
};

function pickCombo(pick: ValuePick): Combo {
  const leg: ComboLeg = {
    matchId: pick.match.id,
    matchLabel: `${pick.match.home_team} vs ${pick.match.away_team}`,
    leagueCode: pick.match.league_code,
    kickoff: pick.match.kickoff,
    market: pick.label,
    category: CATEGORY_TO_COMBO[pick.category],
    probability: pick.modelProb,
    rule: pick.rule,
  };

  return {
    id: `valor-${pick.match.id}-${pick.category}-${pick.label}`.replace(/\s+/g, "-"),
    title: pick.label,
    description: `${pick.match.home_team} vs ${pick.match.away_team}`,
    legs: [leg],
    probability: pick.modelProb,
    fairOdds: pick.modelProb > 0 ? 1 / pick.modelProb : 0,
  };
}

function riskOf(prob: number): { label: string; className: string } {
  if (prob >= 0.5) {
    return { label: "Sólido", className: "border-win-500/40 bg-win-500/10 text-win-400" };
  }
  if (prob >= 0.25) {
    return { label: "Medio", className: "border-amber-400/40 bg-amber-400/10 text-amber-400" };
  }
  return { label: "Tiro largo", className: "border-rose-400/40 bg-rose-400/10 text-rose-400" };
}

export default async function ValuePage({
  searchParams,
}: {
  searchParams: Promise<{
    min?: string;
    prob?: string;
    mercado?: string;
    liga?: string;
    q?: string;
    orden?: string;
    pagina?: string;
  }>;
}) {
  const params = await searchParams;

  const parsedMin = Number(params.min);
  const minPct = Number.isFinite(parsedMin) && parsedMin >= 0 && parsedMin <= 30 ? parsedMin : 6;
  const parsedProb = Number(params.prob);
  const probPct = PROB_OPTIONS.includes(parsedProb) ? parsedProb : 40;
  const mercado = MARKET_OPTIONS.some((item) => item.value === params.mercado)
    ? (params.mercado as string)
    : "todas";
  const liga = params.liga && LEAGUE_BY_CODE[params.liga] ? params.liga : "";
  const query = (params.q ?? "").trim();
  const queryNorm = normalizeText(query);
  const orden = SORT_OPTIONS.some((item) => item.value === params.orden)
    ? (params.orden as string)
    : "probabilidad";

  const user = await currentUser();
  const [allUpcoming, counts, teamLogos, leagueLogos, saved] = await Promise.all([
    getUpcoming(),
    getCounts(),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    loadSavedCombos(7, user?.id ?? null),
  ]);

  const savedHashes = new Set(saved.map((item) => item.hash));

  const upcoming = allUpcoming.filter(
    (match) => Date.parse(`${match.kickoff}Z`) >= Date.now() - 30 * 60_000,
  );

  const matchIds = upcoming.map((match) => match.id);
  const marketOdds = await getMarketOdds(matchIds);

  const allPicks = findValue(upcoming, marketOdds, {
    minEdge: minPct / 100,
    minProb: probPct / 100,
    maxOdds: 6,
  });

  const filtered = allPicks
    .filter((pick) => mercado === "todas" || pick.category === mercado)
    .filter((pick) => !liga || pick.match.league_code === liga)
    .filter((pick) => {
      if (!queryNorm) return true;
      const league = LEAGUE_BY_CODE[pick.match.league_code];
      return (
        normalizeText(pick.match.home_team).includes(queryNorm) ||
        normalizeText(pick.match.away_team).includes(queryNorm) ||
        normalizeText(league?.name ?? "").includes(queryNorm) ||
        normalizeText(league?.country ?? "").includes(queryNorm)
      );
    })
    .sort((a, b) => {
      if (orden === "ventaja") return b.edge - a.edge;
      if (orden === "probabilidad") return b.modelProb - a.modelProb;
      if (orden === "fecha") return a.match.kickoff.localeCompare(b.match.kickoff);
      return b.modelProb * b.edge - a.modelProb * a.edge;
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(params.pagina ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), totalPages)
    : 1;
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hrefFor = (options: {
    min?: number;
    prob?: number;
    mercado?: string;
    liga?: string;
    q?: string;
    orden?: string;
    pagina?: number;
  }) => {
    const search = new URLSearchParams();
    const nextMin = options.min ?? minPct;
    const nextProb = options.prob ?? probPct;
    const nextMarket = options.mercado ?? mercado;
    const nextLiga = options.liga ?? liga;
    const nextQuery = options.q ?? query;
    const nextOrder = options.orden ?? orden;

    if (nextMin !== 6) search.set("min", String(nextMin));
    if (nextProb !== 40) search.set("prob", String(nextProb));
    if (nextMarket !== "todas") search.set("mercado", nextMarket);
    if (nextLiga) search.set("liga", nextLiga);
    if (nextQuery) search.set("q", nextQuery);
    if (nextOrder !== "probabilidad") search.set("orden", nextOrder);
    if (options.pagina && options.pagina > 1) search.set("pagina", String(options.pagina));

    const qs = search.toString();
    return qs ? `/valor?${qs}` : "/valor";
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Partidos con valor
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-mist-400">
          Valor = jugada <span className="text-mist-300">probable</span> que además{" "}
          <span className="text-mist-300">paga de más</span> según el modelo. Solo mostramos
          selecciones con <span className="font-semibold text-mint-400">≥{probPct}%</span> de
          probabilidad y <span className="font-semibold text-mint-400">+{minPct}%</span> de ventaja
          frente al mercado.
          <br />
          Cada tarjeta muestra la probabilidad de salir y su riesgo:{" "}
          <span className="text-mint-400">Probable</span> (≥55%),{" "}
          <span className="text-amber-400">Riesgo medio</span> (45-55%) o{" "}
          <span className="text-rose-400">Riesgo alto</span> (&lt;45%).
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Próximos" value={String(upcoming.length)} />
          <Pill label="Con valor" value={String(allPicks.length)} tone="good" />
          <Pill label="Mostrando" value={String(filtered.length)} />
          <Pill label="Página" value={`${currentPage}/${totalPages}`} />
        </div>
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mist-500">Ventaja:</span>
          {EDGE_OPTIONS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ min: option })}
              className={`rounded-lg border px-2.5 py-1 transition ${
                minPct === option
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
              }`}
            >
              +{option}%
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mist-500">Probabilidad:</span>
          {PROB_OPTIONS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ prob: option })}
              className={`rounded-lg border px-2.5 py-1 transition ${
                probPct === option
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
              }`}
            >
              ≥{option}%
            </Link>
          ))}
        </div>

        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 text-xs">
          {MARKET_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={hrefFor({ mercado: option.value })}
              className={`shrink-0 rounded-lg border px-2.5 py-1 transition ${
                mercado === option.value
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-mist-500">Orden:</span>
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={hrefFor({ orden: option.value })}
              className={`rounded-lg border px-2.5 py-1 transition ${
                orden === option.value
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <form action="/valor" className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-2.5 transition focus-within:border-mint-500/50 sm:w-56">
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

          <select
            name="liga"
            defaultValue={liga}
            className="h-8 rounded-lg border border-ink-700 bg-ink-850 px-2 text-xs text-mist-300 focus:outline-none"
          >
            <option value="">Todas las ligas</option>
            {LEAGUES.map((league) => (
              <option key={league.code} value={league.code}>
                {league.name} · {league.country}
              </option>
            ))}
          </select>

          <input type="hidden" name="min" value={String(minPct)} />
          <input type="hidden" name="prob" value={String(probPct)} />
          <input type="hidden" name="mercado" value={mercado} />
          <input type="hidden" name="orden" value={orden} />

          <button
            type="submit"
            className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs text-mist-300 transition hover:border-mint-500/40 hover:text-white"
          >
            Filtrar
          </button>
          {query || liga ? (
            <Link
              href={hrefFor({ q: "", liga: "" })}
              className="h-8 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 text-xs leading-8 text-mist-300 transition hover:border-mint-500/40 hover:text-white"
            >
              Limpiar
            </Link>
          ) : null}
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          <p className="font-medium text-white">No hay picks con esos filtros.</p>
          <p className="mt-1 text-xs leading-relaxed">
            Prueba bajar la probabilidad mínima o la ventaja. Es normal que algunos días no haya
            valor claro: el mercado suele estar bien ajustado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((pick) => {
            const league = LEAGUE_BY_CODE[pick.match.league_code];
            const risk = riskOf(pick.modelProb);
            const combo = pickCombo(pick);

            return (
              <div key={`${pick.match.id}-${pick.category}-${pick.label}`} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LeagueTag
                      code={pick.match.league_code}
                      logo={leagueLogos.get(pick.match.league_code)}
                    />
                    <span className="text-[11px] text-mist-500">
                      {dayLabel(pick.match.kickoff)} · {timeOf(pick.match.kickoff)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-0.5 text-[9px] uppercase tracking-wide text-mist-400">
                      {MARKET_OPTIONS.find((item) => item.value === pick.category)?.label ??
                        pick.category}
                    </span>
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${risk.className}`}
                    >
                      {risk.label}
                    </span>
                  </div>
                </div>

                <Link href={`/partido/${pick.match.id}`} className="mt-3 flex items-center gap-2">
                  <TeamBadge
                    name={pick.match.home_team}
                    size={24}
                    logo={teamLogos.get(`${pick.match.league_code}:${pick.match.home_team}`)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    {pick.match.home_team}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-mist-500">vs</span>
                  <span className="min-w-0 flex-1 truncate text-right text-sm text-white">
                    {pick.match.away_team}
                  </span>
                  <TeamBadge
                    name={pick.match.away_team}
                    size={24}
                    logo={teamLogos.get(`${pick.match.league_code}:${pick.match.away_team}`)}
                  />
                </Link>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-mint-500/25 bg-mint-500/5 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-semibold text-mint-400">{pick.label}</span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${
                        pick.modelProb >= 0.55
                          ? "bg-win-500/10 text-win-400 ring-win-500/30"
                          : pick.modelProb >= 0.45
                            ? "bg-amber-400/10 text-amber-400 ring-amber-400/30"
                            : "bg-rose-400/10 text-rose-400 ring-rose-400/30"
                      }`}
                    >
                      {pick.modelProb >= 0.55
                        ? "Probable"
                        : pick.modelProb >= 0.45
                          ? "Riesgo medio"
                          : "Riesgo alto"}
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-mist-400">
                    {pct(pick.modelProb, 1)} · cuota {(1 / pick.modelProb).toFixed(2)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-mist-500">
                      Probabilidad
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-white">
                      {pct(pick.modelProb, 1)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-mist-500">Mercado</div>
                    <div className="text-sm font-semibold tabular-nums text-mist-300">
                      {pct(pick.marketProb, 1)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-mist-500">Cuota</div>
                    <div className="text-sm font-semibold tabular-nums text-white">
                      {num(pick.odds, 2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-mint-500/25 bg-mint-500/5 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-mist-500">Ventaja</div>
                    <div className="text-sm font-semibold tabular-nums text-mint-400">
                      +{(pick.edge * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-mist-500">EV / €</div>
                    <div className="text-sm font-semibold tabular-nums text-mist-300">
                      {(pick.ev * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-mist-500">
                  <span>{league?.name ?? pick.match.league_code}</span>
                  <div className="flex items-center gap-2">
                    <span>{pick.category === "1x2" || pick.category === "goles" ? "" : "Con cuota de mercado"}</span>
                    <SaveComboButton
                      combo={combo}
                      initialSaved={savedHashes.has(
                        comboHash(dayKey(combo.legs[0]?.kickoff ?? ""), combo.legs),
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-center gap-1.5 text-xs"
          aria-label="Paginación de valor"
        >
          {currentPage > 1 ? (
            <Link
              href={hrefFor({ pagina: currentPage - 1 })}
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
              href={hrefFor({ pagina: page })}
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
              href={hrefFor({ pagina: currentPage + 1 })}
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

      <div className="card space-y-2 p-4 text-xs leading-relaxed text-mist-400">
        <p className="font-semibold text-white">Qué significa “valor”</p>
        <p>
          No es una apuesta segura: es una cuota que paga más de lo que vale según el modelo. Con{" "}
          <span className="text-mist-300">≥{probPct}%</span> de probabilidad y{" "}
          <span className="text-mint-400">+{minPct}%</span> de ventaja, buscamos que sea{" "}
          <span className="text-mist-300">probable y esté mal pagada</span>.
        </p>
        <p>
          Cobertura de cuotas de mercado: córners, tarjetas y tiros al arco dependen de API-Football.
          Si una liga no tiene cuotas de esos mercados, solo verás 1X2 y goles.
        </p>
        <p>
          Se excluyen equipos nuevos en la liga, poca muestra (&lt;6 partidos) y ventajas mayores al
          20% (suelen ser error del modelo).
        </p>
      </div>
    </div>
  );
}
