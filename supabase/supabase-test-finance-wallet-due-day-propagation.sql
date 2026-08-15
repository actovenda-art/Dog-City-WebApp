begin;

do $$
declare
  v_wallet public.carteira%rowtype;
  v_account public.carteira_conta%rowtype;
  v_new_due_day integer;
  v_expected_due_date date;
  v_prefix text := 'wallet_due_day_test_' || replace(gen_random_uuid()::text, '-', '');
begin
  select c.*
  into v_wallet
  from public.carteira c
  where nullif(btrim(coalesce(c.vencimento_planos, '')), '') is not null
    and exists (
      select 1
      from public.carteira_conta cc
      where cc.carteira_id = c.id
    )
  order by c.created_date asc
  limit 1;

  if v_wallet.id is null then
    raise exception 'Nao foi encontrada carteira controlada com conta operacional.';
  end if;

  select cc.*
  into v_account
  from public.carteira_conta cc
  where cc.carteira_id = v_wallet.id
  order by cc.created_date asc
  limit 1;

  v_new_due_day := case when v_wallet.vencimento_planos = '05' then 20 else 5 end;
  v_expected_due_date := make_date(2026, 9, v_new_due_day);

  insert into public.conta_receber (
    id, empresa_id, cliente_id, descricao, valor, vencimento, status,
    source_key, metadata, created_date, updated_date
  ) values
  (
    v_prefix || '_receivable_open', v_wallet.empresa_id, v_wallet.id,
    'Teste vencimento aberto', 100, date '2026-09-20', 'pendente',
    'plano_recorrente|' || v_prefix || '|2026-09-20',
    jsonb_build_object('plan_id', v_prefix || '_plan'), now(), now()
  ),
  (
    v_prefix || '_receivable_paid', v_wallet.empresa_id, v_wallet.id,
    'Teste vencimento quitado', 100, date '2026-09-20', 'pago',
    'plano_recorrente|' || v_prefix || '|2026-09-20|paid',
    '{}'::jsonb, now(), now()
  );

  update public.conta_receber
  set data_recebimento = date '2026-09-19'
  where id = v_prefix || '_receivable_paid';

  insert into public.obrigacao_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, tipo_origem, tipo_item,
    source_key, descricao, service_date, due_date, valor_original,
    valor_final, valor_em_aberto, status, metadata
  ) values
  (
    v_prefix || '_obligation_open', v_wallet.empresa_id, v_wallet.id, v_account.id,
    'teste', 'servico', 'plano_recorrente|' || v_prefix || '|2026-09-20',
    'Teste obrigacao aberta', date '2026-09-10', date '2026-09-20',
    100, 100, 100, 'aberta', '{}'::jsonb
  ),
  (
    v_prefix || '_obligation_paid', v_wallet.empresa_id, v_wallet.id, v_account.id,
    'teste', 'servico', v_prefix || '|paid',
    'Teste obrigacao quitada', date '2026-09-10', date '2026-09-20',
    100, 100, 0, 'quitada', '{}'::jsonb
  );

  insert into public.cobranca_financeira (
    id, empresa_id, carteira_id, carteira_conta_id, source_key, tipo,
    descricao, due_date, valor_total, valor_em_aberto, status, metadata
  ) values (
    v_prefix || '_charge_open', v_wallet.empresa_id, v_wallet.id, v_account.id,
    v_prefix || '|charge', 'teste', 'Teste cobranca aberta', date '2026-09-20',
    100, 100, 'aberta', '{}'::jsonb
  );

  insert into public.plan_config (
    id, empresa_id, client_id, carteira_id, client_name, service, frequency,
    monthly_value, due_day, renovacao_dia, next_billing_date, status,
    metadata_gerencial, created_date, updated_date
  ) values (
    v_prefix || '_plan', v_wallet.empresa_id, v_wallet.id, v_wallet.id,
    v_wallet.nome_razao_social, 'day_care', 'semanal', 100, 20, 20,
    date '2026-09-20', 'ativo', '{}'::jsonb, now(), now()
  );

  update public.carteira
  set vencimento_planos = lpad(v_new_due_day::text, 2, '0')
  where id = v_wallet.id;

  if (select vencimento from public.conta_receber where id = v_prefix || '_receivable_open') <> v_expected_due_date then
    raise exception 'Conta a receber aberta nao recebeu o novo vencimento.';
  end if;

  if (select vencimento from public.conta_receber where id = v_prefix || '_receivable_paid') <> date '2026-09-20' then
    raise exception 'Conta a receber quitada foi alterada indevidamente.';
  end if;

  if (select due_date from public.obrigacao_financeira where id = v_prefix || '_obligation_open') <> v_expected_due_date then
    raise exception 'Obrigacao aberta nao recebeu o novo vencimento.';
  end if;

  if (select due_date from public.obrigacao_financeira where id = v_prefix || '_obligation_paid') <> date '2026-09-20' then
    raise exception 'Obrigacao quitada foi alterada indevidamente.';
  end if;

  if (select due_date from public.cobranca_financeira where id = v_prefix || '_charge_open') <> v_expected_due_date then
    raise exception 'Cobranca V2 aberta nao recebeu o novo vencimento.';
  end if;

  if exists (
    select 1
    from public.plan_config pc
    where pc.id = v_prefix || '_plan'
      and (
        pc.due_day <> v_new_due_day
        or pc.renovacao_dia <> v_new_due_day
        or pc.next_billing_date <> v_expected_due_date
      )
  ) then
    raise exception 'Plano futuro nao recebeu o novo vencimento.';
  end if;

  raise notice 'Propagacao de vencimento validada; quitados preservados.';
end;
$$;

rollback;
