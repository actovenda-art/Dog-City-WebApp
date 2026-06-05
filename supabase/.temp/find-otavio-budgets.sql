select id, codigo_interno, status, cliente_id, carteira_id, empresa_id, valor_aprovado, updated_date
from public.orcamento
where lower(unaccent(responsavel_financeiro_nome)) like lower(unaccent('%otavio%'))
   or lower(unaccent(nome_responsavel_financeiro)) like lower(unaccent('%otavio%'))
order by updated_date desc
limit 20;
