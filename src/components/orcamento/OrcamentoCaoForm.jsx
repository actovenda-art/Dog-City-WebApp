import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import { Dog, Plus, Trash2, X } from "lucide-react";

const TOSA_HIGIENICA_OPTIONS = [
  { id: "pequeno_baixa", label: "Pequeno - Pelagem baixa" },
  { id: "pequeno_alta", label: "Pequeno - Pelagem alta" },
  { id: "medio_baixa", label: "Medio - Pelagem baixa" },
  { id: "medio_alta", label: "Medio - Pelagem alta" },
  { id: "grande_baixa", label: "Grande - Pelagem baixa" },
  { id: "grande_alta", label: "Grande - Pelagem alta" },
];

export default function OrcamentoCaoForm({
  cao,
  index,
  dogs,
  precos,
  onUpdate,
  onRemove,
  canRemove,
}) {
  const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  function handleChange(field, value) {
    onUpdate(index, { ...cao, [field]: value });
  }

  function handleServiceChange(service, checked) {
    onUpdate(index, {
      ...cao,
      servicos: {
        ...cao.servicos,
        [service]: checked,
      },
    });
  }

  function updateTransporteViagem(viagemIndex, field, value) {
    const transporte_viagens = [...(cao.transporte_viagens || [])];
    transporte_viagens[viagemIndex] = {
      ...transporte_viagens[viagemIndex],
      [field]: value,
    };
    handleChange("transporte_viagens", transporte_viagens);
  }

  function addViagem() {
    handleChange("transporte_viagens", [
      ...(cao.transporte_viagens || []),
      { partida: "", destino: "", data: "", horario: "", km: "" },
    ]);
  }

  function removeViagem(viagemIndex) {
    handleChange(
      "transporte_viagens",
      (cao.transporte_viagens || []).filter((_, currentIndex) => currentIndex !== viagemIndex)
    );
  }

  const selectedDog = dogs.find((dog) => dog.id === cao.dog_id);

  return (
    <Card className="border-blue-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Dog className="h-5 w-5 text-blue-600" />
            Cao {index + 1}
          </CardTitle>
          {canRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              className="h-8 w-8 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <Label>Selecionar Cao *</Label>
          <Select value={cao.dog_id} onValueChange={(value) => handleChange("dog_id", value)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Escolha o cao" />
            </SelectTrigger>
            <SelectContent>
              {dogs.map((dog) => (
                <SelectItem key={dog.id} value={dog.id}>
                  {dog.nome} {dog.raca ? `(${dog.raca})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
            <div>
              <Label className="text-sm font-medium">Day Care</Label>
              <p className="text-xs text-gray-500">Avulso por cao</p>
            </div>
            <Switch
              checked={cao.servicos?.day_care || false}
              onCheckedChange={(checked) => handleServiceChange("day_care", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
            <div>
              <Label className="text-sm font-medium">Hospedagem</Label>
              <p className="text-xs text-gray-500">Diarias e pernoite</p>
            </div>
            <Switch
              checked={cao.servicos?.hospedagem || false}
              onCheckedChange={(checked) => handleServiceChange("hospedagem", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-cyan-50 p-3">
            <div>
              <Label className="text-sm font-medium">Banho</Label>
              <p className="text-xs text-gray-500">Servico por raca</p>
            </div>
            <Switch
              checked={cao.servicos?.banho || false}
              onCheckedChange={(checked) => handleServiceChange("banho", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-purple-50 p-3">
            <div>
              <Label className="text-sm font-medium">Tosa</Label>
              <p className="text-xs text-gray-500">Higienica, geral ou detalhada</p>
            </div>
            <Switch
              checked={cao.servicos?.tosa || false}
              onCheckedChange={(checked) => handleServiceChange("tosa", checked)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
            <div>
              <Label className="text-sm font-medium">Transporte</Label>
              <p className="text-xs text-gray-500">Viagens por km</p>
            </div>
            <Switch
              checked={cao.servicos?.transporte || false}
              onCheckedChange={(checked) => handleServiceChange("transporte", checked)}
            />
          </div>
        </div>

        {cao.servicos?.day_care && (
          <div className="space-y-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="rounded-lg bg-white p-3">
              <p className="text-sm font-medium text-gray-900">Day Care Avulso</p>
              <p className="mt-1 text-xs text-gray-500">
                Sem pacote ativo: {formatCurrency(precos?.day_care_avulso_sem_pacote ?? precos?.day_care_avulso ?? 125)}
                {" "}| Com pacote ativo: {formatCurrency(precos?.day_care_avulso_com_pacote ?? 110)}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Cao com pacote de Day Care ativo?</Label>
                <p className="text-xs text-gray-500">Aplica o valor avulso reduzido para clientes com pacote em vigor.</p>
              </div>
              <Switch
                checked={cao.day_care_plano_ativo || false}
                onCheckedChange={(checked) => handleChange("day_care_plano_ativo", checked)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Data</Label>
                <DatePickerInput
                  className="mt-1"
                  value={cao.day_care_data}
                  onChange={(value) => handleChange("day_care_data", value)}
                />
              </div>
              <div>
                <Label>Horario de Entrada</Label>
                <TimePickerInput
                  className="mt-1"
                  value={cao.day_care_horario_entrada}
                  onChange={(value) => handleChange("day_care_horario_entrada", value)}
                />
              </div>
              <div>
                <Label>Horario de Saida</Label>
                <TimePickerInput
                  className="mt-1"
                  value={cao.day_care_horario_saida}
                  onChange={(value) => handleChange("day_care_horario_saida", value)}
                />
              </div>
            </div>

            <div>
              <Label>Observacoes do Day Care</Label>
              <Input
                className="mt-1"
                value={cao.day_care_observacoes || ""}
                onChange={(event) => handleChange("day_care_observacoes", event.target.value)}
                placeholder="Ex.: socializacao, gasto de energia, horario especial"
              />
            </div>
          </div>
        )}

        {cao.servicos?.hospedagem && (
          <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Mensalista de Day Care?</Label>
                <p className="text-xs text-gray-500">Usa diaria diferenciada</p>
              </div>
              <Switch
                checked={cao.hosp_is_mensalista}
                onCheckedChange={(checked) => handleChange("hosp_is_mensalista", checked)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Data de Entrada</Label>
                <DatePickerInput
                  className="mt-1"
                  value={cao.hosp_data_entrada}
                  onChange={(value) => handleChange("hosp_data_entrada", value)}
                />
              </div>
              <div>
                <Label>Horario de Entrada</Label>
                <TimePickerInput
                  className="mt-1"
                  value={cao.hosp_horario_entrada}
                  onChange={(value) => handleChange("hosp_horario_entrada", value)}
                />
              </div>
              <div>
                <Label>Data de Saida</Label>
                <DatePickerInput
                  className="mt-1"
                  value={cao.hosp_data_saida}
                  onChange={(value) => handleChange("hosp_data_saida", value)}
                />
              </div>
              <div>
                <Label>Horario de Saida</Label>
                <TimePickerInput
                  className="mt-1"
                  value={cao.hosp_horario_saida}
                  onChange={(value) => handleChange("hosp_horario_saida", value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Dormitorio compartilhado?</Label>
                <p className="text-xs text-gray-500">Aplica desconto no proprio cao</p>
              </div>
              <Switch
                checked={cao.hosp_dormitorio_compartilhado}
                onCheckedChange={(checked) => handleChange("hosp_dormitorio_compartilhado", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Tem Day Care ativo?</Label>
                <p className="text-xs text-gray-500">Pernoites ligados ao Day Care</p>
              </div>
              <Switch
                checked={cao.hosp_tem_daycare_ativo}
                onCheckedChange={(checked) => handleChange("hosp_tem_daycare_ativo", checked)}
              />
            </div>

            <div className="space-y-2 rounded-lg bg-white p-3">
              <Label>Datas de Day Care / Pernoite</Label>
              {(cao.hosp_datas_daycare || []).map((data, dataIndex) => (
                <div key={dataIndex} className="flex items-center gap-2">
                  <DatePickerInput
                    value={data}
                    onChange={(value) => {
                      const hosp_datas_daycare = [...(cao.hosp_datas_daycare || [])];
                      hosp_datas_daycare[dataIndex] = value;
                      handleChange("hosp_datas_daycare", hosp_datas_daycare);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const hosp_datas_daycare = (cao.hosp_datas_daycare || []).filter((_, currentIndex) => currentIndex !== dataIndex);
                      handleChange("hosp_datas_daycare", hosp_datas_daycare);
                    }}
                    className="h-8 w-8 text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={() => handleChange("hosp_datas_daycare", [...(cao.hosp_datas_daycare || []), ""])} className="w-full border-dashed">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Data
              </Button>
            </div>
          </div>
        )}

        {cao.servicos?.banho && (
          <div className="space-y-4 rounded-lg border border-cyan-100 bg-cyan-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Raca para Banho</Label>
                <Input
                  className="mt-1"
                  value={cao.banho_raca || selectedDog?.raca || ""}
                  onChange={(event) => handleChange("banho_raca", event.target.value)}
                />
              </div>
              <div>
                <Label>Horario do Banho</Label>
                <TimePickerInput
                  className="mt-1"
                  value={cao.banho_horario}
                  onChange={(value) => handleChange("banho_horario", value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg bg-white p-3">
                <div>
                  <Label className="text-sm font-medium">Plano ativo</Label>
                  <p className="text-xs text-gray-500">Controle informativo</p>
                </div>
                <Switch
                  checked={cao.banho_plano_ativo}
                  onCheckedChange={(checked) => handleChange("banho_plano_ativo", checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white p-3">
                <div>
                  <Label className="text-sm font-medium">Do pacote</Label>
                  <p className="text-xs text-gray-500">Marcacao visual</p>
                </div>
                <Switch
                  checked={cao.banho_do_pacote}
                  onCheckedChange={(checked) => handleChange("banho_do_pacote", checked)}
                />
              </div>
            </div>
          </div>
        )}

        {cao.servicos?.tosa && (
          <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50/50 p-4">
            <div>
              <Label>Tipo de Tosa</Label>
              <Select value={cao.tosa_tipo} onValueChange={(value) => handleChange("tosa_tipo", value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higienica">Higienica</SelectItem>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="detalhada">Detalhada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {cao.tosa_tipo === "higienica" && (
              <div>
                <Label>Subtipo Higienica</Label>
                <Select value={cao.tosa_subtipo_higienica} onValueChange={(value) => handleChange("tosa_subtipo_higienica", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Escolha o subtipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOSA_HIGIENICA_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg bg-white p-3">
                <div>
                  <Label className="text-sm font-medium">Plano ativo</Label>
                  <p className="text-xs text-gray-500">Controle informativo</p>
                </div>
                <Switch
                  checked={cao.tosa_plano_ativo}
                  onCheckedChange={(checked) => handleChange("tosa_plano_ativo", checked)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-white p-3">
                <div>
                  <Label className="text-sm font-medium">Do pacote</Label>
                  <p className="text-xs text-gray-500">Marcacao visual</p>
                </div>
                <Switch
                  checked={cao.tosa_do_pacote}
                  onCheckedChange={(checked) => handleChange("tosa_do_pacote", checked)}
                />
              </div>
            </div>

            <div>
              <Label>Observacoes da Tosa</Label>
              <Input
                className="mt-1"
                value={cao.tosa_obs}
                onChange={(event) => handleChange("tosa_obs", event.target.value)}
                placeholder="Observacoes especificas"
              />
            </div>
          </div>
        )}

        {cao.servicos?.transporte && (
          <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
            {(cao.transporte_viagens || []).map((viagem, viagemIndex) => (
              <div key={viagemIndex} className="space-y-3 rounded-lg bg-white p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Viagem {viagemIndex + 1}</Label>
                  {(cao.transporte_viagens || []).length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeViagem(viagemIndex)}
                      className="h-8 w-8 text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Partida"
                    value={viagem.partida}
                    onChange={(event) => updateTransporteViagem(viagemIndex, "partida", event.target.value)}
                  />
                  <Input
                    placeholder="Destino"
                    value={viagem.destino}
                    onChange={(event) => updateTransporteViagem(viagemIndex, "destino", event.target.value)}
                  />
                  <DatePickerInput
                    value={viagem.data}
                    onChange={(value) => updateTransporteViagem(viagemIndex, "data", value)}
                  />
                  <TimePickerInput
                    value={viagem.horario}
                    onChange={(value) => updateTransporteViagem(viagemIndex, "horario", value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="KM"
                    value={viagem.km}
                    onChange={(event) => updateTransporteViagem(viagemIndex, "km", event.target.value)}
                  />
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                    <div>
                      <Label className="text-sm font-medium">Do pacote</Label>
                      <p className="text-xs text-gray-500">Transporte do pacote</p>
                    </div>
                    <Switch
                      checked={cao.transporte_do_pacote}
                      onCheckedChange={(checked) => handleChange("transporte_do_pacote", checked)}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Plano ativo</Label>
                <p className="text-xs text-gray-500">Controle informativo</p>
              </div>
              <Switch
                checked={cao.transporte_plano_ativo}
                onCheckedChange={(checked) => handleChange("transporte_plano_ativo", checked)}
              />
            </div>

            <Button type="button" variant="outline" onClick={addViagem} className="w-full border-dashed">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Viagem
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
