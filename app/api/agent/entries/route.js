import { agentAuthorized, agentDb, unauthorized } from "../../../../lib/agentApi";
import { cleanAgentEntries } from "../../../../lib/agentContext";

// O agente de conteúdo grava os temas que criou no Conteúdo da semana do cliente.
// Os temas entram como "sugerido pelo agente" e com briefing em rascunho, para a equipe revisar.
//
// POST /api/agent/entries
// { "client_id": "<id>", "entries": [ { "day": "2026-10-19", "format": "Reels", "theme": "…",
//   "post_time": "19h", "notes": "…", "refs": ["https://…"], "brief": { …campos do briefing… } } ] }

export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const list = Array.isArray(body.entries) ? body.entries : [];
  if (!body.client_id) return Response.json({ error: "informe client_id" }, { status: 400 });
  if (list.length === 0 || list.length > 40) return Response.json({ error: "envie de 1 a 40 temas em entries" }, { status: 400 });

  const db = agentDb();
  const { data: client } = await db.from("clients").select("id, name").eq("id", body.client_id).maybeSingle();
  if (!client) return Response.json({ error: "cliente não encontrado" }, { status: 404 });

  const { rows, errors } = cleanAgentEntries(client.id, list);
  if (errors.length) return Response.json({ error: "temas inválidos", detalhes: errors }, { status: 400 });

  const { data, error } = await db.from("calendar_entries").insert(rows).select("id, day, format, theme");
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao gravar os temas" }, { status: 500 });
  }
  return Response.json({ ok: true, cliente: client.name, criados: data });
}
