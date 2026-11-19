import type { ReactNode } from "react";

type IconProps = { className?: string };

const paths: Record<string, ReactNode> = {
  "/": (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 3v3M16 3v3" />
    </>
  ),
  "/jugadas": (
    <>
      <path d="M3 9V7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V9a3 3 0 0 0 0 6v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V15a3 3 0 0 0 0-6z" />
      <path d="M12 7v10" strokeDasharray="2 2.5" />
    </>
  ),
  "/resultados": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
    </>
  ),
  "/primer-tiempo": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  "/ambos-marcan": (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  "/valor": (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20 7.5" />
      <path d="M14.5 7.5H20v5.5" />
    </>
  ),
  "/ligas": (
    <>
      <path d="M8 4h8v4.5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5v1.8A3 3 0 0 0 7.7 11M16 6h3v1.8A3 3 0 0 1 16.3 11" />
      <path d="M12 12.5V17M9 20h6" />
    </>
  ),
  "/modelo": (
    <>
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
  "/observacion": (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "/usuarios": (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.2 19.5a5.8 5.8 0 0 1 11.6 0" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.5 19.5a4.8 4.8 0 0 1 5.3-4.2" />
    </>
  ),
};

export function NavIcon({ href, className = "size-4" }: IconProps & { href: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[href] ?? null}
    </svg>
  );
}
