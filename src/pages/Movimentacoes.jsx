import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, Filter, DollarSign, ArrowUpCircle, ArrowDownCircle, MoreVertical, Pencil, Trash2
} from "lucide-react";
import { format, startOfMonth, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import PeriodFilterSidebar from "@/components/common/PeriodFilterSidebar";
import TypesFilterSidebar from "@/components/common/TypesFilterSidebar";

export default function Movimentacoes() {
  const [lancamentos, setLancamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isPeriodSidebarOpen, setIsPeriodSidebarOpen] = useState(false);
  const [isTypesSidebarOpen, setIsTypesSidebarOpen] = useState(false);
  const [periodFilter, setPeriodFilter] = useState({
    periodoRapido: null,
    dataInicial: "",
    dataFinal: "",
    ordenacao: "desc"
  });
  const [selectedTypes, setSelectedTypes] = useState({
    entrada: true,
    saida: true
  });
  
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(null);

  const [formData, setFormData] = useState({ 
    data: "", descricao: "", tipo: "entrada", valor: "", 
    conciliado: false, forma_pagamento: "", banco: "", categoria: "" 
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await base44.entities.ExtratoBancario.list("-data", 1000);
      setLancamentos(data);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const openModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ 
        data: item.data || "", descricao: item.descricao || "", tipo: item.tipo || "entrada", 
        valor: item.valor?.toString() || "", conciliado: item.conciliado || false, 
        forma_pagamento: item.forma_pagamento || "", banco: item.banco || "", categoria: item.categoria || "" 
      });
    } else {
      setEditingItem(null);
      setFormData({ data: "", descricao: "", tipo: "entrada", valor: "", conciliado: false, forma_pagamento: "", banco: "", categoria: "" });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.data || !formData.valor || !formData.tipo) { 
      alert("Preencha: Data, Tipo e Valor"); return; 
    }
    setIsSaving(true);
    try {
      const data = { ...formData, valor: parseFloat(formData.valor.replace(",", ".")) || 0 };
      if (editingItem) await base44.entities.ExtratoBancario.update(editingItem.id, data);
      else await base44.entities.ExtratoBancario.create(data);
      await loadData(); 
      setShowModal(false);
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => { 
    if (confirm("Excluir este lançamento?")) { 
      await base44.entities.ExtratoBancario.delete(id); 
      await loadData();
      setShowActionsMenu(null);
    } 
  };

  const handleApplyPeriodFilter = (filter) => {
    setPeriodFilter(filter);
  };

  const handleToggleType = (type) => {
    setSelectedTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  // Filters
  let filtered = lancamentos.filter(m => {
    const matchSearch = !searchTerm || 
      m.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      m.banco?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.categoria?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      format(parseISO(m.data), "dd/MM/yyyy").includes(searchTerm) ||
      format(parseISO(m.data), "dd/MM/yy").includes(searchTerm);
    
    const matchType = (selectedTypes.entrada && m.tipo === "entrada") || 
                      (selectedTypes.saida && m.tipo === "saida");
    
    let matchDate = true;
    if (periodFilter.dataInicial) matchDate = matchDate && new Date(m.data) >= new Date(periodFilter.dataInicial);
    if (periodFilter.dataFinal) matchDate = matchDate && new Date(m.data) <= new Date(periodFilter.dataFinal);
    
    return matchSearch && matchType && matchDate;
  });

  // Sorting by date
  filtered = [...filtered].sort((a, b) => {
    const dateA = new Date(a.data);
    const dateB = new Date(b.data);
    return periodFilter.ordenacao === 'desc' ? dateB - dateA : dateA - dateB;
  });

  // Group by month and day
  const groupedByMonthAndDay = filtered.reduce((acc, item) => {
    const date = parseISO(item.data);
    const monthKey = format(date, "yyyy-MM");
    const dayKey = format(date, "yyyy-MM-dd");
    
    if (!acc[monthKey]) {
      acc[monthKey] = {};
    }
    if (!acc[monthKey][dayKey]) {
      acc[monthKey][dayKey] = [];
    }
    acc[monthKey][dayKey].push(item);
    return acc;
  }, {});

  const getDateLabel = (dateStr) => {
    const date = parseISO(dateStr);
    const today = new Date();
    
    if (isSameDay(date, today)) {
      return "Hoje";
    }
    
    return format(date, "EEEE, d 'de' MMM 'de' yyyy", { locale: ptBR });
  };

  const getDaySaldo = (transactions) => {
    return transactions.reduce((sum, t) => {
      return sum + (t.tipo === "entrada" ? Math.abs(t.valor) : -Math.abs(t.valor));
    }, 0);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-semibold text-white">Transações</h1>
          <p className="text-sm text-blue-100 mt-1">Movimentações Financeiras</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-12 rounded-full border-gray-300 focus:border-orange-500 focus:ring-orange-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            onClick={() => setIsPeriodSidebarOpen(true)}
            className="rounded-full border-blue-300 text-blue-600 hover:bg-blue-50 gap-2"
          >
            <Filter className="w-4 h-4" />
            Período
            {(periodFilter.periodoRapido || periodFilter.dataInicial) && (
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsTypesSidebarOpen(true)}
            className="rounded-full border-blue-300 text-blue-600 hover:bg-blue-50 gap-2"
          >
            <Filter className="w-4 h-4" />
            Tipos
            {(!selectedTypes.entrada || !selectedTypes.saida) && (
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
            )}
          </Button>

          <Button
            onClick={() => openModal()}
            className="ml-auto rounded-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white gap-2 shadow-md"
          >
            <Plus className="w-4 h-4" />
            Nova transação
          </Button>
        </div>

        {/* Transactions List */}
        <div className="space-y-6">
            {Object.keys(groupedByMonthAndDay).length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhuma transação encontrada</p>
              </div>
            ) : (
              Object.keys(groupedByMonthAndDay).map(monthKey => {
                const monthDate = parseISO(monthKey + "-01");
                const monthLabel = format(monthDate, "MMMM", { locale: ptBR });
                const days = groupedByMonthAndDay[monthKey];

                return (
                  <div key={monthKey}>
                    {/* Month Header */}
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
                      {monthLabel}
                    </h2>

                    {/* Days */}
                    {Object.keys(days).map(dayKey => {
                      const transactions = days[dayKey];
                      const daySaldo = getDaySaldo(transactions);
                      const dateLabel = getDateLabel(dayKey);

                      return (
                        <div key={dayKey} className="mb-6">
                          {/* Day Header */}
                          <div className="flex items-center justify-between mb-3 px-1">
                            <h3 className="text-sm font-medium text-gray-700 capitalize">
                              {dateLabel}
                            </h3>
                            <span className={`text-sm font-medium ${
                              daySaldo >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              Saldo do dia {formatCurrency(daySaldo)}
                            </span>
                          </div>

                          {/* Transactions Cards */}
                          <div className="bg-white rounded-lg divide-y divide-gray-100 shadow-sm border border-gray-200">
                            {transactions.map((transaction, idx) => (
                              <div
                                key={transaction.id}
                                className="p-4 hover:bg-gray-50 transition-colors relative"
                              >
                                <div className="flex items-start gap-3">
                                  {/* Icon */}
                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    transaction.tipo === "entrada" 
                                      ? "bg-green-100" 
                                      : "bg-red-100"
                                  }`}>
                                    {transaction.tipo === "entrada" ? (
                                      <ArrowUpCircle className="w-5 h-5 text-green-600" />
                                    ) : (
                                      <ArrowDownCircle className="w-5 h-5 text-red-600" />
                                    )}
                                  </div>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4 mb-1">
                                      <h4 className="font-semibold text-gray-900 text-sm">
                                        {transaction.tipo === "entrada" ? "Recebimento" : "Pagamento"}
                                      </h4>
                                      <span className={`font-semibold text-sm whitespace-nowrap ${
                                        transaction.tipo === "entrada" 
                                          ? "text-green-600" 
                                          : "text-red-600"
                                      }`}>
                                        {transaction.tipo === "entrada" ? "+" : "-"}
                                        {formatCurrency(Math.abs(transaction.valor))}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mb-0.5">
                                      {transaction.descricao || transaction.banco || "Sem descrição"}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {transaction.tipo === "entrada" ? "Entrada" : "Saída"}
                                      {transaction.forma_pagamento && ` · ${transaction.forma_pagamento}`}
                                    </p>
                                  </div>

                                  {/* Actions Menu */}
                                  <div className="relative">
                                    <button
                                      onClick={() => setShowActionsMenu(showActionsMenu === transaction.id ? null : transaction.id)}
                                      className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                    >
                                      <MoreVertical className="w-5 h-5 text-gray-400" />
                                    </button>
                                    
                                    {showActionsMenu === transaction.id && (
                                      <>
                                        <div 
                                          className="fixed inset-0 z-10" 
                                          onClick={() => setShowActionsMenu(null)}
                                        ></div>
                                        <div className="absolute right-0 top-8 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                          <button
                                            onClick={() => {
                                              openModal(transaction);
                                              setShowActionsMenu(null);
                                            }}
                                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                          >
                                            <Pencil className="w-4 h-4" />
                                            Editar
                                          </button>
                                          <button
                                            onClick={() => handleDelete(transaction.id)}
                                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                            Excluir
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
        </div>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Nova"} Transação</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={formData.data} onChange={(e) => setFormData({ ...formData, data: e.target.value })} />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor *</Label>
              <Input value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: e.target.value })} placeholder="0,00" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="conciliado" checked={formData.conciliado} onChange={(e) => setFormData({ ...formData, conciliado: e.target.checked })} className="w-4 h-4" />
              <Label htmlFor="conciliado">Conciliado</Label>
            </div>
            <div className="sm:col-span-2">
              <Label>Descrição</Label>
              <Input value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} />
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={formData.forma_pagamento} onValueChange={(v) => setFormData({ ...formData, forma_pagamento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Banco</Label>
              <Input value={formData.banco} onChange={(e) => setFormData({ ...formData, banco: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Categoria</Label>
              <Input value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} placeholder="Ex: Alimentação, Transporte..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)} className="border-gray-300">Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Filter Sidebar */}
      <PeriodFilterSidebar
        isOpen={isPeriodSidebarOpen}
        onClose={() => setIsPeriodSidebarOpen(false)}
        onApplyFilter={handleApplyPeriodFilter}
        currentFilter={periodFilter}
      />

      {/* Types Filter Sidebar */}
      <TypesFilterSidebar
        isOpen={isTypesSidebarOpen}
        onClose={() => setIsTypesSidebarOpen(false)}
        selectedTypes={selectedTypes}
        onToggleType={handleToggleType}
      />
    </div>
  );
}