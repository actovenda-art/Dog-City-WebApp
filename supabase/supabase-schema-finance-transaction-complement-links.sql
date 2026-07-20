-- Official transaction links used by the "Complementar" flow.
-- Entries are linked to exactly one wallet. Outputs are linked to one payable.

begin;

-- A wallet movement backed by a bank transaction must keep its canonical
-- Transactions record. Existing rows were audited before this constraint was
-- hardened, so changing SET NULL to RESTRICT does not rewrite financial data.
alter table public.carteira_movimento
  drop constraint if exists carteira_movimento_transacao_id_fkey;

alter table public.carteira_movimento
  add constraint carteira_movimento_transacao_id_fkey
  foreign key (transacao_id)
  references public.extratobancario(id)
  on delete restrict;

create unique index if not exists uq_carteira_movimento_bank_entry
  on public.carteira_movimento (empresa_id, transacao_id)
  where transacao_id is not null
    and tipo = 'entrada_direcionada'
    and natureza = 'entrada';

create or replace function public.finance_guard_unique_payable_transaction_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link jsonb;
  v_transaction_id text;
begin
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.vinculacoes, '[]'::jsonb)) item(value)
    where coalesce(trim(item.value ->> 'transaction_id'), '') <> ''
    group by item.value ->> 'transaction_id'
    having count(*) > 1
  ) then
    raise exception 'Uma mesma saida bancaria nao pode ser repetida na conta a pagar.';
  end if;

  for v_link in
    select value
    from jsonb_array_elements(coalesce(new.vinculacoes, '[]'::jsonb)) item(value)
  loop
    v_transaction_id := nullif(trim(v_link ->> 'transaction_id'), '');
    if v_transaction_id is null then
      continue;
    end if;

    -- Serialize every writer, including legacy screens that update the JSON
    -- directly instead of using the official Complementar RPC.
    perform pg_advisory_xact_lock(
      hashtextextended(
        'finance-payable-output|' || coalesce(new.empresa_id, '') || '|' || v_transaction_id,
        0
      )
    );

    if exists (
      select 1
      from public.lancamento l
      cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) linked(value)
      where l.empresa_id = new.empresa_id
        and l.id <> new.id
        and linked.value ->> 'transaction_id' = v_transaction_id
    ) then
      raise exception 'Esta saida bancaria ja esta vinculada a outra conta a pagar.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_finance_guard_unique_payable_transaction_link
  on public.lancamento;

create trigger trg_finance_guard_unique_payable_transaction_link
before insert or update of empresa_id, vinculacoes
on public.lancamento
for each row
execute function public.finance_guard_unique_payable_transaction_link();

create or replace function public.finance_guard_delete_linked_bank_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.lancamento l
    cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) linked(value)
    where l.empresa_id = old.empresa_id
      and linked.value ->> 'transaction_id' = old.id
  ) then
    raise exception 'A transacao esta vinculada a uma conta a pagar e nao pode ser excluida.';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_finance_guard_delete_linked_bank_transaction
  on public.extratobancario;

create trigger trg_finance_guard_delete_linked_bank_transaction
before delete
on public.extratobancario
for each row
execute function public.finance_guard_delete_linked_bank_transaction();

