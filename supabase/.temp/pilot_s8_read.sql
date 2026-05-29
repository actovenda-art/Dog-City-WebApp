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
  'compare_rows', (
    select jsonb_agg(row_to_json(t)::jsonb order by t.metric_key)
    from (
      select *
      from public.finance_cockpit_v2_compare('empresa_demo', current_date - 30, current_date)
    ) t
  ),
  'alerts', (
    select jsonb_agg(row_to_json(t)::jsonb order by t.severity, t.created_date desc)
    from (
      select *
      from public.finance_financial_alerts_v2('empresa_demo', current_date - 30, current_date, 100)
    ) t
  )
) as pilot_payload;
