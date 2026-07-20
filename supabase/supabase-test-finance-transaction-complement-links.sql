-- Controlled smoke for the transaction links used by "Complementar".
-- All writes are reverted at the end.

begin;

do $$
declare
  v_empresa_id text;
  v_transaction_id text;
  v_wallet_id text;
  v_other_wallet_id text;
  v_first record;
  v_retry record;
  v_count integer;
  v_redirect_rejected boolean := false;
  v_delete_rejected boolean := false;
begin
  select eb.empresa_id, eb.id
    into v_empresa_id, v_transaction_id
  from public.extratobancario eb
  where lower(coalesce(eb.tipo, '')) = 'entrada'
    and coalesce(eb.valor, 0) > 0
    and not exists (
      select 1
      from public.carteira_movimento cm
      where cm.empresa_id = eb.empresa_id
        and cm.transacao_id = eb.id
        and cm.tipo = 'entrada_direcionada'
        and cm.natureza = 'entrada'
    )
  order by eb.data_movimento desc nulls last, eb.created_date desc nulls last
  limit 1;

  if v_transaction_id is null then
    raise notice 'Entrada sem vinculo nao encontrada; smoke de entrada ignorado.';
    return;
  end if;

  select c.id
    into v_wallet_id
  from public.carteira c
  where c.empresa_id = v_empresa_id
    and c.ativo is not false
  order by c.created_date
  limit 1;

  if v_wallet_id is null then
    raise notice 'Carteira ativa nao encontrada; smoke de entrada ignorado.';
    return;
  end if;

  select * into v_first
  from public.finance_link_bank_entry_to_wallet(
    v_empresa_id,
    v_transaction_id,
    v_wallet_id,
    null,
    'Smoke controlado do Complementar'
  );

  select * into v_retry
  from public.finance_link_bank_entry_to_wallet(
    v_empresa_id,
    v_transaction_id,
    v_wallet_id,
    null,
    'Retry controlado do Complementar'
  );

  if v_first.wallet_movement_id is null
    or v_retry.wallet_movement_id <> v_first.wallet_movement_id
    or v_retry.reused is not true then
    raise exception 'Retry da entrada nao reutilizou o mesmo movimento.';
  end if;

  select count(*) into v_count
  from public.carteira_movimento cm
  where cm.empresa_id = v_empresa_id
    and cm.transacao_id = v_transaction_id
    and cm.tipo = 'entrada_direcionada'
    and cm.natureza = 'entrada';

  if v_count <> 1 then
    raise exception 'Entrada gerou % movimentos em vez de um.', v_count;
  end if;

  begin
    delete from public.extratobancario
    where id = v_transaction_id;
  exception when foreign_key_violation then
    v_delete_rejected := true;
  end;

  if not v_delete_rejected then
    raise exception 'Foi possivel excluir uma transacao que sustenta um movimento de carteira.';
  end if;

  select c.id
    into v_other_wallet_id
  from public.carteira c
  where c.empresa_id = v_empresa_id
    and c.ativo is not false
    and c.id <> v_wallet_id
  order by c.created_date
  limit 1;

  if v_other_wallet_id is not null then
    begin
      perform *
      from public.finance_link_bank_entry_to_wallet(
        v_empresa_id,
        v_transaction_id,
        v_other_wallet_id,
        null,
        'Tentativa controlada de redirecionamento'
      );
    exception when others then
      v_redirect_rejected := position('outra carteira' in lower(sqlerrm)) > 0
        or position('redirecion' in lower(sqlerrm)) > 0;
    end;

    if not v_redirect_rejected then
      raise exception 'A entrada vinculada aceitou redirecionamento para outra carteira.';
    end if;
  end if;
end;
$$;

do $$
declare
  v_empresa_id text;
  v_transaction_id text;
  v_payable_id text;
  v_output_amount numeric(14,2);
  v_first record;
  v_retry record;
  v_link_count integer;
  v_guard_payable_id text;
  v_reuse_rejected boolean := false;
  v_delete_rejected boolean := false;
