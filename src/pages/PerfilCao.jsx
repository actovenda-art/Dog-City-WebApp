import React, { useEffect, useMemo, useState } from "react";
import { Appointment, Carteira, Dog, Orcamento, Responsavel, ServiceProvided } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ClipboardList,
  Dog as DogIcon,
  Pencil,
  Phone,
  Syringe,
  Utensils,
  Wallet,
} from "lucide-react";
import { differenceInDays, differenceInMonths, differenceInYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { CreateFileSignedUrl } from "@/api/integrations";
import {
  filterAppointmentsByApprovedOrcamentos,
  getAppointmentDateKey,
  getServiceLabel,
  shouldIncludeLinkedRecord,
} from "@/lib/attendance";
import { createPageUrl, openImageViewer } from "@/utils";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

function getLinkedDogIds(record) {
  return RELATION_SLOTS.map((slot) => record?.[`dog_id_${slot}`]).filter(Boolean);
}

function formatDateValue(value) {
  return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function getAgeLabel(dateValue) {
  if (!dateValue) return "Não informada";
  const today = new Date();
  const birthDate = new Date(dateValue);
  const years = differenceInYears(today, birthDate);
  const months = differenceInMonths(today, birthDate) % 12;

  if (years > 0) {
    return `${years} ano${years > 1 ? "s" : ""}${months > 0 ? ` e ${months} mês${months > 1 ? "es" : ""}` : ""}`;
  }

  return `${months} mês${months !== 1 ? "es" : ""}`;
}

function buildVaccineRows(dog) {
  if (!dog) return [];
  const today = new Date();

  return [
    { numero: 1, data: dog.data_revacinacao_1, nome: dog.nome_vacina_revacinacao_1 },
    { numero: 2, data: dog.data_revacinacao_2, nome: dog.nome_vacina_revacinacao_2 },
    { numero: 3, data: dog.data_revacinacao_3, nome: dog.nome_vacina_revacinacao_3 },
  ]
    .filter((item) => item.data || item.nome)
    .map((item) => {
      if (!item.data) {
        return {
          ...item,
          status: "pendente",
          badge: "Sem data",
          diasRestantes: null,
        };
      }

      const vaccineDate = new Date(item.data);
      const diasRestantes = differenceInDays(vaccineDate, today);
      return {
        ...item,
        diasRestantes,
        status: diasRestantes < 0 ? "vencida" : "em_dia",
        badge: diasRestantes < 0 ? "Vencida" : "Em dia",
      };
    })
    .sort((left, right) => {
      const leftValue = left.diasRestantes ?? Number.MAX_SAFE_INTEGER;
      const rightValue = right.diasRestantes ?? Number.MAX_SAFE_INTEGER;
      return leftValue - rightValue;
    });
}

export default function PerfilCao() {
  const [dog, setDog] = useState(null);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [faltas, setFaltas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dogPhotoUrl, setDogPhotoUrl] = useState("");
  const [vaccineCardUrl, setVaccineCardUrl] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const dogId = urlParams.get("id");

  useEffect(() => {
    if (dogId) {
      loadData();
    }
  }, [dogId]);

  const resolveMediaUrl = async (path) => {
    if (!path) return "";
    if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;

    try {
      const signed = await CreateFileSignedUrl({ path, expires: 3600 });
      return signed?.signedUrl || signed?.url || "";
    } catch (error) {
      console.error("Erro ao resolver arquivo privado:", error);
      return "";
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dogsData, responsaveisData, carteirasData, servicosData, appointmentsData, orcamentosData] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        ServiceProvided.listAll("-created_date", 1000, 5000),
        Appointment.listAll("-created_date", 1000, 5000),
        Orcamento.listAll("-created_date", 1000, 5000),
      ]);

      const foundDog = (dogsData || []).find((item) => item.id === dogId);
      setDog(foundDog || null);
      setDogPhotoUrl(await resolveMediaUrl(foundDog?.foto_url));
      setVaccineCardUrl(await resolveMediaUrl(foundDog?.foto_carteirinha_vacina_url));

      const linkedResponsaveis = (responsaveisData || []).filter((item) => getLinkedDogIds(item).includes(dogId));
      const linkedCarteiras = (carteirasData || []).filter((item) => getLinkedDogIds(item).includes(dogId));
      setResponsaveis(linkedResponsaveis);
      setCarteiras(linkedCarteiras);

      const orcamentosById = Object.fromEntries((orcamentosData || []).map((item) => [item.id, item]));
      const visibleAppointments = filterAppointmentsByApprovedOrcamentos(appointmentsData || [], orcamentosById);
      const appointmentsById = Object.fromEntries(visibleAppointments.map((item) => [item.id, item]));

      const visibleServices = (servicosData || [])
        .filter((item) => item.dog_id === dogId)
        .filter((item) => shouldIncludeLinkedRecord(item, appointmentsById, orcamentosById))
        .sort((left, right) => String(right.data_utilizacao || right.created_date || "").localeCompare(String(left.data_utilizacao || left.created_date || "")));

      const absentAppointments = visibleAppointments
        .filter((item) => item.dog_id === dogId && item.status === "faltou")
        .sort((left, right) => String(getAppointmentDateKey(right)).localeCompare(String(getAppointmentDateKey(left))));

      setServicos(visibleServices);
      setFaltas(absentAppointments);
    } catch (error) {
      console.error("Erro ao carregar ficha do cão:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const vaccineRows = useMemo(() => buildVaccineRows(dog), [dog]);

  const servicesByType = useMemo(() => {
    const grouped = {};
    servicos.forEach((item) => {
      const serviceType = item.service_type || item.servico || "outro";
      grouped[serviceType] ||= {
        serviceType,
        label: getServiceLabel(serviceType),
        total: 0,
        dates: [],
      };
      grouped[serviceType].total += 1;
      if (item.data_utilizacao) {
        grouped[serviceType].dates.push(item.data_utilizacao);
      }
    });

    return Object.values(grouped)
      .map((item) => ({
        ...item,
        dates: [...new Set(item.dates)].sort((left, right) => String(right).localeCompare(String(left))),
      }))
      .sort((left, right) => right.total - left.total);
  }, [servicos]);

  const totalUsages = servicos.length;
  const vacinasVencidas = vaccineRows.filter((item) => item.status === "vencida").length;

  const handleOpenImage = async (path, fallbackUrl, title) => {
    const imageUrl = fallbackUrl || await resolveMediaUrl(path);
    if (!imageUrl) return;
    openImageViewer(imageUrl, title);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  if (!dog) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Cão não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Link
            to={createPageUrl("RelatoriosCaes")}
            className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar aos relatórios
          </Link>

          <Card className="border-blue-200 bg-white">
            <CardContent className="p-6">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                {dogPhotoUrl ? (
                  <button type="button" onClick={() => handleOpenImage(dog?.foto_url, dogPhotoUrl, dog.nome)} className="shrink-0">
                    <img src={dogPhotoUrl} alt={dog.nome} className="h-32 w-32 rounded-full object-cover border-4 border-blue-100" />
                  </button>
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-full bg-blue-100 text-5xl">🐕</div>
                )}

                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900">{dog.nome}</h1>
                      {dog.apelido ? <p className="text-lg text-gray-600">"{dog.apelido}"</p> : null}
                      <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                        {dog.raca ? <Badge className="bg-blue-100 text-blue-700">{dog.raca}</Badge> : null}
                        <Badge className="bg-purple-100 text-purple-700">{getAgeLabel(dog.data_nascimento)}</Badge>
                        <Badge className="bg-amber-100 text-amber-700">{faltas.length} falta(s)</Badge>
                        <Badge className={vacinasVencidas > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}>
                          {vacinasVencidas > 0 ? `${vacinasVencidas} vacina(s) vencida(s)` : "Vacinas em dia"}
                        </Badge>
                      </div>
                    </div>

                    <Link to={`${createPageUrl("Cadastro")}?editDogId=${dog.id}`}>
                      <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700">
                        <Pencil className="mr-2 h-4 w-4" />
                        Atualizar cadastro
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="resumo">
          <TabsList className="mb-6 grid w-full grid-cols-2 sm:grid-cols-5">
            <TabsTrigger value="resumo" className="flex items-center gap-1"><DogIcon className="h-4 w-4" />Resumo</TabsTrigger>
            <TabsTrigger value="utilizacoes" className="flex items-center gap-1"><ClipboardList className="h-4 w-4" />Utilizações</TabsTrigger>
            <TabsTrigger value="vacinas" className="flex items-center gap-1"><Syringe className="h-4 w-4" />Vacinas</TabsTrigger>
            <TabsTrigger value="contatos" className="flex items-center gap-1"><Phone className="h-4 w-4" />Contatos</TabsTrigger>
            <TabsTrigger value="alimentacao" className="flex items-center gap-1"><Utensils className="h-4 w-4" />Alimentação</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="border-gray-200 bg-white lg:col-span-2">
                <CardHeader>
                  <CardTitle>Dados gerais</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Nascimento</span><span className="font-medium">{formatDateValue(dog.data_nascimento)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Idade</span><span className="font-medium">{getAgeLabel(dog.data_nascimento)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Raça</span><span className="font-medium">{dog.raca || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Porte</span><span className="font-medium">{dog.porte || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Peso</span><span className="font-medium">{dog.peso ? `${dog.peso} kg` : "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Pelagem</span><span className="font-medium">{dog.pelagem || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Cores</span><span className="font-medium">{dog.cores_pelagem || "-"}</span></div>
                  <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Alergias</p>
                    <p className="mt-2 text-sm text-gray-700">{dog.alergias || "Nenhuma alergia cadastrada."}</p>
                  </div>
                  <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Restrições e cuidados</p>
                    <p className="mt-2 text-sm text-gray-700">{dog.restricoes_cuidados || "Nenhuma restrição cadastrada."}</p>
                  </div>
                  <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Observações gerais</p>
                    <p className="mt-2 text-sm text-gray-700">{dog.observacoes_gerais || "Nenhuma observação cadastrada."}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Indicadores</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-blue-700">Utilizações registradas</p>
                    <p className="mt-2 text-2xl font-bold text-blue-900">{totalUsages}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-amber-700">Faltas</p>
                    <p className="mt-2 text-2xl font-bold text-amber-900">{faltas.length}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${vacinasVencidas > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
                    <p className={`text-xs uppercase tracking-wide ${vacinasVencidas > 0 ? "text-red-700" : "text-emerald-700"}`}>Status vacinal</p>
                    <p className={`mt-2 text-lg font-bold ${vacinasVencidas > 0 ? "text-red-900" : "text-emerald-900"}`}>
                      {vacinasVencidas > 0 ? "Há vacinas vencidas" : "Vacinas em dia"}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    Faltas do cão
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {faltas.length === 0 ? (
                    <p className="py-4 text-center text-gray-500">Nenhuma falta registrada.</p>
                  ) : (
                    <div className="space-y-3">
                      {faltas.map((item) => (
                        <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{getServiceLabel(item.service_type)}</p>
                              <p className="text-sm text-gray-600">{formatDateValue(getAppointmentDateKey(item))}</p>
                            </div>
                            <Badge className="bg-amber-100 text-amber-700">{item.charge_type || "Sem tipo"}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="utilizacoes">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Resumo por serviço</CardTitle>
                </CardHeader>
                <CardContent>
                  {servicesByType.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Nenhuma utilização registrada.</p>
                  ) : (
                    <div className="space-y-3">
                      {servicesByType.map((item) => (
                        <div key={item.serviceType} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-gray-900">{item.label}</p>
                              <p className="text-sm text-gray-500">{item.total} utilização(ões)</p>
                            </div>
                            <Badge variant="outline">{item.total}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.dates.length > 0 ? item.dates.map((dateValue) => (
                              <Badge key={`${item.serviceType}-${dateValue}`} className="bg-blue-100 text-blue-700">
                                {formatDateValue(dateValue)}
                              </Badge>
                            )) : (
                              <span className="text-sm text-gray-500">Sem data consolidada.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Atendimentos recentes</CardTitle>
                </CardHeader>
                <CardContent>
                  {servicos.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Nenhum atendimento registrado.</p>
                  ) : (
                    <div className="space-y-3">
                      {servicos.slice(0, 20).map((item) => (
                        <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{getServiceLabel(item.service_type || item.servico)}</p>
                              <p className="text-sm text-gray-500">{formatDateValue(item.data_utilizacao || item.data)}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-emerald-700">{formatCurrency(item.valor_cobrado || item.preco || item.valor)}</p>
                              <p className="text-xs text-gray-500">{item.charge_type || "Sem tipo de cobrança"}</p>
                            </div>
                          </div>
                          {item.observacoes ? <p className="mt-3 text-sm text-gray-600">{item.observacoes}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vacinas">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Carteirinha de vacinação</CardTitle>
                </CardHeader>
                <CardContent>
                  {vaccineCardUrl ? (
                    <button type="button" onClick={() => handleOpenImage(dog?.foto_carteirinha_vacina_url, vaccineCardUrl, "Carteirinha de vacinação")} className="block w-full text-left">
                      <img src={vaccineCardUrl} alt="Carteirinha de vacinação" className="w-full rounded-lg border" />
                    </button>
                  ) : (
                    <p className="py-8 text-center text-gray-500">Carteirinha não cadastrada.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Status vacinal</CardTitle>
                </CardHeader>
                <CardContent>
                  {vaccineRows.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Nenhuma vacina cadastrada.</p>
                  ) : (
                    <div className="space-y-3">
                      {vaccineRows.map((item) => (
                        <div
                          key={`vacina-${item.numero}`}
                          className={`rounded-lg border p-4 ${item.status === "vencida" ? "border-red-200 bg-red-50" : item.status === "em_dia" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-gray-900">{item.nome || `Vacina ${item.numero}`}</p>
                              <p className="text-sm text-gray-600">{formatDateValue(item.data)}</p>
                            </div>
                            <Badge className={item.status === "vencida" ? "bg-red-100 text-red-700" : item.status === "em_dia" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                              {item.badge}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contatos">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Responsáveis</CardTitle>
                </CardHeader>
                <CardContent>
                  {responsaveis.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Nenhum responsável vinculado.</p>
                  ) : (
                    <div className="space-y-3">
                      {responsaveis.map((item) => (
                        <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <p className="font-medium text-gray-900">{item.nome_completo}</p>
                          <p className="text-sm text-gray-600">{item.celular || "-"}</p>
                          {item.email ? <p className="text-sm text-gray-600">{item.email}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-orange-600" />
                    Responsável financeiro
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {carteiras.length === 0 ? (
                    <p className="py-8 text-center text-gray-500">Nenhum responsável financeiro vinculado.</p>
                  ) : (
                    <div className="space-y-3">
                      {carteiras.map((item) => (
                        <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <p className="font-medium text-gray-900">{item.nome_razao_social}</p>
                          <p className="text-sm text-gray-600">{item.celular || "-"}</p>
                          {item.email ? <p className="text-sm text-gray-600">{item.email}</p> : null}
                          {item.vencimento_planos ? <p className="mt-2 text-xs text-gray-500">Vencimento dos planos: dia {item.vencimento_planos}</p> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Veterinário</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Responsável</span><span className="font-medium">{dog.veterinario_responsavel || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Telefone</span><span className="font-medium">{dog.veterinario_telefone || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Clínica</span><span className="font-medium">{dog.veterinario_clinica_telefone || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Horário</span><span className="font-medium">{dog.veterinario_horario_atendimento || "-"}</span></div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Endereço</p>
                    <p className="mt-2 text-sm text-gray-700">{dog.veterinario_endereco || "Não informado."}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="alimentacao">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Rotina alimentar</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Marca</span><span className="font-medium">{dog.alimentacao_marca_racao || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Sabor</span><span className="font-medium">{dog.alimentacao_sabor || "-"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-gray-600">Tipo</span><span className="font-medium">{dog.alimentacao_tipo || "-"}</span></div>
                  <div className="space-y-3 pt-2">
                    {[1, 2, 3, 4].map((index) => {
                      const quantidade = dog[`refeicao_${index}_qnt`];
                      const horario = dog[`refeicao_${index}_horario`];
                      const observacao = dog[`refeicao_${index}_obs`];
                      if (!quantidade && !horario && !observacao) return null;

                      return (
                        <div key={`refeicao-${index}`} className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                          <p className="font-medium text-gray-900">{index}ª refeição</p>
                          <p className="mt-1 text-sm text-gray-600">Quantidade: {quantidade || "-"} g</p>
                          <p className="text-sm text-gray-600">Horário: {horario || "-"}</p>
                          {observacao ? <p className="mt-2 text-sm text-gray-600">{observacao}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-200 bg-white">
                <CardHeader>
                  <CardTitle>Medicamentos contínuos</CardTitle>
                </CardHeader>
                <CardContent>
                  {Array.isArray(dog.medicamentos_continuos) && dog.medicamentos_continuos.length > 0 ? (
                    <div className="space-y-3">
                      {dog.medicamentos_continuos.map((item, index) => (
                        <div key={`med-${index}`} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                          <p className="font-medium text-gray-900">{item?.especificacoes || `Medicamento ${index + 1}`}</p>
                          <p className="mt-1 text-sm text-gray-600">Cuidados: {item?.cuidados || "-"}</p>
                          <p className="text-sm text-gray-600">Horário: {item?.horario || "-"}</p>
                          <p className="text-sm text-gray-600">Dose: {item?.dose || "-"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-8 text-center text-gray-500">Nenhum medicamento contínuo cadastrado.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
