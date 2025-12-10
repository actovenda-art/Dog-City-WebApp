import React, { useState, useEffect } from "react";
import { Dog } from "@/api/entities";
import { Responsavel } from "@/api/entities";
import { ServiceProvided as ServicoPrestado } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Dog as DogIcon, Calendar, Syringe, Phone, Utensils, ClipboardList, User } from "lucide-react";
import { format, differenceInYears, differenceInMonths, addDays, isBefore, isAfter, subDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PerfilCao() {
  const [dog, setDog] = useState(null);
  const [responsaveis, setResponsaveis] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const urlParams = new URLSearchParams(window.location.search);
  const dogId = urlParams.get("id");

  useEffect(() => { if (dogId) loadData(); }, [dogId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dogsData, respData, servicosData] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 500),
        ServicoPrestado.list("-data", 500)
      ]);
      const foundDog = dogsData.find(d => d.id === dogId);
      setDog(foundDog);
      
      // Encontrar responsáveis vinculados a este cão
      const respVinculados = respData.filter(r => 
        [1,2,3,4,5,6,7,8].some(n => r[`dog_id_${n}`] === dogId)
      );
      setResponsaveis(respVinculados);
      
      // Serviços deste cão
      const servicosCao = servicosData.filter(s => s.dog_id === dogId);
      setServicos(servicosCao);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";
  
  const getIdade = (dataNasc) => {
    if (!dataNasc) return "Não informada";
    const hoje = new Date();
    const nasc = new Date(dataNasc);
    const anos = differenceInYears(hoje, nasc);
    const meses = differenceInMonths(hoje, nasc) % 12;
    if (anos > 0) return `${anos} ano${anos > 1 ? 's' : ''} ${meses > 0 ? `e ${meses} mês${meses > 1 ? 'es' : ''}` : ''}`;
    return `${meses} mês${meses > 1 ? 'es' : ''}`;
  };

  const getServiceName = (s) => ({ day_care: "Day Care", hospedagem: "Hospedagem", banho: "Banho", tosa: "Tosa", banho_tosa: "Banho e Tosa", transporte: "Transporte", adestramento: "Adestramento", adaptacao: "Adaptação" }[s] || s);
  const getServiceColor = (s) => ({ day_care: "bg-blue-100 text-blue-700", hospedagem: "bg-purple-100 text-purple-700", banho: "bg-cyan-100 text-cyan-700", tosa: "bg-pink-100 text-pink-700", banho_tosa: "bg-rose-100 text-rose-700", transporte: "bg-indigo-100 text-indigo-700", adestramento: "bg-yellow-100 text-yellow-700", adaptacao: "bg-orange-100 text-orange-700" }[s] || "bg-gray-100 text-gray-700");

  const getProximasVacinas = () => {
    if (!dog) return [];
    const hoje = new Date();
    const limite = addDays(hoje, 90);
    const result = [];
    [dog.data_revacinacao_1, dog.data_revacinacao_2, dog.data_revacinacao_3].forEach((dataRev, idx) => {
      if (dataRev) {
        const data = new Date(dataRev);
        const diasRestantes = differenceInDays(data, hoje);
        result.push({ data: dataRev, diasRestantes, numero: idx + 1, vencida: diasRestantes < 0 });
      }
    });
    return result.sort((a, b) => a.diasRestantes - b.diasRestantes);
  };

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div></div>;
  if (!dog) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Cão não encontrado</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link to={createPageUrl("RelatoriosCaes")} className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar aos Relatórios
          </Link>
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {dog.foto_url ? (
                  <img src={dog.foto_url} alt={dog.nome} className="w-32 h-32 rounded-full object-cover border-4 border-blue-100" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center text-5xl">🐕</div>
                )}
                <div className="flex-1 text-center sm:text-left">
                  <h1 className="text-3xl font-bold text-gray-900">{dog.nome}</h1>
                  {dog.apelido && <p className="text-lg text-gray-600">"{dog.apelido}"</p>}
                  <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">
                    {dog.raca && <Badge className="bg-blue-100 text-blue-700">{dog.raca}</Badge>}
                    {dog.peso && <Badge className="bg-green-100 text-green-700">{dog.peso} kg</Badge>}
                    <Badge className="bg-purple-100 text-purple-700">{getIdade(dog.data_nascimento)}</Badge>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">Total de Serviços</p>
                  <p className="text-3xl font-bold text-blue-600">{servicos.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="info">
          <TabsList className="mb-6 w-full grid grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="info" className="flex items-center gap-1"><DogIcon className="w-4 h-4" />Info</TabsTrigger>
            <TabsTrigger value="servicos" className="flex items-center gap-1"><ClipboardList className="w-4 h-4" />Serviços</TabsTrigger>
            <TabsTrigger value="vacinas" className="flex items-center gap-1"><Syringe className="w-4 h-4" />Vacinas</TabsTrigger>
            <TabsTrigger value="contatos" className="flex items-center gap-1"><Phone className="w-4 h-4" />Contatos</TabsTrigger>
            <TabsTrigger value="alimentacao" className="flex items-center gap-1"><Utensils className="w-4 h-4" />Alimentação</TabsTrigger>
          </TabsList>

          {/* Info */}
          <TabsContent value="info">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="text-lg">Dados Básicos</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600">Nome:</span><span className="font-medium">{dog.nome}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Apelido:</span><span className="font-medium">{dog.apelido || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Raça:</span><span className="font-medium">{dog.raca || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Peso:</span><span className="font-medium">{dog.peso ? `${dog.peso} kg` : "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Nascimento:</span><span className="font-medium">{formatDate(dog.data_nascimento)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Idade:</span><span className="font-medium">{getIdade(dog.data_nascimento)}</span></div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="text-lg">Pelagem</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600">Tipo:</span><span className="font-medium">{dog.pelagem || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Cores:</span><span className="font-medium">{dog.cores_pelagem || "-"}</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Serviços */}
          <TabsContent value="servicos">
            <Card className="border-gray-200 bg-white">
              <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-600" />Histórico de Serviços ({servicos.length})</CardTitle></CardHeader>
              <CardContent>
                {servicos.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">Nenhum serviço registrado</p>
                ) : (
                  <div className="space-y-3">
                    {servicos.slice(0, 20).map((s, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Badge className={getServiceColor(s.servico)}>{getServiceName(s.servico)}</Badge>
                          <span className="text-sm text-gray-600">{formatDate(s.data)}</span>
                        </div>
                        <div className="text-right">
                          {s.valor && <span className="font-medium text-green-600">R$ {s.valor.toFixed(2)}</span>}
                          <Badge className={`ml-2 ${s.status === 'concluido' ? 'bg-green-100 text-green-700' : s.status === 'cancelado' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{s.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Vacinas */}
          <TabsContent value="vacinas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="flex items-center gap-2"><Syringe className="w-5 h-5 text-purple-600" />Carteirinha de Vacinação</CardTitle></CardHeader>
                <CardContent>
                  {dog.foto_carteirinha_vacina_url ? (
                    <a href={dog.foto_carteirinha_vacina_url} target="_blank" rel="noreferrer">
                      <img src={dog.foto_carteirinha_vacina_url} alt="Carteirinha" className="w-full rounded-lg border" />
                    </a>
                  ) : (
                    <p className="text-center text-gray-500 py-8">Carteirinha não cadastrada</p>
                  )}
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Próximas Revacinações</CardTitle></CardHeader>
                <CardContent>
                  {getProximasVacinas().length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhuma revacinação cadastrada</p>
                  ) : (
                    <div className="space-y-3">
                      {getProximasVacinas().map((v, i) => (
                        <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${v.vencida ? 'bg-red-50 border-red-200' : v.diasRestantes <= 7 ? 'bg-yellow-50 border-yellow-200' : 'bg-purple-50 border-purple-200'}`}>
                          <div>
                            <p className="font-medium">{v.numero}ª Revacinação</p>
                            <p className="text-sm text-gray-600">{formatDate(v.data)}</p>
                          </div>
                          <Badge className={v.vencida ? 'bg-red-100 text-red-700' : v.diasRestantes <= 7 ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'}>
                            {v.vencida ? 'Vencida' : v.diasRestantes === 0 ? 'Hoje!' : `${v.diasRestantes} dias`}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Contatos */}
          <TabsContent value="contatos">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-green-600" />Responsáveis</CardTitle></CardHeader>
                <CardContent>
                  {responsaveis.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">Nenhum responsável vinculado</p>
                  ) : (
                    <div className="space-y-4">
                      {responsaveis.map((r, i) => (
                        <div key={i} className="p-4 bg-green-50 rounded-lg border border-green-200">
                          <p className="font-semibold text-gray-900">{r.nome_completo}</p>
                          <p className="text-sm text-gray-600">{r.celular}</p>
                          {r.celular_alternativo && <p className="text-sm text-gray-600">{r.celular_alternativo}</p>}
                          {r.email && <p className="text-sm text-gray-600">{r.email}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="flex items-center gap-2"><Phone className="w-5 h-5 text-blue-600" />Veterinário</CardTitle></CardHeader>
                <CardContent>
                  {dog.veterinario_responsavel ? (
                    <div className="space-y-3">
                      <div className="flex justify-between"><span className="text-gray-600">Veterinário:</span><span className="font-medium">{dog.veterinario_responsavel}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Telefone:</span><span className="font-medium">{dog.veterinario_telefone || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Clínica:</span><span className="font-medium">{dog.veterinario_clinica_telefone || "-"}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Horário:</span><span className="font-medium">{dog.veterinario_horario_atendimento || "-"}</span></div>
                      {dog.veterinario_endereco && <div><span className="text-gray-600">Endereço:</span><p className="font-medium mt-1">{dog.veterinario_endereco}</p></div>}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">Veterinário não cadastrado</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Alimentação */}
          <TabsContent value="alimentacao">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle className="flex items-center gap-2"><Utensils className="w-5 h-5 text-orange-600" />Ração</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-gray-600">Marca:</span><span className="font-medium">{dog.alimentacao_marca_racao || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Sabor:</span><span className="font-medium">{dog.alimentacao_sabor || "-"}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Tipo:</span><span className="font-medium">{dog.alimentacao_tipo || "-"}</span></div>
                </CardContent>
              </Card>
              <Card className="border-gray-200 bg-white">
                <CardHeader><CardTitle>Refeições</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[1,2,3,4].map(n => {
                      const qnt = dog[`refeicao_${n}_qnt`];
                      const horario = dog[`refeicao_${n}_horario`];
                      const obs = dog[`refeicao_${n}_obs`];
                      if (!qnt && !horario) return null;
                      return (
                        <div key={n} className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="font-medium">{n}ª Refeição</p>
                          <div className="text-sm text-gray-600 mt-1">
                            {qnt && <span>Quantidade: {qnt}g</span>}
                            {horario && <span className="ml-4">Horário: {horario}</span>}
                          </div>
                          {obs && <p className="text-sm text-gray-500 mt-1">{obs}</p>}
                        </div>
                      );
                    })}
                    {![1,2,3,4].some(n => dog[`refeicao_${n}_qnt`] || dog[`refeicao_${n}_horario`]) && (
                      <p className="text-center text-gray-500 py-4">Refeições não cadastradas</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}