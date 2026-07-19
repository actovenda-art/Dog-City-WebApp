import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Orcamento, User } from "@/api/entities";
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
import { isOperationalProfile } from "@/lib/access-control";
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
import { Progress } from "@/components/ui/progress";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import {
  Calendar,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Home,
  LoaderCircle,
  MoreHorizontal,
  PawPrint,
  RefreshCw,
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
    serviceTypes: ["banho", "tosa"],
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
  arrived: {
    label: "Já chegaram",
    badgeLabel: "Chegou",
    valueClassName: "text-emerald-600",
    containerClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
    subtleClassName: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  },
  late: {
    label: "Atrasados",
    badgeLabel: "Atrasado",
    valueClassName: "text-amber-600",
    containerClassName: "border-amber-200 bg-amber-50 text-amber-700",
    subtleClassName: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  },
  upcoming: {
    label: "Previstos",
    badgeLabel: "Previsto",
    valueClassName: "text-violet-600",
    containerClassName: "border-violet-200 bg-violet-50 text-violet-700",
    subtleClassName: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  },
  no_show: {
    label: "Não compareceram",
    badgeLabel: "Não compareceu",
    valueClassName: "text-rose-600",
    containerClassName: "border-rose-200 bg-rose-50 text-rose-700",
    subtleClassName: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
  completed: {
    label: "Realizados",
    badgeLabel: "Realizado",
    valueClassName: "text-slate-700",
    containerClassName: "border-slate-200 bg-slate-50 text-slate-700",
    subtleClassName: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  },
  attention: {
    label: "Precisa de atencao",
    badgeLabel: "Verificar falta",
    valueClassName: "text-rose-600",
    containerClassName: "border-rose-200 bg-rose-50 text-rose-700",
    subtleClassName: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  },
};

const MAIN_SERVICE_FILTERS = ["all", ...SERVICE_BUCKETS.map((service) => service.id)];

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
  if (["banho", "tosa"].includes(serviceType)) return "banho";
  return "diversos";
}

function getServiceBucketConfig(appointment) {
  const bucketId = getServiceBucketId(appointment?.service_type);
  return SERVICE_BUCKETS.find((bucket) => bucket.id === bucketId) || SERVICE_BUCKETS[SERVICE_BUCKETS.length - 1];
}

function getScheduleTimestamp(appointment) {
  const dateKey = getAppointmentDateKey(appointment);
  if (!dateKey) return null;
  const timeValue = getAppointmentTimeValue(appointment, "entrada") || "09:00";
  return new Date(`${dateKey}T${timeValue}:00`);
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
  const todayKey = getTodayKey();
  const appointmentDateKey = getAppointmentDateKey(appointment);
  const scheduleTimestamp = getScheduleTimestamp(appointment);
  const now = new Date();
  const hasCheckin = Boolean(record?.checkin_datetime || record?.data_checkin) || appointment?.status === "presente";
  const hasCheckout = Boolean(record?.checkout_datetime || record?.data_checkout) || appointment?.status === "finalizado";
  const isNoShowConfirmed = appointment?.status === "faltou" || Boolean(meta.absence_confirmed_at);
  const needsAbsenceReview = Boolean(meta.absence_review_pending);

  if (isNoShowConfirmed) {
    return { key: "no_show", label: STATUS_STYLES.no_show.badgeLabel, needsAbsenceReview };
  }

  if (hasCheckout) {
    return { key: "completed", label: STATUS_STYLES.completed.badgeLabel, needsAbsenceReview };
  }

  if (hasCheckin) {
    return { key: "arrived", label: STATUS_STYLES.arrived.badgeLabel, needsAbsenceReview };
  }

  if (appointmentDateKey && appointmentDateKey < todayKey) {
    return {
      key: needsAbsenceReview ? "attention" : "late",
      label: needsAbsenceReview ? STATUS_STYLES.attention.badgeLabel : STATUS_STYLES.late.badgeLabel,
      needsAbsenceReview,
    };
  }

  if (appointmentDateKey === todayKey && scheduleTimestamp && scheduleTimestamp <= now) {
    return {
      key: needsAbsenceReview ? "attention" : "late",
      label: needsAbsenceReview ? STATUS_STYLES.attention.badgeLabel : STATUS_STYLES.late.badgeLabel,
      needsAbsenceReview,
    };
  }

  if (needsAbsenceReview) {
    return { key: "attention", label: STATUS_STYLES.attention.badgeLabel, needsAbsenceReview };
  }

  return { key: "upcoming", label: STATUS_STYLES.upcoming.badgeLabel, needsAbsenceReview };
}

