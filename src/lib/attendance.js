const DEFAULT_PRICING = {
  diaria_normal: 150,
  diaria_mensalista: 120,
  day_care_avulso_com_pacote: 110,
  day_care_avulso_sem_pacote: 125,
  day_care_avulso: 125,
  adaptacao: 0,
  pernoite: 60,
  transporte_km: 6,
  desconto_canil: 0.3,
  desconto_longa_estadia: 0.03,
};

const DEFAULT_BATH_PRICING = {
  Poodle: 60,
  "Shih Tzu": 65,
  Yorkshire: 55,
  Maltes: 60,
  "Golden Retriever": 90,
  Labrador: 85,
  "Border Collie": 80,
  "Bulldog Frances": 70,
  "Bulldog Ingles": 80,
  Pug: 55,
  "Spitz Alemao": 75,
  "Lulu da Pomerania": 70,
  "Chow Chow": 100,
  "Husky Siberiano": 95,
  "Pastor Alemao": 90,
  Rottweiler: 95,
  Beagle: 65,
  Dachshund: 50,
  Schnauzer: 70,
  "Cocker Spaniel": 75,
  SRD: 60,
  Outro: 70,
};

const DEFAULT_TOSA_HIGIENICA = {
  pequeno_baixa: 45,
  pequeno_alta: 55,
  medio_baixa: 55,
  medio_alta: 65,
  grande_baixa: 65,
  grande_alta: 80,
};

const DEFAULT_TOSA_GERAL = {
  Poodle: 80,
  "Shih Tzu": 85,
  Yorkshire: 70,
  Maltes: 80,
  "Golden Retriever": 110,
  Labrador: 100,
  "Border Collie": 95,
  "Bulldog Frances": 70,
  "Bulldog Ingles": 80,
  Pug: 60,
  "Spitz Alemao": 95,
  "Lulu da Pomerania": 90,
  "Chow Chow": 130,
  "Husky Siberiano": 120,
  "Pastor Alemao": 110,
  Rottweiler: 100,
  Beagle: 70,
  Dachshund: 55,
  Schnauzer: 85,
  "Cocker Spaniel": 95,
  SRD: 80,
  Outro: 85,
};

const DEFAULT_TOSA_DETALHADA = {
  Poodle: 120,
  "Shih Tzu": 130,
  Yorkshire: 110,
  Maltes: 120,
  "Golden Retriever": 160,
  Labrador: 150,
  "Border Collie": 140,
  "Bulldog Frances": 100,
  "Bulldog Ingles": 110,
  Pug: 90,
  "Spitz Alemao": 140,
  "Lulu da Pomerania": 130,
  "Chow Chow": 180,
  "Husky Siberiano": 170,
  "Pastor Alemao": 160,
  Rottweiler: 150,
  Beagle: 100,
  Dachshund: 80,
  Schnauzer: 120,
  "Cocker Spaniel": 140,
  SRD: 110,
  Outro: 120,
};

export const ATTENDANCE_SERVICES = [
  { id: "day_care", label: "Day Care" },
  { id: "pernoite", label: "Pernoite" },
  { id: "hospedagem", label: "Hospedagem" },
  { id: "adaptacao", label: "Adaptação" },
  { id: "banho", label: "Banho" },
  { id: "tosa", label: "Tosa" },
  { id: "transporte", label: "Transporte" },
  { id: "adestramento", label: "Adestramento" },
];

export const MANUAL_REGISTRADOR_SERVICES = ATTENDANCE_SERVICES.filter((service) =>
  ["day_care", "hospedagem", "banho"].includes(service.id)
);

export const MEAL_CONSUMPTION_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "20_40", label: "20% a 40%" },
  { value: "40_60", label: "40% a 60%" },
  { value: "60_80", label: "60% a 80%" },
  { value: "100", label: "100%" },
];

