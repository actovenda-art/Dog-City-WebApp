import React, { useEffect, useMemo, useState } from "react";
import { ExtratoBancario } from "@/api/entities";
import FinanceDetailDialog from "@/components/finance/FinanceDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import { ArrowUpCircle, Search, Wallet } from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  getMovementComparableDate,
  getMovementBank,
  getMovementCounterparty,
  getMovementTransactionType,
  getMovementWallet,
  getRateioTotal,
  normalizeMovement,
} from "@/utils/finance";

export default function Receitas() {
  const [receitas, setReceitas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isSavingDetails, setIsSavingDetails] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await ExtratoBancario.filter({ tipo: "entrada" }, "-data_movimento", 1000);
      setReceitas(data || []);
    } catch (error) {
      console.error("Erro ao carregar receitas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizedReceipts = useMemo(
    () =>
      dedupeOfficialImportedMovements(receitas || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [receitas],
  );

  const filtered = normalizedReceipts.filter((item) => {
    const searchBase = [
      item.contraparte,
      item.carteiraFinanceira,
      item.bancoContraparte,
      item.referenciaFinanceira,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (searchTerm && !searchBase.includes(searchTerm.toLowerCase())) {
      return false;
    }

    const movementDate = getMovementComparableDate(item);
    if (dateStart && movementDate && movementDate < new Date(`${dateStart}T00:00:00`)) {
      return false;
    }
    if (dateEnd && movementDate && movementDate > new Date(`${dateEnd}T23:59:59`)) {
      return false;
    }

    return true;
  });

  const totalRecebidoBanco = filtered
    .filter((item) => item.source_provider === "banco_inter")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalRecebidoManual = filtered
    .filter((item) => item.source_provider !== "banco_inter")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalRateado = filtered.reduce((sum, item) => sum + getRateioTotal(item.rateioNormalizado), 0);
  const totalCarteirasDefinidas = filtered.filter((item) => item.carteiraFinanceira && item.carteiraFinanceira !== "-").length;

  const openDetails = (movement) => {
    setSelectedMovement(movement);
    setDetailOpen(true);
  };

  const handleSaveDetails = async (id, payload) => {
    setIsSavingDetails(true);
    try {
      await ExtratoBancario.update(id, payload);
      await loadData();
      const refreshed = { ...selectedMovement, ...payload };
      setSelectedMovement(refreshed);
      setDetailOpen(false);
    } catch (error) {
      alert("Erro ao salvar detalhes da receita.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <ArrowUpCircle className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Receitas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Todos os recebimentos com detalhamento de carteira, banco, tipo e rateio por finalidade.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="border-green-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total oficial do banco</p>
              <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(totalRecebidoBanco)}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Complementos manuais</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{formatCurrency(totalRecebidoManual)}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Valor rateado</p>
              <p className="mt-2 text-2xl font-bold text-blue-600">{formatCurrency(totalRateado)}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Carteiras definidas</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">{totalCarteirasDefinidas}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 bg-white mb-6">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar por remetente, carteira, banco ou referência"
              />
            </div>
            <DateRangePickerInput
              startValue={dateStart}
              endValue={dateEnd}
              onStartChange={setDateStart}
              onEndChange={setDateEnd}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-12 text-center text-gray-500">
                Nenhum recebimento encontrado.
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => {
              const rateioTotal = getRateioTotal(item.rateioNormalizado);
              return (
                <Card key={item.id} className="border-gray-200 bg-white">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                        <ArrowUpCircle className="w-6 h-6 text-green-600" />
                      </div>

                      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Remetente</p>
                          <p className="mt-1 font-semibold text-gray-900">{getMovementCounterparty(item)}</p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Carteira</p>
                          <p className="mt-1 font-medium text-gray-900">{getMovementWallet(item)}</p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Data</p>
                          <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(item)}</p>
                        </div>

                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                          <p className="mt-1 text-lg font-bold text-green-600">{formatCurrency(item.valor)}</p>
                        </div>
                      </div>

                      <Button variant="outline" onClick={() => openDetails(item)}>
                        Ver detalhes
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge className="bg-blue-100 text-blue-700">{getMovementBank(item)}</Badge>
                      <Badge className="bg-gray-100 text-gray-700">{getMovementTransactionType(item)}</Badge>
                      <Badge variant="outline">{item.source_provider === "banco_inter" ? "Banco Inter" : "Manual"}</Badge>
                      <Badge className="bg-green-100 text-green-700">
                        Rateado {formatCurrency(rateioTotal)}
                      </Badge>
                      {item.observacoesFinanceiras && (
                        <Badge variant="outline">Com observações</Badge>
                      )}
                    </div>

                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Wallet className="w-4 h-4 text-gray-400" />
                        <span>Saldo não rateado: {formatCurrency((item.valor || 0) - rateioTotal)}</span>
                      </div>
                      <p className="text-xs text-gray-500 break-all">
                        Referência: {item.referenciaFinanceira} | Total oficial do período: {formatCurrency(totalRecebidoBanco)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <FinanceDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        movement={selectedMovement}
        mode="receita"
        onSave={handleSaveDetails}
        isSaving={isSavingDetails}
      />
    </div>
  );
}
