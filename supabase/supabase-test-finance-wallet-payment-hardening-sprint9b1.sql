begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_payment_v2_feature_flags();
select public.finance_ensure_payment_v2_reversal_feature_flags();

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_seed_carteira_conta_id text := null;
  v_appointment_id text := 'test-payment-v2-cut3-appointment';
  v_checkin_id text := 'test-payment-v2-cut3-checkin';
  v_serviceprovided_id text := 'test-payment-v2-cut3-serviceprovided';
  v_obrigacao_id text := 'test-payment-v2-cut3-obrigacao';
  v_cobranca_id text := 'test-payment-v2-cut3-cobranca';
  v_cobranca_item_id text := 'test-payment-v2-cut3-cobranca-item';
  v_conta_receber_id text := 'test-payment-v2-cut3-conta-receber';
  v_unperformed_appointment_id text := 'test-payment-v2-cut3-unperformed-appointment';
  v_unperformed_serviceprovided_id text := 'test-payment-v2-cut3-unperformed-serviceprovided';
  v_unperformed_obrigacao_id text := 'test-payment-v2-cut3-unperformed-obrigacao';
  v_unperformed_cobranca_id text := 'test-payment-v2-cut3-unperformed-cobranca';
  v_unperformed_cobranca_item_id text := 'test-payment-v2-cut3-unperformed-cobranca-item';
  v_unperformed_conta_receber_id text := 'test-payment-v2-cut3-unperformed-conta-receber';
  v_payment_disabled record;
  v_payment_partial record;
  v_payment_success record;
  v_payment_retry record;
  v_payment_second_attempt record;
  v_reversal_disabled record;
  v_reversal_missing_reason record;
  v_reversal_invalid_attachment record;
  v_reversal_success record;
  v_reversal_retry record;
  v_unperformed_reversal record;
  v_movements_after_success integer := 0;
  v_execucoes_success integer := 0;
  v_reversoes_success integer := 0;
