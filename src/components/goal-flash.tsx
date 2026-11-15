"use client";

import { useEffect, useRef, useState } from "react";

const CONFETTI_COLORS = ["#4ade80", "#38bdf8", "#fbbf24", "#e8f0f7", "#86efac"];

type GoalFlashProps = {
  /** Marcador actual. `null` cuando el partido aún no tiene resultado. */
  home: number | null;
  away: number | null;
  /** `card` para la ficha del partido; `row` para la fila de la lista. */
  variant?: "card" | "row";
  /** Solo en la ficha del partido: reproduce el sonido de gol. */
  sound?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Detecta cuando el marcador sube y lanza la animación de gol.
 * El estado sobrevive a los `router.refresh()` de LiveAutoRefresh.
 */
export function GoalFlash({
  home,
  away,
  variant = "card",
  sound = false,
  className = "",
  children,
}: GoalFlashProps) {
  const [flashing, setFlashing] = useState(false);
  const previous = useRef<string | null>(null);
  const initialized = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const current = home !== null && away !== null ? `${home}-${away}` : null;

    // Primer render: solo memoriza el marcador, sin animar.
    if (!initialized.current) {
      initialized.current = true;
      previous.current = current;
      return;
    }

    const before = previous.current;
    previous.current = current;
    if (!before || !current || before === current) return;

    const [beforeHome, beforeAway] = before.split("-").map(Number);
    const [nowHome, nowAway] = current.split("-").map(Number);
    if (nowHome + nowAway <= beforeHome + beforeAway) return;

    setFlashing(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlashing(false), 2200);

    if (sound) {
      try {
        if (!audio.current) {
          audio.current = new Audio("/sounds/gol-corto.mp3");
          audio.current.preload = "auto";
          audio.current.volume = 0.85;
        }
        audio.current.currentTime = 0;
        void audio.current.play().catch(() => undefined);
      } catch {
        // Sin audio disponible: la animación sigue igual.
      }
    }
  }, [home, away, sound]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      className={`goal-root goal-root-${variant} ${flashing ? "goal-flash" : ""} ${className}`}
    >
      {flashing ? (
        <>
          <span className="goal-badge" aria-hidden>
            ¡GOL!
          </span>
          {variant === "card" ? (
            <span className="goal-confetti" aria-hidden>
              {Array.from({ length: 22 }, (_, index) => (
                <i
                  key={index}
                  style={{
                    left: `${(index * 37 + 11) % 100}%`,
                    background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
                    animationDelay: `${(index % 5) * 0.06}s`,
                    animationDuration: `${1.1 + (index % 4) * 0.18}s`,
                  }}
                />
              ))}
            </span>
          ) : null}
        </>
      ) : null}
      {children}
    </div>
  );
}
