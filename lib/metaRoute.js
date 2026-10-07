import { agentAuthorized, agentDb } from "./agentApi";
import { MetaError, redact } from "./meta";

// Base das rotas /api/meta/* (somente leitura).
// Quem pode usar: equipe logada (administrador ou funcionário, com o token de sessão do Supabase)
// ou chamadas de servidor com "Authorization: Bearer <AGENT_API_KEY>".

async function isAllowed(request) {
  if (agentAuthorized(request)) return true;
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const db = agentDb();
  const { data: auth } = await db.auth.getUser(token);
  if (!auth?.user) return false;
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  return ["admin", "funcionario"].includes(me?.role);
}

// Envolve a consulta: confere o acesso e devolve erros sem nunca expor o token.
export async function metaRoute(request, run) {
  if (!(await isAllowed(request))) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const result = await run(new URL(request.url).searchParams);
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MetaError) return Response.json(err.toJSON(), { status: err.status });
    console.error("meta: erro inesperado", redact(err?.stack || err?.message));
    return Response.json({ error: "Erro inesperado ao consultar a Meta." }, { status: 500 });
  }
}

// Áreas de um cliente (Anúncios, Insights orgânicos): equipe vê qualquer cliente; o cliente, só o dele.
// Devolve { client } ou { response } com o erro pronto para a rota.
export async function clientAccess(request, clientId) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return { response: Response.json({ error: "Entre no sistema de novo." }, { status: 401 }) };
  const { data: me } = await db.from("profiles").select("role, client_id").eq("id", auth.user.id).maybeSingle();
  const isStaff = ["admin", "funcionario"].includes(me?.role);
  if (!isStaff && !(me?.role === "cliente" && me.client_id && me.client_id === clientId)) {
    return { response: Response.json({ error: "Você não tem acesso a este cliente." }, { status: 403 }) };
  }
  const { data: client } = clientId ? await db.from("clients").select("id, name").eq("id", clientId).maybeSingle() : { data: null };
  if (!client) return { response: Response.json({ error: "Cliente não encontrado." }, { status: 404 }) };
  return { client };
}

// Período vindo da tela: ?datePreset=last_7d ou ?since=AAAA-MM-DD&until=AAAA-MM-DD
export function periodFromQuery(q) {
  return q.get("since") || q.get("until") ? { since: q.get("since"), until: q.get("until") } : { datePreset: q.get("datePreset") || "last_30d" };
}

export function metaFailure(err, label) {
  if (err instanceof MetaError) return Response.json({ error: err.message }, { status: err.status });
  console.error(label + ": erro inesperado", redact(err?.stack || err?.message));
  return Response.json({ error: "Erro inesperado ao consultar a Meta." }, { status: 500 });
}
