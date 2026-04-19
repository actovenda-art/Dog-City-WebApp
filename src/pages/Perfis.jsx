import React, { useEffect, useMemo, useState } from "react";
import { Carteira, Dog, Responsavel } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import SearchFiltersToolbar from "@/components/common/SearchFiltersToolbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dog as DogIcon,
  ExternalLink,
  FileText,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

function getLinkedDogIds(record) {
  return RELATION_SLOTS.map((slot) => record?.[`dog_id_${slot}`]).filter(Boolean);
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesSearch(values, term) {
  const normalizedTerm = normalizeSearchValue(term);
  if (!normalizedTerm) return true;

  return values.some((value) => normalizeSearchValue(value).includes(normalizedTerm));
}

function buildDogMap(dogs) {
  return Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
}

function getDogDisplayNames(dogIds, dogMap) {
  return dogIds
    .map((dogId) => dogMap[dogId])
    .filter(Boolean)
    .map((dog) => dog.nome);
}

function ProfileCountCard({ title, value, icon: Icon, colorClass, borderClass }) {
  return (
    <Card className={`bg-white ${borderClass}`}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
        </div>
        <Icon className={`h-10 w-10 ${colorClass} opacity-60`} />
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }) {
  return (
    <Card className="border-dashed border-gray-200 bg-white">
      <CardContent className="py-12 text-center">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function Perfis() {
  const [dogs, setDogs] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("caes");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dogsData, responsaveisData, carteirasData] = await Promise.all([
        Dog.list("-created_date", 1000),
        Responsavel.list("-created_date", 1000),
        Carteira.list("-created_date", 1000),
      ]);

      setDogs(dogsData || []);
      setResponsaveis(responsaveisData || []);
      setCarteiras(carteirasData || []);
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const dogMap = useMemo(() => buildDogMap(dogs), [dogs]);

  const dogResponsaveisMap = useMemo(() => {
    const nextMap = {};

    responsaveis.forEach((responsavel) => {
      getLinkedDogIds(responsavel).forEach((dogId) => {
        nextMap[dogId] ||= [];
        nextMap[dogId].push(responsavel);
      });
    });

    return nextMap;
  }, [responsaveis]);

  const dogCarteirasMap = useMemo(() => {
    const nextMap = {};

    carteiras.forEach((carteira) => {
      getLinkedDogIds(carteira).forEach((dogId) => {
        nextMap[dogId] ||= [];
        nextMap[dogId].push(carteira);
      });
    });

    return nextMap;
  }, [carteiras]);

  const dogsView = useMemo(() => (
    dogs.map((dog) => ({
      ...dog,
      linkedResponsaveis: dogResponsaveisMap[dog.id] || [],
      linkedCarteiras: dogCarteirasMap[dog.id] || [],
    }))
  ), [dogs, dogResponsaveisMap, dogCarteirasMap]);

  const responsaveisView = useMemo(() => (
    responsaveis.map((responsavel) => {
      const linkedDogIds = getLinkedDogIds(responsavel);
      return {
        ...responsavel,
        linkedDogIds,
        linkedDogNames: getDogDisplayNames(linkedDogIds, dogMap),
      };
    })
  ), [responsaveis, dogMap]);

  const carteirasView = useMemo(() => (
    carteiras.map((carteira) => {
      const linkedDogIds = getLinkedDogIds(carteira);
      return {
        ...carteira,
        linkedDogIds,
        linkedDogNames: getDogDisplayNames(linkedDogIds, dogMap),
      };
    })
  ), [carteiras, dogMap]);

  const filteredDogs = useMemo(() => (
    dogsView.filter((dog) => matchesSearch([
      dog.nome,
      dog.apelido,
      dog.raca,
      dog.porte,
      dog.cores_pelagem,
      ...dog.linkedResponsaveis.map((item) => item.nome_completo),
      ...dog.linkedCarteiras.map((item) => item.nome_razao_social),
    ], searchTerm))
  ), [dogsView, searchTerm]);

  const filteredResponsaveis = useMemo(() => (
    responsaveisView.filter((responsavel) => matchesSearch([
      responsavel.nome_completo,
      responsavel.cpf,
      responsavel.celular,
      responsavel.celular_alternativo,
      responsavel.email,
      ...responsavel.linkedDogNames,
    ], searchTerm))
  ), [responsaveisView, searchTerm]);

  const filteredCarteiras = useMemo(() => (
    carteirasView.filter((carteira) => matchesSearch([
      carteira.nome_razao_social,
      carteira.cpf_cnpj,
      carteira.celular,
      carteira.email,
      carteira.vencimento_planos,
      ...carteira.linkedDogNames,
    ], searchTerm))
  ), [carteirasView, searchTerm]);

  const totalProfiles = dogs.length + responsaveis.length + carteiras.length;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-2xl bg-blue-100 p-3 text-blue-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Perfis</h1>
              <p className="mt-1 text-sm text-gray-600">
                Visualização consolidada de cães, responsáveis e responsáveis financeiros da unidade em acesso.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link to={createPageUrl("Cadastro")}>
              <Button variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50">
                <FileText className="mr-2 h-4 w-4" />
                Ir para Cadastro
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <ProfileCountCard title="Total de Perfis" value={totalProfiles} icon={Users} colorClass="text-blue-600" borderClass="border-blue-200" />
          <ProfileCountCard title="Cães" value={dogs.length} icon={DogIcon} colorClass="text-emerald-600" borderClass="border-emerald-200" />
          <ProfileCountCard title="Responsáveis" value={responsaveis.length} icon={ShieldCheck} colorClass="text-violet-600" borderClass="border-violet-200" />
          <ProfileCountCard title="Resp. Financeiros" value={carteiras.length} icon={Wallet} colorClass="text-orange-600" borderClass="border-orange-200" />
        </div>

        <Card className="border-gray-200 bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-gray-900">Consultar Perfis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SearchFiltersToolbar
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nome, contato, raça, CPF/CNPJ ou vínculos..."
              hasActiveFilters={Boolean(searchTerm)}
              onClear={() => setSearchTerm("")}
            />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-gray-100 p-1">
                <TabsTrigger value="caes" className="rounded-xl">Cães</TabsTrigger>
                <TabsTrigger value="responsaveis" className="rounded-xl">Responsáveis</TabsTrigger>
                <TabsTrigger value="financeiros" className="rounded-xl">Resp. Financeiros</TabsTrigger>
              </TabsList>

              <TabsContent value="caes" className="space-y-4">
                {filteredDogs.length === 0 ? (
                  <EmptyState
                    title="Nenhum cão encontrado"
                    description="Ajuste a busca para localizar um perfil canino desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredDogs.map((dog) => (
                      <Card key={dog.id} className="border-emerald-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-lg font-bold text-emerald-700">
                                  {String(dog.nome || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="truncate text-lg font-semibold text-gray-900">{dog.nome || "Sem nome"}</h3>
                                  <p className="truncate text-sm text-gray-500">
                                    {dog.apelido ? `Apelido: ${dog.apelido}` : "Sem apelido cadastrado"}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {dog.raca ? <Badge className="bg-emerald-100 text-emerald-700">{dog.raca}</Badge> : null}
                                {dog.porte ? <Badge className="bg-blue-100 text-blue-700">{dog.porte}</Badge> : null}
                                <Badge className="bg-violet-100 text-violet-700">
                                  {dog.linkedResponsaveis.length} responsável(is)
                                </Badge>
                                <Badge className="bg-orange-100 text-orange-700">
                                  {dog.linkedCarteiras.length} financeiro(s)
                                </Badge>
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Link to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(dog.id)}`}>
                                <Button variant="outline" size="sm">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ficha
                                </Button>
                              </Link>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Responsáveis</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {dog.linkedResponsaveis.length > 0 ? dog.linkedResponsaveis.map((responsavel) => (
                                  <Badge key={responsavel.id} className="bg-violet-50 text-violet-700 border border-violet-200">
                                    {responsavel.nome_completo}
                                  </Badge>
                                )) : (
                                  <Badge className="bg-gray-100 text-gray-600">Sem responsável vinculado</Badge>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Responsáveis Financeiros</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {dog.linkedCarteiras.length > 0 ? dog.linkedCarteiras.map((carteira) => (
                                  <Badge key={carteira.id} className="bg-orange-50 text-orange-700 border border-orange-200">
                                    {carteira.nome_razao_social}
                                  </Badge>
                                )) : (
                                  <Badge className="bg-gray-100 text-gray-600">Sem financeiro vinculado</Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="responsaveis" className="space-y-4">
                {filteredResponsaveis.length === 0 ? (
                  <EmptyState
                    title="Nenhum responsável encontrado"
                    description="Ajuste a busca para localizar um responsável desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredResponsaveis.map((responsavel) => (
                      <Card key={responsavel.id} className="border-violet-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-gray-900">{responsavel.nome_completo || "Sem nome"}</h3>
                              <div className="mt-2 space-y-1 text-sm text-gray-600">
                                <p>{responsavel.cpf || "CPF não informado"}</p>
                                <p>{responsavel.celular || responsavel.celular_alternativo || "Celular não informado"}</p>
                                <p className="truncate">{responsavel.email || "Email não informado"}</p>
                              </div>
                            </div>

                            <Badge className="bg-violet-100 text-violet-700">
                              {responsavel.linkedDogIds.length} cão(ães)
                            </Badge>
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Cães vinculados</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {responsavel.linkedDogIds.length > 0 ? responsavel.linkedDogIds.map((dogId) => (
                                <Link key={dogId} to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(dogId)}`}>
                                  <Badge className="cursor-pointer border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100">
                                    {dogMap[dogId]?.nome || dogId}
                                  </Badge>
                                </Link>
                              )) : (
                                <Badge className="bg-gray-100 text-gray-600">Sem cães vinculados</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="financeiros" className="space-y-4">
                {filteredCarteiras.length === 0 ? (
                  <EmptyState
                    title="Nenhum responsável financeiro encontrado"
                    description="Ajuste a busca para localizar um perfil financeiro desta unidade."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {filteredCarteiras.map((carteira) => (
                      <Card key={carteira.id} className="border-orange-100 bg-white">
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <h3 className="truncate text-lg font-semibold text-gray-900">{carteira.nome_razao_social || "Sem nome"}</h3>
                              <div className="mt-2 space-y-1 text-sm text-gray-600">
                                <p>{carteira.cpf_cnpj || "CPF/CNPJ não informado"}</p>
                                <p>{carteira.celular || "Celular não informado"}</p>
                                <p className="truncate">{carteira.email || "Email não informado"}</p>
                              </div>
                            </div>

                            {carteira.vencimento_planos ? (
                              <Badge className="bg-orange-100 text-orange-700">
                                Dia {carteira.vencimento_planos}
                              </Badge>
                            ) : null}
                          </div>

                          <div className="mt-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Cães vinculados</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {carteira.linkedDogIds.length > 0 ? carteira.linkedDogIds.map((dogId) => (
                                <Link key={dogId} to={`${createPageUrl("PerfilCao")}?id=${encodeURIComponent(dogId)}`}>
                                  <Badge className="cursor-pointer border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100">
                                    {dogMap[dogId]?.nome || dogId}
                                  </Badge>
                                </Link>
                              )) : (
                                <Badge className="bg-gray-100 text-gray-600">Sem cães vinculados</Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
