import Link from "next/link";

export type HomeAlert = {
  key: string;
  kind: "value" | "1t" | "lineup" | "high";
  title: string;
  detail: string;
  href: string;
};

const KIND: Record<HomeAlert["kind"], { label: string; className: string }> = {
  value: { label: "VALUE", className: "bg-win-500/15 text-win-400 ring-win-500/30" },
  "1t": { label: "1T", className: "bg-cyan-400/15 text-cyan-400 ring-cyan-400/30" },
  lineup: { label: "XI", className: "bg-amber-400/10 text-amber-300 ring-amber-400/30" },
  high: { label: "ALTA", className: "bg-mint-500/15 text-mint-300 ring-mint-500/30" },
};

export function HomeAlerts({
  alerts,
  trainedAt,
  resultsAt,
}: {
  alerts: HomeAlert[];
  trainedAt: string | null;
  resultsAt: string | null;
}) {
  const visible = alerts;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-800 px-4 py-3">
        <h2 className="text-ui-card-title font-semibold text-white">Alertas</h2>
        <p className="text-ui-caption text-mist-500">Solo partidos de hoy.</p>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-5 text-ui-body-sm text-mist-500">Sin alertas por ahora.</p>
      ) : (
        <div className="divide-y divide-ink-800/70 max-h-[46vh] overflow-y-auto scroll-thin">
          {visible.map((alert) => {
            const kind = KIND[alert.kind];
            return (
              <Link
                key={alert.key}
                href={alert.href}
                className="block px-4 py-3 transition hover:bg-ink-850/70"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${kind.className}`}
                  >
                    {kind.label}
                  </span>
                  <span className="min-w-0 truncate text-ui-body-sm font-medium text-white">
                    {alert.title}
                  </span>
                </div>
                <p className="mt-1 text-ui-caption text-mist-500">{alert.detail}</p>
              </Link>
            );
          })}
        </div>
      )}

      <div className="border-t border-ink-800 bg-ink-850/40 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-mist-500">
          Sistema
        </div>
        <p className="mt-1 text-ui-caption text-mist-500">
          Modelo: {trainedAt ?? "—"}
        </p>
        <p className="text-ui-caption text-mist-500">Resultados: {resultsAt ?? "—"}</p>
      </div>
    </div>
  );
}
