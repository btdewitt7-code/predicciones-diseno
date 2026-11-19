"use client";

import { useEffect, useState } from "react";

export type MatchTab = { id: string; label: string };

const TAB_ICONS: Record<string, string> = {
  general: "/tabs/general.png",
  goles: "/tabs/goles.png",
  tiros: "/tabs/tiros.png",
  corners: "/tabs/corners.png",
  tarjetas: "/tabs/tarjetas.png",
  posiciones: "/tabs/posiciones.png",
  h2h: "/tabs/h2h.png",
};

function TabIcon({ id }: { id: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "size-[18px] shrink-0",
  };

  if (id === "goles") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7l3.2 2.3-1.2 3.8h-4L8.8 9.3 12 7z" />
        <path d="M12 3v4M4.5 9.5l4.3-.2M6.5 18l3.5-2.9M17.5 18l-3.5-2.9M19.5 9.5l-4.3-.2" />
      </svg>
    );
  }
  if (id === "tiros") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </svg>
    );
  }
  if (id === "corners") {
    return (
      <svg {...common}>
        <path d="M6 21V4" />
        <path d="M6 5h9l-2 3 2 3H6" />
      </svg>
    );
  }
  if (id === "tarjetas") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="size-[18px] shrink-0">
        <rect x="7" y="4" width="7" height="12" rx="1.3" fill="#f5c451" transform="rotate(-9 10 10)" />
        <rect x="11" y="7" width="7" height="12" rx="1.3" fill="#fb7185" transform="rotate(7 14 13)" />
      </svg>
    );
  }
  if (id === "h2h") {
    return (
      <svg {...common}>
        <path d="M7 7h10l-3-3M17 17H7l3 3" />
      </svg>
    );
  }
  if (id === "posiciones") {
    return (
      <svg {...common}>
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeWidth={2.4}>
      <path d="M4 20V10M9 20V6M14 20v-8M19 20V4" />
    </svg>
  );
}

export function MatchTabs({ tabs }: { tabs: MatchTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "general");

  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>("[data-match-panel]").forEach((panel) => {
        panel.style.display = panel.dataset.matchPanel === active ? "block" : "none";
      });
      document.querySelectorAll<HTMLElement>("[data-match-panel-except]").forEach((panel) => {
        const except = (panel.dataset.matchPanelExcept ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        panel.style.display = except.includes(active) ? "none" : "block";
      });
    };
    apply();
    window.dispatchEvent(new CustomEvent("match-tab-change", { detail: active }));
    // La página puede refrescarse en vivo: reaplicamos cuando cambie el DOM.
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);

  return (
    <div className="sticky top-[57px] z-10 -mx-1 flex items-center gap-0 overflow-x-auto border-b border-ink-800 bg-ink-950/95 px-1 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:top-[57px]">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            aria-pressed={isActive}
            className={`flex shrink-0 items-center gap-2 border-r border-ink-800 px-3 py-2.5 text-ui-body transition last:border-r-0 ${
              isActive
                ? "border-b-2 border-b-mint-500 font-semibold text-mint-400"
                : "border-b-2 border-b-transparent text-mist-400 hover:text-mist-300"
            }`}
          >
            {TAB_ICONS[tab.id] ? (
              <img
                src={TAB_ICONS[tab.id]}
                alt=""
                width={20}
                height={20}
                decoding="async"
                className="size-5 shrink-0 object-contain"
              />
            ) : (
              <TabIcon id={tab.id} />
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
