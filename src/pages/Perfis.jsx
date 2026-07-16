import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Carteira, ContaReceber, Dog, Responsavel, User } from "@/api/entities";
import { clientRegistration } from "@/api/functions";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { validateCpfWithGov } from "@/lib/cpf-validation";
import { findEntityByReference, getInternalEntityReference } from "@/lib/entity-identifiers";
import { formatDisplayName, sanitizeDisplayNameInput } from "@/lib/name-format";
import { canViewSensitivePersonalData } from "@/lib/access-control";
import { maskCpfCnpj, maskEmail, maskPhone, maskSensitiveValue } from "@/lib/privacy";
import { ensureWalletAccountForFinancialProfile } from "@/lib/wallet-account";
import PageSubTabs from "@/components/common/PageSubTabs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Check,
  ChevronRight,
  Copy,
  Dog as DogIcon,
  Download,
  FileText,
  Link2,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import FinancialOperationalAlert from "@/components/finance/FinancialOperationalAlert";
import { buildFinancialOperationalStatusMap, getFinancialOperationalStatus } from "@/lib/finance-operational-status";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const EMPTY_RESPONSAVEL_FORM = {
  nome_completo: "",
  como_gostaria_de_ser_chamado: "",
  cpf: "",
  celular: "",
  celular_alternativo: "",
  email: "",
  dog_id_1: "",
  dog_id_2: "",
  dog_id_3: "",
  dog_id_4: "",
  dog_id_5: "",
  dog_id_6: "",
  dog_id_7: "",
  dog_id_8: "",
};

const EMPTY_CARTEIRA_FORM = {
  nome_razao_social: "",
  cpf_cnpj: "",
  celular: "",
  email: "",
  cep: "",
  numero_residencia: "",
  vencimento_planos: "",
  dog_id_1: "",
  dog_id_2: "",
  dog_id_3: "",
  dog_id_4: "",
  dog_id_5: "",
  dog_id_6: "",
  dog_id_7: "",
  dog_id_8: "",
};

const EMPTY_LINK_DIALOG_STATE = {
  open: false,
  responsavelId: "",
  mode: "dog_only",
  carteiraId: "",
  search: "",
  generatedLink: "",
  feedback: null,
};

const DOG_EXPORTABLE_FIELDS = [
  "codigo",
  "nome",
  "apelido",
  "nascimento",
  "sexo",
  "raca",
  "porte",
  "peso",
  "pelagem",
  "cores_pelagem",
  "castrado",
  "foto_url",
  "foto_carteirinha_vacina_url",
  "data_revacinacao_1",
  "nome_vacina_revacinacao_1",
  "data_revacinacao_2",
  "nome_vacina_revacinacao_2",
  "data_revacinacao_3",
  "nome_vacina_revacinacao_3",
  "alergias",
  "restricoes_cuidados",
  "observacoes_gerais",
  "veterinario_responsavel",
  "veterinario_horario_atendimento",
  "veterinario_telefone",
  "veterinario_clinica_telefone",
  "veterinario_endereco",
  "alimentacao_marca_racao",
  "alimentacao_sabor",
  "alimentacao_tipo",
  "refeicao_1_qnt",
  "refeicao_1_horario",
  "refeicao_1_obs",
  "refeicao_2_qnt",
  "refeicao_2_horario",
  "refeicao_2_obs",
  "refeicao_3_qnt",
  "refeicao_3_horario",
  "refeicao_3_obs",
  "refeicao_4_qnt",
  "refeicao_4_horario",
  "refeicao_4_obs",
  "medicamentos_continuos",
  "autorizacao_uso_imagem",
  "ativo",
];

const RESPONSAVEL_EXPORTABLE_FIELDS = [
  "codigo",
  "nome_completo",
  "como_gostaria_de_ser_chamado",
  "cpf",
  "celular",
  "celular_alternativo",
  "email",
];

function getLinkedDogIds(record) {
  return RELATION_SLOTS.map((slot) => record?.[`dog_id_${slot}`]).filter(Boolean);
}

function buildDogRelationPayload(linkedDogIds) {
  const payload = {};

  RELATION_SLOTS.forEach((slot, index) => {
    payload[`dog_id_${slot}`] = linkedDogIds[index] || null;
  });

  return payload;
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesSearch(values, term) {
  const normalizedTerm = normalizeSearchValue(term);
  if (!normalizedTerm) return true;

  return values.some((value) => normalizeSearchValue(value).includes(normalizedTerm));
}

function buildDogMap(dogs) {
  return Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
}

function getDogDisplayNames(dogIds, dogMap) {
  return dogIds
    .map((dogId) => dogMap[dogId])
    .filter(Boolean)
    .map((dog) => dog.nome);
}

function optional(value) {
  return value === "" ? null : value;
}

function getProfileInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "RP";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function pickFields(source, fields) {
  return fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      acc[field] = source[field];
    }
    return acc;
  }, {});
}

function normalizeImportAction(value) {
  const normalized = normalizeSearchValue(value);
  if (normalized === "delete" || normalized === "remove" || normalized === "remover" || normalized === "excluir") {
    return "delete";
  }
  return "upsert";
}

function buildProfileExportBundle({ dogs, responsaveis }) {
  return {
    tipo: "dogcity-perfis",
    versao: 1,
    exportado_em: new Date().toISOString(),
    instrucoes: {
      formato: "Use acao=upsert para incluir/atualizar e acao=delete para remover.",
      identificacao_caes: "O app usa id ou referencia_interna para localizar o cão.",
      identificacao_responsaveis: "O app usa id ou CPF para localizar o responsável.",
      vinculos_responsaveis: "Use dog_refs com as referências internas dos cães exportados.",
    },
    caes: (dogs || []).map((dog) => ({
      acao: "upsert",
      id: dog.id,
      referencia_interna: getInternalEntityReference(dog),
      ...pickFields(dog, DOG_EXPORTABLE_FIELDS),
    })),
    responsaveis: (responsaveis || []).map((responsavel) => ({
      acao: "upsert",
      id: responsavel.id,
      ...pickFields(responsavel, RESPONSAVEL_EXPORTABLE_FIELDS),
      dog_refs: getLinkedDogIds(responsavel).map((dogId) => getInternalEntityReference(dogs.find((dog) => dog.id === dogId) || { id: dogId })),
    })),
  };
}

function normalizeImportedDogs(payload) {
  const source = Array.isArray(payload?.caes)
    ? payload.caes
    : Array.isArray(payload?.dogs)
      ? payload.dogs
      : [];

  return source.map((item) => ({
    acao: normalizeImportAction(item?.acao || item?.action),
    id: String(item?.id || "").trim(),
    referencia_interna: String(item?.referencia_interna || item?.codigo || "").trim(),
    data: pickFields(item, DOG_EXPORTABLE_FIELDS),
  }));
}

function normalizeImportedResponsaveis(payload) {
  const source = Array.isArray(payload?.responsaveis)
    ? payload.responsaveis
    : Array.isArray(payload?.responsibles)
      ? payload.responsibles
      : [];

  return source.map((item) => ({
    acao: normalizeImportAction(item?.acao || item?.action),
    id: String(item?.id || "").trim(),
    cpf: String(item?.cpf || "").trim(),
    dogRefs: Array.isArray(item?.dog_refs) ? item.dog_refs.map((value) => String(value || "").trim()).filter(Boolean) : [],
    data: pickFields(item, RESPONSAVEL_EXPORTABLE_FIELDS),
  }));
}

function buildSingleDogExport(dog) {
  return {
    tipo: "dogcity-perfil",
    entidade: "cao",
    versao: 1,
    exportado_em: new Date().toISOString(),
    acao: "upsert",
    id: dog.id,
    referencia_interna: getInternalEntityReference(dog),
    ...pickFields(dog, DOG_EXPORTABLE_FIELDS),
  };
}

function buildSingleResponsavelExport(responsavel, dogs) {
  return {
    tipo: "dogcity-perfil",
    entidade: "responsavel",
    versao: 1,
    exportado_em: new Date().toISOString(),
    acao: "upsert",
    id: responsavel.id,
    ...pickFields(responsavel, RESPONSAVEL_EXPORTABLE_FIELDS),
    dog_refs: getLinkedDogIds(responsavel).map((dogId) =>
      getInternalEntityReference(dogs.find((dog) => dog.id === dogId) || { id: dogId }),
    ),
  };
}

function formatCpfCnpj(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
      .slice(0, 14);
  }

  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/g, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 14);
  }

  return digits
    .replace(/^(\d{2})(\d)/g, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .slice(0, 15);
}

function formatCep(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .slice(0, 9);
}

function ProfileCountCard({ title, value, icon: Icon, colorClass, borderClass }) {
  return (
    <Card className={`bg-white ${borderClass}`}>
      <CardContent className="flex items-center justify-between p-2.5 sm:p-4">
        <div>
          <p className="text-[11px] text-gray-600 sm:text-sm">{title}</p>
          <p className={`text-lg font-bold sm:text-2xl ${colorClass}`}>{value}</p>
        </div>
        <Icon className={`h-7 w-7 sm:h-10 sm:w-10 ${colorClass} opacity-60`} />
      </CardContent>
    </Card>
  );
}

ProfileCountCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  icon: PropTypes.elementType.isRequired,
  colorClass: PropTypes.string.isRequired,
  borderClass: PropTypes.string.isRequired,
};

function EmptyState({ title, description }) {
  return (
    <Card className="border-dashed border-gray-200 bg-white">
      <CardContent className="py-12 text-center">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  );
}

function ProfileLineHeader({ columns, children }) {
  return (
    <div className="hidden border-b border-gray-200 bg-gray-50 px-4 py-3 md:grid md:items-center md:gap-4" style={{ gridTemplateColumns: columns }}>
      {children}
    </div>
  );
}

function ProfileColumnTitle({ children }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{children}</p>;
}

function ProfileDetailField({ label, value, className = "" }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-gray-50 p-4 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">{label}</p>
      <p className="mt-2 text-sm font-medium text-gray-900">{value || "-"}</p>
    </div>
  );
}

function formatProfileDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

ProfileLineHeader.propTypes = {
  columns: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

ProfileColumnTitle.propTypes = {
  children: PropTypes.node.isRequired,
};

ProfileDetailField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  className: PropTypes.string,
};

EmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
};

function FeedbackBanner({ feedback }) {
  if (!feedback) return null;

  const toneClasses = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-red-200 bg-red-50 text-red-900",
    info: "border-blue-200 bg-blue-50 text-blue-900",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[feedback.tone] || toneClasses.info}`}>
      <p className="text-sm font-semibold">{feedback.title}</p>
      <p className="mt-1 text-sm opacity-90">{feedback.message}</p>
    </div>
  );
}

FeedbackBanner.propTypes = {
  feedback: PropTypes.shape({
    tone: PropTypes.oneOf(["success", "error", "info"]).isRequired,
    title: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
  }),
};

function LinkedDogsSelector({
  dogs,
  dogMap,
  selectedDogIds,
  searchTerm,
  onSearchChange,
  onToggleDog,
  accent = "violet",
}) {
  const palette = {
    violet: {
      iconShell: "bg-violet-100 text-violet-700",
      selectedRow: "border-violet-200 bg-violet-50",
      selectedBadge: "border-violet-200 bg-violet-50 text-violet-700",
      countBadge: "bg-violet-100 text-violet-700",
      checkIcon: "text-violet-600",
    },
    orange: {
      iconShell: "bg-orange-100 text-orange-700",
      selectedRow: "border-orange-200 bg-orange-50",
      selectedBadge: "border-orange-200 bg-orange-50 text-orange-700",
      countBadge: "bg-orange-100 text-orange-700",
      checkIcon: "text-orange-600",
    },
  }[accent];

  const filteredDogs = useMemo(
    () =>
      dogs.filter((dog) =>
        matchesSearch([dog.nome, dog.apelido, dog.raca, dog.porte], searchTerm)
      ),
    [dogs, searchTerm]
  );

  const hasReachedLimit = selectedDogIds.length >= RELATION_SLOTS.length;

  return (
    <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/80 p-3 sm:space-y-3 sm:rounded-2xl sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label className="text-[13px] font-semibold text-gray-900 sm:text-sm">Cães vinculados</Label>
          <p className="mt-1 text-[11px] text-gray-500 sm:text-xs">
            Selecione até 8 cães para manter esse perfil associado corretamente.
          </p>
        </div>
        <Badge className={`${palette.countBadge} text-[10px] sm:text-xs`}>
          {selectedDogIds.length}/{RELATION_SLOTS.length} vínculos
        </Badge>
      </div>

      <SearchFiltersToolbar
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Buscar cão por nome, apelido ou raça..."
        hasActiveFilters={Boolean(searchTerm)}
        onClear={() => onSearchChange("")}
        searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
      />

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 sm:rounded-2xl">
        {filteredDogs.length > 0 ? (
          filteredDogs.map((dog) => {
            const isSelected = selectedDogIds.includes(dog.id);
            const isDisabled = !isSelected && hasReachedLimit;

            return (
              <button
                key={dog.id}
                type="button"
                onClick={() => onToggleDog(dog.id)}
                disabled={isDisabled}
                className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition sm:rounded-2xl sm:p-3 ${
                  isSelected
                    ? palette.selectedRow
                    : "border-transparent bg-gray-50 hover:border-gray-200 hover:bg-gray-100"
                } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold sm:h-10 sm:w-10 sm:rounded-2xl sm:text-sm ${palette.iconShell}`}
                  >
                    {String(dog.nome || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{dog.nome || "Sem nome"}</p>
                    <p className="truncate text-xs text-gray-500">
                      {[dog.apelido ? `Apelido: ${dog.apelido}` : null, dog.raca, dog.porte]
                        .filter(Boolean)
                        .join(" • ") || "Sem detalhes adicionais"}
                    </p>
                  </div>
                </div>

                {isSelected ? (
                  <Check className={`h-5 w-5 ${palette.checkIcon}`} />
                ) : (
                  <span className="text-xs font-medium text-gray-400">
                    {isDisabled ? "Limite atingido" : "Selecionar"}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          <p className="p-4 text-center text-sm text-gray-500">
            Nenhum cão encontrado com esse filtro.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {selectedDogIds.length > 0 ? (
          selectedDogIds.map((dogId) => (
            <Badge key={dogId} className={`border ${palette.selectedBadge}`}>
              {dogMap[dogId]?.nome || dogId}
            </Badge>
          ))
        ) : (
          <Badge className="bg-gray-100 text-gray-600">Sem cães vinculados</Badge>
        )}
      </div>
    </div>
  );
}

LinkedDogsSelector.propTypes = {
  dogs: PropTypes.arrayOf(PropTypes.object).isRequired,
  dogMap: PropTypes.objectOf(
    PropTypes.shape({
      nome: PropTypes.string,
    })
  ).isRequired,
  selectedDogIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  searchTerm: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  onToggleDog: PropTypes.func.isRequired,
  accent: PropTypes.oneOf(["violet", "orange"]),
};

export default function Perfis() {
  const location = useLocation();
  const importInputRef = useRef(null);
  const [importProfileTarget, setImportProfileTarget] = useState(null);
  const [dogs, setDogs] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [deletedResponsaveis, setDeletedResponsaveis] = useState([]);
  const [deletedCarteiras, setDeletedCarteiras] = useState([]);
  const [contasReceber, setContasReceber] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("caes");
  const [searchTerm, setSearchTerm] = useState("");
  const [pageFeedback, setPageFeedback] = useState(null);
  const [editorFeedback, setEditorFeedback] = useState(null);
  const [editingResponsavelId, setEditingResponsavelId] = useState("");
  const [editingCarteiraId, setEditingCarteiraId] = useState("");
  const [viewingResponsavelId, setViewingResponsavelId] = useState("");
  const [viewingCarteiraId, setViewingCarteiraId] = useState("");
  const [responsavelForm, setResponsavelForm] = useState(EMPTY_RESPONSAVEL_FORM);
  const [carteiraForm, setCarteiraForm] = useState(EMPTY_CARTEIRA_FORM);
  const [searchDogResp, setSearchDogResp] = useState("");
  const [searchDogCart, setSearchDogCart] = useState("");
  const [linkDialog, setLinkDialog] = useState(EMPTY_LINK_DIALOG_STATE);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [deletedProfilesOpen, setDeletedProfilesOpen] = useState(false);
  const [deleteProfileTarget, setDeleteProfileTarget] = useState(null);
  const [isManagingProfile, setIsManagingProfile] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async ({ showLoader = true } = {}) => {
    if (showLoader) setIsLoading(true);

    try {
      const [dogsData, responsaveisData, carteirasData, deletedResponsaveisData, deletedCarteirasData, contasData, me] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 1000),
        Carteira.list("-created_date", 1000),
        Responsavel.listDeleted("-deleted_at", 1000),
        Carteira.listDeleted("-deleted_at", 1000),
        ContaReceber.listAll ? ContaReceber.listAll("-created_date", 1000, 10000) : ContaReceber.list("-created_date", 5000),
        User.me().catch(() => null),
      ]);

      setDogs(dogsData || []);
      setResponsaveis(responsaveisData || []);
      setCarteiras(carteirasData || []);
      setDeletedResponsaveis(deletedResponsaveisData || []);
      setDeletedCarteiras(deletedCarteirasData || []);
      setContasReceber(contasData || []);
      setCurrentUser(me);
      return true;
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);
      setPageFeedback({
        tone: "error",
        title: "Não foi possível carregar os perfis",
        message: error?.message || "Tente novamente em instantes.",
      });
      return false;
    } finally {
      if (showLoader) setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    const profileType = params.get("perfil");
    const profileId = params.get("id");

    if (["caes", "responsaveis", "carteiras"].includes(tab)) {
      setActiveTab(tab);
    }

    if (!profileId) return;

    if (profileType === "responsavel" || tab === "responsaveis") {
      setActiveTab("responsaveis");
      setViewingResponsavelId(profileId);
      return;
    }

    if (profileType === "financeiro" || profileType === "carteira" || tab === "carteiras") {
      setActiveTab("carteiras");
      setViewingCarteiraId(profileId);
    }
  }, [location.search]);

  const dogMap = useMemo(() => buildDogMap(dogs), [dogs]);
  const carteiraFinancialStatusMap = useMemo(
    () => buildFinancialOperationalStatusMap(contasReceber),
    [contasReceber],
  );
  const canRevealSensitiveData = useMemo(
    () => canViewSensitivePersonalData(currentUser),
    [currentUser],
  );

  const dogResponsaveisMap = useMemo(() => {
    const nextMap = {};

    responsaveis.forEach((responsavel) => {
      getLinkedDogIds(responsavel).forEach((dogId) => {
        nextMap[dogId] ||= [];
        nextMap[dogId].push(responsavel);
      });
    });

    return nextMap;
  }, [responsaveis]);

  const dogCarteirasMap = useMemo(() => {
    const nextMap = {};

    carteiras.forEach((carteira) => {
      getLinkedDogIds(carteira).forEach((dogId) => {
        nextMap[dogId] ||= [];
        nextMap[dogId].push(carteira);
      });
    });

    return nextMap;
  }, [carteiras]);

  const dogsView = useMemo(
    () =>
      dogs.map((dog) => ({
        ...dog,
        linkedResponsaveis: dogResponsaveisMap[dog.id] || [],
        linkedCarteiras: dogCarteirasMap[dog.id] || [],
      })),
    [dogs, dogResponsaveisMap, dogCarteirasMap]
  );

  const responsaveisView = useMemo(
    () =>
      responsaveis.map((responsavel) => {
        const linkedDogIds = getLinkedDogIds(responsavel);

        return {
          ...responsavel,
          linkedDogIds,
          linkedDogNames: getDogDisplayNames(linkedDogIds, dogMap),
        };
      }),
    [responsaveis, dogMap]
  );

  const carteirasView = useMemo(
    () =>
      carteiras.map((carteira) => {
        const linkedDogIds = getLinkedDogIds(carteira);

        return {
          ...carteira,
          linkedDogIds,
          linkedDogNames: getDogDisplayNames(linkedDogIds, dogMap),
        };
      }),
    [carteiras, dogMap]
  );

  const filteredDogs = useMemo(
    () =>
      dogsView.filter((dog) =>
        matchesSearch(
          [
            dog.nome,
            dog.apelido,
            dog.raca,
            dog.porte,
            dog.cores_pelagem,
            ...dog.linkedResponsaveis.map((item) => item.nome_completo),
            ...dog.linkedCarteiras.map((item) => item.nome_razao_social),
          ],
          searchTerm
        )
      ),
    [dogsView, searchTerm]
  );

  const filteredResponsaveis = useMemo(
    () =>
      responsaveisView.filter((responsavel) =>
        matchesSearch(
          [
            responsavel.nome_completo,
            responsavel.cpf,
            responsavel.celular,
            responsavel.celular_alternativo,
            responsavel.email,
            ...responsavel.linkedDogNames,
          ],
          searchTerm
        )
      ),
    [responsaveisView, searchTerm]
  );

  const filteredCarteiras = useMemo(
    () =>
      carteirasView.filter((carteira) =>
        matchesSearch(
          [
            carteira.nome_razao_social,
            carteira.cpf_cnpj,
            carteira.celular,
            carteira.email,
            carteira.vencimento_planos,
            ...carteira.linkedDogNames,
          ],
          searchTerm
        )
      ),
    [carteirasView, searchTerm]
  );

  const totalProfiles = dogs.length + responsaveis.length + carteiras.length;
  const deletedProfiles = useMemo(() => [
    ...deletedResponsaveis.map((item) => ({
      ...item,
      profileType: "responsavel",
      profileLabel: "Responsável",
      profileName: item.nome_completo || "Responsável sem nome",
    })),
    ...deletedCarteiras.map((item) => ({
      ...item,
      profileType: "carteira",
      profileLabel: "Responsável Financeiro",
      profileName: item.nome_razao_social || "Responsável financeiro sem nome",
    })),
  ].sort((left, right) => new Date(right.deleted_at || 0) - new Date(left.deleted_at || 0)), [deletedResponsaveis, deletedCarteiras]);
  const selectedResponsavelDogIds = useMemo(
    () => getLinkedDogIds(responsavelForm),
    [responsavelForm]
  );
  const selectedCarteiraDogIds = useMemo(
    () => getLinkedDogIds(carteiraForm),
    [carteiraForm]
  );
  const selectedLinkResponsavel = useMemo(
    () => responsaveisView.find((item) => item.id === linkDialog.responsavelId) || null,
    [responsaveisView, linkDialog.responsavelId]
  );
  const selectedLinkCarteira = useMemo(
    () => carteirasView.find((item) => item.id === linkDialog.carteiraId) || null,
    [carteirasView, linkDialog.carteiraId]
  );
  const viewingResponsavel = useMemo(
    () => responsaveisView.find((item) => item.id === viewingResponsavelId) || null,
    [responsaveisView, viewingResponsavelId]
  );
  const viewingCarteira = useMemo(
    () => carteirasView.find((item) => item.id === viewingCarteiraId) || null,
    [carteirasView, viewingCarteiraId]
  );
  const viewingCarteiraOrcamentosContact = useMemo(() => ({
    nome: viewingCarteira?.contato_orcamentos?.nome || viewingCarteira?.contato_orcamentos_nome || "",
    celular: viewingCarteira?.contato_orcamentos?.celular || viewingCarteira?.contato_orcamentos_celular || "",
    email: viewingCarteira?.contato_orcamentos?.email || viewingCarteira?.contato_orcamentos_email || "",
  }), [viewingCarteira]);
  const viewingCarteiraFinancialStatus = useMemo(
    () => getFinancialOperationalStatus(carteiraFinancialStatusMap, viewingCarteira?.id || null),
    [carteiraFinancialStatusMap, viewingCarteira?.id],
  );
  const availableCarteirasForLink = useMemo(() => {
    const linkedDogIds = new Set(selectedLinkResponsavel?.linkedDogIds || []);
    const normalizedSearch = normalizeSearchValue(linkDialog.search);
    const filtered = carteirasView.filter((carteira) => {
      if (!normalizedSearch) return true;
      return matchesSearch(
        [
          carteira.nome_razao_social,
          carteira.cpf_cnpj,
          carteira.celular,
          carteira.email,
          ...carteira.linkedDogNames,
        ],
        normalizedSearch
      );
    });

    return filtered.sort((left, right) => {
      const leftIsRelated = left.linkedDogIds.some((dogId) => linkedDogIds.has(dogId));
      const rightIsRelated = right.linkedDogIds.some((dogId) => linkedDogIds.has(dogId));
      if (leftIsRelated === rightIsRelated) {
        return String(left.nome_razao_social || "").localeCompare(String(right.nome_razao_social || ""));
      }
      return leftIsRelated ? -1 : 1;
    });
  }, [carteirasView, selectedLinkResponsavel, linkDialog.search]);

  const resetEditorFeedback = () => {
    setEditorFeedback(null);
    setPageFeedback(null);
  };

  const downloadJsonFile = (filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportProfiles = () => {
    const payload = buildProfileExportBundle({ dogs, responsaveis });
    const dateLabel = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`perfis-caes-responsaveis-${dateLabel}.json`, payload);
    setPageFeedback({
      tone: "success",
      title: "Arquivo exportado",
      message: "Os dados de cães e responsáveis foram exportados em JSON para edição e reimportação.",
    });
  };

  const handleExportResponsavelProfile = (responsavel) => {
    if (!responsavel) return;
    const profileName = normalizeSearchValue(responsavel.nome_completo || "responsavel").replace(/\s+/g, "-") || "responsavel";
    downloadJsonFile(`perfil-responsavel-${profileName}.json`, buildSingleResponsavelExport(responsavel, dogs));
    setPageFeedback({
      tone: "success",
      title: "Perfil exportado",
      message: `Os dados de ${responsavel.nome_completo || "este responsável"} foram exportados em JSON.`,
    });
  };

  const removeDogLinksFromEntities = async (dogId, responsaveisBase, carteirasBase) => {
    const relatedResponsaveis = (responsaveisBase || []).filter((item) => getLinkedDogIds(item).includes(dogId));
    const relatedCarteiras = (carteirasBase || []).filter((item) => getLinkedDogIds(item).includes(dogId));

    for (const responsavel of relatedResponsaveis) {
      const linkedIds = getLinkedDogIds(responsavel).filter((linkedDogId) => linkedDogId !== dogId);
      await Responsavel.update(responsavel.id, buildDogRelationPayload(linkedIds));
    }

    for (const carteira of relatedCarteiras) {
      const linkedIds = getLinkedDogIds(carteira).filter((linkedDogId) => linkedDogId !== dogId);
      await Carteira.update(carteira.id, buildDogRelationPayload(linkedIds));
    }
  };

  const openImportPicker = () => {
    importInputRef.current?.click();
  };

  const openProfileImportPicker = (target) => {
    setImportProfileTarget(target || null);
    importInputRef.current?.click();
  };

  const handleImportSingleProfileFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsSaving(true);
    setPageFeedback(null);

    try {
      if (!importProfileTarget?.type || !importProfileTarget?.id) {
        throw new Error("Abra a ficha do perfil antes de importar o arquivo.");
      }

      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      if (importProfileTarget.type !== "responsavel") {
        throw new Error("Use a importação diretamente na ficha do cão para atualizar um perfil canino.");
      }

      const importedResponsavel =
        parsed?.entidade === "responsavel"
          ? {
              acao: normalizeImportAction(parsed?.acao || parsed?.action),
              id: String(parsed?.id || "").trim(),
              cpf: String(parsed?.cpf || "").trim(),
              dogRefs: Array.isArray(parsed?.dog_refs) ? parsed.dog_refs.map((value) => String(value || "").trim()).filter(Boolean) : [],
              data: pickFields(parsed, RESPONSAVEL_EXPORTABLE_FIELDS),
            }
          : normalizeImportedResponsaveis(parsed)[0];

      if (!importedResponsavel) {
        throw new Error("Nenhum responsável válido foi encontrado no arquivo.");
      }

      const existingResponsavel = responsaveis.find((item) => item.id === importProfileTarget.id);
      if (!existingResponsavel?.id) {
        throw new Error("Responsável não encontrado para importar os dados.");
      }

      if (importedResponsavel.acao === "delete") {
        const deletedResponsavel = await Responsavel.delete(existingResponsavel.id);
        setResponsaveis((current) => current.filter((item) => item.id !== existingResponsavel.id));
        setDeletedResponsaveis((current) => [
          deletedResponsavel,
          ...current.filter((item) => item.id !== existingResponsavel.id),
        ]);
        closeResponsavelDetails();
        setPageFeedback({
          tone: "success",
          title: "Perfil removido",
          message: "O responsável foi removido a partir do arquivo importado.",
        });
        return;
      }

      const resolvedDogIds = importedResponsavel.dogRefs
        .map((reference) => findEntityByReference(dogs, reference)?.id || "")
        .filter(Boolean)
        .slice(0, RELATION_SLOTS.length);

      const responsavelPayload = {
        ...importedResponsavel.data,
        empresa_id: existingResponsavel.empresa_id || currentUser?.empresa_id || null,
        nome_completo: formatDisplayName(importedResponsavel.data.nome_completo || existingResponsavel.nome_completo || ""),
        como_gostaria_de_ser_chamado: optional(formatDisplayName(importedResponsavel.data.como_gostaria_de_ser_chamado || "")),
        cpf: optional(String(importedResponsavel.data.cpf || "").trim()),
        celular: optional(String(importedResponsavel.data.celular || "").trim()),
        celular_alternativo: optional(String(importedResponsavel.data.celular_alternativo || "").trim()),
        email: optional(String(importedResponsavel.data.email || "").trim()),
        ...buildDogRelationPayload(resolvedDogIds.length ? resolvedDogIds : getLinkedDogIds(existingResponsavel)),
      };

      const updatedResponsavel = await Responsavel.update(existingResponsavel.id, responsavelPayload);
      setResponsaveis((current) =>
        current.map((item) =>
          item.id === existingResponsavel.id ? { ...item, ...responsavelPayload, ...(updatedResponsavel || {}) } : item,
        ),
      );
      setPageFeedback({
        tone: "success",
        title: "Perfil importado",
        message: `Os dados de ${responsavelPayload.nome_completo || "este responsável"} foram atualizados pelo arquivo.`,
      });
    } catch (error) {
      console.error("Erro ao importar perfil individual:", error);
      setPageFeedback({
        tone: "error",
        title: "Erro ao importar perfil",
        message: error?.message || "Tente novamente em instantes.",
      });
    } finally {
      setImportProfileTarget(null);
      setIsSaving(false);
    }
  };

  const handleImportProfilesFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsSaving(true);
    setPageFeedback(null);

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const importedDogs = normalizeImportedDogs(parsed);
      const importedResponsaveis = normalizeImportedResponsaveis(parsed);

      if (!importedDogs.length && !importedResponsaveis.length) {
        throw new Error("Nenhum cão ou responsável válido foi encontrado no arquivo.");
      }

      let workingDogs = [...dogs];
      let workingResponsaveis = [...responsaveis];
      let workingCarteiras = [...carteiras];
      let dogsCreated = 0;
      let dogsUpdated = 0;
      let dogsDeleted = 0;
      let responsaveisCreated = 0;
      let responsaveisUpdated = 0;
      let responsaveisDeleted = 0;

      for (const importedDog of importedDogs) {
        const existingDog =
          workingDogs.find((item) => item.id === importedDog.id)
          || findEntityByReference(workingDogs, importedDog.referencia_interna);

        if (importedDog.acao === "delete") {
          if (!existingDog?.id) continue;
          await removeDogLinksFromEntities(existingDog.id, workingResponsaveis, workingCarteiras);
          await Dog.delete(existingDog.id);
          workingDogs = workingDogs.filter((item) => item.id !== existingDog.id);
          workingResponsaveis = workingResponsaveis.map((item) => ({
            ...item,
            ...buildDogRelationPayload(getLinkedDogIds(item).filter((dogId) => dogId !== existingDog.id)),
          }));
          workingCarteiras = workingCarteiras.map((item) => ({
            ...item,
            ...buildDogRelationPayload(getLinkedDogIds(item).filter((dogId) => dogId !== existingDog.id)),
          }));
          dogsDeleted += 1;
          continue;
        }

        const dogPayload = {
          ...importedDog.data,
          empresa_id: existingDog?.empresa_id || currentUser?.empresa_id || null,
        };

        if (existingDog?.id) {
          const updatedDog = await Dog.update(existingDog.id, dogPayload);
          workingDogs = workingDogs.map((item) =>
            item.id === existingDog.id ? { ...item, ...dogPayload, ...(updatedDog || {}) } : item,
          );
          dogsUpdated += 1;
        } else {
          const createdDog = await Dog.create(dogPayload);
          if (createdDog) {
            workingDogs = [...workingDogs, createdDog];
          }
          dogsCreated += 1;
        }
      }

      for (const importedResponsavel of importedResponsaveis) {
        const normalizedCpf = String(importedResponsavel.cpf || "").replace(/\D/g, "");
        const existingResponsavel =
          workingResponsaveis.find((item) => item.id === importedResponsavel.id)
          || workingResponsaveis.find((item) => String(item.cpf || "").replace(/\D/g, "") === normalizedCpf);

        if (importedResponsavel.acao === "delete") {
          if (!existingResponsavel?.id) continue;
          await Responsavel.delete(existingResponsavel.id);
          workingResponsaveis = workingResponsaveis.filter((item) => item.id !== existingResponsavel.id);
          responsaveisDeleted += 1;
          continue;
        }

        const resolvedDogIds = importedResponsavel.dogRefs
          .map((reference) => findEntityByReference(workingDogs, reference)?.id || "")
          .filter(Boolean)
          .slice(0, RELATION_SLOTS.length);

        const responsavelPayload = {
          ...importedResponsavel.data,
          empresa_id: existingResponsavel?.empresa_id || currentUser?.empresa_id || null,
          nome_completo: formatDisplayName(importedResponsavel.data.nome_completo || ""),
          como_gostaria_de_ser_chamado: optional(formatDisplayName(importedResponsavel.data.como_gostaria_de_ser_chamado || "")),
          cpf: optional(String(importedResponsavel.data.cpf || "").trim()),
          celular: optional(String(importedResponsavel.data.celular || "").trim()),
          celular_alternativo: optional(String(importedResponsavel.data.celular_alternativo || "").trim()),
          email: optional(String(importedResponsavel.data.email || "").trim()),
          ...buildDogRelationPayload(resolvedDogIds),
        };

        if (existingResponsavel?.id) {
          const updatedResponsavel = await Responsavel.update(existingResponsavel.id, responsavelPayload);
          workingResponsaveis = workingResponsaveis.map((item) =>
            item.id === existingResponsavel.id
              ? { ...item, ...responsavelPayload, ...(updatedResponsavel || {}) }
              : item,
          );
          responsaveisUpdated += 1;
        } else {
          const createdResponsavel = await Responsavel.create(responsavelPayload);
          if (createdResponsavel) {
            workingResponsaveis = [...workingResponsaveis, createdResponsavel];
          }
          responsaveisCreated += 1;
        }
      }

      await loadData({ showLoader: false });
      setPageFeedback({
        tone: "success",
        title: "Importação concluída",
        message: [
          dogsCreated ? `${dogsCreated} cão(ães) criado(s)` : null,
          dogsUpdated ? `${dogsUpdated} cão(ães) atualizado(s)` : null,
          dogsDeleted ? `${dogsDeleted} cão(ães) removido(s)` : null,
          responsaveisCreated ? `${responsaveisCreated} responsável(is) criado(s)` : null,
          responsaveisUpdated ? `${responsaveisUpdated} responsável(is) atualizado(s)` : null,
          responsaveisDeleted ? `${responsaveisDeleted} responsável(is) removido(s)` : null,
        ].filter(Boolean).join(" · "),
      });
    } catch (error) {
      console.error("Erro ao importar perfis:", error);
      setPageFeedback({
        tone: "error",
        title: "Não foi possível importar os perfis",
        message: error?.message || "Revise o arquivo e tente novamente.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const buildClientRegistrationLink = (token) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${createPageUrl("CadastroClientePublico")}?token=${encodeURIComponent(token)}`;
  };

  const closeLinkDialog = () => {
    setLinkDialog(EMPTY_LINK_DIALOG_STATE);
    setIsGeneratingLink(false);
  };

  const openLinkDialog = (responsavelId, mode) => {
    setPageFeedback(null);
    setLinkDialog({
      ...EMPTY_LINK_DIALOG_STATE,
      open: true,
      responsavelId,
      mode,
    });
  };

  const closeResponsavelEditor = () => {
    setEditingResponsavelId("");
    setResponsavelForm(EMPTY_RESPONSAVEL_FORM);
    setSearchDogResp("");
    setEditorFeedback(null);
    setIsSaving(false);
  };

  const openResponsavelDetails = (responsavelId) => {
    setViewingResponsavelId(responsavelId);
  };

  const closeResponsavelDetails = () => {
    setViewingResponsavelId("");
  };

  const closeCarteiraEditor = () => {
    setEditingCarteiraId("");
    setCarteiraForm(EMPTY_CARTEIRA_FORM);
    setSearchDogCart("");
    setEditorFeedback(null);
    setIsSaving(false);
  };

  const openCarteiraDetails = (carteiraId) => {
    setViewingCarteiraId(carteiraId);
  };

  const closeCarteiraDetails = () => {
    setViewingCarteiraId("");
  };

  const requestProfileDeletion = (type, profile) => {
    if (!profile?.id) return;
    setDeleteProfileTarget({
      type,
      id: profile.id,
      name: type === "responsavel"
        ? profile.nome_completo || "Responsável"
        : profile.nome_razao_social || "Responsável Financeiro",
    });
  };

  const handleDeleteProfile = async () => {
    if (!deleteProfileTarget?.id) return;
    setIsManagingProfile(true);

    try {
      const isResponsavel = deleteProfileTarget.type === "responsavel";
      const entity = isResponsavel ? Responsavel : Carteira;
      const deletedProfile = await entity.delete(deleteProfileTarget.id);

      if (isResponsavel) {
        setResponsaveis((current) => current.filter((item) => item.id !== deleteProfileTarget.id));
        setDeletedResponsaveis((current) => [deletedProfile, ...current.filter((item) => item.id !== deletedProfile.id)]);
        closeResponsavelDetails();
      } else {
        setCarteiras((current) => current.filter((item) => item.id !== deleteProfileTarget.id));
        setDeletedCarteiras((current) => [deletedProfile, ...current.filter((item) => item.id !== deletedProfile.id)]);
        closeCarteiraDetails();
      }

      setDeleteProfileTarget(null);
      setPageFeedback({
        tone: "success",
        title: "Perfil excluído",
        message: "O perfil saiu das telas operacionais. A exclusão pode ser desfeita em Perfis excluídos durante 30 dias.",
      });
    } catch (error) {
      console.error("Erro ao excluir perfil:", error);
      setPageFeedback({
        tone: "error",
        title: "Não foi possível excluir o perfil",
        message: error?.message || "Tente novamente em instantes.",
      });
    } finally {
      setIsManagingProfile(false);
    }
  };

  const handleRestoreProfile = async (profile) => {
    if (!profile?.id || !profile?.profileType) return;
    setIsManagingProfile(true);

    try {
      const isResponsavel = profile.profileType === "responsavel";
      const entity = isResponsavel ? Responsavel : Carteira;
      const restoredProfile = await entity.restore(profile.id);

      if (isResponsavel) {
        setDeletedResponsaveis((current) => current.filter((item) => item.id !== profile.id));
        setResponsaveis((current) => [restoredProfile, ...current.filter((item) => item.id !== profile.id)]);
      } else {
        setDeletedCarteiras((current) => current.filter((item) => item.id !== profile.id));
        setCarteiras((current) => [restoredProfile, ...current.filter((item) => item.id !== profile.id)]);
      }

      setPageFeedback({
        tone: "success",
        title: "Perfil restaurado",
        message: `${profile.profileName} voltou a aparecer nas telas operacionais.`,
      });
    } catch (error) {
      console.error("Erro ao restaurar perfil:", error);
      setPageFeedback({
        tone: "error",
        title: "Não foi possível restaurar o perfil",
        message: error?.message || "Tente novamente em instantes.",
      });
    } finally {
      setIsManagingProfile(false);
    }
  };

  const openResponsavelEditor = (responsavelId) => {
    const target = responsaveis.find((item) => item.id === responsavelId);
    if (!target) return;

    resetEditorFeedback();
    setViewingResponsavelId("");
    setActiveTab("responsaveis");
    setEditingCarteiraId("");
    setSearchDogResp("");
    setResponsavelForm({
      ...EMPTY_RESPONSAVEL_FORM,
      ...target,
    });
    setEditingResponsavelId(target.id);
  };

  const openCarteiraEditor = (carteiraId) => {
    const target = carteiras.find((item) => item.id === carteiraId);
    if (!target) return;

    resetEditorFeedback();
    setViewingCarteiraId("");
    setActiveTab("carteiras");
    setEditingResponsavelId("");
    setSearchDogCart("");
    setCarteiraForm({
      ...EMPTY_CARTEIRA_FORM,
      ...target,
      vencimento_planos: target.vencimento_planos || "",
    });
    setEditingCarteiraId(target.id);
  };

  const toggleResponsavelDog = (dogId) => {
    const selectedSlot = RELATION_SLOTS.find((slot) => responsavelForm[`dog_id_${slot}`] === dogId);

    if (selectedSlot) {
      setResponsavelForm((current) => ({
        ...current,
        [`dog_id_${selectedSlot}`]: "",
      }));
      return;
    }

    const emptySlot = RELATION_SLOTS.find((slot) => !responsavelForm[`dog_id_${slot}`]);
    if (!emptySlot) {
      setEditorFeedback({
        tone: "error",
        title: "Limite de vínculos atingido",
        message: "Um responsável pode estar vinculado a no máximo 8 cães.",
      });
      return;
    }

    setResponsavelForm((current) => ({
      ...current,
      [`dog_id_${emptySlot}`]: dogId,
    }));
  };

  const toggleCarteiraDog = (dogId) => {
    const selectedSlot = RELATION_SLOTS.find((slot) => carteiraForm[`dog_id_${slot}`] === dogId);

    if (selectedSlot) {
      setCarteiraForm((current) => ({
        ...current,
        [`dog_id_${selectedSlot}`]: "",
      }));
      return;
    }

    const emptySlot = RELATION_SLOTS.find((slot) => !carteiraForm[`dog_id_${slot}`]);
    if (!emptySlot) {
      setEditorFeedback({
        tone: "error",
        title: "Limite de vínculos atingido",
        message: "Uma carteira pode estar vinculada a no máximo 8 cães.",
      });
      return;
    }

    setCarteiraForm((current) => ({
      ...current,
      [`dog_id_${emptySlot}`]: dogId,
    }));
  };

  const handleSaveResponsavel = async () => {
    if (!editingResponsavelId) return;

    setEditorFeedback(null);
    const formattedName = formatDisplayName(responsavelForm.nome_completo);

    if (!formattedName || !responsavelForm.cpf || !responsavelForm.celular) {
      setEditorFeedback({
        tone: "error",
        title: "Campos obrigatórios",
        message: "Preencha nome completo, CPF e celular para salvar o responsável.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const normalizedCpf = String(responsavelForm.cpf || "").replace(/\D/g, "");
      const duplicatedCpf = responsaveis.some((item) => (
        item.id !== editingResponsavelId
        && String(item.cpf || "").replace(/\D/g, "") === normalizedCpf
      ));
      if (normalizedCpf && duplicatedCpf) {
        setEditorFeedback({
          tone: "error",
          title: "CPF já cadastrado",
          message: "Este CPF já está vinculado a outro Responsável nesta unidade.",
        });
        return;
      }

      const cpfValidation = await validateCpfWithGov({
        cpf: responsavelForm.cpf,
        fullName: formattedName,
      });

      if (cpfValidation.shouldBlock) {
        setEditorFeedback({
          tone: "error",
          title: "CPF não validado",
          message: cpfValidation.message,
        });
        return;
      }

      const payload = {
        nome_completo: formattedName,
        como_gostaria_de_ser_chamado: optional(formatDisplayName(responsavelForm.como_gostaria_de_ser_chamado)),
        cpf: responsavelForm.cpf.trim(),
        celular: responsavelForm.celular.trim(),
        celular_alternativo: optional(responsavelForm.celular_alternativo.trim()),
        email: optional(responsavelForm.email.trim()),
        ...buildDogRelationPayload(selectedResponsavelDogIds),
      };

      const updatedResponsavel = await Responsavel.update(editingResponsavelId, payload);

      setResponsaveis((current) =>
        current.map((item) =>
          item.id === editingResponsavelId
            ? { ...item, ...payload, ...(updatedResponsavel || {}) }
            : item
        )
      );

      closeResponsavelEditor();
      setPageFeedback({
        tone: "success",
        title: "Responsável atualizado",
        message: "Os dados e vínculos do responsável foram salvos com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao atualizar responsável:", error);
      setEditorFeedback({
        tone: "error",
        title: "Erro ao salvar responsável",
        message: error?.message || "Tente novamente em instantes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCarteira = async () => {
    if (!editingCarteiraId) return;

    setEditorFeedback(null);
    const formattedName = formatDisplayName(carteiraForm.nome_razao_social);

    if (!formattedName || !carteiraForm.cpf_cnpj || !carteiraForm.celular) {
      setEditorFeedback({
        tone: "error",
        title: "Campos obrigatórios",
        message: "Preencha nome/razão social, CPF/CNPJ e celular para salvar a carteira.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const cpfOrCnpjDigits = String(carteiraForm.cpf_cnpj || "").replace(/\D/g, "");

      const duplicatedCpf = cpfOrCnpjDigits.length === 11 && carteiras.some((item) => (
        item.id !== editingCarteiraId
        && String(item.cpf_cnpj || "").replace(/\D/g, "") === cpfOrCnpjDigits
      ));
      if (duplicatedCpf) {
        setEditorFeedback({
          tone: "error",
          title: "CPF já cadastrado",
          message: "Este CPF já está vinculado a outro Responsável Financeiro nesta unidade.",
        });
        return;
      }

      if (cpfOrCnpjDigits.length === 11) {
        const cpfValidation = await validateCpfWithGov({
          cpf: carteiraForm.cpf_cnpj,
          fullName: formattedName,
        });

        if (cpfValidation.shouldBlock) {
          setEditorFeedback({
            tone: "error",
            title: "CPF não validado",
            message: cpfValidation.message,
          });
          return;
        }
      }

      const payload = {
        nome_razao_social: formattedName,
        cpf_cnpj: carteiraForm.cpf_cnpj.trim(),
        celular: carteiraForm.celular.trim(),
        email: optional(carteiraForm.email.trim()),
        cep: optional(carteiraForm.cep.trim()),
        numero_residencia: optional(carteiraForm.numero_residencia.trim()),
        vencimento_planos: optional(carteiraForm.vencimento_planos),
        ...buildDogRelationPayload(selectedCarteiraDogIds),
      };

      const updatedCarteira = await Carteira.update(editingCarteiraId, payload);
      try {
        await ensureWalletAccountForFinancialProfile(
          { id: editingCarteiraId, empresa_id: currentUser?.empresa_id || null, ...payload, ...(updatedCarteira || {}) },
          currentUser?.empresa_id || null,
        );
      } catch (walletError) {
        console.warn("Não foi possível garantir a conta operacional da carteira agora:", walletError);
      }

      setCarteiras((current) =>
        current.map((item) =>
          item.id === editingCarteiraId
            ? { ...item, ...payload, ...(updatedCarteira || {}) }
            : item
        )
      );

      closeCarteiraEditor();
      setPageFeedback({
        tone: "success",
        title: "Carteira atualizada",
        message: "Os dados e vínculos da carteira foram salvos com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao atualizar carteira:", error);
      setEditorFeedback({
        tone: "error",
        title: "Erro ao salvar carteira",
        message: error?.message || "Tente novamente em instantes.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateCadastroLink = async () => {
    if (!selectedLinkResponsavel) {
      setLinkDialog((current) => ({
        ...current,
        feedback: {
          tone: "error",
          title: "Responsável não encontrado",
          message: "Selecione novamente o responsável para gerar o link.",
        },
      }));
      return;
    }

    if (linkDialog.mode === "dog_only" && !selectedLinkCarteira) {
      setLinkDialog((current) => ({
        ...current,
        feedback: {
          tone: "error",
          title: "Selecione o responsável financeiro",
          message: "Para cadastrar apenas o cão, escolha o responsável financeiro que ficará vinculado.",
        },
      }));
      return;
    }

    setIsGeneratingLink(true);

    try {
      const result = await clientRegistration({
        action: "create_link",
        empresa_id: selectedLinkResponsavel.empresa_id || selectedLinkCarteira?.empresa_id || null,
        registration_mode: linkDialog.mode,
        responsavel_id: selectedLinkResponsavel.id,
        carteira_id: linkDialog.mode === "dog_only" ? selectedLinkCarteira?.id || null : null,
      });

      const nextLink = buildClientRegistrationLink(result?.link?.token);

      setLinkDialog((current) => ({
        ...current,
        generatedLink: nextLink,
        feedback: {
          tone: "success",
          title: "Link gerado com sucesso",
          message:
            current.mode === "dog_only"
              ? "O link foi preparado para cadastrar apenas o novo cão, usando o responsável e o financeiro já vinculados."
              : "O link foi preparado para cadastrar um novo cão e um novo responsável financeiro com o responsável já vinculado.",
        },
      }));
    } catch (error) {
      console.error("Erro ao gerar link de cadastro pelo perfil:", error);
      setLinkDialog((current) => ({
        ...current,
        feedback: {
          tone: "error",
          title: "Erro ao gerar link",
          message: error?.message || "Tente novamente em instantes.",
        },
      }));
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyGeneratedLink = async () => {
    if (!linkDialog.generatedLink) return;

    try {
      await navigator.clipboard.writeText(linkDialog.generatedLink);
      setLinkDialog((current) => ({
        ...current,
        feedback: {
          tone: "success",
          title: "Link copiado",
          message: "O link de cadastro foi copiado para a área de transferência.",
        },
      }));
    } catch {
      setLinkDialog((current) => ({
        ...current,
        feedback: {
          tone: "error",
          title: "Não foi possível copiar",
          message: "Copie o link manualmente pelo campo exibido.",
        },
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-xl bg-blue-100 p-2.5 text-blue-600 sm:rounded-2xl sm:p-3">
              <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Perfis</h1>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              variant="outline"
              onClick={() => setDeletedProfilesOpen(true)}
              className="h-9 w-full rounded-full border-gray-200 px-3 text-xs text-gray-700 hover:bg-gray-100 sm:h-10 sm:w-auto sm:px-4 sm:text-sm"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Perfis excluídos{deletedProfiles.length ? ` (${deletedProfiles.length})` : ""}
            </Button>
            <Link to={createPageUrl("Cadastro")}>
              <Button variant="outline" className="h-9 w-full rounded-full border-blue-200 px-3 text-xs text-blue-700 hover:bg-blue-50 sm:h-10 sm:w-auto sm:px-4 sm:text-sm">
                <FileText className="mr-2 h-4 w-4" />
                Ir para Cadastro
              </Button>
            </Link>
          </div>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportSingleProfileFile}
        />

        <FeedbackBanner feedback={pageFeedback} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ProfileCountCard
            title="Total de Perfis"
            value={totalProfiles}
            icon={Users}
            colorClass="text-blue-600"
            borderClass="border-blue-200"
          />
          <ProfileCountCard
            title="Cães"
            value={dogs.length}
            icon={DogIcon}
            colorClass="text-emerald-600"
            borderClass="border-emerald-200"
          />
          <ProfileCountCard
            title="Responsáveis"
            value={responsaveis.length}
            icon={ShieldCheck}
            colorClass="text-violet-600"
            borderClass="border-violet-200"
          />
          <ProfileCountCard
            title="Carteiras"
            value={carteiras.length}
            icon={Wallet}
            colorClass="text-orange-600"
            borderClass="border-orange-200"
          />
        </div>

        <Card className="border-gray-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-900">Consultar Perfis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:space-y-4 sm:p-6">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nome, contato, raça, CPF/CNPJ ou vínculos..."
              hasActiveFilters={Boolean(searchTerm)}
              onClear={() => setSearchTerm("")}
              searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <PageSubTabs
                items={[
                  { value: "caes", label: "Cães" },
                  { value: "responsaveis", label: "Responsáveis" },
                  { value: "carteiras", label: "Carteiras" },
                ]}
              />

              <TabsContent value="caes" className="space-y-4">
                {filteredDogs.length === 0 ? (
                  <EmptyState
                    title="Nenhum cão encontrado"
                    description="Ajuste a busca para localizar um perfil canino desta unidade."
                  />
                ) : (
                  <Card className="overflow-hidden border-emerald-100 bg-white">
                    <ProfileLineHeader columns="minmax(0,1.7fr) minmax(0,1.1fr) minmax(0,1.1fr) 120px 120px 24px">
                      <ProfileColumnTitle>Nome</ProfileColumnTitle>
                      <ProfileColumnTitle>Apelido</ProfileColumnTitle>
                      <ProfileColumnTitle>Raça</ProfileColumnTitle>
                      <ProfileColumnTitle>Responsáveis</ProfileColumnTitle>
                      <ProfileColumnTitle>Carteiras</ProfileColumnTitle>
                      <span />
                    </ProfileLineHeader>

                    <div className="divide-y divide-gray-100">
                      {filteredDogs.map((dog) => (
                        <Link
                          key={dog.id}
                          to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(getInternalEntityReference(dog))}`}
                          state={{ backTo: `${location.pathname}${location.search}`, backLabel: "Perfis" }}
                          className="grid gap-3 px-4 py-4 transition-colors hover:bg-emerald-50/60 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_120px_120px_24px] md:items-center md:gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Nome</p>
                            <p className="truncate text-sm font-semibold text-gray-900">{dog.nome || "Sem nome"}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Apelido</p>
                            <p className="truncate text-sm text-gray-600">{dog.apelido || "-"}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Raça</p>
                            <p className="truncate text-sm text-gray-600">{dog.raca || "-"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Responsáveis</p>
                            <p className="text-sm text-gray-600">{dog.linkedResponsaveis.length}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Carteiras</p>
                            <p className="text-sm text-gray-600">{dog.linkedCarteiras.length}</p>
                          </div>
                          <div className="hidden justify-self-end text-gray-400 md:block">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="responsaveis" className="space-y-4">
                {filteredResponsaveis.length === 0 ? (
                  <EmptyState
                    title="Nenhum responsável encontrado"
                    description="Ajuste a busca para localizar um responsável desta unidade."
                  />
                ) : (
                  <Card className="overflow-hidden border-violet-100 bg-white">
                    <ProfileLineHeader columns="minmax(0,1.8fr) minmax(0,1.1fr) 24px">
                      <ProfileColumnTitle>Nome completo</ProfileColumnTitle>
                      <ProfileColumnTitle>Telefone</ProfileColumnTitle>
                      <span />
                    </ProfileLineHeader>

                    <div className="divide-y divide-gray-100">
                      {filteredResponsaveis.map((responsavel) => (
                        <button
                          key={responsavel.id}
                          type="button"
                          onClick={() => openResponsavelDetails(responsavel.id)}
                          className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-violet-50/60 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.1fr)_24px] md:items-center md:gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Nome completo</p>
                            <p className="truncate text-sm font-semibold text-gray-900">{responsavel.nome_completo || "Sem nome"}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Telefone</p>
                            <p className="truncate text-sm text-gray-600">
                              {maskSensitiveValue(
                                responsavel.celular || responsavel.celular_alternativo || "",
                                maskPhone,
                                canRevealSensitiveData,
                              ) || "Telefone não informado"}
                            </p>
                          </div>
                          <div className="hidden justify-self-end text-gray-400 md:block">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="carteiras" className="space-y-4">
                {filteredCarteiras.length === 0 ? (
                  <EmptyState
                    title="Nenhuma carteira encontrada"
                    description="Ajuste a busca para localizar uma carteira desta unidade."
                  />
                ) : (
                  <Card className="overflow-hidden border-orange-100 bg-white">
                    <ProfileLineHeader columns="minmax(0,1.8fr) minmax(0,1.1fr) 24px">
                      <ProfileColumnTitle>Nome completo</ProfileColumnTitle>
                      <ProfileColumnTitle>Telefone</ProfileColumnTitle>
                      <span />
                    </ProfileLineHeader>

                    <div className="divide-y divide-gray-100">
                      {filteredCarteiras.map((carteira) => (
                        <button
                          key={carteira.id}
                          type="button"
                          onClick={() => openCarteiraDetails(carteira.id)}
                          className="grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-orange-50/60 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1.1fr)_24px] md:items-center md:gap-4"
                        >
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Nome completo</p>
                            <p className="truncate text-sm font-semibold text-gray-900">{carteira.nome_razao_social || "Sem nome"}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 md:hidden">Telefone</p>
                            <p className="truncate text-sm text-gray-600">
                              {maskSensitiveValue(carteira.celular || "", maskPhone, canRevealSensitiveData) || "Telefone não informado"}
                            </p>
                          </div>
                          <div className="hidden justify-self-end text-gray-400 md:block">
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(viewingResponsavelId)} onOpenChange={(open) => !open && closeResponsavelDetails()}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
          <DialogHeader className="border-b border-gray-100 px-5 py-5 sm:px-6">
            <DialogTitle>{viewingResponsavel?.nome_completo || "Responsável"}</DialogTitle>
            <DialogDescription>
              Visualize os dados completos e escolha a próxima ação para este responsável.
            </DialogDescription>
          </DialogHeader>

          {viewingResponsavel ? (
            <div className="space-y-5 px-5 py-5 sm:px-6">
              <div className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-violet-50/70 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-white text-lg font-semibold text-violet-700 shadow-sm">
                      {getProfileInitials(viewingResponsavel.nome_completo)}
                    </div>
                    <div className="min-w-0 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Perfil do responsável</p>
                      <div className="space-y-1">
                        <h3 className="truncate text-xl font-semibold text-gray-900">{viewingResponsavel.nome_completo || "Responsável sem nome"}</h3>
                        <p className="text-sm text-gray-600">
                          {viewingResponsavel.como_gostaria_de_ser_chamado
                            ? `Prefere ser chamado de ${viewingResponsavel.como_gostaria_de_ser_chamado}.`
                            : "Sem apelido de tratamento informado."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Telefone</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {maskSensitiveValue(viewingResponsavel.celular || "", maskPhone, canRevealSensitiveData) || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">CPF</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {maskSensitiveValue(viewingResponsavel.cpf || "", maskCpfCnpj, canRevealSensitiveData) || "Não informado"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Cães vinculados</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{viewingResponsavel.linkedDogIds.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-white p-5">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Dados principais</p>
                  <h4 className="mt-1 text-base font-semibold text-gray-900">Informações de contato e identificação</h4>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <ProfileDetailField label="Como gostaria de ser chamado" value={viewingResponsavel.como_gostaria_de_ser_chamado || "Não informado"} />
                  <ProfileDetailField label="Telefone principal" value={maskSensitiveValue(viewingResponsavel.celular || "", maskPhone, canRevealSensitiveData) || "Não informado"} />
                  <ProfileDetailField label="Telefone alternativo" value={maskSensitiveValue(viewingResponsavel.celular_alternativo || "", maskPhone, canRevealSensitiveData) || "Não informado"} />
                  <ProfileDetailField label="CPF" value={maskSensitiveValue(viewingResponsavel.cpf || "", maskCpfCnpj, canRevealSensitiveData) || "Não informado"} />
                  <ProfileDetailField label="Email" value={maskSensitiveValue(viewingResponsavel.email || "", maskEmail, canRevealSensitiveData) || "Não informado"} className="sm:col-span-2 xl:col-span-2" />
                </div>
              </div>

              <div className="rounded-3xl border border-violet-100 bg-violet-50/60 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Cães vinculados</p>
                    <h4 className="mt-1 text-base font-semibold text-gray-900">Relação atual deste responsável</h4>
                  </div>
                  <Badge className="w-fit border border-violet-200 bg-white text-violet-700">
                    {viewingResponsavel.linkedDogIds.length > 0
                      ? `${viewingResponsavel.linkedDogIds.length} vínculo(s)`
                      : "Sem vínculos"}
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {viewingResponsavel.linkedDogIds.length > 0 ? (
                    viewingResponsavel.linkedDogIds.map((dogId) => (
                      <Badge key={dogId} className="border border-violet-200 bg-white text-violet-700">
                        {dogMap[dogId]?.nome || dogId}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="bg-white text-gray-600">Sem cães vinculados</Badge>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-gray-200 bg-gray-50 p-5">
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Ações do perfil</p>
                  <h4 className="mt-1 text-base font-semibold text-gray-900">Próximos passos para este responsável</h4>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <Button
                    variant="outline"
                    className="justify-start border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => handleExportResponsavelProfile(viewingResponsavel)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exportar perfil
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start border-violet-200 text-violet-700 hover:bg-violet-50"
                    onClick={() => openProfileImportPicker({ type: "responsavel", id: viewingResponsavel.id })}
                    disabled={isSaving}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Importar perfil
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start border-violet-200 text-violet-700 hover:bg-violet-50"
                    onClick={() => {
                      closeResponsavelDetails();
                      openLinkDialog(viewingResponsavel.id, "dog_only");
                    }}
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    Link: apenas cão
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start border-violet-200 text-violet-700 hover:bg-violet-50"
                    onClick={() => {
                      closeResponsavelDetails();
                      openLinkDialog(viewingResponsavel.id, "dog_and_financeiro");
                    }}
                  >
                    <Wallet className="mr-2 h-4 w-4" />
                    Link: cão + financeiro
                  </Button>
                  <Button
                    className="justify-start sm:col-span-2 xl:col-span-1"
                    onClick={() => {
                      closeResponsavelDetails();
                      openResponsavelEditor(viewingResponsavel.id);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start border-red-200 text-red-700 hover:bg-red-50 sm:col-span-2 xl:col-span-1"
                    onClick={() => requestProfileDeletion("responsavel", viewingResponsavel)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir perfil
                  </Button>
                </div>
              </div>

              <DialogFooter className="border-t border-gray-100 px-5 py-4 sm:px-6">
                <Button variant="outline" onClick={closeResponsavelDetails} className="w-full sm:w-auto">Fechar</Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewingCarteiraId)} onOpenChange={(open) => !open && closeCarteiraDetails()}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto p-0">
          {viewingCarteira ? (
            <div className="overflow-hidden">
              <DialogHeader className="border-b border-gray-100 px-5 py-5 sm:px-6">
                <DialogTitle>{viewingCarteira.nome_razao_social || "Responsável financeiro"}</DialogTitle>
                <DialogDescription>
                  Visualize os dados completos do responsável financeiro, incluindo o contato principal da carteira e o vínculo usado para envio de orçamentos.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 px-5 py-5 sm:px-6">
                <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-orange-50/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-white text-lg font-semibold text-orange-700 shadow-sm">
                        {getProfileInitials(viewingCarteira.nome_razao_social)}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">Perfil financeiro</p>
                        <div className="space-y-1">
                          <h3 className="truncate text-xl font-semibold text-gray-900">{viewingCarteira.nome_razao_social || "Responsável financeiro sem nome"}</h3>
                          <p className="text-sm text-gray-600">
                            {viewingCarteira.vencimento_planos
                              ? `Carteira com vencimento padrão no dia ${viewingCarteira.vencimento_planos}.`
                              : "Carteira sem vencimento padrão informado."}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[360px]">
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Orçamentos</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {viewingCarteiraOrcamentosContact.nome || "Não informado"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Telefone financeiro</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">
                          {maskSensitiveValue(viewingCarteira.celular || "", maskPhone, canRevealSensitiveData) || "Não informado"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Cães vinculados</p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{viewingCarteira.linkedDogIds.length}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <FinancialOperationalAlert
                  status={viewingCarteiraFinancialStatus}
                  title="Situação financeira atual"
                />

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-3xl border border-gray-200 bg-white p-5">
                    <div className="mb-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Contato para envio de orçamentos</p>
                      <h4 className="mt-1 text-base font-semibold text-gray-900">Vínculo usado para propostas, aprovações e retorno comercial</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ProfileDetailField label="Nome" value={viewingCarteiraOrcamentosContact.nome || "Não informado"} />
                      <ProfileDetailField label="Celular" value={maskSensitiveValue(viewingCarteiraOrcamentosContact.celular || "", maskPhone, canRevealSensitiveData) || "Não informado"} />
                      <ProfileDetailField label="Email" value={maskSensitiveValue(viewingCarteiraOrcamentosContact.email || "", maskEmail, canRevealSensitiveData) || "Não informado"} className="sm:col-span-2" />
                    </div>
                  </div>

                  <div className="rounded-3xl border border-violet-100 bg-violet-50/60 p-5">
                    <div className="mb-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Dados financeiros da carteira</p>
                      <h4 className="mt-1 text-base font-semibold text-gray-900">Identificação e contato principal do responsável financeiro</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ProfileDetailField label="Telefone" value={maskSensitiveValue(viewingCarteira.celular || "", maskPhone, canRevealSensitiveData) || "Não informado"} />
                      <ProfileDetailField label="Email" value={maskSensitiveValue(viewingCarteira.email || "", maskEmail, canRevealSensitiveData) || "Não informado"} />
                      <ProfileDetailField label="CPF/CNPJ" value={maskSensitiveValue(viewingCarteira.cpf_cnpj || "", maskCpfCnpj, canRevealSensitiveData) || "Não informado"} />
                      <ProfileDetailField label="Vencimento" value={viewingCarteira.vencimento_planos ? `Dia ${viewingCarteira.vencimento_planos}` : "Não informado"} />
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-orange-100 bg-orange-50/60 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-500">Cães vinculados</p>
                      <h4 className="mt-1 text-base font-semibold text-gray-900">Base operacional desta carteira</h4>
                    </div>
                    <Badge className="w-fit border border-orange-200 bg-white text-orange-700">
                      {viewingCarteira.linkedDogIds.length > 0
                        ? `${viewingCarteira.linkedDogIds.length} vínculo(s)`
                        : "Sem vínculos"}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {viewingCarteira.linkedDogIds.length > 0 ? (
                      viewingCarteira.linkedDogIds.map((dogId) => (
                        <Badge key={dogId} className="border border-orange-200 bg-white text-orange-700">
                          {dogMap[dogId]?.nome || dogId}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="bg-white text-gray-600">Sem cães vinculados</Badge>
                    )}
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t border-gray-100 px-5 py-4 sm:px-6">
                <Button variant="outline" onClick={closeCarteiraDetails} className="w-full sm:w-auto">Fechar</Button>
                <Button
                  variant="outline"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
                  onClick={() => requestProfileDeletion("carteira", viewingCarteira)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir perfil
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => {
                    closeCarteiraDetails();
                    openCarteiraEditor(viewingCarteira.id);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deletedProfilesOpen} onOpenChange={setDeletedProfilesOpen}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Perfis excluídos</DialogTitle>
            <DialogDescription>
              Perfis removidos deixam de aparecer na operação imediatamente e podem ser restaurados durante 30 dias.
            </DialogDescription>
          </DialogHeader>

          {deletedProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-10 text-center">
              <p className="text-sm font-semibold text-gray-900">Nenhum perfil no período de recuperação</p>
              <p className="mt-1 text-sm text-gray-500">Quando um perfil for excluído, ele ficará disponível aqui por até 30 dias.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
              {deletedProfiles.map((profile) => (
                <div key={`${profile.profileType}-${profile.id}`} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{profile.profileName}</p>
                      <Badge variant="outline" className="text-[10px]">{profile.profileLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">Excluído em {formatProfileDate(profile.deleted_at)}</p>
                    <p className="mt-0.5 text-xs font-medium text-amber-700">Desfazer até {formatProfileDate(profile.deletion_expires_at)}</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleRestoreProfile(profile)}
                    disabled={isManagingProfile}
                    className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:w-auto"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Desfazer exclusão
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletedProfilesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteProfileTarget)} onOpenChange={(open) => !open && !isManagingProfile && setDeleteProfileTarget(null)}>
        <DialogContent className="w-[94vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>Excluir este perfil?</DialogTitle>
            <DialogDescription>
              {deleteProfileTarget?.name} deixará de aparecer em cadastros, vínculos e telas operacionais. O histórico relacionado será preservado e a exclusão poderá ser desfeita durante 30 dias.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteProfileTarget(null)} disabled={isManagingProfile}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteProfile} disabled={isManagingProfile}>
              <Trash2 className="mr-2 h-4 w-4" />
              {isManagingProfile ? "Excluindo..." : "Excluir perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingResponsavelId)} onOpenChange={(open) => !open && closeResponsavelEditor()}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar responsável</DialogTitle>
            <DialogDescription>
              Atualize os dados principais e os cães vinculados a este responsável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <FeedbackBanner feedback={editorFeedback} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nome completo *</Label>
                <Input
                  value={responsavelForm.nome_completo}
                  onBlur={() =>
                    setResponsavelForm((current) => ({
                      ...current,
                      nome_completo: formatDisplayName(current.nome_completo),
                    }))
                  }
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      nome_completo: sanitizeDisplayNameInput(event.target.value),
                    }))
                  }
                  placeholder="Nome completo do responsável"
                />
              </div>

              <div className="sm:col-span-2">
                <Label>Como você gostaria de ser chamado?</Label>
                <Input
                  value={responsavelForm.como_gostaria_de_ser_chamado}
                  onBlur={() =>
                    setResponsavelForm((current) => ({
                      ...current,
                      como_gostaria_de_ser_chamado: formatDisplayName(current.como_gostaria_de_ser_chamado),
                    }))
                  }
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      como_gostaria_de_ser_chamado: sanitizeDisplayNameInput(event.target.value),
                    }))
                  }
                  placeholder="Ex: Ju"
                />
              </div>

              <div>
                <Label>CPF *</Label>
                <Input
                  value={responsavelForm.cpf}
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      cpf: formatCpfCnpj(event.target.value),
                    }))
                  }
                  maxLength={14}
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <Label>Celular *</Label>
                <Input
                  value={responsavelForm.celular}
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      celular: formatPhone(event.target.value),
                    }))
                  }
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <Label>Celular alternativo</Label>
                <Input
                  value={responsavelForm.celular_alternativo}
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      celular_alternativo: formatPhone(event.target.value),
                    }))
                  }
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={responsavelForm.email}
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="email@cliente.com"
                />
              </div>
            </div>

            <LinkedDogsSelector
              dogs={dogs}
              dogMap={dogMap}
              selectedDogIds={selectedResponsavelDogIds}
              searchTerm={searchDogResp}
              onSearchChange={setSearchDogResp}
              onToggleDog={toggleResponsavelDog}
              accent="violet"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeResponsavelEditor} disabled={isSaving} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveResponsavel}
              disabled={isSaving}
              className="w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar responsável"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingCarteiraId)} onOpenChange={(open) => !open && closeCarteiraEditor()}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar carteira</DialogTitle>
            <DialogDescription>
              Atualize dados financeiros, vencimento e vínculos com os cães desta carteira.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <FeedbackBanner feedback={editorFeedback} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nome / Razão social *</Label>
                <Input
                  value={carteiraForm.nome_razao_social}
                  onBlur={() =>
                    setCarteiraForm((current) => ({
                      ...current,
                      nome_razao_social: formatDisplayName(current.nome_razao_social),
                    }))
                  }
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      nome_razao_social: sanitizeDisplayNameInput(event.target.value),
                    }))
                  }
                  placeholder="Nome ou razão social"
                />
              </div>

              <div>
                <Label>CPF / CNPJ *</Label>
                <Input
                  value={carteiraForm.cpf_cnpj}
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      cpf_cnpj: formatCpfCnpj(event.target.value),
                    }))
                  }
                  maxLength={18}
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <Label>Celular *</Label>
                <Input
                  value={carteiraForm.celular}
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      celular: formatPhone(event.target.value),
                    }))
                  }
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={carteiraForm.email}
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  placeholder="financeiro@cliente.com"
                />
              </div>

              <div>
                <Label>CEP</Label>
                <Input
                  value={carteiraForm.cep}
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      cep: formatCep(event.target.value),
                    }))
                  }
                  maxLength={9}
                  placeholder="00000-000"
                />
              </div>

              <div>
                <Label>Nº da residência</Label>
                <Input
                  value={carteiraForm.numero_residencia}
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      numero_residencia: event.target.value,
                    }))
                  }
                  placeholder="Número"
                />
              </div>

              <div>
                <Label>Vencimento dos planos</Label>
                <Select
                  value={carteiraForm.vencimento_planos || undefined}
                  onValueChange={(value) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      vencimento_planos: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o vencimento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="05">Dia 05</SelectItem>
                    <SelectItem value="20">Dia 20</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCarteiraForm((current) => ({
                      ...current,
                      vencimento_planos: "",
                    }))
                  }
                  className="w-full"
                >
                  Limpar vencimento
                </Button>
              </div>
            </div>

            <LinkedDogsSelector
              dogs={dogs}
              dogMap={dogMap}
              selectedDogIds={selectedCarteiraDogIds}
              searchTerm={searchDogCart}
              onSearchChange={setSearchDogCart}
              onToggleDog={toggleCarteiraDog}
              accent="orange"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeCarteiraEditor} disabled={isSaving} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCarteira}
              disabled={isSaving}
              className="w-full bg-orange-600 text-white hover:bg-orange-700 sm:w-auto"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar carteira"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkDialog.open} onOpenChange={(open) => !open && closeLinkDialog()}>
        <DialogContent className="max-h-[92vh] w-[96vw] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {linkDialog.mode === "dog_only"
                ? "Gerar link para cadastrar apenas o cão"
                : "Gerar link para cadastrar cão e responsável financeiro"}
            </DialogTitle>
            <DialogDescription>
              {linkDialog.mode === "dog_only"
                ? "Esse link abrirá o cadastro já com o responsável preenchido. Antes de gerar, escolha qual responsável financeiro ficará vinculado ao novo cão."
                : "Esse link abrirá o cadastro com o responsável já preenchido, permitindo incluir o novo cão e um novo responsável financeiro na mesma jornada."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <FeedbackBanner feedback={linkDialog.feedback} />

            <div className="rounded-3xl border border-violet-100 bg-violet-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">
                Responsável do link
              </p>
              <div className="mt-2">
                <p className="text-base font-semibold text-gray-900">
                  {selectedLinkResponsavel?.nome_completo || "Responsável não encontrado"}
                </p>
                <div className="mt-1 space-y-1 text-sm text-gray-600">
                  <p>{maskSensitiveValue(selectedLinkResponsavel?.cpf || "", maskCpfCnpj, canRevealSensitiveData) || "CPF não informado"}</p>
                  <p>{maskSensitiveValue(selectedLinkResponsavel?.email || "", maskEmail, canRevealSensitiveData) || "Email não informado"}</p>
                </div>
              </div>
            </div>

            {linkDialog.mode === "dog_only" ? (
              <div className="space-y-4 rounded-3xl border border-orange-100 bg-orange-50/70 p-4">
                <div>
                  <Label>Nome do responsável financeiro</Label>
                  <Input
                    value={linkDialog.search}
                    onChange={(event) =>
                      setLinkDialog((current) => ({
                        ...current,
                        search: event.target.value,
                        generatedLink: "",
                        feedback: null,
                      }))
                    }
                    placeholder="Busque por nome, CPF/CNPJ, email ou celular..."
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Esse vínculo já seguirá preenchido quando a pessoa abrir o link.
                  </p>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-orange-100 bg-white p-2">
                  {availableCarteirasForLink.length > 0 ? (
                    availableCarteirasForLink.map((carteira) => {
                      const isSelected = carteira.id === linkDialog.carteiraId;
                      const linkedDogNames = getDogDisplayNames(carteira.linkedDogIds, dogMap);

                      return (
                        <button
                          key={carteira.id}
                          type="button"
                          onClick={() =>
                            setLinkDialog((current) => ({
                              ...current,
                              carteiraId: carteira.id,
                              generatedLink: "",
                              feedback: null,
                            }))
                          }
                          className={`w-full rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-orange-300 bg-orange-50 shadow-sm"
                              : "border-transparent bg-gray-50 hover:border-orange-200 hover:bg-orange-50/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {carteira.nome_razao_social || "Sem nome"}
                              </p>
                              <div className="mt-1 space-y-1 text-xs text-gray-600">
                                <p>{maskSensitiveValue(carteira.cpf_cnpj || "", maskCpfCnpj, canRevealSensitiveData) || "CPF/CNPJ não informado"}</p>
                                <p className="truncate">{maskSensitiveValue(carteira.email || "", maskEmail, canRevealSensitiveData) || "Email não informado"}</p>
                                <p>{maskSensitiveValue(carteira.celular || "", maskPhone, canRevealSensitiveData) || "Celular não informado"}</p>
                              </div>
                            </div>
                            {isSelected ? (
                              <Badge className="bg-orange-500 text-white">Selecionado</Badge>
                            ) : null}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {linkedDogNames.length > 0 ? (
                              linkedDogNames.map((dogName) => (
                                <Badge
                                  key={`${carteira.id}-${dogName}`}
                                  className="border border-orange-200 bg-orange-50 text-orange-700"
                                >
                                  {dogName}
                                </Badge>
                              ))
                            ) : (
                              <Badge className="bg-gray-100 text-gray-600">
                                Ainda sem cães vinculados
                              </Badge>
                            )}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/60 p-4 text-sm text-orange-800">
                      Nenhum responsável financeiro foi encontrado com esse filtro.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {linkDialog.generatedLink ? (
              <div className="space-y-3 rounded-3xl border border-emerald-100 bg-emerald-50/60 p-4">
                <Label>Link gerado</Label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input readOnly value={linkDialog.generatedLink} className="font-mono text-xs" />
                  <Button
                    type="button"
                    onClick={handleCopyGeneratedLink}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeLinkDialog} disabled={isGeneratingLink} className="w-full sm:w-auto">
              {linkDialog.generatedLink ? "Fechar" : "Cancelar"}
            </Button>
            <Button
              onClick={linkDialog.generatedLink ? handleCopyGeneratedLink : handleGenerateCadastroLink}
              disabled={isGeneratingLink || (!linkDialog.generatedLink && !selectedLinkResponsavel)}
              className="w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto"
            >
              {isGeneratingLink ? (
                <>
                  <Save className="mr-2 h-4 w-4 animate-pulse" />
                  Gerando...
                </>
              ) : linkDialog.generatedLink ? (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Gerar link
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
