// Campos do Perfil do cliente — um só lugar para a tela, o agente que preenche o perfil
// e o contexto que os agentes de conteúdo e design recebem.

export const PROFILE_FIELDS = [
  {
    key: "positioning",
    label: "Posicionamento",
    rows: 5,
    placeholder: "Quem é o cliente, o que vende, proposta de valor, diferenciais frente à concorrência, objetivo nas redes…",
    ai: "Quem é o cliente, o que vende, proposta de valor, diferenciais e objetivo de comunicação nas redes."
  },
  {
    key: "target_audience",
    label: "Público-alvo",
    rows: 4,
    placeholder: "Perfil (idade, região, renda), dores, desejos e objeções do público…",
    ai: "Perfil do público (idade, região, renda, estilo de vida), dores, desejos e objeções."
  },
  {
    key: "tone_of_voice",
    label: "Tom de voz",
    rows: 4,
    placeholder: "Como a marca fala: formal/informal, palavras que usa e que evita, emojis, exemplos de frases…",
    ai: "Como a marca fala: nível de formalidade, palavras e expressões que usa e evita, uso de emojis, exemplos de frases."
  },
  {
    key: "editorial_lines",
    label: "Linhas editoriais",
    rows: 5,
    placeholder: "Pilares de conteúdo e o peso de cada um, temas recorrentes, formatos preferidos, frequência…",
    ai: "Pilares/linhas editoriais com o objetivo e o peso de cada um, temas recorrentes, formatos preferidos e frequência de posts."
  },
  {
    key: "identity",
    label: "Identidade visual",
    rows: 5,
    placeholder: "Cores (com código, ex.: #1B2A4A), fontes, logo e suas versões, estilo de fotos, elementos gráficos, o que evitar…",
    ai: "Cores com códigos, fontes, uso do logo, estilo de fotografia, elementos gráficos obrigatórios e o que evitar."
  },
  {
    key: "art_references",
    label: "Referências para as artes",
    rows: 4,
    placeholder: "O que os posts de exemplo mostram: composição, tipo de imagem, tipografia, rodapé padrão, o que repetir nas artes…",
    ai: "O que os posts de exemplo têm em comum e deve ser repetido nas artes: composição, tipo de imagem, tipografia, rodapé/assinatura, textos curtos ou longos, estilo de capa de carrossel e de Reels."
  },
  {
    key: "notes",
    label: "Observações importantes",
    rows: 4,
    placeholder: "Assuntos proibidos, pedidos recorrentes, aprovações sensíveis, datas da empresa, concorrentes…",
    ai: "Restrições e cuidados: assuntos proibidos, pedidos recorrentes, aprovações sensíveis, datas importantes da empresa, concorrentes a não citar."
  }
];

export const MATERIAL_CATEGORIES = [
  { id: "identidade", label: "Identidade de marca" },
  { id: "estrategia", label: "Setup estratégico" },
  { id: "exemplos", label: "Posts de exemplo" },
  { id: "editorial", label: "Linhas editoriais" },
  { id: "outros", label: "Outros" }
];

// tipos que o sistema consegue ler (o agente lê PDF e imagens direto; planilhas, Word e texto viram texto)
export const MATERIAL_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.csv,.txt,.md,.docx";

// Arquivos de marca (manual, logo, paleta): os antigos "arquivos de identidade" + materiais da categoria identidade
export function brandFiles(client) {
  return [...(client?.identity_files || []), ...(client?.materials || []).filter((m) => m.category === "identidade")];
}

// Materiais de uma categoria (ex.: "exemplos" = posts de exemplo para as artes)
export function materialsOf(client, category) {
  return (client?.materials || []).filter((m) => (m.category || "outros") === category);
}
