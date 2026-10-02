-- Up! Fluxo — o cliente não vê nada de uso interno, e os textos não usam travessão (—)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Observações internas nas peças (briefings e anotações automáticas): só a equipe vê
alter table public.card_comments add column if not exists internal boolean not null default false;

update public.card_comments
set internal = true
where internal = false
  and (body like 'Do calendário:%' or body like 'Briefing para o design:%' or body like 'Conteúdo gerado para o post:%' or body like 'Briefing do post:%');

update public.card_comments set author_name = 'Equipe Up!' where author_name = 'Up! Fluxo';

drop policy if exists "ver observações" on public.card_comments;
create policy "ver observações" on public.card_comments for select to authenticated
  using (public.is_staff() or (not internal and public.client_can_access_card(card_id)));

drop policy if exists "escrever observações" on public.card_comments;
create policy "escrever observações" on public.card_comments for insert to authenticated
  with check (public.is_staff() or (not internal and public.client_can_access_card(card_id)));

-- 2) Avisos do sistema separando com " | " em vez de travessão
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
  values (new.assignee_id, new.client_id, v_title || coalesce(' | ' || v_client, ''), 'Veja os detalhes e o prazo na aba Tarefas.');
  return new;
end;
$$;

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
           string_agg(r.title || coalesce(' | ' || c.name, ''), ', ' order by r.title) as items
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

create or replace function public.notify_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_resp uuid;
  v_client text;
  rec record;
begin
  if new.column_id <> 'backlog' or new.requested_by is null then
    return new;
  end if;
  select responsible_id, name into v_resp, v_client from public.clients where id = new.client_id;
  for rec in
    select id from public.profiles where id = v_resp
    union
    select id from public.profiles where role = 'admin' and v_resp is null
  loop
    if rec.id is distinct from new.requested_by then
      insert into public.notifications (user_id, client_id, title, body)
      values (rec.id, new.client_id, 'Nova demanda no Backlog: ' || new.title || coalesce(' | ' || v_client, ''), 'Defina o responsável e recepcione a demanda na linha de produção.');
    end if;
  end loop;
  return new;
end;
$$;

-- 3) Limpa o travessão do que já foi gravado
--    títulos e temas: " — " vira " | "; textos: " — " vira ", " e o que sobrar vira "-"
update public.calendar_entries set theme = regexp_replace(theme, '\s*[—–]\s*', ' | ', 'g') where theme ~ '[—–]';
update public.calendar_entries set notes = regexp_replace(regexp_replace(notes, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g') where notes ~ '[—–]';
update public.calendar_entries
set brief = regexp_replace(regexp_replace(brief::text, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g')::jsonb
where brief::text ~ '[—–]';

update public.cards set title = regexp_replace(title, '\s*[—–]\s*', ' | ', 'g') where title ~ '[—–]';
update public.cards set copy = regexp_replace(regexp_replace(copy, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g') where copy ~ '[—–]';
update public.card_comments set body = regexp_replace(regexp_replace(body, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g') where body ~ '[—–]';
update public.notifications set title = regexp_replace(title, '\s*[—–]\s*', ' | ', 'g') where title ~ '[—–]';

update public.clients set
  positioning = regexp_replace(regexp_replace(positioning, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  target_audience = regexp_replace(regexp_replace(target_audience, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  tone_of_voice = regexp_replace(regexp_replace(tone_of_voice, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  editorial_lines = regexp_replace(regexp_replace(editorial_lines, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  identity = regexp_replace(regexp_replace(identity, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  art_references = regexp_replace(regexp_replace(art_references, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g'),
  notes = regexp_replace(regexp_replace(notes, '\s+[—–]\s+', ', ', 'g'), '[—–]', '-', 'g')
where concat(positioning, target_audience, tone_of_voice, editorial_lines, identity, art_references, notes) ~ '[—–]';
