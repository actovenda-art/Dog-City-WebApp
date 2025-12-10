import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Lancamento } from "@/api/entities";
import { Transaction } from "@/api/entities";
import { ExtratoBancario } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, Search, Pencil, Trash2, DollarSign, AlertTriangle, CheckCircle, 
  Clock, Upload, FileText, Link2, X, ChevronDown, ChevronRight, Maximize2, Minimize2 
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UploadFile } from "@/api/integrations";

export default function ContasPagar() {
  const [lancamentos, setLancamentos] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("pendentes");
  
  // Estados para expansão
  const [expandedItems, setExpandedItems] = useState({});
  const [expandAll, setExpandAll] = useState(false);

  // Estados para vinculação
  const [vinculandoConta, setVinculandoConta] = useState(null);
  const [transactionIdInput, setTransactionIdInput] = useState("");
  const [loadedTransaction, setLoadedTransaction] = useState(null);
  const [vincularTotalmente, setVincularTotalmente] = useState(true);
  const [valorParcial, setValorParcial] = useState("");
  const [showTransactionError, setShowTransactionError] = useState(false);
  
  const [formData, setFormData] = useState({ 
    categoria: "", recebedor: "", referencia: "", vencimento: "", valor: "", 
    juros_multa: "", forma_pagamento: "", anexo_url: "", negociacao: "", status: "pendente" 
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [lancData, transData] = await Promise.all([
        Lancamento.list("-vencimento", 500),
        ExtratoBancario.filter({ tipo: "saida" })
      ]);
      setLancamentos(lancData);
      setTransactions(transData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleExpandAll = () => {
    const newState = !expandAll;
    setExpandAll(newState);
    const newExpanded = {};
    pendentes.forEach(l => { newExpanded[l.id] = newState; });
    setExpandedItems(newExpanded);
  };

  const resetForm = () => { 
    setFormData({ 
      categoria: "", recebedor: "", referencia: "", vencimento: "", valor: "", 
      juros_multa: "", forma_pagamento: "", anexo_url: "", negociacao: "", status: "pendente" 
    }); 
    setEditingItem(null); 
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({ 
      categoria: item.categoria || "", recebedor: item.recebedor || "", referencia: item.referencia || "", 
      vencimento: item.vencimento || "", valor: item.valor?.toString() || "", 
      juros_multa: item.juros_multa?.toString() || "", forma_pagamento: item.forma_pagamento || "", 
      anexo_url: item.anexo_url || "", negociacao: item.negociacao || "", status: item.status || "pendente" 
    });
    setShowModal(true);
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setIsUploading(true);
    try { 
      const { file_url } = await UploadFile({ file }); 
      setFormData(prev => ({ ...prev, anexo_url: file_url })); 
    } catch (error) { alert("Erro ao enviar arquivo."); }
    setIsUploading(false);
  };

  const handleSave = async () => {
    if (!formData.categoria || !formData.recebedor || !formData.vencimento || !formData.valor) { 
      alert("Preencha os campos obrigatórios"); return; 
    }
    setIsSaving(true);
    try {
      const data = { 
        ...formData, 
        valor: parseFloat(formData.valor.replace(",", ".")) || 0, 
        juros_multa: formData.juros_multa ? parseFloat(formData.juros_multa.replace(",", ".")) : 0,
        valor_quitado: editingItem?.valor_quitado || 0,
        vinculacoes: editingItem?.vinculacoes || []
      };
      if (editingItem) await Lancamento.update(editingItem.id, data);
      else await Lancamento.create(data);
      await loadData(); 
      setShowModal(false); 
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => { 
    if (confirm("Excluir?")) { 
      await Lancamento.delete(id); 
      await loadData(); 
    } 
  };

  // Sistema de Vinculação
  const iniciarVinculacao = (conta) => {
    setVinculandoConta(conta);
    setTransactionIdInput("");
    setLoadedTransaction(null);
    setVincularTotalmente(true);
    setValorParcial("");
    setShowTransactionError(false);
  };

  const cancelarVinculacao = () => {
    setVinculandoConta(null);
    setTransactionIdInput("");
    setLoadedTransaction(null);
    setVincularTotalmente(true);
    setValorParcial("");
    setShowTransactionError(false);
  };

  const loadTransaction = async (e) => {
    if (e.key === "Enter" || e.type === "blur") {
      const inputId = transactionIdInput.trim();
      if (!inputId) return;
      
      // Buscar em ExtratoBancario onde lancamento_id = inputId
      const extratoItems = await ExtratoBancario.filter({ lancamento_id: inputId });
      
      if (extratoItems && extratoItems.length > 0) {
        const extrato = extratoItems[0];
        
        // Verificar se é saída
        if (extrato.tipo !== "saida") {
          setLoadedTransaction({
            id: extrato.lancamento_id,
            tipo: extrato.tipo,
            isReceita: true
          });
          setShowTransactionError(false);
          return;
        }
        
        setLoadedTransaction({
          id: extrato.lancamento_id,
          value: Math.abs(extrato.valor), // Garantir valor positivo
          date: extrato.data,
          payment_method: extrato.forma_pagamento,
          party: extrato.descricao,
          description: extrato.descricao,
          isReceita: false
        });
        setVincularTotalmente(true);
        setValorParcial("");
        setShowTransactionError(false);
      } else {
        setLoadedTransaction(null);
        setTransactionIdInput("");
        setShowTransactionError(true);
        setTimeout(() => setShowTransactionError(false), 2000);
      }
    }
  };

  const getValorDisponivelTransacao = (transactionId) => {
    // Buscar no extrato
    const extrato = transactions.find(t => t.lancamento_id === transactionId);
    if (!extrato) return 0;
    
    let totalVinculado = 0;
    lancamentos.forEach(l => {
      (l.vinculacoes || []).forEach(v => {
        if (v.transaction_id === transactionId) {
          totalVinculado += v.valor_vinculado || 0;
        }
      });
    });
    
    return Math.abs(extrato.valor || 0) - totalVinculado;
  };

  const handleVincular = async () => {
    if (!loadedTransaction || !vinculandoConta || loadedTransaction.isReceita) return;

    const valorDisponivel = getValorDisponivelTransacao(loadedTransaction.id);
    const valorRestanteConta = (vinculandoConta.valor || 0) - (vinculandoConta.valor_quitado || 0);
    
    console.log("DEBUG Vinculação:", {
      loadedTransaction,
      valorDisponivel,
      valorRestanteConta,
      vincularTotalmente,
      valorParcial
    });
    
    let valorAVincular = 0;
    
    if (vincularTotalmente) {
      valorAVincular = Math.min(valorDisponivel, valorRestanteConta);
    } else {
      // Valor parcial é tratado como positivo (desconta da transação)
      valorAVincular = Math.abs(parseFloat(valorParcial.replace(",", ".")) || 0);
      
      if (valorAVincular > valorDisponivel) {
        alert(`Valor disponível da transação: ${formatCurrency(valorDisponivel)}`); return;
      }
      if (valorAVincular > valorRestanteConta) {
        alert(`Valor restante da conta: ${formatCurrency(valorRestanteConta)}`); return;
      }
    }

    console.log("Valor a vincular:", valorAVincular);

    if (valorAVincular <= 0) {
      alert("Valor inválido"); return;
    }

    try {
      const vinculacoes = [...(vinculandoConta.vinculacoes || [])];
      vinculacoes.push({
        transaction_id: loadedTransaction.id,
        valor_vinculado: valorAVincular,
        data_vinculacao: new Date().toISOString().split('T')[0]
      });

      const novoValorQuitado = (vinculandoConta.valor_quitado || 0) + valorAVincular;
      const totalConta = vinculandoConta.valor || 0;
      
      const novoStatus = novoValorQuitado >= totalConta ? "realizado_hoje" : vinculandoConta.status;
      const dataQuitacao = novoValorQuitado >= totalConta ? new Date().toISOString().split('T')[0] : vinculandoConta.data_quitacao;

      console.log("Atualizando lançamento:", {
        vinculacoes,
        novoValorQuitado,
        novoStatus,
        dataQuitacao
      });

      await Lancamento.update(vinculandoConta.id, {
        vinculacoes,
        valor_quitado: novoValorQuitado,
        status: novoStatus,
        data_quitacao: dataQuitacao
      });

      // Se foi totalmente quitado, criar despesa imediatamente
      if (novoStatus === "realizado_hoje") {
        const diasAtraso = dataQuitacao && vinculandoConta.vencimento 
          ? Math.max(0, Math.floor((new Date(dataQuitacao) - new Date(vinculandoConta.vencimento)) / (1000 * 60 * 60 * 24)))
          : 0;

        await base44.entities.Despesa.create({
          data: dataQuitacao,
          categoria: vinculandoConta.categoria,
          subcategoria: vinculandoConta.referencia,
          descricao: `${vinculandoConta.categoria} - ${vinculandoConta.recebedor}`,
          valor: (vinculandoConta.valor || 0) + (vinculandoConta.juros_multa || 0),
          forma_pagamento: vinculandoConta.forma_pagamento,
          fornecedor: vinculandoConta.recebedor,
          observacoes: JSON.stringify({
            vencimento_original: vinculandoConta.vencimento,
            dias_atraso: diasAtraso,
            juros_multa: vinculandoConta.juros_multa,
            vinculacoes: vinculacoes
          })
        });

        // Marcar como movido
        await Lancamento.update(vinculandoConta.id, { movido_para_despesas: true });
      }

      await loadData();
      cancelarVinculacao();
    } catch (error) {
      console.error("Erro ao vincular:", error);
      alert("Erro ao vincular pagamento: " + error.message);
    }
  };

  const removerVinculacao = async (conta, indexVinculacao) => {
    if (!confirm("Remover esta vinculação?")) return;

    const vinculacoes = [...(conta.vinculacoes || [])];
    const vinculacaoRemovida = vinculacoes[indexVinculacao];
    vinculacoes.splice(indexVinculacao, 1);

    const novoValorQuitado = Math.max(0, (conta.valor_quitado || 0) - (vinculacaoRemovida.valor_vinculado || 0));
    const valorTotal = conta.valor || 0;
    
    // Se ainda há débito, volta para pendente e remove da despesa
    const novoStatus = novoValorQuitado >= valorTotal ? "realizado_hoje" : "pendente";
    const novaDataQuitacao = novoValorQuitado >= valorTotal ? conta.data_quitacao : null;

    await Lancamento.update(conta.id, {
      vinculacoes,
      valor_quitado: novoValorQuitado,
      status: novoStatus,
      data_quitacao: novaDataQuitacao,
      movido_para_despesas: false
    });

    await loadData();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getStatusBadge = (l) => {
    if (l.status === "realizado_hoje") return <Badge className="bg-green-100 text-green-700">Realizado Hoje</Badge>;
    if (l.status === "quitada" || l.data_quitacao) return <Badge className="bg-green-100 text-green-700">Quitada</Badge>;
    const dias = differenceInDays(new Date(), new Date(l.vencimento));
    if (dias > 0) return <Badge className="bg-red-100 text-red-700">Vencido</Badge>;
    if (dias > -7) return <Badge className="bg-yellow-100 text-yellow-700">A vencer</Badge>;
    return <Badge className="bg-blue-100 text-blue-700">Pendente</Badge>;
  };

  const getDiasVencimento = (vencimento) => {
    const dias = differenceInDays(new Date(), new Date(vencimento));
    if (dias > 0) return `+${dias}d`;
    if (dias < 0) return `${dias}d`;
    return "Hoje";
  };

  const categorias = [...new Set(lancamentos.map(l => l.categoria))].filter(Boolean);

  const filtered = lancamentos.filter(l => {
    const matchSearch = !searchTerm || 
      l.categoria?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      l.recebedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.referencia?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.negociacao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.forma_pagamento?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      formatDate(l.vencimento).includes(searchTerm) ||
      formatDate(l.data_quitacao).includes(searchTerm) ||
      l.vencimento?.includes(searchTerm) ||
      l.data_quitacao?.includes(searchTerm);
    const matchCategoria = filterCategoria === "all" || l.categoria === filterCategoria;
    return matchSearch && matchCategoria;
  });

  // Filtrar contas que não foram movidas para despesas
  const pendentes = filtered.filter(l => {
    // Não mostra se foi movido para despesas
    if (l.movido_para_despesas) return false;
    // Não mostra se status é realizado_hoje
    if (l.status === "realizado_hoje") return false;
    // Mostra se status é pendente ou não tem data de quitação
    return l.status === "pendente" || !l.data_quitacao;
  });
  
  const realizadosHoje = filtered.filter(l => {
    // Mostra se status é realizado_hoje (independente de movido_para_despesas)
    // Isso permite ver as contas antes de serem movidas automaticamente
    return l.status === "realizado_hoje";
  });

  const totalPendente = pendentes.reduce((acc, l) => acc + ((l.valor || 0) - (l.valor_quitado || 0)), 0);
  const totalVencido = pendentes.filter(l => new Date(l.vencimento) < new Date()).reduce((acc, l) => acc + ((l.valor || 0) - (l.valor_quitado || 0)), 0);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <DollarSign className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Contas a Pagar</h1>
              <p className="text-sm text-gray-600 mt-1">Controle de pendências financeiras</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white shadow-md">
            <Plus className="w-4 h-4 mr-2" />Nova Conta
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">A Pagar</p><p className="text-2xl font-bold text-blue-600">{formatCurrency(totalPendente)}</p></div>
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
              <div><p className="text-sm text-gray-600">Realizados Hoje</p><p className="text-2xl font-bold text-green-600">{realizadosHoje.length}</p></div>
              <CheckCircle className="w-10 h-10 text-green-500" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-lg mb-6">
            <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
            <TabsTrigger value="realizados">Realizados Hoje ({realizadosHoje.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pendentes">
            {/* Botão Expandir/Minimizar Todas */}
            <div className="flex justify-end mb-4">
              <Button variant="outline" size="sm" onClick={handleExpandAll}>
                {expandAll ? <Minimize2 className="w-4 h-4 mr-2" /> : <Maximize2 className="w-4 h-4 mr-2" />}
                {expandAll ? "Minimizar Todas" : "Expandir Todas"}
              </Button>
            </div>

            <div className="space-y-3">
              {pendentes.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-12 text-center">
                    <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhuma conta pendente</p>
                  </CardContent>
                </Card>
              ) : pendentes.map((l) => {
                const valorTotal = l.valor || 0;
                const valorQuitado = l.valor_quitado || 0;
                const valorRestante = valorTotal - valorQuitado;
                const isExpanded = expandedItems[l.id] || false;
                const isVinculando = vinculandoConta?.id === l.id;

                return (
                  <Card key={l.id} className={`border-2 ${isVinculando ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                    {/* Header Minimizado */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => !isVinculando && toggleExpand(l.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleExpand(l.id); }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900">{l.categoria}</span>
                              {getStatusBadge(l)}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              <span><strong>Favorecido:</strong> {l.recebedor}</span>
                              <span><strong>Ref:</strong> {l.referencia}</span>
                              <span><strong>Vencimento:</strong> {formatDate(l.vencimento)}</span>
                              <span className={differenceInDays(new Date(), new Date(l.vencimento)) > 0 ? "text-red-600 font-medium" : "text-blue-600"}>
                                {getDiasVencimento(l.vencimento)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-orange-600">{formatCurrency(valorRestante)}</p>
                          <p className="text-xs text-gray-500">em aberto</p>
                        </div>
                      </div>
                    </div>

                    {/* Conteúdo Expandido */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-4 border-t pt-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Valor Total:</span>
                            <p className="font-bold text-red-600">{formatCurrency(valorTotal)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Valor Pago:</span>
                            <p className="font-medium text-green-600">{formatCurrency(valorQuitado)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Restante:</span>
                            <p className="font-bold text-orange-600">{formatCurrency(valorRestante)}</p>
                          </div>
                        </div>

                        {/* Barra de progresso */}
                        {valorQuitado > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Progresso de Quitação</span>
                              <span>{((valorQuitado / valorTotal) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all"
                                style={{ width: `${Math.min((valorQuitado / valorTotal) * 100, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        <Separator />

                        {/* Vinculações existentes */}
                        {l.vinculacoes && l.vinculacoes.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700">Vinculações de Pagamento:</h4>
                            {l.vinculacoes.map((v, idx) => {
                              const extrato = transactions.find(t => t.lancamento_id === v.transaction_id);
                              return (
                                <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium font-mono">ID: {v.transaction_id}</p>
                                    <p className="text-xs text-gray-600">
                                      {formatDate(extrato?.data || v.data_vinculacao)} • {extrato?.descricao || "Sem descrição"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-green-600">{formatCurrency(v.valor_vinculado)}</span>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => removerVinculacao(l, idx)}
                                      className="h-7 w-7"
                                    >
                                      <X className="w-4 h-4 text-red-500" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <Separator />

                        {/* Sistema de Vinculação */}
                        {!isVinculando ? (
                          <Button 
                            variant="outline" 
                            className="w-full border-2 border-dashed border-blue-400 text-blue-600 hover:bg-blue-50"
                            onClick={(e) => { e.stopPropagation(); iniciarVinculacao(l); }}
                          >
                            <Link2 className="w-4 h-4 mr-2" />Vincular Pagamento
                          </Button>
                        ) : (
                          <div className="p-4 bg-blue-50 rounded-lg border-2 border-blue-400 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-blue-900">Sistema de Vinculação</h4>
                              <Button variant="ghost" size="sm" onClick={cancelarVinculacao}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>

                            <div>
                              <Label className="text-sm">Digite o ID da Transação</Label>
                              <Input 
                                value={transactionIdInput}
                                onChange={(e) => {
                                  setTransactionIdInput(e.target.value);
                                  setShowTransactionError(false);
                                }}
                                onKeyDown={loadTransaction}
                                placeholder="Ex: 1236 ou abc123..."
                                className={`mt-1 font-mono ${showTransactionError ? 'animate-shake border-orange-500' : ''}`}
                              />
                              {showTransactionError ? (
                                <p className="text-sm text-orange-600 mt-2 font-medium">⚠️ Transação não encontrada</p>
                              ) : (
                                <p className="text-xs text-gray-500 mt-1">Pressione Enter para buscar no Extrato Bancário</p>
                              )}
                            </div>

                            {/* Transação Carregada */}
                            {loadedTransaction && loadedTransaction.isReceita && (
                              <div className="p-4 bg-orange-50 rounded-lg border-2 border-orange-400">
                                <p className="text-sm font-medium text-orange-700 text-center">
                                  ⚠️ Transação de receita - Incompatível
                                </p>
                                <p className="text-xs text-orange-600 text-center mt-1">
                                  Apenas transações de saída podem ser vinculadas a contas a pagar
                                </p>
                              </div>
                            )}

                            {loadedTransaction && !loadedTransaction.isReceita && (
                              <div className="space-y-4 p-3 bg-white rounded-lg border border-blue-200">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-gray-600">Valor Total:</span>
                                    <p className="font-bold">{formatCurrency(loadedTransaction.value)}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Data:</span>
                                    <p className="font-medium">{formatDate(loadedTransaction.date)}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Forma Pgto:</span>
                                    <p className="font-medium">{loadedTransaction.payment_method || "-"}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Recebedor:</span>
                                    <p className="font-medium truncate">{loadedTransaction.party || "-"}</p>
                                  </div>
                                </div>

                                <div className="p-2 bg-green-50 rounded border border-green-200">
                                  <div className="flex justify-between text-sm">
                                    <span className="text-gray-700">Valor Disponível:</span>
                                    <span className="font-bold text-green-700">{formatCurrency(getValorDisponivelTransacao(loadedTransaction.id))}</span>
                                  </div>
                                </div>

                                <Separator />

                                <div className="flex items-center gap-2">
                                  <Checkbox 
                                    id="vincular-total"
                                    checked={vincularTotalmente}
                                    onCheckedChange={setVincularTotalmente}
                                  />
                                  <Label htmlFor="vincular-total" className="cursor-pointer">
                                    Vincular totalmente (usar todo o saldo disponível)
                                  </Label>
                                </div>

                                {!vincularTotalmente && (
                                  <div className="space-y-2">
                                    <Label className="text-sm">Valor Parcial a Vincular</Label>
                                    <Input 
                                      type="number"
                                      step="0.01"
                                      value={valorParcial}
                                      onChange={(e) => setValorParcial(e.target.value)}
                                      placeholder="0,00"
                                    />
                                    {valorParcial && (
                                      <p className="text-xs text-orange-600 font-medium">
                                        Restará {formatCurrency(getValorDisponivelTransacao(loadedTransaction.id) - Math.abs(parseFloat(valorParcial.replace(",", ".")) || 0))} não vinculado na transação
                                      </p>
                                    )}
                                  </div>
                                )}

                                <Button 
                                  onClick={handleVincular}
                                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <Link2 className="w-4 h-4 mr-2" />Confirmar Vinculação
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Ações */}
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEditModal(l); }} className="flex-1">
                            <Pencil className="w-4 h-4 mr-2" />Editar
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(l.id); }} className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />Excluir
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="realizados">
            <div className="space-y-3">
              {realizadosHoje.length === 0 ? (
                <Card className="border-gray-200 bg-white">
                  <CardContent className="p-12 text-center">
                    <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Nenhuma conta quitada hoje</p>
                    <p className="text-xs text-gray-400 mt-2">Contas quitadas aparecem imediatamente em "Despesas"</p>
                  </CardContent>
                </Card>
              ) : realizadosHoje.map(l => {
                const valorTotal = l.valor || 0;
                const valorQuitado = l.valor_quitado || 0;
                const isExpanded = expandedItems[l.id] || false;

                return (
                  <Card key={l.id} className="border-2 border-green-200 bg-white">
                    {/* Header Minimizado */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleExpand(l.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleExpand(l.id); }}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                          </button>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900">{l.categoria}</span>
                              <Badge className="bg-green-100 text-green-700">Quitada</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                              <span><strong>Favorecido:</strong> {l.recebedor}</span>
                              <span><strong>Ref:</strong> {l.referencia}</span>
                              <span><strong>Vencimento:</strong> {formatDate(l.vencimento)}</span>
                              <span><strong>Quitação:</strong> {formatDate(l.data_quitacao)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-lg font-bold text-green-600">{formatCurrency(valorTotal)}</p>
                          <p className="text-xs text-gray-500">quitado</p>
                        </div>
                      </div>
                    </div>

                    {/* Conteúdo Expandido */}
                    {isExpanded && l.vinculacoes && l.vinculacoes.length > 0 && (
                      <div className="px-4 pb-4 space-y-2 border-t pt-3">
                        <h4 className="text-sm font-semibold text-gray-700">Vinculações de Pagamento:</h4>
                        {l.vinculacoes.map((v, idx) => {
                          const extrato = transactions.find(t => t.lancamento_id === v.transaction_id);
                          return (
                            <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                              <div className="flex-1">
                                <p className="text-sm font-medium font-mono">ID: {v.transaction_id}</p>
                                <p className="text-xs text-gray-600">
                                  {formatDate(extrato?.data || v.data_vinculacao)} • {extrato?.descricao || "Sem descrição"}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-green-600">{formatCurrency(v.valor_vinculado)}</span>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={(e) => { e.stopPropagation(); removerVinculacao(l, idx); }}
                                  className="h-7 w-7"
                                >
                                  <X className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal Nova/Editar Conta */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingItem ? "Editar" : "Nova"} Conta a Pagar</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div><Label>Categoria *</Label><Input value={formData.categoria} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} placeholder="Ex: Água, Energia" /></div>
            <div><Label>Recebedor *</Label><Input value={formData.recebedor} onChange={(e) => setFormData({ ...formData, recebedor: e.target.value })} placeholder="Fornecedor" /></div>
            <div><Label>Referência</Label><Input value={formData.referencia} onChange={(e) => setFormData({ ...formData, referencia: e.target.value })} placeholder="Mês/Ano" /></div>
            <div><Label>Vencimento *</Label><Input type="date" value={formData.vencimento} onChange={(e) => setFormData({ ...formData, vencimento: e.target.value })} /></div>
            <div><Label>Valor *</Label><Input value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: e.target.value })} placeholder="0,00" /></div>
            <div><Label>Juros/Multa</Label><Input value={formData.juros_multa} onChange={(e) => setFormData({ ...formData, juros_multa: e.target.value })} placeholder="0,00" /></div>
            <div><Label>Forma Pagamento</Label>
              <Select value={formData.forma_pagamento} onValueChange={(v) => setFormData({ ...formData, forma_pagamento: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Anexo</Label>
              <div className="flex gap-2">
                <input type="file" id="anexo" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
                <Button type="button" variant="outline" onClick={() => document.getElementById("anexo").click()} disabled={isUploading} className="flex-1">
                  <Upload className="w-4 h-4 mr-2" />{isUploading ? "Enviando..." : "Upload"}
                </Button>
                {formData.anexo_url && <a href={formData.anexo_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm self-center">Ver</a>}
              </div>
            </div>
            <div className="sm:col-span-2"><Label>Negociação</Label><Input value={formData.negociacao} onChange={(e) => setFormData({ ...formData, negociacao: e.target.value })} placeholder="Observações" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}