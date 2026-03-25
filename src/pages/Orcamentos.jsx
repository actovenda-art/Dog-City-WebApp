import React, { useEffect, useState } from "react";
import { Orcamento, Dog, Carteira, Responsavel, TabelaPrecos, User } from "@/api/entities";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator, Dog as DogIcon, FileText, History, Plus, Save, Search, Send } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

import OrcamentoCaoForm from "@/components/orcamento/OrcamentoCaoForm";
import OrcamentoResumo from "@/components/orcamento/OrcamentoResumo";

const PRECOS_PADRAO = {
  diaria_normal: 150,
  diaria_mensalista: 120,
  day_care_avulso_com_pacote: 110,
  day_care_avulso_sem_pacote: 125,
  day_care_avulso: 125,
  pernoite: 60,
  transporte_km: 6,
  desconto_canil: 0.3,
  desconto_longa_estadia: 0.03,
};

const PRECOS_BANHO_PADRAO = {
  "Poodle": 60, "Shih Tzu": 65, "Yorkshire": 55, "Maltes": 60,
  "Golden Retriever": 90, "Labrador": 85, "Border Collie": 80,
  "Bulldog Frances": 70, "Bulldog Ingles": 80, "Pug": 55,
  "Spitz Alemao": 75, "Lulu da Pomerania": 70, "Chow Chow": 100,
  "Husky Siberiano": 95, "Pastor Alemao": 90, "Rottweiler": 95,
  "Beagle": 65, "Dachshund": 50, "Schnauzer": 70,
  "Cocker Spaniel": 75, "SRD": 60, "Outro": 70,
};

const PRECOS_TOSA_HIGIENICA_PADRAO = {
  pequeno_baixa: 45,
  pequeno_alta: 55,
  medio_baixa: 55,
  medio_alta: 65,
  grande_baixa: 65,
  grande_alta: 80,
};

const PRECOS_TOSA_GERAL_PADRAO = {
  "Poodle": 80, "Shih Tzu": 85, "Yorkshire": 70, "Maltes": 80,
  "Golden Retriever": 110, "Labrador": 100, "Border Collie": 95,
  "Bulldog Frances": 70, "Bulldog Ingles": 80, "Pug": 60,
  "Spitz Alemao": 95, "Lulu da Pomerania": 90, "Chow Chow": 130,
  "Husky Siberiano": 120, "Pastor Alemao": 110, "Rottweiler": 100,
  "Beagle": 70, "Dachshund": 55, "Schnauzer": 85,
  "Cocker Spaniel": 95, "SRD": 80, "Outro": 85,
};

const PRECOS_TOSA_DETALHADA_PADRAO = {
  "Poodle": 120, "Shih Tzu": 130, "Yorkshire": 110, "Maltes": 120,
  "Golden Retriever": 160, "Labrador": 150, "Border Collie": 140,
  "Bulldog Frances": 100, "Bulldog Ingles": 110, "Pug": 90,
  "Spitz Alemao": 140, "Lulu da Pomerania": 130, "Chow Chow": 180,
  "Husky Siberiano": 170, "Pastor Alemao": 160, "Rottweiler": 150,
  "Beagle": 100, "Dachshund": 80, "Schnauzer": 120,
  "Cocker Spaniel": 140, "SRD": 110, "Outro": 120,
};

const emptyCao = {
  dog_id: "",
  servicos: { day_care: false, hospedagem: false, banho: false, tosa: false, transporte: false },
  day_care_data: "",
  day_care_plano_ativo: false,
  day_care_horario_entrada: "08:00",
  day_care_horario_saida: "18:00",
  day_care_observacoes: "",
  hosp_data_entrada: "",
  hosp_horario_entrada: "",
  hosp_data_saida: "",
  hosp_horario_saida: "12:00",
  hosp_is_mensalista: false,
  hosp_dormitorio_compartilhado: false,
  hosp_dormitorio_com: [],
  hosp_tem_daycare_ativo: false,
  hosp_datas_daycare: [],
  banho_plano_ativo: false,
  banho_do_pacote: false,
  banho_horario: "",
  banho_raca: "",
  banho_srd_porte: "",
  banho_srd_pelagem: "",
  tosa_tipo: "",
  tosa_subtipo_higienica: "",
  tosa_plano_ativo: false,
  tosa_do_pacote: false,
  tosa_obs: "",
  transporte_plano_ativo: false,
  transporte_do_pacote: false,
  transporte_viagens: [{ partida: "", destino: "", data: "", horario: "", km: "" }],
};

