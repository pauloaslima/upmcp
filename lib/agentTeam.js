import Anthropic from "@anthropic-ai/sdk";
import { CALENDAR_FORMATS } from "./pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "./brief";

// Time de agentes da Up! Digital, rodando no servidor. Cada papel é uma chamada ao Claude:
//   pesquisa (internet) → estrategista → redator + diretor de arte (juntos) → designer → revisor
// O especialista do cliente é o contexto que todos recebem: perfil, segmento e suas regras,
// idioma dos posts, aprendizados (o que já foi confirmado e o que ainda está em aberto).
// Precisa de ANTHROPIC_API_KEY no Vercel.

const MODEL = "claude-opus-5-5";

export class AgentTeamError extends Error {}

const TEAM = `Você faz parte do time de conteúdo da Up! Digital, agência de social media em Vitória (ES).
O time: pesquisa, estrategista, redator, diretor de arte, designer e revisor. Você recebe o trabalho das etapas anteriores e devolve só a sua parte, no formato pedido.

Regras do time (valem sempre):
- O "cliente" traz o perfil, o segmento com suas regras (regras_do_segmento e regras_gerais) e os aprendizados. Siga todas as regras.
- aprendizados.confirmado são fatos que você pode usar. aprendizados.pendencias são perguntas ainda sem resposta: não suponha a resposta.
- Nunca invente fatos do cliente (preços, promoções, prazos, números, nomes, depoimentos, resultados, história da marca). Quando precisar, escreva [confirmar com o cliente].
- A pesquisa na internet é contexto e inspiração, não fato sobre o cliente. Não copie texto de concorrentes.
- "revisao" traz o que a revisão antes de executar encontrou (perfil incompleto, prazos): não invente o que falta.
- Idioma: texto da peça, legenda e hashtags no idioma de cliente.idioma_dos_posts. Todo o resto (tema, briefing, observações, layout, pendências) em português do Brasil, para a equipe.
- "ref" identifica cada post entre as etapas: mantenha o mesmo ref que recebeu.`;

