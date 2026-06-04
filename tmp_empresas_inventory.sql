select id, nome_fantasia, razao_social, ativo, created_date
from public.empresa
order by created_date nulls first, id;
