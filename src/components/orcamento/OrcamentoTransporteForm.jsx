import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TimePickerInput } from "@/components/common/DateTimeInputs";
import { Truck, MapPin, Clock, Navigation } from "lucide-react";

const PRECO_KM = 6;

export default function OrcamentoTransporteForm({ transporte, tipo, onUpdate }) {
  const handleChange = (field, value) => {
    onUpdate({ ...transporte, [field]: value });
  };

  return (
    <Card className={`border-amber-200 bg-white ${!transporte.ativo ? "opacity-60" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-amber-600" />
            Transporte de {tipo === "ida" ? "Ida" : "Volta"}
          </CardTitle>
          <Switch checked={transporte.ativo} onCheckedChange={(value) => handleChange("ativo", value)} />
        </div>
      </CardHeader>
      {transporte.ativo && (
        <CardContent className="space-y-4">
          <div>
            <Label className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Endereco
            </Label>
            <Input
              value={transporte.endereco}
              onChange={(event) => handleChange("endereco", event.target.value)}
              placeholder="Endereco completo para coleta/entrega"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1">
                <Navigation className="h-3 w-3" /> Distancia (km)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={transporte.km || ""}
                onChange={(event) => handleChange("km", parseFloat(event.target.value) || 0)}
                placeholder="Ex: 15"
              />
              {transporte.km > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Valor: R$ {(transporte.km * PRECO_KM).toFixed(2)} ({transporte.km} km x R$ {PRECO_KM}/km)
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Horario desejado
              </Label>
              <TimePickerInput
                value={transporte.horario}
                onChange={(value) => handleChange("horario", value)}
              />
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
