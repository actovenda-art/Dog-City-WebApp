-- Modelo financeiro definitivo para vínculo por ID principal da transação.
--
-- Regras desta estrutura:
-- 1. public.extratobancario.id é o único identificador da transação.
-- 2. Se vier da API, use o ID oficial do banco em extratobancario.id.
-- 3. Se for manual, use um ID próprio sem risco de colisão futura (ex.: manual_<uuid>).
-- 4. sync_run_id permanece apenas para auditoria da sincronização/importação.
-- 5. referencia permanece apenas como referência de negócio/exibição.
-- 6. external_id e lancamento_id deixam de existir em extratobancario.
-- 7. centro_custo_* deixa de existir em extratobancario; centro de custo vive em lancamento/despesa.
-- 8. extratobancario.vinculo_financeiro guarda o código do item financeiro vinculado
--    (ex.: despesa, carteira, lançamento ou outro código de negócio).
-- 9. despesa.transacao_id guarda o ID da transação do extrato vinculada à despesa.
-- 10. receita.transacao_id guarda o ID da transação do extrato vinculada à recarga/carteira.
-- 11. lancamento.transacao_id pode ser usado como etapa operacional intermediária,
--     mas não substitui a identidade principal da transação bancária.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vw_despesas_centro_custo'
      and column_name = 'centro_custo'
  ) then
    execute 'alter view public.vw_despesas_centro_custo rename column centro_custo to centro_custo_nome';
  end if;
exception
  when undefined_table then
    null;
  when undefined_column then
    null;
end $$;

drop view if exists public.vw_despesas_centro_custo;

create view public.vw_despesas_centro_custo as
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

truncate table public.despesa;
truncate table public.receita;
truncate table public.extratobancario;

alter table if exists public.extratobancario
  alter column id drop default;

comment on column public.extratobancario.id is
  'Identificador único da transação bancária. API usa o ID oficial do banco; lançamentos manuais usam prefixo próprio.';

alter table if exists public.extratobancario
  add column if not exists vinculo_financeiro text;

comment on column public.extratobancario.vinculo_financeiro is
  'Código do item financeiro vinculado a esta transação (despesa, carteira, lançamento ou outro código de negócio).';

drop index if exists idx_extratobancario_unique_external;

alter table if exists public.extratobancario
  drop column if exists external_id,
  drop column if exists lancamento_id,
  drop column if exists centro_custo_id,
  drop column if exists centro_custo_nome;

create index if not exists idx_extratobancario_vinculo_financeiro
  on public.extratobancario (vinculo_financeiro);

alter table if exists public.despesa
  add column if not exists data date,
  add column if not exists categoria text,
  add column if not exists subcategoria text,
  add column if not exists descricao text,
  add column if not exists valor numeric,
  add column if not exists centro_custo_nome text,
  add column if not exists forma_pagamento text,
  add column if not exists fornecedor text,
  add column if not exists observacoes text,
  add column if not exists transacao_id text,
  add column if not exists vinculo_transacao_id text;

comment on column public.despesa.transacao_id is
  'ID principal da transação do extrato vinculada a esta despesa.';

comment on column public.despesa.vinculo_transacao_id is
  'Espelho operacional de transacao_id para compatibilidade durante a transição.';

update public.despesa
set vinculo_transacao_id = coalesce(vinculo_transacao_id, transacao_id)
where true;

alter table if exists public.despesa
  alter column transacao_id set not null;

alter table if exists public.despesa
  drop constraint if exists despesa_transacao_id_fkey;

alter table if exists public.despesa
  add constraint despesa_transacao_id_fkey
  foreign key (transacao_id) references public.extratobancario(id)
  on update cascade
  on delete restrict;

create index if not exists idx_despesa_transacao_id
  on public.despesa (transacao_id);

alter table if exists public.receita
  add column if not exists data date,
  add column if not exists descricao text,
  add column if not exists valor numeric,
  add column if not exists observacoes text,
  add column if not exists carteira_id text,
  add column if not exists carteira_nome text,
  add column if not exists transacao_id text;

comment on column public.receita.transacao_id is
  'ID principal da transação do extrato vinculada à recarga/carteira.';

comment on column public.receita.carteira_id is
  'Carteira do cliente que recebeu a recarga vinculada a esta transação.';

comment on column public.receita.carteira_nome is
  'Nome de exibição da carteira vinculada à recarga.';

alter table if exists public.receita
  alter column carteira_id set not null,
  alter column transacao_id set not null;

alter table if exists public.receita
  drop constraint if exists receita_transacao_id_fkey;

alter table if exists public.receita
  drop constraint if exists receita_carteira_id_fkey;

alter table if exists public.receita
  add constraint receita_transacao_id_fkey
  foreign key (transacao_id) references public.extratobancario(id)
  on update cascade
  on delete restrict;

alter table if exists public.receita
  add constraint receita_carteira_id_fkey
  foreign key (carteira_id) references public.carteira(id)
  on update cascade
  on delete restrict;

create index if not exists idx_receita_transacao_id
  on public.receita (transacao_id);

create index if not exists idx_receita_carteira_id
  on public.receita (carteira_id);

alter table if exists public.lancamento
  add column if not exists transacao_id text,
  add column if not exists codigo_vinculo_financeiro text;

comment on column public.lancamento.transacao_id is
  'ID principal da transação do extrato vinculada a este lançamento operacional.';

comment on column public.lancamento.codigo_vinculo_financeiro is
  'Código do item financeiro definitivo criado a partir deste lançamento.';

create index if not exists idx_lancamento_transacao_id
  on public.lancamento (transacao_id);

create index if not exists idx_lancamento_codigo_vinculo_financeiro
  on public.lancamento (codigo_vinculo_financeiro);

commit;