export function normalizeBreedName(value) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function buildPricingConfig(precosRows, empresaId) {
  const scopedRows = (precosRows || []).filter(
    (row) => row.ativo !== false && (!row.empresa_id || row.empresa_id === empresaId)
  );
  const byConfigKey = Object.fromEntries(
    scopedRows.filter((row) => row.config_key).map((row) => [row.config_key, row.valor])
  );
  const breedMap = (tipo) =>
    scopedRows
      .filter((row) => row.tipo === tipo)
      .reduce((acc, row) => {
        if (row.raca) acc[normalizeBreedName(row.raca)] = row.valor;
        return acc;
      }, {});

  return {
    diaria_normal: byConfigKey.diaria_normal ?? DEFAULT_PRICING.diaria_normal,
    diaria_mensalista: byConfigKey.diaria_mensalista ?? DEFAULT_PRICING.diaria_mensalista,
    day_care_avulso_com_pacote:
      byConfigKey.day_care_avulso_com_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_com_pacote" || row.config_key === "day_care_avulso_com_pacote"
      )?.valor ??
      DEFAULT_PRICING.day_care_avulso_com_pacote,
    day_care_avulso_sem_pacote:
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      DEFAULT_PRICING.day_care_avulso_sem_pacote,
    day_care_avulso:
      byConfigKey.day_care_avulso ??
      scopedRows.find((row) => row.tipo === "day_care_avulso" || row.config_key === "day_care_avulso")?.valor ??
      byConfigKey.day_care_avulso_sem_pacote ??
      scopedRows.find(
        (row) => row.tipo === "day_care_avulso_sem_pacote" || row.config_key === "day_care_avulso_sem_pacote"
      )?.valor ??
      DEFAULT_PRICING.day_care_avulso_sem_pacote,
    adaptacao:
      byConfigKey.adaptacao ??
      scopedRows.find((row) => row.tipo === "adaptacao" || row.config_key === "adaptacao")?.valor ??
      DEFAULT_PRICING.adaptacao,
    pernoite: byConfigKey.pernoite ?? DEFAULT_PRICING.pernoite,
    transporte_km: byConfigKey.transporte_km ?? DEFAULT_PRICING.transporte_km,
    desconto_canil: (byConfigKey.desconto_canil ?? DEFAULT_PRICING.desconto_canil * 100) / 100,
    desconto_longa_estadia:
      (byConfigKey.desconto_longa_estadia ?? DEFAULT_PRICING.desconto_longa_estadia * 100) / 100,
    banho: { ...DEFAULT_BATH_PRICING, ...breedMap("banho") },
    tosa_higienica: { ...DEFAULT_TOSA_HIGIENICA, ...breedMap("tosa_higienica") },
    tosa_geral: { ...DEFAULT_TOSA_GERAL, ...breedMap("tosa_geral") },
    tosa_detalhada: { ...DEFAULT_TOSA_DETALHADA, ...breedMap("tosa_detalhada") },
  };
}

export function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function getAppointmentMeta(appointment) {
  if (!appointment) return {};
  return safeJsonParse(appointment.metadata, {}) || {};
}

export function getManualAppointmentMonitorName(appointment) {
  const metadata = getAppointmentMeta(appointment);
  return metadata.manual_monitor_nome || metadata.monitor_nome || "";
}

export function getManualAppointmentNotice(appointment) {
  const monitorName = getManualAppointmentMonitorName(appointment);
  return monitorName ? `Agendamento realizado manualmente por "${monitorName}".` : "Agendamento realizado manualmente.";
}

export function getManualAppointmentClassificationMessage(appointment) {
  return `${getManualAppointmentNotice(appointment)} Classifique a cobrança como pacote ou avulsa.`;
}

export function getAppointmentSourceLabel(appointment) {
  if (!appointment) return "Agendamento";
  if (appointment.source_type === "manual_registrador") {
    const monitorName = getManualAppointmentMonitorName(appointment);
    return monitorName ? `Agendamento manual por "${monitorName}"` : "Agendamento manual";
  }

  const sourceLabels = {
    orcamento_aprovado: "Agendamento do orçamento",
    plano_recorrente: "Plano recorrente",
    reposicao_pacote: "Reposição do pacote",
    daycare_pernoite: "Pernoite do Day Care",
  };

  return sourceLabels[appointment.source_type] || "Agendamento";
}

export function getCheckinMealRecords(checkin) {
  if (!checkin) return [];
  const value = safeJsonParse(checkin.refeicao_registros, []);
  return Array.isArray(value) ? value : [];
}

