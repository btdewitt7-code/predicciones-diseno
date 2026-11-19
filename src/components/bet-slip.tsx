"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  clearSlip,
  MAX_SLIP_PICKS,
  readSlip,
  removePick,
  setMarketOdds,
  subscribe,
  type SlipPick,
} from "@/lib/betSlip";

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function BetSlip() {
  const router = useRouter();
  const [picks, setPicks] = useState<SlipPick[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [oddsDraft, setOddsDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const update = () => setPicks(readSlip());
    update();
    return subscribe(update);
  }, []);

  useEffect(() => {
    if (picks.length === 0) setOpen(false);
  }, [picks.length]);

  const probability = picks.reduce((acc, pick) => acc * pick.probability, 1);
  const fairOdds = probability > 0 ? 1 / probability : 0;
  const allMarketOdds =
    picks.length > 0 &&
    picks.every((pick) => pick.marketOdds !== null && pick.marketOdds > 1);
  const marketOdds = allMarketOdds
    ? picks.reduce((acc, pick) => acc * (pick.marketOdds ?? 1), 1)
    : null;
  const edge = marketOdds !== null && fairOdds > 0 ? marketOdds / fairOdds - 1 : null;
  const risk = 1 - probability;
  const mixedSources = new Set(picks.map((pick) => pick.source)).size > 1;

  const save = async () => {
    if (picks.length < 2) {
      setMessage("Agrega al menos 2 picks para guardar la combinada.");
      return;
    }
    if (!allMarketOdds) {
      setMessage("Completa la cuota de casa de todas las patas para guardar.");
      return;
    }
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const combo = {
        id: `slip-${Date.now()}`,
        title: picks.map((pick) => pick.market).join(" + "),
        description: picks.map((pick) => pick.matchLabel).join(" · "),
        legs: picks.map(({ key, marketOdds: _odds, source: _source, ...leg }) => leg),
        probability,
        fairOdds,
        origin: "manual",
      };
      const res = await fetch("/api/save-combo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(combo),
      });
      if (!res.ok) {
        setMessage("No se pudo guardar la combinada.");
        return;
      }
      clearSlip();
      setOpen(false);
      router.refresh();
    } catch {
      setMessage("Error de conexión.");
    } finally {
      setSaving(false);
    }
  };

  if (picks.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3 z-40 w-[min(94vw,400px)] lg:bottom-3">
      {open ? (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setOpen(false);
              }
            }}
            className="flex cursor-pointer items-center justify-between gap-3 h-[52px] bg-win-500 px-3 text-white"
          >
            <span className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8a2 2 0 0 0 2-2V5h12v1a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2V8Z" />
                <path d="M10 9v6M14 9v6" />
              </svg>
              <span className="grid size-5 place-items-center rounded-full bg-ink-950 text-[10px] font-bold text-white">
                {picks.length}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-semibold tabular-nums">
                Casa {marketOdds !== null ? marketOdds.toFixed(2) : "—"}
              </span>
              <span className="text-sm text-white/85">▾</span>
            </span>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-[15px] font-semibold text-white">Combinada</p>
                <p className="text-xs text-mist-500">
                  {picks.length}/{MAX_SLIP_PICKS} patas · mínimo 2
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOddsDraft({});
                  clearSlip();
                }}
                aria-label="Limpiar combinada"
                title="Limpiar"
                className="grid size-7 place-items-center rounded-lg border border-ink-700 text-mist-400 transition hover:border-rose-400/40 hover:text-rose-300"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
            {picks.map((pick) => (
              <div
                key={pick.key}
                className="rounded-lg border border-ink-800 bg-ink-850/60 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/partido/${pick.matchId}`}
                    className="min-w-0 transition hover:text-white"
                    title="Ver partido"
                  >
                    <p className="truncate text-[13px] font-semibold text-white">{pick.market}</p>
                    <p className="truncate text-xs text-mist-500">{pick.matchLabel}</p>
                    <p className="text-[11px] uppercase tracking-wide text-mist-500">
                      {pick.leagueCode} · {pick.source === "cup" ? "Copa" : "Liga"}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => removePick(pick.key)}
                    aria-label="Quitar de la combinada"
                    className="grid size-6 shrink-0 place-items-center rounded-md border border-ink-700 text-mist-400 transition hover:border-rose-400/40 hover:text-rose-300"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-mist-400">
                    Justa{" "}
                    <span className="font-semibold text-mist-200">
                      {pick.fairOdds.toFixed(2)}
                    </span>
                  </span>
                  <label className="flex items-center gap-1 text-mist-500">
                    Casa
                    <input
                      type="number"
                      min="1.01"
                      step="0.01"
                      inputMode="decimal"
                      value={oddsDraft[pick.key] ?? pick.marketOdds?.toString() ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setOddsDraft((prev) => ({ ...prev, [pick.key]: raw }));
                        const value = Number(raw.replace(",", "."));
                        setMarketOdds(
                          pick.key,
                          Number.isFinite(value) && value > 1 ? value : null,
                        );
                      }}
                      onBlur={() => {
                        const raw = oddsDraft[pick.key];
                        if (raw === undefined) return;
                        const value = Number(raw.replace(",", "."));
                        const clean =
                          Number.isFinite(value) && value > 1 ? String(value) : "";
                        setOddsDraft((prev) => ({ ...prev, [pick.key]: clean }));
                        setMarketOdds(pick.key, clean ? Number(clean) : null);
                      }}
                      placeholder="—"
                      className="w-16 rounded border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-right text-[13px] text-white outline-none focus:border-mint-500/50"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            <div className="rounded-lg bg-ink-850 px-2 py-1.5">
              <span className="text-mist-500">Probabilidad</span>
              <span className="block font-semibold text-white">{pct(probability)}</span>
            </div>
            <div className="rounded-lg bg-ink-850 px-2 py-1.5">
              <span className="text-mist-500">Riesgo</span>
              <span className="block font-semibold text-amber-300">{pct(risk)}</span>
            </div>
            <div className="rounded-lg bg-ink-850 px-2 py-1.5">
              <span className="text-mist-500">Cuota justa</span>
              <span className="block font-semibold text-white">{fairOdds.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-ink-850 px-2 py-1.5">
              <span className="text-mist-500">Cuota casa</span>
              <span className="block font-semibold text-white">
                {marketOdds !== null ? marketOdds.toFixed(2) : "—"}
              </span>
            </div>
          </div>

          {edge !== null ? (
            <p
              className={`mt-2 text-[11px] font-semibold ${
                edge >= 0 ? "text-win-400" : "text-rose-400"
              }`}
            >
              {edge >= 0
                ? `Valor: +${(edge * 100).toFixed(1)}% sobre la cuota justa`
                : `Paga ${Math.abs(edge * 100).toFixed(1)}% por debajo de la cuota justa`}
            </p>
          ) : null}

          {picks.length < 2 || marketOdds === null ? (
            <p className="mt-2 text-xs leading-relaxed text-win-400">
              Combinada: mínimo 2 picks y cuota de casa en cada uno. Para una simple, usa Guardar
              en la recomendación. Lo guardado aparece en Resultados → Combinadas.
            </p>
          ) : null}
          {mixedSources ? (
            <p className="mt-1 text-[10px] leading-relaxed text-amber-300/90">
              Mezclas ligas y copas: se guardará como copa y quedará separada del récord de ligas.
            </p>
          ) : null}
          {message ? (
            <p className="mt-2 text-[11px] text-rose-400">{message}</p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || picks.length < 2 || !allMarketOdds}
              className="flex-1 rounded-lg border border-win-500/40 bg-win-500/15 px-3 py-2 text-xs font-semibold text-win-400 transition hover:bg-win-500/25 disabled:cursor-wait disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar combinada"}
            </button>
          </div>

          <p className="mt-2 text-[9px] leading-relaxed text-mist-500">
            Máximo 3 patas · no mezclar 1T con partido completo · no mezclar dos picks del mismo
            partido.
          </p>
          </div>
        </div>
      ) : null}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 h-[52px] rounded-xl bg-win-500 px-3 text-left text-white shadow-2xl transition hover:brightness-105"
        >
          <span className="flex min-w-0 items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8a2 2 0 0 0 2-2V5h12v1a2 2 0 0 0 2 2v8a2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2V8Z" />
              <path d="M10 9v6M14 9v6" />
            </svg>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-950 text-[10px] font-bold text-white">
              {picks.length}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold tabular-nums">
              Justa {fairOdds.toFixed(2)} · Casa {marketOdds !== null ? marketOdds.toFixed(2) : "—"}
            </span>
            <span className="shrink-0 text-sm text-white/85">▴</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
