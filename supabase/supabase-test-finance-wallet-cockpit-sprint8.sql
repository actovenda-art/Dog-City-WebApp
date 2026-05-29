begin;

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_other_empresa_id text := 'empresa_outra_s8';
  v_carteira_id text := 'test_cockpit_carteira_s8';
  v_conta_id text := 'test_cockpit_conta_s8';
  v_obrigacao_id text := 'test_cockpit_obrigacao_s8';
  v_cobranca_id text := 'test_cockpit_cobranca_s8';
  v_transaction_id text := 'test_cockpit_transaction_s8';
  v_serviceprovided_id text := 'test_cockpit_serviceprovided_s8';
  v_snapshot_id text := 'test_cockpit_snapshot_s8';
  v_snapshot_delta_id text := 'test_cockpit_snapshot_delta_s8';
  v_cancelamento_id text := 'test_cockpit_cancelamento_s8';
  v_comissao_id text := 'test_cockpit_comissao_s8';
  v_reconciliacao_id text := 'test_cockpit_reconciliacao_s8';
  v_orphan_receber_id text := 'test_cockpit_orphan_receber_s8';
  v_other_receber_id text := 'test_cockpit_other_receber_s8';
  v_operational_receber_id text := 'test_cockpit_operational_receber_s8';
  v_operational_package_id text := 'test_cockpit_operational_package_s8';
  v_compare_pendencias record;
  v_compare_cobrancas record;
  v_context record;
  v_summary record;
  v_compare_count integer;
  v_alert_count integer;
