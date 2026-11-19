"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Quita una jugada guardada desde la lista de Resultados. */
export function RemoveSavedButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    const ok = window.confirm("¿Quitar esta jugada de guardadas?");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/saved-combos?id=${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      title="Quitar de guardadas"
      className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[10px] text-mist-400 transition hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-60"
    >
      {busy ? "Quitando…" : "Quitar"}
    </button>
  );
}
