-- Up! Fluxo — artes geradas com IA (modo híbrido: a IA faz a imagem, o sistema escreve o texto)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- Identidade usada na montagem das artes
alter table public.clients add column if not exists brand_colors text not null default '';      -- ex.: "#1B2A4A, #C9A227"
alter table public.clients add column if not exists title_font text not null default 'Montserrat';
alter table public.clients add column if not exists body_font text not null default 'Inter';
alter table public.clients add column if not exists brand_logo jsonb not null default '[]'::jsonb; -- 1 arquivo (PNG com fundo transparente)
alter table public.clients add column if not exists font_file jsonb not null default '[]'::jsonb;  -- fonte própria do cliente (.ttf ou .otf), opcional

-- Páginas da arte de cada tema: texto, pedido de imagem, imagem gerada e arte montada
alter table public.calendar_entries add column if not exists arts jsonb not null default '[]'::jsonb;
