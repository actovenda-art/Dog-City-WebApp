-- Sprint 2 - Shadow write financeiro
-- Objetivo:
-- 1. Introduzir obrigacao_financeira, cobranca_financeira, cobranca_item e carteira_alocacao
-- 2. Gerar shadow write em paralelo, sem trocar leitura principal
-- 3. Manter dual write auditavel e idempotente

create extension if not exists pgcrypto;

create table if not exists public.obrigacao_financeira (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_id text null references public.carteira(id) on delete set null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  orcamento_id text null references public.orcamento(id) on delete set null,
  appointment_id text null references public.appointment(id) on delete set null,
  recurring_package_id text null references public.recurring_packages(id) on delete set null,
  package_session_id text null references public.package_sessions(id) on delete set null,
  tipo_origem text not null,
  tipo_item text not null,
  source_key text not null,
  source_group_key text null,
  descricao text not null,
  service_date date not null,
  due_date date not null,
  valor_original numeric(14,2) not null,
  valor_desconto numeric(14,2) not null default 0,
  valor_multa numeric(14,2) not null default 0,
  valor_final numeric(14,2) not null,
  valor_em_aberto numeric(14,2) not null,
  status text not null default 'aberta',
  lock_version integer not null default 0,
  shadow_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_obrigacao_financeira_source_key unique (empresa_id, source_key),
  constraint chk_obrigacao_financeira_status
    check (status in ('aberta','parcial','quitada','vencida','cancelada','estornada')),
  constraint chk_obrigacao_financeira_valores
    check (
      valor_original >= 0
      and valor_desconto >= 0
      and valor_multa >= 0
      and valor_final >= 0
      and valor_em_aberto >= 0
      and valor_original = round(valor_original, 2)
      and valor_desconto = round(valor_desconto, 2)
      and valor_multa = round(valor_multa, 2)
      and valor_final = round(valor_final, 2)
      and valor_em_aberto = round(valor_em_aberto, 2)
    )
);

create index if not exists idx_obrigacao_financeira_empresa_orcamento
  on public.obrigacao_financeira(empresa_id, orcamento_id, status);

create index if not exists idx_obrigacao_financeira_conta_due
  on public.obrigacao_financeira(carteira_conta_id, due_date, service_date, created_date, id);

create index if not exists idx_obrigacao_financeira_group_key
  on public.obrigacao_financeira(source_group_key);

create table if not exists public.cobranca_financeira (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_id text null references public.carteira(id) on delete set null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  orcamento_id text null references public.orcamento(id) on delete set null,
  source_key text not null,
  tipo text not null default 'orcamento_confirmado',
  descricao text not null,
  due_date date not null,
  valor_total numeric(14,2) not null,
  valor_em_aberto numeric(14,2) not null,
  status text not null default 'aberta',
  lock_version integer not null default 0,
  shadow_version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_cobranca_financeira_source_key unique (empresa_id, source_key),
  constraint chk_cobranca_financeira_status
    check (status in ('aberta','parcial','quitada','vencida','cancelada')),
  constraint chk_cobranca_financeira_valores
    check (
      valor_total >= 0
      and valor_em_aberto >= 0
      and valor_total = round(valor_total, 2)
      and valor_em_aberto = round(valor_em_aberto, 2)
    )
);

create index if not exists idx_cobranca_financeira_empresa_orcamento
  on public.cobranca_financeira(empresa_id, orcamento_id, status);

create index if not exists idx_cobranca_financeira_conta_due
  on public.cobranca_financeira(carteira_conta_id, due_date, created_date, id);

create table if not exists public.cobranca_item (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  cobranca_financeira_id text not null references public.cobranca_financeira(id) on delete cascade,
  obrigacao_id text not null references public.obrigacao_financeira(id) on delete cascade,
  valor numeric(14,2) not null,
  ordem integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_cobranca_item unique (cobranca_financeira_id, obrigacao_id),
  constraint chk_cobranca_item_valor
    check (valor >= 0 and valor = round(valor, 2))
);

create index if not exists idx_cobranca_item_cobranca_ordem
  on public.cobranca_item(cobranca_financeira_id, ordem, created_date);

create index if not exists idx_cobranca_item_obrigacao
  on public.cobranca_item(obrigacao_id);