export function getServiceLabel(serviceType) {
  return ATTENDANCE_SERVICES.find((service) => service.id === serviceType)?.label || serviceType || "-";
}

export function isApprovedOrcamentoStatus(status) {
  return String(status || "").trim().toLowerCase() === "aprovado";
}

export function isApprovedOrcamento(orcamento) {
  return Boolean(orcamento?.id) && isApprovedOrcamentoStatus(orcamento.status);
}

export function shouldIncludeAppointment(appointment, orcamentosById = {}) {
  if (!appointment) return false;
  if (appointment.source_type !== "orcamento_aprovado" && !appointment.orcamento_id) return true;

  const orcamento = appointment.orcamento_id ? orcamentosById?.[appointment.orcamento_id] : null;
  if (!orcamento) {
    return appointment.source_type !== "orcamento_aprovado";
  }

  return isApprovedOrcamentoStatus(orcamento.status);
}

export function filterAppointmentsByApprovedOrcamentos(appointments = [], orcamentosById = {}) {
  return (appointments || []).filter((appointment) => shouldIncludeAppointment(appointment, orcamentosById));
}

export function shouldIncludeLinkedRecord(record, appointmentsById = {}, orcamentosById = {}) {
  if (!record) return false;

  if (record.orcamento_id) {
    const directOrcamento = orcamentosById?.[record.orcamento_id];
    return isApprovedOrcamento(directOrcamento);
  }

  if (record.appointment_id) {
    return shouldIncludeAppointment(appointmentsById?.[record.appointment_id], orcamentosById);
  }

  return true;
}

export function getDayCareStandaloneValue(cao, precos = DEFAULT_PRICING) {
  if (cao?.day_care_plano_ativo) {
    return (
      precos?.day_care_avulso_com_pacote ??
      precos?.day_care_avulso ??
      DEFAULT_PRICING.day_care_avulso_com_pacote
    );
  }

  return (
    precos?.day_care_avulso_sem_pacote ??
    precos?.day_care_avulso ??
    DEFAULT_PRICING.day_care_avulso_sem_pacote
  );
}

export function getChargeTypeLabel(chargeType) {
  switch (chargeType) {
    case "pacote":
      return "Pacote";
    case "avulso":
      return "Avulso";
    case "orcamento":
      return "Orçamento";
    case "pendente_comercial":
      return "Pendente comercial";
    default:
      return chargeType || "Não definido";
  }
}

export function getAppointmentDateKey(appointment) {
  if (!appointment) return "";
  return (
    appointment.data_referencia ||
    appointment.date ||
    (appointment.data_hora_entrada || "").slice(0, 10) ||
    ""
  );
}

export function getAppointmentEndDateKey(appointment) {
  if (!appointment) return "";
  return (
    appointment.data_fim ||
    appointment.end_date ||
    (appointment.data_hora_saida || "").slice(0, 10) ||
    getAppointmentDateKey(appointment)
  );
}

export function doesAppointmentOccurOnDate(appointment, dateKey) {
  if (!appointment || !dateKey) return false;

  const startDateKey = getAppointmentDateKey(appointment);
  if (!startDateKey) return false;

  if (appointment.service_type !== "hospedagem") {
    return startDateKey === dateKey;
  }

  const endDateKey = getAppointmentEndDateKey(appointment) || startDateKey;
  return dateKey >= startDateKey && dateKey <= endDateKey;
}

export function getAppointmentTimeValue(appointment, type = "entrada") {
  if (!appointment) return "";
  const value =
    type === "saida"
      ? appointment.hora_saida || (appointment.data_hora_saida || "").slice(11, 16)
      : appointment.hora_entrada || appointment.time || (appointment.data_hora_entrada || "").slice(11, 16);
  return value || "";
}

export function getAppointmentStatus(appointment, activeCheckinByAppointmentId = {}) {
  if (!appointment) return "agendado";
  if (activeCheckinByAppointmentId?.[appointment.id]) return "presente";
  return appointment.status || "agendado";
}