function formatDateControlLabel(dateKey) {
  if (!dateKey) return "Hoje";
  const date = new Date(`${dateKey}T12:00:00`);
  const isToday = dateKey === getTodayKey();
  const dateLabel = formatLongDate(`${dateKey}T12:00:00`);
  return isToday ? `Hoje • ${dateLabel}` : dateLabel;
}

function SummaryCard({ icon: Icon, label, value, helper, iconClassName, valueClassName }) {
  return (
    <Card className="rounded-[16px] border border-slate-200 shadow-sm">
      <CardContent className="p-3.5">
        <div className="flex items-start justify-between gap-4">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", iconClassName)}>
            <Icon className="h-3 w-3" />
          </div>
        </div>
        <div className="mt-2.5 space-y-0.5">
          <p className="text-[11px] font-semibold text-slate-900">{label}</p>
          <p className={cn("text-[28px] font-bold tracking-tight", valueClassName)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ icon: Icon, label, value, active, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
        active ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
      )}
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{label}</span>
        <span className="block text-[13px] font-bold">{value}</span>
      </span>
    </button>
  );
}

function AppointmentStatusBadge({ stateKey, label }) {
  const style = STATUS_STYLES[stateKey] || STATUS_STYLES.upcoming;
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", style.subtleClassName)}>
      {label}
    </span>
  );
}

