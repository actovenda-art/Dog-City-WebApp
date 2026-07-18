begin;

create table if not exists public.banco_inter_token_cache (
  integracao_id text not null references public.integracao_config(id) on delete cascade,
  scope text not null,
  client_fingerprint text not null,
  token_ciphertext text,
  token_iv text,
  expires_at timestamptz,
  refresh_owner text,
  refreshing_until timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  primary key (integracao_id, scope),
  constraint banco_inter_token_cache_cipher_pair_check check (
    (token_ciphertext is null and token_iv is null)
    or (token_ciphertext is not null and token_iv is not null)
  )
);

create index if not exists banco_inter_token_cache_expires_idx
  on public.banco_inter_token_cache (expires_at);

alter table public.banco_inter_token_cache enable row level security;

revoke all on table public.banco_inter_token_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.banco_inter_token_cache to service_role;

comment on table public.banco_inter_token_cache is
  'Cache privado de tokens OAuth do Banco Inter. O token e persistido somente como AES-GCM ciphertext.';

create or replace function public.finance_claim_banco_inter_token_refresh(
  p_integracao_id text,
  p_scope text,
  p_client_fingerprint text,
  p_owner text,
  p_lease_seconds integer default 20
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := nullif(trim(coalesce(p_scope, '')), '');
  v_owner text := nullif(trim(coalesce(p_owner, '')), '');
  v_fingerprint text := nullif(trim(coalesce(p_client_fingerprint, '')), '');
  v_lease interval := make_interval(secs => greatest(5, least(coalesce(p_lease_seconds, 20), 120)));
begin
  if nullif(trim(coalesce(p_integracao_id, '')), '') is null
    or v_scope is null
    or v_owner is null
    or v_fingerprint is null then
    return false;
  end if;

  insert into public.banco_inter_token_cache (
    integracao_id,
    scope,
    client_fingerprint,
    refresh_owner,
    refreshing_until
  ) values (
    p_integracao_id,
    v_scope,
    v_fingerprint,
    v_owner,
    now() + v_lease
  )
  on conflict (integracao_id, scope) do nothing;

  if found then
    return true;
  end if;

  update public.banco_inter_token_cache
  set
    client_fingerprint = v_fingerprint,
    token_ciphertext = null,
    token_iv = null,
    expires_at = null,
    refresh_owner = v_owner,
    refreshing_until = now() + v_lease,
    updated_date = now()
  where integracao_id = p_integracao_id
    and scope = v_scope
    and (
      client_fingerprint is distinct from v_fingerprint
      or expires_at is null
      or expires_at <= now() + interval '30 seconds'
    )
    and (
      refreshing_until is null
      or refreshing_until <= now()
      or refresh_owner = v_owner
    );

  return found;
end;
$$;

revoke all on function public.finance_claim_banco_inter_token_refresh(text, text, text, text, integer) from public;
grant execute on function public.finance_claim_banco_inter_token_refresh(text, text, text, text, integer) to service_role;

comment on function public.finance_claim_banco_inter_token_refresh(text, text, text, text, integer) is
  'Concede lease exclusivo para uma unica instancia renovar um token OAuth expirado do Banco Inter.';

commit;
