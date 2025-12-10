import React, { useState, useEffect } from "react";
import { Dog } from "@/api/entities";
import { Responsavel } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dog as DogIcon, Users, Cake, Syringe, Search, Filter, Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addDays, isBefore, isAfter, subDays, differenceInDays, getMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RelatoriosCaes() {
  const [dogs, setDogs] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRaca, setFilterRaca] = useState("all");
  const [filterPeriodoVacina, setFilterPeriodoVacina] = useState("30");
  const [filterMesAniversario, setFilterMesAniversario] = useState(String(new Date().getMonth()));

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dogsData, respData] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 500)
      ]);
      setDogs(dogsData.filter(d => d.ativo !== false));
      setResponsaveis(respData);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  // Raças únicas
  const racas = [...new Set(dogs.map(d => d.raca).filter(Boolean))].sort();

  // Cães por raça
  const caesPorRaca = () => {
    const filtered = filterRaca === "all" ? dogs : dogs.filter(d => d.raca === filterRaca);
    const grouped = filtered.reduce((acc, d) => {
      const raca = d.raca || "Não informada";
      if (!acc[raca]) acc[raca] = [];
      acc[raca].push(d);
      return acc;
    }, {});
    return Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);
  };

  // Cães por responsável
  const caesPorResponsavel = () => {
    return responsaveis.map(resp => {
      const dogIds = [1,2,3,4,5,6,7,8].map(n => resp[`dog_id_${n}`]).filter(Boolean);
      const caesVinculados = dogs.filter(d => dogIds.includes(d.id));
      return { ...resp, caes: caesVinculados };
    }).filter(r => r.caes.length > 0 && (!searchTerm || r.nome_completo?.toLowerCase().includes(searchTerm.toLowerCase())));
  };

  // Aniversariantes do mês
  const aniversariantesMes = () => {
    const mes = parseInt(filterMesAniversario);
    return dogs.filter(d => {
      if (!d.data_nascimento) return false;
      return getMonth(new Date(d.data_nascimento)) === mes;
    }).sort((a, b) => new Date(a.data_nascimento).getDate() - new Date(b.data_nascimento).getDate());
  };

  // Próximas revacinações
  const proximasRevacinacoes = () => {
    const hoje = new Date();
    const dias = parseInt(filterPeriodoVacina);
    const limite = addDays(hoje, dias);
    const result = [];
    dogs.forEach(d => {
      [d.data_revacinacao_1, d.data_revacinacao_2, d.data_revacinacao_3].forEach((dataRev, idx) => {
        if (dataRev) {
          const data = new Date(dataRev);
          if (isAfter(data, subDays(hoje, 1)) && isBefore(data, limite)) {
            const diasRestantes = differenceInDays(data, hoje);
            result.push({ ...d, dataRevacinacao: dataRev, diasRestantes, numeroVacina: idx + 1 });
          }
        }
      });
    });
    return result.sort((a, b) => a.diasRestantes - b.diasRestantes);
  };

  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png" alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12" />
          <div><h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Relatórios de Cães</h1><p className="text-sm text-gray-600">Análises e listagens</p></div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white"><CardContent className="p-4 text-center"><DogIcon className="w-8 h-8 text-blue-600 mx-auto mb-2" /><p className="text-2xl font-bold text-blue-600">{dogs.length}</p><p className="text-sm text-gray-600">Total de Cães</p></CardContent></Card>
          <Card className="border-green-200 bg-white"><CardContent className="p-4 text-center"><Users className="w-8 h-8 text-green-600 mx-auto mb-2" /><p className="text-2xl font-bold text-green-600">{racas.length}</p><p className="text-sm text-gray-600">Raças</p></CardContent></Card>
          <Card className="border-orange-200 bg-white"><CardContent className="p-4 text-center"><Cake className="w-8 h-8 text-orange-600 mx-auto mb-2" /><p className="text-2xl font-bold text-orange-600">{aniversariantesMes().length}</p><p className="text-sm text-gray-600">Aniversariantes</p></CardContent></Card>
          <Card className="border-purple-200 bg-white"><CardContent className="p-4 text-center"><Syringe className="w-8 h-8 text-purple-600 mx-auto mb-2" /><p className="text-2xl font-bold text-purple-600">{proximasRevacinacoes().length}</p><p className="text-sm text-gray-600">Vacinas Próximas</p></CardContent></Card>
        </div>

        <Tabs defaultValue="raca">
          <TabsList className="mb-6 w-full grid grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="raca" className="flex items-center gap-1"><DogIcon className="w-4 h-4" />Por Raça</TabsTrigger>
            <TabsTrigger value="responsavel" className="flex items-center gap-1"><Users className="w-4 h-4" />Por Responsável</TabsTrigger>
            <TabsTrigger value="aniversario" className="flex items-center gap-1"><Cake className="w-4 h-4" />Aniversariantes</TabsTrigger>
            <TabsTrigger value="vacinas" className="flex items-center gap-1"><Syringe className="w-4 h-4" />Revacinações</TabsTrigger>
          </TabsList>

          {/* Por Raça */}
          <TabsContent value="raca">
            <Card className="mb-4 border-gray-200 bg-white"><CardContent className="p-4">
              <Select value={filterRaca} onValueChange={setFilterRaca}><SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Filtrar por raça" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as raças</SelectItem>{racas.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
            </CardContent></Card>
            <div className="space-y-4">
              {caesPorRaca().map(([raca, caes]) => (
                <Card key={raca} className="border-gray-200 bg-white">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><DogIcon className="w-5 h-5 text-blue-600" />{raca}</span><Badge className="bg-blue-100 text-blue-700">{caes.length} cães</Badge></CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {caes.map(d => (
                        <Link key={d.id} to={createPageUrl("PerfilCao") + `?id=${d.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                          {d.foto_url ? <img src={d.foto_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                          <div className="flex-1"><p className="font-medium text-gray-900">{d.nome}</p>{d.peso && <p className="text-xs text-gray-500">{d.peso} kg</p>}</div>
                          <Eye className="w-4 h-4 text-gray-400" />
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Por Responsável */}
          <TabsContent value="responsavel">
            <Card className="mb-4 border-gray-200 bg-white"><CardContent className="p-4">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" /><Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar responsável..." className="pl-9 w-full sm:w-64" /></div>
            </CardContent></Card>
            <div className="space-y-4">
              {caesPorResponsavel().map(resp => (
                <Card key={resp.id} className="border-gray-200 bg-white">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between"><span className="flex items-center gap-2"><Users className="w-5 h-5 text-green-600" />{resp.nome_completo}</span><Badge className="bg-green-100 text-green-700">{resp.caes.length} cães</Badge></CardTitle><p className="text-sm text-gray-500">{resp.celular} • {resp.email}</p></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {resp.caes.map(d => (
                        <Link key={d.id} to={createPageUrl("PerfilCao") + `?id=${d.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                          {d.foto_url ? <img src={d.foto_url} className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                          <div className="flex-1"><p className="font-medium text-gray-900">{d.nome}</p><p className="text-xs text-gray-500">{d.raca || "Raça não informada"}</p></div>
                          <Eye className="w-4 h-4 text-gray-400" />
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {caesPorResponsavel().length === 0 && <Card className="border-gray-200 bg-white"><CardContent className="p-12 text-center"><Users className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">Nenhum responsável encontrado</p></CardContent></Card>}
            </div>
          </TabsContent>

          {/* Aniversariantes */}
          <TabsContent value="aniversario">
            <Card className="mb-4 border-gray-200 bg-white"><CardContent className="p-4">
              <Select value={filterMesAniversario} onValueChange={setFilterMesAniversario}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent>{meses.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent></Select>
            </CardContent></Card>
            <Card className="border-gray-200 bg-white">
              <CardHeader><CardTitle className="flex items-center gap-2"><Cake className="w-5 h-5 text-orange-600" />Aniversariantes de {meses[parseInt(filterMesAniversario)]}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aniversariantesMes().map(d => (
                    <Link key={d.id} to={createPageUrl("PerfilCao") + `?id=${d.id}`} className="flex items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors">
                      {d.foto_url ? <img src={d.foto_url} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                      <div className="flex-1"><p className="font-semibold text-gray-900">{d.nome} {d.apelido && `(${d.apelido})`}</p><p className="text-sm text-gray-500">{d.raca}</p></div>
                      <div className="text-right"><Badge className="bg-orange-100 text-orange-700">Dia {new Date(d.data_nascimento).getDate()}</Badge><p className="text-xs text-gray-500 mt-1">{formatDate(d.data_nascimento)}</p></div>
                    </Link>
                  ))}
                  {aniversariantesMes().length === 0 && <p className="text-center text-gray-500 py-8">Nenhum aniversariante em {meses[parseInt(filterMesAniversario)]}</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Revacinações */}
          <TabsContent value="vacinas">
            <Card className="mb-4 border-gray-200 bg-white"><CardContent className="p-4">
              <Select value={filterPeriodoVacina} onValueChange={setFilterPeriodoVacina}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">Próximos 30 dias</SelectItem><SelectItem value="60">Próximos 60 dias</SelectItem><SelectItem value="90">Próximos 90 dias</SelectItem></SelectContent></Select>
            </CardContent></Card>
            <Card className="border-gray-200 bg-white">
              <CardHeader><CardTitle className="flex items-center gap-2"><Syringe className="w-5 h-5 text-purple-600" />Revacinações nos Próximos {filterPeriodoVacina} Dias</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {proximasRevacinacoes().map((d, i) => (
                    <Link key={i} to={createPageUrl("PerfilCao") + `?id=${d.id}`} className={`flex items-center gap-4 p-3 rounded-lg border hover:opacity-80 transition-opacity ${d.diasRestantes <= 7 ? 'bg-red-50 border-red-200' : d.diasRestantes <= 14 ? 'bg-yellow-50 border-yellow-200' : 'bg-purple-50 border-purple-200'}`}>
                      {d.foto_url ? <img src={d.foto_url} className="w-12 h-12 rounded-full object-cover" /> : <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>}
                      <div className="flex-1"><p className="font-semibold text-gray-900">{d.nome} {d.apelido && `(${d.apelido})`}</p><p className="text-sm text-gray-500">{d.numeroVacina}ª Revacinação - {formatDate(d.dataRevacinacao)}</p></div>
                      <Badge className={d.diasRestantes <= 7 ? 'bg-red-100 text-red-700' : d.diasRestantes <= 14 ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'}>{d.diasRestantes === 0 ? 'Hoje!' : d.diasRestantes < 0 ? 'Vencida' : `${d.diasRestantes} dias`}</Badge>
                    </Link>
                  ))}
                  {proximasRevacinacoes().length === 0 && <p className="text-center text-gray-500 py-8">Nenhuma revacinação nos próximos {filterPeriodoVacina} dias</p>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}