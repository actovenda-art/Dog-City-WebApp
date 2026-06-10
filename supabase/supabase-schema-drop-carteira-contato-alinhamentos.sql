begin;

alter table if exists public.carteira
  drop column if exists contato_alinhamentos;

commit;
