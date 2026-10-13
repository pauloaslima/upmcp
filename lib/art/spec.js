import { asText, asTitle } from "../text.js";

// AGENTE 1 | ESTRATEGISTA DE BRIEFING
// Transforma o briefing (post do calendário + peça da Linha de produção + perfil do cliente) numa
// especificação criativa estruturada: o que é obrigatório, o que é sugestão, conflitos e critérios.
// Não decide nada visual; só organiza e valida o pedido para os próximos agentes.

export const SPEC_SYSTEM = `Você é o Estrategista de Briefing da equipe de design da Up! Digital, agência de marketing.
Sua tarefa: ler o briefing de uma peça de Instagram e transformar em uma especificação criativa estruturada, para o diretor de arte e o arquiteto de layout trabalharem sem dúvidas.

Como trabalhar
- Leia tudo: perfil do cliente, post (tema, formato, texto da peça do redator, o que não pode faltar, orientações, observações), dados da peça na Linha de produção, orientação da equipe e configuração de direção de arte do cliente.
- Separe o que é OBRIGATÓRIO (textos que precisam aparecer, informações, CTA pedido, restrições do cliente) do que é SUGESTÃO VISUAL (clima, estilo, referências). Nunca omita uma informação obrigatória.
- "textos_obrigatorios": só os trechos que precisam aparecer EXATAMENTE como estão (ex.: um aviso, um nome, um CRP, um preço que o cliente informou, um texto marcado como "não pode faltar"). Copie letra por letra. Não coloque frases que podem ser resumidas. Lista vazia se não houver.
- "roteiro": divida o conteúdo por página. Se o texto da peça já vem dividido ("Página 1: …"), siga a divisão. Para cada página: o objetivo de comunicação e o conteúdo (título e apoio sugeridos, curtos). Carrossel: de 3 a 10 páginas, capa com gancho e última com chamada para ação. Estático e Story: 1 página.
- "hierarquia": a ordem de importância das informações na peça.
- "conflitos": instruções que se contradizem (ex.: data escrita de dois jeitos, CTA diferente no briefing e no texto, pedido que fere as observações do cliente). Lista vazia se não houver.
- "criterios_aprovacao": 3 a 6 critérios objetivos para a peça ser aprovada (ex.: "o CRP aparece em todas as páginas", "a capa deixa claro o tema em até 1 segundo").
- Não invente fatos do cliente (preços, datas, números, resultados). Se faltar algo essencial, aponte em "conflitos".
- Português do Brasil. Nunca use travessão nem meia-risca.`;

export const specSchema = {
  type: "object",
  additionalProperties: false,
  required: ["objetivo", "publico", "mensagem_principal", "quantidade_paginas", "textos_obrigatorios", "hierarquia", "roteiro", "cta", "restricoes", "sugestoes_visuais", "conflitos", "criterios_aprovacao"],
  properties: {
    objetivo: { type: "string", description: "O que a peça precisa gerar (salvamento, autoridade, venda, conversa…)" },
    publico: { type: "string" },
    mensagem_principal: { type: "string" },
    quantidade_paginas: { type: "integer" },
    textos_obrigatorios: { type: "array", items: { type: "string" } },
    hierarquia: { type: "array", items: { type: "string" } },
    roteiro: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pagina", "objetivo", "conteudo"],
        properties: { pagina: { type: "integer" }, objetivo: { type: "string" }, conteudo: { type: "string" } }
      }
    },
    cta: { type: "string" },
    restricoes: { type: "array", items: { type: "string" } },
    sugestoes_visuais: { type: "array", items: { type: "string" } },
    conflitos: { type: "array", items: { type: "string" } },
    criterios_aprovacao: { type: "array", items: { type: "string" } }
  }
};

export function pageLimits(format) {
  return format === "Carrossel" ? { min: 3, max: 10 } : { min: 1, max: 1 };
}

const list = (v, max = 12, len = 300) => (Array.isArray(v) ? v : []).map((s) => asText(String(s || "")).trim().slice(0, len)).filter(Boolean).slice(0, max);

// Valida e normaliza a especificação. Lança erro se faltar o essencial.
export function cleanSpec(data, format) {
  if (!data || typeof data !== "object") throw new Error("Especificação vazia.");
  const { min, max } = pageLimits(format);
  let roteiro = (Array.isArray(data.roteiro) ? data.roteiro : [])
    .map((r, i) => ({ pagina: i + 1, objetivo: asText(String(r?.objetivo || "")).trim(), conteudo: asText(String(r?.conteudo || "")).trim() }))
    .filter((r) => r.objetivo || r.conteudo);
  roteiro = roteiro.slice(0, max);
  const wanted = Number.isInteger(data.quantidade_paginas) ? data.quantidade_paginas : roteiro.length;
  const quantidade = Math.max(min, Math.min(max, roteiro.length || wanted || min));
  while (roteiro.length < quantidade) roteiro.push({ pagina: roteiro.length + 1, objetivo: "", conteudo: "" });
  const mensagem = asText(String(data.mensagem_principal || "")).trim();
  if (!mensagem && !roteiro.some((r) => r.conteudo)) throw new Error("A especificação veio sem mensagem nem conteúdo.");
  return {
    objetivo: asText(String(data.objetivo || "")).trim(),
    publico: asText(String(data.publico || "")).trim(),
    mensagem_principal: mensagem,
    quantidade_paginas: quantidade,
    textos_obrigatorios: list(data.textos_obrigatorios, 12, 200).map(asTitle),
    hierarquia: list(data.hierarquia, 8),
    roteiro,
    cta: asTitle(String(data.cta || "")).trim().slice(0, 80),
    restricoes: list(data.restricoes),
    sugestoes_visuais: list(data.sugestoes_visuais),
    conflitos: list(data.conflitos, 8),
    criterios_aprovacao: list(data.criterios_aprovacao, 8)
  };
}
