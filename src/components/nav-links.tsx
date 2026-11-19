"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Partidos" },
  { href: "/jugadas", label: "Jugadas" },
  { href: "/resultados", label: "Resultados" },
  { href: "/primer-tiempo", label: "1er Tiempo" },
  { href: "/ambos-marcan", label: "Ambos marcan" },
  { href: "/valor", label: "Value Bets" },
  { href: "/ligas", label: "Ligas" },
  { href: "/modelo", label: "Modelo" },
];

export function NavLinks({ vertical = false }: { vertical?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={vertical ? "flex flex-col gap-1" : "flex items-center gap-0.5 text-xs"}>
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              vertical
                ? active
                  ? "flex items-center gap-2 rounded-lg border-l-2 border-mint-500 bg-mint-500/10 px-3 py-2 text-[13px] font-medium text-mint-300"
                  : "flex items-center gap-2 rounded-lg border-l-2 border-transparent px-3 py-2 text-[13px] text-mist-400 transition hover:bg-ink-800 hover:text-white"
                : active
                  ? "whitespace-nowrap rounded-lg bg-mint-500/15 px-2.5 py-1.5 font-medium text-mint-300 ring-1 ring-mint-500/35"
                  : "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-mist-400 transition hover:bg-ink-800 hover:text-white"
            }
          >
            {vertical ? (
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  active ? "bg-mint-400" : "bg-ink-600"
                }`}
              />
            ) : null}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
