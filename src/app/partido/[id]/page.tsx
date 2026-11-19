import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getGoalEvents,
  getHeadToHead,
  getLeagueLogoMap,
  getTeamLogoMap,
  getInjuries,
  getMatch,
  getRefereeStats,
  getTeamFlags,
  getTeamForm,
  getTeamLeagueSnapshot,
  getTeamUsage,
  getLineups,
  getLineupRotation,
  getLineupAdjustment,
  getFirstHalfGoalHistory,
  getStandings,
  getTeamCardSample,
  getTeamStatSample,
  getLeagueAverages,
  getTieContext,
} from "@/lib/queries";
import { getMeta } from "@/lib/db";
import { computeAbsenceFactors } from "@/lib/absences";
import { pickSide, teamSimilarity } from "@/lib/teamMatch";
import { LEAGUE_BY_CODE } from "@/lib/leagues";
import { dateShort, dateTimeLabel, dayKey, fairProbabilities, fullDate, num, pct, timeOf } from "@/lib/format";
import { MatchTabs } from "@/components/match-tabs";
import { StandingsPanel } from "@/components/standings-panel";
import { LeagueTag, ResultChip, TeamBadge } from "@/components/ui";
import { LiveAutoRefresh } from "@/components/live-auto-refresh";
import { GoalFlash } from "@/components/goal-flash";
import { PlayerCardLeaders, PlayerShotLeaders } from "@/components/player-shot-leaders";
import { AddToSlipButton } from "@/components/add-to-slip-button";
import { SaveComboButton } from "@/components/save-combo-button";
import { comboHash, loadSavedCombos } from "@/lib/comboStore";
import { currentUser } from "@/lib/session";
import { buildRecommendations } from "@/lib/recommendations";
import { getHtVetoedSet, getVetoedSet, isVetoed } from "@/lib/veto";
import type { MatchRow, TeamLeagueSnapshot } from "@/lib/queries";
import { displayTeam } from "@/lib/display";

function pctDelta(value: number): string {
  const delta = Math.round((value - 1) * 100);
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

type CornerForm = {
  rows: {
    id: number;
    opponent: string;
    isHome: boolean;
    own: number;
    opp: number;
    total: number;
  }[];
  average: number | null;
};

function cornerForm(games: MatchRow[], team: string): CornerForm {
  const rows = games
    .filter((game) => game.home_corners !== null && game.away_corners !== null)
    .slice(0, 8)
    .map((game) => {
      const isHome = game.home_team === team;
      const own = Number(isHome ? game.home_corners : game.away_corners);
      const opp = Number(isHome ? game.away_corners : game.home_corners);
      return {
        id: game.id,
        opponent: isHome ? game.away_team : game.home_team,
        isHome,
        own,
        opp,
        total: own + opp,
      };
    });
  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.total, 0) / rows.length
    : null;
  return { rows, average };
}

type CardRow = CornerForm["rows"][number] & {
  ownYellow: number;
  oppYellow: number;
  ownRed: number;
  oppRed: number;
};
type CardForm = { rows: CardRow[]; average: number | null };

function cardForm(games: MatchRow[], team: string): CardForm {
  const rows = games
    .filter((game) => game.home_yellow !== null && game.away_yellow !== null)
    .slice(0, 8)
    .map((game) => {
      const isHome = game.home_team === team;
      const ownYellow = Number(isHome ? game.home_yellow : game.away_yellow);
      const oppYellow = Number(isHome ? game.away_yellow : game.home_yellow);
      const ownRed = Number(isHome ? (game.home_red ?? 0) : (game.away_red ?? 0));
      const oppRed = Number(isHome ? (game.away_red ?? 0) : (game.home_red ?? 0));
      const own = ownYellow + ownRed;
      const opp = oppYellow + oppRed;
      return {
        id: game.id,
        opponent: isHome ? game.away_team : game.home_team,
        isHome,
        own,
        opp,
        total: own + opp,
        ownYellow,
        oppYellow,
        ownRed,
        oppRed,
      };
    });
  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.total, 0) / rows.length
    : null;
  return { rows, average };
}

type FoulForm = {
  rows: CornerForm["rows"];
  averageOwn: number | null;
  averageTotal: number | null;
};

function foulForm(games: MatchRow[], team: string): FoulForm {
  const rows = games
    .filter((game) => game.home_fouls !== null && game.away_fouls !== null)
    .slice(0, 8)
    .map((game) => {
      const isHome = game.home_team === team;
      const own = Number(isHome ? game.home_fouls : game.away_fouls);
      const opp = Number(isHome ? game.away_fouls : game.home_fouls);
      return {
        id: game.id,
        opponent: isHome ? game.away_team : game.home_team,
        isHome,
        own,
        opp,
        total: own + opp,
      };
    });
  const averageOwn = rows.length
    ? rows.reduce((sum, row) => sum + row.own, 0) / rows.length
    : null;
  const averageTotal = rows.length
    ? rows.reduce((sum, row) => sum + row.total, 0) / rows.length
    : null;
  return { rows, averageOwn, averageTotal };
}

function shotsForm(games: MatchRow[], team: string): CornerForm {
  const rows = games
    .filter((game) => game.home_shots !== null && game.away_shots !== null)
    .slice(0, 8)
    .map((game) => {
      const isHome = game.home_team === team;
      const own = Number(isHome ? game.home_shots : game.away_shots);
      const opp = Number(isHome ? game.away_shots : game.home_shots);
      return {
        id: game.id,
        opponent: isHome ? game.away_team : game.home_team,
        isHome,
        own,
        opp,
        total: own + opp,
      };
    });
  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.total, 0) / rows.length
    : null;
  return { rows, average };
}

function sotForm(games: MatchRow[], team: string): CornerForm {
  const rows = games
    .filter((game) => game.home_sot !== null && game.away_sot !== null)
    .slice(0, 8)
    .map((game) => {
      const isHome = game.home_team === team;
      const own = Number(isHome ? game.home_sot : game.away_sot);
      const opp = Number(isHome ? game.away_sot : game.home_sot);
      return {
        id: game.id,
        opponent: isHome ? game.away_team : game.home_team,
        isHome,
        own,
        opp,
        total: own + opp,
      };
    });
  const average = rows.length
    ? rows.reduce((sum, row) => sum + row.total, 0) / rows.length
    : null;
  return { rows, average };
}

function RecentCountCard({
  panel,
  title,
  subtitle,
  homeTeam,
  awayTeam,
  home,
  away,
  emptyLabel,
}: {
  panel: "corners" | "tiros" | "tarjetas";
  title: string;
  subtitle: string;
  homeTeam: string;
  awayTeam: string;
  home: CornerForm;
  away: CornerForm;
  emptyLabel: string;
}) {
  return (
    <div className="card p-5" data-match-panel={panel}>
      <h2 className="mb-1 text-ui-card-title font-semibold text-white">{title}</h2>
      <p className="mb-3 text-[13px] text-mist-500">{subtitle}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {[
          { team: homeTeam, data: home },
          { team: awayTeam, data: away },
        ].map(({ team, data }) => (
          <div key={team} className="rounded-lg border border-ink-800 bg-ink-850/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-mist-300">{team}</span>
              <span className="shrink-0 text-[12px] text-mist-500">
                {data.average === null ? "sin datos" : `prom. ${data.average.toFixed(1)}`}
              </span>
            </div>
            {data.rows.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {data.rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-mist-500">
                      {row.isHome ? "vs" : "@"} {displayTeam(row.opponent)}
                    </span>
                    <span className="tabular-nums text-mist-400">
                      {row.own}-{row.opp}
                    </span>
                    <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-mist-300">
                      {row.total}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-mist-500">{emptyLabel}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

function injuryLabel(category: string): string {
  if (category === "injury") return "Lesión";
  if (category === "suspension") return "Sanción";
  if (category === "doubt") return "Duda";  return "Baja";
}

function injuryClass(category: string): string {
  if (category === "injury") return "bg-rose-400/10 text-rose-400 ring-rose-400/30";
  if (category === "suspension") return "bg-amber-400/10 text-amber-400 ring-amber-400/30";
  return "bg-ink-800 text-mist-400 ring-ink-700";
}

function MarketBar({ label, value }: { label: string; value: number }) {
  const over = Math.min(1, Math.max(0, value));
  const under = 1 - over;
  return (
    <div className="grid grid-cols-[90px_1fr_96px] items-center gap-3">
      <span className="text-[11px] text-mist-300">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full rounded-full bg-win-400/80" style={{ width: `${over * 100}%` }} />
      </div>
      <span className="text-right text-[11px] tabular-nums">
        <span className="font-semibold text-white">{pct(over)}</span>
        <span className="text-mist-500"> / {pct(under)}</span>
      </span>
    </div>
  );
}

function Expected({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? "border-win-500/30 bg-win-500/5" : "border-ink-700 bg-ink-850"
      }`}
    >
      <div className="text-[9.5px] uppercase tracking-wide text-mist-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          highlight ? "text-win-400" : "text-white"
        }`}
      >
        {num(value)}
        {unit ? <span className="ml-1 text-[11px] font-normal text-mist-500">{unit}</span> : null}
      </div>
    </div>
  );
}

function FormStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-ink-800/40 pb-0.5">
      <span className="text-mist-500">{label}</span>
      <span className={`tabular-nums ${tone ?? "text-mist-200"}`}>{value}</span>
    </div>
  );
}

function SummaryIcon({
  kind,
}: {
  kind: "over15" | "over25" | "btts" | "xg" | "cards" | "corners" | "shots" | "sot";
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-4 shrink-0 text-mint-500 sm:size-[18px]",
  };
  if (kind === "cards") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 sm:size-[18px]">
        <rect x="7" y="4" width="7" height="12" rx="1.3" fill="#fbbf24" transform="rotate(-9 10 10)" />
        <rect x="11" y="7" width="7" height="12" rx="1.3" fill="#fb7185" transform="rotate(7 14 13)" />
      </svg>
    );
  }
  if (kind === "corners") {
    return (
      <svg {...common}>
        <path d="M6 21V4" />
        <path d="M6 5h9l-2 3 2 3H6" />
      </svg>
    );
  }
  if (kind === "btts") {
    return (
      <svg {...common}>
        <path d="M4 12h16M12 4v16" />
      </svg>
    );
  }
  if (kind === "xg") {
    return (
      <svg {...common}>
        <path d="M3 17l5-5 4 3 6-7" />
        <path d="M15 8h4v4" />
      </svg>
    );
  }
  if (kind === "sot") {
    return (
      <svg {...common}>
        <rect x="4" y="6" width="16" height="12" rx="1.5" />
        <path d="M8 6v12M12 6v12M16 6v12M4 10h16M4 14h16" />
      </svg>
    );
  }
  if (kind === "shots") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l3.2 2.3-1.2 3.8h-4L8.8 9.3 12 7z" />
    </svg>
  );
}

