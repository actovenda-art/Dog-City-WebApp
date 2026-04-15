import React from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

function PairButton({ pair, onClick, disabled }) {
  return (
    <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center rounded-2xl border border-slate-700 bg-slate-900 px-2 text-white">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onClick(pair, pair[0])}
        className="flex h-11 items-center justify-center rounded-xl text-lg font-semibold transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pair[0]}
      </button>

      <span className="px-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        ou
      </span>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onClick(pair, pair[1])}
        className="flex h-11 items-center justify-center rounded-xl text-lg font-semibold transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pair[1]}
      </button>
    </div>
  );
}

export default function PinPairPad({
  pairs = [],
  selectedCount = 0,
  onSelectDigit,
  onBackspace,
  onShuffle,
  disabled = false,
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Toque no número correto dentro de cada par para montar seu PIN.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {pairs.map((pair, index) => (
          <PairButton
            key={`${pair.join("-")}-${index}`}
            pair={pair}
            onClick={onSelectDigit}
            disabled={disabled || selectedCount >= 6}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={onBackspace}
          disabled={disabled || selectedCount === 0}
          className="h-16 rounded-2xl border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
        >
          <Delete className="h-6 w-6" />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={`pin-dot-${index}`}
              className={index < selectedCount
                ? "h-3 w-3 rounded-full bg-blue-500"
                : "h-3 w-3 rounded-full border border-slate-400 bg-white/10"}
            />
          ))}
        </div>

        <Button type="button" variant="ghost" onClick={onShuffle} disabled={disabled} className="text-slate-300 hover:bg-slate-800 hover:text-white">
          Reembaralhar
        </Button>
      </div>
    </div>
  );
}
