-- Garante uma conta operacional ativa para cada Responsavel Financeiro ativo.
-- As tabelas permanecem separadas por responsabilidade, mas formam um contrato 1:1.

begin;

create or replace function public.finance_sync_wallet_account_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.ativo, true) then
    if new.empresa_id is null then
      raise exception 'Responsavel Financeiro ativo exige empresa_id para criar a conta operacional.'
        using errcode = '23502';
    end if;

    insert into public.carteira_conta (
      empresa_id,
      carteira_id,
      saldo_atual,
      saldo_negativo_autorizado,
      ativo,
      lock_version,
      observacoes_financeiras,
      created_date,
      updated_date
    )
    values (
      new.empresa_id,
      new.id,
      0,
      false,
      true,
      0,
      'Conta operacional criada automaticamente para o Responsavel Financeiro.',
      now(),
      now()
    )
    on conflict (carteira_id) do update
    set empresa_id = excluded.empresa_id,
        ativo = true,
        updated_date = now();
  else
    update public.carteira_conta
    set ativo = false,
        updated_date = now()
    where carteira_id = new.id
      and ativo is distinct from false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_carteira_sync_wallet_account on public.carteira;
create trigger trg_carteira_sync_wallet_account
after insert or update of empresa_id, ativo
on public.carteira
for each row
execute function public.finance_sync_wallet_account_for_profile();

insert into public.carteira_conta (
  empresa_id,
  carteira_id,
  saldo_atual,
  saldo_negativo_autorizado,
  ativo,
  lock_version,
  observacoes_financeiras,
  created_date,
  updated_date
)
select
  carteira.empresa_id,
  carteira.id,
  0,
  false,
  true,
  0,
  'Conta operacional criada pelo backfill do contrato 1:1.',
  now(),
  now()
from public.carteira carteira
where carteira.empresa_id is not null
  and coalesce(carteira.ativo, true)
  and carteira.deleted_at is null
on conflict (carteira_id) do update
set empresa_id = excluded.empresa_id,
    ativo = true,
    updated_date = now();

comment on function public.finance_sync_wallet_account_for_profile() is
  'Mantem automaticamente o contrato 1:1 entre Responsavel Financeiro e conta operacional.';

commit;
