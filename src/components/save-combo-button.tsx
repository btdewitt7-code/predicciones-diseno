"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Combo } from "@/lib/combos";

type Status = "idle" | "saving" | "saved" | "removing" | "error";

export function SaveComboButton({
  combo,
  initialSaved = false,
  repeatedMatches = [],
}: {
  combo: Combo;
  initialSaved?: boolean;
  /** Partidos que ya aparecen en otra jugada guardada. */
  repeatedMatches?: string[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialSaved ? "saved" : "idle");

  const save = async () => {
    if (status === "saving" || status === "saved" || status === "removing") return;

    const risky =
      Number.isFinite(combo.probability) &&
      combo.probability > 0 &&
      combo.probability < 0.55;
    if (repeatedMatches.length > 0 || risky) {
      const lines: string[] = [];
      if (risky) {
        lines.push(
          `Esta jugada tiene ${Math.round(combo.probability * 100)}% de probabilidad.`,
        );
      }
      if (repeatedMatches.length > 0) {
        lines.push(`Ya tienes otra jugada guardada con:\n• ${repeatedMatches.join("\n• ")}`);
      }
      const ok = window.confirm(`${lines.join("\n\n")}\n\n¿Guardar igual?`);
      if (!ok) return;
    }

    setStatus("saving");
    try {
      const res = await fetch("/api/save-combo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(combo),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  };

  const remove = async () => {
    if (status === "removing") return;
    const ok = window.confirm("¿Quitar esta jugada de guardadas?");
    if (!ok) return;

    setStatus("removing");
    try {
      const res = await fetch("/api/save-combo", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legs: combo.legs }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
    }
  };

  const saved = status === "saved";
  const busy = status === "saving" || status === "removing";
  const label =
    status === "saving"
      ? "Guardando…"
      : status === "removing"
        ? "Quitando…"
        : status === "saved"
          ? "Guardada ✓"
          : status === "error"
            ? "Error"
            : "Guardar";

  return (
    <button
      type="button"
      onClick={saved ? remove : save}
      disabled={busy}
      title={saved ? "Clic para quitar de guardadas" : "Guardar jugada"}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] transition disabled:cursor-default ${
        status === "saved"
          ? "border-win-500/40 bg-win-500/10 text-win-400 hover:border-rose-400/40 hover:bg-rose-400/10 hover:text-rose-300"
          : status === "error"
            ? "border-rose-400/40 bg-rose-400/10 text-rose-400"
            : "border-ink-700 bg-ink-850 text-mist-300 hover:border-mint-500/40 hover:text-white"
      }`}
    >
      {label}
      {status === "saved" ? <span className="ml-1 opacity-70">✕</span> : null}
    </button>
  );
}
