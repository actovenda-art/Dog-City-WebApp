import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppAsset, AppConfig, Empresa, PerfilAcesso, TabelaPrecos, User } from "@/api/entities";
import { CreateFileSignedUrl, UploadFile, UploadPrivateFile } from "@/api/integrations";
import { createPageUrl, openImageViewer } from "@/utils";
import { MISSING_BRANDING_IMAGE_URL, notifyBrandingChanged } from "@/hooks/use-branding";
import { ACTIVE_UNIT_EVENT, getStoredUnitSelection, setStoredUnitSelection } from "@/lib/unit-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { Building2, FileText, Image, KeyRound, Palette, Pencil, Plus, Save, Settings, Tags, Trash2 } from "lucide-react";

const EMPTY_PROFILE = {
  codigo: "",
  nome: "",
  descricao: "",
  escopo: "empresa",
  permissoesText: "",
  ativo: true,
};

const DEFAULT_BRANDING = {
  companyName: "",
  logoUrl: "",
};

const DEFAULT_FRANCHISE_BRANDING = {
  logoUrl: "",
  logoLabel: "",
};

const FRANCHISE_LOGO_KEY = "branding.franchise.logo";
const ADMIN_TABS = ["unidades", "acessos", "branding"];
const ADMIN_ACTIVE_TAB_STORAGE_KEY = "dogcity.admin-central.active-tab";

const SERVICE_OPTIONS = [
  "Day Care",
  "Hospedagem",
  "Banho",
  "Tosa",
  "Moradia",
  "Adestramento",
];

const createEmptyAccountingPhone = () => ({
  finalidade: "",
  telefone: "",
  nome: "",
});

const createEmptyAccountingEmail = () => ({
  finalidade: "",
  email: "",
  nome: "",
});

const createEmptyAccountingContacts = () => ({
  telefones: [createEmptyAccountingPhone()],
  emails: [createEmptyAccountingEmail(), createEmptyAccountingEmail()],
});

const createEmptyUnitAddress = () => ({
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
});

const EMPTY_UNIT_FORM = {
  nome_fantasia: "",
  razao_social: "",
  cnpj: "",
  data_abertura: "",
  contabilidade_responsavel: "",
  contatos_contabilidade: createEmptyAccountingContacts(),
  contrato_social_path: "",
  contrato_social_label: "",
  endereco: createEmptyUnitAddress(),
  servicos_prestados: [],
  logo_url: "",
  logo_path: "",
  logo_label: "",
};

function parsePermissions(value) {
  return (value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugify(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCNPJ(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
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
  return (value || "").replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
}

function formatApiError(error, fallbackMessage) {
  const details = error?.message || error?.details || error?.hint || "";
  return details ? `${fallbackMessage}\n${details}` : fallbackMessage;
}

function isMissingAdminTablesError(error) {
  return error?.code === "PGRST205" || /public\.empresa|public\.perfil_acesso|schema cache/i.test(error?.message || "");
}

function isRowLevelSecurityError(error) {
  return error?.code === "42501" || /row-level security policy|violates row-level security policy/i.test(error?.message || "");
}

function cloneEmptyUnitForm() {
  return {
    ...EMPTY_UNIT_FORM,
    contatos_contabilidade: createEmptyAccountingContacts(),
    endereco: createEmptyUnitAddress(),
    servicos_prestados: [],
  };
}

function normalizeAccountingContacts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptyAccountingContacts();
  }

  const telefones = Array.isArray(value.telefones) && value.telefones.length > 0
    ? value.telefones.map((item) => ({
      finalidade: item?.finalidade || "",
      telefone: item?.telefone || "",
      nome: item?.nome || "",
    }))
    : [createEmptyAccountingPhone()];

  const emails = Array.isArray(value.emails) && value.emails.length > 0
    ? value.emails.map((item) => ({
      finalidade: item?.finalidade || "",
      email: item?.email || "",
      nome: item?.nome || "",
    }))
    : [createEmptyAccountingEmail(), createEmptyAccountingEmail()];

  return { telefones, emails };
}

function normalizeUnitAddress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...createEmptyUnitAddress(),
      street: typeof value === "string" ? value : "",
    };
  }

  return {
    cep: value.cep || "",
    street: value.street || value.logradouro || "",
    number: value.number || value.numero || "",
    neighborhood: value.neighborhood || value.bairro || "",
    city: value.city || value.cidade || "",
    state: value.state || value.estado || "",
  };
}

function formatAccountingSummary(value) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  const contacts = normalizeAccountingContacts(value);
  const lines = [
    ...contacts.telefones
      .filter((item) => item.telefone)
      .map((item) => `${item.finalidade || "Telefone"}: ${item.telefone}${item.nome ?` | ${item.nome}` : ""}`),
    ...contacts.emails
      .filter((item) => item.email)
      .map((item) => `${item.finalidade || "Email"}: ${item.email}${item.nome ?` | ${item.nome}` : ""}`),
  ];

  return lines.length > 0 ? lines.join("\n") : "Não informado";
}

function formatAddressSummary(value) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  const address = normalizeUnitAddress(value);
  const mainLine = [address.street, address.number].filter(Boolean).join(", ");
  const secondaryLine = [address.neighborhood, address.city, address.state].filter(Boolean).join(" - ");
  const lines = [mainLine, secondaryLine, address.cep].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "Não informado";
}

function formatDisplayDate(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
  } catch (error) {
    return value;
  }
}

function getStatusBadgeClass(status) {
  const normalized = String(status || "ativa").toLowerCase();
  if (normalized === "inativa") return "bg-rose-100 text-rose-700";
  if (normalized === "implantacao") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function getInitialAdminTab() {
  if (typeof window === "undefined") return "unidades";
  const storedValue = window.localStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY) || "unidades";
  return ADMIN_TABS.includes(storedValue) ? storedValue : "unidades";
}

