-- Corrige valores do extrato Banco Inter usando o valor bruto salvo em raw_data.
-- Use apos a importacao inicial caso os valores tenham sido multiplicados incorretamente.

update public.extratobancario
set valor = (
  case
    when coalesce(raw_data->>'valor', '') like '%,%' and coalesce(raw_data->>'valor', '') like '%.%' then
      replace(replace(raw_data->>'valor', '.', ''), ',', '.')::numeric
    when coalesce(raw_data->>'valor', '') like '%,%' then
      replace(raw_data->>'valor', ',', '.')::numeric
    else
      (raw_data->>'valor')::numeric
  end
)
where source_provider = 'banco_inter'
  and raw_data ? 'valor'
  and coalesce(raw_data->>'valor', '') <> '';
