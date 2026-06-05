select id, nome_razao_social, cpf_cnpj, empresa_id
from public.carteira
where nome_razao_social ilike '%Otavio%' or nome_razao_social ilike '%Otávio%'
order by nome_razao_social;
