with carteira_alvo as (
  select c.id as carteira_id, c.nome_razao_social, c.cpf_cnpj, c.empresa_id, cc.id as carteira_conta_id
  from public.carteira c
  left join public.carteira_conta cc on cc.carteira_id = c.id
  where lower(c.nome_razao_social) like lower('%Otávio Ferreira%')
)
select * from carteira_alvo;
