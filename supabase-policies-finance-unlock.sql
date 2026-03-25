-- Desbloqueio rapido da area financeira no app atual.
-- Execute se o frontend estiver usando anon key sem policies autenticadas completas.
-- Em producao, este arquivo deixa tabelas expostas sem RLS e deve ser evitado.

alter table if exists public.lancamento disable row level security;
alter table if exists public.despesa disable row level security;
alter table if exists public.conta_receber disable row level security;
alter table if exists public.receita disable row level security;
alter table if exists public.extratobancario disable row level security;
alter table if exists public.extrato_duplicidade disable row level security;
