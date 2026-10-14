-- Up! Fluxo | cliente interno "UP DIGITAL" (a própria agência), visível só para administradores
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Cliente "só administradores": funcionários e clientes não enxergam nada dele
alter table public.clients add column if not exists admin_only boolean not null default false;

-- o usuário logado pode ver este cliente? (cliente comum: sim; só administradores: só admin)
create or replace function public.can_see_client(p_client uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_client is null
      or not coalesce((select admin_only from public.clients where id = p_client), false)
      or public.my_role() = 'admin'
$$;

-- 2) Regras de acesso da equipe passam a respeitar o "só administradores"
drop policy if exists "ver clientes" on public.clients;
create policy "ver clientes" on public.clients for select to authenticated
  using ((public.is_staff() and (not admin_only or public.my_role() = 'admin')) or id = public.my_client_id());

drop policy if exists "equipe gerencia clientes" on public.clients;
create policy "equipe gerencia clientes" on public.clients for all to authenticated
  using (public.is_staff() and (not admin_only or public.my_role() = 'admin'))
  with check (public.is_staff() and (not admin_only or public.my_role() = 'admin'));

drop policy if exists "equipe gerencia peças" on public.cards;
create policy "equipe gerencia peças" on public.cards for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));

drop policy if exists "equipe gerencia calendário" on public.calendar_entries;
create policy "equipe gerencia calendário" on public.calendar_entries for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));

drop policy if exists "ver observações" on public.card_comments;
create policy "ver observações" on public.card_comments for select to authenticated
  using (
    (public.is_staff() and exists (select 1 from public.cards c where c.id = card_id and public.can_see_client(c.client_id)))
    or public.client_can_access_card(card_id)
  );

drop policy if exists "escrever observações" on public.card_comments;
create policy "escrever observações" on public.card_comments for insert to authenticated
  with check (
    (public.is_staff() and exists (select 1 from public.cards c where c.id = card_id and public.can_see_client(c.client_id)))
    or public.client_can_access_card(card_id)
  );

drop policy if exists "equipe gerencia checklist" on public.client_tasks;
create policy "equipe gerencia checklist" on public.client_tasks for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));

drop policy if exists "equipe ve rodadas de arte" on public.art_runs;
create policy "equipe ve rodadas de arte" on public.art_runs for select to authenticated
  using (public.is_staff() and public.can_see_client(client_id));

-- arquivos: pasta da peça (<id da peça>/…) e materiais do cliente (clients/<id do cliente>/…)
drop policy if exists "ver anexos" on storage.objects;
create policy "ver anexos" on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and (
      (
        public.is_staff()
        and not exists (
          select 1 from public.cards c
          where c.id::text = (storage.foldername(name))[1] and not public.can_see_client(c.client_id)
        )
        and not exists (
          select 1 from public.clients cl
          where (storage.foldername(name))[1] = 'clients' and cl.id::text = (storage.foldername(name))[2] and not public.can_see_client(cl.id)
        )
      )
      or exists (
        select 1 from public.cards c
        where c.id::text = (storage.foldername(name))[1]
          and public.client_can_access_card(c.id)
      )
    )
  );

-- 3) O cliente interno: a própria agência, com o administrador master como responsável
insert into public.clients (name, admin_only, positioning)
values ('UP DIGITAL', true, '- Cliente interno: gestão da própria agência Up! Digital (rotinas, entregas aos clientes e compras do escritório)')
on conflict (name) do update set admin_only = true;

update public.clients
set responsible_id = (select id from public.profiles where lower(email) = 'paulo.aslima@gmail.com' limit 1)
where name = 'UP DIGITAL' and responsible_id is null;

-- 4) Primeiras demandas internas no Backlog (só na primeira vez)
insert into public.cards (title, client, client_id, column_id, format)
select t.title, 'UP DIGITAL', cl.id, 'backlog', ''
from public.clients cl
cross join (values
  ('Enviar calendários'),
  ('Enviar relatórios'),
  ('Overview semanal'),
  ('Atualização de estratégias'),
  ('Planejamento de stories'),
  ('Checar posts do dia'),
  ('Comprar coisas para o frigobar'),
  ('Comprar itens faltantes para o escritório')
) as t(title)
where cl.name = 'UP DIGITAL'
  and not exists (select 1 from public.cards c where c.client_id = cl.id);
