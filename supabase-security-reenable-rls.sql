-- Remediacao imediata para os alertas do Supabase Security Advisor:
-- - rls_desativado_em_publico
-- - colunas_sensiveis_expostas
--
-- Este arquivo assume que as policies do projeto ja foram criadas anteriormente
-- por `supabase-schema-unit-isolation.sql` e pelos schemas mais recentes.
-- Ele apenas reativa o RLS nas tabelas que ficaram expostas por scripts legados
-- de "desbloqueio rapido".
--
-- Execute este arquivo no SQL Editor do projeto `trgpprhtqkldjdrhwlxa`.
-- Depois disso, NAO rode novamente:
-- - supabase-policies-admin-multiempresa.sql
-- - supabase-policies-finance-unlock.sql

alter table if exists public.empresa enable row level security;
alter table if exists public.perfil_acesso enable row level security;
alter table if exists public.integracao_config enable row level security;
alter table if exists public.integracao_sync_log enable row level security;
alter table if exists public.extratobancario enable row level security;
alter table if exists public.extrato_duplicidade enable row level security;
alter table if exists public.notificacao enable row level security;
alter table if exists public.lancamento enable row level security;
alter table if exists public.despesa enable row level security;
alter table if exists public.conta_receber enable row level security;
alter table if exists public.receita enable row level security;
alter table if exists public.app_config enable row level security;
alter table if exists public.app_asset enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.tabelaprecos enable row level security;
alter table if exists public.user_unit_access enable row level security;
alter table if exists public.user_invite enable row level security;

-- Tabelas operacionais com escopo por unidade.
alter table if exists public.dogs enable row level security;
alter table if exists public.carteira enable row level security;
alter table if exists public.responsavel enable row level security;
alter table if exists public.orcamento enable row level security;
alter table if exists public.appointment enable row level security;
alter table if exists public.plan_config enable row level security;
alter table if exists public.checkins enable row level security;
alter table if exists public.serviceprovided enable row level security;
alter table if exists public.serviceproviders enable row level security;
alter table if exists public.pedidointerno enable row level security;
alter table if exists public."transaction" enable row level security;
alter table if exists public.scheduledtransaction enable row level security;
alter table if exists public.replacement enable row level security;

-- Opcional: confirma visualmente o estado apos a execucao.
select
  schemaname,
  tablename,
  rowsecurity as rls_ativo
from pg_tables
where schemaname = 'public'
  and tablename in (
    'empresa',
    'perfil_acesso',
    'integracao_config',
    'integracao_sync_log',
    'extratobancario',
    'extrato_duplicidade',
    'notificacao',
    'lancamento',
    'despesa',
    'conta_receber',
    'receita',
    'app_config',
    'app_asset',
    'users',
    'tabelaprecos',
    'user_unit_access',
    'user_invite',
    'dogs',
    'carteira',
    'responsavel',
    'orcamento',
    'appointment',
    'plan_config',
    'checkins',
    'serviceprovided',
    'serviceproviders',
    'pedidointerno',
    'transaction',
    'scheduledtransaction',
    'replacement'
  )
order by tablename;
