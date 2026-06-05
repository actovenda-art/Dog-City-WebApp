select id, transacao_id, data_hora_transacao, nome_contraparte, valor, referencia, metadata_financeira, raw_data
from public.extrato_bancario
where transacao_id = 'dac6e276-2e3f-4895-b26e-e17448263db4'
   or referencia = 'dac6e276-2e3f-4895-b26e-e17448263db4'
   or cast(raw_data as text) ilike '%dac6e276-2e3f-4895-b26e-e17448263db4%'
   or cast(metadata_financeira as text) ilike '%dac6e276-2e3f-4895-b26e-e17448263db4%'
order by created_date desc
limit 20;
