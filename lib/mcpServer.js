import { agentDb, normalizeName } from "./agentApi";
import { clientContext, cleanAgentEntries, findClients } from "./agentContext";
import { addDays, iso, mondayOf, parse } from "./deadlines";
import { CALENDAR_FORMATS } from "./pipeline";
import { PLACEMENTS, PRIORITIES, REQUEST_TYPES } from "./brief";

// Servidor MCP (Model Context Protocol) do Up! Fluxo, no formato "Streamable HTTP" sem sessão:
// cada POST traz uma mensagem JSON-RPC e recebe a resposta em JSON.
// Assim o app do Claude consegue consultar clientes e gravar temas no Conteúdo da semana.

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = `Up! Fluxo é o sistema de produção de conteúdo da Up! Digital.
Para "crie o conteúdo da semana de <cliente>": 1) consultar_cliente com o nome; por padrão use "semana_para_criar_agora" (2 semanas de antecedência); 2) veja os temas que o calendário mensal já tem nessa semana com ver_temas_da_semana; 3) se houver temas, DESENVOLVA esses temas (briefing e texto da peça) com desenvolver_temas, sem trocar o assunto; só crie posts novos com gravar_temas se faltar; 4) use o perfil (posicionamento, identidade visual, observações), as datas especiais e os temas recentes; 5) mostre a proposta ao usuário e grave só com o ok dele. Nunca invente fatos do cliente (preços, promoções); use [confirmar com o cliente]. Nunca use travessão (—) nos textos: use vírgula, dois-pontos ou ponto; para separar partes de um título, use " | " (ex.: "Educativo | Conexão | Ideia").`;

const briefSchema = {
  type: "object",
  description: "Briefing para o design (todos os campos opcionais)",
  properties: {
    request_type: { type: "string", enum: REQUEST_TYPES },
    priority: { type: "string", enum: PRIORITIES.map((p) => p.id) },
    placements: { type: "array", items: { type: "string", enum: PLACEMENTS } },
    must_have: { type: "string", description: "Não pode faltar nesta peça (um item por linha)" },
    important_notes: { type: "string", description: "Observações importantes para o designer" },
    piece_text: { type: "string", description: "Título + texto da peça (carrossel: por página)" },
    refs_note: { type: "string", description: "Que referências buscar" }
  }
};

const TOOLS = [
  {
    name: "listar_clientes",
    description: "Lista todos os clientes da Up! Digital (id e nome).",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "consultar_cliente",
    description:
      "Busca um cliente pelo nome (aceita sem acento ou pedaço do nome, ex.: '7ball') ou pelo id e devolve o perfil completo: posicionamento, identidade visual, observações importantes, link do Drive, equipe, as próximas semanas com prazos, datas comemorativas e temas já planejados, e os temas recentes.",
    inputSchema: {
      type: "object",
      properties: { nome: { type: "string" }, id: { type: "string" } }
    }
  },
  {
    name: "ver_temas_da_semana",
    description: "Mostra os temas já gravados de um cliente numa semana (segunda a domingo), com o briefing de cada um.",
    inputSchema: {
      type: "object",
      required: ["client_id", "inicio"],
      properties: { client_id: { type: "string" }, inicio: { type: "string", description: "Qualquer dia da semana, AAAA-MM-DD" } }
    }
  },
  {
    name: "desenvolver_temas",
    description:
      "Completa temas que já estão no calendário (pelo id, de ver_temas_da_semana): briefing para o design, texto da peça e, se estiverem vazios, formato, horário e observação. Não muda o dia. Temas com briefing pronto ou enviado ao design não são alterados.",
    inputSchema: {
      type: "object",
      required: ["temas"],
      properties: {
        temas: {
          type: "array",
          items: {
            type: "object",
            required: ["id"],
            properties: {
              id: { type: "string" },
              theme: { type: "string", description: "Redação refinada do tema (mesmo assunto)" },
              format: { type: "string", enum: CALENDAR_FORMATS },
              post_time: { type: "string" },
              notes: { type: "string" },
              editorial_line: { type: "string" },
              brief: briefSchema
            }
          }
        }
      }
    }
  },
  {
    name: "gravar_temas",
    description:
      "Grava temas no Conteúdo da semana do cliente. Entram marcados como 'Conteúdo criado', com briefing em rascunho, para a equipe revisar. Confirme com o usuário antes de gravar.",
    inputSchema: {
      type: "object",
      required: ["client_id", "temas"],
      properties: {
        client_id: { type: "string" },
        temas: {
          type: "array",
          items: {
            type: "object",
            required: ["day", "theme"],
            properties: {
              day: { type: "string", description: "AAAA-MM-DD" },
              format: { type: "string", enum: CALENDAR_FORMATS },
              theme: { type: "string" },
              post_time: { type: "string" },
              notes: { type: "string" },
              editorial_line: { type: "string", description: "Linha editorial em 1 a 3 palavras (ex.: Educativo), nunca a etapa do funil" },
              refs: { type: "array", items: { type: "string" } },
              brief: briefSchema
            }
          }
        }
      }
    }
  }
];

