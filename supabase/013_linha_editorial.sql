-- Up! Fluxo — linha editorial de cada post do calendário
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

alter table public.calendar_entries add column if not exists editorial_line text not null default '';

-- temas que já existem no padrão "Linha | Pilar | Ideia": a linha editorial é a primeira parte
update public.calendar_entries
set editorial_line = left(trim(split_part(theme, ' | ', 1)), 60)
where editorial_line = ''
  and theme like '% | % | %';
