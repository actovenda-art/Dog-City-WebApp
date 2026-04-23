import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Notificacao, Orcamento, PerfilAcesso, Responsavel, ServiceProvided, User } from "@/api/entities";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import {
  buildDogOwnerIndex,
  buildReceivablePayload,
  doesAppointmentOccurOnDate,
  filterAppointmentsByApprovedOrcamentos,
  getAppointmentDateKey,
  getAppointmentMeta,
  getAppointmentStatus,
  getAppointmentTimeValue,
  getChargeTypeLabel,
  getCheckinMealRecords,
  getServiceLabel,
  MANUAL_REGISTRADOR_SERVICES,
  MEAL_CONSUMPTION_OPTIONS,
  safeJsonParse,
} from "@/lib/attendance";
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
import { BellRing, CalendarClock, Camera, Dog as DogIcon, LogIn, LogOut, Plus, Search, UserRound, UtensilsCrossed } from "lucide-react";

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
  entregador_nome: "",
  observacoes: "",
  tarefa_lembrete: "",
  tarefa_lembrete_setor: "",
  tarefa_lembrete_horario: "",
  tarefa_lembrete_datetime: "",
  tem_refeicao: false,
  refeicao_observacao: "",
  pertences_entrada_foto_url: "",
  body_checkup: createEmptyBodyCheckup(),
  body_checkup_observacao: "",
};

const EMPTY_CHECKOUT_FORM = {
  checkout_datetime: `${TODAY_KEY}T18:00:00`,
  monitor_id: "",
  retirador_nome: "",
  observacoes: "",
  pertences_saida_foto_url: "",
};

const EMPTY_MEAL_FORM = {
  monitor_id: "",
  percentual_consumido: "",
  observacoes: "",
  foto_refeicao_url: "",
  selfie_monitor_url: "",
};

const EMPTY_ADAPTACAO_REGISTRO_FORM = {
  monitor_id: "",
  registro_datetime: nowDateTimeValue(),
  observacoes: "",
};

const EMPTY_PROVIDER_CHECKIN_FORM = {
  selfie_url: "",
  contest_reason: "",
  contest_time: "",
  contest_attachment_url: "",
};

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

function isCommercialSalesUser(user, profilesById) {
  const profile = profilesById[user?.access_profile_id] || {};
  const haystack = normalizeSearch(
    [
      user?.profile,
      user?.company_role,
      profile?.codigo,
      profile?.nome,
      profile?.descricao,
    ].join(" ")
  );
  return haystack.includes("comercial") || haystack.includes("venda");
}

function getUserAccessHaystack(user, profilesById) {
  const profile = profilesById[user?.access_profile_id] || {};
  return normalizeSearch(
    [
      user?.profile,
      user?.company_role,
      profile?.codigo,
      profile?.nome,
      profile?.descricao,
    ].join(" ")
  );
}

function isAdministrationUser(user, profilesById) {
  const haystack = getUserAccessHaystack(user, profilesById);
  return ["administracao", "administrativo", "financeiro", "financas", "contabilidade", "backoffice", "adm"].some((token) => haystack.includes(token));
}

function isOperationsUser(user, profilesById) {
  const haystack = getUserAccessHaystack(user, profilesById);
  return ["operacao", "operacional", "monitor", "banho", "tosa", "hospedagem", "day care", "daycare", "adestramento"].some((token) => haystack.includes(token));
}

