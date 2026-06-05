-- Consolidação do fluxo de usuários e convites
-- Objetivo: manter public.users como fonte operacional única para acesso,
-- onboarding e convite. A tabela user_invite fica apenas como legado/compatibilidade
-- durante a transição e pode ser removida em uma migração posterior, após o frontend
-- e as Edge Functions não dependerem mais dela.

alter table if exists public.users
  add column if not exists invite_sent boolean default false,
  add column if not exists invite_accepted boolean default false,
  add column if not exists invite_status text default null,
  add column if not exists invite_token text,
  add column if not exists invited_by_user_id text,
  add column if not exists invited_at timestamp,
  add column if not exists invite_accepted_at timestamp,
  add column if not exists invite_expires_at timestamp,
  add column if not exists invite_metadata jsonb default '{}'::jsonb;

create unique index if not exists idx_users_invite_token
  on public.users(invite_token)
  where invite_token is not null;

create index if not exists idx_users_invite_status
  on public.users(invite_status)
  where invite_sent = true;

create index if not exists idx_users_invite_email
  on public.users(lower(email))
  where invite_sent = true;

update public.users u
set
  invite_sent = true,
  invite_accepted = coalesce(i.status in ('aceito', 'concluido'), false),
  invite_status = i.status,
  invite_token = coalesce(u.invite_token, i.token),
  invited_by_user_id = coalesce(u.invited_by_user_id, i.invited_by_user_id),
  invited_at = coalesce(u.invited_at, i.invited_at),
  invite_accepted_at = coalesce(u.invite_accepted_at, i.accepted_at),
  invite_expires_at = coalesce(u.invite_expires_at, i.expires_at),
  invite_metadata = coalesce(u.invite_metadata, '{}'::jsonb) || coalesce(i.metadata, '{}'::jsonb),
  onboarding_status = case
    when i.status = 'concluido' then 'completo'
    when i.status in ('pendente', 'aceito') then 'pendente'
    else coalesce(u.onboarding_status, 'completo')
  end
from public.user_invite i
where lower(u.email) = lower(i.email)
  and coalesce(i.status, 'pendente') <> 'cancelado';
