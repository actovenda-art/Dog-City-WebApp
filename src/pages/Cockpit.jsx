import React, { useState, useEffect } from "react";
import { Transaction } from "@/api/entities";
import { ScheduledTransaction } from "@/api/entities";
import { Appointment } from "@/api/entities";
import { ServiceProvided } from "@/api/entities";
import { Replacement } from "@/api/entities";
import { PlanConfig } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, DollarSign, PieChart, BarChart3, ArrowUpCircle, ArrowDownCircle,
  Activity, Calendar, Award, AlertTriangle, Clock, CreditCard, RefreshCw, Clipboard
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPie, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, subDays, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Cockpit() {
  const [transactions, setTransactions] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [servicesProvided, setServicesProvided] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [plans, setPlans] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [periodoMeses, setPeriodoMeses] = useState("6");
  const [periodoDias, setPeriodoDias] = useState("30");
  const [currentView, setCurrentView] = useState("resumo");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [transData, schedData, apptsData, servData, replData, plansData, dogsData, carteirasData] = await Promise.all([
        Transaction.list("-date", 1000),
        ScheduledTransaction.list("-due_date", 500),
        Appointment.list("-date", 1000),
        ServiceProvided.list("-date", 1000),
        Replacement.list("-created_date", 500),
        PlanConfig.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500)
      ]);
      setTransactions(transData);
      setScheduled(schedData);
      setAppointments(apptsData);
      setServicesProvided(servData);
      setReplacements(replData);
      setPlans(plansData);
      setDogs(dogsData);
      setCarteiras(carteirasData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#14B8A6'];

  const getServiceName = (s) => {
    const names = { day_care: "Day Care", hospedagem: "Hospedagem", banho: "Banho", tosa: "Tosa", banho_tosa: "Banho e Tosa", transporte: "Transporte", adestramento: "Adestramento" };
    return names[s] || s;
  };

  const getDogName = (id) => dogs.find(d => d.id === id)?.nome || "Desconhecido";

  // ===== STATS GERAIS =====
  const hoje = new Date().toISOString().split('T')[0];
  
  const totalEntradas = transactions.filter(t => t.type === "entrada").reduce((acc, t) => acc + (t.value || 0), 0);
  const totalSaidas = transactions.filter(t => t.type === "saida").reduce((acc, t) => acc + (t.value || 0), 0);
  const saldo = totalEntradas - totalSaidas;
  const margemLiquida = totalEntradas > 0 ? ((saldo / totalEntradas) * 100).toFixed(1) : 0;

  const pendentesReceber = scheduled.filter(s => s.status === "pendente" && s.type === "entrada").reduce((acc, s) => acc + (s.value || 0), 0);
  const pendentesPagar = scheduled.filter(s => s.status === "pendente" && s.type === "saida").reduce((acc, s) => acc + (s.value || 0), 0);

  const agendamentosHoje = appointments.filter(a => a.date === hoje).length;
  const servicosHoje = servicesProvided.filter(s => s.date === hoje).length;

  const totalReposicoes = replacements.filter(r => r.status === "disponivel").length;
  const totalAgendamentos = appointments.length;
  const planosAtivos = plans.filter(p => p.status === "ativo").length;
  const receitaMensalPlanos = plans.filter(p => p.status === "ativo").reduce((acc, p) => acc + (p.monthly_value || 0), 0);

  // ===== DADOS MENSAIS =====
  const getMonthlyData = () => {
    const months = [];
    const numMeses = parseInt(periodoMeses);
    for (let i = numMeses - 1; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const entradasMes = transactions.filter(t => { const d = new Date(t.date); return t.type === "entrada" && d >= start && d <= end; }).reduce((acc, t) => acc + (t.value || 0), 0);
      const saidasMes = transactions.filter(t => { const d = new Date(t.date); return t.type === "saida" && d >= start && d <= end; }).reduce((acc, t) => acc + (t.value || 0), 0);
      months.push({ mes: format(date, "MMM/yy", { locale: ptBR }), entradas: entradasMes, saidas: saidasMes, lucro: entradasMes - saidasMes });
    }
    return months;
  };
  const monthlyData = getMonthlyData();

  // ===== OPERACIONAL =====
  const filterByPeriod = (data, dateField = "date") => {
    const dias = parseInt(periodoDias);
    const limite = subDays(new Date(), dias);
    return data.filter(item => new Date(item[dateField]) >= limite);
  };

  const frequenciaPorServico = () => {
    const filtered = filterByPeriod(servicesProvided);
    const grouped = filtered.reduce((acc, s) => { acc[s.service || "outros"] = (acc[s.service || "outros"] || 0) + 1; return acc; }, {});
    return Object.entries(grouped).map(([name, value], i) => ({ name: getServiceName(name), value, color: COLORS[i % COLORS.length] })).sort((a, b) => b.value - a.value);
  };

  const topCaes = () => {
    const filtered = filterByPeriod(servicesProvided);
    const grouped = filtered.reduce((acc, s) => { acc[s.dog_id] = (acc[s.dog_id] || 0) + 1; return acc; }, {});
    return Object.entries(grouped).map(([dogId, count]) => ({ dogId, name: getDogName(dogId), count })).sort((a, b) => b.count - a.count).slice(0, 10);
  };

  const caesAusentes = () => {
    const ultimoServico = {};
    servicesProvided.forEach(s => { if (!ultimoServico[s.dog_id] || new Date(s.date) > new Date(ultimoServico[s.dog_id])) ultimoServico[s.dog_id] = s.date; });
    const now = new Date();
    return dogs.filter(d => d.ativo !== false).map(d => {
      const ultima = ultimoServico[d.id];
      const dias = ultima ? differenceInDays(now, new Date(ultima)) : 999;
      return { ...d, ultimaVisita: ultima, diasAusente: dias };
    }).filter(d => d.diasAusente > 30).sort((a, b) => b.diasAusente - a.diasAusente);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
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

        {/* KPI Cards - Financeiro */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Entradas</p><p className="text-lg sm:text-2xl font-bold text-green-600">{formatCurrency(totalEntradas)}</p></div>
                <ArrowUpCircle className="w-8 h-8 sm:w-10 sm:h-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Saídas</p><p className="text-lg sm:text-2xl font-bold text-red-600">{formatCurrency(totalSaidas)}</p></div>
                <ArrowDownCircle className="w-8 h-8 sm:w-10 sm:h-10 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className={`border-${saldo >= 0 ? 'blue' : 'orange'}-200 bg-white`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Saldo</p><p className={`text-lg sm:text-2xl font-bold ${saldo >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{formatCurrency(saldo)}</p></div>
                <DollarSign className={`w-8 h-8 sm:w-10 sm:h-10 ${saldo >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Margem</p><p className="text-lg sm:text-2xl font-bold text-purple-600">{margemLiquida}%</p></div>
                <Activity className="w-8 h-8 sm:w-10 sm:h-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPI Cards - Operacional */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Agendamentos Hoje</p><p className="text-lg sm:text-2xl font-bold text-blue-600">{agendamentosHoje}</p></div>
                <Calendar className="w-8 h-8 sm:w-10 sm:h-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Serviços Hoje</p><p className="text-lg sm:text-2xl font-bold text-emerald-600">{servicosHoje}</p></div>
                <Clipboard className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">A Receber</p><p className="text-lg sm:text-2xl font-bold text-orange-600">{formatCurrency(pendentesReceber)}</p></div>
                <Clock className="w-8 h-8 sm:w-10 sm:h-10 text-orange-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-pink-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">A Pagar</p><p className="text-lg sm:text-2xl font-bold text-pink-600">{formatCurrency(pendentesPagar)}</p></div>
                <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-pink-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* KPI Cards - Extras */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-indigo-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Planos Ativos</p><p className="text-lg sm:text-2xl font-bold text-indigo-600">{planosAtivos}</p></div>
                <CreditCard className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-teal-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Receita Mensal (Planos)</p><p className="text-lg sm:text-2xl font-bold text-teal-600">{formatCurrency(receitaMensalPlanos)}</p></div>
                <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-teal-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Reposições Disponíveis</p><p className="text-lg sm:text-2xl font-bold text-amber-600">{totalReposicoes}</p></div>
                <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 bg-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-xs sm:text-sm text-gray-600">Total Agendamentos</p><p className="text-lg sm:text-2xl font-bold text-cyan-600">{totalAgendamentos}</p></div>
                <Calendar className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Menu Seleção */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <Select value={currentView} onValueChange={setCurrentView}>
              <SelectTrigger className="w-full sm:w-80">
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

        {/* Resumo Geral */}
        {currentView === "resumo" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-gray-200 bg-white">
              <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-600" />Fluxo Mensal</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
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
              <CardHeader><CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-purple-600" />Serviços por Tipo</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPie>
                      <Pie data={frequenciaPorServico()} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={80} dataKey="value">
                        {frequenciaPorServico().map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip />
                    </RechartsPie>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Financeiro */}
        {currentView === "financeiro" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoMeses} onValueChange={setPeriodoMeses}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                        <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
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
                        <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
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

        {/* Frequência */}
        {currentView === "frequencia" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoDias} onValueChange={setPeriodoDias}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
                      <BarChart data={frequenciaPorServico()}>
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
                    {frequenciaPorServico().map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
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

        {/* Top Cães */}
        {currentView === "ranking" && (
          <>
            <div className="flex justify-end mb-4">
              <Select value={periodoDias} onValueChange={setPeriodoDias}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="60">60 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Card className="border-gray-200 bg-white">
              <CardHeader><CardTitle className="flex items-center gap-2"><Award className="w-5 h-5 text-yellow-600" />Top 10 Cães Mais Frequentes</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topCaes().map((item, i) => {
                    const dog = dogs.find(d => d.id === item.dogId);
                    return (
                      <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 font-bold text-sm">{i + 1}º</div>
                        {dog?.foto_url ? <img src={dog.foto_url} alt={item.name} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-500">{dog?.raca || "Raça não informada"}</p>
                        </div>
                        <Badge className="bg-blue-100 text-blue-700">{item.count} visitas</Badge>
                      </div>
                    );
                  })}
                  {topCaes().length === 0 && <p className="text-center text-gray-500 py-8">Nenhum dado encontrado</p>}
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Cães Ausentes */}
        {currentView === "ausentes" && (
          <Card className="border-gray-200 bg-white">
            <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-600" />Cães ausentes há mais de 30 dias</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {caesAusentes().map((dog, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
                    {dog.foto_url ? <img src={dog.foto_url} alt={dog.nome} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{dog.nome}</p>
                      <p className="text-sm text-gray-500">{dog.raca || "Raça não informada"}</p>
                    </div>
                    <div className="text-right">
                      <Badge className="bg-orange-100 text-orange-700">{dog.diasAusente} dias</Badge>
                      {dog.ultimaVisita && <p className="text-xs text-gray-500 mt-1">Última: {format(new Date(dog.ultimaVisita), "dd/MM/yy")}</p>}
                    </div>
                  </div>
                ))}
                {caesAusentes().length === 0 && <p className="text-center text-gray-500 py-8">Todos os cães estão frequentando!</p>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}