begin
  select eb.empresa_id, eb.id, l.id, round(abs(eb.valor), 2)
    into v_empresa_id, v_transaction_id, v_payable_id, v_output_amount
  from public.extratobancario eb
  join public.lancamento l
    on l.empresa_id = eb.empresa_id
   and greatest(
     coalesce(l.valor, 0) + coalesce(l.juros_multa, 0) - coalesce(l.valor_quitado, 0),
     0
   ) >= abs(coalesce(eb.valor, 0))
  where lower(coalesce(eb.tipo, '')) = 'saida'
    and coalesce(eb.valor, 0) <> 0
    and coalesce(eb.vinculo_financeiro, '') = ''
    and lower(coalesce(l.status, '')) not in ('cancelado', 'cancelada', 'quitado', 'quitada', 'pago', 'realizado_hoje')
    and not exists (
      select 1
      from public.lancamento linked
      cross join lateral jsonb_array_elements(coalesce(linked.vinculacoes, '[]'::jsonb)) link(value)
      where linked.empresa_id = eb.empresa_id
        and link.value ->> 'transaction_id' = eb.id
    )
  order by eb.data_movimento desc nulls last, l.vencimento
  limit 1;

  if v_transaction_id is null or v_payable_id is null then
    select eb.empresa_id, eb.id, round(abs(eb.valor), 2)
      into v_empresa_id, v_transaction_id, v_output_amount
    from public.extratobancario eb
    where lower(coalesce(eb.tipo, '')) = 'saida'
      and coalesce(eb.valor, 0) <> 0
      and coalesce(eb.vinculo_financeiro, '') = ''
      and not exists (
        select 1
        from public.lancamento linked
        cross join lateral jsonb_array_elements(coalesce(linked.vinculacoes, '[]'::jsonb)) link(value)
        where linked.empresa_id = eb.empresa_id
          and link.value ->> 'transaction_id' = eb.id
      )
    order by eb.data_movimento desc nulls last
    limit 1;

    if v_transaction_id is null then
      raise notice 'Saida sem vinculo nao encontrada; smoke de saida ignorado.';
      return;
    end if;

    insert into public.lancamento (
      empresa_id,
      descricao,
      valor,
      tipo,
      categoria,
      recebedor,
      vencimento,
      status
    ) values (
      v_empresa_id,
      'Conta temporaria do smoke Complementar',
      v_output_amount,
      'saida',
      'Smoke controlado',
      'Fornecedor temporario',
      current_date,
      'pendente'
    ) returning id into v_payable_id;
  end if;

  select * into v_first
  from public.finance_link_bank_output_to_payable(
    v_empresa_id,
    v_transaction_id,
    v_payable_id,
    null,
    'Smoke controlado do Complementar'
  );

  select * into v_retry
  from public.finance_link_bank_output_to_payable(
    v_empresa_id,
    v_transaction_id,
    v_payable_id,
    null,
    'Retry controlado do Complementar'
  );

  if v_retry.payable_id <> v_first.payable_id or v_retry.reused is not true then
    raise exception 'Retry da saida nao reutilizou o mesmo vinculo.';
  end if;

  select count(*) into v_link_count
  from public.lancamento l
  cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) link(value)
  where l.empresa_id = v_empresa_id
    and l.id = v_payable_id
    and link.value ->> 'transaction_id' = v_transaction_id;

  if v_link_count <> 1 then
    raise exception 'Saida gerou % vinculos na conta a pagar em vez de um.', v_link_count;
  end if;

  insert into public.lancamento (
    empresa_id,
    descricao,
    valor,
    tipo,
    categoria,
    recebedor,
    vencimento,
    status
  ) values (
    v_empresa_id,
    'Segunda conta temporaria do guard anti-reuso',
    v_output_amount,
    'saida',
    'Smoke controlado',
    'Fornecedor temporario',
    current_date,
    'pendente'
  ) returning id into v_guard_payable_id;

  begin
    update public.lancamento
    set vinculacoes = jsonb_build_array(jsonb_build_object(
      'transaction_id', v_transaction_id,
      'valor_vinculado', v_output_amount
    ))
    where id = v_guard_payable_id;
  exception when others then
    v_reuse_rejected := position('outra conta a pagar' in lower(sqlerrm)) > 0;
  end;

  if not v_reuse_rejected then
    raise exception 'O caminho legado reutilizou uma saida em uma segunda conta a pagar.';
  end if;

  begin
    delete from public.extratobancario
    where id = v_transaction_id;
  exception when others then
    v_delete_rejected := position('nao pode ser excluida' in lower(sqlerrm)) > 0;
  end;

  if not v_delete_rejected then
    raise exception 'Foi possivel excluir uma saida vinculada a uma conta a pagar.';
  end if;
end;
$$;

rollback;
