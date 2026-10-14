-- Up! Fluxo | rotinas semanais, quinzenais e mensais (antes: só dias da semana)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- frequência da rotina:
--   semanal   = nos dias da semana marcados (todo dia útil = seg a sex)
--   quinzenal = nos dias da semana marcados, semana sim, semana não (a partir de start_date)
--   mensal    = todo mês no dia month_day (meses mais curtos: o último dia)
alter table public.routines add column if not exists frequency text not null default 'semanal';
alter table public.routines add column if not exists month_day int;
alter table public.routines add column if not exists start_date date not null default ((now() at time zone 'America/Sao_Paulo')::date);

do $$ begin
  alter table public.routines add constraint routines_frequency_check check (frequency in ('semanal', 'quinzenal', 'mensal'));
exception when duplicate_object then null; end $$;

-- a rotina acontece nesta data?
create or replace function public.routine_due(p_frequency text, p_weekdays int[], p_month_day int, p_start date, p_day date)
returns boolean language sql immutable as $$
  select case p_frequency
    when 'mensal' then
      extract(day from p_day)::int = least(coalesce(p_month_day, 1), extract(day from (date_trunc('month', p_day) + interval '1 month - 1 day'))::int)
    when 'quinzenal' then
      extract(dow from p_day)::int = any (p_weekdays)
      and mod(((p_day - extract(dow from p_day)::int) - (p_start - extract(dow from p_start)::int)) / 7, 2) = 0
    else
      extract(dow from p_day)::int = any (p_weekdays)
  end
$$;

-- lembretes da rotina (11:30 e 17:00): usam a frequência de cada rotina
create or replace function public.routine_reminders(p_slot text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
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
        and public.routine_due(r.frequency, r.weekdays, r.month_day, r.start_date, v_today)
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
      'Pendentes: ' || rec.items || '. Marque na aba Rotinas.',
      'rotina|' || rec.user_id || '|' || v_today || '|' || p_slot
    )
    on conflict (dedupe_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
