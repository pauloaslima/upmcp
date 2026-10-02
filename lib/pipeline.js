// Espelha exatamente o fluxo montado no quadro Trello (TESTE MCP).
export const COLUMNS = [
  { id: "backlog", name: "Backlog", color: "#7A5CC8" }, // demandas pedidas pelo cliente (ou anotadas pela equipe)
  { id: "estruturacao", name: "Em estruturação", color: "#D9A441" },
  { id: "checagem", name: "Checagem de conteúdo (Joana)", color: "#C1502E" },
  { id: "design", name: "Com o design", color: "#6C63B5" },
  { id: "revisao_int", name: "Revisão interna", color: "#3A7D7B" },
  { id: "aprovacao", name: "Para aprovação do cliente", color: "#D9A441" },
  { id: "aprovados", name: "Aprovados", color: "#3A7D7B" },
  { id: "ajustes", name: "Em revisão e ajustes", color: "#C1502E" },
  { id: "programados", name: "Programados", color: "#3B6FB0" },
  { id: "concluidos", name: "Concluídos", color: "#2E8B57" },
  { id: "standby", name: "Em stand by", color: "#9A968B" },
  { id: "reprovados", name: "Reprovados", color: "#8A2D22" }
];

// O que o cliente enxerga da linha de produção (o banco também só libera essas colunas para ele)
export const CLIENT_COLUMNS = [
  { id: "backlog", name: "Backlog (suas solicitações)", color: "#7A5CC8" },
  { id: "producao", name: "Em produção", color: "#3B6FB0" }, // pedidos do cliente já recepcionados (só leitura)
  { id: "aprovacao", name: "Em aprovação", color: "#D9A441" },
  { id: "aprovados", name: "Aprovados", color: "#3A7D7B" },
  { id: "reprovados", name: "Reprovados", color: "#8A2D22" }
];

export const COL_INDEX =COLUMNS.reduce((acc, c, i) => {
  acc[c.id] = i;
  return acc;
}, {});

export const CHECKLIST_TEMPLATE = [
  "Estruturação: tema, copy, roteiro, CTA e referência preenchidos",
  "Checagem de conteúdo (Joana): aprovado ou devolvido com comentário",
  "Briefing enviado ao design (copy final, referências, guia de marca)",
  "Arte entregue pelo design",
  "Revisão interna: arte e copy conferidas contra o briefing e a identidade visual",
  "Checagem visual (Joana): identidade e erro grosseiro",
  "Enviado ao cliente para aprovação (cobrança registrada se passar de 48h)",
  "Agendado no mLabs (data e horário confirmados)",
  "Publicado (link da publicação registrado no card)"
];

export const FORMATS = ["Reels", "Carrossel", "Estático", "Story", "Vídeo", "Outro"];

// Formatos do calendário de temas, com as mesmas cores da planilha de calendário
export const CALENDAR_FORMATS = ["Reels", "Carrossel", "Estático", "Story", "Vídeo"];

const FORMAT_COLORS = {
  Reels: { background: "#F43FD2", color: "#fff" },
  Carrossel: { background: "#B7DDA8", color: "#1E3B14" },
  "Estático": { background: "#FFD966", color: "#3B2C00" },
  Story: { background: "#4FB3F0", color: "#0B2233" },
  "Vídeo": { background: "#7A5CC8", color: "#fff" }
};

export function formatStyle(format) {
  return FORMAT_COLORS[format] || { background: "var(--border)", color: "var(--text)" };
}

export function newChecklist() {
  return CHECKLIST_TEMPLATE.map((text) => ({ text, done: false }));
}

export function defaultCard(columnId) {
  return {
    title: "Nova peça",
    client: "",
    column_id: columnId || "estruturacao",
    objective: "",
    pillar: "",
    format: "Reels",
    channels: "",
    publish_date: null,
    copy: "",
    script: "",
    cta: "",
    visual_ref: "",
    material_link: "",
    sensitive: false,
    assignee: "",
    checklist: newChecklist(),
    attachments: []
  };
}
