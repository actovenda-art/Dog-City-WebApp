import React, { useState, useEffect } from "react";
import { PlanConfig as Plano } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Schedule } from "@/api/entities/Schedule";
import { Checkin } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, Pencil, Trash2, CreditCard, AlertTriangle, CheckCircle, XCircle, Dog as DogIcon, Calendar, Filter
} from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Planos() {
  const [planos, setPlanos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    dog_id: "", cliente_id: "", tipo_plano: "mensal", valor_mensal: "",
    reposicoes_day_care: "0", reposicoes_banho: "0", reposicoes_tosa: "0",
    reposicoes_hospedagem: "0", reposicoes_transporte: "0",
    data_vencimento: "", status: "ativo", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [planosData, dogsData, carteirasData, schedulesData, checkinsData] = await Promise.all([
        Plano.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Schedule.list("-data_hora_entrada", 2000),
        Checkin.filter({ tipo: "pet" }, "-checkin_datetime", 2000)
      ]);
      setPlanos(planosData);
      setDogs(dogsData.filter(d => d.ativo !== false));
      setCarteiras(carteirasData.filter(c => c.ativo !== false));
      setSchedules(schedulesData);
      setCheckins(checkinsData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({
      dog_id: "", cliente_id: "", tipo_plano: "mensal", valor_mensal: "",
      reposicoes_day_care: "0", reposicoes_banho: "0", reposicoes_tosa: "0",
      reposicoes_hospedagem: "0", reposicoes_transporte: "0",
      data_vencimento: "", status: "ativo", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      dog_id: item.dog_id || "",
      cliente_id: item.cliente_id || "",
      tipo_plano: item.tipo_plano || "mensal",
      valor_mensal: item.valor_mensal?.toString() || "",
      reposicoes_day_care: item.reposicoes_day_care?.toString() || "0",
      reposicoes_banho: item.reposicoes_banho?.toString() || "0",
      reposicoes_tosa: item.reposicoes_tosa?.toString() || "0",
      reposicoes_hospedagem: item.reposicoes_hospedagem?.toString() || "0",
      reposicoes_transporte: item.reposicoes_transporte?.toString() || "0",
      data_vencimento: item.data_vencimento || "",
      status: item.status || "ativo",
      observacoes: item.observacoes || ""
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.dog_id || !formData.data_vencimento) {
      alert("Preencha: Cão e Data de Vencimento"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        ...formData,
        valor_mensal: formData.valor_mensal ? parseFloat(formData.valor_mensal.replace(",", ".")) : null,
        reposicoes_day_care: parseInt(formData.reposicoes_day_care) || 0,
        reposicoes_banho: parseInt(formData.reposicoes_banho) || 0,
        reposicoes_tosa: parseInt(formData.reposicoes_tosa) || 0,
        reposicoes_hospedagem: parseInt(formData.reposicoes_hospedagem) || 0,
        reposicoes_transporte: parseInt(formData.reposicoes_transporte) || 0
      };
      if (editingItem) await Plano.update(editingItem.id, dataToSave);
      else await Plano.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este plano?")) return;
    await Plano.delete(id);
    await loadData();
  };

  const formatCurrency = (v) => v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : "-";
  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getDogName = (id) => {
    const dog = dogs.find(d => d.id === id);
    return dog ? dog.nome : "-";
  };

  const getDogById = (id) => dogs.find(d => d.id === id);

  // Calcula faltas (agendamentos sem check-in correspondente)
  const calcularFaltas = (dogId) => {
    const hoje = new Date();
    const agendamentosDog = schedules.filter(s => 
      s.dog_id === dogId && 
      new Date(s.data_hora_entrada) < hoje &&
      s.status !== "cancelado"
    );

    const checkinsDog = checkins.filter(c => c.dog_id === dogId);

    const faltas = { day_care: 0, banho: 0, tosa: 0, hospedagem: 0, transporte: 0 };

    agendamentosDog.forEach(agendamento => {
      const dataAgendamento = new Date(agendamento.data_hora_entrada).toDateString();
      
      // Mapeia service_type do Schedule para service do Checkin
      const serviceMap = {
        day_care: "Day Care",
        hospedagem: "Hospedagem",
        banho_tosa: "Banho e Tosa",
        transporte: null,
        adaptacao: "Adaptação",
        adestramento: "Adestramento"
      };

      const servicoCheckin = serviceMap[agendamento.service_type];
      
      // Verifica se existe check-in para esse dia e serviço
      const temCheckin = checkinsDog.some(c => {
        const dataCheckin = new Date(c.checkin_datetime).toDateString();
        if (agendamento.service_type === "banho_tosa") {
          return dataCheckin === dataAgendamento && 
            (c.service === "Banho e Tosa" || c.service === "Banho" || c.service === "Tosa");
        }
        return dataCheckin === dataAgendamento && c.service === servicoCheckin;
      });

      if (!temCheckin) {
        switch (agendamento.service_type) {
          case "day_care": faltas.day_care++; break;
          case "hospedagem": faltas.hospedagem++; break;
          case "banho_tosa": faltas.banho++; faltas.tosa++; break;
          case "transporte": faltas.transporte++; break;
        }
      }
    });

    return faltas;
  };

  const getStatusInfo = (plano) => {
    if (plano.status === "cancelado") return { label: "Cancelado", color: "bg-gray-100 text-gray-600", icon: XCircle };
    if (plano.status === "suspenso") return { label: "Suspenso", color: "bg-orange-100 text-orange-600", icon: AlertTriangle };
    if (plano.status === "inadimplente" || (plano.data_vencimento && isPast(new Date(plano.data_vencimento)))) {
      return { label: "Inadimplente", color: "bg-red-100 text-red-600", icon: AlertTriangle };
    }
    return { label: "Ativo", color: "bg-green-100 text-green-600", icon: CheckCircle };
  };

  const getDaysUntilDue = (date) => {
    if (!date) return null;
    const days = differenceInDays(new Date(date), new Date());
    return days;
  };

  // Filters
  const filtered = planos.filter(p => {
    const dog = getDogById(p.dog_id);
    const dogName = dog?.nome?.toLowerCase() || "";
    const matchSearch = !searchTerm || dogName.includes(searchTerm.toLowerCase()) || p.dog_id?.includes(searchTerm);
    
    let matchStatus = true;
    if (filterStatus === "ativo") matchStatus = p.status === "ativo" && !isPast(new Date(p.data_vencimento));
    if (filterStatus === "inadimplente") matchStatus = p.status === "inadimplente" || isPast(new Date(p.data_vencimento));
    if (filterStatus === "cancelado") matchStatus = p.status === "cancelado";
    if (filterStatus === "suspenso") matchStatus = p.status === "suspenso";
    
    return matchSearch && matchStatus;
  });

  // Stats
  const stats = {
    total: planos.length,
    ativos: planos.filter(p => p.status === "ativo" && !isPast(new Date(p.data_vencimento))).length,
    inadimplentes: planos.filter(p => p.status === "inadimplente" || isPast(new Date(p.data_vencimento))).length,
    proximosVencer: planos.filter(p => {
      const days = getDaysUntilDue(p.data_vencimento);
      return days !== null && days >= 0 && days <= 7;
    }).length
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
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png" alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestão de Planos</h1>
              <p className="text-sm text-gray-600">Controle de planos e reposições</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Novo Plano
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Total de Planos</p><p className="text-2xl font-bold text-blue-600">{stats.total}</p></div>
              <CreditCard className="w-10 h-10 text-blue-500" />
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Ativos</p><p className="text-2xl font-bold text-green-600">{stats.ativos}</p></div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Inadimplentes</p><p className="text-2xl font-bold text-red-600">{stats.inadimplentes}</p></div>
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Vencem em 7 dias</p><p className="text-2xl font-bold text-orange-600">{stats.proximosVencer}</p></div>
              <Calendar className="w-10 h-10 text-orange-500" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar por nome ou ID do cão..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="inadimplente">Inadimplentes</SelectItem>
                <SelectItem value="suspenso">Suspensos</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Cão</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead className="text-center">Faltas Day Care</TableHead>
                  <TableHead className="text-center">Faltas Banho</TableHead>
                  <TableHead className="text-center">Faltas Tosa</TableHead>
                  <TableHead className="text-center">Faltas Hosp.</TableHead>
                  <TableHead className="text-center">Faltas Transp.</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <DogIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum plano encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((plano) => {
                  const dog = getDogById(plano.dog_id);
                  const statusInfo = getStatusInfo(plano);
                  const StatusIcon = statusInfo.icon;
                  const daysUntil = getDaysUntilDue(plano.data_vencimento);
                  
                  return (
                    <TableRow key={plano.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {dog?.foto_url ? (
                            <img src={dog.foto_url} alt={dog.nome} className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>
                          )}
                          <div>
                            <p className="font-medium text-gray-900">{dog?.nome || "-"}</p>
                            <p className="text-xs text-gray-500">{dog?.raca || ""}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">{plano.dog_id?.slice(0, 8)}...</code>
                      </TableCell>
                      {(() => {
                        const faltas = calcularFaltas(plano.dog_id);
                        return (
                          <>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={faltas.day_care > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                                {faltas.day_care}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={faltas.banho > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-cyan-50 text-cyan-700 border-cyan-200"}>
                                {faltas.banho}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={faltas.tosa > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-purple-50 text-purple-700 border-purple-200"}>
                                {faltas.tosa}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={faltas.hospedagem > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}>
                                {faltas.hospedagem}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className={faltas.transporte > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                                {faltas.transporte}
                              </Badge>
                            </TableCell>
                          </>
                        );
                      })()}
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{formatDate(plano.data_vencimento)}</p>
                          {daysUntil !== null && (
                            <p className={`text-xs ${daysUntil < 0 ? 'text-red-600' : daysUntil <= 7 ? 'text-orange-600' : 'text-gray-500'}`}>
                              {daysUntil < 0 ? `${Math.abs(daysUntil)} dias atrasado` : daysUntil === 0 ? 'Vence hoje' : `${daysUntil} dias restantes`}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusInfo.color} flex items-center gap-1 w-fit`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(plano)} className="h-8 w-8">
                            <Pencil className="w-4 h-4 text-gray-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(plano.id)} className="h-8 w-8">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Plano</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2">
              <Label>Cão *</Label>
              <Select value={formData.dog_id} onValueChange={(v) => setFormData({ ...formData, dog_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o cão" /></SelectTrigger>
                <SelectContent>
                  {dogs.map(dog => (
                    <SelectItem key={dog.id} value={dog.id}>
                      {dog.nome} {dog.raca && `(${dog.raca})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de Plano</Label>
              <Select value={formData.tipo_plano} onValueChange={(v) => setFormData({ ...formData, tipo_plano: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="trimestral">Trimestral</SelectItem>
                  <SelectItem value="semestral">Semestral</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor Mensal</Label>
              <Input value={formData.valor_mensal} onChange={(e) => setFormData({ ...formData, valor_mensal: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <Label>Data de Vencimento *</Label>
              <Input type="date" value={formData.data_vencimento} onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inadimplente">Inadimplente</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="sm:col-span-2 pt-2">
              <p className="text-sm font-semibold text-gray-700 mb-3">Reposições por Serviço</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <Label className="text-xs">Day Care</Label>
                  <Input type="number" min="0" value={formData.reposicoes_day_care} onChange={(e) => setFormData({ ...formData, reposicoes_day_care: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Banho</Label>
                  <Input type="number" min="0" value={formData.reposicoes_banho} onChange={(e) => setFormData({ ...formData, reposicoes_banho: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Tosa</Label>
                  <Input type="number" min="0" value={formData.reposicoes_tosa} onChange={(e) => setFormData({ ...formData, reposicoes_tosa: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Hospedagem</Label>
                  <Input type="number" min="0" value={formData.reposicoes_hospedagem} onChange={(e) => setFormData({ ...formData, reposicoes_hospedagem: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Transporte</Label>
                  <Input type="number" min="0" value={formData.reposicoes_transporte} onChange={(e) => setFormData({ ...formData, reposicoes_transporte: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Input value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} placeholder="Observações sobre o plano" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}