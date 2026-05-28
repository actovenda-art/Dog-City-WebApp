-- Sprint 1 - Testes SQL da infraestrutura invisível
-- Rode após:
-- 1. supabase-schema.sql
-- 2. schemas multiempresa aplicados
-- 3. supabase/supabase-schema-finance-wallet-core-sprint1.sql
--
-- Observação:
-- O teste de lock concorrente precisa de duas sessões e está documentado no final.

begin;

select public.finance_ensure_wallet_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_sprint1';
  v_conta_id text;
  v_movement_id text;
  v_reused boolean;
  v_balance numeric(14,2);
  v_count integer;
  v_reconcile_status text;
begin
  select id
    into v_empresa_id
  from public.empresa
  order by created_date asc nulls last, id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 1.';
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
    'Carteira Teste Sprint 1',
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

  select id
    into v_conta_id
  from public.carteira_conta
  where carteira_id = v_carteira_id;

  if v_conta_id is null then
    raise exception 'Backfill não criou carteira_conta para a carteira de teste.';
  end if;

  select count(*)
    into v_count
  from public.carteira_conta
  where carteira_id = v_carteira_id;

  if v_count <> 1 then
    raise exception 'Falha na relação 1:1. Esperado 1 carteira_conta, obtido %.', v_count;
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.wallet_account_enabled', 'finance.wallet_ledger_enabled')
    and empresa_id = v_empresa_id;

  if not exists (
    select 1
    from public.app_config
    where key = 'finance.wallet_account_enabled'
      and empresa_id = v_empresa_id
      and coalesce((value ->> 'enabled')::boolean, false) = true
  ) then
    raise exception 'Não foi possível habilitar a flag finance.wallet_account_enabled para o teste.';
  end if;

  select movimento_id, reused
    into v_movement_id, v_reused
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_op_sprint1_001',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_origem := 'teste_sql',
    p_valor := 50.00,
    p_referencia_amigavel := 'Teste Sprint 1',
    p_descricao := 'Crédito manual de teste',
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scope', 'sprint1_test')
  );

  if v_movement_id is null or v_reused is not false then
    raise exception 'Primeira operação não criou movimento corretamente.';
  end if;

  select saldo_atual
    into v_balance
  from public.carteira_conta
  where id = v_conta_id;

  if round(v_balance, 2) <> 50.00 then
    raise exception 'Saldo após primeira operação incorreto. Esperado 50.00, obtido %.', v_balance;
  end if;

  select movimento_id, reused
    into v_movement_id, v_reused
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_op_sprint1_001',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_origem := 'teste_sql',
    p_valor := 50.00,
    p_referencia_amigavel := 'Teste Sprint 1',
    p_descricao := 'Crédito manual de teste',
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scope', 'sprint1_test')
  );

  if v_reused is not true then
    raise exception 'Idempotência falhou: segunda chamada deveria reutilizar o movimento.';
  end if;

  select count(*)
    into v_count
  from public.carteira_movimento
  where carteira_conta_id = v_conta_id
    and operacao_idempotencia = 'test_op_sprint1_001';

  if v_count <> 1 then
    raise exception 'Idempotência falhou: esperado 1 movimento, obtido %.', v_count;
  end if;

  select out_status
    into v_reconcile_status
  from public.finance_reconcile_wallet_account(v_conta_id, null);

  if v_reconcile_status <> 'ok' then
    raise exception 'Reconciliação esperada como ok, obtido %.', v_reconcile_status;
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', false), updated_date = now()
  where key in ('finance.wallet_account_enabled', 'finance.wallet_ledger_enabled')
    and empresa_id = v_empresa_id;

  begin
    perform *
    from public.finance_apply_wallet_operation(
      p_carteira_conta_id := v_conta_id,
      p_operacao_idempotencia := 'test_op_sprint1_flagoff',
      p_tipo := 'credito_manual',
      p_natureza := 'entrada',
      p_origem := 'teste_sql',
      p_valor := 10.00,
      p_referencia_amigavel := 'Flag off',
      p_descricao := 'Operação com flags desligadas'
    );
    raise exception 'A operação deveria ter falhado com as flags desligadas.';
  exception
    when others then
      if position('Feature flag' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end;
$$;

rollback;

-- TESTE MANUAL DE LOCK TRANSACIONAL (duas sessões)
-- Sessão A:
--   begin;
--   select * from public.finance_apply_wallet_operation(
--     p_carteira_conta_id := '<carteira_conta_id>',
--     p_operacao_idempotencia := 'lock_test_a',
--     p_tipo := 'credito_manual',
--     p_natureza := 'entrada',
--     p_origem := 'manual_lock_test',
--     p_valor := 1.00,
--     p_referencia_amigavel := 'Lock A'
--   );
--   -- manter a transação aberta antes do commit
--
-- Sessão B:
--   begin;
--   select * from public.finance_apply_wallet_operation(
--     p_carteira_conta_id := '<carteira_conta_id>',
--     p_operacao_idempotencia := 'lock_test_b',
--     p_tipo := 'credito_manual',
--     p_natureza := 'entrada',
--     p_origem := 'manual_lock_test',
--     p_valor := 1.00,
--     p_referencia_amigavel := 'Lock B'
--   );
-- Esperado:
--   a Sessão B aguarda o lock da Sessão A e não gera atualização concorrente solta.