const PROMPTS = {
  pesquisa: `${TEAM}

Seu papel: PESQUISA. Use a busca e a leitura de páginas da internet para preparar notas curtas que ajudem o estrategista a planejar o período informado.
Pesquise, nesta ordem e sem exagerar no número de buscas:
1. Tendências e notícias recentes do segmento do cliente (e da região, se houver) que rendam conteúdo neste período.
2. O que concorrentes e marcas de referência do segmento estão postando (formatos, assuntos, ganchos que funcionam). Use cliente.concorrentes_e_referencias quando houver.
3. Site e redes do cliente (cliente.site, cliente.redes_sociais): produtos, serviços, linguagem. Só registre o que estiver escrito lá.
Escreva em português, em tópicos curtos, com estas seções: "Tendências e notícias", "Concorrentes e referências", "O que o site e as redes do cliente mostram", "Ideias aproveitáveis neste período", "Cuidados". Cite a fonte (site) de cada informação. Se algo não foi encontrado, diga isso em uma linha. No máximo ~600 palavras.`,

  estrategista: `${TEAM}

Seu papel: ESTRATEGISTA. Monte a pauta da semana de publicação.
- "temas_do_calendario" são os temas já planejados (cada um com id). Eles são a base: refine a redação e o objetivo, mas não troque o assunto nem o dia. Use ref = id do tema.
- Temas com brief_status "pronto" ou "enviado" ficam de fora da pauta (não mexa neles).
- Só crie posts novos se "quantidade_de_posts" pedir mais do que os temas existentes, ou se não houver nenhum. Novos vão em dias sem tema, ref = "novo-1", "novo-2"…, id = "".
- Equilibre pilares (educativo, autoridade/prova, conexão/bastidores, oferta) e formatos (Reels alcance; Carrossel salvamento; Estático/Story oferta direta). Use datas especiais só quando fizerem sentido para o negócio. Não repita assuntos de temas_recentes.
- theme no padrão "Objetivo — Pilar — Ideia". por_que: 1 linha para a equipe.
- leitura: 2 a 3 frases sobre o fio que conecta a semana.`,

  estrategista_mes: `${TEAM}

Seu papel: ESTRATEGISTA. Monte o CALENDÁRIO DE TEMAS do mês (só os temas; o desenvolvimento é feito semana a semana).
- Siga a estratégia informada. Fonte "historico": deduza dos meses anteriores (frequência, dias, horários, formatos, pilares); mantenha o que funciona e traga assuntos novos. Fonte "audio": texto transcrito, pode ter erros.
- Quantidade: posts_por_semana quando informado; senão a frequência do histórico; sem histórico, 3 por semana.
- "temas_ja_no_calendario" já existem: não crie outro post no mesmo dia nem repita esses assuntos.
- Encaixe datas e campanhas relevantes no dia certo (ou na véspera). Use a pesquisa como inspiração.
- theme no padrão "Objetivo — Pilar — Ideia"; notes: uma frase explicando por que esse post nessa data. ref = "mes-1", "mes-2"…
- leitura: 3 a 4 frases explicando a estratégia do mês.`,

  redator: `${TEAM}

Seu papel: REDATOR (copywriter). Para cada post da pauta, escreva o texto da peça e a legenda.
- Tom de voz do cliente acima do seu estilo. Gancho forte na primeira linha ou nos 3 primeiros segundos.
- Estático: título de até ~8 palavras + apoio de até ~20. Carrossel: 5 a 8 páginas ("Página 1: …"), uma ideia por página, capa com promessa clara, última com CTA. Story: telas curtas ("Tela 1: …"). Reels/Vídeo: roteiro por cena ("Cena 1 (0–3s) — imagem / texto na tela"), 15–30s, texto na tela com até 6 palavras por cena.
- Se o tema já tem texto (texto_atual), mantenha o que está bom e melhore o resto.
- Legenda: 3 a 8 linhas, quebras de linha, CTA no fim, 3 a 5 hashtags relevantes (hashtag local só se a cidade estiver confirmada).
- pendencias: o que precisa ser confirmado com o cliente para este post (lista vazia se nada).`,

  diretor_de_arte: `${TEAM}

Seu papel: DIRETOR DE ARTE. Para cada post da pauta, faça o briefing para o design, com os mesmos campos do card do designer.
- request_type, priority (alta só para data especial ou oferta com prazo) e placements entre as opções.
- must_have: um item por linha (logo, selo, contato, legenda no vídeo, elementos obrigatórios). Foto que só o cliente tem: "Foto do cliente: [confirmar com o cliente]".
- important_notes: direção de arte (clima, tipo de imagem, luz, o que evitar) e um plano B quando depender de material do cliente.
- refs_note: que referências o designer deve buscar (estilo, palavras-chave), sem inventar links.
- A identidade visual do cliente manda: cite cores e fontes do perfil; se não houver, escreva "seguir ID visual do cliente" e não invente códigos de cor.`,

  designer: `${TEAM}

Seu papel: DESIGNER. Para cada post, a partir do briefing e do texto do redator, faça a proposta de layout e os pedidos de imagem.
- layout: tópicos curtos (até ~10 linhas): tamanho (Feed 1080×1350; Story/Reels 1080×1920 com área segura de 250px em cima e 340px embaixo), composição, hierarquia, o que vai em cada página/tela/cena (sem reescrever o texto), cores e fontes da ID visual (nunca inventar códigos), tratamento da imagem.
- image_prompts: só para Estático, Carrossel e Story — um item por página/tela, com "pagina" ("Capa", "Página 2", "Tela 1"…) e "prompt" em INGLÊS descrevendo a imagem de fundo para um gerador de imagens: cena, enquadramento, luz, paleta, estilo fotográfico, espaço livre onde o texto vai entrar. A imagem NÃO pode ter texto, letras, números nem logo (o sistema escreve o texto depois). Se a peça depende de foto real do cliente ou produto, o prompt deve pedir só um fundo/ambiente neutro e o alerta deve dizer isso. Reels e Vídeo: image_prompts vazio (só roteiro).
- alertas: conflitos entre texto e briefing (não resolva sozinho), texto que não cabe, falta de foto, conflito com a ID visual. Lista vazia se nada.`,

  revisor: `${TEAM}

Seu papel: REVISOR e atendimento — o último filtro antes do cliente. Confira cada post:
1. Fatos não confirmados (preço, número, prazo, depoimento, história da marca, cidade) → [confirmar com o cliente].
2. Regras do segmento e gerais, uma a uma. Aprendizados confirmados respeitados; nada depende de pendência sem estar marcado.
3. Tom de voz, ortografia e gramática (no idioma dos posts).
4. Coerência entre texto, briefing e layout (mesma data escrita do mesmo jeito, mesmo CTA, formato igual, texto cabe). Decida os conflitos apontados pelo designer.
5. Repetição com temas recentes ou dentro do período; temas que já existiam mantiveram assunto e dia.
6. Sensibilidade e risco para a marca.
Devolva a VERSÃO FINAL de cada post já corrigida (copie o que estava certo; corrija o que estava errado). Em "problemas", liste em uma linha cada correção feita (vazio se nada). perguntas_para_o_cliente: lista consolidada, sem repetição, pronta para o atendimento mandar numa mensagem só. veredito: "APROVADO" se não precisou corrigir nada relevante, senão "AJUSTES". resumo: 2 a 3 frases para a equipe.`,

  revisor_mes: `${TEAM}

Seu papel: REVISOR do calendário do mês. Confira cada tema: regras do segmento e gerais, aprendizados, datas especiais no dia certo, equilíbrio de formatos e pilares, repetição de assuntos (recentes e entre si), nada que dependa de fato não confirmado. Devolva a VERSÃO FINAL dos temas já corrigida (pode remover um tema problemático, nunca colocar dois no mesmo dia que já tinha tema). problemas: correções feitas em uma linha cada. perguntas_para_o_cliente: lista consolidada. resumo: 2 a 3 frases para a equipe.`
};

// ---------- formatos de resposta ----------

