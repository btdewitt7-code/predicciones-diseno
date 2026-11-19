export function HomeStats({
  played,
  upcoming,
  valueBets,
  trainedAt,
}: {
  played: string;
  upcoming: number;
  valueBets: number;
  trainedAt: string | null;
}) {
  const items = [
    { label: "Prob. modelo", value: played, highlight: false },
    { label: "Precisos", value: String(upcoming), highlight: false },
    { label: "Value Bets", value: String(valueBets), highlight: true },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-800/70 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide text-mint-400">
          <span className="size-1.5 rounded-full bg-mint-400" />
          Dixon-Coles + Montecarlo
        </span>
        <span className="truncate text-[10px] text-mist-500">{trainedAt ?? "—"}</span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-ink-800/60 text-center">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 px-1.5 py-2.5">
            <div className="text-[8px] uppercase leading-tight tracking-wide text-mist-500">
              {item.label}
            </div>
            <div
              className={`mt-1 truncate text-base font-semibold tabular-nums ${
                item.highlight ? "text-win-400" : "text-white"
              }`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
