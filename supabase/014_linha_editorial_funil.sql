-- Up! Fluxo | corrige a linha editorial dos posts antigos
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- Em temas no padrão "MEIO | Educativo | Ideia", a primeira parte é a etapa do funil.
-- Nesses casos, a linha editorial passa a ser a segunda parte (ex.: "Educativo").
update public.calendar_entries
set editorial_line = left(trim(split_part(theme, ' | ', 2)), 60)
where upper(trim(editorial_line)) in ('TOPO', 'MEIO', 'FUNDO', 'TOFU', 'MOFU', 'BOFU', 'TOPO DE FUNIL', 'MEIO DE FUNIL', 'FUNDO DE FUNIL')
  and trim(split_part(theme, ' | ', 2)) <> '';
