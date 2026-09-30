-- Up! Fluxo — perfil do cliente (posicionamento, observações, Drive) e temas criados pelo agente
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

alter table public.clients add column if not exists positioning text not null default '';
alter table public.clients add column if not exists notes text not null default '';
alter table public.clients add column if not exists drive_url text not null default '';

-- temas sugeridos pelo agente de conteúdo aparecem marcados para a equipe revisar
alter table public.calendar_entries add column if not exists created_by_agent boolean not null default false;
