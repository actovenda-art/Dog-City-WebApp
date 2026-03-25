import React, { useEffect, useMemo, useState } from "react";
import { Appointment, Checkin, Client, ContaReceber, Dog, Orcamento, ServiceProvided } from "@/api/entities";
import { getAppointmentDateKey, getAppointmentMeta, getChargeTypeLabel, getCheckinMealRecords, getServiceLabel } from "@/lib/attendance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/common/DateTimeInputs";
import { AlertTriangle, CheckCircle2, CreditCard, DollarSign, Eye, PackageCheck, RefreshCcw, Search, Wallet } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const paymentOptions = [
  { value: "pix", label: "Pix" },
  { value: "cartao", label: "Cartao" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferencia" },
];

const fmtMoney = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const fmtDate = (value) => value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
const normalize = (value) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const parseMeta = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const getStatusKey = (conta) => conta.data_recebimento ? "pago" : conta.vencimento && new Date(conta.vencimento) < new Date() ? "vencido" : "pendente";
const getStatusBadge = (conta) => {
  const key = getStatusKey(conta);
  if (key === "pago") return <Badge className="bg-green-100 text-green-700">Pago</Badge>;
  if (key === "vencido") return <Badge className="bg-red-100 text-red-700">Vencido ({differenceInDays(new Date(), new Date(conta.vencimento))}d)</Badge>;
  return <Badge className="bg-blue-100 text-blue-700">Pendente</Badge>;
};
const getOriginLabel = (value) => ({
  manual_registrador: "Registrador manual",
  orcamento_aprovado: "Orcamento aprovado",
  agendamento: "Agendamento",
}[value] || value || "-");
const getScheduleTypeLabel = (value) => ({
  agendamento_solto: "Agendamento solto",
  orcamento: "Orcamento",
}[value] || value || "-");
const getPackageCode = (...records) => {
  for (const record of records) {
    const meta = parseMeta(record?.metadata);
    if (meta.package_code) return meta.package_code;
    if (meta.pacote_codigo) return meta.pacote_codigo;
  }
  return "";
};

export default function ContasReceber() {
  const [data, setData] = useState({ contas: [], clients: [], dogs: [], appointments: [], checkins: [], usages: [], orcamentos: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("cobrancas");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterServico, setFilterServico] = useState("all");
  const [filterTipoCobranca, setFilterTipoCobranca] = useState("all");
  const [filterTipoAgendamento, setFilterTipoAgendamento] = useState("all");
  const [filterOrigem, setFilterOrigem] = useState("all");
  const [filterPrestacaoInicio, setFilterPrestacaoInicio] = useState("");
  const [filterPrestacaoFim, setFilterPrestacaoFim] = useState("");
  const [filterVencimentoInicio, setFilterVencimentoInicio] = useState("");
  const [filterVencimentoFim, setFilterVencimentoFim] = useState("");
  const [selectedConta, setSelectedConta] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    setPaymentDate(selectedConta?.data_recebimento || "");
    setPaymentMethod(selectedConta?.forma_pagamento || "");
    setPaymentNotes(selectedConta?.observacoes || "");
  }, [selectedConta]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [contas, clients, dogs, appointments, checkins, usages, orcamentos] = await Promise.all([
        ContaReceber.listAll("-created_date", 1000, 5000),
        Client.list("-created_date", 500),
        Dog.list("-created_date", 1000),
        Appointment.listAll("-created_date", 1000, 5000),
        Checkin.listAll("-created_date", 1000, 5000),
        ServiceProvided.listAll("-created_date", 1000, 5000),
        Orcamento.list("-created_date", 500),
      ]);
      setData({ contas: contas || [], clients: clients || [], dogs: dogs || [], appointments: appointments || [], checkins: checkins || [], usages: usages || [], orcamentos: orcamentos || [] });
    } catch (error) {
      console.error("Erro ao carregar valores a receber:", error);
    }
    setIsLoading(false);
  }

  const maps = useMemo(() => ({
    clientsById: Object.fromEntries(data.clients.map((item) => [item.id, item])),
    dogsById: Object.fromEntries(data.dogs.map((item) => [item.id, item])),
    appointmentsById: Object.fromEntries(data.appointments.map((item) => [item.id, item])),
    checkinsById: Object.fromEntries(data.checkins.map((item) => [item.id, item])),
    orcamentosById: Object.fromEntries(data.orcamentos.map((item) => [item.id, item])),
    usageByCheckinId: Object.fromEntries(data.usages.filter((item) => item.checkin_id).map((item) => [item.checkin_id, item])),
    usageByAppointmentId: Object.fromEntries(data.usages.filter((item) => item.appointment_id).map((item) => [item.appointment_id, item])),
  }), [data]);

  const serviceOptions = useMemo(() => Array.from(new Set([...data.contas.map((item) => item.servico), ...data.usages.map((item) => item.service_type)].filter(Boolean))).sort(), [data]);

  const filteredContas = useMemo(() => data.contas.filter((conta) => {
    const client = maps.clientsById[conta.cliente_id];
    const dog = maps.dogsById[conta.dog_id];
    const appointment = maps.appointmentsById[conta.appointment_id];
    const checkin = maps.checkinsById[conta.checkin_id];
    const usage = maps.usageByCheckinId[conta.checkin_id] || maps.usageByAppointmentId[conta.appointment_id];
    const haystack = normalize([
      client?.nome_razao_social, client?.nome_completo, dog?.nome, checkin?.dog_nome, conta.descricao, conta.servico, conta.origem,
      parseMeta(conta.metadata).owner_nome, getAppointmentMeta(appointment).owner_nome, parseMeta(usage?.metadata).owner_nome, getPackageCode(conta, appointment, usage),
    ].join(" "));
    return (!searchTerm || haystack.includes(normalize(searchTerm))) &&
      (filterStatus === "all" || getStatusKey(conta) === filterStatus) &&
      (filterServico === "all" || conta.servico === filterServico) &&
      (filterTipoCobranca === "all" || conta.tipo_cobranca === filterTipoCobranca) &&
      (filterTipoAgendamento === "all" || conta.tipo_agendamento === filterTipoAgendamento) &&
      (filterOrigem === "all" || conta.origem === filterOrigem) &&
      (!filterPrestacaoInicio || conta.data_prestacao >= filterPrestacaoInicio) &&
      (!filterPrestacaoFim || conta.data_prestacao <= filterPrestacaoFim) &&
      (!filterVencimentoInicio || conta.vencimento >= filterVencimentoInicio) &&
      (!filterVencimentoFim || conta.vencimento <= filterVencimentoFim);
  }).sort((a, b) => `${b.vencimento || b.data_prestacao || ""}`.localeCompare(`${a.vencimento || a.data_prestacao || ""}`)), [
    data.contas, filterOrigem, filterPrestacaoFim, filterPrestacaoInicio, filterServico, filterStatus, filterTipoAgendamento, filterTipoCobranca, filterVencimentoFim, filterVencimentoInicio, maps, searchTerm,
  ]);

  const filteredUsages = useMemo(() => data.usages.filter((usage) => usage.charge_type === "pacote").filter((usage) => {
    const client = maps.clientsById[usage.cliente_id];
    const dog = maps.dogsById[usage.dog_id];
    const appointment = maps.appointmentsById[usage.appointment_id];
    const haystack = normalize([client?.nome_razao_social, client?.nome_completo, dog?.nome, usage.responsavel_nome, usage.service_type, getPackageCode(usage, appointment)].join(" "));
    const usageDate = usage.data_utilizacao || getAppointmentDateKey(appointment) || "";
    return (!searchTerm || haystack.includes(normalize(searchTerm))) &&
      (filterServico === "all" || usage.service_type === filterServico) &&
      (!filterPrestacaoInicio || usageDate >= filterPrestacaoInicio) &&
      (!filterPrestacaoFim || usageDate <= filterPrestacaoFim);
  }).sort((a, b) => `${b.data_utilizacao || ""}`.localeCompare(`${a.data_utilizacao || ""}`)), [data.usages, filterPrestacaoFim, filterPrestacaoInicio, filterServico, maps, searchTerm]);

  const stats = useMemo(() => ({
    pendente: filteredContas.filter((item) => getStatusKey(item) === "pendente").reduce((sum, item) => sum + (item.valor || 0), 0),
    vencido: filteredContas.filter((item) => getStatusKey(item) === "vencido").reduce((sum, item) => sum + (item.valor || 0), 0),
    recebido: filteredContas.filter((item) => getStatusKey(item) === "pago").reduce((sum, item) => sum + (item.valor || 0), 0),
    usosPacote: filteredUsages.length,
  }), [filteredContas, filteredUsages.length]);

  const selectedContext = useMemo(() => {
    if (!selectedConta) return {};
    const appointment = maps.appointmentsById[selectedConta.appointment_id];
    const checkin = maps.checkinsById[selectedConta.checkin_id];
    const usage = maps.usageByCheckinId[selectedConta.checkin_id] || maps.usageByAppointmentId[selectedConta.appointment_id];
    return {
      client: maps.clientsById[selectedConta.cliente_id],
      dog: maps.dogsById[selectedConta.dog_id],
      appointment,
      checkin,
      usage,
      orcamento: maps.orcamentosById[selectedConta.orcamento_id],
      appointmentMeta: getAppointmentMeta(appointment),
      checkinMeta: parseMeta(checkin?.metadata),
      contaMeta: parseMeta(selectedConta.metadata),
      usageMeta: parseMeta(usage?.metadata),
      packageCode: getPackageCode(selectedConta, appointment, usage),
      mealRecords: getCheckinMealRecords(checkin),
    };
  }, [maps, selectedConta]);

  async function markReceived() {
    if (!selectedConta || !paymentDate || !paymentMethod) return alert("Informe data e forma de pagamento.");
    setIsSaving(true);
    try {
      await ContaReceber.update(selectedConta.id, { data_recebimento: paymentDate, forma_pagamento: paymentMethod, status: "pago", observacoes: paymentNotes || null });
      await loadData();
      setSelectedConta((prev) => prev ? { ...prev, data_recebimento: paymentDate, forma_pagamento: paymentMethod, status: "pago", observacoes: paymentNotes || null } : prev);
    } catch (error) {
      console.error("Erro ao registrar recebimento:", error);
      alert("Erro ao registrar recebimento.");
    }
    setIsSaving(false);
  }

  async function reopenCharge() {
    if (!selectedConta) return;
    setIsSaving(true);
    try {
      await ContaReceber.update(selectedConta.id, { data_recebimento: null, forma_pagamento: null, status: "pendente" });
      await loadData();
      setSelectedConta((prev) => prev ? { ...prev, data_recebimento: null, forma_pagamento: null, status: "pendente" } : prev);
      setPaymentDate(""); setPaymentMethod("");
    } catch (error) {
      console.error("Erro ao reabrir cobranca:", error);
      alert("Erro ao reabrir cobranca.");
    }
    setIsSaving(false);
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3"><div className="mt-1 rounded-xl bg-blue-100 p-3"><DollarSign className="h-6 w-6 text-blue-600" /></div><div><h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Valores a Receber / Cobrancas</h1><p className="mt-1 text-sm text-gray-600">Cobrancas avulsas e conferencia das utilizacoes em pacote.</p></div></div>
          <Button variant="outline" onClick={loadData}><RefreshCcw className="mr-2 h-4 w-4" />Atualizar</Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-blue-200 bg-white"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-gray-600">Pendente</p><p className="text-2xl font-bold text-blue-600">{fmtMoney(stats.pendente)}</p></div><Wallet className="h-10 w-10 text-blue-500" /></CardContent></Card>
          <Card className="border-red-200 bg-white"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-gray-600">Vencido</p><p className="text-2xl font-bold text-red-600">{fmtMoney(stats.vencido)}</p></div><AlertTriangle className="h-10 w-10 text-red-500" /></CardContent></Card>
          <Card className="border-green-200 bg-white"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-gray-600">Recebido</p><p className="text-2xl font-bold text-green-600">{fmtMoney(stats.recebido)}</p></div><CheckCircle2 className="h-10 w-10 text-green-500" /></CardContent></Card>
          <Card className="border-purple-200 bg-white"><CardContent className="flex items-center justify-between p-4"><div><p className="text-sm text-gray-600">Usos em pacote</p><p className="text-2xl font-bold text-purple-600">{stats.usosPacote}</p></div><PackageCheck className="h-10 w-10 text-purple-500" /></CardContent></Card>
        </div>

        <Card className="border-gray-200 bg-white"><CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="relative md:col-span-2"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar cliente, cao, servico, pacote..." className="pl-9" /></div>
          <Select value={filterServico} onValueChange={setFilterServico}><SelectTrigger><SelectValue placeholder="Servico" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os servicos</SelectItem>{serviceOptions.map((item) => <SelectItem key={item} value={item}>{getServiceLabel(item)}</SelectItem>)}</SelectContent></Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="pendente">Pendente</SelectItem><SelectItem value="vencido">Vencido</SelectItem><SelectItem value="pago">Pago</SelectItem></SelectContent></Select>
          <Select value={filterTipoCobranca} onValueChange={setFilterTipoCobranca}><SelectTrigger><SelectValue placeholder="Tipo de cobranca" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem><SelectItem value="avulso">Avulso</SelectItem><SelectItem value="orcamento">Orcamento</SelectItem><SelectItem value="pacote">Pacote</SelectItem></SelectContent></Select>
          <Select value={filterTipoAgendamento} onValueChange={setFilterTipoAgendamento}><SelectTrigger><SelectValue placeholder="Tipo de agendamento" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="agendamento_solto">Agendamento solto</SelectItem><SelectItem value="orcamento">Orcamento</SelectItem></SelectContent></Select>
          <Select value={filterOrigem} onValueChange={setFilterOrigem}><SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger><SelectContent><SelectItem value="all">Toda origem</SelectItem><SelectItem value="manual_registrador">Registrador manual</SelectItem><SelectItem value="orcamento_aprovado">Orcamento aprovado</SelectItem><SelectItem value="agendamento">Agendamento</SelectItem></SelectContent></Select>
          <div><Label className="text-xs text-gray-500">Prestacao inicial</Label><DatePickerInput value={filterPrestacaoInicio} onChange={setFilterPrestacaoInicio} /></div>
          <div><Label className="text-xs text-gray-500">Prestacao final</Label><DatePickerInput value={filterPrestacaoFim} onChange={setFilterPrestacaoFim} /></div>
          <div><Label className="text-xs text-gray-500">Vencimento inicial</Label><DatePickerInput value={filterVencimentoInicio} onChange={setFilterVencimentoInicio} /></div>
          <div><Label className="text-xs text-gray-500">Vencimento final</Label><DatePickerInput value={filterVencimentoFim} onChange={setFilterVencimentoFim} /></div>
        </CardContent></Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="cobrancas">Cobrancas</TabsTrigger><TabsTrigger value="pacotes">Utilizacoes de pacote</TabsTrigger></TabsList>
          <TabsContent value="cobrancas"><Card className="overflow-hidden border-gray-200 bg-white"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-gray-50"><TableHead>Cliente</TableHead><TableHead>Cao</TableHead><TableHead>Servico</TableHead><TableHead>Prestacao</TableHead><TableHead>Vencimento</TableHead><TableHead>Tipo</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead className="text-center">Ficha</TableHead></TableRow></TableHeader><TableBody>{filteredContas.length === 0 ? <TableRow><TableCell colSpan={10} className="py-12 text-center text-gray-500">Nenhuma cobranca encontrada para os filtros atuais.</TableCell></TableRow> : filteredContas.map((conta) => <TableRow key={conta.id} className="hover:bg-gray-50"><TableCell className="font-medium">{maps.clientsById[conta.cliente_id]?.nome_razao_social || maps.clientsById[conta.cliente_id]?.nome_completo || "-"}</TableCell><TableCell>{maps.dogsById[conta.dog_id]?.nome || "-"}</TableCell><TableCell>{getServiceLabel(conta.servico)}</TableCell><TableCell>{fmtDate(conta.data_prestacao)}</TableCell><TableCell>{fmtDate(conta.vencimento)}</TableCell><TableCell><Badge variant="outline">{getChargeTypeLabel(conta.tipo_cobranca)}</Badge></TableCell><TableCell>{getOriginLabel(conta.origem)}</TableCell><TableCell className="text-right font-medium">{fmtMoney(conta.valor)}</TableCell><TableCell>{getStatusBadge(conta)}</TableCell><TableCell className="text-center"><Button variant="ghost" size="icon" onClick={() => { setSelectedConta(conta); setDetailOpen(true); }}><Eye className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div></Card></TabsContent>
          <TabsContent value="pacotes"><Card className="overflow-hidden border-gray-200 bg-white"><CardHeader><CardTitle>Utilizacoes em pacote</CardTitle></CardHeader><CardContent className="pt-0"><div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">Essas utilizacoes mostram as datas efetivas de uso para cobrancas recorrentes e conferencia de pacote.</div><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-gray-50"><TableHead>Cliente</TableHead><TableHead>Cao</TableHead><TableHead>Servico</TableHead><TableHead>Data de uso</TableHead><TableHead>Codigo do pacote</TableHead><TableHead>Responsavel</TableHead><TableHead className="text-right">Valor base</TableHead></TableRow></TableHeader><TableBody>{filteredUsages.length === 0 ? <TableRow><TableCell colSpan={7} className="py-12 text-center text-gray-500">Nenhuma utilizacao em pacote encontrada.</TableCell></TableRow> : filteredUsages.map((usage) => <TableRow key={usage.id} className="hover:bg-gray-50"><TableCell className="font-medium">{maps.clientsById[usage.cliente_id]?.nome_razao_social || maps.clientsById[usage.cliente_id]?.nome_completo || "-"}</TableCell><TableCell>{maps.dogsById[usage.dog_id]?.nome || "-"}</TableCell><TableCell>{getServiceLabel(usage.service_type)}</TableCell><TableCell>{fmtDate(usage.data_utilizacao || getAppointmentDateKey(maps.appointmentsById[usage.appointment_id]))}</TableCell><TableCell>{getPackageCode(usage, maps.appointmentsById[usage.appointment_id]) || "-"}</TableCell><TableCell>{usage.responsavel_nome || parseMeta(usage.metadata).owner_nome || "-"}</TableCell><TableCell className="text-right">{fmtMoney(usage.valor_cobrado || usage.preco || 0)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>
        </Tabs>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Ficha analitica por atendimento</DialogTitle><DialogDescription>Resumo operacional e financeiro do atendimento que gerou esta cobranca.</DialogDescription></DialogHeader>
          {selectedConta && <div className="space-y-6 py-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Valor</p><p className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(selectedConta.valor)}</p></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Status</p><div className="mt-2">{getStatusBadge(selectedConta)}</div></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Servico</p><p className="mt-2 text-lg font-semibold text-gray-900">{getServiceLabel(selectedConta.servico)}</p></div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Tipo</p><p className="mt-2 text-lg font-semibold text-gray-900">{getChargeTypeLabel(selectedConta.tipo_cobranca)}</p></div>
            </div>

            <Card className="border-gray-200 bg-white"><CardHeader><CardTitle className="text-base">Atendimento e cobranca</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div><Label>Cliente</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.client?.nome_razao_social || selectedContext.client?.nome_completo || "-"}</p></div>
              <div><Label>Responsavel</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.contaMeta.owner_nome || selectedContext.checkin?.responsavel_nome || selectedContext.usage?.responsavel_nome || selectedContext.appointmentMeta.owner_nome || "-"}</p></div>
              <div><Label>Cao</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.dog?.nome || selectedContext.checkin?.dog_nome || "-"}</p></div>
              <div><Label>Data da prestacao</Label><p className="mt-2 text-sm text-gray-800">{fmtDate(selectedConta.data_prestacao)}</p></div>
              <div><Label>Vencimento</Label><p className="mt-2 text-sm text-gray-800">{fmtDate(selectedConta.vencimento)}</p></div>
              <div><Label>Origem</Label><p className="mt-2 text-sm text-gray-800">{getOriginLabel(selectedConta.origem)}</p></div>
              <div><Label>Tipo de agendamento</Label><p className="mt-2 text-sm text-gray-800">{getScheduleTypeLabel(selectedConta.tipo_agendamento)}</p></div>
              <div><Label>Codigo do pacote</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.packageCode || "-"}</p></div>
              <div><Label>Orcamento</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.orcamento?.id || selectedConta.orcamento_id || "-"}</p></div>
              <div><Label>Check-in</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.checkin?.checkin_datetime ? format(new Date(selectedContext.checkin.checkin_datetime), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}</p></div>
              <div><Label>Check-out</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.checkin?.checkout_datetime ? format(new Date(selectedContext.checkin.checkout_datetime), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-"}</p></div>
              <div><Label>Monitor</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.checkin?.checkin_monitor_nome || selectedContext.checkin?.checkout_monitor_nome || "-"}</p></div>
              <div><Label>Refeicao prevista</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.checkin?.tem_refeicao ? "Sim" : "Nao"}</p></div>
              <div><Label>Registros de refeicao</Label><p className="mt-2 text-sm text-gray-800">{selectedContext.mealRecords?.length || 0}</p></div>
              <div><Label>Horario agendado</Label><p className="mt-2 text-sm text-gray-800">{fmtDate(getAppointmentDateKey(selectedContext.appointment))}{selectedContext.appointment?.hora_entrada ? ` • ${selectedContext.appointment.hora_entrada}` : ""}</p></div>
              <div className="sm:col-span-2 lg:col-span-3"><Label>Observacoes</Label><p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{selectedContext.checkin?.observacoes || selectedContext.appointment?.observacoes || selectedConta.observacoes || "-"}</p></div>
            </CardContent></Card>

            <Card className="border-gray-200 bg-white"><CardHeader><CardTitle className="text-base">Baixa de recebimento</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
              <div><Label>Data do recebimento</Label><DatePickerInput value={paymentDate} onChange={setPaymentDate} className="mt-2" /></div>
              <div><Label>Forma de pagamento</Label><Select value={paymentMethod || "none"} onValueChange={(value) => setPaymentMethod(value === "none" ? "" : value)}><SelectTrigger className="mt-2"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="none">Nao informado</SelectItem>{paymentOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="sm:col-span-2"><Label>Observacoes da cobranca</Label><Textarea className="mt-2" rows={4} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Observacoes administrativas da cobranca" /></div>
            </CardContent></Card>

            <Card className="border-gray-200 bg-white"><CardHeader><CardTitle className="text-base">Rastreabilidade</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label>Appointment ID</Label><p className="mt-2 break-all text-xs text-gray-800">{selectedConta.appointment_id || "-"}</p></div>
              <div><Label>Check-in ID</Label><p className="mt-2 break-all text-xs text-gray-800">{selectedConta.checkin_id || "-"}</p></div>
              <div><Label>Orcamento ID</Label><p className="mt-2 break-all text-xs text-gray-800">{selectedConta.orcamento_id || "-"}</p></div>
              <div><Label>Source key</Label><p className="mt-2 break-all text-xs text-gray-800">{selectedConta.source_key || "-"}</p></div>
            </CardContent></Card>
          </div>}
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setDetailOpen(false)}>Fechar</Button>{selectedConta && getStatusKey(selectedConta) === "pago" ? <Button variant="outline" onClick={reopenCharge} disabled={isSaving}>{isSaving ? "Salvando..." : "Reabrir cobranca"}</Button> : <Button onClick={markReceived} disabled={isSaving}><CreditCard className="mr-2 h-4 w-4" />{isSaving ? "Salvando..." : "Marcar recebido"}</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
