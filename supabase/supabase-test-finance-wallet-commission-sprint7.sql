begin;

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_conta_id text := 'test_commission_conta_s7';
  v_carteira_id text := 'test_commission_carteira_s7';
  v_orcamento_id text := 'test_commission_orcamento_s7';
  v_obrigacao_id text := 'test_commission_obrigacao_s7';
  v_partial_id text := 'test_commission_partial_s7';
  v_plan_id text := 'test_commission_plan_s7';
  v_package_id text := 'test_commission_package_s7';
  v_seller_id text := 'test_commission_seller_s7';
  v_result record;
  v_count integer;
begin
  perform public.finance_ensure_commission_feature_flags();

  insert into public.serviceproviders (id, empresa_id, nome, ativo, created_date)
  values (v_seller_id, v_empresa_id, 'Vendedor Teste S7', true, now())
  on conflict (id) do nothing;

  insert into public.carteira (id, empresa_id, nome_razao_social, ativo, created_date)
  values (v_carteira_id, v_empresa_id, 'Cliente Comissão S7', true, now())
  on conflict (id) do nothing;

  insert into public.carteira_conta (id, empresa_id, carteira_id, saldo_atual, ativo, lock_version, created_date, updated_date)
  values (v_conta_id, v_empresa_id, v_carteira_id, 0, true, 0, now(), now())
  on conflict (id) do nothing;

  insert into public.orcamento (id, empresa_id, cliente_id, valor_total, status, vendedor_user_id, commission_percentual, data_criacao, data_validade, created_date)
  values (v_orcamento_id, v_empresa_id, v_carteira_id, 100, 'aprovado', v_seller_id, 2, current_date, (current_date + 7), now())
  on conflict (id) do update
  set vendedor_user_id = excluded.vendedor_user_id,
      commission_percentual = excluded.commission_percentual;

  insert into public.plan_config (id, empresa_id, client_id, carteira_id, client_name, dog_id, service, frequency, monthly_value, due_day, renovacao_dia, vendedor_user_id, commission_percentual, created_date)
  values (v_plan_id, v_empresa_id, v_carteira_id, v_carteira_id, 'Cliente Comissão S7', 'dog_plan_s7', 'day_care', 'mensal', 1000, 10, 10, v_seller_id, 2, now())
  on conflict (id) do nothing;

  insert into public.recurring_packages (
    id, empresa_id, client_id, pet_id, service_id, frequency, financial_behavior, status, start_date,
    vendedor_user_id, commission_percentual, metadata, created_at
  )
  values (
    v_package_id, v_empresa_id, v_carteira_id, 'dog_plan_s7', 'day_care', 'mensal', 'operational_only', 'ativo', current_date,
    v_seller_id, 2, jsonb_build_object('plan_config_id', v_plan_id), now()
  )
  on conflict (id) do nothing;

  insert into public.obrigacao_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, orcamento_id, tipo_origem, tipo_item, source_key,
    descricao, service_date, due_date, valor_original, valor_desconto, valor_multa, valor_final, valor_em_aberto,
    status, metadata, created_date, updated_date
  )
  values (
    v_obrigacao_id, v_empresa_id, v_carteira_id, v_conta_id, v_orcamento_id, 'orcamento', 'banho', 'commission|obrigacao|quitada',
    'Banho comissão', current_date, current_date, 100, 0, 0, 100, 0,
    'quitada', '{}'::jsonb, now(), now()
  )
  on conflict (empresa_id, source_key) do nothing;

  insert into public.obrigacao_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, recurring_package_id, tipo_origem, tipo_item, source_key,
    descricao, service_date, due_date, valor_original, valor_desconto, valor_multa, valor_final, valor_em_aberto,
    status, metadata, created_date, updated_date
  )
  values (
    v_partial_id, v_empresa_id, v_carteira_id, v_conta_id, v_package_id, 'pacote', 'day_care', 'commission|obrigacao|partial',
    'Day Care parcial', current_date, current_date, 300, 0, 0, 300, 150,
    'parcial', '{}'::jsonb, now(), now()
  )
  on conflict (empresa_id, source_key) do nothing;

  update public.app_config
  set value = jsonb_build_object('enabled', false), updated_date = now()
  where key in ('finance.commission_enabled', 'finance.commission_visualization_enabled')
    and empresa_id = v_empresa_id;

  begin
    perform * from public.finance_process_commission_for_obrigacao(v_obrigacao_id, now(), null, '{}'::jsonb);
    raise exception 'finance.commission_enabled deveria bloquear a geração de comissão.';
  exception
    when others then
      if position('finance.commission_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.commission_enabled', 'finance.commission_visualization_enabled')
    and empresa_id = v_empresa_id;

  select * into v_result
  from public.finance_process_commission_for_obrigacao(v_partial_id, now(), null, '{}'::jsonb);
  if v_result.skipped is distinct from true or v_result.skip_reason <> 'obligation_not_paid' then
    raise exception 'Obrigação parcial deveria apenas ser ignorada na comissão.';
  end if;

  select * into v_result
  from public.finance_process_commission_for_obrigacao(v_obrigacao_id, now(), null, '{}'::jsonb);
  if v_result.skipped is distinct from false or v_result.reused is distinct from false then
    raise exception 'Obrigação quitada deveria gerar comissão nova.';
  end if;
  if round(coalesce(v_result.valor_comissao, 0), 2) <> 2.00 then
    raise exception 'Comissão esperada de 2,00 para base 100 com 2%%.';
  end if;

  select count(*) into v_count
  from public.comissao_evento ce
  where ce.empresa_id = v_empresa_id
    and ce.obrigacao_id = v_obrigacao_id;
  if v_count <> 1 then
    raise exception 'A obrigação quitada deveria gerar exatamente 1 comissao_evento, encontrado(s): %.', v_count;
  end if;

  select * into v_result
  from public.finance_process_commission_for_obrigacao(v_obrigacao_id, now(), null, '{}'::jsonb);
  if v_result.reused is distinct from true then
    raise exception 'Retry deveria reutilizar o mesmo evento de comissão.';
  end if;

  perform * from public.finance_commission_read_context(v_empresa_id);
  perform * from public.finance_commission_list(v_empresa_id, null, 50);

  raise notice 'Sprint 7 SQL tests passed.';
end;
$$;

rollback;
