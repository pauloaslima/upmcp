-- Up! Fluxo — especialista de cada cliente (segmento, idioma, pesquisa, aprendizados),
-- legenda e pendências nos temas, e o registro das execuções do time de agentes.
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- 1) Especialista do cliente
alter table public.clients add column if not exists segment text not null default '';
alter table public.clients add column if not exists language text not null default 'pt-BR';
alter table public.clients add column if not exists region text not null default '';
alter table public.clients add column if not exists website text not null default '';
alter table public.clients add column if not exists social_links text not null default '';
alter table public.clients add column if not exists competitors text not null default '';
-- aprendizados: { "confirmado": [{ "texto", "data" }], "pendencias": [{ "texto", "data" }] }
alter table public.clients add column if not exists learnings jsonb not null default '{"confirmado":[],"pendencias":[]}'::jsonb;
alter table public.clients add column if not exists image_provider text not null default 'nano_banana';

-- 2) Segmento, idioma e região já combinados com a agência (só preenche o que está vazio)
update public.clients c set segment = v.segment
from (values
  ('7Ball Vitória', 'moveis'),
  ('Prime Planejados', 'moveis'),
  ('Suakasa Móveis', 'moveis'),
  ('Romanzza Vix', 'moveis'),
  ('Carla Zaupa Psi', 'psicologia'),
  ('Jozeane Cassol Psi', 'psicologia'),
  ('Ludmila Vale Psi', 'psicologia'),
  ('Sandra Ferreira Psi', 'psicologia'),
  ('Cuñas Burger', 'alimentacao'),
  ('CASACOR Espírito Santo', 'evento_arquitetura'),
  ('Sala de Oração', 'religioso'),
  ('LB Cleaning Organize', 'servicos'),
  ('Daniele Banco', 'financeiro'),
  ('Elegance', 'construcao'),
  ('Mass Spray', 'isolamento_eua'),
  ('Waleska Farias', 'consultoria')
) as v(name, segment)
where c.name = v.name and c.segment = '';

update public.clients set language = 'en-US', region = 'Massachusetts, EUA'
where name = 'Mass Spray' and region = '';

update public.clients
set learnings = '{"confirmado":[
  {"texto":"Posts em inglês americano (textos, legendas, hashtags e texto nas artes). Briefings e conversa com a equipe continuam em português.","data":"2026-10-01"},
  {"texto":"Atende em Massachusetts (EUA). Clima da Nova Inglaterra: inverno longo e rigoroso, verão úmido.","data":"2026-10-01"}
],"pendencias":[]}'::jsonb
where name = 'Mass Spray' and learnings = '{"confirmado":[],"pendencias":[]}'::jsonb;

update public.clients
set learnings = '{"confirmado":[],"pendencias":[
  {"texto":"O que é o Loft (lançamento 19/10): produto ou espaço físico? Horário da revelação.","data":"2026-10-01"},
  {"texto":"Arquivo do logo, cores e fontes da marca.","data":"2026-10-01"},
  {"texto":"Modalidade preferida: sinuca, bilhar ou snooker.","data":"2026-10-01"},
  {"texto":"Cidade (Vitória/ES?) para hashtags locais. Há quanto tempo a 7Ball existe.","data":"2026-10-01"},
  {"texto":"Fotos reais de instalações em clientes, com autorização; pode citar cliente/cidade?","data":"2026-10-01"},
  {"texto":"Família para filmar (com autorização das crianças) para o Reels de 12/10.","data":"2026-10-01"},
  {"texto":"Aderem ao Outubro Rosa? Aprovam o Story de contagem regressiva de 18/10?","data":"2026-10-01"},
  {"texto":"A foto DSC00283.jpg do perfil é instalação real de cliente?","data":"2026-10-01"}
]}'::jsonb
where name = '7Ball Vitória' and learnings = '{"confirmado":[],"pendencias":[]}'::jsonb;

-- 3) Temas: legenda do post e perguntas para o cliente
alter table public.calendar_entries add column if not exists caption text not null default '';
alter table public.calendar_entries add column if not exists pendencias jsonb not null default '[]'::jsonb;

-- 4) Execuções do time de agentes (cada etapa grava o resultado; dá para retomar)
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  mode text not null check (mode in ('week', 'month')),
  period_start date not null,
  guidance text not null default '',
  options jsonb not null default '{}'::jsonb,
  status text not null default 'rodando'
    check (status in ('rodando', 'aguardando_aprovacao', 'gravado', 'erro', 'cancelado')),
  step text not null default '',
  results jsonb not null default '{}'::jsonb,
  error text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_client on public.agent_runs (client_id, created_at desc);

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

alter table public.agent_runs enable row level security;

-- o servidor grava (chave secreta); a equipe só consulta
drop policy if exists "equipe vê execuções" on public.agent_runs;
create policy "equipe vê execuções" on public.agent_runs for select to authenticated
  using (public.is_staff());
