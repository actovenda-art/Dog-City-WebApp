-- Sprint 6 - Testes SQL de relatórios V2, snapshots e competência financeira
-- Pre-requisitos:
-- 1. Sprints 1 a 5 aplicadas
-- 2. supabase/supabase-schema-finance-wallet-reports-sprint6.sql aplicada

begin;

select * from public.finance_ensure_wallet_feature_flags();
select * from public.finance_ensure_wallet_read_feature_flags();
select * from public.finance_ensure_reports_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_reports_sprint6';
  v_conta_id text;
  v_snapshot record;
  v_snapshot_wallet record;
  v_delta record;
  v_count integer;
  v_total numeric(14,2);
  v_wallet_count integer;
  v_wallet_total numeric(14,2);
  v_generation_count integer;
  v_generation_total numeric(14,2);
  v_billing_count integer;
  v_billing_total numeric(14,2);
  v_services_count integer;
  v_services_total numeric(14,2);
  v_competencia text := to_char(current_date, 'YYYY-MM');
begin
  select e.id
    into v_empresa_id
  from public.empresa e
  order by e.created_date asc nulls last, e.id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 6.';
  end if;

  insert into public.carteira (
    id,
    empresa_id,
    nome_razao_social,
    ativo,
    created_date,
    updated_date
  )
  values (
    v_carteira_id,
    v_empresa_id,
    'Carteira Teste Sprint 6',
    true,
    now(),
    now()
  )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    nome_razao_social = excluded.nome_razao_social,
    updated_date = now();

  perform public.finance_backfill_carteira_conta();

  select cc.id
    into v_conta_id
  from public.carteira_conta cc
  where cc.carteira_id = v_carteira_id;

  if v_conta_id is null then
    raise exception 'Backfill nao criou carteira_conta para o teste Sprint 6.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.wallet_account_enabled',
    'finance.wallet_ledger_enabled',
    'finance.wallet_manual_adjustments_enabled'
  )
    and empresa_id = v_empresa_id;

  begin
    perform *
    from public.finance_report_generation_resources(v_empresa_id, (current_date - interval '5 day')::date, (current_date + interval '5 day')::date);
    raise exception 'Relatório V2 deveria falhar com finance.reports_v2_enabled desligada.';
  exception
    when others then
      if position('finance.reports_v2_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.reports_v2_enabled',
    'finance.snapshots_enabled',
    'finance.financial_competence_enabled'
  )
    and empresa_id = v_empresa_id;

  insert into public.serviceprovided (
    id,
    empresa_id,
    cliente_id,
    appointment_id,
    dog_id,
    service_type,
    preco,
    quantidade,
    data_utilizacao,
    valor_cobrado,
    source_type,
    source_key,
    metadata,
    created_date,
    updated_date
  )
  values
    (
      'sp_sprint6_pacote_anual',
      v_empresa_id,
      v_carteira_id,
      null,
      'dog_duque',
      'day_care',
      1000.00,
      1,
      current_date - interval '2 day',
      1000.00,
      'pacote_anual',
      'serviceprovided|pacote_anual|duque',
      jsonb_build_object('scenario', 'pacote_anual'),
      now(),
      now()
    ),
    (
      'sp_sprint6_daycare',
      v_empresa_id,
      v_carteira_id,
      null,
      'dog_duque',
      'day_care',
      120.00,
      1,
      current_date - interval '1 day',
      120.00,
      'day_care',
      'serviceprovided|daycare|duque',
      jsonb_build_object('scenario', 'daycare'),
      now(),
      now()
    ),
    (
      'sp_sprint6_hosp_shared',
      v_empresa_id,
      v_carteira_id,
      null,
      'dog_dogue',
      'hospedagem_diaria',
      250.00,
      1,
      current_date,
      250.00,
      'hospedagem',
      'serviceprovided|hosp_shared|dogue_feijuca',
      jsonb_build_object(
        'shared_group_dog_ids', jsonb_build_array('dog_dogue', 'dog_feijuca'),
        'shared_discount', 25.00
      ),
      now(),
      now()
    )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    cliente_id = excluded.cliente_id,
    valor_cobrado = excluded.valor_cobrado,
    data_utilizacao = excluded.data_utilizacao,
    metadata = excluded.metadata,
    updated_date = now();

  perform *
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint6_recebimento_40000',
    p_tipo := 'entrada_direcionada',
    p_natureza := 'entrada',
    p_origem := 'reports_test',
    p_valor := 40000.00,
    p_referencia_amigavel := 'Recebimento acumulado Sprint 6',
    p_descricao := 'Teste faturamento real acumulado',
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scenario', 'faturamento_real')
  );

  select count(*), round(coalesce(sum(valor), 0), 2)
    into v_count, v_total
  from public.finance_report_generation_resources(v_empresa_id, (current_date - interval '5 day')::date, (current_date + interval '5 day')::date);

  if v_count <> 3 or v_total <> 1370.00 then
    raise exception 'Geração de recursos deveria retornar 3 itens / R$ 1.370,00. Obtido % / %.', v_count, v_total;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
    into v_count, v_total
  from public.finance_report_real_billing(v_empresa_id, (current_date - interval '1 day')::date, (current_date + interval '1 day')::date);

  if v_count <> 1 or v_total <> 40000.00 then
    raise exception 'Faturamento real deveria retornar 1 item / R$ 40.000,00. Obtido % / %.', v_count, v_total;
  end if;

  select count(*), round(coalesce(sum(valor), 0), 2)
    into v_count, v_total
  from public.finance_report_services_provided(v_empresa_id, (current_date - interval '5 day')::date, (current_date + interval '5 day')::date);

  if v_count <> 3 or v_total <> 1370.00 then
    raise exception 'Serviços prestados deveria retornar 3 itens / R$ 1.370,00. Obtido % / %.', v_count, v_total;
  end if;

  select count(*)
    into v_count
  from public.finance_report_wallet(v_empresa_id)
  where carteira_conta_id = v_conta_id
    and saldo_atual = 40000.00;

  if v_count <> 1 then
    raise exception 'Relatório de carteira deveria refletir saldo R$ 40.000,00.';
  end if;

  select
    wallet_count,
    wallet_total,
    generation_count,
    generation_total,
    billing_count,
    billing_total,
    services_count,
    services_total
    into
      v_wallet_count,
      v_wallet_total,
      v_generation_count,
      v_generation_total,
      v_billing_count,
      v_billing_total,
      v_services_count,
      v_services_total
  from public.finance_reports_v2_summary(
    p_empresa_id := v_empresa_id,
    p_periodo_inicio := (current_date - interval '5 day')::date,
    p_periodo_fim := (current_date + interval '5 day')::date
  );

  if v_wallet_count < 1 or v_wallet_total <> 40000.00 then
    raise exception 'Resumo oficial V2 deveria refletir total de carteira R$ 40.000,00 e ao menos 1 conta.';
  end if;

  if v_generation_count <> 3 or v_generation_total <> 1370.00 then
    raise exception 'Resumo oficial V2 deveria refletir a geraÃ§Ã£o de recursos do perÃ­odo.';
  end if;

  if v_billing_count <> 1 or v_billing_total <> 40000.00 then
    raise exception 'Resumo oficial V2 deveria refletir o faturamento real do perÃ­odo.';
  end if;

  if v_services_count <> 3 or v_services_total <> 1370.00 then
    raise exception 'Resumo oficial V2 deveria refletir os serviÃ§os prestados do perÃ­odo.';
  end if;

  select *
    into v_snapshot
  from public.finance_snapshot_create(
    p_empresa_id := v_empresa_id,
    p_tipo := 'geracao_recursos',
    p_competencia := v_competencia,
    p_periodo_inicio := (current_date - interval '5 day')::date,
    p_periodo_fim := (current_date + interval '5 day')::date,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scenario', 'snapshot_geracao')
  );

  if v_snapshot.item_count <> 3 or v_snapshot.total_valor <> 1370.00 then
    raise exception 'Snapshot de geração de recursos deveria congelar 3 itens / R$ 1.370,00.';
  end if;

  select *
    into v_snapshot_wallet
  from public.finance_snapshot_create(
    p_empresa_id := v_empresa_id,
    p_tipo := 'carteira',
    p_competencia := v_competencia || '_wallet',
    p_periodo_inicio := (current_date - interval '5 day')::date,
    p_periodo_fim := (current_date + interval '5 day')::date,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scenario', 'snapshot_wallet')
  );

  if v_snapshot_wallet.total_valor <> 40000.00 then
    raise exception 'Snapshot de carteira deveria congelar saldo total R$ 40.000,00.';
  end if;

  select *
    into v_snapshot
  from public.finance_snapshot_create(
    p_empresa_id := v_empresa_id,
    p_tipo := 'geracao_recursos',
    p_competencia := v_competencia,
    p_periodo_inicio := (current_date - interval '5 day')::date,
    p_periodo_fim := (current_date + interval '5 day')::date,
    p_usuario_id := null
  );

  if v_snapshot.reused is not true then
    raise exception 'Snapshot duplicado deveria reutilizar o fechamento existente.';
  end if;

  begin
    update public.finance_snapshot
      set status = 'reutilizado'
    where id = v_snapshot.snapshot_id;
    raise exception 'finance_snapshot deveria ser imutÃ¡vel para update.';
  exception
    when others then
      if position('finance_snapshot e imutavel' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    delete from public.finance_snapshot
    where id = v_snapshot.snapshot_id;
    raise exception 'finance_snapshot deveria ser imutÃ¡vel para delete.';
  exception
    when others then
      if position('finance_snapshot e imutavel' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  insert into public.serviceprovided (
    id,
    empresa_id,
    cliente_id,
    appointment_id,
    dog_id,
    service_type,
    preco,
    quantidade,
    data_utilizacao,
    valor_cobrado,
    source_type,
    source_key,
    metadata,
    created_date,
    updated_date
  )
  values (
    'sp_sprint6_retroativo',
    v_empresa_id,
    v_carteira_id,
    null,
    'dog_duque',
    'day_care',
    300.00,
    1,
    current_date - interval '3 day',
    300.00,
    'retroativo',
    'serviceprovided|retroativo|duque',
    jsonb_build_object('scenario', 'retroativo'),
    now(),
    now()
  );

  select *
    into v_delta
  from public.finance_snapshot_compare(
    p_snapshot_id := v_snapshot.snapshot_id,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scenario', 'compare_retroativo')
  )
  where delta_kind = 'incluido'
    and entity_key = 'serviceprovided|sp_sprint6_retroativo'
  limit 1;

  if v_delta.entity_key is null or v_delta.impacto_financeiro <> 300.00 then
    raise exception 'Comparação deveria apontar inclusão retroativa de R$ 300,00.';
  end if;

  perform *
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint6_estorno_100',
    p_tipo := 'estorno_manual',
    p_natureza := 'saida',
    p_valor := 100.00,
    p_referencia_amigavel := 'Estorno retroativo Sprint 6',
    p_motivo := 'Teste de impacto em carteira',
    p_origem := 'reports_test'
  );

  select *
    into v_delta
  from public.finance_snapshot_compare(
    p_snapshot_id := v_snapshot_wallet.snapshot_id,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scenario', 'compare_estorno_wallet')
  )
  where delta_kind = 'alterado'
    and impacto_financeiro = -100.00
  limit 1;

  if v_delta.entity_key is null then
    raise exception 'Comparação da carteira deveria apontar impacto de estorno retroativo de R$ -100,00.';
  end if;

  if exists (
    select 1
    from public.carteira_reconciliacao cr
    where cr.status = 'divergente'
      and cr.carteira_conta_id = v_conta_id
  ) then
    raise exception 'Não deveria haver reconciliação divergente na Sprint 6.';
  end if;
end;
$$;

rollback;
