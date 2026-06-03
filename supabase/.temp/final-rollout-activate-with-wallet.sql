update public.app_config
set value = jsonb_build_object('enabled', true),
    updated_date = now()
where key in (
  'finance.wallet_account_enabled',
  'finance.wallet_balance_read_enabled',
  'finance.wallet_ledger_enabled',
  'finance.wallet_movements_enabled',
  'finance.wallet_manual_adjustments_enabled',
  'finance.manual_credit_enabled',
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.reports_v2_enabled',
  'finance.legacy_cockpit_finance_disabled',
  'finance.payment_v2_write_enabled',
  'finance.payment_v2_reversal_enabled'
);
