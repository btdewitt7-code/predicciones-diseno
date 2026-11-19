"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon } from "@/components/nav-icons";

const items = [
  { href: "/", icon: "/", label: "Partidos" },
  { href: "/jugadas", icon: "/jugadas", label: "Jugadas" },
  { href: "/resultados", icon: "/resultados", label: "Resultados" },
  { href: "/#alertas", icon: "/alertas", label: "Alertas" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const isActive = (href: string) => {
    if (href === "/#alertas") return hash === "#alertas";
    if (href === "/") return pathname === "/" && hash !== "#alertas";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-800/80 bg-ink-950/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] transition ${
                active ? "text-mint-300" : "text-mist-500 hover:text-mist-300"
              }`}
            >
              {active ? (
                <span className="absolute inset-x-0 top-0 mx-auto h-0.5 w-10 rounded-full bg-mint-400" />
              ) : null}
              <NavIcon href={item.icon} className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
