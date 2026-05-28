import {
  calculateAdaptacaoValue,
  calculateBanhoValue,
  calculateHospedagemCharges,
  calculateTosaValue,
  getDayCareStandaloneValue,
  inferAppointmentDate,
} from "./attendance.js";

function buildShadowSourceKey(parts = []) {
  return parts.filter((part) => part !== null && part !== undefined && String(part).trim() !== "").join("|");
}

function addDaysToDateKey(dateKey, days) {
  if (!dateKey) return "";
  const baseDate = new Date(`${dateKey}T12:00:00`);
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function distributeAmount(total, count) {
  const normalizedCount = Math.max(0, Number(count) || 0);
  if (!normalizedCount) return [];

  const totalCents = Math.round(roundCurrency(total) * 100);
  const baseShare = Math.floor(totalCents / normalizedCount);
  let remainder = totalCents - (baseShare * normalizedCount);

  return Array.from({ length: normalizedCount }, () => {
    const extraCent = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    return (baseShare + extraCent) / 100;
  });
}

function normalizeFinancialBehavior(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "billable_detailed") return "billable_detailed";
  if (normalized === "operational_only") return "operational_only";
  return null;
}

function isPackageLinkedService(cao, serviceType) {
  switch (serviceType) {
    case "day_care":
      return !!(cao?.day_care_do_pacote || cao?.day_care_plano_ativo);
    case "adaptacao":
      return !!(cao?.adaptacao_do_pacote || cao?.adaptacao_plano_ativo);
    case "banho":
      return !!(cao?.banho_do_pacote || cao?.banho_plano_ativo);
    case "tosa":
      return !!(cao?.tosa_do_pacote || cao?.tosa_plano_ativo);
    case "transporte":
      return !!(cao?.transporte_do_pacote || cao?.transporte_plano_ativo);
    case "hospedagem":
      return !!(cao?.hospedagem_do_pacote || cao?.hospedagem_plano_ativo || cao?.hosp_plano_ativo);
    default:
      return false;
  }
}

function getFinancialBehavior({ cao, serviceType, packageBehaviorResolver }) {
  const explicitBehavior = typeof packageBehaviorResolver === "function"
    ? normalizeFinancialBehavior(packageBehaviorResolver({ cao, serviceType }))
    : null;

  if (isPackageLinkedService(cao, serviceType)) {
    return explicitBehavior;
  }

  return explicitBehavior || "billable_detailed";
}

function createShadowItem({
  sourceKey,
  sourceGroupKey = "",
  tipoItem,
  tipoOrigem = "orcamento",
  descricao,
  serviceDate,
  dueDate,
  valorOriginal,
  valorDesconto = 0,
  valorMulta = 0,
  metadata = {},
}) {
  const normalizedOriginal = roundCurrency(valorOriginal);
  const normalizedDiscount = roundCurrency(valorDesconto);
  const normalizedMulta = roundCurrency(valorMulta);
  const normalizedFinal = roundCurrency(normalizedOriginal - normalizedDiscount + normalizedMulta);

  return {
    source_key: sourceKey,
    source_group_key: sourceGroupKey || null,
    tipo_item: tipoItem,
    tipo_origem: tipoOrigem,
    descricao,
    service_date: serviceDate,
    due_date: dueDate || serviceDate,
    valor_original: normalizedOriginal,
    valor_desconto: normalizedDiscount,
    valor_multa: normalizedMulta,
    valor_final: normalizedFinal,
    metadata,
  };
}

