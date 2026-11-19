import Link from "next/link";
import {
  getCounts,
  getLeagueLogoMap,
  getMarketOdds,
  getRecentResults,
  searchMatches,
  getTeamLogoMap,
  getUpcoming,
  getConfirmedUpcomingLineups,
  type RatedMatch,
} from "@/lib/queries";
import { LEAGUES, LEAGUE_BY_CODE } from "@/lib/leagues";
import { dateTimeLabel, dayKey, dayLabel, dayParts, pct, timeOf, todayKey } from "@/lib/format";
import { LeagueTag, Pill, ProbBar, SectionTitle, TeamBadge } from "@/components/ui";
import { displayTeam } from "@/lib/display";
import { getMeta } from "@/lib/db";
import { syncRecentResults } from "@/lib/resultsSync";
import { findValue } from "@/lib/value";
import { getHtVetoedSet, isHtVetoed } from "@/lib/veto";
import { notifyStartupIfNeeded } from "@/lib/notifyMatches";
import { notifyPlays } from "@/lib/notifyPlays";
import { notifyDailySummary } from "@/lib/notifySummary";
import { startNotifyScheduler } from "@/lib/notifyScheduler";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { GoalFlash } from "@/components/goal-flash";
import { UpcomingCarousel, type CarouselMatch } from "@/components/upcoming-carousel";
import { HomeAlerts, type HomeAlert } from "@/components/home-alerts";
import { HomeStats } from "@/components/home-stats";
import { DragScroll } from "@/components/drag-scroll";

export const dynamic = "force-dynamic";

function MatchChips({ match }: { match: RatedMatch }) {
  const p = match.prediction ?? match.cupPrediction ?? null;
  if (!p) return null;
  return (
    <>
      <Pill label="O2.5" value={pct(p.over25)} valueTone="text-win-400" />
      <Pill label="BTTS" value={pct(p.btts)} valueTone="text-win-400" />
      {p.ht_over05 > 0 ? <Pill label="1T +0.5" value={pct(p.ht_over05)} valueTone="text-win-400" /> : null}
      {LEAGUE_BY_CODE[match.league_code]?.hasStats !== false ? (
        <Pill label="Córn." value={(p.corners_home + p.corners_away).toFixed(1)} valueTone="text-white" />
      ) : null}
    </>
  );
}

