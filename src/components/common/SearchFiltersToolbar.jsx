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
            "flex h-9 items-center overflow-hidden rounded-full border shadow-sm transition-all duration-200 ease-out sm:h-11",
            open ? "w-[148px] px-3 sm:w-[168px] sm:px-4" : "w-9 justify-center px-0 sm:w-11",
            open
              ? "border-blue-200 bg-blue-50 text-blue-700"
              : active
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700",
            buttonClassName,
          )}
        >
          <Icon className={cn("h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4", iconClassName)} />
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap pl-1.5 text-[12px] font-medium transition-all duration-200 sm:pl-2 sm:text-sm",
              open ? "max-w-[104px] opacity-100 sm:max-w-[120px]" : "max-w-0 opacity-0",
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
        className={cn("w-[260px] rounded-[22px] border border-slate-200 bg-white p-3.5 shadow-xl sm:w-[280px] sm:rounded-3xl sm:p-4", contentClassName)}
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
    <div className={cn("flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3", className)}>
      <div className={cn("relative min-w-0 flex-1", searchClassName)}>
        <Search className={cn("pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 sm:left-4 sm:h-4 sm:w-4", searchIconClassName)} />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder={searchPlaceholder}
          className={cn("h-9 rounded-full border-gray-200 bg-white pl-9 pr-3 text-[13px] shadow-sm sm:h-11 sm:pl-11 sm:pr-4 sm:text-sm", searchInputClassName)}
        />
      </div>

      <div className={cn("flex flex-wrap items-center justify-end gap-1.5 sm:flex-nowrap sm:flex-row-reverse sm:gap-2", filtersClassName)}>
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
            className="h-9 w-9 rounded-full border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 sm:h-11 sm:w-11"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        ) : null}

        {rightContent}
      </div>
    </div>
  );
}
