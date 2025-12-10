import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dog, Trash2, Calendar, Clock, Scissors, Moon, Plus, X } from "lucide-react";

const TIPOS_TOSA = [
  { id: "higienica", label: "Higiênica" },
  { id: "geral", label: "Geral" },
  { id: "detalhada", label: "Detalhada" },
];

export default function OrcamentoCaoForm({ 
  cao, 
  index, 
  dogs, 
  onUpdate, 
  onRemove,
  canRemove,
  precosBanhoTosa,
  servicosSelecionados = { hospedagem: true, banho: true, tosa: true, transporte: true }
}) {
  const selectedDog = dogs.find(d => d.id === cao.dog_id);

  const handleChange = (field, value) => {
    onUpdate(index, { ...cao, [field]: value });
  };

  return (
    <Card className="border-blue-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Dog className="w-5 h-5 text-blue-600" />
            Cão {index + 1}
          </CardTitle>
          {canRemove && (
            <Button variant="ghost" size="icon" onClick={() => onRemove(index)} className="h-8 w-8 text-red-500 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Seleção do Cão */}
        <div>
          <Label>Selecionar Cão *</Label>
          <Select value={cao.dog_id} onValueChange={(v) => handleChange("dog_id", v)}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha o cão" />
            </SelectTrigger>
            <SelectContent>
              {dogs.map(dog => (
                <SelectItem key={dog.id} value={dog.id}>
                  <div className="flex items-center gap-2">
                    {dog.foto_url ? (
                      <img src={dog.foto_url} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span>🐕</span>
                    )}
                    {dog.nome} {dog.raca && `(${dog.raca})`}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Hospedagem - só exibe se serviço selecionado */}
        {servicosSelecionados.hospedagem && (
          <>
            {/* É mensalista? */}
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <div>
                <Label className="text-sm font-medium">É mensalista de Day Care?</Label>
                <p className="text-xs text-gray-500">Mensalistas têm diária diferenciada (R$ 120 vs R$ 150)</p>
              </div>
              <Switch 
                checked={cao.is_mensalista} 
                onCheckedChange={(v) => handleChange("is_mensalista", v)} 
              />
            </div>

            {/* Datas de Hospedagem */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Data Entrada *
                </Label>
                <Input 
                  type="date" 
                  value={cao.data_entrada} 
                  onChange={(e) => handleChange("data_entrada", e.target.value)} 
                />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Data Saída *
                </Label>
                <Input 
                  type="date" 
                  value={cao.data_saida} 
                  onChange={(e) => handleChange("data_saida", e.target.value)} 
                />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Horário Saída *
                </Label>
                <Input 
                  type="time" 
                  value={cao.horario_saida} 
                  onChange={(e) => handleChange("horario_saida", e.target.value)} 
                />
              </div>
            </div>
          </>
        )}

        {/* Pernoite - só exibe se hospedagem selecionada */}
        {servicosSelecionados.hospedagem && (
        <div className="p-3 bg-indigo-50 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1">
                <Moon className="w-3 h-3" /> Tem pernoite?
              </Label>
              <p className="text-xs text-indigo-600">
                Dias com Day Care agendado = R$ 60,00 (sem desconto canil)
              </p>
            </div>
            <Switch 
              checked={cao.tem_pernoite} 
              onCheckedChange={(v) => {
                handleChange("tem_pernoite", v);
                if (!v) handleChange("datas_pernoite", []);
              }} 
            />
          </div>
          {cao.tem_pernoite && (
            <div className="space-y-2 pt-2">
              <Label className="text-xs">Datas com Day Care agendado:</Label>
              <div className="space-y-2">
                {(cao.datas_pernoite || []).map((data, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input 
                      type="date" 
                      value={data} 
                      onChange={(e) => {
                        const newDatas = [...(cao.datas_pernoite || [])];
                        newDatas[idx] = e.target.value;
                        handleChange("datas_pernoite", newDatas);
                      }}
                      className="flex-1"
                    />
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        const newDatas = (cao.datas_pernoite || []).filter((_, i) => i !== idx);
                        handleChange("datas_pernoite", newDatas);
                      }}
                      className="h-8 w-8 text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const newDatas = [...(cao.datas_pernoite || []), ""];
                    handleChange("datas_pernoite", newDatas);
                  }}
                  className="w-full border-dashed"
                >
                  <Plus className="w-3 h-3 mr-1" /> Adicionar data
                </Button>
              </div>
              {(cao.datas_pernoite || []).filter(d => d).length > 0 && (
                <p className="text-xs text-indigo-700 font-medium">
                  {(cao.datas_pernoite || []).filter(d => d).length} pernoite(s) = R$ {((cao.datas_pernoite || []).filter(d => d).length * 60).toFixed(2)}
                </p>
              )}
            </div>
          )}
        </div>
        )}

        {/* Serviços opcionais - Banho */}
        {servicosSelecionados.banho && (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-cyan-50 rounded-lg">
            <div>
              <Label className="text-sm font-medium">Banho na saída?</Label>
              {cao.banho && selectedDog?.raca && precosBanhoTosa?.banho?.[selectedDog.raca] && (
                <p className="text-xs text-cyan-600">
                  R$ {precosBanhoTosa.banho[selectedDog.raca]?.toFixed(2)} ({selectedDog.raca})
                </p>
              )}
            </div>
            <Switch 
              checked={cao.banho} 
              onCheckedChange={(v) => handleChange("banho", v)} 
            />
          </div>
        </div>
        )}
          
        {/* Tosa */}
        {servicosSelecionados.tosa && (
        <div className="space-y-3">
          <div className="p-3 bg-purple-50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Tosa na saída?</Label>
                {cao.tosa && cao.tipo_tosa && selectedDog?.raca && precosBanhoTosa?.[`tosa_${cao.tipo_tosa}`]?.[selectedDog.raca] && (
                  <p className="text-xs text-purple-600">
                    R$ {precosBanhoTosa[`tosa_${cao.tipo_tosa}`][selectedDog.raca]?.toFixed(2)} ({selectedDog.raca})
                  </p>
                )}
              </div>
              <Switch 
                checked={cao.tosa} 
                onCheckedChange={(v) => {
                  handleChange("tosa", v);
                  if (v && !cao.tipo_tosa) handleChange("tipo_tosa", "higienica");
                }} 
              />
            </div>
            {cao.tosa && (
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <Scissors className="w-3 h-3" /> Tipo de Tosa
                </Label>
                <Select value={cao.tipo_tosa || "higienica"} onValueChange={(v) => handleChange("tipo_tosa", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_TOSA.map(tipo => (
                      <SelectItem key={tipo.id} value={tipo.id}>{tipo.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}