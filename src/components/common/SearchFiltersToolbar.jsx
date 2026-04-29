import React, { useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function FilterChip({
  icon: Icon,
  label,
  active = false,
  children,
  contentClassName,
  buttonClassName,
  labelClassName,
  iconClassName,
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 items-center overflow-hidden rounded-full border shadow-sm transition-all duration-200 ease-out",
            open ? "w-[168px] px-4" : "w-11 justify-center px-0",
            open
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : active
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700",
            buttonClassName,
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap pl-2 text-sm font-medium transition-all duration-200",
              open ? "max-w-[120px] opacity-100" : "max-w-0 opacity-0",
              labelClassName,
            )}
          >
            {label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className={cn("w-[280px] rounded-3xl border border-slate-200 bg-white p-4 shadow-xl", contentClassName)}
      >
        {children}
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
  filtersClassName,
  filterButtonClassName,
  filterLabelClassName,
  filterIconClassName,
  rightContent = null,
}) {
  return (
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className={cn("relative min-w-[220px] flex-1", searchClassName)}>
        <Search className={cn("pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400", searchIconClassName)} />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchPlaceholder}
          className={cn("h-11 rounded-full border-gray-200 bg-white pl-11 pr-4 shadow-sm", searchInputClassName)}
        />
      </div>

      <div className={cn("flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:flex-row-reverse", filtersClassName)}>
        {filters.map((filter) => (
          <FilterChip
            key={filter.id}
            icon={filter.icon}
            label={filter.label}
            active={Boolean(filter.active)}
            contentClassName={filter.contentClassName}
            buttonClassName={filterButtonClassName}
            labelClassName={filterLabelClassName}
            iconClassName={filterIconClassName}
          >
            {filter.content}
          </FilterChip>
        ))}

        {onClear && hasActiveFilters ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onClear}
            className="h-11 w-11 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}

        {rightContent}
      </div>
    </div>
  );
}