function text(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}
function toolError(message) {
  return { ...text(message), isError: true };
}

async function callTool(name, args = {}) {
  const db = agentDb();

  if (name === "listar_clientes") {
    const { data } = await db.from("clients").select("id, name").order("name");
    return text((data || []).map((c) => ({ id: c.id, nome: c.name })));
  }

  if (name === "consultar_cliente") {
    const { data: clients } = await db.from("clients").select("*").order("name");
    const matches = findClients(clients || [], { id: args.id, q: args.nome }, normalizeName);
    if (matches.length === 0) return toolError("Cliente não encontrado. Use listar_clientes para ver os nomes.");
    if (matches.length > 1) return text({ aviso: "Mais de um cliente encontrado; repita com o id.", clientes: matches.map((c) => ({ id: c.id, nome: c.name })) });
    return text(await clientContext(db, matches[0]));
  }

  if (name === "ver_temas_da_semana") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.inicio || "")) return toolError("inicio deve ser AAAA-MM-DD.");
    const monday = mondayOf(parse(args.inicio));
    const { data } = await db
      .from("calendar_entries")
      .select("id, day, format, theme, post_time, notes, brief, brief_status, created_by_agent")
      .eq("client_id", args.client_id)
      .gte("day", iso(monday))
      .lte("day", iso(addDays(monday, 6)))
      .order("day");
    return text({ semana: { inicio: iso(monday), fim: iso(addDays(monday, 6)) }, temas: data || [] });
  }

  if (name === "desenvolver_temas") {
    const list = Array.isArray(args.temas) ? args.temas.slice(0, 40) : [];
    if (!list.length) return toolError("Envie os temas com id.");
    const { data: originals } = await db.from("calendar_entries").select("*").in("id", list.map((t) => t.id));
    const byId = Object.fromEntries((originals || []).map((o) => [o.id, o]));
    const done = [];
    const skipped = [];
    for (const t of list) {
      const o = byId[t.id];
      if (!o) {
        skipped.push({ id: t.id, motivo: "não encontrado" });
        continue;
      }
      if (o.brief_status && o.brief_status !== "rascunho") {
        skipped.push({ id: t.id, motivo: "briefing já " + o.brief_status });
        continue;
      }
      const merged = {
        day: o.day,
        theme: t.theme || o.theme,
        format: o.format || t.format,
        post_time: o.post_time || t.post_time,
        notes: o.notes || t.notes,
        editorial_line: o.editorial_line || t.editorial_line,
        brief: { ...(o.brief || {}), ...(t.brief || {}) }
      };
      const { rows } = cleanAgentEntries(o.client_id, [merged]);
      if (!rows.length) {
        skipped.push({ id: t.id, motivo: "dados inválidos" });
        continue;
      }
      const { client_id, day, refs, use_client_identity, ...patch } = rows[0];
      const { data } = await db.from("calendar_entries").update(patch).eq("id", o.id).select("id, day, format, theme").maybeSingle();
      if (data) done.push(data);
    }
    return text({ ok: true, desenvolvidos: done, ignorados: skipped });
  }

  if (name === "gravar_temas") {
    const { data: client } = await db.from("clients").select("id, name").eq("id", args.client_id || "").maybeSingle();
    if (!client) return toolError("Cliente não encontrado (client_id inválido).");
    const list = Array.isArray(args.temas) ? args.temas : [];
    if (list.length === 0 || list.length > 40) return toolError("Envie de 1 a 40 temas.");
    const { rows, errors } = cleanAgentEntries(client.id, list);
    if (errors.length) return toolError("Temas inválidos: " + errors.join("; "));
    const { data, error } = await db.from("calendar_entries").insert(rows).select("id, day, format, theme");
    if (error) {
      console.error(error);
      return toolError("Falha ao gravar os temas.");
    }
    return text({ ok: true, cliente: client.name, criados: data, aviso: "Temas gravados como 'Conteúdo criado' no Conteúdo da semana do Up! Fluxo." });
  }

  return toolError("Ferramenta desconhecida: " + name);
}

// Processa uma mensagem JSON-RPC. Devolve o objeto de resposta, ou null para notificações.
export async function handleMcpMessage(msg) {
  const isNotification = msg && msg.id === undefined;
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: msg?.id ?? null, error: { code, message } });

  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "Requisição inválida");
  if (isNotification) return null; // ex.: notifications/initialized

  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "up-fluxo", version: "1.0.0" },
        instructions: INSTRUCTIONS
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call":
      try {
        return reply(await callTool(msg.params?.name, msg.params?.arguments || {}));
      } catch (err) {
        console.error(err);
        return reply(toolError("Erro interno ao executar a ferramenta."));
      }
    default:
      return fail(-32601, "Método não suportado: " + msg.method);
  }
}
