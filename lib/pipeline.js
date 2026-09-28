// Espelha exatamente o fluxo montado no quadro Trello (TESTE MCP).
export const COLUMNS = [
  { id: "calendario", name: "Calendário do mês", color: "#9AA5C4" },
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

export const COL_INDEX = COLUMNS.reduce((acc, c, i) => {
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

export const KNOWN_CLIENTS = [
  "Carla Zaupa Psi",
  "Romanzza Vix",
  "Ludmila Vale Psi",
  "7Ball Vitória",
  "Elegance",
  "Prime Planejados",
  "Mass Spray",
  "Cuñas Burger",
  "Sandra Ferreira Psi",
  "Suakasa Móveis",
  "Jozeane Cassol Psi",
  "CASACOR Espírito Santo",
  "LB Cleaning Organize",
  "Sala de Oração",
  "Daniele Banco",
  "Waleska Farias",
  "Sara"
];

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
