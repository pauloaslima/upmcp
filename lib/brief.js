// Briefing para o design — mesmos campos do card do sistema do designer.
// Usado pela tela (editor do tema) e pela API do agente (app/api/agent/briefs).

import { WEEKLY_STEPS, addDays, iso, mondayOf, parse, LEAD_DAYS } from "./deadlines";

export const PRIORITIES = [
  { id: "baixa", label: "Baixa" },
  { id: "media", label: "Média" },
  { id: "alta", label: "Alta" }
];

export const REQUEST_TYPES = [
  "Post estático",
  "Carrossel",
  "Reels / edição de vídeo",
  "Story",
  "Capa de destaque",
  "Arte para anúncio",
  "Outro"
];

export const PLACEMENTS = ["Feed", "Stories", "Reels", "Anúncio", "Impresso", "Site"];

export const BRIEF_STATUS = {
  rascunho: { label: "rascunho", short: "briefing em rascunho" },
  pronto: { label: "pronto para o design", short: "pronto p/ design" },
  enviado: { label: "enviado ao design", short: "enviado ao design" }
};

const TYPE_BY_FORMAT = {
  Reels: "Reels / edição de vídeo",
  Carrossel: "Carrossel",
  Estático: "Post estático",
  Story: "Story",
  Vídeo: "Reels / edição de vídeo"
};
const PLACEMENTS_BY_FORMAT = {
  Reels: ["Reels", "Feed"],
  Carrossel: ["Feed"],
  Estático: ["Feed"],
  Story: ["Stories"],
  Vídeo: ["Feed", "Reels"]
};

// Prazo padrão do design: quinta-feira da semana de produção (dia dos ajustes), 10h.
// Quem cria o conteúdo pode mudar.
export function defaultDueAt(day) {
  const pubMonday = mondayOf(parse(day));
  const ajustes = WEEKLY_STEPS.find((s) => s.kind === "ajustes");
  return iso(addDays(pubMonday, -LEAD_DAYS + ajustes.offset)) + "T10:00";
}

// Briefing com os valores padrão preenchidos a partir do tema
export function briefWithDefaults(entry, day) {
  const b = entry?.brief || {};
  const format = entry?.format || "";
  return {
    priority: b.priority || "media",
    request_type: b.request_type || TYPE_BY_FORMAT[format] || "",
    placements: b.placements?.length ? b.placements : PLACEMENTS_BY_FORMAT[format] || [],
    due_at: b.due_at || defaultDueAt(day || entry?.day),
    must_have: b.must_have || "",
    refs_note: b.refs_note || "",
    important_notes: b.important_notes || "",
    piece_text: b.piece_text || ""
  };
}

// O que falta para o briefing poder ir ao design
export function missingForReady(entry, brief) {
  const miss = [];
  if (!entry.theme?.trim()) miss.push("tema");
  if (!brief.request_type) miss.push("tipo de solicitação");
  if (!brief.placements?.length) miss.push("onde a arte será usada");
  if (!brief.due_at) miss.push("prazo");
  if (!brief.piece_text?.trim()) miss.push("título + texto da peça");
  return miss;
}

function fmtDue(dueAt) {
  if (!dueAt) return "";
  const [d, t] = dueAt.split("T");
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}${t ? " às " + t : ""}`;
}

function joinPlacements(list) {
  if (!list?.length) return "";
  if (list.length === 1) return list[0];
  return list.slice(0, -1).join(", ") + " e " + list[list.length - 1];
}

// Texto da "Descrição" no mesmo formato do card do designer
export function briefDescription(entry, brief, clientIdentity) {
  const sep = "———";
  const lines = [];
  lines.push(`Informe onde a arte será usada: ${joinPlacements(brief.placements)}`);
  lines.push(sep);
  lines.push("▲ NÃO PODE FALTAR NESTA PEÇA:");
  lines.push(brief.must_have?.trim() || "—");
  lines.push(sep);
  lines.push("📎 REFERÊNCIAS VISUAIS (se houver)");
  (entry.refs || []).forEach((r) => lines.push(r.url));
  if (brief.refs_note?.trim()) lines.push(brief.refs_note.trim());
  if (!(entry.refs || []).length && !brief.refs_note?.trim()) lines.push("—");
  lines.push(sep);
  lines.push("⚠ OBSERVAÇÕES IMPORTANTES");
  lines.push(brief.important_notes?.trim() || entry.notes?.trim() || "—");
  lines.push(sep);
  lines.push("🎯 TÍTULO + TEXTO DA PEÇA (Se for carrossel, pode colocar em páginas)");
  lines.push(brief.piece_text?.trim() || "—");
  const identity = entry.use_client_identity === false ? entry.identity_notes : clientIdentity;
  if (identity?.trim()) {
    lines.push(sep);
    lines.push("🎨 ID VISUAL");
    lines.push(identity.trim());
  }
  return lines.join("\n");
}

// Tudo o que o card do designer precisa, num objeto só (usado pelo agente)
export function designerPayload({ entry, brief, client }) {
  const identityText = entry.use_client_identity === false ? entry.identity_notes || "" : client?.identity || "";
  return {
    entry_id: entry.id,
    status: entry.brief_status,
    title: `${client?.name || ""} — ${entry.theme || ""}`.trim(),
    cliente_final: client?.name || "",
    tipo_de_solicitacao: brief.request_type,
    prioridade: PRIORITIES.find((p) => p.id === brief.priority)?.label || "Média",
    prazo: brief.due_at, // AAAA-MM-DDTHH:MM, horário de Brasília
    prazo_texto: fmtDue(brief.due_at),
    labels: [entry.format].filter(Boolean),
    data_publicacao: entry.day,
    horario_publicacao: entry.post_time || "",
    onde_sera_usada: brief.placements,
    nao_pode_faltar: brief.must_have,
    referencias: (entry.refs || []).map((r) => r.url),
    referencias_comentario: brief.refs_note,
    observacoes_importantes: brief.important_notes || entry.notes || "",
    titulo_e_texto: brief.piece_text,
    id_visual: { usar_identidade_do_cliente: entry.use_client_identity !== false, texto: identityText },
    descricao: briefDescription(entry, brief, client?.identity)
  };
}

export { fmtDue };
