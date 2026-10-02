import { agentDb } from "../../../lib/agentApi";
import { ContentAgentError } from "../../../lib/contentAgent";
import { materialsToBlocks } from "../../../lib/materials";
import { suggestProfile } from "../../../lib/profileAgent";

// "✨ Preencher automaticamente" no Perfil do cliente: lê os materiais e devolve sugestões
// para cada campo. Não salva nada — a equipe escolhe o que aceitar e confirma.
// POST { client_id }

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });
  const { data: me } = await db.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "funcionario"].includes(me?.role)) return Response.json({ error: "Só a equipe pode usar o agente." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { data: client } = body.client_id ? await db.from("clients").select("*").eq("id", body.client_id).maybeSingle() : { data: null };
  if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  const materials = [...(client.materials || []), ...(client.identity_files || []).map((f) => ({ ...f, category: "identidade" }))];
  if (!materials.length) return Response.json({ error: "Envie os materiais do cliente antes (em Editar → Materiais do cliente)." }, { status: 400 });

  const { blocks, used, skipped } = await materialsToBlocks(db, materials);
  if (!used.length) return Response.json({ error: "Não consegui ler nenhum material.", ignorados: skipped }, { status: 400 });

  try {
    const result = await suggestProfile({ client, blocks });
    return Response.json({ ok: true, ...result, lidos: used, ignorados: skipped });
  } catch (err) {
    if (err instanceof ContentAgentError) return Response.json({ error: err.message, ignorados: skipped }, { status: 502 });
    console.error(err);
    return Response.json({ error: "Não consegui gerar agora. Tente de novo em instantes." }, { status: 502 });
  }
}
