import React, { useEffect, useMemo, useState } from "react";
import { bancoInter } from "@/api/functions";
import { ExtratoBancario, IntegracaoConfig, User } from "@/api/entities";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput, DateRangePickerInput } from "@/components/common/DateTimeInputs";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Landmark,
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
  fromDateInputValue,
  getMovementComparableDate,
  normalizeMovement,
  toDateInputValue,
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

function StatCard({ label, value, className = "", valueClassName = "", icon = null, helper = null, isBlurred = false }) {
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
        {helper ? <p className="mt-2 text-xs text-gray-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

function resolveBankInterConfig(configs, empresaId) {
  const interConfigs = (configs || []).filter((item) => (item.provider || item.nome) === "banco_inter");
  const companyConfig = empresaId
    ? interConfigs.find((item) => (item.empresa_id || null) === empresaId)
    : null;
  const globalConfig = interConfigs.find((item) => !item.empresa_id);
  return companyConfig || globalConfig || null;
}

export default function Movimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBalance, setCurrentBalance] = useState(null);
  const [currentBalanceAt, setCurrentBalanceAt] = useState(null);
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);

  const loadData = async (userProfile, { preserveVisibleData = false } = {}) => {
    if (!preserveVisibleData && movimentacoes.length === 0) {
      setIsInitialLoading(true);
    }
    setIsSummaryLoading(true);

    try {
      const [movementsData, configs] = await Promise.all([
        ExtratoBancario.list("-data_movimento", 1000),
        IntegracaoConfig.list("-created_date", 200).catch(() => []),
      ]);

      const resolvedConfig = resolveBankInterConfig(configs, userProfile?.empresa_id || null);

      setMovimentacoes(movementsData || []);
      setCurrentBalance(typeof resolvedConfig?.current_balance === "number" ? resolvedConfig.current_balance : null);
      setCurrentBalanceAt(resolvedConfig?.current_balance_at || null);
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
        if (!isMounted) return;
        setCurrentUser(me || null);
        await loadData(me || null);
      } catch (error) {
        console.warn("Nao foi possivel carregar o usuario atual:", error);
        if (isMounted) {
          await loadData(null);
        }
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
        const searchBase = [
          item.contraparte,
          item.metodo,
          item.referenciaFinanceira,
          item.bancoContraparte,
          item.descricaoOriginal,
        ]
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

  const totalEntradas = filtered
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidas = filtered
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalEntradasGeral = normalizedMovements
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidasGeral = normalizedMovements
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);

  const saldoAtual = typeof currentBalance === "number" ? currentBalance : (totalEntradasGeral - totalSaidasGeral);

  const openModal = (item = null) => {
    if (item) {
      const normalized = normalizeMovement(item);
      setEditingItem(normalized);
      setFormData({
        data_hora_transacao: toDateInputValue(normalized.dataHora || normalized.data_movimento || normalized.data),
        tipo: normalized.tipo || "entrada",
        nome_contraparte: normalized.contraparte || "",
        valor: normalized.valor?.toString() || "",
        banco_contraparte: normalized.bancoContraparte === "-" ? "" : normalized.bancoContraparte || "",
        tipo_transacao_detalhado: normalized.tipoDetalhado === "-" ? "" : normalized.tipoDetalhado || "",
        referencia: normalized.referenciaFinanceira === "-" ? "" : normalized.referenciaFinanceira || "",
        observacoes: normalized.observacoesFinanceiras || "",
      });
    } else {
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    const isApiLocked = editingItem?.apiLocked;

    if (!isApiLocked && (!formData.data_hora_transacao || !formData.valor || !formData.nome_contraparte)) {
      alert("Preencha data, valor e remetente/recebedor.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        if (isApiLocked) {
          await ExtratoBancario.update(editingItem.id, {
            observacoes: formData.observacoes.trim() || null,
          });
        } else {
          const dateOnly = fromDateInputValue(formData.data_hora_transacao);
          await ExtratoBancario.update(editingItem.id, {
            descricao: formData.nome_contraparte.trim(),
            tipo: formData.tipo,
            valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
            data: dateOnly,
            data_movimento: dateOnly,
            data_hora_transacao: null,
            nome_contraparte: formData.nome_contraparte.trim(),
            banco_contraparte: formData.banco_contraparte.trim() || null,
            banco: formData.banco_contraparte.trim() || null,
            tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
            referencia: formData.referencia.trim() || null,
            observacoes: formData.observacoes.trim() || null,
            forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
            source_provider: editingItem?.source_provider || "manual",
            metadata_financeira: {
              ...(editingItem?.metadata_financeira || {}),
              api_locked: false,
            },
          });
        }
      } else {
        const dateOnly = fromDateInputValue(formData.data_hora_transacao);
        await ExtratoBancario.create({
          descricao: formData.nome_contraparte.trim(),
          tipo: formData.tipo,
          valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
          data: dateOnly,
          data_movimento: dateOnly,
          data_hora_transacao: null,
          nome_contraparte: formData.nome_contraparte.trim(),
          banco_contraparte: formData.banco_contraparte.trim() || null,
          banco: formData.banco_contraparte.trim() || null,
          tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
          referencia: formData.referencia.trim() || null,
          observacoes: formData.observacoes.trim() || null,
          forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
          source_provider: "manual",
          metadata_financeira: {
            api_locked: false,
          },
        });
      }

      await loadData(currentUser, { preserveVisibleData: true });
      setShowModal(false);
    } catch (error) {
      alert(error?.message || "Erro ao salvar movimentacao.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (movement) => {
    if (movement?.apiLocked) return;
    if (!confirm("Excluir esta movimentacao manual?")) return;

    try {
      await ExtratoBancario.delete(movement.id);
      await loadData(currentUser, { preserveVisibleData: true });
    } catch (error) {
      alert(error?.message || "Erro ao excluir movimentacao.");
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

      await loadData(currentUser, { preserveVisibleData: true });
      if (typeof data?.saldo_atual === "number") {
        setCurrentBalance(data.saldo_atual);
        setCurrentBalanceAt(data?.saldo_atualizado_em || new Date().toISOString());
      }

      setRefreshResult({
        success: true,
        message: data?.message || "Extrato atualizado com sucesso.",
        imported: data?.historical_inserted_count ?? data?.historicalInsertedCount ?? data?.inseridas ?? data?.imported_count ?? 0,
        refreshedToday: data?.refreshed_today_count ?? 0,
        balance: typeof data?.saldo_atual === "number" ? data.saldo_atual : null,
        balanceWarning: data?.balance_warning || null,
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
              Extrato bancario importado da API oficial com complemento manual apenas nos campos auxiliares.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshMovements} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Atualizando..." : "Atualizar extrato"}
            </Button>
            <Button onClick={() => openModal()} className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Nova movimentacao manual
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
                <div className="mt-1 space-y-1 text-sm text-blue-800">
                  <p>Historico novo inserido: {refreshResult.imported}</p>
                  <p>Movimentacoes de hoje recarregadas: {refreshResult.refreshedToday}</p>
                  {typeof refreshResult.balance === "number" && (
                    <p>Saldo oficial retornado pela API: {formatCurrency(refreshResult.balance)}</p>
                  )}
                  {refreshResult.balanceWarning && (
                    <p className="text-amber-700">{refreshResult.balanceWarning}</p>
                  )}
                </div>
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
            helper="Filtro atual"
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saidas"
            value={formatCurrency(totalSaidas)}
            className="border-red-200"
            valueClassName="text-red-600"
            helper="Filtro atual"
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saldo atual"
            value={formatCurrency(saldoAtual)}
            className={saldoAtual >= 0 ? "border-blue-200" : "border-red-200"}
            valueClassName={saldoAtual >= 0 ? "text-blue-700" : "text-red-600"}
            icon={<Wallet className={`h-5 w-5 ${saldoAtual >= 0 ? "text-blue-500" : "text-red-500"}`} />}
            helper={currentBalanceAt ? `API Banco Inter atualizada em ${new Date(currentBalanceAt).toLocaleString("pt-BR")}` : "Consolidado interno do extrato"}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Movimentacoes"
            value={String(filtered.length)}
            className="border-gray-200"
            valueClassName="text-gray-900"
            helper="Quantidade exibida"
            isBlurred={isSummaryLoading}
          />
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
                placeholder="Buscar por titular, metodo, banco ou referencia"
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

            <DateRangePickerInput
              startValue={dataInicial}
              endValue={dataFinal}
              onStartChange={setDataInicial}
              onEndChange={setDataFinal}
            />
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

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Titular da contraparte</p>
                        <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
                        <p className="mt-1 text-xs text-gray-500">{movement.direcaoLabel}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Metodo</p>
                        <p className="mt-1 font-medium text-gray-900">{movement.metodo}</p>
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

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge className={movement.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {movement.tipoDetalhado || movement.direcaoLabel}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-700">{movement.metodo}</Badge>
                      {movement.bancoContraparte && movement.bancoContraparte !== "-" && (
                        <Badge className="bg-gray-100 text-gray-700">{movement.bancoContraparte}</Badge>
                      )}
                      {movement.apiLocked ? (
                        <Badge variant="outline">Origem API</Badge>
                      ) : (
                        <Badge variant="outline">Manual</Badge>
                      )}
                      {movement.referenciaFinanceira && movement.referenciaFinanceira !== "-" && (
                        <Badge className="bg-slate-100 text-slate-700">
                          <Landmark className="mr-1 h-3 w-3" />
                          {movement.referenciaFinanceira}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(movement)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {movement.apiLocked ? "Complementar" : "Editar"}
                    </Button>
                    {!movement.apiLocked && (
                      <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDelete(movement)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar movimentacao" : "Nova movimentacao manual"}</DialogTitle>
            <DialogDescription>
              {editingItem?.apiLocked
                ? "Lancamentos vindos da API oficial ficam bloqueados. Aqui voce adiciona apenas observacoes complementares."
                : "Ajuste manualmente os dados financeiros exibidos na sessao de transacoes."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div>
              <Label>Data *</Label>
              <DatePickerInput
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value }))}
                disabled={editingItem?.apiLocked}
              >
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
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={formData.valor}
                onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Banco da contraparte</Label>
              <Input
                className="mt-2"
                value={formData.banco_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo da transacao</Label>
              <Input
                className="mt-2"
                value={formData.tipo_transacao_detalhado}
                onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))}
                placeholder="PIX, TED, boleto..."
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Referencia</Label>
              <Input
                className="mt-2"
                value={formData.referencia}
                onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))}
                disabled={editingItem?.apiLocked}
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
              {isSaving ? "Salvando..." : editingItem?.apiLocked ? "Salvar complemento" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
