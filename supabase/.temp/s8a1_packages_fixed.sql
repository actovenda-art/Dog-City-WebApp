select id, empresa_id, client_id, pet_id, service_id, frequency, price_per_session, start_date, end_date, status, financial_behavior, metadata
from public.recurring_packages
where client_id in (
  'eb67d4b1-62d0-453a-838b-430a9aee31d3',
  '1716ee98-6817-4807-9ebe-bbd59f384ed8'
)
   or pet_id in (
  '60f43d6f-498b-447d-a703-69feadb6d46a',
  'ceff0035-ed8e-43b3-a478-579604429640'
)
order by created_date;
