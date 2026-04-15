import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { clientRegistration } from "@/api/functions";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Dog,
  HeartPulse,
  LoaderCircle,
  NotebookPen,
  Plus,
  ShieldCheck,
  Trash2,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

const STEP_DEFINITIONS = [
  { id: "responsavel", label: "Responsável", icon: UserRound },
  { id: "caes", label: "Cães", icon: Dog },
  { id: "financeiro", label: "Responsável Financeiro", icon: Wallet },
];

const DOG_SECTION_DEFINITIONS = [
  { id: "basico", label: "Informações básicas", icon: ShieldCheck },
  { id: "alimentacao", label: "Alimentação", icon: UtensilsCrossed },
  { id: "cuidados", label: "Restrições e Cuidados", icon: HeartPulse },
  { id: "observacoes", label: "Observações", icon: NotebookPen },
];

const EMPTY_RESPONSAVEL = {
  nome_completo: "",
  cpf: "",
  celular: "",
  celular_alternativo: "",
  email: "",
};

const EMPTY_FINANCEIRO = {
  nome_razao_social: "",
  cpf_cnpj: "",
  celular: "",
  email: "",
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  vencimento_planos: "",
  contato_orcamentos_nome: "",
  contato_orcamentos_celular: "",
  contato_orcamentos_email: "",
  contato_alinhamentos_nome: "",
  contato_alinhamentos_celular: "",
  contato_alinhamentos_email: "",
};

function createEmptyDog() {
  return {
    nome: "",
    apelido: "",
    raca: "",
    peso: "",
    data_nascimento: "",
    sexo: "",
    porte: "",
    castrado: false,
    alimentacao_marca_racao: "",
    alimentacao_sabor: "",
    alimentacao_tipo: "",
    refeicao_1_qnt: "",
    refeicao_1_horario: "",
    refeicao_1_obs: "",
    refeicao_2_qnt: "",
    refeicao_2_horario: "",
    refeicao_2_obs: "",
    refeicao_3_qnt: "",
    refeicao_3_horario: "",
    refeicao_3_obs: "",
    refeicao_4_qnt: "",
    refeicao_4_horario: "",
    refeicao_4_obs: "",
    alergias: "",
    restricoes_cuidados: "",
    veterinario_responsavel: "",
    veterinario_telefone: "",
    veterinario_clinica_telefone: "",
    veterinario_endereco: "",
    observacoes_gerais: "",
  };
}

