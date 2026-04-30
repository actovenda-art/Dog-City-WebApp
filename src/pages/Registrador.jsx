import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Appointment, AuditLog, Carteira, Checkin, ContaReceber, Dog, Notificacao, Orcamento, PerfilAcesso, Responsavel, ServiceProvided, ServiceProvider, ServiceProviderSchedule, TabelaPrecos, User } from "@/api/entities";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import {
  buildDogOwnerIndex,
  buildReceivablePayload,
  doesAppointmentOccurOnDate,
  filterAppointmentsByApprovedOrcamentos,
  getAppointmentDateKey,
  getAppointmentMeta,
  getAppointmentSourceLabel,
  getAppointmentStatus,
  getAppointmentTimeValue,
  getChargeTypeLabel,
  getCheckinMealRecords,
  getManualAppointmentClassificationMessage,
  getServiceLabel,
  MANUAL_REGISTRADOR_SERVICES,
  MEAL_CONSUMPTION_OPTIONS,
  safeJsonParse,
} from "@/lib/attendance";
import { normalizeCpfDigits } from "@/lib/cpf-validation";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
import { createPageUrl, isImagePreviewable, openImageViewer } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import PageSubTabs from "@/components/common/PageSubTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput, DateTimePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { BellRing, Building2, CalendarClock, Camera, CheckCircle2, Dog as DogIcon, LogIn, LogOut, MessageSquareText, Plus, RefreshCcw, Search, UserRound, UtensilsCrossed, X } from "lucide-react";
import { isCommercialProfile, isManagerialProfile, isOperationalProfile } from "@/lib/access-control";

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const BODY_CHECKUP_PARTS = [
  { key: "cabeca", label: "Cabeça" },
  { key: "orelhas", label: "Orelhas" },
  { key: "focinho", label: "Focinho" },
  { key: "pata_dianteira_esquerda", label: "Pata dianteira esquerda" },
  { key: "pata_dianteira_direita", label: "Pata dianteira direita" },
  { key: "pata_traseira_esquerda", label: "Pata traseira esquerda" },
  { key: "pata_traseira_direita", label: "Pata traseira direita" },
  { key: "rabo", label: "Rabo" },
  { key: "costas", label: "Costas" },
  { key: "barriga", label: "Barriga" },
];

function createEmptyBodyCheckup() {
  return BODY_CHECKUP_PARTS.reduce((accumulator, item) => {
    accumulator[item.key] = false;
    return accumulator;
  }, {});
}

const EMPTY_CHECKIN_FORM = {
  checkin_datetime: `${TODAY_KEY}T09:00:00`,
  monitor_id: "",
  monitor_signature_code: "",
  entregador_nome: "",
  observacoes: "",
  tarefa_lembrete: "",
  tarefa_lembrete_setor: "",
  tarefa_lembrete_horario: "",
  tarefa_lembrete_datetime: "",
  reminders: [],
  reminder_draft: null,
  tem_refeicao: false,
  refeicao_observacao: "",
  pertences_entrada_foto_url: "",
  body_checkup: createEmptyBodyCheckup(),
  body_checkup_observacao: "",
};

const EMPTY_CHECKOUT_FORM = {
  checkout_datetime: `${TODAY_KEY}T18:00:00`,
  monitor_id: "",
  monitor_signature_code: "",
  retirador_nome: "",
  observacoes: "",
  pertences_saida_foto_url: "",
};

const EMPTY_MEAL_FORM = {
  monitor_id: "",
  monitor_signature_code: "",
  percentual_consumido: "",
  observacoes: "",
  foto_refeicao_url: "",
};

const EMPTY_ADAPTACAO_REGISTRO_FORM = {
  monitor_id: "",
  monitor_signature_code: "",
  registro_datetime: nowDateTimeValue(),
  observacoes: "",
};

const EMPTY_PROVIDER_CHECKIN_FORM = {
  selfie_url: "",
  contest_reason: "",
  contest_time: "",
  contest_attachment_url: "",
};

const REMINDER_SECTOR_OPTIONS = [
  {
    value: "administracao",
    label: "Administração",
    description: "Avisa a equipe que cuida de alinhamentos, pendências e tratativas.",
    icon: Building2,
    activeClassName: "border-blue-300 bg-blue-50 text-blue-900",
    iconClassName: "bg-blue-100 text-blue-700",
  },
  {
    value: "operacao",
    label: "Operação",
    description: "Notifica quem acompanha a rotina do dia e a execução do atendimento.",
    icon: DogIcon,
    activeClassName: "border-emerald-300 bg-emerald-50 text-emerald-900",
    iconClassName: "bg-emerald-100 text-emerald-700",
  },
];

function nowDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function buildDateTimeForDate(dateKey, timeValue = "09:00") {
  if (!dateKey) return nowDateTimeValue();
  return `${dateKey}T${String(timeValue || "09:00").slice(0, 5)}:00`;
}

function addDays(dateKey, days) {
  const base = new Date(`${dateKey}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function formatDateLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`));
}

