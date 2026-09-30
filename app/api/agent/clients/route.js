import { agentAuthorized, agentDb, normalizeName, unauthorized } from "../../../../lib/agentApi";
import { clientContext, findClients } from "../../../../lib/agentContext";

// Consulta de clientes para os agentes.
//
// GET /api/agent/clients              → lista { id, nome } de todos os clientes
// GET /api/agent/clients?q=7ball      → procura pelo nome (sem acento/maiúscula); 1 resultado = perfil completo
// GET /api/agent/clients?id=<id>      → perfil completo
//
// Perfil completo: posicionamento, identidade visual (texto + arquivos), observações importantes,
// link do Drive, responsável e equipe, próximas semanas (prazos, datas comemorativas, temas já
// planejados) e temas recentes para não repetir assunto.

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!agentAuthorized(request)) return unauthorized();
  const db = agentDb();
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const q = params.get("q");

  const { data: clients, error } = await db.from("clients").select("*").order("name");
  if (error) {
    console.error(error);
    return Response.json({ error: "falha ao ler clientes" }, { status: 500 });
  }
  const list = clients.map((c) => ({ id: c.id, nome: c.name }));
  if (!id && !q) return Response.json({ clientes: list });

  const matches = findClients(clients, { id, q }, normalizeName);
  if (matches.length === 0) return Response.json({ error: "cliente não encontrado", clientes: list }, { status: 404 });
  if (matches.length > 1) {
    return Response.json({ aviso: "mais de um cliente encontrado; repita com ?id=", clientes: matches.map((c) => ({ id: c.id, nome: c.name })) });
  }
  return Response.json(await clientContext(db, matches[0]));
}
