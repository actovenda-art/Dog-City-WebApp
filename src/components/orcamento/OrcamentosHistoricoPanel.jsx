import React, { useEffect, useState } from "react";
import { Appointment, Carteira, Checkin, ContaReceber, Dog, Orcamento, Replacement, Responsavel, TabelaPrecos, User } from "@/api/entities";
import { notificacoesOrcamento } from "@/api/functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPageUrl } from "@/utils";
import {
  AlertTriangle,
  Search,
  FileText,
  Copy,
  Eye,
  Trash2,
  Calendar,
  Filter,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  buildAppointmentsFromOrcamento,
  buildDogOwnerIndex,
  buildPricingConfig,
  getAppointmentDateKey,
  getAppointmentMeta,
  getServiceLabel,
  isApprovedOrcamentoStatus,
} from "@/lib/attendance";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
}

function formatTime(value) {
  return value || "-";
}

function formatTimeRange(startTime, endTime) {
  if (startTime && endTime) return `${startTime} às ${endTime}`;
  if (startTime) return startTime;
  if (endTime) return endTime;
  return "-";
}

function inferOrcamentoServiceDate(cao, orcamento) {
  return (
    cao?.day_care_data ||
    cao?.adaptacao_data ||
    cao?.banho_data ||
    cao?.tosa_data ||
    cao?.hosp_data_entrada ||
    (cao?.transporte_viagens || []).find((viagem) => viagem?.data)?.data ||
    orcamento?.data_criacao ||
    ""
  );
}

