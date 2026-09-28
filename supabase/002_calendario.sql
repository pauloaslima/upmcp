-- Up! Fluxo — clientes e calendário de temas
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Clientes: cada um tem o seu próprio calendário
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.clients (name) values
  ('Carla Zaupa Psi'),
  ('Romanzza Vix'),
  ('Ludmila Vale Psi'),
  ('7Ball Vitória'),
  ('Elegance'),
  ('Prime Planejados'),
  ('Mass Spray'),
  ('Cuñas Burger'),
  ('Sandra Ferreira Psi'),
  ('Suakasa Móveis'),
  ('Jozeane Cassol Psi'),
  ('CASACOR Espírito Santo'),
  ('LB Cleaning Organize'),
  ('Sala de Oração'),
  ('Daniele Banco'),
  ('Waleska Farias')
on conflict (name) do nothing;

-- 2) Temas do calendário (um por linha; um dia pode ter vários)
create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  format text not null default '',
  theme text not null default '',
  post_time text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);

create index if not exists calendar_entries_client_day on public.calendar_entries (client_id, day);

drop trigger if exists calendar_entries_set_updated_at on public.calendar_entries;
create trigger calendar_entries_set_updated_at
  before update on public.calendar_entries
  for each row execute function public.set_updated_at();

-- 3) Segurança: mesmas regras do quadro — só quem está logado acessa
alter table public.clients enable row level security;
alter table public.calendar_entries enable row level security;

drop policy if exists "logados gerenciam clientes" on public.clients;
create policy "logados gerenciam clientes"
  on public.clients for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "logados gerenciam calendário" on public.calendar_entries;
create policy "logados gerenciam calendário"
  on public.calendar_entries for all
  to authenticated
  using (true)
  with check (true);

-- 4) Tempo real: a tela de todo mundo atualiza sozinha
do $$
begin
  begin
    alter publication supabase_realtime add table public.clients;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.calendar_entries;
  exception when duplicate_object then null;
  end;
end $$;
