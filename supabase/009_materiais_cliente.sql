-- Up! Fluxo — materiais do cliente e campos novos do perfil
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- campos novos do Perfil do cliente
alter table public.clients add column if not exists target_audience text not null default '';   -- público-alvo
alter table public.clients add column if not exists tone_of_voice text not null default '';     -- tom de voz
alter table public.clients add column if not exists editorial_lines text not null default '';   -- linhas editoriais / pilares
alter table public.clients add column if not exists art_references text not null default '';    -- referências para as artes

-- materiais enviados (PDF, imagens, planilhas, Word): [{ type, path, name, category, size }]
-- category: 'identidade' | 'estrategia' | 'exemplos' | 'editorial' | 'outros'
alter table public.clients add column if not exists materials jsonb not null default '[]'::jsonb;
