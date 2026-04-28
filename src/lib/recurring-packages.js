const PRE_CANCELLED_STATUSES = new Set(["cancelada_com_credito", "cancelada_sem_credito"]);
const CONSUMED_STATUSES = new Set(["realizada", "falta_cobrada", "cancelada_sem_credito"]);
const CREDITABLE_UNUSED_STATUSES = new Set(["prevista", "agendada", "vencida_nao_utilizada"]);

export const SESSION_STATUSES = {
  PREVISTA: "prevista",
  AGENDADA: "agendada",
  REALIZADA: "realizada",
  CANCELADA_COM_CREDITO: "cancelada_com_credito",
  CANCELADA_SEM_CREDITO: "cancelada_sem_credito",
  FALTA_COBRADA: "falta_cobrada",
  FALTA_NAO_COBRADA: "falta_nao_cobrada",
  VENCIDA_NAO_UTILIZADA: "vencida_nao_utilizada",
  CONVERTIDA_EM_CREDITO: "convertida_em_credito",
};

export function parseDateKey(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  }

  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateKey(value) {
  const date = parseDateKey(value);
  if (!date) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getMonthKey(value) {
  const date = parseDateKey(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthKey(month, year) {
  if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month)) return month;
  const parsedMonth = Number(month);
  const parsedYear = Number(year);
  if (!Number.isFinite(parsedMonth) || !Number.isFinite(parsedYear)) return "";
  return `${parsedYear}-${String(parsedMonth).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const [, year, month] = match;
  return {
    year: Number(year),
    month: Number(month),
    start: new Date(Number(year), Number(month) - 1, 1, 12, 0, 0, 0),
    end: new Date(Number(year), Number(month), 0, 12, 0, 0, 0),
  };
}

export function normalizeWeekdays(value, fallbackWeekday = null) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return normalizeWeekdays(JSON.parse(value), fallbackWeekday);
    } catch {
      return normalizeWeekdays(value.split(",").map((item) => item.trim()), fallbackWeekday);
    }
  }

  const parsedFallback = Number(fallbackWeekday);
  return Number.isInteger(parsedFallback) && parsedFallback >= 0 && parsedFallback <= 6 ? [parsedFallback] : [];
}

export function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isDateInsideRange(date, start, end) {
  if (!date) return false;
  if (start && date.getTime() < start.getTime()) return false;
  if (end && date.getTime() > end.getTime()) return false;
  return true;
}

function normalizeDateSet(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(formatDateKey).filter(Boolean));
}

function isPaused(dateKey, pauseRanges = []) {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  return (Array.isArray(pauseRanges) ? pauseRanges : []).some((range) => {
    const start = parseDateKey(range?.start_date || range?.start || range?.inicio);
    const end = parseDateKey(range?.end_date || range?.end || range?.fim);
    return isDateInsideRange(date, start, end);
  });
}

function getPackageBlockedDates(packageRecord, externalBlockedDates = [], holidays = []) {
  const metadata = normalizeMetadata(packageRecord?.metadata);
  return normalizeDateSet([
    ...(Array.isArray(packageRecord?.blocked_dates) ? packageRecord.blocked_dates : []),
    ...(Array.isArray(metadata.blocked_dates) ? metadata.blocked_dates : []),
    ...externalBlockedDates,
    ...holidays,
  ]);
}

function getPackagePauseRanges(packageRecord) {
  const metadata = normalizeMetadata(packageRecord?.metadata);
  const directRanges = Array.isArray(packageRecord?.pause_ranges) ? packageRecord.pause_ranges : [];
  const metadataRanges = Array.isArray(metadata.pause_ranges) ? metadata.pause_ranges : [];
  return [...directRanges, ...metadataRanges];
}

function getFrequencyMode(frequency) {
  const value = String(frequency || "semanal");
  if (value === "quinzenal") return "quinzenal";
  if (value === "personalizada" || value === "custom") return "personalizada";
  if (value === "mensal") return "mensal";
  return "semanal";
}

export function getPackageScheduledDates(packageRecord, monthKey, options = {}) {
  const month = parseMonthKey(monthKey);
  if (!packageRecord || !month) return [];

  const metadata = normalizeMetadata(packageRecord.metadata);
  const frequencyMode = getFrequencyMode(packageRecord.frequency);
  const customDates = normalizeDateSet([
    ...(Array.isArray(metadata.custom_dates) ? metadata.custom_dates : []),
    ...(Array.isArray(metadata.personalized_dates) ? metadata.personalized_dates : []),
  ]);
  const startDate = parseDateKey(packageRecord.start_date);
  const endDate = parseDateKey(packageRecord.end_date);
  const weekdays = normalizeWeekdays(packageRecord.weekdays, packageRecord.weekday);
  const blockedDates = getPackageBlockedDates(packageRecord, options.blockedDates, options.holidays);
  const pauseRanges = getPackagePauseRanges(packageRecord);
  const dates = [];

  if (packageRecord.status && packageRecord.status !== "ativo") return dates;
  if (startDate && startDate.getTime() > month.end.getTime()) return dates;
  if (endDate && endDate.getTime() < month.start.getTime()) return dates;

  const shouldIncludeDate = (date) => {
    const dateKey = formatDateKey(date);
    if (!isDateInsideRange(date, startDate, endDate)) return false;
    if (blockedDates.has(dateKey)) return false;
    if (isPaused(dateKey, pauseRanges)) return false;
    return true;
  };

  if (frequencyMode === "personalizada") {
    return [...customDates]
      .filter((dateKey) => getMonthKey(dateKey) === monthKey && shouldIncludeDate(parseDateKey(dateKey)))
      .sort();
  }

  for (let cursor = new Date(month.start); cursor <= month.end; cursor.setDate(cursor.getDate() + 1)) {
    const current = parseDateKey(cursor);
    if (!current || !weekdays.includes(current.getDay())) continue;
    if (!shouldIncludeDate(current)) continue;
    dates.push(formatDateKey(current));
  }

  if (frequencyMode === "quinzenal") {
    return dates.filter((_, index) => index % 2 === 0);
  }

  if (frequencyMode === "mensal") {
    return dates.slice(0, 1);
  }

  return dates;
}

export function generateMonthlySessions({ packages = [], existingSessions = [], month, year, blockedDates = [], holidays = [] } = {}) {
  const monthKey = buildMonthKey(month, year);
  const existingKeys = new Set(
    (existingSessions || [])
      .filter((session) => !session.deleted_at)
      .map((session) => [session.package_id, session.pet_id, session.service_id, formatDateKey(session.scheduled_date)].join("|")),
  );
  const sessionsToCreate = [];
  const logs = [];

  (packages || []).forEach((packageRecord) => {
    const dates = getPackageScheduledDates(packageRecord, monthKey, { blockedDates, holidays });
    dates.forEach((dateKey) => {
      const uniqueKey = [packageRecord.id, packageRecord.pet_id, packageRecord.service_id, dateKey].join("|");
      if (existingKeys.has(uniqueKey)) return;

      const session = {
        empresa_id: packageRecord.empresa_id || null,
        package_id: packageRecord.id,
        client_id: packageRecord.client_id,
        pet_id: packageRecord.pet_id,
        service_id: packageRecord.service_id,
        scheduled_date: dateKey,
        status: SESSION_STATUSES.PREVISTA,
        billing_month: monthKey,
        charged: false,
        covered_by_credit: false,
        credit_id: null,
        invoice_id: null,
        cancellation_reason: null,
        metadata: {
          generated_by: "monthly_package_generator",
          package_frequency: packageRecord.frequency,
        },
      };

      existingKeys.add(uniqueKey);
      sessionsToCreate.push(session);
      logs.push(buildAuditLog({
        empresa_id: packageRecord.empresa_id,
        action: "package_session_created",
        entity_type: "package_sessions",
        entity_id: uniqueKey,
        new_value: session,
        reason: "Geração mensal automática",
      }));
    });
  });

  return { monthKey, sessionsToCreate, logs };
}

export function getAvailableCredits(credits = [], packageRecord, referenceDate = new Date()) {
  const reference = parseDateKey(referenceDate) || parseDateKey(new Date());
  return (credits || [])
    .filter((credit) => credit.status === "disponivel")
    .filter((credit) => !packageRecord?.id || credit.package_id === packageRecord.id)
    .filter((credit) => !packageRecord?.client_id || credit.client_id === packageRecord.client_id)
    .filter((credit) => !packageRecord?.pet_id || credit.pet_id === packageRecord.pet_id)
    .filter((credit) => {
      const expiration = parseDateKey(credit.expires_at);
      return !expiration || !reference || expiration.getTime() >= reference.getTime();
    })
    .sort((left, right) => {
      const leftDate = parseDateKey(left.created_at || left.created_date || left.origin_month || "9999-12-31") || new Date(9999, 11, 31);
      const rightDate = parseDateKey(right.created_at || right.created_date || right.origin_month || "9999-12-31") || new Date(9999, 11, 31);
      return leftDate.getTime() - rightDate.getTime();
    });
}

export function getBillableSessions(sessions = [], monthKey = "") {
  return (sessions || [])
    .filter((session) => !session.deleted_at)
    .filter((session) => !monthKey || session.billing_month === monthKey)
    .filter((session) => !PRE_CANCELLED_STATUSES.has(session.status))
    .filter((session) => !session.covered_by_credit);
}

export function calculateMonthlyBilling({ packageRecord, sessions = [], credits = [], month, year, referenceDate = new Date() } = {}) {
  const monthKey = buildMonthKey(month, year);
  const monthSessions = (sessions || [])
    .filter((session) => !session.deleted_at)
    .filter((session) => session.package_id === packageRecord?.id)
    .filter((session) => session.billing_month === monthKey)
    .sort((left, right) => String(left.scheduled_date).localeCompare(String(right.scheduled_date)));
  const expectedSessions = monthSessions.length;
  const preCancelledSessions = monthSessions.filter((session) => PRE_CANCELLED_STATUSES.has(session.status)).length;
  const availableCredits = getAvailableCredits(credits, packageRecord, referenceDate);
  const creditEligibleSessions = getBillableSessions(monthSessions, monthKey);
  const creditsUsed = Math.min(availableCredits.length, creditEligibleSessions.length);
  const chargedSessions = Math.max(0, creditEligibleSessions.length - creditsUsed);
  const unitPrice = Math.max(0, Number(packageRecord?.price_per_session || 0) || 0);
  const totalAmount = Number((chargedSessions * unitPrice).toFixed(2));

  return {
    package_id: packageRecord?.id || null,
    client_id: packageRecord?.client_id || null,
    pet_id: packageRecord?.pet_id || null,
    billing_month: monthKey,
    expected_sessions: expectedSessions,
    pre_cancelled_sessions: preCancelledSessions,
    credits_used: creditsUsed,
    charged_sessions: chargedSessions,
    unit_price: unitPrice,
    total_amount: totalAmount,
    creditEligibleSessions,
    creditsToUse: availableCredits.slice(0, creditsUsed),
    sessionsToCharge: creditEligibleSessions.slice(creditsUsed),
  };
}

export function applyCreditsToSessions({ packageRecord, sessions = [], credits = [], month, year, now = new Date() } = {}) {
  const billing = calculateMonthlyBilling({ packageRecord, sessions, credits, month, year, referenceDate: now });
  const sessionUpdates = [];
  const creditUpdates = [];
  const logs = [];

  billing.creditsToUse.forEach((credit, index) => {
    const session = billing.creditEligibleSessions[index];
    if (!credit || !session) return;

    sessionUpdates.push({
      id: session.id,
      covered_by_credit: true,
      credit_id: credit.id,
      charged: false,
      metadata: {
        ...normalizeMetadata(session.metadata),
        covered_by_credit_at: now.toISOString(),
        covered_by_credit_origin_month: credit.origin_month,
      },
    });

    creditUpdates.push({
      id: credit.id,
      status: "usado",
      used_session_id: session.id,
      used_at: now.toISOString(),
    });

    logs.push(buildAuditLog({
      empresa_id: packageRecord?.empresa_id,
      action: "package_credit_used",
      entity_type: "package_credits",
      entity_id: credit.id,
      old_value: credit,
      new_value: { ...credit, status: "usado", used_session_id: session.id },
      reason: "Abatimento automático na cobrança mensal",
    }));
  });

  billing.sessionsToCharge.forEach((session) => {
    if (session.charged) return;
    sessionUpdates.push({
      id: session.id,
      charged: true,
      covered_by_credit: false,
    });
  });

  return {
    billing,
    sessionUpdates,
    creditUpdates,
    logs,
  };
}

export function cancelSession(session, { reason, withCredit = true, userId = null, now = new Date() } = {}) {
  if (!reason || !String(reason).trim()) {
    throw new Error("Informe o motivo do cancelamento.");
  }

  const status = withCredit ? SESSION_STATUSES.CANCELADA_COM_CREDITO : SESSION_STATUSES.CANCELADA_SEM_CREDITO;
  const updatedSession = {
    ...session,
    status,
    cancellation_reason: reason,
    updated_at: now.toISOString(),
  };

  return {
    session: updatedSession,
    log: buildAuditLog({
      empresa_id: session?.empresa_id,
      user_id: userId,
      action: withCredit ? "package_session_cancelled_with_credit" : "package_session_cancelled_without_credit",
      entity_type: "package_sessions",
      entity_id: session?.id,
      old_value: session,
      new_value: updatedSession,
      reason,
    }),
  };
}

export function markSessionAsCompleted(session, { userId = null, reason = "Serviço realizado", now = new Date() } = {}) {
  const updatedSession = {
    ...session,
    status: SESSION_STATUSES.REALIZADA,
    updated_at: now.toISOString(),
  };

  return {
    session: updatedSession,
    log: buildAuditLog({
      empresa_id: session?.empresa_id,
      user_id: userId,
      action: "package_session_completed",
      entity_type: "package_sessions",
      entity_id: session?.id,
      old_value: session,
      new_value: updatedSession,
      reason,
    }),
  };
}

export function markSessionAsNoShow(session, { charged = true, userId = null, reason = "Falta registrada", now = new Date() } = {}) {
  const updatedSession = {
    ...session,
    status: charged ? SESSION_STATUSES.FALTA_COBRADA : SESSION_STATUSES.FALTA_NAO_COBRADA,
    charged: !!charged,
    updated_at: now.toISOString(),
  };

  return {
    session: updatedSession,
    log: buildAuditLog({
      empresa_id: session?.empresa_id,
      user_id: userId,
      action: charged ? "package_session_no_show_charged" : "package_session_no_show_not_charged",
      entity_type: "package_sessions",
      entity_id: session?.id,
      old_value: session,
      new_value: updatedSession,
      reason,
    }),
  };
}

export function closeMonth({ packageRecord, sessions = [], credits = [], month, year, now = new Date() } = {}) {
  const monthKey = buildMonthKey(month, year);
  const existingCreditSourceIds = new Set((credits || []).map((credit) => credit.source_session_id).filter(Boolean));
  const allowCredit = packageRecord?.allow_credit_rollover !== false;
  const limit = Number.isFinite(Number(packageRecord?.credit_limit ?? packageRecord?.limite_creditos_acumulados))
    ? Number(packageRecord?.credit_limit ?? packageRecord?.limite_creditos_acumulados)
    : null;
  const currentlyAvailable = getAvailableCredits(credits, packageRecord, now).length;
  let remainingLimit = limit === null ? Number.POSITIVE_INFINITY : Math.max(0, limit - currentlyAvailable);
  const sessionUpdates = [];
  const creditsToCreate = [];
  const logs = [];

  if (!allowCredit) {
    return { monthKey, sessionUpdates, creditsToCreate, logs };
  }

  (sessions || [])
    .filter((session) => session.package_id === packageRecord?.id)
    .filter((session) => session.billing_month === monthKey)
    .filter((session) => !session.deleted_at)
    .filter((session) => session.charged || session.covered_by_credit)
    .filter((session) => CREDITABLE_UNUSED_STATUSES.has(session.status))
    .forEach((session) => {
      if (remainingLimit <= 0) return;
      if (existingCreditSourceIds.has(session.id)) return;

      const expiresAt = Number(packageRecord?.credit_expiration_months) >= 0
        ? addMonthsDate(now, Number(packageRecord.credit_expiration_months))
        : null;
      const credit = {
        empresa_id: packageRecord.empresa_id || session.empresa_id || null,
        package_id: packageRecord.id,
        client_id: packageRecord.client_id,
        pet_id: packageRecord.pet_id,
        source_session_id: session.id,
        used_session_id: null,
        origin_month: monthKey,
        status: "disponivel",
        reason: "Ficha paga e não utilizada convertida em crédito",
        expires_at: expiresAt ? formatDateKey(expiresAt) : null,
      };

      creditsToCreate.push(credit);
      sessionUpdates.push({
        id: session.id,
        status: SESSION_STATUSES.CONVERTIDA_EM_CREDITO,
      });
      logs.push(buildAuditLog({
        empresa_id: packageRecord.empresa_id,
        action: "package_session_converted_to_credit",
        entity_type: "package_sessions",
        entity_id: session.id,
        old_value: session,
        new_value: credit,
        reason: credit.reason,
      }));
      remainingLimit -= 1;
    });

  return { monthKey, sessionUpdates, creditsToCreate, logs };
}

export function buildBillingPayload(packageRecord, billing, existingBilling = null) {
  return {
    empresa_id: packageRecord?.empresa_id || null,
    package_id: packageRecord?.id,
    client_id: packageRecord?.client_id,
    pet_id: packageRecord?.pet_id,
    billing_month: billing.billing_month,
    expected_sessions: billing.expected_sessions,
    pre_cancelled_sessions: billing.pre_cancelled_sessions,
    credits_used: billing.credits_used,
    charged_sessions: billing.charged_sessions,
    unit_price: billing.unit_price,
    total_amount: Math.max(0, billing.total_amount),
    payment_status: existingBilling?.payment_status || "pendente",
    invoice_reference: existingBilling?.invoice_reference || null,
    metadata: {
      ...normalizeMetadata(existingBilling?.metadata),
      generated_by: "recurring_package_billing",
      recalculated_at: new Date().toISOString(),
    },
  };
}

export function buildAuditLog({ empresa_id = null, user_id = null, action, entity_type, entity_id, old_value = null, new_value = null, reason = "" }) {
  return {
    empresa_id,
    user_id,
    action,
    entity_type,
    entity_id: entity_id || "",
    old_value,
    new_value,
    reason,
    created_at: new Date().toISOString(),
  };
}

function addMonthsDate(value, months) {
  const date = parseDateKey(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate(), 12, 0, 0, 0);
}
