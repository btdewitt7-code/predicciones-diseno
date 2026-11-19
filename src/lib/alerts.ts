import type { HomeAlert } from "@/components/home-alerts";
import { displayTeam } from "./display";
import { dayLabel, pct, timeOf } from "./format";
import type { ConfirmedLineupMatch, RatedMatch } from "./queries";
import { findValue, type MarketOddsRow } from "./value";
import { isHtVetoed } from "./veto";

export const MAX_ALERTS = 5;

/** Partidos que aún cuentan: desde 30 minutos antes del pitido. */
export function alertCandidates(matches: RatedMatch[]): RatedMatch[] {
  const now = Date.now();
  return matches.filter((match) => Date.parse(`${match.kickoff}Z`) >= now - 30 * 60_000);
}

function versus(match: { home_team: string; away_team: string }) {
  return `${displayTeam(match.home_team)} vs ${displayTeam(match.away_team)}`;
}

function slotLabel(kickoff: string) {
  return `${dayLabel(kickoff)} · ${timeOf(kickoff)}`;
}

/**
 * Alertas del panel: Value → 1T → XI confirmada → probabilidad alta.
 * Nunca repite el mismo partido.
 */
export function buildHomeAlerts({
  matches,
  marketOdds,
  confirmedLineups,
  htVetoed,
}: {
  matches: RatedMatch[];
  marketOdds: MarketOddsRow[];
  confirmedLineups: ConfirmedLineupMatch[];
  htVetoed: Set<string>;
}): { alerts: HomeAlert[]; valueCount: number } {
  const candidates = alertCandidates(matches);
  const valuePicks = findValue(candidates, marketOdds, {
    minEdge: 0.06,
    minProb: 0.6,
    maxOdds: 6,
  });
  const valueCount = valuePicks.length;

  const alerts: HomeAlert[] = [];
  const alertedMatchIds = new Set<number>();

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

  const firstHalf = candidates
    .filter(
      (match) =>
        match.prediction &&
        match.prediction.ht_over05 >= 0.7 &&
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
    if (alerts.length >= MAX_ALERTS) break;
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

  if (alerts.length < MAX_ALERTS) {
    const highProbability = candidates
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
      .slice(0, MAX_ALERTS - alerts.length);

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

  return { alerts, valueCount };
}