function buildIncludedAppointments(orcamento, dogs = []) {
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));

  return (orcamento?.caes || [])
    .map((cao, index) => {
      const dog = dogsById[cao?.dog_id];
      const dogName = dog?.nome || `Cão ${index + 1}`;
      const items = [];

      if (cao?.servicos?.day_care && cao?.day_care_data) {
        items.push({
          key: `${cao.dog_id || index}-daycare`,
          title: "Day Care",
          lines: [`Dia agendado: ${formatDate(cao.day_care_data)}`],
        });
      }

      if (cao?.servicos?.hospedagem && cao?.hosp_data_entrada && cao?.hosp_data_saida) {
        items.push({
          key: `${cao.dog_id || index}-hospedagem`,
          title: "Hospedagem",
          lines: [
            `Entrada: ${formatDate(cao.hosp_data_entrada)} às ${formatTime(cao.hosp_horario_entrada)}`,
            `Saída: ${formatDate(cao.hosp_data_saida)} às ${formatTime(cao.hosp_horario_saida)}`,
            ...(cao.hosp_datas_daycare || []).filter(Boolean).length > 0
              ? [`Day Care/Pernoite: ${(cao.hosp_datas_daycare || []).filter(Boolean).map((date) => formatDate(date)).join(", ")}`]
              : [],
          ],
        });
      }

      if (cao?.servicos?.adaptacao && cao?.adaptacao_data) {
        items.push({
          key: `${cao.dog_id || index}-adaptacao`,
          title: "Adaptação",
          lines: [
            `Dia: ${formatDate(cao.adaptacao_data)}`,
            `Horário: ${formatTimeRange(cao.adaptacao_horario_entrada, cao.adaptacao_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.banho) {
        const banhoDate = cao?.banho_data || inferOrcamentoServiceDate(cao, orcamento);
        items.push({
          key: `${cao.dog_id || index}-banho`,
          title: "Banho",
          lines: [
            `Dia: ${formatDate(banhoDate)}`,
            `Horário: ${formatTimeRange(cao.banho_horario_inicio || cao.banho_horario, cao.banho_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.tosa && cao?.tosa_tipo) {
        const tosaDate = cao?.tosa_data || inferOrcamentoServiceDate(cao, orcamento);
        items.push({
          key: `${cao.dog_id || index}-tosa`,
          title: "Tosa",
          lines: [
            `Dia: ${formatDate(tosaDate)}`,
            `Horário: ${formatTimeRange(cao.tosa_horario_entrada, cao.tosa_horario_saida)}`,
          ],
        });
      }

      if (cao?.servicos?.transporte) {
        (cao?.transporte_viagens || []).forEach((viagem, viagemIndex) => {
          if (!viagem?.data && !viagem?.partida && !viagem?.destino) return;
          items.push({
            key: `${cao.dog_id || index}-transporte-${viagemIndex}`,
            title: `Transporte ${viagemIndex + 1}`,
            lines: [
              `Partida: ${viagem.partida || "-"}`,
              `Destino: ${viagem.destino || "-"}`,
              `Dia: ${formatDate(viagem.data)}`,
              `Horário: ${formatTimeRange(viagem.horario, viagem.horario_fim)}`,
            ],
          });
        });
      }

      return {
        dogId: cao?.dog_id || `${index}`,
        dogName,
        items,
      };
    })
    .filter((group) => group.items.length > 0);
}

function getSafeMetadata(record) {
  const metadata = record?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function isAppointmentFromOrcamento(appointment, orcamentoId) {
  if (!appointment || !orcamentoId) return false;
  const metadata = getAppointmentMeta(appointment);
  const sourceKey = String(appointment.source_key || "");
  return appointment.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || (appointment.source_type === "orcamento_aprovado" && sourceKey.startsWith(`orcamento|${orcamentoId}|`));
}

function getAppointmentsGeneratedFromOrcamento(appointments = [], orcamentoId) {
  const linkedIds = new Set();
  const linkedSourceKeys = new Set();

  appointments.forEach((appointment) => {
    if (!isAppointmentFromOrcamento(appointment, orcamentoId)) return;
    linkedIds.add(appointment.id);
    if (appointment.source_key) linkedSourceKeys.add(appointment.source_key);

    const metadata = getAppointmentMeta(appointment);
    if (metadata.replacement_scheduled_appointment_id) {
      linkedIds.add(metadata.replacement_scheduled_appointment_id);
    }
    if (metadata.replacement_scheduled_source_key) {
      linkedSourceKeys.add(metadata.replacement_scheduled_source_key);
    }
  });

  let added = true;
  while (added) {
    added = false;
    appointments.forEach((appointment) => {
      if (!appointment?.id || linkedIds.has(appointment.id)) return;
      const metadata = getAppointmentMeta(appointment);
      const sourceKey = String(appointment.source_key || "");
      const replacementOfId = metadata.replacement_of_appointment_id;
      const replacementOfSourceKey = metadata.replacement_of_source_key || metadata.replacement_scheduled_source_key;
      const sourceKeyLinkedToOriginal = [...linkedIds].some((appointmentId) =>
        sourceKey.startsWith(`reposicao_pacote|${appointmentId}|`)
      );

      if (
        linkedSourceKeys.has(sourceKey)
        || (replacementOfId && linkedIds.has(replacementOfId))
        || (replacementOfSourceKey && linkedSourceKeys.has(replacementOfSourceKey))
        || sourceKeyLinkedToOriginal
      ) {
        linkedIds.add(appointment.id);
        if (appointment.source_key) linkedSourceKeys.add(appointment.source_key);
        if (metadata.replacement_scheduled_appointment_id) {
          linkedIds.add(metadata.replacement_scheduled_appointment_id);
        }
        if (metadata.replacement_scheduled_source_key) {
          linkedSourceKeys.add(metadata.replacement_scheduled_source_key);
        }
        added = true;
      }
    });
  }

  return appointments.filter((appointment) => linkedIds.has(appointment.id));
}

function checkinMatchesAppointment(checkin, appointment) {
  if (!checkin || !appointment) return false;
  const metadata = getSafeMetadata(checkin);
  return checkin.appointment_id === appointment.id
    || metadata.appointment_id === appointment.id
    || (appointment.linked_checkin_id && checkin.id === appointment.linked_checkin_id)
    || (appointment.source_key && metadata.appointment_source_key === appointment.source_key);
}

function appointmentHasOperationalRecord(appointment, checkins = []) {
  if (!appointment) return false;
  if (appointment.linked_checkin_id) return true;
  if (["presente", "finalizado"].includes(appointment.status)) return true;
  return checkins.some((checkin) => checkinMatchesAppointment(checkin, appointment));
}

function isReceivableLinkedToDeletion(receivable, orcamentoId, appointmentIds) {
  if (!receivable) return false;
  const metadata = getSafeMetadata(receivable);
  const sourceKey = String(receivable.source_key || "");
  return receivable.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || appointmentIds.has(receivable.appointment_id)
    || appointmentIds.has(metadata.appointment_id)
    || [...appointmentIds].some((appointmentId) => sourceKey.includes(`|${appointmentId}|`));
}

function isReplacementLinkedToDeletion(replacement, orcamentoId, appointmentIds) {
  if (!replacement) return false;
  const metadata = getSafeMetadata(replacement);
  const possibleAppointmentIds = [
    replacement.appointment_id,
    replacement.source_appointment_id,
    replacement.original_appointment_id,
    replacement.linked_appointment_id,
    replacement.replacement_of_appointment_id,
    metadata.appointment_id,
    metadata.source_appointment_id,
    metadata.original_appointment_id,
    metadata.linked_appointment_id,
    metadata.replacement_of_appointment_id,
  ];

  return replacement.orcamento_id === orcamentoId
    || metadata.orcamento_id === orcamentoId
    || possibleAppointmentIds.some((appointmentId) => appointmentIds.has(appointmentId));
}

function buildOperationalRecordSuggestion(appointments = [], dogs = []) {
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
  return appointments
    .slice(0, 8)
    .map((appointment) => {
      const dogName = dogsById[appointment.dog_id]?.nome || "Cão";
      const serviceDate = getAppointmentDateKey(appointment);
      return {
        id: appointment.id,
        dogName,
        serviceName: getServiceLabel(appointment.service_type),
        serviceDate,
      };
    });
}

function serializeOperationalAppointmentForPrefill(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return {
    id: appointment.id,
    empresa_id: appointment.empresa_id || null,
    cliente_id: appointment.cliente_id || null,
    dog_id: appointment.dog_id || "",
    service_type: appointment.service_type || "",
    charge_type: appointment.charge_type || "",
    data_referencia: appointment.data_referencia || "",
    data_hora_entrada: appointment.data_hora_entrada || "",
    data_hora_saida: appointment.data_hora_saida || "",
    hora_entrada: appointment.hora_entrada || "",
    hora_saida: appointment.hora_saida || "",
    observacoes: appointment.observacoes || "",
    source_type: appointment.source_type || "",
    source_key: appointment.source_key || "",
    metadata,
  };
}

function getStatusBadge(status) {
  const config = {
    rascunho: { color: "bg-gray-100 text-gray-700", icon: Clock, label: "Rascunho" },
    enviado: { color: "bg-blue-100 text-blue-700", icon: Send, label: "Enviado" },
    aprovado: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Aprovado" },
    recusado: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Recusado" },
    expirado: { color: "bg-orange-100 text-orange-700", icon: Clock, label: "Expirado" },
  };
  const current = config[status] || config.rascunho;
  const Icon = current.icon;
  return (
    <Badge className={`${current.color} flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {current.label}
    </Badge>
  );
}

export default function OrcamentosHistoricoPanel({
  embedded = false,
  refreshKey = 0,
  openOrcamentoId = "",
  onChange,
}) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriodo, setFilterPeriodo] = useState("all");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);
  const [blockedDeleteContext, setBlockedDeleteContext] = useState(null);

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  useEffect(() => {
    if (!openOrcamentoId || !orcamentos.length) return;
    const matchedOrcamento = orcamentos.find((item) => item.id === openOrcamentoId);
    if (!matchedOrcamento) return;
    setSelectedOrcamento(matchedOrcamento);
    setShowDetailModal(true);
  }, [openOrcamentoId, orcamentos]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [orcData, dogsData, carteirasData, responsaveisData] = await Promise.all([
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
      ]);
      setOrcamentos(orcData || []);
      setDogs(dogsData || []);
      setCarteiras(carteirasData || []);
      setResponsaveis(responsaveisData || []);
    } catch (error) {
      console.error("Erro ao carregar histórico de orçamentos:", error);
    }
    setIsLoading(false);
  }

  function getDogName(dogId) {
    const dog = dogs.find((item) => item.id === dogId);
    return dog?.nome || "Cão não encontrado";
  }

  async function handleDuplicate(orcamento) {
    if (!orcamento) return;
    try {
      const newOrcamento = {
        ...orcamento,
        id: undefined,
        created_date: undefined,
        updated_date: undefined,
        data_criacao: new Date().toISOString().split("T")[0],
        data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "rascunho",
      };
      await Orcamento.create(newOrcamento);
      await loadData();
      await onChange?.();
      alert("Orçamento duplicado com sucesso!");
    } catch (error) {
      console.error("Erro ao duplicar orçamento:", error);
      alert("Erro ao duplicar orçamento.");
    }
  }

  async function handleDelete(id) {
    if (!id) return;
    try {
      const [appointmentRows, checkinRows, receivableRows, replacementRows] = await Promise.all([
        Appointment.listAll("-created_date", 1000, 10000),
        Checkin.listAll("-created_date", 1000, 10000),
        ContaReceber.listAll("-created_date", 1000, 10000),
        Replacement.listAll("-created_date", 1000, 10000),
      ]);

      const generatedAppointments = getAppointmentsGeneratedFromOrcamento(appointmentRows || [], id);
      const generatedAppointmentIds = new Set(generatedAppointments.map((appointment) => appointment.id).filter(Boolean));
      const operationalAppointments = generatedAppointments.filter((appointment) =>
        appointmentHasOperationalRecord(appointment, checkinRows || [])
      );

      if (operationalAppointments.length > 0) {
        setBlockedDeleteContext({
          orcamento: orcamentos.find((item) => item.id === id) || null,
          appointments: operationalAppointments,
          rows: buildOperationalRecordSuggestion(operationalAppointments, dogs),
        });
        return;
      }

      const linkedReceivables = (receivableRows || []).filter((receivable) =>
        isReceivableLinkedToDeletion(receivable, id, generatedAppointmentIds)
      );
      const linkedReplacements = (replacementRows || []).filter((replacement) =>
        isReplacementLinkedToDeletion(replacement, id, generatedAppointmentIds)
      );

      const deleteMessage = [
        "Excluir este orçamento?",
        "",
        "Também serão excluídos os registros gerados a partir dele:",
        `- ${generatedAppointments.length} agendamento(s)`,
        `- ${linkedReplacements.length} reposição(ões)`,
        `- ${linkedReceivables.length} valor(es) a receber`,
      ].join("\n");

      if (!confirm(deleteMessage)) return;

      await Promise.all(linkedReplacements.map((replacement) => Replacement.delete(replacement.id)));
      await Promise.all(linkedReceivables.map((receivable) => ContaReceber.delete(receivable.id)));
      await Promise.all(generatedAppointments.map((appointment) => Appointment.delete(appointment.id)));
      await Orcamento.delete(id);
      await loadData();
      await onChange?.();
    } catch (error) {
      console.error("Erro ao excluir orçamento:", error);
      alert("Erro ao excluir orçamento.");
    }
  }

  function handleCreateBudgetForUsedAppointments() {
    if (!blockedDeleteContext?.appointments?.length) return;

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const storageKey = `dogcity:orcamento-prefill:${token}`;
    const firstAppointment = blockedDeleteContext.appointments[0] || {};
    const payload = {
      type: "used_appointments_from_deleted_budget",
      source_orcamento_id: blockedDeleteContext.orcamento?.id || "",
      cliente_id: blockedDeleteContext.orcamento?.cliente_id || firstAppointment.cliente_id || null,
      created_at: new Date().toISOString(),
      observacoes: [
        "Orçamento criado para atendimentos já utilizados.",
        blockedDeleteContext.orcamento?.id ? `Origem: orçamento ${blockedDeleteContext.orcamento.id}.` : "",
        "Revise valores e datas antes de enviar.",
      ].filter(Boolean).join("\n"),
      appointments: blockedDeleteContext.appointments.map(serializeOperationalAppointmentForPrefill),
    };

    sessionStorage.setItem(storageKey, JSON.stringify(payload));
    window.location.href = `${createPageUrl("Orcamentos")}?prefillKey=${encodeURIComponent(token)}`;
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await Orcamento.update(id, { status: newStatus });

      const currentOrcamento = orcamentos.find((item) => item.id === id);
      const nextOrcamento = currentOrcamento ? { ...currentOrcamento, status: newStatus } : null;

      if (nextOrcamento) {
        try {
          const existingAppointments = await Appointment.listAll("-created_date", 1000, 5000);
          const linkedAppointments = (existingAppointments || []).filter(
            (item) => item.orcamento_id === id && item.source_type === "orcamento_aprovado"
          );

          if (!isApprovedOrcamentoStatus(newStatus)) {
            await Promise.all(
              linkedAppointments.map((appointment) =>
                Appointment.update(appointment.id, {
                  status: "cancelado",
                  metadata: {
                    ...getAppointmentMeta(appointment),
                    orcamento_status_bloqueado: true,
                    orcamento_status_atual: newStatus,
                  },
                })
              )
            );
          } else {
            const [pricingRows, currentUser] = await Promise.all([
              TabelaPrecos.list("-created_date", 1000),
              User.me(),
            ]);

            const ownerByDogId = buildDogOwnerIndex(carteiras, responsaveis);
            const precos = buildPricingConfig(
              pricingRows || [],
              currentUser?.empresa_id || nextOrcamento.empresa_id || null
            );
            const plannedAppointments = buildAppointmentsFromOrcamento({
              orcamento: nextOrcamento,
              dogs,
              precos,
              ownerByDogId,
            });

            const existingBySourceKey = new Map(
              (existingAppointments || [])
                .filter((item) => item.source_key)
                .map((item) => [item.source_key, item])
            );

            for (const appointment of plannedAppointments) {
              const existing = appointment.source_key ? existingBySourceKey.get(appointment.source_key) : null;
              if (!existing) {
                await Appointment.create(appointment);
                continue;
              }

              if (existing.status === "cancelado" || getAppointmentMeta(existing).orcamento_status_bloqueado) {
                await Appointment.update(existing.id, {
                  ...appointment,
                  status: "agendado",
                  metadata: {
                    ...getAppointmentMeta(existing),
                    ...appointment.metadata,
                    orcamento_status_bloqueado: false,
                    orcamento_status_atual: newStatus,
                  },
                });
              }
            }
          }
        } catch (error) {
          console.error("Erro ao sincronizar agendamentos do orçamento:", error);
        }
      }

      try {
        await notificacoesOrcamento({
          action: "status_alterado",
          data: { novo_status: newStatus },
        });
      } catch (error) {
        console.log("Notificação de orçamento não enviada");
      }

      await loadData();
      await onChange?.();
    } catch (error) {
      console.error("Erro ao alterar status do orçamento:", error);
      alert("Erro ao alterar status do orçamento.");
    }
  }

  const filtered = orcamentos.filter((orcamento) => {
    const normalizedSearch = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || (
      orcamento.id?.includes(searchTerm) ||
      orcamento.caes?.some((cao) => getDogName(cao.dog_id).toLowerCase().includes(normalizedSearch))
    );

    const matchStatus = filterStatus === "all" || orcamento.status === filterStatus;

    let matchPeriodo = true;
    if (filterPeriodo !== "all" && orcamento.data_criacao) {
      const dataCriacao = new Date(orcamento.data_criacao);
      const hoje = new Date();
      const diferencaDias = (hoje - dataCriacao) / (1000 * 60 * 60 * 24);
      if (filterPeriodo === "7dias") matchPeriodo = diferencaDias <= 7;
      if (filterPeriodo === "30dias") matchPeriodo = diferencaDias <= 30;
      if (filterPeriodo === "90dias") matchPeriodo = diferencaDias <= 90;
    }

    return matchSearch && matchStatus && matchPeriodo;
  });

  const stats = {
    total: orcamentos.length,
    aprovados: orcamentos.filter((item) => item.status === "aprovado").length,
    enviados: orcamentos.filter((item) => item.status === "enviado").length,
    valorTotal: orcamentos
      .filter((item) => item.status === "aprovado")
      .reduce((accumulator, item) => accumulator + (item.valor_total || 0), 0),
  };

  const selectedOrcamentoIncludedAppointments = selectedOrcamento
    ? buildIncludedAppointments(selectedOrcamento, dogs)
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  const content = (
    <>
      {!embedded && (
        <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Histórico de Orçamentos</h1>
              </div>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="border-blue-200 bg-white">
              <CardContent className="p-4 text-center">
                <FileText className="mx-auto mb-2 h-8 w-8 text-blue-600" />
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-sm text-gray-600">Total</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-white">
              <CardContent className="p-4 text-center">
                <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
                <p className="text-2xl font-bold text-green-600">{stats.aprovados}</p>
                <p className="text-sm text-gray-600">Aprovados</p>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-white">
              <CardContent className="p-4 text-center">
                <Send className="mx-auto mb-2 h-8 w-8 text-orange-600" />
                <p className="text-2xl font-bold text-orange-600">{stats.enviados}</p>
                <p className="text-sm text-gray-600">Aguardando</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-white">
              <CardContent className="p-4 text-center">
                <Download className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorTotal)}</p>
                <p className="text-sm text-gray-600">Valor aprovado</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="border-gray-200 bg-white">
        <CardHeader className={embedded ? "border-b border-gray-100" : undefined}>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {embedded ? "Histórico de Orçamentos" : "Orçamentos"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-gray-100 p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por cão ou ID..."
              hasActiveFilters={Boolean(searchTerm || filterStatus !== "all" || filterPeriodo !== "all")}
              onClear={() => {
                setSearchTerm("");
                setFilterStatus("all");
                setFilterPeriodo("all");
              }}
              filters={[
                {
                  id: "status",
                  label: "Status",
                  icon: Filter,
                  active: filterStatus !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Status do orçamento</p>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os status</SelectItem>
                          <SelectItem value="rascunho">Rascunho</SelectItem>
                          <SelectItem value="enviado">Enviado</SelectItem>
                          <SelectItem value="aprovado">Aprovado</SelectItem>
                          <SelectItem value="recusado">Recusado</SelectItem>
                          <SelectItem value="expirado">Expirado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
                {
                  id: "periodo",
                  label: "Período",
                  icon: Calendar,
                  active: filterPeriodo !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Período</p>
                      <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todo período</SelectItem>
                          <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                          <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                          <SelectItem value="90dias">Últimos 90 dias</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">Nenhum orçamento encontrado</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered.map((orcamento) => (
                <div key={orcamento.id} className="p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {orcamento.caes?.map((cao) => getDogName(cao.dog_id)).join(", ") || "Sem cães"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Criado em {formatDate(orcamento.data_criacao)} • Válido até {formatDate(orcamento.data_validade)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-2 ml-0 flex flex-wrap gap-2 sm:ml-13">
                        {orcamento.subtotal_hospedagem > 0 && (
                          <Badge variant="outline" className="text-xs">Hospedagem</Badge>
                        )}
                        {orcamento.subtotal_servicos > 0 && (
                          <Badge variant="outline" className="text-xs">Serviços</Badge>
                        )}
                        {orcamento.subtotal_transporte > 0 && (
                          <Badge variant="outline" className="text-xs">Transporte</Badge>
                        )}
                      </div>

                      {orcamento.observacoes && (
                        <p className="ml-0 rounded bg-yellow-50 p-2 text-sm text-gray-600 sm:ml-13">
                          {orcamento.observacoes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="text-xl font-bold text-green-600">{formatCurrency(orcamento.valor_total)}</span>
                      {getStatusBadge(orcamento.status)}

                      <div className="mt-2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setSelectedOrcamento(orcamento);
                            setShowDetailModal(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDuplicate(orcamento)}
                          title="Duplicar"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDelete(orcamento.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-[600px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Orçamento</DialogTitle>
            <DialogDescription className="sr-only">
              Visualização detalhada do orçamento com ações de status e duplicação.
            </DialogDescription>
          </DialogHeader>
          {selectedOrcamento && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Status:</span>
                {getStatusBadge(selectedOrcamento.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Criado em:</span>
                <span>{formatDate(selectedOrcamento.data_criacao)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Válido até:</span>
                <span>{formatDate(selectedOrcamento.data_validade)}</span>
              </div>

              <hr />

              <h4 className="font-semibold">Cães:</h4>
              {selectedOrcamento.caes?.map((cao, index) => (
                <div key={`${cao.dog_id || "cao"}-${index}`} className="rounded-lg bg-gray-50 p-3">
                  <p className="font-medium">{getDogName(cao.dog_id)}</p>
                </div>
              ))}

              {selectedOrcamentoIncludedAppointments.length > 0 && (
                <div>
                  <h4 className="mb-3 font-semibold">Agendamentos incluídos</h4>
                  <div className="space-y-3">
                    {selectedOrcamentoIncludedAppointments.map((group) => (
                      <div key={group.dogId} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="font-medium text-gray-900">{group.dogName}</p>
                        <div className="mt-3 space-y-2">
                          {group.items.map((item) => (
                            <div key={item.key} className="rounded-lg border border-white bg-white p-3">
                              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                              <div className="mt-2 space-y-1">
                                {item.lines.map((line) => (
                                  <p key={line} className="text-sm text-gray-600">{line}</p>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <hr />

              <div className="space-y-2">
                {selectedOrcamento.subtotal_hospedagem > 0 && (
                  <div className="flex justify-between">
                    <span>Hospedagem:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_hospedagem)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_servicos > 0 && (
                  <div className="flex justify-between">
                    <span>Serviços:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_servicos)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_transporte > 0 && (
                  <div className="flex justify-between">
                    <span>Transporte:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_transporte)}</span>
                  </div>
                )}
                {selectedOrcamento.desconto_total > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descontos:</span>
                    <span>-{formatCurrency(selectedOrcamento.desconto_total)}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span className="text-green-600">{formatCurrency(selectedOrcamento.valor_total)}</span>
                </div>
              </div>

              {selectedOrcamento.observacoes && (
                <>
                  <hr />
                  <div>
                    <h4 className="mb-2 font-semibold">Observações</h4>
                    <p className="rounded bg-yellow-50 p-3 text-gray-600">{selectedOrcamento.observacoes}</p>
                  </div>
                </>
              )}

              <hr />
              <div>
                <h4 className="mb-2 font-semibold">Alterar status</h4>
                <div className="flex flex-wrap gap-2">
                  {["rascunho", "enviado", "aprovado", "recusado"].map((status) => (
                    <Button
                      key={status}
                      variant={selectedOrcamento.status === status ? "default" : "outline"}
                      size="sm"
                      onClick={async () => {
                        await handleStatusChange(selectedOrcamento.id, status);
                        setSelectedOrcamento((current) => current ? { ...current, status } : current);
                      }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>Fechar</Button>
            <Button
              onClick={() => handleDuplicate(selectedOrcamento)}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(blockedDeleteContext)} onOpenChange={(open) => !open && setBlockedDeleteContext(null)}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[680px] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-100 p-3">
                <AlertTriangle className="h-6 w-6 text-amber-700" />
              </div>
              <div>
                <DialogTitle>Orçamento com atendimento já registrado</DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-6">
                  A exclusão foi bloqueada para proteger o histórico operacional. Já existe check-in ou check-out em agendamentos gerados por este orçamento.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Atendimentos que serão levados para o novo orçamento</p>
              <div className="mt-3 space-y-2">
                {(blockedDeleteContext?.rows || []).map((row) => (
                  <div key={row.id} className="flex flex-col gap-1 rounded-xl bg-white px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{row.dogName}</p>
                      <p className="text-gray-600">{row.serviceName}</p>
                    </div>
                    <Badge variant="outline">{row.serviceDate ? formatDate(row.serviceDate) : "Data não informada"}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm leading-6 text-gray-600">
              Use o botão abaixo para abrir um orçamento já preenchido com os cães, responsável financeiro e serviços que foram utilizados. Depois revise valores e envie normalmente.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBlockedDeleteContext(null)}>
              Manter orçamento atual
            </Button>
            <Button onClick={handleCreateBudgetForUsedAppointments} className="bg-blue-600 text-white hover:bg-blue-700">
              <FileText className="mr-2 h-4 w-4" />
              Criar orçamento para o que já foi utilizado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        {content}
      </div>
    </div>
  );
}
