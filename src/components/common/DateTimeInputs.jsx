import React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronDown, Clock3, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const pickerTriggerClassName = cn(
  "h-11 w-full justify-between rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-900 shadow-sm",
  "hover:bg-slate-50 hover:text-slate-900",
);

const calendarClassNames = {
  months: "flex flex-col",
  month: "space-y-4",
  caption: "relative flex items-center justify-between px-3 pt-2",
  caption_label: "text-2xl font-black tracking-tight text-slate-900 capitalize",
  nav: "flex items-center gap-1",
  nav_button: "h-9 w-9 rounded-full border border-slate-200 bg-white p-0 text-slate-700 opacity-100 shadow-sm hover:bg-slate-100",
  nav_button_previous: "static",
  nav_button_next: "static",
  table: "w-full border-collapse",
  head_row: "flex w-full justify-between",
  head_cell: "w-11 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-400",
  row: "mt-2 flex w-full justify-between",
  cell: "h-11 w-11 p-0 text-center text-sm",
  day: "h-11 w-11 rounded-full p-0 text-base font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900",
  day_selected: "bg-blue-500 text-white hover:bg-blue-500 hover:text-white focus:bg-blue-500 focus:text-white",
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
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
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

function PickerPopover({ children, content, className }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className={cn("w-auto rounded-[28px] border border-slate-200 bg-white p-4 shadow-2xl", className)}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = "Selecione a data",
  disabled = false,
  className,
}) {
  const selectedDate = parseDateOnly(value);

  return (
    <PickerPopover
      className="p-3"
      content={
        <div className="space-y-3">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDate || undefined}
            onSelect={(date) => onChange?.(date ? formatDateOnly(date) : "")}
            className="rounded-[24px] bg-white p-2"
            classNames={calendarClassNames}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Data</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.("")}>
              Limpar
            </Button>
          </div>
        </div>
      }
    >
      <Button type="button" variant="outline" disabled={disabled} className={cn(pickerTriggerClassName, className)}>
        <span className="flex items-center gap-3">
          <CalendarIcon className="h-4 w-4 text-blue-500" />
          <span className={value ? "text-slate-900" : "text-slate-400"}>
            {formatDisplayDate(value) || placeholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Button>
    </PickerPopover>
  );
}

export function TimePickerInput({
  value,
  onChange,
  placeholder = "Selecione o horario",
  disabled = false,
  className,
}) {
  return (
    <PickerPopover
      className="w-[320px]"
      content={
        <div className="space-y-3">
          <div className="px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Horario</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value || "--:--"}</p>
          </div>
          <TimeList value={value} onChange={onChange} />
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.("")}>
              Limpar
            </Button>
          </div>
        </div>
      }
    >
      <Button type="button" variant="outline" disabled={disabled} className={cn(pickerTriggerClassName, className)}>
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
    <PickerPopover
      className="w-[360px]"
      content={
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Agendamento</p>
              <p className="mt-1 text-xl font-black text-slate-900">
                {formatDisplayDateTime(value) || "Defina data e hora"}
              </p>
            </div>
            {value ? (
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange?.("")}>
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <Calendar
            mode="single"
            locale={ptBR}
            selected={selectedDateTime || undefined}
            onSelect={(date) => handleDateChange(date ? formatDateOnly(date) : "")}
            className="rounded-[24px] bg-white p-2"
            classNames={calendarClassNames}
          />

          <TimeList value={timeValue} onChange={handleTimeChange} />
        </div>
      }
    >
      <Button type="button" variant="outline" disabled={disabled} className={cn(pickerTriggerClassName, className)}>
        <span className="flex items-center gap-3">
          <CalendarIcon className="h-4 w-4 text-blue-500" />
          <span className={value ? "text-slate-900" : "text-slate-400"}>
            {formatDisplayDateTime(value) || placeholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </Button>
    </PickerPopover>
  );
}
