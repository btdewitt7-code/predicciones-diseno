"use client";

import { useEffect, useState } from "react";

export type MatchTab = { id: string; label: string };

const STAT_FILTERS = [
  { id: "goles", label: "Goles" },
  { id: "tiros", label: "Remates" },
  { id: "arco", label: "Al arco" },
  { id: "corners", label: "Córners" },
  { id: "faltas", label: "Faltas" },
  { id: "tarjetas", label: "Tarjetas" },
];

export function MatchTabs({ tabs }: { tabs: MatchTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "resumen");
  const [stat, setStat] = useState("goles");

  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>("[data-match-panel]").forEach((panel) => {
        const isActive = panel.dataset.matchPanel === active;
        const panelStat = panel.dataset.stat;
        const statOk =
          active !== "estadisticas" || !panelStat || panelStat === stat;
        panel.style.display = isActive && statOk ? "block" : "none";
      });
      document.querySelectorAll<HTMLElement>("[data-match-panel-except]").forEach((panel) => {
        const except = (panel.dataset.matchPanelExcept ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        panel.style.display = except.includes(active) ? "none" : "block";
      });
      const wrappers = [...document.querySelectorAll<HTMLElement>("section")].filter((section) =>
        section.querySelector("[data-match-panel]"),
      );
      wrappers.forEach((section) => {
        section.style.display = "";
      });
      wrappers.forEach((section) => {
        if (section.getBoundingClientRect().height === 0) section.style.display = "none";
      });
    };
    apply();
    window.dispatchEvent(new CustomEvent("match-tab-change", { detail: active }));
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, stat]);

  return (
    <div className="mb-2 space-y-2">
      <div className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-ink-800 px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-pressed={isActive}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                isActive
                  ? "border-b-mint-400 text-mint-300"
                  : "border-b-transparent text-mist-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {active === "estadisticas" ? (
        <div className="flex flex-wrap gap-1.5">
          {STAT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStat(item.id)}
              aria-pressed={stat === item.id}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                stat === item.id
                  ? "border-mint-500/40 bg-mint-500/10 text-mint-300"
                  : "border-ink-700 bg-ink-850 text-mist-400 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