function formatCPF(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCpfOrCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function formatCEP(value) {
  return String(value || "").replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
}

function formatDogTitle(dog, index) {
  return dog?.nome?.trim() || `Cão ${index + 1}`;
}

function validateResponsavel(form) {
  if (!form.nome_completo || !form.cpf || !form.celular || !form.email) {
    return "Preencha nome completo, CPF, celular e email do responsável.";
  }
  return "";
}

function validateDogs(dogs) {
  if (!Array.isArray(dogs) || dogs.length === 0) {
    return "Adicione ao menos um cão para continuar.";
  }
  const invalidDog = dogs.find((dog) => !dog.nome || !dog.raca);
  if (invalidDog) {
    return "Cada cão precisa ter pelo menos nome e raça informados.";
  }
  return "";
}

function validateFinanceiro(form) {
  if (
    !form.nome_razao_social
    || !form.cpf_cnpj
    || !form.celular
    || !form.email
    || !form.cep
    || !form.street
    || !form.number
    || !form.neighborhood
    || !form.city
    || !form.state
    || !form.vencimento_planos
  ) {
    return "Preencha os dados principais do responsável financeiro, incluindo endereço e vencimento.";
  }

  if (
    !form.contato_orcamentos_nome
    || !form.contato_orcamentos_celular
    || !form.contato_orcamentos_email
    || !form.contato_alinhamentos_nome
    || !form.contato_alinhamentos_celular
    || !form.contato_alinhamentos_email
  ) {
    return "Preencha os contatos para orçamentos e para avisos e tratativas de alinhamento.";
  }

  return "";
}

function StepSidebar({ currentStep }) {
  return (
    <div className="space-y-3">
      {STEP_DEFINITIONS.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep === index;
        const isDone = currentStep > index;

        return (
          <div
            key={step.id}
            className={`rounded-2xl border p-4 transition ${
              isActive
                ? "border-blue-200 bg-blue-50"
                : isDone
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Etapa {index + 1}
                </p>
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DogSectionSidebar({ activeSection, onSelect }) {
  return (
    <div className="space-y-2">
      {DOG_SECTION_DEFINITIONS.map((section, index) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
              isActive
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ${
                isActive ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {index + 1}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="text-sm font-semibold">{section.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function CadastroClientePublico() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);
  const { companyName, logoUrl, isResolved } = useBranding({ variant: "base" });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [context, setContext] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeDogIndex, setActiveDogIndex] = useState(0);
  const [activeDogSection, setActiveDogSection] = useState("basico");
  const [financeiroIgualResponsavel, setFinanceiroIgualResponsavel] = useState(false);
  const [responsavelForm, setResponsavelForm] = useState(EMPTY_RESPONSAVEL);
  const [caesForm, setCaesForm] = useState([createEmptyDog()]);
  const [financeiroForm, setFinanceiroForm] = useState(EMPTY_FINANCEIRO);

  useEffect(() => {
    loadContext();
  }, [token]);

  useEffect(() => {
    const cepDigits = financeiroForm.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return undefined;

    let cancelled = false;

    async function fetchAddress() {
      setAddressLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json();
        if (cancelled || data?.erro) return;

        setFinanceiroForm((current) => ({
          ...current,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state,
        }));
      } catch (error) {
        console.warn("Erro ao buscar CEP do responsável financeiro:", error);
      } finally {
        if (!cancelled) {
          setAddressLoading(false);
        }
      }
    }

    fetchAddress();

    return () => {
      cancelled = true;
    };
  }, [financeiroForm.cep]);

  useEffect(() => {
    if (!financeiroIgualResponsavel) return;

    setFinanceiroForm((current) => ({
      ...current,
      nome_razao_social: responsavelForm.nome_completo || current.nome_razao_social,
      cpf_cnpj: responsavelForm.cpf || current.cpf_cnpj,
      celular: responsavelForm.celular || current.celular,
      email: responsavelForm.email || current.email,
    }));
  }, [financeiroIgualResponsavel, responsavelForm]);

  async function loadContext() {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!token) {
      setErrorMessage("Link de cadastro inválido. Solicite um novo link à equipe da Dog City Brasil.");
      setIsLoading(false);
      return;
    }

    try {
      const data = await clientRegistration({
        action: "get_context",
        token,
      });
      setContext(data || null);
      setResponsavelForm((current) => ({
        ...current,
        nome_completo: data?.link?.responsavel_nome || current.nome_completo,
        email: data?.link?.responsavel_email || current.email,
      }));
    } catch (error) {
      console.error("Erro ao carregar contexto do cadastro do cliente:", error);
      setErrorMessage(error?.message || "Não foi possível carregar este link de cadastro.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateDog(index, patch) {
    setCaesForm((current) => current.map((dog, dogIndex) => (
      dogIndex === index ? { ...dog, ...patch } : dog
    )));
  }

  function addDog() {
    setCaesForm((current) => [...current, createEmptyDog()]);
    setActiveDogIndex(caesForm.length);
    setActiveDogSection("basico");
  }

  function removeDog(index) {
    setCaesForm((current) => {
      if (current.length <= 1) return current;
      return current.filter((_, dogIndex) => dogIndex !== index);
    });
    setActiveDogIndex((current) => Math.max(0, Math.min(current, caesForm.length - 2)));
  }

  function handleNextStep() {
    const validationError = currentStep === 0
      ? validateResponsavel(responsavelForm)
      : currentStep === 1
        ? validateDogs(caesForm)
        : validateFinanceiro(financeiroForm);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setCurrentStep((current) => Math.min(current + 1, STEP_DEFINITIONS.length - 1));
  }

  function handlePreviousStep() {
    setErrorMessage("");
    setCurrentStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit() {
    const financeError = validateFinanceiro(financeiroForm);
    if (financeError) {
      setErrorMessage(financeError);
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await clientRegistration({
        action: "submit",
        token,
        payload: {
          responsavel: responsavelForm,
          caes: caesForm,
          financeiro: {
            ...financeiroForm,
            usar_dados_responsavel: financeiroIgualResponsavel,
          },
        },
      });

      setSuccessMessage("Cadastro enviado com sucesso. Nossa equipe vai seguir com os próximos passos.");
    } catch (error) {
      console.error("Erro ao concluir cadastro do cliente:", error);
      setErrorMessage(error?.message || "Não foi possível concluir o cadastro.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderResponsavelStep() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Nome completo *</Label>
          <Input
            value={responsavelForm.nome_completo}
            onChange={(event) => setResponsavelForm((current) => ({ ...current, nome_completo: event.target.value }))}
            placeholder="Nome do responsável"
          />
        </div>
        <div>
          <Label>CPF *</Label>
          <Input
            value={responsavelForm.cpf}
            onChange={(event) => setResponsavelForm((current) => ({ ...current, cpf: formatCPF(event.target.value) }))}
            maxLength={14}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <Label>Celular *</Label>
          <Input
            value={responsavelForm.celular}
            onChange={(event) => setResponsavelForm((current) => ({ ...current, celular: formatPhone(event.target.value) }))}
            maxLength={15}
            placeholder="(00) 00000-0000"
          />
        </div>
        <div>
          <Label>Celular alternativo</Label>
          <Input
            value={responsavelForm.celular_alternativo}
            onChange={(event) => setResponsavelForm((current) => ({ ...current, celular_alternativo: formatPhone(event.target.value) }))}
            maxLength={15}
            placeholder="(00) 00000-0000"
          />
        </div>
        <div>
          <Label>Email *</Label>
          <Input
            type="email"
            value={responsavelForm.email}
            onChange={(event) => setResponsavelForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="email@exemplo.com"
          />
        </div>
      </div>
    );
  }

  function renderDogBasicSection(dog, dogIndex) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Nome *</Label>
          <Input value={dog.nome} onChange={(event) => updateDog(dogIndex, { nome: event.target.value })} />
        </div>
        <div>
          <Label>Apelido</Label>
          <Input value={dog.apelido} onChange={(event) => updateDog(dogIndex, { apelido: event.target.value })} />
        </div>
        <div>
          <Label>Raça *</Label>
          <Input value={dog.raca} onChange={(event) => updateDog(dogIndex, { raca: event.target.value })} />
        </div>
        <div>
          <Label>Peso (kg)</Label>
          <Input value={dog.peso} onChange={(event) => updateDog(dogIndex, { peso: event.target.value })} placeholder="Ex: 12.5" />
        </div>
        <div>
          <Label>Data de nascimento</Label>
          <DatePickerInput value={dog.data_nascimento} onChange={(value) => updateDog(dogIndex, { data_nascimento: value })} />
        </div>
        <div>
          <Label>Sexo</Label>
          <Select value={dog.sexo || ""} onValueChange={(value) => updateDog(dogIndex, { sexo: value })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="macho">Macho</SelectItem>
              <SelectItem value="femea">Fêmea</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Porte</Label>
          <Select value={dog.porte || ""} onValueChange={(value) => updateDog(dogIndex, { porte: value })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pequeno">Pequeno</SelectItem>
              <SelectItem value="medio">Médio</SelectItem>
              <SelectItem value="grande">Grande</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Castrado</p>
            <p className="text-xs text-slate-500">Informe se o cão já é castrado.</p>
          </div>
          <Switch checked={!!dog.castrado} onCheckedChange={(checked) => updateDog(dogIndex, { castrado: checked })} />
        </div>
      </div>
    );
  }

  function renderDogMealRow(dog, dogIndex, mealIndex) {
    const key = mealIndex + 1;
    return (
      <div key={key} className="rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">{key}ª refeição</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <Label>Quantidade</Label>
            <Input
              value={dog[`refeicao_${key}_qnt`]}
              onChange={(event) => updateDog(dogIndex, { [`refeicao_${key}_qnt`]: event.target.value })}
              placeholder="Ex: 120g"
            />
          </div>
          <div>
            <Label>Horário</Label>
            <TimePickerInput
              value={dog[`refeicao_${key}_horario`]}
              onChange={(value) => updateDog(dogIndex, { [`refeicao_${key}_horario`]: value })}
            />
          </div>
          <div>
            <Label>Observação</Label>
            <Input
              value={dog[`refeicao_${key}_obs`]}
              onChange={(event) => updateDog(dogIndex, { [`refeicao_${key}_obs`]: event.target.value })}
              placeholder="Ex: misturar com sachê"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderDogAlimentacaoSection(dog, dogIndex) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Marca da ração</Label>
            <Input value={dog.alimentacao_marca_racao} onChange={(event) => updateDog(dogIndex, { alimentacao_marca_racao: event.target.value })} />
          </div>
          <div>
            <Label>Sabor</Label>
            <Input value={dog.alimentacao_sabor} onChange={(event) => updateDog(dogIndex, { alimentacao_sabor: event.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Input value={dog.alimentacao_tipo} onChange={(event) => updateDog(dogIndex, { alimentacao_tipo: event.target.value })} placeholder="Ex: seca, úmida, natural" />
          </div>
        </div>
        {[0, 1, 2, 3].map((mealIndex) => renderDogMealRow(dog, dogIndex, mealIndex))}
      </div>
    );
  }

  function renderDogCuidadosSection(dog, dogIndex) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Alergias</Label>
          <Textarea value={dog.alergias} onChange={(event) => updateDog(dogIndex, { alergias: event.target.value })} rows={3} />
        </div>
        <div className="md:col-span-2">
          <Label>Restrições e cuidados</Label>
          <Textarea value={dog.restricoes_cuidados} onChange={(event) => updateDog(dogIndex, { restricoes_cuidados: event.target.value })} rows={4} />
        </div>
        <div>
          <Label>Veterinário responsável</Label>
          <Input value={dog.veterinario_responsavel} onChange={(event) => updateDog(dogIndex, { veterinario_responsavel: event.target.value })} />
        </div>
        <div>
          <Label>Telefone do veterinário</Label>
          <Input
            value={dog.veterinario_telefone}
            onChange={(event) => updateDog(dogIndex, { veterinario_telefone: formatPhone(event.target.value) })}
            maxLength={15}
          />
        </div>
        <div>
          <Label>Telefone da clínica</Label>
          <Input
            value={dog.veterinario_clinica_telefone}
            onChange={(event) => updateDog(dogIndex, { veterinario_clinica_telefone: formatPhone(event.target.value) })}
            maxLength={15}
          />
        </div>
        <div>
          <Label>Endereço veterinário / clínica</Label>
          <Input value={dog.veterinario_endereco} onChange={(event) => updateDog(dogIndex, { veterinario_endereco: event.target.value })} />
        </div>
      </div>
    );
  }

  function renderDogObservacoesSection(dog, dogIndex) {
    return (
      <div>
        <Label>Observações gerais</Label>
        <Textarea
          value={dog.observacoes_gerais}
          onChange={(event) => updateDog(dogIndex, { observacoes_gerais: event.target.value })}
          rows={6}
          placeholder="Informe aqui detalhes importantes sobre comportamento, rotina, preferências ou observações gerais."
        />
      </div>
    );
  }

  function renderDogsStep() {
    const currentDog = caesForm[activeDogIndex] || createEmptyDog();

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            {caesForm.map((dog, index) => (
              <button
                key={`dog-${index}`}
                type="button"
                onClick={() => setActiveDogIndex(index)}
                className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
                  activeDogIndex === index
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Dog className="h-4 w-4" />
                <span>{formatDogTitle(dog, index)}</span>
              </button>
            ))}
            <Button type="button" variant="outline" onClick={addDog} className="rounded-2xl">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar cão
            </Button>
            {caesForm.length > 1 ? (
              <Button type="button" variant="outline" onClick={() => removeDog(activeDogIndex)} className="rounded-2xl text-rose-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Remover atual
              </Button>
            ) : null}
          </div>

          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl">{formatDogTitle(currentDog, activeDogIndex)}</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {activeDogSection === "basico" ? renderDogBasicSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "alimentacao" ? renderDogAlimentacaoSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "cuidados" ? renderDogCuidadosSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "observacoes" ? renderDogObservacoesSection(currentDog, activeDogIndex) : null}
            </CardContent>
          </Card>
        </div>

        <div>
          <DogSectionSidebar activeSection={activeDogSection} onSelect={setActiveDogSection} />
        </div>
      </div>
    );
  }

  function renderFinanceiroStep() {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Usar os mesmos dados do responsável</p>
            <p className="text-xs text-slate-500">Prefill automático para nome, documento, celular e email.</p>
          </div>
          <Switch checked={financeiroIgualResponsavel} onCheckedChange={setFinanceiroIgualResponsavel} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Nome / Razão social *</Label>
            <Input value={financeiroForm.nome_razao_social} onChange={(event) => setFinanceiroForm((current) => ({ ...current, nome_razao_social: event.target.value }))} />
          </div>
          <div>
            <Label>CPF / CNPJ *</Label>
            <Input value={financeiroForm.cpf_cnpj} onChange={(event) => setFinanceiroForm((current) => ({ ...current, cpf_cnpj: formatCpfOrCnpj(event.target.value) }))} maxLength={18} />
          </div>
          <div>
            <Label>Celular *</Label>
            <Input value={financeiroForm.celular} onChange={(event) => setFinanceiroForm((current) => ({ ...current, celular: formatPhone(event.target.value) }))} maxLength={15} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={financeiroForm.email} onChange={(event) => setFinanceiroForm((current) => ({ ...current, email: event.target.value }))} />
          </div>
          <div>
            <Label>CEP *</Label>
            <Input value={financeiroForm.cep} onChange={(event) => setFinanceiroForm((current) => ({ ...current, cep: formatCEP(event.target.value) }))} maxLength={9} />
            <p className="mt-1 text-xs text-slate-500">
              {addressLoading ? "Buscando endereço..." : "Rua, bairro, cidade e estado serão preenchidos pelo CEP."}
            </p>
          </div>
          <div>
            <Label>Número *</Label>
            <Input value={financeiroForm.number} onChange={(event) => setFinanceiroForm((current) => ({ ...current, number: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Rua *</Label>
            <Input value={financeiroForm.street} onChange={(event) => setFinanceiroForm((current) => ({ ...current, street: event.target.value }))} />
          </div>
          <div>
            <Label>Bairro *</Label>
            <Input value={financeiroForm.neighborhood} onChange={(event) => setFinanceiroForm((current) => ({ ...current, neighborhood: event.target.value }))} />
          </div>
          <div>
            <Label>Cidade *</Label>
            <Input value={financeiroForm.city} onChange={(event) => setFinanceiroForm((current) => ({ ...current, city: event.target.value }))} />
          </div>
          <div>
            <Label>Estado *</Label>
            <Input value={financeiroForm.state} onChange={(event) => setFinanceiroForm((current) => ({ ...current, state: event.target.value }))} maxLength={2} />
          </div>
          <div>
            <Label>Vencimento de planos *</Label>
            <Select value={financeiroForm.vencimento_planos || ""} onValueChange={(value) => setFinanceiroForm((current) => ({ ...current, vencimento_planos: value }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="05">Aos dias 05</SelectItem>
                <SelectItem value="20">Aos dias 20</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Contato para envio de orçamentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Nome *</Label>
              <Input value={financeiroForm.contato_orcamentos_nome} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_nome: event.target.value }))} />
            </div>
            <div>
              <Label>Celular *</Label>
              <Input value={financeiroForm.contato_orcamentos_celular} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_celular: formatPhone(event.target.value) }))} maxLength={15} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={financeiroForm.contato_orcamentos_email} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_email: event.target.value }))} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Contato para avisos e tratativas de alinhamento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Nome *</Label>
              <Input value={financeiroForm.contato_alinhamentos_nome} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_nome: event.target.value }))} />
            </div>
            <div>
              <Label>Celular *</Label>
              <Input value={financeiroForm.contato_alinhamentos_celular} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_celular: formatPhone(event.target.value) }))} maxLength={15} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={financeiroForm.contato_alinhamentos_email} onChange={(event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_email: event.target.value }))} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressValue = ((currentStep + 1) / STEP_DEFINITIONS.length) * 100;
  const pageTitle = context?.empresa?.nome_fantasia || companyName;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-4 text-sm text-slate-600">Carregando ficha de cadastro...</p>
        </div>
      </div>
    );
  }

  if (successMessage) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl">
          <Card className="border-emerald-200 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
              <h1 className="mt-5 text-3xl font-brand text-slate-900">Cadastro recebido</h1>
              <p className="mt-3 text-sm text-slate-600">{successMessage}</p>
              <p className="mt-2 text-sm text-slate-500">
                Unidade: <strong>{pageTitle}</strong>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
        <div className="mx-auto max-w-3xl">
          <Card className="border-rose-200 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="mx-auto h-12 w-12 text-rose-600" />
              <h1 className="mt-5 text-3xl font-brand text-slate-900">Link indisponível</h1>
              <p className="mt-3 text-sm text-slate-600">
                {errorMessage || "Não foi possível carregar este cadastro. Solicite um novo link à equipe da Dog City Brasil."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-6 text-center">
                {isResolved && logoUrl ? (
                  <img src={logoUrl} alt={companyName} className="mx-auto h-20 w-20 object-contain" />
                ) : (
                  <div className="mx-auto h-20 w-20 rounded-3xl bg-slate-100" />
                )}
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.25em] text-blue-500">Cadastro do cliente</p>
                <h1 className="mt-3 text-2xl font-brand text-slate-900">{pageTitle}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Preencha os dados abaixo para concluir a ficha cadastral.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Avanço</span>
                  <span className="text-sm text-slate-500">{Math.round(progressValue)}%</span>
                </div>
                <Progress value={progressValue} className="h-2 bg-slate-100" />
              </CardContent>
            </Card>

            <StepSidebar currentStep={currentStep} />
          </div>

          <div className="space-y-5">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-2xl text-slate-900">{STEP_DEFINITIONS[currentStep].label}</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {currentStep === 0 ? renderResponsavelStep() : null}
                {currentStep === 1 ? renderDogsStep() : null}
                {currentStep === 2 ? renderFinanceiroStep() : null}
              </CardContent>
            </Card>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                Etapa {currentStep + 1} de {STEP_DEFINITIONS.length}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={currentStep === 0 || isSaving}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                {currentStep < STEP_DEFINITIONS.length - 1 ? (
                  <Button type="button" onClick={handleNextStep} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Continuar
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleSubmit} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                    {isSaving ? "Enviando..." : "Enviar cadastro"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