export function buildDogOwnerIndex(carteiras = [], responsaveis = []) {
  const byDogId = {};
  const dogKeys = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `dog_id_${index}`);

  (responsaveis || []).forEach((responsavel) => {
    dogKeys.forEach((key) => {
      const dogId = responsavel?.[key];
      if (!dogId || byDogId[dogId]) return;
      byDogId[dogId] = {
        nome: responsavel.nome_completo || "Responsável",
        celular: responsavel.celular || "",
        email: responsavel.email || "",
        tipo: "responsavel",
      };
    });
  });

  (carteiras || []).forEach((cliente) => {
    dogKeys.forEach((key) => {
      const dogId = cliente?.[key];
      if (!dogId || byDogId[dogId]) return;
      byDogId[dogId] = {
        nome: cliente.nome_razao_social || "Carteira",
        celular: cliente.celular || "",
        email: cliente.email || "",
        tipo: "carteira",
        cliente_id: cliente.id,
      };
    });
  });

  return byDogId;
}

function buildSourceKey(parts) {
  return parts.filter(Boolean).join("|");
}

function combineDateTime(date, time) {
  if (!date) return null;
  const normalizedTime = (time || "09:00").slice(0, 5);
  return `${date}T${normalizedTime}:00`;
}

function calculateHospedagemCharges(cao, precos) {
  if (!cao?.hosp_data_entrada || !cao?.hosp_data_saida) {
    return null;
  }

  const entrada = new Date(cao.hosp_data_entrada);
  const saida = new Date(cao.hosp_data_saida);
  const [horaSaida] = (cao.hosp_horario_saida || "12:00").split(":").map(Number);

  let diarias = Math.round((saida.getTime() - entrada.getTime()) / 86400000);
  if (horaSaida >= 12) diarias += 1;
  diarias = Math.max(1, diarias);

  const numDayCare = (cao.hosp_datas_daycare || []).filter(Boolean).length;
  const diariasNormais = Math.max(0, diarias - numDayCare);
  const valorDiaria = cao.hosp_is_mensalista ? precos.diaria_mensalista : precos.diaria_normal;
  const subtotalDiarias = diariasNormais * valorDiaria;
  const subtotalPernoite = numDayCare * precos.pernoite;

  let descDormitorio = 0;
  if (cao.hosp_dormitório_compartilhado && (cao.hosp_dormitório_com || []).length > 0) {
    descDormitorio = subtotalDiarias * precos.desconto_canil;
  }

  let descLonga = 0;
  if (diarias > 15) {
    descLonga = (subtotalDiarias - descDormitorio) * precos.desconto_longa_estadia;
  }

  return {
    totalHospedagem: subtotalDiarias - descDormitorio - descLonga,
    totalDayCare: subtotalPernoite,
  };
}

function calculateBanhoValue(cao, dog, precos) {
  const breed = normalizeBreedName(cao?.banho_raca || dog?.raca || "Outro") || "Outro";
  return precos.banho[breed] || precos.banho.Outro || 0;
}

function calculateTosaValue(cao, dog, precos) {
  if (cao?.tosa_tipo === "higienica") {
    return precos.tosa_higienica[cao.tosa_subtipo_higienica || "pequeno_baixa"] || 50;
  }

  const breed = normalizeBreedName(cao?.banho_raca || dog?.raca || "Outro") || "Outro";
  if (cao?.tosa_tipo === "detalhada") {
    return precos.tosa_detalhada[breed] || precos.tosa_detalhada.Outro || 0;
  }
  return precos.tosa_geral[breed] || precos.tosa_geral.Outro || 0;
}

function calculateAdaptacaoValue(precos) {
  return Number.parseFloat(precos?.adaptacao ?? DEFAULT_PRICING.adaptacao) || 0;
}

function inferAppointmentDate(cao, orcamento) {
  return (
    cao?.day_care_data ||
    cao?.adaptacao_data ||
    cao?.banho_data ||
    cao?.tosa_data ||
    cao?.hosp_data_entrada ||
    (cao?.transporte_viagens || []).find((viagem) => viagem?.data)?.data ||
    orcamento?.data_criacao ||
    new Date().toISOString().slice(0, 10)
  );
}

