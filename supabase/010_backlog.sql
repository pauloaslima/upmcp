-- Up! Fluxo — coluna BACKLOG na linha de produção: o cliente pede demandas novas
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) O cliente passa a enxergar também a coluna "backlog" (só das peças da empresa dele)
create or replace function public.client_can_see_card(p_client uuid, p_column text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is not null
     and p_client = public.my_client_id()
     and p_column in ('backlog', 'aprovacao', 'aprovados', 'reprovados')
$$;

-- quem pediu a demanda (para mostrar "solicitado por" e avisar a equipe)
alter table public.cards add column if not exists requested_by uuid references public.profiles(id) on delete set null;

-- 2) Cliente cria uma solicitação: sempre no backlog e sempre para a própria empresa
create or replace function public.client_create_request(
  p_title text,
  p_details text default '',
  p_format text default '',
  p_desired_date date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_client uuid := public.my_client_id();
  v_name text;
  v_id uuid;
begin
  if v_client is null then
    raise exception 'Só clientes podem criar solicitações';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Escreva o que você precisa';
  end if;
  select name into v_name from public.clients where id = v_client;
  insert into public.cards (title, client, client_id, column_id, format, copy, publish_date, requested_by, checklist)
  values (
    left(trim(p_title), 200),
    coalesce(v_name, ''),
    v_client,
    'backlog',
    coalesce(nullif(trim(p_format), ''), 'Outro'),
    left(coalesce(p_details, ''), 5000),
    p_desired_date,
    auth.uid(),
    '[]'::jsonb
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- 3) Cliente edita a própria solicitação enquanto ela ainda está no backlog
create or replace function public.client_update_request(
  p_card uuid,
  p_title text,
  p_details text,
  p_format text,
  p_desired_date date,
  p_attachments jsonb
)
returns void language plpgsql security definer set search_path = public as $$
declare v public.cards;
begin
  select * into v from public.cards where id = p_card;
  if not found or v.client_id is distinct from public.my_client_id() or v.column_id <> 'backlog' then
    raise exception 'Esta solicitação não pode mais ser alterada';
  end if;
  update public.cards set
    title = left(coalesce(nullif(trim(p_title), ''), v.title), 200),
    copy = left(coalesce(p_details, ''), 5000),
    format = coalesce(nullif(trim(p_format), ''), v.format),
    publish_date = p_desired_date,
    attachments = coalesce(p_attachments, '[]'::jsonb)
  where id = p_card;
end;
$$;

-- 4) Cliente apaga a própria solicitação enquanto ela está no backlog
create or replace function public.client_delete_request(p_card uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.cards
  where id = p_card and client_id = public.my_client_id() and column_id = 'backlog';
  if not found then
    raise exception 'Esta solicitação não pode mais ser apagada';
  end if;
end;
$$;

grant execute on function public.client_create_request(text, text, text, date) to authenticated;
grant execute on function public.client_update_request(uuid, text, text, text, date, jsonb) to authenticated;
grant execute on function public.client_delete_request(uuid) to authenticated;

-- 5) Cliente anexa arquivos (referências) nas solicitações dele que estão no backlog
drop policy if exists "cliente sobe anexos da solicitação" on storage.objects;
create policy "cliente sobe anexos da solicitação" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and exists (
      select 1 from public.cards c
      where c.id::text = (storage.foldername(name))[1]
        and c.column_id = 'backlog'
        and c.client_id = public.my_client_id()
    )
  );

-- 6) Aviso no sino para a equipe quando chega solicitação nova
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
    insert into public.notifications (user_id, client_id, title, body)
    values (rec.id, new.client_id, 'Nova solicitação: ' || new.title || coalesce(' — ' || v_client, ''), 'O cliente pediu uma demanda nova. Veja na coluna Backlog da linha de produção.');
  end loop;
  return new;
end;
$$;

drop trigger if exists cards_notify_new_request on public.cards;
create trigger cards_notify_new_request
  after insert on public.cards
  for each row execute function public.notify_new_request();

-- 7) Aprovar/reprovar continua valendo só para peças em aprovação (não para solicitações do backlog)
create or replace function public.client_review(p_card uuid, p_decision text, p_comment text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v public.cards;
begin
  if p_decision not in ('aprovados', 'reprovados') then
    raise exception 'Decisão inválida';
  end if;
  select * into v from public.cards where id = p_card;
  if not found then
    raise exception 'Peça não encontrada';
  end if;
  if not (
    public.is_staff()
    or (public.client_can_see_card(v.client_id, v.column_id) and v.column_id in ('aprovacao', 'aprovados', 'reprovados'))
  ) then
    raise exception 'Sem permissão';
  end if;
  if p_decision = 'reprovados' and coalesce(trim(p_comment), '') = '' then
    raise exception 'Explique o motivo da reprovação';
  end if;
  if coalesce(trim(p_comment), '') <> '' then
    insert into public.card_comments (card_id, body) values (p_card, trim(p_comment));
  end if;
  update public.cards set column_id = p_decision where id = p_card;
end;
$$;
