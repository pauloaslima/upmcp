-- Up! Fluxo — schema do Supabase
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run

-- 1) Tabela de peças (cards do quadro)
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Nova peça',
  client text not null default '',
  column_id text not null default 'estruturacao',
  objective text not null default '',
  pillar text not null default '',
  format text not null default 'Reels',
  channels text not null default '',
  publish_date date,
  copy text not null default '',
  script text not null default '',
  cta text not null default '',
  visual_ref text not null default '',
  material_link text not null default '',
  sensitive boolean not null default false,
  assignee text not null default '',
  checklist jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- mantém updated_at sempre atualizado sozinho
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- 2) Segurança: só quem está logado (equipe e clientes convidados) lê e escreve.
-- Ninguém de fora, sem login, acessa os dados.
alter table public.cards enable row level security;

drop policy if exists "logados podem ver as peças" on public.cards;
create policy "logados podem ver as peças"
  on public.cards for select
  to authenticated
  using (true);

drop policy if exists "logados podem criar peças" on public.cards;
create policy "logados podem criar peças"
  on public.cards for insert
  to authenticated
  with check (true);

drop policy if exists "logados podem editar peças" on public.cards;
create policy "logados podem editar peças"
  on public.cards for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "logados podem excluir peças" on public.cards;
create policy "logados podem excluir peças"
  on public.cards for delete
  to authenticated
  using (true);

-- 3) Realtime: permite que a tela de todo mundo atualize sozinha quando alguém mexe em um card
alter publication supabase_realtime add table public.cards;

-- 4) Armazenamento de arquivos anexados às peças.
-- Depois de rodar este script, vá em Storage > New bucket e crie um bucket
-- chamado exatamente "anexos" (marque como bucket privado, NÃO público).
-- As políticas abaixo liberam esse bucket só para quem está logado.
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

drop policy if exists "logados podem ver anexos" on storage.objects;
create policy "logados podem ver anexos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'anexos');

drop policy if exists "logados podem subir anexos" on storage.objects;
create policy "logados podem subir anexos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'anexos');

drop policy if exists "logados podem apagar anexos" on storage.objects;
create policy "logados podem apagar anexos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'anexos');
