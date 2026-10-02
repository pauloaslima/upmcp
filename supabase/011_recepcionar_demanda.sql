-- Up! Fluxo — qualquer usuário cria demandas no Backlog; o responsável "recepciona" a demanda
-- e ela entra no Calendário mensal (e no Conteúdo da semana) na data de publicação.
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

alter table public.cards add column if not exists received_at timestamptz;
alter table public.cards add column if not exists received_by uuid references public.profiles(id) on delete set null;

-- 1) O cliente acompanha os pedidos da empresa dele mesmo depois de recepcionados (coluna "Em produção", só leitura)
create or replace function public.client_can_access_card(p_card uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cards c
    where c.id = p_card
      and public.my_client_id() is not null
      and c.client_id = public.my_client_id()
      and (
        c.column_id in ('backlog', 'aprovacao', 'aprovados', 'reprovados')
        or exists (select 1 from public.profiles p where p.id = c.requested_by and p.client_id = public.my_client_id())
      )
  )
$$;

drop policy if exists "cliente acompanha seus pedidos" on public.cards;
create policy "cliente acompanha seus pedidos" on public.cards for select to authenticated
  using (
    client_id = public.my_client_id()
    and exists (select 1 from public.profiles p where p.id = requested_by and p.client_id = public.my_client_id())
  );

-- observações: o cliente conversa nas peças que ele enxerga (inclusive os pedidos em produção)
drop policy if exists "ver observações" on public.card_comments;
create policy "ver observações" on public.card_comments for select to authenticated
  using (public.is_staff() or public.client_can_access_card(card_id));

drop policy if exists "escrever observações" on public.card_comments;
create policy "escrever observações" on public.card_comments for insert to authenticated
  with check (public.is_staff() or public.client_can_access_card(card_id));

-- arquivos: o cliente abre os anexos das peças que ele enxerga
drop policy if exists "ver anexos" on storage.objects;
create policy "ver anexos" on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and (
      public.is_staff()
      or exists (
        select 1 from public.cards c
        where c.id::text = (storage.foldername(name))[1]
          and public.client_can_access_card(c.id)
      )
    )
  );

-- 2) Recepcionar demanda: só o responsável pela peça (ou um administrador)
create or replace function public.receive_demand(p_card uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v public.cards;
  v_entry uuid;
  v_name text;
  v_format text;
begin
  select * into v from public.cards where id = p_card;
  if not found then
    raise exception 'Demanda não encontrada';
  end if;
  if not public.is_staff() then
    raise exception 'Só a equipe recepciona demandas';
  end if;
  if v.assignee_id is null then
    raise exception 'Defina o responsável antes de recepcionar';
  end if;
  if v.assignee_id <> auth.uid() and public.my_role() <> 'admin' then
    raise exception 'Só o responsável pela demanda pode recepcionar';
  end if;
  if v.received_at is not null then
    raise exception 'Esta demanda já foi recepcionada';
  end if;
  if v.publish_date is null then
    raise exception 'Defina a data de publicação antes de recepcionar';
  end if;
  if v.client_id is null then
    raise exception 'A demanda precisa de um cliente';
  end if;

  -- entra no calendário na data de publicação (se ainda não houver tema ligado a esta peça)
  select id into v_entry from public.calendar_entries where card_id = p_card limit 1;
  if v_entry is null then
    v_format := case when v.format in ('Reels', 'Carrossel', 'Estático', 'Story', 'Vídeo') then v.format else '' end;
    insert into public.calendar_entries (client_id, day, format, theme, notes, card_id, brief, brief_status, created_by_agent)
    values (v.client_id, v.publish_date, v_format, v.title, left(coalesce(v.copy, ''), 2000), p_card, '{}'::jsonb, 'rascunho', false)
    returning id into v_entry;
  end if;

  update public.cards set
    received_at = now(),
    received_by = auth.uid(),
    column_id = case when column_id = 'backlog' then 'estruturacao' else column_id end
  where id = p_card;

  select coalesce(nullif(full_name, ''), email) into v_name from public.profiles where id = auth.uid();
  insert into public.card_comments (card_id, body)
  values (p_card, 'Demanda recepcionada por ' || coalesce(v_name, 'equipe') || '. Entrou no calendário em ' || to_char(v.publish_date, 'DD/MM/YYYY') || '.');

  return v_entry;
end;
$$;

grant execute on function public.receive_demand(uuid) to authenticated;

-- 3) Aviso de demanda nova: não avisa quem acabou de criar
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
      values (rec.id, new.client_id, 'Nova demanda no Backlog: ' || new.title || coalesce(' — ' || v_client, ''), 'Defina o responsável e recepcione a demanda na linha de produção.');
    end if;
  end loop;
  return new;
end;
$$;
