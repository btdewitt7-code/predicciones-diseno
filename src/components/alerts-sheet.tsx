"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { HomeAlert } from "@/components/home-alerts";
import { dateTimeLabel } from "@/lib/format";

type Payload = {
  alerts: HomeAlert[];
  valueCount: number;
  upcoming: number;
  played: number;
  trainedAt: string | null;
  resultsSyncAt: string | null;
};

const KIND: Record<HomeAlert["kind"], { label: string; className: string }> = {
  value: { label: "VALUE", className: "bg-win-500/15 text-win-400 ring-win-500/30" },
  "1t": { label: "1T", className: "bg-cyan-400/15 text-cyan-400 ring-cyan-400/30" },
  lineup: { label: "XI", className: "bg-amber-400/10 text-amber-300 ring-amber-400/30" },
  high: { label: "ALTA", className: "bg-mint-500/15 text-mint-300 ring-mint-500/30" },
};

function emit(open: boolean) {
  window.dispatchEvent(new CustomEvent("alert-sheet", { detail: open }));
}

export function AlertsSheet() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const close = useCallback(() => {
    setOpen(false);
    emit(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alertas", { cache: "no-store" });
      if (!res.ok) throw new Error("alertas");
      const json = (await res.json()) as Payload;
      setData(json);
      setFetchedAt(Date.now());
    } catch {
      // Si falla el refresco, se mantiene lo último que se mostró.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const onOpen = () => {
      setOpen(true);
      emit(true);
    };
    window.addEventListener("open-alerts", onOpen);
    return () => window.removeEventListener("open-alerts", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!data || Date.now() - fetchedAt > 60_000) void load();
  }, [open, data, fetchedAt, load]);

  // Mientras la hoja está abierta: reloj para el "hace X" y refresco cada minuto.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    const refresh = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearInterval(ticker);
      window.clearInterval(refresh);
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!mounted) return null;

  const alerts = data?.alerts ?? [];
  const ageSeconds = fetchedAt > 0 ? Math.max(0, Math.floor((now - fetchedAt) / 1000)) : null;
  const ageLabel =
    ageSeconds === null
      ? null
      : ageSeconds < 60
        ? `hace ${ageSeconds} s`
        : `hace ${Math.floor(ageSeconds / 60)} min`;
  const stats = [
    { label: "Partidos", value: data ? data.upcoming.toLocaleString("es-ES") : "—" },
    { label: "Histórico", value: data ? data.played.toLocaleString("es-ES") : "—" },
    { label: "Value Bets", value: data ? String(data.valueCount) : "—", highlight: true },
  ];

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] lg:hidden ${open ? "" : "pointer-events-none"}`}
      style={{
        visibility: open ? "visible" : "hidden",
        transition: open ? "none" : "visibility 0s linear 250ms",
      }}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        aria-label="Cerrar alertas"
        onClick={close}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 h-full w-full cursor-default bg-black/55 transition-opacity duration-200 ${
          open ? "opacity-100 backdrop-blur-sm" : "pointer-events-none opacity-0 backdrop-blur-none"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Alertas"
        style={{ transform: open ? "translateY(0)" : "translateY(100%)" }}
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-ink-800 bg-ink-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2.5 shadow-2xl transition-transform duration-300"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">Alertas</h2>
            <p className="text-[11px] text-mist-500">
              Solo partidos de hoy.
              {ageLabel ? <span className="text-mist-500"> · {ageLabel}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar alertas"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-mist-400 transition hover:bg-ink-800 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {stats.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border px-2 py-2 text-center ${
                item.highlight ? "border-win-500/30 bg-win-500/10" : "border-ink-800 bg-ink-900/70"
              }`}
            >
              <div className="text-[8px] uppercase leading-tight tracking-wide text-mist-500">
                {item.label}
              </div>
              <div
                className={`mt-0.5 truncate text-sm font-semibold tabular-nums ${
                  item.highlight ? "text-win-400" : "text-white"
                }`}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        {loading && !data ? (
          <p className="py-8 text-center text-sm text-mist-500">Buscando alertas…</p>
        ) : alerts.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist-500">Sin alertas por ahora.</p>
        ) : (
          <div className="mt-3 divide-y divide-ink-800/70 rounded-xl border border-ink-800">
            {alerts.map((alert) => {
              const kind = KIND[alert.kind];
              return (
                <Link
                  key={alert.key}
                  href={alert.href}
                  onClick={close}
                  className="block px-3.5 py-3 transition active:bg-ink-850"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${kind.className}`}
                    >
                      {kind.label}
                    </span>
                    <span className="min-w-0 truncate text-[13px] font-medium text-white">
                      {alert.title}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-mist-500">{alert.detail}</p>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-800 bg-ink-900/60 px-3 py-2 text-[10px] text-mist-500">
          <span>Modelo: {data?.trainedAt ? dateTimeLabel(data.trainedAt) : "—"}</span>
          <span>Resultados: {data?.resultsSyncAt ? dateTimeLabel(data.resultsSyncAt) : "—"}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
