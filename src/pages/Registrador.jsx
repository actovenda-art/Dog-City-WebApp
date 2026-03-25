import React, { useEffect, useMemo, useRef, useState } from "react";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Notificacao, PerfilAcesso, Responsavel, ServiceProvided, User } from "@/api/entities";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import { buildDogOwnerIndex, buildReceivablePayload, getAppointmentDateKey, getAppointmentMeta, getAppointmentStatus, getAppointmentTimeValue, getChargeTypeLabel, getCheckinMealRecords, getServiceLabel, MANUAL_REGISTRADOR_SERVICES, MEAL_CONSUMPTION_OPTIONS } from "@/lib/attendance";
import { createPageUrl, isImagePreviewable, openImageViewer } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePickerInput } from "@/components/common/DateTimeInputs";
import { BellRing, CalendarClock, Camera, Dog as DogIcon, LogIn, LogOut, Plus, Search, UserRound, UtensilsCrossed } from "lucide-react";

const TODAY_KEY = new Date().toISOString().slice(0, 10);

const EMPTY_CHECKIN_FORM = {
  checkin_datetime: `${TODAY_KEY}T09:00:00`,
  monitor_id: "",
  entregador_nome: "",
  observacoes: "",
  tarefa_lembrete: "",
  tem_refeicao: false,
  refeicao_observacao: "",
  pertences_entrada_foto_url: "",
};

