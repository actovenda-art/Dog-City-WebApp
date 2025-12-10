import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calendar, Filter, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function TableFilters({ 
  searchTerm, 
  onSearchChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  filters = [],
  onClearFilters
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input 
          placeholder="Pesquisar..." 
          value={searchTerm} 
          onChange={(e) => onSearchChange(e.target.value)} 
          className="pl-9 h-9"
        />
      </div>

      {/* Date Period */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 gap-2">
            <Calendar className="w-4 h-4" />
            Período
            {(dateStart || dateEnd) && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                1
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Data inicial</label>
              <Input 
                type="date" 
                value={dateStart} 
                onChange={(e) => onDateStartChange(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Data final</label>
              <Input 
                type="date" 
                value={dateEnd} 
                onChange={(e) => onDateEndChange(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Custom Filters */}
      {filters.map((filter, idx) => (
        <Popover key={idx}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 gap-2">
              <Filter className="w-4 h-4" />
              {filter.label}
              {filter.value && filter.value !== "all" && (
                <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
                  1
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <Select value={filter.value} onValueChange={filter.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {filter.options.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PopoverContent>
        </Popover>
      ))}

      {/* Clear Filters */}
      {(searchTerm || dateStart || dateEnd || filters.some(f => f.value !== "all")) && (
        <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-9 gap-1">
          <X className="w-4 h-4" />
          Limpar
        </Button>
      )}
    </div>
  );
}