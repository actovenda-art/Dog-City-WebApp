import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Receipt, Dog, Truck, Sparkles, Percent, CheckCircle, Moon } from "lucide-react";

export default function OrcamentoResumo({ calculo, caes, dogs, servicosSelecionados = {} }) {
  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  if (!calculo || !calculo.detalhes) {
    return (
      <Card className="border-gray-200 bg-gray-50">
        <CardContent className="p-6 text-center text-gray-500">
          <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>Preencha as informações para ver o orçamento</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-200 bg-white sticky top-4">
      <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Resumo do Orçamento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Detalhes por cão */}
        {calculo.detalhes.map((detalhe, idx) => {
          const dog = dogs.find(d => d.id === detalhe.dog_id);
          return (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Dog className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-gray-900">{dog?.nome || `Cão ${idx + 1}`}</span>
                {detalhe.is_mensalista && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs">Mensalista</Badge>
                )}
              </div>
              
              <div className="space-y-1 text-sm">
                {detalhe.diarias_normais > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{detalhe.diarias_normais} diária(s) × {formatCurrency(detalhe.valor_diaria)}</span>
                    <span className="font-medium">{formatCurrency(detalhe.subtotal_diarias)}</span>
                  </div>
                )}
                
                {detalhe.num_pernoites > 0 && (
                  <div className="flex justify-between text-indigo-600">
                    <span className="flex items-center gap-1">
                      <Moon className="w-3 h-3" /> {detalhe.num_pernoites} pernoite(s) × {formatCurrency(detalhe.valor_pernoite)}
                    </span>
                    <span className="font-medium">{formatCurrency(detalhe.subtotal_pernoites)}</span>
                  </div>
                )}
                
                {detalhe.desconto_dormitorio > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3 h-3" /> Desc. dormitório (30%)
                    </span>
                    <span>-{formatCurrency(detalhe.desconto_dormitorio)}</span>
                  </div>
                )}
                
                {detalhe.desconto_longa_estadia > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span className="flex items-center gap-1">
                      <Percent className="w-3 h-3" /> Desc. longa estadia ({detalhe.percentual_longa_estadia}%)
                    </span>
                    <span>-{formatCurrency(detalhe.desconto_longa_estadia)}</span>
                  </div>
                )}
                
                {detalhe.valor_banho > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-cyan-500" /> Banho
                    </span>
                    <span className="font-medium">{formatCurrency(detalhe.valor_banho)}</span>
                  </div>
                )}
                
                {detalhe.valor_tosa > 0 && (
                                                  <div className="flex justify-between">
                                                    <span className="text-gray-600 flex items-center gap-1">
                                                      <Sparkles className="w-3 h-3 text-purple-500" /> Tosa {detalhe.tipo_tosa}
                                                    </span>
                                                    <span className="font-medium">{formatCurrency(detalhe.valor_tosa)}</span>
                                                  </div>
                                                )}
                
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>Subtotal</span>
                  <span>{formatCurrency(detalhe.total_cao)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Transporte */}
        {(calculo.transporte_ida > 0 || calculo.transporte_volta > 0) && (
          <div className="p-3 bg-amber-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-gray-900">Transporte</span>
            </div>
            <div className="space-y-1 text-sm">
              {calculo.transporte_ida > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Ida ({calculo.transporte_ida_km} km)</span>
                  <span className="font-medium">{formatCurrency(calculo.transporte_ida)}</span>
                </div>
              )}
              {calculo.transporte_volta > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Volta ({calculo.transporte_volta_km} km)</span>
                  <span className="font-medium">{formatCurrency(calculo.transporte_volta)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Totais */}
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
              <span className="text-gray-600">Banho & Tosa</span>
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
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Total Descontos
              </span>
              <span>-{formatCurrency(calculo.desconto_total)}</span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex justify-between items-center pt-2">
          <span className="text-xl font-bold text-gray-900">TOTAL</span>
          <span className="text-2xl font-bold text-green-600">{formatCurrency(calculo.valor_total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}