const RELATION_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function normalizeBreedName(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeSearchValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getLinkedDogIds(record) {
  return RELATION_SLOTS
    .map((number) => record?.[`dog_id_${number}`])
    .filter(Boolean);
}

function buildPricingConfig(precosRows, empresaId) {
  const scopedRows = (precosRows || []).filter((row) => row.ativo !== false && (!row.empresa_id || row.empresa_id === empresaId));
  const byConfigKey = Object.fromEntries(scopedRows.filter((row) => row.config_key).map((row) => [row.config_key, row.valor]));

  const breedMap = (tipo) => scopedRows
    .filter((row) => row.tipo === tipo)
    .reduce((acc, row) => {
      if (row.raca) acc[normalizeBreedName(row.raca)] = row.valor;
      return acc;
    }, {});

  return {
    diaria_normal: byConfigKey.diaria_normal ?? PRECOS_PADRAO.diaria_normal,
    diaria_mensalista: byConfigKey.diaria_mensalista ?? PRECOS_PADRAO.diaria_mensalista,
    day_care_avulso_com_pacote:
      byConfigKey.day_care_avulso_com_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_com_pacote" || row.config_key === "day_care_avulso_com_pacote"
      )?.valor ??
      PRECOS_PADRAO.day_care_avulso_com_pacote,
    day_care_avulso_sem_pacote:
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      PRECOS_PADRAO.day_care_avulso_sem_pacote,
    day_care_avulso:
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      PRECOS_PADRAO.day_care_avulso_sem_pacote,
    pernoite: byConfigKey.pernoite ?? PRECOS_PADRAO.pernoite,
    transporte_km: byConfigKey.transporte_km ?? PRECOS_PADRAO.transporte_km,
    desconto_canil: (byConfigKey.desconto_canil ?? (PRECOS_PADRAO.desconto_canil * 100)) / 100,
    desconto_longa_estadia: (byConfigKey.desconto_longa_estadia ?? (PRECOS_PADRAO.desconto_longa_estadia * 100)) / 100,
    banho: { ...PRECOS_BANHO_PADRAO, ...breedMap("banho") },
    tosa_higienica: { ...PRECOS_TOSA_HIGIENICA_PADRAO, ...breedMap("tosa_higienica") },
    tosa_geral: { ...PRECOS_TOSA_GERAL_PADRAO, ...breedMap("tosa_geral") },
    tosa_detalhada: { ...PRECOS_TOSA_DETALHADA_PADRAO, ...breedMap("tosa_detalhada") },
  };
}

function getDayCareStandaloneValue(cao, precos) {
  if (cao?.day_care_plano_ativo) {
    return precos.day_care_avulso_com_pacote ?? precos.day_care_avulso ?? PRECOS_PADRAO.day_care_avulso_com_pacote;
  }
  return precos.day_care_avulso_sem_pacote ?? precos.day_care_avulso ?? PRECOS_PADRAO.day_care_avulso_sem_pacote;
}

