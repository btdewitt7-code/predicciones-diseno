"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mientras haya partidos en juego, pide marcadores a /api/live y refresca
 * la página. Si no hay partidos en vivo, no hace ninguna petición.
 */
export function LiveAutoRefresh({
  active,
  seconds = 20,
  pollLive = true,
}: {
  active: boolean;
  seconds?: number;
  /** Si es false solo refresca la página, sin pedir marcadores en vivo. */
  pollLive?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      if (pollLive) {
        try {
          await fetch("/api/live", { cache: "no-store" });
        } catch {
          // sin conexión: se reintenta en el siguiente ciclo
        }
      }
      if (!cancelled) router.refresh();
    };

    // Primera consulta al entrar: evita esperar hasta el siguiente ciclo.
    tick();

    const timer = setInterval(tick, seconds * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, seconds, pollLive, router]);

  return null;
}