function inferChargeType(cao, serviceType) {
  switch (serviceType) {
    case "hospedagem":
      return cao?.hosp_is_mensalista ? "pacote" : "avulso";
    case "day_care":
      return "avulso";
    case "adaptacao":
      return "avulso";
    case "banho":
      return cao?.banho_do_pacote || cao?.banho_plano_ativo ? "pacote" : "avulso";
    case "tosa":
      return cao?.tosa_do_pacote || cao?.tosa_plano_ativo ? "pacote" : "avulso";
    case "transporte":
      return cao?.transporte_do_pacote || cao?.transporte_plano_ativo ? "pacote" : "avulso";
    default:
      return "avulso";
  }
}

export function buildAppointmentsFromOrcamento({ orcamento, dogs = [], precos, ownerByDogId = {} }) {
  if (!isApprovedOrcamentoStatus(orcamento?.status)) {
    return [];
  }

  const appointments = [];
  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));

  (orcamento?.caes || []).forEach((cao, caoIndex) => {
    if (!cao?.dog_id) return;

    const dog = dogsById[cao.dog_id];
    const owner = ownerByDogId[cao.dog_id] || {};
    const baseMeta = {
      origem_orcamento: true,
      orcamento_id: orcamento.id,
      cao_index: caoIndex,
      owner_nome: owner.nome || "",
      owner_celular: owner.celular || "",
    };

    if (cao.servicos?.hospedagem && cao.hosp_data_entrada && cao.hosp_data_saida) {
      if (cao.hosp_origem_pernoite_daycare) {
        appointments.push({
          empresa_id: orcamento.empresa_id || null,
          cliente_id: orcamento.cliente_id || owner.cliente_id || null,
          dog_id: cao.dog_id,
          orcamento_id: orcamento.id,
          service_type: "pernoite",
          status: "agendado",
          charge_type: "orcamento",
          source_type: "orcamento_aprovado",
          valor_previsto: precos.pernoite || 0,
          data_referencia: cao.hosp_data_entrada,
          data_hora_entrada: combineDateTime(cao.hosp_data_entrada, cao.hosp_horario_entrada || "19:00"),
          data_hora_saida: combineDateTime(cao.hosp_data_saida, cao.hosp_horario_saida || "11:59"),
          observacoes: orcamento.observacoes || "",
          source_key: buildSourceKey([
            "orcamento",
            orcamento.id,
            cao.dog_id,
            "pernoite",
            cao.hosp_data_entrada,
          ]),
          metadata: {
            ...baseMeta,
            servico: "pernoite",
            external_appointment_id: cao.hosp_pernoite_appointment_id || null,
            snapshot: cao,
          },
        });
        return;
      }

      const hospCharges = calculateHospedagemCharges(cao, precos);
      if (hospCharges?.totalHospedagem > 0) {
        appointments.push({
          empresa_id: orcamento.empresa_id || null,
          cliente_id: orcamento.cliente_id || owner.cliente_id || null,
          dog_id: cao.dog_id,
          orcamento_id: orcamento.id,
          service_type: "hospedagem",
          status: "agendado",
          charge_type: inferChargeType(cao, "hospedagem"),
          source_type: "orcamento_aprovado",
          valor_previsto: hospCharges.totalHospedagem,
          data_referencia: cao.hosp_data_entrada,
          data_hora_entrada: combineDateTime(cao.hosp_data_entrada, cao.hosp_horario_entrada || "09:00"),
          data_hora_saida: combineDateTime(cao.hosp_data_saida, cao.hosp_horario_saida || "12:00"),
          observacoes: orcamento.observacoes || "",
          source_key: buildSourceKey([
            "orcamento",
            orcamento.id,
            cao.dog_id,
            "hospedagem",
            cao.hosp_data_entrada,
          ]),
          metadata: {
            ...baseMeta,
            servico: "hospedagem",
            snapshot: cao,
          },
        });
      }

      (cao.hosp_datas_daycare || []).filter(Boolean).forEach((dayCareDate, dayCareIndex) => {
        appointments.push({
          empresa_id: orcamento.empresa_id || null,
          cliente_id: orcamento.cliente_id || owner.cliente_id || null,
          dog_id: cao.dog_id,
          orcamento_id: orcamento.id,
          service_type: "day_care",
          status: "agendado",
          charge_type: inferChargeType(cao, "day_care"),
          source_type: "orcamento_aprovado",
          valor_previsto: precos.pernoite || 0,
          data_referencia: dayCareDate,
          data_hora_entrada: combineDateTime(dayCareDate, "08:00"),
          data_hora_saida: combineDateTime(dayCareDate, "18:00"),
          observacoes: orcamento.observacoes || "",
          source_key: buildSourceKey([
            "orcamento",
            orcamento.id,
            cao.dog_id,
            "day_care",
            dayCareDate,
            dayCareIndex,
          ]),
          metadata: {
            ...baseMeta,
            servico: "day_care",
            snapshot: cao,
          },
        });
      });
    }

    if (cao.servicos?.day_care && cao.day_care_data) {
      const dayCareValue = getDayCareStandaloneValue(cao, precos);
      appointments.push({
        empresa_id: orcamento.empresa_id || null,
        cliente_id: orcamento.cliente_id || owner.cliente_id || null,
        dog_id: cao.dog_id,
        orcamento_id: orcamento.id,
        service_type: "day_care",
        status: "agendado",
        charge_type: "avulso",
        source_type: "orcamento_aprovado",
        valor_previsto: dayCareValue || 0,
        data_referencia: cao.day_care_data,
        data_hora_entrada: combineDateTime(cao.day_care_data, cao.day_care_horario_entrada || "08:00"),
        data_hora_saida: combineDateTime(cao.day_care_data, cao.day_care_horario_saida || "18:00"),
        observacoes: cao.day_care_observacoes || orcamento.observacoes || "",
        source_key: buildSourceKey([
          "orcamento",
          orcamento.id,
          cao.dog_id,
          "day_care_avulso",
          cao.day_care_data,
        ]),
        metadata: {
          ...baseMeta,
          servico: "day_care",
          day_care_plano_ativo: !!cao.day_care_plano_ativo,
          snapshot: cao,
        },
      });
    }

    if (cao.servicos?.adaptacao && cao.adaptacao_data) {
      appointments.push({
        empresa_id: orcamento.empresa_id || null,
        cliente_id: orcamento.cliente_id || owner.cliente_id || null,
        dog_id: cao.dog_id,
        orcamento_id: orcamento.id,
        service_type: "adaptacao",
        status: "agendado",
        charge_type: inferChargeType(cao, "adaptacao"),
        source_type: "orcamento_aprovado",
        valor_previsto: calculateAdaptacaoValue(precos),
        data_referencia: cao.adaptacao_data,
        data_hora_entrada: combineDateTime(cao.adaptacao_data, cao.adaptacao_horario_entrada || "09:00"),
        data_hora_saida: combineDateTime(cao.adaptacao_data, cao.adaptacao_horario_saida || "10:00"),
        observacoes: cao.adaptacao_observacoes || orcamento.observacoes || "",
        source_key: buildSourceKey([
          "orcamento",
          orcamento.id,
          cao.dog_id,
          "adaptacao",
          cao.adaptacao_data,
        ]),
        metadata: {
          ...baseMeta,
          servico: "adaptacao",
          adaptacao_horario_saida: cao.adaptacao_horario_saida || "",
          snapshot: cao,
        },
      });
    }

    if (cao.servicos?.banho) {
      const banhoDate = inferAppointmentDate(cao, orcamento);
      appointments.push({
        empresa_id: orcamento.empresa_id || null,
        cliente_id: orcamento.cliente_id || owner.cliente_id || null,
        dog_id: cao.dog_id,
        orcamento_id: orcamento.id,
        service_type: "banho",
        status: "agendado",
        charge_type: inferChargeType(cao, "banho"),
        source_type: "orcamento_aprovado",
        valor_previsto: calculateBanhoValue(cao, dog, precos),
        data_referencia: banhoDate,
        data_hora_entrada: combineDateTime(banhoDate, cao.banho_horario_inicio || cao.banho_horario || "09:00"),
        data_hora_saida: combineDateTime(banhoDate, cao.banho_horario_saida || ""),
        observacoes: cao.banho_observacoes || orcamento.observacoes || "",
        source_key: buildSourceKey(["orcamento", orcamento.id, cao.dog_id, "banho", banhoDate]),
        metadata: {
          ...baseMeta,
          servico: "banho",
          data_inferida: !cao.banho_data,
          snapshot: cao,
        },
      });
    }

    if (cao.servicos?.tosa && cao.tosa_tipo) {
      const tosaDate = inferAppointmentDate(cao, orcamento);
      appointments.push({
        empresa_id: orcamento.empresa_id || null,
        cliente_id: orcamento.cliente_id || owner.cliente_id || null,
        dog_id: cao.dog_id,
        orcamento_id: orcamento.id,
        service_type: "tosa",
        status: "agendado",
        charge_type: inferChargeType(cao, "tosa"),
        source_type: "orcamento_aprovado",
        valor_previsto: calculateTosaValue(cao, dog, precos),
        data_referencia: tosaDate,
        data_hora_entrada: combineDateTime(tosaDate, cao.tosa_horario_entrada || "10:00"),
        data_hora_saida: combineDateTime(tosaDate, cao.tosa_horario_saida || ""),
        observacoes: cao.tosa_obs || orcamento.observacoes || "",
        source_key: buildSourceKey(["orcamento", orcamento.id, cao.dog_id, "tosa", tosaDate]),
        metadata: {
          ...baseMeta,
          servico: "tosa",
          snapshot: cao,
        },
      });
    }

    if (cao.servicos?.transporte) {
      (cao.transporte_viagens || []).forEach((viagem, viagemIndex) => {
        if (!viagem?.data) return;
        const km = Number.parseFloat(viagem.km || 0) || 0;
        appointments.push({
          empresa_id: orcamento.empresa_id || null,
          cliente_id: orcamento.cliente_id || owner.cliente_id || null,
          dog_id: cao.dog_id,
          orcamento_id: orcamento.id,
          service_type: "transporte",
          status: "agendado",
          charge_type: inferChargeType(cao, "transporte"),
          source_type: "orcamento_aprovado",
          valor_previsto: km * (precos.transporte_km || 0),
          data_referencia: viagem.data,
          data_hora_entrada: combineDateTime(viagem.data, viagem.horario || "09:00"),
          data_hora_saida: combineDateTime(viagem.data, viagem.horario_fim || ""),
          observacoes: viagem.observacao || orcamento.observacoes || "",
          source_key: buildSourceKey([
            "orcamento",
            orcamento.id,
            cao.dog_id,
            "transporte",
            viagem.data,
            viagemIndex,
          ]),
          metadata: {
            ...baseMeta,
            servico: "transporte",
            snapshot: cao,
            viagem,
          },
        });
      });
    }

  });

  return appointments;
}