function buildHospedagemItems({ orcamento, cao, dog, precos, caoIndex, packageBehaviorResolver }) {
  const behavior = getFinancialBehavior({ cao, serviceType: "hospedagem", packageBehaviorResolver });
  if (behavior === null) return [];
  if (behavior === "operational_only") return [];
  if (!cao?.hosp_data_entrada || !cao?.hosp_data_saida) return [];

  if (cao.hosp_origem_pernoite_daycare) {
    return [
      createShadowItem({
        sourceKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, cao.dog_id, "pernoite", cao.hosp_data_entrada]),
        sourceGroupKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, "pernoite", cao.hosp_data_entrada]),
        tipoItem: "pernoite",
        descricao: `Pernoite - ${dog?.nome || `Cão ${caoIndex + 1}`}`,
        serviceDate: cao.hosp_data_entrada,
        dueDate: cao.hosp_data_entrada,
        valorOriginal: precos?.pernoite || 0,
        metadata: {
          dog_id: cao.dog_id,
          dog_nome: dog?.nome || "",
          cao_index: caoIndex,
          financial_behavior: behavior,
          origem_pernoite_daycare: true,
          hosp_pernoite_appointment_id: cao.hosp_pernoite_appointment_id || null,
        },
      }),
    ];
  }

  const hospCharges = calculateHospedagemCharges(cao, precos);
  if (!hospCharges) return [];

  const entrada = new Date(`${cao.hosp_data_entrada}T12:00:00`);
  const saida = new Date(`${cao.hosp_data_saida}T12:00:00`);
  const [horaSaida] = (cao.hosp_horario_saida || "12:00").split(":").map(Number);

  let diarias = Math.round((saida.getTime() - entrada.getTime()) / 86400000);
  if (horaSaida >= 12) diarias += 1;
  diarias = Math.max(1, diarias);

  const dayCareDates = (cao.hosp_datas_daycare || []).filter(Boolean);
  const dayCareSet = new Set(dayCareDates);
  const diariasNormais = Math.max(0, diarias - dayCareDates.length);
  const valorDiaria = cao.hosp_is_mensalista ? precos.diaria_mensalista : precos.diaria_normal;
  const subtotalDiarias = roundCurrency(diariasNormais * valorDiaria);
  const descDormitorio = roundCurrency(
    cao.hosp_dormitório_compartilhado && (cao.hosp_dormitório_com || []).length > 0
      ? subtotalDiarias * (precos.desconto_canil || 0)
      : 0
  );
  const descLonga = roundCurrency(
    diarias > 15
      ? (subtotalDiarias - descDormitorio) * (precos.desconto_longa_estadia || 0)
      : 0
  );

  const sharedDiscounts = distributeAmount(descDormitorio, diariasNormais);
  const longStayDiscounts = distributeAmount(descLonga, diariasNormais);

  const chargeDates = [];
  for (let index = 0; index < diarias; index += 1) {
    chargeDates.push(addDaysToDateKey(cao.hosp_data_entrada, index));
  }

  const normalDates = chargeDates.filter((dateKey) => !dayCareSet.has(dateKey)).slice(0, diariasNormais);
  const sharedDogs = [cao.dog_id, ...(cao.hosp_dormitório_com || [])].filter(Boolean).sort();

  const items = normalDates.map((dateKey, dailyIndex) =>
    createShadowItem({
      sourceKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, cao.dog_id, "hospedagem_diaria", dateKey, dailyIndex]),
      sourceGroupKey: sharedDogs.length > 1
        ? buildShadowSourceKey(["shadow", "orcamento", orcamento.id, "hospedagem_compartilhada", dateKey, sharedDogs.join(",")])
        : buildShadowSourceKey(["shadow", "orcamento", orcamento.id, "hospedagem", dateKey]),
      tipoItem: "hospedagem_diaria",
      descricao: `Hospedagem diária - ${dog?.nome || `Cão ${caoIndex + 1}`} - ${dateKey}`,
      serviceDate: dateKey,
      dueDate: dateKey,
      valorOriginal: valorDiaria,
      valorDesconto: roundCurrency((sharedDiscounts[dailyIndex] || 0) + (longStayDiscounts[dailyIndex] || 0)),
      metadata: {
        dog_id: cao.dog_id,
        dog_nome: dog?.nome || "",
        cao_index: caoIndex,
        financial_behavior: behavior,
        hosp_is_mensalista: !!cao.hosp_is_mensalista,
        hosp_dormitorio_compartilhado: !!cao.hosp_dormitório_compartilhado,
        hosp_dormitorio_com: cao.hosp_dormitório_com || [],
        shared_group_dog_ids: sharedDogs,
      },
    })
  );

  dayCareDates.forEach((dateKey, dayCareIndex) => {
    items.push(
      createShadowItem({
        sourceKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, cao.dog_id, "pernoite_daycare", dateKey, dayCareIndex]),
        sourceGroupKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, "pernoite_daycare", dateKey]),
        tipoItem: "pernoite_daycare",
        descricao: `Pernoite/Day Care vinculado - ${dog?.nome || `Cão ${caoIndex + 1}`} - ${dateKey}`,
        serviceDate: dateKey,
        dueDate: dateKey,
        valorOriginal: precos?.pernoite || 0,
        metadata: {
          dog_id: cao.dog_id,
          dog_nome: dog?.nome || "",
          cao_index: caoIndex,
          financial_behavior: behavior,
          hosp_tem_daycare_ativo: !!cao.hosp_tem_daycare_ativo,
        },
      })
    );
  });

  return items.sort((left, right) => String(left.service_date).localeCompare(String(right.service_date)));
}

function buildSimpleServiceItem({
  orcamento,
  cao,
  dog,
  caoIndex,
  serviceType,
  serviceDate,
  valorOriginal,
  descricao,
  metadata = {},
  packageBehaviorResolver,
}) {
  const behavior = getFinancialBehavior({ cao, serviceType, packageBehaviorResolver });
  if (behavior === null) return null;
  if (behavior === "operational_only") return null;

  return createShadowItem({
    sourceKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, cao.dog_id, serviceType, serviceDate]),
    sourceGroupKey: buildShadowSourceKey(["shadow", "orcamento", orcamento.id, serviceType]),
    tipoItem: serviceType,
    descricao,
    serviceDate,
    dueDate: serviceDate,
    valorOriginal,
    metadata: {
      dog_id: cao.dog_id,
      dog_nome: dog?.nome || "",
      cao_index: caoIndex,
      financial_behavior: behavior,
      ...metadata,
    },
  });
}