create table if not exists public.carteira_alocacao (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_conta_id text not null references public.carteira_conta(id) on delete cascade,
  carteira_movimento_id text not null references public.carteira_movimento(id) on delete cascade,
  obrigacao_id text not null references public.obrigacao_financeira(id) on delete cascade,
  valor_alocado numeric(14,2) not null,
  ordem_aplicada integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint uq_carteira_alocacao unique (carteira_movimento_id, obrigacao_id, ordem_aplicada),
  constraint chk_carteira_alocacao_valor
    check (valor_alocado >= 0 and valor_alocado = round(valor_alocado, 2))
);

create index if not exists idx_carteira_alocacao_conta
  on public.carteira_alocacao(carteira_conta_id, created_date desc);

create index if not exists idx_carteira_alocacao_obrigacao
  on public.carteira_alocacao(obrigacao_id);

create or replace function public.finance_before_update_versioned_row()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  if to_jsonb(new) ? 'lock_version' then
    new.lock_version = coalesce(old.lock_version, 0) + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obrigacao_financeira_before_update on public.obrigacao_financeira;
create trigger trg_obrigacao_financeira_before_update
before update on public.obrigacao_financeira
for each row
execute function public.finance_before_update_versioned_row();

drop trigger if exists trg_cobranca_financeira_before_update on public.cobranca_financeira;
create trigger trg_cobranca_financeira_before_update
before update on public.cobranca_financeira
for each row
execute function public.finance_before_update_versioned_row();

drop trigger if exists trg_cobranca_item_before_update on public.cobranca_item;
create trigger trg_cobranca_item_before_update
before update on public.cobranca_item
for each row
execute function public.finance_set_updated_date();

drop trigger if exists trg_carteira_alocacao_before_update on public.carteira_alocacao;
create trigger trg_carteira_alocacao_before_update
before update on public.carteira_alocacao
for each row
execute function public.finance_set_updated_date();

drop function if exists public.finance_ensure_shadow_feature_flags();

