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
import { Bath, Home, Pencil, Percent, Plus, Save, Scissors, Settings, Trash2, Truck } from "lucide-react";

const SERVICE_TYPES = [
  { id: "hospedagem", label: "Hospedagem (Nao mensalista)", category: "hospitalidade" },
  { id: "hospedagem_mensalista", label: "Hospedagem (Mensalista)", category: "hospitalidade" },
  { id: "day_care_avulso_sem_pacote", label: "Day Care Avulso (Sem pacote ativo)", category: "hospitalidade" },
  { id: "day_care_avulso_com_pacote", label: "Day Care Avulso (Com pacote ativo)", category: "hospitalidade" },
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
  "pernoite",
  "transporte_km",
]);

const RACES = [
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

const DEFAULT_DISCOUNTS = [
  {
    id: "desconto_canil",
    label: "Dormitorio compartilhado",
    description: "Desconto aplicado ao cao que divide dormitorio.",
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
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hospitalidade");
  const [formData, setFormData] = useState({
    tipo: "",
    raca: "",
    valor: "",
    descricao: "",
    ativo: true,
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
      console.error("Erro ao carregar configuracoes de precos:", error);
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

  async function handleDelete(id) {
    if (!confirm("Excluir este preco?")) return;
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
    }),
    [prices]
  );

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
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Configuracoes de Precos</h1>
              <p className="text-sm text-gray-600">Gerencie Day Care, hospedagem, banho, tosa, transporte e descontos.</p>
            </div>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo preco
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
          <TabsList className="mb-6 grid w-full grid-cols-5">
            <TabsTrigger value="hospitalidade">Hospedagem e Day Care</TabsTrigger>
            <TabsTrigger value="banho">Banho</TabsTrigger>
            <TabsTrigger value="tosa">Tosa</TabsTrigger>
            <TabsTrigger value="transporte">Transporte</TabsTrigger>
            <TabsTrigger value="descontos">Descontos</TabsTrigger>
          </TabsList>

          <TabsContent value="hospitalidade">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="h-5 w-5 text-blue-600" />
                  Precos de hospedagem, Day Care e pernoite
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
                  Precos de banho por raca
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
                  Precos de tosa
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
                  Precos de transporte
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
        </Tabs>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar preco" : "Novo preco"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div>
              <Label>Tipo de servico *</Label>
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
                <Label>Raca</Label>
                <Select value={formData.raca || "all"} onValueChange={(value) => setFormData((prev) => ({ ...prev, raca: value === "all" ? "" : value }))}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Padrao (todas as racas)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Padrao (todas as racas)</SelectItem>
                    {RACES.map((race) => (
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
              <Label>Descricao</Label>
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
                <p className="text-sm text-gray-500">Se desligado, o valor nao entra no calculo.</p>
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
    </div>
  );
}
