import React, { useState, useEffect } from "react";
import { ContaReceber } from "@/api/entities";
import { Client } from "@/api/entities";
import { Dog } from "@/api/entities";
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
  Plus, Search, Pencil, Trash2, DollarSign, AlertTriangle, CheckCircle, Clock, XCircle
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContasReceber() {
  const [contas, setContas] = useState([]);
  const [clients, setClients] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: "", dog_id: "", descricao: "", servico: "", valor: "",
    vencimento: "", data_recebimento: "", forma_pagamento: "", status: "pendente", observacoes: ""
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [contasData, clientsData, dogsData] = await Promise.all([
        ContaReceber.list("-vencimento", 500),
        Client.list("-created_date", 500),
        Dog.list("-created_date", 500)
      ]);
      setContas(contasData);
      setClients(clientsData);
      setDogs(dogsData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({
      cliente_id: "", dog_id: "", descricao: "", servico: "", valor: "",
      vencimento: "", data_recebimento: "", forma_pagamento: "", status: "pendente", observacoes: ""
    });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      cliente_id: item.cliente_id || "", dog_id: item.dog_id || "", descricao: item.descricao || "",
      servico: item.servico || "", valor: item.valor?.toString() || "", vencimento: item.vencimento || "",
      data_recebimento: item.data_recebimento || "", forma_pagamento: item.forma_pagamento || "",
      status: item.status || "pendente", observacoes: item.observacoes || ""
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.cliente_id || !formData.valor || !formData.vencimento) {
      alert("Preencha: Cliente, Valor e Vencimento"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = { ...formData, valor: parseFloat(formData.valor.replace(",", ".")) || 0 };
      if (editingItem) await ContaReceber.update(editingItem.id, dataToSave);
      else await ContaReceber.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir esta conta?")) return;
    await ContaReceber.delete(id);
    await loadData();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yy", { locale: ptBR }) : "-";
  const getClientName = (id) => clients.find(c => c.id === id)?.nome_completo || "-";

  const getStatusBadge = (conta) => {
    if (conta.data_recebimento) return <Badge className="bg-green-100 text-green-700">Pago</Badge>;
    const dias = differenceInDays(new Date(), new Date(conta.vencimento));
    if (dias > 0) return <Badge className="bg-red-100 text-red-700">Vencido ({dias}d)</Badge>;
    if (dias > -7) return <Badge className="bg-yellow-100 text-yellow-700">Vence em {Math.abs(dias)}d</Badge>;
    return <Badge className="bg-blue-100 text-blue-700">Pendente</Badge>;
  };

  const filtered = contas.filter(c => {
    const matchSearch = !searchTerm || getClientName(c.cliente_id).toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || 
      (filterStatus === "pago" && c.data_recebimento) ||
      (filterStatus === "vencido" && !c.data_recebimento && new Date(c.vencimento) < new Date()) ||
      (filterStatus === "pendente" && !c.data_recebimento && new Date(c.vencimento) >= new Date());
    return matchSearch && matchStatus;
  });

  const totalPendente = filtered.filter(c => !c.data_recebimento).reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalVencido = filtered.filter(c => !c.data_recebimento && new Date(c.vencimento) < new Date()).reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalRecebido = filtered.filter(c => c.data_recebimento).reduce((acc, c) => acc + (c.valor || 0), 0);

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <DollarSign className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contas a Receber</h1>
              <p className="text-sm text-gray-600 mt-1">Controle de inadimplência</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md">
            <Plus className="w-4 h-4 mr-2" />Nova Conta
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">A Receber</p><p className="text-2xl font-bold text-blue-600">{formatCurrency(totalPendente)}</p></div>
              <Clock className="w-10 h-10 text-blue-500" />
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Vencido</p><p className="text-2xl font-bold text-red-600">{formatCurrency(totalVencido)}</p></div>
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Recebido</p><p className="text-2xl font-bold text-green-600">{formatCurrency(totalRecebido)}</p></div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar cliente..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12"><DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Nenhuma conta encontrada</p></TableCell></TableRow>
                ) : (
                  filtered.map((conta) => (
                    <TableRow key={conta.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{getClientName(conta.cliente_id)}</TableCell>
                      <TableCell>{conta.descricao || "-"}</TableCell>
                      <TableCell>{formatDate(conta.vencimento)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(conta.valor)}</TableCell>
                      <TableCell>{getStatusBadge(conta)}</TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(conta)} className="h-8 w-8"><Pencil className="w-4 h-4 text-gray-600" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(conta.id)} className="h-8 w-8"><Trash2 className="w-4 h-4 text-red-600" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Editar" : "Nova"} Conta a Receber</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={formData.cliente_id} onValueChange={(v) => setFormData({ ...formData, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nome_completo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor *</Label>
              <Input value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: e.target.value })} placeholder="0,00" />
            </div>
            <div>
              <Label>Vencimento *</Label>
              <Input type="date" value={formData.vencimento} onChange={(e) => setFormData({ ...formData, vencimento: e.target.value })} />
            </div>
            <div>
              <Label>Data Recebimento</Label>
              <Input type="date" value={formData.data_recebimento} onChange={(e) => setFormData({ ...formData, data_recebimento: e.target.value })} />
            </div>
            <div>
              <Label>Forma Pagamento</Label>
              <Select value={formData.forma_pagamento} onValueChange={(v) => setFormData({ ...formData, forma_pagamento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serviço</Label>
              <Select value={formData.servico} onValueChange={(v) => setFormData({ ...formData, servico: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day_care">Day Care</SelectItem>
                  <SelectItem value="hospedagem">Hospedagem</SelectItem>
                  <SelectItem value="banho_tosa">Banho e Tosa</SelectItem>
                  <SelectItem value="pacote">Pacote</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white">{isSaving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}