function MobileSummaryCard({ icon: Icon, label, value, helper, iconClassName, valueClassName }) {
  return (
    <Card className="rounded-[14px] border border-slate-200 shadow-sm">
      <CardContent className="p-1.5">
        <div className={cn("flex h-5 w-5 items-center justify-center rounded-md", iconClassName)}>
          <Icon className="h-2.5 w-2.5" />
        </div>
        <div className="mt-1.5 space-y-0.5">
          <p className="text-[8px] font-semibold leading-3 text-slate-950">{label}</p>
          <p className={cn("text-[14px] font-bold tracking-tight", valueClassName)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function getMobileTopViewKey(topTab, statusView) {
  if (topTab === "pendencias_comerciais") return "pendencias";
  if (topTab === "nao_compareceram") return "nao_compareceram";
  if (topTab === "presentes_agora" || (topTab === "operacao" && statusView === "arrived")) return "presentes";
  if (topTab === "operacao" && statusView === "upcoming") return "previstos";
  return "operacao";
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
  if (row.state.key === "arrived" || row.state.key === "completed") {
    return {
      shortLabel: "Chegou",
      shortLabelClassName: "text-emerald-600",
      actionText: row.checkinTime ? formatTime(row.checkinTime) : "Concluido",
      actionTextClassName: "text-emerald-600",
      actionToneClassName: "border-emerald-100 bg-emerald-50 text-emerald-600",
      actionIcon: CheckCircle2,
    };
  }

  if (row.state.key === "late" || row.state.key === "attention") {
    return {
      shortLabel: "Atrasado",
      shortLabelClassName: "text-amber-600",
      actionText: "Aguardando\ncheck-in",
      actionTextClassName: "text-amber-600",
      actionToneClassName: "border-amber-100 bg-amber-50 text-amber-600",
      actionIcon: Clock3,
    };
  }

  if (row.state.key === "no_show") {
    return {
      shortLabel: "Nao veio",
      shortLabelClassName: "text-rose-600",
      actionText: "Sem\ncheck-in",
      actionTextClassName: "text-rose-600",
      actionToneClassName: "border-rose-100 bg-rose-50 text-rose-600",
      actionIcon: TriangleAlert,
    };
  }

  const expectedLabel = row.bucket.id === "diversos" ? "Horario\nprevisto" : "Check-in\nprevisto";
  return {
    shortLabel: "Previsto",
    shortLabelClassName: "text-blue-600",
    actionText: `${expectedLabel}: ${row.scheduleTime || "--:--"}`,
    actionTextClassName: "text-slate-500",
    actionToneClassName: "border-slate-200 bg-white text-slate-500",
    actionIcon: Calendar,
  };
}

function AppointmentActions({ appointment, state, isSaving, onOpenRegistrador, onOpenRecords, onOpenOrcamento, onOpenPackageDialog, onCreateOrcamento, onMarkAbsence }) {
  const primaryAction =
    state.key === "late" || state.key === "attention" || state.key === "upcoming"
      ? {
          label: state.key === "attention" ? "Resolver agora" : "Registrar check-in",
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [filterDate, setFilterDate] = useState(getTodayKey());
  const [topTab, setTopTab] = useState(
    reviewAppointmentId ? "pendencias_comerciais" : absenceReviewAppointmentId ? "nao_compareceram" : "operacao",
  );
  const [statusView, setStatusView] = useState("all");
  const [serviceView, setServiceView] = useState("all");
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
    const baseIndex = buildDogOwnerIndex(carteiras, []);
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
  }, [carteiras, dogs]);
  const financialStatusMap = useMemo(() => buildFinancialOperationalStatusMap(contasReceber), [contasReceber]);
  const visibleAppointments = useMemo(
    () => filterAppointmentsByApprovedOrcamentos(appointments, orcamentosById).sort(compareAppointments),
    [appointments, orcamentosById],
  );
  const appointmentRecordByAppointmentId = useMemo(() => buildAppointmentRecordIndex(checkins), [checkins]);

  async function loadData(silent = false) {
    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const [me, appointmentRows, orcamentoRows, dogRows, carteiraRows, checkinRows, contaRows] = await Promise.all([
        User.me(),
        Appointment.listAll("-created_date", 1000, 5000),
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Checkin.listAll("-created_date", 1000, 5000),
        ContaReceber.listAll ? ContaReceber.listAll("-created_date", 1000, 10000) : ContaReceber.list("-created_date", 5000),
      ]);
      setCurrentUser(me || null);
      setAppointments(appointmentRows || []);
      setOrcamentos(orcamentoRows || []);
      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setCheckins(checkinRows || []);
      setContasReceber(contaRows || []);
    } catch (error) {
      console.error("Erro ao carregar agendamentos:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  const shouldHideOperationalAlerts = useMemo(() => isOperationalProfile(currentUser), [currentUser]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (shouldHideOperationalAlerts && topTab === "pendencias_comerciais") {
      setTopTab("operacao");
    }
  }, [shouldHideOperationalAlerts, topTab]);

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

  const pendingCommercialAppointments = useMemo(() => {
    return visibleAppointments.filter((appointment) => {
      const meta = getAppointmentMeta(appointment);
      return appointment.source_type === "manual_registrador" && (
        appointment.charge_type === "pendente_comercial" || meta.commercial_review_pending
      );
    });
  }, [visibleAppointments]);

  const pendingAbsenceAppointments = useMemo(() => {
    return visibleAppointments.filter((appointment) => getAppointmentMeta(appointment).absence_review_pending);
  }, [visibleAppointments]);

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

      return {
        appointment,
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
    const arrived = dailyRows.filter((row) => row.state.key === "arrived").length;
    const late = dailyRows.filter((row) => ["late", "attention"].includes(row.state.key)).length;
    const upcoming = dailyRows.filter((row) => row.state.key === "upcoming").length;
    const noShow = dailyRows.filter((row) => row.state.key === "no_show").length;

    return {
      total: dailyRows.length,
      arrived,
      late,
      upcoming,
      noShow,
    };
  }, [dailyRows]);

  const serviceSummary = useMemo(() => {
    return SERVICE_BUCKETS.map((bucket) => {
      const bucketRows = dailyRows.filter((row) => row.bucket.id === bucket.id);
      const total = bucketRows.length;
      const arrived = bucketRows.filter((row) => row.state.key === "arrived").length;
      const late = bucketRows.filter((row) => ["late", "attention"].includes(row.state.key)).length;
      const upcoming = bucketRows.filter((row) => row.state.key === "upcoming").length;
      const noShow = bucketRows.filter((row) => row.state.key === "no_show").length;
      const rate = total > 0 ? Math.round((arrived / total) * 100) : 0;

      return {
        ...bucket,
        total,
        arrived,
        late,
        upcoming,
        noShow,
        rate,
      };
    });
  }, [dailyRows]);

  const lateRows = useMemo(() => {
    return dailyRows.filter((row) => ["late", "attention"].includes(row.state.key));
  }, [dailyRows]);

  const baseRows = useMemo(() => {
    if (topTab === "presentes_agora") {
      return dailyRows.filter((row) => row.state.key === "arrived");
    }

    if (topTab === "nao_compareceram") {
      return appointmentPresentationRows.filter((row) => row.state.key === "no_show" || row.hasAbsenceReviewPending);
    }

    if (topTab === "pendencias_comerciais") {
      return appointmentPresentationRows.filter((row) => row.hasCommercialPending);
    }

    return dailyRows;
  }, [appointmentPresentationRows, dailyRows, topTab]);

  const filteredMainRows = useMemo(() => {
    return baseRows
      .filter((row) => (serviceView === "all" ? true : row.bucket.id === serviceView))
      .filter((row) => {
        if (topTab !== "operacao" || statusView === "all") return true;
        if (statusView === "late") return ["late", "attention"].includes(row.state.key);
        return row.state.key === statusView;
      })
      .sort((left, right) => {
        const leftDate = left.appointmentDateKey || "";
        const rightDate = right.appointmentDateKey || "";
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return left.sortTime.localeCompare(right.sortTime);
      });
  }, [baseRows, serviceView, statusView, topTab]);

  const highlightAppointmentId = reviewAppointmentId || absenceReviewAppointmentId || null;
  const mobileTopView = useMemo(() => getMobileTopViewKey(topTab, statusView), [statusView, topTab]);
  const mobileTopTabs = useMemo(
    () => [
      { key: "operacao", label: "Operação", icon: ClipboardList, toneClassName: "text-blue-600" },
      { key: "presentes", label: "Presentes Agora", icon: PawPrint, toneClassName: "text-emerald-600" },
      { key: "previstos", label: "Previstos", icon: Calendar, toneClassName: "text-amber-500" },
      { key: "nao_compareceram", label: "Nao Compareceram", icon: TriangleAlert, toneClassName: "text-rose-600" },
      { key: "pendencias", label: "Pendencias", icon: CalendarClock, toneClassName: "text-amber-500" },
    ],
    [],
  );
  const mobileSummaryCards = useMemo(
    () => [
      {
        key: "total",
        icon: Users,
        label: "Total previsto",
        value: dailyStats.total,
        helper: `${dailyStats.total} agendamento${dailyStats.total === 1 ? "" : "s"}`,
        iconClassName: "bg-blue-50 text-blue-600",
        valueClassName: "text-blue-600",
      },
      {
        key: "arrived",
        icon: PawPrint,
        label: "Presentes agora",
        value: dailyStats.arrived,
        helper: "ja chegaram",
        iconClassName: "bg-emerald-50 text-emerald-600",
        valueClassName: "text-emerald-600",
      },
      {
        key: "upcoming",
        icon: Calendar,
        label: "Previstos",
        value: dailyStats.upcoming,
        helper: "ainda podem chegar",
        iconClassName: "bg-amber-50 text-amber-500",
        valueClassName: "text-amber-500",
      },
      {
        key: "late",
        icon: Clock3,
        label: "Atrasados",
        value: dailyStats.late,
        helper: "aguardando check-in",
        iconClassName: "bg-orange-50 text-orange-500",
        valueClassName: "text-orange-500",
      },
      {
        key: "no_show",
        icon: TriangleAlert,
        label: "Não compareceram",
        value: dailyStats.noShow,
        helper: "sem check-in",
        iconClassName: "bg-rose-50 text-rose-600",
        valueClassName: "text-rose-600",
      },
    ],
    [dailyStats],
  );

  function applyMobileTopView(nextView) {
    if (nextView === "presentes") {
      setTopTab("operacao");
      setStatusView("arrived");
      return;
    }

    if (nextView === "previstos") {
      setTopTab("operacao");
      setStatusView("upcoming");
      return;
    }

    if (nextView === "nao_compareceram") {
      setTopTab("nao_compareceram");
      setStatusView("all");
      return;
    }

    if (nextView === "pendencias") {
      setTopTab("pendencias_comerciais");
      setStatusView("all");
      return;
    }

    setTopTab("operacao");
    setStatusView("all");
  }

  function handleMobilePrimaryAction(row) {
    if (row.hasCommercialPending) {
      openAvulsoActionsDialog(row.appointment);
      return;
    }

    if (["late", "attention", "upcoming"].includes(row.state.key)) {
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
    <div className="min-h-screen bg-[#f6f8fc] p-3 lg:p-4">
      <div className="space-y-6 lg:hidden">
        <div className="-mx-3 overflow-x-auto border-b border-slate-200 bg-white/90 px-3 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-center gap-3">
            {mobileTopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = mobileTopView === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => applyMobileTopView(tab.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 border-b-2 pb-3 pt-1 text-[12px] font-semibold tracking-tight transition",
                    isActive ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive ? "text-blue-600" : tab.toneClassName)} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <DatePickerInput
            value={filterDate}
            onChange={setFilterDate}
            placeholder={formatDateControlLabel(selectedDayKey)}
            className="h-14 rounded-2xl border-slate-200 bg-white px-4 text-[16px] font-semibold shadow-sm"
          />
          <Button
            variant="outline"
            onClick={() => loadData(true)}
            className="h-14 rounded-2xl border-slate-200 bg-white px-5 text-[16px] font-semibold text-slate-900 shadow-sm hover:bg-white"
          >
            {isRefreshing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </div>

        <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-3 pb-4">
            <CardTitle className="text-[18px] font-semibold tracking-tight text-slate-950">
              {mobileTopView === "pendencias" ? "Pendencias comerciais" : "Agendamentos do dia (todos os servicos)"}
            </CardTitle>
            <div className="grid grid-cols-3 gap-2">
                {MAIN_SERVICE_FILTERS.map((filterId) => {
                  const isActive = serviceView === filterId;
                  const label = filterId === "all"
                    ? "Todos"
                    : SERVICE_BUCKETS.find((service) => service.id === filterId)?.label || filterId;
                  return (
                    <button
                      key={filterId}
                      type="button"
                      onClick={() => setServiceView(filterId)}
                      className={cn(
                        "rounded-2xl border px-2.5 py-2 text-[11px] font-semibold transition",
                        isActive
                          ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-hidden rounded-[24px] border border-slate-100 bg-white">
              {filteredMainRows.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredMainRows.map((row) => {
                    const bucket = row.bucket;
                    const BucketIcon = bucket.icon;
                    const actionMeta = getMobileOperationalMeta(row);
                    const ActionIcon = actionMeta.actionIcon;
                    const thumbnail = getAppointmentThumbnail(row);
                    const isHighlighted = highlightAppointmentId === row.appointment.id;

                    return (
                      <div
                        key={row.appointment.id}
                        className={cn("flex items-center gap-2 px-2 py-3", isHighlighted && "bg-amber-50/80")}
                      >
                        <div className="w-8 shrink-0">
                          <p className="text-[13px] font-semibold tracking-tight text-slate-950">{row.scheduleTime || "--:--"}</p>
                          <p className={cn("mt-1 text-[10px] font-semibold", actionMeta.shortLabelClassName)}>{actionMeta.shortLabel}</p>
                        </div>

                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-slate-100 bg-slate-50">
                          {thumbnail.kind === "image" ? (
                            <img src={thumbnail.src} alt={thumbnail.alt} className="h-full w-full object-cover" />
                          ) : thumbnail.kind === "dog" ? (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 via-amber-50 to-emerald-50 text-amber-700">
                              <PawPrint className="h-4.5 w-4.5" />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-white text-slate-500">
                              <thumbnail.icon className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold leading-4 text-slate-950">{row.primaryLabel}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.secondaryLabel}</p>
                          </div>

                          <div className="mt-1.5 flex items-start justify-between gap-1">
                            <div className="min-w-0 flex items-center gap-1.5">
                              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-xl", bucket.iconClassName)}>
                                <BucketIcon className="h-2.5 w-2.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-[11px] font-semibold leading-4 text-slate-950">{row.serviceLine.title}</p>
                                <p className="truncate text-[10px] text-slate-500">{row.serviceLine.subtitle}</p>
                              </div>
                            </div>

                            <p className={cn("max-w-[58px] whitespace-pre-line text-right text-[10px] font-medium leading-4", actionMeta.actionTextClassName)}>
                              {actionMeta.actionText}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleMobilePrimaryAction(row)}
                            className={cn("flex h-7 w-7 items-center justify-center rounded-full border transition", actionMeta.actionToneClassName)}
                            aria-label="Abrir ação principal do agendamento"
                          >
                            <ActionIcon className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMobilePrimaryAction(row)}
                            className="flex h-7 w-4 items-center justify-center text-slate-500"
                            aria-label="Abrir detalhes do agendamento"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-12 text-center">
                  <p className="text-[16px] font-semibold text-slate-700">Nenhum agendamento encontrado neste recorte.</p>
                  <p className="mt-2 text-[14px] leading-6 text-slate-500">
                    Ajuste a data ou os filtros para encontrar os atendimentos deste painel.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-slate-950">Resumo geral do dia</h2>
          <div className="grid grid-cols-5 gap-1">
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

      <div className="hidden lg:block">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <div className="flex flex-col gap-3 rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-blue-50 text-blue-600">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-950">Agendamentos</h1>
                  <p className="mt-1 max-w-2xl text-sm text-slate-500">
                    Painel operacional do dia com leitura por servico, status e pendencias de check-in.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 pb-0.5">
                {[
                  { id: "operacao", label: "Operação", count: dailyStats.total },
                  { id: "presentes_agora", label: "Presentes Agora", count: dailyStats.arrived },
                  { id: "nao_compareceram", label: "Nao Compareceram", count: dailyStats.noShow },
                  ...(!shouldHideOperationalAlerts
                    ? [{ id: "pendencias_comerciais", label: "Pendencias Comerciais", count: pendingCommercialAppointments.length }]
                    : []),
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTopTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-semibold transition",
                      topTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-700",
                    )}
                  >
                    <span>{tab.label}</span>
                    <span className="text-xs font-bold">{tab.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
              <Button
                variant="outline"
                onClick={() => loadData(true)}
                className="h-11 rounded-xl border-slate-200 px-4 text-sm font-semibold shadow-sm"
              >
                {isRefreshing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
              <div className="min-w-[208px]">
                <DatePickerInput
                  value={filterDate}
                  onChange={setFilterDate}
                  placeholder={formatDateControlLabel(selectedDayKey)}
                  className="h-11 rounded-xl border-slate-200 px-4 text-sm font-semibold shadow-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-950">Resumo geral do dia</h2>
          </div>

          <div className="grid gap-3 xl:grid-cols-5">
            <SummaryCard
              icon={Users}
              label="Total previsto"
              value={dailyStats.total}
              helper={`${dailyStats.total} agendamento${dailyStats.total === 1 ? "" : "s"}`}
              iconClassName="bg-blue-50 text-blue-600"
              valueClassName="text-blue-600"
            />
            <SummaryCard
              icon={CheckCircle2}
              label="Já chegaram"
              value={dailyStats.arrived}
              helper={dailyStats.total > 0 ? `${Math.round((dailyStats.arrived / dailyStats.total) * 100)}% do previsto` : "Sem chegadas registradas"}
              iconClassName="bg-emerald-50 text-emerald-600"
              valueClassName="text-emerald-600"
            />
            <SummaryCard
              icon={Clock3}
              label="Atrasados"
              value={dailyStats.late}
              helper="Aguardando check-in"
              iconClassName="bg-amber-50 text-amber-600"
              valueClassName="text-amber-600"
            />
            <SummaryCard
              icon={CalendarClock}
              label="Previstos"
              value={dailyStats.upcoming}
              helper="Ainda nao chegaram"
              iconClassName="bg-violet-50 text-violet-600"
              valueClassName="text-violet-600"
            />
            <SummaryCard
              icon={TriangleAlert}
              label="Não compareceram"
              value={dailyStats.noShow}
              helper="Sem check-in"
              iconClassName="bg-rose-50 text-rose-600"
              valueClassName="text-rose-600"
            />
          </div>
        </section>

        <Card className="rounded-[24px] border border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div>
              <CardTitle className="text-xl text-slate-950">
                {topTab === "pendencias_comerciais" ? "Pendencias comerciais" : "Agendamentos do dia (todos os servicos)"}
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-500">
                Feed operacional com status, servico e acao rapida para o dia selecionado.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              className="rounded-xl px-3 text-sm font-semibold text-blue-600"
              onClick={() => {
                setTopTab("operacao");
                setStatusView("all");
                setServiceView("all");
              }}
            >
              Ver todos
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2.5">
              {MAIN_SERVICE_FILTERS.map((filterId) => {
                const isActive = serviceView === filterId;
                const label = filterId === "all"
                  ? "Todos"
                  : SERVICE_BUCKETS.find((service) => service.id === filterId)?.label || filterId;
                return (
                  <button
                    key={filterId}
                    type="button"
                    onClick={() => setServiceView(filterId)}
                    className={cn(
                      "min-w-[108px] rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition",
                      isActive ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="overflow-x-auto rounded-[20px] border border-slate-200">
              <div className="grid grid-cols-[72px_104px_minmax(180px,1fr)_172px_184px_128px_148px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span>Horario</span>
                <span>Status</span>
                <span>Pet / atividade</span>
                <span>Servico</span>
                <span>Detalhes</span>
                <span>Check-in</span>
                <span className="text-right">Acoes</span>
              </div>

              <div className="divide-y divide-slate-100 bg-white">
                {filteredMainRows.length > 0 ? (
                  filteredMainRows.map((row) => {
                    const bucket = row.bucket;
                    const Icon = bucket.icon;
                    const isHighlighted = highlightAppointmentId === row.appointment.id;
                    const recordSummary = row.checkinTime
                      ? `Check-in: ${formatTime(row.checkinTime)}`
                      : `Previsto: ${row.scheduleTime || "--:--"}`;

                    return (
                      <div
                        key={row.appointment.id}
                        className={cn(
                          "grid grid-cols-[72px_104px_minmax(180px,1fr)_172px_184px_128px_148px] items-center gap-3 px-4 py-4 transition hover:bg-slate-50",
                          isHighlighted && "bg-amber-50/80",
                        )}
                      >
                        <div>
                          <p className="text-base font-semibold text-slate-950">{row.scheduleTime || "--:--"}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatLongDate(`${row.appointmentDateKey}T12:00:00`)}</p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <AppointmentStatusBadge stateKey={row.state.key} label={row.state.label} />
                          {row.hasCommercialPending ? (
                            <span className="text-xs font-semibold text-amber-600">Pendente comercial</span>
                          ) : null}
                          {row.ownerFinancialStatus.isIrregular && row.appointment.source_type === "manual_registrador" ? (
                            <span className="text-xs font-semibold text-rose-600">Financeiro irregular</span>
                          ) : null}
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                            <PawPrint className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-950">{row.primaryLabel}</p>
                            <p className="truncate text-xs text-slate-500">{row.secondaryLabel}</p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", bucket.iconClassName)}>
                            <Icon className="h-4 w-4" />
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
                      Ajuste a data ou os filtros visuais para encontrar os atendimentos deste painel.
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
