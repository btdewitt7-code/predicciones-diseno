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

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 text-xs">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "whitespace-nowrap rounded-lg bg-mint-500/15 px-2.5 py-1.5 font-medium text-mint-300 ring-1 ring-mint-500/35"
                : "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-mist-400 transition hover:bg-ink-800 hover:text-white"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
