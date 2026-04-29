import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { monitorRegistration } from "@/api/functions";
import { useBranding } from "@/hooks/use-branding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { formatDisplayName, sanitizeDisplayNameInput } from "@/lib/name-format";
import { CheckCircle2, LoaderCircle, Upload, UserRound } from "lucide-react";

const EMPTY_FORM = {
  nome: "",
  nome_pai: "",
  nome_mae: "",
  cpf: "",
  data_nascimento: "",
  cep: "",
  rua: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "",
  pix_key_type: "",
  pix_key: "",
  emergency_contact_name: "",
  emergency_contact: "",
  health_issue: false,
  health_issue_description: "",
  controlled_medication: false,
};

function formatCpf(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatCep(value) {
  return String(value || "").replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
}

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function fileToAttachment(file, field) {
  if (!file) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve({
        field,
        fileName: file.name || "arquivo",
        contentType: file.type || "application/octet-stream",
        base64: result.includes(",") ? result.split(",").pop() : result,
      });
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

function validateForm(form, files) {
  const requiredFields = [
    "nome",
    "nome_pai",
    "nome_mae",
    "cpf",
    "data_nascimento",
    "cep",
    "rua",
    "numero",
    "bairro",
    "cidade",
    "estado",
    "pix_key_type",
    "pix_key",
    "emergency_contact_name",
    "emergency_contact",
  ];

  const missingField = requiredFields.find((field) => !String(form[field] || "").trim());
  if (missingField) return "Preencha todos os campos obrigatórios.";
  if (!files.profile_photo_url) return "Envie a foto de perfil.";
  if (form.health_issue && !form.health_issue_description.trim()) return "Informe qual problema de saúde o funcionário enfrenta.";
  return "";
}

export default function CadastroMonitorPublico() {
  const location = useLocation();
  const { logoUrl, appName } = useBranding();
  const token = useMemo(() => new URLSearchParams(location.search).get("token") || "", [location.search]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState({ cpf_anexo_url: null, rg_anexo_url: null, profile_photo_url: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadContext() {
      if (!token) {
        setErrorMessage("Link de cadastro inválido.");
        setIsLoading(false);
        return;
      }

      try {
        const result = await monitorRegistration({ action: "get_context", token });
        if (!mounted) return;
        setForm((current) => ({ ...current, nome: formatDisplayName(result?.provider?.nome || "") }));
      } catch (error) {
        if (mounted) setErrorMessage(error?.message || "Não foi possível carregar o cadastro.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadContext();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function fillAddressFromCep(nextCep) {
    const digits = String(nextCep || "").replace(/\D/g, "");
    if (digits.length !== 8) return;

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data?.erro) return;
      setForm((current) => ({
        ...current,
        rua: data.logradouro || current.rua,
        bairro: data.bairro || current.bairro,
        cidade: data.localidade || current.cidade,
        estado: data.uf || current.estado,
      }));
    } catch {
      // CEP manual continua liberado se a consulta falhar.
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateForm(form, files);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      const attachments = (await Promise.all([
        fileToAttachment(files.cpf_anexo_url, "cpf_anexo_url"),
        fileToAttachment(files.rg_anexo_url, "rg_anexo_url"),
        fileToAttachment(files.profile_photo_url, "profile_photo_url"),
      ])).filter(Boolean);

      await monitorRegistration({
        action: "submit",
        token,
        profile: {
          ...form,
          nome: formatDisplayName(form.nome),
          nome_pai: formatDisplayName(form.nome_pai),
          nome_mae: formatDisplayName(form.nome_mae),
          emergency_contact_name: formatDisplayName(form.emergency_contact_name),
          cpf: form.cpf.replace(/\D/g, ""),
          cep: form.cep.replace(/\D/g, ""),
        },
        attachments,
      });

      setSuccess(true);
    } catch (error) {
      setErrorMessage(error?.message || "Não foi possível enviar o cadastro.");
    }
    setIsSaving(false);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-xl border-0 shadow-lg">
          <CardContent className="p-6 text-center sm:p-8">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 text-xl font-bold text-slate-900 sm:text-2xl">Cadastro enviado</h1>
            <p className="mt-2 text-slate-600">As informações do funcionário foram salvas com sucesso.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-col items-start gap-3 sm:mb-6 sm:flex-row sm:items-center">
          {logoUrl ? <img src={logoUrl} alt={appName} className="h-12 w-12 rounded-2xl object-contain sm:h-14 sm:w-14" /> : null}
          <div>
            <p className="text-sm font-semibold text-blue-600">Dog City Brasil</p>
            <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Cadastro de funcionário</h1>
          </div>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-blue-600" />
              Ficha cadastral
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            {errorMessage ? (
              <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={form.nome}
                    onChange={(event) => setForm((current) => ({ ...current, nome: sanitizeDisplayNameInput(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, nome: formatDisplayName(current.nome) }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))} className="mt-2" placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>Nome do pai</Label>
                  <Input
                    value={form.nome_pai}
                    onChange={(event) => setForm((current) => ({ ...current, nome_pai: sanitizeDisplayNameInput(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, nome_pai: formatDisplayName(current.nome_pai) }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Nome da mãe</Label>
                  <Input
                    value={form.nome_mae}
                    onChange={(event) => setForm((current) => ({ ...current, nome_mae: sanitizeDisplayNameInput(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, nome_mae: formatDisplayName(current.nome_mae) }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Data de nascimento</Label>
                  <DatePickerInput value={form.data_nascimento} onChange={(value) => setForm((current) => ({ ...current, data_nascimento: value }))} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <h2 className="font-semibold text-slate-900">Endereço</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <div>
                    <Label>CEP</Label>
                    <Input
                      value={form.cep}
                      onChange={(event) => {
                        const nextCep = formatCep(event.target.value);
                        setForm((current) => ({ ...current, cep: nextCep }));
                        fillAddressFromCep(nextCep);
                      }}
                      className="mt-2"
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Rua</Label>
                    <Input value={form.rua} onChange={(event) => setForm((current) => ({ ...current, rua: event.target.value }))} className="mt-2" />
                  </div>
                  <div>
                    <Label>Número</Label>
                    <Input value={form.numero} onChange={(event) => setForm((current) => ({ ...current, numero: event.target.value }))} className="mt-2" />
                  </div>
                  <div>
                    <Label>Bairro</Label>
                    <Input value={form.bairro} onChange={(event) => setForm((current) => ({ ...current, bairro: event.target.value }))} className="mt-2" />
                  </div>
                  <div>
                    <Label>Cidade</Label>
                    <Input value={form.cidade} onChange={(event) => setForm((current) => ({ ...current, cidade: event.target.value }))} className="mt-2" />
                  </div>
                  <div>
                    <Label>Estado</Label>
                    <Input value={form.estado} onChange={(event) => setForm((current) => ({ ...current, estado: event.target.value.toUpperCase().slice(0, 2) }))} className="mt-2" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Tipo da chave Pix</Label>
                  <Select value={form.pix_key_type || "__none__"} onValueChange={(value) => setForm((current) => ({ ...current, pix_key_type: value === "__none__" ? "" : value }))}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Selecionar</SelectItem>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="aleatoria">Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Chave Pix</Label>
                  <Input value={form.pix_key} onChange={(event) => setForm((current) => ({ ...current, pix_key: event.target.value }))} className="mt-2" />
                </div>
                <div>
                  <Label>Nome a contatar</Label>
                  <Input
                    value={form.emergency_contact_name}
                    onChange={(event) => setForm((current) => ({ ...current, emergency_contact_name: sanitizeDisplayNameInput(event.target.value) }))}
                    onBlur={() => setForm((current) => ({ ...current, emergency_contact_name: formatDisplayName(current.emergency_contact_name) }))}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Contato de emergência</Label>
                  <Input value={form.emergency_contact} onChange={(event) => setForm((current) => ({ ...current, emergency_contact: formatPhone(event.target.value) }))} className="mt-2" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Anexo de CPF (opcional)</Label>
                  <Input type="file" accept="image/*,.pdf" onChange={(event) => setFiles((current) => ({ ...current, cpf_anexo_url: event.target.files?.[0] || null }))} className="mt-2" />
                </div>
                <div>
                  <Label>Anexo de RG (opcional)</Label>
                  <Input type="file" accept="image/*,.pdf" onChange={(event) => setFiles((current) => ({ ...current, rg_anexo_url: event.target.files?.[0] || null }))} className="mt-2" />
                </div>
                <div>
                  <Label>Foto de perfil</Label>
                  <Input type="file" accept="image/*" onChange={(event) => setFiles((current) => ({ ...current, profile_photo_url: event.target.files?.[0] || null }))} className="mt-2" />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Enfrenta algum problema de saúde?</Label>
                    <p className="text-sm text-slate-500">Se sim, informe qual abaixo.</p>
                  </div>
                  <Switch checked={form.health_issue} onCheckedChange={(checked) => setForm((current) => ({ ...current, health_issue: checked }))} />
                </div>
                {form.health_issue ? (
                  <Textarea value={form.health_issue_description} onChange={(event) => setForm((current) => ({ ...current, health_issue_description: event.target.value }))} className="mt-3" rows={3} />
                ) : null}
                <div className="mt-4 flex items-center justify-between gap-4">
                  <Label>Toma remédio controlado?</Label>
                  <Switch checked={form.controlled_medication} onCheckedChange={(checked) => setForm((current) => ({ ...current, controlled_medication: checked }))} />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving} className="w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto">
                  {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Enviar cadastro
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