begin
  select cc.id
    into v_seed_carteira_conta_id
  from public.carteira_conta cc
  where cc.empresa_id = v_empresa_id
  order by cc.created_date asc, cc.id asc
  limit 1;

  if v_seed_carteira_conta_id is null then
    raise exception 'Nenhuma carteira_conta encontrada para hardening da 9B.1 em empresa_id=%.', v_empresa_id;
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
    'Seed controlada para hardening Payment V2 Corte 3',
    now(),
    current_date,
    'teste_sql',
    'avulso',
    90.00,
    v_checkin_id,
    'test-payment-v2-cut3-appointment',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    90.00,
    1,
    90.00,
    'registrado',
    'pendente',
    'Seed controlada para hardening Payment V2 Corte 3',
    current_date,
    'teste_sql',
    'avulso',
    'test-payment-v2-cut3-serviceprovided',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    'test-payment-v2-cut3-obrigacao',
    'Seed controlada Payment V2 Corte 3',
    current_date,
    current_date,
    90.00,
    90.00,
    90.00,
    'aberta',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    'test-payment-v2-cut3-cobranca',
    'agendamento_confirmado',
    'Seed controlada Payment V2 Corte 3',
    current_date,
    90.00,
    90.00,
    'aberta',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    90.00,
    1,
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
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
    'Seed controlada Payment V2 Corte 3',
    'banho',
    90.00,
    current_date,
    'pendente',
    'Seed controlada Payment V2 Corte 3',
    'payment_v2_seed',
    'agendamento_solto',
    'avulso',
    current_date,
    'test-payment-v2-cut3-conta-receber',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_seed')
  );

  select *
    into v_payment_disabled
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'test-payment-v2-cut3-disabled',
    p_source_key := 'sql-test|payment-v2|cut3|disabled',
    p_valor := 90.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'pix',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_disabled')
  );

  if v_payment_disabled.classe_resultado <> 'rejeitado_negocio'
     or v_payment_disabled.reason_code <> 'payment_v2_write_disabled' then
    raise exception 'Hardening do pagamento com flag desligada falhou. classe=% reason=%',
      v_payment_disabled.classe_resultado,
      v_payment_disabled.reason_code;
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
    into v_payment_partial
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'test-payment-v2-cut3-partial',
    p_source_key := 'sql-test|payment-v2|cut3|partial',
    p_valor := 45.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'pix',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_partial')
  );

  if v_payment_partial.classe_resultado <> 'rejeitado_negocio'
     or v_payment_partial.reason_code <> 'partial_payment_out_of_scope' then
    raise exception 'Pagamento parcial fora de escopo deveria rejeitar. classe=% reason=%',
      v_payment_partial.classe_resultado,
      v_payment_partial.reason_code;
  end if;

  if exists (
    select 1
    from public.carteira_movimento cm
    where cm.empresa_id = v_empresa_id
      and cm.operacao_idempotencia = 'test-payment-v2-cut3-partial'
  ) then
    raise exception 'Pagamento parcial rejeitado nao deveria gerar carteira_movimento.';
  end if;

  select *
    into v_payment_success
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'test-payment-v2-cut3-success',
    p_source_key := 'sql-test|payment-v2|cut3|success',
    p_valor := 90.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'pix',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_success')
  );

  if v_payment_success.classe_resultado <> 'executado' then
    raise exception 'Pagamento de sucesso do hardening deveria executar, obtido %.', v_payment_success.classe_resultado;
  end if;

  select *
    into v_payment_retry
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'test-payment-v2-cut3-success',
    p_source_key := 'sql-test|payment-v2|cut3|success',
    p_valor := 90.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'pix',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_retry')
  );

  if v_payment_retry.classe_resultado <> 'idempotente_reutilizado'
     or coalesce(v_payment_retry.reused, false) is not true then
    raise exception 'Retry do pagamento deveria reutilizar resultado. classe=% reused=%',
      v_payment_retry.classe_resultado,
      v_payment_retry.reused;
  end if;

  select count(*)::integer
    into v_movements_after_success
  from public.carteira_movimento cm
  where cm.empresa_id = v_empresa_id
    and cm.operacao_idempotencia = 'test-payment-v2-cut3-success';

  if v_movements_after_success <> 1 then
    raise exception 'Retry do pagamento nao pode duplicar carteira_movimento. contagem=%', v_movements_after_success;
  end if;

  select count(*)::integer
    into v_execucoes_success
  from public.pagamento_v2_execucao pve
  where pve.empresa_id = v_empresa_id
    and pve.operacao_idempotencia = 'test-payment-v2-cut3-success';

  if v_execucoes_success <> 1 then
    raise exception 'Retry do pagamento nao pode duplicar execucao. contagem=%', v_execucoes_success;
  end if;

  select *
    into v_payment_second_attempt
  from public.finance_payment_v2_execute(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_operacao_idempotencia := 'test-payment-v2-cut3-second-attempt',
    p_source_key := 'sql-test|payment-v2|cut3|success',
    p_valor := 90.00,
    p_data_pagamento := current_date,
    p_forma_pagamento := 'pix',
    p_origem_operacional := 'teste_sql',
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_second_attempt')
  );

  if v_payment_second_attempt.classe_resultado <> 'rejeitado_negocio'
     or v_payment_second_attempt.reason_code <> 'obrigacao_not_payable' then
    raise exception 'Nova tentativa com outra operacao na mesma obrigacao quitada deveria rejeitar. classe=% reason=%',
      v_payment_second_attempt.classe_resultado,
      v_payment_second_attempt.reason_code;
  end if;

  if exists (
    select 1
    from public.carteira_movimento cm
    where cm.empresa_id = v_empresa_id
      and cm.operacao_idempotencia = 'test-payment-v2-cut3-second-attempt'
  ) then
    raise exception 'Nova tentativa em obrigacao quitada nao deveria gerar novo carteira_movimento.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', false),
      updated_date = now()
  where key = 'finance.payment_v2_reversal_enabled'
    and empresa_id = v_empresa_id;

  select *
    into v_reversal_disabled
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-reversal-disabled',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|disabled',
    p_motivo := 'Teste de estorno com flag desligada',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_reversal_disabled')
  );

  if v_reversal_disabled.classe_resultado <> 'rejeitado_negocio'
     or v_reversal_disabled.reason_code <> 'payment_v2_reversal_disabled' then
    raise exception 'Estorno com flag desligada deveria rejeitar. classe=% reason=%',
      v_reversal_disabled.classe_resultado,
      v_reversal_disabled.reason_code;
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true),
      updated_date = now()
  where key = 'finance.payment_v2_reversal_enabled'
    and empresa_id = v_empresa_id;

  select *
    into v_reversal_missing_reason
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-reversal-no-reason',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|no-reason',
    p_motivo := null,
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_reversal_no_reason')
  );

  if v_reversal_missing_reason.classe_resultado <> 'rejeitado_negocio'
     or v_reversal_missing_reason.reason_code <> 'motivo_required' then
    raise exception 'Estorno sem motivo deveria rejeitar. classe=% reason=%',
      v_reversal_missing_reason.classe_resultado,
      v_reversal_missing_reason.reason_code;
  end if;

  if exists (
    select 1
    from public.carteira_movimento cm
    where cm.empresa_id = v_empresa_id
      and cm.operacao_idempotencia = 'test-payment-v2-cut3-reversal-no-reason'
  ) then
    raise exception 'Estorno rejeitado sem motivo nao deveria gerar carteira_movimento.';
  end if;

  select *
    into v_reversal_invalid_attachment
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-reversal-invalid-attachment',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|invalid-attachment',
    p_motivo := 'Teste de estorno com anexo invalido',
    p_attachment_name := 'evidencia.exe',
    p_attachment_path := 'private://tests/evidencia.exe',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_reversal_invalid_attachment')
  );

  if v_reversal_invalid_attachment.classe_resultado <> 'rejeitado_negocio'
     or v_reversal_invalid_attachment.reason_code <> 'attachment_extension_invalid' then
    raise exception 'Estorno com extensao invalida deveria rejeitar. classe=% reason=%',
      v_reversal_invalid_attachment.classe_resultado,
      v_reversal_invalid_attachment.reason_code;
  end if;

  select *
    into v_reversal_success
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-reversal-success',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|success',
    p_motivo := 'Teste de hardening do estorno',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_reversal_success')
  );

  if v_reversal_success.classe_resultado <> 'executado' then
    raise exception 'Estorno de hardening deveria executar, obtido %.', v_reversal_success.classe_resultado;
  end if;

  select *
    into v_reversal_retry
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-reversal-success',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|success',
    p_motivo := 'Teste de hardening do estorno',
    p_attachment_name := 'evidencia.pdf',
    p_attachment_path := 'private://tests/evidencia.pdf',
    p_appointment_id := v_appointment_id,
    p_serviceprovided_id := v_serviceprovided_id,
    p_obrigacao_id := v_obrigacao_id,
    p_cobranca_financeira_id := v_cobranca_id,
    p_conta_receber_id := v_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_reversal_retry')
  );

  if v_reversal_retry.classe_resultado <> 'idempotente_reutilizado'
     or coalesce(v_reversal_retry.reused, false) is not true then
    raise exception 'Retry do estorno deveria reutilizar resultado. classe=% reused=%',
      v_reversal_retry.classe_resultado,
      v_reversal_retry.reused;
  end if;

  select count(*)::integer
    into v_reversoes_success
  from public.pagamento_v2_reversao pvr
  where pvr.empresa_id = v_empresa_id
    and pvr.operacao_idempotencia = 'test-payment-v2-cut3-reversal-success';

  if v_reversoes_success <> 1 then
    raise exception 'Retry do estorno nao pode duplicar reversao. contagem=%', v_reversoes_success;
  end if;

  insert into public.appointment (
    id,
    empresa_id,
    service_type,
    status,
    observacoes,
    data_referencia,
    source_type,
    charge_type,
    valor_previsto,
    source_key,
    metadata
  )
  values (
    v_unperformed_appointment_id,
    v_empresa_id,
    'banho',
    'agendado',
    'Seed de servico nao realizado para hardening Payment V2 Corte 3',
    current_date,
    'teste_sql',
    'avulso',
    55.00,
    'test-payment-v2-cut3-unperformed-appointment',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
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
    v_unperformed_serviceprovided_id,
    v_empresa_id,
    v_unperformed_appointment_id,
    null,
    'banho',
    55.00,
    1,
    55.00,
    'registrado',
    'pendente',
    'Seed de servico nao realizado para hardening Payment V2 Corte 3',
    current_date,
    'teste_sql',
    'avulso',
    'test-payment-v2-cut3-unperformed-serviceprovided',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
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
    v_unperformed_obrigacao_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    v_unperformed_appointment_id,
    'agendamento',
    'servico_avulso',
    'test-payment-v2-cut3-unperformed-obrigacao',
    'Seed nao realizada Payment V2 Corte 3',
    current_date,
    current_date,
    55.00,
    55.00,
    55.00,
    'aberta',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
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
    v_unperformed_cobranca_id,
    v_empresa_id,
    v_seed_carteira_conta_id,
    'test-payment-v2-cut3-unperformed-cobranca',
    'agendamento_confirmado',
    'Seed nao realizada Payment V2 Corte 3',
    current_date,
    55.00,
    55.00,
    'aberta',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
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
    v_unperformed_cobranca_item_id,
    v_empresa_id,
    v_unperformed_cobranca_id,
    v_unperformed_obrigacao_id,
    55.00,
    1,
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
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
    v_unperformed_conta_receber_id,
    v_empresa_id,
    v_unperformed_appointment_id,
    'Seed nao realizada Payment V2 Corte 3',
    'banho',
    55.00,
    current_date,
    'pendente',
    'Seed nao realizada Payment V2 Corte 3',
    'payment_v2_seed',
    'agendamento_solto',
    'avulso',
    current_date,
    'test-payment-v2-cut3-unperformed-conta-receber',
    jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_seed')
  );

  select *
    into v_unperformed_reversal
  from public.finance_payment_v2_reverse(
    p_empresa_id := v_empresa_id,
    p_carteira_conta_id := v_seed_carteira_conta_id,
    p_reversao_tipo := 'servico',
    p_operacao_idempotencia := 'test-payment-v2-cut3-unperformed-reversal',
    p_source_key := 'sql-test|payment-v2-reversal|cut3|unperformed',
    p_motivo := 'Teste de estorno de servico nao realizado',
    p_attachment_name := 'evidencia.txt',
    p_attachment_path := 'private://tests/evidencia.txt',
    p_appointment_id := v_unperformed_appointment_id,
    p_serviceprovided_id := v_unperformed_serviceprovided_id,
    p_obrigacao_id := v_unperformed_obrigacao_id,
    p_cobranca_financeira_id := v_unperformed_cobranca_id,
    p_conta_receber_id := v_unperformed_conta_receber_id,
    p_metadata := jsonb_build_object('test_scope', 'sprint9b1_cut3_unperformed_reversal')
  );

  if v_unperformed_reversal.classe_resultado <> 'executado'
     or coalesce(v_unperformed_reversal.servico_realizado, true) is not false then
    raise exception 'Estorno de servico nao realizado deveria executar com servico_realizado=false. classe=% servico_realizado=%',
      v_unperformed_reversal.classe_resultado,
      v_unperformed_reversal.servico_realizado;
  end if;

  if exists (
    select 1
    from public.serviceprovided sp
    where sp.id = v_unperformed_serviceprovided_id
  ) then
    raise exception 'ServiceProvided nao realizado deveria ser removido no estorno.';
  end if;

  if exists (
    select 1
    from public.appointment ap
    where ap.id = v_unperformed_appointment_id
  ) then
    raise exception 'Appointment nao realizado deveria ser removido no estorno.';
  end if;

  if not exists (
    select 1
    from public.obrigacao_financeira ofn
    where ofn.id = v_unperformed_obrigacao_id
      and ofn.status = 'cancelada'
      and round(coalesce(ofn.valor_final, 0), 2) = 0
      and round(coalesce(ofn.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Obrigacao de servico nao realizado deveria ficar cancelada e zerada.';
  end if;

  if not exists (
    select 1
    from public.cobranca_financeira cf
    where cf.id = v_unperformed_cobranca_id
      and cf.status = 'cancelada'
      and round(coalesce(cf.valor_total, 0), 2) = 0
      and round(coalesce(cf.valor_em_aberto, 0), 2) = 0
  ) then
    raise exception 'Cobranca de servico nao realizado deveria ficar cancelada e zerada.';
  end if;

  if exists (
    select 1
    from public.carteira_movimento cm
    where cm.empresa_id = v_empresa_id
      and cm.operacao_idempotencia = 'test-payment-v2-cut3-unperformed-reversal'
  ) then
    raise exception 'Estorno de servico nao realizado nao deveria gerar carteira_movimento.';
  end if;
end;
$$;

rollback;
