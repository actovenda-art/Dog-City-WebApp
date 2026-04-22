import React, { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, endOfMonth, format, getDay, isWeekend, nextDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bath,
  Calendar,
  CalendarClock,
  CreditCard,
  Dog as DogIcon,
  Home,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Scissors,
  Search,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/common/DateTimeInputs";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const DAY_CARE_PACKAGE_TYPE = "day_care_pacote";

const SERVICE_OPTIONS = [
  {
    id: "day_care",
    label: "Day Care",
    icon: DogIcon,
    theme: "border-blue-200 bg-blue-50 text-blue-700",
    description: "Pacote recorrente com valor sugerido automaticamente pela tabela de Day Care.",
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

const STATUS_OPTIONS = [
  { id: "ativo", label: "Ativo" },
  { id: "suspenso", label: "Suspenso" },
  { id: "inativo", label: "Inativo" },
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
  status: "ativo",
  observacoes: "",
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

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function getServiceMeta(serviceId) {
  return SERVICE_OPTIONS.find((item) => item.id === serviceId) || SERVICE_OPTIONS[0];
}

function getFrequencyLabel(frequencyId) {
  return FREQUENCIES.find((item) => item.id === frequencyId)?.label || frequencyId || "-";
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "ativo":
      return "bg-green-100 text-green-700";
    case "suspenso":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
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

function countScheduledUsesInMonth(startDateValue, weekdays) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate || weekdays.length === 0) return 0;

  const lastDay = endOfMonth(startDate);
  let total = 0;
  for (let cursor = startDate; cursor <= lastDay; cursor = addDays(cursor, 1)) {
    if (weekdays.includes(getDay(cursor))) {
      total += 1;
    }
  }

  return total;
}

function buildFirstBillingPreview({
  startDateValue,
  dueDay,
  service,
  frequency,
  weekdays,
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

  const plannedUses = countScheduledUsesInMonth(startDateValue, weekdays);
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
  status,
  observacoes,
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
    status,
    observacoes,
    cliente_fixo: true,
  };
}

export default function PlanosConfig() {
  const [plans, setPlans] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [useSuggestedValue, setUseSuggestedValue] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [plansData, dogsData, carteirasData, tabelaPrecosData, me] = await Promise.all([
        PlanConfig.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        TabelaPrecos.list("-created_date", 1000),
        User.me().catch(() => null),
      ]);

      const empresaId = me?.empresa_id || null;

      setPlans(plansData || []);
      setDogs((dogsData || []).filter((item) => item.ativo !== false));
      setCarteiras((carteirasData || []).filter((item) => item.ativo !== false));
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
    const metadata = parseMetadata(item.metadata_gerencial);
    setEditingItem(item);
    setUseSuggestedValue(false);
    setFormData({
      client_id: getPlanClientId(item),
      dog_ids: [item.dog_id || ""],
      package_dog_count: 1,
      service: item.service || item.tipo_plano || "day_care",
      frequency: item.frequency || "",
      weekdays: normalizeWeekdays(item.weekdays),
      start_date: metadata.start_date || format(item.created_date ?parseISO(item.created_date) : new Date(), "yyyy-MM-dd"),
      monthly_value: getMonthlyValue(item) ?String(getMonthlyValue(item)) : "",
      status: item.status || "ativo",
      observacoes: item.observacoes || "",
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
      packageDogCount,
      monthlyValuePerDog,
      packageMonthlyValue: totalPackageValue,
    }),
    [
      dueDay,
      formData.frequency,
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
    setFormData((current) => ({
      ...current,
      service: serviceId,
      package_dog_count: serviceId === "day_care" ?current.package_dog_count : 1,
      dog_ids: ensureDogArraySize(current.dog_ids || [], serviceId === "day_care" ?Number(current.package_dog_count || 1) : 1),
      frequency: nextFrequencyOptions.some((item) => item.id === current.frequency) ?current.frequency : "",
      weekdays: normalizeWeekdays(current.weekdays).filter((item) => getAllowedWeekdays(serviceId).some((weekday) => weekday.id === item)),
    }));
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

  function applySuggestedValue() {
    if (!dayCareSuggestion?.row) return;
    setUseSuggestedValue(true);
    setFormData((current) => ({
      ...current,
      monthly_value: dayCareSuggestion.perDogValue.toFixed(2),
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

  async function generateAppointments(plan, weeksAhead = 4) {
    const weekdays = normalizeWeekdays(plan.weekdays);
    if (!weekdays.length || (plan.status || "ativo") !== "ativo") return 0;

    const today = normalizeDate(new Date());
    const metadata = parseMetadata(plan.metadata_gerencial);
    const planStartDate = parseDateOnly(metadata.start_date);
    const generationBaseDate = planStartDate && planStartDate.getTime() > today.getTime() ?planStartDate : today;
    const appointments = [];

    for (let week = 0; week < weeksAhead; week += 1) {
      for (const weekday of weekdays) {
        let targetDate = addWeeks(generationBaseDate, week);
        const currentWeekday = getDay(targetDate);

        if (currentWeekday !== weekday) {
          targetDate = nextDay(targetDate, weekday);
        }

        if (targetDate >= generationBaseDate) {
          const dateKey = format(targetDate, "yyyy-MM-dd");
          const valuePerUse = getMonthlyValue(plan) / Math.max(weekdays.length * 4, 1);

          appointments.push({
            dog_id: plan.dog_id,
            cliente_id: plan.client_id || plan.carteira_id || null,
            client_name: plan.client_name,
            service: plan.service,
            service_type: plan.service,
            date: dateKey,
            data_referencia: dateKey,
            data_hora_entrada: `${dateKey}T08:00:00`,
            data_hora_saida: `${dateKey}T18:00:00`,
            value: valuePerUse,
            payment_status: "pendente",
            valor_previsto: valuePerUse,
            charge_type: "pacote",
            source_type: "plano_recorrente",
            plan_id: plan.id,
            source_key: `plano_recorrente|${plan.id}|${plan.service}|${dateKey}`,
          });
        }
      }
    }

    for (const appointment of appointments) {
      const existingAppointments = await Appointment.filter({ source_key: appointment.source_key });
      if (existingAppointments.length === 0) {
        await Appointment.create(appointment);
      }
    }

    return appointments.length;
  }

  async function generateMonthlyBilling(plan) {
    if ((plan.status || "ativo") !== "ativo") return;

    const metadata = parseMetadata(plan.metadata_gerencial);
    const firstCycle = metadata.first_cycle || null;
    const dueDayValue = Number.parseInt(String(plan.due_day || plan.renovacao_dia || ""), 10);
    const dueDate = parseDateOnly(plan.next_billing_date) || getLegacyNextBillingDate(plan);
    if (!dueDate) return;

    const dueDateKey = formatDateOnly(dueDate);
    const sourceKey = `plano_recorrente|${plan.id}|${dueDateKey}`;
    const existingCharges = await ContaReceber.filter({ source_key: sourceKey });
    const isPendingFirstCycle = Boolean(firstCycle?.due_date && firstCycle.due_date === dueDateKey && !metadata.first_cycle_charged);
    const billingAmount = isPendingFirstCycle
      ?Number(firstCycle?.per_dog_value || 0) || getMonthlyValue(plan)
      : getMonthlyValue(plan);

    if (existingCharges.length === 0 && billingAmount > 0) {
      await ContaReceber.create({
        cliente_id: plan.client_id || plan.carteira_id || null,
        dog_id: plan.dog_id || null,
        descricao: `Mensalidade ${getServiceMeta(plan.service).label} - ${plan.client_name}`,
        servico: plan.service,
        valor: billingAmount,
        vencimento: dueDateKey,
        status: "pendente",
        origem: "plano_recorrente",
        tipo_agendamento: "recorrente",
        tipo_cobranca: "pacote",
        data_prestacao: dueDateKey,
        source_key: sourceKey,
        metadata: {
          plan_id: plan.id,
          client_name: plan.client_name,
          due_day: plan.due_day,
          first_cycle: isPendingFirstCycle,
        },
      });
    }

    const nextRecurringDate = Number.isFinite(dueDayValue)
      ?buildDueDateForMonth(addMonths(dueDate, 1), dueDayValue)
      : null;

    await PlanConfig.update(plan.id, {
      next_billing_date: nextRecurringDate ?formatDateOnly(nextRecurringDate) : dueDateKey,
      metadata_gerencial: {
        ...metadata,
        first_cycle_charged: metadata.first_cycle_charged || isPendingFirstCycle,
      },
    });
  }

  async function runAutomations(plan) {
    setIsGenerating(true);
    try {
      const generatedAppointments = await generateAppointments(plan);
      await generateMonthlyBilling(plan);
      alert(`Automação concluída.\n${generatedAppointments} agendamento(s) gerado(s) e cobrança mensal conferida.`);
      await loadData();
    } catch (error) {
      console.error("Erro ao executar automações do plano:", error);
      alert("Não foi possível executar as automações deste plano.");
    }
    setIsGenerating(false);
  }

  async function runAllAutomations() {
    setIsGenerating(true);
    try {
      const activePlans = plans.filter((plan) => (plan.status || "ativo") === "ativo");
      for (const plan of activePlans) {
        await generateAppointments(plan);
        await generateMonthlyBilling(plan);
      }
      alert(`Automações executadas para ${activePlans.length} plano(s) ativo(s).`);
      await loadData();
    } catch (error) {
      console.error("Erro ao executar automações em lote:", error);
      alert("Não foi possível executar as automações em lote.");
    }
    setIsGenerating(false);
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

    setIsSaving(true);
    try {
      const linkWasEnsured = await ensureFinancialLink(selectedClient, uniqueDogIds);
      if (!linkWasEnsured) {
        setIsSaving(false);
        return;
      }

      const existingMetadata = editingItem ?parseMetadata(editingItem.metadata_gerencial) : {};
      const shouldPreserveNextBilling = Boolean(editingItem && (existingMetadata.first_cycle_charged || editingItem.next_billing_date));

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
        metadataGerencial: {
          ...existingMetadata,
          start_date: formData.start_date,
          package_dog_count: packageDogCount,
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
        },
        status: formData.status,
        observacoes: formData.observacoes || "",
      };

      if (editingItem) {
        await PlanConfig.update(
          editingItem.id,
          getPlanGroupPayload({
            ...payloadBase,
            dogId: uniqueDogIds[0],
          }),
        );
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

  async function handleDelete(id) {
    if (!confirm("Excluir este plano recorrente?")) return;
    await PlanConfig.delete(id);
    await loadData();
  }

  async function toggleStatus(plan) {
    const nextStatus = (plan.status || "ativo") === "ativo" ?"inativo" : "ativo";
    await PlanConfig.update(plan.id, { status: nextStatus });
    await loadData();
  }

  const filteredPlans = useMemo(
    () => plans.filter((plan) => {
      const clientName = clientsById[getPlanClientId(plan)]?.nome_razao_social || plan.client_name || "-";
      const dogName = dogsById[plan.dog_id]?.nome || "Cão não encontrado";
      const matchesSearch = !searchTerm
        || clientName.toLowerCase().includes(searchTerm.toLowerCase())
        || dogName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || (plan.status || "ativo") === filterStatus;
      return matchesSearch && matchesStatus;
    }),
    [clientsById, dogsById, filterStatus, plans, searchTerm],
  );

  const stats = useMemo(
    () => ({
      total: plans.length,
      ativos: plans.filter((plan) => (plan.status || "ativo") === "ativo").length,
      suspensos: plans.filter((plan) => (plan.status || "") === "suspenso").length,
      receitaMensal: plans
        .filter((plan) => (plan.status || "ativo") === "ativo")
        .reduce((total, plan) => total + getMonthlyValue(plan), 0),
    }),
    [plans],
  );

  const activeService = getServiceMeta(formData.service);
  const ActiveServiceIcon = activeService.icon;
  const coverageCandidatesCount = candidateClients.filter((client) => getCoverageSummary(client, selectedDogIds).isFullyLinked).length;

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
            <Button variant="outline" onClick={runAllAutomations} disabled={isGenerating}>
              <Zap className="mr-2 h-4 w-4" />
              {isGenerating ?"Gerando..." : "Rodar automações"}
            </Button>
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

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.total}</p>
              <p className="text-sm text-gray-600">Total de planos</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.ativos}</p>
              <p className="text-sm text-gray-600">Ativos</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.suspensos}</p>
              <p className="text-sm text-gray-600">Suspensos</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.receitaMensal)}</p>
              <p className="text-sm text-gray-600">Receita mensal ativa</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar responsável financeiro ou cão..."
              hasActiveFilters={Boolean(searchTerm || filterStatus !== "all")}
              onClear={() => {
                setSearchTerm("");
                setFilterStatus("all");
              }}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  icon: Search,
                  active: filterStatus !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Status do plano</p>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPlans.length === 0 ?(
            <Card className="col-span-full border-gray-200 bg-white">
              <CardContent className="p-12 text-center">
                <CreditCard className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">Nenhum plano encontrado para os filtros atuais.</p>
              </CardContent>
            </Card>
          ) : filteredPlans.map((plan) => {
            const serviceMeta = getServiceMeta(plan.service || plan.tipo_plano);
            const ServiceIcon = serviceMeta.icon;
            const weekdays = normalizeWeekdays(plan.weekdays);

            return (
              <Card
                key={plan.id}
                className={`border-2 bg-white ${plan.status === "ativo" ?"border-green-200" : plan.status === "suspenso" ?"border-orange-200" : "border-gray-200 opacity-80"}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg text-gray-900">
                        {clientsById[getPlanClientId(plan)]?.nome_razao_social || plan.client_name || "-"}
                      </CardTitle>
                      <p className="mt-1 text-sm text-gray-500">
                        {dogsById[plan.dog_id]?.nome || "Cão não encontrado"}
                      </p>
                    </div>
                    <Badge className={getStatusBadgeClass(plan.status || "ativo")}>
                      {(STATUS_OPTIONS.find((item) => item.id === (plan.status || "ativo")) || { label: plan.status || "Ativo" }).label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className={`rounded-2xl border px-4 py-3 ${serviceMeta.theme}`}>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white/80 p-2">
                        <ServiceIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{serviceMeta.label}</p>
                        <p className="text-xs opacity-80">{serviceMeta.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-gray-500">Frequência</p>
                      <p className="mt-1 font-medium text-gray-900">{getFrequencyLabel(plan.frequency)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-gray-500">Vencimento</p>
                      <p className="mt-1 font-medium text-gray-900">Dia {plan.due_day || plan.renovacao_dia || "-"}</p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-gray-500">Valor mensal por cão</p>
                      <p className="mt-1 text-lg font-bold text-emerald-600">{formatCurrency(getMonthlyValue(plan))}</p>
                    </div>
                    <div className="col-span-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-gray-500">Início</p>
                      <p className="mt-1 font-medium text-gray-900">
                        {getPlanStartDate(plan)
                          ?format(parseDateOnly(getPlanStartDate(plan)), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {weekdays.length > 0 ?(
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Dias preferenciais</p>
                      <div className="flex flex-wrap gap-2">
                        {weekdays.map((weekday) => (
                          <Badge key={`${plan.id}-${weekday}`} variant="outline">
                            {WEEKDAYS.find((item) => item.id === weekday)?.label || weekday}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex gap-2 border-t pt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => runAutomations(plan)} disabled={isGenerating}>
                      <Zap className="mr-2 h-3 w-3" />
                      Gerar
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleStatus(plan)}>
                      {(plan.status || "ativo") === "ativo" ?<Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditModal(plan)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

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
                        onChange={(value) => setFormData((current) => ({ ...current, start_date: value }))}
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

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">5. Cobrança</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label>{packageDogCount > 1 ?"Valor mensal por cão *" : "Valor mensal *"}</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        step="0.01"
                        value={formData.monthly_value}
                        onChange={(event) => handleMonthlyValueChange(event.target.value)}
                        placeholder="0,00"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        {packageDogCount > 1
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

                    <div>
                      <Label>Status</Label>
                      <Select value={formData.status} onValueChange={(value) => setFormData((current) => ({ ...current, status: value }))}>
                        <SelectTrigger className="mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                              <Button type="button" variant="outline" size="sm" onClick={applySuggestedValue}>
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
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Valor por cão</span>
                      <span className="text-right font-medium text-emerald-600">
                        {formData.monthly_value ?formatCurrency(Number.parseFloat(String(formData.monthly_value).replace(",", ".")) || 0) : "-"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-500">Total do pacote</span>
                      <span className="text-right text-base font-bold text-emerald-600">
                        {formData.monthly_value ?formatCurrency(totalPackageValue) : "-"}
                      </span>
                    </div>
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
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Label>Observações</Label>
              <Textarea
                className="mt-2 min-h-24"
                value={formData.observacoes}
                onChange={(event) => setFormData((current) => ({ ...current, observacoes: event.target.value }))}
                placeholder="Anote combinados, exceções de agenda ou detalhes operacionais deste plano."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 text-white hover:bg-purple-700">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ?"Salvando..." : editingItem ?"Salvar plano" : `Criar ${packageDogCount} plano(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

