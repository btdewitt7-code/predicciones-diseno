"use client";

import { useEffect, useRef } from "react";

type Proximo = {
  id: number;
  league: string;
  home: string;
  away: string;
  kickoff: string;
};

const TREINTA = 30 * 60_000;
const DIEZ = 10 * 60_000;
const SONIDO = "/sounds/alerta.mp3";

/**
 * Aviso sonoro cuando un partido está por empezar: 30 y 10 minutos antes.
 * Consulta `/api/proximos` cada 30 s y recuerda en `localStorage` qué avisos
 * ya sonaron para no repetirlos al recargar.
 */
export function KickoffAlerts() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const desbloqueado = useRef(false);

  // Los navegadores bloquean el audio hasta que hay una interacción.
  useEffect(() => {
    const desbloquear = () => {
      if (desbloqueado.current) return;
      desbloqueado.current = true;
      try {
        const el = audio.current ?? (audio.current = new Audio(SONIDO));
        el.volume = 0;
        void el
          .play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
            el.volume = 0.9;
          })
          .catch(() => {
            el.volume = 0.9;
          });
      } catch {
        // Sin audio disponible.
      }
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };

    window.addEventListener("pointerdown", desbloquear, { passive: true });
    window.addEventListener("keydown", desbloquear);
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
  }, []);

  useEffect(() => {
    let activo = true;

    const sonar = () => {
      try {
        if (!audio.current) audio.current = new Audio(SONIDO);
        audio.current.volume = 0.9;
        audio.current.currentTime = 0;
        void audio.current.play().catch(() => undefined);
      } catch {
        // Sin audio disponible.
      }
    };

    const yaSonó = (id: number, minutos: number) => {
      try {
        return localStorage.getItem(`kickoff-sound:${id}:${minutos}`) === "1";
      } catch {
        return false;
      }
    };

    const marcar = (id: number, minutos: number) => {
      try {
        localStorage.setItem(`kickoff-sound:${id}:${minutos}`, "1");
      } catch {
        // Sin almacenamiento: se avisa igual.
      }
    };

    const revisar = async () => {
      try {
        const res = await fetch("/api/proximos", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { matches: Proximo[] };
        if (!activo) return;

        let hayAviso = false;
        for (const match of data.matches) {
          // `kickoff` viene sin zona y representa UTC (igual que en el resto de la app).
          const restante = Date.parse(`${match.kickoff}Z`) - Date.now();
          if (restante <= 0) continue;

          if (restante <= DIEZ) {
            if (!yaSonó(match.id, 10)) {
              marcar(match.id, 10);
              hayAviso = true;
            }
            continue;
          }

          if (restante <= TREINTA && !yaSonó(match.id, 30)) {
            marcar(match.id, 30);
            hayAviso = true;
          }
        }

        if (hayAviso) sonar();
      } catch {
        // Si falla la consulta, se reintenta en el próximo ciclo.
      }
    };

    void revisar();
    const timer = window.setInterval(() => void revisar(), 30_000);
    return () => {
      activo = false;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
