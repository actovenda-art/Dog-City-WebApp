-- Reestruturação definitiva do extrato bancário para o modelo com ID único.
-- Regras:
-- 1. `extratobancario.id` é o único identificador da transação.
-- 2. API Banco Inter grava o identificador oficial do banco em `id`.
-- 3. CSV usa `csv_<hash>`.
-- 4. Inclusão manual usa `manual_<uuid>`.
-- 5. Centro de custo deixa de existir no extrato e passa a viver apenas em `lancamento`
--    (e nas tabelas de despesa/receita que derivarem dessa camada financeira).

begin;

create extension if not exists pgcrypto;

alter table if exists public.extratobancario
  alter column id drop default;

comment on column public.extratobancario.id is
  'Identificador único da transação. API usa o ID oficial do banco; inclusões manuais usam prefixos próprios.';

create or replace view public.vw_despesas_centro_custo as
select
  l.empresa_id,
  coalesce(nullif(trim(l.centro_custo_nome), ''), nullif(trim(l.categoria), ''), 'Sem centro de custo') as centro_custo_nome,
  count(*)::bigint as quantidade,
  coalesce(sum(coalesce(l.valor, 0) + coalesce(l.juros_multa, 0)), 0)::numeric as valor_total,
  min(coalesce(l.data_quitacao, l.vencimento, l.created_date::date)) as primeira_saida,
  max(coalesce(l.data_quitacao, l.vencimento, l.created_date::date)) as ultima_saida
from public.lancamento l
group by
  l.empresa_id,
  coalesce(nullif(trim(l.centro_custo_nome), ''), nullif(trim(l.categoria), ''), 'Sem centro de custo');

truncate table public.extratobancario;

drop index if exists idx_extratobancario_unique_external;

alter table if exists public.extratobancario
  drop column if exists external_id,
  drop column if exists lancamento_id,
  drop column if exists centro_custo_id,
  drop column if exists centro_custo_nome;

commit;
