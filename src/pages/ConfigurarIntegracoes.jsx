import React, { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import LoadingScreen from "@/components/layout/LoadingScreen";
import { IntegracaoConfig, User } from "@/api/entities";
import { bancoInter, whatsappBridge } from "@/api/functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
  ShieldCheck,
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
  pix_read_scope: "pix.read",
  pix_payment_read_scope: "pagamento-pix.read",
  boleto_payment_read_scope: "pagamento-boleto.read",
  charge_read_scope: "boleto-cobranca.read",
  charge_write_scope: "boleto-cobranca.write",
  receipt_pdf_enabled: false,
  receipt_pdf_scope: "extrato.read",
  receipt_pdf_path_templates: "",
  token_url: "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
  api_base_url: "https://cdpj.partners.bancointer.com.br",
};

const INTER_SCOPE_FIELDS = [
  { key: "scope", label: "Extrato e saldo", description: "Sincronização bancária e saldo atual." },
  { key: "pix_read_scope", label: "Pix recebidos", description: "Detalhes de Pix creditados na conta." },
  { key: "pix_payment_read_scope", label: "Pagamentos Pix", description: "Consulta de Pix enviados pela conta." },
  { key: "boleto_payment_read_scope", label: "Pagamentos de boletos", description: "Consulta de boletos pagos pela conta." },
  { key: "charge_read_scope", label: "Cobranças emitidas", description: "Consulta, status e PDF de cobranças." },
  { key: "charge_write_scope", label: "Emissão de cobranças", description: "Emissão e manutenção de cobranças." },
];

const CAPABILITY_STATUS_META = {
  available: { label: "Disponível", className: "bg-green-100 text-green-700" },
  configuration_required: { label: "Configurar", className: "bg-amber-100 text-amber-700" },
  rate_limited: { label: "Limite temporario", className: "bg-amber-100 text-amber-700" },
  not_tested: { label: "Não testado", className: "bg-gray-100 text-gray-600" },
  unavailable: { label: "Sem permissão", className: "bg-red-100 text-red-700" },
  error: { label: "Com erro", className: "bg-red-100 text-red-700" },
};

const DEFAULT_WHATSAPP_SLOTS = [
  { slot_key: "1", connection_name: "Comercial" },
  { slot_key: "2", connection_name: "Operação" },
  { slot_key: "3", connection_name: "Monitoria" },
];

const WHATSAPP_QR_STATUSES = ["starting", "authenticated", "qr_pending"];

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

function normalizeWhatsappStatus(status) {
  const rawStatus = String(status || "").trim().toLowerCase();
  if (!rawStatus || rawStatus === "idle" || rawStatus === "disconnected") return "desconectado";
  if (rawStatus === "connected") return "connected";
  if (rawStatus === "error") return "error";
  if (WHATSAPP_QR_STATUSES.includes(rawStatus)) return rawStatus;
  return rawStatus;
}

function shouldKeepWhatsappQr(status) {
  return WHATSAPP_QR_STATUSES.includes(normalizeWhatsappStatus(status));
}

function getWhatsappStatusView(status) {
  const normalizedStatus = normalizeWhatsappStatus(status);

  if (normalizedStatus === "connected") {
    return {
      key: normalizedStatus,
      label: "Conectado",
      badgeClass: "bg-green-100 text-green-700",
    };
  }

  if (WHATSAPP_QR_STATUSES.includes(normalizedStatus)) {
    return {
      key: normalizedStatus,
      label: normalizedStatus === "qr_pending" ? "QR pronto" : "Conectando",
      badgeClass: "bg-amber-100 text-amber-700",
    };
  }

  if (normalizedStatus === "error") {
    return {
      key: normalizedStatus,
      label: "Com erro",
      badgeClass: "bg-red-100 text-red-700",
    };
  }

  return {
    key: "desconectado",
    label: "Desconectado",
    badgeClass: "bg-gray-100 text-gray-700",
  };
}

