import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import { AlertTriangle, CalendarClock, CreditCard, Dog, Plus, Sparkles, Trash2, X } from "lucide-react";

const TOSA_HIGIENICA_OPTIONS = [
  { id: "pequeno_baixa", label: "Pequeno - Pelagem baixa" },
  { id: "pequeno_alta", label: "Pequeno - Pelagem alta" },
  { id: "medio_baixa", label: "Medio - Pelagem baixa" },
  { id: "medio_alta", label: "Medio - Pelagem alta" },
  { id: "grande_baixa", label: "Grande - Pelagem baixa" },
  { id: "grande_alta", label: "Grande - Pelagem alta" },
];

const SERVICE_CARDS = [
  { id: "day_care", label: "Day Care", description: "Avulso por cao", tone: "bg-emerald-50" },
  { id: "hospedagem", label: "Hospedagem", description: "Diarias e pernoite", tone: "bg-blue-50" },
  { id: "adaptacao", label: "Adaptacao", description: "Sessao avulsa com horario definido", tone: "bg-sky-50" },
  { id: "banho", label: "Banho", description: "Servico por raca", tone: "bg-cyan-50" },
  { id: "tosa", label: "Tosa", description: "Higienica, geral ou detalhada", tone: "bg-purple-50" },
  { id: "transporte", label: "Transporte", description: "Viagens por km", tone: "bg-amber-50" },
];

function EmptyTrip() {
  return {
    partida: "",
    destino: "",
    data: "",
    horario: "",
    horario_fim: "",
    km: "",
    observacao: "",
  };
}

function getPlanServiceLabel(serviceId) {
  return ({
    day_care: "Day Care",
    hospedagem: "Hospedagem",
    transporte: "Transporte",
    banho: "Banho",
    banho_tosa: "Banho & Tosa",
    tosa: "Tosa",
  }[serviceId] || serviceId || "Plano");
}

function getPlanFrequencyLabel(value) {
  return ({
    "1x_semana": "1x por semana",
    "2x_semana": "2x por semana",
    "3x_semana": "3x por semana",
    "4x_semana": "4x por semana",
    "5x_semana": "5x por semana",
    quinzenal: "Quinzenal",
    toda_semana: "Toda semana",
    ultima_semana_mes: "Ultima semana do mes",
    primeira_semana: "Primeira semana",
    segunda_semana: "Segunda semana",
    quarta_semana: "Quarta semana",
  }[value] || value || "Ativo");
}

