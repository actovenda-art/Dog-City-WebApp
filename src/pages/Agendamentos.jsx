import React, { useState, useEffect } from "react";
import { Appointment } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Replacement } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Plus, Calendar, Search, Pencil, Trash2, CheckCircle, Clock, RefreshCw, Filter
} from "lucide-react";
import { format, isBefore, parseISO } from "date-fns";
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

export default function Agendamentos() {
  const [appointments, setAppointments] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterService, setFilterService] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDate, setFilterDate] = useState("");

  const [formData, setFormData] = useState({
    dog_id: "", client_name: "", service: "", date: "", time: "",
    value: "", payment_status: "pendente", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [appts, dogsData, carteirasData] = await Promise.all([
        Appointment.list("-date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500)
      ]);
      setAppointments(appts);
      setDogs(dogsData);
      setCarteiras(carteirasData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  // Automação: Verificar agendamentos pagos não utilizados e gerar reposições
  const checkAndGenerateReplacements = async () => {
    const hoje = new Date().toISOString().split('T')[0];
    const apptsPagosNaoUsados = appointments.filter(a => 
      a.payment_status === "pago" && 
      !a.used && 
      !a.replaced && 
      a.date < hoje
    );

    for (const appt of apptsPagosNaoUsados) {
      // Criar reposição
      await Replacement.create({
        appointment_id: appt.id,
        dog_id: appt.dog_id,
        date_generated: hoje,
        service: appt.service,
        value: appt.value,
        status: "disponivel"
      });
      
      // Marcar agendamento como replaced
      await Appointment.update(appt.id, { replaced: true });
    }

    if (apptsPagosNaoUsados.length > 0) {
      alert(`${apptsPagosNaoUsados.length} reposição(ões) gerada(s) automaticamente!`);
      await loadData();
    }
  };

  const resetForm = () => {
    setFormData({
      dog_id: "", client_name: "", service: "", date: "", time: "",
      value: "", payment_status: "pendente", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      dog_id: item.dog_id || "",
      client_name: item.client_name || "",
      service: item.service || "",
      date: item.date || "",
      time: item.time || "",
      value: item.value?.toString() || "",
      payment_status: item.payment_status || "pendente",
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
      if (editingItem) await Appointment.update(editingItem.id, dataToSave);
      else await Appointment.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este agendamento?")) return;
    await Appointment.delete(id);
    await loadData();
  };

  const markAsUsed = async (appt) => {
    await Appointment.update(appt.id, { used: true });
    await loadData();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getDogName = (dogId) => dogs.find(d => d.id === dogId)?.nome || "Cão não encontrado";
  const getServiceLabel = (serviceId) => SERVICES.find(s => s.id === serviceId)?.label || serviceId;
  const getServiceIcon = (serviceId) => SERVICES.find(s => s.id === serviceId)?.icon || "📋";

  // Auto-fill client when dog is selected
  const handleDogSelect = (dogId) => {
    setFormData(prev => ({ ...prev, dog_id: dogId }));
    const dog = dogs.find(d => d.id === dogId);
    if (dog) {
      // Try to find client by dog
      const carteira = carteiras.find(c => 
        [c.dog_id_1, c.dog_id_2, c.dog_id_3, c.dog_id_4, c.dog_id_5].includes(dogId)
      );
      if (carteira) {
        setFormData(prev => ({ ...prev, dog_id: dogId, client_name: carteira.nome_razao_social }));
      }
    }
  };

  // Filters
  const filtered = appointments.filter(a => {
    const matchSearch = !searchTerm || 
      getDogName(a.dog_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchService = filterService === "all" || a.service === filterService;
    const matchStatus = filterStatus === "all" || 
      (filterStatus === "pago" && a.payment_status === "pago") ||
      (filterStatus === "pendente" && a.payment_status === "pendente") ||
      (filterStatus === "usado" && a.used) ||
      (filterStatus === "nao_usado" && !a.used);
    const matchDate = !filterDate || a.date === filterDate;
    return matchSearch && matchService && matchStatus && matchDate;
  });

  // Stats
  const hoje = new Date().toISOString().split('T')[0];
  const stats = {
    total: appointments.length,
    hoje: appointments.filter(a => a.date === hoje).length,
    pagos: appointments.filter(a => a.payment_status === "pago").length,
    pendentes: appointments.filter(a => a.payment_status === "pendente").length,
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agendamentos</h1>
              <p className="text-sm text-gray-600">Gerencie os agendamentos de serviços</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={checkAndGenerateReplacements}>
              <RefreshCw className="w-4 h-4 mr-2" />Gerar Reposições
            </Button>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Agendamento
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-sm text-gray-600">Total</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.hoje}</p>
              <p className="text-sm text-gray-600">Hoje</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{stats.pagos}</p>
              <p className="text-sm text-gray-600">Pagos</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.pendentes}</p>
              <p className="text-sm text-gray-600">Pendentes</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
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
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="pago">Pagos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="usado">Utilizados</SelectItem>
                <SelectItem value="nao_usado">Não Utilizados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => { setSearchTerm(""); setFilterService("all"); setFilterStatus("all"); setFilterDate(""); }}>
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Pagamento</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhum agendamento encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((appt) => (
                  <TableRow key={appt.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div>
                        <p className="font-medium">{formatDate(appt.date)}</p>
                        {appt.time && <p className="text-sm text-gray-500">{appt.time}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{getDogName(appt.dog_id)}</TableCell>
                    <TableCell>{appt.client_name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {getServiceIcon(appt.service)} {getServiceLabel(appt.service)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(appt.value)}</TableCell>
                    <TableCell className="text-center">
                      {appt.payment_status === "pago" ? (
                        <Badge className="bg-green-100 text-green-700">Pago</Badge>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {appt.replaced ? (
                        <Badge className="bg-purple-100 text-purple-700">Reposição</Badge>
                      ) : appt.used ? (
                        <Badge className="bg-blue-100 text-blue-700">Utilizado</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700">Aguardando</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        {!appt.used && !appt.replaced && (
                          <Button variant="ghost" size="icon" onClick={() => markAsUsed(appt)} className="h-8 w-8" title="Marcar como utilizado">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEditModal(appt)} className="h-8 w-8">
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(appt.id)} className="h-8 w-8">
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
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Agendamento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="sm:col-span-2">
              <Label>Cão *</Label>
              <Select value={formData.dog_id} onValueChange={handleDogSelect}>
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
            <div className="sm:col-span-2">
              <Label>Cliente/Tutor</Label>
              <Input value={formData.client_name} onChange={(e) => setFormData({ ...formData, client_name: e.target.value })} />
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
              <Label>Horário</Label>
              <Input type="time" value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} placeholder="0,00" />
            </div>
            <div className="sm:col-span-2">
              <Label>Status do Pagamento</Label>
              <Select value={formData.payment_status} onValueChange={(v) => setFormData({ ...formData, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
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
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}