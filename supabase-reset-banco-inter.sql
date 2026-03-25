-- Limpa dados importados do Banco Inter antes de uma reimportacao completa.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'extrato_duplicidade'
  ) then
    delete from public.extrato_duplicidade
    where source_provider = 'banco_inter';
  end if;
end $$;

delete from public.extratobancario
where source_provider = 'banco_inter';

delete from public.integracao_sync_log
where provider = 'banco_inter';
