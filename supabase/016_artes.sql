-- Up! Fluxo | artes criadas pelo sistema para os posts (Estático e Carrossel)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- Lista das imagens da arte do post, na ordem (carrossel: uma por página).
-- Os arquivos ficam no bucket "anexos", na pasta da peça (assim o cliente vê a arte da peça que ele aprova).
alter table public.calendar_entries add column if not exists art jsonb not null default '[]'::jsonb;