begin
  perform public.finance_ensure_cockpit_feature_flags();

  insert into public.carteira (id, empresa_id, nome_razao_social, ativo, created_date)
  values (v_carteira_id, v_empresa_id, 'Cliente Cockpit S8', true, now())
  on conflict (id) do nothing;

  insert into public.carteira_conta (
    id, empresa_id, carteira_id, saldo_atual, ativo, lock_version, created_date, updated_date
  )
  values (
    v_conta_id, v_empresa_id, v_carteira_id, -50, true, 0, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.carteira_reconciliacao (
    id, empresa_id, carteira_conta_id, saldo_persistido, saldo_recalculado, diferenca, status, created_date
  )
  values (
    v_reconciliacao_id, v_empresa_id, v_conta_id, -50, 0, -50, 'divergente', now()
  )
  on conflict (id) do nothing;

  insert into public.obrigacao_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, tipo_origem, tipo_item, source_key,
    descricao, service_date, due_date, valor_original, valor_desconto, valor_multa, valor_final, valor_em_aberto,
    status, metadata, created_date, updated_date
  )
  values (
    v_obrigacao_id, v_empresa_id, v_carteira_id, v_conta_id, 'orcamento', 'banho', 'test_cockpit_obrigacao_source_s8',
    'Obrigação cockpit S8', current_date - 7, current_date - 3, 150, 0, 0, 150, 150,
    'vencida', '{}'::jsonb, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.cobranca_financeira (
    id, empresa_id, carteira_conta_id, status, tipo, descricao, source_key, due_date, valor_total, valor_em_aberto, created_date, updated_date
  )
  values (
    v_cobranca_id, v_empresa_id, v_conta_id, 'vencida', 'simples', 'Cobrança cockpit S8', 'test_cockpit_cobranca_source_s8', current_date - 2, 150, 150, now(), now()
  )
  on conflict (id) do nothing;

  insert into public."transaction" (
    id, referencia, valor, tipo, status, data_transacao, meta, created_date, updated_date
  )
  values (
    v_transaction_id, 'Recebimento legado S8', 200, 'entrada', 'concluida', now(), jsonb_build_object('empresa_id', v_empresa_id), now(), now()
  )
  on conflict (id) do nothing;

  insert into public.conta_receber (
    id, cliente_id, dog_id, descricao, servico, valor, vencimento, data_recebimento, status, empresa_id, created_date, updated_date
  )
  values (
    'test_cockpit_conta_receber_s8', v_carteira_id, 'dog_s8', 'Conta a receber cockpit S8', 'banho', 150, current_date - 1, null, 'pendente', v_empresa_id, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.conta_receber (
    id, cliente_id, dog_id, descricao, servico, valor, vencimento, data_recebimento, status, created_date, updated_date
  )
  values (
    v_orphan_receber_id, 'client_1', 'dog_1', 'Conta órfã cockpit S8', 'banho_tosa', 80, current_date - 5, null, 'pendente', now(), now()
  )
  on conflict (id) do nothing;

  insert into public.conta_receber (
    id, cliente_id, dog_id, descricao, servico, valor, vencimento, data_recebimento, status, empresa_id, created_date, updated_date
  )
  values (
    v_other_receber_id, 'client_2', 'dog_2', 'Conta outra empresa cockpit S8', 'hospedagem', 120, current_date - 4, null, 'pendente', v_other_empresa_id, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.recurring_packages (
    id, empresa_id, client_id, pet_id, service_id, frequency, price_per_session, start_date, status, financial_behavior, metadata, created_at, updated_at, created_date, updated_date
  )
  values (
    v_operational_package_id, v_empresa_id, v_carteira_id, 'dog_s8', 'day_care', 'semanal', 95, current_date - 20, 'ativo', 'operational_only', '{}'::jsonb, now(), now(), now(), now()
  )
  on conflict (id) do nothing;

  insert into public.conta_receber (
    id, cliente_id, dog_id, descricao, servico, valor, vencimento, data_recebimento, status, empresa_id, created_date, updated_date
  )
  values (
    v_operational_receber_id, v_carteira_id, 'dog_s8', 'Conta pacote operacional cockpit S8', 'day_care', 95, current_date - 6, null, 'pendente', v_empresa_id, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.serviceprovided (
    id, empresa_id, cliente_id, dog_id, service_type, preco, valor_cobrado, quantidade, data_utilizacao, created_date, updated_date
  )
  values (
    v_serviceprovided_id, v_empresa_id, v_carteira_id, 'dog_s8', 'hospedagem', 125, 125, 1, current_date - 1, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.comissao_evento (
    id, empresa_id, vendedor_user_id, obrigacao_id, produto_servico, origem, percentual, valor_base, valor_comissao, valor_estornado,
    status, source_key, data_venda, data_pagamento, data_comissao, created_date, updated_date
  )
  values (
    v_comissao_id, v_empresa_id, 'seller_s8', v_obrigacao_id, 'Hospedagem compartilhada', 'orcamento', 2, 125, 2.5, 2.5,
    'estornada', 'test_cockpit_comissao_source_s8', now(), now(), now(), now(), now()
  )
  on conflict (id) do nothing;

insert into public.cancelamento_financeiro (
    id, empresa_id, carteira_conta_id, obrigacao_id, origem_cancelamento, aplicar_multa, percentual_multa, valor_multa,
    gerar_credito_compensatorio, valor_credito_compensatorio, source_key, status, motivo, usuario_id, created_date, updated_date
  )
  values (
    v_cancelamento_id, v_empresa_id, v_conta_id, v_obrigacao_id, 'dogcity', false, 0, 0,
    true, 50, 'test_cockpit_cancelamento_source_s8', 'processado', 'Cancelamento com crédito compensatório S8', 'user_s8', now(), now()
  )
  on conflict (id) do nothing;

  insert into public.finance_snapshot (
    id, empresa_id, competencia, periodo_inicio, periodo_fim, tipo, status, source_key, hash_checksum, payload, lock_version, created_date, updated_date
  )
  values (
    v_snapshot_id, v_empresa_id, to_char(current_date, 'YYYY-MM'), current_date - 30, current_date, 'faturamento_real',
    'fechado', 'test_snapshot_source_s8', 'mock_hash_s8',
    jsonb_build_object('summary', jsonb_build_object('count', 1, 'total_valor', 200), 'items', '[]'::jsonb),
    0, now(), now()
  )
  on conflict (id) do nothing;

  insert into public.finance_snapshot_delta (
    id, snapshot_id, comparison_run_id, empresa_id, competencia, tipo, delta_kind, entity_key, entity_label,
    valor_anterior, valor_atual, impacto_financeiro, payload_before, payload_after, created_date
  )
  values (
    v_snapshot_delta_id, v_snapshot_id, 'comparison_s8', v_empresa_id, to_char(current_date, 'YYYY-MM'), 'faturamento_real',
    'alterado', 'delta_s8', 'Delta relevante S8', 0, 200, 200, '{}'::jsonb, '{}'::jsonb, now()
  )
  on conflict (id) do nothing;

  update public.app_config
  set value = jsonb_build_object('enabled', false), updated_date = now()
  where key in (
    'finance.cockpit_v2_enabled',
    'finance.cockpit_v2_compare_enabled',
    'finance.financial_alerts_v2_enabled',
    'finance.legacy_cockpit_finance_disabled',
    'finance.reports_v2_enabled',
    'finance.financial_competence_enabled'
  )
    and empresa_id = v_empresa_id;

  begin
    perform * from public.finance_cockpit_v2_summary(v_empresa_id, current_date - 30, current_date);
    raise exception 'finance.cockpit_v2_enabled deveria bloquear o summary.';
  exception
    when others then
      if position('finance.cockpit_v2_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.cockpit_v2_enabled', 'finance.cockpit_v2_compare_enabled', 'finance.financial_alerts_v2_enabled', 'finance.reports_v2_enabled', 'finance.financial_competence_enabled')
    and empresa_id = v_empresa_id;

  select * into v_context
  from public.finance_cockpit_v2_context(v_empresa_id, current_date - 30, current_date);

  if v_context.cockpit_v2_enabled is distinct from true then
    raise exception 'finance.cockpit_v2_context deveria refletir cockpit_v2_enabled = true.';
  end if;

  select * into v_summary
  from public.finance_cockpit_v2_summary(v_empresa_id, current_date - 30, current_date);

  if round(coalesce(v_summary.faturamento_real_total, 0), 2) < 0 then
    raise exception 'Resumo V2 retornou faturamento real inválido.';
  end if;

  select count(*) into v_compare_count
  from public.finance_cockpit_v2_compare(v_empresa_id, current_date - 30, current_date);

  if v_compare_count < 7 then
    raise exception 'Comparativo legado vs V2 deveria retornar pelo menos 7 linhas métricas.';
  end if;

  select * into v_compare_pendencias
  from public.finance_cockpit_v2_compare(v_empresa_id, current_date - 30, current_date)
  where metric_key = 'saldo_pendencias';

  if round(coalesce(v_compare_pendencias.difference_value, 0), 2) <> 0 then
    raise exception 'Saldo/Pendências deveria excluir órfãos, outra empresa e operational_only do comparativo real.';
  end if;

  select * into v_compare_cobrancas
  from public.finance_cockpit_v2_compare(v_empresa_id, current_date - 30, current_date)
  where metric_key = 'cobrancas_abertas_vencidas';

  if round(coalesce(v_compare_cobrancas.difference_value, 0), 2) <> 0 then
    raise exception 'Cobranças abertas/vencidas deveria excluir órfãos, outra empresa e operational_only do comparativo real.';
  end if;

  select count(*) into v_alert_count
  from public.finance_financial_alerts_v2(v_empresa_id, current_date - 30, current_date, 100);

  if v_alert_count < 5 then
    raise exception 'Alertas V2 deveriam retornar múltiplos alertas auditáveis.';
  end if;

  raise notice 'Sprint 8 SQL tests passed.';
end;
$$;

rollback;
