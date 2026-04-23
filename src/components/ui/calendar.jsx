import * as React from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

function CalendarDropdown({
  className,
  style,
  name,
  value,
  onChange,
  children,
  caption,
  ...props
}) {
  const title = name === "months" ? "Mês" : name === "years" ? "Ano" : ""

  return (
    <div className={cn("min-w-0", className)} style={style}>
      {title ? (
        <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {title}
        </span>
      ) : null}
      <div className="relative">
        <select
          name={name}
          aria-label={props["aria-label"]}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          value={value}
          onChange={onChange}
        >
          {children}
        </select>
        <div
          aria-hidden="true"
          className="flex h-11 items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 text-[15px] font-semibold text-slate-900 shadow-sm"
        >
          <span className="truncate capitalize">{caption}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        </div>
      </div>
    </div>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout,
  fixedWeeks,
  components,
  labels,
  fromDate,
  fromMonth,
  fromYear,
  toDate,
  toMonth,
  toYear,
  ...props
}) {
  const currentYear = new Date().getFullYear()
  const resolvedCaptionLayout = captionLayout ?? "dropdown-buttons"
  const resolvedFixedWeeks = fixedWeeks ?? true
  const resolvedFromYear =
    fromDate || fromMonth || typeof fromYear === "number" ? fromYear : currentYear - 100
  const resolvedToYear =
    toDate || toMonth || typeof toYear === "number" ? toYear : currentYear + 10

  return (
    (<DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={resolvedCaptionLayout}
      fixedWeeks={resolvedFixedWeeks}
      fromDate={fromDate}
      fromMonth={fromMonth}
      fromYear={resolvedFromYear}
      toDate={toDate}
      toMonth={toMonth}
      toYear={resolvedToYear}
      className={cn("p-3", className)}
      classNames={{
        vhidden: "sr-only",
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_dropdowns: "flex items-center gap-2",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        dropdown_month: "relative",
        dropdown_year: "relative",
        dropdown_icon: "h-3.5 w-3.5",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      labels={{
        labelMonthDropdown: () => "Selecionar mês",
        labelYearDropdown: () => "Selecionar ano",
        labelNext: () => "Próximo mês",
        labelPrevious: () => "Mês anterior",
        ...labels,
      }}
      components={{
        Dropdown: CalendarDropdown,
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        IconDropdown: ({ className, ...props }) => (
          <ChevronDown className={cn("h-3.5 w-3.5", className)} {...props} />
        ),
        ...components,
      }}
      {...props} />)
  );
}
Calendar.displayName = "Calendar"

export { Calendar }
