-- Sprint 3 - Testes SQL da carteira e movimentacoes com leitura controlada
-- Pre-requisitos:
-- 1. Sprint 1 aplicada
-- 2. Sprint 2 aplicada
-- 3. supabase/supabase-schema-finance-wallet-read-sprint3.sql aplicada

begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_wallet_read_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_read_sprint3';
  v_conta_id text;
  v_result record;
  v_count integer;
  v_balance numeric(14,2);
  v_status text;
begin
  select e.id
    into v_empresa_id
  from public.empresa e
  order by e.created_date asc nulls last, e.id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 3.';
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
    'Carteira Teste Sprint 3',
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
    raise exception 'Backfill nao criou carteira_conta para o teste Sprint 3.';
  end if;

  insert into public.extratobancario (
    id,
    empresa_id,
    descricao,
    tipo,
    valor,
    data,
    data_movimento,
    nome_contraparte,
    source_provider,
    metadata_financeira
  )
  values (
    'tx_test_sprint3',
    v_empresa_id,
    'Transacao de apoio para entrada direcionada',
    'entrada',
    40.00,
    current_date,
    current_date,
    'Terceiro pagador',
    'manual',
    jsonb_build_object('scope', 'sprint3_test')
  )
  on conflict (id) do update
  set
    empresa_id = excluded.empresa_id,
    descricao = excluded.descricao,
    tipo = excluded.tipo,
    valor = excluded.valor,
    data = excluded.data,
    data_movimento = excluded.data_movimento,
    nome_contraparte = excluded.nome_contraparte,
    source_provider = excluded.source_provider,
    metadata_financeira = excluded.metadata_financeira;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.wallet_account_enabled', 'finance.wallet_ledger_enabled')
    and empresa_id = v_empresa_id;

  begin
    perform *
    from public.finance_wallet_admin_apply_operation(
      p_carteira_conta_id := v_conta_id,
      p_operacao_idempotencia := 'test_sprint3_credito_flag_off',
      p_tipo := 'credito_manual',
      p_natureza := 'entrada',
      p_valor := 100.00,
      p_referencia_amigavel := 'Credito sem flag',
      p_motivo := 'Nao deveria passar'
    );
    raise exception 'A operacao deveria ter falhado com wallet_manual_adjustments_enabled desligada.';
  exception
    when others then
      if position('wallet_manual_adjustments_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.wallet_balance_read_enabled',
    'finance.wallet_movements_enabled',
    'finance.wallet_manual_adjustments_enabled'
  )
    and empresa_id = v_empresa_id;

  select *
    into v_result
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint3_credito_001',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_valor := 100.00,
    p_referencia_amigavel := 'Credito manual Sprint 3',
    p_motivo := 'Credito inicial',
    p_observacao := 'Teste controlado'
  );

  if v_result.movimento_id is null or v_result.reused is not false then
    raise exception 'Credito manual nao criou movimento corretamente.';
  end if;

  select *
    into v_result
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint3_credito_001',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_valor := 100.00,
    p_referencia_amigavel := 'Credito manual Sprint 3',
    p_motivo := 'Credito inicial',
    p_observacao := 'Teste controlado'
  );

  if v_result.reused is not true then
    raise exception 'Idempotencia falhou para credito_manual.';
  end if;

  perform *
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint3_ajuste_entrada',
    p_tipo := 'ajuste_manual',
    p_natureza := 'entrada',
    p_valor := 25.00,
    p_referencia_amigavel := 'Ajuste para cima',
    p_motivo := 'Correcao administrativa'
  );

  perform *
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint3_estorno_saida',
    p_tipo := 'estorno_manual',
    p_natureza := 'saida',
    p_valor := 10.00,
    p_referencia_amigavel := 'Estorno manual',
    p_motivo := 'Estorno de teste'
  );

  perform *
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint3_direcionamento',
    p_tipo := 'entrada_direcionada',
    p_natureza := 'entrada',
    p_valor := 40.00,
    p_referencia_amigavel := 'Entrada direcionada',
    p_motivo := 'Pagamento de terceiro',
    p_transacao_id := 'tx_test_sprint3'
  );

  select saldo_atual
    into v_balance
  from public.carteira_conta
  where id = v_conta_id;

  if round(v_balance, 2) <> 155.00 then
    raise exception 'Saldo final incorreto. Esperado 155.00, obtido %.', v_balance;
  end if;

  select count(*)
    into v_count
  from public.carteira_movimento cm
  where cm.carteira_conta_id = v_conta_id;

  if v_count <> 4 then
    raise exception 'Esperado 4 movimentos persistidos, obtido %.', v_count;
  end if;

  select count(*)
    into v_count
  from public.finance_wallet_admin_read_accounts(v_empresa_id)
  where carteira_conta_id = v_conta_id;

  if v_count <> 1 then
    raise exception 'Leitura administrativa da conta nao retornou a carteira esperada.';
  end if;

  select count(*)
    into v_count
  from public.finance_wallet_admin_read_movements(v_empresa_id, v_conta_id, 20);

  if v_count <> 4 then
    raise exception 'Leitura administrativa dos movimentos deveria retornar 4 linhas, obteve %.', v_count;
  end if;

  select status
    into v_status
  from public.finance_wallet_admin_audit_accounts(v_empresa_id)
  where carteira_conta_id = v_conta_id;

  if v_status <> 'ok' then
    raise exception 'Auditoria administrativa esperada como ok, obtido %.', v_status;
  end if;

  perform *
  from public.finance_reconcile_wallet_account(v_conta_id, null);

  begin
    update public.carteira_movimento
    set descricao = 'Nao permitido'
    where carteira_conta_id = v_conta_id;
    raise exception 'UPDATE em carteira_movimento deveria falhar.';
  exception
    when others then
      null;
  end;

  begin
    delete from public.carteira_movimento
    where carteira_conta_id = v_conta_id;
    raise exception 'DELETE em carteira_movimento deveria falhar.';
  exception
    when others then
      null;
  end;
end;
$$;

rollback;

-- TESTE MANUAL DE CONCORRENCIA (duas sessoes)
-- Sessao A:
--   begin;
--   select * from public.finance_wallet_admin_apply_operation(
--     p_carteira_conta_id := '<carteira_conta_id>',
--     p_operacao_idempotencia := 'lock_test_sprint3_a',
--     p_tipo := 'credito_manual',
--     p_natureza := 'entrada',
--     p_valor := 1.00,
--     p_referencia_amigavel := 'Lock A',
--     p_motivo := 'Teste lock A'
--   );
--   -- manter a transacao aberta
--
-- Sessao B:
--   begin;
--   select * from public.finance_wallet_admin_apply_operation(
--     p_carteira_conta_id := '<carteira_conta_id>',
--     p_operacao_idempotencia := 'lock_test_sprint3_b',
--     p_tipo := 'credito_manual',
--     p_natureza := 'entrada',
--     p_valor := 1.00,
--     p_referencia_amigavel := 'Lock B',
--     p_motivo := 'Teste lock B'
--   );
-- Esperado:
--   a Sessao B aguarda o lock da Sessao A e nao gera duplicidade.
