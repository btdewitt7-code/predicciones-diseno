"use client";

import { useState } from "react";

type Result = {
  code: string;
  name: string;
  country: string;
  espn: number | null;
};

export function CoverageCheck({ codes }: { codes: string[] }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState(false);

  const check = async () => {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/cobertura?codes=${codes.join(",")}`, { cache: "no-store" });
      if (!res.ok) throw new Error("cobertura");
      const json = (await res.json()) as { leagues: Result[] };
      setResults(json.leagues);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (codes.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Ligas sin partidos próximos</h2>
          <p className="text-xs text-mist-500">
            {codes.length} competiciones en 0. Verificamos si ESPN tiene partidos para cargar.
          </p>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs text-mist-300 transition hover:border-mint-500/40 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Consultando ESPN…" : "Verificar"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-rose-300">No se pudo consultar ESPN. Intenta otra vez.</p>
      ) : null}

      {results ? (
        <ul className="mt-3 divide-y divide-ink-800/70 text-xs">
          {results.map((item) => {
            const faltan = item.espn !== null && item.espn > 0;
            return (
              <li key={item.code} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-mist-300">
                  {item.name} <span className="text-mist-500">· {item.country}</span>
                </span>
                <span
                  className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    faltan
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                      : "border-win-500/40 bg-win-500/10 text-win-400"
                  }`}
                >
                  {item.espn === null
                    ? "sin fuente"
                    : faltan
                      ? `${item.espn} por cargar`
                      : "sin partidos"}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {results && results.some((item) => (item.espn ?? 0) > 0) ? (
        <p className="mt-2 text-[11px] text-mist-500">
          Las que dicen “por cargar”: pulsa Actualizar para importarlas.
        </p>
      ) : null}
    </div>
  );
}
