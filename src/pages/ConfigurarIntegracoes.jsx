import React, { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { IntegracaoConfig, User } from "@/api/entities";
import { bancoInter, whatsappBridge } from "@/api/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { DateRangePickerInput } from "@/components/common/DateTimeInputs";
import { ACTIVE_UNIT_EVENT, getStoredUnitSelection, setStoredUnitSelection } from "@/lib/unit-context";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle,
  Download,
  Edit2,
  MessageCircle,
  Power,
  QrCode,
  RefreshCcw,
  Save,
  Settings,
  Smartphone,
  XCircle,
} from "lucide-react";

const DEFAULT_FORM = {
  client_id: "",
  client_secret: "",
  account_number: "",
  auto_sync_enabled: true,
  auto_sync_interval_minutes: 60,
  scope: "extrato.read saldo.read",
  token_url: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
  api_base_url: "https://cdpj.partners.bancointer.com.br",
};

const DEFAULT_WHATSAPP_SLOTS = [
  { slot_key: "1", connection_name: "Comercial" },
  { slot_key: "2", connection_name: "Operação" },
  { slot_key: "3", connection_name: "Monitoria" },
];

const STATUS_META = {
  idle: {
    label: "Aguardando",
    badgeClass: "bg-gray-100 text-gray-700",
    cardClass: "border-gray-200",
  },
  running: {
    label: "Sincronizando",
    badgeClass: "bg-blue-100 text-blue-700",
    cardClass: "border-blue-200",
  },
  success: {
    label: "Saudavel",
    badgeClass: "bg-green-100 text-green-700",
    cardClass: "border-green-200",
  },
  error: {
    label: "Com erro",
    badgeClass: "bg-red-100 text-red-700",
    cardClass: "border-red-200",
  },
};

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd/MM/yyyy HH:mm");
}

function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.idle;
}

function buildFormData(config) {
  if (!config) return { ...DEFAULT_FORM };

  return {
    client_id: config.credenciais?.client_id || "",
    client_secret: config.credenciais?.client_secret || "",
    account_number: config.credenciais?.account_number || "",
    auto_sync_enabled: config.auto_sync_enabled !== false,
    auto_sync_interval_minutes: config.auto_sync_interval_minutes || 60,
    scope: config.scope || DEFAULT_FORM.scope,
    token_url: config.token_url || DEFAULT_FORM.token_url,
    api_base_url: config.api_base_url || DEFAULT_FORM.api_base_url,
  };
}

function buildWhatsappConnections(configs, empresaId) {
  return DEFAULT_WHATSAPP_SLOTS.map((slot) => {
    const config = (configs || []).find((item) =>
      (item.provider || item.nome) === "whatsapp_web"
      && String(item?.config?.slot_key || "") === slot.slot_key
      && ((item.empresa_id || null) === (empresaId || null))
    );

    return {
      id: config?.id || "",
      slot_key: slot.slot_key,
      connection_name: config?.config?.connection_name || slot.connection_name,
      status: config?.config?.status || "desconectado",
      qr_code: config?.config?.last_qr_code || "",
      last_sent_at: config?.config?.last_sent_at || "",
    };
  });
}

