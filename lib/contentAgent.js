import Anthropic from "@anthropic-ai/sdk";
import { CALENDAR_FORMATS } from "./pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "./brief";

// Agente de conteúdo (Claude). Dois trabalhos:
//  - generateWeek: desenvolve os temas que o calendário mensal já tem para a semana
//    (briefing, texto da peça) e cria posts novos só se faltar;
//  - generateMonth: monta o calendário de temas do mês a partir de uma estratégia
//    (meses anteriores, texto ou áudio transcrito).
// Precisa de ANTHROPIC_API_KEY configurada no Vercel.

const MODEL = "claude-opus-5-5";

const BASE = `Você é estrategista de conteúdo da Up! Digital, agência de marketing em Vitória (ES) que cuida das redes sociais dos clientes.

Regras gerais:
- Baseie-se no perfil do cliente: posicionamento (público, diferenciais, tom de voz), identidade visual e observações importantes. Respeite tudo o que as observações pedem para evitar.
- Use datas comemorativas e campanhas do mês apenas quando fizerem sentido para o negócio do cliente; não force datas sem relação.
- Não repita assuntos dos temas recentes. Varie formatos e objetivos (educativo, conexão, autoridade, venda, bastidores, prova social).
- Horários: os comuns para o público do cliente (ex.: 09h, 12h, 19h).
- Nunca invente fatos do cliente (preços, promoções, prêmios, números). Quando precisar de um dado que você não tem, escreva [confirmar com o cliente].
- Escreva em português do Brasil, no tom de voz do cliente.
- theme: linha curta no padrão da agência, "Objetivo — Pilar — Ideia" (ex.: "Educativo — Conexão — Liderança forte começa dentro de casa").
- notes: uma frase para a equipe explicando por que esse post nessa data.`;

const WEEK_SYSTEM = `${BASE}

Sua tarefa agora: preparar os posts de UMA semana de publicação.
1. Primeiro olhe "temas_do_calendario": são os temas que a equipe já planejou no calendário mensal para esta semana. Cada um tem um id.
   Desenvolva TODOS eles em "desenvolvidos" (mesmo id): mantenha a ideia e o dia do tema; pode refinar a redação do theme, sugerir formato e horário se estiverem vazios, e preencha o briefing completo. Não troque o assunto de um tema planejado.
2. Só crie posts em "novos" se a quantidade pedida for maior que o número de temas do calendário, ou se não houver nenhum tema planejado. Posts novos vão em dias que ainda não têm tema.

Briefing (brief) de cada post:
- piece_text: o texto que vai na arte (título + texto; carrossel por página: "Página 1: … / Página 2: …"; Reels: frases ou roteiro curto).
- must_have: um item por linha (ex.: logo no rodapé, legenda, CTA).
- important_notes: orientações ao designer ou editor de vídeo (criativo, takes, música, estilo), coerentes com a identidade visual.
- refs_note: que tipo de referência buscar (sem inventar links).
- request_type, priority e placements: escolha entre as opções; prioridade "alta" só para datas fortes ou campanhas.
- resumo: 2 a 3 frases para a equipe sobre a linha da semana.`;

const MONTH_SYSTEM = `${BASE}

Sua tarefa agora: montar o CALENDÁRIO DE TEMAS de um mês inteiro (só os temas; o briefing de cada post é feito depois, semana a semana).
- Siga a estratégia do mês informada em "estrategia". Quando a fonte for "historico", deduza a estratégia dos meses anteriores: frequência de posts por semana, dias e horários preferidos, mistura de formatos e pilares; mantenha o que funciona e traga assuntos novos.
- Quantidade: use "posts_por_semana" quando informado; senão, a frequência habitual do histórico; sem histórico, 3 por semana.
- Distribua os posts pelas semanas do mês de forma equilibrada, em dias diferentes, só dentro do mês pedido.
- "temas_ja_no_calendario" já existem: não crie outro post no mesmo dia nem repita esses assuntos; complete o mês em volta deles.
- Encaixe as datas comemorativas e campanhas relevantes para o cliente no dia certo (ou na véspera, quando fizer mais sentido).
- resumo: 3 a 4 frases para a equipe explicando a estratégia do mês.`;

const briefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["request_type", "priority", "placements", "must_have", "important_notes", "piece_text", "refs_note"],
  properties: {
    request_type: { type: "string", enum: REQUEST_TYPES },
    priority: { type: "string", enum: PRIORITIES.map((p) => p.id) },
    placements: { type: "array", items: { type: "string", enum: PLACEMENTS } },
    must_have: { type: "string" },
    important_notes: { type: "string" },
    piece_text: { type: "string" },
    refs_note: { type: "string" }
  }
};

