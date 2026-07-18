begin;

do $$
declare
  v_empresa_id text := 'empresa_demo';
  v_carteira_conta_id text;
  v_carteira_id text;
  v_result record;
begin
  select cc.id, cc.carteira_id
  into v_carteira_conta_id, v_carteira_id
  from public.carteira_conta cc
  where cc.empresa_id = v_empresa_id
  order by cc.created_date, cc.id
  limit 1;

  if v_carteira_conta_id is null then
    raise exception 'Massa controlada exige uma carteira_conta em empresa_demo.';
  end if;

  insert into public.orcamento (
    id, empresa_id, cliente_id, caes, valor_total, status, data_criacao, data_validade
  ) values
    ('test-budget-expiry-unpaid', v_empresa_id, v_carteira_id, '[]'::jsonb, 80, 'aprovado', current_date - 10, current_date - 1),
    ('test-budget-expiry-used', v_empresa_id, v_carteira_id, '[]'::jsonb, 90, 'aprovado', current_date - 10, current_date - 1),
    ('test-budget-expiry-paid', v_empresa_id, v_carteira_id, '[]'::jsonb, 100, 'aprovado', current_date - 10, current_date - 1),
    ('test-budget-expiry-valid', v_empresa_id, v_carteira_id, '[]'::jsonb, 110, 'aprovado', current_date, current_date + 10);

  insert into public.appointment (
    id, empresa_id, orcamento_id, service_type, status, data_hora_entrada,
    data_referencia, source_type, source_key, valor_previsto, metadata
  ) values
    ('test-budget-expiry-app-unpaid', v_empresa_id, 'test-budget-expiry-unpaid', 'banho', 'agendado', now(), current_date + 2, 'orcamento_aprovado', 'orcamento|test-budget-expiry-unpaid|dog|banho|date', 80, '{}'::jsonb),
    ('test-budget-expiry-app-used', v_empresa_id, 'test-budget-expiry-used', 'banho', 'presente', now(), current_date + 2, 'orcamento_aprovado', 'orcamento|test-budget-expiry-used|dog|banho|date', 90, '{}'::jsonb),
    ('test-budget-expiry-app-paid', v_empresa_id, 'test-budget-expiry-paid', 'banho', 'agendado', now(), current_date + 2, 'orcamento_aprovado', 'orcamento|test-budget-expiry-paid|dog|banho|date', 100, '{}'::jsonb),
    ('test-budget-expiry-app-valid', v_empresa_id, 'test-budget-expiry-valid', 'banho', 'agendado', now(), current_date + 2, 'orcamento_aprovado', 'orcamento|test-budget-expiry-valid|dog|banho|date', 110, '{}'::jsonb);

  insert into public.checkins (
    id, empresa_id, appointment_id, service_type, status, checkin_datetime, metadata
  ) values (
    'test-budget-expiry-checkin-used', v_empresa_id, 'test-budget-expiry-app-used', 'banho', 'presente', now(), '{}'::jsonb
  );

  update public.appointment
  set linked_checkin_id = 'test-budget-expiry-checkin-used'
  where id = 'test-budget-expiry-app-used';

  insert into public.obrigacao_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, orcamento_id, appointment_id,
    tipo_origem, tipo_item, source_key, descricao, service_date, due_date,
    valor_original, valor_final, valor_em_aberto, status, metadata
  ) values
    ('test-budget-expiry-ofn-unpaid', v_empresa_id, v_carteira_id, v_carteira_conta_id, 'test-budget-expiry-unpaid', 'test-budget-expiry-app-unpaid', 'orcamento', 'banho', 'shadow|orcamento|test-budget-expiry-unpaid|dog|banho|date', 'Banho não pago', current_date + 2, current_date - 1, 80, 80, 80, 'aberta', '{}'::jsonb),
    ('test-budget-expiry-ofn-used', v_empresa_id, v_carteira_id, v_carteira_conta_id, 'test-budget-expiry-used', 'test-budget-expiry-app-used', 'orcamento', 'banho', 'shadow|orcamento|test-budget-expiry-used|dog|banho|date', 'Banho utilizado', current_date + 2, current_date - 1, 90, 90, 90, 'aberta', '{}'::jsonb),
    ('test-budget-expiry-ofn-paid', v_empresa_id, v_carteira_id, v_carteira_conta_id, 'test-budget-expiry-paid', 'test-budget-expiry-app-paid', 'orcamento', 'banho', 'shadow|orcamento|test-budget-expiry-paid|dog|banho|date', 'Banho pago', current_date + 2, current_date - 1, 100, 100, 0, 'quitada', '{}'::jsonb),
    ('test-budget-expiry-ofn-valid', v_empresa_id, v_carteira_id, v_carteira_conta_id, 'test-budget-expiry-valid', 'test-budget-expiry-app-valid', 'orcamento', 'banho', 'shadow|orcamento|test-budget-expiry-valid|dog|banho|date', 'Banho válido', current_date + 2, current_date + 10, 110, 110, 110, 'aberta', '{}'::jsonb);

  insert into public.conta_receber (
    id, empresa_id, cliente_id, orcamento_id, appointment_id, descricao, servico,
    valor, vencimento, status, source_key, metadata
  ) values (
    'test-budget-expiry-cr-unpaid', v_empresa_id, v_carteira_id, 'test-budget-expiry-unpaid', 'test-budget-expiry-app-unpaid', 'Banho não pago', 'banho', 80, current_date - 1, 'pendente', 'orcamento|test-budget-expiry-unpaid|dog|banho|date', '{}'::jsonb
  );

  insert into public.orcamento_pagamento (
    id, empresa_id, orcamento_id, carteira_id, carteira_conta_id, provider, metodo,
    status, valor, codigo_solicitacao, linha_digitavel, codigo_barras, pix_copia_cola,
    pdf_disponivel, metadata
  ) values (
    'test-budget-expiry-payment-unpaid', v_empresa_id, 'test-budget-expiry-unpaid', v_carteira_id, v_carteira_conta_id, 'banco_inter', 'boleto_bancario',
    'emitido', 80, 'test-charge-expired', 'linha', 'codigo', 'pix', true, '{}'::jsonb
  );

  insert into public.cobranca_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, orcamento_id, source_key,
    tipo, descricao, due_date, valor_total, valor_em_aberto, status, metadata
  ) values (
    'test-budget-expiry-charge-unpaid', v_empresa_id, v_carteira_id, v_carteira_conta_id, 'test-budget-expiry-unpaid', 'shadow|orcamento|test-budget-expiry-unpaid|cobranca',
    'orcamento', 'Cobrança vencida', current_date - 1, 80, 80, 'vencida', '{}'::jsonb
  );

  select * into v_result
  from public.finance_expire_budgets(v_empresa_id, null, current_date);

  if v_result.expired_budgets <> 3 then
    raise exception 'Esperava 3 orçamentos expirados, recebeu %.', v_result.expired_budgets;
  end if;

  if exists (select 1 from public.appointment where id = 'test-budget-expiry-app-unpaid') then
    raise exception 'Agendamento não pago e sem check-in deveria ser removido.';
  end if;

  if not exists (
    select 1 from public.appointment
    where id = 'test-budget-expiry-app-used'
      and metadata ->> 'budget_expiry_preserve_reason' = 'checkin_or_operational_record'
  ) then
    raise exception 'Agendamento utilizado deveria permanecer preservado.';
  end if;

  if not exists (
    select 1 from public.appointment
    where id = 'test-budget-expiry-app-paid'
      and metadata ->> 'budget_expiry_preserve_reason' = 'payment_evidence'
  ) then
    raise exception 'Agendamento pago deveria permanecer preservado.';
  end if;

  if not exists (
    select 1 from public.obrigacao_financeira
    where id = 'test-budget-expiry-ofn-unpaid'
      and status = 'cancelada'
      and valor_em_aberto = 0
  ) then
    raise exception 'Obrigação do agendamento removido deveria ser cancelada e zerada.';
  end if;

  if not exists (
    select 1 from public.obrigacao_financeira
    where id = 'test-budget-expiry-ofn-used'
      and status = 'aberta'
      and valor_em_aberto = 90
  ) then
    raise exception 'Débito do atendimento utilizado não pode ser descartado.';
  end if;

  if exists (select 1 from public.conta_receber where id = 'test-budget-expiry-cr-unpaid') then
    raise exception 'Conta a receber sem pagamento deveria ser removida.';
  end if;

  if not exists (
    select 1 from public.orcamento_pagamento
    where id = 'test-budget-expiry-payment-unpaid'
      and status = 'expirado'
      and pdf_disponivel = false
      and linha_digitavel is null
      and pix_copia_cola is null
  ) then
    raise exception 'Cobrança bancária local deveria ficar expirada e indisponível.';
  end if;

  if not exists (
    select 1 from public.cobranca_financeira
    where id = 'test-budget-expiry-charge-unpaid'
      and status = 'cancelada'
      and valor_em_aberto = 0
  ) then
    raise exception 'Cobrança financeira sem itens remanescentes deveria ser cancelada.';
  end if;

  if not exists (
    select 1 from public.orcamento
    where id = 'test-budget-expiry-valid'
      and status = 'aprovado'
  ) or not exists (
    select 1 from public.appointment
    where id = 'test-budget-expiry-app-valid'
  ) then
    raise exception 'Orçamento ainda válido não pode ser alterado.';
  end if;
end;
$$;

rollback;
