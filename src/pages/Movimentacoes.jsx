import React, { useEffect, useMemo, useState } from "react";
import { bancoInter } from "@/api/functions";
import { ExtratoBancario, ExtratoDuplicidade, User } from "@/api/entities";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput, DateTimePickerInput } from "@/components/common/DateTimeInputs";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  formatCurrency,
  formatMovementDateTime,
  fromDateTimeInputValue,
  getMovementComparableDate,
  getMovementCounterparty,
  normalizeMovement,
  toDateTimeInputValue,
} from "@/utils/finance";

const EMPTY_FORM = {
  data_hora_transacao: "",
  tipo: "entrada",
  nome_contraparte: "",
  valor: "",
  banco_contraparte: "",
  tipo_transacao_detalhado: "",
  referencia: "",
  observacoes: "",
};

const DUPLICATE_REASON_LABEL = {
  duplicada_no_payload: "Repetida na mesma importacao",
  ja_existia_no_extrato: "Ja existia no extrato",
};

function toDuplicateImportedMovement(item) {
  return normalizeMovement({
    tipo: item.imported_tipo,
    valor: item.imported_valor,
    descricao: item.imported_descricao,
    nome_contraparte: item.imported_payload?.nomeFavorecido || item.imported_payload?.nomePagador || item.imported_descricao,
    banco_contraparte: item.imported_payload?.banco || item.imported_payload?.nomeBanco || null,
    referencia: item.external_id,
    data_movimento: item.imported_data_movimento,
    data_hora_transacao: item.imported_data_hora,
    raw_data: item.imported_payload,
  });
}

function toDuplicateExistingMovement(item) {
  return normalizeMovement(item.existing_snapshot || {});
}

