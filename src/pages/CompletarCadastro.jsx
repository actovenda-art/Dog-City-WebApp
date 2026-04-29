import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Empresa, User, UserInvite, UserProfile } from "@/api/entities";
import { CreateFileSignedUrl, UploadPrivateFile } from "@/api/integrations";
import { getSafeNextPathFromSearch, isSameAppLocation } from "@/lib/auth-navigation";
import { normalizePin, validatePin } from "@/lib/pin-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { createPageUrl, openImageViewer } from "@/utils";
import { formatDisplayName, sanitizeDisplayNameInput } from "@/lib/name-format";
import { AlertTriangle, KeyRound, LoaderCircle, Upload, UserRound } from "lucide-react";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  cpf: "",
  birth_date: "",
  cep: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  contact_nickname: "",
  emergency_contact: "",
  profile_photo_path: "",
};

function formatCPF(value) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCEP(value) {
  return (value || "").replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
}

function validateRegistrationForm(form) {
  if (
    !form.full_name
    || !form.cpf
    || !form.birth_date
    || !form.cep
    || !form.street
    || !form.number
    || !form.neighborhood
    || !form.city
    || !form.state
    || !form.contact_nickname
    || !form.emergency_contact
  ) {
    return "Preencha todos os campos obrigatórios da ficha cadastral.";
  }

  return "";
}

