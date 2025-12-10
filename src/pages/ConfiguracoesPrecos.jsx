import React, { useState, useEffect } from "react";
import { TabelaPrecos } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Settings, Home, Scissors, Truck, Moon, Percent, Save, Pencil, Trash2, Bath
} from "lucide-react";

const TIPOS_SERVICO = [
  { id: "hospedagem", label: "Hospedagem (Não Mensalista)", icon: "🏨" },
  { id: "hospedagem_mensalista", label: "Hospedagem (Mensalista)", icon: "🏨" },
  { id: "pernoite", label: "Pernoite (Day Care)", icon: "🌙" },
  { id: "banho", label: "Banho", icon: "🛁" },
  { id: "tosa_higienica", label: "Tosa Higiênica", icon: "✂️" },
  { id: "tosa_geral", label: "Tosa Geral", icon: "✂️" },
  { id: "tosa_detalhada", label: "Tosa Detalhada", icon: "✂️" },
  { id: "transporte_km", label: "Transporte (por km)", icon: "🚐" },
];

const RACAS = [
  "Poodle", "Shih Tzu", "Yorkshire", "Maltês", "Golden Retriever", "Labrador",
  "Border Collie", "Bulldog Francês", "Bulldog Inglês", "Pug", "Spitz Alemão",
  "Lulu da Pomerânia", "Chow Chow", "Husky Siberiano", "Pastor Alemão", "Rottweiler",
  "Beagle", "Dachshund", "Schnauzer", "Cocker Spaniel", "SRD", "Outro"
];

const DESCONTOS_PADRAO = [
  { id: "dormitorio_compartilhado", label: "Dormitório Compartilhado", descricao: "Desconto para cães adicionais no mesmo dormitório", percentual: 30 },
  { id: "longa_estadia", label: "Longa Estadia (+15 dias)", descricao: "Desconto para estadias acima de 15 diárias", percentual: 3 },
];

