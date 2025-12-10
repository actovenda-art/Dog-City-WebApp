import React, { useState, useEffect } from "react";
import { Orcamento } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, FileText, Copy, Eye, Trash2, Calendar, Filter, Download, 
  CheckCircle, XCircle, Clock, Send
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { notificacoesOrcamento } from "@/api/functions";

export default function HistoricoOrcamentos() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPeriodo, setFilterPeriodo] = useState("all");
  
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedOrcamento, setSelectedOrcamento] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [orcData, dogsData, carteirasData] = await Promise.all([
        Orcamento.list("-created_date", 500),
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500)
      ]);
      setOrcamentos(orcData);
      setDogs(dogsData);
      setCarteiras(carteirasData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getDogName = (dogId) => {
    const dog = dogs.find(d => d.id === dogId);
    return dog?.nome || "Cão não encontrado";
  };

  const getClienteName = (clienteId) => {
    const carteira = carteiras.find(c => c.id === clienteId);
    return carteira?.nome_razao_social || null;
  };

  const getStatusBadge = (status) => {
    const config = {
      rascunho: { color: "bg-gray-100 text-gray-700", icon: Clock, label: "Rascunho" },
      enviado: { color: "bg-blue-100 text-blue-700", icon: Send, label: "Enviado" },
      aprovado: { color: "bg-green-100 text-green-700", icon: CheckCircle, label: "Aprovado" },
      recusado: { color: "bg-red-100 text-red-700", icon: XCircle, label: "Recusado" },
      expirado: { color: "bg-orange-100 text-orange-700", icon: Clock, label: "Expirado" },
    };
    const c = config[status] || config.rascunho;
    const Icon = c.icon;
    return <Badge className={`${c.color} flex items-center gap-1`}><Icon className="w-3 h-3" />{c.label}</Badge>;
  };

  const handleDuplicate = async (orc) => {
    try {
      const newOrc = {
        ...orc,
        id: undefined,
        created_date: undefined,
        updated_date: undefined,
        data_criacao: new Date().toISOString().split('T')[0],
        data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: "rascunho",
      };
      await Orcamento.create(newOrc);
      await loadData();
      alert("Orçamento duplicado com sucesso!");
    } catch (error) {
      alert("Erro ao duplicar orçamento");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este orçamento?")) return;
    await Orcamento.delete(id);
    await loadData();
  };

  const handleStatusChange = async (id, newStatus) => {
    await Orcamento.update(id, { status: newStatus });
    
    // Notificar sobre mudança de status
    try {
      await notificacoesOrcamento({ 
        action: 'status_alterado', 
        data: { novo_status: newStatus } 
      });
    } catch (e) { console.log("Notificação não enviada"); }
    
    await loadData();
  };

  // Filtros
  const filtered = orcamentos.filter(orc => {
    // Busca por ID ou nome do cão
    const matchSearch = !searchTerm || 
      orc.id?.includes(searchTerm) ||
      orc.caes?.some(c => getDogName(c.dog_id).toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchStatus = filterStatus === "all" || orc.status === filterStatus;
    
    let matchPeriodo = true;
    if (filterPeriodo !== "all" && orc.data_criacao) {
      const dataCriacao = new Date(orc.data_criacao);
      const hoje = new Date();
      if (filterPeriodo === "7dias") {
        matchPeriodo = (hoje - dataCriacao) / (1000 * 60 * 60 * 24) <= 7;
      } else if (filterPeriodo === "30dias") {
        matchPeriodo = (hoje - dataCriacao) / (1000 * 60 * 60 * 24) <= 30;
      } else if (filterPeriodo === "90dias") {
        matchPeriodo = (hoje - dataCriacao) / (1000 * 60 * 60 * 24) <= 90;
      }
    }

    return matchSearch && matchStatus && matchPeriodo;
  });

  // Stats
  const stats = {
    total: orcamentos.length,
    aprovados: orcamentos.filter(o => o.status === "aprovado").length,
    enviados: orcamentos.filter(o => o.status === "enviado").length,
    valorTotal: orcamentos.filter(o => o.status === "aprovado").reduce((acc, o) => acc + (o.valor_total || 0), 0),
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
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Histórico de Orçamentos</h1>
              <p className="text-sm text-gray-600">Visualize e gerencie todos os orçamentos</p>
            </div>
          </div>
          <Link to={createPageUrl("Orcamentos")}>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">
              Novo Orçamento
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <FileText className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
              <p className="text-sm text-gray-600">Total</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 text-center">
              <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-green-600">{stats.aprovados}</p>
              <p className="text-sm text-gray-600">Aprovados</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 text-center">
              <Send className="w-8 h-8 text-orange-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-orange-600">{stats.enviados}</p>
              <p className="text-sm text-gray-600">Aguardando</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-white">
            <CardContent className="p-4 text-center">
              <Download className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.valorTotal)}</p>
              <p className="text-sm text-gray-600">Valor Aprovado</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input 
                placeholder="Buscar por cão ou ID..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="pl-9" 
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPeriodo} onValueChange={setFilterPeriodo}>
              <SelectTrigger className="w-40">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                <SelectItem value="90dias">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Lista de Orçamentos */}
        <Card className="border-gray-200 bg-white">
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum orçamento encontrado</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map(orc => (
                  <div key={orc.id} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <FileText className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {orc.caes?.map(c => getDogName(c.dog_id)).join(", ") || "Sem cães"}
                            </p>
                            <p className="text-sm text-gray-500">
                              Criado em {formatDate(orc.data_criacao)} • Válido até {formatDate(orc.data_validade)}
                            </p>
                          </div>
                        </div>
                        
                        {/* Serviços */}
                        <div className="flex flex-wrap gap-2 ml-13 mb-2">
                          {orc.subtotal_hospedagem > 0 && (
                            <Badge variant="outline" className="text-xs">🏨 Hospedagem</Badge>
                          )}
                          {orc.subtotal_servicos > 0 && (
                            <Badge variant="outline" className="text-xs">🛁 Banho & Tosa</Badge>
                          )}
                          {orc.subtotal_transporte > 0 && (
                            <Badge variant="outline" className="text-xs">🚐 Transporte</Badge>
                          )}
                        </div>

                        {orc.observacoes && (
                          <p className="text-sm text-gray-600 ml-13 bg-yellow-50 p-2 rounded">
                            📝 {orc.observacoes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xl font-bold text-green-600">{formatCurrency(orc.valor_total)}</span>
                        {getStatusBadge(orc.status)}
                        
                        <div className="flex gap-1 mt-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => { setSelectedOrcamento(orc); setShowDetailModal(true); }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => handleDuplicate(orc)}
                            title="Duplicar"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => handleDelete(orc.id)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Detalhes */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Orçamento</DialogTitle>
          </DialogHeader>
          {selectedOrcamento && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Status:</span>
                {getStatusBadge(selectedOrcamento.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Criado em:</span>
                <span>{formatDate(selectedOrcamento.data_criacao)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Válido até:</span>
                <span>{formatDate(selectedOrcamento.data_validade)}</span>
              </div>

              <hr />

              <h4 className="font-semibold">Cães:</h4>
              {selectedOrcamento.caes?.map((cao, idx) => (
                <div key={idx} className="bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium">{getDogName(cao.dog_id)}</p>
                  {cao.data_entrada && (
                    <p className="text-sm text-gray-500">
                      {formatDate(cao.data_entrada)} a {formatDate(cao.data_saida)}
                    </p>
                  )}
                </div>
              ))}

              <hr />

              <div className="space-y-2">
                {selectedOrcamento.subtotal_hospedagem > 0 && (
                  <div className="flex justify-between">
                    <span>Hospedagem:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_hospedagem)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_servicos > 0 && (
                  <div className="flex justify-between">
                    <span>Banho & Tosa:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_servicos)}</span>
                  </div>
                )}
                {selectedOrcamento.subtotal_transporte > 0 && (
                  <div className="flex justify-between">
                    <span>Transporte:</span>
                    <span>{formatCurrency(selectedOrcamento.subtotal_transporte)}</span>
                  </div>
                )}
                {selectedOrcamento.desconto_total > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Descontos:</span>
                    <span>-{formatCurrency(selectedOrcamento.desconto_total)}</span>
                  </div>
                )}
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-green-600">{formatCurrency(selectedOrcamento.valor_total)}</span>
                </div>
              </div>

              {selectedOrcamento.observacoes && (
                <>
                  <hr />
                  <div>
                    <h4 className="font-semibold mb-2">Observações:</h4>
                    <p className="text-gray-600 bg-yellow-50 p-3 rounded">{selectedOrcamento.observacoes}</p>
                  </div>
                </>
              )}

              {/* Alterar Status */}
              <hr />
              <div>
                <h4 className="font-semibold mb-2">Alterar Status:</h4>
                <div className="flex flex-wrap gap-2">
                  {["rascunho", "enviado", "aprovado", "recusado"].map(status => (
                    <Button
                      key={status}
                      variant={selectedOrcamento.status === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        handleStatusChange(selectedOrcamento.id, status);
                        setSelectedOrcamento({ ...selectedOrcamento, status });
                      }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailModal(false)}>Fechar</Button>
            <Button onClick={() => handleDuplicate(selectedOrcamento)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Copy className="w-4 h-4 mr-2" />Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}