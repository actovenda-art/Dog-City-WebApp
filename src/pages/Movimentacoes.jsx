import React, { useEffect, useMemo, useState } from "react";
import {
  bancoInter,
  financeWalletAdminApplyOperation,
  financeWalletAdminAuditAccounts,
  financeWalletAdminReadAccounts,
  financeWalletAdminReadMovements,
  financeWalletReconcileAccount,
} from "@/api/functions";
import { AppConfig, ExtratoBancario, User } from "@/api/entities";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput, DateRangePickerInput } from "@/components/common/DateTimeInputs";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  FileText,
  ListFilter,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  fromDateInputValue,
  getMovementComparableDate,
  normalizeMovement,
  toDateInputValue,
} from "@/utils/finance";
import { FINANCE_FEATURE_FLAGS, getFinanceFeatureFlagValue } from "@/lib/finance-feature-flags";
import { isCommercialProfile, isManagerialProfile } from "@/lib/access-control";

const EMPTY_FORM = {
  data_hora_transacao: "",
  tipo: "entrada",
  nome_contraparte: "",
  valor: "",
  banco_contraparte: "",
  tipo_transacao_detalhado: "",
  referencia: "",
  observacoes: "",
};

const EMPTY_WALLET_OPERATION_FORM = {
  carteira_conta_id: "",
  tipo: "credito_manual",
  natureza: "entrada",
  valor: "",
  referencia_amigavel: "",
  motivo: "",
  observacao: "",
  origem: "admin_manual",
  transacao_id: "",
};

const WALLET_OPERATION_LABELS = {
  credito_manual: "Crédito manual",
  ajuste_manual: "Ajuste manual",
  estorno_manual: "Estorno manual",
  entrada_direcionada: "Entrada direcionada",
};

const MOVEMENTS_PAGE_SIZE = 50;
const MOVEMENT_CACHE_KEY = "movimentacoes:last-overview";