const postFields = {
  day: { type: "string", description: "AAAA-MM-DD" },
  format: { type: "string", enum: CALENDAR_FORMATS },
  theme: { type: "string" },
  post_time: { type: "string" },
  notes: { type: "string" }
};

const weekSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "desenvolvidos", "novos"],
  properties: {
    resumo: { type: "string" },
    desenvolvidos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "theme", "format", "post_time", "notes", "brief"],
        properties: { id: { type: "string" }, theme: postFields.theme, format: postFields.format, post_time: postFields.post_time, notes: postFields.notes, brief: briefSchema }
      }
    },
    novos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "format", "theme", "post_time", "notes", "brief"],
        properties: { ...postFields, brief: briefSchema }
      }
    }
  }
};

const monthSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "temas"],
  properties: {
    resumo: { type: "string" },
    temas: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["day", "format", "theme", "post_time", "notes"], properties: postFields }
    }
  }
};

export class ContentAgentError extends Error {}

async function ask(system, payload, schema) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContentAgentError("Falta configurar ANTHROPIC_API_KEY no Vercel.");
  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // se o modelo recusar por engano, outro modelo assume no mesmo pedido
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }]
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ContentAgentError("A chave ANTHROPIC_API_KEY é inválida.");
    if (err instanceof Anthropic.RateLimitError) throw new ContentAgentError("Muitos pedidos ao mesmo tempo. Tente de novo em 1 minuto.");
    if (err instanceof Anthropic.APIError) throw new ContentAgentError(`O serviço de IA respondeu com erro (${err.status}). Tente de novo.`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ContentAgentError("A IA não aceitou este pedido. Ajuste a orientação e tente de novo.");
  if (response.stop_reason === "max_tokens") throw new ContentAgentError("A resposta ficou longa demais. Peça menos posts.");

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    return { data: JSON.parse(text), usage: response.usage };
  } catch {
    throw new ContentAgentError("A IA devolveu uma resposta fora do formato. Tente de novo.");
  }
}

function profileOnly(context) {
  const { semanas, semana_para_criar_agora, ...perfil } = context;
  return perfil;
}

// planned: temas do calendário nesta semana [{ id, day, format, theme, post_time, notes, brief }]
export async function generateWeek({ context, week, planned, guidance, count }) {
  const { data, usage } = await ask(
    WEEK_SYSTEM,
    {
      semana_de_publicacao: { ...week, temas_ja_planejados: undefined },
      temas_do_calendario: planned,
      quantidade_de_posts:
        count || (planned.length ? `os ${planned.length} temas do calendário (não crie novos)` : "frequência habitual do cliente (veja os temas recentes); sem histórico, 3 posts"),
      orientacao_da_equipe: guidance?.trim() || "nenhuma",
      cliente: profileOnly(context)
    },
    weekSchema
  );
  const ids = new Set(planned.map((p) => p.id));
  const busyDays = new Set(planned.map((p) => p.day));
  const desenvolvidos = (data.desenvolvidos || []).filter((d) => ids.has(d.id));
  const novos = (data.novos || []).filter((t) => t.day >= week.inicio && t.day <= week.fim && !busyDays.has(t.day));
  console.log("agente semana", { cliente: context.nome, semana: week.inicio, desenvolvidos: desenvolvidos.length, novos: novos.length, uso: usage });
  return { resumo: data.resumo || "", desenvolvidos, novos };
}

// month: { inicio, fim, nome, datas_especiais, campanhas, prazo_do_calendario }
// source: "historico" | "texto" | "audio"
export async function generateMonth({ context, month, source, strategy, history, existing, postsPerWeek }) {
  const { data, usage } = await ask(
    MONTH_SYSTEM,
    {
      mes: month,
      estrategia: {
        fonte: source,
        texto: source === "historico" ? "deduza dos meses anteriores" : strategy,
        observacao: source === "audio" ? "texto transcrito de um áudio; pode ter erros de transcrição" : undefined
      },
      posts_por_semana: postsPerWeek || null,
      meses_anteriores: history,
      temas_ja_no_calendario: existing,
      cliente: profileOnly(context)
    },
    monthSchema
  );
  const busy = new Set(existing.map((e) => e.day));
  const temas = (data.temas || []).filter((t) => t.day >= month.inicio && t.day <= month.fim && !busy.has(t.day));
  console.log("agente mês", { cliente: context.nome, mes: month.inicio, temas: temas.length, uso: usage });
  return { resumo: data.resumo || "", temas };
}
