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
import { normalizeCpfDigits, validateCpfWithGov } from "@/lib/cpf-validation";
import { createEmptyDogMeal } from "@/lib/dog-form-utils";
import {
  AlertTriangle,
  CircleAlert,
  Check,
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
  { id: "responsavel", label: "ResponsÃ¡vel", icon: UserRound },
  { id: "caes", label: "CÃ£es", icon: Dog },
  { id: "financeiro", label: "ResponsÃ¡vel Financeiro", icon: Wallet },
];

const DOG_SECTION_DEFINITIONS = [
  { id: "basico", label: "InformaÃ§Ãµes bÃ¡sicas", icon: ShieldCheck },
  { id: "alimentacao", label: "AlimentaÃ§Ã£o", icon: UtensilsCrossed },
  { id: "cuidados", label: "RestriÃ§Ãµes e Cuidados", icon: HeartPulse },
  { id: "observacoes", label: "ObservaÃ§Ãµes", icon: NotebookPen },
];

const OPTIONAL_TEXT = "opcional";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEIGHT_REGEX = /^\d+(?:[.,]\d{1,2})?$/;

function getRegistrationMode(link) {
  const mode = String(link?.metadata?.registration_mode || "").trim();
  if (mode === "dog_only" || mode === "dog_and_financeiro") {
    return mode;
  }
  return "full";
}