export default function CompletarCadastro() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => new URLSearchParams(location.search).get("invite"), [location.search]);
  const nextPath = useMemo(() => getSafeNextPathFromSearch(location.search), [location.search]);
  const [currentUser, setCurrentUser] = useState(null);
  const [invite, setInvite] = useState(null);
  const [company, setCompany] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState("");
  const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [step, setStep] = useState("profile");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isInviteFlow = !!token && !currentUser;

  useEffect(() => {
    loadContext();
  }, [token]);

  useEffect(() => {
    const cepDigits = form.cep.replace(/\D/g, "");
    if (cepDigits.length !== 8) return undefined;

    let cancelled = false;

    async function fetchAddress() {
      setAddressLoading(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await response.json();
        if (cancelled || data?.erro) return;

        setForm((current) => ({
          ...current,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || current.neighborhood,
          city: data.localidade || current.city,
          state: data.uf || current.state,
        }));
      } catch (error) {
        console.warn("Erro ao buscar CEP:", error);
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
  }, [form.cep]);

  useEffect(() => () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
  }, [localPreviewUrl]);

  async function loadContext() {
    setIsLoading(true);
    setErrorMessage("");
    setStep("profile");

    try {
      if (token) {
        const inviteContext = await User.getInviteOnboardingContext?.({ token });
        const currentInvite = inviteContext?.invite || null;
        if (!currentInvite) {
          throw new Error("Não foi possível localizar o convite.");
        }

        setCurrentUser(null);
        setInvite(currentInvite);
        setCompany(inviteContext?.empresa || null);
        setForm({
          ...EMPTY_FORM,
          full_name: currentInvite.full_name || "",
          email: currentInvite.email || "",
        });
        setPhotoPreviewUrl("");
        setPendingPhotoFile(null);
        return;
      }

      const me = await User.me();
      if (!me) {
        if (!isSameAppLocation(createPageUrl("Login"), location.pathname, location.search, location.hash)) {
          navigate(createPageUrl("Login"), { replace: true });
        }
        return;
      }

      let currentInvite = null;
      if (me.email) {
        const inviteRows = await UserInvite.filter({ email: me.email }, "-created_date", 20);
        currentInvite = (inviteRows || []).find((item) => item.status !== "concluido") || null;
      }

      let currentCompany = null;
      const companyId = currentInvite?.empresa_id || me.empresa_id || null;
      if (companyId) {
        const companyRows = await Empresa.filter({ id: companyId }, "-created_date", 1);
        currentCompany = companyRows?.[0] || null;
      }

      const initialForm = {
        ...EMPTY_FORM,
        full_name: currentInvite?.full_name || me.full_name || "",
        email: me.email || "",
        cpf: me.cpf || "",
        birth_date: me.birth_date || "",
        cep: me.cep || "",
        street: me.street || "",
        number: me.number || "",
        neighborhood: me.neighborhood || "",
        city: me.city || "",
        state: me.state || "",
        contact_nickname: me.contact_nickname || "",
        emergency_contact: me.emergency_contact || "",
        profile_photo_path: me.profile_photo_path || "",
      };

      setCurrentUser(me);
      setInvite(currentInvite);
      setCompany(currentCompany);
      setForm(initialForm);

      if (initialForm.profile_photo_path) {
        const signed = await CreateFileSignedUrl({ path: initialForm.profile_photo_path, expires: 3600 });
        setPhotoPreviewUrl(signed?.signedUrl || signed?.url || "");
      } else {
        setPhotoPreviewUrl("");
      }
    } catch (error) {
      console.error("Erro ao carregar cadastro complementar:", error);
      setErrorMessage(error?.message || "Não foi possível carregar os dados do convite.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePhotoUpload(file) {
    if (!file) return;

    if (isInviteFlow) {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setPendingPhotoFile(file);
      setLocalPreviewUrl(previewUrl);
      setPhotoPreviewUrl(previewUrl);
      return;
    }

    if (!currentUser) return;

    setIsUploading(true);
    try {
      const companyId = invite?.empresa_id || currentUser?.empresa_id || currentUser?.company_id || "plataforma";
      const safeName = `${Date.now()}_${(file.name || "arquivo").replace(/\s+/g, "_")}`;
      const path = `${companyId}/users/${currentUser.id}/profile/${safeName}`;
      const { file_key } = await UploadPrivateFile({ file, path });
      const signed = await CreateFileSignedUrl({ path: file_key, expires: 3600 });
      setForm((current) => ({ ...current, profile_photo_path: file_key }));
      setPhotoPreviewUrl(signed?.signedUrl || signed?.url || "");
    } catch (error) {
      console.error("Erro ao enviar foto de perfil:", error);
      setErrorMessage("Não foi possível enviar a foto de perfil.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleContinueToPin(event) {
    event.preventDefault();
    const validationError = validateRegistrationForm(form);

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage("");
    setStep("pin");
  }

  async function handleAuthenticatedSubmit() {
    const validationError = validateRegistrationForm(form);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!currentUser) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      const now = new Date().toISOString();
      await UserProfile.update(currentUser.id, {
        full_name: formatDisplayName(form.full_name),
        email: form.email,
        cpf: form.cpf,
        birth_date: form.birth_date,
        cep: form.cep,
        street: form.street,
        number: form.number,
        neighborhood: form.neighborhood,
        city: form.city,
        state: form.state,
        contact_nickname: formatDisplayName(form.contact_nickname),
        emergency_contact: form.emergency_contact,
        profile_photo_path: form.profile_photo_path || null,
        onboarding_status: "completo",
        onboarding_completed_at: now,
        empresa_id: currentUser.empresa_id || invite?.empresa_id || null,
        access_profile_id: currentUser.access_profile_id || invite?.access_profile_id || null,
        company_role: currentUser.company_role || invite?.company_role || null,
        is_platform_admin: currentUser.is_platform_admin ?? invite?.is_platform_admin ?? false,
      });

      if (invite?.id) {
        await UserInvite.update(invite.id, {
          status: "concluido",
          accepted_at: invite.accepted_at || now,
          onboarding_completed_at: now,
        });
      }

      if (currentUser?.pin_required_reset === true) {
        const params = new URLSearchParams();
        if (nextPath) params.set("next", nextPath);
        window.location.replace(`${createPageUrl("DefinirPin")}${params.toString() ? `?${params.toString()}` : ""}`);
        return;
      }

      window.location.replace(nextPath);
    } catch (error) {
      console.error("Erro ao concluir cadastro:", error);
      setErrorMessage(error?.message || "Não foi possível concluir o cadastro.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleInviteCompletion(event) {
    event.preventDefault();

    const validationError = validateRegistrationForm(form);
    if (validationError) {
      setErrorMessage(validationError);
      setStep("profile");
      return;
    }

    const normalizedPin = normalizePin(pin);
    const normalizedConfirmPin = normalizePin(confirmPin);
    const pinError = validatePin(normalizedPin);

    if (pinError) {
      setErrorMessage(pinError);
      return;
    }

    if (normalizedPin !== normalizedConfirmPin) {
      setErrorMessage("A confirmação não corresponde ao PIN informado.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const result = await User.completeInviteOnboarding?.({
        token,
        pin: normalizedPin,
        profile: {
          full_name: formatDisplayName(form.full_name),
          cpf: form.cpf,
          birth_date: form.birth_date,
          cep: form.cep,
          street: form.street,
          number: form.number,
          neighborhood: form.neighborhood,
          city: form.city,
          state: form.state,
          contact_nickname: formatDisplayName(form.contact_nickname),
          emergency_contact: form.emergency_contact,
        },
      });

      const sessionUser = result?.user || await User.me();

      if (pendingPhotoFile && sessionUser?.id) {
        try {
          const companyId = invite?.empresa_id || sessionUser.empresa_id || "plataforma";
          const safeName = `${Date.now()}_${(pendingPhotoFile.name || "arquivo").replace(/\s+/g, "_")}`;
          const path = `${companyId}/users/${sessionUser.id}/profile/${safeName}`;
          const { file_key } = await UploadPrivateFile({ file: pendingPhotoFile, path });
          await UserProfile.update(sessionUser.id, { profile_photo_path: file_key });
        } catch (photoError) {
          console.error("Erro ao enviar foto após concluir convite:", photoError);
          alert("Cadastro concluído, mas não foi possível enviar a foto de perfil. Você pode anexar essa foto depois, dentro do sistema.");
        }
      }

      window.location.replace(nextPath);
    } catch (error) {
      console.error("Erro ao concluir onboarding do convite:", error);
      setErrorMessage(error?.message || "Não foi possível concluir o convite.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-white">
          <LoaderCircle className="w-10 h-10 mx-auto animate-spin text-orange-400" />
          <p className="mt-4 text-sm text-slate-300">Carregando ficha de cadastro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#fff7ed,_#f8fafc_55%,_#e2e8f0)] p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <Card className="border-orange-200 bg-white/95 shadow-xl shadow-orange-100">
          <CardHeader className="space-y-3 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-500">Convite aceito</p>
                <CardTitle className="mt-2 text-xl text-slate-900 sm:text-2xl">
                  {isInviteFlow ? "Complete sua ficha e defina seu PIN" : "Complete sua ficha de cadastro"}
                </CardTitle>
                <p className="mt-2 text-sm text-slate-600">
                  {isInviteFlow
                    ? "Preencha sua ficha primeiro. Na etapa seguinte você define o PIN e o acesso será liberado automaticamente."
                    : "Seus dados básicos do convite já vieram preenchidos. Revise, complemente e salve para liberar o acesso ao sistema."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {company?.nome_fantasia && <Badge variant="outline">{company.nome_fantasia}</Badge>}
                {invite?.is_platform_admin && <Badge className="bg-slate-900 text-white">ADM do Sistema Pet</Badge>}
              </div>
            </div>

            {isInviteFlow && (
              <div className="flex items-center gap-2 border-b border-orange-100 pb-1 pt-1">
                {[
                  { id: "profile", label: "1. Ficha" },
                  { id: "pin", label: "2. PIN" },
                ].map((item, index) => (
                  <React.Fragment key={item.id}>
                    <div className={step === item.id ? "rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white" : "rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"}>
                      {item.label}
                    </div>
                    {index < 1 && <div className="h-px flex-1 bg-orange-100" />}
                  </React.Fragment>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {errorMessage && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {step === "profile" && (
              <form onSubmit={isInviteFlow ? handleContinueToPin : (event) => { event.preventDefault(); handleAuthenticatedSubmit(); }} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2">
                    <Label>Nome completo *</Label>
                    <Input
                      value={form.full_name}
                      onChange={(event) => setForm((current) => ({ ...current, full_name: sanitizeDisplayNameInput(event.target.value) }))}
                      onBlur={() => setForm((current) => ({ ...current, full_name: formatDisplayName(current.full_name) }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Email *</Label>
                    <Input value={form.email} disabled className="mt-2 bg-slate-50" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>CPF *</Label>
                    <Input
                      value={form.cpf}
                      onChange={(event) => setForm((current) => ({ ...current, cpf: formatCPF(event.target.value) }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Data de nascimento *</Label>
                    <DatePickerInput
                      value={form.birth_date}
                      onChange={(value) => setForm((current) => ({ ...current, birth_date: value }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>CEP *</Label>
                    <Input
                      value={form.cep}
                      onChange={(event) => setForm((current) => ({ ...current, cep: formatCEP(event.target.value) }))}
                      className="mt-2"
                    />
                    <p className="mt-1 text-xs text-slate-500">{addressLoading ? "Buscando endereço..." : "Rua, bairro, cidade e estado serão preenchidos pelo CEP."}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label>Rua *</Label>
                    <Input
                      value={form.street}
                      onChange={(event) => setForm((current) => ({ ...current, street: event.target.value }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Número *</Label>
                    <Input
                      value={form.number}
                      onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))}
                      className="mt-2"
                      placeholder="Informe o número"
                    />
                  </div>
                  <div>
                    <Label>Bairro *</Label>
                    <Input
                      value={form.neighborhood}
                      onChange={(event) => setForm((current) => ({ ...current, neighborhood: event.target.value }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Cidade *</Label>
                    <Input
                      value={form.city}
                      onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Estado *</Label>
                    <Input
                      value={form.state}
                      onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
                      className="mt-2"
                      maxLength={2}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <Label>Nome/Apelido do contato *</Label>
                    <Input
                      value={form.contact_nickname}
                      onChange={(event) => setForm((current) => ({ ...current, contact_nickname: sanitizeDisplayNameInput(event.target.value) }))}
                      onBlur={() => setForm((current) => ({ ...current, contact_nickname: formatDisplayName(current.contact_nickname) }))}
                      className="mt-2"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Contato de emergência *</Label>
                    <Input
                      value={form.emergency_contact}
                      onChange={(event) => setForm((current) => ({ ...current, emergency_contact: event.target.value }))}
                      className="mt-2"
                      placeholder="Nome e telefone"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <Label>Foto de perfil</Label>
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <input
                        id="invite-profile-photo"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => handlePhotoUpload(event.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById("invite-profile-photo")?.click()}
                        disabled={isUploading}
                        className="w-full sm:w-auto"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploading ? "Enviando..." : "Anexar foto"}
                      </Button>
                      {photoPreviewUrl ? (
                        <button type="button" onClick={() => openImageViewer(photoPreviewUrl, "Foto de perfil")} className="text-sm text-blue-600 hover:underline">
                          Ver foto atual
                        </button>
                      ) : (
                        <span className="text-sm text-slate-500">Nenhuma foto enviada.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center pt-2">
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <UserRound className="w-4 h-4" />
                    <span>{isInviteFlow ? "Seu acesso será liberado após a definição do PIN." : "Seu acesso será liberado após concluir esta ficha."}</span>
                  </div>
                  <Button type="submit" disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white sm:w-auto">
                    {isSaving ? "Salvando..." : (isInviteFlow ? "Continuar para definir PIN" : "Concluir cadastro")}
                  </Button>
                </div>
              </form>
            )}

            {step === "pin" && isInviteFlow && (
              <form onSubmit={handleInviteCompletion} className="space-y-6">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                  <p className="text-sm font-semibold text-orange-900">Quase pronto</p>
                  <p className="mt-1 text-sm text-orange-800">
                    Seu cadastro foi preenchido. Agora defina um PIN de 6 números para concluir o primeiro acesso.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Nova senha</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={pin}
                      onChange={(event) => setPin(normalizePin(event.target.value))}
                      className="mt-2 text-center text-lg tracking-[0.4em]"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>

                  <div>
                    <Label>Confirme</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      value={confirmPin}
                      onChange={(event) => setConfirmPin(normalizePin(event.target.value))}
                      className="mt-2 text-center text-lg tracking-[0.4em]"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <div className="flex items-start gap-2">
                    <KeyRound className="w-4 h-4 mt-0.5" />
                    <span>O PIN deve conter 6 números e não pode ser sequencial.</span>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center">
                  <Button type="button" variant="outline" onClick={() => setStep("profile")} className="w-full sm:w-auto">
                    Voltar para a ficha
                  </Button>
                  <Button type="submit" disabled={isSaving} className="w-full bg-slate-900 hover:bg-slate-800 text-white sm:w-auto">
                    {isSaving ? "Concluindo..." : "Concluir cadastro e entrar"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
