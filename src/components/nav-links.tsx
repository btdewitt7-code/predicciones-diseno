"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "@/components/nav-icons";

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

export function NavLinks({
  vertical = false,
  rail = false,
}: {
  vertical?: boolean;
  rail?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={
        vertical
          ? `flex flex-col gap-1 ${rail ? "items-stretch" : ""}`
          : "flex items-center gap-0.5 text-xs"
      }
    >
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            title={rail ? link.label : undefined}
            aria-label={rail ? link.label : undefined}
            aria-current={active ? "page" : undefined}
            className={
              vertical
                ? `flex items-center gap-2.5 rounded-lg border-l-2 py-2 text-[13px] ${
                    rail ? "justify-center px-0 xl:justify-start xl:px-2.5" : "px-3"
                  } ${
                    active
                      ? "border-mint-500 bg-mint-500/10 font-medium text-mint-300"
                      : "border-transparent text-mist-400 transition hover:bg-ink-800 hover:text-white"
                  }`
                : active
                  ? "whitespace-nowrap rounded-lg bg-mint-500/15 px-2.5 py-1.5 font-medium text-mint-300 ring-1 ring-mint-500/35"
                  : "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-mist-400 transition hover:bg-ink-800 hover:text-white"
            }
          >
            {vertical ? <NavIcon href={link.href} className="size-4" /> : null}
            <span className={rail ? "hidden truncate xl:inline" : "truncate"}>
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
