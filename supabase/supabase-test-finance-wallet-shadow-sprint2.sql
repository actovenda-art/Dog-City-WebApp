-- Sprint 2 - Testes SQL do shadow write financeiro
-- Pré-requisitos:
-- 1. Sprint 1 aplicada
-- 2. supabase-schema-finance-wallet-shadow-sprint2.sql aplicada

begin;

select public.finance_ensure_wallet_feature_flags();
select public.finance_ensure_shadow_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_shadow_sprint2';
  v_conta_id text;
  v_orcamento_id text := 'test_orc_shadow_sprint2';
  v_response record;
  v_items jsonb;
  v_count integer;
  v_charge_id text;
begin
  select e.id
    into v_empresa_id
  from public.empresa e
  order by e.created_date asc nulls last, e.id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 2.';
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
    'Carteira Teste Shadow Sprint 2',
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
    raise exception 'Backfill não criou carteira_conta para o teste shadow.';
  end if;

  insert into public.orcamento (
    id,
    empresa_id,
    cliente_id,
    caes,
    subtotal_hospedagem,
    subtotal_servicos,
    subtotal_transporte,
    desconto_total,
    valor_total,
    status,
    observacoes,
    data_validade,
    created_date,
    updated_date
  )
  values (
    v_orcamento_id,
    v_empresa_id,
    v_carteira_id,
    '[]'::jsonb,
    140.00,
    80.00,
    0,
    20.00,
    220.00,
    'aprovado',
    'Orçamento de teste shadow Sprint 2',
    current_date + 7,
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

  v_items := jsonb_build_array(
    jsonb_build_object(
      'source_key', 'shadow|orcamento|test_orc_shadow_sprint2|dog_1|hospedagem_diaria|2026-05-20|0',
      'source_group_key', 'shadow|orcamento|test_orc_shadow_sprint2|hospedagem|2026-05-20',
      'tipo_item', 'hospedagem_diaria',
      'descricao', 'Hospedagem diária - Duque - 2026-05-20',
      'service_date', '2026-05-20',
      'due_date', '2026-05-20',
      'valor_original', 50.00,
      'valor_desconto', 0,
      'valor_multa', 0,
      'valor_final', 50.00,
      'metadata', jsonb_build_object('dog_id', 'dog_1', 'dog_nome', 'Duque')
    ),
    jsonb_build_object(
      'source_key', 'shadow|orcamento|test_orc_shadow_sprint2|dog_1|hospedagem_diaria|2026-05-21|1',
      'source_group_key', 'shadow|orcamento|test_orc_shadow_sprint2|hospedagem|2026-05-21',
      'tipo_item', 'hospedagem_diaria',
      'descricao', 'Hospedagem diária - Duque - 2026-05-21',
      'service_date', '2026-05-21',
      'due_date', '2026-05-21',
      'valor_original', 50.00,
      'valor_desconto', 0,
      'valor_multa', 0,
      'valor_final', 50.00,
      'metadata', jsonb_build_object('dog_id', 'dog_1', 'dog_nome', 'Duque')
    ),
    jsonb_build_object(
      'source_key', 'shadow|orcamento|test_orc_shadow_sprint2|dog_2|hospedagem_diaria|2026-05-20|0',
      'source_group_key', 'shadow|orcamento|test_orc_shadow_sprint2|hospedagem_compartilhada|2026-05-20|dog_2,dog_3',
      'tipo_item', 'hospedagem_diaria',
      'descricao', 'Hospedagem diária compartilhada - Dogue e Feijuca - 2026-05-20',
      'service_date', '2026-05-20',
      'due_date', '2026-05-20',
      'valor_original', 60.00,
      'valor_desconto', 20.00,
      'valor_multa', 0,
      'valor_final', 40.00,
      'metadata', jsonb_build_object('dog_id', 'dog_2', 'dog_nome', 'Dogue', 'shared_group_dog_ids', jsonb_build_array('dog_2', 'dog_3'))
    ),
    jsonb_build_object(
      'source_key', 'shadow|orcamento|test_orc_shadow_sprint2|dog_1|banho|2026-05-22',
      'source_group_key', 'shadow|orcamento|test_orc_shadow_sprint2|banho',
      'tipo_item', 'banho',
      'descricao', 'Banho - Duque - Pacote com desconto',
      'service_date', '2026-05-22',
      'due_date', '2026-05-22',
      'valor_original', 80.00,
      'valor_desconto', 0,
      'valor_multa', 0,
      'valor_final', 80.00,
      'metadata', jsonb_build_object('dog_id', 'dog_1', 'dog_nome', 'Duque', 'package_behavior', 'billable')
    )
  );

  select *
    into v_response
  from public.finance_shadow_sync_orcamento(
    p_orcamento_id := v_orcamento_id,
    p_empresa_id := v_empresa_id,
    p_carteira_id := v_carteira_id,
    p_due_date := current_date + 7,
    p_status := 'aprovado',
    p_items := v_items,
    p_payload := jsonb_build_object('scope', 'shadow_test_sprint2')
  );

  if v_response.skipped is distinct from true or v_response.skipped_reason <> 'feature flags desligadas' then
    raise exception 'Com flags desligadas, o sync shadow deveria ser pulado.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.obligations_enabled', 'finance.charges_enabled')
    and empresa_id = v_empresa_id;

  select *
    into v_response
  from public.finance_shadow_sync_orcamento(
    p_orcamento_id := v_orcamento_id,
    p_empresa_id := v_empresa_id,
    p_carteira_id := v_carteira_id,
    p_due_date := current_date + 7,
    p_status := 'aprovado',
    p_items := v_items,
    p_payload := jsonb_build_object('scope', 'shadow_test_sprint2')
  );

  if coalesce(v_response.created_obligations, 0) <> 4 then
    raise exception 'Esperado criar 4 obrigações no primeiro sync shadow, obtido %.', v_response.created_obligations;
  end if;

  if coalesce(v_response.created_charges, 0) <> 1 then
    raise exception 'Esperado criar 1 cobrança shadow no primeiro sync, obtido %.', v_response.created_charges;
  end if;

  if coalesce(v_response.created_charge_items, 0) <> 4 then
    raise exception 'Esperado criar 4 itens de cobrança no primeiro sync, obtido %.', v_response.created_charge_items;
  end if;

  v_charge_id := v_response.charge_id;
  if v_charge_id is null then
    raise exception 'Charge id não retornado no primeiro sync shadow.';
  end if;

  select count(*)
    into v_count
  from public.obrigacao_financeira ofn
  where ofn.orcamento_id = v_orcamento_id
    and ofn.status <> 'cancelada';

  if v_count <> 4 then
    raise exception 'Esperado 4 obrigações ativas, obtido %.', v_count;
  end if;

  select count(*)
    into v_count
  from public.cobranca_item ci
  where ci.cobranca_financeira_id = v_charge_id;

  if v_count <> 4 then
    raise exception 'Esperado 4 itens vinculados à cobrança shadow, obtido %.', v_count;
  end if;

  select *
    into v_response
  from public.finance_shadow_sync_orcamento(
    p_orcamento_id := v_orcamento_id,
    p_empresa_id := v_empresa_id,
    p_carteira_id := v_carteira_id,
    p_due_date := current_date + 7,
    p_status := 'aprovado',
    p_items := v_items,
    p_payload := jsonb_build_object('scope', 'shadow_test_sprint2_resync')
  );

  select count(*)
    into v_count
  from public.obrigacao_financeira ofn
  where ofn.orcamento_id = v_orcamento_id;

  if v_count <> 4 then
    raise exception 'Idempotência falhou: esperado 4 obrigações após resync, obtido %.', v_count;
  end if;

  select count(*)
    into v_count
  from public.cobranca_financeira cfn
  where cfn.orcamento_id = v_orcamento_id;

  if v_count <> 1 then
    raise exception 'Idempotência falhou: esperado 1 cobrança após resync, obtido %.', v_count;
  end if;

  select count(*)
    into v_count
  from public.cobranca_item ci
  where ci.cobranca_financeira_id = v_charge_id;

  if v_count <> 4 then
    raise exception 'Idempotência falhou: esperado 4 itens após resync, obtido %.', v_count;
  end if;

  select *
    into v_response
  from public.finance_shadow_sync_orcamento(
    p_orcamento_id := v_orcamento_id,
    p_empresa_id := v_empresa_id,
    p_carteira_id := v_carteira_id,
    p_due_date := current_date + 7,
    p_status := 'rascunho',
    p_items := '[]'::jsonb,
    p_payload := jsonb_build_object('scope', 'shadow_test_sprint2_cancel')
  );

  select count(*)
    into v_count
  from public.obrigacao_financeira ofn
  where ofn.orcamento_id = v_orcamento_id
    and ofn.status = 'cancelada';

  if v_count <> 4 then
    raise exception 'Esperado cancelar 4 obrigações no sync com status rascunho, obtido %.', v_count;
  end if;

  select count(*)
    into v_count
  from public.cobranca_financeira cfn
  where cfn.orcamento_id = v_orcamento_id
    and cfn.status = 'cancelada';

  if v_count <> 1 then
    raise exception 'Esperado cancelar 1 cobrança no sync com status rascunho, obtido %.', v_count;
  end if;
end;
$$;

rollback;

-- TESTE MANUAL DE CONCORRÊNCIA (duas sessões)
-- Sessão A:
--   begin;
--   select * from public.finance_shadow_sync_orcamento(
--     p_orcamento_id := 'test_orc_shadow_sprint2',
--     p_empresa_id := '<empresa_id>',
--     p_carteira_id := 'test_wallet_shadow_sprint2',
--     p_due_date := current_date,
--     p_status := 'aprovado',
--     p_items := '[...]'::jsonb
--   );
--   -- manter a transação aberta
--
-- Sessão B:
--   begin;
--   select * from public.finance_shadow_sync_orcamento(
--     p_orcamento_id := 'test_orc_shadow_sprint2',
--     p_empresa_id := '<empresa_id>',
--     p_carteira_id := 'test_wallet_shadow_sprint2',
--     p_due_date := current_date,
--     p_status := 'aprovado',
--     p_items := '[...]'::jsonb
--   );
-- Esperado:
--   a Sessão B aguarda o lock do orçamento/carteira_conta e não duplica obrigações nem cobranças.
