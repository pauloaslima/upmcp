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
