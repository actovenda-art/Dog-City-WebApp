begin;
update public.app_config
set value = jsonb_build_object('enabled', true), updated_date = now()
where empresa_id = 'empresa_demo'
  and key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.reports_v2_enabled'
  );

select jsonb_build_object(
  'context', (
    select row_to_json(t)::jsonb
    from (
      select *
      from public.finance_cockpit_v2_context('empresa_demo', current_date - 30, current_date)
    ) t
  ),
  'summary', (
    select row_to_json(t)::jsonb
    from (
      select *
      from public.finance_cockpit_v2_summary('empresa_demo', current_date - 30, current_date)
    ) t
  ),
  'compare', (
    select jsonb_build_object(
      'rows', count(*),
      'high_severity', count(*) filter (where severity in ('alta','critica'))
    )
    from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
  ),
  'alerts', (
    select jsonb_build_object(
      'rows', count(*),
      'negative_wallets', count(*) filter (where alert_type = 'carteira_negativa'),
      'overdue_charges', count(*) filter (where alert_type = 'cobranca_vencida')
    )
    from public.finance_financial_alerts_v2('empresa_demo', current_date - 30, current_date, 100)
  )
) as pilot_parallel_result;
rollback;
