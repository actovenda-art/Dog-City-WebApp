begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();
select public.finance_ensure_payment_v2_reversal_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_seed_carteira_conta_id text := null;
  v_appointment_id text := 'final-rollout-reversal-appointment';
  v_checkin_id text := 'final-rollout-reversal-checkin';
  v_serviceprovided_id text := 'final-rollout-reversal-serviceprovided';
  v_obrigacao_id text := 'final-rollout-reversal-obrigacao';
  v_cobranca_id text := 'final-rollout-reversal-cobranca';
  v_cobranca_item_id text := 'final-rollout-reversal-cobranca-item';
  v_conta_receber_id text := 'final-rollout-reversal-conta-receber';
  v_payment record;
  v_reversal record;
  v_service record;
  v_conta_receber_valor numeric(14,2) := 0;
  v_audit_count integer := 0;
begin
  select cc.id
    into v_seed_carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = v_empresa_id
  order by cc.created_date asc, cc.id asc
  limit 1;

  if v_seed_carteira_conta_id is null then
    raise exception 'Nenhuma carteira_conta encontrada para validacao final de estorno em empresa_id=%.', v_empresa_id;
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
    v_appointment_id,
    v_empresa_id,
    'banho',
    'concluido',
    'Seed controlada para validacao final de rollout Estorno V2',
    now(),
    current_date,
    'teste_sql',
    'avulso',
    80.00,
    v_checkin_id,
    'final-rollout-reversal-appointment',
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_checkin_id,
    v_empresa_id,
    v_appointment_id,
    'banho',
    'presente',
    now(),
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_serviceprovided_id,
    v_empresa_id,
    v_appointment_id,
    v_checkin_id,
    'banho',
    80.00,
    1,
    80.00,
    'registrado',
    'pendente',
    'Seed controlada para validacao final de rollout Estorno V2',
    current_date,
    'teste_sql',
    'avulso',
    'final-rollout-reversal-serviceprovided',
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_obrigacao_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    v_appointment_id,
    'agendamento',
    'servico_avulso',
    'final-rollout-reversal-obrigacao',
    'Seed controlada Estorno V2 rollout final',
    current_date,
    current_date,
    80.00,
    80.00,
    80.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_cobranca_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    'final-rollout-reversal-cobranca',
    'agendamento_confirmado',
    'Seed controlada Estorno V2 rollout final',
    current_date,
    80.00,
    80.00,
    'aberta',
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_cobranca_item_id,
    v_empresa_id,
    v_cobranca_id,
    v_obrigacao_id,
    80.00,
    1,
    jsonb_build_object('test_scope', 'final_rollout_reversal')
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
    v_conta_receber_id,
    v_empresa_id,
    v_appointment_id,
    'Seed controlada Estorno V2 rollout final',
    'banho',
    80.00,
    current_date,
    'pendente',
    'Seed controlada Estorno V2 rollout final',
    'payment_v2_seed',
    'agendamento_solto',
    'avulso',
    current_date,
    'final-rollout-reversal-conta-receber',
    jsonb_build_object('test_scope', 'final_rollout_reversal')
  );

  select *
    into v_payment
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'final-rollout-reversal-payment',
    p_source_key := 'sql-test|final-rollout|reversal|payment',
    p_valor := 80.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'dinheiro',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_reversal_payment')
  );

  if v_payment.classe_resultado <> 'executado' then
    raise exception 'Pagamento preparatorio do estorno deveria executar, obtido %.', v_payment.classe_resultado;
  end if;

  select *
    into v_reversal
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'final-rollout-reversal-service',
    p_source_key := 'sql-test|final-rollout|reversal|service',
    p_motivo := 'Validacao final do rollout de estorno',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'final_rollout_reversal_service')
  );

  if v_reversal.classe_resultado <> 'executado' then
    raise exception 'Estorno V2 deveria executar apos ativacao, obtido %.', v_reversal.classe_resultado;
  end if;

  if not exists (
    select 1
    from public.obrigacao_financeira ofn
    where ofn.id = v_obrigacao_id
      and ofn.status in ('estornada', 'cancelada')
      and round(coalesce(ofn.valor_final, 0), 2) = 0
      and round(coalesce(ofn.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Obrigacao deveria ficar zerada e encerrada apos o estorno de servico.';
  end if;

  if not exists (
    select 1
    from public.cobranca_financeira cf
    where cf.id = v_cobranca_id
      and cf.status = 'cancelada'
      and round(coalesce(cf.valor_total, 0), 2) = 0
      and round(coalesce(cf.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Cobranca deveria ficar cancelada e zerada apos o estorno de servico.';
  end if;

  select sp.id, sp.status, sp.status_pagamento
    into v_service
  from public.serviceprovided sp
  where sp.id = v_serviceprovided_id;

  if v_service.status <> 'estornado' or v_service.status_pagamento <> 'pago' then
    raise exception 'ServiceProvided realizado deveria ficar estornado/pago, obtido status=% pagamento=%.',
      v_service.status,
      v_service.status_pagamento;
  end if;

  select round(coalesce(cr.valor, 0), 2)
    into v_conta_receber_valor
  from public.conta_receber cr
  where cr.id = v_conta_receber_id;

  if v_conta_receber_valor <> 0 then
    raise exception 'ContaReceber do servico estornado deveria ficar zerada.';
  end if;

  if v_reversal.carteira_movimento_id is null then
    raise exception 'Estorno financeiro deveria gerar carteira_movimento.';
  end if;

  select count(*)::integer
    into v_audit_count
  from public.finance_payment_v2_reversal_audit(v_empresa_id, 200) audit
  where audit.operacao_idempotencia = 'final-rollout-reversal-service';

  if v_audit_count < 1 then
    raise exception 'Auditoria do estorno deveria retornar ao menos uma linha apos a ativacao.';
  end if;
end;
$$;

rollback;
