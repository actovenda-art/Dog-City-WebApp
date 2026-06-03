update public.app_config
set value = jsonb_build_object('enabled', false),
    updated_date = now()
where key in (
  'finance.wallet_account_enabled',
  'finance.wallet_ledger_enabled',
  'finance.cockpit_v2_enabled',
  'finance.cockpit_v2_compare_enabled',
  'finance.financial_alerts_v2_enabled',
  'finance.reports_v2_enabled',
  'finance.legacy_cockpit_finance_disabled',
  'finance.payment_v2_write_enabled',
  'finance.payment_v2_reversal_enabled'
)
and empresa_id is null;

update public.app_config
set value = jsonb_build_object('enabled', true),
    updated_date = now()
where empresa_id in ('992c8aa3-8c11-44a6-87fc-0346725f4980', 'empresa_demo')
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.reports_v2_enabled',
    'finance.legacy_cockpit_finance_disabled'
  );

update public.app_config
set value = jsonb_build_object('enabled', false),
    updated_date = now()
where empresa_id in ('992c8aa3-8c11-44a6-87fc-0346725f4980', 'empresa_demo')
  and key in (
    'finance.wallet_account_enabled',
    'finance.wallet_ledger_enabled',
    'finance.payment_v2_write_enabled',
    'finance.payment_v2_reversal_enabled'
  );