create or replace function public.finance_can_link_transaction(p_empresa_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
  v_has_unit_access boolean := false;
  v_haystack text := '';
  v_has_permission boolean := false;
begin
  if auth.uid() is null then
    return true;
  end if;

  select *
    into v_user
  from public.users
  where id = auth.uid()::text
    and active is not false
  limit 1;

  if not found then
    return false;
  end if;

  if v_user.is_platform_admin is true or lower(coalesce(v_user.company_role, '')) = 'platform_admin' then
    return true;
  end if;

  v_has_unit_access := v_user.empresa_id = p_empresa_id
    or exists (
      select 1
      from public.user_unit_access uua
      where uua.user_id = v_user.id
        and uua.empresa_id = p_empresa_id
        and uua.ativo is true
    );

  if not v_has_unit_access then
    return false;
  end if;

  select coalesce(string_agg(lower(value), ' '), '')
    into v_haystack
  from (
    select coalesce(v_user.profile, '') as value
    union all select coalesce(v_user.company_role, '')
    union all
    select coalesce(uua.papel, '')
    from public.user_unit_access uua
    where uua.user_id = v_user.id
      and uua.empresa_id = p_empresa_id
      and uua.ativo is true
    union all
    select coalesce(pa.codigo, '')
    from public.perfil_acesso pa
    where pa.id = v_user.access_profile_id
      and pa.ativo is not false
    union all
    select coalesce(pa.nome, '')
    from public.perfil_acesso pa
    where pa.id = v_user.access_profile_id
      and pa.ativo is not false
  ) roles;

  select exists (
    select 1
    from public.perfil_acesso pa
    cross join lateral jsonb_array_elements_text(coalesce(pa.permissoes, '[]'::jsonb)) permission(value)
    where pa.ativo is not false
      and (
        pa.id = v_user.access_profile_id
        or pa.id in (
          select uua.access_profile_id
          from public.user_unit_access uua
          where uua.user_id = v_user.id
            and uua.empresa_id = p_empresa_id
            and uua.ativo is true
        )
      )
      and lower(permission.value) in ('financeiro:update', 'financeiro:*', 'platform:*')
  ) into v_has_permission;

  return v_has_permission or v_haystack ~ '(gestor|gestora|gerencia|gerencial|financeiro|administrativo|backoffice|diretoria|master)';
end;
$$;

create or replace function public.finance_link_bank_entry_to_wallet(
  p_empresa_id text,
  p_transacao_id text,
  p_carteira_id text,
  p_usuario_id text default null,
  p_observacao text default null
)
returns table (
  wallet_movement_id text,
  carteira_conta_id text,
  carteira_id text,
  transacao_id text,
  linked_amount numeric,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.extratobancario%rowtype;
  v_wallet public.carteira%rowtype;
  v_account public.carteira_conta%rowtype;
  v_existing public.carteira_movimento%rowtype;
  v_result record;
begin
  if coalesce(trim(p_empresa_id), '') = '' or coalesce(trim(p_transacao_id), '') = '' or coalesce(trim(p_carteira_id), '') = '' then
    raise exception 'Empresa, transacao e carteira sao obrigatorias.';
  end if;
  if not public.finance_can_link_transaction(p_empresa_id) then
    raise exception 'Seu perfil nao possui permissao para vincular transacoes financeiras nesta unidade.';
  end if;

  select * into v_transaction
  from public.extratobancario
  where id = p_transacao_id
    and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Transacao bancaria nao localizada nesta unidade.';
  end if;
  if lower(coalesce(v_transaction.tipo, '')) <> 'entrada' then
    raise exception 'Somente transacoes de entrada podem ser vinculadas a uma carteira.';
  end if;
  if coalesce(v_transaction.valor, 0) <= 0 then
    raise exception 'A transacao precisa possuir valor positivo para ser vinculada.';
  end if;

  select * into v_wallet
  from public.carteira
  where id = p_carteira_id
    and empresa_id = p_empresa_id
    and ativo is not false
  limit 1;
  if not found then
    raise exception 'Carteira nao localizada ou inativa nesta unidade.';
  end if;

  select * into v_account
  from public.carteira_conta cc
  where cc.carteira_id = v_wallet.id
  for update;

  if not found then
    insert into public.carteira_conta (
      empresa_id,
      carteira_id,
      saldo_atual,
      saldo_negativo_autorizado,
      ativo,
      observacoes_financeiras
    ) values (
      p_empresa_id,
      v_wallet.id,
      0,
      false,
      true,
      'Conta criada automaticamente ao vincular uma entrada bancaria.'
    )
    returning * into v_account;
  end if;

  select * into v_existing
  from public.carteira_movimento cm
  where cm.empresa_id = p_empresa_id
    and cm.transacao_id = p_transacao_id
    and cm.tipo = 'entrada_direcionada'
    and cm.natureza = 'entrada'
  limit 1;

  if found then
    if v_existing.carteira_conta_id <> v_account.id then
      raise exception 'Esta entrada ja esta vinculada a outra carteira e nao pode ser creditada novamente.';
    end if;

    update public.extratobancario
    set
      vinculo_financeiro = v_wallet.id,
      carteira_nome = coalesce(nullif(v_wallet.nome_razao_social, ''), v_wallet.id),
      metadata_financeira = coalesce(metadata_financeira, '{}'::jsonb) || jsonb_build_object(
        'link_type', 'carteira',
        'carteira_id', v_wallet.id,
        'wallet_movement_id', v_existing.id,
        'linked_at', now(),
        'linked_by_user_id', p_usuario_id
      ),
      observacoes = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), observacoes),
      updated_date = now()
    where id = p_transacao_id;

    wallet_movement_id := v_existing.id;
    carteira_conta_id := v_account.id;
    carteira_id := v_wallet.id;
    transacao_id := p_transacao_id;
    linked_amount := v_existing.valor;
    reused := true;
    return next;
    return;
  end if;

  select * into v_result
  from public.finance_wallet_admin_apply_operation(
    p_carteira_conta_id := v_account.id,
    p_operacao_idempotencia := 'extrato_bancario|' || p_transacao_id || '|entrada_direcionada',
    p_tipo := 'entrada_direcionada',
    p_natureza := 'entrada',
    p_valor := abs(v_transaction.valor),
    p_referencia_amigavel := 'Entrada bancaria - ' || coalesce(nullif(v_transaction.nome_contraparte, ''), p_transacao_id),
    p_motivo := 'Recarga de carteira vinculada a transacao bancaria',
    p_observacao := coalesce(nullif(trim(coalesce(p_observacao, '')), ''), 'Vinculo realizado pela tela de Transacoes.'),
    p_origem := 'transacao_bancaria_direcionada',
    p_transacao_id := p_transacao_id,
    p_usuario_id := p_usuario_id,
    p_metadata := jsonb_build_object(
      'source', 'movimentacoes_complementar',
      'carteira_id', v_wallet.id,
      'carteira_nome', coalesce(nullif(v_wallet.nome_razao_social, ''), v_wallet.id)
    )
  );

  update public.extratobancario
  set
    vinculo_financeiro = v_wallet.id,
    carteira_nome = coalesce(nullif(v_wallet.nome_razao_social, ''), v_wallet.id),
    metadata_financeira = coalesce(metadata_financeira, '{}'::jsonb) || jsonb_build_object(
      'link_type', 'carteira',
      'carteira_id', v_wallet.id,
      'wallet_movement_id', v_result.movimento_id,
      'linked_at', now(),
      'linked_by_user_id', p_usuario_id
    ),
    observacoes = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), observacoes),
    updated_date = now()
  where id = p_transacao_id;

  wallet_movement_id := v_result.movimento_id;
  carteira_conta_id := v_account.id;
  carteira_id := v_wallet.id;
  transacao_id := p_transacao_id;
  linked_amount := abs(v_transaction.valor);
  reused := coalesce(v_result.reused, false);
  return next;
