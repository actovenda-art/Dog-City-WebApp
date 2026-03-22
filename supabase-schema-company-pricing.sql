-- Multi-company and pricing extensions for Dog City Brasil
-- Run after the base schemas

alter table if exists users
  add column if not exists empresa_id text;

alter table if exists dogs
  add column if not exists empresa_id text;

alter table if exists carteira
  add column if not exists empresa_id text;

alter table if exists responsavel
  add column if not exists empresa_id text;

alter table if exists orcamento
  add column if not exists empresa_id text;

alter table if exists pedidointerno
  add column if not exists empresa_id text;

alter table if exists lancamento
  add column if not exists empresa_id text;

alter table if exists checkins
  add column if not exists empresa_id text;

alter table if exists tabelaprecos
  add column if not exists empresa_id text,
  add column if not exists tipo text,
  add column if not exists raca text,
  add column if not exists config_key text,
  add column if not exists metadata jsonb default '{}'::jsonb;

do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'users') then
    create index if not exists idx_users_empresa_id on users(empresa_id);
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'tabelaprecos') then
    create index if not exists idx_tabelaprecos_empresa_tipo on tabelaprecos(empresa_id, tipo);
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'pedidointerno') then
    create index if not exists idx_pedidointerno_empresa_id on pedidointerno(empresa_id);
  end if;

  if exists (select 1 from information_schema.tables where table_name = 'lancamento') then
    create index if not exists idx_lancamento_empresa_id on lancamento(empresa_id);
  end if;
end $$;

insert into tabelaprecos (codigo, descricao, valor, ativo, tipo, empresa_id, config_key)
values
  ('HOSPEDAGEM_NORMAL', 'Hospedagem nao mensalista', 150, true, 'hospedagem', null, 'diaria_normal'),
  ('HOSPEDAGEM_MENSALISTA', 'Hospedagem mensalista', 120, true, 'hospedagem_mensalista', null, 'diaria_mensalista'),
  ('PERNOITE_DAYCARE', 'Pernoite day care', 60, true, 'pernoite', null, 'pernoite'),
  ('TRANSPORTE_KM', 'Transporte por km', 6, true, 'transporte_km', null, 'transporte_km'),
  ('DESC_DORMITORIO', 'Desconto dormitorio compartilhado', 30, true, 'desconto', null, 'desconto_canil'),
  ('DESC_LONGA_ESTADIA', 'Desconto longa estadia', 3, true, 'desconto', null, 'desconto_longa_estadia')
on conflict do nothing;
