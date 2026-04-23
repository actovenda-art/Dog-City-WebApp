import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Empresa, PerfilAcesso, User, UserInvite, UserProfile, UserUnitAccess } from "@/api/entities";
import { SendEmail } from "@/api/integrations";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { AlertCircle, Building2, Check, CircleCheckBig, Copy, Mail, RotateCcw, Save, Search, Settings, Shield, Trash2, UserPlus, UserX, Users } from "lucide-react";

const EMPTY_INVITE = {
  full_name: "",
  email: "",
  empresa_id: "",
  access_profile_id: "",
  is_platform_admin: false,
};

const EMPTY_FEEDBACK_MODAL = {
  open: false,
  title: "",
  description: "",
  fieldLabel: "",
  fieldValue: "",
  note: "",
};

function formatApiError(error, fallbackMessage) {
  const details = error?.message || error?.details || error?.hint || "";
  return details ? `${fallbackMessage}\n${details}` : fallbackMessage;
}

function isMissingAdminTablesError(error) {
  return error?.code === "PGRST205" || /public\.empresa|public\.perfil_acesso|public\.user_invite|public\.user_unit_access|schema cache/i.test(error?.message || "");
}

function isRowLevelSecurityError(error) {
  return error?.code === "42501" || /row-level security policy|violates row-level security policy/i.test(error?.message || "");
}

function formatDateTime(value) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (error) {
    return value;
  }
}

function getInviteStatusMeta(status) {
  const map = {
    pendente: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
    aceito: { label: "Aguardando ficha", className: "bg-sky-100 text-sky-700" },
    concluido: { label: "Confirmado", className: "bg-emerald-100 text-emerald-700" },
    cancelado: { label: "Cancelado", className: "bg-rose-100 text-rose-700" },
  };

  return map[status] || map.pendente;
}

function getAccessStatusMeta(user) {
  if (user?.active === false) {
    return { label: "Acesso cancelado", className: "bg-rose-100 text-rose-700" };
  }

  if (user?.onboarding_status === "pendente") {
    return { label: "Aguardando ficha", className: "bg-sky-100 text-sky-700" };
  }

  return { label: "Confirmado", className: "bg-emerald-100 text-emerald-700" };
}

function buildUnitAccessMap(rows = []) {
  return (rows || []).reduce((accumulator, row) => {
    if (!row?.user_id || !row?.empresa_id || row?.ativo === false) return accumulator;

    if (!accumulator[row.user_id]) {
      accumulator[row.user_id] = [];
    }

    if (!accumulator[row.user_id].includes(row.empresa_id)) {
      accumulator[row.user_id].push(row.empresa_id);
    }

    return accumulator;
  }, {});
}

function getDraftUserAccessUnits(user, accessMap) {
  return Array.from(new Set((accessMap[user.id] || [user.empresa_id]).filter(Boolean)));
}

