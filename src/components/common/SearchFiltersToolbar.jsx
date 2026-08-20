import { useState } from "react";
import { ListFilter, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function FiltersPopoverButton({
  filters = [],
  onClear,
  hasActiveFilters = false,
  contentClassName,
  buttonClassName,
  iconClassName,
  title = "Filtros",
  description = "Selecione uma ou mais opções.",
}) {
  const [open, setOpen] = useState(false);
  const activeFilterCount = filters.reduce((total, filter) => {
    if (Number.isFinite(filter.activeCount)) return total + Math.max(0, Number(filter.activeCount));
    return total + (filter.active ? 1 : 0);
  }, 0);

  if (filters.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn(
            "relative h-10 w-10 shrink-0 rounded-xl border-slate-200 bg-white p-0 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900",
            (open || activeFilterCount > 0) && "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800",
            buttonClassName,
          )}
          aria-label={`Abrir filtros${activeFilterCount ? `, ${activeFilterCount} ativo(s)` : ""}`}
        >
          <ListFilter className={cn("h-4 w-4", iconClassName)} />
          {activeFilterCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn("w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl", contentClassName)}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
          {onClear && hasActiveFilters ? (
            <button type="button" onClick={onClear} className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Limpar
            </button>
          ) : null}
        </div>

        <div className="max-h-[min(65vh,520px)] overflow-y-auto p-4">
          {filters.map((filter, index) => (
            <section
              key={filter.id}
              className={cn(index > 0 && "mt-4 border-t border-slate-100 pt-4", filter.sectionClassName)}
            >
              {filter.content}
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SearchFiltersToolbar({
  searchTerm = "",
  onSearchChange,
  searchPlaceholder = "Buscar...",
  filters = [],
  onClear,
  hasActiveFilters = false,
  className,
  searchClassName,
  searchInputClassName,
  searchIconClassName,
  onSearchFocus,
  onSearchBlur,
  onSearchKeyDown,
  showSearch = true,
  filtersClassName,
  rightContent = null,
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 sm:gap-3", className)}>
      {showSearch ? (
        <div className={cn("relative min-w-0 flex-1", searchClassName)}>
          <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 sm:left-4 sm:h-4 sm:w-4", searchIconClassName)} />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            onKeyDown={onSearchKeyDown}
            placeholder={searchPlaceholder}
            className={cn("h-10 rounded-xl border-slate-200 bg-white pl-9 pr-9 text-[13px] shadow-sm sm:pl-11 sm:text-sm", searchInputClassName)}
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => onSearchChange?.("")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={cn("flex shrink-0 items-center justify-end gap-2", filtersClassName)}>
        <FiltersPopoverButton
          filters={filters}
          onClear={onClear}
          hasActiveFilters={hasActiveFilters}
        />

        {rightContent}
      </div>
    </div>
  );
}
