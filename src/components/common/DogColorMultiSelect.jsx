import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, X } from "lucide-react";

export const DOG_COAT_OPTIONS = ["Curto", "Médio", "Longo"];

export const DOG_COLOR_OPTIONS = [
  "Amarelo",
  "Beje",
  "Preto",
  "Marrom",
  "Branco",
  "Laranja",
  "Cobre",
  "Dourado",
  "Ouro Claro",
  "Palha",
  "Creme",
  "Cinza",
  "Prata",
  "Cinza azulado",
  "Azul acinzentado",
  "Chocolate Diluido",
];

function normalizeColorToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function parseSelectedDogColors(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  const rawValue = String(value || "").trim();
  if (!rawValue) return [];

  return [...new Set(
    rawValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function serializeSelectedDogColors(colors) {
  return parseSelectedDogColors(colors).join(", ");
}

export function DogColorMultiSelect({
  value,
  onChange,
  maxSelections = 5,
  placeholder = "Selecione até 5 cores",
  triggerClassName = "",
  badgeClassName = "",
  emptyMessage = "Nenhuma cor encontrada.",
  searchPlaceholder = "Pesquisar cor...",
}) {
  const [open, setOpen] = useState(false);
  const selectedColors = useMemo(() => parseSelectedDogColors(value), [value]);

  const toggleColor = (color) => {
    const isSelected = selectedColors.includes(color);
    if (!isSelected && selectedColors.length >= maxSelections) return;

    const nextColors = isSelected
      ? selectedColors.filter((item) => item !== color)
      : [...selectedColors, color];

    onChange(serializeSelectedDogColors(nextColors));
  };

  const removeColor = (color) => {
    onChange(serializeSelectedDogColors(selectedColors.filter((item) => item !== color)));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-auto min-h-9 w-full justify-between rounded-xl border-slate-200 bg-white/90 px-2.5 py-2 text-left text-[13px] font-normal text-slate-900 shadow-sm hover:bg-white sm:min-h-12 sm:rounded-2xl sm:px-4 sm:text-[15px]",
              triggerClassName
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left text-slate-900">
              {selectedColors.length ? selectedColors.join(", ") : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {DOG_COLOR_OPTIONS.map((color) => {
                  const isSelected = selectedColors.includes(color);
                  const limitReached = !isSelected && selectedColors.length >= maxSelections;

                  return (
                    <CommandItem
                      key={color}
                      value={`${normalizeColorToken(color)} ${color}`}
                      disabled={limitReached}
                      onSelect={() => toggleColor(color)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                      <span>{color}</span>
                      {limitReached ? (
                        <span className="ml-auto text-[10px] font-medium text-slate-400">Limite</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedColors.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedColors.map((color) => (
            <Badge
              key={color}
              className={cn("flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-blue-700", badgeClassName)}
            >
              <span>{color}</span>
              <button
                type="button"
                onClick={() => removeColor(color)}
                className="rounded-full text-blue-700 transition hover:text-blue-900"
                aria-label={`Remover cor ${color}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default DogColorMultiSelect;