function getReminderSectorLabel(value) {
  if (value === "administracao") return "Administração";
  if (value === "operacao") return "Operação";
  return "Setor";
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
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
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
    service_type: "",
    observacoes: "",
  });
  const [notifyState, setNotifyState] = useState({ title: "", message: "" });
  const [checkinSharedSource, setCheckinSharedSource] = useState(null);

  const checkinPhotoInputRef = useRef(null);
  const checkoutPhotoInputRef = useRef(null);
  const mealFoodPhotoInputRef = useRef(null);
  const mealSelfieInputRef = useRef(null);
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
  const monitors = useMemo(() => users.filter((user) => user.active !== false), [users]);
  const selectedDateTitle = selectedDate === TODAY_KEY ? "Hoje" : formatDateLabel(selectedDate);
  const canAddManualAppointment = selectedDate === TODAY_KEY;
  const selectedAppointmentRequiresReminderDateTime = selectedAppointment?.service_type === "hospedagem";

  const activePetCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "pet" && item.status === "presente"),
    [checkins]
  );
  const activeProviderCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "prestador" && item.status === "presente"),
    [checkins]
  );
  const activeCheckinByAppointmentId = useMemo(
    () => Object.fromEntries(activePetCheckins.filter((item) => item.appointment_id).map((item) => [item.appointment_id, item])),
    [activePetCheckins]
  );
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
      .map((checkin) => ({ checkin, user: users.find((user) => user.id === checkin.user_id) }))
      .filter((item) => item.user);
  }, [activeProviderCheckins, users]);

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
      const [dogRows, carteiraRows, responsávelRows, appointmentRows, checkinRows, userRows, profileRows, me] = await Promise.all([
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        Appointment.listAll("-created_date", 1000, 5000),
        Checkin.listAll("-created_date", 1000, 5000),
        User.list("-created_date", 500),
        PerfilAcesso.list("-created_date", 200),
        User.me(),
      ]);
      const orcamentoRows = await Orcamento.list("-created_date", 500);

      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setResponsaveis((responsávelRows || []).filter((item) => item.ativo !== false));
      setAppointments(appointmentRows || []);
      setOrcamentos(orcamentoRows || []);
      setCheckins(checkinRows || []);
      setUsers(userRows || []);
      setProfiles(profileRows || []);
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

      for (const checkin of checkins) {
        if (!checkin?.tarefa_lembrete || !checkin?.tarefa_lembrete_notificar_em || checkin?.tarefa_lembrete_notificado_em) {
          continue;
        }
        if (new Date(checkin.tarefa_lembrete_notificar_em) > now) continue;

        const appointment = visibleAppointments.find((item) => item.id === checkin.appointment_id);
        if (checkin.appointment_id && !appointment) continue;
        const dog = dogsById[checkin.dog_id];
        const targetDate = getAppointmentDateKey(appointment) || (checkin.checkin_datetime || "").slice(0, 10) || TODAY_KEY;
        const recipientsCount = await notifySectorUsers({
          sector: checkin.tarefa_lembrete_setor || "operacao",
          appointment: appointment || {
            id: checkin.appointment_id,
            dog_id: checkin.dog_id,
            empresa_id: checkin.empresa_id,
            service_type: checkin.service_type,
          },
          dog,
          tipo: "lembrete_checkin",
          titulo: `Lembrete para ${getReminderSectorLabel(checkin.tarefa_lembrete_setor || "operacao")}`,
          mensagem: `${getDogDisplayName(dog)}: ${checkin.tarefa_lembrete}`,
          link: `${createPageUrl("Registrador")}?date=${encodeURIComponent(targetDate)}&appointmentId=${encodeURIComponent(checkin.appointment_id || "")}`,
          payload: {
            checkin_id: checkin.id,
            reminder_text: checkin.tarefa_lembrete,
            reminder_sector: checkin.tarefa_lembrete_setor || "operacao",
          },
        });

        if (recipientsCount > 0) {
          updates.push(
            Checkin.update(checkin.id, {
              tarefa_lembrete_notificado_em: now.toISOString(),
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
      monitor_id: currentUser?.id || "",
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
    if (checkinForm.tarefa_lembrete && !checkinForm.tarefa_lembrete_setor) {
      openNotify("Campos obrigatórios", "Selecione o setor que deve receber o lembrete.");
      return;
    }
    if (checkinForm.tarefa_lembrete) {
      if (selectedAppointmentRequiresReminderDateTime && !checkinForm.tarefa_lembrete_datetime) {
        openNotify("Campos obrigatórios", "Informe a data e o horário do lembrete para hospedagem.");
        return;
      }
      if (!selectedAppointmentRequiresReminderDateTime && !checkinForm.tarefa_lembrete_horario) {
        openNotify("Campos obrigatórios", "Informe o horário para notificar o lembrete.");
        return;
      }
    }
    if ((checkinForm.tarefa_lembrete_horario || checkinForm.tarefa_lembrete_datetime || checkinForm.tarefa_lembrete_setor) && !checkinForm.tarefa_lembrete) {
      openNotify("Campos obrigatórios", "Escreva o lembrete antes de definir data, horário ou setor.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[selectedAppointment.dog_id];
      const owner = ownerByDogId[selectedAppointment.dog_id] || {};
      const monitor = users.find((user) => user.id === checkinForm.monitor_id);
      const appointmentMeta = getAppointmentMeta(selectedAppointment);
      const reminderBaseDate = (checkinForm.checkin_datetime || "").slice(0, 10) || selectedDate || TODAY_KEY;
      const reminderNotificationAt = checkinForm.tarefa_lembrete
        ? (
          selectedAppointmentRequiresReminderDateTime
            ? (checkinForm.tarefa_lembrete_datetime || null)
            : (checkinForm.tarefa_lembrete_horario
              ? buildDateTimeForDate(reminderBaseDate, checkinForm.tarefa_lembrete_horario)
              : null)
        )
        : null;
      const reminderHour = checkinForm.tarefa_lembrete
        ? (
          selectedAppointmentRequiresReminderDateTime
            ? (checkinForm.tarefa_lembrete_datetime || "").slice(11, 16)
            : (checkinForm.tarefa_lembrete_horario || "")
        )
        : "";

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
        checkin_monitor_nome: monitor?.full_name || monitor?.nome_completo || "",
        service_type: selectedAppointment.service_type,
        tipo_cobranca: selectedAppointment.charge_type || "avulso",
        pertences_entrada_foto_url: checkinForm.pertences_entrada_foto_url,
        checkin_datetime: checkinForm.checkin_datetime,
        data_checkin: checkinForm.checkin_datetime,
        tem_refeicao: checkinForm.tem_refeicao,
        refeicao_observacao: checkinForm.refeicao_observacao || "",
        tarefa_lembrete: checkinForm.tarefa_lembrete || "",
        tarefa_lembrete_setor: checkinForm.tarefa_lembrete_setor || "",
        tarefa_lembrete_horario: reminderHour,
        tarefa_lembrete_notificar_em: reminderNotificationAt,
        tarefa_lembrete_notificado_em: null,
        observacoes: checkinForm.observacoes || "",
        source_type: selectedAppointment.source_type || "agendamento",
        status: "presente",
        metadata: {
          appointment_source_key: selectedAppointment.source_key || "",
          body_checkup: checkinForm.body_checkup || createEmptyBodyCheckup(),
          body_checkup_observacao: checkinForm.body_checkup_observacao || "",
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

    setIsSaving(true);
    try {
      const monitor = users.find((user) => user.id === checkoutForm.monitor_id);
      const mergedObservacoes = [selectedCheckin.observacoes, checkoutForm.observacoes].filter(Boolean).join("\n");
      const currentMeta = getCheckinMeta(selectedCheckin);

      await Checkin.update(selectedCheckin.id, {
        checkout_datetime: checkoutForm.checkout_datetime,
        data_checkout: checkoutForm.checkout_datetime,
        checkout_monitor_nome: monitor?.full_name || monitor?.nome_completo || "",
        pertences_saida_foto_url: checkoutForm.pertences_saida_foto_url,
        observacoes: mergedObservacoes,
        status: "finalizado",
        metadata: {
          ...currentMeta,
          retirador_nome: checkoutForm.retirador_nome,
          checkout_monitor_id: checkoutForm.monitor_id,
        },
      });

      await Appointment.update(selectedAppointment.id, {
        status: "finalizado",
      });

      await ensureUsageAndReceivable(selectedAppointment, {
        ...selectedCheckin,
        checkout_datetime: checkoutForm.checkout_datetime,
        observacoes: mergedObservacoes,
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
    if (!mealForm.monitor_id || !mealForm.percentual_consumido || !mealForm.foto_refeicao_url || !mealForm.selfie_monitor_url) {
      openNotify("Campos obrigatórios", "Complete monitor, percentual consumido, foto da refeição e selfie.");
      return;
    }

    setIsSaving(true);
    try {
      const monitor = users.find((user) => user.id === mealForm.monitor_id);
      const nextRecords = [
        ...getCheckinMealRecords(selectedCheckin),
        {
          created_at: new Date().toISOString(),
          monitor_id: mealForm.monitor_id,
          monitor_nome: monitor?.full_name || monitor?.nome_completo || "",
          percentual_consumido: mealForm.percentual_consumido,
          observacoes: mealForm.observacoes || "",
          foto_refeicao_url: mealForm.foto_refeicao_url,
          selfie_monitor_url: mealForm.selfie_monitor_url,
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

    setIsSaving(true);
    try {
      const monitor = users.find((user) => user.id === adaptacaoRegistroForm.monitor_id);
      const currentMeta = getCheckinMeta(selectedCheckin);
      const nextRecords = [
        ...getAdaptacaoProgressRecords(selectedCheckin),
        {
          created_at: new Date().toISOString(),
          registro_datetime: adaptacaoRegistroForm.registro_datetime || nowDateTimeValue(),
          monitor_id: adaptacaoRegistroForm.monitor_id,
          monitor_nome: monitor?.full_name || monitor?.nome_completo || "",
          observacoes: adaptacaoRegistroForm.observacoes.trim(),
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
    const commercialUsers = users.filter((user) => user.active !== false && isCommercialSalesUser(user, profilesById));
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

  async function notifySectorUsers({ sector, appointment, dog, tipo, titulo, mensagem, link, payload = {} }) {
    const owner = ownerByDogId[appointment?.dog_id] || {};
    const recipients = users.filter((user) => {
      if (user.active === false) return false;
      if (sector === "administracao") return isAdministrationUser(user, profilesById);
      if (sector === "operacao") return isOperationsUser(user, profilesById);
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
      mensagem: `${getDogDisplayName(dog)} (${getServiceLabel(appointment.service_type)}) precisa ser classificado como pacote ou avulso.`,
      link: `${createPageUrl("Agendamentos")}?review=${appointment.id}`,
    });
  }

  async function submitManualAppointment() {
    if (!manualForm.dog_id || !manualForm.service_type || !manualForm.monitor_id) {
      openNotify("Campos obrigatórios", "Selecione o cão, o serviço e o monitor responsável.");
      return;
    }
    if (!canAddManualAppointment) {
      openNotify("Data invalida", "A inclusao manual pelo Registrador fica disponível apenas para o dia de hoje.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[manualForm.dog_id];
      const owner = ownerByDogId[manualForm.dog_id] || {};
      const monitor = users.find((user) => user.id === manualForm.monitor_id);
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
          manual_monitor_nome: monitor?.full_name || monitor?.nome_completo || monitor?.email || "",
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
      const provider = users.find((user) => (user.cpf || "").replace(/\D/g, "") === digits);
      if (!provider) {
        openNotify("Funcionário não encontrado", "Não localizamos um usuário com esse CPF.");
        setIsSaving(false);
        return;
      }

      const alreadyPresent = activeProviderCheckins.some((checkin) => checkin.user_id === provider.id);
      if (alreadyPresent) {
        openNotify("Funcionário já presente", `${provider.full_name || provider.nome_completo} já está registrado.`);
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
      } else if (target === "meal_selfie") {
        setMealForm((current) => ({ ...current, selfie_monitor_url: path }));
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
            <div className="mt-1 rounded-xl bg-green-100 p-3">
              <DogIcon className="h-6 w-6 text-green-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Registrador</h1>
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
              { value: "providers", label: "Prestadores" },
            ]}
          />

          <TabsContent value="pets" className="space-y-6">
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <SearchFiltersToolbar
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  searchPlaceholder="Buscar por nome do cão, raça ou responsável..."
                  hasActiveFilters={Boolean(searchTerm || selectedDate !== TODAY_KEY)}
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm("");
                        loadData();
                      }}
                      className="h-11 rounded-full px-5"
                    >
                      Atualizar
                    </Button>
                  )}
                />
                <p className="mt-3 text-xs text-gray-500">
                  {selectedDateTitle}: {filteredAppointments.length} agendamento(s) encontrado(s) para a busca atual.
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

                return (
                  <Card key={appointment.id} className={`bg-white shadow-sm ${highlighted ? "border-blue-300 ring-2 ring-blue-200" : "border-gray-200"}`}>
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                              <p className="truncate text-lg font-semibold text-gray-900">{getDogDisplayName(dog)}</p>
                              <Badge variant="outline">{getServiceLabel(appointment.service_type)}</Badge>
                              <Badge className={status === "presente" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                                {status === "presente" ? "Presente" : "Agendado"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">
                              {getDogBreed(dog)} • {owner.nome || "Responsável não informado"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                              <span className="rounded-full bg-gray-100 px-2 py-1">
                                {TODAY_KEY === getAppointmentDateKey(appointment) ? "Hoje" : formatDateLabel(getAppointmentDateKey(appointment))}
                              </span>
                              <span className="rounded-full bg-gray-100 px-2 py-1">{getAppointmentDisplayTime(appointment)}</span>
                              <span className="rounded-full bg-gray-100 px-2 py-1">{getChargeTypeLabel(appointment.charge_type)}</span>
                              {appointment.source_type && (
                                <span className="rounded-full bg-gray-100 px-2 py-1">{appointment.source_type}</span>
                              )}
                            </div>
                            {appointment.observacoes && (
                              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                {appointment.observacoes}
                              </p>
                            )}
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

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          {!activeCheckin ? (
                            <Button onClick={() => openCheckinDialogForAppointment(appointment)} className="bg-green-600 text-white hover:bg-green-700">
                              <LogIn className="mr-2 h-4 w-4" />
                              Check-in
                            </Button>
                          ) : (
                            <>
                              {appointment.service_type === "adaptacao" && (
                                <Button variant="outline" onClick={() => openAdaptacaoDialogForCheckin(appointment, activeCheckin)}>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Adicionar registro{adaptacaoRegistros.length > 0 ? ` (${adaptacaoRegistros.length})` : ""}
                                </Button>
                              )}
                              {mealEnabled && (
                                <Button variant="outline" onClick={() => openMealDialogForCheckin(appointment, activeCheckin)}>
                                  <UtensilsCrossed className="mr-2 h-4 w-4" />
                  Refeição {mealCount > 0 ? `(${mealCount})` : ""}
                                </Button>
                              )}
                              <Button onClick={() => openCheckoutDialogForCheckin(appointment, activeCheckin)} className="bg-slate-900 text-white hover:bg-slate-800">
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
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-blue-900">Nenhum agendamento encontrado para {selectedDateTitle.toLowerCase()}.</p>
                        <p className="mt-1 text-sm text-blue-800">
                          Você pode incluir manualmente o atendimento e liberar a classificação comercial depois.
                        </p>
                      </div>
                      <Button onClick={() => openManualDialogForDog(matchedDogsWithoutAppointments[0])} className="bg-green-600 text-white hover:bg-green-700">
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
                  <CardContent className="p-10 text-center">
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

          <TabsContent value="providers" className="space-y-6">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserRound className="h-5 w-5 text-orange-600" />
                  Registro de funcionários
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={providerCpf}
                    onChange={(event) => setProviderCpf(event.target.value)}
                    placeholder="CPF do funcionário"
                    className="h-12"
                  />
                  <Button onClick={handleProviderCheckin} disabled={isSaving} className="h-12 bg-orange-600 text-white hover:bg-orange-700">
                    Registrar entrada
                  </Button>
                </div>

                <div className="space-y-3">
                  {presentProviders.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum funcionário presente agora.</p>
                  ) : (
                    presentProviders.map(({ checkin, user }) => (
                      <div key={checkin.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{user.full_name || user.nome_completo}</p>
                          <p className="text-sm text-gray-500">Entrada: {formatDateTime(checkin.checkin_datetime || checkin.data_checkin)}</p>
                        </div>
                        <Button variant="outline" onClick={() => handleProviderCheckout(checkin)}>
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
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar entrada do funcionário</DialogTitle>
            <DialogDescription>
              O registro será salvo com o horário atual no momento da confirmação.
            </DialogDescription>
          </DialogHeader>

          {providerCheckinDraft?.provider ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <p className="font-semibold text-orange-950">{providerCheckinDraft.provider.full_name || providerCheckinDraft.provider.nome_completo}</p>
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShowProviderContestDialog(true)} disabled={!providerCheckinDraft}>
              Contestar horário
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowProviderCheckinDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmProviderCheckin} disabled={isSaving} className="bg-orange-600 text-white hover:bg-orange-700">
              {isSaving ? "Confirmando..." : "Confirmar entrada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProviderContestDialog} onOpenChange={setShowProviderContestDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-lg">
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShowProviderContestDialog(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveProviderContest} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
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
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar check-in</DialogTitle>
            <DialogDescription>
              Confirme horário, monitor, pertences e observações do atendimento.
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
                  Esta adaptação foi planejada para terminar às <strong>{getAppointmentTimeValue(selectedAppointment, "saida")}</strong>.
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Data e horário do check-in</Label>
                  <DateTimePickerInput value={checkinForm.checkin_datetime} onChange={(value) => setCheckinForm((current) => ({ ...current, checkin_datetime: value }))} />
                </div>
                <div>
                  <Label>Monitor responsável</Label>
                  <Select value={checkinForm.monitor_id} onValueChange={(value) => setCheckinForm((current) => ({ ...current, monitor_id: value }))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {monitors.map((monitor) => (
                        <SelectItem key={monitor.id} value={monitor.id}>
                          {monitor.full_name || monitor.nome_completo || monitor.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

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

              <div className={`grid gap-4 ${selectedAppointmentRequiresReminderDateTime ? "sm:grid-cols-[minmax(0,1fr)_220px_260px]" : "sm:grid-cols-[minmax(0,1fr)_220px_220px]"}`}>
                <div>
                  <Label>Lembrete ou tarefa</Label>
                  <Textarea
                    value={checkinForm.tarefa_lembrete}
                    onChange={(event) => setCheckinForm((current) => ({ ...current, tarefa_lembrete: event.target.value }))}
                    className="mt-2"
                    rows={3}
                    placeholder="Ex.: avisar comercial sobre banho extra"
                  />
                </div>
                <div>
                  <Label>Setor a notificar</Label>
                  <div className="mt-2">
                    <Select
                      value={checkinForm.tarefa_lembrete_setor}
                      onValueChange={(value) => setCheckinForm((current) => ({ ...current, tarefa_lembrete_setor: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o setor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administracao">Administração</SelectItem>
                        <SelectItem value="operacao">Operação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    O lembrete será enviado para os usuários com perfis vinculados ao setor selecionado.
                  </p>
                </div>
                <div>
                  <Label>{selectedAppointmentRequiresReminderDateTime ? "Data e horário do lembrete" : "Horário do lembrete"}</Label>
                  <div className="mt-2">
                    {selectedAppointmentRequiresReminderDateTime ? (
                      <DateTimePickerInput
                        value={checkinForm.tarefa_lembrete_datetime}
                        onChange={(value) => setCheckinForm((current) => ({ ...current, tarefa_lembrete_datetime: value }))}
                        placeholder="Defina data e horário"
                      />
                    ) : (
                      <TimePickerInput
                        value={checkinForm.tarefa_lembrete_horario}
                        onChange={(value) => setCheckinForm((current) => ({ ...current, tarefa_lembrete_horario: value }))}
                        placeholder="Defina o horário"
                      />
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {selectedAppointmentRequiresReminderDateTime
                      ? "Na hospedagem, você escolhe a data e o horário exatos da notificação."
                      : "Nos demais serviços, o lembrete será enviado no mesmo dia do agendamento, no horário informado."}
                  </p>
                </div>
              </div>

              <div>
                <Label>Observações gerais</Label>
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
                <Label>Observações do check-up</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCheckinDialog(false); setCheckinSharedSource(null); }}>Cancelar</Button>
            <Button onClick={submitCheckin} disabled={isSaving} className="bg-green-600 text-white hover:bg-green-700">
              {isSaving ? "Salvando..." : "Confirmar check-in"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-2xl">
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
                <Select value={checkoutForm.monitor_id} onValueChange={(value) => setCheckoutForm((current) => ({ ...current, monitor_id: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {monitor.full_name || monitor.nome_completo || monitor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
              <Label>Observações</Label>
              <Textarea value={checkoutForm.observacoes} onChange={(event) => setCheckoutForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)}>Cancelar</Button>
            <Button onClick={submitCheckout} disabled={isSaving} className="bg-slate-900 text-white hover:bg-slate-800">
              {isSaving ? "Salvando..." : "Confirmar check-out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMealDialog} onOpenChange={setShowMealDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar refeição</DialogTitle>
            <DialogDescription>
              Tire a foto do pote, informe quanto o cão comeu e anexe a selfie do monitor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Monitor responsável</Label>
                <Select value={mealForm.monitor_id} onValueChange={(value) => setMealForm((current) => ({ ...current, monitor_id: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {monitor.full_name || monitor.nome_completo || monitor.email}
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
              <div>
                <Label>Selfie do monitor</Label>
                <input
                  ref={mealSelfieInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={(event) => handleAttachmentUpload(event, "meal_selfie", "selfie")}
                />
                <Button type="button" variant="outline" onClick={() => mealSelfieInputRef.current?.click()} className="mt-2 w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Tirar selfie do monitor
                </Button>
                {mealForm.selfie_monitor_url && (
                  <button type="button" onClick={() => handleAttachmentPreview(mealForm.selfie_monitor_url, "Selfie do monitor")} className="mt-2 text-sm text-blue-600">
                    Ver imagem enviada
                  </button>
                )}
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea value={mealForm.observacoes} onChange={(event) => setMealForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMealDialog(false)}>Cancelar</Button>
            <Button onClick={submitMeal} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              {isSaving ? "Salvando..." : "Registrar refeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdaptacaoDialog} onOpenChange={setShowAdaptacaoDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-2xl">
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
                  onValueChange={(value) => setAdaptacaoRegistroForm((current) => ({ ...current, monitor_id: value }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {monitors.map((monitor) => (
                      <SelectItem key={monitor.id} value={monitor.id}>
                        {monitor.full_name || monitor.nome_completo || monitor.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdaptacaoDialog(false)}>Cancelar</Button>
            <Button onClick={submitAdaptacaoRegistro} disabled={isSaving} className="bg-sky-600 text-white hover:bg-sky-700">
              {isSaving ? "Salvando..." : "Salvar registro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-xl">
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
              <Select value={manualForm.monitor_id} onValueChange={(value) => setManualForm((current) => ({ ...current, monitor_id: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {monitors.map((monitor) => (
                    <SelectItem key={monitor.id} value={monitor.id}>
                      {monitor.full_name || monitor.nome_completo || monitor.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <Label>Observações</Label>
              <Textarea value={manualForm.observacoes} onChange={(event) => setManualForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Após incluir, o Comercial recebe uma notificação para decidir se este atendimento entra em pacote ou vira orçamento avulso.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDialog(false)}>Cancelar</Button>
            <Button onClick={submitManualAppointment} disabled={isSaving} className="bg-green-600 text-white hover:bg-green-700">
              <Plus className="mr-2 h-4 w-4" />
              {isSaving ? "Agendando..." : "Agendar"}
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
