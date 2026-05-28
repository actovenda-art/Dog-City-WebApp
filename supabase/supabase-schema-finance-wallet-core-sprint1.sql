-- Sprint 1 - Infraestrutura invisível da nova carteira financeira
-- Objetivo:
-- 1. Criar a base técnica da carteira financeira
-- 2. Não alterar comportamento visível do sistema
-- 3. Preparar flags, backfill, RPCs, lock, idempotência e reconciliação
--
-- Execute após os schemas base do projeto.

create extension if not exists pgcrypto;

alter table if exists public.app_config
  add column if not exists empresa_id text;

alter table if exists public.orcamento
  add column if not exists vendedor_user_id text,
  add column if not exists status text;

update public.orcamento
set status = coalesce(nullif(status, ''), 'rascunho')
where status is null or status = '';

alter table if exists public.orcamento
  alter column status set default 'rascunho';

create index if not exists idx_orcamento_vendedor_user_id
  on public.orcamento(vendedor_user_id);

create index if not exists idx_orcamento_status_v2
  on public.orcamento(status);

create table if not exists public.carteira_conta (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_id text not null unique references public.carteira(id) on delete cascade,
  saldo_atual numeric(14,2) not null default 0,
  saldo_negativo_autorizado boolean not null default false,
  ativo boolean not null default true,
  lock_version integer not null default 0,
  ultima_reconciliacao_em timestamptz null,
  ultimo_movimento_em timestamptz null,
  observacoes_financeiras text null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint chk_carteira_conta_saldo_atual
    check (saldo_atual = round(saldo_atual, 2))
);

create index if not exists idx_carteira_conta_empresa_id
  on public.carteira_conta(empresa_id);

create index if not exists idx_carteira_conta_ativo
  on public.carteira_conta(ativo);

create table if not exists public.autorizacao_financeira (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  orcamento_id text null references public.orcamento(id) on delete set null,
  tipo text not null,
  motivo text not null,
  vencimento_novo date null,
  status text not null default 'ativa',
  usuario_id text null references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint chk_autorizacao_financeira_tipo
    check (tipo in ('saldo_negativo','pagamento_parcial','alteracao_vencimento','liberacao_sem_pagamento')),
  constraint chk_autorizacao_financeira_status
    check (status in ('ativa','revogada','consumida','expirada'))
);

create index if not exists idx_autorizacao_financeira_empresa_id
  on public.autorizacao_financeira(empresa_id);

create index if not exists idx_autorizacao_financeira_orcamento_id
  on public.autorizacao_financeira(orcamento_id, created_date desc);

create table if not exists public.carteira_movimento (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  tipo text not null,
  natureza text not null,
  origem text not null,
  operacao_idempotencia text not null,
  valor numeric(14,2) not null,
  saldo_anterior numeric(14,2) not null,
  saldo_final numeric(14,2) not null,
  referencia_amigavel text not null,
  descricao text null,
  orcamento_id text null references public.orcamento(id) on delete set null,
  appointment_id text null references public.appointment(id) on delete set null,
  obrigacao_id text null,
  transacao_id text null references public.extratobancario(id) on delete set null,
  autorizacao_financeira_id text null references public.autorizacao_financeira(id) on delete set null,
  compensado_por_movimento_id text null references public.carteira_movimento(id) on delete set null,
  usuario_id text null references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  constraint chk_carteira_movimento_tipo
    check (
      tipo in (
        'credito','debito','estorno','ajuste','compensacao',
        'multa','consumo','credito_manual','credito_compensatorio'
      )
    ),
  constraint chk_carteira_movimento_natureza
    check (natureza in ('entrada','saida')),
  constraint chk_carteira_movimento_valor
    check (valor >= 0 and valor = round(valor, 2)),
  constraint uq_carteira_movimento_idempotencia
    unique (empresa_id, operacao_idempotencia)
);

create index if not exists idx_carteira_movimento_conta_data
  on public.carteira_movimento(carteira_conta_id, created_date desc, id desc);

create index if not exists idx_carteira_movimento_transacao_id
  on public.carteira_movimento(transacao_id);

create index if not exists idx_carteira_movimento_orcamento_id
  on public.carteira_movimento(orcamento_id);

create table if not exists public.carteira_reconciliacao (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  saldo_persistido numeric(14,2) not null,
  saldo_recalculado numeric(14,2) not null,
  diferenca numeric(14,2) not null,
  status text not null,
  acao_tomada text null,
  usuario_id text null references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  constraint chk_carteira_reconciliacao_status
    check (status in ('ok','divergente','corrigida'))
);

