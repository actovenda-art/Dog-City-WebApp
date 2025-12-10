import React from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export default function SortableTableHead({ 
  children, 
  sortKey, 
  currentSort, 
  onSort,
  className = ""
}) {
  const isSorted = currentSort?.key === sortKey;
  const direction = isSorted ? currentSort?.direction : null;

  const handleClick = () => {
    if (!sortKey || !onSort) return;
    
    let newDirection = 'asc';
    if (isSorted && direction === 'asc') {
      newDirection = 'desc';
    }
    
    onSort({ key: sortKey, direction: newDirection });
  };

  if (!sortKey || !onSort) {
    return <TableHead className={className}>{children}</TableHead>;
  }

  return (
    <TableHead 
      className={`cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={handleClick}
    >
      <div className="flex items-center gap-1">
        {children}
        {isSorted ? (
          direction === 'asc' ? (
            <ArrowUp className="w-4 h-4 text-blue-600" />
          ) : (
            <ArrowDown className="w-4 h-4 text-blue-600" />
          )
        ) : (
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
        )}
      </div>
    </TableHead>
  );
}