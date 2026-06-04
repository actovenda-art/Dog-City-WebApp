export const FINANCE_FEATURE_FLAGS = {
  walletAccountEnabled: "finance.wallet_account_enabled",
  walletLedgerEnabled: "finance.wallet_ledger_enabled",
  obligationsEnabled: "finance.obligations_enabled",
  chargesEnabled: "finance.charges_enabled",
  walletBalanceReadEnabled: "finance.wallet_balance_read_enabled",
  walletMovementsEnabled: "finance.wallet_movements_enabled",
  walletManualAdjustmentsEnabled: "finance.wallet_manual_adjustments_enabled",
  walletBudgetBalanceEnabled: "finance.wallet_budget_balance_enabled",
  chronologicalConsumptionEnabled: "finance.chronological_consumption_enabled",
  allowNegativeWalletWithAuthorization: "finance.allow_negative_wallet_with_authorization",
  budgetAuthorizationEnabled: "finance.budget_authorization_enabled",
  cancellationV2Enabled: "finance.cancellation_v2_enabled",
  compensatoryCreditEnabled: "finance.compensatory_credit_enabled",
  manualCreditEnabled: "finance.manual_credit_enabled",
  cancellationPenaltyEnabled: "finance.cancellation_penalty_enabled",
  reportsV2Enabled: "finance.reports_v2_enabled",
  snapshotsEnabled: "finance.snapshots_enabled",
  financialCompetenceEnabled: "finance.financial_competence_enabled",
  commissionEnabled: "finance.commission_enabled",
  commissionVisualizationEnabled: "finance.commission_visualization_enabled",
  cockpitV2Enabled: "finance.cockpit_v2_enabled",
  cockpitV2CompareEnabled: "finance.cockpit_v2_compare_enabled",
  financialAlertsV2Enabled: "finance.financial_alerts_v2_enabled",
  legacyCockpitFinanceDisabled: "finance.legacy_cockpit_finance_disabled",
  operationalObservabilityEnabled: "finance.operational_observability_enabled",
  writeGovernanceEnabled: "finance.write_governance_enabled",
  paymentV2ContractEnabled: "finance.payment_v2_contract_enabled",
  paymentV2WriteEnabled: "finance.payment_v2_write_enabled",
  paymentV2ReversalEnabled: "finance.payment_v2_reversal_enabled",
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