create index if not exists idx_carteira_reconciliacao_conta_data
  on public.carteira_reconciliacao(carteira_conta_id, created_date desc);

create or replace function public.finance_set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

create or replace function public.finance_before_update_carteira_conta()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  new.lock_version = coalesce(old.lock_version, 0) + 1;
  return new;
end;
$$;

create or replace function public.finance_prevent_carteira_movimento_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'carteira_movimento é imutável. Use lançamentos compensatórios.';
end;
$$;

drop trigger if exists trg_carteira_conta_before_update on public.carteira_conta;
create trigger trg_carteira_conta_before_update
before update on public.carteira_conta
for each row
execute function public.finance_before_update_carteira_conta();

drop trigger if exists trg_autorizacao_financeira_updated_date on public.autorizacao_financeira;
create trigger trg_autorizacao_financeira_updated_date
before update on public.autorizacao_financeira
for each row
execute function public.finance_set_updated_date();

drop trigger if exists trg_carteira_movimento_immutable_update on public.carteira_movimento;
create trigger trg_carteira_movimento_immutable_update
before update on public.carteira_movimento
for each row
execute function public.finance_prevent_carteira_movimento_mutation();

drop trigger if exists trg_carteira_movimento_immutable_delete on public.carteira_movimento;
create trigger trg_carteira_movimento_immutable_delete
before delete on public.carteira_movimento
for each row
execute function public.finance_prevent_carteira_movimento_mutation();

create or replace function public.finance_get_feature_flag(
  p_flag_key text,
  p_empresa_id text default null
)
returns boolean
language sql
stable
as $$
  with scoped as (
    select value
    from public.app_config
    where key = p_flag_key
      and empresa_id = p_empresa_id
      and ativo = true
    order by updated_date desc nulls last, created_date desc nulls last
    limit 1
  ),
  global_config as (
    select value
    from public.app_config
    where key = p_flag_key
      and empresa_id is null
      and ativo = true
    order by updated_date desc nulls last, created_date desc nulls last
    limit 1
  )
  select coalesce(
    (select coalesce((value ->> 'enabled')::boolean, false) from scoped),
    (select coalesce((value ->> 'enabled')::boolean, false) from global_config),
    false
  );
$$;

drop function if exists public.finance_ensure_wallet_feature_flags();

create or replace function public.finance_ensure_wallet_feature_flags()
returns table (
  flag_key text,
  scoped_empresa_id text,
  enabled boolean
)
language plpgsql
as $$
declare
  v_empresa record;
