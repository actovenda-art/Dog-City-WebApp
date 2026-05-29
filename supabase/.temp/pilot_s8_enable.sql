update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where empresa_id = 'empresa_demo'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.reports_v2_enabled'
  );

update public.app_config
set value = jsonb_build_object('enabled', false), updated_date = now()
where empresa_id = 'empresa_demo'
  and key = 'finance.legacy_cockpit_finance_disabled';
