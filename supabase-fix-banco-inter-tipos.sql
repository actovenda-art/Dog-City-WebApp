-- Corrige o tipo entrada/saida dos lancamentos importados do Banco Inter.

update public.extratobancario
set tipo = case
  when lower(coalesce(raw_data->>'tipoOperacao', '')) = 'd' then 'saida'
  when lower(coalesce(raw_data->>'tipoOperacao', '')) = 'c' then 'entrada'
  when lower(coalesce(raw_data->>'descricao', '')) like '%pix enviado%' then 'saida'
  when lower(coalesce(raw_data->>'descricao', '')) like '%pagamento%' then 'saida'
  when lower(coalesce(raw_data->>'descricao', '')) like '%pix recebido%' then 'entrada'
  when lower(coalesce(raw_data->>'titulo', '')) like '%enviado%' then 'saida'
  when lower(coalesce(raw_data->>'titulo', '')) like '%recebido%' then 'entrada'
  else tipo
end
where source_provider = 'banco_inter';
