import React, { useEffect, useMemo, useState } from "react";
import { TabelaPrecos, User } from "@/api/entities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bath, Home, Pencil, Percent, Plus, Save, Scissors, Settings, Tags, Trash2, Truck } from "lucide-react";

const SERVICE_TYPES = [
  { id: "hospedagem", label: "Hospedagem (Não mensalista)", category: "hospitalidade" },
  { id: "hospedagem_mensalista", label: "Hospedagem (Mensalista)", category: "hospitalidade" },
  { id: "day_care_avulso_sem_pacote", label: "Day Care Avulso (Sem pacote ativo)", category: "hospitalidade" },
  { id: "day_care_avulso_com_pacote", label: "Day Care Avulso (Com pacote ativo)", category: "hospitalidade" },
  { id: "adaptacao", label: "Adaptação", category: "hospitalidade" },
  { id: "pernoite", label: "Pernoite (Day Care de hospedagem)", category: "hospitalidade" },
  { id: "banho", label: "Banho", category: "banho" },
  { id: "tosa_higienica", label: "Tosa Higienica", category: "tosa" },
  { id: "tosa_geral", label: "Tosa Geral", category: "tosa" },
  { id: "tosa_detalhada", label: "Tosa Detalhada", category: "tosa" },
  { id: "transporte_km", label: "Transporte (por km)", category: "transporte" },
];

const FIXED_CONFIG_TYPES = new Set([
  "hospedagem",
  "hospedagem_mensalista",
  "day_care_avulso_sem_pacote",
  "day_care_avulso_com_pacote",
  "adaptacao",
  "pernoite",
  "transporte_km",
]);

const DEFAULT_RACES = [
  "Poodle",
  "Shih Tzu",
  "Yorkshire",
  "Maltes",
  "Golden Retriever",
  "Labrador",
  "Border Collie",
  "Bulldog Frances",
  "Bulldog Ingles",
  "Pug",
  "Spitz Alemao",
  "Lulu da Pomerania",
  "Chow Chow",
  "Husky Siberiano",
  "Pastor Alemao",
  "Rottweiler",
  "Beagle",
  "Dachshund",
  "Schnauzer",
  "Cocker Spaniel",
  "SRD",
  "Outro",
];

const BREED_CATALOG_TYPE = "catalogo_raca";

