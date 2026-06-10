import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
  return (
    <div className={cn("min-w-0", className)} style={style}>
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
          className="flex h-8 items-center justify-between rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-medium text-slate-900 shadow-sm"
        >
          <span className="truncate capitalize">{caption}</span>
          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
        </div>
      </div>
    </div>
  );
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
  const currentYear = new Date().getFullYear();
  const resolvedCaptionLayout = captionLayout ?? "buttons";
  const resolvedFixedWeeks = fixedWeeks ?? true;
  const resolvedFromYear =
    fromDate || fromMonth || typeof fromYear === "number" ? fromYear : currentYear - 100;
  const resolvedToYear =
    toDate || toMonth || typeof toYear === "number" ? toYear : currentYear + 10;

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={resolvedCaptionLayout}
      fixedWeeks={resolvedFixedWeeks}
      fromDate={fromDate}
      fromMonth={fromMonth}
      fromYear={resolvedFromYear}
      toDate={toDate}
      toMonth={toMonth}
      toYear={resolvedToYear}
      className={cn("p-2.5", className)}
      classNames={{
        vhidden: "sr-only",
        months: "flex flex-col",
        month: "space-y-1.5",
        caption: "grid grid-cols-[32px_1fr_32px] items-center gap-1.5 px-0 pt-0 pb-1",
        caption_dropdowns: "col-start-2 flex min-w-0 items-center justify-center gap-1.5",
        caption_label:
          "col-start-2 flex h-8 items-center justify-center px-2 text-center text-[13px] font-semibold capitalize leading-none text-slate-900",
        nav: "contents",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 rounded-full border-slate-200 bg-white p-0 text-slate-600 opacity-100 shadow-sm hover:bg-slate-50 hover:text-slate-900"
        ),
        nav_button_previous: "col-start-1 justify-self-start",
        nav_button_next: "col-start-3 justify-self-end",
        dropdown: "absolute inset-0 cursor-pointer opacity-0",
        dropdown_month: "relative",
        dropdown_year: "relative",
        dropdown_icon: "h-3.5 w-3.5",
        table: "w-full border-collapse",
        head_row: "grid w-full grid-cols-7",
        head_cell:
          "text-muted-foreground flex h-6 items-center justify-center text-center text-[10px] font-medium uppercase tracking-[0.08em]",
        row: "mt-0.5 grid w-full grid-cols-7",
        cell: cn(
          "relative h-8 p-0 text-center text-sm align-middle focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent/60 [&:has([aria-selected].day-outside)]:bg-accent/40 [&:has([aria-selected].day-range-end)]:rounded-r-full",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-full [&:has(>.day-range-start)]:rounded-l-full first:[&:has([aria-selected])]:rounded-l-full last:[&:has([aria-selected])]:rounded-r-full"
            : "[&:has([aria-selected])]:rounded-full"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full p-0 text-[13px] font-medium leading-none aria-selected:opacity-100"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground shadow-none hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "border border-blue-200 bg-blue-50 text-blue-700",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
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
        IconLeft: ({ className: iconClassName, ...iconProps }) => (
          <ChevronLeft className={cn("h-4 w-4", iconClassName)} {...iconProps} />
        ),
        IconRight: ({ className: iconClassName, ...iconProps }) => (
          <ChevronRight className={cn("h-4 w-4", iconClassName)} {...iconProps} />
        ),
        IconDropdown: ({ className: iconClassName, ...iconProps }) => (
          <ChevronDown className={cn("h-3.5 w-3.5", iconClassName)} {...iconProps} />
        ),
        ...components,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
