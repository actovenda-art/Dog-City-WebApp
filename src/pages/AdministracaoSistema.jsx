import React, { useEffect, useMemo, useState } from "react";
import {
  AppAsset,
  AppConfig,
  Empresa,
  PerfilAcesso,
  TabelaPrecos,
  User,
  UserInvite,
  UserProfile,
} from "@/api/entities";
import { SendEmail, UploadFile } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Copy, Image, KeyRound, Link2, Mail, Palette, Save, Shield, Tags, UserPlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl, openImageViewer } from "@/utils";
import { notifyBrandingChanged } from "@/hooks/use-branding";

const EMPTY_EMPRESA = {
  codigo: "",
  nome_fantasia: "",
  razao_social: "",
  cnpj: "",
  slug: "",
  status: "ativa",
};

const EMPTY_PERFIL = {
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

const EMPTY_INVITE = {
  full_name: "",
  email: "",
  empresa_id: "",
  access_profile_id: "",
  is_platform_admin: false,
};

function slugify(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parsePermissions(value) {
  return (value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatApiError(error, fallbackMessage) {
  const details = error?.message || error?.details || error?.hint || "";
  return details ? `${fallbackMessage}\n${details}` : fallbackMessage;
}

function isMissingAdminTablesError(error) {
  return error?.code === "PGRST205" || /public\.empresa|public\.perfil_acesso|public\.user_invite|schema cache/i.test(error?.message || "");
}

function isRowLevelSecurityError(error) {
  return error?.code === "42501" || /row-level security policy|violates row-level security policy/i.test(error?.message || "");
}

export default function AdministracaoSistema() {
  const [currentUser, setCurrentUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [setupError, setSetupError] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [brandingForm, setBrandingForm] = useState(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [companyForm, setCompanyForm] = useState(EMPTY_EMPRESA);
  const [profileForm, setProfileForm] = useState(EMPTY_PERFIL);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId && companies.length > 0) {
      const preferred = currentUser?.empresa_id && companies.some((item) => item.id === currentUser.empresa_id)
        ? currentUser.empresa_id
        : companies[0].id;
      setSelectedCompanyId(preferred);
    }
  }, [companies, currentUser, selectedCompanyId]);

  useEffect(() => {
    const companyConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === selectedCompanyId)
      || configs.find((item) => item.key === "branding.company_name" && !item.empresa_id);
    const logoAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === selectedCompanyId && item.ativo !== false)
      || assets.find((item) => item.key === "branding.logo.primary" && !item.empresa_id && item.ativo !== false);

    setBrandingForm({
      companyName: companyConfig?.value?.text || "",
      logoUrl: logoAsset?.public_url || "",
    });
  }, [assets, configs, selectedCompanyId]);

  async function loadData() {
    setIsLoading(true);
    setSetupError("");
    try {
      const [me, companiesData, profilesData, usersData, invitesData, pricingData, configData, assetData] = await Promise.all([
        User.me(),
        Empresa.list("-created_date", 200),
        PerfilAcesso.list("-created_date", 200),
        UserProfile.list("-created_date", 500),
        UserInvite.list("-created_date", 500),
        TabelaPrecos.list("-created_date", 1000),
        AppConfig.list("-created_date", 500),
        AppAsset.list("-created_date", 500),
      ]);

      setCurrentUser(me);
      setCompanies(companiesData || []);
      setProfiles(profilesData || []);
      setUsers(usersData || []);
      setInvites(invitesData || []);
      setPricingRows(pricingData || []);
      setConfigs(configData || []);
      setAssets(assetData || []);
    } catch (error) {
      console.error("Erro ao carregar administracao:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("As tabelas administrativas ainda nao existem no Supabase. Execute `supabase-schema-admin-multiempresa.sql`, `supabase-schema-user-invite-onboarding.sql` e depois `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O Supabase bloqueou a leitura/escrita por RLS nas tabelas administrativas. Se o app ainda nao usa login Supabase nessa area, desabilite RLS nessas tabelas ou crie policies compativeis.");
      }
    }
    setIsLoading(false);
  }

  const selectedCompany = useMemo(
    () => companies.find((item) => item.id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const selectedCompanyPricing = useMemo(
    () => pricingRows.filter((item) => item.empresa_id === selectedCompanyId && item.ativo !== false),
    [pricingRows, selectedCompanyId]
  );

  const selectedCompanyUsers = useMemo(
    () => users.filter((item) => item.empresa_id === selectedCompanyId),
    [users, selectedCompanyId]
  );

  const selectedCompanyInvites = useMemo(() => {
    if (!selectedCompanyId) return invites;
    return invites.filter((item) => item.empresa_id === selectedCompanyId || item.is_platform_admin);
  }, [invites, selectedCompanyId]);

  function openCompanyModal(company = null) {
    setEditingCompany(company);
    setCompanyForm(company ? {
      codigo: company.codigo || "",
      nome_fantasia: company.nome_fantasia || "",
      razao_social: company.razao_social || "",
      cnpj: company.cnpj || "",
      slug: company.slug || "",
      status: company.status || "ativa",
    } : EMPTY_EMPRESA);
    setShowCompanyModal(true);
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
    } : EMPTY_PERFIL);
    setShowProfileModal(true);
  }

  function openInviteModal() {
    setInviteForm({
      ...EMPTY_INVITE,
      empresa_id: selectedCompanyId || "",
    });
    setShowInviteModal(true);
  }

  function buildInviteLink(token) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${createPageUrl("CompletarCadastro")}?invite=${encodeURIComponent(token)}`;
  }

  async function copyInviteLink(token) {
    try {
      await navigator.clipboard.writeText(buildInviteLink(token));
      alert("Link do convite copiado.");
    } catch (error) {
      console.error("Erro ao copiar convite:", error);
      alert("Nao foi possivel copiar o link.");
    }
  }

  async function handleSaveCompany() {
    if (!companyForm.nome_fantasia || !companyForm.codigo) {
      alert("Preencha codigo e nome fantasia.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...companyForm,
        codigo: companyForm.codigo.trim().toUpperCase(),
        slug: slugify(companyForm.slug || companyForm.nome_fantasia),
      };

      if (editingCompany) {
        await Empresa.update(editingCompany.id, payload);
      } else {
        await Empresa.create(payload);
      }

      setShowCompanyModal(false);
      setEditingCompany(null);
      setCompanyForm(EMPTY_EMPRESA);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar empresa:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("Nao foi possivel salvar porque a tabela `empresa` nao existe no Supabase. Execute `supabase-schema-admin-multiempresa.sql` e `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O insert em `empresa` foi bloqueado por RLS. Ajuste ou desabilite RLS para `empresa` antes de salvar empresas pelo app.");
      }
      alert(formatApiError(error, "Erro ao salvar empresa."));
    }
    setIsSaving(false);
  }

  async function handleSaveProfile() {
    if (!profileForm.codigo || !profileForm.nome) {
      alert("Preencha codigo e nome do perfil.");
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
      setProfileForm(EMPTY_PERFIL);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("Nao foi possivel salvar porque a tabela `perfil_acesso` nao existe no Supabase. Execute `supabase-schema-admin-multiempresa.sql` e `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O insert em `perfil_acesso` foi bloqueado por RLS. Ajuste ou desabilite RLS para `perfil_acesso` antes de salvar perfis.");
      }
      alert(formatApiError(error, "Erro ao salvar perfil de acesso."));
    }
    setIsSaving(false);
  }

  async function handleSaveBranding() {
    if (!selectedCompanyId || !brandingForm.companyName) {
      alert("Selecione uma empresa e informe o nome exibido.");
      return;
    }

    setIsSaving(true);
    try {
      const existingConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === selectedCompanyId);
      const payload = {
        key: "branding.company_name",
        label: "Nome da empresa",
        description: "Nome exibido no menu lateral e telas institucionais",
        value: { text: brandingForm.companyName },
        ativo: true,
        empresa_id: selectedCompanyId,
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
      alert("Erro ao salvar branding.");
    }
    setIsSaving(false);
  }

  async function handleLogoUpload(file) {
    if (!file || !selectedCompanyId) return;

    setIsUploading(true);
    try {
      const safeName = file.name.replace(/\s+/g, "-").toLowerCase();
      const path = `${selectedCompanyId}/branding/${Date.now()}-${safeName}`;
      const { file_key, file_url } = await UploadFile({ file, path });

      const existingAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === selectedCompanyId);
      const payload = {
        key: "branding.logo.primary",
        label: "Logo principal",
        bucket: "public-assets",
        storage_path: file_key,
        public_url: file_url,
        mime_type: file.type || "image/*",
        ativo: true,
        empresa_id: selectedCompanyId,
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
      alert("Erro ao enviar logo.");
    }
    setIsUploading(false);
  }

  async function handleUserAssignmentSave(user) {
    try {
      await UserProfile.update(user.id, {
        empresa_id: user.empresa_id || null,
        access_profile_id: user.access_profile_id || null,
        company_role: user.company_role || null,
        profile: user.profile || null,
        is_platform_admin: !!user.is_platform_admin,
      });
      await loadData();
      notifyBrandingChanged();
    } catch (error) {
      console.error("Erro ao atualizar usuario:", error);
      alert("Erro ao atualizar usuario.");
    }
  }

  function patchUserState(userId, patch) {
    setUsers((current) => current.map((item) => item.id === userId ? { ...item, ...patch } : item));
  }

  async function handleSendInvite() {
    if (!inviteForm.full_name || !inviteForm.email) {
      alert("Preencha nome completo e email.");
      return;
    }

    if (!inviteForm.is_platform_admin && !inviteForm.empresa_id) {
      alert("Selecione a empresa ou marque o usuario como ADM do Sistema Pet.");
      return;
    }

    setIsSaving(true);
    try {
      const token = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const invitePayload = {
        token,
        full_name: inviteForm.full_name.trim(),
        email: inviteForm.email.trim().toLowerCase(),
        empresa_id: inviteForm.is_platform_admin ? null : inviteForm.empresa_id || null,
        access_profile_id: inviteForm.access_profile_id || null,
        is_platform_admin: !!inviteForm.is_platform_admin,
        company_role: inviteForm.is_platform_admin ? "platform_admin" : "company_user",
        status: "pendente",
        invited_by_user_id: currentUser?.id || null,
        invited_at: new Date().toISOString(),
      };

      const createdInvite = await UserInvite.create(invitePayload);
      const inviteLink = buildInviteLink(createdInvite.token);
      const companyName = companies.find((item) => item.id === invitePayload.empresa_id)?.nome_fantasia || "Sistema Pet";
      const subject = "Convite para acessar o Sistema Pet";
      const body = [
        `Ola, ${invitePayload.full_name}.`,
        "",
        `Voce recebeu um convite para acessar ${companyName}.`,
        "Entre com o mesmo email convidado e complete sua ficha cadastral no link abaixo:",
        inviteLink,
        "",
        "Se o login abrir em outra conta Google, troque para o email convidado antes de prosseguir.",
      ].join("\n");

      await SendEmail({
        to: invitePayload.email,
        subject,
        body,
        html: `<p>Ola, ${invitePayload.full_name}.</p><p>Voce recebeu um convite para acessar <strong>${companyName}</strong>.</p><p><a href="${inviteLink}">Clique aqui para acessar e concluir seu cadastro</a>.</p><p>Use o mesmo email convidado para fazer login.</p>`,
      });

      setShowInviteModal(false);
      setInviteForm(EMPTY_INVITE);
      await loadData();
      alert("Convite criado. O email foi disparado pelo modo configurado no app.");
    } catch (error) {
      console.error("Erro ao enviar convite:", error);
      alert(formatApiError(error, "Erro ao criar ou enviar convite."));
    }
    setIsSaving(false);
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
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Administracao do Sistema</h1>
              <p className="text-sm text-gray-600 mt-1">Empresas, perfis de acesso, branding em nuvem e vinculo de usuarios.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
              <SelectTrigger className="w-[260px] bg-white">
                <SelectValue placeholder="Selecionar empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.nome_fantasia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Link to={createPageUrl("ConfiguracoesPrecos")}>
              <Button variant="outline">
                <Tags className="w-4 h-4 mr-2" />
                Precos
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white border-blue-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Empresas</p>
                <p className="text-2xl font-bold text-blue-600">{companies.length}</p>
              </div>
              <Building2 className="w-10 h-10 text-blue-600 opacity-60" />
            </CardContent>
          </Card>
          <Card className="bg-white border-emerald-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Perfis</p>
                <p className="text-2xl font-bold text-emerald-600">{profiles.filter((item) => item.ativo !== false).length}</p>
              </div>
              <KeyRound className="w-10 h-10 text-emerald-600 opacity-60" />
            </CardContent>
          </Card>
          <Card className="bg-white border-orange-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Usuarios da empresa</p>
                <p className="text-2xl font-bold text-orange-600">{selectedCompanyUsers.length}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedCompanyInvites.filter((item) => item.status === "pendente").length} convite(s) pendente(s)</p>
              </div>
              <Users className="w-10 h-10 text-orange-600 opacity-60" />
            </CardContent>
          </Card>
          <Card className="bg-white border-purple-200">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Itens de preco</p>
                <p className="text-2xl font-bold text-purple-600">{selectedCompanyPricing.length}</p>
              </div>
              <Tags className="w-10 h-10 text-purple-600 opacity-60" />
            </CardContent>
          </Card>
        </div>

        {setupError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-red-700">Configuracao pendente do banco</p>
              <p className="text-sm text-red-600 mt-1 whitespace-pre-line">{setupError}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="empresas" className="space-y-6">
          <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full">
            <TabsTrigger value="empresas">Empresas</TabsTrigger>
            <TabsTrigger value="acessos">Perfis de Acesso</TabsTrigger>
            <TabsTrigger value="branding">Branding Cloud</TabsTrigger>
            <TabsTrigger value="usuarios">Vinculos de Usuario</TabsTrigger>
          </TabsList>

          <TabsContent value="empresas">
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Perfis de empresa
                </CardTitle>
                <Button onClick={() => openCompanyModal()}>
                  Nova empresa
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {companies.map((company) => (
                  <div key={company.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{company.nome_fantasia}</p>
                        <Badge variant="outline">{company.status || "ativa"}</Badge>
                      </div>
                      <p className="text-sm text-gray-600">{company.razao_social || "Sem razao social cadastrada"}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Codigo: {company.codigo || "-"} • Slug: {company.slug || "-"} • CNPJ: {company.cnpj || "-"}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => openCompanyModal(company)}>
                      Editar
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acessos">
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-emerald-600" />
                  Tipos de acesso
                </CardTitle>
                <Button onClick={() => openProfileModal()}>
                  Novo perfil
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {profiles.map((profile) => (
                  <div key={profile.id} className="p-4 rounded-lg border border-gray-200 bg-gray-50 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{profile.nome}</p>
                          <Badge className={profile.ativo !== false ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}>
                            {profile.ativo !== false ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge variant="outline">{profile.escopo || "empresa"}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{profile.descricao || "Sem descricao"}</p>
                        <p className="text-xs text-gray-500 mt-1">Codigo: {profile.codigo}</p>
                      </div>
                      <Button variant="outline" onClick={() => openProfileModal(profile)}>
                        Editar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(profile.permissoes || []).map((permission) => (
                        <Badge key={permission} variant="outline" className="bg-white">
                          {permission}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="bg-white border-gray-200 xl:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="w-5 h-5 text-purple-600" />
                    Branding por empresa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Empresa</Label>
                    <Input value={selectedCompany?.nome_fantasia || ""} disabled className="bg-gray-50 mt-2" />
                  </div>
                  <div>
                    <Label>Nome exibido no app</Label>
                    <Input
                      value={brandingForm.companyName}
                      onChange={(event) => setBrandingForm((current) => ({ ...current, companyName: event.target.value }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Logo principal</Label>
                    <div className="mt-2 flex flex-col sm:flex-row gap-3 sm:items-center">
                      <input
                        id="branding-logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                      />
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById("branding-logo-upload")?.click()}
                        disabled={!selectedCompanyId || isUploading}
                      >
                        <Image className="w-4 h-4 mr-2" />
                        {isUploading ? "Enviando..." : "Enviar logo"}
                      </Button>
                      {brandingForm.logoUrl ? (
                        <button
                          type="button"
                          onClick={() => openImageViewer(brandingForm.logoUrl, "Logo da empresa")}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Ver logo atual
                        </button>
                      ) : (
                        <span className="text-sm text-gray-500">Nenhuma logo cadastrada.</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveBranding} disabled={isSaving || !selectedCompanyId}>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar branding
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-gray-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-blue-600" />
                    Configuracao ativa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Nome atual</p>
                    <p className="font-semibold text-gray-900 mt-1">{brandingForm.companyName || "Nao configurado"}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Bucket publico</p>
                    <p className="font-semibold text-gray-900 mt-1">public-assets</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Precos vinculados</p>
                    <p className="font-semibold text-gray-900 mt-1">{selectedCompanyPricing.length} registros</p>
                    <p className="text-sm text-gray-500 mt-2">Hospedagem base: {formatCurrency(selectedCompanyPricing.find((item) => item.config_key === "diaria_normal")?.valor)}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="usuarios">
            <Card className="bg-white border-gray-200">
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-600" />
                  Empresa e acesso por usuario
                </CardTitle>
                <Button onClick={openInviteModal}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convidar usuario
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                  <div className="flex items-center gap-2 text-orange-700">
                    <Mail className="w-4 h-4" />
                    <p className="font-medium">Convites pendentes</p>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedCompanyInvites.filter((item) => item.status !== "concluido").slice(0, 6).map((invite) => {
                      const inviteCompany = companies.find((item) => item.id === invite.empresa_id);
                      const inviteLink = buildInviteLink(invite.token);
                      return (
                        <div key={invite.id} className="rounded-lg border border-orange-100 bg-white p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{invite.full_name}</p>
                            <p className="text-sm text-gray-600">{invite.email}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {inviteCompany?.nome_fantasia && <Badge variant="outline">{inviteCompany.nome_fantasia}</Badge>}
                              {invite.is_platform_admin && <Badge className="bg-slate-900 text-white">ADM Sistema Pet</Badge>}
                              <Badge className="bg-orange-100 text-orange-700">{invite.status || "pendente"}</Badge>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => copyInviteLink(invite.token)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Copiar link
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => SendEmail({
                                to: invite.email,
                                subject: "Reenvio do convite para o Sistema Pet",
                                body: `Ola, ${invite.full_name}.\n\nUse este link para acessar e concluir seu cadastro:\n${inviteLink}`,
                                html: `<p>Ola, ${invite.full_name}.</p><p>Use este link para concluir seu cadastro:</p><p><a href="${inviteLink}">${inviteLink}</a></p>`,
                              }).then(() => alert("Reenvio iniciado pelo modo configurado no app.")).catch((error) => {
                                console.error("Erro ao reenviar convite:", error);
                                alert(formatApiError(error, "Nao foi possivel reenviar o convite."));
                              })}
                            >
                              <Mail className="w-4 h-4 mr-2" />
                              Reenviar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {selectedCompanyInvites.filter((item) => item.status !== "concluido").length === 0 && (
                      <p className="text-sm text-gray-600">Nenhum convite pendente para a empresa selecionada.</p>
                    )}
                  </div>
                </div>

                {users.map((user) => (
                  <div key={user.id} className="rounded-lg border border-gray-200 p-4 bg-gray-50 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{user.full_name || user.email}</p>
                        <p className="text-sm text-gray-600">{user.email || "Sem email"}</p>
                      </div>
                      <Badge variant="outline">{user.profile || "sem perfil legado"}</Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                      <div>
                        <Label>Empresa</Label>
                        <Select value={user.empresa_id || "__none__"} onValueChange={(value) => patchUserState(user.id, { empresa_id: value === "__none__" ? null : value })}>
                          <SelectTrigger className="mt-2 bg-white">
                            <SelectValue placeholder="Selecionar empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem empresa</SelectItem>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>{company.nome_fantasia}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Perfil de acesso</Label>
                        <Select value={user.access_profile_id || "__none__"} onValueChange={(value) => patchUserState(user.id, { access_profile_id: value === "__none__" ? null : value })}>
                          <SelectTrigger className="mt-2 bg-white">
                            <SelectValue placeholder="Selecionar perfil" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem perfil</SelectItem>
                            {profiles.filter((profile) => profile.ativo !== false).map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>{profile.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Perfil legado</Label>
                        <Input
                          className="mt-2 bg-white"
                          value={user.profile || ""}
                          onChange={(event) => patchUserState(user.id, { profile: event.target.value })}
                        />
                      </div>

                      <div className="flex items-end gap-3">
                        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-900">Admin da plataforma</p>
                              <p className="text-xs text-gray-500">Acesso transversal entre empresas.</p>
                            </div>
                            <Switch
                              checked={!!user.is_platform_admin}
                              onCheckedChange={(checked) => patchUserState(user.id, { is_platform_admin: checked })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button variant="outline" onClick={() => handleUserAssignmentSave(user)}>
                        Salvar vinculo
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={showCompanyModal} onOpenChange={setShowCompanyModal}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{editingCompany ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Codigo</Label>
              <Input value={companyForm.codigo} onChange={(event) => setCompanyForm((current) => ({ ...current, codigo: event.target.value.toUpperCase() }))} className="mt-2" />
            </div>
            <div>
              <Label>Nome fantasia</Label>
              <Input value={companyForm.nome_fantasia} onChange={(event) => setCompanyForm((current) => ({ ...current, nome_fantasia: event.target.value }))} className="mt-2" />
            </div>
            <div>
              <Label>Razao social</Label>
              <Input value={companyForm.razao_social} onChange={(event) => setCompanyForm((current) => ({ ...current, razao_social: event.target.value }))} className="mt-2" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>CNPJ</Label>
                <Input value={companyForm.cnpj} onChange={(event) => setCompanyForm((current) => ({ ...current, cnpj: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={companyForm.slug} onChange={(event) => setCompanyForm((current) => ({ ...current, slug: event.target.value }))} className="mt-2" />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={companyForm.status} onValueChange={(value) => setCompanyForm((current) => ({ ...current, status: value }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="implantacao">Implantacao</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompanyModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveCompany} disabled={isSaving}>Salvar empresa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingProfile ? "Editar perfil de acesso" : "Novo perfil de acesso"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Codigo</Label>
                <Input value={profileForm.codigo} onChange={(event) => setProfileForm((current) => ({ ...current, codigo: event.target.value }))} className="mt-2" />
              </div>
              <div>
                <Label>Escopo</Label>
                <Select value={profileForm.escopo} onValueChange={(value) => setProfileForm((current) => ({ ...current, escopo: value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Empresa</SelectItem>
                    <SelectItem value="plataforma">Plataforma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={profileForm.nome} onChange={(event) => setProfileForm((current) => ({ ...current, nome: event.target.value }))} className="mt-2" />
            </div>
            <div>
              <Label>Descricao</Label>
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
                <p className="text-xs text-gray-500">Perfis inativos nao devem ser atribuidos a novos usuarios.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveProfile} disabled={isSaving}>Salvar perfil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Convidar usuario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={inviteForm.full_name}
                onChange={(event) => setInviteForm((current) => ({ ...current, full_name: event.target.value }))}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(event) => setInviteForm((current) => ({ ...current, email: event.target.value }))}
                className="mt-2"
              />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-3">
              <Switch
                checked={inviteForm.is_platform_admin}
                onCheckedChange={(checked) => setInviteForm((current) => ({
                  ...current,
                  is_platform_admin: checked,
                  empresa_id: checked ? "" : current.empresa_id || selectedCompanyId || "",
                }))}
              />
              <div>
                <p className="text-sm font-medium text-gray-900">ADM do Sistema Pet</p>
                <p className="text-xs text-gray-500">Nao vincula a uma empresa especifica e libera acesso transversal.</p>
              </div>
            </div>
            <div>
              <Label>Empresa a vincular</Label>
              <Select
                value={inviteForm.empresa_id || "__none__"}
                onValueChange={(value) => setInviteForm((current) => ({ ...current, empresa_id: value === "__none__" ? "" : value }))}
                disabled={inviteForm.is_platform_admin}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecionar empresa</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.nome_fantasia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de acesso</Label>
              <Select
                value={inviteForm.access_profile_id || "__none__"}
                onValueChange={(value) => setInviteForm((current) => ({ ...current, access_profile_id: value === "__none__" ? "" : value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecionar perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem perfil inicial</SelectItem>
                  {profiles.filter((profile) => profile.ativo !== false).map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>{profile.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              O convite envia o link de acesso e o usuario conclui a ficha cadastral com nome, CPF, data de nascimento, endereco, PIX, contato de emergencia e foto de perfil.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancelar</Button>
            <Button onClick={handleSendInvite} disabled={isSaving}>
              <Mail className="w-4 h-4 mr-2" />
              {isSaving ? "Enviando..." : "Enviar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
