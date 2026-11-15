"use client";

import type { ComboCategory, ComboRule } from "./combos";

export type SlipPick = {
  key: string;
  matchId: number;
  matchLabel: string;
  leagueCode: string;
  kickoff: string;
  market: string;
  category: ComboCategory;
  rule: ComboRule;
  probability: number;
  fairOdds: number;
  source: "model" | "cup";
  marketOdds: number | null;
};

export type AddResult = { ok: true } | { ok: false; error: string };

const KEY = "betslip:v1";
const EVENT = "betslip:update";
export const MAX_SLIP_PICKS = 3;

function isPick(value: unknown): value is SlipPick {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.key === "string" &&
    typeof p.matchId === "number" &&
    typeof p.market === "string" &&
    typeof p.probability === "number" &&
    typeof p.fairOdds === "number" &&
    typeof p.category === "string" &&
    !!p.rule
  );
}

export function readSlip(): SlipPick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isPick) : [];
  } catch {
    return [];
  }
}

function writeSlip(picks: SlipPick[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    // Sin localStorage: la combinada no persiste, pero no rompe la app.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addPick(pick: SlipPick): AddResult {
  const current = readSlip();
  if (current.some((item) => item.key === pick.key)) {
    return { ok: false, error: "Esa selección ya está en la combinada." };
  }
  if (current.length >= MAX_SLIP_PICKS) {
    return { ok: false, error: `Máximo ${MAX_SLIP_PICKS} patas en la combinada.` };
  }
  if (current.some((item) => item.matchId === pick.matchId)) {
    return { ok: false, error: "No puedes mezclar dos picks del mismo partido." };
  }
  const hasFirstHalf = current.some((item) => item.category === "1t");
  if (hasFirstHalf !== (pick.category === "1t") && current.length > 0) {
    return { ok: false, error: "No mezcles primer tiempo con partido completo." };
  }
  writeSlip([...current, pick]);
  return { ok: true };
}

export function removePick(key: string) {
  writeSlip(readSlip().filter((item) => item.key !== key));
}

export function clearSlip() {
  writeSlip([]);
}

export function setMarketOdds(key: string, marketOdds: number | null) {
  writeSlip(
    readSlip().map((item) =>
      item.key === key ? { ...item, marketOdds } : item,
    ),
  );
}

export function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onUpdate = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) callback();
  };
  window.addEventListener(EVENT, onUpdate);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onUpdate);
    window.removeEventListener("storage", onStorage);
  };
}
