import type { Ratings } from "./model";

export type AbsenceInput = {
  matchId: number;
  side: "home" | "away";
  player: string;
  category: string;
};

export type PlayerUsage = {
  apps: number;
  goals: number;
  shots: number;
  sot: number;
};

export type TeamUsage = {
  players: Map<string, PlayerUsage>;
  totalApps: number;
  attackTotal: number;
};

export type KeyAbsence = { player: string; impact: number };

export type AbsenceFactors = {
  /** Multiplicador de ataque (<= 1). */
  attack: number;
  /** Multiplicador de defensa (>= 1: concede más). */
  defense: number;
  attackImpact: number;
  defenseImpact: number;
  count: number;
  /** Bajas con más peso según su producción reciente. */
  keyPlayers: KeyAbsence[];
};

const NEUTRAL: AbsenceFactors = {
  attack: 1,
  defense: 1,
  attackImpact: 0,
  defenseImpact: 0,
  count: 0,
  keyPlayers: [],
};

const CATEGORY_WEIGHT: Record<string, number> = {
  injury: 1,
  suspension: 1,
  doubt: 0.5,
  other: 0.1,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * Clave para emparejar nombres de distintas fuentes:
 * "G. Scamacca" y "Gianluca Scamacca" -> "scamacca".
 */
export function surnameKey(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .trim();
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Agrupa el uso de jugadores por equipo (apariciones, goles, remates). */
export function buildTeamUsage(
  rows: Array<{
    team: string;
    player: string;
    apps: number;
    goals: number;
    shots: number;
    sot: number;
  }>,
): Map<string, TeamUsage> {
  const map = new Map<string, TeamUsage>();

  for (const row of rows) {
    const team = String(row.team);
    let usage = map.get(team);
    if (!usage) {
      usage = { players: new Map(), totalApps: 0, attackTotal: 0 };
      map.set(team, usage);
    }

    const apps = Number(row.apps) || 0;
    const goals = Number(row.goals) || 0;
    const shots = Number(row.shots) || 0;
    const sot = Number(row.sot) || 0;

    usage.players.set(surnameKey(row.player), { apps, goals, shots, sot });
    usage.totalApps += apps;
    usage.attackTotal += goals + 0.15 * shots + 0.3 * sot;
  }

  return map;
}

/**
 * Factores de ajuste por bajas. Es deliberadamente conservador: sin minutos ni
 * posición, usar goles/remates y presencia evita exagerar el efecto.
 */
export function computeAbsenceFactors(
  absences: AbsenceInput[],
  usage: TeamUsage | undefined,
): AbsenceFactors {
  if (!usage || usage.totalApps <= 0) return NEUTRAL;

  let attackImpact = 0;
  let defenseImpact = 0;
  let count = 0;
  const keyPlayers: KeyAbsence[] = [];

  for (const absence of absences) {
    const weight = CATEGORY_WEIGHT[absence.category] ?? 0.5;
    if (weight <= 0) continue;
    count += weight;

    const player = usage.players.get(surnameKey(absence.player));
    if (!player) continue;

    const attackValue = player.goals + 0.15 * player.shots + 0.3 * player.sot;
    const attackShare = attackValue / Math.max(1e-6, usage.attackTotal);
    attackImpact += weight * attackShare;

    // Perfil defensivo: casi no remata (porteros, centrales, laterales).
    const attackRate = (player.shots + 3 * player.goals) / Math.max(1, player.apps);
    const presenceShare = player.apps / usage.totalApps;
    const defensive = attackRate < 0.6;
    if (defensive) {
      defenseImpact += weight * presenceShare;
    }

    keyPlayers.push({
      player: absence.player,
      impact: weight * (attackShare + (defensive ? presenceShare : 0)),
    });
  }

  keyPlayers.sort((a, b) => b.impact - a.impact);

  // Muchas bajas a la vez también restan profundidad de plantilla.
  const extra = Math.max(0, count - 3);

  return {
    attack: clamp(1 - 0.3 * attackImpact - 0.015 * extra, 0.8, 1),
    defense: clamp(1 + 0.18 * defenseImpact + 0.012 * extra, 1, 1.15),
    attackImpact,
    defenseImpact,
    count,
    keyPlayers: keyPlayers.slice(0, 3),
  };
}

export type AbsenceAdjustment = {
  team: string;
  venue: "home" | "away";
  factors: AbsenceFactors;
};

/** Devuelve una copia de los ratings con ataque/defensa ajustados por bajas. */
export function applyAbsenceAdjustments(
  ratings: Ratings,
  adjustments: AbsenceAdjustment[],
): Ratings {
  const teams = new Map(ratings.teams);

  for (const adjustment of adjustments) {
    if (adjustment.factors.attack === 1 && adjustment.factors.defense === 1) continue;
    const current = teams.get(adjustment.team);
    if (!current) continue;

    const next = { ...current };
    if (adjustment.venue === "home") {
      next.attHome *= adjustment.factors.attack;
      next.defHome *= adjustment.factors.defense;
    } else {
      next.attAway *= adjustment.factors.attack;
      next.defAway *= adjustment.factors.defense;
    }
    teams.set(adjustment.team, next);
  }

  return { baseline: ratings.baseline, teams };
}