end;
$$;

create or replace function public.finance_link_bank_output_to_payable(
  p_empresa_id text,
  p_transacao_id text,
  p_lancamento_id text,
  p_usuario_id text default null,
  p_observacao text default null
)
returns table (
  payable_id text,
  expense_id text,
  transacao_id text,
  linked_amount numeric,
  remaining_amount numeric,
  payable_status text,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.extratobancario%rowtype;
  v_payable public.lancamento%rowtype;
  v_existing_payable_id text;
  v_existing_link jsonb;
  v_total numeric(14,2);
  v_paid_before numeric(14,2);
  v_link_amount numeric(14,2);
  v_paid_after numeric(14,2);
  v_status text;
  v_expense_id text;
  v_payment_date date;
begin
  if coalesce(trim(p_empresa_id), '') = '' or coalesce(trim(p_transacao_id), '') = '' or coalesce(trim(p_lancamento_id), '') = '' then
    raise exception 'Empresa, transacao e conta a pagar sao obrigatorias.';
  end if;
  if not public.finance_can_link_transaction(p_empresa_id) then
    raise exception 'Seu perfil nao possui permissao para vincular transacoes financeiras nesta unidade.';
  end if;

  select * into v_transaction
  from public.extratobancario
  where id = p_transacao_id
    and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Transacao bancaria nao localizada nesta unidade.';
  end if;
  if lower(coalesce(v_transaction.tipo, '')) <> 'saida' then
    raise exception 'Somente transacoes de saida podem ser vinculadas a contas a pagar.';
  end if;

  select * into v_payable
  from public.lancamento
  where id = p_lancamento_id
    and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Conta a pagar nao localizada nesta unidade.';
  end if;

  select l.id, link.value
    into v_existing_payable_id, v_existing_link
  from public.lancamento l
  cross join lateral jsonb_array_elements(coalesce(l.vinculacoes, '[]'::jsonb)) link(value)
  where l.empresa_id = p_empresa_id
    and link.value ->> 'transaction_id' = p_transacao_id
  limit 1;

  if v_existing_payable_id is not null then
    if v_existing_payable_id <> v_payable.id then
      raise exception 'Esta saida ja esta vinculada a outra conta a pagar.';
    end if;

    select d.id into v_expense_id
    from public.despesa d
    where d.transacao_id = p_transacao_id
    limit 1;

    payable_id := v_payable.id;
    expense_id := v_expense_id;
    transacao_id := p_transacao_id;
    linked_amount := coalesce((v_existing_link ->> 'valor_vinculado')::numeric, abs(v_transaction.valor));
    remaining_amount := greatest(coalesce(v_payable.valor, 0) + coalesce(v_payable.juros_multa, 0) - coalesce(v_payable.valor_quitado, 0), 0);
    payable_status := v_payable.status;
    reused := true;
    return next;
    return;
  end if;

  if coalesce(nullif(v_transaction.vinculo_financeiro, ''), '') <> '' then
    raise exception 'Esta saida ja possui um vinculo financeiro e nao pode ser utilizada novamente.';
  end if;

  v_total := round(coalesce(v_payable.valor, 0) + coalesce(v_payable.juros_multa, 0), 2);
  v_paid_before := round(coalesce(v_payable.valor_quitado, 0), 2);
  v_link_amount := round(abs(coalesce(v_transaction.valor, 0)), 2);
  if v_link_amount <= 0 then
    raise exception 'A transacao precisa possuir valor positivo para ser vinculada.';
  end if;
  if v_paid_before >= v_total then
    raise exception 'Esta conta a pagar ja esta quitada.';
  end if;
  if v_link_amount > (v_total - v_paid_before) + 0.005 then
    raise exception 'O valor da saida excede o saldo desta conta a pagar. Use o rateio em Contas a Pagar.';
  end if;

  v_paid_after := round(v_paid_before + v_link_amount, 2);
  v_payment_date := coalesce(v_transaction.data_movimento, v_transaction.data, current_date);
  v_status := case when v_paid_after >= v_total then 'realizado_hoje' else coalesce(nullif(v_payable.status, ''), 'pendente') end;

  update public.lancamento l
  set
    vinculacoes = coalesce(vinculacoes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'transaction_id', p_transacao_id,
      'valor_vinculado', v_link_amount,
      'data_vinculacao', v_payment_date,
      'linked_by_user_id', p_usuario_id,
      'source', 'movimentacoes_complementar'
    )),
    valor_quitado = v_paid_after,
    status = v_status,
    data_quitacao = case when v_paid_after >= v_total then v_payment_date else data_quitacao end,
    transacao_id = coalesce(l.transacao_id, p_transacao_id),
    updated_date = now()
  where id = v_payable.id;

  if v_paid_after >= v_total then
    select d.id into v_expense_id
    from public.despesa d
    where d.transacao_id = p_transacao_id
    limit 1;

    if v_expense_id is null then
      insert into public.despesa (
        empresa_id,
        descricao,
        valor,
        data_despesa,
        data,
        categoria,
        subcategoria,
        status,
        centro_custo_id,
        centro_custo_nome,
        vencimento,
        lancamento_id,
        extrato_id,
        forma_pagamento,
        fornecedor,
        observacoes,
        transacao_id,
        vinculo_transacao_id
      ) values (
        p_empresa_id,
        coalesce(nullif(v_payable.descricao, ''), concat_ws(' - ', v_payable.categoria, v_payable.recebedor), 'Conta a pagar'),
        v_total,
        v_payment_date,
        v_payment_date,
        v_payable.categoria,
        v_payable.referencia,
        'pago',
        v_payable.centro_custo_id,
        v_payable.centro_custo_nome,
        v_payable.vencimento,
        v_payable.id,
        p_transacao_id,
        v_payable.forma_pagamento,
        v_payable.recebedor,
        jsonb_build_object(
          'linked_from', 'movimentacoes_complementar',
          'linked_by_user_id', p_usuario_id,
          'observacao', nullif(trim(coalesce(p_observacao, '')), '')
        )::text,
        p_transacao_id,
        p_transacao_id
      ) returning id into v_expense_id;
    end if;

    update public.lancamento
    set
      movido_para_despesas = true,
      codigo_vinculo_financeiro = v_expense_id,
      updated_date = now()
    where id = v_payable.id;
  end if;

  update public.extratobancario
  set
    vinculo_financeiro = coalesce(v_expense_id, v_payable.id),
    metadata_financeira = coalesce(metadata_financeira, '{}'::jsonb) || jsonb_build_object(
      'link_type', 'conta_pagar',
      'lancamento_id', v_payable.id,
      'despesa_id', v_expense_id,
      'linked_amount', v_link_amount,
      'linked_at', now(),
      'linked_by_user_id', p_usuario_id
    ),
    observacoes = coalesce(nullif(trim(coalesce(p_observacao, '')), ''), observacoes),
    updated_date = now()
  where id = p_transacao_id;

  payable_id := v_payable.id;
  expense_id := v_expense_id;
  transacao_id := p_transacao_id;
  linked_amount := v_link_amount;
  remaining_amount := greatest(v_total - v_paid_after, 0);
  payable_status := v_status;
  reused := false;
  return next;
end;
$$;

revoke all on function public.finance_can_link_transaction(text) from public, anon;
revoke all on function public.finance_guard_delete_linked_bank_transaction() from public, anon;
revoke all on function public.finance_guard_unique_payable_transaction_link() from public, anon;
revoke all on function public.finance_link_bank_entry_to_wallet(text, text, text, text, text) from public, anon;
revoke all on function public.finance_link_bank_output_to_payable(text, text, text, text, text) from public, anon;

grant execute on function public.finance_can_link_transaction(text) to authenticated, service_role;
grant execute on function public.finance_link_bank_entry_to_wallet(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.finance_link_bank_output_to_payable(text, text, text, text, text) to authenticated, service_role;

commit;
