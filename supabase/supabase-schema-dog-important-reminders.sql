begin;

alter table if exists public.dogs
  add column if not exists data_revacinacao_4 date,
  add column if not exists nome_vacina_revacinacao_4 text,
  add column if not exists data_revacinacao_5 date,
  add column if not exists nome_vacina_revacinacao_5 text;

comment on column public.dogs.data_revacinacao_1 is
  'Data do primeiro lembrete importante do pet.';
comment on column public.dogs.nome_vacina_revacinacao_1 is
  'Nome do primeiro lembrete importante do pet.';
comment on column public.dogs.data_revacinacao_2 is
  'Data do segundo lembrete importante do pet.';
comment on column public.dogs.nome_vacina_revacinacao_2 is
  'Nome do segundo lembrete importante do pet.';
comment on column public.dogs.data_revacinacao_3 is
  'Data do terceiro lembrete importante do pet.';
comment on column public.dogs.nome_vacina_revacinacao_3 is
  'Nome do terceiro lembrete importante do pet.';
comment on column public.dogs.data_revacinacao_4 is
  'Data do quarto lembrete importante do pet.';
comment on column public.dogs.nome_vacina_revacinacao_4 is
  'Nome do quarto lembrete importante do pet.';
comment on column public.dogs.data_revacinacao_5 is
  'Data do quinto lembrete importante do pet.';
comment on column public.dogs.nome_vacina_revacinacao_5 is
  'Nome do quinto lembrete importante do pet.';

commit;
