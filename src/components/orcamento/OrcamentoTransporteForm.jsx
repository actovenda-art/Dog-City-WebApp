import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Truck, MapPin, Clock, Navigation } from "lucide-react";

const PRECO_KM = 6; // R$ 6,00 por km

export default function OrcamentoTransporteForm({ transporte, tipo, onUpdate }) {
  const handleChange = (field, value) => {
    onUpdate({ ...transporte, [field]: value });
  };

  return (
    <Card className={`border-amber-200 bg-white ${!transporte.ativo ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" />
            Transporte de {tipo === "ida" ? "Ida" : "Volta"}
          </CardTitle>
          <Switch 
            checked={transporte.ativo} 
            onCheckedChange={(v) => handleChange("ativo", v)} 
          />
        </div>
      </CardHeader>
      {transporte.ativo && (
        <CardContent className="space-y-4">
          <div>
            <Label className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Endereço
            </Label>
            <Input 
              value={transporte.endereco} 
              onChange={(e) => handleChange("endereco", e.target.value)} 
              placeholder="Endereço completo para coleta/entrega"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1">
                <Navigation className="w-3 h-3" /> Distância (km)
              </Label>
              <Input 
                type="number"
                min="0"
                step="0.1"
                value={transporte.km || ""} 
                onChange={(e) => handleChange("km", parseFloat(e.target.value) || 0)} 
                placeholder="Ex: 15"
              />
              {transporte.km > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Valor: R$ {(transporte.km * PRECO_KM).toFixed(2)} ({transporte.km} km × R$ {PRECO_KM}/km)
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> Horário Desejado
              </Label>
              <Input 
                type="time" 
                value={transporte.horario} 
                onChange={(e) => handleChange("horario", e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}