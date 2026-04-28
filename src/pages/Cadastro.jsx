import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dog } from "@/api/entities";
import { Responsavel } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { User } from "@/api/entities";
import { clientRegistration } from "@/api/functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dog as DogIcon, Users, Wallet, Upload, Save, Plus, X, Check, Link as LinkIcon, Copy, ExternalLink, ArrowRight, ClipboardList, HeartPulse, CircleAlert } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CreateFileSignedUrl, UploadFile, UploadPrivateFile } from "@/api/integrations";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { DatePickerInput, TimePickerInput } from "@/components/common/DateTimeInputs";
import PageSubTabs from "@/components/common/PageSubTabs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { validateCpfWithGov } from "@/lib/cpf-validation";
import { createEmptyDogMeal, extractDogMeals, isNaturalFoodType, serializeDogMeals } from "@/lib/dog-form-utils";
import { findEntityByReference } from "@/lib/entity-identifiers";
import { formatDisplayName, sanitizeDisplayNameInput } from "@/lib/name-format";
import { cn } from "@/lib/utils";
import { createPageUrl, isImagePreviewable, openImageViewer } from "@/utils";
import { useLocation, useNavigate } from "react-router-dom";
const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const DOG_SIZE_OPTIONS = ["Mini", "Pequeno", "Médio", "Grande", "Gigante"];
const DOG_COAT_OPTIONS = ["Curto", "Médio", "Longo"];
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

const HEADER_TONE_BY_TAB = {
  caes: {
    panelClass: "border-blue-200 bg-blue-50/80",
    iconClass: "bg-blue-100 text-blue-700",
  },
  responsaveis: {
    panelClass: "border-emerald-200 bg-emerald-50/80",
    iconClass: "bg-emerald-100 text-emerald-700",
  },
  carteiras: {
    panelClass: "border-orange-200 bg-orange-50/80",
    iconClass: "bg-orange-100 text-orange-700",
  },
};

const OPTIONAL_TEXT = "opcional";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEIGHT_REGEX = /^\d+(?:[.,]\d{1,2})?$/;

function getLinkedDogIds(record) {
  return RELATION_SLOTS
    .map((slot) => record?.[`dog_id_${slot}`])
    .filter(Boolean);
}

function buildDogRelationPayload(existingRecord, linkedDogIds) {
  const nextPayload = {};
  RELATION_SLOTS.forEach((slot, index) => {
    nextPayload[`dog_id_${slot}`] = linkedDogIds[index] || null;
  });
  return nextPayload;
}

function normalizeDogSize(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const sizeMap = {
    mini: "Mini",
    pequeno: "Pequeno",
    medio: "M\u00e9dio",
    grande: "Grande",
    gigante: "Gigante",
  };

  return sizeMap[normalized] || String(value || "").trim();
}

function normalizeDogCoat(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  const coatMap = {
    curto: "Curto",
    curta: "Curto",
    medio: "M\u00e9dio",
    media: "M\u00e9dio",
    longo: "Longo",
    longa: "Longo",
  };

  return coatMap[normalized] || String(value || "").trim();
}

function buildSelectOptions(options, currentValue) {
  const trimmedValue = String(currentValue || "").trim();
  if (!trimmedValue || options.includes(trimmedValue)) {
    return options;
  }

  return [trimmedValue, ...options];
}

