-- Up! Fluxo | posts do calendário viram tarefa "Publicar post" (aba Tarefas e Rotina diária)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) quando e quem marcou o post como publicado
alter table public.calendar_entries add column if not exists published_at timestamptz;
alter table public.calendar_entries add column if not exists published_by uuid references public.profiles(id) on delete set null;

-- 2) lembretes da rotina (11:30 e 17:00): passam a contar também os posts de hoje ainda não publicados,
--    para o responsável pelo cliente
create or replace function public.routine_reminders(p_slot text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dow int := extract(dow from (now() at time zone 'America/Sao_Paulo'))::int;
  v_count int := 0;
  rec record;
begin
  for rec in
    select user_id, count(*) as pending, string_agg(item, ', ' order by item) as items
    from (
      select r.user_id, r.title || coalesce(' | ' || c.name, '') as item
      from public.routines r
      left join public.clients c on c.id = r.client_id
      where r.active
        and v_dow = any (r.weekdays)
        and not exists (select 1 from public.routine_checks k where k.routine_id = r.id and k.day = v_today)
      union all
      select c.responsible_id, 'Publicar post | ' || c.name
      from public.calendar_entries e
      join public.clients c on c.id = e.client_id
      where e.day = v_today
        and e.published_at is null
        and c.responsible_id is not null
    ) pendentes
    group by user_id
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
