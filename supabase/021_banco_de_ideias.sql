-- Banco de ideias de cada cliente: categoria, descrição e link.
-- Só a equipe (administradores e funcionários) vê e mexe; o cliente não tem acesso.
-- Cliente "só administradores" (UP DIGITAL) continua visível só para administradores.

create table if not exists public.client_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null default '',
  description text not null default '',
  link text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_ideas_client_idx on public.client_ideas (client_id, created_at desc);

alter table public.client_ideas enable row level security;

drop policy if exists "equipe gerencia banco de ideias" on public.client_ideas;
create policy "equipe gerencia banco de ideias" on public.client_ideas for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));
