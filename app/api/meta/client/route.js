import { agentDb } from "../../../../lib/agentApi";
import { MetaError, redact } from "../../../../lib/meta";
import { clientAdsReport } from "../../../../lib/metaClient";

// Anúncios de um cliente (somente leitura), para a área "Anúncios" do cliente.
// GET /api/meta/client?clientId=<uuid>&datePreset=last_7d|this_month|last_30d
// GET /api/meta/client?clientId=<uuid>&since=AAAA-MM-DD&until=AAAA-MM-DD
// Acesso: equipe (qualquer cliente) ou o próprio cliente (só o dele).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const db = agentDb();
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  if (!auth?.user) return Response.json({ error: "Entre no sistema de novo." }, { status: 401 });

  const q = new URL(request.url).searchParams;
  const clientId = q.get("clientId") || "";
  const { data: me } = await db.from("profiles").select("role, client_id").eq("id", auth.user.id).maybeSingle();
  const isStaff = ["admin", "funcionario"].includes(me?.role);
  if (!isStaff && !(me?.role === "cliente" && me.client_id && me.client_id === clientId)) {
    return Response.json({ error: "Você não tem acesso a este cliente." }, { status: 403 });
  }

  const { data: client } = clientId ? await db.from("clients").select("id, name").eq("id", clientId).maybeSingle() : { data: null };
  if (!client) return Response.json({ error: "Cliente não encontrado." }, { status: 404 });

  const period = q.get("since") || q.get("until") ? { since: q.get("since"), until: q.get("until") } : { datePreset: q.get("datePreset") || "last_30d" };
  try {
    const report = await clientAdsReport(client, period);
    return Response.json({ ok: true, cliente: client.name, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MetaError) return Response.json({ error: err.message }, { status: err.status });
    console.error("meta cliente: erro inesperado", redact(err?.stack || err?.message));
    return Response.json({ error: "Erro inesperado ao consultar a Meta." }, { status: 500 });
  }
}
