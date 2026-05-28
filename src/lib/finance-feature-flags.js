export const FINANCE_FEATURE_FLAGS = {
  walletAccountEnabled: "finance.wallet_account_enabled",
  walletLedgerEnabled: "finance.wallet_ledger_enabled",
  obligationsEnabled: "finance.obligations_enabled",
  chargesEnabled: "finance.charges_enabled",
  walletBalanceReadEnabled: "finance.wallet_balance_read_enabled",
  walletMovementsEnabled: "finance.wallet_movements_enabled",
  walletManualAdjustmentsEnabled: "finance.wallet_manual_adjustments_enabled",
};

export function getFinanceFeatureFlagValue(configs = [], key, empresaId = null) {
  const scopedConfig = (configs || []).find(
    (item) => item?.key === key && item?.empresa_id === empresaId && item?.ativo !== false,
  );
  if (scopedConfig) {
    return Boolean(scopedConfig?.value?.enabled);
  }

  const globalConfig = (configs || []).find(
    (item) => item?.key === key && (item?.empresa_id === null || item?.empresa_id === undefined) && item?.ativo !== false,
  );

  return Boolean(globalConfig?.value?.enabled);
}
