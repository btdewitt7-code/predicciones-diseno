"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "running" | "done" | "error";

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const start = useCallback(async () => {
    if (status === "running") return;
    setStartedAt(Date.now());
    setElapsed(0);
    setStatus("running");
    try {
      await fetch("/api/refresh", { method: "POST" });
    } catch {
      setStatus("error");
    }
  }, [status]);

  // Si la página se recarga mientras hay una actualización en curso, retomamos el reloj.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/refresh", { cache: "no-store" });
        const data = (await res.json()) as { running: boolean; startedAt: string | null };
        if (!alive || !data.running || !data.startedAt) return;
        setStartedAt(Date.parse(data.startedAt));
        setStatus("running");
      } catch {
        // sin conexión: se queda en reposo
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Reloj de la actualización, en segundos.
  useEffect(() => {
    if (status !== "running" || !startedAt) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status, startedAt]);

  useEffect(() => {
    if (status !== "running") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/refresh", { cache: "no-store" });
        const data = (await res.json()) as {
          running: boolean;
          exitCode: number | null;
          startedAt: string | null;
          finishedAt: string | null;
        };
        if (data.running) return;

        // Sin ejecución registrada (por ejemplo, el servidor se reinició): no es un error.
        if (data.exitCode === null && !data.finishedAt) {
          setStatus("idle");
          return;
        }

        if (data.startedAt && data.finishedAt) {
          setElapsed(
            Math.round((Date.parse(data.finishedAt) - Date.parse(data.startedAt)) / 1000),
          );
        }

        if (data.exitCode === 0) {
          setStatus("done");
          router.refresh();
        } else {
          setStatus("error");
        }
        setTimeout(() => setStatus("idle"), 5000);
      } catch {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 5000);
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [status, router]);

  const label =
    status === "running"
      ? `Actualizando ${formatElapsed(elapsed)}`
      : status === "done"
        ? `Listo · ${formatElapsed(elapsed)}`
        : status === "error"
          ? "Error"
          : "Actualizar";

  return (
    <button
      type="button"
      onClick={start}
      disabled={status === "running"}
      title="Descargar resultados, goleadores, bajas y reentrenar"
      className={`inline-flex items-center gap-2 rounded-lg border transition disabled:cursor-wait ${
        compact ? "size-9 justify-center" : "px-2.5 py-1.5 text-xs tabular-nums"
      } ${
        status === "done"
          ? "border-win-500/40 bg-win-500/10 text-win-400"
          : status === "error"
            ? "border-rose-400/40 bg-rose-400/10 text-rose-400"
            : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`size-3.5 ${status === "running" ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className={compact ? "sr-only" : "hidden sm:inline"}>{label}</span>
    </button>
  );
}
