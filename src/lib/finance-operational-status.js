const CLOSED_RECEIVABLE_STATUSES = new Set(["pago", "quitada", "cancelado", "cancelada", "estornado", "estornada"]);

export const FINANCIAL_OPERATIONAL_ALERT_MESSAGE = "Este Responsável Financeiro precisa regularizar os débitos. Entre em contato com nosso WhatsApp financeiro.";

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;

  const isoDateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDateMatch) return isoDateMatch[1];

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function isPendingContaReceber(conta) {
  if (!conta) return false;
  if (conta.data_recebimento) return false;
  const status = String(conta.status || "pendente").toLowerCase();
  return !CLOSED_RECEIVABLE_STATUSES.has(status);
}

function resolveCarteiraId(conta) {
  return conta?.carteira_id || conta?.cliente_id || conta?.client_id || null;
}

function createDefaultStatus(carteiraId = null) {
  return {
    carteiraId,
    label: "Regular",
    tone: "regular",
    isIrregular: false,
    overdueCount: 0,
    overdueDays: 0,
    overdueTotal: 0,
    openCount: 0,
    openTotal: 0,
    helper: "Sem atraso financeiro acima de 5 dias.",
    message: null,
  };
}

export function buildFinancialOperationalStatusMap(contasReceber = [], toleranceDays = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = new Map();

  (contasReceber || []).forEach((conta) => {
    const carteiraId = resolveCarteiraId(conta);
    if (!carteiraId || !isPendingContaReceber(conta)) return;

    const dueDate = normalizeDateOnly(conta.vencimento);
    const amount = Number(conta.valor || 0);
    const bucket = grouped.get(carteiraId) || {
      overdueCount: 0,
      overdueDays: 0,
      overdueTotal: 0,
      openCount: 0,
      openTotal: 0,
    };

    bucket.openCount += 1;
    bucket.openTotal += amount;

    if (dueDate) {
      const due = new Date(`${dueDate}T00:00:00`);
      if (!Number.isNaN(due.getTime())) {
        const diffInDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
        if (diffInDays > toleranceDays) {
          bucket.overdueCount += 1;
          bucket.overdueTotal += amount;
          bucket.overdueDays = Math.max(bucket.overdueDays, diffInDays);
        }
      }
    }

    grouped.set(carteiraId, bucket);
  });

  const statuses = new Map();
  grouped.forEach((bucket, carteiraId) => {
    const isIrregular = bucket.overdueCount > 0;
    statuses.set(carteiraId, {
      carteiraId,
      label: isIrregular ? "Irregular" : "Regular",
      tone: isIrregular ? "irregular" : "regular",
      isIrregular,
      overdueCount: bucket.overdueCount,
      overdueDays: bucket.overdueDays,
      overdueTotal: bucket.overdueTotal,
      openCount: bucket.openCount,
      openTotal: bucket.openTotal,
      helper: isIrregular
        ? `Atraso superior a 5 dias em ${bucket.overdueCount} lançamento(s).`
        : bucket.openCount > 0
          ? "Há débitos em aberto, sem atraso crítico acima de 5 dias."
          : "Sem atraso financeiro acima de 5 dias.",
      message: isIrregular ? FINANCIAL_OPERATIONAL_ALERT_MESSAGE : null,
    });
  });

  return statuses;
}

export function getFinancialOperationalStatus(statusMap, carteiraId) {
  if (!carteiraId) return createDefaultStatus(null);
  return statusMap?.get?.(carteiraId) || createDefaultStatus(carteiraId);
}