create or replace function public.finance_ensure_shadow_feature_flags()
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
    select 1 from public.app_config cfg
    where cfg.key = 'finance.obligations_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.obligations_enabled',
      'Finance - Obligations Enabled',
      'Habilita a geração paralela de obrigacoes financeiras.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if not exists (
    select 1 from public.app_config cfg
    where cfg.key = 'finance.charges_enabled'
      and cfg.empresa_id is null
  ) then
    insert into public.app_config (key, label, description, value, ativo)
    values (
      'finance.charges_enabled',
      'Finance - Charges Enabled',
      'Habilita a geração paralela de cobrancas financeiras.',
      jsonb_build_object('enabled', false),
      true
    );
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'empresa') then
    for v_empresa in
      select e.id from public.empresa e
    loop
      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.obligations_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.obligations_enabled',
          'Finance - Obligations Enabled',
          'Habilita a geração paralela de obrigacoes financeiras.',
          jsonb_build_object('enabled', false),
          true,
          v_empresa.id
        );
      end if;

      if not exists (
        select 1 from public.app_config cfg
        where cfg.key = 'finance.charges_enabled'
          and cfg.empresa_id = v_empresa.id
      ) then
        insert into public.app_config (key, label, description, value, ativo, empresa_id)
        values (
          'finance.charges_enabled',
          'Finance - Charges Enabled',
          'Habilita a geração paralela de cobrancas financeiras.',
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
  where cfg.key in ('finance.obligations_enabled', 'finance.charges_enabled')
  order by cfg.key, cfg.empresa_id nulls first;
end;
$$;

drop function if exists public.finance_shadow_sync_orcamento(
  text, text, text, date, text, jsonb, jsonb, text
);

create or replace function public.finance_shadow_sync_orcamento(
  p_orcamento_id text,
  p_empresa_id text,
  p_carteira_id text,
  p_due_date date default null,
  p_status text default null,
  p_items jsonb default '[]'::jsonb,
  p_payload jsonb default '{}'::jsonb,
  p_usuario_id text default null
)
returns table (
  obligations_enabled boolean,
  charges_enabled boolean,
  skipped boolean,
  skipped_reason text,
  created_obligations integer,
  updated_obligations integer,
  cancelled_obligations integer,
  created_charges integer,
  updated_charges integer,
  created_charge_items integer,
  deleted_charge_items integer,
  charge_id text
)
language plpgsql
as $$
declare
  v_carteira_conta public.carteira_conta%rowtype;
  v_obligations_enabled boolean := false;
  v_charges_enabled boolean := false;
  v_existing_obrigacao public.obrigacao_financeira%rowtype;
  v_existing_cobranca public.cobranca_financeira%rowtype;
  v_item jsonb;
  v_source_key text;
  v_group_key text;
  v_tipo_item text;
  v_tipo_origem text;
  v_descricao text;
  v_service_date date;
  v_due_date date;
  v_valor_original numeric(14,2);
  v_valor_desconto numeric(14,2);
  v_valor_multa numeric(14,2);
  v_valor_final numeric(14,2);
  v_metadata jsonb;
  v_charge_source_key text;
  v_charge_due_date date;
  v_charge_total numeric(14,2) := 0;
  v_current_ids text[] := '{}'::text[];
  v_created_obligations integer := 0;
  v_updated_obligations integer := 0;
  v_cancelled_obligations integer := 0;
  v_created_charges integer := 0;
  v_updated_charges integer := 0;
  v_created_charge_items integer := 0;
  v_deleted_charge_items integer := 0;
begin
  if coalesce(trim(p_orcamento_id), '') = '' then
    raise exception 'p_orcamento_id é obrigatório.';
  end if;

  if coalesce(trim(p_empresa_id), '') = '' then
    raise exception 'p_empresa_id é obrigatório.';
  end if;

  if coalesce(trim(p_carteira_id), '') = '' then
    obligations_enabled := false;
    charges_enabled := false;
    skipped := true;
    skipped_reason := 'orcamento sem carteira vinculada';
    created_obligations := 0;
    updated_obligations := 0;
    cancelled_obligations := 0;
    created_charges := 0;
    updated_charges := 0;
    created_charge_items := 0;
    deleted_charge_items := 0;
    charge_id := null;
    return next;
  end if;

  select *
    into v_carteira_conta
  from public.carteira_conta cc
  where cc.carteira_id = p_carteira_id
    and cc.empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'carteira_conta não encontrada para carteira % na empresa %.', p_carteira_id, p_empresa_id;
  end if;

  perform 1
  from public.orcamento o
  where o.id = p_orcamento_id
  for update;

  v_obligations_enabled := public.finance_get_feature_flag('finance.obligations_enabled', p_empresa_id);
  v_charges_enabled := public.finance_get_feature_flag('finance.charges_enabled', p_empresa_id);

  if v_charges_enabled and not v_obligations_enabled then
    v_charges_enabled := false;
  end if;

  if not v_obligations_enabled and not v_charges_enabled then
    obligations_enabled := false;
    charges_enabled := false;
    skipped := true;
    skipped_reason := 'feature flags desligadas';
    created_obligations := 0;
    updated_obligations := 0;
    cancelled_obligations := 0;
    created_charges := 0;
    updated_charges := 0;
    created_charge_items := 0;
    deleted_charge_items := 0;
    charge_id := null;
    return next;
  end if;

  if p_items is null then
    p_items := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items precisa ser um array json.';
  end if;

  if lower(coalesce(trim(p_status), '')) not in ('aprovado', 'confirmado') then
    if v_obligations_enabled then
      update public.obrigacao_financeira ofn
      set
        status = 'cancelada',
        metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
          'shadow_status', coalesce(p_status, ''),
          'shadow_cancelled_by_status', true,
          'shadow_updated_at', now()
        )
      where ofn.empresa_id = p_empresa_id
        and ofn.orcamento_id = p_orcamento_id
        and ofn.status <> 'cancelada';
      get diagnostics v_cancelled_obligations = row_count;
    end if;

    if v_charges_enabled then
      update public.cobranca_financeira cfn
      set
        status = 'cancelada',
        metadata = coalesce(cfn.metadata, '{}'::jsonb) || jsonb_build_object(
          'shadow_status', coalesce(p_status, ''),
          'shadow_cancelled_by_status', true,
          'shadow_updated_at', now()
        )
      where cfn.empresa_id = p_empresa_id
        and cfn.orcamento_id = p_orcamento_id
        and cfn.status <> 'cancelada';
      get diagnostics v_updated_charges = row_count;
    end if;

    obligations_enabled := v_obligations_enabled;
    charges_enabled := v_charges_enabled;
    skipped := false;
    skipped_reason := null;
    created_obligations := 0;
    updated_obligations := 0;
    cancelled_obligations := v_cancelled_obligations;
    created_charges := 0;
    updated_charges := v_updated_charges;
    created_charge_items := 0;
    deleted_charge_items := 0;
    charge_id := null;
    return next;
  end if;

  if v_obligations_enabled then
    for v_item in
      select value
      from jsonb_array_elements(p_items)
    loop
      if coalesce((v_item ->> 'skip')::boolean, false) then
        continue;
      end if;

      v_source_key := nullif(trim(v_item ->> 'source_key'), '');
      v_group_key := nullif(trim(v_item ->> 'source_group_key'), '');
      v_tipo_item := coalesce(nullif(trim(v_item ->> 'tipo_item'), ''), 'servico');
      v_tipo_origem := coalesce(nullif(trim(v_item ->> 'tipo_origem'), ''), 'orcamento');
      v_descricao := coalesce(nullif(trim(v_item ->> 'descricao'), ''), 'Obrigação financeira');
      v_service_date := coalesce(nullif(v_item ->> 'service_date', '')::date, p_due_date, current_date);
      v_due_date := coalesce(nullif(v_item ->> 'due_date', '')::date, p_due_date, v_service_date, current_date);
      v_valor_original := round(coalesce((v_item ->> 'valor_original')::numeric, 0), 2);
      v_valor_desconto := round(coalesce((v_item ->> 'valor_desconto')::numeric, 0), 2);
      v_valor_multa := round(coalesce((v_item ->> 'valor_multa')::numeric, 0), 2);
      v_valor_final := round(coalesce((v_item ->> 'valor_final')::numeric, 0), 2);
      v_metadata := coalesce(v_item -> 'metadata', '{}'::jsonb) || jsonb_build_object(
        'shadow_usuario_id', p_usuario_id,
        'shadow_synced_at', now(),
        'shadow_payload', coalesce(p_payload, '{}'::jsonb)
      );

      if v_source_key is null then
        raise exception 'Item shadow sem source_key para o orçamento %.', p_orcamento_id;
      end if;

      if v_valor_final < 0 then
        raise exception 'Item shadow % com valor_final negativo.', v_source_key;
      end if;

      select *
        into v_existing_obrigacao
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.source_key = v_source_key
      for update;

      if found then
        update public.obrigacao_financeira
        set
          carteira_id = p_carteira_id,
          carteira_conta_id = v_carteira_conta.id,
          orcamento_id = p_orcamento_id,
          tipo_origem = v_tipo_origem,
          tipo_item = v_tipo_item,
          source_group_key = v_group_key,
          descricao = v_descricao,
          service_date = v_service_date,
          due_date = v_due_date,
          valor_original = v_valor_original,
          valor_desconto = v_valor_desconto,
          valor_multa = v_valor_multa,
          valor_final = v_valor_final,
          valor_em_aberto = v_valor_final,
          status = 'aberta',
          shadow_version = coalesce(public.obrigacao_financeira.shadow_version, 0) + 1,
          metadata = v_metadata
        where id = v_existing_obrigacao.id;
        v_current_ids := array_append(v_current_ids, v_existing_obrigacao.id);
        v_updated_obligations := v_updated_obligations + 1;
      else
        insert into public.obrigacao_financeira (
          empresa_id,
          carteira_id,
          carteira_conta_id,
          orcamento_id,
          tipo_origem,
          tipo_item,
          source_key,
          source_group_key,
          descricao,
          service_date,
          due_date,
          valor_original,
          valor_desconto,
          valor_multa,
          valor_final,
          valor_em_aberto,
          status,
          metadata
        )
        values (
          p_empresa_id,
          p_carteira_id,
          v_carteira_conta.id,
          p_orcamento_id,
          v_tipo_origem,
          v_tipo_item,
          v_source_key,
          v_group_key,
          v_descricao,
          v_service_date,
          v_due_date,
          v_valor_original,
          v_valor_desconto,
          v_valor_multa,
          v_valor_final,
          v_valor_final,
          'aberta',
          v_metadata
        )
        returning id into v_existing_obrigacao.id;

        v_current_ids := array_append(v_current_ids, v_existing_obrigacao.id);
        v_created_obligations := v_created_obligations + 1;
      end if;
    end loop;

    if coalesce(array_length(v_current_ids, 1), 0) = 0 then
      update public.obrigacao_financeira ofn
      set
        status = 'cancelada',
        metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
          'shadow_cancelled_empty_payload', true,
          'shadow_updated_at', now()
        )
      where ofn.empresa_id = p_empresa_id
        and ofn.orcamento_id = p_orcamento_id
        and ofn.status <> 'cancelada';
      get diagnostics v_cancelled_obligations = row_count;
    else
      update public.obrigacao_financeira ofn
      set
        status = 'cancelada',
        metadata = coalesce(ofn.metadata, '{}'::jsonb) || jsonb_build_object(
          'shadow_cancelled_by_resync', true,
          'shadow_updated_at', now()
        )
      where ofn.empresa_id = p_empresa_id
        and ofn.orcamento_id = p_orcamento_id
        and not (ofn.id = any(v_current_ids))
        and ofn.status <> 'cancelada';
      get diagnostics v_cancelled_obligations = row_count;
    end if;
  end if;

  if v_charges_enabled then
    v_charge_source_key := concat_ws('|', 'shadow', 'orcamento', p_orcamento_id, 'cobranca');
    v_charge_due_date := coalesce(p_due_date, (
      select min(ofn.due_date)
      from public.obrigacao_financeira ofn
      where ofn.empresa_id = p_empresa_id
        and ofn.orcamento_id = p_orcamento_id
        and ofn.status <> 'cancelada'
    ), current_date);

    select coalesce(sum(ofn.valor_final), 0)
      into v_charge_total
    from public.obrigacao_financeira ofn
    where ofn.empresa_id = p_empresa_id
      and ofn.orcamento_id = p_orcamento_id
      and ofn.status <> 'cancelada';

    select *
      into v_existing_cobranca
    from public.cobranca_financeira cfn
    where cfn.empresa_id = p_empresa_id
      and cfn.source_key = v_charge_source_key
    for update;

    if v_existing_cobranca.id is null then
      insert into public.cobranca_financeira (
        empresa_id,
        carteira_id,
        carteira_conta_id,
        orcamento_id,
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
        p_empresa_id,
        p_carteira_id,
        v_carteira_conta.id,
        p_orcamento_id,
        v_charge_source_key,
        'orcamento_confirmado',
        concat('Cobrança shadow do orçamento ', p_orcamento_id),
        v_charge_due_date,
        round(v_charge_total, 2),
        round(v_charge_total, 2),
        case when round(v_charge_total, 2) > 0 then 'aberta' else 'cancelada' end,
        jsonb_build_object(
          'shadow_payload', coalesce(p_payload, '{}'::jsonb),
          'shadow_usuario_id', p_usuario_id,
          'shadow_synced_at', now()
        )
      )
      returning * into v_existing_cobranca;
      v_created_charges := 1;
    else
      update public.cobranca_financeira
      set
        carteira_id = p_carteira_id,
        carteira_conta_id = v_carteira_conta.id,
        orcamento_id = p_orcamento_id,
        due_date = v_charge_due_date,
        valor_total = round(v_charge_total, 2),
        valor_em_aberto = round(v_charge_total, 2),
        status = case when round(v_charge_total, 2) > 0 then 'aberta' else 'cancelada' end,
        shadow_version = coalesce(public.cobranca_financeira.shadow_version, 0) + 1,
        metadata = coalesce(public.cobranca_financeira.metadata, '{}'::jsonb) || jsonb_build_object(
          'shadow_payload', coalesce(p_payload, '{}'::jsonb),
          'shadow_usuario_id', p_usuario_id,
          'shadow_synced_at', now()
        )
      where id = v_existing_cobranca.id
      returning * into v_existing_cobranca;
      v_updated_charges := 1;
    end if;

    delete from public.cobranca_item ci
    where ci.cobranca_financeira_id = v_existing_cobranca.id;
    get diagnostics v_deleted_charge_items = row_count;

    if coalesce(array_length(v_current_ids, 1), 0) > 0 then
      insert into public.cobranca_item (
        empresa_id,
        cobranca_financeira_id,
        obrigacao_id,
        valor,
        ordem,
        metadata
      )
      select
        p_empresa_id,
        v_existing_cobranca.id,
        ofn.id,
        ofn.valor_final,
        row_number() over (order by ofn.due_date asc, ofn.service_date asc, ofn.created_date asc, ofn.id asc),
        jsonb_build_object(
          'source_key', ofn.source_key,
          'shadow_orcamento_id', p_orcamento_id
        )
      from public.obrigacao_financeira ofn
      where ofn.id = any(v_current_ids);
      get diagnostics v_created_charge_items = row_count;
    end if;
  end if;

  obligations_enabled := v_obligations_enabled;
  charges_enabled := v_charges_enabled;
  skipped := false;
  skipped_reason := null;
  created_obligations := v_created_obligations;
  updated_obligations := v_updated_obligations;
  cancelled_obligations := v_cancelled_obligations;
  created_charges := v_created_charges;
  updated_charges := v_updated_charges;
  created_charge_items := v_created_charge_items;
  deleted_charge_items := v_deleted_charge_items;
  charge_id := v_existing_cobranca.id;
  return next;