const SUMMARY_ICONS: Record<string, string> = {
  over15: "/summary/over15.png",
  over25: "/summary/over25.png",
  btts: "/summary/btts.png",
  xg: "/summary/xg.png",
  cards: "/summary/cards.png",
  corners: "/summary/corners.png",
  shots: "/summary/shots.png",
  sot: "/summary/sot.png",
};

function SummaryCard({
  label,
  value,
  bar,
  left,
  right,
  kind,
}: {
  label: string;
  value: string;
  bar: number;
  left: string;
  right: string;
  kind: "over15" | "over25" | "btts" | "xg" | "cards" | "corners" | "shots" | "sot";
}) {
  const icon = SUMMARY_ICONS[kind];
  return (
    <div className="card flex h-full flex-col p-2.5 sm:p-4">
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-tight text-mist-300 sm:gap-2 sm:text-xs">
          {icon ? (
            <img
              src={icon}
              alt=""
              width={24}
              height={24}
              loading="lazy"
              decoding="async"
              className="size-5 shrink-0 object-contain sm:size-6"
            />
          ) : (
            <SummaryIcon kind={kind} />
          )}
          <span className="min-w-0">{label}</span>
        </div>
        <span className="shrink-0 text-[18px] font-semibold tabular-nums text-white sm:text-[22px]">
          {value}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800 sm:mt-3">
        <div
          className="h-full rounded-full bg-win-400/80"
          style={{ width: `${Math.max(0, Math.min(100, bar))}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-ui-body-sm text-mist-500 sm:mt-2">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function MatchProbBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-ink-800">
        <div className="bg-win-400" style={{ width: `${home * 100}%` }} />
        <div className="bg-[#b4a89b]" style={{ width: `${draw * 100}%` }} />
        <div className="bg-win-400" style={{ width: `${away * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums">
        <span className="text-win-400">{pct(home)}</span>
        <span className="text-mist-500">{pct(draw)}</span>
        <span className="text-win-400">{pct(away)}</span>
      </div>
    </div>
  );
}

function formStats(matches: MatchRow[], team: string) {
  if (matches.length === 0) return null;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let corners = 0;
  let cornersN = 0;
  let sot = 0;
  let sotN = 0;
  let shots = 0;
  let shotsN = 0;
  let cards = 0;
  let cardsN = 0;
  let reds = 0;
  let redsN = 0;
  let scoredCount = 0;
  let concededCount = 0;

  for (const match of matches) {
    const isHome = match.home_team === team;
    const scored = (isHome ? match.home_goals : match.away_goals) ?? 0;
    const conceded = (isHome ? match.away_goals : match.home_goals) ?? 0;
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > 0) scoredCount++;
    if (conceded > 0) concededCount++;

    const matchCorners = isHome ? match.home_corners : match.away_corners;
    if (matchCorners !== null) {
      corners += matchCorners;
      cornersN++;
    }
    const matchSot = isHome ? match.home_sot : match.away_sot;
    if (matchSot !== null) {
      sot += matchSot;
      sotN++;
    }
    const matchShots = isHome ? match.home_shots : match.away_shots;
    if (matchShots !== null) {
      shots += matchShots;
      shotsN++;
    }
    const matchYellow = isHome ? match.home_yellow : match.away_yellow;
    if (matchYellow !== null) {
      cards += matchYellow;
      cardsN++;
    }
    const matchRed = isHome ? match.home_red : match.away_red;
    if (matchRed !== null) {
      reds += matchRed;
      redsN++;
    }
  }

  return {
    goalsFor: goalsFor / matches.length,
    goalsAgainst: goalsAgainst / matches.length,
    goalsForTotal: goalsFor,
    goalsAgainstTotal: goalsAgainst,
    corners: cornersN > 0 ? corners / cornersN : null,
    cornersTotal: corners,
    sot: sotN > 0 ? sot / sotN : null,
    sotTotal: sot,
    shots: shotsN > 0 ? shots / shotsN : null,
    shotsTotal: shots,
    cards: cardsN > 0 ? cards / cardsN : null,
    cardsTotal: cards,
    reds: redsN > 0 ? reds / redsN : null,
    redsTotal: reds,
    scoredCount,
    concededCount,
    total: matches.length,
  };
}

function FormStrip({
  matches,
  team,
  align = "center",
}: {
  matches: MatchRow[];
  team: string;
  align?: "center" | "start";
}) {
  if (matches.length === 0) {
    return <span className="text-xs text-mist-500">Sin partidos previos</span>;
  }
  return (
    <div
      className={`flex flex-wrap gap-1 sm:gap-1.5 ${
        align === "start" ? "justify-start" : "justify-center"
      }`}
    >
      {matches.map((m) => {
        const isHome = m.home_team === team;
        const scored = isHome ? m.home_goals ?? 0 : m.away_goals ?? 0;
        const conceded = isHome ? m.away_goals ?? 0 : m.home_goals ?? 0;
        const result = scored > conceded ? "W" : scored === conceded ? "D" : "L";
        return <ResultChip key={m.id} result={result} />;
      })}
    </div>
  );
}

function LeagueFormBlock({
  team,
  leagueCode,
  snapshot,
  matches,
  logo,
}: {
  team: string;
  leagueCode: string;
  snapshot: TeamLeagueSnapshot;
  matches: MatchRow[];
  logo?: string | null;
}) {
  const stats = formStats(matches, team);
  const leagueName = LEAGUE_BY_CODE[leagueCode]?.name ?? leagueCode;

  return (
    <div className="space-y-1.5 border-b border-ink-800/60 pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TeamBadge name={displayTeam(team)} size={22} logo={logo} plain />
          <span className="truncate text-xs text-mist-300">
            {team} · {leagueName}
          </span>
        </div>
        <span className="text-[11px] text-mist-500">
          {snapshot.position}º de {snapshot.teams} · {snapshot.points} pts en {snapshot.played}
        </span>
      </div>

      <div className="flex justify-end">
        <FormStrip matches={matches} team={team} align="start" />
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-8 text-[12px]">
          <FormStat
            label="Goles a favor"
            value={`${num(stats.goalsFor)} (${stats.goalsForTotal})`}
          />
          <FormStat
            label="Goles en contra"
            value={`${num(stats.goalsAgainst)} (${stats.goalsAgainstTotal})`}
          />
          <FormStat
            label="Anotó"
            value={`${stats.scoredCount} de ${stats.total}`}
            tone="text-win-400"
          />
          <FormStat
            label="Le marcaron"
            value={`${stats.concededCount} de ${stats.total}`}
            tone="text-rose-400"
          />
          {stats.corners !== null ? (
            <FormStat label="Córners" value={num(stats.corners)} />
          ) : null}
          {stats.sot !== null ? (
            <FormStat label="Tiros al arco" value={num(stats.sot)} />
          ) : null}
          {stats.shots !== null ? (
            <FormStat label="Remates" value={num(stats.shots)} />
          ) : null}
          {stats.cards !== null ? (
            <FormStat label="Tarjetas" value={num(stats.cards)} />
          ) : null}
        </div>
      ) : null}

      {matches.length > 0 ? (
        <details className="text-[11px]" suppressHydrationWarning>
          <summary className="cursor-pointer select-none list-none text-mint-400 transition hover:text-mint-300 [&::-webkit-details-marker]:hidden">
            Ver últimos {matches.length} partidos <span className="ml-1 text-[9px]">▾</span>
          </summary>
          <ul className="mt-1.5 space-y-1">
            {matches.map((recent) => {
              const atHome = recent.home_team === team;
              const scored = (atHome ? recent.home_goals : recent.away_goals) ?? 0;
              const conceded = (atHome ? recent.away_goals : recent.home_goals) ?? 0;
              const opponent = atHome ? recent.away_team : recent.home_team;
              const outcome = scored > conceded ? "G" : scored < conceded ? "P" : "E";
              const tone =
                outcome === "G"
                  ? "bg-win-500/15 text-win-400 ring-win-500/30"
                  : outcome === "P"
                    ? "bg-rose-400/10 text-rose-400 ring-rose-400/30"
                    : "bg-ink-800 text-mist-400 ring-ink-700";
              const corners = atHome
                ? [recent.home_corners, recent.away_corners]
                : [recent.away_corners, recent.home_corners];
              const sot = atHome
                ? [recent.home_sot, recent.away_sot]
                : [recent.away_sot, recent.home_sot];
              const shots = atHome
                ? [recent.home_shots, recent.away_shots]
                : [recent.away_shots, recent.home_shots];
              return (
                <li key={recent.id} className="py-0.5">
                  <div className="flex items-center gap-2 text-mist-500">
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded text-[9px] font-semibold ring-1 ${tone}`}
                    >
                      {outcome}
                    </span>
                    <span className="w-3 shrink-0 text-mist-500/70">{atHome ? "L" : "V"}</span>
                    <span className="min-w-0 flex-1 truncate text-mist-400">{opponent}</span>
                    <span className="shrink-0 tabular-nums text-mist-200">
                      {scored}-{conceded}
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-mist-500/80">
                      {dateShort(recent.kickoff)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 pl-6 text-[9px] text-mist-500/80">
                    {corners[0] !== null && corners[1] !== null ? (
                      <span>
                        Córners <span className="text-mist-400">{corners[0]}-{corners[1]}</span>
                      </span>
                    ) : null}
                    {sot[0] !== null && sot[1] !== null ? (
                      <span>
                        Al arco <span className="text-mist-400">{sot[0]}-{sot[1]}</span>
                      </span>
                    ) : null}
                    {shots[0] !== null && shots[1] !== null ? (
                      <span>
                        Remates <span className="text-mist-400">{shots[0]}-{shots[1]}</span>
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const data = await getMatch(numericId);
  if (!data) notFound();

  const { match, prediction: modelPrediction, cupPrediction, live } = data;
  const prediction = modelPrediction ?? cupPrediction;
  const league = LEAGUE_BY_CODE[match.league_code];
  const isCup = Boolean(league?.noModel);
  const homeDisplay = displayTeam(match.home_team);
  const awayDisplay = displayTeam(match.away_team);
  const user = await currentUser();

  const [homeForm, awayForm, homeRecent8, awayRecent8, h2h, flags, refereeStats, injuries, injuriesAt, injuriesDates, goals, vetoed, htVetoed, saved, homeLeague, awayLeague, homeUsage, awayUsage, lineups, lineupAdjustment, homeHalfHistory, awayHalfHistory, standings, tie] =
    await Promise.all([
      getTeamForm(match.league_code, match.home_team, match.kickoff, league?.noModel ? 10 : 5),
      getTeamForm(match.league_code, match.away_team, match.kickoff, league?.noModel ? 10 : 5),
      getTeamForm(match.league_code, match.home_team, match.kickoff, 8),
      getTeamForm(match.league_code, match.away_team, match.kickoff, 8),
      getHeadToHead(match.league_code, match.home_team, match.away_team, match.kickoff, 5),
      getTeamFlags(match.league_code, [match.home_team, match.away_team]),
      getRefereeStats(match.league_code, match.referee ?? ""),
      getInjuries(match.id),
      getMeta("injuries_at"),
      getMeta("injuries_dates"),
      getGoalEvents(match.id),
      getVetoedSet(),
      getHtVetoedSet(),
      loadSavedCombos(7, user?.id ?? null),
      league?.noModel ? getTeamLeagueSnapshot(match.home_team) : Promise.resolve(null),
      league?.noModel ? getTeamLeagueSnapshot(match.away_team) : Promise.resolve(null),
      getTeamUsage(match.home_team),
      getTeamUsage(match.away_team),
      getLineups(match.id),
      getLineupAdjustment(match.id),
      getFirstHalfGoalHistory(match.home_team, match.kickoff, 5),
      getFirstHalfGoalHistory(match.away_team, match.kickoff, 5),
      getStandings(isCup ? match.league_code : ""),
      isCup ? getTieContext(match) : Promise.resolve(null),
    ]);

  const lineupRotation = await getLineupRotation(match, lineups);

  const tieHome = match.home_team;
  const tieAway = match.away_team;
  const homeCornerForm = cornerForm(homeRecent8, match.home_team);
  const awayCornerForm = cornerForm(awayRecent8, match.away_team);
  const homeCardForm = cardForm(homeRecent8, match.home_team);
  const awayCardForm = cardForm(awayRecent8, match.away_team);
  const homeFoulForm = foulForm(homeRecent8, match.home_team);
  const awayFoulForm = foulForm(awayRecent8, match.away_team);
  const homeShotsForm = shotsForm(homeRecent8, match.home_team);
  const awayShotsForm = shotsForm(awayRecent8, match.away_team);
  const homeSotForm = sotForm(homeRecent8, match.home_team);
  const awaySotForm = sotForm(awayRecent8, match.away_team);
  const legGoals = (leg: MatchRow | null, team: string): number | null => {
    if (!leg) return null;
    if (leg.id === match.id) {
      if (leg.status === "played" && leg.home_goals !== null && leg.away_goals !== null) {
        return leg.home_team === team ? leg.home_goals : leg.away_goals;
      }
      if (live) return leg.home_team === team ? live.home : live.away;
      return null;
    }
    if (leg.status === "played" && leg.home_goals !== null && leg.away_goals !== null) {
      return leg.home_team === team ? leg.home_goals : leg.away_goals;
    }
    return null;
  };
  const firstHome = tie ? legGoals(tie.firstLeg, tieHome) : null;
  const firstAway = tie ? legGoals(tie.firstLeg, tieAway) : null;
  const secondHome = tie ? legGoals(tie.secondLeg, tieHome) : null;
  const secondAway = tie ? legGoals(tie.secondLeg, tieAway) : null;
  const aggregateHome = (firstHome ?? 0) + (secondHome ?? 0);
  const aggregateAway = (firstAway ?? 0) + (secondAway ?? 0);
  const currentIsSecond = tie ? match.id === tie.secondLeg.id : false;

  const [
    homeCardSample,
    awayCardSample,
    homeCornersSample,
    awayCornersSample,
    homeSotSample,
    awaySotSample,
    homeGoalsSample,
    awayGoalsSample,
  ] = isCup
    ? await Promise.all([
        getTeamCardSample(
          match.home_team,
          match.kickoff,
          10,
          homeLeague?.leagueCode ?? null,
        ),
        getTeamCardSample(
          match.away_team,
          match.kickoff,
          10,
          awayLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.home_team,
          match.kickoff,
          "corners",
          10,
          homeLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.away_team,
          match.kickoff,
          "corners",
          10,
          awayLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.home_team,
          match.kickoff,
          "sot",
          10,
          homeLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.away_team,
          match.kickoff,
          "sot",
          10,
          awayLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.home_team,
          match.kickoff,
          "goals",
          10,
          homeLeague?.leagueCode ?? null,
        ),
        getTeamStatSample(
          match.away_team,
          match.kickoff,
          "goals",
          10,
          awayLeague?.leagueCode ?? null,
        ),
      ])
    : [null, null, null, null, null, null, null, null];

  const savedHashes = new Set(saved.map((item) => item.hash));
  const leagueAverages = modelPrediction ? await getLeagueAverages(match.league_code) : null;
  const leagueLabel = (value: string) => (leagueAverages ? `Media liga: ${value}` : "");

  const homeLeagueForm = homeLeague
    ? await getTeamForm(homeLeague.leagueCode, homeLeague.team, match.kickoff, 5)
    : [];
  const awayLeagueForm = awayLeague
    ? await getTeamForm(awayLeague.leagueCode, awayLeague.team, match.kickoff, 5)
    : [];

  const [teamLogos, leagueLogos] = await Promise.all([getTeamLogoMap(), getLeagueLogoMap()]);
  const homeLogo = teamLogos.get(`${match.league_code}:${match.home_team}`);
  const awayLogo = teamLogos.get(`${match.league_code}:${match.away_team}`);

  let hasInjuryCoverage = false;
  if (injuriesDates) {
    try {
      const covered = JSON.parse(injuriesDates) as string[];
      hasInjuryCoverage = covered.includes(match.kickoff.slice(0, 10));
    } catch {
      hasInjuryCoverage = false;
    }
  }

  // Impacto estimado de las bajas, con la misma lógica que usa el modelo.
  const absenceInputs = injuries.map((injury) => ({
    matchId: match.id,
    side: injury.side === "away" ? ("away" as const) : ("home" as const),
    player: injury.player,
    category: injury.category,
  }));
  const homeAbsence = computeAbsenceFactors(
    absenceInputs.filter((absence) => absence.side === "home"),
    homeUsage,
  );
  const awayAbsence = computeAbsenceFactors(
    absenceInputs.filter((absence) => absence.side === "away"),
    awayUsage,
  );

  // Recalculamos el lado comparando el nombre real del equipo (más fiable que lo guardado).
  const goalsWithSide = goals.map((goal) => ({
    ...goal,
    side: pickSide(goal.team, match.home_team, match.away_team),
  }));

  const kickoffMs = Date.parse(`${match.kickoff}Z`);
  const elapsed = Date.now() - kickoffMs;
  const isLive = match.status !== "played" && elapsed >= 0 && elapsed < 2.25 * 3600_000;
  const isPending = match.status !== "played" && elapsed >= 2.25 * 3600_000;

  const market = fairProbabilities(match.close_home ?? match.odds_home, match.close_draw ?? match.odds_draw, match.close_away ?? match.odds_away);

  const edges = modelPrediction && market
    ? [modelPrediction.home_win - market[0], modelPrediction.draw - market[1], modelPrediction.away_win - market[2]]
    : null;

  const recommendations =
    prediction && match.status !== "played"
      ? buildRecommendations(match, prediction, vetoed, htVetoed, Boolean(isCup))
      : [];

  const lastGoals = (form: MatchRow[], team: string, limit: number) =>
    form
      .slice(0, limit)
      .map((item) => (item.home_team === team ? (item.home_goals ?? 0) : (item.away_goals ?? 0)));
  const UCL_FORM_MATCHES = 4;
  const uclHomeLast = match.league_code === "UCL"
    ? lastGoals(homeForm, match.home_team, UCL_FORM_MATCHES)
    : [];
  const uclAwayLast = match.league_code === "UCL"
    ? lastGoals(awayForm, match.away_team, UCL_FORM_MATCHES)
    : [];
  const uclForm =
    match.league_code === "UCL" && uclHomeLast.length > 0
      ? {
          homeMatches: uclHomeLast.length,
          awayMatches: uclAwayLast.length,
          homeGoals: uclHomeLast.reduce((acc, value) => acc + value, 0),
          awayGoals: uclAwayLast.reduce((acc, value) => acc + value, 0),
          homeScored: uclHomeLast.filter((value) => value > 0).length,
          awayScored: uclAwayLast.filter((value) => value > 0).length,
        }
      : null;
  const uclHasSample = Boolean(
    uclForm && uclForm.homeMatches >= UCL_FORM_MATCHES && uclForm.awayMatches >= UCL_FORM_MATCHES,
  );
  const uclAwayInForm = Boolean(
    uclForm && uclHasSample && uclForm.awayGoals >= 4 && uclForm.awayScored >= 3,
  );
  const uclHomeInForm = Boolean(
    uclForm && uclHasSample && uclForm.homeGoals >= 4 && uclForm.homeScored >= 3,
  );
  const displayRecommendations = recommendations.filter((rec) => {
    if (!uclForm) return true;
    if (rec.id === "away_over05" || rec.id === "away_over15") return uclAwayInForm;
    if (rec.id === "btts") return uclHomeInForm && uclAwayInForm;
    return true;
  });
  const formTone = (goals: number, scored: number, matches: number) => {
    const need = Math.ceil(matches * 0.75);
    if (matches > 0 && goals >= 4 && scored >= need) return "text-win-400";
    if (goals >= 2 || scored >= 2) return "text-amber-400";
    return "text-rose-400";
  };

  const homeVetoed = isVetoed(vetoed, match.league_code, match.home_team);
  const awayVetoed = isVetoed(vetoed, match.league_code, match.away_team);

  const matchStarted =
    match.status !== "played" && Date.parse(`${match.kickoff}Z`) <= Date.now();

  const favoriteIsHome = prediction ? prediction.home_win >= prediction.away_win : false;
  const favoriteTeam = favoriteIsHome ? match.home_team : match.away_team;
  const favoriteVetoed = favoriteIsHome ? homeVetoed : awayVetoed;
  const favoriteProb = prediction
    ? favoriteIsHome
      ? prediction.home_win
      : prediction.away_win
    : 0;

  return (
    <div className="space-y-5">
      <LiveAutoRefresh active={isLive} seconds={20} />
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs text-mist-500 transition hover:text-win-400">
          ← Volver a partidos
        </Link>
        <Link
          href={`/?liga=${match.league_code}#liga-${match.league_code}`}
          title="Ver partidos de esta competición"
          className="transition hover:opacity-80"
        >
          <LeagueTag code={match.league_code} logo={leagueLogos.get(match.league_code)} size="md" />
        </Link>
      </div>

      {displayRecommendations.length > 0 ? (
        <details className="card overflow-hidden" suppressHydrationWarning>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-850/60 [&::-webkit-details-marker]:hidden">
            <span>⚡ {isCup ? "Opciones informativas" : "Recomendaciones del partido"}</span>
            <span className="flex items-center gap-2">
              {matchStarted ? (
                <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400">
                  Pre-partido
                </span>
              ) : null}
              <span className="text-[10px] font-normal uppercase tracking-wide text-mist-500">
                {displayRecommendations.length} opciones
              </span>
            </span>
          </summary>
          <div className="space-y-2 border-t border-ink-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 pb-2 text-[11px]">
              <span className="text-mist-500">
                Favorito del modelo
                {favoriteVetoed ? (
                  <span className="ml-1.5 rounded bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-400 ring-1 ring-rose-400/30">
                    No recomendado
                  </span>
                ) : null}
              </span>
              <span className="text-white">
                {favoriteTeam} ·{" "}
                <span className="font-semibold text-win-400">{pct(favoriteProb)}</span>
              </span>
            </div>

            {isCup && uclForm ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-ink-800 pb-2 text-[11px]">
                <span className="text-mist-500">Forma UCL (J1-J4):</span>
                <span className={formTone(uclForm.homeGoals, uclForm.homeScored, uclForm.homeMatches)}>
                  {homeDisplay}{" "}
                  <span className="font-semibold">{uclForm.homeGoals} GF</span> (
                  {uclForm.homeScored}/{uclForm.homeMatches})
                </span>
                <span className="text-mist-500">·</span>
                <span className={formTone(uclForm.awayGoals, uclForm.awayScored, uclForm.awayMatches)}>
                  {awayDisplay}{" "}
                  <span className="font-semibold">{uclForm.awayGoals} GF</span> (
                  {uclForm.awayScored}/{uclForm.awayMatches})
                </span>
                {!uclHasSample ? (
                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    Sin 4 jornadas UCL
                  </span>
                ) : !uclAwayInForm ? (
                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    Forma baja visitante: evitar goles/BTTS
                  </span>
                ) : !uclHomeInForm ? (
                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                    Rival con forma baja: evitar BTTS
                  </span>
                ) : null}
              </div>
            ) : null}

            {isCup ? (
              <p className="text-[11px] leading-relaxed text-amber-300">
                Son alternativas del mismo partido: elegir 1 o 2; todas, no recomendable.
              </p>
            ) : null}

            {displayRecommendations.map((rec) => {
              const labelTone =
                rec.label === "Alternativa"
                  ? "text-amber-400"
                  : rec.label.includes("riesgo")
                    ? "text-rose-400"
                    : "text-win-400";
              const isFirstHalf = rec.combo.legs[0]?.category === "1t";
              return (
                <div
                  key={rec.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850/70 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.12em] ${labelTone}`}
                      >
                        {rec.label}
                      </p>
                      {isFirstHalf ? (
                        <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                          Tíquete aparte
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-sm font-semibold text-white">{rec.market}</p>
                    <p className="mt-0.5 text-[13px] text-mist-400">
                      {pct(rec.probability)} · cuota justa {rec.fairOdds.toFixed(2)}
                      {!isCup && rec.edge !== null ? (
                        <>
                          {" · "}valor{" "}
                          <span className={rec.edge >= 0 ? "text-win-400" : "text-rose-400"}>
                            {(rec.edge * 100).toFixed(1)}%
                          </span>
                        </>
                      ) : null}
                    </p>
                    {!isCup && prediction && rec.combo.legs[0]?.category === "goles" ? (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-mist-500">
                        Rango probable: 0-1 {pct(Math.max(0, 1 - prediction.over15))} · 2-3{" "}
                        {pct(Math.max(0, prediction.over15 - prediction.over35))} · 4+{" "}
                        {pct(Math.max(0, prediction.over35))}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    {isCup ? (
                      <span className="hidden rounded border border-win-400/30 bg-win-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-win-400 sm:inline">
                        Copa
                      </span>
                    ) : null}
                    <AddToSlipButton
                      pick={{
                        key: `${match.id}-${rec.market}`,
                        matchId: match.id,
                        matchLabel: `${match.home_team} vs ${match.away_team}`,
                        leagueCode: match.league_code,
                        kickoff: match.kickoff,
                        market: rec.market,
                        category: rec.combo.legs[0]?.category ?? "goles",
                        rule: rec.combo.legs[0]?.rule ?? { type: "over_goals", line: 1.5 },
                        probability: rec.probability,
                        fairOdds: rec.fairOdds,
                        source: isCup ? "cup" : "model",
                        marketOdds: null,
                      }}
                    />
                    <SaveComboButton
                      combo={rec.combo}
                      initialSaved={savedHashes.has(
                        comboHash(dayKey(rec.combo.legs[0]?.kickoff ?? ""), rec.combo.legs),
                      )}
                    />
                  </div>
                </div>
              );
            })}
            <p className="mt-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[10px] font-medium leading-relaxed text-amber-300">
              Sugerencias informativas, no una garantía. Pulsa Guardar para seguirla en Resultados.
            </p>
            {!isCup && recommendations.some((rec) => rec.combo.legs[0]?.category === "1t") ? (
              <p className="pt-1 text-[13px] leading-relaxed text-amber-300/90">
                El pick de primer tiempo va en tíquete aparte: se resuelve al descanso y no
                conviene mezclarlo con el resto.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}

      <GoalFlash
        home={live ? live.home : (match.home_goals ?? null)}
        away={live ? live.away : (match.away_goals ?? null)}
        sound
      >
        <section className="card match-hero p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-mist-500">
          <span className="flex items-center gap-2">
            <span>{league ? `${league.tag} ${league.name}` : match.league_code}</span>
            {cupPrediction ? (
              <span className="rounded bg-win-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-win-400 ring-1 ring-win-400/30">
                Informativo · modelo de copa
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            {isLive ? (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-amber-400/30">
                En juego
              </span>
            ) : null}
            {isPending ? (
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist-400 ring-1 ring-ink-700">
                Pendiente de resultado
              </span>
            ) : null}
            <span>{fullDate(match.kickoff)}</span>
          </span>
        </div>

        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative grid place-items-center">
              <span className="pointer-events-none absolute inset-[-18px] rounded-full bg-mint-500/25 blur-2xl" />
              <span className="relative z-10 grid place-items-center">
                <TeamBadge
                  name={homeDisplay}
                  size={96}
                  logo={homeLogo}
                  className="h-16 w-16 sm:h-24 sm:w-24"
                />
              </span>
            </div>
            <span className="max-w-full break-words px-1 text-center text-[15px] font-semibold leading-snug text-white sm:text-xl">{homeDisplay}</span>
            <span className="text-[10px] uppercase tracking-wide text-mist-500">Local</span>
            <FormStrip matches={homeForm.slice(0, 5)} team={match.home_team} />
            {homeVetoed ? (
              <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-400 ring-1 ring-rose-400/30">
                Vigilado
              </span>
            ) : null}
            {flags.get(match.home_team) ? (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-amber-400/30">
                Nuevo en la liga
              </span>
            ) : null}
          </div>

          <div className="px-2 text-center" data-goal-score>
            {match.status === "played" ? (
              <div className="text-3xl font-bold tabular-nums text-white">
                {match.home_goals} - {match.away_goals}
              </div>
            ) : live ? (
              <div>
                <div className="text-3xl font-bold tabular-nums text-amber-400">
                  {live.home} - {live.away}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-amber-400/80">
                  {live.clock ?? "En juego"}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-xs uppercase tracking-widest text-mist-500">vs</div>
                <div className="mt-1 rounded-full border border-ink-700 bg-ink-900 px-2.5 py-0.5 text-[10px] text-mist-400">
                  {timeOf(match.kickoff)}
                </div>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-center gap-2">
            <div className="relative grid place-items-center">
              <span className="pointer-events-none absolute inset-[-18px] rounded-full bg-mint-500/25 blur-2xl" />
              <span className="relative z-10 grid place-items-center">
                <TeamBadge
                  name={awayDisplay}
                  size={96}
                  logo={awayLogo}
                  className="h-16 w-16 sm:h-24 sm:w-24"
                />
              </span>
            </div>
            <span className="max-w-full break-words px-1 text-center text-[15px] font-semibold leading-snug text-white sm:text-xl">{awayDisplay}</span>
            <span className="text-[10px] uppercase tracking-wide text-mist-500">Visitante</span>
            <FormStrip matches={awayForm.slice(0, 5)} team={match.away_team} />
            {awayVetoed ? (
              <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-400 ring-1 ring-rose-400/30">
                Vigilado
              </span>
            ) : null}
            {flags.get(match.away_team) ? (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400 ring-1 ring-amber-400/30">
                Nuevo en la liga
              </span>
            ) : null}
          </div>
        </div>

        {prediction ? (
          <div className="mt-6">
            <MatchProbBar home={prediction.home_win} draw={prediction.draw} away={prediction.away_win} />
          </div>
        ) : (
          <p className="mt-6 rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs text-mist-400">
            {league?.noModel
              ? "Esta competición no tiene modelo. Mostramos fixtures, estadísticas y enfrentamientos directos."
              : match.status === "played"
                ? "Partido finalizado. No hay una predicción previa guardada para este partido."
                : (
                    <>
                      Este partido no tiene predicción guardada. Ejecuta{" "}
                      <code className="text-win-400">npm run train</code> para generarla.
                    </>
                  )}
          </p>
        )}
        </section>
      </GoalFlash>

      {isCup && tie ? (
        <section className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Serie a doble partido</h2>
            <span className="text-[10px] uppercase tracking-wide text-mist-500">
              {currentIsSecond ? "Vuelta" : "Ida"}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-mist-500">
                Ida · {dateShort(tie.firstLeg.kickoff)}
              </span>
              <span className="text-mist-300">
                {displayTeam(tie.firstLeg.home_team)}{" "}
                {tie.firstLeg.status === "played" ? tie.firstLeg.home_goals : "-"} -{" "}
                {tie.firstLeg.status === "played" ? tie.firstLeg.away_goals : "-"}{" "}
                {displayTeam(tie.firstLeg.away_team)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
              <span className="text-mist-500">
                {match.status === "played" ? "Global final" : live ? "Global en vivo" : "Global"}
              </span>
              <span className="text-sm font-semibold text-white">
                {displayTeam(tieHome)} {aggregateHome} - {aggregateAway} {displayTeam(tieAway)}
              </span>
            </div>
            {!currentIsSecond && tie.secondLeg.status !== "played" ? (
              <p className="text-[10px] text-mist-500">
                Vuelta: {dateShort(tie.secondLeg.kickoff)}
              </p>
            ) : null}
            {currentIsSecond && aggregateHome === aggregateAway && match.status !== "played" ? (
              <p className="text-[10px] text-amber-400/90">
                Global empatado: si termina así, se juega prórroga y penales.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <MatchTabs
        tabs={
          prediction
            ? [
                { id: "general", label: "General" },
                { id: "goles", label: "Goles" },
                { id: "tiros", label: "Tiros" },
                { id: "corners", label: "Córners" },
                { id: "tarjetas", label: "Tarjetas" },
                { id: "posiciones", label: "Posiciones" },
                { id: "h2h", label: "H2H" },
              ]
            : [
                { id: "general", label: "General" },
                { id: "posiciones", label: "Posiciones" },
                { id: "h2h", label: "H2H" },
              ]
        }
      />

      {goalsWithSide.length > 0 ? (
        <section className="card p-5" data-match-panel="goles">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Goles</h2>
            <span className="text-[10px] text-mist-500">Goleadores y asistencias</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {[
              { side: "home", team: match.home_team },
              { side: "away", team: match.away_team },
            ].map(({ side, team }) => {
              const list = goalsWithSide.filter((goal) => goal.side === side);
              return (
                <div key={side}>
                  <div className="mb-2 flex items-center gap-2 text-xs text-mist-400">
                    <TeamBadge
                      name={displayTeam(team)}
                      size={22}
                      logo={teamLogos.get(`${match.league_code}:${team}`)} plain
                    />
                    <span className="truncate">{displayTeam(team)}</span>
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-mist-500">Sin goles</p>
                  ) : (
                    <ul className="space-y-1">
                      {list.map((goal) => (
                        <li key={`${goal.minute}-${goal.player}`} className="text-xs text-mist-400">
                          <span className="text-white">{goal.player}</span>{" "}
                          <span className="tabular-nums text-mist-500">{goal.minute}</span>
                          {goal.kind === "penalty" ? (
                            <span className="text-mist-500"> (pen)</span>
                          ) : null}
                          {goal.kind === "own" ? (
                            <span className="text-mist-500"> (pp)</span>
                          ) : null}
                          {goal.assist ? (
                            <span className="text-mist-500"> · asist. {goal.assist}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {prediction ? (
        <>
          <section className="grid gap-4">
            <div className="card p-5" data-match-panel="general">
              <h2 className="mb-4 text-ui-card-title font-semibold text-white">Resultado final (1X2)</h2>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Local", value: prediction.home_win, tone: "text-win-400" },
                  { label: "Empate", value: prediction.draw, tone: "text-mist-300" },
                  { label: "Visitante", value: prediction.away_win, tone: "text-mist-400" },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-ink-700 bg-ink-850 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-mist-500">{item.label}</div>
                    <div className={`mt-1 text-2xl font-semibold tabular-nums ${item.tone}`}>
                      {pct(item.value)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-1 text-[11px] text-mist-500">
                <p>
                  Goles esperados:{" "}
                  <span className="text-mist-300">
                    {homeDisplay} {num(prediction.exp_home_goals)} — {num(prediction.exp_away_goals)}{" "}
                    {awayDisplay}
                  </span>
                </p>
                <p>Confianza del modelo: {pct(prediction.confidence)} de datos</p>
              </div>

              {!isCup && market && edges ? (
                <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide text-mist-500">
                      Modelo vs. mercado
                    </span>
                    <span className="text-[10px] text-mist-500">
                      {match.close_home ? "cuota de cierre" : "cuota media"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    {["Local", "Empate", "Visitante"].map((label, index) => {
                      const edge = edges[index];
                      const positive = edge > 0.03;
                      return (
                        <div key={label}>
                          <div className="text-[10px] text-mist-500">{label}</div>
                          <div className={positive ? "font-semibold text-win-400" : "text-mist-400"}>
                            {edge > 0 ? "+" : ""}
                            {(edge * 100).toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-mist-500">
                    Diferencia entre probabilidad del modelo y probabilidad implícita en las cuotas.
                    Positivo = el modelo ve más probable ese resultado de lo que paga el mercado.
                  </p>
                </div>
              ) : !isCup ? (
                <p className="mt-4 text-ui-body-sm text-mist-500">
                  Sin cuotas de mercado para comparar en este partido.
                </p>
              ) : null}
            </div>

            <div className="card p-5" data-match-panel="goles">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Goles y ambos marcan</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Primera cifra: más de / sí. Segunda: menos de / no.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Expected label="Goles local" value={prediction.exp_home_goals} />
                <Expected label="Goles visita" value={prediction.exp_away_goals} />
                <Expected label="Total" value={prediction.exp_home_goals + prediction.exp_away_goals} highlight />
              </div>

              <div className="space-y-2.5">
                <MarketBar label="Más de 1.5" value={prediction.over15} />
                <MarketBar label="Más de 2.5" value={prediction.over25} />
                <MarketBar label="Más de 3.5" value={prediction.over35} />
                <MarketBar label="Ambos marcan" value={prediction.btts} />
              </div>
            </div>

            <div className="card p-5" data-match-panel="goles">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Marcadores más probables</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Los seis resultados exactos con mayor probabilidad.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {JSON.parse(prediction.top_scores).map(
                  (score: { h: number; a: number; p: number }) => (
                    <div
                      key={`${score.h}-${score.a}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5"
                    >
                      <span className="text-sm font-semibold tabular-nums text-white">
                        {score.h}-{score.a}
                      </span>
                      <span className="text-xs tabular-nums text-mist-300">{pct(score.p, 1)}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </section>

          {prediction ? (
            <div data-match-panel="general">
              <h2 className="mb-2 text-ui-card-title font-semibold text-white">Probabilidades clave</h2>
              <section className="grid grid-cols-2 gap-2 sm:gap-3">
                <SummaryCard
                  label="Más de 1.5 goles"
                  value={pct(prediction.over15)}
                  bar={prediction.over15 * 100}
                  left="Modelo"
                  right={leagueLabel(pct(leagueAverages?.over15))}
                  kind="over15"
                />
                <SummaryCard
                  label="Más de 2.5 goles"
                  value={pct(prediction.over25)}
                  bar={prediction.over25 * 100}
                  left="Modelo"
                  right={leagueLabel(pct(leagueAverages?.over25))}
                  kind="over25"
                />
                <SummaryCard
                  label="Ambos marcan"
                  value={pct(prediction.btts)}
                  bar={prediction.btts * 100}
                  left="Modelo"
                  right={leagueLabel(pct(leagueAverages?.btts))}
                  kind="btts"
                />
                <SummaryCard
                  label="Goles esperados"
                  value={num(prediction.exp_home_goals + prediction.exp_away_goals, 2)}
                  bar={((prediction.exp_home_goals + prediction.exp_away_goals) / 4) * 100}
                  left={`${num(prediction.exp_home_goals, 2)} + ${num(prediction.exp_away_goals, 2)}`}
                  right={leagueLabel(num(leagueAverages?.goals, 2))}
                  kind="xg"
                />
                <SummaryCard
                  label="Tarjetas esperadas"
                  value={num(prediction.cards_home + prediction.cards_away, 2)}
                  bar={((prediction.cards_home + prediction.cards_away) / 8) * 100}
                  left={`${num(prediction.cards_home, 2)} + ${num(prediction.cards_away, 2)}`}
                  right={leagueLabel(num(leagueAverages?.cards, 2))}
                  kind="cards"
                />
                <SummaryCard
                  label="Córners esperados"
                  value={num(prediction.corners_home + prediction.corners_away, 2)}
                  bar={((prediction.corners_home + prediction.corners_away) / 14) * 100}
                  left={`${num(prediction.corners_home, 2)} + ${num(prediction.corners_away, 2)}`}
                  right={leagueLabel(num(leagueAverages?.corners, 2))}
                  kind="corners"
                />
                <SummaryCard
                  label="Tiros esperados"
                  value={num(prediction.shots_home + prediction.shots_away, 2)}
                  bar={((prediction.shots_home + prediction.shots_away) / 35) * 100}
                  left={`${num(prediction.shots_home, 2)} + ${num(prediction.shots_away, 2)}`}
                  right={leagueLabel(num(leagueAverages?.shots, 2))}
                  kind="shots"
                />
                <SummaryCard
                  label="Tiros a puerta esperados"
                  value={num(prediction.sot_home + prediction.sot_away, 2)}
                  bar={((prediction.sot_home + prediction.sot_away) / 12) * 100}
                  left={`${num(prediction.sot_home, 2)} + ${num(prediction.sot_away, 2)}`}
                  right={leagueLabel(num(leagueAverages?.sot, 2))}
                  kind="sot"
                />
              </section>
            </div>
          ) : null}

          <section className="card p-5" data-match-panel="general">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-ui-card-title font-semibold text-white">Rotación y XI base</h2>
                <p className="text-[13px] text-mist-500">
                  Comparado con el XI más repetido en los últimos 8 partidos, con peso reciente.
                </p>
              </div>
              <span className="text-[12px] text-mist-500">Solo contexto</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[lineupRotation.home, lineupRotation.away].map((side) => {
                const team = side.side === "home" ? homeDisplay : awayDisplay;
                const tone =
                  side.rotation === "alta"
                    ? "border-rose-400/30 bg-rose-400/10 text-rose-300"
                    : side.rotation === "media"
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      : "border-win-500/30 bg-win-500/10 text-win-400";

                return (
                  <div
                    key={side.side}
                    className="rounded-xl border border-ink-800 bg-ink-850/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-ui-card-title font-semibold text-white">
                          {team}
                        </div>
                        <div className="text-[12px] text-mist-500">
                          {side.status === "confirmed"
                            ? "Alineación confirmada"
                            : side.status === "partial"
                              ? "Alineación parcial"
                              : "Sin alineación confirmada"}
                          {side.formation ? ` · ${side.formation}` : ""}
                        </div>
                      </div>
                      {side.rotation ? (
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${tone}`}
                        >
                          Rotación {side.rotation}
                        </span>
                      ) : null}
                    </div>

                    {side.status === "none" ? (
                      <p className="mt-2 text-[13px] text-mist-500">
                        Se actualiza cerca del partido.
                      </p>
                    ) : side.sample < 3 ? (
                      <p className="mt-2 text-[13px] text-mist-500">
                        Muestra insuficiente ({side.sample} partidos).
                      </p>
                    ) : (
                      <>
                        <p className="mt-2 text-[13px] text-mist-400">
                          <span className="font-semibold text-white">{side.usualInXI}/11</span>{" "}
                          del XI base ·{" "}
                          <span className="font-semibold text-white">{side.changes}</span> cambios
                        </p>
                        {side.missing.length > 0 ? (
                          <p className="mt-1 text-[12px] leading-relaxed text-mist-500">
                            Fuera del XI base:{" "}
                            <span className="text-mist-300">
                              {side.missing.slice(0, 3).map(displayTeam).join(", ")}
                              {side.missing.length > 3
                                ? ` +${side.missing.length - 3}`
                                : ""}
                            </span>
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-mist-500">
              El XI base es una estimación con las alineaciones disponibles; no es una alineación
              oficial.
            </p>
          </section>

          {injuriesAt && hasInjuryCoverage ? (
            <section className="card p-5" data-match-panel="general">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-ui-card-title font-semibold text-white">Bajas</h2>
                <span className="text-[10px] text-mist-500">
                  API-Football · {dateTimeLabel(injuriesAt)}
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  { team: match.home_team, side: "home" },
                  { team: match.away_team, side: "away" },
                ].map(({ team, side }) => {
                  const list = injuries.filter((injury) => injury.side === side);
                  const absence = side === "home" ? homeAbsence : awayAbsence;
                  const attackDelta = Math.round((absence.attack - 1) * 100);
                  const defenseDelta = Math.round((absence.defense - 1) * 100);
                  const relevant = attackDelta <= -1 || defenseDelta >= 1;

                  return (
                    <div key={side}>
                      <div className="mb-2 flex items-center gap-2 text-xs text-mist-400">
                        <TeamBadge
                      name={displayTeam(team)}
                      size={22}
                      logo={teamLogos.get(`${match.league_code}:${team}`)} plain
                    />
                        <span className="truncate">{displayTeam(team)}</span>
                        <span className="text-mist-500">({list.length})</span>
                      </div>

                      {absence.count > 0 ? (
                        <div className="mb-2 rounded-lg border border-ink-800 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
                          {relevant ? (
                            <p className="text-mist-400">
                              <span className="text-mist-300">Impacto en el modelo:</span> ataque{" "}
                              {attackDelta}%
                              {defenseDelta >= 1
                                ? ` · defensa +${defenseDelta}% (concede más)`
                                : ""}
                            </p>
                          ) : (
                            <p className="text-mist-500">Sin impacto relevante en el modelo.</p>
                          )}
                          {absence.keyPlayers.length > 0 ? (
                            <p className="mt-1 text-mist-500">
                              Claves:{" "}
                              <span className="text-mist-300">
                                {absence.keyPlayers.map((key) => key.player).join(", ")}
                              </span>
                            </p>
                          ) : null}
                          {list.some((injury) => injury.category === "doubt") ? (
                            <p className="mt-1 text-mist-500">Las dudas cuentan al 50%.</p>
                          ) : null}
                        </div>
                      ) : null}

                      {list.length === 0 ? (
                        <p className="text-xs text-mist-500">Sin bajas registradas</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {list.map((injury) => (
                            <li
                              key={`${injury.side}-${injury.player}`}
                              className="flex items-start gap-2 text-xs"
                            >
                              <span
                                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ${injuryClass(injury.category)}`}
                              >
                                {injuryLabel(injury.category)}
                              </span>
                              <span className="min-w-0">
                                <span className="text-mist-300">{injury.player}</span>
                                {injury.reason ? (
                                  <span className="text-mist-500"> · {injury.reason}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {lineups.length > 0 ? (
            <section className="card p-5" data-match-panel="general">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-ui-card-title font-semibold text-white">Alineaciones</h2>
                  {lineupAdjustment ? (
                    <p className="text-ui-body-sm text-win-400">
                      Predicción reajustada con el once: local ataque{" "}
                      {pctDelta(lineupAdjustment.home_attack)} · defensa{" "}
                      {pctDelta(lineupAdjustment.home_defense)} · visita ataque{" "}
                      {pctDelta(lineupAdjustment.away_attack)} · defensa{" "}
                      {pctDelta(lineupAdjustment.away_defense)}
                    </p>
                  ) : null}
                </div>
                <span className="text-ui-caption text-mist-500">ESPN · once confirmado</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  { team: match.home_team, side: "home" },
                  { team: match.away_team, side: "away" },
                ].map(({ team, side }) => {
                  const players = lineups.filter((lineup) => lineup.side === side);
                  if (players.length === 0) return null;
                  const formation = players.find((lineup) => lineup.formation)?.formation;
                  const starters = players.filter((lineup) => lineup.starter === 1);
                  const subs = players.filter((lineup) => lineup.starter !== 1);

                  return (
                    <div key={side}>
                      <div className="mb-2 flex items-center gap-2 text-ui-body-sm text-mist-400">
                        <TeamBadge
                          name={displayTeam(team)}
                          size={22}
                          logo={teamLogos.get(`${match.league_code}:${team}`)} plain
                        />
                        <span className="truncate">{displayTeam(team)}</span>
                        {formation ? (
                          <span className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-ui-caption text-mist-400">
                            {formation}
                          </span>
                        ) : null}
                      </div>

                      <ul className="space-y-1">
                        {starters.map((player) => (
                          <li
                            key={`${side}-${player.player}`}
                            className="flex items-center gap-2 text-ui-body-sm"
                          >
                            <span className="w-6 text-right tabular-nums text-mist-500">
                              {player.number ?? "—"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-mist-300">
                              {player.player}
                            </span>
                            {player.position ? (
                              <span className="text-ui-caption text-mist-500">{player.position}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {subs.length > 0 ? (
                        <details className="mt-2" suppressHydrationWarning>
                          <summary className="cursor-pointer text-ui-body-sm text-mist-500">
                            Suplentes ({subs.length})
                          </summary>
                          <ul className="mt-1 space-y-1">
                            {subs.map((player) => (
                              <li
                                key={`${side}-${player.player}`}
                                className="flex items-center gap-2 text-ui-body-sm"
                              >
                                <span className="w-6 text-right tabular-nums text-mist-500">
                                  {player.number ?? "—"}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-mist-400">
                                  {player.player}
                                </span>
                                {player.position ? (
                                  <span className="text-ui-caption text-mist-500">
                                    {player.position}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {league?.hasStats !== false ? (
          <section className="grid gap-4">
            <div className="card p-5" data-match-panel="corners">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Córners</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Más de / menos de la línea. Totales esperados arriba.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Expected label={homeDisplay} value={prediction.corners_home} />
                <Expected label={awayDisplay} value={prediction.corners_away} />
                <Expected label="Total" value={prediction.corners_home + prediction.corners_away} highlight />
              </div>

              <div className="space-y-2.5">
                <MarketBar label="Más de 8.5" value={prediction.corners_over85} />
                <MarketBar label="Más de 9.5" value={prediction.corners_over95} />
                <MarketBar label="Más de 10.5" value={prediction.corners_over105} />
              </div>
            </div>

            <div className="card p-5" data-match-panel="corners">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Córners recientes</h2>
              <p className="mb-3 text-[13px] text-mist-500">
                Últimos 8 partidos de cada equipo. Formato: equipo-rival y total.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { team: homeDisplay, data: homeCornerForm },
                  { team: awayDisplay, data: awayCornerForm },
                ].map(({ team, data }) => (
                  <div
                    key={team}
                    className="rounded-lg border border-ink-800 bg-ink-850/60 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-mist-300">
                        {team}
                      </span>
                      <span className="shrink-0 text-[12px] text-mist-500">
                        {data.average === null ? "sin datos" : `prom. ${data.average.toFixed(1)}`}
                      </span>
                    </div>
                    {data.rows.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {data.rows.map((row) => (
                          <li key={row.id} className="flex items-center gap-2 text-[12px]">
                            <span className="min-w-0 flex-1 truncate text-mist-500">
                              {row.isHome ? "vs" : "@"} {displayTeam(row.opponent)}
                            </span>
                            <span className="tabular-nums text-mist-400">
                              {row.own}-{row.opp}
                            </span>
                            <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-mist-300">
                              {row.total}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[12px] text-mist-500">
                        Sin córners registrados.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5" data-match-panel="tiros">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Remates al arco</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Remates a puerta esperados. Más de / menos de la línea.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Expected label={homeDisplay} value={prediction.sot_home} />
                <Expected label={awayDisplay} value={prediction.sot_away} />
                <Expected label="Total" value={prediction.sot_home + prediction.sot_away} highlight />
              </div>

              <div className="space-y-2.5">
                <MarketBar label="Más de 7.5" value={prediction.sot_over85} />
                <MarketBar label="Más de 8.5" value={prediction.sot_over95} />
              </div>
            </div>

            <RecentCountCard
              panel="tiros"
              title="Remates al arco recientes"
              subtitle="Últimos 8 partidos. Tiros a puerta de cada equipo; formato: equipo-rival y total."
              homeTeam={homeDisplay}
              awayTeam={awayDisplay}
              home={homeSotForm}
              away={awaySotForm}
              emptyLabel="Sin tiros al arco registrados."
            />

            <div className="card p-5" data-match-panel="tiros">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Remates</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Remates totales esperados (todos los tiros, no solo al arco). Más de / menos de.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Expected label={homeDisplay} value={prediction.shots_home} />
                <Expected label={awayDisplay} value={prediction.shots_away} />
                <Expected label="Total" value={prediction.shots_home + prediction.shots_away} highlight />
              </div>

              <div className="space-y-2.5">
                <MarketBar label="Más de 20.5" value={prediction.shots_over205} />
                <MarketBar label="Más de 22.5" value={prediction.shots_over225} />
                <MarketBar label="Más de 24.5" value={prediction.shots_over245} />
              </div>
            </div>

            <RecentCountCard
              panel="tiros"
              title="Remates recientes"
              subtitle="Últimos 8 partidos. Remates totales de cada equipo; formato: equipo-rival y total."
              homeTeam={homeDisplay}
              awayTeam={awayDisplay}
              home={homeShotsForm}
              away={awayShotsForm}
              emptyLabel="Sin remates registrados."
            />

            <div className="card p-5" data-match-panel="tiros">
              <PlayerShotLeaders
                matchId={match.id}
                home={match.home_team}
                away={match.away_team}
              />
            </div>

            <div className="card p-5" data-match-panel="tarjetas">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Tarjetas</h2>
              <p className="mb-4 text-ui-body-sm text-mist-500">
                Amarillas y rojas esperadas (cada roja cuenta). Más de / menos de.
              </p>

              <div className="mb-4 grid grid-cols-3 gap-2">
                <Expected label={homeDisplay} value={prediction.cards_home} />
                <Expected label={awayDisplay} value={prediction.cards_away} />
                <Expected label="Total" value={prediction.cards_home + prediction.cards_away} highlight />
              </div>

              <div className="space-y-2.5">
                <MarketBar label="Más de 3.5" value={prediction.cards_over35} />
                <MarketBar label="Más de 4.5" value={prediction.cards_over45} />
                <MarketBar label="Más de 5.5" value={prediction.cards_over55} />
              </div>

              {match.referee ? (
                <p className="mt-4 text-[10px] leading-relaxed text-mist-500">
                  Árbitro: <span className="text-mist-300">{match.referee}</span>
                </p>
              ) : null}
            </div>

            <div className="card p-5" data-match-panel="tarjetas">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Tarjetas recientes</h2>
              <p className="mb-3 text-[13px] text-mist-500">
                Últimos 8 partidos de cada equipo. Amarillas + rojas (R = roja); formato:
                equipo-rival y total.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { team: homeDisplay, data: homeCardForm },
                  { team: awayDisplay, data: awayCardForm },
                ].map(({ team, data }) => (
                  <div
                    key={team}
                    className="rounded-lg border border-ink-800 bg-ink-850/60 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-mist-300">
                        {team}
                      </span>
                      <span className="shrink-0 text-[12px] text-mist-500">
                        {data.average === null ? "sin datos" : `prom. ${data.average.toFixed(1)}`}
                      </span>
                    </div>
                    {data.rows.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {data.rows.map((row) => (
                          <li key={row.id} className="flex items-center gap-2 text-[12px]">
                            <span className="min-w-0 flex-1 truncate text-mist-500">
                              {row.isHome ? "vs" : "@"} {displayTeam(row.opponent)}
                            </span>
                            <span className="tabular-nums text-mist-400">
                              {row.ownYellow}
                              {row.ownRed > 0 ? (
                                <span className="font-semibold text-rose-300">+{row.ownRed}R</span>
                              ) : null}
                              <span className="px-0.5 text-mist-500/50">-</span>
                              {row.oppYellow}
                              {row.oppRed > 0 ? (
                                <span className="font-semibold text-rose-300">+{row.oppRed}R</span>
                              ) : null}
                            </span>
                            <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-mist-300">
                              {row.total}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[12px] text-mist-500">
                        Sin tarjetas registradas.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5" data-match-panel="tarjetas">
              <h2 className="mb-1 text-ui-card-title font-semibold text-white">Faltas recientes</h2>
              <p className="mb-3 text-[13px] text-mist-500">
                Últimos 8 partidos. Faltas cometidas por cada equipo. Contexto: el modelo no calcula
                faltas esperadas.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { team: homeDisplay, data: homeFoulForm },
                  { team: awayDisplay, data: awayFoulForm },
                ].map(({ team, data }) => (
                  <div
                    key={team}
                    className="rounded-lg border border-ink-800 bg-ink-850/60 p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-mist-300">
                        {team}
                      </span>
                      <span className="shrink-0 text-right text-[11px] leading-tight text-mist-500">
                        {data.averageOwn === null ? "sin datos" : `prom. ${data.averageOwn.toFixed(1)}`}
                        {data.averageTotal === null ? null : (
                          <span className="block text-[10px]">
                            total {data.averageTotal.toFixed(1)}
                          </span>
                        )}
                      </span>
                    </div>
                    {data.rows.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {data.rows.map((row) => (
                          <li key={row.id} className="flex items-center gap-2 text-[12px]">
                            <span className="min-w-0 flex-1 truncate text-mist-500">
                              {row.isHome ? "vs" : "@"} {displayTeam(row.opponent)}
                            </span>
                            <span className="tabular-nums text-mist-400">
                              {row.own}-{row.opp}
                            </span>
                            <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-mist-300">
                              {row.total}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[12px] text-mist-500">
                        Sin faltas registradas.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5" data-match-panel="tarjetas">
              <PlayerCardLeaders
                matchId={match.id}
                home={match.home_team}
                away={match.away_team}
                homeLogo={homeLogo}
                awayLogo={awayLogo}
              />
            </div>

            {prediction.ht_over05 > 0 ? (
              <div className="card p-5" data-match-panel="goles">
                <h2 className="mb-1 text-ui-card-title font-semibold text-white">Primer tiempo</h2>
                <p className="mb-4 text-ui-body-sm text-mist-500">
                  Goles esperados antes del descanso. Más de / menos de.
                </p>

                <div className="mb-4 grid grid-cols-3 gap-2">
                  <Expected label={homeDisplay} value={prediction.ht_home_goals} />
                  <Expected label={awayDisplay} value={prediction.ht_away_goals} />
                  <Expected label="Total" value={prediction.ht_home_goals + prediction.ht_away_goals} highlight />
                </div>

                <div className="space-y-2.5">
                  <MarketBar label="Más de 0.5" value={prediction.ht_over05} />
                  <MarketBar label="Más de 1.5" value={prediction.ht_over15} />
                  <MarketBar label="Más de 2.5" value={prediction.ht_over25} />
                </div>
              </div>
            ) : null}

            {prediction.ht_over05 > 0.7 &&
            (homeHalfHistory.length > 0 || awayHalfHistory.length > 0) ? (
              <div className="card p-5" data-match-panel="goles">
                <h2 className="mb-1 text-ui-card-title font-semibold text-white">1T reciente</h2>
                <p className="mb-4 text-ui-body-sm text-mist-500">
                  Últimos 5 partidos con gol antes del descanso: minuto del primer gol y marcador al
                  descanso.
                </p>
                <div className="space-y-4">
                  {[
                    { team: homeDisplay, games: homeHalfHistory },
                    { team: awayDisplay, games: awayHalfHistory },
                  ].map(({ team, games }) => (
                    <div key={team}>
                      <div className="mb-2 text-[11px] font-medium text-mist-300">{team}</div>
                      {games.length === 0 ? (
                        <p className="text-[11px] text-mist-500">Sin datos recientes.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {games.map((game) => (
                            <li
                              key={game.matchId}
                              className="flex items-center gap-2 text-[11px]"
                            >
                              <span className="w-11 shrink-0 tabular-nums text-win-400">
                                {game.minute ?? "—"}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-mist-400">
                                {game.isHome ? "vs" : "@"} {displayTeam(game.opponent)}
                              </span>
                              <span className="shrink-0 tabular-nums text-mist-500">
                                {game.htHome}-{game.htAway}
                              </span>
                              <span className="w-14 shrink-0 text-right text-[10px] text-mist-500">
                                {dateShort(game.kickoff)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          ) : (
            <div className="card p-5 text-xs leading-relaxed text-mist-400">
              <span className="font-semibold text-white">
                Sin córners ni tiros al arco en esta competición.
              </span>{" "}
              La fuente gratuita no publica esas estadísticas para esta liga. El modelo de goles,
              1X2 y BTTS funciona con normalidad.
            </div>
          )}
        </>
      ) : null}

      <section className="grid gap-4">
        <div className="card p-5">
          <div data-match-panel-except="posiciones">
          <div className="mb-4">
            <h2 className="text-ui-card-title font-semibold text-white">Forma reciente</h2>
            <p className="text-xs leading-relaxed text-mist-500">
              {isCup ? "Posición en la competición y promedio" : "Promedio"} por partido en los
              últimos {Math.max(homeRecent8.length, awayRecent8.length) || 8}. Entre paréntesis, el total.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { team: match.home_team, matches: homeRecent8 },
              { team: match.away_team, matches: awayRecent8 },
            ].map(({ team, matches }) => {
              const stats = formStats(matches, team);
              const standing =
                standings.find((row) => teamSimilarity(row.team, team) >= 0.85) ?? null;
              return (
                <div key={team} className="space-y-1.5 border-b border-ink-800/60 pb-3 last:border-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamBadge
                      name={displayTeam(team)}
                      size={26}
                      logo={teamLogos.get(`${match.league_code}:${team}`)} plain
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[17px] text-mist-300">{displayTeam(team)}</div>
                      {isCup && standing ? (
                        <div className="whitespace-nowrap text-ui-caption text-mist-500">
                          {standing.group_name
                            ? `${standing.group_name.replace(/^Group /, "Grupo ")} · `
                            : ""}
                          {standing.rank}º · {standing.points} pts · {standing.played} PJ ·{" "}
                          {standing.goals_for} GF / {standing.goals_against} GC
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <FormStrip matches={matches} team={team} align="start" />
                  </div>
                  {stats ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1 text-ui-body xl:grid-cols-3">
                      <FormStat
                        label="Goles a favor"
                        value={`${num(stats.goalsFor)} (${stats.goalsForTotal})`}
                      />
                      <FormStat
                        label="Goles en contra"
                        value={`${num(stats.goalsAgainst)} (${stats.goalsAgainstTotal})`}
                      />
                      <FormStat
                        label="Anotó"
                        value={`${stats.scoredCount} de ${stats.total}`}
                        tone="text-win-400"
                      />
                      <FormStat
                        label="Le marcaron"
                        value={`${stats.concededCount} de ${stats.total}`}
                        tone="text-rose-400"
                      />
                      {stats.corners !== null ? (
                        <FormStat
                          label="Córners"
                          value={isCup ? `${num(stats.corners)} (${stats.cornersTotal})` : num(stats.corners)}
                        />
                      ) : null}
                      {stats.sot !== null ? (
                        <FormStat
                          label="Tiros al arco"
                          value={isCup ? `${num(stats.sot)} (${stats.sotTotal})` : num(stats.sot)}
                        />
                      ) : null}
                      {stats.shots !== null ? (
                        <FormStat
                          label="Remates"
                          value={isCup ? `${num(stats.shots)} (${stats.shotsTotal})` : num(stats.shots)}
                        />
                      ) : null}
                      {stats.cards !== null ? (
                        <FormStat
                          label="Amarillas"
                          value={`${num(stats.cards)} (${stats.cardsTotal})`}
                        />
                      ) : null}
                      {stats.reds !== null ? (
                        <FormStat
                          label="Rojas"
                          value={`${num(stats.reds)} (${stats.redsTotal})`}
                          tone="text-rose-400"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  {matches.length > 0 ? (
                    <details className="text-ui-body-sm" suppressHydrationWarning>
                      <summary className="cursor-pointer select-none list-none text-mint-400 transition hover:text-mint-300 [&::-webkit-details-marker]:hidden">
                        Ver últimos {matches.length} partidos <span className="ml-1 text-ui-caption">▾</span>
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {matches.map((recent) => {
                          const atHome = recent.home_team === team;
                          const scored = (atHome ? recent.home_goals : recent.away_goals) ?? 0;
                          const conceded = (atHome ? recent.away_goals : recent.home_goals) ?? 0;
                          const opponent = atHome ? recent.away_team : recent.home_team;
                          const outcome = scored > conceded ? "G" : scored < conceded ? "P" : "E";
                          const tone =
                            outcome === "G"
                              ? "bg-win-500/15 text-win-400 ring-win-500/30"
                              : outcome === "P"
                                ? "bg-rose-400/10 text-rose-400 ring-rose-400/30"
                                : "bg-ink-800 text-mist-400 ring-ink-700";
                          return (
                            <li key={recent.id} className="py-1">
                              <div className="flex items-center gap-2 text-ui-body text-mist-500">
                                <span
                                  className={`grid size-6 shrink-0 place-items-center rounded text-[12px] font-semibold ring-1 ${tone}`}
                                >
                                  {outcome}
                                </span>
                                <span className="w-3 shrink-0 text-mist-500/70">
                                  {atHome ? "L" : "V"}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-mist-400">
                                  {opponent}
                                </span>
                                <span className="shrink-0 tabular-nums text-mist-200">
                                  {scored}-{conceded}
                                </span>
                                <span className="w-12 shrink-0 text-right tabular-nums text-mist-500/80">
                                  {dateShort(recent.kickoff)}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 pl-8 text-ui-caption text-mist-500/80">
                                {(() => {
                                  const corners = atHome
                                    ? [recent.home_corners, recent.away_corners]
                                    : [recent.away_corners, recent.home_corners];
                                  const sot = atHome
                                    ? [recent.home_sot, recent.away_sot]
                                    : [recent.away_sot, recent.home_sot];
                                  const shots = atHome
                                    ? [recent.home_shots, recent.away_shots]
                                    : [recent.away_shots, recent.home_shots];
                                  const yellows = atHome
                                    ? [recent.home_yellow, recent.away_yellow]
                                    : [recent.away_yellow, recent.home_yellow];
                                  const reds = atHome
                                    ? [recent.home_red, recent.away_red]
                                    : [recent.away_red, recent.home_red];
                                  return (
                                    <>
                                      {corners[0] !== null && corners[1] !== null ? (
                                        <span>
                                          Córners{" "}
                                          <span className="text-mist-400">
                                            {corners[0]}-{corners[1]}
                                          </span>
                                        </span>
                                      ) : null}
                                      {sot[0] !== null && sot[1] !== null ? (
                                        <span>
                                          Al arco{" "}
                                          <span className="text-mist-400">
                                            {sot[0]}-{sot[1]}
                                          </span>
                                        </span>
                                      ) : null}
                                      {shots[0] !== null && shots[1] !== null ? (
                                        <span>
                                          Remates{" "}
                                          <span className="text-mist-400">
                                            {shots[0]}-{shots[1]}
                                          </span>
                                        </span>
                                      ) : null}
                                      {yellows[0] !== null && yellows[1] !== null ? (
                                        <span>
                                          Amarillas{" "}
                                          <span className="text-mist-400">
                                            {yellows[0]}-{yellows[1]}
                                          </span>
                                          {reds[0] || reds[1] ? (
                                            <span className="text-rose-400">
                                              {" "}
                                              · Rojas {reds[0] ?? 0}-{reds[1] ?? 0}
                                            </span>
                                          ) : null}
                                        </span>
                                      ) : null}
                                    </>
                                  );
                                })()}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  ) : null}
                </div>
              );
            })}
          </div>

          {league?.noModel && (homeLeague || awayLeague) ? (
            <div className="mt-5 space-y-3 border-t border-ink-800/60 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-mist-500">
                Su liga
              </h3>
              {homeLeague ? (
                <LeagueFormBlock
                  team={homeLeague.team}
                  leagueCode={homeLeague.leagueCode}
                  snapshot={homeLeague}
                  matches={homeLeagueForm}
                  logo={teamLogos.get(`${homeLeague.leagueCode}:${homeLeague.team}`)}
                />
              ) : null}
              {awayLeague ? (
                <LeagueFormBlock
                  team={awayLeague.team}
                  leagueCode={awayLeague.leagueCode}
                  snapshot={awayLeague}
                  matches={awayLeagueForm}
                  logo={teamLogos.get(`${awayLeague.leagueCode}:${awayLeague.team}`)}
                />
              ) : null}
            </div>
          ) : null}
          </div>

          <div data-match-panel="posiciones">
            <StandingsPanel
              leagueCode={match.league_code}
              leagueName={league?.name ?? match.league_code}
              homeTeam={match.home_team}
              awayTeam={match.away_team}
            />
          </div>

          <div data-match-panel="h2h">
            <h3 className="mt-6 mb-2 text-ui-card-title font-semibold uppercase tracking-wide text-mist-500">
              Historial directo
            </h3>
            <div className="space-y-1.5">
            {h2h.length === 0 ? (
              <p className="text-ui-body-sm text-mist-500">Sin enfrentamientos previos en la base de datos.</p>
            ) : (
              h2h.map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-ui-body text-mist-400">
                  <span className="w-16 shrink-0 text-ui-caption tabular-nums text-mist-500">
                    {dateShort(m.kickoff)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right">{displayTeam(m.home_team)}</span>
                  <span className="rounded bg-ink-800 px-1.5 py-0.5 text-ui-body font-semibold tabular-nums text-white">
                    {m.home_goals}-{m.away_goals}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{displayTeam(m.away_team)}</span>
                </div>
              ))
            )}
          </div>
          </div>
        </div>

        <div className="card p-5" data-match-panel={match.status === "played" || !isCup ? "h2h" : "general"}>
          <h2 className="mb-4 text-ui-card-title font-semibold text-white">
            {match.status === "played" || !isCup
              ? "Estadísticas del último partido"
              : "En la competición"}
          </h2>
          {match.status === "played" ? (
            <div className="space-y-2 text-ui-body">
              {[
                ["Remates", match.home_shots, match.away_shots],
                ["Remates al arco", match.home_sot, match.away_sot],
                ["Córners", match.home_corners, match.away_corners],
                ["Faltas", match.home_fouls, match.away_fouls],
                ["Amarillas", match.home_yellow, match.away_yellow],
                ["Rojas", match.home_red, match.away_red],
              ].map(([label, home, away]) => (
                <div key={String(label)} className="flex items-center gap-3">
                  <span className="w-10 text-right font-semibold tabular-nums text-white">{home ?? "—"}</span>
                  <div className="flex-1 text-center text-ui-caption uppercase tracking-wide text-mist-500">
                    {label}
                  </div>
                  <span className="w-10 font-semibold tabular-nums text-white">{away ?? "—"}</span>
                </div>
              ))}
              {match.referee ? (
                <p className="pt-2 text-ui-caption text-mist-500">Árbitro: {match.referee}</p>
              ) : null}
            </div>
          ) : isCup ? (
            <div className="space-y-4 text-xs">
              <p className="text-xs leading-relaxed text-mist-500">
                Totales y promedio por partido en sus últimos encuentros de esta competición.
              </p>
              {[
                {
                  team: homeDisplay,
                  stats: formStats(homeForm, match.home_team),
                  sample: homeCardSample,
                },
                {
                  team: awayDisplay,
                  stats: formStats(awayForm, match.away_team),
                  sample: awayCardSample,
                },
              ].map(({ team, stats, sample }) => (
                <div key={team} className="space-y-1.5">
                  <div className="text-sm font-medium text-mist-300">{team}</div>
                  {stats ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                      <FormStat label="Partidos" value={String(stats.total)} />
                      <FormStat
                        label="Goles"
                        value={`${num(stats.goalsFor)} (${stats.goalsForTotal})`}
                      />
                      <FormStat
                        label="Córners"
                        value={`${num(stats.corners)} (${stats.cornersTotal})`}
                      />
                      <FormStat
                        label="Remates"
                        value={`${num(stats.shots)} (${stats.shotsTotal})`}
                      />
                      <FormStat
                        label="Al arco"
                        value={`${num(stats.sot)} (${stats.sotTotal})`}
                      />
                      <FormStat
                        label="Amarillas"
                        value={`${num(stats.cards)} (${stats.cardsTotal})`}
                      />
                      <FormStat
                        label="Rojas"
                        value={`${num(stats.reds)} (${stats.redsTotal})`}
                        tone="text-rose-400"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-mist-500">Sin datos en esta competición.</p>
                  )}
                  {sample && sample.average !== null ? (
                    <p className="text-xs text-mist-500">
                      Amarillas en la muestra:{" "}
                      <span className="text-mist-300">
                        {sample.average.toFixed(1)} ({sample.total})
                      </span>{" "}
                      en {sample.matches} partidos
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mist-500">
              Aún no se ha jugado. Aquí aparecerán tiros, córners y tarjetas cuando termine.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
