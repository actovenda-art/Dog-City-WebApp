function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function normalizeCommissionPercent(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return roundCurrency(parsed);
}

export function calculateCommissionValue({ valorBase, percentual }) {
  const base = roundCurrency(valorBase);
  const percent = normalizeCommissionPercent(percentual);
  if (base <= 0 || percent <= 0) return 0;
  return roundCurrency((base * percent) / 100);
}

export function buildCommissionSourceKey({ obrigacaoId, vendedorUserId }) {
  if (!obrigacaoId || !vendedorUserId) return "";
  return `commission|obrigacao|${obrigacaoId}|seller|${vendedorUserId}|grant`;
}

export function isCommissionEligible({ obrigacaoStatus, vendedorUserId, percentual, valorBase }) {
  return (
    String(obrigacaoStatus || "").trim().toLowerCase() === "quitada"
    && Boolean(vendedorUserId)
    && normalizeCommissionPercent(percentual) > 0
    && roundCurrency(valorBase) > 0
  );
}

export { roundCurrency as roundCommissionCurrency };
