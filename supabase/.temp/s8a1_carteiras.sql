select c.id as carteira_id, c.empresa_id, c.nome_razao_social, cc.id as carteira_conta_id, cc.saldo_atual
from public.carteira c
left join public.carteira_conta cc on cc.carteira_id = c.id
where c.id in (
  'client_1',
  'client_2',
  'eb67d4b1-62d0-453a-838b-430a9aee31d3',
  '1716ee98-6817-4807-9ebe-bbd59f384ed8'
)
order by c.id;
