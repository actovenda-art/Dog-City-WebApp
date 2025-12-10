import React, { useState, useEffect } from "react";
import { Receita } from "@/api/entities";
import { ContaReceber } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, DollarSign, ArrowUpCircle, TrendingUp, FileText
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Receitas() {
  const [receitas, setReceitas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterServico, setFilterServico] = useState("all");
  const [filterMes, setFilterMes] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => { 
    loadData();
    checkContasRecebidas();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await Receita.list("-data", 1000);
      setReceitas(data);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  // AUTOMAÇÃO: Verificar contas recebidas "pago" e mover para Receitas
  const checkContasRecebidas = async () => {
    try {
      const contasPagas = await ContaReceber.filter({ 
        status: "pago"
      });

      for (const conta of contasPagas) {
        // Verificar se já existe receita com essa conta
        const receitaExistente = await Receita.filter({ 
          observacoes: JSON.stringify({ conta_receber_id: conta.id })
        });

        if (receitaExistente.length === 0) {
          // Criar receita
          await Receita.create({
            data: conta.data_recebimento || new Date().toISOString().split('T')[0],
            cliente_id: conta.cliente_id,
            dog_id: conta.dog_id,
            servico: conta.servico || "outros",
            descricao: conta.descricao || `Recebimento - ${conta.servico}`,
            valor: conta.valor || 0,
            forma_pagamento: conta.forma_pagamento,
            observacoes: JSON.stringify({
              conta_receber_id: conta.id,
              vencimento_original: conta.vencimento
            })
          });
        }
      }

      await loadData();
    } catch (error) {
      console.error("Erro ao processar contas recebidas:", error);
    }
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const servicos = [...new Set(receitas.map(r => r.servico))].filter(Boolean);
  const meses = [...new Set(receitas.map(r => {
    if (!r.data) return null;
    return format(parseISO(r.data), "yyyy-MM");
  }))].filter(Boolean).sort().reverse();

  // Filters
  const filtered = receitas.filter(r => {
    const matchSearch = !searchTerm || 
      r.servico?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchServico = filterServico === "all" || r.servico === filterServico;
    const matchMes = filterMes === "all" || (r.data && format(parseISO(r.data), "yyyy-MM") === filterMes);
    let matchDate = true;
    if (dateStart) matchDate = matchDate && r.data >= dateStart;
    if (dateEnd) matchDate = matchDate && r.data <= dateEnd;
    return matchSearch && matchServico && matchMes && matchDate;
  });

  // Stats
  const totalReceitas = filtered.reduce((acc, r) => acc + (r.valor || 0), 0);
  const totalCartao = filtered.filter(r => r.forma_pagamento === "Cartão de Crédito" || r.forma_pagamento === "Cartão de Débito")
    .reduce((acc, r) => acc + (r.valor || 0), 0);

  const servicoLabel = {
    day_care: "Day Care",
    hospedagem: "Hospedagem",
    banho: "Banho",
    tosa: "Tosa",
    banho_tosa: "Banho e Tosa",
    transporte: "Transporte",
    adestramento: "Adestramento",
    adaptacao: "Adaptação",
    pacote: "Pacote",
    outros: "Outros"
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <TrendingUp className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Receitas Realizadas</h1>
            <p className="text-sm text-gray-600 mt-1">Histórico de todas as entradas recebidas</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Total Receitas</p>
                <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalReceitas)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                <ArrowUpCircle className="w-6 h-6 text-white" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-orange-100">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-orange-700">Recebido em Cartão</p>
                <p className="text-2xl font-bold text-orange-900">{formatCurrency(totalCartao)}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700">Total de Registros</p>
                <p className="text-2xl font-bold text-purple-900">{filtered.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center shadow-md">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-gray-200 bg-white">
          <CardContent className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterServico} onValueChange={setFilterServico}>
              <SelectTrigger><SelectValue placeholder="Serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Serviços</SelectItem>
                {servicos.map(s => (
                  <SelectItem key={s} value={s}>{servicoLabel[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMes} onValueChange={setFilterMes}>
              <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Meses</SelectItem>
                {meses.map(m => (
                  <SelectItem key={m} value={m}>{format(parseISO(m + "-01"), "MMM/yyyy", { locale: ptBR })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} placeholder="De" />
            <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} placeholder="Até" />
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Data Recebimento</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Forma Pagamento</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhuma receita encontrada</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r) => {
                  return (
                    <TableRow key={r.id} className="hover:bg-gray-50">
                      <TableCell>{formatDate(r.data)}</TableCell>
                      <TableCell className="font-medium">
                        <Badge className="bg-green-100 text-green-700">
                          {servicoLabel[r.servico] || r.servico}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.descricao || "-"}</TableCell>
                      <TableCell className="text-right font-medium text-green-600">{formatCurrency(r.valor)}</TableCell>
                      <TableCell>{r.forma_pagamento || "-"}</TableCell>
                      <TableCell className="text-center">
                        {r.parcelas ? `${r.parcelas}x` : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}