-- IDs internos para caes, responsaveis e carteiras.
-- Execute apos:
-- 1. supabase-schema.sql
-- 2. supabase-schema-company-pricing.sql
-- 3. supabase-schema-admin-multiempresa.sql

alter table if exists public.dogs
  add column if not exists codigo text;

alter table if exists public.responsavel
  add column if not exists codigo text;

alter table if exists public.carteira
  add column if not exists codigo text;

create table if not exists public.entity_internal_counter (
  entity_name text not null,
  unit_code text not null,
  current_value bigint not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  primary key (entity_name, unit_code)
);

create or replace function public.app_resolve_entity_unit_code(target_empresa_id text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  raw_code text;
begin
  if coalesce(trim(target_empresa_id), '') <> '' then
    select nullif(trim(codigo), '')
      into raw_code
      from public.empresa
     where id = target_empresa_id
     limit 1;

    if coalesce(raw_code, '') = '' then
      raw_code := target_empresa_id;
    end if;
  end if;

  raw_code := upper(regexp_replace(coalesce(raw_code, '00'), '[^A-Za-z0-9]+', '', 'g'));
  return case when raw_code = '' then '00' else raw_code end;
end;
$$;

create or replace function public.app_next_entity_counter(target_entity text, target_unit_code text)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  next_value bigint;
begin
  insert into public.entity_internal_counter (entity_name, unit_code, current_value)
  values (lower(coalesce(target_entity, '')), upper(coalesce(target_unit_code, '00')), 1)
  on conflict (entity_name, unit_code)
  do update set
    current_value = public.entity_internal_counter.current_value + 1,
    updated_date = now()
  returning current_value into next_value;

  return next_value;
end;
$$;

create or replace function public.app_extract_document_suffix(document_value text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(document_value, ''), '\D', '', 'g') = '' then ''
    else lpad(right(regexp_replace(coalesce(document_value, ''), '\D', '', 'g'), 5), 5, '0')
  end;
$$;

create or replace function public.app_entity_code_exists(target_table text, candidate_code text, current_id text default null)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  has_match boolean;
begin
  execute format(
    'select exists(select 1 from public.%I where codigo = $1 and coalesce(id, '''') <> $2)',
    target_table
  )
  into has_match
  using candidate_code, coalesce(current_id, '');

  return coalesce(has_match, false);
end;
$$;

create or replace function public.app_assign_entity_codigo()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  unit_code text;
  base_code text;
  candidate_code text;
  doc_suffix text;
  duplicate_index integer;
  fallback_counter bigint;
begin
  if tg_op = 'UPDATE' and coalesce(trim(old.codigo), '') <> '' then
    new.codigo := old.codigo;
    return new;
  end if;

  if coalesce(trim(new.codigo), '') <> '' then
    new.codigo := upper(trim(new.codigo));
    return new;
  end if;

  unit_code := public.app_resolve_entity_unit_code(new.empresa_id);

  if tg_table_name = 'dogs' then
    new.codigo := format(
      '%s-CAO-%s',
      unit_code,
      public.app_next_entity_counter('dogs', unit_code)
    );
    return new;
  end if;

  if tg_table_name = 'responsavel' then
    doc_suffix := public.app_extract_document_suffix(new.cpf);
    if doc_suffix = '' then
      fallback_counter := public.app_next_entity_counter('responsavel_fallback', unit_code);
      doc_suffix := lpad(fallback_counter::text, 5, '0');
    end if;
    base_code := format('%s-RES-%s', unit_code, doc_suffix);
  elsif tg_table_name = 'carteira' then
    doc_suffix := public.app_extract_document_suffix(new.cpf_cnpj);
    if doc_suffix = '' then
      fallback_counter := public.app_next_entity_counter('carteira_fallback', unit_code);
      doc_suffix := lpad(fallback_counter::text, 5, '0');
    end if;
    base_code := format('%s-FINC-%s', unit_code, doc_suffix);
  else
    raise exception 'Tabela sem configuracao de ID interno: %', tg_table_name;
  end if;

  perform pg_advisory_xact_lock(hashtext(lower(tg_table_name) || '|' || unit_code || '|' || doc_suffix));

  candidate_code := base_code;
  duplicate_index := 2;

  while public.app_entity_code_exists(tg_table_name, candidate_code, new.id) loop
    candidate_code := format('%s-%s', base_code, duplicate_index);
    duplicate_index := duplicate_index + 1;
  end loop;

  new.codigo := candidate_code;
  return new;
end;
$$;

drop trigger if exists trg_dogs_assign_codigo on public.dogs;
create trigger trg_dogs_assign_codigo
before insert or update on public.dogs
for each row
execute function public.app_assign_entity_codigo();

drop trigger if exists trg_responsavel_assign_codigo on public.responsavel;
create trigger trg_responsavel_assign_codigo
before insert or update on public.responsavel
for each row
execute function public.app_assign_entity_codigo();

drop trigger if exists trg_carteira_assign_codigo on public.carteira;
create trigger trg_carteira_assign_codigo
before insert or update on public.carteira
for each row
execute function public.app_assign_entity_codigo();

do $$
declare
  rec record;
begin
  for rec in
    select id
      from public.dogs
     where coalesce(trim(codigo), '') = ''
     order by created_date nulls first, id
  loop
    update public.dogs
       set codigo = null
     where id = rec.id;
  end loop;

  for rec in
    select id
      from public.responsavel
     where coalesce(trim(codigo), '') = ''
     order by created_date nulls first, id
  loop
    update public.responsavel
       set codigo = null
     where id = rec.id;
  end loop;

  for rec in
    select id
      from public.carteira
     where coalesce(trim(codigo), '') = ''
     order by created_date nulls first, id
  loop
    update public.carteira
       set codigo = null
     where id = rec.id;
  end loop;
end;
$$;

create unique index if not exists idx_dogs_codigo_unique
  on public.dogs(codigo)
  where coalesce(trim(codigo), '') <> '';

create unique index if not exists idx_responsavel_codigo_unique
  on public.responsavel(codigo)
  where coalesce(trim(codigo), '') <> '';

create unique index if not exists idx_carteira_codigo_unique
  on public.carteira(codigo)
  where coalesce(trim(codigo), '') <> '';
