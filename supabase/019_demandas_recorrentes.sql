-- Up! Fluxo | demandas recorrentes (ex.: "Enviar relatório" todo dia 05)
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)

-- Card modelo: a regra de repetição
--   { "tipo": "mensal", "dia": 5 }            todo mês no dia 5 (meses curtos: último dia)
--   { "tipo": "semanal", "dias": [1, 4] }     toda semana nesses dias (0 = domingo … 6 = sábado)
--   { "tipo": "diaria" }                      todo dia útil (segunda a sexta)
alter table public.cards add column if not exists recurrence jsonb;

-- Ocorrência: card criado a partir do modelo, com a data em que deve ser feito
alter table public.cards add column if not exists recurrence_parent uuid references public.cards(id) on delete set null;
alter table public.cards add column if not exists occurrence_date date;

-- uma ocorrência por data para cada modelo
create unique index if not exists cards_occurrence_unique on public.cards (recurrence_parent, occurrence_date);
create index if not exists cards_occurrence_day on public.cards (client_id, occurrence_date);