function buildFormData(config) {
  if (!config) return { ...DEFAULT_FORM };

  const storedConfig = config.config && typeof config.config === "object" ? config.config : {};
  const storedValue = (key, fallback) => storedConfig[key] ?? config[key] ?? fallback;

  return {
    client_id: config.credenciais?.client_id || "",
    client_secret: config.credenciais?.client_secret || "",
    account_number: config.credenciais?.account_number || "",
    auto_sync_enabled: config.auto_sync_enabled !== false,
    auto_sync_interval_minutes: config.auto_sync_interval_minutes || 60,
    scope: storedValue("scope", DEFAULT_FORM.scope),
    pix_read_scope: storedValue("pix_read_scope", DEFAULT_FORM.pix_read_scope),
    pix_payment_read_scope: storedValue("pix_payment_read_scope", DEFAULT_FORM.pix_payment_read_scope),
    boleto_payment_read_scope: storedValue("boleto_payment_read_scope", DEFAULT_FORM.boleto_payment_read_scope),
    charge_read_scope: storedValue("charge_read_scope", DEFAULT_FORM.charge_read_scope),
    charge_write_scope: storedValue("charge_write_scope", DEFAULT_FORM.charge_write_scope),
    receipt_pdf_enabled: storedValue("receipt_pdf_enabled", DEFAULT_FORM.receipt_pdf_enabled) === true,
    receipt_pdf_scope: storedValue("receipt_pdf_scope", DEFAULT_FORM.receipt_pdf_scope),
    receipt_pdf_path_templates: storedValue("receipt_pdf_path_templates", DEFAULT_FORM.receipt_pdf_path_templates),
    token_url: config.token_url || DEFAULT_FORM.token_url,
    api_base_url: config.api_base_url || DEFAULT_FORM.api_base_url,
  };
}

function buildWhatsappConnections(configs, empresaId) {
  const config = (configs || []).find((item) =>
    (item.provider || item.nome) === "whatsapp_web"
    && ((item.empresa_id || null) === (empresaId || null))
  );
  const storedConnections = Array.isArray(config?.config?.connections) ? config.config.connections : [];

  return DEFAULT_WHATSAPP_SLOTS.map((slot) => {
    const storedSlot = storedConnections.find((item) => String(item?.slot_key || "") === String(slot.slot_key));
    const storedStatus = normalizeWhatsappStatus(storedSlot?.status || config?.config?.status || "desconectado");

    return {
      id: config?.id || "",
      slot_key: slot.slot_key,
      connection_name: storedSlot?.connection_name || config?.config?.connection_name || slot.connection_name,
      status: storedStatus,
      qr_code: shouldKeepWhatsappQr(storedStatus)
        ? storedSlot?.last_qr_code || config?.config?.last_qr_code || ""
        : "",
      last_sent_at: storedSlot?.last_sent_at || config?.config?.last_sent_at || "",
    };
  });
}