export default function ConfigurarIntegracoes() {
  const [currentUser, setCurrentUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [configSource, setConfigSource] = useState("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [dataInicio, setDataInicio] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"));
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [certificateFiles, setCertificateFiles] = useState({
    crt: null,
    key: null,
  });
  const [whatsappConnections, setWhatsappConnections] = useState(
    DEFAULT_WHATSAPP_SLOTS.map((slot) => ({ ...slot, status: "desconectado", qr_code: "", last_sent_at: "" })),
  );
  const [whatsappLoadingSlot, setWhatsappLoadingSlot] = useState("");
  const [whatsappFeedback, setWhatsappFeedback] = useState(null);
  const [whatsappTestPhone, setWhatsappTestPhone] = useState("");
  const [whatsappTestMessage, setWhatsappTestMessage] = useState("Olá! Esta é uma validação das conexões WhatsApp da Dog City.");
  const [whatsappTestSlot, setWhatsappTestSlot] = useState("1");
  const [unitSelection, setUnitSelectionState] = useState(() => getStoredUnitSelection());

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    const handleSelectionChanged = (event) => {
      setUnitSelectionState(event?.detail || getStoredUnitSelection());
    };

    window.addEventListener(ACTIVE_UNIT_EVENT, handleSelectionChanged);
    return () => window.removeEventListener(ACTIVE_UNIT_EVENT, handleSelectionChanged);
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const me = await User.me();
      setCurrentUser(me);

      const companyId = me?.empresa_id || null;
      const configs = await IntegracaoConfig.list("-created_date", 200);
      const interConfigs = (configs || []).filter(
        (item) => (item.provider || item.nome) === "banco_inter",
      );
      const companyConfig = companyId
        ? interConfigs.find((item) => (item.empresa_id || null) === companyId)
        : null;
      const globalConfig = interConfigs.find((item) => !item.empresa_id);
      const resolvedConfig = companyConfig || globalConfig || null;

      setConfig(resolvedConfig);
      setConfigSource(companyConfig ? "empresa" : globalConfig ? "global" : "none");
      setFormData(buildFormData(resolvedConfig));
      setWhatsappConnections(buildWhatsappConnections(configs || [], companyId));
    } catch (error) {
      console.error("Erro ao carregar configuração Banco Inter:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetFiles = () => {
    setCertificateFiles({ crt: null, key: null });
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    setTestResult(null);

    try {
      let certificate_crt = config?.certificate_crt || null;
      let certificate_key = config?.certificate_key || null;

      if (certificateFiles.crt) {
        certificate_crt = await certificateFiles.crt.text();
      }
      if (certificateFiles.key) {
        certificate_key = await certificateFiles.key.text();
      }

      const companyId = currentUser?.empresa_id || null;
      const shouldCreateScopedCopy = configSource === "global" && companyId;

      const payload = {
        provider: "banco_inter",
        nome: "banco_inter",
        empresa_id: companyId,
        ativo: true,
        credenciais: {
          client_id: formData.client_id.trim(),
          client_secret: formData.client_secret.trim(),
          account_number: formData.account_number.trim(),
        },
        scope: formData.scope.trim(),
        token_url: formData.token_url.trim(),
        api_base_url: formData.api_base_url.trim(),
        auto_sync_enabled: !!formData.auto_sync_enabled,
        auto_sync_interval_minutes: Math.max(15, Number(formData.auto_sync_interval_minutes) || 60),
        sync_backfill_days: config?.sync_backfill_days || 3,
        next_sync_at: config?.next_sync_at || new Date().toISOString(),
        config: {
          account_number: formData.account_number.trim(),
          auto_sync_enabled: !!formData.auto_sync_enabled,
          auto_sync_interval_minutes: Math.max(15, Number(formData.auto_sync_interval_minutes) || 60),
          scope: formData.scope.trim(),
          token_url: formData.token_url.trim(),
          api_base_url: formData.api_base_url.trim(),
        },
        certificate_crt,
        certificate_key,
      };

      if (config && !shouldCreateScopedCopy) {
        await IntegracaoConfig.update(config.id, payload);
      } else {
        await IntegracaoConfig.create(payload);
      }

      await loadConfig();
      setIsEditing(false);
      resetFiles();
      setTestResult({
        success: true,
        message: shouldCreateScopedCopy
          ? "Configuração da empresa salva com base no padrão global."
          : "Credenciais do Banco Inter salvas com sucesso.",
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Erro ao salvar credenciais: ${error?.message || "falha desconhecida"}`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testarConexao = async () => {
    if (!config?.id) {
      setTestResult({
        success: false,
        message: "Salve a configuração antes de testar a conexão.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const data = await bancoInter({
        action: "test",
        integracao_id: config.id,
        empresa_id: currentUser?.empresa_id || config?.empresa_id || null,
      });

      setTestResult({
        success: true,
        message: data.message || "Conexão validada com sucesso.",
      });
      await loadConfig();
    } catch (error) {
      setTestResult({
        success: false,
        message: error?.message || "Erro ao testar conexão com o Banco Inter.",
        details: error?.details || null,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const importarExtrato = async () => {
    if (!config?.id) {
      setImportResult({
        success: false,
        message: "Salve a configuração antes de importar o extrato.",
      });
      return;
    }

    if (!dataInicio || !dataFim) {
      setImportResult({
        success: false,
        message: "Selecione o período para importar o extrato.",
      });
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      const data = await bancoInter({
        action: "buscarExtrato",
        integracao_id: config.id,
        empresa_id: currentUser?.empresa_id || config?.empresa_id || null,
        dataInicio,
        dataFim,
      });

      setImportResult({
        success: true,
        message: data.message || "Extrato importado com sucesso.",
        details: {
          total: data.total ?? data.received_count ?? 0,
          inseridas: data.historical_inserted_count ?? data.inseridas ?? data.imported_count ?? 0,
          atualizadasHoje: data.refreshed_today_count ?? 0,
          saldoAtual: typeof data.saldo_atual === "number" ? data.saldo_atual : null,
          de: data.from || dataInicio,
          ate: data.to || dataFim,
        },
      });
      await loadConfig();
    } catch (error) {
      setImportResult({
        success: false,
        message: error?.message || "Erro ao importar extrato.",
        details: error?.details || null,
      });
    } finally {
      setIsImporting(false);
    }
  };

  const canSave = Boolean(
    formData.client_id.trim() &&
      formData.client_secret.trim() &&
      (config?.certificate_crt || certificateFiles.crt) &&
      (config?.certificate_key || certificateFiles.key),
  );
  const canUseIntegration = Boolean(config?.id);
  const isUsingGlobalFallback = configSource === "global" && Boolean(currentUser?.empresa_id);
  const statusMeta = getStatusMeta(config?.sync_status);
  const isUnitUnionActive = (unitSelection?.selectedUnitIds || []).length > 1;

  const exitUnionMode = () => {
    const primaryUnitId = unitSelection?.primaryUnitId || currentUser?.empresa_id || "";
    if (!primaryUnitId) return;

    setStoredUnitSelection({
      primaryUnitId,
      selectedUnitIds: [primaryUnitId],
    });
  };

  const syncWhatsappSlot = async (slot, action) => {
    setWhatsappLoadingSlot(slot.slot_key);
    setWhatsappFeedback(null);

    try {
      const companyId = currentUser?.empresa_id || null;
      const existingConfigs = await IntegracaoConfig.list("-created_date", 200);
      const currentConfig = (existingConfigs || []).find((item) =>
        (item.provider || item.nome) === "whatsapp_web"
        && String(item?.config?.slot_key || "") === slot.slot_key
        && ((item.empresa_id || null) === (companyId || null))
      );

      const bridgeResult = await whatsappBridge({
        action,
        slot_key: slot.slot_key,
        connection_name: slot.connection_name,
      });

      const mergedConnection = {
        ...slot,
        status: bridgeResult?.connection?.status || slot.status,
        qr_code: bridgeResult?.connection?.last_qr_code || slot.qr_code,
        last_sent_at: bridgeResult?.connection?.last_sent_at || slot.last_sent_at,
      };

      const finalPayload = {
        provider: "whatsapp_web",
        nome: "whatsapp_web",
        empresa_id: companyId,
        ativo: true,
        config: {
          slot_key: slot.slot_key,
          connection_name: mergedConnection.connection_name,
          status: mergedConnection.status,
          last_qr_code: mergedConnection.qr_code,
          last_sent_at: mergedConnection.last_sent_at,
        },
      };

      if (currentConfig?.id) {
        await IntegracaoConfig.update(currentConfig.id, finalPayload);
      } else {
        await IntegracaoConfig.create(finalPayload);
      }

      await loadConfig();
      setWhatsappFeedback({
        success: true,
        message: action === "disconnect"
          ? `Conexão ${slot.connection_name} desconectada.`
          : `Conexão ${slot.connection_name} atualizada com sucesso.`,
      });
    } catch (error) {
      setWhatsappFeedback({
        success: false,
        message: error?.message || "Não foi possível atualizar a conexão do WhatsApp.",
      });
    } finally {
      setWhatsappLoadingSlot("");
    }
  };

  const sendWhatsappTest = async () => {
    setWhatsappLoadingSlot(`test-${whatsappTestSlot}`);
    setWhatsappFeedback(null);
    try {
      const result = await whatsappBridge({
        action: "send_message",
        slot_key: whatsappTestSlot,
        to: whatsappTestPhone,
        text: whatsappTestMessage,
      });
      await loadConfig();
      setWhatsappFeedback({
        success: true,
        message: `Mensagem de teste enviada pela conexão ${result?.connection?.connection_name || whatsappTestSlot}.`,
      });
    } catch (error) {
      setWhatsappFeedback({
        success: false,
        message: error?.message || "Não foi possível enviar a mensagem de teste.",
      });
    } finally {
      setWhatsappLoadingSlot("");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600" />
      </div>
    );
  }

  if (isUnitUnionActive) {
    return (
      <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <Card className="border-amber-200 bg-white">
            <CardHeader className="border-b bg-amber-50">
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <AlertCircle className="h-5 w-5" />
                Integrações bloqueadas na visão unificada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-gray-700">
                As integrações funcionam por unidade e podem conflitar quando duas ou mais unidades estão unidas.
                Acesse apenas uma unidade para configurar Banco Inter, credenciais e sincronizações.
              </p>
              <div className="flex flex-wrap gap-2">
                {(unitSelection?.selectedUnitIds || []).map((unitId) => (
                  <Badge key={unitId} variant="outline">{unitId}</Badge>
                ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={exitUnionMode} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Acessar apenas a unidade atual
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <Settings className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Configurar Integraes</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className={statusMeta.cardClass}>
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Status da rotina</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xl font-bold text-gray-900">{statusMeta.label}</p>
                <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Ultimo sucesso</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {formatDateTime(config?.last_success_at)}
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-200">
            <CardContent className="p-4">
              <p className="text-sm text-gray-500">Proxima execucao</p>
              <p className="mt-2 text-xl font-bold text-gray-900">
                {config?.auto_sync_enabled === false ? "Desabilitada" : formatDateTime(config?.next_sync_at)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-gray-200 bg-white mb-6">
          <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-orange-100">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm">
                  <Building2 className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Banco Inter - Extrato Bancario</CardTitle>
                  <p className="text-sm text-gray-600">OAuth + certificado + sincronizacao automatica</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {configSource === "empresa" && (
                  <Badge className="bg-blue-100 text-blue-700">Empresa</Badge>
                )}
                {configSource === "global" && (
                  <Badge className="bg-yellow-100 text-yellow-700">Global</Badge>
                )}
                <Badge className={statusMeta.badgeClass}>{statusMeta.label}</Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {isUsingGlobalFallback && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                Você está usando a configuração global como base. Ao salvar, será criada uma
                configuração própria para a empresa atual.
              </div>
            )}

            {config?.last_error_message && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5" />
                  <div>
                    <p className="font-medium">Ultimo erro da rotina</p>
                    <p className="mt-1">{config.last_error_message}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Credenciais da integrao</h3>
                  <p className="text-sm text-gray-500">
                    Configure client id, segredo e certificado mTLS do Banco Inter.
                  </p>
                </div>

                {!isEditing && config && (
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Client ID *</Label>
                  <Input
                    value={formData.client_id}
                    onChange={(event) => setFormData({ ...formData, client_id: event.target.value })}
                    disabled={config && !isEditing}
                    placeholder="ID do aplicativo no Banco Inter"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Client Secret *</Label>
                  <Input
                    type="password"
                    value={formData.client_secret}
                    onChange={(event) => setFormData({ ...formData, client_secret: event.target.value })}
                    disabled={config && !isEditing}
                    placeholder="Segredo do aplicativo no Banco Inter"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Número da conta (opcional)</Label>
                  <Input
                    value={formData.account_number}
                    onChange={(event) => setFormData({ ...formData, account_number: event.target.value })}
                    disabled={config && !isEditing}
                    placeholder="Conta sem digito"
                    className="mt-1"
                  />
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">Sincronizacao automatica</p>
                      <p className="text-xs text-gray-500">
                        A rotina em nuvem busca extrato, grava status, descarta apenas `external_id` repetido e recarrega o dia atual.
                      </p>
                    </div>

                    <Switch
                      checked={!!formData.auto_sync_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, auto_sync_enabled: checked })}
                      disabled={config && !isEditing}
                    />
                  </div>

                  <div>
                    <Label>Intervalo automatico (minutos)</Label>
                    <Input
                      type="number"
                      min="15"
                      step="15"
                      value={formData.auto_sync_interval_minutes}
                      onChange={(event) =>
                        setFormData({ ...formData, auto_sync_interval_minutes: event.target.value })
                      }
                      disabled={config && !isEditing}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Scope OAuth</Label>
                    <Input
                      value={formData.scope}
                      onChange={(event) => setFormData({ ...formData, scope: event.target.value })}
                      disabled={config && !isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Token URL</Label>
                    <Input
                      value={formData.token_url}
                      onChange={(event) => setFormData({ ...formData, token_url: event.target.value })}
                      disabled={config && !isEditing}
                      className="mt-1"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <Label>API Base URL</Label>
                    <Input
                      value={formData.api_base_url}
                      onChange={(event) => setFormData({ ...formData, api_base_url: event.target.value })}
                      disabled={config && !isEditing}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-900">Certificado digital *</h4>
                  <Badge variant="outline" className="text-xs">
                    Obrigatorio
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Arquivo .crt</Label>
                    <div className="mt-1">
                      <input
                        type="file"
                        accept=".crt,.pem"
                        onChange={(event) =>
                          setCertificateFiles({ ...certificateFiles, crt: event.target.files?.[0] || null })
                        }
                        disabled={config && !isEditing}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {(config?.certificate_crt || certificateFiles.crt) && (
                        <p className="text-xs text-green-600 mt-1">Certificado carregado</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm">Arquivo .key</Label>
                    <div className="mt-1">
                      <input
                        type="file"
                        accept=".key,.pem"
                        onChange={(event) =>
                          setCertificateFiles({ ...certificateFiles, key: event.target.files?.[0] || null })
                        }
                        disabled={config && !isEditing}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {(config?.certificate_key || certificateFiles.key) && (
                        <p className="text-xs text-green-600 mt-1">Chave privada carregada</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-700">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  Use os arquivos .crt e .key fornecidos pelo Banco Inter. Eles sao usados pela
                  Edge Function para autenticacao mTLS.
                </div>
              </div>

              {(!config || isEditing) && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveConfig}
                    disabled={isSaving || !canSave}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {isSaving ? "Salvando..." : "Salvar configuração"}
                  </Button>

                  {config && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setFormData(buildFormData(config));
                        resetFiles();
                        setTestResult(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-gray-900 mb-3">1. Testar conexão</h3>
              <Button
                onClick={testarConexao}
                disabled={isTesting || !canUseIntegration}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isTesting ? "Testando..." : "Testar conexão com Banco Inter"}
              </Button>

              {!canUseIntegration && (
                <p className="mt-2 text-xs text-gray-500">
                  Salve a configuração antes de testar a integração.
                </p>
              )}

              {testResult && (
                <div
                  className={`mt-3 p-3 rounded-lg border ${
                    testResult.success
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {testResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    )}

                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${
                          testResult.success ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {testResult.message}
                      </p>

                      {testResult.details && (
                        <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-2 rounded overflow-auto max-h-40">
                          {typeof testResult.details === "object"
                            ? JSON.stringify(testResult.details, null, 2)
                            : testResult.details}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold text-gray-900 mb-3">2. Importar extrato bancario</h3>

              <div className="mb-3">
                <Label className="text-sm">Período</Label>
                <DateRangePickerInput
                  startValue={dataInicio}
                  endValue={dataFim}
                  onStartChange={setDataInicio}
                  onEndChange={setDataFim}
                  className="mt-1"
                />
              </div>

              <Button
                onClick={importarExtrato}
                disabled={isImporting || !dataInicio || !dataFim || !canUseIntegration}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                {isImporting ? "Sincronizando..." : "Importar transações"}
              </Button>

              {importResult && (
                <div
                  className={`mt-3 p-4 rounded-lg border ${
                    importResult.success
                      ? "bg-green-50 border-green-200"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2">
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    )}

                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          importResult.success ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {importResult.message}
                      </p>

                       {importResult.success && importResult.details && (
                          <div className="mt-2 text-sm text-green-700 space-y-1">
                            <p>Total recebido: {importResult.details.total}</p>
                            <p>Novas inseridas: {importResult.details.inseridas}</p>
                            <p>Movimentações de hoje recarregadas: {importResult.details.atualizadasHoje}</p>
                            {typeof importResult.details.saldoAtual === "number" && (
                              <p>Saldo atual retornado pela API: R$ {Number(importResult.details.saldoAtual).toFixed(2)}</p>
                            )}
                            <p>
                              Período: {importResult.details.de} até {importResult.details.ate}
                            </p>
                        </div>
                      )}

                      {!importResult.success && importResult.details && (
                        <p className="mt-1 text-xs text-red-600">
                          {typeof importResult.details === "object"
                            ? JSON.stringify(importResult.details)
                            : importResult.details}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-900 mb-2">Como funciona</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Salve as credenciais e os certificados da conta Banco Inter.</li>
                <li>Teste a conexão para validar OAuth e mTLS.</li>
                <li>Importe um período manualmente sempre que precisar.</li>
                <li>A rotina automática roda no cron e atualiza status, saldo, próxima execução e logs.</li>
                <li>Ao recarregar o extrato, o dia atual e substituido pela resposta mais recente da API; datas anteriores permanecem intactas.</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white">
          <CardHeader className="border-b bg-gradient-to-r from-emerald-50 to-emerald-100">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
                <MessageCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp Web</CardTitle>
                <p className="text-sm text-gray-600">Até 3 conexões com QR Code, status e envio por conexão.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {whatsappConnections.map((slot) => (
                <Card key={slot.slot_key} className="border-gray-200">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                          <Smartphone className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{slot.connection_name}</p>
                          <p className="text-xs text-gray-500">Slot {slot.slot_key}</p>
                        </div>
                      </div>
                      <Badge className={
                        slot.status === "connected"
                          ? "bg-green-100 text-green-700"
                          : slot.status === "qr_pending"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-700"
                      }>
                        {slot.status === "connected" ? "Conectado" : slot.status === "qr_pending" ? "QR pendente" : "Desconectado"}
                      </Badge>
                    </div>

                    <div>
                      <Label>Nome da conexão</Label>
                      <Input
                        value={slot.connection_name}
                        onChange={(event) => setWhatsappConnections((current) =>
                          current.map((item) => item.slot_key === slot.slot_key ? { ...item, connection_name: event.target.value } : item)
                        )}
                        className="mt-1"
                      />
                    </div>

                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 text-center">
                      {slot.qr_code ? (
                        <img src={slot.qr_code} alt={`QR ${slot.connection_name}`} className="mx-auto h-40 w-40 rounded-xl border bg-white object-contain p-2" />
                      ) : (
                        <div className="space-y-2 py-4 text-gray-500">
                          <QrCode className="mx-auto h-8 w-8" />
                          <p className="text-sm">QR aguardando geração</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => syncWhatsappSlot(slot, "connect")}
                        disabled={Boolean(whatsappLoadingSlot)}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        {whatsappLoadingSlot === slot.slot_key ? "Gerando..." : "Gerar QR"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => syncWhatsappSlot(slot, "disconnect")}
                        disabled={Boolean(whatsappLoadingSlot)}
                      >
                        <Power className="mr-2 h-4 w-4" />
                        Desconectar
                      </Button>
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => syncWhatsappSlot(slot, "refresh_qr")}
                      disabled={Boolean(whatsappLoadingSlot)}
                      className="w-full"
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Atualizar status
                    </Button>

                    <p className="text-xs text-gray-500">
                      Último envio: {slot.last_sent_at ? formatDateTime(slot.last_sent_at) : "-"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900">Teste de envio</h3>
                <p className="text-sm text-gray-500">Escolha qual conexão deve enviar a mensagem de validação.</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Conexão</Label>
                  <select
                    value={whatsappTestSlot}
                    onChange={(event) => setWhatsappTestSlot(event.target.value)}
                    className="mt-1 flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                  >
                    {whatsappConnections.map((slot) => (
                      <option key={slot.slot_key} value={slot.slot_key}>
                        {slot.connection_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <Label>Destino</Label>
                  <Input
                    value={whatsappTestPhone}
                    onChange={(event) => setWhatsappTestPhone(event.target.value)}
                    placeholder="5511999999999"
                    className="mt-1"
                  />
                </div>

                <div className="sm:col-span-3">
                  <Label>Mensagem</Label>
                  <Input
                    value={whatsappTestMessage}
                    onChange={(event) => setWhatsappTestMessage(event.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button
                onClick={sendWhatsappTest}
                disabled={!whatsappTestPhone || !whatsappTestMessage || Boolean(whatsappLoadingSlot)}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {whatsappLoadingSlot === `test-${whatsappTestSlot}` ? "Enviando..." : "Enviar mensagem de teste"}
              </Button>

              {whatsappFeedback ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${whatsappFeedback.success ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                  {whatsappFeedback.message}
                </div>
              ) : null}

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                O envio real depende do gateway persistente do WhatsApp Web. Configure a Edge Function <strong>whatsapp-bridge</strong> com o endereço do gateway para operar as três conexões.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