export default function AdministracaoSistema() {
  const [currentUser, setCurrentUser] = useState(null);
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [setupError, setSetupError] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState([]);
  const [brandingForm, setBrandingForm] = useState(DEFAULT_BRANDING);
  const [franchiseBrandingForm, setFranchiseBrandingForm] = useState(DEFAULT_FRANCHISE_BRANDING);
  const [unitForm, setUnitForm] = useState(cloneEmptyUnitForm());
  const [editingUnit, setEditingUnit] = useState(null);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [editingProfile, setEditingProfile] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialAdminTab);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingFranchiseLogo, setIsUploadingFranchiseLogo] = useState(false);
  const [isUploadingUnitAsset, setIsUploadingUnitAsset] = useState(false);
  const [unitAddressLoading, setUnitAddressLoading] = useState(false);
  const [unitSelectionDialog, setUnitSelectionDialog] = useState({ open: false, unit: null });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleUnitChanged = (event) => {
      const nextSelection = event?.detail || getStoredUnitSelection();
      const nextUnitId = nextSelection?.primaryUnitId || "";
      if (!nextUnitId) return;

      setSelectedUnitId(nextUnitId);
      setSelectedUnitIds(Array.isArray(nextSelection?.selectedUnitIds) ? nextSelection.selectedUnitIds : [nextUnitId]);
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
    return () => window.removeEventListener(ACTIVE_UNIT_EVENT, handleUnitChanged);
  }, []);

  async function loadData() {
    setIsLoading(true);
    setSetupError("");

    try {
      const [me, unitRows, profileRows, pricingData, configData, assetData] = await Promise.all([
        User.me(),
        Empresa.list("-created_date", 200),
        PerfilAcesso.list("-created_date", 200),
        TabelaPrecos.list("-created_date", 1000),
        AppConfig.list("-created_date", 500),
        AppAsset.list("-created_date", 500),
      ]);

      setCurrentUser(me);
      setUnits(unitRows || []);
      setProfiles(profileRows || []);
      setPricingRows(pricingData || []);
      setConfigs(configData || []);
      setAssets(assetData || []);

      const storedSelection = getStoredUnitSelection();
      const preferredUnitId = (storedSelection.primaryUnitId && unitRows?.some((item) => item.id === storedSelection.primaryUnitId))
        ? storedSelection.primaryUnitId
        : me?.empresa_id && unitRows?.some((item) => item.id === me.empresa_id)
          ? me.empresa_id
          : unitRows?.[0]?.id || "";
      const rawSelectedUnitIds = Array.isArray(me?.selected_unit_ids) && me.selected_unit_ids.length > 0
        ? me.selected_unit_ids
        : storedSelection.selectedUnitIds;
      const normalizedSelectedUnitIds = [...new Set([
        preferredUnitId,
        ...rawSelectedUnitIds.filter((unitId) => unitRows?.some((item) => item.id === unitId)),
      ].filter(Boolean))];

      setSelectedUnitId(preferredUnitId);
      setSelectedUnitIds(normalizedSelectedUnitIds);
      if (preferredUnitId) {
        setStoredUnitSelection({
          primaryUnitId: preferredUnitId,
          selectedUnitIds: normalizedSelectedUnitIds,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar administração:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("A estrutura administrativa ainda não existe no Supabase. Execute `supabase-schema-admin-multiempresa.sql`, `supabase-schema-cloud-config.sql` e `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O Supabase bloqueou leitura ou escrita por RLS nas tabelas administrativas. Ajuste as policies antes de continuar.");
      } else {
        setSetupError(error?.message || "Não foi possível carregar a administração central.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const cepDigits = unitForm.endereco?.cep?.replace(/\D/g, "") || "";
    if (cepDigits.length !== 8) return undefined;

    let cancelled = false;

    async function fetchAddress() {
      setUnitAddressLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json();
        if (cancelled || data?.erro) return;

        setUnitForm((current) => ({
          ...current,
          endereco: {
            ...current.endereco,
            street: data.logradouro || current.endereco.street,
            neighborhood: data.bairro || current.endereco.neighborhood,
            city: data.localidade || current.endereco.city,
            state: data.uf || current.endereco.state,
          },
        }));
      } catch (error) {
        console.warn("Erro ao buscar CEP da unidade:", error);
      } finally {
        if (!cancelled) {
          setUnitAddressLoading(false);
        }
      }
    }

    fetchAddress();

    return () => {
      cancelled = true;
    };
  }, [unitForm.endereco?.cep]);

  useEffect(() => {
    const franchiseLogoAsset = assets.find((item) => item.key === FRANCHISE_LOGO_KEY && !item.empresa_id && item.ativo !== false);
    setFranchiseBrandingForm({
      logoUrl: franchiseLogoAsset?.public_url || "",
      logoLabel: franchiseLogoAsset?.metadata?.original_name || franchiseLogoAsset?.label || "",
    });
  }, [assets]);

  useEffect(() => {
    const selectedNameConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === selectedUnitId)
      || configs.find((item) => item.key === "branding.company_name" && !item.empresa_id);
    const selectedLogoAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === selectedUnitId && item.ativo !== false);

    setBrandingForm({
      companyName: selectedNameConfig?.value?.text || "",
      logoUrl: selectedLogoAsset?.public_url || "",
    });
  }, [assets, configs, selectedUnitId]);

  const selectedUnit = useMemo(
    () => units.find((item) => item.id === selectedUnitId) || null,
    [units, selectedUnitId]
  );

  const selectedUnitMeta = selectedUnit?.metadata || {};

  const selectedUnitPricing = useMemo(
    () => pricingRows.filter((item) => selectedUnitIds.includes(item.empresa_id) && item.ativo !== false),
    [pricingRows, selectedUnitIds]
  );

  const isUnitUnionActive = selectedUnitIds.length > 1;

  function activateSingleUnit(unitId) {
    if (!unitId) return;
    setStoredUnitSelection({
      primaryUnitId: unitId,
      selectedUnitIds: [unitId],
    });
    setSelectedUnitId(unitId);
    setSelectedUnitIds([unitId]);
    setUnitSelectionDialog({ open: false, unit: null });
  }

  function mergeUnitIntoSelection(unitId) {
    if (!unitId) return;
    const mergedUnitIds = [...new Set([selectedUnitId || unitId, ...selectedUnitIds, unitId].filter(Boolean))];
    setStoredUnitSelection({
      primaryUnitId: selectedUnitId || unitId,
      selectedUnitIds: mergedUnitIds,
    });
    setSelectedUnitIds(mergedUnitIds);
    setUnitSelectionDialog({ open: false, unit: null });
  }

  function handleUnitCardSelection(unit) {
    if (!unit?.id) return;

    if (unit.id === selectedUnitId && selectedUnitIds.length === 1) {
      return;
    }

    if (selectedUnitIds.includes(unit.id)) {
      setStoredUnitSelection({
        primaryUnitId: unit.id,
        selectedUnitIds,
      });
      setSelectedUnitId(unit.id);
      return;
    }

    setUnitSelectionDialog({ open: true, unit });
  }

  function openUnitModal(unit = null) {
    const metadata = unit?.metadata || {};
    setEditingUnit(unit);
    setUnitForm(unit ? {
      nome_fantasia: unit.nome_fantasia || "",
      razao_social: unit.razao_social || "",
      cnpj: unit.cnpj || "",
      data_abertura: metadata.data_abertura || "",
      contabilidade_responsavel: metadata.contabilidade_responsavel || "",
      contatos_contabilidade: normalizeAccountingContacts(metadata.contatos_contabilidade),
      contrato_social_path: metadata.contrato_social_path || "",
      contrato_social_label: metadata.contrato_social_label || "",
      endereco: normalizeUnitAddress(metadata.endereco),
      servicos_prestados: Array.isArray(metadata.servicos_prestados) ? metadata.servicos_prestados : [],
      logo_url: metadata.logo_url || "",
      logo_path: metadata.logo_path || "",
      logo_label: metadata.logo_label || "",
    } : cloneEmptyUnitForm());
    setShowUnitModal(true);
  }

  function openProfileModal(profile = null) {
    setEditingProfile(profile);
    setProfileForm(profile ? {
      codigo: profile.codigo || "",
      nome: profile.nome || "",
      descricao: profile.descricao || "",
      escopo: profile.escopo || "empresa",
      permissoesText: Array.isArray(profile.permissoes) ? profile.permissoes.join("\n") : "",
      ativo: profile.ativo !== false,
    } : EMPTY_PROFILE);
    setShowProfileModal(true);
  }

  function toggleUnitService(serviceName) {
    setUnitForm((current) => ({
      ...current,
      servicos_prestados: current.servicos_prestados.includes(serviceName)
        ? current.servicos_prestados.filter((item) => item !== serviceName)
        : [...current.servicos_prestados, serviceName],
    }));
  }

  function updateUnitAddress(field, value) {
    setUnitForm((current) => ({
      ...current,
      endereco: {
        ...current.endereco,
        [field]: value,
      },
    }));
  }

  function updateAccountingPhone(index, field, value) {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        telefones: current.contatos_contabilidade.telefones.map((item, itemIndex) => (
          itemIndex === index
            ? { ...item, [field]: value }
            : item
        )),
      },
    }));
  }

  function addAccountingPhone() {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        telefones: [...current.contatos_contabilidade.telefones, createEmptyAccountingPhone()],
      },
    }));
  }

  function removeAccountingPhone(index) {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        telefones: current.contatos_contabilidade.telefones.length > 1
          ? current.contatos_contabilidade.telefones.filter((_, itemIndex) => itemIndex !== index)
          : [createEmptyAccountingPhone()],
      },
    }));
  }

  function updateAccountingEmail(index, field, value) {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        emails: current.contatos_contabilidade.emails.map((item, itemIndex) => (
          itemIndex === index
            ? { ...item, [field]: value }
            : item
        )),
      },
    }));
  }

  function addAccountingEmail() {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        emails: [...current.contatos_contabilidade.emails, createEmptyAccountingEmail()],
      },
    }));
  }

  function removeAccountingEmail(index) {
    setUnitForm((current) => ({
      ...current,
      contatos_contabilidade: {
        ...current.contatos_contabilidade,
        emails: current.contatos_contabilidade.emails.length > 1
          ? current.contatos_contabilidade.emails.filter((_, itemIndex) => itemIndex !== index)
          : [createEmptyAccountingEmail()],
      },
    }));
  }

  async function handleUnitContractUpload(file) {
    if (!file) return;

    setIsUploadingUnitAsset(true);
    try {
      const draftUnitId = editingUnit?.id || `draft-${Date.now()}`;
      const safeName = file.name.replace(/\s+/g, "_").toLowerCase();
      const path = `${draftUnitId}/documentos-sociais/${Date.now()}-${safeName}`;
      const { file_key } = await UploadPrivateFile({ file, path });
      setUnitForm((current) => ({
        ...current,
        contrato_social_path: file_key,
        contrato_social_label: file.name,
      }));
    } catch (error) {
      console.error("Erro ao enviar contrato social:", error);
      alert(formatApiError(error, "Não foi possível enviar o contrato social."));
    } finally {
      setIsUploadingUnitAsset(false);
    }
  }

  async function handleUnitLogoUpload(file) {
    if (!file) return;

    setIsUploadingUnitAsset(true);
    try {
      const folderPrefix = editingUnit?.id || "temp";
      const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
      const path = `${folderPrefix}/branding/${Date.now()}-${safeName}`;
      const { file_key, file_url } = await UploadFile({ file, path });
      setUnitForm((current) => ({
        ...current,
        logo_url: file_url || "",
        logo_path: file_key || "",
        logo_label: file.name,
      }));
    } catch (error) {
      console.error("Erro ao enviar logo da unidade:", error);
      alert(formatApiError(error, "Não foi possível enviar a logo da unidade."));
    } finally {
      setIsUploadingUnitAsset(false);
    }
  }

  async function handleOpenContract(path) {
    if (!path) return;

    try {
      const { signedUrl, url } = await CreateFileSignedUrl({ path });
      window.open(signedUrl || url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Erro ao abrir contrato social:", error);
      alert(formatApiError(error, "Não foi possível abrir o contrato social."));
    }
  }

  async function saveUnitLogoAsset(unit, logoUrl, logoPath, logoLabel) {
    if (!unit?.id || !logoUrl) return;

    const existingAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === unit.id);
    const payload = {
      key: "branding.logo.primary",
      label: "Logo principal",
      bucket: "public-assets",
      storage_path: logoPath || existingAsset?.storage_path || unit.logo_asset_key || `unit/${unit.id}/logo`,
      public_url: logoUrl,
      mime_type: "image/*",
      ativo: true,
      empresa_id: unit.id,
      metadata: { original_name: logoLabel || "logo-unidade" },
    };

    if (existingAsset) {
      await AppAsset.update(existingAsset.id, payload);
    } else {
      await AppAsset.create(payload);
    }
  }

  async function saveUnitBrandingConfig(unit, companyName) {
    if (!unit?.id || !companyName) return;

    const existingConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === unit.id);
    const payload = {
      key: "branding.company_name",
      label: "Nome da unidade",
      description: "Nome exibido no menu lateral e telas institucionais",
      value: { text: companyName },
      ativo: true,
      empresa_id: unit.id,
    };

    if (existingConfig) {
      await AppConfig.update(existingConfig.id, payload);
    } else {
      await AppConfig.create(payload);
    }
  }

  async function handleSaveUnit() {
    if (!unitForm.nome_fantasia || !unitForm.razao_social || !unitForm.cnpj) {
      alert("Preencha nome fantasia, razão social e CNPJ.");
      return;
    }

    setIsSaving(true);
    try {
      const codeBase = slugify(unitForm.nome_fantasia).replace(/-/g, "").slice(0, 10).toUpperCase() || `UNIT${Date.now()}`;
      const normalizedContacts = {
        telefones: unitForm.contatos_contabilidade.telefones.filter((item) => item.finalidade || item.telefone || item.nome),
        emails: unitForm.contatos_contabilidade.emails.filter((item) => item.finalidade || item.email || item.nome),
      };
      const normalizedAddress = {
        cep: unitForm.endereco.cep || "",
        street: unitForm.endereco.street || "",
        number: unitForm.endereco.number || "",
        neighborhood: unitForm.endereco.neighborhood || "",
        city: unitForm.endereco.city || "",
        state: unitForm.endereco.state || "",
      };
      const payload = {
        codigo: editingUnit?.codigo || codeBase,
        slug: editingUnit?.slug || slugify(unitForm.nome_fantasia),
        nome_fantasia: unitForm.nome_fantasia,
        razao_social: unitForm.razao_social,
        cnpj: unitForm.cnpj,
        status: editingUnit?.status || "ativa",
        metadata: {
          ...(editingUnit?.metadata || {}),
          data_abertura: unitForm.data_abertura || null,
          contabilidade_responsavel: unitForm.contabilidade_responsavel || "",
          contatos_contabilidade: normalizedContacts,
          contatos_contabilidade_legacy: typeof editingUnit?.metadata?.contatos_contabilidade === "string"
            ? editingUnit.metadata.contatos_contabilidade
            : editingUnit?.metadata?.contatos_contabilidade_legacy || "",
          contrato_social_path: unitForm.contrato_social_path || "",
          contrato_social_label: unitForm.contrato_social_label || "",
          endereco: normalizedAddress,
          endereco_legacy: typeof editingUnit?.metadata?.endereco === "string"
            ? editingUnit.metadata.endereco
            : editingUnit?.metadata?.endereco_legacy || "",
          servicos_prestados: unitForm.servicos_prestados || [],
          logo_url: unitForm.logo_url || "",
          logo_path: unitForm.logo_path || "",
          logo_label: unitForm.logo_label || "",
        },
      };

      const savedUnit = editingUnit
        ? await Empresa.update(editingUnit.id, payload)
        : await Empresa.create(payload);

      if (unitForm.logo_url) {
        await saveUnitLogoAsset(savedUnit, unitForm.logo_url, unitForm.logo_path, unitForm.logo_label);
      }

      await saveUnitBrandingConfig(savedUnit, unitForm.nome_fantasia);
      await loadData();
      setStoredUnitSelection({
        primaryUnitId: savedUnit.id,
        selectedUnitIds: [savedUnit.id],
      });
      setSelectedUnitId(savedUnit.id);
      setSelectedUnitIds([savedUnit.id]);
      setShowUnitModal(false);
      setEditingUnit(null);
      setUnitForm(cloneEmptyUnitForm());
      notifyBrandingChanged();
    } catch (error) {
      console.error("Erro ao salvar unidade:", error);
      alert(formatApiError(error, "Não foi possível salvar a unidade."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveProfile() {
    if (!profileForm.codigo || !profileForm.nome) {
      alert("Preencha código e nome do perfil.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        codigo: profileForm.codigo.trim().toLowerCase(),
        nome: profileForm.nome,
        descricao: profileForm.descricao,
        escopo: profileForm.escopo,
        permissoes: parsePermissions(profileForm.permissoesText),
        ativo: profileForm.ativo,
      };

      if (editingProfile) {
        await PerfilAcesso.update(editingProfile.id, payload);
      } else {
        await PerfilAcesso.create(payload);
      }

      setShowProfileModal(false);
      setEditingProfile(null);
      setProfileForm(EMPTY_PROFILE);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      alert(formatApiError(error, "Não foi possível salvar o perfil de acesso."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteProfile(profile) {
    if (!profile?.id) return;
    if (!window.confirm(`Excluir o tipo de acesso "${profile.nome}"? Esta ação não pode ser desfeita.`)) return;

    setIsSaving(true);
    setActiveTab("acessos");
    try {
      await PerfilAcesso.delete(profile.id);
      const refreshedProfiles = await PerfilAcesso.list("-created_date", 200);
      const stillExists = refreshedProfiles.some((item) => item.id === profile.id);

      if (stillExists) {
        throw new Error("O perfil permaneceu salvo no banco apos a tentativa de exclusao.");
      }

      setProfiles(refreshedProfiles);

      if (editingProfile?.id === profile.id) {
        setShowProfileModal(false);
        setEditingProfile(null);
        setProfileForm(EMPTY_PROFILE);
      }
    } catch (error) {
      console.error("Erro ao excluir perfil:", error);
      const rawMessage = String(error?.message || "").toLowerCase();
      const isInUseError = error?.code === "23503"
        || rawMessage.includes("foreign key")
        || rawMessage.includes("violates foreign key")
        || rawMessage.includes("still referenced");

      const isSilentPermissionBlock = rawMessage.includes("permaneceu salvo no banco");

      if (isInUseError) {
        alert("Não foi possível excluir este tipo de acesso porque ele ainda está vinculado a usuários, convites ou acessos de unidade.");
      } else if (isSilentPermissionBlock) {
        alert("Não foi possível excluir este tipo de acesso. O registro continuou no banco, o que normalmente indica bloqueio por permissão ou regra do Supabase.");
      } else {
        alert(formatApiError(error, "NÃƒÂ£o foi possÃƒÂ­vel excluir o perfil de acesso."));
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveBranding() {
    if (!selectedUnitId || !brandingForm.companyName) {
      alert("Selecione a unidade e informe o nome exibido.");
      return;
    }

    setIsSaving(true);
    try {
      const existingConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === selectedUnitId);
      const payload = {
        key: "branding.company_name",
        label: "Nome da unidade",
        description: "Nome exibido no menu lateral e telas institucionais",
        value: { text: brandingForm.companyName },
        ativo: true,
        empresa_id: selectedUnitId,
      };

      if (existingConfig) {
        await AppConfig.update(existingConfig.id, payload);
      } else {
        await AppConfig.create(payload);
      }

      await loadData();
      notifyBrandingChanged();
    } catch (error) {
      console.error("Erro ao salvar branding:", error);
      alert(formatApiError(error, "Não foi possível salvar o branding."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFranchiseLogoUpload(file) {
    if (!file) return;

    setIsUploadingFranchiseLogo(true);
    try {
      const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
      const path = `franquia/branding/${Date.now()}-${safeName}`;
      const { file_key, file_url } = await UploadFile({ file, path });
      const existingAsset = assets.find((item) => item.key === FRANCHISE_LOGO_KEY && !item.empresa_id);
      const payload = {
        key: FRANCHISE_LOGO_KEY,
        label: "Logo da franquia",
        bucket: "public-assets",
        storage_path: file_key,
        public_url: file_url,
        mime_type: file.type || "image/*",
        ativo: true,
        empresa_id: null,
        metadata: { original_name: file.name, usage: "webapp_global_branding" },
      };

      if (existingAsset) {
        await AppAsset.update(existingAsset.id, payload);
      } else {
        await AppAsset.create(payload);
      }

      setFranchiseBrandingForm({ logoUrl: file_url || "", logoLabel: file.name });
      await loadData();
      notifyBrandingChanged();
    } catch (error) {
      console.error("Erro ao enviar logo da franquia:", error);
      alert(formatApiError(error, "Não foi possível enviar a logo da franquia."));
    } finally {
      setIsUploadingFranchiseLogo(false);
    }
  }

  async function handleLogoUpload(file) {
    if (!file || !selectedUnitId) return;

    setIsUploading(true);
    try {
      const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
      const path = `${selectedUnitId}/branding/${Date.now()}-${safeName}`;
      const { file_key, file_url } = await UploadFile({ file, path });
      const existingAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === selectedUnitId);
      const payload = {
        key: "branding.logo.primary",
        label: "Logo principal",
        bucket: "public-assets",
        storage_path: file_key,
        public_url: file_url,
        mime_type: file.type || "image/*",
        ativo: true,
        empresa_id: selectedUnitId,
        metadata: { original_name: file.name },
      };

      if (existingAsset) {
        await AppAsset.update(existingAsset.id, payload);
      } else {
        await AppAsset.create(payload);
      }

      await loadData();
      notifyBrandingChanged();
    } catch (error) {
      console.error("Erro ao enviar logo:", error);
      alert(formatApiError(error, "Não foi possível enviar a logo."));
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Administração Central</h1>
              <p className="text-sm text-gray-600 mt-1">Dog City Brasil: unidades, perfis de acesso e branding em nuvem.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
              Unidade em acesso
              <div className="mt-1 font-semibold text-gray-900">{selectedUnit?.nome_fantasia || "Nenhuma unidade ativa"}</div>
              {isUnitUnionActive ? (
                <div className="mt-1 text-xs text-blue-600">{selectedUnitIds.length} unidades na visão unificada</div>
              ) : null}
            </div>
            <Link to={createPageUrl("ConfiguracoesPrecos")}>
              <Button variant="outline">
                <Tags className="w-4 h-4 mr-2" />
                Configurar preços
              </Button>
            </Link>
          </div>
        </div>

        {setupError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {setupError}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Unidades", value: units.length, tone: "text-blue-600", border: "border-blue-200" },
            { label: "Perfis ativos", value: profiles.filter((profile) => profile.ativo !== false).length, tone: "text-emerald-600", border: "border-emerald-200" },
            { label: "Itens de preco", value: selectedUnitPricing.length, tone: "text-amber-600", border: "border-amber-200" },
            { label: "Branding franquia", value: franchiseBrandingForm.logoUrl ? 1 : 0, tone: "text-purple-600", border: "border-purple-200" },
          ].map((stat) => (
            <Card key={stat.label} className={`bg-white ${stat.border}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.tone}`}>{stat.value}</p>
                </div>
                <Settings className={`w-10 h-10 opacity-50 ${stat.tone}`} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="unidades">Unidades</TabsTrigger>
            <TabsTrigger value="acessos">Perfis de Acesso</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
          </TabsList>

          <TabsContent value="unidades">
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Unidades Dog City Brasil
                </CardTitle>
                <Button variant="outline" onClick={() => openUnitModal()}>
                  Cadastrar unidade
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {units.map((unit) => {
                  const unitMeta = unit.metadata || {};
                  const services = Array.isArray(unitMeta.servicos_prestados) ? unitMeta.servicos_prestados : [];
                  const hasContract = Boolean(unitMeta.contrato_social_path);
                  const isPrimarySelected = selectedUnitId === unit.id;
                  const isMergedSelected = !isPrimarySelected && selectedUnitIds.includes(unit.id);

                  return (
                    <div
                      key={unit.id}
                      onClick={() => handleUnitCardSelection(unit)}
                      className={isPrimarySelected
                        ? "cursor-pointer rounded-xl border border-blue-500 bg-blue-50 p-4 shadow-sm"
                        : isMergedSelected
                          ? "cursor-pointer rounded-xl border border-sky-300 bg-sky-50 p-4"
                          : "cursor-pointer rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-gray-300 hover:bg-white"}
                    >
                      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900">{unit.nome_fantasia}</p>
                            <Badge className={getStatusBadgeClass(unit.status)}>{unit.status || "ativa"}</Badge>
                            {isPrimarySelected && (
                              <Badge className="bg-blue-100 text-blue-700">Em acesso</Badge>
                            )}
                            {isMergedSelected && (
                              <Badge className="bg-sky-100 text-sky-700">Na visão unificada</Badge>
                            )}
                          </div>

                          <div>
                            <p className="text-sm text-gray-700">{unit.razao_social || "Razão social não cadastrada"}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Código: {unit.codigo || "-"} | Slug: {unit.slug || "-"} | CNPJ: {unit.cnpj || "-"}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-400">Data de abertura</p>
                              <p className="mt-1 font-medium text-gray-900">{formatDisplayDate(unitMeta.data_abertura)}</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-400">Contabilidade</p>
                              <p className="mt-1 font-medium text-gray-900">{unitMeta.contabilidade_responsavel || "Não informada"}</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-400">Contato da contabilidade</p>
                              <p className="mt-1 text-gray-700 whitespace-pre-line">{formatAccountingSummary(unitMeta.contatos_contabilidade)}</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 bg-white p-3">
                              <p className="text-xs uppercase tracking-wide text-gray-400">Endereço</p>
                              <p className="mt-1 text-gray-700 whitespace-pre-line">{formatAddressSummary(unitMeta.endereco)}</p>
                            </div>
                          </div>

                          <div>
                            <p className="text-xs uppercase tracking-wide text-gray-400">Serviços prestados</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {services.length > 0 ? services.map((service) => (
                                <Badge key={service} variant="outline">{service}</Badge>
                              )) : (
                                <span className="text-sm text-gray-500">Nenhum serviço vinculado.</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 xl:min-w-[180px]">
                          <Button variant="outline" onClick={(event) => { event.stopPropagation(); openUnitModal(unit); }}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar ficha
                          </Button>
                          {unitMeta.logo_url ? (
                            <Button variant="outline" onClick={(event) => { event.stopPropagation(); openImageViewer(unitMeta.logo_url, `Logo ${unit.nome_fantasia}`); }}>
                              <Image className="w-4 h-4 mr-2" />
                              Ver logo
                            </Button>
                          ) : null}
                          {hasContract ? (
                            <Button variant="outline" onClick={(event) => { event.stopPropagation(); handleOpenContract(unitMeta.contrato_social_path); }}>
                              <FileText className="w-4 h-4 mr-2" />
                              Ver contrato social
                            </Button>
                          ) : (
                            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                              Contrato social não anexado.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {units.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-500 text-center">
                    Nenhuma unidade cadastrada ainda.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acessos">
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                  Tipos de acesso
                </CardTitle>
                <Button onClick={() => openProfileModal()} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Novo perfil
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {profiles.map((profile) => (
                  <div key={profile.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{profile.nome}</p>
                        <Badge variant="outline">{profile.codigo}</Badge>
                        <Badge className={profile.ativo !== false ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                          {profile.ativo !== false ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{profile.descricao || "Sem descrição cadastrada."}</p>
                      <p className="text-xs text-gray-500 mt-2">Escopo: {profile.escopo === "plataforma" ? "Administração central" : "Unidade"}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => openProfileModal(profile)}>
                        Editar
                      </Button>
                      <Button variant="outline" onClick={() => handleDeleteProfile(profile)} disabled={isSaving} className="border-rose-200 text-rose-600 hover:bg-rose-50">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card className="mb-6 border-purple-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-purple-600" />
                  Branding da franquia
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[180px_1fr] lg:items-center">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <img
                    src={franchiseBrandingForm.logoUrl || MISSING_BRANDING_IMAGE_URL}
                    alt="Logo da franquia Dog City Brasil"
                    className="mx-auto h-28 w-28 object-contain"
                  />
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Logo usada no webapp</p>
                    <p className="mt-1 text-sm text-gray-600">
                      A marca institucional do app é fixa na franquia. A única logo variável dentro do webapp é a da unidade exibida no menu lateral.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <input
                      id="franchise-logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleFranchiseLogoUpload(event.target.files?.[0])}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById("franchise-logo-upload")?.click()}
                      disabled={isUploadingFranchiseLogo}
                    >
                      <Image className="w-4 h-4 mr-2" />
                      {isUploadingFranchiseLogo ? "Enviando..." : "Enviar logo da franquia"}
                    </Button>
                    {franchiseBrandingForm.logoUrl ? (
                      <button
                        type="button"
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => openImageViewer(franchiseBrandingForm.logoUrl, "Logo da franquia")}
                      >
                        Ver logo atual
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">Este arquivo não altera favicon, login nem carregamento do app.</span>
                    )}
                  </div>
                  {franchiseBrandingForm.logoLabel ? (
                    <p className="text-xs text-gray-500">Arquivo atual: {franchiseBrandingForm.logoLabel}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="bg-white border-gray-200 xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-purple-600" />
                    Identificação da unidade
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <Label>Unidade selecionada</Label>
                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                      {selectedUnit?.nome_fantasia || "Selecione uma unidade para editar o branding."}
                    </div>
                  </div>

                  <div>
                    <Label>Nome da unidade</Label>
                    <Input
                      value={brandingForm.companyName}
                      onChange={(event) => setBrandingForm((current) => ({ ...current, companyName: event.target.value }))}
                      className="mt-2"
                      placeholder="Dog City Brasil - Unidade"
                    />
                  </div>

                  <div>
                    <Label>Logo cadastral da unidade</Label>
                    <p className="mt-1 text-xs text-gray-500">Esta logo fica apenas no cadastro da unidade. Ela não altera o menu, login, favicon ou ícone do app.</p>
                    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        id="branding-logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("branding-logo-upload")?.click()}
                        disabled={isUploading || !selectedUnitId}
                      >
                        <Image className="w-4 h-4 mr-2" />
                        {isUploading ? "Enviando..." : "Enviar logo cadastral"}
                      </Button>
                      {brandingForm.logoUrl ? (
                        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => openImageViewer(brandingForm.logoUrl, "Logo da unidade")}>
                          Ver logo atual
                        </button>
                      ) : (
                        <span className="text-sm text-gray-500">Nenhuma logo configurada.</span>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSaveBranding} disabled={isSaving || !selectedUnitId} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Save className="w-4 h-4 mr-2" />
                      Salvar identificação
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg">Resumo da unidade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Unidade</p>
                    <p className="mt-2 font-semibold text-gray-900">{selectedUnit?.nome_fantasia || "Não selecionada"}</p>
                    <p className="text-sm text-gray-600 mt-1">{selectedUnit?.razao_social || "Sem razão social cadastrada"}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Configurao comercial</p>
                    <p className="mt-2 text-sm text-gray-700">{selectedUnitPricing.length} item(ns) de preco vinculado(s).</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Endereço</p>
                    <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">{formatAddressSummary(selectedUnitMeta.endereco)}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Administrador atual</p>
                    <p className="mt-2 text-sm text-gray-700">{currentUser?.full_name || currentUser?.email || "Não identificado"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog
        open={unitSelectionDialog.open}
        onOpenChange={(open) => setUnitSelectionDialog((current) => ({ ...current, open, unit: open ? current.unit : null }))}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Selecionar unidade</DialogTitle>
            <DialogDescription>
              Deseja acessar esta unidade ou adicionar a seleção?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">{unitSelectionDialog.unit?.nome_fantasia || "Unidade"}</p>
            <p className="mt-1 text-xs text-gray-500">{unitSelectionDialog.unit?.razao_social || "Dog City Brasil"}</p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setUnitSelectionDialog({ open: false, unit: null })}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={() => mergeUnitIntoSelection(unitSelectionDialog.unit?.id)}
              disabled={!selectedUnitId}
            >
              Unir
            </Button>
            <Button
              onClick={() => activateSingleUnit(unitSelectionDialog.unit?.id)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Acessar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingProfile ? "Editar perfil de acesso" : "Novo perfil de acesso"}</DialogTitle>
            <DialogDescription>
              Configure os perfis que seráo atribuídos aos usuários das unidades e da administração central.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Código</Label>
                <Input value={profileForm.codigo} onChange={(event) => setProfileForm((current) => ({ ...current, codigo: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label>Escopo</Label>
                <Select value={profileForm.escopo} onValueChange={(value) => setProfileForm((current) => ({ ...current, escopo: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Unidade</SelectItem>
                    <SelectItem value="plataforma">Administração central</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Nome</Label>
              <Input value={profileForm.nome} onChange={(event) => setProfileForm((current) => ({ ...current, nome: event.target.value }))} className="mt-2" />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea value={profileForm.descricao} onChange={(event) => setProfileForm((current) => ({ ...current, descricao: event.target.value }))} className="mt-2" rows={2} />
            </div>

            <div>
              <Label>Permissoes</Label>
              <Textarea
                value={profileForm.permissoesText}
                onChange={(event) => setProfileForm((current) => ({ ...current, permissoesText: event.target.value }))}
                className="mt-2"
                rows={6}
                placeholder={"usuarios:read\nusuarios:update\nbranding:*"}
              />
              <p className="text-xs text-gray-500 mt-2">Use uma permissao por linha ou separadas por virgula.</p>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <Switch checked={profileForm.ativo} onCheckedChange={(checked) => setProfileForm((current) => ({ ...current, ativo: checked }))} />
              <div>
                <p className="text-sm font-medium text-gray-900">Perfil ativo</p>
                <p className="text-xs text-gray-500">Perfis inativos não devem ser atribuídos a novos usuários.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveProfile} disabled={isSaving}>Salvar perfil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showUnitModal}
        onOpenChange={(open) => {
          setShowUnitModal(open);
          if (!open) {
            setEditingUnit(null);
            setUnitForm(cloneEmptyUnitForm());
          }
        }}
      >
        <DialogContent className="max-w-[920px] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Editar unidade" : "Cadastrar nova unidade"}</DialogTitle>
            <DialogDescription>
              Cadastre a ficha institucional da unidade. Os dados extras ficam vinculados ao cadastro da unidade e sustentam branding, usuários, preços e integrações por contexto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label>Nome Fantasia</Label>
                <Input
                  value={unitForm.nome_fantasia}
                  onChange={(event) => setUnitForm((current) => ({ ...current, nome_fantasia: event.target.value }))}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Razão Social</Label>
                <Input
                  value={unitForm.razao_social}
                  onChange={(event) => setUnitForm((current) => ({ ...current, razao_social: event.target.value }))}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input
                  value={unitForm.cnpj}
                  onChange={(event) => setUnitForm((current) => ({ ...current, cnpj: formatCNPJ(event.target.value) }))}
                  className="mt-2"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label>Data de abertura</Label>
                <div className="mt-2">
                  <DatePickerInput
                    value={unitForm.data_abertura}
                    onChange={(value) => setUnitForm((current) => ({ ...current, data_abertura: value }))}
                    placeholder="Selecione a data"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label>Contabilidade responsável</Label>
                <Input
                  value={unitForm.contabilidade_responsavel}
                  onChange={(event) => setUnitForm((current) => ({ ...current, contabilidade_responsavel: event.target.value }))}
                  className="mt-2"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>Telefones da contabilidade</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addAccountingPhone}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar telefone
                  </Button>
                </div>
                <div className="space-y-3">
                  {unitForm.contatos_contabilidade.telefones.map((item, index) => (
                    <div key={`phone-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1.2fr,1.2fr,1fr,auto]">
                      <Input
                        value={item.finalidade}
                        onChange={(event) => updateAccountingPhone(index, "finalidade", event.target.value)}
                        placeholder="Tipo da demanda"
                      />
                      <Input
                        value={item.telefone}
                        onChange={(event) => updateAccountingPhone(index, "telefone", formatPhone(event.target.value))}
                        placeholder="Telefone"
                        inputMode="tel"
                      />
                      <Input
                        value={item.nome}
                        onChange={(event) => updateAccountingPhone(index, "nome", event.target.value)}
                        placeholder="Nome"
                      />
                      <Button type="button" variant="outline" onClick={() => removeAccountingPhone(index)}>
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label>Emails da contabilidade</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAccountingEmail}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar email
                </Button>
              </div>
              <div className="space-y-3">
                {unitForm.contatos_contabilidade.emails.map((item, index) => (
                  <div key={`email-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[1.2fr,1.4fr,1fr,auto]">
                    <Input
                      value={item.finalidade}
                      onChange={(event) => updateAccountingEmail(index, "finalidade", event.target.value)}
                      placeholder="Tipo da demanda"
                    />
                    <Input
                      type="email"
                      value={item.email}
                      onChange={(event) => updateAccountingEmail(index, "email", event.target.value)}
                      placeholder="Email"
                    />
                    <Input
                      value={item.nome}
                      onChange={(event) => updateAccountingEmail(index, "nome", event.target.value)}
                      placeholder="Nome"
                    />
                    <Button type="button" variant="outline" onClick={() => removeAccountingEmail(index)}>
                      Remover
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-gray-200 p-4">
              <div>
                <Label>Endereço</Label>
                <p className="mt-1 text-xs text-gray-500">
                  {unitAddressLoading ? "Buscando endereço..." : "Rua, bairro, cidade e estado seráo preenchidos pelo CEP."}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={unitForm.endereco.cep}
                    onChange={(event) => updateUnitAddress("cep", formatCEP(event.target.value))}
                    className="mt-2"
                    inputMode="numeric"
                    maxLength={9}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Rua</Label>
                  <Input
                    value={unitForm.endereco.street}
                    onChange={(event) => updateUnitAddress("street", event.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Número</Label>
                  <Input
                    value={unitForm.endereco.number}
                    onChange={(event) => updateUnitAddress("number", event.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input
                    value={unitForm.endereco.neighborhood}
                    onChange={(event) => updateUnitAddress("neighborhood", event.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input
                    value={unitForm.endereco.city}
                    onChange={(event) => updateUnitAddress("city", event.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Estado</Label>
                  <Input
                    value={unitForm.endereco.state}
                    onChange={(event) => updateUnitAddress("state", event.target.value)}
                    className="mt-2"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Logo da unidade</Label>
                    <p className="mt-1 text-xs text-gray-500">Logo cadastral da unidade. O webapp usa sempre o Branding da franquia.</p>
                  </div>
                  {unitForm.logo_url ? (
                    <Button type="button" variant="ghost" onClick={() => openImageViewer(unitForm.logo_url, `Logo ${unitForm.nome_fantasia || "unidade"}`)}>
                      Ver
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="unit-logo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleUnitLogoUpload(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("unit-logo-upload")?.click()}
                    disabled={isUploadingUnitAsset}
                  >
                    <Image className="w-4 h-4 mr-2" />
                    {isUploadingUnitAsset ? "Enviando..." : "Anexar logo"}
                  </Button>
                  <span className="text-sm text-gray-500">{unitForm.logo_label || "Nenhum arquivo selecionado"}</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>Contrato social</Label>
                    <p className="mt-1 text-xs text-gray-500">O contrato social vai para o bucket privado e fica acessivel por link assinado.</p>
                  </div>
                  {unitForm.contrato_social_path ? (
                    <Button type="button" variant="ghost" onClick={() => handleOpenContract(unitForm.contrato_social_path)}>
                      Abrir
                    </Button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="unit-contract-upload"
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(event) => handleUnitContractUpload(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("unit-contract-upload")?.click()}
                    disabled={isUploadingUnitAsset}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {isUploadingUnitAsset ? "Enviando..." : "Anexar contrato"}
                  </Button>
                  <span className="text-sm text-gray-500">{unitForm.contrato_social_label || "Nenhum arquivo selecionado"}</span>
                </div>
              </div>
            </div>

            <div>
              <Label>Serviços prestados</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {SERVICE_OPTIONS.map((service) => {
                  const selected = unitForm.servicos_prestados.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      onClick={() => toggleUnitService(service)}
                      className={selected
                        ? "rounded-full border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700"
                        : "rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300"}
                    >
                      {service}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUnitModal(false);
                setEditingUnit(null);
                setUnitForm(cloneEmptyUnitForm());
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveUnit} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Salvando..." : "Salvar unidade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
