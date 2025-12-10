import React, { useState, useEffect } from "react";
import { Despesa } from "@/api/entities";
import { Lancamento } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, DollarSign, ArrowDownCircle, Calendar, TrendingDown, FileText
} from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Despesas() {
  const [despesas, setDespesas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterMes, setFilterMes] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  useEffect(() => { 
    loadData();
    checkContasQuitadas();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await Despesa.list("-data", 1000);
      setDespesas(data);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  // AUTOMAÇÃO: Verificar contas quitadas "realizadas_hoje" e mover para Despesas
  const checkContasQuitadas = async () => {
    try {
      const contasRealizadasHoje = await Lancamento.filter({ 
        status: "realizado_hoje", 
        movido_para_despesas: false 
      });

      const hoje = new Date().toISOString().split('T')[0];
      
      for (const conta of contasRealizadasHoje) {
        // Calcular dias de atraso
        const diasAtraso = conta.data_quitacao && conta.vencimento 
          ? Math.max(0, differenceInDays(new Date(conta.data_quitacao), new Date(conta.vencimento)))
          : 0;

        // Criar despesa
        await Despesa.create({
          data: conta.data_quitacao || hoje,
          categoria: conta.categoria,
          subcategoria: conta.referencia,
          descricao: `${conta.categoria} - ${conta.recebedor}`,
          valor: (conta.valor || 0) + (conta.juros_multa || 0),
          forma_pagamento: conta.forma_pagamento,
          fornecedor: conta.recebedor,
          observacoes: JSON.stringify({
            vencimento_original: conta.vencimento,
            dias_atraso: diasAtraso,
            juros_multa: conta.juros_multa,
            vinculacoes: conta.vinculacoes
          })
        });

        // Marcar como movido
        await Lancamento.update(conta.id, { movido_para_despesas: true });
      }

      if (contasRealizadasHoje.length > 0) {
        await loadData();
      }
    } catch (error) {
      console.error("Erro ao processar contas quitadas:", error);
    }
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(parseISO(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const categorias = [...new Set(despesas.map(d => d.categoria))].filter(Boolean);
  const meses = [...new Set(despesas.map(d => {
    if (!d.data) return null;
    return format(parseISO(d.data), "yyyy-MM");
  }))].filter(Boolean).sort().reverse();

  // Filters
  const filtered = despesas.filter(d => {
    const matchSearch = !searchTerm || 
      d.categoria?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.fornecedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filterCategoria === "all" || d.categoria === filterCategoria;
    const matchMes = filterMes === "all" || (d.data && format(parseISO(d.data), "yyyy-MM") === filterMes);
    let matchDate = true;
    if (dateStart) matchDate = matchDate && d.data >= dateStart;
    if (dateEnd) matchDate = matchDate && d.data <= dateEnd;
    return matchSearch && matchCategoria && matchMes && matchDate;
  });

  // Stats
  const totalDespesas = filtered.reduce((acc, d) => acc + (d.valor || 0), 0);
  const totalJurosMulta = filtered.reduce((acc, d) => {
    try {
      const obs = d.observacoes ? JSON.parse(d.observacoes) : {};
      return acc + (obs.juros_multa || 0);
    } catch { return acc; }
  }, 0);

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-red-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <TrendingDown className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Despesas Realizadas</h1>
            <p className="text-sm text-gray-600 mt-1">Histórico de todas as saídas quitadas</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border-red-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Despesas</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDespesas)}</p>
              </div>
              <ArrowDownCircle className="w-10 h-10 text-red-500" />
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Juros & Multas</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalJurosMulta)}</p>
              </div>
              <DollarSign className="w-10 h-10 text-orange-500" />
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Registros</p>
                <p className="text-2xl font-bold text-blue-600">{filtered.length}</p>
              </div>
              <FileText className="w-10 h-10 text-blue-500" />
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
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {categorias.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
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
                  <TableHead>Data Quitação</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Mês Ref.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Juros/Multa</TableHead>
                  <TableHead className="text-center">Dias Atraso</TableHead>
                  <TableHead>Forma Pgto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <TrendingDown className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">Nenhuma despesa encontrada</p>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((d) => {
                  let obs = {};
                  try { obs = d.observacoes ? JSON.parse(d.observacoes) : {}; } catch {}
                  
                  return (
                    <TableRow key={d.id} className="hover:bg-gray-50">
                      <TableCell>{formatDate(d.data)}</TableCell>
                      <TableCell className="font-medium">{d.categoria}</TableCell>
                      <TableCell>{d.fornecedor || "-"}</TableCell>
                      <TableCell>{d.subcategoria || "-"}</TableCell>
                      <TableCell className="text-right font-medium text-red-600">{formatCurrency(d.valor)}</TableCell>
                      <TableCell className="text-right">
                        {obs.juros_multa > 0 ? (
                          <span className="text-orange-600 font-medium">{formatCurrency(obs.juros_multa)}</span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        {obs.dias_atraso > 0 ? (
                          <Badge className="bg-red-100 text-red-700">{obs.dias_atraso} dias</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-700">No prazo</Badge>
                        )}
                      </TableCell>
                      <TableCell>{d.forma_pagamento || "-"}</TableCell>
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