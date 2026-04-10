import React, { useEffect, useMemo, useState } from "react";
import { CentroCusto, ExtratoBancario } from "@/api/entities";
import FinanceDetailDialog from "@/components/finance/FinanceDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import { ArrowDownCircle, Landmark, Search } from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  getMovementComparableDate,
  getMovementBank,
  getMovementCounterparty,
  getMovementReference,
  getMovementTransactionType,
  normalizeMovement,
} from "@/utils/finance";

export default function Despesas() {
  const [despesas, setDespesas] = useState([]);
  const [centrosCusto, setCentrosCusto] = useState([]);
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
      const [data, centrosData] = await Promise.all([
        ExtratoBancario.filter({ tipo: "saida" }, "-data_movimento", 1000),
        CentroCusto.list("nome", 500).catch(() => []),
      ]);
      setDespesas(data || []);
      setCentrosCusto(centrosData || []);
    } catch (error) {
      console.error("Erro ao carregar despesas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizedExpenses = useMemo(
    () =>
      dedupeOfficialImportedMovements(despesas || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [despesas],
  );

  const filtered = normalizedExpenses.filter((item) => {
    const searchBase = [
      item.contraparte,
      item.bancoContraparte,
      item.referenciaFinanceira,
      item.centro_custo_nome,
      item.observacoesFinanceiras,
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

  const totalPago = filtered.reduce((sum, item) => sum + (item.valor || 0), 0);
  const comObservacoes = filtered.filter((item) => item.observacoesFinanceiras).length;
  const bancosIdentificados = new Set(filtered.map((item) => getMovementBank(item)).filter((value) => value && value !== "-")).size;

  const openDetails = (movement) => {
    setSelectedMovement(movement);
    setDetailOpen(true);
  };

  const handleSaveDetails = async (id, payload) => {
    setIsSavingDetails(true);
    try {
      await ExtratoBancario.update(id, payload);
      await loadData();
      setSelectedMovement((prev) => (prev ? { ...prev, ...payload } : prev));
      setDetailOpen(false);
    } catch (error) {
      alert("Erro ao salvar detalhes da despesa.");
    } finally {
      setIsSavingDetails(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <ArrowDownCircle className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Despesas</h1>
            <p className="text-sm text-gray-600 mt-1">
              Todas as saídas com banco de destino, tipo da transação, referencia e observações detalhadas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-red-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Total pago</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(totalPago)}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Com observações</p>
              <p className="mt-2 text-2xl font-bold text-amber-600">{comObservacoes}</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Bancos identificados</p>
              <p className="mt-2 text-2xl font-bold text-blue-600">{bancosIdentificados}</p>
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
                placeholder="Buscar por favorecido, banco, referência ou observações"
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
                Nenhuma despesa encontrada.
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => (
              <Card key={item.id} className="border-gray-200 bg-white">
                <CardContent className="p-4 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                      <ArrowDownCircle className="w-6 h-6 text-red-600" />
                    </div>

                    <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Quem pagamos</p>
                        <p className="mt-1 font-semibold text-gray-900">{getMovementCounterparty(item)}</p>
                      </div>

                      <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">Data</p>
                          <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(item)}</p>
                        </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Banco</p>
                        <p className="mt-1 font-medium text-gray-900">{getMovementBank(item)}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                        <p className="mt-1 text-lg font-bold text-red-600">{formatCurrency(item.valor)}</p>
                      </div>
                    </div>

                    <Button variant="outline" onClick={() => openDetails(item)}>
                      Ver detalhes
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge className="bg-gray-100 text-gray-700">{getMovementTransactionType(item)}</Badge>
                    <Badge className="bg-blue-100 text-blue-700">
                      <Landmark className="w-3 h-3 mr-1" />
                      {getMovementReference(item)}
                    </Badge>
                    <Badge className="bg-orange-100 text-orange-700">
                      {item.centro_custo_nome || "Sem centro de custo"}
                    </Badge>
                    {item.observacoesFinanceiras && <Badge variant="outline">Com observações</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <FinanceDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        movement={selectedMovement}
        mode="despesa"
      onSave={handleSaveDetails}
      isSaving={isSavingDetails}
      costCenters={centrosCusto}
    />
    </div>
  );
}
