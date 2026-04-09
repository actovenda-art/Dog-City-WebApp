import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import {
  FINANCE_RATEIO_FIELDS,
  formatCurrency,
  fromDateInputValue,
  getRateioTotal,
  normalizeMovement,
  normalizeRateio,
  toDateInputValue,
} from "@/utils/finance";

export default function FinanceDetailDialog({
  open,
  onOpenChange,
  movement,
  mode,
  onSave,
  isSaving = false,
}) {
  const normalizedMovement = useMemo(() => normalizeMovement(movement || {}), [movement]);
  const [formData, setFormData] = useState({
    nome_contraparte: "",
    carteira_nome: "",
    data_hora_transacao: "",
    banco_contraparte: "",
    tipo_transacao_detalhado: "",
    referencia: "",
    observacoes: "",
  });
  const [rateio, setRateio] = useState(() => normalizeRateio({}));

  useEffect(() => {
    if (!movement) return;

    setFormData({
      nome_contraparte: normalizedMovement.contraparte || "",
      carteira_nome: movement?.carteira_nome || "",
      data_hora_transacao: toDateInputValue(normalizedMovement.dataHora || normalizedMovement.data_movimento || normalizedMovement.data),
      banco_contraparte: movement?.banco_contraparte || "",
      tipo_transacao_detalhado: movement?.tipo_transacao_detalhado || "",
      referencia: movement?.referencia || "",
      observacoes: movement?.observacoes || "",
    });
    setRateio(normalizeRateio(movement?.rateio));
  }, [movement, normalizedMovement]);

  const totalRateado = getRateioTotal(rateio);
  const diferencaRateio = (movement?.valor || 0) - totalRateado;
  const isReceita = mode === "receita";
  const baseFieldsLocked = normalizedMovement.apiLocked;

  const handleRateioChange = (key, value) => {
    const normalizedValue = Number(String(value || "").replace(",", "."));
    setRateio((prev) => ({
      ...prev,
      [key]: Number.isFinite(normalizedValue) ? normalizedValue : 0,
    }));
  };

  const handleSubmit = async () => {
    if (!movement?.id || typeof onSave !== "function") return;
    const movementDate = fromDateInputValue(formData.data_hora_transacao);

    if (baseFieldsLocked) {
      await onSave(movement.id, {
        carteira_nome: isReceita ? formData.carteira_nome.trim() || null : movement?.carteira_nome || null,
        observacoes: formData.observacoes.trim() || null,
        rateio: isReceita ? rateio : movement?.rateio || {},
      });
      return;
    }

    await onSave(movement.id, {
      nome_contraparte: formData.nome_contraparte.trim() || null,
      carteira_nome: isReceita ? formData.carteira_nome.trim() || null : null,
      data: movementDate,
      data_movimento: movementDate,
      data_hora_transacao: null,
      banco_contraparte: formData.banco_contraparte.trim() || null,
      tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
      referencia: formData.referencia.trim() || null,
      observacoes: formData.observacoes.trim() || null,
      rateio: isReceita ? rateio : {},
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[840px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReceita ? "Detalhes do recebimento" : "Detalhes da saída"}
          </DialogTitle>
          <DialogDescription>
            Revise os dados financeiros da movimentação usando apenas a data da transação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {baseFieldsLocked && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              Este lançamento veio da API oficial do banco. Os dados-base ficam bloqueados e aqui você complementa apenas carteira, rateio e observações.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
              <p className={`mt-2 text-2xl font-bold ${isReceita ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(movement?.valor || 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Tipo</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {isReceita ? "Receita" : "Despesa"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Transação ID</p>
              <p className="mt-2 text-sm font-medium text-gray-900 break-all">
                {formData.referencia || normalizedMovement.referenciaFinanceira}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{isReceita ? "Nome do remetente" : "Quem pagamos"}</Label>
              <Input
                className="mt-2"
                value={formData.nome_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, nome_contraparte: event.target.value }))}
                disabled={baseFieldsLocked}
              />
            </div>

            <div>
              <Label>Data da transação</Label>
              <DatePickerInput
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
                disabled={baseFieldsLocked}
              />
            </div>

            {isReceita && (
              <div>
                <Label>Carteira que recebeu o valor</Label>
                <Input
                  className="mt-2"
                  value={formData.carteira_nome}
                  onChange={(event) => setFormData((prev) => ({ ...prev, carteira_nome: event.target.value }))}
                  placeholder="Ex: Carteira principal"
                />
              </div>
            )}

            <div>
              <Label>{isReceita ? "Banco que pagou" : "Banco que recebeu"}</Label>
              <Input
                className="mt-2"
                value={formData.banco_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))}
                disabled={baseFieldsLocked}
              />
            </div>

            <div>
              <Label>Tipo da transação</Label>
              <Input
                className="mt-2"
                value={formData.tipo_transacao_detalhado}
                onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))}
                placeholder="Ex: PIX recebido, TED, transferência"
                disabled={baseFieldsLocked}
              />
            </div>

            <div>
              <Label>Transação ID</Label>
              <Input
                className="mt-2"
                value={formData.referencia}
                onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))}
                disabled={baseFieldsLocked}
              />
            </div>
          </div>

          {isReceita && (
            <div className="space-y-4 rounded-xl border border-green-200 bg-green-50/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">Distribuição do valor</p>
                  <p className="text-sm text-gray-500">
                    Informe quanto desta entrada vai para cada finalidade.
                  </p>
                </div>

                <div className="text-right">
                  <Badge className="bg-green-100 text-green-700">
                    Rateado {formatCurrency(totalRateado)}
                  </Badge>
                  <p className={`mt-2 text-sm font-medium ${Math.abs(diferencaRateio) < 0.01 ? "text-green-700" : "text-amber-700"}`}>
                    Saldo livre: {formatCurrency(diferencaRateio)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {FINANCE_RATEIO_FIELDS.map((item) => (
                  <div key={item.key}>
                    <Label>{item.label}</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      step="0.01"
                      value={rateio[item.key] ?? 0}
                      onChange={(event) => handleRateioChange(item.key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea
              className="mt-2"
              rows={4}
              value={formData.observacoes}
              onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))}
              placeholder={isReceita ? "Observações sobre o recebimento" : "Observações sobre a despesa"}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar detalhes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
