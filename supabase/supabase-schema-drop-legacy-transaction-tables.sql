-- Cleanup estrutural: Transaction/ScheduledTransaction foram substituídas por
-- ExtratoBancario, Lancamento, CarteiraMovimento e ObrigacaoFinanceira.
--
-- Esta migration remove apenas as tabelas legadas que não devem mais ser
-- usadas pelo app. Não remove conta_receber, extratobancario ou legado
-- operacional ainda preservado.

drop table if exists public.scheduledtransaction cascade;
drop table if exists public."transaction" cascade;
