import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, addWeeks, differenceInCalendarDays, endOfMonth, format, getDay, isSameDay, isSameMonth, isWeekend, nextDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bath,
  AlertTriangle,
  Calendar,
  CalendarClock,
  CreditCard,
  Dog as DogIcon,
  Home,
  Pencil,
  Plus,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Truck,
  WandSparkles,
  Zap,
} from "lucide-react";

import { Appointment, Carteira, ContaReceber, Dog, PlanConfig, TabelaPrecos, User } from "@/api/entities";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePickerInput } from "@/components/common/DateTimeInputs";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_CARE_PACKAGE_TYPE = "day_care_pacote";

const SERVICE_OPTIONS = [
  {
    id: "day_care",
    label: "Day Care",
    icon: DogIcon,
    theme: "border-blue-200 bg-blue-50 text-blue-700",
    description: "Pacote recorrente com cobrança mensal e agendamentos automáticos.",
  },
  {
    id: "hospedagem",
    label: "Hospedagem",
    icon: Home,
    theme: "border-cyan-200 bg-cyan-50 text-cyan-700",
    description: "Plano fixo com agendamento e cobrança mensal.",
  },
  {
    id: "banho",
    label: "Banho",
    icon: Bath,
    theme: "border-violet-200 bg-violet-50 text-violet-700",
    description: "Banhos recorrentes com vencimento fixo.",
  },
  {
    id: "tosa",
    label: "Tosa",
    icon: Scissors,
    theme: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    description: "Tosa recorrente para agenda automática.",
  },
  {
    id: "banho_tosa",
    label: "Banho e Tosa",
    icon: Sparkles,
    theme: "border-purple-200 bg-purple-50 text-purple-700",
    description: "Plano combinado para banho e tosa na mesma recorrência.",
  },
  {
    id: "transporte",
    label: "Transporte",
    icon: Truck,
    theme: "border-amber-200 bg-amber-50 text-amber-700",
    description: "Uso recorrente de transporte com cobrança mensal.",
  },
];

const FREQUENCIES = [
  { id: "1x_semana", label: "1x por semana" },
  { id: "2x_semana", label: "2x por semana" },
  { id: "3x_semana", label: "3x por semana" },
  { id: "4x_semana", label: "4x por semana" },
  { id: "5x_semana", label: "5x por semana" },
  { id: "diario", label: "Diário (seg. a sex.)" },
  { id: "quinzenal", label: "Quinzenal" },
  { id: "mensal", label: "Mensal" },
];

const DAY_CARE_PACKAGE_FREQUENCIES = [
  { id: "1x_semana", label: "1x por semana" },
  { id: "2x_semana", label: "2x por semana" },
  { id: "3x_semana", label: "3x por semana" },
  { id: "4x_semana", label: "4x por semana" },
  { id: "5x_semana", label: "5x por semana" },
];

const DAY_CARE_PACKAGE_DOG_COUNTS = [
  { id: "1_cao", label: "1 cão", quantity: 1 },
  { id: "2_caes", label: "2 cães", quantity: 2 },
  { id: "3_caes", label: "3 cães", quantity: 3 },
  { id: "4_caes", label: "4 cães", quantity: 4 },
];

const WEEKDAYS = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sáb" },
];

const DEFAULT_FORM_DATA = {
  client_id: "",
  dog_ids: [""],
  package_dog_count: 1,
  service: "day_care",
  frequency: "",
  weekdays: [],
  start_date: "",
  monthly_value: "",
  first_month_dates: [],
};

function getLinkedDogIds(record) {
  return RELATION_SLOTS.map((slot) => record?.[`dog_id_${slot}`]).filter(Boolean);
}

function normalizeWeekdays(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return normalizeWeekdays(JSON.parse(value));
    } catch (error) {
      return [];
    }
  }

  return [];
}

function normalizeDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const nextDate = new Date(date);
  nextDate.setHours(12, 0, 0, 0);
  return nextDate;
}

function parseDateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return normalizeDate(new Date(Number(year), Number(month) - 1, Number(day)));
}

function formatDateOnly(date) {
  const parsed = normalizeDate(date);
  return parsed ?format(parsed, "yyyy-MM-dd") : null;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return parseMetadata(JSON.parse(value));
    } catch (error) {
      return {};
    }
  }

  return typeof value === "object" ?value : {};
}

function getFrequenciesForService(serviceId) {
  return serviceId === "day_care" ?DAY_CARE_PACKAGE_FREQUENCIES : FREQUENCIES;
}

function getMonthlyValue(plan) {
  return Number(plan?.monthly_value ?? plan?.valor_mensal ?? 0) || 0;
}

function getPlanClientId(plan) {
  return plan?.client_id || plan?.carteira_id || "";
}

function getPlanStartDate(plan) {
  const metadata = parseMetadata(plan?.metadata_gerencial);
  return metadata.start_date || null;
}

function normalizeDogIdList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.filter(Boolean))];
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return normalizeDogIdList(JSON.parse(value));
    } catch (error) {
      return [];
    }
  }

  return [];
}

function getPlanPackageMeta(plan) {
  const metadata = parseMetadata(plan?.metadata_gerencial);
  const dogIds = normalizeDogIdList(metadata.package_dog_ids).length > 0
    ? normalizeDogIdList(metadata.package_dog_ids)
    : [plan?.dog_id].filter(Boolean);

  return {
    metadata,
    dogIds,
    packageDogCount: Number(metadata.package_dog_count || dogIds.length || 1) || 1,
    packageGroupKey: metadata.package_group_key || plan?.id,
    firstMonthDates: normalizeFirstMonthDateList(metadata.start_date, metadata.first_month_real_dates),
  };
}

