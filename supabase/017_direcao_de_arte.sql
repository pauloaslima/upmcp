-- Up! Fluxo | direção de arte: versões das artes, avaliação, refinamento e aprendizado por cliente
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- Configuração de direção de arte de cada cliente (cores, fontes, marca, estilo das fotos, o que evitar, ciclos)
alter table public.clients add column if not exists art_config jsonb not null default '{}'::jsonb;

-- Cada criação de arte é uma "rodada": especificação, direção, plano das páginas, versões,
-- críticas e notas de cada ciclo, e a decisão final (da avaliação automática e da equipe).
create table if not exists public.art_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  card_id uuid references public.cards(id) on delete set null,
  entry_id uuid references public.calendar_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- planejando | avaliando | refinando | aprovada | revisao_humana | erro
  status text not null default 'planejando',
  -- decisão da equipe: aprovada | reprovada (com motivo)
  team_status text,
  team_feedback text,
  ciclo int not null default 0,
  max_ciclos int not null default 3,
  mode text,
  format text,
  theme text,
  guidance text,
  enhance boolean not null default false,
  spec jsonb,
  plan jsonb,
  sources jsonb not null default '[]'::jsonb,
  critique jsonb,
  checks jsonb,
  versions jsonb not null default '[]'::jsonb,
  log jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb
);

create index if not exists art_runs_client_idx on public.art_runs (client_id, created_at desc);
create index if not exists art_runs_card_idx on public.art_runs (card_id, created_at desc);

alter table public.art_runs enable row level security;

-- só a equipe vê as rodadas (o sistema grava pelo servidor)
drop policy if exists "equipe ve rodadas de arte" on public.art_runs;
create policy "equipe ve rodadas de arte" on public.art_runs
  for select using (public.is_staff());
