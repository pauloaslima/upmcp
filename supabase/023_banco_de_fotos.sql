-- Banco de fotos de cada cliente: a equipe sobe as fotos uma vez e as artes escolhem dali.
-- As fotos ficam comprimidas no armazenamento (pasta clients/<id do cliente>/fotos/).
-- Só a equipe vê; cliente "só administradores" continua só para administradores.

create table if not exists public.client_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  path text not null,
  thumb_path text not null default '',
  name text not null default '',
  tags text not null default '',
  width int,
  height int,
  size int,
  active boolean not null default true,      -- false = "não usar mais" (sai das sugestões, sem apagar)
  use_count int not null default 0,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists client_photos_client_idx on public.client_photos (client_id, created_at desc);

alter table public.client_photos enable row level security;

drop policy if exists "equipe gerencia banco de fotos" on public.client_photos;
create policy "equipe gerencia banco de fotos" on public.client_photos for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));