export default function Dev_Dashboard() {
  const [currentUser, setCurrentUser] = useState(null);
  const [units, setUnits] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [unitAccessRows, setUnitAccessRows] = useState([]);
  const [userUnitAccessMap, setUserUnitAccessMap] = useState({});
  const [setupError, setSetupError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE);
  const [feedbackModal, setFeedbackModal] = useState(EMPTY_FEEDBACK_MODAL);
  const [hasCopiedFeedbackValue, setHasCopiedFeedbackValue] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setSetupError("");

    try {
      const [me, unitRows, profileRows, userRows, inviteRows, accessRows] = await Promise.all([
        User.me(),
        Empresa.list("-created_date", 200),
        PerfilAcesso.list("-created_date", 200),
        UserProfile.list("-created_date", 500),
        UserInvite.list("-created_date", 500),
        UserUnitAccess.list("-created_date", 1000),
      ]);

      setCurrentUser(me);
      setUnits(unitRows || []);
      setProfiles(profileRows || []);
      setUsers(userRows || []);
      setInvites(inviteRows || []);
      setUnitAccessRows(accessRows || []);
      setUserUnitAccessMap(buildUnitAccessMap(accessRows || []));

      if (!selectedUnitId) {
        const preferredUnitId = me?.empresa_id && unitRows?.some((item) => item.id === me.empresa_id)
          ? me.empresa_id
          : unitRows?.[0]?.id || "";
        setSelectedUnitId(preferredUnitId);
      }
    } catch (error) {
      console.error("Erro ao carregar gestão de usuários:", error);
      if (isMissingAdminTablesError(error)) {
        setSetupError("As tabelas administrativas ainda não existem no Supabase. Execute `supabase-schema-admin-multiempresa.sql`, `supabase-schema-user-invite-onboarding.sql` e `supabase-seed-admin-config.sql`.");
      } else if (isRowLevelSecurityError(error)) {
        setSetupError("O Supabase bloqueou leitura ou escrita por RLS nas tabelas de usuários, convites ou unidades. Ajuste as policies antes de continuar.");
      } else {
        setSetupError(error?.message || "Não foi possível carregar a gestão de usuários.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  const activeProfiles = useMemo(() => profiles.filter((profile) => profile.ativo !== false), [profiles]);
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredInvites = useMemo(() => {
    return invites.filter((invite) => {
      const unit = units.find((item) => item.id === invite.empresa_id);
      const matchesUnit = invite.is_platform_admin || !selectedUnitId ? true : invite.empresa_id === selectedUnitId;
      const haystack = [invite.full_name, invite.email, unit?.nome_fantasia].filter(Boolean).join(" ").toLowerCase();
      return matchesUnit && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [invites, normalizedSearch, selectedUnitId, units]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const unit = units.find((item) => item.id === user.empresa_id);
      const draftAccessUnits = getDraftUserAccessUnits(user, userUnitAccessMap);
      const matchesUnit = user.is_platform_admin
        || !selectedUnitId
        || user.empresa_id === selectedUnitId
        || draftAccessUnits.includes(selectedUnitId);
      const haystack = [user.full_name, user.email, unit?.nome_fantasia].filter(Boolean).join(" ").toLowerCase();
      return matchesUnit && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
  }, [users, normalizedSearch, selectedUnitId, units, userUnitAccessMap]);

  const activeUsersCount = users.filter((user) => user.active !== false).length;
  const pendingInvitesCount = invites.filter((invite) => ["pendente", "aceito"].includes(invite.status || "pendente")).length;
  const confirmedUsersCount = users.filter((user) => user.active !== false && user.onboarding_status !== "pendente").length;
  const blockedUsersCount = users.filter((user) => user.active === false).length;
  const defaultSelectedUnitId = currentUser?.empresa_id && units.some((item) => item.id === currentUser.empresa_id)
    ? currentUser.empresa_id
    : units?.[0]?.id || "";

  function getUnitName(unitId) {
    if (!unitId) return "Administração Central";
    return units.find((item) => item.id === unitId)?.nome_fantasia || "Unidade não identificada";
  }

  function buildInviteLink(token) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${createPageUrl("CompletarCadastro")}?invite=${encodeURIComponent(token)}`;
  }

  function openInviteModal() {
    setInviteForm({
      ...EMPTY_INVITE,
      empresa_id: selectedUnitId || currentUser?.empresa_id || "",
    });
    setShowInviteModal(true);
  }

  function openInviteFeedbackModal({ title, description, link }) {
    setHasCopiedFeedbackValue(false);
    setFeedbackModal({
      open: true,
      title,
      description,
      fieldLabel: "Link do convite",
      fieldValue: link,
      note: "Compartilhe este link apenas com o usuário convidado. O login deve ser feito com o mesmo email do convite.",
    });
  }

  async function copyFeedbackValue() {
    if (!feedbackModal.fieldValue) return;

    try {
      await navigator.clipboard.writeText(feedbackModal.fieldValue);
      setHasCopiedFeedbackValue(true);
      window.setTimeout(() => setHasCopiedFeedbackValue(false), 2000);
    } catch (error) {
      console.error("Erro ao copiar valor do modal:", error);
      alert("Não foi possível copiar o link.");
    }
  }

  async function copyInviteLink(token) {
    try {
      await navigator.clipboard.writeText(buildInviteLink(token));
      alert("Link do convite copiado.");
    } catch (error) {
      console.error("Erro ao copiar convite:", error);
      alert("Não foi possível copiar o link.");
    }
  }

  function buildInviteEmail(invite) {
    const inviteLink = buildInviteLink(invite.token);
    const destinationLabel = invite.is_platform_admin
      ? "a administração central da Dog City Brasil"
      : `a unidade ${getUnitName(invite.empresa_id)} da Dog City Brasil`;

    return {
      inviteLink,
      subject: "Convite para acessar a Dog City Brasil",
      body: [
        `Ola, ${invite.full_name}.`,
        "",
        `Você recebeu um convite para acessar ${destinationLabel}.`,
        "Entre com o mesmo email convidado e conclua sua ficha cadastral no link abaixo:",
        inviteLink,
        "",
        "Se o login abrir em outra conta Google, troque para o email convidado antes de prosseguir.",
      ].join("\n"),
      html: [
        `<p>Ola, ${invite.full_name}.</p>`,
        `<p>Você recebeu um convite para acessar <strong>${destinationLabel}</strong>.</p>`,
        `<p><a href="${inviteLink}">Clique aqui para acessar e concluir seu cadastro</a>.</p>`,
        "<p>Use o mesmo email convidado para fazer login.</p>",
      ].join(""),
    };
  }

  async function handleSendInvite() {
    if (!inviteForm.full_name || !inviteForm.email) {
      alert("Preencha nome completo e email.");
      return;
    }

    if (!inviteForm.is_platform_admin && !inviteForm.empresa_id) {
      alert("Selecione a unidade ou marque o usuário como ADM do Sistema Pet.");
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
      const emailPayload = buildInviteEmail(createdInvite);
      const emailResult = await SendEmail({
        to: createdInvite.email,
        subject: emailPayload.subject,
        body: emailPayload.body,
        html: emailPayload.html,
      });

      setShowInviteModal(false);
      setInviteForm(EMPTY_INVITE);
      await loadData();

      if (emailResult?.provider || emailResult?.mode) {
        openInviteFeedbackModal({
          title: "Convite Enviado com Sucesso",
          description: `Convite enviado com sucesso para ${createdInvite.full_name}. Em breve se juntara a equipe!`,
          link: emailPayload.inviteLink,
        });
      } else {
        alert(`Convite criado para ${createdInvite.full_name}.`);
      }
    } catch (error) {
      console.error("Erro ao enviar convite:", error);
      alert(formatApiError(error, "Erro ao criar ou enviar convite."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResendInvite(invite) {
    setIsSaving(true);
    try {
      const emailPayload = buildInviteEmail(invite);
      await SendEmail({
        to: invite.email,
        subject: emailPayload.subject,
        body: emailPayload.body,
        html: emailPayload.html,
      });

      openInviteFeedbackModal({
        title: "Convite Reenviado com Sucesso",
        description: `Convite reenviado com sucesso para ${invite.full_name}. Em breve estara com a equipe!`,
        link: emailPayload.inviteLink,
      });
    } catch (error) {
      console.error("Erro ao reenviar convite:", error);
      alert(formatApiError(error, "Não foi possível reenviar o convite."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelInvite(invite) {
    if (!window.confirm(`Cancelar o acesso pendente de ${invite.full_name}?`)) return;

    setIsSaving(true);
    try {
      await UserInvite.update(invite.id, { status: "cancelado" });
      await loadData();
    } catch (error) {
      console.error("Erro ao cancelar convite:", error);
      alert(formatApiError(error, "Não foi possível cancelar o acesso pendente."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteInvite(invite) {
    if (!window.confirm(`Excluir o acesso pendente de ${invite.full_name}? Esta ação não pode ser desfeita.`)) return;

    setIsSaving(true);
    try {
      await UserInvite.delete(invite.id);
      await loadData();
    } catch (error) {
      console.error("Erro ao excluir convite:", error);
      alert(formatApiError(error, "Não foi possível excluir o acesso."));
    } finally {
      setIsSaving(false);
    }
  }

  function patchUserState(userId, patch) {
    setUsers((current) => current.map((item) => item.id === userId ? { ...item, ...patch } : item));
  }

  function toggleUserUnitAccess(userId, unitId) {
    setUserUnitAccessMap((current) => {
      const currentUnits = current[userId] || [];
      const nextUnits = currentUnits.includes(unitId)
        ? currentUnits.filter((item) => item !== unitId)
        : [...currentUnits, unitId];

      return {
        ...current,
        [userId]: nextUnits,
      };
    });
  }

  async function handleSaveUserAccess(user) {
    setIsSaving(true);
    try {
      const selectedUnits = user.is_platform_admin
        ? []
        : Array.from(new Set((userUnitAccessMap[user.id] || [user.empresa_id]).filter(Boolean)));
      const primaryUnitId = user.is_platform_admin ? null : (selectedUnits.includes(user.empresa_id) ? user.empresa_id : selectedUnits[0] || null);

      if (!user.is_platform_admin && !primaryUnitId) {
        alert("Selecione pelo menos uma unidade para este usuário.");
        setIsSaving(false);
        return;
      }

      await User.saveManagedUserAccess?.({
        user_id: user.id,
        primary_unit_id: primaryUnitId,
        unit_ids: selectedUnits,
        access_profile_id: user.access_profile_id || null,
        company_role: user.is_platform_admin ? "platform_admin" : (user.company_role || "company_user"),
        is_platform_admin: !!user.is_platform_admin,
        active: user.active !== false,
        clear_access: false,
      });

      await loadData();
    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      alert(formatApiError(error, "Não foi possível salvar o acesso do usuário."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCancelUserAccess(user) {
    if (!window.confirm(`Cancelar o acesso de ${user.full_name || user.email}?`)) return;

    setIsSaving(true);
    try {
      const selectedUnits = Array.from(new Set((userUnitAccessMap[user.id] || [user.empresa_id]).filter(Boolean)));
      await User.saveManagedUserAccess?.({
        user_id: user.id,
        primary_unit_id: user.empresa_id || selectedUnits[0] || null,
        unit_ids: selectedUnits,
        access_profile_id: user.access_profile_id || null,
        company_role: user.is_platform_admin ? "platform_admin" : (user.company_role || "company_user"),
        is_platform_admin: !!user.is_platform_admin,
        active: false,
        clear_access: false,
      });
      await loadData();
    } catch (error) {
      console.error("Erro ao cancelar acesso do usuário:", error);
      alert(formatApiError(error, "Não foi possível cancelar o acesso do usuário."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReactivateUserAccess(user) {
    setIsSaving(true);
    try {
      const selectedUnits = Array.from(new Set((userUnitAccessMap[user.id] || [user.empresa_id]).filter(Boolean)));
      await User.saveManagedUserAccess?.({
        user_id: user.id,
        primary_unit_id: user.empresa_id || selectedUnits[0] || null,
        unit_ids: selectedUnits,
        access_profile_id: user.access_profile_id || null,
        company_role: user.is_platform_admin ? "platform_admin" : (user.company_role || "company_user"),
        is_platform_admin: !!user.is_platform_admin,
        active: true,
        clear_access: false,
      });
      await loadData();
    } catch (error) {
      console.error("Erro ao reativar acesso do usuário:", error);
      alert(formatApiError(error, "Não foi possível reativar o acesso do usuário."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUserAccess(user) {
    if (!window.confirm(`Excluir o acesso de ${user.full_name || user.email}? O vínculo será removido da unidade e o usuário ficará sem acesso.`)) return;

    setIsSaving(true);
    try {
      await User.saveManagedUserAccess?.({
        user_id: user.id,
        primary_unit_id: null,
        unit_ids: [],
        access_profile_id: null,
        company_role: null,
        is_platform_admin: false,
        active: false,
        clear_access: true,
      });

      const relatedInvites = invites.filter((invite) => invite.email?.toLowerCase() === user.email?.toLowerCase() && invite.status !== "concluido");
      await Promise.all(relatedInvites.map((invite) => UserInvite.update(invite.id, { status: "cancelado" })));

      await loadData();
    } catch (error) {
      console.error("Erro ao excluir acesso do usuário:", error);
      alert(formatApiError(error, "Não foi possível excluir o acesso do usuário."));
    } finally {
      setIsSaving(false);
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
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestão de Usuários</h1>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link to={createPageUrl("AdministracaoSistema")}>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                Abrir administração central
              </Button>
            </Link>
            <Button onClick={openInviteModal} className="bg-blue-600 hover:bg-blue-700 text-white">
              <UserPlus className="w-4 h-4 mr-2" />
              Convidar usuário
            </Button>
          </div>
        </div>

        {setupError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {setupError}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Usuários ativos", value: activeUsersCount, tone: "text-blue-600", border: "border-blue-200" },
            { label: "Convites pendentes", value: pendingInvitesCount, tone: "text-amber-600", border: "border-amber-200" },
            { label: "Acessos confirmados", value: confirmedUsersCount, tone: "text-emerald-600", border: "border-emerald-200" },
            { label: "Acessos bloqueados", value: blockedUsersCount, tone: "text-rose-600", border: "border-rose-200" },
          ].map((stat) => (
            <Card key={stat.label} className={`bg-white ${stat.border}`}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.tone}`}>{stat.value}</p>
                </div>
                <Users className={`w-10 h-10 opacity-50 ${stat.tone}`} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="bg-white border-gray-200">
          <CardContent className="p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nome, email ou unidade..."
              hasActiveFilters={Boolean(searchTerm || (selectedUnitId && selectedUnitId !== defaultSelectedUnitId))}
              onClear={() => {
                setSearchTerm("");
                setSelectedUnitId(defaultSelectedUnitId);
              }}
              filters={[
                {
                  id: "unit",
                  label: "Unidade",
                  icon: Building2,
                  active: Boolean(selectedUnitId && selectedUnitId !== defaultSelectedUnitId),
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Unidade em foco</p>
                      <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                        <SelectTrigger className="bg-white">
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
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="bg-white border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                Convites e confirmacoes
              </CardTitle>
              <Badge variant="outline">{filteredInvites.length} registro(s)</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredInvites.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-500 text-center">
                  Nenhum convite localizado para o filtro atual.
                </div>
              )}

              {filteredInvites.map((invite) => {
                const statusMeta = getInviteStatusMeta(invite.status || "pendente");
                const canShareInvite = !["concluido", "cancelado"].includes(invite.status || "pendente");

                return (
                  <div key={invite.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{invite.full_name}</p>
                        <p className="text-sm text-gray-600">{invite.email}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {!invite.is_platform_admin && <Badge variant="outline">{getUnitName(invite.empresa_id)}</Badge>}
                          {invite.is_platform_admin && <Badge className="bg-slate-900 text-white">ADM Sistema Pet</Badge>}
                          {invite.access_profile_id && (
                            <Badge variant="outline">
                              {profiles.find((profile) => profile.id === invite.access_profile_id)?.nome || "Perfil inicial"}
                            </Badge>
                          )}
                          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        Criado em {formatDateTime(invite.invited_at || invite.created_date)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {canShareInvite && (
                        <>
                          <Button variant="outline" onClick={() => copyInviteLink(invite.token)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Copiar link
                          </Button>
                          <Button variant="outline" onClick={() => handleResendInvite(invite)} disabled={isSaving}>
                            <Mail className="w-4 h-4 mr-2" />
                            Reenviar
                          </Button>
                          <Button variant="outline" onClick={() => handleCancelInvite(invite)} disabled={isSaving}>
                            <UserX className="w-4 h-4 mr-2" />
                            Cancelar acesso
                          </Button>
                        </>
                      )}
                      <Button variant="outline" onClick={() => handleDeleteInvite(invite)} disabled={isSaving}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir acesso
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Acessos por unidade
              </CardTitle>
              <Badge variant="outline">{filteredUsers.length} usuário(s)</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredUsers.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-500 text-center">
                  Nenhum usuário localizado para o filtro atual.
                </div>
              )}

              {filteredUsers.map((user) => {
                const statusMeta = getAccessStatusMeta(user);
                const selectedAccessUnits = getDraftUserAccessUnits(user, userUnitAccessMap);

                return (
                  <div key={user.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{user.full_name || user.email}</p>
                        <p className="text-sm text-gray-600">{user.email || "Sem email cadastrado"}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {!user.is_platform_admin && user.empresa_id && <Badge variant="outline">{getUnitName(user.empresa_id)}</Badge>}
                          {user.is_platform_admin && <Badge className="bg-slate-900 text-white">ADM Sistema Pet</Badge>}
                          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        Atualizado em {formatDateTime(user.updated_date || user.created_date)}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Unidade</Label>
                        <Select
                          value={user.empresa_id || "__none__"}
                          onValueChange={(value) => {
                            const nextUnitId = value === "__none__" ? null : value;
                            patchUserState(user.id, { empresa_id: nextUnitId });
                            if (nextUnitId) {
                              setUserUnitAccessMap((current) => ({
                                ...current,
                                [user.id]: Array.from(new Set([...(current[user.id] || []), nextUnitId])),
                              }));
                            }
                          }}
                          disabled={user.is_platform_admin}
                        >
                          <SelectTrigger className="mt-2 bg-white">
                            <SelectValue placeholder="Selecionar unidade" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem unidade</SelectItem>
                            {units.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.nome_fantasia}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Perfil de acesso</Label>
                        <Select
                          value={user.access_profile_id || "__none__"}
                          onValueChange={(value) => patchUserState(user.id, { access_profile_id: value === "__none__" ? null : value })}
                        >
                          <SelectTrigger className="mt-2 bg-white">
                            <SelectValue placeholder="Selecionar perfil" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem perfil</SelectItem>
                            {activeProfiles.map((profile) => (
                              <SelectItem key={profile.id} value={profile.id}>
                                {profile.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">ADM do Sistema Pet</p>
                          <p className="text-xs text-gray-500">Acesso transversal para a administração central.</p>
                        </div>
                        <Switch
                          checked={!!user.is_platform_admin}
                          onCheckedChange={(checked) => {
                            const fallbackUnitId = selectedAccessUnits[0] || selectedUnitId || currentUser?.empresa_id || null;
                            patchUserState(user.id, {
                              is_platform_admin: checked,
                              empresa_id: checked ? null : (user.empresa_id || fallbackUnitId),
                              company_role: checked ? "platform_admin" : (user.company_role === "platform_admin" ? "company_user" : user.company_role),
                            });
                          }}
                        />
                      </div>
                    </div>

                    {!user.is_platform_admin && (
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-sm font-medium text-gray-900">Unidades com acesso</p>
                        <p className="text-xs text-gray-500 mt-1">Usuários transversais continuam vendo uma unidade por vez, mas podem alternar entre as unidades liberadas.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {units.map((unit) => {
                            const selected = selectedAccessUnits.includes(unit.id);
                            return (
                              <button
                                key={unit.id}
                                type="button"
                                onClick={() => toggleUserUnitAccess(user.id, unit.id)}
                                className={selected
                                  ? "rounded-full border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700"
                                  : "rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-gray-300"}
                              >
                                {unit.nome_fantasia}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="outline" onClick={() => handleSaveUserAccess(user)} disabled={isSaving}>
                        <Save className="w-4 h-4 mr-2" />
                        Salvar acesso
                      </Button>
                      {user.active === false ? (
                        <Button variant="outline" onClick={() => handleReactivateUserAccess(user)} disabled={isSaving}>
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Reativar acesso
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => handleCancelUserAccess(user)} disabled={isSaving}>
                          <UserX className="w-4 h-4 mr-2" />
                          Cancelar acesso
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => handleDeleteUserAccess(user)} disabled={isSaving}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Excluir acesso
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Convidar usuário</DialogTitle>
            <DialogDescription>
              Convide um usuário para uma unidade da Dog City Brasil ou para a administração central.
            </DialogDescription>
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
                  empresa_id: checked ? "" : current.empresa_id || currentUser?.empresa_id || "",
                }))}
              />
              <div>
                <p className="text-sm font-medium text-gray-900">ADM do Sistema Pet</p>
                <p className="text-xs text-gray-500">Não vincula a uma unidade específica e libera acesso transversal.</p>
              </div>
            </div>

            <div>
              <Label>Unidade a vincular</Label>
              <Select
                value={inviteForm.empresa_id || "__none__"}
                onValueChange={(value) => setInviteForm((current) => ({ ...current, empresa_id: value === "__none__" ? "" : value }))}
                disabled={inviteForm.is_platform_admin}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecionar unidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Selecionar unidade</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.nome_fantasia}
                    </SelectItem>
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
                  {activeProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
              O convite envia o link de acesso e o usuário conclui a ficha cadastral com nome, CPF, nascimento, endereço, PIX, contato de emergência e foto de perfil.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancelar</Button>
            <Button onClick={handleSendInvite} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Mail className="w-4 h-4 mr-2" />
              {isSaving ? "Enviando..." : "Enviar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={feedbackModal.open}
        onOpenChange={(open) => {
          if (!open) {
            setFeedbackModal(EMPTY_FEEDBACK_MODAL);
            setHasCopiedFeedbackValue(false);
            return;
          }

          setFeedbackModal((current) => ({ ...current, open }));
        }}
      >
        <DialogContent className="max-w-[560px] border-0 bg-white p-0 shadow-2xl">
          <div className="p-7">
            <DialogHeader className="space-y-0">
              <DialogTitle className="flex items-start gap-3 text-3xl font-semibold text-slate-900">
                <CircleCheckBig className="mt-1 h-7 w-7 text-emerald-500" />
                <span>{feedbackModal.title}</span>
              </DialogTitle>
              <DialogDescription className="sr-only">{feedbackModal.description}</DialogDescription>
            </DialogHeader>

            <p className="mt-5 text-lg text-slate-700">{feedbackModal.description}</p>

            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                <p className="text-base leading-7 text-amber-900">
                  <span className="font-semibold">Importante:</span> {feedbackModal.note}
                </p>
              </div>
            </div>

            <div className="mt-7">
              <Label className="text-2xl font-semibold text-slate-700">{feedbackModal.fieldLabel}</Label>
              <div className="relative mt-3">
                <Input
                  readOnly
                  value={feedbackModal.fieldValue}
                  className="h-16 rounded-2xl border-slate-400 bg-slate-50 pr-14 font-medium text-slate-800 shadow-none"
                />
                <button
                  type="button"
                  onClick={copyFeedbackValue}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-800"
                  aria-label="Copiar conteudo"
                >
                  {hasCopiedFeedbackValue ? <Check className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setFeedbackModal(EMPTY_FEEDBACK_MODAL);
                  setHasCopiedFeedbackValue(false);
                }}
                className="h-12 rounded-xl bg-blue-600 px-8 text-base font-semibold text-white hover:bg-blue-700"
              >
                Entendi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