function calcularOrcamento(caes, dogs, precos) {
  const detalhes = [];
  const transporteLinhas = [];
  let subtotalHospedagem = 0;
  let subtotalServicos = 0;
  let subtotalTransporte = 0;
  let descontoTotal = 0;

  caes.forEach((cao) => {
    if (!cao.dog_id) return;
    const dog = dogs.find((item) => item.id === cao.dog_id);
    const linhas = [];
    let totalCao = 0;

    if (cao.servicos?.day_care && cao.day_care_data) {
      const valorDayCare = getDayCareStandaloneValue(cao, precos);
      linhas.push({
        tipo: "day_care",
        descricao: `Day Care Avulso (${cao.day_care_plano_ativo ? "cao com pacote ativo" : "cao sem pacote ativo"})`,
        valor: valorDayCare,
      });
      totalCao += valorDayCare;
      subtotalServicos += valorDayCare;
    }

    if (cao.servicos?.hospedagem && cao.hosp_data_entrada && cao.hosp_data_saida) {
      const entrada = new Date(cao.hosp_data_entrada);
      const saida = new Date(cao.hosp_data_saida);
      let diarias = differenceInDays(saida, entrada);
      const [hora] = (cao.hosp_horario_saida || "12:00").split(":").map(Number);
      if (hora >= 12) diarias += 1;
      diarias = Math.max(1, diarias);

      const numDaycare = (cao.hosp_datas_daycare || []).filter(Boolean).length;
      const diariasNormais = Math.max(0, diarias - numDaycare);
      const valorDiaria = cao.hosp_is_mensalista ? precos.diaria_mensalista : precos.diaria_normal;

      const subtotalDiarias = diariasNormais * valorDiaria;
      const subtotalPernoite = numDaycare * precos.pernoite;

      if (diariasNormais > 0) {
        linhas.push({
          tipo: "hospedagem",
          descricao: `${diariasNormais} diaria(s) x ${formatCurrency(valorDiaria)}`,
          valor: subtotalDiarias,
        });
      }

      if (numDaycare > 0) {
        linhas.push({
          tipo: "pernoite",
          descricao: `${numDaycare} pernoite(s) (Day Care) x ${formatCurrency(precos.pernoite)}`,
          valor: subtotalPernoite,
        });
      }

      let descDormitorio = 0;
      if (cao.hosp_dormitorio_compartilhado && (cao.hosp_dormitorio_com || []).length > 0) {
        descDormitorio = subtotalDiarias * precos.desconto_canil;
        linhas.push({
          tipo: "desconto",
          descricao: "Desc. dormitorio compartilhado (30%)",
          valor: -descDormitorio,
        });
        descontoTotal += descDormitorio;
      }

      let descLonga = 0;
      if (diarias > 15) {
        descLonga = (subtotalDiarias - descDormitorio) * precos.desconto_longa_estadia;
        linhas.push({
          tipo: "desconto",
          descricao: "Desc. longa estadia (3%)",
          valor: -descLonga,
        });
        descontoTotal += descLonga;
      }

      const totalHosp = subtotalDiarias + subtotalPernoite - descDormitorio - descLonga;
      totalCao += totalHosp;
      subtotalHospedagem += totalHosp;
    }

    if (cao.servicos?.banho) {
      const normalizedRaca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
      const valorBanho = precos.banho[normalizedRaca] || precos.banho.Outro;
      linhas.push({
        tipo: "banho",
        descricao: `Banho (${normalizedRaca})${cao.banho_do_pacote ? " - Pacote" : ""}`,
        valor: valorBanho,
      });
      totalCao += valorBanho;
      subtotalServicos += valorBanho;
    }

    if (cao.servicos?.tosa && cao.tosa_tipo) {
      let valorTosa = 0;
      let descTosa = "";

      if (cao.tosa_tipo === "higienica") {
        const sub = cao.tosa_subtipo_higienica || "pequeno_baixa";
        const subLabel = {
          pequeno_baixa: "Pequeno - Pelagem baixa",
          pequeno_alta: "Pequeno - Pelagem alta",
          medio_baixa: "Medio - Pelagem baixa",
          medio_alta: "Medio - Pelagem alta",
          grande_baixa: "Grande - Pelagem baixa",
          grande_alta: "Grande - Pelagem alta",
        }[sub] || sub;
        valorTosa = precos.tosa_higienica[sub] || 50;
        descTosa = `Tosa Higienica (${subLabel})`;
      } else if (cao.tosa_tipo === "geral") {
        const raca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
        valorTosa = precos.tosa_geral[raca] || precos.tosa_geral.Outro;
        descTosa = `Tosa Geral (${raca})`;
      } else if (cao.tosa_tipo === "detalhada") {
        const raca = normalizeBreedName(cao.banho_raca || dog?.raca || "Outro") || "Outro";
        valorTosa = precos.tosa_detalhada[raca] || precos.tosa_detalhada.Outro;
        descTosa = `Tosa Detalhada (${raca})`;
      }

      if (cao.tosa_do_pacote) descTosa += " - Pacote";
      linhas.push({ tipo: "tosa", descricao: descTosa, valor: valorTosa });
      totalCao += valorTosa;
      subtotalServicos += valorTosa;
    }

    if (cao.servicos?.transporte) {
      (cao.transporte_viagens || []).forEach((viagem, index) => {
        const km = parseFloat(viagem.km) || 0;
        if (km <= 0) return;
        const valor = km * precos.transporte_km;
        transporteLinhas.push({
          dog_nome: dog?.nome || "Cao",
          viagem_num: index + 1,
          km,
          valor,
          partida: viagem.partida,
          destino: viagem.destino,
        });
        subtotalTransporte += valor;
      });
    }

    if (totalCao > 0 || linhas.length > 0) {
      detalhes.push({
        dog_id: cao.dog_id,
        dog_nome: dog?.nome || "Cao",
        is_mensalista: cao.hosp_is_mensalista,
        linhas,
        total: totalCao,
      });
    }
  });

  const valorTotal = subtotalHospedagem + subtotalServicos + subtotalTransporte;
  if (detalhes.length === 0 && transporteLinhas.length === 0) return null;

  return {
    detalhes,
    transporte: transporteLinhas,
    subtotal_hospedagem: subtotalHospedagem,
    subtotal_servicos: subtotalServicos,
    subtotal_transporte: subtotalTransporte,
    desconto_total: descontoTotal,
    valor_total: valorTotal,
  };
}

