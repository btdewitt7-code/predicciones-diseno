"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { APP_TIME_ZONE } from "@/lib/time";

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function CleanSavedButton({ days }: { days: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const clean = async () => {
    if (busy) return;

    const before = dateKey(new Date(Date.now() - days * 86_400_000));
    const ok = window.confirm(
      `¿Borrar las jugadas guardadas anteriores al ${before}? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/saved-combos?before=${before}`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: number };
      setMessage(
        data.deleted && data.deleted > 0
          ? `${data.deleted} ${data.deleted === 1 ? "jugada borrada" : "jugadas borradas"}`
          : "No había jugadas antiguas",
      );
      router.refresh();
      setTimeout(() => setMessage(null), 4000);
    } catch {
      setMessage("No se pudo limpiar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-[10px] text-mist-400">{message}</span> : null}
      <button
        type="button"
        onClick={clean}
        disabled={busy}
        className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-rose-300 transition hover:border-rose-400/50 hover:text-rose-200 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "Borrando…" : "Limpiar antiguas"}
      </button>
    </span>
  );
}
