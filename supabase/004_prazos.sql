-- Up! Fluxo — prazos, checklist por cliente e notificações
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Funcionário responsável por cada cliente (recebe os lembretes)
alter table public.clients add column if not exists responsible_id uuid references public.profiles(id) on delete set null;

-- 2) Checklist de prazos de cada cliente
--    kind = 'calendario' → period = 1º dia do mês do calendário (prazo: dia 25 do mês anterior)
--    kind = 'design' | 'ajustes' | 'aprovacao' → period = segunda-feira da semana de publicação
--      (produção 2 semanas antes: design até quarta, ajustes quinta, aprovação sexta)
create table if not exists public.client_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('calendario', 'design', 'ajustes', 'aprovacao')),
  period date not null,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  unique (client_id, kind, period)
);

create or replace function public.stamp_task_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists client_tasks_stamp on public.client_tasks;
create trigger client_tasks_stamp
  before insert or update on public.client_tasks
  for each row execute function public.stamp_task_done();

alter table public.client_tasks enable row level security;

drop policy if exists "equipe gerencia checklist" on public.client_tasks;
create policy "equipe gerencia checklist" on public.client_tasks for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 3) Notificações (sino no topo da tela; o lembrete diário também manda por e-mail, se configurado)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  body text not null default '',
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "ver minhas notificações" on public.notifications;
create policy "ver minhas notificações" on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "marcar minhas notificações" on public.notifications;
create policy "marcar minhas notificações" on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "apagar minhas notificações" on public.notifications;
create policy "apagar minhas notificações" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- 4) Tempo real
do $$
begin
  begin
    alter publication supabase_realtime add table public.client_tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
