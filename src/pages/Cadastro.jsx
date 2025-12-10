import React, { useState, useEffect } from "react";
import { Dog } from "@/api/entities";
import { Responsavel } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dog as DogIcon, Users, Wallet, Upload, Save, Plus, X, Search, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadFile } from "@/api/integrations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Cadastro() {
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dogs, setDogs] = useState([]);

  useEffect(() => { loadDogs(); }, []);
  const loadDogs = async () => { const data = await Dog.list("-created_date", 500); setDogs(data); };

  // Dog Form
  const emptyDog = {
    nome: "", apelido: "", raca: "", cores_pelagem: "", pelagem: "", peso: "", data_nascimento: "",
    foto_url: "", foto_carteirinha_vacina_url: "", data_revacinacao_1: "", data_revacinacao_2: "", data_revacinacao_3: "",
    veterinario_responsavel: "", veterinario_horario_atendimento: "", veterinario_telefone: "", veterinario_clinica_telefone: "", veterinario_endereco: "",
    alimentacao_marca_racao: "", alimentacao_sabor: "", alimentacao_tipo: "",
    refeicao_1_qnt: "", refeicao_1_horario: "", refeicao_1_obs: "",
    refeicao_2_qnt: "", refeicao_2_horario: "", refeicao_2_obs: "",
    refeicao_3_qnt: "", refeicao_3_horario: "", refeicao_3_obs: "",
    refeicao_4_qnt: "", refeicao_4_horario: "", refeicao_4_obs: ""
  };
  const [dogForm, setDogForm] = useState(emptyDog);

  // Responsavel Form
  const emptyResponsavel = { nome_completo: "", cpf: "", celular: "", celular_alternativo: "", email: "", dog_id_1: "", dog_id_2: "", dog_id_3: "", dog_id_4: "", dog_id_5: "", dog_id_6: "", dog_id_7: "", dog_id_8: "" };
  const [responsavelForm, setResponsavelForm] = useState(emptyResponsavel);
  const [searchDogResp, setSearchDogResp] = useState("");

  // Carteira Form
  const emptyCarteira = { nome_razao_social: "", cpf_cnpj: "", celular: "", email: "", cep: "", numero_residencia: "", vencimento_planos: "", dog_id_1: "", dog_id_2: "", dog_id_3: "", dog_id_4: "", dog_id_5: "", dog_id_6: "", dog_id_7: "", dog_id_8: "" };
  const [carteiraForm, setCarteiraForm] = useState(emptyCarteira);
  const [searchDogCart, setSearchDogCart] = useState("");

  const formatCPF = (v) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4').slice(0, 14);
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').slice(0, 18);
  };
  const formatPhone = (v) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return n.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };
  const formatCEP = (v) => v.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').slice(0, 9);

  const handleUpload = async (file, field) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const { file_url } = await UploadFile({ file });
      setDogForm(prev => ({ ...prev, [field]: file_url }));
    } catch (error) {
      setNotifyTitle("Erro"); setNotifyMessage("Erro ao enviar arquivo."); setNotifyOpen(true);
    }
    setIsUploading(false);
  };

  const handleSaveDog = async () => {
    if (!dogForm.nome) { setNotifyTitle("Campo obrigatório"); setNotifyMessage("Informe o nome do cão."); setNotifyOpen(true); return; }
    setIsSaving(true);
    try {
      await Dog.create({ ...dogForm, peso: dogForm.peso ? parseFloat(dogForm.peso) : null });
      setNotifyTitle("Sucesso"); setNotifyMessage("Cão cadastrado com sucesso!"); setNotifyOpen(true);
      setDogForm(emptyDog); loadDogs();
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage("Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  const handleSaveResponsavel = async () => {
    if (!responsavelForm.nome_completo || !responsavelForm.cpf || !responsavelForm.celular) {
      setNotifyTitle("Campos obrigatórios"); setNotifyMessage("Preencha nome, CPF e celular."); setNotifyOpen(true); return;
    }
    setIsSaving(true);
    try {
      await Responsavel.create(responsavelForm);
      setNotifyTitle("Sucesso"); setNotifyMessage("Responsável cadastrado!"); setNotifyOpen(true);
      setResponsavelForm(emptyResponsavel);
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage("Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  const handleSaveCarteira = async () => {
    if (!carteiraForm.nome_razao_social || !carteiraForm.cpf_cnpj || !carteiraForm.celular) {
      setNotifyTitle("Campos obrigatórios"); setNotifyMessage("Preencha nome/razão social, CPF/CNPJ e celular."); setNotifyOpen(true); return;
    }
    setIsSaving(true);
    try {
      await Carteira.create(carteiraForm);
      setNotifyTitle("Sucesso"); setNotifyMessage("Carteira cadastrada!"); setNotifyOpen(true);
      setCarteiraForm(emptyCarteira);
    } catch (error) { setNotifyTitle("Erro"); setNotifyMessage("Erro ao cadastrar."); setNotifyOpen(true); }
    setIsSaving(false);
  };

  

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-1">
            <DogIcon className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Cadastro</h1>
            <p className="text-sm text-gray-600 mt-1">Gerenciamento de cadastros</p>
          </div>
        </div>

        <Tabs defaultValue="caes" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="caes" className="flex items-center gap-2"><DogIcon className="w-4 h-4" /><span className="hidden sm:inline">Cães</span></TabsTrigger>
            <TabsTrigger value="responsaveis" className="flex items-center gap-2"><Users className="w-4 h-4" /><span className="hidden sm:inline">Responsáveis</span></TabsTrigger>
            <TabsTrigger value="carteiras" className="flex items-center gap-2"><Wallet className="w-4 h-4" /><span className="hidden sm:inline">Carteiras</span></TabsTrigger>
          </TabsList>

          {/* Cães Tab */}
          <TabsContent value="caes">
            <Card className="border-blue-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><DogIcon className="w-5 h-5 text-blue-600" />Cadastrar Cão</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div><Label>Nome *</Label><Input value={dogForm.nome} onChange={(e) => setDogForm({ ...dogForm, nome: e.target.value })} placeholder="Nome do cão" /></div>
                  <div><Label>Apelido</Label><Input value={dogForm.apelido} onChange={(e) => setDogForm({ ...dogForm, apelido: e.target.value })} /></div>
                  <div><Label>Raça</Label><Input value={dogForm.raca} onChange={(e) => setDogForm({ ...dogForm, raca: e.target.value })} /></div>
                  <div><Label>Cores da Pelagem</Label><Input value={dogForm.cores_pelagem} onChange={(e) => setDogForm({ ...dogForm, cores_pelagem: e.target.value })} /></div>
                  <div><Label>Pelagem</Label><Input value={dogForm.pelagem} onChange={(e) => setDogForm({ ...dogForm, pelagem: e.target.value })} placeholder="Ex: Curta, Longa" /></div>
                  <div><Label>Peso (KG)</Label><Input type="number" step="0.1" value={dogForm.peso} onChange={(e) => setDogForm({ ...dogForm, peso: e.target.value })} /></div>
                  <div><Label>Data de Nascimento</Label><Input type="date" value={dogForm.data_nascimento} onChange={(e) => setDogForm({ ...dogForm, data_nascimento: e.target.value })} /></div>
                  <div><Label>Foto Perfil</Label><div className="flex gap-2"><input type="file" accept="image/*" className="hidden" id="foto-perfil" onChange={(e) => handleUpload(e.target.files?.[0], "foto_url")} /><Button variant="outline" onClick={() => document.getElementById("foto-perfil").click()} disabled={isUploading} className="flex-1"><Upload className="w-4 h-4 mr-2" />{isUploading ? "..." : "Enviar"}</Button>{dogForm.foto_url && <a href={dogForm.foto_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm self-center">Ver</a>}</div></div>
                  <div><Label>Carteirinha Vacinação</Label><div className="flex gap-2"><input type="file" accept="image/*" className="hidden" id="carteirinha" onChange={(e) => handleUpload(e.target.files?.[0], "foto_carteirinha_vacina_url")} /><Button variant="outline" onClick={() => document.getElementById("carteirinha").click()} disabled={isUploading} className="flex-1"><Upload className="w-4 h-4 mr-2" />{isUploading ? "..." : "Enviar"}</Button>{dogForm.foto_carteirinha_vacina_url && <a href={dogForm.foto_carteirinha_vacina_url} target="_blank" rel="noreferrer" className="text-blue-600 text-sm self-center">Ver</a>}</div></div>
                  <div><Label>1ª Revacinação</Label><Input type="date" value={dogForm.data_revacinacao_1} onChange={(e) => setDogForm({ ...dogForm, data_revacinacao_1: e.target.value })} /></div>
                  <div><Label>2ª Revacinação</Label><Input type="date" value={dogForm.data_revacinacao_2} onChange={(e) => setDogForm({ ...dogForm, data_revacinacao_2: e.target.value })} /></div>
                  <div><Label>3ª Revacinação</Label><Input type="date" value={dogForm.data_revacinacao_3} onChange={(e) => setDogForm({ ...dogForm, data_revacinacao_3: e.target.value })} /></div>

                  <div className="col-span-full"><h4 className="font-semibold text-gray-900 mt-4 mb-2">Veterinário</h4></div>
                  <div><Label>Veterinário Responsável</Label><Input value={dogForm.veterinario_responsavel} onChange={(e) => setDogForm({ ...dogForm, veterinario_responsavel: e.target.value })} /></div>
                  <div><Label>Horário Atendimento</Label><Input value={dogForm.veterinario_horario_atendimento} onChange={(e) => setDogForm({ ...dogForm, veterinario_horario_atendimento: e.target.value })} /></div>
                  <div><Label>Telefone Veterinário</Label><Input value={dogForm.veterinario_telefone} onChange={(e) => setDogForm({ ...dogForm, veterinario_telefone: formatPhone(e.target.value) })} maxLength={15} /></div>
                  <div><Label>Telefone Clínica</Label><Input value={dogForm.veterinario_clinica_telefone} onChange={(e) => setDogForm({ ...dogForm, veterinario_clinica_telefone: formatPhone(e.target.value) })} maxLength={15} /></div>
                  <div className="sm:col-span-2"><Label>Endereço Vet/Clínica</Label><Input value={dogForm.veterinario_endereco} onChange={(e) => setDogForm({ ...dogForm, veterinario_endereco: e.target.value })} /></div>

                  <div className="col-span-full"><h4 className="font-semibold text-gray-900 mt-4 mb-2">Alimentação</h4></div>
                  <div><Label>Marca Ração</Label><Input value={dogForm.alimentacao_marca_racao} onChange={(e) => setDogForm({ ...dogForm, alimentacao_marca_racao: e.target.value })} /></div>
                  <div><Label>Sabor</Label><Input value={dogForm.alimentacao_sabor} onChange={(e) => setDogForm({ ...dogForm, alimentacao_sabor: e.target.value })} /></div>
                  <div><Label>Tipo</Label><Input value={dogForm.alimentacao_tipo} onChange={(e) => setDogForm({ ...dogForm, alimentacao_tipo: e.target.value })} /></div>

                  {[1, 2, 3, 4].map(n => (
                    <React.Fragment key={n}>
                      <div className="col-span-full"><h5 className="text-sm font-medium text-gray-700 mt-2">{n}ª Refeição</h5></div>
                      <div><Label>Qnt (g)</Label><Input value={dogForm[`refeicao_${n}_qnt`]} onChange={(e) => setDogForm({ ...dogForm, [`refeicao_${n}_qnt`]: e.target.value })} /></div>
                      <div><Label>Horário</Label><Input type="time" value={dogForm[`refeicao_${n}_horario`]} onChange={(e) => setDogForm({ ...dogForm, [`refeicao_${n}_horario`]: e.target.value })} /></div>
                      <div><Label>Observação</Label><Input value={dogForm[`refeicao_${n}_obs`]} onChange={(e) => setDogForm({ ...dogForm, [`refeicao_${n}_obs`]: e.target.value })} /></div>
                    </React.Fragment>
                  ))}
                </div>
                <Button onClick={handleSaveDog} disabled={isSaving} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Cão"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responsáveis Tab */}
          <TabsContent value="responsaveis">
            <Card className="border-green-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-green-600" />Cadastrar Responsável</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Nome Completo *</Label><Input value={responsavelForm.nome_completo} onChange={(e) => setResponsavelForm({ ...responsavelForm, nome_completo: e.target.value })} /></div>
                  <div><Label>CPF *</Label><Input value={responsavelForm.cpf} onChange={(e) => setResponsavelForm({ ...responsavelForm, cpf: formatCPF(e.target.value) })} maxLength={14} /></div>
                  <div><Label>Celular *</Label><Input value={responsavelForm.celular} onChange={(e) => setResponsavelForm({ ...responsavelForm, celular: formatPhone(e.target.value) })} maxLength={15} /></div>
                  <div><Label>Celular Alternativo</Label><Input value={responsavelForm.celular_alternativo} onChange={(e) => setResponsavelForm({ ...responsavelForm, celular_alternativo: formatPhone(e.target.value) })} maxLength={15} /></div>
                  <div className="sm:col-span-2"><Label>Email</Label><Input type="email" value={responsavelForm.email} onChange={(e) => setResponsavelForm({ ...responsavelForm, email: e.target.value })} /></div>
                  <div className="sm:col-span-2">
                    <Label>Vincular Cães (até 8)</Label>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input value={searchDogResp} onChange={(e) => setSearchDogResp(e.target.value)} placeholder="Buscar cão por nome..." className="pl-9" />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                      {dogs.filter(d => !searchDogResp || d.nome?.toLowerCase().includes(searchDogResp.toLowerCase())).map(d => {
                        const selectedSlot = [1,2,3,4,5,6,7,8].find(n => responsavelForm[`dog_id_${n}`] === d.id);
                        const isSelected = !!selectedSlot;
                        const canSelect = !isSelected && [1,2,3,4,5,6,7,8].some(n => !responsavelForm[`dog_id_${n}`]);
                        return (
                          <div key={d.id} className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-green-50' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setResponsavelForm({ ...responsavelForm, [`dog_id_${selectedSlot}`]: "" });
                              } else if (canSelect) {
                                const emptySlot = [1,2,3,4,5,6,7,8].find(n => !responsavelForm[`dog_id_${n}`]);
                                if (emptySlot) setResponsavelForm({ ...responsavelForm, [`dog_id_${emptySlot}`]: d.id });
                              }
                            }}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? <img src={d.foto_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">🐕</div>}
                              <span className="text-sm font-medium">{d.nome}</span>
                              {d.raca && <span className="text-xs text-gray-500">({d.raca})</span>}
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-green-600" />}
                          </div>
                        );
                      })}
                      {dogs.length === 0 && <p className="text-sm text-gray-500 text-center py-2">Nenhum cão cadastrado</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[1,2,3,4,5,6,7,8].map(n => {
                        const dogId = responsavelForm[`dog_id_${n}`];
                        const dog = dogs.find(d => d.id === dogId);
                        if (!dogId) return null;
                        return <Badge key={n} className="bg-green-100 text-green-700 flex items-center gap-1">{dog?.nome || dogId}<X className="w-3 h-3 cursor-pointer" onClick={() => setResponsavelForm({ ...responsavelForm, [`dog_id_${n}`]: "" })} /></Badge>;
                      })}
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveResponsavel} disabled={isSaving} className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Responsável"}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Carteiras Tab */}
          <TabsContent value="carteiras">
            <Card className="border-orange-200 bg-white">
              <CardContent className="p-4 sm:p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Wallet className="w-5 h-5 text-orange-600" />Cadastrar Carteira</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>Nome / Razão Social *</Label><Input value={carteiraForm.nome_razao_social} onChange={(e) => setCarteiraForm({ ...carteiraForm, nome_razao_social: e.target.value })} /></div>
                  <div><Label>CPF / CNPJ *</Label><Input value={carteiraForm.cpf_cnpj} onChange={(e) => setCarteiraForm({ ...carteiraForm, cpf_cnpj: formatCPF(e.target.value) })} maxLength={18} /></div>
                  <div><Label>Celular *</Label><Input value={carteiraForm.celular} onChange={(e) => setCarteiraForm({ ...carteiraForm, celular: formatPhone(e.target.value) })} maxLength={15} /></div>
                  <div><Label>Email</Label><Input type="email" value={carteiraForm.email} onChange={(e) => setCarteiraForm({ ...carteiraForm, email: e.target.value })} /></div>
                  <div><Label>CEP</Label><Input value={carteiraForm.cep} onChange={(e) => setCarteiraForm({ ...carteiraForm, cep: formatCEP(e.target.value) })} maxLength={9} /></div>
                  <div><Label>Nº Residência</Label><Input value={carteiraForm.numero_residencia} onChange={(e) => setCarteiraForm({ ...carteiraForm, numero_residencia: e.target.value })} /></div>
                  <div><Label>Vencimento Planos</Label><Input type="date" value={carteiraForm.vencimento_planos} onChange={(e) => setCarteiraForm({ ...carteiraForm, vencimento_planos: e.target.value })} /></div>
                  <div></div>
                  <div className="sm:col-span-2">
                    <Label>Vincular Cães (até 8)</Label>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input value={searchDogCart} onChange={(e) => setSearchDogCart(e.target.value)} placeholder="Buscar cão por nome..." className="pl-9" />
                    </div>
                    <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                      {dogs.filter(d => !searchDogCart || d.nome?.toLowerCase().includes(searchDogCart.toLowerCase())).map(d => {
                        const selectedSlot = [1,2,3,4,5,6,7,8].find(n => carteiraForm[`dog_id_${n}`] === d.id);
                        const isSelected = !!selectedSlot;
                        const canSelect = !isSelected && [1,2,3,4,5,6,7,8].some(n => !carteiraForm[`dog_id_${n}`]);
                        return (
                          <div key={d.id} className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 ${isSelected ? 'bg-green-50' : ''}`}
                            onClick={() => {
                              if (isSelected) {
                                setCarteiraForm({ ...carteiraForm, [`dog_id_${selectedSlot}`]: "" });
                              } else if (canSelect) {
                                const emptySlot = [1,2,3,4,5,6,7,8].find(n => !carteiraForm[`dog_id_${n}`]);
                                if (emptySlot) setCarteiraForm({ ...carteiraForm, [`dog_id_${emptySlot}`]: d.id });
                              }
                            }}>
                            <div className="flex items-center gap-2">
                              {d.foto_url ? <img src={d.foto_url} className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">🐕</div>}
                              <span className="text-sm font-medium">{d.nome}</span>
                              {d.raca && <span className="text-xs text-gray-500">({d.raca})</span>}
                            </div>
                            {isSelected && <Check className="w-5 h-5 text-green-600" />}
                          </div>
                        );
                      })}
                      {dogs.length === 0 && <p className="text-sm text-gray-500 text-center py-2">Nenhum cão cadastrado</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {[1,2,3,4,5,6,7,8].map(n => {
                        const dogId = carteiraForm[`dog_id_${n}`];
                        const dog = dogs.find(d => d.id === dogId);
                        if (!dogId) return null;
                        return <Badge key={n} className="bg-green-100 text-green-700 flex items-center gap-1">{dog?.nome || dogId}<X className="w-3 h-3 cursor-pointer" onClick={() => setCarteiraForm({ ...carteiraForm, [`dog_id_${n}`]: "" })} /></Badge>;
                      })}
                    </div>
                  </div>
                </div>
                <Button onClick={handleSaveCarteira} disabled={isSaving} className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white"><Save className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Cadastrar Carteira"}</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={notifyOpen} onOpenChange={setNotifyOpen}>
        <DialogContent className="w-[92vw] max-w-[460px]"><DialogHeader><DialogTitle>{notifyTitle}</DialogTitle></DialogHeader><p className="text-sm text-gray-700 py-2">{notifyMessage}</p><DialogFooter><Button onClick={() => setNotifyOpen(false)} className="bg-blue-600 hover:bg-blue-700 text-white">OK</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}