function MatchRow({ match, logos }: { match: RatedMatch; logos: Map<string, string> }) {
  const p = match.prediction ?? match.cupPrediction ?? null;
  const homeLogo = logos.get(`${match.league_code}:${match.home_team}`);
  const awayLogo = logos.get(`${match.league_code}:${match.away_team}`);
  const now = Date.now();
  const kickoffMs = Date.parse(`${match.kickoff}Z`);
  const elapsed = now - kickoffMs;
  const isLive = elapsed >= 0 && elapsed < 2.25 * 3600_000;
  const isPending = elapsed >= 2.25 * 3600_000;

  return (
    <GoalFlash
      home={match.live ? match.live.home : (match.home_goals ?? null)}
      away={match.live ? match.live.away : (match.away_goals ?? null)}
      variant="row"
    >
      <Link
        href={`/partido/${match.id}`}
        className="group block border-b border-ink-800/70 px-3 py-3 transition last:border-0 hover:bg-ink-850/70 sm:flex sm:items-center sm:gap-4 sm:px-4"
      >
      <div className="flex items-start gap-2.5 sm:flex-1 sm:items-center sm:gap-4">
        <div
          className={`w-12 shrink-0 pt-0.5 text-center sm:w-16 sm:pt-0 ${
            match.live || isLive ? "hidden sm:block" : ""
          }`}
        >
          {match.live ? (
            <>
              <div className="text-sm font-bold tabular-nums text-amber-400">
                {match.live.home}-{match.live.away}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-amber-400/80">
                {match.live.clock ?? "En juego"}
              </div>
            </>
          ) : isLive ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">En juego</div>
              <div className="text-[9px] text-mist-500">{timeOf(match.kickoff)}</div>
            </>
          ) : isPending ? (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-mist-400">Pendiente</div>
              <div className="text-[9px] text-mist-500">{timeOf(match.kickoff)}</div>
            </>
          ) : (
            <>
              <div className="text-xs font-semibold tabular-nums text-mist-300">{timeOf(match.kickoff)}</div>
              <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-mist-500">
                {dayLabel(match.kickoff)}
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
          <div className="flex items-center gap-2">
            <TeamBadge name={displayTeam(match.home_team)} size={22} logo={homeLogo} plain />
            <span className="min-w-0 flex-1 truncate text-[13px] text-white sm:text-sm">{displayTeam(match.home_team)}</span>
            <span
              data-goal-score
              className={`shrink-0 text-center text-[10px] uppercase leading-tight tracking-widest ${
                match.live || isLive ? "font-bold text-amber-400" : "text-mist-500"
              }`}
            >
              {match.live ? (
                <span className="flex flex-col items-center leading-none">
                  <span>
                    {match.live.home}-{match.live.away}
                  </span>
                  {match.live.clock ? (
                    <span className="mt-0.5 text-[8px] font-medium tracking-normal text-amber-400/80 sm:hidden">
                      {match.live.clock}
                    </span>
                  ) : null}
                </span>
              ) : isLive ? (
                <span className="text-[9px]">En vivo</span>
              ) : (
                "vs"
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-[13px] text-white sm:text-sm">{displayTeam(match.away_team)}</span>
            <TeamBadge name={displayTeam(match.away_team)} size={22} logo={awayLogo} plain />
          </div>

          {p ? (
            <ProbBar home={p.home_win} draw={p.draw} away={p.away_win} />
          ) : (
            <p className="text-xs text-mist-500">Sin predicción todavía</p>
          )}
        </div>
      </div>

      {p ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[58px] sm:hidden">
          <MatchChips match={match} />
        </div>
      ) : null}

      <div className="hidden shrink-0 items-center justify-end gap-1.5 lg:flex">
        <MatchChips match={match} />
      </div>

      <span className="hidden shrink-0 text-mist-500 transition group-hover:text-mint-400 sm:block">→</span>
      </Link>
    </GoalFlash>
  );
}

function ResultRow({ match, logos }: { match: RatedMatch; logos: Map<string, string> }) {
  const home = match.home_goals ?? 0;
  const away = match.away_goals ?? 0;
  const homeWon = home > away;
  const awayWon = away > home;
  const homeLogo = logos.get(`${match.league_code}:${match.home_team}`);
  const awayLogo = logos.get(`${match.league_code}:${match.away_team}`);

  return (
    <Link
      href={`/partido/${match.id}`}
      className="group block border-b border-ink-800/70 px-3 py-2.5 transition last:border-0 hover:bg-ink-850/60 sm:flex sm:items-center sm:gap-4 sm:px-4"
    >
      <div className="mb-1 text-[9px] uppercase tracking-wide text-mist-500 sm:hidden">
        {dayLabel(match.kickoff)}
      </div>
      <div className="hidden w-16 shrink-0 whitespace-nowrap text-center text-[9px] uppercase tracking-wide text-mist-500 sm:block">
        {dayLabel(match.kickoff)}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] sm:text-sm">
        <span className={`min-w-0 flex-1 truncate text-right ${homeWon ? "text-white" : "text-mist-400"}`}>
          {displayTeam(match.home_team)}
        </span>
        <TeamBadge name={displayTeam(match.home_team)} size={20} logo={homeLogo} plain />
        <span className="rounded-md bg-ink-800 px-2 py-0.5 font-semibold tabular-nums text-white">
          {home} - {away}
        </span>
        <TeamBadge name={displayTeam(match.away_team)} size={20} logo={awayLogo} plain />
        <span className={`min-w-0 flex-1 truncate ${awayWon ? "text-white" : "text-mist-400"}`}>
          {displayTeam(match.away_team)}
        </span>
      </div>
      <span className="hidden w-14 shrink-0 text-right text-[10px] uppercase text-mist-500 sm:block">
        {LEAGUE_BY_CODE[match.league_code]?.name ?? match.league_code}
      </span>
      <span className="hidden w-3 shrink-0 text-mist-500 transition group-hover:text-mint-400 sm:block">→</span>
    </Link>
  );
}

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string; q?: string; dia?: string; orden?: string }>;
}) {
  const { liga, q, dia, orden } = await searchParams;
  const leagueFilter = liga && LEAGUE_BY_CODE[liga] ? liga : undefined;
  const order = orden === "hora" ? "hora" : "liga";
  const query = (q ?? "").trim();
  const queryNorm = normalizeText(query);

  // Cierra partidos terminados (máximo cada 30 minutos) antes de leer la base.
  await syncRecentResults().catch(() => undefined);

  // Avisos: al abrir la app (una vez al día) y recordatorio antes del partido.
  void notifyStartupIfNeeded().catch(() => undefined);
  // Resumen del día; si ya se envió, se avisan solo las jugadas nuevas.
  void notifyDailySummary()
    .then((sent) => {
      if (sent === 0) return notifyPlays();
      return undefined;
    })
    .catch(() => undefined);
  startNotifyScheduler();

  const [allUpcoming, allRecent, counts, trainedAt, resultsSyncAt, teamLogos, leagueLogos, confirmedLineups, htVetoed] = await Promise.all([
    getUpcoming(leagueFilter),
    getRecentResults(40, leagueFilter),
    getCounts(),
    getMeta("trained_at"),
    getMeta("results_sync_at"),
    getTeamLogoMap(),
    getLeagueLogoMap(),
    getConfirmedUpcomingLineups(3),
    getHtVetoedSet(),
  ]);

  const matchesQuery = (match: RatedMatch) => {
    if (!queryNorm) return true;
    const league = LEAGUE_BY_CODE[match.league_code];
    return (
      normalizeText(match.home_team).includes(queryNorm) ||
      normalizeText(match.away_team).includes(queryNorm) ||
      normalizeText(league?.name ?? "").includes(queryNorm) ||
      normalizeText(league?.country ?? "").includes(queryNorm)
    );
  };

  const upcoming = allUpcoming.filter(matchesQuery);
  const recent = allRecent.filter(matchesQuery).slice(0, 12);
  const searchResults = query ? await searchMatches(query, leagueFilter, 60) : [];

  const featuredMatches: CarouselMatch[] = allUpcoming.slice(0, 10).map((match) => {
    const league = LEAGUE_BY_CODE[match.league_code];
    const prediction = match.prediction ?? match.cupPrediction;
    const kickoffMs = Date.parse(`${match.kickoff}Z`);
    return {
      id: match.id,
      leagueCode: match.league_code,
      leagueName: league?.name ?? match.league_code,
      leagueCountry: league?.country ?? "",
      leagueLogo: leagueLogos.get(match.league_code),
      day: dayLabel(match.kickoff),
      time: timeOf(match.kickoff),
      homeTeam: displayTeam(match.home_team),
      awayTeam: displayTeam(match.away_team),
      homeLogo: teamLogos.get(`${match.league_code}:${match.home_team}`),
      awayLogo: teamLogos.get(`${match.league_code}:${match.away_team}`),
      home: pct(prediction?.home_win),
      draw: pct(prediction?.draw),
      away: pct(prediction?.away_win),
      live: Number.isFinite(kickoffMs) && kickoffMs <= Date.now() && Date.now() - kickoffMs < 2.5 * 3600_000,
    };
  });

  const marketOdds = await getMarketOdds(allUpcoming.map((match) => match.id));
  const alertMatches = allUpcoming.filter(
    (match) => Date.parse(`${match.kickoff}Z`) >= Date.now() - 30 * 60_000,
  );
  const valuePicks = findValue(alertMatches, marketOdds, {
    minEdge: 0.06,
    minProb: 0.4,
    maxOdds: 6,
  });
  const valueCount = valuePicks.length;

  // Alertas del panel derecho: Value → 1T → XI → probabilidad alta.
  const alerts: HomeAlert[] = [];
  const alertedMatchIds = new Set<number>();
  const versus = (match: { home_team: string; away_team: string }) =>
    `${displayTeam(match.home_team)} vs ${displayTeam(match.away_team)}`;
  const slotLabel = (kickoff: string) => `${dayLabel(kickoff)} · ${timeOf(kickoff)}`;

  const valueSeen = new Set<number>();
  for (const pick of valuePicks) {
    if (alerts.length >= 2) break;
    if (valueSeen.has(pick.match.id)) continue;
    valueSeen.add(pick.match.id);
    alertedMatchIds.add(pick.match.id);
    alerts.push({
      key: `value-${pick.match.id}-${pick.label}`,
      kind: "value",
      title: versus(pick.match),
      detail: `${pick.label} · cuota ${pick.odds.toFixed(2)} · +${Math.round(
        pick.edge * 100,
      )} pp · ${slotLabel(pick.match.kickoff)}`,
      href: `/partido/${pick.match.id}`,
    });
  }

  const firstHalf = alertMatches
    .filter(
      (match) =>
        match.prediction &&
        match.prediction.ht_over05 >= 0.75 &&
        !alertedMatchIds.has(match.id) &&
        !isHtVetoed(htVetoed, match.league_code, match.home_team) &&
        !isHtVetoed(htVetoed, match.league_code, match.away_team),
    )
    .sort((a, b) => b.prediction!.ht_over05 - a.prediction!.ht_over05)
    .slice(0, 2);

  for (const match of firstHalf) {
    alertedMatchIds.add(match.id);
    alerts.push({
      key: `1t-${match.id}`,
      kind: "1t",
      title: versus(match),
      detail: `Gol en 1T +0.5 · ${pct(match.prediction?.ht_over05)} · ${slotLabel(
        match.kickoff,
      )}`,
      href: `/partido/${match.id}`,
    });
  }

  for (const lineup of confirmedLineups) {
    if (alerts.length >= 5) break;
    if (alertedMatchIds.has(lineup.match_id)) continue;
    alertedMatchIds.add(lineup.match_id);
    alerts.push({
      key: `xi-${lineup.match_id}`,
      kind: "lineup",
      title: versus(lineup),
      detail: `XI confirmado · ${lineup.starters} titulares · ${slotLabel(lineup.kickoff)}`,
      href: `/partido/${lineup.match_id}`,
    });
  }

  if (alerts.length < 5) {
    const highProbability = alertMatches
      .filter((match) => match.prediction && !alertedMatchIds.has(match.id))
      .map((match) => {
        const prediction = match.prediction!;
        const best = [
          { label: "Local", value: prediction.home_win },
          { label: "Empate", value: prediction.draw },
          { label: "Visitante", value: prediction.away_win },
        ].sort((a, b) => b.value - a.value)[0];
        return { match, best };
      })
      .filter((row) => row.best.value >= 0.75)
      .sort((a, b) => b.best.value - a.best.value)
      .slice(0, 5 - alerts.length);

    for (const row of highProbability) {
      alertedMatchIds.add(row.match.id);
      alerts.push({
        key: `high-${row.match.id}`,
        kind: "high",
        title: versus(row.match),
        detail: `${row.best.label} · ${pct(row.best.value)} · ${slotLabel(
          row.match.kickoff,
        )}`,
        href: `/partido/${row.match.id}`,
      });
    }
  }

  const nowMs = Date.now();
  const hasLive = allUpcoming.some((match) => {
    const kickoff = Date.parse(`${match.kickoff}Z`);
    return kickoff <= nowMs && nowMs - kickoff < 2.5 * 3600_000;
  });

  // Agrupación por día para la tira de fechas.
  const byDay = new Map<string, RatedMatch[]>();
  for (const match of upcoming) {
    const key = dayKey(match.kickoff);
    const list = byDay.get(key) ?? [];
    list.push(match);
    byDay.set(key, list);
  }

  const dayKeys = [...byDay.keys()].sort();
  const today = todayKey();
  const requestedDay = dia && dia !== "todos" && byDay.has(dia) ? dia : undefined;
  const defaultDay = byDay.has(today) ? today : dayKeys.find((key) => key >= today) ?? dayKeys[0];
  const selectedDay = dia === "todos" ? undefined : requestedDay ?? defaultDay;
  const dayParam = dia === "todos" ? "todos" : selectedDay;

  const visible = selectedDay ? byDay.get(selectedDay) ?? [] : upcoming;

  const groups = new Map<string, RatedMatch[]>();
  for (const match of visible) {
    const list = groups.get(match.league_code) ?? [];
    list.push(match);
    groups.set(match.league_code, list);
  }

  const orderedCodes = LEAGUES.map((league) => league.code).filter((code) => groups.has(code));

  // Vista "Por hora": lista cronológica del día seleccionado (o de todos los días).
  const chronological = [...visible].sort(
    (a, b) => Date.parse(`${a.kickoff}Z`) - Date.parse(`${b.kickoff}Z`),
  );
  const chronologicalByDay = new Map<string, RatedMatch[]>();
  for (const match of chronological) {
    const key = dayKey(match.kickoff);
    const list = chronologicalByDay.get(key) ?? [];
    list.push(match);
    chronologicalByDay.set(key, list);
  }

  const hrefFor = (options: { liga?: string; dia?: string; q?: string; orden?: string }) => {
    const params = new URLSearchParams();
    if (options.liga) params.set("liga", options.liga);
    if (options.q) params.set("q", options.q);
    if (options.dia) params.set("dia", options.dia);
    if (options.orden) params.set("orden", options.orden);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const emptyUpcoming = (
    <section className="card overflow-hidden">
      <div className="border-b border-ink-800 px-4 py-3">
        <p className="text-sm font-medium text-white">
          {leagueFilter
            ? "No hay partidos próximos en esta liga"
            : "No hay partidos próximos cargados"}
        </p>
        <p className="text-xs text-mist-500">
          {leagueFilter
            ? "Abajo tienes los últimos resultados de la competición."
            : "Ejecuta npm run refresh para actualizar."}
        </p>
      </div>
      {recent.map((match) => (
        <ResultRow key={match.id} match={match} logos={teamLogos} />
      ))}
    </section>
  );

  return (
    <div className="space-y-4">
      <LiveAutoRefresh active={hasLive} seconds={20} />
      <UpcomingCarousel matches={featuredMatches} />
      <div className="grid items-start gap-6 min-[1150px]:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
      {query ? (
        <p className="text-xs text-mist-400">
          {searchResults.length} resultados para <span className="text-white">“{query}”</span> ·{" "}
          <Link
            href={hrefFor({ liga: leagueFilter, dia: selectedDay, orden: order === "hora" ? "hora" : undefined })}
            className="text-mint-400 hover:underline"
          >
            limpiar
          </Link>
        </p>
      ) : null}

      {query ? (
        <section>
          <SectionTitle
            title={`Resultados para “${query}”`}
            subtitle={`${searchResults.length} partidos · últimos primero`}
          />
          <div className="card overflow-hidden">
            {searchResults.length === 0 ? (
              <p className="px-4 py-3 text-xs text-mist-500">Sin partidos para esa búsqueda.</p>
            ) : (
              searchResults.map((match) =>
                match.status === "played" ? (
                  <ResultRow key={match.id} match={match} logos={teamLogos} />
                ) : (
                  <MatchRow key={match.id} match={match} logos={teamLogos} />
                ),
              )
            )}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-mist-500">Orden</span>
          <Link
            href={hrefFor({ liga: leagueFilter, q: query, dia: dayParam })}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              order === "liga"
                ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                : "border-ink-700 bg-ink-850 text-mist-400 hover:text-white"
            }`}
          >
            Por liga
          </Link>
          <Link
            href={hrefFor({ liga: leagueFilter, q: query, dia: dayParam, orden: "hora" })}
            className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              order === "hora"
                ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                : "border-ink-700 bg-ink-850 text-mist-400 hover:text-white"
            }`}
          >
            Por hora
          </Link>
        </div>
        {order === "hora" ? (
          <span className="text-[10px] text-mist-500">Más temprano primero</span>
        ) : null}
      </section>

      {dayKeys.length > 1 ? (
        <section>
          <DragScroll className="flex gap-2 pb-1">
            {dayKeys.map((key) => {
              const list = byDay.get(key) ?? [];
              const parts = dayParts(list[0].kickoff);
              const active = key === selectedDay;
              return (
                <Link
                  key={key}
                  href={hrefFor({ liga: leagueFilter, q: query, dia: key, orden: order === "hora" ? "hora" : undefined })}
                  className={`min-w-[82px] flex-1 rounded-xl border px-3 py-2 text-center transition ${
                    active
                      ? "border-[var(--color-date-border)] bg-[var(--color-date-bg)] shadow-[0_8px_24px_-16px_rgba(56,189,248,0.5)]"
                      : "border-ink-800 bg-ink-900/80 hover:border-ink-700 hover:bg-ink-850"
                  }`}
                >
                  <div
                    className={`text-[9px] uppercase tracking-wide ${
                      active ? "text-[var(--color-date-accent)]" : "text-mist-500"
                    }`}
                  >
                    {key === today ? "Hoy" : parts.weekday}
                  </div>
                  <div
                    className={`text-lg font-semibold leading-tight tabular-nums ${
                      active ? "text-[var(--color-date-text)]" : "text-white"
                    }`}
                  >
                    {parts.day}
                  </div>
                  <div
                    className={`text-[9px] uppercase tracking-wide ${
                      active ? "text-mist-500" : "text-mist-500"
                    }`}
                  >
                    {parts.month}
                  </div>
                  <div
                    className={`mx-auto mt-1.5 w-fit rounded-full px-1.5 text-[9px] tabular-nums ${
                      active
                        ? "bg-[var(--color-date-pill-bg)] text-[var(--color-date-pill-text)]"
                        : "bg-ink-800 text-mist-400"
                    }`}
                  >
                    {list.length}
                  </div>
                </Link>
              );
            })}
            <Link
              href={hrefFor({ liga: leagueFilter, q: query, dia: "todos", orden: order === "hora" ? "hora" : undefined })}
              className={`grid min-w-[140px] shrink-0 place-items-center rounded-xl border px-3 py-2 text-[10px] transition ${
                !selectedDay
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-800 bg-ink-900/80 text-mist-400 hover:bg-ink-850 hover:text-white"
              }`}
            >
              Ver calendario completo
            </Link>
          </DragScroll>
        </section>
      ) : null}

      <section>
        <DragScroll showBar className="-mx-1 flex gap-1.5 px-1 pb-2">
          <Link
            href={hrefFor({ dia: selectedDay, q: query, orden: order === "hora" ? "hora" : undefined })}
            className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs transition ${
              !leagueFilter
                ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                : "border-ink-700 bg-ink-850 text-mist-400 hover:text-white"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="mr-1.5 inline-block size-3.5 align-[-2px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3c3.2 4 3.2 14 0 18M12 3c-3.2 4-3.2 14 0 18" />
            </svg>
            Todas las ligas
          </Link>
          {LEAGUES.map((league) => (
            <Link
              key={league.code}
              href={hrefFor({ liga: league.code, dia: selectedDay, q: query, orden: order === "hora" ? "hora" : undefined })}
              className={`shrink-0 rounded-lg border px-2.5 py-1 text-xs transition ${
                leagueFilter === league.code
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-400"
                  : "border-ink-700 bg-ink-850 text-mist-400 hover:text-white"
              }`}
            >
              {leagueLogos.get(league.code) ? (
                <img
                  src={leagueLogos.get(league.code)}
                  alt=""
                  loading="lazy"
                  className="mr-1.5 inline-block size-3.5 object-contain align-[-2px]"
                />
              ) : (
                <span className="mr-1.5" aria-hidden>
                  {league.tag}
                </span>
              )}
              {league.name}
            </Link>
          ))}
        </DragScroll>
      </section>

      {order === "hora" ? (
        chronological.length > 0 ? (
          selectedDay ? (
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
                <h2 className="text-sm font-semibold text-white">Partidos por hora</h2>
                <span className="text-[10px] text-mist-500">
                  {chronological.length} partidos · más temprano primero
                </span>
              </div>
              {chronological.map((match) => (
                <MatchRow key={match.id} match={match} logos={teamLogos} />
              ))}
            </section>
          ) : (
            <div className="space-y-6">
              {[...chronologicalByDay.entries()].map(([key, matches]) => (
                <section key={key} className="card overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-ink-800 px-4 py-3">
                    <h2 className="text-sm font-semibold capitalize text-white">
                      {dayLabel(matches[0].kickoff)}
                    </h2>
                    <span className="text-[10px] text-mist-500">{matches.length} partidos</span>
                  </div>
                  {matches.map((match) => (
                    <MatchRow key={match.id} match={match} logos={teamLogos} />
                  ))}
                </section>
              ))}
            </div>
          )
        ) : (
          emptyUpcoming
        )
      ) : orderedCodes.length > 0 ? (
        <div className="space-y-6">
          {orderedCodes.map((code) => {
            const matches = groups.get(code) ?? [];
            return (
              <section key={code} id={`liga-${code}`} className="card scroll-mt-24 overflow-hidden">
                <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
                  <LeagueTag code={code} logo={leagueLogos.get(code)} />
                  <Link
                    href={`/?liga=${code}&dia=todos#liga-${code}`}
                    className="text-[11px] text-mist-500 transition hover:text-mint-400"
                  >
                    {matches.length} partidos · ver todos
                  </Link>
                </div>
                <div>
                  {matches.map((match) => (
                    <MatchRow key={match.id} match={match} logos={teamLogos} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        emptyUpcoming
      )}

      <section>
        <SectionTitle
          title="Últimos resultados"
          subtitle="Datos reales de las mismas ligas que alimentan el modelo"
          action={{ href: "/ligas", label: "Ver ligas →" }}
        />
        <div className="card overflow-hidden">
          {recent.map((match) => (
            <ResultRow key={match.id} match={match} logos={teamLogos} />
          ))}
        </div>
      </section>
        </div>

        <aside id="alertas" className="min-w-0 scroll-mt-24 min-[1150px]:sticky min-[1150px]:top-20 min-[1150px]:self-start">
          <div className="space-y-4">
            <HomeStats
              played={counts.played.toLocaleString("es-ES")}
              upcoming={allUpcoming.length}
              valueBets={valueCount}
              trainedAt={trainedAt ? dateTimeLabel(trainedAt) : null}
            />
            <HomeAlerts
              alerts={alerts}
              trainedAt={trainedAt ? dateTimeLabel(trainedAt) : null}
              resultsAt={resultsSyncAt ? dateTimeLabel(resultsSyncAt) : null}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
