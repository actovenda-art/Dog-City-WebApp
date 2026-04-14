import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Clock3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const pickerTriggerClassName = cn(
  "flex h-10 w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3.5 text-left text-sm font-medium text-slate-900 shadow-sm",
  "hover:bg-slate-50 hover:text-slate-900",
);

const calendarClassNames = {
  months: "flex flex-col",
  month: "w-full space-y-2",
  caption: "grid min-h-11 grid-cols-[2rem_1fr_2rem] items-center gap-2 px-1 pt-1",
  caption_label: "col-start-2 text-center text-lg font-bold tracking-tight text-slate-900 capitalize",
  nav: "contents",
  nav_button: "h-8 w-8 rounded-full border border-slate-200 bg-white p-0 text-slate-700 opacity-100 shadow-sm hover:bg-slate-100",
  nav_button_previous: "col-start-1 justify-self-start",
  nav_button_next: "col-start-3 justify-self-end",
  table: "w-full table-fixed border-collapse",
  head_row: "flex w-full justify-between",
  head_cell: "w-8 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400",
  row: "mt-0.5 flex w-full justify-between",
  cell: "h-8 w-8 p-0 text-center text-sm",
  day: "h-8 w-8 rounded-full p-0 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900",
  day_selected: "bg-blue-500 text-white hover:bg-blue-500 hover:text-white focus:bg-blue-500 focus:text-white",
  day_range_start: "bg-blue-500 text-white hover:bg-blue-500 hover:text-white",
  day_range_end: "bg-blue-500 text-white hover:bg-blue-500 hover:text-white",
  day_range_middle: "bg-blue-100 text-blue-700 hover:bg-blue-100 hover:text-blue-700",
  day_today: "border border-blue-200 bg-blue-50 text-blue-700",
  day_outside: "text-slate-300",
  day_disabled: "text-slate-300 opacity-40",
};

function parseDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date) {
  return format(date, "yyyy-MM-dd");
}

function formatInputDate(date) {
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

function parseDateInputString(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  const brMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return parseDateOnly(normalized);
}

function extractDateTokens(value) {
  return String(value || "").match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/g) || [];
}

function parseTimeValue(value) {
  if (!value) return { hour: "09", minute: "00" };
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return { hour: "09", minute: "00" };
  return { hour: match[1], minute: match[2] };
}

function formatTimeValue(hour, minute) {
  return `${hour}:${minute}`;
}

function parseDateTimeLocal(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTimeLocal(date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function formatDisplayDate(value) {
  const parsed = parseDateOnly(value);
  return parsed ? format(parsed, "dd/MM/yyyy", { locale: ptBR }) : null;
}

function formatDisplayDateRange(startValue, endValue) {
  const startLabel = formatDisplayDate(startValue);
  const endLabel = formatDisplayDate(endValue);

  if (startLabel && endLabel) return `${startLabel} até ${endLabel}`;
  if (startLabel) return `A partir de ${startLabel}`;
  if (endLabel) return `At? ${endLabel}`;
  return null;
}

function formatDisplayDateTime(value) {
  const parsed = parseDateTimeLocal(value);
  return parsed ? format(parsed, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR }) : null;
}

function buildDateTime(dateValue, timeValue) {
  const date = parseDateOnly(dateValue) || new Date();
  const { hour, minute } = parseTimeValue(timeValue);
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date;
}

function TimeList({ value, onChange }) {
  const selected = parseTimeValue(value);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Hora</p>
        <ScrollArea className="h-56 pr-2">
          <div className="grid grid-cols-2 gap-2">
            {HOURS.map((hour) => (
              <button
                key={hour}
                type="button"
                onClick={() => onChange(formatTimeValue(hour, selected.minute))}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  selected.hour === hour
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-100",
                )}
              >
                {hour}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Min</p>
        <ScrollArea className="h-56 pr-2">
          <div className="grid grid-cols-2 gap-2">
            {MINUTES.map((minute) => (
              <button
                key={minute}
                type="button"
                onClick={() => onChange(formatTimeValue(selected.hour, minute))}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-semibold transition",
                  selected.minute === minute
                    ? "bg-blue-500 text-white shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-100",
                )}
              >
                {minute}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function PickerPopover({ children, content, className, open, onOpenChange }) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className="w-full">{children}</div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          "w-[332px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] overflow-auto rounded-[24px] border border-slate-200 bg-white p-6 shadow-2xl",
          className
        )}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

function PickerTextTrigger({
  icon,
  textValue,
  onTextChange,
  placeholder,
  disabled = false,
  className,
  open = false,
  onToggle,
}) {
  return (
    <div
      className={cn(
        pickerTriggerClassName,
        "gap-3 pr-3",
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      onClick={() => {
        if (!disabled) onToggle?.();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon}
        <input
          type="text"
          value={textValue}
          disabled={disabled}
          placeholder={placeholder}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) onToggle?.();
          }}
          onChange={(event) => onTextChange?.(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
    </div>
  );
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = "Selecione a data",
  disabled = false,
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(formatDisplayDate(value) || "");
  const selectedDate = parseDateOnly(value);
  const displayValue = formatDisplayDate(value) || "";

  React.useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  const handleInputChange = (nextValue) => {
    setInputValue(nextValue);
    if (!nextValue.trim()) {
      onChange?.("");
      return;
    }
    const parsed = parseDateInputString(nextValue);
    if (parsed) {
      onChange?.(formatDateOnly(parsed));
    }
  };

  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      className="p-0"
      content={
        <div className="space-y-3">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDate || undefined}
            onSelect={(date) => {
              onChange?.(date ? formatDateOnly(date) : "");
              setInputValue(date ? formatInputDate(date) : "");
              setOpen(false);
            }}
            className="w-full rounded-[20px] bg-white p-1"
            classNames={calendarClassNames}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Data</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange?.("");
                setInputValue("");
              }}
            >
              Limpar
            </Button>
          </div>
        </div>
      }
    >
      <PickerTextTrigger
        icon={<CalendarIcon className="h-4 w-4 shrink-0 text-blue-500" />}
        textValue={inputValue}
        onTextChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      />
    </PickerPopover>
  );
}

