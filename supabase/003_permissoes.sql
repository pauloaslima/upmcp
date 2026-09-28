-- Up! Fluxo — usuários, papéis e permissões
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)
--
-- Papéis:
--   admin       → faz tudo, inclusive gerenciar usuários e permissões
--   funcionario → vê e edita todos os clientes, calendários e quadros
--   cliente     → vê só o próprio calendário e as peças em aprovação/aprovadas/reprovadas;
--                 aprova, reprova e deixa observações
-- Quem ainda não tem papel (convidado pelo painel do Supabase, por exemplo) não vê nada
-- até o administrador liberar.

-- 1) Perfis
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  role text check (role in ('admin', 'funcionario', 'cliente')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

-- cria o perfil sozinho quando alguém é convidado
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- perfis para quem já existe
insert into public.profiles (id, email)
select id, coalesce(email, '') from auth.users
on conflict (id) do nothing;

-- administrador master
update public.profiles set role = 'admin' where lower(email) = 'paulo.aslima@gmail.com';

-- 2) Funções de apoio para as regras de segurança
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.my_client_id()
returns uuid language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid() and role = 'cliente'
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'funcionario') from public.profiles where id = auth.uid()), false)
$$;

-- colunas do quadro que o cliente enxerga
create or replace function public.client_can_see_card(p_client uuid, p_column text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is not null
     and p_client = public.my_client_id()
     and p_column in ('aprovacao', 'aprovados', 'reprovados')
$$;

alter table public.profiles enable row level security;

drop policy if exists "ver perfis" on public.profiles;
create policy "ver perfis" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "admin gerencia perfis" on public.profiles;
create policy "admin gerencia perfis" on public.profiles for all to authenticated
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- 3) Peças passam a apontar para o cliente pelo id
alter table public.cards add column if not exists client_id uuid references public.clients(id) on delete set null;

update public.cards c set client_id = cl.id
from public.clients cl
where c.client_id is null and c.client = cl.name;

create index if not exists cards_client on public.cards (client_id);

drop policy if exists "logados podem ver as peças" on public.cards;
drop policy if exists "logados podem criar peças" on public.cards;
drop policy if exists "logados podem editar peças" on public.cards;
drop policy if exists "logados podem excluir peças" on public.cards;

drop policy if exists "equipe gerencia peças" on public.cards;
create policy "equipe gerencia peças" on public.cards for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "cliente vê suas peças em aprovação" on public.cards;
create policy "cliente vê suas peças em aprovação" on public.cards for select to authenticated
  using (public.client_can_see_card(client_id, column_id));

-- 4) Observações nas peças (equipe e cliente)
create table if not exists public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text not null default '',
  author_role text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_comments_card on public.card_comments (card_id, created_at);

-- preenche autor sozinho (ninguém consegue assinar como outra pessoa)
create or replace function public.set_comment_author()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  new.author_id := auth.uid();
  new.author_name := coalesce(nullif(p.full_name, ''), p.email, '');
  new.author_role := coalesce(p.role, '');
  return new;
end;
$$;

drop trigger if exists card_comments_author on public.card_comments;
create trigger card_comments_author
  before insert on public.card_comments
  for each row execute function public.set_comment_author();

alter table public.card_comments enable row level security;

drop policy if exists "ver observações" on public.card_comments;
create policy "ver observações" on public.card_comments for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.cards c where c.id = card_id and public.client_can_see_card(c.client_id, c.column_id))
  );

drop policy if exists "escrever observações" on public.card_comments;
create policy "escrever observações" on public.card_comments for insert to authenticated
  with check (
    public.is_staff()
    or exists (select 1 from public.cards c where c.id = card_id and public.client_can_see_card(c.client_id, c.column_id))
  );

drop policy if exists "apagar observações" on public.card_comments;
create policy "apagar observações" on public.card_comments for delete to authenticated
  using (author_id = auth.uid() or public.my_role() = 'admin');

-- 5) Aprovação/reprovação pelo cliente: só mexe na coluna (e registra a observação)
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
  if not (public.is_staff() or public.client_can_see_card(v.client_id, v.column_id)) then
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

grant execute on function public.client_review(uuid, text, text) to authenticated;

-- 6) Clientes e calendário
drop policy if exists "logados gerenciam clientes" on public.clients;

drop policy if exists "ver clientes" on public.clients;
create policy "ver clientes" on public.clients for select to authenticated
  using (public.is_staff() or id = public.my_client_id());

drop policy if exists "equipe gerencia clientes" on public.clients;
create policy "equipe gerencia clientes" on public.clients for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

alter table public.calendar_entries add column if not exists card_id uuid references public.cards(id) on delete set null;

drop policy if exists "logados gerenciam calendário" on public.calendar_entries;

drop policy if exists "equipe gerencia calendário" on public.calendar_entries;
create policy "equipe gerencia calendário" on public.calendar_entries for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "cliente vê seu calendário" on public.calendar_entries;
create policy "cliente vê seu calendário" on public.calendar_entries for select to authenticated
  using (client_id = public.my_client_id());

-- 7) Arquivos: equipe sobe e apaga; cliente só abre os arquivos das peças que ele pode ver
drop policy if exists "logados podem ver anexos" on storage.objects;
drop policy if exists "logados podem subir anexos" on storage.objects;
drop policy if exists "logados podem apagar anexos" on storage.objects;

drop policy if exists "ver anexos" on storage.objects;
create policy "ver anexos" on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and (
      public.is_staff()
      or exists (
        select 1 from public.cards c
        where c.id::text = (storage.foldername(name))[1]
          and public.client_can_see_card(c.client_id, c.column_id)
      )
    )
  );

drop policy if exists "equipe sobe anexos" on storage.objects;
create policy "equipe sobe anexos" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.is_staff());

drop policy if exists "equipe apaga anexos" on storage.objects;
create policy "equipe apaga anexos" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and public.is_staff());

-- 8) Tempo real
do $$
begin
  begin
    alter publication supabase_realtime add table public.card_comments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;
