"use client";

import { useMemo, useState } from "react";
import {
  FIRST_HALF_LINES,
  firstHalfCombo,
  firstHalfProbability,
  type FirstHalfMatch,
} from "@/lib/firstHalf";
import { SaveComboButton } from "@/components/save-combo-button";

export function FirstHalfSave({
  match,
  savedLines,
}: {
  match: FirstHalfMatch;
  savedLines: number[];
}) {
  const lines = FIRST_HALF_LINES.filter((line) => firstHalfProbability(match, line) > 0);
  const [line, setLine] = useState<number>(
    savedLines.length > 0 ? savedLines[0] : (lines[0] ?? FIRST_HALF_LINES[0]),
  );
  const combo = useMemo(() => firstHalfCombo(match, line), [match, line]);

  if (lines.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={line}
        onChange={(event) => setLine(Number(event.target.value))}
        aria-label="Línea de goles del primer tiempo"
        className="rounded-lg border border-ink-700 bg-ink-850 px-1.5 py-1 text-[11px] text-mist-300 outline-none transition hover:text-white focus:border-mint-500/50"
      >
        {lines.map((value) => (
          <option key={value} value={value}>
            +{value}
          </option>
        ))}
      </select>
      <SaveComboButton
        key={line}
        combo={combo}
        initialSaved={savedLines.includes(line)}
      />
    </div>
  );
}
