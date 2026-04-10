import { useEffect, useMemo, useState } from "react";
import {
  Appointment,
  Carteira,
  CentroCusto,
  Checkin,
  ContaReceber,
  Dog,
  ExtratoBancario,
  Lancamento,
  Orcamento,
  PlanConfig,
  Responsavel,
  ServiceProvided,
} from "@/api/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowDownCircle,
  BarChart3,
  CalendarClock,
  CreditCard,
  Dog as DogIcon,
  Plus,
  RefreshCcw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { differenceInDays, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAppointmentDateKey, getServiceLabel } from "@/lib/attendance";
import {
  dedupeOfficialImportedMovements,
  formatCurrency,
  formatMovementDateTime,
  getMovementComparableDate,
  normalizeMovement,
} from "@/utils/finance";

const DOG_LINK_KEYS = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `dog_id_${index}`);
const FIXED_SERVICES = ["day_care", "banho", "tosa", "hospedagem", "transporte"];
const priorityLabels = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" };

function normalizeText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function normalizeService(value) {
  const text = normalizeText(value).replace(/\s+/g, "_");
  if (!text) return "sem_servico";
  if (text.includes("day") || text.includes("creche")) return "day_care";
  if (text.includes("hosp")) return "hospedagem";
  if (text.includes("banho") && text.includes("tosa")) return "banho_tosa";
  if (text.includes("banho")) return "banho";
  if (text.includes("tosa")) return "tosa";
  if (text.includes("transporte")) return "transporte";
  return text;
}

function serviceToAverageKeys(value) {
  const service = normalizeService(value);
  return service === "banho_tosa" ? ["banho", "tosa"] : [service];
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "dd/MM/yyyy", { locale: ptBR });
}

function monthKey(value) {
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "yyyy-MM");
}

function getDogIds(record) {
  return DOG_LINK_KEYS.map((key) => record?.[key]).filter(Boolean);
}

function getPlanClientId(plan, clientByDogId) {
  return plan?.carteira_id || plan?.client_id || plan?.cliente_id || clientByDogId[plan?.dog_id]?.id || "";
}

function getPlanMonthlyValue(plan) {
  return Number(plan?.monthly_value ?? plan?.valor_mensal ?? 0) || 0;
}

function getPlanRenewalLabel(plan, client) {
  if (plan?.data_renovacao) return formatDate(plan.data_renovacao);
  if (plan?.data_vencimento) return formatDate(plan.data_vencimento);
  const day = plan?.renovacao_dia || plan?.due_day || client?.vencimento_planos;
  return day ? `Dia ${day}` : "-";
}

function isPaidConta(conta) {
  return conta?.data_recebimento || conta?.status === "pago";
}

function statusBadge(status) {
  const value = status || "pendente";
  if (["aprovado", "pago", "quitada", "realizado_hoje"].includes(value)) {
    return <Badge className="bg-green-100 text-green-700">{value}</Badge>;
  }
  if (["vencido", "recusado", "cancelado"].includes(value)) {
    return <Badge className="bg-red-100 text-red-700">{value}</Badge>;
  }
  if (["enviado", "pendente"].includes(value)) {
    return <Badge className="bg-blue-100 text-blue-700">{value}</Badge>;
  }
  return <Badge variant="outline">{value}</Badge>;
}

async function safeLoad(label, loader, errors) {
  try {
    return await loader();
  } catch (error) {
    errors.push(`${label}: ${error?.message || "falha ao carregar"}`);
    return [];
  }
}

