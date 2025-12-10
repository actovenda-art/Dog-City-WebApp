import React, { useState, useEffect } from "react";
import { ServiceProvided } from "@/api/entities";
import { Appointment } from "@/api/entities";
import { Replacement } from "@/api/entities";
import { Dog } from "@/api/entities";
import { User } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Plus, Clipboard, Search, Pencil, Trash2, Link2, CheckCircle
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const SERVICES = [
  { id: "day_care", label: "Day Care", icon: "🐕" },
  { id: "hospedagem", label: "Hospedagem", icon: "🏨" },
  { id: "banho", label: "Banho", icon: "🛁" },
  { id: "tosa", label: "Tosa", icon: "✂️" },
  { id: "banho_tosa", label: "Banho e Tosa", icon: "🛁✂️" },
  { id: "transporte", label: "Transporte", icon: "🚐" },
  { id: "adestramento", label: "Adestramento", icon: "🎓" },
];

export default function ServicosPrestados() {
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [replacements, setReplacements] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterService, setFilterService] = useState("all");
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);

  const [formData, setFormData] = useState({
    dog_id: "", service: "", date: "", time_start: "", time_end: "",
    value: "", responsible_id: "", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [servicesData, apptsData, replacementsData, dogsData, usersData] = await Promise.all([
        ServiceProvided.list("-date", 500),
        Appointment.list("-date", 500),
        Replacement.list("-created_date", 500),
        Dog.list("-created_date", 500),
        User.list("-created_date", 500)
      ]);
      setServices(servicesData);
      setAppointments(apptsData);
      setReplacements(replacementsData);
      setDogs(dogsData);
      setUsers(usersData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  // AUTOMAÇÃO: Tentar vincular automaticamente a agendamento ou reposição
  const autoLink = async (serviceData) => {
    // Procurar agendamento correspondente
    const matchingAppt = appointments.find(a => 
      a.dog_id === serviceData.dog_id &&
      a.date === serviceData.date &&
      a.service === serviceData.service &&
      !a.used
    );

    if (matchingAppt) {
      // Vincular ao agendamento e marcar como usado
      await Appointment.update(matchingAppt.id, { used: true });
      return { linked_appointment: matchingAppt.id };
    }

    // Procurar reposição disponível
    const matchingReplacement = replacements.find(r =>
      r.dog_id === serviceData.dog_id &&
      r.service === serviceData.service &&
      r.status === "disponivel"
    );

    if (matchingReplacement) {
      // Vincular à reposição e marcar como utilizada
      await Replacement.update(matchingReplacement.id, { 
        status: "utilizada", 
        date_used: serviceData.date 
      });
      return { linked_replacement: matchingReplacement.id };
    }

    return {};
  };

  const resetForm = () => {
    setFormData({
      dog_id: "", service: "", date: filterDate, time_start: "", time_end: "",
      value: "", responsible_id: "", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      dog_id: item.dog_id || "",
      service: item.service || "",
      date: item.date || "",
      time_start: item.time_start || "",
      time_end: item.time_end || "",
      value: item.value?.toString() || "",
      responsible_id: item.responsible_id || "",
      observacoes: item.observacoes || ""
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.dog_id || !formData.service || !formData.date) {
      alert("Preencha: Cão, Serviço e Data"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        ...formData,
        value: parseFloat(formData.value) || 0
      };

      // Auto-linking
      if (!editingItem) {
        const links = await autoLink(dataToSave);
        Object.assign(dataToSave, links);
      }

      if (editingItem) await ServiceProvided.update(editingItem.id, dataToSave);
      else await ServiceProvided.create(dataToSave);
      
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este registro?")) return;
    await ServiceProvided.delete(id);
    await loadData();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getDogName = (dogId) => dogs.find(d => d.id === dogId)?.nome || "Cão não encontrado";
  const getUserName = (userId) => users.find(u => u.id === userId)?.full_name || "-";
  const getServiceLabel = (serviceId) => SERVICES.find(s => s.id === serviceId)?.label || serviceId;
  const getServiceIcon = (serviceId) => SERVICES.find(s => s.id === serviceId)?.icon || "📋";

  // Filters
  const filtered = services.filter(s => {
    const matchSearch = !searchTerm || 
      getDogName(s.dog_id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchService = filterService === "all" || s.service === filterService;
    const matchDate = !filterDate || s.date === filterDate;
    return matchSearch && matchService && matchDate;
  });

  // Stats
  const hoje = new Date().toISOString().split('T')[0];
  const servicosHoje = services.filter(s => s.date === hoje);
  const stats = {
    total: services.length,
    hoje: servicosHoje.length,
    valorHoje: servicosHoje.reduce((acc, s) => acc + (s.value || 0), 0),
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Clipboard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Serviços Prestados</h1>
              <p className="text-sm text-gray-600">Registre os serviços realizados</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-green-600 hover:bg-green-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Registrar Serviço
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.total}</p>
              <p className="text-sm text-gray-600">Total</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.hoje}</p>
              <p className="text-sm text-gray-600">Hoje</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorHoje)}</p>
              <p className="text-sm text-gray-600">Valor Hoje</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar cão..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
            <Select value={filterService} onValueChange={setFilterService}>
              <SelectTrigger><SelectValue placeholder="Serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Serviços</SelectItem>
                {SERVICES.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.icon} {s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setFilterService("all"); setFilterDate(""); }}>
              Limpar
            </Button>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Data</TableHead>
                  <TableHead>Cão</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Vínculos</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Clipboard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum serviço registrado</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((svc) => (
                  <TableRow key={svc.id} className="hover:bg-gray-50">
                    <TableCell>{formatDate(svc.date)}</TableCell>
                    <TableCell className="font-medium">{getDogName(svc.dog_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getServiceIcon(svc.service)} {getServiceLabel(svc.service)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {svc.time_start && svc.time_end ? `${svc.time_start} - ${svc.time_end}` : svc.time_start || "-"}
                    </TableCell>
                    <TableCell>{getUserName(svc.responsible_id)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(svc.value)}</TableCell>
                    <TableCell className="text-center">
                      {svc.linked_appointment && (
                        <Badge className="bg-blue-100 text-blue-700 mr-1">Agendamento</Badge>
                      )}
                      {svc.linked_replacement && (
                        <Badge className="bg-purple-100 text-purple-700">Reposição</Badge>
                      )}
                      {!svc.linked_appointment && !svc.linked_replacement && (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(svc)} className="h-8 w-8">
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(svc.id)} className="h-8 w-8">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Registrar"} Serviço Prestado</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
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
              <Label>Data *</Label>
              <Input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
            </div>
            <div>
              <Label>Hora Início</Label>
              <Input type="time" value={formData.time_start} onChange={(e) => setFormData({ ...formData, time_start: e.target.value })} />
            </div>
            <div>
              <Label>Hora Fim</Label>
              <Input type="time" value={formData.time_end} onChange={(e) => setFormData({ ...formData, time_end: e.target.value })} />
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <Label>Responsável</Label>
              <Select value={formData.responsible_id} onValueChange={(v) => setFormData({ ...formData, responsible_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
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
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}