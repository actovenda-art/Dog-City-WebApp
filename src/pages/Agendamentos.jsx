import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  getCheckinMealRecords,
  getChargeTypeLabel,
  getServiceLabel,
} from "@/lib/attendance";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
import { isOperationalProfile } from "@/lib/access-control";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { AlertTriangle, Calendar, ClipboardList, RefreshCw, Tag } from "lucide-react";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAppointmentPeriod(appointment) {
  const startDateKey = getAppointmentDateKey(appointment);
  if (!startDateKey) return "-";

  if (appointment?.service_type !== "hospedagem") {
    return formatDate(startDateKey);
  }

  const endDateKey = getAppointmentEndDateKey(appointment);
  if (!endDateKey || endDateKey === startDateKey) {
    return formatDate(startDateKey);
  }

  return `${formatDate(startDateKey)} até ${formatDate(endDateKey)}`;
}

function addDays(dateKey, days) {
  if (!dateKey) return "";
  const base = new Date(`${dateKey}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function appointmentMatchesSearch(appointment, dog, owner, query) {
  const haystack = [
    dog?.nome,
    dog?.raca,
    owner?.nome,
    getServiceLabel(appointment.service_type),
    appointment.source_type,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function Agendamentos() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [avulsoActionsDialogOpen, setAvulsoActionsDialogOpen] = useState(false);
  const [recordsDialogOpen, setRecordsDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [packageCode, setPackageCode] = useState("");
  const [packageNotes, setPackageNotes] = useState("");

  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const orcamentosById = useMemo(() => Object.fromEntries(orcamentos.map((orcamento) => [orcamento.id, orcamento])), [orcamentos]);
  const ownerByDogId = useMemo(() => buildDogOwnerIndex(carteiras, []), [carteiras]);
  const visibleAppointments = useMemo(
    () => filterAppointmentsByApprovedOrcamentos(appointments, orcamentosById),
    [appointments, orcamentosById]
  );
  const reviewAppointmentId = searchParams.get("review");
  const absenceReviewAppointmentId = searchParams.get("absenceReview");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [me, appointmentRows, orcamentoRows, dogRows, carteiraRows, checkinRows] = await Promise.all([
        User.me(),
        Appointment.listAll("-created_date", 1000, 5000),
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Checkin.listAll("-created_date", 1000, 5000),
      ]);
      setCurrentUser(me || null);
      setAppointments(appointmentRows || []);
      setOrcamentos(orcamentoRows || []);
      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setCheckins(checkinRows || []);
    } catch (error) {
      console.error("Erro ao carregar agendamentos:", error);
    }
    setIsLoading(false);
  }

  const shouldHideOperationalAlerts = useMemo(() => isOperationalProfile(currentUser), [currentUser]);
  const selectedAppointmentRecord = useMemo(() => {
    if (!selectedAppointment) return null;

    const matchingRecords = checkins
      .filter((item) => item.tipo === "pet")
      .filter((item) =>
        item.id === selectedAppointment.linked_checkin_id
        || item.appointment_id === selectedAppointment.id
      )
      .sort((left, right) => {
        const leftValue = left.checkout_datetime || left.data_checkout || left.checkin_datetime || left.data_checkin || left.created_date || "";
        const rightValue = right.checkout_datetime || right.data_checkout || right.checkin_datetime || right.data_checkin || right.created_date || "";
        return String(rightValue).localeCompare(String(leftValue));
      });

    return matchingRecords[0] || null;
  }, [checkins, selectedAppointment]);

  const pendingCommercialAppointments = useMemo(() => {
    return visibleAppointments.filter((appointment) => {
      const meta = getAppointmentMeta(appointment);
      return appointment.source_type === "manual_registrador" && (
        appointment.charge_type === "pendente_comercial" ||
        meta.commercial_review_pending
      );
    });
  }, [visibleAppointments]);

  const pendingAbsenceAppointments = useMemo(() => {
    return visibleAppointments.filter((appointment) => {
      const meta = getAppointmentMeta(appointment);
      return meta.absence_review_pending;
    });
  }, [visibleAppointments]);

  const filteredAppointments = useMemo(() => {
    return visibleAppointments.filter((appointment) => {
      const dog = dogsById[appointment.dog_id];
      const owner = ownerByDogId[appointment.dog_id] || {};
      const matchSearch = !searchTerm || appointmentMatchesSearch(appointment, dog, owner, searchTerm);
      const matchDate = !filterDate || doesAppointmentOccurOnDate(appointment, filterDate);
      const matchService = filterService === "all" || appointment.service_type === filterService;
      const matchStatus = filterStatus === "all" || appointment.status === filterStatus || appointment.charge_type === filterStatus;
      return matchSearch && matchDate && matchService && matchStatus;
    });
  }, [visibleAppointments, dogsById, filterDate, filterService, filterStatus, ownerByDogId, searchTerm]);

  const stats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      total: visibleAppointments.length,
      hoje: visibleAppointments.filter((appointment) => doesAppointmentOccurOnDate(appointment, todayKey)).length,
      pendencias: pendingCommercialAppointments.length,
      presentes: visibleAppointments.filter((appointment) => appointment.status === "presente").length,
    };
  }, [pendingCommercialAppointments, visibleAppointments]);

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
      await loadData();
      setPackageDialogOpen(false);
      setSelectedAppointment(null);
    } catch (error) {
      console.error("Erro ao classificar como pacote:", error);
    }
    setIsSaving(false);
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
        `${createPageUrl("Orcamentos")}?dogId=${encodeURIComponent(getInternalEntityReference(dog) || appointment.dog_id)}&service=${encodeURIComponent(appointment.service_type || "")}&date=${encodeURIComponent(getAppointmentDateKey(appointment) || "")}&appointmentId=${encodeURIComponent(appointment.id)}&owner=${encodeURIComponent(ownerByDogId[appointment.dog_id]?.nome || dog?.nome || "")}`
      );
    } catch (error) {
      console.error("Erro ao preparar orçamento avulso:", error);
    }
    setIsSaving(false);
  }

  function openRegistradorForAppointment(appointment) {
    navigate(
      `${createPageUrl("Registrador")}?date=${encodeURIComponent(getAppointmentDateKey(appointment) || "")}&appointmentId=${encodeURIComponent(appointment.id)}`
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
          replacement_deadline: appointment.charge_type === "pacote" ? (currentMeta.suggested_replacement_deadline || addDays(serviceDate, 30)) : null,
          finance_review_required: appointment.charge_type !== "pacote",
          finance_follow_up: appointment.charge_type === "pacote" ? null : "avaliar_pagamento_ou_credito",
        },
      });
      await loadData();
    } catch (error) {
      console.error("Erro ao marcar falta:", error);
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2.5 sm:p-3">
              <Calendar className="h-5 w-5 text-blue-700 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-3xl">Agendamentos</h1>
            </div>
          </div>
          <Button variant="outline" onClick={loadData} className="h-9 w-full rounded-full px-3 text-xs sm:h-10 sm:w-auto sm:px-4 sm:text-sm">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, tone: "text-blue-600", border: "border-blue-200" },
            { label: "Hoje", value: stats.hoje, tone: "text-emerald-600", border: "border-emerald-200" },
            { label: "Presentes", value: stats.presentes, tone: "text-amber-600", border: "border-amber-200" },
            ...(!shouldHideOperationalAlerts ? [{ label: "Pendencias comerciais", value: stats.pendencias, tone: "text-rose-600", border: "border-rose-200" }] : []),
          ].map((item) => (
            <Card key={item.label} className={`${item.border} bg-white`}>
              <CardContent className="p-2.5 sm:p-4">
                <p className="text-[11px] text-gray-600 sm:text-sm">{item.label}</p>
                <p className={`mt-1 text-lg font-bold sm:text-2xl ${item.tone}`}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {!shouldHideOperationalAlerts && pendingAbsenceAppointments.length > 0 && (
          <Card className={`border-rose-300 bg-rose-50 ${absenceReviewAppointmentId ? "ring-2 ring-rose-300" : ""}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-900">
                <AlertTriangle className="h-5 w-5" />
                Confirmação de faltas pendente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingAbsenceAppointments.map((appointment) => {
                const dog = dogsById[appointment.dog_id];
                const owner = ownerByDogId[appointment.dog_id] || {};
                const meta = getAppointmentMeta(appointment);
                const highlighted = absenceReviewAppointmentId === appointment.id;
                return (
                  <div key={appointment.id} className={`rounded-xl border bg-white p-4 ${highlighted ? "border-rose-400" : "border-rose-200"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {dog?.nome || "Cão"} - {getServiceLabel(appointment.service_type)}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {owner.nome || "Responsável não identificado"} - {formatAppointmentPeriod(appointment)}
                        </p>
                        <p className="mt-2 text-sm text-rose-900">
                          {meta.checkin_id ? "Existe check-in aberto sem check-out. Revise no Registrador antes de confirmar a falta." : "Não houve check-in/check-out registrado para esse atendimento."}
                        </p>
                        <p className="mt-2 text-xs text-gray-500">
                          {appointment.charge_type === "pacote"
                            ? "Se confirmar a falta, o atendimento fica marcado para reposição em até 30 dias."
                            : "Se confirmar a falta, o financeiro continua com a análise de pagamento ou crédito."}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button variant="outline" onClick={() => openRegistradorForAppointment(appointment)} className="w-full sm:w-auto">
                          Abrir no registrador
                        </Button>
                        <Button onClick={() => handleMarkAbsence(appointment)} disabled={isSaving} className="w-full bg-rose-600 text-white hover:bg-rose-700 sm:w-auto">
                          Confirmar falta
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {!shouldHideOperationalAlerts && pendingCommercialAppointments.length > 0 && (
          <Card className={`border-amber-300 bg-amber-50 ${reviewAppointmentId ? "ring-2 ring-amber-300" : ""}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <ClipboardList className="h-5 w-5" />
                Classificação comercial pendente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingCommercialAppointments.map((appointment) => {
                const dog = dogsById[appointment.dog_id];
                const owner = ownerByDogId[appointment.dog_id] || {};
                const highlighted = reviewAppointmentId === appointment.id;
                return (
                  <div key={appointment.id} className={`rounded-xl border bg-white p-4 ${highlighted ? "border-amber-400" : "border-amber-200"}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {dog?.nome || "Cão"} • {getServiceLabel(appointment.service_type)}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {owner.nome || "Responsável não identificado"} • {formatAppointmentPeriod(appointment)}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button variant="outline" onClick={() => openPackageDialog(appointment)} className="w-full sm:w-auto">
                          <Tag className="mr-2 h-4 w-4" />
                          Marcar pacote
                        </Button>
                        <Button onClick={() => handleCreateOrcamento(appointment)} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                          Criar orçamento
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="border-gray-200 bg-white">
          <CardContent className="p-3 sm:p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por cão, responsável ou serviço..."
              hasActiveFilters={Boolean(searchTerm || filterDate || filterService !== "all" || filterStatus !== "all")}
              onClear={() => {
                setSearchTerm("");
                setFilterDate("");
                setFilterService("all");
                setFilterStatus("all");
              }}
              filters={[
                {
                  id: "date",
                  label: "Data",
                  icon: Calendar,
                  active: Boolean(filterDate),
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Data do agendamento</p>
                      <DatePickerInput value={filterDate} onChange={setFilterDate} />
                    </div>
                  ),
                },
                {
                  id: "service",
                  label: "Serviço",
                  icon: ClipboardList,
                  active: filterService !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Serviço</p>
                      <Select value={filterService} onValueChange={setFilterService}>
                        <SelectTrigger>
                          <SelectValue placeholder="Serviço" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os serviços</SelectItem>
                          {["day_care", "hospedagem", "adaptacao", "banho", "tosa", "transporte", "adestramento"].map((service) => (
                            <SelectItem key={service} value={service}>{getServiceLabel(service)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
                {
                  id: "status",
                  label: "Status",
                  icon: Tag,
                  active: filterStatus !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Status</p>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="agendado">Agendado</SelectItem>
                          <SelectItem value="presente">Presente</SelectItem>
                          <SelectItem value="finalizado">Finalizado</SelectItem>
                          <SelectItem value="pendente_comercial">Pendente comercial</SelectItem>
                          <SelectItem value="avulso">Avulso</SelectItem>
                          <SelectItem value="pacote">Pacote</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
              ]}
              searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filteredAppointments.map((appointment) => {
            const dog = dogsById[appointment.dog_id];
            const owner = ownerByDogId[appointment.dog_id] || {};
            return (
              <Card
                key={appointment.id}
                className={appointment.charge_type === "avulso"
                  ? "cursor-pointer border-gray-200 bg-white transition hover:border-blue-200 hover:shadow-sm"
                  : "border-gray-200 bg-white"}
                onClick={appointment.charge_type === "avulso" ? () => openAvulsoActionsDialog(appointment) : undefined}
              >
                <CardContent className="p-2.5 sm:p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{dog?.nome || "Cão"}</p>
                        <Badge variant="outline" className="text-[11px] sm:text-xs">{getServiceLabel(appointment.service_type)}</Badge>
                        <Badge className="bg-gray-100 text-[11px] text-gray-700 sm:text-xs">{appointment.status || "agendado"}</Badge>
                        <Badge className={`text-[11px] sm:text-xs ${appointment.charge_type === "pacote" ? "bg-emerald-100 text-emerald-700" : appointment.charge_type === "avulso" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                          {getChargeTypeLabel(appointment.charge_type)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-600 sm:text-sm">
                        {owner.nome || "Responsável não identificado"} • {formatAppointmentPeriod(appointment)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {getAppointmentSourceLabel(appointment)}
                      </p>
                    </div>
                    {!shouldHideOperationalAlerts && appointment.source_type === "manual_registrador" && appointment.charge_type === "pendente_comercial" && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <Button variant="outline" onClick={(event) => { event.stopPropagation(); openPackageDialog(appointment); }} className="w-full sm:w-auto">Pacote</Button>
                        <Button onClick={(event) => { event.stopPropagation(); handleCreateOrcamento(appointment); }} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                          Criar orçamento
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredAppointments.length === 0 && (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-10 text-center text-gray-500">
                Nenhum agendamento encontrado para os filtros atuais.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Classificar como pacote</DialogTitle>
            <DialogDescription>
              Informe o código do pacote para que a cobrança siga o contrato recorrente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Código do pacote</Label>
              <Input value={packageCode} onChange={(event) => setPackageCode(event.target.value)} className="mt-2" placeholder="Ex.: PAC-DAYCARE-2026" />
            </div>
            <div>
              <Label>Observações comerciais</Label>
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
              Escolha a ação desejada para este atendimento.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">{dogsById[selectedAppointment.dog_id]?.nome || "Cão"}</p>
                  <Badge variant="outline">{getServiceLabel(selectedAppointment.service_type)}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">Avulso</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {(ownerByDogId[selectedAppointment.dog_id] || {}).nome || "Responsável não identificado"} • {formatAppointmentPeriod(selectedAppointment)}
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
                  Ver Registros
                </Button>
                <Button
                  className="justify-start bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-200"
                  disabled={!selectedAppointment.orcamento_id}
                  onClick={() => {
                    openLinkedOrcamento(selectedAppointment);
                    setAvulsoActionsDialogOpen(false);
                  }}
                >
                  Abrir Orçamento
                </Button>
                {!selectedAppointment.orcamento_id ? (
                  <p className="text-xs text-amber-700">
                    Este agendamento não possui orçamento vinculado.
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
              Confira os dados de check-in e check-out vinculados a este serviço.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900">{dogsById[selectedAppointment.dog_id]?.nome || "Cão"}</p>
                  <Badge variant="outline">{getServiceLabel(selectedAppointment.service_type)}</Badge>
                  <Badge className="bg-blue-100 text-blue-700">{getChargeTypeLabel(selectedAppointment.charge_type)}</Badge>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {(ownerByDogId[selectedAppointment.dog_id] || {}).nome || "Responsável não identificado"} • {formatAppointmentPeriod(selectedAppointment)}
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
                      <p><span className="font-medium text-gray-900">Tem refeição:</span> {selectedAppointmentRecord.tem_refeicao ? "Sim" : "Não"}</p>
                      {selectedAppointmentRecord.refeicao_observacao ? (
                        <p><span className="font-medium text-gray-900">Observação da refeição:</span> {selectedAppointmentRecord.refeicao_observacao}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Check-out</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <p><span className="font-medium text-gray-900">Saída:</span> {formatDateTime(selectedAppointmentRecord.checkout_datetime || selectedAppointmentRecord.data_checkout)}</p>
                      <p><span className="font-medium text-gray-900">Quem buscou:</span> {selectedAppointmentRecord.retirador_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Monitor:</span> {selectedAppointmentRecord.checkout_monitor_nome || "-"}</p>
                      <p><span className="font-medium text-gray-900">Status:</span> {selectedAppointmentRecord.status || "-"}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Resumo</p>
                    <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2">
                      <p><span className="font-medium text-gray-900">Registros de refeição:</span> {getCheckinMealRecords(selectedAppointmentRecord).length}</p>
                      <p><span className="font-medium text-gray-900">Observações:</span> {selectedAppointmentRecord.observacoes || "-"}</p>
                      <p><span className="font-medium text-gray-900">Foto dos pertences na entrada:</span> {selectedAppointmentRecord.pertences_entrada_foto_url ? "Anexada" : "Não anexada"}</p>
                      <p><span className="font-medium text-gray-900">Foto dos pertences na saída:</span> {selectedAppointmentRecord.pertences_saida_foto_url ? "Anexada" : "Não anexada"}</p>
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
