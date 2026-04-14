import React from "react";

import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import { Calendar, Filter } from "lucide-react";

export default function TableFilters({
  searchTerm,
  onSearchChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  filters = [],
  onClearFilters,
}) {
  const hasCustomActiveFilters = filters.some((filter) => filter.value && filter.value !== "all");

  return (
    <SearchFiltersToolbar
      searchTerm={searchTerm}
      onSearchChange={onSearchChange}
      searchPlaceholder="Pesquisar..."
      hasActiveFilters={Boolean(searchTerm || dateStart || dateEnd || hasCustomActiveFilters)}
      onClear={onClearFilters}
      filters={[
        {
          id: "period",
          label: "Período",
          icon: Calendar,
          active: Boolean(dateStart || dateEnd),
          content: (
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-700">Selecionar período</label>
              <DateRangePickerInput
                startValue={dateStart}
                endValue={dateEnd}
                onStartChange={onDateStartChange}
                onEndChange={onDateEndChange}
              />
            </div>
          ),
        },
        ...filters.map((filter, index) => ({
          id: filter.id || `custom-filter-${index}`,
          label: filter.label,
          icon: filter.icon || Filter,
          active: Boolean(filter.value && filter.value !== "all"),
          content: (
            <Select value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
        })),
      ]}
    />
  );
}