const DEFAULT_DISCOUNTS = [
  {
    id: "desconto_canil",
    label: "Dormitorio compartilhado",
    description: "Desconto aplicado ao cão que divide dormitório.",
    percent: 30,
  },
  {
    id: "desconto_longa_estadia",
    label: "Longa estadia (+15 dias)",
    description: "Desconto adicional para permanencias longas.",
    percent: 3,
  },
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeLookupValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildBreedCatalogKey(value) {
  const normalized = normalizeLookupValue(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `catalogo_raca:${normalized || "sem_nome"}`;
}

function getTypeLabel(type) {
  return SERVICE_TYPES.find((item) => item.id === type)?.label || type || "-";
}

function getCategoryRows(rows, category) {
  return rows.filter((row) => {
    if (category === "hospitalidade") {
      return SERVICE_TYPES.some((item) => item.category === "hospitalidade" && item.id === row.tipo);
    }
    return SERVICE_TYPES.some((item) => item.category === category && item.id === row.tipo);
  });
}

export default function ConfiguracoesPrecos() {
  const [prices, setPrices] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBreedModal, setShowBreedModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingBreed, setEditingBreed] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hospitalidade");
  const [formData, setFormData] = useState({
    tipo: "",
    raca: "",
    valor: "",
    descricao: "",
    ativo: true,
  });
  const [breedFormData, setBreedFormData] = useState({
    raca: "",
  });

  const empresaId = currentUser?.empresa_id || null;

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [rows, me] = await Promise.all([
        TabelaPrecos.list("-created_date", 1000),
        User.me(),
      ]);

      setCurrentUser(me || null);
      setPrices(
        (rows || []).filter((item) => item.ativo !== false && (!item.empresa_id || item.empresa_id === me?.empresa_id))
      );
    } catch (error) {
      console.error("Erro ao carregar configurações de preços:", error);
    }
    setIsLoading(false);
  }

  function resetForm() {
    setFormData({
      tipo: "",
      raca: "",
      valor: "",
      descricao: "",
      ativo: true,
    });
    setEditingItem(null);
  }

  function resetBreedForm() {
    setBreedFormData({
      raca: "",
    });
    setEditingBreed(null);
  }

  function openEditModal(item) {
    setEditingItem(item);
    setFormData({
      tipo: item.tipo || "",
      raca: item.raca || "",
      valor: item.valor?.toString() || "",
      descricao: item.descricao || "",
      ativo: item.ativo !== false,
    });
    setShowModal(true);
  }

  function openBreedModal(item = null) {
    setEditingBreed(item);
    setBreedFormData({
      raca: item?.raca || "",
    });
    setShowBreedModal(true);
  }

  async function handleSave() {
    if (!formData.tipo || !formData.valor) {
      alert("Preencha tipo e valor.");
      return;
    }

    setIsSaving(true);
    try {
      const priceValue = Number.parseFloat(String(formData.valor).replace(",", "."));
      const payload = {
        tipo: formData.tipo,
        raca: formData.raca || null,
        valor: Number.isFinite(priceValue) ? priceValue : 0,
        descricao: formData.descricao || null,
        ativo: formData.ativo,
        empresa_id: empresaId,
        config_key: FIXED_CONFIG_TYPES.has(formData.tipo) ? formData.tipo : null,
      };

      if (editingItem) {
        await TabelaPrecos.update(editingItem.id, payload);
      } else {
        await TabelaPrecos.create(payload);
      }

      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar preco:", error);
      alert("Erro ao salvar preco.");
    }
    setIsSaving(false);
  }

  async function handleSaveBreed() {
    const breedName = String(breedFormData.raca || "").trim();
    if (!breedName) {
      alert("Preencha o nome da raca.");
      return;
    }

    const normalizedBreedName = normalizeLookupValue(breedName);
    const duplicatedDefault = DEFAULT_RACES.some(
      (item) => normalizeLookupValue(item) === normalizedBreedName
    );
    const duplicatedCustom = prices.some(
      (item) =>
        item.tipo === BREED_CATALOG_TYPE
        && item.id !== editingBreed?.id
        && normalizeLookupValue(item.raca) === normalizedBreedName
    );

    if (duplicatedDefault || duplicatedCustom) {
      alert("Essa raca ja esta disponivel na lista.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        tipo: BREED_CATALOG_TYPE,
        raca: breedName,
        valor: 0,
        descricao: "Raca adicional disponivel para precificacao.",
        ativo: true,
        empresa_id: empresaId,
        config_key: buildBreedCatalogKey(breedName),
      };

      if (editingBreed) {
        await TabelaPrecos.update(editingBreed.id, payload);
      } else {
        await TabelaPrecos.create(payload);
      }

      await loadData();
      setShowBreedModal(false);
      resetBreedForm();
    } catch (error) {
      console.error("Erro ao salvar raca:", error);
      alert("Erro ao salvar raca.");
    }
    setIsSaving(false);
  }

  async function handleDelete(id) {
    if (!confirm("Excluir este preco?")) return;
    await TabelaPrecos.delete(id);
    await loadData();
  }

  async function handleDeleteBreed(id) {
    if (!confirm("Excluir esta raca adicional?")) return;
    await TabelaPrecos.delete(id);
    await loadData();
  }

  async function toggleActive(item) {
    await TabelaPrecos.update(item.id, { ativo: !item.ativo });
    await loadData();
  }

  const rowsByCategory = useMemo(
    () => ({
      hospitalidade: getCategoryRows(prices, "hospitalidade"),
      banho: getCategoryRows(prices, "banho"),
      tosa: getCategoryRows(prices, "tosa"),
      transporte: getCategoryRows(prices, "transporte"),
      descontos: prices.filter((item) => item.tipo === "desconto" || item.config_key?.startsWith("desconto_")),
      racas: prices
        .filter((item) => item.tipo === BREED_CATALOG_TYPE)
        .sort((left, right) => String(left.raca || "").localeCompare(String(right.raca || ""), "pt-BR")),
    }),
    [prices]
  );

  const breedOptions = useMemo(() => {
    const catalogBreeds = rowsByCategory.racas.map((item) => item.raca).filter(Boolean);
    const uniqueBreeds = [];
    const seen = new Set();

    [...DEFAULT_RACES, ...catalogBreeds].forEach((item) => {
      const key = normalizeLookupValue(item);
      if (!key || seen.has(key)) return;
      seen.add(key);
      uniqueBreeds.push(item);
    });

    return uniqueBreeds;
  }, [rowsByCategory.racas]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  const renderRow = (item, colorClass, valueClass) => (
    <div
      key={item.id}
      className={`flex items-center justify-between rounded-xl border p-4 ${
        item.ativo !== false ? colorClass : "border-gray-200 bg-gray-100 opacity-60"
      }`}
    >
      <div className="flex items-center gap-4">
        <Switch checked={item.ativo !== false} onCheckedChange={() => toggleActive(item)} />
        <div>
          <p className="font-medium text-gray-900">{item.raca || getTypeLabel(item.tipo)}</p>
          {(item.descricao || FIXED_CONFIG_TYPES.has(item.tipo)) && (
            <p className="text-sm text-gray-500">
              {item.descricao || getTypeLabel(item.tipo)}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-lg font-bold ${valueClass}`}>{formatCurrency(item.valor)}</span>
        <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Configurações de Preços</h1>
              <p className="text-sm text-gray-600">Gerencie Day Care, hospedagem, banho, tosa, transporte e descontos.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Preços e descontos</h1>
              <p className="text-sm text-gray-600">Gerencie Day Care, hospedagem, banho, tosa, transporte, descontos e o catálogo de raças.</p>
            </div>
          </div>
          <Button
            onClick={() => {
              if (activeTab === "racas") {
                resetBreedForm();
                setShowBreedModal(true);
                return;
              }
              resetForm();
              setShowModal(true);
            }}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            {activeTab === "racas" ? "Nova raça" : "Novo preço"}
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <Home className="mx-auto mb-2 h-8 w-8 text-blue-600" />
              <p className="text-2xl font-bold text-blue-600">{rowsByCategory.hospitalidade.length}</p>
              <p className="text-sm text-gray-600">Hospitalidade e Day Care</p>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 bg-white">
            <CardContent className="p-4 text-center">
              <Bath className="mx-auto mb-2 h-8 w-8 text-cyan-600" />
              <p className="text-2xl font-bold text-cyan-600">{rowsByCategory.banho.length}</p>
              <p className="text-sm text-gray-600">Banho</p>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-4 text-center">
              <Scissors className="mx-auto mb-2 h-8 w-8 text-purple-600" />
              <p className="text-2xl font-bold text-purple-600">{rowsByCategory.tosa.length}</p>
              <p className="text-sm text-gray-600">Tosa</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardContent className="p-4 text-center">
              <Truck className="mx-auto mb-2 h-8 w-8 text-amber-600" />
              <p className="text-2xl font-bold text-amber-600">{rowsByCategory.transporte.length}</p>
              <p className="text-sm text-gray-600">Transporte</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full grid-cols-6">
            <TabsTrigger value="hospitalidade">Hospedagem e Day Care</TabsTrigger>
            <TabsTrigger value="banho">Banho</TabsTrigger>
            <TabsTrigger value="tosa">Tosa</TabsTrigger>
            <TabsTrigger value="transporte">Transporte</TabsTrigger>
            <TabsTrigger value="descontos">Descontos</TabsTrigger>
            <TabsTrigger value="racas">Raças</TabsTrigger>
          </TabsList>

          <TabsContent value="hospitalidade">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-blue-600" />
                  Preços de hospedagem, Day Care e pernoite
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rowsByCategory.hospitalidade.length === 0 ? (
                  <p className="py-8 text-center text-gray-500">Nenhum preco cadastrado.</p>
                ) : (
                  rowsByCategory.hospitalidade.map((item) =>
                    renderRow(item, "border-blue-200 bg-blue-50", "text-blue-600")
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banho">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bath className="h-5 w-5 text-cyan-600" />
                  Preços de banho por raça
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rowsByCategory.banho.length === 0 ? (
                  <p className="py-8 text-center text-gray-500 sm:col-span-2 lg:col-span-3">Nenhum preco cadastrado.</p>
                ) : (
                  rowsByCategory.banho.map((item) =>
                    renderRow(item, "border-cyan-200 bg-cyan-50", "text-cyan-600")
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tosa">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scissors className="h-5 w-5 text-purple-600" />
                  Preços de tosa
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rowsByCategory.tosa.length === 0 ? (
                  <p className="py-8 text-center text-gray-500 sm:col-span-2 lg:col-span-3">Nenhum preco cadastrado.</p>
                ) : (
                  rowsByCategory.tosa.map((item) =>
                    renderRow(item, "border-purple-200 bg-purple-50", "text-purple-600")
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transporte">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-amber-600" />
                  Preços de transporte
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rowsByCategory.transporte.length === 0 ? (
                  <p className="py-8 text-center text-gray-500">Nenhum preco cadastrado.</p>
                ) : (
                  rowsByCategory.transporte.map((item) =>
                    renderRow(item, "border-amber-200 bg-amber-50", "text-amber-600")
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="descontos">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-green-600" />
                  Descontos operacionais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {DEFAULT_DISCOUNTS.map((discount) => {
                  const dbRow = rowsByCategory.descontos.find(
                    (item) => item.config_key === discount.id || item.config_key === discount.id.replace("desconto_", "")
                  );
                  const value = dbRow?.valor ?? discount.percent;
                  return (
                    <div key={discount.id} className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
                      <div>
                        <p className="font-medium text-gray-900">{discount.label}</p>
                        <p className="text-sm text-gray-500">{discount.description}</p>
                      </div>
                      <Badge className="bg-green-100 text-green-700">{value}%</Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="racas">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tags className="h-5 w-5 text-indigo-600" />
                  Catálogo de raças
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="text-sm font-medium text-indigo-900">Raças extras para precificação</p>
                  <p className="mt-1 text-sm text-indigo-700">
                    As raças padrão do sistema continuam disponíveis. Aqui você adiciona, edita ou exclui raças extras
                    para usar nos preços de banho e tosa.
                  </p>
                </div>

                {rowsByCategory.racas.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                    Nenhuma raça extra cadastrada.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rowsByCategory.racas.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{item.raca || "Sem nome"}</p>
                          <p className="mt-1 text-xs text-gray-500">Disponível no seletor de preços</p>
                        </div>
                        <div className="ml-3 flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openBreedModal(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteBreed(item.id)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar preco" : "Novo preco"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label>Tipo de serviço *</Label>
              <Select value={formData.tipo} onValueChange={(value) => setFormData((prev) => ({ ...prev, tipo: value, raca: "" }))}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(formData.tipo?.includes("banho") || formData.tipo?.includes("tosa")) && (
              <div>
                <Label>Raça</Label>
                <Select value={formData.raca || "all"} onValueChange={(value) => setFormData((prev) => ({ ...prev, raca: value === "all" ? "" : value }))}>
                  <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Padrão (todas as raças)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Padrão (todas as raças)</SelectItem>
                    {breedOptions.map((race) => (
                      <SelectItem key={race} value={race}>
                        {race}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Valor *</Label>
              <Input
                className="mt-2"
                type="number"
                step="0.01"
                value={formData.valor}
                onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))}
                placeholder="0,00"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Input
                className="mt-2"
                value={formData.descricao}
                onChange={(event) => setFormData((prev) => ({ ...prev, descricao: event.target.value }))}
                placeholder="Opcional"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="font-medium text-gray-900">Preco ativo</p>
                <p className="text-sm text-gray-500">Se desligado, o valor não entra no cálculo.</p>
              </div>
              <Switch
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, ativo: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showBreedModal}
        onOpenChange={(open) => {
          setShowBreedModal(open);
          if (!open) resetBreedForm();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBreed ? "Editar raça" : "Nova raça"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label>Nome da raça *</Label>
              <Input
                className="mt-2"
                value={breedFormData.raca}
                onChange={(event) => setBreedFormData({ raca: event.target.value })}
                placeholder="Ex: Basset Hound"
              />
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm text-gray-600">
                A raça ficará disponível no seletor de preços de banho e tosa desta unidade.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBreedModal(false);
                resetBreedForm();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveBreed} disabled={isSaving} className="bg-blue-600 text-white hover:bg-blue-700">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvando..." : "Salvar raça"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
