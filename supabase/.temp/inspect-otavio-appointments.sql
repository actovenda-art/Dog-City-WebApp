select id, empresa_id, dog_id, cliente_id, orcamento_id, service_type, data_referencia, status, created_date, updated_date, metadata
from public.appointment
where dog_id = 'ceff0035-ed8e-43b3-a478-579604429640'
   or orcamento_id = '56025d5f-3645-4e02-9a90-6888952fecea'
order by created_date desc
limit 20;
