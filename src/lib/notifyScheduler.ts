import { notifyBeforeKickoff } from "./notifyMatches";
import { notifyDailySummary } from "./notifySummary";

const globalStore = globalThis as typeof globalThis & {
  __prediccionesNotifyTimer?: boolean;
};

/** Revisa cada 2 minutos si hay partidos de hoy que empiezan pronto. */
export function startNotifyScheduler() {
  if (globalStore.__prediccionesNotifyTimer) return;
  globalStore.__prediccionesNotifyTimer = true;

  const tick = () => {
    notifyDailySummary().catch(() => undefined);
    notifyBeforeKickoff().catch(() => undefined);
  };

  setTimeout(tick, 15_000);
  setInterval(tick, 2 * 60_000);
}
