-- Exclusao reversivel de perfis e unicidade de CPF por categoria/unidade.

alter table if exists public.responsavel
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_expires_at timestamptz,
  add column if not exists deleted_by text;

alter table if exists public.carteira
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_expires_at timestamptz,
  add column if not exists deleted_by text;

alter table if exists public.responsavel
  drop constraint if exists responsavel_deletion_window_check;

alter table if exists public.responsavel
  add constraint responsavel_deletion_window_check check (
    (deleted_at is null and deletion_expires_at is null)
    or (deleted_at is not null and deletion_expires_at = deleted_at + interval '30 days')
  );

alter table if exists public.carteira
  drop constraint if exists carteira_deletion_window_check;

alter table if exists public.carteira
  add constraint carteira_deletion_window_check check (
    (deleted_at is null and deletion_expires_at is null)
    or (deleted_at is not null and deletion_expires_at = deleted_at + interval '30 days')
  );

create index if not exists idx_responsavel_empresa_cpf_ativo
  on public.responsavel (empresa_id, (regexp_replace(coalesce(cpf, ''), '[^0-9]', '', 'g')))
  where deleted_at is null;

create index if not exists idx_carteira_empresa_cpf_ativo
  on public.carteira (empresa_id, (regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g')))
  where deleted_at is null;

create or replace function public.app_enforce_profile_cpf_uniqueness()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cpf text;
  v_old_cpf text;
  v_duplicate boolean := false;
  v_label text;
begin
  -- Excluir um perfil nunca deve ser bloqueado pela verificacao de duplicidade.
  if tg_op = 'UPDATE' and new.deleted_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.deleted_at is not null
    and new.deleted_at is null
    and coalesce(old.deletion_expires_at, old.deleted_at + interval '30 days') <= now() then
    raise exception 'O prazo de 30 dias para desfazer esta exclusão terminou.'
      using errcode = 'P0001', detail = 'PROFILE_RESTORE_WINDOW_EXPIRED';
  end if;

  if tg_table_name = 'responsavel' then
    v_cpf := regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g');
    if tg_op = 'UPDATE' then
      v_old_cpf := regexp_replace(coalesce(old.cpf, ''), '[^0-9]', '', 'g');
    end if;
    v_label := 'Responsável';
  elsif tg_table_name = 'carteira' then
    v_cpf := regexp_replace(coalesce(new.cpf_cnpj, ''), '[^0-9]', '', 'g');
    if tg_op = 'UPDATE' then
      v_old_cpf := regexp_replace(coalesce(old.cpf_cnpj, ''), '[^0-9]', '', 'g');
    end if;
    v_label := 'Responsável Financeiro';
  else
    return new;
  end if;

  -- A regra solicitada e exclusiva para CPF. CNPJ continua com o contrato atual.
  if length(v_cpf) <> 11 then
    return new;
  end if;

  -- Duplicidades legadas nao impedem a edicao de outros dados do proprio perfil.
  if tg_op = 'UPDATE'
    and old.deleted_at is null
    and new.deleted_at is null
    and old.empresa_id is not distinct from new.empresa_id
    and v_old_cpf = v_cpf then
    return new;
  end if;

  -- Serializa gravacoes concorrentes do mesmo CPF/categoria/unidade.
  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', tg_table_name, coalesce(new.empresa_id::text, ''), v_cpf),
      0
    )
  );

  if tg_table_name = 'responsavel' then
    select exists (
      select 1
      from public.responsavel existing
      where existing.id is distinct from new.id
        and existing.empresa_id is not distinct from new.empresa_id
        and regexp_replace(coalesce(existing.cpf, ''), '[^0-9]', '', 'g') = v_cpf
        and (
          existing.deleted_at is null
          or existing.deletion_expires_at > now()
        )
    ) into v_duplicate;
  else
    select exists (
      select 1
      from public.carteira existing
      where existing.id is distinct from new.id
        and existing.empresa_id is not distinct from new.empresa_id
        and regexp_replace(coalesce(existing.cpf_cnpj, ''), '[^0-9]', '', 'g') = v_cpf
        and (
          existing.deleted_at is null
          or existing.deletion_expires_at > now()
        )
    ) into v_duplicate;
  end if;

  if v_duplicate then
    raise exception 'Este CPF já está cadastrado para outro % nesta unidade.', v_label
      using errcode = 'P0001', detail = 'PROFILE_DUPLICATE_CPF';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_responsavel_unique_active_cpf on public.responsavel;
create trigger trg_responsavel_unique_active_cpf
before insert or update of cpf, empresa_id, deleted_at
on public.responsavel
for each row
execute function public.app_enforce_profile_cpf_uniqueness();

drop trigger if exists trg_carteira_unique_active_cpf on public.carteira;
create trigger trg_carteira_unique_active_cpf
before insert or update of cpf_cnpj, empresa_id, deleted_at
on public.carteira
for each row
execute function public.app_enforce_profile_cpf_uniqueness();

comment on column public.responsavel.deleted_at is
  'Exclusao logica do perfil. O registro deixa de aparecer na operacao imediatamente.';
comment on column public.responsavel.deletion_expires_at is
  'Prazo final para desfazer a exclusao do perfil.';
comment on column public.carteira.deleted_at is
  'Exclusao logica do perfil financeiro. O registro deixa de aparecer na operacao imediatamente.';
comment on column public.carteira.deletion_expires_at is
  'Prazo final para desfazer a exclusao do perfil financeiro.';