function formatTimeLabel(value) {
  return value ? String(value).slice(0, 5) : "";
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function sanitizeDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function getProviderDisplayName(provider) {
  return provider?.nome || provider?.full_name || provider?.nome_completo || "Funcionário";
}

function normalizeSignatureCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

function getProviderSignatureCode(provider) {
  return normalizeSignatureCode(provider?.signature_code);
}

function MonitorSignatureInput({ value, onChange, className = "" }) {
  return (
    <div className={className}>
      <Label>Verificação: Insira a sua senha</Label>
      <Input
        value={value}
        onChange={(event) => onChange(normalizeSignatureCode(event.target.value))}
        className="mt-2 font-mono tracking-[0.35em]"
        inputMode="numeric"
        maxLength={4}
        placeholder="4 dígitos"
        type="password"
      />
    </div>
  );
}

function formatCpf(value) {
  const digits = normalizeCpfDigits(value || "");
  if (digits.length !== 11) return value || "-";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function normalizeSearch(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDogDisplayName(dog) {
  return dog?.nome || dog?.nome_pet || "Cão";
}

function getDogBreed(dog) {
  return dog?.raca || "-";
}

function getAppointmentDisplayTime(appointment) {
  const startTime = getAppointmentTimeValue(appointment, "entrada");
  const endTime = getAppointmentTimeValue(appointment, "saida");
  if (startTime && endTime) return `${startTime} até ${endTime}`;
  return startTime || endTime || "Horário a confirmar";
}

function hydrateUserAccessProfile(user, profilesById) {
  const profile = profilesById[user?.access_profile_id] || {};
  return {
    ...user,
    access_profile_code: user?.access_profile_code || profile?.codigo || null,
    access_profile_name: user?.access_profile_name || profile?.nome || null,
    access_profile_permissions: Array.isArray(user?.access_profile_permissions) && user.access_profile_permissions.length > 0
      ? user.access_profile_permissions
      : (Array.isArray(profile?.permissoes) ? profile.permissoes : []),
  };
}

function getReminderSectorLabel(value) {
  if (value === "administracao") return "Administração";
  if (value === "operacao") return "Operação";
  return "Setor";
}

function getReminderDatePart(value) {
  return (value || "").slice(0, 10);
}

function getReminderTimePart(value) {
  return (value || "").slice(11, 16);
}

function getPersonFirstName(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0] || "Responsável";
}

function createEmptyReminderDraft() {
  return {
    id: `reminder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    setor: "",
    texto: "",
    horario: "",
    notificar_em: "",
    notified_at: null,
  };
}

function normalizeReminderItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: item?.id || createEmptyReminderDraft().id,
      setor: item?.setor || "",
      texto: item?.texto || "",
      horario: item?.horario || getReminderTimePart(item?.notificar_em),
      notificar_em: item?.notificar_em || "",
      notified_at: item?.notified_at || null,
    }))
    .filter((item) => item.texto || item.setor || item.horario || item.notificar_em);
}

function hasReminderDraftContent(draft) {
  if (!draft) return false;
  return Boolean(draft.texto || draft.setor || draft.horario || draft.notificar_em);
}

function getReminderSummary(reminder) {
  const sector = getReminderSectorLabel(reminder?.setor);
  const datePart = getReminderDatePart(reminder?.notificar_em);
  const timePart = reminder?.horario || getReminderTimePart(reminder?.notificar_em);
  const whenLabel = datePart
    ? `${formatDateLabel(datePart)} às ${formatTimeLabel(timePart)}`
    : formatTimeLabel(timePart);

  return {
    title: `Aviso para ${sector} adicionado ; ))`,
    subtitle: whenLabel ? `Disparo em ${whenLabel}` : "Disparo a definir",
  };
}

function getCheckinMeta(checkin) {
  return safeJsonParse(checkin?.metadata, {}) || {};
}

function getCheckinDateKey(checkin) {
  return (
    (checkin?.checkin_datetime || "").slice(0, 10) ||
    (checkin?.data_checkin || "").slice(0, 10) ||
    (checkin?.checkout_datetime || "").slice(0, 10) ||
    (checkin?.data_checkout || "").slice(0, 10) ||
    ""
  );
}

function getAdaptacaoProgressRecords(checkin) {
  const records = getCheckinMeta(checkin)?.adaptacao_registros;
  return Array.isArray(records) ? records : [];
}

function getBodyCheckupFromCheckin(checkin) {
  const metadata = getCheckinMeta(checkin);
  const raw = metadata?.body_checkup;
  const normalized = createEmptyBodyCheckup();

  if (raw && typeof raw === "object") {
    BODY_CHECKUP_PARTS.forEach((item) => {
      normalized[item.key] = raw[item.key] === true;
    });
  }

  return {
    checks: normalized,
    observacao: metadata?.body_checkup_observacao || "",
  };
}

function buildAppointmentSourceKey({ dogId, serviceType, dateKey, mode }) {
  return ["registrador", mode, dogId, serviceType, dateKey, Date.now()].filter(Boolean).join("|");
}

const OVERNIGHT_DEFAULT_PRICE = 60;

function isDayCareAppointment(appointment) {
  return appointment?.service_type === "day_care";
}

function isCancelledAppointment(appointment) {
  return ["cancelado", "desconsiderado", "faltou"].includes(String(appointment?.status || ""));
}

function resolveOvernightPrice(pricingRows = [], empresaId = null) {
  const scopedRows = (pricingRows || []).filter((row) => row?.ativo !== false && (!row?.empresa_id || row.empresa_id === empresaId));
  const matchingRow = scopedRows.find((row) => {
    const key = String(row?.config_key || row?.tipo || "").trim().toLowerCase();
    return key === "pernoite" || key === "pernoite_daycare";
  });
  return Number(matchingRow?.valor || 0) || OVERNIGHT_DEFAULT_PRICE;
}

function hasOvernightGenerated(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return Boolean(
    metadata?.overnight_generated_appointment_id
    || metadata?.overnight_requested_at
    || metadata?.overnight_link_source_appointment_id
  );
}

function getOvernightLinkedSourceAppointmentId(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return metadata?.overnight_link_source_appointment_id || "";
}

function getOvernightLinkedCheckinId(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return metadata?.overnight_link_checkin_id || "";
}

function getOvernightDeadline(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return metadata?.overnight_deadline || metadata?.overnight_until || "";
}

function isEligibleForOvernightAction({ appointment, checkin, now = new Date(), selectedDate }) {
  if (!appointment || !checkin) return false;
  if (!isDayCareAppointment(appointment)) return false;
  if (selectedDate !== TODAY_KEY) return false;
  if (isCancelledAppointment(appointment)) return false;
  if (checkin.checkout_datetime || checkin.data_checkout || checkin.status === "finalizado") return false;
  if (hasOvernightGenerated(appointment)) return false;

  const appointmentDate = getAppointmentDateKey(appointment);
  if (appointmentDate !== TODAY_KEY) return false;

  const threshold = new Date(`${appointmentDate}T19:00:00`);
  return now >= threshold;
}

function isOvernightExceeded({ appointment, checkin, now = new Date() }) {
  if (!appointment || !checkin) return false;
  if (checkin.checkout_datetime || checkin.data_checkout || checkin.status === "finalizado") return false;
  const deadline = getOvernightDeadline(appointment);
  if (!deadline) return false;
  return now >= new Date(deadline);
}

export default function Registrador() {
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [serviceProviders, setServiceProviders] = useState([]);
  const [serviceProviderSchedules, setServiceProviderSchedules] = useState([]);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [pricingRows, setPricingRows] = useState([]);
  const requestedDate = sanitizeDateKey(searchParams.get("date"));
  const highlightedAppointmentId = searchParams.get("appointmentId") || "";
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDate, setSelectedDate] = useState(requestedDate || TODAY_KEY);
  const [providerCpf, setProviderCpf] = useState("");
  const [petMode, setPetMode] = useState("pets");

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedCheckin, setSelectedCheckin] = useState(null);
  const [selectedDogForManual, setSelectedDogForManual] = useState(null);

  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [showMealDialog, setShowMealDialog] = useState(false);
  const [showAdaptacaoDialog, setShowAdaptacaoDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showProviderCheckinDialog, setShowProviderCheckinDialog] = useState(false);
  const [showProviderContestDialog, setShowProviderContestDialog] = useState(false);
  const [showOvernightDialog, setShowOvernightDialog] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);
  const [checkinDialogTab, setCheckinDialogTab] = useState("geral");

  const [checkinForm, setCheckinForm] = useState(EMPTY_CHECKIN_FORM);
  const [checkoutForm, setCheckoutForm] = useState(EMPTY_CHECKOUT_FORM);
  const [mealForm, setMealForm] = useState(EMPTY_MEAL_FORM);
  const [adaptacaoRegistroForm, setAdaptacaoRegistroForm] = useState(EMPTY_ADAPTACAO_REGISTRO_FORM);
  const [providerCheckinForm, setProviderCheckinForm] = useState(EMPTY_PROVIDER_CHECKIN_FORM);
  const [providerCheckinDraft, setProviderCheckinDraft] = useState(null);
  const [manualForm, setManualForm] = useState({
    dog_id: "",
    monitor_id: "",
    monitor_signature_code: "",
    service_type: "",
    observacoes: "",
  });
  const [notifyState, setNotifyState] = useState({ title: "", message: "" });
  const [checkinSharedSource, setCheckinSharedSource] = useState(null);
  const [overnightDraft, setOvernightDraft] = useState(null);

  const checkinPhotoInputRef = useRef(null);
  const checkoutPhotoInputRef = useRef(null);
  const mealFoodPhotoInputRef = useRef(null);
  const providerSelfieInputRef = useRef(null);
  const providerContestFileInputRef = useRef(null);
  const alertSyncRef = useRef(false);

  const ownerByDogId = useMemo(() => buildDogOwnerIndex(carteiras, responsaveis), [carteiras, responsaveis]);
  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const orcamentosById = useMemo(() => Object.fromEntries(orcamentos.map((orcamento) => [orcamento.id, orcamento])), [orcamentos]);
  const visibleAppointments = useMemo(
    () => filterAppointmentsByApprovedOrcamentos(appointments, orcamentosById),
    [appointments, orcamentosById]
  );
  const profilesById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const currentUserAccess = useMemo(
    () => hydrateUserAccessProfile(currentUser || {}, profilesById),
    [currentUser, profilesById]
  );
  const serviceProvidersById = useMemo(
    () => Object.fromEntries(serviceProviders.map((provider) => [provider.id, provider])),
    [serviceProviders]
  );
  const appointmentsById = useMemo(
    () => Object.fromEntries(appointments.map((appointment) => [appointment.id, appointment])),
    [appointments]
  );
  const checkinsById = useMemo(
    () => Object.fromEntries(checkins.map((checkin) => [checkin.id, checkin])),
    [checkins]
  );
  const overnightPrice = useMemo(
    () => resolveOvernightPrice(pricingRows, currentUser?.empresa_id || null),
    [pricingRows, currentUser]
  );
  const monitorProviderIds = useMemo(() => new Set(
    serviceProviderSchedules
      .filter((schedule) => schedule?.ativo !== false && schedule?.funcao === "monitor" && schedule?.serviceprovider_id)
      .map((schedule) => schedule.serviceprovider_id)
  ), [serviceProviderSchedules]);
  const monitors = useMemo(() => {
    const activeProviders = serviceProviders.filter((provider) => provider?.ativo !== false);
    if (monitorProviderIds.size === 0) return activeProviders;
    return activeProviders.filter((provider) => monitorProviderIds.has(provider.id));
  }, [monitorProviderIds, serviceProviders]);
  const selectedDateTitle = selectedDate === TODAY_KEY ? "Hoje" : formatDateLabel(selectedDate);
  const canAddManualAppointment = selectedDate === TODAY_KEY;
  const selectedAppointmentRequiresReminderDateTime = selectedAppointment?.service_type === "hospedagem";
  const reminderItems = Array.isArray(checkinForm.reminders) ? checkinForm.reminders : [];
  const activeReminderDraft = checkinForm.reminder_draft;
  const reminderDateValue = getReminderDatePart(activeReminderDraft?.notificar_em);
  const reminderTimeValue = selectedAppointmentRequiresReminderDateTime
    ? getReminderTimePart(activeReminderDraft?.notificar_em)
    : (activeReminderDraft?.horario || "");
  const reminderHasDraft = hasReminderDraftContent(activeReminderDraft);
  const reminderPreviewDate = selectedAppointmentRequiresReminderDateTime
    ? formatDateLabel(reminderDateValue)
    : formatDateLabel((checkinForm.checkin_datetime || "").slice(0, 10) || selectedDate || TODAY_KEY);
  const reminderPreviewTime = formatTimeLabel(reminderTimeValue);

  const activePetCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "pet" && item.status === "presente"),
    [checkins]
  );
  const activeProviderCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "prestador" && item.status === "presente"),
    [checkins]
  );
  const presentMonitorIds = useMemo(
    () => new Set(activeProviderCheckins.map((checkin) => checkin.user_id).filter(Boolean)),
    [activeProviderCheckins]
  );
  const directActiveCheckinByAppointmentId = useMemo(
    () => Object.fromEntries(activePetCheckins.filter((item) => item.appointment_id).map((item) => [item.appointment_id, item])),
    [activePetCheckins]
  );
  const activeCheckinByAppointmentId = useMemo(() => {
    const result = { ...directActiveCheckinByAppointmentId };
    appointments.forEach((appointment) => {
      if (!appointment?.id || result[appointment.id]) return;
      const linkedCheckinId = getOvernightLinkedCheckinId(appointment);
      const linkedCheckin = linkedCheckinId ? checkinsById[linkedCheckinId] : null;
      if (linkedCheckin?.status === "presente") {
        result[appointment.id] = linkedCheckin;
        return;
      }
      const sourceAppointmentId = getOvernightLinkedSourceAppointmentId(appointment);
      if (sourceAppointmentId && directActiveCheckinByAppointmentId[sourceAppointmentId]) {
        result[appointment.id] = directActiveCheckinByAppointmentId[sourceAppointmentId];
      }
    });
    return result;
  }, [appointments, checkinsById, directActiveCheckinByAppointmentId]);
  const finalizedCheckinByAppointmentId = useMemo(
    () => Object.fromEntries(
      checkins
        .filter((item) => item.tipo === "pet" && item.appointment_id && (item.status === "finalizado" || item.checkout_datetime || item.data_checkout))
        .map((item) => [item.appointment_id, item])
    ),
    [checkins]
  );
  const checkinsByDogDate = useMemo(() => {
    const grouped = {};
    checkins
      .filter((item) => item.tipo === "pet" && item.dog_id)
      .forEach((item) => {
        const dateKey = getCheckinDateKey(item);
        if (!dateKey) return;
        const key = `${item.dog_id}|${dateKey}`;
        grouped[key] = grouped[key] || [];
        grouped[key].push(item);
      });

    Object.values(grouped).forEach((items) => {
      items.sort((left, right) => {
        const leftValue = left.checkin_datetime || left.data_checkin || left.created_date || "";
        const rightValue = right.checkin_datetime || right.data_checkin || right.created_date || "";
        return String(rightValue).localeCompare(String(leftValue));
      });
    });

    return grouped;
  }, [checkins]);
  const presentProviders = useMemo(() => {
    return activeProviderCheckins
      .map((checkin) => ({ checkin, provider: serviceProvidersById[checkin.user_id] }))
      .filter((item) => item.provider);
  }, [activeProviderCheckins, serviceProvidersById]);

  const dayAppointments = useMemo(() => {
    return visibleAppointments
      .filter((appointment) => {
        if (!doesAppointmentOccurOnDate(appointment, selectedDate)) return false;
        if (appointment.status === "cancelado" || appointment.status === "desconsiderado") return false;
        if (selectedDate < TODAY_KEY) {
          return Boolean(finalizedCheckinByAppointmentId[appointment.id] || appointment.status === "finalizado");
        }
        return appointment.status !== "faltou";
      })
      .sort((left, right) => {
        const leftTime = getAppointmentTimeValue(left, "entrada") || "00:00";
        const rightTime = getAppointmentTimeValue(right, "entrada") || "00:00";
        return leftTime.localeCompare(rightTime);
      });
  }, [finalizedCheckinByAppointmentId, selectedDate, visibleAppointments]);

  const matchingDogIds = useMemo(() => {
    if (!searchTerm.trim()) return new Set(dogs.map((dog) => dog.id));
    const query = normalizeSearch(searchTerm);
    const result = new Set();
    dogs.forEach((dog) => {
      const owner = ownerByDogId[dog.id];
      const haystack = normalizeSearch(
        [
          getDogDisplayName(dog),
          getDogBreed(dog),
          owner?.nome,
          owner?.celular,
        ].join(" ")
      );
      if (haystack.includes(query)) result.add(dog.id);
    });
    return result;
  }, [dogs, ownerByDogId, searchTerm]);

  const filteredAppointments = useMemo(() => {
    return dayAppointments.filter((appointment) => matchingDogIds.has(appointment.dog_id));
  }, [dayAppointments, matchingDogIds]);

  const matchedDogsWithoutAppointments = useMemo(() => {
    if (!searchTerm.trim()) return [];
    if (!canAddManualAppointment) return [];
    return dogs.filter((dog) => {
      if (!matchingDogIds.has(dog.id)) return false;
      return !dayAppointments.some((appointment) => appointment.dog_id === dog.id);
    });
  }, [canAddManualAppointment, dayAppointments, dogs, matchingDogIds, searchTerm]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (requestedDate) {
      setSelectedDate(requestedDate);
    }
  }, [requestedDate]);

  useEffect(() => {
    if (isLoading || !users.length || (!visibleAppointments.length && !checkins.length)) return;
    syncCommercialAlerts();
  }, [checkins, isLoading, users, visibleAppointments]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [dogRows, carteiraRows, responsavelRows, appointmentRows, checkinRows, providerRows, scheduleRows, userRows, profileRows, pricingRowsResult, me] = await Promise.all([
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        Appointment.listAll("-created_date", 1000, 5000),
        Checkin.listAll("-created_date", 1000, 5000),
        ServiceProvider.listAll ? ServiceProvider.listAll("nome", 1000, 5000) : ServiceProvider.list("nome", 1000),
        ServiceProviderSchedule.listAll ? ServiceProviderSchedule.listAll("-created_date", 1000, 5000) : ServiceProviderSchedule.list("-created_date", 1000),
        User.list("-created_date", 500),
        PerfilAcesso.list("-created_date", 200),
        TabelaPrecos.list("-created_date", 1000),
        User.me(),
      ]);
      const orcamentoRows = await Orcamento.list("-created_date", 500);

      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setResponsaveis((responsavelRows || []).filter((item) => item.ativo !== false));
      setAppointments(appointmentRows || []);
      setOrcamentos(orcamentoRows || []);
      setCheckins(checkinRows || []);
      setServiceProviders((providerRows || []).filter((item) => item.ativo !== false));
      setServiceProviderSchedules((scheduleRows || []).filter((item) => item.ativo !== false));
      setUsers(userRows || []);
      setProfiles(profileRows || []);
      setPricingRows(pricingRowsResult || []);
      setCurrentUser(me || null);
    } catch (error) {
      console.error("Erro ao carregar registrador:", error);
      openNotify("Erro", "Não foi possível carregar o Registrador.");
    }
    setIsLoading(false);
  }

  async function syncCommercialAlerts() {
    if (alertSyncRef.current) return;
    alertSyncRef.current = true;

    try {
      const now = new Date();
      const updates = [];

      for (const appointment of visibleAppointments) {
        const dateKey = getAppointmentDateKey(appointment);
        if (!dateKey || dateKey >= TODAY_KEY) continue;
        if (["cancelado", "finalizado", "faltou", "desconsiderado"].includes(appointment.status)) continue;

        const finalizedAttendance = finalizedCheckinByAppointmentId[appointment.id];
        const openAttendance = activeCheckinByAppointmentId[appointment.id];
        if (finalizedAttendance) continue;

        const meta = getAppointmentMeta(appointment);
        if (meta?.overnight_requested_at && !finalizedAttendance) continue;
        if (meta.absence_notified_at) continue;

        const dog = dogsById[appointment.dog_id];
        await notifyCommercialUsers({
          appointment,
          dog,
          tipo: "agendamento_sem_presenca",
          titulo: "Este cão realmente faltou?",
          mensagem: openAttendance
            ? `${getDogDisplayName(dog)} ficou com check-in aberto em ${formatDateLabel(dateKey)}. Confirme se precisa registrar o check-out ou marcar falta.`
            : `${getDogDisplayName(dog)} ficou sem check-in/check-out em ${formatDateLabel(dateKey)}. Confirme se houve falta ou se o atendimento precisa ser preenchido.`,
          link: `${createPageUrl("Agendamentos")}?absenceReview=${appointment.id}`,
          payload: {
            absence_review_pending: true,
            service_type: appointment.service_type,
            checkin_id: openAttendance?.id || null,
          },
        });

        updates.push(
          Appointment.update(appointment.id, {
            metadata: {
              ...meta,
              absence_review_pending: true,
              absence_notified_at: now.toISOString(),
              checkin_id: openAttendance?.id || null,
              suggested_replacement_deadline: appointment.charge_type === "pacote" ? addDays(dateKey, 30) : null,
            },
          })
        );
      }

      for (const appointment of visibleAppointments) {
        const activeCheckin = activeCheckinByAppointmentId[appointment.id];
        if (!isEligibleForOvernightAction({ appointment, checkin: activeCheckin, now, selectedDate: TODAY_KEY })) continue;

        const metadata = getAppointmentMeta(appointment);
        if (!metadata?.overnight_alert_sent_at) {
          const dog = dogsById[appointment.dog_id];
          const dogProfileLink = dog ? `${createPageUrl("PerfilCao")}?id=${encodeURIComponent(getInternalEntityReference(dog))}` : createPageUrl("Registrador");
          const recipientCount = await notifyAllUnitUsers({
            appointment,
            tipo: "daycare_pernoite_pendente",
            titulo: "Day Care ainda sem check-out",
            mensagem: `${getDogDisplayName(dog)} segue presente após 19h. Avalie se o atendimento deve pernoitar.`,
            link: `${createPageUrl("Registrador")}?date=${encodeURIComponent(getAppointmentDateKey(appointment) || TODAY_KEY)}&appointmentId=${encodeURIComponent(appointment.id)}`,
            payload: {
              dog_profile_link: dogProfileLink,
              action: "pernoitar",
            },
          });

          updates.push(
            Appointment.update(appointment.id, {
              metadata: {
                ...metadata,
                overnight_alert_sent_at: now.toISOString(),
                overnight_alert_recipient_count: recipientCount,
              },
            })
          );

          await writeAuditLog({
            action: "daycare_pernoite_alerta_19h",
            entityType: "appointment",
            entityId: appointment.id,
            newValue: {
              overnight_alert_sent_at: now.toISOString(),
              recipient_count: recipientCount,
            },
            reason: "Cão presente após 19h sem check-out registrado.",
          });
        }

        if (!hasOvernightGenerated(appointment)) continue;
        if (!isOvernightExceeded({ appointment, checkin: activeCheckin, now })) continue;
        if (metadata?.overnight_exceeded_notified_at) continue;

        const dog = dogsById[appointment.dog_id];
        await notifyCommercialUsers({
          appointment,
          dog,
          tipo: "daycare_pernoite_excedido",
          titulo: "Pernoite excedeu 12h",
          mensagem: `${getDogDisplayName(dog)} ainda está presente após 12h do dia seguinte. Revise a cobrança adicional ou finalize o check-out.`,
          link: `${createPageUrl("Registrador")}?date=${encodeURIComponent(addDays(getAppointmentDateKey(appointment) || TODAY_KEY, 1))}&appointmentId=${encodeURIComponent(appointment.id)}`,
          payload: {
            overnight_exceeded: true,
            overnight_generated_appointment_id: metadata?.overnight_generated_appointment_id || null,
          },
        });

        updates.push(
          Appointment.update(appointment.id, {
            metadata: {
              ...metadata,
              overnight_exceeded_notified_at: now.toISOString(),
              overnight_exceeded_pending: true,
            },
          })
        );

        await writeAuditLog({
          action: "daycare_pernoite_alerta_12h",
          entityType: "appointment",
          entityId: appointment.id,
          newValue: {
            overnight_exceeded_notified_at: now.toISOString(),
          },
          reason: "Cão permaneceu presente após 12h do dia seguinte ao pernoite.",
        });
      }

      for (const checkin of checkins) {
        const checkinMeta = getCheckinMeta(checkin);
        const storedReminders = normalizeReminderItems(checkinMeta?.reminders);
        const reminderQueue = storedReminders.length > 0
          ? storedReminders
          : normalizeReminderItems(
            checkin?.tarefa_lembrete
              ? [{
                id: "legacy-reminder",
                texto: checkin.tarefa_lembrete,
                setor: checkin.tarefa_lembrete_setor || "operacao",
                horario: checkin.tarefa_lembrete_horario || "",
                notificar_em: checkin.tarefa_lembrete_notificar_em || "",
                notified_at: checkin.tarefa_lembrete_notificado_em || null,
              }]
              : []
          );
        if (reminderQueue.length === 0) continue;

        const appointment = visibleAppointments.find((item) => item.id === checkin.appointment_id);
        if (checkin.appointment_id && !appointment) continue;
        const dog = dogsById[checkin.dog_id];
        const targetDate = getAppointmentDateKey(appointment) || (checkin.checkin_datetime || "").slice(0, 10) || TODAY_KEY;
        const nextReminderState = [...reminderQueue];
        let hasReminderUpdate = false;

        for (let index = 0; index < nextReminderState.length; index += 1) {
          const reminder = nextReminderState[index];
          if (!reminder?.texto || !reminder?.notificar_em || reminder?.notified_at) continue;
          if (new Date(reminder.notificar_em) > now) continue;

          const recipientsCount = await notifySectorUsers({
            sector: reminder.setor || "operacao",
            appointment: appointment || {
              id: checkin.appointment_id,
              dog_id: checkin.dog_id,
              empresa_id: checkin.empresa_id,
              service_type: checkin.service_type,
            },
            dog,
            tipo: "lembrete_checkin",
            titulo: `Lembrete para ${getReminderSectorLabel(reminder.setor || "operacao")}`,
            mensagem: `${getDogDisplayName(dog)}: ${reminder.texto}`,
            link: `${createPageUrl("Registrador")}?date=${encodeURIComponent(targetDate)}&appointmentId=${encodeURIComponent(checkin.appointment_id || "")}`,
            payload: {
              checkin_id: checkin.id,
              reminder_text: reminder.texto,
              reminder_sector: reminder.setor || "operacao",
            },
          });

          if (recipientsCount > 0) {
            nextReminderState[index] = {
              ...reminder,
              notified_at: now.toISOString(),
            };
            hasReminderUpdate = true;
          }
        }

        if (hasReminderUpdate) {
          updates.push(
            Checkin.update(checkin.id, {
              tarefa_lembrete_notificado_em: nextReminderState[0]?.notified_at || now.toISOString(),
              metadata: {
                ...checkinMeta,
                reminders: nextReminderState,
              },
            })
          );
        }
      }

      if (updates.length > 0) {
        await Promise.all(updates);
        await loadData();
      }
    } catch (error) {
      console.error("Erro ao sincronizar alertas do Registrador:", error);
    } finally {
      alertSyncRef.current = false;
    }
  }

  function openNotify(title, message) {
    setNotifyState({ title, message });
    setShowNotifyDialog(true);
  }

  function findNextDayDayCareAppointment(sourceAppointment) {
    if (!sourceAppointment?.dog_id) return null;
    const nextDate = addDays(getAppointmentDateKey(sourceAppointment) || TODAY_KEY, 1);
    return visibleAppointments.find((appointment) => {
      if (appointment.id === sourceAppointment.id) return false;
      if (appointment.dog_id !== sourceAppointment.dog_id) return false;
      if (appointment.service_type !== "day_care") return false;
      if (isCancelledAppointment(appointment)) return false;
      return getAppointmentDateKey(appointment) === nextDate;
    }) || null;
  }

  function openOvernightDialogForAppointment(appointment) {
    const activeCheckin = activeCheckinByAppointmentId[appointment?.id];
    if (!appointment || !activeCheckin) return;
    const nextDayAppointment = findNextDayDayCareAppointment(appointment);
    setOvernightDraft({
      appointment_id: appointment.id,
      checkin_id: activeCheckin.id,
      link_next_day_appointment_id: nextDayAppointment?.id || "",
      link_to_next_day: Boolean(nextDayAppointment),
      next_day_appointment: nextDayAppointment,
      overnight_deadline: `${addDays(getAppointmentDateKey(appointment) || TODAY_KEY, 1)}T12:00:00`,
    });
    setShowOvernightDialog(true);
  }

  async function confirmOvernightForAppointment() {
    const appointment = appointmentsById[overnightDraft?.appointment_id];
    const checkin = checkinsById[overnightDraft?.checkin_id];
    if (!appointment || !checkin) {
      setShowOvernightDialog(false);
      setOvernightDraft(null);
      openNotify("Pernoite indisponível", "Não foi possível localizar o atendimento ativo para registrar o pernoite.");
      return;
    }

    setIsSaving(true);
    try {
      const nextDayAppointment = overnightDraft?.link_to_next_day
        ? appointmentsById[overnightDraft?.link_next_day_appointment_id]
        : null;
      const dog = dogsById[appointment.dog_id];
      const owner = ownerByDogId[appointment.dog_id] || {};
      const appointmentMeta = getAppointmentMeta(appointment);
      const checkinMeta = getCheckinMeta(checkin);
      const overnightDate = getAppointmentDateKey(appointment) || TODAY_KEY;
      const nextDate = addDays(overnightDate, 1);
      const overnightDeadline = overnightDraft?.overnight_deadline || `${nextDate}T12:00:00`;
      const overnightAppointmentPayload = {
        empresa_id: appointment.empresa_id || currentUser?.empresa_id || null,
        cliente_id: appointment.cliente_id || owner.cliente_id || null,
        dog_id: appointment.dog_id,
        service_type: "pernoite",
        status: "agendado",
        charge_type: "pendente_comercial",
        source_type: "daycare_pernoite",
        valor_previsto: overnightPrice,
        data_referencia: overnightDate,
        data_hora_entrada: `${overnightDate}T19:00:00`,
        data_hora_saida: `${nextDate}T12:00:00`,
        hora_entrada: "19:00",
        hora_saida: "12:00",
        observacoes: "Pernoite gerado automaticamente a partir do Day Care sem check-out até 19h.",
        source_key: `pernoite|${appointment.id}|${overnightDate}`,
        metadata: {
          overnight_source_appointment_id: appointment.id,
          overnight_source_checkin_id: checkin.id,
          overnight_linked_next_day_appointment_id: nextDayAppointment?.id || null,
          overnight_deadline: overnightDeadline,
          commercial_review_pending: true,
          owner_nome: owner.nome || "",
          owner_celular: owner.celular || "",
        },
      };

      const createdOvernightAppointment = await Appointment.create(overnightAppointmentPayload);

      await Appointment.update(appointment.id, {
        metadata: {
          ...appointmentMeta,
          overnight_requested_at: new Date().toISOString(),
          overnight_requested_by_user_id: currentUser?.id || null,
          overnight_until: overnightDeadline,
          overnight_price: overnightPrice,
          overnight_generated_appointment_id: createdOvernightAppointment?.id || null,
          overnight_linked_next_day_appointment_id: nextDayAppointment?.id || null,
          overnight_budget_pending: true,
        },
      });

      await Checkin.update(checkin.id, {
        metadata: {
          ...checkinMeta,
          overnight_requested_at: new Date().toISOString(),
          overnight_deadline: overnightDeadline,
          overnight_generated_appointment_id: createdOvernightAppointment?.id || null,
          overnight_linked_next_day_appointment_id: nextDayAppointment?.id || null,
        },
      });

      if (nextDayAppointment?.id) {
        await Appointment.update(nextDayAppointment.id, {
          metadata: {
            ...getAppointmentMeta(nextDayAppointment),
            overnight_link_source_appointment_id: appointment.id,
            overnight_link_checkin_id: checkin.id,
            overnight_generated_appointment_id: createdOvernightAppointment?.id || null,
            overnight_deadline: overnightDeadline,
          },
        });
      }

      const dogReference = dog ? getInternalEntityReference(dog) : appointment.dog_id;
      const dogProfileLink = `${createPageUrl("PerfilCao")}?id=${encodeURIComponent(dogReference)}`;
      const registradorLink = `${createPageUrl("Registrador")}?date=${encodeURIComponent(overnightDate)}&appointmentId=${encodeURIComponent(appointment.id)}`;
      await notifyCommercialUsers({
        appointment: createdOvernightAppointment,
        dog,
        tipo: "orcamento_pernoite_pendente",
        titulo: "Orçamento pendente de pernoite",
        mensagem: `${getDogDisplayName(dog)} entrou em pernoite. Revise o orçamento do atendimento e envie para aprovação do responsável.`,
        link: `${createPageUrl("Orcamentos")}?dogId=${encodeURIComponent(appointment.dog_id)}&service=pernoite&date=${encodeURIComponent(overnightDate)}&appointmentId=${encodeURIComponent(createdOvernightAppointment.id)}`,
        payload: {
          overnight_source_appointment_id: appointment.id,
          overnight_generated_appointment_id: createdOvernightAppointment?.id || null,
          dog_profile_link: dogProfileLink,
        },
      });

      await writeAuditLog({
        action: "daycare_pernoite_registrado",
        entityType: "appointment",
        entityId: appointment.id,
        oldValue: { metadata: appointmentMeta },
        newValue: {
          overnight_generated_appointment_id: createdOvernightAppointment?.id || null,
          overnight_linked_next_day_appointment_id: nextDayAppointment?.id || null,
          overnight_deadline: overnightDeadline,
          overnight_price: overnightPrice,
        },
        reason: nextDayAppointment?.id
          ? "Pernoite registrado com vínculo ao Day Care do dia seguinte."
          : "Pernoite registrado sem vínculo ao Day Care do dia seguinte.",
      });

      await writeAuditLog({
        action: "daycare_pernoite_orcamento_pendente",
        entityType: "appointment",
        entityId: createdOvernightAppointment?.id || appointment.id,
        newValue: {
          overnight_source_appointment_id: appointment.id,
          overnight_price: overnightPrice,
          overnight_deadline: overnightDeadline,
        },
        reason: "Orçamento pendente criado a partir do pernoite automático.",
      });

      await loadData();
      setShowOvernightDialog(false);
      setOvernightDraft(null);
      openNotify(
        "Pernoite registrado",
        nextDayAppointment?.id
          ? `${getDogDisplayName(dog)} seguirá presente até 12h e o Day Care de amanhã foi vinculado automaticamente.`
          : `${getDogDisplayName(dog)} seguirá presente até 12h. O comercial já recebeu a pendência de orçamento.`
      );
    } catch (error) {
      console.error("Erro ao registrar pernoite:", error);
      openNotify("Erro", error?.message || "Não foi possível registrar o pernoite.");
    } finally {
      setIsSaving(false);
    }
  }

  function clearReminderDraft() {
    setCheckinForm((current) => ({
      ...current,
      reminder_draft: null,
    }));
  }

  function openReminderDraft() {
    setCheckinForm((current) => ({
      ...current,
      reminder_draft: current.reminder_draft || createEmptyReminderDraft(),
    }));
  }

  function updateReminderDraft(patch) {
    setCheckinForm((current) => ({
      ...current,
      reminder_draft: {
        ...(current.reminder_draft || createEmptyReminderDraft()),
        ...patch,
      },
    }));
  }

  function updateReminderDate(dateValue) {
    setCheckinForm((current) => {
      const draft = current.reminder_draft || createEmptyReminderDraft();
      if (!dateValue) {
        return {
          ...current,
          reminder_draft: {
            ...draft,
            notificar_em: "",
          },
        };
      }
      const fallbackTime = getReminderTimePart(draft.notificar_em) || draft.horario || "09:00";
      return {
        ...current,
        reminder_draft: {
          ...draft,
          horario: fallbackTime,
          notificar_em: buildDateTimeForDate(dateValue, fallbackTime),
        },
      };
    });
  }

  function updateReminderTime(timeValue) {
    if (selectedAppointmentRequiresReminderDateTime) {
      setCheckinForm((current) => {
        const draft = current.reminder_draft || createEmptyReminderDraft();
        const dateValue = getReminderDatePart(draft.notificar_em)
          || (current.checkin_datetime || "").slice(0, 10)
          || selectedDate
          || TODAY_KEY;
        return {
          ...current,
          reminder_draft: {
            ...draft,
            horario: timeValue || "",
            notificar_em: timeValue ? buildDateTimeForDate(dateValue, timeValue) : "",
          },
        };
      });
      return;
    }

    setCheckinForm((current) => ({
      ...current,
      reminder_draft: {
        ...(current.reminder_draft || createEmptyReminderDraft()),
        horario: timeValue || "",
        notificar_em: timeValue
          ? buildDateTimeForDate((current.checkin_datetime || "").slice(0, 10) || selectedDate || TODAY_KEY, timeValue)
          : "",
      },
    }));
  }

  function saveReminderDraft() {
    const draft = checkinForm.reminder_draft;
    if (!draft) return;
    if (!draft.setor || !draft.texto) {
      openNotify("Campos obrigatórios", "Preencha o setor e a mensagem do aviso.");
      return;
    }
    if (selectedAppointmentRequiresReminderDateTime && !draft.notificar_em) {
      openNotify("Campos obrigatórios", "Informe a data e o horário do aviso para hospedagem.");
      return;
    }
    if (!selectedAppointmentRequiresReminderDateTime && !draft.horario) {
      openNotify("Campos obrigatórios", "Informe o horário do aviso.");
      return;
    }

    setCheckinForm((current) => {
      const reminderDate = selectedAppointmentRequiresReminderDateTime
        ? (draft.notificar_em || "")
        : buildDateTimeForDate(
          (current.checkin_datetime || "").slice(0, 10) || selectedDate || TODAY_KEY,
          draft.horario || "09:00"
        );
      const normalizedDraft = {
        ...draft,
        horario: selectedAppointmentRequiresReminderDateTime
          ? getReminderTimePart(reminderDate)
          : (draft.horario || ""),
        notificar_em: reminderDate,
        notified_at: null,
      };

      return {
        ...current,
        reminders: [...(current.reminders || []), normalizedDraft],
        reminder_draft: null,
      };
    });
  }

  function removeReminderItem(reminderId) {
    setCheckinForm((current) => ({
      ...current,
      reminders: (current.reminders || []).filter((item) => item.id !== reminderId),
    }));
  }

  function validateMonitorSignature(monitorId, signatureCode) {
    const monitor = serviceProvidersById[monitorId];
    if (!monitor) {
      openNotify("Verificação necessária", "Selecione o monitor responsável antes de confirmar.");
      return false;
    }

    const expectedCode = getProviderSignatureCode(monitor);
    if (!expectedCode) {
      openNotify("Código não cadastrado", "Este funcionário ainda não possui Código de Assinatura cadastrado em Escalação.");
      return false;
    }

    if (normalizeSignatureCode(signatureCode) !== expectedCode) {
      openNotify("Verificação inválida", "A senha informada não confere com o Código de Assinatura deste funcionário.");
      return false;
    }

    return true;
  }

  function findSharedDailyCheckin(appointment) {
    if (!appointment?.dog_id) return null;
    const appointmentDate = getAppointmentDateKey(appointment) || selectedDate || TODAY_KEY;
    const relatedCheckins = checkinsByDogDate[`${appointment.dog_id}|${appointmentDate}`] || [];
    return relatedCheckins.find((item) => item.appointment_id !== appointment.id) || null;
  }

  function resetCheckinDialog(appointment) {
    const owner = ownerByDogId[appointment?.dog_id] || {};
    const appointmentDate = getAppointmentDateKey(appointment) || selectedDate || TODAY_KEY;
    const appointmentTime = getAppointmentTimeValue(appointment, "entrada") || "09:00";
    const sharedDailyCheckin = findSharedDailyCheckin(appointment);
    const sharedBodyCheckup = getBodyCheckupFromCheckin(sharedDailyCheckin);
    setCheckinSharedSource(sharedDailyCheckin);
    setCheckinDialogTab("geral");
    setCheckinForm({
      ...EMPTY_CHECKIN_FORM,
      checkin_datetime: buildDateTimeForDate(appointmentDate, appointmentTime),
      entregador_nome: sharedDailyCheckin?.entregador_nome || owner.nome || "",
      tem_refeicao: Boolean(sharedDailyCheckin?.tem_refeicao),
      refeicao_observacao: sharedDailyCheckin?.tem_refeicao ? (sharedDailyCheckin?.refeicao_observacao || "") : "",
      pertences_entrada_foto_url: sharedDailyCheckin?.pertences_entrada_foto_url || "",
      body_checkup: sharedBodyCheckup.checks,
      body_checkup_observacao: sharedBodyCheckup.observacao,
    });
  }

  function resetCheckoutDialog(appointment, checkin) {
    const appointmentDate = getAppointmentDateKey(appointment) || selectedDate || TODAY_KEY;
    const appointmentTime = getAppointmentTimeValue(appointment, "saida") || "18:00";
    const meta = getCheckinMeta(checkin);
    setCheckoutForm({
      ...EMPTY_CHECKOUT_FORM,
      checkout_datetime: buildDateTimeForDate(appointmentDate, appointmentTime),
      retirador_nome: meta.retirador_nome || "",
    });
  }

  function resetMealDialog() {
    setMealForm(EMPTY_MEAL_FORM);
  }

  function resetAdaptacaoDialog() {
    setAdaptacaoRegistroForm({
      ...EMPTY_ADAPTACAO_REGISTRO_FORM,
      registro_datetime: nowDateTimeValue(),
    });
  }

  function openCheckinDialogForAppointment(appointment) {
    setSelectedAppointment(appointment);
    resetCheckinDialog(appointment);
    setShowCheckinDialog(true);
  }

  function openCheckoutDialogForCheckin(appointment, checkin) {
    setSelectedAppointment(appointment);
    setSelectedCheckin(checkin);
    resetCheckoutDialog(appointment, checkin);
    setShowCheckoutDialog(true);
  }

  function openMealDialogForCheckin(appointment, checkin) {
    setSelectedAppointment(appointment);
    setSelectedCheckin(checkin);
    resetMealDialog();
    setShowMealDialog(true);
  }

  function openAdaptacaoDialogForCheckin(appointment, checkin) {
    setSelectedAppointment(appointment);
    setSelectedCheckin(checkin);
    resetAdaptacaoDialog();
    setShowAdaptacaoDialog(true);
  }

  function openManualDialogForDog(dog = null) {
    if (!canAddManualAppointment) {
      openNotify("Data invalida", "A inclusao manual pelo Registrador fica disponível apenas para o dia de hoje.");
      return;
    }
    setSelectedDogForManual(dog || null);
    setManualForm({
      dog_id: dog?.id || "",
      monitor_id: "",
      monitor_signature_code: "",
      service_type: "",
      observacoes: "",
    });
    setShowManualDialog(true);
  }

  function resetProviderCheckinState() {
    setProviderCheckinDraft(null);
    setProviderCheckinForm(EMPTY_PROVIDER_CHECKIN_FORM);
    setShowProviderContestDialog(false);
  }

  async function uploadPrivateAsset(file, folder, fallbackName) {
    if (!file) return "";
    const empresaId = currentUser?.empresa_id || currentUser?.active_unit_id || "empresa-default";
    const safeName = `${Date.now()}_${(file.name || fallbackName || "arquivo").replace(/\s+/g, "_")}`;
    const path = `${empresaId}/registrador/${folder}/${safeName}`;
    const result = await UploadPrivateFile({ file, path });
    return result?.file_key || result?.path || "";
  }

  async function handleAttachmentPreview(path, title) {
    if (!path) return;
    try {
      const signed = await CreateFileSignedUrl({ path, expires: 3600 });
      const url = signed?.signedUrl || signed?.url;
      if (!url) return;
      if (isImagePreviewable(path) || isImagePreviewable(url)) {
        openImageViewer(url, title);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      openNotify("Erro", "Não foi possível abrir o anexo.");
    }
  }

  async function submitCheckin() {
    if (!selectedAppointment) return;
    if (!checkinForm.monitor_id || !checkinForm.entregador_nome || !checkinForm.pertences_entrada_foto_url) {
      openNotify("Campos obrigatórios", "Informe monitor, responsável pela entrega e foto dos pertences.");
      return;
    }
    if (!validateMonitorSignature(checkinForm.monitor_id, checkinForm.monitor_signature_code)) return;
    if (hasReminderDraftContent(checkinForm.reminder_draft)) {
      openNotify("Aviso em edição", "Salve ou descarte o lembrete aberto antes de confirmar o check-in.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[selectedAppointment.dog_id];
      const owner = ownerByDogId[selectedAppointment.dog_id] || {};
      const monitor = serviceProvidersById[checkinForm.monitor_id];
      const appointmentMeta = getAppointmentMeta(selectedAppointment);
      const normalizedReminders = normalizeReminderItems(checkinForm.reminders);
      const firstReminder = normalizedReminders[0] || null;
      const reminderNotificationAt = firstReminder?.notificar_em || null;
      const reminderHour = firstReminder?.horario || getReminderTimePart(firstReminder?.notificar_em);

      const createdCheckin = await Checkin.create({
        empresa_id: selectedAppointment.empresa_id || currentUser?.empresa_id || null,
        tipo: "pet",
        appointment_id: selectedAppointment.id,
        cliente_id: selectedAppointment.cliente_id || owner.cliente_id || null,
        dog_id: selectedAppointment.dog_id,
        dog_nome: getDogDisplayName(dog),
        dog_raca: getDogBreed(dog),
        responsavel_nome: owner.nome || appointmentMeta.owner_nome || "",
        entregador_nome: checkinForm.entregador_nome,
        monitor_id: checkinForm.monitor_id,
        checkin_monitor_nome: getProviderDisplayName(monitor),
        service_type: selectedAppointment.service_type,
        tipo_cobranca: selectedAppointment.charge_type || "avulso",
        pertences_entrada_foto_url: checkinForm.pertences_entrada_foto_url,
        checkin_datetime: checkinForm.checkin_datetime,
        data_checkin: checkinForm.checkin_datetime,
        tem_refeicao: checkinForm.tem_refeicao,
        refeicao_observacao: checkinForm.refeicao_observacao || "",
        tarefa_lembrete: firstReminder?.texto || "",
        tarefa_lembrete_setor: firstReminder?.setor || "",
        tarefa_lembrete_horario: reminderHour,
        tarefa_lembrete_notificar_em: reminderNotificationAt,
        tarefa_lembrete_notificado_em: null,
        observacoes: checkinForm.observacoes || "",
        source_type: selectedAppointment.source_type || "agendamento",
        status: "presente",
        metadata: {
          appointment_source_key: selectedAppointment.source_key || "",
          checkin_signature_verified_at: new Date().toISOString(),
          body_checkup: checkinForm.body_checkup || createEmptyBodyCheckup(),
          body_checkup_observacao: checkinForm.body_checkup_observacao || "",
          reminders: normalizedReminders,
        },
      });

      await Appointment.update(selectedAppointment.id, {
        status: "presente",
        linked_checkin_id: createdCheckin?.id || null,
      });

      await loadData();
      setShowCheckinDialog(false);
      setSelectedAppointment(null);
      setCheckinSharedSource(null);
      openNotify("Check-in realizado", `Check-in realizado com sucesso para ${getDogDisplayName(dog)}.`);
    } catch (error) {
      console.error("Erro ao realizar check-in:", error);
      openNotify("Erro", error?.message || "Não foi possível concluir o check-in.");
    }
    setIsSaving(false);
  }

  async function ensureUsageAndReceivable(appointment, checkin) {
    if (!appointment || !checkin) return;

    const dog = dogsById[appointment.dog_id];
    const owner = ownerByDogId[appointment.dog_id] || {};
    const usageSourceKey = ["uso", appointment.empresa_id, appointment.id, checkin.id].filter(Boolean).join("|");
    const existingUsage = await ServiceProvided.filter({ source_key: usageSourceKey }, "-created_date", 1);
    if (!existingUsage?.length) {
      await ServiceProvided.create({
        empresa_id: appointment.empresa_id || checkin.empresa_id || null,
        appointment_id: appointment.id,
        checkin_id: checkin.id,
        cliente_id: appointment.cliente_id || owner.cliente_id || null,
        dog_id: appointment.dog_id,
        service_type: appointment.service_type,
        responsavel_nome: owner.nome || checkin.responsavel_nome || "",
        data_utilizacao: getAppointmentDateKey(appointment) || TODAY_KEY,
        charge_type: appointment.charge_type || "avulso",
        source_type: appointment.source_type || "agendamento",
        preco: appointment.valor_previsto || 0,
        valor_cobrado: appointment.valor_previsto || 0,
        observacoes: checkin.observacoes || appointment.observacoes || "",
        source_key: usageSourceKey,
        metadata: {
          owner_nome: owner.nome || "",
          owner_celular: owner.celular || "",
          dog_nome: getDogDisplayName(dog),
        },
      });
    }

    if (!["avulso", "orcamento"].includes(appointment.charge_type)) return;

    const receivablePayload = buildReceivablePayload({
      appointment,
      checkin,
      owner,
      dueDate: getAppointmentDateKey(appointment) || TODAY_KEY,
      metadataPatch: {
        dog_nome: getDogDisplayName(dog),
      },
    });
    const existingReceivable = await ContaReceber.filter({ source_key: receivablePayload.source_key }, "-created_date", 1);
    if (!existingReceivable?.length) {
      await ContaReceber.create(receivablePayload);
    }
  }

  async function submitCheckout() {
    if (!selectedAppointment || !selectedCheckin) return;
    if (!checkoutForm.monitor_id || !checkoutForm.retirador_nome || !checkoutForm.pertences_saida_foto_url) {
      openNotify("Campos obrigatórios", "Informe quem buscou o cão, o monitor da entrega e a foto dos itens devolvidos.");
      return;
    }
    if (!validateMonitorSignature(checkoutForm.monitor_id, checkoutForm.monitor_signature_code)) return;

    setIsSaving(true);
    try {
      const monitor = serviceProvidersById[checkoutForm.monitor_id];
      const mergedObservacoes = [selectedCheckin.observacoes, checkoutForm.observacoes].filter(Boolean).join("\n");
      const currentMeta = getCheckinMeta(selectedCheckin);
      const selectedMeta = getAppointmentMeta(selectedAppointment);
      const relatedAppointmentIds = new Set([selectedAppointment.id]);
      const overnightSourceAppointmentId = selectedMeta?.overnight_link_source_appointment_id || currentMeta?.overnight_source_appointment_id;
      const overnightGeneratedAppointmentId = selectedMeta?.overnight_generated_appointment_id || currentMeta?.overnight_generated_appointment_id;

      if (overnightSourceAppointmentId) relatedAppointmentIds.add(overnightSourceAppointmentId);
      if (overnightGeneratedAppointmentId) relatedAppointmentIds.add(overnightGeneratedAppointmentId);

      if (selectedMeta?.overnight_linked_next_day_appointment_id) {
        relatedAppointmentIds.add(selectedMeta.overnight_linked_next_day_appointment_id);
      }
      if (currentMeta?.overnight_linked_next_day_appointment_id) {
        relatedAppointmentIds.add(currentMeta.overnight_linked_next_day_appointment_id);
      }

      await Checkin.update(selectedCheckin.id, {
        checkout_datetime: checkoutForm.checkout_datetime,
        data_checkout: checkoutForm.checkout_datetime,
        checkout_monitor_nome: getProviderDisplayName(monitor),
        pertences_saida_foto_url: checkoutForm.pertences_saida_foto_url,
        observacoes: mergedObservacoes,
        status: "finalizado",
        metadata: {
          ...currentMeta,
          retirador_nome: checkoutForm.retirador_nome,
          checkout_monitor_id: checkoutForm.monitor_id,
          checkout_signature_verified_at: new Date().toISOString(),
        },
      });

      await Promise.all([...relatedAppointmentIds].filter(Boolean).map((appointmentId) =>
        Appointment.update(appointmentId, {
          status: "finalizado",
          metadata: {
            ...getAppointmentMeta(appointmentsById[appointmentId]),
            overnight_exceeded_pending: false,
            overnight_checkout_completed_at: checkoutForm.checkout_datetime,
          },
        })
      ));

      await ensureUsageAndReceivable(selectedAppointment, {
        ...selectedCheckin,
        checkout_datetime: checkoutForm.checkout_datetime,
        observacoes: mergedObservacoes,
      });

      await writeAuditLog({
        action: "daycare_checkout_finalizado",
        entityType: "checkin",
        entityId: selectedCheckin.id,
        newValue: {
          checkout_datetime: checkoutForm.checkout_datetime,
          related_appointments: [...relatedAppointmentIds],
        },
        reason: "Check-out finalizado no Registrador.",
      });

      await loadData();
      setShowCheckoutDialog(false);
      openNotify("Check-out realizado", "Entrega registrada com sucesso.");
    } catch (error) {
      console.error("Erro ao realizar check-out:", error);
      openNotify("Erro", error?.message || "Não foi possível concluir o check-out.");
    }
    setIsSaving(false);
  }

  async function submitMeal() {
    if (!selectedCheckin) return;
    if (!mealForm.monitor_id || !mealForm.percentual_consumido || !mealForm.foto_refeicao_url) {
      openNotify("Campos obrigatórios", "Complete monitor, percentual consumido e foto da refeição.");
      return;
    }
    if (!validateMonitorSignature(mealForm.monitor_id, mealForm.monitor_signature_code)) return;

    setIsSaving(true);
    try {
      const monitor = serviceProvidersById[mealForm.monitor_id];
      const nextRecords = [
        ...getCheckinMealRecords(selectedCheckin),
        {
          created_at: new Date().toISOString(),
          monitor_id: mealForm.monitor_id,
          monitor_nome: getProviderDisplayName(monitor),
          percentual_consumido: mealForm.percentual_consumido,
          observacoes: mealForm.observacoes || "",
          foto_refeicao_url: mealForm.foto_refeicao_url,
          signature_verified_at: new Date().toISOString(),
        },
      ];

      await Checkin.update(selectedCheckin.id, {
        refeicao_registros: nextRecords,
      });

      await loadData();
      setShowMealDialog(false);
      openNotify("Refeição registrada", "A refeição foi registrada com sucesso.");
    } catch (error) {
      console.error("Erro ao registrar refeição:", error);
      openNotify("Erro", error?.message || "Não foi possível registrar a refeição.");
    }
    setIsSaving(false);
  }

  async function submitAdaptacaoRegistro() {
    if (!selectedCheckin) return;
    if (!adaptacaoRegistroForm.monitor_id || !adaptacaoRegistroForm.observacoes.trim()) {
      openNotify("Campos obrigatórios", "Informe o monitor e descreva a evolução da adaptação.");
      return;
    }
    if (!validateMonitorSignature(adaptacaoRegistroForm.monitor_id, adaptacaoRegistroForm.monitor_signature_code)) return;

    setIsSaving(true);
    try {
      const monitor = serviceProvidersById[adaptacaoRegistroForm.monitor_id];
      const currentMeta = getCheckinMeta(selectedCheckin);
      const nextRecords = [
        ...getAdaptacaoProgressRecords(selectedCheckin),
        {
          created_at: new Date().toISOString(),
          registro_datetime: adaptacaoRegistroForm.registro_datetime || nowDateTimeValue(),
          monitor_id: adaptacaoRegistroForm.monitor_id,
          monitor_nome: getProviderDisplayName(monitor),
          observacoes: adaptacaoRegistroForm.observacoes.trim(),
          signature_verified_at: new Date().toISOString(),
        },
      ];

      await Checkin.update(selectedCheckin.id, {
        metadata: {
          ...currentMeta,
          adaptacao_registros: nextRecords,
        },
      });

      await loadData();
      setShowAdaptacaoDialog(false);
      openNotify("Registro adicionado", "A evolução da adaptação foi registrada com sucesso.");
    } catch (error) {
      console.error("Erro ao registrar adaptacao:", error);
      openNotify("Erro", error?.message || "Não foi possível salvar o registro da adaptação.");
    }
    setIsSaving(false);
  }

  async function notifyCommercialUsers({ appointment, dog, tipo, titulo, mensagem, link, payload = {} }) {
    const owner = ownerByDogId[appointment?.dog_id] || {};
    const commercialUsers = users.filter((user) => {
      if (user.active === false) return false;
      const hydratedUser = hydrateUserAccessProfile(user, profilesById);
      return isCommercialProfile(hydratedUser) || isManagerialProfile(hydratedUser);
    });
    if (!commercialUsers.length) return;

    for (const user of commercialUsers) {
      await Notificacao.create({
        empresa_id: appointment?.empresa_id || currentUser?.empresa_id || null,
        user_id: user.id,
        tipo,
        titulo,
        mensagem,
        link,
        lido: false,
        payload: {
          appointment_id: appointment?.id || null,
          dog_id: appointment?.dog_id || null,
          owner_nome: owner.nome || "",
          ...payload,
        },
      });
    }
  }

  async function notifyAllUnitUsers({ appointment, tipo, titulo, mensagem, link, payload = {} }) {
    const recipients = users.filter((user) => user.active !== false);
    if (!recipients.length) return 0;

    await Promise.all(recipients.map((user) => Notificacao.create({
      empresa_id: appointment?.empresa_id || currentUser?.empresa_id || null,
      user_id: user.id,
      tipo,
      titulo,
      mensagem,
      link,
      lido: false,
      payload: {
        appointment_id: appointment?.id || null,
        dog_id: appointment?.dog_id || null,
        ...payload,
      },
    })));

    return recipients.length;
  }

  async function writeAuditLog({
    action,
    entityType,
    entityId,
    oldValue = null,
    newValue = null,
    reason = "",
  }) {
    if (!action || !entityType || !entityId) return;
    try {
      await AuditLog.create({
        empresa_id: currentUser?.empresa_id || null,
        user_id: currentUser?.id || null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        old_value: oldValue,
        new_value: newValue,
        reason: reason || null,
      });
    } catch (error) {
      console.error("Erro ao registrar auditoria do registrador:", error);
    }
  }

  async function notifySectorUsers({ sector, appointment, dog, tipo, titulo, mensagem, link, payload = {} }) {
    const owner = ownerByDogId[appointment?.dog_id] || {};
    const recipients = users.filter((user) => {
      if (user.active === false) return false;
      const hydratedUser = hydrateUserAccessProfile(user, profilesById);

      if (tipo === "lembrete_checkin") {
        return isCommercialProfile(hydratedUser) || isManagerialProfile(hydratedUser);
      }

      if (sector === "administracao") return isManagerialProfile(hydratedUser);
      if (sector === "operacao") return isOperationalProfile(hydratedUser);
      return false;
    });

    for (const user of recipients) {
      await Notificacao.create({
        empresa_id: appointment?.empresa_id || currentUser?.empresa_id || null,
        user_id: user.id,
        tipo,
        titulo,
        mensagem,
        link,
        lido: false,
        payload: {
          appointment_id: appointment?.id || null,
          dog_id: appointment?.dog_id || null,
          owner_nome: owner.nome || "",
          setor_destino: sector,
          ...payload,
        },
      });
    }

    return recipients.length;
  }

  async function createCommercialNotifications(appointment, dog) {
    await notifyCommercialUsers({
      appointment,
      dog,
      tipo: "agendamento_manual_pendente",
      titulo: "Agendamento manual aguardando classificação",
      mensagem: `${getManualAppointmentClassificationMessage(appointment)} ${getDogDisplayName(dog)} (${getServiceLabel(appointment.service_type)}) aguarda definição de cobrança.`,
      link: `${createPageUrl("Agendamentos")}?review=${appointment.id}`,
    });
  }

  async function submitManualAppointment() {
    if (!manualForm.dog_id || !manualForm.service_type || !manualForm.monitor_id) {
      openNotify("Campos obrigatórios", "Selecione o cão, o serviço e o monitor responsável.");
      return;
    }
    if (!validateMonitorSignature(manualForm.monitor_id, manualForm.monitor_signature_code)) return;
    if (!canAddManualAppointment) {
      openNotify("Data invalida", "A inclusao manual pelo Registrador fica disponível apenas para o dia de hoje.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[manualForm.dog_id];
      const owner = ownerByDogId[manualForm.dog_id] || {};
      const monitor = serviceProvidersById[manualForm.monitor_id];
      const now = buildDateTimeForDate(selectedDate || TODAY_KEY, "09:00");
      const appointment = await Appointment.create({
        empresa_id: currentUser?.empresa_id || null,
        cliente_id: owner.cliente_id || null,
        dog_id: manualForm.dog_id,
        service_type: manualForm.service_type,
        status: "agendado",
        charge_type: "pendente_comercial",
        source_type: "manual_registrador",
        valor_previsto: 0,
        data_referencia: selectedDate,
        data_hora_entrada: now,
        hora_entrada: now.slice(11, 16),
        observacoes: manualForm.observacoes || "",
        source_key: buildAppointmentSourceKey({
          dogId: manualForm.dog_id,
          serviceType: manualForm.service_type,
          dateKey: selectedDate,
          mode: "manual",
        }),
        metadata: {
          owner_nome: owner.nome || "",
          owner_celular: owner.celular || "",
          manual_monitor_id: manualForm.monitor_id,
          manual_monitor_nome: getProviderDisplayName(monitor),
          manual_monitor_signature_verified_at: new Date().toISOString(),
          created_from_registrador: true,
          commercial_review_pending: true,
        },
      });

      await createCommercialNotifications(appointment, dog);
      await loadData();
      setShowManualDialog(false);
      setSearchTerm(getDogDisplayName(dog));
      openNotify("Agendamento incluido", `${getDogDisplayName(dog)} foi incluido para atendimento em ${selectedDateTitle.toLowerCase()}.`);
    } catch (error) {
      console.error("Erro ao incluir agendamento manual:", error);
      openNotify("Erro", error?.message || "Não foi possível incluir o agendamento.");
    }
    setIsSaving(false);
  }

  async function handleProviderCheckin() {
    const digits = providerCpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      openNotify("CPF invalido", "Informe um CPF valido para o funcionário.");
      return;
    }

    setIsSaving(true);
    try {
      const provider = serviceProviders.find((item) => normalizeCpfDigits(item?.cpf) === digits);
      if (!provider) {
        openNotify("Funcionário não encontrado", "Não localizamos um funcionário da Escalação com esse CPF.");
        setIsSaving(false);
        return;
      }

      const alreadyPresent = activeProviderCheckins.some((checkin) => checkin.user_id === provider.id);
      if (alreadyPresent) {
        openNotify("Funcionário já presente", `${getProviderDisplayName(provider)} já está registrado.`);
        setIsSaving(false);
        return;
      }

      const now = nowDateTimeValue();
      setProviderCheckinDraft({
        provider,
        expectedCheckinAt: now,
      });
      setProviderCheckinForm({
        ...EMPTY_PROVIDER_CHECKIN_FORM,
        contest_time: now.slice(11, 16),
      });
      setShowProviderCheckinDialog(true);
    } catch (error) {
      console.error("Erro ao registrar funcionário:", error);
      openNotify("Erro", error?.message || "Não foi possível registrar o funcionário.");
    }
    setIsSaving(false);
  }

  async function handleProviderAssetUpload(file, target) {
    if (!file) return;
    try {
      setIsSaving(true);
      const folder = target === "contest_attachment" ? "prestadores-contestacao" : "prestadores-selfie";
      const path = await uploadPrivateAsset(file, folder, file.name);
      if (!path) {
        openNotify("Erro", "Não foi possível enviar o arquivo.");
        return;
      }
      if (target === "selfie") {
        setProviderCheckinForm((current) => ({ ...current, selfie_url: path }));
      } else if (target === "contest_attachment") {
        setProviderCheckinForm((current) => ({ ...current, contest_attachment_url: path }));
      }
    } catch (error) {
      console.error("Erro ao fazer upload do funcionário:", error);
      openNotify("Erro", "Não foi possível enviar o anexo.");
    }
    setIsSaving(false);
  }

  function saveProviderContest() {
    if (!providerCheckinForm.contest_reason.trim() || !providerCheckinForm.contest_time) {
      openNotify("Campos obrigatórios", "Informe o motivo e o horário desejado para contestar.");
      return;
    }
    setShowProviderContestDialog(false);
  }

  async function confirmProviderCheckin() {
    if (!providerCheckinDraft?.provider) return;
    if (!providerCheckinForm.selfie_url) {
      openNotify("Campos obrigatórios", "Envie a selfie antes de confirmar a entrada.");
      return;
    }

    setIsSaving(true);
    try {
      const now = nowDateTimeValue();
      const contestacaoHorario = providerCheckinForm.contest_reason.trim()
        ? {
            motivo: providerCheckinForm.contest_reason.trim(),
            horario_desejado: providerCheckinForm.contest_time || "",
            anexo_url: providerCheckinForm.contest_attachment_url || "",
            created_at: new Date().toISOString(),
          }
        : null;

      await Checkin.create({
        empresa_id: currentUser?.empresa_id || null,
        tipo: "prestador",
        user_id: providerCheckinDraft.provider.id,
        checkin_datetime: now,
        data_checkin: now,
        status: "presente",
        metadata: {
          provider_nome: getProviderDisplayName(providerCheckinDraft.provider),
          provider_cpf: normalizeCpfDigits(providerCheckinDraft.provider?.cpf || ""),
          selfie_url: providerCheckinForm.selfie_url,
          contestacao_horario: contestacaoHorario,
        },
      });

      setProviderCpf("");
      setShowProviderCheckinDialog(false);
      resetProviderCheckinState();
      await loadData();
      openNotify("Funcionário registrado", "Registro realizado com sucesso.");
    } catch (error) {
      console.error("Erro ao registrar funcionário:", error);
      openNotify("Erro", error?.message || "Não foi possível registrar o funcionário.");
    }
    setIsSaving(false);
  }

  async function handleProviderCheckout(checkin) {
    setIsSaving(true);
    try {
      const now = nowDateTimeValue();
      await Checkin.update(checkin.id, {
        checkout_datetime: now,
        data_checkout: now,
        status: "finalizado",
      });
      await loadData();
      openNotify("Saída registrada", "Check-out do funcionário concluído.");
    } catch (error) {
      console.error("Erro ao registrar saída do funcionário:", error);
      openNotify("Erro", error?.message || "Não foi possível concluir a saída.");
    }
    setIsSaving(false);
  }

  async function handleAttachmentUpload(event, target, folder) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsSaving(true);
      const path = await uploadPrivateAsset(file, folder, file.name);
      if (!path) {
        openNotify("Erro", "Não foi possível enviar o arquivo.");
        return;
      }
      if (target === "checkin") {
        setCheckinForm((current) => ({ ...current, pertences_entrada_foto_url: path }));
      } else if (target === "checkout") {
        setCheckoutForm((current) => ({ ...current, pertences_saida_foto_url: path }));
      } else if (target === "meal_food") {
        setMealForm((current) => ({ ...current, foto_refeicao_url: path }));
      }
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      openNotify("Erro", "Não foi possível enviar a imagem.");
    }
    setIsSaving(false);
    event.target.value = "";
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
          <p className="text-sm text-gray-600">Carregando Registrador...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-xl bg-green-100 p-2.5 sm:p-3">
              <DogIcon className="h-5 w-5 text-green-700 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-3xl">Registrador</h1>
              <p className="mt-1 text-sm text-gray-600">
                Presenças do dia, check-in, refeição, check-out e inclusões manuais.
              </p>
            </div>
          </div>
          <Badge className="w-fit bg-emerald-100 text-emerald-700">
            {activePetCheckins.length} presente(s) agora
          </Badge>
        </div>

        <Tabs value={petMode} onValueChange={setPetMode}>
          <PageSubTabs
            className="mb-6"
            items={[
              { value: "pets", label: "Pets" },
              { value: "providers", label: "Funcionários" },
            ]}
          />

          <TabsContent value="pets" className="space-y-4 sm:space-y-6">
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-2.5 sm:p-6">
                <SearchFiltersToolbar
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  searchPlaceholder="Buscar por nome do cão, raça ou responsável..."
                  hasActiveFilters={Boolean(searchTerm || selectedDate !== TODAY_KEY)}
                  searchClassName="min-w-0 max-w-[218px] sm:max-w-none"
                  searchInputClassName="h-[30px] pl-8 pr-2 text-[11px] sm:h-11 sm:pl-11 sm:pr-4 sm:text-base"
                  searchIconClassName="left-2.5 h-3.5 w-3.5 sm:left-4 sm:h-4 sm:w-4"
                  filtersClassName="gap-1.5 sm:gap-2"
                  filterButtonClassName="h-8 w-8 sm:h-11 sm:w-11"
                  filterIconClassName="h-3.5 w-3.5 sm:h-4 sm:w-4"
                  onClear={() => {
                    setSearchTerm("");
                    setSelectedDate(TODAY_KEY);
                  }}
                  filters={[
                    {
                      id: "date",
                      label: "Dia",
                      icon: CalendarClock,
                      active: selectedDate !== TODAY_KEY,
                      content: (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Dia dos agendamentos</p>
                          <DatePickerInput
                            value={selectedDate}
                            onChange={(value) => setSelectedDate(value || TODAY_KEY)}
                            placeholder="Selecione o dia"
                          />
                        </div>
                      ),
                    },
                  ]}
                  rightContent={(
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchTerm("");
                          loadData();
                        }}
                        className="h-8 w-8 rounded-full p-0 sm:hidden"
                        aria-label="Atualizar agendamentos"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearchTerm("");
                          loadData();
                        }}
                        className="hidden h-9 rounded-full px-3 text-xs sm:inline-flex sm:h-11 sm:px-5 sm:text-sm"
                      >
                        Atualizar
                      </Button>
                    </>
                  )}
                />
                <p className="mt-2 px-1 text-[10px] text-gray-500 sm:mt-3 sm:px-0 sm:text-xs">
                  <span className="sm:hidden">{selectedDateTitle}: {filteredAppointments.length} encontrado(s).</span>
                  <span className="hidden sm:inline">{selectedDateTitle} • {filteredAppointments.length} agendamento(s) para esta busca.</span>
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {filteredAppointments.map((appointment) => {
                const dog = dogsById[appointment.dog_id];
                const owner = ownerByDogId[appointment.dog_id] || {};
                const activeCheckin = activeCheckinByAppointmentId[appointment.id];
                const finalizedCheckin = finalizedCheckinByAppointmentId[appointment.id];
                const attendanceRecord = activeCheckin || finalizedCheckin || null;
                const status = getAppointmentStatus(appointment, activeCheckinByAppointmentId);
                const mealEnabled = activeCheckin?.tem_refeicao;
                const mealCount = getCheckinMealRecords(activeCheckin).length;
                const adaptacaoRegistros = getAdaptacaoProgressRecords(attendanceRecord);
                const highlighted = highlightedAppointmentId === appointment.id;
                const canRegisterOvernight = isEligibleForOvernightAction({
                  appointment,
                  checkin: activeCheckin,
                  now: new Date(),
                  selectedDate,
                });
                const overnightExceeded = isOvernightExceeded({
                  appointment,
                  checkin: activeCheckin,
                  now: new Date(),
                });

                return (
                  <Card key={appointment.id} className={`bg-white shadow-sm ${highlighted ? "border-blue-300 ring-2 ring-blue-200" : "border-gray-200"}`}>
                    <CardContent className="p-3 sm:p-5">
                      <div className="sm:hidden">
                        <div className="flex items-start gap-2.5">
                          {dog?.foto_url ? (
                            <img
                              src={dog.foto_url}
                              alt={getDogDisplayName(dog)}
                              className="h-10 w-10 rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100">
                              <DogIcon className="h-4.5 w-4.5 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">{getServiceLabel(appointment.service_type)}</p>
                            <p className="mt-0.5 truncate text-[15px] font-semibold leading-5 text-gray-900">{getDogDisplayName(dog)}</p>
                            <p className="mt-0.5 truncate text-[11px] text-gray-600">{getDogBreed(dog)} • {getPersonFirstName(owner.nome)}</p>
                            <p className="mt-1 text-[10px] font-medium text-gray-500">{getAppointmentDisplayTime(appointment)}</p>
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-col gap-1.5">
                          {!activeCheckin ? (
                            <Button onClick={() => openCheckinDialogForAppointment(appointment)} className="h-8.5 w-full bg-green-600 px-3 text-[11px] text-white hover:bg-green-700">
                              <LogIn className="mr-1.5 h-3.5 w-3.5" />
                              Check-in
                            </Button>
                          ) : (
                            <>
                              {canRegisterOvernight && (
                                <Button variant="outline" onClick={() => openOvernightDialogForAppointment(appointment)} className="h-8.5 w-full border-amber-200 bg-amber-50 px-3 text-[11px] text-amber-800 hover:bg-amber-100">
                                  Pernoitar
                                </Button>
                              )}
                              {appointment.service_type === "adaptacao" && (
                                <Button variant="outline" onClick={() => openAdaptacaoDialogForCheckin(appointment, activeCheckin)} className="h-8.5 w-full px-3 text-[11px]">
                                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                                  Adicionar registro{adaptacaoRegistros.length > 0 ? ` (${adaptacaoRegistros.length})` : ""}
                                </Button>
                              )}
                              {mealEnabled && (
                                <Button variant="outline" onClick={() => openMealDialogForCheckin(appointment, activeCheckin)} className="h-8.5 w-full px-3 text-[11px]">
                                  <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" />
                                  Refeição {mealCount > 0 ? `(${mealCount})` : ""}
                                </Button>
                              )}
                              <Button onClick={() => openCheckoutDialogForCheckin(appointment, activeCheckin)} className="h-8.5 w-full bg-slate-900 px-3 text-[11px] text-white hover:bg-slate-800">
                                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                                Check-out
                              </Button>
                            </>
                          )}
                        </div>
                        {overnightExceeded ? (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                            Presente após 12h do dia seguinte. O comercial precisa revisar a cobrança antes do fechamento do atendimento.
                          </div>
                        ) : null}
                      </div>

                      <div className="hidden sm:flex sm:flex-col sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          {dog?.foto_url ? (
                            <img
                              src={dog.foto_url}
                              alt={getDogDisplayName(dog)}
                              className="h-16 w-16 rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                              <DogIcon className="h-7 w-7 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-base font-semibold text-gray-900 sm:text-lg">{getDogDisplayName(dog)}</p>
                              <Badge variant="outline" className="text-[11px] sm:text-xs">{getServiceLabel(appointment.service_type)}</Badge>
                              <Badge className={`text-[11px] sm:text-xs ${status === "presente" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                                {status === "presente" ? "Presente" : "Agendado"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                              {getDogBreed(dog)} • {owner.nome || "Responsável não informado"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                              <span className="rounded-full bg-gray-100 px-2 py-1">
                                {TODAY_KEY === getAppointmentDateKey(appointment) ? "Hoje" : formatDateLabel(getAppointmentDateKey(appointment))}
                              </span>
                              <span className="rounded-full bg-gray-100 px-2 py-1">{getAppointmentDisplayTime(appointment)}</span>
                              <span className="rounded-full bg-gray-100 px-2 py-1">{getChargeTypeLabel(appointment.charge_type)}</span>
                              {appointment.source_type && (
                                <span className="rounded-full bg-gray-100 px-2 py-1">{getAppointmentSourceLabel(appointment)}</span>
                              )}
                            </div>
                            {appointment.observacoes && (
                              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                {appointment.observacoes}
                              </p>
                            )}
                            {overnightExceeded ? (
                              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                Este atendimento está em pernoite excedido após 12h. Revise a cobrança adicional antes do check-out.
                              </div>
                            ) : null}
                            {appointment.service_type === "adaptacao" && Boolean(getAppointmentTimeValue(appointment, "saida")) && (
                              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                                Término previsto da adaptação: <strong>{getAppointmentTimeValue(appointment, "saida")}</strong>
                              </div>
                            )}
                            {adaptacaoRegistros.length > 0 && (
                              <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                                <p className="text-sm font-medium text-sky-900">Registros da adaptação</p>
                                {adaptacaoRegistros.slice(-3).reverse().map((registro, registroIndex) => (
                                  <div key={`${registro.created_at || registro.registro_datetime || "registro"}-${registroIndex}`} className="text-sm text-sky-900">
                                    <p className="font-medium">
                                      {formatDateTime(registro.registro_datetime || registro.created_at)} {registro.monitor_nome ? `• ${registro.monitor_nome}` : ""}
                                    </p>
                                    <p className="text-sky-800">{registro.observacoes}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {attendanceRecord?.pertences_entrada_foto_url && (
                              <button
                                type="button"
                                onClick={() => handleAttachmentPreview(attendanceRecord.pertences_entrada_foto_url, "Pertences na entrada")}
                                className="mt-3 text-sm font-medium text-blue-600"
                              >
                                Ver foto dos pertences
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
                          {!activeCheckin ? (
                            <Button onClick={() => openCheckinDialogForAppointment(appointment)} className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
                              <LogIn className="mr-2 h-4 w-4" />
                              Check-in
                            </Button>
                          ) : (
                            <>
                              {canRegisterOvernight && (
                                <Button variant="outline" onClick={() => openOvernightDialogForAppointment(appointment)} className="w-full border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 sm:w-auto">
                                  Pernoitar
                                </Button>
                              )}
                              {appointment.service_type === "adaptacao" && (
                                <Button variant="outline" onClick={() => openAdaptacaoDialogForCheckin(appointment, activeCheckin)} className="w-full sm:w-auto">
                                  <Plus className="mr-2 h-4 w-4" />
                                  Adicionar registro{adaptacaoRegistros.length > 0 ? ` (${adaptacaoRegistros.length})` : ""}
                                </Button>
                              )}
                              {mealEnabled && (
                                <Button variant="outline" onClick={() => openMealDialogForCheckin(appointment, activeCheckin)} className="w-full sm:w-auto">
                                  <UtensilsCrossed className="mr-2 h-4 w-4" />
                                  Refeição {mealCount > 0 ? `(${mealCount})` : ""}
                                </Button>
                              )}
                              <Button onClick={() => openCheckoutDialogForCheckin(appointment, activeCheckin)} className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto">
                                <LogOut className="mr-2 h-4 w-4" />
                                Check-out
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {!filteredAppointments.length && !!searchTerm.trim() && !!matchedDogsWithoutAppointments.length && canAddManualAppointment && (
                <Card className="border-dashed border-blue-300 bg-blue-50">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-blue-900">Nenhum agendamento encontrado para {selectedDateTitle.toLowerCase()}.</p>
                        <p className="mt-1 text-sm text-blue-800">
                          Você pode incluir manualmente o atendimento e liberar a classificação comercial depois.
                        </p>
                      </div>
                      <Button onClick={() => openManualDialogForDog(matchedDogsWithoutAppointments[0])} className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Incluir manualmente
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {matchedDogsWithoutAppointments.map((dog) => (
                        <Badge key={dog.id} variant="outline">
                          {getDogDisplayName(dog)} • {getDogBreed(dog)}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!filteredAppointments.length && !searchTerm.trim() && (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-6 text-center sm:p-10">
                    <CalendarClock className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                    <p className="text-gray-500">
                      {selectedDate < TODAY_KEY
                        ? `Nenhum atendimento finalizado localizado para ${selectedDateTitle.toLowerCase()}.`
                        : `Nenhum agendamento localizado para ${selectedDateTitle.toLowerCase()}.`}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="providers" className="space-y-4 sm:space-y-6">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserRound className="h-5 w-5 text-orange-600" />
                  Registro de funcionários
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={providerCpf}
                    onChange={(event) => setProviderCpf(event.target.value)}
                    placeholder="CPF do funcionário"
                    className="h-10 text-[13px] sm:h-12 sm:text-sm"
                  />
                  <Button onClick={handleProviderCheckin} disabled={isSaving} className="h-10 w-full rounded-full bg-orange-600 text-xs text-white hover:bg-orange-700 sm:h-12 sm:w-auto sm:rounded-md sm:text-sm">
                    Registrar entrada
                  </Button>
                </div>

                <div className="space-y-3">
                  {presentProviders.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum funcionário presente agora.</p>
                  ) : (
                    presentProviders.map(({ checkin, provider }) => (
                      <div key={checkin.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{getProviderDisplayName(provider)}</p>
                          <p className="text-sm text-gray-500">CPF: {formatCpf(provider?.cpf || "")}</p>
                          <p className="text-sm text-gray-500">Entrada: {formatDateTime(checkin.checkin_datetime || checkin.data_checkin)}</p>
                        </div>
                        <Button variant="outline" onClick={() => handleProviderCheckout(checkin)} className="w-full sm:w-auto">
                          Registrar saida
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={showProviderCheckinDialog}
        onOpenChange={(open) => {
          setShowProviderCheckinDialog(open);
          if (!open) resetProviderCheckinState();
        }}
      >
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar entrada do funcionário</DialogTitle>
            <DialogDescription>
              O registro será salvo com o horário atual no momento da confirmação.
            </DialogDescription>
          </DialogHeader>

          {providerCheckinDraft?.provider ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="font-semibold text-orange-950">{getProviderDisplayName(providerCheckinDraft.provider)}</p>
                <p className="mt-1 text-sm text-orange-800">
                  Horário previsto: {formatDateTime(providerCheckinDraft.expectedCheckinAt)}
                </p>
              </div>

              <div>
                <Label>Selfie</Label>
                <input
                  ref={providerSelfieInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) => handleProviderAssetUpload(event.target.files?.[0], "selfie")}
                />
                <Button type="button" variant="outline" className="mt-2" onClick={() => providerSelfieInputRef.current?.click()}>
                  <Camera className="mr-2 h-4 w-4" />
                  Tirar selfie
                </Button>
                {providerCheckinForm.selfie_url ? (
                  <button type="button" onClick={() => handleAttachmentPreview(providerCheckinForm.selfie_url, "Selfie do funcionário")} className="mt-2 block text-sm text-blue-600">
                    Ver selfie enviada
                  </button>
                ) : null}
              </div>

              {providerCheckinForm.contest_reason ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="font-medium text-blue-950">Contestação de horário registrada</p>
                  <p className="mt-1 text-sm text-blue-800">Motivo: {providerCheckinForm.contest_reason}</p>
                  <p className="mt-1 text-sm text-blue-800">Horário desejado: {providerCheckinForm.contest_time || "-"}</p>
                  {providerCheckinForm.contest_attachment_url ? (
                    <button type="button" onClick={() => handleAttachmentPreview(providerCheckinForm.contest_attachment_url, "Comprovante da contestação")} className="mt-2 block text-sm text-blue-700">
                      Ver anexo da contestação
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setShowProviderContestDialog(true)} disabled={!providerCheckinDraft} className="w-full sm:w-auto">
              Contestar horário
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowProviderCheckinDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="button" onClick={confirmProviderCheckin} disabled={isSaving} className="w-full bg-orange-600 text-white hover:bg-orange-700 sm:w-auto">
              {isSaving ? "Confirmando..." : "Confirmar entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProviderContestDialog} onOpenChange={setShowProviderContestDialog}>
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Contestar horário</DialogTitle>
            <DialogDescription>
              Registre o motivo e o horário desejado para análise.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Motivo</Label>
              <Textarea
                value={providerCheckinForm.contest_reason}
                onChange={(event) => setProviderCheckinForm((current) => ({ ...current, contest_reason: event.target.value }))}
                className="mt-2"
                rows={4}
              />
            </div>

            <div>
              <Label>Horário desejado</Label>
              <div className="mt-2">
                <TimePickerInput
                  value={providerCheckinForm.contest_time}
                  onChange={(value) => setProviderCheckinForm((current) => ({ ...current, contest_time: value }))}
                  placeholder="Defina o horário"
                />
              </div>
            </div>

            <div>
              <Label>Anexo para comprovação</Label>
              <input
                ref={providerContestFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleProviderAssetUpload(event.target.files?.[0], "contest_attachment")}
              />
              <Button type="button" variant="outline" className="mt-2" onClick={() => providerContestFileInputRef.current?.click()}>
                <Plus className="mr-2 h-4 w-4" />
                Anexar comprovante
              </Button>
              {providerCheckinForm.contest_attachment_url ? (
                <button type="button" onClick={() => handleAttachmentPreview(providerCheckinForm.contest_attachment_url, "Comprovante da contestação")} className="mt-2 block text-sm text-blue-600">
                  Ver comprovante anexado
                </button>
              ) : null}
            </div>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setShowProviderContestDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="button" onClick={saveProviderContest} disabled={isSaving} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
              Salvar contestação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCheckinDialog}
        onOpenChange={(open) => {
          setShowCheckinDialog(open);
          if (!open) setCheckinSharedSource(null);
        }}
      >
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar check-in</DialogTitle>
            <DialogDescription>
              Confirme horário, monitor, pertences e observaçàµes do atendimento.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={checkinDialogTab} onValueChange={setCheckinDialogTab} className="py-2">
            <PageSubTabs
              className="mb-4"
              items={[
                { value: "geral", label: "Dados do check-in" },
                { value: "checkup", label: "Check-list corporal" },
              ]}
            />

            <TabsContent value="geral" className="mt-4 space-y-4">
              {checkinSharedSource && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Dados diários reaproveitados do primeiro check-in deste cão no dia:
                  responsável pela entrega, foto dos pertences e informação de refeição.
                </div>
              )}

              {selectedAppointment?.service_type === "adaptacao" && getAppointmentTimeValue(selectedAppointment, "saida") && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  Esta adaptação foi planejada para terminar à s <strong>{getAppointmentTimeValue(selectedAppointment, "saida")}</strong>.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Data e horário do check-in</Label>
                  <DateTimePickerInput value={checkinForm.checkin_datetime} onChange={(value) => setCheckinForm((current) => ({ ...current, checkin_datetime: value }))} />
                </div>
                <div>
                  <Label>Monitor responsável</Label>
                  <Select value={checkinForm.monitor_id} onValueChange={(value) => setCheckinForm((current) => ({ ...current, monitor_id: value, monitor_signature_code: "" }))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((monitor) => (
                        <SelectItem key={monitor.id} value={monitor.id}>
                          {getProviderDisplayName(monitor)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {checkinForm.monitor_id && !presentMonitorIds.has(checkinForm.monitor_id) ? (
                    <p className="mt-2 text-sm font-medium text-amber-700">Monitor ausente.⚠️</p>
                  ) : null}
                </div>
              </div>

              <MonitorSignatureInput
                value={checkinForm.monitor_signature_code}
                onChange={(value) => setCheckinForm((current) => ({ ...current, monitor_signature_code: value }))}
              />

              <div>
                <Label>Responsável pela entrega</Label>
                <Input value={checkinForm.entregador_nome} onChange={(event) => setCheckinForm((current) => ({ ...current, entregador_nome: event.target.value }))} className="mt-2" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Foto dos pertences</Label>
                  <input
                    ref={checkinPhotoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => handleAttachmentUpload(event, "checkin", "checkin")}
                  />
                  <Button type="button" variant="outline" onClick={() => checkinPhotoInputRef.current?.click()} className="w-full">
                    <Camera className="mr-2 h-4 w-4" />
                    Tirar foto dos pertences
                  </Button>
                  {checkinForm.pertences_entrada_foto_url && (
                    <button type="button" onClick={() => handleAttachmentPreview(checkinForm.pertences_entrada_foto_url, "Pertences na entrada")} className="text-sm text-blue-600">
                      Ver imagem enviada
                    </button>
                  )}
                </div>
                <div className="space-y-3 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Tem refeição?</p>
                      <p className="text-xs text-gray-500">Libera o registro posterior da refeição.</p>
                    </div>
                    <Switch checked={checkinForm.tem_refeicao} onCheckedChange={(checked) => setCheckinForm((current) => ({ ...current, tem_refeicao: checked }))} />
                  </div>
                  {checkinForm.tem_refeicao && (
                    <div>
                      <Label>Observação da refeição</Label>
                      <Textarea value={checkinForm.refeicao_observacao} onChange={(event) => setCheckinForm((current) => ({ ...current, refeicao_observacao: event.target.value }))} className="mt-2" rows={3} />
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-3.5 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                      <div className="rounded-2xl bg-violet-100 p-1.5 text-violet-700 sm:p-2">
                        <BellRing className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Lembretes e avisos</p>
                        <h3 className="text-sm font-bold text-slate-900 sm:text-lg">Adicione avisos quando precisar</h3>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-600 sm:mt-3 sm:text-sm sm:leading-6">
                      Ative só quando precisar. Depois de salvar, o aviso fica compacto e você pode incluir outro abaixo.
                    </p>
                  </div>

                  {!activeReminderDraft ? (
                    <Button type="button" variant="outline" onClick={openReminderDraft} className="h-9 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50 sm:h-10 sm:px-4 sm:text-sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar lembrete / aviso
                    </Button>
                  ) : null}
                </div>

                {reminderItems.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {reminderItems.map((reminder, reminderIndex) => {
                      const summary = getReminderSummary(reminder);
                      return (
                        <div key={reminder.id || reminderIndex} className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-emerald-700">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <p className="truncate text-xs font-semibold sm:text-sm">{summary.title}</p>
                            </div>
                            <p className="mt-1 text-[11px] text-emerald-800 sm:text-xs">{summary.subtitle}</p>
                            <p className="mt-1 line-clamp-2 text-[11px] text-emerald-900 sm:text-xs">{reminder.texto}</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeReminderItem(reminder.id)} className="h-8 w-8 shrink-0 rounded-full text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {activeReminderDraft ? (
                  <div className="mt-4 rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_14px_38px_-30px_rgba(76,29,149,0.45)]">
                    <div className="grid gap-4">
                      <div>
                        <Label className="text-sm font-semibold text-slate-900">Quem deve ser acionado?</Label>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {REMINDER_SECTOR_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const isActive = activeReminderDraft?.setor === option.value;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => updateReminderDraft({ setor: option.value })}
                                className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                                  isActive
                                    ? option.activeClassName
                                    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-violet-50/60"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className={`rounded-2xl p-2 ${isActive ? option.iconClassName : "bg-white text-slate-500"}`}>
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="font-semibold">{option.label}</p>
                                    <p className="mt-1 text-xs leading-5 opacity-80">{option.description}</p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className={`grid gap-3 ${selectedAppointmentRequiresReminderDateTime ? "sm:grid-cols-[minmax(0,1fr)_180px]" : "sm:grid-cols-[minmax(0,1fr)_200px]"}`}>
                        {selectedAppointmentRequiresReminderDateTime ? (
                          <>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Data do lembrete</Label>
                              <DatePickerInput value={reminderDateValue} onChange={updateReminderDate} placeholder="Defina a data" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Horário do lembrete</Label>
                              <TimePickerInput value={reminderTimeValue} onChange={updateReminderTime} placeholder="Defina o horário" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                              <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-600">Disparo automático</p>
                              <p className="mt-1 text-sm font-semibold text-sky-900">No dia do atendimento: {formatDateLabel((checkinForm.checkin_datetime || "").slice(0, 10) || selectedDate || TODAY_KEY)}</p>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Horário do lembrete</Label>
                              <TimePickerInput value={reminderTimeValue} onChange={updateReminderTime} placeholder="Defina o horário" />
                            </div>
                          </>
                        )}
                      </div>

                      <div>
                        <Label className="text-sm font-semibold text-slate-900">O que deve aparecer no aviso?</Label>
                        <Textarea
                          value={activeReminderDraft?.texto || ""}
                          onChange={(event) => updateReminderDraft({ texto: event.target.value })}
                          className="mt-2 min-h-[110px] border-slate-200 bg-white"
                          rows={4}
                          placeholder="Ex.: avisar comercial que o tutor pediu banho extra antes da saída."
                        />
                      </div>

                      <div className="rounded-3xl border border-violet-200 bg-slate-950 p-4 text-white shadow-[0_20px_50px_-28px_rgba(15,23,42,0.8)]">
                        <div className="flex items-center gap-3">
                          <div className="rounded-2xl bg-white/10 p-2 text-violet-200">
                            <MessageSquareText className="h-4 w-4 sm:h-5 sm:w-5" />
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-200/90">Prévia do aviso</p>
                            <p className="text-sm text-slate-300">Confira o resumo antes de salvar.</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 text-sm">
                          <p><span className="text-slate-400">Setor:</span> {activeReminderDraft?.setor ? getReminderSectorLabel(activeReminderDraft.setor) : "Escolha quem deve receber"}</p>
                          <p><span className="text-slate-400">Acionamento:</span> {reminderPreviewTime ? `${reminderPreviewDate || "Data a definir"} às ${reminderPreviewTime}` : "Defina data e horário do disparo"}</p>
                          <p className="text-slate-200">{activeReminderDraft?.texto || "Descreva aqui a instrução que precisa chegar para a equipe."}</p>
                        </div>
                      </div>

                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" onClick={clearReminderDraft} className="w-full sm:w-auto">
                          Cancelar aviso
                        </Button>
                        <Button type="button" onClick={saveReminderDraft} className="w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto">
                          Salvar aviso
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : reminderItems.length > 0 ? (
                  <Button type="button" variant="outline" onClick={openReminderDraft} className="mt-3 w-full border-dashed border-violet-200 text-violet-700 hover:bg-violet-50 sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar outro lembrete
                  </Button>
                ) : null}
              </div>
              <div>
                <Label>Observaçàµes gerais</Label>
                <Textarea value={checkinForm.observacoes} onChange={(event) => setCheckinForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
              </div>
            </TabsContent>

            <TabsContent value="checkup" className="mt-4 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Assinale no check-list os pontos do corpo que estão OK na entrada do cão.
              </div>

              {checkinSharedSource && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  O check-list corporal do primeiro check-in deste cão no dia foi reaproveitado e pode ser ajustado para este atendimento.
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">Check-up corporal</p>
                  <p className="text-sm text-gray-500">Marque rapidamente tudo o que estiver dentro do esperado.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCheckinForm((current) => ({
                      ...current,
                      body_checkup: BODY_CHECKUP_PARTS.reduce((accumulator, item) => {
                        accumulator[item.key] = true;
                        return accumulator;
                      }, {}),
                    }))
                  }
                >
                  Marcar tudo como OK
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {BODY_CHECKUP_PARTS.map((item) => {
                  const isChecked = Boolean(checkinForm.body_checkup?.[item.key]);

                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${isChecked ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white"}`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setCheckinForm((current) => ({
                            ...current,
                            body_checkup: {
                              ...(current.body_checkup || createEmptyBodyCheckup()),
                              [item.key]: checked === true,
                            },
                          }))
                        }
                      />
                      <div>
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className={`text-xs ${isChecked ? "text-emerald-700" : "text-gray-500"}`}>
                          {isChecked ? "Tudo OK" : "Marcar como OK"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <Label>Observaçàµes do check-up</Label>
                <Textarea
                  value={checkinForm.body_checkup_observacao}
                  onChange={(event) => setCheckinForm((current) => ({ ...current, body_checkup_observacao: event.target.value }))}
                  className="mt-2"
                  rows={4}
                  placeholder="Ex.: sensibilidade na pata traseira direita, leve vermelhidão nas orelhas, sem outras alterações visíveis."
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => { setShowCheckinDialog(false); setCheckinSharedSource(null); }} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitCheckin} disabled={isSaving} className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
              {isSaving ? "Salvando..." : "Confirmar check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar check-out</DialogTitle>
            <DialogDescription>
              Registre a entrega, a foto dos itens devolvidos e o monitor responsável.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Data e horário do check-out</Label>
                <DateTimePickerInput value={checkoutForm.checkout_datetime} onChange={(value) => setCheckoutForm((current) => ({ ...current, checkout_datetime: value }))} />
              </div>
              <div>
                <Label>Monitor da entrega</Label>
                <Select value={checkoutForm.monitor_id} onValueChange={(value) => setCheckoutForm((current) => ({ ...current, monitor_id: value, monitor_signature_code: "" }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {getProviderDisplayName(monitor)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {checkoutForm.monitor_id && !presentMonitorIds.has(checkoutForm.monitor_id) ? (
                  <p className="mt-2 text-sm font-medium text-amber-700">Monitor ausente.⚠️</p>
                ) : null}
              </div>
            </div>

            <MonitorSignatureInput
              value={checkoutForm.monitor_signature_code}
              onChange={(value) => setCheckoutForm((current) => ({ ...current, monitor_signature_code: value }))}
            />

            <div>
              <Label>Quem buscou?</Label>
              <Input
                value={checkoutForm.retirador_nome}
                onChange={(event) => setCheckoutForm((current) => ({ ...current, retirador_nome: event.target.value }))}
                className="mt-2"
              />
            </div>

            <div>
              <Label>Foto dos itens devolvidos</Label>
              <input
                ref={checkoutPhotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handleAttachmentUpload(event, "checkout", "checkout")}
              />
              <Button type="button" variant="outline" onClick={() => checkoutPhotoInputRef.current?.click()} className="mt-2 w-full">
                <Camera className="mr-2 h-4 w-4" />
                Tirar foto dos itens devolvidos
              </Button>
              {checkoutForm.pertences_saida_foto_url && (
            <button type="button" onClick={() => handleAttachmentPreview(checkoutForm.pertences_saida_foto_url, "Pertences na saída")} className="mt-2 text-sm text-blue-600">
                  Ver imagem enviada
                </button>
              )}
            </div>

            <div>
              <Label>Observaçàµes</Label>
              <Textarea value={checkoutForm.observacoes} onChange={(event) => setCheckoutForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitCheckout} disabled={isSaving} className="w-full bg-slate-900 text-white hover:bg-slate-800 sm:w-auto">
              {isSaving ? "Salvando..." : "Confirmar check-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMealDialog} onOpenChange={setShowMealDialog}>
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar refeição</DialogTitle>
            <DialogDescription>
              Tire a foto do pote, informe quanto o cão comeu e confirme a ação com o código do monitor responsável.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Monitor responsável</Label>
                <Select value={mealForm.monitor_id} onValueChange={(value) => setMealForm((current) => ({ ...current, monitor_id: value, monitor_signature_code: "" }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {getProviderDisplayName(monitor)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quanto comeu?</Label>
                <Select value={mealForm.percentual_consumido} onValueChange={(value) => setMealForm((current) => ({ ...current, percentual_consumido: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_CONSUMPTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <MonitorSignatureInput
              value={mealForm.monitor_signature_code}
              onChange={(value) => setMealForm((current) => ({ ...current, monitor_signature_code: value }))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Foto do pote</Label>
                <input
                  ref={mealFoodPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => handleAttachmentUpload(event, "meal_food", "refeicao")}
                />
                <Button type="button" variant="outline" onClick={() => mealFoodPhotoInputRef.current?.click()} className="mt-2 w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Tire foto do pote com a refeição
                </Button>
                {mealForm.foto_refeicao_url && (
                  <button type="button" onClick={() => handleAttachmentPreview(mealForm.foto_refeicao_url, "Foto da refeição")} className="mt-2 text-sm text-blue-600">
                    Ver imagem enviada
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>Observaçàµes</Label>
              <Textarea value={mealForm.observacoes} onChange={(event) => setMealForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowMealDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitMeal} disabled={isSaving} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
              {isSaving ? "Salvando..." : "Registrar refeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdaptacaoDialog} onOpenChange={setShowAdaptacaoDialog}>
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar registro da adaptação</DialogTitle>
            <DialogDescription>
              Registre a evolução observada durante o dia para este atendimento de adaptação.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Data e horário do registro</Label>
                <DateTimePickerInput
                  value={adaptacaoRegistroForm.registro_datetime}
                  onChange={(value) => setAdaptacaoRegistroForm((current) => ({ ...current, registro_datetime: value }))}
                />
              </div>
              <div>
                <Label>Monitor responsavel</Label>
                <Select
                  value={adaptacaoRegistroForm.monitor_id}
                  onValueChange={(value) => setAdaptacaoRegistroForm((current) => ({ ...current, monitor_id: value, monitor_signature_code: "" }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {getProviderDisplayName(monitor)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <MonitorSignatureInput
              value={adaptacaoRegistroForm.monitor_signature_code}
              onChange={(value) => setAdaptacaoRegistroForm((current) => ({ ...current, monitor_signature_code: value }))}
            />

            <div>
              <Label>Observacoes do progresso</Label>
              <Textarea
                value={adaptacaoRegistroForm.observacoes}
                onChange={(event) => setAdaptacaoRegistroForm((current) => ({ ...current, observacoes: event.target.value }))}
                className="mt-2"
                rows={4}
                placeholder="Ex.: ficou mais tranquilo apos 20 minutos, interagiu bem com o ambiente, ainda precisa de nova etapa"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowAdaptacaoDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitAdaptacaoRegistro} disabled={isSaving} className="w-full bg-sky-600 text-white hover:bg-sky-700 sm:w-auto">
              {isSaving ? "Salvando..." : "Salvar registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Incluir manualmente</DialogTitle>
              <DialogDescription>
                Selecione o cão e o serviço para incluir um agendamento avulso em {selectedDateTitle.toLowerCase()}.
              </DialogDescription>
            </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Cão</Label>
              <Select value={manualForm.dog_id} onValueChange={(value) => setManualForm((current) => ({ ...current, dog_id: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedDogForManual ? [selectedDogForManual] : dogs.filter((dog) => matchingDogIds.has(dog.id))).map((dog) => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {getDogDisplayName(dog)} - {getDogBreed(dog)} - {ownerByDogId[dog.id]?.nome || "Sem responsável"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Monitor responsável</Label>
              <Select value={manualForm.monitor_id} onValueChange={(value) => setManualForm((current) => ({ ...current, monitor_id: value, monitor_signature_code: "" }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {monitors.map((monitor) => (
                    <SelectItem key={monitor.id} value={monitor.id}>
                      {getProviderDisplayName(monitor)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <MonitorSignatureInput
              value={manualForm.monitor_signature_code}
              onChange={(value) => setManualForm((current) => ({ ...current, monitor_signature_code: value }))}
            />

            <div>
              <Label>Serviço</Label>
              <Select value={manualForm.service_type} onValueChange={(value) => setManualForm((current) => ({ ...current, service_type: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_REGISTRADOR_SERVICES.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Observaçàµes</Label>
              <Textarea value={manualForm.observacoes} onChange={(event) => setManualForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Após incluir, o Comercial recebe uma notificação para decidir se este atendimento entra em pacote ou vira orçamento avulso.
            </div>
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowManualDialog(false)} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={submitManualAppointment} disabled={isSaving} className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              {isSaving ? "Agendando..." : "Agendar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showOvernightDialog}
        onOpenChange={(open) => {
          setShowOvernightDialog(open);
          if (!open) setOvernightDraft(null);
        }}
      >
        <DialogContent className="max-h-[95vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar pernoite</DialogTitle>
            <DialogDescription>
              O cão seguirá presente até 12h do dia seguinte e o Comercial receberá a pendência de orçamento.
            </DialogDescription>
          </DialogHeader>

          {overnightDraft ? (
            <div className="grid gap-4 py-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-950">
                  Valor previsto: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(overnightPrice || 0)}
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Saída automática prevista para {formatDateTime(overnightDraft.overnight_deadline)}.
                </p>
              </div>

              {overnightDraft.next_day_appointment ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-blue-950">Existe Day Care para o dia seguinte</p>
                      <p className="mt-1 text-sm text-blue-800">
                        Se vincular, o cão continuará presente e não precisará de um novo check-in amanhã.
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(overnightDraft.link_to_next_day)}
                      onCheckedChange={(checked) => setOvernightDraft((current) => current ? { ...current, link_to_next_day: checked } : current)}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  Não encontramos um Day Care agendado para amanhã. O pernoite será registrado sem vínculo automático.
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowOvernightDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={confirmOvernightForAppointment} disabled={isSaving} className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto">
              {isSaving ? "Salvando..." : "Confirmar pernoite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-green-600" />
              {notifyState.title}
            </DialogTitle>
            <DialogDescription>{notifyState.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowNotifyDialog(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


