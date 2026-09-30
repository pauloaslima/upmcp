-- Up! Fluxo — briefing para o design em cada tema do Conteúdo da semana
-- Rode este arquivo inteiro em: painel do Supabase > SQL Editor > New query > Run
-- (pode rodar mais de uma vez sem problema)
--
-- brief (jsonb) guarda os campos do card do sistema do designer:
--   priority        'baixa' | 'media' | 'alta'
--   request_type    tipo de solicitação (ex.: 'Reels / edição de vídeo')
--   placements      onde a arte será usada (ex.: ['Feed', 'Stories'])
--   due_at          prazo de entrega do design, 'AAAA-MM-DDTHH:MM' (horário de Brasília)
--   must_have       não pode faltar nesta peça (uma linha por item)
--   refs_note       comentário sobre as referências visuais
--   important_notes observações importantes (criativo, frases, etc.)
--   piece_text      título + texto da peça (carrossel: uma página por bloco)
-- As fotos, links de referência e a identidade visual já ficam em photos / refs / use_client_identity.

alter table public.calendar_entries add column if not exists brief jsonb not null default '{}'::jsonb;
alter table public.calendar_entries add column if not exists brief_status text not null default 'rascunho';
alter table public.calendar_entries add column if not exists brief_sent_at timestamptz;
alter table public.calendar_entries add column if not exists designer_card_url text not null default '';

do $$
begin
  alter table public.calendar_entries
    add constraint calendar_entries_brief_status check (brief_status in ('rascunho', 'pronto', 'enviado'));
exception when duplicate_object then null;
end $$;

create index if not exists calendar_entries_brief_status on public.calendar_entries (brief_status, day);
