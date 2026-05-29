-- Sprint 5 - Testes SQL de cancelamento V2, multas e creditos controlados
-- Pre-requisitos:
-- 1. Sprint 1 aplicada
-- 2. Sprint 2 aplicada
-- 3. Sprint 3 aplicada
-- 4. Sprint 4 aplicada
-- 5. supabase/supabase-schema-finance-wallet-cancellation-sprint5.sql aplicada

begin;

select *
from public.finance_ensure_wallet_feature_flags();

select *
from public.finance_ensure_wallet_read_feature_flags();

select *
from public.finance_ensure_wallet_budget_feature_flags();

select *
from public.finance_ensure_wallet_cancellation_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_cancellation_sprint5';
  v_conta_id text;
  v_orcamento_id text := 'test_orcamento_cancellation_sprint5';
  v_movimento record;
  v_cancelamento record;
  v_reconcile record;
  v_count integer;
begin
  select e.id
    into v_empresa_id
  from public.empresa e
  order by e.created_date asc nulls last, e.id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 5.';
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
    'Carteira Teste Sprint 5',
    true,
    now(),
    now()
  )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    nome_razao_social = excluded.nome_razao_social,
    updated_date = now();

  insert into public.orcamento (
    id,
    empresa_id,
    cliente_id,
    data_criacao,
    data_validade,
    valor_total,
    status,
    created_date,
    updated_date
  )
  values (
    v_orcamento_id,
    v_empresa_id,
    v_carteira_id,
    current_date,
    current_date + interval '5 day',
    500.00,
    'aprovado',
    now(),
    now()
  )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    cliente_id = excluded.cliente_id,
    valor_total = excluded.valor_total,
    status = excluded.status,
    updated_date = now();

  insert into public.appointment (
    id,
    empresa_id,
    cliente_id,
    orcamento_id,
    service_type,
    status,
    source_type,
    data_referencia,
    created_date,
    updated_date
  )
  values
    (
      'appt_dogcity_sem_credito',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'banho',
      'agendado',
      'orcamento',
      current_date + interval '1 day',
      now(),
      now()
    ),
    (
      'appt_dogcity_com_credito',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'day_care',
      'agendado',
      'orcamento',
      current_date + interval '2 day',
      now(),
      now()
    ),
    (
      'appt_cliente_sem_multa',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'tosa',
      'agendado',
      'orcamento',
      current_date + interval '3 day',
      now(),
      now()
    ),
    (
      'appt_cliente_com_multa',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'hospedagem_diaria',
      'agendado',
      'orcamento',
      current_date + interval '4 day',
      now(),
      now()
    ),
    (
      'appt_natural',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'adaptacao',
      'agendado',
      'orcamento',
      current_date + interval '5 day',
      now(),
      now()
    ),
    (
      'appt_hosp_compartilhada',
      v_empresa_id,
      v_carteira_id,
      v_orcamento_id,
      'hospedagem_diaria',
      'agendado',
      'orcamento',
      current_date + interval '6 day',
      now(),
      now()
    )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    cliente_id = excluded.cliente_id,
    orcamento_id = excluded.orcamento_id,
    service_type = excluded.service_type,
    status = excluded.status,
    source_type = excluded.source_type,
    data_referencia = excluded.data_referencia,
    updated_date = now();

  perform public.finance_backfill_carteira_conta();

  select cc.id
    into v_conta_id
  from public.carteira_conta cc
  where cc.carteira_id = v_carteira_id;

  if v_conta_id is null then
    raise exception 'Backfill nao criou carteira_conta para o teste Sprint 5.';
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
    from public.finance_wallet_admin_apply_operation(
      p_carteira_conta_id := v_conta_id,
      p_operacao_idempotencia := 'test_sprint5_credit_manual_flag_off',
      p_tipo := 'credito_manual',
      p_natureza := 'entrada',
      p_valor := 10.00,
      p_referencia_amigavel := 'Credito flag off',
      p_motivo := 'Nao deveria permitir'
    );
    raise exception 'Crédito manual deveria falhar com finance.manual_credit_enabled desligada.';
  exception
    when others then
      if position('finance.manual_credit_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    perform *
    from public.finance_process_cancellation_v2(
      p_carteira_conta_id := v_conta_id,
      p_obrigacao_id := 'missing',
      p_motivo := 'Flag desligada'
    );
    raise exception 'Cancelamento V2 deveria falhar com flag desligada.';
  exception
    when others then
      if position('finance.cancellation_v2_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.manual_credit_enabled',
    'finance.cancellation_v2_enabled',
    'finance.compensatory_credit_enabled',
    'finance.cancellation_penalty_enabled',
    'finance.allow_negative_wallet_with_authorization'
  )
    and empresa_id = v_empresa_id;

  select *
    into v_movimento
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint5_credit_manual_ok',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_valor := 500.00,
    p_referencia_amigavel := 'Crédito base Sprint 5',
    p_motivo := 'Base para cancelamentos',
    p_observacao := 'Fluxo controlado Sprint 5'
  );

  if round(v_movimento.saldo_final, 2) <> 500.00 then
    raise exception 'Saldo após crédito manual deveria ser R$ 500,00. Obtido %.', v_movimento.saldo_final;
  end if;

  select *
    into v_movimento
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint5_credit_manual_ok',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_valor := 500.00,
    p_referencia_amigavel := 'Crédito base Sprint 5',
    p_motivo := 'Base para cancelamentos'
  );

  if v_movimento.reused is not true then
    raise exception 'Idempotência do crédito manual deveria reutilizar o movimento.';
  end if;

  insert into public.obrigacao_financeira (
    id,
    empresa_id,
    carteira_id,
    carteira_conta_id,
    orcamento_id,
    appointment_id,
    tipo_origem,
    tipo_item,
    source_key,
    descricao,
    service_date,
    due_date,
    valor_original,
    valor_final,
    valor_em_aberto,
    status,
    metadata,
    created_date,
    updated_date
  )
  values
    (
      'test_obrigacao_dogcity_sem_credito_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_dogcity_sem_credito',
      'shadow',
      'banho',
      'shadow|dogcity|sem_credito',
      'Banho sem crédito',
      current_date + interval '1 day',
      current_date + interval '1 day',
      100.00,
      100.00,
      100.00,
      'aberta',
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      'test_obrigacao_dogcity_com_credito_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_dogcity_com_credito',
      'shadow',
      'day_care',
      'shadow|dogcity|com_credito',
      'Day care com crédito compensatório',
      current_date + interval '2 day',
      current_date + interval '2 day',
      120.00,
      120.00,
      120.00,
      'aberta',
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      'test_obrigacao_cliente_sem_multa_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_cliente_sem_multa',
      'shadow',
      'tosa',
      'shadow|cliente|sem_multa',
      'Tosa cancelada sem multa',
      current_date + interval '3 day',
      current_date + interval '3 day',
      90.00,
      90.00,
      90.00,
      'aberta',
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      'test_obrigacao_cliente_com_multa_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_cliente_com_multa',
      'shadow',
      'hospedagem_diaria',
      'shadow|cliente|com_multa',
      'Hospedagem com parcial paga',
      current_date + interval '4 day',
      current_date + interval '4 day',
      100.00,
      100.00,
      40.00,
      'parcial',
      jsonb_build_object('scenario', 'partial_paid'),
      now(),
      now()
    ),
    (
      'test_obrigacao_natural_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_natural',
      'shadow',
      'adaptacao',
      'shadow|natural',
      'Adaptação futura',
      current_date + interval '5 day',
      current_date + interval '5 day',
      40.00,
      40.00,
      40.00,
      'aberta',
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      'test_obrigacao_hosp_compartilhada_sprint5',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'appt_hosp_compartilhada',
      'shadow',
      'hospedagem_diaria',
      'shadow|hospedagem_compartilhada|2026-05-20|dog_dogue,dog_feijuca',
      'Hospedagem compartilhada Dogue + Feijuca',
      current_date + interval '6 day',
      current_date + interval '6 day',
      125.00,
      125.00,
      45.00,
      'parcial',
      jsonb_build_object(
        'shared_group_dog_ids', jsonb_build_array('dog_dogue', 'dog_feijuca'),
        'shared_discount', 25.00
      ),
      now(),
      now()
    )
  on conflict (id) do update
  set
    valor_em_aberto = excluded.valor_em_aberto,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_date = now();

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_dogcity_sem_credito_sprint5',
    p_origem_cancelamento := 'dogcity',
    p_motivo := 'Falha operacional sem crédito',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 0.00 then
    raise exception 'DogCity sem crédito não deveria gerar crédito.';
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_dogcity_com_credito_sprint5',
    p_origem_cancelamento := 'dogcity',
    p_gerar_credito_compensatorio := true,
    p_valor_credito_compensatorio := 30.00,
    p_motivo := 'Falha operacional com crédito',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 30.00 then
    raise exception 'DogCity com crédito deveria gerar R$ 30,00. Obtido %.', v_cancelamento.valor_credito_gerado;
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_cliente_sem_multa_sprint5',
    p_origem_cancelamento := 'cliente',
    p_motivo := 'Cliente desistiu sem pagamento',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 0.00 or round(v_cancelamento.valor_multa_gerado, 2) <> 0.00 then
    raise exception 'Cliente sem multa e sem pagamento não deveria gerar crédito ou multa.';
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_cliente_com_multa_sprint5',
    p_origem_cancelamento := 'cliente',
    p_aplicar_multa := true,
    p_percentual_multa := 25.00,
    p_motivo := 'Cliente cancelou com multa',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 60.00 then
    raise exception 'Cliente com parcial paga deveria gerar crédito de R$ 60,00. Obtido %.', v_cancelamento.valor_credito_gerado;
  end if;

  if round(v_cancelamento.valor_multa_gerado, 2) <> 25.00 then
    raise exception 'Cliente com multa deveria gerar R$ 25,00. Obtido %.', v_cancelamento.valor_multa_gerado;
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_natural_sprint5',
    p_origem_cancelamento := 'natural',
    p_motivo := 'Evento natural',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 0.00 or round(v_cancelamento.valor_multa_gerado, 2) <> 0.00 then
    raise exception 'Cancelamento natural não deveria gerar crédito ou multa.';
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_hosp_compartilhada_sprint5',
    p_origem_cancelamento := 'cliente',
    p_aplicar_multa := true,
    p_percentual_multa := 20.00,
    p_motivo := 'Cancelamento parcial de hospedagem compartilhada',
    p_usuario_id := null
  );

  if round(v_cancelamento.valor_credito_gerado, 2) <> 80.00 then
    raise exception 'Hospedagem compartilhada parcial deveria devolver R$ 80,00. Obtido %.', v_cancelamento.valor_credito_gerado;
  end if;

  if round(v_cancelamento.valor_multa_gerado, 2) <> 25.00 then
    raise exception 'Hospedagem compartilhada parcial deveria gerar multa de R$ 25,00. Obtido %.', v_cancelamento.valor_multa_gerado;
  end if;

  select *
    into v_cancelamento
  from public.finance_process_cancellation_v2(
    p_carteira_conta_id := v_conta_id,
    p_obrigacao_id := 'test_obrigacao_hosp_compartilhada_sprint5',
    p_origem_cancelamento := 'cliente',
    p_aplicar_multa := true,
    p_percentual_multa := 20.00,
    p_motivo := 'Cancelamento parcial de hospedagem compartilhada',
    p_usuario_id := null
  );

  if v_cancelamento.reused is not true then
    raise exception 'Cancelamento V2 deveria ser idempotente para a mesma obrigação/origem.';
  end if;

  begin
    update public.carteira_movimento
    set descricao = 'Nao permitido'
    where operacao_idempotencia = 'test_sprint5_credit_manual_ok';
    raise exception 'UPDATE em carteira_movimento deveria ser bloqueado.';
  exception
    when others then
      if position('imut' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;

  begin
    delete from public.carteira_movimento
    where operacao_idempotencia = 'test_sprint5_credit_manual_ok';
    raise exception 'DELETE em carteira_movimento deveria ser bloqueado.';
  exception
    when others then
      if position('imut' in lower(sqlerrm)) = 0 then
        raise;
      end if;
  end;

  select *
    into v_reconcile
  from public.finance_reconcile_wallet_account(
    p_carteira_conta_id := v_conta_id,
    p_usuario_id := null
  );

  if v_reconcile.out_status <> 'ok' then
    raise exception 'A reconciliação final deveria estar ok. Obtido %.', v_reconcile.out_status;
  end if;

  select count(*)
    into v_count
  from public.cancelamento_financeiro cf
  where cf.orcamento_id = v_orcamento_id;

  if v_count < 5 then
    raise exception 'Era esperado registrar pelo menos 5 cancelamentos financeiros. Obtido %.', v_count;
  end if;
end;
$$;

rollback;