function DuplicateMovementCard({ label, movement, accentClass }) {
  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Contraparte</p>
          <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Data e hora</p>
          <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(movement)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
          <p className={`mt-1 text-lg font-bold ${movement.tipo === "saida" ? "text-red-600" : "text-green-600"}`}>
            {movement.tipo === "saida" ? "-" : "+"}
            {formatCurrency(Math.abs(movement.valor || 0))}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-gray-600 md:grid-cols-3">
        <span><strong>Tipo:</strong> {movement.tipoDetalhado || "-"}</span>
        <span><strong>Banco:</strong> {movement.bancoContraparte || "-"}</span>
        <span><strong>Referencia:</strong> {movement.referenciaFinanceira || "-"}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, className = "", valueClassName = "", icon = null, isBlurred = false }) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{label}</p>
          {icon}
        </div>
        <p className={`mt-2 text-2xl font-bold transition ${isBlurred ? "blur-[6px] opacity-50 select-none" : ""} ${valueClassName}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default function Movimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [duplicidades, setDuplicidades] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("all");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("movimentacoes");
  const [isUpdatingDuplicateId, setIsUpdatingDuplicateId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  const loadData = async ({ preserveVisibleData = false } = {}) => {
    if (!preserveVisibleData && movimentacoes.length === 0) {
      setIsInitialLoading(true);
    }
    setIsSummaryLoading(true);

    try {
      const [movementsData, duplicateData] = await Promise.all([
        ExtratoBancario.list("-data_hora_transacao", 1000),
        ExtratoDuplicidade.list("-created_date", 500).catch((duplicateError) => {
          console.warn("Tabela de duplicidades ainda indisponivel:", duplicateError);
          return [];
        }),
      ]);

      setMovimentacoes(movementsData || []);
      setDuplicidades(duplicateData || []);
    } catch (error) {
      console.error("Erro ao carregar movimentacoes:", error);
    } finally {
      setIsInitialLoading(false);
      setIsSummaryLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      try {
        const me = await User.me();
        if (isMounted) {
          setCurrentUser(me || null);
        }
      } catch (error) {
        console.warn("Nao foi possivel carregar o usuario atual:", error);
      }

      if (isMounted) {
        await loadData();
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedMovements = useMemo(
    () =>
      (movimentacoes || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [movimentacoes],
  );

  const filtered = useMemo(
    () =>
      normalizedMovements.filter((item) => {
        const movementDate = getMovementComparableDate(item);
        const searchBase = [item.contraparte, item.referenciaFinanceira, item.bancoContraparte]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (searchTerm && !searchBase.includes(searchTerm.toLowerCase())) {
          return false;
        }

        if (tipoFiltro !== "all" && item.tipo !== tipoFiltro) {
          return false;
        }

        if (dataInicial && movementDate && movementDate < new Date(`${dataInicial}T00:00:00`)) {
          return false;
        }

        if (dataFinal && movementDate && movementDate > new Date(`${dataFinal}T23:59:59`)) {
          return false;
        }

        return true;
      }),
    [normalizedMovements, searchTerm, tipoFiltro, dataInicial, dataFinal],
  );

  const duplicatePendentes = useMemo(
    () => (duplicidades || []).filter((item) => (item.status || "pendente") === "pendente"),
    [duplicidades],
  );

  const duplicateResolvidas = useMemo(
    () => (duplicidades || []).filter((item) => (item.status || "pendente") !== "pendente"),
    [duplicidades],
  );

  const totalEntradas = filtered
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidas = filtered
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);

  const saldoAtual = useMemo(() => {
    const movementWithBalance = normalizedMovements.find((item) => typeof item.saldo === "number" && Number.isFinite(item.saldo));
    return movementWithBalance?.saldo ?? (totalEntradas - totalSaidas);
  }, [normalizedMovements, totalEntradas, totalSaidas]);

  const openModal = (item = null) => {
    if (item) {
      const normalized = normalizeMovement(item);
      setEditingItem(item);
      setFormData({
        data_hora_transacao: toDateTimeInputValue(normalized.dataHora),
        tipo: item.tipo || "entrada",
        nome_contraparte: item.nome_contraparte || getMovementCounterparty(item),
        valor: item.valor?.toString() || "",
        banco_contraparte: item.banco_contraparte || "",
        tipo_transacao_detalhado: item.tipo_transacao_detalhado || "",
        referencia: item.referencia || "",
        observacoes: item.observacoes || "",
      });
    } else {
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.data_hora_transacao || !formData.valor || !formData.nome_contraparte) {
      alert("Preencha data/hora, valor e remetente/recebedor.");
      return;
    }

    setIsSaving(true);
    try {
      const isoDateTime = fromDateTimeInputValue(formData.data_hora_transacao);
      const dateOnly = isoDateTime ? isoDateTime.slice(0, 10) : null;
      const payload = {
        descricao: formData.nome_contraparte.trim(),
        tipo: formData.tipo,
        valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
        data: dateOnly,
        data_movimento: dateOnly,
        data_hora_transacao: isoDateTime,
        nome_contraparte: formData.nome_contraparte.trim(),
        banco_contraparte: formData.banco_contraparte.trim() || null,
        banco: formData.banco_contraparte.trim() || null,
        tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
        referencia: formData.referencia.trim() || null,
        observacoes: formData.observacoes.trim() || null,
        forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
        source_provider: editingItem?.source_provider || "manual",
      };

      if (editingItem) {
        await ExtratoBancario.update(editingItem.id, payload);
      } else {
        await ExtratoBancario.create(payload);
      }

      await loadData({ preserveVisibleData: true });
      setShowModal(false);
    } catch (error) {
      alert("Erro ao salvar movimentacao.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir esta movimentacao?")) return;

    try {
      await ExtratoBancario.delete(id);
      await loadData({ preserveVisibleData: true });
    } catch (error) {
      alert("Erro ao excluir movimentacao.");
    }
  };

  const updateDuplicateStatus = async (item, status) => {
    setIsUpdatingDuplicateId(item.id);
    try {
      await ExtratoDuplicidade.update(item.id, {
        status,
        resolved_at: new Date().toISOString(),
        updated_date: new Date().toISOString(),
      });
      await loadData({ preserveVisibleData: true });
    } catch (error) {
      alert("Erro ao atualizar a revisao da duplicidade.");
    } finally {
      setIsUpdatingDuplicateId(null);
    }
  };

  const refreshMovements = async () => {
    setIsRefreshing(true);
    setIsSummaryLoading(true);
    setRefreshResult(null);

    try {
      const data = await bancoInter({
        action: "syncNow",
        empresa_id: currentUser?.empresa_id || null,
      });

      await loadData({ preserveVisibleData: true });

      setRefreshResult({
        success: true,
        message: data?.message || "Extrato atualizado com sucesso.",
        imported: data?.imported_count ?? data?.inseridas ?? 0,
        duplicates: data?.deduplicated_count ?? data?.duplicadas ?? 0,
      });
    } catch (error) {
      setRefreshResult({
        success: false,
        message: error?.message || "Falha ao atualizar o extrato.",
      });
      setIsSummaryLoading(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Transacoes</h1>
            <p className="mt-1 text-sm text-gray-600">
              Todas as movimentacoes com leitura rapida de valor, contraparte e data da transacao.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshMovements} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Atualizando..." : "Atualizar extrato"}
            </Button>
            <Button onClick={() => openModal()} className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Nova movimentacao
            </Button>
          </div>
        </div>

        {refreshResult && (
          <Card className={`mb-6 ${refreshResult.success ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
            <CardContent className="p-4">
              <p className={`font-semibold ${refreshResult.success ? "text-blue-900" : "text-red-900"}`}>
                {refreshResult.message}
              </p>
              {refreshResult.success && (
                <p className="mt-1 text-sm text-blue-800">
                  Novas movimentacoes: {refreshResult.imported}. Suspeitas de duplicidade: {refreshResult.duplicates}.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="Entradas"
            value={formatCurrency(totalEntradas)}
            className="border-green-200"
            valueClassName="text-green-600"
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saidas"
            value={formatCurrency(totalSaidas)}
            className="border-red-200"
            valueClassName="text-red-600"
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saldo atual"
            value={formatCurrency(saldoAtual)}
            className={saldoAtual >= 0 ? "border-blue-200" : "border-red-200"}
            valueClassName={saldoAtual >= 0 ? "text-blue-700" : "text-red-600"}
            icon={<Wallet className={`h-5 w-5 ${saldoAtual >= 0 ? "text-blue-500" : "text-red-500"}`} />}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Movimentacoes"
            value={String(filtered.length)}
            className="border-gray-200"
            valueClassName="text-gray-900"
            isBlurred={isSummaryLoading}
          />
        </div>

        {duplicatePendentes.length > 0 && activeTab === "movimentacoes" && (
          <Card className="mb-6 border-amber-300 bg-amber-50">
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">
                    {duplicatePendentes.length} suspeita(s) de duplicidade aguardando revisao
                  </p>
                  <p className="mt-1 text-sm text-amber-800">
                    Confira as transacoes duplicadas identificadas na importacao do extrato antes de seguir com a conciliacao.
                  </p>
                </div>
              </div>
              <Button onClick={() => setActiveTab("duplicadas")} className="bg-amber-600 text-white hover:bg-amber-700">
                Revisar duplicadas
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="movimentacoes">Movimentacoes</TabsTrigger>
            <TabsTrigger value="duplicadas">
              Duplicadas
              {duplicatePendentes.length > 0 ? ` (${duplicatePendentes.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="movimentacoes">
            <Card className="mb-6 border-gray-200 bg-white">
              <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="pl-9"
                    placeholder="Buscar por nome, banco ou referencia"
                  />
                </div>

                <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saidas</SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-3">
                  <DatePickerInput value={dataInicial} onChange={setDataInicial} />
                  <DatePickerInput value={dataFinal} onChange={setDataFinal} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {filtered.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-12 text-center text-gray-500">
                    {isInitialLoading ? "Carregando movimentacoes..." : "Nenhuma movimentacao encontrada."}
                  </CardContent>
                </Card>
              ) : (
                filtered.map((movement) => (
                  <Card key={movement.id} className="border-gray-200 bg-white">
                    <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${movement.tipo === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                        {movement.tipo === "entrada" ? (
                          <ArrowUpCircle className="h-6 w-6 text-green-600" />
                        ) : (
                          <ArrowDownCircle className="h-6 w-6 text-red-600" />
                        )}
                      </div>

                      <div className="flex-1 grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Remetente / Recebedor</p>
                          <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Data da transacao</p>
                          <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(movement)}</p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                          <p className={`mt-1 text-lg font-bold ${movement.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                            {movement.tipo === "entrada" ? "+" : "-"}
                            {formatCurrency(Math.abs(movement.valor || 0))}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openModal(movement)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDelete(movement.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="duplicadas">
            <div className="space-y-4">
              {duplicatePendentes.length === 0 && duplicateResolvidas.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-12 text-center text-gray-500">
                    Nenhuma suspeita de duplicidade registrada.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {duplicatePendentes.length > 0 && (
                    <div className="space-y-3">
                      {duplicatePendentes.map((item) => {
                        const importedMovement = toDuplicateImportedMovement(item);
                        const existingMovement = item.existing_snapshot && Object.keys(item.existing_snapshot).length > 0
                          ? toDuplicateExistingMovement(item)
                          : null;
                        const duplicateReason = DUPLICATE_REASON_LABEL[item.duplicate_reason] || item.duplicate_reason;

                        return (
                          <Card key={item.id} className="border-amber-300 bg-white">
                            <CardContent className="space-y-4 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-amber-700">{duplicateReason}</p>
                                  <p className="mt-1 text-sm text-gray-600">
                                    External ID: <span className="font-mono">{item.external_id}</span>
                                  </p>
                                  {item.duplicate_count > 1 && (
                                    <p className="mt-1 text-sm text-gray-600">
                                      Ocorrencias repetidas na importacao: {item.duplicate_count}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => updateDuplicateStatus(item, "ignorada")}
                                    disabled={isUpdatingDuplicateId === item.id}
                                  >
                                    Ignorar
                                  </Button>
                                  <Button
                                    onClick={() => updateDuplicateStatus(item, "revisada")}
                                    disabled={isUpdatingDuplicateId === item.id}
                                    className="bg-blue-600 text-white hover:bg-blue-700"
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Marcar revisada
                                  </Button>
                                </div>
                              </div>

                              <DuplicateMovementCard
                                label="Registro importado"
                                movement={importedMovement}
                                accentClass="border-amber-200 bg-amber-50"
                              />

                              {existingMovement && (
                                <DuplicateMovementCard
                                  label="Registro ja existente"
                                  movement={existingMovement}
                                  accentClass="border-blue-200 bg-blue-50"
                                />
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}

                  {duplicateResolvidas.length > 0 && (
                    <Card className="border-gray-200 bg-white">
                      <CardContent className="p-4">
                        <p className="font-semibold text-gray-900">
                          Revisadas recentemente: {duplicateResolvidas.length}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          As duplicidades resolvidas continuam registradas para auditoria.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar movimentacao" : "Nova movimentacao"}</DialogTitle>
            <DialogDescription>
              Ajuste manualmente os dados financeiros exibidos na sessao de transacoes.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div>
              <Label>Data e hora *</Label>
              <DateTimePickerInput
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
              />
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Remetente / Recebedor *</Label>
              <Input
                className="mt-2"
                value={formData.nome_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, nome_contraparte: event.target.value }))}
              />
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={formData.valor}
                onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label>Banco da contraparte</Label>
              <Input
                className="mt-2"
                value={formData.banco_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))}
              />
            </div>

            <div>
              <Label>Tipo da transacao</Label>
              <Input
                className="mt-2"
                value={formData.tipo_transacao_detalhado}
                onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))}
                placeholder="PIX, TED, boleto..."
              />
            </div>

            <div className="md:col-span-2">
              <Label>Referencia</Label>
              <Input
                className="mt-2"
                value={formData.referencia}
                onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observacoes</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={formData.observacoes}
                onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
