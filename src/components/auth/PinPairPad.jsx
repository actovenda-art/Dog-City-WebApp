import React from "react";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";

function PairButton({ pair, onClick, disabled }) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled}
      onClick={() => onClick(pair)}
      className="h-16 rounded-2xl border-slate-700 bg-slate-900 text-lg font-semibold text-white hover:bg-slate-800 hover:text-white"
    >
      {pair[0]} ou {pair[1]}
    </Button>
  );
}

export default function PinPairPad({
  pairs = [],
  selectedPairs = [],
  onSelectPair,
  onBackspace,
  onShuffle,
  disabled = false,
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {pairs.map((pair, index) => (
          <PairButton
            key={`${pair.join("-")}-${index}`}
            pair={pair}
            onClick={onSelectPair}
            disabled={disabled || selectedPairs.length >= 6}
          />
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={onBackspace}
          disabled={disabled || selectedPairs.length === 0}
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
              className={selectedPairs[index]
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