const str = { type: "string" };
const strList = { type: "array", items: str };
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const briefFields = {
  request_type: { type: "string", enum: REQUEST_TYPES },
  priority: { type: "string", enum: PRIORITIES.map((p) => p.id) },
  placements: { type: "array", items: { type: "string", enum: PLACEMENTS } },
  must_have: str,
  important_notes: str,
  refs_note: str
};
const format = { type: "string", enum: CALENDAR_FORMATS };

const SCHEMAS = {
  estrategista: obj({
    leitura: str,
    posts: {
      type: "array",
      items: obj({ ref: str, id: str, day: str, post_time: str, format, theme: str, objetivo: str, por_que: str, angulo: str, cta: str })
    }
  }),
  estrategista_mes: obj({
    leitura: str,
    temas: { type: "array", items: obj({ ref: str, day: str, post_time: str, format, theme: str, notes: str }) }
  }),
  redator: obj({ textos: { type: "array", items: obj({ ref: str, piece_text: str, caption: str, pendencias: strList }) } }),
  diretor_de_arte: obj({ briefings: { type: "array", items: obj({ ref: str, ...briefFields }) } }),
  designer: obj({
    layouts: {
      type: "array",
      items: obj({ ref: str, layout: str, image_prompts: { type: "array", items: obj({ pagina: str, prompt: str }) }, alertas: strList })
    }
  }),
  revisor: obj({
    veredito: { type: "string", enum: ["APROVADO", "AJUSTES"] },
    resumo: str,
    posts: {
      type: "array",
      items: obj({ ref: str, theme: str, piece_text: str, caption: str, ...briefFields, layout: str, problemas: strList, pendencias: strList })
    },
    perguntas_para_o_cliente: strList
  }),
  revisor_mes: obj({
    resumo: str,
    temas: { type: "array", items: obj({ ref: str, day: str, post_time: str, format, theme: str, notes: str }) },
    problemas: strList,
    perguntas_para_o_cliente: strList
  })
};

// ---------- chamada ao Claude ----------

async function ask(role, payload, { effort = "medium", tools } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AgentTeamError("Falta configurar ANTHROPIC_API_KEY no Vercel.");
  const anthropic = new Anthropic();
  const schema = SCHEMAS[role];
  const messages = [{ role: "user", content: JSON.stringify(payload, null, 2) }];
  let response;
  try {
    // a busca na internet pode pausar a vez (pause_turn); retomamos algumas vezes
    for (let i = 0; i < 4; i++) {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // se o modelo recusar por engano, outro modelo assume no mesmo pedido
        thinking: { type: "adaptive" },
        output_config: schema ? { effort, format: { type: "json_schema", schema } } : { effort },
        ...(tools ? { tools } : {}),
        system: PROMPTS[role],
        messages
      });
      if (response.stop_reason !== "pause_turn") break;
      messages.splice(1, messages.length - 1, { role: "assistant", content: response.content });
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AgentTeamError("A chave ANTHROPIC_API_KEY é inválida.");
    if (err instanceof Anthropic.RateLimitError) throw new AgentTeamError("Muitos pedidos ao mesmo tempo. Tente de novo em 1 minuto.");
    if (err instanceof Anthropic.APIError) throw new AgentTeamError(`O serviço de IA respondeu com erro (${err.status}). Tente de novo.`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new AgentTeamError("A IA não aceitou este pedido. Ajuste a orientação e tente de novo.");
  if (response.stop_reason === "max_tokens") throw new AgentTeamError("A resposta ficou longa demais. Peça menos posts.");
  console.log("agente", role, response.usage);

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!schema) return { text, content: response.content };
  try {
    return JSON.parse(text);
  } catch {
    throw new AgentTeamError("A IA devolveu uma resposta fora do formato. Tente de novo.");
  }
}

// ---------- papéis ----------

export async function research({ cliente, periodo }) {
  const country = cliente.idioma_dos_posts === "en-US" ? "US" : "BR";
  const { text, content } = await ask(
    "pesquisa",
    { periodo, cliente },
    {
      effort: "medium",
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 6, user_location: { type: "approximate", country } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 }
      ]
    }
  );
  const fontes = [];
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      block.content.forEach((r) => r.url && fontes.push({ titulo: r.title || r.url, url: r.url }));
    }
  }
  const seen = new Set();
  return { texto: text.trim(), fontes: fontes.filter((f) => !seen.has(f.url) && seen.add(f.url)).slice(0, 15) };
}

export function strategist(input) {
  return ask("estrategista", input, { effort: "medium" });
}
export function strategistMonth(input) {
  return ask("estrategista_mes", input, { effort: "medium" });
}
export function copywriter(input) {
  return ask("redator", input, { effort: "medium" });
}
export function artDirector(input) {
  return ask("diretor_de_arte", input, { effort: "medium" });
}
export function designer(input) {
  return ask("designer", input, { effort: "medium" });
}
export function reviewer(input) {
  return ask("revisor", input, { effort: "high" });
}
export function reviewerMonth(input) {
  return ask("revisor_mes", input, { effort: "high" });
}
