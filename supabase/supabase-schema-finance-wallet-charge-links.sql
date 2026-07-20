-- Wallet charge links
-- External payment requests issued for a financial wallet. This is separate
-- from obrigacao_financeira (debt) and carteira_movimento (wallet ledger).

create extension if not exists pgcrypto;

create table if not exists public.carteira_cobranca (
  id text primary key default gen_random_uuid()::text,
  empresa_id text not null,
  carteira_id text not null references public.carteira(id) on delete cascade,
  carteira_conta_id text null references public.carteira_conta(id) on delete set null,
  responsavel_id text null,
  provider text not null default 'banco_inter',
  metodo text not null default 'boleto_bancario',
  status text not null default 'pendente_emissao',
  status_inter text null,
  valor numeric(12,2) not null,
  descricao text not null,
  data_vencimento date not null,
  seu_numero text null,
  codigo_solicitacao text null,
  nosso_numero text null,
  txid text null,
  linha_digitavel text null,
  codigo_barras text null,
  pix_copia_cola text null,
  pdf_disponivel boolean not null default false,
  emitido_em timestamptz null,
  pago_em timestamptz null,
  valor_recebido numeric(12,2) not null default 0,
  credited_wallet_movement_id text null,
  creditado_em timestamptz null,
  public_token_hash text not null,
  public_token_expires_at timestamptz not null,
  created_by_user_id text null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  constraint chk_carteira_cobranca_metodo
    check (metodo in ('boleto_bancario', 'pix', 'cartao')),
  constraint chk_carteira_cobranca_status
    check (status in ('pendente_emissao', 'emitido', 'recebido', 'baixado', 'expirado', 'cancelado', 'falha')),
  constraint chk_carteira_cobranca_valor
    check (valor > 0 and valor = round(valor, 2)),
  constraint chk_carteira_cobranca_valor_recebido
    check (valor_recebido >= 0 and valor_recebido = round(valor_recebido, 2)),
  constraint uq_carteira_cobranca_codigo_solicitacao
    unique (codigo_solicitacao),
  constraint uq_carteira_cobranca_public_token_hash
    unique (public_token_hash)
);

create index if not exists idx_carteira_cobranca_wallet_open
  on public.carteira_cobranca (empresa_id, carteira_id, status, data_vencimento asc, created_date desc);

create index if not exists idx_carteira_cobranca_wallet_issued
  on public.carteira_cobranca (empresa_id, carteira_id, emitido_em desc, created_date desc);

create index if not exists idx_carteira_cobranca_token_expiry
  on public.carteira_cobranca (public_token_expires_at);

create or replace function public.finance_wallet_charge_set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists trg_carteira_cobranca_updated_date on public.carteira_cobranca;
create trigger trg_carteira_cobranca_updated_date
before update on public.carteira_cobranca
for each row
execute function public.finance_wallet_charge_set_updated_date();

alter table public.carteira_cobranca enable row level security;

-- Browser clients never query this table directly. Authenticated staff and
-- public links are both mediated by the Edge Function, which enforces scope
-- and keeps the opaque token out of the database.
revoke all on table public.carteira_cobranca from anon, authenticated;

comment on table public.carteira_cobranca is
  'External payment requests for a financial wallet. Public access uses an opaque token hash through the Banco Inter Edge Function.';
