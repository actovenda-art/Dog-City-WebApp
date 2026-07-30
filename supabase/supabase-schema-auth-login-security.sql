-- Login security: server-side audit trail and rate limiting.
-- Passwords and PINs are never persisted.

create table if not exists public.auth_login_attempt (
  id text primary key default gen_random_uuid()::text,
  identity_hash text not null,
  ip_address text not null,
  user_agent text,
  success boolean not null default false,
  failure_code text not null default 'pending',
  user_id text,
  attempted_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists auth_login_attempt_identity_time_idx
  on public.auth_login_attempt (identity_hash, attempted_at desc);

create index if not exists auth_login_attempt_ip_time_idx
  on public.auth_login_attempt (ip_address, attempted_at desc);

create index if not exists auth_login_attempt_retention_idx
  on public.auth_login_attempt (attempted_at);

alter table public.auth_login_attempt enable row level security;

revoke all on table public.auth_login_attempt from public;
revoke all on table public.auth_login_attempt from anon;
revoke all on table public.auth_login_attempt from authenticated;

drop function if exists public.security_auth_login_begin(text, text, text);

create or replace function public.security_auth_login_begin(
  p_identity_hash text,
  p_ip_address text,
  p_user_agent text default null
)
returns table (
  attempt_id text,
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_identity_hash text := left(coalesce(nullif(trim(p_identity_hash), ''), 'unknown'), 128);
  v_ip_address text := left(coalesce(nullif(trim(p_ip_address), ''), 'unknown'), 128);
  v_attempt_id text;
  v_failure_count integer := 0;
  v_latest_failure timestamptz;
  v_retry_after integer := 0;
begin
  -- Serialize attempts for the same IP and identity to avoid concurrent bypass.
  perform pg_advisory_xact_lock(
    hashtextextended(v_ip_address || '|' || v_identity_hash, 0)
  );

  delete from public.auth_login_attempt
  where attempted_at < v_now - interval '90 days';

  select
    count(*)::integer,
    max(attempted_at)
  into
    v_failure_count,
    v_latest_failure
  from public.auth_login_attempt
  where success = false
    and failure_code not in ('rate_limited', 'success')
    and attempted_at >= v_now - interval '30 seconds'
    and (
      identity_hash = v_identity_hash
      or ip_address = v_ip_address
    );

  if v_failure_count >= 5 then
    v_retry_after := greatest(
      1,
      ceil(30 - extract(epoch from (v_now - coalesce(v_latest_failure, v_now))))::integer
    );

    insert into public.auth_login_attempt (
      identity_hash,
      ip_address,
      user_agent,
      success,
      failure_code,
      attempted_at,
      completed_at
    )
    values (
      v_identity_hash,
      v_ip_address,
      left(nullif(trim(p_user_agent), ''), 500),
      false,
      'rate_limited',
      v_now,
      v_now
    )
    returning id into v_attempt_id;

    return query select v_attempt_id, false, v_retry_after;
    return;
  end if;

  insert into public.auth_login_attempt (
    identity_hash,
    ip_address,
    user_agent,
    success,
    failure_code,
    attempted_at
  )
  values (
    v_identity_hash,
    v_ip_address,
    left(nullif(trim(p_user_agent), ''), 500),
    false,
    'pending',
    v_now
  )
  returning id into v_attempt_id;

  return query select v_attempt_id, true, 0;
end;
$$;

drop function if exists public.security_auth_login_finish(text, boolean, text, text);

create or replace function public.security_auth_login_finish(
  p_attempt_id text,
  p_success boolean,
  p_user_id text default null,
  p_failure_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auth_login_attempt
  set
    success = coalesce(p_success, false),
    user_id = case when coalesce(p_success, false) then nullif(trim(p_user_id), '') else null end,
    failure_code = case
      when coalesce(p_success, false) then 'success'
      else left(coalesce(nullif(trim(p_failure_code), ''), 'invalid_credentials'), 80)
    end,
    completed_at = clock_timestamp()
  where id = p_attempt_id;
end;
$$;

revoke all on function public.security_auth_login_begin(text, text, text) from public;
revoke all on function public.security_auth_login_begin(text, text, text) from anon;
revoke all on function public.security_auth_login_begin(text, text, text) from authenticated;
grant execute on function public.security_auth_login_begin(text, text, text) to service_role;

revoke all on function public.security_auth_login_finish(text, boolean, text, text) from public;
revoke all on function public.security_auth_login_finish(text, boolean, text, text) from anon;
revoke all on function public.security_auth_login_finish(text, boolean, text, text) from authenticated;
grant execute on function public.security_auth_login_finish(text, boolean, text, text) to service_role;
