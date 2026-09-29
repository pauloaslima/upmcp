-- Up! Fluxo — responsáveis, tarefas, rotina diária, equipe por cliente e identidade visual
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Responsável e prazo em cada peça; responsável em cada tarefa do checklist
alter table public.cards add column if not exists assignee_id uuid references public.profiles(id) on delete set null;
alter table public.cards add column if not exists due_date date;
create index if not exists cards_assignee on public.cards (assignee_id);

alter table public.client_tasks add column if not exists assignee_id uuid references public.profiles(id) on delete set null;

-- 2) Identidade visual do cliente
alter table public.clients add column if not exists identity text not null default '';
alter table public.clients add column if not exists identity_files jsonb not null default '[]'::jsonb;

-- 3) Conteúdo da semana: fotos, referências e identidade visual de cada tema
alter table public.calendar_entries add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.calendar_entries add column if not exists refs jsonb not null default '[]'::jsonb;
alter table public.calendar_entries add column if not exists use_client_identity boolean not null default true;
alter table public.calendar_entries add column if not exists identity_notes text not null default '';

-- 4) Equipe de cada cliente (funcionários ligados ao cliente e a função de cada um)
create table if not exists public.client_members (
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_label text not null default '',
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

alter table public.client_members enable row level security;

drop policy if exists "equipe vê membros" on public.client_members;
create policy "equipe vê membros" on public.client_members for select to authenticated
  using (public.is_staff());

drop policy if exists "admin gerencia membros" on public.client_members;
create policy "admin gerencia membros" on public.client_members for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- 5) Rotina diária dos funcionários (ex.: "Monitoramento" da 7Ball, todos os dias úteis)
create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  title text not null,
  weekdays int[] not null default '{1,2,3,4,5}', -- 0 = domingo … 6 = sábado
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.routine_checks (
  routine_id uuid not null references public.routines(id) on delete cascade,
  day date not null,
  done_by uuid references public.profiles(id) on delete set null default auth.uid(),
  done_at timestamptz not null default now(),
  primary key (routine_id, day)
);

alter table public.routines enable row level security;
alter table public.routine_checks enable row level security;

-- cada funcionário vê só a própria rotina; o administrador vê e gerencia todas
drop policy if exists "ver rotinas" on public.routines;
create policy "ver rotinas" on public.routines for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');

drop policy if exists "admin gerencia rotinas" on public.routines;
create policy "admin gerencia rotinas" on public.routines for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

drop policy if exists "ver marcações" on public.routine_checks;
create policy "ver marcações" on public.routine_checks for select to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and (r.user_id = auth.uid() or public.my_role() = 'admin')));

drop policy if exists "marcar rotina" on public.routine_checks;
create policy "marcar rotina" on public.routine_checks for insert to authenticated
  with check (exists (select 1 from public.routines r where r.id = routine_id and (r.user_id = auth.uid() or public.my_role() = 'admin')));

drop policy if exists "desmarcar rotina" on public.routine_checks;
create policy "desmarcar rotina" on public.routine_checks for delete to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and (r.user_id = auth.uid() or public.my_role() = 'admin')));

-- 6) Aviso no sino quando alguém recebe uma peça ou tarefa
create or replace function public.notify_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_client text;
  v_title text;
begin
  if new.assignee_id is null or new.assignee_id = auth.uid() then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then
    return new;
  end if;
  select name into v_client from public.clients where id = new.client_id;
  if tg_table_name = 'cards' then
    v_title := 'Nova peça para você: ' || coalesce(nullif(new.title, ''), 'sem título');
  else
    v_title := 'Nova tarefa para você: ' || case new.kind
      when 'calendario' then 'calendário do mês'
      when 'design' then 'demandas ao design'
      when 'ajustes' then 'ajustes do design'
      else 'envio para aprovação' end;
  end if;
  insert into public.notifications (user_id, client_id, title, body)
  values (new.assignee_id, new.client_id, v_title || coalesce(' — ' || v_client, ''), 'Veja os detalhes e o prazo na aba Tarefas.');
  return new;
end;
$$;

drop trigger if exists cards_notify_assignment on public.cards;
create trigger cards_notify_assignment
  after insert or update of assignee_id on public.cards
  for each row execute function public.notify_assignment();

drop trigger if exists client_tasks_notify_assignment on public.client_tasks;
create trigger client_tasks_notify_assignment
  after insert or update of assignee_id on public.client_tasks
  for each row execute function public.notify_assignment();

-- 7) Lembretes da rotina: 11:30 e 17:00 (Brasília), para quem ainda tem item sem marcar hoje
create or replace function public.routine_reminders(p_slot text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dow int := extract(dow from (now() at time zone 'America/Sao_Paulo'))::int;
  v_count int := 0;
  rec record;
begin
  for rec in
    select r.user_id,
           count(*) as pending,
           string_agg(r.title || coalesce(' — ' || c.name, ''), ', ' order by r.title) as items
    from public.routines r
    left join public.clients c on c.id = r.client_id
    where r.active
      and v_dow = any (r.weekdays)
      and not exists (select 1 from public.routine_checks k where k.routine_id = r.id and k.day = v_today)
    group by r.user_id
  loop
    insert into public.notifications (user_id, title, body, dedupe_key)
    values (
      rec.user_id,
      'Rotina de hoje: ' || rec.pending || ' item(ns) sem marcar (' || p_slot || ')',
      'Pendentes: ' || rec.items || '. Marque na aba Rotina diária.',
      'rotina|' || rec.user_id || '|' || v_today || '|' || p_slot
    )
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- agenda os lembretes (pg_cron roda em UTC; Brasília = UTC-3)
create extension if not exists pg_cron;

select cron.unschedule(jobname) from cron.job where jobname in ('rotina-11h30', 'rotina-17h');
select cron.schedule('rotina-11h30', '30 14 * * *', $cron$select public.routine_reminders('11h30')$cron$);
select cron.schedule('rotina-17h', '0 20 * * *', $cron$select public.routine_reminders('17h')$cron$);

-- 8) Tempo real
do $$
begin
  begin
    alter publication supabase_realtime add table public.routines;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.routine_checks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.client_members;
  exception when duplicate_object then null;
  end;
end $$;