function normalizeDocumentDigits(value, maxLength = 14) {
  return String(value || "").replace(/\D/g, "").slice(0, maxLength);
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

export default function Cadastro() {
  const location = useLocation();
  const navigate = useNavigate();
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dogs, setDogs] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("caes");
  const [fieldTouched, setFieldTouched] = useState({});
  const [editingDogId, setEditingDogId] = useState("");
  const [selectedResponsavelIds, setSelectedResponsavelIds] = useState([]);
  const [selectedCarteiraIds, setSelectedCarteiraIds] = useState([]);
  const [searchLinkedResponsavel, setSearchLinkedResponsavel] = useState("");
  const [searchLinkedCarteira, setSearchLinkedCarteira] = useState("");
  const [showClientLinkFeedback, setShowClientLinkFeedback] = useState(false);
  const [hasCopiedClientLink, setHasCopiedClientLink] = useState(false);
  const [carteiraIgualResponsavel, setCarteiraIgualResponsavel] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [clientLinkValue, setClientLinkValue] = useState("");
  useEffect(() => { loadData(); }, []);

  // Dog Form
  const emptyDog = useMemo(() => ({
    nome: "", apelido: "", raca: "", porte: "", cores_pelagem: "", pelagem: "", peso: "", data_nascimento: "",
    sexo: "", castrado: false,
    foto_url: "", foto_carteirinha_vacina_url: "",
    data_revacinacao_1: "", nome_vacina_revacinacao_1: "",
    data_revacinacao_2: "", nome_vacina_revacinacao_2: "",
    data_revacinacao_3: "", nome_vacina_revacinacao_3: "",
    alergias: "", restricoes_cuidados: "", observacoes_gerais: "",
    veterinario_responsavel: "", veterinario_horario_atendimento: "", veterinario_telefone: "", veterinario_clinica_telefone: "", veterinario_endereco: "",
    alimentacao_marca_racao: "", alimentacao_sabor: "", alimentacao_tipo: "", alimentacao_natural: false,
    refeicoes: [createEmptyDogMeal()],
    medicamentos_continuos: [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
    autorizacao_uso_imagem: false,
  }), []);
  const [dogForm, setDogForm] = useState(emptyDog);

  // Responsavel Form
  const emptyResponsavel = { nome_completo: "", cpf: "", celular: "", celular_alternativo: "", email: "", dog_id_1: "", dog_id_2: "", dog_id_3: "", dog_id_4: "", dog_id_5: "", dog_id_6: "", dog_id_7: "", dog_id_8: "" };
  const [responsavelForm, setResponsavelForm] = useState(emptyResponsavel);
  const [searchDogResp, setSearchDogResp] = useState("");

  // Carteira Form
  const emptyCarteira = {
    nome_razao_social: "", cpf_cnpj: "", celular: "", email: "",
    cep: "", numero_residencia: "", street: "", neighborhood: "", city: "", state: "",
    vencimento_planos: "",
    contato_orcamentos_nome: "", contato_orcamentos_celular: "", contato_orcamentos_email: "",
    contato_alinhamentos_nome: "", contato_alinhamentos_celular: "", contato_alinhamentos_email: "",
    dog_id_1: "", dog_id_2: "", dog_id_3: "", dog_id_4: "", dog_id_5: "", dog_id_6: "", dog_id_7: "", dog_id_8: "",
  };
  const [carteiraForm, setCarteiraForm] = useState(emptyCarteira);
  const [searchDogCart, setSearchDogCart] = useState("");

  const formatCPF = (v) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
  };
  const formatPhone = (v) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };
  const formatCEP = (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').slice(0, 9);
  const optional = (v) => v === "" ? null : v;
  const normalizeMedications = (items) => (Array.isArray(items) ? items : [])
    .map((item) => ({
      especificacoes: optional(item?.especificacoes),
      cuidados: optional(item?.cuidados),
      horario: optional(item?.horario),
      dose: optional(item?.dose),
    }))
    .filter((item) => item.especificacoes || item.cuidados || item.horario || item.dose);
  const buildClientRegistrationLink = (token) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${createPageUrl("CadastroClientePublico")}?token=${encodeURIComponent(token)}`;
  };

  function touchField(fieldKey) {
    setFieldTouched((current) => (current[fieldKey] ? current : { ...current, [fieldKey]: true }));
  }

  function getFieldFeedback(fieldKey, options) {
    const error = getTextFieldError(options);
    const showError = fieldTouched[fieldKey] && Boolean(error);
    const showValid = !options.disabled && hasValue(options.value) && !error;

    return {
      error: showError ? error : "",
      showError,
      showValid,
    };
  }

  function getFieldClassNames(showError, showValid, extraClassName = "") {
    return cn(
      "h-12 rounded-2xl border px-4 text-[15px] shadow-sm transition-all duration-200",
      "bg-white/90 placeholder:text-slate-400 focus-visible:ring-4 focus-visible:ring-blue-100 focus-visible:ring-offset-0",
      showError
        ? "border-rose-300 bg-rose-50/80 text-rose-900 focus-visible:border-rose-400"
        : showValid
          ? "border-emerald-300 bg-emerald-50/70 text-slate-900 focus-visible:border-emerald-400"
          : "border-slate-200 text-slate-900 focus-visible:border-blue-400",
      extraClassName
    );
  }

  function renderFieldShell({
    label,
    optional = false,
    description = "",
    message = "",
    messageTone = "default",
    className = "",
    children,
  }) {
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
            className={getFieldClassNames(showError, showValid, cn(StatusIcon && "pr-11", inputClassName))}
            {...inputProps}
          />
          {StatusIcon ? (
            <span className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${showError ? "text-rose-500" : "text-emerald-500"}`}>
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
            className={cn(
              "min-h-[108px] rounded-[24px] border px-4 py-3 text-[15px] shadow-sm transition-all duration-200",
              "bg-white/90 placeholder:text-slate-400 focus-visible:ring-4 focus-visible:ring-blue-100 focus-visible:ring-offset-0",
              showError
                ? "border-rose-300 bg-rose-50/80 pr-11 text-rose-900 focus-visible:border-rose-400"
                : showValid
                  ? "border-emerald-300 bg-emerald-50/70 pr-11 text-slate-900 focus-visible:border-emerald-400"
                  : "border-slate-200 text-slate-900 focus-visible:border-blue-400"
            )}
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

  function renderSelectField({
    fieldKey,
    label,
    value,
    placeholder,
    optional = false,
    requiredMessage,
    description = "",
    className = "",
    children,
  }) {
    const { error, showError, showValid } = getFieldFeedback(fieldKey, {
      value,
      optional,
      requiredMessage,
    });

    return renderFieldShell({
      label,
      optional,
      description,
      message: error,
      messageTone: showError ? "error" : "default",
      className,
      children: (
        <div onBlur={() => touchField(fieldKey)}>
          {children({
            triggerClassName: cn(
              "h-12 rounded-2xl px-4 text-[15px] shadow-sm transition-all duration-200",
              showError
                ? "border-rose-300 bg-rose-50/80 text-rose-900 focus:ring-rose-100"
                : showValid
                  ? "border-emerald-300 bg-emerald-50/70 text-slate-900 focus:ring-emerald-100"
                  : "border-slate-200 bg-white/90 text-slate-900 focus:ring-blue-100"
            ),
            placeholder,
          })}
        </div>
      ),
    });
  }

  function renderDateField({
    fieldKey,
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    requiredMessage,
    description = "",
    className = "",
  }) {
    const { error, showError, showValid } = getFieldFeedback(fieldKey, {
      value,
      optional,
      requiredMessage,
    });

    return renderFieldShell({
      label,
      optional,
      description,
      message: error,
      messageTone: showError ? "error" : "default",
      className,
      children: (
        <DatePickerInput
          value={value}
          onChange={(nextValue) => {
            onChange(nextValue);
            touchField(fieldKey);
          }}
          placeholder={placeholder}
          className={cn(
            "h-12 rounded-2xl px-4 text-[15px] shadow-sm transition-all duration-200",
            showError
              ? "border-rose-300 bg-rose-50/80 text-rose-900"
              : showValid
                ? "border-emerald-300 bg-emerald-50/70 text-slate-900"
                : "border-slate-200 bg-white/90 text-slate-900"
          )}
        />
      ),
    });
  }

  function renderTimeField({
    fieldKey,
    label,
    value,
    onChange,
    placeholder,
    optional = false,
    requiredMessage,
    description = "",
    className = "",
  }) {
    const { error, showError, showValid } = getFieldFeedback(fieldKey, {
      value,
      optional,
      requiredMessage,
    });

    return renderFieldShell({
      label,
      optional,
      description,
      message: error,
      messageTone: showError ? "error" : "default",
      className,
      children: (
        <TimePickerInput
          value={value}
          onChange={(nextValue) => {
            onChange(nextValue);
            touchField(fieldKey);
          }}
          placeholder={placeholder}
          className={cn(
            "h-12 rounded-2xl px-4 text-[15px] shadow-sm transition-all duration-200",
            showError
              ? "border-rose-300 bg-rose-50/80 text-rose-900"
              : showValid
                ? "border-emerald-300 bg-emerald-50/70 text-slate-900"
                : "border-slate-200 bg-white/90 text-slate-900"
          )}
        />
      ),
    });
  }

  useEffect(() => {
    if (!carteiraIgualResponsavel) return;

    setCarteiraForm((current) => ({
      ...current,
      nome_razao_social: responsavelForm.nome_completo || current.nome_razao_social,
      cpf_cnpj: responsavelForm.cpf || current.cpf_cnpj,
      celular: responsavelForm.celular || current.celular,
      email: responsavelForm.email || current.email,
      contato_orcamentos_nome: responsavelForm.nome_completo || current.contato_orcamentos_nome,
      contato_orcamentos_celular: responsavelForm.celular || current.contato_orcamentos_celular,
      contato_orcamentos_email: responsavelForm.email || current.contato_orcamentos_email,
    }));
  }, [carteiraIgualResponsavel, responsavelForm]);

  useEffect(() => {
    const cepDigits = normalizeDocumentDigits(carteiraForm.cep, 8);
    if (cepDigits.length !== 8) return undefined;

    let cancelled = false;

    async function fetchAddress() {
      setAddressLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json();
        if (cancelled || data?.erro) return;

        setCarteiraForm((current) => ({
          ...current,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state,
        }));
      } catch (error) {
        console.warn("Erro ao buscar CEP do responsável financeiro:", error);
      } finally {
        if (!cancelled) setAddressLoading(false);
      }
    }

    fetchAddress();

    return () => {
      cancelled = true;
    };
  }, [carteiraForm.cep]);

  const filteredResponsaveis = useMemo(() => {
    const search = searchLinkedResponsavel.trim().toLowerCase();
    if (!search) return responsaveis;
    return responsaveis.filter((item) =>
      [item.nome_completo, item.cpf, item.celular, item.email].some((value) =>
        String(value || "").toLowerCase().includes(search)
      )
    );
  }, [responsaveis, searchLinkedResponsavel]);

  const filteredCarteiras = useMemo(() => {
    const search = searchLinkedCarteira.trim().toLowerCase();
    if (!search) return carteiras;
    return carteiras.filter((item) =>
      [item.nome_razao_social, item.cpf_cnpj, item.celular, item.email].some((value) =>
        String(value || "").toLowerCase().includes(search)
      )
    );
  }, [carteiras, searchLinkedCarteira]);

  const loadData = async () => {
    try {
      const [dogsData, responsaveisData, carteirasData, me] = await Promise.all([
        Dog.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        User.me(),
      ]);
      setDogs(dogsData || []);
      setResponsaveis(responsaveisData || []);
      setCarteiras(carteirasData || []);
      setCurrentUser(me || null);
    } catch (error) {
      setNotifyTitle("Erro");
      setNotifyMessage(error?.message || "Não foi possível carregar os cadastros.");
      setNotifyOpen(true);
    }
  };

  const resetDogEditor = () => {
    setDogForm({
      ...emptyDog,
      refeicoes: [createEmptyDogMeal()],
      medicamentos_continuos: [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
    });
    setSelectedResponsavelIds([]);
    setSelectedCarteiraIds([]);
    setSearchLinkedResponsavel("");
    setSearchLinkedCarteira("");
    setEditingDogId("");
  };

  const openDogForEditing = useCallback((dogReference) => {
    const targetDog = findEntityByReference(dogs, dogReference);
    if (!targetDog) return;

    setActiveTab("caes");
    setEditingDogId(targetDog.id);
    setDogForm({
      ...emptyDog,
      ...targetDog,
      sexo: targetDog.sexo || "",
      castrado: !!targetDog.castrado,
      autorizacao_uso_imagem: !!targetDog.autorizacao_uso_imagem,
      porte: normalizeDogSize(targetDog.porte),
      pelagem: normalizeDogCoat(targetDog.pelagem),
      peso: targetDog.peso ?? "",
      alimentacao_natural: isNaturalFoodType(targetDog.alimentacao_tipo),
      refeicoes: extractDogMeals(targetDog),
      medicamentos_continuos:
        Array.isArray(targetDog.medicamentos_continuos) && targetDog.medicamentos_continuos.length > 0
          ? targetDog.medicamentos_continuos.map((item) => ({
              especificacoes: item?.especificacoes || "",
              cuidados: item?.cuidados || "",
              horario: item?.horario || "",
              dose: item?.dose || "",
            }))
          : [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
    });
    setSelectedResponsavelIds(
      responsaveis
        .filter((item) => getLinkedDogIds(item).includes(targetDog.id))
        .map((item) => item.id)
    );
    setSelectedCarteiraIds(
      carteiras
        .filter((item) => getLinkedDogIds(item).includes(targetDog.id))
        .map((item) => item.id)
    );
  }, [dogs, responsaveis, carteiras, emptyDog]);

  useEffect(() => {
    if (!dogs.length) return;
    const params = new URLSearchParams(location.search);
    const editDogId = params.get("editDogId");
    if (!editDogId) return;

    openDogForEditing(editDogId);
  }, [location.search, dogs, openDogForEditing]);

  const clearDogEditQuery = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has("editDogId")) return;
    params.delete("editDogId");
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : "",
      },
      { replace: true }
    );
  };

  const toggleLinkedRecord = (recordId, setter) => {
    setter((current) => (
      current.includes(recordId)
        ? current.filter((item) => item !== recordId)
        : [...current, recordId]
    ));
  };

  const validateRelationCapacity = (records, selectedIds, dogId, label) => {
    for (const record of records) {
      const currentIds = getLinkedDogIds(record);
      const willBeSelected = selectedIds.includes(record.id);
      const alreadyLinked = currentIds.includes(dogId);
      if (willBeSelected && !alreadyLinked && currentIds.length >= RELATION_SLOTS.length) {
        throw new Error(`${label} ${record.nome_completo || record.nome_razao_social || ""} já atingiu o limite de 8 cães vinculados.`);
      }
    }
  };

  const syncDogLinks = async (entityApi, records, selectedIds, dogId) => {
    const selectedSet = new Set(selectedIds);
    const recordsToSync = records.filter((record) => {
      const linkedDogIds = getLinkedDogIds(record);
      return linkedDogIds.includes(dogId) || selectedSet.has(record.id);
    });

    for (const record of recordsToSync) {
      const currentIds = getLinkedDogIds(record).filter((linkedId) => linkedId !== dogId);
      if (selectedSet.has(record.id)) currentIds.push(dogId);
      const uniqueIds = [...new Set(currentIds)].slice(0, RELATION_SLOTS.length);
      await entityApi.update(record.id, buildDogRelationPayload(record, uniqueIds));
    }
  };

  const updateDogMedication = (index, field, value) => {
    const nextItems = [...(dogForm.medicamentos_continuos || [])];
    nextItems[index] = { ...(nextItems[index] || {}), [field]: value };
    setDogForm({ ...dogForm, medicamentos_continuos: nextItems });
  };

  const updateDogMeal = (index, field, value) => {
    const nextMeals = [...(dogForm.refeicoes || [createEmptyDogMeal()])];
    nextMeals[index] = { ...(nextMeals[index] || createEmptyDogMeal()), [field]: value };
    setDogForm({ ...dogForm, refeicoes: nextMeals });
  };

  const addDogMeal = () => {
    const currentMeals = dogForm.refeicoes || [createEmptyDogMeal()];
    if (currentMeals.length >= 4) return;

    setDogForm({
      ...dogForm,
      refeicoes: [...currentMeals, createEmptyDogMeal()],
    });
  };

  const removeDogMeal = (index) => {
    const currentMeals = dogForm.refeicoes || [createEmptyDogMeal()];
    if (currentMeals.length <= 1) {
      setDogForm({
        ...dogForm,
        refeicoes: [createEmptyDogMeal()],
      });
      return;
    }

    setDogForm({
      ...dogForm,
      refeicoes: currentMeals.filter((_, mealIndex) => mealIndex !== index),
    });
  };

  const addDogMedication = () => {
    setDogForm({
      ...dogForm,
      medicamentos_continuos: [
        ...(dogForm.medicamentos_continuos || []),
        { especificacoes: "", cuidados: "", horario: "", dose: "" },
      ],
    });
  };

  const removeDogMedication = (index) => {
    const currentItems = dogForm.medicamentos_continuos || [];
    if (currentItems.length <= 1) {
      setDogForm({
        ...dogForm,
        medicamentos_continuos: [{ especificacoes: "", cuidados: "", horario: "", dose: "" }],
      });
      return;
    }

    setDogForm({
      ...dogForm,
      medicamentos_continuos: currentItems.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const handleUpload = async (file, field) => {
    if (!file) return;
    setIsUploading(true);
    try {
      if (field === "foto_carteirinha_vacina_url") {
        const empresaId = currentUser?.empresa_id || currentUser?.company_id || "empresa-default";
        const dogId = dogForm.nome ? dogForm.nome.toLowerCase().replace(/\s+/g, "-") : `tmp-${Date.now()}`;
        const safeName = `${Date.now()}_${(file.name || "arquivo").replace(/\s+/g, "_")}`;
        const path = `${empresaId}/dogs/${dogId}/documentos/${safeName}`;
        const { file_key } = await UploadPrivateFile({ file, path });
        setDogForm(prev => ({ ...prev, [field]: file_key }));
      } else {
        const { file_url } = await UploadFile({ file });
        setDogForm(prev => ({ ...prev, [field]: file_url }));
      }
    } catch {
      setNotifyTitle("Erro"); setNotifyMessage("Erro ao enviar arquivo."); setNotifyOpen(true);
    }
    setIsUploading(false);
  };

  const openDogDocument = async (path) => {
    if (!path) return;
    try {
      const signed = await CreateFileSignedUrl({ path, expires: 3600 });
      const url = signed?.signedUrl || signed?.url;
      if (!url) return;

      if (isImagePreviewable(path) || isImagePreviewable(url)) {
        openImageViewer(url, "Carteirinha de vacinação");
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setNotifyTitle("Erro");
      setNotifyMessage("Não foi possível abrir o documento.");
      setNotifyOpen(true);
    }
  };

  const handleSaveDog = async () => {
    if (!dogForm.nome) { setNotifyTitle("Campo obrigatório"); setNotifyMessage("Informe o nome do cão."); setNotifyOpen(true); return; }
    setIsSaving(true);
    try {
      const mealPayload = serializeDogMeals(dogForm.refeicoes);
      const payload = {
        empresa_id: currentUser?.empresa_id || null,
        nome: formatDisplayName(dogForm.nome),
        apelido: optional(formatDisplayName(dogForm.apelido)),
        raca: optional(dogForm.raca),
        porte: optional(normalizeDogSize(dogForm.porte)),
        cores_pelagem: optional(dogForm.cores_pelagem),
        pelagem: optional(normalizeDogCoat(dogForm.pelagem)),
        peso: dogForm.peso ? parseFloat(dogForm.peso) : null,
        data_nascimento: optional(dogForm.data_nascimento),
        sexo: optional(dogForm.sexo),
        castrado: !!dogForm.castrado,
        foto_url: optional(dogForm.foto_url),
        foto_carteirinha_vacina_url: optional(dogForm.foto_carteirinha_vacina_url),
        data_revacinacao_1: optional(dogForm.data_revacinacao_1),
        nome_vacina_revacinacao_1: optional(dogForm.nome_vacina_revacinacao_1),
        data_revacinacao_2: optional(dogForm.data_revacinacao_2),
        nome_vacina_revacinacao_2: optional(dogForm.nome_vacina_revacinacao_2),
        data_revacinacao_3: optional(dogForm.data_revacinacao_3),
        nome_vacina_revacinacao_3: optional(dogForm.nome_vacina_revacinacao_3),
        alergias: optional(dogForm.alergias),
        restricoes_cuidados: optional(dogForm.restricoes_cuidados),
        observacoes_gerais: optional(dogForm.observacoes_gerais),
        veterinario_responsavel: optional(dogForm.veterinario_responsavel),
        veterinario_horario_atendimento: optional(dogForm.veterinario_horario_atendimento),
        veterinario_telefone: optional(dogForm.veterinario_telefone),
        veterinario_clinica_telefone: optional(dogForm.veterinario_clinica_telefone),
        veterinario_endereco: optional(dogForm.veterinario_endereco),
        alimentacao_marca_racao: dogForm.alimentacao_natural ? null : optional(dogForm.alimentacao_marca_racao),
        alimentacao_sabor: dogForm.alimentacao_natural ? null : optional(dogForm.alimentacao_sabor),
        alimentacao_tipo: dogForm.alimentacao_natural ? "Alimentação natural" : optional(dogForm.alimentacao_tipo),
        refeicao_1_qnt: optional(mealPayload.refeicao_1_qnt),
        refeicao_1_horario: optional(mealPayload.refeicao_1_horario),
        refeicao_1_obs: optional(mealPayload.refeicao_1_obs),
        refeicao_2_qnt: optional(mealPayload.refeicao_2_qnt),
        refeicao_2_horario: optional(mealPayload.refeicao_2_horario),
        refeicao_2_obs: optional(mealPayload.refeicao_2_obs),
        refeicao_3_qnt: optional(mealPayload.refeicao_3_qnt),
        refeicao_3_horario: optional(mealPayload.refeicao_3_horario),
        refeicao_3_obs: optional(mealPayload.refeicao_3_obs),
        refeicao_4_qnt: optional(mealPayload.refeicao_4_qnt),
        refeicao_4_horario: optional(mealPayload.refeicao_4_horario),
        refeicao_4_obs: optional(mealPayload.refeicao_4_obs),
        medicamentos_continuos: normalizeMedications(dogForm.medicamentos_continuos),
        autorizacao_uso_imagem: !!dogForm.autorizacao_uso_imagem,
      };
      validateRelationCapacity(responsaveis, selectedResponsavelIds, editingDogId, "O responsável");
      validateRelationCapacity(carteiras, selectedCarteiraIds, editingDogId, "O responsável financeiro");

      setNotifyOpen(false);
      const savedDog = editingDogId
        ? await Dog.update(editingDogId, payload)
        : await Dog.create(payload);

      const effectiveDogId = savedDog?.id || editingDogId;
      await syncDogLinks(Responsavel, responsaveis, selectedResponsavelIds, effectiveDogId);
      await syncDogLinks(Carteira, carteiras, selectedCarteiraIds, effectiveDogId);

      setNotifyTitle("Sucesso");
      setNotifyMessage(editingDogId ? "Cadastro do cão atualizado com sucesso!" : "Cão cadastrado com sucesso!");
      setNotifyOpen(true);
      resetDogEditor();
      clearDogEditQuery();
      await loadData();
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage(error?.message || "Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  const handleSaveResponsavel = async () => {
    if (!responsavelForm.nome_completo || !responsavelForm.cpf || !responsavelForm.celular) {
      setNotifyTitle("Campos obrigatórios"); setNotifyMessage("Preencha nome, CPF e celular."); setNotifyOpen(true); return;
    }
    setIsSaving(true);
    try {
      const responsavelCpfDigits = normalizeDocumentDigits(responsavelForm.cpf, 11);
      const hasDuplicateCpf = responsaveis.some((item) => normalizeDocumentDigits(item.cpf, 11) === responsavelCpfDigits);
      if (responsavelCpfDigits && hasDuplicateCpf) {
        setNotifyTitle("CPF já cadastrado");
          setNotifyMessage("Este CPF já possui cadastro no sistema.");
        setNotifyOpen(true);
        setIsSaving(false);
        return;
      }

      const cpfValidation = await validateCpfWithGov({
        cpf: responsavelForm.cpf,
        fullName: responsavelForm.nome_completo,
      });
      if (cpfValidation.shouldBlock) {
        setNotifyTitle("CPF não validado");
        setNotifyMessage(cpfValidation.message);
        setNotifyOpen(true);
        setIsSaving(false);
        return;
      }

      await Responsavel.create({
        empresa_id: currentUser?.empresa_id || null,
        nome_completo: formatDisplayName(responsavelForm.nome_completo),
        cpf: optional(responsavelForm.cpf),
        celular: optional(responsavelForm.celular),
        celular_alternativo: optional(responsavelForm.celular_alternativo),
        email: optional(responsavelForm.email),
        dog_id_1: optional(responsavelForm.dog_id_1),
        dog_id_2: optional(responsavelForm.dog_id_2),
        dog_id_3: optional(responsavelForm.dog_id_3),
        dog_id_4: optional(responsavelForm.dog_id_4),
        dog_id_5: optional(responsavelForm.dog_id_5),
        dog_id_6: optional(responsavelForm.dog_id_6),
        dog_id_7: optional(responsavelForm.dog_id_7),
        dog_id_8: optional(responsavelForm.dog_id_8),
      });
      setNotifyTitle("Sucesso"); setNotifyMessage("Responsável cadastrado!"); setNotifyOpen(true);
      setResponsavelForm(emptyResponsavel);
      await loadData();
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage(error?.message || "Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  const handleSaveCarteira = async () => {
    if (
      !carteiraForm.nome_razao_social
      || !carteiraForm.cpf_cnpj
      || !carteiraForm.celular
      || !carteiraForm.email
      || !carteiraForm.cep
      || !carteiraForm.street
      || !carteiraForm.numero_residencia
      || !carteiraForm.neighborhood
      || !carteiraForm.city
      || !carteiraForm.state
      || !carteiraForm.vencimento_planos
      || !carteiraForm.contato_orcamentos_nome
      || !carteiraForm.contato_orcamentos_celular
      || !carteiraForm.contato_orcamentos_email
      || !carteiraForm.contato_alinhamentos_nome
      || !carteiraForm.contato_alinhamentos_celular
      || !carteiraForm.contato_alinhamentos_email
    ) {
      setNotifyTitle("Campos obrigatórios");
      setNotifyMessage("Preencha os dados principais, endereço, vencimento e os contatos de orçamentos e alinhamentos.");
      setNotifyOpen(true);
      return;
    }
    setIsSaving(true);
    try {
      const cpfOrCnpjDigits = (carteiraForm.cpf_cnpj || "").replace(/\D/g, "");
      const hasDuplicateDocument = carteiras.some((item) => normalizeDocumentDigits(item.cpf_cnpj) === cpfOrCnpjDigits);
      if (cpfOrCnpjDigits && hasDuplicateDocument) {
        setNotifyTitle("Documento já cadastrado");
        setNotifyMessage(cpfOrCnpjDigits.length === 11 ? "Este CPF já possui cadastro no sistema." : "Este CNPJ já possui cadastro no sistema.");
        setNotifyOpen(true);
        setIsSaving(false);
        return;
      }

      if (cpfOrCnpjDigits.length === 11) {
        const cpfValidation = await validateCpfWithGov({
          cpf: carteiraForm.cpf_cnpj,
          fullName: carteiraForm.nome_razao_social,
        });
        if (cpfValidation.shouldBlock) {
          setNotifyTitle("CPF não validado");
          setNotifyMessage(cpfValidation.message);
          setNotifyOpen(true);
          setIsSaving(false);
          return;
        }
      }

      await Carteira.create({
        empresa_id: currentUser?.empresa_id || null,
        nome_razao_social: formatDisplayName(carteiraForm.nome_razao_social),
        cpf_cnpj: optional(carteiraForm.cpf_cnpj),
        celular: optional(carteiraForm.celular),
        email: optional(carteiraForm.email),
        cep: optional(carteiraForm.cep),
        numero_residencia: optional(carteiraForm.numero_residencia),
        street: optional(carteiraForm.street),
        neighborhood: optional(carteiraForm.neighborhood),
        city: optional(carteiraForm.city),
        state: optional(carteiraForm.state),
        vencimento_planos: optional(carteiraForm.vencimento_planos),
        contato_orcamentos: {
          nome: optional(formatDisplayName(carteiraForm.contato_orcamentos_nome)),
          celular: optional(carteiraForm.contato_orcamentos_celular),
          email: optional(carteiraForm.contato_orcamentos_email),
        },
        contato_alinhamentos: {
          nome: optional(formatDisplayName(carteiraForm.contato_alinhamentos_nome)),
          celular: optional(carteiraForm.contato_alinhamentos_celular),
          email: optional(carteiraForm.contato_alinhamentos_email),
        },
        dog_id_1: optional(carteiraForm.dog_id_1),
        dog_id_2: optional(carteiraForm.dog_id_2),
        dog_id_3: optional(carteiraForm.dog_id_3),
        dog_id_4: optional(carteiraForm.dog_id_4),
        dog_id_5: optional(carteiraForm.dog_id_5),
        dog_id_6: optional(carteiraForm.dog_id_6),
        dog_id_7: optional(carteiraForm.dog_id_7),
        dog_id_8: optional(carteiraForm.dog_id_8),
      });
      setNotifyTitle("Sucesso"); setNotifyMessage("Carteira cadastrada!"); setNotifyOpen(true);
      setCarteiraForm(emptyCarteira);
      await loadData();
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage(error?.message || "Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  const openClientLinkModal = () => {
    handleCreateClientLink();
  };

  const handleCreateClientLink = async () => {
    setIsSaving(true);
    try {
      const result = await clientRegistration({
        action: "create_link",
        empresa_id: currentUser?.empresa_id || null,
      });
      const link = buildClientRegistrationLink(result?.link?.token);
      setHasCopiedClientLink(false);
      setClientLinkValue(link);
      setShowClientLinkFeedback(true);
    } catch (error) {
      setNotifyTitle("Erro");
      setNotifyMessage(error?.message || "Não foi possível gerar o link de cadastro.");
      setNotifyOpen(true);
    } finally {
      setIsSaving(false);
    }
  };

  const copyClientLink = async () => {
    if (!clientLinkValue) return;
    try {
      await navigator.clipboard.writeText(clientLinkValue);
      setHasCopiedClientLink(true);
      window.setTimeout(() => setHasCopiedClientLink(false), 2000);
    } catch {
      setNotifyTitle("Erro");
      setNotifyMessage("Não foi possível copiar o link.");
      setNotifyOpen(true);
    }
  };

  const activeDogRecord = editingDogId ? dogs.find((item) => item.id === editingDogId) : null;
  const cadastroStats = [
    {
      id: "caes",
      label: "Cães cadastrados",
      value: dogs.length,
      icon: DogIcon,
      shellClass: "border-blue-200 bg-blue-50",
      iconClass: "bg-blue-100 text-blue-700",
      valueClass: "text-blue-700",
    },
    {
      id: "responsaveis",
      label: "Responsáveis",
      value: responsaveis.length,
      icon: Users,
      shellClass: "border-emerald-200 bg-emerald-50",
      iconClass: "bg-emerald-100 text-emerald-700",
      valueClass: "text-emerald-700",
    },
    {
      id: "carteiras",
      label: "Responsáveis financeiros",
      value: carteiras.length,
      icon: Wallet,
      shellClass: "border-orange-200 bg-orange-50",
      iconClass: "bg-orange-100 text-orange-700",
      valueClass: "text-orange-700",
    },
  ];

  const tabItems = [
    {
      id: "caes",
      label: "Cães",
      description: "Ficha do cão, saúde, medicação e vínculos.",
      icon: DogIcon,
      count: dogs.length,
      activeClass: "data-[state=active]:bg-blue-600 data-[state=active]:text-white",
      badgeClass: "bg-blue-100 text-blue-700",
    },
    {
      id: "responsaveis",
      label: "Responsáveis",
      description: "Contatos, CPF e associação com os cães.",
      icon: Users,
      count: responsaveis.length,
      activeClass: "data-[state=active]:bg-emerald-600 data-[state=active]:text-white",
      badgeClass: "bg-emerald-100 text-emerald-700",
    },
    {
      id: "carteiras",
      label: "Financeiro",
      description: "Cobrança, vencimento e vínculo financeiro.",
      icon: Wallet,
      count: carteiras.length,
      activeClass: "data-[state=active]:bg-orange-600 data-[state=active]:text-white",
      badgeClass: "bg-orange-100 text-orange-700",
    },
  ];
  const activeTabItem = tabItems.find((item) => item.id === activeTab) || tabItems[0];
  const ActiveTabHeaderIcon = activeTabItem.icon;
  const activeHeaderTone = HEADER_TONE_BY_TAB[activeTabItem.id] || HEADER_TONE_BY_TAB.caes;
  const dogBreedOptions = buildSelectOptions(DOG_BREED_OPTIONS, dogForm.raca);
  const dogSizeOptions = buildSelectOptions(DOG_SIZE_OPTIONS, normalizeDogSize(dogForm.porte));
  const dogCoatOptions = buildSelectOptions(DOG_COAT_OPTIONS, normalizeDogCoat(dogForm.pelagem));
  const dogDraftCompleted = [
    dogForm.nome,
    dogForm.raca,
    dogForm.data_nascimento,
    dogForm.alimentacao_tipo || dogForm.alimentacao_marca_racao,
    selectedResponsavelIds.length > 0 || selectedCarteiraIds.length > 0,
  ].filter(Boolean).length;
  const responsavelDraftCompleted = [
    responsavelForm.nome_completo,
    responsavelForm.cpf,
    responsavelForm.celular,
    responsavelForm.email,
    [1, 2, 3, 4, 5, 6, 7, 8].some((slot) => Boolean(responsavelForm[`dog_id_${slot}`])),
  ].filter(Boolean).length;
  const carteiraDraftCompleted = [
    carteiraForm.nome_razao_social,
    carteiraForm.cpf_cnpj,
    carteiraForm.celular,
    carteiraForm.vencimento_planos,
    [1, 2, 3, 4, 5, 6, 7, 8].some((slot) => Boolean(carteiraForm[`dog_id_${slot}`])),
  ].filter(Boolean).length;
  const jornadaCadastro = [
    {
      id: "caes",
      title: editingDogId ? "Continuar ficha do cão" : "Iniciar cadastro do cão",
      caption: editingDogId ? `Retome a edição de ${activeDogRecord?.nome}.` : "Preencha dados básicos, saúde, alimentação e vínculos.",
      icon: DogIcon,
      progress: Math.round((dogDraftCompleted / 5) * 100),
      counter: `${dogDraftCompleted}/5`,
      themeClass: "border-blue-200/30 bg-blue-400/10 hover:bg-blue-400/15",
      iconClass: "bg-blue-300/20 text-blue-100",
      progressClass: "bg-blue-300",
    },
    {
      id: "responsaveis",
      title: "Cadastrar responsável",
      caption: "Organize contatos principais e conecte os cães corretos.",
      icon: Users,
      progress: Math.round((responsavelDraftCompleted / 5) * 100),
      counter: `${responsavelDraftCompleted}/5`,
      themeClass: "border-emerald-200/30 bg-emerald-400/10 hover:bg-emerald-400/15",
      iconClass: "bg-emerald-300/20 text-emerald-100",
      progressClass: "bg-emerald-300",
    },
    {
      id: "carteiras",
      title: "Configurar financeiro",
      caption: "Defina cobrança, vencimento e vínculo financeiro do cão.",
      icon: Wallet,
      progress: Math.round((carteiraDraftCompleted / 5) * 100),
      counter: `${carteiraDraftCompleted}/5`,
      themeClass: "border-orange-200/30 bg-orange-400/10 hover:bg-orange-400/15",
      iconClass: "bg-orange-300/20 text-orange-100",
      progressClass: "bg-orange-300",
    },
  ];
  void jornadaCadastro;

  

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <Card className="mb-6 overflow-hidden border border-gray-200 bg-white shadow-sm">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-emerald-500 to-orange-400" />
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Central de cadastros
                </div>
                <div className="flex items-start gap-4">
                  <div className="mt-1 rounded-2xl bg-blue-100 p-3 text-blue-700 shadow-sm">
                    <DogIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Cadastro</h1>
                    <p className="hidden mt-2 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                      Organize cães, responsáveis e financeiro em um único fluxo, com leitura mais clara e ações rápidas no mesmo padrão visual do restante do sistema.
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
                      Organize cães, responsáveis e financeiro em um único fluxo.
                    </p>
                    <div className="mt-4 hidden flex-wrap gap-2">
                      {tabItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveTab(item.id)}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              isActive
                                ? `${item.badgeClass} border-transparent`
                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                            <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700">
                              {item.count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex w-full max-w-sm flex-col gap-3">
                <Button onClick={openClientLinkModal} className="justify-between bg-blue-600 text-white hover:bg-blue-700">
                  <span className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Link de cadastro
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <div className={`hidden rounded-2xl border p-4 ${activeHeaderTone.panelClass}`}>
                  <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 ${activeHeaderTone.iconClass}`}>
                      <ActiveTabHeaderIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900">{activeTabItem.label}</p>
                        <Badge className={activeTabItem.badgeClass}>{activeTabItem.count} cadastro(s)</Badge>
                      </div>
                      <p className="mt-2 text-xs font-medium text-gray-500">
                        {activeTab === "caes"
                          ? activeDogRecord
                            ? `Editando agora: ${activeDogRecord.nome}.`
                            : "Use esta área para criar novas fichas de cães."
                          : activeTab === "responsaveis"
                            ? "Cadastre contatos, documentos e vínculos dos responsáveis."
                            : "Mantenha os responsáveis financeiros vinculados aos cães corretos."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mb-6 hidden grid gap-4 sm:grid-cols-3">
          {cadastroStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.id} className={`border ${stat.shellClass}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-slate-600">{stat.label}</p>
                    <p className={`mt-2 text-2xl font-bold ${stat.valueClass}`}>{stat.value}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${stat.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <PageSubTabs
            className="mb-6"
            items={[
              { value: "caes", content: <><DogIcon className="w-4 h-4" /><span>Cães</span></> },
              { value: "responsaveis", content: <><Users className="w-4 h-4" /><span>Responsáveis</span></> },
              { value: "carteiras", content: <><Wallet className="w-4 h-4" /><span>Carteiras</span></> },
            ]}
          />

          {/* Cães Tab */}
          <TabsContent value="caes">
            <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
              <Card className="border-blue-200 bg-blue-50/70">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                      <HeartPulse className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-blue-900">Cadastro do cão</p>
                      <p className="mt-1 text-sm text-blue-800">
                        Separei o preenchimento em blocos para ficar mais fácil revisar saúde, alimentação, medicação e vínculos antes de salvar.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-slate-900">Resumo rápido</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="bg-blue-100 text-blue-700">{selectedResponsavelIds.length} responsável(is)</Badge>
                    <Badge className="bg-orange-100 text-orange-700">{selectedCarteiraIds.length} financeiro(s)</Badge>
                    <Badge className="bg-purple-100 text-purple-700">{(dogForm.medicamentos_continuos || []).length} medicamento(s)</Badge>
                    {activeDogRecord ? <Badge className="bg-emerald-100 text-emerald-700">Editando {activeDogRecord.nome}</Badge> : null}
                  </div>
                </CardContent>
              </Card>
            </div>
            <Card className="border-blue-200 bg-white shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><DogIcon className="w-5 h-5 text-blue-600" />Cadastrar Cão</h3>
                {editingDogId ? (
                  <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-blue-700">
                      Você está atualizando este cão e pode revisar vínculos, vacinas e cadastro completo.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        resetDogEditor();
                        clearDogEditQuery();
                      }}
                    >
                      Limpar edição
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {renderTextField({
                    fieldKey: "dog.nome",
                    label: "Nome",
                    value: dogForm.nome,
                    onChange: (e) => setDogForm({ ...dogForm, nome: sanitizeDisplayNameInput(e.target.value) }),
                    onBlur: () => setDogForm({ ...dogForm, nome: formatDisplayName(dogForm.nome) }),
                    placeholder: "Nome do cão",
                    requiredMessage: "Informe o nome do cão.",
                  })}
                  {renderTextField({
                    fieldKey: "dog.apelido",
                    label: "Apelido",
                    value: dogForm.apelido,
                    onChange: (e) => setDogForm({ ...dogForm, apelido: sanitizeDisplayNameInput(e.target.value) }),
                    onBlur: () => setDogForm({ ...dogForm, apelido: formatDisplayName(dogForm.apelido) }),
                    placeholder: "Como ele é chamado no dia a dia",
                    optional: true,
                  })}
                  {renderSelectField({
                    fieldKey: "dog.raca",
                    label: "Raça",
                    value: dogForm.raca || "",
                    placeholder: "Selecione a raça",
                    requiredMessage: "Selecione a raça.",
                    children: ({ triggerClassName, placeholder }) => (
                      <Select value={dogForm.raca || ""} onValueChange={(value) => {
                        setDogForm({ ...dogForm, raca: value });
                        touchField("dog.raca");
                      }}>
                        <SelectTrigger className={triggerClassName}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {dogBreedOptions.map((breed) => (
                            <SelectItem key={breed} value={breed}>{breed}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ),
                  })}
                  {renderSelectField({
                    fieldKey: "dog.porte",
                    label: "Porte",
                    value: normalizeDogSize(dogForm.porte) || "",
                    placeholder: "Selecione o porte",
                    requiredMessage: "Selecione o porte.",
                    children: ({ triggerClassName, placeholder }) => (
                      <Select value={normalizeDogSize(dogForm.porte) || ""} onValueChange={(value) => {
                        setDogForm({ ...dogForm, porte: value });
                        touchField("dog.porte");
                      }}>
                        <SelectTrigger className={triggerClassName}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {dogSizeOptions.map((size) => (
                            <SelectItem key={size} value={size}>{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ),
                  })}
                  {renderTextField({
                    fieldKey: "dog.cores_pelagem",
                    label: "Cores da pelagem",
                    value: dogForm.cores_pelagem,
                    onChange: (e) => setDogForm({ ...dogForm, cores_pelagem: e.target.value }),
                    placeholder: "Ex: caramelo com branco",
                    requiredMessage: "Informe as cores da pelagem.",
                  })}
                  {renderSelectField({
                    fieldKey: "dog.pelagem",
                    label: "Pelagem",
                    value: normalizeDogCoat(dogForm.pelagem) || "",
                    placeholder: "Selecione a pelagem",
                    requiredMessage: "Selecione a pelagem.",
                    children: ({ triggerClassName, placeholder }) => (
                      <Select value={normalizeDogCoat(dogForm.pelagem) || ""} onValueChange={(value) => {
                        setDogForm({ ...dogForm, pelagem: value });
                        touchField("dog.pelagem");
                      }}>
                        <SelectTrigger className={triggerClassName}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {dogCoatOptions.map((coat) => (
                            <SelectItem key={coat} value={coat}>{coat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ),
                  })}
                  {renderTextField({
                    fieldKey: "dog.peso",
                    label: "Peso (kg)",
                    value: dogForm.peso,
                    onChange: (e) => setDogForm({ ...dogForm, peso: e.target.value }),
                    placeholder: "Ex: 12,5",
                    kind: "weight",
                    requiredMessage: "Informe o peso.",
                  })}
                  {renderDateField({
                    fieldKey: "dog.data_nascimento",
                    label: "Data de nascimento",
                    value: dogForm.data_nascimento,
                    onChange: (value) => setDogForm({ ...dogForm, data_nascimento: value }),
                    placeholder: "Selecione a data",
                    requiredMessage: "Informe a data de nascimento.",
                  })}
                  {renderSelectField({
                    fieldKey: "dog.sexo",
                    label: "Sexo",
                    value: dogForm.sexo || "",
                    placeholder: "Selecione o sexo",
                    requiredMessage: "Selecione o sexo.",
                    children: ({ triggerClassName, placeholder }) => (
                      <Select value={dogForm.sexo || ""} onValueChange={(value) => {
                        setDogForm({ ...dogForm, sexo: value });
                        touchField("dog.sexo");
                      }}>
                        <SelectTrigger className={triggerClassName}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="macho">Macho</SelectItem>
                          <SelectItem value="femea">Fêmea</SelectItem>
                        </SelectContent>
                      </Select>
                    ),
                  })}
                  <div className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Castrado</p>
                      <p className="text-xs text-gray-500">Informe se o cão já é castrado.</p>
                    </div>
                    <Switch checked={!!dogForm.castrado} onCheckedChange={(checked) => setDogForm({ ...dogForm, castrado: checked })} />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Autorizo o uso de imagens do meu Dog</p>
                      <p className="text-xs text-gray-500">Permite fotos e vídeos do cão em registros e comunicação da Dog City.</p>
                    </div>
                    <Switch checked={!!dogForm.autorizacao_uso_imagem} onCheckedChange={(checked) => setDogForm({ ...dogForm, autorizacao_uso_imagem: checked })} />
                  </div>
                  <div><Label>Foto Perfil</Label><div className="flex gap-2"><input type="file" accept="image/*" className="hidden" id="foto-perfil" onChange={(e) => handleUpload(e.target.files?.[0], "foto_url")} /><Button variant="outline" onClick={() => document.getElementById("foto-perfil").click()} disabled={isUploading} className="flex-1"><Upload className="w-4 h-4 mr-2" />{isUploading ? "..." : "Enviar"}</Button>{dogForm.foto_url && <button type="button" onClick={() => openImageViewer(dogForm.foto_url, "Foto do perfil")} className="text-blue-600 text-sm self-center">Ver</button>}</div></div>
                  <div><Label>Carteirinha de vacinação</Label><div className="flex gap-2"><input type="file" accept="image/*" className="hidden" id="carteirinha" onChange={(e) => handleUpload(e.target.files?.[0], "foto_carteirinha_vacina_url")} /><Button variant="outline" onClick={() => document.getElementById("carteirinha").click()} disabled={isUploading} className="flex-1"><Upload className="w-4 h-4 mr-2" />{isUploading ? "..." : "Enviar"}</Button>{dogForm.foto_carteirinha_vacina_url && <button type="button" onClick={() => openDogDocument(dogForm.foto_carteirinha_vacina_url)} className="text-blue-600 text-sm self-center">Ver</button>}</div></div>
                  {renderDateField({
                    fieldKey: "dog.data_revacinacao_1",
                    label: "1ª revacinação",
                    value: dogForm.data_revacinacao_1,
                    onChange: (value) => setDogForm({ ...dogForm, data_revacinacao_1: value }),
                    placeholder: "Selecione a data",
                    optional: true,
                  })}
                  {renderDateField({
                    fieldKey: "dog.data_revacinacao_2",
                    label: "2ª revacinação",
                    value: dogForm.data_revacinacao_2,
                    onChange: (value) => setDogForm({ ...dogForm, data_revacinacao_2: value }),
                    placeholder: "Selecione a data",
                    optional: true,
                  })}
                  {renderDateField({
                    fieldKey: "dog.data_revacinacao_3",
                    label: "3ª revacinação",
                    value: dogForm.data_revacinacao_3,
                    onChange: (value) => setDogForm({ ...dogForm, data_revacinacao_3: value }),
                    placeholder: "Selecione a data",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "dog.nome_vacina_revacinacao_1",
                    label: "Vacina da 1ª revacinação",
                    value: dogForm.nome_vacina_revacinacao_1,
                    onChange: (e) => setDogForm({ ...dogForm, nome_vacina_revacinacao_1: e.target.value }),
                    placeholder: "Ex: V10, Antirrábica",
                    optional: !dogForm.data_revacinacao_1,
                    requiredMessage: "Informe a vacina vinculada a esta data.",
                  })}
                  {renderTextField({
                    fieldKey: "dog.nome_vacina_revacinacao_2",
                    label: "Vacina da 2ª revacinação",
                    value: dogForm.nome_vacina_revacinacao_2,
                    onChange: (e) => setDogForm({ ...dogForm, nome_vacina_revacinacao_2: e.target.value }),
                    placeholder: "Ex: V10, Antirrábica",
                    optional: !dogForm.data_revacinacao_2,
                    requiredMessage: "Informe a vacina vinculada a esta data.",
                  })}
                  {renderTextField({
                    fieldKey: "dog.nome_vacina_revacinacao_3",
                    label: "Vacina da 3ª revacinação",
                    value: dogForm.nome_vacina_revacinacao_3,
                    onChange: (e) => setDogForm({ ...dogForm, nome_vacina_revacinacao_3: e.target.value }),
                    placeholder: "Ex: V10, Antirrábica",
                    optional: !dogForm.data_revacinacao_3,
                    requiredMessage: "Informe a vacina vinculada a esta data.",
                  })}

                  <div className="col-span-full"><h4 className="font-semibold text-gray-900 mt-4 mb-2">Veterinário</h4></div>
                  {renderTextField({
                    fieldKey: "dog.veterinario_responsavel",
                    label: "Veterinário responsável",
                    value: dogForm.veterinario_responsavel,
                    onChange: (e) => setDogForm({ ...dogForm, veterinario_responsavel: e.target.value }),
                    placeholder: "Nome do veterinário",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "dog.veterinario_horario_atendimento",
                    label: "Horário de atendimento",
                    value: dogForm.veterinario_horario_atendimento,
                    onChange: (e) => setDogForm({ ...dogForm, veterinario_horario_atendimento: e.target.value }),
                    placeholder: "Ex: seg a sex, 9h às 18h",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "dog.veterinario_telefone",
                    label: "Telefone do veterinário",
                    value: dogForm.veterinario_telefone,
                    onChange: (e) => setDogForm({ ...dogForm, veterinario_telefone: formatPhone(e.target.value) }),
                    maxLength: 15,
                    placeholder: "(00) 00000-0000",
                    kind: "phone",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "dog.veterinario_clinica_telefone",
                    label: "Telefone da clínica",
                    value: dogForm.veterinario_clinica_telefone,
                    onChange: (e) => setDogForm({ ...dogForm, veterinario_clinica_telefone: formatPhone(e.target.value) }),
                    maxLength: 15,
                    placeholder: "(00) 00000-0000",
                    kind: "phone",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "dog.veterinario_endereco",
                    label: "Endereço vet/clínica",
                    value: dogForm.veterinario_endereco,
                    onChange: (e) => setDogForm({ ...dogForm, veterinario_endereco: e.target.value }),
                    placeholder: "Endereço completo",
                    optional: true,
                    className: "sm:col-span-2",
                  })}

                  <div className="col-span-full"><h4 className="font-semibold text-gray-900 mt-4 mb-2">Alimentação</h4></div>
                  <div className="col-span-full flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Alimentação natural</p>
                      <p className="text-xs text-gray-500">Ao marcar, os campos de marca e sabor são ocultados.</p>
                    </div>
                    <Switch
                      checked={!!dogForm.alimentacao_natural}
                        onCheckedChange={(checked) => setDogForm({
                        ...dogForm,
                        alimentacao_natural: checked,
                        alimentacao_tipo: checked ? "Alimentação natural" : dogForm.alimentacao_tipo,
                        alimentacao_marca_racao: checked ? "" : dogForm.alimentacao_marca_racao,
                        alimentacao_sabor: checked ? "" : dogForm.alimentacao_sabor,
                      })}
                    />
                  </div>
                  {!dogForm.alimentacao_natural ? (
                    <>
                      {renderTextField({
                        fieldKey: "dog.alimentacao_marca_racao",
                        label: "Marca da ração",
                        value: dogForm.alimentacao_marca_racao,
                        onChange: (e) => setDogForm({ ...dogForm, alimentacao_marca_racao: e.target.value }),
                        placeholder: "Ex: Premier",
                        optional: true,
                      })}
                      {renderTextField({
                        fieldKey: "dog.alimentacao_sabor",
                        label: "Sabor",
                        value: dogForm.alimentacao_sabor,
                        onChange: (e) => setDogForm({ ...dogForm, alimentacao_sabor: e.target.value }),
                        placeholder: "Ex: cordeiro",
                        optional: true,
                      })}
                      {renderTextField({
                        fieldKey: "dog.alimentacao_tipo",
                        label: "Tipo",
                        value: dogForm.alimentacao_tipo,
                        onChange: (e) => setDogForm({ ...dogForm, alimentacao_tipo: e.target.value }),
                        placeholder: "Ex: sênior, light, filhote",
                        optional: true,
                      })}
                    </>
                  ) : (
                      <div className="col-span-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      O cão está marcado com alimentação natural.
                    </div>
                  )}

                  <div className="col-span-full rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h5 className="text-sm font-semibold text-gray-900">Refeições</h5>
                        <p className="text-xs text-gray-500">Comece com uma linha e adicione outras conforme necessário.</p>
                      </div>
                      <Button type="button" variant="outline" onClick={addDogMeal} disabled={(dogForm.refeicoes || []).length >= 4}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar refeição
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {(dogForm.refeicoes || [createEmptyDogMeal()]).map((meal, index) => (
                        <div key={`meal-${index}`} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900">{index + 1}ª refeição</p>
                            <Button type="button" variant="outline" size="sm" onClick={() => removeDogMeal(index)}>
                              <X className="mr-2 h-4 w-4" />
                              Remover
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {renderTextField({
                              fieldKey: `dog.refeicao.${index}.qnt`,
                              label: "Qnt (g)",
                              value: meal.qnt || "",
                              onChange: (e) => updateDogMeal(index, "qnt", e.target.value),
                              placeholder: "Quantidade em gramas",
                              requiredMessage: "Informe a quantidade.",
                            })}
                            {renderTimeField({
                              fieldKey: `dog.refeicao.${index}.horario`,
                              label: "Horário",
                              value: meal.horario || "",
                              onChange: (value) => updateDogMeal(index, "horario", value),
                              placeholder: "Selecione o horário",
                              requiredMessage: "Informe o horário.",
                            })}
                            {renderTextField({
                              fieldKey: `dog.refeicao.${index}.obs`,
                              label: "Observação",
                              value: meal.obs || "",
                              onChange: (e) => updateDogMeal(index, "obs", e.target.value),
                              placeholder: "Ex: refeição úmida separada",
                              optional: true,
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <h4 className="font-semibold text-gray-900 mb-3">Medicamentos de longo período / vitalício</h4>
                <div className="space-y-3">
                  {(dogForm.medicamentos_continuos || []).map((medicacao, index) => (
                    <div key={`medicacao-${index}`} className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900">Medicamento {index + 1}</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => removeDogMedication(index)}>
                          <X className="w-4 h-4 mr-1" />
                          Remover
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {renderTextField({
                          fieldKey: `dog.medicacao.${index}.especificacoes`,
                          label: "Especificações",
                          value: medicacao.especificacoes || "",
                          onChange: (e) => updateDogMedication(index, "especificacoes", e.target.value),
                          placeholder: "Nome e orientação",
                          requiredMessage: "Informe as especificações.",
                        })}
                        {renderTextField({
                          fieldKey: `dog.medicacao.${index}.cuidados`,
                          label: "Cuidados",
                          value: medicacao.cuidados || "",
                          onChange: (e) => updateDogMedication(index, "cuidados", e.target.value),
                          placeholder: "Ex: após refeição",
                          requiredMessage: "Informe os cuidados.",
                        })}
                        {renderTimeField({
                          fieldKey: `dog.medicacao.${index}.horario`,
                          label: "Horário",
                          value: medicacao.horario || "",
                          onChange: (value) => updateDogMedication(index, "horario", value),
                          placeholder: "Selecione o horário",
                          requiredMessage: "Informe o horário.",
                        })}
                        {renderTextField({
                          fieldKey: `dog.medicacao.${index}.dose`,
                          label: "Dose",
                          value: medicacao.dose || "",
                          onChange: (e) => updateDogMedication(index, "dose", e.target.value),
                          placeholder: "Ex: 1 comprimido",
                          requiredMessage: "Informe a dose.",
                        })}
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addDogMedication} className="border-dashed">
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar medicamento
                  </Button>
                  <div className="rounded-xl border border-blue-100 bg-white p-4">
                    <h5 className="mb-3 text-sm font-semibold text-gray-900">Saúde e observações</h5>
                    <div className="grid grid-cols-1 gap-4">
                      {renderTextAreaField({
                        fieldKey: "dog.alergias",
                        label: "Alergias",
                        value: dogForm.alergias,
                        onChange: (e) => setDogForm({ ...dogForm, alergias: e.target.value }),
                        rows: 2,
                        placeholder: "Alergias, intolerâncias ou sensibilidades do cão",
                        optional: true,
                      })}
                      {renderTextAreaField({
                        fieldKey: "dog.restricoes_cuidados",
                        label: "Restrições e cuidados",
                        value: dogForm.restricoes_cuidados,
                        onChange: (e) => setDogForm({ ...dogForm, restricoes_cuidados: e.target.value }),
                        rows: 3,
                        placeholder: "Cuidados especiais, restrições de manejo e observações clínicas",
                        optional: true,
                      })}
                      {renderTextAreaField({
                        fieldKey: "dog.observacoes_gerais",
                        label: "Observações gerais",
                        value: dogForm.observacoes_gerais,
                        onChange: (e) => setDogForm({ ...dogForm, observacoes_gerais: e.target.value }),
                        rows: 3,
                        placeholder: "Comportamento, preferências e demais observações importantes",
                        optional: true,
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="mt-4 border-blue-100 bg-white">
              <CardContent className="p-4 sm:p-6">
                <div className="rounded-xl border border-blue-100 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900">Vincular responsáveis existentes</h5>
                      <p className="text-xs text-gray-500">Selecione quem já existe no sistema e deve ficar associado a este cão.</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700">{selectedResponsavelIds.length} selecionado(s)</Badge>
                  </div>
                  <SearchFiltersToolbar
                    searchTerm={searchLinkedResponsavel}
                    onSearchChange={setSearchLinkedResponsavel}
                    searchPlaceholder="Buscar responsável por nome, CPF, celular ou email..."
                    hasActiveFilters={Boolean(searchLinkedResponsavel)}
                    onClear={() => setSearchLinkedResponsavel("")}
                  />
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                    {filteredResponsaveis.length > 0 ? filteredResponsaveis.map((responsavel) => {
                      const isSelected = selectedResponsavelIds.includes(responsavel.id);
                      return (
                        <button
                          key={responsavel.id}
                          type="button"
                          onClick={() => toggleLinkedRecord(responsavel.id, setSelectedResponsavelIds)}
                          className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${isSelected ? "border-blue-300 bg-blue-50" : "border-transparent bg-white hover:border-gray-200"}`}
                        >
                          <div>
                            <p className="font-medium text-gray-900">{responsavel.nome_completo}</p>
                            <p className="text-xs text-gray-500">{responsavel.celular || responsavel.email || responsavel.cpf || "Sem contato cadastrado"}</p>
                          </div>
                          {isSelected ? <Check className="h-4 w-4 text-blue-600" /> : null}
                        </button>
                      );
                    }) : (
                      <p className="p-3 text-sm text-gray-500">Nenhum responsável encontrado.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="mt-4 border-orange-100 bg-white">
              <CardContent className="p-4 sm:p-6">
                <div className="rounded-xl border border-orange-100 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h5 className="text-sm font-semibold text-gray-900">Vincular responsável financeiro existente</h5>
                      <p className="text-xs text-gray-500">Use esta lista quando o responsável financeiro já tiver sido cadastrado antes do cão.</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-700">{selectedCarteiraIds.length} selecionado(s)</Badge>
                  </div>
                  <SearchFiltersToolbar
                    searchTerm={searchLinkedCarteira}
                    onSearchChange={setSearchLinkedCarteira}
                    searchPlaceholder="Buscar responsável financeiro por nome, CPF/CNPJ, celular ou email..."
                    hasActiveFilters={Boolean(searchLinkedCarteira)}
                    onClear={() => setSearchLinkedCarteira("")}
                  />
                  <div className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                    {filteredCarteiras.length > 0 ? filteredCarteiras.map((carteira) => {
                      const isSelected = selectedCarteiraIds.includes(carteira.id);
                      return (
                        <button
                          key={carteira.id}
                          type="button"
                          onClick={() => toggleLinkedRecord(carteira.id, setSelectedCarteiraIds)}
                          className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${isSelected ? "border-orange-300 bg-orange-50" : "border-transparent bg-white hover:border-gray-200"}`}
                        >
                          <div>
                            <p className="font-medium text-gray-900">{carteira.nome_razao_social}</p>
                            <p className="text-xs text-gray-500">{carteira.celular || carteira.email || carteira.cpf_cnpj || "Sem contato cadastrado"}</p>
                          </div>
                          {isSelected ? <Check className="h-4 w-4 text-orange-600" /> : null}
                        </button>
                      );
                    }) : (
                      <p className="p-3 text-sm text-gray-500">Nenhum responsável financeiro encontrado.</p>
                    )}
                  </div>
                </div>
                <div className="mt-6">
                  <Button onClick={handleSaveDog} disabled={isSaving} className="w-full bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Cão"}</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responsáveis Tab */}
          <TabsContent value="responsaveis">
            <Card className="mb-4 border-emerald-200 bg-emerald-50/70">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Responsáveis do dia a dia</p>
                    <p className="mt-1 text-sm text-emerald-800">
                      Cadastre os contatos principais, documentos e os cães vinculados para facilitar operação e comunicação.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-white shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-green-600" />Cadastrar Responsável</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderTextField({
                    fieldKey: "responsavel.nome_completo",
                    label: "Nome completo",
                    value: responsavelForm.nome_completo,
                    onChange: (e) => setResponsavelForm({ ...responsavelForm, nome_completo: sanitizeDisplayNameInput(e.target.value) }),
                    onBlur: () => setResponsavelForm({ ...responsavelForm, nome_completo: formatDisplayName(responsavelForm.nome_completo) }),
                    placeholder: "Nome completo do responsável",
                    requiredMessage: "Informe o nome completo.",
                  })}
                  {renderTextField({
                    fieldKey: "responsavel.cpf",
                    label: "CPF",
                    value: responsavelForm.cpf,
                    onChange: (e) => setResponsavelForm({ ...responsavelForm, cpf: formatCPF(e.target.value) }),
                    maxLength: 14,
                    placeholder: "000.000.000-00",
                    kind: "cpf",
                    requiredMessage: "Informe o CPF.",
                  })}
                  {renderTextField({
                    fieldKey: "responsavel.celular",
                    label: "Celular",
                    value: responsavelForm.celular,
                    onChange: (e) => setResponsavelForm({ ...responsavelForm, celular: formatPhone(e.target.value) }),
                    maxLength: 15,
                    placeholder: "(00) 00000-0000",
                    kind: "phone",
                    requiredMessage: "Informe o celular.",
                  })}
                  {renderTextField({
                    fieldKey: "responsavel.celular_alternativo",
                    label: "Celular alternativo",
                    value: responsavelForm.celular_alternativo,
                    onChange: (e) => setResponsavelForm({ ...responsavelForm, celular_alternativo: formatPhone(e.target.value) }),
                    maxLength: 15,
                    placeholder: "(00) 00000-0000",
                    kind: "phone",
                    optional: true,
                  })}
                  {renderTextField({
                    fieldKey: "responsavel.email",
                    label: "Email",
                    value: responsavelForm.email,
                    onChange: (e) => setResponsavelForm({ ...responsavelForm, email: e.target.value }),
                    type: "email",
                    placeholder: "email@exemplo.com",
                    kind: "email",
                    requiredMessage: "Informe o email.",
                    className: "sm:col-span-2",
                  })}
                  <div className="sm:col-span-2">
                    <Label>Vincular Cães (até 8)</Label>
                    <div className="mt-2">
                      <SearchFiltersToolbar
                        searchTerm={searchDogResp}
                        onSearchChange={setSearchDogResp}
                        searchPlaceholder="Buscar cão por nome..."
                        hasActiveFilters={Boolean(searchDogResp)}
                        onClear={() => setSearchDogResp("")}
                      />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                      {dogs.filter(d => !searchDogResp || d.nome?.toLowerCase().includes(searchDogResp.toLowerCase())).map(d => {
                        const selectedSlot = [1,2,3,4,5,6,7,8].find(n => responsavelForm[`dog_id_${n}`] === d.id);
                        const isSelected = !!selectedSlot;
                        const canSelect = !isSelected && [1,2,3,4,5,6,7,8].some(n => !responsavelForm[`dog_id_${n}`]);
                        return (
                          <div key={d.id} className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-green-50' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setResponsavelForm({ ...responsavelForm, [`dog_id_${selectedSlot}`]: "" });
                              } else if (canSelect) {
                                const emptySlot = [1,2,3,4,5,6,7,8].find(n => !responsavelForm[`dog_id_${n}`]);
                                if (emptySlot) setResponsavelForm({ ...responsavelForm, [`dog_id_${emptySlot}`]: d.id });
                              }
                            }}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? <img src={d.foto_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">ðŸ•</div>}
                              <span className="text-sm font-medium">{d.nome}</span>
                              {d.raca && <span className="text-xs text-gray-500">({d.raca})</span>}
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-green-600" />}
                          </div>
                        );
                      })}
                      {dogs.length === 0 && <p className="text-sm text-gray-500 text-center py-2">Nenhum cão cadastrado</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[1,2,3,4,5,6,7,8].map(n => {
                        const dogId = responsavelForm[`dog_id_${n}`];
                        const dog = dogs.find(d => d.id === dogId);
                        if (!dogId) return null;
                        return <Badge key={n} className="bg-green-100 text-green-700 flex items-center gap-1">{dog?.nome || dogId}<X className="w-3 h-3 cursor-pointer" onClick={() => setResponsavelForm({ ...responsavelForm, [`dog_id_${n}`]: "" })} /></Badge>;
                      })}
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveResponsavel} disabled={isSaving} className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Respons?vel"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Carteiras Tab */}
          <TabsContent value="carteiras">
            <Card className="mb-4 border-orange-200 bg-orange-50/70">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-orange-900">Financeiro vinculado ao cão</p>
                    <p className="mt-1 text-sm text-orange-800">
                      Mantenha quem paga, dados de cobrança e vencimento dos planos organizados em um bloco separado.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-orange-200 bg-white shadow-sm">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-orange-600" />Cadastrar Carteira</h3>
                <div className="mb-4 flex items-center justify-between rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-orange-900">Usar os mesmos dados do responsável</p>
                    <p className="text-xs text-orange-700">Preenche nome, documento, contato principal e contatos de orçamento/alinhamento.</p>
                  </div>
                  <Switch checked={carteiraIgualResponsavel} onCheckedChange={setCarteiraIgualResponsavel} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderTextField({
                    fieldKey: "carteira.nome_razao_social",
                    label: "Nome / Razão social",
                    value: carteiraForm.nome_razao_social,
                    onChange: (e) => setCarteiraForm({
                      ...carteiraForm,
                      nome_razao_social: sanitizeDisplayNameInput(e.target.value),
                    }),
                    onBlur: (e) => setCarteiraForm({
                      ...carteiraForm,
                      nome_razao_social: formatDisplayName(e.target.value),
                    }),
                    placeholder: "Nome completo do responsável financeiro",
                    requiredMessage: "Informe o nome ou razão social.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.cpf_cnpj",
                    label: "CPF / CNPJ",
                    value: carteiraForm.cpf_cnpj,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, cpf_cnpj: formatCPF(e.target.value) }),
                    maxLength: 18,
                    placeholder: "CPF ou CNPJ",
                    kind: "cpf_cnpj",
                    requiredMessage: "Informe o CPF ou CNPJ.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.celular",
                    label: "Celular",
                    value: carteiraForm.celular,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, celular: formatPhone(e.target.value) }),
                    maxLength: 15,
                    placeholder: "(00) 00000-0000",
                    kind: "phone",
                    requiredMessage: "Informe o celular.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.email",
                    label: "Email",
                    value: carteiraForm.email,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, email: e.target.value }),
                    type: "email",
                    placeholder: "email@exemplo.com",
                    kind: "email",
                    requiredMessage: "Informe o email.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.cep",
                    label: "CEP",
                    value: carteiraForm.cep,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, cep: formatCEP(e.target.value) }),
                    maxLength: 9,
                    placeholder: "00000-000",
                    kind: "cep",
                    requiredMessage: "Informe o CEP.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.numero_residencia",
                    label: "Número",
                    value: carteiraForm.numero_residencia,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, numero_residencia: e.target.value }),
                    placeholder: "Ex: 120",
                    requiredMessage: "Informe o número.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.street",
                    label: "Rua",
                    value: carteiraForm.street,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, street: e.target.value }),
                    placeholder: addressLoading ? "Buscando CEP..." : "Rua",
                    requiredMessage: "Informe a rua.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.neighborhood",
                    label: "Bairro",
                    value: carteiraForm.neighborhood,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, neighborhood: e.target.value }),
                    placeholder: "Bairro",
                    requiredMessage: "Informe o bairro.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.city",
                    label: "Cidade",
                    value: carteiraForm.city,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, city: e.target.value }),
                    placeholder: "Cidade",
                    requiredMessage: "Informe a cidade.",
                  })}
                  {renderTextField({
                    fieldKey: "carteira.state",
                    label: "Estado",
                    value: carteiraForm.state,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, state: e.target.value.toUpperCase() }),
                    maxLength: 2,
                    placeholder: "UF",
                    kind: "state",
                    requiredMessage: "Informe o estado.",
                  })}
                  {renderSelectField({
                    fieldKey: "carteira.vencimento_planos",
                    label: "Vencimento dos planos",
                    value: carteiraForm.vencimento_planos,
                    placeholder: "Selecione o vencimento",
                    requiredMessage: "Selecione o vencimento dos planos.",
                    children: ({ triggerClassName, placeholder }) => (
                      <Select
                        value={carteiraForm.vencimento_planos}
                        onValueChange={(value) => {
                          setCarteiraForm({ ...carteiraForm, vencimento_planos: value });
                          touchField("carteira.vencimento_planos");
                        }}
                      >
                        <SelectTrigger className={triggerClassName}>
                          <SelectValue placeholder={placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="05">Aos dias 05</SelectItem>
                          <SelectItem value="20">Aos dias 20</SelectItem>
                        </SelectContent>
                      </Select>
                    ),
                  })}
                  <div></div>
                  <div className="sm:col-span-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-orange-900">Contato para envio de orçamentos</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {renderTextField({
                        fieldKey: "carteira.contato_orcamentos_nome",
                        label: "Nome",
                        value: carteiraForm.contato_orcamentos_nome,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_orcamentos_nome: sanitizeDisplayNameInput(e.target.value) }),
                    onBlur: () => setCarteiraForm({ ...carteiraForm, contato_orcamentos_nome: formatDisplayName(carteiraForm.contato_orcamentos_nome) }),
                        placeholder: "Nome do contato",
                        requiredMessage: "Informe o nome do contato.",
                      })}
                      {renderTextField({
                        fieldKey: "carteira.contato_orcamentos_celular",
                        label: "Celular",
                        value: carteiraForm.contato_orcamentos_celular,
                        onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_orcamentos_celular: formatPhone(e.target.value) }),
                        maxLength: 15,
                        placeholder: "(00) 00000-0000",
                        kind: "phone",
                        requiredMessage: "Informe o celular do contato.",
                      })}
                      {renderTextField({
                        fieldKey: "carteira.contato_orcamentos_email",
                        label: "Email",
                        value: carteiraForm.contato_orcamentos_email,
                        onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_orcamentos_email: e.target.value }),
                        type: "email",
                        placeholder: "email@exemplo.com",
                        kind: "email",
                        requiredMessage: "Informe o email do contato.",
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-orange-900">Contato para o dia a dia</h4>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      {renderTextField({
                        fieldKey: "carteira.contato_alinhamentos_nome",
                        label: "Nome",
                        value: carteiraForm.contato_alinhamentos_nome,
                    onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_alinhamentos_nome: sanitizeDisplayNameInput(e.target.value) }),
                    onBlur: () => setCarteiraForm({ ...carteiraForm, contato_alinhamentos_nome: formatDisplayName(carteiraForm.contato_alinhamentos_nome) }),
                        placeholder: "Nome do contato",
                        requiredMessage: "Informe o nome do contato.",
                      })}
                      {renderTextField({
                        fieldKey: "carteira.contato_alinhamentos_celular",
                        label: "Celular",
                        value: carteiraForm.contato_alinhamentos_celular,
                        onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_alinhamentos_celular: formatPhone(e.target.value) }),
                        maxLength: 15,
                        placeholder: "(00) 00000-0000",
                        kind: "phone",
                        requiredMessage: "Informe o celular do contato.",
                      })}
                      {renderTextField({
                        fieldKey: "carteira.contato_alinhamentos_email",
                        label: "Email",
                        value: carteiraForm.contato_alinhamentos_email,
                        onChange: (e) => setCarteiraForm({ ...carteiraForm, contato_alinhamentos_email: e.target.value }),
                        type: "email",
                        placeholder: "email@exemplo.com",
                        kind: "email",
                        requiredMessage: "Informe o email do contato.",
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Vincular Cães (até 8)</Label>
                    <div className="mt-2">
                      <SearchFiltersToolbar
                        searchTerm={searchDogCart}
                        onSearchChange={setSearchDogCart}
                        searchPlaceholder="Buscar cão por nome..."
                        hasActiveFilters={Boolean(searchDogCart)}
                        onClear={() => setSearchDogCart("")}
                      />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                      {dogs.filter(d => !searchDogCart || d.nome?.toLowerCase().includes(searchDogCart.toLowerCase())).map(d => {
                        const selectedSlot = [1,2,3,4,5,6,7,8].find(n => carteiraForm[`dog_id_${n}`] === d.id);
                        const isSelected = !!selectedSlot;
                        const canSelect = !isSelected && [1,2,3,4,5,6,7,8].some(n => !carteiraForm[`dog_id_${n}`]);
                        return (
                          <div key={d.id} className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-green-50' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setCarteiraForm({ ...carteiraForm, [`dog_id_${selectedSlot}`]: "" });
                              } else if (canSelect) {
                                const emptySlot = [1,2,3,4,5,6,7,8].find(n => !carteiraForm[`dog_id_${n}`]);
                                if (emptySlot) setCarteiraForm({ ...carteiraForm, [`dog_id_${emptySlot}`]: d.id });
                              }
                            }}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? <img src={d.foto_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">ðŸ•</div>}
                              <span className="text-sm font-medium">{d.nome}</span>
                              {d.raca && <span className="text-xs text-gray-500">({d.raca})</span>}
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-green-600" />}
                          </div>
                        );
                      })}
                      {dogs.length === 0 && <p className="text-sm text-gray-500 text-center py-2">Nenhum cão cadastrado</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[1,2,3,4,5,6,7,8].map(n => {
                        const dogId = carteiraForm[`dog_id_${n}`];
                        const dog = dogs.find(d => d.id === dogId);
                        if (!dogId) return null;
                        return <Badge key={n} className="bg-green-100 text-green-700 flex items-center gap-1">{dog?.nome || dogId}<X className="w-3 h-3 cursor-pointer" onClick={() => setCarteiraForm({ ...carteiraForm, [`dog_id_${n}`]: "" })} /></Badge>;
                      })}
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveCarteira} disabled={isSaving} className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Carteira"}</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showClientLinkFeedback} onOpenChange={setShowClientLinkFeedback}>
        <DialogContent className="w-[92vw] max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Link universal gerado com sucesso</DialogTitle>
            <DialogDescription>
              Compartilhe este link com o cliente para que ele preencha a ficha de cadastro completa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              O link abre um fluxo em etapas com responsável, cães e responsável financeiro, sem exigir nome ou email prévios para gerar.
            </div>
            <div>
              <Label>Link do cadastro</Label>
              <div className="mt-2 flex gap-2">
                <Input value={clientLinkValue} readOnly />
                <Button type="button" variant="outline" onClick={copyClientLink}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button type="button" variant="outline" onClick={() => window.open(clientLinkValue, "_blank", "noopener,noreferrer")}>
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
              {hasCopiedClientLink ? (
                <p className="mt-2 text-xs font-medium text-emerald-600">Link copiado.</p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientLinkFeedback(false)}>Fechar</Button>
            <Button onClick={copyClientLink} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Copy className="w-4 h-4 mr-2" />
              Copiar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{notifyTitle}</DialogTitle>
            <DialogDescription className="sr-only">Mensagem de retorno do cadastro.</DialogDescription>
          </DialogHeader>
          <p className="py-2 text-sm text-gray-700">{notifyMessage}</p>
          <DialogFooter>
            <Button onClick={() => setNotifyOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white">OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}







