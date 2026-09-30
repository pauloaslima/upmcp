import Anthropic from "@anthropic-ai/sdk";
import { CALENDAR_FORMATS } from "./pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "./brief";

// Agente de conteúdo: cria os temas de uma semana de publicação de um cliente,
// já com o briefing para o design, a partir do perfil do cliente e do calendário.
// Precisa de ANTHROPIC_API_KEY configurada no Vercel.

const MODEL = "claude-opus-5-5";

// Instruções fixas (não mudam entre pedidos, então o início do pedido pode ser reaproveitado em cache)
const SYSTEM = `Você é estrategista de conteúdo da Up! Digital, agência de marketing em Vitória (ES) que cuida das redes sociais dos clientes.
Sua tarefa: planejar os posts de UMA semana de publicação de um cliente, com tema e briefing para o design de cada post.

Como trabalhar:
- Baseie-se no perfil do cliente: posicionamento (público, diferenciais, tom de voz), identidade visual e observações importantes. Respeite tudo o que as observações pedem para evitar.
- Use datas comemorativas e campanhas do mês apenas quando fizerem sentido para o negócio do cliente; não force datas sem relação.
- Não repita assuntos dos temas recentes nem dos já planejados na semana. Varie formatos e objetivos (educativo, conexão, autoridade, venda, bastidores, prova social).
- Distribua os posts em dias diferentes da semana. Se um dia já tem tema planejado, não crie outro nesse dia, a menos que a orientação peça.
- Horários: sugira os comuns para o público do cliente (ex.: 09h, 12h, 19h).
- Nunca invente fatos do cliente (preços, promoções, prêmios, números). Quando o texto precisar de um dado que você não tem, escreva [confirmar com o cliente].
- Escreva em português do Brasil, no tom de voz do cliente.

Campos de cada post:
- theme: linha curta no padrão da agência, "Objetivo — Pilar — Ideia" (ex.: "Educativo — Conexão — Liderança forte começa dentro de casa").
- notes: uma frase explicando para a equipe por que esse post nessa data.
- brief.piece_text: o texto que vai na arte (título + texto; em carrossel, separe por página: "Página 1: … / Página 2: …"; em Reels, as frases ou o roteiro curto).
- brief.must_have: um item por linha (ex.: logo no rodapé, legenda, CTA).
- brief.important_notes: orientações para o designer ou editor de vídeo (criativo, takes, música, estilo), coerentes com a identidade visual.
- brief.refs_note: que tipo de referência o designer deve buscar (sem inventar links).
- brief.request_type, brief.priority e brief.placements: escolha entre as opções permitidas; prioridade "alta" só para datas fortes ou campanhas.
- resumo: 2 a 3 frases para a equipe sobre a linha da semana.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "temas"],
  properties: {
    resumo: { type: "string" },
    temas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "format", "theme", "post_time", "notes", "brief"],
        properties: {
          day: { type: "string", description: "AAAA-MM-DD, dentro da semana pedida" },
          format: { type: "string", enum: CALENDAR_FORMATS },
          theme: { type: "string" },
          post_time: { type: "string" },
          notes: { type: "string" },
          brief: {
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
          }
        }
      }
    }
  }
};

export class ContentAgentError extends Error {}

// context: resultado de clientContext(); week: resultado de weekInfo(); guidance: texto livre; count: nº de posts (ou null)
export async function generateWeek({ context, week, guidance, count }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContentAgentError("Falta configurar ANTHROPIC_API_KEY no Vercel.");

  const { semanas, semana_para_criar_agora, ...perfil } = context;
  const pedido = {
    semana_de_publicacao: week,
    quantidade_de_posts: count || "decida pela frequência habitual do cliente (veja os temas recentes); se não houver histórico, 3 posts",
    orientacao_da_equipe: guidance?.trim() || "nenhuma",
    cliente: perfil
  };

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
      system: SYSTEM,
      messages: [{ role: "user", content: "Planeje a semana abaixo.\n\n" + JSON.stringify(pedido, null, 2) }]
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
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ContentAgentError("A IA devolveu uma resposta fora do formato. Tente de novo.");
  }

  // só aceita dias dentro da semana pedida
  const temas = (data.temas || []).filter((t) => t.day >= week.inicio && t.day <= week.fim);
  console.log("agente de conteúdo", { cliente: context.nome, semana: week.inicio, temas: temas.length, uso: response.usage });
  return { resumo: data.resumo || "", temas };
}
