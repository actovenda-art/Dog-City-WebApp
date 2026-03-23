-- Limpa dados importados do Banco Inter antes de uma reimportacao completa.

delete from public.extrato_duplicidade
where source_provider = 'banco_inter';

delete from public.extratobancario
where source_provider = 'banco_inter';

delete from public.integracao_sync_log
where provider = 'banco_inter';
