import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Appointment, Carteira, Checkin, ContaReceber, Dog } from "@/api/entities";
import { buildDogOwnerIndex, buildReceivablePayload, getAppointmentDateKey, getAppointmentMeta, getChargeTypeLabel, getServiceLabel } from "@/lib/attendance";
import { createPageUrl } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { Calendar, ClipboardList, RefreshCw, Search, Tag } from "lucide-react";

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));
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
  const [appointments, setAppointments] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [packageCode, setPackageCode] = useState("");
  const [packageNotes, setPackageNotes] = useState("");

  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const ownerByDogId = useMemo(() => buildDogOwnerIndex(carteiras, []), [carteiras]);
  const reviewAppointmentId = searchParams.get("review");

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [appointmentRows, dogRows, carteiraRows, checkinRows] = await Promise.all([
        Appointment.listAll("-created_date", 1000, 5000),
        Dog.list("-created_date", 1000),
        Carteira.list("-created_date", 500),
        Checkin.listAll("-created_date", 1000, 5000),
      ]);
      setAppointments(appointmentRows || []);
      setDogs((dogRows || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteiraRows || []).filter((item) => item.ativo !== false));
      setCheckins(checkinRows || []);
    } catch (error) {
      console.error("Erro ao carregar agendamentos:", error);
    }
    setIsLoading(false);
  }

  const pendingCommercialAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const meta = getAppointmentMeta(appointment);
      return appointment.source_type === "manual_registrador" && (
        appointment.charge_type === "pendente_comercial" ||
        meta.commercial_review_pending
      );
    });
  }, [appointments]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const dog = dogsById[appointment.dog_id];
      const owner = ownerByDogId[appointment.dog_id] || {};
      const dateKey = getAppointmentDateKey(appointment);
      const matchSearch = !searchTerm || appointmentMatchesSearch(appointment, dog, owner, searchTerm);
      const matchDate = !filterDate || dateKey === filterDate;
      const matchService = filterService === "all" || appointment.service_type === filterService;
      const matchStatus = filterStatus === "all" || appointment.status === filterStatus || appointment.charge_type === filterStatus;
      return matchSearch && matchDate && matchService && matchStatus;
    });
  }, [appointments, dogsById, filterDate, filterService, filterStatus, ownerByDogId, searchTerm]);

  const stats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    return {
      total: appointments.length,
      hoje: appointments.filter((appointment) => getAppointmentDateKey(appointment) === todayKey).length,
      pendencias: pendingCommercialAppointments.length,
      presentes: appointments.filter((appointment) => appointment.status === "presente").length,
    };
  }, [appointments, pendingCommercialAppointments]);

  function openPackageDialog(appointment) {
    const meta = getAppointmentMeta(appointment);
    setSelectedAppointment(appointment);
    setPackageCode(meta.package_code || "");
    setPackageNotes(meta.commercial_notes || "");
    setPackageDialogOpen(true);
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
        `${createPageUrl("Orcamentos")}?dogId=${encodeURIComponent(appointment.dog_id)}&service=${encodeURIComponent(appointment.service_type || "")}&date=${encodeURIComponent(getAppointmentDateKey(appointment) || "")}&appointmentId=${encodeURIComponent(appointment.id)}&owner=${encodeURIComponent(ownerByDogId[appointment.dog_id]?.nome || dog?.nome || "")}`
      );
    } catch (error) {
      console.error("Erro ao preparar orcamento avulso:", error);
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
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Calendar className="h-6 w-6 text-blue-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Agendamentos</h1>
              <p className="text-sm text-gray-600">Fila operacional e comercial dos agendamentos ativos.</p>
            </div>
          </div>
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", value: stats.total, tone: "text-blue-600", border: "border-blue-200" },
            { label: "Hoje", value: stats.hoje, tone: "text-emerald-600", border: "border-emerald-200" },
            { label: "Presentes", value: stats.presentes, tone: "text-amber-600", border: "border-amber-200" },
            { label: "Pendencias comerciais", value: stats.pendencias, tone: "text-rose-600", border: "border-rose-200" },
          ].map((item) => (
            <Card key={item.label} className={`${item.border} bg-white`}>
              <CardContent className="p-4">
                <p className="text-sm text-gray-600">{item.label}</p>
                <p className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {pendingCommercialAppointments.length > 0 && (
          <Card className={`border-amber-300 bg-amber-50 ${reviewAppointmentId ? "ring-2 ring-amber-300" : ""}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900">
                <ClipboardList className="h-5 w-5" />
                Classificacao comercial pendente
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
                          {dog?.nome || "Cao"} • {getServiceLabel(appointment.service_type)}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {owner.nome || "Responsavel nao identificado"} • {formatDate(getAppointmentDateKey(appointment))}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => openPackageDialog(appointment)}>
                          <Tag className="mr-2 h-4 w-4" />
                          Marcar pacote
                        </Button>
                        <Button onClick={() => handleCreateOrcamento(appointment)} className="bg-blue-600 text-white hover:bg-blue-700">
                          Criar orcamento
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
          <CardContent className="grid gap-3 p-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar..." className="pl-9" />
            </div>
            <DatePickerInput value={filterDate} onChange={setFilterDate} />
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger><SelectValue placeholder="Servico" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os servicos</SelectItem>
                {["day_care", "hospedagem", "banho", "tosa", "transporte", "adestramento"].map((service) => (
                  <SelectItem key={service} value={service}>{getServiceLabel(service)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
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
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filteredAppointments.map((appointment) => {
            const dog = dogsById[appointment.dog_id];
            const owner = ownerByDogId[appointment.dog_id] || {};
            return (
              <Card key={appointment.id} className="border-gray-200 bg-white">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{dog?.nome || "Cao"}</p>
                        <Badge variant="outline">{getServiceLabel(appointment.service_type)}</Badge>
                        <Badge className="bg-gray-100 text-gray-700">{appointment.status || "agendado"}</Badge>
                        <Badge className={appointment.charge_type === "pacote" ? "bg-emerald-100 text-emerald-700" : appointment.charge_type === "avulso" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}>
                          {getChargeTypeLabel(appointment.charge_type)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {owner.nome || "Responsavel nao identificado"} • {formatDate(getAppointmentDateKey(appointment))}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Origem: {appointment.source_type || "manual"} {appointment.valor_previsto ? `• Previsto ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(appointment.valor_previsto)}` : ""}
                      </p>
                    </div>
                    {appointment.source_type === "manual_registrador" && appointment.charge_type === "pendente_comercial" && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => openPackageDialog(appointment)}>Pacote</Button>
                        <Button onClick={() => handleCreateOrcamento(appointment)} className="bg-blue-600 text-white hover:bg-blue-700">
                          Criar orcamento
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
    </div>
  );
}
