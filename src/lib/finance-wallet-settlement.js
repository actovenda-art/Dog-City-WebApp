function roundAmount(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getDateTimestamp(value, fallback = 0) {
  if (!value) return fallback;
  const text = String(value).trim();
  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const parsed = new Date(isoDate ? `${isoDate}T00:00:00` : text).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function buildWalletChronologicalSettlement({
  debitRows = [],
  creditRows = [],
  walletAvailableBalance = 0,
}) {
  const officialAvailableBalance = roundAmount(Math.max(Number(walletAvailableBalance || 0), 0));
  const visibleCreditTotal = roundAmount(
    (creditRows || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0),
  );
  const hasVisibleCredits = (creditRows || []).length > 0;
  const canSettle = hasVisibleCredits || officialAvailableBalance > 0;

  let remainingBudget = hasVisibleCredits ? 0 : officialAvailableBalance;
  let openDebitTotal = 0;
  let settledDebitTotal = 0;
  let paidDebitCount = 0;
  let pendingDebitCount = 0;
  let settlementBlocked = false;
  const creditsInChronologicalOrder = [...(creditRows || [])].sort((left, right) => {
    const leftDate = getDateTimestamp(left?.receivedDate);
    const rightDate = getDateTimestamp(right?.receivedDate);
    if (leftDate !== rightDate) return leftDate - rightDate;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });
  let creditCursor = 0;
  let lastAppliedCreditDate = null;

  const debitRowsById = new Map();
  const debitsInChronologicalOrder = [...(debitRows || [])].sort((left, right) => {
    const leftAppointmentDate = getDateTimestamp(left?.appointmentDate || left?.dueDate);
    const rightAppointmentDate = getDateTimestamp(right?.appointmentDate || right?.dueDate);
    if (leftAppointmentDate !== rightAppointmentDate) return leftAppointmentDate - rightAppointmentDate;

    const leftDueDate = getDateTimestamp(left?.dueDate);
    const rightDueDate = getDateTimestamp(right?.dueDate);
    if (leftDueDate !== rightDueDate) return leftDueDate - rightDueDate;

    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });

  debitsInChronologicalOrder.forEach((row) => {
    const amount = roundAmount(row?.amount || 0);
    let paymentStatus = row?.paymentStatus || "pending";
    let settlementDate = row?.settlementDate || null;

    if (canSettle) {
      if (amount <= 0) {
        paymentStatus = "paid";
        settlementDate = settlementDate || lastAppliedCreditDate || null;
      } else if (settlementBlocked) {
        paymentStatus = "pending";
      } else {
        while (remainingBudget + 0.0001 < amount && creditCursor < creditsInChronologicalOrder.length) {
          const creditRow = creditsInChronologicalOrder[creditCursor];
          remainingBudget = roundAmount(remainingBudget + Number(creditRow?.amount || 0));
          lastAppliedCreditDate = creditRow?.receivedDate || lastAppliedCreditDate || null;
          creditCursor += 1;
        }

        if (remainingBudget + 0.0001 >= amount) {
          paymentStatus = "paid";
          settlementDate = lastAppliedCreditDate || settlementDate || null;
          remainingBudget = roundAmount(remainingBudget - amount);
        } else {
          paymentStatus = "pending";
          settlementBlocked = true;
        }
      }
    }

    if (paymentStatus === "paid") {
      paidDebitCount += 1;
      settledDebitTotal = roundAmount(settledDebitTotal + amount);
    } else {
      pendingDebitCount += 1;
      openDebitTotal = roundAmount(openDebitTotal + amount);
    }

    debitRowsById.set(row.id, {
      ...row,
      paymentStatus,
      settlementDate,
      settlementRule: canSettle ? "wallet_chronological_full_only" : "source_status_fallback",
    });
  });

  return {
    debitRows: (debitRows || []).map((row) => debitRowsById.get(row.id) || row),
    availableBalance: canSettle ? roundAmount(Math.max(remainingBudget, 0)) : officialAvailableBalance,
    creditTotal: visibleCreditTotal,
    openDebitTotal,
    settledDebitTotal,
    paidDebitCount,
    pendingDebitCount,
  };
}

export function buildWalletSettlementFinancialStatus({
  debitRows = [],
  referenceDate = new Date(),
  carteiraId = null,
} = {}) {
  const reference = referenceDate instanceof Date
    ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
    : new Date(`${String(referenceDate || "").slice(0, 10)}T00:00:00`);
  const referenceTimestamp = Number.isNaN(reference.getTime()) ? Date.now() : reference.getTime();
  const pendingRows = (debitRows || []).filter((row) => row?.paymentStatus !== "paid");
  const overdueRows = pendingRows.filter((row) => {
    const dueTimestamp = getDateTimestamp(row?.dueDate, Number.POSITIVE_INFINITY);
    return dueTimestamp < referenceTimestamp;
  });
  const overdueTotal = roundAmount(
    overdueRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
  );
  const openTotal = roundAmount(
    pendingRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
  );
  const overdueDays = overdueRows.reduce((largestDelay, row) => {
    const dueTimestamp = getDateTimestamp(row?.dueDate, referenceTimestamp);
    return Math.max(largestDelay, Math.floor((referenceTimestamp - dueTimestamp) / 86400000));
  }, 0);
  const isIrregular = overdueRows.length > 0;

  return {
    carteiraId,
    label: isIrregular ? "Irregular" : "Regular",
    tone: isIrregular ? "irregular" : "regular",
    isIrregular,
    overdueCount: overdueRows.length,
    overdueDays,
    overdueTotal,
    openCount: pendingRows.length,
    openTotal,
    helper: isIrregular
      ? `${overdueRows.length} pendência(s) vencida(s) ainda não quitada(s).`
      : pendingRows.length > 0
        ? "Há débitos em aberto, mas nenhuma pendência vencida."
        : "Sem pendências financeiras em aberto.",
    message: isIrregular
      ? "Este Responsável Financeiro precisa regularizar os débitos. Entre em contato com nosso WhatsApp financeiro."
      : null,
  };
}