end;
$$;

drop function if exists public.finance_shadow_audit_orcamento_summary(text);

create or replace function public.finance_shadow_audit_orcamento_summary(
  p_orcamento_id text
)
returns table (
  orcamento_id text,
  legado_valor_total numeric,
  shadow_obrigacoes_total numeric,
  shadow_obrigacoes_quantidade integer,
  shadow_cobrancas_total numeric,
  shadow_cobrancas_quantidade integer,
  shadow_itens_quantidade integer,
  divergencia_orcamento_vs_obrigacoes numeric,
  divergencia_obrigacoes_vs_cobrancas numeric
)
language sql
stable
as $$
  with base_orcamento as (
    select
      o.id,
      round(coalesce(o.valor_total, 0), 2) as valor_total
    from public.orcamento o
    where o.id = p_orcamento_id
  ),
  obligation_totals as (
    select
      ofn.orcamento_id,
      round(coalesce(sum(case when ofn.status <> 'cancelada' then ofn.valor_final else 0 end), 0), 2) as total,
      count(*) filter (where ofn.status <> 'cancelada')::integer as quantidade
    from public.obrigacao_financeira ofn
    where ofn.orcamento_id = p_orcamento_id
    group by ofn.orcamento_id
  ),
  charge_totals as (
    select
      cfn.orcamento_id,
      round(coalesce(sum(case when cfn.status <> 'cancelada' then cfn.valor_total else 0 end), 0), 2) as total,
      count(*) filter (where cfn.status <> 'cancelada')::integer as quantidade
    from public.cobranca_financeira cfn
    where cfn.orcamento_id = p_orcamento_id
    group by cfn.orcamento_id
  ),
  item_totals as (
    select
      cfn.orcamento_id,
      count(ci.id)::integer as quantidade
    from public.cobranca_item ci
    join public.cobranca_financeira cfn on cfn.id = ci.cobranca_financeira_id
    where cfn.orcamento_id = p_orcamento_id
      and cfn.status <> 'cancelada'
    group by cfn.orcamento_id
  )
  select
    bo.id as orcamento_id,
    bo.valor_total as legado_valor_total,
    coalesce(ot.total, 0) as shadow_obrigacoes_total,
    coalesce(ot.quantidade, 0) as shadow_obrigacoes_quantidade,
    coalesce(ct.total, 0) as shadow_cobrancas_total,
    coalesce(ct.quantidade, 0) as shadow_cobrancas_quantidade,
    coalesce(it.quantidade, 0) as shadow_itens_quantidade,
    round(bo.valor_total - coalesce(ot.total, 0), 2) as divergencia_orcamento_vs_obrigacoes,
    round(coalesce(ot.total, 0) - coalesce(ct.total, 0), 2) as divergencia_obrigacoes_vs_cobrancas
  from base_orcamento bo
  left join obligation_totals ot on ot.orcamento_id = bo.id
  left join charge_totals ct on ct.orcamento_id = bo.id
  left join item_totals it on it.orcamento_id = bo.id;
$$;

select * from public.finance_ensure_shadow_feature_flags();
