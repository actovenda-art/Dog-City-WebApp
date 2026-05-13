import React, { useEffect, useMemo, useState } from "react";
import {
  Transaction,
  ScheduledTransaction,
  Appointment,
  ServiceProvided,
  Replacement,
  PlanConfig,
  Dog,
  Carteira,
  Orcamento,
  Checkin,
  ServiceProvider,
  AppConfig,
  Lancamento,
  User,
} from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp,
  DollarSign,
  PieChart,
  BarChart3,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  Calendar,
  Award,
  AlertTriangle,
  Clock,
  CreditCard,
  RefreshCw,
  Clipboard,
  Dog as DogIcon,
  Users,
  ShieldAlert,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { doesAppointmentOccurOnDate, filterAppointmentsByApprovedOrcamentos, isApprovedOrcamento } from "@/lib/attendance";
import { isManagerialProfile } from "@/lib/access-control";

const COLORS = ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B", "#EF4444", "#6366F1", "#14B8A6"];
const RISK_RULES_CONFIG_KEY = "cockpit.finance_risk_rules";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createEmptyRiskRule() {
  return {
    id: `risk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    recebedor_match: "",
    threshold_type: "open_count",
    threshold_value: "3",
    message: "",
    impact_sector: "",
    active: true,
  };
}

function normalizeRiskRules(value) {
  const rules = Array.isArray(value) ? value : Array.isArray(value?.rules) ? value.rules : [];
  return rules
    .map((rule, index) => ({
      id: String(rule?.id || `risk_imported_${index}`),
      title: String(rule?.title || ""),
      recebedor_match: String(rule?.recebedor_match || rule?.recebedor || ""),
      threshold_type: rule?.threshold_type === "overdue_days" ? "overdue_days" : "open_count",
      threshold_value: String(rule?.threshold_value || rule?.threshold || "3"),
      message: String(rule?.message || ""),
      impact_sector: String(rule?.impact_sector || ""),
      active: rule?.active !== false,
    }))
    .filter((rule) => rule.recebedor_match || rule.title || rule.message);
}

function getServiceName(service) {
  const names = {
    day_care: "Day Care",
    hospedagem: "Hospedagem",
    banho: "Banho",
    tosa: "Tosa",
    banho_tosa: "Banho e Tosa",
    transporte: "Transporte",
    adestramento: "Adestramento",
    adaptacao: "Adaptação",
  };
  return names[service] || service || "Atendimento";
}

function getDogDisplayName(dog) {
  return dog?.nome || dog?.apelido || "Cão não identificado";
}

function getProviderDisplayName(provider) {
  return (
    provider?.nome_completo ||
    provider?.nome ||
    provider?.full_name ||
    provider?.display_name ||
    "Funcionário não identificado"
  );
}

function getProviderRoleLabel(provider) {
  const value = String(provider?.funcao || provider?.role || provider?.cargo || "").toLowerCase();
  if (value === "representante_comercial") return "Representante comercial";
  if (value === "banhista_tosador") return "Banhista & Tosador";
  if (value === "monitor") return "Monitor";
  if (value === "banhista") return "Banhista";
  if (value === "tosador") return "Tosador";
  if (value === "motorista") return "Motorista";
  if (value === "comercial") return "Comercial";
  return provider?.funcao || provider?.role || provider?.cargo || "Sem função";
}

function formatTimeLabel(value) {
  if (!value) return "";
  const text = String(value);
  if (text.includes("T")) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return format(date, "HH:mm");
    }
  }
  return text.slice(0, 5);
}

function isOpenLancamento(item) {
  if (!item || item.movido_para_despesas) return false;
  if (item.status === "realizado_hoje" || item.status === "quitada" || item.data_quitacao) return false;
  return true;
}

function getOpenLancamentoAmount(item) {
  return Math.max(0, Number(item?.valor || 0) - Number(item?.valor_quitado || 0));
}

export default function Cockpit() {
  const [transactions, setTransactions] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [servicesProvided, setServicesProvided] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [plans, setPlans] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [providers, setProviders] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [periodoMeses, setPeriodoMeses] = useState("6");
  const [periodoDias, setPeriodoDias] = useState("30");
  const [currentView, setCurrentView] = useState("resumo");
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [riskRulesDraft, setRiskRulesDraft] = useState([]);
  const [editingRiskRuleId, setEditingRiskRuleId] = useState(null);
  const [isSavingRiskRules, setIsSavingRiskRules] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [
        transData,
        schedData,
        apptsData,
        servData,
        replData,
        plansData,
        dogsData,
        carteirasData,
        orcamentosData,
        checkinsData,
        providersData,
        lancamentosData,
        configsData,
        me,
      ] = await Promise.all([
        Transaction.list("-date", 1000),
        ScheduledTransaction.list("-due_date", 500),
        Appointment.list("-date", 1000),
        ServiceProvided.list("-date", 1000),
        Replacement.list("-created_date", 500),
        PlanConfig.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Orcamento.list("-created_date", 500),
        Checkin.list("-created_date", 1000).catch(() => []),
        ServiceProvider.list("-created_date", 500).catch(() => []),
        Lancamento.list("-vencimento", 1000).catch(() => []),
        AppConfig.filter({ key: RISK_RULES_CONFIG_KEY }, "-created_date", 20).catch(() => []),
        User.me().catch(() => null),
      ]);

      const approvedOrcamentosById = Object.fromEntries(
        (orcamentosData || [])
          .filter((orcamento) => isApprovedOrcamento(orcamento))
          .map((orcamento) => [orcamento.id, orcamento]),
      );

      setTransactions(transData || []);
      setScheduled(schedData || []);
      setAppointments(filterAppointmentsByApprovedOrcamentos(apptsData || [], approvedOrcamentosById));
      setServicesProvided(servData || []);
      setReplacements(replData || []);
      setPlans(plansData || []);
      setDogs(dogsData || []);
      setCarteiras(carteirasData || []);
      setCheckins(checkinsData || []);
      setProviders(providersData || []);
      setLancamentos(lancamentosData || []);
      setConfigs(configsData || []);
      setCurrentUser(me);
    } catch (error) {
      console.error("Erro ao carregar cockpit:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);

  const hoje = new Date().toISOString().split("T")[0];
  const canManageRiskRules = isManagerialProfile(currentUser);

  const dogsById = useMemo(() => Object.fromEntries(dogs.map((dog) => [dog.id, dog])), [dogs]);
  const providersById = useMemo(() => Object.fromEntries(providers.map((provider) => [provider.id, provider])), [providers]);

  const activePetCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "pet" && item.status === "presente"),
    [checkins],
  );
  const activeProviderCheckins = useMemo(
    () => checkins.filter((item) => item.tipo === "prestador" && item.status === "presente"),
    [checkins],
  );

  const presentDogs = useMemo(
    () =>
      activePetCheckins
        .map((checkin) => ({
          checkin,
          dog: dogsById[checkin.dog_id],
        }))
        .filter((item) => item.dog)
        .sort((left, right) => getDogDisplayName(left.dog).localeCompare(getDogDisplayName(right.dog))),
    [activePetCheckins, dogsById],
  );

  const presentProviders = useMemo(
    () =>
      activeProviderCheckins
        .map((checkin) => ({
          checkin,
          provider: providersById[checkin.user_id],
        }))
        .filter((item) => item.provider)
        .sort((left, right) => getProviderDisplayName(left.provider).localeCompare(getProviderDisplayName(right.provider))),
    [activeProviderCheckins, providersById],
  );

  const totalEntradas = transactions.filter((t) => t.type === "entrada").reduce((acc, t) => acc + (t.value || 0), 0);
  const totalSaidas = transactions.filter((t) => t.type === "saida").reduce((acc, t) => acc + (t.value || 0), 0);
  const saldo = totalEntradas - totalSaidas;
  const margemLiquida = totalEntradas > 0 ? ((saldo / totalEntradas) * 100).toFixed(1) : 0;

  const pendentesReceber = scheduled
    .filter((s) => s.status === "pendente" && s.type === "entrada")
    .reduce((acc, s) => acc + (s.value || 0), 0);
  const pendentesPagar = scheduled
    .filter((s) => s.status === "pendente" && s.type === "saida")
    .reduce((acc, s) => acc + (s.value || 0), 0);

  const agendamentosHoje = appointments.filter((appointment) => doesAppointmentOccurOnDate(appointment, hoje)).length;
  const servicosHoje = servicesProvided.filter((item) => item.date === hoje).length;
  const totalReposicoes = replacements.filter((item) => item.status === "disponivel").length;
  const totalAgendamentos = appointments.length;
  const planosAtivos = plans.filter((item) => item.status === "ativo").length;
  const receitaMensalPlanos = plans
    .filter((item) => item.status === "ativo")
    .reduce((acc, item) => acc + (item.monthly_value || 0), 0);

  const getMonthlyData = () => {
    const months = [];
    const numMeses = parseInt(periodoMeses, 10);
    for (let i = numMeses - 1; i >= 0; i -= 1) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const entradasMes = transactions
        .filter((t) => {
          const d = new Date(t.date);
          return t.type === "entrada" && d >= start && d <= end;
        })
        .reduce((acc, t) => acc + (t.value || 0), 0);
      const saidasMes = transactions
        .filter((t) => {
          const d = new Date(t.date);
          return t.type === "saida" && d >= start && d <= end;
        })
        .reduce((acc, t) => acc + (t.value || 0), 0);
      months.push({
        mes: format(date, "MMM/yy", { locale: ptBR }),
        entradas: entradasMes,
        saidas: saidasMes,
        lucro: entradasMes - saidasMes,
      });
    }
    return months;
  };

  const monthlyData = getMonthlyData();

  const filterByPeriod = (data, dateField = "date") => {
    const dias = parseInt(periodoDias, 10);
    const limite = subDays(new Date(), dias);
    return data.filter((item) => new Date(item[dateField]) >= limite);
  };

  const serviceFrequency = useMemo(() => {
    const filtered = filterByPeriod(servicesProvided);
    const grouped = filtered.reduce((acc, item) => {
      acc[item.service || "outros"] = (acc[item.service || "outros"] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([name, value], index) => ({
        name: getServiceName(name),
        value,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [periodoDias, servicesProvided]);

  const topDogs = useMemo(() => {
    const filtered = filterByPeriod(servicesProvided);
    const grouped = filtered.reduce((acc, item) => {
      acc[item.dog_id] = (acc[item.dog_id] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([dogId, count]) => ({
        dogId,
        name: dogsById[dogId]?.nome || "Desconhecido",
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [dogsById, periodoDias, servicesProvided]);

  const absentDogs = useMemo(() => {
    const ultimoServico = {};
    servicesProvided.forEach((item) => {
      if (!ultimoServico[item.dog_id] || new Date(item.date) > new Date(ultimoServico[item.dog_id])) {
        ultimoServico[item.dog_id] = item.date;
      }
    });
    const now = new Date();
    return dogs
      .filter((dog) => dog.ativo !== false)
      .map((dog) => {
        const ultima = ultimoServico[dog.id];
        const dias = ultima ? differenceInDays(now, new Date(ultima)) : 999;
        return { ...dog, ultimaVisita: ultima, diasAusente: dias };
      })
      .filter((dog) => dog.diasAusente > 30)
      .sort((a, b) => b.diasAusente - a.diasAusente);
  }, [dogs, servicesProvided]);

  const existingRiskConfig = useMemo(
    () => (configs || []).find((item) => item.key === RISK_RULES_CONFIG_KEY) || null,
    [configs],
  );

  const riskRules = useMemo(
    () => normalizeRiskRules(existingRiskConfig?.value),
    [existingRiskConfig],
  );

  const openLancamentos = useMemo(
    () => lancamentos.filter((item) => isOpenLancamento(item)),
    [lancamentos],
  );

  const companyRiskAlerts = useMemo(() => {
    return riskRules
      .filter((rule) => rule.active)
      .map((rule) => {
        const thresholdValue = Math.max(1, Number(rule.threshold_value) || 0);
        const recebedorNeedle = normalizeText(rule.recebedor_match);
        const matchingEntries = openLancamentos.filter((item) =>
          normalizeText(item.recebedor || "").includes(recebedorNeedle),
        );
        const overdueEntries = matchingEntries.filter((item) => {
          if (!item.vencimento) return false;
          return differenceInDays(new Date(), new Date(`${item.vencimento}T12:00:00`)) > 0;
        });
        const maxOverdueDays = overdueEntries.reduce((max, item) => {
          if (!item.vencimento) return max;
          return Math.max(max, differenceInDays(new Date(), new Date(`${item.vencimento}T12:00:00`)));
        }, 0);
        const overdueCount = overdueEntries.length;
        const totalOpenAmount = matchingEntries.reduce((sum, item) => sum + getOpenLancamentoAmount(item), 0);

        const triggered =
          rule.threshold_type === "overdue_days"
            ? maxOverdueDays >= thresholdValue
            : overdueCount >= thresholdValue;

        if (!triggered) return null;

        return {
          id: rule.id,
          title: rule.title || rule.recebedor_match,
          recebedor: rule.recebedor_match,
          message: rule.message || "Situação de risco configurada pelo financeiro.",
          impactSector: rule.impact_sector || "Operação",
          thresholdType: rule.threshold_type,
          thresholdValue,
          overdueCount,
          maxOverdueDays,
          totalOpenAmount,
          matchingEntries,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const leftScore = left.thresholdType === "overdue_days" ? left.maxOverdueDays : left.overdueCount;
        const rightScore = right.thresholdType === "overdue_days" ? right.maxOverdueDays : right.overdueCount;
        return rightScore - leftScore;
      });
  }, [openLancamentos, riskRules]);

  const openRiskDialog = () => {
    setRiskRulesDraft(riskRules.length > 0 ? riskRules : [createEmptyRiskRule()]);
    setEditingRiskRuleId(null);
    setRiskDialogOpen(true);
  };

  const handleRiskRuleChange = (ruleId, field, value) => {
    setRiskRulesDraft((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule)),
    );
  };

  const handleAddRiskRule = () => {
    const newRule = createEmptyRiskRule();
    setRiskRulesDraft((current) => [...current, newRule]);
    setEditingRiskRuleId(newRule.id);
  };

  const handleRemoveRiskRule = (ruleId) => {
    setRiskRulesDraft((current) => {
      const next = current.filter((rule) => rule.id !== ruleId);
      return next.length > 0 ? next : [createEmptyRiskRule()];
    });
    if (editingRiskRuleId === ruleId) {
      setEditingRiskRuleId(null);
    }
  };

  const handleSaveRiskRules = async () => {
    const cleanedRules = riskRulesDraft
      .map((rule) => ({
        ...rule,
        title: String(rule.title || "").trim(),
        recebedor_match: String(rule.recebedor_match || "").trim(),
        threshold_value: String(rule.threshold_value || "").trim(),
        message: String(rule.message || "").trim(),
        impact_sector: String(rule.impact_sector || "").trim(),
      }))
      .filter((rule) => rule.recebedor_match && rule.threshold_value);

    setIsSavingRiskRules(true);
    try {
      const payload = {
        key: RISK_RULES_CONFIG_KEY,
        label: "Regras de risco financeiro do cockpit",
        description: "Regras para alertas operacionais e financeiros baseados em contas a pagar.",
        value: { rules: cleanedRules },
        ativo: true,
        empresa_id: currentUser?.empresa_id || existingRiskConfig?.empresa_id || null,
      };

      if (existingRiskConfig?.id) {
        await AppConfig.update(existingRiskConfig.id, payload);
      } else {
        await AppConfig.create(payload);
      }

      setRiskDialogOpen(false);
      await loadData();
    } catch (error) {
      alert(error?.message || "Não foi possível salvar as regras de risco.");
    } finally {
      setIsSavingRiskRules(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <BarChart3 className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cockpit</h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">Visão completa do sistema</p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="border-green-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Entradas</p>
                  <p className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(totalEntradas)}</p>
                </div>
                <ArrowUpCircle className="h-7 w-7 text-green-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Saídas</p>
                  <p className="text-lg sm:text-2xl font-bold text-red-600">{formatCurrency(totalSaidas)}</p>
                </div>
                <ArrowDownCircle className="h-7 w-7 text-red-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className={`border-${saldo >= 0 ? "blue" : "orange"}-200 bg-white`}>
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Saldo</p>
                  <p className={`text-lg sm:text-2xl font-bold ${saldo >= 0 ? "text-blue-600" : "text-orange-600"}`}>
                    {formatCurrency(saldo)}
                  </p>
                </div>
                <DollarSign className={`h-7 w-7 sm:h-10 sm:w-10 ${saldo >= 0 ? "text-blue-500" : "text-orange-500"}`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Margem</p>
                  <p className="text-lg sm:text-2xl font-bold text-purple-600">{margemLiquida}%</p>
                </div>
                <Activity className="h-7 w-7 text-purple-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Agendamentos Hoje</p>
                  <p className="text-lg sm:text-2xl font-bold text-blue-600">{agendamentosHoje}</p>
                </div>
                <Calendar className="h-7 w-7 text-blue-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Serviços Hoje</p>
                  <p className="text-lg sm:text-2xl font-bold text-emerald-600">{servicosHoje}</p>
                </div>
                <Clipboard className="h-7 w-7 text-emerald-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">A Receber</p>
                  <p className="text-lg sm:text-2xl font-bold text-orange-600">{formatCurrency(pendentesReceber)}</p>
                </div>
                <Clock className="h-7 w-7 text-orange-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-pink-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">A Pagar</p>
                  <p className="text-lg sm:text-2xl font-bold text-pink-600">{formatCurrency(pendentesPagar)}</p>
                </div>
                <TrendingUp className="h-7 w-7 text-pink-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Card className="border-indigo-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Planos Ativos</p>
                  <p className="text-lg sm:text-2xl font-bold text-indigo-600">{planosAtivos}</p>
                </div>
                <CreditCard className="h-7 w-7 text-indigo-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-teal-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Receita Mensal (Planos)</p>
                  <p className="text-lg sm:text-2xl font-bold text-teal-600">{formatCurrency(receitaMensalPlanos)}</p>
                </div>
                <TrendingUp className="h-7 w-7 text-teal-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Reposições Disponíveis</p>
                  <p className="text-lg sm:text-2xl font-bold text-amber-600">{totalReposicoes}</p>
                </div>
                <RefreshCw className="h-7 w-7 text-amber-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 bg-white">
            <CardContent className="p-2.5 sm:p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm text-gray-600">Total Agendamentos</p>
                  <p className="text-lg sm:text-2xl font-bold text-cyan-600">{totalAgendamentos}</p>
                </div>
                <Calendar className="h-7 w-7 text-cyan-500 sm:h-10 sm:w-10" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-3 sm:p-4">
            <Select value={currentView} onValueChange={setCurrentView}>
              <SelectTrigger className="h-9 w-full text-[13px] sm:h-10 sm:w-80 sm:text-sm">
                <SelectValue placeholder="Selecione o relatório" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resumo">Resumo Geral</SelectItem>
                <SelectItem value="financeiro">Financeiro (Entradas x Saídas)</SelectItem>
                <SelectItem value="frequencia">Frequência de Serviços</SelectItem>
                <SelectItem value="ranking">Top 10 Cães</SelectItem>
                <SelectItem value="ausentes">Cães Ausentes</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {currentView === "resumo" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="border-emerald-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <DogIcon className="w-5 h-5 text-emerald-600" />
                    Presenças dos cães
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Presentes agora</p>
                      <p className="text-3xl font-bold text-emerald-700">{presentDogs.length}</p>
                    </div>
                    <Badge className="bg-emerald-100 text-emerald-700">Hoje</Badge>
                  </div>
                  <div className="space-y-2">
                    {presentDogs.slice(0, 6).map(({ checkin, dog }) => (
                      <div key={checkin.id} className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{getDogDisplayName(dog)}</p>
                            <p className="text-xs text-gray-500">{dog?.raca || "Raça não informada"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-emerald-700">
                              {getServiceName(checkin?.service_type || checkin?.service)}
                            </p>
                            <p className="text-xs text-gray-500">{formatTimeLabel(checkin?.checkin_datetime || checkin?.data_checkin)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {presentDogs.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum cão presente no momento.</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-blue-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    Presenças da equipe
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Funcionários presentes</p>
                      <p className="text-3xl font-bold text-blue-700">{presentProviders.length}</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700">Escala ativa</Badge>
                  </div>
                  <div className="space-y-2">
                    {presentProviders.slice(0, 6).map(({ checkin, provider }) => (
                      <div key={checkin.id} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{getProviderDisplayName(provider)}</p>
                            <p className="text-xs text-gray-500">{getProviderRoleLabel(provider)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-medium text-blue-700">Entrada</p>
                            <p className="text-xs text-gray-500">{formatTimeLabel(checkin?.checkin_datetime || checkin?.data_checkin)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {presentProviders.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum funcionário presente no momento.</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-white">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-red-600" />
                        Alertas da empresa
                      </CardTitle>
                      <p className="mt-1 text-sm text-gray-500">
                        Situações de risco programadas pelo financeiro.
                      </p>
                    </div>
                    {canManageRiskRules ? (
                      <Button type="button" variant="outline" size="sm" onClick={openRiskDialog}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Configurar
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Alertas ativos</p>
                      <p className="text-3xl font-bold text-red-700">{companyRiskAlerts.length}</p>
                    </div>
                    <Badge className="bg-red-100 text-red-700">
                      {riskRules.filter((rule) => rule.active).length} regra(s)
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {companyRiskAlerts.slice(0, 4).map((alert) => (
                      <div key={alert.id} className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-red-900">{alert.title}</p>
                            <p className="text-sm text-gray-700">{alert.message}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {alert.recebedor} · Impacto: {alert.impactSector}
                            </p>
                          </div>
                          <Badge className="bg-white text-red-700 border border-red-200">
                            {alert.thresholdType === "overdue_days"
                              ? `${alert.maxOverdueDays} dia(s)`
                              : `${alert.overdueCount} conta(s)`}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                          <Badge variant="outline">{formatCurrency(alert.totalOpenAmount)} em aberto</Badge>
                          <Badge variant="outline">{alert.matchingEntries.length} lançamento(s)</Badge>
                        </div>
                      </div>
                    ))}
                    {companyRiskAlerts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                        Nenhum alerta disparado no momento.
                        {canManageRiskRules ? " Configure regras para monitorar fornecedores e concessionárias críticas." : ""}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    Fluxo Mensal
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="entradas" name="Entradas" fill="#22C55E" />
                        <Bar dataKey="saidas" name="Saídas" fill="#EF4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-purple-600" />
                    Serviços por Tipo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie
                          data={serviceFrequency}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {serviceFrequency.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {currentView === "financeiro" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Entradas x Saídas</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Legend />
                        <Bar dataKey="entradas" name="Entradas" fill="#22C55E" />
                        <Bar dataKey="saidas" name="Saídas" fill="#EF4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Evolução do Lucro</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" />
                        <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v) => formatCurrency(v)} />
                        <Line type="monotone" dataKey="lucro" name="Lucro" stroke="#8B5CF6" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {currentView === "frequencia" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoDias} onValueChange={setPeriodoDias}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Frequência por Serviço</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serviceFrequency}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="value" name="Atendimentos" fill="#3B82F6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Resumo</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serviceFrequency.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <Badge variant="outline">{item.value} atendimentos</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {currentView === "ranking" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoDias} onValueChange={setPeriodoDias}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  Top 10 Cães Mais Frequentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topDogs.map((item, index) => {
                    const dog = dogsById[item.dogId];
                    return (
                      <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 font-bold text-sm">
                          {index + 1}º
                        </div>
                        {dog?.foto_url ? (
                          <img src={dog.foto_url} alt={item.name} className="w-12 h-12 rounded-full object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                            <DogIcon className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-500">{dog?.raca || "Raça não informada"}</p>
                        </div>
                        <Badge className="bg-blue-100 text-blue-700">{item.count} visitas</Badge>
                      </div>
                    );
                  })}
                  {topDogs.length === 0 ? <p className="text-center text-gray-500 py-8">Nenhum dado encontrado.</p> : null}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {currentView === "ausentes" && (
          <Card className="border-gray-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                Cães ausentes há mais de 30 dias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {absentDogs.map((dog, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    {dog.foto_url ? (
                      <img src={dog.foto_url} alt={dog.nome} className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                        <DogIcon className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{dog.nome}</p>
                      <p className="text-sm text-gray-500">{dog.raca || "Raça não informada"}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-orange-100 text-orange-700">{dog.diasAusente} dias</Badge>
                      {dog.ultimaVisita ? (
                        <p className="text-xs text-gray-500 mt-1">
                          Última: {format(new Date(dog.ultimaVisita), "dd/MM/yy")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
                {absentDogs.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Todos os cães estão frequentando.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alertas de risco da empresa</DialogTitle>
            <DialogDescription>
              Defina regras que o financeiro quer monitorar no Cockpit. Quando a condição for atingida, o alerta aparecerá no painel com a mensagem e o impacto operacional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {riskRulesDraft.map((rule, index) => (
              <Card key={rule.id} className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Regra {index + 1}</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={rule.active}
                          onCheckedChange={(checked) => handleRiskRuleChange(rule.id, "active", checked === true)}
                        />
                        <span className="text-sm text-gray-600">Ativa</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveRiskRule(rule.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Título do alerta</Label>
                      <Input
                        value={rule.title}
                        onChange={(event) => handleRiskRuleChange(rule.id, "title", event.target.value)}
                        placeholder="Ex: CPFL em risco"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Recebedor monitorado</Label>
                      <Input
                        value={rule.recebedor_match}
                        onChange={(event) => handleRiskRuleChange(rule.id, "recebedor_match", event.target.value)}
                        placeholder="Ex: CPFL"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[220px_140px_1fr]">
                    <div className="space-y-2">
                      <Label>Condição</Label>
                      <Select
                        value={rule.threshold_type}
                        onValueChange={(value) => handleRiskRuleChange(rule.id, "threshold_type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open_count">Quantidade de contas vencidas</SelectItem>
                          <SelectItem value="overdue_days">Dias de atraso</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Limite</Label>
                      <Input
                        type="number"
                        min="1"
                        value={rule.threshold_value}
                        onChange={(event) => handleRiskRuleChange(rule.id, "threshold_value", event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Impacto no setor</Label>
                      <Input
                        value={rule.impact_sector}
                        onChange={(event) => handleRiskRuleChange(rule.id, "impact_sector", event.target.value)}
                        placeholder="Ex: Operação, Banho e Tosa, Transporte"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Mensagem do alerta</Label>
                    <Textarea
                      value={rule.message}
                      onChange={(event) => handleRiskRuleChange(rule.id, "message", event.target.value)}
                      placeholder="Ex: Risco de corte"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button type="button" variant="outline" className="w-full" onClick={handleAddRiskRule}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar regra
            </Button>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setRiskDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSaveRiskRules} disabled={isSavingRiskRules}>
              {isSavingRiskRules ? "Salvando..." : "Salvar regras"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
