import { clientOrganicReport } from "../../../../lib/metaOrganic";
import { clientAccess, metaFailure, periodFromQuery } from "../../../../lib/metaRoute";

// Insights orgânicos do Instagram de um cliente (somente leitura), para a área "Insights orgânicos".
// GET /api/meta/organic?clientId=<uuid>&datePreset=last_7d|this_month|last_30d
// GET /api/meta/organic?clientId=<uuid>&since=AAAA-MM-DD&until=AAAA-MM-DD
// Acesso: equipe (qualquer cliente) ou o próprio cliente (só o dele).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const { client, response } = await clientAccess(request, q.get("clientId") || "");
  if (response) return response;
  try {
    const report = await clientOrganicReport(client, periodFromQuery(q));
    return Response.json({ ok: true, cliente: client.name, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return metaFailure(err, "meta organico");
  }
}
