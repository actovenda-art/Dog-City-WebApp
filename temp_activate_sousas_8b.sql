update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where key = 'finance.legacy_cockpit_finance_disabled'
  and empresa_id = '992c8aa3-8c11-44a6-87fc-0346725f4980';
