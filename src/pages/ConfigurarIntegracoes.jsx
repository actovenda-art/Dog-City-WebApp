import React, { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { IntegracaoConfig, User } from "@/api/entities";
import { bancoInter } from "@/api/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle,
  Download,
  Edit2,
  Save,
  Settings,
  XCircle,
} from "lucide-react";

const DEFAULT_FORM = {
  client_id: "",
  client_secret: "",
  account_number: "",
  auto_sync_enabled: true,
  auto_sync_interval_minutes: 60,
  scope: "extrato.read",
  token_url: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
  api_base_url: "https://cdpj.partners.bancointer.com.br",
};

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

  useEffect(() => {
    loadConfig();
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
    } catch (error) {
      console.error("Erro ao carregar configuracao Banco Inter:", error);
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
          ? "Configuracao da empresa salva com base no padrao global."
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
        message: "Salve a configuracao antes de testar a conexao.",
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
        message: data.message || "Conexao validada com sucesso.",
      });
      await loadConfig();
    } catch (error) {
      setTestResult({
        success: false,
        message: error?.message || "Erro ao testar conexao com o Banco Inter.",
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
        message: "Salve a configuracao antes de importar o extrato.",
      });
      return;
    }

    if (!dataInicio || !dataFim) {
      setImportResult({
        success: false,
        message: "Selecione o periodo para importar o extrato.",
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
          inseridas: data.inseridas ?? data.imported_count ?? 0,
          duplicadas: data.duplicadas ?? data.deduplicated_count ?? 0,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600" />
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Configurar Integracoes</h1>
            <p className="text-sm text-gray-600 mt-1">
              Banco Inter com importacao automatica de extrato, status e deduplicacao.
            </p>
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
                Voce esta usando a configuracao global como base. Ao salvar, sera criada uma
                configuracao propria para a empresa atual.
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
                  <h3 className="font-semibold text-gray-900">Credenciais da integracao</h3>
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
                  <Label>Numero da conta (opcional)</Label>
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
                        A rotina em nuvem busca extrato, grava status e ignora duplicidades.
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
                    {isSaving ? "Salvando..." : "Salvar configuracao"}
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
              <h3 className="font-semibold text-gray-900 mb-3">1. Testar conexao</h3>
              <Button
                onClick={testarConexao}
                disabled={isTesting || !canUseIntegration}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              >
                {isTesting ? "Testando..." : "Testar conexao com Banco Inter"}
              </Button>

              {!canUseIntegration && (
                <p className="mt-2 text-xs text-gray-500">
                  Salve a configuracao antes de testar a integracao.
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

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <Label className="text-sm">Data inicio</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={dataInicio}
                      onChange={(event) => setDataInicio(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm">Data fim</Label>
                  <div className="relative mt-1">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="date"
                      value={dataFim}
                      onChange={(event) => setDataFim(event.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={importarExtrato}
                disabled={isImporting || !dataInicio || !dataFim || !canUseIntegration}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                {isImporting ? "Sincronizando..." : "Importar transacoes"}
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
                            <p>Duplicadas ignoradas: {importResult.details.duplicadas}</p>
                            <p>
                              Periodo: {importResult.details.de} ate {importResult.details.ate}
                            </p>
                            {Number(importResult.details.duplicadas || 0) > 0 && (
                              <p className="font-medium">
                                Revise as suspeitas em Transacoes &gt; Duplicadas.
                              </p>
                            )}
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
                <li>Teste a conexao para validar OAuth e mTLS.</li>
                <li>Importe um periodo manualmente sempre que precisar.</li>
                <li>A rotina automatica roda no cron e atualiza status, proxima execucao e logs.</li>
                <li>Duplicidades sao ignoradas pelo identificador externo da transacao.</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white opacity-60">
          <CardHeader className="border-b bg-gray-50">
            <CardTitle className="text-lg text-gray-500">Outras integracoes</CardTitle>
          </CardHeader>
          <CardContent className="p-6 text-center">
            <p className="text-gray-500">Mais integracoes em breve...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