function readMovementsCache() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(MOVEMENT_CACHE_KEY);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMovementsCache(payload) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MOVEMENT_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function parseCurrencyInput(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildWalletOperationIdempotency(tipo) {
  const randomToken = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `wallet_admin|${tipo}|${randomToken}`;
}

function formatPeriodLabelWithDays(summary) {
  if (!summary?.oldest_movement_date && !summary?.newest_movement_date) return null;

  const calculateDaySpan = (startValue, endValue) => {
    if (!startValue || !endValue) return null;
    const start = new Date(`${startValue}T00:00:00`);
    const end = new Date(`${endValue}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diffInDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    return diffInDays > 0 ? diffInDays : null;
  };

  if (summary?.oldest_movement_date && summary?.newest_movement_date) {
    const daySpan = calculateDaySpan(summary.oldest_movement_date, summary.newest_movement_date);
    const rangeLabel = `${formatMovementDateTime(summary.oldest_movement_date)} até ${formatMovementDateTime(summary.newest_movement_date)}`;
    return daySpan ? `${rangeLabel} - ${daySpan} dias` : rangeLabel;
  }

  return formatMovementDateTime(summary.oldest_movement_date || summary.newest_movement_date);
}

function normalizeMovementSummary(summary) {
  if (!summary || typeof summary !== "object") return null;

  return {
    movement_count: Number(summary.movement_count) || 0,
    total_entradas: Number(summary.total_entradas) || 0,
    total_saidas: Number(summary.total_saidas) || 0,
    oldest_movement_date: summary.oldest_movement_date || null,
    newest_movement_date: summary.newest_movement_date || null,
    generated_at: summary.generated_at || null,
  };
}

function buildSummaryFromMovements(rows) {
  const normalizedRows = dedupeOfficialImportedMovements(rows || [])
    .map((item) => normalizeMovement(item))
    .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0));

  let totalEntradas = 0;
  let totalSaidas = 0;
  let oldestMovementDate = null;
  let newestMovementDate = null;

  for (const item of normalizedRows) {
    if (item.tipo === "saida") {
      totalSaidas += item.valor || 0;
    } else {
      totalEntradas += item.valor || 0;
    }

    const movementDate = item.data_movimento || item.data || null;
    if (!movementDate) continue;

    if (!oldestMovementDate || movementDate < oldestMovementDate) {
      oldestMovementDate = movementDate;
    }
    if (!newestMovementDate || movementDate > newestMovementDate) {
      newestMovementDate = movementDate;
    }
  }

  return {
    movement_count: normalizedRows.length,
    total_entradas: totalEntradas,
    total_saidas: totalSaidas,
    oldest_movement_date: oldestMovementDate,
    newest_movement_date: newestMovementDate,
    generated_at: new Date().toISOString(),
  };
}

async function requestLiveBalance(empresaId) {
  return bancoInter({
    action: "liveBalance",
    empresa_id: empresaId || null,
  });
}

function StatCard({ label, value, className = "", valueClassName = "", icon = null, helper = null, isBlurred = false }) {
  return (
    <Card className={className}>
      <CardContent className="p-2.5 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 sm:text-sm">{label}</p>
          {icon}
        </div>
        <p className={`mt-1.5 text-lg font-bold transition sm:mt-2 sm:text-2xl ${isBlurred ? "blur-[6px] opacity-50 select-none" : ""} ${valueClassName}`}>
          {value}
        </p>
        {helper ? <p className="mt-1.5 text-[11px] text-gray-500 sm:mt-2 sm:text-xs">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  className: PropTypes.string,
  valueClassName: PropTypes.string,
  icon: PropTypes.node,
  helper: PropTypes.string,
  isBlurred: PropTypes.bool,
};

export default function Movimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentBalance, setCurrentBalance] = useState(null);
  const [currentBalanceAt, setCurrentBalanceAt] = useState(null);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [summarySnapshot, setSummarySnapshot] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("all");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(MOVEMENTS_PAGE_SIZE);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [hasLoadedFullDataset, setHasLoadedFullDataset] = useState(false);
  const [walletFlags, setWalletFlags] = useState({
    balanceReadEnabled: false,
    movementsEnabled: false,
    manualAdjustmentsEnabled: false,
    manualCreditEnabled: false,
  });
  const [walletAccounts, setWalletAccounts] = useState([]);
  const [walletAuditRows, setWalletAuditRows] = useState([]);
  const [walletRecentMovements, setWalletRecentMovements] = useState([]);
  const [selectedWalletAccountId, setSelectedWalletAccountId] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletActionMessage, setWalletActionMessage] = useState(null);
  const [showWalletOperationModal, setShowWalletOperationModal] = useState(false);
  const [walletOperationForm, setWalletOperationForm] = useState({ ...EMPTY_WALLET_OPERATION_FORM });

  const applyCachedSnapshot = (expectedEmpresaId = null) => {
    const cached = readMovementsCache();
    if (!cached) return false;

    if (expectedEmpresaId && cached.empresa_id && cached.empresa_id !== expectedEmpresaId) {
      return false;
    }

    setMovimentacoes(Array.isArray(cached.movements) ? cached.movements : []);
    setCurrentBalance(null);
    setCurrentBalanceAt(null);
    setSummarySnapshot(normalizeMovementSummary(cached.summary));
    setHasLoadedFullDataset(false);
    setCacheHydrated(true);
    setIsInitialLoading(false);
    return true;
  };

  const loadData = async (userProfile, { preserveVisibleData = false } = {}) => {
    if (!preserveVisibleData && movimentacoes.length === 0 && !cacheHydrated) {
      setIsInitialLoading(true);
    }
    setIsSummaryLoading(true);

    try {
      let overviewEmpresaId = userProfile?.empresa_id || null;
      let overviewSummary = null;
      let overviewMovements = [];

      try {
        const overview = await bancoInter({
          action: "overview",
          empresa_id: userProfile?.empresa_id || null,
          limit: 250,
        });

        if (overview?.empresa_id) {
          overviewEmpresaId = overview.empresa_id;
        }

        overviewSummary = normalizeMovementSummary(overview?.summary);
        if (overviewSummary) {
          setSummarySnapshot(overviewSummary);
        }

        if (Array.isArray(overview?.movements)) {
          overviewMovements = overview.movements;
          setMovimentacoes(overview.movements);
        }

        writeMovementsCache({
          empresa_id: overviewEmpresaId,
          movements: overviewMovements,
          summary: overviewSummary,
          cached_at: new Date().toISOString(),
        });
      } catch (overviewError) {
        console.warn("Nao foi possivel carregar o panorama rapido do Banco Inter:", overviewError);
      } finally {
        setIsInitialLoading(false);
        setIsSummaryLoading(false);
      }

      let nextMovements = [];
      try {
        const fullDataset = await bancoInter({
          action: "fullDataset",
          empresa_id: userProfile?.empresa_id || null,
          limit: 50000,
          pageSize: 1000,
        });
        nextMovements = Array.isArray(fullDataset?.movements) ? fullDataset.movements : [];
      } catch (fullDatasetError) {
        console.warn("Não foi possível carregar o dataset consolidado do Banco Inter, usando leitura direta da tabela:", fullDatasetError);
        const fullMovementsResponse = ExtratoBancario.queryAll
          ? await ExtratoBancario.queryAll({
            sort: "-data_movimento",
            pageSize: 500,
            maxRows: 50000,
            count: false,
          })
          : (ExtratoBancario.listAll
            ? await ExtratoBancario.listAll("-data_movimento", 500, 50000)
            : await ExtratoBancario.list("-data_movimento", 5000));

        nextMovements = Array.isArray(fullMovementsResponse?.data)
          ? fullMovementsResponse.data
          : (fullMovementsResponse || []);
      }
      const derivedSummary = buildSummaryFromMovements(nextMovements);

      setMovimentacoes(nextMovements);
      setSummarySnapshot(derivedSummary);
      setHasLoadedFullDataset(true);
      writeMovementsCache({
        empresa_id: overviewEmpresaId,
        movements: nextMovements.slice(0, 250),
        summary: derivedSummary,
        cached_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Erro ao carregar movimentações:", error);
    } finally {
      setIsInitialLoading(false);
      setIsSummaryLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      applyCachedSnapshot();
      try {
        const me = await User.me();
        if (!isMounted) return;
        setCurrentUser(me || null);
        applyCachedSnapshot(me?.empresa_id || null);
        await loadData(me || null);
      } catch (error) {
        console.warn("Não foi possível carregar o usuário atual:", error);
        if (isMounted) {
          applyCachedSnapshot();
          await loadData(null);
        }
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveBalance() {
      setIsBalanceLoading(true);
      try {
        const data = await requestLiveBalance(currentUser?.empresa_id || null);
        if (cancelled) return;
        if (typeof data?.saldo_atual === "number") {
          setCurrentBalance(data.saldo_atual);
          setCurrentBalanceAt(data?.saldo_atualizado_em || new Date().toISOString());
        } else {
          setCurrentBalance(null);
          setCurrentBalanceAt(null);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Não foi possível consultar o saldo ao vivo do Banco Inter:", error);
          setCurrentBalance(null);
          setCurrentBalanceAt(null);
        }
      } finally {
        if (!cancelled) {
          setIsBalanceLoading(false);
        }
      }
    }

    loadLiveBalance();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.empresa_id]);

  const canManageWalletOperations = Boolean(
    currentUser?.is_platform_admin
    || currentUser?.company_role === "platform_admin"
    || isManagerialProfile(currentUser)
    || isCommercialProfile(currentUser),
  );

  const loadWalletFlags = async (userProfile) => {
    if (!userProfile?.empresa_id) {
      setWalletFlags({
        balanceReadEnabled: false,
        movementsEnabled: false,
        manualAdjustmentsEnabled: false,
        manualCreditEnabled: false,
      });
      return {
        balanceReadEnabled: false,
        movementsEnabled: false,
        manualAdjustmentsEnabled: false,
        manualCreditEnabled: false,
      };
    }

    const configResponse = AppConfig.queryAll
      ? await AppConfig.queryAll({ pageSize: 500, maxRows: 1000, count: false })
      : (AppConfig.listAll
        ? await AppConfig.listAll("-updated_date", 500, 1000)
        : await AppConfig.list("-updated_date", 500));
    const configs = Array.isArray(configResponse?.data) ? configResponse.data : (configResponse || []);
    const nextFlags = {
      balanceReadEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletBalanceReadEnabled, userProfile.empresa_id),
      movementsEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletMovementsEnabled, userProfile.empresa_id),
      manualAdjustmentsEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.walletManualAdjustmentsEnabled, userProfile.empresa_id),
      manualCreditEnabled: getFinanceFeatureFlagValue(configs, FINANCE_FEATURE_FLAGS.manualCreditEnabled, userProfile.empresa_id),
    };
    setWalletFlags(nextFlags);
    return nextFlags;
  };

  const loadWalletAdminData = async (userProfile = currentUser, preferredWalletAccountId = selectedWalletAccountId) => {
    if (!userProfile?.empresa_id) {
      setWalletAccounts([]);
      setWalletAuditRows([]);
      setWalletRecentMovements([]);
      setSelectedWalletAccountId("");
      return;
    }

    setWalletLoading(true);
    try {
      const nextFlags = await loadWalletFlags(userProfile);
      const walletReadEnabled = nextFlags.balanceReadEnabled || nextFlags.movementsEnabled;

      if (!walletReadEnabled) {
        setWalletAccounts([]);
        setWalletAuditRows([]);
        setWalletRecentMovements([]);
        setSelectedWalletAccountId("");
        return;
      }

      const [accounts, auditRows] = await Promise.all([
        financeWalletAdminReadAccounts({ empresa_id: userProfile.empresa_id }),
        nextFlags.balanceReadEnabled
          ? financeWalletAdminAuditAccounts({ empresa_id: userProfile.empresa_id })
          : Promise.resolve([]),
      ]);

      const normalizedAccounts = Array.isArray(accounts) ? accounts : [];
      setWalletAccounts(normalizedAccounts);
      setWalletAuditRows(Array.isArray(auditRows) ? auditRows : []);

      const nextSelectedWalletId = normalizedAccounts.some((item) => item.carteira_conta_id === preferredWalletAccountId)
        ? preferredWalletAccountId
        : (normalizedAccounts[0]?.carteira_conta_id || "");
      setSelectedWalletAccountId(nextSelectedWalletId);

      if (nextFlags.movementsEnabled && nextSelectedWalletId) {
        const recentMovements = await financeWalletAdminReadMovements({
          empresa_id: userProfile.empresa_id,
          carteira_conta_id: nextSelectedWalletId,
          limit: 20,
        });
        setWalletRecentMovements(Array.isArray(recentMovements) ? recentMovements : []);
      } else {
        setWalletRecentMovements([]);
      }
    } catch (error) {
      console.warn("Não foi possível carregar a leitura administrativa da carteira:", error);
      setWalletAccounts([]);
      setWalletAuditRows([]);
      setWalletRecentMovements([]);
      setSelectedWalletAccountId("");
    } finally {
      setWalletLoading(false);
    }
  };

  const loadWalletMovements = async (walletAccountId, userProfile = currentUser) => {
    if (!walletFlags.movementsEnabled || !userProfile?.empresa_id || !walletAccountId) {
      setWalletRecentMovements([]);
      return;
    }

    setWalletLoading(true);
    try {
      const recentMovements = await financeWalletAdminReadMovements({
        empresa_id: userProfile.empresa_id,
        carteira_conta_id: walletAccountId,
        limit: 20,
      });
      setWalletRecentMovements(Array.isArray(recentMovements) ? recentMovements : []);
    } catch (error) {
      console.warn("Não foi possível carregar os movimentos administrativos da carteira:", error);
      setWalletRecentMovements([]);
    } finally {
      setWalletLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser?.empresa_id) return;
    loadWalletAdminData(currentUser);
  }, [currentUser?.empresa_id]);

  useEffect(() => {
    if (!currentUser?.empresa_id) return;
    if (!walletFlags.movementsEnabled) return;
    if (!selectedWalletAccountId) {
      setWalletRecentMovements([]);
      return;
    }
    loadWalletMovements(selectedWalletAccountId, currentUser);
  }, [currentUser?.empresa_id, walletFlags.movementsEnabled, selectedWalletAccountId]);

  const normalizedMovements = React.useMemo(
    () =>
      dedupeOfficialImportedMovements(movimentacoes || [])
        .map((item) => normalizeMovement(item))
        .sort((a, b) => (b.dataOrdenacao?.getTime() || 0) - (a.dataOrdenacao?.getTime() || 0)),
    [movimentacoes],
  );

  const filtered = useMemo(
    () =>
      normalizedMovements.filter((item) => {
        const movementDate = getMovementComparableDate(item);
        const searchBase = [
          item.contraparte,
          item.metodo,
          item.referenciaFinanceira,
          item.bancoContraparte,
          item.descricaoOriginal,
          item.data_movimento,
          item.data,
          formatMovementDateTime(item),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (searchTerm && !searchBase.includes(searchTerm.toLowerCase())) {
          return false;
        }

        if (tipoFiltro !== "all" && item.tipo !== tipoFiltro) {
          return false;
        }

        if (dataInicial && movementDate && movementDate < new Date(`${dataInicial}T00:00:00`)) {
          return false;
        }

        if (dataFinal && movementDate && movementDate > new Date(`${dataFinal}T23:59:59`)) {
          return false;
        }

        return true;
      }),
    [normalizedMovements, searchTerm, tipoFiltro, dataInicial, dataFinal],
  );

  useEffect(() => {
    setVisibleCount(MOVEMENTS_PAGE_SIZE);
  }, [searchTerm, tipoFiltro, dataInicial, dataFinal]);

  const visibleMovements = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const hasMoreMovements = visibleMovements.length < filtered.length;
  const hasActiveFilters = Boolean(searchTerm || tipoFiltro !== "all" || dataInicial || dataFinal);

  const totalEntradas = filtered
    .filter((item) => item.tipo === "entrada")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const totalSaidas = filtered
    .filter((item) => item.tipo === "saida")
    .reduce((sum, item) => sum + (item.valor || 0), 0);
  const derivedSummaryFromLoadedRows = useMemo(
    () => buildSummaryFromMovements(movimentacoes),
    [movimentacoes],
  );
  const effectiveSummary = hasLoadedFullDataset
    ? derivedSummaryFromLoadedRows
    : (summarySnapshot || derivedSummaryFromLoadedRows);
  const entradasCardValue = hasActiveFilters ? totalEntradas : effectiveSummary.total_entradas;
  const saidasCardValue = hasActiveFilters ? totalSaidas : effectiveSummary.total_saidas;
  const movementCountCardValue = hasActiveFilters ? filtered.length : effectiveSummary.movement_count;
  const movementPeriodLabel = formatPeriodLabelWithDays(effectiveSummary);

  const hasOfficialBalance = typeof currentBalance === "number";
  const saldoAtual = hasOfficialBalance ? currentBalance : null;
  const saldoAtualDisplay = hasOfficialBalance ? formatCurrency(currentBalance) : "—";
  const walletReadEnabled = walletFlags.balanceReadEnabled || walletFlags.movementsEnabled;
  const selectedWalletAccount = walletAccounts.find((item) => item.carteira_conta_id === selectedWalletAccountId) || null;
  const selectedWalletAudit = walletAuditRows.find((item) => item.carteira_conta_id === selectedWalletAccountId) || null;

  const refreshStoredSummary = async (userProfile = currentUser) => {
    try {
      const data = await bancoInter({
        action: "refreshSummary",
        empresa_id: userProfile?.empresa_id || null,
      });

      const refreshedSummary = normalizeMovementSummary(data?.summary);
      if (refreshedSummary) {
        setSummarySnapshot(refreshedSummary);
        writeMovementsCache({
          empresa_id: userProfile?.empresa_id || null,
          movements: (movimentacoes || []).slice(0, 250),
          summary: refreshedSummary,
          cached_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn("Nao foi possivel atualizar o resumo persistido do extrato:", error);
    }
  };

  const openWalletOperationModal = (tipo, options = {}) => {
    const defaultNatureza = tipo === "credito_manual" || tipo === "entrada_direcionada" ? "entrada" : "entrada";
    setWalletActionMessage(null);
    setWalletOperationForm({
      carteira_conta_id: options.carteira_conta_id || selectedWalletAccountId || "",
      tipo,
      natureza: options.natureza || defaultNatureza,
      valor: options.valor != null ? String(options.valor).replace(".", ",") : "",
      referencia_amigavel: options.referencia_amigavel || "",
      motivo: options.motivo || "",
      observacao: options.observacao || "",
      origem: options.origem || (tipo === "entrada_direcionada" ? "transacao_direcionada" : "admin_manual"),
      transacao_id: options.transacao_id || "",
    });
    setShowWalletOperationModal(true);
  };

  const handleWalletReconcile = async () => {
    if (!selectedWalletAccountId || !currentUser?.empresa_id) return;
    setWalletLoading(true);
    setWalletActionMessage(null);
    try {
      const result = await financeWalletReconcileAccount({
        carteira_conta_id: selectedWalletAccountId,
        usuario_id: currentUser?.id || null,
      });
      await loadWalletAdminData(currentUser, selectedWalletAccountId);
      setWalletActionMessage({
        type: result?.out_status === "ok" ? "success" : "warning",
        message: result?.out_status === "ok"
          ? "Reconciliação concluída sem divergência."
          : "Reconciliação registrada com divergência. Nenhuma correção automática foi aplicada.",
      });
    } catch (error) {
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível reconciliar a carteira selecionada.",
      });
    } finally {
      setWalletLoading(false);
    }
  };

  const handleWalletOperationSave = async () => {
    if (!walletOperationForm.carteira_conta_id || !walletOperationForm.valor || !walletOperationForm.referencia_amigavel.trim() || !walletOperationForm.motivo.trim()) {
      alert("Selecione a carteira e preencha valor, referência e motivo.");
      return;
    }

    if (
      (walletOperationForm.tipo === "credito_manual" || walletOperationForm.tipo === "entrada_direcionada")
      && walletOperationForm.natureza !== "entrada"
    ) {
      alert("Essa operação deve usar natureza de entrada.");
      return;
    }

    setWalletSaving(true);
    setWalletActionMessage(null);
    try {
      await financeWalletAdminApplyOperation({
        carteira_conta_id: walletOperationForm.carteira_conta_id,
        operacao_idempotencia: buildWalletOperationIdempotency(walletOperationForm.tipo),
        tipo: walletOperationForm.tipo,
        natureza: walletOperationForm.natureza,
        valor: parseCurrencyInput(walletOperationForm.valor),
        referencia_amigavel: walletOperationForm.referencia_amigavel.trim(),
        motivo: walletOperationForm.motivo.trim(),
        observacao: walletOperationForm.observacao.trim() || null,
        origem: walletOperationForm.origem.trim() || "admin_manual",
        transacao_id: walletOperationForm.transacao_id.trim() || null,
        usuario_id: currentUser?.id || null,
        metadata: {
          initiated_from: "movimentacoes_admin_block",
          initiated_at: new Date().toISOString(),
        },
      });

      await loadWalletAdminData(currentUser, walletOperationForm.carteira_conta_id);
      setShowWalletOperationModal(false);
      setWalletOperationForm({ ...EMPTY_WALLET_OPERATION_FORM });
      setWalletActionMessage({
        type: "success",
        message: `${WALLET_OPERATION_LABELS[walletOperationForm.tipo] || "Operação"} registrada na carteira.`,
      });
    } catch (error) {
      setWalletActionMessage({
        type: "error",
        message: error?.message || "Não foi possível registrar a operação da carteira.",
      });
    } finally {
      setWalletSaving(false);
    }
  };

  const openModal = (item = null) => {
    if (item) {
      const normalized = normalizeMovement(item);
      setEditingItem(normalized);
      setFormData({
        data_hora_transacao: toDateInputValue(normalized.dataHora || normalized.data_movimento || normalized.data),
        tipo: normalized.tipo || "entrada",
        nome_contraparte: normalized.contraparte || "",
        valor: normalized.valor?.toString() || "",
        banco_contraparte: normalized.bancoContraparte === "-" ? "" : normalized.bancoContraparte || "",
        tipo_transacao_detalhado: normalized.tipoDetalhado === "-" ? "" : normalized.tipoDetalhado || "",
        referencia: normalized.referenciaFinanceira === "-" ? "" : normalized.referenciaFinanceira || "",
        observacoes: normalized.observacoesFinanceiras || "",
      });
    } else {
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
    }

    setShowModal(true);
  };

  const handleSave = async () => {
    const isApiLocked = editingItem?.apiLocked;

    if (!isApiLocked && (!formData.data_hora_transacao || !formData.valor || !formData.nome_contraparte)) {
      alert("Preencha data, valor e remetente/recebedor.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingItem) {
        if (isApiLocked) {
          await ExtratoBancario.update(editingItem.id, {
            observacoes: formData.observacoes.trim() || null,
          });
        } else {
          const dateOnly = fromDateInputValue(formData.data_hora_transacao);
          await ExtratoBancario.update(editingItem.id, {
            descricao: formData.nome_contraparte.trim(),
            tipo: formData.tipo,
            valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
            data: dateOnly,
            data_movimento: dateOnly,
            data_hora_transacao: null,
            nome_contraparte: formData.nome_contraparte.trim(),
            banco_contraparte: formData.banco_contraparte.trim() || null,
            banco: formData.banco_contraparte.trim() || null,
            tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
            referencia: formData.referencia.trim() || null,
            observacoes: formData.observacoes.trim() || null,
            forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
            source_provider: editingItem?.source_provider || "manual",
            metadata_financeira: {
              ...(editingItem?.metadata_financeira || {}),
              api_locked: false,
            },
          });
        }
      } else {
        const dateOnly = fromDateInputValue(formData.data_hora_transacao);
        const manualTransactionId = `manual_${crypto.randomUUID()}`;
        await ExtratoBancario.create({
          id: manualTransactionId,
          descricao: formData.nome_contraparte.trim(),
          tipo: formData.tipo,
          valor: parseFloat(String(formData.valor).replace(",", ".")) || 0,
          data: dateOnly,
          data_movimento: dateOnly,
          data_hora_transacao: null,
          nome_contraparte: formData.nome_contraparte.trim(),
          banco_contraparte: formData.banco_contraparte.trim() || null,
          banco: formData.banco_contraparte.trim() || null,
          tipo_transacao_detalhado: formData.tipo_transacao_detalhado.trim() || null,
          referencia: formData.referencia.trim() || null,
          observacoes: formData.observacoes.trim() || null,
          forma_pagamento: formData.tipo_transacao_detalhado.trim() || null,
          source_provider: "manual",
          metadata_financeira: {
            api_locked: false,
            transaction_id_source: "manual_uuid",
          },
        });
      }

      await loadData(currentUser, { preserveVisibleData: true });
      await refreshStoredSummary(currentUser);
      setShowModal(false);
    } catch (error) {
      alert(error?.message || "Erro ao salvar movimentação.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (movement) => {
    if (movement?.apiLocked) return;
    if (!confirm("Excluir esta movimentação manual?")) return;

    try {
      await ExtratoBancario.delete(movement.id);
      await loadData(currentUser, { preserveVisibleData: true });
      await refreshStoredSummary(currentUser);
    } catch (error) {
      alert(error?.message || "Erro ao excluir movimentação.");
    }
  };

  const refreshMovements = async () => {
    setIsRefreshing(true);
    setIsSummaryLoading(true);
    setRefreshResult(null);

    try {
      const data = await bancoInter({
        action: "syncNow",
        empresa_id: currentUser?.empresa_id || null,
      });

      await loadData(currentUser, { preserveVisibleData: true });
      if (typeof data?.saldo_atual === "number") {
        setCurrentBalance(data.saldo_atual);
        setCurrentBalanceAt(data?.saldo_atualizado_em || new Date().toISOString());
      } else {
        setCurrentBalance(null);
        setCurrentBalanceAt(null);
      }
      if (data?.summary) {
        const refreshedSummary = normalizeMovementSummary(data.summary);
        if (refreshedSummary) {
          setSummarySnapshot(refreshedSummary);
        }
      }

      setRefreshResult({
        success: true,
        message: data?.message || "Extrato atualizado com sucesso.",
        imported: data?.historical_inserted_count ?? data?.historicalInsertedCount ?? data?.inseridas ?? data?.imported_count ?? 0,
        refreshedToday: data?.refreshed_today_count ?? 0,
        balance: typeof data?.saldo_atual === "number" ? data.saldo_atual : null,
        balanceWarning: data?.balance_warning || null,
      });
    } catch (error) {
      setRefreshResult({
        success: false,
        message: error?.message || "Falha ao atualizar o extrato.",
      });
      setIsSummaryLoading(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewReceipt = async (movement) => {
    if (!movement?.apiLocked) {
      alert("Somente transações importadas pela API do banco podem ter comprovante oficial.");
      return;
    }

    try {
      setReceiptLoadingId(movement.id);
      const data = await bancoInter({
        action: "transactionReceipt",
        empresa_id: currentUser?.empresa_id || null,
        movement_id: movement.id,
      });

      if (!data?.success) {
        throw new Error(data?.message || "Não foi possível localizar um comprovante para esta transação.");
      }

      if (data?.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (!data?.base64) {
        throw new Error("A API do banco não retornou um PDF para este comprovante.");
      }

      const binary = window.atob(data.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: data?.mime_type || "application/pdf" });
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      alert(error?.message || "Não foi possível abrir o comprovante desta transação.");
    } finally {
      setReceiptLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Transações</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshMovements} disabled={isRefreshing} className="h-9 rounded-full px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""} sm:mr-2 sm:h-4 sm:w-4`} />
              {isRefreshing ? "Atualizando..." : "Atualizar extrato"}
            </Button>
            <Button onClick={() => openModal()} className="h-9 rounded-full bg-blue-600 px-3 text-xs text-white hover:bg-blue-700 sm:h-10 sm:px-4 sm:text-sm">
              <Plus className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
              Nova movimentação manual
            </Button>
          </div>
        </div>

        {refreshResult && (
          <Card className={`mb-6 ${refreshResult.success ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
            <CardContent className="p-4">
              <p className={`font-semibold ${refreshResult.success ? "text-blue-900" : "text-red-900"}`}>
                {refreshResult.message}
              </p>
              {refreshResult.success && (
                <div className="mt-1 space-y-1 text-sm text-blue-800">
                  <p>Histórico novo inserido: {refreshResult.imported}</p>
                  <p>Movimentações de hoje recarregadas: {refreshResult.refreshedToday}</p>
                  {typeof refreshResult.balance === "number" && (
                    <p>Saldo oficial retornado pela API: {formatCurrency(refreshResult.balance)}</p>
                  )}
                  {refreshResult.balanceWarning && (
                    <p className="text-amber-700">{refreshResult.balanceWarning}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="Entradas"
            value={formatCurrency(entradasCardValue)}
            className="border-green-200"
            valueClassName="text-green-600"
            helper={hasActiveFilters ? "Filtro atual" : "Resumo salvo do extrato"}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saídas"
            value={formatCurrency(saidasCardValue)}
            className="border-red-200"
            valueClassName="text-red-600"
            helper={hasActiveFilters ? "Filtro atual" : "Resumo salvo do extrato"}
            isBlurred={isSummaryLoading}
          />
          <StatCard
            label="Saldo atual"
            value={saldoAtualDisplay}
            className={hasOfficialBalance ? (saldoAtual >= 0 ? "border-blue-200" : "border-red-200") : "border-slate-200"}
            valueClassName={hasOfficialBalance ? (saldoAtual >= 0 ? "text-blue-700" : "text-red-600") : "text-slate-500"}
            icon={<Wallet className={`h-5 w-5 ${hasOfficialBalance ? (saldoAtual >= 0 ? "text-blue-500" : "text-red-500") : "text-slate-400"}`} />}
            helper={
              currentBalanceAt
                ? `API Banco Inter atualizada em ${new Date(currentBalanceAt).toLocaleString("pt-BR")}`
                : (isBalanceLoading ? "Consultando saldo ao vivo na API" : "Saldo disponível apenas quando a API responder")
            }
            isBlurred={isBalanceLoading}
          />
          <StatCard
            label="Movimentações"
            value={String(movementCountCardValue)}
            className="border-gray-200"
            valueClassName="text-gray-900"
            helper={movementPeriodLabel ? `Período: ${movementPeriodLabel}` : "Quantidade exibida"}
            isBlurred={isSummaryLoading}
          />
        </div>

        {walletReadEnabled && (
          <Card className="mb-6 border-slate-200 bg-white">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Carteira financeira</h2>
                    <Badge variant="outline">Leitura controlada</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Bloco administrativo temporário para auditoria de saldo e movimentos, sem substituir o fluxo principal.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => loadWalletAdminData(currentUser, selectedWalletAccountId)}
                    disabled={walletLoading}
                    className="h-9 rounded-full px-3 text-xs sm:text-sm"
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${walletLoading ? "animate-spin" : ""}`} />
                    Atualizar carteira
                  </Button>
                  {walletFlags.manualAdjustmentsEnabled && canManageWalletOperations && (
                    <>
                      {walletFlags.manualCreditEnabled ? (
                        <Button
                          variant="outline"
                          onClick={() => openWalletOperationModal("credito_manual")}
                          className="h-9 rounded-full px-3 text-xs sm:text-sm"
                        >
                          Crédito manual
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => openWalletOperationModal("ajuste_manual")}
                        className="h-9 rounded-full px-3 text-xs sm:text-sm"
                      >
                        Ajuste manual
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => openWalletOperationModal("estorno_manual")}
                        className="h-9 rounded-full px-3 text-xs sm:text-sm"
                      >
                        Estorno manual
                      </Button>
                    </>
                  )}
                  {walletFlags.balanceReadEnabled && selectedWalletAccountId && (
                    <Button
                      variant="outline"
                      onClick={handleWalletReconcile}
                      disabled={walletLoading}
                      className="h-9 rounded-full px-3 text-xs sm:text-sm"
                    >
                      Reconciliar
                    </Button>
                  )}
                </div>
              </div>

              {walletActionMessage && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    walletActionMessage.type === "success"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : walletActionMessage.type === "warning"
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {walletActionMessage.message}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <Label>Carteira selecionada</Label>
                    <Select value={selectedWalletAccountId || ""} onValueChange={setSelectedWalletAccountId}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Selecione uma carteira" />
                      </SelectTrigger>
                      <SelectContent>
                        {walletAccounts.map((account) => (
                          <SelectItem key={account.carteira_conta_id} value={account.carteira_conta_id}>
                            {account.carteira_nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {walletAccounts.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                        Nenhuma conta de carteira disponível para a leitura administrativa atual.
                      </div>
                    ) : (
                      walletAccounts.map((account) => {
                        const isSelected = account.carteira_conta_id === selectedWalletAccountId;
                        return (
                          <button
                            key={account.carteira_conta_id}
                            type="button"
                            onClick={() => setSelectedWalletAccountId(account.carteira_conta_id)}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              isSelected
                                ? "border-blue-300 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-slate-900">{account.carteira_nome}</p>
                                {account.carteira_codigo ? (
                                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    {account.carteira_codigo}
                                  </p>
                                ) : null}
                              </div>
                              <Badge variant={account.latest_reconciliation_status === "divergente" ? "destructive" : "outline"}>
                                {account.latest_reconciliation_status === "divergente" ? "Divergente" : "Auditável"}
                              </Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-slate-500">Saldo atual</p>
                                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(account.saldo_atual)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">Movimentos</p>
                                <p className="mt-1 font-semibold text-slate-900">{account.movimento_count || 0}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedWalletAccount ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <StatCard
                          label="Saldo da carteira"
                          value={formatCurrency(selectedWalletAccount.saldo_atual)}
                          className="border-blue-200"
                          valueClassName="text-blue-700"
                        />
                        <StatCard
                          label="Último movimento"
                          value={selectedWalletAccount.ultimo_movimento_em ? new Date(selectedWalletAccount.ultimo_movimento_em).toLocaleDateString("pt-BR") : "—"}
                          className="border-slate-200"
                          valueClassName="text-slate-900 text-base sm:text-lg"
                          helper={selectedWalletAccount.ultimo_movimento_em ? new Date(selectedWalletAccount.ultimo_movimento_em).toLocaleTimeString("pt-BR") : "Sem movimentos"}
                        />
                        <StatCard
                          label="Reconciliação"
                          value={selectedWalletAudit?.status === "divergente" ? "Divergente" : "OK"}
                          className={selectedWalletAudit?.status === "divergente" ? "border-amber-200" : "border-green-200"}
                          valueClassName={selectedWalletAudit?.status === "divergente" ? "text-amber-700 text-base sm:text-lg" : "text-green-700 text-base sm:text-lg"}
                          helper={selectedWalletAudit ? `Diferença: ${formatCurrency(selectedWalletAudit.diferenca_ultimo || 0)}` : "Sem auditoria detalhada carregada"}
                        />
                      </div>

                      {walletFlags.movementsEnabled ? (
                        <div className="rounded-2xl border border-slate-200 bg-white">
                          <div className="border-b border-slate-100 px-4 py-3">
                            <h3 className="font-semibold text-slate-900">Últimos movimentos</h3>
                            <p className="mt-1 text-sm text-slate-500">
                              Origem, referência e saldo antes/depois, sem timeline final nesta sprint.
                            </p>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {walletRecentMovements.length === 0 ? (
                              <div className="px-4 py-6 text-sm text-slate-500">Nenhum movimento encontrado para a carteira selecionada.</div>
                            ) : (
                              walletRecentMovements.map((movement) => (
                                <div key={movement.movimento_id} className="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_140px_180px]">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-slate-900">
                                        {WALLET_OPERATION_LABELS[movement.tipo] || movement.tipo}
                                      </p>
                                      <Badge variant="outline">{movement.origem}</Badge>
                                      <Badge className={movement.natureza === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                        {movement.natureza === "entrada" ? "Entrada" : "Saída"}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-600">{movement.referencia_amigavel}</p>
                                    {movement.descricao ? (
                                      <p className="mt-1 text-sm text-slate-500">{movement.descricao}</p>
                                    ) : null}
                                    <p className="mt-2 text-xs text-slate-400">
                                      {new Date(movement.created_date).toLocaleString("pt-BR")}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Valor</p>
                                    <p className={`mt-1 text-base font-semibold ${movement.natureza === "entrada" ? "text-green-700" : "text-red-600"}`}>
                                      {movement.natureza === "entrada" ? "+" : "-"}
                                      {formatCurrency(movement.valor)}
                                    </p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <p className="text-slate-500">Saldo anterior</p>
                                      <p className="mt-1 font-medium text-slate-900">{formatCurrency(movement.saldo_anterior)}</p>
                                    </div>
                                    <div>
                                      <p className="text-slate-500">Saldo final</p>
                                      <p className="mt-1 font-medium text-slate-900">{formatCurrency(movement.saldo_final)}</p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                          A leitura detalhada dos movimentos ainda está desligada por feature flag.
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                      Selecione uma carteira para auditar saldo, reconciliação e movimentos.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-3 sm:p-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por titular, método, banco ou transação ID"
              hasActiveFilters={Boolean(searchTerm || tipoFiltro !== "all" || dataInicial || dataFinal)}
              onClear={() => {
                setSearchTerm("");
                setTipoFiltro("all");
                setDataInicial("");
                setDataFinal("");
              }}
              filters={[
                {
                  id: "type",
                  label: "Tipo",
                  icon: ListFilter,
                  active: tipoFiltro !== "all",
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Tipo de movimentação</p>
                      <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="entrada">Entradas</SelectItem>
                          <SelectItem value="saida">Saídas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                },
                {
                  id: "period",
                  label: "Período",
                  icon: Calendar,
                  active: Boolean(dataInicial || dataFinal),
                  content: (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Período da transação</p>
                      <DateRangePickerInput
                        startValue={dataInicial}
                        endValue={dataFinal}
                        onStartChange={setDataInicial}
                        onEndChange={setDataFinal}
                      />
                    </div>
                  ),
                },
              ]}
              searchInputClassName="h-9 text-[13px] sm:h-11 sm:text-sm"
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="border-gray-200 bg-white">
              <CardContent className="p-12 text-center text-gray-500">
                {isInitialLoading ? "Carregando movimentações..." : "Nenhuma movimentação encontrada."}
              </CardContent>
            </Card>
          ) : (
            <>
              {visibleMovements.map((movement) => (
              <Card key={movement.id} className="border-gray-200 bg-white">
                <CardContent className="flex flex-col gap-3 p-3 sm:gap-4 sm:p-4 lg:flex-row lg:items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12 ${movement.tipo === "entrada" ? "bg-green-100" : "bg-red-100"}`}>
                    {movement.tipo === "entrada" ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-600 sm:h-6 sm:w-6" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-600 sm:h-6 sm:w-6" />
                    )}
                  </div>

                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Titular da contraparte</p>
                        <p className="mt-1 font-semibold text-gray-900">{movement.contraparte}</p>
                        <p className="mt-1 text-xs text-gray-500">{movement.direcaoLabel}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Método</p>
                        <p className="mt-1 font-medium text-gray-900">{movement.metodo}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Data da transação</p>
                        <p className="mt-1 font-medium text-gray-900">{formatMovementDateTime(movement)}</p>
                      </div>

                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">Valor</p>
                        <p className={`mt-1 text-lg font-bold ${movement.tipo === "entrada" ? "text-green-600" : "text-red-600"}`}>
                          {movement.tipo === "entrada" ? "+" : "-"}
                          {formatCurrency(Math.abs(movement.valor || 0))}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-sm">
                      <Badge className={movement.tipo === "entrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {movement.tipoDetalhado || movement.direcaoLabel}
                      </Badge>
                      <Badge className="bg-blue-100 text-blue-700">{movement.metodo}</Badge>
                      {movement.bancoContraparte && movement.bancoContraparte !== "-" && (
                        <Badge className="bg-gray-100 text-gray-700">{movement.bancoContraparte}</Badge>
                      )}
                      {movement.apiLocked ? (
                        <Badge variant="outline">Origem API</Badge>
                      ) : (
                        <Badge variant="outline">Manual</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {walletFlags.movementsEnabled && canManageWalletOperations && movement.tipo === "entrada" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm"
                        onClick={() =>
                          openWalletOperationModal("entrada_direcionada", {
                            carteira_conta_id: selectedWalletAccountId,
                            valor: Math.abs(movement.valor || 0),
                            referencia_amigavel: `Entrada direcionada - ${movement.contraparte || movement.referenciaFinanceira || movement.id}`,
                            observacao: `Origem do extrato: ${movement.id}`,
                            origem: "transacao_direcionada",
                            transacao_id: movement.id,
                          })
                        }
                        disabled={!selectedWalletAccountId}
                      >
                        Direcionar para carteira
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm"
                      onClick={() => handleViewReceipt(movement)}
                      disabled={!movement.apiLocked || receiptLoadingId === movement.id}
                    >
                      <FileText className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {receiptLoadingId === movement.id ? "Carregando..." : "Ver comprovante"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-[11px] sm:h-9 sm:text-sm" onClick={() => openModal(movement)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                      {movement.apiLocked ? "Complementar" : "Editar"}
                    </Button>
                    {!movement.apiLocked && (
                      <Button variant="outline" size="sm" className="h-8 rounded-full px-3 text-[11px] text-red-600 sm:h-9 sm:text-sm" onClick={() => handleDelete(movement)}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                        Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
              ))}

              {hasMoreMovements && (
                <Card className="border-dashed border-gray-300 bg-white">
                  <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
                    <p className="text-sm text-gray-500">
                      Exibindo {visibleMovements.length} de {filtered.length} movimentações encontradas.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setVisibleCount((current) => current + MOVEMENTS_PAGE_SIZE)}
                    >
                      Carregar mais
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar movimentação" : "Nova movimentação manual"}</DialogTitle>
            <DialogDescription>
              {editingItem?.apiLocked
                ? "Lançamentos vindos da API oficial ficam bloqueados. Aqui você adiciona apenas observações complementares."
                : "Ajuste manualmente os dados financeiros exibidos na sessão de transações."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div>
              <Label>Data *</Label>
              <DatePickerInput
                className="mt-2"
                value={formData.data_hora_transacao}
                onChange={(value) => setFormData((prev) => ({ ...prev, data_hora_transacao: value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value }))}
                disabled={editingItem?.apiLocked}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Remetente / Recebedor *</Label>
              <Input
                className="mt-2"
                value={formData.nome_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, nome_contraparte: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={formData.valor}
                onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Banco da contraparte</Label>
              <Input
                className="mt-2"
                value={formData.banco_contraparte}
                onChange={(event) => setFormData((prev) => ({ ...prev, banco_contraparte: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div>
              <Label>Tipo da transação</Label>
              <Input
                className="mt-2"
                value={formData.tipo_transacao_detalhado}
                onChange={(event) => setFormData((prev) => ({ ...prev, tipo_transacao_detalhado: event.target.value }))}
                placeholder="PIX, TED, boleto..."
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Transao ID</Label>
              <Input
                className="mt-2"
                value={formData.referencia}
                onChange={(event) => setFormData((prev) => ({ ...prev, referencia: event.target.value }))}
                disabled={editingItem?.apiLocked}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observações</Label>
              <Textarea
                className="mt-2"
                rows={4}
                value={formData.observacoes}
                onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : editingItem?.apiLocked ? "Salvar complemento" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWalletOperationModal} onOpenChange={setShowWalletOperationModal}>
        <DialogContent className="w-[95vw] max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{WALLET_OPERATION_LABELS[walletOperationForm.tipo] || "Operação de carteira"}</DialogTitle>
            <DialogDescription>
              Registro administrativo controlado da carteira, sempre via RPC e com movimento compensatório auditável.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Responsável financeiro destino *</Label>
              <Select
                value={walletOperationForm.carteira_conta_id}
                onValueChange={(value) => setWalletOperationForm((prev) => ({ ...prev, carteira_conta_id: value }))}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione a carteira" />
                </SelectTrigger>
                <SelectContent>
                  {walletAccounts.map((account) => (
                    <SelectItem key={account.carteira_conta_id} value={account.carteira_conta_id}>
                      {account.carteira_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={walletOperationForm.tipo}
                onValueChange={(value) =>
                  setWalletOperationForm((prev) => ({
                    ...prev,
                    tipo: value,
                    natureza: value === "credito_manual" || value === "entrada_direcionada" ? "entrada" : prev.natureza,
                  }))
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {walletFlags.manualCreditEnabled ? (
                    <SelectItem value="credito_manual">Crédito manual</SelectItem>
                  ) : null}
                  <SelectItem value="ajuste_manual">Ajuste manual</SelectItem>
                  <SelectItem value="estorno_manual">Estorno manual</SelectItem>
                  <SelectItem value="entrada_direcionada">Entrada direcionada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Natureza *</Label>
              <Select
                value={walletOperationForm.natureza}
                onValueChange={(value) => setWalletOperationForm((prev) => ({ ...prev, natureza: value }))}
                disabled={walletOperationForm.tipo === "credito_manual" || walletOperationForm.tipo === "entrada_direcionada"}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.valor}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label>Origem *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.origem}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, origem: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Referência amigável *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.referencia_amigavel}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, referencia_amigavel: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Motivo *</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.motivo}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Explique por que essa movimentação está sendo registrada"
              />
            </div>

            <div className="md:col-span-2">
              <Label>Observação</Label>
              <Textarea
                className="mt-2"
                rows={3}
                value={walletOperationForm.observacao}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, observacao: event.target.value }))}
              />
            </div>

            <div className="md:col-span-2">
              <Label>Transação de origem</Label>
              <Input
                className="mt-2"
                value={walletOperationForm.transacao_id}
                onChange={(event) => setWalletOperationForm((prev) => ({ ...prev, transacao_id: event.target.value }))}
                placeholder="Opcional, para direcionamento ou rastreabilidade"
              />
            </div>

            <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p><span className="font-medium text-slate-900">Usuário:</span> {currentUser?.full_name || currentUser?.name || currentUser?.email || "Sessão atual"}</p>
              <p className="mt-1"><span className="font-medium text-slate-900">Data/hora:</span> {new Date().toLocaleString("pt-BR")}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowWalletOperationModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleWalletOperationSave} disabled={walletSaving}>
              {walletSaving ? "Salvando..." : "Registrar movimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