export function buildShadowFinanceItemsFromOrcamento({
  orcamento,
  dogs = [],
  precos = {},
  packageBehaviorResolver = null,
} = {}) {
  if (!orcamento?.id || !Array.isArray(orcamento?.caes)) return [];

  const dogsById = Object.fromEntries((dogs || []).map((dog) => [dog.id, dog]));
  const items = [];

  (orcamento.caes || []).forEach((cao, caoIndex) => {
    if (!cao?.dog_id) return;
    const dog = dogsById[cao.dog_id] || null;

    items.push(
      ...buildHospedagemItems({ orcamento, cao, dog, precos, caoIndex, packageBehaviorResolver })
    );

    if (cao.servicos?.day_care && cao.day_care_data) {
      const item = buildSimpleServiceItem({
        orcamento,
        cao,
        dog,
        caoIndex,
        serviceType: "day_care",
        serviceDate: cao.day_care_data,
        valorOriginal: getDayCareStandaloneValue(cao, precos),
        descricao: `Day Care avulso - ${dog?.nome || `Cão ${caoIndex + 1}`}`,
        metadata: {
          day_care_plano_ativo: !!cao.day_care_plano_ativo,
        },
        packageBehaviorResolver,
      });
      if (item && item.valor_final > 0) items.push(item);
    }

    if (cao.servicos?.adaptacao && cao.adaptacao_data) {
      const item = buildSimpleServiceItem({
        orcamento,
        cao,
        dog,
        caoIndex,
        serviceType: "adaptacao",
        serviceDate: cao.adaptacao_data,
        valorOriginal: calculateAdaptacaoValue(precos),
        descricao: `Adaptação - ${dog?.nome || `Cão ${caoIndex + 1}`}`,
        packageBehaviorResolver,
      });
      if (item && item.valor_final > 0) items.push(item);
    }

    if (cao.servicos?.banho) {
      const banhoDate = inferAppointmentDate(cao, orcamento);
      const item = buildSimpleServiceItem({
        orcamento,
        cao,
        dog,
        caoIndex,
        serviceType: "banho",
        serviceDate: banhoDate,
        valorOriginal: calculateBanhoValue(cao, dog, precos),
        descricao: `Banho - ${dog?.nome || `Cão ${caoIndex + 1}`}${cao.banho_do_pacote ? " - Pacote" : ""}`,
        metadata: {
          banho_do_pacote: !!cao.banho_do_pacote,
          banho_plano_ativo: !!cao.banho_plano_ativo,
        },
        packageBehaviorResolver,
      });
      if (item && item.valor_final > 0) items.push(item);
    }

    if (cao.servicos?.tosa && cao.tosa_tipo) {
      const tosaDate = inferAppointmentDate(cao, orcamento);
      const item = buildSimpleServiceItem({
        orcamento,
        cao,
        dog,
        caoIndex,
        serviceType: "tosa",
        serviceDate: tosaDate,
        valorOriginal: calculateTosaValue(cao, dog, precos),
        descricao: `Tosa - ${dog?.nome || `Cão ${caoIndex + 1}`}${cao.tosa_do_pacote ? " - Pacote" : ""}`,
        metadata: {
          tosa_tipo: cao.tosa_tipo || "",
          tosa_do_pacote: !!cao.tosa_do_pacote,
          tosa_plano_ativo: !!cao.tosa_plano_ativo,
        },
        packageBehaviorResolver,
      });
      if (item && item.valor_final > 0) items.push(item);
    }

    if (cao.servicos?.transporte) {
      (cao.transporte_viagens || []).forEach((viagem, viagemIndex) => {
        if (!viagem?.data) return;
        const km = Number.parseFloat(viagem.km || 0) || 0;
        const item = buildSimpleServiceItem({
          orcamento,
          cao,
          dog,
          caoIndex,
          serviceType: "transporte",
          serviceDate: viagem.data,
          valorOriginal: roundCurrency(km * (precos.transporte_km || 0)),
          descricao: `Transporte - ${dog?.nome || `Cão ${caoIndex + 1}`} - Viagem ${viagemIndex + 1}`,
          metadata: {
            viagem_index: viagemIndex,
            viagem,
            transporte_do_pacote: !!cao.transporte_do_pacote,
            transporte_plano_ativo: !!cao.transporte_plano_ativo,
          },
          packageBehaviorResolver,
        });
        if (item && item.valor_final > 0) {
          item.source_key = buildShadowSourceKey(["shadow", "orcamento", orcamento.id, cao.dog_id, "transporte", viagem.data, viagemIndex]);
          items.push(item);
        }
      });
    }
  });

  return items
    .filter((item) => roundCurrency(item?.valor_final) > 0)
    .sort((left, right) => {
      const byDate = String(left?.service_date || "").localeCompare(String(right?.service_date || ""));
      if (byDate !== 0) return byDate;
      return String(left?.source_key || "").localeCompare(String(right?.source_key || ""));
    });
}

export function resolveShadowChargeDueDate({ orcamento, items = [] } = {}) {
  const validDates = (items || [])
    .map((item) => item?.due_date || item?.service_date || "")
    .filter(Boolean)
    .sort();

  return (
    orcamento?.data_validade ||
    validDates[0] ||
    orcamento?.data_criacao ||
    new Date().toISOString().slice(0, 10)
  );
}
