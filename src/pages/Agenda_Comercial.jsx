
import React, { useState, useEffect } from "react";
import { Schedule } from "@/api/entities/Schedule";
import { Dog } from "@/api/entities";
import { Client } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Calendar as CalendarIcon,
  Home,
  Droplet,
  Scissors,
  Car,
  RefreshCw,
  Eye,
  GraduationCap,
  FileText,
  Plus,
  DollarSign,
  MessageSquare,
  Clock,
  ArrowUpDown,
  Filter
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

export default function Agenda_Comercial() {
  const [schedules, setSchedules] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentView, setCurrentView] = useState("day_care");
  const [generalView, setGeneralView] = useState("sessions"); // 'sessions' or 'unified'
  const [dateFilter, setDateFilter] = useState("");
  const [dateFilterEnd, setDateFilterEnd] = useState("");
  const [sortOrder, setSortOrder] = useState("asc"); // 'asc' = mais próximos, 'desc' = mais distantes
  
  // Modals
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [schedulesData, dogsData, clientsData] = await Promise.all([
        Schedule.list("-data_hora_entrada", 500),
        Dog.list("-created_date", 500),
        Client.list("-created_date", 500)
      ]);
      
      setSchedules(schedulesData);
      setDogs(dogsData);
      setClients(clientsData);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
    setIsLoading(false);
  };

  const getServiceIcon = (serviceType) => {
    const iconMap = {
      day_care: CalendarIcon,
      hospedagem: Home,
      banho_tosa: Scissors,
      transporte: Car,
      adaptacao: RefreshCw,
      visita: Eye,
      adestramento: GraduationCap
    };
    const Icon = iconMap[serviceType] || CalendarIcon;
    return <Icon className="w-5 h-5" />;
  };

  const getServiceName = (serviceType) => {
    const nameMap = {
      day_care: "Day Care",
      hospedagem: "Hospedagem",
      banho_tosa: "Banho & Tosa",
      transporte: "Transporte",
      adaptacao: "Adaptação",
      visita: "Visita",
      adestramento: "Adestramento"
    };
    return nameMap[serviceType] || serviceType;
  };

  const getServiceColor = (serviceType) => {
    const colorMap = {
      day_care: "bg-blue-100 text-blue-700 border-blue-200",
      hospedagem: "bg-purple-100 text-purple-700 border-purple-200",
      banho_tosa: "bg-pink-100 text-pink-700 border-pink-200",
      transporte: "bg-indigo-100 text-indigo-700 border-indigo-200",
      adaptacao: "bg-orange-100 text-orange-700 border-orange-200",
      visita: "bg-green-100 text-green-700 border-green-200",
      adestramento: "bg-yellow-100 text-yellow-700 border-yellow-200"
    };
    return colorMap[serviceType] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  const getDogInfo = (dogId) => {
    return dogs.find(d => d.id === dogId);
  };

  const getClientInfo = (clientId) => {
    return clients.find(c => c.id === clientId);
  };

  const filterSchedules = (schedulesList, serviceType = null) => {
    let filtered = schedulesList;

    // Filter by service type
    if (serviceType) {
      filtered = filtered.filter(s => s.service_type === serviceType);
    }

    // Filter by date
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filtered = filtered.filter(s => {
        const scheduleDate = new Date(s.data_hora_entrada);
        return scheduleDate.toDateString() === filterDate.toDateString();
      });
    }

    // Filter by date range
    if (dateFilter && dateFilterEnd) {
      const startDate = new Date(dateFilter);
      const endDate = new Date(dateFilterEnd);
      filtered = filtered.filter(s => {
        const scheduleDate = new Date(s.data_hora_entrada);
        return scheduleDate >= startDate && scheduleDate <= endDate;
      });
    }

    // Sort by date
    filtered.sort((a, b) => {
      const dateA = new Date(a.data_hora_entrada);
      const dateB = new Date(b.data_hora_entrada);
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  };

  const renderScheduleCard = (schedule) => {
    const dog = getDogInfo(schedule.dog_id);
    if (!dog) return null;

    const client = getClientInfo(dog.client_id);
    
    return (
      <motion.div
        key={schedule.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <Card className="border-gray-200 bg-white hover:shadow-lg transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              {/* Dog Photo */}
              <div className="flex-shrink-0">
                {dog.foto_url ? (
                  <img
                    src={dog.foto_url}
                    alt={dog.nome}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-2xl">🐕</span>
                  </div>
                )}
              </div>

              {/* Schedule Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {dog.nome} {dog.apelido && `(${dog.apelido})`}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Responsável: {client?.nome_completo || "Não informado"}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {schedule.observacoes && (
                      <MessageSquare className="w-5 h-5 text-blue-500" title="Tem observações" />
                    )}
                    <Badge className={getServiceColor(schedule.service_type) + " border"}>
                      {getServiceIcon(schedule.service_type)}
                      <span className="ml-1">{getServiceName(schedule.service_type)}</span>
                    </Badge>
                  </div>
                </div>

                {/* Date/Time Info */}
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Clock className="w-4 h-4" />
                    <span>
                      Entrada: {format(new Date(schedule.data_hora_entrada), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>

                  {schedule.service_type === "hospedagem" && schedule.data_hora_saida && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Clock className="w-4 h-4" />
                      <span>
                        Saída: {format(new Date(schedule.data_hora_saida), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                  )}

                  {schedule.service_type === "banho_tosa" && schedule.tipo_tosa && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Scissors className="w-4 h-4" />
                      <span>Tipo de tosa: {schedule.tipo_tosa}</span>
                    </div>
                  )}
                </div>

                {/* Observações (se houver) */}
                {schedule.observacoes && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md">
                    <p className="text-xs text-blue-800">
                      <strong>Obs:</strong> {schedule.observacoes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando agenda...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png"
              alt="Dog City Brasil"
              className="h-10 w-10 sm:h-12 sm:w-12"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Agenda - Comercial</h1>
              <p className="text-sm sm:text-base text-gray-600">Gerenciamento de agendamentos</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => setShowBudgetModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Criar Orçamento</span>
            </Button>
            <Button
              onClick={() => setShowScheduleModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Novo Agendamento</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1">Data Início</Label>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-10"
                />
              </div>
              
              <div>
                <Label className="text-xs text-gray-600 mb-1">Data Fim</Label>
                <Input
                  type="date"
                  value={dateFilterEnd}
                  onChange={(e) => setDateFilterEnd(e.target.value)}
                  className="h-10"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600 mb-1">Ordenação</Label>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Mais próximos primeiro</SelectItem>
                    <SelectItem value="desc">Mais distantes primeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDateFilter("");
                    setDateFilterEnd("");
                    setSortOrder("asc");
                  }}
                  className="w-full h-10"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={currentView} onValueChange={setCurrentView} className="w-full">
          <div className="mb-6 overflow-x-auto pb-2">
            <TabsList className="inline-flex w-auto min-w-full lg:grid lg:w-full lg:grid-cols-8">
              <TabsTrigger value="day_care" className="flex items-center gap-1 whitespace-nowrap px-3">
                <CalendarIcon className="w-4 h-4" />
                <span>Day Care</span>
              </TabsTrigger>
              <TabsTrigger value="hospedagem" className="flex items-center gap-1 whitespace-nowrap px-3">
                <Home className="w-4 h-4" />
                <span>Hospedagem</span>
              </TabsTrigger>
              <TabsTrigger value="banho_tosa" className="flex items-center gap-1 whitespace-nowrap px-3">
                <Scissors className="w-4 h-4" />
                <span>Banho & Tosa</span>
              </TabsTrigger>
              <TabsTrigger value="transporte" className="flex items-center gap-1 whitespace-nowrap px-3">
                <Car className="w-4 h-4" />
                <span>Transporte</span>
              </TabsTrigger>
              <TabsTrigger value="adaptacao" className="flex items-center gap-1 whitespace-nowrap px-3">
                <RefreshCw className="w-4 h-4" />
                <span>Adaptação</span>
              </TabsTrigger>
              <TabsTrigger value="visita" className="flex items-center gap-1 whitespace-nowrap px-3">
                <Eye className="w-4 h-4" />
                <span>Visita</span>
              </TabsTrigger>
              <TabsTrigger value="adestramento" className="flex items-center gap-1 whitespace-nowrap px-3">
                <GraduationCap className="w-4 h-4" />
                <span>Adestramento</span>
              </TabsTrigger>
              <TabsTrigger value="geral" className="flex items-center gap-1 whitespace-nowrap px-3">
                <FileText className="w-4 h-4" />
                <span>Geral</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Individual Service Views */}
          {["day_care", "hospedagem", "banho_tosa", "transporte", "adaptacao", "visita", "adestramento"].map(service => (
            <TabsContent key={service} value={service}>
              <div className="space-y-3">
                <AnimatePresence>
                  {filterSchedules(schedules, service).length === 0 ? (
                    <Card className="border-gray-200 bg-white">
                      <CardContent className="p-12 text-center">
                        {getServiceIcon(service)}
                        <h3 className="text-lg font-semibold text-gray-900 mt-4 mb-2">
                          Nenhum agendamento encontrado
                        </h3>
                        <p className="text-gray-600">
                          Não há agendamentos de {getServiceName(service)} para os filtros selecionados
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    filterSchedules(schedules, service).map(schedule => renderScheduleCard(schedule))
                  )}
                </AnimatePresence>
              </div>
            </TabsContent>
          ))}

          {/* General View */}
          <TabsContent value="geral">
            <Card className="mb-4 border-gray-200 bg-white">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Button
                    variant={generalView === "sessions" ? "default" : "outline"}
                    onClick={() => setGeneralView("sessions")}
                    className="flex-1"
                  >
                    Por Sessões
                  </Button>
                  <Button
                    variant={generalView === "unified" ? "default" : "outline"}
                    onClick={() => setGeneralView("unified")}
                    className="flex-1"
                  >
                    Lista Única
                  </Button>
                </div>
              </CardContent>
            </Card>

            {generalView === "sessions" ? (
              // Sessions View - Grouped by Service
              <div className="space-y-6">
                {["day_care", "hospedagem", "banho_tosa", "transporte", "adaptacao", "visita", "adestramento"].map(service => {
                  const serviceSchedules = filterSchedules(schedules, service);
                  if (serviceSchedules.length === 0) return null;

                  return (
                    <div key={service}>
                      <h2 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                        {getServiceIcon(service)}
                        {getServiceName(service)}
                        <Badge variant="outline" className="ml-2">
                          {serviceSchedules.length}
                        </Badge>
                      </h2>
                      <div className="space-y-3">
                        <AnimatePresence>
                          {serviceSchedules.map(schedule => renderScheduleCard(schedule))}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Unified View - All schedules mixed
              <div className="space-y-3">
                <AnimatePresence>
                  {filterSchedules(schedules).length === 0 ? (
                    <Card className="border-gray-200 bg-white">
                      <CardContent className="p-12 text-center">
                        <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Nenhum agendamento encontrado
                        </h3>
                        <p className="text-gray-600">
                          Não há agendamentos para os filtros selecionados
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    filterSchedules(schedules).map(schedule => renderScheduleCard(schedule))
                  )}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Budget Modal */}
      <Dialog open={showBudgetModal} onOpenChange={setShowBudgetModal}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Criar Orçamento</DialogTitle>
            <DialogDescription>
              Funcionalidade em desenvolvimento
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              A funcionalidade de criar orçamento será implementada em breve.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowBudgetModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Modal */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
            <DialogDescription>
              Funcionalidade em desenvolvimento
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              A funcionalidade de criar novo agendamento será implementada em breve.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowScheduleModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