function mergeWhatsappConnections(baseConnections, liveConnections = []) {
  return (baseConnections || []).map((slot) => {
    const live = (liveConnections || []).find((item) => String(item?.slot_key || "") === String(slot.slot_key));
    if (!live) return slot;
    const liveStatus = normalizeWhatsappStatus(live.status || slot.status);
    return {
      ...slot,
      id: live.id || slot.id || "",
      connection_name: live.connection_name || slot.connection_name,
      status: liveStatus,
      qr_code: shouldKeepWhatsappQr(liveStatus) ? live.last_qr_code || slot.qr_code || "" : "",
      last_sent_at: live.last_sent_at || slot.last_sent_at || "",
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
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [capabilityResult, setCapabilityResult] = useState(null);
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
    const needsLiveRefresh = whatsappConnections.some((slot) => WHATSAPP_QR_STATUSES.includes(normalizeWhatsappStatus(slot.status)));
    if (!needsLiveRefresh) return undefined;

    const timer = window.setInterval(() => {
      refreshWhatsappConnections();
    }, 3500);

    return () => window.clearInterval(timer);
  }, [whatsappConnections]);

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
      const baseConnections = buildWhatsappConnections(configs || [], companyId);
      setWhatsappConnections(baseConnections);
      await refreshWhatsappConnections(baseConnections);
    } catch (error) {
      console.error("Erro ao carregar configuração Banco Inter:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshWhatsappConnections = async (baseConnectionsOverride = null) => {
    try {
      const bridgeResult = await whatsappBridge({ action: "list_connections" });
      setWhatsappConnections((current) =>
        mergeWhatsappConnections(baseConnectionsOverride || current, bridgeResult?.connections || []),
      );
    } catch (error) {
      console.error("Erro ao consultar conexÃµes ativas do WhatsApp:", error);
    }
  };

  const persistWhatsappConnection = async (slot, companyId) => {
    let currentConfig = slot?.id ? { id: slot.id } : null;

    if (!currentConfig?.id) {
      const existingConfigs = await IntegracaoConfig.list("-created_date", 200);
      currentConfig = (existingConfigs || []).find((item) =>
        (item.provider || item.nome) === "whatsapp_web"
        && ((item.empresa_id || null) === (companyId || null))
      );
    }

    const currentConnections = whatsappConnections.map((item) =>
      String(item.slot_key) === String(slot.slot_key)
        ? {
            slot_key: String(slot.slot_key),
            connection_name: slot.connection_name,
            status: slot.status,
            last_qr_code: slot.qr_code || "",
            last_sent_at: slot.last_sent_at || "",
          }
        : {
            slot_key: String(item.slot_key),
            connection_name: item.connection_name,
            status: item.status,
            last_qr_code: item.qr_code || "",
            last_sent_at: item.last_sent_at || "",
          },
    );

    const finalPayload = {
      provider: "whatsapp_web",
      nome: "whatsapp_web",
      empresa_id: companyId,
      ativo: true,
      config: {
        connections: currentConnections,
      },
    };

    if (currentConfig?.id) {
      await IntegracaoConfig.update(currentConfig.id, finalPayload);
      return;
    }

    try {
      await IntegracaoConfig.create(finalPayload);
    } catch (error) {
      if (String(error?.message || "").includes("409")) {
        const existingConfigs = await IntegracaoConfig.list("-created_date", 200);
        const duplicateConfig = (existingConfigs || []).find((item) =>
          (item.provider || item.nome) === "whatsapp_web"
          && ((item.empresa_id || null) === (companyId || null))
        );
        if (duplicateConfig?.id) {
          await IntegracaoConfig.update(duplicateConfig.id, finalPayload);
          return;
        }
      }
      throw error;
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
          ...(config?.config && typeof config.config === "object" ? config.config : {}),
          account_number: formData.account_number.trim(),
          auto_sync_enabled: !!formData.auto_sync_enabled,
          auto_sync_interval_minutes: Math.max(15, Number(formData.auto_sync_interval_minutes) || 60),
          scope: formData.scope.trim(),
          pix_read_scope: formData.pix_read_scope.trim(),
          pix_payment_read_scope: formData.pix_payment_read_scope.trim(),
          boleto_payment_read_scope: formData.boleto_payment_read_scope.trim(),
          charge_read_scope: formData.charge_read_scope.trim(),
          charge_write_scope: formData.charge_write_scope.trim(),
          receipt_pdf_enabled: !!formData.receipt_pdf_enabled,
          receipt_pdf_scope: formData.receipt_pdf_scope.trim(),
          receipt_pdf_path_templates: formData.receipt_pdf_path_templates.trim(),
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
      setCapabilityResult(null);
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

  const diagnosticarPermissoes = async () => {
    if (!config?.id) {
      setCapabilityResult({
        success: false,
        message: "Salve a configuração antes de diagnosticar as permissões.",
        capabilities: [],
      });
      return;
    }

    setIsDiagnosing(true);
    setCapabilityResult(null);

    try {
      const data = await bancoInter({
        action: "diagnoseCapabilities",
        integracao_id: config.id,
        empresa_id: currentUser?.empresa_id || config?.empresa_id || null,
      });
      setCapabilityResult(data);
    } catch (error) {
      setCapabilityResult({
        success: false,
        message: error?.message || "Erro ao diagnosticar permissões do Banco Inter.",
        capabilities: [],
      });
    } finally {
      setIsDiagnosing(false);
    }
  };

  const syncWhatsappSlot = async (slot, action) => {
    setWhatsappLoadingSlot(slot.slot_key);
    setWhatsappFeedback(null);

    try {
      const companyId = currentUser?.empresa_id || null;
      const bridgeResult = await whatsappBridge({
        action,
        slot_key: slot.slot_key,
        connection_name: slot.connection_name,
      });
      const nextStatus = normalizeWhatsappStatus(bridgeResult?.connection?.status || slot.status);

      const mergedConnection = {
        ...slot,
        status: nextStatus,
        qr_code: shouldKeepWhatsappQr(nextStatus)
          ? bridgeResult?.connection?.last_qr_code || ""
          : "",
        last_sent_at: bridgeResult?.connection?.last_sent_at || slot.last_sent_at,
      };

      setWhatsappConnections((current) =>
        current.map((item) => item.slot_key === slot.slot_key ? mergedConnection : item),
      );
      await persistWhatsappConnection(mergedConnection, companyId);
      await refreshWhatsappConnections();
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
    return <LoadingScreen />;
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
                        A rotina em nuvem busca extrato, grava status, descarta apenas `id` repetido e recarrega o dia atual.
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

                <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-blue-700" />
                      <p className="font-medium text-gray-900">Permissões da API</p>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      Cada recurso usa seu próprio scope. Isso permite trocar a aplicação do Inter sem alterar o código.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {INTER_SCOPE_FIELDS.map((field) => (
                      <div key={field.key} className="rounded-lg border border-blue-100 bg-white p-3">
                        <Label>{field.label}</Label>
                        <p className="mt-0.5 text-xs text-gray-500">{field.description}</p>
                        <Input
                          value={formData[field.key]}
                          onChange={(event) => setFormData({ ...formData, [field.key]: event.target.value })}
                          disabled={config && !isEditing}
                          className="mt-2"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">Comprovante individual oficial</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Habilite ao trocar para uma API com essa permissão e informe o endpoint publicado no contrato do Inter.
                      </p>
                    </div>
                    <Switch
                      checked={!!formData.receipt_pdf_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, receipt_pdf_enabled: checked })}
                      disabled={config && !isEditing}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Scope do comprovante</Label>
                      <Input
                        value={formData.receipt_pdf_scope}
                        onChange={(event) => setFormData({ ...formData, receipt_pdf_scope: event.target.value })}
                        disabled={(config && !isEditing) || !formData.receipt_pdf_enabled}
                        className="mt-1"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <Label>Endpoints do comprovante</Label>
                      <Textarea
                        value={formData.receipt_pdf_path_templates}
                        onChange={(event) => setFormData({ ...formData, receipt_pdf_path_templates: event.target.value })}
                        disabled={(config && !isEditing) || !formData.receipt_pdf_enabled}
                        placeholder="Um endpoint por linha. Ex.: /banking/v2/.../{codigoTransacao}"
                        className="mt-1 min-h-24 font-mono text-xs"
                      />
                      <p className="mt-2 text-xs text-gray-500">
                        Identificadores aceitos: {"{idTransacao}"}, {"{codigoTransacao}"}, {"{codigoSolicitacao}"}, {"{endToEndId}"}, {"{txid}"}, {"{nsu}"}, {"{dataInicio}"} e {"{dataFim}"}.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        setCapabilityResult(null);
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
              <h3 className="font-semibold text-gray-900 mb-3">1. Validar integração</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  onClick={testarConexao}
                  disabled={isTesting || isDiagnosing || !canUseIntegration}
                  className="bg-orange-600 text-white hover:bg-orange-700"
                >
                  {isTesting ? "Testando..." : "Testar conexão"}
                </Button>
                <Button
                  variant="outline"
                  onClick={diagnosticarPermissoes}
                  disabled={isTesting || isDiagnosing || !canUseIntegration}
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {isDiagnosing ? "Diagnosticando..." : "Diagnosticar permissões"}
                </Button>
              </div>

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

              {capabilityResult && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-2">
                    {capabilityResult.success ? (
                      <CheckCircle className="mt-0.5 h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{capabilityResult.message}</p>
                      <div className="mt-3 space-y-2">
                        {(capabilityResult.capabilities || []).map((capability) => {
                          const status = CAPABILITY_STATUS_META[capability.status] || CAPABILITY_STATUS_META.error;
                          return (
                            <div key={capability.key} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-gray-900">{capability.label}</p>
                                <Badge className={status.className}>{status.label}</Badge>
                              </div>
                              <p className="mt-1 break-all font-mono text-[11px] text-gray-500">
                                {capability.scope || "Sem scope configurado"}
                              </p>
                              {capability.message && (
                                <p className="mt-1 text-xs text-gray-600">{capability.message}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
              {whatsappConnections.map((slot) => {
                const statusView = getWhatsappStatusView(slot.status);

                return (
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
                      <Badge className={statusView.badgeClass}>
                        {statusView.label}
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
                        type="button"
                        variant="outline"
                        onClick={() => syncWhatsappSlot(slot, "connect")}
                        disabled={Boolean(whatsappLoadingSlot)}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        {whatsappLoadingSlot === slot.slot_key ? "Gerando..." : "Gerar QR"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => syncWhatsappSlot(slot, "disconnect")}
                        disabled={Boolean(whatsappLoadingSlot)}
                      >
                        <Power className="mr-2 h-4 w-4" />
                        Desconectar
                      </Button>
                    </div>

                    <Button
                      type="button"
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
              )})}
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
                type="button"
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

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                As conexões usam o gateway WhatsApp já vinculado à unidade. Gere o QR, conecte a conta e use o teste de envio para validar cada slot.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