const EMPTY_CHECKOUT_FORM = {
  checkout_datetime: `${TODAY_KEY}T18:00:00`,
  monitor_id: "",
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

function nowDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function normalizeSearch(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getDogDisplayName(dog) {
  return dog?.nome || dog?.nome_pet || "Cao";
}

function getDogBreed(dog) {
  return dog?.raca || "-";
}

function getAppointmentDisplayTime(appointment) {
  const startTime = getAppointmentTimeValue(appointment, "entrada");
  const endTime = getAppointmentTimeValue(appointment, "saida");
  if (startTime && endTime) return `${startTime} ate ${endTime}`;
  return startTime || endTime || "Horario a confirmar";
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

function buildAppointmentSourceKey({ dogId, serviceType, dateKey, mode }) {
  return ["registrador", mode, dogId, serviceType, dateKey, Date.now()].filter(Boolean).join("|");
}

export default function Registrador() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [providerCpf, setProviderCpf] = useState("");
  const [petMode, setPetMode] = useState("pets");

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedCheckin, setSelectedCheckin] = useState(null);
  const [selectedDogForManual, setSelectedDogForManual] = useState(null);

  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [showMealDialog, setShowMealDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [showNotifyDialog, setShowNotifyDialog] = useState(false);

  const [checkinForm, setCheckinForm] = useState(EMPTY_CHECKIN_FORM);
  const [checkoutForm, setCheckoutForm] = useState(EMPTY_CHECKOUT_FORM);
  const [mealForm, setMealForm] = useState(EMPTY_MEAL_FORM);
  const [manualForm, setManualForm] = useState({
    dog_id: "",
    service_type: "",
    observacoes: "",
  });
  const [notifyState, setNotifyState] = useState({ title: "", message: "" });

  const checkinPhotoInputRef = useRef(null);
  const checkoutPhotoInputRef = useRef(null);
  const mealFoodPhotoInputRef = useRef(null);
  const mealSelfieInputRef = useRef(null);

  const ownerByDogId = useMemo(() => buildDogOwnerIndex(carteiras, responsaveis), [carteiras, responsaveis]);
  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const profilesById = useMemo(() => Object.fromEntries(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const monitors = useMemo(() => users.filter((user) => user.active !== false), [users]);

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
  const presentProviders = useMemo(() => {
    return activeProviderCheckins
      .map((checkin) => ({ checkin, user: users.find((user) => user.id === checkin.user_id) }))
      .filter((item) => item.user);
  }, [activeProviderCheckins, users]);

  const todayAppointments = useMemo(() => {
    return appointments
      .filter((appointment) => getAppointmentDateKey(appointment) === TODAY_KEY && appointment.status !== "cancelado")
      .sort((left, right) => {
        const leftTime = getAppointmentTimeValue(left, "entrada") || "00:00";
        const rightTime = getAppointmentTimeValue(right, "entrada") || "00:00";
        return leftTime.localeCompare(rightTime);
      });
  }, [appointments]);

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
    return todayAppointments.filter((appointment) => matchingDogIds.has(appointment.dog_id));
  }, [matchingDogIds, todayAppointments]);

  const matchedDogsWithoutAppointments = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return dogs.filter((dog) => {
      if (!matchingDogIds.has(dog.id)) return false;
      return !todayAppointments.some((appointment) => appointment.dog_id === dog.id);
    });
  }, [dogs, matchingDogIds, searchTerm, todayAppointments]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [dogRows, carteiraRows, responsavelRows, appointmentRows, checkinRows, userRows, profileRows, me] = await Promise.all([
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        Appointment.listAll("-created_date", 1000, 5000),
        Checkin.listAll("-created_date", 1000, 5000),
        User.list("-created_date", 500),
        PerfilAcesso.list("-created_date", 200),
        User.me(),
      ]);

      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setResponsaveis((responsavelRows || []).filter((item) => item.ativo !== false));
      setAppointments(appointmentRows || []);
      setCheckins(checkinRows || []);
      setUsers(userRows || []);
      setProfiles(profileRows || []);
      setCurrentUser(me || null);
    } catch (error) {
      console.error("Erro ao carregar registrador:", error);
      openNotify("Erro", "Nao foi possivel carregar o Registrador.");
    }
    setIsLoading(false);
  }

  function openNotify(title, message) {
    setNotifyState({ title, message });
    setShowNotifyDialog(true);
  }

  function resetCheckinDialog(appointment) {
    const owner = ownerByDogId[appointment?.dog_id] || {};
    setCheckinForm({
      ...EMPTY_CHECKIN_FORM,
      checkin_datetime: nowDateTimeValue(),
      entregador_nome: owner.nome || "",
    });
  }

  function resetCheckoutDialog() {
    setCheckoutForm({
      ...EMPTY_CHECKOUT_FORM,
      checkout_datetime: nowDateTimeValue(),
    });
  }

  function resetMealDialog() {
    setMealForm(EMPTY_MEAL_FORM);
  }

  function openCheckinDialogForAppointment(appointment) {
    setSelectedAppointment(appointment);
    resetCheckinDialog(appointment);
    setShowCheckinDialog(true);
  }

  function openCheckoutDialogForCheckin(appointment, checkin) {
    setSelectedAppointment(appointment);
    setSelectedCheckin(checkin);
    resetCheckoutDialog();
    setShowCheckoutDialog(true);
  }

  function openMealDialogForCheckin(appointment, checkin) {
    setSelectedAppointment(appointment);
    setSelectedCheckin(checkin);
    resetMealDialog();
    setShowMealDialog(true);
  }

  function openManualDialogForDog(dog = null) {
    setSelectedDogForManual(dog || null);
    setManualForm({
      dog_id: dog?.id || "",
      service_type: "",
      observacoes: "",
    });
    setShowManualDialog(true);
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
      openNotify("Erro", "Nao foi possivel abrir o anexo.");
    }
  }

  async function submitCheckin() {
    if (!selectedAppointment) return;
    if (!checkinForm.monitor_id || !checkinForm.entregador_nome || !checkinForm.pertences_entrada_foto_url) {
      openNotify("Campos obrigatorios", "Informe monitor, responsavel pela entrega e foto dos pertences.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[selectedAppointment.dog_id];
      const owner = ownerByDogId[selectedAppointment.dog_id] || {};
      const monitor = users.find((user) => user.id === checkinForm.monitor_id);
      const appointmentMeta = getAppointmentMeta(selectedAppointment);

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
        observacoes: checkinForm.observacoes || "",
        source_type: selectedAppointment.source_type || "agendamento",
        status: "presente",
        metadata: {
          appointment_source_key: selectedAppointment.source_key || "",
        },
      });

      await Appointment.update(selectedAppointment.id, {
        status: "presente",
        linked_checkin_id: createdCheckin?.id || null,
      });

      await loadData();
      setShowCheckinDialog(false);
      setSelectedAppointment(null);
      openNotify("Check-in realizado", `Check-in realizado com sucesso para ${getDogDisplayName(dog)}.`);
    } catch (error) {
      console.error("Erro ao realizar check-in:", error);
      openNotify("Erro", error?.message || "Nao foi possivel concluir o check-in.");
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
    if (!checkoutForm.monitor_id || !checkoutForm.pertences_saida_foto_url) {
      openNotify("Campos obrigatorios", "Informe o monitor da entrega e a foto dos itens devolvidos.");
      return;
    }

    setIsSaving(true);
    try {
      const monitor = users.find((user) => user.id === checkoutForm.monitor_id);
      const mergedObservacoes = [selectedCheckin.observacoes, checkoutForm.observacoes].filter(Boolean).join("\n");

      await Checkin.update(selectedCheckin.id, {
        checkout_datetime: checkoutForm.checkout_datetime,
        data_checkout: checkoutForm.checkout_datetime,
        checkout_monitor_nome: monitor?.full_name || monitor?.nome_completo || "",
        monitor_id: checkoutForm.monitor_id,
        pertences_saida_foto_url: checkoutForm.pertences_saida_foto_url,
        observacoes: mergedObservacoes,
        status: "finalizado",
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
      openNotify("Erro", error?.message || "Nao foi possivel concluir o check-out.");
    }
    setIsSaving(false);
  }

  async function submitMeal() {
    if (!selectedCheckin) return;
    if (!mealForm.monitor_id || !mealForm.percentual_consumido || !mealForm.foto_refeicao_url || !mealForm.selfie_monitor_url) {
      openNotify("Campos obrigatorios", "Complete monitor, percentual consumido, foto da refeicao e selfie.");
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
      openNotify("Refeicao registrada", "A refeicao foi registrada com sucesso.");
    } catch (error) {
      console.error("Erro ao registrar refeicao:", error);
      openNotify("Erro", error?.message || "Nao foi possivel registrar a refeicao.");
    }
    setIsSaving(false);
  }

  async function createCommercialNotifications(appointment, dog) {
    const owner = ownerByDogId[appointment.dog_id] || {};
    const commercialUsers = users.filter((user) => user.active !== false && isCommercialSalesUser(user, profilesById));
    if (!commercialUsers.length) return;

    for (const user of commercialUsers) {
      await Notificacao.create({
        empresa_id: appointment.empresa_id || currentUser?.empresa_id || null,
        user_id: user.id,
        tipo: "agendamento_manual_pendente",
        titulo: "Agendamento manual aguardando classificacao",
        mensagem: `${getDogDisplayName(dog)} (${getServiceLabel(appointment.service_type)}) precisa ser classificado como pacote ou avulso.`,
        link: `${createPageUrl("Agendamentos")}?review=${appointment.id}`,
        lido: false,
        payload: {
          appointment_id: appointment.id,
          dog_id: appointment.dog_id,
          owner_nome: owner.nome || "",
        },
      });
    }
  }

  async function submitManualAppointment() {
    if (!manualForm.dog_id || !manualForm.service_type) {
      openNotify("Campos obrigatorios", "Selecione o cao e o servico.");
      return;
    }

    setIsSaving(true);
    try {
      const dog = dogsById[manualForm.dog_id];
      const owner = ownerByDogId[manualForm.dog_id] || {};
      const now = nowDateTimeValue();
      const appointment = await Appointment.create({
        empresa_id: currentUser?.empresa_id || null,
        cliente_id: owner.cliente_id || null,
        dog_id: manualForm.dog_id,
        service_type: manualForm.service_type,
        status: "agendado",
        charge_type: "pendente_comercial",
        source_type: "manual_registrador",
        valor_previsto: 0,
        data_referencia: TODAY_KEY,
        data_hora_entrada: now,
        hora_entrada: now.slice(11, 16),
        observacoes: manualForm.observacoes || "",
        source_key: buildAppointmentSourceKey({
          dogId: manualForm.dog_id,
          serviceType: manualForm.service_type,
          dateKey: TODAY_KEY,
          mode: "manual",
        }),
        metadata: {
          owner_nome: owner.nome || "",
          owner_celular: owner.celular || "",
          created_from_registrador: true,
          commercial_review_pending: true,
        },
      });

      await createCommercialNotifications(appointment, dog);
      await loadData();
      setShowManualDialog(false);
      setSearchTerm(getDogDisplayName(dog));
      openNotify("Agendamento incluido", `${getDogDisplayName(dog)} foi incluido para atendimento hoje.`);
    } catch (error) {
      console.error("Erro ao incluir agendamento manual:", error);
      openNotify("Erro", error?.message || "Nao foi possivel incluir o agendamento.");
    }
    setIsSaving(false);
  }

  async function handleProviderCheckin() {
    const digits = providerCpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      openNotify("CPF invalido", "Informe um CPF valido para o prestador.");
      return;
    }

    setIsSaving(true);
    try {
      const provider = users.find((user) => (user.cpf || "").replace(/\D/g, "") === digits);
      if (!provider) {
        openNotify("Prestador nao encontrado", "Nao localizamos um usuario com esse CPF.");
        setIsSaving(false);
        return;
      }

      const alreadyPresent = activeProviderCheckins.some((checkin) => checkin.user_id === provider.id);
      if (alreadyPresent) {
        openNotify("Prestador ja presente", `${provider.full_name || provider.nome_completo} ja esta registrado.`);
        setIsSaving(false);
        return;
      }

      const now = nowDateTimeValue();
      await Checkin.create({
        empresa_id: currentUser?.empresa_id || null,
        tipo: "prestador",
        user_id: provider.id,
        checkin_datetime: now,
        data_checkin: now,
        status: "presente",
      });

      setProviderCpf("");
      await loadData();
      openNotify("Prestador registrado", "Registro realizado com sucesso.");
    } catch (error) {
      console.error("Erro ao registrar prestador:", error);
      openNotify("Erro", error?.message || "Nao foi possivel registrar o prestador.");
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
      openNotify("Saida registrada", "Check-out do prestador concluido.");
    } catch (error) {
      console.error("Erro ao registrar saida do prestador:", error);
      openNotify("Erro", error?.message || "Nao foi possivel concluir a saida.");
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
        openNotify("Erro", "Nao foi possivel enviar o arquivo.");
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
      openNotify("Erro", "Nao foi possivel enviar a imagem.");
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
                Presencas do dia, check-in, refeicao, check-out e inclusoes manuais.
              </p>
            </div>
          </div>
          <Badge className="w-fit bg-emerald-100 text-emerald-700">
            {activePetCheckins.length} presente(s) agora
          </Badge>
        </div>

        <Tabs value={petMode} onValueChange={setPetMode}>
          <TabsList className="mb-6 grid w-full grid-cols-2">
            <TabsTrigger value="pets">Pets</TabsTrigger>
            <TabsTrigger value="providers">Prestadores</TabsTrigger>
          </TabsList>

          <TabsContent value="pets" className="space-y-6">
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Buscar por nome do cao, raca ou responsavel..."
                      className="h-12 pl-10"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm("");
                      loadData();
                    }}
                    className="h-12"
                  >
                    Atualizar
                  </Button>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Hoje: {filteredAppointments.length} agendamento(s) encontrado(s) para a busca atual.
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              {filteredAppointments.map((appointment) => {
                const dog = dogsById[appointment.dog_id];
                const owner = ownerByDogId[appointment.dog_id] || {};
                const activeCheckin = activeCheckinByAppointmentId[appointment.id];
                const status = getAppointmentStatus(appointment, activeCheckinByAppointmentId);
                const mealEnabled = activeCheckin?.tem_refeicao;
                const mealCount = getCheckinMealRecords(activeCheckin).length;

                return (
                  <Card key={appointment.id} className="border-gray-200 bg-white shadow-sm">
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
                              {getDogBreed(dog)} • {owner.nome || "Responsavel nao informado"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                              <span className="rounded-full bg-gray-100 px-2 py-1">
                                {TODAY_KEY === getAppointmentDateKey(appointment) ? "Hoje" : getAppointmentDateKey(appointment)}
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
                            {activeCheckin?.pertences_entrada_foto_url && (
                              <button
                                type="button"
                                onClick={() => handleAttachmentPreview(activeCheckin.pertences_entrada_foto_url, "Pertences na entrada")}
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
                              {mealEnabled && (
                                <Button variant="outline" onClick={() => openMealDialogForCheckin(appointment, activeCheckin)}>
                                  <UtensilsCrossed className="mr-2 h-4 w-4" />
                                  Refeicao {mealCount > 0 ? `(${mealCount})` : ""}
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

              {!filteredAppointments.length && !!searchTerm.trim() && !!matchedDogsWithoutAppointments.length && (
                <Card className="border-dashed border-blue-300 bg-blue-50">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-blue-900">Nenhum agendamento encontrado para hoje.</p>
                        <p className="mt-1 text-sm text-blue-800">
                          Voce pode incluir manualmente o atendimento e liberar a classificacao comercial depois.
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
                    <p className="text-gray-500">Nenhum agendamento localizado para hoje.</p>
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
                  Registro de prestadores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={providerCpf}
                    onChange={(event) => setProviderCpf(event.target.value)}
                    placeholder="CPF do prestador"
                    className="h-12"
                  />
                  <Button onClick={handleProviderCheckin} disabled={isSaving} className="h-12 bg-orange-600 text-white hover:bg-orange-700">
                    Registrar entrada
                  </Button>
                </div>

                <div className="space-y-3">
                  {presentProviders.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum prestador presente agora.</p>
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

      <Dialog open={showCheckinDialog} onOpenChange={setShowCheckinDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Confirmar check-in</DialogTitle>
            <DialogDescription>
              Confirme horario, monitor, pertences e observacoes do atendimento.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Horario do check-in</Label>
                <DateTimePickerInput value={checkinForm.checkin_datetime} onChange={(value) => setCheckinForm((current) => ({ ...current, checkin_datetime: value }))} />
              </div>
              <div>
                <Label>Monitor responsavel</Label>
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
              <Label>Responsavel pela entrega</Label>
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
                    <p className="font-medium text-gray-900">Tem refeicao?</p>
                    <p className="text-xs text-gray-500">Libera o registro posterior da refeicao.</p>
                  </div>
                  <Switch checked={checkinForm.tem_refeicao} onCheckedChange={(checked) => setCheckinForm((current) => ({ ...current, tem_refeicao: checked }))} />
                </div>
                {checkinForm.tem_refeicao && (
                  <div>
                    <Label>Observacao da refeicao</Label>
                    <Textarea value={checkinForm.refeicao_observacao} onChange={(event) => setCheckinForm((current) => ({ ...current, refeicao_observacao: event.target.value }))} className="mt-2" rows={3} />
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Lembrete ou tarefa</Label>
              <Input value={checkinForm.tarefa_lembrete} onChange={(event) => setCheckinForm((current) => ({ ...current, tarefa_lembrete: event.target.value }))} className="mt-2" placeholder="Ex.: avisar comercial sobre banho extra" />
            </div>

            <div>
              <Label>Observacoes gerais</Label>
              <Textarea value={checkinForm.observacoes} onChange={(event) => setCheckinForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckinDialog(false)}>Cancelar</Button>
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
              Registre a entrega, a foto dos itens devolvidos e o monitor responsavel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Horario do check-out</Label>
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
                <button type="button" onClick={() => handleAttachmentPreview(checkoutForm.pertences_saida_foto_url, "Pertences na saida")} className="mt-2 text-sm text-blue-600">
                  Ver imagem enviada
                </button>
              )}
            </div>

            <div>
              <Label>Observacoes</Label>
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
            <DialogTitle>Registrar refeicao</DialogTitle>
            <DialogDescription>
              Tire a foto do pote, informe quanto o cao comeu e anexe a selfie do monitor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Monitor responsavel</Label>
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
                  Tire foto do pote com a refeicao
                </Button>
                {mealForm.foto_refeicao_url && (
                  <button type="button" onClick={() => handleAttachmentPreview(mealForm.foto_refeicao_url, "Foto da refeicao")} className="mt-2 text-sm text-blue-600">
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
              <Label>Observacoes</Label>
              <Textarea value={mealForm.observacoes} onChange={(event) => setMealForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMealDialog(false)}>Cancelar</Button>
            <Button onClick={submitMeal} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              {isSaving ? "Salvando..." : "Registrar refeicao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
        <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Incluir manualmente</DialogTitle>
            <DialogDescription>
              Selecione o cao e o servico para incluir um agendamento avulso de hoje.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Cao</Label>
              <Select value={manualForm.dog_id} onValueChange={(value) => setManualForm((current) => ({ ...current, dog_id: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedDogForManual ? [selectedDogForManual] : dogs.filter((dog) => matchingDogIds.has(dog.id))).map((dog) => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {getDogDisplayName(dog)} - {getDogBreed(dog)} - {ownerByDogId[dog.id]?.nome || "Sem responsavel"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Servico</Label>
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
              <Label>Observacoes</Label>
              <Textarea value={manualForm.observacoes} onChange={(event) => setManualForm((current) => ({ ...current, observacoes: event.target.value }))} className="mt-2" rows={3} />
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Apos incluir, o Comercial recebe uma notificacao para decidir se este atendimento entra em pacote ou vira orcamento avulso.
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
