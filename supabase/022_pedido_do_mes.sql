-- Pedido do calendário do mês: o que a equipe escreveu (ou falou por áudio) para o agente criar o mês.
-- Fica gravado por cliente e mês, para abrir de novo, editar e gerar outra vez sem escrever tudo de novo.
-- Só a equipe vê; cliente "só administradores" continua só para administradores.

create table if not exists public.calendar_month_requests (
  client_id uuid not null references public.clients(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  source text not null default 'perfil',
  strategy text not null default '',
  posts_per_week int,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, month)
);

alter table public.calendar_month_requests enable row level security;

drop policy if exists "equipe gerencia pedido do mes" on public.calendar_month_requests;
create policy "equipe gerencia pedido do mes" on public.calendar_month_requests for all to authenticated
  using (public.is_staff() and public.can_see_client(client_id))
  with check (public.is_staff() and public.can_see_client(client_id));