export default function ControleGerencial() {
  const [data, setData] = useState({
    plans: [], dogs: [], carteiras: [], responsaveis: [], contas: [], orcamentos: [],
    usages: [], checkins: [], appointments: [], extrato: [], lancamentos: [], centrosCusto: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadWarnings, setLoadWarnings] = useState([]);
  const [activeTab, setActiveTab] = useState("clientes");
  const [periodMonths, setPeriodMonths] = useState("6");
  const [absenceThreshold, setAbsenceThreshold] = useState("30");
  const [searchTerm, setSearchTerm] = useState("");
  const [newCostCenterName, setNewCostCenterName] = useState("");
  const [isSavingCostCenter, setIsSavingCostCenter] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setIsLoading(true);
    const errors = [];
    const [
      plans, dogs, carteiras, responsaveis, contas, orcamentos,
      usages, checkins, appointments, extrato, lancamentos, centrosCusto,
    ] = await Promise.all([
      safeLoad("Planos", () => PlanConfig.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Cães", () => Dog.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Responsáveis financeiros", () => Carteira.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Responsáveis", () => Responsavel.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Contas a receber", () => ContaReceber.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Orçamentos", () => Orcamento.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Utilizações", () => ServiceProvided.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Check-ins", () => Checkin.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Agendamentos", () => Appointment.listAll("-created_date", 1000, 10000), errors),
      safeLoad("Extrato", () => ExtratoBancario.listAll("-data_movimento", 1000, 20000), errors),
      safeLoad("Contas a pagar", () => Lancamento.listAll("-vencimento", 1000, 10000), errors),
      safeLoad("Centros de custo", () => CentroCusto.listAll("nome", 1000, 5000), errors),
    ]);
    setData({ plans, dogs, carteiras, responsaveis, contas, orcamentos, usages, checkins, appointments, extrato, lancamentos, centrosCusto });
    setLoadWarnings(errors);
    setIsLoading(false);
  }

  async function handleCreateCostCenter() {
    const name = newCostCenterName.trim();
    if (!name) return;
    setIsSavingCostCenter(true);
    try {
      await CentroCusto.create({ nome: name, ativo: true });
      setNewCostCenterName("");
      await loadData();
    } catch (error) {
      alert(`Erro ao criar centro de custo: ${error?.message || "falha desconhecida"}`);
    } finally {
      setIsSavingCostCenter(false);
    }
  }

  const indexes = useMemo(() => {
    const dogsById = Object.fromEntries(data.dogs.map((item) => [item.id, item]));
    const clientsById = Object.fromEntries(data.carteiras.map((item) => [item.id, item]));
    const responsaveisById = Object.fromEntries(data.responsaveis.map((item) => [item.id, item]));
    const clientByDogId = {};
    const responsavelByDogId = {};

    data.carteiras.forEach((client) => {
      getDogIds(client).forEach((dogId) => {
        if (!clientByDogId[dogId]) clientByDogId[dogId] = client;
      });
    });
    data.responsaveis.forEach((responsavel) => {
      getDogIds(responsavel).forEach((dogId) => {
        if (!responsavelByDogId[dogId]) responsavelByDogId[dogId] = responsavel;
      });
    });
    return { dogsById, clientsById, responsaveisById, clientByDogId, responsavelByDogId };
  }, [data.carteiras, data.dogs, data.responsaveis]);

  const period = useMemo(() => {
    const months = Number(periodMonths) || 6;
    return {
      months,
      start: startOfMonth(subMonths(new Date(), Math.max(months - 1, 0))),
      end: endOfMonth(new Date()),
    };
  }, [periodMonths]);

  const usageAveragesByDog = useMemo(() => {
    const byDog = {};
    const register = ({ dogId, service, date }) => {
      if (!dogId || !service || !date) return;
      const parsed = new Date(String(date).includes("T") ? date : `${date}T12:00:00`);
      if (Number.isNaN(parsed.getTime()) || parsed < period.start || parsed > period.end) return;
      const key = monthKey(date);
      if (!key) return;
      serviceToAverageKeys(service).forEach((serviceKey) => {
        if (!FIXED_SERVICES.includes(serviceKey)) return;
        byDog[dogId] ||= {};
        byDog[dogId][serviceKey] ||= {};
        byDog[dogId][serviceKey][key] = (byDog[dogId][serviceKey][key] || 0) + 1;
      });
    };

    data.usages.forEach((usage) => register({
      dogId: usage.dog_id,
      service: usage.service_type || usage.service,
      date: usage.data_utilizacao || usage.date || usage.created_date,
    }));
    data.checkins.forEach((checkin) => register({
      dogId: checkin.dog_id,
      service: checkin.service_type,
      date: checkin.checkin_datetime || checkin.data_checkin || checkin.created_date,
    }));

    return Object.fromEntries(Object.entries(byDog).map(([dogId, services]) => [
      dogId,
      Object.fromEntries(FIXED_SERVICES.map((service) => {
        const total = Object.values(services[service] || {}).reduce((sum, value) => sum + value, 0);
        return [service, total / period.months];
      })),
    ]));
  }, [data.checkins, data.usages, period]);

  const fixedClientRows = useMemo(() => {
    const grouped = new Map();
    data.plans
      .filter((plan) => (plan.status || "ativo") === "ativo" && plan.cliente_fixo !== false)
      .forEach((plan) => {
        const dog = indexes.dogsById[plan.dog_id];
        const clientId = getPlanClientId(plan, indexes.clientByDogId);
        const client = indexes.clientsById[clientId] || indexes.clientByDogId[plan.dog_id];
        const responsavel = plan.responsavel_id ? indexes.responsaveisById[plan.responsavel_id] : indexes.responsavelByDogId[plan.dog_id];
        const key = `${client?.id || clientId || "sem_cliente"}|${dog?.id || plan.dog_id || "sem_cao"}`;
        const current = grouped.get(key) || {
          key,
          responsavel: responsavel?.nome_completo || client?.nome_razao_social || "-",
          responsavelFinanceiro: client?.nome_razao_social || plan.client_name || "-",
          cao: dog?.nome || "Cão não encontrado",
          dogId: dog?.id || plan.dog_id,
          dataRenovacao: getPlanRenewalLabel(plan, client),
          monthlyValue: 0,
        };
        current.monthlyValue += getPlanMonthlyValue(plan);
        grouped.set(key, current);
      });

    return Array.from(grouped.values())
      .map((row) => ({ ...row, averages: usageAveragesByDog[row.dogId] || {} }))
      .filter((row) => normalizeText([row.responsavel, row.responsavelFinanceiro, row.cao].join(" ")).includes(normalizeText(searchTerm)))
      .sort((a, b) => a.responsavelFinanceiro.localeCompare(b.responsavelFinanceiro));
  }, [data.plans, indexes, searchTerm, usageAveragesByDog]);

  const fixedReceiptsByService = useMemo(() => {
    const grouped = {};
    data.plans
      .filter((plan) => (plan.status || "ativo") === "ativo" && plan.cliente_fixo !== false)
      .forEach((plan) => {
        const service = normalizeService(plan.service || plan.tipo_plano);
        grouped[service] ||= { service, clients: new Set(), dogs: new Set(), plans: 0, value: 0 };
        grouped[service].clients.add(getPlanClientId(plan, indexes.clientByDogId) || plan.client_name || "sem_cliente");
        grouped[service].dogs.add(plan.dog_id || "sem_cao");
        grouped[service].plans += 1;
        grouped[service].value += getPlanMonthlyValue(plan);
      });
    return Object.values(grouped).map((item) => ({
      ...item,
      clientsCount: item.clients.size,
      dogsCount: item.dogs.size,
    })).sort((a, b) => b.value - a.value);
  }, [data.plans, indexes.clientByDogId]);

  const expenseRows = useMemo(() => {
    const rows = dedupeOfficialImportedMovements(data.extrato || [])
      .map((item) => normalizeMovement(item))
      .filter((item) => item.tipo === "saida")
      .filter((item) => {
        const date = getMovementComparableDate(item);
        return !date || (date >= period.start && date <= period.end);
      })
      .map((item) => ({
        id: item.id,
        despesa: item.contraparte || item.descricao || "Saída sem descrição",
        valor: Math.abs(Number(item.valor || 0)),
        centro: item.centro_custo_nome || item.metadata_financeira?.centro_custo_nome || "Sem centro de custo",
        dataSaida: formatMovementDateTime(item),
        vencimento: "-",
      }));

    data.lancamentos.forEach((item) => {
      const date = item.vencimento ? new Date(`${item.vencimento}T12:00:00`) : null;
      if (date && (date < period.start || date > period.end)) return;
      rows.push({
        id: `lancamento-${item.id}`,
        despesa: item.descricao || item.recebedor || item.categoria || "Conta a pagar",
        valor: Number(item.valor || 0) + Number(item.juros_multa || 0),
        centro: item.centro_custo_nome || item.categoria || "Sem centro de custo",
        dataSaida: item.data_quitacao ? formatDate(item.data_quitacao) : "-",
        vencimento: formatDate(item.vencimento),
      });
    });

    return rows.filter((row) => normalizeText([row.despesa, row.centro].join(" ")).includes(normalizeText(searchTerm)));
  }, [data.extrato, data.lancamentos, period, searchTerm]);

  const expensesByCostCenter = useMemo(() => {
    const grouped = {};
    expenseRows.forEach((row) => {
      grouped[row.centro] ||= { centro: row.centro, valor: 0, quantidade: 0 };
      grouped[row.centro].valor += row.valor || 0;
      grouped[row.centro].quantidade += 1;
    });
    return Object.values(grouped).sort((a, b) => b.valor - a.valor);
  }, [expenseRows]);

  const receivablesByBudget = useMemo(() => {
    const contasByOrcamento = {};
    data.contas.forEach((conta) => {
      if (!conta.orcamento_id) return;
      contasByOrcamento[conta.orcamento_id] ||= [];
      contasByOrcamento[conta.orcamento_id].push(conta);
    });

    const ids = new Set([...data.orcamentos.map((orcamento) => orcamento.id), ...Object.keys(contasByOrcamento)]);
    return Array.from(ids).map((id) => {
      const orcamento = data.orcamentos.find((item) => item.id === id) || {};
      const contas = contasByOrcamento[id] || [];
      const client = indexes.clientsById[orcamento.cliente_id || contas[0]?.cliente_id];
      const charged = contas.reduce((sum, conta) => sum + Number(conta.valor || 0), 0);
      const received = contas.filter(isPaidConta).reduce((sum, conta) => sum + Number(conta.valor || 0), 0);
      const total = Number(orcamento.valor_total || charged || 0);
      return {
        id,
        cliente: client?.nome_razao_social || "-",
        status: orcamento.status || contas[0]?.status || "pendente",
        valorOrcamento: total,
        valorCobrado: charged,
        valorRecebido: received,
        valorAberto: Math.max((charged || total) - received, 0),
        vencimento: contas.map((conta) => conta.vencimento).filter(Boolean).sort()[0] || orcamento.data_validade || "",
      };
    })
      .filter((row) => row.valorOrcamento > 0 || row.valorCobrado > 0)
      .filter((row) => normalizeText([row.cliente, row.id, row.status].join(" ")).includes(normalizeText(searchTerm)))
      .sort((a, b) => String(b.vencimento || "").localeCompare(String(a.vencimento || "")));
  }, [data.contas, data.orcamentos, indexes.clientsById, searchTerm]);

  const payableRows = useMemo(() => {
    const sorted = [...data.lancamentos].sort((a, b) => String(a.vencimento || a.created_date || "").localeCompare(String(b.vencimento || b.created_date || "")));
    const previousByKey = {};
    const withPrevious = sorted.map((item) => {
      const key = normalizeText([item.recebedor, item.categoria, item.referencia].join("|"));
      const previous = previousByKey[key];
      previousByKey[key] = item;
      return { ...item, valorAnteriorCalculado: Number(item.valor_anterior ?? previous?.valor ?? 0) || 0 };
    });
    return withPrevious
      .filter((item) => normalizeText([item.referencia, item.descricao, item.recebedor, item.categoria, item.prioridade].join(" ")).includes(normalizeText(searchTerm)))
      .sort((a, b) => String(b.vencimento || "").localeCompare(String(a.vencimento || "")));
  }, [data.lancamentos, searchTerm]);

  const absentDogs = useMemo(() => {
    const lastByDogId = {};
    data.checkins.forEach((checkin) => {
      const date = checkin.checkin_datetime || checkin.data_checkin || checkin.created_date;
      if (!checkin.dog_id || !date) return;
      if (!lastByDogId[checkin.dog_id] || new Date(date) > new Date(lastByDogId[checkin.dog_id])) {
        lastByDogId[checkin.dog_id] = date;
      }
    });

    const threshold = Number(absenceThreshold) || 30;
    return data.dogs
      .filter((dog) => dog.ativo !== false)
      .map((dog) => {
        const last = lastByDogId[dog.id];
        const days = last ? differenceInDays(new Date(), new Date(last)) : 9999;
        return {
          ...dog,
          ultimoCheckin: last,
          diasAusente: days,
          responsavelFinanceiro: indexes.clientByDogId[dog.id]?.nome_razao_social || "-",
        };
      })
      .filter((dog) => dog.diasAusente >= threshold)
      .filter((dog) => normalizeText([dog.nome, dog.raca, dog.responsavelFinanceiro].join(" ")).includes(normalizeText(searchTerm)))
      .sort((a, b) => b.diasAusente - a.diasAusente);
  }, [absenceThreshold, data.checkins, data.dogs, indexes.clientByDogId, searchTerm]);

  const recentAppointmentsByDog = useMemo(() => {
    const byDog = {};
    data.appointments.forEach((appointment) => {
      const date = getAppointmentDateKey(appointment);
      if (!appointment.dog_id || !date) return;
      byDog[appointment.dog_id] ||= [];
      byDog[appointment.dog_id].push(appointment);
    });
    Object.values(byDog).forEach((items) => items.sort((a, b) => String(getAppointmentDateKey(b)).localeCompare(String(getAppointmentDateKey(a)))));
    return byDog;
  }, [data.appointments]);

  const stats = useMemo(() => ({
    clientesFixos: fixedClientRows.length,
    receitaFixa: fixedReceiptsByService.reduce((sum, item) => sum + item.value, 0),
    despesasCentro: expensesByCostCenter.reduce((sum, item) => sum + item.valor, 0),
    receberOrcamentos: receivablesByBudget.reduce((sum, item) => sum + item.valorAberto, 0),
    contasPagar: payableRows
      .filter((item) => !item.data_quitacao && item.status !== "quitada" && item.status !== "realizado_hoje")
      .reduce((sum, item) => sum + Math.max((Number(item.valor || 0) + Number(item.juros_multa || 0)) - Number(item.valor_quitado || 0), 0), 0),
    caesAusentes: absentDogs.length,
  }), [absentDogs.length, expensesByCostCenter, fixedClientRows.length, fixedReceiptsByService, payableRows, receivablesByBudget]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-2xl bg-slate-900 p-3">
              <BarChart3 className="h-6 w-6 text-orange-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Controle Gerencial</h1>
              <p className="mt-1 text-sm text-gray-600">Clientes fixos, cobranças, custos, orçamentos, contas e ausências por unidade.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={periodMonths} onValueChange={setPeriodMonths}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
          </div>
        </div>

        {loadWarnings.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4 text-sm text-amber-800">
              Alguns dados não carregaram. Se for a primeira vez usando esta tela, execute o arquivo supabase-schema-controle-gerencial.sql no Supabase.
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
          <Card className="border-blue-200 bg-white"><CardContent className="p-4"><Users className="mb-3 h-6 w-6 text-blue-600" /><p className="text-xs text-gray-500">Clientes fixos</p><p className="text-2xl font-bold text-blue-700">{stats.clientesFixos}</p></CardContent></Card>
          <Card className="border-green-200 bg-white"><CardContent className="p-4"><Wallet className="mb-3 h-6 w-6 text-green-600" /><p className="text-xs text-gray-500">Receita fixa/mês</p><p className="text-xl font-bold text-green-700">{formatCurrency(stats.receitaFixa)}</p></CardContent></Card>
          <Card className="border-red-200 bg-white"><CardContent className="p-4"><ArrowDownCircle className="mb-3 h-6 w-6 text-red-600" /><p className="text-xs text-gray-500">Despesas no período</p><p className="text-xl font-bold text-red-700">{formatCurrency(stats.despesasCentro)}</p></CardContent></Card>
          <Card className="border-orange-200 bg-white"><CardContent className="p-4"><CalendarClock className="mb-3 h-6 w-6 text-orange-600" /><p className="text-xs text-gray-500">A receber/orçamentos</p><p className="text-xl font-bold text-orange-700">{formatCurrency(stats.receberOrcamentos)}</p></CardContent></Card>
          <Card className="border-pink-200 bg-white"><CardContent className="p-4"><CreditCard className="mb-3 h-6 w-6 text-pink-600" /><p className="text-xs text-gray-500">Contas a pagar</p><p className="text-xl font-bold text-pink-700">{formatCurrency(stats.contasPagar)}</p></CardContent></Card>
          <Card className="border-amber-200 bg-white"><CardContent className="p-4"><DogIcon className="mb-3 h-6 w-6 text-amber-600" /><p className="text-xs text-gray-500">Cães ausentes</p><p className="text-2xl font-bold text-amber-700">{stats.caesAusentes}</p></CardContent></Card>
        </div>

        <Card className="border-gray-200 bg-white">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Buscar em clientes, cães, despesas, orçamentos e contas" className="pl-9" />
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
            <TabsTrigger value="clientes">Clientes fixos</TabsTrigger>
            <TabsTrigger value="recebimentos">Recebimentos fixos</TabsTrigger>
            <TabsTrigger value="despesas">Despesas</TabsTrigger>
            <TabsTrigger value="orcamentos">A receber</TabsTrigger>
            <TabsTrigger value="pagar">Contas a pagar</TabsTrigger>
            <TabsTrigger value="ausentes">Cães ausentes</TabsTrigger>
          </TabsList>

          <TabsContent value="clientes">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle>Clientes fixos e comparativo mensal</CardTitle>
                <p className="text-sm text-gray-500">As médias representam utilizações por mês no período selecionado.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Responsável financeiro</TableHead>
                      <TableHead>Cão</TableHead>
                      <TableHead>Data de renovação</TableHead>
                      <TableHead className="text-right">Média Day Care</TableHead>
                      <TableHead className="text-right">Média Banho</TableHead>
                      <TableHead className="text-right">Média Tosa</TableHead>
                      <TableHead className="text-right">Média Hospedagem</TableHead>
                      <TableHead className="text-right">Média Transporte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fixedClientRows.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-10 text-center text-gray-500">Nenhum cliente fixo encontrado.</TableCell></TableRow>
                    ) : fixedClientRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{row.responsavel}</TableCell>
                        <TableCell className="font-medium">{row.responsavelFinanceiro}</TableCell>
                        <TableCell>{row.cao}</TableCell>
                        <TableCell>{row.dataRenovacao}</TableCell>
                        {FIXED_SERVICES.map((service) => (
                          <TableCell key={service} className="text-right">{(row.averages[service] || 0).toFixed(1)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recebimentos">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle>Recebimentos fixos por serviço</CardTitle>
                <p className="text-sm text-gray-500">Baseado nos planos recorrentes ativos marcados como cliente fixo.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead className="text-right">Planos</TableHead>
                      <TableHead className="text-right">Clientes fixos</TableHead>
                      <TableHead className="text-right">Cães</TableHead>
                      <TableHead className="text-right">Valor mensal previsto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fixedReceiptsByService.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center text-gray-500">Nenhum recebimento fixo encontrado.</TableCell></TableRow>
                    ) : fixedReceiptsByService.map((row) => (
                      <TableRow key={row.service}>
                        <TableCell className="font-medium">{getServiceLabel(row.service)}</TableCell>
                        <TableCell className="text-right">{row.plans}</TableCell>
                        <TableCell className="text-right">{row.clientsCount}</TableCell>
                        <TableCell className="text-right">{row.dogsCount}</TableCell>
                        <TableCell className="text-right font-semibold text-green-700">{formatCurrency(row.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="despesas">
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Centros de custo</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input value={newCostCenterName} onChange={(event) => setNewCostCenterName(event.target.value)} placeholder="Novo centro de custo" />
                    <Button onClick={handleCreateCostCenter} disabled={isSavingCostCenter || !newCostCenterName.trim()}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <div className="space-y-2">
                    {data.centrosCusto.length === 0 ? (
                      <p className="text-sm text-gray-500">Nenhum centro cadastrado.</p>
                    ) : data.centrosCusto.map((item) => (
                      <div key={item.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">{item.nome}</div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Despesas por centro de custo</CardTitle>
                  <p className="text-sm text-gray-500">Une saídas do extrato e contas planejadas no período selecionado.</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    {expensesByCostCenter.slice(0, 6).map((item) => (
                      <div key={item.centro} className="rounded-xl border border-red-100 bg-red-50 p-4">
                        <p className="text-sm font-medium text-gray-800">{item.centro}</p>
                        <p className="mt-2 text-xl font-bold text-red-700">{formatCurrency(item.valor)}</p>
                        <p className="mt-1 text-xs text-gray-500">{item.quantidade} lançamento(s)</p>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Despesa</TableHead><TableHead>Centro de custo</TableHead><TableHead>Data da saída</TableHead><TableHead>Vencimento</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {expenseRows.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="py-10 text-center text-gray-500">Nenhuma despesa encontrada.</TableCell></TableRow>
                        ) : expenseRows.slice(0, 120).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>{row.despesa}</TableCell>
                            <TableCell><Badge variant="outline">{row.centro}</Badge></TableCell>
                            <TableCell>{row.dataSaida}</TableCell>
                            <TableCell>{row.vencimento}</TableCell>
                            <TableCell className="text-right font-semibold text-red-700">{formatCurrency(row.valor)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orcamentos">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle>Valores a receber por orçamento</CardTitle>
                <p className="text-sm text-gray-500">Mostra o previsto, cobrado, recebido e em aberto por orçamento.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orçamento</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Previsto</TableHead>
                      <TableHead className="text-right">Cobrado</TableHead>
                      <TableHead className="text-right">Recebido</TableHead>
                      <TableHead className="text-right">Em aberto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivablesByBudget.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="py-10 text-center text-gray-500">Nenhum orçamento com valores a receber.</TableCell></TableRow>
                    ) : receivablesByBudget.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[180px] truncate font-mono text-xs">{row.id}</TableCell>
                        <TableCell className="font-medium">{row.cliente}</TableCell>
                        <TableCell>{statusBadge(row.status)}</TableCell>
                        <TableCell>{formatDate(row.vencimento)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.valorOrcamento)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.valorCobrado)}</TableCell>
                        <TableCell className="text-right text-green-700">{formatCurrency(row.valorRecebido)}</TableCell>
                        <TableCell className="text-right font-semibold text-orange-700">{formatCurrency(row.valorAberto)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pagar">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle>Contas a pagar com comparativo</CardTitle>
                <p className="text-sm text-gray-500">O valor anterior usa o campo salvo ou calcula pelo último lançamento semelhante.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Referência</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Valor anterior</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payableRows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="py-10 text-center text-gray-500">Nenhuma conta a pagar encontrada.</TableCell></TableRow>
                    ) : payableRows.slice(0, 150).map((row) => {
                      const total = Number(row.valor || 0) + Number(row.juros_multa || 0);
                      const diff = total - (row.valorAnteriorCalculado || 0);
                      return (
                        <TableRow key={row.id}>
                          <TableCell>{row.referencia || "-"}</TableCell>
                          <TableCell className="font-medium">{row.descricao || row.recebedor || row.categoria || "-"}</TableCell>
                          <TableCell>{formatDate(row.vencimento)}</TableCell>
                          <TableCell><Badge variant={row.prioridade === "urgente" || row.prioridade === "alta" ? "destructive" : "outline"}>{priorityLabels[row.prioridade] || row.prioridade || "Média"}</Badge></TableCell>
                          <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                          <TableCell className="text-right">{row.valorAnteriorCalculado ? formatCurrency(row.valorAnteriorCalculado) : "-"}</TableCell>
                          <TableCell className={`text-right font-semibold ${diff > 0 ? "text-red-700" : diff < 0 ? "text-green-700" : "text-gray-700"}`}>{row.valorAnteriorCalculado ? formatCurrency(diff) : "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ausentes">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle>Cães ausentes</CardTitle>
                    <p className="text-sm text-gray-500">Baseado no último check-in registrado.</p>
                  </div>
                  <div className="w-full sm:w-48">
                    <Label>Dias sem check-in</Label>
                    <Input type="number" min="1" value={absenceThreshold} onChange={(event) => setAbsenceThreshold(event.target.value)} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Último check-in</TableHead>
                      <TableHead>Cão</TableHead>
                      <TableHead>Raça</TableHead>
                      <TableHead>Responsável financeiro</TableHead>
                      <TableHead className="text-right">Dias ausente</TableHead>
                      <TableHead>Último agendamento conhecido</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {absentDogs.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-10 text-center text-gray-500">Nenhum cão ausente dentro deste critério.</TableCell></TableRow>
                    ) : absentDogs.map((dog) => {
                      const lastAppointment = recentAppointmentsByDog[dog.id]?.[0];
                      return (
                        <TableRow key={dog.id}>
                          <TableCell>{dog.ultimoCheckin ? formatDate(dog.ultimoCheckin) : "Nunca"}</TableCell>
                          <TableCell className="font-medium">{dog.nome}</TableCell>
                          <TableCell>{dog.raca || "-"}</TableCell>
                          <TableCell>{dog.responsavelFinanceiro}</TableCell>
                          <TableCell className="text-right">
                            <Badge className="bg-amber-100 text-amber-800">
                              {dog.diasAusente === 9999 ? "Sem check-in" : `${dog.diasAusente} dias`}
                            </Badge>
                          </TableCell>
                          <TableCell>{lastAppointment ? `${formatDate(getAppointmentDateKey(lastAppointment))} - ${getServiceLabel(lastAppointment.service_type || lastAppointment.service)}` : "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="flex gap-3 p-4 text-sm text-blue-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>O módulo de plano de ação ficou de fora conforme solicitado. Esta tela consolida gestão financeira, clientes fixos, cobranças, custos e ausências, respeitando a unidade ativa.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