export default function ConfiguracoesPrecos() {
  const [precos, setPrecos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("hospedagem");

  const [formData, setFormData] = useState({
    tipo: "", raca: "", valor: "", descricao: "", ativo: true
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await TabelaPrecos.list("-created_date", 500);
      setPrecos(data);
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const resetForm = () => {
    setFormData({ tipo: "", raca: "", valor: "", descricao: "", ativo: true });
    setEditingItem(null);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      tipo: item.tipo || "",
      raca: item.raca || "",
      valor: item.valor?.toString() || "",
      descricao: item.descricao || "",
      ativo: item.ativo !== false
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.tipo || !formData.valor) {
      alert("Preencha: Tipo e Valor"); return;
    }
    setIsSaving(true);
    try {
      const dataToSave = {
        ...formData,
        valor: parseFloat(formData.valor.replace(",", ".")) || 0
      };
      if (editingItem) await TabelaPrecos.update(editingItem.id, dataToSave);
      else await TabelaPrecos.create(dataToSave);
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { alert("Erro ao salvar."); }
    setIsSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Excluir este preço?")) return;
    await TabelaPrecos.delete(id);
    await loadData();
  };

  const toggleAtivo = async (item) => {
    await TabelaPrecos.update(item.id, { ativo: !item.ativo });
    await loadData();
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const getPrecosByTipo = (tipoPrefix) => {
    return precos.filter(p => p.tipo?.startsWith(tipoPrefix));
  };

  const getTipoLabel = (tipo) => {
    const found = TIPOS_SERVICO.find(t => t.id === tipo);
    return found ? found.label : tipo;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Configurações de Preços</h1>
              <p className="text-sm text-gray-600">Gerencie preços e descontos dos serviços</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />Novo Preço
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 text-center">
              <Home className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-blue-600">{getPrecosByTipo("hospedagem").length}</p>
              <p className="text-sm text-gray-600">Hospedagem</p>
            </CardContent>
          </Card>
          <Card className="border-cyan-200 bg-white">
            <CardContent className="p-4 text-center">
              <Bath className="w-8 h-8 text-cyan-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-cyan-600">{getPrecosByTipo("banho").length}</p>
              <p className="text-sm text-gray-600">Banho</p>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-white">
            <CardContent className="p-4 text-center">
              <Scissors className="w-8 h-8 text-purple-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-purple-600">{getPrecosByTipo("tosa").length}</p>
              <p className="text-sm text-gray-600">Tosa</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-white">
            <CardContent className="p-4 text-center">
              <Truck className="w-8 h-8 text-amber-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-amber-600">{getPrecosByTipo("transporte").length}</p>
              <p className="text-sm text-gray-600">Transporte</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full mb-6">
            <TabsTrigger value="hospedagem">🏨 Hospedagem</TabsTrigger>
            <TabsTrigger value="banho">🛁 Banho</TabsTrigger>
            <TabsTrigger value="tosa">✂️ Tosa</TabsTrigger>
            <TabsTrigger value="transporte">🚐 Transporte</TabsTrigger>
            <TabsTrigger value="descontos">💰 Descontos</TabsTrigger>
          </TabsList>

          {/* Tab Hospedagem */}
          <TabsContent value="hospedagem">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="w-5 h-5 text-blue-600" />
                  Preços de Hospedagem
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getPrecosByTipo("hospedagem").concat(getPrecosByTipo("pernoite")).map(preco => (
                    <div key={preco.id} className={`flex items-center justify-between p-4 rounded-lg ${preco.ativo ? 'bg-blue-50' : 'bg-gray-100 opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <Switch checked={preco.ativo} onCheckedChange={() => toggleAtivo(preco)} />
                        <div>
                          <p className="font-medium text-gray-900">{getTipoLabel(preco.tipo)}</p>
                          {preco.descricao && <p className="text-sm text-gray-500">{preco.descricao}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xl font-bold text-blue-600">{formatCurrency(preco.valor)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(preco)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(preco.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {getPrecosByTipo("hospedagem").concat(getPrecosByTipo("pernoite")).length === 0 && (
                    <p className="text-center text-gray-500 py-8">Nenhum preço de hospedagem cadastrado</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Banho */}
          <TabsContent value="banho">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bath className="w-5 h-5 text-cyan-600" />
                  Preços de Banho por Raça
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {getPrecosByTipo("banho").map(preco => (
                    <div key={preco.id} className={`flex items-center justify-between p-3 rounded-lg ${preco.ativo ? 'bg-cyan-50' : 'bg-gray-100 opacity-60'}`}>
                      <div className="flex items-center gap-3">
                        <Switch checked={preco.ativo} onCheckedChange={() => toggleAtivo(preco)} />
                        <span className="font-medium">{preco.raca || "Padrão"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-600">{formatCurrency(preco.valor)}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(preco)}><Pencil className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                {getPrecosByTipo("banho").length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nenhum preço de banho cadastrado</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Tosa */}
          <TabsContent value="tosa">
            <div className="space-y-6">
              {["tosa_higienica", "tosa_geral", "tosa_detalhada"].map(tipoTosa => (
                <Card key={tipoTosa} className="border-gray-200 bg-white">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Scissors className="w-5 h-5 text-purple-600" />
                      {getTipoLabel(tipoTosa)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {precos.filter(p => p.tipo === tipoTosa).map(preco => (
                        <div key={preco.id} className={`flex items-center justify-between p-3 rounded-lg ${preco.ativo ? 'bg-purple-50' : 'bg-gray-100 opacity-60'}`}>
                          <div className="flex items-center gap-3">
                            <Switch checked={preco.ativo} onCheckedChange={() => toggleAtivo(preco)} />
                            <span className="font-medium">{preco.raca || "Padrão"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-600">{formatCurrency(preco.valor)}</span>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditModal(preco)}><Pencil className="w-3 h-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {precos.filter(p => p.tipo === tipoTosa).length === 0 && (
                      <p className="text-center text-gray-500 py-4">Nenhum preço cadastrado</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Tab Transporte */}
          <TabsContent value="transporte">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-600" />
                  Preços de Transporte
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {getPrecosByTipo("transporte").map(preco => (
                    <div key={preco.id} className={`flex items-center justify-between p-4 rounded-lg ${preco.ativo ? 'bg-amber-50' : 'bg-gray-100 opacity-60'}`}>
                      <div className="flex items-center gap-4">
                        <Switch checked={preco.ativo} onCheckedChange={() => toggleAtivo(preco)} />
                        <div>
                          <p className="font-medium text-gray-900">{preco.descricao || "Por quilômetro"}</p>
                          <p className="text-sm text-gray-500">{preco.raca || "Todas as zonas"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xl font-bold text-amber-600">{formatCurrency(preco.valor)}/km</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal(preco)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(preco.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {getPrecosByTipo("transporte").length === 0 && (
                    <p className="text-center text-gray-500 py-8">Nenhum preço de transporte cadastrado</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Descontos */}
          <TabsContent value="descontos">
            <Card className="border-gray-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-green-600" />
                  Regras de Desconto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {DESCONTOS_PADRAO.map(desconto => (
                    <div key={desconto.id} className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{desconto.label}</p>
                        <p className="text-sm text-gray-500">{desconto.descricao}</p>
                      </div>
                      <Badge className="bg-green-600 text-white text-lg px-4 py-2">
                        {desconto.percentual}%
                      </Badge>
                    </div>
                  ))}
                  <p className="text-sm text-gray-500 text-center mt-4">
                    ℹ️ Os descontos são aplicados automaticamente nos orçamentos
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar" : "Novo"} Preço</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Tipo de Serviço *</Label>
              <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_SERVICO.map(tipo => (
                    <SelectItem key={tipo.id} value={tipo.id}>{tipo.icon} {tipo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(formData.tipo?.includes("banho") || formData.tipo?.includes("tosa")) && (
              <div>
                <Label>Raça (opcional)</Label>
                <Select value={formData.raca} onValueChange={(v) => setFormData({ ...formData, raca: v })}>
                  <SelectTrigger><SelectValue placeholder="Todas as raças" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Padrão (todas)</SelectItem>
                    {RACAS.map(raca => (
                      <SelectItem key={raca} value={raca}>{raca}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Valor *</Label>
              <Input 
                value={formData.valor} 
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })} 
                placeholder="0,00" 
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input 
                value={formData.descricao} 
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} 
                placeholder="Descrição opcional" 
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formData.ativo} onCheckedChange={(v) => setFormData({ ...formData, ativo: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}