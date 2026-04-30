create extension if not exists pgcrypto;

create table if not exists public.responsavel_portal_access (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null,
  responsavel_id uuid not null references public.responsavel(id) on delete cascade,
  login text not null,
  password_hash text not null,
  password_salt text not null,
  ativo boolean not null default true,
  last_login_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists responsavel_portal_access_responsavel_uidx
  on public.responsavel_portal_access (responsavel_id);

create unique index if not exists responsavel_portal_access_login_uidx
  on public.responsavel_portal_access (lower(login));

create table if not exists public.responsavel_approval_request (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid null,
  responsavel_id uuid not null references public.responsavel(id) on delete cascade,
  orcamento_id uuid null references public.orcamento(id) on delete set null,
  appointment_id uuid null references public.appointment(id) on delete set null,
  requested_by_user_id uuid null references public.users(id) on delete set null,
  dog_ids jsonb not null default '[]'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  requested_channel text not null default 'manual',
  status text not null default 'pendente',
  access_link_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  approved_at timestamptz null,
  declined_at timestamptz null,
  requester_note text null,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint responsavel_approval_request_status_check check (
    status in ('pendente', 'aprovado', 'recusado', 'expirado', 'cancelado')
  )
);

create unique index if not exists responsavel_approval_request_token_uidx
  on public.responsavel_approval_request (access_link_token);

create index if not exists responsavel_approval_request_orcamento_idx
  on public.responsavel_approval_request (orcamento_id);

create index if not exists responsavel_approval_request_responsavel_idx
  on public.responsavel_approval_request (responsavel_id);

create table if not exists public.responsavel_approval_session (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.responsavel_approval_request(id) on delete cascade,
  access_id uuid not null references public.responsavel_portal_access(id) on delete cascade,
  session_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  last_seen_at timestamptz null,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create unique index if not exists responsavel_approval_session_token_uidx
  on public.responsavel_approval_session (session_token);

create or replace function public.touch_responsavel_access_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_responsavel_portal_access_updated_at on public.responsavel_portal_access;
create trigger trg_touch_responsavel_portal_access_updated_at
before update on public.responsavel_portal_access
for each row execute function public.touch_responsavel_access_updated_at();

drop trigger if exists trg_touch_responsavel_approval_request_updated_at on public.responsavel_approval_request;
create trigger trg_touch_responsavel_approval_request_updated_at
before update on public.responsavel_approval_request
for each row execute function public.touch_responsavel_access_updated_at();

alter table public.responsavel_portal_access enable row level security;
alter table public.responsavel_approval_request enable row level security;
alter table public.responsavel_approval_session enable row level security;
