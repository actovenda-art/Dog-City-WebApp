import React from "react";
import { Button } from "@/components/ui/button";
import { Delete, RotateCcw } from "lucide-react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function DigitButton({ digit, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(digit)}
      className="flex h-16 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-xl font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {digit}
    </button>
  );
}

export default function PinPairPad({
  value = "",
  onInputDigit,
  onBackspace,
  onClear,
  disabled = false,
}) {
  const normalizedValue = String(value || "").replace(/\D/g, "").slice(0, 6);
  const selectedCount = normalizedValue.length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Digite seu PIN usando o teclado numérico abaixo.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {DIGITS.slice(0, 9).map((digit) => (
          <DigitButton
            key={digit}
            digit={digit}
            disabled={disabled || selectedCount >= 6}
            onClick={onInputDigit}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={disabled || selectedCount === 0}
          className="h-16 rounded-2xl border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>

        <DigitButton
          digit="0"
          disabled={disabled || selectedCount >= 6}
          onClick={onInputDigit}
        />

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

      <div className="flex items-center justify-between gap-3">
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

        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
          {selectedCount}/6
        </div>
      </div>
    </div>
  );
}
