import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppAsset, AppConfig, Empresa, PerfilAcesso, TabelaPrecos, User } from "@/api/entities";
import { UploadFile } from "@/api/integrations";
import { createPageUrl, openImageViewer } from "@/utils";
import { notifyBrandingChanged } from "@/hooks/use-branding";
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
import { Building2, Image, KeyRound, Palette, Save, Settings, Tags } from "lucide-react";

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

function parsePermissions(value) {
  return (value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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

export default function AdministracaoSistema() {
  const [currentUser, setCurrentUser] = useState(null);
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [setupError, setSetupError] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [brandingForm, setBrandingForm] = useState(DEFAULT_BRANDING);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [editingProfile, setEditingProfile] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUnitPlaceholderModal, setShowUnitPlaceholderModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadData();
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

      if (!selectedUnitId) {
        const preferredUnitId = me?.empresa_id && unitRows?.some((item) => item.id === me.empresa_id)
          ? me.empresa_id
          : unitRows?.[0]?.id || "";
        setSelectedUnitId(preferredUnitId);
      }
    } catch (error) {
      console.error("Erro ao carregar administracao:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("A estrutura administrativa ainda nao existe no Supabase. Execute `supabase-schema-admin-multiempresa.sql`, `supabase-schema-cloud-config.sql` e `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O Supabase bloqueou leitura ou escrita por RLS nas tabelas administrativas. Ajuste as policies antes de continuar.");
      } else {
        setSetupError(error?.message || "Nao foi possivel carregar a administracao central.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const selectedNameConfig = configs.find((item) => item.key === "branding.company_name" && item.empresa_id === selectedUnitId)
      || configs.find((item) => item.key === "branding.company_name" && !item.empresa_id);
    const selectedLogoAsset = assets.find((item) => item.key === "branding.logo.primary" && item.empresa_id === selectedUnitId && item.ativo !== false)
      || assets.find((item) => item.key === "branding.logo.primary" && !item.empresa_id && item.ativo !== false);

    setBrandingForm({
      companyName: selectedNameConfig?.value?.text || "",
      logoUrl: selectedLogoAsset?.public_url || "",
    });
  }, [assets, configs, selectedUnitId]);

  const selectedUnit = useMemo(
    () => units.find((item) => item.id === selectedUnitId) || null,
    [units, selectedUnitId]
  );

  const selectedUnitPricing = useMemo(
    () => pricingRows.filter((item) => item.empresa_id === selectedUnitId && item.ativo !== false),
    [pricingRows, selectedUnitId]
  );

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
      setProfileForm(EMPTY_PROFILE);
      await loadData();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      alert(formatApiError(error, "Nao foi possivel salvar o perfil de acesso."));
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
      alert(formatApiError(error, "Nao foi possivel salvar o branding."));
    } finally {
      setIsSaving(false);
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
      alert(formatApiError(error, "Nao foi possivel enviar a logo."));
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
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Administracao Central</h1>
              <p className="text-sm text-gray-600 mt-1">Dog City Brasil: unidades, perfis de acesso e branding em nuvem.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger className="w-full sm:w-[260px] bg-white">
                <SelectValue placeholder="Selecionar unidade" />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.nome_fantasia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setShowUnitPlaceholderModal(true)}>
              <Building2 className="w-4 h-4 mr-2" />
              Nova unidade
            </Button>
            <Link to={createPageUrl("ConfiguracoesPrecos")}>
              <Button variant="outline">
                <Tags className="w-4 h-4 mr-2" />
                Configurar precos
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
            { label: "Branding atual", value: brandingForm.companyName ? 1 : 0, tone: "text-purple-600", border: "border-purple-200" },
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

        <Tabs defaultValue="unidades" className="space-y-6">
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
                <Button variant="outline" onClick={() => setShowUnitPlaceholderModal(true)}>
                  Cadastrar unidade
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {units.map((unit) => (
                  <div key={unit.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{unit.nome_fantasia}</p>
                          <Badge variant="outline">{unit.status || "ativa"}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{unit.razao_social || "Razao social nao cadastrada"}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          Codigo: {unit.codigo || "-"} • Slug: {unit.slug || "-"} • CNPJ: {unit.cnpj || "-"}
                        </p>
                      </div>
                      {selectedUnitId === unit.id && (
                        <Badge className="bg-blue-100 text-blue-700">Unidade selecionada</Badge>
                      )}
                    </div>
                  </div>
                ))}

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
                      <p className="text-sm text-gray-600 mt-1">{profile.descricao || "Sem descricao cadastrada."}</p>
                      <p className="text-xs text-gray-500 mt-2">Escopo: {profile.escopo === "plataforma" ? "Administracao central" : "Unidade"}</p>
                    </div>
                    <Button variant="outline" onClick={() => openProfileModal(profile)}>
                      Editar
                    </Button>
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
                    Branding por unidade
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
                    <Label>Nome exibido no webapp</Label>
                    <Input
                      value={brandingForm.companyName}
                      onChange={(event) => setBrandingForm((current) => ({ ...current, companyName: event.target.value }))}
                      className="mt-2"
                      placeholder="Dog City Brasil - Unidade"
                    />
                  </div>

                  <div>
                    <Label>Logo da unidade</Label>
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
                        {isUploading ? "Enviando..." : "Enviar logo"}
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
                      Salvar branding
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
                    <p className="mt-2 font-semibold text-gray-900">{selectedUnit?.nome_fantasia || "Nao selecionada"}</p>
                    <p className="text-sm text-gray-600 mt-1">{selectedUnit?.razao_social || "Sem razao social cadastrada"}</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Configuracao comercial</p>
                    <p className="mt-2 text-sm text-gray-700">{selectedUnitPricing.length} item(ns) de preco vinculado(s).</p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Administrador atual</p>
                    <p className="mt-2 text-sm text-gray-700">{currentUser?.full_name || currentUser?.email || "Nao identificado"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editingProfile ? "Editar perfil de acesso" : "Novo perfil de acesso"}</DialogTitle>
            <DialogDescription>
              Configure os perfis que serao atribuidos aos usuarios das unidades e da administracao central.
            </DialogDescription>
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
                    <SelectItem value="empresa">Unidade</SelectItem>
                    <SelectItem value="plataforma">Administracao central</SelectItem>
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

      <Dialog open={showUnitPlaceholderModal} onOpenChange={setShowUnitPlaceholderModal}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Cadastro de nova unidade</DialogTitle>
            <DialogDescription>
              A ficha completa de cadastro de unidade sera montada na proxima etapa.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
            A interface do botao ja foi preparada. Nesta etapa, o cadastro de novas unidades ainda nao recebe conteudo.
          </div>
          <DialogFooter>
            <Button onClick={() => setShowUnitPlaceholderModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
