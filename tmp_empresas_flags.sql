select key, empresa_id, value->>'enabled' as enabled
from public.app_config
where key in (
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.legacy_cockpit_finance_disabled',
  'finance.reports_v2_enabled',
  'finance.snapshots_enabled',
  'finance.financial_competence_enabled',
  'finance.wallet_account_enabled',
  'finance.wallet_ledger_enabled',
  'finance.obligations_enabled',
  'finance.charges_enabled'
)
order by empresa_id nulls first, key;
