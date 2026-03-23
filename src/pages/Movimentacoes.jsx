import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ExtratoBancario } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowDownCircle, ArrowUpCircle, Calendar, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { formatCurrency, formatMovementDateTime, fromDateTimeInputValue, getMovementCounterparty, normalizeMovement, toDateTimeInputValue } from "@/utils/finance";

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

export default function Movimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("all");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await ExtratoBancario.list("-data_hora_transacao", 1000);
      setMovimentacoes(data || []);
    } catch (error) {
      console.error("Erro ao carregar movimentacoes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const normalizedMovements = useMemo(
    () =>
      (movimentacoes || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => new Date(b.dataHora || b.data || b.created_date || 0) - new Date(a.dataHora || a.data || a.created_date || 0)),
    [movimentacoes],
  );

  const filtered = normalizedMovements.filter((item) => {
    const dateValue = item.dataHora || item.data || item.data_movimento;
    const movementDate = dateValue ? new Date(dateValue) : null;
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
  });

  const totalEntradas = filtered
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidas = filtered
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);

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

      await loadData();
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
      await loadData();
    } catch (error) {
      alert("Erro ao excluir movimentacao.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Transacoes</h1>
            <p className="text-sm text-gray-600 mt-1">
              Todas as movimentacoes com leitura rapida de valor, contraparte e data/hora.
            </p>
          </div>

          <Button onClick={() => openModal()} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Nova movimentacao
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-green-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Entradas</p>
              <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(totalEntradas)}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Saidas</p>
              <p className="mt-2 text-2xl font-bold text-red-600">{formatCurrency(totalSaidas)}</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Movimentacoes</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{filtered.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 bg-white mb-6">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              <Input type="date" value={dataInicial} onChange={(event) => setDataInicial(event.target.value)} />
              <Input type="date" value={dataFinal} onChange={(event) => setDataFinal(event.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-12 text-center text-gray-500">
                Nenhuma movimentacao encontrada.
              </CardContent>
            </Card>
          ) : (
            filtered.map((movement) => (
              <Card key={movement.id} className="border-gray-200 bg-white">
                <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${movement.tipo === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                    {movement.tipo === "entrada" ? (
                      <ArrowUpCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <ArrowDownCircle className="w-6 h-6 text-red-600" />
                    )}
                  </div>

                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Remetente / Recebedor</p>
                      <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
                    </div>

                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Data e hora</p>
                      <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(movement.dataHora)}</p>
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
                      <Pencil className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600" onClick={() => handleDelete(movement.id)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
                    </Button>
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
            <DialogTitle>{editingItem ? "Editar movimentacao" : "Nova movimentacao"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div>
              <Label>Data e hora *</Label>
              <Input
                type="datetime-local"
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(event) => setFormData((prev) => ({ ...prev, data_hora_transacao: event.target.value }))}
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
