select *
from public.obrigacao_financeira
where carteira_conta_id = 'd9b2ffcd-097d-4911-9038-0e12e22d371a'
   or orcamento_id = '56025d5f-3645-4e02-9a90-6888952fecea'
order by created_date desc
limit 20;