function StatusPill({ activeLabel, inactiveLabel, active }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export default function OrcamentoCaoForm({
  cao,
  index,
  dogs,
  precos,
  recurringContext = null,
  onUpdate,
  onRemove,
  canRemove,
  title = "",
  description = "",
  visibleServices = null,
  hideServiceSelector = false,
}) {
  const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  function updateCao(patch) {
    onUpdate(index, { ...cao, ...patch });
  }

  function handleChange(field, value) {
    updateCao({ [field]: value });
  }

  function handleServiceChange(service, checked) {
    updateCao({
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
      EmptyTrip(),
    ]);
  }

  function removeViagem(viagemIndex) {
    handleChange(
      "transporte_viagens",
      (cao.transporte_viagens || []).filter((_, currentIndex) => currentIndex !== viagemIndex),
    );
  }

  const selectedDog = dogs.find((dog) => dog.id === cao.dog_id);
  const shouldShowService = (serviceId) => !Array.isArray(visibleServices) || visibleServices.includes(serviceId);
  const selectedBathOption = (recurringContext?.pendingBathOptions || []).find((item) => item.id === cao.banho_reuse_appointment_id) || null;
  const selectedBathMoveTargets = (recurringContext?.pendingBathOnlyOptions || []).filter((item) => item.id !== selectedBathOption?.id);
  const selectedTosaOption = (recurringContext?.pendingGroomingOptions || []).find((item) => item.id === cao.tosa_reuse_appointment_id) || null;

  return (
    <Card className="border-blue-200 bg-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Dog className="h-5 w-5 text-blue-600" />
              {title || `Cao ${index + 1}`}
            </CardTitle>
            {description ? (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            ) : null}
          </div>
          {canRemove ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(index)}
              className="h-8 w-8 text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <Label>Selecionar cao *</Label>
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

        {selectedDog && recurringContext?.plans?.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 text-slate-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">Fiscalizacao de mensalidades ativas</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {recurringContext.plans.map((plan) => (
                    <span key={plan.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      {getPlanServiceLabel(plan.service_id)} • {getPlanFrequencyLabel(plan.schedule_rule || plan.frequency)}
                    </span>
                  ))}
                </div>
                {recurringContext?.mensalistaBlockReason ? (
                  <p className="mt-2 text-xs text-amber-700">{recurringContext.mensalistaBlockReason}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!hideServiceSelector ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SERVICE_CARDS.filter((service) => shouldShowService(service.id)).map((service) => (
              <div key={service.id} className={`flex items-center justify-between rounded-lg p-3 ${service.tone}`}>
                <div>
                  <Label className="text-sm font-medium">{service.label}</Label>
                  <p className="text-xs text-gray-500">{service.description}</p>
                </div>
                <Switch
                  checked={Boolean(cao.servicos?.[service.id])}
                  onCheckedChange={(checked) => handleServiceChange(service.id, checked)}
                />
              </div>
            ))}
          </div>
        ) : null}

        {shouldShowService("day_care") && cao.servicos?.day_care ? (
          <div className="space-y-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="rounded-lg bg-white p-3">
              <p className="text-sm font-medium text-gray-900">Day Care avulso</p>
              <p className="mt-1 text-xs text-gray-500">
                Sem pacote ativo: {formatCurrency(precos?.day_care_avulso_sem_pacote ?? precos?.day_care_avulso ?? 125)}
                {" | "}Com pacote ativo: {formatCurrency(precos?.day_care_avulso_com_pacote ?? 110)}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Cao com pacote de Day Care ativo?</Label>
                <p className="text-xs text-gray-500">
                  {recurringContext?.dayCarePlan
                    ? `Plano detectado automaticamente: ${recurringContext.mensalistaSummary || "Day Care ativo"}.`
                    : "Sem Day Care ativo detectado para este cao."}
                </p>
              </div>
              <StatusPill active={Boolean(cao.day_care_plano_ativo)} activeLabel="Plano ativo" inactiveLabel="Avulso" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Data</Label>
                <DatePickerInput className="mt-1" value={cao.day_care_data} onChange={(value) => handleChange("day_care_data", value)} />
              </div>
              <div>
                <Label>Horario de entrada</Label>
                <TimePickerInput className="mt-1" value={cao.day_care_horario_entrada} onChange={(value) => handleChange("day_care_horario_entrada", value)} />
              </div>
              <div>
                <Label>Horario de saida</Label>
                <TimePickerInput className="mt-1" value={cao.day_care_horario_saida} onChange={(value) => handleChange("day_care_horario_saida", value)} />
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
        ) : null}

        {shouldShowService("hospedagem") && cao.servicos?.hospedagem ? (
          <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
            <div className={`rounded-lg border p-3 ${cao.hosp_is_mensalista ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start gap-2">
                <CalendarClock className={`mt-0.5 h-4 w-4 ${cao.hosp_is_mensalista ? "text-emerald-700" : "text-amber-700"}`} />
                <div>
                  <Label className="text-sm font-medium">
                    {cao.hosp_is_mensalista ? "Desconto mensalista aplicado" : "Hospedagem sem desconto mensalista"}
                  </Label>
                  <p className="mt-1 text-xs text-gray-600">
                    {cao.hosp_is_mensalista
                      ? `Elegivel porque o cao possui ${recurringContext?.mensalistaSummary || "Day Care ativo semanal"} em vigor.`
                      : recurringContext?.dayCarePlan
                        ? "O cao possui Day Care ativo, mas o plano quinzenal nao recebe o desconto de mensalista na hospedagem."
                        : "Nao existe Day Care ativo elegivel para aplicar a diaria reduzida."}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Data de entrada</Label>
                <DatePickerInput className="mt-1" value={cao.hosp_data_entrada} onChange={(value) => handleChange("hosp_data_entrada", value)} />
              </div>
              <div>
                <Label>Horario de entrada</Label>
                <TimePickerInput className="mt-1" value={cao.hosp_horario_entrada} onChange={(value) => handleChange("hosp_horario_entrada", value)} />
              </div>
              <div>
                <Label>Data de saida</Label>
                <DatePickerInput className="mt-1" value={cao.hosp_data_saida} onChange={(value) => handleChange("hosp_data_saida", value)} />
              </div>
              <div>
                <Label>Horario de saida</Label>
                <TimePickerInput className="mt-1" value={cao.hosp_horario_saida} onChange={(value) => handleChange("hosp_horario_saida", value)} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Dormitorio compartilhado?</Label>
                <p className="text-xs text-gray-500">Aplica desconto no proprio cao</p>
              </div>
              <Switch
                checked={Boolean(cao["hosp_dormitÃ³rio_compartilhado"])}
                onCheckedChange={(checked) => handleChange("hosp_dormitÃ³rio_compartilhado", checked)}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => handleChange("hosp_datas_daycare", [...(cao.hosp_datas_daycare || []), ""])}
                className="w-full border-dashed"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar data
              </Button>
            </div>
          </div>
        ) : null}

        {shouldShowService("adaptacao") && cao.servicos?.adaptacao ? (
          <div className="space-y-4 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
            <div className="rounded-lg bg-white p-3">
              <p className="text-sm font-medium text-gray-900">Adaptacao</p>
              <p className="mt-1 text-xs text-gray-500">Valor configurado: {formatCurrency(precos?.adaptacao ?? 0)}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Data</Label>
                <DatePickerInput className="mt-1" value={cao.adaptacao_data} onChange={(value) => handleChange("adaptacao_data", value)} />
              </div>
              <div>
                <Label>Horario de inicio</Label>
                <TimePickerInput className="mt-1" value={cao.adaptacao_horario_entrada} onChange={(value) => handleChange("adaptacao_horario_entrada", value)} />
              </div>
              <div>
                <Label>Horario de termino</Label>
                <TimePickerInput className="mt-1" value={cao.adaptacao_horario_saida} onChange={(value) => handleChange("adaptacao_horario_saida", value)} />
              </div>
            </div>

            <div>
              <Label>Observacoes da adaptacao</Label>
              <Textarea
                className="mt-1"
                value={cao.adaptacao_observacoes || ""}
                onChange={(event) => handleChange("adaptacao_observacoes", event.target.value)}
                rows={3}
                placeholder="Ex.: tolerou bem o ambiente, precisa de nova etapa, avisar comercial"
              />
            </div>
          </div>
        ) : null}

        {shouldShowService("banho") && cao.servicos?.banho ? (
          <div className="space-y-4 rounded-lg border border-cyan-100 bg-cyan-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Raca para banho</Label>
                <Input className="mt-1" value={cao.banho_raca || selectedDog?.raca || ""} onChange={(event) => handleChange("banho_raca", event.target.value)} />
              </div>
              <div>
                <Label>Data do banho</Label>
                <DatePickerInput className="mt-1" value={cao.banho_data} onChange={(value) => handleChange("banho_data", value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Horario de inicio</Label>
                <TimePickerInput className="mt-1" value={cao.banho_horario_inicio || cao.banho_horario} onChange={(value) => updateCao({ banho_horario_inicio: value, banho_horario: value })} />
              </div>
              <div>
                <Label>Horario de termino</Label>
                <TimePickerInput className="mt-1" value={cao.banho_horario_saida} onChange={(value) => handleChange("banho_horario_saida", value)} />
              </div>
            </div>

            <div>
              <Label>Observacoes do banho</Label>
              <Textarea
                className="mt-1"
                value={cao.banho_observacoes || ""}
                onChange={(event) => handleChange("banho_observacoes", event.target.value)}
                rows={3}
                placeholder="Ex.: alergias, materiais, detalhes operacionais"
              />
            </div>

            <div className="space-y-3 rounded-lg bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Banhos do plano sem check-in</Label>
                  <p className="text-xs text-gray-500">
                    {recurringContext?.hasBathPlan
                      ? "Se o cliente quiser aproveitar um banho do plano, selecione abaixo e o atendimento sera remanejado para a nova data do orcamento."
                      : "Este cao nao possui plano ativo de banho ou banho & tosa."}
                  </p>
                </div>
                <StatusPill active={Boolean(cao.banho_do_pacote)} activeLabel="Usando o plano" inactiveLabel="Banho avulso" />
              </div>

              {recurringContext?.hasBathPlan ? (
                recurringContext.pendingBathOptions.length > 0 ? (
                  <Select
                    value={cao.banho_reuse_appointment_id || "__none__"}
                    onValueChange={(value) => updateCao({
                      banho_reuse_appointment_id: value === "__none__" ? "" : value,
                    })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Escolha um banho pendente do plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nao usar um banho ja agendado</SelectItem>
                      {recurringContext.pendingBathOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Existe plano ativo, mas nao ha banho pendente sem check-in para reaproveitar agora.
                  </p>
                )
              ) : null}

              {selectedBathOption ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  O orcamento vai reutilizar o agendamento de {selectedBathOption.date_label}
                  {selectedBathOption.time_label ? ` (${selectedBathOption.time_label})` : ""}.
                </div>
              ) : null}

              {selectedBathOption?.has_grooming ? (
                <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Este banho possui tosa vinculada</p>
                      <p className="mt-1 text-xs text-amber-800">
                        Escolha se a tosa acompanha a nova data do banho, se sera movida para outro banho ja previsto ou se vira credito na carteira do responsavel financeiro.
                      </p>
                    </div>
                  </div>

                  <Select
                    value={cao.banho_grooming_resolution || "__empty__"}
                    onValueChange={(value) => updateCao({
                      banho_grooming_resolution: value === "__empty__" ? "" : value,
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Como tratar a tosa deste banho?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Manter a tosa com o banho</SelectItem>
                      <SelectItem value="move">Mover a tosa para outro banho</SelectItem>
                      <SelectItem value="credit">Converter a tosa em credito</SelectItem>
                    </SelectContent>
                  </Select>

                  {cao.banho_grooming_resolution === "move" ? (
                    selectedBathMoveTargets.length > 0 ? (
                      <Select
                        value={cao.banho_grooming_target_appointment_id || "__empty__"}
                        onValueChange={(value) => updateCao({
                          banho_grooming_target_appointment_id: value === "__empty__" ? "" : value,
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha o banho que vai receber a tosa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__empty__">Selecione o novo dia da tosa</SelectItem>
                          {selectedBathMoveTargets.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-2 text-xs text-amber-800">
                        Nao existe outro banho do plano sem tosa para receber esse remanejamento. Neste caso, mantenha a tosa junto ou converta em credito.
                      </p>
                    )
                  ) : null}

                  {cao.banho_grooming_resolution === "credit" ? (
                    <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                      <CreditCard className="mt-0.5 h-4 w-4" />
                      <p>Na aprovacao do orcamento, a tosa removida deste banho sera convertida em credito na carteira financeira vinculada ao responsavel.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {shouldShowService("tosa") && cao.servicos?.tosa ? (
          <div className="space-y-4 rounded-lg border border-purple-100 bg-purple-50/50 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Data da tosa</Label>
                <DatePickerInput className="mt-1" value={cao.tosa_data} onChange={(value) => handleChange("tosa_data", value)} />
              </div>
              <div>
                <Label>Horario de inicio</Label>
                <TimePickerInput className="mt-1" value={cao.tosa_horario_entrada} onChange={(value) => handleChange("tosa_horario_entrada", value)} />
              </div>
              <div>
                <Label>Horario de termino</Label>
                <TimePickerInput className="mt-1" value={cao.tosa_horario_saida} onChange={(value) => handleChange("tosa_horario_saida", value)} />
              </div>
            </div>

            <div>
              <Label>Tipo de tosa</Label>
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

            {cao.tosa_tipo === "higienica" ? (
              <div>
                <Label>Subtipo higienica</Label>
                <Select value={cao.tosa_subtipo_higienica} onValueChange={(value) => handleChange("tosa_subtipo_higienica", value)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Escolha o subtipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOSA_HIGIENICA_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label className="text-sm font-medium">Tosas do plano sem check-in</Label>
                  <p className="text-xs text-gray-500">
                    {recurringContext?.hasGroomingPlan
                      ? "Se quiser usar uma tosa do plano, selecione uma data pendente. O banho do mesmo dia acompanha a nova data."
                      : "Este cao nao possui plano ativo de banho & tosa com tosa pendente."}
                  </p>
                </div>
                <StatusPill active={Boolean(cao.tosa_do_pacote)} activeLabel="Usando o plano" inactiveLabel="Tosa avulsa" />
              </div>

              {recurringContext?.hasGroomingPlan ? (
                recurringContext.pendingGroomingOptions.length > 0 ? (
                  <Select
                    value={cao.tosa_reuse_appointment_id || "__none__"}
                    onValueChange={(value) => updateCao({
                      tosa_reuse_appointment_id: value === "__none__" ? "" : value,
                    })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Escolha uma tosa pendente do plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nao usar uma tosa ja agendada</SelectItem>
                      {recurringContext.pendingGroomingOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Existe plano ativo, mas nao ha tosa pendente sem check-in para reaproveitar agora.
                  </p>
                )
              ) : null}

              {selectedTosaOption ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  A tosa de {selectedTosaOption.date_label}
                  {selectedTosaOption.time_label ? ` (${selectedTosaOption.time_label})` : ""}
                  {" "}sera movida junto com o banho do mesmo dia para a nova data informada no orcamento.
                </div>
              ) : null}

              {cao.tosa_do_pacote ? (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <CalendarClock className="mt-0.5 h-4 w-4" />
                  <p>A tosa so pode acontecer com banho no mesmo dia. Ao reutilizar uma tosa do plano, o banho correspondente acompanha automaticamente o remanejamento.</p>
                </div>
              ) : null}
            </div>

            <div>
              <Label>Observacoes da tosa</Label>
              <Textarea
                className="mt-1"
                value={cao.tosa_obs}
                onChange={(event) => handleChange("tosa_obs", event.target.value)}
                rows={3}
                placeholder="Observacoes especificas"
              />
            </div>
          </div>
        ) : null}

        {shouldShowService("transporte") && cao.servicos?.transporte ? (
          <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/50 p-4">
            {(cao.transporte_viagens || []).map((viagem, viagemIndex) => (
              <div key={viagemIndex} className="space-y-3 rounded-lg bg-white p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Viagem {viagemIndex + 1}</Label>
                  {(cao.transporte_viagens || []).length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeViagem(viagemIndex)}
                      className="h-8 w-8 text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input placeholder="Partida" value={viagem.partida} onChange={(event) => updateTransporteViagem(viagemIndex, "partida", event.target.value)} />
                  <Input placeholder="Destino" value={viagem.destino} onChange={(event) => updateTransporteViagem(viagemIndex, "destino", event.target.value)} />
                  <DatePickerInput value={viagem.data} onChange={(value) => updateTransporteViagem(viagemIndex, "data", value)} />
                  <TimePickerInput value={viagem.horario} onChange={(value) => updateTransporteViagem(viagemIndex, "horario", value)} />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TimePickerInput value={viagem.horario_fim} onChange={(value) => updateTransporteViagem(viagemIndex, "horario_fim", value)} />
                  <Input placeholder="KM" value={viagem.km} onChange={(event) => updateTransporteViagem(viagemIndex, "km", event.target.value)} />
                </div>

                <Textarea
                  value={viagem.observacao || ""}
                  onChange={(event) => updateTransporteViagem(viagemIndex, "observacao", event.target.value)}
                  rows={2}
                  placeholder="Observacoes do transporte"
                />

                <div className="flex items-center justify-between rounded-lg bg-amber-50 p-3">
                  <div>
                    <Label className="text-sm font-medium">Do pacote</Label>
                    <p className="text-xs text-gray-500">Transporte do pacote</p>
                  </div>
                  <Switch checked={cao.transporte_do_pacote} onCheckedChange={(checked) => handleChange("transporte_do_pacote", checked)} />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between rounded-lg bg-white p-3">
              <div>
                <Label className="text-sm font-medium">Plano ativo</Label>
                <p className="text-xs text-gray-500">Controle informativo</p>
              </div>
              <Switch checked={cao.transporte_plano_ativo} onCheckedChange={(checked) => handleChange("transporte_plano_ativo", checked)} />
            </div>

            <Button type="button" variant="outline" onClick={addViagem} className="w-full border-dashed">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar viagem
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
