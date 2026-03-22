-- Politicas para administracao multiempresa
-- Use APENAS uma das abordagens abaixo.

-- =========================================================
-- ABORDAGEM A: Desbloqueio rapido para o app atual
-- O app ainda opera varias telas sem fluxo formal de login Supabase.
-- Se voce quer apenas fazer a area administrativa funcionar agora,
-- desabilite RLS nessas tabelas.
-- =========================================================

alter table if exists public.empresa disable row level security;
alter table if exists public.perfil_acesso disable row level security;
alter table if exists public.integracao_config disable row level security;
alter table if exists public.integracao_sync_log disable row level security;
alter table if exists public.extratobancario disable row level security;
alter table if exists public.notificacao disable row level security;

-- Se desejar administrar branding/usuarios por essa mesma area:
alter table if exists public.app_config disable row level security;
alter table if exists public.app_asset disable row level security;
alter table if exists public.users disable row level security;
alter table if exists public.tabelaprecos disable row level security;

-- =========================================================
-- ABORDAGEM B: Manter RLS e liberar somente admins autenticados
-- Execute esta parte somente se o app ja tiver sessao Supabase valida.
-- Comente a abordagem A antes de usar esta.
-- =========================================================

-- alter table if exists public.empresa enable row level security;
-- alter table if exists public.perfil_acesso enable row level security;
-- alter table if exists public.integracao_config enable row level security;
-- alter table if exists public.integracao_sync_log enable row level security;
-- alter table if exists public.extratobancario enable row level security;
-- alter table if exists public.notificacao enable row level security;
-- alter table if exists public.app_config enable row level security;
-- alter table if exists public.app_asset enable row level security;
-- alter table if exists public.users enable row level security;
-- alter table if exists public.tabelaprecos enable row level security;

-- drop policy if exists empresa_admin_all on public.empresa;
-- create policy empresa_admin_all
-- on public.empresa
-- for all
-- to authenticated
-- using (
--   exists (
--     select 1
--     from public.users u
--     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--       and (
--         coalesce(u.is_platform_admin, false) = true
--         or u.profile in ('desenvolvedor', 'administrador')
--       )
--   )
-- )
-- with check (
--   exists (
--     select 1
--     from public.users u
--     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--       and (
--         coalesce(u.is_platform_admin, false) = true
--         or u.profile in ('desenvolvedor', 'administrador')
--       )
--   )
-- );

-- drop policy if exists perfil_acesso_admin_all on public.perfil_acesso;
-- create policy perfil_acesso_admin_all
-- on public.perfil_acesso
-- for all
-- to authenticated
-- using (
--   exists (
--     select 1
--     from public.users u
--     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--       and (
--         coalesce(u.is_platform_admin, false) = true
--         or u.profile in ('desenvolvedor', 'administrador')
--       )
--   )
-- )
-- with check (
--   exists (
--     select 1
--     from public.users u
--     where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
--       and (
--         coalesce(u.is_platform_admin, false) = true
--         or u.profile in ('desenvolvedor', 'administrador')
--       )
--   )
-- );
