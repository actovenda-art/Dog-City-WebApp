begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_wallet_read_feature_flags();
select public.finance_ensure_reports_feature_flags();
select public.finance_ensure_commission_feature_flags();
select public.finance_ensure_cockpit_feature_flags();
select public.finance_ensure_observability_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_flow_count integer := 0;
  v_governance_count integer := 0;
  v_contract_count integer := 0;
  v_context record;
  v_reconciliation_count integer := 0;
begin
  if exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.operational_observability_enabled'
      and cfg.empresa_id is null
      and coalesce((cfg.value ->> 'enabled')::boolean, false) = true
  ) then
    raise exception 'finance.operational_observability_enabled deveria nascer desligada globalmente.';
  end if;

  if exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.write_governance_enabled'
      and cfg.empresa_id = v_empresa_id
      and coalesce((cfg.value ->> 'enabled')::boolean, false) = true
  ) then
    raise exception 'finance.write_governance_enabled deveria nascer desligada por empresa.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true),
      updated_date = now()
  where key in (
    'finance.operational_observability_enabled',
    'finance.write_governance_enabled',
    'finance.payment_v2_contract_enabled',
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.reports_v2_enabled'
  )
    and empresa_id = v_empresa_id;

  select count(*)::integer
    into v_flow_count
  from public.finance_write_flow_map(v_empresa_id);

  if v_flow_count < 8 then
    raise exception 'Mapa de fluxos da Sprint 9A deveria ter pelo menos 8 linhas, obtido %.', v_flow_count;
  end if;

  select count(*)::integer
    into v_governance_count
  from public.finance_write_governance_matrix(v_empresa_id);

  if v_governance_count < 6 then
    raise exception 'Matriz de governança da Sprint 9A deveria ter pelo menos 6 domínios, obtido %.', v_governance_count;
  end if;

  if not exists (
    select 1
    from public.finance_write_governance_matrix(v_empresa_id) gm
    where gm.dominio = 'pagamento'
      and gm.status_dominio = 'hibrido_critico'
      and gm.payment_v2_blocker = true
  ) then
    raise exception 'Domínio pagamento deveria permanecer como híbrido crítico na Sprint 9A.';
  end if;

  select count(*)::integer
    into v_contract_count
  from public.finance_payment_v2_contract(v_empresa_id);

  if v_contract_count < 6 then
    raise exception 'Contrato de Pagamento V2 deveria ter pelo menos 6 regras, obtido %.', v_contract_count;
  end if;

  select *
    into v_context
  from public.finance_operational_observability_context(v_empresa_id, current_date - 30, current_date);

  if v_context.empresa_id <> v_empresa_id then
    raise exception 'Contexto operacional deveria retornar empresa_id %, obtido %.', v_empresa_id, v_context.empresa_id;
  end if;

  if v_context.payment_write_official <> 'legado' then
    raise exception 'Fonte oficial de pagamento deveria continuar legado na Sprint 9A, obtido %.', v_context.payment_write_official;
  end if;

  select count(*)::integer
    into v_reconciliation_count
  from public.finance_operational_reconciliation_matrix(v_empresa_id, current_date - 30, current_date);

  if v_reconciliation_count < 4 then
    raise exception 'Matriz de reconciliação operacional deveria ter pelo menos 4 checks, obtido %.', v_reconciliation_count;
  end if;

  perform *
  from public.finance_hybrid_write_audit(v_empresa_id, current_date - 30, current_date, 100);
end;
$$;

rollback;