begin
  if not exists (
    select 1 from public.app_config
    where key = 'finance.wallet_account_enabled'
      and empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_account_enabled',
      'Finance - Wallet Account Enabled',
      'Habilita a infraestrutura invisível de carteira_conta.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config
    where key = 'finance.wallet_ledger_enabled'
      and empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.wallet_ledger_enabled',
      'Finance - Wallet Ledger Enabled',
      'Habilita a infraestrutura invisível de carteira_movimento.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'empresa') then
    for v_empresa in
      select id from public.empresa
    loop
      if not exists (
        select 1 from public.app_config
        where key = 'finance.wallet_account_enabled'
          and empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_account_enabled',
          'Finance - Wallet Account Enabled',
          'Habilita a infraestrutura invisível de carteira_conta.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config
        where key = 'finance.wallet_ledger_enabled'
          and empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.wallet_ledger_enabled',
          'Finance - Wallet Ledger Enabled',
          'Habilita a infraestrutura invisível de carteira_movimento.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;
    end loop;
  end if;

  return query
  select cfg.key, cfg.empresa_id, coalesce((cfg.value ->> 'enabled')::boolean, false) as enabled
  from public.app_config cfg
  where cfg.key in ('finance.wallet_account_enabled', 'finance.wallet_ledger_enabled')
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_backfill_carteira_conta();

create or replace function public.finance_backfill_carteira_conta()
returns table (
  out_carteira_id text,
  out_carteira_conta_id text,
  out_empresa_id text,
  created_account boolean
)
language plpgsql
as $$
declare
  v_carteira record;
  v_existing_id text;
  v_resolved_empresa_id text;
  v_company_count integer := 0;
  v_single_company_id text := null;
  v_demo_company_id text := null;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'empresa') then
    select count(*), max(id)
      into v_company_count, v_single_company_id
    from public.empresa;

    select e.id
      into v_demo_company_id
    from public.empresa e
    where e.id = 'empresa_demo'
    limit 1;
  end if;

  for v_carteira in
    select c.id, c.empresa_id
    from public.carteira c
    order by c.created_date asc nulls last, c.id asc
  loop
    v_resolved_empresa_id := v_carteira.empresa_id;

    if v_resolved_empresa_id is null then
      if v_company_count = 1 then
        v_resolved_empresa_id := v_single_company_id;
      elsif v_carteira.id in ('client_1', 'client_2') and v_demo_company_id is not null then
        v_resolved_empresa_id := v_demo_company_id;
      else
        raise exception
          'Carteira % sem empresa_id e sem resolução segura automática para o backfill.',
          v_carteira.id;
      end if;
    end if;

    select id
      into v_existing_id
    from public.carteira_conta
    where carteira_id = v_carteira.id
    limit 1;

    if v_existing_id is null then
      insert into public.carteira_conta (
        empresa_id,
        carteira_id,
        saldo_atual,
        saldo_negativo_autorizado,
        ativo,
        observacoes_financeiras
      )
      values (
        v_resolved_empresa_id,
        v_carteira.id,
        0,
        false,
        true,
        'Conta criada pelo backfill inicial da Sprint 1.'
      )
      returning id into v_existing_id;

      out_carteira_id := v_carteira.id;
      out_carteira_conta_id := v_existing_id;
      out_empresa_id := v_resolved_empresa_id;
      created_account := true;
      return next;
    else
      update public.carteira_conta
      set empresa_id = coalesce(public.carteira_conta.empresa_id, v_resolved_empresa_id)
      where id = v_existing_id
        and empresa_id is null;

      out_carteira_id := v_carteira.id;
      out_carteira_conta_id := v_existing_id;
      out_empresa_id := v_resolved_empresa_id;
      created_account := false;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.finance_apply_wallet_operation(
  p_carteira_conta_id text,
  p_operacao_idempotencia text,
  p_tipo text,
  p_natureza text,
  p_origem text,
  p_valor numeric,
  p_referencia_amigavel text,
  p_descricao text default null,
  p_orcamento_id text default null,
  p_appointment_id text default null,
  p_obrigacao_id text default null,
  p_transacao_id text default null,
  p_autorizacao_financeira_id text default null,
  p_usuario_id text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_permitir_saldo_negativo boolean default true
)
returns table (
  movimento_id text,
  carteira_conta_id text,
  saldo_anterior numeric,
  saldo_final numeric,
  reused boolean
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_existing public.carteira_movimento%rowtype;
  v_delta numeric(14,2);
  v_new_balance numeric(14,2);
begin
  if coalesce(trim(p_operacao_idempotencia), '') = '' then
    raise exception 'operacao_idempotencia é obrigatória.';
  end if;

  if coalesce(trim(p_referencia_amigavel), '') = '' then
    raise exception 'referencia_amigavel é obrigatória.';
  end if;

  if p_natureza not in ('entrada', 'saida') then
    raise exception 'natureza inválida: %', p_natureza;
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'valor deve ser maior que zero.';
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % não encontrada.', p_carteira_conta_id;
  end if;

  if not public.finance_get_feature_flag('finance.wallet_account_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.wallet_account_enabled está desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  if not public.finance_get_feature_flag('finance.wallet_ledger_enabled', v_carteira_conta.empresa_id) then
    raise exception 'Feature flag finance.wallet_ledger_enabled está desligada para a empresa %.', v_carteira_conta.empresa_id;
  end if;

  select *
    into v_existing
  from public.carteira_movimento
  where empresa_id = v_carteira_conta.empresa_id
    and operacao_idempotencia = p_operacao_idempotencia
  limit 1;

  if found then
    movimento_id := v_existing.id;
    carteira_conta_id := v_existing.carteira_conta_id;
    saldo_anterior := v_existing.saldo_anterior;
    saldo_final := v_existing.saldo_final;
    reused := true;
    return next;
    return;
  end if;

  v_delta := round(p_valor, 2);
  if p_natureza = 'saida' then
    v_new_balance := round(v_carteira_conta.saldo_atual - v_delta, 2);
  else
    v_new_balance := round(v_carteira_conta.saldo_atual + v_delta, 2);
  end if;

  if not p_permitir_saldo_negativo and v_new_balance < 0 then
    raise exception 'Operação levaria a saldo negativo sem permissão: saldo atual %, valor %, saldo final %.',
      v_carteira_conta.saldo_atual, v_delta, v_new_balance;
  end if;

  insert into public.carteira_movimento (
    empresa_id,
    carteira_conta_id,
    tipo,
    natureza,
    origem,
    operacao_idempotencia,
    valor,
    saldo_anterior,
    saldo_final,
    referencia_amigavel,
    descricao,
    orcamento_id,
    appointment_id,
    obrigacao_id,
    transacao_id,
    autorizacao_financeira_id,
    usuario_id,
    metadata
  )
  values (
    v_carteira_conta.empresa_id,
    v_carteira_conta.id,
    p_tipo,
    p_natureza,
    p_origem,
    p_operacao_idempotencia,
    v_delta,
    v_carteira_conta.saldo_atual,
    v_new_balance,
    p_referencia_amigavel,
    p_descricao,
    p_orcamento_id,
    p_appointment_id,
    p_obrigacao_id,
    p_transacao_id,
    p_autorizacao_financeira_id,
    p_usuario_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into movimento_id;

  update public.carteira_conta
  set
    saldo_atual = v_new_balance,
    ultimo_movimento_em = now()
  where id = v_carteira_conta.id;

  carteira_conta_id := v_carteira_conta.id;
  saldo_anterior := v_carteira_conta.saldo_atual;
  saldo_final := v_new_balance;
  reused := false;
  return next;
end;
$$;

drop function if exists public.finance_reconcile_wallet_account(text, text);

create or replace function public.finance_reconcile_wallet_account(
  p_carteira_conta_id text,
  p_usuario_id text default null
)
returns table (
  out_carteira_conta_id text,
  out_saldo_persistido numeric,
  out_saldo_recalculado numeric,
  out_diferenca numeric,
  out_status text,
  out_reconciliacao_id text
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_last_balance numeric(14,2);
  v_sum_balance numeric(14,2);
  v_reconciliacao_id text;
  v_status text;
begin
  select *
    into v_carteira_conta
  from public.carteira_conta
  where id = p_carteira_conta_id
  for update;

  if not found then
    raise exception 'carteira_conta % não encontrada.', p_carteira_conta_id;
  end if;

  select saldo_final
    into v_last_balance
  from public.carteira_movimento cm
  where cm.carteira_conta_id = v_carteira_conta.id
  order by cm.created_date desc, cm.id desc
  limit 1;

  select coalesce(sum(
    case
      when natureza = 'entrada' then valor
      else -valor
    end
  ), 0)
    into v_sum_balance
  from public.carteira_movimento cm
  where cm.carteira_conta_id = v_carteira_conta.id;

  v_last_balance := coalesce(v_last_balance, 0);
  v_status := case
    when round(v_carteira_conta.saldo_atual, 2) = round(v_sum_balance, 2)
      then 'ok'
    else 'divergente'
  end;

  insert into public.carteira_reconciliacao (
    empresa_id,
    carteira_conta_id,
    saldo_persistido,
    saldo_recalculado,
    diferenca,
    status,
    acao_tomada,
    usuario_id,
    metadata
  )
  values (
    v_carteira_conta.empresa_id,
    v_carteira_conta.id,
    round(v_carteira_conta.saldo_atual, 2),
    round(v_sum_balance, 2),
    round(v_carteira_conta.saldo_atual - v_sum_balance, 2),
    v_status,
    null,
    p_usuario_id,
    jsonb_build_object(
      'saldo_por_soma', round(v_sum_balance, 2),
      'saldo_por_ultimo_movimento', round(v_last_balance, 2)
    )
  )
  returning id into v_reconciliacao_id;

  update public.carteira_conta
  set ultima_reconciliacao_em = now()
  where id = v_carteira_conta.id;

  out_carteira_conta_id := v_carteira_conta.id;
  out_saldo_persistido := round(v_carteira_conta.saldo_atual, 2);
  out_saldo_recalculado := round(v_sum_balance, 2);
  out_diferenca := round(v_carteira_conta.saldo_atual - v_sum_balance, 2);
  out_status := v_status;
  out_reconciliacao_id := v_reconciliacao_id;
  return next;
end;
$$;

drop function if exists public.finance_reconcile_all_wallet_accounts(text);

create or replace function public.finance_reconcile_all_wallet_accounts(
  p_usuario_id text default null
)
returns table (
  out_carteira_conta_id text,
  out_saldo_persistido numeric,
  out_saldo_recalculado numeric,
  out_diferenca numeric,
  out_status text,
  out_reconciliacao_id text
)
language plpgsql
as $$
declare
  v_row record;
begin
  for v_row in
    select id
    from public.carteira_conta
    order by created_date asc, id asc
  loop
    return query
    select *
    from public.finance_reconcile_wallet_account(v_row.id, p_usuario_id);
  end loop;
end;
$$;

select * from public.finance_ensure_wallet_feature_flags();
select * from public.finance_backfill_carteira_conta();
