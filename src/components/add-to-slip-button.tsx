"use client";

import { useEffect, useState } from "react";
import { addPick, readSlip, subscribe, type SlipPick } from "@/lib/betSlip";

export function AddToSlipButton({ pick }: { pick: SlipPick }) {
  const [inSlip, setInSlip] = useState(false);

  useEffect(() => {
    const update = () => setInSlip(readSlip().some((item) => item.key === pick.key));
    update();
    return subscribe(update);
  }, [pick.key]);

  const add = () => {
    const result = addPick(pick);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    setInSlip(true);
  };

  return (
    <button
      type="button"
      onClick={add}
      disabled={inSlip}
      className="shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1 text-[10px] font-semibold text-mist-300 transition hover:border-mint-500/40 hover:text-white disabled:cursor-default disabled:border-mint-500/30 disabled:bg-mint-500/10 disabled:text-mint-400"
    >
      {inSlip ? "En combinada" : "+ Combinar"}
    </button>
  );
}
