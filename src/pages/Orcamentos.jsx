import React, { useState, useEffect } from "react";
import { Orcamento } from "@/api/entities";
import { Dog } from "@/api/entities";
import { Carteira } from "@/api/entities";
import { TabelaPrecos } from "@/api/entities";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Plus, FileText, Calculator, Send, Dog as DogIcon, Truck, Users, Save, Eye, Trash2, RefreshCw, History, UserPlus, Search
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

import OrcamentoCaoForm from "@/components/orcamento/OrcamentoCaoForm";
import OrcamentoTransporteForm from "@/components/orcamento/OrcamentoTransporteForm";
import OrcamentoResumo from "@/components/orcamento/OrcamentoResumo";
import { notificacoesOrcamento } from "@/api/functions";

// Preços padrão
const PRECOS_PADRAO = {
  diaria_normal: 150,      // Não mensalista
  diaria_mensalista: 120,  // Mensalista
  pernoite: 60,            // Pernoite (quando tem Day Care agendado)
  transporte_km: 6,        // R$ 6/km
  desconto_canil: 0.30,    // 30% para cães adicionais no mesmo dormitório
  desconto_longa_estadia: 0.03, // 3% para +15 diárias
};

// Preços de banho/tosa por raça (exemplo - pode ser configurado na TabelaPrecos)
const PRECOS_BANHO_TOSA_PADRAO = {
  banho: {
    "Poodle": 60, "Shih Tzu": 65, "Yorkshire": 55, "Maltês": 60,
    "Golden Retriever": 90, "Labrador": 85, "Border Collie": 80,
    "Bulldog Francês": 70, "Bulldog Inglês": 80, "Pug": 55,
    "Spitz Alemão": 75, "Lulu da Pomerânia": 70, "Chow Chow": 100,
    "Husky Siberiano": 95, "Pastor Alemão": 90, "Rottweiler": 95,
    "Beagle": 65, "Dachshund": 50, "Schnauzer": 70,
    "Cocker Spaniel": 75, "SRD": 60, "Outro": 70,
  },
  tosa_higienica: {
    "Poodle": 50, "Shih Tzu": 55, "Yorkshire": 45, "Maltês": 50,
    "Golden Retriever": 70, "Labrador": 65, "Border Collie": 60,
    "Bulldog Francês": 45, "Bulldog Inglês": 50, "Pug": 40,
    "Spitz Alemão": 60, "Lulu da Pomerânia": 55, "Chow Chow": 80,
    "Husky Siberiano": 75, "Pastor Alemão": 70, "Rottweiler": 65,
    "Beagle": 45, "Dachshund": 35, "Schnauzer": 55,
    "Cocker Spaniel": 60, "SRD": 50, "Outro": 55,
  },
  tosa_geral: {
    "Poodle": 80, "Shih Tzu": 85, "Yorkshire": 70, "Maltês": 80,
    "Golden Retriever": 110, "Labrador": 100, "Border Collie": 95,
    "Bulldog Francês": 70, "Bulldog Inglês": 80, "Pug": 60,
    "Spitz Alemão": 95, "Lulu da Pomerânia": 90, "Chow Chow": 130,
    "Husky Siberiano": 120, "Pastor Alemão": 110, "Rottweiler": 100,
    "Beagle": 70, "Dachshund": 55, "Schnauzer": 85,
    "Cocker Spaniel": 95, "SRD": 80, "Outro": 85,
  },
  tosa_detalhada: {
    "Poodle": 120, "Shih Tzu": 130, "Yorkshire": 110, "Maltês": 120,
    "Golden Retriever": 160, "Labrador": 150, "Border Collie": 140,
    "Bulldog Francês": 100, "Bulldog Inglês": 110, "Pug": 90,
    "Spitz Alemão": 140, "Lulu da Pomerânia": 130, "Chow Chow": 180,
    "Husky Siberiano": 170, "Pastor Alemão": 160, "Rottweiler": 150,
    "Beagle": 100, "Dachshund": 80, "Schnauzer": 120,
    "Cocker Spaniel": 140, "SRD": 110, "Outro": 120,
  },
};

