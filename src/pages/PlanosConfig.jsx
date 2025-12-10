import React, { useState, useEffect } from "react";
import { PlanConfig } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Appointment } from "@/api/entities";
import { ScheduledTransaction } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, CreditCard, Search, Pencil, Trash2, Play, Pause, Calendar, Zap
} from "lucide-react";
import { format, addDays, addWeeks, getDay, nextDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const SERVICES = [
  { id: "day_care", label: "Day Care", icon: "🐕" },
  { id: "hospedagem", label: "Hospedagem", icon: "🏨" },
  { id: "banho", label: "Banho", icon: "🛁" },
  { id: "tosa", label: "Tosa", icon: "✂️" },
  { id: "banho_tosa", label: "Banho e Tosa", icon: "🛁✂️" },
  { id: "transporte", label: "Transporte", icon: "🚐" },
];

const FREQUENCIES = [
  { id: "1x_semana", label: "1x por semana" },
  { id: "2x_semana", label: "2x por semana" },
  { id: "3x_semana", label: "3x por semana" },
  { id: "4x_semana", label: "4x por semana" },
  { id: "5x_semana", label: "5x por semana" },
  { id: "diario", label: "Diário (Seg-Sex)" },
  { id: "quinzenal", label: "Quinzenal" },
  { id: "mensal", label: "Mensal" },
];

const WEEKDAYS = [
  { id: 0, label: "Dom" },
  { id: 1, label: "Seg" },
  { id: 2, label: "Ter" },
  { id: 3, label: "Qua" },
  { id: 4, label: "Qui" },
  { id: 5, label: "Sex" },
  { id: 6, label: "Sab" },
];

export default function PlanosConfig() {
  const [plans, setPlans] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [formData, setFormData] = useState({
    client_name: "", client_id: "", dog_id: "", service: "", frequency: "",
    weekdays: [], monthly_value: "", due_day: "", status: "ativo", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [plansData, dogsData, carteirasData] = await Promise.all([
        PlanConfig.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500)
      ]);
      setPlans(plansData);
      setDogs(dogsData);
      setCarteiras(carteirasData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  // AUTOMAÇÃO: Gerar agendamentos automáticos baseado no plano
  const generateAppointments = async (plan, weeksAhead = 4) => {
    if (!plan.weekdays?.length || plan.status !== "ativo") return;
    
    const hoje = new Date();
    const appointments = [];
    
    for (let week = 0; week < weeksAhead; week++) {
      for (const weekday of plan.weekdays) {
        let targetDate = addWeeks(hoje, week);
        const currentWeekday = getDay(targetDate);
        
        if (currentWeekday !== weekday) {
          targetDate = nextDay(targetDate, weekday);
        }
        
        // Só criar se for no futuro
        if (targetDate > hoje) {
          appointments.push({
            dog_id: plan.dog_id,
            client_name: plan.client_name,
            service: plan.service,
            date: format(targetDate, 'yyyy-MM-dd'),
            value: plan.monthly_value / (plan.weekdays.length * 4), // Valor por sessão
            payment_status: "pendente",
            plan_id: plan.id
          });
        }
      }
    }
    
    // Criar todos os agendamentos
    for (const appt of appointments) {
      // Verificar se já existe
      const existingAppts = await Appointment.filter({ 
        dog_id: appt.dog_id, 
        date: appt.date, 
        service: appt.service 
      });
      if (existingAppts.length === 0) {
        await Appointment.create(appt);
      }
    }
    
    return appointments.length;
  };

  // AUTOMAÇÃO: Gerar cobrança mensal
  const generateMonthlyBilling = async (plan) => {
    if (plan.status !== "ativo") return;
    
    const hoje = new Date();
    const dueDate = new Date(hoje.getFullYear(), hoje.getMonth(), plan.due_day);
    
    // Se o dia de vencimento já passou este mês, usar próximo mês
    if (dueDate <= hoje) {
      dueDate.setMonth(dueDate.getMonth() + 1);
    }
    
    await ScheduledTransaction.create({
      due_date: format(dueDate, 'yyyy-MM-dd'),
      type: "entrada",
      value: plan.monthly_value,
      description: `Mensalidade ${plan.service} - ${plan.client_name}`,
      party: plan.client_name,
      status: "pendente",
      linked_plan: plan.id
    });
    
    // Atualizar próxima data de cobrança no plano
    await PlanConfig.update(plan.id, {
      next_billing_date: format(dueDate, 'yyyy-MM-dd')
    });
  };

  // Executar automações para um plano
  const runAutomations = async (plan) => {
    setIsGenerating(true);
    try {
      const numAppts = await generateAppointments(plan);
      await generateMonthlyBilling(plan);
      alert(`Automação concluída!\n${numAppts} agendamentos criados.\nCobrança mensal gerada.`);
      await loadData();
    } catch (error) {
      console.error("Erro na automação:", error);
      alert("Erro ao executar automações");
    }
    setIsGenerating(false);
  };

  // Executar automações para todos os planos ativos
  const runAllAutomations = async () => {
    setIsGenerating(true);
    try {
      const activePlans = plans.filter(p => p.status === "ativo");
      for (const plan of activePlans) {
        await generateAppointments(plan);
        await generateMonthlyBilling(plan);
      }
      alert(`Automações executadas para ${activePlans.length} plano(s) ativo(s)!`);
      await loadData();
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao executar automações");
    }
    setIsGenerating(false);
  };

  const resetForm = () => {
    setFormData({
      client_name: "", client_id: "", dog_id: "", service: "", frequency: "",
      weekdays: [], monthly_value: "", due_day: "", status: "ativo", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      client_name: item.client_name || "",
      client_id: item.client_id || "",
      dog_id: item.dog_id || "",
      service: item.service || "",
      frequency: item.frequency || "",
      weekdays: item.weekdays || [],
      monthly_value: item.monthly_value?.toString() || "",
      due_day: item.due_day?.toString() || "",
      status: item.status || "ativo",
      observacoes: item.observacoes || ""
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.client_name || !formData.dog_id || !formData.service || !formData.monthly_value) {
      alert("Preencha: Cliente, Cão, Serviço e Valor Mensal"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        ...formData,
        monthly_value: parseFloat(formData.monthly_value) || 0,
        due_day: parseInt(formData.due_day) || 10
      };
      if (editingItem) await PlanConfig.update(editingItem.id, dataToSave);
      else await PlanConfig.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este plano?")) return;
    await PlanConfig.delete(id);
    await loadData();
  };

  const toggleStatus = async (plan) => {
    const newStatus = plan.status === "ativo" ? "inativo" : "ativo";
    await PlanConfig.update(plan.id, { status: newStatus });
    await loadData();
  };

  const toggleWeekday = (day) => {
    setFormData(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(day) 
        ? prev.weekdays.filter(d => d !== day)
        : [...prev.weekdays, day].sort()
    }));
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const getDogName = (dogId) => dogs.find(d => d.id === dogId)?.nome || "Cão não encontrado";
  const getServiceLabel = (serviceId) => SERVICES.find(s => s.id === serviceId)?.label || serviceId;
  const getFrequencyLabel = (freqId) => FREQUENCIES.find(f => f.id === freqId)?.label || freqId;

  // Filters
  const filtered = plans.filter(p => {
    const matchSearch = !searchTerm || 
      p.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getDogName(p.dog_id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Stats
  const stats = {
    total: plans.length,
    ativos: plans.filter(p => p.status === "ativo").length,
    inativos: plans.filter(p => p.status !== "ativo").length,
    valorMensal: plans.filter(p => p.status === "ativo").reduce((acc, p) => acc + (p.monthly_value || 0), 0),
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Planos Recorrentes</h1>
              <p className="text-sm text-gray-600">Gerencie planos que geram agendamentos e cobranças automáticas</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={runAllAutomations} disabled={isGenerating}>
              <Zap className="w-4 h-4 mr-2" />{isGenerating ? "Gerando..." : "Gerar Automações"}
            </Button>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Plano
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.total}</p>
              <p className="text-sm text-gray-600">Total de Planos</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.ativos}</p>
              <p className="text-sm text-gray-600">Ativos</p>
            </CardContent>
          </Card>
          <Card className="border-gray-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">{stats.inativos}</p>
              <p className="text-sm text-gray-600">Inativos</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorMensal)}</p>
              <p className="text-sm text-gray-600">Receita Mensal</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar cliente ou cão..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inativo">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <Card className="col-span-full border-gray-200 bg-white">
              <CardContent className="p-12 text-center">
                <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum plano encontrado</p>
              </CardContent>
            </Card>
          ) : filtered.map(plan => (
            <Card key={plan.id} className={`border-2 bg-white ${plan.status === "ativo" ? "border-green-200" : "border-gray-200 opacity-70"}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.client_name}</CardTitle>
                  <Badge className={plan.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                    {plan.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600">🐕 {getDogName(plan.dog_id)}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Serviço:</span>
                  <Badge variant="outline">{getServiceLabel(plan.service)}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Frequência:</span>
                  <span className="text-sm">{getFrequencyLabel(plan.frequency)}</span>
                </div>
                {plan.weekdays?.length > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Dias:</span>
                    <div className="flex gap-1">
                      {plan.weekdays.map(d => (
                        <Badge key={d} variant="outline" className="text-xs">{WEEKDAYS[d]?.label}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Valor Mensal:</span>
                  <span className="text-lg font-bold text-green-600">{formatCurrency(plan.monthly_value)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Vencimento:</span>
                  <span>Dia {plan.due_day}</span>
                </div>
                
                <div className="flex gap-2 pt-3 border-t">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => runAutomations(plan)} disabled={isGenerating}>
                    <Zap className="w-3 h-3 mr-1" />Gerar
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleStatus(plan)}>
                    {plan.status === "ativo" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEditModal(plan)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(plan.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Plano Recorrente</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2">
              <Label>Cliente *</Label>
              <Select value={formData.client_id} onValueChange={(v) => {
                const carteira = carteiras.find(c => c.id === v);
                setFormData({ ...formData, client_id: v, client_name: carteira?.nome_razao_social || "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {carteiras.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Cão *</Label>
              <Select value={formData.dog_id} onValueChange={(v) => setFormData({ ...formData, dog_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cão" /></SelectTrigger>
                <SelectContent>
                  {dogs.map(dog => (
                    <SelectItem key={dog.id} value={dog.id}>{dog.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serviço *</Label>
              <Select value={formData.service} onValueChange={(v) => setFormData({ ...formData, service: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SERVICES.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequência *</Label>
              <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Dias da Semana</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {WEEKDAYS.map(day => (
                  <Button
                    key={day.id}
                    type="button"
                    variant={formData.weekdays.includes(day.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleWeekday(day.id)}
                    className={formData.weekdays.includes(day.id) ? "bg-purple-600" : ""}
                  >
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Valor Mensal *</Label>
              <Input type="number" step="0.01" value={formData.monthly_value} onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <Label>Dia de Vencimento *</Label>
              <Input type="number" min="1" max="31" value={formData.due_day} onChange={(e) => setFormData({ ...formData, due_day: e.target.value })} placeholder="10" />
            </div>
            <div className="sm:col-span-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-purple-600 hover:bg-purple-700 text-white">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}