export default function Orcamentos() {
  const location = useLocation();
  const [dogs, setDogs] = useState([]);
  const [carteiras, setCarteiras] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [orcamentos, setOrcamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [precos, setPrecos] = useState(buildPricingConfig([], null));
  const [currentUser, setCurrentUser] = useState(null);
  const [prefillApplied, setPrefillApplied] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [etapa, setEtapa] = useState("cliente");
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [searchCliente, setSearchCliente] = useState("");
  const [caes, setCaes] = useState([{ ...emptyCao }]);
  const [observacoes, setObservacoes] = useState("");
  const [calculo, setCalculo] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (dogs.length > 0) {
      setCalculo(calcularOrcamento(caes, dogs, precos));
    }
  }, [caes, dogs, precos]);

  useEffect(() => {
    if (isLoading || prefillApplied || !dogs.length) return;

    const params = new URLSearchParams(location.search);
    const dogId = params.get("dogId");
    const service = params.get("service");
    const date = params.get("date") || new Date().toISOString().slice(0, 10);
    const appointmentId = params.get("appointmentId");
    if (!dogId || !service) return;

    const selectedCarteira = carteiras.find((cliente) =>
      [1, 2, 3, 4, 5, 6, 7, 8].some((index) => cliente[`dog_id_${index}`] === dogId)
    ) || null;

    const prefilledCao = {
      ...emptyCao,
      dog_id: dogId,
      servicos: {
        ...emptyCao.servicos,
      },
    };

    if (service === "banho") {
      prefilledCao.servicos.banho = true;
      prefilledCao.banho_horario = "09:00";
    } else if (service === "hospedagem") {
      prefilledCao.servicos.hospedagem = true;
      prefilledCao.hosp_data_entrada = date;
      prefilledCao.hosp_horario_entrada = "09:00";
      prefilledCao.hosp_data_saida = date;
      prefilledCao.hosp_horario_saida = "18:00";
    } else if (service === "day_care") {
      prefilledCao.servicos.day_care = true;
      prefilledCao.day_care_data = date;
      prefilledCao.day_care_horario_entrada = "08:00";
      prefilledCao.day_care_horario_saida = "18:00";
    }

    setClienteSelecionado(selectedCarteira);
    setCaes([prefilledCao]);
    setObservacoes(
      appointmentId
        ? `Origem: agendamento manual ${appointmentId}. Revise valores e confirmacoes antes de enviar.`
        : "Origem: agendamento manual. Revise valores e confirmacoes antes de enviar."
    );
    setEtapa("caes");
    setShowModal(true);
    setPrefillApplied(true);
  }, [caes.length, carteiras, dogs, isLoading, location.search, prefillApplied]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [dogsData, carteirasData, responsaveisData, orcamentosData, precosData, userData] = await Promise.all([
        Dog.list("-created_date", 500),
        Carteira.list("-created_date", 500),
        Responsavel.list("-created_date", 500),
        Orcamento.list("-created_date", 100),
        TabelaPrecos.list("-created_date", 1000),
        User.me(),
      ]);

      setDogs((dogsData || []).filter((dog) => dog.ativo !== false));
      setCarteiras((carteirasData || []).filter((cliente) => cliente.ativo !== false));
      setResponsaveis((responsaveisData || []).filter((responsavel) => responsavel.ativo !== false));
      setOrcamentos(orcamentosData || []);
      setCurrentUser(userData || null);
      setPrecos(buildPricingConfig(precosData || [], userData?.empresa_id || null));
    } catch (error) {
      console.error("Erro ao carregar orcamentos:", error);
    }
    setIsLoading(false);
  }

  function resetForm() {
    setEtapa("cliente");
    setClienteSelecionado(null);
    setSearchCliente("");
    setCaes([{ ...emptyCao }]);
    setObservacoes("");
    setCalculo(null);
  }

  function getCaesDoCliente() {
    if (!clienteSelecionado) return dogs;
    const dogIds = getLinkedDogIds(clienteSelecionado);
    if (dogIds.length === 0) return dogs;
    return dogs.filter((dog) => dogIds.includes(dog.id));
  }

  const searchTerm = normalizeSearchValue(searchCliente);

  const clientesFiltrados = carteiras
    .map((cliente) => {
      const dogIds = getLinkedDogIds(cliente);
      const dogsDoCliente = dogs.filter((dog) => dogIds.includes(dog.id));
      const responsaveisDoCliente = responsaveis.filter((responsavel) =>
        getLinkedDogIds(responsavel).some((dogId) => dogIds.includes(dogId))
      );

      if (!searchTerm) {
        return {
          cliente,
          dogsDoCliente,
          responsaveisDoCliente,
          destaqueBusca: "",
          prioridade: 0,
        };
      }

      const carteiraMatched = [
        cliente.nome_razao_social,
        cliente.cpf_cnpj,
        cliente.celular,
        cliente.email,
      ].some((value) => normalizeSearchValue(value).includes(searchTerm));

      const matchedDogs = dogsDoCliente.filter((dog) =>
        [dog.nome, dog.apelido, dog.raca].some((value) => normalizeSearchValue(value).includes(searchTerm))
      );

      const matchedResponsaveis = responsaveisDoCliente.filter((responsavel) =>
        [responsavel.nome_completo, responsavel.cpf, responsavel.celular, responsavel.email]
          .some((value) => normalizeSearchValue(value).includes(searchTerm))
      );

      if (!carteiraMatched && matchedDogs.length === 0 && matchedResponsaveis.length === 0) {
        return null;
      }

      const destaqueBusca = [
        carteiraMatched ? "Responsavel financeiro" : "",
        matchedDogs.length ? `Cao: ${matchedDogs.map((dog) => dog.nome).join(", ")}` : "",
        matchedResponsaveis.length ? `Responsavel: ${matchedResponsaveis.map((responsavel) => responsavel.nome_completo).join(", ")}` : "",
      ].filter(Boolean).join(" | ");

      const prioridade = carteiraMatched ? 0 : matchedDogs.length ? 1 : 2;

      return {
        cliente,
        dogsDoCliente,
        responsaveisDoCliente,
        destaqueBusca,
        prioridade,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.prioridade !== right.prioridade) return left.prioridade - right.prioridade;
      return left.cliente.nome_razao_social.localeCompare(right.cliente.nome_razao_social);
    });

  const exigeConfirmacaoDestinatario = Boolean(searchTerm) && clientesFiltrados.length > 1;

  function addCao() {
    setCaes((prev) => [...prev, { ...emptyCao }]);
  }

  function updateCao(index, data) {
    setCaes((prev) => prev.map((cao, currentIndex) => currentIndex === index ? data : cao));
  }

  function removeCao(index) {
    setCaes((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSave(status = "rascunho") {
    if (!calculo) {
      alert("Preencha os dados do orcamento");
      return;
    }

    setIsSaving(true);
    try {
      await Orcamento.create({
        empresa_id: currentUser?.empresa_id || null,
        cliente_id: clienteSelecionado?.id || null,
        data_criacao: new Date().toISOString().split("T")[0],
        data_validade: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        caes: JSON.parse(JSON.stringify(caes)),
        subtotal_hospedagem: calculo.subtotal_hospedagem,
        subtotal_servicos: calculo.subtotal_servicos,
        subtotal_transporte: calculo.subtotal_transporte,
        desconto_total: calculo.desconto_total,
        valor_total: calculo.valor_total,
        status,
        observacoes,
      });
      await loadData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error("Erro ao salvar orcamento:", error);
      alert(error?.message || "Erro ao salvar orcamento.");
    }
    setIsSaving(false);
  }

  function formatDate(value) {
    return value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "-";
  }

  function getStatusBadge(status) {
    const config = {
      rascunho: { color: "bg-gray-100 text-gray-700", label: "Rascunho" },
      enviado: { color: "bg-blue-100 text-blue-700", label: "Enviado" },
      aprovado: { color: "bg-green-100 text-green-700", label: "Aprovado" },
      recusado: { color: "bg-red-100 text-red-700", label: "Recusado" },
      expirado: { color: "bg-orange-100 text-orange-700", label: "Expirado" },
    };
    const current = config[status] || config.rascunho;
    return <Badge className={current.color}>{current.label}</Badge>;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-b-4 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Calculator className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Orcamentos</h1>
              <p className="mt-1 text-sm text-gray-600">Geracao de orcamentos para servicos</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to={createPageUrl("HistoricoOrcamentos")}>
              <Button variant="outline">
                <History className="mr-2 h-4 w-4" />
                Historico
              </Button>
            </Link>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Novo Orcamento
            </Button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total", val: orcamentos.length, color: "text-blue-600", border: "border-blue-200" },
            { label: "Aprovados", val: orcamentos.filter((item) => item.status === "aprovado").length, color: "text-green-600", border: "border-green-200" },
            { label: "Enviados", val: orcamentos.filter((item) => item.status === "enviado").length, color: "text-orange-600", border: "border-orange-200" },
            { label: "Rascunhos", val: orcamentos.filter((item) => item.status === "rascunho").length, color: "text-gray-600", border: "border-gray-200" },
          ].map((stat) => (
            <Card key={stat.label} className={`bg-white ${stat.border}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.val}</p>
                </div>
                <FileText className={`h-10 w-10 ${stat.color} opacity-60`} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Orcamentos Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orcamentos.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">Nenhum orcamento criado</p>
                <Button onClick={() => { resetForm(); setShowModal(true); }} className="mt-4 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Primeiro Orcamento
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {orcamentos.slice(0, 10).map((orcamento) => (
                  <div key={orcamento.id} className="rounded-lg bg-gray-50 p-4 transition-colors hover:bg-gray-100">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {orcamento.caes?.length || 0} cao(es) • {formatDate(orcamento.data_criacao)}
                          </p>
                          <p className="text-sm text-gray-500">Validade: {formatDate(orcamento.data_validade)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-lg font-bold text-green-600">{formatCurrency(orcamento.valor_total)}</span>
                        {getStatusBadge(orcamento.status)}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-0 text-xs text-gray-500 sm:pl-13">
                      <span>Hospedagem: {formatCurrency(orcamento.subtotal_hospedagem)}</span>
                      <span>•</span>
                      <span>Servicos: {formatCurrency(orcamento.subtotal_servicos)}</span>
                      <span>•</span>
                      <span>Transporte: {formatCurrency(orcamento.subtotal_transporte)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="flex max-h-[95vh] w-[98vw] max-w-[1100px] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              {etapa === "cliente" && "Novo Orcamento - Selecione o Cliente"}
              {etapa === "caes" && "Novo Orcamento - Servicos por Cao"}
              {etapa === "resumo" && "Novo Orcamento - Revisao Final"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Fluxo de criacao de orcamento com busca ampla por destinatario financeiro, responsavel e cao.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b border-gray-100 px-1 py-2">
            {[
              { id: "cliente", label: "1. Cliente" },
              { id: "caes", label: "2. Servicos" },
              { id: "resumo", label: "3. Revisao" },
            ].map((step, index) => (
              <React.Fragment key={step.id}>
                <div className={`rounded-full px-3 py-1 text-xs font-medium ${etapa === step.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {step.label}
                </div>
                {index < 2 && <div className="h-px flex-1 bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>

          {etapa === "cliente" && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="text-sm text-gray-600">Selecione o cliente ou pule para criar orcamento avulso.</p>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Buscar por responsavel financeiro, responsavel, cao, CPF/CNPJ ou celular..."
                  value={searchCliente}
                  onChange={(event) => setSearchCliente(event.target.value)}
                  className="pl-9"
                />
              </div>

              {exigeConfirmacaoDestinatario && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm text-amber-700">
                    Encontramos mais de um destinatario financeiro para esta busca. Confirme para quem o orcamento sera destinado.
                  </p>
                </div>
              )}

              <div className="max-h-[45vh] space-y-2 overflow-y-auto">
                {clientesFiltrados.slice(0, 20).map((resultado) => {
                  const { cliente, dogsDoCliente, responsaveisDoCliente, destaqueBusca } = resultado;
                  const numCaes = dogsDoCliente.length;
                  const selected = clienteSelecionado?.id === cliente.id;

                  return (
                    <div
                      key={cliente.id}
                      onClick={() => setClienteSelecionado((prev) => prev?.id === cliente.id ? null : cliente)}
                      className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{cliente.nome_razao_social}</p>
                          {destaqueBusca ? (
                            <p className="mt-1 text-xs text-blue-700">{destaqueBusca}</p>
                          ) : null}
                          {dogsDoCliente.length > 0 ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Caes: {dogsDoCliente.map((dog) => dog.nome).join(", ")}
                            </p>
                          ) : null}
                          {responsaveisDoCliente.length > 0 ? (
                            <p className="mt-1 text-xs text-gray-500">
                              Responsaveis: {responsaveisDoCliente.map((responsavel) => responsavel.nome_completo).join(", ")}
                            </p>
                          ) : null}
                          <p className="text-sm text-gray-500">{cliente.celular} • {cliente.cpf_cnpj}</p>
                        </div>
                        <Badge variant="outline">{numCaes} cao(es)</Badge>
                      </div>
                    </div>
                  );
                })}
                {clientesFiltrados.length === 0 && (
                  <p className="py-8 text-center text-gray-500">Nenhum cliente encontrado</p>
                )}
              </div>

              {clienteSelecionado && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-sm text-green-700">
                    <strong>Selecionado:</strong> {clienteSelecionado.nome_razao_social}
                  </p>
                </div>
              )}
            </div>
          )}

          {etapa === "caes" && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid h-full grid-cols-1 gap-0 lg:grid-cols-3">
                <div className="space-y-4 overflow-y-auto p-4 lg:col-span-2">
                  {clienteSelecionado && (
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <DogIcon className="h-4 w-4 text-blue-600" />
                      <p className="text-sm text-blue-700">
                        Cliente: <strong>{clienteSelecionado.nome_razao_social}</strong>
                      </p>
                    </div>
                  )}

                  {caes.map((cao, index) => (
                    <OrcamentoCaoForm
                      key={index}
                      cao={cao}
                      index={index}
                      allCaes={caes}
                      dogs={getCaesDoCliente()}
                      precos={precos}
                      onUpdate={updateCao}
                      onRemove={removeCao}
                      canRemove={caes.length > 1}
                    />
                  ))}

                  <Button variant="outline" onClick={addCao} className="w-full border-dashed">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Outro Cao
                  </Button>

                  <Card className="border-gray-200 bg-white">
                    <CardContent className="p-4">
                      <Label className="text-sm font-medium">Observacoes Gerais</Label>
                      <Textarea
                        value={observacoes}
                        onChange={(event) => setObservacoes(event.target.value)}
                        placeholder="Informacoes adicionais sobre o orcamento..."
                        rows={2}
                        className="mt-2"
                      />
                    </CardContent>
                  </Card>
                </div>

                <div className="overflow-y-auto border-l border-gray-100 bg-gray-50 p-4 lg:col-span-1">
                  <OrcamentoResumo calculo={calculo} caes={caes} dogs={dogs} />
                </div>
              </div>
            </div>
          )}

          {etapa === "resumo" && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {clienteSelecionado && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <p className="mb-1 text-sm font-medium text-gray-600">Cliente</p>
                  <p className="font-semibold text-gray-900">{clienteSelecionado.nome_razao_social}</p>
                  <p className="text-sm text-gray-500">{clienteSelecionado.celular}</p>
                </div>
              )}

              <OrcamentoResumo calculo={calculo} caes={caes} dogs={dogs} />

              {observacoes && (
                <div className="rounded-lg border-l-4 border-yellow-400 bg-yellow-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-yellow-700">Observacoes</p>
                  <p className="text-sm text-gray-700">{observacoes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 border-t pt-4">
            {etapa === "cliente" && (
              <>
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
                <Button variant="outline" onClick={() => setEtapa("caes")}>Pular (sem cliente)</Button>
                <Button onClick={() => setEtapa("caes")} className="bg-blue-600 text-white hover:bg-blue-700">
                  {clienteSelecionado ? "Continuar" : "Continuar sem cliente"}
                </Button>
              </>
            )}
            {etapa === "caes" && (
              <>
                <Button variant="outline" onClick={() => setEtapa("cliente")}>Voltar</Button>
                <Button onClick={() => setEtapa("resumo")} disabled={!calculo} className="bg-blue-600 text-white hover:bg-blue-700">
                  Ver Resumo
                </Button>
              </>
            )}
            {etapa === "resumo" && (
              <>
                <Button variant="outline" onClick={() => setEtapa("caes")}>Voltar</Button>
                <Button variant="outline" onClick={() => handleSave("rascunho")} disabled={isSaving || !calculo}>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Rascunho
                </Button>
                <Button onClick={() => handleSave("enviado")} disabled={isSaving || !calculo} className="bg-green-600 text-white hover:bg-green-700">
                  <Send className="mr-2 h-4 w-4" />
                  {isSaving ? "Salvando..." : "Enviar Orcamento"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