const emptyCao = {
  dog_id: "",
  is_mensalista: false,
  data_entrada: "",
  data_saida: "",
  horario_saida: "12:00",
  banho: false,
  tosa: false,
  tipo_tosa: "higienica",
  tem_pernoite: false,
  datas_pernoite: [], // Datas que o cão tem Day Care agendado
};

const emptyTransporte = {
  ativo: false,
  endereco: "",
  km: 0,
  horario: "",
};

export default function Orcamentos() {
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [precos, setPrecos] = useState(PRECOS_PADRAO);
  const [precosBanhoTosa, setPrecosBanhoTosa] = useState(PRECOS_BANHO_TOSA_PADRAO);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [etapa, setEtapa] = useState("cliente"); // "cliente", "servicos" ou "detalhes"
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [searchCliente, setSearchCliente] = useState("");
  const [servicosSelecionados, setServicosSelecionados] = useState({
    hospedagem: false,
    banho: false,
    tosa: false,
    transporte: false,
  });
  const [activeTab, setActiveTab] = useState("caes");
  const [caes, setCaes] = useState([{ ...emptyCao }]);
  const [dormitorioCompartilhado, setDormitorioCompartilhado] = useState(false);
  const [caesDormitorioJuntos, setCaesDormitorioJuntos] = useState([]);
  const [transporteIda, setTransporteIda] = useState({ ...emptyTransporte });
  const [transporteVolta, setTransporteVolta] = useState({ ...emptyTransporte });
  const [observacoes, setObservacoes] = useState("");
  const [calculo, setCalculo] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  // Recalcular quando dados mudam
  useEffect(() => {
    if (dogs.length > 0 && etapa === "detalhes") {
      calcularOrcamento();
    }
  }, [caes, dormitorioCompartilhado, caesDormitorioJuntos, transporteIda, transporteVolta, dogs, servicosSelecionados, etapa]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [dogsData, carteirasData, orcamentosData, precosData] = await Promise.all([
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Orcamento.list("-created_date", 100),
        TabelaPrecos.filter({ ativo: true })
      ]);
      setDogs(dogsData.filter(d => d.ativo !== false));
      setCarteiras(carteirasData.filter(c => c.ativo !== false));
      setOrcamentos(orcamentosData);
      
      // Mapear preços da tabela
      if (precosData.length > 0) {
        const precosMap = { ...PRECOS_PADRAO };
        precosData.forEach(p => {
          if (p.tipo === "hospedagem" && !p.porte) precosMap.diaria_normal = p.valor;
          if (p.tipo === "hospedagem_mensalista") precosMap.diaria_mensalista = p.valor;
          // ... outros mapeamentos
        });
        setPrecos(precosMap);
      }
    } catch (error) { console.error("Erro:", error); }
    setIsLoading(false);
  };

  const resetForm = () => {
    setEtapa("cliente");
    setClienteSelecionado(null);
    setSearchCliente("");
    setServicosSelecionados({ hospedagem: false, banho: false, tosa: false, transporte: false });
    setCaes([{ ...emptyCao }]);
    setDormitorioCompartilhado(false);
    setCaesDormitorioJuntos([]);
    setTransporteIda({ ...emptyTransporte });
    setTransporteVolta({ ...emptyTransporte });
    setObservacoes("");
    setCalculo(null);
    setActiveTab("caes");
  };

  // Cães do cliente selecionado
  const getCaesDoCliente = () => {
    if (!clienteSelecionado) return dogs;
    const dogIds = [1,2,3,4,5,6,7,8].map(n => clienteSelecionado[`dog_id_${n}`]).filter(Boolean);
    if (dogIds.length === 0) return dogs;
    return dogs.filter(d => dogIds.includes(d.id));
  };

  // Filtrar clientes
  const clientesFiltrados = carteiras.filter(c => 
    !searchCliente || 
    c.nome_razao_social?.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.cpf_cnpj?.includes(searchCliente) ||
    c.celular?.includes(searchCliente)
  );

  const temAlgumServico = () => {
    return servicosSelecionados.hospedagem || servicosSelecionados.banho || 
           servicosSelecionados.tosa || servicosSelecionados.transporte;
  };

  const getTabsDisponiveis = () => {
    const tabs = [];
    if (servicosSelecionados.hospedagem || servicosSelecionados.banho || servicosSelecionados.tosa) {
      tabs.push("caes");
    }
    if (servicosSelecionados.hospedagem && caes.filter(c => c.dog_id).length > 1) {
      tabs.push("dormitorio");
    }
    if (servicosSelecionados.transporte) {
      tabs.push("transporte");
    }
    return tabs;
  };

  const addCao = () => {
    setCaes([...caes, { ...emptyCao }]);
  };

  const updateCao = (index, data) => {
    const newCaes = [...caes];
    newCaes[index] = data;
    setCaes(newCaes);
  };

  const removeCao = (index) => {
    const newCaes = caes.filter((_, i) => i !== index);
    setCaes(newCaes);
    // Remover do grupo de dormitório se estava lá
    setCaesDormitorioJuntos(caesDormitorioJuntos.filter(id => id !== caes[index].dog_id));
  };

  const toggleCaoDormitorio = (dogId) => {
    if (caesDormitorioJuntos.includes(dogId)) {
      setCaesDormitorioJuntos(caesDormitorioJuntos.filter(id => id !== dogId));
    } else {
      setCaesDormitorioJuntos([...caesDormitorioJuntos, dogId]);
    }
  };

  const calcularDiarias = (dataEntrada, dataSaida, horarioSaida) => {
    if (!dataEntrada || !dataSaida) return 0;
    
    const entrada = new Date(dataEntrada);
    const saida = new Date(dataSaida);
    
    // Cálculo: 1ª diária = entrada até 12h do dia seguinte
    // Demais diárias = 12h até 12h do dia seguinte
    // Diferença em dias = quantidade base de diárias
    let diarias = differenceInDays(saida, entrada);
    
    // Se saída após 12h do último dia, adiciona mais uma diária
    if (horarioSaida) {
      const [hora] = horarioSaida.split(':').map(Number);
      if (hora >= 12) {
        diarias += 1;
      }
    }
    
    // Mínimo de 1 diária
    return Math.max(1, diarias);
  };

  const calcularOrcamento = () => {
    const detalhes = [];
    let subtotalHospedagem = 0;
    let subtotalServicos = 0;
    let descontoTotal = 0;

    // Filtrar cães válidos baseado nos serviços selecionados
    const caesOrdenados = [...caes].filter(c => {
      if (!c.dog_id) return false;
      // Se tem hospedagem, precisa das datas
      if (servicosSelecionados.hospedagem) {
        return c.data_entrada && c.data_saida;
      }
      // Se só tem banho/tosa, não precisa de datas
      return true;
    });

    caesOrdenados.forEach((cao) => {
      const dog = dogs.find(d => d.id === cao.dog_id);
      const raca = dog?.raca || "Outro";

      let diariasTotal = 0;
      let diariasNormais = 0;
      let numPernoites = 0;
      let subtotalDiariasNormais = 0;
      let subtotalPernoites = 0;
      let descontoCasDormitorio = 0;
      let descontoLonga = 0;
      let percentualLonga = 0;
      let valorDiaria = 0;

      // Só calcula hospedagem se o serviço estiver selecionado
      if (servicosSelecionados.hospedagem && cao.data_entrada && cao.data_saida) {
        diariasTotal = calcularDiarias(cao.data_entrada, cao.data_saida, cao.horario_saida);
        valorDiaria = cao.is_mensalista ? precos.diaria_mensalista : precos.diaria_normal;
        
        numPernoites = cao.tem_pernoite ? (cao.datas_pernoite?.filter(d => d)?.length || 0) : 0;
        diariasNormais = Math.max(0, diariasTotal - numPernoites);
        
        subtotalDiariasNormais = diariasNormais * valorDiaria;
        subtotalPernoites = numPernoites * precos.pernoite;

        // Desconto canil (30%)
        if (dormitorioCompartilhado && caesDormitorioJuntos.includes(cao.dog_id) && caesDormitorioJuntos.length >= 2) {
          const indexNoDormitorio = caesDormitorioJuntos.indexOf(cao.dog_id);
          if (indexNoDormitorio > 0) {
            descontoCasDormitorio = subtotalDiariasNormais * precos.desconto_canil;
          }
        }

        // Desconto longa estadia (3% para +15 diárias)
        if (diariasTotal > 15) {
          percentualLonga = 3;
          descontoLonga = (subtotalDiariasNormais - descontoCasDormitorio) * precos.desconto_longa_estadia;
        }
      }

      const totalDiariasComDesconto = subtotalDiariasNormais - descontoCasDormitorio - descontoLonga + subtotalPernoites;

      // Banho - só se serviço selecionado
      const valorBanho = (servicosSelecionados.banho && cao.banho) 
        ? (precosBanhoTosa.banho[raca] || precosBanhoTosa.banho["Outro"] || 70) : 0;
      
      // Tosa - só se serviço selecionado
      let valorTosa = 0;
      let tipoTosaLabel = "";
      if (servicosSelecionados.tosa && cao.tosa && cao.tipo_tosa) {
        const tosaKey = `tosa_${cao.tipo_tosa}`;
        valorTosa = precosBanhoTosa[tosaKey]?.[raca] || precosBanhoTosa[tosaKey]?.["Outro"] || 80;
        tipoTosaLabel = cao.tipo_tosa === "higienica" ? "Higiênica" : 
                       cao.tipo_tosa === "geral" ? "Geral" : "Detalhada";
      }

      const totalCao = totalDiariasComDesconto + valorBanho + valorTosa;

      if (totalCao > 0 || servicosSelecionados.hospedagem || servicosSelecionados.banho || servicosSelecionados.tosa) {
        detalhes.push({
          dog_id: cao.dog_id,
          dog_nome: dog?.nome,
          dog_raca: raca,
          is_mensalista: cao.is_mensalista,
          diarias: diariasTotal,
          diarias_normais: diariasNormais,
          num_pernoites: numPernoites,
          datas_pernoite: cao.datas_pernoite || [],
          valor_diaria: valorDiaria,
          valor_pernoite: precos.pernoite,
          subtotal_diarias: subtotalDiariasNormais,
          subtotal_pernoites: subtotalPernoites,
          desconto_dormitorio: descontoCasDormitorio,
          desconto_longa_estadia: descontoLonga,
          percentual_longa_estadia: percentualLonga,
          valor_banho: valorBanho,
          valor_tosa: valorTosa,
          tipo_tosa: tipoTosaLabel,
          total_cao: totalCao,
        });

        subtotalHospedagem += totalDiariasComDesconto;
        subtotalServicos += valorBanho + valorTosa;
        descontoTotal += descontoCasDormitorio + descontoLonga;
      }
    });

    // Transporte por km (R$ 6/km) - só se serviço selecionado
    let transporteIdaValor = 0;
    let transporteVoltaValor = 0;
    if (servicosSelecionados.transporte) {
      transporteIdaValor = transporteIda.ativo && transporteIda.km > 0 
        ? transporteIda.km * precos.transporte_km : 0;
      transporteVoltaValor = transporteVolta.ativo && transporteVolta.km > 0 
        ? transporteVolta.km * precos.transporte_km : 0;
    }
    const subtotalTransporte = transporteIdaValor + transporteVoltaValor;

    const valorTotal = subtotalHospedagem + subtotalServicos + subtotalTransporte;

    const temValor = detalhes.length > 0 || subtotalTransporte > 0;
    
    if (temValor) {
      setCalculo({
        detalhes,
        servicos_inclusos: { ...servicosSelecionados },
        subtotal_hospedagem: subtotalHospedagem,
        subtotal_servicos: subtotalServicos,
        subtotal_transporte: subtotalTransporte,
        transporte_ida: transporteIdaValor,
        transporte_ida_km: transporteIda.km || 0,
        transporte_volta: transporteVoltaValor,
        transporte_volta_km: transporteVolta.km || 0,
        desconto_total: descontoTotal,
        valor_total: valorTotal,
      });
    } else {
      setCalculo(null);
    }
  };

  const handleSave = async (status = "rascunho") => {
    if (!calculo) {
      alert("Preencha os dados do orçamento"); return;
    }
    setIsSaving(true);
    try {
      const orcamentoData = {
        cliente_id: clienteSelecionado?.id || null,
        data_criacao: new Date().toISOString().split('T')[0],
        data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        caes: JSON.parse(JSON.stringify(caes)),
        grupo_dormitorio: dormitorioCompartilhado ? [...caesDormitorioJuntos] : [],
        transporte_ida: JSON.parse(JSON.stringify(transporteIda)),
        transporte_volta: JSON.parse(JSON.stringify(transporteVolta)),
        subtotal_hospedagem: calculo.subtotal_hospedagem,
        subtotal_servicos: calculo.subtotal_servicos,
        subtotal_transporte: calculo.subtotal_transporte,
        desconto_total: calculo.desconto_total,
        valor_total: calculo.valor_total,
        status,
        observacoes,
      };
      await Orcamento.create(orcamentoData);
      
      // Notificar admins sobre novo orçamento
      try {
        await notificacoesOrcamento({ 
          action: 'novo_orcamento', 
          data: { valor_total: calculo.valor_total, status } 
        });
      } catch (e) { console.log("Notificação não enviada"); }
      
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) { 
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar orçamento. Tente novamente."); 
    }
    setIsSaving(false);
  };

  const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (d) => d ? format(new Date(d), "dd/MM/yyyy", { locale: ptBR }) : "-";

  const getStatusBadge = (status) => {
    const config = {
      rascunho: { color: "bg-gray-100 text-gray-700", label: "Rascunho" },
      enviado: { color: "bg-blue-100 text-blue-700", label: "Enviado" },
      aprovado: { color: "bg-green-100 text-green-700", label: "Aprovado" },
      recusado: { color: "bg-red-100 text-red-700", label: "Recusado" },
      expirado: { color: "bg-orange-100 text-orange-700", label: "Expirado" },
    };
    const c = config[status] || config.rascunho;
    return <Badge className={c.color}>{c.label}</Badge>;
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68d30bcc5ca43f0f9b7df581/b25f6333e_Capturadetela2025-09-24192240.png" alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Orçamentos</h1>
              <p className="text-sm text-gray-600">Geração de orçamentos para serviços</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={createPageUrl("HistoricoOrcamentos")}>
              <Button variant="outline">
                <History className="w-4 h-4 mr-2" />Histórico
              </Button>
            </Link>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-2" />Novo Orçamento
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-blue-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Total</p><p className="text-2xl font-bold text-blue-600">{orcamentos.length}</p></div>
              <FileText className="w-10 h-10 text-blue-500" />
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Aprovados</p><p className="text-2xl font-bold text-green-600">{orcamentos.filter(o => o.status === "aprovado").length}</p></div>
              <Calculator className="w-10 h-10 text-green-500" />
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Enviados</p><p className="text-2xl font-bold text-orange-600">{orcamentos.filter(o => o.status === "enviado").length}</p></div>
              <Send className="w-10 h-10 text-orange-500" />
            </CardContent>
          </Card>
          <Card className="border-gray-200 bg-white">
            <CardContent className="p-4 flex items-center justify-between">
              <div><p className="text-sm text-gray-600">Rascunhos</p><p className="text-2xl font-bold text-gray-600">{orcamentos.filter(o => o.status === "rascunho").length}</p></div>
              <FileText className="w-10 h-10 text-gray-400" />
            </CardContent>
          </Card>
        </div>

        {/* Lista de Orçamentos */}
        <Card className="border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Orçamentos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orcamentos.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Nenhum orçamento criado</p>
                <Button onClick={() => { resetForm(); setShowModal(true); }} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="w-4 h-4 mr-2" />Criar Primeiro Orçamento
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {orcamentos.slice(0, 10).map(orc => (
                  <div key={orc.id} className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {orc.caes?.length || 0} cão(s) • {formatDate(orc.data_criacao)}
                          </p>
                          <p className="text-sm text-gray-500">Validade: {formatDate(orc.data_validade)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-green-600">{formatCurrency(orc.valor_total)}</span>
                        {getStatusBadge(orc.status)}
                      </div>
                    </div>
                    {orc.observacoes && (
                      <div className="mt-2 pl-14 text-sm text-gray-600 bg-yellow-50 p-2 rounded border-l-2 border-yellow-400">
                        <strong>Obs:</strong> {orc.observacoes}
                      </div>
                    )}
                    <div className="mt-2 pl-14 flex flex-wrap gap-2 text-xs text-gray-500">
                      <span>Hospedagem: {formatCurrency(orc.subtotal_hospedagem)}</span>
                      <span>•</span>
                      <span>Banho & Tosa: {formatCurrency(orc.subtotal_servicos)}</span>
                      <span>•</span>
                      <span>Transporte: {formatCurrency(orc.subtotal_transporte)}</span>
                      {orc.desconto_total > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-green-600">Descontos: -{formatCurrency(orc.desconto_total)}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Novo Orçamento */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[98vw] max-w-[1200px] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              Novo Orçamento 
              {etapa === "cliente" && " - Selecione o Cliente"}
              {etapa === "servicos" && " - Selecione os Serviços"}
            </DialogTitle>
          </DialogHeader>

          {/* ETAPA 0: Seleção de Cliente */}
          {etapa === "cliente" && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-gray-600 mb-4">Selecione um cliente ou pule para criar orçamento sem cliente vinculado.</p>
              
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input 
                  placeholder="Buscar por nome, CPF/CNPJ ou celular..." 
                  value={searchCliente}
                  onChange={(e) => setSearchCliente(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {clientesFiltrados.slice(0, 20).map(cliente => {
                  const numCaes = [1,2,3,4,5,6,7,8].filter(n => cliente[`dog_id_${n}`]).length;
                  return (
                    <div 
                      key={cliente.id}
                      onClick={() => setClienteSelecionado(cliente)}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        clienteSelecionado?.id === cliente.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{cliente.nome_razao_social}</p>
                          <p className="text-sm text-gray-500">{cliente.celular} • {cliente.cpf_cnpj}</p>
                        </div>
                        <Badge variant="outline">{numCaes} cão(s)</Badge>
                      </div>
                    </div>
                  );
                })}
                {clientesFiltrados.length === 0 && (
                  <p className="text-center text-gray-500 py-8">Nenhum cliente encontrado</p>
                )}
              </div>

              {clienteSelecionado && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>Cliente selecionado:</strong> {clienteSelecionado.nome_razao_social}
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* ETAPA 1: Seleção de Serviços */}
          {etapa === "servicos" && (
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-gray-600 mb-6">Quais serviços estarão inclusos neste orçamento?</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div 
                  onClick={() => setServicosSelecionados(prev => ({ ...prev, hospedagem: !prev.hospedagem }))}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    servicosSelecionados.hospedagem 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      servicosSelecionados.hospedagem ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      🏨
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Hospedagem</h3>
                      <p className="text-sm text-gray-500">Diárias, pernoites e dormitório</p>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => setServicosSelecionados(prev => ({ 
                    ...prev, 
                    banho: !prev.banho,
                    tosa: !prev.banho ? prev.tosa : false // Desmarca tosa se desmarcar banho
                  }))}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    servicosSelecionados.banho 
                      ? 'border-cyan-500 bg-cyan-50' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      servicosSelecionados.banho ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      🛁
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Banho</h3>
                      <p className="text-sm text-gray-500">Serviço de banho por raça</p>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => {
                    if (!servicosSelecionados.banho) return; // Só permite selecionar tosa se banho estiver selecionado
                    setServicosSelecionados(prev => ({ ...prev, tosa: !prev.tosa }));
                  }}
                  className={`p-6 rounded-xl border-2 transition-all ${
                    !servicosSelecionados.banho 
                      ? 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-50' 
                      : servicosSelecionados.tosa 
                        ? 'border-purple-500 bg-purple-50 cursor-pointer' 
                        : 'border-gray-200 hover:border-gray-300 bg-white cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      servicosSelecionados.tosa ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      ✂️
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Tosa</h3>
                      <p className="text-sm text-gray-500">
                        {!servicosSelecionados.banho ? "Selecione Banho primeiro" : "Higiênica, Geral ou Detalhada"}
                      </p>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => setServicosSelecionados(prev => ({ ...prev, transporte: !prev.transporte }))}
                  className={`p-6 rounded-xl border-2 cursor-pointer transition-all ${
                    servicosSelecionados.transporte 
                      ? 'border-amber-500 bg-amber-50' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      servicosSelecionados.transporte ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      🚐
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Transporte</h3>
                      <p className="text-sm text-gray-500">Ida e/ou volta (R$ 6/km)</p>
                    </div>
                  </div>
                </div>
              </div>

              {temAlgumServico() && (
                <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>Serviços selecionados:</strong>{" "}
                    {[
                      servicosSelecionados.hospedagem && "Hospedagem",
                      servicosSelecionados.banho && "Banho",
                      servicosSelecionados.tosa && "Tosa",
                      servicosSelecionados.transporte && "Transporte",
                    ].filter(Boolean).join(", ")}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ETAPA 2: Detalhes do Orçamento */}
          {etapa === "detalhes" && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-1">
                {/* Formulário - 2 colunas */}
                <div className="lg:col-span-2 space-y-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className={`grid w-full ${getTabsDisponiveis().length === 1 ? 'grid-cols-1' : getTabsDisponiveis().length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {getTabsDisponiveis().includes("caes") && (
                        <TabsTrigger value="caes" className="flex items-center gap-1">
                          <DogIcon className="w-4 h-4" />Cães
                        </TabsTrigger>
                      )}
                      {getTabsDisponiveis().includes("dormitorio") && (
                        <TabsTrigger value="dormitorio" className="flex items-center gap-1">
                          <Users className="w-4 h-4" />Dormitório
                        </TabsTrigger>
                      )}
                      {getTabsDisponiveis().includes("transporte") && (
                        <TabsTrigger value="transporte" className="flex items-center gap-1">
                          <Truck className="w-4 h-4" />Transporte
                        </TabsTrigger>
                      )}
                    </TabsList>

                    {/* Tab Cães */}
                    {getTabsDisponiveis().includes("caes") && (
                      <TabsContent value="caes" className="space-y-4 mt-4">
                        {clienteSelecionado && (
                          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                            <p className="text-sm text-blue-700">
                              <UserPlus className="w-4 h-4 inline mr-1" />
                              Cliente: <strong>{clienteSelecionado.nome_razao_social}</strong>
                            </p>
                          </div>
                        )}
                        {caes.map((cao, index) => (
                          <OrcamentoCaoForm
                            key={index}
                            cao={cao}
                            index={index}
                            dogs={getCaesDoCliente()}
                            onUpdate={updateCao}
                            onRemove={removeCao}
                            canRemove={caes.length > 1}
                            precosBanhoTosa={precosBanhoTosa}
                            servicosSelecionados={servicosSelecionados}
                          />
                        ))}
                        <Button variant="outline" onClick={addCao} className="w-full border-dashed">
                          <Plus className="w-4 h-4 mr-2" />Adicionar Outro Cão
                        </Button>
                      </TabsContent>
                    )}

                    {/* Tab Dormitório */}
                    {getTabsDisponiveis().includes("dormitorio") && (
                      <TabsContent value="dormitorio" className="mt-4">
                        <Card className="border-indigo-200 bg-white">
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Users className="w-5 h-5 text-indigo-600" />
                                Dormitório Compartilhado
                              </CardTitle>
                              <Switch 
                                checked={dormitorioCompartilhado} 
                                onCheckedChange={setDormitorioCompartilhado} 
                              />
                            </div>
                          </CardHeader>
                          {dormitorioCompartilhado && (
                            <CardContent>
                              <p className="text-sm text-gray-600 mb-4">
                                Selecione os cães que dormirão juntos. O <strong>primeiro cão não tem desconto</strong>, os demais recebem <strong>30% de desconto</strong> na diária.
                              </p>
                              <div className="space-y-2">
                                {caes.filter(c => c.dog_id).map((cao, idx) => {
                                  const dog = dogs.find(d => d.id === cao.dog_id);
                                  const isSelected = caesDormitorioJuntos.includes(cao.dog_id);
                                  return (
                                    <div 
                                      key={cao.dog_id}
                                      onClick={() => toggleCaoDormitorio(cao.dog_id)}
                                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                        isSelected ? 'bg-indigo-100 border-2 border-indigo-400' : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                                      }`}
                                    >
                                      {dog?.foto_url ? (
                                        <img src={dog.foto_url} className="w-10 h-10 rounded-full object-cover" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">🐕</div>
                                      )}
                                      <span className="font-medium">{dog?.nome || `Cão ${idx + 1}`}</span>
                                      {isSelected && <Badge className="bg-indigo-600 text-white ml-auto">Selecionado</Badge>}
                                    </div>
                                  );
                                })}
                              </div>
                              {caesDormitorioJuntos.length < 2 && caes.filter(c => c.dog_id).length >= 2 && (
                                <p className="text-sm text-orange-600 mt-3">
                                  ⚠️ Selecione pelo menos 2 cães para aplicar o desconto
                                </p>
                              )}
                            </CardContent>
                          )}
                        </Card>

                        {/* Desconto longa estadia */}
                        <Card className="border-green-200 bg-white mt-4">
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <RefreshCw className="w-5 h-5 text-green-600" />
                              Desconto Longa Estadia
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-600">
                              Aplicado automaticamente <strong>3% de desconto</strong> para estadias acima de 15 diárias.
                            </p>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    )}

                    {/* Tab Transporte */}
                    {getTabsDisponiveis().includes("transporte") && (
                      <TabsContent value="transporte" className="space-y-4 mt-4">
                        <OrcamentoTransporteForm
                          transporte={transporteIda}
                          tipo="ida"
                          onUpdate={setTransporteIda}
                        />
                        <OrcamentoTransporteForm
                          transporte={transporteVolta}
                          tipo="volta"
                          onUpdate={setTransporteVolta}
                        />
                      </TabsContent>
                    )}
                  </Tabs>

                  {/* Observações */}
                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-4">
                      <Label>Observações</Label>
                      <Textarea 
                        value={observacoes} 
                        onChange={(e) => setObservacoes(e.target.value)} 
                        placeholder="Observações gerais sobre o orçamento..."
                        rows={2}
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Resumo - 1 coluna */}
                <div className="lg:col-span-1">
                  <OrcamentoResumo calculo={calculo} caes={caes} dogs={dogs} servicosSelecionados={servicosSelecionados} />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 border-t pt-4">
            {etapa === "cliente" ? (
              <>
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
                <Button variant="outline" onClick={() => setEtapa("servicos")}>
                  Pular (sem cliente)
                </Button>
                <Button 
                  onClick={() => setEtapa("servicos")} 
                  disabled={!clienteSelecionado} 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Continuar
                </Button>
              </>
            ) : etapa === "servicos" ? (
              <>
                <Button variant="outline" onClick={() => setEtapa("cliente")}>Voltar</Button>
                <Button 
                  onClick={() => {
                    setEtapa("detalhes");
                    const tabs = getTabsDisponiveis();
                    if (tabs.length > 0) setActiveTab(tabs[0]);
                  }} 
                  disabled={!temAlgumServico()} 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Continuar
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEtapa("servicos")}>Voltar</Button>
                <Button variant="outline" onClick={() => handleSave("rascunho")} disabled={isSaving || !calculo}>
                  <Save className="w-4 h-4 mr-2" />Salvar Rascunho
                </Button>
                <Button onClick={() => handleSave("enviado")} disabled={isSaving || !calculo} className="bg-green-600 hover:bg-green-700 text-white">
                  <Send className="w-4 h-4 mr-2" />{isSaving ? "Salvando..." : "Enviar Orçamento"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}