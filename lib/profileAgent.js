import Anthropic from "@anthropic-ai/sdk";
import { PROFILE_FIELDS } from "./profileFields";
import { ContentAgentError } from "./contentAgent";

// Lê os materiais do cliente (brandbook, setup estratégico, posts de exemplo, linhas editoriais…)
// e sugere o conteúdo de cada campo do Perfil do cliente. Nada é salvo aqui: a equipe revisa e confirma.

const MODEL = "claude-opus-5-5";

const SYSTEM = `Você é estrategista de marca da Up! Digital, agência de marketing em Vitória (ES).
Você recebe os materiais de um cliente (manual de marca, setup estratégico, posts de exemplo, linhas editoriais, planilhas) e o perfil que já existe no sistema.
Sua tarefa: escrever o conteúdo de cada campo do Perfil do cliente, para a equipe e para os agentes que criam posts e briefings de arte.

Regras:
- Use somente o que está nos materiais e no perfil atual. Não invente cores, fontes, números, público ou promessas.
- Quando os materiais não cobrem um campo, mantenha o texto atual daquele campo; se o campo atual também estiver vazio, devolva texto vazio e cite o campo em "lacunas".
- Junte o que já existe no perfil com o que os materiais trazem, sem perder informação útil do perfil atual; se houver conflito, prefira o material mais específico e cite o conflito em "lacunas".
- Escreva em português do Brasil, em tópicos curtos e objetivos (use "- " no começo de cada linha), prontos para consulta rápida.
- Cores sempre com o código (ex.: #1B2A4A) quando o material trouxer.
- Em "referências para as artes", descreva o que os posts de exemplo têm em comum e deve ser repetido nas artes.
- "fontes": para cada campo preenchido, diga de quais arquivos veio a informação.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["campos", "fontes", "lacunas", "resumo"],
  properties: {
    campos: {
      type: "object",
      additionalProperties: false,
      required: PROFILE_FIELDS.map((f) => f.key),
      properties: Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, { type: "string", description: f.ai }]))
    },
    fontes: {
      type: "object",
      additionalProperties: false,
      required: PROFILE_FIELDS.map((f) => f.key),
      properties: Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, { type: "string" }]))
    },
    lacunas: { type: "array", items: { type: "string" } },
    resumo: { type: "string" }
  }
};

export async function suggestProfile({ client, blocks }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new ContentAgentError("Falta configurar ANTHROPIC_API_KEY no Vercel.");
  const atual = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, client[f.key] || ""]));
  const guia = PROFILE_FIELDS.map((f) => `- ${f.key} (${f.label}): ${f.ai}`).join("\n");

  const anthropic = new Anthropic();
  let response;
  try {
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...blocks,
            {
              type: "text",
              text: `Cliente: ${client.name}\n\nCampos a preencher:\n${guia}\n\nPerfil atual no sistema:\n${JSON.stringify(atual, null, 2)}`
            }
          ]
        }
      ]
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ContentAgentError("A chave ANTHROPIC_API_KEY é inválida.");
    if (err instanceof Anthropic.RateLimitError) throw new ContentAgentError("Muitos pedidos ao mesmo tempo. Tente de novo em 1 minuto.");
    if (err instanceof Anthropic.BadRequestError) throw new ContentAgentError("Não consegui ler algum material (arquivo grande demais ou corrompido). Tire o maior arquivo e tente de novo.");
    if (err instanceof Anthropic.APIError) throw new ContentAgentError(`O serviço de geração respondeu com erro (${err.status}). Tente de novo.`);
    throw err;
  }
  if (response.stop_reason === "refusal") throw new ContentAgentError("Não foi possível analisar estes materiais.");
  if (response.stop_reason === "max_tokens") throw new ContentAgentError("A resposta ficou longa demais. Tente com menos materiais.");

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ContentAgentError("A resposta veio fora do formato. Tente de novo.");
  }
  console.log("agente perfil", { cliente: client.name, uso: response.usage });
  return data;
}
