import React, { useEffect, useMemo, useState } from "react";
import { CentroCusto, Despesa, ExtratoBancario } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { ArrowDownCircle, Calendar, Landmark, Link2, Plus } from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  getMovementCounterparty,
  getMovementReference,
  getMovementTransactionType,
  normalizeMovement,
} from "@/utils/finance";

const EMPTY_FORM = {
  data: "",
  categoria: "",
  subcategoria: "",
  descricao: "",
  valor: "",
  centro_custo_nome: "",
  forma_pagamento: "",
  fornecedor: "",
  transacao_id: "",
  observacoes: "",
};

function parseDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function formatDateLabel(value) {
  const parsed = parseDate(value);
  if (!parsed) return "-";
  return parsed.toLocaleDateString("pt-BR");
}

export default function Despesas() {
  const [despesas, setDespesas] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [despesaRows, transactionResult, centros] = await Promise.all([
        Despesa.list("-data", 1000),
        ExtratoBancario.queryAll({ eq: { tipo: "saida" }, sort: "-data_movimento", pageSize: 500, maxRows: 5000 }),
        CentroCusto.list("nome", 500).catch(() => []),
      ]);
      setDespesas(despesaRows || []);
      setTransactions(transactionResult?.data || []);
      setCentrosCusto(centros || []);
    } catch (error) {
      console.error("Erro ao carregar despesas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizedTransactions = useMemo(
    () =>
      dedupeOfficialImportedMovements(transactions || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [transactions],
  );

  const selectedTransaction = useMemo(
    () => normalizedTransactions.find((item) => item.id === formData.transacao_id) || null,
    [normalizedTransactions, formData.transacao_id],
  );

  const availableTransactions = useMemo(
    () =>
      normalizedTransactions.filter((item) => {
        if (!item?.id) return false;
        return !item.vinculo_financeiro || item.id === formData.transacao_id;
      }),
    [normalizedTransactions, formData.transacao_id],
  );

  const filtered = useMemo(() => {
    return (despesas || []).filter((item) => {
      const haystack = [
        item?.fornecedor,
        item?.descricao,
        item?.categoria,
        item?.subcategoria,
        item?.centro_custo_nome,
        item?.forma_pagamento,
        item?.transacao_id,
        item?.vinculo_transacao_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (searchTerm && !haystack.includes(searchTerm.toLowerCase())) {
        return false;
      }

      const movementDate = parseDate(item?.data);
      if (dateStart && movementDate && movementDate < new Date(`${dateStart}T00:00:00`)) {
        return false;
      }
      if (dateEnd && movementDate && movementDate > new Date(`${dateEnd}T23:59:59`)) {
        return false;
      }

      return true;
    });
  }, [despesas, searchTerm, dateStart, dateEnd]);

  const totalPago = filtered.reduce((sum, item) => sum + Number(item?.valor || 0), 0);
  const comVinculo = filtered.filter((item) => item?.transacao_id || item?.vinculo_transacao_id).length;
  const centrosIdentificados = new Set(
    filtered.map((item) => item?.centro_custo_nome || item?.categoria).filter(Boolean),
  ).size;

  const openCreateDialog = () => {
    setFormData(EMPTY_FORM);
    setDialogOpen(true);
  };

  const handleTransactionChange = (transactionId) => {
    const transaction = normalizedTransactions.find((item) => item.id === transactionId) || null;
    setFormData((current) => ({
      ...current,
      transacao_id: transactionId,
      data: current.data || transaction?.data_movimento || transaction?.data || "",
      valor: current.valor || String(Math.abs(Number(transaction?.valor || 0))).replace(".", ","),
      fornecedor: current.fornecedor || getMovementCounterparty(transaction || {}),
      forma_pagamento: current.forma_pagamento || getMovementTransactionType(transaction || {}),
      descricao: current.descricao || transaction?.descricao || "",
    }));
  };

  const handleSave = async () => {
    if (!formData.transacao_id) {
      alert("Selecione a transação do extrato que será vinculada a esta despesa.");
      return;
    }

    if (!formData.categoria || !formData.descricao || !formData.valor || !formData.data) {
      alert("Preencha categoria, descrição, valor e data da despesa.");
      return;
    }

    const numericValue = Number(String(formData.valor || "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alert("Informe um valor válido para a despesa.");
      return;
    }

    setIsSaving(true);
    try {
      const createdExpense = await Despesa.create({
        data: formData.data,
        categoria: formData.categoria.trim(),
        subcategoria: formData.subcategoria.trim() || null,
        descricao: formData.descricao.trim(),
        valor: numericValue,
        centro_custo_nome: formData.centro_custo_nome.trim() || null,
        forma_pagamento: formData.forma_pagamento.trim() || null,
        fornecedor: formData.fornecedor.trim() || null,
        transacao_id: formData.transacao_id,
        vinculo_transacao_id: formData.transacao_id,
        observacoes: formData.observacoes.trim() || null,
      });

      await ExtratoBancario.update(formData.transacao_id, {
        vinculo_financeiro: createdExpense?.id || formData.transacao_id,
      });

      setDialogOpen(false);
      setFormData(EMPTY_FORM);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar despesa:", error);
      alert(error?.message || "Não foi possível salvar a despesa.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <ArrowDownCircle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Despesas</h1>
              <p className="mt-1 text-sm text-gray-600">
                Apenas despesas manuais vinculadas obrigatoriamente a uma transação do extrato.
              </p>
            </div>
          </div>
          <Button onClick={openCreateDialog} className="sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova despesa
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-red-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total pago</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(totalPago)}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Com vínculo bancário</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{comVinculo}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Centros identificados</p>
              <p className="mt-2 text-2xl font-bold text-blue-600">{centrosIdentificados}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por fornecedor, categoria, centro ou ID da transação"
              hasActiveFilters={Boolean(searchTerm || dateStart || dateEnd)}
              onClear={() => {
                setSearchTerm("");
                setDateStart("");
                setDateEnd("");
              }}
              filters={[
                {
                  id: "period",
                  label: "Período",
                  icon: Calendar,
                  active: Boolean(dateStart || dateEnd),
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Período da despesa
                      </p>
                      <DateRangePickerInput
                        startValue={dateStart}
                        endValue={dateEnd}
                        onStartChange={setDateStart}
                        onEndChange={setDateEnd}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-12 text-center text-gray-500">
                Nenhuma despesa manual encontrada.
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => {
              const linkedTransactionId = item?.transacao_id || item?.vinculo_transacao_id || null;
              return (
                <Card key={item.id} className="border-gray-200 bg-white">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <ArrowDownCircle className="h-6 w-6 text-red-600" />
                      </div>

                      <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Fornecedor</p>
                          <p className="mt-1 font-semibold text-gray-900">{item?.fornecedor || item?.descricao || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Data</p>
                          <p className="mt-1 font-medium text-gray-900">{formatDateLabel(item?.data)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Centro</p>
                          <p className="mt-1 font-medium text-gray-900">{item?.centro_custo_nome || item?.categoria || "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                          <p className="mt-1 text-lg font-bold text-red-600">{formatCurrency(item?.valor || 0)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      {item?.categoria ? <Badge className="bg-gray-100 text-gray-700">{item.categoria}</Badge> : null}
                      {item?.forma_pagamento ? <Badge className="bg-blue-100 text-blue-700">{item.forma_pagamento}</Badge> : null}
                      {linkedTransactionId ? (
                        <Badge className="bg-emerald-100 text-emerald-700">
                          <Link2 className="mr-1 h-3 w-3" />
                          {linkedTransactionId}
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-700">Sem vínculo bancário</Badge>
                      )}
                      {item?.subcategoria ? (
                        <Badge variant="outline">
                          <Landmark className="mr-1 h-3 w-3" />
                          {item.subcategoria}
                        </Badge>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova despesa manual</DialogTitle>
            <DialogDescription>
              Toda despesa precisa estar vinculada a uma transação do extrato antes de ser salva.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Transação do extrato</Label>
              <select
                value={formData.transacao_id}
                onChange={(event) => handleTransactionChange(event.target.value)}
                className="mt-2 flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
              >
                <option value="">Selecione a transação de saída</option>
                {availableTransactions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${formatMovementDateTime(item)} | ${getMovementCounterparty(item)} | ${formatCurrency(item.valor)} | ${getMovementReference(item)}`}
                  </option>
                ))}
              </select>
            </div>

            {selectedTransaction ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 md:col-span-2">
                <p className="font-semibold">Transação vinculada</p>
                <p className="mt-1">{selectedTransaction.descricao || getMovementCounterparty(selectedTransaction)}</p>
                <p className="mt-1 text-xs">
                  {formatMovementDateTime(selectedTransaction)} • {formatCurrency(selectedTransaction.valor)} • {getMovementReference(selectedTransaction)}
                </p>
              </div>
            ) : null}

            <div>
              <Label>Categoria</Label>
              <Input
                className="mt-2"
                value={formData.categoria}
                onChange={(event) => setFormData((current) => ({ ...current, categoria: event.target.value }))}
              />
            </div>

            <div>
              <Label>Subcategoria / referência</Label>
              <Input
                className="mt-2"
                value={formData.subcategoria}
                onChange={(event) => setFormData((current) => ({ ...current, subcategoria: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input
                className="mt-2"
                value={formData.descricao}
                onChange={(event) => setFormData((current) => ({ ...current, descricao: event.target.value }))}
              />
            </div>

            <div>
              <Label>Fornecedor</Label>
              <Input
                className="mt-2"
                value={formData.fornecedor}
                onChange={(event) => setFormData((current) => ({ ...current, fornecedor: event.target.value }))}
              />
            </div>

            <div>
              <Label>Forma de pagamento</Label>
              <Input
                className="mt-2"
                value={formData.forma_pagamento}
                onChange={(event) => setFormData((current) => ({ ...current, forma_pagamento: event.target.value }))}
              />
            </div>

            <div>
              <Label>Data</Label>
              <Input
                type="date"
                className="mt-2"
                value={formData.data}
                onChange={(event) => setFormData((current) => ({ ...current, data: event.target.value }))}
              />
            </div>

            <div>
              <Label>Valor</Label>
              <Input
                className="mt-2"
                value={formData.valor}
                onChange={(event) => setFormData((current) => ({ ...current, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Centro de custo</Label>
              <select
                value={formData.centro_custo_nome}
                onChange={(event) => setFormData((current) => ({ ...current, centro_custo_nome: event.target.value }))}
                className="mt-2 flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
              >
                <option value="">Selecione</option>
                {centrosCusto.map((item) => (
                  <option key={item.id || item.nome} value={item.nome || ""}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={formData.observacoes}
                onChange={(event) => setFormData((current) => ({ ...current, observacoes: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar despesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
