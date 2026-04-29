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
import { formatDisplayName, sanitizeDisplayNameInput } from "@/lib/name-format";
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

const DOG_BREED_OPTIONS = [
  "SRD",
  "Akita",
  "American Bully",
  "Basset Hound",
  "Beagle",
  "Bichon Frise",
  "Border Collie",
  "Boston Terrier",
  "Boxer",
  "Bulldog Francês",
  "Bulldog Inglês",
  "Cane Corso",
  "Cavalier King Charles Spaniel",
  "Chihuahua",
  "Chow Chow",
  "Cocker Spaniel",
  "Dachshund",
  "Dálmata",
  "Dobermann",
  "Dogue Alemão",
  "Fila Brasileiro",
  "Golden Retriever",
  "Husky Siberiano",
  "Jack Russell Terrier",
  "Labrador",
  "Lhasa Apso",
  "Lulu da Pomerânia",
  "Maltês",
  "Pastor Alemão",
  "Pastor Australiano",
  "Pastor Belga",
  "Pequinês",
  "Pinscher Miniatura",
  "Poodle",
  "Pug",
  "Rottweiler",
  "Samoieda",
  "São Bernardo",
  "Schnauzer",
  "Shih Tzu",
  "Spitz Alemão",
  "Terrier Brasileiro",
  "Weimaraner",
  "Welsh Corgi Pembroke",
  "Yorkshire",
  "Outro",
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
    autorizacao_uso_imagem: false,
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

function formatDogTitle(dog, index) {
  return dog?.nome?.trim() || `${index + 1}º Dog`;
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
      return EMAIL_REGEX.test(trimmedValue) ? "" : "Digite um email válido.";
    case "cpf":
      return digits.length === 11 ? "" : "Digite um CPF com 11 números.";
    case "cpf_cnpj":
      return digits.length === 11 || digits.length === 14 ? "" : "Digite um CPF ou CNPJ válido.";
    case "phone":
      return digits.length >= 10 && digits.length <= 11 ? "" : "Digite um celular válido.";
    case "cep":
      return digits.length === 8 ? "" : "Digite um CEP válido.";
    case "state":
      return trimmedValue.length === 2 ? "" : "Use a sigla do estado com 2 letras.";
    case "weight":
      return WEIGHT_REGEX.test(trimmedValue) ? "" : "Use apenas números, vírgula ou ponto.";
    default:
      return "";
  }
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

function validateDogBasicSection(dog) {
  if (!dog?.nome || !dog?.raca || !dog?.peso || !dog?.data_nascimento || !dog?.sexo || !dog?.porte || !dog?.cores_pelagem || !dog?.pelagem) {
    return "Preencha os dados básicos obrigatórios do dog antes de seguir.";
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

function StepSidebar({ currentStep, steps }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 xl:block xl:space-y-3">
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
            } min-w-[138px] shrink-0 px-3 py-2.5 xl:min-w-0 xl:p-4`}
          >
            <div className="flex items-center gap-2.5 xl:gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-xl xl:h-10 xl:w-10 xl:rounded-2xl ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-4 w-4 xl:h-5 xl:w-5" /> : <Icon className="h-4 w-4 xl:h-5 xl:w-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 xl:text-xs xl:tracking-[0.2em]">
                  Etapa {index + 1}
                </p>
                <p className="text-[13px] font-semibold leading-tight text-slate-900 xl:text-sm">{step.label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DogSectionSidebar({ activeSection, onSelect, unlockedIndex = 0 }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 xl:block xl:space-y-2">
      {DOG_SECTION_DEFINITIONS.map((section, index) => {
        const Icon = section.icon;
        const isActive = activeSection === section.id;
        const isUnlocked = index <= unlockedIndex;

        return (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              if (isUnlocked) onSelect(section.id);
            }}
            disabled={!isUnlocked}
            className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-left transition xl:gap-3 xl:px-4 xl:py-3 ${
              isActive
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : isUnlocked
                  ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
            } min-w-[176px] shrink-0 xl:min-w-0`}
          >
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold xl:h-9 xl:w-9 xl:text-xs ${
                isActive ? "bg-blue-600 text-white" : isUnlocked ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-300"
              }`}
            >
              {index + 1}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Icon className="h-3.5 w-3.5 xl:h-4 xl:w-4" />
              <span className="text-[13px] font-semibold leading-tight xl:text-sm">{section.label}</span>
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
  const [dogSectionProgress, setDogSectionProgress] = useState([0]);
  const [financeiroIgualResponsavel, setFinanceiroIgualResponsavel] = useState(false);
  const [responsavelForm, setResponsavelForm] = useState(EMPTY_RESPONSAVEL);
  const [caesForm, setCaesForm] = useState([createEmptyDog()]);
  const [financeiroForm, setFinanceiroForm] = useState(EMPTY_FINANCEIRO);
  const [fieldTouched, setFieldTouched] = useState({});
  const [validationScope, setValidationScope] = useState("");
  const registrationMode = useMemo(() => getRegistrationMode(context?.link), [context?.link]);
  const visibleStepDefinitions = useMemo(() => getVisibleStepDefinitions(registrationMode), [registrationMode]);
  const currentStepDefinition = visibleStepDefinitions[currentStep] || visibleStepDefinitions[0] || STEP_DEFINITIONS[0];
  const activeDogSectionIndex = useMemo(
    () => Math.max(DOG_SECTION_DEFINITIONS.findIndex((section) => section.id === activeDogSection), 0),
    [activeDogSection]
  );
  const activeDogUnlockedSectionIndex = dogSectionProgress[activeDogIndex] ?? 0;

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
    setDogSectionProgress((current) => {
      const next = Array.from({ length: caesForm.length }, (_, index) => current[index] ?? 0);
      const unchanged = next.length === current.length && next.every((value, index) => value === current[index]);
      return unchanged ? current : next;
    });
  }, [caesForm.length]);

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
    setDogSectionProgress((current) => current.filter((_, dogIndex) => dogIndex !== index));
    setActiveDogIndex((current) => Math.max(0, Math.min(current, caesForm.length - 2)));
    setActiveDogSection("basico");
  }

  async function handleNextStep() {
    await validateAndAdvanceStep();
  }

  function handlePreviousStep() {
    setErrorMessage("");
    setValidationScope("");
    if (currentStepDefinition?.id === "caes") {
      if (activeDogSectionIndex > 0) {
        setActiveDogSection(DOG_SECTION_DEFINITIONS[activeDogSectionIndex - 1].id);
        return;
      }

      if (activeDogIndex > 0) {
        const previousDogIndex = activeDogIndex - 1;
        setActiveDogIndex(previousDogIndex);
        setActiveDogSection(DOG_SECTION_DEFINITIONS[DOG_SECTION_DEFINITIONS.length - 1].id);
        return;
      }
    }
    setCurrentStep((current) => Math.max(current - 1, 0));
  }

  async function handleSubmit() {
    if (visibleStepDefinitions.some((step) => step.id === "responsavel")) {
      setValidationScope("responsavel");
      const responsavelError = validateResponsavel(responsavelForm);
      if (responsavelError) {
        setErrorMessage(responsavelError);
        return;
      }
    }

    if (visibleStepDefinitions.some((step) => step.id === "caes")) {
      setValidationScope(`caes.${activeDogIndex}`);
      const dogsError = validateDogs(caesForm);
      if (dogsError) {
        setErrorMessage(dogsError);
        return;
      }
    }

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
          setErrorMessage(error?.message || "Não foi possível validar o CPF do responsável financeiro.");
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
          responsavel: {
            ...responsavelForm,
            nome_completo: formatDisplayName(responsavelForm.nome_completo),
          },
          caes: caesForm.map((dog) => ({
            ...dog,
            nome: formatDisplayName(dog.nome),
            apelido: formatDisplayName(dog.apelido),
          })),
          financeiro: {
            ...financeiroForm,
            nome_razao_social: formatDisplayName(financeiroForm.nome_razao_social),
            contato_orcamentos_nome: formatDisplayName(financeiroForm.contato_orcamentos_nome),
            contato_alinhamentos_nome: formatDisplayName(financeiroForm.contato_alinhamentos_nome),
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

  async function validateAndAdvanceStep() {
    if (currentStepDefinition?.id === "caes") {
      setValidationScope(`caes.${activeDogIndex}`);
      const currentDog = caesForm[activeDogIndex] || createEmptyDog();
      const validationError = activeDogSection === "basico"
        ? validateDogBasicSection(currentDog)
        : validateDogs(caesForm);

      if (validationError) {
        setErrorMessage(validationError);
        return;
      }

      setErrorMessage("");
      setValidationScope("");

      if (activeDogSectionIndex < DOG_SECTION_DEFINITIONS.length - 1) {
        const nextSectionIndex = activeDogSectionIndex + 1;
        setDogSectionProgress((current) => current.map((value, index) => (
          index === activeDogIndex ? Math.max(value ?? 0, nextSectionIndex) : value
        )));
        setActiveDogSection(DOG_SECTION_DEFINITIONS[nextSectionIndex].id);
        return;
      }

      if (activeDogIndex < caesForm.length - 1) {
        const nextDogIndex = activeDogIndex + 1;
        setActiveDogIndex(nextDogIndex);
        setActiveDogSection(DOG_SECTION_DEFINITIONS[dogSectionProgress[nextDogIndex] ?? 0]?.id || "basico");
        return;
      }

      setCurrentStep((current) => Math.min(current + 1, visibleStepDefinitions.length - 1));
      return;
    }

    setValidationScope(currentStepDefinition?.id || "");
    const validationError = currentStepDefinition?.id === "responsavel"
      ? validateResponsavel(responsavelForm)
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
        setErrorMessage(error?.message || "Não foi possível validar o CPF do responsável.");
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
          placeholder: "Como devemos chamar o responsável",
          requiredMessage: "Informe o nome completo do responsável.",
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
          requiredMessage: "Informe o CPF do responsável.",
        })}
        {renderTextField({
          fieldKey: "responsavel.celular",
          label: "Celular",
          kind: "phone",
          value: responsavelForm.celular,
          onChange: (event) => setResponsavelForm((current) => ({ ...current, celular: formatPhone(event.target.value) })),
          maxLength: 15,
          placeholder: "(00) 00000-0000",
          requiredMessage: "Informe o celular principal do responsável.",
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
          requiredMessage: "Informe o email do responsável.",
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
        {renderSelectField({
          label: "Raça",
          children: (
            <Select value={dog.raca || ""} onValueChange={(value) => updateDog(dogIndex, { raca: value })}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200 bg-white/90 px-4 text-[15px] shadow-sm transition focus:ring-4 focus:ring-blue-100">
                <SelectValue placeholder="Selecione a raça" />
              </SelectTrigger>
              <SelectContent>
                {DOG_BREED_OPTIONS.map((breed) => (
                  <SelectItem key={breed} value={breed}>
                    {breed}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ),
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
                <SelectItem value="femea">Fêmea</SelectItem>
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
                <SelectItem value="medio">Médio</SelectItem>
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
          placeholder: "Ex: curta, média ou longa",
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
          label: "1ª revacinação",
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
          label: "Vacina da 1ª revacinação",
          optional: true,
          value: dog.nome_vacina_revacinacao_1,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_1: event.target.value }),
          placeholder: "Ex: V10, Antirrábica",
        })}
        {renderSelectField({
          label: "2ª revacinação",
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
          label: "Vacina da 2ª revacinação",
          optional: true,
          value: dog.nome_vacina_revacinacao_2,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_2: event.target.value }),
          placeholder: "Ex: V10, Antirrábica",
        })}
        {renderSelectField({
          label: "3ª revacinação",
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
          label: "Vacina da 3ª revacinação",
          optional: true,
          value: dog.nome_vacina_revacinacao_3,
          onChange: (event) => updateDog(dogIndex, { nome_vacina_revacinacao_3: event.target.value }),
          placeholder: "Ex: V10, Antirrábica",
        })}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
            <div>
              <p className="text-sm font-semibold text-slate-900">Autorizo o uso de imagens do meu Dog</p>
              <p className="text-xs text-slate-500">Permite fotos e vídeos do dog em registros e comunicação da Dog City.</p>
            </div>
            <Switch checked={!!dog.autorizacao_uso_imagem} onCheckedChange={(checked) => updateDog(dogIndex, { autorizacao_uso_imagem: checked })} />
          </div>
        </div>
      </div>
    );
  }

  function renderDogMealRow(dog, dogIndex, mealIndex) {
    const meal = (dog.refeicoes || [createEmptyDogMeal()])[mealIndex] || createEmptyDogMeal();
    return (
      <div key={`meal-public-${mealIndex}`} className="rounded-[24px] border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-900">{mealIndex + 1}ª refeição</p>
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
            requiredMessage: "Informe a quantidade desta refeição.",
          })}
          {renderSelectField({
            label: "Horário",
            children: (
              <TimePickerInput
                value={meal.horario || ""}
                onChange={(value) => updateDogMeal(dogIndex, mealIndex, "horario", value)}
              />
            ),
          })}
          {renderTextField({
            fieldKey: `caes.${dogIndex}.refeicoes.${mealIndex}.obs`,
            label: "Observação",
            optional: true,
            value: meal.obs || "",
            onChange: (event) => updateDogMeal(dogIndex, mealIndex, "obs", event.target.value),
            placeholder: "Ex: misturar com sachê",
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
            <p className="text-sm font-semibold text-slate-900">Alimentação natural</p>
            <p className="text-xs text-slate-500">Ao marcar, os campos de marca, sabor e tipo ficam ocultos.</p>
          </div>
          <Switch
            checked={!!dog.alimentacao_natural}
            onCheckedChange={(checked) => updateDog(dogIndex, {
              alimentacao_natural: checked,
              alimentacao_tipo: checked ? "Alimentação natural" : dog.alimentacao_tipo,
              alimentacao_marca_racao: checked ? "" : dog.alimentacao_marca_racao,
              alimentacao_sabor: checked ? "" : dog.alimentacao_sabor,
            })}
          />
        </div>
        {!dog.alimentacao_natural ? (
          <div className="grid gap-4 md:grid-cols-3">
            {renderTextField({
              fieldKey: `caes.${dogIndex}.alimentacao_marca_racao`,
              label: "Marca da ração",
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
              placeholder: "Ex: seca, úmida ou natural",
            })}
          </div>
        ) : (
          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            O dog está marcado com alimentação natural.
          </div>
        )}
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Refeições</p>
              <p className="text-xs text-slate-500">Comece com uma linha e adicione outras quando necessário.</p>
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
          label: "Restrições e cuidados",
          optional: true,
          value: dog.restricoes_cuidados,
          onChange: (event) => updateDog(dogIndex, { restricoes_cuidados: event.target.value }),
          rows: 4,
          className: "md:col-span-2",
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_responsavel`,
          label: "Veterinário responsável",
          optional: true,
          value: dog.veterinario_responsavel,
          onChange: (event) => updateDog(dogIndex, { veterinario_responsavel: event.target.value }),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_horario_atendimento`,
          label: "Horário de atendimento",
          optional: true,
          value: dog.veterinario_horario_atendimento,
          onChange: (event) => updateDog(dogIndex, { veterinario_horario_atendimento: event.target.value }),
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_telefone`,
          label: "Telefone do veterinário",
          optional: true,
          kind: "phone",
          value: dog.veterinario_telefone,
          onChange: (event) => updateDog(dogIndex, { veterinario_telefone: formatPhone(event.target.value) }),
          maxLength: 15,
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_clinica_telefone`,
          label: "Telefone da clínica",
          optional: true,
          kind: "phone",
          value: dog.veterinario_clinica_telefone,
          onChange: (event) => updateDog(dogIndex, { veterinario_clinica_telefone: formatPhone(event.target.value) }),
          maxLength: 15,
        })}
        {renderTextField({
          fieldKey: `caes.${dogIndex}.veterinario_endereco`,
          label: "Endereço veterinário / clínica",
          optional: true,
          value: dog.veterinario_endereco,
          onChange: (event) => updateDog(dogIndex, { veterinario_endereco: event.target.value }),
        })}
        <div className="md:col-span-2">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Medicamentos de longo período / vitalício</p>
                <p className="text-xs text-slate-500">Informe especificações, cuidados, horário e dose.</p>
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
                      label: "Especificações",
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
                      label: "Horário",
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
        label: "Observações gerais",
        optional: true,
        value: dog.observacoes_gerais,
        onChange: (event) => updateDog(dogIndex, { observacoes_gerais: event.target.value }),
        rows: 6,
        placeholder: "Informe aqui detalhes importantes sobre comportamento, rotina, preferências ou observações gerais.",
      })
    );
  }

  function renderDogsStep() {
    const currentDog = caesForm[activeDogIndex] || createEmptyDog();
    const currentDogTitle = formatDogTitle(currentDog, activeDogIndex);

    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            {caesForm.map((dog, index) => (
              <button
                key={`dog-${index}`}
                type="button"
                onClick={() => {
                  if (index > activeDogIndex) return;
                  setActiveDogIndex(index);
                  setActiveDogSection(DOG_SECTION_DEFINITIONS[dogSectionProgress[index] ?? 0]?.id || "basico");
                }}
                disabled={index > activeDogIndex}
                className={`flex items-center gap-2 rounded-[24px] border px-4 py-3 text-sm font-semibold shadow-sm transition ${
                  activeDogIndex === index
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : index > activeDogIndex
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
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
              <div className="space-y-2">
                <CardTitle className="text-xl">{currentDogTitle}</CardTitle>
                <p className="text-sm text-slate-500">
                  Etapa guiada do dog: {activeDogIndex + 1} de {caesForm.length} • seção {activeDogSectionIndex + 1} de {DOG_SECTION_DEFINITIONS.length}
                </p>
              </div>
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
          <DogSectionSidebar activeSection={activeDogSection} onSelect={setActiveDogSection} unlockedIndex={activeDogUnlockedSectionIndex} />
        </div>
      </div>
    );
  }

  function renderFinanceiroStep() {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-900">Usar os mesmos dados do responsável</p>
              <p className="text-xs text-slate-500">Preenchimento automático para nome, documento, celular e email.</p>
          </div>
          <Switch checked={financeiroIgualResponsavel} onCheckedChange={setFinanceiroIgualResponsavel} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {renderTextField({
            fieldKey: "financeiro.nome_razao_social",
            label: "Nome / Razão social",
            value: financeiroForm.nome_razao_social,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, nome_razao_social: sanitizeDisplayNameInput(event.target.value) })),
            onBlur: () => setFinanceiroForm((current) => ({ ...current, nome_razao_social: formatDisplayName(current.nome_razao_social) })),
            requiredMessage: "Informe o nome ou razão social do responsável financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.cpf_cnpj",
            label: "CPF / CNPJ",
            kind: "cpf_cnpj",
            value: financeiroForm.cpf_cnpj,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, cpf_cnpj: formatCpfOrCnpj(event.target.value) })),
            maxLength: 18,
            requiredMessage: "Informe o CPF ou CNPJ do responsável financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.celular",
            label: "Celular",
            kind: "phone",
            value: financeiroForm.celular,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, celular: formatPhone(event.target.value) })),
            maxLength: 15,
            requiredMessage: "Informe o celular do responsável financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.email",
            label: "Email",
            kind: "email",
            value: financeiroForm.email,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, email: event.target.value })),
            type: "email",
            requiredMessage: "Informe o email do responsável financeiro.",
          })}
          {renderTextField({
            fieldKey: "financeiro.cep",
            label: "CEP",
            kind: "cep",
            value: financeiroForm.cep,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, cep: formatCEP(event.target.value) })),
            maxLength: 9,
            requiredMessage: "Informe o CEP do responsável financeiro.",
            description: addressLoading ? "Buscando endereço..." : "Rua, bairro, cidade e estado serão preenchidos pelo CEP.",
          })}
          {renderTextField({
            fieldKey: "financeiro.number",
            label: "Número",
            value: financeiroForm.number,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, number: event.target.value })),
            requiredMessage: "Informe o número do endereço.",
          })}
          {renderTextField({
            fieldKey: "financeiro.street",
            label: "Rua",
            value: financeiroForm.street,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, street: event.target.value })),
            requiredMessage: "Informe a rua do endereço.",
            className: "md:col-span-2",
          })}
          {renderTextField({
            fieldKey: "financeiro.neighborhood",
            label: "Bairro",
            value: financeiroForm.neighborhood,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, neighborhood: event.target.value })),
            requiredMessage: "Informe o bairro do endereço.",
          })}
          {renderTextField({
            fieldKey: "financeiro.city",
            label: "Cidade",
            value: financeiroForm.city,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, city: event.target.value })),
            requiredMessage: "Informe a cidade do endereço.",
          })}
          {renderTextField({
            fieldKey: "financeiro.state",
            label: "Estado",
            kind: "state",
            value: financeiroForm.state,
            onChange: (event) => setFinanceiroForm((current) => ({ ...current, state: event.target.value.toUpperCase() })),
            maxLength: 2,
            requiredMessage: "Informe o estado do endereço.",
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
            <CardTitle className="text-base">Contato para envio de orçamentos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_nome",
              label: "Nome",
              value: financeiroForm.contato_orcamentos_nome,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_nome: sanitizeDisplayNameInput(event.target.value) })),
              onBlur: () => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_nome: formatDisplayName(current.contato_orcamentos_nome) })),
              requiredMessage: "Informe o nome do contato para orçamentos.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_celular",
              label: "Celular",
              kind: "phone",
              value: financeiroForm.contato_orcamentos_celular,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_celular: formatPhone(event.target.value) })),
              maxLength: 15,
              requiredMessage: "Informe o celular do contato para orçamentos.",
            })}
            {renderTextField({
              fieldKey: "financeiro.contato_orcamentos_email",
              label: "Email",
              kind: "email",
              value: financeiroForm.contato_orcamentos_email,
              onChange: (event) => setFinanceiroForm((current) => ({ ...current, contato_orcamentos_email: event.target.value })),
              type: "email",
              requiredMessage: "Informe o email do contato para orçamentos.",
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
  const nextDogSectionLabel = currentStepDefinition?.id === "caes" && activeDogSectionIndex < DOG_SECTION_DEFINITIONS.length - 1
    ? DOG_SECTION_DEFINITIONS[activeDogSectionIndex + 1].label
    : "";
  const hasNextDogInFlow = currentStepDefinition?.id === "caes" && activeDogIndex < caesForm.length - 1 && activeDogSectionIndex === DOG_SECTION_DEFINITIONS.length - 1;
  const isLastDogSection = currentStepDefinition?.id === "caes"
    && activeDogIndex === caesForm.length - 1
    && activeDogSectionIndex === DOG_SECTION_DEFINITIONS.length - 1;
  const shouldShowContinueButton = currentStep < visibleStepDefinitions.length - 1 || (currentStepDefinition?.id === "caes" && !isLastDogSection);

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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] p-3 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-3 sm:gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3 sm:space-y-4">
            <Card className="border-slate-200 bg-white/90 shadow-sm">
              <CardContent className="p-4 text-center sm:p-6">
                {isResolved && logoUrl ? (
                  <img src={logoUrl} alt={companyName} className="mx-auto h-12 w-12 object-contain sm:h-20 sm:w-20" />
                ) : (
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 sm:h-20 sm:w-20 sm:rounded-3xl" />
                )}
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-500 sm:mt-4 sm:text-xs sm:tracking-[0.25em]">Cadastro do cliente</p>
                <h1 className="mt-2 text-lg font-brand leading-tight text-slate-900 sm:mt-3 sm:text-2xl">{pageTitle}</h1>
                <p className="mt-2 text-[13px] leading-snug text-slate-500 sm:text-sm">
                  Preencha os dados abaixo para concluir a ficha cadastral.
                </p>
                <p className="mt-2 text-[11px] leading-snug text-slate-400 sm:mt-3 sm:text-xs">
                  Somente os campos marcados como <span className="font-semibold text-slate-500">opcional</span> podem ficar em branco.
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between sm:mb-4">
                  <span className="text-[13px] font-semibold text-slate-900 sm:text-sm">Avanço</span>
                  <span className="text-[13px] text-slate-500 sm:text-sm">{Math.round(progressValue)}%</span>
                </div>
                <Progress value={progressValue} className="h-2 bg-slate-100" />
              </CardContent>
            </Card>

            <StepSidebar currentStep={currentStep} steps={visibleStepDefinitions} />
          </div>

          <div className="space-y-4 sm:space-y-5">
            <Card className="overflow-hidden border-slate-200 bg-white/90 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-xl text-slate-900 sm:text-2xl">{currentStepDefinition?.label}</CardTitle>
              </CardHeader>
              <CardContent className="relative overflow-hidden p-4 sm:p-6">
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

            <div className="flex flex-col gap-2.5 rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:rounded-[24px] sm:p-4">
              <div className="text-[13px] leading-snug text-slate-500 sm:text-sm">
                {currentStepDefinition?.id === "caes"
                  ? `Dog ${activeDogIndex + 1} de ${caesForm.length} • ${DOG_SECTION_DEFINITIONS[activeDogSectionIndex]?.label || "Informações básicas"}`
                  : `Etapa ${currentStep + 1} de ${visibleStepDefinitions.length}`}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Button type="button" variant="outline" onClick={handlePreviousStep} disabled={currentStep === 0 || isSaving} className="h-10 w-full rounded-xl px-3 text-sm sm:h-11 sm:w-auto">
                  <ChevronLeft className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                  Voltar
                </Button>
                {shouldShowContinueButton ? (
                  <Button type="button" onClick={handleNextStep} className="h-10 w-full rounded-xl px-3 text-sm bg-blue-600 text-white hover:bg-blue-700 sm:h-11 sm:w-auto">
                    {currentStepDefinition?.id === "caes"
                      ? isLastDogSection
                        ? "Continuar para responsável financeiro"
                        : hasNextDogInFlow
                          ? `Continuar para ${formatDogTitle(caesForm[activeDogIndex + 1], activeDogIndex + 1)}`
                        : nextDogSectionLabel
                          ? `Continuar para ${nextDogSectionLabel}`
                        : "Continuar"
                      : "Continuar"}
                    <ChevronRight className="ml-1.5 h-3.5 w-3.5 sm:ml-2 sm:h-4 sm:w-4" />
                  </Button>
                ) : (
                  <Button type="button" onClick={handleSubmit} disabled={isSaving} className="h-10 w-full rounded-xl px-3 text-sm bg-emerald-600 text-white hover:bg-emerald-700 sm:h-11 sm:w-auto">
                    {isSaving ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin sm:mr-2 sm:h-4 sm:w-4" /> : <Copy className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />}
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


