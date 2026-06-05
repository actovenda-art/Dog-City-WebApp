select id, data_hora_transacao, nome_contraparte, valor, referencia, tipo_transacao_detalhado, metadata_financeira, raw_data, created_date
from public.extratobancario
where nome_contraparte ilike '%Otávio%'
   or nome_contraparte ilike '%Otavio%'
   or referencia ilike '%dac6e276-2e3f-4895-b26e-e17448263db4%'
   or cast(raw_data as text) ilike '%dac6e276-2e3f-4895-b26e-e17448263db4%'
   or cast(raw_data as text) ilike '%3661314001780563740000hyy4cAOadzKNd%'
   or cast(metadata_financeira as text) ilike '%3661314001780563740000hyy4cAOadzKNd%'
order by created_date desc
limit 20;