export function buildReceivablePayload({
  appointment,
  checkin,
  owner,
  dueDate,
  valueOverride,
  metadataPatch = {},
}) {
  const meta = getAppointmentMeta(appointment);
  const serviceDate = getAppointmentDateKey(appointment) || new Date().toISOString().slice(0, 10);
  return {
    empresa_id: appointment.empresa_id || checkin?.empresa_id || null,
    cliente_id: appointment.cliente_id || owner?.cliente_id || null,
    dog_id: appointment.dog_id || checkin?.dog_id || null,
    appointment_id: appointment.id,
    checkin_id: checkin?.id || null,
    orcamento_id: appointment.orcamento_id || null,
    descricao: `${getServiceLabel(appointment.service_type)} - ${checkin?.dog_nome || meta.owner_nome || "Serviço"}`,
    servico: appointment.service_type,
    valor: Number.parseFloat(valueOverride ?? appointment.valor_previsto ?? 0) || 0,
    vencimento: dueDate || serviceDate,
    status: "pendente",
    origem: appointment.source_type || "agendamento",
    tipo_agendamento: appointment.source_type === "manual_registrador" ? "agendamento_solto" : "orcamento",
    tipo_cobranca: appointment.charge_type || "avulso",
    data_prestacao: serviceDate,
    observacoes: checkin?.observacoes || appointment.observacoes || "",
    source_key: buildSourceKey(["receber", appointment.empresa_id, appointment.id, appointment.charge_type]),
    metadata: {
      ...meta,
      ...metadataPatch,
      owner_nome: owner?.nome || meta.owner_nome || "",
      owner_celular: owner?.celular || meta.owner_celular || "",
    },
  };
}
