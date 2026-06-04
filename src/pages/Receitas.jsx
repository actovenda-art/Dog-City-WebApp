import React, { useEffect, useMemo, useState } from "react";
import { Carteira, CarteiraConta, ExtratoBancario, Receita, User } from "@/api/entities";
import { financeWalletAdminApplyOperation } from "@/api/functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { ArrowUpCircle, Calendar, CreditCard, Link2, Plus, Wallet } from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  getMovementCounterparty,
  getMovementReference,
  normalizeMovement,
} from "@/utils/finance";

const EMPTY_FORM = {
  data: "",
  descricao: "",
  valor: "",
  observacoes: "",
  carteira_id: "",
  transacao_id: "",
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

function getCarteiraCode(carteira) {
  return String(carteira?.codigo || carteira?.id || "").trim();
}

export default function Receitas() {
  const [receitas, setReceitas] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [walletAccounts, setWalletAccounts] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
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
      const [receitaRows, transactionResult, carteiraRows, walletAccountRows, currentUserData] = await Promise.all([
        Receita.list("-data", 1000),
        ExtratoBancario.queryAll({ eq: { tipo: "entrada" }, sort: "-data_movimento", pageSize: 500, maxRows: 5000 }),
        Carteira.list("nome_razao_social", 1000),
        CarteiraConta.list("-created_date", 1000),
        User.me(),
      ]);
      setReceitas(receitaRows || []);
      setTransactions(transactionResult?.data || []);
      setCarteiras((carteiraRows || []).filter((item) => item?.ativo !== false));
      setWalletAccounts(walletAccountRowsFilter(walletAccountRows || []));
      setCurrentUser(currentUserData || null);
    } catch (error) {
      console.error("Erro ao carregar receitas:", error);
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

  const selectedCarteira = useMemo(
    () => carteiras.find((item) => item.id === formData.carteira_id) || null,
    [carteiras, formData.carteira_id],
  );

  const selectedWalletAccount = useMemo(
    () => walletAccounts.find((item) => item?.carteira_id === formData.carteira_id) || null,
    [walletAccounts, formData.carteira_id],
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
    return (receitas || []).filter((item) => {
      const haystack = [
        item?.descricao,
        item?.carteira_nome,
        item?.transacao_id,
        item?.observacoes,
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
  }, [receitas, searchTerm, dateStart, dateEnd]);

  const totalRecebido = filtered.reduce((sum, item) => sum + Number(item?.valor || 0), 0);
  const carteirasVinculadas = new Set(filtered.map((item) => item?.carteira_id).filter(Boolean)).size;
  const comVinculo = filtered.filter((item) => item?.transacao_id).length;

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
      descricao: current.descricao || transaction?.descricao || "",
    }));
  };

  const handleSave = async () => {
    if (!formData.carteira_id) {
      alert("Selecione a carteira que recebeu a recarga.");
      return;
    }
    if (!formData.transacao_id) {
      alert("Selecione a transação de entrada do extrato.");
      return;
    }
    if (!formData.descricao || !formData.valor || !formData.data) {
      alert("Preencha descrição, valor e data da recarga.");
      return;
    }

    const numericValue = Number(String(formData.valor || "").replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alert("Informe um valor válido para a recarga.");
      return;
    }

    if (!selectedCarteira) {
      alert("Selecione uma carteira válida.");
      return;
    }
    if (!selectedWalletAccount?.id) {
      alert("A carteira selecionada ainda não possui conta operacional para receber a recarga.");
      return;
    }

    setIsSaving(true);
    try {
      const recargaDescription = formData.descricao.trim();
      const recargaObservation = formData.observacoes.trim() || `Recarga vinculada à transação ${formData.transacao_id}.`;

      await Receita.create({
        data: formData.data,
        descricao: recargaDescription,
        valor: numericValue,
        observacoes: recargaObservation,
        carteira_id: selectedCarteira.id,
        carteira_nome: selectedCarteira.nome_razao_social || null,
        transacao_id: formData.transacao_id,
      });

      await financeWalletAdminApplyOperation({
        carteira_conta_id: selectedWalletAccount.id,
        operacao_idempotencia: `receita|${selectedCarteira.id}|${formData.transacao_id}`,
        tipo: "entrada_direcionada",
        natureza: "entrada",
        valor: numericValue,
        referencia_amigavel: recargaDescription,
        motivo: "Recarga de carteira vinculada ao extrato bancário",
        observacao: recargaObservation,
        origem: "receitas_manual_link",
        transacao_id: formData.transacao_id,
        usuario_id: currentUser?.id || null,
        metadata: {
          source: "receitas_page_manual_top_up",
          carteira_id: selectedCarteira.id,
          carteira_nome: selectedCarteira.nome_razao_social || null,
        },
      });

      await ExtratoBancario.update(formData.transacao_id, {
        vinculo_financeiro: getCarteiraCode(selectedCarteira),
        carteira_nome: selectedCarteira.nome_razao_social || null,
      });

      setDialogOpen(false);
      setFormData(EMPTY_FORM);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar recarga:", error);
      alert(error?.message || "Não foi possível salvar a recarga.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <ArrowUpCircle className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Receitas</h1>
              <p className="mt-1 text-sm text-gray-600">
                Entradas registradas como recarga de carteira e vinculadas obrigatoriamente a uma transação do extrato.
              </p>
            </div>
          </div>
          <Button onClick={openCreateDialog} className="sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova recarga
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-green-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total recarregado</p>
              <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Carteiras vinculadas</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{carteirasVinculadas}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Com transação vinculada</p>
              <p className="mt-2 text-2xl font-bold text-blue-600">{comVinculo}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por carteira, descrição ou ID da transação"
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
                        Período da recarga
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
                Nenhuma recarga de carteira encontrada.
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => (
              <Card key={item.id} className="border-gray-200 bg-white">
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                      <ArrowUpCircle className="h-6 w-6 text-green-600" />
                    </div>

                    <div className="grid flex-1 grid-cols-1 gap-3 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Carteira</p>
                        <p className="mt-1 font-semibold text-gray-900">{item?.carteira_nome || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Data</p>
                        <p className="mt-1 font-medium text-gray-900">{formatDateLabel(item?.data)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Descrição</p>
                        <p className="mt-1 font-medium text-gray-900">{item?.descricao || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                        <p className="mt-1 text-lg font-bold text-green-600">{formatCurrency(item?.valor || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    {item?.transacao_id ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <Link2 className="mr-1 h-3 w-3" />
                        {item.transacao_id}
                      </Badge>
                    ) : (
                      <Badge className="bg-rose-100 text-rose-700">Sem vínculo bancário</Badge>
                    )}
                    {item?.carteira_id ? (
                      <Badge variant="outline">
                        <CreditCard className="mr-1 h-3 w-3" />
                        {item.carteira_id}
                      </Badge>
                    ) : null}
                    {item?.observacoes ? <Badge variant="outline">Com observações</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova recarga de carteira</DialogTitle>
            <DialogDescription>
              Toda entrada precisa ser registrada como recarga de carteira e vinculada a uma transação do extrato.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Carteira</Label>
              <select
                value={formData.carteira_id}
                onChange={(event) => setFormData((current) => ({ ...current, carteira_id: event.target.value }))}
                className="mt-2 flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
              >
                <option value="">Selecione a carteira</option>
                {carteiras.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.nome_razao_social || "Sem nome"}${getCarteiraCode(item) ? ` • ${getCarteiraCode(item)}` : ""}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <Label>Transação do extrato</Label>
              <select
                value={formData.transacao_id}
                onChange={(event) => handleTransactionChange(event.target.value)}
                className="mt-2 flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm"
              >
                <option value="">Selecione a transação de entrada</option>
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

            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Input
                className="mt-2"
                value={formData.descricao}
                onChange={(event) => setFormData((current) => ({ ...current, descricao: event.target.value }))}
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
              {isSaving ? "Salvando..." : "Salvar recarga"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function walletAccountRowsFilter(rows = []) {
  return (rows || []).filter((item) => item?.ativo !== false);
}
