import React, { useEffect, useState } from "react";
import { Appointment, Carteira, Dog, Orcamento, Responsavel, TabelaPrecos, User } from "@/api/entities";
import { notificacoesOrcamento } from "@/api/functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
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
  getAppointmentMeta,
  isApprovedOrcamentoStatus,
} from "@/lib/attendance";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
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

  useEffect(() => {
    loadData();
  }, [refreshKey]);

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
    if (!confirm("Excluir este orçamento?")) return;
    try {
      await Orcamento.delete(id);
      await loadData();
      await onChange?.();
    } catch (error) {
      console.error("Erro ao excluir orçamento:", error);
      alert("Erro ao excluir orçamento.");
    }
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
                <p className="text-sm text-gray-600">Visualize e gerencie todos os orçamentos</p>
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
          <div className="flex flex-wrap gap-3 border-b border-gray-100 p-4">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar por cão ou ID..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <Filter className="mr-2 h-4 w-4" />
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
            <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
              <SelectTrigger className="w-44">
                <Calendar className="mr-2 h-4 w-4" />
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
