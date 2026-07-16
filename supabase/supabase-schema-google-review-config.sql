begin;

insert into public.app_config (
  id,
  key,
  label,
  description,
  value,
  ativo,
  created_date,
  updated_date,
  empresa_id
)
select
  'branding_google_review_url_global',
  'branding.google_review_url',
  'Link de avaliação no Google',
  'Destino público usado pelo endereço curto /avaliar',
  jsonb_build_object(
    'url',
    'https://www.google.com/search?sca_esv=641454aca0393425&sxsrf=APpeQnu6n2ALppJ6CUDQqAVVNieBiqFvvQ:1784228633661&si=APenkKm7iecQ4G6P-TsbSMFKIQtv3EFIqRAFw-i8uEbk55Z-_857hnRKM2722zgsoH26o_Gv-fH_Wazn58eQTCM5KsB5thQZTgMg2cgG08SPbjgGBi07tlogIUlfczfVFYam74Z9T6-ygzpb_9wU8ARLiJiYx6eQxg%3D%3D&q=Dog+City+Brasil+-+Sousas+Coment%C3%A1rios&sa=X&ved=2ahUKEwj66qDP8deVAxXutpUCHUrAMi4Q0bkNegQINBAF&biw=1536&bih=776&dpr=1.25#lrd=0x94c8d1738185c0eb:0x822e28d07a2eb61b,3,,,,'
  ),
  true,
  now(),
  now(),
  null
where not exists (
  select 1
  from public.app_config
  where key = 'branding.google_review_url'
    and empresa_id is null
);

create or replace function public.app_public_google_review_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(config.value ->> 'url'), '')
  from public.app_config config
  where config.key = 'branding.google_review_url'
    and config.empresa_id is null
    and config.ativo is true
  order by config.updated_date desc nulls last, config.created_date desc nulls last
  limit 1
$$;

revoke all on function public.app_public_google_review_url() from public;
grant execute on function public.app_public_google_review_url() to anon, authenticated, service_role;

comment on function public.app_public_google_review_url() is
  'Expõe somente o link público configurado para a avaliação da Dog City no Google.';

commit;
