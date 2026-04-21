import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import { Carteira, Dog, Responsavel } from "@/api/entities";
import { clientRegistration } from "@/api/functions";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { validateCpfWithGov } from "@/lib/cpf-validation";
import { getInternalEntityReference } from "@/lib/entity-identifiers";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  Copy,
  Dog as DogIcon,
  ExternalLink,
  FileText,
  Link2,
  Pencil,
  Save,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const EMPTY_RESPONSAVEL_FORM = {
  nome_completo: "",
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
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        </div>
        <Icon className={`h-10 w-10 ${colorClass} opacity-60`} />
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
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label className="text-sm font-semibold text-gray-900">Cães vinculados</Label>
          <p className="mt-1 text-xs text-gray-500">
            Selecione até 8 cães para manter esse perfil associado corretamente.
          </p>
        </div>
        <Badge className={palette.countBadge}>
          {selectedDogIds.length}/{RELATION_SLOTS.length} vínculos
        </Badge>
      </div>

      <SearchFiltersToolbar
        searchTerm={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Buscar cão por nome, apelido ou raça..."
        hasActiveFilters={Boolean(searchTerm)}
        onClear={() => onSearchChange("")}
      />

      <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2">
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
                className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition ${
                  isSelected
                    ? palette.selectedRow
                    : "border-transparent bg-gray-50 hover:border-gray-200 hover:bg-gray-100"
                } ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-bold ${palette.iconShell}`}
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
  const [dogs, setDogs] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("caes");
  const [searchTerm, setSearchTerm] = useState("");
  const [pageFeedback, setPageFeedback] = useState(null);
  const [editorFeedback, setEditorFeedback] = useState(null);
  const [editingResponsavelId, setEditingResponsavelId] = useState("");
  const [editingCarteiraId, setEditingCarteiraId] = useState("");
  const [responsavelForm, setResponsavelForm] = useState(EMPTY_RESPONSAVEL_FORM);
  const [carteiraForm, setCarteiraForm] = useState(EMPTY_CARTEIRA_FORM);
  const [searchDogResp, setSearchDogResp] = useState("");
  const [searchDogCart, setSearchDogCart] = useState("");
  const [linkDialog, setLinkDialog] = useState(EMPTY_LINK_DIALOG_STATE);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async ({ showLoader = true } = {}) => {
    if (showLoader) setIsLoading(true);

    try {
      const [dogsData, responsaveisData, carteirasData] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 1000),
        Carteira.list("-created_date", 1000),
      ]);

      setDogs(dogsData || []);
      setResponsaveis(responsaveisData || []);
      setCarteiras(carteirasData || []);
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

  const dogMap = useMemo(() => buildDogMap(dogs), [dogs]);

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

  const closeCarteiraEditor = () => {
    setEditingCarteiraId("");
    setCarteiraForm(EMPTY_CARTEIRA_FORM);
    setSearchDogCart("");
    setEditorFeedback(null);
    setIsSaving(false);
  };

  const openResponsavelEditor = (responsavelId) => {
    const target = responsaveis.find((item) => item.id === responsavelId);
    if (!target) return;

    resetEditorFeedback();
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

    if (!responsavelForm.nome_completo || !responsavelForm.cpf || !responsavelForm.celular) {
      setEditorFeedback({
        tone: "error",
        title: "Campos obrigatórios",
        message: "Preencha nome completo, CPF e celular para salvar o responsável.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const cpfValidation = await validateCpfWithGov({
        cpf: responsavelForm.cpf,
        fullName: responsavelForm.nome_completo,
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
        nome_completo: responsavelForm.nome_completo.trim(),
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

    if (!carteiraForm.nome_razao_social || !carteiraForm.cpf_cnpj || !carteiraForm.celular) {
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

      if (cpfOrCnpjDigits.length === 11) {
        const cpfValidation = await validateCpfWithGov({
          cpf: carteiraForm.cpf_cnpj,
          fullName: carteiraForm.nome_razao_social,
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
        nome_razao_social: carteiraForm.nome_razao_social.trim(),
        cpf_cnpj: carteiraForm.cpf_cnpj.trim(),
        celular: carteiraForm.celular.trim(),
        email: optional(carteiraForm.email.trim()),
        cep: optional(carteiraForm.cep.trim()),
        numero_residencia: optional(carteiraForm.numero_residencia.trim()),
        vencimento_planos: optional(carteiraForm.vencimento_planos),
        ...buildDogRelationPayload(selectedCarteiraDogIds),
      };

      const updatedCarteira = await Carteira.update(editingCarteiraId, payload);

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
            <div className="mt-1 rounded-2xl bg-blue-100 p-3 text-blue-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Perfis</h1>
              <p className="mt-1 text-sm text-gray-600">
                Visualização consolidada de cães, responsáveis e carteiras da unidade em acesso.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to={createPageUrl("Cadastro")}>
              <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                <FileText className="mr-2 h-4 w-4" />
                Ir para Cadastro
              </Button>
            </Link>
          </div>
        </div>

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
          <CardContent className="space-y-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nome, contato, raça, CPF/CNPJ ou vínculos..."
              hasActiveFilters={Boolean(searchTerm)}
              onClear={() => setSearchTerm("")}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-gray-100 p-1">
                <TabsTrigger value="caes" className="rounded-xl">
                  Cães
                </TabsTrigger>
                <TabsTrigger value="responsaveis" className="rounded-xl">
                  Responsáveis
                </TabsTrigger>
                <TabsTrigger value="carteiras" className="rounded-xl">
                  Carteiras
                </TabsTrigger>
              </TabsList>

              <TabsContent value="caes" className="space-y-4">
                {filteredDogs.length === 0 ? (
                  <EmptyState
                    title="Nenhum cão encontrado"
                    description="Ajuste a busca para localizar um perfil canino desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredDogs.map((dog) => (
                      <Card key={dog.id} className="border-emerald-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-bold text-emerald-700">
                                  {String(dog.nome || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="truncate text-lg font-semibold text-gray-900">
                                    {dog.nome || "Sem nome"}
                                  </h3>
                                  <p className="truncate text-sm text-gray-500">
                                    {dog.apelido ? `Apelido: ${dog.apelido}` : "Sem apelido cadastrado"}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {dog.raca ? (
                                  <Badge className="bg-emerald-100 text-emerald-700">{dog.raca}</Badge>
                                ) : null}
                                {dog.porte ? (
                                  <Badge className="bg-blue-100 text-blue-700">{dog.porte}</Badge>
                                ) : null}
                                <Badge className="bg-violet-100 text-violet-700">
                                  {dog.linkedResponsaveis.length} responsável(is)
                                </Badge>
                                <Badge className="bg-orange-100 text-orange-700">
                                  {dog.linkedCarteiras.length} carteira(s)
                                </Badge>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Link to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(getInternalEntityReference(dog))}`}>
                                <Button variant="outline" size="sm">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ficha
                                </Button>
                              </Link>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                                Responsáveis
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {dog.linkedResponsaveis.length > 0 ? (
                                  dog.linkedResponsaveis.map((responsavel) => (
                                    <Badge
                                      key={responsavel.id}
                                      className="border border-violet-200 bg-violet-50 text-violet-700"
                                    >
                                      {responsavel.nome_completo}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600">
                                    Sem responsável vinculado
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                                Carteiras
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {dog.linkedCarteiras.length > 0 ? (
                                  dog.linkedCarteiras.map((carteira) => (
                                    <Badge
                                      key={carteira.id}
                                      className="border border-orange-200 bg-orange-50 text-orange-700"
                                    >
                                      {carteira.nome_razao_social}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-600">
                                    Sem carteira vinculada
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="responsaveis" className="space-y-4">
                {filteredResponsaveis.length === 0 ? (
                  <EmptyState
                    title="Nenhum responsável encontrado"
                    description="Ajuste a busca para localizar um responsável desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredResponsaveis.map((responsavel) => (
                      <Card key={responsavel.id} className="border-violet-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-gray-900">
                                {responsavel.nome_completo || "Sem nome"}
                              </h3>
                              <div className="mt-2 space-y-1 text-sm text-gray-600">
                                <p>{responsavel.cpf || "CPF não informado"}</p>
                                <p>
                                  {responsavel.celular ||
                                    responsavel.celular_alternativo ||
                                    "Celular não informado"}
                                </p>
                                <p className="truncate">{responsavel.email || "Email não informado"}</p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <Badge className="bg-violet-100 text-violet-700">
                                {responsavel.linkedDogIds.length} cão(ães)
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-violet-200 text-violet-700 hover:bg-violet-50"
                              onClick={() => openLinkDialog(responsavel.id, "dog_only")}
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              Link: apenas cão
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-violet-200 text-violet-700 hover:bg-violet-50"
                              onClick={() => openLinkDialog(responsavel.id, "dog_and_financeiro")}
                            >
                              <Wallet className="mr-2 h-4 w-4" />
                              Link: cão + financeiro
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openResponsavelEditor(responsavel.id)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Button>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                              Cães vinculados
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {responsavel.linkedDogIds.length > 0 ? (
                                responsavel.linkedDogIds.map((dogId) => (
                                  <Link
                                    key={dogId}
                                    to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(getInternalEntityReference(dogMap[dogId]) || dogId)}`}
                                  >
                                    <Badge className="cursor-pointer border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
                                      {dogMap[dogId]?.nome || dogId}
                                    </Badge>
                                  </Link>
                                ))
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600">Sem cães vinculados</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="carteiras" className="space-y-4">
                {filteredCarteiras.length === 0 ? (
                  <EmptyState
                    title="Nenhuma carteira encontrada"
                    description="Ajuste a busca para localizar uma carteira desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredCarteiras.map((carteira) => (
                      <Card key={carteira.id} className="border-orange-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-gray-900">
                                {carteira.nome_razao_social || "Sem nome"}
                              </h3>
                              <div className="mt-2 space-y-1 text-sm text-gray-600">
                                <p>{carteira.cpf_cnpj || "CPF/CNPJ não informado"}</p>
                                <p>{carteira.celular || "Celular não informado"}</p>
                                <p className="truncate">{carteira.email || "Email não informado"}</p>
                              </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {carteira.vencimento_planos ? (
                                <Badge className="bg-orange-100 text-orange-700">
                                  Dia {carteira.vencimento_planos}
                                </Badge>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openCarteiraEditor(carteira.id)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                              Cães vinculados
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {carteira.linkedDogIds.length > 0 ? (
                                carteira.linkedDogIds.map((dogId) => (
                                  <Link
                                    key={dogId}
                                    to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(getInternalEntityReference(dogMap[dogId]) || dogId)}`}
                                  >
                                    <Badge className="cursor-pointer border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
                                      {dogMap[dogId]?.nome || dogId}
                                    </Badge>
                                  </Link>
                                ))
                              ) : (
                                <Badge className="bg-gray-100 text-gray-600">Sem cães vinculados</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

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
                  onChange={(event) =>
                    setResponsavelForm((current) => ({
                      ...current,
                      nome_completo: event.target.value,
                    }))
                  }
                  placeholder="Nome completo do responsável"
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

          <DialogFooter>
            <Button variant="outline" onClick={closeResponsavelEditor} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveResponsavel}
              disabled={isSaving}
              className="bg-violet-600 text-white hover:bg-violet-700"
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
                  onChange={(event) =>
                    setCarteiraForm((current) => ({
                      ...current,
                      nome_razao_social: event.target.value,
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

          <DialogFooter>
            <Button variant="outline" onClick={closeCarteiraEditor} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCarteira}
              disabled={isSaving}
              className="bg-orange-600 text-white hover:bg-orange-700"
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
                  <p>{selectedLinkResponsavel?.cpf || "CPF não informado"}</p>
                  <p>{selectedLinkResponsavel?.email || "Email não informado"}</p>
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
                                <p>{carteira.cpf_cnpj || "CPF/CNPJ não informado"}</p>
                                <p className="truncate">{carteira.email || "Email não informado"}</p>
                                <p>{carteira.celular || "Celular não informado"}</p>
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

          <DialogFooter>
            <Button variant="outline" onClick={closeLinkDialog} disabled={isGeneratingLink}>
              {linkDialog.generatedLink ? "Fechar" : "Cancelar"}
            </Button>
            <Button
              onClick={linkDialog.generatedLink ? handleCopyGeneratedLink : handleGenerateCadastroLink}
              disabled={isGeneratingLink || (!linkDialog.generatedLink && !selectedLinkResponsavel)}
              className="bg-violet-600 text-white hover:bg-violet-700"
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
