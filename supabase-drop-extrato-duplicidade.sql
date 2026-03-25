-- Remove a estrutura legada de revisao de duplicidades do extrato.
-- O fluxo atual considera o `external_id` do Banco Inter como fonte de verdade
-- e recarrega apenas o dia atual, sem usar mais a tabela `extrato_duplicidade`.

drop table if exists public.extrato_duplicidade;
