import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LoadingScreen from "@/components/layout/LoadingScreen";
import PageHeader from "@/components/common/PageHeader";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Orcamento, Responsavel } from "@/api/entities";
import {
  buildDogOwnerIndex,
  buildReceivablePayload,
  doesAppointmentOccurOnDate,
  filterAppointmentsByApprovedOrcamentos,
  getAppointmentDateKey,
  getAppointmentEndDateKey,
  getAppointmentMeta,
  getAppointmentSourceLabel,
  getAppointmentTimeValue,
  getCheckinMealRecords,
  getChargeTypeLabel,
  getServiceLabel,
} from "@/lib/attendance";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
import { buildFinancialOperationalStatusMap, getFinancialOperationalStatus } from "@/lib/finance-operational-status";
import { cn } from "@/lib/utils";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import {
  Calendar,
  CalendarClock,
  Car,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Home,
  ListFilter,
  MoreHorizontal,
  PawPrint,
  Search,
  Scissors,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";

const SERVICE_BUCKETS = [
  {
    id: "day_care",
    label: "Day Care",
    subtitle: "rotina do dia",
    icon: PawPrint,
    iconClassName: "bg-blue-100 text-blue-600",
    progressClassName: "bg-blue-600",
    serviceTypes: ["day_care", "adaptacao"],
  },
  {
    id: "hospedagem",
    label: "Hospedagem",
    subtitle: "entrada / saida",
    icon: Home,
    iconClassName: "bg-emerald-100 text-emerald-600",
    progressClassName: "bg-emerald-600",
    serviceTypes: ["hospedagem", "pernoite"],
  },
  {
    id: "transporte",
    label: "Transporte",
    subtitle: "busca / entrega",
    icon: Car,
    iconClassName: "bg-violet-100 text-violet-600",
    progressClassName: "bg-violet-600",
    serviceTypes: ["transporte"],
  },
  {
    id: "banho",
    label: "Banho",
    subtitle: "banho e tosa",
    icon: Scissors,
    iconClassName: "bg-amber-100 text-amber-600",
    progressClassName: "bg-amber-500",
    serviceTypes: ["banho", "tosa", "banho_tosa"],
  },
  {
    id: "diversos",
    label: "Diversos",
    subtitle: "visitas, reparos, etc.",
    icon: MoreHorizontal,
    iconClassName: "bg-cyan-100 text-cyan-600",
    progressClassName: "bg-cyan-500",
    serviceTypes: ["adestramento", "diversos"],
  },
];

const STATUS_STYLES = {
  arriving: {
    label: "Chegando",
    badgeLabel: "Chegando",
    valueClassName: "text-blue-600",
    containerClassName: "border-blue-200 bg-blue-50 text-blue-700",
    subtleClassName: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  },
  present: {
    label: "Presente",
    badgeLabel: "Presente",
    valueClassName: "text-emerald-600",
    containerClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    subtleClassName: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  absent: {
    label: "Faltou",
    badgeLabel: "Faltou",
    valueClassName: "text-rose-600",
    containerClassName: "border-rose-200 bg-rose-50 text-rose-700",
    subtleClassName: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
};

const STATUS_FILTER_OPTIONS = [
  { id: "chegando", label: "Chegando", stateKeys: ["arriving"] },
  { id: "presente", label: "Presente", stateKeys: ["present"] },
  { id: "faltou", label: "Faltou", stateKeys: ["absent"] },
];

const SERVICE_FILTER_OPTIONS = [
  { id: "day_care", label: "Day Care" },
  { id: "banho", label: "Banho" },
  { id: "tosa", label: "Tosa" },
  { id: "hospedagem", label: "Hospedagem" },
  { id: "transporte", label: "Transporte" },
  { id: "diversos", label: "Diversos" },
];

const STATUS_FILTER_BY_ID = Object.fromEntries(STATUS_FILTER_OPTIONS.map((option) => [option.id, option]));

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = parseDateValue(value);
  return parsed ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(parsed) : "-";
}

function formatLongDate(value) {
  if (!value) return "-";
  const parsed = parseDateValue(value);
  return parsed
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed)
    : "-";
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAppointmentServiceFilterIds(appointment) {
  const serviceType = String(appointment?.service_type || "").toLowerCase();
  if (["day_care", "adaptacao"].includes(serviceType)) return ["day_care"];
  if (["hospedagem", "pernoite"].includes(serviceType)) return ["hospedagem"];
  if (serviceType === "transporte") return ["transporte"];
  if (serviceType === "banho_tosa") return ["banho", "tosa"];
  if (serviceType === "banho") return ["banho"];
  if (serviceType === "tosa") return ["tosa"];
  return ["diversos"];
}

function formatTime(value) {
  if (!value) return "-";
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = parseDateValue(value);
  if (!parsed) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatAppointmentPeriod(appointment) {
  const startDateKey = getAppointmentDateKey(appointment);
  if (!startDateKey) return "";

  if (appointment?.service_type !== "hospedagem") {
    return formatDate(startDateKey);
  }

  const endDateKey = getAppointmentEndDateKey(appointment);
  if (!endDateKey || endDateKey === startDateKey) {
    return formatDate(startDateKey);
  }

  return `${formatDate(startDateKey)} ate ${formatDate(endDateKey)}`;
}

function formatOwnerAppointmentLine(ownerName, appointment) {
  const safeOwnerName = ownerName || "Responsavel nao identificado";
  const period = formatAppointmentPeriod(appointment);
  return period ? `${safeOwnerName} • ${period}` : safeOwnerName;
}

function addDays(dateKey, days) {
  if (!dateKey) return "";
  const base = new Date(`${dateKey}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function getServiceBucketId(serviceType) {
  if (["day_care", "adaptacao"].includes(serviceType)) return "day_care";
  if (["hospedagem", "pernoite"].includes(serviceType)) return "hospedagem";
  if (serviceType === "transporte") return "transporte";
  if (["banho", "tosa", "banho_tosa"].includes(serviceType)) return "banho";
  return "diversos";
}

function getServiceBucketConfig(appointment) {
  const bucketId = getServiceBucketId(appointment?.service_type);
  return SERVICE_BUCKETS.find((bucket) => bucket.id === bucketId) || SERVICE_BUCKETS[SERVICE_BUCKETS.length - 1];
}

function getLatestRecordTimestamp(record) {
  return (
    record?.checkout_datetime ||
    record?.data_checkout ||
    record?.checkin_datetime ||
    record?.data_checkin ||
    record?.created_date ||
    ""
  );
}

function compareAppointments(left, right) {
  const leftDate = getAppointmentDateKey(left) || "";
  const rightDate = getAppointmentDateKey(right) || "";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

  const leftTime = getAppointmentTimeValue(left, "entrada") || "99:99";
  const rightTime = getAppointmentTimeValue(right, "entrada") || "99:99";
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

  return String(left?.created_date || left?.id || "").localeCompare(String(right?.created_date || right?.id || ""));
}

function buildAppointmentRecordIndex(checkins) {
  return (checkins || [])
    .filter((record) => record?.tipo === "pet")
    .reduce((accumulator, record) => {
      if (!record?.appointment_id) return accumulator;
      const current = accumulator[record.appointment_id];
      if (!current || getLatestRecordTimestamp(record) > getLatestRecordTimestamp(current)) {
        accumulator[record.appointment_id] = record;
      }
      return accumulator;
    }, {});
}

function getAppointmentPrimaryLabel(appointment, dog) {
  if (dog?.nome) return dog.nome;
  const meta = getAppointmentMeta(appointment);
  return meta.misc_title || meta.owner_nome || meta.client_name || "Atividade";
}

function getAppointmentSecondaryLabel(appointment, dog) {
  if (dog?.raca) return dog.raca;
  const meta = getAppointmentMeta(appointment);
  return meta.misc_subtitle || getAppointmentSourceLabel(appointment);
}

function getAppointmentOwnerDisplay(owner, appointment) {
  if (owner?.nome) return owner.nome;
  const meta = getAppointmentMeta(appointment);
  return (
    meta.misc_owner_name ||
    meta.contact_name ||
    meta.responsavel_nome ||
    meta.client_name ||
    meta.owner_nome ||
    "Responsavel nao identificado"
  );
}

function getAppointmentDetailLabel(appointment) {
  const meta = getAppointmentMeta(appointment);
  return meta.misc_detail_label || getAppointmentSourceLabel(appointment);
}

function getAppointmentServiceLine(appointment) {
  const bucket = getServiceBucketConfig(appointment);
  const rawLabel = getServiceLabel(appointment?.service_type);
  const meta = getAppointmentMeta(appointment);

  if (bucket.id === "day_care") {
    return {
      title: bucket.label,
      subtitle: appointment?.service_type === "adaptacao" ? rawLabel : "Periodo operacional",
    };
  }

  if (bucket.id === "hospedagem") {
    return {
      title: bucket.label,
      subtitle: appointment?.service_type === "pernoite" ? "Pernoite" : "Check-in",
    };
  }

  if (bucket.id === "transporte") {
    return {
      title: bucket.label,
      subtitle: "Busca",
    };
  }

  if (bucket.id === "banho") {
    return {
      title: bucket.label,
      subtitle: rawLabel,
    };
  }

  return {
    title: bucket.label,
    subtitle: meta.misc_service_label || (rawLabel !== "Diversos" && rawLabel !== "diversos" ? rawLabel : bucket.subtitle),
  };
}

function getAppointmentOperationalState(appointment, record) {
  const meta = getAppointmentMeta(appointment);
  const hasCheckin = Boolean(record?.checkin_datetime || record?.data_checkin) || appointment?.status === "presente";
  const hasCheckout = Boolean(record?.checkout_datetime || record?.data_checkout) || appointment?.status === "finalizado";
  const isNoShowConfirmed = appointment?.status === "faltou" || Boolean(meta.absence_confirmed_at);
  const needsAbsenceReview = Boolean(meta.absence_review_pending);

  if (isNoShowConfirmed) {
    return { key: "absent", label: STATUS_STYLES.absent.badgeLabel, needsAbsenceReview };
  }

  if (hasCheckin || hasCheckout) {
    return { key: "present", label: STATUS_STYLES.present.badgeLabel, needsAbsenceReview };
  }

  return { key: "arriving", label: STATUS_STYLES.arriving.badgeLabel, needsAbsenceReview };
}

function formatDateControlLabel(dateKey) {
  if (!dateKey) return "Hoje";
  const isToday = dateKey === getTodayKey();
  const dateLabel = formatLongDate(`${dateKey}T12:00:00`);
  return isToday ? `Hoje • ${dateLabel}` : dateLabel;
}

function AppointmentSearchFilters({
  searchTerm,
  onSearchChange,
  filterDate,
  onDateChange,
  selectedDayKey,
  statusFilters,
  serviceFilters,
  onToggleStatus,
  onToggleService,
  onClearFilters,
}) {
  const activeFilterCount = statusFilters.length + serviceFilters.length;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_42px] gap-2 sm:grid-cols-[minmax(220px,1fr)_190px_42px]">
      <div className="relative col-span-2 sm:col-span-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar dono, cão ou monitor"
          aria-label="Buscar agendamentos por dono, cão ou monitor"
          className="h-10 rounded-xl border-slate-200 bg-white pl-10 pr-3 text-[13px] shadow-sm"
        />
      </div>

      <DatePickerInput
        value={filterDate}
        onChange={onDateChange}
        placeholder={formatDateControlLabel(selectedDayKey)}
        className="h-10 min-w-0 rounded-xl border-slate-200 bg-white px-3 text-[13px] font-semibold shadow-sm"
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-10 w-10 rounded-xl border-slate-200 bg-white text-slate-600 shadow-sm",
              activeFilterCount > 0 && "border-blue-300 bg-blue-50 text-blue-700",
            )}
            aria-label={`Abrir filtros${activeFilterCount ? `, ${activeFilterCount} selecionado(s)` : ""}`}
          >
            <ListFilter className="h-4 w-4" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(320px,calc(100vw-24px))] rounded-2xl border-slate-200 p-0 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Filtrar agendamentos</p>
              <p className="mt-0.5 text-xs text-slate-500">Selecione uma ou mais opções.</p>
            </div>
            {activeFilterCount > 0 ? (
              <button type="button" onClick={onClearFilters} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Limpar
              </button>
            ) : null}
          </div>

          <div className="space-y-5 p-4">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Status</legend>
              <div className="space-y-1.5">
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Checkbox checked={statusFilters.includes(option.id)} onCheckedChange={() => onToggleStatus(option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Serviço</legend>
              <div className="grid grid-cols-2 gap-1.5">
                {SERVICE_FILTER_OPTIONS.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Checkbox checked={serviceFilters.includes(option.id)} onCheckedChange={() => onToggleService(option.id)} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, iconClassName, valueClassName }) {
  return (
    <Card className="min-w-0 rounded-[16px] border border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-3.5 p-3.5">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]", iconClassName)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-4 text-slate-700">{label}</p>
          <p className={cn("mt-0.5 text-[28px] font-bold leading-none tracking-tight", valueClassName)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentStatusBadge({ stateKey, label }) {
  const style = STATUS_STYLES[stateKey] || STATUS_STYLES.arriving;
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", style.subtleClassName)}>
      {label}
    </span>
  );
}

function MobileSummaryCard({ icon: Icon, label, value, iconClassName, valueClassName }) {
  return (
    <Card className="min-w-0 rounded-[12px] border border-slate-200 shadow-sm">
      <CardContent className="flex min-h-[78px] flex-col justify-between p-2">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", iconClassName)}>
          <Icon className="h-3 w-3" />
        </div>
        <div className="mt-1.5 min-w-0">
          <p className="break-words text-[9px] font-semibold leading-[11px] text-slate-800">{label}</p>
          <p className={cn("mt-1 text-[17px] font-bold leading-none tracking-tight", valueClassName)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function getAppointmentThumbnail(row) {
  if (row?.dog?.foto_url) {
    return { kind: "image", src: row.dog.foto_url, alt: row.primaryLabel };
  }

  if (row?.dog?.nome) {
    return { kind: "dog" };
  }

  const detail = `${row?.primaryLabel || ""} ${row?.secondaryLabel || ""}`.toLowerCase();
  if (detail.includes("reparo") || detail.includes("manuten")) {
    return { kind: "icon", icon: Wrench };
  }

  return { kind: "icon", icon: ClipboardList };
}

function getMobileOperationalMeta(row) {
  if (row.state.key === "present") {
    return {
      shortLabel: "Presente",
      actionText: row.checkinTime ? formatTime(row.checkinTime) : "Concluído",
      actionTextClassName: "text-emerald-600",
      actionToneClassName: "border-emerald-100 bg-emerald-50 text-emerald-600",
      actionIcon: CheckCircle2,
    };
  }

  if (row.state.key === "absent") {
    return {
      shortLabel: "Faltou",
      actionText: "Falta confirmada",
      actionTextClassName: "text-rose-600",
      actionToneClassName: "border-rose-100 bg-rose-50 text-rose-600",
      actionIcon: TriangleAlert,
    };
  }

  const expectedLabel = row.bucket.id === "diversos" ? "Horário\nprevisto" : "Check-in\nprevisto";
  return {
    shortLabel: "Chegando",
    actionText: `${expectedLabel}: ${row.scheduleTime || "--:--"}`,
    actionTextClassName: "text-blue-600",
    actionToneClassName: "border-blue-100 bg-blue-50 text-blue-600",
    actionIcon: Calendar,
  };
}

function ResponsiveAppointmentCard({ row, isHighlighted, onPrimaryAction }) {
  const bucket = row.bucket;
  const BucketIcon = bucket.icon;
  const actionMeta = getMobileOperationalMeta(row);
  const ActionIcon = actionMeta.actionIcon;
  const thumbnail = getAppointmentThumbnail(row);
  const statusStyle = STATUS_STYLES[row.state.key] || STATUS_STYLES.arriving;
  const operationalText = String(actionMeta.actionText || "").replace(/\s*\n\s*/g, " ");

  return (
    <article
      className={cn(
        "rounded-[16px] border border-slate-200 bg-white px-3 py-3 shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_6px_18px_rgba(15,23,42,0.07)] sm:px-4",
        isHighlighted && "border-amber-200 bg-amber-50/70",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-slate-100 bg-slate-50">
          {thumbnail.kind === "image" ? (
            <img src={thumbnail.src} alt={thumbnail.alt} className="h-full w-full object-cover" />
          ) : thumbnail.kind === "dog" ? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 via-amber-50 to-emerald-50 text-amber-700">
              <PawPrint className="h-4 w-4" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white text-slate-500">
              <thumbnail.icon className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 pt-0.5">
              <p className="truncate text-[13px] font-semibold leading-4 text-slate-950">{row.primaryLabel}</p>
              <p className="mt-0.5 truncate text-[10px] leading-3 text-slate-500">{row.secondaryLabel}</p>
            </div>

            <button
              type="button"
              onClick={() => onPrimaryAction(row)}
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition", actionMeta.actionToneClassName)}
              aria-label={`Abrir ${row.primaryLabel}`}
              title="Abrir agendamento"
            >
              <ActionIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-50 px-2 text-[9px] font-semibold text-blue-700 ring-1 ring-blue-100">
              <Clock3 className="h-2.5 w-2.5" />
              {row.scheduleTime || "--:--"}
            </span>
            <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-[9px] font-semibold", statusStyle.subtleClassName)}>
              {actionMeta.shortLabel}
            </span>
            <span className="inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-full bg-slate-50 px-2 text-[9px] text-slate-600 ring-1 ring-slate-200">
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-md", bucket.iconClassName)}>
                <BucketIcon className="h-2 w-2" />
              </span>
              <span className="truncate font-semibold text-slate-700">{row.serviceLine.title}</span>
              <span className="truncate text-slate-400">• {row.serviceLine.subtitle}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(96px,.8fr)] gap-2 border-t border-slate-100 pt-2.5">
        <div className="min-w-0">
          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Responsável</p>
          <p className="mt-0.5 truncate text-[10px] font-medium text-slate-700">{row.ownerDisplayName}</p>
          <p className="truncate text-[8px] text-slate-400">{row.sourceLabel}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-400">Andamento</p>
          <p className={cn("mt-0.5 text-[9px] font-semibold leading-3", actionMeta.actionTextClassName)}>{operationalText}</p>
        </div>
      </div>

      {row.hasCommercialPending || (row.ownerFinancialStatus.isIrregular && row.appointment.source_type === "manual_registrador") ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.hasCommercialPending ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-semibold text-amber-700 ring-1 ring-amber-200">Pendente comercial</span>
          ) : null}
          {row.ownerFinancialStatus.isIrregular && row.appointment.source_type === "manual_registrador" ? (
            <span className="rounded-full bg-rose-50 px-2 py-1 text-[8px] font-semibold text-rose-700 ring-1 ring-rose-200">Financeiro irregular</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function AppointmentActions({ appointment, state, isSaving, onOpenRegistrador, onOpenRecords, onOpenOrcamento, onOpenPackageDialog, onCreateOrcamento, onMarkAbsence }) {
  const primaryAction =
    state.key === "arriving"
      ? {
          label: "Registrar check-in",
          onClick: () => onOpenRegistrador(appointment),
        }
      : appointment?.orcamento_id
        ? {
            label: "Abrir orçamento",
            onClick: () => onOpenOrcamento(appointment),
          }
        : {
            label: "Ver registros",
            onClick: () => onOpenRecords(appointment),
          };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" className="h-10 rounded-xl px-4 text-sm" onClick={primaryAction.onClick}>
        {primaryAction.label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl border border-slate-200">
            <MoreHorizontal className="h-4 w-4 text-slate-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
          <DropdownMenuItem onClick={() => onOpenRegistrador(appointment)}>Abrir no registrador</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenRecords(appointment)}>Ver registros</DropdownMenuItem>
          {appointment?.orcamento_id ? (
            <DropdownMenuItem onClick={() => onOpenOrcamento(appointment)}>Abrir orçamento</DropdownMenuItem>
          ) : null}
          {appointment?.charge_type === "pendente_comercial" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenPackageDialog(appointment)}>Marcar pacote</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateOrcamento(appointment)}>Criar orçamento</DropdownMenuItem>
            </>
          ) : null}
          {state.needsAbsenceReview ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isSaving} onClick={() => onMarkAbsence(appointment)}>
                Registrar falta
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function Agendamentos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reviewAppointmentId = searchParams.get("review");
  const absenceReviewAppointmentId = searchParams.get("absenceReview");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [filterDate, setFilterDate] = useState(getTodayKey());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilters, setStatusFilters] = useState([]);
  const [serviceFilters, setServiceFilters] = useState([]);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [avulsoActionsDialogOpen, setAvulsoActionsDialogOpen] = useState(false);
  const [recordsDialogOpen, setRecordsDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [packageCode, setPackageCode] = useState("");
  const [packageNotes, setPackageNotes] = useState("");

  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const orcamentosById = useMemo(
    () => Object.fromEntries(orcamentos.map((orcamento) => [orcamento.id, orcamento])),
    [orcamentos],
  );
  const ownerByDogId = useMemo(() => {
    const baseIndex = buildDogOwnerIndex(carteiras, responsaveis);
    const dogKeys = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `dog_id_${index}`);
    const mergedIndex = { ...baseIndex };
    const carteirasById = Object.fromEntries((carteiras || []).map((carteira) => [carteira?.id, carteira]));

    (carteiras || []).forEach((carteira) => {
      dogKeys.forEach((key) => {
        const dogId = carteira?.[key];
        if (!dogId) return;
        const existing = mergedIndex[dogId] || {};
        mergedIndex[dogId] = {
          ...existing,
          cliente_id: existing?.cliente_id || carteira.id || null,
          id: existing?.id || carteira.id || null,
        };
      });
    });

    (dogs || []).forEach((dog) => {
      const dogId = dog?.id;
      const carteira = carteirasById[dog?.cliente_id];
      if (!dogId || !carteira) return;

      const existing = mergedIndex[dogId] || {};
      mergedIndex[dogId] = {
        nome: existing?.nome || carteira.nome_razao_social || carteira.nome_fantasia || "Carteira",
        celular: existing?.celular || carteira.celular || "",
        email: existing?.email || carteira.email || "",
        tipo: existing?.tipo || "carteira",
        cliente_id: existing?.cliente_id || carteira.id || null,
        id: existing?.id || carteira.id || null,
      };
    });

    return mergedIndex;
  }, [carteiras, dogs, responsaveis]);
  const financialStatusMap = useMemo(() => buildFinancialOperationalStatusMap(contasReceber), [contasReceber]);
  const visibleAppointments = useMemo(
    () => filterAppointmentsByApprovedOrcamentos(appointments, orcamentosById).sort(compareAppointments),
    [appointments, orcamentosById],
  );
  const appointmentRecordByAppointmentId = useMemo(() => buildAppointmentRecordIndex(checkins), [checkins]);

  async function loadData(silent = false) {
    if (!silent) {
      setIsLoading(true);
    }

    try {
      const [appointmentRows, orcamentoRows, dogRows, carteiraRows, responsavelRows, checkinRows, contaRows] = await Promise.all([
        Appointment.listAll("-created_date", 1000, 5000),
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 1000),
        Checkin.listAll("-created_date", 1000, 5000),
        ContaReceber.listAll ? ContaReceber.listAll("-created_date", 1000, 10000) : ContaReceber.list("-created_date", 5000),
      ]);
      setAppointments(appointmentRows || []);
      setOrcamentos(orcamentoRows || []);
      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setResponsaveis((responsavelRows || []).filter((item) => item.ativo !== false));
      setCheckins(checkinRows || []);
      setContasReceber(contaRows || []);
    } catch (error) {
      console.error("Erro ao carregar agendamentos:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const highlightedAppointmentId = reviewAppointmentId || absenceReviewAppointmentId;
    if (!highlightedAppointmentId) return;

    const highlightedAppointment = visibleAppointments.find((appointment) => appointment.id === highlightedAppointmentId);
    const highlightedDate = getAppointmentDateKey(highlightedAppointment);
    if (highlightedDate) setFilterDate(highlightedDate);
  }, [absenceReviewAppointmentId, reviewAppointmentId, visibleAppointments]);

  const selectedAppointmentRecord = useMemo(() => {
    if (!selectedAppointment) return null;
    const directRecord = appointmentRecordByAppointmentId[selectedAppointment.id];
    if (directRecord) return directRecord;

    const matchingRecords = checkins
      .filter((item) => item.tipo === "pet")
      .filter((item) => item.id === selectedAppointment.linked_checkin_id || item.appointment_id === selectedAppointment.id)
      .sort((left, right) => String(getLatestRecordTimestamp(right)).localeCompare(String(getLatestRecordTimestamp(left))));

    return matchingRecords[0] || null;
  }, [appointmentRecordByAppointmentId, checkins, selectedAppointment]);

  const appointmentPresentationRows = useMemo(() => {
    return visibleAppointments.map((appointment) => {
      const dog = dogsById[appointment.dog_id];
      const owner = ownerByDogId[appointment.dog_id] || {};
      const record = appointmentRecordByAppointmentId[appointment.id] || null;
      const meta = getAppointmentMeta(appointment);
      const bucket = getServiceBucketConfig(appointment);
      const state = getAppointmentOperationalState(appointment, record);
      const ownerDisplayName = getAppointmentOwnerDisplay(owner, appointment);
      const ownerFinancialStatus = getFinancialOperationalStatus(
        financialStatusMap,
        owner?.cliente_id || owner?.id || null,
      );
      const serviceLine = getAppointmentServiceLine(appointment);
      const scheduleTime = getAppointmentTimeValue(appointment, "entrada");
      const checkinTime = record?.checkin_datetime || record?.data_checkin || null;
      const checkoutTime = record?.checkout_datetime || record?.data_checkout || null;
      const monitorNames = [
        record?.checkin_monitor_nome,
        record?.checkout_monitor_nome,
        record?.monitor_nome,
        record?.responsavel_nome,
        meta?.manual_monitor_nome,
        meta?.monitor_nome,
      ];

      return {
        appointment,
        record,
        dog,
        owner,
        meta,
        bucket,
        state,
        ownerFinancialStatus,
        serviceLine,
        appointmentDateKey: getAppointmentDateKey(appointment),
        scheduleTime,
        sortTime: scheduleTime || "99:99",
        primaryLabel: getAppointmentPrimaryLabel(appointment, dog),
        secondaryLabel: getAppointmentSecondaryLabel(appointment, dog),
        ownerDisplayName,
        ownerLine: formatOwnerAppointmentLine(ownerDisplayName, appointment),
        searchValue: normalizeSearchValue([
          dog?.nome,
          dog?.raca,
          ownerDisplayName,
          formatOwnerAppointmentLine(ownerDisplayName, appointment),
          appointment?.owner_nome,
          meta?.responsavel_nome,
          meta?.client_name,
          ...monitorNames,
        ].filter(Boolean).join(" ")),
        serviceFilterIds: getAppointmentServiceFilterIds(appointment),
        sourceLabel: getAppointmentDetailLabel(appointment),
        checkinTime,
        checkoutTime,
        hasCommercialPending: appointment.charge_type === "pendente_comercial",
        hasAbsenceReviewPending: Boolean(meta.absence_review_pending),
      };
    });
  }, [appointmentRecordByAppointmentId, dogsById, financialStatusMap, ownerByDogId, visibleAppointments]);

  const selectedDayKey = filterDate || getTodayKey();
  const dailyRows = useMemo(() => {
    return appointmentPresentationRows
      .filter((row) => doesAppointmentOccurOnDate(row.appointment, selectedDayKey))
      .sort((left, right) => left.sortTime.localeCompare(right.sortTime));
  }, [appointmentPresentationRows, selectedDayKey]);

  const dailyStats = useMemo(() => {
    const arriving = dailyRows.filter((row) => row.state.key === "arriving").length;
    const present = dailyRows.filter((row) => row.state.key === "present").length;
    const absent = dailyRows.filter((row) => row.state.key === "absent").length;

    return {
      total: dailyRows.length,
      arriving,
      present,
      absent,
    };
  }, [dailyRows]);

  const normalizedSearchTerm = useMemo(() => normalizeSearchValue(searchTerm), [searchTerm]);
  const filteredMainRows = useMemo(() => {
    const acceptedStateKeys = new Set(
      statusFilters.flatMap((filterId) => STATUS_FILTER_BY_ID[filterId]?.stateKeys || []),
    );

    return dailyRows
      .filter((row) => !normalizedSearchTerm || row.searchValue.includes(normalizedSearchTerm))
      .filter((row) => statusFilters.length === 0 || acceptedStateKeys.has(row.state.key))
      .filter((row) => (
        serviceFilters.length === 0
        || row.serviceFilterIds.some((filterId) => serviceFilters.includes(filterId))
      ))
      .sort((left, right) => {
        const leftDate = left.appointmentDateKey || "";
        const rightDate = right.appointmentDateKey || "";
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return left.sortTime.localeCompare(right.sortTime);
      });
  }, [dailyRows, normalizedSearchTerm, serviceFilters, statusFilters]);

  const highlightAppointmentId = reviewAppointmentId || absenceReviewAppointmentId || null;
  const mobileSummaryCards = useMemo(
    () => [
      {
        key: "total",
        icon: Users,
        label: "Total do dia",
        value: dailyStats.total,
        helper: `${dailyStats.total} agendamento${dailyStats.total === 1 ? "" : "s"}`,
        iconClassName: "bg-blue-50 text-blue-600",
        valueClassName: "text-blue-600",
      },
      {
        key: "arriving",
        icon: CalendarClock,
        label: "Chegando",
        value: dailyStats.arriving,
        helper: "não estão aqui",
        iconClassName: "bg-blue-50 text-blue-600",
        valueClassName: "text-blue-600",
      },
      {
        key: "present",
        icon: PawPrint,
        label: "Presente",
        value: dailyStats.present,
        helper: "estão aqui",
        iconClassName: "bg-emerald-50 text-emerald-600",
        valueClassName: "text-emerald-600",
      },
      {
        key: "absent",
        icon: TriangleAlert,
        label: "Faltou",
        value: dailyStats.absent,
        helper: "falta confirmada",
        iconClassName: "bg-rose-50 text-rose-600",
        valueClassName: "text-rose-600",
      },
    ],
    [dailyStats],
  );

  function toggleStatusFilter(filterId) {
    setStatusFilters((current) => (
      current.includes(filterId) ? current.filter((item) => item !== filterId) : [...current, filterId]
    ));
  }

  function toggleServiceFilter(filterId) {
    setServiceFilters((current) => (
      current.includes(filterId) ? current.filter((item) => item !== filterId) : [...current, filterId]
    ));
  }

  function clearAppointmentFilters() {
    setStatusFilters([]);
    setServiceFilters([]);
  }

  function handleMobilePrimaryAction(row) {
    if (row.hasCommercialPending) {
      openAvulsoActionsDialog(row.appointment);
      return;
    }

    if (row.state.key === "arriving") {
      openRegistradorForAppointment(row.appointment);
      return;
    }

    if (row.appointment?.orcamento_id) {
      openLinkedOrcamento(row.appointment);
      return;
    }

    openRecordsDialog(row.appointment);
  }

  function openPackageDialog(appointment) {
    const meta = getAppointmentMeta(appointment);
    setSelectedAppointment(appointment);
    setPackageCode(meta.package_code || "");
    setPackageNotes(meta.commercial_notes || "");
    setPackageDialogOpen(true);
  }

  function openAvulsoActionsDialog(appointment) {
    setSelectedAppointment(appointment);
    setAvulsoActionsDialogOpen(true);
  }

  function openRecordsDialog(appointment) {
    setSelectedAppointment(appointment);
    setRecordsDialogOpen(true);
  }

  async function resolveReceivableIfNeeded(appointment) {
    if (appointment.charge_type !== "avulso" || !appointment.linked_checkin_id) return;
    const checkin = checkins.find((item) => item.id === appointment.linked_checkin_id);
    if (!checkin) return;
    const owner = ownerByDogId[appointment.dog_id] || {};
    const payload = buildReceivablePayload({
      appointment,
      checkin,
      owner,
      dueDate: getAppointmentDateKey(appointment),
    });
    const existing = await ContaReceber.filter({ source_key: payload.source_key }, "-created_date", 1);
    if (!existing?.length) {
      await ContaReceber.create(payload);
    }
  }

  async function confirmPackageClassification() {
    if (!selectedAppointment) return;
    setIsSaving(true);
    try {
      const currentMeta = getAppointmentMeta(selectedAppointment);
      await Appointment.update(selectedAppointment.id, {
        charge_type: "pacote",
        metadata: {
          ...currentMeta,
          commercial_review_pending: false,
          package_code: packageCode || "",
          commercial_notes: packageNotes || "",
        },
      });
      await loadData(true);
      setPackageDialogOpen(false);
      setSelectedAppointment(null);
    } catch (error) {
      console.error("Erro ao classificar como pacote:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateOrcamento(appointment) {
    setIsSaving(true);
    try {
      const currentMeta = getAppointmentMeta(appointment);
      const nextAppointment = {
        ...appointment,
        charge_type: "avulso",
      };
      await Appointment.update(appointment.id, {
        charge_type: "avulso",
        metadata: {
          ...currentMeta,
          commercial_review_pending: false,
        },
      });
      await resolveReceivableIfNeeded(nextAppointment);
      const dog = dogsById[appointment.dog_id];
      navigate(
        `${createPageUrl("Orcamentos")}?dogId=${encodeURIComponent(getInternalEntityReference(dog) || appointment.dog_id)}&service=${encodeURIComponent(appointment.service_type || "")}&date=${encodeURIComponent(getAppointmentDateKey(appointment) || "")}&appointmentId=${encodeURIComponent(appointment.id)}&owner=${encodeURIComponent(ownerByDogId[appointment.dog_id]?.nome || dog?.nome || "")}`,
      );
    } catch (error) {
      console.error("Erro ao preparar orcamento avulso:", error);
    } finally {
      setIsSaving(false);
    }
  }

  function openRegistradorForAppointment(appointment) {
    navigate(
      `${createPageUrl("Registrador")}?date=${encodeURIComponent(getAppointmentDateKey(appointment) || "")}&appointmentId=${encodeURIComponent(appointment.id)}`,
    );
  }

  function openLinkedOrcamento(appointment) {
    if (!appointment?.orcamento_id) return;
    navigate(`${createPageUrl("Orcamentos")}?orcamentoId=${encodeURIComponent(appointment.orcamento_id)}`);
  }

  async function handleMarkAbsence(appointment) {
    setIsSaving(true);
    try {
      const currentMeta = getAppointmentMeta(appointment);
      const serviceDate = getAppointmentDateKey(appointment);
      await Appointment.update(appointment.id, {
        status: "faltou",
        metadata: {
          ...currentMeta,
          absence_review_pending: false,
          absence_confirmed_at: new Date().toISOString(),
          replacement_deadline:
            appointment.charge_type === "pacote"
              ? currentMeta.suggested_replacement_deadline || addDays(serviceDate, 30)
              : null,
          finance_review_required: appointment.charge_type !== "pacote",
          finance_follow_up: appointment.charge_type === "pacote" ? null : "avaliar_pagamento_ou_credito",
        },
      });
      await loadData(true);
    } catch (error) {
      console.error("Erro ao marcar falta:", error);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#f6f8fc] p-2.5 sm:p-3 xl:p-4">
      <div className="mx-auto w-full max-w-[1200px]">
        <PageHeader
          eyebrow="Operacional / Agendamentos"
          title="Agendamentos"
          description="Consulte os atendimentos por responsável, cão, monitor, status ou serviço."
        />
      </div>

      <div className="space-y-4 xl:hidden">
        <AppointmentSearchFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          filterDate={filterDate}
          onDateChange={setFilterDate}
          selectedDayKey={selectedDayKey}
          statusFilters={statusFilters}
          serviceFilters={serviceFilters}
          onToggleStatus={toggleStatusFilter}
          onToggleService={toggleServiceFilter}
          onClearFilters={clearAppointmentFilters}
        />

        <Card className="min-w-0 rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-0.5 p-3 pb-2.5 sm:p-4 sm:pb-3">
            <CardTitle className="text-[16px] font-semibold tracking-tight text-slate-950 sm:text-[18px]">Agendamentos do dia</CardTitle>
            <CardDescription className="text-xs">
              {filteredMainRows.length} resultado{filteredMainRows.length === 1 ? "" : "s"} para a data selecionada.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2.5 pb-2.5 sm:px-4 sm:pb-4">
            <div className="min-w-0 rounded-[18px] bg-slate-50/70 p-2 sm:rounded-[22px] sm:p-2.5">
              {filteredMainRows.length > 0 ? (
                <div className="space-y-2">
                  {filteredMainRows.map((row) => {
                    const isHighlighted = highlightAppointmentId === row.appointment.id;

                    return (
                      <ResponsiveAppointmentCard
                        key={row.appointment.id}
                        row={row}
                        isHighlighted={isHighlighted}
                        onPrimaryAction={handleMobilePrimaryAction}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-8 text-center sm:py-10">
                  <p className="text-[14px] font-semibold text-slate-700">Nenhum agendamento encontrado neste recorte.</p>
                  <p className="mx-auto mt-1.5 max-w-xs text-[12px] leading-5 text-slate-500">
                    Ajuste a busca, a data ou os filtros para encontrar os atendimentos.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="min-w-0">
          <div className="grid min-w-0 grid-cols-4 gap-1.5">
              {mobileSummaryCards.map((card) => (
                <MobileSummaryCard
                  key={card.key}
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  helper={card.helper}
                  iconClassName={card.iconClassName}
                  valueClassName={card.valueClassName}
                />
              ))}
          </div>
        </section>

      </div>

      <div className="hidden min-w-0 xl:block">
      <div className="mx-auto w-full min-w-0 max-w-[1200px] space-y-4">
        <div className="rounded-[22px] border border-white/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur">
          <AppointmentSearchFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            filterDate={filterDate}
            onDateChange={setFilterDate}
            selectedDayKey={selectedDayKey}
            statusFilters={statusFilters}
            serviceFilters={serviceFilters}
            onToggleStatus={toggleStatusFilter}
            onToggleService={toggleServiceFilter}
            onClearFilters={clearAppointmentFilters}
          />
        </div>

        <section>
          <div className="grid grid-cols-4 gap-2.5">
            <SummaryCard
              icon={Users}
              label="Total do dia"
              value={dailyStats.total}
              helper={`${dailyStats.total} agendamento${dailyStats.total === 1 ? "" : "s"}`}
              iconClassName="bg-blue-50 text-blue-600"
              valueClassName="text-blue-600"
            />
            <SummaryCard
              icon={CalendarClock}
              label="Chegando"
              value={dailyStats.arriving}
              helper="Não estão aqui"
              iconClassName="bg-blue-50 text-blue-600"
              valueClassName="text-blue-600"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Presente"
              value={dailyStats.present}
              helper="Estão aqui"
              iconClassName="bg-emerald-50 text-emerald-600"
              valueClassName="text-emerald-600"
            />
            <SummaryCard
              icon={TriangleAlert}
              label="Faltou"
              value={dailyStats.absent}
              helper="Falta confirmada pelo comercial"
              iconClassName="bg-rose-50 text-rose-600"
              valueClassName="text-rose-600"
            />
          </div>
        </section>

        <Card className="min-w-0 rounded-[22px] border border-slate-200 shadow-sm">
          <CardHeader className="p-4 pb-3">
            <div>
              <CardTitle className="text-xl text-slate-950">Agendamentos do dia</CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-500">
                {filteredMainRows.length} resultado{filteredMainRows.length === 1 ? "" : "s"} para a data selecionada.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="min-w-0 px-4 pb-4">
            <div className="min-w-0 overflow-hidden rounded-[18px] border border-slate-200">
              <div className="grid grid-cols-[58px_88px_minmax(130px,1.15fr)_minmax(116px,.9fr)_minmax(120px,1fr)_108px_126px] items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <span>Horário</span>
                <span>Status</span>
                <span>Pet / atividade</span>
                <span>Serviço</span>
                <span>Detalhes</span>
                <span>Check-in</span>
                <span className="text-right">Ações</span>
              </div>

              <div className="divide-y divide-slate-100 bg-white">
                {filteredMainRows.length > 0 ? (
                  filteredMainRows.map((row) => {
                    const bucket = row.bucket;
                    const Icon = bucket.icon;
                    const isHighlighted = highlightAppointmentId === row.appointment.id;
                    const recordSummary = row.checkinTime
                      ? `Check-in: ${formatTime(row.checkinTime)}`
                      : `Horário: ${row.scheduleTime || "--:--"}`;

                    return (
                      <div
                        key={row.appointment.id}
                        className={cn(
                          "grid grid-cols-[58px_88px_minmax(130px,1.15fr)_minmax(116px,.9fr)_minmax(120px,1fr)_108px_126px] items-center gap-2.5 px-3 py-3 transition hover:bg-slate-50",
                          isHighlighted && "bg-amber-50/80",
                        )}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{row.scheduleTime || "--:--"}</p>
                        </div>

                        <div className="flex min-w-0 flex-col items-start gap-1.5">
                          <AppointmentStatusBadge stateKey={row.state.key} label={row.state.label} />
                          {row.hasCommercialPending ? (
                            <span className="text-xs font-semibold text-amber-600">Pendente comercial</span>
                          ) : null}
                          {row.ownerFinancialStatus.isIrregular && row.appointment.source_type === "manual_registrador" ? (
                            <span className="text-xs font-semibold text-rose-600">Financeiro irregular</span>
                          ) : null}
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-500">
                            <PawPrint className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{row.primaryLabel}</p>
                            <p className="truncate text-xs text-slate-500">{row.secondaryLabel}</p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]", bucket.iconClassName)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{row.serviceLine.title}</p>
                            <p className="truncate text-xs text-slate-500">{row.serviceLine.subtitle}</p>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">{row.ownerDisplayName}</p>
                          <p className="truncate text-xs text-slate-500">{row.sourceLabel}</p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-slate-900">{recordSummary}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.checkoutTime ? `Check-out: ${formatTime(row.checkoutTime)}` : "Aguardando saida"}
                          </p>
                        </div>

                        <AppointmentActions
                          appointment={row.appointment}
                          state={row.state}
                          isSaving={isSaving}
                          onOpenRegistrador={openRegistradorForAppointment}
                          onOpenRecords={openRecordsDialog}
                          onOpenOrcamento={openLinkedOrcamento}
                          onOpenPackageDialog={openPackageDialog}
                          onCreateOrcamento={handleCreateOrcamento}
                          onMarkAbsence={handleMarkAbsence}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-10 text-center">
                    <p className="text-base font-semibold text-slate-700">Nenhum agendamento encontrado neste recorte.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Ajuste a busca, a data ou os filtros para encontrar os atendimentos.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
      </div>

      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Classificar como pacote</DialogTitle>
            <DialogDescription>
              Informe o codigo do pacote para que a cobranca siga o contrato recorrente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Codigo do pacote</Label>
              <Input value={packageCode} onChange={(event) => setPackageCode(event.target.value)} className="mt-2" placeholder="Ex.: PAC-DAYCARE-2026" />
            </div>
            <div>
              <Label>Observacoes comerciais</Label>
              <Input value={packageNotes} onChange={(event) => setPackageNotes(event.target.value)} className="mt-2" placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPackageDialogOpen(false)}>Cancelar</Button>
            <Button onClick={confirmPackageClassification} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Confirmar pacote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={avulsoActionsDialogOpen} onOpenChange={setAvulsoActionsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendamento avulso</DialogTitle>
            <DialogDescription>
              Escolha a acao desejada para este atendimento.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {getAppointmentPrimaryLabel(selectedAppointment, dogsById[selectedAppointment.dog_id])}
                  </p>
                  <Badge variant="outline">{getServiceLabel(selectedAppointment.service_type)}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">Avulso</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {formatOwnerAppointmentLine(getAppointmentOwnerDisplay(ownerByDogId[selectedAppointment.dog_id] || {}, selectedAppointment), selectedAppointment)}
                </p>
              </div>

              <div className="grid gap-3">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    openRecordsDialog(selectedAppointment);
                    setAvulsoActionsDialogOpen(false);
                  }}
                >
                  Ver registros
                </Button>
                <Button
                  className="justify-start bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-200"
                  disabled={!selectedAppointment.orcamento_id}
                  onClick={() => {
                    openLinkedOrcamento(selectedAppointment);
                    setAvulsoActionsDialogOpen(false);
                  }}
                >
                  Abrir Orcamento
                </Button>
                {!selectedAppointment.orcamento_id ? (
                  <p className="text-xs text-amber-700">
                    Este agendamento nao possui orcamento vinculado.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvulsoActionsDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recordsDialogOpen} onOpenChange={setRecordsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registros do atendimento</DialogTitle>
            <DialogDescription>
              Confira os dados de check-in e check-out vinculados a este servico.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">
                    {getAppointmentPrimaryLabel(selectedAppointment, dogsById[selectedAppointment.dog_id])}
                  </p>
                  <Badge variant="outline">{getServiceLabel(selectedAppointment.service_type)}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">{getChargeTypeLabel(selectedAppointment.charge_type)}</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {formatOwnerAppointmentLine(getAppointmentOwnerDisplay(ownerByDogId[selectedAppointment.dog_id] || {}, selectedAppointment), selectedAppointment)}
                </p>
              </div>

              {selectedAppointmentRecord ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Check-in</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <p><span className="font-medium text-gray-900">Entrada:</span> {formatDateTime(selectedAppointmentRecord.checkin_datetime || selectedAppointmentRecord.data_checkin)}</p>
                      <p><span className="font-medium text-gray-900">Quem trouxe:</span> {selectedAppointmentRecord.entregador_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Monitor:</span> {selectedAppointmentRecord.checkin_monitor_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Tem refeicao:</span> {selectedAppointmentRecord.tem_refeicao ? "Sim" : "Nao"}</p>
                      {selectedAppointmentRecord.refeicao_observacao ? (
                        <p><span className="font-medium text-gray-900">Observacao da refeicao:</span> {selectedAppointmentRecord.refeicao_observacao}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Check-out</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <p><span className="font-medium text-gray-900">Saida:</span> {formatDateTime(selectedAppointmentRecord.checkout_datetime || selectedAppointmentRecord.data_checkout)}</p>
                      <p><span className="font-medium text-gray-900">Quem buscou:</span> {selectedAppointmentRecord.retirador_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Monitor:</span> {selectedAppointmentRecord.checkout_monitor_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Status:</span> {selectedAppointmentRecord.status || "-"}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Resumo</p>
                    <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                      <p><span className="font-medium text-gray-900">Registros de refeicao:</span> {getCheckinMealRecords(selectedAppointmentRecord).length}</p>
                      <p><span className="font-medium text-gray-900">Observacoes:</span> {selectedAppointmentRecord.observacoes || "-"}</p>
                      <p><span className="font-medium text-gray-900">Foto dos pertences na entrada:</span> {selectedAppointmentRecord.pertences_entrada_foto_url ? "Anexada" : "Nao anexada"}</p>
                      <p><span className="font-medium text-gray-900">Foto dos pertences na saida:</span> {selectedAppointmentRecord.pertences_saida_foto_url ? "Anexada" : "Nao anexada"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                  Nenhum registro de check-in ou check-out foi encontrado para este atendimento.
                </div>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordsDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