function createPackageGroupKey() {
  return `package_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getMonthKey(value) {
  const date = normalizeDate(value instanceof Date ? value : parseDateOnly(value));
  return date ? format(date, "yyyy-MM") : "";
}

function formatMonthLabel(value) {
  const date = normalizeDate(value instanceof Date ? value : parseDateOnly(value));
  if (!date) return "-";
  const label = format(date, "MMMM yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildRecurringBillingSchedule(plan, monthsForward = 8) {
  const metadata = parseMetadata(plan?.metadata_gerencial);
  const startDate = parseDateOnly(metadata.start_date) || parseDateOnly(plan?.created_date?.slice?.(0, 10));
  const dueDay = Number.parseInt(String(plan?.due_day || plan?.renovacao_dia || ""), 10);
  if (!startDate || !Number.isFinite(dueDay)) return [];

  const monthlyValue = getMonthlyValue(plan);
  const firstCycle = metadata.first_cycle || {};
  const firstDueDate = parseDateOnly(firstCycle.due_date) || buildDueDateForMonth(startDate, dueDay);
  const entries = [];
  let cursor = startOfMonth(startDate);
  const endCursor = startOfMonth(addMonths(new Date(), monthsForward));

  while (cursor.getTime() <= endCursor.getTime()) {
    const monthKey = format(cursor, "yyyy-MM");
    const isFirstMonth = firstDueDate ? getMonthKey(firstDueDate) === monthKey : false;
    const dueDate = isFirstMonth ? firstDueDate : buildDueDateForMonth(cursor, dueDay);
    if (dueDate) {
      entries.push({
        monthKey,
        dueDate,
        dueDateKey: formatDateOnly(dueDate),
        amount: isFirstMonth ? Number(firstCycle.per_dog_value || 0) || monthlyValue : monthlyValue,
        isFirstMonth,
      });
    }
    cursor = startOfMonth(addMonths(cursor, 1));
  }

  return entries;
}

function getPaymentTone(entry) {
  if (!entry) return "border-gray-200 bg-gray-50 text-gray-700";
  if (entry.status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (entry.status === "due_today") return "border-amber-200 bg-amber-50 text-amber-900";
  if (entry.status === "overdue") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function getServiceMeta(serviceId) {
  return SERVICE_OPTIONS.find((item) => item.id === serviceId) || SERVICE_OPTIONS[0];
}

function getFrequencyLabel(frequencyId) {
  return FREQUENCIES.find((item) => item.id === frequencyId)?.label || frequencyId || "-";
}

function buildDayCarePackageKey(frequencyId, dogCountId) {
  return `day_care_pacote:${frequencyId}:${dogCountId}`;
}

function getExpectedWeekdayCount(frequencyId) {
  switch (frequencyId) {
    case "1x_semana":
      return 1;
    case "2x_semana":
      return 2;
    case "3x_semana":
      return 3;
    case "4x_semana":
      return 4;
    case "5x_semana":
    case "diario":
      return 5;
    case "quinzenal":
    case "mensal":
      return 1;
    default:
      return 0;
  }
}

function getDayCareCycleSlots(frequencyId) {
  switch (frequencyId) {
    case "1x_semana":
      return 4;
    case "2x_semana":
      return 8;
    case "3x_semana":
      return 12;
    case "4x_semana":
      return 16;
    case "5x_semana":
      return 20;
    default:
      return 0;
  }
}

function ensureDogArraySize(dogIds, size) {
  return Array.from({ length: size }, (_, index) => dogIds[index] || "");
}

function getAllowedWeekdays(serviceId) {
  if (serviceId === "day_care") {
    return WEEKDAYS.filter((item) => item.id >= 1 && item.id <= 5);
  }

  return WEEKDAYS;
}

function getDefaultWeekdays(frequencyId, serviceId) {
  const allowedWeekdays = getAllowedWeekdays(serviceId).map((item) => item.id);
  if (frequencyId === "diario" && serviceId === "day_care") {
    return [1, 2, 3, 4, 5];
  }

  const expectedCount = getExpectedWeekdayCount(frequencyId);
  return expectedCount > 0 ?allowedWeekdays.slice(0, expectedCount) : [];
}

function getCoverageSummary(client, selectedDogIds) {
  if (!client || selectedDogIds.length === 0) {
    return { linkedCount: 0, missingDogIds: [], isFullyLinked: false };
  }

  const linkedDogIds = getLinkedDogIds(client);
  const missingDogIds = selectedDogIds.filter((dogId) => !linkedDogIds.includes(dogId));

  return {
    linkedCount: selectedDogIds.length - missingDogIds.length,
    missingDogIds,
    linkedDogIds,
    isFullyLinked: missingDogIds.length === 0,
  };
}

function buildDueDateForMonth(referenceDate, dueDay) {
  const parsedReference = normalizeDate(referenceDate);
  const parsedDueDay = Number.parseInt(String(dueDay || ""), 10);
  if (!parsedReference || !Number.isFinite(parsedDueDay)) return null;

  const year = parsedReference.getFullYear();
  const month = parsedReference.getMonth();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  return normalizeDate(new Date(year, month, Math.min(Math.max(parsedDueDay, 1), lastDayOfMonth)));
}

function getNextBusinessDay(referenceDate) {
  let nextDate = normalizeDate(referenceDate);
  if (!nextDate) return null;

  do {
    nextDate = normalizeDate(addDays(nextDate, 1));
  } while (nextDate && isWeekend(nextDate));

  return nextDate;
}

function normalizeDateKeyList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((item) => formatDateOnly(parseDateOnly(item)))
    .filter(Boolean))]
    .sort();
}

function normalizeFirstMonthDateList(startDateValue, values) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate) return [];

  const month = startDate.getMonth();
  const year = startDate.getFullYear();

  return normalizeDateKeyList(values).filter((value) => {
    const parsed = parseDateOnly(value);
    return parsed && parsed.getMonth() === month && parsed.getFullYear() === year;
  });
}

function buildProjectedFirstMonthDates(startDateValue, weekdays) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate || weekdays.length === 0) return [];

  const lastDay = endOfMonth(startDate);
  const projectedDates = [];
  for (let cursor = addDays(startDate, 1); cursor <= lastDay; cursor = addDays(cursor, 1)) {
    if (weekdays.includes(getDay(cursor))) {
      projectedDates.push(formatDateOnly(cursor));
    }
  }

  return normalizeDateKeyList(projectedDates);
}

function buildFirstMonthRealDates(startDateValue, weekdays) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate) return [];

  return normalizeFirstMonthDateList(startDateValue, [
    formatDateOnly(startDate),
    ...buildProjectedFirstMonthDates(startDateValue, weekdays),
  ]);
}

function buildNextFirstMonthDate(startDateValue, values) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate) return "";

  const currentDates = normalizeFirstMonthDateList(startDateValue, values);
  const lastDay = endOfMonth(startDate);
  let cursor = currentDates.length > 0
    ? parseDateOnly(currentDates[currentDates.length - 1])
    : startDate;

  while (cursor && cursor < lastDay) {
    cursor = addDays(cursor, 1);
    const dateKey = formatDateOnly(cursor);
    if (!currentDates.includes(dateKey)) {
      return dateKey;
    }
  }

  return formatDateOnly(lastDay);
}

function buildFirstBillingPreview({
  startDateValue,
  dueDay,
  service,
  frequency,
  weekdays,
  firstMonthDates,
  packageDogCount,
  monthlyValuePerDog,
  packageMonthlyValue,
}) {
  const startDate = parseDateOnly(startDateValue);
  const parsedDueDay = Number.parseInt(String(dueDay || ""), 10);

  if (!startDate || !Number.isFinite(parsedDueDay)) return null;

  const dueDateThisMonth = buildDueDateForMonth(startDate, parsedDueDay);
  const firstDueDate = dueDateThisMonth && startDate.getTime() <= dueDateThisMonth.getTime()
    ?dueDateThisMonth
    : getNextBusinessDay(startDate);

  if (!firstDueDate) return null;

  const nextRecurringDueDate = buildDueDateForMonth(addMonths(firstDueDate, 1), parsedDueDay);
  const basePerDogValue = Number(monthlyValuePerDog || 0) || 0;
  const basePackageValue = Number(packageMonthlyValue || basePerDogValue * packageDogCount || 0) || 0;

  if (service !== "day_care") {
    return {
      firstDueDate,
      nextRecurringDueDate,
      plannedUses: 0,
      chargedUses: 0,
      cycleSlots: 0,
      isFullPackage: true,
      firstPackageValue: basePackageValue,
      firstPerDogValue: basePerDogValue,
    };
  }

  const cycleSlots = getDayCareCycleSlots(frequency);
  if (!cycleSlots || weekdays.length === 0) {
    return {
      firstDueDate,
      nextRecurringDueDate,
      plannedUses: 0,
      chargedUses: 0,
      cycleSlots,
      isFullPackage: false,
      firstPackageValue: 0,
      firstPerDogValue: 0,
    };
  }

  const projectedDates = buildProjectedFirstMonthDates(startDateValue, weekdays);
  const realDates = normalizeFirstMonthDateList(startDateValue, firstMonthDates).length > 0
    ? normalizeFirstMonthDateList(startDateValue, firstMonthDates)
    : buildFirstMonthRealDates(startDateValue, weekdays);
  const plannedUses = realDates.length;
  const chargedUses = Math.min(plannedUses, cycleSlots);
  const factor = cycleSlots > 0 ?chargedUses / cycleSlots : 0;
  const firstPackageValue = chargedUses > 0 ?basePackageValue * factor : 0;
  const firstPerDogValue = packageDogCount > 0 ?firstPackageValue / packageDogCount : firstPackageValue;

  return {
    firstDueDate,
    nextRecurringDueDate,
    plannedUses,
    chargedUses,
    cycleSlots,
    isFullPackage: plannedUses >= cycleSlots,
    projectedDates,
    realDates,
    firstPackageValue,
    firstPerDogValue,
  };
}

function getLegacyNextBillingDate(plan) {
  const parsedDueDay = Number.parseInt(String(plan?.due_day || plan?.renovacao_dia || ""), 10);
  if (!Number.isFinite(parsedDueDay)) return null;

  const today = normalizeDate(new Date());
  const thisMonthDueDate = buildDueDateForMonth(today, parsedDueDay);
  if (!thisMonthDueDate) return null;

  return today.getTime() <= thisMonthDueDate.getTime()
    ?thisMonthDueDate
    : buildDueDateForMonth(addMonths(today, 1), parsedDueDay);
}

function getPlanGroupPayload({
  clientId,
  clientName,
  dogId,
  service,
  frequency,
  weekdays,
  monthlyValue,
  dueDay,
  nextBillingDate,
  metadataGerencial,
}) {
  return {
    client_id: clientId,
    carteira_id: clientId,
    client_name: clientName,
    dog_id: dogId,
    service,
    frequency,
    weekdays,
    monthly_value: monthlyValue,
    due_day: dueDay,
    renovacao_dia: dueDay,
    next_billing_date: nextBillingDate || null,
    metadata_gerencial: metadataGerencial || {},
    cliente_fixo: true,
  };
}

export default function PlanosConfig() {
  const [plans, setPlans] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [paymentsItem, setPaymentsItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteDate, setDeleteDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [useSuggestedValue, setUseSuggestedValue] = useState(true);
  const isSilentSyncRunningRef = useRef(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData({ skipSilentSync = false } = {}) {
    setIsLoading(true);
    try {
      const safeLoad = async (label, loader, fallback) => {
        try {
          return await loader();
        } catch (error) {
          console.error(`Erro ao carregar ${label}:`, error);
          return fallback;
        }
      };

      const [plansData, dogsData, carteirasData, tabelaPrecosData, appointmentsData, receivablesData, me] = await Promise.all([
        safeLoad("planos recorrentes", () => PlanConfig.list("-created_date", 500), []),
        safeLoad("cães", () => Dog.list("-created_date", 500), []),
        safeLoad("responsáveis financeiros", () => Carteira.list("-created_date", 500), []),
        safeLoad("tabela de preços", () => TabelaPrecos.list("-created_date", 1000), []),
        safeLoad("agendamentos automáticos", () => (Appointment.listAll ? Appointment.listAll("-created_date", 1000, 10000) : Appointment.list("-created_date", 5000)), []),
        safeLoad("cobranças recorrentes", () => (ContaReceber.listAll ? ContaReceber.listAll("-created_date", 1000, 10000) : ContaReceber.list("-created_date", 5000)), []),
        User.me().catch(() => null),
      ]);

      const empresaId = me?.empresa_id || null;
      const activePlans = plansData || [];
      const activeAppointments = appointmentsData || [];
      const activeReceivables = receivablesData || [];

      if (!skipSilentSync && activePlans.length > 0 && !isSilentSyncRunningRef.current) {
        isSilentSyncRunningRef.current = true;
        try {
          const changed = await syncPlansSilently(activePlans, activeAppointments, activeReceivables);
          if (changed) {
            await loadData({ skipSilentSync: true });
            return;
          }
        } catch (error) {
          console.error("Erro ao sincronizar planos automaticamente:", error);
        } finally {
          isSilentSyncRunningRef.current = false;
        }
      }

      setPlans(activePlans);
      setDogs((dogsData || []).filter((item) => item.ativo !== false));
      setCarteiras((carteirasData || []).filter((item) => item.ativo !== false));
      setAppointments(activeAppointments);
      setReceivables(activeReceivables);
      setPricingRows(
        (tabelaPrecosData || []).filter(
          (item) => item.ativo !== false && item.tipo === DAY_CARE_PACKAGE_TYPE && (!item.empresa_id || item.empresa_id === empresaId),
        ),
      );
    } catch (error) {
      console.error("Erro ao carregar planos recorrentes:", error);
    }
    setIsLoading(false);
  }

  function resetForm() {
    setFormData(DEFAULT_FORM_DATA);
    setEditingItem(null);
    setUseSuggestedValue(true);
  }

  function openEditModal(item) {
    const representativePlan = item?.representativePlan || item;
    const packageMeta = getPlanPackageMeta(representativePlan);
    const existingStartDate = packageMeta.metadata.start_date || format(representativePlan.created_date ?parseISO(representativePlan.created_date) : new Date(), "yyyy-MM-dd");
    const existingWeekdays = normalizeWeekdays(representativePlan.weekdays);
    const dogIds = item?.dogIds?.length > 0 ? item.dogIds : packageMeta.dogIds;
    const packageDogCount = item?.packageDogCount || packageMeta.packageDogCount || dogIds.length || 1;

    setEditingItem({
      ...representativePlan,
      planIds: item?.planIds || [representativePlan.id],
      dogIds,
      packageDogCount,
      packageGroupKey: item?.packageGroupKey || packageMeta.packageGroupKey,
      memberPlans: item?.memberPlans || [representativePlan],
    });
    setUseSuggestedValue(false);
    setFormData({
      client_id: getPlanClientId(representativePlan),
      dog_ids: ensureDogArraySize(dogIds, packageDogCount),
      package_dog_count: packageDogCount,
      service: representativePlan.service || representativePlan.tipo_plano || "day_care",
      frequency: representativePlan.frequency || "",
      weekdays: existingWeekdays,
      start_date: existingStartDate,
      monthly_value: getMonthlyValue(representativePlan) ?String(getMonthlyValue(representativePlan)) : "",
      first_month_dates: normalizeFirstMonthDateList(existingStartDate, packageMeta.metadata.first_month_real_dates).length > 0
        ? normalizeFirstMonthDateList(existingStartDate, packageMeta.metadata.first_month_real_dates)
        : buildFirstMonthRealDates(existingStartDate, existingWeekdays),
    });
    setShowModal(true);
  }

  const dogsById = useMemo(
    () => Object.fromEntries(dogs.map((dog) => [dog.id, dog])),
    [dogs],
  );

  const clientsById = useMemo(
    () => Object.fromEntries(carteiras.map((client) => [client.id, client])),
    [carteiras],
  );

  const packageDogCount = formData.service === "day_care" ?Number(formData.package_dog_count || 1) : 1;
  const currentDogIds = ensureDogArraySize(formData.dog_ids || [], packageDogCount);
  const selectedDogIds = currentDogIds.filter(Boolean);
  const selectedDogs = selectedDogIds.map((dogId) => dogsById[dogId]).filter(Boolean);
  const selectedClient = clientsById[formData.client_id] || null;
  const allowedWeekdays = getAllowedWeekdays(formData.service);
  const availableFrequencies = getFrequenciesForService(formData.service);
  const allowedWeekdayIds = allowedWeekdays.map((item) => item.id);
  const normalizedWeekdays = normalizeWeekdays(formData.weekdays).filter((item) => allowedWeekdayIds.includes(item));
  const expectedWeekdayCount = getExpectedWeekdayCount(formData.frequency);
  const weekdaysLocked = formData.service === "day_care" && formData.frequency === "diario";
  const projectedFirstMonthDates = useMemo(
    () => formData.service === "day_care" ? buildProjectedFirstMonthDates(formData.start_date, normalizedWeekdays) : [],
    [formData.service, formData.start_date, normalizedWeekdays],
  );
  const realFirstMonthDates = useMemo(
    () => formData.service === "day_care"
      ? normalizeFirstMonthDateList(formData.start_date, formData.first_month_dates)
      : [],
    [formData.first_month_dates, formData.service, formData.start_date],
  );

  const candidateClients = useMemo(() => {
    if (selectedDogIds.length === 0) return [];

    return carteiras
      .filter((client) => getLinkedDogIds(client).some((dogId) => selectedDogIds.includes(dogId)))
      .sort((left, right) => {
        const leftCoverage = getCoverageSummary(left, selectedDogIds);
        const rightCoverage = getCoverageSummary(right, selectedDogIds);
        if (leftCoverage.isFullyLinked !== rightCoverage.isFullyLinked) {
          return leftCoverage.isFullyLinked ?-1 : 1;
        }
        return String(left.nome_razao_social || "").localeCompare(String(right.nome_razao_social || ""), "pt-BR");
      });
  }, [carteiras, selectedDogIds]);

  const selectedClientCoverage = useMemo(
    () => getCoverageSummary(selectedClient, selectedDogIds),
    [selectedClient, selectedDogIds],
  );

  useEffect(() => {
    if (!formData.client_id) return;
    if (selectedDogIds.length === 0) return;
    if (candidateClients.some((client) => client.id === formData.client_id)) return;

    setFormData((current) => ({
      ...current,
      client_id: "",
    }));
  }, [candidateClients, formData.client_id, selectedDogIds.length]);

  useEffect(() => {
    if (!formData.frequency) return;
    if (availableFrequencies.some((option) => option.id === formData.frequency)) return;

    setFormData((current) => ({
      ...current,
      frequency: "",
      weekdays: [],
      first_month_dates: current.service === "day_care"
        ? buildFirstMonthRealDates(current.start_date, [])
        : [],
    }));
  }, [availableFrequencies, formData.frequency]);

  const weekdayValidationMessage = useMemo(() => {
    if (!formData.frequency) return "";
    if (!expectedWeekdayCount) return "";
    if (normalizedWeekdays.length === expectedWeekdayCount) return "";
    return `Selecione ${expectedWeekdayCount} ${expectedWeekdayCount === 1 ?"dia preferencial" : "dias preferenciais"} para ${getFrequencyLabel(formData.frequency).toLowerCase()}.`;
  }, [expectedWeekdayCount, formData.frequency, normalizedWeekdays.length]);

  const dayCareSuggestion = useMemo(() => {
    if (formData.service !== "day_care") return null;
    if (!DAY_CARE_PACKAGE_FREQUENCIES.some((item) => item.id === formData.frequency)) return null;

    const packageBucket = DAY_CARE_PACKAGE_DOG_COUNTS.find((item) => item.quantity === packageDogCount) || DAY_CARE_PACKAGE_DOG_COUNTS[0];
    const row = pricingRows.find((item) => item.config_key === buildDayCarePackageKey(formData.frequency, packageBucket.id)) || null;
    const totalValue = Number(row?.valor || 0) || 0;
    const perDogValue = packageDogCount > 0 ?totalValue / packageDogCount : totalValue;

    return {
      row,
      packageBucket,
      totalValue,
      perDogValue,
      frequencyLabel: getFrequencyLabel(formData.frequency),
    };
  }, [formData.frequency, formData.service, packageDogCount, pricingRows]);

  const hasDayCareSuggestedValue = Boolean(dayCareSuggestion?.row);
  const isDayCareUsingTableValue = formData.service === "day_care" && hasDayCareSuggestedValue && useSuggestedValue;
  const isCustomMonthlyValue = formData.service !== "day_care" || !hasDayCareSuggestedValue || !useSuggestedValue;

  const monthlyValuePerDog = Number.parseFloat(String(formData.monthly_value).replace(",", ".")) || 0;
  const totalPackageValue = monthlyValuePerDog * packageDogCount;
  const dueDay = Number.parseInt(String(selectedClient?.vencimento_planos || ""), 10);

  const firstBillingPreview = useMemo(
    () => buildFirstBillingPreview({
      startDateValue: formData.start_date,
      dueDay,
      service: formData.service,
      frequency: formData.frequency,
      weekdays: normalizedWeekdays,
      firstMonthDates: realFirstMonthDates,
      packageDogCount,
      monthlyValuePerDog,
      packageMonthlyValue: totalPackageValue,
    }),
    [
      dueDay,
      formData.frequency,
      realFirstMonthDates,
      formData.service,
      formData.start_date,
      monthlyValuePerDog,
      normalizedWeekdays,
      packageDogCount,
      totalPackageValue,
    ],
  );

  useEffect(() => {
    if (!useSuggestedValue) return;
    if (!dayCareSuggestion?.row) return;
    const nextValue = dayCareSuggestion.perDogValue.toFixed(2);
    setFormData((current) => (
      current.monthly_value === nextValue
        ?current
        : { ...current, monthly_value: nextValue }
    ));
  }, [dayCareSuggestion, useSuggestedValue]);

  useEffect(() => {
    if (normalizedWeekdays.length === formData.weekdays.length) return;
    setFormData((current) => ({
      ...current,
      weekdays: normalizedWeekdays,
    }));
  }, [formData.weekdays.length, normalizedWeekdays]);

  function handleServiceChange(serviceId) {
    const nextFrequencyOptions = getFrequenciesForService(serviceId);
    setFormData((current) => {
      const nextWeekdays = normalizeWeekdays(current.weekdays).filter((item) =>
        getAllowedWeekdays(serviceId).some((weekday) => weekday.id === item),
      );

      return {
        ...current,
        service: serviceId,
        package_dog_count: serviceId === "day_care" ?current.package_dog_count : 1,
        dog_ids: ensureDogArraySize(current.dog_ids || [], serviceId === "day_care" ?Number(current.package_dog_count || 1) : 1),
        frequency: nextFrequencyOptions.some((item) => item.id === current.frequency) ?current.frequency : "",
        weekdays: nextWeekdays,
        first_month_dates: serviceId === "day_care"
          ? buildFirstMonthRealDates(current.start_date, nextWeekdays)
          : [],
      };
    });
    setUseSuggestedValue(serviceId === "day_care");
  }

  function handlePackageDogCountChange(value) {
    const nextCount = Number(value || 1);
    setFormData((current) => ({
      ...current,
      package_dog_count: nextCount,
      dog_ids: ensureDogArraySize(current.dog_ids || [], nextCount),
      client_id: "",
    }));
    setUseSuggestedValue(true);
  }

  function updateDogSelection(index, dogId) {
    setFormData((current) => {
      const nextDogIds = ensureDogArraySize(current.dog_ids || [], packageDogCount);
      if (dogId && nextDogIds.some((currentDogId, currentIndex) => currentIndex !== index && currentDogId === dogId)) {
        return current;
      }
      nextDogIds[index] = dogId;
      return {
        ...current,
        dog_ids: nextDogIds,
        client_id: current.client_id && candidateClients.some((client) => client.id === current.client_id)
          ?current.client_id
          : "",
      };
    });
  }

  function handleClientChange(clientId) {
    setFormData((current) => ({
      ...current,
      client_id: clientId,
    }));
    setUseSuggestedValue(true);
  }

  function handleFrequencyChange(frequencyId) {
    setFormData((current) => {
      const defaultWeekdays = getDefaultWeekdays(frequencyId, current.service);
      const nextExpectedCount = getExpectedWeekdayCount(frequencyId);
      let nextWeekdays = normalizeWeekdays(current.weekdays).filter((item) => getAllowedWeekdays(current.service).some((weekday) => weekday.id === item));

      if (frequencyId === "diario" && current.service === "day_care") {
        nextWeekdays = [1, 2, 3, 4, 5];
      } else if (nextExpectedCount > 0) {
        if (nextWeekdays.length === 0) {
          nextWeekdays = defaultWeekdays;
        } else if (nextWeekdays.length > nextExpectedCount) {
          nextWeekdays = nextWeekdays.slice(0, nextExpectedCount);
        }
      }

      return {
        ...current,
        frequency: frequencyId,
        weekdays: nextWeekdays,
        first_month_dates: current.service === "day_care"
          ? buildFirstMonthRealDates(current.start_date, nextWeekdays)
          : [],
      };
    });
    setUseSuggestedValue(formData.service === "day_care");
  }

  function toggleWeekday(weekdayId) {
    if (weekdaysLocked) return;
    if (!allowedWeekdayIds.includes(weekdayId)) return;

    setFormData((current) => {
      const currentWeekdays = normalizeWeekdays(current.weekdays).filter((item) => allowedWeekdayIds.includes(item));
      const exists = currentWeekdays.includes(weekdayId);
      let nextWeekdays = exists
        ?currentWeekdays.filter((item) => item !== weekdayId)
        : [...currentWeekdays, weekdayId].sort((left, right) => left - right);

      if (expectedWeekdayCount > 0 && nextWeekdays.length > expectedWeekdayCount) {
        nextWeekdays = nextWeekdays.slice(nextWeekdays.length - expectedWeekdayCount);
      }

      return {
        ...current,
        weekdays: nextWeekdays,
        first_month_dates: current.service === "day_care"
          ? buildFirstMonthRealDates(current.start_date, nextWeekdays)
          : [],
      };
    });
  }

  function handleMonthlyValueChange(value) {
    setUseSuggestedValue(false);
    setFormData((current) => ({
      ...current,
      monthly_value: value,
    }));
  }

  function handleCustomValueToggle(enabled) {
    if (formData.service !== "day_care") return;
    if (!hasDayCareSuggestedValue) {
      setUseSuggestedValue(false);
      return;
    }

    if (enabled) {
      setUseSuggestedValue(false);
      return;
    }

    applySuggestedValue();
  }

  function applySuggestedValue() {
    if (!dayCareSuggestion?.row) return;
    setUseSuggestedValue(true);
    setFormData((current) => ({
      ...current,
      monthly_value: dayCareSuggestion.perDogValue.toFixed(2),
    }));
  }

  function handleStartDateChange(value) {
    setFormData((current) => ({
      ...current,
      start_date: value,
      first_month_dates: current.service === "day_care"
        ? buildFirstMonthRealDates(value, normalizeWeekdays(current.weekdays).filter((item) => getAllowedWeekdays(current.service).some((weekday) => weekday.id === item)))
        : [],
    }));
  }

  function updateFirstMonthDate(index, value) {
    setFormData((current) => {
      const nextDates = [...normalizeFirstMonthDateList(current.start_date, current.first_month_dates)];
      nextDates[index] = value;
      return {
        ...current,
        first_month_dates: normalizeFirstMonthDateList(current.start_date, nextDates),
      };
    });
  }

  function addFirstMonthDate() {
    setFormData((current) => ({
      ...current,
      first_month_dates: normalizeFirstMonthDateList(current.start_date, [
        ...current.first_month_dates,
        buildNextFirstMonthDate(current.start_date, current.first_month_dates),
      ]),
    }));
  }

  function removeFirstMonthDate(index) {
    setFormData((current) => ({
      ...current,
      first_month_dates: normalizeFirstMonthDateList(
        current.start_date,
        current.first_month_dates.filter((_, itemIndex) => itemIndex !== index),
      ),
    }));
  }

  async function ensureFinancialLink(selectedClientRecord, dogsToCheck) {
    const coverage = getCoverageSummary(selectedClientRecord, dogsToCheck);
    if (coverage.missingDogIds.length === 0) return true;

    const missingDogNames = coverage.missingDogIds.map((dogId) => dogsById[dogId]?.nome || "Cão").join(", ");
    const availableSlots = RELATION_SLOTS.length - coverage.linkedDogIds.length;

    if (coverage.missingDogIds.length > availableSlots) {
      alert(`O responsável financeiro selecionado não tem espaço suficiente para vincular os cães faltantes (${missingDogNames}).`);
      return false;
    }

    const shouldLink = confirm(
      `O responsável financeiro ${selectedClientRecord.nome_razao_social} ainda não está vinculado a ${missingDogNames}. Deseja criar esse vínculo agora para continuar?`,
    );

    if (!shouldLink) {
      alert("Escolha um responsável financeiro que já esteja vinculado a todos os cães envolvidos ou confirme a vinculação.");
      return false;
    }

    const nextDogIds = [...new Set([...coverage.linkedDogIds, ...coverage.missingDogIds])].slice(0, RELATION_SLOTS.length);
    const relationPayload = RELATION_SLOTS.reduce((accumulator, slot, index) => {
      accumulator[`dog_id_${slot}`] = nextDogIds[index] || null;
      return accumulator;
    }, {});

    await Carteira.update(selectedClientRecord.id, relationPayload);
    return true;
  }

  async function generateAppointments(plan, existingAppointmentKeys = null, weeksAhead = 4) {
    const weekdays = normalizeWeekdays(plan.weekdays);
    if (!weekdays.length) return 0;

    const today = normalizeDate(new Date());
    const metadata = parseMetadata(plan.metadata_gerencial);
    const planStartDate = parseDateOnly(metadata.start_date);
    const generationBaseDate = planStartDate && planStartDate.getTime() > today.getTime() ?planStartDate : today;
    const firstMonthRealDates = normalizeFirstMonthDateList(
      metadata.start_date,
      metadata.first_month_real_dates,
    ).length > 0
      ? normalizeFirstMonthDateList(metadata.start_date, metadata.first_month_real_dates)
      : buildFirstMonthRealDates(metadata.start_date, weekdays);
    const firstMonthEnd = planStartDate ? endOfMonth(planStartDate) : null;
    const appointmentDates = new Set();

    for (const dateKey of firstMonthRealDates) {
      const parsed = parseDateOnly(dateKey);
      if (parsed && parsed >= generationBaseDate) {
        appointmentDates.add(dateKey);
      }
    }

    for (let week = 0; week < weeksAhead; week += 1) {
      for (const weekday of weekdays) {
        let targetDate = addWeeks(generationBaseDate, week);
        const currentWeekday = getDay(targetDate);

        if (currentWeekday !== weekday) {
          targetDate = nextDay(targetDate, weekday);
        }

        if (targetDate >= generationBaseDate) {
          if (
            planStartDate
            && firstMonthEnd
            && targetDate >= planStartDate
            && targetDate <= firstMonthEnd
          ) {
            continue;
          }

          const dateKey = format(targetDate, "yyyy-MM-dd");
          appointmentDates.add(dateKey);
        }
      }
    }

    const allAppointmentDates = [...appointmentDates].sort();
    const valuePerUse = getMonthlyValue(plan) / Math.max(weekdays.length * 4, 1);

    for (const dateKey of allAppointmentDates) {
      const appointment = {
        empresa_id: plan.empresa_id || null,
        dog_id: plan.dog_id,
        cliente_id: plan.client_id || plan.carteira_id || null,
        service_type: plan.service,
        status: "agendado",
        data_referencia: dateKey,
        data_hora_entrada: `${dateKey}T08:00:00`,
        data_hora_saida: `${dateKey}T18:00:00`,
        hora_entrada: "08:00",
        hora_saida: "18:00",
        observacoes: "",
        valor_previsto: valuePerUse,
        charge_type: "pacote",
        source_type: "plano_recorrente",
        metadata: {
          plan_id: plan.id,
          client_name: plan.client_name || "",
          package_group_key: parseMetadata(plan.metadata_gerencial).package_group_key || plan.id,
        },
        source_key: `plano_recorrente|${plan.id}|${plan.service}|${dateKey}`,
      };
      if (existingAppointmentKeys?.has(appointment.source_key)) {
        continue;
      }

      const existingAppointments = existingAppointmentKeys ? [] : await Appointment.filter({ source_key: appointment.source_key });
      if (existingAppointments.length === 0) {
        await Appointment.create(appointment);
        existingAppointmentKeys?.add(appointment.source_key);
      }
    }

    return allAppointmentDates.length;
  }

  async function ensureBillingForPlan(plan, existingReceivables = []) {
    const metadata = parseMetadata(plan.metadata_gerencial);
    const schedule = buildRecurringBillingSchedule(plan);
    if (schedule.length === 0) return false;

    let changed = false;
    const packageGroupKey = metadata.package_group_key || plan.id;

    for (const entry of schedule) {
      if (entry.amount <= 0) continue;

      const sourceKey = `plano_recorrente|${plan.id}|${entry.dueDateKey}`;
      const existingCharge = existingReceivables.find((item) => item.source_key === sourceKey);
      const payload = {
        cliente_id: plan.client_id || plan.carteira_id || null,
        dog_id: plan.dog_id || null,
        descricao: `Mensalidade ${getServiceMeta(plan.service).label} - ${plan.client_name}`,
        servico: plan.service,
        valor: Number(entry.amount.toFixed(2)),
        vencimento: entry.dueDateKey,
        status: existingCharge?.status || "pendente",
        origem: "plano_recorrente",
        tipo_agendamento: "recorrente",
        tipo_cobranca: "pacote",
        data_prestacao: entry.dueDateKey,
        source_key: sourceKey,
        metadata: {
          ...parseMetadata(existingCharge?.metadata),
          plan_id: plan.id,
          client_name: plan.client_name,
          due_day: plan.due_day,
          first_cycle: entry.isFirstMonth,
          month_key: entry.monthKey,
          package_group_key: packageGroupKey,
        },
      };

      if (!existingCharge) {
        await ContaReceber.create(payload);
        existingReceivables.push({ ...payload });
        changed = true;
        continue;
      }

      const hasBeenPaid = Boolean(existingCharge.data_recebimento);
      const shouldUpdateValue = !hasBeenPaid && Math.abs((Number(existingCharge.valor) || 0) - payload.valor) >= 0.01;
      const shouldUpdateMetadata = parseMetadata(existingCharge.metadata).package_group_key !== packageGroupKey;

      if (shouldUpdateValue || shouldUpdateMetadata) {
        await ContaReceber.update(existingCharge.id, {
          valor: shouldUpdateValue ? payload.valor : existingCharge.valor,
          metadata: payload.metadata,
        });
        Object.assign(existingCharge, {
          valor: shouldUpdateValue ? payload.valor : existingCharge.valor,
          metadata: payload.metadata,
        });
        changed = true;
      }
    }

    return changed;
  }

  async function syncPlansSilently(plansToSync, existingAppointments = [], existingReceivables = []) {
    let changed = false;
    const appointmentKeys = new Set(existingAppointments.map((item) => item.source_key).filter(Boolean));

    for (const plan of plansToSync) {
      if (await generateAppointments(plan, appointmentKeys)) {
        changed = true;
      }
      if (await ensureBillingForPlan(plan, existingReceivables)) {
        changed = true;
      }
    }
    return changed;
  }

  async function handleSave() {
    const uniqueDogIds = [...new Set(selectedDogIds)];

    if (!formData.service || !formData.frequency) {
      alert("Selecione serviço e frequência do plano.");
      return;
    }

    if (uniqueDogIds.length !== packageDogCount) {
      alert(`Selecione ${packageDogCount} ${packageDogCount === 1 ?"cão" : "cães"} para este pacote.`);
      return;
    }

    if (uniqueDogIds.length !== selectedDogIds.length) {
      alert("Os cães do pacote precisam ser diferentes entre si.");
      return;
    }

    if (!formData.client_id || !selectedClient) {
      alert("Selecione um responsável financeiro vinculado a pelo menos um dos cães escolhidos.");
      return;
    }

    if (!formData.start_date) {
      alert("Informe a data de início do plano.");
      return;
    }

    if (!selectedClient?.vencimento_planos || !Number.isFinite(dueDay)) {
      alert("O responsável financeiro selecionado precisa ter o vencimento de planos definido no próprio cadastro.");
      return;
    }

    if (!Number.isFinite(monthlyValuePerDog) || monthlyValuePerDog <= 0) {
      alert("Informe um valor mensal por cão válido.");
      return;
    }

    if (weekdayValidationMessage) {
      alert(weekdayValidationMessage);
      return;
    }

    if (!firstBillingPreview?.firstDueDate) {
      alert("Não foi possível calcular o primeiro vencimento do plano. Revise a data de início e os dias selecionados.");
      return;
    }

    if (formData.service === "day_care" && realFirstMonthDates.length === 0) {
      alert("Defina pelo menos uma data real para o primeiro mês do pacote.");
      return;
    }

    setIsSaving(true);
    try {
      const linkWasEnsured = await ensureFinancialLink(selectedClient, uniqueDogIds);
      if (!linkWasEnsured) {
        setIsSaving(false);
        return;
      }

      const existingMetadata = editingItem ?parseMetadata(editingItem.metadata_gerencial) : {};
      const shouldPreserveNextBilling = Boolean(editingItem && (existingMetadata.first_cycle_charged || editingItem.next_billing_date));

      const packageGroupKey = editingItem?.packageGroupKey || existingMetadata.package_group_key || createPackageGroupKey();
      const metadataGerencial = {
        ...existingMetadata,
        package_group_key: packageGroupKey,
        package_dog_count: packageDogCount,
        package_dog_ids: uniqueDogIds,
        start_date: formData.start_date,
        first_month_projection_dates: projectedFirstMonthDates,
        first_month_real_dates: realFirstMonthDates,
        first_cycle: {
          due_date: formatDateOnly(firstBillingPreview.firstDueDate),
          total_value: Number(firstBillingPreview.firstPackageValue.toFixed(2)),
          per_dog_value: Number(firstBillingPreview.firstPerDogValue.toFixed(2)),
          planned_uses: firstBillingPreview.plannedUses,
          billed_uses: firstBillingPreview.chargedUses,
          cycle_slots: firstBillingPreview.cycleSlots,
          is_full_package: firstBillingPreview.isFullPackage,
        },
        first_cycle_charged: existingMetadata.first_cycle_charged || false,
      };

      const payloadBase = {
        clientId: selectedClient.id,
        clientName: selectedClient.nome_razao_social || "",
        service: formData.service,
        frequency: formData.frequency,
        weekdays: normalizedWeekdays,
        monthlyValue: monthlyValuePerDog,
        dueDay,
        nextBillingDate: shouldPreserveNextBilling
          ?(editingItem?.next_billing_date || formatDateOnly(firstBillingPreview.nextRecurringDueDate))
          : firstBillingPreview.firstPackageValue > 0
            ?formatDateOnly(firstBillingPreview.firstDueDate)
            : formatDateOnly(firstBillingPreview.nextRecurringDueDate),
        metadataGerencial,
      };

      if (editingItem) {
        const existingPlans = editingItem.memberPlans || [editingItem];
        const existingPlansByDogId = new Map(existingPlans.filter((plan) => plan.dog_id).map((plan) => [plan.dog_id, plan]));

        for (const dogId of uniqueDogIds) {
          const matchingPlan = existingPlansByDogId.get(dogId);
          const payload = getPlanGroupPayload({
            ...payloadBase,
            dogId,
          });

          if (matchingPlan) {
            await PlanConfig.update(matchingPlan.id, payload);
          } else {
            await PlanConfig.create(payload);
          }
        }

        for (const existingPlan of existingPlans) {
          if (!uniqueDogIds.includes(existingPlan.dog_id)) {
            await PlanConfig.delete(existingPlan.id);
          }
        }
      } else {
        for (const dogId of uniqueDogIds) {
          await PlanConfig.create(
            getPlanGroupPayload({
              ...payloadBase,
              dogId,
            }),
          );
        }
      }

      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar plano recorrente:", error);
      alert("Não foi possível salvar o plano recorrente.");
    }
    setIsSaving(false);
  }

  async function handleDelete() {
    if (!deleteItem) return;
    const planIds = Array.isArray(deleteItem.planIds) ? deleteItem.planIds.filter(Boolean) : [];
    if (planIds.length === 0) return;

    setIsDeleting(true);
    try {
      const exclusionDate = parseDateOnly(deleteDate);
      const preview = deletePreview;
      const deleteNote = exclusionDate
        ? `Plano encerrado em ${format(exclusionDate, "dd/MM/yyyy", { locale: ptBR })}.`
        : "Plano encerrado.";

      if (preview?.monthAppointments?.length) {
        const appointmentsToCancel = preview.monthAppointments.filter((appointment) => {
          const appointmentDate = parseDateOnly(appointment.data_referencia || appointment.data_hora_entrada?.slice?.(0, 10));
          return appointmentDate
            && appointmentDate.getTime() > preview.exclusionDate.getTime()
            && !["cancelado", "desconsiderado"].includes(appointment.status);
        });

        for (const appointment of appointmentsToCancel) {
          await Appointment.update(appointment.id, {
            status: "cancelado",
            observacoes: [appointment.observacoes, deleteNote].filter(Boolean).join("\n"),
          });
        }
      }

      const groupedCharges = groupReceivablesMap.get(deleteItem.id) || [];
      const futureUnpaidCharges = groupedCharges.filter((charge) =>
        getMonthKey(charge.vencimento) > (preview?.monthKey || "")
        && !charge.data_recebimento,
      );

      for (const charge of futureUnpaidCharges) {
        await ContaReceber.delete(charge.id);
      }

      const currentMonthUnpaidCharges = groupedCharges.filter((charge) =>
        getMonthKey(charge.vencimento) === (preview?.monthKey || "")
        && !charge.data_recebimento,
      );

      if (preview && currentMonthUnpaidCharges.length > 0) {
        const perChargeValue = currentMonthUnpaidCharges.length > 0
          ? Number((preview.proportionalValue / currentMonthUnpaidCharges.length).toFixed(2))
          : 0;

        for (const charge of currentMonthUnpaidCharges) {
          const nextMetadata = {
            ...parseMetadata(charge.metadata),
            plan_deleted_at: formatDateOnly(preview.exclusionDate),
            suggested_refund: preview.suggestedRefund,
            suggested_charge: preview.suggestedCharge,
          };

          await ContaReceber.update(charge.id, {
            valor: perChargeValue,
            metadata: nextMetadata,
          });
        }
      }

      for (const planId of planIds) {
        await PlanConfig.delete(planId);
      }

      setDeleteItem(null);
      setDetailItem(null);
      await loadData();
    } catch (error) {
      console.error("Erro ao excluir plano recorrente:", error);
      alert("Não foi possível excluir o plano recorrente.");
    }
    setIsDeleting(false);
  }

  const planGroups = useMemo(() => {
    const groups = new Map();

    plans.forEach((plan) => {
      const packageMeta = getPlanPackageMeta(plan);
      const groupKey = packageMeta.packageGroupKey || plan.id;
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.memberPlans.push(plan);
        existingGroup.planIds.push(plan.id);
        existingGroup.dogIds = [...new Set([...existingGroup.dogIds, ...packageMeta.dogIds])];
        return;
      }

      groups.set(groupKey, {
        id: groupKey,
        packageGroupKey: groupKey,
        representativePlan: plan,
        memberPlans: [plan],
        planIds: [plan.id],
        dogIds: packageMeta.dogIds,
        packageDogCount: packageMeta.packageDogCount,
      });
    });

    return Array.from(groups.values())
      .map((group) => {
        const representativePlan = group.representativePlan;
        const serviceId = representativePlan.service || representativePlan.tipo_plano || "day_care";
        const clientId = getPlanClientId(representativePlan);
        const clientName = clientsById[clientId]?.nome_razao_social || representativePlan.client_name || "-";
        const packageDogCount = Math.max(group.packageDogCount || 1, group.dogIds.length || 1);
        const dogNames = group.dogIds.map((dogId) => dogsById[dogId]?.nome || "Cão não encontrado");
        const metadata = parseMetadata(representativePlan.metadata_gerencial);
        const firstCycle = metadata.first_cycle || null;
        const monthlyValuePerDog = getMonthlyValue(representativePlan);

        return {
          ...group,
          representativePlan,
          clientId,
          clientName,
          serviceId,
          serviceMeta: getServiceMeta(serviceId),
          frequencyLabel: getFrequencyLabel(representativePlan.frequency),
          weekdays: normalizeWeekdays(representativePlan.weekdays),
          startDate: metadata.start_date || null,
          dueDay: representativePlan.due_day || representativePlan.renovacao_dia || null,
          dogNames,
          packageDogCount,
          totalPackageValue: monthlyValuePerDog * packageDogCount,
          monthlyValuePerDog,
          firstCycleValue: Number(firstCycle?.total_value || 0) || 0,
          firstMonthDates: normalizeFirstMonthDateList(metadata.start_date, metadata.first_month_real_dates),
        };
      })
      .sort((left, right) => {
        const leftDate = left.representativePlan?.created_date ? new Date(left.representativePlan.created_date).getTime() : 0;
        const rightDate = right.representativePlan?.created_date ? new Date(right.representativePlan.created_date).getTime() : 0;
        return rightDate - leftDate;
      });
  }, [clientsById, dogsById, plans]);

  const filteredPlanGroups = useMemo(
    () => planGroups.filter((group) => {
      const search = searchTerm.trim().toLowerCase();
      if (!search) return true;

      return group.clientName.toLowerCase().includes(search)
        || group.dogNames.some((dogName) => dogName.toLowerCase().includes(search))
        || group.serviceMeta.label.toLowerCase().includes(search);
    }),
    [planGroups, searchTerm],
  );

  const stats = useMemo(
    () => ({
      dayCare: planGroups.filter((group) => group.serviceId === "day_care").length,
      clientes: new Set(planGroups.map((group) => group.clientId).filter(Boolean)).size,
    }),
    [planGroups],
  );

  const groupReceivablesMap = useMemo(() => {
    const entries = new Map();

    planGroups.forEach((group) => {
      const groupCharges = receivables
        .filter((item) => {
          const metadata = parseMetadata(item.metadata);
          return group.planIds.includes(metadata.plan_id) || metadata.package_group_key === group.packageGroupKey;
        })
        .sort((left, right) => `${left.vencimento || ""}`.localeCompare(`${right.vencimento || ""}`));

      entries.set(group.id, groupCharges);
    });

    return entries;
  }, [planGroups, receivables]);

  const paymentEntries = useMemo(() => {
    if (!paymentsItem) return [];

    const monthMap = new Map();
    const groupedCharges = groupReceivablesMap.get(paymentsItem.id) || [];

    groupedCharges.forEach((charge) => {
      const dueDate = parseDateOnly(charge.vencimento);
      if (!dueDate) return;
      const monthKey = getMonthKey(dueDate);
      const current = monthMap.get(monthKey) || {
        monthKey,
        monthDate: startOfMonth(dueDate),
        charges: [],
      };
      current.charges.push(charge);
      monthMap.set(monthKey, current);
    });

    return Array.from(monthMap.values())
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
      .map((entry) => {
        const today = normalizeDate(new Date());
        const paidCharges = entry.charges.filter((charge) => Boolean(charge.data_recebimento));
        const overdueCharges = entry.charges.filter((charge) => !charge.data_recebimento && parseDateOnly(charge.vencimento)?.getTime() < today.getTime());
        const dueTodayCharges = entry.charges.filter((charge) => !charge.data_recebimento && parseDateOnly(charge.vencimento) && isSameDay(parseDateOnly(charge.vencimento), today));
        const futureCharges = entry.charges.filter((charge) => !charge.data_recebimento && parseDateOnly(charge.vencimento)?.getTime() > today.getTime());

        let status = "upcoming";
        let helper = entry.charges[0]?.vencimento ? `Vence em ${format(parseDateOnly(entry.charges[0].vencimento), "dd/MM/yyyy", { locale: ptBR })}` : "Sem vencimento";

        if (paidCharges.length === entry.charges.length) {
          status = "paid";
          const paymentDates = paidCharges.map((charge) => parseDateOnly(charge.data_recebimento)).filter(Boolean).sort((a, b) => a - b);
          helper = paymentDates.length > 0 ? `Pago ${format(paymentDates[paymentDates.length - 1], "dd/MM/yyyy", { locale: ptBR })}` : "Pago";
        } else if (overdueCharges.length > 0) {
          status = "overdue";
          const reference = overdueCharges
            .map((charge) => parseDateOnly(charge.vencimento))
            .filter(Boolean)
            .sort((a, b) => a - b)[0];
          helper = reference ? `Atrasado há ${differenceInCalendarDays(today, reference)} dia(s)` : "Atrasado";
        } else if (dueTodayCharges.length > 0) {
          status = "due_today";
          helper = "Vence hoje";
        } else if (futureCharges.length > 0 && paidCharges.length > 0) {
          helper = `Pago parcial ${paidCharges.length}/${entry.charges.length}`;
        }

        return {
          ...entry,
          label: formatMonthLabel(entry.monthDate),
          totalValue: entry.charges.reduce((sum, charge) => sum + (Number(charge.valor) || 0), 0),
          status,
          helper,
        };
      });
  }, [groupReceivablesMap, paymentsItem]);

  const deletePreview = useMemo(() => {
    if (!deleteItem || !deleteDate) return null;

    const exclusionDate = parseDateOnly(deleteDate);
    if (!exclusionDate) return null;

    const monthKey = getMonthKey(exclusionDate);
    const groupCharges = groupReceivablesMap.get(deleteItem.id) || [];
    const monthCharges = groupCharges.filter((charge) => getMonthKey(charge.vencimento) === monthKey);
    const futureCharges = groupCharges.filter((charge) => getMonthKey(charge.vencimento) > monthKey);
    const groupAppointments = appointments.filter((appointment) => {
      const appointmentMeta = parseMetadata(appointment.metadata);
      return deleteItem.planIds.includes(appointmentMeta.plan_id);
    });
    const monthAppointments = groupAppointments.filter((appointment) => getMonthKey(appointment.data_referencia || appointment.data_hora_entrada) === monthKey);
    const keptAppointments = monthAppointments.filter((appointment) => {
      const appointmentDate = parseDateOnly(appointment.data_referencia || appointment.data_hora_entrada?.slice?.(0, 10));
      return appointmentDate && appointmentDate.getTime() <= exclusionDate.getTime() && !["cancelado", "desconsiderado"].includes(appointment.status);
    });
    const openReplacementAppointments = groupAppointments.filter((appointment) => {
      const appointmentDate = parseDateOnly(appointment.data_referencia || appointment.data_hora_entrada?.slice?.(0, 10));
      return appointment.status === "faltou"
        && appointment.charge_type === "pacote"
        && appointmentDate
        && appointmentDate.getTime() <= exclusionDate.getTime();
    });

    const currentMonthTotal = monthCharges.reduce((sum, charge) => sum + (Number(charge.valor) || 0), 0);
    const proportionalFactor = monthAppointments.length > 0 ? keptAppointments.length / monthAppointments.length : 0;
    const proportionalValue = Number((currentMonthTotal * proportionalFactor).toFixed(2));
    const paidCurrentMonth = monthCharges.filter((charge) => charge.data_recebimento).reduce((sum, charge) => sum + (Number(charge.valor) || 0), 0);
    const paidFuture = futureCharges.filter((charge) => charge.data_recebimento).reduce((sum, charge) => sum + (Number(charge.valor) || 0), 0);
    const suggestedRefund = Number(Math.max(0, paidCurrentMonth - proportionalValue + paidFuture).toFixed(2));
    const suggestedCharge = Number(Math.max(0, proportionalValue - paidCurrentMonth).toFixed(2));

    return {
      exclusionDate,
      monthKey,
      monthAppointments,
      keptAppointments,
      openReplacementAppointments,
      currentMonthTotal,
      proportionalValue,
      paidCurrentMonth,
      paidFuture,
      suggestedRefund,
      suggestedCharge,
    };
  }, [appointments, deleteDate, deleteItem, groupReceivablesMap]);

  const activeService = getServiceMeta(formData.service);
  const ActiveServiceIcon = activeService.icon;
  const coverageCandidatesCount = candidateClients.filter((client) => getCoverageSummary(client, selectedDogIds).isFullyLinked).length;
  const detailServiceMeta = detailItem?.serviceMeta || (detailItem ? getServiceMeta(detailItem.serviceId) : null);
  const DetailServiceIcon = detailServiceMeta?.icon || CreditCard;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-sm">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Planos Recorrentes</h1>
              <p className="text-sm text-gray-600">
                Monte pacotes com 1 a 4 cães, use a tabela de Day Care da unidade e mantenha o vencimento herdado do responsável financeiro.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo plano
            </Button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.dayCare}</p>
              <p className="text-sm text-gray-600">Pacotes Day Care</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.clientes}</p>
              <p className="text-sm text-gray-600">Responsáveis financeiros</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar responsável financeiro ou cão..."
              hasActiveFilters={Boolean(searchTerm)}
              onClear={() => {
                setSearchTerm("");
              }}
              filters={[]}
            />
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white">
          <CardContent className="p-0">
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_auto] gap-4 border-b border-gray-100 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 md:grid">
              <span>Responsável financeiro</span>
              <span>Cães inclusos</span>
              <span>Serviço</span>
              <span className="text-right">Abrir</span>
            </div>

            {filteredPlanGroups.length === 0 ?(
              <div className="p-12 text-center">
                <CreditCard className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">Nenhum plano encontrado para os filtros atuais.</p>
              </div>
            ) : filteredPlanGroups.map((group) => {
              const ServiceIcon = group.serviceMeta.icon;

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setDetailItem(group)}
                  className="grid w-full gap-3 border-t border-gray-100 px-5 py-4 text-left transition hover:bg-gray-50 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Responsável financeiro</p>
                    <p className="truncate font-semibold text-gray-900">{group.clientName}</p>
                    <p className="mt-1 text-sm text-gray-500">{group.frequencyLabel}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Cães inclusos</p>
                    <p className="truncate text-sm font-medium text-gray-900">{group.dogNames.join(", ") || "-"}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Serviço</p>
                    <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700">
                      <ServiceIcon className="h-4 w-4" />
                      <span>{group.serviceMeta.label}</span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700">
                      Ver plano
                    </span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className="w-[95vw] max-w-[720px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plano recorrente</DialogTitle>
            <DialogDescription>
              Confira os dados principais do pacote antes de editar ou gerar os próximos movimentos.
            </DialogDescription>
          </DialogHeader>

          {detailItem ?(
            <div className="space-y-5 py-2">
              <div className={`rounded-2xl border p-4 ${detailServiceMeta?.theme || "border-gray-200 bg-gray-50 text-gray-700"}`}>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/80 p-3">
                    <DetailServiceIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{detailItem.serviceMeta.label}</p>
                    <p className="text-sm text-gray-600">{detailItem.frequencyLabel}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Responsável financeiro</p>
                  <p className="mt-2 font-medium text-gray-900">{detailItem.clientName}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Cães inclusos</p>
                  <p className="mt-2 font-medium text-gray-900">{detailItem.dogNames.join(", ") || "-"}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Serviço</p>
                  <p className="mt-2 font-medium text-gray-900">{detailItem.serviceMeta.label}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Vencimento</p>
                  <p className="mt-2 font-medium text-gray-900">{detailItem.dueDay ? `Dia ${detailItem.dueDay}` : "-"}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Dias de preferência</p>
                  <p className="mt-2 font-medium text-gray-900">
                    {detailItem.weekdays.length > 0
                      ? detailItem.weekdays.map((weekday) => WEEKDAYS.find((item) => item.id === weekday)?.label || weekday).join(", ")
                      : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Início do pacote</p>
                  <p className="mt-2 font-medium text-gray-900">
                    {detailItem.startDate ? format(parseDateOnly(detailItem.startDate), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                  </p>
                </div>
                {detailItem.packageDogCount > 1 ?(
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Valor por cão</p>
                    <p className="mt-2 font-medium text-emerald-600">{formatCurrency(detailItem.monthlyValuePerDog)}</p>
                  </div>
                ) : null}
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Valor do pacote</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-600">{formatCurrency(detailItem.totalPackageValue)}</p>
                </div>
              </div>

              {detailItem.firstMonthDates.length > 0 ?(
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Agendamentos 1º mês</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detailItem.firstMonthDates.map((dateKey) => (
                      <Badge key={`${detailItem.id}-${dateKey}`} className="border border-emerald-200 bg-white text-emerald-700">
                        {format(parseDateOnly(dateKey), "dd/MM/yyyy", { locale: ptBR })}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailItem(null)}>
              Fechar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!detailItem) return;
                const nextItem = detailItem;
                setDetailItem(null);
                setPaymentsItem(nextItem);
              }}
              disabled={!detailItem}
            >
              <Zap className="mr-2 h-4 w-4" />
              Pagamentos
            </Button>
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                if (!detailItem) return;
                const nextItem = detailItem;
                setDetailItem(null);
                setDeleteDate(format(new Date(), "yyyy-MM-dd"));
                setDeleteItem(nextItem);
              }}
              disabled={!detailItem}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir plano
            </Button>
            <Button
              onClick={() => {
                if (!detailItem) return;
                const nextItem = detailItem;
                setDetailItem(null);
                openEditModal(nextItem);
              }}
              disabled={!detailItem}
              className="bg-purple-600 text-white hover:bg-purple-700"
            >
              <Pencil className="mr-2 h-4 w-4" />
              Editar plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showModal}
        onOpenChange={(open) => {
          setShowModal(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="w-[95vw] max-w-[980px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ?"Editar plano recorrente" : "Novo plano recorrente"}</DialogTitle>
            <DialogDescription>
              Para Day Care, escolha a quantidade de cães do pacote, selecione os dias preferenciais e use um responsável financeiro que já esteja ligado a pelo menos um dos cães envolvidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white/80 p-3 text-purple-700">
                  <WandSparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Regras do fluxo</p>
                  <p className="mt-1 text-sm text-gray-600">
                    Day Care aceita somente agendamentos de segunda a sexta, o vencimento vem do cadastro do responsável financeiro e pacotes com múltiplos cães geram um plano por cão para preservar a cobrança correta.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">1. Estrutura do plano</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>Serviço *</Label>
                      <Select value={formData.service} onValueChange={handleServiceChange}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione o serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_OPTIONS.map((service) => (
                            <SelectItem key={service.id} value={service.id}>
                              {service.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Frequência *</Label>
                      <Select value={formData.frequency || "__empty__"} onValueChange={(value) => handleFrequencyChange(value === "__empty__" ?"" : value)}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione a frequência" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Selecionar</SelectItem>
                          {availableFrequencies.map((frequency) => (
                            <SelectItem key={frequency.id} value={frequency.id}>
                              {frequency.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Data de início *</Label>
                      <DatePickerInput
                        value={formData.start_date}
                        onChange={handleStartDateChange}
                        className="mt-2"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        O sistema usa essa data para calcular a primeira cobrança e começar os agendamentos automáticos.
                      </p>
                    </div>

                    {formData.service === "day_care" ?(
                      <div className="md:col-span-2">
                        <Label>Quantidade de cães no pacote *</Label>
                        <Select value={String(packageDogCount)} onValueChange={handlePackageDogCountChange}>
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_CARE_PACKAGE_DOG_COUNTS.map((count) => (
                              <SelectItem key={count.id} value={String(count.quantity)}>
                                {count.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-gray-500">
                          Ao escolher 2, 3 ou 4 cães, o formulário libera a mesma quantidade de seletores de cão abaixo.
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <DogIcon className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">2. Cães do pacote</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {ensureDogArraySize(formData.dog_ids || [], packageDogCount).map((dogId, index) => (
                      <div key={`dog-slot-${index}`}>
                        <Label>{packageDogCount > 1 ?`${index + 1}º cão` : "Cão"} *</Label>
                        <Select value={dogId || "__empty__"} onValueChange={(value) => updateDogSelection(index, value === "__empty__" ?"" : value)}>
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Selecione o cão" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__empty__">Selecionar</SelectItem>
                            {dogs.map((dog) => (
                              <SelectItem
                                key={dog.id}
                                value={dog.id}
                                disabled={currentDogIds.some((currentDogId, currentIndex) => currentIndex !== index && currentDogId === dog.id)}
                              >
                                {dog.nome}{dog.raca ?` (${dog.raca})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>

                  {selectedDogs.length > 0 ?(
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedDogs.map((dog) => (
                        <Badge key={dog.id} variant="outline">
                          {dog.nome}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">3. Responsável financeiro e vencimento</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <Label>Responsável financeiro *</Label>
                      <Select value={formData.client_id || "__empty__"} onValueChange={(value) => handleClientChange(value === "__empty__" ?"" : value)}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione o responsável financeiro" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Selecionar</SelectItem>
                          {candidateClients.map((client) => {
                            const coverage = getCoverageSummary(client, selectedDogIds);
                            return (
                              <SelectItem key={client.id} value={client.id}>
                                {client.nome_razao_social} {coverage.isFullyLinked ?"• vinculado a todos" : `• vinculado a ${coverage.linkedCount}/${selectedDogIds.length}`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-gray-500">
                        {selectedDogIds.length === 0
                          ?"Selecione os cães primeiro para liberar os responsáveis financeiros elegíveis."
                          : `${candidateClients.length} responsável(is) financeiro(s) já vinculado(s) a pelo menos um dos cães escolhidos. ${coverageCandidatesCount > 0 ?`${coverageCandidatesCount} cobre(m) todos os cães.` : "Nenhum cobre todos os cães ainda."}`}
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Vencimento herdado do cadastro</p>
                      <p className="mt-1 text-base font-semibold text-gray-900">
                        {selectedClient?.vencimento_planos ?`Aos dias ${selectedClient.vencimento_planos}` : "Selecione um responsável financeiro com vencimento definido"}
                      </p>
                      <p className="mt-2 text-xs text-gray-500">
                        O plano usa exatamente o vencimento cadastrado no perfil do responsável financeiro.
                      </p>
                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-blue-700">Primeiro vencimento previsto</p>
                      <p className="mt-1 text-base font-semibold text-gray-900">
                        {firstBillingPreview?.firstDueDate
                          ?format(firstBillingPreview.firstDueDate, "dd/MM/yyyy", { locale: ptBR })
                          : "Defina data de início e responsável financeiro"}
                      </p>
                      <p className="mt-2 text-xs text-blue-700">
                        {firstBillingPreview?.firstDueDate
                          ?parseDateOnly(formData.start_date) && buildDueDateForMonth(parseDateOnly(formData.start_date), dueDay)?.getTime() >= parseDateOnly(formData.start_date)?.getTime()
                            ?"Como o início está antes do vencimento, o primeiro ciclo vence na data cadastrada."
                            : "Como o início está depois do vencimento, o primeiro ciclo vence no próximo dia útil."
                          : "O cálculo considera a data de início e o vencimento do responsável financeiro."}
                      </p>
                    </div>

                    {selectedClient && !selectedClientCoverage.isFullyLinked && selectedClientCoverage.missingDogIds.length > 0 ?(
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        {selectedClient.nome_razao_social} ainda não está vinculado a{" "}
                        {selectedClientCoverage.missingDogIds.map((dogId) => dogsById[dogId]?.nome || "Cão").join(", ")}.
                        Ao salvar, o sistema vai perguntar se você deseja criar esse vínculo automaticamente.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className={`rounded-2xl border p-4 shadow-sm ${activeService.theme}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="rounded-2xl bg-white/80 p-3">
                      <ActiveServiceIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{activeService.label}</p>
                      <p className="text-sm text-gray-600">{activeService.description}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">
                    {formData.service === "day_care"
                      ?"Os dias disponíveis para Day Care ficam limitados a segunda, terça, quarta, quinta e sexta."
                      : "Selecione os dias preferenciais para alimentar os agendamentos automáticos desse plano."}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">4. Dias preferenciais</h3>
                  </div>

                  <p className="mb-3 text-xs text-gray-500">
                    {weekdaysLocked
                      ?"No modo diário de Day Care, os dias úteis ficam preenchidos automaticamente."
                      : expectedWeekdayCount > 0
                        ?`Selecione ${expectedWeekdayCount} ${expectedWeekdayCount === 1 ?"dia" : "dias"} para esta frequência.`
                        : "Escolha os dias em que esse plano deve gerar agendamentos automáticos."}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {allowedWeekdays.map((weekday) => {
                      const isSelected = normalizedWeekdays.includes(weekday.id);
                      return (
                        <Button
                          key={weekday.id}
                          type="button"
                          variant={isSelected ?"default" : "outline"}
                          onClick={() => toggleWeekday(weekday.id)}
                          disabled={weekdaysLocked}
                          className={isSelected ?"bg-purple-600 text-white hover:bg-purple-700" : ""}
                        >
                          {weekday.label}
                        </Button>
                      );
                    })}
                  </div>

                  {weekdayValidationMessage ?(
                    <p className="mt-3 text-sm text-amber-700">{weekdayValidationMessage}</p>
                  ) : null}
                </div>

                {formData.service === "day_care" ?(
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">4A. Agenda do primeiro mês</h3>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm font-medium text-blue-900">Projeção automática</p>
                        <p className="mt-1 text-xs text-blue-700">
                          O sistema sugere essas datas com base na data de início e nos dias preferenciais do pacote.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {projectedFirstMonthDates.length > 0 ? projectedFirstMonthDates.map((dateKey) => (
                            <Badge key={`projection-${dateKey}`} className="border border-blue-200 bg-white text-blue-700">
                              {format(parseDateOnly(dateKey), "dd/MM/yyyy", { locale: ptBR })}
                            </Badge>
                          )) : (
                            <span className="text-sm text-blue-700">Sem projeções adicionais para este mês.</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-emerald-900">Agendamentos 1º mês</p>
                            <p className="mt-1 text-xs text-emerald-700">
                              Ajuste as datas pontuais que realmente devem virar agendamento. Elas entram no cálculo da primeira cobrança.
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={addFirstMonthDate} disabled={!formData.start_date}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar data
                          </Button>
                        </div>

                        <div className="mt-4 space-y-3">
                          {realFirstMonthDates.length > 0 ? realFirstMonthDates.map((dateKey, index) => (
                            <div key={`real-date-${index}`} className="flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <DatePickerInput value={dateKey} onChange={(value) => updateFirstMonthDate(index, value)} />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFirstMonthDate(index)}
                                disabled={realFirstMonthDates.length <= 1}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          )) : (
                            <div className="rounded-xl border border-dashed border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800">
                              Defina a data de início e os dias preferenciais para montar os agendamentos do 1º mês.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">5. Cobrança</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <Label>{packageDogCount > 1 ?"Valor mensal por cão *" : "Valor mensal *"}</Label>
                        {formData.service === "day_care" ?(
                          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                            <Switch
                              checked={isCustomMonthlyValue}
                              onCheckedChange={handleCustomValueToggle}
                              disabled={!hasDayCareSuggestedValue}
                            />
                            Valor personalizado
                          </label>
                        ) : null}
                      </div>
                      <Input
                        className={`mt-2 ${isDayCareUsingTableValue ? "bg-gray-50 text-gray-500" : ""}`}
                        type="number"
                        step="0.01"
                        value={formData.monthly_value}
                        onChange={(event) => handleMonthlyValueChange(event.target.value)}
                        placeholder="0,00"
                        disabled={isDayCareUsingTableValue}
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        {formData.service === "day_care"
                          ?hasDayCareSuggestedValue
                            ?isDayCareUsingTableValue
                              ?"Usando automaticamente o valor da tabela de Day Care."
                              :"Valor personalizado ativo para este pacote."
                            :"Cadastre este pacote em Preços e descontos > Day Care para usar o valor automático."
                          : packageDogCount > 1
                            ?"Cada plano salvo recebe este valor por cão. O total do pacote fica no resumo abaixo."
                            : "Este será o valor mensal do plano."}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-900">Primeiro ciclo do pacote</p>
                      {firstBillingPreview?.firstDueDate ?(
                        <div className="mt-3 space-y-2 text-sm text-slate-700">
                          <div className="flex items-start justify-between gap-3">
                            <span>Data de início</span>
                            <span className="text-right font-medium text-slate-900">
                              {formData.start_date ?format(parseDateOnly(formData.start_date), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                            </span>
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <span>Primeiro vencimento</span>
                            <span className="text-right font-medium text-slate-900">
                              {format(firstBillingPreview.firstDueDate, "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                          {formData.service === "day_care" ?(
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <span>Utilizações previstas</span>
                                <span className="text-right font-medium text-slate-900">
                                  {firstBillingPreview.plannedUses} previstas / {firstBillingPreview.chargedUses} cobradas
                                </span>
                              </div>
                              <div className="flex items-start justify-between gap-3">
                                <span>Primeira cobrança do pacote</span>
                                <span className="text-right font-semibold text-emerald-600">
                                  {formatCurrency(firstBillingPreview.firstPackageValue)}
                                </span>
                              </div>
                              <p className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600">
                                {firstBillingPreview.plannedUses === 0
                                  ?"Não há utilizações previstas para este mês. O sistema deixa a primeira cobrança para o próximo ciclo cheio."
                                  : firstBillingPreview.isFullPackage
                                    ?"A quantidade prevista alcançou o teto mensal do pacote, então o primeiro mês cobra o valor integral."
                                    : `O sistema divide o pacote por ${firstBillingPreview.cycleSlots} utilizações e cobra apenas ${firstBillingPreview.chargedUses} no primeiro mês.`}
                              </p>
                            </>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <span>Primeira cobrança</span>
                              <span className="text-right font-semibold text-emerald-600">
                                {formatCurrency(firstBillingPreview.firstPackageValue)}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm text-slate-600">
                          Defina a data de início, a frequência e os dias preferenciais para calcular o primeiro ciclo.
                        </p>
                      )}
                    </div>

                    {formData.service === "day_care" && formData.frequency ?(
                      <div className={`rounded-xl border p-4 ${dayCareSuggestion?.row ?"border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
                        <p className="font-medium text-gray-900">
                          {dayCareSuggestion?.row ?"Tabela de Day Care conectada" : "Tabela de Day Care sem valor correspondente"}
                        </p>
                        {dayCareSuggestion?.row ?(
                          <>
                            <p className="mt-1 text-sm text-gray-700">
                              {dayCareSuggestion.frequencyLabel} para {dayCareSuggestion.packageBucket.label}: {formatCurrency(dayCareSuggestion.totalValue)} no total.
                              O rateio sugerido para cada cão é {formatCurrency(dayCareSuggestion.perDogValue)}.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={applySuggestedValue} disabled={isDayCareUsingTableValue}>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Usar valor da tabela
                              </Button>
                              <Badge className={useSuggestedValue ?"bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}>
                                {useSuggestedValue ?"Valor sincronizado com a tabela" : "Valor editado manualmente"}
                              </Badge>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-amber-800">
                            Cadastre esse pacote em <strong>Preços e descontos &gt; Day Care</strong> para sugerir o valor automaticamente aqui.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <DogIcon className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Resumo do pacote</h3>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Cães</span>
                      <span className="text-right font-medium text-gray-900">
                        {selectedDogs.length > 0 ?selectedDogs.map((dog) => dog.nome).join(", ") : "-"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Responsável financeiro</span>
                      <span className="text-right font-medium text-gray-900">
                        {selectedClient?.nome_razao_social || "Selecione um responsável financeiro"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Serviço</span>
                      <span className="text-right font-medium text-gray-900">{activeService.label}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Frequência</span>
                      <span className="text-right font-medium text-gray-900">
                        {formData.frequency ?getFrequencyLabel(formData.frequency) : "-"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Início</span>
                      <span className="text-right font-medium text-gray-900">
                        {formData.start_date
                          ?format(parseDateOnly(formData.start_date), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Dias</span>
                      <span className="text-right font-medium text-gray-900">
                        {normalizedWeekdays.length > 0
                          ?normalizedWeekdays.map((weekday) => WEEKDAYS.find((item) => item.id === weekday)?.label || weekday).join(", ")
                          : "-"}
                      </span>
                    </div>
                    {packageDogCount > 1 ?(
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-gray-500">Valor por cão</span>
                        <span className="text-right font-medium text-emerald-600">
                          {formData.monthly_value ?formatCurrency(Number.parseFloat(String(formData.monthly_value).replace(",", ".")) || 0) : "-"}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Total do pacote</span>
                      <span className="text-right text-base font-bold text-emerald-600">
                        {formData.monthly_value ?formatCurrency(totalPackageValue) : "-"}
                      </span>
                    </div>
                    <div className="border-t border-dashed border-gray-200 pt-3">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-gray-500">Primeira cobrança</span>
                          <span className="text-right text-base font-bold text-blue-700">
                            {firstBillingPreview ?formatCurrency(firstBillingPreview.firstPackageValue) : "-"}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-gray-500">Primeiro vencimento</span>
                          <span className="text-right font-medium text-gray-900">
                            {firstBillingPreview?.firstDueDate
                              ?format(firstBillingPreview.firstDueDate, "dd/MM/yyyy", { locale: ptBR })
                              : "-"}
                          </span>
                        </div>
                        {formData.service === "day_care" ?(
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-gray-500">Agendamentos 1º mês</span>
                            <span className="text-right font-medium text-gray-900">
                              {realFirstMonthDates.length > 0
                                ?realFirstMonthDates.map((dateKey) => format(parseDateOnly(dateKey), "dd/MM", { locale: ptBR })).join(" • ")
                                : "-"}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 text-white hover:bg-purple-700">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : editingItem ? "Salvar plano" : packageDogCount === 1 ? "Criar plano" : `Criar ${packageDogCount} planos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(paymentsItem)} onOpenChange={(open) => !open && setPaymentsItem(null)}>
        <DialogContent className="w-[95vw] max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pagamentos do plano</DialogTitle>
            <DialogDescription>
              Acompanhe os meses do pacote e o status financeiro de cada ciclo.
            </DialogDescription>
          </DialogHeader>

          {paymentsItem ? (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <p className="font-semibold text-gray-900">{paymentsItem.clientName}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {paymentsItem.serviceMeta.label} • {paymentsItem.dogNames.join(", ") || "-"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <p className="font-semibold">Verde</p>
                  <p className="mt-1">Pago</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Amarelo</p>
                  <p className="mt-1">Vence hoje</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <p className="font-semibold">Vermelho</p>
                  <p className="mt-1">Atrasado</p>
                </div>
              </div>

              {paymentEntries.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {paymentEntries.map((entry) => (
                    <div key={`${paymentsItem.id}-${entry.monthKey}`} className={`rounded-2xl border p-4 ${getPaymentTone(entry)}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{entry.label}</p>
                          <p className="mt-1 text-sm">{entry.helper}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm opacity-80">Valor</p>
                          <p className="font-semibold">{formatCurrency(entry.totalValue)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
                  Ainda não há linhas de cobrança geradas para este plano.
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentsItem(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
        <DialogContent className="w-[95vw] max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Excluir plano</DialogTitle>
            <DialogDescription>
              Escolha a data de encerramento para revisar o impacto financeiro e os agendamentos restantes.
            </DialogDescription>
          </DialogHeader>

          {deleteItem ? (
            <div className="space-y-4 py-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                  <div>
                    <p className="font-semibold text-amber-900">{deleteItem.clientName}</p>
                    <p className="mt-1 text-sm text-amber-800">
                      {deleteItem.serviceMeta.label} • {deleteItem.dogNames.join(", ") || "-"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Data de exclusão</Label>
                <DatePickerInput value={deleteDate} onChange={setDeleteDate} className="mt-2" />
              </div>

              {deletePreview ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Cobrança proporcional deste mês</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(deletePreview.proportionalValue)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-sm text-gray-500">Pago neste mês</p>
                      <p className="mt-1 text-lg font-semibold text-gray-900">{formatCurrency(deletePreview.paidCurrentMonth)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm text-emerald-700">Sugestão de reembolso/crédito</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-900">{formatCurrency(deletePreview.suggestedRefund)}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm text-blue-700">Sugestão de cobrança pendente</p>
                      <p className="mt-1 text-lg font-semibold text-blue-900">{formatCurrency(deletePreview.suggestedCharge)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="font-semibold text-gray-900">Reposições em aberto</p>
                    {deletePreview.openReplacementAppointments.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {deletePreview.openReplacementAppointments.map((appointment) => {
                          const appointmentDate = parseDateOnly(appointment.data_referencia || appointment.data_hora_entrada?.slice?.(0, 10));
                          return (
                            <div key={appointment.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                              <span className="font-medium text-gray-900">{dogsById[appointment.dog_id]?.nome || "Cão"}</span>
                              <span className="text-gray-600">
                                {appointmentDate ? format(appointmentDate, "dd/MM/yyyy", { locale: ptBR }) : "-"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-gray-500">Nenhuma reposição em aberto para este pacote até a data escolhida.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
                  Defina uma data válida para visualizar a prévia da exclusão.
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={!deletePreview || isDeleting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {isDeleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
