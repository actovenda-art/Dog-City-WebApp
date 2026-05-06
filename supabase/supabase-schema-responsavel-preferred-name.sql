alter table public.responsavel
add column if not exists como_gostaria_de_ser_chamado text;

comment on column public.responsavel.como_gostaria_de_ser_chamado is
'Nome ou forma de tratamento preferida pelo responsável.';
