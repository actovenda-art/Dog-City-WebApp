-- Sprint 4 - Testes SQL do orçamento + saldo + consumo cronológico controlado
-- Pre-requisitos:
-- 1. Sprint 1 aplicada
-- 2. Sprint 2 aplicada
-- 3. Sprint 3 aplicada
-- 4. supabase/supabase-schema-finance-wallet-budget-sprint4.sql aplicada

begin;

select *
from public.finance_ensure_wallet_feature_flags();

select *
from public.finance_ensure_wallet_budget_feature_flags();

do $$
declare
  v_empresa_id text;
  v_carteira_id text := 'test_wallet_budget_sprint4';
  v_conta_id text;
  v_orcamento_id text := 'test_orcamento_budget_sprint4';
  v_preview record;
  v_auth record;
  v_allocation jsonb;
  v_count integer;
begin
  select e.id
    into v_empresa_id
  from public.empresa e
  order by e.created_date asc nulls last, e.id asc
  limit 1;

  if v_empresa_id is null then
    raise exception 'Nenhuma empresa encontrada para os testes da Sprint 4.';
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
    'Carteira Teste Sprint 4',
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
    125.00,
    'enviado',
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

  perform public.finance_backfill_carteira_conta();

  select cc.id
    into v_conta_id
  from public.carteira_conta cc
  where cc.carteira_id = v_carteira_id;

  if v_conta_id is null then
    raise exception 'Backfill nao criou carteira_conta para o teste Sprint 4.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in ('finance.wallet_account_enabled', 'finance.wallet_ledger_enabled')
    and empresa_id = v_empresa_id;

  perform *
  from public.finance_apply_wallet_operation(
    p_carteira_conta_id := v_conta_id,
    p_operacao_idempotencia := 'test_sprint4_credito_base',
    p_tipo := 'credito_manual',
    p_natureza := 'entrada',
    p_origem := 'test_budget',
    p_valor := 200.00,
    p_referencia_amigavel := 'Credito base Sprint 4',
    p_descricao := 'Credito base para simulacao',
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scope', 'sprint4_test'),
    p_permitir_saldo_negativo := true
  );

  insert into public.obrigacao_financeira (
    id,
    empresa_id,
    carteira_id,
    carteira_conta_id,
    orcamento_id,
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
      'test_obrigacao_vencida_sprint4',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'shadow',
      'day_care',
      'shadow|vencida',
      'Obrigacao vencida',
      current_date - interval '2 day',
      current_date - interval '1 day',
      50.00,
      50.00,
      50.00,
      'vencida',
      '{}'::jsonb,
      now() - interval '3 day',
      now() - interval '3 day'
    ),
    (
      'test_obrigacao_hoje_sprint4',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'shadow',
      'banho',
      'shadow|hoje',
      'Obrigacao vence hoje',
      current_date,
      current_date,
      30.00,
      30.00,
      30.00,
      'aberta',
      '{}'::jsonb,
      now() - interval '2 day',
      now() - interval '2 day'
    ),
    (
      'test_obrigacao_futura_sprint4',
      v_empresa_id,
      v_carteira_id,
      v_conta_id,
      v_orcamento_id,
      'shadow',
      'tosa',
      'shadow|futura',
      'Obrigacao futura',
      current_date + interval '2 day',
      current_date + interval '2 day',
      20.00,
      20.00,
      20.00,
      'aberta',
      '{}'::jsonb,
      now() - interval '1 day',
      now() - interval '1 day'
    )
  on conflict (id) do update
  set
    valor_em_aberto = excluded.valor_em_aberto,
    status = excluded.status,
    updated_date = now();

  select *
    into v_preview
  from public.finance_wallet_budget_read_context(v_empresa_id, v_carteira_id);

  if v_preview.wallet_budget_balance_enabled is not false then
    raise exception 'A flag wallet_budget_balance_enabled deveria nascer desligada.';
  end if;

  begin
    perform *
    from public.finance_preview_budget_consumption(
      p_carteira_conta_id := v_conta_id,
      p_valor_orcamento_total := 125.00,
      p_valor_saldo_solicitado := 125.00,
      p_preview_items := jsonb_build_array(
        jsonb_build_object(
          'source_key', 'preview|orcamento|1',
          'descricao', 'Banho Duke',
          'service_date', to_char(current_date + interval '5 day', 'YYYY-MM-DD'),
          'due_date', to_char(current_date + interval '5 day', 'YYYY-MM-DD'),
          'valor_final', 125.00,
          'metadata', jsonb_build_object('dog_nome', 'Duke')
        )
      )
    );
    raise exception 'finance_preview_budget_consumption deveria falhar com flag desligada.';
  exception
    when others then
      if position('chronological_consumption_enabled' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.wallet_budget_balance_enabled',
    'finance.chronological_consumption_enabled'
  )
    and empresa_id = v_empresa_id;

  select *
    into v_preview
  from public.finance_preview_budget_consumption(
    p_carteira_conta_id := v_conta_id,
    p_valor_orcamento_total := 125.00,
    p_valor_saldo_solicitado := 125.00,
    p_preview_items := jsonb_build_array(
      jsonb_build_object(
        'source_key', 'preview|orcamento|1',
        'descricao', 'Banho Duke',
        'service_date', to_char(current_date + interval '5 day', 'YYYY-MM-DD'),
        'due_date', to_char(current_date + interval '5 day', 'YYYY-MM-DD'),
        'valor_final', 125.00,
        'metadata', jsonb_build_object('dog_nome', 'Duke')
      )
    )
  );

  if round(v_preview.valor_saldo_aplicado, 2) <> 125.00 then
    raise exception 'A simulacao deveria aplicar R$ 125,00 de saldo. Obtido %.', v_preview.valor_saldo_aplicado;
  end if;

  if round(v_preview.valor_orcamento_coberto, 2) <> 25.00 then
    raise exception 'A simulacao deveria cobrir apenas R$ 25,00 do orçamento novo após priorizar obrigações antigas. Obtido %.', v_preview.valor_orcamento_coberto;
  end if;

  if round(v_preview.valor_orcamento_em_aberto, 2) <> 100.00 then
    raise exception 'O orçamento deveria permanecer com R$ 100,00 em aberto. Obtido %.', v_preview.valor_orcamento_em_aberto;
  end if;

  if v_preview.requires_authorization is not true then
    raise exception 'A simulacao deveria exigir autorização por saldo insuficiente.';
  end if;

  if jsonb_array_length(v_preview.allocations) <> 4 then
    raise exception 'A simulacao deveria retornar 4 linhas de alocacao. Obtido %.', jsonb_array_length(v_preview.allocations);
  end if;

  if (v_preview.allocations -> 0 ->> 'source_key') <> 'shadow|vencida' then
    raise exception 'A primeira alocacao deveria ser a obrigacao vencida.';
  end if;

  if (v_preview.allocations -> 1 ->> 'source_key') <> 'shadow|hoje' then
    raise exception 'A segunda alocacao deveria ser a obrigacao vencendo hoje.';
  end if;

  if (v_preview.allocations -> 2 ->> 'source_key') <> 'shadow|futura' then
    raise exception 'A terceira alocacao deveria ser a obrigacao futura mais proxima.';
  end if;

  if (v_preview.allocations -> 3 ->> 'source_key') <> 'preview|orcamento|1' then
    raise exception 'O item do orçamento deveria ser alocado por último.';
  end if;

  update public.app_config
  set value = jsonb_build_object('enabled', true), updated_date = now()
  where key in (
    'finance.allow_negative_wallet_with_authorization',
    'finance.budget_authorization_enabled'
  )
    and empresa_id = v_empresa_id;

  select *
    into v_auth
  from public.finance_register_budget_authorization(
    p_carteira_conta_id := v_conta_id,
    p_orcamento_id := v_orcamento_id,
    p_motivo := 'Autorizacao controlada Sprint 4',
    p_vencimento_novo := (current_date + interval '10 day')::date,
    p_usuario_id := null,
    p_metadata := jsonb_build_object(
      'scope', 'sprint4_test',
      'valor_orcamento_em_aberto', v_preview.valor_orcamento_em_aberto
    )
  );

  if v_auth.autorizacao_financeira_id is null or v_auth.reused is not false then
    raise exception 'A autorizacao financeira deveria ser criada na primeira chamada.';
  end if;

  select *
    into v_auth
  from public.finance_register_budget_authorization(
    p_carteira_conta_id := v_conta_id,
    p_orcamento_id := v_orcamento_id,
    p_motivo := 'Autorizacao controlada Sprint 4',
    p_vencimento_novo := (current_date + interval '10 day')::date,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scope', 'sprint4_test_repeat')
  );

  if v_auth.reused is not true then
    raise exception 'A segunda autorizacao deveria reaproveitar o mesmo registro.';
  end if;

  select count(*)
    into v_count
  from public.autorizacao_financeira af
  where af.orcamento_id = v_orcamento_id
    and af.carteira_conta_id = v_conta_id
    and af.source_key = 'budget_authorization|orcamento|' || v_orcamento_id || '|carteira_conta|' || v_conta_id;

  if v_count <> 1 then
    raise exception 'Deveria existir exatamente 1 autorizacao auditavel para o orçamento. Obtido %.', v_count;
  end if;

  update public.orcamento
  set status = 'enviado', updated_date = now()
  where id = v_orcamento_id;

  select *
    into v_auth
  from public.finance_approve_budget_with_authorization(
    p_orcamento_id := v_orcamento_id,
    p_carteira_conta_id := v_conta_id,
    p_motivo := 'Aprovação controlada atômica',
    p_vencimento_novo := (current_date + interval '12 day')::date,
    p_usuario_id := null,
    p_metadata := jsonb_build_object('scope', 'sprint4_atomic_test')
  );

  if v_auth.orcamento_status <> 'aprovado' then
    raise exception 'A RPC atômica deveria retornar orçamento aprovado.';
  end if;

  select count(*)
    into v_count
  from public.autorizacao_financeira af
  where af.orcamento_id = v_orcamento_id;

  if v_count <> 1 then
    raise exception 'A aprovação atômica não deve gerar autorização órfã/duplicada. Obtido %.', v_count;
  end if;

  select *
    into v_preview
  from public.finance_preview_budget_consumption(
    p_carteira_conta_id := v_conta_id,
    p_valor_orcamento_total := 360.00,
    p_valor_saldo_solicitado := 255.00,
    p_preview_items := jsonb_build_array(
      jsonb_build_object(
        'source_key', 'preview|duque|2026-05-20',
        'descricao', 'Duque sozinho',
        'service_date', '2026-05-20',
        'due_date', '2026-05-20',
        'valor_final', 150.00,
        'metadata', jsonb_build_object('dog_nome', 'Duque')
      ),
      jsonb_build_object(
        'source_key', 'preview|dogue|2026-05-20',
        'descricao', 'Dogue compartilhado',
        'service_date', '2026-05-20',
        'due_date', '2026-05-20',
        'valor_final', 105.00,
        'metadata', jsonb_build_object('dog_nome', 'Dogue')
      ),
      jsonb_build_object(
        'source_key', 'preview|feijuca|2026-05-20',
        'descricao', 'Feijuca compartilhada',
        'service_date', '2026-05-20',
        'due_date', '2026-05-20',
        'valor_final', 105.00,
        'metadata', jsonb_build_object('dog_nome', 'Feijuca')
      )
    )
  );

  if round(v_preview.valor_saldo_aplicado, 2) <> 200.00 then
    raise exception 'A simulacao multi-cao deveria aplicar exatamente R$ 255,00.';
  end if;

  if jsonb_array_length(v_preview.allocations) <> 6 then
    raise exception 'A simulacao multi-cao deveria refletir 3 obrigações antigas + 3 itens novos. Obtido %.', jsonb_array_length(v_preview.allocations);
  end if;

  if round(v_preview.valor_orcamento_coberto, 2) <> 200.00 then
    raise exception 'A simulacao multi-cao deveria cobrir R$ 155,00 do orçamento após consumir R$ 100,00 em obrigações antigas.';
  end if;
end;
$$;

rollback;
