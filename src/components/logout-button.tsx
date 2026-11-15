"use client";

import { useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);

  const exit = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Aunque falle, se limpia la cookie al recargar.
    }
    window.location.href = "/entrar";
  };

  return (
    <button
      type="button"
      onClick={exit}
      className={
        compact
          ? "shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2 py-1 text-[11px] text-mist-400 transition hover:text-white"
          : "shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[11px] text-mist-400 transition hover:text-white"
      }
    >
      {loading ? "Saliendo…" : "Salir"}
    </button>
  );
}