export function DateRangePickerInput({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  placeholder = "Selecione o período",
  disabled = false,
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const rangeStart = parseDateOnly(startValue);
  const rangeEnd = parseDateOnly(endValue);
  const selectedRange = rangeStart || rangeEnd
    ? {
        from: rangeStart || rangeEnd || undefined,
        to: rangeEnd || undefined,
      }
    : undefined;

  const displayValue = formatDisplayDateRange(startValue, endValue) || "";
  const [inputValue, setInputValue] = React.useState(displayValue);

  React.useEffect(() => {
    setInputValue(displayValue);
  }, [displayValue]);

  const handleInputChange = (nextValue) => {
    setInputValue(nextValue);
    if (!nextValue.trim()) {
      onStartChange?.("");
      onEndChange?.("");
      return;
    }

    const [startToken, endToken] = extractDateTokens(nextValue);
    const startDate = parseDateInputString(startToken);
    const endDate = parseDateInputString(endToken);

    if (startDate) {
      onStartChange?.(formatDateOnly(startDate));
      onEndChange?.(endDate ? formatDateOnly(endDate) : "");
    }
  };

  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      className="p-0"
      content={
        <div className="space-y-3">
          <Calendar
            mode="range"
            locale={ptBR}
            numberOfMonths={1}
            selected={selectedRange}
            onSelect={(range) => {
              onStartChange?.(range?.from ? formatDateOnly(range.from) : "");
              onEndChange?.(range?.to ? formatDateOnly(range.to) : "");
              setInputValue(formatDisplayDateRange(
                range?.from ? formatDateOnly(range.from) : "",
                range?.to ? formatDateOnly(range.to) : "",
              ) || "");
              if (range?.from && range?.to) {
                setOpen(false);
              }
            }}
            className="w-full rounded-[20px] bg-white p-1"
            classNames={calendarClassNames}
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Período</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {formatDisplayDateRange(startValue, endValue) || "Defina a data inicial e final"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pb-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Intervalo</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onStartChange?.("");
                onEndChange?.("");
                setInputValue("");
              }}
            >
              Limpar
            </Button>
          </div>
        </div>
      }
    >
      <PickerTextTrigger
        icon={<CalendarIcon className="h-4 w-4 shrink-0 text-blue-500" />}
        textValue={inputValue}
        onTextChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        open={open}
        onToggle={() => setOpen((current) => !current)}
      />
    </PickerPopover>
  );
}

export function TimePickerInput({
  value,
  onChange,
  placeholder = "Selecione o horário",
  disabled = false,
  className,
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <PickerPopover
      open={open}
      onOpenChange={setOpen}
      className="w-[320px]"
      content={
        <div className="space-y-3">
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Horário</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value || "--:--"}</p>
          </div>
          <TimeList value={value} onChange={onChange} />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange?.("");
                setOpen(false);
              }}
            >
              Limpar
            </Button>
          </div>
        </div>
      }
    >
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(pickerTriggerClassName, className)}
      >
        <span className="flex items-center gap-3">
          <Clock3 className="h-4 w-4 text-blue-500" />
          <span className={value ? "text-slate-900" : "text-slate-400"}>{value || placeholder}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Button>
    </PickerPopover>
  );
}

export function DateTimePickerInput({
  value,
  onChange,
  placeholder = "Selecione data e hora",
  disabled = false,
  className,
}) {
  const selectedDateTime = parseDateTimeLocal(value);
  const dateValue = selectedDateTime ? format(selectedDateTime, "yyyy-MM-dd") : "";
  const timeValue = selectedDateTime ? format(selectedDateTime, "HH:mm") : "09:00";

  const handleDateChange = (nextDate) => {
    if (!nextDate) {
      onChange?.("");
      return;
    }
    onChange?.(formatDateTimeLocal(buildDateTime(nextDate, timeValue)));
  };

  const handleTimeChange = (nextTime) => {
    const baseDate = dateValue || formatDateOnly(new Date());
    onChange?.(formatDateTimeLocal(buildDateTime(baseDate, nextTime)));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <DatePickerInput
        value={dateValue}
        onChange={handleDateChange}
        placeholder={placeholder}
        disabled={disabled}
      />
      <TimePickerInput
        value={timeValue}
        onChange={handleTimeChange}
        placeholder="Selecione o horário"
        disabled={disabled}
      />
      {value ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange?.("")}
          >
            <X className="mr-2 h-4 w-4" />
            Limpar data e horario
          </Button>
        </div>
      ) : null}
    </div>
  );
}
