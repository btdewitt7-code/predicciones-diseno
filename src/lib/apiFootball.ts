import { getMeta, setMeta } from "./db";

export const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

type Budget = {
  day: string;
  used: number;
  limit: number;
  remaining: number;
};

const DEFAULT_LIMIT = 100;
/** Reserva peticiones para pruebas manuales. */
const DEFAULT_MAX_USED = 85;

function dayKeyUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function budgetMax(): number {
  const raw = Number(process.env.API_FOOTBALL_DAILY_BUDGET);
  if (Number.isFinite(raw) && raw > 0 && raw <= 100_000) return raw;
  return DEFAULT_MAX_USED;
}

async function readBudget(): Promise<Budget> {
  const today = dayKeyUtc();
  const raw = await getMeta("api_budget");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Budget;
      if (parsed.day === today) return parsed;
    } catch {
      // Valor corrupto: se reinicia.
    }
  }
  return { day: today, used: 0, limit: DEFAULT_LIMIT, remaining: DEFAULT_LIMIT };
}

async function writeBudget(state: Budget): Promise<void> {
  await setMeta("api_budget", JSON.stringify(state));
}

export type ApiBudgetState = Budget & { max: number; left: number };

/** Estado actual del presupuesto diario de API-Football. */
export async function apiBudget(): Promise<ApiBudgetState> {
  const state = await readBudget();
  const max = budgetMax();
  return { ...state, max, left: Math.max(0, max - state.used) };
}

/**
 * Petición GET a API-Football con control de presupuesto diario.
 * Devuelve null si no hay clave, se agotó la reserva o falla la red.
 */
export async function apiFootballGet<T>(
  path: string,
  key: string,
): Promise<T | null> {
  const state = await readBudget();

  // El servidor puede avisar que ya no quedan peticiones.
  if (state.used >= budgetMax() || state.remaining <= 5) return null;

  let res: Response;
  try {
    res = await fetch(`${API_FOOTBALL_BASE}/${path}`, {
      headers: { "x-apisports-key": key },
    });
  } catch {
    return null;
  }

  let payload: T | null = null;
  if (res.ok) {
    try {
      payload = (await res.json()) as T;
    } catch {
      payload = null;
    }
  }

  const errors = (payload as { errors?: unknown } | null)?.errors;
  const errorText = errors ? JSON.stringify(errors).toLowerCase() : "";
  const quotaError = /request limit|quota|rate limit/.test(errorText);
  const accessError = /do not have access|free plan/.test(errorText);

  state.used += 1;
  const limitHeader = Number(res.headers.get("x-ratelimit-requests-limit"));
  const remainingHeader = Number(res.headers.get("x-ratelimit-requests-remaining"));
  if (Number.isFinite(limitHeader) && limitHeader > 0) state.limit = limitHeader;

  if (quotaError) {
    state.remaining = 0;
    state.used = state.limit;
  } else if (!accessError && Number.isFinite(remainingHeader) && remainingHeader > 0) {
    state.remaining = remainingHeader;
    state.used = Math.max(state.used, state.limit - remainingHeader);
  }

  await writeBudget(state);
  return payload;
}
