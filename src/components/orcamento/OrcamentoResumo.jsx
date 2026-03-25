import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dog, Receipt, Truck } from "lucide-react";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export default function OrcamentoResumo({ calculo }) {
  if (!calculo) {
    return (
      <Card className="border-gray-200 bg-gray-50">
        <CardContent className="p-6 text-center text-gray-500">
          <Receipt className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>Preencha as informacoes para ver o orcamento</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="sticky top-4 border-green-200 bg-white">
      <CardHeader className="rounded-t-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Resumo do Orcamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {calculo.detalhes.map((detalhe, index) => (
          <div key={`${detalhe.dog_id || "dog"}-${index}`} className="rounded-lg bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Dog className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-gray-900">{detalhe.dog_nome || `Cao ${index + 1}`}</span>
            </div>

            <div className="space-y-1 text-sm">
              {detalhe.linhas.map((linha, linhaIndex) => (
                <div key={linhaIndex} className="flex items-start justify-between gap-3">
                  <span className={linha.valor < 0 ? "text-green-600" : "text-gray-600"}>{linha.descricao}</span>
                  <span className={`shrink-0 font-medium ${linha.valor < 0 ? "text-green-600" : "text-gray-900"}`}>
                    {linha.valor < 0 ? "-" : ""}{formatCurrency(Math.abs(linha.valor))}
                  </span>
                </div>
              ))}

              <Separator className="my-2" />
              <div className="flex justify-between font-semibold">
                <span>Subtotal</span>
                <span>{formatCurrency(detalhe.total)}</span>
              </div>
            </div>
          </div>
        ))}

        {calculo.transporte?.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-gray-900">Transporte</span>
            </div>
            <div className="space-y-1 text-sm">
              {calculo.transporte.map((linha, index) => (
                <div key={index} className="flex items-start justify-between gap-3">
                  <span className="text-gray-600">
                    {linha.dog_nome} - Viagem {linha.viagem_num} ({linha.km} km)
                  </span>
                  <span className="font-medium text-gray-900">{formatCurrency(linha.valor)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          {calculo.subtotal_hospedagem > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal Hospedagem</span>
              <span>{formatCurrency(calculo.subtotal_hospedagem)}</span>
            </div>
          )}

          {calculo.subtotal_servicos > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal Day Care e Servicos</span>
              <span>{formatCurrency(calculo.subtotal_servicos)}</span>
            </div>
          )}

          {calculo.subtotal_transporte > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal Transporte</span>
              <span>{formatCurrency(calculo.subtotal_transporte)}</span>
            </div>
          )}

          {calculo.desconto_total > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Descontos</span>
              <span>-{formatCurrency(calculo.desconto_total)}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between pt-2">
          <span className="text-xl font-bold text-gray-900">TOTAL</span>
          <span className="text-2xl font-bold text-green-600">{formatCurrency(calculo.valor_total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
