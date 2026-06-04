begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();
select public.finance_ensure_payment_v2_reversal_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_obrigacao record;
  v_payment record;
  v_disabled record;
  v_reversal record;
  v_saldo_reversal record;
  v_saldo_disponivel numeric(14,2) := 0;
  v_audit_count integer := 0;
  v_serviceprovided_id text := null;
  v_service_status text := null;
  v_service_payment_status text := null;
  v_conta_receber_valor numeric(14,2) := 0;
  v_seed_carteira_conta_id text := null;
  v_seed_appointment_id text := 'test-payment-v2-cut2-appointment';
  v_seed_checkin_id text := 'test-payment-v2-cut2-checkin';
  v_seed_serviceprovided_id text := 'test-payment-v2-cut2-serviceprovided';
  v_seed_obrigacao_id text := 'test-payment-v2-cut2-obrigacao';
  v_seed_cobranca_id text := 'test-payment-v2-cut2-cobranca';
  v_seed_cobranca_item_id text := 'test-payment-v2-cut2-cobranca-item';
  v_seed_conta_receber_id text := 'test-payment-v2-cut2-conta-receber';
begin
  select
    ofn.id as obrigacao_id,
    ofn.carteira_conta_id,
    ofn.appointment_id,
    round(ofn.valor_em_aberto, 2) as valor,
    charge.cobranca_financeira_id
  into v_obrigacao
  from public.obrigacao_financeira ofn
  left join lateral (
    select cf.id as cobranca_financeira_id
    from public.cobranca_financeira cf
    join public.cobranca_item ci
      on ci.cobranca_financeira_id = cf.id
     and ci.obrigacao_id = ofn.id
    where cf.empresa_id = ofn.empresa_id
      and cf.carteira_conta_id = ofn.carteira_conta_id
    group by cf.id
    having count(*) = 1
    limit 1
  ) charge on true
  where ofn.empresa_id = v_empresa_id
    and ofn.appointment_id is not null
    and ofn.status in ('aberta', 'parcial', 'vencida')
    and round(coalesce(ofn.valor_em_aberto, 0), 2) > 0
  order by ofn.created_date asc nulls last, ofn.id asc
  limit 1;

  if not found then
    select cc.id
      into v_seed_carteira_conta_id
    from public.carteira_conta cc
    where cc.empresa_id = v_empresa_id
    order by cc.created_date asc, cc.id asc
    limit 1;

    if v_seed_carteira_conta_id is null then
      raise exception 'Nenhuma carteira_conta encontrada para seed controlada de estorno em empresa_id=%.', v_empresa_id;
    end if;

    insert into public.appointment (
      id,
      empresa_id,
      service_type,
      status,
      observacoes,
      data_hora_entrada,
      data_referencia,
      source_type,
      charge_type,
      valor_previsto,
      linked_checkin_id,
      source_key,
      metadata
    )
    values (
      v_seed_appointment_id,
      v_empresa_id,
      'banho',
      'concluido',
      'Seed controlada para teste Payment V2 Corte 2',
      now(),
      current_date,
      'teste_sql',
      'avulso',
      80.00,
      v_seed_checkin_id,
      'test-payment-v2-cut2-appointment',
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.checkins (
      id,
      empresa_id,
      appointment_id,
      service_type,
      status,
      checkin_datetime,
      metadata
    )
    values (
      v_seed_checkin_id,
      v_empresa_id,
      v_seed_appointment_id,
      'banho',
      'presente',
      now(),
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.serviceprovided (
      id,
      empresa_id,
      appointment_id,
      checkin_id,
      service_type,
      preco,
      quantidade,
      valor_cobrado,
      status,
      status_pagamento,
      observacoes,
      data_utilizacao,
      source_type,
      charge_type,
      source_key,
      metadata
    )
    values (
      v_seed_serviceprovided_id,
      v_empresa_id,
      v_seed_appointment_id,
      v_seed_checkin_id,
      'banho',
      80.00,
      1,
      80.00,
      'registrado',
      'pendente',
      'Seed controlada para teste Payment V2 Corte 2',
      current_date,
      'teste_sql',
      'avulso',
      'test-payment-v2-cut2-serviceprovided',
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.obrigacao_financeira (
      id,
      empresa_id,
      carteira_conta_id,
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
      metadata
    )
    values (
      v_seed_obrigacao_id,
      v_empresa_id,
      v_seed_carteira_conta_id,
      v_seed_appointment_id,
      'agendamento',
      'servico_avulso',
      'test-payment-v2-cut2-obrigacao',
      'Seed controlada Payment V2 Corte 2',
      current_date,
      current_date,
      80.00,
      80.00,
      80.00,
      'aberta',
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.cobranca_financeira (
      id,
      empresa_id,
      carteira_conta_id,
      source_key,
      tipo,
      descricao,
      due_date,
      valor_total,
      valor_em_aberto,
      status,
      metadata
    )
    values (
      v_seed_cobranca_id,
      v_empresa_id,
      v_seed_carteira_conta_id,
      'test-payment-v2-cut2-cobranca',
      'agendamento_confirmado',
      'Seed controlada Payment V2 Corte 2',
      current_date,
      80.00,
      80.00,
      'aberta',
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.cobranca_item (
      id,
      empresa_id,
      cobranca_financeira_id,
      obrigacao_id,
      valor,
      ordem,
      metadata
    )
    values (
      v_seed_cobranca_item_id,
      v_empresa_id,
      v_seed_cobranca_id,
      v_seed_obrigacao_id,
      80.00,
      1,
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    insert into public.conta_receber (
      id,
      empresa_id,
      appointment_id,
      descricao,
      servico,
      valor,
      vencimento,
      status,
      observacoes,
      origem,
      tipo_agendamento,
      tipo_cobranca,
      data_prestacao,
      source_key,
      metadata
    )
    values (
      v_seed_conta_receber_id,
      v_empresa_id,
      v_seed_appointment_id,
      'Seed controlada Payment V2 Corte 2',
      'banho',
      80.00,
      current_date,
      'pendente',
      'Seed controlada para teste Payment V2 Corte 2',
      'payment_v2_seed',
      'agendamento_solto',
      'avulso',
      current_date,
      'test-payment-v2-cut2-conta-receber',
      jsonb_build_object('test_scope', 'sprint9b1_cut2_seed')
    );

    select
      v_seed_obrigacao_id as obrigacao_id,
      v_seed_carteira_conta_id as carteira_conta_id,
      v_seed_appointment_id as appointment_id,
      80.00::numeric as valor,
      v_seed_cobranca_id as cobranca_financeira_id
    into v_obrigacao;
  end if;

  select *
    into v_disabled
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-reversal-disabled',
    p_source_key := 'sql-test|payment-v2-reversal|disabled',
    p_motivo := 'Teste com flag desligada',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_obrigacao.appointment_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut2_disabled')
  );

  if v_disabled.classe_resultado <> 'rejeitado_negocio'
     or v_disabled.reason_code <> 'payment_v2_reversal_disabled' then
    raise exception 'Estorno com flag desligada deveria rejeitar com payment_v2_reversal_disabled, obtido classe=% reason=%.',
      v_disabled.classe_resultado,
      v_disabled.reason_code;
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true),
      updated_date = now()
  where key in (
      'finance.wallet_account_enabled',
      'finance.wallet_ledger_enabled',
      'finance.payment_v2_write_enabled',
      'finance.payment_v2_reversal_enabled'
    )
    and empresa_id = v_empresa_id;

  select *
    into v_payment
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_operacao_idempotencia := 'test-payment-v2-reversal-payment',
    p_source_key := 'sql-test|payment-v2-reversal|payment',
    p_valor := v_obrigacao.valor,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut2_payment')
  );

  if v_payment.classe_resultado <> 'executado' then
    raise exception 'Pagamento preparatorio deveria retornar executado, obtido %.', v_payment.classe_resultado;
  end if;

  select *
    into v_reversal
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_obrigacao.carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-reversal-service',
    p_source_key := 'sql-test|payment-v2-reversal|service',
    p_motivo := 'Teste de estorno de servico',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_obrigacao.appointment_id,
    p_obrigacao_id := v_obrigacao.obrigacao_id,
    p_cobranca_financeira_id := v_obrigacao.cobranca_financeira_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut2_service')
  );

  if v_reversal.classe_resultado <> 'executado' then
    raise exception 'Estorno de servico deveria retornar executado, obtido %.', v_reversal.classe_resultado;
  end if;

  if not exists (
    select 1
    from public.obrigacao_financeira ofn
    where ofn.id = v_obrigacao.obrigacao_id
      and ofn.status in ('estornada', 'cancelada')
      and round(coalesce(ofn.valor_final, 0), 2) = 0
      and round(coalesce(ofn.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Obrigacao deveria ficar zerada e encerrada apos o estorno do servico.';
  end if;

  if v_obrigacao.cobranca_financeira_id is not null and not exists (
    select 1
    from public.cobranca_financeira cf
    where cf.id = v_obrigacao.cobranca_financeira_id
      and cf.status = 'cancelada'
      and round(coalesce(cf.valor_total, 0), 2) = 0
      and round(coalesce(cf.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Cobranca deveria ficar cancelada e zerada apos o estorno do servico.';
  end if;

  select sp.id, sp.status, sp.status_pagamento
    into v_serviceprovided_id, v_service_status, v_service_payment_status
  from public.serviceprovided sp
  where sp.empresa_id = v_empresa_id
    and sp.appointment_id = v_obrigacao.appointment_id
  order by sp.created_date desc, sp.id desc
  limit 1;

  if coalesce(v_reversal.servico_realizado, false) then
    if not exists (
      select 1
      from public.appointment ap
      where ap.id = v_obrigacao.appointment_id
    ) then
      raise exception 'Agendamento realizado deveria permanecer para trilha historica.';
    end if;

    if v_serviceprovided_id is not null and (v_service_status <> 'estornado' or v_service_payment_status <> 'pago') then
      raise exception 'ServiceProvided realizado deveria ficar estornado/pago, obtido status=% pagamento=%.',
        v_service_status,
        v_service_payment_status;
    end if;
  else
    if exists (
      select 1
      from public.appointment ap
      where ap.id = v_obrigacao.appointment_id
    ) then
      raise exception 'Agendamento nao realizado deveria ser removido apos o estorno.';
    end if;
  end if;

  if exists (
    select 1
    from public.conta_receber cr
    where cr.empresa_id = v_empresa_id
      and cr.appointment_id = v_obrigacao.appointment_id
  ) then
    select round(coalesce(cr.valor, 0), 2)
      into v_conta_receber_valor
    from public.conta_receber cr
    where cr.empresa_id = v_empresa_id
      and cr.appointment_id = v_obrigacao.appointment_id
    order by cr.created_date desc, cr.id desc
    limit 1;

    if v_conta_receber_valor <> 0 then
      raise exception 'ContaReceber vinculada ao servico estornado deveria ficar zerada.';
    end if;
  end if;

  if v_reversal.valor_estornado > 0 and (
    v_reversal.carteira_movimento_id is null
    or not exists (
      select 1
      from public.carteira_movimento cm
      where cm.id = v_reversal.carteira_movimento_id
        and cm.tipo = 'estorno'
        and cm.origem = 'payment_v2_reversal_servico'
    )
  ) then
    raise exception 'Estorno financeiro do servico deveria gerar carteira_movimento do tipo estorno.';
  end if;

  select round(coalesce(cc.saldo_atual, 0), 2)
    into v_saldo_disponivel
  from public.carteira_conta cc
  where cc.id = v_obrigacao.carteira_conta_id;

  if v_saldo_disponivel > 0 then
    select *
      into v_saldo_reversal
    from public.finance_payment_v2_reverse(
      p_empresa_id := v_empresa_id,
      p_carteira_conta_id := v_obrigacao.carteira_conta_id,
      p_reversao_tipo := 'saldo',
      p_operacao_idempotencia := 'test-payment-v2-reversal-saldo',
      p_source_key := 'sql-test|payment-v2-reversal|saldo',
      p_motivo := 'Teste de estorno de saldo',
      p_attachment_name := 'evidencia.png',
      p_attachment_path := 'private://tests/evidencia.png',
      p_valor := least(v_saldo_disponivel, 1.00),
      p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut2_saldo')
    );

    if v_saldo_reversal.classe_resultado <> 'executado' then
      raise exception 'Estorno de saldo deveria retornar executado, obtido %.', v_saldo_reversal.classe_resultado;
    end if;
  else
    raise notice 'Teste de estorno de saldo ignorado por falta de saldo positivo remanescente.';
  end if;

  select count(*)::integer
    into v_audit_count
  from public.finance_payment_v2_reversal_audit(v_empresa_id, 200) audit
  where audit.operacao_idempotencia in (
    'test-payment-v2-reversal-service',
    'test-payment-v2-reversal-saldo'
  );

  if v_audit_count < 1 then
    raise exception 'Auditoria do estorno Payment V2 deveria retornar ao menos uma linha para os testes do corte 2.';
  end if;
end;
$$;

rollback;
