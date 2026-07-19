import React from "react";
import { Button } from "@/components/ui/button";
import { Delete, RotateCcw } from "lucide-react";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function DigitButton({ digit, disabled, onClick, variant }) {
  const isLight = variant === "light";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(digit)}
      className={`flex items-center justify-center font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        isLight
          ? "h-12 rounded-xl border border-slate-200 bg-white text-base text-slate-900 shadow-sm hover:border-blue-300 hover:bg-blue-50"
          : "h-16 rounded-2xl border border-slate-700 bg-slate-900 text-xl text-white hover:bg-slate-800"
      }`}
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
  variant = "dark",
}) {
  const normalizedValue = String(value || "").replace(/\D/g, "").slice(0, 6);
  const selectedCount = normalizedValue.length;
  const isLight = variant === "light";

  return (
    <div className={isLight ? "space-y-3" : "space-y-4"}>
      <p className={`text-xs ${isLight ? "text-slate-500" : "text-slate-400"}`}>
        Digite seu PIN usando o teclado numérico abaixo.
      </p>

      <div className={`grid grid-cols-3 ${isLight ? "gap-2" : "gap-3"}`}>
        {DIGITS.slice(0, 9).map((digit) => (
          <DigitButton
            key={digit}
            digit={digit}
            disabled={disabled || selectedCount >= 6}
            onClick={onInputDigit}
            variant={variant}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={onClear}
          disabled={disabled || selectedCount === 0}
          className={isLight
            ? "h-12 rounded-xl border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            : "h-16 rounded-2xl border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"}
        >
          <RotateCcw className={isLight ? "h-4 w-4" : "h-5 w-5"} />
        </Button>

        <DigitButton
          digit="0"
          disabled={disabled || selectedCount >= 6}
          onClick={onInputDigit}
          variant={variant}
        />

        <Button
          type="button"
          variant="outline"
          onClick={onBackspace}
          disabled={disabled || selectedCount === 0}
          className={isLight
            ? "h-12 rounded-xl border-slate-200 bg-white text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            : "h-16 rounded-2xl border-slate-700 bg-slate-900 text-white hover:bg-slate-800 hover:text-white"}
        >
          <Delete className={isLight ? "h-5 w-5" : "h-6 w-6"} />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={`pin-dot-${index}`}
              className={index < selectedCount
                ? "h-3 w-3 rounded-full bg-blue-500"
                : `h-3 w-3 rounded-full border ${isLight ? "border-slate-300 bg-slate-100" : "border-slate-400 bg-white/10"}`}
            />
          ))}
        </div>

        <div className={`rounded-full border px-3 py-1 text-xs ${
          isLight ? "border-slate-200 bg-white text-slate-500" : "border-slate-700 text-slate-400"
        }`}>
          {selectedCount}/6
        </div>
      </div>
    </div>
  );
}