function getVisibleStepDefinitions(mode) {
  if (mode === "dog_only") {
    return STEP_DEFINITIONS.filter((step) => step.id === "caes");
  }

  if (mode === "dog_and_financeiro") {
    return STEP_DEFINITIONS.filter((step) => step.id === "caes" || step.id === "financeiro");
  }

  return STEP_DEFINITIONS;
}

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
    cores_pelagem: "",
    pelagem: "",
    castrado: false,
    data_revacinacao_1: "",
    nome_vacina_revacinacao_1: "",
    data_revacinacao_2: "",
    nome_vacina_revacinacao_2: "",
    data_revacinacao_3: "",
    nome_vacina_revacinacao_3: "",
    alimentacao_marca_racao: "",
    alimentacao_sabor: "",
    alimentacao_tipo: "",
    alimentacao_natural: false,
    refeicoes: [createEmptyDogMeal()],
    alergias: "",
    restricoes_cuidados: "",
    veterinario_responsavel: "",
    veterinario_horario_atendimento: "",
    veterinario_telefone: "",
    veterinario_clinica_telefone: "",
    veterinario_endereco: "",
    observacoes_gerais: "",
    medicamentos_continuos: [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
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

function sanitizeDisplayNameInput(value) {
  return String(value || "")
    .replace(/[^\p{L}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^\s+/g, "");
}

function formatDisplayName(value) {
  return sanitizeDisplayNameInput(value)
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) =>
      word
        .split(/([-'])/)
        .map((part) => (/^[-']$/.test(part) ? part : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`))
        .join("")
    )
    .join(" ");
}

function formatDogTitle(dog, index) {
  return dog?.nome?.trim() || `${index + 1}Âº Dog`;
}

function hasValue(value) {
  return String(value ?? "").trim().length > 0;
}

function getTextFieldError({
  value,
  optional = false,
  kind = "text",
  requiredMessage = "Preencha este campo.",
}) {
  const rawValue = String(value ?? "");
  const trimmedValue = rawValue.trim();
  const digits = rawValue.replace(/\D/g, "");

  if (!trimmedValue) {
    return optional ? "" : requiredMessage;
  }

  switch (kind) {
    case "email":
      return EMAIL_REGEX.test(trimmedValue) ? "" : "Digite um email vÃ¡lido.";
    case "cpf":
      return digits.length === 11 ? "" : "Digite um CPF com 11 nÃºmeros.";
    case "cpf_cnpj":
      return digits.length === 11 || digits.length === 14 ? "" : "Digite um CPF ou CNPJ vÃ¡lido.";
    case "phone":
      return digits.length >= 10 && digits.length <= 11 ? "" : "Digite um celular vÃ¡lido.";
    case "cep":
      return digits.length === 8 ? "" : "Digite um CEP vÃ¡lido.";
    case "state":
      return trimmedValue.length === 2 ? "" : "Use a sigla do estado com 2 letras.";
    case "weight":
      return WEIGHT_REGEX.test(trimmedValue) ? "" : "Use apenas nÃºmeros, vÃ­rgula ou ponto.";
    default:
      return "";
  }
}

function validateResponsavel(form) {
  if (!form.nome_completo || !form.cpf || !form.celular || !form.email) {
    return "Preencha nome completo, CPF, celular e email do responsÃ¡vel.";
  }
  return "";
}

function validateDogs(dogs) {
  if (!Array.isArray(dogs) || dogs.length === 0) {
    return "Adicione ao menos um cÃ£o para continuar.";
  }
  const invalidDog = dogs.find((dog) => !dog.nome || !dog.raca);
  if (invalidDog) {
    return "Cada cÃ£o precisa ter pelo menos nome e raÃ§a informados.";
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
    return "Preencha os dados principais do responsÃ¡vel financeiro, incluindo endereÃ§o e vencimento.";
  }

  if (
    !form.contato_orcamentos_nome
    || !form.contato_orcamentos_celular
    || !form.contato_orcamentos_email
    || !form.contato_alinhamentos_nome
    || !form.contato_alinhamentos_celular
    || !form.contato_alinhamentos_email
  ) {
    return "Preencha os contatos para orÃ§amentos e para avisos e tratativas de alinhamento.";
  }

  return "";
}

function StepSidebar({ currentStep, steps }) {
  return (
    <div className="space-y-3">
      {steps.map((step, index) => {
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
  const [fieldTouched, setFieldTouched] = useState({});
  const [validationScope, setValidationScope] = useState("");
  const registrationMode = useMemo(() => getRegistrationMode(context?.link), [context?.link]);
  const visibleStepDefinitions = useMemo(() => getVisibleStepDefinitions(registrationMode), [registrationMode]);
  const currentStepDefinition = visibleStepDefinitions[currentStep] || visibleStepDefinitions[0] || STEP_DEFINITIONS[0];

  function touchField(fieldKey) {
    setFieldTouched((current) => (current[fieldKey] ? current : { ...current, [fieldKey]: true }));
  }

  function shouldShowFieldFeedback(fieldKey) {
    if (fieldTouched[fieldKey]) return true;
    if (!validationScope) return false;
    return fieldKey.startsWith(`${validationScope}.`);
  }

  function getFieldFeedback(fieldKey, options) {
    const error = getTextFieldError(options);
    const showFeedback = shouldShowFieldFeedback(fieldKey);
    const showError = showFeedback && Boolean(error);
    const showValid = !options.disabled && hasValue(options.value) && !error;

    return {
      error: showError ? error : "",
      showError,
      showValid,
    };
  }

  function renderFieldShell({ label, optional = false, description = "", message = "", messageTone = "default", className = "", children }) {
    return (
      <div className={className}>
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-[13px] font-semibold text-slate-800">{label}</Label>
            {optional ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {OPTIONAL_TEXT}
              </span>
            ) : null}
          </div>
          {children}
          {message ? (
            <p className={`text-xs ${messageTone === "error" ? "text-rose-600" : "text-slate-500"}`}>
              {message}
            </p>
          ) : description ? (
            <p className="text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
      </div>
    );
  }

  function renderTextField({
    fieldKey,
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    kind = "text",
    requiredMessage,
    description = "",
    className = "",
    inputClassName = "",
    disabled = false,
    onBlur,
    ...inputProps
  }) {
    const { error, showError, showValid } = getFieldFeedback(fieldKey, {
      value,
      optional,
      kind,
      requiredMessage,
      disabled,
    });

    const StatusIcon = showError ? CircleAlert : showValid ? Check : null;

    return renderFieldShell({
      label,
      optional,
      description,
      message: error,
      messageTone: showError ? "error" : "default",
      className,
      children: (
        <div className="relative">
          <Input
            value={value}
            onChange={onChange}
            onBlur={(event) => {
              touchField(fieldKey);
              onBlur?.(event);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className={[
              "h-12 rounded-2xl border px-4 text-[15px] shadow-sm transition-all duration-200",
              "bg-white/90 placeholder:text-slate-400 focus-visible:ring-4 focus-visible:ring-blue-100 focus-visible:ring-offset-0",
              showError
                ? "border-rose-300 bg-rose-50/80 pr-11 text-rose-900 focus-visible:border-rose-400"
                : showValid
                  ? "border-emerald-300 bg-emerald-50/70 pr-11 text-slate-900 focus-visible:border-emerald-400"
                  : "border-slate-200 text-slate-900 focus-visible:border-blue-400",
              disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "",
              inputClassName,
            ].join(" ")}
            {...inputProps}
          />
          {StatusIcon ? (
            <span
              className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${
                showError ? "text-rose-500" : "text-emerald-500"
              }`}
            >
              <StatusIcon className="h-4.5 w-4.5" />
            </span>
          ) : null}
        </div>
      ),
    });
  }

  function renderTextAreaField({
    fieldKey,
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    description = "",
    requiredMessage,
    className = "",
    rows = 4,
    disabled = false,
  }) {
    const { error, showError, showValid } = getFieldFeedback(fieldKey, {
      value,
      optional,
      requiredMessage,
      disabled,
    });

    const StatusIcon = showError ? CircleAlert : showValid ? Check : null;

    return renderFieldShell({
      label,
      optional,
      description,
      message: error,
      messageTone: showError ? "error" : "default",
      className,
      children: (
        <div className="relative">
          <Textarea
            value={value}
            onChange={onChange}
            onBlur={() => touchField(fieldKey)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            className={[
              "min-h-[108px] rounded-[24px] border px-4 py-3 text-[15px] shadow-sm transition-all duration-200",
              "bg-white/90 placeholder:text-slate-400 focus-visible:ring-4 focus-visible:ring-blue-100 focus-visible:ring-offset-0",
              showError
                ? "border-rose-300 bg-rose-50/80 pr-11 text-rose-900 focus-visible:border-rose-400"
                : showValid
                  ? "border-emerald-300 bg-emerald-50/70 pr-11 text-slate-900 focus-visible:border-emerald-400"
                  : "border-slate-200 text-slate-900 focus-visible:border-blue-400",
              disabled ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "",
            ].join(" ")}
          />
          {StatusIcon ? (
            <span
              className={`pointer-events-none absolute right-4 top-4 ${
                showError ? "text-rose-500" : "text-emerald-500"
              }`}
            >
              <StatusIcon className="h-4.5 w-4.5" />
            </span>
          ) : null}
        </div>
      ),
    });
  }

  function renderSelectField({ label, optional = false, description = "", className = "", children }) {
    return renderFieldShell({
      label,
      optional,
      description,
      className,
      children,
    });
  }

  useEffect(() => {
    loadContext();
  }, [token]);

  useEffect(() => {
    setCurrentStep((current) => Math.min(current, Math.max(visibleStepDefinitions.length - 1, 0)));
  }, [visibleStepDefinitions.length]);

  useEffect(() => {
    setValidationScope("");
  }, [currentStep]);

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
        console.warn("Erro ao buscar CEP do responsÃ¡vel financeiro:", error);
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
      contato_orcamentos_nome: responsavelForm.nome_completo || current.contato_orcamentos_nome,
      contato_orcamentos_celular: responsavelForm.celular || current.contato_orcamentos_celular,
      contato_orcamentos_email: responsavelForm.email || current.contato_orcamentos_email,
    }));
  }, [financeiroIgualResponsavel, responsavelForm]);

  async function loadContext() {
    setIsLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!token) {
      setErrorMessage("Link de cadastro invÃ¡lido. Solicite um novo link Ã  equipe da Dog City Brasil.");
      setIsLoading(false);
      return;
    }

    try {
      const data = await clientRegistration({
        action: "get_context",
        token,
      });
      setContext(data || null);
      const prefillResponsavel = data?.link?.metadata?.prefill?.responsavel || {};
      const prefillFinanceiro = data?.link?.metadata?.prefill?.financeiro || {};
      setResponsavelForm((current) => ({
        ...current,
        ...prefillResponsavel,
        nome_completo: prefillResponsavel?.nome_completo || data?.link?.responsavel_nome || current.nome_completo,
        email: prefillResponsavel?.email || data?.link?.responsavel_email || current.email,
      }));
      setFinanceiroForm((current) => ({
        ...current,
        ...prefillFinanceiro,
      }));
      if (prefillFinanceiro?.nome_razao_social || data?.link?.metadata?.existing_carteira_id) {
        setFinanceiroIgualResponsavel(false);
      }
    } catch (error) {
      console.error("Erro ao carregar contexto do cadastro do cliente:", error);
      setErrorMessage(error?.message || "NÃ£o foi possÃ­vel carregar este link de cadastro.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateDog(index, patch) {
    setCaesForm((current) => current.map((dog, dogIndex) => (
      dogIndex === index ? { ...dog, ...patch } : dog
    )));
  }

  function updateDogMeal(dogIndex, mealIndex, field, value) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    const nextMeals = [...(dog.refeicoes || [createEmptyDogMeal()])];
    nextMeals[mealIndex] = { ...(nextMeals[mealIndex] || createEmptyDogMeal()), [field]: value };
    updateDog(dogIndex, { refeicoes: nextMeals });
  }

  function addDogMeal(dogIndex) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    const currentMeals = dog.refeicoes || [createEmptyDogMeal()];
    if (currentMeals.length >= 4) return;

    updateDog(dogIndex, {
      refeicoes: [...currentMeals, createEmptyDogMeal()],
    });
  }

  function removeDogMeal(dogIndex, mealIndex) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    const currentMeals = dog.refeicoes || [createEmptyDogMeal()];
    if (currentMeals.length <= 1) {
      updateDog(dogIndex, { refeicoes: [createEmptyDogMeal()] });
      return;
    }

    updateDog(dogIndex, {
      refeicoes: currentMeals.filter((_, index) => index !== mealIndex),
    });
  }

  function updateDogMedication(dogIndex, medicationIndex, field, value) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    const nextItems = [...(dog.medicamentos_continuos || [])];
    nextItems[medicationIndex] = { ...(nextItems[medicationIndex] || {}), [field]: value };
    updateDog(dogIndex, { medicamentos_continuos: nextItems });
  }

  function addDogMedication(dogIndex) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    updateDog(dogIndex, {
      medicamentos_continuos: [
        ...(dog.medicamentos_continuos || []),
        { especificacoes: "", cuidados: "", horario: "", dose: "" },
      ],
    });
  }

  function removeDogMedication(dogIndex, medicationIndex) {
    const dog = caesForm[dogIndex] || createEmptyDog();
    const currentItems = dog.medicamentos_continuos || [];
    if (currentItems.length <= 1) {
      updateDog(dogIndex, {
        medicamentos_continuos: [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
      });
      return;
    }
    updateDog(dogIndex, {
      medicamentos_continuos: currentItems.filter((_, index) => index !== medicationIndex),
    });
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

  async function handleNextStep() {
    await validateAndAdvanceStep();
  }

  function handlePreviousStep() {
    setErrorMessage("");
    setValidationScope("");
    setCurrentStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit() {
    setValidationScope("financeiro");
    if (visibleStepDefinitions.some((step) => step.id === "financeiro")) {
      const financeError = validateFinanceiro(financeiroForm);
      if (financeError) {
        setErrorMessage(financeError);
        return;
      }

      const financeCpfDigits = normalizeCpfDigits(financeiroForm.cpf_cnpj);
      if (financeCpfDigits.length === 11) {
        try {
          const cpfValidation = await validateCpfWithGov({
            cpf: financeiroForm.cpf_cnpj,
            fullName: financeiroForm.nome_razao_social,
          });
          if (cpfValidation.shouldBlock) {
            setErrorMessage(cpfValidation.message);
            return;
          }
        } catch (error) {
          setErrorMessage(error?.message || "NÃ£o foi possÃ­vel validar o CPF do responsÃ¡vel financeiro.");
          return;
        }
      }
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

      setSuccessMessage("Cadastro enviado com sucesso. Nossa equipe vai seguir com os prÃ³ximos passos.");
    } catch (error) {
      console.error("Erro ao concluir cadastro do cliente:", error);
      setErrorMessage(error?.message || "NÃ£o foi possÃ­vel concluir o cadastro.");
    } finally {
      setIsSaving(false);
    }
  }

  async function validateAndAdvanceStep() {
    setValidationScope(currentStepDefinition?.id || "");
    const validationError = currentStepDefinition?.id === "responsavel"
      ? validateResponsavel(responsavelForm)
      : currentStepDefinition?.id === "caes"
        ? validateDogs(caesForm)
        : validateFinanceiro(financeiroForm);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (currentStepDefinition?.id === "responsavel") {
      try {
        const cpfValidation = await validateCpfWithGov({
          cpf: responsavelForm.cpf,
          fullName: responsavelForm.nome_completo,
        });
        if (cpfValidation.shouldBlock) {
          setErrorMessage(cpfValidation.message);
          return;
        }
      } catch (error) {
        setErrorMessage(error?.message || "NÃ£o foi possÃ­vel validar o CPF do responsÃ¡vel.");
        return;
      }
    }

    setErrorMessage("");
    setValidationScope("");
    setCurrentStep((current) => Math.min(current + 1, visibleStepDefinitions.length - 1));
  }

  function renderResponsavelStep() {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {renderTextField({
          fieldKey: "responsavel.nome_completo",
          label: "Nome completo",
          value: responsavelForm.nome_completo,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, nome_completo: sanitizeDisplayNameInput(event.target.value) })),
          onBlur: () => setResponsavelForm((current) => ({ ...current, nome_completo: formatDisplayName(current.nome_completo) })),
          placeholder: "Como devemos chamar o responsÃ¡vel",
          requiredMessage: "Informe o nome completo do responsÃ¡vel.",
          className: "md:col-span-2",
        })}
        {renderTextField({
          fieldKey: "responsavel.cpf",
          label: "CPF",
          kind: "cpf",
          value: responsavelForm.cpf,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, cpf: formatCPF(event.target.value) })),
          maxLength: 14,
          placeholder: "000.000.000-00",
          requiredMessage: "Informe o CPF do responsÃ¡vel.",
        })}
        {renderTextField({
          fieldKey: "responsavel.celular",
          label: "Celular",
          kind: "phone",
          value: responsavelForm.celular,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, celular: formatPhone(event.target.value) })),
          maxLength: 15,
          placeholder: "(00) 00000-0000",
          requiredMessage: "Informe o celular principal do responsÃ¡vel.",
        })}
        {renderTextField({
          fieldKey: "responsavel.celular_alternativo",
          label: "Celular alternativo",
          kind: "phone",
          optional: true,
          value: responsavelForm.celular_alternativo,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, celular_alternativo: formatPhone(event.target.value) })),
          maxLength: 15,
          placeholder: "(00) 00000-0000",
        })}
        {renderTextField({
          fieldKey: "responsavel.email",
          label: "Email",
          kind: "email",
          value: responsavelForm.email,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, email: event.target.value })),
          type: "email",
          placeholder: "email@exemplo.com",
          requiredMessage: "Informe o email do responsÃ¡vel.",
        })}
      </div>
    );
  }

  function renderDogBasicSection(dog, dogIndex) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {renderTextField({
          fieldKey: `caes.${dogIndex}.nome`,
          label: "Nome",
          value: dog.nome,
          onChange: (event) => updateDog(dogIndex, { nome: sanitizeDisplayNameInput(event.target.value) }),
          onBlur: () => updateDog(dogIndex, { nome: formatDisplayName(dog.nome) }),
          requiredMessage: "Informe o nome do dog.",
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.apelido`,
          label: "Apelido",
          optional: true,
          value: dog.apelido,
          onChange: (event) => updateDog(dogIndex, { apelido: sanitizeDisplayNameInput(event.target.value) }),
          onBlur: () => updateDog(dogIndex, { apelido: formatDisplayName(dog.apelido) }),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.raca`,
          label: "RaÃ§a",
          value: dog.raca,
          onChange: (event) => updateDog(dogIndex, { raca: event.target.value }),
          requiredMessage: "Informe a raÃ§a do dog.",
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.peso`,
          label: "Peso (kg)",
          kind: "weight",
          value: dog.peso,
          onChange: (event) => updateDog(dogIndex, { peso: event.target.value }),
          placeholder: "Ex: 12,5",
          requiredMessage: "Informe o peso do dog.",
        })}
        {renderSelectField({
          label: "Data de nascimento",
          children: (
            <DatePickerInput
              value={dog.data_nascimento}
              onChange={(value) => updateDog(dogIndex, { data_nascimento: value })}
            />
          ),
        })}
        {renderSelectField({
          label: "Sexo",
          children: (
            <Select value={dog.sexo || ""} onValueChange={(value) => updateDog(dogIndex, { sexo: value })}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white/90 px-4 text-[15px] shadow-sm transition focus:ring-4 focus:ring-blue-100">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="macho">Macho</SelectItem>
                <SelectItem value="femea">FÃªmea</SelectItem>
              </SelectContent>
            </Select>
          ),
        })}
        {renderSelectField({
          label: "Porte",
          children: (
            <Select value={dog.porte || ""} onValueChange={(value) => updateDog(dogIndex, { porte: value })}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white/90 px-4 text-[15px] shadow-sm transition focus:ring-4 focus:ring-blue-100">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pequeno">Pequeno</SelectItem>
                <SelectItem value="medio">MÃ©dio</SelectItem>
                <SelectItem value="grande">Grande</SelectItem>
              </SelectContent>
            </Select>
          ),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.cores_pelagem`,
          label: "Cores da pelagem",
          value: dog.cores_pelagem,
          onChange: (event) => updateDog(dogIndex, { cores_pelagem: event.target.value }),
          requiredMessage: "Informe as cores da pelagem.",
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.pelagem`,
          label: "Pelagem",
          value: dog.pelagem,
          onChange: (event) => updateDog(dogIndex, { pelagem: event.target.value }),
          placeholder: "Ex: curta, mÃ©dia ou longa",
          requiredMessage: "Informe o tipo de pelagem.",
        })}
        <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-900">Castrado</p>
            <p className="text-xs text-slate-500">Informe se o dog é castrado.</p>
          </div>
          <Switch checked={!!dog.castrado} onCheckedChange={(checked) => updateDog(dogIndex, { castrado: checked })} />
        </div>
        {renderSelectField({
          label: "1Âª revacinaÃ§Ã£o",
          optional: true,
          children: (
            <DatePickerInput
              value={dog.data_revacinacao_1}
              onChange={(value) => updateDog(dogIndex, { data_revacinacao_1: value })}
            />
          ),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.nome_vacina_revacinacao_1`,
          label: "Vacina da 1Âª revacinaÃ§Ã£o",
          optional: true,
          value: dog.nome_vacina_revacinacao_1,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_1: event.target.value }),
          placeholder: "Ex: V10, AntirrÃ¡bica",
        })}
        {renderSelectField({
          label: "2Âª revacinaÃ§Ã£o",
          optional: true,
          children: (
            <DatePickerInput
              value={dog.data_revacinacao_2}
              onChange={(value) => updateDog(dogIndex, { data_revacinacao_2: value })}
            />
          ),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.nome_vacina_revacinacao_2`,
          label: "Vacina da 2Âª revacinaÃ§Ã£o",
          optional: true,
          value: dog.nome_vacina_revacinacao_2,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_2: event.target.value }),
          placeholder: "Ex: V10, AntirrÃ¡bica",
        })}
        {renderSelectField({
          label: "3Âª revacinaÃ§Ã£o",
          optional: true,
          children: (
            <DatePickerInput
              value={dog.data_revacinacao_3}
              onChange={(value) => updateDog(dogIndex, { data_revacinacao_3: value })}
            />
          ),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.nome_vacina_revacinacao_3`,
          label: "Vacina da 3Âª revacinaÃ§Ã£o",
          optional: true,
          value: dog.nome_vacina_revacinacao_3,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_3: event.target.value }),
          placeholder: "Ex: V10, AntirrÃ¡bica",
        })}
      </div>
    );
  }

  function renderDogMealRow(dog, dogIndex, mealIndex) {
    const meal = (dog.refeicoes || [createEmptyDogMeal()])[mealIndex] || createEmptyDogMeal();
    return (
      <div key={`meal-public-${mealIndex}`} className="rounded-[24px] border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">{mealIndex + 1}Âª refeiÃ§Ã£o</p>
          <Button type="button" variant="outline" size="sm" onClick={() => removeDogMeal(dogIndex, mealIndex)} className="rounded-xl">
            <Trash2 className="mr-2 h-4 w-4" />
            Remover
          </Button>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {renderTextField({
            fieldKey: `caes.${dogIndex}.refeicoes.${mealIndex}.qnt`,
            label: "Quantidade",
            value: meal.qnt || "",
            onChange: (event) => updateDogMeal(dogIndex, mealIndex, "qnt", event.target.value),
            placeholder: "Ex: 120g",
            requiredMessage: "Informe a quantidade desta refeiÃ§Ã£o.",
          })}
          {renderSelectField({
            label: "HorÃ¡rio",
            children: (
              <TimePickerInput
                value={meal.horario || ""}
                onChange={(value) => updateDogMeal(dogIndex, mealIndex, "horario", value)}
              />
            ),
          })}
          {renderTextField({
            fieldKey: `caes.${dogIndex}.refeicoes.${mealIndex}.obs`,
            label: "ObservaÃ§Ã£o",
            optional: true,
            value: meal.obs || "",
            onChange: (event) => updateDogMeal(dogIndex, mealIndex, "obs", event.target.value),
            placeholder: "Ex: misturar com sachÃª",
          })}
        </div>
      </div>
    );
  }

  function renderDogAlimentacaoSection(dog, dogIndex) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-900">AlimentaÃ§Ã£o natural</p>
            <p className="text-xs text-slate-500">Ao marcar, os campos de marca, sabor e tipo ficam ocultos.</p>
          </div>
          <Switch
            checked={!!dog.alimentacao_natural}
            onCheckedChange={(checked) => updateDog(dogIndex, {
              alimentacao_natural: checked,
              alimentacao_tipo: checked ? "AlimentaÃ§Ã£o natural" : dog.alimentacao_tipo,
              alimentacao_marca_racao: checked ? "" : dog.alimentacao_marca_racao,
              alimentacao_sabor: checked ? "" : dog.alimentacao_sabor,
            })}
          />
        </div>
        {!dog.alimentacao_natural ? (
          <div className="grid gap-4 md:grid-cols-3">
            {renderTextField({
              fieldKey: `caes.${dogIndex}.alimentacao_marca_racao`,
              label: "Marca da raÃ§Ã£o",
              optional: true,
              value: dog.alimentacao_marca_racao,
              onChange: (event) => updateDog(dogIndex, { alimentacao_marca_racao: event.target.value }),
            })}
            {renderTextField({
              fieldKey: `caes.${dogIndex}.alimentacao_sabor`,
              label: "Sabor",
              optional: true,
              value: dog.alimentacao_sabor,
              onChange: (event) => updateDog(dogIndex, { alimentacao_sabor: event.target.value }),
            })}
            {renderTextField({
              fieldKey: `caes.${dogIndex}.alimentacao_tipo`,
              label: "Tipo",
              optional: true,
              value: dog.alimentacao_tipo,
              onChange: (event) => updateDog(dogIndex, { alimentacao_tipo: event.target.value }),
              placeholder: "Ex: seca, Ãºmida ou natural",
            })}
          </div>
        ) : (
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            O dog estÃ¡ marcado com alimentaÃ§Ã£o natural.
          </div>
        )}
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">RefeiÃ§Ãµes</p>
              <p className="text-xs text-slate-500">Comece com uma linha e adicione outras quando necessÃ¡rio.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => addDogMeal(dogIndex)} disabled={(dog.refeicoes || []).length >= 4} className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </div>
          <div className="space-y-3">
            {(dog.refeicoes || [createEmptyDogMeal()]).map((_, mealIndex) => renderDogMealRow(dog, dogIndex, mealIndex))}
          </div>
        </div>
      </div>
    );
  }

  function renderDogCuidadosSection(dog, dogIndex) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {renderTextAreaField({
          fieldKey: `caes.${dogIndex}.alergias`,
          label: "Alergias",
          optional: true,
          value: dog.alergias,
          onChange: (event) => updateDog(dogIndex, { alergias: event.target.value }),
          rows: 3,
          className: "md:col-span-2",
        })}
        {renderTextAreaField({
          fieldKey: `caes.${dogIndex}.restricoes_cuidados`,
          label: "RestriÃ§Ãµes e cuidados",
          optional: true,
          value: dog.restricoes_cuidados,
          onChange: (event) => updateDog(dogIndex, { restricoes_cuidados: event.target.value }),
          rows: 4,
          className: "md:col-span-2",
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_responsavel`,
          label: "VeterinÃ¡rio responsÃ¡vel",
          optional: true,
          value: dog.veterinario_responsavel,
          onChange: (event) => updateDog(dogIndex, { veterinario_responsavel: event.target.value }),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_horario_atendimento`,
          label: "HorÃ¡rio de atendimento",
          optional: true,
          value: dog.veterinario_horario_atendimento,
          onChange: (event) => updateDog(dogIndex, { veterinario_horario_atendimento: event.target.value }),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_telefone`,
          label: "Telefone do veterinÃ¡rio",
          optional: true,
          kind: "phone",
          value: dog.veterinario_telefone,
          onChange: (event) => updateDog(dogIndex, { veterinario_telefone: formatPhone(event.target.value) }),
          maxLength: 15,
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_clinica_telefone`,
          label: "Telefone da clÃ­nica",
          optional: true,
          kind: "phone",
          value: dog.veterinario_clinica_telefone,
          onChange: (event) => updateDog(dogIndex, { veterinario_clinica_telefone: formatPhone(event.target.value) }),
          maxLength: 15,
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_endereco`,
          label: "EndereÃ§o veterinÃ¡rio / clÃ­nica",
          optional: true,
          value: dog.veterinario_endereco,
          onChange: (event) => updateDog(dogIndex, { veterinario_endereco: event.target.value }),
        })}
        <div className="md:col-span-2">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Medicamentos de longo perÃ­odo / vitalÃ­cio</p>
                <p className="text-xs text-slate-500">Informe especificaÃ§Ãµes, cuidados, horÃ¡rio e dose.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => addDogMedication(dogIndex)} className="rounded-xl">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </div>
            <div className="space-y-3">
              {(dog.medicamentos_continuos || []).map((medicacao, medicationIndex) => (
                <div key={`medicacao-publica-${medicationIndex}`} className="rounded-[24px] border border-blue-100 bg-blue-50/70 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">Medicamento {medicationIndex + 1}</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => removeDogMedication(dogIndex, medicationIndex)} className="rounded-xl">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {renderTextField({
                      fieldKey: `caes.${dogIndex}.medicamentos.${medicationIndex}.especificacoes`,
                      label: "EspecificaÃ§Ãµes",
                      optional: true,
                      value: medicacao.especificacoes || "",
                      onChange: (event) => updateDogMedication(dogIndex, medicationIndex, "especificacoes", event.target.value),
                    })}
                    {renderTextField({
                      fieldKey: `caes.${dogIndex}.medicamentos.${medicationIndex}.cuidados`,
                      label: "Cuidados",
                      optional: true,
                      value: medicacao.cuidados || "",
                      onChange: (event) => updateDogMedication(dogIndex, medicationIndex, "cuidados", event.target.value),
                    })}
                    {renderSelectField({
                      label: "HorÃ¡rio",
                      optional: true,
                      children: (
                        <TimePickerInput
                          value={medicacao.horario || ""}
                          onChange={(value) => updateDogMedication(dogIndex, medicationIndex, "horario", value)}
                        />
                      ),
                    })}
                    {renderTextField({
                      fieldKey: `caes.${dogIndex}.medicamentos.${medicationIndex}.dose`,
                      label: "Dose",
                      optional: true,
                      value: medicacao.dose || "",
                      onChange: (event) => updateDogMedication(dogIndex, medicationIndex, "dose", event.target.value),
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderDogObservacoesSection(dog, dogIndex) {
    return (
      renderTextAreaField({
        fieldKey: `caes.${dogIndex}.observacoes_gerais`,
        label: "ObservaÃ§Ãµes gerais",
        optional: true,
        value: dog.observacoes_gerais,
        onChange: (event) => updateDog(dogIndex, { observacoes_gerais: event.target.value }),
        rows: 6,
        placeholder: "Informe aqui detalhes importantes sobre comportamento, rotina, preferÃªncias ou observaÃ§Ãµes gerais.",
      })
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
                className={`flex items-center gap-2 rounded-[24px] border px-4 py-3 text-sm font-semibold shadow-sm transition ${
                  activeDogIndex === index
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white/90 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Dog className="h-4 w-4" />
                <span>{formatDogTitle(dog, index)}</span>
              </button>
            ))}
            <Button type="button" variant="outline" onClick={addDog} className="rounded-[24px]">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar dog
            </Button>
            {caesForm.length > 1 ? (
              <Button type="button" variant="outline" onClick={() => removeDog(activeDogIndex)} className="rounded-[24px] text-rose-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Remover atual
              </Button>
            ) : null}
          </div>

          <Card className="border-slate-200 bg-white/90 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-xl">{formatDogTitle(currentDog, activeDogIndex)}</CardTitle>
            </CardHeader>
            <CardContent className="relative overflow-hidden p-6">
              <div className="pointer-events-none absolute inset-y-6 left-4 hidden border-l border-dashed border-slate-200/90 md:block" />
              <div className="relative z-10">
              {activeDogSection === "basico" ? renderDogBasicSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "alimentacao" ? renderDogAlimentacaoSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "cuidados" ? renderDogCuidadosSection(currentDog, activeDogIndex) : null}
              {activeDogSection === "observacoes" ? renderDogObservacoesSection(currentDog, activeDogIndex) : null}
              </div>
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
        <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-900">Usar os mesmos dados do responsÃ¡vel</p>
            <p className="text-xs text-slate-500">Preenchimento automÃ¡tico para nome, documento, celular e email.</p>
          </div>
          <Switch checked={financeiroIgualResponsavel} onCheckedChange={setFinanceiroIgualResponsavel} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {renderTextField({
            fieldKey: "financeiro.nome_razao_social",
            label: "Nome / RazÃ£o social",
            value: financeiroForm.nome_razao_social,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, nome_razao_social: event.target.value })),
            requiredMessage: "Informe o nome ou razÃ£o social do responsÃ¡vel financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.cpf_cnpj",
            label: "CPF / CNPJ",
            kind: "cpf_cnpj",
            value: financeiroForm.cpf_cnpj,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, cpf_cnpj: formatCpfOrCnpj(event.target.value) })),
            maxLength: 18,
            requiredMessage: "Informe o CPF ou CNPJ do responsÃ¡vel financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.celular",
            label: "Celular",
            kind: "phone",
            value: financeiroForm.celular,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, celular: formatPhone(event.target.value) })),
            maxLength: 15,
            requiredMessage: "Informe o celular do responsÃ¡vel financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.email",
            label: "Email",
            kind: "email",
            value: financeiroForm.email,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, email: event.target.value })),
            type: "email",
            requiredMessage: "Informe o email do responsÃ¡vel financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.cep",
            label: "CEP",
            kind: "cep",
            value: financeiroForm.cep,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, cep: formatCEP(event.target.value) })),
            maxLength: 9,
            requiredMessage: "Informe o CEP do responsÃ¡vel financeiro.",
            description: addressLoading ? "Buscando endereÃ§o..." : "Rua, bairro, cidade e estado serÃ£o preenchidos pelo CEP.",
          })}
          {renderTextField({
            fieldKey: "financeiro.number",
            label: "NÃºmero",
            value: financeiroForm.number,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, number: event.target.value })),
            requiredMessage: "Informe o nÃºmero do endereÃ§o.",
          })}
          {renderTextField({
            fieldKey: "financeiro.street",
            label: "Rua",
            value: financeiroForm.street,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, street: event.target.value })),
            requiredMessage: "Informe a rua do endereÃ§o.",
            className: "md:col-span-2",
          })}
          {renderTextField({
            fieldKey: "financeiro.neighborhood",
            label: "Bairro",
            value: financeiroForm.neighborhood,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, neighborhood: event.target.value })),
            requiredMessage: "Informe o bairro do endereÃ§o.",
          })}
          {renderTextField({
            fieldKey: "financeiro.city",
            label: "Cidade",
            value: financeiroForm.city,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, city: event.target.value })),
            requiredMessage: "Informe a cidade do endereÃ§o.",
          })}
          {renderTextField({
            fieldKey: "financeiro.state",
            label: "Estado",
            kind: "state",
            value: financeiroForm.state,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, state: event.target.value.toUpperCase() })),
            maxLength: 2,
            requiredMessage: "Informe o estado do endereÃ§o.",
          })}
          {renderSelectField({
            label: "Vencimento de planos",
            children: (
              <Select value={financeiroForm.vencimento_planos || ""} onValueChange={(value) => setFinanceiroForm((current) => ({ ...current, vencimento_planos: value }))}>
                <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white/90 px-4 text-[15px] shadow-sm transition focus:ring-4 focus:ring-blue-100">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="05">Aos dias 05</SelectItem>
                  <SelectItem value="20">Aos dias 20</SelectItem>
                </SelectContent>
              </Select>
            ),
          })}
        </div>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Contato para envio de orÃ§amentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_nome",
              label: "Nome",
              value: financeiroForm.contato_orcamentos_nome,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_nome: sanitizeDisplayNameInput(event.target.value) })),
              onBlur: () => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_nome: formatDisplayName(current.contato_orcamentos_nome) })),
              requiredMessage: "Informe o nome do contato para orÃ§amentos.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_celular",
              label: "Celular",
              kind: "phone",
              value: financeiroForm.contato_orcamentos_celular,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_celular: formatPhone(event.target.value) })),
              maxLength: 15,
              requiredMessage: "Informe o celular do contato para orÃ§amentos.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_email",
              label: "Email",
              kind: "email",
              value: financeiroForm.contato_orcamentos_email,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_email: event.target.value })),
              type: "email",
              requiredMessage: "Informe o email do contato para orÃ§amentos.",
            })}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Contato para o dia a dia</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {renderTextField({
              fieldKey: "financeiro.contato_alinhamentos_nome",
              label: "Nome",
              value: financeiroForm.contato_alinhamentos_nome,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_nome: sanitizeDisplayNameInput(event.target.value) })),
              onBlur: () => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_nome: formatDisplayName(current.contato_alinhamentos_nome) })),
              requiredMessage: "Informe o nome do contato do dia a dia.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_alinhamentos_celular",
              label: "Celular",
              kind: "phone",
              value: financeiroForm.contato_alinhamentos_celular,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_celular: formatPhone(event.target.value) })),
              maxLength: 15,
              requiredMessage: "Informe o celular do contato do dia a dia.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_alinhamentos_email",
              label: "Email",
              kind: "email",
              value: financeiroForm.contato_alinhamentos_email,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_alinhamentos_email: event.target.value })),
              type: "email",
              requiredMessage: "Informe o email do contato do dia a dia.",
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  const progressValue = ((currentStep + 1) / visibleStepDefinitions.length) * 100;
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
              <h1 className="mt-5 text-3xl font-brand text-slate-900">Link indisponÃ­vel</h1>
              <p className="mt-3 text-sm text-slate-600">
                {errorMessage || "NÃ£o foi possÃ­vel carregar este cadastro. Solicite um novo link Ã  equipe da Dog City Brasil."}
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
            <Card className="border-slate-200 bg-white/90 shadow-sm">
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
                <p className="mt-3 text-xs text-slate-400">
                  Somente os campos marcados como <span className="font-semibold text-slate-500">opcional</span> podem ficar em branco.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 shadow-sm">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">AvanÃ§o</span>
                  <span className="text-sm text-slate-500">{Math.round(progressValue)}%</span>
                </div>
                <Progress value={progressValue} className="h-2 bg-slate-100" />
              </CardContent>
            </Card>

            <StepSidebar currentStep={currentStep} steps={visibleStepDefinitions} />
          </div>

          <div className="space-y-5">
            <Card className="overflow-hidden border-slate-200 bg-white/90 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-2xl text-slate-900">{currentStepDefinition?.label}</CardTitle>
              </CardHeader>
              <CardContent className="relative overflow-hidden p-6">
                <div className="pointer-events-none absolute inset-y-6 left-8 hidden border-l border-dashed border-blue-100 lg:block" />
                <div className="pointer-events-none absolute inset-y-6 right-8 hidden border-r border-dashed border-blue-100 lg:block" />
                <div className="relative z-10 space-y-1">
                  {currentStepDefinition?.id === "responsavel" ? renderResponsavelStep() : null}
                  {currentStepDefinition?.id === "caes" ? renderDogsStep() : null}
                  {currentStepDefinition?.id === "financeiro" ? renderFinanceiroStep() : null}
                </div>
              </CardContent>
            </Card>

            {errorMessage ? (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">
                Etapa {currentStep + 1} de {visibleStepDefinitions.length}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={currentStep === 0 || isSaving} className="rounded-xl">
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Button>
                {currentStep < visibleStepDefinitions.length - 1 ? (
                  <Button type="button" onClick={handleNextStep} className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                    Continuar
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleSubmit} disabled={isSaving} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
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


