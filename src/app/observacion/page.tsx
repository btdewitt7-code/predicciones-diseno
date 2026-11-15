import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureSchemaOnce } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { getFirstHalfFailures, getFirstHalfWatchlist, getSentFirstHalfAlerts, getTeamHalfLabels, getTodayFailureWatchlist, getLeagueLogoMap } from "@/lib/queries";
import { listHtVetos } from "@/lib/veto";
import { displayTeam } from "@/lib/display";
import { dateTimeLabel, dayKey, pct, todayKey } from "@/lib/format";
import { LeagueTag } from "@/components/ui";

export const dynamic = "force-dynamic";

// Solo lectura: esta página no envía notificaciones (Discord/ntfy).
export default async function ObservacionPage() {
  await ensureSchemaOnce();

  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!user.isAdmin) redirect("/");

  const [rows, failures, watchlist, sentAlerts, htVetos, leagueLogos] = await Promise.all([
    getFirstHalfWatchlist(),
    getFirstHalfFailures(2),
    getTodayFailureWatchlist(),
    getSentFirstHalfAlerts(),
    listHtVetos(),
    getLeagueLogoMap(),
  ]);
  const today = todayKey();
  const todaysFailures = failures.filter((failure) => dayKey(failure.kickoff) === today);
  const todaysTeams = [
    ...new Set(todaysFailures.flatMap((failure) => [failure.homeTeam, failure.awayTeam])),
  ];
  const sentTeams = [
    ...new Set(sentAlerts.flatMap((alert) => [alert.homeTeam, alert.awayTeam])),
  ];
  const sentLabels = await getTeamHalfLabels(sentTeams);
  const omitted = rows.filter(
    (row) =>
      dayKey(row.kickoff) === today &&
      !sentAlerts.some((alert) => alert.matchId === row.matchId),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Observación · 1er tiempo
        </h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-mist-500">
          Solo administrador. Partidos donde el modelo da{" "}
          <span className="text-mist-300">70% o más</span> a “1T más de 0.5”, pero el equipo falla
          el primer tiempo en <span className="text-mist-300">más de la mitad</span> de sus últimos
          10 partidos. Es una alerta para revisar, no una recomendación.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white">Vetados del 1T</h2>
        <p className="mt-1 text-xs text-mist-500">
          Equipos que no se muestran en la página de goles del primer tiempo.
        </p>
        {htVetos.length === 0 ? (
          <p className="mt-2 text-xs text-mist-400">No hay equipos vetados del 1T.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {htVetos.map((veto) => (
              <span
                key={`${veto.league_code}:${veto.team}`}
                className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] text-rose-300"
              >
                {displayTeam(veto.team)} · {veto.league_code}
                {veto.note ? ` · ${veto.note}` : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white">Vigilar en su próximo partido</h2>
        <p className="mt-1 text-xs text-mist-500">
          Próximos partidos de los equipos que fallaron el 1T hoy (0-0 al descanso con 70%+ del
          modelo). El aviso de Discord se manda normal; esto es solo observación.
        </p>
        {watchlist.length === 0 ? (
          <p className="mt-2 text-xs text-mist-400">
            {todaysTeams.length > 0
              ? `Vigilados hoy: ${todaysTeams.map((team) => displayTeam(team)).join(", ")}. Aún no tienen próximo partido cargado.`
              : "No hay equipos vigilados hoy."}
          </p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {watchlist.map((row) => (
              <div key={row.matchId} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] text-mist-500">
                    <LeagueTag code={row.leagueCode} logo={leagueLogos.get(row.leagueCode)} />
                    <span>{dateTimeLabel(row.kickoff)}</span>
                  </div>
                  <Link
                    href={`/partido/${row.matchId}`}
                    className="text-[11px] text-mint-400 transition hover:underline"
                  >
                    Ver partido →
                  </Link>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white">
                    {displayTeam(row.homeTeam)} <span className="text-mist-500">vs</span>{" "}
                    {displayTeam(row.awayTeam)}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-mist-500">
                      Modelo 1T +0.5
                    </div>
                    <div className="text-lg font-semibold text-mint-400">{pct(row.model)}</div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {row.failures.map((failure) => (
                    <span
                      key={failure.team}
                      className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] text-rose-300"
                    >
                      {displayTeam(failure.team)} falló su último 1T: 0-0 vs{" "}
                      {displayTeam(failure.failedOpponent)} ({pct(failure.failedModel)}) ·{" "}
                      {dateTimeLabel(failure.failedKickoff)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white">Avisos de 1T enviados hoy</h2>
        <p className="mt-1 text-xs text-mist-500">
          Mensajes enviados al Discord. Se quitan cuando el partido termina. Incluye el 1T del
          partido anterior de cada equipo.
        </p>
        {sentAlerts.length === 0 ? (
          <p className="mt-2 text-xs text-mist-400">No hay avisos de 1T activos hoy.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {sentAlerts.map((alert) => {
              const homeLabel = sentLabels.get(alert.homeTeam);
              const awayLabel = sentLabels.get(alert.awayTeam);
              const kinds = alert.kinds
                .map((kind) =>
                  kind === "first-half-startup"
                    ? "inicio del día"
                    : kind === "first-half-pre30"
                      ? "30 min"
                      : kind === "first-half-pre10"
                        ? "10 min"
                        : kind,
                )
                .join(" · ");

              return (
                <div key={alert.matchId} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[11px] text-mist-500">
                      <LeagueTag code={alert.leagueCode} logo={leagueLogos.get(alert.leagueCode)} />
                      <span>{dateTimeLabel(alert.kickoff)}</span>
                    </div>
                    <Link
                      href={`/partido/${alert.matchId}`}
                      className="text-[11px] text-mint-400 transition hover:underline"
                    >
                      Ver partido →
                    </Link>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-white">
                      {displayTeam(alert.homeTeam)} <span className="text-mist-500">vs</span>{" "}
                      {displayTeam(alert.awayTeam)}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-mist-500">
                        Modelo 1T +0.5
                      </div>
                      <div className="text-lg font-semibold text-mint-400">
                        {alert.model === null ? "—" : pct(alert.model)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-1 text-[11px] text-mist-500">
                    Aviso: {kinds} · enviado {dateTimeLabel(alert.sentAt)}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    {[
                      { team: alert.homeTeam, label: homeLabel },
                      { team: alert.awayTeam, label: awayLabel },
                    ].map(({ team, label }) => {
                      const zero = label?.lastHT === 0;
                      const streak = label?.streak === true;
                      return (
                        <span
                          key={team}
                          className={`rounded-lg border px-2 py-1 ${
                            zero
                              ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                              : streak
                                ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                                : "border-ink-700 bg-ink-850 text-mist-400"
                          }`}
                        >
                          {displayTeam(team)}:{" "}
                          {zero
                            ? "último 1T 0-0"
                            : streak && label
                              ? `${label.over} de ${label.total} con gol en 1T (${Math.round(label.rate * 100)}%)`
                              : !label || label.lastHT === null
                                ? "sin datos de 1T"
                                : `último 1T con gol (${label.lastHT})`}
                          {!streak && label ? ` · racha ${label.over}/${label.total}` : ""}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {omitted.length > 0 ? (
          <p className="mt-2 text-[11px] leading-relaxed text-rose-400/90">
            No enviados por observación:{" "}
            {omitted
              .map(
                (row) =>
                  `${displayTeam(row.homeTeam)} vs ${displayTeam(row.awayTeam)} (${row.alerts
                    .map((alert) => `${displayTeam(alert.team)} ${alert.over}/${alert.total}`)
                    .join(", ")})`,
              )
              .join(" · ")}
            . Están en la observación de arriba.
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-sm text-mist-400">
          No hay equipos en observación con estos criterios.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.matchId} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[11px] text-mist-500">
                  <LeagueTag code={row.leagueCode} logo={leagueLogos.get(row.leagueCode)} />
                  <span>{dateTimeLabel(row.kickoff)}</span>
                </div>
                <Link
                  href={`/partido/${row.matchId}`}
                  className="text-[11px] text-mint-400 transition hover:underline"
                >
                  Ver partido →
                </Link>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-white">
                  {displayTeam(row.homeTeam)}{" "}
                  <span className="text-mist-500">vs</span> {displayTeam(row.awayTeam)}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-mist-500">
                    Modelo 1T +0.5
                  </div>
                  <div className="text-lg font-semibold text-mint-400">{pct(row.model)}</div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {row.alerts.map((alert) => (
                  <span
                    key={alert.team}
                    className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[10px] text-rose-300"
                  >
                    {displayTeam(alert.team)}: {alert.over} de {alert.total} con gol en 1T (
                    {Math.round((alert.over / alert.total) * 100)}%)
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white">Fallos de 1T de hoy</h2>
        <p className="mt-1 text-xs text-mist-500">
          Partidos de hoy con 70% o más del modelo que terminaron 0-0 al descanso.
        </p>
        {todaysFailures.length === 0 ? (
          <p className="mt-2 text-xs text-mist-400">No hay fallos de 1T hoy.</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {todaysFailures.map((row) => (
              <div key={row.matchId} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] text-mist-500">
                    <LeagueTag code={row.leagueCode} logo={leagueLogos.get(row.leagueCode)} />
                    <span>{dateTimeLabel(row.kickoff)}</span>
                  </div>
                  <span className="rounded bg-rose-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-400 ring-1 ring-rose-400/30">
                    0-0 al descanso
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-white">
                    {displayTeam(row.homeTeam)} <span className="text-mist-500">vs</span>{" "}
                    {displayTeam(row.awayTeam)}
                  </div>
                  <Link
                    href={`/partido/${row.matchId}`}
                    className="text-[11px] text-mint-400 transition hover:underline"
                  >
                    Ver partido →
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-mist-400">
                    Modelo: {pct(row.model)}
                  </span>
                  <span className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-rose-300">
                    {displayTeam(row.homeTeam)}: {row.homeRate.over}/{row.homeRate.total} con gol en
                    1T
                  </span>
                  <span className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-rose-300">
                    {displayTeam(row.awayTeam)}: {row.awayRate.over}/{row.awayRate.total} con gol en
                    1T
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
