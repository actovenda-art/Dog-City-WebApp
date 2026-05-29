select jsonb_build_object(
  'legacy_pendencias_total_raw', (
    select coalesce(sum(case when cr.status <> 'pago' then cr.valor else 0 end), 0)
    from public.conta_receber cr
  ),
  'legacy_pendencias_empresa_demo', (
    select coalesce(sum(case when cr.status <> 'pago' then cr.valor else 0 end), 0)
    from public.conta_receber cr
    where cr.empresa_id = 'empresa_demo'
  ),
  'legacy_pendencias_empresa_demo_or_null', (
    select coalesce(sum(case when cr.status <> 'pago' then cr.valor else 0 end), 0)
    from public.conta_receber cr
    where cr.empresa_id = 'empresa_demo' or cr.empresa_id is null
  ),
  'legacy_cobrancas_raw', (
    select count(*) from public.conta_receber cr where cr.status <> 'pago'
  ),
  'legacy_cobrancas_empresa_demo', (
    select count(*) from public.conta_receber cr where cr.status <> 'pago' and cr.empresa_id = 'empresa_demo'
  ),
  'legacy_cobrancas_empresa_demo_or_null', (
    select count(*) from public.conta_receber cr where cr.status <> 'pago' and (cr.empresa_id = 'empresa_demo' or cr.empresa_id is null)
  )
) as scope_check;
